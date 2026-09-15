#!/usr/bin/env node
/**
 * Unveränderlichkeit gespeicherter Fassungen: Jede Fassungsdatei, die bereits im letzten Commit
 * (HEAD) vorhanden war, muss im Arbeitsbaum byteidentisch sein. Eine neue Rechtslage erhält eine
 * neue Fassungsdatei; alte Dateien werden nie umgeschrieben. Bewusste Korrekturen (etwa
 * Berichtigungen) werden mit `--allow <jurisdiction>/<slug>/<versionId>` ausdrücklich freigegeben.
 *
 *   node scripts/check-version-immutability.ts [--base <ref>] [--allow west/schulgesetz-west/2023-12-01]
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

const root = resolveRepositoryRoot();
const baseIndex = process.argv.indexOf('--base');
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] ?? 'HEAD' : 'HEAD';
const allowed = new Set(process.argv.flatMap((argument, index) => (argument === '--allow' ? [process.argv[index + 1] ?? ''] : [])));

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

let tracked: string[];
try {
  git('rev-parse', '--verify', base);
  tracked = git('ls-tree', '-r', '--name-only', base, '--', 'content/norms').split('\n').filter((line) => /\/versions\/[^/]+\.json$/u.test(line));
} catch {
  console.log(`Kein Basis-Commit (${base}) – Unveränderlichkeitsprüfung übersprungen.`);
  process.exit(0);
}

const problems: string[] = [];
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
    if (!allowed.has(key)) problems.push(`${file}: gespeicherte Fassung wurde entfernt (Freigabe mit --allow ${key})`);
    continue;
  }
  if (current !== committed && !allowed.has(key)) problems.push(`${file}: gespeicherte Fassung wurde verändert (Freigabe mit --allow ${key})`);
}

if (problems.length > 0) {
  console.error(`${problems.length} Verstoß/Verstöße gegen die Unveränderlichkeit gespeicherter Fassungen:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Unveränderlichkeit geprüft: ${tracked.length} gespeicherte Fassung(en) gegen ${base} unverändert.`);
