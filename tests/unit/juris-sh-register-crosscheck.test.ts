/**
 * Registerabgleich juris SH („zweite Quelle“): Stufen der unabhängigen Nachrechnung und Regressionsfälle der
 * Handprüfung (`data/audits/juris-sh/register-crosscheck/manual-review.json`). Synthetische Daten nach realen
 * Fällen, kein Netz, kein Cache.
 */
import { describe, expect, it } from 'vitest';

import {
  buildDocumentIndex,
  coverage,
  exclusionCategory,
  exclusionFigures,
  glVariantKey,
  isAmendingInstrument,
  legacyTitleMatch,
  matchRegisterEntry,
  parseJurisFundstelle,
  parseRegisterCitation,
  sameCitation,
  splitGliederungsnummern,
  titleSimilarity,
  type JurisDocument,
  type RegisterRecord,
} from '@landesrecht/importer-juris-sh/audit/register-crosscheck.ts';
import { ledgerRecords } from '@landesrecht/importer-juris-sh/audit/register-crosscheck-run.ts';
import { REGISTER_NON_CONSOLIDATED } from '@landesrecht/importer-juris-sh/pipeline/bulk.ts';

const record = (overrides: Partial<RegisterRecord>): RegisterRecord => ({
  source: 'gvobl-systematische-uebersicht',
  gliederungsnummer: '1-1',
  title: 'Landesverordnung über einen Testgegenstand mit hinreichend langem Titel',
  inLedger: true,
  ...overrides,
});

const doc = (overrides: Partial<JurisDocument>): JurisDocument => ({
  id: 'jlr-TEST',
  area: 'landesrecht',
  dates: [],
  ...overrides,
});

const match = (entry: RegisterRecord, documents: JurisDocument[]) => matchRegisterEntry(entry, buildDocumentIndex(documents, entry.source === 'ab-erlassverzeichnis' ? 'vwv' : 'landesrecht'));

describe('Kennungen', () => {
  it('teilt VwV-Köpfe mit mehreren Gliederungsnummern und trifft jede', () => {
    expect(splitGliederungsnummern('5602-1, 341.2')).toEqual(['5602-1', '341.2']);
    expect(splitGliederungsnummern('0')).toEqual([]);
    expect(splitGliederungsnummern('0, 1200-1')).toEqual(['1200-1']);
    const result = match(record({ source: 'ab-erlassverzeichnis', gliederungsnummer: '341.2', title: 'Stundung und Erlass von Gerichtskosten', issuedDate: '2017-04-20' }), [
      doc({ id: 'VVSH-VVSH000006413', area: 'vwv', gliederungsnummer: '5602-1, 341.2', title: 'Stundung und Erlass von Gerichtskosten AV d. MJKE vom 20. April 2017', dates: ['2017-04-20'] }),
    ]);
    expect(result.tier).toBe('gl');
    // Die Altregel der Inventur vergleicht den ganzen Kopf-String und findet die Nummer nicht.
    expect(result.legacyByNumber).toBe(false);
  });

  it('gleicht führende Nullen je Segment aus, lässt echte Nullsegmente stehen', () => {
    expect(glVariantKey('2122-10-02')).toBe(glVariantKey('2122-10-2'));
    expect(glVariantKey('100-0-1')).toBe('100-0-1');
    expect(glVariantKey('B 2032-20-10')).toBe('B2032-20-10');
    const result = match(record({ gliederungsnummer: '2122-10-2' }), [doc({ gliederungsnummer: '2122-10-02', title: 'Landesverordnung über die Berufe in der Pflegehilfe' })]);
    expect(result.tier).toBe('gl-variant');
  });

  it('wertet eine Nummer, die juris nur einem Änderungsakt gibt, nicht als Treffer der Stamm-VwV', () => {
    const stamm = record({ source: 'ab-erlassverzeichnis', gliederungsnummer: '2010.23', title: 'Hausordnung des Schleswig-Holsteinischen Landtages', issuedDate: '2017-05-02' });
    const amendment = doc({ id: 'VVSH-VVSH000009492', area: 'vwv', gliederungsnummer: '2010.23', title: 'Änderung der Hausordnung des Schleswig-Holsteinischen Landtages', dates: ['2024-02-16'] });
    const result = match(stamm, [amendment]);
    expect(result.tier).toBe('gl-amendment-only');
    expect(result.legacyFound).toBe(true);
    // Ist der Registereintrag selbst ein Änderungsakt, ist die Nummer ein gewöhnlicher Treffer.
    expect(match({ ...stamm, title: 'Änderung der Hausordnung des Schleswig-Holsteinischen Landtages' }, [amendment]).tier).toBe('gl');
    expect(isAmendingInstrument('1. Änderung der Richtlinie zur Umsetzung des Schulbauprogramms')).toBe(true);
    expect(isAmendingInstrument('Richtlinie über die Förderung von Sportstätten')).toBe(false);
  });
});

