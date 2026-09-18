/**
 * Golden Query Set der Suche: systematisch aus bekannten West-Normen erzeugte Anfragen (exakte Titel, Teiltitel,
 * Abkürzungen, §-/Artikel-/Nummernadressen, häufige Wörter, Umlautvarianten, Tippfehler, ähnliche Titel, lange Titel,
 * Verordnungen, Verwaltungsvorschriften, Bundesrechtsreferenzen, Nulltreffer) mit erwarteten Treffern, dazu die
 * Metriken Recall@10, MRR und Top-1 je Kategorie und Match-Modus. Die Datei data/audits/recht-nrw/search/
 * golden-queries.json ist der Vertrag (einmal erzeugt, danach von Hand gepflegt); die Auswertung läuft lokal gegen
 * die projizierte SQLite-Datenbank, die Remote-Stichprobe gegen /api/v1/search einer laufenden Instanz (nur auf
 * ausdrücklichen Wunsch).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { ADMINISTRATIVE_REGULATION_TYPES, type NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument } from '@landesrecht/search/index.ts';
import { createSearchState, DEFAULT_SEARCH_MATCH_MODE, extractStructuralIntents, normalizeSearchText, SEARCH_MATCH_MODES, transliterateGermanUmlauts, type SearchMatchMode } from '@landesrecht/search/query.ts';
import type { SearchHit } from '@landesrecht/search/ranking.ts';

import type { Io } from '../cli.ts';
import { isSyntheticFixture, projectCorpus, queryText, seededHash, type SearchAuditResult } from './search-audit.ts';

export const SEARCH_AUDIT_DIR = 'data/audits/recht-nrw/search';
export const GOLDEN_QUERIES_PATH = `${SEARCH_AUDIT_DIR}/golden-queries.json`;
export const GOLDEN_RESULTS_JSON_PATH = `${SEARCH_AUDIT_DIR}/golden-results.json`;
export const GOLDEN_RESULTS_MD_PATH = `${SEARCH_AUDIT_DIR}/golden-results.md`;
export const REMOTE_SAMPLE_RESULTS_PATH = `${SEARCH_AUDIT_DIR}/remote-sample-results.json`;
export const GOLDEN_TOP_K = 10;
/** Mindestzahl der Fälle der Remote-Stichprobe. */
export const REMOTE_SAMPLE_MIN_CASES = 50;

export const GOLDEN_CATEGORIES = [
  'exact-title', 'partial-title', 'abbreviation', 'abbreviation-lowercase', 'paragraph-address', 'article-address', 'lrmb-number',
  'common-word', 'umlaut-variant', 'typo', 'similar-title', 'long-title', 'verordnung-title', 'vwv-title', 'federal-reference', 'null-result',
] as const;
export type GoldenCategory = (typeof GOLDEN_CATEGORIES)[number];

export interface GoldenQuery {
  id: string;
  category: GoldenCategory;
  query: string;
  /** Erwartet als erster Treffer (jeder dieser Slugs genügt). */
  expectedTop: string[];
  /** Weitere Slugs, die unter den ersten GOLDEN_TOP_K zählen. */
  acceptable: string[];
  /** Erwartetes Sprungziel des Treffers (Strukturadressen). */
  expectedAnchor?: string;
  /** Erwartete Gesamtzahl (Nulltreffer). */
  expectTotal?: number;
  /** Nur Treffer erwartet, keine bestimmte Norm (häufige Wörter). */
  expectHits?: boolean;
  /** Erwartung ist ein Wunsch, kein Vertrag (Tippfehler ohne Fuzzy-Suche). */
  niceToHave?: boolean;
  note?: string;
}

export interface GoldenQuerySet {
  description: string;
  seed: string;
  jurisdiction: 'west';
  queries: GoldenQuery[];
}

export function parseSearchMatchMode(value: string): SearchMatchMode {
  if (!(SEARCH_MATCH_MODES as readonly string[]).includes(value)) throw new Error(`--match erwartet ${SEARCH_MATCH_MODES.join('|')}`);
  return value as SearchMatchMode;
}

/* ------------------------------------------------------------------------------------------ */
/* Erzeugung                                                                                   */

