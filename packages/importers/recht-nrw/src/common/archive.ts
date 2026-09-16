/**
 * Rohquellen-Archiv des RECHT.NRW-Imports.
 *
 *   versioned-sample  Beispielkorpora: unveränderte Bytes unter `sources/recht-nrw/term-<id>/…` (Git).
 *                     Im Bulkmodus verboten (Schutzprüfung `assertArchiveAllowed`).
 *   r2                Bulk: unveränderliches Objekt im Bucket `landesrecht-quellen` unter
 *                     `west/recht-nrw/2023-12-01/term-<id>/<sha256[0..16]>-<rolle>.<ext>`, zusätzlich ein
 *                     Umschlag (`….envelope.json`) mit Quell-URL, finaler URL, Abrufzeit, Content-Type,
 *                     Größe, Rolle, Term-ID und Quellbereich. Vor dem Upload liegt jedes Objekt im
 *                     lokalen Staging außerhalb von Git (`.cache/recht-nrw-r2-staging/`).
 *
 * Unveränderlichkeit: Existiert ein Objektschlüssel bereits, muss der SHA-256 übereinstimmen (sonst
 * harter Fehler, nie überschreiben). Rückleseprüfung nach jedem Upload: Größe und SHA-256.
 * Der Objektschlüssel ist aus dem Inhalt abgeleitet und damit schon beim Schreiben der Norm endgültig;
 * die Quellenreferenz der Fassung ändert sich durch den späteren Upload nicht.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { SOURCE_SYSTEM, TARGET_JURISDICTION } from './constants.ts';
import { sha256Hex, type FetchedDocument } from './fetcher.ts';
import { RAW_ARCHIVE_DIR, writeManifestEntry, type ImportManifest, type ManifestEntry, type ManifestRawDocument, type RawDocumentRole, type SourceArea } from './manifest.ts';
import type { R2ListedObject, R2Transport } from './r2-transport.ts';

const md5Hex = (value: Uint8Array): string => createHash('md5').update(value).digest('hex');

export const R2_SOURCES_BUCKET = 'landesrecht-quellen';
export const DEFAULT_R2_STAGING_DIR = join('.cache', 'recht-nrw-r2-staging');

export const ARCHIVE_ROLES = ['version-page', 'text-document', 'attachment', 'gazette', 'amendment', 'source-pdf', 'reconstruction-source', 'envelope'] as const;
export type ArchiveRole = (typeof ARCHIVE_ROLES)[number];

export function archiveRoleFor(role: RawDocumentRole): ArchiveRole {
  switch (role) {
    case 'version-page':
    case 'stem-page':
      return 'version-page';
    case 'legacy-text':
      return 'text-document';
    case 'annex':
    case 'pdf':
      return 'attachment';
    case 'gazette-amendment':
      return 'amendment';
  }
}

export function extensionFor(contentType: string): string {
  if (/pdf/iu.test(contentType)) return 'pdf';
  if (/json/iu.test(contentType)) return 'json';
  if (/xml/iu.test(contentType)) return 'xml';
  if (/html/iu.test(contentType)) return 'html';
  return 'bin';
}

export function r2ObjectKey(input: { termId: string; sha256: string; role: ArchiveRole; contentType: string; baselineDate?: string }): string {
  if (!/^\d+$/u.test(input.termId)) throw new Error(`R2-Objektschlüssel braucht eine numerische Term-ID, nicht ${input.termId}`);
  if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw new Error('R2-Objektschlüssel braucht einen SHA-256');
  return `${TARGET_JURISDICTION}/${SOURCE_SYSTEM}/${input.baselineDate ?? SIMULATION_BASELINE_DATE}/term-${input.termId}/${input.sha256.slice(0, 16)}-${input.role}.${extensionFor(input.contentType)}`;
}

export function envelopeKey(objectKey: string): string {
  return `${objectKey}.envelope.json`;
}

export interface ArchivedObject {
  role: RawDocumentRole;
  archiveRole: ArchiveRole;
  termId: string;
  sourceArea: SourceArea;
  url: string;
  finalUrl: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  retrievedAt: string;
  localSource?: string;
  bucket?: string;
  objectKey?: string;
  status: NonNullable<ManifestRawDocument['archiveStatus']>;
}

export interface RawSourceArchive {
  readonly mode: 'versioned-sample' | 'r2';
  /** Deterministischer Ablageort ohne Schreiben (Dry-run, Quellenreferenzen). */
  locate(document: FetchedDocument, meta: { termId: string; sourceArea: SourceArea; role: RawDocumentRole }): ArchivedObject;
  /** Schreibt ins Archiv (Schreiblauf). */
  store(document: FetchedDocument, object: ArchivedObject): Promise<ArchivedObject>;
  referenceFields(object: ArchivedObject): Pick<SourceReference, 'availability' | 'localSource' | 'bucket' | 'objectKey'>;
  readonly stats: { stored: number; uploaded: number; verified: number; alreadyPresent: number };
}

