/**
 * Manifest des Sim-Quellenarchivs (`data/simulation/r2-archive.json`, versioniert): je Quelle des Inventars der
 * Objektschlüssel in R2 und der Archivstatus – `staged` (liegt nachgerechnet im Staging, kein Netz) oder
 * `verified` (in R2 vorhanden und nachgeprüft). Ein Status wird nie zurückgestuft; Schlüssel sind endgültig.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { SIMULATION_DATA_DIR } from '../common/paths.ts';
import { ArchiveError, isArchiveKey, R2_SOURCES_BUCKET } from './archive.ts';

export const R2_ARCHIVE_MANIFEST_SCHEMA = 'landesrecht-simulation-r2-archive/1' as const;
export const R2_ARCHIVE_MANIFEST_PATH = `${SIMULATION_DATA_DIR}/r2-archive.json`;

export const ARCHIVE_STATUSES = ['staged', 'verified'] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export interface R2ArchiveObject {
  sha256: string;
  jurisdiction: JurisdictionId;
  objectKey: string;
  envelopeKey: string;
  byteLength: number;
  mediaType: string;
  fileNames: string[];
  status: ArchiveStatus;
  /** Zeitpunkt der Nachprüfung in R2 (nur `verified`). */
  verifiedAt?: string;
  /** Prüfregime der Nachprüfung (nur `verified`). */
  verification?: 'readback' | 'etag';
}

export interface R2ArchiveManifest {
  schemaVersion: typeof R2_ARCHIVE_MANIFEST_SCHEMA;
  bucket: string;
  objects: R2ArchiveObject[];
}

export function emptyArchiveManifest(): R2ArchiveManifest {
  return { schemaVersion: R2_ARCHIVE_MANIFEST_SCHEMA, bucket: R2_SOURCES_BUCKET, objects: [] };
}

function fail(path: string, message: string): never {
  throw new ArchiveError('guard', `${R2_ARCHIVE_MANIFEST_PATH}: ${path} ${message}`);
}

/** Fail-closed: ein Manifest mit fremden Schlüsseln, unbekanntem Status oder falschem Bucket wird nicht verwendet. */
export function parseArchiveManifest(value: unknown): R2ArchiveManifest {
  if (!value || typeof value !== 'object') fail('', 'ist kein Objekt');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== R2_ARCHIVE_MANIFEST_SCHEMA) fail('schemaVersion', `muss ${R2_ARCHIVE_MANIFEST_SCHEMA} sein`);
  if (raw.bucket !== R2_SOURCES_BUCKET) fail('bucket', `muss ${R2_SOURCES_BUCKET} sein`);
  if (!Array.isArray(raw.objects)) fail('objects', 'muss ein Array sein');
  const seen = new Set<string>();
  const objects = raw.objects.map((entry, index) => {
    const path = `objects[${index}]`;
    if (!entry || typeof entry !== 'object') fail(path, 'ist kein Objekt');
    const object = entry as Record<string, unknown>;
    if (typeof object.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(object.sha256)) fail(`${path}.sha256`, 'ist kein SHA-256');
    if (!isJurisdictionId(object.jurisdiction)) fail(`${path}.jurisdiction`, 'ist keine Jurisdiktion');
    if (typeof object.objectKey !== 'string' || !isArchiveKey(object.objectKey) || object.objectKey.endsWith('.envelope.json')) fail(`${path}.objectKey`, 'liegt außerhalb des Sim-Archivs');
    if (object.envelopeKey !== `${object.objectKey}.envelope.json`) fail(`${path}.envelopeKey`, 'passt nicht zum Objektschlüssel');
    if (typeof object.byteLength !== 'number' || !Number.isInteger(object.byteLength) || object.byteLength < 0) fail(`${path}.byteLength`, 'ist keine Größe');
    if (typeof object.mediaType !== 'string' || object.mediaType === '') fail(`${path}.mediaType`, 'fehlt');
    if (!Array.isArray(object.fileNames) || object.fileNames.some((name) => typeof name !== 'string')) fail(`${path}.fileNames`, 'muss eine Liste von Dateinamen sein');
    if (!(ARCHIVE_STATUSES as readonly unknown[]).includes(object.status)) fail(`${path}.status`, `muss ${ARCHIVE_STATUSES.join('|')} sein`);
    if (seen.has(object.sha256)) fail(`${path}.sha256`, 'ist doppelt');
    seen.add(object.sha256);
    const result: R2ArchiveObject = {
      sha256: object.sha256,
      jurisdiction: object.jurisdiction,
      objectKey: object.objectKey,
      envelopeKey: object.envelopeKey,
      byteLength: object.byteLength,
      mediaType: object.mediaType,
      fileNames: [...(object.fileNames as string[])],
      status: object.status as ArchiveStatus,
    };
    if (typeof object.verifiedAt === 'string') result.verifiedAt = object.verifiedAt;
    if (object.verification === 'readback' || object.verification === 'etag') result.verification = object.verification;
    return result;
  });
  return { schemaVersion: R2_ARCHIVE_MANIFEST_SCHEMA, bucket: R2_SOURCES_BUCKET, objects };
}

export async function readArchiveManifest(root: string): Promise<R2ArchiveManifest> {
  const stored = await readJsonFile<unknown>(join(root, R2_ARCHIVE_MANIFEST_PATH));
  return stored === undefined ? emptyArchiveManifest() : parseArchiveManifest(stored);
}

/** Schreibt das Manifest deterministisch (nach Objektschlüssel sortiert, atomar); unverändert = nicht neu geschrieben. */
export async function writeArchiveManifest(root: string, manifest: R2ArchiveManifest): Promise<boolean> {
  const objects = [...manifest.objects].sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  return writeJsonAtomic(join(root, R2_ARCHIVE_MANIFEST_PATH), { schemaVersion: R2_ARCHIVE_MANIFEST_SCHEMA, bucket: R2_SOURCES_BUCKET, objects });
}
