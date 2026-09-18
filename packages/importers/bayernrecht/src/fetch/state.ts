/**
 * Fortschrittszustand der Beschaffung: `data/imports/bayernrecht/fetch-state.json`.
 *
 * Der Zustand ist **kein Bestand**: Er sagt nur, welches enumerierte Dokument im lokalen Cache liegt,
 * mit welchem SHA-256 und wann es geholt wurde. Keine Norm, kein Content, kein Manifest entsteht hier;
 * das Parsen macht ein anderer Strang.
 *
 * Drei Eigenschaften, auf die sich der Lauf verlässt:
 *
 *   **Vollständig.** Es steht je enumeriertem Dokument genau ein Eintrag darin – auch für die, die
 *   dieser Lauf nicht angefasst hat (`skipped`). Sonst ließe sich aus der Datei nicht ablesen, was noch
 *   offen ist, und ein Wiederanlauf müsste raten.
 *
 *   **Deterministisch.** Einträge sind nach Bereich und Dokument-ID sortiert, der Fingerabdruck deckt
 *   den fachlichen Inhalt ab (ohne Laufzeitmetadaten). Ändert ein Lauf nichts, bleibt die Datei Byte
 *   für Byte gleich – auch `updatedAt`, das dann vom Vorgänger übernommen wird.
 *
 *   **Checkpointfähig.** Geschrieben wird nach jedem Dokument, atomar (`writeFileAtomic`). Ein Abbruch
 *   hinterlässt die alte oder die neue Datei, nie eine halbe.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { BASELINE_DATE, IMPORT_DATA_DIR, type SourceArea } from '../common/constants.ts';
import { compareSourceIdentity } from '../common/paths.ts';

export const FETCH_STATE_SCHEMA = 'bayernrecht-fetch-state/1' as const;
export const FETCH_STATE_PATH = `${IMPORT_DATA_DIR}/fetch-state.json`;

/**
 * `cached`  – die Bytes liegen im Cache (aus diesem oder einem früheren Lauf);
 * `failed`  – der Abruf wurde versucht und ist gescheitert (mit Ursache, ggf. HTTP-Status);
 * `skipped` – in diesem Lauf nicht abgerufen (Auswahl oder Budget) und damit weiter offen.
 */
export const FETCH_STATUSES = ['cached', 'failed', 'skipped'] as const;
export type FetchStatus = (typeof FETCH_STATUSES)[number];

export interface FetchStateEntry {
  documentId: string;
  sourceArea: SourceArea;
  /** Adresse des XML-Exportpakets; unverändert aus der Enumeration übernommen. */
  url: string;
  status: FetchStatus;
  sha256?: string;
  byteLength?: number;
  contentType?: string;
  retrievedAt?: string;
  /** Nur bei Fehlern: HTTP-Status, soweit die Antwort einen hatte. */
  httpStatus?: number;
  /** Nur bei Fehlern: Fehlertext, so wie er dem Menschen die Ursache nennt. */
  error?: string;
  /** Die Quelle liefert andere Bytes als der Cacheeintrag – siehe `findings`. */
  sourceChanged?: boolean;
}

/** Befundarten, die nicht ein Dokument scheitern lassen, sondern eine Aussage über die Quelle sind. */
export const FETCH_FINDING_KINDS = ['source-changed', 'cache-corrupt'] as const;
export type FetchFindingKind = (typeof FETCH_FINDING_KINDS)[number];

export interface FetchFinding {
  kind: FetchFindingKind;
  documentId: string;
  url: string;
  detail: string;
  /** `source-changed`: beide Hashes, damit die Abweichung nachprüfbar bleibt. */
  cachedSha256?: string;
  fetchedSha256?: string;
  cachedByteLength?: number;
  fetchedByteLength?: number;
  detectedAt: string;
}

export interface FetchStateTotals {
  enumerated: number;
  cached: number;
  failed: number;
  skipped: number;
  /** Gesamtgröße aller im Cache liegenden Pakete in Bytes. */
  byteLength: number;
}

