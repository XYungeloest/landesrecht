/**
 * Staging und Sync des Sim-Quellenarchivs (Befehl `r2-sync`), nach dem Muster von `juris-sh/src/r2/sync.ts`.
 *
 *   Staging   Jede Quelle des Inventars (`data/simulation/source-inventory.json`) aus der Cachekopie
 *             `.cache/simulation/archive/<sha256>.<ext>` nachgerechnet (SHA-256, Größe) nach
 *             `.cache/simulation-r2-staging/<objektschlüssel>` legen, daneben den Umschlag; im Manifest
 *             `data/simulation/r2-archive.json` Status `staged`. Kein Netz.
 *   Sync      Gestagte Objekte hochladen: `readback` (Standard) je Objekt Vorabprüfung, Upload, Byte-Rücklesung
 *             mit SHA-256 (`uploadVerified`); `etag` Objekte parallel, danach Nachprüfung über das Listing des
 *             Jurisdiktionspräfixes (Größe + MD5-Etag), erst dann `verified`. Umschläge sind unveränderlich.
 *
 * Nie überschreiben: ein vorhandener Schlüssel mit anderem Inhalt ist ein harter Fehler (Konflikt), im Staging
 * wie in R2. `verified` wird nie zurückgestuft. Das Staging liegt unter `.cache/` und damit nie in Git.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { uploadVerified } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { CACHE_ARCHIVE_DIR } from '../common/paths.ts';
import type { InventorySource, SourceInventory } from '../inventory/scan.ts';
import { ArchiveError, archiveExtension, envelopeBytes, envelopeCoreProblems, envelopeFor, envelopeKey, keyPrefixFor, md5Hex, objectKeyForSource, objectMetadata, R2_SOURCES_BUCKET, sha256Hex } from './archive.ts';
import { writeArchiveManifest, type R2ArchiveManifest, type R2ArchiveObject } from './manifest.ts';

/** Staging der Originaldateien vor dem Upload – außerhalb von Git. */
export const DEFAULT_STAGING_DIR = join('.cache', 'simulation-r2-staging');

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

export interface StageResult {
  sources: number;
  bytes: number;
  staged: number;
  alreadyStaged: number;
  alreadyArchived: number;
  missingCache: string[];
  conflicts: string[];
  /** Objekte je Jurisdiktion (alle Quellen des Inventars). */
  byJurisdiction: Record<string, number>;
}

/** Manifesteintrag einer Quelle (Status bleibt `verified`, wenn bereits nachgeprüft). */
export function manifestObjectFor(source: InventorySource, objectKey: string, previous: R2ArchiveObject | undefined): R2ArchiveObject {
  const object: R2ArchiveObject = {
    sha256: source.sha256,
    jurisdiction: source.jurisdictionCandidate,
    objectKey,
    envelopeKey: envelopeKey(objectKey),
    byteLength: source.byteLength,
    mediaType: source.mediaType,
    fileNames: [...new Set(source.paths.map((path) => path.split('/').pop() ?? path))],
    status: previous?.status === 'verified' ? 'verified' : 'staged',
  };
  if (previous?.status === 'verified') {
    if (previous.verifiedAt) object.verifiedAt = previous.verifiedAt;
    if (previous.verification) object.verification = previous.verification;
  }
  return object;
}

