/**
 * Aufhebungs-, Außerkrafttretens- und Ablösungsformeln des LRMB-Bestands (`lrmb/repeal-patterns.ts`):
 * echte Textausschnitte aus Verwaltungsvorschriften und Ministerialblatt-Einträgen (Cache-Scan
 * September 2026), Abgrenzung von Teilaufhebungen in Änderungsbefehlen, Zuordnung zu Zielvorschriften.
 */
import { describe, expect, it } from 'vitest';

import { detectRepealStatements, matchRepealStatements, otherStatements, selfStatements, titleKeywords, type RepealStatement } from '@landesrecht/importer-recht-nrw/lrmb/repeal-patterns.ts';

const only = (statements: RepealStatement[]): RepealStatement => {
  expect(statements).toHaveLength(1);
  return statements[0]!;
};

describe('Aufhebung anderer Vorschriften (wird aufgehoben, hebe ich auf)', () => {
  it('liest Erlasskopf, Datum, SMBl-Nummer und Aktenzeichen einer aufgehobenen Vorschrift', () => {
    const statement = only(detectRepealStatements('Die Auskunfts- und Geheimhaltungspflichten der Beschäftigten der Arbeitsschutzverwaltung richten sich nach den folgenden Grundsätzen. Der RdErl. d. Ministers für Arbeit, Gesundheit und Soziales – III R – 8000.2.4 – v. 17.9.1980 (SMBl. NRW. 280) wird aufgehoben. Grundsätze über die Auskunftspflicht gelten.'));
    expect(statement).toMatchObject({ kind: 'repealed', subject: 'other', head: 'Der RdErl.', phrase: 'wird aufgehoben', strength: 'strong' });
    expect(statement.text).toBe('Der RdErl. d. Ministers für Arbeit, Gesundheit und Soziales – III R – 8000.2.4 – v. 17.9.1980 (SMBl. NRW. 280) wird aufgehoben.');
    expect(statement.references).toEqual([{ dateText: '17.9.1980', date: '1980-09-17', citations: [{ text: 'SMBl. NRW. 280', gazette: 'SMBl', smblNumber: '280' }], fileReference: 'III R – 8000.2.4' }]);
  });

  it('erkennt die Ich-Form mit Objekt vor dem Verb und mehreren Daten', () => {
    const single = only(detectRepealStatements('Hiermit erlasse ich den Organisationsplan des Landeskriminalamtes Nordrhein-Westfalen. Den RdErl. v. 10. 8. 1998 (SMBl. NRW. 20501) hebe ich auf.'));
    expect(single).toMatchObject({ kind: 'repealed', subject: 'other', head: 'Den RdErl.', strength: 'strong' });
    expect(single.references).toEqual([{ dateText: '10. 8. 1998', date: '1998-08-10', citations: [{ text: 'SMBl. NRW. 20501', gazette: 'SMBl', smblNumber: '20501' }] }]);
    const multiple = only(detectRepealStatements('5 Die RdErl. v. 2. 11. 1964, 21. 10. 1980 und 23. 3. 1983 (SMB1. NRW. 20500) hebe ich mit der Maßgabe auf, dass der RdErl. vom 23.3.1983 für laufende Verfahren weiter gilt.'));
    expect(multiple.references.map((reference) => reference.date)).toEqual(['1964-11-02', '1980-10-21', '1983-03-23']);
    expect(multiple.references[2]!.citations).toEqual([{ text: 'SMB1. NRW. 20500', gazette: 'SMBl', smblNumber: '20500' }]);
    expect(multiple.references[0]!.citations).toEqual([]);
    const inline = only(detectRepealStatements('Gleichzeitig hebe ich meine Erlasse v. 22.4.1976 (SMBl. NW. 7133) und v. 13.3.1979 (SMBl. NW. 7133) auf.'));
    expect(inline).toMatchObject({ kind: 'repealed', subject: 'other', head: 'meine Erlasse' });
    expect(inline.references.map((reference) => [reference.date, reference.citations[0]?.smblNumber])).toEqual([['1976-04-22', '7133'], ['1979-03-13', '7133']]);
  });

  it('trennt aufgehobene Vorschrift und eigene Geltungsklausel im selben Absatz', () => {
    const statements = detectRepealStatements('2. Dieser RdErl. tritt am Tag nach der Veröffentlichung in Kraft. Er tritt mit Ablauf des 31. Dezember 2027 außer Kraft. Der RdErl. d. Ministeriums für Gesundheit, Soziales, Frauen und Familie v. 25. November 2003 ( MBl. NRW. S. 1592 ) wird aufgehoben.');
    expect(statements.map((statement) => [statement.kind, statement.subject])).toEqual([['expired', 'self'], ['repealed', 'other']]);
    expect(statements[0]!.effective).toEqual({ kind: 'date', date: '2027-12-31', text: 'mit Ablauf des 31. Dezember 2027' });
    expect(statements[1]!.references).toEqual([{ dateText: '25. November 2003', date: '2003-11-25', citations: [{ text: 'MBl. NRW. S. 1592', gazette: 'MBl', page: '1592' }] }]);
  });

  it('lässt Nummern und Überschriften vor dem Subjekt zu und ignoriert Änderungsnebensätze', () => {
    const numbered = only(detectRepealStatements('… empfohlen wird, weise ich besonders hin. 10 Aufhebungsvorschrift Der RdErl. des Innenministeriums vom 10.4.2003 (SMBl. NRW. 6300) wird aufgehoben. 11 In-Kraft-Treten Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft.'));
    expect(numbered).toMatchObject({ subject: 'other', head: 'Der RdErl.' });
    expect(numbered.references[0]).toMatchObject({ date: '2003-04-10', citations: [{ smblNumber: '6300' }] });
    const amended = only(detectRepealStatements('Der Runderlass tritt am Tag nach der Veröffentlichung in Kraft. Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ), der durch Runderlass vom 2. Januar 1997 (MBl. NRW. S. 121) geändert worden ist, wird aufgehoben.'));
    expect(amended.references).toEqual([{ dateText: '3. Januar 1994', date: '1994-01-03', citations: [{ text: 'MBl. NRW. S. 1098', gazette: 'MBl', page: '1098' }] }]);
    const unpublished = only(detectRepealStatements('Der RdErl. v. 10.7.1990 (n.v.) – IV C 3 – 4729 –, zuletzt geändert durch RdErl. v. 11.12.1996 (n.v.), wird hiermit aufgehoben.'));
    expect(unpublished.references).toEqual([{ dateText: '10.7.1990', date: '1990-07-10', citations: [], fileReference: 'IV C 3 – 4729' }]);
    const plural = only(detectRepealStatements('Die RdErl. des Ministeriums für Frauen, Jugend, Familie und Gesundheit v. 7.12.2000 (SMBl. NRW. 21260) und des Ministeriums für Arbeit, Gesundheit und Soziales vom 13.10.2005 (SMBl. NRW. 21260) werden aufgehoben.'));
    expect(plural.references.map((reference) => [reference.date, reference.citations[0]?.smblNumber])).toEqual([['2000-12-07', '21260'], ['2005-10-13', '21260']]);
  });

  it('liest Bekanntmachungen, Satzungen und Geschäftsordnungen mit Doppelfundstelle', () => {
    const obsolete = only(detectRepealStatements('Die Bek. d. Landesregierung v. 21.3.1989 (MBl. NRW. S. 296/SMBl. NRW. 1110) ist gegenstandslos.'));
    expect(obsolete).toMatchObject({ kind: 'obsolete', subject: 'other', head: 'Die Bek.' });
    expect(obsolete.references[0]!.citations).toEqual([{ text: 'MBl. NRW. S. 296', gazette: 'MBl', page: '296' }, { text: 'SMBl. NRW. 1110', gazette: 'SMBl', smblNumber: '1110' }]);
    const order = only(detectRepealStatements('II. Die Geschäftsordnung des Landespersonalausschusses vom 5. Dezember 2001 (MBl. NRW 2002 S. 536/SMBl. NRW. 20304) wird aufgehoben.'));
    expect(order.references[0]!.citations).toEqual([{ text: 'MBl. NRW 2002 S. 536', gazette: 'MBl', page: '536', year: 2002 }, { text: 'SMBl. NRW. 20304', gazette: 'SMBl', smblNumber: '20304' }]);
  });
});

