/**
 * Bulk-Befehle des RECHT.NRW-CLI: enumerate, bulk, r2-sync, coverage, readiness, search-audit,
 * reconstruction-queue. Dry-run ist Standard; Netzabrufe laufen nur über den zentralen Fetcher mit Budget.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { isJurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isNormType, NORM_TYPES } from '@landesrecht/legal-core/lib/schema.ts';

import type { CliOptions, Io } from './cli.ts';
import { assertArchiveAllowed, createR2Archive, DEFAULT_R2_STAGING_DIR, maxSyncConcurrency, R2_SOURCES_BUCKET, syncStagedObjects, type RawSourceArchive } from './common/archive.ts';
import { createStopController, runBulkImport, type RunSummary } from './common/bulk-runner.ts';
import { collectCoverageInput, computeCoverage, renderCoverageMarkdown, writeCoverage } from './common/coverage.ts';
import { buildEnumeration, enumerationPath, enumerationStatusCounts, fetchSearchHits, fetchSitemapUrls, readEnumeration, SEARCH_INDEX_TYPES, writeEnumeration, type SearchHit } from './common/enumeration.ts';
import { loadImportEnvironment } from './common/environment.ts';
import { createRechtNrwFetcher, DEFAULT_MIN_DELAY_MS } from './common/fetcher.ts';
import { IMPORT_DATA_DIR, readManifest, RECONSTRUCTIONS_DIR, SOURCE_AREAS, type SourceArea } from './common/manifest.ts';
import { createMemoryR2Transport, createWranglerApiR2Transport, createWranglerR2Transport, missingR2Environment, s3R2TransportFromEnv, type R2Transport } from './common/r2-transport.ts';
import { evaluateReadiness } from './common/readiness.ts';
import { readReviewQueue } from './common/review-queue.ts';
import { runSearchAudit, SEARCH_AUDIT_MODES, type SearchAuditMode, type SearchAuditOptions } from './common/search-audit.ts';
import { parseSearchMatchMode, runGoldenCommand, runRemoteSampleCommand, writeSearchAuditResult } from './common/search-golden.ts';
import { SLUG_REGISTRY_PATH } from './common/slug-registry.ts';
import { buildReconstructionQueue, listRecipes, RECONSTRUCTION_QUEUE_PATH, writeReconstructionQueue } from './lrmb/reconstruction-queue.ts';

export const DEFAULT_BULK_MAX_REQUESTS = 3_000;
export const DEFAULT_BULK_MAX_RUNTIME_MS = 8 * 3_600_000;
export const DEFAULT_ENUMERATION_MAX_REQUESTS = 250;

function requireArea(options: CliOptions): SourceArea {
  if (!options.area) throw new Error(`--area ${SOURCE_AREAS.join('|')} ist Pflicht`);
  return options.area;
}

function resolveTransport(options: CliOptions, root: string): R2Transport | undefined {
  if (options.r2Transport === 'wrangler') return createWranglerR2Transport({ bucket: process.env.R2_BUCKET ?? R2_SOURCES_BUCKET, cwd: join(root, 'apps', 'web') });
  if (options.r2Transport === 'wrangler-api') return createWranglerApiR2Transport({ bucket: process.env.R2_BUCKET ?? R2_SOURCES_BUCKET, cwd: join(root, 'apps', 'web') });
  if (options.r2Transport === 's3') return s3R2TransportFromEnv(process.env, R2_SOURCES_BUCKET);
  // Ohne Angabe: S3 nur, wenn die Umgebung vollständige Zugangsdaten setzt (CI); sonst der Standardtransport `wrangler`
  // über die bestehende Anmeldung (docs/DEPLOYMENT.md, „R2-Transporte“).
  return s3R2TransportFromEnv(process.env, R2_SOURCES_BUCKET) ?? createWranglerR2Transport({ bucket: process.env.R2_BUCKET ?? R2_SOURCES_BUCKET, cwd: join(root, 'apps', 'web') });
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

/** Testumgebung: kopiert die Steuerdateien in ein separates Ausgaberoot (nie Inhalte oder Manifest). */
export async function seedOutputRoot(repoRoot: string, outputRoot: string): Promise<string[]> {
  const seeded: string[] = [];
  await mkdir(join(outputRoot, 'content', 'norms', 'west'), { recursive: true });
  for (const relative of [enumerationPath('lrgv'), enumerationPath('lrmb'), join(IMPORT_DATA_DIR, 'overrides.json'), join(IMPORT_DATA_DIR, 'institution-mapping.json'), SLUG_REGISTRY_PATH, RECONSTRUCTIONS_DIR, join(IMPORT_DATA_DIR, 'transcriptions'), join('data', 'd1')]) {
    const source = join(repoRoot, relative);
    const target = join(outputRoot, relative);
    if (!(await exists(source)) || (await exists(target))) continue;
    await cp(source, target, { recursive: true });
    seeded.push(relative);
  }
  return seeded;
}

