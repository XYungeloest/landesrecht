/**
 * Zentraler, schonender Fetcher für RECHT.NRW (LRGV, LRMB, Ministerialblatt, Sitemaps, Suchindex).
 *
 *  - keine Parallelität: alle Abrufe laufen nacheinander mit Mindestabstand (Standard 1,5 s)
 *  - Timeout, begrenzte Wiederholungen mit exponentiellem Backoff; `Retry-After` wird respektiert
 *  - 429/403 sind Sperrantworten: nach mehreren aufeinanderfolgenden Sperren bricht der Fetcher mit
 *    `blocked` ab (systemischer Fehler, der Bulk-Lauf endet kontrolliert) – keine Umgehung
 *  - Abruf- und Laufzeitbudget (Anzahl Netzabrufe, Datenvolumen, Laufzeit) → `budget-exhausted`
 *  - lokaler Cache unter `.cache/recht-nrw/` (Bytes + Metadaten: finale URL, Status, relevante
 *    Header, Content-Type, Abrufzeit, SHA-256); Schlüssel aus Methode, URL und Anfragekörper;
 *    Wiederholungsläufe sind aus dem Cache vollständig netzfrei (`offline`), `refresh` ruft
 *    kontrolliert neu ab; ein Hashfehler im Cache gilt als Fehlabruf
 *
 * Es werden keine Zugriffsbeschränkungen umgangen.
 */
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { USER_AGENT } from './constants.ts';

export type FetchErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'rate-limited'
  | 'forbidden'
  | 'not-found'
  | 'invalid-url'
  | 'budget-exhausted'
  | 'blocked'
  | 'interrupted'
  | 'cache-corrupt';

/** Fehlerarten, die nicht eine einzelne Norm, sondern den ganzen Lauf betreffen. */
export const RUN_STOPPING_FETCH_ERRORS: readonly FetchErrorKind[] = ['budget-exhausted', 'blocked', 'interrupted'];

export class RechtNrwFetchError extends Error {
  readonly kind: FetchErrorKind;
  readonly url: string;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: FetchErrorKind, url: string, message: string, status?: number, retryAfterMs?: number) {
    super(`[${kind}] ${url}: ${message}`);
    this.name = 'RechtNrwFetchError';
    this.kind = kind;
    this.url = url;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface FetchedDocument {
  /** Angeforderte URL. */
  url: string;
  /** Finale URL nach Redirects. */
  finalUrl: string;
  status: number;
  contentType: string;
  retrievedAt: string;
  sha256: string;
  bytes: Uint8Array;
  fromCache: boolean;
  method?: 'GET' | 'POST';
  /** Relevante Antwort-Header (ETag, Last-Modified, Content-Length, Date). */
  headers?: Record<string, string>;
}

export interface RequestBudget {
  maxRequests?: number;
  maxBytes?: number;
  maxRuntimeMs?: number;
}

export interface FetcherStats {
  networkRequests: number;
  cacheHits: number;
  bytesDownloaded?: number;
  retries?: number;
  blockedResponses?: number;
  cacheCorrupt?: number;
}

export interface FetcherOptions {
  cacheDir?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Mindestabstand zwischen zwei Netzabrufen (Standard 1 500 ms). */
  minDelayMs?: number;
  /** Nur Cache lesen; jeder Netzabruf ist ein Fehler (Tests, Offline-Läufe). */
  offline?: boolean;
  /** Cache nicht lesen, sondern kontrolliert neu abrufen (Ergebnis ersetzt den Cacheeintrag). */
  refresh?: boolean;
  budget?: RequestBudget;
  /** Abbruch nach so vielen aufeinanderfolgenden Sperrantworten (429/403). */
  maxConsecutiveBlocks?: number;
  /** Längeres `Retry-After` wird nicht abgewartet, sondern beendet den Lauf (`blocked`). */
  maxRetryAfterMs?: number;
  /** Abbruchsignal (zweites Ctrl-C). */
  signal?: AbortSignal;
  /** Austauschbare Fetch-Funktion (Tests). */
  fetchImplementation?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Monotone Uhr in Millisekunden (Laufzeitbudget, Mindestabstand). */
  clock?: () => number;
}

export interface FetchRequest {
  method?: 'GET' | 'POST';
  body?: string;
  contentType?: string;
  accept?: string;
}

export interface RechtNrwFetcher {
  fetch(url: string, request?: FetchRequest): Promise<FetchedDocument>;
  readonly stats: FetcherStats;
}

export const DEFAULT_MIN_DELAY_MS = 1_500;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_CONSECUTIVE_BLOCKS = 3;
export const DEFAULT_MAX_RETRY_AFTER_MS = 120_000;
const RELEVANT_HEADERS = ['etag', 'last-modified', 'content-length', 'date'];

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Cacheschlüssel: GET ohne Körper wie bisher aus der URL, sonst aus Methode, URL und Körper. */
export function cacheKey(url: string, request: FetchRequest = {}): string {
  const method = request.method ?? 'GET';
  if (method === 'GET' && request.body === undefined) return sha256Hex(url).slice(0, 40);
  return sha256Hex(`${method}\n${url}\n${request.body ?? ''}`).slice(0, 40);
}

interface CacheMetadata {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  retrievedAt: string;
  sha256: string;
  method?: 'GET' | 'POST';
  requestSha256?: string;
  byteLength?: number;
  headers?: Record<string, string>;
}

/** `Retry-After` in Sekunden oder als HTTP-Datum → Millisekunden. */
export function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) return Number.parseInt(trimmed, 10) * 1_000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now.getTime());
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function abortError(): Error {
  return Object.assign(new Error('Abruf abgebrochen'), { name: 'AbortError' });
}