const STOPWORDS = new Set(['der', 'die', 'das', 'des', 'dem', 'den', 'und', 'oder', 'fur', 'fuer', 'uber', 'ueber', 'von', 'vom', 'zur', 'zum', 'zu', 'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'durch', 'sowie', 'gemass', 'gemaess', 'land', 'landes', 'westdeutschland', 'west', 'gesetz', 'gesetzes', 'verordnung', 'uber', 'ausfuhrung', 'ausfuehrung']);

function contentWords(title: string): string[] {
  return [...new Set(normalizeSearchText(title).split(' ').filter((word) => word.length >= 6 && !STOPWORDS.has(word) && !/^\d+$/u.test(word)))];
}

function stripUmlauts(value: string): string {
  return value.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/Ä/g, 'A').replace(/Ö/g, 'O').replace(/Ü/g, 'U').replace(/ß/g, 'ss');
}

function hasUmlaut(value: string): boolean {
  return /[äöüÄÖÜß]/u.test(value);
}

/** Ein Tippfehler: ein Buchstabe im Wortinneren entfällt. */
function introduceTypo(word: string): string {
  const index = Math.floor(word.length / 2);
  return `${word.slice(0, index)}${word.slice(index + 1)}`;
}

/** Deterministische Erzeugung des Golden Sets aus dem Produktionsbestand. Gleicher Seed und Bestand → gleiche Datei. */
export function generateGoldenQueries(records: readonly NormRecord[], seed = 'golden'): GoldenQuerySet {
  const norms = records.filter((record) => !isSyntheticFixture(record)).sort((left, right) => seededHash(seed, left.meta.slug) - seededHash(seed, right.meta.slug) || left.meta.slug.localeCompare(right.meta.slug));
  const titleCounts = new Map<string, number>();
  const abbrCounts = new Map<string, number>();
  for (const norm of norms) {
    const title = normalizeSearchText(norm.meta.title);
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    if (norm.meta.abbr) abbrCounts.set(normalizeSearchText(norm.meta.abbr), (abbrCounts.get(normalizeSearchText(norm.meta.abbr)) ?? 0) + 1);
  }
  const uniqueTitle = (norm: NormRecord): boolean => titleCounts.get(normalizeSearchText(norm.meta.title)) === 1;
  const uniqueAbbr = (norm: NormRecord): boolean => Boolean(norm.meta.abbr) && abbrCounts.get(normalizeSearchText(norm.meta.abbr!)) === 1;
  const unitsOf = new Map<string, ReturnType<typeof buildSearchDocument>['units']>();
  const units = (norm: NormRecord) => {
    let cached = unitsOf.get(norm.meta.slug);
    if (!cached) {
      cached = buildSearchDocument(norm, getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE), EDITORIAL_REFERENCE_DATE).units;
      unitsOf.set(norm.meta.slug, cached);
    }
    return cached;
  };
  const administrative = (norm: NormRecord): boolean => (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(norm.meta.type);
  const used = new Set<string>();
  const pick = (predicate: (norm: NormRecord) => boolean, count: number, allowReuse = false): NormRecord[] => {
    const chosen: NormRecord[] = [];
    for (const norm of norms) {
      if (chosen.length >= count) break;
      if ((!allowReuse && used.has(norm.meta.slug)) || !predicate(norm)) continue;
      chosen.push(norm);
    }
    if (chosen.length < count && !allowReuse) chosen.push(...pick(predicate, count - chosen.length, true).filter((norm) => !chosen.includes(norm)));
    for (const norm of chosen) used.add(norm.meta.slug);
    return chosen;
  };
  const queries: GoldenQuery[] = [];
  const counters = new Map<GoldenCategory, number>();
  const add = (category: GoldenCategory, entry: Omit<GoldenQuery, 'id' | 'category'>): void => {
    const index = (counters.get(category) ?? 0) + 1;
    counters.set(category, index);
    queries.push({ id: `${category}-${String(index).padStart(2, '0')}`, category, ...entry });
  };
  const identityOf = (norm: NormRecord): string => extractStructuralIntents(norm.meta.abbr ?? norm.meta.shortTitle ?? norm.meta.title).remaining.replace(/\s+/gu, ' ').trim() || norm.meta.title;
  /** Die Bezeichnung, mit der Adressen gebildet werden, ist im Bestand eindeutig und wird in der Anfrage nicht gekürzt. */
  const identityCounts = new Map<string, number>();
  for (const norm of norms) identityCounts.set(normalizeSearchText(queryText(identityOf(norm))), (identityCounts.get(normalizeSearchText(queryText(identityOf(norm)))) ?? 0) + 1);
  const uniqueIdentity = (norm: NormRecord): boolean => identityCounts.get(normalizeSearchText(queryText(identityOf(norm)))) === 1 && queryText(`Nr. 1.1 ${identityOf(norm)}`).length === `Nr. 1.1 ${identityOf(norm)}`.length;

  // Feste Referenzfälle aus der Messung (falls im Bestand): LÖG West, DVO KiBiz, Landesverfassung.
  for (const [slug, category] of [['loeg-west', 'abbreviation'], ['dvo-kibiz-west', 'abbreviation'], ['verfassung-fuer-das-land-westdeutschland', 'exact-title']] as const) {
    const norm = norms.find((entry) => entry.meta.slug === slug);
    if (!norm) continue;
    used.add(slug);
    add(category, { query: category === 'abbreviation' ? norm.meta.abbr ?? norm.meta.title : queryText(norm.meta.title), expectedTop: [slug], acceptable: [], note: 'Referenzfall der Laufzeitmessung' });
    if (category === 'abbreviation' && norm.meta.abbr) {
      const provision = units(norm).find((unit) => unit.references?.paragraph);
      if (provision?.references?.paragraph) add('paragraph-address', { query: `§ ${provision.references.paragraph} ${norm.meta.abbr}`, expectedTop: [slug], acceptable: [], expectedAnchor: provision.anchor, note: 'Referenzfall der Laufzeitmessung' });
    }
  }

  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'gesetz', 8)) add('exact-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [] });
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'verordnung', 5)) add('verordnung-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [] });
  for (const norm of pick((entry) => uniqueTitle(entry) && administrative(entry), 6)) add('vwv-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: units(norm).some((unit) => unit.references?.number) ? 'LRMB-Vorschrift mit Nummerngliederung' : undefined } as Omit<GoldenQuery, 'id' | 'category'>);
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.title.length > 150, 4)) add('long-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: `${norm.meta.title.length} Zeichen${norm.meta.title.length > 200 ? ', auf 200 Zeichen gekürzt' : ''}` });

  for (const norm of pick((entry) => contentWords(entry.meta.title).length >= 2, 8)) {
    const words = contentWords(norm.meta.title).slice(0, 3);
    const matching = norms.filter((entry) => words.every((word) => normalizeSearchText(entry.meta.title).split(' ').includes(word)));
    const original = norm.meta.title.split(/\s+/u).filter((token) => words.includes(normalizeSearchText(token)));
    add('partial-title', { query: original.join(' '), expectedTop: matching.length === 1 ? [norm.meta.slug] : [], acceptable: [norm.meta.slug], note: matching.length === 1 ? 'Wortkombination im Bestand eindeutig' : `${matching.length} Titel enthalten alle Wörter` });
  }

  for (const norm of pick((entry) => uniqueAbbr(entry), 8)) add('abbreviation', { query: norm.meta.abbr!, expectedTop: [norm.meta.slug], acceptable: [] });
  for (const norm of pick((entry) => uniqueAbbr(entry) && entry.meta.abbr!.toLowerCase() !== entry.meta.abbr!, 3)) add('abbreviation-lowercase', { query: norm.meta.abbr!.toLowerCase(), expectedTop: [norm.meta.slug], acceptable: [] });

  for (const norm of pick((entry) => uniqueAbbr(entry) && hasUmlaut(entry.meta.abbr!), 3)) {
    add('umlaut-variant', { query: transliterateGermanUmlauts(norm.meta.abbr!), expectedTop: [norm.meta.slug], acceptable: [], note: `ae/oe/ue-Schreibung von „${norm.meta.abbr}“` });
  }
  for (const norm of pick((entry) => uniqueTitle(entry) && hasUmlaut(entry.meta.title) && entry.meta.title.length <= 120, 3)) {
    add('umlaut-variant', { query: transliterateGermanUmlauts(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'ae/oe/ue-Schreibung des Titels' });
    add('umlaut-variant', { query: stripUmlauts(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'Titel ohne Umlautpunkte (a/o/u)' });
  }

  for (const norm of pick((entry) => uniqueAbbr(entry) && units(entry).some((unit) => unit.references?.paragraph), 7)) {
    const provisions = units(norm).filter((unit) => unit.references?.paragraph);
    const provision = provisions[Math.min(provisions.length - 1, 2)]!;
    add('paragraph-address', { query: `§ ${provision.references!.paragraph} ${norm.meta.abbr}`, expectedTop: [norm.meta.slug], acceptable: [], expectedAnchor: provision.anchor });
  }
  for (const norm of pick((entry) => uniqueIdentity(entry) && units(entry).some((unit) => unit.references?.article), 3)) {
    const provision = units(norm).find((unit) => unit.references?.article)!;
    add('article-address', { query: queryText(`Art. ${provision.references!.article} ${identityOf(norm)}`), expectedTop: [norm.meta.slug], acceptable: [], expectedAnchor: provision.anchor });
  }
  for (const norm of pick((entry) => administrative(entry) && uniqueIdentity(entry) && units(entry).some((unit) => unit.references?.number?.includes('.')), 5)) {
    const numbered = units(norm).filter((unit) => unit.references?.number);
    const unit = numbered.find((entry) => entry.references!.number!.includes('.')) ?? numbered[0]!;
    add('lrmb-number', { query: queryText(`Nr. ${unit.references!.number} ${identityOf(norm)}`), expectedTop: [norm.meta.slug], acceptable: [], expectedAnchor: unit.anchor });
  }

  for (const word of ['West', 'Gesetz', 'Verordnung', 'Land Westdeutschland']) add('common-word', { query: word, expectedTop: [], acceptable: [], expectHits: true, note: 'häufiges Wort: nur Laufzeit und Trefferzahl' });

  // Das Tippfehlerwort muss als eigenes Titelwort vorkommen; ein erst durch die Normalisierung entstandenes Wort
  // (Bindestrichkompositum wie „Bayern-Württembergischen“) hat kein Original, das sich verändern ließe.
  const typoToken = (title: string): string | undefined => {
    const word = contentWords(title).find((entry) => entry.length >= 9);
    return word === undefined ? undefined : title.split(/\s+/u).find((token) => normalizeSearchText(token) === word);
  };
  for (const norm of pick((entry) => uniqueTitle(entry) && typoToken(entry.meta.title) !== undefined, 5)) {
    const original = typoToken(norm.meta.title)!;
    add('typo', { query: queryText(norm.meta.title.replace(original, introduceTypo(original))), expectedTop: [], acceptable: [norm.meta.slug], niceToHave: true, note: `„${original}“ → „${introduceTypo(original)}“ (keine Fuzzy-Suche)` });
  }

  const prefixGroups = new Map<string, NormRecord[]>();
  for (const norm of norms) {
    const key = normalizeSearchText(norm.meta.title).split(' ').slice(0, 4).join(' ');
    if (key.split(' ').length < 4) continue;
    prefixGroups.set(key, [...(prefixGroups.get(key) ?? []), norm]);
  }
  let similar = 0;
  for (const group of prefixGroups.values()) {
    if (similar >= 5 || group.length < 2 || !uniqueTitle(group[0]!)) continue;
    const [first, second] = group;
    if (used.has(first!.meta.slug)) continue;
    used.add(first!.meta.slug);
    add('similar-title', { query: queryText(first!.meta.title), expectedTop: [first!.meta.slug], acceptable: [second!.meta.slug], note: `${group.length} Titel beginnen gleich („${first!.meta.title.split(/\s+/u).slice(0, 4).join(' ')} …“)` });
    similar += 1;
  }

  for (const norm of pick((entry) => Boolean(entry.meta.abbr && /^AG\s+\S/u.test(entry.meta.abbr)), 4)) {
    const federal = norm.meta.abbr!.replace(/^AG\s+/u, '');
    add('federal-reference', { query: federal, expectedTop: [], acceptable: [norm.meta.slug], note: `Bundesgesetz „${federal}“: Ausführungsgesetz des Landes soll erscheinen` });
  }
  add('federal-reference', { query: 'Grundgesetz', expectedTop: [], acceptable: [], expectHits: true, note: 'Bundesrecht ohne Landesnorm: nur Laufzeit' });

  for (const query of ['Quantenflugzeugsteuer', 'xyzzy plugh', '§ 999 Zzzgesetz', 'Nr. 9.9.9 Zzzvorschrift']) add('null-result', { query, expectedTop: [], acceptable: [], expectTotal: 0 });

  return { description: 'Golden Query Set der West-Suche (erzeugt aus dem Produktionsbestand; Erwartungen von Hand prüfbar)', seed, jurisdiction: 'west', queries };
}

export async function readGoldenQueries(root: string): Promise<GoldenQuerySet> {
  return JSON.parse(await readFile(join(root, GOLDEN_QUERIES_PATH), 'utf8')) as GoldenQuerySet;
}

/* ------------------------------------------------------------------------------------------ */
/* Auswertung                                                                                   */

export interface GoldenQueryOutcome {
  id: string;
  category: GoldenCategory;
  query: string;
  ms: number;
  total: number;
  hits: string[];
  /** Rang (1-basiert) des ersten erwarteten/akzeptablen Treffers; null, wenn keiner unter den ersten GOLDEN_TOP_K. */
  rank: number | null;
  top1: boolean | null;
  recall: boolean | null;
  anchorOk: boolean | null;
  totalOk: boolean | null;
  hitsOk: boolean | null;
  /** Eine Erwartung ist verletzt (nicht bei niceToHave). */
  failed: boolean;
}

export interface GoldenMetrics {
  queries: number;
  /** Anteil der Anfragen mit Erwartung, bei denen ein erwarteter Slug unter den ersten GOLDEN_TOP_K liegt. */
  recallAt10: number | null;
  mrr: number | null;
  /** Anteil der Anfragen mit `expectedTop`, deren erster Treffer erwartet ist. */
  top1: number | null;
  anchorOk: number | null;
  nullOk: number | null;
  failed: number;
  latencyMs: { p50: number; p95: number; max: number; mean: number };
}

export interface GoldenEvaluation {
  matchMode: SearchMatchMode;
  evaluatedAt: string;
  overall: GoldenMetrics;
  categories: Partial<Record<GoldenCategory, GoldenMetrics>>;
  outcomes: GoldenQueryOutcome[];
}

export type SearchRunner = (query: GoldenQuery) => Promise<{ total: number; hits: Array<Pick<SearchHit, 'slug'> & { unit?: { anchor: string } | undefined }> }>;

export function judgeOutcome(query: GoldenQuery, page: { total: number; hits: Array<Pick<SearchHit, 'slug'> & { unit?: { anchor: string } | undefined }> }, ms: number): GoldenQueryOutcome {
  const hits = page.hits.slice(0, GOLDEN_TOP_K).map((hit) => hit.slug);
  const expected = new Set([...query.expectedTop, ...query.acceptable]);
  const rankIndex = hits.findIndex((slug) => expected.has(slug));
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const top1 = query.expectedTop.length > 0 ? query.expectedTop.includes(hits[0] ?? '') : null;
  const recall = expected.size > 0 ? rank !== null : null;
  const hit = page.hits.find((entry) => expected.has(entry.slug));
  const anchorOk = query.expectedAnchor ? (hit?.unit?.anchor ?? null) === query.expectedAnchor : null;
  const totalOk = query.expectTotal !== undefined ? page.total === query.expectTotal : null;
  const hitsOk = query.expectHits ? page.total > 0 : null;
  const failed = !query.niceToHave && (top1 === false || recall === false || anchorOk === false || totalOk === false || hitsOk === false);
  return { id: query.id, category: query.category, query: query.query, ms: Math.round(ms * 10) / 10, total: page.total, hits, rank, top1, recall, anchorOk, totalOk, hitsOk, failed };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]!;
}

function ratio(values: Array<boolean | null>): number | null {
  const defined = values.filter((value): value is boolean => value !== null);
  return defined.length === 0 ? null : Number((defined.filter(Boolean).length / defined.length).toFixed(3));
}

export function computeGoldenMetrics(outcomes: readonly GoldenQueryOutcome[]): GoldenMetrics {
  const withExpectation = outcomes.filter((outcome) => outcome.recall !== null);
  const latencies = outcomes.map((outcome) => outcome.ms);
  return {
    queries: outcomes.length,
    recallAt10: ratio(outcomes.map((outcome) => outcome.recall)),
    mrr: withExpectation.length === 0 ? null : Number((withExpectation.reduce((sum, outcome) => sum + (outcome.rank ? 1 / outcome.rank : 0), 0) / withExpectation.length).toFixed(3)),
    top1: ratio(outcomes.map((outcome) => outcome.top1)),
    anchorOk: ratio(outcomes.map((outcome) => outcome.anchorOk)),
    nullOk: ratio(outcomes.map((outcome) => outcome.totalOk)),
    failed: outcomes.filter((outcome) => outcome.failed).length,
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: Math.max(0, ...latencies), mean: latencies.length ? Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 10) / 10 : 0 },
  };
}

