/**
 * Länderübergreifende Sicht auf Simulationsänderungen aus den Stores: Zählwerte und Listen der in der Simulation
 * geänderten bzw. neu erlassenen Vorschriften, jüngste Änderung zuerst. Nur veröffentlichter Rechtsbestand – keine
 * Prüf- oder Quellenfälle. Eine lokal nicht verfügbare Jurisdiktion wird übergangen.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormType, Publication } from '@landesrecht/legal-core/lib/schema.ts';
import type { SimulationChangeKind } from '@landesrecht/legal-core/lib/simulation-change.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';
import type { NormFacets, NormSummary } from '@landesrecht/runtime/store.ts';

export interface ChangeQuery {
  jurisdictions?: readonly JurisdictionId[];
  changeKind: SimulationChangeKind;
  types?: readonly NormType[];
  /** Änderungsvorschriften (Änderungsgesetze) ausblenden – sie sind Träger der Änderung, nicht ihr Gegenstand. */
  excludeAmendments?: boolean;
  /** Nur bereits wirksame bzw. erst künftig wirksame Änderungen; ohne Filter beide. */
  timing?: 'effective' | 'future';
  offset?: number;
  limit: number;
}

const byChange = (left: NormSummary, right: NormSummary): number => (right.lastSimulationChangeDate ?? '').localeCompare(left.lastSimulationChangeDate ?? '') || left.title.localeCompare(right.title, 'de') || left.jurisdiction.localeCompare(right.jurisdiction);

function availableJurisdictions(registry: StoreRegistry, wanted?: readonly JurisdictionId[]): JurisdictionId[] {
  return (wanted && wanted.length > 0 ? [...wanted] : [...JURISDICTION_IDS]).filter((jurisdiction) => registry.has(jurisdiction));
}

/** Facetten je Land (parallel); fehlende Länder liefern leere Facetten. */
export async function changeFacets(registry: StoreRegistry, query: Pick<ChangeQuery, 'jurisdictions' | 'types' | 'changeKind'>): Promise<Map<JurisdictionId, NormFacets>> {
  const result = new Map<JurisdictionId, NormFacets>();
  await Promise.all(availableJurisdictions(registry, query.jurisdictions).map(async (jurisdiction) => {
    result.set(jurisdiction, await registry.get(jurisdiction).countNormFacets({ ...(query.types ? { types: query.types } : {}), changeKind: query.changeKind }));
  }));
  return result;
}

export function sumFacets(facets: ReadonlyMap<JurisdictionId, NormFacets>): NormFacets {
  const total: NormFacets = { total: 0, byType: [], byChangeKind: { 'baseline-unchanged': 0, 'baseline-changed': 0, 'simulation-new': 0 }, byLetter: [] };
  const byType = new Map<NormType, number>();
  for (const entry of facets.values()) {
    total.total += entry.total;
    for (const kind of ['baseline-unchanged', 'baseline-changed', 'simulation-new'] as const) total.byChangeKind[kind] += entry.byChangeKind[kind];
    for (const row of entry.byType) byType.set(row.type, (byType.get(row.type) ?? 0) + row.count);
  }
  total.byType = [...byType.entries()].map(([type, count]) => ({ type, count })).sort((left, right) => left.type.localeCompare(right.type));
  return total;
}

/** Seite einer länderübergreifenden Liste: jeder Store liefert bis `offset + limit`, die Zusammenführung schneidet die Seite. */
export async function listChanges(registry: StoreRegistry, query: ChangeQuery): Promise<NormSummary[]> {
  const offset = query.offset ?? 0;
  // Zeitfilter vor Pagination: auch eine Norm mit jüngster Änderung in der Zukunft kann
  // eine ältere, bereits wirksame Änderung haben. Nur dafür werden Fassungsmetadaten gelesen.
  const pages = await Promise.all(availableJurisdictions(registry, query.jurisdictions).map(async (jurisdiction) => {
    const store = registry.get(jurisdiction);
    const rows: NormSummary[] = [];
    const limit = query.timing ? 200 : Math.min(offset + query.limit + (query.excludeAmendments ? 50 : 0), 5000);
    for (let start = 0; ; start += limit) {
      const page = await store.listNormSummaries({ changeKind: query.changeKind, ...(query.types ? { types: query.types } : {}), sort: 'change', offset: start, limit });
      rows.push(...page);
      if (!query.timing || page.length < limit) break;
    }
    const selected: NormSummary[] = [];
    for (const norm of rows) {
      if (query.excludeAmendments && norm.type === 'aenderungsvorschrift') continue;
      if (!query.timing) { selected.push(norm); continue; }
      if (norm.status === 'pending-effective') continue;
      const latest = norm.lastSimulationChangeDate;
      if (!latest) continue;
      if (latest <= EDITORIAL_REFERENCE_DATE) {
        if (query.timing === 'effective') selected.push(norm);
        continue;
      }
      const record = await store.getNorm(norm.slug, 'none');
      if (!record) throw new Error(`Änderungsmetadaten fehlen: ${jurisdiction}:${norm.slug}`);
      const dates = [...new Set([
        ...record.versions.map(version => version.simulationValidFrom),
        ...record.history.entries.filter(entry => entry.type === 'repeal').map(entry => entry.date),
        ...(record.meta.expiryDate ? [record.meta.expiryDate] : []),
      ])].filter(date => date > SIMULATION_BASELINE_DATE).sort();
      const date = query.timing === 'effective'
        ? dates.filter(date => date <= EDITORIAL_REFERENCE_DATE).at(-1)
        : dates.find(date => date > EDITORIAL_REFERENCE_DATE);
      if (date) selected.push({ ...norm, lastSimulationChangeDate: date });
    }
    return selected;
  }));
  const sorted = pages.flat().sort(byChange);
  if (query.timing === 'future') sorted.sort((a, b) => a.lastSimulationChangeDate!.localeCompare(b.lastSimulationChangeDate!) || byChange(a, b));
  return sorted.slice(offset, offset + query.limit);
}

/** Jüngste Verkündungsblatt-Ausgaben über alle verfügbaren Länder. */
export async function latestPublications(registry: StoreRegistry, limit: number): Promise<Array<Publication & { jurisdiction: JurisdictionId }>> {
  const lists = await Promise.all(availableJurisdictions(registry).map((jurisdiction) => registry.get(jurisdiction).listPublications({ limit })));
  return lists.flat().sort((left, right) => right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug)).slice(0, limit);
}
