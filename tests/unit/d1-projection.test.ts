import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { createD1NormStore, assembleBlocks } from '@landesrecht/runtime/d1-store.ts';
import { buildProjectionPlan, corpusFingerprint, MAX_BLOCK_PART_CHARS, renderStatement, RUNTIME_META_KEYS, splitBlockJson } from '@landesrecht/runtime/projection.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';
import { SEARCH_FTS_TABLE_SQL, SEARCH_TRIGGERS, SEARCH_UNIT_COLUMNS } from '@landesrecht/search/schema.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE, norm } from '../helpers/fixture-corpus.ts';

const root = resolveRepositoryRoot();
const migrationsDir = join(root, 'data', 'd1');
const norms = buildFixtureNorms();
const NOW = '2026-01-01T00:00:00.000Z';

describe('Projektionsplan', () => {
  it('ist deterministisch und schreibt keine herkunftssystemspezifischen Spalten', () => {
    const a = buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    const b = buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.stats.norms).toBe(1);
    expect(a.stats.versions).toBe(2);
    expect(a.groups[0]!.key).toBe('(reset)');
    expect(a.groups.at(-1)!.key).toBe('(meta)');
    const sql = a.groups.flatMap((group) => group.queries.map((query) => query.sql)).join('\n');
    expect(sql).not.toMatch(/revosax|recht_nrw|juris_sh|bayernrecht/iu);
    expect(sql).toContain('INTO law_external_identifiers');
    expect(sql).not.toContain('DELETE FROM law_norms WHERE');
    expect(corpusFingerprint(norms, FIXTURE_REFERENCE_DATE)).toBe(corpusFingerprint([...norms].reverse(), FIXTURE_REFERENCE_DATE));
    expect(corpusFingerprint(norms, FIXTURE_REFERENCE_DATE)).not.toBe(corpusFingerprint(norms, '2030-01-01'));
  });

  it('löscht inkrementell nur die betroffene Norm', () => {
    const plan = buildProjectionPlan(norms, { jurisdiction: 'nsh', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    const group = plan.groups.find((entry) => entry.key === 'deichgesetz-nsh')!;
    const deletes = group.queries.filter((query) => query.sql.startsWith('DELETE'));
    expect(deletes).toHaveLength(9);
    for (const query of deletes) expect(query.params).toEqual(['nsh:deichgesetz-nsh']);
    expect(plan.groups[0]!.queries[0]!.params).toContain(RUNTIME_META_KEYS.projectionState);
  });

  it('zerlegt große Blöcke in Teile und setzt sie wieder zusammen', () => {
    const json = JSON.stringify({ type: 'paragraphText', text: 'x'.repeat(MAX_BLOCK_PART_CHARS * 2 + 10) });
    const parts = splitBlockJson(json);
    expect(parts).toHaveLength(3);
    expect(parts.join('')).toBe(json);
    const rows = parts.map((part, index) => ({ block_index: 0, part_index: index, block_json: part })).reverse();
    expect(assembleBlocks(rows)).toEqual([JSON.parse(json)]);
    expect(renderStatement({ sql: 'INSERT INTO t (a, b) VALUES (?, ?)', params: ["O'Neil", null] })).toBe("INSERT INTO t (a, b) VALUES ('O''Neil', NULL);");
    expect(() => renderStatement({ sql: 'SELECT ?', params: [] })).toThrow(/Parameter/u);
  });

  it('das Migrationsschema entspricht dem Suchvertrag', async () => {
    const migration = await readFile(join(migrationsDir, '0001_landesrecht.sql'), 'utf8');
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    expect(normalize(migration)).toContain(normalize(SEARCH_FTS_TABLE_SQL));
    for (const trigger of SEARCH_TRIGGERS) expect(normalize(migration)).toContain(normalize(trigger));
    expect(migration).not.toMatch(/revosax_law_id/u);
  });
});

describe('D1-Store gegen lokale SQLite-Projektion', () => {
  const databases: Partial<Record<'west' | 'nsh' | 'ost' | 'baywue', SqliteD1Database>> = {};

  beforeAll(async () => {
    for (const jurisdiction of ['west', 'nsh', 'ost', 'baywue'] as const) {
      const db = await openSqliteD1(':memory:', { migrationsDir });
      executePlan(db, buildProjectionPlan(norms, { jurisdiction, full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW }));
      checkSearchIndexIntegrity(db);
      databases[jurisdiction] = db;
    }
  });

  afterAll(() => {
    for (const db of Object.values(databases)) db?.close();
  });

  it('liest Übersichten, Statistik und Normen mit Körperauswahl', async () => {
    const store = createD1NormStore(databases.west!, 'west');
    const summaries = await store.listNormSummaries();
    expect(summaries.map((summary) => summary.slug)).toEqual(['testgesetz-west']);
    expect(summaries[0]!.currentVersionId).toBe('2026-03-01');
    expect(summaries[0]!.versionCount).toBe(2);
    const stats = await store.getStats();
    expect(stats.normCount).toBe(1);
    expect(stats.projectionFingerprint).toBe(corpusFingerprint(norms.filter((record) => record.meta.jurisdiction === 'west'), FIXTURE_REFERENCE_DATE));
    const current = await store.getNorm('testgesetz-west', 'current');
    expect(current!.versions.map((version) => version.body.length)).toEqual([0, 1]);
    const all = await store.getNorm('testgesetz-west', 'all');
    expect(all!.versions.map((version) => version.body.length)).toEqual([1, 1]);
    expect(all!.versions[0]!.sourceValidTo).toBe('2024-01-31');
    expect(await store.getNorm('gibt-es-nicht', 'none')).toBeNull();
  });

  it('die D1-Suche liefert dieselben Treffer wie der Dateistore', async () => {
    const d1 = createD1NormStore(databases.west!, 'west');
    const files = createFileNormStore('west', norms, { asOf: FIXTURE_REFERENCE_DATE });
    for (const q of ['Sollergebnis', '§ 2 Absatz 3', 'WTestG', 'Prüfstand', '"reproduzierbarer Ablauf"']) {
      const state = createSearchState({ q, versionScope: 'all' });
      const [left, right] = await Promise.all([d1.search(state), files.search(state)]);
      expect(left.total, q).toBe(right.total);
      expect(left.hits.map((hit) => `${hit.versionId}:${hit.matchKind}:${hit.unit?.anchor ?? ''}`), q).toEqual(right.hits.map((hit) => `${hit.versionId}:${hit.matchKind}:${hit.unit?.anchor ?? ''}`));
    }
    const dated = await d1.search(createSearchState({ q: 'Testfall', validOn: '2024-06-01' }));
    expect(dated.hits.map((hit) => hit.versionKind)).toEqual(['historical']);
    const none = await d1.search(createSearchState({ q: 'Sturmflut' }));
    expect(none.total).toBe(0);
  });

  it('die Registry führt D1-Stores mehrerer Jurisdiktionen zusammen', async () => {
    const registry = createStoreRegistry(Object.fromEntries((['west', 'nsh', 'ost', 'baywue'] as const).map((jurisdiction) => [jurisdiction, createD1NormStore(databases[jurisdiction]!, jurisdiction)])));
    const page = await registry.search(createSearchState({ q: 'Gemeinden Küste', sort: 'title' }));
    expect(page.total).toBe(0);
    const any = await registry.search(createSearchState({ q: '', sort: 'title' }));
    expect(any.total).toBe(4);
    expect(any.hits.map((hit) => hit.jurisdiction)).toEqual(['nsh', 'baywue', 'ost', 'west']);
    const article = await registry.search(createSearchState({ q: 'Art. 5' }));
    expect(article.hits.map((hit) => [hit.jurisdiction, hit.unit?.anchor])).toEqual([['baywue', 'artikel-5']]);
  });

  it('unveränderliche historische Fassungen: eine erneute Projektion ändert gespeicherte Blöcke nicht', async () => {
    const db = databases.west!;
    const before = db.native.prepare("SELECT block_json FROM law_version_blocks WHERE version_id = '2023-12-01' ORDER BY block_index, part_index").all();
    const changed = norms.map((record) => (record.meta.jurisdiction === 'west'
      ? norm({ jurisdiction: 'west', slug: record.meta.slug, meta: record.meta, history: record.history, versions: record.versions.map((version, index) => (index === 1 ? { ...version, changeNote: 'geändert' } : version)) })
      : record));
    executePlan(db, buildProjectionPlan(changed, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: '2026-02-01T00:00:00.000Z' }));
    const after = db.native.prepare("SELECT block_json FROM law_version_blocks WHERE version_id = '2023-12-01' ORDER BY block_index, part_index").all();
    expect(after).toEqual(before);
    expect(SEARCH_UNIT_COLUMNS[0]).toBe('norm_id');
  });
});