export class ArchiveError extends Error {
  readonly kind: 'conflict' | 'verification' | 'transport' | 'guard';

  constructor(kind: ArchiveError['kind'], message: string) {
    super(message);
    this.name = 'ArchiveError';
    this.kind = kind;
  }
}

function baseObject(document: FetchedDocument, meta: { termId: string; sourceArea: SourceArea; role: RawDocumentRole }): Omit<ArchivedObject, 'status'> {
  return { role: meta.role, archiveRole: archiveRoleFor(meta.role), termId: meta.termId, sourceArea: meta.sourceArea, url: document.url, finalUrl: document.finalUrl, sha256: document.sha256, byteLength: document.bytes.byteLength, contentType: document.contentType, retrievedAt: document.retrievedAt };
}

/** Pfad der versionierten Beispielquelle (unverändert gegenüber den bisherigen Korpora). */
export function sampleArchivePath(termId: string, sha256: string, role: RawDocumentRole, contentType: string): string {
  const extension = /pdf/iu.test(contentType) ? 'pdf' : 'html';
  return join(RAW_ARCHIVE_DIR, `term-${termId}`, `${sha256.slice(0, 16)}-${role}.${extension}`).replace(/\\/gu, '/');
}

export function createVersionedSampleArchive(root: string): RawSourceArchive {
  const stats = { stored: 0, uploaded: 0, verified: 0, alreadyPresent: 0 };
  return {
    mode: 'versioned-sample',
    stats,
    locate(document, meta) {
      return { ...baseObject(document, meta), localSource: sampleArchivePath(meta.termId, document.sha256, meta.role, document.contentType), status: 'versioned' };
    },
    async store(document, object) {
      if (!object.localSource) throw new ArchiveError('guard', 'Versionierte Quelle ohne Pfad');
      if (sha256Hex(document.bytes) !== object.sha256) throw new ArchiveError('verification', `${object.url}: Bytes passen nicht zum SHA-256`);
      const written = await writeFileAtomic(join(root, object.localSource), document.bytes);
      if (written) stats.stored += 1;
      else stats.alreadyPresent += 1;
      return object;
    },
    referenceFields(object) {
      return { availability: 'versioned', localSource: object.localSource };
    },
  };
}

export interface R2ArchiveOptions {
  root: string;
  bucket?: string;
  baselineDate?: string;
  /** Lokales Staging außerhalb von Git (Standard `.cache/recht-nrw-r2-staging`). */
  stagingDir?: string;
  transport?: R2Transport;
  /** immediate: sofort hochladen und rücklesen; deferred: nur Staging, Upload mit `r2-sync`. */
  upload: 'immediate' | 'deferred';
}

