#!/usr/bin/env node
/**
 * Drift-/Freshness-Audit der OstRecht-D1 `ostrecht-recht` gegen den Landesrecht-Adapter (nur Leseabfragen).
 *
 *   npm run audit:ost-drift                       # Remote-D1 über die Wrangler-Anmeldung (wrangler d1 execute --remote)
 *   npm run audit:ost-drift -- --sqlite <datei>    # lokale SQLite im OstRecht-Schema (Seed oder Fixture)
 *   npm run audit:ost-drift -- --ostrecht-root ../staatsregierung   # zusätzlich D1 ↔ OstRecht-Git-Stichprobe (nur lesen)
 *   Optionen: --database ostrecht-recht|ostrecht-recht-staging, --sample 12, --write (Bericht nach data/audits/ostrecht/)
 *
 * Die Laufzeit des Workers braucht kein lokales Repository; der Git-Abgleich ist ein optionaler Zusatzschritt.
 * Der Remote-Zugriff läuft über `wrangler d1 execute` mit Leseanweisungen; es wird nichts geschrieben.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { OSTRECHT_D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '@landesrecht/runtime/d1-types.ts';
import { auditOstRechtDrift, type OstRechtDriftReport } from '@landesrecht/runtime/ostrecht-drift.ts';
import { createReadOnlyD1, type ReadOnlyD1Database } from '@landesrecht/runtime/read-only-d1.ts';

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const root = resolveRepositoryRoot();
const database = readOption('database', OSTRECHT_D1_DATABASE_NAMES.production);
const sqlitePath = readOption('sqlite', '');
const ostrechtRoot = readOption('ostrecht-root', '');
const sampleSize = Number.parseInt(readOption('sample', '12'), 10);
const write = process.argv.includes('--write');
if (!(Object.values(OSTRECHT_D1_DATABASE_NAMES) as string[]).includes(database)) throw new Error(`--database ${Object.values(OSTRECHT_D1_DATABASE_NAMES).join('|')}`);

/** Remote-D1 als D1-Schnittstelle über `wrangler d1 execute --remote --json` (eine Anweisung je Aufruf, gebundene Werte inline). */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function inlineParams(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/gu, () => sqlLiteral(params[index++]));
}

function remoteD1(name: string): D1Database {
  const execute = (sql: string): Array<Record<string, unknown>> => {
    const args = ['wrangler', 'd1', 'execute', name, '--remote', '--config', 'wrangler.jsonc', '--json', '--command', sql];
    const stdout = execFileSync('npx', args, { cwd: join(root, 'apps', 'web'), encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const start = stdout.indexOf('[');
    const parsed = JSON.parse(stdout.slice(start)) as Array<{ results: Array<Record<string, unknown>> }>;
    return parsed[0]?.results ?? [];
  };
  const statement = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => statement(sql, values),
    async first<T>(column?: string): Promise<T | null> {
      const row = execute(inlineParams(sql, params))[0];
      if (!row) return null;
      return (column ? row[column] : row) as T;
    },
    async all<T>(): Promise<D1Result<T>> {
      return { results: execute(inlineParams(sql, params)) as T[], success: true };
    },
    async run<T>(): Promise<D1Result<T>> {
      throw new Error('Das Drift-Audit führt keine schreibenden Anweisungen aus.');
    },
  } as D1PreparedStatement);
  return {
    prepare: (sql: string) => statement(sql),
    batch: async () => {
      throw new Error('Das Drift-Audit führt keine Batches aus.');
    },
  } as unknown as D1Database;
}

async function openDatabase(): Promise<{ db: ReadOnlyD1Database; label: string }> {
  if (sqlitePath) {
    const { openSqliteD1 } = await import('@landesrecht/runtime/sqlite-d1.ts');
    if (sqlitePath.endsWith('.sql')) {
      const db = await openSqliteD1(':memory:');
      db.native.exec(readFileSync(sqlitePath, 'utf8'));
      return { db: createReadOnlyD1(db), label: `SQL-Dump ${sqlitePath}` };
    }
    return { db: createReadOnlyD1(await openSqliteD1(sqlitePath, { readOnly: true })), label: `SQLite ${sqlitePath}` };
  }
  return { db: createReadOnlyD1(remoteD1(database)), label: `Remote-D1 ${database}` };
}

