/**
 * Staging und Sync der NSH-Rohquellen (Befehl `r2-sync`).
 *
 *   Staging   Für jede übernommene Norm jede Rohquelle aus dem Abrufcache (`.cache/juris-sh/<schlüssel>.bin`)
 *             nachgerechnet (SHA-256, Größe) nach `.cache/juris-sh-r2-staging/<objektschlüssel>` legen, daneben den
 *             Umschlag; im Manifest `bucket`, `objectKey`, `archiveStatus: 'staged'`. Kein Netz.
 *   Sync      Gestagte Objekte hochladen (`uploadVerified`: vorhanden und gleich → nichts; anders → harter Fehler;
 *             neu → Upload und Rücklesen), Umschlag unveränderlich, dann `archiveStatus: 'verified'`. Nach jeder
 *             Norm wird ihr Manifesteintrag geschrieben – ein Abbruch ist fortsetzbar.
 *
 * `uploaded`/`verified` werden nie zurückgestuft; eine vorhandene Staging-Datei mit anderem Inhalt wird nie
 * überschrieben (Befund). Das Staging liegt unter `.cache/` und damit nie in Git.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { uploadVerified } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { CACHE_DIR } from '../common/constants.ts';
import { DEFAULT_STAGING_DIR, R2_SOURCES_BUCKET } from '../common/environment.ts';
import { isImportedStatus, writeManifestEntry, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import { ArchiveError, envelopeBytes, envelopeFor, envelopeKey, objectMetadata, r2ObjectKey, sha256Hex } from './archive.ts';

export interface StageResult {
  entries: number;
  objects: number;
  bytes: number;
  staged: number;
  alreadyStaged: number;
  alreadyArchived: number;
  missingCache: string[];
  conflicts: string[];
  entriesUpdated: number;
}

/** Staging außerhalb versionierter Pfade: `.cache/…` im Repository oder ganz außerhalb. */
export function assertStagingDir(root: string, stagingDir: string): string {
  const absolute = resolve(root, stagingDir);
  const inside = relative(resolve(root), absolute);
  const insideRepository = inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
  if (insideRepository && !inside.startsWith('.cache/')) throw new ArchiveError('guard', `R2-Staging ${absolute} liegt in einem versionierten Repository-Pfad; erlaubt sind .cache/… oder Pfade außerhalb`);
  return absolute;
}

