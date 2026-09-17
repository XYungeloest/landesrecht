/**
 * Enumeration des BAYERN.RECHT-Adapters: Fortführungsnachweis und Facetten-Trefferliste parsen,
 * Enumeration bis zum Fixpunkt bauen, Abdeckungslücke einordnen.
 *
 * Geprüft wird gegen **echte, gekürzte Ausschnitte** der Quellseiten unter
 * `tests/fixtures/bayernrecht/` – nicht gegen nachgebautes HTML. Die Ausschnitte sind zusammenhängend
 * aus den abgerufenen Seiten geschnitten und ansonsten unverändert; was der Parser hier falsch macht,
 * macht er auch an der ganzen Seite falsch.
 *
 * Kein Test geht ins Netz: Der Ablauf `runEnumerate` läuft gegen ein temporäres Repository-Root mit
 * vorbereitetem Abrufcache und liest ausschließlich von dort.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import {
  buildEnumeration,
  checkEnumerationFixpoint,
  checkEnumerationInvariants,
  enumerationFingerprint,
  enumerationJsonText,
  enumerationStatusCounts,
  ENUMERATION_MAX_PASSES,
  statusForImportStatus,
  type EnumerationFile,
} from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';
import { changeNoteDate, duplicateFfnIds, latestChangeDate, parseFortfuehrungsnachweis, updateSectionPath } from '@landesrecht/importer-bayernrecht/enumerate/fortfuehrungsnachweis.ts';
import { buildGapReport, classifyGapDocument, gliederungsstelleOf, gliederungsstellenOf, renderGapReport } from '@landesrecht/importer-bayernrecht/enumerate/gap.ts';
import { hitlistPageCount, isEmptySearchState, parseGermanDate, parseHitlistPage } from '@landesrecht/importer-bayernrecht/enumerate/hitlist.ts';
import { createCookieJar, FACET_INVENTORY_PATH, facetInventoryJsonText, type FacetDocument, type FacetInventory } from '@landesrecht/importer-bayernrecht/enumerate/inventory.ts';
import { AREA_NORM_TYPES, decodeEntities, documentUrl, fortfuehrungsnachweisUrl, hitlistPageUrl, isDocumentId, sessionWarmupUrl, textOf, zipUrl } from '@landesrecht/importer-bayernrecht/enumerate/portal.ts';
import { runEnumerate } from '@landesrecht/importer-bayernrecht/enumerate/run.ts';
import { enumerationPath } from '@landesrecht/importer-bayernrecht/common/paths.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const FIXTURES = new URL('../fixtures/bayernrecht/', import.meta.url);
const fixture = async (name: string): Promise<string> => readFile(new URL(name, FIXTURES), 'utf8');

describe('Fortführungsnachweis der Rechtsvorschriften (/Content/Document/ffn)', () => {
  it('liest Gliederungsnummer, Titel, Sachgebietspfad und Änderungsnotizen aus dem echten Ausschnitt', async () => {
    const document = parseFortfuehrungsnachweis(await fixture('ffn-excerpt.html'));
    expect(document.heading).toBe('Fortführungsnachweis Vorschriften');
    expect(document.entries.length).toBeGreaterThanOrEqual(10);
    expect(document.unlinkedRows).toEqual([]);
    expect(duplicateFfnIds(document)).toEqual([]);

    const first = document.entries[0]!;
    expect(first.documentId).toBe('StVIllerWasKNutzStVBayWuertt');
    expect(first.bayRsNumber).toBe('01-1-1-U');
    // Der Titel beginnt in der Quelle mit „*“; die Marke wird festgehalten, nicht in den Titel übernommen.
    expect(first.titleMarker).toBe('*');
    expect(first.title.startsWith('Staatsvertrag zwischen den Königreichen Bayern und Württemberg')).toBe(true);
    expect(first.sectionPath.map((section) => section.number)).toEqual(['0', '01', '01-1']);
    expect(first.sectionPath[2]!.title).toBe('Baden-Württemberg');

    const withNote = document.entries.find((entry) => entry.documentId === 'BayBwWwirtVertr')!;
    expect(withNote.notes).toEqual(['1) mehrfach geänd. (Abk. v. 22.01.1992, 314)']);
    expect(latestChangeDate(withNote)).toBe('1992-01-22');
  });

  it('ordnet jede Notizzeile dem vorangehenden Eintrag zu, nicht dem folgenden', async () => {
    const document = parseFortfuehrungsnachweis(await fixture('ffn-excerpt.html'));
    const drPlStV = document.entries.find((entry) => entry.documentId === 'DRPlStV')!;
    expect(drPlStV.notes).toHaveLength(2);
    expect(drPlStV.notes[1]).toContain('17.01.2011');
    const next = document.entries[document.entries.indexOf(drPlStV) + 1]!;
    expect(next.notes).toEqual([]);
  });
});

describe('Fortführungsnachweis der Verwaltungsvorschriften (/Content/Document/ffn-mbl)', () => {
  it('kommt ohne Gliederungsnummernspalte aus und führt die Änderungshistorie mit', async () => {
    const document = parseFortfuehrungsnachweis(await fixture('ffn-mbl-excerpt.html'));
    expect(document.heading).toBe('FFN zum BayMBl.');
    // Die Spalte ist im ffn-mbl durchgehend leer – das Feld fehlt dann, statt leer gesetzt zu werden.
    expect(document.entries.every((entry) => entry.bayRsNumber === undefined)).toBe(true);
    const redR = document.entries.find((entry) => entry.documentId === 'BayVwV312180')!;
    expect(redR.sectionPath.map((section) => section.number)).toEqual(['1', '10', '103']);
    expect(redR.notes.length).toBeGreaterThanOrEqual(6);
    expect(redR.notes[0]).toBe('Änderung vom 17.04.2018, AllMBl. 2018 S. 341');
    expect(latestChangeDate(redR)).toBe('2025-12-16');
  });

  it('meldet eine Zeile ohne Verweis als Befund, statt sie stillschweigend zu übergehen', async () => {
    const document = parseFortfuehrungsnachweis(await fixture('ffn-mbl-unlinked-row.html'));
    expect(document.unlinkedRows).toHaveLength(1);
    expect(document.unlinkedRows[0]!.text).toContain('Bek StMD: Satzung der BayKommun AöR');
    expect(document.entries.some((entry) => entry.title.includes('BayKommun'))).toBe(false);
  });

  it('weist eine Seite zurück, die kein Fortführungsnachweis ist', () => {
    expect(() => parseFortfuehrungsnachweis('<html><body><p>Seite nicht gefunden</p></body></html>')).toThrow(/kein Fortführungsnachweis/u);
  });
});

describe('Sachgebietspfad und Änderungsnotizen', () => {
  it('schachtelt nach Nummernpräfix und ersetzt Geschwister', () => {
    const path = ['0', '01', '01-1'].reduce<ReturnType<typeof updateSectionPath>>((current, number) => updateSectionPath(current, { number, title: number }), []);
    expect(path.map((section) => section.number)).toEqual(['0', '01', '01-1']);
    expect(updateSectionPath(path, { number: '01-2', title: 'Berlin' }).map((section) => section.number)).toEqual(['0', '01', '01-2']);
    expect(updateSectionPath(path, { number: '02', title: 'Mehrseitige Verträge' }).map((section) => section.number)).toEqual(['0', '02']);
    expect(updateSectionPath(path, { number: '01-1', title: 'gleiche Ebene' })).toHaveLength(3);
  });

  it('liest nur vollständige Tagesdaten und rät nichts aus Jahreszahlen', () => {
    expect(changeNoteDate('Änderung vom 21.11.2023, BayMBl. 2023 Nr. 584')).toBe('2023-11-21');
    expect(changeNoteDate('1) mehrfach geänd. (Abk. v. 22.01.1992, 314)')).toBe('1992-01-22');
    expect(changeNoteDate('§ 1 geänd. (Art. 1 G v. 3.5.2013, S. 324)')).toBe('2013-05-03');
    expect(changeNoteDate('mehrfach geändert 2019')).toBeUndefined();
    expect(latestChangeDate({ notes: ['Änderung vom 01.02.2020, X', 'Änderung vom 03.04.2019, Y'] })).toBe('2020-02-01');
    expect(latestChangeDate({ notes: ['ohne Datum'] })).toBeUndefined();
  });
});

describe('Facetten-Trefferliste (/Search/Filter/NORMTYP/<typ>)', () => {
  it('liest Trefferzähler, Dokument-IDs, Rechtsstand und Seitenwähler aus dem echten Ausschnitt', async () => {
    const page = parseHitlistPage(await fixture('hitlist-ges-page1.html'));
    expect(page.totalLabel).toBe('241 Treffer in 241 Gesetze');
    expect(page.total).toBe(241);
    expect(page.entries).toHaveLength(10);
    expect(page.currentPage).toBe(1);
    expect(page.maxPagerPage).toBe(10);
    const abmarkung = page.entries.find((entry) => entry.documentId === 'BayAbmG')!;
    expect(abmarkung.title).toContain('Abmarkungsgesetz');
    expect(abmarkung.legalStatusDate).toBe('2015-08-01');
  });

  it('erkennt die Antwort ohne Sitzungszustand und meldet sie als Fehler', () => {
    // Wortlaut des Portals, wenn eine Facette ohne Suchzustand aufgerufen wird.
    const html = '<div id="hinweis"><div class="panel-body">Bitte f&#xFC;hren Sie eine Suche aus.</div></div>';
    expect(isEmptySearchState(html)).toBe(true);
    expect(() => parseHitlistPage(html)).toThrow(/ohne Sitzungszustand/u);
    expect(() => parseHitlistPage('<html><body>irgendetwas</body></html>')).toThrow(/ohne Trefferzähler/u);
  });

  it('rechnet die Seitenzahl aus der Sollmenge (zehn Treffer je Seite)', () => {
    expect(hitlistPageCount(241)).toBe(25);
    expect(hitlistPageCount(1478)).toBe(148);
    expect(hitlistPageCount(10)).toBe(1);
    expect(hitlistPageCount(0)).toBe(1);
    expect(parseGermanDate('Rechtsstand: 04.08.1997')).toBe('1997-08-04');
    expect(parseGermanDate('ohne Datum')).toBeUndefined();
  });
});

describe('Adressen und Textwerkzeuge des Portals', () => {
  it('bildet jede Adresse an genau einer Stelle und unterscheidet die Trefferseiten je Normtyp', () => {
    expect(documentUrl('BayVerf')).toBe('https://www.gesetze-bayern.de/Content/Document/BayVerf');
    expect(zipUrl('BayVerf')).toBe('https://www.gesetze-bayern.de/Content/Zip/BayVerf');
    expect(fortfuehrungsnachweisUrl('vwv')).toBe('https://www.gesetze-bayern.de/Content/Document/ffn-mbl');
    expect(() => fortfuehrungsnachweisUrl('events')).toThrow(/keine Quelle erfunden/u);
    // Die Trefferliste lebt im Sitzungszustand; der Parameter unterscheidet nur den Cacheschlüssel.
    expect(hitlistPageUrl('ges', 2)).toBe('https://www.gesetze-bayern.de/Search/Page/2?normtyp=ges');
    expect(hitlistPageUrl('vv', 2)).not.toBe(hitlistPageUrl('ges', 2));
    expect(sessionWarmupUrl('rv')).toBe('https://www.gesetze-bayern.de/?session=rv');
    expect(() => hitlistPageUrl('ges', 0)).toThrow();
    expect(AREA_NORM_TYPES.events).toEqual([]);
  });

  it('löst nur bekannte Entities auf und lässt Unbekanntes wörtlich stehen', () => {
    expect(decodeEntities('Fortf&#xFC;hrungsnachweis')).toBe('Fortführungsnachweis');
    expect(decodeEntities('A &amp; B &#64; C')).toBe('A & B @ C');
    expect(decodeEntities('&unbekannt;')).toBe('&unbekannt;');
    expect(textOf('<a href="x"><b>Titel</b><br />Zeile</a>')).toBe('Titel Zeile');
    expect(isDocumentId('BayVV_2230_7_1_K_10450')).toBe(true);
    expect(isDocumentId('')).toBe(false);
    expect(isDocumentId('../etc/passwd')).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Aufbau der Enumeration.                                                                      */

