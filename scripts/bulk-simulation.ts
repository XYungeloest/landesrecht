#!/usr/bin/env node
/**
 * Offline-Simulation eines Bulk-Laufs mit mehreren Tausend synthetischen LRGV-Stammnormen – ohne Netz, mit
 * Speicher-R2, in temporären Verzeichnissen (nie im Repository).
 *
 *   node scripts/bulk-simulation.ts [--items 3000] [--stop-after 1234] [--report] [--keep]
 *
 *   1. Enumeration aus synthetischer Sitemap und Suchindex
 *   2. Schreiblauf mit Abbruchsignal (SIGINT-Pfad) nach n Stammnormen → Resume bis zum Ende
 *   3. Prüfung: keine Doppelimporte, keine verlorenen Manifesteinträge, keine halben Normen, keine Temp-Dateien,
 *      R2-Objekte vollständig und rückgelesen, Slugkollisionen aufgelöst
 *   4. Wiederholung in einem zweiten Root aus demselben Cache (offline) → fachlicher Vergleich (Determinismus)
 *   5. Coverage und D1-Projektion beider Roots (identischer Inhalt)
 * `--report` speichert den kompakten Bericht `data/audits/recht-nrw/bulk-simulation.json`.
 */
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { createR2Archive } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { createStopController, defaultItemProcessor, runBulkImport, withoutRuntimeMetadata, type ItemProcessor } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { collectCoverageInput, computeCoverage } from '@landesrecht/importer-recht-nrw/common/coverage.ts';
import { buildEnumeration, writeEnumeration } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { loadImportEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { createRechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { createMemoryR2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { readReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { syntheticFetch, syntheticLrgvSource } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { snapshotDatabase } from '@landesrecht/runtime/scale-corpus.ts';
import { executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repoRoot = resolveRepositoryRoot();
const items = Number(readOption('items') ?? 3_000);
const stopAfter = Number(readOption('stop-after') ?? Math.floor(items * 0.37));
const base = await mkdtemp(join(tmpdir(), 'landesrecht-bulk-simulation-'));
const cacheDir = join(base, 'cache');
const template = await readFile(join(repoRoot, 'tests', 'fixtures', 'recht-nrw', 'version-page-native.html'), 'utf8');
const source = syntheticLrgvSource(template, items, { collideEvery: 97 });
const started = performance.now();
const clock = { now: () => new Date('2026-09-15T12:00:00.000Z') };

async function prepareRoot(name: string): Promise<string> {
  const root = join(base, name);
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
  await cp(join(repoRoot, 'data', 'imports', 'recht-nrw', 'institution-mapping.json'), join(root, 'data', 'imports', 'recht-nrw', 'institution-mapping.json'));
  await cp(join(repoRoot, 'data', 'd1'), join(root, 'data', 'd1'), { recursive: true });
  await writeEnumeration(root, buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, now: '2026-09-15T12:00:00.000Z' }));
  return root;
}

async function run(root: string, options: { offline: boolean; resume: boolean; stopAfterItems?: number; transport: ReturnType<typeof createMemoryR2Transport> }) {
  const stop = createStopController();
  const stagingDir = join(base, `${relative(base, root)}-staging`);
  const archive = createR2Archive({ root, stagingDir, transport: options.transport, upload: 'immediate' });
  const fetcher = createRechtNrwFetcher({ cacheDir, offline: options.offline, fetchImplementation: syntheticFetch(source.pages), minDelayMs: 0, sleep: async () => undefined });
  const manifest = await readManifest(root);
  const environment = await loadImportEnvironment(root, { mode: 'bulk', archive, stagingDir, projection: 'record-only', manifest });
  let processed = 0;
  const processor: ItemProcessor = async (item, context) => {
    const outcome = await defaultItemProcessor(item, context);
    processed += 1;
    if (options.stopAfterItems !== undefined && processed === options.stopAfterItems) stop.requestStop();
    return outcome;
  };
  return runBulkImport({ root, area: 'lrgv', write: true, resume: options.resume, fetcher, environment, manifest, reviewQueue: await readReviewQueue(root), stop, processor, now: clock.now });
}

async function listFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(path)));
    else output.push(path);
  }
  return output;
}

