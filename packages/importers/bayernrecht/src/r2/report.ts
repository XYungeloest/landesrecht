/**
 * Bericht des BayWü-R2-Syncs: `data/audits/bayernrecht/R2_AUDIT.json` und `R2_AUDIT.md`.
 *
 * Ein Laufbericht, kein Fixpunkt: Zeitpunkte und Dauer gehören dazu. Maßgeblich sind die Zählwerte (Objekte,
 * Bytes, geprüft), die Abweichungslisten (leer = in Ordnung), die deterministische Byte-Stichprobe und der
 * Bucketvergleich vorher/nachher – global und unter `baywue/`, dazu der Fingerabdruck aller Objekte außerhalb.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR, SOURCE_SYSTEM, TARGET_JURISDICTION } from '../common/constants.ts';
import type { BucketInventory, RemoteAudit, StagingAudit } from './audit.ts';
import type { StageResult } from './stage.ts';
import type { SyncResult } from './sync.ts';

export const R2_AUDIT_JSON_PATH = `${AUDIT_DIR}/R2_AUDIT.json`;
export const R2_AUDIT_MARKDOWN_PATH = `${AUDIT_DIR}/R2_AUDIT.md`;
export const R2_AUDIT_SCHEMA = 'bayernrecht-r2-audit/1' as const;

/** verified: alles geprüft · partial: Rest offen (Budget) · blocked: Staging-Audit sperrt · halted: Anmeldung · failed: Fehler */
export type R2RunStatus = 'verified' | 'partial' | 'blocked' | 'halted' | 'failed';

const LIST_LIMIT = 50;

export interface R2AuditReportInput {
  status: R2RunStatus;
  startedAt: string;
  endedAt: string;
  bucket: string;
  prefix: string;
  stagingDir: string;
  transport: string;
  command: string;
  resumeCommand: string;
  manifest: { entries: number; importedEntries: number; rawObjects: number; rawBytes: number; byArchiveStatus: Record<string, number> };
  stage: StageResult;
  staging: StagingAudit;
  sync?: SyncResult;
  remote?: RemoteAudit;
  bucketBefore?: BucketInventory;
  bucketAfter?: BucketInventory;
  error?: string;
  halt?: string;
}

const head = <T>(items: readonly T[]): T[] => items.slice(0, LIST_LIMIT);

