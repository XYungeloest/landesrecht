/**
 * Datenseite: Beziehungsziele werden nur verlinkt, wenn die Zielnorm im Bestand steht (apps/web/src/lib/relation-targets.ts).
 * Eine aus dem eingefrorenen Ausgangsrechtsstand ausgeschlossene Zielnorm eines Sim-Änderungsakts erscheint mit Status,
 * nicht als toter Link auf eine erfundene Normseite.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';

import { relationTargetKey, resolveRelationTargets } from '../../apps/web/src/lib/relation-targets.ts';
import { buildFixtureNorms } from '../helpers/fixture-corpus.ts';

describe('Beziehungsziele der Datenseite', () => {
  const norms = buildFixtureNorms();
  const west = norms.find((record) => record.meta.jurisdiction === 'west')!;
  const nsh = norms.find((record) => record.meta.jurisdiction === 'nsh')!;

  it('unterscheidet vorhandene, fehlende und ungeprüfte Ziele gebündelt je Jurisdiktion', async () => {
    const registry = createStoreRegistry({ west: createFileNormStore('west', norms.filter((record) => record.meta.jurisdiction === 'west')), nsh: createFileNormStore('nsh', norms.filter((record) => record.meta.jurisdiction === 'nsh')) });
    const meta = {
      ...west.meta,
      relations: [
        { type: 'amends' as const, target: { slug: west.meta.slug } },
        { type: 'amends' as const, target: { slug: 'ausgeschlossene-zielnorm-west' }, note: 'Zielnorm nicht im Baseline-Bestand' },
        { type: 'related' as const, target: { jurisdiction: 'nsh' as const, slug: nsh.meta.slug } },
        { type: 'related' as const, target: { jurisdiction: 'baywue' as const, slug: 'irgendwas-baywue' } },
      ],
      successorTarget: { slug: 'gibt-es-nicht-west' },
    };
    const states = await resolveRelationTargets(registry, meta);
    expect(states.get(relationTargetKey('west', west.meta.slug))).toBe('present');
    expect(states.get(relationTargetKey('west', 'ausgeschlossene-zielnorm-west'))).toBe('absent');
    expect(states.get(relationTargetKey('nsh', nsh.meta.slug))).toBe('present');
    expect(states.get(relationTargetKey('baywue', 'irgendwas-baywue'))).toBe('unchecked');
    expect(states.get(relationTargetKey('west', 'gibt-es-nicht-west'))).toBe('absent');
  });

  it('die Datenseite verlinkt nur vorhandene Ziele (Quelltext-Regression)', async () => {
    const component = await readFile(join(resolveRepositoryRoot(), 'apps/web/src/components/NormFactsPage.astro'), 'utf8');
    expect(component).toContain("targetState(jurisdiction, relation.target.slug) === 'present' ? <a href={getNormUrl(jurisdiction, relation.target.slug)}>");
    expect(component).toContain('nicht im veröffentlichten Bestand');
    for (const page of ['[jurisdiction]/norm/[slug]/daten.astro', '[jurisdiction]/norm/[slug]/version/[versionId]/daten.astro']) {
      const source = await readFile(join(resolveRepositoryRoot(), 'apps/web/src/pages', page), 'utf8');
      expect(source).toContain('relationTargets={relationTargets}');
    }
  });
});
