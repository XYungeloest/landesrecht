/**
 * Schonender Fetcher für RECHT.NRW.
 *
 *  - HTTP-Timeouts, begrenzte Wiederholungen mit Backoff, klare Fehlerklassen
 *  - keine Parallelität: alle Abrufe laufen nacheinander mit Mindestabstand
 *  - lokales Rohquellen-Cache (Bytes + Metadaten) unter `.cache/recht-nrw/`, damit
 *    unveränderte Quellen bei Wiederholungsläufen nicht erneut angefordert werden
 *  - SHA-256 der tatsächlich empfangenen Bytes, Abrufzeitpunkt, finale URL nach Redirects,
 *    Content-Type, nachvollziehbarer User-Agent
 *
 * Es werden keine Zugriffsbeschränkungen umgangen: 403/429 führen nach wenigen Versuchen zum
 * Abbruch mit `rate-limited`/`forbidden`, nie zu Umgehungsstrategien.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { USER_AGENT } from './constants.ts';

export type FetchErrorKind = 'timeout' | 'network' | 'http' | 'rate-limited' | 'forbidden' | 'not-found' | 'invalid-url';

export class RechtNrwFetchError extends Error {
  readonly kind: FetchErrorKind;
  readonly url: string;
  readonly status: number | undefined;

  constructor(kind: FetchErrorKind, url: string, message: string, status?: number) {
    super(`[${kind}] ${url}: ${message}`);
    this.name = 'RechtNrwFetchError';
    this.kind = kind;
    this.url = url;
    this.status = status;
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
}

export interface FetcherOptions {
  cacheDir?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Mindestabstand zwischen zwei Netzabrufen. */
  minDelayMs?: number;
  /** Nur Cache lesen; jeder Netzabruf ist ein Fehler (für Tests und Offline-Läufe). */
  offline?: boolean;
  /** Austauschbare Fetch-Funktion (Tests). */
  fetchImplementation?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface RechtNrwFetcher {
  fetch(url: string): Promise<FetchedDocument>;
  readonly stats: { networkRequests: number; cacheHits: number };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 40);
}

interface CacheMetadata {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  retrievedAt: string;
  sha256: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createRechtNrwFetcher(options: FetcherOptions = {}): RechtNrwFetcher {
  const cacheDir = options.cacheDir ?? join(process.cwd(), '.cache', 'recht-nrw');
  const userAgent = options.userAgent ?? USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 3;
  const minDelayMs = options.minDelayMs ?? 1_000;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const stats = { networkRequests: 0, cacheHits: 0 };
  let lastRequestAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function readCache(url: string): Promise<FetchedDocument | null> {
    const key = cacheKey(url);
    try {
      const metadata = JSON.parse(await readFile(join(cacheDir, `${key}.json`), 'utf8')) as CacheMetadata;
      const bytes = new Uint8Array(await readFile(join(cacheDir, `${key}.bin`)));
      if (sha256Hex(bytes) !== metadata.sha256) return null;
      return { ...metadata, bytes, fromCache: true };
    } catch {
      return null;
    }
  }

  async function writeCache(document: FetchedDocument): Promise<void> {
    await mkdir(cacheDir, { recursive: true });
    const key = cacheKey(document.url);
    const metadata: CacheMetadata = {
      url: document.url,
      finalUrl: document.finalUrl,
      status: document.status,
      contentType: document.contentType,
      retrievedAt: document.retrievedAt,
      sha256: document.sha256,
    };
    await writeFile(join(cacheDir, `${key}.bin`), document.bytes);
    await writeFile(join(cacheDir, `${key}.json`), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  }

  async function fetchOnce(url: string): Promise<FetchedDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(url, {
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5', 'accept-language': 'de' },
        redirect: 'follow',
        signal: controller.signal,
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (response.status === 429) throw new RechtNrwFetchError('rate-limited', url, 'HTTP 429 – Abruf wird nicht erzwungen', 429);
      if (response.status === 403) throw new RechtNrwFetchError('forbidden', url, 'HTTP 403 – Zugriff nicht erlaubt', 403);
      if (response.status === 404) throw new RechtNrwFetchError('not-found', url, 'HTTP 404', 404);
      if (response.status >= 500) throw new RechtNrwFetchError('http', url, `HTTP ${response.status}`, response.status);
      if (!response.ok) throw new RechtNrwFetchError('http', url, `HTTP ${response.status}`, response.status);
      return {
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        retrievedAt: now().toISOString(),
        sha256: sha256Hex(bytes),
        bytes,
        fromCache: false,
      };
    } catch (error) {
      if (error instanceof RechtNrwFetchError) throw error;
      if ((error as Error).name === 'AbortError') throw new RechtNrwFetchError('timeout', url, `keine Antwort innerhalb von ${timeoutMs} ms`);
      throw new RechtNrwFetchError('network', url, (error as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWithRetries(url: string): Promise<FetchedDocument> {
    let attempt = 0;
    for (;;) {
      const wait = Math.max(0, lastRequestAt + minDelayMs - Date.now());
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      stats.networkRequests += 1;
      try {
        return await fetchOnce(url);
      } catch (error) {
        const fetchError = error as RechtNrwFetchError;
        const retryable = fetchError.kind === 'timeout' || fetchError.kind === 'network' || (fetchError.kind === 'http' && (fetchError.status ?? 0) >= 500) || fetchError.kind === 'rate-limited';
        attempt += 1;
        if (!retryable || attempt > maxRetries) throw error;
        // Backoff: 2 s, 4 s, 8 s; bei 429 zusätzlich verdoppelt.
        const base = 2_000 * 2 ** (attempt - 1);
        await sleep(fetchError.kind === 'rate-limited' ? base * 2 : base);
      }
    }
  }

  return {
    stats,
    fetch(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return Promise.reject(new RechtNrwFetchError('invalid-url', url, 'keine gültige URL'));
      }
      if (parsed.protocol !== 'https:') return Promise.reject(new RechtNrwFetchError('invalid-url', url, 'nur https wird abgerufen'));
      const run = queue.then(async () => {
        const cached = await readCache(url);
        if (cached) {
          stats.cacheHits += 1;
          return cached;
        }
        if (options.offline) throw new RechtNrwFetchError('network', url, 'Offline-Modus: Quelle nicht im Cache');
        const document = await fetchWithRetries(url);
        await writeCache(document);
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
