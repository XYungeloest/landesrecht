/**
 * Schreibpfad beider Quellbereiche (LRGV, LRMB): Rohquellen, kanonische Ausgangsfassung,
 * Transformationsreport, Manifest und Review-Queue. Es entsteht ausschließlich
 * `versions/<Stichtag>.json`; vorhandene weitere Fassungen werden nie überschrieben.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding, TransformContext } from '@landesrecht/importer-common/pipeline.ts';

import { TARGET_JURISDICTION } from './constants.ts';
import { MANIFEST_PATH, upsertManifestEntry, writeManifest, type ImportManifest, type ManifestEntry, type ReviewStatus, type SourceArea } from './manifest.ts';
import { mergeReviewItems, REVIEW_QUEUE_PATH, writeReviewQueue, type ReviewItemInput, type ReviewQueue } from './review-queue.ts';

export class FileWriter {
  readonly root: string;
  readonly written: string[] = [];

  constructor(root: string) {
    this.root = root;
  }

  async json(relative: string, value: unknown): Promise<void> {
    const target = join(this.root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    this.written.push(relative.replace(/\\/gu, '/'));
  }

  async bytes(relative: string, bytes: Uint8Array): Promise<void> {
    const target = join(this.root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
    this.written.push(relative.replace(/\\/gu, '/'));
  }
}

/** Schreibt meta.json, history.json und versions/<Stichtag>.json; bricht ab, wenn fremde Fassungen existieren. */
export async function writeInitialNorm(writer: FileWriter, record: NormRecord, baseline: string): Promise<ImportFinding | null> {
  const normDir = join('content', 'norms', TARGET_JURISDICTION, record.meta.slug);
  const existingVersions = await readdir(join(writer.root, normDir, 'versions')).catch(() => [] as string[]);
  const foreignVersions = existingVersions.filter((file) => file !== `${baseline}.json`);
  if (foreignVersions.length > 0) {
    return { severity: 'error', code: 'existing-versions', message: `Für ${record.meta.slug} liegen bereits weitere Fassungen vor (${foreignVersions.join(', ')}); der Initialimport überschreibt nichts` };
  }
  await rm(join(writer.root, normDir), { recursive: true, force: true });
  await writer.json(join(normDir, 'meta.json'), record.meta);
  await writer.json(join(normDir, 'history.json'), record.history);
  await writer.json(join(normDir, 'versions', `${baseline}.json`), record.versions[0]);
  return null;
}

/** Slugvergabe: eigener Manifesteintrag behält seinen Slug; Kollisionen erhalten die Term-ID als Suffix. */
export async function createSlugReservation(root: string, manifest: ImportManifest, sourceIdentity: string): Promise<{ reserveSlug: TransformContext['reserveSlug']; collisions: string[] }> {
  const existing = new Set(await readdir(join(root, 'content', 'norms', TARGET_JURISDICTION)).catch(() => [] as string[]));
  const ownEntry = manifest.entries.find((entry) => entry.sourceIdentity === sourceIdentity);
  const collisions: string[] = [];
  const reserveSlug = (candidate: string): string => {
    if (ownEntry?.targetSlug === candidate) return candidate;
    const takenByOther = (existing.has(candidate) && manifest.entries.some((entry) => entry.targetSlug === candidate && entry.sourceIdentity !== sourceIdentity)) || manifest.entries.some((entry) => entry.targetSlug === candidate && entry.sourceIdentity !== sourceIdentity);
    const fixtureCollision = existing.has(candidate) && !manifest.entries.some((entry) => entry.targetSlug === candidate);
    if (!takenByOther && !fixtureCollision) return candidate;
    const slug = `${candidate}-${sourceIdentity.replace(/^term:/u, '')}`;
    collisions.push(`${candidate} → ${slug}`);
    return slug;
  };
  return { reserveSlug, collisions };
}

export function reviewStatusFor(queue: ReviewQueue, sourceIdentity: string): ReviewStatus {
  const items = queue.items.filter((item) => item.sourceIdentity === sourceIdentity);
  if (items.some((item) => item.status === 'open' && item.occurrence === 'current')) return 'open';
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
 * Führt Review-Fälle zusammen, setzt den Reviewstatus des Manifesteintrags und schreibt im
 * Schreiblauf Queue (immer) und Manifest (nur mit Eintrag). Im Dry-run bleibt alles im Speicher.
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
    await writeReviewQueue(options.root, reviewQueue);
    written.push(REVIEW_QUEUE_PATH.replace(/\\/gu, '/'));
    if (options.entry) {
      await writeManifest(options.root, manifest);
      written.push(MANIFEST_PATH.replace(/\\/gu, '/'));
    }
  }
  return { manifest, reviewQueue, reviewStatus, written };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
