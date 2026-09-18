/**
 * Fortschrittszustand des Bulk-Laufs (`data/imports/bayernrecht/bulk-state.json`) – und das
 * Vokabular, mit dem der Lauf über sich selbst redet.
 *
 * **Warum eine eigene Datei und nicht die Enumeration.** Der West-Adapter führt seinen Fortschritt in
 * der Enumeration; hier geht das nicht, und das ist kein Mangel: Die bayerische Enumeration trägt
 * einen Fixpunkt-Fingerabdruck über ihren fachlichen Inhalt (`enumerate` läuft bis zur Konvergenz).
 * Ein Laufstatus ist keine Eigenschaft der Quelle. Stünde er dort, bräche jeder Import den
 * Fingerabdruck der Enumeration, und der Rebuild müsste den eigenen Fortschritt wieder einsammeln.
 *
 * **Checkpoint nach jedem Kandidaten, nicht am Ende.** Nach jeder Norm ist die Datei atomar
 * geschrieben; ein harter Abbruch hinterlässt höchstens einen Eintrag im Status `processing`, den
 * `--resume` erneut verarbeitet. Die Reihenfolge der Schreibvorgänge je Norm steht in `norm.ts`.
 *
 * Ein Eintrag je Zeile: bei mehreren Tausend Kandidaten bleibt der Diff zeilenstabil – ein
 * Statuswechsel ändert genau eine Zeile.
 */
import { join } from 'node:path';

import { CorruptStateError, readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_DATE, IMPORT_DATA_DIR, SOURCE_AREAS, type SourceArea } from '../common/constants.ts';
import { compareSourceIdentity } from '../common/paths.ts';

export const BULK_STATE_SCHEMA = 'bayernrecht-bulk-state/1' as const;
export const BULK_STATE_PATH = join(IMPORT_DATA_DIR, 'bulk-state.json');

/**
 * Stufe des Weges, auf der ein Kandidat zuletzt stand. Sie beantwortet im Laufbericht die Frage
 * „woran hing es?“, ohne dass man die Meldung lesen muss.
 */
export const BULK_PHASES = ['auswahl', 'paket', 'parse', 'ueberleitung', 'pruefung', 'schreiben'] as const;
export type BulkPhase = (typeof BULK_PHASES)[number];

/**
 * Ergebnis eines Kandidaten – genau eines je Kandidat und Lauf.
 *
 *   imported / imported-with-warnings  übernommen (Schreiblauf); der Bestand hat eine neue Norm
 *   unchanged                          übernommen, aber nichts geschrieben: Der Bestand war schon so
 *   dry-run                            wäre übernommen worden; ohne `--write` entsteht nichts
 *   kept-existing                      Reimport ergäbe ein schlechteres Ergebnis – Bestand bleibt
 *   review                             nicht übernommen, als Review-Fall geführt
 *   failed                             normlokaler Fehler; der Lauf geht weiter
 *   not-at-baseline                    galt am Stichtag nicht (kein Fehler, kein Review)
 *   skipped-not-cached                 kein Exportpaket im Cache (Beschaffung, nicht Import)
 *   skipped-unclassified               keine Stichtagsentscheidung – `baseline` erneut ausführen
 */
export const BULK_RESULTS = [
  'imported',
  'imported-with-warnings',
  'unchanged',
  'dry-run',
  'kept-existing',
  'review',
  'failed',
  'not-at-baseline',
  'skipped-not-cached',
  'skipped-unclassified',
] as const;
export type BulkResult = (typeof BULK_RESULTS)[number];

export const BULK_ENTRY_STATUSES = ['pending', 'processing', 'done', 'review', 'failed', 'skipped'] as const;
export type BulkEntryStatus = (typeof BULK_ENTRY_STATUSES)[number];

/** Ergebnis → Zustand des Eintrags. `--resume` nimmt nur `pending` und `processing` wieder auf. */
export function statusForResult(result: BulkResult): BulkEntryStatus {
  switch (result) {
    case 'imported':
    case 'imported-with-warnings':
    case 'unchanged':
    case 'dry-run':
    case 'not-at-baseline':
      return 'done';
    case 'review':
    case 'kept-existing':
      return 'review';
    case 'failed':
      return 'failed';
    default:
      return 'skipped';
  }
}

