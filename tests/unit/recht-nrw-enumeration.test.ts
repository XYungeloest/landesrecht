/**
 * Enumeration der Stammnormen (Sitemap ↔ Suchindex ↔ Manifest) ohne Netz: Sitemaps und Suchantworten sind
 * Literale, der Fetcher ist ein In-Memory-Stub, geschrieben wird nur in ein temporäres Verzeichnis.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildEnumeration,
  enumerationFingerprint,
  enumerationJsonText,
  enumerationPath,
  enumerationStatusCounts,
  ENUMERATION_SCHEMA,
  ENUMERATION_STATUSES,
  epochToIsoDate,
  fetchSearchHits,
  fetchSitemapUrls,
  parseSearchResponse,
  parseSitemapIndex,
  parseSitemapUrlset,
  preclassify,
  readEnumeration,
  SEARCH_PAGE_SIZE,
  SEARCH_SOURCE_FIELDS,
  SEARCH_URL,
  searchRequestBody,
  SITEMAP_INDEX_URL,
  writeEnumeration,
  type BuildEnumerationInput,
  type EnumerationFile,
  type EnumerationItem,
  type SearchHit,
} from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import type { FetchedDocument, FetchRequest, RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { upgradeManifestEntryV1, type ImportManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

const VV = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift';
const ALPHA_2020 = `${VV}/01012020-alpha-erlass`;
const ALPHA_2022 = `${VV}/01012022-alpha-erlass`;
const BETA = `${VV}/beta-richtlinie`;
const GAMMA_2019 = `${VV}/15032019-gamma-vorschrift`;
const GAMMA_2021 = `${VV}/01072021-gamma-vorschrift`;
const DELTA = `${VV}/01072021-delta-runderlass`;
const LRMB_INDEX = 'state_law_ministerial_gazette';
const NOW_A = '2026-09-15T10:00:00.000Z';
const NOW_B = '2026-09-16T11:30:00.000Z';

function document(url: string, text: string, contentType = 'application/xml; charset=utf-8'): FetchedDocument {
  return { url, finalUrl: url, status: 200, contentType, retrievedAt: NOW_A, sha256: '0'.repeat(64), bytes: new TextEncoder().encode(text), fromCache: false };
}

function stubFetcher(respond: (url: string, request: FetchRequest) => string): RechtNrwFetcher & { calls: Array<{ url: string; request: FetchRequest }> } {
  const calls: Array<{ url: string; request: FetchRequest }> = [];
  return {
    calls,
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string, request: FetchRequest = {}): Promise<FetchedDocument> {
      calls.push({ url, request });
      return document(url, respond(url, request), request.method === 'POST' ? 'application/json' : 'application/xml; charset=utf-8');
    },
  };
}

function hit(url: string, nodeId: string, title: string, extra: Partial<SearchHit> = {}): SearchHit {
  return { nodeId, url, indexType: LRMB_INDEX, title, ...extra };
}

function manifestEntry(sourceIdentity: string, urls: string[], overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const base = upgradeManifestEntryV1({
    sourceSystem: 'recht-nrw', sourceIdentity, sourceTitle: 'Test', sourceType: 'verwaltungsvorschrift', sourceUrl: urls[0], stemUrl: `https://recht.nrw.de/taxonomy/term/${sourceIdentity.slice(5)}`,
    selectedVersionUrl: urls[0], sourceValidFrom: '2020-01-01', sourceValidTo: null, retrievedAt: NOW_A, sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: 'recht-nrw-lrmb-parser/1.0.0',
    targetJurisdiction: 'west', targetSlug: '', baselineDate: '2023-12-01', importStatus: 'imported', importedAt: NOW_A, rawDocuments: [], versionsConsidered: [], overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
  });
  return { ...base, sourceArea: 'lrmb', versionsConsidered: urls.map((url, index) => ({ validFrom: `202${index}-01-01`, validTo: null, url, selected: index === 0 })), ...overrides };
}

function manifestOf(entries: ManifestEntry[]): ImportManifest {
  return { schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries };
}

/** Standardfall: zwei Fassungen „alpha“ (Treffer doppelt), „beta“ undatiert, „gamma“ zwei Fassungen ohne Treffer, „delta“ nur im Suchindex. */
function crosscheckInput(overrides: Partial<BuildEnumerationInput> = {}): BuildEnumerationInput {
  return {
    area: 'lrmb',
    sitemap: {
      pages: 2,
      urls: [ALPHA_2020, ALPHA_2022, `${BETA}/`, GAMMA_2019, GAMMA_2021, ALPHA_2020, 'https://recht.nrw.de/lrgv/gesetz/01012020-testgesetz', 'https://example.org/lrmb/verwaltungsvorschrift/fremd'],
    },
    search: {
      total: 3,
      hits: [hit(ALPHA_2022, '1', 'Alpha-Erlass', { uuid: 'uuid-1', historically: false }), hit(`${ALPHA_2022}?anker=1`, '1', 'Alpha-Erlass (Dublette)'), hit(DELTA, '4', 'Runderlass Delta')],
    },
    now: NOW_A,
    ...overrides,
  };
}

