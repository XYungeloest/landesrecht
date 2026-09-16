#!/usr/bin/env node
/**
 * D1-Projektion aus dem Git-Bestand – deterministisch, je Jurisdiktion eine Datenbank.
 *
 *   node scripts/project-d1.ts --target plan [--jurisdiction west] [--incremental [--state <datei> | --since <git-ref>]]
 *       Plan-Statistik (und Änderungsdiagnose bei --incremental)
 *   node scripts/project-d1.ts --target local [--reset] [--incremental] [--jurisdiction west]
 *       data/runtime/landesrecht-<jur>.sqlite; schreibt den Projektionszustand data/runtime/projection-state-<jur>.json
 *   node scripts/project-d1.ts --target remote-plan [--jurisdiction west]
 *       eine SQL-Datei (nur für kleine Bestände)
 *   node scripts/project-d1.ts --target remote-batches [--jurisdiction west] [--incremental --since <git-ref> | --state <datei>]
 *       [--max-statements 1500] [--max-bytes 6000000] [--not-resumable]
 *       data/runtime/d1-batches/<datenbank>/NNNN.sql + plan.json + state.json für scripts/d1-apply-batches.ts
 *
 * Es wird nie automatisch gegen eine produktive Datenbank geschrieben (docs/DEPLOYMENT.md). Synthetische
 * Testfixtures werden nie projiziert.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JURISDICTION_IDS, isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { buildIncrementalProjectionPlan, projectionStateFor, type IncrementalProjection, type ProjectionState } from '@landesrecht/runtime/incremental.ts';
import { buildProjectionPlan, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const target = readOption('target') ?? 'plan';
const reset = process.argv.includes('--reset');
const incremental = process.argv.includes('--incremental') || readOption('since') !== undefined || readOption('state') !== undefined;
const since = readOption('since');
const only = readOption('jurisdiction');
if (only !== undefined && !isJurisdictionId(only)) {
  console.error(`Unbekannte Jurisdiktion: ${only}`);
  process.exit(1);
}
if (since !== undefined && !/^[\w./~^-]+$/u.test(since)) {
  console.error(`Ungültige Git-Referenz: ${since}`);
  process.exit(1);
}
const jurisdictions: JurisdictionId[] = only && isJurisdictionId(only) ? [only] : [...JURISDICTION_IDS];
const root = resolveRepositoryRoot();
const runtimeDir = join(root, 'data', 'runtime');
const migrationsDir = join(root, 'data', 'd1');
await mkdir(runtimeDir, { recursive: true });

/** Dateien außerhalb von content/, deren Änderung eine vollständige Projektion erfordert. */
const PROJECTION_LOGIC_PATHS = ['data/d1', 'packages/runtime/src/projection.ts', 'packages/search/src', 'packages/legal-core/src/config/editorial.json', 'packages/legal-core/src/lib/identity.ts', 'packages/legal-core/src/lib/versions.ts', 'packages/legal-core/src/lib/body.ts'];

function assertProductionContent(records: readonly NormRecord[], jurisdiction: string): void {
  const fixtures = records.filter((record) => (record.meta as { dataset?: string }).dataset === 'synthetic-fixture' || record.meta.slug.startsWith('testfixture-'));
  if (fixtures.length > 0) throw new Error(`${jurisdiction}: synthetische Testfixtures im Produktionsbestand (${fixtures.map((record) => record.meta.slug).join(', ')})`);
}