async function readIfExists(path: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function stageRawSources(options: { root: string; manifest: ImportManifest; write: boolean; stagingDir?: string; cacheDir?: string; log?: (line: string) => void }): Promise<StageResult> {
  const stagingDir = assertStagingDir(options.root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const cacheDir = resolve(options.root, options.cacheDir ?? CACHE_DIR);
  const result: StageResult = { entries: 0, objects: 0, bytes: 0, staged: 0, alreadyStaged: 0, alreadyArchived: 0, missingCache: [], conflicts: [], entriesUpdated: 0 };
  for (const entry of options.manifest.entries) {
    if (!isImportedStatus(entry.importStatus)) continue;
    result.entries += 1;
    let changed = false;
    for (const raw of entry.rawDocuments) {
      result.objects += 1;
      result.bytes += raw.byteLength;
      const key = r2ObjectKey({ sourceArea: entry.sourceArea, sourceIdentity: entry.sourceIdentity, role: raw.role, sha256: raw.sha256, contentType: raw.contentType });
      if (raw.objectKey && raw.objectKey !== key) {
        result.conflicts.push(`${entry.sourceIdentity}: Manifest führt Objektschlüssel ${raw.objectKey}, berechnet ${key}`);
        continue;
      }
      if (raw.archiveStatus === 'uploaded' || raw.archiveStatus === 'verified') {
        result.alreadyArchived += 1;
        continue;
      }
      const bytes = await readIfExists(join(cacheDir, `${cacheKey(raw.url)}.bin`));
      if (!bytes) {
        result.missingCache.push(`${entry.sourceIdentity}: ${raw.url}`);
        continue;
      }
      if (bytes.byteLength !== raw.byteLength || sha256Hex(bytes) !== raw.sha256) {
        result.conflicts.push(`${entry.sourceIdentity}: Cache weicht vom Manifest ab (${raw.url.slice(0, 80)})`);
        continue;
      }
      const target = join(stagingDir, key);
      const envelope = envelopeBytes(envelopeFor(entry, raw, key, raw.bucket ?? R2_SOURCES_BUCKET));
      const existing = await readIfExists(target);
      if (existing && sha256Hex(existing) !== raw.sha256) {
        result.conflicts.push(`${key}: Staging-Datei mit anderem Inhalt vorhanden (wird nicht überschrieben)`);
        continue;
      }
      if (existing) result.alreadyStaged += 1;
      else {
        result.staged += 1;
        if (options.write) {
          await writeFileAtomic(target, bytes);
          await writeFileAtomic(join(stagingDir, envelopeKey(key)), envelope);
        }
      }
      if (raw.archiveStatus !== 'staged' || raw.objectKey !== key || raw.bucket !== R2_SOURCES_BUCKET) {
        raw.bucket = R2_SOURCES_BUCKET;
        raw.objectKey = key;
        raw.archiveStatus = 'staged';
        changed = true;
      }
    }
    if (changed) {
      result.entriesUpdated += 1;
      if (options.write) await writeManifestEntry(options.root, entry);
    }
  }
  options.log?.(`Staging: ${result.entries} Normen · ${result.objects} Objekte (${Math.round(result.bytes / 1024 / 1024)} MB) · neu ${result.staged} · vorhanden ${result.alreadyStaged} · archiviert ${result.alreadyArchived} · ohne Cache ${result.missingCache.length} · Konflikte ${result.conflicts.length}`);
  return result;
}

export interface SyncResult {
  pending: number;
  uploaded: number;
  alreadyPresent: number;
  entriesVerified: number;
  missingStaging: string[];
}

/** Gestagte Objekte hochladen und prüfen; höchstens `concurrency` Normen gleichzeitig (Standard 4, höchstens 8). */
export async function syncStaged(options: { root: string; manifest: ImportManifest; transport: R2Transport; stagingDir?: string; limit?: number; concurrency?: number; log?: (line: string) => void }): Promise<SyncResult> {
  const stagingDir = assertStagingDir(options.root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const result: SyncResult = { pending: 0, uploaded: 0, alreadyPresent: 0, entriesVerified: 0, missingStaging: [] };
  const selected: ManifestEntry[] = [];
  for (const entry of options.manifest.entries) {
    if (!isImportedStatus(entry.importStatus)) continue;
    const staged = entry.rawDocuments.filter((raw) => raw.archiveStatus === 'staged' && raw.objectKey);
    if (staged.length === 0) continue;
    result.pending += staged.length;
    if (options.limit === undefined || selected.length < options.limit) selected.push(entry);
  }
  const concurrency = Math.min(8, Math.max(1, Math.floor(options.concurrency ?? 4)));
  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < selected.length) {
      const entry = selected[next++]!;
      try {
        let complete = true;
        for (const raw of entry.rawDocuments.filter((candidate) => candidate.archiveStatus === 'staged' && candidate.objectKey)) {
          const bytes = await readIfExists(join(stagingDir, raw.objectKey!));
          const envelope = await readIfExists(join(stagingDir, envelopeKey(raw.objectKey!)));
          if (!bytes || !envelope) {
            result.missingStaging.push(raw.objectKey!);
            complete = false;
            continue;
          }
          if (sha256Hex(bytes) !== raw.sha256) throw new ArchiveError('verification', `Staging ${raw.objectKey}: SHA-256 weicht vom Manifest ab`);
          const outcome = await uploadVerified(options.transport, raw.objectKey!, bytes, { contentType: raw.contentType, metadata: objectMetadata(envelopeFor(entry, raw, raw.objectKey!)), sha256: raw.sha256 });
          await uploadVerified(options.transport, envelopeKey(raw.objectKey!), envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(envelope), role: 'envelope', 'source-identity': entry.sourceIdentity }, sha256: sha256Hex(envelope), immutableEnvelope: true });
          if (outcome === 'verified') result.uploaded += 1;
          else result.alreadyPresent += 1;
          raw.archiveStatus = 'verified';
        }
        await writeManifestEntry(options.root, entry);
        if (complete) result.entriesVerified += 1;
        options.log?.(`${entry.sourceIdentity}: ${complete ? 'geprüft' : 'unvollständig (Staging fehlt)'}`);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  if (failure !== undefined) throw failure;
  return result;
}
