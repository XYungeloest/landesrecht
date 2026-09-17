/**
 * Ereignisregister Schleswig-Holstein (Post-Baseline): Registerparser, Lesbarkeitsprüfung,
 * Versatzkorrektur, Evidenzklassen und Determinismus.
 *
 * Alle Fixtures unter `tests/fixtures/juris-sh/` sind **echte, kurze Ausschnitte** aus den amtlichen
 * PDFs (Systematische Übersicht, Erlassverzeichnis, Jahresinhaltsverzeichnis, Jahrgangs-PDF) – mit
 * den Eigenheiten der Quelle: Aufzählungspunkt aus einer Symbolschrift (`U+F0B7`), umbrochene
 * Ereigniszeilen, Tippfehler des Registers und der defekte Textlayer mit Zeichenversatz +29.
 *
 * Kein Netzzugriff. Der Test über den vollständigen Bestand läuft nur, wenn der Discovery-Cache
 * vorhanden ist; ohne Cache wird er übersprungen statt zu scheitern.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildEventLedger,
  DISCOVERY_CACHE_DIR,
  EVENT_SOURCES,
  compareGliederungsnummer,
  eventsFromRegister,
  resolvePublicationDate,
  tocEvents,
  type SourceDefinition,
} from '@landesrecht/importer-juris-sh/events/build.ts';
import { parseAnnualContents, parseIssueSchedule } from '@landesrecht/importer-juris-sh/events/contents.ts';
import {
  BASELINE,
  deriveConfidence,
  deriveEvidenceStrength,
  eventId,
  isBaselineOnlyCandidate,
  isFullTermination,
  sortEvents,
  toExcerpt,
  validateLedgerEvent,
  type LedgerEvent,
} from '@landesrecht/importer-juris-sh/events/ledger.ts';
import { applyCharacterShift, classifyPage, judgeLine, normalizePrivateUseCharacters, provesCharacterShift, splitPageText } from '@landesrecht/importer-juris-sh/events/pdf-text.ts';
import { amtsblattCitation, classifyRegisterLine, extractAbbreviation, extractCitations, parseErlassverzeichnis, parseGermanDate, parseSystematicOverview } from '@landesrecht/importer-juris-sh/events/registers.ts';

const FIXTURES = join(process.cwd(), 'tests/fixtures/juris-sh');
const fixture = (name: string): string => normalizePrivateUseCharacters(readFileSync(join(FIXTURES, name), 'utf8'));
const asPages = (name: string, page = 1): { page: number; text: string }[] => [{ page, text: fixture(name) }];

const SYSTEMATIC = EVENT_SOURCES.find((source) => source.id === 'gvobl-systematische-uebersicht')!;
const ERLASSVERZEICHNIS = EVENT_SOURCES.find((source) => source.id === 'ab-erlassverzeichnis')!;
const JIV_2023 = EVENT_SOURCES.find((source) => source.id === 'gvobl-jiv-2023')!;

describe('Datums- und Fundstellenformate der Verkündungsblätter', () => {
  it('liest alle im Register vorkommenden Datumsformen und erfindet keine', () => {
    expect(parseGermanDate('aufgehoben 8.3.2024 (Art. 1 Ges. v. 21.2.2024, GVOBl. S. 87)')).toBe('2024-03-08');
    expect(parseGermanDate('Vom 22. Oktober 2018, GVOBl. S. 695')).toBe('2018-10-22');
    expect(parseGermanDate('Bek. d.g.F. vom 2.12.2014, GVOBl. S. 344')).toBe('2014-12-02');
    expect(parseGermanDate('Vom 13.12.1949 i.d.F. des Gesetzes')).toBe('1949-12-13');
    expect(parseGermanDate('teilw. außer Kraft (LVO v. 11.12.1997, GVOBl. S. 521)')).toBe('1997-12-11');
    // Kein Datum, kalendarisch unmögliches Datum, Jahr außerhalb des Bereichs → nichts.
    expect(parseGermanDate('Keine Befristung!')).toBeUndefined();
    expect(parseGermanDate('31.2.2024')).toBeUndefined();
    expect(parseGermanDate('Seite 1234')).toBeUndefined();
  });

  it('erkennt die drei Zitierformen Schleswig-Holsteins samt Mischform', () => {
    expect(extractCitations('geänd. (LVO v. 4.10.2018, GVOBl. S. 658)')).toEqual(['GVOBl. S. 658']);
    expect(extractCitations('aufgehoben (Art. 2 LVO v. 19.12.2023, GVOBl. 2024 S. 75)')).toEqual(['GVOBl. 2024 S. 75']);
    expect(extractCitations('Das Landesaufnahmegesetz vom 4.11.2021 (GVOBl. Schl.-H. S. 1282), zuletzt geändert durch Gesetz vom 3.6.2025 (GVOBl. Schl.-H. 2025/92)')).toEqual(['GVOBl. Schl.-H. S. 1282', 'GVOBl. Schl.-H. 2025/92']);
    expect(extractCitations('Bek. d.g.F. vom 2.12.2014, GVOBl. S. 344, ber. GVOBl. 2015 S. 41')).toEqual(['GVOBl. S. 344', 'GVOBl. 2015 S. 41']);
    expect(extractCitations('Keine Befristung!')).toEqual([]);
  });

  it('führt die Seitenspalte des Erlassverzeichnisses in die amtliche Zitierform über', () => {
    expect(amtsblattCitation('2488')).toBe('Amtsbl. Schl.-H. S. 2488');
    expect(amtsblattCitation('2024/13')).toBe('Amtsbl. Schl.-H. 2024 S. 13');
    expect(amtsblattCitation('')).toBeUndefined();
    expect(amtsblattCitation('kein Wert')).toBeUndefined();
  });
});

describe('Klassifikation der Registerzeilen', () => {
  it('ordnet jede Ereignisart der Systematischen Übersicht zu', () => {
    expect(classifyRegisterLine('aufgehoben 8.3.2024 (Art. 1 Ges. v. 21.2.2024, GVOBl. S. 87)')).toMatchObject({ eventType: 'repeal', eventDate: '2024-03-08' });
    expect(classifyRegisterLine('außer Kraft 30.12.2023 (§ 3 LVO v. 2.11.2018, GVOBl. S. 701)')).toMatchObject({ eventType: 'expire', eventDate: '2023-12-30' });
    expect(classifyRegisterLine('Bek. d.g.F. vom 2.12.2014, GVOBl. S. 344, ber. GVOBl. 2015 S. 41')).toMatchObject({ eventType: 'recast', subtype: 'neufassung', eventDate: '2014-12-02' });
    expect(classifyRegisterLine('Art. 51 geänd. (Art. 1 Ges. v. 14.6.2016, GVOBl. S. 361)')).toMatchObject({ eventType: 'amend', eventDate: '2016-06-14', scope: 'Art. 51' });
    expect(classifyRegisterLine('Art. 22a eingef. (Ges. v. 20.4.2021, GVOBl. S. 438)')).toMatchObject({ eventType: 'amend', eventDate: '2021-04-20' });
    expect(classifyRegisterLine('Zuständigkeiten und Ressortbezeichnungen ersetzt durch Art. 64 LVO v. 27.10.2023, GVOBl. S. 514')).toMatchObject({ eventType: 'amend', subtype: 'ressortbezeichnung', eventDate: '2023-10-27' });
    expect(classifyRegisterLine('Art. 1 ändert Gl.Nr. 100-5')).toMatchObject({ eventType: 'amend', subtype: 'aenderungsbefehl', referencedGliederungsnummer: '100-5' });
    expect(classifyRegisterLine('Art. 3 Inkrafttreten')).toMatchObject({ eventType: 'commencement' });
  });

  it('behandelt ein Teilaußerkrafttreten als Teilereignis, nicht als Ende der Vorschrift', () => {
    const classified = classifyRegisterLine('§ 59 Abs. 2a außer Kraft 31.10.2020 (25.9.2020 GVOBl. S. 713)');
    expect(classified).toMatchObject({ eventType: 'expire', subtype: 'teilausserkrafttreten', eventDate: '2020-10-31', scope: '§ 59 Abs. 2a' });
    expect(isFullTermination(classified)).toBe(false);
    expect(isFullTermination(classifyRegisterLine('außer Kraft 31.12.2023 (LVO v. 2.12.2019, GVOBl. S. 623)'))).toBe(true);
  });

  it('erkennt Entfristung vor jedem Aufhebungs- oder Befristungsmuster', () => {
    const entfristet = classifyRegisterLine('§§ 1, 2 und 3 geänd./entfristet (LVO v. 11.10.2023, GVOBl. S. 477)');
    expect(entfristet).toMatchObject({ eventType: 'amend', subtype: 'entfristung', eventDate: '2023-10-11', removesExpiry: true });
    expect(classifyRegisterLine('Befristung aufgeh. (Bundesrecht) Bek. v. 24.11.2016')).toMatchObject({ eventType: 'amend', subtype: 'entfristung', removesExpiry: true });
    expect(classifyRegisterLine('Bundesrecht – keine Befristung!')).toMatchObject({ eventType: 'amend', subtype: 'entfristung', removesExpiry: true });
  });

  it('liest Befristungsverlängerungen mit neuem Fristende und Beschlussdatum', () => {
    const extended = classifyRegisterLine('Verlängerung der Geltungsdauer bis zum 31.12.2025 Bek. v. 11.5.2022 752');
    expect(extended).toMatchObject({ eventType: 'amend', subtype: 'befristungsverlaengerung', effectiveDate: '2025-12-31', eventDate: '2022-05-11' });
    expect(classifyRegisterLine('weiter befristet - Bek. v. 14.11.2018 1098')).toMatchObject({ eventType: 'amend', subtype: 'befristungsverlaengerung', eventDate: '2018-11-14' });
  });

  it('erkennt die kollektive Weitergeltung der Verwaltungsvorschriften', () => {
    expect(classifyRegisterLine('Weitergeltung der Befristung Bek. v. 4.12.2023 3105')).toMatchObject({ eventType: 'amend', subtype: 'kollektive-weitergeltung', eventDate: '2023-12-04' });
  });

  it('erfasst eine nicht zuordenbare Zeile als unknown statt sie zu verwerfen oder zu raten', () => {
    const unknown = classifyRegisterLine('teilw. verfassungswidrig - Urteil LVerfG v. 30.8.2010 (Bek. v. 12.10.2010, GVOBl. S. 659)');
    expect(unknown.eventType).toBe('unknown');
    expect(unknown.eventDate).toBeUndefined();
    // Die Fundstelle bleibt trotzdem erhalten – die Zeile ist ein Beleg, nur kein eingeordneter.
    expect(unknown.citations).toEqual(['GVOBl. S. 659']);
    expect(classifyRegisterLine('§ 1 neu gefefasst (LVO v. 21.7.2013, GVOBl. S. 347)').eventType).toBe('unknown');
  });
});

describe('Systematische Übersicht: Blockbildung', () => {
  it('liest Kopf, Ausfertigung und Ereignisse einer Vorschrift und fügt umbrochene Zeilen zusammen', () => {
    const parsed = parseSystematicOverview(asPages('systematische-uebersicht-s2020.txt', 52));
    const entry = parsed.entries.find((candidate) => candidate.gliederungsnummer === '2020-3-36')!;
    expect(entry).toMatchObject({ ressort: 'IV 30', issuedDate: '2017-08-14', citation: 'GVOBl. S. 433' });
    expect(entry.title).toContain('Landesverordnung über die Aufstellung und Ausführung des Haushaltsplanes der Gemeinden');
    expect(entry.abbreviation).toBe('GemHVO');
    // Die vierte Ereigniszeile bricht um; sie muss als eine Zeile ankommen.
    expect(entry.eventLines.map((line) => line.text)).toContain('\u2022 geänd. (LVO v. 27.11.2023, GVOBl. S. 631), aufgehoben (Art. 2 LVO v. 19.12.2023, GVOBl. 2024 S. 75)');
  });

  it('trennt Gliederungsüberschriften von Vorschriften und liest die umbrochene Ausfertigungszeile', () => {
    const parsed = parseSystematicOverview(asPages('systematische-uebersicht-s0100.txt'));
    expect(parsed.headings).toBeGreaterThanOrEqual(3);
    const verfassung = parsed.entries.find((candidate) => candidate.gliederungsnummer === '100-1')!;
    expect(verfassung.issuedDate).toBe('1949-12-13');
    // Die Fundstelle steht erst in der Folgezeile der Ausfertigung.
    expect(verfassung.citation).toBe('GVOBl. S. 391');
    expect(verfassung.eventLines).toHaveLength(5);
  });

  it('erkennt die ausdrückliche Feststellung unbefristeter Geltung', () => {
    // `gilt unbefristet` ist kein Ereignis im engeren Sinn, aber ein Beleg für den Fortbestand –
    // und es hebt eine vorherige Befristung auf. Vor der Erweiterung fielen diese Zeilen als
    // `unknown` an und wurden, wenn sie am Anfang eines Eintrags standen, dem Kopf zugeschlagen.
    const classified = classifyRegisterLine('gilt unbefristet (§ 62 Abs. 2 Nr. 2 LVwG)');
    expect(classified).toMatchObject({ eventType: 'amend', subtype: 'unbefristet', removesExpiry: true });
  });

  it('erkennt Neufassungen, bei denen der Gegenstand vor dem Datum steht', () => {
    expect(classifyRegisterLine('NF Anl. Erl. v. 27.10.1989 464')).toMatchObject({ eventType: 'recast', subtype: 'neufassung', eventDate: '1989-10-27' });
    expect(classifyRegisterLine('NF Anl. 1 und 2 Erl. v. 8.7.1998 615')).toMatchObject({ eventType: 'recast', subtype: 'neufassung', eventDate: '1998-07-08' });
  });

  it('erkennt Ressortbezeichnungen auch ohne das fehlende Leerzeichen der Quelle', () => {
    // Das Register schreibt stellenweise `Ressortbezeichnungenersetzt` zusammen.
    expect(classifyRegisterLine('Zuständigkeiten und Ressortbezeichnungenersetzt durch Art. 5 LVO v. 8.9.2010, GVOBl. S. 575')).toMatchObject({
      eventType: 'amend',
      subtype: 'ressortbezeichnung',
      eventDate: '2010-09-08',
    });
  });

  it('trennt die Übertragung von Zuständigkeiten von der bloßen Bezeichnungsanpassung', () => {
    expect(classifyRegisterLine('Zuständigkeiten übertragen. (Art. 1 § 1 Abs. 2 Nr. 1 LVO v. 12.12.2007, GVOBl. S. 625)')).toMatchObject({
      eventType: 'amend',
      subtype: 'zustaendigkeitsuebertragung',
      eventDate: '2007-12-12',
    });
  });

  it('behandelt ein ersetztes Fristende nicht als Ende der Vorschrift', () => {
    // Ändert ein Änderungsakt die Befristungsvorschrift, nennt das Register beides: die Änderung des
    // § 50 und das neue Fristende aus demselben Akt. Das alte Datum ist damit ersetzt – ohne diese
    // Regel gälte eine bis 2028 verlängerte Wahlordnung als am 30.12.2023 erloschen.
    const { events } = eventsFromRegister(SYSTEMATIC, asPages('systematische-uebersicht-ersetzte-befristung.txt', 76));
    const expiries = events.filter((event) => event.eventType === 'expire');
    expect(expiries.map((event) => [event.eventDate, event.processingStatus])).toEqual([
      ['2023-12-30', 'superseded-by-later-expiry'],
      ['2028-12-30', 'recorded'],
    ]);
    // Die widersprüchliche Evidenz bleibt sichtbar, statt entfernt zu werden.
    expect(expiries[0]!.evidenceStrength).toBe('contradictory');
    expect(expiries[0]!.excerpt).toContain('außer Kraft 30.12.2023');
    expect(isBaselineOnlyCandidate(expiries[0]!)).toBe(false);
    // Das künftige Fristende ist kein Kandidat, weil es nach dem Auswertungsstichtag liegt.
    expect(isBaselineOnlyCandidate(expiries[1]!)).toBe(false);
  });

  it('entschärft ein Außerkrafttreten, dem eine Entfristung folgt, und lässt die spätere Aufhebung stehen', () => {
    const { events } = eventsFromRegister(SYSTEMATIC, asPages('systematische-uebersicht-s2020.txt', 52));
    const expiry = events.find((event) => event.eventType === 'expire' && event.targetGliederungsnummer === '2020-3-36')!;
    expect(expiry).toMatchObject({ eventDate: '2023-12-31', processingStatus: 'defused-by-entfristung', evidenceStrength: 'contradictory' });
    expect(isBaselineOnlyCandidate(expiry)).toBe(false);

    const repeal = events.find((event) => event.eventType === 'repeal')!;
    expect(repeal).toMatchObject({ eventDate: '2023-12-19', evidenceStrength: 'strong', processingStatus: 'recorded' });
    expect(isBaselineOnlyCandidate(repeal)).toBe(true);
    // Die Zeile trägt zwei Ereignisse mit je eigener Fundstelle. Zur Aufhebung gehört die zweite;
    // die erste (S. 631) gehört zur Änderung davor.
    expect(repeal.citation).toBe('GVOBl. 2024 S. 75');

    // Die nicht entschärfte Befristung der Nachbarvorschrift bleibt ein Kandidat.
    const neighbour = events.find((event) => event.eventType === 'expire' && event.targetGliederungsnummer === '2020-3-37')!;
    expect(neighbour.processingStatus).toBe('recorded');
    expect(isBaselineOnlyCandidate(neighbour)).toBe(true);
  });
});

describe('Erlassverzeichnis: Verwaltungsvorschriften', () => {
  it('liest Eintrag, Fundstelle und Befristungsverlängerungen', () => {
    const parsed = parseErlassverzeichnis(asPages('erlassverzeichnis-befristung.txt', 78));
    const entry = parsed.entries.find((candidate) => candidate.gliederungsnummer === '6660.19')!;
    expect(entry).toMatchObject({ ressort: 'IV GS', issuedAs: 'Bek.', issuedDate: '2018-12-03', citation: 'Amtsbl. Schl.-H. S. 1193' });
    expect(entry.eventLines).toHaveLength(2);
    const { events } = eventsFromRegister(ERLASSVERZEICHNIS, asPages('erlassverzeichnis-befristung.txt', 78));
    expect(events.map((event) => [event.subtype, event.eventDate, event.effectiveDate, event.citation])).toEqual([
      ['befristungsverlaengerung', '2021-09-16', '2022-12-31', 'Amtsbl. Schl.-H. S. 1586'],
      ['befristungsverlaengerung', '2022-05-11', '2025-12-31', 'Amtsbl. Schl.-H. S. 752'],
    ]);
  });

  it('fügt die Folgezeile einer kollektiven Weitergeltung an und datiert sie richtig', () => {
    const { events } = eventsFromRegister(ERLASSVERZEICHNIS, asPages('erlassverzeichnis-weitergeltung.txt', 109));
    const collective = events.filter((event) => event.subtype === 'kollektive-weitergeltung');
    expect(collective).toHaveLength(2);
    expect(collective[1]).toMatchObject({ eventDate: '2023-12-04', citation: 'Amtsbl. Schl.-H. S. 3105', targetGliederungsnummer: '925.3', evidenceStrength: 'strong' });
    // Die erste Weitergeltung nennt kein Datum – sie bleibt ohne und damit ohne Beweiskraft.
    expect(collective[0]!.eventDate).toBeUndefined();
    expect(collective[0]!.evidenceStrength).toBe('supporting');
  });

  it('führt eine Teilaufhebung als Teilereignis mit Angabe des betroffenen Teils', () => {
    const { events } = eventsFromRegister(ERLASSVERZEICHNIS, asPages('erlassverzeichnis-teilaufhebung.txt', 92));
    const partial = events.find((event) => event.subtype === 'teilaufhebung')!;
    expect(partial).toMatchObject({ eventType: 'repeal', eventDate: '2016-07-11', citation: 'Amtsbl. Schl.-H. S. 1033' });
    expect(partial.targetIdentityHints).toContain('teil:Teile 2, 4, 20, 25, 29 und 37');
    expect(isFullTermination(partial)).toBe(false);
  });

  it('gewinnt die Abkürzung nur aus einer eindeutigen Klammer', () => {
    expect(extractAbbreviation('Gesetz über das Landesverfassungsgericht (Landesverfassungsgerichtsgesetz - LVerfGG)')).toBe('LVerfGG');
    expect(extractAbbreviation('Richtlinie zur Förderung von Investitionen in Frauenfacheinrichtungen')).toBeUndefined();
  });
});

describe('Jahresinhaltsverzeichnis und Ausgabenplan', () => {
  it('liest Datum, Titel, Ausgabe, Seite und jede Änderungsbeziehung', () => {
    const parsed = parseAnnualContents([{ page: 12, text: `2023\n${fixture('gvobl-jiv-2023-dezember.txt')}` }], { dateKind: 'ausfertigung', layout: 'day-with-month-headers' });
    const dienstrecht = parsed.entries.find((entry) => entry.title.startsWith('Gesetz zur Fortentwicklung dienstrechtlicher'))!;
    expect(dienstrecht).toMatchObject({ date: '2023-12-13', issueNumber: '17', printedPage: 634 });
    expect(dienstrecht.relations).toHaveLength(7);
    expect(dienstrecht.relations.map((relation) => relation.gliederungsnummer)).toEqual(['2032-20', '2032-22', '2030-16', '2030-4', '2032-1-14', '2032-20-13', '2035-5']);
    expect(dienstrecht.relations.every((relation) => relation.kind === 'amend')).toBe(true);
  });

  it('gewinnt Ausgabennummer und Ausgabedatum aus den laufenden Kopfzeilen', () => {
    const schedule = parseIssueSchedule(asPages('gvobl-2023-kopfzeilen.txt'));
    expect(schedule).toEqual([
      { issue: '16', publishedAt: '2023-12-07', firstPage: 540, lastPage: 542, pageCount: 3 },
      { issue: '17', publishedAt: '2023-12-28', firstPage: 646, lastPage: 648, pageCount: 3 },
    ]);
  });

  it('datiert eine Verkündung über das Ausgabedatum, nicht über das Ausfertigungsdatum', () => {
    const schedule = parseIssueSchedule(asPages('gvobl-2023-kopfzeilen.txt'));
    const parsed = parseAnnualContents([{ page: 12, text: `2023\n${fixture('gvobl-jiv-2023-dezember.txt')}` }], { dateKind: 'ausfertigung', layout: 'day-with-month-headers' });
    const entry = parsed.entries.find((candidate) => candidate.title.startsWith('Gesetz zur Fortentwicklung dienstrechtlicher'))!;
    expect(resolvePublicationDate(schedule, entry)?.publishedAt).toBe('2023-12-28');
    const events = tocEvents({ definition: JIV_2023 }, [entry], schedule);
    expect(events[0]).toMatchObject({ eventType: 'amend', eventDate: '2023-12-28', citation: 'GVOBl. Schl.-H. 2023 S. 634' });
    // Das Ausfertigungsdatum geht nicht verloren, es trägt nur nicht die Stichtagsentscheidung.
    expect(events[0]!.targetIdentityHints).toContain('ausfertigung:2023-12-13');
  });

  it('lässt eine Verkündung ohne datierbare Ausgabe ohne Datum, statt eines zu unterstellen', () => {
    const parsed = parseAnnualContents([{ page: 12, text: `2023\n${fixture('gvobl-jiv-2023-dezember.txt')}` }], { dateKind: 'ausfertigung', layout: 'day-with-month-headers' });
    const events = tocEvents({ definition: JIV_2023 }, parsed.entries.slice(0, 1), []);
    expect(events[0]!.eventDate).toBeUndefined();
    expect(events[0]!.processingStatus).toBe('needs-review');
    expect(events[0]!.evidenceStrength).not.toBe('strong');
  });
});

describe('Textlayer: Lesbarkeit und Versatzkorrektur', () => {
  it('erkennt den Zeichenversatz +29 nur, wenn er auf der Seite nachweisbar ist', () => {
    expect(applyCharacterShift("'LHPLW/DQGHVZDSSHQ")).toBe('DiemitLandeswappen');
    // Leerzeichen der Layoutauffüllung bleiben Leerzeichen.
    expect(applyCharacterShift('$QODJH ]X$EVDW]')).toBe('Anlage zuAbsatz');
    const proving = fixture('gvobl-2023-seite-versatz.txt').split('\n').filter((line) => provesCharacterShift(line));
    expect(proving.length).toBeGreaterThanOrEqual(2);
    expect(applyCharacterShift(proving[0]!)).toContain('Landesjustizverwaltung');
    // Sauberer deutscher Text wird nie verschoben.
    expect(judgeLine('Nr. 16  Gesetz- und Verordnungsblatt für Schleswig-Holstein 2023; Ausgabe 7. Dezember 2023  541')).toBe('clean');
    expect(provesCharacterShift('Nr. 16  Gesetz- und Verordnungsblatt für Schleswig-Holstein 2023; Ausgabe 7. Dezember 2023  541')).toBe(false);
  });

  it('korrigiert eine beschädigte Seite und lässt die saubere Kopfzeile unangetastet', () => {
    const page = classifyPage(62, fixture('gvobl-2023-seite-versatz.txt'));
    expect(page.status).toBe('shift-corrected');
    expect(page.shiftProof).toBeGreaterThanOrEqual(2);
    expect(page.linesUnreadable).toBe(0);
    expect(page.text.split('\n')[0]).toContain('Gesetz- und Verordnungsblatt für Schleswig-Holstein 2023; Ausgabe 19. Januar 2023');
    expect(page.text).toContain('Landesjustizverwaltung');
    expect(page.text).toContain('Angelegenheit');
  });

  it('lässt eine saubere Seite unverändert', () => {
    const page = classifyPage(21, fixture('gvobl-2023-seite-sauber.txt'));
    expect(page.status).toBe('clean');
    expect(page.linesShifted).toBe(0);
    expect(page.text).toContain('Sachverzeichnis 2023');
  });

  it('verwirft ohne Nachweis: eine einzelne beschädigte Zeile wird unlesbar, nicht geraten', () => {
    const damaged = fixture('gvobl-2023-seite-versatz.txt').split('\n').find((line) => provesCharacterShift(line))!;
    const clean = fixture('gvobl-2023-seite-sauber.txt').split('\n').slice(0, 12);
    const page = classifyPage(1, [...clean, damaged].join('\n'));
    // Ein einziger Nachweis genügt nicht: die Zeile wird verworfen, nicht verschoben.
    expect(page.shiftProof).toBe(1);
    expect(page.linesShifted).toBe(0);
    expect(page.linesUnreadable).toBe(1);
    expect(page.text).not.toContain('Landesjustizverwaltung');
  });

  it('verwirft eine überwiegend unlesbare Seite vollständig', () => {
    const damaged = fixture('gvobl-2023-seite-versatz.txt').split('\n').filter((line) => judgeLine(line) === 'damaged' && !provesCharacterShift(line));
    const page = classifyPage(1, damaged.join('\n'));
    expect(page.status).toBe('unreadable');
    expect(page.text).toBe('');
  });

  it('normalisiert den Aufzählungspunkt der Symbolschrift und zerlegt Seitenvorschübe', () => {
    expect(normalizePrivateUseCharacters(' geänd.')).toBe('• geänd.');
    expect(splitPageText('eins\fzwei\f')).toEqual(['eins', 'zwei']);
  });
});

describe('Evidenzklassen und Kennungen', () => {
  const strongInput = { eventType: 'repeal' as const, eventDate: '2024-03-08', citation: 'GVOBl. S. 87', targetTitle: 'Gesetz zur Einrichtung einer Clearingstelle Windenergie', targetGliederungsnummer: '1101-13' };

  it('vergibt strong nur mit Datum, Fundstelle und eindeutigem Ziel', () => {
    expect(deriveEvidenceStrength(strongInput)).toBe('strong');
    expect(deriveEvidenceStrength({ ...strongInput, eventDate: undefined })).toBe('supporting');
    expect(deriveEvidenceStrength({ ...strongInput, citation: '' })).toBe('supporting');
    expect(deriveEvidenceStrength({ ...strongInput, eventType: 'unknown' })).toBe('insufficient');
    expect(deriveEvidenceStrength({ ...strongInput, contradicted: true })).toBe('contradictory');
    expect(deriveEvidenceStrength({ eventType: 'expire', citation: '', targetTitle: 'Unklar' })).toBe('insufficient');
  });

  it('führt die Konfidenz auf dieselben Merkmale zurück', () => {
    expect(deriveConfidence(strongInput)).toBe(1);
    expect(deriveConfidence({ ...strongInput, contradicted: true })).toBe(0.3);
    expect(deriveConfidence({ ...strongInput, eventDate: undefined, targetGliederungsnummer: undefined })).toBe(0.65);
  });

  it('bildet stabile Kennungen aus Quelle, Seite, Zeile und Zeileninhalt', () => {
    const first = eventId({ sourceId: 'gvobl-systematische-uebersicht', page: 52, line: 5, text: 'außer Kraft 31.12.2023 (§ 61 LVO v. 14.8.2017, GVOBl. S. 433)' });
    expect(first).toMatch(/^gvobl-systematische-uebersicht-p0052-l005-[0-9a-f]{10}$/u);
    expect(eventId({ sourceId: 'gvobl-systematische-uebersicht', page: 52, line: 5, text: ' außer  Kraft 31.12.2023 (§ 61 LVO v. 14.8.2017, GVOBl. S. 433) ' })).toBe(first);
    expect(eventId({ sourceId: 'gvobl-systematische-uebersicht', page: 52, line: 6, text: 'außer Kraft 31.12.2023 (§ 61 LVO v. 14.8.2017, GVOBl. S. 433)' })).not.toBe(first);
    expect(() => eventId({ sourceId: 'Falsche Quelle', page: 1, line: 1, text: 'x' })).toThrow(/Quellkennung/u);
  });

  it('kürzt den Ausschnitt auf 200 Zeichen und prüft jedes Ereignis hart', () => {
    expect(toExcerpt(`  ${'a'.repeat(400)}  `)).toHaveLength(200);
    const { events } = eventsFromRegister(SYSTEMATIC, asPages('systematische-uebersicht-s2020.txt', 52));
    for (const event of events) expect(validateLedgerEvent(event)).toEqual([]);
    expect(validateLedgerEvent({ ...events[0], eventDate: '31.12.2023' }).join(' ')).toContain('eventDate');
    expect(validateLedgerEvent({ ...events[0], sourceSha256: 'kurz' }).join(' ')).toContain('sourceSha256');
    const strong = events.find((event) => event.evidenceStrength === 'strong')!;
    expect(validateLedgerEvent({ ...strong, eventDate: undefined }).join(' ')).toContain('starker Beleg ohne Datum');
  });

  it('sortiert deterministisch nach Datum, Quelle, Seite und Zeile', () => {
    const base: LedgerEvent = { id: 'a', eventType: 'amend', targetTitle: 'X Y', targetIdentityHints: [], citation: '', sourceId: 'a', sourceUrl: 'https://example.invalid/a', sourceSha256: '0'.repeat(64), sourcePage: 1, sourceLine: 1, organ: 'gvobl', excerpt: 'x', evidenceStrength: 'supporting', confidence: 0.5, processingStatus: 'recorded' };
    const sorted = sortEvents([
      { ...base, id: 'ohne-datum' },
      { ...base, id: 'spaet', eventDate: '2024-01-01' },
      { ...base, id: 'frueh', eventDate: '2023-12-02' },
      { ...base, id: 'gleich-spaeter', eventDate: '2023-12-02', sourcePage: 2 },
    ]);
    expect(sorted.map((event) => event.id)).toEqual(['frueh', 'gleich-spaeter', 'spaet', 'ohne-datum']);
  });

  it('ordnet Gliederungsnummern abschnittsweise numerisch', () => {
    expect(['1101.34', '1101.9', '925.3', '102.2'].sort(compareGliederungsnummer)).toEqual(['102.2', '925.3', '1101.9', '1101.34']);
    expect(compareGliederungsnummer('2020-3-36', '2020-3-4')).toBeGreaterThan(0);
  });
});

describe('Determinismus', () => {
  it('liefert bei zweimaligem Bauen aus derselben Quelle dasselbe Ergebnis', () => {
    const pages = asPages('systematische-uebersicht-s2020.txt', 52);
    const first = eventsFromRegister(SYSTEMATIC, pages).events;
    const second = eventsFromRegister(SYSTEMATIC, pages).events;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(sortEvents(second))).toBe(JSON.stringify(sortEvents([...first].reverse())));
  });
});

/* Der vollständige Lauf braucht den Discovery-Cache; ohne ihn wird er übersprungen. */
const cacheReady = EVENT_SOURCES.every((source: SourceDefinition) => existsSync(join(process.cwd(), DISCOVERY_CACHE_DIR, 'raw', source.file)));