export async function stageSources(options: { root: string; inventory: SourceInventory; manifest: R2ArchiveManifest; write: boolean; stagingDir?: string; cacheDir?: string; log?: (line: string) => void }): Promise<StageResult> {
  const stagingDir = assertStagingDir(options.root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const cacheDir = resolve(options.root, options.cacheDir ?? CACHE_ARCHIVE_DIR);
  const result: StageResult = { sources: 0, bytes: 0, staged: 0, alreadyStaged: 0, alreadyArchived: 0, missingCache: [], conflicts: [], byJurisdiction: {} };
  const previousBySha = new Map(options.manifest.objects.map((object) => [object.sha256, object]));
  const objects: R2ArchiveObject[] = [];
  for (const source of [...options.inventory.sources].sort((left, right) => left.sha256.localeCompare(right.sha256))) {
    result.sources += 1;
    result.bytes += source.byteLength;
    result.byJurisdiction[source.jurisdictionCandidate] = (result.byJurisdiction[source.jurisdictionCandidate] ?? 0) + 1;
    const key = objectKeyForSource(source);
    const previous = previousBySha.get(source.sha256);
    if (previous && previous.objectKey !== key) {
      result.conflicts.push(`${source.sha256.slice(0, 12)}: Manifest führt Objektschlüssel ${previous.objectKey}, berechnet ${key}`);
      objects.push(previous);
      continue;
    }
    const cached = await readIfExists(join(cacheDir, `${source.sha256}.${archiveExtension(source)}`));
    if (!cached) {
      result.missingCache.push(`${source.paths[0] ?? source.sha256}: keine Cachekopie ${CACHE_ARCHIVE_DIR}/${source.sha256}.${archiveExtension(source)} (npm run import:simulation:inventory)`);
      if (previous) objects.push(previous);
      continue;
    }
    if (cached.byteLength !== source.byteLength || sha256Hex(cached) !== source.sha256) {
      result.conflicts.push(`${source.paths[0] ?? source.sha256}: Cachekopie weicht vom Inventar ab (Größe/SHA-256)`);
      if (previous) objects.push(previous);
      continue;
    }
    const envelope = envelopeFor(source, options.inventory, key, R2_SOURCES_BUCKET);
    const target = join(stagingDir, key);
    const existing = await readIfExists(target);
    if (existing && sha256Hex(existing) !== source.sha256) {
      result.conflicts.push(`${key}: Staging-Datei mit anderem Inhalt vorhanden (wird nicht überschrieben)`);
      if (previous) objects.push(previous);
      continue;
    }
    const existingEnvelope = await readIfExists(join(stagingDir, envelopeKey(key)));
    if (existingEnvelope) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(existingEnvelope));
      } catch {
        parsed = undefined;
      }
      const problems = envelopeCoreProblems(parsed, envelope);
      if (problems.length > 0) {
        result.conflicts.push(`${envelopeKey(key)}: gestagter Umschlag weicht in Kernfeldern ab (${problems.join('; ')})`);
        if (previous) objects.push(previous);
        continue;
      }
    }
    if (previous?.status === 'verified') result.alreadyArchived += 1;
    else if (existing) result.alreadyStaged += 1;
    else {
      result.staged += 1;
      if (options.write) {
        await writeFileAtomic(target, cached);
        if (!existingEnvelope) await writeFileAtomic(join(stagingDir, envelopeKey(key)), envelopeBytes(envelope));
      }
    }
    objects.push(manifestObjectFor(source, key, previous));
  }
  options.manifest.objects = objects;
  if (options.write) await writeArchiveManifest(options.root, options.manifest);
  options.log?.(`Staging: ${result.sources} Quellen (${Math.round(result.bytes / 1024 / 1024)} MB) · neu ${result.staged} · vorhanden ${result.alreadyStaged} · archiviert ${result.alreadyArchived} · ohne Cache ${result.missingCache.length} · Konflikte ${result.conflicts.length}`);
  return result;
}

export interface SyncResult {
  pending: number;
  uploaded: number;
  alreadyPresent: number;
  verified: number;
  missingStaging: string[];
  verification: 'readback' | 'etag';
}

export interface SyncOptions {
  root: string;
  manifest: R2ArchiveManifest;
  transport: R2Transport;
  stagingDir?: string;
  limit?: number;
  concurrency?: number;
  verification?: 'readback' | 'etag';
  now?: () => Date;
  log?: (line: string) => void;
}

function selectStaged(manifest: R2ArchiveManifest, limit: number | undefined): { selected: R2ArchiveObject[]; pending: number } {
  const staged = manifest.objects.filter((object) => object.status === 'staged');
  return { selected: limit === undefined ? staged : staged.slice(0, Math.max(0, limit)), pending: staged.length };
}

async function loadStaged(stagingDir: string, object: R2ArchiveObject): Promise<{ bytes: Uint8Array; envelope: Uint8Array } | undefined> {
  const bytes = await readIfExists(join(stagingDir, object.objectKey));
  const envelope = await readIfExists(join(stagingDir, object.envelopeKey));
  if (!bytes || !envelope) return undefined;
  if (bytes.byteLength !== object.byteLength || sha256Hex(bytes) !== object.sha256) throw new ArchiveError('verification', `Staging ${object.objectKey}: SHA-256 oder Größe weicht vom Manifest ab`);
  return { bytes, envelope };
}

