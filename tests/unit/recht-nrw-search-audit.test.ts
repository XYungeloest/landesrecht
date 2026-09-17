/**
 * Suchintegrität nach einem RECHT.NRW-Import (ohne Netz; lokale SQLite statt D1): Anfrageerkennung für §-, Artikel-
 * und LRMB-Nummernadressen, Titel- und Abkürzungssuche, Typ- und Jurisdiktionsfilter, Ausschluss synthetischer
 * Fixtures, doppelte Treffer, FTS5-Integrität sowie `runSearchAudit` auf temporären Beständen.
 */
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getStructuralReference } from '@landesrecht/legal-core/lib/body.ts';
import { loadAllNorms, loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { ADMINISTRATIVE_REGULATION_TYPES, isSyntheticFixtureNorm, previousDay, type NormBodyBlock, type NormRecord, type NormType } from '@landesrecht/legal-core/lib/schema.ts';
import { DEFAULT_AUDIT_SEED, DEFAULT_FAST_SAMPLE, isSyntheticFixture, mergeSlices, normAuditFeatures, partitionSlugs, runSearchAudit, runSearchAuditSlice, SEARCH_AUDIT_CHECKS, SEARCH_AUDIT_NORM_CHECKS, seededHash, selectAuditNorms, selectStratifiedSample, type NormAuditFeatures, type SearchAuditSlice } from '@landesrecht/importer-recht-nrw/common/search-audit.ts';
import { computeGoldenMetrics, evaluateGoldenLocally, generateGoldenQueries, judgeOutcome, renderGoldenMarkdown, selectRemoteSample, type GoldenQuery } from '@landesrecht/importer-recht-nrw/common/search-golden.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { createStoreRegistry, type StoreRegistry } from '@landesrecht/runtime/registry.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';
import { buildSearchQueryPlan, createSearchState, extractStructuralIntents, SEARCH_MATCH_MODES, type SearchState } from '@landesrecht/search/query.ts';
import type { SearchHit, SearchResultPage } from '@landesrecht/search/ranking.ts';
import { buildSearchDocument } from '@landesrecht/search/units.ts';

const repoRoot = resolveRepositoryRoot();
const NOW = '2026-01-01T00:00:00.000Z';

/* ------------------------------------------------------------------------------------------ */
/* Temporärer Bestand (nie unter content/ des Repositorys).                                    */

interface VersionInput {
  versionId: string;
  body: NormBodyBlock[];
}

interface NormInput {
  jurisdiction: JurisdictionId;
  slug: string;
  title: string;
  shortTitle?: string;
  abbr?: string;
  type: NormType;
  subjects: string[];
  dataset?: 'synthetic-fixture';
  versions: VersionInput[];
}

function paragraph(number: string, title: string, ...texts: string[]): NormBodyBlock {
  return { type: 'paragraph', label: `§ ${number}`, title, children: texts.map((text, index) => ({ type: 'subparagraph', label: `(${index + 1})`, text, children: [] })) };
}

function article(number: string, title: string, ...texts: string[]): NormBodyBlock {
  return { type: 'article', label: `Art. ${number}`, title, children: texts.map((text, index) => ({ type: 'subparagraph', label: `(${index + 1})`, text, children: [] })) };
}

/** Nummerierte Gliederung einer Verwaltungsvorschrift („2“, „2.1“, „4.2.3“) wie im LRMB-Import. */
function numbered(type: 'section' | 'subsection', label: string, title: string | undefined, text: string | undefined, children: NormBodyBlock[] = []): NormBodyBlock {
  const block: NormBodyBlock = { type, label, children: [...(text ? [{ type: 'paragraphText' as const, text }] : []), ...children] };
  if (title) block.title = title;
  return block;
}

async function writeNorm(contentRoot: string, input: NormInput): Promise<void> {
  const directory = join(contentRoot, 'norms', input.jurisdiction, input.slug);
  await mkdir(join(directory, 'versions'), { recursive: true });
  const citation = `${input.title} vom 1. Dezember 2023`;
  const meta: Record<string, unknown> = {
    id: `${input.jurisdiction}:${input.slug}`, slug: input.slug, jurisdiction: input.jurisdiction, title: input.title, type: input.type, status: 'in-force',
    subjects: input.subjects, keywords: [], initialCitation: citation, predecessor: null, successor: null, relations: [], externalIdentifiers: [], sourceReferences: [],
  };
  if (input.shortTitle) meta.shortTitle = input.shortTitle;
  if (input.abbr) meta.abbr = input.abbr;
  if (input.dataset) meta.dataset = input.dataset;
  const history = {
    initialVersionId: input.versions[0]!.versionId,
    entries: input.versions.map((version, index) => ({ date: version.versionId, type: index === 0 ? 'initial' : 'amendment', title: index === 0 ? 'Ausgangsfassung' : 'Änderung', citation, affectingVersionId: version.versionId })),
  };
  await writeFile(join(directory, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await writeFile(join(directory, 'history.json'), `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  for (const [index, version] of input.versions.entries()) {
    const next = input.versions[index + 1];
    const file = { versionId: version.versionId, simulationValidFrom: version.versionId, simulationValidTo: next ? previousDay(next.versionId) : null, citation, changeNote: index === 0 ? 'Ausgangsfassung' : 'Folgefassung', body: version.body };
    await writeFile(join(directory, 'versions', `${version.versionId}.json`), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }
}

const SCHULG: NormInput = {
  jurisdiction: 'west', slug: 'schulg-west', title: 'Schulgesetz für das Land Westdeutschland', shortTitle: 'Schulgesetz', abbr: 'SchulG', type: 'gesetz', subjects: ['Bildungswesen'],
  versions: [
    { versionId: '2023-12-01', body: [
      paragraph('1', 'Auftrag der Schule', 'Die Schule verwirklicht den Bildungs- und Erziehungsauftrag.'),
      paragraph('2', 'Schulformen', 'Schulformen sind Grundschule, Hauptschule und Gymnasium.'),
      paragraph('5', 'Schulpflicht', 'Die Schulpflicht beginnt mit dem sechsten Lebensjahr.', 'Die Schulpflicht nach Absatz 1 Nr. 2 endet nach zehn Schuljahren.'),
      paragraph('6', 'Zuständigkeit', 'Die Zuständigkeit der oberen Schulaufsichtsbehörde bestimmt das Ministerium.'),
    ] },
    { versionId: '2026-03-01', body: [
      paragraph('1', 'Auftrag der Schule', 'Die Schule verwirklicht den Bildungs- und Erziehungsauftrag.'),
      paragraph('2', 'Schulformen', 'Schulformen sind Grundschule, Hauptschule und Gymnasium.'),
      paragraph('5', 'Schulpflicht', 'Die Schulpflicht beginnt mit dem sechsten Lebensjahr.', 'Die Schulpflicht endet nach elf Schuljahren.', 'Ausnahmen genehmigt die Schulaufsicht.'),
      paragraph('6', 'Zuständigkeit', 'Die Zuständigkeit der oberen Schulaufsichtsbehörde bestimmt das Ministerium.'),
    ] },
  ],
};

const VV_LHUNDG: NormInput = {
  jurisdiction: 'west', slug: 'vv-lhundg-west', title: 'Verwaltungsvorschriften zum Landeshundegesetz', abbr: 'VV LHundG', type: 'verwaltungsvorschrift', subjects: ['Ordnungsrecht'],
  versions: [{ versionId: '2023-12-01', body: [
    { type: 'paragraphText', text: 'Zum Landeshundegesetz ergehen folgende Verwaltungsvorschriften.' },
    numbered('section', '1', 'Allgemeines', 'Die Vorschriften dienen der Abwehr von Gefahren durch Hunde.'),
    numbered('section', '2', 'Zu § 2 (Allgemeine Pflichten)', 'Hunde sind so zu halten, dass von ihnen keine Gefahr ausgeht.', [
      numbered('subsection', '2.1', undefined, 'Die Anleinpflicht gilt in Fußgängerzonen und öffentlichen Parkanlagen.'),
    ]),
    numbered('section', '4', 'Zu § 4 (Erlaubnis)', undefined, [
      numbered('subsection', '4.2', 'Sachkunde', 'Die Sachkunde ist gegenüber der zuständigen Behörde nachzuweisen.', [
        numbered('subsection', '4.2.3', 'Sachkundeprüfung', 'Die Sachkundeprüfung nehmen anerkannte Sachverständige ab.'),
      ]),
    ]),
  ] }],
};

const DVO_KIBIZ: NormInput = {
  jurisdiction: 'west', slug: 'dvo-kibiz-west', title: 'Verordnung zur Durchführung des Kinderbildungsgesetzes', abbr: 'DVO KiBiz', type: 'verordnung', subjects: ['Kinder- und Jugendhilfe'],
  versions: [{ versionId: '2023-12-01', body: [
    paragraph('1', 'Geltungsbereich', 'Diese Verordnung gilt für Kindertageseinrichtungen.'),
    paragraph('2', 'Gruppenstärke', 'Eine Gruppe umfasst höchstens zwanzig Kinder.', 'Ausnahmen lässt das Jugendamt zu.'),
    paragraph('3', 'Inkrafttreten', 'Diese Verordnung tritt am Tage nach der Verkündung in Kraft.'),
  ] }],
};

const RUNDERLASS: NormInput = {
  jurisdiction: 'west', slug: 'kampfmittelbeseitigung-west', title: 'Kostentragung in der Kampfmittelbeseitigung', type: 'runderlass', subjects: ['Gefahrenabwehr'],
  versions: [{ versionId: '2023-12-01', body: [
    numbered('section', '1', 'Grundsatz', 'Die Kosten der Kampfmittelbeseitigung trägt das Land.'),
    numbered('section', '2', 'Zuständigkeit', 'Zuständig ist die Bezirksregierung.'),
  ] }],
};

const GO_BAYWUE: NormInput = {
  jurisdiction: 'baywue', slug: 'gemeindeordnung-baywue', title: 'Gemeindeordnung für den Freistaat Bayern-Württemberg', abbr: 'GO BayWü', type: 'gesetz', subjects: ['Kommunalrecht'],
  versions: [{ versionId: '2023-12-01', body: [
    article('1', 'Wesen der Gemeinden', 'Die Gemeinden sind Gebietskörperschaften.'),
    article('3', 'Zuständigkeit', 'Die Zuständigkeit der Gemeinden umfasst alle örtlichen Angelegenheiten.', 'Übertragene Aufgaben erfüllen die Gemeinden nach Weisung.'),
  ] }],
};

/** Synthetische Fixture mit Präfix und Kennzeichen. */
const FIXTURE_PREFIXED: NormInput = {
  jurisdiction: 'west', slug: 'testfixture-schulgesetz-west', title: 'Testfixture Schulgesetz für das Land Westdeutschland (synthetisch)', abbr: 'TF-SchulG West', type: 'gesetz', subjects: ['Bildungswesen'], dataset: 'synthetic-fixture',
  versions: [{ versionId: '2023-12-01', body: [paragraph('1', 'Zuständigkeit', 'Die Zuständigkeit dieser Testfixture ist frei erfunden.')] }],
};

/** Synthetische Fixture nur mit Kennzeichen `dataset` (ohne Präfix) und einer LRMB-Nummer. */
const FIXTURE_FLAGGED: NormInput = {
  jurisdiction: 'west', slug: 'probevorschrift-hundehaltung-west', title: 'Synthetische Probevorschrift zur Hundehaltung', type: 'verwaltungsvorschrift', subjects: ['Ordnungsrecht'], dataset: 'synthetic-fixture',
  versions: [{ versionId: '2023-12-01', body: [numbered('section', '4.2.3', 'Probe', 'Synthetischer Text zur Sachkundeprüfung.')] }],
};

const PRODUCTION: readonly NormInput[] = [SCHULG, VV_LHUNDG, DVO_KIBIZ, RUNDERLASS, GO_BAYWUE];
const FIXTURES: readonly NormInput[] = [FIXTURE_PREFIXED, FIXTURE_FLAGGED];
const FIXTURE_SLUGS = FIXTURES.map((norm) => norm.slug);

const temporaryRoots: string[] = [];

/** Temporärer Wurzelordner: Migrationen, Produktionsbestand unter content/ und Fixtures unter tests/fixtures/content/. */
async function createRoot(label: string, content: readonly NormInput[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `landesrecht-search-audit-${label}-`));
  temporaryRoots.push(root);
  await cp(join(repoRoot, 'data', 'd1'), join(root, 'data', 'd1'), { recursive: true });
  for (const norm of content) await writeNorm(join(root, 'content'), norm);
  for (const norm of FIXTURES) await writeNorm(join(root, 'tests', 'fixtures', 'content'), norm);
  return root;
}

interface ProjectedRoot {
  records: NormRecord[];
  databases: Record<JurisdictionId, SqliteD1Database>;
  stores: Record<JurisdictionId, NormStore>;
  registry: StoreRegistry;
}

const openDatabases: SqliteD1Database[] = [];

/** Wie in Produktion: je Jurisdiktion eine Datenbank mit Vollprojektion, darüber die Registry. */
async function projectRoot(root: string): Promise<ProjectedRoot> {
  const records: NormRecord[] = [];
  const databases = {} as Record<JurisdictionId, SqliteD1Database>;
  const stores = {} as Record<JurisdictionId, NormStore>;
  for (const jurisdiction of JURISDICTION_IDS) {
    const norms = await loadJurisdictionNorms(jurisdiction, root);
    records.push(...norms);
    const db = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
    openDatabases.push(db);
    executePlan(db, buildProjectionPlan(norms, { jurisdiction, full: true, now: NOW }));
    databases[jurisdiction] = db;
    stores[jurisdiction] = createD1NormStore(db, jurisdiction);
  }
  return { records, databases, stores, registry: createStoreRegistry(stores) };
}

function countRows(db: SqliteD1Database, table: string, where = '', params: string[] = []): number {
  return Number((db.native.prepare(`SELECT COUNT(*) AS c FROM ${table}${where ? ` WHERE ${where}` : ''}`).get(...params) as { c: number }).c);
}

const hitKey = (hit: SearchHit): string => `${hit.jurisdiction}:${hit.slug}:${hit.versionId}`;

function expectNoDuplicates(page: SearchResultPage, context: string): void {
  const keys = page.hits.map(hitKey);
  expect(new Set(keys).size, context).toBe(keys.length);
  expect(page.hits.length, context).toBe(Math.min(page.total, page.limit));
}

function totalSearchUnits(records: readonly NormRecord[]): number {
  return records.reduce((sum, record) => sum + record.versions.reduce((inner, version) => inner + buildSearchDocument(record, version, EDITORIAL_REFERENCE_DATE).units.length, 0), 0);
}

afterAll(async () => {
  for (const db of openDatabases) db.close();
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------------------------ */

describe('Suchintegrität: Anfrageerkennung', () => {
  it('erkennt §- und Artikeladressen mit Absatz', () => {
    expect(extractStructuralIntents('§ 5 SchulG').references).toEqual([{ kind: 'paragraph', number: '5' }]);
    const paragraphPlan = buildSearchQueryPlan(createSearchState({ q: '§ 5 SchulG' }));
    expect(paragraphPlan.tokens.map((token) => token.normalized)).toEqual(['schulg']);
    expect(paragraphPlan.identityVariants).toEqual([]);
    expect(paragraphPlan.freeText).toBe(true);
    expect(extractStructuralIntents('§ 5 Abs. 2 SchulG').references).toEqual([{ kind: 'paragraph', number: '5', subsection: '2' }]);
    expect(extractStructuralIntents('Art. 3').references).toEqual([{ kind: 'article', number: '3' }]);
    expect(buildSearchQueryPlan(createSearchState({ q: 'Art. 3' })).freeText).toBe(false);
    expect(extractStructuralIntents('Artikel 3 Absatz 2').references).toEqual([{ kind: 'article', number: '3', subsection: '2' }]);
  });

  it('erkennt LRMB-Nummernadressen („Nr.“, „Nummer“, „Ziffer“) mit Dezimalgliederung', () => {
    const lrmb = buildSearchQueryPlan(createSearchState({ q: 'Nr. 4.2.3 VV LHundG' }));
    expect(lrmb.references).toEqual([{ kind: 'number', number: '4.2.3' }]);
    expect(lrmb.tokens.map((token) => token.normalized)).toEqual(['vv', 'lhundg']);
    expect(lrmb.identityVariants).toEqual([]);
    expect(extractStructuralIntents('Nummer 2.1').references).toEqual([{ kind: 'number', number: '2.1' }]);
    expect(buildSearchQueryPlan(createSearchState({ q: 'Nummer 2.1' })).freeText).toBe(false);
    expect(extractStructuralIntents('Ziffer 2').references).toEqual([{ kind: 'number', number: '2' }]);
    expect(extractStructuralIntents('Ziff. 3.1 Runderlass').references).toEqual([{ kind: 'number', number: '3.1' }]);
    expect(extractStructuralIntents('nr. 7').references).toEqual([{ kind: 'number', number: '7' }]);
    expect(extractStructuralIntents('Nr. 4.2.3. VV LHundG').references).toEqual([{ kind: 'number', number: '4.2.3' }]);
    expect(extractStructuralIntents('Nr. 1.2.3.4.5.6').references).toEqual([{ kind: 'number', number: '1.2.3.4.5.6' }]);
    expect(extractStructuralIntents('Nr. 2 und Nummer 2').references).toEqual([{ kind: 'number', number: '2' }]);
  });

  it('wendet Nummernadressen nur ohne §- oder Artikeladresse an', () => {
    const withParagraph = buildSearchQueryPlan(createSearchState({ q: '§ 5 Nr. 2 SchulG' }));
    expect(withParagraph.references).toEqual([{ kind: 'paragraph', number: '5' }]);
    expect(withParagraph.tokens.map((token) => token.normalized)).toEqual(['nr', '2', 'schulg']);
    const withArticle = extractStructuralIntents('Art. 3 Ziffer 1');
    expect(withArticle.references).toEqual([{ kind: 'article', number: '3' }]);
    expect(withArticle.remaining).toContain('Ziffer 1');
  });

  it('lässt unzulässige Nummern als Freitext stehen', () => {
    expect(extractStructuralIntents('Nr. 123').references).toEqual([]);
    expect(extractStructuralIntents('Nr. 1.2.3.4.5.6.7').references).toEqual([]);
    expect(extractStructuralIntents('Nr. 2.100').references).toEqual([]);
    expect(buildSearchQueryPlan(createSearchState({ q: 'Nr. 123' })).tokens.map((token) => token.normalized)).toEqual(['nr', '123']);
  });

  it('getStructuralReference liefert Dezimalnummern nur für Abschnitte und Unterabschnitte', () => {
    const text: NormBodyBlock[] = [{ type: 'paragraphText', text: 'Text.' }];
    expect(getStructuralReference({ type: 'section', label: '2', children: text })).toEqual({ number: '2' });
    expect(getStructuralReference({ type: 'subsection', label: '4.2.3', children: text })).toEqual({ number: '4.2.3' });
    expect(getStructuralReference({ type: 'subsection', label: ' 2.1. ', children: text })).toEqual({ number: '2.1' });
    expect(getStructuralReference({ type: 'section', label: '1. Abschnitt', children: text })).toBeUndefined();
    expect(getStructuralReference({ type: 'section', label: '123', children: text })).toBeUndefined();
    expect(getStructuralReference({ type: 'item', label: '2.1', text: 'Aufzählung.' })).toBeUndefined();
    expect(getStructuralReference(paragraph('5', 'Schulpflicht', 'Eins.', 'Zwei.'))).toEqual({ paragraph: '5', subsections: ['1', '2'] });
    expect(getStructuralReference(article('3', 'Zuständigkeit', 'Eins.'))).toEqual({ article: '3', subsections: ['1'] });
  });
});

describe('Suchintegrität: D1-Suche auf einem temporären Bestand', () => {
  let root: string;
  let projected: ProjectedRoot;
  const west = (q: string, overrides: Partial<SearchState> = {}): Promise<SearchResultPage> => projected.stores.west.search(createSearchState({ q, jurisdictions: ['west'], ...overrides }));
  const everywhere = (q: string, overrides: Partial<SearchState> = {}): Promise<SearchResultPage> => projected.registry.search(createSearchState({ q, ...overrides }));

  beforeAll(async () => {
    root = await createRoot('produktion', PRODUCTION);
    projected = await projectRoot(root);
  });

  it('lädt nur den Produktionsbestand unter content/', () => {
    expect(projected.records.map((record) => `${record.meta.jurisdiction}:${record.meta.slug}`).sort()).toEqual(PRODUCTION.map((norm) => `${norm.jurisdiction}:${norm.slug}`).sort());
    const units = buildSearchDocument(projected.records.find((record) => record.meta.slug === 'vv-lhundg-west')!, projected.records.find((record) => record.meta.slug === 'vv-lhundg-west')!.versions[0]!, EDITORIAL_REFERENCE_DATE).units;
    // Reihenfolge der Einheiten bewusst nicht geprüft (übergeordnete Abschnitte folgen derzeit ihren Unterabschnitten).
    expect(Object.fromEntries(units.filter((unit) => unit.references).map((unit) => [unit.anchor, unit.references]))).toEqual({
      'abschnitt-1': { number: '1' }, 'abschnitt-2': { number: '2' }, 'unterabschnitt-2-1': { number: '2.1' }, 'unterabschnitt-4-2': { number: '4.2' }, 'unterabschnitt-4-2-3': { number: '4.2.3' },
    });
  });

  it('Titelsuche findet die Norm als Bezeichnungs- oder Titeltreffer', async () => {
    expect((await west('Verwaltungsvorschriften zum Landeshundegesetz')).hits[0]).toMatchObject({ slug: 'vv-lhundg-west', matchKind: 'identity' });
    expect((await west('Durchführung Kinderbildungsgesetzes')).hits.map((hit) => [hit.slug, hit.matchKind])).toEqual([['dvo-kibiz-west', 'title']]);
    expect((await everywhere('Gemeindeordnung Freistaat')).hits.map((hit) => [hit.jurisdiction, hit.slug, hit.matchKind])).toEqual([['baywue', 'gemeindeordnung-baywue', 'title']]);
  });

  it('Abkürzungssuche liefert die Norm als ersten Bezeichnungstreffer', async () => {
    for (const [abbr, slug] of [['SchulG', 'schulg-west'], ['schulg', 'schulg-west'], ['VV LHundG', 'vv-lhundg-west'], ['DVO KiBiz', 'dvo-kibiz-west']] as const) {
      expect((await west(abbr)).hits[0], abbr).toMatchObject({ slug, matchKind: 'identity' });
    }
  });

  it('§-Adresse zeigt auf die richtige Stelle der geltenden Fassung', async () => {
    const page = await west('§ 5 SchulG');
    expect(page.hits.map((hit) => [hit.slug, hit.versionId, hit.matchKind, hit.unit?.anchor])).toEqual([['schulg-west', '2026-03-01', 'reference', 'paragraph-5']]);
    expect(page.hits[0]!.unit?.url).toBe('/west/norm/schulg-west/#paragraph-5');
    expect((await west('§ 5 Absatz 3 SchulG', { versionScope: 'all' })).hits.map((hit) => hit.versionId)).toEqual(['2026-03-01']);
    expect((await west('§ 5 Abs. 2 SchulG', { versionScope: 'all' })).hits.map((hit) => hit.versionId).sort()).toEqual(['2023-12-01', '2026-03-01']);
    expect((await west('§ 2 DVO KiBiz')).hits.map((hit) => [hit.slug, hit.unit?.anchor])).toEqual([['dvo-kibiz-west', 'paragraph-2']]);
    expect((await west('§ 9 SchulG')).total).toBe(0);
    // Die Überschrift „Zu § 2“ einer Verwaltungsvorschrift ist keine §-Adresse.
    expect((await west('§ 2 VV LHundG')).total).toBe(0);
  });

  it('Artikeladresse zeigt länderübergreifend nur auf die Artikel-Norm', async () => {
    expect((await everywhere('Art. 3 GO BayWü')).hits.map((hit) => [hit.jurisdiction, hit.slug, hit.matchKind, hit.unit?.anchor])).toEqual([['baywue', 'gemeindeordnung-baywue', 'reference', 'artikel-3']]);
    expect((await everywhere('Artikel 3 Absatz 2')).hits.map((hit) => [hit.jurisdiction, hit.unit?.anchor])).toEqual([['baywue', 'artikel-3']]);
    expect((await west('Art. 3')).total).toBe(0);
  });

  it('LRMB-Nummernadresse trifft genau die nummerierte Einheit', async () => {
    const deep = await west('Nr. 4.2.3 VV LHundG');
    expect(deep.hits.map((hit) => [hit.slug, hit.matchKind, hit.unit?.anchor, hit.unit?.references])).toEqual([['vv-lhundg-west', 'reference', 'unterabschnitt-4-2-3', { number: '4.2.3' }]]);
    expect(deep.hits[0]!.snippet).toBe('Die Sachkundeprüfung nehmen anerkannte Sachverständige ab.');
    expect((await west('Nr. 4.2.3. VV LHundG')).hits.map((hit) => hit.unit?.anchor)).toEqual(['unterabschnitt-4-2-3']);
    expect((await west('Nummer 2.1 VV LHundG')).hits.map((hit) => [hit.unit?.anchor, hit.unit?.references])).toEqual([['unterabschnitt-2-1', { number: '2.1' }]]);
    expect((await west('Ziffer 2 VV LHundG')).hits.map((hit) => [hit.unit?.anchor, hit.unit?.references])).toEqual([['abschnitt-2', { number: '2' }]]);
    expect((await west('Nr. 2')).hits.map((hit) => [hit.slug, hit.unit?.references?.number]).sort()).toEqual([['kampfmittelbeseitigung-west', '2'], ['vv-lhundg-west', '2']]);
    expect((await west('Nr. 4.2.4 VV LHundG')).total).toBe(0);
  });

  it('Nummernadressen treffen keine Paragraphen-Normen, auch wenn deren Text „Nr. 2“ enthält', async () => {
    expect((await west('Nr. 2 SchulG', { versionScope: 'all' })).total).toBe(0);
    expect((await west('Nummer 1 DVO KiBiz')).total).toBe(0);
  });

  it('D1-Store und Dateistore liefern dieselben Treffer', async () => {
    const files = createFileNormStore('west', projected.records, { asOf: EDITORIAL_REFERENCE_DATE });
    const summary = (page: SearchResultPage): string[] => page.hits.map((hit) => `${hitKey(hit)}:${hit.matchKind}:${hit.unit?.anchor ?? ''}`).sort();
    for (const q of ['§ 5 SchulG', '§ 5 Abs. 2 SchulG', 'Nr. 4.2.3 VV LHundG', 'Nummer 2.1', 'Ziffer 2', 'Nr. 2 SchulG', 'SchulG', 'Zuständigkeit', 'Sachkunde']) {
      for (const versionScope of ['current', 'all'] as const) {
        const state = createSearchState({ q, jurisdictions: ['west'], versionScope });
        const [d1, file] = await Promise.all([projected.stores.west.search(state), files.search(state)]);
        expect(d1.total, `${q} (${versionScope})`).toBe(file.total);
        expect(summary(d1), `${q} (${versionScope})`).toEqual(summary(file));
      }
    }
  });

  it('Typfilter Verwaltungsvorschrift umfasst nur die Familie der Verwaltungsvorschriften', async () => {
    const administrative = await west('', { types: ['verwaltungsvorschrift'] });
    expect(administrative.hits.map((hit) => hit.slug).sort()).toEqual(['kampfmittelbeseitigung-west', 'vv-lhundg-west']);
    expect(administrative.hits.every((hit) => (ADMINISTRATIVE_REGULATION_TYPES as readonly string[]).includes(hit.type))).toBe(true);
    expect((await west('', { types: ['gesetz'] })).hits.map((hit) => hit.slug)).toEqual(['schulg-west']);
    expect((await west('', { types: ['verordnung'] })).hits.map((hit) => hit.slug)).toEqual(['dvo-kibiz-west']);
    expect((await west('Zuständigkeit')).hits.map((hit) => hit.slug).sort()).toEqual(['kampfmittelbeseitigung-west', 'schulg-west']);
    expect((await west('Zuständigkeit', { types: ['verwaltungsvorschrift'] })).hits.map((hit) => hit.slug)).toEqual(['kampfmittelbeseitigung-west']);
    expect((await west('Zuständigkeit', { types: ['verordnung'] })).total).toBe(0);
  });

  it('Jurisdiktionsfilter: nur West oder alle Länder', async () => {
    const westOnly = await everywhere('Zuständigkeit', { jurisdictions: ['west'] });
    expect(westOnly.hits.map((hit) => `${hit.jurisdiction}:${hit.slug}`).sort()).toEqual(['west:kampfmittelbeseitigung-west', 'west:schulg-west']);
    const all = await everywhere('Zuständigkeit');
    expect(all.total).toBe(3);
    expect(all.hits.map((hit) => `${hit.jurisdiction}:${hit.slug}`).sort()).toEqual(['baywue:gemeindeordnung-baywue', 'west:kampfmittelbeseitigung-west', 'west:schulg-west']);
    expect((await everywhere('Zuständigkeit', { jurisdictions: ['baywue'] })).hits.map((hit) => hit.slug)).toEqual(['gemeindeordnung-baywue']);
    expect((await everywhere('Zuständigkeit', { jurisdictions: ['nsh', 'ost'] })).total).toBe(0);
  });

  it('synthetische Fixtures erscheinen nie in Produktionsergebnissen', async () => {
    const fixtureRecords = await loadAllNorms(join(root, 'tests', 'fixtures'));
    expect(fixtureRecords.map((record) => record.meta.slug).sort()).toEqual([...FIXTURE_SLUGS].sort());
    for (const record of [...projected.records, ...fixtureRecords]) expect(isSyntheticFixture(record), record.meta.slug).toBe(isSyntheticFixtureNorm(record.meta));
    expect(fixtureRecords.every((record) => isSyntheticFixture(record))).toBe(true);
    expect(projected.records.filter((record) => isSyntheticFixture(record))).toEqual([]);
    for (const q of ['', 'Testfixture', 'TF-SchulG West', 'Synthetische Probevorschrift zur Hundehaltung', 'Sachkundeprüfung', 'Nr. 4.2.3', 'Zuständigkeit']) {
      const page = await everywhere(q, { versionScope: 'all', limit: 100 });
      expect(page.hits.filter((hit) => FIXTURE_SLUGS.includes(hit.slug)), q).toEqual([]);
    }
    expect((await west('Nr. 4.2.3')).hits.map((hit) => hit.slug)).toEqual(['vv-lhundg-west']);
    for (const db of Object.values(projected.databases)) {
      expect(countRows(db, 'law_norms', "slug LIKE 'testfixture-%' OR meta_json LIKE '%synthetic-fixture%'")).toBe(0);
    }
  });

  it('liefert keine doppelten Treffer, auch nicht seitenweise, und keine doppelten Sucheinheiten', async () => {
    const browseAll = await everywhere('', { versionScope: 'all', limit: 100 });
    expect(browseAll.total).toBe(6);
    expectNoDuplicates(browseAll, 'alle Fassungen');
    const current = await everywhere('', { limit: 100 });
    expect(current.total).toBe(5);
    expect(new Set(current.hits.map((hit) => hit.slug)).size).toBe(5);
    for (const [q, overrides] of [['Zuständigkeit', { versionScope: 'all' }], ['Schulpflicht', { versionScope: 'all' }], ['SchulG', {}], ['Nr. 2', {}]] as const) {
      expectNoDuplicates(await everywhere(q, { ...overrides, limit: 100 }), q);
    }
    const paged: string[] = [];
    for (let offset = 0; offset < current.total; offset += 2) paged.push(...(await everywhere('', { limit: 2, offset })).hits.map(hitKey));
    expect(paged).toEqual(current.hits.map(hitKey));
    for (const db of Object.values(projected.databases)) {
      expect(db.native.prepare('SELECT norm_id, version_id, unit_index, COUNT(*) AS c FROM law_search_units GROUP BY norm_id, version_id, unit_index HAVING c > 1').all()).toEqual([]);
      expect(db.native.prepare("SELECT norm_id, version_id, anchor, COUNT(*) AS c FROM law_search_units WHERE anchor <> '' GROUP BY norm_id, version_id, anchor HAVING c > 1").all()).toEqual([]);
    }
  });

  it('der FTS5-Index ist vollständig, und die Integritätsprüfung erkennt einen veralteten Index', async () => {
    let units = 0;
    for (const db of Object.values(projected.databases)) {
      expect(() => checkSearchIndexIntegrity(db)).not.toThrow();
      expect(countRows(db, 'law_search_docsize')).toBe(countRows(db, 'law_search_units'));
      units += countRows(db, 'law_search_units');
    }
    expect(units).toBe(totalSearchUnits(projected.records));

    const stale = await openSqliteD1(':memory:', { migrationsDir: join(root, 'data', 'd1') });
    openDatabases.push(stale);
    executePlan(stale, buildProjectionPlan(projected.records, { jurisdiction: 'west', full: true, now: NOW }));
    expect(() => checkSearchIndexIntegrity(stale)).not.toThrow();
    // Inhaltstabelle ohne Trigger geändert: der externe FTS-Index verweist auf gelöschte Einheiten.
    stale.native.exec('DROP TRIGGER law_search_units_ad');
    stale.native.prepare('DELETE FROM law_search_units WHERE norm_id = ?').run('west:vv-lhundg-west');
    expect(() => checkSearchIndexIntegrity(stale)).toThrow();
  });
});

describe('Suchintegrität: runSearchAudit auf temporären Beständen', () => {
  let root: string;
  let contaminated: string;

  beforeAll(async () => {
    root = await createRoot('audit', PRODUCTION);
    contaminated = await createRoot('verunreinigt', [...PRODUCTION, ...FIXTURES]);
  });

  it('meldet für einen sauberen Bestand alle Prüfungen als bestanden', async () => {
    const result = await runSearchAudit(root);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.norms).toBe(4);
    expect(Object.keys(result.checks)).toEqual([...SEARCH_AUDIT_CHECKS]);
    expect(result.checks).toEqual({
      title: { passed: 4, failed: 0, skipped: 0 },
      abbreviation: { passed: 3, failed: 0, skipped: 1 },
      structure: { passed: 2, failed: 0, skipped: 2 },
      number: { passed: 2, failed: 0, skipped: 2 },
      'type-filter': { passed: 4, failed: 0, skipped: 0 },
      'jurisdiction-scope': { passed: 4, failed: 0, skipped: 0 },
      'all-jurisdictions': { passed: 4, failed: 0, skipped: 0 },
      fixtures: { passed: 5, failed: 0, skipped: 0 },
      duplicates: { passed: 1, failed: 0, skipped: 0 },
      'fts-integrity': { passed: 1, failed: 0, skipped: 0 },
    });
    expect(result.searchUnits).toBe(totalSearchUnits(await loadAllNorms(root)));
  });

  it('prüft auf Wunsch weitere Jurisdiktionen und begrenzt die Normenzahl', async () => {
    const both = await runSearchAudit(root, { jurisdictions: ['west', 'baywue'] });
    expect(both.ok).toBe(true);
    expect(both.norms).toBe(5);
    expect(both.checks.structure).toEqual({ passed: 3, failed: 0, skipped: 2 });
    expect(both.checks.abbreviation).toEqual({ passed: 4, failed: 0, skipped: 1 });
    expect(both.checks.number).toEqual({ passed: 2, failed: 0, skipped: 3 });
    expect(both.checks['all-jurisdictions']).toEqual({ passed: 5, failed: 0, skipped: 0 });
    const limited = await runSearchAudit(root, { limit: 1 });
    expect(limited.norms).toBe(1);
    expect(limited.checks.title).toEqual({ passed: 1, failed: 0, skipped: 0 });
  });

  it('eine synthetische Fixture im Produktionsbestand lässt die Fixture-Prüfung scheitern', async () => {
    // Ohne diese Prüfung wäre die Fixture in der Produktionssuche sichtbar.
    const leaked = await projectRoot(contaminated);
    expect((await leaked.registry.search(createSearchState({ q: 'Testfixture' }))).hits.map((hit) => hit.slug)).toEqual(['testfixture-schulgesetz-west']);

    const result = await runSearchAudit(contaminated);
    expect(result.ok).toBe(false);
    expect(result.checks.fixtures).toEqual({ passed: 5, failed: 2, skipped: 0 });
    expect(result.failures.map((failure) => [failure.check, failure.slug]).sort()).toEqual([['fixtures', 'probevorschrift-hundehaltung-west'], ['fixtures', 'testfixture-schulgesetz-west']]);
    for (const failure of result.failures) expect(failure.detail).toBe(`synthetische Fixture west:${failure.slug} im Produktionsbestand`);
    // Fixtures werden nicht als Produktionsnormen geprüft; alle übrigen Prüfungen bleiben grün.
    expect(result.norms).toBe(4);
    for (const check of SEARCH_AUDIT_CHECKS.filter((entry) => entry !== 'fixtures')) expect(result.checks[check].failed, check).toBe(0);
  });
});

/**
 * Regression aus dem echten West-Bestand (`npm run import:recht-nrw:search-audit`): Titel wie „Allgemeine
 * Verwaltungsvorschrift zu § 74 Absatz 4 und § 79 Absatz 1 des Landesbesoldungsgesetzes“ wurden als §-Adresse gelesen;
 * die nummerierte Verwaltungsvorschrift hat keine §-Einheiten und fiel aus Titel-, Typfilter-, länderübergreifender und
 * Nummernsuche. Korrektur: `titleCarriesReferences` (packages/search/src/ranking.ts) und die zweite Kandidatenabfrage
 * im D1-Store.
 */
const AVV_LBESG: NormInput = {
  jurisdiction: 'west', slug: 'allgemeine-verwaltungsvorschrift-zu-74-absatz-4-und-79-absatz-1-des-west', title: 'Allgemeine Verwaltungsvorschrift zu § 74 Absatz 4 und § 79 Absatz 1 des Landesbesoldungsgesetzes', type: 'allgemeine-verwaltungsvorschrift', subjects: ['Besoldungsrecht'],
  versions: [{ versionId: '2023-12-01', body: [
    numbered('section', '1', 'Anwendungshinweis', 'Bei der Anwendung sind die geänderten Beträge zu beachten.', [
      numbered('subsection', '1.1', undefined, 'In Nummer 59.5.2 ist der neue Betrag anzuwenden.'),
      numbered('subsection', '1.2', undefined, 'In Nummer 66.1.6 ist der neue Betrag anzuwenden.'),
    ]),
    numbered('section', '2', 'Anwendungsbereich', 'Nummer 1 gilt auch für ältere Ansprüche.'),
  ] }],
};

/**
 * Regression aus dem echten Bulkbestand (1 354 Normen): Der SQL-Vergleich der Kandidatenabfrage prüft den rohen
 * Titel, die Anfrage liefert aber normalisierte Varianten („für“ → „fur“/„fuer“). Bei Bezeichnungen mit Umlaut
 * oder ß wurde der Identitätstreffer deshalb nicht erkannt; die Landesverfassung rutschte hinter 58 Volltext-
 * treffer und fehlte auf der ersten Seite.
 */
describe('Suchintegrität: Identitätstreffer mit Umlaut (Regression)', () => {
  let root: string;
  let projected: ProjectedRoot;
  const TITEL = 'Verfassung für das Land Westdeutschland';

  beforeAll(async () => {
    // Die gesuchte Norm trägt den Umlaut; viele Störnormen enthalten dieselben Wörter im Text und ranken im
    // Volltext besser, weil sie sie häufiger nennen.
    const stoerer = Array.from({ length: 40 }, (_, index): NormInput => ({
      jurisdiction: 'west', slug: `stoerer-${index + 1}-west`, title: `Störnorm ${index + 1} über Land und Verfassung`, type: 'verordnung', subjects: [],
      versions: [{ versionId: '2023-12-01', body: [numbered('section', String(index + 1), 'Verfassung', 'Verfassung für das Land Westdeutschland wird hier mehrfach genannt: Verfassung, Land, Westdeutschland.')] }],
    }));
    const verfassung: NormInput = {
      jurisdiction: 'west', slug: 'verfassung-fuer-das-land-westdeutschland', title: TITEL, type: 'gesetz', subjects: ['Staatsrecht'],
      versions: [{ versionId: '2023-12-01', body: [numbered('section', '1', 'Grundlagen', 'Das Land Westdeutschland ist ein Land der Simulation.')] }],
    };
    root = await createRoot('identitaet-umlaut', [...PRODUCTION, verfassung, ...stoerer]);
    projected = await projectRoot(root);
  });

  it('findet die Norm über ihren vollständigen Titel auf der ersten Trefferseite', async () => {
    const page = await projected.stores.west.search(createSearchState({ q: TITEL, jurisdictions: ['west'], limit: 20 }));
    const treffer = page.hits.find((hit) => hit.slug === 'verfassung-fuer-das-land-westdeutschland');
    expect(treffer).toBeDefined();
    expect(treffer?.matchKind).toBe('identity');
    expect(page.hits[0]?.slug).toBe('verfassung-fuer-das-land-westdeutschland');
  });

  it('findet sie auch länderübergreifend und mit Typfilter', async () => {
    const alle = await projected.registry.search(createSearchState({ q: TITEL, limit: 20 }));
    expect(alle.hits.map((hit) => hit.slug)).toContain('verfassung-fuer-das-land-westdeutschland');
    const typ = await projected.stores.west.search(createSearchState({ q: TITEL, jurisdictions: ['west'], types: ['gesetz'], limit: 20 }));
    expect(typ.hits.map((hit) => hit.slug)).toContain('verfassung-fuer-das-land-westdeutschland');
  });
});

describe('Suchintegrität: Verwaltungsvorschrift mit §-Angabe im Titel (Regression)', () => {
  let root: string;
  let projected: ProjectedRoot;
  const title = AVV_LBESG.title;
  const slug = AVV_LBESG.slug;

  beforeAll(async () => {
    root = await createRoot('paragraphentitel', [...PRODUCTION, AVV_LBESG]);
    projected = await projectRoot(root);
  });

  it('Voraussetzung: die Norm ist projiziert und trägt Nr. 1.1 als eigene Einheit', async () => {
    const record = projected.records.find((entry) => entry.meta.slug === slug)!;
    expect(record.meta.type).toBe('allgemeine-verwaltungsvorschrift');
    const units = buildSearchDocument(record, record.versions[0]!, EDITORIAL_REFERENCE_DATE).units;
    expect(units.find((unit) => unit.references?.number === '1.1')?.anchor).toBe('unterabschnitt-1-1');
    expect(units.some((unit) => unit.references?.paragraph)).toBe(false);
    expect(countRows(projected.databases.west, 'law_search_units', 'norm_id = ?', [`west:${slug}`])).toBe(units.length);
    const audit = await runSearchAudit(root);
    // Fehler dürfen nur diese Norm betreffen (gilt vor und nach der Korrektur).
    expect(audit.failures.filter((failure) => failure.slug !== slug)).toEqual([]);
  });

  it('Titelsuche nach dem vollständigen Titel findet die Norm unter den ersten 20', async () => {
    const page = await projected.stores.west.search(createSearchState({ q: title, jurisdictions: ['west'], limit: 20 }));
    expect(page.hits.map((hit) => hit.slug)).toContain(slug);
  });

  it('länderübergreifende Suche und Typfilter finden die Norm über den Titel', async () => {
    const all = await projected.registry.search(createSearchState({ q: title, limit: 50 }));
    expect(all.hits.map((hit) => hit.slug)).toContain(slug);
    const typed = await projected.stores.west.search(createSearchState({ q: title, jurisdictions: ['west'], types: ['allgemeine-verwaltungsvorschrift'], limit: 20 }));
    expect(typed.hits.map((hit) => hit.slug)).toContain(slug);
  });

  it('„Nr. 1.1 <Titel ohne §-Angaben>“ zeigt auf unterabschnitt-1-1', async () => {
    // Neben §-Angaben wird „Nr.“ bewusst nicht als Nummernadresse gelesen („§ 5 Abs. 1 Nr. 3“); die Adressform
    // einer Nummer lautet daher „Nr. <Nummer> <Bezeichnung ohne §-Angaben>“ (so fragt auch runSearchAudit).
    const page = await projected.stores.west.search(createSearchState({ q: 'Nr. 1.1 Allgemeine Verwaltungsvorschrift zu und des Landesbesoldungsgesetzes', jurisdictions: ['west'], limit: 20 }));
    expect(page.hits.find((hit) => hit.slug === slug)?.unit?.anchor).toBe('unterabschnitt-1-1');
  });

  it('Titelrettung nur für Strukturangaben, die der Titel selbst enthält; sonst bleibt die Adressanfrage streng', async () => {
    const own = await projected.stores.west.search(createSearchState({ q: '§ 74 Absatz 4 Landesbesoldungsgesetzes', jurisdictions: ['west'], limit: 20 }));
    expect(own.hits.find((hit) => hit.slug === slug)?.matchKind).toBe('title');
    // „§ 1“ steht nicht im Titel („Absatz 1“ ist keine §-Angabe): kein Treffer der Verwaltungsvorschrift.
    const foreign = await projected.stores.west.search(createSearchState({ q: '§ 1 Landesbesoldungsgesetzes', jurisdictions: ['west'], limit: 20 }));
    expect(foreign.hits.map((hit) => hit.slug)).not.toContain(slug);
  });

  it('runSearchAudit meldet für diesen Bestand keine Fehler', async () => {
    const audit = await runSearchAudit(root);
    expect(audit.failures).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Skalierung des Audits: deterministische Stichprobe, Auswahloptionen, Worker-Aufteilung, Profil, Golden Set. */

describe('Suchintegrität: deterministische Auswahl und Profil', () => {
  let root: string;
  let records: NormRecord[];

  beforeAll(async () => {
    root = await createRoot('auswahl', PRODUCTION);
    records = await loadJurisdictionNorms('west', root);
  });

  it('seededHash ist plattformstabil und seedabhängig', () => {
    expect(seededHash('landesrecht', 'schulg-west')).toBe(1109466146);
    expect(seededHash('anders', 'schulg-west')).toBe(2491492838);
    expect(seededHash('landesrecht', 'loeg-west')).toBe(3122649613);
  });

  it('die geschichtete Stichprobe ist deterministisch, deckt alle Normtypen und Merkmale ab und hat keine Dubletten', () => {
    const types: NormType[] = ['gesetz', 'verordnung', 'runderlass', 'verwaltungsvorschrift', 'richtlinie'];
    const features: NormAuditFeatures[] = Array.from({ length: 120 }, (_, index) => ({
      slug: `norm-${index}`, type: types[index % types.length]!, hasAbbr: index % 3 === 0, special: index % 7 === 0, hasParagraph: index % 2 === 0, hasArticle: index % 11 === 0,
      hasNumber: index % 2 === 1, units: index % 13 === 0 ? 400 : index % 5 === 0 ? 2 : 30, titleLength: index % 17 === 0 ? 160 : 60,
    }));
    const first = selectStratifiedSample(features, 30, 'seed-a');
    const second = selectStratifiedSample(features, 30, 'seed-a');
    expect(first).toEqual(second);
    expect(first).toHaveLength(30);
    expect(new Set(first.map((entry) => entry.slug)).size).toBe(30);
    for (const type of types) expect(first.some((entry) => entry.type === type), type).toBe(true);
    for (const feature of ['hasAbbr', 'special', 'hasParagraph', 'hasArticle', 'hasNumber'] as const) expect(first.some((entry) => entry[feature]), feature).toBe(true);
    expect(first.some((entry) => entry.units >= 400)).toBe(true);
    expect(first.some((entry) => entry.units <= 3)).toBe(true);
    expect(first.some((entry) => entry.titleLength >= 120)).toBe(true);
    const other = selectStratifiedSample(features, 30, 'seed-b');
    expect(other.map((entry) => entry.slug)).not.toEqual(first.map((entry) => entry.slug));
    // Ein neuer Bestand verschiebt die Auswahl nur um die neuen Slugs: gemeinsame Normen bleiben weitgehend gleich.
    const grown = selectStratifiedSample([...features, { slug: 'neu-1', type: 'gesetz', hasAbbr: true, special: false, hasParagraph: true, hasArticle: false, hasNumber: false, units: 30, titleLength: 60 }], 30, 'seed-a');
    expect(grown.filter((entry) => first.some((chosen) => chosen.slug === entry.slug)).length).toBeGreaterThanOrEqual(25);
    expect(selectStratifiedSample(features, 500, 'seed-a')).toHaveLength(120);
  });

  it('selectAuditNorms wendet only, category, sample und limit an und lässt Fixtures aus', () => {
    const fixture = { ...records[0]!, meta: { ...records[0]!.meta, slug: 'testfixture-x-west' } } as NormRecord;
    const all = selectAuditNorms([...records, fixture], {});
    expect(all.map((norm) => norm.meta.slug)).toEqual(records.map((norm) => norm.meta.slug));
    expect(selectAuditNorms(records, { only: ['schulg-west', 'unbekannt'] }).map((norm) => norm.meta.slug)).toEqual(['schulg-west']);
    expect(selectAuditNorms(records, { category: 'verwaltungsvorschrift' }).map((norm) => norm.meta.slug).sort()).toEqual(['kampfmittelbeseitigung-west', 'vv-lhundg-west']);
    expect(selectAuditNorms(records, { category: 'gesetz' }).map((norm) => norm.meta.slug)).toEqual(['schulg-west']);
    expect(selectAuditNorms(records, { mode: 'fast' })).toHaveLength(records.length);
    expect(selectAuditNorms(records, { sample: 2 })).toHaveLength(2);
    expect(selectAuditNorms(records, { sample: 2, seed: 'x' })).toEqual(selectAuditNorms(records, { sample: 2, seed: 'x' }));
    expect(selectAuditNorms(records, { limit: 1 })).toHaveLength(1);
    expect(selectAuditNorms(records, { limit: 0 })).toHaveLength(0);
    const features = records.map(normAuditFeatures);
    expect(features.find((entry) => entry.slug === 'schulg-west')).toMatchObject({ type: 'gesetz', hasAbbr: true, hasParagraph: true, hasNumber: false, special: true });
    expect(features.find((entry) => entry.slug === 'vv-lhundg-west')).toMatchObject({ hasNumber: true, hasParagraph: false });
  });

  it('partitionSlugs verteilt reihum, mergeSlices summiert', () => {
    expect(partitionSlugs(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'c', 'e'], ['b', 'd']]);
    expect(partitionSlugs(['a'], 3)).toEqual([['a']]);
    const slice = (norms: number, failed: string[]): SearchAuditSlice => ({
      norms, checks: Object.fromEntries(SEARCH_AUDIT_CHECKS.map((check) => [check, { passed: check === 'title' ? norms - failed.length : 0, failed: check === 'title' ? failed.length : 0, skipped: 0 }])) as SearchAuditSlice['checks'],
      failures: failed.map((slug) => ({ slug, check: 'title', detail: 'x' })), auditMs: 10, queries: 5 * norms, searches: 2 * norms,
      checkProfile: Object.fromEntries(SEARCH_AUDIT_NORM_CHECKS.map((check) => [check, { ms: 1, queries: 1 }])) as SearchAuditSlice['checkProfile'],
      slowest: [{ slug: `s${norms}`, ms: norms, queries: 1 }], titleTop1: { unique: norms, top1: norms - 1 }, abbreviationTop1: { unique: 0, top1: 0 },
    });
    const merged = mergeSlices([slice(3, ['b']), slice(2, [])]);
    expect(merged.norms).toBe(5);
    expect(merged.checks.title).toEqual({ passed: 4, failed: 1, skipped: 0 });
    expect(merged.failures).toEqual([{ slug: 'b', check: 'title', detail: 'x' }]);
    expect(merged.queries).toBe(25);
    expect(merged.searches).toBe(10);
    expect(merged.slowest.map((entry) => entry.slug)).toEqual(['s3', 's2']);
    expect(merged.titleTop1).toEqual({ unique: 5, top1: 3 });
  });

  it('runSearchAudit liefert in beiden Match-Modi und im Modus fast dasselbe Ergebnis samt Profil', async () => {
    for (const matchMode of SEARCH_MATCH_MODES) {
      const result = await runSearchAudit(root, { mode: 'fast', matchMode, workers: 4 });
      expect(result.ok, matchMode).toBe(true);
      expect(result.norms, matchMode).toBe(4);
      expect(result.profile).toMatchObject({ mode: 'fast', matchMode, sample: DEFAULT_FAST_SAMPLE, seed: DEFAULT_AUDIT_SEED, workers: 1 });
      expect(result.profile.searches, matchMode).toBeGreaterThan(0);
      expect(result.profile.queries, matchMode).toBeGreaterThan(result.profile.searches);
      expect(result.profile.queriesPerNorm, matchMode).toBeGreaterThan(0);
      expect(Object.keys(result.profile.checks), matchMode).toEqual([...SEARCH_AUDIT_NORM_CHECKS]);
      expect(result.profile.titleTop1, matchMode).toEqual({ unique: 4, top1: 4 });
      expect(result.profile.abbreviationTop1, matchMode).toEqual({ unique: 3, top1: 3 });
      expect(result.profile.slowest.length, matchMode).toBeGreaterThan(0);
    }
    const only = await runSearchAudit(root, { only: ['schulg-west'], matchMode: 'and-first' });
    expect(only.norms).toBe(1);
    expect(only.checks.structure).toEqual({ passed: 1, failed: 0, skipped: 0 });
    const family = await runSearchAudit(root, { category: 'verwaltungsvorschrift' });
    expect(family.norms).toBe(2);
    expect(family.checks.number).toEqual({ passed: 2, failed: 0, skipped: 0 });
  });

  it('runSearchAuditSlice (Worker-Einstieg) prüft nur die zugewiesenen Slugs mit eigener Projektion', async () => {
    const slice = await runSearchAuditSlice(root, 'west', ['dvo-kibiz-west', 'unbekannt'], 'and-first');
    expect(slice.norms).toBe(1);
    expect(slice.checks.title).toEqual({ passed: 1, failed: 0, skipped: 0 });
    expect(slice.checks.abbreviation).toEqual({ passed: 1, failed: 0, skipped: 0 });
    expect(slice.queries).toBeGreaterThan(0);
  });
});

describe('Suchintegrität: Golden Query Set', () => {
  let root: string;
  let records: NormRecord[];

  beforeAll(async () => {
    root = await createRoot('golden', PRODUCTION);
    records = await loadJurisdictionNorms('west', root);
  });

  it('erzeugt deterministisch Anfragen mit eindeutigen Kennungen aus dem Bestand', () => {
    const set = generateGoldenQueries(records, 'test');
    expect(set).toEqual(generateGoldenQueries(records, 'test'));
    expect(new Set(set.queries.map((query) => query.id)).size).toBe(set.queries.length);
    const categories = new Set(set.queries.map((query) => query.category));
    for (const category of ['exact-title', 'abbreviation', 'abbreviation-lowercase', 'paragraph-address', 'lrmb-number', 'common-word', 'null-result', 'typo', 'verordnung-title', 'vwv-title', 'federal-reference'] as const) expect(categories.has(category), category).toBe(true);
    expect(set.queries.find((query) => query.category === 'paragraph-address')).toMatchObject({ expectedAnchor: expect.stringMatching(/^paragraph-/u) });
    expect(set.queries.find((query) => query.category === 'lrmb-number')).toMatchObject({ query: expect.stringMatching(/^Nr\. \d/u), expectedAnchor: expect.stringMatching(/^(?:abschnitt|unterabschnitt)-/u) });
    expect(set.queries.filter((query) => query.category === 'null-result').every((query) => query.expectTotal === 0)).toBe(true);
    expect(set.queries.filter((query) => query.category === 'typo').every((query) => query.niceToHave)).toBe(true);
    for (const query of set.queries) for (const slug of [...query.expectedTop, ...query.acceptable]) expect(records.some((record) => record.meta.slug === slug), `${query.id} → ${slug}`).toBe(true);
  });

  it('bewertet Treffer (Rang, Top-1, Sprungziel, Nulltreffer) und berechnet Recall@10, MRR und Latenzen', () => {
    const page = (slugs: string[], anchor?: string) => ({ total: slugs.length, hits: slugs.map((slug) => ({ slug, ...(anchor ? { unit: { anchor } } : {}) })) });
    const exact: GoldenQuery = { id: 'a', category: 'exact-title', query: 'x', expectedTop: ['s1'], acceptable: [] };
    expect(judgeOutcome(exact, page(['s1', 's2']), 3)).toMatchObject({ rank: 1, top1: true, recall: true, failed: false, ms: 3 });
    expect(judgeOutcome(exact, page(['s2', 's1']), 3)).toMatchObject({ rank: 2, top1: false, failed: true });
    expect(judgeOutcome({ ...exact, niceToHave: true }, page(['s2']), 3)).toMatchObject({ rank: null, recall: false, failed: false });
    expect(judgeOutcome({ id: 'b', category: 'paragraph-address', query: '§ 1 x', expectedTop: ['s1'], acceptable: [], expectedAnchor: 'paragraph-1' }, page(['s1'], 'paragraph-2'), 1)).toMatchObject({ anchorOk: false, failed: true });
    expect(judgeOutcome({ id: 'c', category: 'null-result', query: 'zzz', expectedTop: [], acceptable: [], expectTotal: 0 }, page([]), 1)).toMatchObject({ totalOk: true, recall: null, top1: null, failed: false });
    expect(judgeOutcome({ id: 'd', category: 'common-word', query: 'West', expectedTop: [], acceptable: [], expectHits: true }, page([]), 1)).toMatchObject({ hitsOk: false, failed: true });
    const metrics = computeGoldenMetrics([
      judgeOutcome(exact, page(['s1']), 10), judgeOutcome(exact, page(['s2', 's1']), 20), judgeOutcome(exact, page(['s3']), 30),
      judgeOutcome({ id: 'c', category: 'null-result', query: 'zzz', expectedTop: [], acceptable: [], expectTotal: 0 }, page([]), 1),
    ]);
    expect(metrics).toMatchObject({ queries: 4, recallAt10: 0.667, mrr: 0.5, top1: 0.333, nullOk: 1, failed: 2, latencyMs: { p50: 10, p95: 30, max: 30 } });
  });

  it('wertet gegen die lokale Projektion aus, wählt eine Remote-Stichprobe und rendert Markdown', async () => {
    const set = generateGoldenQueries(records, 'test');
    const evaluations = await evaluateGoldenLocally(root, set, [...SEARCH_MATCH_MODES]);
    expect(evaluations.map((evaluation) => evaluation.matchMode)).toEqual([...SEARCH_MATCH_MODES]);
    for (const evaluation of evaluations) {
      expect(evaluation.outcomes).toHaveLength(set.queries.length);
      // Häufige Wörter („West“, „Grundgesetz“) erwarten nur irgendeinen Treffer; im Miniaturbestand gibt es keinen.
      expect(evaluation.outcomes.filter((outcome) => outcome.failed && outcome.hitsOk !== false), evaluation.matchMode).toEqual([]);
      expect(evaluation.overall.top1, evaluation.matchMode).toBe(1);
      expect(evaluation.overall.anchorOk, evaluation.matchMode).toBe(1);
      expect(evaluation.overall.nullOk, evaluation.matchMode).toBe(1);
    }
    const sample = selectRemoteSample(set, 8);
    expect(sample.length).toBeGreaterThanOrEqual(8);
    expect(new Set(sample.map((query) => query.id)).size).toBe(sample.length);
    expect(new Set(sample.map((query) => query.category)).size).toBeGreaterThanOrEqual(8);
    expect(selectRemoteSample(set, 8)).toEqual(sample);
    const markdown = renderGoldenMarkdown(set, evaluations);
    expect(markdown).toContain('| Modus | Recall@10 | MRR | Top-1 |');
    expect(markdown).toContain('| or-prefix |');
    expect(markdown).toContain('| and-first |');
    expect(markdown).toContain('## Verletzte Erwartungen');
    expect(markdown).toContain('## Unterschiede zwischen den Modi');
  });
});
