/**
 * Staging der BayWü-Rohquellen vor dem R2-Upload.
 *
 * Für jede **übernommene** Norm (Manifest `imported` oder `imported-with-warnings`) wird jede Rohquelle aus dem
 * Abrufcache (`.cache/bayernrecht/<sha256(url)[0..40]>.bin`) unverändert nach `.cache/bayernrecht-r2-staging/<objektschlüssel>`
 * gelegt, daneben der Umschlag. Das Staging liegt unter `.cache/` und damit nie in Git.
 *
 * Die Bytes werden nachgerechnet, nicht geglaubt: Nur was exakt den SHA-256 und die Größe des Manifests trägt,
 * wird gestagt. Eine vorhandene Staging-Datei mit anderem Inhalt wird nie überschrieben (Befund), und ein
 * vorhandener Objektschlüssel im Manifest, der vom berechneten abweicht, ebenfalls nicht.
 *
 * Abbildungen (Rolle `figure`) liegen nicht selbst im Cache, sondern im gecachten Exportpaket: Das Paket muss den im
 * Manifest gebundenen SHA-256 (`packageSha256`) tragen, die Datei am Pfad `packagePath` den SHA-256 und die Größe
 * der Abbildung. Der Schlüssel ist inhaltsadressiert (`assets/<sha256>.<ext>`); dieselbe Abbildung zweimal in
 * einem Eintrag gibt es nicht (der Bulk bindet je SHA-256 einmal), in zwei Normen wäre sie `duplicate-key`.
 *
 * Im Manifest erhält die Rohquelle `bucket`, `objectKey` und `archiveStatus: 'staged'` – nur, wenn sie noch keinen
 * Archivstatus trägt; `uploaded` und `verified` werden nie zurückgestuft. Die Normdateien unter
 * `content/norms/baywue/` berührt das Staging nicht: Die Archivierung ist eine Eigenschaft des Manifests.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { R2_SOURCES_BUCKET } from '../common/environment.ts';
import { isImportedStatus, writeManifestEntry, type ImportManifest, type ManifestEntry, type ManifestRawDocument } from '../common/manifest.ts';
import { cacheEntryPaths } from '../fetch/cache.ts';
import { readPackageFile } from '../parse/package.ts';
import { ArchiveError, envelopeBytes, envelopeCoreProblems, envelopeFor, envelopeKey, r2ObjectKey, sha256Hex } from './archive.ts';

export interface ArchiveCandidate {
  entry: ManifestEntry;
  raw: ManifestRawDocument;
  objectKey: string;
  envelopeKey: string;
}

/** Gelesener Umschlag als JSON; `undefined`, wenn er keins ist (dann gilt er als abweichend). */
export function parseEnvelope(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

/** Rohquellen der übernommenen Normen mit ihrem berechneten Objektschlüssel (Manifestreihenfolge). */
export function archiveCandidates(manifest: Pick<ImportManifest, 'entries'>): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];
  for (const entry of manifest.entries) {
    if (!isImportedStatus(entry.importStatus)) continue;
    for (const raw of entry.rawDocuments) {
      const objectKey = r2ObjectKey({ sourceArea: entry.sourceArea, sourceIdentity: entry.sourceIdentity, sha256: raw.sha256, role: raw.role, contentType: raw.contentType });
      candidates.push({ entry, raw, objectKey, envelopeKey: envelopeKey(objectKey) });
    }
  }
  return candidates;
}

/**
 * Das Staging muss außerhalb von Git liegen: unter `.cache/` des Repositorys oder ganz außerhalb davon.
 * Ein versionierter Pfad ist ein harter Fehler (Rohquellen des Bulk werden nie versioniert).
 */
export function assertStagingDir(root: string, stagingDir: string): string {
  const absolute = resolve(root, stagingDir);
  const inside = relative(resolve(root), absolute);
  const insideRepository = inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
  if (insideRepository && !(inside.startsWith('.cache/') || inside.startsWith('.cache\\'))) {
    throw new ArchiveError('guard', `R2-Staging ${absolute} liegt in einem versionierten Repository-Pfad; erlaubt sind .cache/… oder Pfade außerhalb des Repositorys`);
  }
  return absolute;
}

