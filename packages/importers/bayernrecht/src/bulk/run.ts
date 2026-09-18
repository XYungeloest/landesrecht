/**
 * Der Bulk-Lauf: Auswahl → je Kandidat ein Weg (`norm.ts`) → Checkpoint → Laufbericht.
 *
 * Dies ist der Schritt, ab dem Fehler im Bestand landen. Die Regeln des Laufs sind deshalb dieselben
 * wie beim erprobten West-Adapter, und sie gelten ohne Ausnahme:
 *
 *   **Dry-run ist die Voreinstellung.** Ohne `--write` wird nichts geschrieben – nicht die Norm,
 *   nicht das Manifest, nicht die Review-Datei, nicht der Fortschritt und auch nicht der Laufbericht.
 *   Geprüft und entschieden wird trotzdem vollständig: Der Dry-run trifft dieselbe Aussage wie der
 *   Schreiblauf, nur ohne Wirkung.
 *
 *   **Checkpoint nach jedem Kandidaten.** Nach jeder Norm sind Inhalt, Slug-Registry, Manifest,
 *   Review-Datei und Fortschritt geschrieben. Ein harter Abbruch hinterlässt höchstens einen Eintrag
 *   im Status `processing`; `--resume` nimmt genau dort wieder auf.
 *
 *   **Budgets sind Halte, keine Fehler.** `--limit` und `--max-runtime` beenden den Lauf sauber;
 *   alles Offene bleibt offen, der nächste Lauf macht weiter (Exit 0).
 *
 *   **Normlokal gegen systemisch.** Ein Befund an einer Norm wird festgehalten, und der Lauf geht
 *   weiter. Ein Fehler, der jeden weiteren Versuch entwertet – beschädigte Zustandsdatei, nicht
 *   lesbares Cachemedium, inkonsistente Slug-Registry, reihenweise derselbe Parserfehler –, hält den
 *   Lauf kontrolliert an. Der Unterschied ist nicht die Schwere, sondern die Reichweite.
 *
 *   **Kein Netzzugriff.** Fehlt ein Paket, ist das `skipped-not-cached` und Sache von `fetch-corpus`.
 */
import { join } from 'node:path';

