#!/usr/bin/env node
/**
 * Baut die Test-Fixture `tests/fixtures/ostrecht/ostrecht-recht.sql` (SQL-Dump im OstRecht-D1-Schema) aus einem lokal
 * erzeugten OstRecht-Seed (`node scripts/d1-runtime-seed.mjs build --out <sqlite>` im Repository von OstRecht; OstRecht
 * wird nur gelesen). Die Fixture ist ein bewusst kleiner Auszug für die Tests des Read-only-Adapters – kein
 * Rechtsbestand und keine zweite Ost-Kopie; maßgeblich bleibt allein OstRecht.
 *
 *   node scripts/build-ostrecht-fixture.ts --seed <ostrecht-recht.sqlite> [--out tests/fixtures/ostrecht/ostrecht-recht.sql]
 */
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

/** Normen des Auszugs (Fälle: Mehrfachfassungen, Baseline-Regel, ausgeschlossen, künftig, aufgehoben, Änderungsakte, Typen). */
export const FIXTURE_NORMS = [
  'ostdeutsches-feiertagsgesetz', // übernommen, 3 Fassungen (Baseline 2023-11-01 + zwei Sim-Änderungen)
  'ndr-staatsvertrag', // Fassung beginnt vor der Baseline (2021-09-01) und gilt am Ausgangsrechtsstand
  'oberstufenund-abiturprufungsverordnung', // einzige Fassung endete vor der Baseline: nicht im Landesrecht-Bestand
  'gesetz-zur-einfuehrung-von-hinweisgebermeldestellen', // eigene Sim-Änderungsvorschrift, erst künftig in Kraft
  'dienstanordnung-momentane-terrorgefahr-2024', // eigene Sim-Norm, aufgehoben
  'gesetz-uber-die-einfuhrung-einer-kommunalen-privatisierungsb-zue3jo', // eigene Sim-Änderungsvorschrift (one-time-act)
  'aend-ostgemo-4399', // übernommene sächsische Änderungsvorschrift (OstRecht: außerhalb der Grundmenge)
  'ostdeutsches-landesantidiskriminierungsgesetz', // eigene Sim-Norm mit zwei Fassungen
  'abschiebe-aussetzungsverordnung', // eigene Sim-Verordnung (Einzelverkündung)
  'vertrag-heiliger-stuhl-freistaat-ostdeutschland', // Staatsvertrag
  'interreg-ostdeutschland-tschechien-2021-2027', // Förderrichtlinie
  'vwv-abschlusspruefung-fischwirt-in', // Verwaltungsvorschrift
] as const;

export const FIXTURE_PUBLICATIONS = ['ogvbl-2026-19', 'ogvbl-2026-72', 'einzelverkuendung-2024-03-01', 'stanzo-2026-44'] as const;

const seedPath = readOption('seed', '');
if (!seedPath) throw new Error('--seed <ostrecht-recht.sqlite> fehlt');
const outPath = readOption('out', `${resolveRepositoryRoot()}/tests/fixtures/ostrecht/ostrecht-recht.sql`);
const db = new DatabaseSync(seedPath, { readOnly: true });

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return `'${String(value).replace(/'/gu, "''")}'`;
}

const lines: string[] = [
  '-- Test-Fixture im OstRecht-D1-Schema (Auszug aus einem OstRecht-Seed; scripts/build-ostrecht-fixture.ts).',
  '-- Kein Rechtsbestand: dient nur den Tests des Read-only-Adapters (packages/runtime/src/ostrecht-d1-store.ts).',
  `-- Normen: ${FIXTURE_NORMS.join(', ')}`,
  `-- Verkündungen: ${FIXTURE_PUBLICATIONS.join(', ')}`,
];

// Schema in Abhängigkeitsreihenfolge: Tabellen, virtuelle Tabelle, Indizes, Trigger (FTS5-Schattentabellen entstehen mit).
const objects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN ('law_search_config', 'law_search_data', 'law_search_docsize', 'law_search_idx') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name").all() as Array<{ type: string; name: string; sql: string }>;
for (const object of objects) lines.push(`${object.sql};`);

function dumpRows(table: string, where: string, params: unknown[], orderBy: string): number {
  const rows = db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy}`).all(...(params as never[])) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const columns = Object.keys(row);
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => literal(row[column])).join(', ')});`);
  }
  return rows.length;
}

const normList = FIXTURE_NORMS.map(() => '?').join(', ');
const counts: Record<string, number> = {};
counts.law_norms = dumpRows('law_norms', `id IN (${normList})`, [...FIXTURE_NORMS], 'id');
if (counts.law_norms !== FIXTURE_NORMS.length) throw new Error(`Seed enthält nur ${counts.law_norms} von ${FIXTURE_NORMS.length} Fixture-Normen`);
counts.law_versions = dumpRows('law_versions', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, valid_from');
counts.law_version_blocks = dumpRows('law_version_blocks', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, version_id, block_index, part_index');
counts.law_source_objects = dumpRows('law_source_objects', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, version_id, source_index');
counts.law_search_units = dumpRows('law_search_units', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'id');
counts.law_search_documents = dumpRows('law_search_documents', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, version_id');
counts.law_norm_derived = dumpRows('law_norm_derived', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id');
counts.law_norm_history = dumpRows('law_norm_history', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, entry_index');
counts.law_norm_subjects = dumpRows('law_norm_subjects', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, subject_slug');
counts.law_norm_keywords = dumpRows('law_norm_keywords', `norm_id IN (${normList})`, [...FIXTURE_NORMS], 'norm_id, keyword');
counts.law_publications = dumpRows('law_publications', `slug IN (${FIXTURE_PUBLICATIONS.map(() => '?').join(', ')})`, [...FIXTURE_PUBLICATIONS], 'slug');
// Laufzeitmetadaten: Identität und Zustand wie im Seed, Zähler auf den Auszug gesetzt.
const meta = db.prepare("SELECT key, value FROM law_runtime_meta WHERE key IN ('last_sync_at', 'corpus_hash', 'projection_fingerprint', 'projection_scope', 'projection_logic_hash', 'sync_state', 'sync_mode')").all() as Array<{ key: string; value: string }>;
for (const row of meta) lines.push(`INSERT INTO law_runtime_meta (key, value) VALUES (${literal(row.key)}, ${literal(row.value)});`);
lines.push(`INSERT INTO law_runtime_meta (key, value) VALUES ('norm_count', '${counts.law_norms}');`);
lines.push(`INSERT INTO law_runtime_meta (key, value) VALUES ('publication_count', '${counts.law_publications}');`);
lines.push(`INSERT INTO law_runtime_meta (key, value) VALUES ('search_document_count', '${counts.law_search_documents}');`);
lines.push("INSERT INTO law_runtime_meta (key, value) VALUES ('landesrecht_fixture', 'ostrecht-schema-excerpt');");

writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`Fixture geschrieben: ${outPath}`, JSON.stringify(counts), `${Math.round(lines.join('\n').length / 1024)} KiB`);
