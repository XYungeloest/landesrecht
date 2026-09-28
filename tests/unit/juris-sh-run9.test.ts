/**
 * juris-SH-Adapter, Run 9: Tabellen mit umbrochenen Zellen (Spaltenraster aus einer Kopfzeile, Zeilen mit einer
 * belegten Spalte, nummerierte Zeilen, Fließtext mit rechtsbündiger Zahl), Erlassorgane (gemeinsame Verordnung,
 * Namensvarianten, Normgeber), Registerbelege (Beendigung mit späterer Änderung, Ausgabe vor der Änderung),
 * historische Einzelfassungen (Anlagen als Nummernräume, abgelöste Ketten, Ressort-Zwillinge, verkündete vor
 * rückwirkender Fassung) und Verzeichnisabgleich (römische Artikel, Bereiche, Einheiten in Anlagen). Synthetisch,
 * kein Netz.
 */
import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { buildBody, parseJurisPdf, wrappedGrid, type ParsedJurisPdf, type ParseFinding, type RelocatedLine } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import { buildLayout, type PdfLayout, type PdfLine, type PdfPageGeometry, type PdfWord } from '@landesrecht/importer-juris-sh/parse/pdf-layout.ts';
import { classifyEdition } from '@landesrecht/importer-juris-sh/parse/source-law.ts';
import { baselineEvidence, type LedgerMatch } from '@landesrecht/importer-juris-sh/pipeline/baseline-evidence.ts';
import type { DocumentResult } from '@landesrecht/importer-juris-sh/pipeline/document.ts';
import { consistencyProblems, maskOrganNames, segmentByAnnex, selectBaselineUnits, tocOrderProblems, type UnitVersion } from '@landesrecht/importer-juris-sh/pipeline/historical.ts';
import type { LedgerEvent } from '@landesrecht/importer-juris-sh/events/ledger.ts';
import { extractSourceOrgans, organCore, organKey } from '@landesrecht/importer-juris-sh/transform/organs.ts';

/* ------------------------------------------------------------------------------------------------ */
/* Zeilen und Raster                                                                                */

const H = 15.8;

function line(y: number, gapBefore: number, segments: Array<[number, number, string]>, over: Partial<PdfLine> = {}): PdfLine {
  const text = segments.map(([, , value]) => value).join(' ');
  return { page: 1, index: y, x0: segments[0]![0], x1: segments.at(-1)![1], y0: y - H, y1: y, height: H, segments: segments.map(([x0, x1, value]) => ({ x0, x1, text: value })), text, superscripts: [], plainText: text, gapBefore, ...over };
}

/** Satzspiegel wie die juris-Ausgabe: Zeilenabstand -1 (Kästen überlappen), Absatzabstand 2,2. */
function layoutOf(lines: PdfLine[]): PdfLayout {
  return { pages: [{ page: 1, width: 595.3, height: 841.9 }], lines, bodyHeight: H, left: 77, right: 537.7, lineGap: -1, paragraphGap: 2.2 };
}

const cells = (table: NormBodyBlock): string[][] => table.children!.map((row) => row.children!.map((cell) => cell.text ?? ''));