export interface BulkStateEntry {
  documentId: string;
  sourceArea: SourceArea;
  status: BulkEntryStatus;
  result?: BulkResult;
  phase?: BulkPhase;
  targetSlug?: string;
  /** Maschinenlesbarer Grund des Ergebnisses (Befundcode, Ausschlussgrund). */
  code?: string;
  message?: string;
  reviewCategories?: string[];
  attempts: number;
  lastRunId?: string;
}

export interface BulkStateFile {
  schemaVersion: typeof BULK_STATE_SCHEMA;
  baselineDate: string;
  updatedAt: string;
  lastRunId?: string;
  totals: Record<BulkEntryStatus, number>;
  entries: BulkStateEntry[];
}

export function emptyBulkState(updatedAt: string): BulkStateFile {
  return { schemaVersion: BULK_STATE_SCHEMA, baselineDate: BASELINE_DATE, updatedAt, totals: statusTotals([]), entries: [] };
}

export function statusTotals(entries: readonly BulkStateEntry[]): Record<BulkEntryStatus, number> {
  const totals = Object.fromEntries(BULK_ENTRY_STATUSES.map((status) => [status, 0])) as Record<BulkEntryStatus, number>;
  for (const entry of entries) totals[entry.status] += 1;
  return totals;
}

const areaOrder = (area: SourceArea): number => SOURCE_AREAS.indexOf(area);

export function sortBulkEntries(entries: readonly BulkStateEntry[]): BulkStateEntry[] {
  return [...entries].sort((left, right) => areaOrder(left.sourceArea) - areaOrder(right.sourceArea) || compareSourceIdentity(left.documentId, right.documentId));
}

export function buildBulkState(input: { entries: readonly BulkStateEntry[]; updatedAt: string; runId?: string }): BulkStateFile {
  const entries = sortBulkEntries(input.entries);
  return {
    schemaVersion: BULK_STATE_SCHEMA,
    baselineDate: BASELINE_DATE,
    updatedAt: input.updatedAt,
    ...(input.runId ? { lastRunId: input.runId } : {}),
    totals: statusTotals(entries),
    entries,
  };
}

/** Beschädigte oder fremde Zustandsdatei ist ein systemischer Fehler – nichts wird stillschweigend verworfen. */
export async function readBulkState(root: string): Promise<BulkStateFile | undefined> {
  const file = await readJsonFile<BulkStateFile>(join(root, BULK_STATE_PATH));
  if (!file) return undefined;
  if (file.schemaVersion !== BULK_STATE_SCHEMA) throw new CorruptStateError(BULK_STATE_PATH, `unbekannte Schemaversion ${String(file.schemaVersion)}`);
  if (!Array.isArray(file.entries)) throw new CorruptStateError(BULK_STATE_PATH, 'entries fehlt');
  if (file.baselineDate !== BASELINE_DATE) throw new CorruptStateError(BULK_STATE_PATH, `Stichtag ${String(file.baselineDate)} weicht von ${BASELINE_DATE} ab`);
  for (const entry of file.entries) {
    if (typeof entry?.documentId !== 'string' || entry.documentId === '') throw new CorruptStateError(BULK_STATE_PATH, 'Eintrag ohne documentId');
    if (!(BULK_ENTRY_STATUSES as readonly string[]).includes(entry.status)) throw new CorruptStateError(BULK_STATE_PATH, `${entry.documentId}: unbekannter Status ${String(entry.status)}`);
    if (!(SOURCE_AREAS as readonly string[]).includes(entry.sourceArea)) throw new CorruptStateError(BULK_STATE_PATH, `${entry.documentId}: unbekannter Bereich ${String(entry.sourceArea)}`);
  }
  return file;
}

/** Ein Eintrag je Zeile (wie Enumeration und Korpus): kompakt und zeilenweise diffbar. */
export function bulkStateJsonText(file: BulkStateFile): string {
  const { entries, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "entries": [\n${entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`;
}

export async function writeBulkState(root: string, file: BulkStateFile): Promise<boolean> {
  return writeFileAtomic(join(root, BULK_STATE_PATH), bulkStateJsonText(file));
}
