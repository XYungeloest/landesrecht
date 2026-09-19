import { describe, expect, it } from 'vitest';

import { buildFtsConjuncts, buildFtsMatch, buildSearchQueryPlan, createSearchState, extractStructuralIntents, parseSearchState } from '@landesrecht/search/query.ts';
import { buildSnippet, mergeSearchPages, runSearch } from '@landesrecht/search/ranking.ts';
import { SEARCH_RANK_WEIGHTS, SEARCH_UNIT_COLUMNS } from '@landesrecht/search/schema.ts';
import { buildSearchDocument, collectBodyUnits, SEARCHABLE_IDENTIFIER_SYSTEMS } from '@landesrecht/search/units.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE } from '../helpers/fixture-corpus.ts';

const norms = buildFixtureNorms();
const documents = norms.flatMap((record) => record.versions.map((version) => buildSearchDocument(record, version, FIXTURE_REFERENCE_DATE)));

describe('Sucheinheiten', () => {
  it('bildet Trefferstellen mit Strukturadressen und lässt zitierten Text aus', () => {
    const ost = norms.find((record) => record.meta.jurisdiction === 'ost')!;
    const { units, supplement } = collectBodyUnits(ost.versions[0]!.body);
    expect(units.map((unit) => unit.anchor)).toEqual(['artikel-1']);
    expect(units[0]!.references).toEqual({ article: '1' });
    // Zitierter Text ist keine Trefferstelle, bleibt aber als Ergänzungstext durchsuchbar.
    expect(supplement).toContain('Zitierter Text');
    const west = norms.find((record) => record.meta.jurisdiction === 'west')!;
    const westUnits = collectBodyUnits(west.versions[1]!.body).units;
    expect(westUnits.map((unit) => unit.anchor)).toEqual(['paragraph-1', 'paragraph-2']);
    expect(westUnits[1]!.references).toEqual({ paragraph: '2', subsections: ['1', '2', '3'] });
    expect(westUnits[1]!.body).not.toContain('Begriffe');
  });

  it('erzeugt je Fassung ein Dokument mit Metadaten-Einheit', () => {
    expect(documents).toHaveLength(5);
    const document = documents.find((entry) => entry.id === 'west:testgesetz-west:2026-03-01')!;
    expect(document.versionKind).toBe('current');
    expect(document.units.at(-1)!.type).toBe('metadata');
    expect(document.units.at(-1)!.body).toContain('Prüfstand');
  });

  it('macht nur ausdrücklich gelistete externe Kennungen suchbar (BayRS-Gliederungsnummer)', () => {
    const west = norms.find((record) => record.meta.jurisdiction === 'west')!;
    const version = west.versions.at(-1)!;
    const withIdentifiers = { ...west, meta: { ...west.meta, externalIdentifiers: [{ system: 'bayrs', value: '2034.4-F' }, { system: 'sgv-nrw', value: '223' }] } };
    const metadata = buildSearchDocument(withIdentifiers, version, FIXTURE_REFERENCE_DATE).units.at(-1)!.body;
    expect(metadata).toContain('BayRS 2034.4-F');
    // Nicht gelistete Systeme bleiben draußen: Sonst änderte jede neue Kennung still den Suchbestand ihres Landes.
    expect(metadata).not.toContain('223');
    expect(SEARCHABLE_IDENTIFIER_SYSTEMS).toEqual({ bayrs: 'BayRS', 'gliederungsnummer-sh': 'Gl.Nr.' });
  });

  it('macht die NSH-Gliederungsnummer als „Gl.Nr. …“ suchbar; West-Kennungen bleiben draußen', () => {
    const west = norms.find((record) => record.meta.jurisdiction === 'west')!;
    const version = west.versions.at(-1)!;
    const nsh = { ...west, meta: { ...west.meta, externalIdentifiers: [{ system: 'gliederungsnummer-sh', value: '2134.12' }, { system: 'recht-nrw', value: '2020-1' }] } };
    const metadata = buildSearchDocument(nsh, version, FIXTURE_REFERENCE_DATE).units.at(-1)!.body;
    expect(metadata).toContain('Gl.Nr. 2134.12');
    expect(metadata).not.toContain('2020-1');
  });
});