describe('Run 9: Tabellen mit umbrochenen Zellen', () => {
  it('trägt das Raster aus einer einzigen Kopfzeile; Werte in zunächst leeren Spalten füllen die Zeile', () => {
    const lines = [
      line(100, 6, [[100, 183, 'Verfahrensschritte'], [355, 428, 'Regelfristen/Soll'], [489, 500, 'Ist']]),
      line(115, 8, [[100, 336, 'Beteiligung der durch das Vorhaben fachlich berühr-']]),
      line(130, -1, [[100, 311, 'ten Behörden, zeitgleich Auslegung'], [355, 400, '7 Wochen']]),
      line(145, 8, [[100, 335, 'Zusätzliche Einwendungsfrist (§ 10 Abs. 3 BImSchG)']]),
      line(160, -1, [[355, 407, '(2 Wochen)']]),
      line(175, 8, [[100, 273, 'Auslegungsfrist (§ 10 Abs. 3 BImSchG)'], [355, 398, '(1 Monat)']]),
      line(220, 36, [[77, 482, '2. für Verfahren ohne öffentliche Bekanntmachung']]),
    ];
    const result = wrappedGrid(lines, 0, layoutOf(lines));
    expect('table' in result).toBe(true);
    if (!('table' in result)) return;
    expect(result.end).toBe(6);
    expect(cells(result.table)).toEqual([
      ['Verfahrensschritte', 'Regelfristen/Soll', 'Ist'],
      ['Beteiligung der durch das Vorhaben fachlich berührten Behörden, zeitgleich Auslegung', '7 Wochen', ''],
      ['Zusätzliche Einwendungsfrist (§ 10 Abs. 3 BImSchG)', '(2 Wochen)', ''],
      ['Auslegungsfrist (§ 10 Abs. 3 BImSchG)', '(1 Monat)', ''],
    ]);
  });

  it('nimmt eine Zeile mit nur einer belegten Spalte im Zeilenraster („Kreisfreie Städte“) und eine Kopfzelle über der Datenspalte', () => {
    const lines = [
      line(100, 21, [[81, 119, 'Schl.-Nr.'], [150, 197, 'Gemeinde'], [476, 537, 'Schlüsselzahl']]),
      line(121, 21, [[150, 237, 'Kreisfreie Städte']]),
      line(142, 21, [[81, 92, '01'], [150, 224, 'Flensburg, Stadt'], [482, 537, '0,0 248 291']]),
      line(163, 21, [[81, 92, '02'], [150, 254, 'Kiel, Landeshauptstadt'], [482, 537, '0,0 767 796']]),
      line(184, 21, [[150, 263, 'Summe Kreisfreie Städte'], [482, 537, '0,1 015 087']]),
      line(205, 21, [[81, 93, '51'], [150, 250, 'Kreis Dithmarschen']]),
      line(226, 21, [[81, 98, '001'], [150, 197, 'Albersdorf'], [482, 537, '0,0 009 296']]),
    ];
    const result = wrappedGrid(lines, 0, layoutOf(lines));
    expect('table' in result).toBe(true);
    if (!('table' in result)) return;
    expect(cells(result.table)).toEqual([
      ['Schl.-Nr.', 'Gemeinde', 'Schlüsselzahl'],
      ['', 'Kreisfreie Städte', ''],
      ['01', 'Flensburg, Stadt', '0,0 248 291'],
      ['02', 'Kiel, Landeshauptstadt', '0,0 767 796'],
      ['', 'Summe Kreisfreie Städte', '0,1 015 087'],
      ['51', 'Kreis Dithmarschen', ''],
      ['001', 'Albersdorf', '0,0 009 296'],
    ]);
  });

  it('nimmt nummerierte Zeilen („1.1 | … | bis 250“) in eine Tabelle mit mindestens drei Spalten', () => {
    const lines = [
      line(100, 21, [[84, 129, 'Tarifstelle'], [163, 257, 'Gebührentatbestand'], [513, 534, 'Euro']]),
      line(121, 21, [[84, 90, '1'], [163, 208, 'Auskünfte']]),
      line(142, 21, [[84, 98, '1.1'], [163, 433, 'Erteilung mündlicher Auskünfte,'], [475, 534, 'gebührenfrei']]),
      line(157, -1, [[163, 420, 'ggf. auch mit Herausgabe von Duplikaten']]),
      line(178, 21, [[84, 98, '1.2'], [163, 417, 'Erteilung einer umfassenden Auskunft'], [501, 534, 'bis 250']]),
    ];
    const result = wrappedGrid(lines, 0, layoutOf(lines));
    expect('table' in result).toBe(true);
    if (!('table' in result)) return;
    expect(cells(result.table)).toEqual([
      ['Tarifstelle', 'Gebührentatbestand', 'Euro'],
      ['1', 'Auskünfte', ''],
      ['1.1', 'Erteilung mündlicher Auskünfte, ggf. auch mit Herausgabe von Duplikaten', 'gebührenfrei'],
      ['1.2', 'Erteilung einer umfassenden Auskunft', 'bis 250'],
    ]);
  });

  it('lehnt einen Formularsatz mit Lücken ab: eine Zeile über alle Spalten und nur eine mehrzellige Zeile sind kein Raster', () => {
    const lines = [
      line(100, 17, [[78, 167, 'als Arbeitnehmer/in']]),
      line(117, 17, [[78, 272, 'wird in Ergänzung zum Arbeitsvertrag vom'], [286, 344, 'geschlossen:'], [382, 515, 'folgende Zusatzvereinbarung']]),
      line(147, 30, [[302, 315, '§ 1']]),
    ];
    const result = wrappedGrid(lines, 1, layoutOf(lines));
    expect(result).toEqual({ rejection: 'single-row' });
  });

  it('nennt in der Ablehnung die Zeile, an der sie entstand', () => {
    const lines = [
      line(100, 21, [[84, 129, 'Kostentarif']], { x0: 280, x1: 337, segments: [{ x0: 280, x1: 337, text: 'Kostentarif' }] }),
      line(121, 21, [[84, 129, 'Tarifstelle'], [163, 257, 'Gebührentatbestand'], [513, 534, 'Euro']]),
      line(142, 21, [[84, 98, '1.1'], [163, 433, 'Erteilung mündlicher Auskünfte,'], [475, 534, 'gebührenfrei']]),
      line(157, -1, [[163, 420, 'ggf. auch mit Herausgabe von Duplikaten']]),
      line(178, 21, [[84, 98, '1.2'], [163, 417, 'Erteilung einer umfassenden Auskunft'], [501, 534, 'bis 250']]),
    ];
    const withTitle = wrappedGrid(lines, 1, layoutOf(lines));
    expect(withTitle).toMatchObject({ rejection: 'header-unassigned' });
    expect((withTitle as { detail?: string }).detail).toMatch(/Kostentarif/u);
    const withoutTitle = wrappedGrid(lines, 1, layoutOf(lines), { lookbehind: false });
    expect('table' in withoutTitle).toBe(true);
  });
});