describe('Außerkrafttreten, Ablösung, Neufassung', () => {
  it('erkennt gleichzeitiges Außerkrafttreten einer bezeichneten Vorschrift', () => {
    const statement = only(detectRepealStatements('11.1 Dieser Runderlass tritt am Tag nach der Veröffentlichung im Ministerialblatt für das Land Nordrhein-Westfalen in Kraft. Der gemeinsame Runderlass des Ministeriums für Bauen, Wohnen, Stadtentwicklung und Verkehr und des Finanzministeriums vom 27. Juni 2016 ( MBl. NRW. 2016 S. 644 ) tritt gleichzeitig außer Kraft.').filter((entry) => entry.subject === 'other'));
    expect(statement).toMatchObject({ kind: 'expired', head: 'Der gemeinsame Runderlass', strength: 'strong', effective: { kind: 'simultaneous', text: 'gleichzeitig' } });
    expect(statement.references[0]).toMatchObject({ date: '2016-06-27', citations: [{ gazette: 'MBl', page: '644', year: 2016 }] });
  });

  it('liest Selbstaussagen mit Ablauf des Haushaltsjahres, Tagesdatum und Ereignis', () => {
    expect(only(detectRepealStatements('Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.'))).toMatchObject({ kind: 'expired', subject: 'self', effective: { kind: 'end-of-year', date: '2016-12-31' } });
    expect(only(detectRepealStatements('Der RdErl. tritt mit Wirkung vom 1.2.2004 in Kraft und mit Ablauf des 31.12.2008 außer Kraft.'))).toMatchObject({ kind: 'expired', subject: 'self', effective: { kind: 'date', date: '2008-12-31' } });
    expect(only(detectRepealStatements('Sie tritt außer Kraft am 31. Dezember 2012.'))).toMatchObject({ subject: 'self', effective: { kind: 'date', date: '2012-12-31' } });
    expect(only(detectRepealStatements('Ohne eine Befristung treten sie nach Ablauf von vier Jahren außer Kraft.'))).toMatchObject({ kind: 'expired', effective: { kind: 'event', text: 'nach Ablauf von vier Jahren' } });
    expect(only(detectRepealStatements('6 Geltungsdauer Die Allgemeinverfügung tritt mit dem auf die Bekanntmachung folgenden Tag in Kraft und verliert ihre Gültigkeit mit Ablauf des 31. März 2021.'))).toMatchObject({ kind: 'expired', effective: { kind: 'date', date: '2021-03-31' } });
    expect(only(detectRepealStatements('Dieser Runderlass tritt am 1. August 2022 in Kraft und am 31. Juli 2026 außer Kraft.'))).toMatchObject({ subject: 'self', effective: { kind: 'date', date: '2026-07-31' } });
    expect(only(detectRepealStatements('Diese Richtlinien treten zum 1.1.2008 in Kraft und mit Wirkung zum 31.12.2012 außer Kraft.'))).toMatchObject({ subject: 'self', effective: { kind: 'date', date: '2012-12-31' } });
    const limited = detectRepealStatements('Die Richtlinien treten mit Wirkung vom 1.1.2008 in Kraft und gelten bis zum 30.9.2012. Gleichzeitig treten die Richtlinien vom 21.8.2006 (MBl. NRW. S. 443) außer Kraft.');
    expect(limited.map((statement) => [statement.kind, statement.subject, statement.effective?.date ?? statement.effective?.kind])).toEqual([['expired', 'self', '2012-09-30'], ['expired', 'other', 'simultaneous']]);
    expect(limited[1]!.references[0]).toMatchObject({ date: '2006-08-21', citations: [{ gazette: 'MBl', page: '443' }] });
    expect(only(detectRepealStatements('Dieser RdErl. tritt am Tag nach der Veröffentlichung in Kraft und ist befristet bis zum 31.7.2010.'))).toMatchObject({ kind: 'expired', subject: 'self', effective: { kind: 'date', date: '2010-07-31' } });
  });

  it('erkennt Ablösung und Nichtanwendung nur mit Vorschriftenkopf als bezeichnete Vorschrift', () => {
    expect(only(detectRepealStatements('Mit den folgenden Empfehlungen werden die bisherigen Rahmenkriterien abgelöst.'))).toMatchObject({ kind: 'replaced', subject: 'other', head: 'Die bisherigen Rahmenkriterien', references: [], strength: 'supporting' });
    expect(only(detectRepealStatements('Die Richtlinien vom 12.3.1990 (SMBl. NRW. 6300) werden durch die nachstehenden Richtlinien ersetzt.'))).toMatchObject({ kind: 'replaced', subject: 'other', strength: 'strong', references: [{ date: '1990-03-12' }] });
    expect(only(detectRepealStatements('Vom gleichen Zeitpunkt an sind die Grundsätze und Richtlinien für Wettbewerbe auf den Gebieten der Raumplanung (GRW 1977) nicht mehr anzuwenden.'))).toMatchObject({ kind: 'not-applicable', subject: 'other', head: 'Die Grundsätze', references: [], strength: 'supporting', effective: { kind: 'simultaneous' } });
    const stelle = only(detectRepealStatements('An die Stelle der Richtlinien vom 1.2.1990 (SMBl. NRW. 2030) treten die nachstehenden Richtlinien.'));
    expect(stelle).toMatchObject({ kind: 'replaced', subject: 'other', references: [{ date: '1990-02-01', citations: [{ smblNumber: '2030' }] }] });
    expect(only(detectRepealStatements('Der Runderlass vom 12. April 2018 (MBl. NRW. S. 242) wird wie folgt neu gefasst:'))).toMatchObject({ kind: 'new-version', subject: 'other', references: [{ date: '2018-04-12' }] });
  });

  it('erkennt passive Rückverweise mit dem Nachfolger hinter dem Verb', () => {
    const statement = only(detectRepealStatements('Der Runderlass ist aufgehoben durch RdErl. vom 6. Dezember 2023 (MBl. NRW. S. 1420).'));
    expect(statement).toMatchObject({ kind: 'repealed', subject: 'other', references: [{ date: '2023-12-06', citations: [{ gazette: 'MBl', page: '1420' }] }] });
  });
});

