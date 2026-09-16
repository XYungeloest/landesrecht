/**
 * Schreibpfad beider Quellbereiche (LRGV, LRMB): kanonische Ausgangsfassung, Reports, Manifest und
 * Review-Queue – alles atomar. Es entsteht ausschließlich `versions/<Stichtag>.json`; vorhandene weitere
 * Fassungen werden nie überschrieben.
 *
 * Eine Norm wird in ein Temp-Verzeichnis geschrieben und erst vollständig per Umbenennung an ihren Platz
 * gebracht: Ein Abbruch hinterlässt nie eine halbe Contentnorm. `recoverInterruptedNormWrites` räumt
 * liegengebliebene Temp- und Sicherungsverzeichnisse beim nächsten Lauf auf.
 */
import { randomBytes } from 'node:crypto';
import { readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { TARGET_JURISDICTION } from './constants.ts';
import { upsertManifestEntry, writeManifestEntry, type ImportManifest, type ManifestEntry, type ReviewStatus, type SourceArea } from './manifest.ts';
import { mergeReviewItems, writeReviewShard, type ReviewItemInput, type ReviewQueue } from './review-queue.ts';

export { stableStringify } from './stable-json.ts';

export const NORM_TEMP_PREFIX = '.tmp-norm-';
export const NORM_BACKUP_PREFIX = '.old-norm-';

export class FileWriter {
  readonly root: string;
  readonly written: string[] = [];

  constructor(root: string) {
    this.root = root;
  }

  async json(relative: string, value: unknown): Promise<void> {
    await writeJsonAtomic(join(this.root, relative), value);
    this.written.push(relative.replace(/\\/gu, '/'));
  }

  async bytes(relative: string, bytes: Uint8Array): Promise<void> {
    await writeFileAtomic(join(this.root, relative), bytes);
    this.written.push(relative.replace(/\\/gu, '/'));
  }

  /** Schreibt JSON; unterscheidet sich der Inhalt nur in Laufmetadaten, bleibt die gespeicherte Datei unverändert. */
  async jsonStable(relative: string, value: unknown, runtimeFields: readonly string[] = ['generatedAt']): Promise<void> {
    const target = join(this.root, relative);
    const existing = await readJsonFile<Record<string, unknown>>(target).catch(() => undefined);
    const strip = (input: unknown): string => {
      const copy = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
      for (const field of runtimeFields) delete copy[field];
      return JSON.stringify(copy);
    };
    if (!existing || strip(existing) !== strip(value)) await writeJsonAtomic(target, value);
    this.written.push(relative.replace(/\\/gu, '/'));
  }
}

function normsDirectory(root: string): string {
  return join(root, 'content', 'norms', TARGET_JURISDICTION);
}

/** Schreibt meta.json, history.json und versions/<Stichtag>.json atomisch; bricht ab, wenn fremde Fassungen existieren. */
export async function writeInitialNorm(writer: FileWriter, record: NormRecord, baseline: string, options: { protectVersionedSources?: boolean } = {}): Promise<ImportFinding | null> {
  const directory = normsDirectory(writer.root);
  const normDir = join(directory, record.meta.slug);
  const existingVersions = await readdir(join(normDir, 'versions')).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baseline}.json`);
  if (foreignVersions.length > 0) {
    return { severity: 'error', code: 'existing-versions', message: `Für ${record.meta.slug} liegen bereits weitere Fassungen vor (${foreignVersions.join(', ')}); der Initialimport überschreibt nichts` };
  }
  // Bulkmodus: Normen des Beispielkorpus (versionierte Rohquellen unter sources/recht-nrw) werden nie ersetzt.
  if (options.protectVersionedSources && existingVersions.includes(`${baseline}.json`)) {
    const existing = await readJsonFile<unknown>(join(normDir, 'versions', `${baseline}.json`)).catch(() => undefined);
    if (existing !== undefined && JSON.stringify(existing).includes('"availability":"versioned"')) {
      return { severity: 'error', code: 'existing-versions', message: `${record.meta.slug} gehört zum Beispielkorpus (versionierte Rohquellen); der Bulkimport ersetzt die gespeicherte Fassung nicht (Neuerzeugung nur mit dem sample-Befehl)` };
    }
  }
  const token = `${process.pid}-${randomBytes(4).toString('hex')}`;
  const temp = join(directory, `${NORM_TEMP_PREFIX}${record.meta.slug}-${token}`);
  await writeJsonAtomic(join(temp, 'meta.json'), record.meta);
  await writeJsonAtomic(join(temp, 'history.json'), record.history);
  await writeJsonAtomic(join(temp, 'versions', `${baseline}.json`), record.versions[0]);
  const hasExisting = existingVersions.length > 0 || (await readdir(normDir).then(() => true, () => false));
  if (hasExisting) {
    const backup = join(directory, `${NORM_BACKUP_PREFIX}${record.meta.slug}-${token}`);
    await rename(normDir, backup);
    await rename(temp, normDir);
    await rm(backup, { recursive: true, force: true });
  } else {
    await rename(temp, normDir);
  }
  const relative = ['content', 'norms', TARGET_JURISDICTION, record.meta.slug].join('/');
  writer.written.push(`${relative}/meta.json`, `${relative}/history.json`, `${relative}/versions/${baseline}.json`);
  return null;
}

/** Stellt nach einem harten Abbruch einen konsistenten Normbestand her (Temp weg, Sicherung zurück). */
export async function recoverInterruptedNormWrites(root: string): Promise<string[]> {
  const directory = normsDirectory(root);
  const actions: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return actions;
  }
  for (const entry of entries.filter((name) => name.startsWith(NORM_TEMP_PREFIX))) {
    await rm(join(directory, entry), { recursive: true, force: true });
    actions.push(`entfernt ${entry}`);
  }
  for (const entry of entries.filter((name) => name.startsWith(NORM_BACKUP_PREFIX))) {
    const slug = entry.slice(NORM_BACKUP_PREFIX.length).replace(/-\d+-[a-f0-9]{8}$/u, '');
    if (!entries.includes(slug)) {
      await rename(join(directory, entry), join(directory, slug));
      actions.push(`wiederhergestellt ${slug}`);
    } else {
      await rm(join(directory, entry), { recursive: true, force: true });
      actions.push(`entfernt ${entry}`);
    }
  }
  return actions;
}

export async function listExistingSlugs(root: string): Promise<Set<string>> {
  const entries = await readdir(normsDirectory(root), { withFileTypes: true }).catch(() => []);
  return new Set(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name));
}

export function reviewStatusFor(queue: ReviewQueue, sourceIdentity: string): ReviewStatus {
  const items = queue.items.filter((item) => item.sourceIdentity === sourceIdentity);
  if (items.some((item) => item.status === 'open' && item.occurrence === 'current')) return 'open';
  if (items.some((item) => item.status !== 'open' && item.decision && item.decision.decidedBy !== 'importer')) return 'resolved';
  if (items.some((item) => item.status !== 'open')) return 'resolved';
  return 'none';
}

export interface ReviewPersistence {
  manifest: ImportManifest;
  reviewQueue: ReviewQueue;
  reviewStatus: ReviewStatus;
  written: string[];
}

/**
 * Führt Review-Fälle zusammen, setzt den Reviewstatus des Manifesteintrags und schreibt im Schreiblauf die
 * Review-Datei dieser Quelle (immer) und ihren Manifesteintrag (nur mit Eintrag) atomar. Im Dry-run bleibt
 * alles im Speicher.
 */
export async function persistReview(options: {
  root: string;
  write: boolean;
  manifest: ImportManifest;
  reviewQueue: ReviewQueue;
  entry?: ManifestEntry;
  run: { sourceArea: SourceArea; sourceIdentity: string; sourceUrl: string; targetSlug?: string; now: string };
  items: readonly ReviewItemInput[];
}): Promise<ReviewPersistence> {
  const reviewQueue = mergeReviewItems(options.reviewQueue, options.run, options.items);
  const reviewStatus = reviewStatusFor(reviewQueue, options.run.sourceIdentity);
  let manifest = options.manifest;
  const written: string[] = [];
  if (options.entry) {
    options.entry.reviewStatus = reviewStatus;
    manifest = upsertManifestEntry(manifest, options.entry);
  }
  if (options.write) {
    const review = await writeReviewShard(options.root, reviewQueue, options.run.sourceArea, options.run.sourceIdentity);
    if (reviewQueue.items.some((item) => item.sourceIdentity === options.run.sourceIdentity)) written.push(review.path);
    if (options.entry) written.push((await writeManifestEntry(options.root, options.entry)).path);
  }
  return { manifest, reviewQueue, reviewStatus, written };
}