export async function evaluateGoldenQueries(queries: readonly GoldenQuery[], run: SearchRunner, matchMode: SearchMatchMode): Promise<GoldenEvaluation> {
  const outcomes: GoldenQueryOutcome[] = [];
  for (const query of queries) {
    const started = performance.now();
    const page = await run(query);
    outcomes.push(judgeOutcome(query, page, performance.now() - started));
  }
  const categories: Partial<Record<GoldenCategory, GoldenMetrics>> = {};
  for (const category of GOLDEN_CATEGORIES) {
    const own = outcomes.filter((outcome) => outcome.category === category);
    if (own.length > 0) categories[category] = computeGoldenMetrics(own);
  }
  return { matchMode, evaluatedAt: new Date().toISOString(), overall: computeGoldenMetrics(outcomes), categories, outcomes };
}

/** Auswertung gegen die lokale Projektion in beiden (oder einem) Match-Modus. */
export async function evaluateGoldenLocally(root: string, set: GoldenQuerySet, modes: readonly SearchMatchMode[]): Promise<GoldenEvaluation[]> {
  const corpus = await projectCorpus(root);
  try {
    const store = corpus.stores.west!;
    const evaluations: GoldenEvaluation[] = [];
    for (const matchMode of modes) {
      // Aufwärmen: erste Abfrage baut Statement-Caches auf und verzerrt sonst die Latenz.
      await store.search(createSearchState({ q: 'Aufwärmen', jurisdictions: ['west'], limit: 1, matchMode }));
      evaluations.push(await evaluateGoldenQueries(set.queries, (query) => store.search(createSearchState({ q: query.query, jurisdictions: ['west'], limit: GOLDEN_TOP_K, matchMode })), matchMode));
    }
    return evaluations;
  } finally {
    corpus.close();
  }
}

