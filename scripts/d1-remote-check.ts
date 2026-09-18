#!/usr/bin/env node
/**
 * Lokal ↔ Remote-Konsistenzprüfung der West-D1 (nur Lesezugriffe über die Wrangler-Anmeldung):
 * Zähler (Normen, Fassungen, Blöcke, Sucheinheiten, FTS), Typ- und Jurisdiktionsverteilung, Laufzeitmetadaten
 * sowie deterministische Stichproben-Fingerabdrücke je Norm (Längen von meta/history/version, Blockanzahl,
 * Blocksumme) – keine vollständigen Texte über das Netz.
 *
 *   node scripts/d1-remote-check.ts [--database landesrecht-west] [--sample 30] [--write]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const root = resolveRepositoryRoot();
const database = readOption('database', 'landesrecht-west');
const sampleSize = Number.parseInt(readOption('sample', '30'), 10);
const write = process.argv.includes('--write');
if (!/^landesrecht-(?:west|nsh|ost|baywue)$/u.test(database)) throw new Error('--database landesrecht-<jur>');

type Row = Record<string, unknown>;
function query(target: 'local' | 'remote', sql: string): Row[] {
  const args = ['wrangler', 'd1', 'execute', database, target === 'local' ? '--local' : '--remote', '--config', 'wrangler.jsonc', '--json', '--command', sql];
  const stdout = execFileSync('npx', args, { cwd: join(root, 'apps', 'web'), encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const start = stdout.indexOf('[');
  const parsed = JSON.parse(stdout.slice(start)) as Array<{ results: Row[] }>;
  return parsed[0]?.results ?? [];
}

const CHECKS: Array<{ name: string; sql: string }> = [
  { name: 'law_norms', sql: 'SELECT COUNT(*) AS n FROM law_norms' },
  { name: 'law_versions', sql: 'SELECT COUNT(*) AS n FROM law_versions' },
  { name: 'law_version_blocks', sql: 'SELECT COUNT(*) AS n FROM law_version_blocks' },
  { name: 'law_search_units', sql: 'SELECT COUNT(*) AS n FROM law_search_units' },
  { name: 'law_search (FTS)', sql: 'SELECT COUNT(*) AS n FROM law_search' },
  { name: 'Typverteilung', sql: 'SELECT type, COUNT(*) AS n FROM law_norms GROUP BY type ORDER BY type' },
  { name: 'Jurisdiktionen', sql: 'SELECT jurisdiction, COUNT(*) AS n FROM law_norms GROUP BY jurisdiction ORDER BY jurisdiction' },
  { name: 'Laufzeitmetadaten', sql: "SELECT key, value FROM law_runtime_meta WHERE key NOT IN ('last_projected_at') ORDER BY key" },
  { name: 'Blocksumme', sql: 'SELECT SUM(LENGTH(block_json)) AS bytes FROM law_version_blocks' },
  { name: 'Sucheinheiten-Bytes', sql: 'SELECT SUM(LENGTH(body)) AS bytes FROM law_search_units' },
];

function sampleSql(): string {
  // Deterministisch: Slugs alphabetisch, gleichmäßig verteilte Positionen (Schrittweite aus der Gesamtzahl).
  return `WITH ordered AS (SELECT id, slug, ROW_NUMBER() OVER (ORDER BY slug) AS pos, COUNT(*) OVER () AS total FROM law_norms)
    SELECT o.slug, LENGTH(n.meta_json) AS meta_len, LENGTH(n.history_json) AS history_len,
           (SELECT COUNT(*) FROM law_version_blocks b WHERE b.norm_id = n.id) AS blocks,
           (SELECT SUM(LENGTH(b.block_json)) FROM law_version_blocks b WHERE b.norm_id = n.id) AS block_bytes,
           (SELECT COUNT(*) FROM law_search_units u WHERE u.norm_id = n.id) AS units,
           (SELECT SUM(LENGTH(v.version_json)) FROM law_versions v WHERE v.norm_id = n.id) AS version_bytes
    FROM ordered o JOIN law_norms n ON n.id = o.id
    WHERE (o.pos - 1) % MAX(1, o.total / ${sampleSize}) = 0 ORDER BY o.slug LIMIT ${sampleSize}`;
}

const results: Array<{ name: string; equal: boolean; local: unknown; remote: unknown }> = [];
for (const check of [...CHECKS, { name: `Stichprobe (${sampleSize} Normen)`, sql: sampleSql() }]) {
  const local = query('local', check.sql);
  const remote = query('remote', check.sql);
  const equal = JSON.stringify(local) === JSON.stringify(remote);
  results.push({ name: check.name, equal, local, remote });
  const summary = (rows: Row[]): string => (rows.length === 1 ? JSON.stringify(rows[0]) : `${rows.length} Zeilen`);
  console.log(`${equal ? 'OK  ' : 'DIFF'} ${check.name}: lokal ${summary(local)} | remote ${summary(remote)}`);
  if (!equal) {
    for (let index = 0; index < Math.max(local.length, remote.length); index += 1) {
      if (JSON.stringify(local[index]) !== JSON.stringify(remote[index])) console.log(`      Zeile ${index}: lokal ${JSON.stringify(local[index])} | remote ${JSON.stringify(remote[index])}`);
    }
  }
}
const differences = results.filter((result) => !result.equal).length;
console.log(differences === 0 ? `Lokal ↔ Remote (${database}): identisch in ${results.length} Prüfungen.` : `Lokal ↔ Remote (${database}): ${differences} Abweichung(en).`);
if (write) {
  // Je Datenbank ihr eigenes Auditverzeichnis. Der Pfad war fest auf West gesetzt – ein Lauf für
  // eine andere Jurisdiktion überschrieb damit den West-Bericht, und die West-Readiness las danach
  // fremde Zahlen. West behält seinen Pfad unverändert.
  const AUDIT_SYSTEM: Record<string, string> = { 'landesrecht-west': 'recht-nrw', 'landesrecht-baywue': 'bayernrecht', 'landesrecht-nsh': 'juris-sh', 'landesrecht-ost': 'ostrecht' };
  const directory = join(root, 'data', 'audits', AUDIT_SYSTEM[database]!, 'd1');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'D1_REMOTE_CHECK.json'), `${JSON.stringify({ schemaVersion: 'landesrecht-d1-remote-check/1', database, checkedAt: new Date().toISOString(), sampleSize, differences, results }, null, 2)}\n`);
  console.log(`Geschrieben: data/audits/${AUDIT_SYSTEM[database]}/d1/D1_REMOTE_CHECK.json`);
}
process.exitCode = differences === 0 ? 0 : 1;
