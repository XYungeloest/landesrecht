/**
 * Suchintegrität nach einem Import (Teil des Bulk-Audits): Der Bestand wird wie in D1 in eine lokale
 * SQLite-Datenbank projiziert; für jede geprüfte West-Norm wird geprüft, ob sie über Titel und Abkürzung
 * gefunden wird, ob §-/Artikel- und LRMB-Nummernadressen auf die richtige Stelle zeigen, ob Typfilter und
 * Jurisdiktionsgrenzen greifen und ob die länderübergreifende Suche sie liefert. Außerdem: keine synthetische
 * Fixture im Produktionsbestand, keine doppelten Sucheinheiten oder Sprungziele, FTS5-Integrität.
 *
 * Skalierung: `mode: 'fast'` prüft eine deterministische, geschichtete Stichprobe (alle Normtypen, kleine und große
 * Normen, Sonderzeichen, Abkürzungen, §-/Artikel-/Nummernadressen; gleicher Seed + gleicher Bestand = gleiche
 * Auswahl), `mode: 'full'` alle Normen. Mehrere Worker (worker_threads) projizieren je eine eigene In-Memory-Datenbank
 * und prüfen disjunkte Teilmengen; die Datenbank ist synchron (node:sqlite), daher lohnt nur echte Parallelität.
 * Das Profil zählt SQL-Abfragen und Zeit je Prüfung.
 */
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { ADMINISTRATIVE_REGULATION_TYPES, expandNormTypeFilter, type NormRecord, type NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import type { D1Database, D1PreparedStatement } from '@landesrecht/runtime/d1-types.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { createStoreRegistry, type StoreRegistry } from '@landesrecht/runtime/registry.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';
import { buildSearchDocument, type SearchUnit } from '@landesrecht/search/index.ts';
import { createSearchState, DEFAULT_SEARCH_MATCH_MODE, extractStructuralIntents, MAX_QUERY_LENGTH, normalizeSearchText, type SearchMatchMode, type SearchState } from '@landesrecht/search/query.ts';
import type { SearchResultPage } from '@landesrecht/search/ranking.ts';

export const SEARCH_AUDIT_CHECKS = ['title', 'abbreviation', 'structure', 'number', 'type-filter', 'jurisdiction-scope', 'all-jurisdictions', 'fixtures', 'duplicates', 'fts-integrity'] as const;
export type SearchAuditCheck = (typeof SEARCH_AUDIT_CHECKS)[number];
/** Prüfungen je Norm (die übrigen gelten für den Bestand). */
export const SEARCH_AUDIT_NORM_CHECKS = ['title', 'abbreviation', 'structure', 'number', 'type-filter', 'jurisdiction-scope', 'all-jurisdictions'] as const satisfies readonly SearchAuditCheck[];
export type SearchAuditNormCheck = (typeof SEARCH_AUDIT_NORM_CHECKS)[number];

export const SEARCH_AUDIT_MODES = ['fast', 'full'] as const;
export type SearchAuditMode = (typeof SEARCH_AUDIT_MODES)[number];
/** Stichprobengröße des Fast Audits, wenn `sample` nicht gesetzt ist. */
export const DEFAULT_FAST_SAMPLE = 150;
export const DEFAULT_AUDIT_SEED = 'landesrecht';
export const MAX_AUDIT_WORKERS = 8;
/** Unter dieser Normenzahl lohnt kein Worker (jeder Worker projiziert den Bestand erneut, ≈ 4 s für 1 400 Normen). */
const MIN_NORMS_PER_WORKER = 40;
const PROJECTION_NOW = '2026-01-01T00:00:00.000Z';

export interface SearchAuditOptions {
  jurisdictions?: readonly JurisdictionId[];
  /** Höchstens n Normen (nach Auswahl und Sortierung); 0 = keine. */
  limit?: number;
  /** Größe der geschichteten Stichprobe; Standard im Modus `fast` DEFAULT_FAST_SAMPLE, im Modus `full` alle. */
  sample?: number;
  /** Seed der Stichprobe (deterministisch je Seed und Bestand). */
  seed?: string;
  /** Nur diese Slugs. */
  only?: readonly string[];
  /** Nur Normen dieses Typs (Familie: `verwaltungsvorschrift` umfasst alle Verwaltungsvorschriftstypen). */
  category?: NormType;
  mode?: SearchAuditMode;
  /** Parallele Worker (1 = im Prozess). */
  workers?: number;
  /** Verknüpfung der Suchwörter; Standard: Produktionsstandard (DEFAULT_SEARCH_MATCH_MODE). */
  matchMode?: SearchMatchMode;
  onProgress?: (done: number, total: number) => void;
}

export interface SearchAuditCheckProfile {
  ms: number;
  queries: number;
}

export interface SearchAuditProfile {
  mode: SearchAuditMode;
  matchMode: SearchMatchMode;
  seed: string;
  sample: number | null;
  workers: number;
  /** Gesamtdauer einschließlich Laden und Projektion. */
  elapsedMs: number;
  /** Laden des Bestands und Projektion im Hauptprozess. */
  projectionMs: number;
  /** Reine Prüfzeit über alle Normen (bei Workern: Summe der Worker-Zeiten). */
  auditMs: number;
  queries: number;
  searches: number;
  queriesPerNorm: number;
  msPerNorm: number;
  checks: Record<SearchAuditNormCheck, SearchAuditCheckProfile>;
  slowest: Array<{ slug: string; ms: number; queries: number }>;
  /** Exakter Titel als Anfrage: erster Treffer ist die Norm (nur bei im Bestand eindeutigem Titel gezählt). */
  titleTop1: { unique: number; top1: number };
  abbreviationTop1: { unique: number; top1: number };
}

export interface SearchAuditResult {
  ok: boolean;
  norms: number;
  searchUnits: number;
  checks: Record<SearchAuditCheck, { passed: number; failed: number; skipped: number }>;
  failures: Array<{ slug: string; check: SearchAuditCheck; detail: string }>;
  profile: SearchAuditProfile;
}

export function isSyntheticFixture(record: Pick<NormRecord, 'meta'>): boolean {
  return (record.meta as { dataset?: string }).dataset === 'synthetic-fixture' || record.meta.slug.startsWith('testfixture-');
}

export function queryText(value: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text.length <= MAX_QUERY_LENGTH) return text;
  const cut = text.lastIndexOf(' ', MAX_QUERY_LENGTH);
  return text.slice(0, cut > 40 ? cut : MAX_QUERY_LENGTH);
}

