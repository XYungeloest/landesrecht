/**
 * Transporte zum R2-Quellenarchiv `landesrecht-quellen`.
 *
 *  - `createMemoryR2Transport`: Fake für Tests und Offline-Simulationen (keine Netzverbindung)
 *  - `createWranglerR2Transport` (Standard): `wrangler r2 object put/get --remote` über Wranglers eigene
 *    Anmeldung (`npx wrangler login`); keine Schlüssel, keine eigene Token-Verarbeitung, ein Prozess je Aufruf
 *  - `createS3R2Transport`: S3-kompatible R2-API mit AWS-Signatur V4 (node:crypto, keine Abhängigkeit);
 *    Zugangsdaten nur aus der Umgebung (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) – CI-Weg
 *  - `createWranglerApiR2Transport` (optional, nur lokal, best effort): dieselben R2-Objekt-Endpunkte, die
 *    `wrangler r2 object` nutzt, direkt über HTTP mit dem Token aus Wranglers Anmeldedatei (oder
 *    `CLOUDFLARE_API_TOKEN`), ohne Prozessstart je Aufruf. Wrangler bietet dafür keine öffentliche API; das
 *    Dateiformat ist Wrangler-intern und wird fail-closed gelesen (docs/DEPLOYMENT.md, „R2-Transporte“).
 *
 * Alle Netzpfade: Timeout je Aufruf (Kopfzeilen und Körper), begrenzte Wiederholungen mit wachsendem Abstand,
 * `Retry-After` (gedeckelt). Zugangsdaten stehen nie in Fehlermeldungen, Logs oder Diagnosedateien.
 * Der Transport kennt keine Fachlogik; Unveränderlichkeit und Rückleseprüfung stehen in `archive.ts`.
 */
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { parseRetryAfter, readBodyWithSignal } from './fetcher.ts';

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
    super(`R2 ${key}: ${redactSecrets(message)}`);
    this.name = 'R2TransportError';
    this.key = key;
    this.status = status;
  }
}

/**
 * Entfernt Token-Formen aus Texten, die aus Fehlern oder Antworten stammen könnten (Bearer-Kopfzeilen,
 * Signaturen). Zweite Schranke; die Transporte fügen Zugangsdaten nie bewusst in Meldungen ein.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gu, 'Bearer [entfernt]')
    .replace(/(oauth_token|api_token|refresh_token|X-Auth-Key|CLOUDFLARE_API_TOKEN|R2_SECRET_ACCESS_KEY)\s*[=:]\s*"?[A-Za-z0-9._~+/=-]{8,}"?/giu, '$1=[entfernt]')
    .replace(/Credential=[^,\s]+/gu, 'Credential=[entfernt]')
    .replace(/Signature=[0-9a-f]+/gu, 'Signature=[entfernt]');
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
/* HTTP-Grundlagen der Netztransporte: Timeout, Wiederholung, Retry-After                       */

/** Zeit je HTTP-Aufruf (Verbindung, Kopfzeilen und Körper zusammen); danach Abbruch und Wiederholung. */
export const HTTP_TIMEOUT_MS = 15_000;
export const HTTP_RETRY_ATTEMPTS = 6;
export const HTTP_RETRY_DELAY_MS = 2_000;
/** Längeres `Retry-After` wird nicht abgewartet, sondern auf diesen Wert gedeckelt. */
export const HTTP_MAX_RETRY_AFTER_MS = 60_000;

export interface BoundedResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  bytes: Uint8Array;
}

export class HttpRequestError extends Error {
  readonly kind: 'timeout' | 'network';

  constructor(kind: 'timeout' | 'network', message: string) {
    super(message);
    this.name = 'HttpRequestError';
    this.kind = kind;
  }
}