describe('Fundstellen', () => {
  it('liest Register- und juris-Schreibweise auf denselben Schlüssel', () => {
    expect(sameCitation(parseRegisterCitation('GVOBl. S. 558', '2017-12-05'), parseJurisFundstelle('GVOBl. 2017, 558'))).toBe(true);
    // Abweichender Jahrgang steht im Register ausdrücklich.
    expect(sameCitation(parseRegisterCitation('GVOBl. 2019 S. 8', '2018-12-04'), parseJurisFundstelle('GVOBl. 2019, 8'))).toBe(true);
    expect(sameCitation(parseRegisterCitation('Amtsbl. Schl.-H. 2023 S. 189', '2022-12-19'), parseJurisFundstelle('Amtsbl SH 2023, 189, SchlHA 2023, 25'))).toBe(true);
    // Seite und Nummer der elektronischen Ausgabe sind verschiedene Dinge.
    expect(sameCitation(parseRegisterCitation('GVOBl. S. 21', '2025-01-21'), parseJurisFundstelle('GVOBl. 2025, Nr. 21'))).toBe(false);
    expect(parseJurisFundstelle('SchlHA 2017, 210')).toBeUndefined();
  });

  it('trifft eine umnummerierte Verordnung über Fundstelle und Datum (EigVO: Register 2020-3-38, juris 2020-3-37)', () => {
    const result = match(record({ gliederungsnummer: '2020-3-38', title: 'Landesverordnung über die Eigenbetriebe der Gemeinden (Eigenbetriebsverordnung – EigVO)', issuedDate: '2017-12-05', citation: 'GVOBl. S. 558' }), [
      doc({ id: 'jlr-NNLSH00002F48', gliederungsnummer: '2020-3-37', title: 'Landesverordnung über die Eigenbetriebe der Gemeinden (Eigenbetriebsverordnung - EigVO)', dates: ['2017-12-05'], fundstelle: 'GVOBl. 2017, 558' }),
    ]);
    expect(result.tier).toBe('fundstelle');
  });

  it('Regression: gleiche Seite, gleicher Tag, anderes Gesetz ist kein Fundstellentreffer (Register 2020-33 ↔ juris 610-5)', () => {
    const result = match(record({ gliederungsnummer: '2020-33', title: 'Gesetz zur Aufhebung der Erhebungspflicht für Straßenausbaubeiträge', issuedDate: '2018-01-04', citation: 'GVOBl. S. 6' }), [
      doc({ id: 'jlr-NNLSH00002C96', gliederungsnummer: '610-5', title: 'Gesetz zu dem Staatsvertrag zwischen der Freien Hansestadt Bremen, dem Land Mecklenburg-Vorpommern', dates: ['2018-01-04'], fundstelle: 'GVOBl. 2018, 6' }),
    ]);
    expect(result.tier).toBe('none');
    expect(titleSimilarity('Gesetz zur Aufhebung der Erhebungspflicht für Straßenausbaubeiträge', 'Gesetz zu dem Staatsvertrag zwischen der Freien Hansestadt Bremen')).toBeLessThan(0.5);
  });
});