const rootA = await prepareRoot('root-a');
const transportA = createMemoryR2Transport();
const first = await run(rootA, { offline: false, resume: false, stopAfterItems: stopAfter, transport: transportA });
const second = await run(rootA, { offline: false, resume: true, transport: transportA });
const manifestA = await readManifest(rootA);
const contentA = (await readdir(join(rootA, 'content', 'norms', 'west'))).filter((name) => !name.startsWith('.'));
const tempLeftovers = (await listFiles(rootA)).filter((file) => /\.tmp-/u.test(file));
const collisions = manifestA.entries.filter((entry) => /-\d+$/u.test(entry.targetSlug)).length;

const rootB = await prepareRoot('root-b');
const transportB = createMemoryR2Transport();
const repeat = await run(rootB, { offline: true, resume: false, transport: transportB });

const comparable = async (root: string): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  for (const file of await listFiles(root)) {
    const path = relative(root, file);
    if (path.startsWith('data/audits/recht-nrw/runs/') || path.startsWith('data/d1/')) continue;
    const text = await readFile(file, 'utf8');
    map.set(path, path.endsWith('.json') && !path.startsWith('content/') ? withoutRuntimeMetadata(JSON.parse(text)) : text);
  }
  return map;
};
const filesA = await comparable(rootA);
const filesB = await comparable(rootB);
const differing = [...new Set([...filesA.keys(), ...filesB.keys()])].filter((path) => filesA.get(path) !== filesB.get(path));

const project = async (root: string): Promise<Record<string, { rows: number; sha256: string }>> => {
  const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
  executePlan(db, buildProjectionPlan(await loadJurisdictionNorms('west', root), { jurisdiction: 'west', full: true, now: '2026-09-15T12:00:00.000Z' }));
  const snapshot = snapshotDatabase(db);
  db.close();
  return snapshot;
};
const projectionA = await project(rootA);
const projectionB = await project(rootB);
const coverage = computeCoverage(await collectCoverageInput(rootA, '2026-09-15T12:00:00.000Z'));

const report = {
  schemaVersion: 'recht-nrw-bulk-simulation/1',
  generatedAt: new Date().toISOString(),
  items,
  durationMs: Math.round(performance.now() - started),
  interruptedRun: { runStatus: first.summary.runStatus, processed: first.summary.processed, ...(first.summary.stopReason ? { stopReason: first.summary.stopReason } : {}), failures: first.summary.failures.slice(0, 5) },
  resumedRun: { runStatus: second.summary.runStatus, processed: second.summary.processed, selected: second.summary.selected, ...(second.summary.stopReason ? { stopReason: second.summary.stopReason } : {}), failures: second.summary.failures.slice(0, 5) },
  outcomes: { interrupted: first.summary.outcomes, resumed: second.summary.outcomes },
  checks: {
    everyItemProcessedOnce: first.summary.processed + second.summary.processed === items,
    noDuplicateImports: new Set(manifestA.entries.map((entry) => entry.sourceIdentity)).size === manifestA.entries.length && manifestA.entries.length === items,
    contentComplete: contentA.length === items,
    noTempLeftovers: tempLeftovers.length === 0,
    enumerationDone: second.enumeration.items.every((item) => item.status === 'done'),
    r2ObjectsVerified: transportA.objects.size > 0 && manifestA.entries.every((entry) => entry.rawDocuments.length > 0 && entry.rawDocuments.every((document) => Boolean(document.objectKey) && transportA.objects.has(document.objectKey!))),
    r2Objects: transportA.objects.size,
    slugCollisionsResolved: collisions,
    repeatOfflineNetworkRequests: repeat.summary.network.requests,
    deterministicFiles: differing.length === 0,
    differingFiles: differing.slice(0, 10),
    deterministicD1Projection: JSON.stringify(projectionA) === JSON.stringify(projectionB),
    coverageImported: coverage.lrgv.metrics.imported?.count ?? 0,
  },
  ok: false,
};
report.ok = report.checks.everyItemProcessedOnce && report.checks.noDuplicateImports && report.checks.contentComplete && report.checks.noTempLeftovers && report.checks.enumerationDone && report.checks.r2ObjectsVerified && report.checks.repeatOfflineNetworkRequests === 0 && report.checks.deterministicFiles && report.checks.deterministicD1Projection && report.checks.coverageImported === items && first.summary.runStatus === 'interrupted' && second.summary.runStatus === 'completed';
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--report')) await writeFile(join(repoRoot, 'data', 'audits', 'recht-nrw', 'bulk-simulation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (process.argv.includes('--keep')) console.error(`Simulationsverzeichnis behalten: ${base}`);
else await rm(base, { recursive: true, force: true });
process.exitCode = report.ok ? 0 : 1;