export function objectMetadata(object: ArchivedObject): Record<string, string> {
  return { sha256: object.sha256, 'source-url': object.url, 'final-url': object.finalUrl, 'retrieved-at': object.retrievedAt, role: object.archiveRole, 'term-id': object.termId, 'source-area': object.sourceArea, 'byte-length': String(object.byteLength) };
}

export function envelopeFor(object: ArchivedObject, headers?: Record<string, string>): Record<string, unknown> {
  const envelope: Record<string, unknown> = { schemaVersion: 'recht-nrw-r2-envelope/1', objectKey: object.objectKey, bucket: object.bucket, sha256: object.sha256, byteLength: object.byteLength, contentType: object.contentType, url: object.url, finalUrl: object.finalUrl, retrievedAt: object.retrievedAt, role: object.archiveRole, sourceRole: object.role, termId: object.termId, sourceArea: object.sourceArea, jurisdiction: TARGET_JURISDICTION, baselineDate: SIMULATION_BASELINE_DATE };
  if (headers && Object.keys(headers).length > 0) envelope.headers = headers;
  return envelope;
}

/**
 * Lädt ein Objekt unveränderlich hoch: gleicher SHA-256 → nichts zu tun; anderer SHA-256 → Fehler;
 * neu → Upload, danach Rücklesen und Prüfung von Größe und SHA-256.
 */
export async function uploadVerified(transport: R2Transport, key: string, bytes: Uint8Array, options: { contentType: string; metadata: Record<string, string>; sha256: string; immutableEnvelope?: boolean }): Promise<'verified' | 'already-present'> {
  const head = await transport.head(key);
  if (head) {
    if (options.immutableEnvelope) return 'already-present';
    if (head.sha256 && head.sha256 !== options.sha256) throw new ArchiveError('conflict', `R2-Objekt ${key} existiert mit anderem SHA-256 (${head.sha256}); Rohquellen werden nie überschrieben`);
    if (!head.sha256 || head.size !== bytes.byteLength) {
      const existing = await transport.get(key);
      if (!existing || sha256Hex(existing) !== options.sha256) throw new ArchiveError('conflict', `R2-Objekt ${key} existiert mit anderem Inhalt; Rohquellen werden nie überschrieben`);
    }
    return 'already-present';
  }
  await transport.put(key, bytes, { contentType: options.contentType, metadata: options.metadata });
  const readback = await transport.get(key);
  if (!readback) throw new ArchiveError('verification', `R2-Objekt ${key} nach dem Upload nicht lesbar`);
  if (readback.byteLength !== bytes.byteLength || sha256Hex(readback) !== options.sha256) throw new ArchiveError('verification', `Rückleseprüfung ${key} fehlgeschlagen (Größe ${readback.byteLength} statt ${bytes.byteLength} oder SHA-256 abweichend)`);
  return 'verified';
}