function gitCommit(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

export async function runEnumerateCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const area = requireArea(options);
  const fetcher = createRechtNrwFetcher({
    cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'),
    offline: options.offline,
    refresh: options.refresh,
    minDelayMs: options.minDelayMs ?? DEFAULT_MIN_DELAY_MS,
    budget: { maxRequests: options.maxRequests ?? DEFAULT_ENUMERATION_MAX_REQUESTS, maxRuntimeMs: options.maxRuntimeMs ?? 3_600_000, ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}) },
  });
  const log = (line: string): void => io.print(`  … ${line}`);
  const sitemap = await fetchSitemapUrls(fetcher, log);
  const hits: SearchHit[] = [];
  let total = 0;
  for (const indexType of SEARCH_INDEX_TYPES[area]) {
    const result = await fetchSearchHits(fetcher, indexType, log);
    hits.push(...result.hits);
    total += result.total;
  }
  const file = buildEnumeration({ area, sitemap: { pages: sitemap.pages.length, urls: sitemap.urls }, search: { total, hits }, previous: await readEnumeration(root, area), manifest: await readManifest(root), now: new Date().toISOString(), log });
  const cross = file.crosscheck;
  if (options.json) io.print(JSON.stringify({ sources: file.sources, crosscheck: cross, status: enumerationStatusCounts(file) }, null, 2));
  else {
    io.print(`Enumeration ${area.toUpperCase()} (Stichtag ${file.baselineDate})`);
    io.print(`  Sitemap: ${file.sources.sitemap.pages} Seiten, ${cross.sitemapUrls} Adressen des Bereichs, ${cross.sitemapStems} Slug-Stämme`);
    io.print(`  Suchindex: ${cross.searchHits} Treffer (${file.sources.search.indexTypes.join(', ')}; gemeldet ${file.sources.search.total}), ${cross.searchUniqueUrls} eindeutige Adressen, ${cross.searchHitsInSitemap} davon in der Sitemap`);
    io.print(`  Vereinigung ${cross.union} = Schnittmenge ${cross.intersection} + nur Sitemap ${cross.onlySitemap} + nur Suchindex ${cross.onlySearch}`);
    io.print(`  Einträge ${cross.items}: aufgelöste Term-IDs ${cross.resolvedTerms}, Vorklassifikation Review ${cross.review}, ohne Seitenabruf ausgeschlossen ${cross.excluded}`);
    const preclass: Record<string, number> = {};
    for (const item of file.items) preclass[`${item.role}/${item.preclassification.decision}`] = (preclass[`${item.role}/${item.preclassification.decision}`] ?? 0) + 1;
    io.print(`  Vorklassifikation: ${Object.entries(preclass).sort().map(([key, count]) => `${key} ${count}`).join(', ')}`);
    io.print(`  Status: ${Object.entries(enumerationStatusCounts(file)).map(([key, count]) => `${key} ${count}`).join(', ')}`);
    io.print(`  Abgleich: ${cross.ok ? 'ok' : `ABWEICHUNGEN – ${cross.problems.join('; ')}`}`);
  }
  if (options.write) io.print(`${(await writeEnumeration(root, file)) ? 'Geschrieben' : 'Unverändert'}: ${enumerationPath(area)}`);
  else io.print('Dry-run: Enumeration nicht geschrieben (mit --write speichern).');
  io.print(`Abrufe: ${fetcher.stats.networkRequests} Netz, ${fetcher.stats.cacheHits} Cache, ${Math.round((fetcher.stats.bytesDownloaded ?? 0) / 1024)} KiB`);
  return cross.ok ? 0 : 1;
}

