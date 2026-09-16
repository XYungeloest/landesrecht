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
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { SOURCE_SYSTEM, TARGET_JURISDICTION } from './constants.ts';
import { sha256Hex, type FetchedDocument } from './fetcher.ts';
import { RAW_ARCHIVE_DIR, writeManifestEntry, type ImportManifest, type ManifestRawDocument, type RawDocumentRole, type SourceArea } from './manifest.ts';
import type { R2Transport } from './r2-transport.ts';

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

/** Überträgt gestagte Objekte der Manifesteinträge nach R2 (Rückleseprüfung) und markiert sie als geprüft. */
export async function syncStagedObjects(options: { root: string; manifest: ImportManifest; transport: R2Transport; stagingDir?: string; dryRun: boolean; limit?: number; log?: (line: string) => void }): Promise<{ pending: number; uploaded: number; alreadyPresent: number; missingStaging: string[] }> {
  const stagingDir = resolve(options.root, options.stagingDir ?? DEFAULT_R2_STAGING_DIR);
  const result = { pending: 0, uploaded: 0, alreadyPresent: 0, missingStaging: [] as string[] };
  let processed = 0;
  for (const entry of options.manifest.entries) {
    const staged = entry.rawDocuments.filter((raw) => raw.objectKey && raw.archiveStatus === 'staged');
    if (staged.length === 0) continue;
    result.pending += staged.length;
    if (options.dryRun || (options.limit !== undefined && processed >= options.limit)) continue;
    let changed = false;
    for (const raw of staged) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(join(stagingDir, raw.objectKey!)));
      } catch {
        result.missingStaging.push(raw.objectKey!);
        continue;
      }
      if (sha256Hex(bytes) !== raw.sha256) throw new ArchiveError('verification', `Staging ${raw.objectKey}: SHA-256 weicht vom Manifest ab`);
      const object: ArchivedObject = { role: raw.role, archiveRole: archiveRoleFor(raw.role), termId: entry.sourceIdentity.replace(/^term:/u, ''), sourceArea: entry.sourceArea, url: raw.url, finalUrl: raw.finalUrl, sha256: raw.sha256, byteLength: raw.byteLength, contentType: raw.contentType, retrievedAt: raw.retrievedAt, bucket: raw.bucket ?? options.transport.bucket, objectKey: raw.objectKey!, status: 'staged' };
      const outcome = await uploadVerified(options.transport, raw.objectKey!, bytes, { contentType: raw.contentType, metadata: objectMetadata(object), sha256: raw.sha256 });
      const envelope = new TextEncoder().encode(`${JSON.stringify(envelopeFor(object), null, 2)}\n`);
      await uploadVerified(options.transport, envelopeKey(raw.objectKey!), envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(envelope), role: 'envelope', 'term-id': object.termId }, sha256: sha256Hex(envelope), immutableEnvelope: true });
      if (outcome === 'verified') result.uploaded += 1;
      else result.alreadyPresent += 1;
      raw.archiveStatus = 'verified';
      changed = true;
      options.log?.(`${outcome === 'verified' ? 'hochgeladen' : 'bereits vorhanden'}: ${raw.objectKey}`);
    }
    if (changed) await writeManifestEntry(options.root, entry);
    processed += 1;
  }
  return result;
}
