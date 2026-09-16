/**
 * Bulk-Orchestrierung des RECHT.NRW-Imports (je Quellbereich, sequenziell, jederzeit abbrechbar).
 *
 *   Enumeration laden → Auswahl (pending/processing, optional failed/review/veraltete, --only, --limit)
 *     → je Eintrag: Checkpoint „processing“ → Auflösung der Stammnorm (Term-ID, Fassungsliste; Dubletten
 *       werden zusammengeführt) → Importpfad LRGV/LRMB bzw. Evidenzregistrierung → Checkpoint (Status,
 *       Ergebnis) → Laufstatistik
 *     → Laufzusammenfassung `data/audits/recht-nrw/runs/<runId>.json`
 *
 * Checkpoints: Nach jeder Stammnorm sind Rohquellen, Slug-Registry, Norm, Report, Manifesteintrag,
 * Review-Datei und Enumeration atomar geschrieben. Ein harter Abbruch hinterlässt höchstens einen Eintrag
 * im Status `processing`, der beim Resume erneut verarbeitet wird (idempotent).
 *
 * Fehlerklassen:
 *   norm-lokal   Befund oder Ausnahme einer einzelnen Stammnorm → review/failed, der Lauf geht weiter
 *   Laufende     Budget erschöpft (`budget-exhausted`, kein Fehler), Abbruchsignal (`interrupted`)
 *   systemisch   Sperrantworten, R2-Ausfall oder -Konflikt, beschädigte Zustandsdateien, gehäufte gleichartige
 *                Parserfehler → `aborted-systemic`, kontrolliertes Ende
 */
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { importRechtNrwNorm, type ImportResult } from '../lrgv/pipeline.ts';
import { importRechtNrwLrmbDocument, type LrmbImportResult } from '../lrmb/pipeline.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { ArchiveError } from './archive.ts';
import { CorruptStateError, removeStaleTempFiles, writeJsonAtomic } from './atomic.ts';
import { RUNS_DIR } from './coverage.ts';
import { enumerationStatusCounts, readEnumeration, writeEnumeration, type EnumerationFile, type EnumerationItem } from './enumeration.ts';
import type { ImportEnvironment } from './environment.ts';
import { decodeHtml, RechtNrwFetchError, type RechtNrwFetcher } from './fetcher.ts';
import { AUDIT_DIR, compareSourceIdentity, IMPORT_DATA_DIR, identityFileName, isImportedStatus, type ImportManifest, type ManifestEntry, type SourceArea } from './manifest.ts';
import { recoverInterruptedNormWrites } from './persist.ts';
import { emptyReviewQueue, type ReviewItem, type ReviewQueue } from './review-queue.ts';
import { parseVersionUrl } from './source-identity.ts';
import { stableStringify } from './stable-json.ts';
import { currentParserVersion, isStaleEntry } from './staleness.ts';
import { parseVersionPage } from './version-page.ts';

export const RUN_SUMMARY_SCHEMA = 'recht-nrw-run-summary/1' as const;
export { RUNS_DIR };
export const EVIDENCE_DIR = join(IMPORT_DATA_DIR, 'evidence');

