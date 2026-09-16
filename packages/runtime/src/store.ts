/**
 * Datenzugriff der Laufzeit. Ein NormStore bedient genau eine Jurisdiktion; die Registry
 * (registry.ts) bündelt die Stores aller Jurisdiktionen und führt jurisdiktionsübergreifende
 * Suchen zusammen. Die Anwendung nimmt nie an, dass alle Normen in einer Datenbank liegen.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord, NormStatus, NormType } from '@landesrecht/legal-core/lib/schema.ts';
import type { SearchResultPage, SearchState } from '@landesrecht/search/index.ts';

export type BodySelection = 'none' | 'current' | 'all' | string[];

export interface NormSummary {
  jurisdiction: JurisdictionId;
  slug: string;
  title: string;
  shortTitle: string;
  abbr?: string;
  type: NormType;
  status: NormStatus;
  currentVersionId: string;
  currentValidFrom: string;
  versionCount: number;
  lastChangeDate: string | null;
  subjects: string[];
  url: string;
}

export interface NormSummaryQuery {
  type?: NormType;
  status?: NormStatus;
  subject?: string;
  limit?: number;
}

/** Anzahl der Normen je Normtyp über den gesamten Bestand der Jurisdiktion (unabhängig von Listenlimits). */
export interface NormTypeCount {
  type: NormType;
  count: number;
}

export interface StoreStats {
  normCount: number;
  versionCount: number;
  projectedAt: string | null;
  projectionFingerprint: string | null;
}

export interface NormStore {
  readonly kind: 'd1' | 'files';
  readonly jurisdiction: JurisdictionId;
  listNormSummaries(query?: NormSummaryQuery): Promise<NormSummary[]>;
  /** Aggregierte Zählung je Typ über alle Normen (Typfilter und Länderseite; nie aus einer begrenzten Liste). */
  countNormsByType(): Promise<NormTypeCount[]>;
  getNormSummary(slug: string): Promise<NormSummary | null>;
  /** Vollständiger Datensatz; `bodies` steuert, welche Fassungen ihren Körper tragen. */
  getNorm(slug: string, bodies?: BodySelection): Promise<NormRecord | null>;
  search(state: SearchState): Promise<SearchResultPage>;
  getStats(): Promise<StoreStats>;
  getRuntimeMeta(key: string): Promise<string | null>;
}

/** Bestimmt anhand von `bodies`, welche Fassungen mit Körper geladen werden. */
export function selectVersionIds(record: Pick<NormRecord, 'versions'>, currentVersionId: string, bodies: BodySelection): Set<string> {
  if (bodies === 'none') return new Set();
  if (bodies === 'all') return new Set(record.versions.map((version) => version.versionId));
  if (bodies === 'current') return new Set([currentVersionId]);
  return new Set(bodies);
}
