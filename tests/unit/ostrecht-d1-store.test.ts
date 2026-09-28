/**
 * Ost über die OstRecht-D1 (Variante A): der Read-only-Adapter liefert den OstRecht-Bestand nach den Landesrecht-Regeln
 * (Baseline 2023-12-01, Stichtag, Suchdokument, Verkündungen), ohne eine zweite Ost-Kopie. Fixture: Auszug im
 * OstRecht-Schema (tests/fixtures/ostrecht/ostrecht-recht.sql).
 */
import { describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isSimulationNorm } from '@landesrecht/legal-core/lib/provenance.ts';
import { classifyNormVersion, getCurrentVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { adaptOstRechtPublication, adaptOstRechtSearchDocument, createOstRechtD1Store, mergeDerivedRelations, mergeStaleHits, type OstRechtSearchIndexDocument } from '@landesrecht/runtime/ostrecht-d1-store.ts';
import { checkOstRechtFreshness, resetOstRechtFreshnessCache } from '@landesrecht/runtime/ostrecht-freshness.ts';
import { auditOstRechtDrift } from '@landesrecht/runtime/ostrecht-drift.ts';
import { createReadOnlyD1 } from '@landesrecht/runtime/read-only-d1.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { getNormSummaries } from '@landesrecht/runtime/store.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE } from '../helpers/fixture-corpus.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';

const FEIERTAG = 'ostdeutsches-feiertagsgesetz';
const NDR = 'ndr-staatsvertrag';
const EXCLUDED = 'oberstufenund-abiturprufungsverordnung';
const FUTURE = 'gesetz-zur-einfuehrung-von-hinweisgebermeldestellen';
const REPEALED = 'dienstanordnung-momentane-terrorgefahr-2024';
const OWN_AMENDMENT = 'gesetz-uber-die-einfuhrung-einer-kommunalen-privatisierungsb-zue3jo';
const OWN_NORM = 'ostdeutsches-landesantidiskriminierungsgesetz';