/** Ein HTTP-Aufruf mit hartem Zeitlimit über Kopfzeilen und Körper; Netz- und Zeitfehler als `HttpRequestError`. */
export async function fetchBounded(fetchImplementation: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<BoundedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    const bytes = await readBodyWithSignal(response, controller.signal);
    return { status: response.status, ok: response.ok, headers: response.headers, bytes };
  } catch (error) {
    const name = (error as Error).name;
    if (controller.signal.aborted || name === 'AbortError' || name === 'TimeoutError') throw new HttpRequestError('timeout', `keine vollständige Antwort innerhalb von ${timeoutMs} ms`);
    throw new HttpRequestError('network', redactSecrets((error as Error).message));
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryPolicy {
  attempts?: number;
  delayMs?: number;
  maxRetryAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Diagnose je Versuch (Status oder Fehlerart, Dauer) – ohne Kopfzeilen, ohne Inhalte. */
  onAttempt?: (info: { attempt: number; status?: number; error?: string; durationMs: number }) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wiederholt einen idempotenten Aufruf bei Zeit-/Netzfehlern, 429 und 5xx mit wachsendem Abstand (`Retry-After`
 * hat Vorrang, gedeckelt). Andere Antworten werden unverändert zurückgegeben; nach der letzten Wiederholung
 * ist ein Netzfehler ein `R2TransportError`.
 */
export async function requestWithRetries(key: string, label: string, attemptRequest: (attempt: number) => Promise<BoundedResponse>, policy: RetryPolicy = {}): Promise<BoundedResponse> {
  const attempts = policy.attempts ?? HTTP_RETRY_ATTEMPTS;
  const delayMs = policy.delayMs ?? HTTP_RETRY_DELAY_MS;
  const maxRetryAfterMs = policy.maxRetryAfterMs ?? HTTP_MAX_RETRY_AFTER_MS;
  const sleep = policy.sleep ?? defaultSleep;
  const now = policy.now ?? (() => new Date());
  for (let attempt = 1; ; attempt += 1) {
    const startedAt = Date.now();
    let response: BoundedResponse;
    try {
      response = await attemptRequest(attempt);
    } catch (error) {
      if (!(error instanceof HttpRequestError)) throw error;
      policy.onAttempt?.({ attempt, error: error.kind, durationMs: Date.now() - startedAt });
      if (attempt >= attempts) throw new R2TransportError(key, `${label}: ${error.message} (${attempt} Versuche)`);
      await sleep(delayMs * attempt);
      continue;
    }
    policy.onAttempt?.({ attempt, status: response.status, durationMs: Date.now() - startedAt });
    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now()) ?? 0;
      await sleep(Math.min(maxRetryAfterMs, Math.max(retryAfterMs, delayMs * attempt)));
      continue;
    }
    return response;
  }
}

/** Fehlertext einer Cloudflare-API-Antwort: nur Codes und Meldungen aus `errors[]`, nie der Rohkörper. */
export function describeApiFailure(response: BoundedResponse): string {
  let detail = '';
  try {
    const body = JSON.parse(new TextDecoder().decode(response.bytes)) as { errors?: Array<{ code?: number; message?: string }> };
    detail = (body.errors ?? []).map((entry) => `${entry.code ?? '?'}: ${entry.message ?? ''}`.trim()).join('; ');
  } catch {
    detail = '';
  }
  return redactSecrets(`HTTP ${response.status}${detail ? ` (${detail.slice(0, 200)})` : ''}`);
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
  timeoutMs?: number;
  retry?: RetryPolicy;
}