import { CorruptStateError, removeStaleTempFiles, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR, BASELINE_DATE, CACHE_DIR, IMPORT_DATA_DIR, PARSER_VERSION, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import { readManifest, type ManifestEntry } from '../common/manifest.ts';
import { runReportPath } from '../common/paths.ts';
import { emptyReviewQueue, readReviewQueue, type ReviewQueue } from '../common/review.ts';
import { emptySlugRegistry, readSlugRegistry, seedSlugRegistryFromManifest, writeSlugRegistry, SLUG_REGISTRY_PATH } from '../common/slug-registry.ts';
import { readInstitutionRegistry } from '../transform/institution-registry.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { CacheUnreadableError } from './cache.ts';
import { processCandidate } from './norm.ts';
import { listExistingSlugs, recoverInterruptedNormWrites } from './persist.ts';
import { loadSelection, type BulkCandidate } from './select.ts';
import {
  buildBulkState,
  readBulkState,
  statusForResult,
  writeBulkState,
  BULK_RESULTS,
  type BulkEntryStatus,
  type BulkPhase,
  type BulkResult,
  type BulkStateEntry,
  type BulkStateFile,
} from './state.ts';

export const BULK_RUN_SCHEMA = 'bayernrecht-bulk-run/1' as const;

export const RUN_STATUSES = ['completed', 'nothing-to-do', 'limit-reached', 'budget-exhausted', 'aborted-systemic'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Schranken der systemischen Erkennung. Sie sind bewusst großzügig: Ein Bestand von mehreren Tausend
 * Normen enthält Einzelfälle, aber keine zwanzig Fehlschläge in Folge – das wäre kein Bestand mehr,
 * sondern ein Umgebungs- oder Parserproblem.
 */
export const DEFAULT_SYSTEMIC_LIMITS = { window: 25, maxSameCodeFailures: 15, maxConsecutiveFailures: 20 };

/** Fehlercodes des Dateisystems, die nicht an einer Norm liegen, sondern an der Umgebung. */
const SYSTEMIC_IO_CODES = new Set(['EACCES', 'EPERM', 'EIO', 'ENOSPC', 'EROFS', 'EMFILE', 'ENFILE']);

export interface BulkRunOptions {
  root: string;
  write: boolean;
  /** Vorhandenen Fortschritt fortsetzen; ohne `--resume` wird jeder Kandidat neu bewertet. */
  resume: boolean;
  area?: SourceArea;
  only?: readonly string[];
  /** Höchstens n Kandidaten in diesem Lauf. */
  limit?: number;
  maxRuntimeMs?: number;
  cacheDir?: string;
  runId?: string;
  now?: () => Date;
  clock?: () => number;
  log?: (line: string) => void;
  systemic?: { window: number; maxSameCodeFailures: number; maxConsecutiveFailures: number };
}

/** Eine Zeile je verarbeitetem Kandidaten: Bereich, Schlüssel, Phase, Ergebnis, Dauer. */
export interface BulkRunEntry {
  documentId: string;
  sourceArea: SourceArea;
  phase: BulkPhase;
  result: BulkResult;
  durationMs: number;
  targetSlug?: string;
  code?: string;
  message?: string;
  reviewCategories?: string[];
}

export interface BulkRunSummary {
  schemaVersion: typeof BULK_RUN_SCHEMA;
  runId: string;
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceSystem: typeof SOURCE_SYSTEM;
  mode: 'dry-run' | 'write';
  runStatus: RunStatus;
  stopReason?: string;
  baselineDate: string;
  parserVersion: string;
  transformerVersion: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  options: Record<string, unknown>;
  selection: {
    scopeDocuments: number;
    include: number;
    exclude: number;
    scopeReview: number;
    withBaselineDecision: number;
    eligible: number;
    queued: number;
    processed: number;
    resumed: number;
  };
  outcomes: Record<BulkResult, number>;
  /** Review-Kategorie → Anzahl betroffener Normen. */
  reviewCategories: Record<string, number>;
  /** Ausschluss- und Fehlercodes → Anzahl (die Antwort auf „wie viele aus welchem Grund nicht“). */
  reasons: Record<string, number>;
  /** Warnungen der verarbeiteten Normen → Anzahl; sie hindern keine Übernahme, verschwinden aber nicht. */
  warnings: Record<string, number>;
  failures: Array<{ documentId: string; code: string; message: string }>;
  written: { files: number; norms: number; changed: number };
  entries: BulkRunEntry[];
}

export interface BulkRunResult {
  summary: BulkRunSummary;
  state: BulkStateFile;
  /** Pfad des Laufberichts (auch im Dry-run genannt, dort aber nicht geschrieben). */
  reportPath: string;
  reportWritten: boolean;
}

export function runIdFor(startedAt: Date, area?: SourceArea): string {
  const stamp = startedAt.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'z').toLowerCase();
  return `${SOURCE_SYSTEM}-bulk-${area ? `${area}-` : ''}${stamp}`;
}

function emptyOutcomes(): Record<BulkResult, number> {
  return Object.fromEntries(BULK_RESULTS.map((result) => [result, 0])) as Record<BulkResult, number>;
}

/** Zustände, die `--resume` als erledigt ansieht; alles andere wird erneut verarbeitet. */
const RESUMABLE_DONE: readonly BulkEntryStatus[] = ['done', 'review', 'failed', 'skipped'];

/**
 * Systemisch oder normlokal? Entschieden wird nach der **Reichweite** des Fehlers: Was jeden weiteren
 * Kandidaten genauso treffen würde, hält den Lauf an; alles andere bleibt ein Befund an einer Norm.
 */
function systemicReason(error: unknown): string | undefined {
  if (error instanceof CorruptStateError) return `Beschädigte Zustandsdatei: ${error.message}`;
  if (error instanceof CacheUnreadableError) return `Cachemedium nicht lesbar: ${error.message}`;
  // Die Slug-Registry prüft sich beim Schreiben selbst; ist sie widersprüchlich, ist jede weitere
  // Vergabe unzuverlässig – und ein doppelt vergebener Slug wäre eine vertauschte Norm.
  if (error instanceof Error && error.message.startsWith(SLUG_REGISTRY_PATH)) return `Slug-Registry inkonsistent: ${error.message}`;
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && SYSTEMIC_IO_CODES.has(code)) return `Dateisystemfehler ${code}: ${(error as Error).message}`;
  return undefined;
}

