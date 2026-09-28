/**
 * Datenzugriff der Laufzeit. Ein NormStore bedient genau eine Jurisdiktion; die Registry
 * (registry.ts) bündelt die Stores aller Jurisdiktionen und führt jurisdiktionsübergreifende
 * Suchen zusammen. Die Anwendung nimmt nie an, dass alle Normen in einer Datenbank liegen.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord, NormStatus, NormType, Publication } from '@landesrecht/legal-core/lib/schema.ts';
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

export interface PublicationQuery {
  /** Höchstens so viele Ausgaben (jüngste zuerst). */
  limit?: number;
}

/** Umfang und Bereitschaft der Suche eines Stores (Volltextindex je Fassung, fehlende geltende Fassungen). */
export type { SearchCoverage } from './ostrecht-freshness.ts';

export interface NormStore {
  readonly kind: 'd1' | 'files';
  readonly jurisdiction: JurisdictionId;
  listNormSummaries(query?: NormSummaryQuery): Promise<NormSummary[]>;
  /** Aggregierte Zählung je Typ über alle Normen (Typfilter und Länderseite; nie aus einer begrenzten Liste). */
  countNormsByType(): Promise<NormTypeCount[]>;
  getNormSummary(slug: string): Promise<NormSummary | null>;
  /**
   * Übersichten mehrerer Normen in wenigen Abfragen (unbekannte Slugs fehlen im Ergebnis). Fehlt die Methode, fragt
   * `getNormSummaries` einzeln mit begrenzter Parallelität ab.
   */
  getNormSummaries?(slugs: readonly string[]): Promise<NormSummary[]>;
  /** Vollständiger Datensatz; `bodies` steuert, welche Fassungen ihren Körper tragen. */
  getNorm(slug: string, bodies?: BodySelection): Promise<NormRecord | null>;
  search(state: SearchState): Promise<SearchResultPage>;
  getStats(): Promise<StoreStats>;
  getRuntimeMeta(key: string): Promise<string | null>;
  /** Verkündungsblatt-Ausgaben der Jurisdiktion, jüngste zuerst (nur law_publications; lädt keine Normen). */
  listPublications(query?: PublicationQuery): Promise<Publication[]>;
  getPublication(slug: string): Promise<Publication | null>;
  /**
   * Suchabdeckung des Stores; fehlt die Methode, indexiert der Store alle Fassungen vollständig
   * (`getStoreSearchCoverage`). Ost (OstRecht-D1) meldet hier den Freshness-Befund.
   */
  getSearchCoverage?(): Promise<import('./ostrecht-freshness.ts').SearchCoverage>;
}

/** Übersichten vieler Normen: gebündelt, wenn der Store es kann; sonst einzeln mit höchstens acht parallelen Abfragen. */
export async function getNormSummaries(store: NormStore, slugs: readonly string[]): Promise<Map<string, NormSummary>> {
  const unique = [...new Set(slugs)];
  const found = new Map<string, NormSummary>();
  if (store.getNormSummaries) {
    for (const summary of await store.getNormSummaries(unique)) found.set(summary.slug, summary);
    return found;
  }
  const CONCURRENCY = 8;
  for (let start = 0; start < unique.length; start += CONCURRENCY) {
    const chunk = unique.slice(start, start + CONCURRENCY);
    const summaries = await Promise.all(chunk.map((slug) => store.getNormSummary(slug)));
    for (const summary of summaries) if (summary) found.set(summary.slug, summary);
  }
  return found;
}

export async function getStoreSearchCoverage(store: NormStore): Promise<import('./ostrecht-freshness.ts').SearchCoverage> {
  if (store.getSearchCoverage) return store.getSearchCoverage();
  return { readiness: 'ready', fullText: 'all-versions', historicalVersions: 'navigable', staleNormCount: 0 };
}

/** Bestimmt anhand von `bodies`, welche Fassungen mit Körper geladen werden. */
export function selectVersionIds(record: Pick<NormRecord, 'versions'>, currentVersionId: string, bodies: BodySelection): Set<string> {
  if (bodies === 'none') return new Set();
  if (bodies === 'all') return new Set(record.versions.map((version) => version.versionId));
  if (bodies === 'current') return new Set([currentVersionId]);
  return new Set(bodies);
}