const facetDocument = (documentId: string, normType: FacetDocument['normType'], title: string, page = 1): FacetDocument => ({
  documentId,
  normType,
  title,
  page,
  sourceUrl: hitlistPageUrl(normType, page),
  sourceSha256: 'f'.repeat(64),
  retrievedAt: '2026-09-17T09:00:00.000Z',
});

async function ffnDocument(name: string): Promise<ReturnType<typeof parseFortfuehrungsnachweis>> {
  return parseFortfuehrungsnachweis(await fixture(name));
}

async function buildFromFixture(overrides: Partial<Parameters<typeof buildEnumeration>[0]> = {}): Promise<EnumerationFile> {
  const document = await ffnDocument('ffn-excerpt.html');
  const documents = document.entries.map((entry) => facetDocument(entry.documentId, 'vertr', entry.title));
  return buildEnumeration({
    area: 'landesrecht',
    fortfuehrungsnachweis: { document, url: fortfuehrungsnachweisUrl('landesrecht'), sha256: 'a'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 1090163 },
    facets: { documents, total: documents.length, pages: 2, complete: true, inventoryPath: FACET_INVENTORY_PATH, inventoryFingerprint: 'b'.repeat(64) },
    now: '2026-09-17T10:00:00.000Z',
    ...overrides,
  });
}

