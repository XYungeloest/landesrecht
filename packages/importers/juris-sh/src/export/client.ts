/**
 * Öffentlicher PDF-Ausgabeweg des Bürgerservice Schleswig-Holstein – der Rohquellenabruf des Adapters.
 *
 * Belegt in `data/audits/juris-sh/PUBLIC_EXPORT_DISCOVERY.md`:
 *
 *   1. Ein öffentlicher Permalink-Aufruf (`GET /perma?d=<DOKNR>`, dokumentierte Adressform „genau dieses
 *      Dokument“) setzt serverseitig eine **anonyme** Sitzung (`JSESSIONID`, `jwtCookie`, `LASTACCESS`,
 *      `OAuth_Token_Request_State`) – ohne Anmeldung, ohne Formular, ohne CSRF.
 *   2. Mit diesen Cookies liefert die dokumentierte Funktion „Abspeichern des Dokumentes im PDF-Format“
 *      (`GET /jportal/recherche3doc/<Name>.pdf?json={format:"pdf",docPart,docId,portalId:"bssh"}`) das
 *      Dokument als PDF mit Textlayer. Ohne Sitzung antwortet sie mit einem Hinweistext („Sitzung bereits
 *      beendet“), nie mit Inhalt.
 *   3. `docPart: "X"` am Rahmendokument liefert die **Gesamtausgabe** (aktuelle Fassung); eine Einheit
 *      (`…NN<11 Ziffern>`) ohne `docPart` liefert **genau diese Fassung** der Einheit mit „Gültig ab/bis“ –
 *      auch historische Fassungen.
 *
 * Die interne Schnittstelle `/jportal/wsrest/…` wird nie benutzt (der Fetcher verweigert sie), es wird kein
 * CSRF-Token gebildet, und der User-Agent bleibt der ehrliche des Projekts. Das Sitzungscookie wird nur für
 * die Exportfunktion verwendet und nie gespeichert.
 *
 * Cache: Jede Antwort liegt unverändert unter `.cache/juris-sh/` (Bytes + SHA-256 + Abrufzeit). Eine als
 * Hinweistext zurückgekommene Antwort wird nie als Rohquelle verwendet; der Abruf wird nach dem Öffnen einer
 * Sitzung einmal wiederholt (und ersetzt den Cacheeintrag).
 */
import { RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { JURIS_SH_ACCESS_POLICY, permaUrl, PORTAL_ORIGIN } from '../access/policy.ts';
import { createJurisShFetcher, decodeHtml, type FetchedDocument, type JurisShFetcher, type JurisShFetcherOptions } from '../common/fetcher.ts';
import { createRecordingFetch } from '../probe/exports.ts';

/** Kennung, an deren Permalink die Sitzung eröffnet wird (Landesverfassung; jede öffentliche DOKNR taugt). */
export const SESSION_ANCHOR = 'jlr-NNLSH00002D11';

export type ExportPart = 'gesamtausgabe' | 'dokument';

/** Ausgabeadresse: Gesamtausgabe (`docPart: "X"`) oder genau dieses Dokument (ohne `docPart`). */
export function pdfExportUrl(documentId: string, part: ExportPart): string {
  const name = `${documentId.replace(/[^A-Za-z0-9]+/gu, '_')}${part === 'gesamtausgabe' ? '_X' : ''}.pdf`;
  const json = part === 'gesamtausgabe' ? { format: 'pdf', docPart: 'X', docId: documentId, portalId: 'bssh' } : { format: 'pdf', docId: documentId, portalId: 'bssh' };
  return `${PORTAL_ORIGIN}/jportal/recherche3doc/${name}?json=${encodeURIComponent(JSON.stringify(json))}&_=${encodeURIComponent(`/${name}`)}`;
}

export const SESSION_REQUIRED_TEXT = /Sitzung bereits beendet|Recherche erneut durchgef/u;

export class ExportError extends Error {
  readonly code: 'session-required' | 'not-pdf' | 'server-error' | 'not-found';
  readonly documentId: string;

  constructor(code: ExportError['code'], documentId: string, message: string) {
    super(`[${code}] ${documentId}: ${message}`);
    this.name = 'ExportError';
    this.code = code;
    this.documentId = documentId;
  }
}

export interface ExportClientStats {
  sessionsOpened: number;
  staleCacheReplaced: number;
}

export interface ExportClient {
  /** PDF einer DOKNR; aus dem Cache, sonst mit anonymer Sitzung abgerufen. */
  pdf(documentId: string, part: ExportPart): Promise<FetchedDocument>;
  readonly stats: { network: JurisShFetcher['stats']; client: ExportClientStats };
}

export interface ExportClientOptions extends JurisShFetcherOptions {
  /** Grund-Fetch (Tests); wird von der Cookie-führenden Fetch-Funktion umhüllt. */
  baseFetch?: typeof fetch;
}

/**
 * Gemeinsamer Mindestabstand für **jede** HTTP-Anfrage (auch jede Station einer Weiterleitung) – die beiden
 * Fetcher des Clients und die Weiterleitungskette des Permalinks teilen ihn.
 */
export function rateLimitedFetch(base: typeof fetch, minIntervalMs: number, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock: () => number = Date.now): typeof fetch {
  let last = Number.NEGATIVE_INFINITY;
  let queue: Promise<unknown> = Promise.resolve();
  return ((input: string | URL | Request, init?: RequestInit) => {
    const run = queue.then(async () => {
      const wait = last + minIntervalMs - clock();
      if (wait > 0) await sleep(wait);
      last = clock();
      return base(input, init);
    });
    queue = run.catch(() => undefined);
    return run;
  }) as typeof fetch;
}

function isPdf(document: FetchedDocument): boolean {
  return /application\/pdf/iu.test(document.contentType) && new TextDecoder('latin1').decode(document.bytes.slice(0, 5)) === '%PDF-';
}

export function createExportClient(options: ExportClientOptions = {}): ExportClient {
  const { baseFetch, ...fetcherOptions } = options;
  const jar = new Map<string, string>();
  const limited = rateLimitedFetch(baseFetch ?? fetch, fetcherOptions.minDelayMs ?? JURIS_SH_ACCESS_POLICY.minDelayMs, fetcherOptions.sleep);
  const recording = createRecordingFetch(limited, jar);
  const fetcher = createJurisShFetcher({ maxRetries: 1, ...fetcherOptions, fetchImplementation: recording.fetchImplementation });
  const refreshing = createJurisShFetcher({ maxRetries: 1, ...fetcherOptions, refresh: true, fetchImplementation: recording.fetchImplementation });
  const clientStats: ExportClientStats = { sessionsOpened: 0, staleCacheReplaced: 0 };
  // Beide Fetcher serialisieren je für sich; zusammen laufen sie hier strikt nacheinander (await).
  const network = {
    get networkRequests(): number { return fetcher.stats.networkRequests + refreshing.stats.networkRequests; },
    get cacheHits(): number { return fetcher.stats.cacheHits + refreshing.stats.cacheHits; },
    get bytesDownloaded(): number { return (fetcher.stats.bytesDownloaded ?? 0) + (refreshing.stats.bytesDownloaded ?? 0); },
    get retries(): number { return (fetcher.stats.retries ?? 0) + (refreshing.stats.retries ?? 0); },
    get blockedResponses(): number { return (fetcher.stats.blockedResponses ?? 0) + (refreshing.stats.blockedResponses ?? 0); },
  };

  async function openSession(): Promise<void> {
    jar.clear();
    await refreshing.fetch(permaUrl(SESSION_ANCHOR));
    clientStats.sessionsOpened += 1;
    if (!jar.has('JSESSIONID')) throw new ExportError('session-required', SESSION_ANCHOR, 'Der öffentliche Permalink-Aufruf hat keine Sitzung gesetzt');
  }

  async function fetchOnce(url: string, documentId: string, refresh: boolean): Promise<FetchedDocument> {
    try {
      return await (refresh ? refreshing : fetcher).fetch(url);
    } catch (error) {
      if (error instanceof RechtNrwFetchError && error.kind === 'not-found') throw new ExportError('not-found', documentId, 'HTTP 404');
      if (error instanceof RechtNrwFetchError && error.kind === 'http' && (error.status ?? 0) >= 500) throw new ExportError('server-error', documentId, `HTTP ${error.status} – Kennung für diese Ausgabe nicht verfügbar`);
      throw error;
    }
  }

  return {
    stats: { network: network as JurisShFetcher['stats'], client: clientStats },
    async pdf(documentId, part) {
      const url = pdfExportUrl(documentId, part);
      let document = await fetchOnce(url, documentId, false);
      if (isPdf(document)) return document;
      const text = decodeHtml(document);
      if (!SESSION_REQUIRED_TEXT.test(text)) throw new ExportError('not-pdf', documentId, `${document.contentType}: ${text.replace(/\s+/gu, ' ').slice(0, 160)}`);
      if (document.fromCache) clientStats.staleCacheReplaced += 1;
      if (jar.size === 0 || !document.fromCache) await openSession();
      document = await fetchOnce(url, documentId, true);
      if (isPdf(document)) return document;
      const again = decodeHtml(document);
      if (SESSION_REQUIRED_TEXT.test(again)) {
        await openSession();
        document = await fetchOnce(url, documentId, true);
        if (isPdf(document)) return document;
        throw new ExportError('session-required', documentId, 'auch mit frisch eröffneter anonymer Sitzung kein PDF');
      }
      throw new ExportError('not-pdf', documentId, `${document.contentType}: ${again.replace(/\s+/gu, ' ').slice(0, 160)}`);
    },
  };
}
