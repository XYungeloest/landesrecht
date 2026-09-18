/**
 * Golden Set der BayWü-Suche.
 *
 * Erzeugung und Bewertung stammen aus dem West-Adapter (`search-golden.ts`) und sind dort
 * jurisdiktionsneutral; nur die Datei-Pfade, die häufigen Wörter und die lokale Auswertung zeigen
 * dort fest auf West. Dieses Modul ruft die neutralen Teile mit dem BayWü-Bestand auf, ersetzt die
 * West-spezifischen Anfragen und ergänzt, was BayWü besonders braucht: Artikeladressen (bayerische
 * Gesetze zählen nach Artikeln), Gesetzestitel und die BayRS-Gliederungsnummer als Metadatum. Am West-Code ändert
 * sich nichts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { expandNormTypeFilter, type NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument } from '@landesrecht/search/index.ts';
import { createSearchState, DEFAULT_SEARCH_MATCH_MODE, normalizeSearchText, SEARCH_MATCH_MODES, type SearchMatchMode } from '@landesrecht/search/query.ts';
import {
  evaluateGoldenQueries,
  generateGoldenQueries,
  GOLDEN_TOP_K,
  renderGoldenMarkdown,
  selectRemoteSample,
  type GoldenCategory,
  type GoldenEvaluation,
  type GoldenQuery,
  type GoldenQuerySet,
} from '@landesrecht/importer-recht-nrw/common/search-golden.ts';
import { projectCorpus, queryText, seededHash } from '@landesrecht/importer-recht-nrw/common/search-audit.ts';

export const BAYWUE_SEARCH_DIR = 'data/audits/bayernrecht/search';
export const BAYWUE_GOLDEN_QUERIES_PATH = `${BAYWUE_SEARCH_DIR}/golden-queries.json`;
export const BAYWUE_GOLDEN_RESULTS_JSON_PATH = `${BAYWUE_SEARCH_DIR}/golden-results.json`;
export const BAYWUE_GOLDEN_RESULTS_MD_PATH = `${BAYWUE_SEARCH_DIR}/golden-results.md`;
export const BAYWUE_GOLDEN_SEED = 'golden-baywue';
/** Punkt 112: mindestens 100 Anfragen bei hinreichendem Bestand. */
export const BAYWUE_GOLDEN_MIN_QUERIES = 100;

/** West-spezifische häufige Wörter des generischen Generators, die in BayWü keinen Sinn ergeben. */
const WEST_ONLY_QUERIES = new Set(['west', 'land westdeutschland']);
const BAYWUE_COMMON_WORDS = ['Bayern-Württemberg', 'Bekanntmachung', 'Staatsministerium'];

export interface BaywueGoldenSet extends Omit<GoldenQuerySet, 'jurisdiction'> {
  jurisdiction: 'baywue';
}

function bayrsNumber(norm: NormRecord): string | undefined {
  return norm.meta.externalIdentifiers?.find((entry) => entry.system === 'bayrs')?.value;
}

