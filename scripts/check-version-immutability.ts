#!/usr/bin/env node
/**
 * Unveränderlichkeit gespeicherter Fassungen: Jede Fassungsdatei, die bereits im letzten Commit
 * (HEAD) vorhanden war, muss im Arbeitsbaum byteidentisch sein. Eine neue Rechtslage erhält eine
 * neue Fassungsdatei; alte Dateien werden nie umgeschrieben.
 *
 * Freigaben:
 *   --allow <jurisdiction>/<slug>/<versionId>        einzelne bewusste Korrektur (z. B. Berichtigung)
 *   data/content-immutability-exceptions.json        dokumentierte, an einen Basis-Commit gebundene Freigaben
 *                                                    (z. B. kontrollierte Neuerzeugung von Ausgangsfassungen);
 *                                                    sie gelten nur, solange genau dieser Commit die Basis ist
 * Verschobene synthetische Testfixtures (byteidentisch unter tests/fixtures/content/) gelten nicht als entfernt.
 *
 *   node scripts/check-version-immutability.ts [--base <ref>] [--allow west/<slug>/2023-12-01]
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

interface ExceptionFile {
  schemaVersion: 'landesrecht-immutability-exceptions/1';
  baseCommit: string;
  description: string;
  entries: Array<{ key: string; kind: 'regenerated' | 'removed'; reason: string }>;
}

const root = resolveRepositoryRoot();
const baseIndex = process.argv.indexOf('--base');
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] ?? 'HEAD' : 'HEAD';
const allowed = new Map<string, string>(process.argv.flatMap((argument, index) => (argument === '--allow' ? [[process.argv[index + 1] ?? '', 'Kommandozeile'] as [string, string]] : [])));

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 });
}

let tracked: string[];
let baseCommit: string;
try {
  baseCommit = git('rev-parse', '--verify', base).trim();
  tracked = git('ls-tree', '-r', '--name-only', base, '--', 'content/norms').split('\n').filter((line) => /\/versions\/[^/]+\.json$/u.test(line));
} catch {
  console.log(`Kein Basis-Commit (${base}) – Unveränderlichkeitsprüfung übersprungen.`);
  process.exit(0);
}

try {
  const exceptions = JSON.parse(await readFile(join(root, 'data', 'content-immutability-exceptions.json'), 'utf8')) as ExceptionFile;
  if (exceptions.schemaVersion !== 'landesrecht-immutability-exceptions/1') throw new Error(`unbekannte Schemaversion ${exceptions.schemaVersion}`);
  if (exceptions.baseCommit && baseCommit.startsWith(exceptions.baseCommit)) {
    for (const entry of exceptions.entries) {
      if (!entry.reason?.trim()) throw new Error(`Freigabe ${entry.key} ohne Begründung`);
      allowed.set(entry.key, `${entry.kind}: ${entry.reason}`);
    }
    console.log(`Dokumentierte Freigaben für Basis ${exceptions.baseCommit}: ${exceptions.entries.length}`);
  } else {
    console.log(`Hinweis: data/content-immutability-exceptions.json gilt für Basis ${exceptions.baseCommit}, aktuelle Basis ${baseCommit.slice(0, 12)} – nicht angewandt.`);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.error(`data/content-immutability-exceptions.json: ${(error as Error).message}`);
    process.exit(1);
  }
}

const problems: string[] = [];
let relocated = 0;
let released = 0;
for (const file of tracked) {
  const committed = git('show', `${base}:${file}`);
  let current: string | null;
  try {
    current = await readFile(join(root, file), 'utf8');
  } catch {
    current = null;
  }
  const key = file.replace(/^content\/norms\//u, '').replace(/\/versions\//u, '/').replace(/\.json$/u, '');
  if (current === null) {
    const fixture = await readFile(join(root, 'tests', 'fixtures', file), 'utf8').catch(() => null);
    if (fixture === committed) {
      relocated += 1;
      continue;
    }
    if (allowed.has(key)) {
      released += 1;
      continue;
    }
    problems.push(`${file}: gespeicherte Fassung wurde entfernt (Freigabe mit --allow ${key})`);
    continue;
  }
  if (current !== committed) {
    if (allowed.has(key)) {
      released += 1;
      continue;
    }
    problems.push(`${file}: gespeicherte Fassung wurde verändert (Freigabe mit --allow ${key})`);
  }
}

if (problems.length > 0) {
  console.error(`${problems.length} Verstoß/Verstöße gegen die Unveränderlichkeit gespeicherter Fassungen:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Unveränderlichkeit geprüft: ${tracked.length} gespeicherte Fassung(en) gegen ${base}: ${tracked.length - relocated - released} unverändert, ${released} dokumentiert freigegeben, ${relocated} als Testfixture verschoben.`);
