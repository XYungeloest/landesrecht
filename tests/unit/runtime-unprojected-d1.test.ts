import { describe, expect, it } from 'vitest';

import { createD1NormStore, isUnprojectedDatabaseError } from '@landesrecht/runtime/d1-store.ts';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

/**
 * Eine gebundene, aber nie projizierte D1 (leere Datenbank einer Jurisdiktion ohne Bestand, wie NSH/Ost/BayWü
 * vor ihrem Import) ist ein Leerzustand: Länderseite, API und Suche antworten leer statt mit HTTP 500.
 */
describe('D1-Store gegen eine nicht projizierte Datenbank', () => {
  it('liefert leere Ergebnisse statt „no such table“-Fehlern', async () => {
    const db = await openSqliteD1(':memory:');
    const store = createD1NormStore(db, 'nsh');
    expect(await store.countNormsByType()).toEqual([]);
    expect(await store.listNormSummaries({ limit: 10 })).toEqual([]);
    expect(await store.getNormSummary('gibt-es-nicht')).toBeNull();
    expect(await store.getNorm('gibt-es-nicht')).toBeNull();
    expect(await store.getStats()).toEqual({ normCount: 0, versionCount: 0, projectedAt: null, projectionFingerprint: null });
    expect(await store.getRuntimeMeta('projection_state')).toBeNull();
    expect(await store.search(createSearchState({ q: 'Gesetz', jurisdictions: ['nsh'] }))).toMatchObject({ total: 0, hits: [] });
  });

  it('kennt nur fehlende law_*-Tabellen als Leerzustand; andere Fehler bleiben Fehler', async () => {
    expect(isUnprojectedDatabaseError(new Error('no such table: law_norms'))).toBe(true);
    expect(isUnprojectedDatabaseError(new Error('D1_ERROR: no such table: law_runtime_meta: SQLITE_ERROR'))).toBe(true);
    expect(isUnprojectedDatabaseError(new Error('no such table: other_table'))).toBe(false);
    expect(isUnprojectedDatabaseError(new Error('SQLITE_BUSY'))).toBe(false);
    const db = await openSqliteD1(':memory:');
    db.native.exec('CREATE TABLE law_norms (id TEXT)');
    const store = createD1NormStore(db, 'nsh');
    // Teilweise vorhandenes Schema ist kein Leerzustand: fehlende Spalten sind ein echter Fehler.
    await expect(store.countNormsByType()).rejects.toThrow(/no such column|jurisdiction/u);
  });
});
