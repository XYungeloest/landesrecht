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
import { appendFileSync, existsSync } from 'node:fs';
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

export interface R2ListedObject {
  key: string;
  size: number;
  /** Etag des Objekts; bei einfachem Upload der von R2 berechnete MD5 (hex) der gespeicherten Bytes. */
  md5?: string;
}

export interface R2Transport {
  readonly name: string;
  readonly bucket: string;
  head(key: string): Promise<R2ObjectHead | null>;
  put(key: string, bytes: Uint8Array, options: R2PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Alle Objekte unter einem Präfix (Existenz, Größe, Etag); Grundlage der Listing-/Etag-Prüfung beim Sync. */
  list?(prefix: string): Promise<R2ListedObject[]>;
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
    async list(prefix) {
      calls.push(`list ${prefix}`);
      return [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.bytes.byteLength, md5: createHash('md5').update(object.bytes).digest('hex') }));
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

/** Wranglers eigene Anmeldedatei (OAuth); Reihenfolge wie bei Wrangler: XDG-Konfiguration, macOS-Preferences, ~/.wrangler. */
export function wranglerConfigCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? '';
  const candidates: string[] = [];
  if (env.WRANGLER_HOME) candidates.push(join(env.WRANGLER_HOME, 'config', 'default.toml'));
  if (env.XDG_CONFIG_HOME) candidates.push(join(env.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.toml'));
  if (platform === 'darwin') candidates.push(join(home, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'));
  candidates.push(join(home, '.config', '.wrangler', 'config', 'default.toml'), join(home, '.wrangler', 'config', 'default.toml'));
  return candidates;
}

/** Liest Access-Token und Ablauf aus Wranglers Anmeldedatei (nur im Speicher; nichts wird ausgegeben oder kopiert). */
export function parseWranglerOAuthConfig(toml: string): { oauthToken?: string; expirationTime?: string } {
  const result: { oauthToken?: string; expirationTime?: string } = {};
  for (const line of toml.split('\n')) {
    const match = /^\s*(oauth_token|expiration_time)\s*=\s*"([^"]*)"/u.exec(line);
    if (!match) continue;
    if (match[1] === 'oauth_token') result.oauthToken = match[2]!;
    else result.expirationTime = match[2]!;
  }
  return result;
}

export interface WranglerApiR2Options {
  bucket: string;
  /** Konto; ohne Angabe wird das einzige Konto der Anmeldung verwendet (`GET /accounts`). */
  accountId?: string;
  cwd?: string;
  fetchImplementation?: typeof fetch;
  /** Liefert das aktuelle OAuth-Token; Standard: Wranglers Anmeldedatei. */
  readToken?: () => Promise<{ oauthToken?: string; expirationTime?: string }>;
  /** Erneuert das Token (Standard: `wrangler whoami`, das Wranglers eigene Erneuerung anstößt). */
  refreshToken?: () => Promise<void>;
  apiBase?: string;
}

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const API_RETRY_ATTEMPTS = 6;
const API_TIMEOUT_MS = 15_000;

/**
 * Direkter Aufruf der Cloudflare-R2-Objekt-API mit der bestehenden Wrangler-OAuth-Anmeldung (dieselben
 * Endpunkte, die `wrangler r2 object put/get --remote` nutzt), ohne Prozessstart je Aufruf. Prüfungen wie beim
 * Wrangler-Transport: Vorabprüfung über Rücklesen, Upload, Rücklesen mit Hashvergleich (uploadVerified).
 */
export function createWranglerApiR2Transport(options: WranglerApiR2Options): R2Transport {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const apiBase = options.apiBase ?? CLOUDFLARE_API;
  const readToken = options.readToken ?? (async () => {
    for (const candidate of wranglerConfigCandidates()) {
      if (!existsSync(candidate)) continue;
      return parseWranglerOAuthConfig(await readFile(candidate, 'utf8'));
    }
    throw new R2TransportError('', 'Keine Wrangler-Anmeldung gefunden (npx wrangler login)');
  });
  const refreshToken = options.refreshToken ?? (async () => {
    const command = resolveWranglerCommand(options.cwd);
    await (promisify(execFile) as unknown as ExecFile)(command.file, [...command.prefix, 'whoami'], { ...(options.cwd ? { cwd: options.cwd } : {}), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 4 * 1024 * 1024 });
  });
  let cachedToken: { oauthToken: string; expiresAt: number } | undefined;
  let accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID;
  // Diagnose je Aufruf (Methode, Status, Dauer) nach R2_API_DEBUG=<datei>; ohne Token, ohne Inhalte.
  const debugLog = process.env.R2_API_DEBUG ? (line: string): void => { appendFileSync(process.env.R2_API_DEBUG!, `${new Date().toISOString()} ${line}\n`); } : undefined;

  async function token(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.oauthToken;
    let config = await readToken();
    const expiresAt = config.expirationTime ? Date.parse(config.expirationTime) : Number.POSITIVE_INFINITY;
    if (forceRefresh || !config.oauthToken || expiresAt - Date.now() <= 60_000) {
      await refreshToken();
      config = await readToken();
    }
    if (!config.oauthToken) throw new R2TransportError('', 'Wrangler-Anmeldung ohne OAuth-Token (npx wrangler login)');
    cachedToken = { oauthToken: config.oauthToken, expiresAt: config.expirationTime ? Date.parse(config.expirationTime) : Number.POSITIVE_INFINITY };
    return cachedToken.oauthToken;
  }

  async function apiFetch(path: string, init: RequestInit & { headers?: Record<string, string> }, key: string): Promise<Response> {
    let refreshed = false;
    for (let attempt = 1; ; attempt += 1) {
      const bearer = await token();
      let response: Response;
      const startedAt = Date.now();
      try {
        // Hängende Verbindungen (sonst erst nach Nodes 300-s-Standardtimeout erkannt) werden nach API_TIMEOUT_MS
        // abgebrochen und wiederholt; jede Wiederholung stellt dieselbe Anfrage erneut (idempotente PUT/GET).
        response = await fetchImplementation(`${apiBase}${path}`, { ...init, signal: AbortSignal.timeout(API_TIMEOUT_MS), headers: { ...(init.headers ?? {}), authorization: `Bearer ${bearer}` } });
      } catch (error) {
        debugLog?.(`${init.method ?? 'GET'} ${key} Versuch ${attempt} FEHLER ${(error as Error).name} nach ${Date.now() - startedAt} ms`);
        if (attempt >= API_RETRY_ATTEMPTS) throw new R2TransportError(key, `Netzfehler: ${(error as Error).message}`);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, WRANGLER_RETRY_DELAY_MS * attempt));
        continue;
      }
      debugLog?.(`${init.method ?? 'GET'} ${key} Versuch ${attempt} HTTP ${response.status} nach ${Date.now() - startedAt} ms`);
      if (response.status === 401 && !refreshed) {
        // Token gerade abgelaufen oder von einem anderen Wrangler-Prozess erneuert: einmal neu lesen.
        refreshed = true;
        cachedToken = undefined;
        await token(true);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < API_RETRY_ATTEMPTS) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '0');
        await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(retryAfter * 1000, WRANGLER_RETRY_DELAY_MS * attempt)));
        continue;
      }
      return response;
    }
  }

  async function resolveAccountId(): Promise<string> {
    if (accountId) return accountId;
    const response = await apiFetch('/accounts?per_page=50', { method: 'GET' }, '');
    if (!response.ok) throw new R2TransportError('', `Konten nicht lesbar: HTTP ${response.status}`, response.status);
    const body = (await response.json()) as { result?: Array<{ id: string; name: string }> };
    const accounts = body.result ?? [];
    if (accounts.length !== 1) throw new R2TransportError('', `Anmeldung sieht ${accounts.length} Konten; CLOUDFLARE_ACCOUNT_ID setzen`);
    accountId = accounts[0]!.id;
    return accountId;
  }

  async function objectRequest(method: 'GET' | 'PUT', key: string, body?: Uint8Array, headers: Record<string, string> = {}): Promise<Response> {
    const path = `/accounts/${await resolveAccountId()}/r2/buckets/${encodeS3PathSegment(options.bucket)}/objects/${key.split('/').map(encodeS3PathSegment).join('/')}`;
    const init: RequestInit & { headers?: Record<string, string>; duplex?: string } = { method, headers };
    if (body) {
      init.body = Buffer.from(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
      init.duplex = 'half';
    }
    return apiFetch(path, init, key);
  }

  return {
    name: 'wrangler-api',
    bucket: options.bucket,
    async head(key) {
      const bytes = await this.get(key);
      return bytes ? { size: bytes.byteLength, sha256: sha256Hex(bytes) } : null;
    },
    async put(key, bytes, putOptions) {
      const response = await objectRequest('PUT', key, bytes, { 'content-type': putOptions.contentType });
      if (!response.ok) throw new R2TransportError(key, `PUT HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`, response.status);
    },
    async get(key) {
      const response = await objectRequest('GET', key);
      if (response.status === 404) return null;
      if (!response.ok) throw new R2TransportError(key, `GET HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`, response.status);
      return new Uint8Array(await response.arrayBuffer());
    },
    async list(prefix) {
      // Bucket-Listing der R2-API: 1000 Objekte je Seite, Fortsetzung über `cursor`; Etag = MD5 bei einfachem Upload.
      const objects: R2ListedObject[] = [];
      let cursor: string | undefined;
      for (let page = 1; ; page += 1) {
        const query = new URLSearchParams({ prefix, per_page: '1000', ...(cursor ? { cursor } : {}) });
        const response = await apiFetch(`/accounts/${await resolveAccountId()}/r2/buckets/${encodeS3PathSegment(options.bucket)}/objects?${query}`, { method: 'GET' }, prefix);
        if (!response.ok) throw new R2TransportError(prefix, `Listing HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`, response.status);
        const body = (await response.json()) as { result?: Array<{ key: string; size: number; etag?: string }>; result_info?: { cursor?: string; is_truncated?: boolean } };
        for (const object of body.result ?? []) {
          const entry: R2ListedObject = { key: object.key, size: Number(object.size) };
          const etag = object.etag?.replace(/"/gu, '');
          if (etag && /^[0-9a-f]{32}$/u.test(etag)) entry.md5 = etag;
          objects.push(entry);
        }
        if (!body.result_info?.is_truncated || !body.result_info.cursor) break;
        cursor = body.result_info.cursor;
        if (page > 1000) throw new R2TransportError(prefix, 'Listing bricht nicht ab (über 1000 Seiten)');
      }
      return objects;
    },
  };
}

const WRANGLER_RETRY_ATTEMPTS = 4;
const WRANGLER_RETRY_DELAY_MS = 2_000;
const WRANGLER_TRANSIENT = /401: Unauthorized|Authentication error|code: 10000|ECONNRESET|ETIMEDOUT|fetch failed|network|timeout|\b5\d\d\b|Internal Server Error|Service Unavailable|Too Many Requests|\b429\b/iu;

/** Lokal installiertes Wrangler direkt starten (spart den npx-Auflösungsschritt je Aufruf); sonst `npx wrangler`. */
export function resolveWranglerCommand(cwd: string | undefined): { file: string; prefix: string[] } {
  const base = cwd ?? process.cwd();
  for (const candidate of [join(base, 'node_modules', '.bin', 'wrangler'), join(base, '..', '..', 'node_modules', '.bin', 'wrangler')]) {
    if (existsSync(candidate)) return { file: candidate, prefix: [] };
  }
  return { file: 'npx', prefix: ['wrangler'] };
}

/** Wrangler-Transport (`wrangler r2 object put/get --remote`); Metadaten werden über Rücklesen geprüft. */
export function createWranglerR2Transport(options: { bucket: string; cwd?: string; exec?: ExecFile }): R2Transport {
  const exec: ExecFile = options.exec ?? (promisify(execFile) as unknown as ExecFile);
  const command = resolveWranglerCommand(options.cwd);
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  // Vorübergehende Fehler (Netz, 5xx, und ein 401 während Wrangler das OAuth-Token gerade erneuert – bei
  // mehreren gleichzeitigen Prozessen möglich) werden mit Abstand wiederholt; die Prüfungen selbst ändern sich nicht.
  const run: ExecFile = async (file, args, execOptions) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await exec(file, args, execOptions);
      } catch (error) {
        const detail = `${(error as { stderr?: string }).stderr ?? ''}\n${(error as Error).message}`;
        if (attempt >= WRANGLER_RETRY_ATTEMPTS || !WRANGLER_TRANSIENT.test(detail) || /does not exist|not found|NoSuchKey/iu.test(detail)) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, WRANGLER_RETRY_DELAY_MS * attempt));
      }
    }
  };
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
        await run(command.file, [...command.prefix, 'r2', 'object', 'get', `${options.bucket}/${key}`, '--file', file, '--remote'], { ...(options.cwd ? { cwd: options.cwd } : {}), env, maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        // Wrangler meldet fehlende Objekte als „The specified key does not exist.“ (R2-API: NoSuchKey / 404).
        const detail = `${(error as { stderr?: string }).stderr ?? ''}\n${(error as Error).message}`;
        if (/does not exist|not found|NoSuchKey|404/iu.test(detail)) return null;
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
          await run(command.file, [...command.prefix, 'r2', 'object', 'put', `${options.bucket}/${key}`, '--file', file, '--content-type', putOptions.contentType, '--remote'], { ...(options.cwd ? { cwd: options.cwd } : {}), env, maxBuffer: 16 * 1024 * 1024 });
        } catch (error) {
          throw new R2TransportError(key, `wrangler put: ${(error as Error).message}`);
        }
      });
    },
    get,
  };
}