export const RUN_STATUSES = ['completed', 'limit-reached', 'nothing-to-do', 'budget-exhausted', 'interrupted', 'aborted-systemic'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface StopController {
  /** Erstes Signal: aktuelle Stammnorm abschließen, dann enden. */
  stopRequested: boolean;
  /** Zweites Signal: laufenden Abruf abbrechen; die Stammnorm bleibt offen. */
  readonly abort: AbortController;
  requestStop(): void;
}

export function createStopController(): StopController {
  const abort = new AbortController();
  const controller: StopController = {
    stopRequested: false,
    abort,
    requestStop() {
      if (controller.stopRequested) abort.abort();
      controller.stopRequested = true;
    },
  };
  return controller;
}

export interface ItemOutcome {
  status: 'done' | 'review' | 'failed' | 'excluded';
  importStatus: string;
  sourceIdentity?: string;
  targetSlug?: string;
  versionUrls?: string[];
  reviewCategories?: string[];
  errorCodes?: string[];
  reconstructed?: boolean;
  message?: string;
  manifestEntry?: ManifestEntry;
  reviewItems?: ReviewItem[];
}

export interface ProcessorContext {
  area: SourceArea;
  root: string;
  write: boolean;
  fetcher: RechtNrwFetcher;
  environment: ImportEnvironment;
  manifest: ImportManifest;
  reviewQueue: ReviewQueue;
  runId: string;
  now: () => Date;
  log: (line: string) => void;
}

export type ItemProcessor = (item: EnumerationItem, context: ProcessorContext) => Promise<ItemOutcome>;

export interface BulkRunOptions {
  root: string;
  area: SourceArea;
  write: boolean;
  resume: boolean;
  limit?: number;
  only?: readonly string[];
  refresh?: boolean;
  retryFailed?: boolean;
  retryReview?: boolean;
  regenerateStale?: boolean;
  fetcher: RechtNrwFetcher;
  environment: ImportEnvironment;
  /** Laufzeitbudget des Runners (zusätzlich zum Abrufbudget des Fetchers). */
  maxRuntimeMs?: number;
  budgetDescription?: Record<string, unknown>;
  processor?: ItemProcessor;
  stop?: StopController;
  systemic?: { window: number; maxSameCodeFailures: number; maxConsecutiveFailures: number };
  /** Vorhandenes Manifest und Queue (sonst leer; der Runner arbeitet je Stammnorm mit Einzeldateien). */
  manifest?: ImportManifest;
  reviewQueue?: ReviewQueue;
  enumeration?: EnumerationFile;
  gitCommit?: string;
  runId?: string;
  now?: () => Date;
  clock?: () => number;
  log?: (line: string) => void;
}

export interface RunSummary {
  schemaVersion: typeof RUN_SUMMARY_SCHEMA;
  runId: string;
  sourceArea: SourceArea;
  mode: 'dry-run' | 'write';
  runStatus: RunStatus;
  stopReason?: string;
  gitCommit?: string;
  parserVersion: string;
  transformerVersion: string;
  baselineDate: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  options: Record<string, unknown>;
  selected: number;
  processed: number;
  outcomes: { imported: number; importedWithWarnings: number; dryRun: number; review: number; failed: number; excluded: number; notAtBaseline: number; reconstructed: number; merged: number; split: number };
  network: { requests: number; cacheHits: number; bytes: number; retries: number; blockedResponses: number; cacheCorrupt: number };
  archive: { mode: string; stored: number; uploaded: number; verified: number; alreadyPresent: number };
  d1Projection: { status: 'not-run'; next: string };
  enumeration: Record<string, number>;
  failures: Array<{ key: string; code: string; message: string }>;
}

export const DEFAULT_SYSTEMIC_LIMITS = { window: 25, maxSameCodeFailures: 15, maxConsecutiveFailures: 20 };

export function runIdFor(area: SourceArea, startedAt: Date): string {
  return `recht-nrw-${SIMULATION_BASELINE_DATE}-${area}-${startedAt.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')}`;
}

export { currentParserVersion, isStaleEntry } from './staleness.ts';

function matchesOnly(item: EnumerationItem, only: readonly string[]): boolean {
  return only.some((value) => {
    const normalized = /^\d+$/u.test(value) ? `term:${value}` : value;
    return item.key === normalized || item.sourceIdentity === normalized || item.urls.includes(parseVersionUrl(value)?.url ?? value) || item.entryUrl === value;
  });
}

function outcomeFromResult(result: ImportResult | LrmbImportResult): ItemOutcome {
  const status: ItemOutcome['status'] = isImportedStatus(result.status) || result.status === 'dry-run' || result.status === 'not-at-baseline' ? 'done' : result.status === 'needs-review' ? 'review' : result.status === 'excluded' ? 'excluded' : 'failed';
  const outcome: ItemOutcome = { status, importStatus: result.status, reviewCategories: [...new Set(result.reviewItems.map((item) => item.category))].sort(), errorCodes: [...new Set(result.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code))].sort() };
  if (result.manifestEntry) {
    outcome.sourceIdentity = result.manifestEntry.sourceIdentity;
    outcome.manifestEntry = result.manifestEntry;
    if (result.manifestEntry.targetSlug) outcome.targetSlug = result.manifestEntry.targetSlug;
    if (result.manifestEntry.reconstructionStatus === 'reconstructed') outcome.reconstructed = true;
  } else if (result.termId) {
    outcome.sourceIdentity = `term:${result.termId}`;
  }
  if (result.versionUrls) outcome.versionUrls = result.versionUrls;
  if (result.reviewQueue && outcome.sourceIdentity) outcome.reviewItems = result.reviewQueue.items.filter((item) => item.sourceIdentity === outcome.sourceIdentity);
  const firstError = result.findings.find((finding) => finding.severity === 'error');
  if (firstError) outcome.message = firstError.message;
  return outcome;
}

