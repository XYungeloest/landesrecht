#!/usr/bin/env node
/**
 * Performance-Baseline (Median/P95) für den West-Bestand – lokal gegen die Miniflare-D1-Datei (nur lesend) und
 * optional eine kleine Remote-Messreihe gegen die deployte Site. Kein Microbenchmark: wenige Läufe je Fall.
 *
 *   node scripts/perf-baseline.ts [--runs 5] [--remote https://…workers.dev] [--write]
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const root = resolveRepositoryRoot();
const runs = Number.parseInt(readOption('runs', '5'), 10);
const remote = readOption('remote', '').replace(/\/$/u, '');
const write = process.argv.includes('--write');

function stats(samples: number[]): { median: number; p95: number; min: number; max: number } {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (quantile: number): number => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]!;
  return { median: Math.round(at(0.5)), p95: Math.round(at(0.95)), min: Math.round(sorted[0]!), max: Math.round(sorted[sorted.length - 1]!) };
}

async function measure(label: string, action: () => Promise<unknown>, count = runs): Promise<{ label: string; runs: number; ms: ReturnType<typeof stats> }> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    await action();
    samples.push(performance.now() - start);
  }
  const ms = stats(samples);
  console.log(`${label.padEnd(44)} median ${String(ms.median).padStart(6)} ms  p95 ${String(ms.p95).padStart(6)} ms  (${count} Läufe)`);
  return { label, runs: count, ms };
}

async function main(): Promise<void> {
  const d1Dir = join(root, 'apps', 'web', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  // Mehrere Datenbankdateien (je Bindung eine): die West-Projektion ist die mit Abstand größte.
  const file = existsSync(d1Dir)
    ? readdirSync(d1Dir).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite').sort((left, right) => statSync(join(d1Dir, right)).size - statSync(join(d1Dir, left)).size)[0]
    : undefined;
  if (!file) throw new Error('Lokale D1 nicht gefunden (apps/web/.wrangler/state/v3/d1); zuerst d1:apply:batches --local');
  const db = await openSqliteD1(join(d1Dir, file), { readOnly: true });
  const store = createD1NormStore(db, 'west');
  const local: Array<Awaited<ReturnType<typeof measure>>> = [];
  const search = (q: string, extra: Record<string, unknown> = {}) => () => store.search(createSearchState({ q, jurisdictions: ['west'], limit: 20, ...extra }));

  console.log(`Lokal (Miniflare-D1 ${file.slice(0, 12)}…, ${runs} Läufe je Fall):`);
  local.push(await measure('Content laden (alle West-Normen, Dateien)', () => loadJurisdictionNorms('west', root)));
  local.push(await measure('D1 Normliste (500)', () => store.listNormSummaries({ limit: 500 })));
  local.push(await measure('D1 Typzähler', () => store.countNormsByType()));
  local.push(await measure('Suche exakter Titel (Ladenöffnungszeiten)', search('Gesetz zur Regelung der Ladenöffnungszeiten')));
  local.push(await measure('Suche Abkürzung „LÖG West“', search('LÖG West')));
  local.push(await measure('Suche Abkürzung „DVO KiBiz“', search('DVO KiBiz')));
  local.push(await measure('Suche Volltext „Erlaubnis“', search('Erlaubnis')));
  local.push(await measure('Suche §-Adresse „§ 5 LÖG West“', search('§ 5 LÖG West')));
  local.push(await measure('Suche VwV „Nr. 4.2 VV LHundG West“', search('Nr. 4.2 VV LHundG West')));
  local.push(await measure('Suche Typfilter VwV „Erlaubnis“', search('Erlaubnis', { types: ['verwaltungsvorschrift'] })));
  local.push(await measure('Suche langer Titel (Verfassung)', search('Verfassung für das Land Westdeutschland')));

  const remoteResults: Array<Awaited<ReturnType<typeof measure>>> = [];
  if (remote) {
    console.log(`Remote (${remote}, ${Math.min(runs, 3)} Läufe je Fall):`);
    const fetchPage = (path: string) => async () => { const response = await fetch(remote + path); await response.text(); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); };
    for (const [label, path] of [
      ['Länderseite /west/', '/west/'],
      ['Norm LÖG', '/west/norm/loeg-west/'],
      ['Suche Abkürzung „LÖG West“', '/suche/?q=L%C3%96G%20West&jurisdiction=west'],
      ['Suche Volltext „Erlaubnis“', '/suche/?q=Erlaubnis&jurisdiction=west'],
      ['Suche §-Adresse „§ 5 LÖG West“', '/suche/?q=%C2%A7%205%20L%C3%96G%20West&jurisdiction=west'],
    ] as const) remoteResults.push(await measure(label, fetchPage(path), Math.min(runs, 3)));
  }

  const report = { schemaVersion: 'landesrecht-performance-baseline/1', measuredAt: new Date().toISOString(), runs, node: process.version, local, ...(remote ? { remote: { url: remote, results: remoteResults } } : {}) };
  if (write) {
    const directory = join(root, 'data', 'audits', 'performance');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`);
    const lines = ['# Performance-Baseline', '', `Gemessen ${report.measuredAt}, ${runs} Läufe je Fall, Node ${process.version}. Median/P95 in ms.`, '', '## Lokal (Miniflare-D1, lesend)', '', '| Fall | Median | P95 |', '| --- | ---: | ---: |', ...local.map((entry) => `| ${entry.label} | ${entry.ms.median} | ${entry.ms.p95} |`)];
    if (remote) lines.push('', `## Remote (${remote})`, '', '| Fall | Median | P95 |', '| --- | ---: | ---: |', ...remoteResults.map((entry) => `| ${entry.label} | ${entry.ms.median} | ${entry.ms.p95} |`));
    writeFileSync(join(directory, 'BASELINE.md'), `${lines.join('\n')}\n`);
    console.log('Geschrieben: data/audits/performance/baseline.json, BASELINE.md');
  }
}

await main();