function envelopeOf(envelope: Uint8Array): Parameters<typeof objectMetadata>[0] {
  return JSON.parse(new TextDecoder().decode(envelope)) as Parameters<typeof objectMetadata>[0];
}

/**
 * Gestagte Objekte hochladen und prüfen. `readback` (Standard): je Objekt Upload und vollständige Rücklesung,
 * höchstens `concurrency` Objekte gleichzeitig (höchstens 8). `etag`: Objekte parallel (höchstens 32), danach eine
 * Nachprüfung über das Listing je Jurisdiktionspräfix (Größe und MD5-Etag gegen das Staging). In beiden Modi wird
 * ein vorhandener Schlüssel nie überschrieben; nach jedem geprüften Objekt (readback) bzw. nach der Nachprüfung
 * (etag) wird das Manifest geschrieben – ein Abbruch ist fortsetzbar.
 */
export async function syncStaged(options: SyncOptions): Promise<SyncResult> {
  if (options.verification === 'etag') return syncStagedEtag(options);
  const stagingDir = assertStagingDir(options.root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const now = options.now ?? (() => new Date());
  const { selected, pending } = selectStaged(options.manifest, options.limit);
  const result: SyncResult = { pending, uploaded: 0, alreadyPresent: 0, verified: 0, missingStaging: [], verification: 'readback' };
  const concurrency = Math.min(8, Math.max(1, Math.floor(options.concurrency ?? 4)));
  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < selected.length) {
      const object = selected[next++]!;
      try {
        const staged = await loadStaged(stagingDir, object);
        if (!staged) {
          result.missingStaging.push(object.objectKey);
          continue;
        }
        const envelope = envelopeOf(staged.envelope);
        const outcome = await uploadVerified(options.transport, object.objectKey, staged.bytes, { contentType: object.mediaType, metadata: objectMetadata(envelope), sha256: object.sha256 });
        await uploadVerified(options.transport, object.envelopeKey, staged.envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(staged.envelope), role: 'envelope', jurisdiction: object.jurisdiction }, sha256: sha256Hex(staged.envelope), immutableEnvelope: true });
        if (outcome === 'verified') result.uploaded += 1;
        else result.alreadyPresent += 1;
        object.status = 'verified';
        object.verifiedAt = now().toISOString();
        object.verification = 'readback';
        result.verified += 1;
        await writeArchiveManifest(options.root, options.manifest);
        options.log?.(`${object.objectKey}: ${outcome === 'verified' ? 'hochgeladen und rückgelesen' : 'bereits vorhanden (gleicher Inhalt)'}`);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  if (failure !== undefined) throw failure;
  return result;
}

