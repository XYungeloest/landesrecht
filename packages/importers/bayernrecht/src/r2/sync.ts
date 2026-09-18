/**
 * Sync der gestagten BayWü-Rohquellen nach R2 (`landesrecht-quellen`, nur unter `baywue/bayernrecht/2023-12-01/`).
 *
 * Ablauf und Prüfregime folgen dem West-Sync (`syncStagedObjects`), gebunden an das BayWü-Manifest:
 *
 *   0. Staging-Audit (Manifest ↔ Staging, SHA-256 nachgerechnet). Schlägt es fehl, endet der Sync, bevor der
 *      Transport ein einziges Mal aufgerufen wird.
 *   1. `etag` (Standard bei Transporten mit Listing): je Charge Listing → Upload fehlender Objekte (Rohobjekt und
 *      Umschlag) → Manifest `uploaded` → frisches Listing: Existenz, Größe, Etag = MD5 der gespeicherten Bytes
 *      gegen den lokalen MD5 → deterministische Byte-Stichprobe (SHA-256 nach Download) → Manifest `verified`.
 *      `readback` (Transporte ohne Listing): je Objekt Vorabprüfung, Upload, `uploaded`, Rücklesen mit
 *      SHA-256-Vergleich, `verified`.
 *   2. Unveränderlichkeit: Ein vorhandener Schlüssel mit anderer Größe oder anderem Inhalt ist ein harter Fehler –
 *      es wird nie überschrieben und nie gelöscht. Gleicher Inhalt zählt als bereits vorhanden.
 *
 * Wiederaufnehmbar: Der Archivstatus steht je Rohquelle im Manifest (`staged` → `uploaded` → `verified`); ein
 * abgebrochener Lauf setzt bei `staged`/`uploaded` fort und prüft Vorhandenes erneut.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { ETAG_SAMPLE_RATE, maxSyncConcurrency } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import type { R2ListedObject, R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { BASELINE_DATE } from '../common/constants.ts';
import { R2_SOURCES_BUCKET } from '../common/environment.ts';
import { writeManifestEntry, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import { ArchiveError, envelopeCoreProblems, envelopeFor, guardTransport, inDeterministicSample, KEY_PREFIX, md5Hex, objectMetadata, sha256Hex } from './archive.ts';
import { auditStaging, stagingBlockers, type StagingAudit } from './audit.ts';
import { archiveCandidates, parseEnvelope, type ArchiveCandidate } from './stage.ts';

export type SyncVerification = 'etag' | 'readback';
/** Manifesteinträge je Etag-Charge (Listing → Upload → Nachprüfung → Manifest); wiederaufnehmbar je Charge. */
export const SYNC_BATCH_ENTRIES = 400;

export interface SyncOptions {
  root: string;
  manifest: ImportManifest;
  /** Transport; wird hier zusätzlich mit dem Präfixschutz umhüllt. */
  transport: R2Transport;
  stagingDir: string;
  bucket?: string;
  /** Höchstens so viele Manifesteinträge in diesem Lauf. */
  limit?: number;
  concurrency?: number;
  verification?: SyncVerification;
  /** Quote der Byte-Rücklesungen je Charge im Etag-Regime (deterministisch nach Saat und Schlüssel). */
  sampleRate?: number;
  seed?: string;
  batchEntries?: number;
  /** Ergebnis eines bereits gelaufenen Staging-Audits; sonst läuft es hier. */
  audit?: StagingAudit;
  /** Wird laufend gefüllt; bricht der Sync ab, behält der Aufrufer so den Zwischenstand (Bericht). */
  result?: SyncResult;
  log?: (line: string) => void;
}

