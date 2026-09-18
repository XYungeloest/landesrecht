/**
 * Befehl `r2-sync` des BAYERN.RECHT-Adapters: Staging → Staging-Audit → Sync → Nachprüfung → Bericht.
 *
 *   ohne --write   Dry-run: rechnet Staging und Audit durch, schreibt nichts, ruft kein Netz.
 *   --stage-only   Staging und Staging-Audit mit Schreiben, aber ohne Netz (kein Bericht).
 *   --write        vollständig: Staging, Audit (sperrt bei Befund), Bucketinventar vorher, Sync, Nachprüfung
 *                  (Listing, deterministische Byte-Stichprobe), Bucketinventar nachher, Bericht
 *                  `data/audits/bayernrecht/R2_AUDIT.{json,md}`.
 *
 * Anmeldung ausschließlich über die bestehende Wrangler-OAuth-Anmeldung: Transport `wrangler` (Wrangler-Prozesse)
 * oder `wrangler-api` (R2-Objekt-API mit dem OAuth-Token aus Wranglers eigener Anmeldedatei). Ein gesetztes
 * `CLOUDFLARE_API_TOKEN` oder ein API-Token in der Anmeldedatei wird abgelehnt; S3-Schlüssel gibt es hier nicht.
 * Muss die Anmeldung interaktiv erneuert werden, hält die Remotephase an (Exit 2), der Bericht nennt den
 * Wiederaufnahmebefehl; der Archivstatus im Manifest macht den nächsten Lauf fortsetzbar.
 */
import { join, relative, resolve } from 'node:path';

import { createWranglerApiR2Transport, createWranglerR2Transport, readWranglerAuthFile, WranglerAuthError, type R2Transport, type WranglerAuthConfig } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { BASELINE_DATE, CACHE_DIR } from '../common/constants.ts';
import { DEFAULT_STAGING_DIR, R2_SOURCES_BUCKET } from '../common/environment.ts';
import { isImportedStatus, readManifest, type ImportManifest } from '../common/manifest.ts';
import { ArchiveError, guardTransport, KEY_PREFIX } from './archive.ts';
import { auditRemote, auditStaging, inventoryBucket, stagingBlockers, type BucketInventory, type RemoteAudit } from './audit.ts';
import { renderR2AuditMarkdown, writeR2AuditReport, type R2AuditReportInput, type R2RunStatus } from './report.ts';
import { stageRawSources } from './stage.ts';
import { syncArchive, type SyncResult, type SyncVerification } from './sync.ts';

export const R2_TRANSPORTS = ['wrangler', 'wrangler-api'] as const;
export type R2TransportName = (typeof R2_TRANSPORTS)[number];

/** Zeitlimit je HTTP-Aufruf für `wrangler-api`: Das größte Exportpaket hat rund 36 MB (West: 15 s). */
export const LARGE_OBJECT_TIMEOUT_MS = 180_000;
export const DEFAULT_SAMPLE_SIZE = 150;
export const DEFAULT_ENVELOPE_SAMPLE_SIZE = 25;

export interface R2SyncCommandOptions {
  write: boolean;
  json: boolean;
  stageOnly?: boolean;
  limit?: number;
  concurrency?: number;
  transport?: R2TransportName;
  verify?: SyncVerification;
  sample?: number;
  seed?: string;
  cacheDir?: string;
  stagingDir?: string;
}

export interface R2SyncDependencies {
  /** Transport (Tests: Speichertransport); Standard: Wrangler-OAuth-Transporte. */
  createTransport?: (name: R2TransportName, root: string) => R2Transport;
  now?: () => Date;
}

type Io = { print: (line: string) => void; error: (line: string) => void };

