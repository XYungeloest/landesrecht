/**
 * Bewertung, Snippets und Zusammenführung von Suchtreffern. Die In-Memory-Bewertung wird vom
 * Dateistore vollständig und vom D1-Store zur Beschriftung der bereits gefundenen Seite
 * verwendet (identisches Prinzip wie OstRecht: SQL liefert Kandidaten und Reihenfolge, die
 * Bewertung liefert Treffart und beste Einheit).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormStatus, NormType } from '@landesrecht/legal-core/lib/schema.ts';
import type { VersionTemporalKind } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchVariants, normalizeSearchText, type QueryToken, type SearchQueryPlan, type SearchSort, type SearchState, type StructuralIntent } from './query.ts';
import { isSyntheticUnit, type SearchDocument, type SearchUnit } from './units.ts';

export type MatchKind = 'identity' | 'title' | 'reference' | 'unit' | 'body' | 'browse';

export const MATCH_LABELS: Record<MatchKind, string> = {
  identity: 'Bezeichnung',
  title: 'Titeltreffer',
  reference: 'Fundstelle',
  unit: 'Treffer im Normtext',
  body: 'Volltexttreffer',
  browse: 'Bestand',
};

export interface SearchHit {
  jurisdiction: JurisdictionId;
  slug: string;
  versionId: string;
  url: string;
  versionUrl: string;
  versionKind: VersionTemporalKind;
  title: string;
  shortTitle: string;
  abbr?: string;
  type: NormType;
  status: NormStatus;
  subjects: string[];
  citation: string;
  simulationValidFrom: string;
  simulationValidTo: string | null;
  lastChangeDate: string | null;
  matchKind: MatchKind;
  matchLabel: string;
  snippet: string;
  unit?: { anchor: string; label: string; heading: string; url: string; references?: SearchUnit['references'] };
  /** Interne Rangfolge (lexikografisch, kleiner = besser). */
  rank: number[];
}

export function textContainsVariant(text: string, token: QueryToken): boolean {
  const haystack = ` ${normalizeSearchText(text)} `;
  return token.variants.some((variant) => (token.prefix ? haystack.includes(` ${variant}`) : haystack.includes(` ${variant} `)));
}

export function textContainsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalizeSearchText(text)} `;
  return buildSearchVariants(phrase).some((variant) => haystack.includes(` ${variant} `));
}

export function unitMatchesIntent(unit: SearchUnit, intent: StructuralIntent): boolean {
  const references = unit.references;
  if (!references) return false;
  const subsectionMatches = !intent.subsection || references.subsections?.includes(intent.subsection) === true;
  if (intent.kind === 'paragraph') return references.paragraph === intent.number && subsectionMatches;
  if (intent.kind === 'article') return references.article === intent.number && subsectionMatches;
  return references.subsections?.includes(intent.number) === true;
}

function unitMatchesText(unit: SearchUnit, plan: SearchQueryPlan): boolean {
  const text = [unit.label, unit.heading, unit.body].join('\n');
  return plan.tokens.every((token) => textContainsVariant(text, token)) && plan.phrases.every((phrase) => textContainsPhrase(text, phrase));
}

export function buildSnippet(unit: Pick<SearchUnit, 'label' | 'heading' | 'body'>, limit = 300): string {
  let text = unit.body.replace(/\s+/g, ' ').trim();
  const prefixes = [`${unit.label} ${unit.heading}`, unit.heading, unit.label].map((entry) => entry.trim()).filter(Boolean);
  for (const prefix of prefixes) {
    const candidate = text.slice(0, prefix.length);
    const boundary = text.charAt(prefix.length);
    if (candidate.toLowerCase() === prefix.toLowerCase() && !/[\p{L}\p{N}]/u.test(boundary)) {
      text = text.slice(prefix.length).replace(/^[\s:.–—-]+/u, '');
      break;
    }
  }
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit);
  return `${text.slice(0, cut > limit / 2 ? cut : limit).trimEnd()}…`;
}

/** Bewertet ein Dokument gegen den Plan; `null`, wenn es die Anfrage nicht erfüllt. */
export function evaluateDocument(document: SearchDocument, plan: SearchQueryPlan): SearchHit | null {
  const provisionUnits = document.units.filter((unit) => !isSyntheticUnit(unit));
  const titleText = [document.title, document.shortTitle, document.abbr ?? '', ...document.aliases].join('\n');
  const allText = [titleText, ...document.units.map((unit) => `${unit.label}\n${unit.heading}\n${unit.body}`)].join('\n');

  let referenceUnit: SearchUnit | undefined;
  if (plan.references.length > 0) {
    const matching = provisionUnits.filter((unit) => plan.references.every((intent) => unitMatchesIntent(unit, intent)));
    if (matching.length === 0) return null;
    referenceUnit = matching[0];
  }

  const scopeText = plan.scope === 'title' ? titleText : allText;
  const tokensSatisfied = plan.tokens.every((token) => textContainsVariant(scopeText, token));
  const phrasesSatisfied = plan.phrases.every((phrase) => textContainsPhrase(scopeText, phrase));
  if (plan.freeText && (!tokensSatisfied || !phrasesSatisfied)) return null;

  const identityValues = [document.abbr, document.shortTitle, document.title, ...document.aliases].filter((entry): entry is string => Boolean(entry));
  const identityMatch = plan.identityVariants.length > 0 && identityValues.some((value) => buildSearchVariants(value).some((variant) => plan.identityVariants.includes(variant)));
  const titleMatch = plan.freeText && plan.tokens.every((token) => textContainsVariant(titleText, token)) && plan.phrases.every((phrase) => textContainsPhrase(titleText, phrase));
  const bestUnit = plan.freeText ? provisionUnits.find((unit) => unitMatchesText(unit, plan)) : undefined;

  let matchKind: MatchKind;
  let rank: number[];
  if (identityMatch) {
    matchKind = 'identity';
    rank = [0, document.abbr && plan.identityVariants.includes(normalizeSearchText(document.abbr)) ? 0 : 1];
  } else if (referenceUnit && (titleMatch || !plan.freeText)) {
    matchKind = 'reference';
    rank = [1, titleMatch ? 0 : 1];
  } else if (titleMatch) {
    matchKind = 'title';
    rank = [2];
  } else if (referenceUnit) {
    matchKind = 'reference';
    rank = [3];
  } else if (bestUnit) {
    matchKind = 'unit';
    rank = [4, bestUnit.index];
  } else if (plan.freeText) {
    matchKind = 'body';
    rank = [5];
  } else {
    matchKind = 'browse';
    rank = [6];
  }

  const unit = referenceUnit ?? bestUnit;
  const hit: SearchHit = {
    jurisdiction: document.jurisdiction,
    slug: document.slug,
    versionId: document.versionId,
    url: document.url,
    versionUrl: document.versionUrl,
    versionKind: document.versionKind,
    title: document.title,
    shortTitle: document.shortTitle,
    type: document.type,
    status: document.status,
    subjects: document.subjects,
    citation: document.citation,
    simulationValidFrom: document.simulationValidFrom,
    simulationValidTo: document.simulationValidTo,
    lastChangeDate: document.lastChangeDate,
    matchKind,
    matchLabel: MATCH_LABELS[matchKind],
    snippet: unit ? buildSnippet(unit) : (document.summary ?? buildSnippet({ label: '', heading: '', body: document.citation })),
    rank: [...rank, document.versionKind === 'current' ? 0 : 1],
  };
  if (document.abbr !== undefined) hit.abbr = document.abbr;
  if (unit) {
    const target = document.versionKind === 'current' ? document.url : document.versionUrl;
    hit.unit = { anchor: unit.anchor, label: unit.label, heading: unit.heading, url: `${target}#${unit.anchor}` };
    if (unit.references) hit.unit.references = unit.references;
  }
  return hit;
}