describe('Titel: Altregel und Falsch-positiv-Regressionen', () => {
  it('verlangt mindestens 25 Zeichen Titelschlüssel', () => {
    expect(legacyTitleMatch('Ausübung des Begnadigungsrechts', 'Ausübung des Begnadigungsrechts')).toBe(true);
    expect(legacyTitleMatch('Kurzer Titel', 'Kurzer Titel')).toBe(false);
  });

  it('Regression: jährliche Sachbezugsverordnungen gleichen Titels sind verschiedene Normen (B 820-1-4 ↔ B 820-1-11)', () => {
    const result = match(record({ gliederungsnummer: 'B 820-1-4', title: 'Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein', issuedDate: '1958-12-22', citation: 'GVOBl. S. 308' }), [
      doc({ id: 'jlr-NNLSH000033E1', gliederungsnummer: 'B 820-1-11', title: 'Verordnung über die Bewertung der Sachbezüge für die Sozialversicherung im Lande Schleswig-Holstein', dates: ['1966-02-09'], fundstelle: 'GVOBl. 1966, 19' }),
    ]);
    expect(result.legacyFound).toBe(true); // die Altregel zählt das als gefunden
    expect(result.tier).toBe('title-only'); // streng nicht
  });

  it('Regression: gekürzter Registertitel trifft beliebige Inkrafttretensbekanntmachungen (188-2-1)', () => {
    const result = match(record({ gliederungsnummer: '188-2-1', title: 'Bekanntmachung über das Inkrafttreten des Staatsvertrages', issuedDate: '2009-06-25', citation: 'GVOBl. S. 121' }), [
      doc({ id: 'a', gliederungsnummer: '2129-6-1', title: 'Bekanntmachung über das Inkrafttreten des Staatsvertrages über die Bildung einer gemeinsamen Einrichtung', dates: ['2002-11-09'], fundstelle: 'GVOBl. 2002, 227' }),
      doc({ id: 'b', gliederungsnummer: '866-1-1', title: 'Bekanntmachung über das Inkrafttreten des Staatsvertrages zwischen der Freien und Hansestadt Hamburg', dates: ['2017-11-23'], fundstelle: 'GVOBl. 2017, 550' }),
    ]);
    expect(result.legacyFound).toBe(true);
    expect(result.tier).toBe('title-only');
    expect(result.titleCandidates).toEqual(['a', 'b']);
  });

  it('Regression: VwV-Nachfolgeerlass gleichen Titels belegt die registrierte Fassung nicht (1103.24)', () => {
    const result = match(record({ source: 'ab-erlassverzeichnis', gliederungsnummer: '1103.24', title: 'Ausübung des Begnadigungsrechts', issuedDate: '2020-08-05', citation: 'Amtsbl. Schl.-H. S. 1232' }), [
      doc({ id: 'VVSH-VVSH000010088', area: 'vwv', gliederungsnummer: '0', title: 'Ausübung des Begnadigungsrechts', dates: ['2025-07-01'], fundstelle: 'Amtsbl SH 2025, Nr. 264' }),
    ]);
    expect(result.legacyFound).toBe(true);
    expect(result.tier).toBe('title-only');
  });

  it('nimmt Titel mit gleichem Datum als zweites Merkmal (221-28-8, juris ohne Gliederungsnummer)', () => {
    const title = 'Landesverordnung über die Festsetzung von Zulassungszahlen für Studiengänge an den staatlichen Hochschulen';
    const result = match(record({ gliederungsnummer: '221-28-8', title, issuedDate: '2023-11-30' }), [
      doc({ id: 'older', title, dates: ['2024-12-11'] }),
      doc({ id: 'same', title, dates: ['2023-11-30'] }),
    ]);
    expect(result.tier).toBe('title-date');
    expect(result.documentIds).toEqual(['same']);
  });
});