export function createR2Archive(options: R2ArchiveOptions): RawSourceArchive {
  const bucket = options.bucket ?? R2_SOURCES_BUCKET;
  const stagingDir = resolve(options.root, options.stagingDir ?? DEFAULT_R2_STAGING_DIR);
  if (options.upload === 'immediate' && !options.transport) throw new ArchiveError('guard', 'Sofortiger R2-Upload braucht einen Transport (Zugangsdaten aus der Umgebung)');
  const stats = { stored: 0, uploaded: 0, verified: 0, alreadyPresent: 0 };
  return {
    mode: 'r2',
    stats,
    locate(document, meta) {
      const objectKey = r2ObjectKey({ termId: meta.termId, sha256: document.sha256, role: archiveRoleFor(meta.role), contentType: document.contentType, ...(options.baselineDate ? { baselineDate: options.baselineDate } : {}) });
      return { ...baseObject(document, meta), bucket, objectKey, status: 'staged' };
    },
    async store(document, object) {
      if (!object.objectKey) throw new ArchiveError('guard', 'R2-Objekt ohne Schlüssel');
      if (sha256Hex(document.bytes) !== object.sha256) throw new ArchiveError('verification', `${object.url}: Bytes passen nicht zum SHA-256`);
      const stagedFile = join(stagingDir, object.objectKey);
      await writeFileAtomic(stagedFile, document.bytes);
      await writeJsonAtomic(join(stagingDir, envelopeKey(object.objectKey)), envelopeFor(object, document.headers));
      stats.stored += 1;
      if (options.upload === 'deferred') return object;
      const transport = options.transport!;
      try {
        const outcome = await uploadVerified(transport, object.objectKey, document.bytes, { contentType: object.contentType, metadata: objectMetadata(object), sha256: object.sha256 });
        const envelope = new TextEncoder().encode(`${JSON.stringify(envelopeFor(object, document.headers), null, 2)}\n`);
        await uploadVerified(transport, envelopeKey(object.objectKey), envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(envelope), role: 'envelope', 'term-id': object.termId }, sha256: sha256Hex(envelope), immutableEnvelope: true });
        if (outcome === 'verified') {
          stats.uploaded += 1;
          stats.verified += 1;
        } else {
          stats.alreadyPresent += 1;
        }
      } catch (error) {
        if (error instanceof ArchiveError) throw error;
        throw new ArchiveError('transport', `R2-Upload ${object.objectKey}: ${(error as Error).message}`);
      }
      return { ...object, status: 'verified' };
    },
    referenceFields(object) {
      return { availability: 'r2-archived', bucket: object.bucket, objectKey: object.objectKey };
    },
  };
}

/**
 * Schutzprüfung: Im Bulkmodus dürfen keine Rohquellen in Git-Pfade geschrieben werden. Erlaubt ist nur
 * das R2-Archiv mit Staging außerhalb des Repositorys oder unter dem ignorierten `.cache/`.
 */
export function assertArchiveAllowed(root: string, mode: 'sample' | 'bulk', archive: RawSourceArchive, stagingDir?: string): void {
  if (mode !== 'bulk') return;
  if (archive.mode === 'versioned-sample') throw new ArchiveError('guard', `Bulkmodus: Rohquellen dürfen nicht unter ${RAW_ARCHIVE_DIR}/ versioniert werden (Beispielkorpus-Ausnahme); R2-Archiv verwenden`);
  if (stagingDir) {
    const absolute = resolve(root, stagingDir);
    const inside = relative(resolve(root), absolute);
    const insideRepository = inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
    if (insideRepository && !(inside === '.cache' || inside.startsWith(`.cache/`) || inside.startsWith('.cache\\'))) {
      throw new ArchiveError('guard', `Bulkmodus: R2-Staging ${absolute} liegt in einem versionierten Repository-Pfad; erlaubt sind .cache/ oder Pfade außerhalb des Repositorys`);
    }
  }
}

/**
 * Obergrenze gleichzeitiger Manifesteinträge beim R2-Sync (jeder Eintrag bleibt intern sequenziell: Vorabprüfung →
 * Upload → Rücklesung). Prozessgestützte Transporte (`wrangler`) sind CPU-gebunden (ein Wrangler-Start je Aufruf),
 * HTTP-Transporte (`wrangler-api`, `s3`) nur latenzgebunden.
 */
export const MAX_SYNC_CONCURRENCY = 8;
export const MAX_SYNC_CONCURRENCY_HTTP = 32;
export function maxSyncConcurrency(transport: Pick<R2Transport, 'name'>): number {
  return transport.name === 'wrangler' ? MAX_SYNC_CONCURRENCY : MAX_SYNC_CONCURRENCY_HTTP;
}

