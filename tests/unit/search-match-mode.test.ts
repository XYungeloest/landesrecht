/**
 * Match-Modi der Suche: Präfixpolitik und AND-Ausdruck des Plans `and-first`, URL-Parameter, Gleichheit von
 * D1-Store und Dateistore in beiden Modi, Rückfall auf den `or-prefix`-Plan (Wörter aus verschiedenen Einheiten,
 * Präfixe auf früheren Wörtern) und Identitätstreffer jenseits einer vollen Kandidatenseite.
 */
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';
import { applyPrefixPolicy, buildFtsAndMatch, buildFtsMatch, buildFtsTitleMatch, buildSearchQueryPlan, createSearchState, DEFAULT_SEARCH_MATCH_MODE, parseQueryTokens, parseSearchState, qualifiesForImplicitPrefix, SEARCH_MATCH_MODES, type SearchMatchMode, type SearchState } from '@landesrecht/search/query.ts';
import type { SearchResultPage } from '@landesrecht/search/ranking.ts';

import { FIXTURE_REFERENCE_DATE, norm, paragraph } from '../helpers/fixture-corpus.ts';

const root = resolveRepositoryRoot();
const NOW = '2026-09-01T00:00:00.000Z';
const openDatabases: SqliteD1Database[] = [];

function corpus(): NormRecord[] {
  const gesetz = (slug: string, title: string, abbr: string, body: Parameters<typeof norm>[0]['versions'][number]['body']): NormRecord =>
    norm({ jurisdiction: 'west', slug, meta: { title, shortTitle: title, abbr, type: 'gesetz' }, versions: [{ versionId: '2024-01-01', simulationValidFrom: '2024-01-01', body }] });
  const records: NormRecord[] = [
    gesetz('schulg-west', 'Schulgesetz für das Land Westdeutschland', 'SchulG West', [
      paragraph('§ 1', 'Auftrag', 'Die Schule verwirklicht den Bildungsauftrag.'),
      paragraph('§ 5', 'Schulpflicht', 'Die Schulpflicht beginnt mit dem sechsten Lebensjahr.'),
      paragraph('§ 12', 'Schulformen', 'Schulformen sind Grundschule, Hauptschule und Gymnasium.'),
    ]),
    gesetz('loeg-west', 'Landesöffnungsgesetz für das Land Westdeutschland', 'LÖG West', [
      paragraph('§ 1', 'Öffnungszeiten', 'Verkaufsstellen dürfen werktags geöffnet sein.'),
      paragraph('§ 5', 'Ausnahmen', 'Die Gemeinde kann Ausnahmen zulassen.'),
    ]),
    gesetz('verfassung-fuer-das-land-westdeutschland', 'Verfassung für das Land Westdeutschland', 'LV West', [
      paragraph('§ 1', 'Grundlagen', 'Das Land Westdeutschland ist ein Land der Simulation.'),
    ]),
  ];
  // Störnormen: nennen „Verfassung“, „Land“ und „Westdeutschland“ häufig im Text und ranken im Volltext vor der Verfassung.
  for (let index = 1; index <= 30; index += 1) {
    records.push(gesetz(`stoerer-${index}-west`, `Störgesetz ${index} über Land und Verfassung`, `StörG ${index}`, [
      paragraph('§ 1', 'Verfassung', 'Verfassung für das Land Westdeutschland wird hier mehrfach genannt: Verfassung, Land, Westdeutschland, Verfassung für das Land.'),
    ]));
  }
  return records;
}

async function projectWest(records: readonly NormRecord[]): Promise<NormStore> {
  const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
  openDatabases.push(db);
  executePlan(db, buildProjectionPlan(records, { jurisdiction: 'west', full: true, now: NOW }));
  return createD1NormStore(db, 'west');
}

afterAll(() => {
  for (const db of openDatabases) db.close();
});

