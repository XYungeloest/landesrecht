/**
 * Review-Queue des BAYERN.RECHT-Adapters.
 *
 * Ablage: eine Datei je Stammnorm unter `data/imports/bayernrecht/review/<bereich>/<identität>.json` –
 * strikt getrennt von der West-Queue (`data/imports/recht-nrw/review/**`) und von der NSH-Queue
 * (`data/imports/juris-sh/review/**`). Zusätzlich trägt jeder Fall `jurisdiction: 'baywue'` und
 * `sourceSystem: 'bayernrecht'`, und jede Datei wiederholt beides im Kopf: Eine Vermischung der
 * Bestände ist damit auch dann erkennbar, wenn Fälle einmal zusammen ausgewertet werden – eine
 * fremde Datei im eigenen Verzeichnis ist ein Zustandsfehler, kein stiller Import.
 *
 * Verfahren wie im erprobten West-Adapter und im NSH-Adapter (gleiche Semantik, eigener Zustand):
 *   - stabile Fallkennung aus Quellidentität, Kategorie und fachlichem Schlüssel
 *   - Fälle werden nie gelöscht: gleicher Befund → Entscheidung bleibt; verschwundener Befund → offener
 *     Fall wird `superseded` (Entscheidung des Importers, mit Begründung), `occurrence: not-reproduced`;
 *     ein abgelöster Fall, der wieder auftritt, wird erneut geöffnet (frühere Ablösung bleibt in der Historie)
 *   - manuelle Entscheidungen tragen Begründung, Datum, optional Name und die Kennung eines Overrides
 */
import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CorruptStateError, readJsonFile, TEMP_PREFIX, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from './constants.ts';
import type { ReviewStatus } from './manifest.ts';
import { compareSourceIdentity, identityFileName, reviewAreaDir, reviewShardPath } from './paths.ts';

export const REVIEW_QUEUE_SCHEMA = 'bayernrecht-review-queue/1' as const;
export const REVIEW_SHARD_SCHEMA = 'bayernrecht-review-shard/1' as const;

/**
 * Dieselben zwölf Kategorien wie im NSH-Bestand – bewusst unverändert, damit Auswertungen über beide
 * Länder vergleichbar bleiben. `reconstruction-required` trifft in Bayern denselben Fall (das Portal
 * führt vielfach nur die aktuelle Fassung), `identity` zusätzlich die Verwechslungsgefahr zwischen
 * gleichnamigen Vorschriften mit verschiedener BayRS-Gliederungsnummer.
 */