function printRunSummary(summary: RunSummary, io: Io): void {
  io.print(`\nLauf ${summary.runId} (${summary.mode}): ${summary.runStatus}${summary.stopReason ? ` – ${summary.stopReason}` : ''}`);
  io.print(`  Ausgewählt ${summary.selected}, verarbeitet ${summary.processed}: übernommen ${summary.outcomes.imported}, mit Warnungen ${summary.outcomes.importedWithWarnings}, Dry-run ${summary.outcomes.dryRun}, Review ${summary.outcomes.review}, fehlgeschlagen ${summary.outcomes.failed}, ausgeschlossen ${summary.outcomes.excluded}, nicht am Stichtag ${summary.outcomes.notAtBaseline}, rekonstruiert ${summary.outcomes.reconstructed}, zusammengeführt ${summary.outcomes.merged}, abgetrennt ${summary.outcomes.split}`);
  io.print(`  Netz: ${summary.network.requests} Abrufe, ${summary.network.cacheHits} Cache, ${Math.round(summary.network.bytes / 1024)} KiB, ${summary.network.retries} Wiederholungen, ${summary.network.blockedResponses} Sperrantworten`);
  io.print(`  Archiv (${summary.archive.mode}): gespeichert ${summary.archive.stored}, hochgeladen ${summary.archive.uploaded}, geprüft ${summary.archive.verified}, bereits vorhanden ${summary.archive.alreadyPresent}`);
  io.print(`  Enumeration danach: ${Object.entries(summary.enumeration).map(([key, count]) => `${key} ${count}`).join(', ')}`);
  for (const failure of summary.failures.slice(0, 10)) io.print(`  ! ${failure.key}: ${failure.code} ${failure.message}`);
}

export async function runBulkCommand(options: CliOptions, repoRoot: string, io: Io): Promise<number> {
  const area = requireArea(options);
  const root = options.outputRoot ? resolve(options.outputRoot) : repoRoot;
  if (options.outputRoot) for (const seeded of await seedOutputRoot(repoRoot, root)) io.print(`  Ausgaberoot vorbereitet: ${seeded}`);
  const stop = createStopController();
  const onSignal = (signal: NodeJS.Signals): void => {
    io.error(stop.stopRequested ? `${signal}: laufender Abruf wird abgebrochen; die Stammnorm bleibt offen.` : `${signal}: Lauf endet nach der aktuellen Stammnorm (erneut drücken für sofortigen Abbruch).`);
    stop.requestStop();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_BULK_MAX_RUNTIME_MS;
    const budget = { maxRequests: options.maxRequests ?? DEFAULT_BULK_MAX_REQUESTS, maxRuntimeMs, ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}) };
    const fetcher = createRechtNrwFetcher({ cacheDir: options.cacheDir ?? join(repoRoot, '.cache', 'recht-nrw'), offline: options.offline, refresh: options.refresh, minDelayMs: options.minDelayMs ?? DEFAULT_MIN_DELAY_MS, budget, signal: stop.abort.signal });
    const stagingDir = resolve(repoRoot, options.stagingDir ?? DEFAULT_R2_STAGING_DIR);
    let archive: RawSourceArchive;
    if (options.archive === 'r2') {
      const transport = resolveTransport(options, repoRoot);
      if (!transport) {
        io.error(`R2-Zugangsdaten fehlen (${missingR2Environment(process.env).join(', ')}). Ohne Zugangsdaten: --archive staging (Standard) und später npm run import:recht-nrw:r2-sync -- --write.`);
        return 1;
      }
      archive = createR2Archive({ root: repoRoot, stagingDir, transport, upload: 'immediate' });
    } else {
      archive = createR2Archive({ root: repoRoot, stagingDir, upload: 'deferred' });
    }
    assertArchiveAllowed(repoRoot, 'bulk', archive, stagingDir);
    const manifest = await readManifest(root);
    const reviewQueue = await readReviewQueue(root);
    const environment = await loadImportEnvironment(root, { mode: 'bulk', archive, stagingDir, projection: 'record-only', manifest });
    const commit = gitCommit(repoRoot);
    io.print(`Bulk ${area.toUpperCase()} ${options.write ? 'SCHREIBLAUF' : 'Dry-run'} · Archiv ${options.archive === 'r2' ? 'R2 (sofort, Rücklesung)' : `Staging ${stagingDir}`} · Budget ${budget.maxRequests} Abrufe, ${Math.round(maxRuntimeMs / 60_000)} min, Mindestabstand ${options.minDelayMs ?? DEFAULT_MIN_DELAY_MS} ms${options.offline ? ' · offline' : ''}${options.refresh ? ' · refresh' : ''}`);
    const { summary } = await runBulkImport({
      root,
      area,
      write: options.write,
      resume: options.resume,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      only: options.only,
      refresh: options.refresh,
      retryFailed: options.retryFailed,
      retryReview: options.retryReview,
      regenerateStale: options.regenerateStale,
      fetcher,
      environment,
      maxRuntimeMs,
      budgetDescription: { maxRequests: budget.maxRequests, maxBytes: options.maxBytes ?? null, minDelayMs: options.minDelayMs ?? DEFAULT_MIN_DELAY_MS, offline: options.offline, archive: options.archive ?? 'staging' },
      manifest,
      reviewQueue,
      stop,
      ...(commit ? { gitCommit: commit } : {}),
      log: (line) => io.print(line),
    });
    if (options.json) io.print(JSON.stringify(summary, null, 2));
    else printRunSummary(summary, io);
    if (!options.write) io.print('Dry-run: nichts geschrieben (Enumeration, Manifest, Queue, Inhalte, Archiv unverändert).');
    else io.print(`Laufzusammenfassung: data/audits/recht-nrw/runs/${summary.runId}.json`);
    if (summary.runStatus === 'aborted-systemic') return 2;
    if (summary.runStatus === 'interrupted') return 130;
    return 0;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