/** Standard-Verarbeitung: Normkandidaten über die Importpfade, LRGV-Bekanntmachungen als Evidenzquelle. */
export const defaultItemProcessor: ItemProcessor = async (item, context) => {
  if (item.role === 'evidence') return registerEvidence(item, context);
  const common = { url: item.entryUrl, root: context.root, fetcher: context.fetcher, write: context.write, environment: context.environment, manifest: context.manifest, reviewQueue: context.reviewQueue, now: context.now, log: (message: string) => context.log(`    … ${message}`) };
  if (context.area === 'lrgv') {
    const address = parseVersionUrl(item.entryUrl);
    if (!address || (address.documentType !== 'gesetz' && address.documentType !== 'rechtsverordnung')) return { status: 'review', importStatus: 'needs-review', errorCodes: ['portal-type-not-importable'], message: `Portaltyp ${item.portalType} wird im Bereich LRGV nicht als Norm importiert` };
    return outcomeFromResult(await importRechtNrwNorm(common));
  }
  return outcomeFromResult(await importRechtNrwLrmbDocument(common));
};

/** Bekanntmachung als Evidenzquelle (z. B. Inkrafttreten eines Staatsvertrags): archivieren und registrieren, keine Norm. */
async function registerEvidence(item: EnumerationItem, context: ProcessorContext): Promise<ItemOutcome> {
  const document = await context.fetcher.fetch(item.entryUrl);
  const page = parseVersionPage(decodeHtml(document), item.entryUrl);
  if (!page.stemTermId) return { status: 'failed', importStatus: 'failed', errorCodes: ['missing-stem-id'], message: 'Bekanntmachung ohne Stammnorm-Kennung' };
  const sourceIdentity = `term:${page.stemTermId}`;
  const object = context.environment.archive.locate(document, { termId: page.stemTermId, sourceArea: context.area, role: 'version-page' });
  const evidence: Record<string, unknown> = {
    schemaVersion: 'recht-nrw-evidence/1',
    sourceIdentity,
    sourceArea: context.area,
    portalType: item.portalType,
    kind: item.evidence?.kind ?? 'notice',
    url: page.address.url,
    title: page.title,
    sha256: document.sha256,
    retrievedAt: document.retrievedAt,
    archive: { ...context.environment.archive.referenceFields(object) },
  };
  if (item.evidence?.treatyTitle) evidence.treatyTitle = item.evidence.treatyTitle;
  if (page.validFrom) evidence.validFrom = page.validFrom;
  if (page.promulgation) evidence.promulgation = page.promulgation;
  if (page.fullCitation) evidence.fullCitation = page.fullCitation;
  if (context.write) {
    await context.environment.archive.store(document, object);
    await writeJsonAtomic(join(context.root, EVIDENCE_DIR, context.area, `${identityFileName(sourceIdentity)}.json`), evidence);
  }
  return { status: 'excluded', importStatus: 'excluded', sourceIdentity, versionUrls: [page.address.url, ...page.versions.map((entry) => entry.url).filter((url): url is string => Boolean(url))], message: 'Evidenzquelle registriert (keine eigene Vorschrift)' };
}

class SystemicAbort extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = 'SystemicAbort';
    this.kind = kind;
  }
}