async function syncStagedEtag(options: SyncOptions): Promise<SyncResult> {
  if (!options.transport.list) throw new ArchiveError('guard', `Transport ${options.transport.name} bietet kein Listing; --verify etag braucht es`);
  const list = options.transport.list.bind(options.transport);
  const stagingDir = assertStagingDir(options.root, options.stagingDir ?? DEFAULT_STAGING_DIR);
  const now = options.now ?? (() => new Date());
  const { selected, pending } = selectStaged(options.manifest, options.limit);
  const result: SyncResult = { pending, uploaded: 0, alreadyPresent: 0, verified: 0, missingStaging: [], verification: 'etag' };
  const prefixes = [...new Set(selected.map((object) => keyPrefixFor(object.jurisdiction)))].sort();
  const listAll = async (): Promise<Map<string, { size: number; md5?: string }>> => {
    const listed = new Map<string, { size: number; md5?: string }>();
    for (const prefix of prefixes) for (const object of await list(prefix)) listed.set(object.key, { size: object.size, ...(object.md5 ? { md5: object.md5 } : {}) });
    return listed;
  };
  // Bestand einmal über das Listing statt je Objekt HEAD: vorhandene Schlüssel mit gleicher Größe und gleichem MD5
  // gelten als vorhanden; ein vorhandener Schlüssel mit anderem Inhalt ist ein harter Fehler (nie überschreiben).
  const before = await listAll();
  const present = (key: string, bytes: Uint8Array): boolean => {
    const object = before.get(key);
    if (!object) return false;
    if (object.size !== bytes.byteLength || (object.md5 && object.md5 !== md5Hex(bytes))) throw new ArchiveError('conflict', `R2-Objekt ${key} existiert mit anderem Inhalt (Größe/MD5); Quellen werden nie überschrieben`);
    return true;
  };
  const expected = new Map<string, { size: number; md5: string }>();
  const done: R2ArchiveObject[] = [];
  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < selected.length) {
      const object = selected[next++]!;
      try {
        const staged = await loadStaged(stagingDir, object);
        if (!staged) {
          result.missingStaging.push(object.objectKey);
          continue;
        }
        const envelope = envelopeOf(staged.envelope);
        if (present(object.objectKey, staged.bytes)) result.alreadyPresent += 1;
        else {
          // Zwischen Listing und Upload könnte ein anderer Lauf geschrieben haben: HEAD nur für fehlende Schlüssel.
          const head = await options.transport.head(object.objectKey);
          if (head) {
            if (head.sha256 && head.sha256 !== object.sha256) throw new ArchiveError('conflict', `R2-Objekt ${object.objectKey} existiert mit anderem SHA-256 (${head.sha256}); Quellen werden nie überschrieben`);
            result.alreadyPresent += 1;
          } else {
            await options.transport.put(object.objectKey, staged.bytes, { contentType: object.mediaType, metadata: objectMetadata(envelope) });
            result.uploaded += 1;
          }
        }
        // Umschläge sind unveränderlich: vorhanden → bleibt (die Nachprüfung vergleicht dann mit dem Staging).
        if (!present(object.envelopeKey, staged.envelope) && !(await options.transport.head(object.envelopeKey))) {
          await options.transport.put(object.envelopeKey, staged.envelope, { contentType: 'application/json', metadata: { sha256: sha256Hex(staged.envelope), role: 'envelope', jurisdiction: object.jurisdiction } });
        }
        expected.set(object.objectKey, { size: staged.bytes.byteLength, md5: md5Hex(staged.bytes) });
        expected.set(object.envelopeKey, { size: staged.envelope.byteLength, md5: md5Hex(staged.envelope) });
        done.push(object);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  const concurrency = Math.min(32, Math.max(1, Math.floor(options.concurrency ?? 16)));
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  if (failure !== undefined) throw failure;

  // Nachprüfung über das Listing: Größe und MD5-Etag jedes erwarteten Schlüssels.
  const listed = await listAll();
  const mismatches: string[] = [];
  for (const [key, want] of expected) {
    const got = listed.get(key);
    if (!got) mismatches.push(`${key}: fehlt im Listing`);
    else if (got.size !== want.size) mismatches.push(`${key}: ${got.size} statt ${want.size} Bytes`);
    else if (got.md5 && got.md5 !== want.md5) mismatches.push(`${key}: Etag ${got.md5} statt ${want.md5}`);
    else if (!got.md5) mismatches.push(`${key}: kein MD5-Etag im Listing`);
  }
  if (mismatches.length > 0) throw new ArchiveError('verification', `Nachprüfung über das Listing: ${mismatches.length} Abweichungen (${mismatches.slice(0, 5).join('; ')})`);
  const verifiedAt = now().toISOString();
  for (const object of done) {
    object.status = 'verified';
    object.verifiedAt = verifiedAt;
    object.verification = 'etag';
    result.verified += 1;
  }
  await writeArchiveManifest(options.root, options.manifest);
  options.log?.(`Nachprüfung über das Listing: ${expected.size} Schlüssel mit Größe und MD5-Etag bestätigt`);
  return result;
}

/** Objekte je Jurisdiktion und Status (für Bericht und Vollständigkeitsprüfung). */
export function summarizeManifest(manifest: R2ArchiveManifest): Record<JurisdictionId | string, { staged: number; verified: number }> {
  const summary: Record<string, { staged: number; verified: number }> = {};
  for (const object of manifest.objects) {
    const entry = summary[object.jurisdiction] ?? { staged: 0, verified: 0 };
    entry[object.status] += 1;
    summary[object.jurisdiction] = entry;
  }
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}
