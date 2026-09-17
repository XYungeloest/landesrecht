/**
 * Rekonstruktionsqueue (`data/imports/recht-nrw/reconstruction-queue.json`).
 *
 *   reconstruction-required → Queue → manuelle/assistierte Rezepterstellung → Rezeptprüfung
 *     (`lrmb/reconstruction.ts`, fail-closed) → Import
 *
 * Die Queue erzeugt nie ein Rezept. Sie ordnet offene Fälle nach einer nachvollziehbaren Priorisierungshilfe
 * (Dokumenttyp, Bezug zu einem Gesetz, Quellenlage, Aufwand) – ausdrücklich keine rechtliche Bewertung und
 * keine KI-Schätzung.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomic } from '../common/atomic.ts';
import { compareSourceIdentity, IMPORT_DATA_DIR, isImportedStatus, RECONSTRUCTIONS_DIR, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import type { ReviewQueue } from '../common/review-queue.ts';

export const RECONSTRUCTION_QUEUE_SCHEMA = 'recht-nrw-reconstruction-queue/1' as const;
export const RECONSTRUCTION_QUEUE_PATH = join(IMPORT_DATA_DIR, 'reconstruction-queue.json');

export interface ReconstructionQueueItem {
  sourceIdentity: string;
  title: string;
  sourceDocumentType: string;
  category: 'reconstruction-required' | 'reconstruction-uncertain';
  /** queued: kein Rezept; recipe-draft: Rezept vorhanden, Import noch nicht erfolgreich; imported: rekonstruiert übernommen. */
  status: 'queued' | 'recipe-draft' | 'imported' | 'blocked-uncertain';
  priority: { score: number; factors: string[] };
  sourceCompleteness?: number;
  amendments: number;
  direction?: string;
  estimatedSteps?: number;
  recipePath: string;
  recipeExists: boolean;
  blockers: string[];
}

/** Gruppierte Sicht der Queue (nur Darstellung): Richtung, Zahl der Änderungen, Quellenlage, Unsicherheit. */
export interface ReconstructionQueueGroups {
  byDirection: Record<'reverse' | 'forward' | 'mixed' | 'unknown', number>;
  byAmendments: Record<'0' | '1' | '2' | '3-5' | '6+', number>;
  bySourceCompleteness: Record<'complete' | 'partial' | 'unknown', number>;
  byStatus: Record<ReconstructionQueueItem['status'], number>;
  /** Fälle mit vollständigen, zugeordneten Quellen und ohne Unsicherheit – Kandidaten für die Rezepterstellung. */
  readyForRecipe: string[];
  /** Fälle mit unsicherer Rekonstruktion je Grundmuster (Kurzfassung des ersten Blockers). */
  uncertainReasons: Array<{ pattern: string; identities: string[] }>;
}

export interface ReconstructionQueue {
  schemaVersion: typeof RECONSTRUCTION_QUEUE_SCHEMA;
  note: string;
  items: ReconstructionQueueItem[];
  summary: { total: number; queued: number; recipeDraft: number; imported: number; blockedUncertain: number };
  groups?: ReconstructionQueueGroups;
}

function amendmentBucket(count: number): keyof ReconstructionQueueGroups['byAmendments'] {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count === 2) return '2';
  if (count <= 5) return '3-5';
  return '6+';
}

/** Kurzmuster eines Unsicherheitsbefunds (Daten, Fundstellen und Zitate entfernt). */
export function uncertaintyPattern(summary: string): string {
  return summary
    .replace(/„[^“]*“/gu, '„…“')
    .replace(/\([^)]*\)/gu, '(…)')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/gu, '<datum>')
    .replace(/\b\d{1,2}\.\s*\p{L}+\s+\d{4}\b/gu, '<datum>')
    .replace(/\b\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\b/gu, '<datum>')
    .replace(/\b\d+(?:[.,]\d+)*\b/gu, '#')
    .replace(/:\s.*$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);
}

export function groupReconstructionQueue(items: readonly ReconstructionQueueItem[]): ReconstructionQueueGroups {
  const groups: ReconstructionQueueGroups = {
    byDirection: { reverse: 0, forward: 0, mixed: 0, unknown: 0 },
    byAmendments: { '0': 0, '1': 0, '2': 0, '3-5': 0, '6+': 0 },
    bySourceCompleteness: { complete: 0, partial: 0, unknown: 0 },
    byStatus: { queued: 0, 'recipe-draft': 0, imported: 0, 'blocked-uncertain': 0 },
    readyForRecipe: [],
    uncertainReasons: [],
  };
  const reasons = new Map<string, string[]>();
  for (const item of items) {
    groups.byDirection[(item.direction as keyof ReconstructionQueueGroups['byDirection'] | undefined) ?? 'unknown'] += 1;
    groups.byAmendments[amendmentBucket(item.amendments)] += 1;
    groups.bySourceCompleteness[item.sourceCompleteness === undefined ? 'unknown' : item.sourceCompleteness >= 1 ? 'complete' : 'partial'] += 1;
    groups.byStatus[item.status] += 1;
    if (item.status === 'queued' && item.sourceCompleteness === 1 && item.blockers.length === 0) groups.readyForRecipe.push(item.sourceIdentity);
    if (item.status === 'blocked-uncertain') {
      const pattern = uncertaintyPattern(item.blockers[0] ?? 'unbekannt');
      reasons.set(pattern, [...(reasons.get(pattern) ?? []), item.sourceIdentity]);
    }
  }
  groups.uncertainReasons = [...reasons.entries()].map(([pattern, identities]) => ({ pattern, identities })).sort((left, right) => right.identities.length - left.identities.length || left.pattern.localeCompare(right.pattern));
  return groups;
}

