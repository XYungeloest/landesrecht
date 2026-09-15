/**
 * Spaltenvertrag des Suchindex. `law_search` ist ein FTS5-Index mit externem Inhalt über
 * `law_search_units`; die Spaltenreihenfolge ist positionsgebunden an die bm25-Gewichte.
 * data/d1/0001_landesrecht.sql und der Projektionsplan müssen exakt diese Reihenfolge
 * verwenden (tests/unit/d1-schema.test.ts prüft das).
 */
export const SEARCH_UNIT_UNINDEXED_COLUMNS = [
  'norm_id',
  'jurisdiction',
  'version_id',
  'unit_index',
  'anchor',
  'block_type',
  'references_json',
  'slug',
] as const;

export const SEARCH_UNIT_INDEXED_COLUMNS = ['title', 'short_title', 'abbr', 'label', 'heading', 'body'] as const;

export const SEARCH_UNIT_COLUMNS = [...SEARCH_UNIT_UNINDEXED_COLUMNS, ...SEARCH_UNIT_INDEXED_COLUMNS] as const;

const INDEXED_WEIGHTS: Record<(typeof SEARCH_UNIT_INDEXED_COLUMNS)[number], number> = {
  title: 10,
  short_title: 10,
  abbr: 10,
  label: 2,
  heading: 2,
  body: 1,
};

/** bm25-Gewichtung: Bezeichnungen 10, Gliederungszeichen/Überschrift 2, Text 1. */
export const SEARCH_RANK_WEIGHTS = `bm25(${[
  ...SEARCH_UNIT_UNINDEXED_COLUMNS.map(() => 0),
  ...SEARCH_UNIT_INDEXED_COLUMNS.map((column) => INDEXED_WEIGHTS[column]),
].join(',')})`;

const columnList = SEARCH_UNIT_COLUMNS.join(', ');

export const SEARCH_FTS_TABLE_SQL = `CREATE VIRTUAL TABLE IF NOT EXISTS law_search USING fts5(
  ${SEARCH_UNIT_UNINDEXED_COLUMNS.map((column) => `${column} UNINDEXED`).join(',\n  ')},
  ${SEARCH_UNIT_INDEXED_COLUMNS.join(',\n  ')},
  content='law_search_units',
  content_rowid='id',
  tokenize = 'unicode61 remove_diacritics 2'
);`;

export const SEARCH_UNITS_INSERT_TRIGGER = `CREATE TRIGGER IF NOT EXISTS law_search_units_ai AFTER INSERT ON law_search_units BEGIN
  INSERT INTO law_search(rowid, ${columnList})
  VALUES (new.id, ${SEARCH_UNIT_COLUMNS.map((column) => `new.${column}`).join(', ')});
END;`;

export const SEARCH_UNITS_DELETE_TRIGGER = `CREATE TRIGGER IF NOT EXISTS law_search_units_ad AFTER DELETE ON law_search_units BEGIN
  INSERT INTO law_search(law_search, rowid, ${columnList})
  VALUES ('delete', old.id, ${SEARCH_UNIT_COLUMNS.map((column) => `old.${column}`).join(', ')});
END;`;

export const SEARCH_UNITS_UPDATE_TRIGGER = `CREATE TRIGGER IF NOT EXISTS law_search_units_au AFTER UPDATE ON law_search_units BEGIN
  INSERT INTO law_search(law_search, rowid, ${columnList})
  VALUES ('delete', old.id, ${SEARCH_UNIT_COLUMNS.map((column) => `old.${column}`).join(', ')});
  INSERT INTO law_search(rowid, ${columnList})
  VALUES (new.id, ${SEARCH_UNIT_COLUMNS.map((column) => `new.${column}`).join(', ')});
END;`;

export const SEARCH_TRIGGERS = [SEARCH_UNITS_INSERT_TRIGGER, SEARCH_UNITS_DELETE_TRIGGER, SEARCH_UNITS_UPDATE_TRIGGER];

/** Leert den Suchindex günstig (delete-all ohne Zeilenlauf) und legt die Trigger neu an. */
export function searchIndexResetStatements(): string[] {
  return [
    'DROP TRIGGER IF EXISTS law_search_units_ad',
    'DROP TRIGGER IF EXISTS law_search_units_au',
    'DROP TRIGGER IF EXISTS law_search_units_ai',
    "INSERT INTO law_search(law_search) VALUES ('delete-all')",
    'DELETE FROM law_search_units',
    ...SEARCH_TRIGGERS,
  ];
}
