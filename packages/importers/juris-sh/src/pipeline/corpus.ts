/**
 * Befehl `fetch-corpus`: den enumerierten Bestand über den öffentlichen PDF-Ausgabeweg in den lokalen Cache
 * holen – Beschaffung, kein Import.
 *
 *   Phase `gesamtausgaben`  je Rahmendokument (Landesrecht) bzw. Verwaltungsvorschrift die PDF-Gesamtausgabe
 *   Phase `units`           für Rahmendokumente, deren heutige Ausgabe am Stichtag so nicht galt (geändert
 *                           oder nach dem Stichtag aufgehoben), alle Einzelfassungen aus der Sitemap
 *
 * Regeln wie im BayWü-Adapter: streng nacheinander (gemeinsamer Mindestabstand 1 s für jede Anfrage,
 * auch jede Weiterleitungsstation), ehrlicher User-Agent, `Retry-After`, Backoff, Abbruch bei Sperrantworten;
 * resumierbar (was im Cache liegt, wird nicht erneut geholt); Checkpoint nach jedem Dokument; Budgets
 * (`--limit` Netzabrufe, `--max-runtime`) sind saubere Halte; freier Plattenplatz wird geprüft.
 */
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { RechtNrwFetchError, RUN_STOPPING_FETCH_ERRORS } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { CACHE_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import { createJurisShFetcher } from '../common/fetcher.ts';
import { ENUMERABLE_AREAS, readEnumeration, type EnumerableArea } from '../enumerate/enumeration.ts';
import { createExportClient, ExportError } from '../export/client.ts';
import { parseJurisPdf } from '../parse/juris-pdf.ts';
import { layoutFromPdf } from '../parse/pdf-layout.ts';
import { classifyEdition } from '../parse/source-law.ts';
import { STAND_UNDETERMINED } from './document.ts';
import { sitemapUnits } from './units.ts';

export const CORPUS_STATE_PATH = `${IMPORT_DATA_DIR}/corpus-state.json`;
export const CORPUS_STATE_SCHEMA = 'juris-sh-corpus-state/1' as const;
export const CORPUS_TIMEOUT_MS = 90_000;
export const MIN_FREE_DISK_BYTES = 5 * 1024 ** 3;
export const CORPUS_PHASES = ['gesamtausgaben', 'units'] as const;
export type CorpusPhase = (typeof CORPUS_PHASES)[number];
export const STOP_REASONS = ['limit', 'max-runtime', 'disk-space', 'blocked', 'interrupted'] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export interface CorpusDocumentState {
  area: EnumerableArea;
  status: 'fetched' | 'failed';
  sha256?: string;
  byteLength?: number;
  retrievedAt?: string;
  error?: string;
  /** Stichtagseinordnung der heutigen Ausgabe (entscheidet, ob Einzelfassungen nötig sind). */
  baseline?: string;
  /** Einzelfassungen: geholt/gesamt (nur Phase `units`). */
  units?: { fetched: number; total: number; failed: number };
}

export interface CorpusState {
  schemaVersion: typeof CORPUS_STATE_SCHEMA;
  documents: Record<string, CorpusDocumentState>;
}

export interface FetchCorpusOptions {
  root: string;
  phase: CorpusPhase;
  /** Höchstzahl Netzabrufe dieses Laufs. */
  limit?: number;
  maxRuntimeMs?: number;
  only?: string[];
  offline?: boolean;
  signal?: AbortSignal;
  log?: (line: string) => void;
}

export interface FetchCorpusResult {
  phase: CorpusPhase;
  processed: number;
  fetchedNow: number;
  fromCache: number;
  failed: number;
  stop?: StopReason;
  network: { requests: number; bytes: number; sessions: number; retries: number; blocked: number };
}

export async function readCorpusState(root: string): Promise<CorpusState> {
  return (await readJsonFile<CorpusState>(join(root, CORPUS_STATE_PATH))) ?? { schemaVersion: CORPUS_STATE_SCHEMA, documents: {} };
}

async function writeCorpusState(root: string, state: CorpusState): Promise<void> {
  const sorted: CorpusState = { schemaVersion: CORPUS_STATE_SCHEMA, documents: Object.fromEntries(Object.entries(state.documents).sort(([left], [right]) => (left < right ? -1 : 1))) };
  await writeJsonAtomic(join(root, CORPUS_STATE_PATH), sorted);
}

export const RECONSTRUCTION_CLASSES = ['changed-after-baseline', 'repealed-after-baseline'];

export async function runFetchCorpus(options: FetchCorpusOptions): Promise<FetchCorpusResult> {
  const log = options.log ?? ((): void => undefined);
  const started = Date.now();
  const client = createExportClient({
    root: options.root,
    timeoutMs: CORPUS_TIMEOUT_MS,
    ...(options.offline ? { offline: true } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    budget: { ...(options.limit !== undefined ? { maxRequests: options.limit } : {}), ...(options.maxRuntimeMs !== undefined ? { maxRuntimeMs: options.maxRuntimeMs } : {}) },
  });
  const state = await readCorpusState(options.root);
  const result: FetchCorpusResult = { phase: options.phase, processed: 0, fetchedNow: 0, fromCache: 0, failed: 0, network: { requests: 0, bytes: 0, sessions: 0, retries: 0, blocked: 0 } };
  const items: Array<{ id: string; area: EnumerableArea }> = [];
  for (const area of ENUMERABLE_AREAS) {
    const file = await readEnumeration(options.root, area);
    if (!file) throw new Error(`Enumeration ${area} fehlt (npm run import:juris-sh:enumerate -- --write)`);
    for (const item of file.items) if (!options.only?.length || options.only.includes(item.key)) items.push({ id: item.key, area });
  }
  const unitsByFrame = options.phase === 'units' ? await sitemapUnits(createJurisShFetcher({ root: options.root, offline: true })) : new Map<string, string[]>();
  // Einzelfassungen: kleine Rahmendokumente zuerst – je Netzabruf werden so früh die meisten Normen vollständig.
  if (options.phase === 'units') items.sort((left, right) => (unitsByFrame.get(left.id)?.length ?? 0) - (unitsByFrame.get(right.id)?.length ?? 0) || (left.id < right.id ? -1 : 1));
  let sinceCheckpoint = 0;
  const checkpoint = async (force = false): Promise<void> => {
    sinceCheckpoint += 1;
    if (force || sinceCheckpoint >= 10) {
      await writeCorpusState(options.root, state);
      sinceCheckpoint = 0;
    }
  };

  try {
    for (const item of items) {
      if (options.signal?.aborted) {
        result.stop = 'interrupted';
        break;
      }
      if (options.maxRuntimeMs !== undefined && Date.now() - started >= options.maxRuntimeMs) {
        result.stop = 'max-runtime';
        break;
      }
      const free = await statfs(join(options.root, CACHE_DIR)).then((stats) => stats.bavail * stats.bsize).catch(() => Number.POSITIVE_INFINITY);
      if (free < MIN_FREE_DISK_BYTES) {
        result.stop = 'disk-space';
        break;
      }
      const entry = state.documents[item.id];
      if (options.phase === 'gesamtausgaben') {
        try {
          const pdf = await client.pdf(item.id, 'gesamtausgabe');
          if (pdf.fromCache) result.fromCache += 1;
          else result.fetchedNow += 1;
          let baseline: string | undefined;
          try {
            baseline = classifyEdition(parseJurisPdf(layoutFromPdf(pdf.bytes)), item.area === 'vwv').class;
          } catch (error) {
            baseline = `parse-error: ${(error as Error).message.slice(0, 80)}`;
          }
          state.documents[item.id] = { ...entry, area: item.area, status: 'fetched', sha256: pdf.sha256, byteLength: pdf.bytes.byteLength, retrievedAt: pdf.retrievedAt, baseline };
        } catch (error) {
          if (error instanceof RechtNrwFetchError && RUN_STOPPING_FETCH_ERRORS.includes(error.kind)) {
            result.stop = error.kind === 'budget-exhausted' ? (options.maxRuntimeMs !== undefined && Date.now() - started >= options.maxRuntimeMs ? 'max-runtime' : 'limit') : error.kind === 'blocked' ? 'blocked' : 'interrupted';
            break;
          }
          result.failed += 1;
          state.documents[item.id] = { ...entry, area: item.area, status: 'failed', error: (error as Error).message.slice(0, 200) };
        }
      } else {
        // Phase `units`: nur Rahmendokumente, deren heutige Ausgabe am Stichtag nicht galt. Die Einordnung wird
        // aus dem gecachten PDF neu berechnet (kein Netzabruf), damit eine geänderte Regel nicht veraltet greift.
        if (item.area !== 'landesrecht' || !entry || entry.status !== 'fetched') continue;
        let basis = '';
        try {
          const cached = await client.pdf(item.id, 'gesamtausgabe');
          const edition = classifyEdition(parseJurisPdf(layoutFromPdf(cached.bytes)), false);
          entry.baseline = edition.class;
          basis = edition.basis;
        } catch (error) {
          if (!(error instanceof ExportError) && !(error instanceof RechtNrwFetchError)) throw error;
        }
        // Auch unbestimmte Normen, die die Einzelfassungen entscheiden können (Stand-Vermerk nach dem Stichtag, kein
        // datiertes Verzeichnis, Ausgabe ohne Normtext): Sie zeigen, welche Fassung jeder Einheit am Stichtag galt.
        if (!RECONSTRUCTION_CLASSES.includes(entry.baseline ?? '') && !(entry.baseline === 'undetermined' && STAND_UNDETERMINED.test(basis))) continue;
        const unitIds = unitsByFrame.get(item.id) ?? [];
        let fetched = 0;
        let failed = 0;
        let stop = false;
        for (const unitId of unitIds) {
          try {
            const pdf = await client.pdf(unitId, 'dokument');
            if (pdf.fromCache) result.fromCache += 1;
            else result.fetchedNow += 1;
            fetched += 1;
          } catch (error) {
            if (error instanceof RechtNrwFetchError && RUN_STOPPING_FETCH_ERRORS.includes(error.kind)) {
              result.stop = error.kind === 'budget-exhausted' ? 'limit' : error.kind === 'blocked' ? 'blocked' : 'interrupted';
              stop = true;
              break;
            }
            if (!(error instanceof ExportError) && !(error instanceof RechtNrwFetchError)) throw error;
            failed += 1;
          }
        }
        state.documents[item.id] = { ...entry, units: { fetched, total: unitIds.length, failed } };
        if (stop) break;
      }
      result.processed += 1;
      if (result.processed % 50 === 0) log(`${options.phase}: ${result.processed} Dokumente · neu ${result.fetchedNow} · Cache ${result.fromCache} · Fehler ${result.failed} · Netzabrufe ${client.stats.network.networkRequests}`);
      await checkpoint();
    }
  } finally {
    await checkpoint(true);
  }
  result.network = { requests: client.stats.network.networkRequests, bytes: client.stats.network.bytesDownloaded ?? 0, sessions: client.stats.client.sessionsOpened, retries: client.stats.network.retries ?? 0, blocked: client.stats.network.blockedResponses ?? 0 };
  return result;
}
