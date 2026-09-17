/**
 * Rangfolge der Suche in beiden Match-Modi (D1-Store und Dateistore): exakter Titel vor Volltext, exakte Abkürzung
 * vor zufälligem Volltexttreffer, Strukturadresse vor bloßem Zahlentreffer, Jurisdiktions- und Normtypfilter.
 */
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { createStoreRegistry, type StoreRegistry } from '@landesrecht/runtime/registry.ts';
import { executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';
import { createSearchState, SEARCH_MATCH_MODES, type SearchState } from '@landesrecht/search/query.ts';

import { FIXTURE_REFERENCE_DATE, article, norm, paragraph } from '../helpers/fixture-corpus.ts';

const root = resolveRepositoryRoot();
const NOW = '2026-09-01T00:00:00.000Z';
const openDatabases: SqliteD1Database[] = [];

function corpus(): NormRecord[] {
  const west = (slug: string, meta: Record<string, unknown>, body: Parameters<typeof norm>[0]['versions'][number]['body']): NormRecord =>
    norm({ jurisdiction: 'west', slug, meta, versions: [{ versionId: '2024-01-01', simulationValidFrom: '2024-01-01', body }] });
  return [
    west('kibiz-west', { title: 'Kinderbildungsgesetz', shortTitle: 'Kinderbildungsgesetz', abbr: 'KiBiz', type: 'gesetz' }, [
      paragraph('§ 1', 'Ziel', 'Kindertageseinrichtungen fördern Kinder.'),
      paragraph('§ 2', 'Träger', 'Träger sind Gemeinden und freie Träger. Nummer 3 der Anlage gilt.'),
    ]),
    west('dvo-kibiz-west', { title: 'Verordnung zur Durchführung des Kinderbildungsgesetzes', shortTitle: 'Durchführungsverordnung KiBiz', abbr: 'DVO KiBiz', type: 'verordnung' }, [
      paragraph('§ 1', 'Geltungsbereich', 'Diese Verordnung gilt für Kindertageseinrichtungen nach dem Kinderbildungsgesetz.'),
      paragraph('§ 3', 'Gruppen', 'Eine Gruppe umfasst höchstens zwanzig Kinder; das Kinderbildungsgesetz bleibt unberührt. Kinderbildungsgesetz, Kinderbildungsgesetz.'),
    ]),
    west('volltext-west', { title: 'Gesetz über die Förderung von Einrichtungen', shortTitle: 'Förderungsgesetz', abbr: 'FördG', type: 'gesetz' }, [
      paragraph('§ 1', 'Förderung', 'Das Kinderbildungsgesetz und die DVO KiBiz werden hier im Text erwähnt: Kinderbildungsgesetz, DVO KiBiz, KiBiz, Kinderbildungsgesetz.'),
      paragraph('§ 3', 'Zahlen', 'In § 3 dieses Gesetzes steht die Zahl 3 dreimal: 3, 3, 3.'),
    ]),
    west('vv-kibiz-west', { title: 'Verwaltungsvorschrift zum Kinderbildungsgesetz', shortTitle: 'VV KiBiz', abbr: 'VV KiBiz', type: 'verwaltungsvorschrift' }, [
      { type: 'section', label: '1', title: 'Allgemeines', children: [{ type: 'paragraphText', text: 'Die Vorschrift erläutert das Kinderbildungsgesetz.' }] },
      { type: 'section', label: '3', title: 'Verfahren', children: [{ type: 'paragraphText', text: 'Anträge sind schriftlich zu stellen.' }] },
    ]),
    norm({ jurisdiction: 'baywue', slug: 'kibig-baywue', meta: { title: 'Kinderbildungs- und -betreuungsgesetz', shortTitle: 'Kinderbildungsgesetz Bayern-Württemberg', abbr: 'KiBiG', type: 'gesetz' }, versions: [{ versionId: '2024-01-01', simulationValidFrom: '2024-01-01', body: [article('Art. 3', 'Träger', 'Träger sind die Gemeinden. Das Kinderbildungsgesetz gilt entsprechend.')] }] }),
  ];
}

interface Stores { registry: StoreRegistry; d1: Record<JurisdictionId, NormStore>; files: Record<JurisdictionId, NormStore> }

async function project(records: readonly NormRecord[]): Promise<Stores> {
  const d1 = {} as Record<JurisdictionId, NormStore>;
  const files = {} as Record<JurisdictionId, NormStore>;
  for (const jurisdiction of JURISDICTION_IDS) {
    const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
    openDatabases.push(db);
    executePlan(db, buildProjectionPlan(records.filter((record) => record.meta.jurisdiction === jurisdiction), { jurisdiction, full: true, now: NOW }));
    d1[jurisdiction] = createD1NormStore(db, jurisdiction);
    files[jurisdiction] = createFileNormStore(jurisdiction, records, { asOf: FIXTURE_REFERENCE_DATE });
  }
  return { registry: createStoreRegistry(d1), d1, files };
}

afterAll(() => {
  for (const db of openDatabases) db.close();
});

describe('Rangfolge der Suche (beide Match-Modi, D1 und Dateistore)', () => {
  let stores: Stores;
  const variants = (): Array<[string, NormStore, SearchState['matchMode']]> => SEARCH_MATCH_MODES.flatMap((matchMode) => [[`d1/${matchMode}`, stores.d1.west, matchMode], [`files/${matchMode}`, stores.files.west, matchMode]] as Array<[string, NormStore, SearchState['matchMode']]>);
  const search = (store: NormStore, q: string, matchMode: SearchState['matchMode'], overrides: Partial<SearchState> = {}) => store.search(createSearchState({ q, jurisdictions: ['west'], ...(matchMode ? { matchMode } : {}), ...overrides }));

  beforeAll(async () => {
    stores = await project(corpus());
  });

  it('exakter Titel steht vor Volltexttreffern, auch wenn diese das Wort häufiger nennen', async () => {
    for (const [label, store, matchMode] of variants()) {
      const page = await search(store, 'Kinderbildungsgesetz', matchMode);
      expect(page.hits[0], label).toMatchObject({ slug: 'kibiz-west', matchKind: 'identity' });
      expect(page.hits.map((hit) => hit.slug), label).toContain('volltext-west');
      expect(page.hits.findIndex((hit) => hit.slug === 'volltext-west'), label).toBeGreaterThan(0);
      const full = await search(store, 'Verordnung zur Durchführung des Kinderbildungsgesetzes', matchMode);
      expect(full.hits[0], label).toMatchObject({ slug: 'dvo-kibiz-west', matchKind: 'identity' });
    }
  });

  it('exakte Abkürzung steht vor zufälligen Volltexttreffern, unabhängig von Groß-/Kleinschreibung', async () => {
    for (const [label, store, matchMode] of variants()) {
      for (const [q, expected] of [['DVO KiBiz', 'dvo-kibiz-west'], ['dvo kibiz', 'dvo-kibiz-west'], ['KiBiz', 'kibiz-west'], ['VV KiBiz', 'vv-kibiz-west']] as const) {
        const page = await search(store, q, matchMode);
        expect(page.hits[0], `${label} ${q}`).toMatchObject({ slug: expected, matchKind: 'identity' });
        // „volltext-west“ nennt „DVO KiBiz“ und „KiBiz“ mehrfach im Text, bleibt aber hinter der Bezeichnung.
        if (q !== 'VV KiBiz') expect(page.hits.map((hit) => hit.slug), `${label} ${q}`).toContain('volltext-west');
      }
    }
  });

  it('Strukturadresse trifft die Stelle, nicht die Norm mit der bloßen Zahl im Text', async () => {
    for (const [label, store, matchMode] of variants()) {
      // „volltext-west“ hat ebenfalls einen § 3 und nennt „DVO KiBiz“ im Text: Adresstreffer ohne Titel, hinter dem Adresstreffer mit Titel.
      const page = await search(store, '§ 3 DVO KiBiz', matchMode);
      expect(page.hits.map((hit) => [hit.slug, hit.matchKind, hit.unit?.anchor]), label).toEqual([['dvo-kibiz-west', 'reference', 'paragraph-3'], ['volltext-west', 'reference', 'paragraph-3']]);
      const bare = await search(store, '§ 3', matchMode);
      expect(bare.hits.map((hit) => hit.slug).sort(), label).toEqual(['dvo-kibiz-west', 'volltext-west']);
      expect(bare.hits.every((hit) => hit.matchKind === 'reference' && hit.unit?.anchor === 'paragraph-3'), label).toBe(true);
      const numbered = await search(store, 'Nr. 3 VV KiBiz', matchMode);
      expect(numbered.hits.map((hit) => [hit.slug, hit.matchKind, hit.unit?.references?.number]), label).toEqual([['vv-kibiz-west', 'reference', '3']]);
      // „Nummer 3“ im Text des KiBiz ist keine Nummernadresse; getroffen wird nur Nr. 3 der VV KiBiz (Abkürzung enthält „KiBiz“).
      expect((await search(store, 'Nr. 3 KiBiz', matchMode)).hits.map((hit) => [hit.slug, hit.unit?.references?.number]), label).toEqual([['vv-kibiz-west', '3']]);
    }
  });

  it('Normtypfilter und Jurisdiktionsfilter wirken in beiden Modi', async () => {
    for (const matchMode of SEARCH_MATCH_MODES) {
      const state = (overrides: Partial<SearchState>) => createSearchState({ q: 'Kinderbildungsgesetz', matchMode, ...overrides });
      expect((await stores.registry.search(state({ jurisdictions: ['west'], types: ['verordnung'] }))).hits.map((hit) => hit.slug), matchMode).toEqual(['dvo-kibiz-west']);
      expect((await stores.registry.search(state({ jurisdictions: ['west'], types: ['verwaltungsvorschrift'] }))).hits.map((hit) => hit.slug), matchMode).toEqual(['vv-kibiz-west']);
      const gesetze = (await stores.registry.search(state({ jurisdictions: ['west'], types: ['gesetz'] }))).hits.map((hit) => hit.slug);
      expect(gesetze[0], matchMode).toBe('kibiz-west');
      expect(gesetze, matchMode).not.toContain('dvo-kibiz-west');
      expect((await stores.registry.search(state({ jurisdictions: ['baywue'] }))).hits.map((hit) => hit.slug), matchMode).toEqual(['kibig-baywue']);
      const all = await stores.registry.search(state({}));
      expect(all.hits.map((hit) => hit.jurisdiction), matchMode).toContain('baywue');
      expect(all.hits[0], matchMode).toMatchObject({ slug: 'kibiz-west', jurisdiction: 'west' });
      expect(all.hits.every((hit) => hit.jurisdiction === 'west' || hit.jurisdiction === 'baywue'), matchMode).toBe(true);
      expect((await stores.registry.search(state({ jurisdictions: ['nsh', 'ost'] }))).total, matchMode).toBe(0);
    }
  });
});