describe('Match-Modus: Plan und Präfixpolitik', () => {
  it('kennt beide Modi; der Standard ist explizit dokumentiert', () => {
    expect(SEARCH_MATCH_MODES).toEqual(['or-prefix', 'and-first']);
    expect(SEARCH_MATCH_MODES).toContain(DEFAULT_SEARCH_MATCH_MODE);
    expect(buildSearchQueryPlan(createSearchState({ q: 'Schulgesetz' })).matchMode).toBe(DEFAULT_SEARCH_MATCH_MODE);
    expect(buildSearchQueryPlan(createSearchState({ q: 'Schulgesetz', matchMode: 'and-first' })).matchMode).toBe('and-first');
  });

  it('and-first: Präfix nur am letzten Wort, nicht bei kurzen Wörtern, Zahlen oder Funktionswörtern', () => {
    const tokens = (q: string, matchMode: SearchMatchMode = 'and-first') => buildSearchQueryPlan(createSearchState({ q, matchMode })).tokens.map((token) => `${token.normalized}${token.prefix ? '*' : ''}`);
    expect(tokens('Verfassung für das Land Westdeutschland')).toEqual(['verfassung', 'fur', 'das', 'land', 'westdeutschland']);
    expect(tokens('Schulges')).toEqual(['schulges*']);
    expect(tokens('Schulgesetz Westd')).toEqual(['schulgesetz', 'westd*']);
    expect(tokens('LÖG West')).toEqual(['log', 'west']);
    expect(tokens('Gesetz über die')).toEqual(['gesetz', 'uber', 'die']);
    expect(tokens('Anlage 12')).toEqual(['anlage', '12']);
    expect(tokens('Schul* West')).toEqual(['schul*', 'west']);
    expect(tokens('Verfassung für das Land Westdeutschland', 'or-prefix')).toEqual(['verfassung', 'fur', 'das', 'land', 'westdeutschland']);
    expect(qualifiesForImplicitPrefix(parseQueryTokens('abc')[0]!)).toBe(false);
    expect(qualifiesForImplicitPrefix(parseQueryTokens('abcd')[0]!)).toBe(true);
    expect(applyPrefixPolicy(parseQueryTokens('a b'), 'or-prefix').every((token) => !token.prefix)).toBe(true);
  });

  it('bildet den AND-Ausdruck mit Schreibvarianten und Spaltenbereich; der OR-Ausdruck bleibt unverändert', () => {
    const plan = buildSearchQueryPlan(createSearchState({ q: 'Verfassung für das Land Westd', matchMode: 'and-first' }));
    // „verfaßung“: Rückübersetzung ss→ß als Zusatzvariante (der FTS5-Tokenizer faltet ß nicht); trifft hier nichts.
    expect(buildFtsAndMatch(plan)).toBe('("verfassung" OR "verfaßung") AND ("fur" OR "fuer") AND ("das") AND ("land") AND ("westd"*)');
    expect(buildFtsMatch(plan)).toBe('("verfassung"* OR "verfaßung"*) OR ("fur"* OR "fuer"*) OR ("das"*) OR ("land"*) OR ("westd"*)');
    expect(buildFtsTitleMatch(plan)).toBe('{title short_title abbr}: (("verfassung" OR "verfaßung") AND ("fur" OR "fuer") AND ("das") AND ("land") AND ("westd"*))');
    expect(buildFtsTitleMatch(buildSearchQueryPlan(createSearchState({ q: 'Schulg', scope: 'title' })))).toBeNull();
    const scoped = buildSearchQueryPlan(createSearchState({ q: 'Prüfstand "Testfall"', scope: 'title', matchMode: 'and-first' }));
    expect(buildFtsAndMatch(scoped)).toBe('{title short_title abbr}: (("prufstand"* OR "pruefstand"*) AND ("testfall"))');
    expect(buildFtsAndMatch(buildSearchQueryPlan(createSearchState({ q: '§ 5', matchMode: 'and-first' })))).toBeNull();
  });

  it('liest den URL-Parameter match fail-safe', () => {
    expect(parseSearchState(new URLSearchParams('q=x&match=and-first')).matchMode).toBe('and-first');
    expect(parseSearchState(new URLSearchParams('q=x&match=or-prefix')).matchMode).toBe('or-prefix');
    expect(parseSearchState(new URLSearchParams('q=x&match=unsinn')).matchMode).toBeUndefined();
  });
});