describe('Abgrenzung: Teilaufhebungen, Änderungsbefehle, unbestimmte Subjekte', () => {
  it('zählt Änderungsbefehle des Ministerialblatts nicht als Aufhebung der Vorschrift', () => {
    const text = 'Die Beurteilungsrichtlinie MAGS vom 28. November 2019 ( MBl. NRW. S. 770 ), wird wie folgt geändert: 1. Nummer 2 Satz 1 wird wie folgt geändert: a) Buchstabe a wird aufgehoben. b) Der bisherige Satz 8 wird aufgehoben. 2. In Satz 1 wird die Angabe „bis c)“ durch die Angabe „und b)“ ersetzt. 3. Nummer 5 wird aufgehoben. 4. Die Anlage 1 wird aufgehoben. 5. Nummer 3.2 wird wie folgt gefasst: „Es gilt.“ 6. Das Wort „und“ wird durch das Wort „oder“ ersetzt.';
    const statements = detectRepealStatements(text);
    expect(statements.length).toBeGreaterThanOrEqual(5);
    expect(statements.every((statement) => statement.subject === 'partial')).toBe(true);
    expect(otherStatements(statements)).toEqual([]);
    expect(selfStatements(statements)).toEqual([]);
  });

  it('meldet bloße Nummern und Regelungsinhalte ohne Vorschriftenkopf nicht als Aufhebung einer Vorschrift', () => {
    expect(only(detectRepealStatements('5 wird aufgehoben.')).subject).toBe('partial');
    const content = only(detectRepealStatements('II. Anordnung zur Erteilung von Aufenthaltserlaubnissen 1. Die im Erlass vom 26. September 2013 vorgesehene Begrenzung der Aufnahme auf bis zu 1.000 syrische Staatsangehörige wird aufgehoben. 2. Der begünstigte Personenkreis wird erweitert.'));
    expect(content.subject).toBe('unspecified');
    expect(content.references).toEqual([]);
    expect(matchRepealStatements([content], { issuedOn: '2013-09-26' })).toEqual([]);
    expect(only(detectRepealStatements('Diesem Erlass entgegenstehende Verfügungen werden aufgehoben.')).subject).toBe('unspecified');
    expect(detectRepealStatements('Der Nachweis der Anspruchsberechtigung wird durch die der Krankenversichertenkarte ersetzt, wenn der Kostenträger diese ausgegeben hat.')[0]?.subject).toBe('unspecified');
  });

  it('lässt Abkürzungspunkte, Datumsangaben und Fundstellen im Satz unzerschnitten', () => {
    const statement = only(detectRepealStatements('Die Gebühren sind zu erheben. Der Gem. RdErl. d. Ministers für Stadtentwicklung, Wohnen und Verkehr u. d. Ministeriums für Umwelt, Raumordnung und Landwirtschaft v. 25.4.1991 (SMBl. NW. 913) wird aufgehoben. Diesem Erlass entgegenstehende Verfügungen werden aufgehoben.').filter((entry) => entry.subject === 'other'));
    expect(statement.text).toBe('Der Gem. RdErl. d. Ministers für Stadtentwicklung, Wohnen und Verkehr u. d. Ministeriums für Umwelt, Raumordnung und Landwirtschaft v. 25.4.1991 (SMBl. NW. 913) wird aufgehoben.');
    expect(statement.references).toEqual([{ dateText: '25.4.1991', date: '1991-04-25', citations: [{ text: 'SMBl. NW. 913', gazette: 'SMBl', smblNumber: '913' }] }]);
  });

  it('verbindet Absätze mit Satzgrenzen und ordnet Positionen deterministisch', () => {
    const statements = detectRepealStatements(['3 Inkrafttreten, Aufhebung', '3.1 Die Richtwerte treten mit dem Tag ihrer Veröffentlichung in Kraft.', '3.2 Der Runderlass des Ministeriums für Inneres und Kommunales vom 25.6.2013 ( MBl. NRW. S. 202 ) wird aufgehoben.']);
    expect(statements.map((statement) => [statement.kind, statement.subject, statement.references[0]?.date])).toEqual([['repealed', 'other', '2013-06-25']]);
    expect(statements[0]!.text).toBe('3.2 Der Runderlass des Ministeriums für Inneres und Kommunales vom 25.6.2013 (MBl. NRW. S. 202) wird aufgehoben.');
  });
});