export const REVIEW_CATEGORIES = [
  'historical-gap',
  'validity',
  'normativity',
  'institution-mapping',
  'unknown-structure',
  'pdf-only',
  'incomplete-annex',
  'identity',
  'metadata-conflict',
  'import-regression',
  'reconstruction-required',
  'contradictory-evidence',
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_ITEM_STATUSES = ['open', 'accepted', 'resolved', 'excluded', 'deferred', 'superseded'] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export const IMPORTER_DECIDER = 'importer';

export interface ReviewItemInput {
  category: ReviewCategory;
  /** Fachlicher Schlüssel innerhalb der Kategorie (z. B. „baseline-gap“, „bayrs-number“). */
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
  /** Kennung des dokumentierten Overrides (`data/imports/bayernrecht/overrides.json`). */
  override?: string;
}

export interface ReviewItem extends ReviewItemInput {
  id: string;
  /** Simulationsjurisdiktion des Falls – immer `baywue`. */
  jurisdiction: typeof TARGET_JURISDICTION;
  /** Quellsystem des Falls – immer `bayernrecht`. */
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceArea: SourceArea;
  sourceIdentity: string;
  sourceUrl: string;
  targetSlug?: string;
  firstSeenAt: string;
  /** Letzte fachliche Änderung des Falls (nicht jeder Lauf). */
  updatedAt: string;
  occurrence: 'current' | 'not-reproduced';
  status: ReviewItemStatus;
  decision?: ReviewDecision;
  history?: ReviewDecision[];
}

export interface ReviewQueue {
  schemaVersion: typeof REVIEW_QUEUE_SCHEMA;
  items: ReviewItem[];
}

interface ReviewShard {
  schemaVersion: typeof REVIEW_SHARD_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceArea: SourceArea;
  sourceIdentity: string;
  items: ReviewItem[];
}

export function emptyReviewQueue(): ReviewQueue {
  return { schemaVersion: REVIEW_QUEUE_SCHEMA, items: [] };
}

export function reviewItemId(sourceIdentity: string, category: ReviewCategory, key: string): string {
  return `${sourceIdentity}:${category}:${createHash('sha256').update(`${sourceIdentity}|${category}|${key}`).digest('hex').slice(0, 10)}`;
}

function sortItems(items: ReviewItem[]): ReviewItem[] {
  return items.sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Schemaprüfung eines Falls (fail-closed, benennt jede Abweichung). */
export function validateReviewItem(value: unknown, where = 'Review-Fall'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object') return [`${where}: kein Objekt`];
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id === '') problems.push(`${where}: id fehlt`);
  if (item.jurisdiction !== TARGET_JURISDICTION) problems.push(`${where}: jurisdiction ist ${String(item.jurisdiction)}, erwartet ${TARGET_JURISDICTION}`);
  if (item.sourceSystem !== SOURCE_SYSTEM) problems.push(`${where}: sourceSystem ist ${String(item.sourceSystem)}, erwartet ${SOURCE_SYSTEM}`);
  if (!(REVIEW_CATEGORIES as readonly string[]).includes(String(item.category))) problems.push(`${where}: unbekannte Kategorie ${String(item.category)}`);
  if (!(REVIEW_ITEM_STATUSES as readonly string[]).includes(String(item.status))) problems.push(`${where}: unbekannter Status ${String(item.status)}`);
  if (!(SOURCE_AREAS as readonly string[]).includes(String(item.sourceArea))) problems.push(`${where}: unbekannter Bereich ${String(item.sourceArea)}`);
  if (item.severity !== 'blocking' && item.severity !== 'non-blocking') problems.push(`${where}: severity ist ${String(item.severity)}`);
  if (typeof item.summary !== 'string' || item.summary.trim() === '') problems.push(`${where}: summary fehlt`);
  if (!Array.isArray(item.details)) problems.push(`${where}: details fehlt`);
  return problems;
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
  for (const area of SOURCE_AREAS) {
    const directory = join(root, reviewAreaDir(area));
    for (const file of await listFiles(directory)) {
      const relative = `${reviewAreaDir(area)}/${file}`;
      const shard = await readJsonFile<ReviewShard>(join(directory, file));
      if (!shard || shard.schemaVersion !== REVIEW_SHARD_SCHEMA || !Array.isArray(shard.items)) throw new CorruptStateError(relative, 'keine gültige Review-Datei');
      if (shard.jurisdiction !== TARGET_JURISDICTION || shard.sourceSystem !== SOURCE_SYSTEM) throw new CorruptStateError(relative, `fremder Bestand (${String(shard.sourceSystem)}/${String(shard.jurisdiction)})`);
      if (shard.sourceArea !== area) throw new CorruptStateError(relative, `Datei gehört zum Bereich ${String(shard.sourceArea)}, liegt aber unter ${area}`);
      if (`${identityFileName(shard.sourceIdentity)}.json` !== file) throw new CorruptStateError(relative, `Dateiname passt nicht zur Quellidentität ${shard.sourceIdentity}`);
      for (const item of shard.items) {
        const problems = validateReviewItem(item, `${relative}: Fall ${String((item as ReviewItem).id)}`);
        if (problems.length > 0) throw new CorruptStateError(relative, problems.join('; '));
        if (item.sourceIdentity !== shard.sourceIdentity) throw new CorruptStateError(relative, `Fall ${item.id} gehört zu ${item.sourceIdentity}`);
        byId.set(item.id, item);
      }
    }
  }
  return { schemaVersion: REVIEW_QUEUE_SCHEMA, items: sortItems([...byId.values()]) };
}

/** Schreibt die Fälle einer Stammnorm atomar; ohne Fälle wird die Datei entfernt. */
export async function writeReviewShard(root: string, queue: ReviewQueue, sourceArea: SourceArea, sourceIdentity: string): Promise<{ path: string; changed: boolean }> {
  const items = sortItems(queue.items.filter((item) => item.sourceIdentity === sourceIdentity));
  const relative = reviewShardPath(sourceArea, sourceIdentity);
  if (items.length === 0) {
    await rm(join(root, relative), { force: true });
    return { path: relative, changed: false };
  }
  for (const item of items) {
    const problems = validateReviewItem(item, `Review-Fall ${item.id}`);
    if (problems.length > 0) throw new Error(`Review-Datei ${relative} nicht geschrieben:\n  - ${problems.join('\n  - ')}`);
  }
  const shard: ReviewShard = { schemaVersion: REVIEW_SHARD_SCHEMA, jurisdiction: TARGET_JURISDICTION, sourceSystem: SOURCE_SYSTEM, sourceArea, sourceIdentity, items };
  const changed = await writeJsonAtomic(join(root, relative), shard);
  return { path: relative, changed };
}

export async function writeReviewQueue(root: string, queue: ReviewQueue): Promise<string> {
  const identities = new Map<string, SourceArea>();
  for (const item of queue.items) identities.set(item.sourceIdentity, item.sourceArea);
  for (const [identity, area] of [...identities.entries()].sort(([left], [right]) => compareSourceIdentity(left, right))) await writeReviewShard(root, queue, area, identity);
  return join(root, reviewAreaDir(SOURCE_AREAS[0]), '..');
}

function sameContent(left: ReviewItem, right: ReviewItem): boolean {
  const pick = (item: ReviewItem): string => JSON.stringify([item.severity, item.summary, item.details, item.sourceUrl, item.targetSlug ?? null, item.occurrence, item.status, item.decision ?? null, item.history ?? null]);
  return pick(left) === pick(right);
}

export interface ReviewRunContext {
  sourceArea: SourceArea;
  sourceIdentity: string;
  sourceUrl: string;
  targetSlug?: string;
  /** Zeitpunkt des Laufs (ISO); wird nur bei fachlicher Änderung übernommen. */
  now: string;
}

/** Führt die Befunde eines Laufs für eine Stammnorm in die Queue ein (siehe Moduldokumentation). */
export function mergeReviewItems(queue: ReviewQueue, run: ReviewRunContext, inputs: readonly ReviewItemInput[]): ReviewQueue {
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
      jurisdiction: TARGET_JURISDICTION,
      sourceSystem: SOURCE_SYSTEM,
      sourceArea: run.sourceArea,
      sourceIdentity: run.sourceIdentity,
      sourceUrl: run.sourceUrl,
      firstSeenAt: existing?.firstSeenAt ?? run.now,
      updatedAt: existing?.updatedAt ?? run.now,
      occurrence: 'current',
      status: existing?.status ?? 'open',
      ...(run.targetSlug ? { targetSlug: run.targetSlug } : {}),
      ...(existing?.decision ? { decision: existing.decision } : {}),
      ...(existing?.history ? { history: existing.history } : {}),
    };
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
  if (!(REVIEW_ITEM_STATUSES as readonly string[]).includes(decision.decision) || (decision.decision as string) === 'open') throw new Error(`Unbekannte Entscheidung ${decision.decision}`);
  if (!decision.reason.trim()) throw new Error('Eine Entscheidung braucht eine Begründung');
  if (!/^\d{4}-\d{2}-\d{2}/u.test(decision.decidedAt)) throw new Error('decidedAt muss ein ISO-Datum sein');
  const history = item.decision ? [...(item.history ?? []), item.decision] : item.history;
  const next: ReviewItem = { ...item, status: decision.decision, decision, updatedAt: decision.decidedAt, ...(history ? { history } : {}) };
  return { ...queue, items: queue.items.map((candidate) => (candidate.id === id ? next : candidate)) };
}

export function openReviewItems(queue: ReviewQueue, sourceIdentity?: string): ReviewItem[] {
  return queue.items.filter((item) => item.status === 'open' && (!sourceIdentity || item.sourceIdentity === sourceIdentity));
}

/** Review-Status einer Stammnorm für das Manifest (gleiche Regel wie West und NSH). */
export function reviewStatusFor(queue: ReviewQueue, sourceIdentity: string): ReviewStatus {
  const items = queue.items.filter((item) => item.sourceIdentity === sourceIdentity);
  if (items.some((item) => item.status === 'open' && item.occurrence === 'current')) return 'open';
  if (items.some((item) => item.status !== 'open')) return 'resolved';
  return 'none';
}

/** Blockierende offene Fälle verhindern die Übernahme einer Norm. */
export function hasBlockingReview(queue: ReviewQueue, sourceIdentity: string): boolean {
  return openReviewItems(queue, sourceIdentity).some((item) => item.severity === 'blocking');
}
