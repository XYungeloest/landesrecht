/**
 * Prüfungen des BayWü-Rohquellenarchivs.
 *
 *   auditStaging     vor dem Sync, netzfrei: Manifest ↔ Staging. Jede erwartete Rohquelle (übernommene Normen)
 *                    liegt samt Umschlag im Staging, Größe und SHA-256 sind nachgerechnet, der Umschlag ist
 *                    bytegleich mit dem aus dem Manifest gebildeten, das Manifest führt Bucket, Schlüssel und
 *                    Archivstatus. Schlägt eine Prüfung fehl, findet **kein** Sync statt.
 *   auditRemote      nach dem Sync, nur lesend: Listing unter dem Präfix (Existenz, Größe, Etag = MD5 der
 *                    gespeicherten Bytes gegen den lokalen MD5), Manifeststatus `verified`, unerwartete Objekte,
 *                    deterministische Byte-Stichprobe (SHA-256 nach Download) und Umschlag-Stichprobe.
 *   inventoryBucket  nur lesend: ganzer Bucket nach oberstem Präfix; Fingerabdruck aller Objekte außerhalb
 *                    von `baywue/` – vorher und nachher gleich heißt: nichts außerhalb wurde verändert.
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { TEMP_PREFIX } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { R2ListedObject, R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { R2_SOURCES_BUCKET } from '../common/environment.ts';
import type { ImportManifest } from '../common/manifest.ts';
import { deterministicSample, envelopeBytes, envelopeCoreProblems, envelopeFor, isArchiveKey, JURISDICTION_PREFIX, KEY_PREFIX, md5Hex, sha256Hex } from './archive.ts';
import { archiveCandidates, readIfExists } from './stage.ts';

/** Lokale Beschreibung eines erwarteten Objekts (Rohobjekt oder Umschlag) aus dem Staging. */
export interface LocalObject {
  key: string;
  size: number;
  md5: string;
  sha256: string;
  envelope: boolean;
  sourceIdentity: string;
}

export interface StagingAudit {
  bucket: string;
  prefix: string;
  importedEntries: number;
  expectedObjects: number;
  expectedBytes: number;
  expectedEnvelopes: number;
  presentObjects: number;
  presentEnvelopes: number;
  missing: string[];
  sizeMismatch: string[];
  shaMismatch: string[];
  envelopeProblems: string[];
  /**
   * Umschläge mit gleichen Kernfeldern, aber abweichenden beschreibenden Feldern (Quelltitel nach einer
   * Parserkorrektur): Der archivierte Stand bleibt, kein Blocker.
   */
  envelopesDescriptiveDiff: string[];
  manifestProblems: string[];
  keyProblems: string[];
  /** Dateien im Staging ohne übernommene Norm – nie Teil des Upload-Solls, kein Blocker. */
  stagingOnly: string[];
  /** Nicht übernommene Einträge mit Archivspur – Hinweis. */
  nonImportedWithArchive: string[];
  byArchiveStatus: Record<string, number>;
  ok: boolean;
  /** Erwartete Objekte mit lokalen Prüfsummen (nicht im Bericht; Grundlage der Nachprüfung). */
  local: Map<string, LocalObject>;
}

async function walk(directory: string, out: string[] = []): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