describe('Ausschlüsse und Kennzahlen', () => {
  it('benennt den Zweig der Ausschlussregel der Inventur, ohne sie zu ändern', () => {
    const titles = [
      'Gesetz zur Änderung des Landesverfassungsgerichtsgesetzes',
      'Landesverordnung zur Aufhebung der Mietpreisverordnung Schleswig- Holstein',
      'Gesetz zur Neuordnung des Glücksspiels (Glücksspielgesetz)',
      'Tarifvertrag über Zulagen an Angestellte vom 17. Mai 1982',
      'Landesverordnung über die Eigenbetriebe der Gemeinden',
      'Aufhebung der Landesverordnung zur Durchführung des Düngegesetzes',
    ];
    expect(titles.map(exclusionCategory)).toEqual(['aenderung', 'aufhebung', 'neuregelung-neuordnung', 'tarifvertrag', undefined, undefined]);
    for (const title of titles) expect(exclusionCategory(title) !== undefined).toBe(REGISTER_NON_CONSOLIDATED.test(title));
  });

  it('zählt Gegenbeispiele: ausgeschlossen, obwohl juris ein eigenes Dokument führt (Glücksspielgesetz 2186-15)', () => {
    const matches = [
      match(record({ gliederungsnummer: '2186-15', title: 'Gesetz zur Neuordnung des Glücksspiels (Glücksspielgesetz)' }), [doc({ gliederungsnummer: '2186-15', title: 'Gesetz zur Neuordnung des Glücksspiels (Glücksspielgesetz)' })]),
      match(record({ gliederungsnummer: '2030-13', title: 'Gesetz zur Änderung des Landesbeamtengesetzes und des Landesrichtergesetzes' }), []),
    ];
    const figures = exclusionFigures(matches);
    expect(figures.find((entry) => entry.category === 'neuregelung-neuordnung')).toMatchObject({ entries: 1, withOwnJurisDocument: 1 });
    expect(figures.find((entry) => entry.category === 'aenderung')).toMatchObject({ entries: 1, withOwnJurisDocument: 0, withoutAnyMatch: 1 });
  });

  it('weist Nummern-, strenge und Altregel-Abdeckung getrennt aus', () => {
    const documents = [
      doc({ id: 'n', gliederungsnummer: '1-1', title: 'Landesverordnung über einen Testgegenstand mit hinreichend langem Titel' }),
      doc({ id: 't', gliederungsnummer: '9-9', title: 'Verordnung über die Bewertung der Sachbezüge im Lande', dates: ['1966-02-09'] }),
    ];
    const index = buildDocumentIndex(documents, 'landesrecht');
    const figures = coverage([
      matchRegisterEntry(record({ gliederungsnummer: '1-1' }), index),
      matchRegisterEntry(record({ gliederungsnummer: '2-2', title: 'Verordnung über die Bewertung der Sachbezüge im Lande', issuedDate: '1958-12-22' }), index),
      matchRegisterEntry(record({ gliederungsnummer: '3-3', title: 'Gesetz zur Änderung des Testgesetzes' }), index),
      matchRegisterEntry(record({ gliederungsnummer: '4-4', title: 'Gesetz ohne jede Entsprechung im juris-Bestand' }), index),
    ]);
    expect(figures.considered).toBe(3);
    expect(figures.idOnly).toEqual({ found: 1, rate: 0.3333 });
    expect(figures.strict.found).toBe(1);
    expect(figures.legacy.found).toBe(2);
    expect(figures.legacyTitleOnly).toBe(1);
  });
});

describe('Nenner der Inventur (ledger.json)', () => {
  it('Regression: ein Änderungsbefehl gibt der Stammnorm den Titel des ändernden Gesetzes (111-1 Landeswahlgesetz)', () => {
    const source = 'gvobl-systematische-uebersicht';
    const records = ledgerRecords({
      sources: [],
      events: [
        { sourceId: source, targetGliederungsnummer: '111-1', targetTitle: 'Wahlgesetz für den Landtag von Schleswig-Holstein (Landeswahlgesetz – LWahlG)', targetIdentityHints: ['gl-nr:111-1', 'ausfertigung:1959-07-17'] },
        { sourceId: source, targetGliederungsnummer: '111-1', targetTitle: 'Gesetz zur Änderung Wahlrechtlicher Vorschriften', targetIdentityHints: ['gl-nr:111-4', 'ausfertigung:2016-06-14', 'verweis-gl-nr:111-1'] },
      ],
    }, source);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ gliederungsnummer: '111-1', title: 'Gesetz zur Änderung Wahlrechtlicher Vorschriften', foreignTitle: true });
    // Folge in der Inventur: Die Stammnorm fällt unter die Ausschlussregel für Änderungsgesetze.
    expect(exclusionCategory(records[0]!.title)).toBe('aenderung');
  });
});
