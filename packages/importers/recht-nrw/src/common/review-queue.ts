/**
 * Gemeinsame Review-Queue für LRGV und LRMB.
 *
 * Ablage (bulkfähig): eine Datei je Quelle unter `data/imports/recht-nrw/review/<bereich>/<datei>.json`;
 * die frühere Einzeldatei `review-queue.json` (Schema 1) wird beim Lesen übernommen.
 *
 * Ein Review-Fall hat eine stabile Kennung aus Quellidentität, Kategorie und fachlichem Schlüssel.
 * Fälle werden nie gelöscht:
 *   - gleicher Befund im Wiederholungslauf → bestehende Entscheidung bleibt erhalten
 *   - Befund verschwunden → offener Fall wird `superseded` (Entscheidung des Importers, mit Begründung);
 *     entschiedene Fälle behalten ihre Entscheidung; `occurrence: not-reproduced`
 *   - ein vom Importer abgelöster Fall, der wieder auftritt, wird erneut geöffnet
 * Manuelle Entscheidungen tragen decision, reason, decidedAt und optional decidedBy, Ersatzdaten und
 * die Kennung eines dokumentierten Overrides (`data/imports/recht-nrw/overrides.json`).
 */
import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CorruptStateError, readJsonFile, TEMP_PREFIX, writeJsonAtomic } from './atomic.ts';
import { compareSourceIdentity, IMPORT_DATA_DIR, identityFileName, SOURCE_AREAS, type SourceArea } from './manifest.ts';

export const REVIEW_QUEUE_SCHEMA = 'recht-nrw-review-queue/2' as const;
export const REVIEW_QUEUE_SCHEMA_V1 = 'recht-nrw-review-queue/1';
export const REVIEW_SHARD_SCHEMA = 'recht-nrw-review-shard/2' as const;
/** Frühere Einzeldatei (nur noch Lesen/Migration). */
export const REVIEW_QUEUE_PATH = join(IMPORT_DATA_DIR, 'review-queue.json');
export const REVIEW_DIR = join(IMPORT_DATA_DIR, 'review');

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
  'document-identity',
  'other',
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_ITEM_STATUSES = ['open', 'accepted', 'resolved', 'excluded', 'deferred', 'superseded'] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export interface ReviewItemInput {
  category: ReviewCategory;
  /** Fachlicher Schlüssel innerhalb der Kategorie (z. B. „ministry“, „selection-gap“). */
  key: string;
  /** blocking: verhindert die Übernahme; non-blocking: Übernahme mit offener Entscheidung. */
  severity: 'blocking' | 'non-blocking';
  summary: string;
  details: string[];
}

export interface ReviewDecision {
  decision: Exclude<ReviewItemStatus, 'open'>;
  reason: string;
  decidedAt: string;
  decidedBy?: string;
  /** Ersatzdaten (z. B. korrigiertes Datum), die ein Override im Importlauf anwendet. */
  replacement?: Record<string, unknown>;
  /** Kennung des dokumentierten Overrides. */
  override?: string;
}

export interface ReviewItem extends ReviewItemInput {
  id: string;
  sourceArea: SourceArea;
  sourceIdentity: string;
  sourceUrl: string;
  targetSlug?: string;
  firstSeenAt: string;
  /** Letzte fachliche Änderung des Falls (nicht jeder Lauf). */
  updatedAt: string;
  /** Ob der Fall im letzten Lauf dieser Quelle erneut auftrat. */
  occurrence: 'current' | 'not-reproduced';
  status: ReviewItemStatus;
  decision?: ReviewDecision;
  /** Frühere Entscheidungen (z. B. nach erneutem Auftreten eines abgelösten Falls). */
  history?: ReviewDecision[];
}

export interface ReviewQueue {
  schemaVersion: typeof REVIEW_QUEUE_SCHEMA;
  items: ReviewItem[];
}

interface ReviewShard {
  schemaVersion: typeof REVIEW_SHARD_SCHEMA;
  sourceArea: SourceArea;
  sourceIdentity: string;
  items: ReviewItem[];
}

export const IMPORTER_DECIDER = 'importer';