function formatRatio(value: number | null): string {
  return value === null ? '–' : `${(value * 100).toFixed(1)} %`;
}

export function renderGoldenMarkdown(set: GoldenQuerySet, evaluations: readonly GoldenEvaluation[]): string {
  const lines: string[] = [];
  lines.push('# Golden Query Set – Ergebnisse', '', `Stand: ${evaluations[0]?.evaluatedAt ?? ''} · ${set.queries.length} Anfragen (${GOLDEN_QUERIES_PATH}) · lokale SQLite-Projektion des West-Bestands · Top-${GOLDEN_TOP_K}`, '');
  lines.push('| Modus | Recall@10 | MRR | Top-1 | Sprungziel | Nulltreffer | Verletzt | p50 ms | p95 ms | max ms |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const evaluation of evaluations) {
    const m = evaluation.overall;
    lines.push(`| ${evaluation.matchMode} | ${formatRatio(m.recallAt10)} | ${m.mrr ?? '–'} | ${formatRatio(m.top1)} | ${formatRatio(m.anchorOk)} | ${formatRatio(m.nullOk)} | ${m.failed} | ${m.latencyMs.p50} | ${m.latencyMs.p95} | ${m.latencyMs.max} |`);
  }
  lines.push('', '## Je Kategorie', '');
  lines.push(`| Kategorie | n | ${evaluations.map((evaluation) => `${evaluation.matchMode}: Recall@10 / MRR / Top-1 / verletzt / p95 ms`).join(' | ')} |`, `|---|---|${evaluations.map(() => '---').join('|')}|`);
  for (const category of GOLDEN_CATEGORIES) {
    const cells = evaluations.map((evaluation) => {
      const m = evaluation.categories[category];
      return m ? `${formatRatio(m.recallAt10)} / ${m.mrr ?? '–'} / ${formatRatio(m.top1)} / ${m.failed} / ${m.latencyMs.p95}` : '–';
    });
    const n = evaluations[0]?.categories[category]?.queries ?? 0;
    if (n > 0) lines.push(`| ${category} | ${n} | ${cells.join(' | ')} |`);
  }
  const failures = evaluations.flatMap((evaluation) => evaluation.outcomes.filter((outcome) => outcome.failed).map((outcome) => `- ${evaluation.matchMode} · ${outcome.id} „${outcome.query}“: Rang ${outcome.rank ?? '–'}, Treffer ${outcome.hits.slice(0, 3).join(', ') || '–'} (${outcome.total} gesamt)${outcome.anchorOk === false ? ', Sprungziel falsch' : ''}`));
  lines.push('', '## Verletzte Erwartungen', '', ...(failures.length ? failures : ['keine']), '');
  const differences = evaluations.length > 1
    ? evaluations[0]!.outcomes.flatMap((left) => {
        const right = evaluations[1]!.outcomes.find((outcome) => outcome.id === left.id);
        return right && (left.rank !== right.rank || left.total !== right.total) ? [`- ${left.id} „${left.query}“: ${evaluations[0]!.matchMode} Rang ${left.rank ?? '–'} / ${left.total} gesamt → ${evaluations[1]!.matchMode} Rang ${right.rank ?? '–'} / ${right.total} gesamt`] : [];
      })
    : [];
  if (evaluations.length > 1) lines.push('## Unterschiede zwischen den Modi (Rang oder Trefferzahl)', '', ...(differences.length ? differences : ['keine']), '');
  return lines.join('\n');
}