export async function runBulk(options: BulkRunOptions): Promise<BulkRunResult> {
  const now = options.now ?? ((): Date => new Date());
  const clock = options.clock ?? ((): number => Date.now());
  const log = options.log ?? ((): void => undefined);
  const limits = options.systemic ?? DEFAULT_SYSTEMIC_LIMITS;
  const startedAt = now();
  const startedClock = clock();
  const runId = options.runId ?? runIdFor(startedAt, options.area);
  const baselineDate = BASELINE_DATE;
  const cacheDir = options.cacheDir ? (options.cacheDir.startsWith('/') ? options.cacheDir : join(options.root, options.cacheDir)) : join(options.root, CACHE_DIR);
  const mode = options.write ? 'write' : 'dry-run';

  const selection = await loadSelection(options.root, { ...(options.area ? { area: options.area } : {}), ...(options.only ? { only: options.only } : {}) });

  let runStatus: RunStatus = 'completed';
  let stopReason: string | undefined;
  const outcomes = emptyOutcomes();
  const reasons: Record<string, number> = {};
  const reviewCategories: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const failures: BulkRunSummary['failures'] = [];
  const entries: BulkRunEntry[] = [];
  const written = { files: 0, norms: 0, changed: 0 };

  let resumed = 0;
  const stateEntries = new Map<string, BulkStateEntry>();

  const checkpoint = async (): Promise<void> => {
    if (!options.write) return;
    await writeBulkState(options.root, buildBulkState({ entries: [...stateEntries.values()], updatedAt: now().toISOString(), runId }));
  };

  const finish = async (): Promise<BulkRunResult> => {
    const endedAt = now();
    const state = buildBulkState({ entries: [...stateEntries.values()], updatedAt: endedAt.toISOString(), runId });
    const summary: BulkRunSummary = {
      schemaVersion: BULK_RUN_SCHEMA,
      runId,
      jurisdiction: TARGET_JURISDICTION,
      sourceSystem: SOURCE_SYSTEM,
      mode,
      runStatus,
      ...(stopReason ? { stopReason } : {}),
      baselineDate,
      parserVersion: PARSER_VERSION,
      transformerVersion: TRANSFORMER_VERSION,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, clock() - startedClock),
      options: {
        write: options.write,
        resume: options.resume,
        area: options.area ?? null,
        only: options.only ?? [],
        limit: options.limit ?? null,
        maxRuntimeMs: options.maxRuntimeMs ?? null,
        cacheDir: options.cacheDir ?? CACHE_DIR,
      },
      selection: { ...selection.totals, queued: selection.queue.length, processed: entries.length, resumed },
      outcomes,
      reviewCategories,
      reasons,
      warnings,
      failures,
      written,
      entries,
    };
    const reportPath = runReportPath(runId);
    const reportWritten = options.write ? await writeJsonAtomic(join(options.root, reportPath), summary) : false;
    return { summary, state, reportPath, reportWritten };
  };

  if (selection.problems.length > 0) {
    runStatus = 'aborted-systemic';
    stopReason = `Zustandsdateien widersprechen einander: ${selection.problems.slice(0, 3).join('; ')}${selection.problems.length > 3 ? ` … (+${selection.problems.length - 3})` : ''}`;
    log(`Lauf ${runId} startet nicht: ${stopReason}`);
    return finish();
  }

  /* ------------------------------------------------------------------ Zustand laden */
  // Jeder Zustandsteil prüft sich beim Lesen selbst. Scheitert einer, ist das kein Befund an einer
  // Norm, sondern der Boden, auf dem der ganze Lauf stünde: kontrollierter Abbruch, und die
  // beschädigte Datei bleibt unangetastet – sie ist der Beleg.
  let manifestByIdentity = new Map<string, ManifestEntry>();
  let registry = emptySlugRegistry();
  const reviewByIdentity = new Map<string, ReviewQueue['items']>();
  let institutions: Awaited<ReturnType<typeof readInstitutionRegistry>>;
  let existingSlugs = new Set<string>();
  try {
    const previousState = await readBulkState(options.root);
    for (const entry of previousState?.entries ?? []) stateEntries.set(entry.documentId, entry);
    const manifest = await readManifest(options.root);
    manifestByIdentity = new Map<string, ManifestEntry>(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
    registry = seedSlugRegistryFromManifest(await readSlugRegistry(options.root), manifest);
    const reviewQueue = await readReviewQueue(options.root);
    for (const item of reviewQueue.items) reviewByIdentity.set(item.sourceIdentity, [...(reviewByIdentity.get(item.sourceIdentity) ?? []), item]);
    institutions = await readInstitutionRegistry(options.root);
    existingSlugs = await listExistingSlugs(options.root);
  } catch (error) {
    const systemic = systemicReason(error);
    if (!systemic) throw error;
    runStatus = 'aborted-systemic';
    stopReason = systemic;
    log(`Lauf ${runId} startet nicht: ${stopReason}`);
    return finish();
  }

  // Jeder Checkpoint ist vollständig: Schon vor dem ersten Kandidaten steht je Dokument ein Eintrag –
  // der des Vorgängerlaufs oder „offen“. Sonst verschwiege die Zustandsdatei nach einem Abbruch alles,
  // wozu der Lauf noch nicht gekommen ist.
  for (const candidate of selection.queue) {
    if (!stateEntries.has(candidate.documentId)) stateEntries.set(candidate.documentId, { documentId: candidate.documentId, sourceArea: candidate.sourceArea, status: 'pending', attempts: 0 });
  }

  if (options.write) {
    for (const action of await recoverInterruptedNormWrites(options.root)) log(`Wiederherstellung: ${action}`);
    for (const directory of [join(options.root, IMPORT_DATA_DIR), join(options.root, AUDIT_DIR)]) {
      for (const removed of await removeStaleTempFiles(directory)) log(`Temp-Datei entfernt: ${removed}`);
    }
  }

  /* ------------------------------------------------------------------ Warteschlange */
  const queue: BulkCandidate[] = [];
  for (const candidate of selection.queue) {
    const state = stateEntries.get(candidate.documentId)!;
    if (options.resume && RESUMABLE_DONE.includes(state.status)) {
      resumed += 1;
      continue;
    }
    queue.push(candidate);
  }
  const budgeted = options.limit === undefined ? queue : queue.slice(0, options.limit);
  const truncated = options.limit !== undefined && queue.length > options.limit;
  if (budgeted.length === 0) runStatus = 'nothing-to-do';

  log(`Lauf ${runId} · ${mode} · Scope ${selection.totals.include} include (${selection.totals.exclude} exclude, ${selection.totals.scopeReview} review) · ${selection.totals.eligible} übernahmefähig · ${budgeted.length} in diesem Lauf${resumed > 0 ? ` (${resumed} übernommen aus dem Fortschritt)` : ''}`);

  /* ------------------------------------------------------------------ Verarbeitung */
  const recent: Array<{ failed: boolean; code?: string }> = [];
  let consecutiveFailures = 0;
  let index = 0;

  for (const candidate of budgeted) {
    if (options.maxRuntimeMs !== undefined && clock() - startedClock >= options.maxRuntimeMs) {
      runStatus = 'budget-exhausted';
      stopReason = `Laufzeitbudget von ${Math.round(options.maxRuntimeMs / 1000)} s erreicht; der nächste Lauf setzt mit --resume fort`;
      break;
    }
    index += 1;
    const state = stateEntries.get(candidate.documentId)!;
    state.status = 'processing';
    state.lastRunId = runId;
    await checkpoint();

    const itemStarted = clock();
    let outcome: Awaited<ReturnType<typeof processCandidate>>;
    try {
      outcome = await processCandidate({
        root: options.root,
        write: options.write,
        cacheDir,
        runId,
        baselineDate,
        candidate,
        registry,
        existingSlugs,
        institutions,
        reviewQueue: { ...emptyReviewQueue(), items: [...(reviewByIdentity.get(candidate.documentId) ?? [])] },
        ...(manifestByIdentity.has(candidate.documentId) ? { previous: manifestByIdentity.get(candidate.documentId)! } : {}),
        now,
      });
    } catch (error) {
      const systemic = systemicReason(error);
      if (systemic) {
        // Der Kandidat bleibt offen: Nach der Ursache soll er erneut versucht werden, nicht übersprungen.
        state.status = 'pending';
        state.attempts += 1;
        await checkpoint();
        runStatus = 'aborted-systemic';
        stopReason = `${candidate.documentId}: ${systemic}`;
        log(`[${index}/${budgeted.length}] ${candidate.sourceArea} ${candidate.documentId} ABBRUCH (systemisch) · ${systemic}`);
        break;
      }
      outcome = {
        result: 'failed',
        phase: 'parse',
        code: 'exception',
        message: (error as Error).message,
        reviewCategories: [],
        findings: [],
        reviewQueue: { ...emptyReviewQueue(), items: [] },
        written: [],
        changed: false,
      };
    }

    const durationMs = Math.max(0, clock() - itemStarted);
    state.attempts += 1;
    state.status = statusForResult(outcome.result);
    state.result = outcome.result;
    state.phase = outcome.phase;
    state.lastRunId = runId;
    if (outcome.targetSlug) state.targetSlug = outcome.targetSlug;
    else delete state.targetSlug;
    if (outcome.code) state.code = outcome.code;
    else delete state.code;
    if (outcome.message) state.message = outcome.message.slice(0, 400);
    else delete state.message;
    if (outcome.reviewCategories.length > 0) state.reviewCategories = outcome.reviewCategories;
    else delete state.reviewCategories;
    await checkpoint();

    if (outcome.entry) manifestByIdentity.set(candidate.documentId, outcome.entry);
    if (outcome.reviewQueue.items.length > 0) reviewByIdentity.set(candidate.documentId, [...outcome.reviewQueue.items]);
    else reviewByIdentity.delete(candidate.documentId);
    if (outcome.targetSlug) existingSlugs.add(outcome.targetSlug);

    outcomes[outcome.result] += 1;
    if (outcome.code) reasons[outcome.code] = (reasons[outcome.code] ?? 0) + 1;
    for (const category of outcome.reviewCategories) reviewCategories[category] = (reviewCategories[category] ?? 0) + 1;
    for (const code of new Set(outcome.findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.code))) warnings[code] = (warnings[code] ?? 0) + 1;
    written.files += outcome.written.length;
    if (outcome.changed) written.changed += 1;
    if (outcome.result === 'imported' || outcome.result === 'imported-with-warnings') written.norms += 1;
    const entry: BulkRunEntry = { documentId: candidate.documentId, sourceArea: candidate.sourceArea, phase: outcome.phase, result: outcome.result, durationMs };
    if (outcome.targetSlug) entry.targetSlug = outcome.targetSlug;
    if (outcome.code) entry.code = outcome.code;
    if (outcome.message) entry.message = outcome.message.slice(0, 400);
    if (outcome.reviewCategories.length > 0) entry.reviewCategories = outcome.reviewCategories;
    entries.push(entry);
    if (outcome.result === 'failed' && failures.length < 50) failures.push({ documentId: candidate.documentId, code: outcome.code ?? 'failed', message: outcome.message ?? 'fehlgeschlagen' });

    log(`[${index}/${budgeted.length}] ${candidate.sourceArea} ${candidate.documentId} ${outcome.phase} ${outcome.result}${outcome.targetSlug ? ` ${outcome.targetSlug}` : ''}${outcome.code ? ` (${outcome.code})` : ''} · ${durationMs} ms`);

    /* Systemische Fehlerbilder: viele Fehlschläge in Folge oder gehäuft derselbe Code. */
    const failed = outcome.result === 'failed';
    consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
    recent.push({ failed, ...(failed && outcome.code ? { code: outcome.code } : {}) });
    if (recent.length > limits.window) recent.shift();
    if (consecutiveFailures >= limits.maxConsecutiveFailures) {
      runStatus = 'aborted-systemic';
      stopReason = `${consecutiveFailures} Normen in Folge fehlgeschlagen – systemischer Fehler vermutet (Parser, Cache, Umgebung)`;
      break;
    }
    const counts = new Map<string, number>();
    for (const item of recent) if (item.failed && item.code) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (dominant && dominant[1] >= limits.maxSameCodeFailures) {
      runStatus = 'aborted-systemic';
      stopReason = `Fehlercode ${dominant[0]} in ${dominant[1]} der letzten ${recent.length} Normen – Parser oder Quellbestand prüfen`;
      break;
    }
  }

  if (runStatus === 'completed' && truncated) {
    runStatus = 'limit-reached';
    stopReason = `Auswahlbudget von ${options.limit} Kandidaten erreicht; ${queue.length - budgeted.length} bleiben offen`;
  }
  if (options.write) await writeSlugRegistry(options.root, registry);
  await checkpoint();
  log(`Lauf ${runId} beendet: ${runStatus}${stopReason ? ` – ${stopReason}` : ''} · verarbeitet ${entries.length}/${budgeted.length} · ${Math.round(Math.max(0, clock() - startedClock) / 1000)} s`);
  return finish();
}

