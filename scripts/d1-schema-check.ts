#!/usr/bin/env node
/**
 * Prüft das D1-Schema: Migrationen laufen in einer leeren SQLite-Datenbank durch, die
 * erwarteten Tabellen existieren, und die Spaltenreihenfolge von law_search entspricht dem
 * Suchvertrag (packages/search/src/schema.ts). Anschließend wird eine Projektion des
 * Bestands ausgeführt und der FTS5-Index geprüft.
 */
import { join } from 'node:path';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { SEARCH_UNIT_COLUMNS } from '@landesrecht/search/schema.ts';

const REQUIRED_TABLES = [
  'law_norms', 'law_versions', 'law_version_blocks', 'law_source_objects', 'law_norm_history',
  'law_norm_relations', 'law_norm_subjects', 'law_external_identifiers', 'law_search_units', 'law_search', 'law_runtime_meta',
];

const root = resolveRepositoryRoot();
const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
const tables = new Set(db.native.prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ").all().map((row) => String((row as { name: string }).name)));
const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
if (missing.length > 0) {
  console.error(`Fehlende Tabellen: ${missing.join(', ')}`);
  process.exit(1);
}

const searchColumns = db.native.prepare('PRAGMA table_info(law_search)').all().map((row) => String((row as { name: string }).name));
if (searchColumns.join(',') !== SEARCH_UNIT_COLUMNS.join(',')) {
  console.error(`law_search-Spalten weichen vom Suchvertrag ab:\n  Schema:   ${searchColumns.join(', ')}\n  Vertrag:  ${SEARCH_UNIT_COLUMNS.join(', ')}`);
  process.exit(1);
}

let statements = 0;
for (const jurisdiction of JURISDICTION_IDS) {
  const records = await loadJurisdictionNorms(jurisdiction, root);
  statements += executePlan(db, buildProjectionPlan(records, { jurisdiction, full: false, now: '2026-01-01T00:00:00.000Z' }));
}
checkSearchIndexIntegrity(db);
const counts = db.native.prepare('SELECT (SELECT count(*) FROM law_norms) AS norms, (SELECT count(*) FROM law_versions) AS versions, (SELECT count(*) FROM law_search_units) AS units').get() as { norms: number; versions: number; units: number };
db.close();
console.log(`D1-Schema gültig: ${REQUIRED_TABLES.length} Tabellen, ${statements} Anweisungen, ${counts.norms} Normen, ${counts.versions} Fassungen, ${counts.units} Sucheinheiten, FTS5-Integrität geprüft.`);
