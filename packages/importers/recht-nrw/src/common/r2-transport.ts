/**
 * Transporte zum R2-Quellenarchiv `landesrecht-quellen`.
 *
 *  - `createMemoryR2Transport`: Fake für Tests und Offline-Simulationen (keine Netzverbindung)
 *  - `createS3R2Transport`: S3-kompatible R2-API mit AWS-Signatur V4 (node:crypto, keine Abhängigkeit);
 *    Zugangsdaten nur aus der Umgebung (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`),
 *    nie aus dem Repository
 *  - `createWranglerR2Transport`: `wrangler r2 object put/get --remote` als Alternative ohne API-Schlüssel
 *
 * Der Transport kennt keine Fachlogik; Unveränderlichkeit und Rückleseprüfung stehen in `archive.ts`.
 */
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export interface R2ObjectHead {
  size: number;
  /** SHA-256 aus den Objektmetadaten (`sha256`), sofern gesetzt. */
  sha256?: string;
  contentType?: string;
}

export interface R2PutOptions {
  contentType: string;
  metadata: Record<string, string>;
}

export interface R2Transport {
  readonly name: string;
  readonly bucket: string;
  head(key: string): Promise<R2ObjectHead | null>;
  put(key: string, bytes: Uint8Array, options: R2PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export class R2TransportError extends Error {
  readonly key: string;
  readonly status: number | undefined;

  constructor(key: string, message: string, status?: number) {
    super(`R2 ${key}: ${message}`);
    this.name = 'R2TransportError';
    this.key = key;
    this.status = status;
  }
}

/* ------------------------------------------------------------------------------------------ */

export interface MemoryR2Object {
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
}

export interface MemoryR2Transport extends R2Transport {
  readonly objects: Map<string, MemoryR2Object>;
  readonly calls: string[];
}

/** Speicher-Transport; `corruptReadback` simuliert einen fehlerhaften Upload, `failPut` einen Ausfall. */
export function createMemoryR2Transport(options: { bucket?: string; corruptReadback?: boolean; failPut?: (key: string) => boolean } = {}): MemoryR2Transport {
  const objects = new Map<string, MemoryR2Object>();
  const calls: string[] = [];
  return {
    name: 'memory',
    bucket: options.bucket ?? 'landesrecht-quellen',
    objects,
    calls,
    async head(key) {
      calls.push(`head ${key}`);
      const object = objects.get(key);
      if (!object) return null;
      const head: R2ObjectHead = { size: object.bytes.byteLength, contentType: object.contentType };
      if (object.metadata.sha256) head.sha256 = object.metadata.sha256;
      return head;
    },
    async put(key, bytes, putOptions) {
      calls.push(`put ${key}`);
      if (options.failPut?.(key)) throw new R2TransportError(key, 'simulierter Ausfall', 503);
      const stored = options.corruptReadback ? Uint8Array.from([...bytes, 0]) : Uint8Array.from(bytes);
      objects.set(key, { bytes: stored, contentType: putOptions.contentType, metadata: { ...putOptions.metadata } });
    },
    async get(key) {
      calls.push(`get ${key}`);
      const object = objects.get(key);
      return object ? Uint8Array.from(object.bytes) : null;
    },
  };
}

/* ------------------------------------------------------------------------------------------ */

const sha256Hex = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string): Buffer => createHmac('sha256', key).update(value).digest();

/** RFC-3986-Kodierung eines Pfadsegments (S3-Kanonisierung). */
export function encodeS3PathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface AwsV4SignInput {
  method: string;
  host: string;
  /** Bereits kodierter Pfad. */
  path: string;
  query?: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** `YYYYMMDDTHHMMSSZ` */
  amzDate: string;
}

/** AWS Signature Version 4 (Header-Variante). */
export function signAwsV4(input: AwsV4SignInput): { authorization: string; signedHeaders: string; canonicalRequest: string; stringToSign: string; signature: string } {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...input.headers, host: input.host })) headers[name.toLowerCase()] = String(value).trim().replace(/\s+/gu, ' ');
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [input.method, input.path, input.query ?? '', canonicalHeaders, signedHeaders, input.payloadHash].join('\n');
  const date = input.amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return { authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`, signedHeaders, canonicalRequest, stringToSign, signature };
}

export interface S3R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}

export function createS3R2Transport(options: S3R2Options): R2Transport {
  const endpoint = new URL(options.endpoint ?? `https://${options.accountId}.r2.cloudflarestorage.com`);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date());

  async function request(method: 'HEAD' | 'GET' | 'PUT', key: string, body?: Uint8Array, extraHeaders: Record<string, string> = {}): Promise<Response> {
    const path = `/${encodeS3PathSegment(options.bucket)}/${key.split('/').map(encodeS3PathSegment).join('/')}`;
    const amzDate = now().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const headers: Record<string, string> = { ...extraHeaders, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    const signed = signAwsV4({ method, host: endpoint.host, path, headers, payloadHash, accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey, region: 'auto', service: 's3', amzDate });
    const init: RequestInit = { method, headers: { ...headers, authorization: signed.authorization } };
    if (body) init.body = Buffer.from(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
    return fetchImplementation(new URL(path, endpoint).toString(), init);
  }

  return {
    name: 's3',
    bucket: options.bucket,
    async head(key) {
      const response = await request('HEAD', key);
      if (response.status === 404) return null;
      if (!response.ok) throw new R2TransportError(key, `HEAD HTTP ${response.status}`, response.status);
      const head: R2ObjectHead = { size: Number(response.headers.get('content-length') ?? '0') };
      const sha = response.headers.get('x-amz-meta-sha256');
      if (sha) head.sha256 = sha;
      const contentType = response.headers.get('content-type');
      if (contentType) head.contentType = contentType;
      return head;
    },
    async put(key, bytes, putOptions) {
      const headers: Record<string, string> = { 'content-type': putOptions.contentType };
      for (const [name, value] of Object.entries(putOptions.metadata)) headers[`x-amz-meta-${name.toLowerCase()}`] = encodeURIComponent(value);
      const response = await request('PUT', key, bytes, headers);
      if (!response.ok) throw new R2TransportError(key, `PUT HTTP ${response.status}`, response.status);
    },
    async get(key) {
      const response = await request('GET', key);
      if (response.status === 404) return null;
      if (!response.ok) throw new R2TransportError(key, `GET HTTP ${response.status}`, response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** S3-Transport aus Umgebungsvariablen; ohne vollständige Zugangsdaten `undefined` (kein Standardwert). */
export function s3R2TransportFromEnv(env: Record<string, string | undefined>, bucket: string): R2Transport | undefined {
  const accountId = env.R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return undefined;
  return createS3R2Transport({ accountId, accessKeyId, secretAccessKey, bucket: env.R2_BUCKET ?? bucket });
}

/** Welche R2-Umgebungsvariablen fehlen (für Readiness-Hinweise, ohne Werte auszugeben). */
export function missingR2Environment(env: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  if (!env.R2_ACCOUNT_ID && !env.CLOUDFLARE_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
  if (!env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  return missing;
}

/* ------------------------------------------------------------------------------------------ */

type ExecFile = (file: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number }) => Promise<{ stdout: string; stderr: string }>;

/** Wrangler-Transport (`wrangler r2 object put/get --remote`); Metadaten werden über Rücklesen geprüft. */
export function createWranglerR2Transport(options: { bucket: string; cwd?: string; exec?: ExecFile }): R2Transport {
  const run: ExecFile = options.exec ?? (promisify(execFile) as unknown as ExecFile);
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  async function withTemp<T>(action: (directory: string) => Promise<T>): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), 'landesrecht-r2-'));
    try {
      return await action(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async function get(key: string): Promise<Uint8Array | null> {
    return withTemp(async (directory) => {
      const file = join(directory, randomBytes(6).toString('hex'));
      try {
        await run('npx', ['wrangler', 'r2', 'object', 'get', `${options.bucket}/${key}`, '--file', file, '--remote'], { ...(options.cwd ? { cwd: options.cwd } : {}), env, maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        if (/not found|NoSuchKey|404/iu.test(String((error as { stderr?: string }).stderr ?? (error as Error).message))) return null;
        throw new R2TransportError(key, `wrangler get: ${(error as Error).message}`);
      }
      return new Uint8Array(await readFile(file));
    });
  }
  return {
    name: 'wrangler',
    bucket: options.bucket,
    async head(key) {
      const bytes = await get(key);
      return bytes ? { size: bytes.byteLength, sha256: sha256Hex(bytes) } : null;
    },
    async put(key, bytes, putOptions) {
      await withTemp(async (directory) => {
        const file = join(directory, randomBytes(6).toString('hex'));
        await writeFile(file, bytes);
        try {
          await run('npx', ['wrangler', 'r2', 'object', 'put', `${options.bucket}/${key}`, '--file', file, '--content-type', putOptions.contentType, '--remote'], { ...(options.cwd ? { cwd: options.cwd } : {}), env, maxBuffer: 16 * 1024 * 1024 });
        } catch (error) {
          throw new R2TransportError(key, `wrangler put: ${(error as Error).message}`);
        }
      });
    },
    get,
  };
}
