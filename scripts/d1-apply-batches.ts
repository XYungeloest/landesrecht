#!/usr/bin/env node
/**
 * Spielt die SQL-Dateien aus `data/runtime/d1-batches/<datenbank>/` (scripts/project-d1.ts --target remote-batches)
 * nacheinander ein – nur mit ausdrücklicher Bestätigung und mit Resume-Protokoll.
 *
 *   node scripts/d1-apply-batches.ts --database landesrecht-west
 *       Dry-run: prüft SHA-256 und Reihenfolge, zeigt offene Dateien und Befehle
 *   node scripts/d1-apply-batches.ts --database landesrecht-west --local --execute
 *       lokale Miniflare-D1 (apps/web/.wrangler/state)
 *   node scripts/d1-apply-batches.ts --database landesrecht-west --execute --confirm-remote landesrecht-west [--resume]
 *       Remote-D1: Datei für Datei, Wiederholung bei vorübergehenden Fehlern, Protokoll apply-state.json
 *       (lokale Läufe protokollieren getrennt in apply-state.local.json)
 *
 * Nach der letzten Datei wird state.json als Remote-Projektionszustand übernommen
 * (data/runtime/projection-state-<jur>.remote.json), damit die nächste inkrementelle Projektion darauf aufsetzt.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { SqlBatchPlan } from '@landesrecht/runtime/sql-batches.ts';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const database = readOption('database');
if (!database || !/^landesrecht-(?:west|nsh|ost|baywue)(?:-staging)?$/u.test(database)) {
  console.error('--database landesrecht-<jur>[-staging] ist Pflicht');
  process.exit(1);
}
const execute = process.argv.includes('--execute');
const local = process.argv.includes('--local');
const confirmed = readOption('confirm-remote') === database;
const root = resolveRepositoryRoot();
const directory = join(root, 'data', 'runtime', 'd1-batches', database);
const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')) as SqlBatchPlan & { targetFingerprint?: string };
// Getrennte Protokolle je Ziel: ein lokal eingespielter Plan darf remote nicht als „bereits eingespielt“ gelten.
const target = local ? 'local' : 'remote';
const stateFile = join(directory, local ? 'apply-state.local.json' : 'apply-state.json');
const applyState = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, 'utf8')) as { target: string; applied: Array<{ name: string; sha256: string; appliedAt: string }> }) : { target, applied: [] };
if (applyState.target !== target) {
  console.error(`${stateFile}: Protokoll gehört zum Ziel „${applyState.target}“, nicht „${target}“ – Datei umbenennen oder entfernen`);
  process.exit(1);
}

for (const file of plan.files) {
  const digest = createHash('sha256').update(readFileSync(join(directory, file.name), 'utf8')).digest('hex');
  if (digest !== file.sha256) {
    console.error(`${file.name}: SHA-256 weicht vom Plan ab – Plan neu erzeugen`);
    process.exit(1);
  }
}
if (plan.errors.length > 0) {
  console.error(`Plan enthält Fehler: ${plan.errors.join('; ')}`);
  process.exit(1);
}
const appliedNames = new Set(applyState.applied.map((entry) => entry.name));
for (const entry of applyState.applied) {
  const file = plan.files.find((candidate) => candidate.name === entry.name);
  if (!file || file.sha256 !== entry.sha256) {
    console.error(`apply-state.json passt nicht zum Plan (${entry.name}); Plan und Protokoll gehören nicht zusammen`);
    process.exit(1);
  }
}
const pending = plan.files.filter((file) => !appliedNames.has(file.name));
console.log(`${database}: ${plan.mode}, ${plan.files.length} Dateien, ${Math.round(plan.totals.bytes / 1024)} KiB, bereits eingespielt ${applyState.applied.length}, offen ${pending.length}`);
if (pending.length > 0 && applyState.applied.length > 0 && !process.argv.includes('--resume')) {
  console.error('Es wurden bereits Dateien eingespielt – mit --resume fortsetzen.');
  process.exit(1);
}
if (!execute) {
  for (const file of pending.slice(0, 10)) console.log(`  offen: ${file.name} (${file.statements} Anweisungen, ${Math.round(file.bytes / 1024)} KiB, ${file.firstGroup} … ${file.lastGroup})`);
  console.log(`Dry-run. Einspielen: node scripts/d1-apply-batches.ts --database ${database} ${local ? '--local ' : ''}--execute${local ? '' : ` --confirm-remote ${database}`}`);
  process.exit(0);
}
if (!local && !confirmed) {
  console.error(`Remote-Einspielen braucht --confirm-remote ${database}`);
  process.exit(1);
}

const TRANSIENT = /network|timeout|ECONNRESET|ETIMEDOUT|429|5\d\d|ServiceUnavailable|Authentication error \[code: 10000\]/iu;
for (const file of pending) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      execFileSync('npx', ['wrangler', 'd1', 'execute', database, local ? '--local' : '--remote', '--config', 'wrangler.jsonc', '--file', join(directory, file.name), '--yes'], { cwd: join(root, 'apps', 'web'), stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
      break;
    } catch (error) {
      const message = String((error as { stderr?: Buffer }).stderr ?? (error as Error).message);
      if (attempt >= 6 || !TRANSIENT.test(message)) {
        console.error(`${file.name}: fehlgeschlagen (${message.slice(0, 400)}). Fortsetzen mit --resume nach Prüfung.`);
        process.exit(1);
      }
      const wait = Math.min(5_000 * attempt, 30_000);
      console.error(`${file.name}: vorübergehender Fehler, Wiederholung in ${wait / 1000} s`);
      execFileSync('sleep', [String(wait / 1000)]);
    }
  }
  applyState.applied.push({ name: file.name, sha256: file.sha256, appliedAt: new Date().toISOString() });
  writeFileSync(`${stateFile}.tmp`, `${JSON.stringify(applyState, null, 2)}\n`);
  renameSync(`${stateFile}.tmp`, stateFile);
  console.log(`  eingespielt ${file.name} (${applyState.applied.length}/${plan.files.length})`);
}
if (!local) copyFileSync(join(directory, 'state.json'), join(root, 'data', 'runtime', `projection-state-${plan.jurisdiction}.remote.json`));
console.log(`${database}: vollständig eingespielt${local ? ' (lokal)' : '; Remote-Projektionszustand übernommen'}.`);
