/**
 * Fail-closed-Pfad der OstRecht-Anbindung: Read-only-Hülle (keine Schreibanweisung über das Binding), Schema-Contract
 * (`sync_state`, Spalten, JSON-Struktur, FTS), Registry/Bindings (Ost aus OSTRECHT_RECHT, LANDESRECHT_OST unbenutzt),
 * Worker-Konfiguration und Healthcheck.
 */
import { describe, expect, it } from 'vitest';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { D1_BINDINGS, OSTRECHT_D1_BINDING, RUNTIME_D1_BINDINGS, runtimeBindingFor } from '@landesrecht/runtime/bindings.ts';
import { checkOstRechtSchemaContract, isOstRechtContractError, OstRechtContractError, resetOstRechtContractCache } from '@landesrecht/runtime/ostrecht-contract.ts';
import { createOstRechtD1Store } from '@landesrecht/runtime/ostrecht-d1-store.ts';
import { resetOstRechtFreshnessCache } from '@landesrecht/runtime/ostrecht-freshness.ts';
import { assertReadOnlySql, createReadOnlyD1, isReadOnlyD1, ReadOnlyViolationError } from '@landesrecht/runtime/read-only-d1.ts';
import { createRegistryFromEnv, missingBindings } from '@landesrecht/runtime/registry.ts';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

import { assertCompleteBindings, isRuntimeConfigurationError } from '../../apps/web/src/lib/runtime/configuration.ts';
import { checkHealth, healthResponse } from '../../apps/web/src/lib/runtime/health.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';