export interface FetchStateFile {
  schemaVersion: typeof FETCH_STATE_SCHEMA;
  baselineDate: string;
  /** Laufzeitmetadatum; ändert sich nur, wenn sich der fachliche Inhalt ändert. */
  updatedAt: string;
  contentFingerprint: string;
  totals: FetchStateTotals;
  findings: FetchFinding[];
  entries: FetchStateEntry[];
}

/** Deterministische Ordnung: Bereich, dann Dokument-ID (Ziffernfolgen numerisch). */
export function compareFetchEntries(left: FetchStateEntry, right: FetchStateEntry): number {
  if (left.sourceArea !== right.sourceArea) return left.sourceArea < right.sourceArea ? -1 : 1;
  return compareSourceIdentity(left.documentId, right.documentId);
}

export function sortFetchEntries(entries: readonly FetchStateEntry[]): FetchStateEntry[] {
  return [...entries].sort(compareFetchEntries);
}

export function fetchStateTotals(entries: readonly FetchStateEntry[]): FetchStateTotals {
  const totals: FetchStateTotals = { enumerated: entries.length, cached: 0, failed: 0, skipped: 0, byteLength: 0 };
  for (const entry of entries) {
    if (entry.status === 'cached') {
      totals.cached += 1;
      totals.byteLength += entry.byteLength ?? 0;
    } else if (entry.status === 'failed') totals.failed += 1;
    else totals.skipped += 1;
  }
  return totals;
}

/** Fingerabdruck des fachlichen Inhalts (ohne `updatedAt`, ohne Fingerabdruck selbst). */
export function fetchStateFingerprint(file: Pick<FetchStateFile, 'baselineDate' | 'entries' | 'findings'>): string {
  return createHash('sha256').update(stableStringify({ baselineDate: file.baselineDate, entries: file.entries, findings: file.findings })).digest('hex');
}

export interface BuildFetchStateInput {
  entries: readonly FetchStateEntry[];
  findings: readonly FetchFinding[];
  updatedAt: string;
  baselineDate?: string;
  /** Vorgängerstand: Bleibt der Inhalt gleich, wird dessen `updatedAt` übernommen (Byte-Gleichheit). */
  previous?: FetchStateFile | undefined;
}

export function buildFetchState(input: BuildFetchStateInput): FetchStateFile {
  const entries = sortFetchEntries(input.entries);
  const findings = [...input.findings].sort((left, right) => (left.documentId === right.documentId ? left.kind.localeCompare(right.kind) : compareSourceIdentity(left.documentId, right.documentId)));
  const baselineDate = input.baselineDate ?? BASELINE_DATE;
  const contentFingerprint = fetchStateFingerprint({ baselineDate, entries, findings });
  const unchanged = input.previous?.contentFingerprint === contentFingerprint;
  return {
    schemaVersion: FETCH_STATE_SCHEMA,
    baselineDate,
    updatedAt: unchanged && input.previous ? input.previous.updatedAt : input.updatedAt,
    contentFingerprint,
    totals: fetchStateTotals(entries),
    findings,
    entries,
  };
}

/**
 * Ein Eintrag je Zeile: bei 2 413 Dokumenten bleibt die Datei zeilenweise diffbar – ein Statuswechsel
 * ändert genau eine Zeile (dieselbe Form wie die Enumeration).
 */
export function fetchStateJsonText(file: FetchStateFile): string {
  const { entries, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "entries": [\n${entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`;
}

export async function readFetchState(root: string): Promise<FetchStateFile | undefined> {
  const file = await readJsonFile<FetchStateFile>(join(root, FETCH_STATE_PATH));
  if (!file) return undefined;
  if (file.schemaVersion !== FETCH_STATE_SCHEMA || !Array.isArray(file.entries)) throw new Error(`${FETCH_STATE_PATH}: kein gültiger Fortschrittszustand`);
  return file;
}

/** Schreibt atomar; unveränderter Inhalt wird nicht neu geschrieben. */
export async function writeFetchState(root: string, file: FetchStateFile): Promise<boolean> {
  return writeFileAtomic(join(root, FETCH_STATE_PATH), fetchStateJsonText(file));
}