export async function auditStaging(options: { manifest: Pick<ImportManifest, 'entries'>; stagingDir: string; bucket?: string }): Promise<StagingAudit> {
  const bucket = options.bucket ?? R2_SOURCES_BUCKET;
  const candidates = archiveCandidates(options.manifest);
  const audit: StagingAudit = {
    bucket,
    prefix: KEY_PREFIX,
    importedEntries: new Set(candidates.map((candidate) => candidate.entry.sourceIdentity)).size,
    expectedObjects: candidates.length,
    expectedBytes: candidates.reduce((sum, candidate) => sum + candidate.raw.byteLength, 0),
    expectedEnvelopes: candidates.length,
    presentObjects: 0,
    presentEnvelopes: 0,
    missing: [],
    sizeMismatch: [],
    shaMismatch: [],
    envelopeProblems: [],
    envelopesDescriptiveDiff: [],
    manifestProblems: [],
    keyProblems: [],
    stagingOnly: [],
    nonImportedWithArchive: [],
    byArchiveStatus: {},
    ok: false,
    local: new Map(),
  };

  for (const candidate of candidates) {
    const { entry, raw, objectKey } = candidate;
    const status = raw.archiveStatus ?? '(ohne)';
    audit.byArchiveStatus[status] = (audit.byArchiveStatus[status] ?? 0) + 1;
    if (!isArchiveKey(objectKey) || !isArchiveKey(candidate.envelopeKey)) audit.keyProblems.push(objectKey);
    if (raw.archiveStatus !== 'staged' && raw.archiveStatus !== 'uploaded' && raw.archiveStatus !== 'verified') audit.manifestProblems.push(`${entry.sourceIdentity}: Archivstatus ${status}`);
    if (raw.objectKey !== objectKey) audit.manifestProblems.push(`${entry.sourceIdentity}: objectKey ${raw.objectKey ?? '(fehlt)'} statt ${objectKey}`);
    if (raw.bucket !== bucket) audit.manifestProblems.push(`${entry.sourceIdentity}: bucket ${raw.bucket ?? '(fehlt)'} statt ${bucket}`);

    const bytes = await readIfExists(join(options.stagingDir, objectKey));
    if (!bytes) audit.missing.push(objectKey);
    else {
      audit.presentObjects += 1;
      const sha = sha256Hex(bytes);
      if (bytes.byteLength !== raw.byteLength) audit.sizeMismatch.push(`${objectKey}: ${bytes.byteLength} statt ${raw.byteLength} Bytes`);
      if (sha !== raw.sha256) audit.shaMismatch.push(`${objectKey}: SHA-256 ${sha} statt ${raw.sha256}`);
      audit.local.set(objectKey, { key: objectKey, size: bytes.byteLength, md5: md5Hex(bytes), sha256: sha, envelope: false, sourceIdentity: entry.sourceIdentity });
    }

    const expectedEnvelope = envelopeFor(entry, raw, objectKey, bucket);
    const expectedBytes = envelopeBytes(expectedEnvelope);
    const envelope = await readIfExists(join(options.stagingDir, candidate.envelopeKey));
    if (!envelope) audit.missing.push(candidate.envelopeKey);
    else {
      audit.presentEnvelopes += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(envelope));
      } catch {
        parsed = undefined;
      }
      const problems = envelopeCoreProblems(parsed, expectedEnvelope);
      if (problems.length > 0) audit.envelopeProblems.push(`${candidate.envelopeKey}: ${problems.join('; ')}`);
      else if (sha256Hex(envelope) !== sha256Hex(expectedBytes)) audit.envelopesDescriptiveDiff.push(candidate.envelopeKey);
      audit.local.set(candidate.envelopeKey, { key: candidate.envelopeKey, size: envelope.byteLength, md5: md5Hex(envelope), sha256: sha256Hex(envelope), envelope: true, sourceIdentity: entry.sourceIdentity });
    }
  }

  const expectedKeys = new Set(candidates.flatMap((candidate) => [candidate.objectKey, candidate.envelopeKey]));
  for (const path of await walk(join(options.stagingDir, KEY_PREFIX))) {
    const key = relative(options.stagingDir, path).split('\\').join('/');
    if (key.split('/').pop()!.startsWith(TEMP_PREFIX)) continue;
    if (!expectedKeys.has(key)) audit.stagingOnly.push(key);
  }
  audit.stagingOnly.sort();
  const imported = new Set(candidates.map((candidate) => candidate.entry));
  for (const entry of options.manifest.entries) {
    if (imported.has(entry)) continue;
    if (entry.rawDocuments.some((raw) => raw.objectKey || raw.bucket || (raw.archiveStatus && raw.archiveStatus !== 'versioned'))) audit.nonImportedWithArchive.push(`${entry.sourceIdentity} (${entry.importStatus})`);
  }
  audit.ok = audit.missing.length === 0 && audit.sizeMismatch.length === 0 && audit.shaMismatch.length === 0 && audit.envelopeProblems.length === 0 && audit.manifestProblems.length === 0 && audit.keyProblems.length === 0;
  return audit;
}

/** Gründe, aus denen ein Staging-Audit den Sync sperrt (leer = frei). */
export function stagingBlockers(audit: StagingAudit): string[] {
  const reasons: string[] = [];
  if (audit.missing.length > 0) reasons.push(`${audit.missing.length} erwartete Objekte fehlen im Staging`);
  if (audit.sizeMismatch.length > 0) reasons.push(`${audit.sizeMismatch.length} Größenabweichungen`);
  if (audit.shaMismatch.length > 0) reasons.push(`${audit.shaMismatch.length} SHA-256-Abweichungen`);
  if (audit.envelopeProblems.length > 0) reasons.push(`${audit.envelopeProblems.length} Umschläge abweichend`);
  if (audit.manifestProblems.length > 0) reasons.push(`${audit.manifestProblems.length} Manifestbefunde (Bucket, Schlüssel, Archivstatus)`);
  if (audit.keyProblems.length > 0) reasons.push(`${audit.keyProblems.length} Schlüssel außerhalb des Präfixes`);
  return reasons;
}

/* ------------------------------------------------------------------------------------------ */