export async function runR2SyncCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const manifest = await readManifest(root);
  const transport = options.write ? resolveTransport(options, root) : createMemoryR2Transport();
  if (!transport) {
    io.error(`R2-Zugangsdaten fehlen (${missingR2Environment(process.env).join(', ')}); kein Upload.`);
    return 1;
  }
  const maxConcurrency = maxSyncConcurrency(transport);
  if (options.concurrency !== undefined && options.concurrency > maxConcurrency) {
    io.error(`--concurrency höchstens ${maxConcurrency} für Transport ${transport.name} (begrenzte Parallelität; Vorabprüfung und Rücklesung je Objekt bleiben erhalten)`);
    return 1;
  }
  const startedAt = Date.now();
  const result = await syncStagedObjects({ root, manifest, transport, stagingDir: resolve(root, options.stagingDir ?? DEFAULT_R2_STAGING_DIR), dryRun: !options.write, ...(options.limit !== undefined ? { limit: options.limit } : {}), ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}), ...(options.verify ? { verification: options.verify } : {}), log: (line) => io.print(`  ${line}`) });
  const verificationNote = result.verification === 'etag' ? `, Listing/Etag geprüft ${result.verifiedByListing} (Objekte + Umschläge), Stichproben-Rücklesungen ${result.sampledReadbacks}, Listings ${result.listingCalls}` : '';
  io.print(`R2-Sync (${transport.name}, Bucket ${transport.bucket}, Parallelität ${Math.min(options.concurrency ?? 1, maxConcurrency)}, Prüfung ${result.verification}): ${result.pending} gestagte Objekte${options.write ? `, hochgeladen ${result.uploaded}, bereits vorhanden ${result.alreadyPresent}, Staging fehlt ${result.missingStaging.length}${verificationNote}, ${Math.round((Date.now() - startedAt) / 1000)} s` : ' (Dry-run, kein Upload)'}`);
  return result.missingStaging.length > 0 ? 1 : 0;
}

export async function runCoverageCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const report = computeCoverage(await collectCoverageInput(root, new Date().toISOString()));
  io.print(options.json ? JSON.stringify(report, null, 2) : renderCoverageMarkdown(report));
  if (options.write) for (const path of await writeCoverage(root, report)) io.print(`Geschrieben: ${path}`);
  return 0;
}

export async function runReadinessCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const result = await evaluateReadiness(root, options.requireApproval ? { requireApproval: true } : {});
  const status = result.ready ? (result.pendingHumanApproval ? 'READY WITH PENDING HUMAN APPROVAL' : 'READY') : 'NOT READY';
  if (options.json) {
    io.print(JSON.stringify({ status, ...result }, null, 2));
  } else {
    io.print(result.ready ? 'READY' : 'NOT READY');
    if (result.ready && result.pendingHumanApproval) io.print(`  (${status}: ${result.pendingHumanApproval} Legacy-Ausnahme(n) warten auf redaktionelle Freigabe – npm run import:recht-nrw:approval-status)`);
    for (const check of result.checks) io.print(`  [${check.status === 'pass' ? 'ok' : check.status === 'notice' ? 'Hinweis' : 'BLOCKER'}] ${check.label}: ${check.detail}`);
    if (result.blockers.length > 0) {
      io.print('Systemische Blocker:');
      for (const blocker of result.blockers) io.print(`  - ${blocker}`);
    }
  }
  return result.ready ? 0 : 1;
}

