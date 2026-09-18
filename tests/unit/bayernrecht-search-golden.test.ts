/**
 * Golden Set der BayWü-Suche: Vertrag der Datei (Mindestumfang, Determinismus, nur Slugs des Bestands,
 * keine West-spezifischen Anfragen) und die Bruchstelle des generischen Generators bei Bindestrichwörtern.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { generateGoldenQueries } from '@landesrecht/importer-recht-nrw/common/search-golden.ts';
import { BAYWUE_GOLDEN_MIN_QUERIES, BAYWUE_GOLDEN_QUERIES_PATH, generateBaywueGoldenQueries, type BaywueGoldenSet } from '@landesrecht/importer-bayernrecht/search/golden.ts';

const root = resolveRepositoryRoot();
const records = await loadJurisdictionNorms('baywue', root);
const committed = await readFile(join(root, BAYWUE_GOLDEN_QUERIES_PATH), 'utf8').then((text) => JSON.parse(text) as BaywueGoldenSet, () => undefined);

describe('Golden Set BayWü', () => {
  it.skipIf(records.length === 0)('erzeugt deterministisch mindestens 100 Anfragen mit eindeutigen Kennungen', () => {
    const set = generateBaywueGoldenQueries(records);
    expect(set).toEqual(generateBaywueGoldenQueries(records));
    expect(set.jurisdiction).toBe('baywue');
    expect(set.queries.length).toBeGreaterThanOrEqual(BAYWUE_GOLDEN_MIN_QUERIES);
    expect(new Set(set.queries.map((query) => query.id)).size).toBe(set.queries.length);
    // historic-recovered: sobald rückgerechnete Stichtagsfassungen im Bestand sind, prüft das Golden Set sie mit.
    if (records.some((record) => record.versions.some((version) => version.sourceStatus?.text === 'reconstructed'))) {
      expect(set.queries.some((query) => query.note?.startsWith('historic-recovered'))).toBe(true);
    }
    const categories = new Set(set.queries.map((query) => query.category));
    for (const category of ['exact-title', 'abbreviation', 'article-address', 'paragraph-address', 'verordnung-title', 'vwv-title', 'lrmb-number', 'null-result'] as const) expect(categories.has(category), category).toBe(true);
  });

  it.skipIf(records.length === 0)('enthält keine West-spezifischen Anfragen und zeigt nur auf Normen des BayWü-Bestands', () => {
    const set = generateBaywueGoldenQueries(records);
    const slugs = new Set(records.map((record) => record.meta.slug));
    expect(set.queries.filter((query) => /west/iu.test(query.query))).toEqual([]);
    for (const query of set.queries) for (const slug of [...query.expectedTop, ...query.acceptable]) expect(slugs.has(slug), `${query.id} → ${slug}`).toBe(true);
    // Artikeladressen sind der Normalfall bayerischer Gesetze und tragen ein Sprungziel.
    expect(set.queries.filter((query) => query.category === 'article-address').every((query) => query.expectedAnchor)).toBe(true);
    // BayRS-Nummer als suchbares Metadatum: als Phrase Vertrag (Recall), ohne Anführungszeichen nur gemessen.
    const phrases = set.queries.filter((query) => /^"[^"]+"$/u.test(query.query));
    expect(phrases.length).toBeGreaterThanOrEqual(3);
    expect(phrases.every((query) => !query.niceToHave && query.acceptable.length === 1)).toBe(true);
    expect(set.queries.filter((query) => query.query.startsWith('BayRS ')).every((query) => query.niceToHave)).toBe(true);
  });

  it.skipIf(committed === undefined)('die gepflegte Datei zeigt nur auf Normen des aktuellen Bestands', () => {
    const slugs = new Set(records.map((record) => record.meta.slug));
    expect(committed!.queries.length).toBeGreaterThanOrEqual(BAYWUE_GOLDEN_MIN_QUERIES);
    for (const query of committed!.queries) for (const slug of [...query.expectedTop, ...query.acceptable]) expect(slugs.has(slug), `${query.id} → ${slug}`).toBe(true);
  });

  it.skipIf(records.length === 0)('Generator: ein nur durch Normalisierung entstandenes Wort (Bindestrichkompositum) bricht die Tippfehlerfälle nicht', () => {
    const template = records[0]!;
    const hyphenated: NormRecord = { ...template, meta: { ...template.meta, slug: 'bindestrich-test-baywue', id: 'baywue:bindestrich-test-baywue', title: 'Satzung der Bayern-Württembergischen Einrichtung', shortTitle: undefined, abbr: undefined } };
    expect(() => generateGoldenQueries([hyphenated], 'test')).not.toThrow();
    expect(generateGoldenQueries([hyphenated], 'test').queries.filter((query) => query.category === 'typo')).toEqual([]);
  });
});
