import { SUBJECT_GROUPS } from '@landesrecht/legal-core/config/subjects.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getNormSortKey } from '@landesrecht/legal-core/lib/identity.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';
import type { NormFacets, NormFacetQuery } from '@landesrecht/runtime/store.ts';
import type { SubjectCoverage } from '@landesrecht/runtime/subjects.ts';
import { listingTypes, PAGE_SIZE, pageCount, type ListingState } from './norm-listing.ts';

export async function subjectCoverage(registry: StoreRegistry, jurisdictions?: readonly JurisdictionId[]): Promise<Array<SubjectCoverage & { jurisdiction: JurisdictionId }>> {
  return Promise.all(registry.list().filter((store) => !jurisdictions?.length || jurisdictions.includes(store.jurisdiction)).map(async (store) => {
    if (!store.countSubjectGroups) throw new Error('Sachgebietsabdeckung im Store fehlt');
    return { ...(await store.countSubjectGroups()), jurisdiction: store.jurisdiction };
  }));
}
export function mergedSubjectCounts(coverage: Array<SubjectCoverage & { jurisdiction: JurisdictionId }>, land?: JurisdictionId) {
  return SUBJECT_GROUPS.map((group) => ({ ...group, count: coverage.filter((entry) => !land || entry.jurisdiction === land).reduce((sum, entry) => sum+(entry.groups.find((g) => g.id === group.id)?.count ?? 0),0) }));
}
function mergeFacets(entries: NormFacets[]): NormFacets {
  const result: NormFacets = { total: 0, byType: [], byLetter: [], byChangeKind: { 'baseline-unchanged':0, 'baseline-changed':0, 'simulation-new':0 } };
  const types = new Map<string, number>(), letters = new Map<string, number>();
  for (const entry of entries) {
    result.total += entry.total;
    for (const row of entry.byType) types.set(row.type,(types.get(row.type)??0)+row.count);
    for (const row of entry.byLetter) letters.set(row.letter,(letters.get(row.letter)??0)+row.count);
    for (const kind of ['baseline-unchanged','baseline-changed','simulation-new'] as const) result.byChangeKind[kind] += entry.byChangeKind[kind];
  }
  result.byType = [...types].map(([type,count]) => ({ type: type as NormFacets['byType'][number]['type'],count }));
  result.byLetter = [...letters].map(([letter,count]) => ({letter,count}));
  return result;
}
export async function subjectListing(registry: StoreRegistry, subject: string, state: ListingState, land?: JurisdictionId) {
  const stores = land ? [registry.get(land)] : registry.list();
  const query: NormFacetQuery = { subject, types: listingTypes(state.type), changeKind: state.changeKind, letter: state.letter };
  const [facets, tabs] = await Promise.all([
    Promise.all(stores.map((store) => store.countNormFacets(query))).then(mergeFacets),
    Promise.all(stores.map((store) => store.countNormFacets({subject}))).then(mergeFacets),
  ]);
  const page = Math.min(state.page,pageCount(facets.total));
  const offset = (page-1)*PAGE_SIZE;
  const lists = await Promise.all(stores.map(async (store) => {
    const result = [];
    for (let start=0;start<offset+PAGE_SIZE;start+=5000) {
      const limit = Math.min(5000,offset+PAGE_SIZE-start);
      const chunk = await store.listNormSummaries({...query,offset:start,limit,sort:state.changeKind ? 'change':'title'});
      result.push(...chunk);
      if(chunk.length<limit) break;
    }
    return result;
  }));
  const norms = lists.flat().sort((a,b) => (state.changeKind ? (b.lastSimulationChangeDate??'').localeCompare(a.lastSimulationChangeDate??'') : 0) || getNormSortKey(a.title).localeCompare(getNormSortKey(b.title)) || a.jurisdiction.localeCompare(b.jurisdiction) || a.slug.localeCompare(b.slug)).slice(offset,offset+PAGE_SIZE);
  return {facets,tabs,norms,state:{...state,page}};
}