/**
 * Liest den Antwortkörper vollständig, aber nur solange das Signal nicht ausgelöst ist. Das Timeout eines
 * Abrufs deckt damit auch einen Server ab, der Kopfzeilen sendet und dann den Körper endlos offen hält
 * (`fetch` allein bricht nur die Verbindung ab; ohne diese Schranke hinge ein Fake oder eine Implementierung
 * ohne Signalkopplung unbegrenzt). Bei Abbruch wird der Strom freigegeben.
 */
export async function readBodyWithSignal(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return new Uint8Array(await Promise.race([response.arrayBuffer(), aborted]));
  } catch (error) {
    if (signal.aborted) response.body?.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export function createRechtNrwFetcher(options: FetcherOptions = {}): RechtNrwFetcher {
  const cacheDir = options.cacheDir ?? join(process.cwd(), '.cache', 'recht-nrw');
  const userAgent = options.userAgent ?? USER_AGENT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 3;
  const minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const maxConsecutiveBlocks = options.maxConsecutiveBlocks ?? DEFAULT_MAX_CONSECUTIVE_BLOCKS;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => Date.now());
  const startedAt = clock();
  const stats: Required<FetcherStats> = { networkRequests: 0, cacheHits: 0, bytesDownloaded: 0, retries: 0, blockedResponses: 0, cacheCorrupt: 0 };
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let consecutiveBlocks = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function readCache(url: string, request: FetchRequest): Promise<FetchedDocument | 'corrupt' | null> {
    const key = cacheKey(url, request);
    let metadata: CacheMetadata;
    let bytes: Uint8Array;
    try {
      metadata = JSON.parse(await readFile(join(cacheDir, `${key}.json`), 'utf8')) as CacheMetadata;
      bytes = new Uint8Array(await readFile(join(cacheDir, `${key}.bin`)));
    } catch (error) {
      // Fehlende Dateien sind ein Cache-Fehlschlag; unlesbare Metadaten sind ein beschädigter Eintrag.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      stats.cacheCorrupt += 1;
      return 'corrupt';
    }
    if (sha256Hex(bytes) !== metadata.sha256 || (metadata.byteLength !== undefined && metadata.byteLength !== bytes.byteLength)) {
      stats.cacheCorrupt += 1;
      return 'corrupt';
    }
    const document: FetchedDocument = { url: metadata.url, finalUrl: metadata.finalUrl, status: metadata.status, contentType: metadata.contentType, retrievedAt: metadata.retrievedAt, sha256: metadata.sha256, bytes, fromCache: true };
    if (metadata.method) document.method = metadata.method;
    if (metadata.headers) document.headers = metadata.headers;
    return document;
  }

  async function writeCache(document: FetchedDocument, request: FetchRequest): Promise<void> {
    const key = cacheKey(document.url, request);
    const metadata: CacheMetadata = {
      url: document.url,
      finalUrl: document.finalUrl,
      status: document.status,
      contentType: document.contentType,
      retrievedAt: document.retrievedAt,
      sha256: document.sha256,
      byteLength: document.bytes.byteLength,
    };
    if (request.method === 'POST') {
      metadata.method = 'POST';
      metadata.requestSha256 = sha256Hex(request.body ?? '');
    }
    if (document.headers && Object.keys(document.headers).length > 0) metadata.headers = document.headers;
    await writeFileAtomic(join(cacheDir, `${key}.bin`), document.bytes, { skipIfUnchanged: false });
    await writeJsonAtomic(join(cacheDir, `${key}.json`), metadata);
  }

  async function readNotFound(url: string, request: FetchRequest): Promise<boolean> {
    try {
      const entry = JSON.parse(await readFile(join(cacheDir, `${cacheKey(url, request)}.404.json`), 'utf8')) as { url?: string; status?: number };
      return entry.url === url && entry.status === 404;
    } catch {
      return false;
    }
  }

  async function writeNotFound(url: string, request: FetchRequest): Promise<void> {
    await writeJsonAtomic(join(cacheDir, `${cacheKey(url, request)}.404.json`), { url, status: 404, retrievedAt: now().toISOString() });
  }

  function assertBudget(url: string): void {
    if (options.signal?.aborted) throw new RechtNrwFetchError('interrupted', url, 'Lauf wurde abgebrochen');
    const budget = options.budget;
    if (!budget) return;
    if (budget.maxRequests !== undefined && stats.networkRequests >= budget.maxRequests) throw new RechtNrwFetchError('budget-exhausted', url, `Abrufbudget von ${budget.maxRequests} Netzabrufen erreicht`);
    if (budget.maxBytes !== undefined && stats.bytesDownloaded >= budget.maxBytes) throw new RechtNrwFetchError('budget-exhausted', url, `Datenvolumenbudget von ${budget.maxBytes} Bytes erreicht`);
    if (budget.maxRuntimeMs !== undefined && clock() - startedAt >= budget.maxRuntimeMs) throw new RechtNrwFetchError('budget-exhausted', url, `Laufzeitbudget von ${Math.round(budget.maxRuntimeMs / 1000)} s erreicht`);
  }

  async function fetchOnce(url: string, request: FetchRequest): Promise<FetchedDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    const method = request.method ?? 'GET';
    try {
      const headers: Record<string, string> = { 'user-agent': userAgent, accept: request.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.5', 'accept-language': 'de' };
      if (request.body !== undefined) headers['content-type'] = request.contentType ?? 'application/json';
      const init: RequestInit = { method, headers, redirect: 'follow', signal: controller.signal };
      if (request.body !== undefined) init.body = request.body;
      const response = await fetchImplementation(url, init);
      // Kopfzeilen und Körper stehen unter demselben Timeout; ein hängender Körper endet als `timeout`.
      const bytes = await readBodyWithSignal(response, controller.signal);
      stats.bytesDownloaded += bytes.byteLength;
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now());
      if (response.status === 429) throw new RechtNrwFetchError('rate-limited', url, 'HTTP 429 – Abruf wird nicht erzwungen', 429, retryAfterMs);
      if (response.status === 403) throw new RechtNrwFetchError('forbidden', url, 'HTTP 403 – Zugriff nicht erlaubt', 403, retryAfterMs);
      if (response.status === 404) throw new RechtNrwFetchError('not-found', url, 'HTTP 404', 404);
      if (response.status >= 500) throw new RechtNrwFetchError('http', url, `HTTP ${response.status}`, response.status, retryAfterMs);
      if (!response.ok) throw new RechtNrwFetchError('http', url, `HTTP ${response.status}`, response.status);
      const relevant: Record<string, string> = {};
      for (const name of RELEVANT_HEADERS) {
        const value = response.headers.get(name);
        if (value) relevant[name] = value;
      }
      const document: FetchedDocument = {
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        retrievedAt: now().toISOString(),
        sha256: sha256Hex(bytes),
        bytes,
        fromCache: false,
      };
      if (method === 'POST') document.method = 'POST';
      if (Object.keys(relevant).length > 0) document.headers = relevant;
      return document;
    } catch (error) {
      if (error instanceof RechtNrwFetchError) throw error;
      if (options.signal?.aborted) throw new RechtNrwFetchError('interrupted', url, 'Lauf wurde abgebrochen');
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') throw new RechtNrwFetchError('timeout', url, `keine vollständige Antwort innerhalb von ${timeoutMs} ms`);
      throw new RechtNrwFetchError('network', url, (error as Error).message);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function fetchWithRetries(url: string, request: FetchRequest): Promise<FetchedDocument> {
    let attempt = 0;
    for (;;) {
      const wait = lastRequestAt + minDelayMs - clock();
      if (wait > 0) await sleep(wait);
      assertBudget(url);
      lastRequestAt = clock();
      stats.networkRequests += 1;
      try {
        const document = await fetchOnce(url, request);
        consecutiveBlocks = 0;
        return document;
      } catch (error) {
        const fetchError = error as RechtNrwFetchError;
        if (fetchError.kind === 'rate-limited' || fetchError.kind === 'forbidden') {
          stats.blockedResponses += 1;
          consecutiveBlocks += 1;
          if (consecutiveBlocks >= maxConsecutiveBlocks) throw new RechtNrwFetchError('blocked', url, `${consecutiveBlocks} aufeinanderfolgende Sperrantworten (zuletzt HTTP ${fetchError.status}); Lauf wird kontrolliert beendet`, fetchError.status, fetchError.retryAfterMs);
        }
        if (fetchError.retryAfterMs !== undefined && fetchError.retryAfterMs > maxRetryAfterMs) {
          throw new RechtNrwFetchError('blocked', url, `Retry-After von ${Math.round(fetchError.retryAfterMs / 1000)} s überschreitet das Maximum; Lauf wird kontrolliert beendet`, fetchError.status, fetchError.retryAfterMs);
        }
        const retryable = fetchError.kind === 'timeout' || fetchError.kind === 'network' || (fetchError.kind === 'http' && (fetchError.status ?? 0) >= 500) || fetchError.kind === 'rate-limited';
        if (!retryable || attempt >= maxRetries) throw error;
        attempt += 1;
        stats.retries += 1;
        // Backoff 2 s, 4 s, 8 s …; bei 429 verdoppelt; ein längeres Retry-After hat Vorrang.
        const base = 2_000 * 2 ** (attempt - 1);
        const backoff = fetchError.kind === 'rate-limited' ? base * 2 : base;
        await sleep(Math.max(backoff, fetchError.retryAfterMs ?? 0));
      }
    }
  }

  return {
    stats,
    fetch(url, request = {}) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return Promise.reject(new RechtNrwFetchError('invalid-url', url, 'keine gültige URL'));
      }
      if (parsed.protocol !== 'https:') return Promise.reject(new RechtNrwFetchError('invalid-url', url, 'nur https wird abgerufen'));
      const run = queue.then(async () => {
        if (!options.refresh) {
          const cached = await readCache(url, request);
          if (cached && cached !== 'corrupt') {
            stats.cacheHits += 1;
            return cached;
          }
          if (cached === 'corrupt' && options.offline) throw new RechtNrwFetchError('cache-corrupt', url, 'Cacheeintrag mit falschem SHA-256 (Offline-Modus: kein Neuabruf)');
          // Negativ-Cache: eine belegte 404-Antwort wiederholt sich netzfrei und identisch (Determinismus offline).
          if (!cached && (await readNotFound(url, request))) {
            stats.cacheHits += 1;
            throw new RechtNrwFetchError('not-found', url, 'HTTP 404', 404);
          }
        }
        if (options.offline) throw new RechtNrwFetchError('network', url, 'Offline-Modus: Quelle nicht im Cache');
        let document: FetchedDocument;
        try {
          document = await fetchWithRetries(url, request);
        } catch (error) {
          if (error instanceof RechtNrwFetchError && error.kind === 'not-found') await writeNotFound(url, request);
          throw error;
        }
        await rm(join(cacheDir, `${cacheKey(url, request)}.404.json`), { force: true });
        await writeCache(document, request);
        return document;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export function decodeHtml(document: FetchedDocument): string {
  const charset = /charset=([\w-]+)/iu.exec(document.contentType)?.[1]?.toLowerCase();
  const decoder = new TextDecoder(charset && charset !== 'utf-8' && charset !== 'utf8' ? charset : 'utf-8');
  return decoder.decode(document.bytes);
}