/* ------------------------------------------------------------------------------------------ */
/* Befehle                                                                                     */

export async function writeSearchAuditResult(root: string, result: SearchAuditResult): Promise<string> {
  const relative = `${SEARCH_AUDIT_DIR}/search-audit-${result.profile.mode}.json`;
  await mkdir(join(root, SEARCH_AUDIT_DIR), { recursive: true });
  await writeFile(join(root, relative), `${JSON.stringify({ writtenAt: new Date().toISOString(), ...result }, null, 2)}\n`, 'utf8');
  return relative;
}

export interface GoldenCommandOptions {
  write: boolean;
  json: boolean;
  matchMode?: SearchMatchMode;
}

export async function runGoldenCommand(root: string, io: Io, options: GoldenCommandOptions): Promise<number> {
  let set: GoldenQuerySet;
  try {
    set = await readGoldenQueries(root);
  } catch {
    set = generateGoldenQueries(await loadJurisdictionNorms('west', root));
    if (options.write) {
      await mkdir(join(root, SEARCH_AUDIT_DIR), { recursive: true });
      await writeFile(join(root, GOLDEN_QUERIES_PATH), `${JSON.stringify(set, null, 2)}\n`, 'utf8');
      io.print(`Golden Set erzeugt: ${GOLDEN_QUERIES_PATH} (${set.queries.length} Anfragen)`);
    } else io.print(`Golden Set fehlt (${GOLDEN_QUERIES_PATH}); aus dem Bestand erzeugt, nicht geschrieben (--write).`);
  }
  const modes: SearchMatchMode[] = options.matchMode ? [options.matchMode] : [...SEARCH_MATCH_MODES];
  const evaluations = await evaluateGoldenLocally(root, set, modes);
  if (options.json) io.print(JSON.stringify({ set: GOLDEN_QUERIES_PATH, evaluations }, null, 2));
  else {
    for (const evaluation of evaluations) {
      const m = evaluation.overall;
      io.print(`Golden Set ${evaluation.matchMode}: Recall@10 ${formatRatio(m.recallAt10)}, MRR ${m.mrr}, Top-1 ${formatRatio(m.top1)}, Sprungziel ${formatRatio(m.anchorOk)}, Nulltreffer ${formatRatio(m.nullOk)}, verletzt ${m.failed}, Latenz p50 ${m.latencyMs.p50} ms / p95 ${m.latencyMs.p95} ms / max ${m.latencyMs.max} ms (Standard: ${DEFAULT_SEARCH_MATCH_MODE})`);
      for (const outcome of evaluation.outcomes.filter((entry) => entry.failed)) io.print(`  ! ${outcome.id} „${outcome.query}“: Rang ${outcome.rank ?? '–'}, ${outcome.total} Treffer, erste: ${outcome.hits.slice(0, 3).join(', ') || '–'}`);
    }
  }
  if (options.write) {
    await mkdir(join(root, SEARCH_AUDIT_DIR), { recursive: true });
    await writeFile(join(root, GOLDEN_RESULTS_JSON_PATH), `${JSON.stringify({ set: GOLDEN_QUERIES_PATH, evaluations }, null, 2)}\n`, 'utf8');
    await writeFile(join(root, GOLDEN_RESULTS_MD_PATH), `${renderGoldenMarkdown(set, evaluations)}\n`, 'utf8');
    io.print(`Geschrieben: ${GOLDEN_RESULTS_JSON_PATH}, ${GOLDEN_RESULTS_MD_PATH}`);
  }
  return evaluations.every((evaluation) => evaluation.overall.failed === 0) ? 0 : 1;
}

