/**
 * Welche Beziehungsziele einer Norm im Bestand vorhanden sind (Datenseite). Ein Ziel, das nicht im Bestand steht – etwa
 * eine aus dem eingefrorenen Ausgangsrechtsstand ausgeschlossene Zielnorm eines Sim-Änderungsakts –, wird nicht verlinkt
 * (sonst ein toter Link auf eine nicht vorhandene Normseite), sondern mit Status ausgewiesen. Geprüft wird gebündelt je
 * Jurisdiktion über die Registry; eine nicht verfügbare Jurisdiktion gilt als „nicht geprüft“ und wird nicht verlinkt.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormMeta } from '@landesrecht/legal-core/lib/schema.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';
import { getNormSummaries } from '@landesrecht/runtime/store.ts';

export type RelationTargetState = 'present' | 'absent' | 'unchecked';

export const relationTargetKey = (jurisdiction: string, slug: string): string => `${jurisdiction}/${slug}`;

export async function resolveRelationTargets(registry: StoreRegistry, meta: NormMeta): Promise<Map<string, RelationTargetState>> {
  const wanted = new Map<JurisdictionId, Set<string>>();
  const add = (target: { jurisdiction?: JurisdictionId; slug: string } | undefined): void => {
    if (!target) return;
    const jurisdiction = target.jurisdiction ?? meta.jurisdiction;
    if (!wanted.has(jurisdiction)) wanted.set(jurisdiction, new Set());
    wanted.get(jurisdiction)!.add(target.slug);
  };
  for (const relation of meta.relations) add(relation.target);
  add(meta.predecessorTarget);
  add(meta.successorTarget);
  const states = new Map<string, RelationTargetState>();
  await Promise.all([...wanted].map(async ([jurisdiction, slugs]) => {
    if (!registry.has(jurisdiction)) {
      for (const slug of slugs) states.set(relationTargetKey(jurisdiction, slug), 'unchecked');
      return;
    }
    const found = await getNormSummaries(registry.get(jurisdiction), [...slugs]);
    for (const slug of slugs) states.set(relationTargetKey(jurisdiction, slug), found.has(slug) ? 'present' : 'absent');
  }));
  return states;
}
