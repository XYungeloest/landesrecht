/**
 * Staging und Sync der NSH-Rohquellen (Befehl `r2-sync`).
 *
 *   Staging   Für jede übernommene Norm jede Rohquelle aus dem Abrufcache (`.cache/juris-sh/<schlüssel>.bin`)
 *             nachgerechnet (SHA-256, Größe) nach `.cache/juris-sh-r2-staging/<objektschlüssel>` legen, daneben den
 *             Umschlag; im Manifest `bucket`, `objectKey`, `archiveStatus: 'staged'`. Kein Netz.
 *             Abbildungen (Rolle `figure`) liegen nicht selbst im Cache: Sie werden aus der gebundenen PDF-Ausgabe
 *             (`packageSha256`) an ihrer Lage (`packagePath`) neu entnommen und gegen SHA-256 und Größe des Manifests
 *             geprüft; Schlüssel `nsh/juris-sh/2023-12-01/assets/<sha256>.<endung>` (normübergreifend, inhaltsadressiert;
 *             dieselbe Abbildung in zwei Normen ist ein Objekt mit dem Umschlag der ersten Norm).
 *   Sync      Gestagte Objekte hochladen (`uploadVerified`: vorhanden und gleich → nichts; anders → harter Fehler;
 *             neu → Upload und Rücklesen), Umschlag unveränderlich, dann `archiveStatus: 'verified'`. Nach jeder
 *             Norm wird ihr Manifesteintrag geschrieben – ein Abbruch ist fortsetzbar.
 *
 * `uploaded`/`verified` werden nie zurückgestuft; eine vorhandene Staging-Datei mit anderem Inhalt wird nie
 * überschrieben (Befund). Das Staging liegt unter `.cache/` und damit nie in Git.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { uploadVerified } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { CACHE_DIR } from '../common/constants.ts';
import { DEFAULT_STAGING_DIR, R2_SOURCES_BUCKET } from '../common/environment.ts';
import { isImportedStatus, writeManifestEntry, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import { runPdfImages, type PdfImageWithBytes } from '../parse/pdf-figures.ts';
import { ArchiveError, envelopeBytes, envelopeFor, envelopeKey, KEY_PREFIX, objectMetadata, rawObjectKey, sha256Hex } from './archive.ts';

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
  /** Entnommene Bilder je PDF-Ausgabe (SHA-256) – eine Ausgabe wird je Lauf höchstens einmal gelesen. */
  const extracted = new Map<string, PdfImageWithBytes[] | undefined>();
  for (const entry of options.manifest.entries) {
    if (!isImportedStatus(entry.importStatus)) continue;
    result.entries += 1;
    let changed = false;
    for (const raw of entry.rawDocuments) {
      result.objects += 1;
      result.bytes += raw.byteLength;
      const key = rawObjectKey(entry, raw);
      if (raw.objectKey && raw.objectKey !== key) {
        result.conflicts.push(`${entry.sourceIdentity}: Manifest führt Objektschlüssel ${raw.objectKey}, berechnet ${key}`);
        continue;
      }
      if (raw.archiveStatus === 'uploaded' || raw.archiveStatus === 'verified') {
        result.alreadyArchived += 1;
        continue;
      }
      const cached = await readIfExists(join(cacheDir, `${cacheKey(raw.url)}.bin`));
      if (!cached) {
        result.missingCache.push(`${entry.sourceIdentity}: ${raw.url}`);
        continue;
      }
      let bytes = cached;
      if (raw.role === 'figure') {
        // Abbildung: aus der gebundenen PDF-Ausgabe neu entnommen (deterministisch, poppler) und nachgerechnet.
        const pdfSha = sha256Hex(cached);
        if (pdfSha !== raw.packageSha256) {
          result.conflicts.push(`${entry.sourceIdentity}: PDF-Ausgabe ${raw.url.slice(0, 80)} im Cache trägt nicht den gebundenen SHA-256 – Abbildung ${raw.packagePath ?? ''} wird nicht entnommen`);
          continue;
        }
        if (!extracted.has(pdfSha)) extracted.set(pdfSha, runPdfImages(cached));
        const image = extracted.get(pdfSha)?.find((candidate) => candidate.sourcePath === raw.packagePath);
        if (!image) {
          result.missingCache.push(`${entry.sourceIdentity}: Abbildung ${raw.packagePath ?? '(ohne Lage)'} in ${raw.url}`);
          continue;
        }
        bytes = image.bytes;
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

/**
 * Gestagte Objekte hochladen und prüfen. `readback` (Standard): je Objekt Upload und vollständige Rücklesung, höchstens
 * `concurrency` Normen gleichzeitig (höchstens 8). `etag`: Objekte parallel (höchstens 32), danach eine Nachprüfung
 * über das Listing (Größe und MD5-Etag gegen das Staging); erst dann gilt ein Objekt als `verified`. In beiden Modi
 * wird ein vorhandener Schlüssel nie überschrieben.
 */
export async function syncStaged(options: { root: string; manifest: ImportManifest; transport: R2Transport; stagingDir?: string; limit?: number; concurrency?: number; verification?: 'readback' | 'etag'; log?: (line: string) => void }): Promise<SyncResult> {
  if (options.verification === 'etag') return syncStagedEtag(options);
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

const md5Hex = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

async function syncStagedEtag(options: { root: string; manifest: ImportManifest; transport: R2Transport; stagingDir?: string; limit?: number; concurrency?: number; log?: (line: string) => void }): Promise<SyncResult> {
  if (!options.transport.list) throw new ArchiveError('guard', `Transport ${options.transport.name} bietet kein Listing; --verify etag braucht es`);
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
  const items = selected.flatMap((entry) => entry.rawDocuments.filter((raw) => raw.archiveStatus === 'staged' && raw.objectKey).map((raw) => ({ entry, raw })));
  const expected = new Map<string, { size: number; md5: string }>();
  const incomplete = new Set<ManifestEntry>();
  // Bestand einmal über das Listing statt je Objekt HEAD: vorhandene Schlüssel mit gleicher Größe und gleichem MD5
  // gelten als vorhanden; ein vorhandener Schlüssel mit anderem Inhalt ist ein harter Fehler (nie überschreiben).
  const before = new Map((await options.transport.list(KEY_PREFIX)).map((object) => [object.key, object]));
  const present = (key: string, bytes: Uint8Array): boolean => {
    const object = before.get(key);
    if (!object) return false;
    if (object.size !== bytes.byteLength || (object.md5 && object.md5 !== md5Hex(bytes))) throw new ArchiveError('conflict', `R2-Objekt ${key} existiert mit anderem Inhalt (Größe/MD5); Rohquellen werden nie überschrieben`);
    return true;
  };
  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < items.length) {
      const { entry, raw } = items[next++]!;
      try {
        const bytes = await readIfExists(join(stagingDir, raw.objectKey!));
        const envelope = await readIfExists(join(stagingDir, envelopeKey(raw.objectKey!)));
        if (!bytes || !envelope) {
          result.missingStaging.push(raw.objectKey!);
          incomplete.add(entry);
          continue;
        }
        if (sha256Hex(bytes) !== raw.sha256) throw new ArchiveError('verification', `Staging ${raw.objectKey}: SHA-256 weicht vom Manifest ab`);
        if (present(raw.objectKey!, bytes)) result.alreadyPresent += 1;
        else {
          // Zwischen Listing und Upload könnte ein anderer Lauf geschrieben haben: HEAD nur für fehlende Schlüssel.
          const head = await options.transport.head(raw.objectKey!);
          if (head) {
            if (head.sha256 && head.sha256 !== raw.sha256) throw new ArchiveError('conflict', `R2-Objekt ${raw.objectKey} existiert mit anderem SHA-256 (${head.sha256}); Rohquellen werden nie überschrieben`);
            result.alreadyPresent += 1;
          } else {
            await options.transport.put(raw.objectKey!, bytes, { contentType: raw.contentType, metadata: objectMetadata(envelopeFor(entry, raw, raw.objectKey!)) });
            result.uploaded += 1;
          }
        }
        // Umschläge sind unveränderlich: vorhanden → bleibt (die Nachprüfung vergleicht dann mit dem Staging).
        if (!present(envelopeKey(raw.objectKey!), envelope) && !(await options.transport.head(envelopeKey(raw.objectKey!)))) {
          await options.transport.put(envelopeKey(raw.objectKey!), envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(envelope), role: 'envelope', 'source-identity': entry.sourceIdentity } });
        }
        expected.set(raw.objectKey!, { size: bytes.byteLength, md5: md5Hex(bytes) });
        expected.set(envelopeKey(raw.objectKey!), { size: envelope.byteLength, md5: md5Hex(envelope) });
      } catch (error) {
        failure ??= error;
      }
    }
  };
  const concurrency = Math.min(32, Math.max(1, Math.floor(options.concurrency ?? 16)));
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (failure !== undefined) throw failure;

  // Nachprüfung über das Listing: Größe und MD5-Etag jedes erwarteten Schlüssels.
  const listed = new Map((await options.transport.list(KEY_PREFIX)).map((object) => [object.key, object]));
  const mismatches: string[] = [];
  for (const [key, want] of expected) {
    const got = listed.get(key);
    if (!got) mismatches.push(`${key}: fehlt im Listing`);
    else if (got.size !== want.size) mismatches.push(`${key}: ${got.size} statt ${want.size} Bytes`);
    else if (got.md5 && got.md5 !== want.md5) mismatches.push(`${key}: Etag ${got.md5} statt ${want.md5}`);
    else if (!got.md5) mismatches.push(`${key}: kein MD5-Etag im Listing`);
  }
  if (mismatches.length > 0) throw new ArchiveError('verification', `Nachprüfung über das Listing: ${mismatches.length} Abweichungen (${mismatches.slice(0, 5).join('; ')})`);
  for (const entry of selected) {
    for (const raw of entry.rawDocuments) if (raw.archiveStatus === 'staged' && raw.objectKey && expected.has(raw.objectKey)) raw.archiveStatus = 'verified';
    await writeManifestEntry(options.root, entry);
    if (!incomplete.has(entry)) result.entriesVerified += 1;
  }
  options.log?.(`Nachprüfung über das Listing: ${expected.size} Schlüssel mit Größe und MD5-Etag bestätigt`);
  return result;
}