export async function runBulkImport(options: BulkRunOptions): Promise<{ summary: RunSummary; enumeration: EnumerationFile }> {
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const startedAt = now();
  const startedClock = clock();
  const runId = options.runId ?? runIdFor(options.area, startedAt);
  const processor = options.processor ?? defaultItemProcessor;
  const limits = options.systemic ?? DEFAULT_SYSTEMIC_LIMITS;
  const enumeration = options.enumeration ?? (await readEnumeration(options.root, options.area));
  if (!enumeration) throw new Error(`Keine Enumeration für ${options.area}; zuerst: npm run import:recht-nrw:enumerate -- --area ${options.area} --write`);
  options.environment.runId = runId;

  const progressExists = enumeration.items.some((item) => item.attempts > 0 || ['processing', 'done', 'review', 'failed'].includes(item.status));
  if (options.write && progressExists && !options.resume && !options.only?.length) throw new Error(`Die Enumeration ${options.area} enthält bereits Fortschritt; mit --resume fortsetzen (oder --only für Einzelfälle)`);

  if (options.write) {
    for (const action of await recoverInterruptedNormWrites(options.root)) log(`Wiederherstellung: ${action}`);
    for (const directory of [join(options.root, IMPORT_DATA_DIR), join(options.root, AUDIT_DIR)]) for (const removed of await removeStaleTempFiles(directory)) log(`Temp-Datei entfernt: ${removed}`);
  }

  const manifestByIdentity = new Map((options.manifest?.entries ?? []).map((entry) => [entry.sourceIdentity, entry]));
  const reviewByIdentity = new Map<string, ReviewItem[]>();
  for (const item of options.reviewQueue?.items ?? []) reviewByIdentity.set(item.sourceIdentity, [...(reviewByIdentity.get(item.sourceIdentity) ?? []), item]);

  const isStale = (item: EnumerationItem): boolean => {
    const entry = item.sourceIdentity ? manifestByIdentity.get(item.sourceIdentity) : undefined;
    return entry ? isStaleEntry(entry) : false;
  };
  // Beispielkorpus (versionierte Rohquellen unter sources/recht-nrw): nie im Bulk verarbeiten, nur mit dem
  // sample-Befehl. Der Bulk übernimmt den Manifeststatus in die Enumeration, damit Coverage und Resume stimmen.
  const sampleEntryFor = (item: EnumerationItem): ManifestEntry | undefined => {
    const entry = item.sourceIdentity ? manifestByIdentity.get(item.sourceIdentity) : undefined;
    return entry && entry.rawDocuments.some((document) => document.archiveStatus === 'versioned') ? entry : undefined;
  };
  let adoptedSamples = 0;
  for (const item of enumeration.items) {
    const entry = sampleEntryFor(item);
    if (!entry || item.mergedInto) continue;
    const status: EnumerationItem['status'] = isImportedStatus(entry.importStatus) || entry.importStatus === 'not-at-baseline' ? 'done' : entry.importStatus === 'needs-review' ? 'review' : entry.importStatus === 'excluded' ? 'excluded' : 'failed';
    if (item.status === status && item.outcome?.importStatus === entry.importStatus) continue;
    item.status = status;
    item.outcome = { importStatus: entry.importStatus, ...(entry.targetSlug ? { targetSlug: entry.targetSlug } : {}), parserVersion: entry.parserVersion, transformerVersion: entry.transformerVersion };
    adoptedSamples += 1;
  }
  if (adoptedSamples > 0) {
    log(`Beispielkorpus: ${adoptedSamples} Einträge mit versionierten Rohquellen aus dem Manifest übernommen (nicht verarbeitet; Neuerzeugung nur mit dem sample-Befehl)`);
    if (options.write) await writeEnumeration(options.root, enumeration);
  }
  const selected = enumeration.items.filter((item) => {
    if (item.mergedInto) return false;
    if (sampleEntryFor(item)) return false;
    if (options.only?.length) return matchesOnly(item, options.only);
    if (item.status === 'pending' || item.status === 'processing') return true;
    if (item.status === 'failed' && options.retryFailed) return true;
    if (item.status === 'review' && options.retryReview) return true;
    if (options.regenerateStale && (item.status === 'done' || item.status === 'review') && isStale(item)) return true;
    return false;
  });
  const queue = options.limit !== undefined ? selected.slice(0, options.limit) : selected;

  const outcomes: RunSummary['outcomes'] = { imported: 0, importedWithWarnings: 0, dryRun: 0, review: 0, failed: 0, excluded: 0, notAtBaseline: 0, reconstructed: 0, merged: 0, split: 0 };
  const failures: RunSummary['failures'] = [];
  const recent: Array<{ failed: boolean; codes: string[] }> = [];
  let consecutiveFailures = 0;
  let processed = 0;
  let runStatus: RunStatus = queue.length === 0 ? 'nothing-to-do' : 'completed';
  let stopReason: string | undefined;
  const processedIdentities = new Set<string>();

  const checkpoint = async (): Promise<void> => {
    if (options.write) await writeEnumeration(options.root, enumeration);
  };
  const touch = (item: EnumerationItem): void => {
    item.updatedAt = now().toISOString();
    item.lastRunId = runId;
  };

  for (const item of queue) {
    if (options.stop?.stopRequested) {
      runStatus = 'interrupted';
      stopReason = 'Abbruchsignal: Lauf nach der letzten vollständig verarbeiteten Stammnorm beendet';
      break;
    }
    if (options.maxRuntimeMs !== undefined && clock() - startedClock >= options.maxRuntimeMs) {
      runStatus = 'budget-exhausted';
      stopReason = `Laufzeitbudget von ${Math.round(options.maxRuntimeMs / 1000)} s erreicht`;
      break;
    }
    if (item.mergedInto) continue;
    if (item.sourceIdentity && processedIdentities.has(item.sourceIdentity)) {
      item.mergedInto = item.sourceIdentity;
      item.status = 'done';
      touch(item);
      outcomes.merged += 1;
      await checkpoint();
      continue;
    }
    const previousStatus = item.status;
    item.status = 'processing';
    touch(item);
    await checkpoint();
    log(`[${processed + 1}/${queue.length}] ${item.key} ${item.title.slice(0, 80)}`);
    const identity = item.sourceIdentity;
    const context: ProcessorContext = {
      area: options.area,
      root: options.root,
      write: options.write,
      fetcher: options.fetcher,
      environment: options.environment,
      manifest: { schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: SIMULATION_BASELINE_DATE, entries: identity && manifestByIdentity.has(identity) ? [manifestByIdentity.get(identity)!] : [] },
      reviewQueue: { ...emptyReviewQueue(), items: identity ? [...(reviewByIdentity.get(identity) ?? [])] : [] },
      runId,
      now,
      log,
    };
    let outcome: ItemOutcome;
    try {
      outcome = await processor(item, context);
    } catch (error) {
      const stopping = error instanceof RechtNrwFetchError && ['budget-exhausted', 'blocked', 'interrupted'].includes(error.kind);
      if (stopping || error instanceof ArchiveError || error instanceof CorruptStateError || error instanceof SystemicAbort) {
        item.status = previousStatus === 'processing' ? 'pending' : previousStatus;
        item.lastError = { code: error instanceof RechtNrwFetchError ? error.kind : (error as Error).name, message: (error as Error).message };
        touch(item);
        await checkpoint();
        if (error instanceof RechtNrwFetchError && error.kind === 'budget-exhausted') runStatus = 'budget-exhausted';
        else if (error instanceof RechtNrwFetchError && error.kind === 'interrupted') runStatus = 'interrupted';
        else runStatus = 'aborted-systemic';
        stopReason = (error as Error).message;
        break;
      }
      // Abruffehler behalten ihre Art (z. B. fetch-forbidden), damit gehäufte gleiche Ursachen als systemisch erkannt werden.
      outcome = { status: 'failed', importStatus: 'failed', errorCodes: [error instanceof RechtNrwFetchError ? `fetch-${error.kind}` : 'exception'], message: (error as Error).message };
    }

    processed += 1;
    item.attempts += 1;
    item.status = outcome.status;
    touch(item);
    if (outcome.sourceIdentity) {
      item.sourceIdentity = outcome.sourceIdentity;
      processedIdentities.add(outcome.sourceIdentity);
    }
    const summaryOutcome: NonNullable<EnumerationItem['outcome']> = { importStatus: outcome.importStatus };
    if (outcome.targetSlug) summaryOutcome.targetSlug = outcome.targetSlug;
    if (outcome.reviewCategories?.length) summaryOutcome.reviewCategories = outcome.reviewCategories;
    if (outcome.manifestEntry) {
      summaryOutcome.parserVersion = outcome.manifestEntry.parserVersion;
      summaryOutcome.transformerVersion = outcome.manifestEntry.transformerVersion;
      manifestByIdentity.set(outcome.manifestEntry.sourceIdentity, outcome.manifestEntry);
    }
    if (outcome.sourceIdentity && outcome.reviewItems) reviewByIdentity.set(outcome.sourceIdentity, outcome.reviewItems);
    item.outcome = summaryOutcome;
    if (outcome.status === 'failed') {
      item.lastError = { code: outcome.errorCodes?.[0] ?? 'failed', message: outcome.message ?? 'fehlgeschlagen' };
      if (failures.length < 50) failures.push({ key: item.key, code: item.lastError.code, message: item.lastError.message });
    } else {
      delete item.lastError;
    }

    // Zusammenführung (Slugänderungen) und Abtrennung fremder Adressen über die Fassungsliste.
    if (outcome.sourceIdentity && outcome.versionUrls?.length) {
      const versionUrls = new Set(outcome.versionUrls);
      for (const other of enumeration.items) {
        if (other === item || other.mergedInto || other.status === 'processing') continue;
        if (!other.urls.some((url) => versionUrls.has(url))) continue;
        if (other.sourceIdentity && other.sourceIdentity !== outcome.sourceIdentity) continue;
        if (other.status === 'pending' || other.status === 'failed' || other.sourceIdentity === outcome.sourceIdentity) {
          other.mergedInto = outcome.sourceIdentity;
          other.status = 'done';
          touch(other);
          item.urls = [...new Set([...item.urls, ...other.urls])].sort();
          outcomes.merged += 1;
        }
      }
      const foreign = item.urls.filter((url) => !versionUrls.has(url) && parseVersionUrl(url)?.section === options.area);
      if (foreign.length > 0 && foreign.length < item.urls.length) {
        const dates = foreign.map((url) => parseVersionUrl(url)?.pathDate ?? '').sort();
        // Stabiler Schlüssel: Basis ohne früher angehängtes Datum. Sonst trägt jede Wiederholung ein weiteres
        // „@datum“ an, die Dublettenprüfung greift nie und die Enumeration wächst unbegrenzt.
        const base = item.key.split('@')[0]!;
        const key = `${item.key.startsWith('term:') ? `stem:${item.portalType}/${parseVersionUrl(foreign[0]!)?.slug ?? 'split'}` : base}@${dates[0] || 'undatiert'}`;
        const alreadyKnown = enumeration.items.some((candidate) => candidate.key === key || (candidate !== item && candidate.urls.some((url) => foreign.includes(url))));
        if (!alreadyKnown) {
          enumeration.items.push({ ...item, key, urls: foreign.sort(), entryUrl: foreign.sort().at(-1)!, status: 'pending', attempts: 0, signals: { ...item.signals, search: false }, titleSource: 'slug', ...(item.lastRunId ? { lastRunId: item.lastRunId } : {}) });
          const added = enumeration.items.at(-1)!;
          delete added.sourceIdentity;
          delete added.outcome;
          delete added.search;
          delete added.lastError;
          outcomes.split += 1;
        }
        item.urls = item.urls.filter((url) => versionUrls.has(url) || !foreign.includes(url));
      }
    }
    await checkpoint();

    if (outcome.importStatus === 'imported') outcomes.imported += 1;
    else if (outcome.importStatus === 'imported-with-warnings') outcomes.importedWithWarnings += 1;
    else if (outcome.importStatus === 'dry-run') outcomes.dryRun += 1;
    else if (outcome.importStatus === 'not-at-baseline') outcomes.notAtBaseline += 1;
    if (outcome.status === 'review') outcomes.review += 1;
    if (outcome.status === 'failed') outcomes.failed += 1;
    if (outcome.status === 'excluded') outcomes.excluded += 1;
    if (outcome.reconstructed) outcomes.reconstructed += 1;
    log(`    → ${outcome.importStatus}${outcome.targetSlug ? ` ${outcome.targetSlug}` : ''}${outcome.reviewCategories?.length ? ` (Review: ${outcome.reviewCategories.join(', ')})` : ''}${outcome.status === 'failed' ? ` FEHLER ${outcome.message ?? ''}` : ''}`);

    // Systemische Fehlerbilder: viele Fehler in Folge oder gehäuft derselbe Fehlercode. Wiederholungen bereits
    // fehlgeschlagener Stammnormen (--retry-failed) zählen nicht mit: dort besteht die Auswahl per Definition aus
    // Fehlerfällen, ein erneuter Fehlschlag ist erwartbar und kein Hinweis auf Portal-, Parser- oder Netzprobleme.
    const failed = outcome.status === 'failed';
    const systemicSignal = failed && previousStatus !== 'failed';
    consecutiveFailures = systemicSignal ? consecutiveFailures + 1 : failed ? consecutiveFailures : 0;
    recent.push({ failed: systemicSignal, codes: systemicSignal ? outcome.errorCodes ?? [] : [] });
    if (recent.length > limits.window) recent.shift();
    const codeCounts = new Map<string, number>();
    for (const entry of recent) for (const code of new Set(entry.codes)) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    const dominant = [...codeCounts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (consecutiveFailures >= limits.maxConsecutiveFailures) {
      runStatus = 'aborted-systemic';
      stopReason = `${consecutiveFailures} Stammnormen in Folge fehlgeschlagen – systemischer Fehler vermutet (Portalstruktur, Parser, Netz)`;
      break;
    }
    if (dominant && dominant[1] >= limits.maxSameCodeFailures) {
      runStatus = 'aborted-systemic';
      stopReason = `Fehlercode ${dominant[0]} in ${dominant[1]} der letzten ${recent.length} Stammnormen – Parser oder Portalstruktur prüfen`;
      break;
    }
  }
  if (runStatus === 'completed' && options.limit !== undefined && selected.length > queue.length) runStatus = 'limit-reached';

  const endedAt = now();
  const stats = options.fetcher.stats;
  const summary: RunSummary = {
    schemaVersion: RUN_SUMMARY_SCHEMA,
    runId,
    sourceArea: options.area,
    mode: options.write ? 'write' : 'dry-run',
    runStatus,
    parserVersion: currentParserVersion(options.area),
    transformerVersion: TRANSFORMER_VERSION,
    baselineDate: SIMULATION_BASELINE_DATE,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, clock() - startedClock),
    options: { resume: options.resume, limit: options.limit ?? null, only: options.only ?? [], refresh: Boolean(options.refresh), retryFailed: Boolean(options.retryFailed), retryReview: Boolean(options.retryReview), regenerateStale: Boolean(options.regenerateStale), maxRuntimeMs: options.maxRuntimeMs ?? null, ...(options.budgetDescription ?? {}) },
    selected: queue.length,
    processed,
    outcomes,
    network: { requests: stats.networkRequests, cacheHits: stats.cacheHits, bytes: stats.bytesDownloaded ?? 0, retries: stats.retries ?? 0, blockedResponses: stats.blockedResponses ?? 0, cacheCorrupt: stats.cacheCorrupt ?? 0 },
    archive: { mode: options.environment.archive.mode, ...options.environment.archive.stats },
    d1Projection: { status: 'not-run', next: 'npm run d1:plan -- --jurisdiction west --target remote-batches (nach Abschluss aller Phasen und Audits)' },
    enumeration: enumerationStatusCounts(enumeration),
    failures,
  };
  if (stopReason) summary.stopReason = stopReason;
  if (options.gitCommit) summary.gitCommit = options.gitCommit;
  if (options.write) {
    enumeration.items.sort((left, right) => (left.key.startsWith('term:') && right.key.startsWith('term:') ? compareSourceIdentity(left.key, right.key) : left.key.startsWith('term:') !== right.key.startsWith('term:') ? (left.key.startsWith('term:') ? -1 : 1) : left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
    await writeEnumeration(options.root, enumeration);
    await writeJsonAtomic(join(options.root, RUNS_DIR, `${runId}.json`), summary);
  }
  return { summary, enumeration };
}

/** Fachlicher Vergleich zweier Läufe: Laufmetadaten (Zeitstempel, Lauf-ID) ausgenommen. */
export const RUNTIME_METADATA_FIELDS = ['retrievedAt', 'importedAt', 'generatedAt', 'updatedAt', 'firstSeenAt', 'decidedAt', 'lastRunId', 'runId', 'runStartedAt', 'runEndedAt', 'startedAt', 'endedAt', 'durationMs'] as const;

export function withoutRuntimeMetadata(value: unknown): string {
  const strip = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(strip);
    if (input && typeof input === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(input as Record<string, unknown>)) if (!(RUNTIME_METADATA_FIELDS as readonly string[]).includes(key)) output[key] = strip(entry);
      return output;
    }
    return input;
  };
  return stableStringify(strip(value));
}