export function compareRank(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a - b;
  }
  return 0;
}

export function compareHits(left: SearchHit, right: SearchHit, sort: SearchSort): number {
  if (sort === 'title') return left.title.localeCompare(right.title, 'de') || left.jurisdiction.localeCompare(right.jurisdiction);
  if (sort === 'activity') {
    const activity = (right.lastChangeDate ?? right.simulationValidFrom).localeCompare(left.lastChangeDate ?? left.simulationValidFrom);
    return activity || left.title.localeCompare(right.title, 'de');
  }
  return compareRank(left.rank, right.rank) || left.title.localeCompare(right.title, 'de') || left.jurisdiction.localeCompare(right.jurisdiction);
}

export function documentMatchesFilters(document: SearchDocument, state: SearchState): boolean {
  if (state.jurisdictions.length > 0 && !state.jurisdictions.includes(document.jurisdiction)) return false;
  if (state.types.length > 0 && !state.types.includes(document.type)) return false;
  if (state.statuses.length > 0 && !state.statuses.includes(document.status)) return false;
  if (state.subjects.length > 0 && !state.subjects.some((subject) => document.subjects.includes(subject))) return false;
  if (state.validOn) {
    if (document.simulationValidFrom > state.validOn) return false;
    if (document.simulationValidTo !== null && document.simulationValidTo < state.validOn) return false;
  } else if (state.versionScope !== 'all' && document.versionKind !== state.versionScope) {
    return false;
  }
  return true;
}

export interface SearchResultPage {
  total: number;
  offset: number;
  limit: number;
  hits: SearchHit[];
}

/** Vollständige In-Memory-Suche über Dokumente (Dateistore, Tests). */
export function runSearch(documents: readonly SearchDocument[], state: SearchState, plan: SearchQueryPlan): SearchResultPage {
  const hits: SearchHit[] = [];
  for (const document of documents) {
    if (!documentMatchesFilters(document, state)) continue;
    const hit = evaluateDocument(document, plan);
    if (hit) hits.push(hit);
  }
  hits.sort((left, right) => compareHits(left, right, state.sort));
  return { total: hits.length, offset: state.offset, limit: state.limit, hits: hits.slice(state.offset, state.offset + state.limit) };
}

/**
 * Führt Ergebnisseiten mehrerer Stores (je Jurisdiktion eine D1-Datenbank) zusammen. Jeder
 * Store liefert seine ersten `offset + limit` Treffer sortiert; die Zusammenführung sortiert
 * global nach demselben Vergleich und schneidet die Seite aus.
 */
export function mergeSearchPages(pages: readonly SearchResultPage[], state: SearchState): SearchResultPage {
  const hits = pages.flatMap((page) => page.hits).sort((left, right) => compareHits(left, right, state.sort));
  return {
    total: pages.reduce((sum, page) => sum + page.total, 0),
    offset: state.offset,
    limit: state.limit,
    hits: hits.slice(state.offset, state.offset + state.limit),
  };
}