export interface RemoteAudit {
  prefix: string;
  listedObjects: number;
  listedBytes: number;
  expectedObjects: number;
  rawObjects: number;
  rawBytes: number;
  envelopeObjects: number;
  /** Erwartet und laut Manifest verified, aber nicht im Listing – harter Fehler. */
  missing: string[];
  /** Noch nicht übertragen (Manifest staged) – unvollständig, kein Widerspruch. */
  pending: string[];
  sizeMismatch: string[];
  md5Mismatch: string[];
  /** Unter dem Präfix, aber zu keiner übernommenen Norm gehörig. */
  unexpected: string[];
  notVerified: string[];
  sample: { seed: string; requested: number; checked: number; bytes: number; keys: string[]; failures: string[] };
  /** `descriptive`: Kernfelder gleich, beschreibende Felder abweichend – archivierter Stand bleibt, kein Fehler. */
  envelopeSample: { requested: number; checked: number; failures: string[]; descriptive: number };
  ok: boolean;
}

async function runLimited<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < items.length) {
      const item = items[next++]!;
      try {
        await work(item);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker()));
  if (failure !== undefined) throw failure;
}

export interface RemoteAuditOptions {
  /** Transport mit Präfixschutz (`guardTransport`) und Listing. */
  transport: R2Transport;
  manifest: Pick<ImportManifest, 'entries'>;
  local: ReadonlyMap<string, LocalObject>;
  sampleSize: number;
  envelopeSampleSize?: number;
  seed: string;
  concurrency?: number;
}

export async function auditRemote(options: RemoteAuditOptions): Promise<RemoteAudit> {
  if (!options.transport.list) throw new Error(`Transport ${options.transport.name} bietet kein Listing; die Nachprüfung braucht --r2-transport wrangler-api`);
  const listed = new Map<string, R2ListedObject>((await options.transport.list(KEY_PREFIX)).map((object) => [object.key, object]));
  const candidates = archiveCandidates(options.manifest);
  const statusOf = new Map<string, string>();
  for (const candidate of candidates) {
    statusOf.set(candidate.objectKey, candidate.raw.archiveStatus ?? '(ohne)');
    statusOf.set(candidate.envelopeKey, candidate.raw.archiveStatus ?? '(ohne)');
  }
  const audit: RemoteAudit = {
    prefix: KEY_PREFIX,
    listedObjects: listed.size,
    listedBytes: [...listed.values()].reduce((sum, object) => sum + object.size, 0),
    expectedObjects: candidates.length * 2,
    rawObjects: 0,
    rawBytes: 0,
    envelopeObjects: 0,
    missing: [],
    pending: [],
    sizeMismatch: [],
    md5Mismatch: [],
    unexpected: [],
    notVerified: [],
    sample: { seed: options.seed, requested: options.sampleSize, checked: 0, bytes: 0, keys: [], failures: [] },
    envelopeSample: { requested: options.envelopeSampleSize ?? 25, checked: 0, failures: [], descriptive: 0 },
    ok: false,
  };
  for (const candidate of candidates) {
    for (const key of [candidate.objectKey, candidate.envelopeKey]) {
      const envelope = key === candidate.envelopeKey;
      const object = listed.get(key);
      const status = statusOf.get(key)!;
      if (!object) {
        if (status === 'verified' || status === 'uploaded') audit.missing.push(key);
        else audit.pending.push(key);
        continue;
      }
      if (envelope) audit.envelopeObjects += 1;
      else {
        audit.rawObjects += 1;
        audit.rawBytes += object.size;
      }
      if (status !== 'verified') audit.notVerified.push(`${key} (${status})`);
      const local = options.local.get(key);
      const expectedSize = envelope ? local?.size : candidate.raw.byteLength;
      if (expectedSize !== undefined && object.size !== expectedSize) audit.sizeMismatch.push(`${key}: ${object.size} statt ${expectedSize} Bytes`);
      if (!local) audit.md5Mismatch.push(`${key}: keine lokale Prüfsumme (Staging fehlt)`);
      else if (!object.md5 || object.md5 !== local.md5) audit.md5Mismatch.push(`${key}: Etag ${object.md5 ?? '(kein MD5)'} statt ${local.md5}`);
    }
  }
  const expectedKeys = new Set(candidates.flatMap((candidate) => [candidate.objectKey, candidate.envelopeKey]));
  for (const key of listed.keys()) if (!expectedKeys.has(key)) audit.unexpected.push(key);
  audit.unexpected.sort();

  // Deterministische Byte-Stichprobe: Rohobjekte nach sha256(seed:schlüssel), die ersten N; SHA-256 nach Download.
  const rawPresent = candidates.filter((candidate) => listed.has(candidate.objectKey));
  const sampled = deterministicSample(rawPresent, (candidate) => candidate.objectKey, options.seed, options.sampleSize);
  audit.sample.keys = sampled.map((candidate) => candidate.objectKey);
  await runLimited(sampled, options.concurrency ?? 8, async (candidate) => {
    const bytes = await options.transport.get(candidate.objectKey);
    audit.sample.checked += 1;
    if (!bytes) {
      audit.sample.failures.push(`${candidate.objectKey}: nicht lesbar`);
      return;
    }
    audit.sample.bytes += bytes.byteLength;
    if (bytes.byteLength !== candidate.raw.byteLength || sha256Hex(bytes) !== candidate.raw.sha256) audit.sample.failures.push(`${candidate.objectKey}: Größe ${bytes.byteLength}/${candidate.raw.byteLength} oder SHA-256 abweichend`);
  });
  const envelopeSampled = deterministicSample(candidates.filter((candidate) => listed.has(candidate.envelopeKey)), (candidate) => `env:${candidate.envelopeKey}`, options.seed, audit.envelopeSample.requested);
  await runLimited(envelopeSampled, options.concurrency ?? 8, async (candidate) => {
    const bytes = await options.transport.get(candidate.envelopeKey);
    audit.envelopeSample.checked += 1;
    if (!bytes) {
      audit.envelopeSample.failures.push(`${candidate.envelopeKey}: nicht lesbar`);
      return;
    }
    const expected = envelopeFor(candidate.entry, candidate.raw, candidate.objectKey, options.transport.bucket);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      parsed = undefined;
    }
    const problems = envelopeCoreProblems(parsed, expected);
    if (problems.length > 0) audit.envelopeSample.failures.push(`${candidate.envelopeKey}: ${problems.join('; ')}`);
    // Unveränderlichkeit: Ein archivierter Umschlag mit gleichen Kernfeldern bleibt, auch wenn ein beschreibendes Feld
    // (Quelltitel) nach einer Parserkorrektur heute anders lautet.
    else if (sha256Hex(bytes) !== sha256Hex(envelopeBytes(expected))) audit.envelopeSample.descriptive += 1;
  });
  audit.sample.failures.sort();
  audit.envelopeSample.failures.sort();
  audit.ok = audit.missing.length === 0 && audit.pending.length === 0 && audit.sizeMismatch.length === 0 && audit.md5Mismatch.length === 0 && audit.unexpected.length === 0 && audit.notVerified.length === 0 && audit.sample.failures.length === 0 && audit.envelopeSample.failures.length === 0;
  return audit;
}