describe('OstRecht-D1-Store (Ost, Variante A)', () => {
  it('listet den Bestand (Normliste) mit Ost-Adressen und schließt Normen ohne Fassung am Ausgangsrechtsstand aus', async () => {
    const { store } = await openOstRechtFixture();
    const list = await store.listNormSummaries({ limit: 100 });
    expect(list).toHaveLength(11);
    expect(list.map((entry) => entry.slug)).not.toContain(EXCLUDED);
    expect(list.every((entry) => entry.jurisdiction === 'ost' && entry.url === `/ost/norm/${entry.slug}/`)).toBe(true);
    expect((await store.listNormSummaries({ type: 'staatsvertrag' })).map((entry) => [entry.slug, entry.type])).toEqual([['ndr-staatsvertrag', 'staatsvertrag'], ['vertrag-heiliger-stuhl-freistaat-ostdeutschland', 'staatsvertrag']]);
    expect(await store.listNormSummaries({ status: 'repealed' })).toHaveLength(2);
  });

  it('zählt je Normtyp über den ganzen Bestand', async () => {
    const { store } = await openOstRechtFixture();
    const counts = await store.countNormsByType();
    expect(counts.reduce((sum, entry) => sum + entry.count, 0)).toBe(11);
    expect(counts.find((entry) => entry.type === 'aenderungsvorschrift')?.count).toBe(3);
    const list = await store.listNormSummaries({ limit: 100 });
    for (const entry of counts) expect(list.filter((item) => item.type === entry.type)).toHaveLength(entry.count);
  });

  it('liefert die aktuelle Norm: geltende Fassung am Landesrecht-Stichtag, Körper nur der geltenden Fassung', async () => {
    const { store } = await openOstRechtFixture();
    const summary = await store.getNormSummary(FEIERTAG);
    expect(summary).toMatchObject({ jurisdiction: 'ost', slug: FEIERTAG, status: 'in-force', currentVersionId: '2026-03-23', currentValidFrom: '2026-03-24', versionCount: 3, lastChangeDate: '2026-03-24', abbr: 'OstFSG' });
    const record = await store.getNorm(FEIERTAG);
    expect(record?.meta.jurisdiction).toBe('ost');
    expect(record?.meta.id).toBe(`ost:${FEIERTAG}`);
    expect(getCurrentVersion(record!).versionId).toBe('2026-03-23');
    expect(record!.versions.map((version) => version.body.length > 0)).toEqual([false, false, true]);
    expect((await store.getNorm(FEIERTAG, 'all'))!.versions.every((version) => version.body.length > 0)).toBe(true);
  });

  it('bildet eine Norm mit mehreren Fassungen in Geltungsreihenfolge mit abgeleiteten Enden ab', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(FEIERTAG, 'none'))!;
    expect(record.versions.map((version) => [version.versionId, version.simulationValidFrom, version.simulationValidTo])).toEqual([
      ['2023-11-01', SIMULATION_BASELINE_DATE, '2024-03-07'],
      ['2024-03-07', '2024-03-08', '2026-03-23'],
      ['2026-03-23', '2026-03-24', null],
    ]);
    expect(record.versions.map((version) => classifyNormVersion(record, version))).toEqual(['historical', 'historical', 'current']);
  });

  it('wendet die Baseline-Regel an: die am 01.12.2023 geltende OstRecht-Fassung beginnt hier am Ausgangsrechtsstand, Version-ID und Quellgeltung bleiben', async () => {
    const { store } = await openOstRechtFixture();
    const feiertag = (await store.getNorm(FEIERTAG, 'none'))!;
    expect(feiertag.versions[0]).toMatchObject({ versionId: '2023-11-01', simulationValidFrom: SIMULATION_BASELINE_DATE, sourceValidFrom: expect.any(String) });
    expect(feiertag.versions[0]!.sourceValidFrom! <= '2023-11-01').toBe(true);
    // Fassung, die schon 2021 begann und am Ausgangsrechtsstand galt: gleiche Fassung, Beginn hier am Ausgangsrechtsstand.
    const ndr = (await store.getNorm(NDR, 'none'))!;
    expect(ndr.versions.map((version) => [version.versionId, version.simulationValidFrom])).toEqual([['2021-09-01', SIMULATION_BASELINE_DATE], ['2026-09-03', '2026-09-03']]);
    expect((await store.getNormSummary(NDR))?.currentValidFrom).toBe('2026-09-03');
    // Übersicht einer Norm, deren geltende Fassung die Baseline-Fassung ist: Beginn am Ausgangsrechtsstand.
    expect((await store.getNormSummary('vwv-abschlusspruefung-fischwirt-in'))).toMatchObject({ currentVersionId: '2023-11-01', currentValidFrom: SIMULATION_BASELINE_DATE, lastChangeDate: SIMULATION_BASELINE_DATE });
  });

  it('kennt eine Norm, deren einzige Fassung vor dem Ausgangsrechtsstand endete, nicht (Liste, Übersicht, Datensatz, Suche)', async () => {
    const { store } = await openOstRechtFixture();
    expect(await store.getNormSummary(EXCLUDED)).toBeNull();
    expect(await store.getNorm(EXCLUDED)).toBeNull();
    const page = await store.search(createSearchState({ q: 'Abiturprüfung', jurisdictions: ['ost'], versionScope: 'all' }));
    expect(page.hits.map((hit) => hit.slug)).not.toContain(EXCLUDED);
  });

  it('lässt eigene Sim-Normen unverändert (alle Fassungen nach dem Ausgangsrechtsstand)', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(OWN_NORM, 'none'))!;
    expect(isSimulationNorm(record)).toBe(true);
    expect(record.versions.map((version) => [version.versionId, version.simulationValidFrom, version.simulationValidTo])).toEqual([['2026-03-23', '2026-03-25', '2026-09-11'], ['2026-09-12', '2026-09-12', null]]);
    // Umbenennung durch die geltende Fassung: Übersicht trägt die aktuelle Bezeichnung, meta die ursprüngliche.
    expect((await store.getNormSummary(OWN_NORM))?.title).toMatch(/^Besonderes Gesetz/u);
    expect(record.versions[1]!.abbr).toBe('OLADG');
  });

  it('bildet ein Änderungsgesetz mit Relationen zu den geänderten Normen ab', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(OWN_AMENDMENT, 'none'))!;
    expect(record.meta.type).toBe('aenderungsvorschrift');
    expect(record.meta.relations).toContainEqual(expect.objectContaining({ type: 'amends', target: { slug: 'saechsische-gemeindeordnung' } }));
    expect((await store.getNormSummary(OWN_AMENDMENT))?.status).toBe('in-force');
  });

  it('bildet eine aufgehobene Norm ab: Status, Geltungsende, nur historisch suchbar', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(REPEALED, 'none'))!;
    expect(record.meta.status).toBe('repealed');
    expect(record.meta.expiryDate).toBe('2024-10-06');
    expect(classifyNormVersion(record, record.versions[0]!)).toBe('historical');
    const current = await store.search(createSearchState({ q: 'Terrorgefahr', jurisdictions: ['ost'] }));
    expect(current.hits.map((hit) => hit.slug)).not.toContain(REPEALED);
    const historical = await store.search(createSearchState({ q: 'Terrorgefahr', jurisdictions: ['ost'], versionScope: 'historical' }));
    expect(historical.hits.map((hit) => [hit.slug, hit.versionKind])).toContainEqual([REPEALED, 'historical']);
  });

  it('bildet eine erst künftig geltende Norm ab (future-effective): maßgebliche Fassung ist die künftige, keine Rechtsänderung bis zum Stichtag', async () => {
    const { store } = await openOstRechtFixture();
    expect(EDITORIAL_REFERENCE_DATE < '2026-10-01').toBe(true);
    expect(await store.getNormSummary(FUTURE)).toMatchObject({ currentVersionId: '2026-10-01', currentValidFrom: '2026-10-01', lastChangeDate: null, versionCount: 1 });
    const record = (await store.getNorm(FUTURE))!;
    expect(classifyNormVersion(record, record.versions[0]!)).toBe('future');
    expect(record.versions[0]!.body.length).toBeGreaterThan(0);
    const current = await store.search(createSearchState({ q: 'Hinweisgebermeldestellen', jurisdictions: ['ost'] }));
    expect(current.hits.map((hit) => hit.slug)).not.toContain(FUTURE);
    const future = await store.search(createSearchState({ q: 'Hinweisgebermeldestellen', jurisdictions: ['ost'], versionScope: 'future' }));
    expect(future.hits[0]).toMatchObject({ slug: FUTURE, versionKind: 'future' });
  });

  it('übernimmt die Historie (Erlass, Änderungen mit ändernder Norm)', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(FEIERTAG, 'none'))!;
    expect(record.history.initialVersionId).toBe('2023-11-01');
    expect(record.history.entries.map((entry) => [entry.type, entry.date, entry.relatedNorm?.slug ?? null])).toEqual([
      ['initial', '2023-11-01', null],
      ['amendment', '2024-03-08', 'gesetz-zur-anderung-des-gesetzes-uber-sonn-und-feiertage-im-freistaat-ostdeutschland'],
      ['amendment', '2026-03-24', 'gesetz-zur-reform-gesetzlicher-feiertage-im-freistaat-ostdeutschland'],
    ]);
  });

  it('ergänzt Relationen aus den abgeleiteten OstRecht-Daten (law_norm_derived), ohne Metadaten-Relationen zu doppeln', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(FEIERTAG, 'none'))!;
    const amendedBy = record.meta.relations.filter((relation) => relation.type === 'amended-by');
    expect(amendedBy.map((relation) => relation.target.slug)).toEqual([
      'gesetz-zur-anderung-des-gesetzes-uber-sonn-und-feiertage-im-freistaat-ostdeutschland',
      'gesetz-zur-reform-gesetzlicher-feiertage-im-freistaat-ostdeutschland',
    ]);
    expect(amendedBy[0]!.note).toContain('OGVBl.');
    // Doppelte Einträge aus meta.affectedNorms und derived werden nicht doppelt geführt.
    const amendment = (await store.getNorm(FUTURE, 'none'))!;
    expect(amendment.meta.relations.filter((relation) => relation.type === 'amends')).toHaveLength(3);
    const merged = mergeDerivedRelations(amendment, JSON.stringify([{ kind: 'amends', slug: 'saechsische-gemeindeordnung' }, { kind: 'unbekannt', slug: 'x' }]));
    expect(merged.meta.relations).toHaveLength(amendment.meta.relations.length);
  });

  it('übernimmt Quellen und Kennungen (REVOSax-Snapshot → official-portal-snapshot, externalIdentifiers ostrecht/revosax)', async () => {
    const { store } = await openOstRechtFixture();
    const record = (await store.getNorm(FEIERTAG, 'none'))!;
    expect(record.meta.externalIdentifiers).toContainEqual({ system: 'ostrecht', value: FEIERTAG });
    expect(record.meta.externalIdentifiers.some((identifier) => identifier.system === 'revosax')).toBe(true);
    expect(record.meta.sourceReferences.map((source) => source.kind)).toContain('official-portal-snapshot');
    expect(record.versions[0]!.sourceReferences?.[0]).toMatchObject({ kind: 'official-portal-snapshot', system: 'revosax' });
    expect(record.versions[2]!.sourceReferences?.some((source) => source.kind === 'amendment-source')).toBe(true);
  });

  it('listet Verkündungen aus publication_json (jüngste zuerst) und adaptiert Einträge, Quellen und PDF', async () => {
    const { store } = await openOstRechtFixture();
    const publications = await store.listPublications();
    expect(publications.map((publication) => publication.slug)).toEqual(['stanzo-2026-44', 'ogvbl-2026-72', 'ogvbl-2026-19', 'einzelverkuendung-2024-03-01']);
    expect(publications.every((publication) => publication.jurisdiction === 'ost')).toBe(true);
    const ogvbl = publications.find((publication) => publication.slug === 'ogvbl-2026-72')!;
    expect(ogvbl).toMatchObject({ gazette: 'OGVBl.', year: 2026, issue: '72', date: '2026-09-02' });
    expect(ogvbl.entries.some((entry) => entry.normSlug === FUTURE)).toBe(true);
    expect(ogvbl.sourceReferences.some((source) => source.kind === 'primary-pdf' && source.url?.startsWith('https://recht.freistaat-ostdeutschland.de/'))).toBe(true);
    // Einträge ohne Normbezug (Staatsanzeiger-Beschluss) sind keine Normeinträge.
    const stanzo = publications.find((publication) => publication.slug === 'stanzo-2026-44')!;
    expect(stanzo.entries.every((entry) => typeof entry.normSlug === 'string')).toBe(true);
    expect(await store.listPublications({ limit: 2 })).toHaveLength(2);
  });

  it('liefert eine einzelne Verkündung und null für unbekannte', async () => {
    const { store } = await openOstRechtFixture();
    const publication = await store.getPublication('einzelverkuendung-2024-03-01');
    expect(publication).toMatchObject({ slug: 'einzelverkuendung-2024-03-01', gazette: 'Amtliche Einzelverkündung', place: 'Dresden', publisher: expect.any(String) });
    expect(publication!.entries[0]).toMatchObject({ normSlug: 'abschiebe-aussetzungsverordnung', type: 'verordnung', versionId: '2024-03-01' });
    expect(await store.getPublication('gibt-es-nicht')).toBeNull();
  });

  it('sucht über den OstRecht-FTS-Index: Bezeichnung und Abkürzung vor Text, Änderungsgesetze hinter der Stammnorm, Strukturadressen', async () => {
    const { store } = await openOstRechtFixture();
    const byAbbr = await store.search(createSearchState({ q: 'OstFSG', jurisdictions: ['ost'] }));
    expect(byAbbr.hits[0]).toMatchObject({ slug: FEIERTAG, matchKind: 'identity', versionKind: 'current', jurisdiction: 'ost', url: `/ost/norm/${FEIERTAG}/` });
    // Alias („NDR-Staatsvertrag“) ist eine Bezeichnung der Norm.
    const byAlias = await store.search(createSearchState({ q: 'NDR-Staatsvertrag', jurisdictions: ['ost'] }));
    expect(byAlias.hits[0]).toMatchObject({ slug: NDR, matchKind: 'identity' });
    const byTitle = await store.search(createSearchState({ q: 'Gemeindeordnung', jurisdictions: ['ost'] }));
    expect(byTitle.hits.map((hit) => hit.slug)).toContain('aend-ostgemo-4399');
    const reference = await store.search(createSearchState({ q: '§ 1 OstFSG', jurisdictions: ['ost'] }));
    expect(reference.hits[0]).toMatchObject({ slug: FEIERTAG, matchKind: 'reference' });
    expect(reference.hits[0]!.unit?.anchor).toBe('paragraph-1');
    expect(reference.hits[0]!.unit?.url).toContain('#paragraph-1');
  });

  it('sucht nach dem Landesrecht-Stichtag über die von OstRecht indexierten Fassungen (nur die dort geltende Fassung trägt Sucheinheiten)', async () => {
    const { store, db } = await openOstRechtFixture();
    const current = await store.search(createSearchState({ q: 'Feiertage', jurisdictions: ['ost'] }));
    expect(current.hits.filter((hit) => hit.slug === FEIERTAG).map((hit) => [hit.versionId, hit.versionKind, hit.simulationValidFrom])).toEqual([['2026-03-23', 'current', '2026-03-24']]);
    // Dokumentierte Grenze von Variante A: frühere Fassungen haben in OstRecht keine Sucheinheiten und sind hier nicht
    // suchbar (Fassungsnavigation und Versionsseiten bleiben vollständig). Ein eigener Ost-Suchindex (Variante B) wäre
    // erst bei realem Bedarf vorgesehen.
    const all = await store.search(createSearchState({ q: 'Feiertage', jurisdictions: ['ost'], versionScope: 'all', limit: 20 }));
    expect(all.hits.filter((hit) => hit.slug === FEIERTAG).map((hit) => hit.versionId)).toEqual(['2026-03-23']);
    const validOn = await store.search(createSearchState({ q: 'Feiertage', jurisdictions: ['ost'], validOn: '2025-01-01' }));
    expect(validOn.hits.filter((hit) => hit.slug === FEIERTAG)).toEqual([]);
    const browse = await store.search(createSearchState({ q: '', jurisdictions: ['ost'], types: ['gesetz'] }));
    expect(browse.total).toBeGreaterThan(0);
    // Das Drift-Audit bewacht die Kehrseite: keine am Landesrecht-Stichtag geltende Fassung ohne Sucheinheiten.
    const report = await auditOstRechtDrift(db, { sample: 2, queries: ['Feiertag'] });
    expect(report.counts.currentVersionsWithoutUnits).toBe(0);
    // Weicht der Landesrecht-Stichtag so ab, dass eine nicht indexierte Fassung gilt (hier: 2024-03-07 am 2025-01-01), meldet es das.
    const shifted = await auditOstRechtDrift(db, { sample: 2, queries: ['Feiertag'], asOf: '2025-01-01' });
    expect(shifted.counts.currentVersionsWithoutUnits).toBeGreaterThan(0);
    expect(shifted.ok).toBe(false);
    expect(shifted.problems.join(' ')).toMatch(/ohne Sucheinheiten/u);
  });

  it('passt das OstRecht-Suchdokument an das Landesrecht-Suchdokument an (SearchDocument-Adapter)', () => {
    const base: OstRechtSearchIndexDocument = {
      id: 'x:2023-11-01', slug: 'x', versionId: '2023-11-01', title: 'Gesetz X', shortTitle: '', abbr: '', aliases: ['XG'], type: 'gesetz', subjects: ['A'], keywords: ['k'], status: 'in-force', summary: '', citation: 'Zit.', validFrom: '2023-11-01', validTo: null, lastChangeDate: '2023-11-01',
    };
    const document = adaptOstRechtSearchDocument(base, { asOf: '2026-09-28' });
    expect(document).toMatchObject({ id: 'ost:x:2023-11-01', jurisdiction: 'ost', url: '/ost/norm/x/', versionUrl: '/ost/norm/x/version/2023-11-01/', versionKind: 'current', shortTitle: 'Gesetz X', aliases: ['XG'], simulationValidFrom: SIMULATION_BASELINE_DATE, simulationValidTo: null, lastChangeDate: SIMULATION_BASELINE_DATE });
    expect(document.abbr).toBeUndefined();
    expect(document.summary).toBeUndefined();
    expect(adaptOstRechtSearchDocument({ ...base, validTo: '2024-01-01' }, { asOf: '2026-09-28' }).versionKind).toBe('historical');
    expect(adaptOstRechtSearchDocument({ ...base, validFrom: '2027-01-01' }, { asOf: '2026-09-28' }).versionKind).toBe('future');
    expect(adaptOstRechtSearchDocument({ ...base, status: 'aufgehoben' }, { asOf: '2026-09-28' })).toMatchObject({ status: 'repealed', versionKind: 'historical' });
    // OstRechts gespeicherte Art gilt nicht: entscheidend sind Intervall und Landesrecht-Stichtag.
    expect(adaptOstRechtSearchDocument({ ...base, validFrom: '2026-09-20', validTo: null }, { asOf: '2026-09-15' }).versionKind).toBe('future');
  });

  it('adaptiert eine OstRecht-Verkündungsdatei (Blatt, Ausgabebezeichnungen, Einträge ohne Normbezug)', () => {
    const publication = adaptOstRechtPublication({
      slug: 'ogvbl-2026-1', title: 'OGVBl. 2026 Nr. 1', year: 2026, issue: '1', date: '2026-01-05', publication: 'OGVBl.', pdf: '/assets/recht/ogvbl-2026-1.pdf', originalIssueDesignation: 'Nr. 1a',
      sourceReferences: [{ kind: 'primary-pdf', label: 'PDF', availability: 'versioned', localSource: 'Gesetze/x.pdf' }],
      entries: [{ title: 'Gesetz X', type: 'gesetz', citation: 'Zit.', normSlug: 'x', versionId: '2026-01-05', startPage: 2 }, { title: 'Beschluss', type: 'sonstiges', citation: 'Zit.' }],
    });
    expect(publication).toMatchObject({ jurisdiction: 'ost', gazette: 'OGVBl.', alternativeDesignations: ['Nr. 1a'] });
    expect(publication.entries).toEqual([{ title: 'Gesetz X', citation: 'Zit.', normSlug: 'x', type: 'gesetz', versionId: '2026-01-05', startPage: 2 }]);
    expect(publication.sourceReferences.map((source) => [source.kind, source.availability])).toEqual([['primary-pdf', 'external'], ['primary-pdf', 'external']]);
    expect(publication.sourceReferences[1]!.url).toBe('https://recht.freistaat-ostdeutschland.de/assets/recht/ogvbl-2026-1.pdf');
  });

  it('sucht jurisdiktionsübergreifend über die StoreRegistry: Ost-Treffer neben West/NSH, gleiche Begriffe in mehreren Ländern', async () => {
    const { store: ost } = await openOstRechtFixture();
    const corpus = buildFixtureNorms();
    const west = createFileNormStore('west', corpus.filter((record) => record.meta.jurisdiction === 'west'), { asOf: FIXTURE_REFERENCE_DATE });
    const nsh = createFileNormStore('nsh', corpus.filter((record) => record.meta.jurisdiction === 'nsh'), { asOf: FIXTURE_REFERENCE_DATE });
    const registry = createStoreRegistry({ west, nsh, ost });
    expect(registry.list().map((store) => store.jurisdiction)).toEqual(['west', 'nsh', 'ost']);
    const page = await registry.search(createSearchState({ q: 'Gesetz', jurisdictions: [], limit: 50 }));
    const jurisdictions = new Set(page.hits.map((hit) => hit.jurisdiction));
    expect(jurisdictions.has('ost')).toBe(true);
    expect(jurisdictions.has('west')).toBe(true);
    expect(page.total).toBe((await west.search(createSearchState({ q: 'Gesetz', jurisdictions: ['west'] }))).total + (await nsh.search(createSearchState({ q: 'Gesetz', jurisdictions: ['nsh'] }))).total + (await ost.search(createSearchState({ q: 'Gesetz', jurisdictions: ['ost'] }))).total);
    // Ost-Treffer tragen Ost-Adressen; eine Einschränkung auf Ost liefert nur Ost.
    expect(page.hits.filter((hit) => hit.jurisdiction === 'ost').every((hit) => hit.url.startsWith('/ost/norm/'))).toBe(true);
    const onlyOst = await registry.search(createSearchState({ q: 'Gesetz', jurisdictions: ['ost'] }));
    expect(onlyOst.hits.every((hit) => hit.jurisdiction === 'ost')).toBe(true);
    // Sortierung nach Titel führt Treffer beider Länder zusammen.
    const byTitle = await registry.search(createSearchState({ q: 'Gesetz', jurisdictions: [], sort: 'title', limit: 50 }));
    expect(byTitle.hits.map((hit) => hit.title)).toEqual([...byTitle.hits.map((hit) => hit.title)].sort((left, right) => left.localeCompare(right, 'de')));
  });

  it('liefert Statistik und Laufzeitmetadaten der vorgelagerten Projektion (Sync-Zeitpunkt, Fingerabdruck, corpus_hash, Zustand)', async () => {
    const { store } = await openOstRechtFixture();
    expect(await store.getStats()).toEqual({ normCount: 11, versionCount: 15, projectedAt: '2026-01-01T00:00:00.000Z', projectionFingerprint: 'b9c4eafd2d1d7da4f00c665785c227bd0f809499cede6fac02e5754df1c537d9' });
    expect(await store.getRuntimeMeta('projection_state')).toBe('complete');
    expect(await store.getRuntimeMeta('last_projected_at')).toBe('2026-01-01T00:00:00.000Z');
    expect(await store.getRuntimeMeta('corpus_hash')).toMatch(/^[a-f0-9]{64}$/u);
    expect(await store.getRuntimeMeta('sync_mode')).toBe('full');
    expect(store.kind).toBe('d1');
    expect(store.jurisdiction).toBe('ost');
  });

  it('besteht das Drift-Audit gegen die Fixture (Contract, Zähler, Stichprobe, Suchparität, Verkündungen)', async () => {
    const { db } = await openOstRechtFixture();
    const report = await auditOstRechtDrift(db, { sample: 6, slugs: [FEIERTAG, NDR, EXCLUDED], queries: ['Gesetz', 'Feiertag'] });
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.identity).toMatchObject({ syncState: 'complete', syncedAt: '2026-01-01T00:00:00.000Z', projectionScope: 'full' });
    expect(report.counts).toMatchObject({ norms: 12, normsInScope: 11, versions: 16, versionsInScope: 15, searchDocuments: 16, publications: 4 });
    expect(report.samples.find((sample) => sample.slug === NDR)).toMatchObject({ ok: true, baselineVersionId: '2021-09-01' });
    expect(report.samples.find((sample) => sample.slug === EXCLUDED)).toMatchObject({ ok: true, versionIds: [] });
    expect(report.searchParity.every((entry) => entry.ok)).toBe(true);
  });
});