describe('Zuordnung zu einer Zielvorschrift (Nachfolgebeleg)', () => {
  const statements = detectRepealStatements('Der RdErl. d. Ministers für Ernährung, Landwirtschaft und Forsten vom 23.10.1980 – III B 3 - 228 - 20251 – (SMBl. NRW. 7815) wird aufgehoben. Der Runderlass des Ministeriums für Umwelt vom 3. Januar 1994 (MBl. NRW. S. 1098) wird aufgehoben.');

  it('verlangt das Datum und stuft nur mit Fundstelle, SMBl-Nummer oder Aktenzeichen als stark ein', () => {
    expect(matchRepealStatements(statements, { issuedOn: '1980-10-23', smblNumber: '7815' })).toMatchObject([{ level: 'strong', matched: ['date', 'smbl-number'] }]);
    expect(matchRepealStatements(statements, { issuedOn: '1980-10-23', smblNumber: '7816' })).toMatchObject([{ level: 'weak', matched: ['date'] }]);
    expect(matchRepealStatements(statements, { issuedOn: '1994-01-03', gazettePage: '1098', gazetteYear: 1994 })).toMatchObject([{ level: 'strong', matched: ['date', 'gazette-page'] }]);
    expect(matchRepealStatements(statements, { issuedOn: '1994-01-03', gazettePage: '1098', gazetteYear: 1995 })).toMatchObject([{ level: 'strong' }]);
    expect(matchRepealStatements(statements, { issuedOn: '1994-01-04', gazettePage: '1098' })).toEqual([]);
    expect(matchRepealStatements(statements, {})).toEqual([]);
  });

  it('nutzt Titelstichworte nur als Zusatzmerkmal, nie als Ersatz für das Datum', () => {
    expect(titleKeywords('Naturschutz und Landschaftspflege in Verfahren nach dem Flurbereinigungsgesetz')).toEqual(['naturschutz', 'landschaftspflege', 'verfahren', 'flurbereinigungsgesetz']);
    const withTitle = detectRepealStatements('Der Erlass „Naturschutz und Landschaftspflege in Verfahren nach dem Flurbereinigungsgesetz" (RdErl. d. Ministers für Ernährung, Landwirtschaft und Forsten vom 23.10.1980 – III B 3 - 228 - 20251 und I A 6 - 1.05.03 - SMBl. NRW. 7815 -) wird aufgehoben.');
    expect(matchRepealStatements(withTitle, { issuedOn: '1980-10-23', title: 'Naturschutz und Landschaftspflege in Verfahren nach dem Flurbereinigungsgesetz' })).toMatchObject([{ level: 'weak', matched: ['date', 'title-keyword'] }]);
    expect(matchRepealStatements(withTitle, { issuedOn: '1980-10-23', smblNumber: '7815', title: 'Naturschutz' })).toMatchObject([{ level: 'strong', matched: ['date', 'smbl-number', 'title-keyword'] }]);
  });
});