export function reviewItemId(sourceIdentity: string, category: ReviewCategory, key: string): string {
  return `${sourceIdentity}:${category}:${createHash('sha256').update(`${sourceIdentity}|${category}|${key}`).digest('hex').slice(0, 10)}`;
}

export function emptyReviewQueue(): ReviewQueue {
  return { schemaVersion: REVIEW_QUEUE_SCHEMA, items: [] };
}

export function reviewShardPath(area: SourceArea, sourceIdentity: string): string {
  return join(REVIEW_DIR, area, `${identityFileName(sourceIdentity)}.json`);
}

/** Hochstufung eines Falls der Schemaversion 1 (resolution → decision, lastSeenAt → updatedAt). */
export function upgradeReviewItemV1(item: Record<string, unknown>): ReviewItem {
  const legacy = item as unknown as ReviewItem & { lastSeenAt?: string; resolution?: { decidedAt: string; note: string } };
  const { lastSeenAt, resolution, ...rest } = legacy;
  const upgraded: ReviewItem = { ...rest, updatedAt: rest.updatedAt ?? lastSeenAt ?? rest.firstSeenAt };
  if (resolution && upgraded.status !== 'open') upgraded.decision = { decision: upgraded.status as ReviewDecision['decision'], reason: resolution.note, decidedAt: resolution.decidedAt };
  return upgraded;
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith('.json') && !file.startsWith(TEMP_PREFIX)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function readReviewQueue(root: string): Promise<ReviewQueue> {
  const byId = new Map<string, ReviewItem>();
  const legacy = await readJsonFile<{ schemaVersion?: string; items?: Array<Record<string, unknown>> }>(join(root, REVIEW_QUEUE_PATH));
  if (legacy) {
    if (legacy.schemaVersion !== REVIEW_QUEUE_SCHEMA_V1 && legacy.schemaVersion !== REVIEW_QUEUE_SCHEMA) throw new CorruptStateError(REVIEW_QUEUE_PATH, `unbekannte Schemaversion ${legacy.schemaVersion}`);
    for (const item of legacy.items ?? []) {
      const upgraded = legacy.schemaVersion === REVIEW_QUEUE_SCHEMA_V1 ? upgradeReviewItemV1(item) : (item as unknown as ReviewItem);
      byId.set(upgraded.id, upgraded);
    }
  }
  const shardIdentities = new Set<string>();
  for (const area of SOURCE_AREAS) {
    const directory = join(root, REVIEW_DIR, area);
    for (const file of await listFiles(directory)) {
      const path = join(directory, file);
      const shard = await readJsonFile<ReviewShard>(path);
      if (!shard || shard.schemaVersion !== REVIEW_SHARD_SCHEMA || !Array.isArray(shard.items)) throw new CorruptStateError(path, 'keine gültige Review-Datei');
      if (`${identityFileName(shard.sourceIdentity)}.json` !== file) throw new CorruptStateError(path, `Dateiname passt nicht zur Quellidentität ${shard.sourceIdentity}`);
      shardIdentities.add(shard.sourceIdentity);
      for (const [id, item] of byId) if (item.sourceIdentity === shard.sourceIdentity) byId.delete(id);
      for (const item of shard.items) {
        if (item.sourceIdentity !== shard.sourceIdentity) throw new CorruptStateError(path, `Fall ${item.id} gehört zu ${item.sourceIdentity}`);
        if (!(REVIEW_ITEM_STATUSES as readonly string[]).includes(item.status)) throw new CorruptStateError(path, `Fall ${item.id}: unbekannter Status ${item.status}`);
        byId.set(item.id, item);
      }
    }
  }
  return { schemaVersion: REVIEW_QUEUE_SCHEMA, items: sortItems([...byId.values()]) };
}

function sortItems(items: ReviewItem[]): ReviewItem[] {
  return items.sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Schreibt die Fälle einer Quelle atomar. */
export async function writeReviewShard(root: string, queue: ReviewQueue, sourceArea: SourceArea, sourceIdentity: string): Promise<{ path: string; changed: boolean }> {
  const items = sortItems(queue.items.filter((item) => item.sourceIdentity === sourceIdentity));
  const path = reviewShardPath(sourceArea, sourceIdentity);
  if (items.length === 0) {
    await rm(join(root, path), { force: true });
    return { path: path.replace(/\\/gu, '/'), changed: false };
  }
  const shard: ReviewShard = { schemaVersion: REVIEW_SHARD_SCHEMA, sourceArea, sourceIdentity, items };
  const changed = await writeJsonAtomic(join(root, path), shard);
  return { path: path.replace(/\\/gu, '/'), changed };
}

/** Schreibt alle Fälle als Einzeldateien und entfernt die frühere Einzeldatei. */
export async function writeReviewQueue(root: string, queue: ReviewQueue): Promise<string> {
  const identities = new Map<string, SourceArea>();
  for (const item of queue.items) identities.set(item.sourceIdentity, item.sourceArea);
  for (const [identity, area] of [...identities.entries()].sort(([left], [right]) => compareSourceIdentity(left, right))) await writeReviewShard(root, queue, area, identity);
  await rm(join(root, REVIEW_QUEUE_PATH), { force: true });
  return join(root, REVIEW_DIR);
}

function sameContent(left: ReviewItem, right: ReviewItem): boolean {
  const pick = (item: ReviewItem): string => JSON.stringify([item.severity, item.summary, item.details, item.sourceUrl, item.targetSlug ?? null, item.occurrence, item.status, item.decision ?? null, item.history ?? null]);
  return pick(left) === pick(right);
}

/**
 * Führt die Befunde eines Laufs für eine Quelle in die Queue ein (siehe Moduldokumentation).
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
      updatedAt: existing?.updatedAt ?? run.now,
      occurrence: 'current',
      status: existing?.status ?? 'open',
    };
    if (run.targetSlug) item.targetSlug = run.targetSlug;
    if (existing?.decision) item.decision = existing.decision;
    if (existing?.history) item.history = existing.history;
    if (existing?.status === 'superseded' && existing.decision?.decidedBy === IMPORTER_DECIDER) {
      // Vom Importer abgelöst, jetzt erneut aufgetreten: wieder offen, frühere Ablösung bleibt in der Historie.
      item.status = 'open';
      item.history = [...(existing.history ?? []), existing.decision];
      delete item.decision;
    }
    if (existing && !sameContent(existing, item)) item.updatedAt = run.now;
    byId.set(id, item);
  }
  for (const [id, item] of byId) {
    if (item.sourceIdentity !== run.sourceIdentity || seen.has(id)) continue;
    const next: ReviewItem = { ...item, occurrence: 'not-reproduced' };
    if (item.status === 'open') {
      next.status = 'superseded';
      next.decision = { decision: 'superseded', reason: 'Befund trat im Wiederholungslauf nicht mehr auf (automatisch abgelöst, nicht gelöscht).', decidedAt: run.now, decidedBy: IMPORTER_DECIDER };
    }
    if (!sameContent(item, next)) next.updatedAt = run.now;
    byId.set(id, next);
  }
  return { ...queue, items: sortItems([...byId.values()]) };
}

/** Manuelle Entscheidung zu einem Fall (CLI `review --decide`). */
export function decideReviewItem(queue: ReviewQueue, id: string, decision: ReviewDecision): ReviewQueue {
  const item = queue.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Review-Fall ${id} existiert nicht`);
  if (!decision.reason.trim()) throw new Error('Eine Entscheidung braucht eine Begründung');
  if (!/^\d{4}-\d{2}-\d{2}/u.test(decision.decidedAt)) throw new Error('decidedAt muss ein ISO-Datum sein');
  const history = item.decision ? [...(item.history ?? []), item.decision] : item.history;
  const next: ReviewItem = { ...item, status: decision.decision, decision, updatedAt: decision.decidedAt };
  if (history) next.history = history;
  return { ...queue, items: queue.items.map((candidate) => (candidate.id === id ? next : candidate)) };
}

export function openReviewItems(queue: ReviewQueue, sourceIdentity?: string): ReviewItem[] {
  return queue.items.filter((item) => item.status === 'open' && (!sourceIdentity || item.sourceIdentity === sourceIdentity));
}