export async function runSearchAuditCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const jurisdiction = options.jurisdiction ?? 'west';
  if (!isJurisdictionId(jurisdiction)) throw new Error(`Unbekannte Jurisdiktion ${jurisdiction}`);
  const matchMode = options.match === undefined ? undefined : parseSearchMatchMode(options.match);
  if (options.remoteSample !== undefined) return runRemoteSampleCommand(options.remoteSample, root, io, { write: options.write, json: options.json, ...(matchMode ? { matchMode } : {}) });
  if (options.golden) return runGoldenCommand(root, io, { write: options.write, json: options.json, ...(matchMode ? { matchMode } : {}) });
  const auditOptions: SearchAuditOptions = { jurisdictions: [jurisdiction] };
  if (options.limit !== undefined) auditOptions.limit = options.limit;
  if (options.sample !== undefined) auditOptions.sample = options.sample;
  if (options.seed !== undefined) auditOptions.seed = options.seed;
  if (options.only.length > 0) auditOptions.only = options.only;
  if (options.workers !== undefined) auditOptions.workers = options.workers;
  if (matchMode) auditOptions.matchMode = matchMode;
  if (options.mode !== undefined) {
    if (!(SEARCH_AUDIT_MODES as readonly string[]).includes(options.mode)) throw new Error(`--mode erwartet ${SEARCH_AUDIT_MODES.join('|')}`);
    auditOptions.mode = options.mode as SearchAuditMode;
  }
  if (options.category !== undefined) {
    if (!isNormType(options.category)) throw new Error(`--category erwartet einen Normtyp (${NORM_TYPES.join('|')})`);
    auditOptions.category = options.category;
  }
  const result = await runSearchAudit(root, auditOptions);
  if (options.json) io.print(JSON.stringify(result, null, 2));
  else {
    const profile = result.profile;
    io.print(`Suchintegrität ${jurisdiction}: ${result.ok ? 'ok' : 'FEHLER'} (${result.norms} Normen geprüft, ${result.searchUnits} Sucheinheiten; Modus ${profile.mode}${profile.sample !== null ? `, Stichprobe ${profile.sample}, Seed ${profile.seed}` : ''}, Match ${profile.matchMode}, ${profile.workers} Worker)`);
    for (const [check, counts] of Object.entries(result.checks)) io.print(`  ${check.padEnd(20)} bestanden ${counts.passed}, fehlgeschlagen ${counts.failed}, entfällt ${counts.skipped}`);
    io.print(`  Dauer ${(profile.elapsedMs / 1000).toFixed(1)} s (Projektion ${(profile.projectionMs / 1000).toFixed(1)} s, Prüfung ${(profile.auditMs / 1000).toFixed(1)} s Worker-Summe); ${profile.searches} Suchen, ${profile.queries} SQL-Abfragen (${profile.queriesPerNorm} je Norm, ${profile.msPerNorm} ms je Norm)`);
    for (const [check, entry] of Object.entries(profile.checks)) io.print(`    ${check.padEnd(18)} ${String(entry.queries).padStart(6)} Abfragen ${String(entry.ms).padStart(8)} ms`);
    io.print(`  Top-1: exakter Titel ${profile.titleTop1.top1}/${profile.titleTop1.unique} eindeutige Titel, Abkürzung ${profile.abbreviationTop1.top1}/${profile.abbreviationTop1.unique} eindeutige Abkürzungen`);
    for (const entry of profile.slowest.slice(0, 5)) io.print(`    langsam: ${entry.slug} ${entry.ms} ms, ${entry.queries} Abfragen`);
    for (const failure of result.failures.slice(0, 20)) io.print(`  ! ${failure.slug} ${failure.check}: ${failure.detail}`);
  }
  if (options.write) {
    const path = await writeSearchAuditResult(root, result);
    io.print(`Geschrieben: ${path}`);
  }
  return result.ok ? 0 : 1;
}

export async function runReconstructionQueueCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const queue = buildReconstructionQueue(await readManifest(root), await readReviewQueue(root), await listRecipes(root));
  if (options.json) io.print(JSON.stringify(queue, null, 2));
  else {
    io.print(`Rekonstruktionsqueue: ${queue.summary.total} (offen ${queue.summary.queued}, Rezeptentwurf ${queue.summary.recipeDraft}, unsicher ${queue.summary.blockedUncertain}, übernommen ${queue.summary.imported})`);
    for (const item of queue.items) io.print(`  ${String(item.priority.score).padStart(3)} ${item.sourceIdentity.padEnd(12)} ${item.status.padEnd(18)} ${item.title.slice(0, 70)}${item.estimatedSteps !== undefined ? ` · ${item.estimatedSteps} Befehle` : ''}`);
    io.print(`  ${queue.note}`);
  }
  if (options.write) io.print(`${(await writeReconstructionQueue(root, queue)) ? 'Geschrieben' : 'Unverändert'}: ${RECONSTRUCTION_QUEUE_PATH}`);
  return 0;
}