/* ------------------------------------------------------------------------------------------ */
/* Deterministische Auswahl                                                                   */

/** FNV-1a (32 Bit) über Seed und Schlüssel: stabil über Node-Versionen und Plattformen. */
export function seededHash(seed: string, key: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${seed}\u0000${key}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface NormAuditFeatures {
  slug: string;
  type: NormType;
  hasAbbr: boolean;
  /** Umlaute, ß, Bindestriche, Ziffern oder Klammern in Titel oder Abkürzung. */
  special: boolean;
  hasParagraph: boolean;
  hasArticle: boolean;
  hasNumber: boolean;
  units: number;
  titleLength: number;
}

export function normAuditFeatures(record: NormRecord): NormAuditFeatures {
  const version = getApplicableVersion(record, EDITORIAL_REFERENCE_DATE);
  const units = buildSearchDocument(record, version, EDITORIAL_REFERENCE_DATE).units;
  const names = `${record.meta.title} ${record.meta.abbr ?? ''}`;
  return {
    slug: record.meta.slug,
    type: record.meta.type,
    hasAbbr: Boolean(record.meta.abbr),
    special: /[äöüÄÖÜß\-\d()/.]/u.test(names),
    hasParagraph: units.some((unit) => unit.references?.paragraph),
    hasArticle: units.some((unit) => unit.references?.article),
    hasNumber: units.some((unit) => unit.references?.number),
    units: units.length,
    titleLength: record.meta.title.length,
  };
}

/**
 * Geschichtete Stichprobe: je Normtyp, je Merkmal (Abkürzung, Sonderzeichen, §-/Artikel-/Nummernadresse, sehr kleine
 * und sehr große Normen, lange Titel) eine Quote in Seed-Reihenfolge, der Rest in Seed-Reihenfolge aufgefüllt. Gleicher
 * Seed und gleicher Bestand ergeben dieselbe Auswahl; ein neuer Bestand verschiebt nur die Positionen neuer Slugs.
 */
export function selectStratifiedSample(features: readonly NormAuditFeatures[], size: number, seed: string): NormAuditFeatures[] {
  if (size >= features.length) return [...features];
  const ordered = [...features].sort((left, right) => seededHash(seed, left.slug) - seededHash(seed, right.slug) || left.slug.localeCompare(right.slug));
  const chosen = new Set<string>();
  const take = (predicate: (entry: NormAuditFeatures) => boolean, quota: number): void => {
    let taken = 0;
    for (const entry of ordered) {
      if (taken >= quota || chosen.size >= size) return;
      if (chosen.has(entry.slug) || !predicate(entry)) continue;
      chosen.add(entry.slug);
      taken += 1;
    }
  };
  const share = (fraction: number): number => Math.max(1, Math.round(size * fraction));
  for (const type of [...new Set(ordered.map((entry) => entry.type))].sort()) take((entry) => entry.type === type, share(0.03));
  const unitCounts = [...features].map((entry) => entry.units).sort((left, right) => left - right);
  const large = unitCounts[Math.floor(unitCounts.length * 0.9)] ?? 0;
  take((entry) => entry.hasAbbr, share(0.1));
  take((entry) => entry.special, share(0.1));
  take((entry) => entry.hasParagraph, share(0.1));
  take((entry) => entry.hasArticle, share(0.05));
  take((entry) => entry.hasNumber, share(0.1));
  take((entry) => entry.units >= large, share(0.05));
  take((entry) => entry.units <= 3, share(0.05));
  take((entry) => entry.titleLength >= 120, share(0.05));
  take(() => true, size);
  return ordered.filter((entry) => chosen.has(entry.slug));
}

/** Wendet `only`, `category`, Stichprobe und `limit` auf die Produktionsnormen an; Ergebnis in Titelreihenfolge. */
export function selectAuditNorms(norms: readonly NormRecord[], options: SearchAuditOptions): NormRecord[] {
  const mode = options.mode ?? 'full';
  let candidates = norms.filter((norm) => !isSyntheticFixture(norm));
  if (options.only && options.only.length > 0) {
    const wanted = new Set(options.only);
    candidates = candidates.filter((norm) => wanted.has(norm.meta.slug));
  }
  if (options.category) {
    const family = new Set<NormType>(expandNormTypeFilter([options.category]));
    candidates = candidates.filter((norm) => family.has(norm.meta.type));
  }
  const sample = options.sample ?? (mode === 'fast' ? DEFAULT_FAST_SAMPLE : undefined);
  if (sample !== undefined && sample < candidates.length) {
    const chosen = new Set(selectStratifiedSample(candidates.map(normAuditFeatures), sample, options.seed ?? DEFAULT_AUDIT_SEED).map((entry) => entry.slug));
    candidates = candidates.filter((norm) => chosen.has(norm.meta.slug));
  }
  return candidates.slice(0, options.limit ?? Number.POSITIVE_INFINITY);
}

/* ------------------------------------------------------------------------------------------ */
/* Instrumentierte Datenbank (Abfragen und Zeit)                                              */

export interface QueryCounter {
  queries: number;
  ms: number;
}

/** Misst die synchrone Arbeit jeder Anweisung (node:sqlite arbeitet synchron; das Ergebnis-Promise ist bereits erfüllt). */
function instrumentStatement(statement: D1PreparedStatement, counter: QueryCounter): D1PreparedStatement {
  const measure = <T>(action: () => T): T => {
    counter.queries += 1;
    const started = performance.now();
    const result = action();
    counter.ms += performance.now() - started;
    return result;
  };
  return {
    bind: (...values) => instrumentStatement(statement.bind(...values), counter),
    first: <T>(column?: string) => measure(() => statement.first<T>(column)),
    all: <T>() => measure(() => statement.all<T>()),
    run: () => measure(() => statement.run()),
  };
}

export function instrumentDatabase(db: D1Database, counter: QueryCounter): D1Database {
  return {
    prepare: (query) => instrumentStatement(db.prepare(query), counter),
    batch: (statements) => {
      counter.queries += statements.length;
      return db.batch(statements);
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Projektion und Prüfungen                                                                   */

/** Wie in Produktion: je Jurisdiktion eine eigene Datenbank (Worker-Bindungen), darüber die Registry. */
export interface ProjectedCorpus {
  databases: Map<JurisdictionId, SqliteD1Database>;
  records: Map<JurisdictionId, NormRecord[]>;
  stores: Partial<Record<JurisdictionId, NormStore>>;
  registry: StoreRegistry;
  counter: QueryCounter;
  close(): void;
}

export async function projectCorpus(root: string): Promise<ProjectedCorpus> {
  const counter: QueryCounter = { queries: 0, ms: 0 };
  const databases = new Map<JurisdictionId, SqliteD1Database>();
  const records = new Map<JurisdictionId, NormRecord[]>();
  const stores: Partial<Record<JurisdictionId, NormStore>> = {};
  for (const jurisdiction of JURISDICTION_IDS) {
    const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
    databases.set(jurisdiction, db);
    const norms = await loadJurisdictionNorms(jurisdiction, root);
    records.set(jurisdiction, norms);
    executePlan(db, buildProjectionPlan(norms, { jurisdiction, full: false, now: PROJECTION_NOW }));
    stores[jurisdiction] = createD1NormStore(instrumentDatabase(db, counter), jurisdiction);
  }
  return { databases, records, stores, registry: createStoreRegistry(stores), counter, close: () => { for (const db of databases.values()) db.close(); } };
}

type CheckCounts = Record<SearchAuditCheck, { passed: number; failed: number; skipped: number }>;

function emptyCounts(): CheckCounts {
  return Object.fromEntries(SEARCH_AUDIT_CHECKS.map((check) => [check, { passed: 0, failed: 0, skipped: 0 }])) as CheckCounts;
}

function emptyCheckProfile(): Record<SearchAuditNormCheck, SearchAuditCheckProfile> {
  return Object.fromEntries(SEARCH_AUDIT_NORM_CHECKS.map((check) => [check, { ms: 0, queries: 0 }])) as Record<SearchAuditNormCheck, SearchAuditCheckProfile>;
}

/** Ergebnis eines Teilbestands (Prozess oder Worker); wird im Hauptprozess zusammengeführt. */
export interface SearchAuditSlice {
  norms: number;
  checks: CheckCounts;
  failures: SearchAuditResult['failures'];
  auditMs: number;
  queries: number;
  searches: number;
  checkProfile: Record<SearchAuditNormCheck, SearchAuditCheckProfile>;
  slowest: SearchAuditProfile['slowest'];
  titleTop1: SearchAuditProfile['titleTop1'];
  abbreviationTop1: SearchAuditProfile['abbreviationTop1'];
}

function emptySlice(): SearchAuditSlice {
  return { norms: 0, checks: emptyCounts(), failures: [], auditMs: 0, queries: 0, searches: 0, checkProfile: emptyCheckProfile(), slowest: [], titleTop1: { unique: 0, top1: 0 }, abbreviationTop1: { unique: 0, top1: 0 } };
}

export function mergeSlices(slices: readonly SearchAuditSlice[]): SearchAuditSlice {
  const merged = emptySlice();
  for (const slice of slices) {
    merged.norms += slice.norms;
    for (const check of SEARCH_AUDIT_CHECKS) {
      merged.checks[check].passed += slice.checks[check].passed;
      merged.checks[check].failed += slice.checks[check].failed;
      merged.checks[check].skipped += slice.checks[check].skipped;
    }
    merged.failures.push(...slice.failures);
    merged.auditMs += slice.auditMs;
    merged.queries += slice.queries;
    merged.searches += slice.searches;
    for (const check of SEARCH_AUDIT_NORM_CHECKS) {
      merged.checkProfile[check].ms += slice.checkProfile[check].ms;
      merged.checkProfile[check].queries += slice.checkProfile[check].queries;
    }
    merged.slowest.push(...slice.slowest);
    merged.titleTop1.unique += slice.titleTop1.unique;
    merged.titleTop1.top1 += slice.titleTop1.top1;
    merged.abbreviationTop1.unique += slice.abbreviationTop1.unique;
    merged.abbreviationTop1.top1 += slice.abbreviationTop1.top1;
  }
  merged.failures = merged.failures.sort((left, right) => left.slug.localeCompare(right.slug) || left.check.localeCompare(right.check)).slice(0, 100);
  merged.slowest = merged.slowest.sort((left, right) => right.ms - left.ms).slice(0, 10);
  return merged;
}

/** Bezeichnungen (normalisiert), die im Bestand einer Jurisdiktion mehr als einmal vorkommen. */
function ambiguousNames(norms: readonly NormRecord[], pick: (norm: NormRecord) => string | undefined): Set<string> {
  const counts = new Map<string, number>();
  for (const norm of norms) {
    const value = pick(norm);
    if (!value) continue;
    const key = normalizeSearchText(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

/**
 * Prüft die ausgewählten Normen einer Jurisdiktion gegen den projizierten Bestand. Der Bestand wird vollständig
 * projiziert (Stör- und Nachbarnormen gehören zum Test); geprüft werden nur `slugs`.
 */
export async function auditNorms(corpus: ProjectedCorpus, jurisdiction: JurisdictionId, slugs: readonly string[], options: Pick<SearchAuditOptions, 'matchMode' | 'onProgress'>): Promise<SearchAuditSlice> {
  const slice = emptySlice();
  const store = corpus.stores[jurisdiction];
  if (!store) return slice;
  const all = corpus.records.get(jurisdiction) ?? [];
  const wanted = new Set(slugs);
  const norms = all.filter((norm) => wanted.has(norm.meta.slug));
  const ambiguousTitles = ambiguousNames(all, (norm) => norm.meta.title);
  const ambiguousAbbrs = ambiguousNames(all, (norm) => norm.meta.abbr);
  const matchMode = options.matchMode ?? DEFAULT_SEARCH_MATCH_MODE;
  const counter = corpus.counter;
  const started = performance.now();
  const startQueries = counter.queries;

  const record = (check: SearchAuditCheck, slug: string, ok: boolean | undefined, detail = ''): void => {
    if (ok === undefined) {
      slice.checks[check].skipped += 1;
      return;
    }
    if (ok) slice.checks[check].passed += 1;
    else {
      slice.checks[check].failed += 1;
      if (slice.failures.length < 100) slice.failures.push({ slug, check, detail });
    }
  };

  for (const [index, norm] of norms.entries()) {
    slice.norms += 1;
    const slug = norm.meta.slug;
    const title = queryText(norm.meta.title);
    const normStarted = performance.now();
    const normQueries = counter.queries;
    let checkStarted = performance.now();
    let checkQueries = counter.queries;
    const search = async (check: SearchAuditNormCheck, overrides: Partial<SearchState>, target: NormStore | StoreRegistry = store): Promise<SearchResultPage> => {
      slice.searches += 1;
      const page = await target.search(createSearchState({ matchMode, ...overrides }));
      slice.checkProfile[check].ms += performance.now() - checkStarted;
      slice.checkProfile[check].queries += counter.queries - checkQueries;
      checkStarted = performance.now();
      checkQueries = counter.queries;
      return page;
    };

    const titlePage = await search('title', { q: title, jurisdictions: [jurisdiction], limit: 20 });
    record('title', slug, titlePage.hits.some((hit) => hit.slug === slug), `Titelsuche „${title}“ liefert die Norm nicht unter den ersten 20`);
    record('jurisdiction-scope', slug, titlePage.hits.every((hit) => hit.jurisdiction === jurisdiction), 'Suche mit Jurisdiktionsfilter liefert fremde Länder');
    if (!ambiguousTitles.has(normalizeSearchText(norm.meta.title)) && title === norm.meta.title.replace(/\s+/gu, ' ').trim()) {
      slice.titleTop1.unique += 1;
      if (titlePage.hits[0]?.slug === slug) slice.titleTop1.top1 += 1;
    }
    if (norm.meta.abbr) {
      const abbrPage = await search('abbreviation', { q: norm.meta.abbr, jurisdictions: [jurisdiction], limit: 20 });
      record('abbreviation', slug, abbrPage.hits.some((hit) => hit.slug === slug), `Abkürzung „${norm.meta.abbr}“ nicht gefunden`);
      if (!ambiguousAbbrs.has(normalizeSearchText(norm.meta.abbr))) {
        slice.abbreviationTop1.unique += 1;
        if (abbrPage.hits[0]?.slug === slug) slice.abbreviationTop1.top1 += 1;
      }
    } else record('abbreviation', slug, undefined);
    const allPage = await search('all-jurisdictions', { q: title, limit: 50 }, corpus.registry);
    record('all-jurisdictions', slug, allPage.hits.some((hit) => hit.slug === slug && hit.jurisdiction === jurisdiction), 'länderübergreifende Suche liefert die Norm nicht');
    const typeFilter = norm.meta.type;
    const otherFamily: NormType = (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(typeFilter) ? 'gesetz' : 'verwaltungsvorschrift';
    const typed = await search('type-filter', { q: title, jurisdictions: [jurisdiction], types: [typeFilter], limit: 20 });
    const foreign = await search('type-filter', { q: title, jurisdictions: [jurisdiction], types: [otherFamily], limit: 50 });
    record('type-filter', slug, typed.hits.some((hit) => hit.slug === slug) && !foreign.hits.some((hit) => hit.slug === slug), `Typfilter ${typeFilter}/${otherFamily} wirkt nicht`);

    const version = getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE);
    const units: SearchUnit[] = buildSearchDocument(norm, version, EDITORIAL_REFERENCE_DATE).units;
    // Strukturangaben im Titel („zu § 74 Absatz 4“) würden sonst als zusätzliche Adresse gelesen.
    const identity = extractStructuralIntents(norm.meta.abbr ?? norm.meta.shortTitle ?? title).remaining.replace(/\s+/gu, ' ').trim() || title;
    const provision = units.find((unit) => unit.references?.paragraph || unit.references?.article);
    if (provision?.references) {
      const address = provision.references.paragraph ? `§ ${provision.references.paragraph}` : `Art. ${provision.references.article}`;
      const page = await search('structure', { q: queryText(`${address} ${identity}`), jurisdictions: [jurisdiction], limit: 20 });
      const hit = page.hits.find((candidate) => candidate.slug === slug);
      record('structure', slug, Boolean(hit && hit.unit?.anchor === provision.anchor), `„${address} ${identity}“ zeigt nicht auf ${provision.anchor}`);
    } else record('structure', slug, undefined);
    const numbered = units.find((unit) => unit.references?.number);
    if (numbered?.references?.number) {
      const page = await search('number', { q: queryText(`Nr. ${numbered.references.number} ${identity}`), jurisdictions: [jurisdiction], limit: 20 });
      const hit = page.hits.find((candidate) => candidate.slug === slug);
      record('number', slug, Boolean(hit && hit.unit?.references?.number === numbered.references.number), `„Nr. ${numbered.references.number} ${identity}“ zeigt nicht auf ${numbered.anchor}`);
    } else record('number', slug, undefined);

    slice.slowest.push({ slug, ms: performance.now() - normStarted, queries: counter.queries - normQueries });
    if (slice.slowest.length > 20) slice.slowest = slice.slowest.sort((left, right) => right.ms - left.ms).slice(0, 10);
    options.onProgress?.(index + 1, norms.length);
  }
  slice.auditMs = performance.now() - started;
  slice.queries = counter.queries - startQueries;
  slice.slowest = slice.slowest.sort((left, right) => right.ms - left.ms).slice(0, 10);
  return slice;
}

/** Einstieg eines Workers: eigene Projektion, Prüfung der zugewiesenen Slugs. */
export async function runSearchAuditSlice(root: string, jurisdiction: JurisdictionId, slugs: readonly string[], matchMode: SearchMatchMode): Promise<SearchAuditSlice> {
  const corpus = await projectCorpus(root);
  try {
    return await auditNorms(corpus, jurisdiction, slugs, { matchMode });
  } finally {
    corpus.close();
  }
}

function runWorker(root: string, jurisdiction: JurisdictionId, slugs: readonly string[], matchMode: SearchMatchMode): Promise<SearchAuditSlice> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./search-audit-worker.ts', import.meta.url), { workerData: { root, jurisdiction, slugs, matchMode } });
    worker.once('message', (message: { slice?: SearchAuditSlice; error?: string }) => {
      if (message.error) reject(new Error(message.error));
      else resolve(message.slice!);
      void worker.terminate();
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Such-Audit-Worker endete mit Code ${code}`));
    });
  });
}

/** Round-Robin über die Titelreihenfolge: jeder Worker erhält kleine und große Normen. */
export function partitionSlugs(slugs: readonly string[], workers: number): string[][] {
  const parts: string[][] = Array.from({ length: workers }, () => []);
  slugs.forEach((slug, index) => parts[index % workers]!.push(slug));
  return parts.filter((part) => part.length > 0);
}

export async function runSearchAudit(root: string, options: SearchAuditOptions = {}): Promise<SearchAuditResult> {
  const started = performance.now();
  const mode = options.mode ?? 'full';
  const matchMode = options.matchMode ?? DEFAULT_SEARCH_MATCH_MODE;
  const seed = options.seed ?? DEFAULT_AUDIT_SEED;
  const corpus = await projectCorpus(root);
  const projectionMs = performance.now() - started;
  const checks = emptyCounts();
  const failures: SearchAuditResult['failures'] = [];
  const record = (check: SearchAuditCheck, slug: string, ok: boolean, detail = ''): void => {
    if (ok) checks[check].passed += 1;
    else {
      checks[check].failed += 1;
      failures.push({ slug, check, detail });
    }
  };

  try {
    const integrityErrors: string[] = [];
    let duplicateUnits = 0;
    const duplicateAnchors: string[] = [];
    let searchUnits = 0;
    for (const [jurisdiction, db] of corpus.databases) {
      try {
        checkSearchIndexIntegrity(db);
      } catch (error) {
        integrityErrors.push(`${jurisdiction}: ${(error as Error).message}`);
      }
      duplicateUnits += db.native.prepare('SELECT norm_id, version_id, unit_index, COUNT(*) AS c FROM law_search_units GROUP BY norm_id, version_id, unit_index HAVING c > 1').all().length;
      const anchors = db.native.prepare("SELECT norm_id, version_id, anchor, COUNT(*) AS c FROM law_search_units WHERE anchor <> '' GROUP BY norm_id, version_id, anchor HAVING c > 1").all() as Array<{ norm_id: string; anchor: string; c: number }>;
      duplicateAnchors.push(...anchors.map((row) => `${row.norm_id}#${row.anchor}`));
      searchUnits += Number((db.native.prepare('SELECT COUNT(*) AS c FROM law_search_units').get() as { c: number }).c);
    }
    record('fts-integrity', '*', integrityErrors.length === 0, integrityErrors.join('; '));
    record('duplicates', '*', duplicateUnits === 0 && duplicateAnchors.length === 0, `${duplicateUnits} doppelte Einheiten, ${duplicateAnchors.length} doppelte Sprungziele${duplicateAnchors.length ? ` (${duplicateAnchors.slice(0, 5).join(', ')})` : ''}`);
    for (const [jurisdiction, norms] of corpus.records) for (const norm of norms) record('fixtures', norm.meta.slug, !isSyntheticFixture(norm), `synthetische Fixture ${jurisdiction}:${norm.meta.slug} im Produktionsbestand`);

    const targets = options.jurisdictions ?? ['west'];
    const slices: SearchAuditSlice[] = [];
    let selected = 0;
    let workersUsed = 1;
    for (const jurisdiction of targets) {
      const slugs = selectAuditNorms(corpus.records.get(jurisdiction) ?? [], { ...options, mode }).map((norm) => norm.meta.slug);
      selected += slugs.length;
      const workers = Math.max(1, Math.min(MAX_AUDIT_WORKERS, options.workers ?? 1, Math.floor(slugs.length / MIN_NORMS_PER_WORKER)));
      if (workers > 1) {
        workersUsed = Math.max(workersUsed, workers);
        slices.push(...await Promise.all(partitionSlugs(slugs, workers).map((part) => runWorker(root, jurisdiction, part, matchMode))));
      } else {
        slices.push(await auditNorms(corpus, jurisdiction, slugs, { matchMode, ...(options.onProgress ? { onProgress: options.onProgress } : {}) }));
      }
    }
    const merged = mergeSlices(slices);
    for (const check of SEARCH_AUDIT_CHECKS) {
      checks[check].passed += merged.checks[check].passed;
      checks[check].failed += merged.checks[check].failed;
      checks[check].skipped += merged.checks[check].skipped;
    }
    failures.push(...merged.failures);
    const sample = options.sample ?? (mode === 'fast' ? DEFAULT_FAST_SAMPLE : null);
    const profile: SearchAuditProfile = {
      mode,
      matchMode,
      seed,
      sample,
      workers: workersUsed,
      elapsedMs: Math.round(performance.now() - started),
      projectionMs: Math.round(projectionMs),
      auditMs: Math.round(merged.auditMs),
      queries: merged.queries,
      searches: merged.searches,
      queriesPerNorm: selected > 0 ? Number((merged.queries / selected).toFixed(1)) : 0,
      msPerNorm: selected > 0 ? Number((merged.auditMs / selected).toFixed(1)) : 0,
      checks: Object.fromEntries(SEARCH_AUDIT_NORM_CHECKS.map((check) => [check, { ms: Math.round(merged.checkProfile[check].ms), queries: merged.checkProfile[check].queries }])) as SearchAuditProfile['checks'],
      slowest: merged.slowest.map((entry) => ({ ...entry, ms: Math.round(entry.ms) })),
      titleTop1: merged.titleTop1,
      abbreviationTop1: merged.abbreviationTop1,
    };
    return {
      ok: Object.values(checks).every((check) => check.failed === 0),
      norms: merged.norms,
      searchUnits,
      checks,
      failures: failures.slice(0, 100),
      profile,
    };
  } finally {
    corpus.close();
  }
}
