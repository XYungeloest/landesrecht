import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { buildProjectionPlan, renderStatement } from '@landesrecht/runtime/projection.ts';
import { splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { searchIndexResetStatements, SEARCH_TRIGGERS } from '@landesrecht/search/schema.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE, norm } from '../helpers/fixture-corpus.ts';

const migrationsDir = join(resolveRepositoryRoot(), 'data', 'd1');
const NOW = '2026-01-01T00:00:00.000Z';

describe('SQL-Anweisungen für D1-Batches', () => {
  it('schließt jede Anweisung mit genau einem Semikolon ab – auch Trigger, die „END;“ mitbringen', () => {
    expect(SEARCH_TRIGGERS.every((sql) => sql.trimEnd().endsWith('END;'))).toBe(true);
    for (const sql of searchIndexResetStatements()) {
      const rendered = renderStatement({ sql, params: [] });
      expect(rendered.endsWith(';')).toBe(true);
      expect(rendered.endsWith(';;')).toBe(false);
      // Keine leere Anweisung im Batch: die Remote-D1 lehnt „;;“ mit „SQL code did not contain a statement“ ab.
      expect(rendered.split('\n').some((line) => line.trim() === ';' || /;;\s*$/u.test(line))).toBe(false);
    }
    expect(renderStatement({ sql: 'INSERT INTO t(a) VALUES (?)', params: ['x;'] })).toBe("INSERT INTO t(a) VALUES ('x;');");
    expect(renderStatement({ sql: 'SELECT 1;', params: [] })).toBe('SELECT 1;');
  });

  it('mehrfache Semikolons, Leerraum, Zeilenkommentare am Ende und Semikolons in Zeichenketten', () => {
    expect(renderStatement({ sql: 'SELECT 1;;', params: [] })).toBe('SELECT 1;');
    expect(renderStatement({ sql: 'SELECT 1 ; ;\n', params: [] })).toBe('SELECT 1;');
    expect(renderStatement({ sql: 'SELECT 1; -- Kommentar am Ende', params: [] })).toBe('SELECT 1;');
    expect(renderStatement({ sql: 'SELECT 1\n-- Kommentar in eigener Zeile\n', params: [] })).toBe('SELECT 1;');
    expect(renderStatement({ sql: "SELECT ';'", params: [] })).toBe("SELECT ';';");
    expect(renderStatement({ sql: "SELECT '--';", params: [] })).toBe("SELECT '--';");
    expect(renderStatement({ sql: 'SELECT ?', params: ['a; -- b'] })).toBe("SELECT 'a; -- b';");
    expect(renderStatement({ sql: "SELECT ?, '-- kein Kommentar'", params: ["O'Neil;"] })).toBe("SELECT 'O''Neil;', '-- kein Kommentar';");
    const trigger = 'CREATE TRIGGER IF NOT EXISTS t AFTER INSERT ON x BEGIN\n  INSERT INTO y VALUES (new.id);\nEND;';
    expect(renderStatement({ sql: trigger, params: [] })).toBe(trigger);
    expect(renderStatement({ sql: `${trigger};\n`, params: [] })).toBe(trigger);
  });

  it('die erzeugten Batch-Dateien sind für den SQLite-Parser vollständig (Trigger, Zeichenketten mit Semikolon, Kommentare)', async () => {
    const tricky = norm({
      jurisdiction: 'west', slug: 'semikolon-test-west', meta: { title: 'Gesetz mit Semikolon; und Kommentar -- im Titel', shortTitle: "O'Neil-Gesetz", abbr: 'SemG' },
      versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [{ type: 'paragraph', label: '§ 1', title: 'Zeichen; -- /* */', children: [{ type: 'subparagraph', label: '(1)', text: "Text mit ; Semikolon, 'Apostroph', -- Kommentarzeichen und /* Blockkommentar */; Ende", children: [] }] }] }],
    });
    const records = [...buildFixtureNorms(), tricky];
    const plan = buildProjectionPlan(records, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    const batches = splitPlanIntoSqlFiles(plan, { database: 'landesrecht-west', maxStatements: 40 });
    expect(batches.plan.errors).toEqual([]);
    expect(batches.files.length).toBeGreaterThan(1);
    const db = await openSqliteD1(':memory:', { migrationsDir });
    try {
      for (const file of batches.files) {
        expect(file.sql).not.toMatch(/;;\s*(\n|$)/u);
        expect(file.sql.split('\n').some((line) => line.trim() === ';')).toBe(false);
        // Der native Parser liest die ganze Datei: Trigger mit BEGIN … END, Zeichenketten und Kommentare bleiben intakt.
        db.native.exec(file.sql);
      }
      const triggers = db.native.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as Array<{ name: string }>;
      expect(triggers.map((row) => row.name)).toEqual(['law_search_units_ad', 'law_search_units_ai', 'law_search_units_au']);
      const stored = db.native.prepare("SELECT title FROM law_norms WHERE slug = 'semikolon-test-west'").get() as { title: string };
      expect(stored.title).toBe('Gesetz mit Semikolon; und Kommentar -- im Titel');
      const block = db.native.prepare("SELECT block_json FROM law_version_blocks WHERE norm_id = 'west:semikolon-test-west' AND block_index = 0").get() as { block_json: string };
      expect(JSON.parse(block.block_json)).toMatchObject({ label: '§ 1', title: 'Zeichen; -- /* */' });
      expect((db.native.prepare('SELECT COUNT(*) AS n FROM law_norms').get() as { n: number }).n).toBe(2);
      expect(batches.plan.totals.statements).toBe(plan.stats.statements + 9 * batches.plan.totals.norms);
    } finally {
      db.close();
    }
  });
});