/**
 * Deterministische Remote-Stichprobe: mindestens REMOTE_SAMPLE_MIN_CASES Fälle des Golden Sets, gleichmäßig über die
 * Kategorien (alle Normtypen, Umlaute, Abkürzungen, §, VwV, lange Titel), in Seed-Reihenfolge.
 */
export function selectRemoteSample(set: GoldenQuerySet, minimum = REMOTE_SAMPLE_MIN_CASES): GoldenQuery[] {
  const byCategory = new Map<GoldenCategory, GoldenQuery[]>();
  for (const query of set.queries) byCategory.set(query.category, [...(byCategory.get(query.category) ?? []), query]);
  const chosen: GoldenQuery[] = [];
  for (let round = 0; chosen.length < Math.min(minimum, set.queries.length) || round === 0; round += 1) {
    let added = false;
    for (const category of GOLDEN_CATEGORIES) {
      const entry = byCategory.get(category)?.[round];
      if (entry) {
        chosen.push(entry);
        added = true;
      }
    }
    if (!added) break;
  }
  return chosen.sort((left, right) => seededHash(set.seed, left.id) - seededHash(set.seed, right.id));
}

interface RemoteSearchResponse {
  total: number;
  hits: Array<{ slug: string; unit?: { anchor: string } }>;
}