async function stateFromGitRef(ref: string, jurisdiction: JurisdictionId): Promise<ProjectionState | undefined> {
  const changedLogic = execFileSync('git', ['diff', '--name-only', ref, '--', ...PROJECTION_LOGIC_PATHS], { cwd: root, encoding: 'utf8' }).trim();
  if (changedLogic) {
    console.log(`  Projektionslogik seit ${ref} geändert (${changedLogic.split('\n').length} Dateien) – vollständige Projektion erforderlich.`);
    return undefined;
  }
  const temp = await mkdtemp(join(tmpdir(), 'landesrecht-projection-'));
  try {
    const tar = execFileSync('git', ['archive', '--format=tar', ref, `content/norms/${jurisdiction}`], { cwd: root, maxBuffer: 2 * 1024 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', temp], { input: tar });
    return projectionStateFor(await loadJurisdictionNorms(jurisdiction, temp), { jurisdiction });
  } catch (error) {
    if (/did not match any files|pathspec/iu.test(String((error as { stderr?: Buffer }).stderr ?? (error as Error).message))) return projectionStateFor([], { jurisdiction });
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function readState(path: string): Promise<ProjectionState | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ProjectionState;
  } catch {
    return undefined;
  }
}

for (const jurisdiction of jurisdictions) {
  const database = D1_DATABASE_NAMES[jurisdiction];
  const records = await loadJurisdictionNorms(jurisdiction, root);
  assertProductionContent(records, jurisdiction);
  const now = new Date().toISOString();
  const localStateFile = join(runtimeDir, `projection-state-${jurisdiction}.json`);
  const remoteStateFile = join(runtimeDir, `projection-state-${jurisdiction}.remote.json`);
  let projection: IncrementalProjection;
  if (incremental) {
    const explicitState = readOption('state');
    const previous = since ? await stateFromGitRef(since, jurisdiction) : await readState(explicitState ?? (target === 'remote-batches' ? remoteStateFile : localStateFile));
    projection = buildIncrementalProjectionPlan(records, previous, { jurisdiction, now });
  } else {
    projection = { plan: buildProjectionPlan(records, { jurisdiction, full: true, now }), state: projectionStateFor(records, { jurisdiction }), mode: 'full', diff: { requiresFull: true, reasons: ['vollständige Projektion angefordert'], added: [], removed: [], changedVersions: [], changedMeta: [], changedSearch: [], changedOther: [], unchanged: 0 } };
  }
  const { plan, diff } = projection;
  const summary = `${database}: ${projection.mode} · ${plan.stats.norms} Normen, ${plan.stats.versions} Fassungen, ${plan.stats.blocks} Blöcke (${plan.stats.blockParts} Teile), ${plan.stats.searchUnits} Sucheinheiten, ${plan.stats.statements} Anweisungen`;
  const diffLine = projection.mode === 'full' ? `  vollständig: ${diff.reasons.join('; ')}` : `  inkrementell: neu ${diff.added.length}, entfernt ${diff.removed.length}, Fassungen ${diff.changedVersions.length}, Metadaten ${diff.changedMeta.length}, Suche ${diff.changedSearch.length}, sonstige ${diff.changedOther.length}, unverändert ${diff.unchanged}`;

  if (target === 'plan') {
    console.log(`${summary}\n${diffLine}`);
    continue;
  }
  if (target === 'remote-plan') {
    const file = join(runtimeDir, `${database}.sql`);
    const sql = `${renderPlanSql(plan)}\n`;
    await writeFile(file, sql, 'utf8');
    console.log(`${summary}\n${diffLine}\n  → ${file} (${Math.round(Buffer.byteLength(sql) / 1024)} KiB)${Buffer.byteLength(sql) > 6_000_000 ? '\n  Warnung: Datei größer als 6 MB – für Remote-D1 --target remote-batches verwenden.' : ''}\n  Einspielen (manuell, nach Prüfung): npx wrangler d1 execute ${database} --remote --file ${file}`);
    continue;
  }
  if (target === 'remote-batches') {
    const directory = join(runtimeDir, 'd1-batches', database);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const maxStatements = readOption('max-statements');
    const maxBytes = readOption('max-bytes');
    const batches = splitPlanIntoSqlFiles(plan, { database, resumable: !process.argv.includes('--not-resumable'), ...(maxStatements ? { maxStatements: Number(maxStatements) } : {}), ...(maxBytes ? { maxBytes: Number(maxBytes) } : {}) });
    for (const file of batches.files) await writeFile(join(directory, file.name), file.sql, 'utf8');
    await writeFile(join(directory, 'plan.json'), `${JSON.stringify({ ...batches.plan, projectionMode: projection.mode, diff: { reasons: diff.reasons, added: diff.added.length, removed: diff.removed.length, changedVersions: diff.changedVersions.length, changedMeta: diff.changedMeta.length, changedSearch: diff.changedSearch.length, changedOther: diff.changedOther.length, unchanged: diff.unchanged }, targetFingerprint: projection.state.corpusFingerprint, generatedAt: now }, null, 2)}\n`, 'utf8');
    await writeFile(join(directory, 'state.json'), `${JSON.stringify(projection.state)}\n`, 'utf8');
    console.log(`${summary}\n${diffLine}\n  → ${directory}: ${batches.plan.files.length} Dateien, ${Math.round(batches.plan.totals.bytes / 1024)} KiB, größte Datei ${Math.round(Math.max(0, ...batches.plan.files.map((file) => file.bytes)) / 1024)} KiB`);
    for (const warning of batches.plan.warnings) console.log(`  Warnung: ${warning}`);
    for (const error of batches.plan.errors) console.error(`  FEHLER: ${error}`);
    console.log(`  Prüfen: npm run d1:apply:batches -- --database ${database}\n  Einspielen (manuell): npm run d1:apply:batches -- --database ${database} --execute --confirm-remote ${database}`);
    if (batches.plan.errors.length > 0) process.exitCode = 1;
    continue;
  }
  if (target === 'local') {
    const file = join(runtimeDir, `${database}.sqlite`);
    if (reset || projection.mode === 'full') await rm(file, { force: true });
    const db = await openSqliteD1(file, { migrationsDir });
    const count = executePlan(db, plan);
    checkSearchIndexIntegrity(db);
    db.close();
    await writeFile(localStateFile, `${JSON.stringify(projection.state)}\n`, 'utf8');
    console.log(`${summary}\n${diffLine}\n  → ${file} (${count} Anweisungen ausgeführt)`);
    continue;
  }
  console.error(`Unbekanntes Ziel: ${target} (plan | local | remote-plan | remote-batches)`);
  process.exit(1);
}