describe('Abfrageplan', () => {
  it('erkennt Paragraphen, Artikel und Absätze', () => {
    expect(extractStructuralIntents('§ 3 Absatz 2 Schulgesetz').references).toEqual([{ kind: 'paragraph', number: '3', subsection: '2' }]);
    expect(extractStructuralIntents('§§ 3, 4 und 5a').references.map((intent) => intent.number)).toEqual(['3', '4', '5a']);
    expect(extractStructuralIntents('Art. 5 Abs. 1').references).toEqual([{ kind: 'article', number: '5', subsection: '1' }]);
    expect(extractStructuralIntents('Absatz 2').references).toEqual([{ kind: 'subsection', number: '2' }]);
    // Fehlendes Leerzeichen der Quelle („§ 59MBG NSH“): keine Adresse „§ 59m“, der Text bleibt Freitext.
    expect(extractStructuralIntents('nach § 59MBG NSH').references).toEqual([]);
    expect(extractStructuralIntents('§ 13a und § 2').references.map((intent) => intent.number)).toEqual(['13a', '2']);
  });

  it('bildet FTS-Ausdrücke nur bei Freitext', () => {
    const reference = buildSearchQueryPlan(createSearchState({ q: '§ 2a' }));
    expect(buildFtsMatch(reference)).toBeNull();
    const plan = buildSearchQueryPlan(createSearchState({ q: 'Prüfstand "Testfall"', scope: 'title' }));
    expect(buildFtsMatch(plan)).toBe('{title short_title abbr}: ("prufstand"* OR "pruefstand"*) OR ("testfall")');
    expect(buildFtsConjuncts(plan)).toHaveLength(2);
    expect(SEARCH_RANK_WEIGHTS).toBe(`bm25(${SEARCH_UNIT_COLUMNS.map((column) => (['title', 'short_title', 'abbr'].includes(column) ? 10 : ['label', 'heading'].includes(column) ? 2 : column === 'body' ? 1 : 0)).join(',')})`);
  });

  it('parst URL-Parameter fail-safe', () => {
    const state = parseSearchState(new URLSearchParams('q=x&jurisdiction=west,unbekannt&type=gesetz&type=nix&versionScope=historical&limit=999&offset=-5&validOn=2024-13-01'));
    expect(state.jurisdictions).toEqual(['west']);
    expect(state.types).toEqual(['gesetz']);
    expect(state.versionScope).toBe('historical');
    expect(state.limit).toBe(100);
    expect(state.offset).toBe(0);
    expect(state.validOn).toBeUndefined();
    expect(parseSearchState(new URLSearchParams('')).jurisdictions).toHaveLength(4);
  });
});

describe('Bewertung und Zusammenführung', () => {
  it('rangiert Identität vor Titel vor Textstellen', () => {
    const identity = runSearch(documents, createSearchState({ q: 'WTestG' }), buildSearchQueryPlan(createSearchState({ q: 'WTestG' })));
    expect(identity.hits[0]!.matchKind).toBe('identity');
    const unit = runSearch(documents, createSearchState({ q: 'Sollergebnis' }), buildSearchQueryPlan(createSearchState({ q: 'Sollergebnis' })));
    expect(unit.total).toBe(1);
    expect(unit.hits[0]!.matchKind).toBe('unit');
    expect(unit.hits[0]!.unit?.url).toBe('/west/norm/testgesetz-west/#paragraph-2');
  });

  it('findet Strukturadressen und historische Fassungen nach Geltungstag', () => {
    const state = createSearchState({ q: '§ 2 Absatz 3', versionScope: 'all' });
    const page = runSearch(documents, state, buildSearchQueryPlan(state));
    expect(page.hits.map((hit) => hit.versionId)).toEqual(['2026-03-01']);
    const dated = createSearchState({ q: 'Testfall', validOn: '2024-06-01' });
    const datedPage = runSearch(documents, dated, buildSearchQueryPlan(dated));
    expect(datedPage.hits.map((hit) => [hit.versionId, hit.versionKind])).toEqual([['2023-12-01', 'historical']]);
    expect(datedPage.hits[0]!.unit?.url).toBe('/west/norm/testgesetz-west/version/2023-12-01/#paragraph-2');
    const article = createSearchState({ q: 'Art. 5 Abs. 2' });
    expect(runSearch(documents, article, buildSearchQueryPlan(article)).hits[0]!.unit?.anchor).toBe('artikel-5');
  });

  it('führt Seiten mehrerer Stores global zusammen', () => {
    const state = createSearchState({ q: '', sort: 'title', limit: 2, offset: 1 });
    const left = runSearch(documents.filter((entry) => entry.jurisdiction === 'west'), { ...state, offset: 0, limit: 3 }, buildSearchQueryPlan(state));
    const right = runSearch(documents.filter((entry) => entry.jurisdiction === 'baywue'), { ...state, offset: 0, limit: 3 }, buildSearchQueryPlan(state));
    const merged = mergeSearchPages([left, right], state);
    expect(merged.total).toBe(2);
    expect(merged.hits.map((hit) => hit.jurisdiction)).toEqual(['west']);
  });

  it('die Registry sucht über alle Länder und je Land identisch', async () => {
    const registry = createStoreRegistry(Object.fromEntries((['west', 'nsh', 'ost', 'baywue'] as const).map((jurisdiction) => [jurisdiction, createFileNormStore(jurisdiction, norms, { asOf: FIXTURE_REFERENCE_DATE })])));
    const all = await registry.search(createSearchState({ q: 'Gemeinderat' }));
    expect(all.hits.map((hit) => hit.jurisdiction)).toEqual(['baywue']);
    const single = await registry.search(createSearchState({ q: 'Gemeinderat', jurisdictions: ['west'] }));
    expect(single.total).toBe(0);
    const browse = await registry.search(createSearchState({ q: '', sort: 'title' }));
    expect(browse.total).toBe(4);
  });

  it('schneidet Snippets nur an Wortgrenzen und ohne Überschriftsdopplung', () => {
    expect(buildSnippet({ label: '§ 3', heading: 'Schulpflicht', body: 'Schulpflichtig ist, wer hier wohnt.' })).toBe('Schulpflichtig ist, wer hier wohnt.');
    expect(buildSnippet({ label: '§ 3', heading: 'Schulpflicht', body: 'Schulpflicht: Es gilt.' })).toBe('Es gilt.');
    expect(buildSnippet({ label: '', heading: '', body: 'wort '.repeat(100) }, 40).endsWith('…')).toBe(true);
  });
});