function body(lines: PdfLine[]): { blocks: NormBodyBlock[]; findings: ParseFinding[] } {
  const findings: ParseFinding[] = [];
  const reorders: RelocatedLine[] = [];
  const blocks = buildBody(lines, layoutOf(lines), findings, false, [], reorders);
  return { blocks, findings };
}

const tables = (blocks: NormBodyBlock[]): NormBodyBlock[] => blocks.flatMap((block) => [...(block.type === 'table' ? [block] : []), ...(block.children ? tables(block.children) : [])]);

describe('Run 9: Fließtext mit rechtsbündiger Zahl, Überschriften vor Tabellen', () => {
  it('eine mehrspaltige Zeile, deren erste Spalte klein geschrieben den Satz der Zeile davor fortsetzt, ist keine Tabellenzeile', () => {
    const lines = [
      line(100, 18, [[61, 522, '3. Für Studienrätinnen und Studienräte an Gymnasien beträgt die regelmäßige wöchentliche Pflicht-']]),
      line(114, -4, [[81, 136, 'stundenzahl'], [551, 574, '25,5.']]),
      line(132, 18, [[61, 507, '4. Für andere Lehrkräfte an Gymnasien beträgt die regelmäßige wöchentliche Pflichtstundenzahl'], [559, 574, '27.']]),
      line(150, 18, [[81, 376, 'Bei Einsatz an der Oberstufe gilt Nummer 2 Satz 3 entsprechend.']]),
    ];
    const { blocks, findings } = body(lines);
    expect(tables(blocks)).toEqual([]);
    expect(findings.map((finding) => finding.code)).toContain('table-text-continuation');
    expect(findings.map((finding) => finding.code)).not.toContain('table-layout');
  });

  it('eine Zahlenzeile unter einer getrennt endenden Zellenbezeichnung setzt keinen Satz fort', () => {
    const lines = [
      line(100, 8, [[100, 300, 'Wohngebäude mit Ge-']]),
      line(114, -1, [[320, 340, '83'], [400, 450, '97,28'], [480, 540, '101,59']]),
      line(140, 26, [[77, 300, 'Die Beträge gelten je Quadratmeter.']]),
    ];
    expect(body(lines).findings.map((finding) => finding.code)).not.toContain('table-text-continuation');
  });

  it('eine Gliederungsüberschrift oder eine Linie vor einer Tabelle ist keine Tabellenzeile außerhalb des Rasters', () => {
    const lines = [
      line(100, 27, [[83, 141, 'Sechster Teil']]),
      line(114, -1, [[83, 188, 'Verwaltung des Kreises'], [431, 462, '22 - 56']]),
      line(141, 27, [[83, 180, '1. Abschnitt: Kreistag'], [431, 462, '22 - 42']]),
      line(168, 27, [[83, 175, '2. Abschnitt: Beiräte'], [431, 474, '42a - 42b']]),
      line(200, 27, [[83, 145, 'Siebenter Teil']]),
    ];
    const { blocks, findings } = body(lines);
    expect(tables(blocks)).toHaveLength(1);
    expect(findings.map((finding) => finding.code)).not.toContain('table-layout');
    const ruled = [
      line(100, 5, [[114, 163, '___________']]),
      line(115, 0, [[115, 120, '*'], [159, 485, 'alternativ Wechselladerfahrzeuge (WLF) mit Abrollbehälter (AB) möglich']]),
      line(130, 4, [[115, 124, '**'], [159, 332, 'Feuerwehranhänger mit 250 kg Pulver']]),
      line(160, 30, [[77, 152, '3.1.3 Personal']]),
    ];
    expect(body(ruled).findings.map((finding) => finding.code)).not.toContain('table-layout');
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* Erlassorgane                                                                                     */

const text = (value: string): NormBodyBlock => ({ type: 'paragraphText', text: value });

describe('Run 9: Erlassorgane', () => {
  it('führt eine gemeinsame Verordnung auf alle Organe zurück, deren Formeln Vorschriften zuweisen', () => {
    const organs = extractSourceOrgans({ blocks: [
      text('Aufgrund des § 17 Abs. 1 des Landesnaturschutzgesetzes verordnet der Minister für Natur und Umwelt die folgenden §§ 1 bis 8 mit Ausnahme des § 5 Abs. 1 Nr. 1;'),
      text('aufgrund des § 39 Abs. 1 Nr. 8 des Landesjagdgesetzes verordnet der Minister für Ernährung, Landwirtschaft, Forsten und Fischereiden folgenden § 5 Abs. 1 Nr. 1 und § 8:'),
    ] });
    expect(organs.conflict).toBe(false);
    expect(organs.resolution).toBe('joint-enactment');
    expect(organs.enactingBody?.name).toBe('Minister für Natur und Umwelt und Minister für Ernährung, Landwirtschaft, Forsten und Fischerei');
    const plural = extractSourceOrgans({ blocks: [
      text('Aufgrund des § 137 des Landeswassergesetzes verordnet das Ministerium für Wirtschaft, Arbeit, Verkehr und Technologie für den örtlichen Geltungsbereich nach § 3 Absatz 1 Nummer 1 die §§ 1, 2 und 4 bis 6 und'),
      text('aufgrund § 36 Absatz 2 des Gesetzes über Ordnungswidrigkeiten verordnen das Ministerium für Wirtschaft, Arbeit, Verkehr und Technologie und das Ministerium für Energiewende, Landwirtschaft, Umwelt und ländliche Räume im Rahmen ihrer jeweiligen Zuständigkeit nach Nummer 1 und 2 die folgenden §§ 17 und 19:'),
    ] });
    expect(plural.resolution).toBe('joint-enactment');
    expect(plural.enactingBody?.name).toBe('Ministerium für Wirtschaft, Arbeit, Verkehr und Technologie und Ministerium für Energiewende, Landwirtschaft, Umwelt und ländliche Räume');
    // Ohne Zuweisung von Vorschriften bleibt der Widerspruch.
    const conflict = extractSourceOrgans({ blocks: [text('Es verordnet das Ministerium für Inneres:'), text('Es verordnet das Ministerium für Justiz:')] });
    expect(conflict.conflict).toBe(true);
    expect(conflict.enactingBody).toBeUndefined();
  });

  it('erkennt dasselbe Organ in Varianten (Zusatz, Landeszusatz, Kopfwort) und entscheidet sonst über den Normgeber', () => {
    const same = extractSourceOrgans({ blocks: [
      text('Bekanntmachung des Ministeriums für Soziales Gesundheit und Verbraucherschutz'),
      text('Aufgrund des § 47 des Berufsbildungsgesetzes erlässt das Ministerium für Soziales, Gesundheit und Verbraucherschutz des Landes Schleswig-Holstein als zuständige Stelle nach §§ 46 Satz 1, 47 BBiG folgende Prüfungsordnung:'),
    ] });
    expect(same.conflict).toBe(false);
    expect(same.resolution).toBe('same-organ');
    expect(same.enactingBody?.name).toBe('Ministerium für Soziales Gesundheit und Verbraucherschutz');
    expect(organCore('Ministerium für Soziales, Gesundheit und Verbraucherschutz des Landes Schleswig-Holstein als zuständige Stelle nach §§ 46 Satz 1')).toBe('Ministerium für Soziales, Gesundheit und Verbraucherschutz des Landes Schleswig-Holstein');
    expect(organKey('Ministerin für Natur und Umwelt')).toBe(organKey('Ministerium für Natur und Umwelt'));
    expect(organKey('Kultusminister')).not.toBe(organKey('Ministerpräsident'));
    const heads = [text('Bekanntmachung des Kultusministers vom 15. September 1952'), text('Bekanntmachung des Ministeriums für Bildung, Wissenschaft, Forschung und Kultur vom 11. März 2005')];
    const withNormgeber = extractSourceOrgans({ blocks: heads, normgeber: 'Ministerium für Bildung, Wissenschaft, Forschung und Kultur' });
    expect(withNormgeber.resolution).toBe('normgeber');
    expect(withNormgeber.enactingBody?.name).toBe('Ministerium für Bildung, Wissenschaft, Forschung und Kultur');
    expect(extractSourceOrgans({ blocks: heads }).conflict).toBe(true);
    expect(extractSourceOrgans({ blocks: heads, normgeber: 'Staatskanzlei' }).conflict).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* Registerbelege                                                                                   */

let counter = 0;
const event = (overrides: Partial<LedgerEvent>): LedgerEvent => ({
  id: `e-${(counter += 1)}`,
  eventType: 'amend',
  eventDate: '2020-06-11',
  targetTitle: 'Landesverordnung über Testfälle',
  targetGliederungsnummer: '2122-5-18',
  targetIdentityHints: [],
  citation: 'GVOBl. S. 349',
  sourceId: 'gvobl-systematische-uebersicht',
  sourceUrl: 'https://example.invalid/register.pdf',
  sourceSha256: 'd'.repeat(64),
  sourcePage: 86,
  sourceLine: 1,
  organ: 'gvobl',
  excerpt: '§ 19 geänd.',
  evidenceStrength: 'strong',
  confidence: 1,
  processingStatus: 'recorded',
  ...overrides,
});
const matched = (...events: LedgerEvent[]): LedgerMatch[] => events.map((entry) => ({ event: entry, basis: 'gliederungsnummer-eindeutig' as const }));

const result = (overrides: Partial<DocumentResult>): DocumentResult => ({
  documentId: 'jlr-NNLSH0000TEST',
  area: 'landesrecht',
  outcome: 'import-ready',
  reasons: [],
  blockers: [],
  warnings: [],
  findings: [],
  baseline: { class: 'unchanged-since-baseline', basis: 'alle Einheiten gültig spätestens ab 2019-01-01' },
  source: { gliederungsnummer: '2122-5-18', documentDates: ['2015-07-16'], latestUnitFrom: '2019-01-01', editionCurrentAsOf: '2026-09-18' },
  raw: { url: 'https://example.invalid/x.pdf', sha256: 'a'.repeat(64), byteLength: 1, retrievedAt: '2026-09-18T10:00:00.000Z' },
  ...overrides,
});

describe('Run 9: Registerbelege', () => {
  it('ein Ende, dem das Register eine spätere inhaltliche Änderung derselben Norm zuordnet, trägt nur noch stützend', () => {
    const end = event({ eventType: 'expire', eventDate: '2015-07-31', excerpt: 'außer Kraft 31.7.2015 (Art. 9 Ges. v. 16.7.2015)' });
    const later = event({ eventDate: '2020-06-11' });
    const evidence = baselineEvidence(result({}), matched(end, later));
    expect(evidence.assessment).toMatchObject({ status: 'active-at-baseline', rule: 'B-strong-begin-and-continuity' });
    const ending = evidence.evidence.find((item) => item.dimension === 'end');
    expect(ending).toMatchObject({ strength: 'supporting' });
    expect(ending?.statement).toMatch(/kein vollständiges Ende/u);
    // Nur Ressortbezeichnungen ersetzt (auch ohne Untertyp): keine inhaltliche Änderung, das Ende bleibt stark.
    const collective = event({ eventDate: '2001-02-13', excerpt: 'Zuständigkeiten und Ressortbezeichnngen ersetzt durch LVO v. 13.2.2001' });
    const old = result({ source: { gliederungsnummer: 'B 231-0-1', documentDates: ['1972-02-14'], latestUnitFrom: '2003-01-01', editionCurrentAsOf: '2026-09-18' } });
    expect(baselineEvidence(old, matched(event({ eventType: 'expire', eventDate: '1987-08-21', excerpt: 'außer Kraft (Weitergeltung der §§ 1 und 2 Abs. 1)' }), collective)).assessment.status).toBe('undetermined');
  });

  it('ein Ende vor der vorliegenden Fassung betrifft eine frühere Fassung derselben Gliederungsnummer', () => {
    const vwv = result({ area: 'vwv', baseline: { class: 'unchanged-since-baseline', basis: 'Fassung vom 2016-07-11' }, source: { gliederungsnummer: '7911.81', documentDates: ['2006-06-06'], versionDate: '2016-07-11', headerValidFrom: '2016-11-21', editionCurrentAsOf: '2026-09-18' } });
    const repeal = event({ eventType: 'repeal', eventDate: '2016-07-11', organ: 'amtsblatt', sourceId: 'ab-erlassverzeichnis', excerpt: 'aufgeh. Anl. 1 Bek. v. 11.7.2016' });
    const evidence = baselineEvidence(vwv, matched(repeal));
    expect(evidence.assessment.status).toBe('active-at-baseline');
    expect(evidence.evidence.find((item) => item.dimension === 'end')?.statement).toMatch(/frühere Fassung/u);
  });

  it('eine Änderung nach dem Stichtag widerspricht einer VwV-Ausgabe nicht, deren Fassung vor der Änderung liegt', () => {
    const vwv = result({ area: 'vwv', baseline: { class: 'unchanged-since-baseline', basis: 'Fassung vom 2008-05-29' }, source: { gliederungsnummer: '925.3', documentDates: ['2008-05-29'], versionDate: '2008-05-29', headerValidFrom: '2008-05-29', headerValidTo: '2028-12-31' } });
    const later = event({ eventDate: '2023-12-04', organ: 'amtsblatt', sourceId: 'ab-erlassverzeichnis', excerpt: 'Weitergeltung der Befristung Bek. v. 4.12.2023' });
    const evidence = baselineEvidence(vwv, matched(later));
    expect(evidence.contradictions).toEqual([]);
    expect(evidence.assessment.status).toBe('active-at-baseline');
    // Landesrecht: die heutige Ausgabe zeigt keine Einheit nach dem Stichtag – die Registeränderung bleibt ein Widerspruch.
    const contradicted = baselineEvidence(result({}), matched(event({ eventDate: '2024-03-01' })));
    expect(contradicted.contradictions).toHaveLength(1);
    expect(contradicted.assessment.status).toBe('undetermined');
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* Historische Einzelfassungen                                                                       */

const unit = (nn: number, key: string, options: { from?: string; to?: string; version?: string; text?: string } = {}): UnitVersion => ({
  documentId: `jlr-NNLSH0000TESTNN${String(nn).padStart(11, '0')}`,
  nn,
  key,
  ...(options.from ? { validFrom: options.from } : {}),
  ...(options.to ? { validTo: options.to } : {}),
  ...(options.version ? { versionDate: options.version } : {}),
  parsed: { body: [{ type: 'paragraphText', text: options.text ?? key }], title: 'Testgesetz Vom 1. Januar 2020', header: {} } as never,
  layout: {} as never,
  raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
});

describe('Run 9: historische Einzelfassungen', () => {
  it('Anlagen eröffnen eigene Nummernräume; ein § hinter der Anlage, der die Hauptzählung fortsetzt, gehört zum Hauptteil', () => {
    const annex = selectBaselineUnits([unit(1, '§ 1', { from: '2003-01-01' }), unit(2, '§ 2', { from: '2003-01-01' }), unit(3, 'Anlage (zu § 2)', { from: '2003-01-01' }), unit(4, '§ 1', { from: '2003-01-01' }), unit(5, '§ 2', { from: '2003-01-01' })]);
    expect(annex.problems).toEqual([]);
    expect(annex.selected.map((entry) => entry.nn)).toEqual([1, 2, 3, 4, 5]);
    const trailing = selectBaselineUnits([unit(1, 'Eingangsformel', { from: '2023-09-15' }), unit(2, '§ 1', { from: '2023-09-15' }), unit(3, '§ 2', { from: '2023-09-15' }), unit(4, 'Anlage', { from: '2023-09-15' }), unit(5, '§ 3', { from: '2023-09-15' })]);
    expect(trailing.problems).toEqual([]);
    expect(trailing.selected.map((entry) => entry.key)).toEqual(['Eingangsformel', '§ 1', '§ 2', '§ 3', 'Anlage']);
    expect(trailing.notes.some((note) => /Hauptteil/u.test(note))).toBe(true);
    expect(segmentByAnnex([unit(1, '§ 1'), unit(2, 'Anlage 1'), unit(3, 'Artikel 1'), unit(4, 'Anlage 2'), unit(5, 'Artikel 1')]).map((segment) => segment.map((entry) => entry.key))).toEqual([['§ 1'], ['Anlage 1', 'Artikel 1'], ['Anlage 2', 'Artikel 1']]);
  });

  it('eine in einer anderen Kette ohne Ende weitergeführte Fassung ist durch die jüngere abgelöst', () => {
    const selection = selectBaselineUnits([unit(184, '§ 51', { from: '2022-06-07', version: '2022-04-27' }), unit(220, '§ 58', { from: '2022-06-07', version: '2022-04-27' }), unit(223, '§ 51', { from: '2022-06-07', version: '2020-09-01' })]);
    expect(selection.problems).toEqual([]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([184, 220]);
    expect(selection.notes.some((note) => /abgelöst/u.test(note))).toBe(true);
    // Beide mit eigenem Ende oder die ältere als jüngste Fassung: Befund.
    expect(selectBaselineUnits([unit(1, '§ 1', { from: '2020-01-01', version: '2019-12-01', to: '2025-01-01' }), unit(3, '§ 2', { from: '2020-01-01' }), unit(5, '§ 1', { from: '2021-01-01', version: '2020-12-01' })]).problems[0]).toMatch(/Bezeichnung § 1/u);
  });

  it('Ressort-Zwillinge: die datierte Fassung trägt die neue Ressortbezeichnung, der offene Zwilling entfällt', () => {
    const closed = unit(12, '§ 1', { from: '2023-11-17', to: '2025-11-14', version: '2023-10-27', text: '§ 1 (1) Das Ministerium für Energiewende, Klimaschutz, Umwelt und Natur ist zuständig für die Aufgaben nach § 21a ChemG.' });
    const open = unit(13, '§ 1', { from: '2023-11-17', version: '2023-10-27', text: '§ 1 (1) Das Ministerium für Energiewende, Landwirtschaft, Umwelt, Natur und Digitalisierung ist zuständig für die Aufgaben nach § 21a ChemG.' });
    const selection = selectBaselineUnits([closed, open]);
    expect(selection.problems).toEqual([]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([12]);
    expect(selection.notes[0]).toMatch(/Ressortbezeichnungen/u);
    expect(maskOrganNames('Das Ministerium für Inneres, ländliche Räume und Integration prüft.')).toBe('Das ⟨Organ⟩ prüft.');
    // Andere Unterschiede bleiben ein Befund.
    const other = unit(14, '§ 1', { from: '2023-11-17', version: '2023-10-27', text: '§ 1 (1) Das Ministerium für Energiewende, Klimaschutz, Umwelt und Natur ist zuständig für die Aufgaben nach § 22 ChemG.' });
    expect(selectBaselineUnits([closed, other]).problems[0]).toMatch(/2 Fassungen gelten zugleich/u);
    // Zwei offene Zwillinge: die in der heutigen Ausgabe enthaltene Fassung ist die nachgeführte.
    const a = unit(18, '§ 10', { from: '2023-11-17', version: '2023-10-27', text: '§ 10 Alter Text.' });
    const b = unit(19, '§ 10', { from: '2023-11-17', version: '2023-10-27', text: '§ 10 Neuer Text.' });
    expect(selectBaselineUnits([a, b]).problems).toHaveLength(1);
    expect(selectBaselineUnits([a, b], undefined, { frameText: '§ 10 Neuer Text.' }).selected.map((entry) => entry.nn)).toEqual([19]);
  });

  it('wählt unter gleichzeitig beginnenden Fassungen die am Stichtag verkündete, nicht die rückwirkende', () => {
    const selection = selectBaselineUnits([unit(10, '§ 8', { from: '2023-01-01', version: '2023-12-15' }), unit(11, '§ 8', { from: '2023-01-01', version: '2023-03-22' }), unit(12, '§ 8', { from: '2023-01-01', version: '2023-09-21' })]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([12]);
    expect(selection.notes[0]).toMatch(/rückwirkende Fassung vom 2023-12-15/u);
    expect(consistencyProblems(selection.selected, { title: 'Testgesetz Vom 1. Januar 2020' })).toEqual([]);
    // Eine Fassung ohne „Gültig ab“, älter als die datierte Stichtagsfassung, ist überholt.
    const stale = selectBaselineUnits([unit(3, 'Inhaltsübersicht:', { from: '2020-05-01', to: '2025-12-16', version: '2020-03-19' }), unit(5, 'Inhaltsübersicht:', { version: '2016-06-10' })]);
    expect(stale.problems).toEqual([]);
    expect(stale.selected.map((entry) => entry.nn)).toEqual([3]);
  });

  it('prüft die Reihenfolge gegen das Verzeichnis der heutigen Ausgabe und lässt Einheitentitel mit angehängter Überschrift gelten', () => {
    const toc = [{ label: '§ 16' }, { label: '§ 17' }, { label: '§ 17a' }, { label: '§ 17b' }];
    expect(tocOrderProblems([unit(1, '§ 16'), unit(2, '§ 17b'), unit(3, '§ 17')], toc)).toEqual(['Reihenfolge weicht vom Verzeichnis der heutigen Ausgabe ab: § 17 nach § 17b']);
    expect(tocOrderProblems([unit(1, '§ 16'), unit(2, '§ 17'), unit(3, '§ 17a'), unit(4, 'Anlage'), unit(5, '§ 1')], toc)).toEqual([]);
    const withHeading = unit(1, 'Einheit 1', { from: '2022-05-01' });
    (withHeading.parsed as { title: string }).title = 'Testgesetz Vom 1. Januar 2020 Besoldungsgruppe A 5';
    expect(consistencyProblems([withHeading], { title: 'Testgesetz Vom 1. Januar 2020' })).toEqual([]);
    expect(consistencyProblems([withHeading], { title: 'Anderes Gesetz' })[0]).toMatch(/weicht vom heutigen Titel ab/u);
  });

  it('„Gültig ab: zukünftig“ heißt: am Stichtag nicht in Kraft', () => {
    const parsed = { header: { 'Gültig ab': 'zukünftig', Ausfertigungsdatum: '30.05.2023' }, titleFootnoteLines: [], body: [{ type: 'article', label: 'Artikel 1' }], toc: [] } as unknown as ParsedJurisPdf;
    expect(classifyEdition(parsed, false)).toEqual({ class: 'enacted-after-baseline', basis: 'Gültig ab: zukünftig (noch nicht in Kraft)' });
  });
});

/* ------------------------------------------------------------------------------------------------ */
/* Verzeichnisabgleich                                                                               */

const CHAR = 4.2;
const SPACE = 3;
const CENTER = (77 + 537) / 2;

function lineWords(page: number, y: number, parts: Array<{ x: number; text: string }>): PdfWord[] {
  const words: PdfWord[] = [];
  for (const part of parts) {
    let x = part.x;
    for (const token of part.text.split(' ')) {
      const width = token.length * CHAR;
      words.push({ page, x0: x, x1: x + width, y0: y - H, y1: y, text: token });
      x += width + SPACE;
    }
  }
  return words;
}
const width = (value: string): number => value.split(' ').reduce((sum, token) => sum + token.length * CHAR, 0) + (value.split(' ').length - 1) * SPACE;
const centered = (page: number, y: number, value: string): PdfWord[] => lineWords(page, y, [{ x: CENTER - width(value) / 2, text: value }]);
const left = (page: number, y: number, value: string, x = 77): PdfWord[] => lineWords(page, y, [{ x, text: value }]);

function syntheticAct(): ParsedJurisPdf {
  const pages: PdfPageGeometry[] = [{ page: 1, width: 595.3, height: 841.9 }, { page: 2, width: 595.3, height: 841.9 }];
  const words: PdfWord[] = [];
  let y = 60;
  for (const [key, value] of [['Amtliche Abkürzung:', 'TestAbkG'], ['Ausfertigungsdatum:', '01.02.2020'], ['Gültig ab:', '01.03.2020'], ['Dokumenttyp:', 'Gesetz'], ['Fundstelle:', 'GVOBl. 2020, 1'], ['Gliederungs-Nr:', '2000-1-1']]) {
    words.push(...lineWords(1, y, [{ x: 58, text: key! }, { x: 204, text: value! }]));
    y += 16;
  }
  y += 24;
  for (const value of ['Gesetz zum Testabkommen', 'Vom 1. Februar 2020']) {
    words.push(...centered(1, y, value));
    y += 15;
  }
  y += 11;
  words.push(...left(1, y, 'Zum 18.09.2026 aktuellste verfügbare Fassung der Gesamtausgabe'));
  y += 26;
  words.push(...left(1, y, 'Nichtamtliches Inhaltsverzeichnis'));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 247, text: 'Titel' }, { x: 467, text: 'Gültig ab' }]));
  y += 24;
  for (const entry of ['Gesetz zum Testabkommen', 'Eingangsformel', 'Artikel I - Zustimmung', '§§ 2 u. 3 - Übergang', 'Artikel II - Regelung', 'Anlage3 - Abkommen', 'Anlage 4 a - Karte']) {
    words.push(...lineWords(1, y, [{ x: 84, text: entry }, { x: 447, text: '01.03.2020' }]));
    y += 22;
  }
  y += 6;
  words.push(...left(1, y, 'Der Landtag hat das folgende Gesetz beschlossen:'));
  y += 26;
  words.push(...centered(1, y, 'Artikel I'));
  y += 15;
  words.push(...centered(1, y, 'Zustimmung'));
  y += 26;
  words.push(...left(1, y, 'Dem Abkommen wird zugestimmt.'));
  y += 26;
  words.push(...centered(1, y, '§§ 2 u. 3'));
  y += 15;
  words.push(...centered(1, y, 'Übergang'));
  y += 26;
  words.push(...left(1, y, '(gegenstandslos)'));
  y += 26;
  words.push(...left(1, y, '(Änderungsanweisungen)'));
  y += 40;
  words.push(...centered(1, y, '- Seite 1 von 2 -'));

  y = 80;
  words.push(...centered(2, y, 'Artikel II'));
  y += 15;
  words.push(...centered(2, y, 'Regelung für den Wegfall von Abgaben nach'));
  y += 15;
  words.push(...centered(2, y, '§ 9 KAG und der Vergnügungssteuer'));
  y += 26;
  words.push(...left(2, y, 'Dieses Gesetz tritt am Tag nach der Verkündung in Kraft.'));
  y += 26;
  words.push(...centered(2, y, 'Anlage 3'));
  y += 15;
  words.push(...centered(2, y, 'Abkommen'));
  y += 26;
  words.push(...centered(2, y, 'Artikel 1'));
  y += 15;
  words.push(...centered(2, y, 'Grundsatz'));
  y += 26;
  words.push(...left(2, y, 'Die Vertragsparteien wirken zusammen.'));
  y += 26;
  words.push(...centered(2, y, 'Anlage 4a'));
  y += 15;
  words.push(...centered(2, y, 'Karte'));
  y += 26;
  words.push(...left(2, y, 'Die Karte ist Bestandteil des Abkommens.'));
  y += 40;
  words.push(...centered(2, y, '- Seite 2 von 2 -'));
  return parseJurisPdf(buildLayout(pages, words));
}

describe('Run 9: Verzeichnis und Überschriften', () => {
  it('römische Artikel, Bereiche, Anlagenzählung und Einheiten in Anlagen stimmen mit dem Verzeichnis überein', () => {
    const parsed = syntheticAct();
    const labels: string[] = [];
    const walk = (blocks: NormBodyBlock[]): void => {
      for (const block of blocks) {
        if (block.label && ['paragraph', 'article', 'annex'].includes(block.type)) labels.push(`${block.type}:${block.label}${block.title ? ` ${block.title}` : ''}`);
        if (block.children) walk(block.children);
      }
    };
    walk(parsed.body);
    expect(labels).toEqual(['article:Artikel I Zustimmung', 'paragraph:§§ 2 u. 3 Übergang', 'article:Artikel II Regelung für den Wegfall von Abgaben nach § 9 KAG und der Vergnügungssteuer', 'annex:Anlage 3 Abkommen', 'article:Artikel 1 Grundsatz', 'annex:Anlage 4a Karte']);
    expect(parsed.toc.map((entry) => entry.label ?? '·')).toEqual(['·', '·', 'Artikel I', '§§ 2 u. 3', 'Artikel II', 'Anlage3', 'Anlage 4 a']);
    expect(parsed.findings.filter((finding) => /toc-unit-missing|body-unit-not-in-toc|toc-order/u.test(finding.code))).toEqual([]);
  });
});
