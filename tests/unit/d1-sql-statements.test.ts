import { describe, expect, it } from 'vitest';

import { renderStatement } from '@landesrecht/runtime/projection.ts';
import { searchIndexResetStatements, SEARCH_TRIGGERS } from '@landesrecht/search/schema.ts';

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
});