describe('Ost: Freshness, Such-Readiness und Fallback', () => {
  it('meldet am Landesrecht-Stichtag volle Readiness, benennt aber den Volltextumfang (nur geltende Fassung)', async () => {
    const { db, store } = await openOstRechtFixture();
    const report = await checkOstRechtFreshness(db);
    expect(report.referenceDate).toBe(EDITORIAL_REFERENCE_DATE);
    expect(report.staleNorms).toEqual([]);
    expect(report.coverage).toEqual({ readiness: 'ready', fullText: 'current-version-only', historicalVersions: 'navigable', staleNormCount: 0 });
    expect(report.upstream).toMatchObject({ syncState: 'complete', syncedAt: '2026-01-01T00:00:00.000Z' });
    expect(report.upstream.indexedAsOf.before).toBe('2026-10-01');
    expect(await store.getSearchCoverage!()).toEqual(report.coverage);
  });

  it('nennt exakt die Normen, deren geltende Fassung OstRecht noch nicht indexiert hat', async () => {
    const { db } = await openOstRechtFixture();
    const report = await checkOstRechtFreshness(db, { asOf: '2025-01-01' });
    expect(report.coverage.readiness).toBe('partial');
    expect(report.staleNorms).toContainEqual({ slug: FEIERTAG, currentVersionId: '2024-03-07', currentValidFrom: '2024-03-08', indexedVersionId: '2026-03-23' });
    expect(report.coverage.staleNormCount).toBe(report.staleNorms.length);
    const drift = await auditOstRechtDrift(db, { sample: 1, queries: ['Feiertag'], asOf: '2025-01-01' });
    expect(drift.freshness?.staleNorms.map((norm) => norm.slug)).toContain(FEIERTAG);
    expect(drift.problems.join(' ')).toContain(`${FEIERTAG} (geltend 2024-03-07 ab 2024-03-08, indexiert 2026-03-23)`);
  });

  it('ergänzt für veraltete Normen Titel-, Abkürzungs- und Schlagworttreffer der geltenden Fassung, ohne Volltext zu behaupten', async () => {
    const { db } = await openOstRechtFixture();
    const store = createOstRechtD1Store(db, { asOf: '2025-01-01', contract: false, freshnessRecheckAfterMs: 0 });
    const byAbbr = await store.search(createSearchState({ q: 'OstFSG', jurisdictions: ['ost'] }));
    expect(byAbbr.hits[0]).toMatchObject({ slug: FEIERTAG, versionId: '2024-03-07', versionKind: 'current', matchKind: 'identity' });
    expect(byAbbr.total).toBeGreaterThanOrEqual(1);
    // Volltext der nicht indexierten Fassung bleibt ohne Treffer: kein zweiter Index.
    const fullText = await store.search(createSearchState({ q: 'Tanzveranstaltungen', jurisdictions: ['ost'] }));
    expect(fullText.hits.filter((hit) => hit.slug === FEIERTAG && hit.versionId === '2024-03-07')).toEqual([]);
    expect(await store.getSearchCoverage!()).toMatchObject({ readiness: 'partial', fullText: 'current-version-only' });
    resetOstRechtFreshnessCache(db);
  });

  it('führt Fallback-Treffer nur auf der ersten Seite und ohne Dubletten ein', () => {
    const hit = (slug: string, rank: number[]) => ({ slug, versionId: 'v', title: slug, jurisdiction: 'ost', rank, simulationValidFrom: '2024-01-01', lastChangeDate: null }) as never;
    const page = { total: 1, offset: 0, limit: 10, hits: [hit('a', [4, 0])] };
    const state = createSearchState({ q: 'x', jurisdictions: ['ost'] });
    expect(mergeStaleHits(page, [hit('b', [0, 0, 0]), hit('a', [4, 0])], state)).toMatchObject({ total: 2, hits: [{ slug: 'b' }, { slug: 'a' }] });
    expect(mergeStaleHits(page, [hit('b', [0])], { ...state, offset: 10 })).toBe(page);
  });

  it('weist über die Registry je Jurisdiktion die Suchabdeckung aus (Ost: nur geltende Fassung, übrige: alle Fassungen)', async () => {
    const { store: ost } = await openOstRechtFixture();
    const west = createFileNormStore('west', buildFixtureNorms().filter((record) => record.meta.jurisdiction === 'west'), { asOf: FIXTURE_REFERENCE_DATE });
    const registry = createStoreRegistry({ west, ost });
    expect(await registry.searchCoverage()).toEqual([
      { jurisdiction: 'west', readiness: 'ready', fullText: 'all-versions', historicalVersions: 'navigable', staleNormCount: 0 },
      { jurisdiction: 'ost', readiness: 'ready', fullText: 'current-version-only', historicalVersions: 'navigable', staleNormCount: 0 },
    ]);
    expect((await registry.searchCoverage(['ost'])).map((entry) => entry.jurisdiction)).toEqual(['ost']);
  });
});