/**
 * Prüfregime des Syncs:
 *  - `readback`: je Objekt Vorabprüfung (Rücklesen), Upload, Rücklesen mit SHA-256-Vergleich (6 API-Aufrufe je
 *    Objekt samt Umschlag; mit dem API-Ratenlimit ≈0,6 Objekte/s).
 *  - `etag`: Vorabprüfung und Nachprüfung über das Bucket-Listing (1 Aufruf je 1000 Objekte: Existenz, Größe, Etag
 *    = von R2 berechneter MD5 der gespeicherten Bytes, verglichen mit dem lokalen MD5) statt Byte-Rücklesung je
 *    Objekt; zusätzlich zufällige Byte-Rücklesungen (ETAG_SAMPLE_RATE) mit SHA-256-Vergleich. 2 Aufrufe je Objekt.
 *    Unveränderlichkeit bleibt: vorhandener Schlüssel mit anderem MD5/Größe ist ein harter Fehler.
 */
export type SyncVerification = 'readback' | 'etag';
export const ETAG_SAMPLE_RATE = 0.02;
/** Einträge je Etag-Charge: Upload → Listing-Nachprüfung → Stichproben → Manifestschreibung (wiederaufnehmbar). */
const ETAG_BATCH_ENTRIES = 800;

export interface SyncStagedOptions {
  root: string;
  manifest: ImportManifest;
  transport: R2Transport;
  stagingDir?: string;
  dryRun: boolean;
  limit?: number;
  concurrency?: number;
  verification?: SyncVerification;
  sampleRate?: number;
  random?: () => number;
  log?: (line: string) => void;
}

export interface SyncStagedResult {
  pending: number;
  uploaded: number;
  alreadyPresent: number;
  missingStaging: string[];
  verification: SyncVerification;
  /** Objekte (samt Umschlägen), deren Upload über Listing-Etag und Größe nachgeprüft wurde. */
  verifiedByListing: number;
  /** Zufällige Byte-Rücklesungen mit SHA-256-Vergleich im Etag-Regime. */
  sampledReadbacks: number;
  listingCalls: number;
}

/** Gemeinsames Schlüsselpräfix (ganze Pfadsegmente) – Bereich des Listings. */
export function commonKeyPrefix(keys: readonly string[]): string {
  if (keys.length === 0) return '';
  let segments = keys[0]!.split('/').slice(0, -1);
  for (const key of keys) {
    const parts = key.split('/').slice(0, -1);
    let shared = 0;
    while (shared < segments.length && shared < parts.length && segments[shared] === parts[shared]) shared += 1;
    segments = segments.slice(0, shared);
  }
  return segments.length > 0 ? `${segments.join('/')}/` : '';
}

/**
 * Überträgt gestagte Objekte der Manifesteinträge nach R2 und markiert sie als geprüft. `concurrency`
 * verarbeitet mehrere Manifesteinträge gleichzeitig; jeder Eintrag schreibt sein Manifest erst nach vollständiger
 * Prüfung seiner Objekte (wiederaufnehmbar). Der erste Fehler bricht den Lauf ab.
 */