/** Kurzfassung für die Konsole – die Zahlen, nach denen zuerst gefragt wird. */
export function bulkSummary(result: BulkRunResult): string[] {
  const { summary } = result;
  const importable = summary.outcomes.imported + summary.outcomes['imported-with-warnings'] + summary.outcomes['dry-run'] + summary.outcomes.unchanged;
  const lines = [
    `Bulk BAYWUE (${SOURCE_SYSTEM}), Stichtag ${summary.baselineDate} · Lauf ${summary.runId} · ${summary.mode}`,
    `  Auswahl: ${summary.selection.include} Kandidaten (Scope include), davon ${summary.selection.withBaselineDecision} klassifiziert und ${summary.selection.eligible} übernahmefähig`,
    `  Verarbeitet: ${summary.selection.processed} von ${summary.selection.queued}${summary.selection.resumed > 0 ? ` (${summary.selection.resumed} bereits erledigt)` : ''} · ${Math.round(summary.durationMs / 1000)} s`,
    `  Übernahme: ${importable} (${summary.mode === 'write' ? `${summary.outcomes.imported} neu, ${summary.outcomes['imported-with-warnings']} mit Warnungen, ${summary.outcomes.unchanged} unverändert` : `${summary.outcomes['dry-run']} würden übernommen`})`,
    `  Nicht übernommen: ${summary.outcomes.review} Review · ${summary.outcomes.failed} Fehler · ${summary.outcomes['not-at-baseline']} nicht am Stichtag · ${summary.outcomes['skipped-not-cached']} ohne Paket · ${summary.outcomes['skipped-unclassified']} ohne Stichtagsentscheidung${summary.outcomes['kept-existing'] > 0 ? ` · ${summary.outcomes['kept-existing']} Bestand behalten (Regression)` : ''}`,
  ];
  const reasons = Object.entries(summary.reasons).sort((left, right) => right[1] - left[1]);
  for (const [code, count] of reasons.slice(0, 12)) lines.push(`    ${String(count).padStart(5)}  ${code}`);
  if (reasons.length > 12) lines.push(`    … ${reasons.length - 12} weitere Gründe (siehe Laufbericht)`);
  const categories = Object.entries(summary.reviewCategories).sort((left, right) => right[1] - left[1]);
  if (categories.length > 0) lines.push(`  Review-Kategorien: ${categories.map(([category, count]) => `${category} ${count}`).join(' · ')}`);
  const warned = Object.entries(summary.warnings).sort((left, right) => right[1] - left[1]);
  if (warned.length > 0) lines.push(`  Warnungen (kein Hindernis): ${warned.slice(0, 6).map(([code, count]) => `${code} ${count}`).join(' · ')}`);
  if (summary.outcomes['skipped-unclassified'] > 0) {
    lines.push(`  Hinweis: ${summary.outcomes['skipped-unclassified']} Kandidaten haben keine Stichtagsentscheidung. Der Cache ist seit der letzten Klassifikation gewachsen – zuerst „baseline --write“ erneut ausführen.`);
  }
  if (summary.stopReason) lines.push(`  Halt (${summary.runStatus}): ${summary.stopReason}`);
  for (const failure of summary.failures.slice(0, 5)) lines.push(`  Fehler ${failure.documentId}: ${failure.code} – ${failure.message.slice(0, 160)}`);
  lines.push(summary.mode === 'write' ? `  Geschrieben: ${summary.written.norms} Normen, ${summary.written.files} Dateien berührt, ${summary.written.changed} Kandidaten mit Änderung · Laufbericht ${result.reportPath}` : `  Dry-run: nichts geschrieben (Laufbericht wäre ${result.reportPath}). Mit --write übernehmen.`);
  return lines;
}

/** Für den Aufrufer: Hat der Lauf einen Zustand hinterlassen, der Aufmerksamkeit verlangt? */
export function bulkExitCode(result: BulkRunResult): number {
  if (result.summary.runStatus === 'aborted-systemic') return 2;
  if (result.summary.outcomes.failed > 0 || result.summary.outcomes['kept-existing'] > 0) return 1;
  return 0;
}

export { BULK_STATE_PATH } from './state.ts';