/** Deterministisch: gleicher Seed und Bestand → gleiche Datei. */
export function generateBaywueGoldenQueries(records: readonly NormRecord[], seed = BAYWUE_GOLDEN_SEED): BaywueGoldenSet {
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

  for (const word of BAYWUE_COMMON_WORDS) add('common-word', { query: word, expectedTop: [], acceptable: [], expectHits: true, note: 'häufiges Wort in BayWü: nur Laufzeit und Trefferzahl' });

  const norms = records.slice().sort((left, right) => seededHash(`${seed}-supplement`, left.meta.slug) - seededHash(`${seed}-supplement`, right.meta.slug) || left.meta.slug.localeCompare(right.meta.slug));
  const titleCounts = new Map<string, number>();
  const abbrCounts = new Map<string, number>();
  for (const norm of norms) {
    titleCounts.set(normalizeSearchText(norm.meta.title), (titleCounts.get(normalizeSearchText(norm.meta.title)) ?? 0) + 1);
    if (norm.meta.abbr) abbrCounts.set(normalizeSearchText(norm.meta.abbr), (abbrCounts.get(normalizeSearchText(norm.meta.abbr)) ?? 0) + 1);
  }
  const uniqueTitle = (norm: NormRecord): boolean => titleCounts.get(normalizeSearchText(norm.meta.title)) === 1;
  const uniqueAbbr = (norm: NormRecord): boolean => Boolean(norm.meta.abbr) && abbrCounts.get(normalizeSearchText(norm.meta.abbr!)) === 1;
  const pick = (predicate: (norm: NormRecord) => boolean, count: number): NormRecord[] => {
    const chosen: NormRecord[] = [];
    for (const norm of norms) {
      if (chosen.length >= count) break;
      if (used.has(norm.meta.slug) || !predicate(norm)) continue;
      chosen.push(norm);
      used.add(norm.meta.slug);
    }
    return chosen;
  };
  const units = (norm: NormRecord) => buildSearchDocument(norm, getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE), EDITORIAL_REFERENCE_DATE).units;

  // Bayerische Gesetze zählen nach Artikeln: Artikeladresse mit Abkürzung, auch aus der Mitte der Norm.
  for (const norm of pick((entry) => uniqueAbbr(entry) && entry.meta.type === 'gesetz' && units(entry).some((unit) => unit.references?.article), 8)) {
    const articles = units(norm).filter((unit) => unit.references?.article);
    const provision = articles[Math.floor(articles.length / 2)]!;
    add('article-address', { query: queryText(`Art. ${provision.references!.article} ${norm.meta.abbr}`), expectedTop: [norm.meta.slug], acceptable: [], expectedAnchor: provision.anchor, note: 'Artikeladresse (bayerische Zählung)' });
  }
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'gesetz' && entry.meta.title.length <= 150, 4)) add('exact-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'Gesetz' });
  for (const norm of pick((entry) => uniqueTitle(entry) && entry.meta.type === 'verordnung' && entry.meta.title.length <= 150, 3)) add('verordnung-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [] });

  // Rückgerechnete Stichtagsfassungen (historic-recovered): Titel führt zur Norm, und ein Wortlaut, der nur in der
  // Stichtagsfassung steht, ist suchbar – der Index enthält den Stichtagstext, nicht den heutigen.
  const reconstructed = norms.filter((entry) => entry.versions.some((version) => version.sourceStatus?.text === 'reconstructed'));
  for (const norm of reconstructed.filter((entry) => uniqueTitle(entry) && !used.has(entry.meta.slug)).slice(0, 6)) {
    used.add(norm.meta.slug);
    add('exact-title', { query: queryText(norm.meta.title), expectedTop: [norm.meta.slug], acceptable: [], note: 'historic-recovered: rückgerechnete Stichtagsfassung' });
  }

  // BayRS-Gliederungsnummer: suchbares Metadatum (SEARCHABLE_IDENTIFIER_SYSTEMS), nicht in den Titel gehackt.
  // Nur im Bestand eindeutige Nummern. Als Phrase („"2011-2-4-I"“) ist die Nummer Vertrag: Sie muss unter den ersten
  // Treffern stehen (andere Normen dürfen dieselbe Nummer in Fußnoten zitieren). Ohne Anführungszeichen zerlegt die
  // Suche die Nummer in Einzelteile („2“, „4“, „i“), die im ganzen Bestand vorkommen; der Rang ist dann nicht
  // gesichert – gemessen, aber kein Vertrag.
  const bayrsCounts = new Map<string, number>();
  for (const norm of norms) if (bayrsNumber(norm)) bayrsCounts.set(bayrsNumber(norm)!, (bayrsCounts.get(bayrsNumber(norm)!) ?? 0) + 1);
  for (const norm of pick((entry) => Boolean(bayrsNumber(entry)) && bayrsCounts.get(bayrsNumber(entry)!) === 1, 5)) {
    add('lrmb-number', { query: `"${bayrsNumber(norm)}"`, expectedTop: [], acceptable: [norm.meta.slug], note: 'BayRS-Gliederungsnummer als Phrase (Metadatum)' });
    add('lrmb-number', { query: `BayRS ${bayrsNumber(norm)}`, expectedTop: [], acceptable: [norm.meta.slug], niceToHave: true, note: 'BayRS-Gliederungsnummer ohne Anführungszeichen: Nummernteile einzeln gesucht, Rang nicht gesichert' });
  }

  return { description: 'Golden Query Set der BayWü-Suche (aus dem übernommenen Bestand erzeugt; Erwartungen von Hand prüfbar)', seed, jurisdiction: 'baywue', queries };
}

export async function readBaywueGolden(root: string): Promise<BaywueGoldenSet | undefined> {
  try {
    return JSON.parse(await readFile(join(root, BAYWUE_GOLDEN_QUERIES_PATH), 'utf8')) as BaywueGoldenSet;
  } catch {
    return undefined;
  }
}

type Corpus = Awaited<ReturnType<typeof projectCorpus>>;

/** Auswertung gegen die lokale SQLite-Projektion des BayWü-Bestands. */
export async function evaluateBaywueGolden(corpus: Corpus, set: BaywueGoldenSet, modes: readonly SearchMatchMode[] = SEARCH_MATCH_MODES): Promise<GoldenEvaluation[]> {
  const store = corpus.stores.baywue!;
  const evaluations: GoldenEvaluation[] = [];
  for (const matchMode of modes) {
    await store.search(createSearchState({ q: 'Aufwärmen', jurisdictions: ['baywue'], limit: 1, matchMode }));
    evaluations.push(await evaluateGoldenQueries(set.queries, (query) => store.search(createSearchState({ q: query.query, jurisdictions: ['baywue'], limit: GOLDEN_TOP_K, matchMode })), matchMode));
  }
  return evaluations;
}

/* ------------------------------------------------------------------------------------------ */
/* Länderübergreifend (West + BayWü)                                                           */

export const CROSS_JURISDICTION_PATH = `${BAYWUE_SEARCH_DIR}/cross-jurisdiction.json`;
const CROSS_FRAGMENTS = 10;

export interface CrossJurisdictionCase {
  fragment: string;
  /** Ohne Filter: Treffer aus beiden Ländern. */
  bothJurisdictions: boolean;
  /** Filter baywue bzw. west: nur Treffer dieses Landes, und mindestens einer. */
  baywueOnly: boolean;
  westOnly: boolean;
  /** Typfilter über beide Länder: nur Treffer des Typs. */
  typeFilter: { type: string; ok: boolean };
  totals: { all: number; baywue: number; west: number };
  ok: boolean;
}

/**
 * Gleiche Titelbruchstücke in West und BayWü: Wörter ab zehn Zeichen, die in Titeln beider Länder
 * stehen (deterministisch nach Seed gewählt). Geprüft werden die Suche ohne Filter, beide Länderfilter und
 * ein Typfilter über beide Länder – über die Registry, also genau den Weg der gemeinsamen Suche.
 */
export async function crossJurisdictionChecks(corpus: Corpus, seed = BAYWUE_GOLDEN_SEED): Promise<CrossJurisdictionCase[]> {
  const words = (jurisdiction: 'west' | 'baywue'): Map<string, NormRecord> => {
    const map = new Map<string, NormRecord>();
    for (const norm of corpus.records.get(jurisdiction) ?? []) for (const word of normalizeSearchText(norm.meta.title).split(' ')) if (word.length >= 10 && !/\d/u.test(word) && !map.has(word)) map.set(word, norm);
    return map;
  };
  const west = words('west');
  const baywue = words('baywue');
  // Landesnamen der Simulation sind kein gemeinsames Bruchstück, sondern das Unterscheidungsmerkmal.
  const shared = [...baywue.keys()].filter((word) => west.has(word) && !/west|bayern|wuerttemberg|württemberg/u.test(word));
  const fragments = shared.sort((left, right) => seededHash(`${seed}-cross`, left) - seededHash(`${seed}-cross`, right) || left.localeCompare(right)).slice(0, CROSS_FRAGMENTS);
  const cases: CrossJurisdictionCase[] = [];
  for (const fragment of fragments) {
    const all = await corpus.registry.search(createSearchState({ q: fragment, limit: 50 }));
    const onlyBaywue = await corpus.registry.search(createSearchState({ q: fragment, jurisdictions: ['baywue'], limit: 50 }));
    const onlyWest = await corpus.registry.search(createSearchState({ q: fragment, jurisdictions: ['west'], limit: 50 }));
    const type = baywue.get(fragment)!.meta.type;
    const typed = await corpus.registry.search(createSearchState({ q: fragment, jurisdictions: ['west', 'baywue'], types: [type], limit: 50 }));
    const bothJurisdictions = all.hits.some((hit) => hit.jurisdiction === 'west') && all.hits.some((hit) => hit.jurisdiction === 'baywue');
    const baywueOnly = onlyBaywue.hits.length > 0 && onlyBaywue.hits.every((hit) => hit.jurisdiction === 'baywue');
    const westOnly = onlyWest.hits.length > 0 && onlyWest.hits.every((hit) => hit.jurisdiction === 'west');
    // Der Filter wirkt über Typfamilien (Verwaltungsvorschriften, Gesetz ⊃ Zustimmungsgesetz) – geprüft gegen genau diese Erweiterung.
    const allowed = new Set<string>(expandNormTypeFilter([type]));
    const typeOk = typed.hits.length > 0 && typed.hits.every((hit) => allowed.has(hit.type));
    cases.push({
      fragment,
      bothJurisdictions,
      baywueOnly,
      westOnly,
      typeFilter: { type, ok: typeOk },
      totals: { all: all.total, baywue: onlyBaywue.total, west: onlyWest.total },
      ok: bothJurisdictions && baywueOnly && westOnly && typeOk,
    });
  }
  return cases;
}

export interface BaywueGoldenRun {
  set: BaywueGoldenSet;
  generated: boolean;
  evaluations: GoldenEvaluation[];
  cross: CrossJurisdictionCase[];
}

export async function runBaywueGolden(root: string, options: { write: boolean; regenerate?: boolean }): Promise<BaywueGoldenRun> {
  const existing = options.regenerate ? undefined : await readBaywueGolden(root);
  const set = existing ?? generateBaywueGoldenQueries(await loadJurisdictionNorms('baywue', root));
  const corpus = await projectCorpus(root);
  let evaluations: GoldenEvaluation[];
  let cross: CrossJurisdictionCase[];
  try {
    evaluations = await evaluateBaywueGolden(corpus, set);
    cross = await crossJurisdictionChecks(corpus);
  } finally {
    corpus.close();
  }
  if (options.write) {
    await mkdir(join(root, BAYWUE_SEARCH_DIR), { recursive: true });
    if (!existing) await writeFile(join(root, BAYWUE_GOLDEN_QUERIES_PATH), `${JSON.stringify(set, null, 2)}\n`, 'utf8');
    await writeFile(join(root, BAYWUE_GOLDEN_RESULTS_JSON_PATH), `${JSON.stringify({ set: BAYWUE_GOLDEN_QUERIES_PATH, evaluations }, null, 2)}\n`, 'utf8');
    await writeFile(join(root, CROSS_JURISDICTION_PATH), `${JSON.stringify({ evaluatedAt: new Date().toISOString(), cases: cross }, null, 2)}\n`, 'utf8');
    const markdown = renderGoldenMarkdown(set as unknown as GoldenQuerySet, evaluations)
      .replace('lokale SQLite-Projektion des West-Bestands', 'lokale SQLite-Projektion des BayWü-Bestands')
      .replace(/\(data\/audits\/recht-nrw\/search\/golden-queries\.json\)/u, `(${BAYWUE_GOLDEN_QUERIES_PATH})`)
      .replace('# Golden Query Set – Ergebnisse', '# Golden Query Set BayWü – Ergebnisse');
    await writeFile(join(root, BAYWUE_GOLDEN_RESULTS_MD_PATH), `${markdown}\n`, 'utf8');
  }
  return { set, generated: !existing, evaluations, cross };
}

/* ------------------------------------------------------------------------------------------ */
/* Remote-Stichprobe gegen eine laufende Instanz                                                */

export const BAYWUE_REMOTE_SAMPLE_PATH = `${BAYWUE_SEARCH_DIR}/remote-sample-results.json`;

interface RemoteSearchResponse {
  total: number;
  hits: Array<{ slug: string; jurisdiction?: string; unit?: { anchor: string } }>;
}

/**
 * Mindestens 50 deterministische Fälle des Golden Sets (gleichmäßig über die Kategorien, wie bei West) gegen
 * `<url>/api/v1/search?jurisdiction=baywue`. Nur lesende Anfragen; läuft nur auf ausdrücklichen Aufruf.
 * Zusätzlich wird geprüft, dass jeder Treffer zu BayWü gehört (keine Quellleckage über den Länderfilter).
 */
export async function runBaywueRemoteSample(root: string, baseUrl: string, options: { write: boolean }): Promise<{ evaluation: GoldenEvaluation; foreignHits: string[]; sample: number }> {
  const set = await readBaywueGolden(root);
  if (!set) throw new Error(`${BAYWUE_GOLDEN_QUERIES_PATH} fehlt – zuerst search-audit --write`);
  const sample = selectRemoteSample(set as unknown as GoldenQuerySet);
  const base = baseUrl.replace(/\/+$/u, '');
  const foreignHits: string[] = [];
  const evaluation = await evaluateGoldenQueries(sample, async (query) => {
    const params = new URLSearchParams({ q: query.query, jurisdiction: 'baywue', limit: String(GOLDEN_TOP_K) });
    const response = await fetch(`${base}/api/v1/search?${params.toString()}`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} für „${query.query}“`);
    const payload = (await response.json()) as RemoteSearchResponse;
    for (const hit of payload.hits) if (hit.jurisdiction !== undefined && hit.jurisdiction !== 'baywue') foreignHits.push(`${query.id}: ${hit.jurisdiction}/${hit.slug}`);
    return { total: payload.total, hits: payload.hits.map((hit) => ({ slug: hit.slug, ...(hit.unit ? { unit: { anchor: hit.unit.anchor } } : {}) })) };
  }, DEFAULT_SEARCH_MATCH_MODE);
  if (options.write) {
    await mkdir(join(root, BAYWUE_SEARCH_DIR), { recursive: true });
    await writeFile(join(root, BAYWUE_REMOTE_SAMPLE_PATH), `${JSON.stringify({ baseUrl: base, foreignHits, evaluation }, null, 2)}\n`, 'utf8');
  }
  return { evaluation, foreignHits, sample: sample.length };
}
