/**
 * Post-Baseline-Ereignisregister Bayern: Übersichts- und Detailseitenparser, Erkennung der
 * Änderungsbefehle, Zielauflösung, Evidenzregeln, Vollständigkeit der Enden und Determinismus.
 *
 * Alle Fixtures unter `tests/fixtures/bayernrecht/verkuendung-*.html` sind **echte, gekürzte
 * Ausschnitte** der Verkündungsplattform Bayern – mit den Eigenheiten der Quelle: geschützte
 * Leerzeichen mitten im Zitat, eine Trefferlistenzeile ohne Verweis auf eine Detailseite
 * (Berichtigung), Mantelverordnungen mit acht Gliederungsnummern, Aufhebungslisten als
 * Definitionsliste und die von der Plattform selbst veröffentlichte SHA-256 der PDF-Ausgabe.
 *
 * Kein Netzzugriff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  citedNormKey,
  derivePublicationEvents,
  formatCitation,
  reconcileTargetIdentities,
  type PublicationInput,
} from '@landesrecht/importer-bayernrecht/events/build.ts';
import {
  bracketCommand,
  classifyCommand,
  classifyPublication,
  commandFor,
  commandWindow,
  extractEffectiveDate,
  extractTerminationDate,
  extractTitleCandidates,
  insideQuote,
  isPlausibleTitle,
  listCommand,
  maskQuoted,
  scanCitations,
  scanRepealList,
  titleAbbreviation,
} from '@landesrecht/importer-bayernrecht/events/classify.ts';
import { parsePublicationDocument } from '@landesrecht/importer-bayernrecht/events/documents.ts';
import { needsFullText, coveredVolumes, gvblListingUrl, baymblListingUrl, EXPORT_PROBE } from '@landesrecht/importer-bayernrecht/events/harvest.ts';
import {
  BASELINE,
  EVALUATION_DATE,
  FIRST_POST_BASELINE_DAY,
  ORGAN_PROVENANCE,
  deriveConfidence,
  deriveEvidenceStrength,
  endEffectiveDay,
  eventId,
  isBaselineOnlyCandidate,
  isFullTermination,
  isFutureTermination,
  sortEvents,
  toExcerpt,
  validateLedgerEvent,
  type LedgerEvent,
} from '@landesrecht/importer-bayernrecht/events/ledger.ts';
import { parseGermanDate, parseGvblIssueIndex, parseListingPage, splitGliederungsnummern } from '@landesrecht/importer-bayernrecht/events/listings.ts';
import {
  changeReferences,
  createStockIndex,
  extractAbbreviations,
  matchStrength,
  normalizeTitle,
  parseLongGermanDate,
  publicationReference,
  resolveTarget,
  subjectReading,
  type StockIndex,
} from '@landesrecht/importer-bayernrecht/events/resolve.ts';

const FIXTURES = join(process.cwd(), 'tests/fixtures/bayernrecht');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

/* ------------------------------------------------------------------------ Übersichtsseiten */

describe('Ausgabenverzeichnis GVBl.', () => {
  const rows = parseGvblIssueIndex(fixture('verkuendung-gvbl-ausgaben-2023-excerpt.html'));

  it('liest Ausgabe, Verkündungsdatum, Seitenbereich und PDF-Adresse', () => {
    const issue23 = rows.find((row) => row.issue === '23');
    expect(issue23).toBeDefined();
    expect(issue23!.volume).toBe(2023);
    expect(issue23!.publishedAt).toBe('2023-12-14');
    expect(issue23!.pages).toBe('625 - 636');
    expect(issue23!.pdfPath).toBe('/files/gvbl/2023/23/gvbl-2023-23.pdf');
  });

  it('übernimmt die von der Plattform veröffentlichte SHA-256 als Integritätsbeleg', () => {
    // Wert aus data/audits/bayernrecht/discovery/verkuendungsorgane.json (Erkundungslauf 2026-09-17).
    expect(rows.find((row) => row.issue === '22')?.sha256Published).toBe('9a9267261224b038dea9de703d6dabbd3e772460fe78d1ef510819aa646ee102');
    expect(rows.every((row) => /^[0-9a-f]{64}$/u.test(row.sha256Published))).toBe(true);
  });

  it('führt das Jahresinhaltsverzeichnis unter der Ausgabennummer 00 des Dateipfads', () => {
    const toc = rows.find((row) => row.pdfPath.includes('jahresinhaltsverzeichnis'));
    expect(toc?.issue).toBe('00');
    expect(toc?.publishedAt).toBe('2024-01-16');
  });
});

describe('Trefferliste GVBl.', () => {
  const page = parseListingPage(fixture('verkuendung-gvbl-trefferliste-2023-excerpt.html'));

  it('liest Fundstelle, Verkündung, Titel, Gliederungsnummern und Ausfertigung', () => {
    const row = page.rows.find((candidate) => candidate.position === 655);
    expect(row).toMatchObject({
      detailPath: '/gvbl/2023-655/',
      reference: '2023 S. 655',
      volume: 2023,
      publishedAt: '2023-12-29',
      title: 'Verordnung zur Änderung der Bekanntmachungsverordnung',
      gliederungsnummern: ['2020-1-1-2-I'],
    });
  });

  it('erfasst auch die Zeile ohne Detailseite – Berichtigungen führt die Liste unverlinkt', () => {
    const correction = page.rows.find((candidate) => candidate.position === 586);
    expect(correction?.detailPath).toBeUndefined();
    expect(correction?.title).toContain('Berichtigung des Gesetzes');
    expect(correction?.gliederungsnummern.length).toBeGreaterThan(1);
  });

  it('zählt für die Blätterlogik alle Ergebniszeilen, nicht nur die verwertbaren', () => {
    // Bräche die Blätterlogik bei den verwertbaren Zeilen ab, verlöre ein Jahrgang ab der ersten
    // unverlinkten Berichtigung alle folgenden Seiten.
    expect(page.rowsSeen).toBe(3);
    expect(page.totalHits).toBe(164);
  });

  it('nimmt mehrere Gliederungsnummern einer Mantelverkündung auf', () => {
    expect(page.rows.find((candidate) => candidate.position === 644)?.gliederungsnummern).toEqual(['2210-1-1-14-WK', '2030-2-21-WK']);
  });
});

describe('Trefferliste BayMBl.', () => {
  const page = parseListingPage(fixture('verkuendung-baymbl-trefferliste-excerpt.html'));

  it('liest Fundstelle, Verkündung, Erlassdatum und Ressort', () => {
    expect(page.rows[0]).toMatchObject({
      detailPath: '/baymbl/2026-390/',
      reference: '2026 Nr. 390',
      publishedAt: '2026-09-16',
      enactmentDate: '2026-09-04',
      ressort: 'Bayerische Staatskanzlei',
      gliederungsnummern: [],
    });
  });

  it('unterscheidet Verkündungs- und Erlassdatum', () => {
    // Das Erlassdatum liegt regelmäßig Wochen vor der Verkündung; für den Stichtag zählt nur die Verkündung.
    expect(page.rows.every((row) => row.enactmentDate === undefined || row.publishedAt === undefined || row.enactmentDate <= row.publishedAt)).toBe(true);
  });
});