describe('Aufbau der Enumeration', () => {
  it('führt beide Quellen zusammen und übernimmt BayRS-Nummer, Normtyp und Belegseiten', async () => {
    const file = await buildFromFixture();
    expect(checkEnumerationInvariants(file)).toEqual([]);
    expect(file.crosscheck.ok).toBe(true);
    const item = file.items.find((candidate) => candidate.documentId === 'BayBwEgauquVertr')!;
    expect(item.key).toBe(item.documentId);
    expect(item.sourceIdentity).toBe(item.documentId);
    expect(item.bayRsNumber).toBe('01-1-2-U');
    expect(item.normType).toBe('vertr');
    expect(item.normTypeSource).toBe('facet-hitlist');
    expect(item.sourceUrl).toBe(documentUrl('BayBwEgauquVertr'));
    expect(item.zipUrl).toBe(zipUrl('BayBwEgauquVertr'));
    // Quellseite, SHA-256 und Abrufzeit stehen am Eintrag selbst und zusätzlich als Belegliste.
    expect(item.listingUrl).toBe(fortfuehrungsnachweisUrl('landesrecht'));
    expect(item.sourceSha256).toBe('a'.repeat(64));
    expect(item.retrievedAt).toBe('2026-09-17T07:48:50.997Z');
    expect(item.listings.map((listing) => listing.kind)).toEqual(['fortfuehrungsnachweis', 'facet-hitlist']);
    expect(item.signals).toEqual({ fortfuehrungsnachweis: true, facet: true, manifest: false });
    expect(item.status).toBe('pending');
  });

  it('kommt mit fehlenden Feldern aus: ohne Facette kein Normtyp, ohne Nachweis keine BayRS-Nummer', async () => {
    const document = await ffnDocument('ffn-excerpt.html');
    const file = buildEnumeration({
      area: 'landesrecht',
      fortfuehrungsnachweis: { document, url: fortfuehrungsnachweisUrl('landesrecht'), sha256: 'a'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 10 },
      // Nur ein einziges Dokument der Facette – und eines, das der Nachweis nicht kennt.
      facets: { documents: [facetDocument('TV_L', 'vertr', 'Tarifvertrag für den öffentlichen Dienst der Länder')], total: 1, pages: 1, complete: true, inventoryPath: FACET_INVENTORY_PATH, inventoryFingerprint: 'b'.repeat(64) },
      now: '2026-09-17T10:00:00.000Z',
    });
    const ohneFacette = file.items.find((item) => item.documentId === 'BayBwEgauquVertr')!;
    expect(ohneFacette.normType).toBe('unbekannt');
    expect(ohneFacette.normTypeSource).toBe('unbekannt');
    expect(ohneFacette.listings.map((listing) => listing.kind)).toEqual(['fortfuehrungsnachweis']);
    const nurFacette = file.items.find((item) => item.documentId === 'TV_L')!;
    expect(nurFacette.bayRsNumber).toBeUndefined();
    expect(nurFacette.sectionPath).toBeUndefined();
    expect(nurFacette.changeNotes).toBeUndefined();
    expect(nurFacette.changedAfterBaseline).toBeUndefined();
    expect(nurFacette.titleSource).toBe('facet-hitlist');
    expect(file.crosscheck.onlyFacetIds).toEqual(['TV_L']);
    expect(file.crosscheck.onlyFortfuehrungsnachweis).toBe(document.entries.length);
    expect(checkEnumerationInvariants(file)).toEqual([]);
  });

  it('entscheidet den Stichtagsfall aus den datierten Änderungsnotizen', async () => {
    const file = await buildFromFixture({ baselineDate: '1990-01-01' });
    const geaendert = file.items.find((item) => item.documentId === 'BayBwWwirtVertr')!;
    expect(geaendert.latestChange).toBe('1992-01-22');
    expect(geaendert.changedAfterBaseline).toBe(true);
    const spaeterStichtag = await buildFromFixture({ baselineDate: '2023-12-01' });
    expect(spaeterStichtag.items.find((item) => item.documentId === 'BayBwWwirtVertr')!.changedAfterBaseline).toBe(false);
    // Ohne datierte Notiz bleibt das Feld weg – „unbekannt“ wird nicht zu „unverändert“ gemacht.
    expect(file.items.find((item) => item.documentId === 'BayBwEgauquVertr')!.changedAfterBaseline).toBeUndefined();
  });

  it('erreicht einen Fixpunkt: ein zweiter Rebuild ändert nichts', async () => {
    const first = await buildFromFixture();
    const second = await buildFromFixture({ previous: first, now: '2026-09-18T11:00:00.000Z' });
    expect(second.contentFingerprint).toBe(first.contentFingerprint);
    // Laufmetadatum bleibt stehen, solange sich fachlich nichts ändert.
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(enumerationJsonText(second)).toBe(enumerationJsonText(first));
    const check = checkEnumerationFixpoint(first, {
      area: 'landesrecht',
      fortfuehrungsnachweis: { document: await ffnDocument('ffn-excerpt.html'), url: fortfuehrungsnachweisUrl('landesrecht'), sha256: 'a'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 1090163 },
      facets: { documents: (await ffnDocument('ffn-excerpt.html')).entries.map((entry) => facetDocument(entry.documentId, 'vertr', entry.title)), total: first.crosscheck.facetDocuments, pages: 2, complete: true, inventoryPath: FACET_INVENTORY_PATH, inventoryFingerprint: 'b'.repeat(64) },
    });
    expect(check.fixpoint).toBe(true);
    expect(check.differences).toEqual([]);
    expect(ENUMERATION_MAX_PASSES).toBeGreaterThan(1);
  });

  it('nimmt einen abgebrochenen Lauf (processing) als offen und meldet den Übergang genau einmal', async () => {
    const first = await buildFromFixture();
    const interrupted: EnumerationFile = { ...first, items: first.items.map((item, index) => (index === 0 ? { ...item, status: 'processing' as const, attempts: 2 } : item)) };
    const lines: string[] = [];
    const rebuilt = await buildFromFixture({ previous: interrupted, log: (line) => lines.push(line) });
    expect(rebuilt.items[0]!.status).toBe('pending');
    expect(rebuilt.items[0]!.attempts).toBe(2);
    expect(lines.filter((line) => line.includes('abgebrochenen Lauf'))).toHaveLength(1);
    // Und der nächste Rebuild ist wieder ein Fixpunkt.
    const again = await buildFromFixture({ previous: rebuilt });
    expect(again.contentFingerprint).toBe(rebuilt.contentFingerprint);
  });

  it('behält den Bearbeitungsstand und zählt die Status vollständig', async () => {
    const first = await buildFromFixture();
    const worked: EnumerationFile = {
      ...first,
      items: first.items.map((item, index) => (index < 3 ? { ...item, status: (['done', 'review', 'failed'] as const)[index]!, attempts: 1, outcome: { importStatus: 'imported' } } : item)),
    };
    const rebuilt = await buildFromFixture({ previous: worked });
    const counts = enumerationStatusCounts(rebuilt);
    expect(counts.done).toBe(1);
    expect(counts.review).toBe(1);
    expect(counts.failed).toBe(1);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(rebuilt.items.length);
    expect(rebuilt.items[0]!.outcome).toEqual({ importStatus: 'imported' });
    expect(statusForImportStatus('needs-review')).toBe('review');
    expect(statusForImportStatus('imported-with-warnings')).toBe('done');
    expect(statusForImportStatus('was-auch-immer')).toBe('failed');
  });

  it('meldet fehlende Quellen als Abgleichsproblem statt als leere Enumeration', () => {
    const file = buildEnumeration({ area: 'landesrecht', now: '2026-09-17T10:00:00.000Z' });
    expect(file.crosscheck.ok).toBe(false);
    expect(file.crosscheck.problems.join(' ')).toContain('Fortführungsnachweis fehlt');
    expect(file.crosscheck.problems.join(' ')).toContain('Facettenbestand fehlt');
    expect(file.items).toEqual([]);
  });

  it('bemerkt eine verletzte Invariante (doppelter Eintrag, falsche Sortierung)', async () => {
    const file = await buildFromFixture();
    const broken = { items: [...file.items, file.items[0]!] };
    expect(checkEnumerationInvariants(broken).join(' ')).toContain('mehrfacher Eintrag');
    const fingerprint = enumerationFingerprint(file);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    // Laufmetadaten gehören nicht zum Fingerabdruck.
    expect(enumerationFingerprint({ ...file, items: file.items.map((item) => ({ ...item, updatedAt: '2026-01-01', lastRunId: 'x' })) })).toBe(fingerprint);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Abdeckungslücke.                                                                             */

describe('Abdeckungslücke zwischen Nachweis und Facette', () => {
  it('ordnet die Dokumente nach nachprüfbaren Merkmalen ein und lässt Unerklärtes stehen', () => {
    const stellen = gliederungsstellenOf(['BayVV_2023_I_2215', 'BayVwV312180']);
    expect(gliederungsstelleOf('BayVV_2230_7_1_K_10450')).toBe('BayVV_2230_7_1_K_');
    expect(gliederungsstelleOf('BayVwV312180')).toBeUndefined();
    expect(classifyGapDocument({ documentId: 'TV_L', title: 'Tarifvertrag für den öffentlichen Dienst der Länder (TV-L) Vom 12. Oktober 2006' }).group).toBe('tarifvertrag');
    expect(classifyGapDocument({ documentId: 'KostVfG', title: 'Kostenverfügung (KostVfg) Neufassung vom 5. September 2023 (BAnz AT 29.09.2023 B2)' }).group).toBe('bundeseinheitliche-anordnung');
    expect(classifyGapDocument({ documentId: 'ZRHO', title: 'Rechtshilfeordnung für Zivilsachen (ZRHO)' }).group).toBe('bundeseinheitliche-anordnung');
    const stelle = classifyGapDocument({ documentId: 'BayVV_2023_I_2045', title: 'Aufstellung und Vollzug der Haushaltspläne der Kommunen' }, stellen);
    expect(stelle.group).toBe('gliederungsstelle-anderweitig-belegt');
    expect(stelle.siblings).toEqual(['BayVV_2023_I_2215']);
    expect(classifyGapDocument({ documentId: 'BayStMIv06022008', title: 'Finanzplanung 2007 bis 2011 der kommunalen Körperschaften und Hinweise …' }).group).toBe('haushaltsrundschreiben-jahresfassung');
    expect(classifyGapDocument({ documentId: 'BayBodSchO', title: 'Bodensee-Schifffahrts-Ordnung – Verordnung über die Schifffahrt auf dem Bodensee (BSO)' }).group).toBe('ungeklaert');
  });

  it('bilanziert beide Richtungen und schreibt den ungeklärten Rest in den Bericht', () => {
    const inventory: FacetInventory = {
      schemaVersion: 'bayernrecht-facet-inventory/1',
      generatedAt: '2026-09-17T09:00:00.000Z',
      contentFingerprint: 'c'.repeat(64),
      types: [{ normType: 'vertr', total: 3, pages: 1, collected: 3, distinct: 3, complete: true }],
      pages: [{ normType: 'vertr', page: 1, url: hitlistPageUrl('vertr', 1), sha256: 'f'.repeat(64), retrievedAt: '2026-09-17T09:00:00.000Z', byteLength: 100, entries: 3 }],
      documents: [facetDocument('BayBwEgauquVertr', 'vertr', 'Staatsvertrag …'), facetDocument('TV_L', 'vertr', 'Tarifvertrag für den öffentlichen Dienst der Länder (TV-L)'), facetDocument('BayBodSchO', 'vertr', 'Bodensee-Schifffahrts-Ordnung – Verordnung über die Schifffahrt auf dem Bodensee (BSO)')],
      problems: [],
      complete: true,
    };
    const report = buildGapReport({ inventory, fortfuehrungsnachweisIds: new Set(['BayBwEgauquVertr']), fortfuehrungsnachweisEntries: 1, now: '2026-09-17T10:00:00.000Z' });
    expect(report.totals.onlyFacet).toBe(2);
    expect(report.totals.onlyFortfuehrungsnachweis).toBe(0);
    expect(report.groups.find((group) => group.group === 'tarifvertrag')!.documentIds).toEqual(['TV_L']);
    expect(report.groups.find((group) => group.group === 'ungeklaert')!.documentIds).toEqual(['BayBodSchO']);
    // Jeder Eintrag trägt seine Belegseite mit SHA-256 und Abrufzeit.
    expect(report.documents[0]!.listingSha256).toBe('f'.repeat(64));
    const markdown = renderGapReport(report, inventory);
    expect(markdown).toContain('BayBodSchO');
    expect(markdown).toContain('Ungeklärt');
    expect(report.open.join(' ')).toContain('einzeln zu prüfen');
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Ablauf ohne Netz.                                                                            */

/** Legt einen Cacheeintrag an, wie ihn der Fetcher schreibt (Bytes plus Metadaten mit SHA-256). */
async function seedCache(cacheDir: string, url: string, body: string, retrievedAt: string): Promise<void> {
  const bytes = new TextEncoder().encode(body);
  const key = cacheKey(url);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, `${key}.bin`), bytes);
  await writeFile(
    join(cacheDir, `${key}.json`),
    JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'text/html; charset=utf-8', retrievedAt, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }),
  );
}

describe('enumerate ohne Netz (Cache und vorhandene Bestandsaufnahme)', () => {
  it('baut, schreibt und wiederholt sich ohne Diff', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-enumerate-');
    const cacheDir = join(root, '.cache', 'bayernrecht');
    await seedCache(cacheDir, fortfuehrungsnachweisUrl('landesrecht'), await fixture('ffn-excerpt.html'), '2026-09-17T07:48:50.997Z');
    await seedCache(cacheDir, fortfuehrungsnachweisUrl('vwv'), await fixture('ffn-mbl-excerpt.html'), '2026-09-17T07:48:52.776Z');
    const ffn = await ffnDocument('ffn-excerpt.html');
    const inventory: FacetInventory = {
      schemaVersion: 'bayernrecht-facet-inventory/1',
      generatedAt: '2026-09-17T09:00:00.000Z',
      contentFingerprint: 'c'.repeat(64),
      types: [{ normType: 'vertr', total: ffn.entries.length + 1, pages: 2, collected: ffn.entries.length + 1, distinct: ffn.entries.length + 1, complete: true }],
      pages: [],
      documents: [...ffn.entries.map((entry) => facetDocument(entry.documentId, 'vertr', entry.title)), facetDocument('TV_L', 'vertr', 'Tarifvertrag für den öffentlichen Dienst der Länder (TV-L)')],
      problems: [],
      complete: true,
    };
    await mkdir(join(root, 'data', 'audits', 'bayernrecht'), { recursive: true });
    await writeFile(join(root, FACET_INVENTORY_PATH), facetInventoryJsonText(inventory));

    const options = { root, area: 'landesrecht' as const, write: true, offline: true, refresh: false, cacheDir };
    const first = await runEnumerate(options);
    expect(first.networkRequests).toBe(0);
    expect(first.written).toBe(true);
    expect(first.invariantProblems).toEqual([]);
    expect(first.file.crosscheck.ok).toBe(true);
    expect(first.file.crosscheck.items).toBe(ffn.entries.length + 1);
    expect(first.gap.totals.onlyFacet).toBe(1);
    expect(first.gapWritten.markdown).toBe(true);

    const before = await readFile(join(root, enumerationPath('landesrecht')), 'utf8');
    const second = await runEnumerate(options);
    // Zweiter Lauf mit unveränderten Quellen: nichts geschrieben, Datei byteidentisch.
    expect(second.written).toBe(false);
    expect(second.gapWritten).toEqual({ markdown: false, json: false });
    expect(await readFile(join(root, enumerationPath('landesrecht')), 'utf8')).toBe(before);
    expect(second.file.contentFingerprint).toBe(first.file.contentFingerprint);
  });

  it('verweigert den Bereich events und die Sammlung ohne Netz', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-enumerate-leer-');
    await expect(runEnumerate({ root, area: 'events', write: false, offline: true, refresh: false })).rejects.toThrow(/nicht enumeriert/u);
    const cacheDir = join(root, '.cache', 'bayernrecht');
    await seedCache(cacheDir, fortfuehrungsnachweisUrl('landesrecht'), await fixture('ffn-excerpt.html'), '2026-09-17T07:48:50.997Z');
    await expect(runEnumerate({ root, area: 'landesrecht', write: false, offline: true, refresh: false, cacheDir })).rejects.toThrow(/facet-inventory\.json fehlt/u);
  });

  it('hält Sitzungskekse getrennt, statt sie über Normtypen hinweg zu vermischen', () => {
    const jar = createCookieJar();
    expect(jar.header()).toBeUndefined();
    jar.accept({ headers: { getSetCookie: () => ['bayern-sessionid=abc; path=/; HttpOnly', 'x=1'] } } as unknown as Response);
    expect(jar.header()).toBe('bayern-sessionid=abc; x=1');
    jar.clear();
    expect(jar.header()).toBeUndefined();
  });
});