export function createS3R2Transport(options: S3R2Options): R2Transport {
  const endpoint = new URL(options.endpoint ?? `https://${options.accountId}.r2.cloudflarestorage.com`);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS;
  const retry: RetryPolicy = { now, ...(options.retry ?? {}) };

  // Jede Wiederholung signiert neu (frisches x-amz-date); HEAD/GET/PUT desselben Schlüssels sind idempotent.
  function request(method: 'HEAD' | 'GET' | 'PUT', key: string, body?: Uint8Array, extraHeaders: Record<string, string> = {}): Promise<BoundedResponse> {
    const path = `/${encodeS3PathSegment(options.bucket)}/${key.split('/').map(encodeS3PathSegment).join('/')}`;
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    return requestWithRetries(key, `S3 ${method}`, () => {
      const amzDate = now().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
      const headers: Record<string, string> = { ...extraHeaders, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
      const signed = signAwsV4({ method, host: endpoint.host, path, headers, payloadHash, accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey, region: 'auto', service: 's3', amzDate });
      const init: RequestInit = { method, headers: { ...headers, authorization: signed.authorization } };
      if (body) init.body = Buffer.from(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
      return fetchBounded(fetchImplementation, new URL(path, endpoint).toString(), init, timeoutMs);
    }, retry);
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
      return response.bytes;
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
/* Wrangler-Anmeldung (nur für den optionalen Transport `wrangler-api`)                         */

/**
 * Wranglers eigene Anmeldedatei `.wrangler/config/default.toml` (Wrangler-internes Format, Stand Wrangler 4:
 * flache TOML-Datei mit `oauth_token`, `expiration_time`, `refresh_token`, `scopes`, optional `api_token`).
 * Reihenfolge wie bei Wrangler (xdg-app-paths): `XDG_CONFIG_HOME`, sonst der Konfigurationsordner des Systems
 * (macOS `~/Library/Preferences`, Windows `%APPDATA%`, sonst `~/.config`), dazu das ältere `~/.wrangler`.
 * Alle Pfade leiten sich aus der Umgebung ab; nichts ist auf einen Benutzer festgelegt.
 */
export function wranglerConfigCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? '';
  const configDir = env.XDG_CONFIG_HOME ? env.XDG_CONFIG_HOME : platform === 'darwin' ? join(home, 'Library', 'Preferences') : platform === 'win32' ? (env.APPDATA ?? join(home, 'AppData', 'Roaming')) : join(home, '.config');
  return [...new Set([join(configDir, '.wrangler', 'config', 'default.toml'), join(home, '.wrangler', 'config', 'default.toml')])];
}

export interface WranglerAuthConfig {
  oauthToken?: string;
  expirationTime?: string;
  apiToken?: string;
}

export type WranglerAuthReason = 'not-found' | 'unreadable' | 'format' | 'missing-token' | 'expired' | 'rejected' | 'accounts';

/** Anmeldeproblem des Transports `wrangler-api` – immer mit Handlungshinweis, nie mit Tokenwerten. */
export class WranglerAuthError extends R2TransportError {
  readonly reason: WranglerAuthReason;

  constructor(reason: WranglerAuthReason, message: string, status?: number) {
    super('', message, status);
    this.name = 'WranglerAuthError';
    this.reason = reason;
  }
}

const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{16,}$/u;
const AUTH_FIELDS = new Set(['oauth_token', 'api_token', 'expiration_time']);

/**
 * Liest Token und Ablauf aus dem Inhalt der Anmeldedatei – nur im Speicher. Fail-closed: Die drei bekannten
 * Felder müssen einfache, in doppelte Anführungszeichen gesetzte Strings mit Token-Form sein; alles andere
 * (Tabellen, mehrzeilige Werte, unerwartete Formen) ist ein Formatfehler statt eines geratenen Werts.
 * Unbekannte Felder (`refresh_token`, `scopes`, …) werden weder gelesen noch zurückgegeben.
 */
export function parseWranglerAuthConfig(toml: string): WranglerAuthConfig {
  const result: WranglerAuthConfig = {};
  for (const rawLine of toml.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) break; // Tabellen gehören nicht zum Anmeldeformat: Ende der Top-Level-Felder.
    const match = /^([A-Za-z_]+)\s*=\s*(.*)$/u.exec(line);
    if (!match) continue;
    const [, fieldName, rawValue] = match as unknown as [string, string, string];
    if (!AUTH_FIELDS.has(fieldName)) continue;
    const quoted = /^"([^"\\]*)"\s*(?:#.*)?$/u.exec(rawValue);
    if (!quoted) throw new Error(`Feld ${fieldName} ist kein einfacher String`);
    const value = quoted[1]!;
    if (fieldName === 'expiration_time') {
      result.expirationTime = value;
      continue;
    }
    if (!TOKEN_SHAPE.test(value)) throw new Error(`Feld ${fieldName} hat keine Token-Form`);
    if (fieldName === 'oauth_token') result.oauthToken = value;
    else result.apiToken = value;
  }
  return result;
}

/** Bisheriger Name; liefert dieselben Felder. */
export const parseWranglerOAuthConfig = parseWranglerAuthConfig;