/** Liest Wranglers Anmeldedatei und lässt nur eine OAuth-Anmeldung gelten (kein API-Token). */
export async function readOAuthOnly(): Promise<WranglerAuthConfig> {
  const config = await readWranglerAuthFile();
  if (config.apiToken) throw new WranglerAuthError('rejected', 'Die Wrangler-Anmeldedatei führt ein API-Token statt einer OAuth-Anmeldung; der BayWü-Sync nutzt ausschließlich OAuth (npx wrangler login)');
  return { ...(config.oauthToken ? { oauthToken: config.oauthToken } : {}), ...(config.expirationTime ? { expirationTime: config.expirationTime } : {}) };
}

/** Transporte ausschließlich über die bestehende Wrangler-OAuth-Anmeldung. */
export function createOAuthTransport(name: R2TransportName, root: string, env: Record<string, string | undefined> = process.env): R2Transport {
  if (env.CLOUDFLARE_API_TOKEN?.trim()) throw new ArchiveError('guard', 'CLOUDFLARE_API_TOKEN ist gesetzt – der BayWü-Sync nutzt ausschließlich die Wrangler-OAuth-Anmeldung; Variable entfernen und erneut starten');
  const cwd = join(root, 'apps', 'web');
  if (name === 'wrangler-api') return createWranglerApiR2Transport({ bucket: R2_SOURCES_BUCKET, cwd, env, readToken: readOAuthOnly, timeoutMs: LARGE_OBJECT_TIMEOUT_MS });
  return createWranglerR2Transport({ bucket: R2_SOURCES_BUCKET, cwd });
}

/** Anmeldefehler, die nur eine interaktive Erneuerung löst: Remotephase anhalten, nicht umgehen. */
export function needsInteractiveLogin(error: unknown): boolean {
  if (error instanceof WranglerAuthError) return error.reason !== 'accounts' && error.reason !== 'format' && error.reason !== 'unreadable';
  const message = error instanceof Error ? error.message : String(error);
  return /not logged in|wrangler login|Authentication error|\b401\b/iu.test(message);
}

export function commandLine(options: R2SyncCommandOptions): string {
  const parts = ['npm run import:bayernrecht:r2-sync --'];
  if (options.write) parts.push('--write');
  if (options.stageOnly) parts.push('--stage-only');
  if (options.transport) parts.push(`--r2-transport ${options.transport}`);
  if (options.concurrency !== undefined) parts.push(`--concurrency ${options.concurrency}`);
  if (options.verify) parts.push(`--verify ${options.verify}`);
  if (options.limit !== undefined) parts.push(`--limit ${options.limit}`);
  if (options.sample !== undefined) parts.push(`--sample ${options.sample}`);
  if (options.seed) parts.push(`--seed ${options.seed}`);
  return parts.join(' ');
}

function manifestTotals(manifest: ImportManifest): R2AuditReportInput['manifest'] {
  const byArchiveStatus: Record<string, number> = {};
  let importedEntries = 0;
  let rawObjects = 0;
  let rawBytes = 0;
  for (const entry of manifest.entries) {
    if (!isImportedStatus(entry.importStatus)) continue;
    importedEntries += 1;
    for (const raw of entry.rawDocuments) {
      rawObjects += 1;
      rawBytes += raw.byteLength;
      const status = raw.archiveStatus ?? '(ohne)';
      byArchiveStatus[status] = (byArchiveStatus[status] ?? 0) + 1;
    }
  }
  return { entries: manifest.entries.length, importedEntries, rawObjects, rawBytes, byArchiveStatus };
}