describe.skipIf(!cacheReady)('Vollständiger Lauf über den Discovery-Cache', () => {
  it('baut das Register zweimal identisch und hält das Schema ein', async () => {
    const first = await buildEventLedger({ root: process.cwd(), offline: true });
    const second = await buildEventLedger({ root: process.cwd(), offline: true });
    expect(JSON.stringify(second.ledger)).toBe(JSON.stringify(first.ledger));
    expect(JSON.stringify(second.inventory)).toBe(JSON.stringify(first.inventory));
    expect(second.report).toBe(first.report);
    expect(first.ledger.baselineDate).toBe(BASELINE);
    expect(first.ledger.events.length).toBeGreaterThan(5000);
  }, 120_000);

  it('führt die 845 Verwaltungsvorschriften des Erlassverzeichnisses als Inventar', async () => {
    const result = await buildEventLedger({ root: process.cwd(), offline: true });
    expect(result.inventory.entries.length).toBeGreaterThanOrEqual(845);
    expect(new Set(result.inventory.entries.map((entry) => entry.gliederungsnummer)).size).toBe(result.inventory.entries.length);
    expect(result.inventory.entries.every((entry) => /^\d{1,4}\.\d{1,3}$/u.test(entry.gliederungsnummer))).toBe(true);
    expect(result.statistics.december.issues.map((issue) => `${issue.organ} ${issue.issue}`)).toEqual(['gvobl 16', 'amtsblatt 49/50', 'amtsblatt 51', 'amtsblatt 52', 'gvobl 17']);
  }, 120_000);

  it('hält die Register sauber lesbar und meldet die beschädigten Jahrgänge', async () => {
    const result = await buildEventLedger({ root: process.cwd(), offline: true });
    const registers = result.ledger.sources.filter((source) => source.id.includes('uebersicht') || source.id.includes('erlassverzeichnis') || source.id.includes('jiv'));
    expect(registers.every((source) => source.pagesUnreadable === 0 && source.pagesShiftCorrected === 0)).toBe(true);
    const amtsblatt = result.ledger.sources.find((source) => source.id === 'ab-2023')!;
    expect(amtsblatt.pagesShiftCorrected).toBeGreaterThan(0);
  }, 120_000);
});