export async function readIfExists(path: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => left.byteLength === right.byteLength && Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(Buffer.from(right.buffer, right.byteOffset, right.byteLength));

export type StageProblemCode = 'key-mismatch' | 'bucket-mismatch' | 'cache-missing' | 'cache-mismatch' | 'staging-conflict' | 'envelope-changed' | 'duplicate-key';

export interface StageProblem {
  code: StageProblemCode;
  sourceIdentity: string;
  objectKey: string;
  message: string;
}

export interface StageResult {
  candidates: number;
  bytes: number;
  /** Rohobjekte, die in diesem Lauf ins Staging geschrieben wurden (Dry-run: geschrieben würden). */
  written: number;
  /** Rohobjekte, die bereits bytegleich im Staging lagen. */
  alreadyStaged: number;
  envelopesWritten: number;
  /** Vorhandene Umschläge mit gleichen Kernfeldern, die trotz geänderter beschreibender Felder bleiben. */
  envelopesKept: number;
  /** Manifesteinträge, die in diesem Lauf `staged` erhielten (Dry-run: erhielten). */
  manifestEntriesUpdated: number;
  /** Rohquellen, die schon `uploaded` oder `verified` sind (bleiben unverändert). */
  alreadyArchived: number;
  problems: StageProblem[];
}

export interface StageOptions {
  root: string;
  manifest: ImportManifest;
  cacheDir: string;
  stagingDir: string;
  write: boolean;
  bucket?: string;
  log?: (line: string) => void;
}

export async function stageRawSources(options: StageOptions): Promise<StageResult> {
  const bucket = options.bucket ?? R2_SOURCES_BUCKET;
  const stagingDir = assertStagingDir(options.root, options.stagingDir);
  const result: StageResult = { candidates: 0, bytes: 0, written: 0, alreadyStaged: 0, envelopesWritten: 0, envelopesKept: 0, manifestEntriesUpdated: 0, alreadyArchived: 0, problems: [] };
  const candidates = archiveCandidates(options.manifest);
  result.candidates = candidates.length;
  const seen = new Set<string>();
  const dirty = new Set<ManifestEntry>();

  for (const candidate of candidates) {
    const { entry, raw, objectKey } = candidate;
    const problem = (code: StageProblemCode, message: string): void => {
      result.problems.push({ code, sourceIdentity: entry.sourceIdentity, objectKey, message });
    };
    result.bytes += raw.byteLength;
    if (seen.has(objectKey)) {
      problem('duplicate-key', `Objektschlüssel ${objectKey} doppelt vergeben`);
      continue;
    }
    seen.add(objectKey);
    if (raw.objectKey !== undefined && raw.objectKey !== objectKey) {
      problem('key-mismatch', `Manifest führt ${raw.objectKey}, berechnet ist ${objectKey} – nichts wird umgeschrieben`);
      continue;
    }
    if (raw.bucket !== undefined && raw.bucket !== bucket) {
      problem('bucket-mismatch', `Manifest führt Bucket ${raw.bucket}, erwartet ${bucket}`);
      continue;
    }

    // Rohobjekt: vorhandenes Staging prüfen, sonst aus dem Cache holen und nachrechnen.
    const stagedPath = join(stagingDir, objectKey);
    const staged = await readIfExists(stagedPath);
    if (staged) {
      if (staged.byteLength !== raw.byteLength || sha256Hex(staged) !== raw.sha256) {
        problem('staging-conflict', `Staging-Datei weicht vom Manifest ab (Größe ${staged.byteLength} statt ${raw.byteLength} oder SHA-256) – wird nie überschrieben`);
        continue;
      }
      result.alreadyStaged += 1;
    } else {
      const cachedPackage = await readIfExists(cacheEntryPaths(options.cacheDir, raw.url).bytes);
      if (!cachedPackage) {
        problem('cache-missing', `Rohpaket ${raw.url} nicht im Cache ${options.cacheDir}`);
        continue;
      }
      let cached = cachedPackage;
      if (raw.role === 'figure') {
        if (sha256Hex(cachedPackage) !== raw.packageSha256) {
          problem('cache-mismatch', `Paket ${raw.url} im Cache trägt nicht den gebundenen SHA-256 ${raw.packageSha256 ?? '(fehlt)'} – die Abbildung wird nicht daraus entnommen`);
          continue;
        }
        const file = raw.packagePath ? readPackageFile(cachedPackage, raw.packagePath) : undefined;
        if (!file) {
          problem('cache-missing', `Abbildung ${raw.packagePath ?? '(ohne Pfad)'} fehlt im Paket ${raw.url}`);
          continue;
        }
        cached = file;
      }
      if (cached.byteLength !== raw.byteLength || sha256Hex(cached) !== raw.sha256) {
        problem('cache-mismatch', `Cachebytes für ${raw.role === 'figure' ? `${raw.packagePath} in ` : ''}${raw.url} passen nicht zum Manifest (Größe ${cached.byteLength} statt ${raw.byteLength} oder SHA-256)`);
        continue;
      }
      if (options.write) await writeFileAtomic(stagedPath, cached);
      result.written += 1;
    }

    // Umschlag: deterministisch aus dem Manifest; nach dem ersten Schreiben ändert er sich nicht mehr. Ein
    // vorhandener Umschlag mit denselben Kernfeldern (Schlüssel, Prüfsumme, Größe, Adressen, Abrufzeit, Identität)
    // bleibt stehen, auch wenn ein beschreibendes Feld (Quelltitel nach einer Parserkorrektur) heute anders lautet –
    // der archivierte Umschlag ist Provenienz, der aktuelle Titel steht im Manifest.
    const expectedEnvelope = envelopeFor(entry, raw, objectKey, bucket);
    const envelope = envelopeBytes(expectedEnvelope);
    const envelopePath = join(stagingDir, candidate.envelopeKey);
    const existingEnvelope = await readIfExists(envelopePath);
    const keepExisting = existingEnvelope !== undefined && !sameBytes(existingEnvelope, envelope) && envelopeCoreProblems(parseEnvelope(existingEnvelope), expectedEnvelope).length === 0;
    if (keepExisting) result.envelopesKept += 1;
    else if (!existingEnvelope || !sameBytes(existingEnvelope, envelope)) {
      if (existingEnvelope && (raw.archiveStatus === 'uploaded' || raw.archiveStatus === 'verified')) {
        problem('envelope-changed', `Umschlag ${candidate.envelopeKey} weicht vom bereits hochgeladenen ab – wird nicht ersetzt`);
        continue;
      }
      if (options.write) await writeFileAtomic(envelopePath, envelope);
      result.envelopesWritten += 1;
    }

    if (raw.archiveStatus === 'uploaded' || raw.archiveStatus === 'verified') {
      result.alreadyArchived += 1;
      continue;
    }
    if (raw.archiveStatus === undefined) {
      if (options.write) {
        raw.bucket = bucket;
        raw.objectKey = objectKey;
        raw.archiveStatus = 'staged';
      }
      dirty.add(entry);
    }
  }

  result.manifestEntriesUpdated = dirty.size;
  if (options.write) {
    for (const entry of dirty) await writeManifestEntry(options.root, entry);
  }
  options.log?.(`Staging: ${result.candidates} Rohquellen (${result.bytes} Bytes), ${options.write ? 'geschrieben' : 'zu schreiben'} ${result.written}, bereits gestagt ${result.alreadyStaged}, Umschläge ${result.envelopesWritten} (beibehalten ${result.envelopesKept}), Manifesteinträge ${result.manifestEntriesUpdated}, bereits archiviert ${result.alreadyArchived}, Befunde ${result.problems.length}`);
  return result;
}
