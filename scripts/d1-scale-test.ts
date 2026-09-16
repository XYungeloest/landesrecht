#!/usr/bin/env node
/**
 * D1-Skalierungstest mit synthetischem Bestand (nur im Speicher; kein Produktionsinhalt, keine großen Dateien).
 *
 *   node scripts/d1-scale-test.ts [--norms 5000] [--write]
 *
 * Misst die Vollprojektion (Planerzeugung, SQL-Größe, Ausführung, Zeilen je Tabelle), die Aufteilung in
 * SQL-Dateien für Remote-D1, die inkrementelle Projektion (Textänderungen, neue Fassungen, Neuaufnahmen,
 * Entfernungen) mit Äquivalenzprüfung gegen eine frische Vollprojektion und die Basisprüfung, sowie Suchanfragen
 * auf dem großen Bestand. `--write` speichert den kompakten Bericht `data/audits/recht-nrw/d1-scale.json`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { buildIncrementalProjectionPlan, projectionStateFor } from '@landesrecht/runtime/incremental.ts';
import { buildProjectionPlan, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { buildScaleCorpus, mutateScaleCorpus, scaleSlug, snapshotDatabase } from '@landesrecht/runtime/scale-corpus.ts';
import { splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const root = resolveRepositoryRoot();
const migrationsDir = join(root, 'data', 'd1');
const norms = Number(readOption('norms') ?? 5_000);
const NOW = '2026-09-15T00:00:00.000Z';
const LATER = '2026-09-16T00:00:00.000Z';
const time = <T>(action: () => T): { value: T; ms: number } => {
  const started = performance.now();
  const value = action();
  return { value, ms: Math.round(performance.now() - started) };
};

const corpus = time(() => buildScaleCorpus(norms));
const records = corpus.value;
const plan = time(() => buildProjectionPlan(records, { jurisdiction: 'west', full: true, now: NOW }));
const rendered = time(() => renderPlanSql(plan.value));
const sqlBytes = Buffer.byteLength(rendered.value);
const db = await openSqliteD1(':memory:', { migrationsDir });
const executed = time(() => executePlan(db, plan.value));
checkSearchIndexIntegrity(db);
const count = (table: string): number => Number((db.native.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
const rows = { lawNorms: count('law_norms'), lawVersions: count('law_versions'), lawVersionBlocks: count('law_version_blocks'), searchUnits: count('law_search_units'), sourceObjects: count('law_source_objects') };
const batches = time(() => splitPlanIntoSqlFiles(plan.value, { database: 'landesrecht-west' }));

const state = projectionStateFor(records, { jurisdiction: 'west' });
const mutation = mutateScaleCorpus(records, { changed: 40, added: 12, removed: 6 });
const incremental = time(() => buildIncrementalProjectionPlan(mutation.records, state, { jurisdiction: 'west', now: LATER }));
const incrementalExecuted = time(() => executePlan(db, incremental.value.plan));
checkSearchIndexIntegrity(db);
const fresh = await openSqliteD1(':memory:', { migrationsDir });
executePlan(fresh, buildProjectionPlan(mutation.records, { jurisdiction: 'west', full: true, now: LATER }));
const equivalent = JSON.stringify(snapshotDatabase(db)) === JSON.stringify(snapshotDatabase(fresh));
let guardRejectsStaleBase = false;
try {
  executePlan(db, buildIncrementalProjectionPlan(mutation.records, state, { jurisdiction: 'west', now: LATER }).plan);
} catch {
  guardRejectsStaleBase = true;
}

const store = createD1NormStore(db, 'west');
const probe = mutation.records.find((record) => record.meta.type === 'gesetz' && record.meta.slug === scaleSlug(401)) ?? mutation.records.find((record) => record.meta.type === 'gesetz')!;
const administrative = mutation.records.find((record) => record.meta.type === 'verwaltungsvorschrift')!;
const searchChecks: Record<string, boolean> = {};
const searchTimes: Record<string, number> = {};
async function probeSearch(name: string, state: Parameters<typeof store.search>[0], check: (page: Awaited<ReturnType<typeof store.search>>) => boolean): Promise<void> {
  const started = performance.now();
  const page = await store.search(state);
  searchTimes[name] = Math.round(performance.now() - started);
  searchChecks[name] = check(page);
}
await probeSearch('title', createSearchState({ q: probe.meta.title, jurisdictions: ['west'] }), (page) => page.hits.some((hit) => hit.slug === probe.meta.slug));
await probeSearch('abbreviation', createSearchState({ q: probe.meta.abbr!, jurisdictions: ['west'] }), (page) => page.hits[0]?.slug === probe.meta.slug);
await probeSearch('paragraph', createSearchState({ q: `§ 3 ${probe.meta.abbr}`, jurisdictions: ['west'] }), (page) => page.hits.find((hit) => hit.slug === probe.meta.slug)?.unit?.anchor === 'paragraph-3');
await probeSearch('number', createSearchState({ q: `Nr. 2.1 ${administrative.meta.title}`, jurisdictions: ['west'] }), (page) => page.hits.find((hit) => hit.slug === administrative.meta.slug)?.unit?.references?.number === '2.1');
await probeSearch('type-filter', createSearchState({ q: administrative.meta.title, jurisdictions: ['west'], types: ['gesetz'] }), (page) => !page.hits.some((hit) => hit.slug === administrative.meta.slug));
db.close();
fresh.close();

const report = {
  schemaVersion: 'landesrecht-d1-scale/1',
  generatedAt: new Date().toISOString(),
  norms,
  corpusMs: corpus.ms,
  full: { planMs: plan.ms, renderMs: rendered.ms, sqlBytes, executeMs: executed.ms, statements: plan.value.stats.statements, ...rows },
  batches: { splitMs: batches.ms, files: batches.value.plan.files.length, maxFileBytes: Math.max(...batches.value.plan.files.map((file) => file.bytes)), maxFileStatements: Math.max(...batches.value.plan.files.map((file) => file.statements)), warnings: batches.value.plan.warnings.length, errors: batches.value.plan.errors.length },
  incremental: { mode: incremental.value.mode, changedText: mutation.changedText.length, newVersions: mutation.newVersions.length, added: mutation.added.length, removed: mutation.removed.length, planMs: incremental.ms, statements: incremental.value.plan.stats.statements, statementShare: Math.round((incremental.value.plan.stats.statements / plan.value.stats.statements) * 10_000) / 100, executeMs: incrementalExecuted.ms, equivalent, guardRejectsStaleBase },
  search: { checks: searchChecks, ms: searchTimes },
  ok: false,
};
report.ok = equivalent && guardRejectsStaleBase && incremental.value.mode === 'incremental' && batches.value.plan.errors.length === 0 && Object.values(searchChecks).every(Boolean) && rows.lawNorms === norms;
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--write')) {
  const file = join(root, 'data', 'audits', 'recht-nrw', 'd1-scale.json');
  await mkdir(join(root, 'data', 'audits', 'recht-nrw'), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Geschrieben: ${file}`);
}
process.exitCode = report.ok ? 0 : 1;