/* ------------------------------------------------------------------------------------------ */

export interface BucketInventory {
  bucket: string;
  listedAt: string;
  objects: number;
  bytes: number;
  byTopLevel: Record<string, { objects: number; bytes: number }>;
  jurisdictionPrefix: string;
  jurisdictionObjects: number;
  jurisdictionBytes: number;
  outsideObjects: number;
  /** SHA-256 über `schlüssel größe etag` aller Objekte außerhalb von `baywue/`, sortiert nach Schlüssel. */
  outsideFingerprint: string;
}

/**
 * Bucketinventar – ausschließlich `list` (lesend), deshalb auch über den ungeschützten Transport zulässig.
 * Der Fingerabdruck außerhalb von `baywue/` belegt vorher/nachher, dass dort nichts verändert wurde.
 */
export async function inventoryBucket(transport: Pick<R2Transport, 'list' | 'bucket' | 'name'>, now: () => Date = () => new Date()): Promise<BucketInventory> {
  if (!transport.list) throw new Error(`Transport ${transport.name} bietet kein Listing`);
  const objects = await transport.list('');
  const byTopLevel: BucketInventory['byTopLevel'] = {};
  const outside: string[] = [];
  let jurisdictionObjects = 0;
  let jurisdictionBytes = 0;
  for (const object of objects) {
    const top = object.key.includes('/') ? `${object.key.split('/')[0]}/` : '(ohne Präfix)';
    const slot = (byTopLevel[top] ??= { objects: 0, bytes: 0 });
    slot.objects += 1;
    slot.bytes += object.size;
    if (object.key.startsWith(JURISDICTION_PREFIX)) {
      jurisdictionObjects += 1;
      jurisdictionBytes += object.size;
    } else outside.push(`${object.key} ${object.size} ${object.md5 ?? '-'}`);
  }
  outside.sort();
  return {
    bucket: transport.bucket,
    listedAt: now().toISOString(),
    objects: objects.length,
    bytes: objects.reduce((sum, object) => sum + object.size, 0),
    byTopLevel: Object.fromEntries(Object.entries(byTopLevel).sort(([left], [right]) => (left < right ? -1 : 1))),
    jurisdictionPrefix: JURISDICTION_PREFIX,
    jurisdictionObjects,
    jurisdictionBytes,
    outsideObjects: outside.length,
    outsideFingerprint: sha256Hex(outside.join('\n')),
  };
}
