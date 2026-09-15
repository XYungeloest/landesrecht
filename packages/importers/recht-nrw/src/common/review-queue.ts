/**
 * Gemeinsame Review-Queue für LRGV und LRMB (`data/imports/recht-nrw/review-queue.json`).
 *
 * Ein Review-Fall hat eine stabile Kennung aus Quellidentität, Kategorie und fachlichem Schlüssel.
 * Wiederholte Importe aktualisieren den Fall (lastSeenAt, Details), löschen ihn aber nie: Ein Fall,
 * der im neuen Lauf nicht mehr auftritt, bleibt mit `occurrence: "not-reproduced"` stehen, bis er
 * ausdrücklich entschieden wird (`status: resolved|accepted`). Entscheidungen bleiben erhalten.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SourceArea } from './manifest.ts';

export const REVIEW_QUEUE_SCHEMA = 'recht-nrw-review-queue/1' as const;
export const REVIEW_QUEUE_PATH = join('data', 'imports', 'recht-nrw', 'review-queue.json');

export const REVIEW_CATEGORIES = [
  'version-selection',
  'source-unavailable',
  'historical-gap',
  'reconstruction-required',
  'reconstruction-uncertain',
  'unknown-structure',
  'text-integrity',
  'normativity',
  'institution-mapping',
  'slug-collision',
  'attachment',
  'metadata-conflict',
  'other',
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export interface ReviewItemInput {
  category: ReviewCategory;
  /** Fachlicher Schlüssel innerhalb der Kategorie (z. B. „ministry“, „selection-gap“). */
  key: string;
  /** blocking: verhindert die Übernahme; non-blocking: Übernahme mit offener Entscheidung. */
  severity: 'blocking' | 'non-blocking';
  summary: string;
  details: string[];
}

export interface ReviewItem extends ReviewItemInput {
  id: string;
  sourceArea: SourceArea;
  sourceIdentity: string;
  sourceUrl: string;
  targetSlug?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Ob der Fall im letzten Lauf dieser Quelle erneut auftrat. */
  occurrence: 'current' | 'not-reproduced';
  status: 'open' | 'resolved' | 'accepted';
  resolution?: { decidedAt: string; note: string };
}

export interface ReviewQueue {
  schemaVersion: typeof REVIEW_QUEUE_SCHEMA;
  items: ReviewItem[];
}

export function reviewItemId(sourceIdentity: string, category: ReviewCategory, key: string): string {
  return `${sourceIdentity}:${category}:${createHash('sha256').update(`${sourceIdentity}|${category}|${key}`).digest('hex').slice(0, 10)}`;
}

export function emptyReviewQueue(): ReviewQueue {
  return { schemaVersion: REVIEW_QUEUE_SCHEMA, items: [] };
}

export async function readReviewQueue(root: string): Promise<ReviewQueue> {
  try {
    const parsed = JSON.parse(await readFile(join(root, REVIEW_QUEUE_PATH), 'utf8')) as ReviewQueue;
    if (parsed.schemaVersion !== REVIEW_QUEUE_SCHEMA) throw new Error(`${REVIEW_QUEUE_PATH}: unbekannte Schemaversion ${parsed.schemaVersion}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyReviewQueue();
    throw error;
  }
}

export async function writeReviewQueue(root: string, queue: ReviewQueue): Promise<string> {
  const target = join(root, REVIEW_QUEUE_PATH);
  await mkdir(dirname(target), { recursive: true });
  const sorted: ReviewQueue = { ...queue, items: [...queue.items].sort((left, right) => left.id.localeCompare(right.id)) };
  await writeFile(target, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  return target;
}

/**
 * Führt die Befunde eines Laufs für eine Quelle in die Queue ein. Bestehende Fälle behalten
 * `firstSeenAt`, `status` und `resolution`; nicht erneut aufgetretene Fälle bleiben erhalten.
 */
export function mergeReviewItems(queue: ReviewQueue, run: { sourceArea: SourceArea; sourceIdentity: string; sourceUrl: string; targetSlug?: string; now: string }, inputs: readonly ReviewItemInput[]): ReviewQueue {
  const byId = new Map(queue.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const input of inputs) {
    const id = reviewItemId(run.sourceIdentity, input.category, input.key);
    if (seen.has(id)) continue;
    seen.add(id);
    const existing = byId.get(id);
    const item: ReviewItem = {
      ...input,
      id,
      sourceArea: run.sourceArea,
      sourceIdentity: run.sourceIdentity,
      sourceUrl: run.sourceUrl,
      firstSeenAt: existing?.firstSeenAt ?? run.now,
      lastSeenAt: run.now,
      occurrence: 'current',
      status: existing?.status ?? 'open',
    };
    if (run.targetSlug) item.targetSlug = run.targetSlug;
    if (existing?.resolution) item.resolution = existing.resolution;
    byId.set(id, item);
  }
  for (const item of byId.values()) {
    if (item.sourceIdentity === run.sourceIdentity && !seen.has(item.id)) item.occurrence = 'not-reproduced';
  }
  return { ...queue, items: [...byId.values()] };
}

export function openReviewItems(queue: ReviewQueue, sourceIdentity?: string): ReviewItem[] {
  return queue.items.filter((item) => item.status === 'open' && (!sourceIdentity || item.sourceIdentity === sourceIdentity));
}