export function buildR2AuditReport(input: R2AuditReportInput): Record<string, unknown> {
  const { staging, remote, sync } = input;
  const outsideUnchanged = input.bucketBefore && input.bucketAfter ? input.bucketBefore.outsideFingerprint === input.bucketAfter.outsideFingerprint && input.bucketBefore.outsideObjects === input.bucketAfter.outsideObjects : null;
  return {
    schemaVersion: R2_AUDIT_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    sourceSystem: SOURCE_SYSTEM,
    status: input.status,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationSeconds: Math.round((Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 1000),
    bucket: input.bucket,
    prefix: input.prefix,
    transport: input.transport,
    command: input.command,
    ...(input.halt ? { halt: { reason: input.halt, resumeCommand: input.resumeCommand } } : {}),
    ...(input.error ? { error: input.error } : {}),
    manifest: input.manifest,
    staging: {
      dir: input.stagingDir,
      ok: staging.ok,
      importedEntries: staging.importedEntries,
      expectedObjects: staging.expectedObjects,
      expectedEnvelopes: staging.expectedEnvelopes,
      expectedBytes: staging.expectedBytes,
      presentObjects: staging.presentObjects,
      presentEnvelopes: staging.presentEnvelopes,
      missing: staging.missing.length,
      sizeMismatch: staging.sizeMismatch.length,
      shaMismatch: staging.shaMismatch.length,
      envelopeProblems: staging.envelopeProblems.length,
      manifestProblems: staging.manifestProblems.length,
      keyProblems: staging.keyProblems.length,
      stagingOnly: staging.stagingOnly.length,
      nonImportedWithArchive: staging.nonImportedWithArchive.length,
      run: { written: input.stage.written, alreadyStaged: input.stage.alreadyStaged, envelopesWritten: input.stage.envelopesWritten, manifestEntriesUpdated: input.stage.manifestEntriesUpdated, problems: input.stage.problems.length },
    },
    sync: sync
      ? { blocked: sync.blocked, blockReasons: sync.blockReasons, verification: sync.verification, concurrency: sync.concurrency, pending: sync.pending, processed: sync.processed, uploaded: sync.uploaded, alreadyPresent: sync.alreadyPresent, envelopesUploaded: sync.envelopesUploaded, envelopesPresent: sync.envelopesPresent, envelopesAdopted: sync.envelopesAdopted, bytesUploaded: sync.bytesUploaded, verifiedByListing: sync.verifiedByListing, readbacks: sync.readbacks, listingCalls: sync.listingCalls, verified: sync.verified, durationSeconds: Math.round(sync.durationMs / 1000) }
      : null,
    remote: remote
      ? { ok: remote.ok, listedObjects: remote.listedObjects, listedBytes: remote.listedBytes, expectedObjects: remote.expectedObjects, rawObjects: remote.rawObjects, rawBytes: remote.rawBytes, envelopeObjects: remote.envelopeObjects, missing: remote.missing.length, pending: remote.pending.length, sizeMismatch: remote.sizeMismatch.length, md5Mismatch: remote.md5Mismatch.length, unexpected: remote.unexpected.length, notVerified: remote.notVerified.length, sample: { seed: remote.sample.seed, requested: remote.sample.requested, checked: remote.sample.checked, bytes: remote.sample.bytes, failures: remote.sample.failures.length }, envelopeSample: { requested: remote.envelopeSample.requested, checked: remote.envelopeSample.checked, failures: remote.envelopeSample.failures.length, descriptive: remote.envelopeSample.descriptive } }
      : null,
    bucketBefore: input.bucketBefore ?? null,
    bucketAfter: input.bucketAfter ?? null,
    outsideJurisdictionUnchanged: outsideUnchanged,
    details: {
      stageProblems: head(input.stage.problems),
      stagingMissing: head(staging.missing),
      stagingSizeMismatch: head(staging.sizeMismatch),
      stagingShaMismatch: head(staging.shaMismatch),
      envelopeProblems: head(staging.envelopeProblems),
      manifestProblems: head(staging.manifestProblems),
      keyProblems: head(staging.keyProblems),
      stagingOnly: head(staging.stagingOnly),
      nonImportedWithArchive: head(staging.nonImportedWithArchive),
      ...(remote
        ? { remoteMissing: head(remote.missing), remotePending: head(remote.pending), remoteSizeMismatch: head(remote.sizeMismatch), remoteMd5Mismatch: head(remote.md5Mismatch), remoteUnexpected: head(remote.unexpected), remoteNotVerified: head(remote.notVerified), sampleKeys: remote.sample.keys, sampleFailures: remote.sample.failures, envelopeSampleFailures: remote.envelopeSample.failures }
        : {}),
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Laufhistorie: Ein abgebrochener und fortgesetzter Sync besteht aus mehreren Läufen. „Vorher“ heißt dann   */
/* der Bucket vor dem ersten Lauf, nicht vor dem letzten; deshalb trägt der Bericht die früheren Läufe mit.  */

export interface InventorySummary {
  listedAt: string;
  objects: number;
  bytes: number;
  jurisdictionObjects: number;
  jurisdictionBytes: number;
  outsideObjects: number;
  outsideFingerprint: string;
}

export interface R2RunSummary {
  startedAt: string;
  endedAt: string;
  status: R2RunStatus;
  transport: string;
  command: string;
  /** null: im Bericht dieses Laufs nicht erfasst (nicht geschätzt). */
  uploadedObjects: number | null;
  uploadedEnvelopes: number | null;
  alreadyPresent: number | null;
  bytesUploaded: number | null;
  verified: number | null;
  error: string | null;
  bucketBefore: InventorySummary | null;
  bucketAfter: InventorySummary | null;
}

export interface R2OperationSummary {
  runs: number;
  firstStartedAt: string;
  lastEndedAt: string;
  wallClockSeconds: number;
  runtimeSeconds: number;
  bucketBeforeFirstRun: InventorySummary | null;
  bucketAfterLastRun: InventorySummary | null;
  /** Alle gemessenen Fingerabdrücke außerhalb von `baywue/` gleich (über alle Läufe, vorher und nachher). */
  outsideUnchangedAcrossRuns: boolean | null;
}

/** Höchstzahl mitgeführter Läufe. */
const MAX_RUNS = 50;

function inventorySummary(value: unknown): InventorySummary | null {
  if (!value || typeof value !== 'object') return null;
  const inventory = value as Partial<BucketInventory>;
  if (typeof inventory.objects !== 'number' || typeof inventory.outsideFingerprint !== 'string') return null;
  return { listedAt: String(inventory.listedAt), objects: inventory.objects, bytes: Number(inventory.bytes), jurisdictionObjects: Number(inventory.jurisdictionObjects), jurisdictionBytes: Number(inventory.jurisdictionBytes), outsideObjects: Number(inventory.outsideObjects), outsideFingerprint: inventory.outsideFingerprint };
}

/** Kurzfassung eines geschriebenen Berichts (auch eines älteren ohne Laufhistorie). */
export function summarizeRun(report: Record<string, unknown>): R2RunSummary {
  const sync = (report.sync ?? null) as Record<string, unknown> | null;
  const number = (key: string): number | null => (sync && typeof sync[key] === 'number' ? (sync[key] as number) : null);
  return {
    startedAt: String(report.startedAt),
    endedAt: String(report.endedAt),
    status: report.status as R2RunStatus,
    transport: String(report.transport),
    command: String(report.command),
    uploadedObjects: number('uploaded'),
    uploadedEnvelopes: number('envelopesUploaded'),
    alreadyPresent: number('alreadyPresent'),
    bytesUploaded: number('bytesUploaded'),
    verified: number('verified'),
    error: typeof report.error === 'string' ? report.error : typeof (report.halt as { reason?: unknown } | undefined)?.reason === 'string' ? String((report.halt as { reason: string }).reason) : null,
    bucketBefore: inventorySummary(report.bucketBefore),
    bucketAfter: inventorySummary(report.bucketAfter),
  };
}

export function operationSummary(runs: readonly R2RunSummary[]): R2OperationSummary | null {
  if (runs.length === 0) return null;
  const first = runs[0]!;
  const last = runs[runs.length - 1]!;
  const fingerprints = runs.flatMap((run) => [run.bucketBefore?.outsideFingerprint, run.bucketAfter?.outsideFingerprint]).filter((value): value is string => typeof value === 'string');
  return {
    runs: runs.length,
    firstStartedAt: first.startedAt,
    lastEndedAt: last.endedAt,
    wallClockSeconds: Math.round((Date.parse(last.endedAt) - Date.parse(first.startedAt)) / 1000),
    runtimeSeconds: runs.reduce((sum, run) => sum + Math.round((Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000), 0),
    bucketBeforeFirstRun: runs.find((run) => run.bucketBefore)?.bucketBefore ?? null,
    bucketAfterLastRun: [...runs].reverse().find((run) => run.bucketAfter)?.bucketAfter ?? null,
    outsideUnchangedAcrossRuns: fingerprints.length < 2 ? null : new Set(fingerprints).size === 1,
  };
}

/** Frühere Läufe aus dem vorhandenen Bericht (gleiches Schema und Präfix), dazu der aktuelle. */
export function mergeRuns(previous: Record<string, unknown> | undefined, current: Record<string, unknown>): R2RunSummary[] {
  let earlier: R2RunSummary[] = [];
  if (previous && previous.schemaVersion === R2_AUDIT_SCHEMA && previous.prefix === current.prefix) {
    earlier = Array.isArray(previous.runs) ? (previous.runs as R2RunSummary[]) : [summarizeRun(previous)];
  }
  const now = summarizeRun(current);
  return [...earlier.filter((run) => run.startedAt !== now.startedAt), now].slice(-MAX_RUNS);
}

const mib = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const n = (value: number): string => value.toLocaleString('de-DE');

export function renderR2AuditMarkdown(input: R2AuditReportInput, runs: readonly R2RunSummary[] = []): string {
  const { staging, remote, sync, bucketBefore, bucketAfter } = input;
  const lines: string[] = [
    '# R2-Rohquellenarchiv BayWü',
    '',
    `Bucket \`${input.bucket}\` (privat), Präfix \`${input.prefix}\`. Lauf ${input.startedAt} – ${input.endedAt} (${Math.round((Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 1000)} s), Transport \`${input.transport}\`.`,
    '',
    `Status: **${input.status}**`,
    '',
  ];
  if (input.halt) lines.push(`Remotephase angehalten: ${input.halt}`, '', `Wiederaufnahme: \`${input.resumeCommand}\``, '');
  if (input.error) lines.push(`Fehler: ${input.error}`, '');
  lines.push(
    '## Manifest und Staging',
    '',
    '| Kennzahl | Wert |',
    '| --- | --- |',
    `| Manifesteinträge | ${n(input.manifest.entries)} |`,
    `| übernommene Normen (imported, imported-with-warnings) | ${n(input.manifest.importedEntries)} |`,
    `| Rohquellen der übernommenen Normen | ${n(input.manifest.rawObjects)} (${mib(input.manifest.rawBytes)}, ${n(input.manifest.rawBytes)} Bytes) |`,
    `| Archivstatus im Manifest | ${Object.entries(input.manifest.byArchiveStatus).map(([status, count]) => `${status} ${n(count)}`).join(' · ') || '–'} |`,
    `| Staging \`${input.stagingDir}\` | ${n(staging.presentObjects)} Rohobjekte + ${n(staging.presentEnvelopes)} Umschläge |`,
    `| fehlende erwartete Objekte im Staging | ${n(staging.missing.length)} |`,
    `| Größe / SHA-256 abweichend (nachgerechnet) | ${n(staging.sizeMismatch.length)} / ${n(staging.shaMismatch.length)} |`,
    `| Umschläge abweichend | ${n(staging.envelopeProblems.length)} |`,
    `| Manifestbefunde (Bucket, Schlüssel, Status) | ${n(staging.manifestProblems.length)} |`,
    `| Schlüssel außerhalb des Präfixes | ${n(staging.keyProblems.length)} |`,
    `| nur im Staging (kein Upload-Soll) | ${n(staging.stagingOnly.length)} |`,
    `| Staging-Audit | ${staging.ok ? 'bestanden' : `**nicht bestanden** – kein Sync`} |`,
    '',
  );
  if (sync && !sync.blocked) {
    lines.push(
      '## Sync',
      '',
      '| Kennzahl | Wert |',
      '| --- | --- |',
      `| Prüfregime | ${sync.verification}${sync.verification === 'etag' ? ' (Listing: Existenz, Größe, Etag = MD5; deterministische Byte-Stichprobe je Charge)' : ' (Rücklesung je Objekt, SHA-256)'} |`,
      `| Parallelität | ${sync.concurrency} |`,
      `| offen vor dem Lauf (staged/uploaded) | ${n(sync.pending)} |`,
      `| hochgeladen: Rohobjekte / Umschläge | ${n(sync.uploaded)} / ${n(sync.envelopesUploaded)} (${mib(sync.bytesUploaded)}) |`,
      `| bereits vorhanden (gleicher Inhalt): Rohobjekte / Umschläge | ${n(sync.alreadyPresent)} / ${n(sync.envelopesPresent)} |`,
      `| davon Umschläge mit archiviertem Stand beibehalten (Kernfelder gleich, beschreibende Felder abweichend) | ${n(sync.envelopesAdopted)} |`,
      `| per Listing nachgeprüft (Größe + MD5) | ${n(sync.verifiedByListing)} |`,
      `| Byte-Rücklesungen im Sync (SHA-256) | ${n(sync.readbacks)} |`,
      `| Listings | ${n(sync.listingCalls)} |`,
      `| auf verified gesetzt | ${n(sync.verified)} |`,
      `| Dauer Sync | ${Math.round(sync.durationMs / 1000)} s |`,
      '',
    );
  }
  if (remote) {
    lines.push(
      '## Nachprüfung (nur lesend)',
      '',
      '| Kennzahl | Wert |',
      '| --- | --- |',
      `| Objekte unter \`${remote.prefix}\` | ${n(remote.listedObjects)} (${mib(remote.listedBytes)}, ${n(remote.listedBytes)} Bytes) |`,
      `| davon Rohobjekte / Umschläge | ${n(remote.rawObjects)} (${mib(remote.rawBytes)}) / ${n(remote.envelopeObjects)} |`,
      `| erwartet (Rohobjekte + Umschläge) | ${n(remote.expectedObjects)} |`,
      `| fehlend / noch offen | ${n(remote.missing.length)} / ${n(remote.pending.length)} |`,
      `| Größe abweichend / Etag (MD5) abweichend | ${n(remote.sizeMismatch.length)} / ${n(remote.md5Mismatch.length)} |`,
      `| unerwartet unter dem Präfix | ${n(remote.unexpected.length)} |`,
      `| Manifest nicht verified | ${n(remote.notVerified.length)} |`,
      `| deterministische Byte-Stichprobe (Saat \`${remote.sample.seed}\`, SHA-256 nach Download) | ${n(remote.sample.checked)} von ${n(remote.sample.requested)} geprüft, ${n(remote.sample.failures.length)} Fehler, ${mib(remote.sample.bytes)} |`,
      `| Umschlag-Stichprobe (Kernfelder; bytegleich außer archiviertem Stand mit abweichendem Titel) | ${n(remote.envelopeSample.checked)} geprüft, ${n(remote.envelopeSample.failures.length)} Fehler, ${n(remote.envelopeSample.descriptive)} mit archiviertem Titel |`,
      `| Ergebnis | ${remote.ok ? '**0 Abweichungen**' : '**Abweichungen** (Details in R2_AUDIT.json)'} |`,
      '',
    );
  }
  if (bucketBefore || bucketAfter) {
    const row = (label: string, pick: (inventory: BucketInventory) => string): string => `| ${label} | ${bucketBefore ? pick(bucketBefore) : '–'} | ${bucketAfter ? pick(bucketAfter) : '–'} |`;
    const tops = [...new Set([...Object.keys(bucketBefore?.byTopLevel ?? {}), ...Object.keys(bucketAfter?.byTopLevel ?? {})])].sort();
    lines.push(
      '## Bucket vorher/nachher (Listing, nur lesend)',
      '',
      '| Kennzahl | vorher | nachher |',
      '| --- | --- | --- |',
      row('Zeitpunkt', (inventory) => inventory.listedAt),
      row('Objekte gesamt', (inventory) => `${n(inventory.objects)} (${mib(inventory.bytes)})`),
      row('unter `baywue/`', (inventory) => `${n(inventory.jurisdictionObjects)} (${mib(inventory.jurisdictionBytes)})`),
      row('außerhalb `baywue/`', (inventory) => n(inventory.outsideObjects)),
      ...tops.map((top) => row(`\`${top}\``, (inventory) => (inventory.byTopLevel[top] ? `${n(inventory.byTopLevel[top]!.objects)} (${mib(inventory.byTopLevel[top]!.bytes)})` : '0'))),
      row('Fingerabdruck außerhalb `baywue/` (Schlüssel, Größe, Etag)', (inventory) => `\`${inventory.outsideFingerprint.slice(0, 16)}…\``),
      '',
    );
    if (bucketBefore && bucketAfter) lines.push(bucketBefore.outsideFingerprint === bucketAfter.outsideFingerprint ? 'Außerhalb von `baywue/` ist der Bucket unverändert (gleicher Fingerabdruck über Schlüssel, Größe und Etag).' : '**Außerhalb von `baywue/` hat sich der Bucket verändert** – prüfen, ob ein anderer Prozess geschrieben hat.', '');
  }
  const operation = operationSummary(runs);
  if (operation && runs.length > 1) {
    const inventoryCell = (inventory: InventorySummary | null): string => (inventory ? `${n(inventory.objects)} / ${n(inventory.jurisdictionObjects)}` : '–');
    const count = (value: number | null): string => (value === null ? '–' : n(value));
    lines.push(
      '## Läufe dieses Archivs',
      '',
      `${operation.runs} Läufe, ${operation.firstStartedAt} – ${operation.lastEndedAt} (${operation.wallClockSeconds} s Wanduhr, ${operation.runtimeSeconds} s Laufzeit). Vor dem ersten Lauf: ${operation.bucketBeforeFirstRun ? `${n(operation.bucketBeforeFirstRun.objects)} Objekte im Bucket, ${n(operation.bucketBeforeFirstRun.jurisdictionObjects)} unter \`baywue/\`` : 'nicht gemessen'}; nach dem letzten Lauf: ${operation.bucketAfterLastRun ? `${n(operation.bucketAfterLastRun.objects)} Objekte, ${n(operation.bucketAfterLastRun.jurisdictionObjects)} unter \`baywue/\`` : 'nicht gemessen'}. Fingerabdruck außerhalb \`baywue/\` über alle Messungen: ${operation.outsideUnchangedAcrossRuns === null ? 'zu wenige Messungen' : operation.outsideUnchangedAcrossRuns ? 'unverändert' : '**verändert**'}.`,
      '',
      '| Beginn | Ende | Status | hochgeladen Roh / Umschlag | bereits vorhanden | Bucket vorher (gesamt / baywue) | Bucket nachher (gesamt / baywue) | Befund |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...runs.map((run) => `| ${run.startedAt} | ${run.endedAt} | ${run.status} | ${count(run.uploadedObjects)} / ${count(run.uploadedEnvelopes)} | ${count(run.alreadyPresent)} | ${inventoryCell(run.bucketBefore)} | ${inventoryCell(run.bucketAfter)} | ${run.error ? run.error.replace(/\|/gu, '/').slice(0, 160) : '–'} |`),
      '',
    );
  }
  lines.push(
    '## Regeln dieses Laufs',
    '',
    '- Anmeldung ausschließlich über die bestehende Wrangler-OAuth-Anmeldung; kein API-Token, keine S3-Schlüssel.',
    '- Geschrieben wird nur unter `baywue/bayernrecht/2023-12-01/`; jeder andere Schlüssel ist ein harter Fehler (Präfixschutz). Nichts wird gelöscht oder überschrieben.',
    '- Der Bucket bleibt privat; keine öffentliche URL, kein r2.dev, keine Custom Domain.',
    '- Die Normdateien unter `content/norms/baywue/` bleiben unberührt; die Archivierung steht im Manifest (`bucket`, `objectKey`, `archiveStatus`).',
    '',
    `Befehl: \`${input.command}\``,
    '',
  );
  return lines.join('\n');
}

/** Schreibt Bericht und Markdown; frühere Läufe desselben Archivs werden als Laufhistorie mitgeführt. */
export async function writeR2AuditReport(root: string, input: R2AuditReportInput): Promise<{ paths: string[]; report: Record<string, unknown> }> {
  let previous: Record<string, unknown> | undefined;
  try {
    previous = await readJsonFile<Record<string, unknown>>(join(root, R2_AUDIT_JSON_PATH));
  } catch {
    previous = undefined; // beschädigter Vorbericht: ohne Historie weiter, der neue Bericht ersetzt ihn
  }
  const report = buildR2AuditReport(input);
  const runs = mergeRuns(previous, report);
  report.operation = operationSummary(runs);
  report.runs = runs;
  await writeJsonAtomic(join(root, R2_AUDIT_JSON_PATH), report);
  await writeFileAtomic(join(root, R2_AUDIT_MARKDOWN_PATH), renderR2AuditMarkdown(input, runs));
  return { paths: [R2_AUDIT_JSON_PATH, R2_AUDIT_MARKDOWN_PATH], report };
}
