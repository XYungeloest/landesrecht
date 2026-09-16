/**
 * Typzähler der Länderseite: aggregierte Zählung über den gesamten Bestand, unabhängig vom Listenlimit.
 * Regression aus dem Bulkbestand (1 354 Normen): Die Zähler wurden aus den ersten 500 gelisteten Normen gebildet
 * („Verordnung (30)“ statt 709).
 */
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMINISTRATIVE_REGULATION_TYPES, expandNormTypeFilter } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { buildScaleCorpus } from '@landesrecht/runtime/scale-corpus.ts';
import { executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';

const NOW = '2026-09-16T12:00:00.000Z';
const COUNT = 600;

describe('Typzähler über den gesamten Bestand (Skalierung über das Listenlimit hinaus)', () => {
  let db: SqliteD1Database;
  let d1: NormStore;
  let files: NormStore;
  const norms = buildScaleCorpus(COUNT);

  beforeAll(async () => {
    db = await openSqliteD1(':memory:', { migrationsDir: join(process.cwd(), 'data', 'd1') });
    executePlan(db, buildProjectionPlan(norms, { jurisdiction: 'west', full: true, now: NOW }));
    d1 = createD1NormStore(db, 'west');
    files = createFileNormStore('west', norms);
  });
  afterAll(() => db.close());

  it('summiert die Typzähler zur vollständigen Normanzahl, obwohl die Liste begrenzt bleibt', async () => {
    for (const store of [d1, files]) {
      const counts = await store.countNormsByType();
      expect(counts.reduce((sum, entry) => sum + entry.count, 0)).toBe(COUNT);
      expect((await store.getStats()).normCount).toBe(COUNT);
    }
    // Die Standardliste bleibt auf 500 begrenzt – genau deshalb darf sie nicht als Zählbasis dienen.
    expect((await d1.listNormSummaries()).length).toBe(500);
  });

  it('liefert in D1- und Dateistore dieselbe Verteilung; die Verwaltungsvorschriften-Familie summiert ihre Untertypen', async () => {
    const fromD1 = await d1.countNormsByType();
    const fromFiles = await files.countNormsByType();
    expect(fromD1).toEqual(fromFiles);
    const family = new Set<string>(expandNormTypeFilter(['verwaltungsvorschrift']));
    const familyCount = fromD1.filter((entry) => family.has(entry.type)).reduce((sum, entry) => sum + entry.count, 0);
    const administrative = fromD1.filter((entry) => (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(entry.type)).reduce((sum, entry) => sum + entry.count, 0);
    expect(familyCount).toBe(administrative);
    // Jeder Zähler entspricht der tatsächlichen Anzahl im Bestand.
    for (const entry of fromD1) expect(norms.filter((norm) => norm.meta.type === entry.type).length).toBe(entry.count);
  });
});
