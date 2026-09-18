/**
 * Mehrjurisdiktions-Sicherheit der D1-Projektion: `--jurisdiction west` berührt nur die West-Datenbank – Plan,
 * Batches, Projektionszustand und inkrementeller Plan enthalten ausschließlich West-Normen; Bindings und
 * Datenbanknamen sind je Jurisdiktion eindeutig und stimmen mit der Wrangler-Konfiguration überein. Keine
 * Remote-Zugriffe.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { TARGET_JURISDICTION } from '@landesrecht/importer-recht-nrw/common/constants.ts';
import { D1_BINDINGS, D1_DATABASE_NAMES, d1BindingFor, jurisdictionForBinding, R2_SOURCES_BINDING, R2_SOURCES_BUCKET_NAME } from '@landesrecht/runtime/bindings.ts';
import { buildIncrementalProjectionPlan, projectionStateFor } from '@landesrecht/runtime/incremental.ts';
import { buildProjectionPlan, normId, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE, norm } from '../helpers/fixture-corpus.ts';

const NOW = '2026-01-01T00:00:00.000Z';
const root = resolveRepositoryRoot();
const others = JURISDICTION_IDS.filter((jurisdiction) => jurisdiction !== 'west');
const foreignIdPattern = new RegExp(`'(?:${others.join('|')}):`, 'u');

function parseJsonc(text: string): unknown {
  return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '').replace(/,(\s*[}\]])/gu, '$1'));
}

describe('D1-Projektion: nur die gewählte Jurisdiktion', () => {
  const corpus = [...buildFixtureNorms(), norm({ jurisdiction: 'nsh', slug: 'west-aehnlich-nsh', meta: { title: 'Gesetz Westdeutschland-ähnlich' }, versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [] }] })];

  it('Vollplan, Batches und Projektionszustand für west enthalten ausschließlich West-Normen', () => {
    const plan = buildProjectionPlan(corpus, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    const normGroups = plan.groups.filter((group) => !group.key.startsWith('('));
    expect(normGroups.map((group) => group.key)).toEqual(corpus.filter((record) => record.meta.jurisdiction === 'west').map((record) => record.meta.slug).sort());
    expect(plan.stats.norms).toBe(1);
    const sql = renderPlanSql(plan);
    expect(sql).toContain(`'${normId('west', 'testgesetz-west')}'`);
    expect(sql).not.toMatch(foreignIdPattern);
    for (const query of plan.groups.flatMap((group) => group.queries)) for (const param of query.params) if (typeof param === 'string' && /^(?:west|nsh|ost|baywue):/u.test(param)) expect(param.startsWith('west:')).toBe(true);

    const batches = splitPlanIntoSqlFiles(plan, { database: D1_DATABASE_NAMES.west });
    expect(batches.plan).toMatchObject({ jurisdiction: 'west', database: 'landesrecht-west', totals: { norms: 1 } });
    for (const file of batches.files) expect(file.sql).not.toMatch(foreignIdPattern);
    expect(batches.files[0]!.sql.startsWith('-- landesrecht D1 landesrecht-west full')).toBe(true);

    const state = projectionStateFor(corpus, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE });
    expect(Object.keys(state.norms)).toEqual(['west:testgesetz-west']);
    expect(state.jurisdiction).toBe('west');
  });

  it('der inkrementelle Plan für west ignoriert Änderungen anderer Jurisdiktionen und löscht nie fremde Normen', () => {
    const previous = projectionStateFor(corpus, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE });
    // Fremde Norm ändert sich, fremde Norm kommt hinzu, fremde Norm verschwindet: für west ein No-op.
    const changed = corpus.filter((record) => record.meta.slug !== 'west-aehnlich-nsh').map((record) => (record.meta.jurisdiction === 'ost' ? norm({ jurisdiction: 'ost', slug: record.meta.slug, meta: { ...record.meta, title: 'Geändert' }, history: record.history, versions: record.versions }) : record));
    changed.push(norm({ jurisdiction: 'baywue', slug: 'neu-baywue', versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [] }] }));
    const incremental = buildIncrementalProjectionPlan(changed, previous, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(incremental.mode).toBe('noop');
    expect(incremental.diff).toMatchObject({ added: [], removed: [], changedVersions: [], changedMeta: [], unchanged: 1 });
    expect(incremental.plan.groups.map((group) => group.key)).toEqual(['(basis prüfen)', '(identität entwerten)', '(meta)']);
    expect(renderPlanSql(incremental.plan)).not.toMatch(foreignIdPattern);
    // Ein Zustand einer anderen Jurisdiktion ist keine Basis für west.
    const foreignState = projectionStateFor(corpus, { jurisdiction: 'nsh', asOf: FIXTURE_REFERENCE_DATE });
    const rejected = buildIncrementalProjectionPlan(corpus, foreignState, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(rejected.mode).toBe('full');
    expect(rejected.diff.reasons).toContain('Jurisdiktion nsh ≠ west');
    expect(() => buildIncrementalProjectionPlan(corpus, foreignState, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW, allowFullFallback: false })).toThrow(/Jurisdiktion nsh ≠ west/u);
  });
});

describe('Inkrementeller Plan erkennt codebedingte Änderungen der Sucheinheiten', () => {
  it('schreibt eine Norm neu, deren Datensatz gleich blieb, deren Sucheinheiten sich aber geändert haben', () => {
    const corpus = buildFixtureNorms();
    const previous = projectionStateFor(corpus, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE });
    // Gleicher Datensatz, andere Sucheinheiten – so sieht ein Vorzustand aus, der mit älterem Code der
    // Sucheinheiten berechnet wurde (etwa bevor die BayRS-Nummer suchbar wurde).
    const stale = { ...previous, norms: Object.fromEntries(Object.entries(previous.norms).map(([id, fingerprint]) => [id, { ...fingerprint, search: '0'.repeat(64) }])) };
    const incremental = buildIncrementalProjectionPlan(corpus, stale, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(incremental.mode).toBe('incremental');
    expect(incremental.diff).toMatchObject({ changedSearch: ['west:testgesetz-west'], unchanged: 0 });
    expect(buildIncrementalProjectionPlan(corpus, previous, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW }).mode).toBe('noop');
  });
});

describe('Bindings und Datenbanknamen je Jurisdiktion', () => {
  it('jede Jurisdiktion hat genau eine D1-Datenbank und ein Binding; die Wrangler-Konfiguration stimmt damit überein', async () => {
    expect(Object.keys(D1_BINDINGS).sort()).toEqual([...JURISDICTION_IDS].sort());
    expect(new Set(Object.values(D1_BINDINGS)).size).toBe(JURISDICTION_IDS.length);
    expect(new Set(Object.values(D1_DATABASE_NAMES)).size).toBe(JURISDICTION_IDS.length);
    expect(D1_DATABASE_NAMES.west).toBe('landesrecht-west');
    expect(d1BindingFor('west')).toBe('LANDESRECHT_WEST');
    expect(jurisdictionForBinding('LANDESRECHT_WEST')).toBe('west');
    expect(jurisdictionForBinding('LANDESRECHT_FOO')).toBeUndefined();
    const config = parseJsonc(await readFile(join(root, 'apps', 'web', 'wrangler.jsonc'), 'utf8')) as { d1_databases: Array<{ binding: string; database_name: string }>; r2_buckets: Array<{ binding: string; bucket_name: string }>; env?: { staging?: { d1_databases: Array<{ binding: string; database_name: string }> } } };
    expect(Object.fromEntries(config.d1_databases.map((entry) => [entry.binding, entry.database_name]))).toEqual(Object.fromEntries(JURISDICTION_IDS.map((jurisdiction) => [D1_BINDINGS[jurisdiction], D1_DATABASE_NAMES[jurisdiction]])));
    expect(config.r2_buckets).toEqual([{ binding: R2_SOURCES_BINDING, bucket_name: R2_SOURCES_BUCKET_NAME }]);
    for (const entry of config.env?.staging?.d1_databases ?? []) expect(entry.database_name).toBe(`${D1_DATABASE_NAMES[jurisdictionForBinding(entry.binding)!]}-staging`);
    // Der RECHT.NRW-Import zielt ausschließlich auf west.
    expect(TARGET_JURISDICTION).toBe('west');
  });
});