describe('Gebündelte Normübersichten (Verkündungsseiten)', () => {
  it('liefert viele Übersichten in wenigen Abfragen und lässt unbekannte oder ausgeschlossene Normen aus', async () => {
    const { native } = await openOstRechtFixture();
    const queries: string[] = [];
    const counting = { prepare: (sql: string) => { queries.push(sql); return native.prepare(sql); }, batch: native.batch.bind(native) };
    const store = createOstRechtD1Store(createReadOnlyD1(counting as never), { contract: false });
    const slugs = [FEIERTAG, NDR, EXCLUDED, FUTURE, 'gibt-es-nicht', FEIERTAG];
    const summaries = await getNormSummaries(store, slugs);
    expect([...summaries.keys()].sort()).toEqual([FUTURE, NDR, FEIERTAG].sort());
    expect(queries).toHaveLength(1);
    expect(summaries.get(FEIERTAG)).toEqual(await store.getNormSummary(FEIERTAG));
    // Stores ohne gebündelte Abfrage werden einzeln, aber mit begrenzter Parallelität gefragt.
    let active = 0; let peak = 0;
    const plain = { getNormSummary: async (slug: string) => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 1)); active -= 1; return slug.startsWith('x') ? null : ({ slug } as never); } } as never;
    const result = await getNormSummaries(plain, Array.from({ length: 30 }, (_, index) => (index % 3 === 0 ? `x${index}` : `n${index}`)));
    expect(result.size).toBe(20);
    expect(peak).toBeLessThanOrEqual(8);
  });
});