const TYPE_WEIGHT: Record<string, number> = { 'allgemeine-verwaltungsvorschrift': 30, verwaltungsvorschrift: 25, runderlass: 20, durchfuehrungserlass: 15, richtlinie: 15, 'sonstige-verwaltungsvorschrift': 10 };
const BROAD_SUBJECTS = /Beamt|Besoldung|Haushalt|Polizei|Schul|Hochschul|Steuer|Bau|Umwelt|Kommun|Ordnungsbeh|Datenschutz|Reisekosten|Beihilfe|Vergabe/u;

export function priorityFor(entry: ManifestEntry): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = TYPE_WEIGHT[entry.sourceDocumentType] ?? 10;
  factors.push(`Dokumenttyp ${entry.sourceDocumentType} (+${score})`);
  if (/\b(?:zum|zur|zu\s+§|zu\s+den)\b[^()]*?(?:gesetz|verordnung|ordnung)/iu.test(entry.sourceTitle)) {
    score += 10;
    factors.push('Vorschrift zu einem Gesetz oder einer Verordnung (+10)');
  }
  if (BROAD_SUBJECTS.test(entry.sourceTitle)) {
    score += 5;
    factors.push('breiter Anwenderkreis laut Titel (+5)');
  }
  const plan = entry.reconstructionPlan;
  if (plan) {
    if (plan.sourceCompleteness === 1) {
      score += 20;
      factors.push('alle Änderungsquellen zugeordnet (+20)');
    } else {
      factors.push(`Änderungsquellen unvollständig (${Math.round(plan.sourceCompleteness * 100)} %)`);
    }
    const effort = Math.min(20, Math.floor(plan.estimatedSteps / 5));
    if (effort > 0) {
      score -= effort;
      factors.push(`geschätzter Aufwand ${plan.estimatedSteps} Befehle (−${effort})`);
    }
  }
  return { score, factors };
}

export async function listRecipes(root: string): Promise<Set<string>> {
  try {
    return new Set((await readdir(join(root, RECONSTRUCTIONS_DIR))).filter((file) => /^term-\d+\.json$/u.test(file)).map((file) => `term:${file.slice(5, -5)}`));
  } catch {
    return new Set();
  }
}

export function buildReconstructionQueue(manifest: ImportManifest, review: ReviewQueue, recipes: ReadonlySet<string>): ReconstructionQueue {
  const items: ReconstructionQueueItem[] = [];
  for (const entry of manifest.entries.filter((candidate) => candidate.sourceArea === 'lrmb')) {
    const openUncertain = review.items.filter((item) => item.sourceIdentity === entry.sourceIdentity && item.status === 'open' && item.category === 'reconstruction-uncertain');
    const required = entry.reconstructionStatus === 'reconstruction-required' || entry.reconstructionStatus === 'reconstructed';
    if (!required && openUncertain.length === 0) continue;
    const recipePath = join(RECONSTRUCTIONS_DIR, `term-${entry.sourceIdentity.replace(/^term:/u, '')}.json`).replace(/\\/gu, '/');
    const recipeExists = recipes.has(entry.sourceIdentity);
    const imported = isImportedStatus(entry.importStatus) && entry.reconstructionStatus === 'reconstructed';
    const status: ReconstructionQueueItem['status'] = imported ? 'imported' : openUncertain.length > 0 ? 'blocked-uncertain' : recipeExists ? 'recipe-draft' : 'queued';
    const item: ReconstructionQueueItem = {
      sourceIdentity: entry.sourceIdentity,
      title: entry.sourceTitle,
      sourceDocumentType: entry.sourceDocumentType,
      category: openUncertain.length > 0 ? 'reconstruction-uncertain' : 'reconstruction-required',
      status,
      priority: priorityFor(entry),
      amendments: entry.reconstructionPlan?.amendments.length ?? entry.reconstructionSources.filter((source) => source.role === 'amendment').length,
      recipePath,
      recipeExists,
      blockers: openUncertain.map((review) => review.summary),
    };
    if (entry.reconstructionPlan) {
      item.sourceCompleteness = entry.reconstructionPlan.sourceCompleteness;
      item.direction = entry.reconstructionPlan.direction;
      item.estimatedSteps = entry.reconstructionPlan.estimatedSteps;
    }
    items.push(item);
  }
  items.sort((left, right) => right.priority.score - left.priority.score || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  return {
    schemaVersion: RECONSTRUCTION_QUEUE_SCHEMA,
    note: 'Priorität ist eine Arbeitshilfe (Dokumenttyp, Gesetzesbezug, Quellenlage, Aufwand), keine rechtliche Bewertung. Rezepte entstehen nur manuell oder assistiert und werden vor dem Import geprüft.',
    items,
    summary: { total: items.length, queued: items.filter((item) => item.status === 'queued').length, recipeDraft: items.filter((item) => item.status === 'recipe-draft').length, imported: items.filter((item) => item.status === 'imported').length, blockedUncertain: items.filter((item) => item.status === 'blocked-uncertain').length },
    groups: groupReconstructionQueue(items),
  };
}

export async function writeReconstructionQueue(root: string, queue: ReconstructionQueue): Promise<boolean> {
  return writeJsonAtomic(join(root, RECONSTRUCTION_QUEUE_PATH), queue);
}