describe('Read-only-D1-Hülle', () => {
  it('lässt nur einzelne SELECT/WITH-Anweisungen zu; Schreib- und Strukturbefehle werfen', async () => {
    const { db, native } = await openOstRechtFixture();
    expect(isReadOnlyD1(db)).toBe(true);
    expect(isReadOnlyD1(native)).toBe(false);
    expect(() => assertReadOnlySql("SELECT lower(replace(title, 'Ä', 'ä')) FROM law_norms")).not.toThrow();
    expect(() => assertReadOnlySql('WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
    for (const sql of ["INSERT INTO law_runtime_meta VALUES ('a', 'b')", "UPDATE law_norms SET title = 'x'", 'DELETE FROM law_norms', "REPLACE INTO law_runtime_meta VALUES ('a', 'b')", 'CREATE TABLE t (x)', 'DROP TABLE law_norms', 'PRAGMA journal_mode = WAL', 'SELECT 1; DELETE FROM law_norms', "SELECT 1 FROM law_norms WHERE title = 'a'; DROP TABLE law_norms"]) {
      expect(() => db.prepare(sql), sql).toThrow(ReadOnlyViolationError);
    }
    expect((db as unknown as { batch?: unknown }).batch).toBeUndefined();
    expect(await db.prepare('SELECT count(*) AS n FROM law_norms').first<{ n: number }>()).toEqual({ n: 12 });
    // Die Hülle ist je Binding-Objekt eindeutig (Contract-Cache über Anfragen hinweg).
    expect(createReadOnlyD1(native)).toBe(db);
  });

  it('der Store nimmt nur eine Read-only-D1 an', async () => {
    const { native } = await openOstRechtFixture();
    expect(() => createOstRechtD1Store(native as never)).toThrow(/Read-only/u);
  });
});

describe('Schema-Contract der OstRecht-D1 (fail closed)', () => {
  it('bestätigt die Fixture und liefert die Laufzeitmetadaten', async () => {
    const { db } = await openOstRechtFixture();
    const report = await checkOstRechtSchemaContract(db, () => new Date('2026-09-28T12:00:00Z'));
    expect(report).toMatchObject({ ok: true, problems: [], checkedAt: '2026-09-28T12:00:00.000Z' });
    expect(report.meta.sync_state).toBe('complete');
    expect(report.meta.projection_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('schlägt bei sync_state ≠ complete klar fehl – keine halbgültige Auslieferung', async () => {
    const { db, native, store } = await openOstRechtFixture();
    expect(await store.getNormSummary('ostdeutsches-feiertagsgesetz')).not.toBeNull();
    native.native.exec("UPDATE law_runtime_meta SET value = 'incremental-in-progress:2026-09-28T10:00:00Z' WHERE key = 'sync_state'");
    resetOstRechtContractCache(db);
    await expect(store.getNormSummary('ostdeutsches-feiertagsgesetz')).rejects.toThrow(OstRechtContractError);
    await expect(store.listNormSummaries()).rejects.toThrow(/sync_state ist „incremental-in-progress/u);
    await expect(store.search({ q: 'x' } as never)).rejects.toSatisfy((error: unknown) => isOstRechtContractError(error) && isRuntimeConfigurationError(error));
    native.native.exec("UPDATE law_runtime_meta SET value = 'complete' WHERE key = 'sync_state'");
    resetOstRechtContractCache(db);
    expect(await store.getNormSummary('ostdeutsches-feiertagsgesetz')).not.toBeNull();
  });

  it('schlägt bei fehlender Spalte, fehlendem Metaschlüssel, fehlender Tabelle und kaputtem JSON fehl', async () => {
    const { db, native, store } = await openOstRechtFixture();
    native.native.exec('ALTER TABLE law_norms DROP COLUMN aliases_json');
    resetOstRechtContractCache(db);
    await expect(store.countNormsByType()).rejects.toThrow(/law_norms: .*aliases_json/u);
    const report = await checkOstRechtSchemaContract(db);
    expect(report.ok).toBe(false);
    expect(report.problems.join(' ')).toMatch(/aliases_json/u);

    const second = await openOstRechtFixture();
    second.native.native.exec("DELETE FROM law_runtime_meta WHERE key = 'projection_fingerprint'");
    expect((await checkOstRechtSchemaContract(second.db)).problems).toContain('law_runtime_meta: Schlüssel „projection_fingerprint“ fehlt');

    const third = await openOstRechtFixture();
    third.native.native.exec('DROP TABLE law_norm_derived');
    expect((await checkOstRechtSchemaContract(third.db)).problems.join(' ')).toMatch(/law_norm_derived/u);

    const fourth = await openOstRechtFixture();
    fourth.native.native.exec("UPDATE law_search_documents SET document_json = '{\"slug\":\"x\"}'");
    expect((await checkOstRechtSchemaContract(fourth.db)).problems.join(' ')).toMatch(/document_json .*Feld „versionId“ fehlt/u);

    const empty = createReadOnlyD1(await openSqliteD1(':memory:'));
    expect((await checkOstRechtSchemaContract(empty)).problems.length).toBeGreaterThan(0);
    const emptyStore = createOstRechtD1Store(empty);
    await expect(emptyStore.getStats()).rejects.toThrow(OstRechtContractError);
  });

  it('prüft je Binding zwischengespeichert und nach Ablauf erneut', async () => {
    const { db, native } = await openOstRechtFixture();
    let now = 1_000;
    const store = createOstRechtD1Store(db, { contract: { recheckAfterMs: 60_000, now: () => now } });
    expect(await store.getStats()).toMatchObject({ normCount: 11 });
    native.native.exec("UPDATE law_runtime_meta SET value = 'incremental-in-progress:x' WHERE key = 'sync_state'");
    // Innerhalb der Frist gilt die letzte Prüfung.
    expect(await store.getStats()).toMatchObject({ normCount: 11 });
    now += 60_001;
    await expect(store.getStats()).rejects.toThrow(OstRechtContractError);
  });
});

describe('Bindings, Registry, Konfiguration und Healthcheck für Ost', () => {
  const fakeD1 = () => ({ prepare: () => ({ bind() { return this; }, async first() { return { ok: 1 }; }, async all() { return { results: [], success: true }; } }), batch: async () => [] });

  it('leitet Ost zur Laufzeit aus OSTRECHT_RECHT ab; LANDESRECHT_OST bleibt definiert, aber keine Laufzeitquelle', () => {
    expect(runtimeBindingFor('ost')).toBe(OSTRECHT_D1_BINDING);
    expect(RUNTIME_D1_BINDINGS).toEqual({ west: 'LANDESRECHT_WEST', nsh: 'LANDESRECHT_NSH', ost: 'OSTRECHT_RECHT', baywue: 'LANDESRECHT_BAYWUE' });
    expect(D1_BINDINGS.ost).toBe('LANDESRECHT_OST');
    const env: Record<string, unknown> = { LANDESRECHT_WEST: fakeD1(), LANDESRECHT_NSH: fakeD1(), LANDESRECHT_BAYWUE: fakeD1(), LANDESRECHT_OST: fakeD1() };
    expect(missingBindings(env)).toEqual(['OSTRECHT_RECHT']);
    expect(() => assertCompleteBindings(env)).toThrow(/OSTRECHT_RECHT/u);
    expect(createRegistryFromEnv(env).has('ost')).toBe(false);
  });

  it('baut den Ost-Store aus OSTRECHT_RECHT über die Read-only-Hülle, ohne LANDESRECHT_OST zu lesen', async () => {
    const { native } = await openOstRechtFixture();
    const untouched = { prepare: () => { throw new Error('LANDESRECHT_OST darf nicht gelesen werden'); }, batch: async () => [] };
    const env: Record<string, unknown> = { LANDESRECHT_WEST: fakeD1(), LANDESRECHT_NSH: fakeD1(), LANDESRECHT_BAYWUE: fakeD1(), LANDESRECHT_OST: untouched, OSTRECHT_RECHT: native };
    expect(missingBindings(env)).toEqual([]);
    expect(() => assertCompleteBindings(env)).not.toThrow();
    const registry = createRegistryFromEnv(env);
    expect(registry.has('ost')).toBe(true);
    expect(registry.list().map((store) => store.jurisdiction)).toEqual([...JURISDICTION_IDS]);
    expect(await registry.get('ost').getNormSummary('ostdeutsches-feiertagsgesetz')).toMatchObject({ jurisdiction: 'ost', slug: 'ostdeutsches-feiertagsgesetz' });
  });

  it('meldet im Healthcheck den OstRecht-Sync-Zustand (ok / incomplete)', async () => {
    const complete = { prepare: (sql: string) => ({ bind(...values: unknown[]) { return { async first() { return { ok: /sync_state/u.test(sql) && values[0] === 'complete' ? 1 : 2 }; }, async all() { return { results: [], success: true }; } }; }, async first() { return { ok: 1 }; }, async all() { return { results: [], success: true }; } }) };
    const env: Record<string, unknown> = { LANDESRECHT_WEST: fakeD1(), LANDESRECHT_NSH: fakeD1(), LANDESRECHT_BAYWUE: fakeD1(), OSTRECHT_RECHT: complete };
    const report = await checkHealth(env, { now: () => new Date('2026-09-28T10:00:00Z') });
    expect(report.status).toBe('ok');
    expect(report.d1).toEqual({ LANDESRECHT_WEST: 'ok', LANDESRECHT_NSH: 'ok', OSTRECHT_RECHT: 'ok', LANDESRECHT_BAYWUE: 'ok' });
    const inProgress = { prepare: () => ({ bind() { return { async first() { return { ok: 2 }; } }; }, async first() { return { ok: 2 }; } }) };
    const degraded = await checkHealth({ ...env, OSTRECHT_RECHT: inProgress });
    expect(degraded.status).toBe('error');
    expect(degraded.d1.OSTRECHT_RECHT).toBe('incomplete');
  });

  it('meldet im Healthcheck eine nur teilweise bereite Ost-Suche als degraded (HTTP 200), nie als vollständig', async () => {
    const { native, db } = await openOstRechtFixture();
    const env: Record<string, unknown> = { LANDESRECHT_WEST: fakeD1(), LANDESRECHT_NSH: fakeD1(), LANDESRECHT_BAYWUE: fakeD1(), OSTRECHT_RECHT: native };
    resetOstRechtFreshnessCache(db);
    const ready = await checkHealth(env);
    expect(ready.status).toBe('ok');
    expect(ready.search).toEqual({ OSTRECHT_RECHT: { readiness: 'ready', fullText: 'current-version-only', historicalVersions: 'navigable', staleNormCount: 0 } });
    // Geltende Fassung ohne Sucheinheiten (wie nach einem Stichtagswechsel vor dem OstRecht-Sync).
    native.native.exec("DELETE FROM law_search_units WHERE norm_id = 'ostdeutsches-feiertagsgesetz'");
    resetOstRechtFreshnessCache(db);
    const partial = await checkHealth(env);
    expect(partial.status).toBe('degraded');
    expect(partial.search?.OSTRECHT_RECHT).toMatchObject({ readiness: 'partial', staleNormCount: 1 });
    expect(healthResponse(partial).status).toBe(200);
  });
});