export async function runRemoteSampleCommand(baseUrl: string, root: string, io: Io, options: GoldenCommandOptions): Promise<number> {
  const set = await readGoldenQueries(root);
  const sample = selectRemoteSample(set);
  const matchMode = options.matchMode;
  const base = baseUrl.replace(/\/+$/u, '');
  io.print(`Remote-Stichprobe: ${sample.length} Fälle gegen ${base}/api/v1/search${matchMode ? ` (match=${matchMode})` : ''}`);
  const run: SearchRunner = async (query) => {
    const params = new URLSearchParams({ q: query.query, jurisdiction: 'west', limit: String(GOLDEN_TOP_K) });
    if (matchMode) params.set('match', matchMode);
    const response = await fetch(`${base}/api/v1/search?${params.toString()}`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} für „${query.query}“`);
    const payload = (await response.json()) as RemoteSearchResponse;
    return { total: payload.total, hits: payload.hits.map((hit) => ({ slug: hit.slug, ...(hit.unit ? { unit: { anchor: hit.unit.anchor } } : {}) })) };
  };
  const evaluation = await evaluateGoldenQueries(sample, run, matchMode ?? DEFAULT_SEARCH_MATCH_MODE);
  const m = evaluation.overall;
  if (options.json) io.print(JSON.stringify({ baseUrl: base, evaluation }, null, 2));
  else {
    io.print(`Remote ${evaluation.matchMode}: Recall@10 ${formatRatio(m.recallAt10)}, MRR ${m.mrr}, Top-1 ${formatRatio(m.top1)}, Sprungziel ${formatRatio(m.anchorOk)}, verletzt ${m.failed}, Latenz p50 ${m.latencyMs.p50} ms / p95 ${m.latencyMs.p95} ms / max ${m.latencyMs.max} ms`);
    for (const outcome of evaluation.outcomes) io.print(`  ${outcome.failed ? '!' : ' '} ${String(outcome.ms).padStart(7)} ms ${outcome.id.padEnd(26)} ${outcome.total} Treffer, Rang ${outcome.rank ?? '–'}  „${outcome.query.slice(0, 70)}“`);
  }
  if (options.write) {
    await mkdir(join(root, SEARCH_AUDIT_DIR), { recursive: true });
    await writeFile(join(root, REMOTE_SAMPLE_RESULTS_PATH), `${JSON.stringify({ baseUrl: base, evaluation }, null, 2)}\n`, 'utf8');
    io.print(`Geschrieben: ${REMOTE_SAMPLE_RESULTS_PATH}`);
  }
  return m.failed === 0 ? 0 : 1;
}