export async function runR2Sync(options: R2SyncCommandOptions, root: string, io: Io, dependencies: R2SyncDependencies = {}): Promise<number> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const transportName: R2TransportName = options.transport ?? 'wrangler';
  const cacheDir = resolve(root, options.cacheDir ?? CACHE_DIR);
  const stagingDir = resolve(root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const stagingLabel = relative(root, stagingDir).split('\\').join('/') || stagingDir;
  const seed = options.seed ?? BASELINE_DATE;
  const log = options.json ? (): void => undefined : (line: string): void => io.print(`  ${line}`);

  const manifest = await readManifest(root);
  const stage = await stageRawSources({ root, manifest, cacheDir, stagingDir, write: options.write, log });
  for (const problem of stage.problems.slice(0, 20)) io.error(`  Staging-Befund ${problem.code}: ${problem.sourceIdentity} – ${problem.message}`);
  const staging = await auditStaging({ manifest, stagingDir });
  const blockers = [...(stage.problems.length > 0 ? [`${stage.problems.length} Staging-Befunde`] : []), ...stagingBlockers(staging)];
  if (!options.json) {
    io.print(`R2-Rohquellenarchiv BayWü · Bucket ${R2_SOURCES_BUCKET} · Präfix ${KEY_PREFIX} · Staging ${stagingLabel}`);
    io.print(`  Staging-Audit${options.write ? '' : ' (Ist-Stand vor diesem Lauf; im Dry-run wird nichts gestagt)'}: ${staging.expectedObjects} Rohquellen aus ${staging.importedEntries} übernommenen Normen (${staging.expectedBytes} Bytes), im Staging ${staging.presentObjects} + ${staging.presentEnvelopes} Umschläge, fehlend ${staging.missing.length}, Größe/SHA-256 abweichend ${staging.sizeMismatch.length}/${staging.shaMismatch.length}, Umschläge ${staging.envelopeProblems.length} (archivierter Stand mit abweichendem Titel beibehalten ${staging.envelopesDescriptiveDiff.length}), Manifest ${staging.manifestProblems.length}, Präfix ${staging.keyProblems.length}, nur Staging ${staging.stagingOnly.length} → ${staging.ok && stage.problems.length === 0 ? 'bestanden' : 'NICHT bestanden'}`);
  }

  if (!options.write) {
    io.print(`Dry-run: nichts gestagt, nichts hochgeladen, kein Netzaufruf. ${stage.written} Rohquellen wären zu stagen, ${stage.manifestEntriesUpdated} Manifesteinträge zu markieren. Mit --write ausführen.`);
    return stage.problems.length === 0 ? 0 : 1;
  }

  const base = (): Omit<R2AuditReportInput, 'status'> => ({
    startedAt,
    endedAt: now().toISOString(),
    bucket: R2_SOURCES_BUCKET,
    prefix: KEY_PREFIX,
    stagingDir: stagingLabel,
    transport: transportName,
    command: commandLine(options),
    resumeCommand: `npx wrangler login  (interaktiv, durch den Nutzer)  →  ${commandLine({ ...options, write: true, stageOnly: false, transport: transportName })}`,
    manifest: manifestTotals(manifest),
    stage,
    staging,
  });
  const finish = async (input: R2AuditReportInput, exitCode: number): Promise<number> => {
    const written = await writeR2AuditReport(root, input);
    if (options.json) io.print(JSON.stringify(written.report, null, 2));
    else {
      for (const line of renderR2AuditMarkdown(input).split('\n').filter((line) => line.startsWith('|') && !line.startsWith('| ---') && !line.startsWith('| Kennzahl'))) io.print(`  ${line}`);
      io.print(`Status ${input.status}. Geschrieben: ${written.paths.join(', ')}`);
    }
    return exitCode;
  };

  if (blockers.length > 0) {
    io.error(`Staging-Audit nicht bestanden (${blockers.join('; ')}) – kein Sync.`);
    return options.stageOnly ? 1 : finish({ ...base(), status: 'blocked', error: `Staging-Audit nicht bestanden: ${blockers.join('; ')}` }, 1);
  }
  if (options.stageOnly) {
    io.print('Staging-Audit bestanden; --stage-only: kein Netzaufruf, kein Bericht.');
    return 0;
  }

  let inner: R2Transport;
  try {
    inner = (dependencies.createTransport ?? createOAuthTransport)(transportName, root);
  } catch (error) {
    io.error((error as Error).message);
    return 1;
  }
  const transport = guardTransport(inner);
  if (options.verify === 'etag' && !transport.list) {
    io.error(`--verify etag braucht ein Listing; Transport ${transport.name} hat keines (--r2-transport wrangler-api oder --verify readback)`);
    return 1;
  }

  let bucketBefore: BucketInventory | undefined;
  let bucketAfter: BucketInventory | undefined;
  let sync: SyncResult | undefined;
  let remote: RemoteAudit | undefined;
  // Zwischenstand des Syncs; bleibt bei einem Abbruch erhalten und geht in den Bericht.
  const progress = {} as SyncResult;
  try {
    // Nur lesend: ganzer Bucket vorher (Zählung und Fingerabdruck außerhalb von baywue/).
    if (inner.list) bucketBefore = await inventoryBucket(inner, now);
    if (bucketBefore) log(`Bucket vorher: ${bucketBefore.objects} Objekte, davon ${bucketBefore.jurisdictionObjects} unter baywue/`);
    sync = await syncArchive({
      root,
      manifest,
      transport,
      stagingDir,
      audit: staging,
      result: progress,
      seed,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(options.verify ? { verification: options.verify } : {}),
      log,
    });
    if (sync.blocked) return finish({ ...base(), status: 'blocked', sync, error: sync.blockReasons.join('; ') }, 1);
    log(`Sync: ${sync.uploaded} hochgeladen, ${sync.alreadyPresent} vorhanden, ${sync.verified} verified, ${Math.round(sync.durationMs / 1000)} s`);
    if (transport.list) {
      remote = await auditRemote({ transport, manifest, local: staging.local, sampleSize: options.sample ?? DEFAULT_SAMPLE_SIZE, envelopeSampleSize: DEFAULT_ENVELOPE_SAMPLE_SIZE, seed, concurrency: Math.min(8, Math.max(1, options.concurrency ?? 1)) });
      bucketAfter = await inventoryBucket(inner, now);
    }
  } catch (error) {
    const message = (error as Error).message;
    if (!sync && progress.transport !== undefined) sync = progress;
    if (needsInteractiveLogin(error)) {
      io.error(`Remotephase angehalten: ${message}`);
      io.error(`Wiederaufnahme nach interaktiver Anmeldung durch den Nutzer: npx wrangler login, dann ${commandLine({ ...options, transport: transportName })}`);
      return finish({ ...base(), status: 'halted', halt: message, ...(sync ? { sync } : {}), ...(bucketBefore ? { bucketBefore } : {}) }, 2);
    }
    io.error(`R2-Sync abgebrochen: ${message}`);
    return finish({ ...base(), status: 'failed', error: message, ...(sync ? { sync } : {}), ...(remote ? { remote } : {}), ...(bucketBefore ? { bucketBefore } : {}) }, 1);
  }

  const outsideChanged = bucketBefore !== undefined && bucketAfter !== undefined && bucketBefore.outsideFingerprint !== bucketAfter.outsideFingerprint;
  const hardRemoteProblems = remote ? remote.missing.length + remote.sizeMismatch.length + remote.md5Mismatch.length + remote.unexpected.length + remote.sample.failures.length + remote.envelopeSample.failures.length : 0;
  const pendingAfter = remote ? remote.pending.length + remote.notVerified.length : sync.pending - sync.processed;
  const status: R2RunStatus = hardRemoteProblems > 0 || outsideChanged ? 'failed' : pendingAfter > 0 ? 'partial' : 'verified';
  return finish({ ...base(), status, sync, ...(remote ? { remote } : {}), ...(bucketBefore ? { bucketBefore } : {}), ...(bucketAfter ? { bucketAfter } : {}), ...(outsideChanged ? { error: 'Der Bucket hat sich außerhalb von baywue/ verändert (Fingerabdruck vorher/nachher verschieden)' } : {}) }, status === 'failed' ? 1 : 0);
}