const itemByKey = (file: EnumerationFile, key: string): EnumerationItem => {
  const item = file.items.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Eintrag ${key} fehlt (vorhanden: ${file.items.map((candidate) => candidate.key).join(', ')})`);
  return item;
};

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-enumeration-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('RECHT.NRW Enumeration: Sitemap und Suchindex parsen', () => {
  it('liest die Sitemap-Indexdatei und dekodiert XML-Entitäten', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://recht.nrw.de/sitemap/page/1/sitemap.xml</loc>
    <lastmod>2026-09-01T00:00:00+02:00</lastmod>
  </sitemap>
  <sitemap><loc> https://recht.nrw.de/sitemap.xml?page=2&amp;lang=de </loc></sitemap>
</sitemapindex>`;
    expect(parseSitemapIndex(xml)).toEqual(['https://recht.nrw.de/sitemap/page/1/sitemap.xml', 'https://recht.nrw.de/sitemap.xml?page=2&lang=de']);
    expect(() => parseSitemapIndex('<urlset><url><loc>x</loc></url></urlset>')).toThrow(/Keine Sitemap-Indexdatei/u);
  });

  it('liest Sitemap-Seiten mit optionalem lastmod und verwirft Einträge ohne loc', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ALPHA_2020}</loc><lastmod>2026-01-02T03:04:05+01:00</lastmod><changefreq>weekly</changefreq></url>
  <url>
    <loc>${BETA}</loc>
  </url>
  <url><lastmod>2026-01-02</lastmod></url>
  <url><loc>https://recht.nrw.de/lrmb/verwaltungsvorschrift/a-und-b?x=1&amp;y=2</loc></url>