export async function syncStagedObjects(options: SyncStagedOptions): Promise<SyncStagedResult> {
  const stagingDir = resolve(options.root, options.stagingDir ?? DEFAULT_R2_STAGING_DIR);
  const verification: SyncVerification = options.verification ?? 'readback';
  const result: SyncStagedResult = { pending: 0, uploaded: 0, alreadyPresent: 0, missingStaging: [], verification, verifiedByListing: 0, sampledReadbacks: 0, listingCalls: 0 };
  const concurrency = Math.min(maxSyncConcurrency(options.transport), Math.max(1, Math.floor(options.concurrency ?? 1)));
  const selected: Array<{ entry: ManifestEntry; staged: ManifestRawDocument[] }> = [];
  for (const entry of options.manifest.entries) {
    const staged = entry.rawDocuments.filter((raw) => raw.objectKey && raw.archiveStatus === 'staged');
    if (staged.length === 0) continue;
    result.pending += staged.length;
    if (options.dryRun || (options.limit !== undefined && selected.length >= options.limit)) continue;
    selected.push({ entry, staged });
  }
  if (verification === 'etag' && !options.transport.list) throw new ArchiveError('guard', `Transport ${options.transport.name} bietet kein Listing; Etag-Prüfung nicht möglich (--verify readback)`);

  const loadStaged = async (raw: ManifestRawDocument): Promise<Uint8Array | null> => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(join(stagingDir, raw.objectKey!)));
    } catch {
      result.missingStaging.push(raw.objectKey!);
      return null;
    }
    if (sha256Hex(bytes) !== raw.sha256) throw new ArchiveError('verification', `Staging ${raw.objectKey}: SHA-256 weicht vom Manifest ab`);
    return bytes;
  };
  const objectFor = (entry: ManifestEntry, raw: ManifestRawDocument): ArchivedObject => ({ role: raw.role, archiveRole: archiveRoleFor(raw.role), termId: entry.sourceIdentity.replace(/^term:/u, ''), sourceArea: entry.sourceArea, url: raw.url, finalUrl: raw.finalUrl, sha256: raw.sha256, byteLength: raw.byteLength, contentType: raw.contentType, retrievedAt: raw.retrievedAt, bucket: raw.bucket ?? options.transport.bucket, objectKey: raw.objectKey!, status: 'staged' });

  // Begrenzter Arbeitsvorrat: höchstens `concurrency` Einträge gleichzeitig, Reihenfolge der Aufnahme bleibt die
  // Manifestreihenfolge; ein Fehler stoppt die Aufnahme neuer Einträge und wird nach Abschluss der laufenden geworfen.
  const runWorkers = async <T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> => {
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
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    if (failure !== undefined) throw failure;
  };

  if (verification === 'readback') {
    let inFlight = 0;
    await runWorkers(selected, async ({ entry, staged }) => {
      let changed = false;
      inFlight += 1;
      for (const raw of staged) {
        const startedAt = Date.now();
        const bytes = await loadStaged(raw);
        if (!bytes) continue;
        const object = objectFor(entry, raw);
        const outcome = await uploadVerified(options.transport, raw.objectKey!, bytes, { contentType: raw.contentType, metadata: objectMetadata(object), sha256: raw.sha256 });
        const envelope = new TextEncoder().encode(`${JSON.stringify(envelopeFor(object), null, 2)}\n`);
        await uploadVerified(options.transport, envelopeKey(raw.objectKey!), envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(envelope), role: 'envelope', 'term-id': object.termId }, sha256: sha256Hex(envelope), immutableEnvelope: true });
        if (outcome === 'verified') result.uploaded += 1;
        else result.alreadyPresent += 1;
        raw.archiveStatus = 'verified';
        changed = true;
        options.log?.(`${outcome === 'verified' ? 'hochgeladen' : 'bereits vorhanden'}: ${raw.objectKey} (${Math.round(bytes.byteLength / 1024)} KiB, ${Date.now() - startedAt} ms, ${inFlight} parallel)`);
      }
      inFlight -= 1;
      if (changed) await writeManifestEntry(options.root, entry);
    });
    return result;
  }

  // Etag-Regime, chargenweise: Listing → Upload fehlender Objekte → Listing-Nachprüfung → Stichproben → Manifest.
  const list = options.transport.list!.bind(options.transport);
  const sampleRate = options.sampleRate ?? ETAG_SAMPLE_RATE;
  const random = options.random ?? Math.random;
  const prefix = commonKeyPrefix(selected.flatMap(({ staged }) => staged.map((raw) => raw.objectKey!)));
  const listing = async (): Promise<Map<string, R2ListedObject>> => {
    result.listingCalls += 1;
    return new Map((await list(prefix)).map((object) => [object.key, object]));
  };
  interface Upload { key: string; md5: string; size: number; sha256: string; envelope: boolean }
  for (let start = 0; start < selected.length; start += ETAG_BATCH_ENTRIES) {
    const batch = selected.slice(start, start + ETAG_BATCH_ENTRIES);
    const before = await listing();
    const uploads: Upload[] = [];
    const uploadedByEntry = new Map<ManifestEntry, Upload[]>();
    await runWorkers(batch, async ({ entry, staged }) => {
      for (const raw of staged) {
        const bytes = await loadStaged(raw);
        if (!bytes) continue;
        const object = objectFor(entry, raw);
        const envelope = new TextEncoder().encode(`${JSON.stringify(envelopeFor(object), null, 2)}\n`);
        for (const [key, payload, contentType, metadata, isEnvelope] of [
          [raw.objectKey!, bytes, raw.contentType, objectMetadata(object), false],
          [envelopeKey(raw.objectKey!), envelope, 'application/json', { sha256: sha256Hex(envelope), role: 'envelope', 'term-id': object.termId }, true],
        ] as const) {
          const md5 = md5Hex(payload);
          const existing = before.get(key);
          if (existing) {
            // Unveränderlichkeit: vorhandene Rohquellen werden nie überschrieben; Umschläge gelten als eingefroren.
            if (!isEnvelope && (existing.size !== payload.byteLength || (existing.md5 && existing.md5 !== md5))) throw new ArchiveError('conflict', `R2-Objekt ${key} existiert mit anderem Inhalt (Größe ${existing.size}, MD5 ${existing.md5 ?? '?'}); Rohquellen werden nie überschrieben`);
            if (!isEnvelope) result.alreadyPresent += 1;
            continue;
          }
          await options.transport.put(key, payload, { contentType, metadata });
          const upload: Upload = { key, md5, size: payload.byteLength, sha256: sha256Hex(payload), envelope: isEnvelope };
          uploads.push(upload);
          uploadedByEntry.set(entry, [...(uploadedByEntry.get(entry) ?? []), upload]);
        }
      }
    });

    // Nachprüfung über ein frisches Listing: jedes hochgeladene Objekt muss mit Größe und MD5 vorliegen.
    const after = uploads.length > 0 ? await listing() : before;
    for (const upload of uploads) {
      const listed = after.get(upload.key);
      if (!listed) throw new ArchiveError('verification', `R2-Objekt ${upload.key} nach dem Upload nicht im Listing`);
      if (listed.size !== upload.size || !listed.md5 || listed.md5 !== upload.md5) throw new ArchiveError('verification', `Etag-Prüfung ${upload.key} fehlgeschlagen (Größe ${listed.size} statt ${upload.size}, MD5 ${listed.md5 ?? '?'} statt ${upload.md5})`);
      result.verifiedByListing += 1;
    }
    // Zufällige Byte-Rücklesungen (nur Objekte, keine Umschläge) mit SHA-256-Vergleich.
    const samples = uploads.filter((upload) => !upload.envelope && random() < sampleRate);
    await runWorkers(samples, async (upload) => {
      const readback = await options.transport.get(upload.key);
      if (!readback || readback.byteLength !== upload.size || sha256Hex(readback) !== upload.sha256) throw new ArchiveError('verification', `Stichproben-Rücklesung ${upload.key} fehlgeschlagen`);
      result.sampledReadbacks += 1;
    });
    // Erst jetzt gelten die Objekte der Charge als geprüft; Manifest je Eintrag schreiben.
    for (const { entry, staged } of batch) {
      let changed = false;
      for (const raw of staged) {
        if (result.missingStaging.includes(raw.objectKey!)) continue;
        raw.archiveStatus = 'verified';
        changed = true;
        const uploaded = uploadedByEntry.get(entry)?.some((upload) => upload.key === raw.objectKey) ?? false;
        if (uploaded) result.uploaded += 1;
        options.log?.(`${uploaded ? 'hochgeladen (Listing/Etag geprüft)' : 'bereits vorhanden (Etag gleich)'}: ${raw.objectKey}`);
      }
      if (changed) await writeManifestEntry(options.root, entry);
    }
  }
  return result;
}
