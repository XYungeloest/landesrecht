#!/usr/bin/env node
/**
 * Tabellen-Regressionsgate (Run 16): Jede Tabelle einer gespeicherten Fassung behält ihren semantischen Fingerabdruck
 * (`scripts/lib/table-fingerprints.ts`) gegenüber dem Basis-Commit – oder die Änderung ist in
 * `data/content-table-changes.json` mit Vorher-/Nachher-Fingerabdruck und Begründung freigegeben. Eine unbegründete
 * Tabellenänderung (auch eine andere als die freigegebene) lässt das Gate scheitern. Neue Fassungsdateien sind keine
 * Regression; entfernte prüft `content:immutability`.
 *
 *   node scripts/check-table-regression.ts [--base <ref>] [--propose "<Begründung>"]
 *
 * `--propose` gibt für alle nicht freigegebenen Änderungen Einträge im Format der Freigabedatei aus (nichts wird
 * geschrieben).
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { describeTable, versionTableFingerprints, versionTables } from './lib/table-fingerprints.ts';

export const TABLE_CHANGES_PATH = 'data/content-table-changes.json';
const SCHEMA = 'landesrecht-table-changes/1';

interface ChangeEntry {
  key: string;
  before: string[];
  after: string[];
  rule: string;
  reason: string;
}
interface ChangeBlock {
  baseCommit: string;
  description: string;
  entries: ChangeEntry[];
}
interface ChangeFile {
  schemaVersion: typeof SCHEMA;
  blocks: ChangeBlock[];
}

const root = resolveRepositoryRoot();
const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const base = argument('--base') ?? 'HEAD';
const propose = argument('--propose');

const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 });

let baseCommit: string;
try {
  baseCommit = git('rev-parse', '--verify', base).trim();
} catch {
  console.log(`Kein Basis-Commit (${base}) – Tabellen-Regressionsgate übersprungen.`);
  process.exit(0);
}

const allowed = new Map<string, ChangeEntry>();
try {
  const file = JSON.parse(await readFile(join(root, TABLE_CHANGES_PATH), 'utf8')) as ChangeFile;
  if (file.schemaVersion !== SCHEMA) throw new Error(`unbekannte Schemaversion ${file.schemaVersion}`);
  for (const block of file.blocks) {
    if (!baseCommit.startsWith(block.baseCommit)) {
      console.log(`Hinweis: Freigabeblock ${TABLE_CHANGES_PATH} gilt für Basis ${block.baseCommit}, aktuelle Basis ${baseCommit.slice(0, 12)} – nicht angewandt.`);
      continue;
    }
    for (const entry of block.entries) {
      if (!entry.reason?.trim() || !entry.rule?.trim()) throw new Error(`Freigabe ${entry.key} ohne Regel oder Begründung`);
      allowed.set(entry.key, entry);
    }
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.error(`${TABLE_CHANGES_PATH}: ${(error as Error).message}`);
    process.exit(1);
  }
}

const changed = git('diff', '--name-only', baseCommit, '--', 'content/norms').split('\n').filter((line) => /\/versions\/[^/]+\.json$/u.test(line));
const problems: string[] = [];
const proposals: ChangeEntry[] = [];
let compared = 0;
let justified = 0;
let tablesBefore = 0;
let tablesAfter = 0;
for (const file of changed) {
  let committed: string;
  try {
    committed = git('show', `${baseCommit}:${file}`);
  } catch {
    continue; // neu hinzugekommen
  }
  const current = await readFile(join(root, file), 'utf8').catch(() => null);
  if (current === null) continue; // entfernt: content:immutability
  compared += 1;
  const beforeVersion = JSON.parse(committed) as { body?: [] };
  const afterVersion = JSON.parse(current) as { body?: [] };
  const before = versionTableFingerprints(beforeVersion);
  const after = versionTableFingerprints(afterVersion);
  tablesBefore += before.length;
  tablesAfter += after.length;
  if (JSON.stringify(before) === JSON.stringify(after)) continue;
  const key = file.replace(/^content\/norms\//u, '').replace(/\/versions\//u, '/').replace(/\.json$/u, '');
  const entry = allowed.get(key);
  if (entry && JSON.stringify(entry.before) === JSON.stringify(before) && JSON.stringify(entry.after) === JSON.stringify(after)) {
    justified += 1;
    continue;
  }
  const detail = `vorher ${before.length} (${versionTables(beforeVersion).map(describeTable).join('; ').slice(0, 160)}), nachher ${after.length} (${versionTables(afterVersion).map(describeTable).join('; ').slice(0, 160)})`;
  problems.push(`${key}: Tabellen ${entry ? 'anders als freigegeben' : 'ohne Freigabe'} verändert – ${detail}`);
  proposals.push({ key, before, after, rule: '', reason: propose ?? '' });
}

if (propose !== undefined) {
  console.log(JSON.stringify(proposals, null, 2));
  process.exit(0);
}
if (problems.length > 0) {
  console.error(`${problems.length} unbegründete Tabellenänderung(en) gegenüber ${baseCommit.slice(0, 12)} (Freigabe in ${TABLE_CHANGES_PATH}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Tabellen-Regressionsgate: ${compared} geänderte Fassung(en) gegen ${baseCommit.slice(0, 12)} verglichen (Tabellen ${tablesBefore} → ${tablesAfter}), ${justified} Tabellenänderung(en) begründet freigegeben, keine unbegründete.`);
