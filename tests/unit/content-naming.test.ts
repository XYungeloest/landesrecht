/**
 * Abkürzungs- und Slug-Audit (scripts/lib/naming-audit.ts): Regeln an synthetischen Normen und harte
 * Invarianten des echten West-Bestands (Slug-Registry vollständig, keine rein numerischen Slugs, keine
 * Abkürzung gleich Jurisdiktionsname, kein „West West“). Weiche Befunde (abgeschnittene Slugs,
 * Reste der Quell-Landesbezeichnung) bleiben Reportinhalt und werden hier nur als deterministisch geprüft.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { loadWestCorpus } from '../../scripts/lib/audit-common.ts';
import { auditNaming, slugFromText } from '../../scripts/lib/naming-audit.ts';

const root = resolveRepositoryRoot();

function synthetic(slug: string, title: string, abbr?: string): NormRecord {
  const meta: NormRecord['meta'] = {
    id: `west:${slug}`, slug, jurisdiction: 'west', title, type: 'gesetz', status: 'in-force', subjects: [], keywords: [], initialCitation: 'Test', predecessor: null, successor: null, relations: [], externalIdentifiers: [], sourceReferences: [],
  };
  if (abbr !== undefined) meta.abbr = abbr;
  return { meta, history: { initialVersionId: null, entries: [] }, versions: [] };
}

describe('Benennungs-Audit (Regeln)', () => {
  it('erkennt generische, zu kurze, doppelte und landesbezogene Abkürzungen', () => {
    const result = auditNaming([
      synthetic('a-west', 'Gesetz A', 'West'),
      synthetic('b-west', 'Gesetz B', 'X'),
      synthetic('c-west', 'Gesetz C', 'BVSG NW'),
      synthetic('d-west', 'Gesetz D', 'LHundG West West'),
      synthetic('e-west', 'Gesetz E', 'EU'),
      synthetic('f-west', 'Gesetz F', 'ABC West'),
      synthetic('g-west', 'Gesetz G', 'ABC West'),
    ]);
    const codes = (slug: string): string[] => result.issues.filter((issue) => issue.slug === slug).map((issue) => issue.code).sort();
    expect(codes('a-west')).toEqual(['abbr-equals-jurisdiction', 'abbr-generic']);
    expect(codes('b-west')).toEqual(['abbr-too-short']);
    expect(codes('c-west')).toEqual(['abbr-residual-source-state']);
    expect(result.issues.find((issue) => issue.slug === 'c-west')?.suggestion).toBe('BVSG West');
    expect(codes('d-west')).toEqual(['abbr-double-suffix']);
    expect(result.issues.find((issue) => issue.slug === 'd-west')?.suggestion).toBe('LHundG West');
    expect(codes('e-west')).toEqual(['abbr-generic']);
    expect(codes('f-west')).toEqual(['abbr-duplicate']);
    expect(result.duplicateAbbrs).toEqual([{ abbr: 'abc west', slugs: ['f-west', 'g-west'] }]);
  });

  it('erkennt Slug-Muster: west-west, Ziffern, sehr lang, abgeschnitten, Kollisionssuffix', () => {
    const long = `${'a'.repeat(85)}-west`;
    const result = auditNaming([
      synthetic('gesetz-west-west', 'Gesetz'),
      synthetic('12345', 'Zahl'),
      synthetic(long, 'Lang'),
      synthetic('gesetz-ueber-die-des-west', 'Abgeschnitten'),
      synthetic('bbig-west', 'Berufsbildungsgesetz', 'BBiG'),
      synthetic('bbig-west-29206', 'Ausführung des Berufsbildungsgesetzes', 'AG BBiG'),
      synthetic('hg-west', 'Haushaltsgesetz 2023', 'HG'),
      synthetic('hg-west-31126', 'Haushaltsgesetz 2023', 'HG'),
    ]);
    const codes = (slug: string): string[] => result.issues.filter((issue) => issue.slug === slug).map((issue) => issue.code).sort();
    expect(codes('gesetz-west-west')).toEqual(['slug-west-west']);
    expect(result.issues.find((issue) => issue.slug === 'gesetz-west-west')?.suggestion).toBe('gesetz-west');
    expect(codes('12345')).toEqual(['slug-numeric-only']);
    expect(codes(long)).toEqual(['slug-very-long']);
    expect(codes('gesetz-ueber-die-des-west')).toEqual(['slug-truncated-title']);
    expect(result.collisions.map((entry) => [entry.slug, entry.sameTitle, entry.suggestion])).toEqual([
      ['bbig-west-29206', false, 'ag-bbig-west'],
      ['hg-west-31126', true, undefined],
    ]);
    expect(result.summary.collisionSuffixSlugs).toBe(2);
    expect(slugFromText('Änderung über Straßen (ÄndG)')).toBe('aenderung-ueber-strassen-aendg');
  });
});

describe('Benennung des West-Bestands', () => {
  it('erfüllt die harten Invarianten und ist deterministisch', async () => {
    const norms = await loadWestCorpus(root);
    const first = auditNaming(norms);
    const second = auditNaming(norms);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.summary.norms).toBe(norms.length);
    for (const code of ['slug-numeric-only', 'abbr-equals-jurisdiction', 'abbr-double-suffix', 'abbr-too-short', 'abbr-no-letters', 'slug-west-west', 'slug-collision-without-base']) {
      expect(first.summary.issueCodes[code] ?? 0, code).toBe(0);
    }
    const registry = JSON.parse(await readFile(join(root, 'data', 'imports', 'recht-nrw', 'slug-registry.json'), 'utf8')) as { entries: Array<{ slug: string }> };
    const registrySlugs = new Set(registry.entries.map((entry) => entry.slug));
    expect(norms.filter((record) => !registrySlugs.has(record.meta.slug)).map((record) => record.meta.slug)).toEqual([]);
    expect(first.collisions.filter((entry) => !entry.baseTitle)).toEqual([]);
  });
});