describe('Match-Modus: D1-Store gegen Dateistore und Rückfall', () => {
  let d1: NormStore;
  let files: NormStore;
  const records = corpus();
  const search = (store: NormStore, q: string, overrides: Partial<SearchState> = {}): Promise<SearchResultPage> => store.search(createSearchState({ q, jurisdictions: ['west'], ...overrides }));
  const summary = (page: SearchResultPage): string[] => page.hits.map((hit) => `${hit.slug}:${hit.matchKind}:${hit.unit?.anchor ?? ''}`);

  beforeAll(async () => {
    d1 = await projectWest(records);
    files = createFileNormStore('west', records, { asOf: FIXTURE_REFERENCE_DATE });
  });

  it('beide Stores liefern in beiden Modi dieselben Treffer und Trefferarten', async () => {
    const queries = ['SchulG West', 'LÖG West', 'LOEG West', 'Schulgesetz für das Land Westdeutschland', '§ 5 LÖG West', '§ 5 SchulG West', 'Schulpflicht Gymnasium', 'Gymnasium', 'Verkaufsstellen werktags', 'Quantenflugzeugsteuer'];
    // Angefangene Wörter: nur im Plan and-first stimmen SQL (Präfix am letzten Wort) und Bewertung im Speicher überein;
    // im Plan or-prefix setzt SQL Präfixe, die Bewertung verlangt ganze Wörter (Kandidat bleibt als Volltexttreffer).
    const typed = ['Schulgesetz Westd', 'Schulges'];
    for (const matchMode of SEARCH_MATCH_MODES) {
      for (const q of matchMode === 'and-first' ? [...queries, ...typed] : queries) {
        const [left, right] = await Promise.all([search(d1, q, { matchMode, limit: 50 }), search(files, q, { matchMode, limit: 50 })]);
        expect(summary(left).sort(), `${q} (${matchMode})`).toEqual(summary(right).sort());
        expect(left.total, `${q} (${matchMode}) total`).toBe(right.total);
      }
    }
  });

  it('and-first: Titelwörter treffen streng; Tippvervollständigung am letzten Wort; Nulltreffer bleiben leer', async () => {
    const strict = await search(d1, 'Schulgesetz für das Land Westdeutschland', { matchMode: 'and-first' });
    expect(strict.hits[0]).toMatchObject({ slug: 'schulg-west', matchKind: 'identity' });
    expect(strict.total).toBe(1);
    const typed = await search(d1, 'Schulgesetz Westd', { matchMode: 'and-first' });
    expect(typed.hits.map((hit) => [hit.slug, hit.matchKind])).toEqual([['schulg-west', 'title']]);
    expect((await search(d1, 'Quantenflugzeugsteuer', { matchMode: 'and-first' })).total).toBe(0);
    expect((await search(d1, 'Schulgesetz Quantenflugzeugsteuer', { matchMode: 'and-first' })).total).toBe(0);
  });

  it('and-first fällt bei Wörtern aus verschiedenen Einheiten und Präfixen auf früheren Wörtern auf den OR-Plan zurück', async () => {
    // „Schulpflicht“ steht in § 5, „Gymnasium“ in § 12: keine Einheit enthält beide, die Norm aber schon.
    const crossUnit = await search(d1, 'Schulpflicht Gymnasium', { matchMode: 'and-first' });
    expect(crossUnit.hits.map((hit) => hit.slug)).toEqual(['schulg-west']);
    expect(crossUnit.total).toBe(1);
    expect(summary(crossUnit)).toEqual(summary(await search(d1, 'Schulpflicht Gymnasium', { matchMode: 'or-prefix' })));
    // „Schulg“ ist kein ganzes Wort; nur der OR-Plan setzt Präfixe auf frühere Wörter.
    const earlyPrefix = await search(d1, 'Schulg Westdeutschland', { matchMode: 'and-first' });
    expect(earlyPrefix.hits.map((hit) => hit.slug)).toContain('schulg-west');
  });

  it('Identitätstreffer hinter einer vollen Kandidatenseite werden in beiden Modi nachgesucht', async () => {
    for (const matchMode of SEARCH_MATCH_MODES) {
      const page = await search(d1, 'Verfassung für das Land Westdeutschland', { matchMode, limit: 5 });
      expect(page.hits[0], matchMode).toMatchObject({ slug: 'verfassung-fuer-das-land-westdeutschland', matchKind: 'identity' });
      expect(page.total, matchMode).toBeGreaterThan(5);
      const abbr = await search(d1, 'LÖG West', { matchMode, limit: 1 });
      expect(abbr.hits[0], matchMode).toMatchObject({ slug: 'loeg-west', matchKind: 'identity' });
    }
  });

  it('Strukturadressen: Titel mit Strukturangabe wird im and-first-Plan ohne OR-Rückfall gefunden', async () => {
    const avv = norm({ jurisdiction: 'west', slug: 'avv-74-west', meta: { title: 'Allgemeine Verwaltungsvorschrift zu § 74 Absatz 4 des Landesbesoldungsgesetzes', type: 'allgemeine-verwaltungsvorschrift' }, versions: [{ versionId: '2024-01-01', simulationValidFrom: '2024-01-01', body: [{ type: 'section', label: '1', title: 'Hinweis', children: [{ type: 'paragraphText', text: 'Die Beträge sind zu beachten.' }] }] }] });
    const store = await projectWest([...records, avv]);
    for (const matchMode of SEARCH_MATCH_MODES) {
      const page = await search(store, avv.meta.title, { matchMode });
      expect(page.hits.map((hit) => [hit.slug, hit.matchKind]), matchMode).toEqual([['avv-74-west', 'title']]);
      expect((await search(store, '§ 74 Absatz 4 Landesbesoldungsgesetzes', { matchMode })).hits.map((hit) => hit.slug), matchMode).toEqual(['avv-74-west']);
      expect((await search(store, '§ 1 Landesbesoldungsgesetzes', { matchMode })).total, matchMode).toBe(0);
    }
  });
});