export interface SyncResult {
  blocked: boolean;
  blockReasons: string[];
  transport: string;
  verification: SyncVerification;
  concurrency: number;
  /** Rohquellen mit Status staged/uploaded vor dem Lauf. */
  pending: number;
  /** In diesem Lauf bearbeitete Rohquellen. */
  processed: number;
  uploaded: number;
  alreadyPresent: number;
  envelopesUploaded: number;
  envelopesPresent: number;
  /** Abweichende gestagte Umschläge, für die der archivierte (Kernfelder gleich) übernommen wurde. */
  envelopesAdopted: number;
  bytesUploaded: number;
  /** Objekte samt Umschlägen, deren Upload über Listing (Größe, Etag/MD5) nachgeprüft wurde. */
  verifiedByListing: number;
  /** Byte-Rücklesungen mit SHA-256-Vergleich (Etag: Stichprobe; readback: jedes Objekt). */
  readbacks: number;
  listingCalls: number;
  verified: number;
  durationMs: number;
}

interface Item {
  key: string;
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
  envelope: boolean;
}

interface Checked {
  key: string;
  size: number;
  md5: string;
  sha256: string;
  envelope: boolean;
  uploaded: boolean;
}

async function runWorkers<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
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

export async function syncArchive(options: SyncOptions): Promise<SyncResult> {
  const startedAt = Date.now();
  const bucket = options.bucket ?? R2_SOURCES_BUCKET;
  const seed = options.seed ?? BASELINE_DATE;
  const sampleRate = options.sampleRate ?? ETAG_SAMPLE_RATE;
  const audit = options.audit ?? (await auditStaging({ manifest: options.manifest, stagingDir: options.stagingDir, bucket }));
  const result: SyncResult = Object.assign(options.result ?? ({} as SyncResult), { blocked: false, blockReasons: [], transport: options.transport.name, verification: options.verification ?? (options.transport.list ? 'etag' : 'readback'), concurrency: 1, pending: 0, processed: 0, uploaded: 0, alreadyPresent: 0, envelopesUploaded: 0, envelopesPresent: 0, envelopesAdopted: 0, bytesUploaded: 0, verifiedByListing: 0, readbacks: 0, listingCalls: 0, verified: 0, durationMs: 0 });

  // 0. Kein Sync ohne bestandenes Staging-Audit – und zwar bevor der Transport irgendetwas sieht.
  const blockers = stagingBlockers(audit);
  if (blockers.length > 0) {
    result.blocked = true;
    result.blockReasons = blockers;
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const transport = guardTransport(options.transport, bucket);
  const verification = result.verification;
  if (verification === 'etag' && !transport.list) throw new ArchiveError('guard', `Transport ${transport.name} bietet kein Listing; Etag-Prüfung nicht möglich (--verify readback)`);
  const concurrency = Math.min(maxSyncConcurrency(transport), Math.max(1, Math.floor(options.concurrency ?? 1)));
  result.concurrency = concurrency;

  const byEntry = new Map<ManifestEntry, ArchiveCandidate[]>();
  for (const candidate of archiveCandidates(options.manifest)) {
    if (candidate.raw.archiveStatus !== 'staged' && candidate.raw.archiveStatus !== 'uploaded') continue;
    result.pending += 1;
    byEntry.set(candidate.entry, [...(byEntry.get(candidate.entry) ?? []), candidate]);
  }
  let groups = [...byEntry.entries()].map(([entry, candidates]) => ({ entry, candidates }));
  if (options.limit !== undefined) groups = groups.slice(0, options.limit);

  const itemsFor = async (candidate: ArchiveCandidate): Promise<[Item, Item]> => {
    const bytes = new Uint8Array(await readFile(join(options.stagingDir, candidate.objectKey)));
    if (bytes.byteLength !== candidate.raw.byteLength || sha256Hex(bytes) !== candidate.raw.sha256) throw new ArchiveError('verification', `Staging ${candidate.objectKey}: Bytes passen nicht (mehr) zum Manifest`);
    const envelopeFile = new Uint8Array(await readFile(join(options.stagingDir, candidate.envelopeKey)));
    const envelope = envelopeFor(candidate.entry, candidate.raw, candidate.objectKey, bucket);
    return [
      { key: candidate.objectKey, bytes, contentType: candidate.raw.contentType, metadata: objectMetadata(envelope), envelope: false },
      { key: candidate.envelopeKey, bytes: envelopeFile, contentType: 'application/json', metadata: { sha256: sha256Hex(envelopeFile), role: 'envelope', 'source-identity': candidate.entry.sourceIdentity }, envelope: true },
    ];
  };
  const count = (item: Item, uploaded: boolean): void => {
    if (uploaded) {
      result.bytesUploaded += item.bytes.byteLength;
      if (item.envelope) result.envelopesUploaded += 1;
      else result.uploaded += 1;
    } else if (item.envelope) result.envelopesPresent += 1;
    else result.alreadyPresent += 1;
  };
  // Ein archivierter Umschlag ist unveränderlich. Weicht der gestagte ab, gilt der archivierte, sofern seine
  // Kernfelder stimmen (nur ein beschreibendes Feld wie der Quelltitel darf sich seit dem ersten Schreiben geändert
  // haben); er wird ins Staging übernommen. Jede andere Abweichung – und jede bei einem Rohobjekt – bricht ab.
  const adoptArchivedEnvelope = async (item: Item, candidate: ArchiveCandidate): Promise<Uint8Array> => {
    const remote = await transport.get(item.key);
    result.readbacks += 1;
    if (!remote) throw new ArchiveError('conflict', `R2-Umschlag ${item.key} gelistet, aber nicht lesbar`);
    const problems = envelopeCoreProblems(parseEnvelope(remote), envelopeFor(candidate.entry, candidate.raw, candidate.objectKey, bucket));
    if (problems.length > 0) throw new ArchiveError('conflict', `R2-Umschlag ${item.key} weicht in Kernfeldern ab (${problems.join('; ')}); nie überschreiben`);
    await writeFileAtomic(join(options.stagingDir, candidate.envelopeKey), remote);
    result.envelopesAdopted += 1;
    options.log?.(`Umschlag ${item.key}: archivierter Stand beibehalten (Kernfelder gleich, beschreibende Felder abweichend)`);
    return remote;
  };
  const readbackMatches = async (key: string, size: number, sha256: string): Promise<void> => {
    const readback = await transport.get(key);
    result.readbacks += 1;
    if (!readback) throw new ArchiveError('verification', `R2-Objekt ${key} nach dem Upload nicht lesbar`);
    if (readback.byteLength !== size || sha256Hex(readback) !== sha256) throw new ArchiveError('verification', `Rücklesung ${key} fehlgeschlagen (Größe ${readback.byteLength} statt ${size} oder SHA-256 abweichend)`);
  };

  if (verification === 'readback') {
    let done = 0;
    try {
      await runWorkers(groups, concurrency, async ({ entry, candidates }) => {
        for (const candidate of candidates) {
          const items = await itemsFor(candidate);
          for (const item of items) {
            const sha = sha256Hex(item.bytes);
            const head = await transport.head(item.key);
            if (head) {
              if (head.size !== item.bytes.byteLength || (head.sha256 !== undefined && head.sha256 !== sha)) {
                if (!item.envelope) throw new ArchiveError('conflict', `R2-Objekt ${item.key} existiert mit anderem Inhalt; Rohquellen werden nie überschrieben`);
                item.bytes = await adoptArchivedEnvelope(item, candidate);
              }
              count(item, false);
            } else {
              await transport.put(item.key, item.bytes, { contentType: item.contentType, metadata: item.metadata });
              count(item, true);
            }
          }
          candidate.raw.archiveStatus = 'uploaded';
          await writeManifestEntry(options.root, entry);
          for (const item of items) await readbackMatches(item.key, item.bytes.byteLength, sha256Hex(item.bytes));
          candidate.raw.archiveStatus = 'verified';
          result.verified += 1;
          result.processed += 1;
        }
        await writeManifestEntry(options.root, entry);
        done += 1;
        if (done % 100 === 0) options.log?.(`readback: ${done}/${groups.length} Einträge geprüft`);
      });
    } finally {
      result.durationMs = Date.now() - startedAt;
    }
    return result;
  }

  // Etag-Regime, chargenweise.
  const listing = async (): Promise<Map<string, R2ListedObject>> => {
    result.listingCalls += 1;
    return new Map((await transport.list!(KEY_PREFIX)).map((object) => [object.key, object]));
  };
  const batchSize = Math.max(1, options.batchEntries ?? SYNC_BATCH_ENTRIES);
  try {
    for (let start = 0; start < groups.length; start += batchSize) {
      const batch = groups.slice(start, start + batchSize);
      const batchStartedAt = Date.now();
      const before = await listing();
      const checked: Checked[] = [];
      await runWorkers(batch, concurrency, async ({ entry, candidates }) => {
        for (const candidate of candidates) {
          for (const item of await itemsFor(candidate)) {
            const md5 = md5Hex(item.bytes);
            const sha = sha256Hex(item.bytes);
            const existing = before.get(item.key);
            if (existing) {
              // Unveränderlichkeit – auch Umschläge werden nie ersetzt; ein abweichender gestagter Umschlag weicht
              // dem archivierten, wenn dessen Kernfelder stimmen.
              if (existing.size !== item.bytes.byteLength || (existing.md5 !== undefined && existing.md5 !== md5)) {
                if (!item.envelope) throw new ArchiveError('conflict', `R2-Objekt ${item.key} existiert mit anderem Inhalt (Größe ${existing.size}, MD5 ${existing.md5 ?? '?'}); nie überschreiben`);
                const archived = await adoptArchivedEnvelope(item, candidate);
                count(item, false);
                checked.push({ key: item.key, size: archived.byteLength, md5: md5Hex(archived), sha256: sha256Hex(archived), envelope: true, uploaded: false });
                continue;
              }
              if (existing.md5 === undefined) await readbackMatches(item.key, item.bytes.byteLength, sha);
              count(item, false);
              checked.push({ key: item.key, size: item.bytes.byteLength, md5, sha256: sha, envelope: item.envelope, uploaded: false });
              continue;
            }
            await transport.put(item.key, item.bytes, { contentType: item.contentType, metadata: item.metadata });
            count(item, true);
            checked.push({ key: item.key, size: item.bytes.byteLength, md5, sha256: sha, envelope: item.envelope, uploaded: true });
          }
          if (candidate.raw.archiveStatus === 'staged') candidate.raw.archiveStatus = 'uploaded';
        }
        await writeManifestEntry(options.root, entry);
      });

      // Nachprüfung über ein frisches Listing: jedes Objekt der Charge mit Größe und MD5.
      const after = await listing();
      for (const object of checked) {
        const listed = after.get(object.key);
        if (!listed) throw new ArchiveError('verification', `R2-Objekt ${object.key} nach dem Upload nicht im Listing`);
        if (listed.size !== object.size || !listed.md5 || listed.md5 !== object.md5) throw new ArchiveError('verification', `Etag-Prüfung ${object.key} fehlgeschlagen (Größe ${listed.size} statt ${object.size}, MD5 ${listed.md5 ?? '?'} statt ${object.md5})`);
        result.verifiedByListing += 1;
      }
      // Deterministische Byte-Stichprobe der Rohobjekte dieser Charge (SHA-256 nach Download).
      const samples = checked.filter((object) => !object.envelope && inDeterministicSample(seed, object.key, sampleRate));
      await runWorkers(samples, concurrency, (object) => readbackMatches(object.key, object.size, object.sha256));

      for (const { entry, candidates } of batch) {
        for (const candidate of candidates) {
          candidate.raw.archiveStatus = 'verified';
          result.verified += 1;
          result.processed += 1;
        }
        await writeManifestEntry(options.root, entry);
      }
      options.log?.(`Charge ${Math.floor(start / batchSize) + 1}/${Math.ceil(groups.length / batchSize)}: ${batch.length} Einträge, ${checked.filter((object) => object.uploaded).length} Objekte hochgeladen, ${checked.filter((object) => !object.uploaded).length} vorhanden, ${checked.length} per Listing geprüft, ${samples.length} Byte-Stichproben, ${Math.round((Date.now() - batchStartedAt) / 1000)} s`);
    }
  } finally {
    result.durationMs = Date.now() - startedAt;
  }
  return result;
}