</urlset>`;
    expect(parseSitemapUrlset(xml)).toEqual([
      { loc: ALPHA_2020, lastmod: '2026-01-02T03:04:05+01:00' },
      { loc: BETA },
      { loc: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/a-und-b?x=1&y=2' },
    ]);
    expect(() => parseSitemapUrlset('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>')).toThrow(/Keine Sitemap-Seite/u);
  });

  it('baut den Suchkörper mit fester Sortierung und search_after nur für Folgeseiten', () => {
    const firstPage = JSON.parse(searchRequestBody(LRMB_INDEX)) as Record<string, unknown>;
    expect(firstPage).toEqual({ size: SEARCH_PAGE_SIZE, track_total_hits: true, query: { bool: { filter: [{ term: { type: LRMB_INDEX } }] } }, _source: [...SEARCH_SOURCE_FIELDS], sort: [{ search_api_id: 'asc' }] });
    expect('search_after' in firstPage).toBe(false);
    const nextPage = JSON.parse(searchRequestBody('state_law_and_regulations', 25, ['entity:node/500:de'])) as Record<string, unknown>;
    expect(nextPage).toMatchObject({ size: 25, search_after: ['entity:node/500:de'], query: { bool: { filter: [{ term: { type: 'state_law_and_regulations' } }] } } });
  });

  it('rechnet Unix-Sekunden als Kalenderdatum in Europe/Berlin um (auch an Sommerzeitgrenzen)', () => {
    const seconds = (iso: string): number => Date.parse(iso) / 1000;
    // Mitternacht Winterzeit (UTC+1) und Sommerzeit (UTC+2): in UTC noch der Vortag.
    expect(epochToIsoDate(seconds('2023-11-30T23:00:00Z'))).toBe('2023-12-01');
    expect(epochToIsoDate(seconds('2023-06-30T22:00:00Z'))).toBe('2023-07-01');
    // Beginn der Sommerzeit am 26.03.2023: Mitternacht davor noch UTC+1, Mitternacht danach UTC+2.
    expect(epochToIsoDate(seconds('2023-03-25T22:59:59Z'))).toBe('2023-03-25');
    expect(epochToIsoDate(seconds('2023-03-25T23:00:00Z'))).toBe('2023-03-26');
    expect(epochToIsoDate(seconds('2023-03-26T22:00:00Z'))).toBe('2023-03-27');
    // Ende der Sommerzeit am 29.10.2023: 22:30 UTC ist 23:30 MEZ desselben Tages (fester Versatz +2 h ergäbe den 30.10.).
    expect(epochToIsoDate(seconds('2023-10-28T22:00:00Z'))).toBe('2023-10-29');
    expect(epochToIsoDate(seconds('2023-10-29T22:30:00Z'))).toBe('2023-10-29');
    expect(epochToIsoDate(seconds('2023-10-29T23:00:00Z'))).toBe('2023-10-30');
    expect(epochToIsoDate(String(seconds('2023-11-30T23:00:00Z')))).toBe('2023-12-01');
    expect(epochToIsoDate(seconds('1963-02-11T23:00:00Z'))).toBe('1963-02-12');
    for (const invalid of [undefined, null, '', '12.5', '-5', 'heute', Number.NaN, Number.POSITIVE_INFINITY, true, [1]]) expect(epochToIsoDate(invalid)).toBeUndefined();
  });

  it('liest Suchantworten: Felder als Arrays, Titelbereinigung, Datumsfelder, übersprungene Treffer und lastSort', () => {
    const response = JSON.stringify({
      took: 3,
      hits: {
        total: { value: 4, relation: 'eq' },
        hits: [
          {
            _id: 'ignoriert',
            _source: {
              url: ['/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landesorganisationsgesetz/?foo=1#abschnitt'],
              title: ['12.02.1963   Verwaltungsvorschriften zum\n Landesorganisationsgesetz'],
              type: [LRMB_INDEX],
              field_document_type_name: ['Verwaltungsvorschrift'],
              field_abbreviation: ['VV LOG'],
              field_date_of_issue: [Date.parse('1963-02-11T23:00:00Z') / 1000],
              field_historically: [true],
              uuid: ['618b62b8-d9e2-4e51-8797-5215957f0f96'],
              search_api_id: ['entity:node/136308:de'],
            },
            sort: ['entity:node/136308:de'],
          },
          {
            _id: 'entity:node/7:de',
            _source: { url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012021-lang', title: 'Kurz', field_long_title: ['Lange   Bezeichnung'], type: LRMB_INDEX, field_inforce_date: ['1701385200'], field_outforce_date: [], field_historically: false, field_abbreviation: ['  '] },
            sort: ['entity:node/7:de'],
          },
          { _id: 'entity:node/8:de', _source: { title: ['ohne Adresse'] }, sort: ['entity:node/8:de'] },
          { _id: 'x', _source: { url: ['/lrmb/verwaltungsvorschrift/kein-knoten'], search_api_id: ['entity:taxonomy_term/5:de'] }, sort: ['entity:taxonomy_term/5:de'] },
        ],
      },
    });
    const parsed = parseSearchResponse(response);
    expect(parsed.total).toBe(4);
    expect(parsed.rawHitCount).toBe(4);
    expect(parsed.lastSort).toEqual(['entity:taxonomy_term/5:de']);
    expect(parsed.hits).toEqual([
      {
        nodeId: '136308',
        uuid: '618b62b8-d9e2-4e51-8797-5215957f0f96',
        url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landesorganisationsgesetz',
        indexType: LRMB_INDEX,
        title: 'Verwaltungsvorschriften zum Landesorganisationsgesetz',
        documentTypeName: 'Verwaltungsvorschrift',
        abbreviation: 'VV LOG',
        dateOfIssue: '1963-02-12',
        historically: true,
      },
      { nodeId: '7', url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01012021-lang', indexType: LRMB_INDEX, title: 'Lange Bezeichnung', inforceDate: '2023-12-01', historically: false },
    ]);
    expect(parseSearchResponse(JSON.stringify({ hits: { total: 7, hits: [] } }))).toEqual({ total: 7, hits: [], rawHitCount: 0 });
    expect(() => parseSearchResponse(JSON.stringify({ error: 'x' }))).toThrow(/ohne hits/u);
  });
});

describe('RECHT.NRW Enumeration: Abruf über den Fetcher (Stub)', () => {
  const rawHit = (n: number, source: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: `entity:node/${n}:de`,
    _source: { url: [`/lrmb/verwaltungsvorschrift/vv-${n}`], title: [`Runderlass ${n}`], type: [LRMB_INDEX], search_api_id: [`entity:node/${n}:de`], ...source },
    sort: [`entity:node/${String(n).padStart(6, '0')}`],
  });
  const page = (from: number, count: number, total: number, patch: (n: number) => Record<string, unknown> = () => ({})): string =>
    JSON.stringify({ hits: { total: { value: total }, hits: Array.from({ length: count }, (_, index) => rawHit(from + index, patch(from + index))) } });

  it('liest alle Sitemap-Seiten in Reihenfolge der Indexdatei', async () => {
    const pages: Record<string, string> = {
      [SITEMAP_INDEX_URL]: '<sitemapindex><sitemap><loc>https://recht.nrw.de/sitemap/page/1/sitemap.xml</loc></sitemap><sitemap><loc>https://recht.nrw.de/sitemap/page/2/sitemap.xml</loc></sitemap></sitemapindex>',
      'https://recht.nrw.de/sitemap/page/1/sitemap.xml': `<urlset><url><loc>${ALPHA_2020}</loc></url><url><loc>${ALPHA_2022}</loc></url></urlset>`,
      'https://recht.nrw.de/sitemap/page/2/sitemap.xml': `<urlset><url><loc>${BETA}</loc></url></urlset>`,
    };
    const fetcher = stubFetcher((url) => {
      const text = pages[url];
      if (text === undefined) throw new Error(`unerwarteter Abruf ${url}`);
      return text;
    });
    const log: string[] = [];
    const result = await fetchSitemapUrls(fetcher, (line) => log.push(line));
    expect(result).toEqual({ pages: ['https://recht.nrw.de/sitemap/page/1/sitemap.xml', 'https://recht.nrw.de/sitemap/page/2/sitemap.xml'], urls: [ALPHA_2020, ALPHA_2022, BETA] });
    expect(fetcher.calls.map((call) => call.url)).toEqual([SITEMAP_INDEX_URL, ...result.pages]);
    expect(fetcher.calls.every((call) => call.request.method === undefined && /xml/u.test(call.request.accept ?? ''))).toBe(true);
    expect(log).toHaveLength(2);
  });

  it('blättert den Suchindex per search_after bis zur letzten unvollständigen Seite', async () => {
    const total = SEARCH_PAGE_SIZE * 2 + 3;
    const fetcher = stubFetcher((url, request) => {
      expect(url).toBe(SEARCH_URL);
      const body = JSON.parse(request.body ?? '{}') as { search_after?: string[]; size: number };
      expect(body.size).toBe(SEARCH_PAGE_SIZE);
      if (!body.search_after) return page(1, SEARCH_PAGE_SIZE, total);
      if (body.search_after[0] === `entity:node/${String(SEARCH_PAGE_SIZE).padStart(6, '0')}`) return page(SEARCH_PAGE_SIZE + 1, SEARCH_PAGE_SIZE, total);
      if (body.search_after[0] === `entity:node/${String(SEARCH_PAGE_SIZE * 2).padStart(6, '0')}`) return page(SEARCH_PAGE_SIZE * 2 + 1, 3, total);
      throw new Error(`unerwartetes search_after ${JSON.stringify(body.search_after)}`);
    });
    const log: string[] = [];
    const result = await fetchSearchHits(fetcher, LRMB_INDEX, (line) => log.push(line));
    expect(fetcher.calls).toHaveLength(3);
    expect(fetcher.calls.every((call) => call.request.method === 'POST' && call.request.contentType === 'application/json' && call.request.accept === 'application/json')).toBe(true);
    expect(result.total).toBe(total);
    expect(result.hits).toHaveLength(total);
    expect(new Set(result.hits.map((entry) => entry.nodeId)).size).toBe(total);
    expect(result.hits.at(-1)).toMatchObject({ nodeId: String(total), url: `${VV}/vv-${total}`, title: `Runderlass ${total}` });
    expect(log.at(-1)).toBe(`Suchindex ${LRMB_INDEX}: ${total}/${total}`);
  });

  it('endet nach einer vollen Seite, wenn die Folgeseite leer ist', async () => {
    const fetcher = stubFetcher((_url, request) => (request.body?.includes('search_after') ? JSON.stringify({ hits: { total: { value: SEARCH_PAGE_SIZE }, hits: [] } }) : page(1, SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE)));
    const result = await fetchSearchHits(fetcher, LRMB_INDEX);
    expect(fetcher.calls).toHaveLength(2);
    expect(result.hits).toHaveLength(SEARCH_PAGE_SIZE);
  });

  it('blättert weiter, wenn eine volle Seite einzelne unbrauchbare Treffer (ohne Adresse) enthält', async () => {
    const total = SEARCH_PAGE_SIZE + 2;
    const fetcher = stubFetcher((_url, request) => {
      const body = JSON.parse(request.body ?? '{}') as { search_after?: string[] };
      if (!body.search_after) return page(1, SEARCH_PAGE_SIZE, total, (n) => (n === 17 ? { url: [] } : {}));
      return page(SEARCH_PAGE_SIZE + 1, 2, total);
    });
    const result = await fetchSearchHits(fetcher, LRMB_INDEX);
    expect(fetcher.calls).toHaveLength(2);
    expect(result.hits).toHaveLength(total - 1);
    expect(result.hits.some((entry) => entry.nodeId === '17')).toBe(false);
    expect(result.hits.at(-1)?.nodeId).toBe(String(total));
  });
});

describe('RECHT.NRW Enumeration: Aufbau und Abgleich', () => {
  it('gruppiert Fassungsadressen nach Slug-Stamm, entfernt doppelte Suchtreffer und weist die Abgleichszahlen aus', () => {
    const file = buildEnumeration(crosscheckInput());
    expect(file).toMatchObject({ schemaVersion: ENUMERATION_SCHEMA, sourceArea: 'lrmb', baselineDate: '2023-12-01', generatedAt: NOW_A });
    expect(file.sources).toEqual({ sitemap: { indexUrl: SITEMAP_INDEX_URL, pages: 2, urls: 5 }, search: { url: SEARCH_URL, indexTypes: [LRMB_INDEX], total: 3, hits: 3 } });
    expect(file.crosscheck).toEqual({
      sitemapUrls: 5,
      sitemapStems: 3,
      searchHits: 3,
      searchUniqueUrls: 2,
      duplicateSearchUrls: 1,
      searchHitsInSitemap: 1,
      searchHitsNotInSitemap: 1,
      union: 4,
      intersection: 1,
      onlySitemap: 2,
      onlySearch: 1,
      items: 4,
      resolvedTerms: 0,
      review: 0,
      excluded: 0,
      unassignedUrls: 0,
      duplicateUrlAssignments: 0,
      termConflicts: 0,
      ok: true,
      problems: [],
      notes: [],
    });
    expect(file.items.map((item) => item.key)).toEqual(['stem:verwaltungsvorschrift/alpha-erlass', 'stem:verwaltungsvorschrift/beta-richtlinie', 'stem:verwaltungsvorschrift/delta-runderlass', 'stem:verwaltungsvorschrift/gamma-vorschrift']);

    const alpha = itemByKey(file, 'stem:verwaltungsvorschrift/alpha-erlass');
    expect(alpha).toEqual({
      key: 'stem:verwaltungsvorschrift/alpha-erlass',
      entryUrl: ALPHA_2022,
      portalType: 'verwaltungsvorschrift',
      title: 'Alpha-Erlass',
      titleSource: 'search-index',
      status: 'pending',
      urls: [ALPHA_2020, ALPHA_2022],
      signals: { sitemap: true, search: true },
      search: { nodeId: '1', uuid: 'uuid-1', historically: false },
      preclassification: { decision: 'likely-include', reasons: ['Titel nennt Verwaltungsvorschrift/Erlass/Richtlinie'] },
      role: 'norm-candidate',
      attempts: 0,
    });
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/beta-richtlinie')).toMatchObject({ entryUrl: BETA, urls: [BETA], title: 'Beta richtlinie', titleSource: 'slug', signals: { sitemap: true, search: false } });
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/beta-richtlinie').search).toBeUndefined();
    // Ohne Suchtreffer ist die jüngste datierte Fassung die Einstiegsadresse.
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/gamma-vorschrift')).toMatchObject({ entryUrl: GAMMA_2021, urls: [GAMMA_2021, GAMMA_2019] });
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/delta-runderlass')).toMatchObject({ entryUrl: DELTA, urls: [DELTA], signals: { sitemap: false, search: true }, title: 'Runderlass Delta' });
    expect(file.items.every((item) => item.sourceIdentity === undefined)).toBe(true);
  });

  it('meldet leere Quellen als Abgleichsproblem', () => {
    const file = buildEnumeration({ area: 'lrmb', sitemap: { pages: 0, urls: [] }, search: { total: 0, hits: [] }, now: NOW_A });
    expect(file.items).toEqual([]);
    expect(file.crosscheck.ok).toBe(false);
    expect(file.crosscheck.problems).toEqual(['Sitemap enthält keine Adressen des Bereichs', 'Suchindex lieferte keine Treffer']);
  });

  it('schlüsselt Einträge als term:<id>, wenn das Manifest die Stammnorm kennt, sonst als stem:<typ>/<slug>', () => {
    const manifest = manifestOf([
      manifestEntry('term:23371', [ALPHA_2022, ALPHA_2020]),
      manifestEntry('term:9', [DELTA]),
      // anderer Bereich und keine Term-Kennung: werden nicht übernommen
      { ...manifestEntry('term:777', [BETA]), sourceArea: 'lrgv' },
      manifestEntry('url:beta', [BETA]),
    ]);
    const file = buildEnumeration(crosscheckInput({ manifest }));
    expect(file.items.map((item) => item.key)).toEqual(['term:9', 'term:23371', 'stem:verwaltungsvorschrift/beta-richtlinie', 'stem:verwaltungsvorschrift/gamma-vorschrift']);
    expect(itemByKey(file, 'term:23371')).toMatchObject({ sourceIdentity: 'term:23371', urls: [ALPHA_2020, ALPHA_2022], entryUrl: ALPHA_2022, title: 'Alpha-Erlass', signals: { sitemap: true, search: true } });
    expect(itemByKey(file, 'term:9')).toMatchObject({ sourceIdentity: 'term:9', signals: { sitemap: false, search: true } });
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/beta-richtlinie').sourceIdentity).toBeUndefined();
    expect(file.crosscheck).toMatchObject({ items: 4, resolvedTerms: 2, termConflicts: 0, duplicateUrlAssignments: 0, ok: true });
  });

  it('lässt eine widersprüchliche Adresse beim Slug-Stamm, führt die Terme weiter und meldet den Konflikt als Hinweis', () => {
    const manifest = manifestOf([manifestEntry('term:1', [GAMMA_2019]), manifestEntry('term:2', [GAMMA_2019])]);
    const file = buildEnumeration(crosscheckInput({ manifest }));
    expect(file.crosscheck.termConflicts).toBe(1);
    expect(file.crosscheck.problems).toEqual([]);
    expect(file.crosscheck.ok).toBe(true);
    expect(file.crosscheck.notes).toContain(`${GAMMA_2019} ist mehreren Stammnormen zugeordnet (term:1, term:2)`);
    expect(itemByKey(file, 'stem:verwaltungsvorschrift/gamma-vorschrift').urls).toEqual([GAMMA_2021, GAMMA_2019]);
    // Beide Stammnormen bleiben sichtbar (aus dem Manifest geführt), damit nichts aus dem Nenner fällt.
    expect(itemByKey(file, 'term:1')).toMatchObject({ sourceIdentity: 'term:1', titleSource: 'manifest' });
    expect(itemByKey(file, 'term:2')).toMatchObject({ sourceIdentity: 'term:2', titleSource: 'manifest' });
  });

  it('übernimmt Term-IDs und Bearbeitungsstand (Status, Versuche, Fehler, Ergebnis) aus der früheren Enumeration', () => {
    const previous = buildEnumeration(crosscheckInput());
    const alpha = itemByKey(previous, 'stem:verwaltungsvorschrift/alpha-erlass');
    Object.assign(alpha, { sourceIdentity: 'term:500', status: 'done', attempts: 1, outcome: { importStatus: 'imported', targetSlug: 'alpha-west', parserVersion: 'p', transformerVersion: 't' }, updatedAt: NOW_A, lastRunId: 'lauf-1' });
    Object.assign(itemByKey(previous, 'stem:verwaltungsvorschrift/beta-richtlinie'), { status: 'failed', attempts: 2, lastError: { code: 'http', message: 'HTTP 500' } });
    Object.assign(itemByKey(previous, 'stem:verwaltungsvorschrift/gamma-vorschrift'), { status: 'review', attempts: 1, outcome: { importStatus: 'needs-review', reviewCategories: ['normativity'] } });
    Object.assign(itemByKey(previous, 'stem:verwaltungsvorschrift/delta-runderlass'), { status: 'processing', attempts: 3 });

    const rebuilt = buildEnumeration(crosscheckInput({ previous, now: NOW_B }));
    expect(rebuilt.items.map((item) => item.key)).toEqual(['term:500', 'stem:verwaltungsvorschrift/beta-richtlinie', 'stem:verwaltungsvorschrift/delta-runderlass', 'stem:verwaltungsvorschrift/gamma-vorschrift']);
    expect(itemByKey(rebuilt, 'term:500')).toMatchObject({ sourceIdentity: 'term:500', status: 'done', attempts: 1, urls: [ALPHA_2020, ALPHA_2022], outcome: { importStatus: 'imported', targetSlug: 'alpha-west' }, updatedAt: NOW_A, lastRunId: 'lauf-1' });
    expect(itemByKey(rebuilt, 'stem:verwaltungsvorschrift/beta-richtlinie')).toMatchObject({ status: 'failed', attempts: 2, lastError: { code: 'http', message: 'HTTP 500' } });
    expect(itemByKey(rebuilt, 'stem:verwaltungsvorschrift/gamma-vorschrift')).toMatchObject({ status: 'review', attempts: 1, outcome: { reviewCategories: ['normativity'] } });
    // Ein nach hartem Abbruch liegengebliebenes `processing` gilt als offen.
    expect(itemByKey(rebuilt, 'stem:verwaltungsvorschrift/delta-runderlass')).toMatchObject({ status: 'pending', attempts: 3 });
    expect(rebuilt.crosscheck).toMatchObject({ items: 4, resolvedTerms: 1, review: 1, ok: true });
    expect(enumerationStatusCounts(rebuilt)).toEqual({ pending: 1, processing: 0, done: 1, review: 1, failed: 1, excluded: 0 });
  });

  it('erzeugt bei einer Slugänderung zwischen zwei Läufen keinen zweiten Eintrag für dieselbe Stammnorm', () => {
    const OLD = `${VV}/01012020-alpha-erlass-alte-bezeichnung`;
    const NEW = `${VV}/01012024-alpha-erlass-neue-bezeichnung`;
    const input = (urls: string[], hits: SearchHit[], previous?: EnumerationFile): BuildEnumerationInput => ({ area: 'lrmb', sitemap: { pages: 1, urls }, search: { total: hits.length, hits }, now: NOW_B, ...(previous ? { previous } : {}) });

    // Lauf 1: zwei Slug-Stämme, die Term-ID ist noch unbekannt.
    const first = buildEnumeration(input([OLD, NEW], [hit(NEW, '11', 'Alpha-Erlass (neue Bezeichnung)')]));
    expect(first.items.map((item) => item.key)).toEqual(['stem:verwaltungsvorschrift/alpha-erlass-alte-bezeichnung', 'stem:verwaltungsvorschrift/alpha-erlass-neue-bezeichnung']);

    // Bulk-Lauf (wie bulk-runner.ts): Fassungsliste belegt term:500 für beide Adressen, der zweite Stamm wird zusammengeführt.
    const processed = itemByKey(first, 'stem:verwaltungsvorschrift/alpha-erlass-alte-bezeichnung');
    const merged = itemByKey(first, 'stem:verwaltungsvorschrift/alpha-erlass-neue-bezeichnung');
    Object.assign(processed, { sourceIdentity: 'term:500', status: 'done', attempts: 1, urls: [OLD, NEW].sort() });
    Object.assign(merged, { mergedInto: 'term:500', status: 'done' });
    expect(enumerationStatusCounts(first)).toEqual({ pending: 0, processing: 0, done: 1, review: 0, failed: 0, excluded: 0 });

    // Lauf 2: beide Fassungen noch in der Sitemap.
    const second = buildEnumeration(input([NEW, OLD], [hit(NEW, '11', 'Alpha-Erlass (neue Bezeichnung)')], first));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ key: 'term:500', sourceIdentity: 'term:500', status: 'done', attempts: 1, urls: [OLD, NEW], entryUrl: NEW, title: 'Alpha-Erlass (neue Bezeichnung)' });
    expect(second.items[0]!.mergedInto).toBeUndefined();
    expect(second.crosscheck).toMatchObject({ sitemapStems: 2, items: 1, resolvedTerms: 1, duplicateUrlAssignments: 0, unassignedUrls: 0, ok: true });

    // Lauf 3: die alte Fassungsseite ist aus der Sitemap verschwunden, nur der neue Slug bleibt.
    const third = buildEnumeration(input([NEW], [hit(NEW, '11', 'Alpha-Erlass (neue Bezeichnung)')], second));
    expect(third.items.map((item) => [item.key, item.status, item.urls])).toEqual([['term:500', 'done', [NEW]]]);
  });
});

describe('RECHT.NRW Enumeration: Terme aus dem Manifest (Regression)', () => {
  /**
   * Regression aus dem echten LRGV-Bulk: Führen die Fassungslisten mehrerer Stammnormen dieselbe Adresse, blieb
   * die Adresse beim Slug-Stamm. Terme, deren Adressen sämtlich betroffen waren, verloren ihren Eintrag – nach
   * dem Bulk fehlten 164 bereits verarbeitete Quellidentitäten im Nenner der Coverage.
   */
  it('behält bekannte Terme trotz Adresskonflikten und wertet den Konflikt als Hinweis', () => {
    const manifest = manifestOf([
      manifestEntry('term:100', [ALPHA_2020, ALPHA_2022]),
      manifestEntry('term:200', [ALPHA_2020, ALPHA_2022], { importStatus: 'not-at-baseline' }),
    ]);
    const file = buildEnumeration(crosscheckInput({ manifest }));
    expect(file.crosscheck.termConflicts).toBeGreaterThan(0);
    expect(file.crosscheck.problems).toEqual([]);
    expect(file.crosscheck.ok).toBe(true);
    expect(file.crosscheck.notes.some((note) => note.includes('mehreren Stammnormen zugeordnet'))).toBe(true);
    const identities = new Set(file.items.flatMap((item) => [item.sourceIdentity, item.mergedInto].filter(Boolean)));
    expect(identities.has('term:100')).toBe(true);
    expect(identities.has('term:200')).toBe(true);
    expect(itemByKey(file, 'term:200')).toMatchObject({ status: 'done', titleSource: 'manifest' });
  });
});

describe('RECHT.NRW Enumeration: Vorklassifikation', () => {
  it('schließt eindeutige Titel (Stellenausschreibung, Personalnachricht, Sitzung, Wahl, Berichtigung) ohne Seitenabruf aus', () => {
    for (const [title, reason] of [
      ['Stellenausschreibung für die Leitung des Landesamtes', 'Stellenausschreibung'],
      ['Ausschreibung von Stellen im Justizdienst', 'Stellenausschreibung'],
      ['Personalnachrichten', 'Personalnachricht'],
      ['3. öffentliche Sitzung des Landesjugendhilfeausschusses', 'Sitzungs- oder Tagesordnungsbekanntmachung'],
      ['Wahlergebnis der Kommunalwahl', 'Wahlbekanntmachung'],
      ['Berichtigung des Runderlasses vom 1. März 2020', 'Berichtigung (an der berichtigten Vorschrift berücksichtigt)'],
    ] as const) {
      expect(preclassify('lrmb', 'verwaltungsvorschrift', title)).toEqual({ decision: 'likely-exclude', reasons: [reason], safeExclusion: true, role: 'norm-candidate' });
    }
    expect(preclassify('lrmb', 'bekanntmachung', '  Stellenausschreibung\n Referent ')).toMatchObject({ decision: 'likely-exclude', safeExclusion: true });
  });

  it('schließt mehrdeutige Titel nie allein wegen des Titels aus', () => {
    expect(preclassify('lrmb', 'verwaltungsvorschrift', 'Hinweise zur Anwendung des Schulgesetzes')).toMatchObject({ decision: 'review', safeExclusion: false });
    expect(preclassify('lrmb', 'verwaltungsvorschrift', 'Muster einer Dienstanweisung (Runderlass)')).toMatchObject({ decision: 'review', safeExclusion: false });
    expect(preclassify('lrmb', 'verwaltungsvorschrift', 'Bekanntgabe über den Landeswettbewerb')).toEqual({ decision: 'unknown', reasons: ['Titel ohne eindeutige Zuordnung'], safeExclusion: false, role: 'norm-candidate' });
    expect(preclassify('lrmb', 'bekanntmachung', 'Satzung der Ärztekammer Westfalen-Lippe')).toEqual({ decision: 'likely-exclude', reasons: ['möglicherweise autonome Satzung einer Körperschaft', 'Grenzfall: Seite wird geladen'], safeExclusion: false, role: 'norm-candidate' });
    expect(preclassify('lrmb', 'bekanntmachung', 'Durchführung des Landeshundegesetzes')).toMatchObject({ decision: 'review', safeExclusion: false });
    expect(preclassify('lrmb', 'verwaltungsvorschrift', 'Runderlass zur Durchführung des Landesbeamtengesetzes')).toMatchObject({ decision: 'likely-include', safeExclusion: false });
    // Im Bereich LRGV entscheidet der Portaltyp, nicht der Titel.
    expect(preclassify('lrgv', 'gesetz', 'Stellenausschreibung')).toEqual({ decision: 'likely-include', reasons: ['Portaltyp gesetz'], safeExclusion: false, role: 'norm-candidate' });
    expect(preclassify('lrgv', 'verwaltungsvorschrift', 'Verwaltungsvorschrift zum Schulgesetz')).toMatchObject({ decision: 'review', safeExclusion: false, role: 'norm-candidate' });
  });

  it('übernimmt die Vorklassifikation in die Enumeration: nur sichere Ausschlüsse werden excluded', () => {
    const urls = [`${VV}/01012020-stellenausschreibung`, `${VV}/01012020-hinweise`, `${VV}/01012020-satzung`, `${VV}/01012020-bekanntgabe`];
    const titles = ['Stellenausschreibung Referat 12', 'Hinweise zum Umgang mit Fundsachen', 'Satzung der Handwerkskammer', 'Bekanntgabe Landeswettbewerb'];
    const file = buildEnumeration({ area: 'lrmb', sitemap: { pages: 1, urls }, search: { total: 4, hits: urls.map((url, index) => hit(url, String(index + 1), titles[index]!)) }, now: NOW_A });
    expect(file.items.map((item) => [item.title, item.status, item.preclassification.decision])).toEqual([
      ['Bekanntgabe Landeswettbewerb', 'pending', 'unknown'],
      ['Hinweise zum Umgang mit Fundsachen', 'pending', 'review'],
      ['Satzung der Handwerkskammer', 'pending', 'likely-exclude'],
      ['Stellenausschreibung Referat 12', 'excluded', 'likely-exclude'],
    ]);
    expect(file.crosscheck).toMatchObject({ excluded: 1, review: 1 });
    expect(enumerationStatusCounts(file)).toEqual({ pending: 3, processing: 0, done: 0, review: 0, failed: 0, excluded: 1 });
  });

  it('führt LRGV-Bekanntmachungen als Evidenzquelle (Inkrafttreten eines Staatsvertrags) und nicht als Norm', () => {
    const LRGV = 'https://recht.nrw.de/lrgv';
    const law = `${LRGV}/gesetz/01082005-schulgesetz-nrw`;
    const treatyNotice = `${LRGV}/bekanntmachung/01012021-bekanntmachung-inkrafttreten-staatsvertrag`;
    const newVersionNotice = `${LRGV}/bekanntmachung/15062016-neufassung-landesbeamtengesetz`;
    const file = buildEnumeration({
      area: 'lrgv',
      sitemap: { pages: 1, urls: [law, treatyNotice, newVersionNotice, `${LRGV}/gesetz/undatiert`, `${VV}/01012020-alpha-erlass`] },
      search: {
        total: 3,
        hits: [
          { ...hit(law, '1', 'Schulgesetz für das Land Nordrhein-Westfalen'), indexType: 'state_law_and_regulations' },
          { ...hit(treatyNotice, '2', 'Bekanntmachung über das Inkrafttreten des Staatsvertrages zur Neuordnung des Rundfunkrechts'), indexType: 'state_law_and_regulations' },
          { ...hit(newVersionNotice, '3', 'Bekanntmachung der Neufassung des Landesbeamtengesetzes'), indexType: 'state_law_and_regulations' },
        ],
      },
      now: NOW_A,
    });
    expect(file.sources.search.indexTypes).toEqual(['state_law_and_regulations']);
    expect(file.crosscheck).toMatchObject({ sitemapUrls: 3, items: 3, excluded: 0, ok: true });
    expect(itemByKey(file, 'stem:gesetz/schulgesetz-nrw')).toMatchObject({ role: 'norm-candidate', status: 'pending', preclassification: { decision: 'likely-include' } });
    expect(itemByKey(file, 'stem:gesetz/schulgesetz-nrw').evidence).toBeUndefined();
    const treaty = itemByKey(file, 'stem:bekanntmachung/bekanntmachung-inkrafttreten-staatsvertrag');
    expect(treaty).toMatchObject({ role: 'evidence', status: 'pending', evidence: { kind: 'treaty-in-force-notice', treatyTitle: 'Staatsvertrages zur Neuordnung des Rundfunkrechts' }, preclassification: { decision: 'likely-exclude' } });
    expect(treaty.preclassification.reasons[0]).toContain('(Inkrafttreten/Neufassung)');
    expect(itemByKey(file, 'stem:bekanntmachung/neufassung-landesbeamtengesetz')).toMatchObject({ role: 'evidence', evidence: { kind: 'notice' } });
  });
});

describe('RECHT.NRW Enumeration: Determinismus, Schreiben und Lesen', () => {
  it('liefert für dieselben Quellen unabhängig vom Zeitpunkt denselben Inhalt; nur generatedAt ist Laufmetadatum', () => {
    const first = buildEnumeration(crosscheckInput({ now: NOW_A }));
    const second = buildEnumeration(crosscheckInput({ now: NOW_B }));
    expect(second.generatedAt).toBe(NOW_B);
    expect(second.contentFingerprint).toBe(first.contentFingerprint);
    expect(first.contentFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    const withoutRuntime = (file: EnumerationFile): string => enumerationJsonText({ ...file, generatedAt: '' });
    expect(withoutRuntime(second)).toBe(withoutRuntime(first));
    // Mit früherer Enumeration bleibt auch der Zeitstempel stabil.
    const repeat = buildEnumeration(crosscheckInput({ now: NOW_B, previous: first }));
    expect(enumerationJsonText(repeat)).toBe(enumerationJsonText(first));
    // Reihenfolge der Quellen ändert die Ausgabe nicht (je Stamm ein Suchtreffer).
    const input = crosscheckInput({ now: NOW_A });
    const reversed = buildEnumeration({ ...input, sitemap: { ...input.sitemap, urls: [...input.sitemap.urls].reverse() }, search: { ...input.search, hits: [input.search.hits[0]!, input.search.hits[2]!, input.search.hits[1]!] } });
    expect(enumerationJsonText(reversed)).toBe(enumerationJsonText(first));
  });

  it('hält Laufmetadaten der Einträge aus dem Fingerabdruck heraus, Statuswechsel aber nicht', () => {
    const file = buildEnumeration(crosscheckInput());
    const runtimeOnly: EnumerationFile = { ...file, items: file.items.map((item) => ({ ...item, updatedAt: NOW_B, lastRunId: 'lauf-9' })) };
    expect(enumerationFingerprint(runtimeOnly)).toBe(file.contentFingerprint);
    const statusChanged: EnumerationFile = { ...file, items: file.items.map((item, index) => (index === 0 ? { ...item, status: 'done' as const } : item)) };
    expect(enumerationFingerprint(statusChanged)).not.toBe(file.contentFingerprint);
  });

  it('schreibt einen Eintrag je Zeile, meldet unveränderte Wiederholung als nicht geändert und liest verlustfrei zurück', async () => {
    const first = buildEnumeration(crosscheckInput({ now: NOW_A }));
    expect(await writeEnumeration(root, first)).toBe(true);
    const rebuilt = buildEnumeration(crosscheckInput({ now: NOW_B, previous: first }));
    expect(await writeEnumeration(root, rebuilt)).toBe(false);

    const text = enumerationJsonText(first);
    expect(text.endsWith('\n  ]\n}\n')).toBe(true);
    const itemLines = text.split('\n').filter((line) => line.startsWith('    {"key":'));
    expect(itemLines).toHaveLength(first.items.length);

    const read = await readEnumeration(root, 'lrmb');
    expect(read).toEqual(first);
    expect(await readEnumeration(root, 'lrgv')).toBeUndefined();

    // Statusänderung: der Fingerabdruck wird beim Schreiben neu berechnet.
    const changed: EnumerationFile = { ...first, items: first.items.map((item) => (item.key === 'stem:verwaltungsvorschrift/beta-richtlinie' ? { ...item, status: 'done' as const, attempts: 1 } : item)) };
    expect(await writeEnumeration(root, changed)).toBe(true);
    const reread = await readEnumeration(root, 'lrmb');
    expect(reread?.contentFingerprint).toBe(enumerationFingerprint(changed));
    expect(reread?.contentFingerprint).not.toBe(first.contentFingerprint);
    expect(itemByKey(reread!, 'stem:verwaltungsvorschrift/beta-richtlinie')).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('weist ungültige Enumerationsdateien zurück', async () => {
    const target = join(root, enumerationPath('lrgv'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ schemaVersion: ENUMERATION_SCHEMA, sourceArea: 'lrmb', items: [] }));
    await expect(readEnumeration(root, 'lrgv')).rejects.toThrow(/keine gültige Enumeration/u);
    await writeFile(target, JSON.stringify({ schemaVersion: 'recht-nrw-enumeration/0', sourceArea: 'lrgv', items: [] }));
    await expect(readEnumeration(root, 'lrgv')).rejects.toThrow(/keine gültige Enumeration/u);
    await writeFile(target, '{"schemaVersion": ');
    await expect(readEnumeration(root, 'lrgv')).rejects.toThrow(/Beschädigte Zustandsdatei/u);
    await rm(target);
  });

  it('zählt Status ohne zusammengeführte Einträge und führt alle Status auf', () => {
    const file = buildEnumeration(crosscheckInput());
    const statuses: EnumerationItem['status'][] = ['done', 'review', 'failed', 'excluded'];
    file.items.forEach((item, index) => {
      item.status = statuses[index]!;
    });
    file.items[0]!.mergedInto = 'term:1';
    const counts = enumerationStatusCounts(file);
    expect(Object.keys(counts)).toEqual([...ENUMERATION_STATUSES]);
    expect(counts).toEqual({ pending: 0, processing: 0, done: 0, review: 1, failed: 1, excluded: 1 });
  });
});
