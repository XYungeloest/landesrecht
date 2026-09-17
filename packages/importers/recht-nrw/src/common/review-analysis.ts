/**
 * Lesende Auswertung der Review-Queue (`data/imports/recht-nrw/review/**`) gegen das Manifest.
 *
 * Grundsatz: Zählen und gruppieren, nie entscheiden. 11 303 offene Befunde sind nicht 11 303 fehlende
 * Normen – ein Befund gehört zu einer Stammnorm (`sourceIdentity`), eine Stammnorm hat oft mehrere
 * Befunde, und nur blockierende Befunde verhindern die Übernahme. Deshalb weist die Auswertung aus:
 *
 *   - Befunde nach Status, Bereich, Kategorie, Schwere und fachlichem Schlüssel (generalisiert);
 *   - betroffene Stammnormen: mit Blocker (nicht übernommen) vs. nur nichtblockierend (übernommen, offen);
 *   - Kombinationen von Kategorien je Stammnorm; Verteilung „Befunde je Stammnorm“;
 *   - gruppierte Sichten (Deduplizierung nur in der Darstellung): Institutionen-Bezeichnungen über alle
 *     Normen, Parserbefunde nach Code und Meldungsmuster, Anlagenbefunde nach Bezeichnung.
 *
 * Nichts wird gelöscht oder zusammengelegt; jede Gruppe nennt ihre Stammnormen.
 */
import { compareSourceIdentity, type ImportManifest, type ManifestEntry, type SourceArea } from './manifest.ts';
import type { ReviewCategory, ReviewItem, ReviewQueue } from './review-queue.ts';

export const REVIEW_ANALYSIS_SCHEMA = 'recht-nrw-review-analysis/1' as const;

export interface CategoryCount {
  open: number;
  blocking: number;
}

export interface IdentitySummary {
  sourceIdentity: string;
  sourceArea: SourceArea;
  sourceUrl: string;
  title?: string;
  importStatus?: ManifestEntry['importStatus'];
  targetSlug?: string;
  sourceDocumentType?: string;
  sourceType?: string;
  baselineStatus?: ManifestEntry['baselineStatus'];
  textCompleteness?: ManifestEntry['textCompleteness'];
  reconstructionStatus?: ManifestEntry['reconstructionStatus'];
  open: number;
  blocking: number;
  categories: Partial<Record<ReviewCategory, CategoryCount>>;
  blockingCategories: ReviewCategory[];
  nonBlockingCategories: ReviewCategory[];
  /** Beispielhafte offene Befunde (Kennung, Kategorie, Kurzfassung). */
  examples: Array<{ id: string; category: ReviewCategory; severity: ReviewItem['severity']; summary: string }>;
}

export interface KeyPatternCount {
  pattern: string;
  open: number;
  blocking: number;
  identities: number;
  examples: string[];
}

export interface CategoryAnalysis {
  category: ReviewCategory;
  sourceArea: SourceArea;
  open: number;
  blocking: number;
  nonBlocking: number;
  identities: number;
  /** Stammnormen, bei denen diese Kategorie der einzige Blocker ist. */
  soleBlockerIdentities: number;
  keys: KeyPatternCount[];
}

export interface CombinationCount {
  categories: ReviewCategory[];
  identities: number;
  withBlocking: number;
  examples: string[];
}

export interface InstitutionTermGroup {
  term: string;
  detectionCategory: string;
  identities: number;
  occurrences: number;
  examples: string[];
}

export interface ReviewAnalysis {
  schemaVersion: typeof REVIEW_ANALYSIS_SCHEMA;
  generatedAt: string;
  totals: {
    items: number;
    open: number;
    openBlocking: number;
    openNonBlocking: number;
    decided: number;
    superseded: number;
    identities: number;
    identitiesWithBlocking: number;
    identitiesNonBlockingOnly: number;
    identitiesWithoutManifestEntry: number;
  };
  byStatus: Record<string, number>;
  byArea: Record<SourceArea, { open: number; blocking: number; identities: number; identitiesWithBlocking: number }>;
  byCategory: CategoryAnalysis[];
  combinations: CombinationCount[];
  findingsPerIdentity: Array<{ findings: number; identities: number }>;
  groups: {
    institutionTerms: InstitutionTermGroup[];
    parserFindings: KeyPatternCount[];
    attachments: KeyPatternCount[];
  };
  identities: IdentitySummary[];
}