/** Liest die erste vorhandene Anmeldedatei; jede Abweichung ist ein `WranglerAuthError` mit Hinweis. */
export async function readWranglerAuthFile(candidates: readonly string[] = wranglerConfigCandidates()): Promise<WranglerAuthConfig> {
  for (const candidate of candidates) {
    let text: string;
    try {
      text = await readFile(candidate, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new WranglerAuthError('unreadable', `Wrangler-Anmeldedatei nicht lesbar (${(error as NodeJS.ErrnoException).code ?? 'Fehler'}); Alternative: --r2-transport wrangler`);
    }
    if (text.trim() === '') throw new WranglerAuthError('missing-token', 'Wrangler-Anmeldedatei ist leer (nach wrangler logout?) – npx wrangler login');
    try {
      return parseWranglerAuthConfig(text);
    } catch (error) {
      throw new WranglerAuthError('format', `Wrangler-Anmeldedatei hat ein unerwartetes Format (${(error as Error).message}); Wrangler-Version geändert? Alternative: --r2-transport wrangler`);
    }
  }
  throw new WranglerAuthError('not-found', 'Keine Wrangler-Anmeldung gefunden (.wrangler/config/default.toml unter XDG_CONFIG_HOME, im Konfigurationsordner des Systems oder ~/.wrangler) und CLOUDFLARE_API_TOKEN nicht gesetzt – npx wrangler login; in CI: --r2-transport s3 oder CLOUDFLARE_API_TOKEN');
}

export interface WranglerApiR2Options {
  bucket: string;
  /** Konto; ohne Angabe wird das einzige Konto der Anmeldung verwendet (`GET /accounts`), bei mehreren Abbruch. */
  accountId?: string;
  cwd?: string;
  fetchImplementation?: typeof fetch;
  /** Liefert die Anmeldung; Standard: Wranglers Anmeldedatei. Wirft `WranglerAuthError`, wenn keine vorliegt. */
  readToken?: () => Promise<WranglerAuthConfig>;
  /** Erneuert das OAuth-Token (Standard: `wrangler whoami`, das Wranglers eigene Erneuerung anstößt). */
  refreshToken?: () => Promise<void>;
  apiBase?: string;
  /** Umgebung für `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`/`R2_ACCOUNT_ID`, `R2_API_DEBUG` (Standard: process.env). */
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  retry?: RetryPolicy;
  now?: () => number;
  /** Diagnosezeilen (Methode, Schlüssel, Versuch, Status, Dauer); Standard: Datei aus `R2_API_DEBUG`. */
  debugLog?: (line: string) => void;
}

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
/** Token gelten als ablaufend, wenn weniger als diese Spanne verbleibt (Erneuerung vor dem ersten 401). */
const TOKEN_MARGIN_MS = 60_000;

interface Credential {
  token: string;
  kind: 'oauth' | 'api-token';
  expiresAt: number;
}

/**
 * Direkter Aufruf der Cloudflare-R2-Objekt-API mit der bestehenden Wrangler-Anmeldung (dieselben Endpunkte,
 * die `wrangler r2 object put/get --remote` nutzt), ohne Prozessstart je Aufruf.
 *
 * Anmeldung: `CLOUDFLARE_API_TOKEN` (wie bei Wrangler vorrangig; ohne Erneuerung) oder Wranglers Anmeldedatei.
 * Abgelaufenes oder von der API abgewiesenes OAuth-Token: einmal neu lesen (ein anderer Wrangler-Prozess kann
 * es rotiert haben), sonst genau eine Erneuerung über `wrangler whoami`; bleibt das Token ungültig, endet der
 * Lauf mit klarer Meldung (`npx wrangler login`), ohne weitere Versuche oder Prozessstarts. Fehlende oder leere
 * Anmeldedatei (CI, `wrangler logout`) → sofortige Meldung. Mehrere Konten ohne `CLOUDFLARE_ACCOUNT_ID` →
 * Abbruch, keine stille Auswahl. Erwartete OAuth-Berechtigungen der Wrangler-Anmeldung: `account:read`
 * (Kontoermittlung) und `workers:write` (R2-Objekt-API; Standardumfang von `wrangler login`).
 */
export function createWranglerApiR2Transport(options: WranglerApiR2Options): R2Transport {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const apiBase = options.apiBase ?? CLOUDFLARE_API;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS;
  const readToken = options.readToken ?? (() => readWranglerAuthFile());
  const refreshToken = options.refreshToken ?? (async () => {
    const command = resolveWranglerCommand(options.cwd);
    await (promisify(execFile) as unknown as ExecFile)(command.file, [...command.prefix, 'whoami'], { ...(options.cwd ? { cwd: options.cwd } : {}), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 4 * 1024 * 1024, timeout: WRANGLER_CALL_TIMEOUT_MS });
  });
  // Diagnose je Aufruf (Methode, Schlüssel, Versuch, Status, Dauer) – ohne Token, Kopfzeilen oder Inhalte.
  const debugFile = env.R2_API_DEBUG;
  const debugLog = options.debugLog ?? (debugFile ? (line: string): void => { appendFileSync(debugFile, `${new Date().toISOString()} ${line}\n`); } : undefined);
  const envToken = env.CLOUDFLARE_API_TOKEN?.trim() || undefined;
  let accountId = options.accountId ?? env.CLOUDFLARE_ACCOUNT_ID ?? env.R2_ACCOUNT_ID;
  let accountLookup: Promise<string> | undefined;
  let current: Credential | undefined;
  let inflight: Promise<Credential> | undefined;
  let terminalFailure: WranglerAuthError | undefined;

  const fromConfig = (config: WranglerAuthConfig): Credential | undefined => {
    if (config.apiToken) return { token: config.apiToken, kind: 'api-token', expiresAt: Number.POSITIVE_INFINITY };
    if (!config.oauthToken) return undefined;
    const expiresAt = config.expirationTime === undefined ? Number.POSITIVE_INFINITY : Date.parse(config.expirationTime);
    return { token: config.oauthToken, kind: 'oauth', expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt };
  };
  const usable = (credential: Credential, rejected: string | undefined): boolean => credential.expiresAt - now() > TOKEN_MARGIN_MS && credential.token !== rejected;

  async function acquire(rejected: string | undefined): Promise<Credential> {
    let candidate = fromConfig(await readToken());
    if (candidate && usable(candidate, rejected)) return (current = candidate);
    current = undefined;
    if (!candidate) throw new WranglerAuthError('missing-token', 'Wrangler-Anmeldedatei ohne Token (nach wrangler logout?) – npx wrangler login');
    if (candidate.kind === 'api-token') {
      terminalFailure = new WranglerAuthError('rejected', 'Das API-Token der Wrangler-Anmeldedatei wird abgewiesen; Token und Berechtigungen (R2 Lesen/Schreiben) prüfen', 401);
      throw terminalFailure;
    }
    debugLog?.(`Token ${rejected ? 'abgewiesen' : 'abgelaufen'}: Erneuerung über wrangler whoami`);
    try {
      await refreshToken();
    } catch (error) {
      terminalFailure = new WranglerAuthError('expired', `Token-Erneuerung über wrangler whoami fehlgeschlagen (${redactSecrets((error as Error).message).split('\n')[0]}); npx wrangler login und denselben Befehl erneut ausführen`);
      throw terminalFailure;
    }
    candidate = fromConfig(await readToken());
    if (!candidate || !usable(candidate, rejected)) {
      terminalFailure = new WranglerAuthError('expired', 'Wrangler-Anmeldung abgelaufen oder abgewiesen und nicht erneuerbar – npx wrangler login; danach denselben Befehl erneut ausführen (verarbeitete Objekte stehen im Manifest, der Sync setzt fort)');
      throw terminalFailure;
    }
    debugLog?.('Token erneuert');
    return (current = candidate);
  }

  /** Gültige Anmeldung; `rejected` ist ein soeben mit 401 abgewiesenes Token, das nicht erneut verwendet wird. */
  function credential(rejected?: string): Promise<Credential> {
    if (envToken) {
      if (rejected === envToken) return Promise.reject(new WranglerAuthError('rejected', 'CLOUDFLARE_API_TOKEN wird von der Cloudflare-API abgewiesen (401); Token und Berechtigungen (R2 Lesen/Schreiben) prüfen', 401));
      return Promise.resolve({ token: envToken, kind: 'api-token', expiresAt: Number.POSITIVE_INFINITY });
    }
    if (current && usable(current, rejected)) return Promise.resolve(current);
    if (terminalFailure) return Promise.reject(terminalFailure);
    // Gleichzeitige Aufrufer teilen sich eine Erneuerung (kein Prozessstart je Worker).
    inflight ??= acquire(rejected).finally(() => { inflight = undefined; });
    return inflight;
  }

  async function apiFetch(path: string, init: RequestInit & { headers?: Record<string, string> }, key: string, label: string): Promise<BoundedResponse> {
    let rejected: string | undefined;
    for (let round = 1; ; round += 1) {
      let used = '';
      const response = await requestWithRetries(key, label, async () => {
        const auth = await credential(rejected);
        used = auth.token;
        return fetchBounded(fetchImplementation, `${apiBase}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${auth.token}` } }, timeoutMs);
      }, { now: () => new Date(now()), ...(options.retry ?? {}), onAttempt: (info) => debugLog?.(`${label} ${key} Versuch ${info.attempt} ${info.status !== undefined ? `HTTP ${info.status}` : `FEHLER ${info.error}`} ${info.durationMs} ms`) });
      if (response.status === 401 && round === 1) {
        // Einmalig: Token neu lesen (Rotation durch einen anderen Wrangler-Prozess) bzw. erneuern; ein zweites 401 ist endgültig.
        rejected = used;
        if (current?.token === used) current = undefined;
        continue;
      }
      return response;
    }
  }

  function resolveAccountId(): Promise<string> {
    if (accountId) return Promise.resolve(accountId);
    accountLookup ??= (async () => {
      const response = await apiFetch('/accounts?per_page=50', { method: 'GET' }, '', 'GET accounts');
      if (!response.ok) throw new WranglerAuthError('accounts', `Konten nicht lesbar: ${describeApiFailure(response)} (Berechtigung account:read?)`, response.status);
      const body = JSON.parse(new TextDecoder().decode(response.bytes)) as { result?: Array<{ id: string; name: string }> };
      const accounts = body.result ?? [];
      if (accounts.length === 0) throw new WranglerAuthError('accounts', 'Die Anmeldung sieht kein Cloudflare-Konto; CLOUDFLARE_ACCOUNT_ID setzen oder Berechtigung account:read prüfen');
      if (accounts.length > 1) throw new WranglerAuthError('accounts', `Die Anmeldung sieht ${accounts.length} Cloudflare-Konten; CLOUDFLARE_ACCOUNT_ID muss das Zielkonto benennen (keine stille Auswahl)`);
      accountId = accounts[0]!.id;
      return accountId;
    })();
    return accountLookup;
  }

  async function objectRequest(method: 'GET' | 'PUT', key: string, body?: Uint8Array, headers: Record<string, string> = {}): Promise<BoundedResponse> {
    const path = `/accounts/${await resolveAccountId()}/r2/buckets/${encodeS3PathSegment(options.bucket)}/objects/${key.split('/').map(encodeS3PathSegment).join('/')}`;
    const init: RequestInit & { headers?: Record<string, string> } = { method, headers };
    if (body) init.body = Buffer.from(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit;
    return apiFetch(path, init, key, method);
  }

  const failure = (key: string, label: string, response: BoundedResponse): R2TransportError => new R2TransportError(key, `${label} ${describeApiFailure(response)}${response.status === 401 ? ' – Anmeldung abgewiesen; npx wrangler login' : response.status === 403 ? ' – fehlende Berechtigung (R2 Lesen/Schreiben, Konto?)' : ''}`, response.status);

  return {
    name: 'wrangler-api',
    bucket: options.bucket,
    async head(key) {
      const bytes = await this.get(key);
      return bytes ? { size: bytes.byteLength, sha256: sha256Hex(bytes) } : null;
    },
    async put(key, bytes, putOptions) {
      const response = await objectRequest('PUT', key, bytes, { 'content-type': putOptions.contentType });
      if (!response.ok) throw failure(key, 'PUT', response);
    },
    async get(key) {
      const response = await objectRequest('GET', key);
      if (response.status === 404) return null;
      if (!response.ok) throw failure(key, 'GET', response);
      return response.bytes;
    },
    async list(prefix) {
      // Bucket-Listing der R2-API: 1000 Objekte je Seite, Fortsetzung über `cursor`; Etag = MD5 bei einfachem Upload.
      const objects: R2ListedObject[] = [];
      let cursor: string | undefined;
      for (let page = 1; ; page += 1) {
        const query = new URLSearchParams({ prefix, per_page: '1000', ...(cursor ? { cursor } : {}) });
        const response = await apiFetch(`/accounts/${await resolveAccountId()}/r2/buckets/${encodeS3PathSegment(options.bucket)}/objects?${query}`, { method: 'GET' }, prefix, 'LIST');
        if (!response.ok) throw failure(prefix, 'Listing', response);
        const body = JSON.parse(new TextDecoder().decode(response.bytes)) as { result?: Array<{ key: string; size: number; etag?: string }>; result_info?: { cursor?: string; is_truncated?: boolean } };
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

/* ------------------------------------------------------------------------------------------ */
/* Standardtransport: Wrangler-Prozesse                                                          */

type ExecFile = (file: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number; timeout?: number }) => Promise<{ stdout: string; stderr: string }>;

const WRANGLER_RETRY_ATTEMPTS = 4;
const WRANGLER_RETRY_DELAY_MS = 2_000;
/** Zeit je Wrangler-Prozess (Start, Anmeldung, Übertragung eines Objekts); danach wird er beendet und wiederholt. */
export const WRANGLER_CALL_TIMEOUT_MS = 300_000;
const WRANGLER_TRANSIENT = /401: Unauthorized|Authentication error|code: 10000|ECONNRESET|ETIMEDOUT|fetch failed|network|timeout|\b5\d\d\b|Internal Server Error|Service Unavailable|Too Many Requests|\b429\b/iu;

/** Lokal installiertes Wrangler direkt starten (spart den npx-Auflösungsschritt je Aufruf); sonst `npx wrangler`. */
export function resolveWranglerCommand(cwd: string | undefined): { file: string; prefix: string[] } {
  const base = cwd ?? process.cwd();
  for (const candidate of [join(base, 'node_modules', '.bin', 'wrangler'), join(base, '..', '..', 'node_modules', '.bin', 'wrangler')]) {
    if (existsSync(candidate)) return { file: candidate, prefix: [] };
  }
  return { file: 'npx', prefix: ['wrangler'] };
}

/**
 * Wrangler-Transport (`wrangler r2 object put/get --remote`); Metadaten werden über Rücklesen geprüft. Wrangler
 * verwaltet die Anmeldung selbst (Token-Erneuerung, `wrangler login`); dieser Code liest keine Zugangsdaten.
 */
export function createWranglerR2Transport(options: { bucket: string; cwd?: string; exec?: ExecFile; sleep?: (ms: number) => Promise<void>; timeoutMs?: number }): R2Transport {
  const exec: ExecFile = options.exec ?? (promisify(execFile) as unknown as ExecFile);
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? WRANGLER_CALL_TIMEOUT_MS;
  const command = resolveWranglerCommand(options.cwd);
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  // Vorübergehende Fehler (Netz, 5xx, ein hängender Prozess nach dem Zeitlimit und ein 401 während Wrangler das
  // OAuth-Token gerade erneuert – bei mehreren gleichzeitigen Prozessen möglich) werden mit Abstand wiederholt;
  // die Prüfungen selbst ändern sich nicht.
  const run: ExecFile = async (file, args, execOptions) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await exec(file, args, { ...execOptions, timeout: timeoutMs });
      } catch (error) {
        const timedOut = (error as { killed?: boolean }).killed === true;
        const detail = `${(error as { stderr?: string }).stderr ?? ''}\n${(error as Error).message}`;
        const normalized = timedOut ? Object.assign(new Error(`Zeitüberschreitung: Wrangler-Prozess nach ${Math.round(timeoutMs / 1000)} s beendet`), { stderr: '' }) : error;
        if (/does not exist|not found|NoSuchKey/iu.test(detail)) throw error;
        if (attempt >= WRANGLER_RETRY_ATTEMPTS || !(timedOut || WRANGLER_TRANSIENT.test(detail))) throw normalized;
        await sleep(WRANGLER_RETRY_DELAY_MS * attempt);
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
