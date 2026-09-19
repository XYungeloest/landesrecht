/**
 * Golden Set der NSH-Suche und länderübergreifende Prüfung (West, BayWü, NSH).
 *
 * Wie BayWü (`packages/importers/bayernrecht/src/search/golden.ts`, dort nur gelesen): Erzeugung und Bewertung aus dem
 * jurisdiktionsneutralen West-Modul (`search-golden.ts`), hier mit dem NSH-Bestand aufgerufen und um das ergänzt, was
 * NSH besonders braucht:
 *
 *   abbreviation       übergeleitete amtliche Abkürzungen mit Landeskürzel („LVwG NSH“, Transformer 1.1.0)
 *   lrmb-number        Gliederungsnummer „Gl.Nr. …“ als Metadatum (bei VwV aus dem Normkörper verlegt)
 *   paragraph-address  § mit Abkürzung, aus der Mitte der Norm
 *   vwv-title          Titel von Verwaltungsvorschriften (ohne juris-Zusätze)
 *   exact-title        Stichtagsfassungen aus historischen Einzelfassungen (Suchindex trägt den Stichtagstext)
 *
 * Länderübergreifend: gemeinsame Titelbruchstücke aller drei Länder, je Länderfilter nur Treffer dieses Landes, ohne
 * Filter Treffer aus mehreren Ländern, Typfilter über alle. Am West- und BayWü-Code ändert sich nichts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { expandNormTypeFilter, type NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument } from '@landesrecht/search/index.ts';
import { createSearchState, normalizeSearchText, SEARCH_MATCH_MODES, type SearchMatchMode } from '@landesrecht/search/query.ts';
import { evaluateGoldenQueries, generateGoldenQueries, GOLDEN_TOP_K, renderGoldenMarkdown, type GoldenCategory, type GoldenEvaluation, type GoldenQuery, type GoldenQuerySet } from '@landesrecht/importer-recht-nrw/common/search-golden.ts';
import { projectCorpus, queryText, seededHash } from '@landesrecht/importer-recht-nrw/common/search-audit.ts';

import { AUDIT_DIR } from '../common/constants.ts';
import { GLIEDERUNG_SYSTEM } from '../parse/source-law.ts';

export const NSH_SEARCH_DIR = `${AUDIT_DIR}/search`;
export const NSH_GOLDEN_QUERIES_PATH = `${NSH_SEARCH_DIR}/golden-queries.json`;
export const NSH_GOLDEN_RESULTS_JSON_PATH = `${NSH_SEARCH_DIR}/golden-results.json`;
export const NSH_GOLDEN_RESULTS_MD_PATH = `${NSH_SEARCH_DIR}/golden-results.md`;
export const NSH_CROSS_JURISDICTION_PATH = `${NSH_SEARCH_DIR}/cross-jurisdiction.json`;
export const NSH_GOLDEN_SEED = 'golden-nsh';

const WEST_ONLY_QUERIES = new Set(['west', 'land westdeutschland']);
const NSH_COMMON_WORDS = ['Niedersachsen-Holstein', 'Bekanntmachung', 'Ministerium'];

export interface NshGoldenSet extends Omit<GoldenQuerySet, 'jurisdiction'> {
  jurisdiction: 'nsh';
}

const gliederungsnummer = (norm: NormRecord): string | undefined => norm.meta.externalIdentifiers.find((entry) => entry.system === GLIEDERUNG_SYSTEM)?.value;
const historical = (norm: NormRecord): boolean => norm.versions.some((version) => (version.sourceNotes ?? []).some((note) => note.label === 'Stichtagsfassung'));

/** Deterministisch: gleicher Seed und Bestand → gleiche Datei. */
export function generateNshGoldenQueries(records: readonly NormRecord[], seed = NSH_GOLDEN_SEED): NshGoldenSet {
  const base = generateGoldenQueries(records, seed);
  const queries: GoldenQuery[] = base.queries.filter((query) => !(query.category === 'common-word' && WEST_ONLY_QUERIES.has(normalizeSearchText(query.query))));
  const counters = new Map<GoldenCategory, number>();
  for (const query of queries) counters.set(query.category, Math.max(counters.get(query.category) ?? 0, Number(query.id.split('-').at(-1))));
  const add = (category: GoldenCategory, entry: Omit<GoldenQuery, 'id' | 'category'>): void => {
    const index = (counters.get(category) ?? 0) + 1;
    counters.set(category, index);
    queries.push({ id: `${category}-${String(index).padStart(2, '0')}`, category, ...entry });
  };
  const used = new Set(queries.flatMap((query) => [...query.expectedTop, ...query.acceptable]));
  for (const word of NSH_COMMON_WORDS) add('common-word', { query: word, expectedTop: [], acceptable: [], expectHits: true, note: 'häufiges Wort in NSH: nur Laufzeit und Trefferzahl' });

  const norms = records.slice().sort((left, right) => seededHash(`${seed}-supplement`, left.meta.slug) - seededHash(`${seed}-supplement`, right.meta.slug) || left.meta.slug.localeCompare(right.meta.slug));
  const count = (values: Array<string | undefined>): Map<string, number> => {
    const map = new Map<string, number>();
    for (const value of values) if (value) map.set(normalizeSearchText(value), (map.get(normalizeSearchText(value)) ?? 0) + 1);
    return map;
  };
  const titleCounts = count(norms.map((norm) => norm.meta.title));
  const abbrCounts = count(norms.map((norm) => norm.meta.abbr));
  const glCounts = count(norms.map(gliederungsnummer));
  const uniqueTitle = (norm: NormRecord): boolean => titleCounts.get(normalizeSearchText(norm.meta.title)) === 1;
  const uniqueAbbr = (norm: NormRecord): boolean => Boolean(norm.meta.abbr) && abbrCounts.get(normalizeSearchText(norm.meta.abbr!)) === 1;
  const pick = (predicate: (norm: NormRecord) => boolean, wanted: number): NormRecord[] => {
    const chosen: NormRecord[] = [];
    for (const norm of norms) {
      if (chosen.length >= wanted) break;
      if (used.has(norm.meta.slug) || !predicate(norm)) continue;
      chosen.push(norm);
      used.add(norm.meta.slug);
    }
    return chosen;
  };
  const units = (norm: NormRecord) => buildSearchDocument(norm, getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE), EDITORIAL_REFERENCE_DATE).units;

  // Übergeleitete Abkürzungen mit Landeskürzel (Transformer 1.1.0): „… NSH“ führt zur Norm.
  for (const norm of pick((entry) => uniqueAbbr(entry) && /(?:^|[\s-])NSH\b/u.test(entry.meta.abbr ?? ''), 8)) add('abbreviation', { query: norm.meta.abbr!, expectedTop: [norm.meta.slug], acceptable: [], note: 'übergeleitete amtliche Abkürzung mit Landeskürzel (1.1.0)' });
  // Paragraphenadresse mit Abkürzung, aus der Mitte der Norm.
  for (const norm of pick((entry) => uniqueAbbr(entry) && units(entry).some((unit) => unit.references?.paragraph), 8)) {
    const paragraphs = units(norm).filter((unit) => unit.references?.paragraph);
    const provision = paragraphs[Math.floor(paragraphs.length / 2)]!;
    add('paragraph-address', { query: queryText(`§ ${provision.references!.paragraph} ${norm.meta.abbr}`), expectedTop: [norm.meta.slug], acceptable: [], expectedAnchor: provision.anchor, note: 'Paragraphenadresse (Mitte der Norm)' });
  }
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'gesetz' && entry.meta.title.length <= 150, 4)) add('exact-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'Gesetz' });
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'verwaltungsvorschrift' && entry.meta.title.length <= 150, 8)) add('vwv-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'Verwaltungsvorschrift' });
  // Stichtagsfassungen aus Einzelfassungen: Titel führt zur Norm (Index trägt den Stichtagstext).
  for (const norm of pick((entry) => uniqueTitle(entry) && historical(entry) && entry.meta.title.length <= 150, 6)) add('exact-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'Stichtagsfassung aus historischen Einzelfassungen' });
  // Gliederungsnummer als Metadatum („Gl.Nr. 2134.12“), nur im Bestand eindeutige Nummern; als Phrase Vertrag.
  for (const norm of pick((entry) => Boolean(gliederungsnummer(entry)) && glCounts.get(normalizeSearchText(gliederungsnummer(entry)!)) === 1 && /^[0-9][0-9.\-]+[0-9]$/u.test(gliederungsnummer(entry)!), 8)) {
    add('lrmb-number', { query: `"${gliederungsnummer(norm)}"`, expectedTop: [], acceptable: [norm.meta.slug], note: `Gliederungsnummer als Phrase (Metadatum, ${norm.meta.type})` });
  }
  // Gekürzte Titelanfragen (queryText kürzt lange Titel): Beginnen mehrere Titel mit derselben Anfrage, ist jede dieser
  // Normen eine richtige erste Antwort („Allgemeinverfügung zur Umsetzung der Bekanntmachung … vom 18. Februar 2022 …“).
  const titleCategories = new Set<GoldenCategory>(['exact-title', 'partial-title', 'long-title', 'verordnung-title', 'vwv-title']);
  for (const query of queries) {
    if (!titleCategories.has(query.category) || query.expectedTop.length === 0 || query.query.startsWith('"')) continue;
    const prefix = normalizeSearchText(query.query);
    const same = norms.filter((norm) => !query.expectedTop.includes(norm.meta.slug) && normalizeSearchText(norm.meta.title).startsWith(prefix)).map((norm) => norm.meta.slug);
    if (same.length > 0) {
      query.expectedTop = [...query.expectedTop, ...same].sort();
      query.note = `${query.note ? `${query.note}; ` : ''}Titelanfang in ${same.length + 1} Normen gleich (gekürzte Anfrage)`;
    }
  }
  return { description: 'Golden Query Set der NSH-Suche (aus dem übernommenen Bestand erzeugt; Erwartungen von Hand prüfbar)', seed, jurisdiction: 'nsh', queries };
}

export async function readNshGolden(root: string): Promise<NshGoldenSet | undefined> {
  try {
    return JSON.parse(await readFile(join(root, NSH_GOLDEN_QUERIES_PATH), 'utf8')) as NshGoldenSet;
  } catch {
    return undefined;
  }
}

type Corpus = Awaited<ReturnType<typeof projectCorpus>>;

export async function evaluateNshGolden(corpus: Corpus, set: NshGoldenSet, modes: readonly SearchMatchMode[] = SEARCH_MATCH_MODES): Promise<GoldenEvaluation[]> {
  const store = corpus.stores.nsh!;
  const evaluations: GoldenEvaluation[] = [];
  for (const matchMode of modes) {
    await store.search(createSearchState({ q: 'Aufwärmen', jurisdictions: ['nsh'], limit: 1, matchMode }));
    evaluations.push(await evaluateGoldenQueries(set.queries, (query) => store.search(createSearchState({ q: query.query, jurisdictions: ['nsh'], limit: GOLDEN_TOP_K, matchMode })), matchMode));
  }
  return evaluations;
}

export interface CrossJurisdictionCase {
  fragment: string;
  /** Länder mit Treffern ohne Filter (mindestens zwei erwartet). */
  unfiltered: JurisdictionId[];
  /** Je Land: Filter liefert nur Treffer dieses Landes und mindestens einen. */
  filtered: Partial<Record<JurisdictionId, boolean>>;
  typeFilter: { type: string; ok: boolean };
  totals: Partial<Record<JurisdictionId | 'all', number>>;
  ok: boolean;
}

const CROSS_FRAGMENTS = 12;
const CROSS_JURISDICTIONS: readonly JurisdictionId[] = ['west', 'baywue', 'nsh'];

/** Gemeinsame Titelbruchstücke (≥ 10 Zeichen) von NSH und mindestens einem weiteren Land; Landesnamen ausgenommen. */
export async function crossJurisdictionChecks(corpus: Corpus, seed = NSH_GOLDEN_SEED): Promise<CrossJurisdictionCase[]> {
  const words = (jurisdiction: JurisdictionId): Map<string, NormRecord> => {
    const map = new Map<string, NormRecord>();
    for (const norm of corpus.records.get(jurisdiction) ?? []) for (const word of normalizeSearchText(norm.meta.title).split(' ')) if (word.length >= 10 && !/\d/u.test(word) && !map.has(word)) map.set(word, norm);
    return map;
  };
  const byJurisdiction = new Map(CROSS_JURISDICTIONS.map((jurisdiction) => [jurisdiction, words(jurisdiction)]));
  const nsh = byJurisdiction.get('nsh')!;
  const shared = [...nsh.keys()].filter((word) => CROSS_JURISDICTIONS.filter((jurisdiction) => jurisdiction !== 'nsh' && byJurisdiction.get(jurisdiction)!.has(word)).length >= 1 && !/west|bayern|wuerttemberg|württemberg|niedersachsen|holstein/u.test(word));
  const fragments = shared.sort((left, right) => seededHash(`${seed}-cross`, left) - seededHash(`${seed}-cross`, right) || left.localeCompare(right)).slice(0, CROSS_FRAGMENTS);
  const cases: CrossJurisdictionCase[] = [];
  for (const fragment of fragments) {
    const present = CROSS_JURISDICTIONS.filter((jurisdiction) => byJurisdiction.get(jurisdiction)!.has(fragment));
    const all = await corpus.registry.search(createSearchState({ q: fragment, limit: 100 }));
    const unfiltered = CROSS_JURISDICTIONS.filter((jurisdiction) => all.hits.some((hit) => hit.jurisdiction === jurisdiction));
    const filtered: CrossJurisdictionCase['filtered'] = {};
    const totals: CrossJurisdictionCase['totals'] = { all: all.total };
    for (const jurisdiction of present) {
      const only = await corpus.registry.search(createSearchState({ q: fragment, jurisdictions: [jurisdiction], limit: 50 }));
      filtered[jurisdiction] = only.hits.length > 0 && only.hits.every((hit) => hit.jurisdiction === jurisdiction);
      totals[jurisdiction] = only.total;
    }
    const type = nsh.get(fragment)!.meta.type;
    const typed = await corpus.registry.search(createSearchState({ q: fragment, jurisdictions: [...present], types: [type], limit: 50 }));
    const allowed = new Set<string>(expandNormTypeFilter([type]));
    const typeOk = typed.hits.length > 0 && typed.hits.every((hit) => allowed.has(hit.type));
    const ok = unfiltered.length >= 2 && present.every((jurisdiction) => filtered[jurisdiction]) && typeOk;
    cases.push({ fragment, unfiltered, filtered, typeFilter: { type, ok: typeOk }, totals, ok });
  }
  return cases;
}

export interface NshGoldenRun {
  set: NshGoldenSet;
  generated: boolean;
  evaluations: GoldenEvaluation[];
  cross: CrossJurisdictionCase[];
}

export async function runNshGolden(root: string, options: { write: boolean; regenerate?: boolean }): Promise<NshGoldenRun> {
  const stored = options.regenerate ? undefined : await readNshGolden(root);
  const set = stored ?? generateNshGoldenQueries(await loadJurisdictionNorms('nsh', root));
  const corpus = await projectCorpus(root);
  let evaluations: GoldenEvaluation[];
  let cross: CrossJurisdictionCase[];
  try {
    evaluations = await evaluateNshGolden(corpus, set);
    cross = await crossJurisdictionChecks(corpus);
  } finally {
    corpus.close();
  }
  if (options.write) {
    await mkdir(join(root, NSH_SEARCH_DIR), { recursive: true });
    if (!stored) await writeFile(join(root, NSH_GOLDEN_QUERIES_PATH), `${JSON.stringify(set, null, 2)}\n`, 'utf8');
    await writeFile(join(root, NSH_GOLDEN_RESULTS_JSON_PATH), `${JSON.stringify({ set: NSH_GOLDEN_QUERIES_PATH, evaluations }, null, 2)}\n`, 'utf8');
    await writeFile(join(root, NSH_CROSS_JURISDICTION_PATH), `${JSON.stringify({ cases: cross }, null, 2)}\n`, 'utf8');
    const markdown = renderGoldenMarkdown(set as unknown as GoldenQuerySet, evaluations)
      .replace('lokale SQLite-Projektion des West-Bestands', 'lokale SQLite-Projektion des NSH-Bestands')
      .replace(/\(data\/audits\/recht-nrw\/search\/golden-queries\.json\)/u, `(${NSH_GOLDEN_QUERIES_PATH})`)
      .replace('# Golden Query Set – Ergebnisse', '# Golden Query Set NSH – Ergebnisse');
    await writeFile(join(root, NSH_GOLDEN_RESULTS_MD_PATH), `${markdown}\n`, 'utf8');
  }
  return { set, generated: !stored, evaluations, cross };
}