/** Meldungen ohne Einzelwerte, damit gleichartige Befunde zusammenfallen (nur Darstellung). */
export function generalizeKey(key: string): string {
  return key
    .replace(/„[^“]*“/gu, '„…“')
    .replace(/"[^"]*"/gu, '„…“')
    .replace(/https?:\/\/\S+/gu, '<url>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/gu, '<datum>')
    .replace(/\b\d+(?:[.,]\d+)*\b/gu, '#')
    .replace(/\s+/gu, ' ')
    .trim();
}

function increment<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function keyPatterns(items: readonly ReviewItem[], keyOf: (item: ReviewItem) => string): KeyPatternCount[] {
  const groups = new Map<string, { open: number; blocking: number; identities: Set<string>; examples: string[] }>();
  for (const item of items) {
    const pattern = keyOf(item);
    const group = groups.get(pattern) ?? { open: 0, blocking: 0, identities: new Set<string>(), examples: [] };
    group.open += 1;
    if (item.severity === 'blocking') group.blocking += 1;
    group.identities.add(item.sourceIdentity);
    if (group.examples.length < 5 && !group.examples.includes(item.sourceIdentity)) group.examples.push(item.sourceIdentity);
    groups.set(pattern, group);
  }
  return [...groups.entries()]
    .map(([pattern, group]) => ({ pattern, open: group.open, blocking: group.blocking, identities: group.identities.size, examples: group.examples }))
    .sort((left, right) => right.open - left.open || left.pattern.localeCompare(right.pattern));
}

export function analyzeReviewQueue(queue: ReviewQueue, manifest: ImportManifest, now: string): ReviewAnalysis {
  const entries = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  const open = queue.items.filter((item) => item.status === 'open');
  const byStatus = new Map<string, number>();
  for (const item of queue.items) increment(byStatus, item.status);

  // --- Stammnormen ---------------------------------------------------------------------------
  const perIdentity = new Map<string, ReviewItem[]>();
  for (const item of open) perIdentity.set(item.sourceIdentity, [...(perIdentity.get(item.sourceIdentity) ?? []), item]);
  const identities: IdentitySummary[] = [];
  for (const [sourceIdentity, items] of perIdentity) {
    const entry = entries.get(sourceIdentity);
    const categories: IdentitySummary['categories'] = {};
    for (const item of items) {
      const count = categories[item.category] ?? { open: 0, blocking: 0 };
      count.open += 1;
      if (item.severity === 'blocking') count.blocking += 1;
      categories[item.category] = count;
    }
    const categoryNames = Object.keys(categories).sort() as ReviewCategory[];
    const summary: IdentitySummary = {
      sourceIdentity,
      sourceArea: items[0]!.sourceArea,
      sourceUrl: items[0]!.sourceUrl,
      open: items.length,
      blocking: items.filter((item) => item.severity === 'blocking').length,
      categories,
      blockingCategories: categoryNames.filter((category) => (categories[category]?.blocking ?? 0) > 0),
      nonBlockingCategories: categoryNames.filter((category) => (categories[category]?.blocking ?? 0) === 0),
      examples: [...items].sort((left, right) => (left.severity === right.severity ? left.id.localeCompare(right.id) : left.severity === 'blocking' ? -1 : 1)).slice(0, 4).map((item) => ({ id: item.id, category: item.category, severity: item.severity, summary: item.summary.slice(0, 200) })),
    };
    const targetSlug = items.find((item) => item.targetSlug)?.targetSlug ?? entry?.targetSlug;
    if (targetSlug) summary.targetSlug = targetSlug;
    if (entry) {
      summary.title = entry.sourceTitle;
      summary.importStatus = entry.importStatus;
      summary.sourceDocumentType = entry.sourceDocumentType;
      summary.sourceType = entry.sourceType;
      summary.baselineStatus = entry.baselineStatus;
      summary.reconstructionStatus = entry.reconstructionStatus;
      if (entry.textCompleteness) summary.textCompleteness = entry.textCompleteness;
    }
    identities.push(summary);
  }
  identities.sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));

  // --- Kategorien je Bereich -----------------------------------------------------------------
  const byCategory: CategoryAnalysis[] = [];
  const categoryAreaKeys = [...new Set(open.map((item) => `${item.sourceArea}|${item.category}`))].sort();
  for (const key of categoryAreaKeys) {
    const [sourceArea, category] = key.split('|') as [SourceArea, ReviewCategory];
    const items = open.filter((item) => item.sourceArea === sourceArea && item.category === category);
    const identitySet = new Set(items.map((item) => item.sourceIdentity));
    const soleBlocker = identities.filter((summary) => summary.sourceArea === sourceArea && summary.blockingCategories.length === 1 && summary.blockingCategories[0] === category).length;
    byCategory.push({
      category,
      sourceArea,
      open: items.length,
      blocking: items.filter((item) => item.severity === 'blocking').length,
      nonBlocking: items.filter((item) => item.severity !== 'blocking').length,
      identities: identitySet.size,
      soleBlockerIdentities: soleBlocker,
      keys: keyPatterns(items, (item) => generalizeKey(item.key)),
    });
  }
  byCategory.sort((left, right) => right.open - left.open || left.category.localeCompare(right.category));

  // --- Kombinationen und Verteilung -----------------------------------------------------------
  const combinationMap = new Map<string, { identities: number; withBlocking: number; examples: string[] }>();
  const distribution = new Map<number, number>();
  for (const summary of identities) {
    const key = Object.keys(summary.categories).sort().join('+');
    const group = combinationMap.get(key) ?? { identities: 0, withBlocking: 0, examples: [] };
    group.identities += 1;
    if (summary.blocking > 0) group.withBlocking += 1;
    if (group.examples.length < 3) group.examples.push(summary.sourceIdentity);
    combinationMap.set(key, group);
    increment(distribution, summary.open);
  }
  const combinations: CombinationCount[] = [...combinationMap.entries()]
    .map(([key, group]) => ({ categories: key.split('+') as ReviewCategory[], ...group }))
    .sort((left, right) => right.identities - left.identities || left.categories.join('+').localeCompare(right.categories.join('+')));

  // --- Gruppierte Sichten --------------------------------------------------------------------
  const institutionMap = new Map<string, InstitutionTermGroup & { identitySet: Set<string> }>();
  for (const item of open.filter((candidate) => candidate.category === 'institution-mapping' && candidate.key.startsWith('detections:'))) {
    const detectionCategory = item.key.slice('detections:'.length);
    for (const detail of item.details) {
      const match = /^(.*?)\s+×(\d+)\s+\(/u.exec(detail);
      if (!match) continue;
      const term = match[1]!.trim();
      const key = `${detectionCategory}|${term}`;
      const group = institutionMap.get(key) ?? { term, detectionCategory, identities: 0, occurrences: 0, examples: [], identitySet: new Set<string>() };
      group.identitySet.add(item.sourceIdentity);
      group.occurrences += Number(match[2]);
      if (group.examples.length < 5 && !group.examples.includes(item.sourceIdentity)) group.examples.push(item.sourceIdentity);
      institutionMap.set(key, group);
    }
  }
  const institutionTerms = [...institutionMap.values()]
    .map(({ identitySet, ...group }) => ({ ...group, identities: identitySet.size }))
    .sort((left, right) => right.identities - left.identities || right.occurrences - left.occurrences || left.term.localeCompare(right.term));

  const parserItems = open.filter((item) => item.category === 'unknown-structure' || item.category === 'text-integrity');
  const attachmentItems = open.filter((item) => item.category === 'attachment');

  const areas: ReviewAnalysis['byArea'] = { lrgv: { open: 0, blocking: 0, identities: 0, identitiesWithBlocking: 0 }, lrmb: { open: 0, blocking: 0, identities: 0, identitiesWithBlocking: 0 } };
  for (const item of open) {
    areas[item.sourceArea].open += 1;
    if (item.severity === 'blocking') areas[item.sourceArea].blocking += 1;
  }
  for (const summary of identities) {
    areas[summary.sourceArea].identities += 1;
    if (summary.blocking > 0) areas[summary.sourceArea].identitiesWithBlocking += 1;
  }

  return {
    schemaVersion: REVIEW_ANALYSIS_SCHEMA,
    generatedAt: now,
    totals: {
      items: queue.items.length,
      open: open.length,
      openBlocking: open.filter((item) => item.severity === 'blocking').length,
      openNonBlocking: open.filter((item) => item.severity !== 'blocking').length,
      decided: queue.items.filter((item) => item.status !== 'open' && item.status !== 'superseded').length,
      superseded: byStatus.get('superseded') ?? 0,
      identities: identities.length,
      identitiesWithBlocking: identities.filter((summary) => summary.blocking > 0).length,
      identitiesNonBlockingOnly: identities.filter((summary) => summary.blocking === 0).length,
      identitiesWithoutManifestEntry: identities.filter((summary) => !entries.has(summary.sourceIdentity)).length,
    },
    byStatus: Object.fromEntries([...byStatus.entries()].sort()),
    byArea: areas,
    byCategory,
    combinations,
    findingsPerIdentity: [...distribution.entries()].sort((left, right) => left[0] - right[0]).map(([findings, count]) => ({ findings, identities: count })),
    groups: {
      institutionTerms,
      parserFindings: keyPatterns(parserItems, (item) => `${item.sourceArea} ${generalizeKey(item.key)}`),
      attachments: keyPatterns(attachmentItems, (item) => `${item.sourceArea} ${generalizeKey(item.key)}`),
    },
    identities,
  };
}
