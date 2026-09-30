/**
 * Schema-Dialekt des D1-Stores: dieselbe Lese- und Suchlogik (`d1-store.ts`) über zwei Tabellenlayouts –
 *
 *   - `landesrecht`: die eigene Projektion (`data/d1/0001_landesrecht.sql`, eine Datenbank je Jurisdiktion mit
 *     `jurisdiction`-Spalte, `simulation_valid_from/to`, `temporal_kind`, `search_document_json`);
 *   - `ostrecht`: die OstRecht-Projektion `ostrecht-recht` (Migrationen 0001–0008 von OstRecht: ein Land, `valid_from/to`,
 *     `law_search_documents`, OstRecht-JSON in `meta_json`/`history_json`/`version_json`/`publication_json`), die der
 *     Landesrecht-Worker direkt und nur lesend nutzt (`ostrecht-d1-store.ts`).
 *
 * Der Dialekt kapselt ausschließlich Spaltennamen, Filterausdrücke und die Übersetzung gelesener JSON-Zeilen in das
 * kanonische Lesemodell; Kandidatenwahl, Ranking und Seitenzuschnitt bleiben gemeinsam.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord, Publication } from '@landesrecht/legal-core/lib/schema.ts';
import type { SearchDocument } from '@landesrecht/search/index.ts';

import type { NormSummary, StoreStats } from './store.ts';

export interface SqlFragment {
  sql: string;
  params: unknown[];
}

export interface DialectDocumentRow {
  norm_id: string;
  version_id: string;
  search_document_json: string;
  valid_from?: string | null;
  valid_to?: string | null;
  /** Klassifikation gegenüber dem Ausgangsrechtsstand aus `law_norms` bzw. dem Dialektausdruck (Trefferkennzeichnung). */
  simulation_change_kind?: string | null;
  last_simulation_change_date?: string | null;
}

export interface DialectRecordInput {
  id: string;
  meta: Record<string, unknown>;
  history: Record<string, unknown>;
  /** Fassungen mit (leerem oder geladenem) Körper, in Geltungsreihenfolge. */
  versions: Array<Record<string, unknown>>;
  /** Zeile der abgeleiteten Daten (`derivedQuery`), falls der Dialekt eine abfragt. */
  derived?: Record<string, unknown> | null;
}

export interface DialectCounts {
  norm_count: number;
  version_count: number;
}

export interface D1SchemaDialect {
  readonly id: 'landesrecht' | 'ostrecht';
  normId(jurisdiction: JurisdictionId, slug: string): string;
  /** Eingrenzung auf die Jurisdiktion auf Normebene (Alias `n`). */
  normScope: SqlFragment;
  /** Zusätzliche Eingrenzung auf Fassungsebene (Aliasse `v` und `n`, ohne Parameter), z. B. Baseline-Regel. */
  versionScope?: string;
  /** Eingrenzung auf die Jurisdiktion in `law_publications`. */
  publicationScope: SqlFragment;
  /** Spaltenliste einer Übersichtszeile (Alias `n`); `summaryParams` sind ihre gebundenen Werte. */
  summaryColumns: string;
  summaryParams: unknown[];
  /** Sortierschlüssel der Normliste (Alias `n`). */
  sortKey: string;
  /** Anfangsbuchstabe der Norm (A–Z oder `#`), Ausdruck über Alias `n`. */
  indexLetter: string;
  /** Klassifikation gegenüber dem Ausgangsrechtsstand (`baseline-unchanged` | `baseline-changed` | `simulation-new`), Ausdruck über Alias `n`. */
  simulationChangeKind: string;
  /** Jüngste Simulationsänderung (ISO oder NULL), Ausdruck über Alias `n`. */
  lastSimulationChangeDate: string;
  /** Geltungsspalten der Fassungstabelle (Alias `v`). */
  validFrom: string;
  validTo: string;
  /** SQL-Ausdruck (0/1), ob die Fassung `v` am Stichtag gilt. */
  currentFlag: string;
  /** Filter auf die zeitliche Art einer Fassung (`current`, `future`, `historical`). */
  temporalKind(kind: string): SqlFragment;
  /** Ausdruck der laufenden Nummer einer Sucheinheit in `law_search_units` (Alias der Tabelle). */
  unitIndex(alias: string): string;
  /** Abfrage der Suchdokumente einer Normkennungsliste (Platzhalter für die Kennungen). */
  documentQuery(placeholders: string): string;
  adaptDocument(row: DialectDocumentRow): Omit<SearchDocument, 'units'>;
  /** Abfrage abgeleiteter Daten einer Norm (ein Platzhalter: Normkennung); optional. */
  derivedQuery?: string;
  /** Übersetzt gelesene Zeilen in einen validierten Datensatz; `null`, wenn die Norm nicht zum Bestand gehört. */
  adaptRecord(input: DialectRecordInput): NormRecord | null;
  /** Welche Fassung am Stichtag gilt (Körperauswahl `bodies: 'current'`). */
  currentVersionId(record: NormRecord, stored: string): string;
  adaptSummary(summary: NormSummary): NormSummary;
  /** Zählabfrage (Spalten `norm_count`, `version_count`) statt gespeicherter Zähler; optional. */
  statsQuery?: string;
  stats(meta: ReadonlyMap<string, string>, counts: DialectCounts | null): StoreStats;
  /** Abbildung eines Landesrecht-Metaschlüssels auf den Schlüssel des Dialekts. */
  runtimeMetaKey(key: string): string;
  adaptPublication(json: unknown, context: string): Publication;
}