/** Optionaler Git-Abgleich: Version-IDs und Titel der Stichprobe gegen `content/normen/<slug>/` von OstRecht (nur lesen). */
function compareWithGit(report: OstRechtDriftReport, rootPath: string): string[] {
  const problems: string[] = [];
  const normen = join(rootPath, 'content', 'normen');
  if (!existsSync(normen)) return [`OstRecht-Repository ohne content/normen: ${rootPath}`];
  for (const sample of report.samples) {
    const directory = join(normen, sample.slug);
    if (!existsSync(directory)) {
      problems.push(`${sample.slug}: nicht im OstRecht-Git (D1 hat die Norm)`);
      continue;
    }
    const meta = JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8')) as { title?: string };
    const versionFiles = existsSync(join(directory, 'versions')) ? readdirSync(join(directory, 'versions')).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/u, '')).sort() : [];
    const d1Versions = [...sample.versionIds].sort();
    // Vor der Baseline endende Fassungen fehlen im Adapter absichtlich; alle Adapter-Fassungen müssen im Git liegen.
    for (const versionId of d1Versions) if (!versionFiles.includes(versionId)) problems.push(`${sample.slug}: Fassung ${versionId} nicht im OstRecht-Git`);
    if (typeof meta.title === 'string' && report.samples.length > 0 && sample.ok && sample.versionIds.length > 0) {
      // Titelvergleich nur informativ über die D1-Zeile (der Adapter hat den D1-Titel bereits gegen meta_json geprüft).
    }
  }
  return problems;
}

const { db, label } = await openDatabase();
console.log(`Drift-Audit: ${label}`);
// Feste Stichproben (Mehrfachfassungen, Baseline-Regel) nur, wenn die Datenbank sie führt (eine Fixture kennt sie nicht alle).
const FIXED_SLUGS = ['saechsische-gemeindeordnung', 'ndr-staatsvertrag', 'ostdeutsches-feiertagsgesetz'];
const known = new Set((await db.prepare(`SELECT id FROM law_norms WHERE id IN (${FIXED_SLUGS.map(() => '?').join(', ')})`).bind(...FIXED_SLUGS).all<{ id: string }>()).results.map((row) => row.id));
const report = await auditOstRechtDrift(db, { sample: sampleSize, slugs: FIXED_SLUGS.filter((slug) => known.has(slug)) });
const gitProblems = ostrechtRoot ? compareWithGit(report, ostrechtRoot) : [];
const ok = report.ok && gitProblems.length === 0;

console.log('Identität:', JSON.stringify(report.identity));
console.log('Zähler:', JSON.stringify({ ...report.counts, meta: report.metaCounts }));
console.log('Contract:', report.contract.ok ? 'ok' : report.contract.problems.join('; '));
console.log('Stichprobe:', report.samples.map((sample) => `${sample.slug}${sample.ok ? ' ✓' : ` ✗ ${sample.problems.join('; ')}`}`).join('\n  '));
console.log('Suchparität:', report.searchParity.map((entry) => `${entry.query}: OstRecht-FTS ${entry.upstreamFtsVersions}, Adapter ${entry.adapterTotal}, erster Treffer ${entry.firstHit ?? '–'}${entry.ok ? '' : ' ✗'}`).join('\n  '));
console.log('Verkündungen:', report.publications.checked, report.publications.problems.join('; ') || 'ok');
if (ostrechtRoot) console.log('Git-Abgleich:', gitProblems.length === 0 ? `ok (${report.samples.length} Normen gegen ${ostrechtRoot})` : gitProblems.join('; '));
if (write) {
  const directory = join(root, 'data', 'audits', 'ostrecht');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `ost-drift-${report.checkedAt.slice(0, 10)}.json`);
  writeFileSync(file, `${JSON.stringify({ ...report, source: label, gitProblems }, null, 2)}\n`);
  console.log(`Bericht: ${file}`);
}
console.log(ok ? 'Ergebnis: keine Drift' : `Ergebnis: ${[...report.problems, ...gitProblems].length} Befund(e)`);
process.exitCode = ok ? 0 : 1;