describe('Hilfsfunktionen der Übersichten', () => {
  it('liest deutsche Datumsangaben und weist unmögliche zurück', () => {
    expect(parseGermanDate('30.12.2024')).toBe('2024-12-30');
    expect(parseGermanDate('31.02.2024')).toBeUndefined();
    expect(parseGermanDate('ohne Datum')).toBeUndefined();
  });

  it('verwirft Seiten- und Jahreszahlen in der Spalte „Gl-Nr.“', () => {
    expect(splitGliederungsnummern('2020-1-1-2-I, 2015-1-1-V')).toEqual(['2020-1-1-2-I', '2015-1-1-V']);
    expect(splitGliederungsnummern('2023')).toEqual([]);
    expect(splitGliederungsnummern('')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- Detailseiten */

describe('Detailseite einer GVBl.-Verkündung', () => {
  const document = parsePublicationDocument(fixture('verkuendung-gvbl-2023-655-excerpt.html'), 'gvbl', 2023, 655);

  it('liest Gattung, Gliederungsnummer, Ausgabe und PDF-Adresse', () => {
    expect(document.documentKind).toBe('Verordnung');
    expect(document.gliederungsnummern).toEqual(['2020-1-1-2-I']);
    expect(document.issue).toBe('2023/24');
    expect(document.gazettePdfPath).toBe('/files/gvbl/2023/24/gvbl-2023-24.pdf');
  });

  it('übernimmt die veröffentlichte SHA-256 der Ausgabe kleingeschrieben', () => {
    // Identisch mit dem Wert des Ausgabenverzeichnisses für 24/2023.
    expect(document.gazettePdfSha256Published).toBe('797ae678d338d1afbd6a6d4801ed6aecdb276e6b502425a10e04c7cbc541bc9e');
  });

  it('gewinnt den Volltext der Verkündung – kein PDF, kein OCR', () => {
    expect(document.hasTextLayer).toBe(true);
    expect(document.text).toContain('Gemeindeordnung');
    // Geschützte Leerzeichen der Quelle sind aufgelöst, sonst gäbe es zwei Schreibweisen desselben Datums.
    expect(document.text).not.toMatch(/ /u);
  });
});

describe('Detailseite einer BayMBl.-Verkündung', () => {
  const document = parsePublicationDocument(fixture('verkuendung-baymbl-2026-379-excerpt.html'), 'baymbl', 2026, 379);

  it('liest Ressort, Gliederungsnummern und die veröffentlichte Prüfsumme', () => {
    expect(document.documentKind).toBe('Verwaltungsvorschrift');
    expect(document.ressort).toContain('Familie, Arbeit und Soziales');
    expect(document.gliederungsnummern).toEqual(['2230.2-A', '7157.2-A']);
    expect(document.gazettePdfSha256Published).toBe('95542758f1442f7294795c5c23363fcd6ad7a29046ebbaed1cf8a414cff4377f');
  });

  it('zerlegt die Aufhebungsliste in einzelne Absätze', () => {
    expect(document.paragraphs.some((paragraph) => paragraph.startsWith('Es werden folgende Verwaltungsvorschriften aufgehoben'))).toBe(true);
  });
});

/* ------------------------------------------------------------------------ Klassifikation */

describe('Klassifikation einer Veröffentlichung', () => {
  it('ordnet Berichtigungen vor Änderungen ein', () => {
    // „Berichtigung des Gesetzes zur Änderung …“ ist eine Berichtigung, keine Änderung.
    expect(classifyPublication('Berichtigung des Gesetzes zur Änderung des Gemeinde- und Landkreiswahlgesetzes', 'Gesetz').eventType).toBe('correction');
    expect(classifyPublication('Druckfehlerberichtigung der Geschäftsordnung des Bayerischen Verfassungsgerichtshofs').eventType).toBe('correction');
  });

  it('ordnet Neufassungen vor Änderungen ein', () => {
    expect(classifyPublication('Bekanntmachung der Neufassung der Verordnung zur Änderung der Kostensatzung').eventType).toBe('recast');
  });

  it('erkennt Aufhebung, Staatsvertrag, Inkrafttretensbekanntmachung und Änderung', () => {
    expect(classifyPublication('Aufhebung von Verwaltungsvorschriften', 'Verwaltungsvorschrift').eventType).toBe('repeal');
    expect(classifyPublication('Bekanntmachung des Staatsvertrags über die Zusammenarbeit').eventType).toBe('treaty');
    expect(classifyPublication('Bekanntmachung über das Inkrafttreten des Abkommens', 'Bekanntmachung').eventType).toBe('commencement');
    expect(classifyPublication('Verordnung zur Änderung der Zuständigkeitsverordnung', 'Verordnung')).toMatchObject({ eventType: 'amend', subtype: 'aenderungsverordnung' });
    expect(classifyPublication('Verordnung zur Änderung der Schulerrichtungsverordnung und weiterer Rechtsvorschriften', 'Verordnung').subtype).toBe('mantelaenderung');
  });

  it('stuft Verwaltungsakte, die wie Normereignisse klingen, zur Bekanntgabe herab', () => {
    // Das BayMBl. verkündet auch Verwaltungsakte. Ohne Gliederungsnummer und ohne Vorschriftenwort
    // im Titel ist eine „Aufhebung“ keine Aufhebung einer Vorschrift.
    expect(classifyPublication('Aufhebung der bergrechtlichen Erlaubnis „Augsburg-Ost“ zur Aufsuchung von Erdwärme').eventType).toBe('notice');
    expect(classifyPublication('Änderung der Anschrift der honorarkonsularischen Vertretung des Fürstentums Monaco').eventType).toBe('notice');
    expect(classifyPublication('Aufhebung der Ausschreibung einer Schulratsstelle').eventType).toBe('notice');
    // Mit Gliederungsnummer bleibt es eine Aufhebung: Die Plattform führt die Veröffentlichung dann
    // in der Vorschriftensammlung.
    expect(classifyPublication('Aufhebung der Erlaubnis', undefined, { hasGliederungsnummer: true }).eventType).toBe('repeal');
  });

  it('erkennt neue Vorschriften an der Gattungsangabe', () => {
    expect(classifyPublication('Gesetz über die Errichtung einer Anstalt des öffentlichen Rechts', 'Gesetz').eventType).toBe('new');
    expect(classifyPublication('Irgendetwas ohne Muster').eventType).toBe('unknown');
  });
});

describe('Zitate im Verkündungstext', () => {
  const document = parsePublicationDocument(fixture('verkuendung-gvbl-2026-520-excerpt.html'), 'gvbl', 2026, 520);
  const citations = scanCitations(document.text);

  it('liest Gliederungsnummer, Abkürzung, Ausfertigungsdatum und Fundstelle aus einem Zitat', () => {
    const bayEUG = citations.find((citation) => citation.bayRsNumber === '2230-1-1-K');
    expect(bayEUG).toMatchObject({ abbreviation: 'BayEUG', enactmentDate: '2000-05-31', citation: 'GVBl. S. 414' });
  });

  it('räumt die Fassungsangabe weg, bevor es den Titel liest', () => {
    // Ohne diesen Schritt bliebe „Fassung der Bekanntmachung“ als Titel stehen.
    expect(citations.every((citation) => citation.title !== 'Fassung der Bekanntmachung')).toBe(true);
    expect(citations.find((citation) => citation.bayRsNumber === '2238-1-K')?.abbreviation).toBe('BayLBG');
  });

  it('verwirft Zitatbruchstücke statt sie als Titel zu führen', () => {
    expect(citations.every((citation) => citation.title === undefined || isPlausibleTitle(citation.title))).toBe(true);
    expect(isPlausibleTitle('S. 796, BayRS 2020-1-1-I), die zuletzt durch')).toBe(false);
    expect(isPlausibleTitle('Dezember 2023 Auf Grund des Art. 120')).toBe(false);
    expect(isPlausibleTitle('Gemeindeordnung')).toBe(true);
  });

  it('merkt sich einen Strukturverweis vor dem Titel', () => {
    expect(citations.find((citation) => citation.bayRsNumber === '300-1-1-J')?.scopeReference).toMatch(/Art\.\s*65/u);
  });

  it('führt mehrere Titellesarten, entscheidet aber nicht selbst', () => {
    // Der Genitiv macht die Titelgrenze mehrdeutig; beide Lesarten bleiben stehen, entschieden wird
    // erst beim Abgleich gegen den Bestand.
    expect(extractTitleCandidates('Die Verordnung zur Durchführung des Polizeiorganisationsgesetzes').map((candidate) => candidate.text)).toEqual([
      'Polizeiorganisationsgesetzes',
      'Durchführung des Polizeiorganisationsgesetzes',
      'Verordnung zur Durchführung des Polizeiorganisationsgesetzes',
      'Die Verordnung zur Durchführung des Polizeiorganisationsgesetzes',
    ]);
  });
});

describe('Änderungsbefehl hinter einem Zitat', () => {
  const standard =
    'Die Zuständigkeitsverordnung (ZustV) vom 16. Juni 2015 (GVBl. S. 184, BayRS 2015-1-1-V), die zuletzt durch Verordnung vom 3. September 2024 (GVBl. S. 418) geändert worden ist, wird wie folgt geändert:';

  it('findet den Befehl über die eingeschobene Änderungshistorie hinweg', () => {
    const citations = scanCitations(standard);
    const main = citations.find((citation) => citation.bayRsNumber === '2015-1-1-V')!;
    expect(classifyCommand(commandWindow(standard, main) ?? '')).toMatchObject({ eventType: 'amend' });
  });

  it('macht das Zitat der Änderungshistorie nicht selbst zum Gegenstand', () => {
    // Ohne diese Regel entstünde ein zweites, falsches Änderungsereignis gegen das ändernde Gesetz.
    const citations = scanCitations(standard);
    const history = citations.find((citation) => citation.bayRsNumber === undefined && citation.citation === 'GVBl. S. 418');
    expect(history).toBeDefined();
    expect(commandWindow(standard, history!)).toBeUndefined();
  });

  it('unterscheidet Aufhebung, Außerkrafttreten und Änderung', () => {
    expect(classifyCommand('wird aufgehoben.')).toMatchObject({ eventType: 'repeal' });
    expect(classifyCommand('tritt mit Ablauf des 31. Dezember 2025 außer Kraft.')).toMatchObject({ eventType: 'expire' });
    expect(classifyCommand('erhält folgende Fassung:')).toMatchObject({ eventType: 'amend' });
    expect(classifyCommand('ist ein Satz ohne Befehl.')).toBeUndefined();
  });
});

describe('Daten aus der Schlussvorschrift', () => {
  it('liest das Inkrafttreten, auch rückwirkend', () => {
    expect(extractEffectiveDate('Diese Verordnung tritt am 1. Januar 2025 in Kraft.')).toBe('2025-01-01');
    expect(extractEffectiveDate('Diese Bekanntmachung tritt rückwirkend zum 1. August 2024 in Kraft.')).toBe('2024-08-01');
    expect(extractEffectiveDate('Diese Verordnung tritt in Kraft.')).toBeUndefined();
  });

  it('übernimmt „mit Ablauf des“ unverändert und rechnet nicht auf den Folgetag', () => {
    expect(extractTerminationDate('Sie tritt mit Ablauf des 31. Dezember 2028 außer Kraft.')).toBe('2028-12-31');
    // „am 1. Februar 2025 außer Kraft“ nennt den ersten Tag ohne Geltung; geführt wird der letzte Geltungstag.
    expect(extractTerminationDate('Die Richtlinie tritt am 1. Februar 2025 außer Kraft.')).toBe('2025-01-31');
  });
});

describe('Aufhebungsliste des BayMBl.', () => {
  const document = parsePublicationDocument(fixture('verkuendung-baymbl-2026-379-excerpt.html'), 'baymbl', 2026, 379);
  const repealed = scanRepealList(document.paragraphs);

  it('erfasst jede aufgehobene Vorschrift der Liste', () => {
    // Der Aufhebungsbefehl steht hier vor den Zielen; die gewöhnliche Befehlserkennung fände ihn nicht.
    expect(repealed).toHaveLength(3);
  });

  it('nimmt das letzte Ausfertigungsdatum eines Listenglieds, nicht das eingebettete Zitat', () => {
    // Glied 1.2 zitiert das JArbSchG „vom 12. April 1976“, ist selbst aber vom 14. März 1978.
    const embedded = repealed.find((entry) => entry.citation === 'AllMBl. S. 57');
    expect(embedded?.enactmentDate).toBe('1978-03-14');
  });

  it('erfasst auch ein Listenglied ohne Fundstelle', () => {
    const schreiben = repealed.find((entry) => entry.title?.startsWith('Schreiben'));
    expect(schreiben?.enactmentDate).toBe('2005-04-28');
    expect(schreiben?.citation).toBeUndefined();
  });

  it('hört bei der Schlussvorschrift auf', () => {
    expect(repealed.every((entry) => !/tritt am/u.test(entry.title ?? ''))).toBe(true);
  });
});

/* ------------------------------------------------------------------------ Zielauflösung */

const STOCK: StockIndex = createStockIndex([
  {
    area: 'landesrecht',
    path: 'test/enumeration-landesrecht.json',
    items: [
      { documentId: 'BayKiBiG', title: 'Bayerisches Kinderbildungs- und -betreuungsgesetz (BayKiBiG) vom 8. Juli 2005 (S. 236)', bayRsNumber: '2231-1-A' },
      { documentId: 'ZustV', title: 'Zuständigkeitsverordnung (ZustV) vom 16. Juni 2015 (S. 184)', bayRsNumber: '2015-1-1-V' },
      { documentId: 'NSG_A', title: 'Verordnung über das Naturschutzgebiet "Gleiche Namen" vom 1. Januar 1990 (S. 1)', bayRsNumber: '791-3-1-U' },
      { documentId: 'NSG_B', title: 'Verordnung über das Naturschutzgebiet "Gleiche Namen" vom 2. Februar 1991 (S. 2)', bayRsNumber: '791-3-2-U' },
    ],
  },
  {
    area: 'vwv',
    path: 'test/enumeration-vwv.json',
    items: [
      {
        documentId: 'BayVwVRedR',
        title: 'Bek StR: Richtlinien für die Redaktion von Rechtsvorschriften (Redaktionsrichtlinien - RedR)',
        sectionPath: ['1', '10', '103'],
        changeNotes: ['Änderung vom 21.11.2023, BayMBl. 2023 Nr. 584', 'Änderung vom 16.12.2025, BayMBl. 2025 Nr. 587'],
      },
      { documentId: 'BayVwVAndere', title: 'Bek StMI: Eine andere Verwaltungsvorschrift desselben Sachgebiets', sectionPath: ['1', '10', '103'] },
    ],
  },
]);

describe('Abgleichbestand', () => {
  it('normalisiert Titel für den Vergleich, ohne zu verwischen', () => {
    expect(normalizeTitle('Bek StR: Richtlinien für die Redaktion von Rechtsvorschriften (Redaktionsrichtlinien - RedR)')).toBe('richtlinien für die redaktion von rechtsvorschriften');
    expect(normalizeTitle('Zuständigkeitsverordnung (ZustV) vom 16. Juni 2015 (S. 184)')).toBe('zuständigkeitsverordnung');
  });

  it('liest Abkürzungen auch aus einem zweiteiligen Klammerzusatz', () => {
    expect(extractAbbreviations('Richtlinien (Redaktionsrichtlinien - RedR)')).toContain('RedR');
    expect(extractAbbreviations('Kinderbildungsgesetz (BayKiBiG)')).toEqual(['BayKiBiG']);
  });

  it('übersetzt beide Fundstellenformen des Änderungsverlaufs', () => {
    expect(changeReferences('Änderung vom 21.11.2023, BayMBl. 2023 Nr. 584')).toEqual(['baymbl:2023-584']);
    expect(changeReferences('1) § 7 €-Änderungen (§ 3 Nr. 1 b V v. 08.03.2001, S. 172)')).toContain('gvbl:2001-172');
    // Verkündung im Folgejahr: „v. 14.04.2020, 450; 2021, 14“ führt zwei Jahrgänge.
    expect(changeReferences('5) (Art. 4 Abk. v. 14.04.2020, 450; 2021, 14)')).toEqual(expect.arrayContaining(['gvbl:2020-450', 'gvbl:2021-14']));
  });

  it('liest ausgeschriebene deutsche Datumsangaben', () => {
    expect(parseLongGermanDate('vom 8. Juli 2005')).toBe('2005-07-08');
    expect(parseLongGermanDate('vom 8. Heumond 2005')).toBeUndefined();
  });
});

describe('Zielauflösung', () => {
  it('löst über die Gliederungsnummer eindeutig auf', () => {
    const resolution = resolveTarget(STOCK, { gliederungsnummer: '2015-1-1-V', title: 'Zuständigkeitsverordnung', abbreviation: 'ZustV', terminating: false, addressesExistingNorm: true });
    expect(resolution).toMatchObject({ status: 'resolved', sourceIdentity: 'ZustV', matchStrength: 'strong' });
    expect(resolution.matchedOn).toEqual(expect.arrayContaining(['bayrs', 'abbreviation', 'exact-title']));
  });

  it('löst über die Fundstelle im Änderungsverlauf auf – der Bestand benennt die Verkündung selbst', () => {
    const resolution = resolveTarget(STOCK, { publicationReference: publicationReference('baymbl', 2023, 584), terminating: false, addressesExistingNorm: true });
    expect(resolution).toMatchObject({ status: 'resolved', sourceIdentity: 'BayVwVRedR', matchStrength: 'strong', matchedOn: ['fundstelle'] });
  });

  it('entscheidet bei gleichnamigen Vorschriften nicht, sondern meldet Mehrdeutigkeit', () => {
    const resolution = resolveTarget(STOCK, { title: 'Verordnung über das Naturschutzgebiet "Gleiche Namen"', terminating: false, addressesExistingNorm: true });
    expect(resolution.status).toBe('ambiguous');
    expect(resolution.candidates).toEqual(['NSG_A', 'NSG_B']);
    expect(resolution.matchStrength).not.toBe('strong');
  });

  it('erkennt eine benannte, aber heute fehlende Vorschrift als baseline-only-Fall', () => {
    const resolution = resolveTarget(STOCK, {
      title: 'Bekanntmachung über die Vereinbarung über Richtlinien für die Zusammenarbeit von Schule und Berufsberatung',
      enactmentDate: '2006-07-10',
      targetCitation: 'AllMBl. S. 252',
      terminating: true,
      addressesExistingNorm: true,
    });
    expect(resolution.status).toBe('absent-from-portal');
    expect(resolution.matchStrength).toBe('strong');
  });

  it('führt ein Ende ohne bestimmbares Ziel als Reviewfall, statt eines zu erfinden', () => {
    const resolution = resolveTarget(STOCK, { terminating: true, addressesExistingNorm: true });
    expect(resolution).toMatchObject({ status: 'missing-predecessor', matchStrength: 'insufficient', matchedOn: [] });
  });

  it('lässt einen nur ähnlichen Titel nicht als Zuordnung durchgehen', () => {
    // „Zuständigkeitsverordnung Verkehr“ ist nicht „Zuständigkeitsverordnung“ – kein Teiltreffer.
    const resolution = resolveTarget(STOCK, { title: 'Zuständigkeitsverordnung Verkehr', terminating: false, addressesExistingNorm: true });
    expect(resolution.status).not.toBe('resolved');
    expect(resolution.matchStrength).not.toBe('strong');
  });

  it('macht ein Ausfertigungsdatum allein nie zu einer starken Zuordnung', () => {
    expect(matchStrength(['ausfertigungsdatum'], false)).toBe('supporting');
    expect(matchStrength([], false)).toBe('insufficient');
    expect(matchStrength(['exact-title', 'ausfertigungsdatum'], false)).toBe('strong');
    expect(matchStrength(['bayrs'], true)).toBe('strong');
  });

  it('benutzt die BayMBl.-Gliederungsnummer nicht als Identität – sie bezeichnet ein Sachgebiet', () => {
    // Im Sachgebiet 103 stehen zwei Verwaltungsvorschriften; die Nummer allein entscheidet nichts.
    expect(STOCK.bySectionLeaf.get('103')).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------- Evidenz und Schema */

describe('Evidenzregeln', () => {
  const input = { eventType: 'amend' as const, eventDate: '2024-01-10', citation: 'GVBl. 2024 S. 1', targetTitle: 'Zuständigkeitsverordnung', targetMatchStrength: 'strong' as const };

  it('verlangt für `strong` Datum, Fundstelle und ein strukturell identifiziertes Ziel', () => {
    expect(deriveEvidenceStrength(input)).toBe('strong');
    expect(deriveEvidenceStrength({ ...input, targetMatchStrength: 'supporting' })).toBe('supporting');
    expect(deriveEvidenceStrength({ ...input, eventDate: undefined })).toBe('supporting');
    expect(deriveEvidenceStrength({ ...input, targetTitle: '', targetMatchStrength: 'insufficient' })).toBe('insufficient');
  });

  it('stuft widersprüchliche Belege gesondert ein', () => {
    expect(deriveEvidenceStrength({ ...input, contradicted: true })).toBe('contradictory');
    expect(deriveConfidence({ ...input, contradicted: true })).toBe(0.3);
    expect(deriveConfidence(input)).toBeGreaterThan(deriveConfidence({ ...input, targetMatchStrength: 'insufficient' }));
  });

  it('kürzt Auszüge und normalisiert Leerraum', () => {
    expect(toExcerpt('  ein   Auszug\nmit Umbruch ')).toBe('ein Auszug mit Umbruch');
    expect(toExcerpt('x'.repeat(400))).toHaveLength(320);
  });

  it('erzeugt stabile, inhaltsabhängige Kennungen', () => {
    const first = eventId({ sourceId: 'gvbl-2024-682', position: 682, ordinal: 0, text: 'ein Beleg' });
    expect(first).toBe(eventId({ sourceId: 'gvbl-2024-682', position: 682, ordinal: 0, text: 'ein  Beleg ' }));
    expect(first).not.toBe(eventId({ sourceId: 'gvbl-2024-682', position: 682, ordinal: 0, text: 'ein anderer Beleg' }));
    expect(() => eventId({ sourceId: 'GVBl 2024', position: 1, ordinal: 0, text: 'x' })).toThrow();
  });
});

describe('Schemaprüfung', () => {
  const valid: LedgerEvent = {
    id: 'gvbl-2024-682-n00682-00-abcdef0123',
    eventType: 'amend',
    eventDate: '2024-12-30',
    targetTitle: 'Verordnung über Zuständigkeiten im Verkehrswesen',
    targetBayRsNumber: '9210-2-I/B',
    targetIdentityHints: ['bayrs:9210-2-I/B'],
    targetResolution: { status: 'resolved', matchStrength: 'strong', sourceIdentity: 'ZustVVerk', matchedOn: ['bayrs'], note: 'Gliederungsnummer eindeutig.' },
    citation: 'GVBl. 2024 S. 682',
    issue: '2024/24',
    sourcePosition: 682,
    sourceId: 'gvbl-2024-682',
    sourceUrl: 'https://www.verkuendung-bayern.de/gvbl/2024-682/',
    sourceSha256: 'a'.repeat(64),
    organ: 'gvbl',
    publicationAuthority: 'printed-official',
    digitalRepresentation: 'official-platform-informational-copy',
    excerpt: 'Die Verordnung über Zuständigkeiten im Verkehrswesen … wird wie folgt geändert',
    evidenceStrength: 'strong',
    confidence: 0.9,
    processingStatus: 'recorded',
  };

  it('akzeptiert ein vollständiges Ereignis', () => {
    expect(validateLedgerEvent(valid)).toEqual([]);
  });

  it('weist einen falschen Provenienzrang zurück', () => {
    // Die elektronische GVBl.-Fassung ist nachrichtlich; sie darf nie als amtlich geführt werden.
    expect(validateLedgerEvent({ ...valid, publicationAuthority: 'electronic-official' }).join(' ')).toContain('publicationAuthority');
    expect(validateLedgerEvent({ ...valid, digitalRepresentation: 'official-electronic-edition' }).join(' ')).toContain('digitalRepresentation');
    expect(ORGAN_PROVENANCE.baymbl.authority).toBe('electronic-official');
    expect(ORGAN_PROVENANCE.gvbl.authority).toBe('printed-official');
  });

  it('lässt keinen starken Beleg ohne strukturell identifiziertes Ziel zu', () => {
    const weak = { ...valid, targetResolution: { ...valid.targetResolution, matchStrength: 'supporting' as const } };
    expect(validateLedgerEvent(weak).join(' ')).toContain('strukturell identifiziertes Ziel');
  });

  it('erzwingt zu jedem Ende einen Vorgänger oder einen Reviewfall', () => {
    const orphan = { ...valid, eventType: 'repeal' as const, targetResolution: { status: 'not-applicable' as const, matchStrength: 'insufficient' as const, matchedOn: [], note: 'x' } };
    expect(validateLedgerEvent(orphan).join(' ')).toContain('ohne Zielauflösung');
    const unflagged = { ...valid, eventType: 'repeal' as const, targetResolution: { status: 'missing-predecessor' as const, matchStrength: 'insufficient' as const, matchedOn: [], note: 'x' }, evidenceStrength: 'insufficient' as const };
    expect(validateLedgerEvent(unflagged).join(' ')).toContain("processingStatus 'missing-predecessor'");
  });

  it('verlangt zu jedem unknown den Rohtext', () => {
    expect(validateLedgerEvent({ ...valid, eventType: 'unknown', evidenceStrength: 'insufficient' }).join(' ')).toContain('rawText');
  });
});

/* ------------------------------------------------------------- Ereignisse je Veröffentlichung */

function input(entry: Partial<PublicationInput['entry']> & { volume: number; position: number; title: string }, document?: PublicationInput['document']): PublicationInput {
  return {
    entry: {
      organ: 'gvbl',
      listingSourceId: 'gvbl-liste-test',
      listingUrl: 'https://www.verkuendung-bayern.de/gvbl/?volume=2026',
      listingSha256: 'b'.repeat(64),
      reference: `${entry.volume} S. ${entry.position}`,
      gliederungsnummern: [],
      ...entry,
    } as PublicationInput['entry'],
    ...(document ? { document } : {}),
    sourceId: `test-${entry.volume}-${entry.position}`,
    sourceUrl: `https://www.verkuendung-bayern.de/gvbl/${entry.volume}-${entry.position}/`,
    sourceSha256: 'c'.repeat(64),
  };
}

describe('Ereignisse je Veröffentlichung', () => {
  it('bildet je Gliederungsnummer eines Mantelakts ein eigenes Ereignis mit eigenem Ziel', () => {
    const document = parsePublicationDocument(fixture('verkuendung-gvbl-2026-520-excerpt.html'), 'gvbl', 2026, 520);
    const events = derivePublicationEvents(
      input(
        {
          volume: 2026,
          position: 520,
          title: 'Verordnung zur Änderung der Schulerrichtungsverordnung und weiterer Rechtsvorschriften',
          publishedAt: '2026-07-30',
          enactmentDate: '2026-07-24',
          gliederungsnummern: ['2230-1-1-5-K', '2038-3-4-4-1-K', '2236-9-5-K'],
        },
        document,
      ),
      STOCK,
    );
    // Trefferliste und Seitenkopf werden vereinigt: Was eine der beiden Quellen führt, zählt.
    expect(events).toHaveLength(8);
    expect(new Set(events.map((event) => event.targetBayRsNumber))).toEqual(new Set(document.gliederungsnummern.map((value) => value.toUpperCase())));
    // Maßgeblich ist das Verkündungsdatum; das Ausfertigungsdatum bleibt daneben erhalten.
    expect(events.every((event) => event.eventDate === '2026-07-30' && event.enactmentDate === '2026-07-24')).toBe(true);
    expect(events.every((event) => event.organ === 'gvbl' && event.publicationAuthority === 'printed-official')).toBe(true);
    expect(events.every((event) => validateLedgerEvent(event).length === 0)).toBe(true);
  });

  it('macht aus einer Aufhebungsliste ein Ereignis je aufgehobener Vorschrift', () => {
    const document = parsePublicationDocument(fixture('verkuendung-baymbl-2026-379-excerpt.html'), 'baymbl', 2026, 379);
    const events = derivePublicationEvents(
      input(
        {
          organ: 'baymbl',
          volume: 2026,
          position: 379,
          title: 'Aufhebung von Verwaltungsvorschriften',
          publishedAt: '2026-09-16',
          enactmentDate: '2026-09-01',
          gliederungsnummern: ['2230.2-A', '7157.2-A'],
        },
        document,
      ),
      STOCK,
    );
    // Drei aufgehobene Vorschriften, zwei Sachgebietsnummern – die Nummern sind nicht die Ziele.
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.eventType === 'repeal')).toBe(true);
    expect(events.every((event) => event.publicationAuthority === 'electronic-official')).toBe(true);
    expect(events.every((event) => event.targetResolution.status === 'absent-from-portal')).toBe(true);
    // Die Aufhebung wirkt erst am 1. Oktober 2026: Am Auswertungsstichtag galten die Vorschriften noch –
    // sie sind künftige Enden, keine heute fehlenden Vorschriften. Ab dem Wirksamwerden wären sie es.
    expect(events.every((event) => event.effectiveDate === '2026-10-01')).toBe(true);
    expect(events.filter((event) => isBaselineOnlyCandidate(event, EVALUATION_DATE))).toHaveLength(0);
    expect(events.filter((event) => isFutureTermination(event, EVALUATION_DATE))).toHaveLength(3);
    expect(events.filter((event) => isBaselineOnlyCandidate(event, '2026-10-01'))).toHaveLength(3);
    expect(events.every((event) => validateLedgerEvent(event).length === 0)).toBe(true);
  });

  it('führt eine Veröffentlichung ohne Detailseite aus den Listenangaben, statt sie zu verlieren', () => {
    const events = derivePublicationEvents(
      input({
        volume: 2023,
        position: 586,
        title: 'Berichtigung des Gesetzes zur Änderung des Gemeinde- und Landkreiswahlgesetzes und weiterer Rechtsvorschriften vom 24. Juli 2023 (GVBl. S. 385)',
        publishedAt: '2023-09-29',
        gliederungsnummern: ['2020-1-1-I', '2020-6-1-I'],
      }),
      STOCK,
    );
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.eventType === 'correction')).toBe(true);
    expect(events.every((event) => event.excerpt.includes('Berichtigung'))).toBe(true);
  });

  it('gibt einem Teilbereichsbefehl nie die Kraft eines Endes', () => {
    const scoped: LedgerEvent = {
      id: 'x',
      eventType: 'repeal',
      subtype: 'teilaufhebung',
      eventDate: '2024-05-05',
      targetTitle: 'Eine Verordnung',
      targetIdentityHints: [],
      targetResolution: { status: 'absent-from-portal', matchStrength: 'strong', matchedOn: ['bayrs', 'exact-title'], note: 'x' },
      citation: 'GVBl. 2024 S. 1',
      issue: '2024/1',
      sourcePosition: 1,
      sourceId: 'x',
      sourceUrl: 'https://www.verkuendung-bayern.de/gvbl/2024-1/',
      sourceSha256: 'd'.repeat(64),
      organ: 'gvbl',
      publicationAuthority: 'printed-official',
      digitalRepresentation: 'official-platform-informational-copy',
      excerpt: 'x',
      evidenceStrength: 'strong',
      confidence: 0.9,
      processingStatus: 'recorded',
    };
    expect(isFullTermination(scoped)).toBe(false);
    expect(isBaselineOnlyCandidate(scoped, EVALUATION_DATE)).toBe(false);
    expect(isBaselineOnlyCandidate({ ...scoped, subtype: undefined }, EVALUATION_DATE)).toBe(true);
  });

  it('sortiert deterministisch', () => {
    const base = { organ: 'gvbl' as const, sourceId: 'a', sourcePosition: 1 } as LedgerEvent;
    const events = [
      { ...base, id: 'b', eventDate: '2024-02-01' },
      { ...base, id: 'a', eventDate: '2024-01-01' },
      { ...base, id: 'c' },
    ] as LedgerEvent[];
    expect(sortEvents(events).map((event) => event.id)).toEqual(['a', 'b', 'c']);
    expect(sortEvents(sortEvents(events))).toEqual(sortEvents(events));
  });
});

/* ------------------------------------------------------------------------- Abrufplan */

describe('Abrufplan', () => {
  it('deckt den Zeitraum vom Stichtagsjahr bis zum Auswertungsstichtag lückenlos ab', () => {
    expect(coveredVolumes(BASELINE, EVALUATION_DATE)).toEqual([2023, 2024, 2025, 2026]);
    expect(FIRST_POST_BASELINE_DAY).toBe('2023-12-02');
  });

  it('holt den Volltext nur, wo er zur Stichtagsfrage beiträgt', () => {
    expect(needsFullText({ organ: 'gvbl', gliederungsnummern: [], title: 'Irgendetwas', detailPath: '/gvbl/2024-1/' })).toBe(true);
    expect(needsFullText({ organ: 'baymbl', gliederungsnummern: ['2231-A'], title: 'Vollzug des BayKiBiG', detailPath: '/baymbl/2024-1/' })).toBe(true);
    expect(needsFullText({ organ: 'baymbl', gliederungsnummern: [], title: 'Aufhebung von Verwaltungsvorschriften', detailPath: '/baymbl/2024-2/' })).toBe(true);
    expect(needsFullText({ organ: 'baymbl', gliederungsnummern: [], title: 'Stellenausschreibung', detailPath: '/baymbl/2024-3/' })).toBe(false);
    expect(needsFullText({ organ: 'gvbl', gliederungsnummern: [], title: 'Berichtigung ohne Detailseite' })).toBe(false);
  });

  it('bildet die Adressen des reinen GET-Formulars', () => {
    expect(gvblListingUrl(2024, 51)).toBe('https://www.verkuendung-bayern.de/gvbl/?volume=2024&itemsPerPage=50&offset=51');
    expect(baymblListingUrl(1)).toBe('https://www.verkuendung-bayern.de/baymbl/?itemsPerPage=50&offset=1');
  });

  it('hält den Befund zum CSV-Export fest, statt ihn zu erzwingen', () => {
    expect(EXPORT_PROBE.method).toBe('GET');
    expect(EXPORT_PROBE.result).toContain('keine CSV');
  });

  it('druckt Fundstellen so, wie das jeweilige Organ sie führt', () => {
    expect(formatCitation('gvbl', 2024, 682)).toBe('GVBl. 2024 S. 682');
    expect(formatCitation('baymbl', 2024, 100)).toBe('BayMBl. 2024 Nr. 100');
  });
});

/* ------------------------------------------- Registerfehler EuMedBek (BayMBl. 2024 Nr. 7, 2026 Nr. 377) */

/**
 * Die Europamedaillen-Bekanntmachung (EuMedBek, AllMBl. 2018 S. 962) steht im Portal (`BayVV_1132_S_086`),
 * stand aber als heute fehlende Stichtagsnorm im Register. Drei Ursachen, alle allgemein behoben:
 *   1. BayMBl. 2026 Nr. 377 zitiert sie als „Europamedaillen-Bekanntmachung – EuMedBek“: Die Abkürzung
 *      hinter dem Gedankenstrich wurde nicht erkannt, der Titel passte auf keinen Bestandseintrag.
 *   2. Die Aufhebung wirkt erst am 1. Oktober 2026; maßgeblich war das Verkündungsdatum (16. September).
 *   3. BayMBl. 2024 Nr. 7 ändert Nr. 5 der EuMedBek („Die Sätze 3 bis 5 werden aufgehoben“) und stand als
 *      Aufhebung der ganzen EuMedBek zum 1. Februar 2024 im Register.
 */
describe('Registerfehler EuMedBek: eine Vorschrift des Portals ist nie „heute fehlend“', () => {
  const EUMEDBEK_STOCK = (title: string): StockIndex =>
    createStockIndex([{ area: 'vwv', path: 'test/enumeration-vwv.json', items: [{ documentId: 'BayVV_1132_S_086', title, sectionPath: ['1', '11', '113', '1132'], changeNotes: ['Änderung vom 14.12.2023, BayMBl. 2024 Nr. 7'] }] }]);
  const WITH_ABBREVIATION = EUMEDBEK_STOCK('Bek StK: Verleihung einer Medaille für besondere Verdienste um den Freistaat Bayern in Europa und der Welt (Europamedaillen-Bekanntmachung - EuMedBek)');
  const baymbl = (volume: number, position: number, title: string, publishedAt: string, enactmentDate: string): PublicationInput => {
    const base = input({ organ: 'baymbl', volume, position, title, publishedAt, enactmentDate, gliederungsnummern: ['1132-S'] }, parsePublicationDocument(fixture(`verkuendung-baymbl-${volume}-${position}-excerpt.html`), 'baymbl', volume, position));
    return { ...base, sourceId: `baymbl-${volume}-${position}`, sourceUrl: `https://www.verkuendung-bayern.de/baymbl/${volume}-${position}/` };
  };
  const amendment2024 = (): PublicationInput => baymbl(2024, 7, 'Änderung der Europamedaillen-Bekanntmachung', '2024-01-10', '2023-12-14');
  const repeal2026 = (): PublicationInput => baymbl(2026, 377, 'Änderung der Bekanntmachung über die Verleihung einer Medaille für Verdienste um die Zivil-Militärische Zusammenarbeit', '2026-09-16', '2026-08-26');

  it('liest die Abkürzung auch hinter einem Gedankenstrich – und nur ein Wort mit zwei Großbuchstaben', () => {
    expect(titleAbbreviation('Europamedaillen-Bekanntmachung – EuMedBek')).toMatchObject({ abbreviation: 'EuMedBek', form: 'dash' });
    expect(titleAbbreviation('Richtlinien für den Lärmschutz an Straßen – RLS-90')).toMatchObject({ abbreviation: 'RLS-90' });
    expect(titleAbbreviation('Richtlinien für den Lärmschutz an Straßen – Ausgabe')).toBeUndefined();
    expect(titleAbbreviation('Staatsvertrag – Teil A')).toBeUndefined();
    const text = parsePublicationDocument(fixture('verkuendung-baymbl-2026-377-excerpt.html'), 'baymbl', 2026, 377).text;
    const cited = scanCitations(text).find((entry) => entry.enactmentDate === '2018-10-12');
    // Der Titel bleibt wörtlich (die Ereigniskennung hängt an ihm); die Lesart ohne Abkürzung kommt hinzu.
    expect(cited).toMatchObject({ title: 'Europamedaillen-Bekanntmachung – EuMedBek', abbreviation: 'EuMedBek', citation: 'AllMBl. S. 962' });
    expect(cited!.titleCandidates).toContain('Europamedaillen-Bekanntmachung');
  });

  it('löst die Aufhebung von 2026 über die Abkürzung auf und führt sie als künftiges Ende, nicht als fehlende Norm', () => {
    const events = derivePublicationEvents(repeal2026(), WITH_ABBREVIATION);
    const repeal = events.find((event) => event.eventType === 'repeal')!;
    expect(repeal).toMatchObject({ effectiveDate: '2026-10-01', targetAbbreviation: 'EuMedBek', targetResolution: { status: 'resolved', sourceIdentity: 'BayVV_1132_S_086', matchStrength: 'strong' } });
    expect(isBaselineOnlyCandidate(repeal, EVALUATION_DATE)).toBe(false);
    expect(isFutureTermination(repeal, EVALUATION_DATE)).toBe(true);
    // Selbst wenn der Bestand sie nicht fände: Ein erst am 1. Oktober 2026 wirkendes Ende macht am
    // 18. September 2026 keine heute fehlende Vorschrift.
    const unresolved = { ...repeal, targetResolution: { status: 'absent-from-portal' as const, matchStrength: 'strong' as const, matchedOn: ['exact-title' as const, 'fundstelle' as const], note: 'x' } };
    expect(endEffectiveDay(unresolved)).toBe('2026-10-01');
    expect(isBaselineOnlyCandidate(unresolved, EVALUATION_DATE)).toBe(false);
  });

  it('macht aus „Nr. 5 … wird wie folgt geändert: … Die Sätze 3 bis 5 werden aufgehoben“ keine Aufhebung der Vorschrift', () => {
    const text = parsePublicationDocument(fixture('verkuendung-baymbl-2024-7-excerpt.html'), 'baymbl', 2024, 7).text;
    const cited = scanCitations(text).find((entry) => entry.enactmentDate === '2018-10-12')!;
    expect(classifyCommand(commandWindow(text, cited) ?? '')).toMatchObject({ eventType: 'amend' });
    // Die erste Anweisung entscheidet – auch umgekehrt: Eine Aufhebung bleibt eine Aufhebung.
    expect(classifyCommand(' wird aufgehoben. 2. Die Bekanntmachung Y wird wie folgt geändert:')).toMatchObject({ eventType: 'repeal' });
    const events = derivePublicationEvents(amendment2024(), WITH_ABBREVIATION);
    expect(events.map((event) => event.eventType)).toEqual(['amend']);
    expect(events[0]!.targetResolution).toMatchObject({ status: 'resolved', sourceIdentity: 'BayVV_1132_S_086' });
  });

  it('gleicht Ereignisse über das Stammzitat ab: Wer dieselbe Vorschrift im Bestand findet, widerlegt „heute fehlend“', () => {
    const repeal = derivePublicationEvents(repeal2026(), EUMEDBEK_STOCK('Bek StK: Eine ganz andere Überschrift'))
      .find((event) => event.eventType === 'repeal')!;
    expect(repeal.targetResolution.status).toBe('absent-from-portal');
    expect(citedNormKey(repeal)).toBe('2018-10-12|AllMBl|S|962');
    const resolvedElsewhere: LedgerEvent = {
      ...repeal,
      id: 'anderes-ereignis',
      eventType: 'amend',
      citation: 'BayMBl. 2024 Nr. 7',
      targetIdentityHints: ['zitat-ausfertigung:2018-10-12', 'zitat-fundstelle:AllMBl. 2018 S. 962'],
      targetResolution: { status: 'resolved', matchStrength: 'strong', sourceIdentity: 'BayVV_1132_S_086', matchedOn: ['abbreviation'], note: 'x' },
    };
    const [reconciled] = reconcileTargetIdentities([repeal, resolvedElsewhere]);
    expect(reconciled!.targetResolution).toMatchObject({ status: 'resolved', sourceIdentity: 'BayVV_1132_S_086', matchStrength: 'strong', matchedOn: ['ausfertigungsdatum', 'fundstelle'] });
    expect(reconciled!.id).toBe(repeal.id);
    expect(validateLedgerEvent(reconciled).length).toBe(0);
    // Zwei verschiedene Bestandseinträge für dasselbe Stammzitat: keine Entscheidung, ein Reviewfall.
    const conflicting = { ...resolvedElsewhere, id: 'drittes', targetResolution: { ...resolvedElsewhere.targetResolution, sourceIdentity: 'BayVV_ANDERE' } };
    const [ambiguous] = reconcileTargetIdentities([repeal, resolvedElsewhere, conflicting]);
    expect(ambiguous!.targetResolution).toMatchObject({ status: 'ambiguous', candidates: ['BayVV_1132_S_086', 'BayVV_ANDERE'] });
    expect(ambiguous!.processingStatus).toBe('needs-review');
  });

  it('vergleicht den Betreff eines Zitats ohne Erlassstelle mit dem Bestandstitel ohne Ressortpräfix', () => {
    expect(subjectReading('Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Vereinbarung über Richtlinien für die Zusammenarbeit von Schule und Berufsberatung in Bayern')).toBe(
      'Vereinbarung über Richtlinien für die Zusammenarbeit von Schule und Berufsberatung in Bayern',
    );
    expect(subjectReading('Bekanntmachung über das Sachverständigenwesen')).toBe('Sachverständigenwesen');
    expect(subjectReading('Verordnung über die Zuständigkeit')).toBeUndefined();
    const stock = createStockIndex([{ area: 'vwv', path: 't', items: [{ documentId: 'BayVV_97977', title: 'Bek StMAS: Vereinbarung über Richtlinien für die Zusammenarbeit von Schule und Berufsberatung in Bayern' }] }]);
    // BayMBl. 2026 Nr. 379 hebt genau diese Vorschrift (zum 1. Oktober 2026) auf; das Portal führt sie.
    expect(
      resolveTarget(stock, {
        title: 'Bekanntmachung des Bayerischen Staatsministeriums für Arbeit und Sozialordnung, Familie und Frauen über die Vereinbarung über Richtlinien für die Zusammenarbeit von Schule und Berufsberatung in Bayern',
        enactmentDate: '2006-07-10',
        targetCitation: 'AllMBl. S. 252',
        terminating: true,
        addressesExistingNorm: true,
      }),
    ).toMatchObject({ status: 'resolved', sourceIdentity: 'BayVV_97977' });
  });

  it('erkennt die Fundstelle auch ohne Punkt hinter dem Blattnamen (BayMBl. 2025 Nr. 113)', () => {
    const text =
      '1. Die Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Landesentwicklung und Energie „Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung und Betriebsübernahme in der Vorgründungsphase (Richtlinie Vorgründungs- und Nachfolgecoaching)“ vom 13. November 2023 (BayMBl Nr. 580), die zuletzt durch Bekanntmachung vom 6. Juni 2024 (BayMBl. Nr. 290) geändert worden ist, wird aufgehoben.';
    const cited = scanCitations(text).find((entry) => entry.enactmentDate === '2023-11-13');
    expect(cited).toMatchObject({ citation: 'BayMBl Nr. 580' });
    expect(classifyCommand(commandWindow(text, cited!) ?? '')).toMatchObject({ eventType: 'repeal' });
    expect(citedNormKey({ targetIdentityHints: ['zitat-ausfertigung:2023-11-13', 'zitat-fundstelle:BayMBl Nr. 580'] })).toBe('2023-11-13|BayMBl|Nr|580');
    // Ohne Fundstellenmerkmal bleibt eine Klammer mit „BayMBl“ im Fließtext kein Zitat.
    expect(scanCitations('Die Hinweise (siehe BayMBler Bekanntmachung) gelten weiter.')).toEqual([]);
  });

  it('schreibt das Ende der abgelösten Vorschrift nicht die Befristung der neuen zu', () => {
    // BayMBl. 2025 Nr. 17, wörtlich: Die neue Richtlinie ist bis 2027 befristet, die alte endet 2024.
    const text =
      '1Diese Bekanntmachung tritt mit Wirkung vom 1. Januar 2025 in Kraft; sie tritt mit Ablauf des 31. Dezember 2027 außer Kraft. 2Die Feuerwehr-Zuwendungsrichtlinien vom 17. Dezember 2021 (BayMBl. 2022 Nr. 46), die durch Bekanntmachung vom 27. Juni 2023 (BayMBl. Nr. 337) geändert worden sind, treten mit Ablauf des 31. Dezember 2024 außer Kraft; sie bleiben jedoch für alle vor dem 1. Januar 2025 begonnenen Maßnahmen anwendbar.';
    const document = { organ: 'baymbl' as const, volume: 2025, position: 17, reference: 'BayMBl. 2025 Nr. 17', documentKind: 'Verwaltungsvorschrift', gliederungsnummern: ['2153-I'], title: 'Richtlinien für Zuwendungen des Freistaates Bayern zur Förderung des kommunalen Feuerwehrwesens (Feuerwehr-Zuwendungsrichtlinien – FwZR)', text, paragraphs: [text], hasTextLayer: true };
    const events = derivePublicationEvents(input({ organ: 'baymbl', volume: 2025, position: 17, title: document.title, publishedAt: '2025-01-15', enactmentDate: '2024-12-17', gliederungsnummern: ['2153-I'] }, document), STOCK);
    const expiry = events.find((event) => event.eventType === 'expire' && event.targetTitle === 'Feuerwehr-Zuwendungsrichtlinien')!;
    expect(expiry.terminationDate).toBe('2024-12-31');
    expect(endEffectiveDay(expiry)).toBe('2025-01-01');
    expect(isBaselineOnlyCandidate(expiry, EVALUATION_DATE)).toBe(true);
  });
});

/* --------------------------------------- Run 6: Typisierung der Befehle (`new` statt Änderung) */

/**
 * GVBl. 2024 S. 98 („Verordnung zur Anpassung des Landesrechts an die geltende Geschäftsverteilung“) ändert über
 * 100 Vorschriften mit Wortlautbefehlen. Hinter den Zitaten stand kein erkannter Befehl, und das Ereignis fiel auf die
 * Veröffentlichungsebene zurück: `new`, weil die Mantelverordnung selbst eine Verordnung ist. Die Texte unten sind
 * wörtliche Ausschnitte der Verkündungen (Quelle und SHA-256 der Detailseite je Fall).
 */
describe('Befehlserkennung: Wortlautbefehle, Aufzählungen, Satzklammer, neuer Wortlaut', () => {
  const documentOf = (organ: 'gvbl' | 'baymbl', volume: number, position: number, title: string, documentKind: string, gliederungsnummern: string[], text: string) => ({
    organ,
    volume,
    position,
    reference: `${volume} ${organ === 'gvbl' ? 'S.' : 'Nr.'} ${position}`,
    documentKind,
    gliederungsnummern,
    title,
    text,
    paragraphs: [text],
    hasTextLayer: true,
  });
  const citedIn = (text: string, needle: string) => scanCitations(text).find((entry) => entry.titleCandidates.some((candidate) => candidate.includes(needle)))!;

  // gvbl/2024-98 (SHA-256 39a30d71…), Abs. 17 und 57.
  const BESG =
    '(17) In Art. 98 Satz 1 des Bayerischen Besoldungsgesetzes (BayBesG) vom 5. August 2010 (GVBl. S. 410, 764, BayRS 2032-1-1-F), das zuletzt durch § 3 des Gesetzes vom 7. Juli 2023 (GVBl. S. 313) und durch die §§ 1 und 2 des Gesetzes vom 10. August 2023 (GVBl. S. 495) geändert worden ist, werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.';
  const AELFV =
    '(57) In § 1 Abs. 1 der Ämterverordnung-LM (AELFV) vom 16. Juni 2005 (GVBl. S. 199, BayRS 7801-2-L), die zuletzt durch § 2 der Verordnung vom 23. Juni 2023 (GVBl. S. 474) geändert worden ist, werden die Wörter „Staatsministeriums für Ernährung, Landwirtschaft und Forsten“ durch die Wörter „Staatsministeriums für Ernährung, Landwirtschaft, Forsten und Tourismus“ ersetzt.';

  it('erkennt Wortlautbefehle als Änderung, auch wenn sie länger sind als das Befehlsfenster', () => {
    expect(commandFor(BESG, citedIn(BESG, 'Besoldungsgesetzes'))).toMatchObject({ eventType: 'amend' });
    expect(commandFor(AELFV, scanCitations(AELFV).find((entry) => entry.bayRsNumber === '7801-2-L')!)).toMatchObject({ eventType: 'amend' });
    // gvbl/2024-570 (b73d765a…): Im neuen Wortlaut steht „wird“ – er ist kein Befehl.
    const kg =
      'In Art. 16 Abs. 2 Satz 1 des Kostengesetzes (KG) vom 20. Februar 1998 (GVBl. S. 43, BayRS 2013-1-1-F), das zuletzt durch Art. 10 des Gesetzes vom 21. April 2023 (GVBl. S. 128) geändert worden ist, werden nach dem Wort „wäre“ die Wörter „oder sie notwendig für eine Veranstaltung anfallen, die ehrenamtlich für das Gemeinwohl durchgeführt wird“ eingefügt.';
    expect(commandFor(kg, citedIn(kg, 'Kostengesetzes'))).toMatchObject({ eventType: 'amend' });
    // gvbl/2024-114 (c13f3169…): „… (BayRS 630-1-F) veröffentlichten bereinigten Fassung, die zuletzt …“.
    const bayho =
      'In Art. 65 Abs. 1 Nr. 4 der Bayerischen Haushaltsordnung (BayHO) in der in der Bayerischen Rechtssammlung (BayRS 630-1-F) veröffentlichten bereinigten Fassung, die zuletzt durch Art. 5 des Gesetzes vom 21. April 2023 (GVBl. S. 128) geändert worden ist, wird der Punkt am Ende durch die Wörter „ ; hierbei richtet sich der Nachhaltigkeitsbericht von kleinen und mittelgroßen Unternehmen allein nach dem Gesellschaftsvertrag, soweit nicht gesetzliche Vorschriften unmittelbar anwendbar sind.“ ersetzt.';
    expect(commandFor(bayho, scanCitations(bayho).find((entry) => entry.bayRsNumber === '630-1-F')!)).toMatchObject({ eventType: 'amend' });
  });

  it('typisiert die Einzeländerungen einer Mantelverordnung als Änderung, nicht als neue Vorschrift', () => {
    const text = `${BESG} ${AELFV}`;
    const events = derivePublicationEvents(
      input(
        { volume: 2024, position: 98, title: 'Verordnung zur Anpassung des Landesrechts an die geltende Geschäftsverteilung', publishedAt: '2024-06-14', enactmentDate: '2024-06-04', gliederungsnummern: ['2032-1-1-F', '7801-2-L'] },
        documentOf('gvbl', 2024, 98, 'Verordnung zur Anpassung des Landesrechts an die geltende Geschäftsverteilung', 'Verordnung', ['2032-1-1-F', '7801-2-L'], text),
      ),
      STOCK,
    );
    expect(events.map((event) => event.eventType)).toEqual(['amend', 'amend']);
    expect(events.every((event) => validateLedgerEvent(event).length === 0)).toBe(true);
  });

  it('liest den Befehl vor einer Aufzählung („treten außer Kraft: 1. …, 2. …“) und seine Frist', () => {
    // gvbl/2025-443 (b2ff1f46…), § 33 Abs. 2.
    const text =
      '(2) Mit Ablauf des 31. August 2025 treten außer Kraft: 1.die Prüfungsordnung für die Ergänzungsprüfung zum Erwerb der Fachhochschulreife (ErgPOFHR) vom 25. Mai 2001 (GVBl. S. 278, 456, BayRS 2236-6-1-5-K), die zuletzt durch § 1 Abs. 53 der Verordnung vom 4. Juni 2024 (GVBl. S. 98) geändert worden ist, sowie 2.die Begabtenprüfungsverordnung (BegPO) vom 12. August 1986 (GVBl. S. 265, BayRS 2235-4-1-K/WK), die zuletzt durch § 1 Abs. 228 der Verordnung vom 26. März 2019 (GVBl. S. 98) geändert worden ist. (3)';
    expect(commandFor(text, citedIn(text, 'Ergänzungsprüfung'))).toMatchObject({ eventType: 'expire', terminationDate: '2025-08-31' });
    expect(commandFor(text, citedIn(text, 'Begabtenprüfungsverordnung'))).toMatchObject({ eventType: 'expire', terminationDate: '2025-08-31' });
    // Das Zitat der Änderungshistorie („… Verordnung vom 4. Juni 2024 (GVBl. S. 98) geändert worden ist“) ist kein Glied.
    const history = scanCitations(text).find((entry) => entry.citation === 'GVBl. S. 98' && entry.enactmentDate === '2024-06-04');
    if (history) expect(commandFor(text, history)).toBeUndefined();
    // Ein neuer Absatz trennt: Was nach „(3)“ steht, gehört nicht mehr zur Aufzählung.
    const split = `${text} Die Verordnung über Beispiele (BspV) vom 1. Januar 2000 (GVBl. S. 1, BayRS 1-1-1-K) gilt fort.`;
    expect(listCommand(split, citedIn(split, 'Verordnung über Beispiele'))).toBeUndefined();
  });

  it('liest die Satzklammer „Mit Ablauf des … tritt die … außer Kraft“', () => {
    // gvbl/2025-246 (abbc6fe2…), Abs. 4.
    const text =
      '(4) Mit Ablauf des 31. Juli 2025 tritt die Ladenschlussverordnung (LSchlV) vom 21. Mai 2003 (GVBl. S. 340, BayRS 8050-20-1-A), die zuletzt durch Verordnung vom 14. September 2011 (GVBl. S. 442) geändert worden ist, außer Kraft.';
    expect(commandFor(text, citedIn(text, 'Ladenschlussverordnung'))).toMatchObject({ eventType: 'expire', terminationDate: '2025-07-31' });
    expect(bracketCommand('Am 1. März 2025 tritt die Bekanntmachung über Beispiele vom 1. Januar 2000 (AllMBl. S. 1) außer Kraft.', citedIn('Am 1. März 2025 tritt die Bekanntmachung über Beispiele vom 1. Januar 2000 (AllMBl. S. 1) außer Kraft.', 'Beispiele'), ' außer Kraft.')).toMatchObject({ terminationDate: '2025-02-28' });
  });

  it('nimmt ein Zitat im neuen Wortlaut nie als Gegenstand eines Befehls', () => {
    // baymbl/2026-356 (713a7fd2…): Die Neufassung der Schlussbestimmung zitiert die 2020 abgelöste Bekanntmachung.
    const text =
      '1.25 Nr. 4 wird wie folgt gefasst: „4. Schlussbestimmungen 1Diese Bekanntmachung tritt am 1. April 2020 in Kraft. 2Mit Ablauf des 31. März 2020 tritt die Bekanntmachung des Staatsministeriums für Unterricht und Kultus zu offenen Ganztagsangeboten an Schulen für Schülerinnen und Schüler ab Jahrgangsstufe 5 vom 12. April 2018 (KWMBl. S. 167) außer Kraft.“';
    const cited = scanCitations(text).find((entry) => entry.enactmentDate === '2018-04-12')!;
    expect(insideQuote(text, cited.end)).toBe(true);
    expect(commandFor(text, cited)).toBeUndefined();
    expect(maskQuoted('werden die Wörter „… wird aufgehoben“ eingefügt')).toBe('werden die Wörter „…“ eingefügt');
  });

  it('macht aus einer Berichtigung keine Änderung und aus einer bloßen Bezugnahme kein `new` der zitierten Vorschrift', () => {
    expect(classifyCommand(' wird wie folgt berichtigt: In Nr. 4.2 wird die Angabe „x“ durch die Angabe „y“ ersetzt.')).toMatchObject({ eventType: 'correction' });
    // baymbl/2025-209 (7f12b392…): eine neue Bekanntmachung, die die Realschulordnung nur nennt.
    const text = '1. 1Die nach der Realschulordnung (RSO) vom 18. Juli 2007 (GVBl. S. 458, 585, BayRS 2234-2-K) zu erteilenden Jahres- und Zwischenzeugnisse sind nach den Mustern der Anlage auszustellen.';
    const events = derivePublicationEvents(
      input(
        { organ: 'baymbl', volume: 2025, position: 209, title: 'Vollzug der Schulordnung für die Realschulen in Bayern; hier: Zeugnismuster für die Realschulen', publishedAt: '2025-04-09', enactmentDate: '2025-03-24', gliederungsnummern: ['2234-2-K'] },
        documentOf('baymbl', 2025, 209, 'Vollzug der Schulordnung für die Realschulen in Bayern; hier: Zeugnismuster für die Realschulen', 'Verwaltungsvorschrift', ['2234-2-K'], text),
      ),
      STOCK,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'new' });
    expect(events[0]!.targetIdentityHints.some((hint) => hint.startsWith('zitat-'))).toBe(false);
    expect(events[0]!.targetTitle).not.toBe('Realschulordnung');
  });

  it('ordnet ein Zitat ohne BayRS-Nummer der Gliederungsnummer der Veröffentlichung zu (Datum und Titel aus dem Bestand)', () => {
    // gvbl/2024-114 Art. 13 Abs. 3: Das HG 2022 wird ohne BayRS-Nummer zitiert; die Veröffentlichung führt 630-2-24-F.
    const stock = createStockIndex([
      {
        area: 'landesrecht',
        path: 't',
        items: [
          { documentId: 'BayHG2022', title: 'Gesetz über die Feststellung des Haushaltsplans des Freistaates Bayern für das Haushaltsjahr 2022 (Haushaltsgesetz 2022 – HG 2022) vom 22. April 2022 (GVBl. S. 102)', bayRsNumber: '630-2-24-F' },
          { documentId: 'BayHG2024_2025', title: 'Gesetz über die Feststellung des Haushaltsplans des Freistaates Bayern für die Haushaltsjahre 2024 und 2025 (Haushaltsgesetz 2024/2025 – HG 2024/2025) vom 21. Juni 2024 (GVBl. S. 114)', bayRsNumber: '630-2-26-F' },
        ],
      },
    ]);
    const title = 'Gesetz über die Feststellung des Haushaltsplans des Freistaates Bayern für die Haushaltsjahre 2024 und 2025 (Haushaltsgesetz 2024/2025 – HG 2024/2025)';
    const text = '(3) In Art. 13 Abs. 3 des Haushaltsgesetzes 2022 (HG 2022) vom 22. April 2022 (GVBl. S. 102) wird die Angabe „31. Dezember 2045“ durch die Angabe „31. Dezember 2023“ ersetzt.';
    const events = derivePublicationEvents(
      input({ volume: 2024, position: 114, title, publishedAt: '2024-06-28', enactmentDate: '2024-06-21', gliederungsnummern: ['630-2-26-F', '630-2-24-F'] }, documentOf('gvbl', 2024, 114, title, 'Gesetz', ['630-2-26-F', '630-2-24-F'], text)),
      stock,
    );
    const hg2022 = events.find((event) => event.targetResolution.sourceIdentity === 'BayHG2022')!;
    expect(hg2022).toMatchObject({ eventType: 'amend' });
    expect(hg2022.targetIdentityHints).toContain('zitat-ausfertigung:2022-04-22');
    expect(events.find((event) => event.targetResolution.sourceIdentity === 'BayHG2024_2025')).toMatchObject({ eventType: 'new' });
  });

  it('trennt Ausfertigungsdatum und Aktenzeichen vom Titel', () => {
    // baymbl/2025-89 (Teil 1 Nr. 2): Zitat nur mit Erlassstelle, Datum und Aktenzeichen vor der Fundstelle.
    const fiabg =
      'Gleichzeitig tritt die Bekanntmachung des Bayerischen Staatsministeriums für Ernährung, Landwirtschaft und Forsten vom 31. Januar 2022, Az. Z5-7971.1-1/18 (BayMBl. Nr. 125), außer Kraft.';
    const [cited] = scanCitations(fiabg);
    expect(cited).toMatchObject({ enactmentDate: '2022-01-31', citation: 'BayMBl. Nr. 125' });
    expect(cited!.titleCandidates.every((candidate) => !/vom|Az\./u.test(candidate))).toBe(true);
    // baymbl/2024-196 Nr. 12.1: Einzelwort auf „-vereinbarung“ als Titel, Aktenzeichen mit Leerzeichen.
    const dv = 'Gleichzeitig tritt die Dienstvereinbarung vom 25. Mai 2022, Az. F7 - 2500 - VIIa - 3086/2015 (BayMBl. 2022 Nr. 410), außer Kraft.';
    expect(scanCitations(dv)[0]).toMatchObject({ title: 'Dienstvereinbarung', enactmentDate: '2022-05-25', citation: 'BayMBl. 2022 Nr. 410' });
  });
});
