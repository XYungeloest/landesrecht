/**
 * juris-SH-Adapter, Run 7: Abbildungen als Assets, strukturierte Tabellen aus dem Spaltenraster, redaktionelle und
 * technische Vermerke, Anlagen als eigene juris-Dokumente (Zuordnung zur Stammnorm), R2-Asset-Schlüssel.
 * Synthetische Seiten (Wortkästen wie `pdftotext -bbox-layout`, Bildlagen wie `pdftohtml -xml`), kein Netz, kein poppler.
 */
import { describe, expect, it } from 'vitest';

import type { NormBodyBlock, NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { validateManifestEntry } from '@landesrecht/importer-juris-sh/common/manifest.ts';
import { bodyText, extractVwvLeadMetadata, gridTable, parseJurisPdf, removeEditorialNotes, type ParseFinding } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import { imageDimensions, parsePdftohtmlImages, type PdfImage } from '@landesrecht/importer-juris-sh/parse/pdf-figures.ts';
import { buildLayout, hasNonSignetImages, type PdfLine, type PdfPageGeometry, type PdfWord } from '@landesrecht/importer-juris-sh/parse/pdf-layout.ts';
import { annexBlockFor, annexLabel, assignSeparateAnnexes, attachAnnexes } from '@landesrecht/importer-juris-sh/pipeline/annexes.ts';
import type { DocumentResult } from '@landesrecht/importer-juris-sh/pipeline/document.ts';
import { assetObjectKey, rawObjectKey } from '@landesrecht/importer-juris-sh/r2/archive.ts';

const CHAR = 4.2;
const SPACE = 3;
const H = 15.8;
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
const width = (text: string): number => text.split(' ').reduce((sum, token) => sum + token.length * CHAR, 0) + (text.split(' ').length - 1) * SPACE;
const centered = (page: number, y: number, text: string): PdfWord[] => lineWords(page, y, [{ x: CENTER - width(text) / 2, text }]);
const left = (page: number, y: number, text: string, x = 77): PdfWord[] => lineWords(page, y, [{ x, text }]);

/** Verordnung mit § 1 auf Seite 1 und einer Anlage (Karte) auf Seite 2; `page2` ergänzt Zeilen auf Seite 2. */
function mapNorm(page2: (words: PdfWord[]) => void = (words) => words.push(...left(2, 420, 'Die Karte ist Bestandteil dieser Verordnung.'))) {
  const pages: PdfPageGeometry[] = [{ page: 1, width: 595.3, height: 841.9 }, { page: 2, width: 595.3, height: 841.9 }];
  const words: PdfWord[] = [];
  let y = 60;
  for (const [key, value] of [['Amtliche Abkürzung:', 'KarteVO'], ['Ausfertigungsdatum:', '10.05.2001'], ['Dokumenttyp:', 'Verordnung'], ['Gliederungs-Nr:', '791-4-200']] as const) {
    words.push(...lineWords(1, y, [{ x: 58, text: key }, { x: 204, text: value }]));
    y += 16;
  }
  y += 60;
  for (const text of ['Landesverordnung über die Karte', 'Vom 10. Mai 2001']) {
    words.push(...centered(1, y, text));
    y += 15;
  }
  y += 11;
  words.push(...left(1, y, 'Zum 18.09.2026 aktuellste verfügbare Fassung der Gesamtausgabe'));
  y += 26;
  words.push(...left(1, y, 'Nichtamtliches Inhaltsverzeichnis'));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 247, text: 'Titel' }, { x: 467, text: 'Gültig ab' }]));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 84, text: '§ 1 - Geltungsbereich' }, { x: 447, text: '01.01.2003' }]));
  y += 15;
  words.push(...lineWords(1, y, [{ x: 84, text: 'Anlage - Karte' }, { x: 447, text: '01.01.2003' }]));
  y += 30;
  words.push(...centered(1, y, '§1'));
  y += 15;
  words.push(...centered(1, y, 'Geltungsbereich'));
  y += 26;
  words.push(...left(1, y, 'Das Gebiet ergibt sich aus der Karte in der Anlage.'));
  words.push(...left(2, 90, 'Anlage'));
  page2(words);
  return buildLayout(pages, words);
}

const png = (sha: string, over: Partial<PdfImage> = {}): PdfImage => ({ page: 2, index: 1, x0: 100, y0: 110, x1: 400, y1: 310, sha256: sha.repeat(64).slice(0, 64), mediaType: 'image/png', extension: 'png', byteLength: 1234, width: 600, height: 400, sourcePath: 'seite-2/bild-1.png', ...over });
const signet = png('a', { page: 1, x0: 204, y0: 70, x1: 247, y1: 100, width: 57, height: 40, sourcePath: 'seite-1/bild-1.png' });

function figures(blocks: readonly NormBodyBlock[]): NormBodyBlock[] {
  return blocks.flatMap((block) => [...(block.type === 'figure' ? [block] : []), ...figures(block.children ?? [])]);
}

describe('juris-PDF: Abbildungen als Assets', () => {
  it('übernimmt eine unverzerrte Abbildung an ihrer Stelle in der Anlage; das Kopfsignet ist kein Normtext', () => {
    const parsed = parseJurisPdf(mapNorm(), { images: [signet, png('b')] });
    const annex = parsed.body.find((block) => block.type === 'annex')!;
    expect(annex.children!.map((child) => child.type)).toEqual(['figure', 'paragraphText']);
    expect(annex.children![0]).toEqual({ type: 'figure', asset: { sha256: 'b'.repeat(64), mediaType: 'image/png', byteLength: 1234, sourcePath: 'seite-2/bild-1.png', width: 600, height: 400 } });
    expect(figures(parsed.body)).toHaveLength(1);
    expect(parsed.findings.filter((finding) => finding.code === 'figure')).toEqual([]);
    expect(parsed.findings.filter((finding) => finding.code === 'figure-asset')).toHaveLength(1);
    // Die Abbildung trägt keinen Text: Integrität unverändert.
    expect(bodyText(parsed.body)).not.toMatch(/seite-2/u);
  });

  it('nimmt eine um 90° gedreht gesetzte Karte aufrecht, eine verzerrte nie', () => {
    const rotated = parseJurisPdf(mapNorm(), { images: [png('c', { width: 400, height: 600 })] });
    expect(figures(rotated.body)).toHaveLength(1);
    expect(rotated.findings.find((finding) => finding.code === 'figure-asset')!.message).toMatch(/gedreht/u);
    const distorted = parseJurisPdf(mapNorm(), { images: [png('d', { width: 600, height: 100 })] });
    expect(figures(distorted.body)).toEqual([]);
    expect(distorted.findings.find((finding) => finding.code === 'figure')!.message).toMatch(/verzerrt/u);
  });

  it('meldet eine Abbildung, die Text überdeckt, und Bilder, die nicht auslesbar sind', () => {
    const covering = parseJurisPdf(mapNorm(), { images: [png('e', { y0: 390, y1: 590, x0: 60, x1: 360 })] });
    expect(figures(covering.body)).toEqual([]);
    expect(covering.findings.find((finding) => finding.code === 'figure')!.message).toMatch(/überdeckt Text/u);
    const unreadable = parseJurisPdf(mapNorm(), { images: null });
    expect(unreadable.findings.find((finding) => finding.code === 'figure')!.message).toMatch(/nicht auslesbar/u);
  });

  it('das Symbol „Es ist Text als PDF-Datei vorhanden“ ist keine Abbildung; der Vermerk macht die Norm unvollständig', () => {
    const parsed = parseJurisPdf(mapNorm((words) => {
      words.push(...left(2, 140, 'Es ist Text als PDF-Datei vorhanden.'));
      words.push(...left(2, 155, 'Bitte gesondert ausdrucken.'));
    }), { images: [png('f', { x0: 77, x1: 90, y0: 105, y1: 119, width: 17, height: 18 })] });
    expect(figures(parsed.body)).toEqual([]);
    expect(bodyText(parsed.body)).not.toMatch(/PDF-Datei/u);
    expect(parsed.relocated.map((entry) => entry.reason)).toContain('technischer Vermerk der juris-Ausgabe');
    expect(parsed.findings.find((finding) => finding.code === 'incomplete-source-text')!.message).toMatch(/gesonderte PDF-Datei/u);
  });

  it('liest Bildlagen aus pdftohtml -xml und Pixelmaße aus PNG und JPEG', () => {
    const xml = '<pdf2xml><page number="1" position="absolute" top="0" left="0" height="841" width="595">\n<image top="133" left="204" width="43" height="30" src="out-1_1.png"/>\n</page>\n<page number="2" position="absolute" top="0" left="0" height="841" width="595">\n<image top="77" left="77" width="488" height="750" src="out-2_1.jpg"/>\n<image top="80" left="80" width="10" height="10" src="out-2_2.png"/>\n</page></pdf2xml>';
    expect(parsePdftohtmlImages(xml)).toEqual([
      { page: 1, index: 1, top: 133, left: 204, width: 43, height: 30, src: 'out-1_1.png' },
      { page: 2, index: 1, top: 77, left: 77, width: 488, height: 750, src: 'out-2_1.jpg' },
      { page: 2, index: 2, top: 80, left: 80, width: 10, height: 10, src: 'out-2_2.png' },
    ]);
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0x9a, 0, 0, 3, 0xc9]);
    expect(imageDimensions(header)).toEqual({ width: 666, height: 969 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x09, 0x1b, 0x06, 0x76, 3, 0, 0, 0]);
    expect(imageDimensions(jpeg)).toEqual({ width: 1654, height: 2331 });
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('liest Lage und Bytes nur, wenn die Ausgabe mehr als die Kopfsignets trägt', () => {
    expect(hasNonSignetImages([{ page: 1, width: 57, height: 40 }, { page: 1, width: 75, height: 15 }])).toBe(false);
    expect(hasNonSignetImages([{ page: 1, width: 57, height: 40 }, { page: 5, width: 17, height: 18 }])).toBe(true);
    expect(hasNonSignetImages([{ page: 1, width: 600, height: 400 }])).toBe(true);
  });
});

function line(y: number, segments: Array<[number, number, string]>, over: Partial<PdfLine> = {}): PdfLine {
  const text = segments.map(([, , value]) => value).join(' ');
  return { page: 1, index: y, x0: segments[0]![0], x1: segments.at(-1)![1], y0: y - H, y1: y, height: H, segments: segments.map(([x0, x1, value]) => ({ x0, x1, text: value })), text, superscripts: [], plainText: text, gapBefore: 0, ...over };
}

describe('juris-PDF: Tabellen aus dem Spaltenraster', () => {
  it('übernimmt ein sauberes Raster (gleiche Spaltenzahl, durchgehender Zwischenraum) als Tabelle', () => {
    const table = gridTable([line(100, [[77, 140, 'Bremen'], [300, 360, '152.189 DM'], [450, 510, '77.813 Euro']]), line(115, [[77, 150, 'Hamburg'], [296, 360, '380.899 DM'], [446, 510, '194.751 Euro']])]);
    expect(table).toEqual({
      type: 'table',
      columns: 3,
      children: [
        { type: 'tableRow', children: [{ type: 'tableCell', text: 'Bremen' }, { type: 'tableCell', text: '152.189 DM' }, { type: 'tableCell', text: '77.813 Euro' }] },
        { type: 'tableRow', children: [{ type: 'tableCell', text: 'Hamburg' }, { type: 'tableCell', text: '380.899 DM' }, { type: 'tableCell', text: '194.751 Euro' }] },
      ],
    });
  });

  it('lässt alles andere als Befund stehen: abweichende Spaltenzahl, kein Zwischenraum, Worttrennung, Hochzeichen, eine Zeile', () => {
    const a = line(100, [[77, 140, 'Bremen'], [300, 360, '1 DM']]);
    expect(gridTable([a, line(115, [[77, 140, 'Hamburg'], [300, 360, '2 DM'], [450, 500, 'x']])])).toBeUndefined();
    expect(gridTable([a, line(115, [[77, 310, 'Niedersachsen und weitere'], [320, 360, '2 DM']])])).toBeUndefined();
    expect(gridTable([a, line(115, [[77, 140, 'Verwal-'], [300, 360, '2 DM']])])).toBeUndefined();
    expect(gridTable([a, line(115, [[77, 140, 'Hamburg'], [300, 360, '2 DM']], { superscripts: ['1)'] })])).toBeUndefined();
    expect(gridTable([a])).toBeUndefined();
  });
});

describe('juris-PDF: redaktionelle und technische Vermerke', () => {
  it('nimmt das nichtamtliche Anlagenverzeichnis heraus, meldet „[hier nicht gespeichert]“ und Lückenvermerke im Text', () => {
    const findings: ParseFinding[] = [];
    const { body, relocated } = removeEditorialNotes([
      { type: 'paragraphText', text: 'Ich bitte, so zu verfahren.' },
      { type: 'heading', text: '[hier nicht gespeichert]' },
      { type: 'paragraphText', text: 'Die Umlage berechnet sich wie folgt: (Gleichung nicht gespeichert) für jedes Jahr.' },
      { type: 'paragraphText', text: 'Anlagen (nichtamtliches Verzeichnis) Anlage 1: Antragsvordruck Anlage 2: Erklärung' },
    ], findings);
    expect(body.map((block) => block.text)).toEqual(['Ich bitte, so zu verfahren.', 'Die Umlage berechnet sich wie folgt: (Gleichung nicht gespeichert) für jedes Jahr.']);
    expect(relocated.map((entry) => entry.reason)).toEqual(['technischer Vermerk der juris-Ausgabe', 'juris-Verzeichnis der Anlagen (nichtamtlich)']);
    expect(findings.filter((finding) => finding.code === 'incomplete-source-text')).toHaveLength(2);
  });

  it('schneidet ein an den letzten Absatz angehängtes Anlagenverzeichnis ab und erkennt „redakt. Anm. juris“', () => {
    const findings: ParseFinding[] = [];
    const { body, relocated } = removeEditorialNotes([
      { type: 'paragraphText', text: 'Dieser Erlass tritt am 1. Februar 2011 in Kraft. Anlagen (nichtamtliches Verzeichnis) Anlage: Verzeichnis der Standorte' },
      { type: 'footnote', label: '*)', text: 'redakt. Anm. juris: Gültigkeit verlängert bis zum 31.07.2025' },
    ], findings);
    expect(body).toEqual([{ type: 'paragraphText', text: 'Dieser Erlass tritt am 1. Februar 2011 in Kraft.' }]);
    expect(relocated.map((entry) => entry.reason)).toEqual(['juris-Verzeichnis der Anlagen (nichtamtlich)', 'juris-Anmerkung']);
  });

  it('VwV-Vorspann: Titel mit anderer Strichtypografie, mehrere Gliederungsnummern, Sternchen', () => {
    const { body, metadata } = extractVwvLeadMetadata([
      { type: 'paragraphText', text: 'Verwaltungsvorschrift zur Kennzeichnung (Kennzeichnungsverwaltungsvorschrift – KennzVV)' },
      { type: 'heading', text: 'Gl.Nr. 2030.32' },
      { type: 'heading', text: 'Gl.Nr. 625.13*' },
      { type: 'paragraphText', text: 'Fundstelle: Amtsbl. Schl.-H. 2016 S. 1817' },
      { type: 'paragraphText', text: 'Erlass des Ministeriums vom 7. Dezember 2016' },
    ], 'Verwaltungsvorschrift zur Kennzeichnung (Kennzeichnungsverwaltungsvorschrift - KennzVV)');
    expect(body).toEqual([{ type: 'paragraphText', text: 'Erlass des Ministeriums vom 7. Dezember 2016' }]);
    expect(metadata).toMatchObject({ repeatedTitle: true, gliederungsnummer: '2030.32, 625.13', fundstelle: 'Amtsbl. Schl.-H. 2016 S. 1817' });
    expect(extractVwvLeadMetadata([{ type: 'heading', text: 'Gl.Nrn. 2030.36 und 2010–6' }, { type: 'paragraphText', text: 'Text' }], 'X').metadata.gliederungsnummer).toBe('2030.36 und 2010–6');
    // Angehängte Bekanntmachungszeile bleibt Normtext; Unterpunkte eines Fundstellenblocks bleiben an ihrer Stelle.
    const joined = extractVwvLeadMetadata([{ type: 'paragraphText', text: 'Fundstelle: Amtsbl. Schl.-H. 2023 Nr. 13, S. 757 Bekanntmachung des Ministeriums vom 24. Februar 2023', children: [{ type: 'item', label: '1.', text: 'Zweck' }] }], 'X');
    expect(joined.metadata.fundstelle).toBe('Amtsbl. Schl.-H. 2023 Nr. 13, S. 757');
    expect(joined.body).toEqual([{ type: 'paragraphText', text: 'Bekanntmachung des Ministeriums vom 24. Februar 2023', children: [{ type: 'item', label: '1.', text: 'Zweck' }] }]);
    const amended = extractVwvLeadMetadata([{ type: 'paragraphText', text: 'Fundstelle: SchlHA 2007 S. 13 Zuletzt geändert durch Verwaltungsvorschrift vom 28.05.2015 (SchlHA 2015 S. 258)', children: [{ type: 'item', label: '1.', text: 'Aufgaben' }] }], 'X');
    expect(amended.metadata).toMatchObject({ fundstelle: 'SchlHA 2007 S. 13', amendmentNote: 'Zuletzt geändert durch Verwaltungsvorschrift vom 28.05.2015 (SchlHA 2015 S. 258)' });
    expect(amended.body).toEqual([{ type: 'item', label: '1.', text: 'Aufgaben' }]);
  });

  it('lässt Normtext mit „nicht gespeichert“ als Regelung stehen und meldet ihn nicht', () => {
    const findings: ParseFinding[] = [];
    const { body } = removeEditorialNotes([{ type: 'paragraphText', text: 'Personenbezogene Daten dürfen nicht gespeichert werden.' }], findings);
    expect(body).toHaveLength(1);
    expect(findings).toEqual([]);
  });
});

function vwv(id: string, over: Partial<DocumentResult> & { body?: NormBodyBlock[] } = {}): { id: string; area: 'vwv'; result: DocumentResult } {
  const { body = [{ type: 'paragraphText', text: `Text ${id}` }], ...rest } = over;
  const record = { meta: { slug: id.toLowerCase() }, versions: [{ body }] } as unknown as NormRecord;
  return {
    id,
    area: 'vwv',
    result: { documentId: id, area: 'vwv', outcome: 'import-ready', reasons: [], blockers: [], warnings: [], findings: [], raw: { url: `https://example.test/${id}.pdf`, sha256: 'e'.repeat(64), byteLength: 10, retrievedAt: '2026-09-18T00:00:00.000Z' }, record, source: { gliederungsnummer: '2030.22', documentDates: [] } as never, ...rest },
  };
}

describe('VwV-Anlagen als eigene juris-Dokumente', () => {
  it('ordnet eine Anlage eindeutig ihrer Stammnorm zu (Titel, Gliederungsnummer) und ordnet nach der Anlagennummer', () => {
    const main = vwv('VVSH-3', { title: 'Vereinbarung zum Qualifizierungskonzept' });
    const second = vwv('VVSH-1', { mainDocument: 'Vereinbarung zum Qualifizierungskonzept', body: [{ type: 'annex', label: 'Anlage 2', children: [{ type: 'paragraphText', text: 'Profil' }] }] });
    const first = vwv('VVSH-2', { mainDocument: 'Vereinbarung zum Qualifizierungskonzept', body: [{ type: 'annex', label: 'Anlage 1', children: [{ type: 'paragraphText', text: 'Lehrgang' }] }] });
    const other = vwv('VVSH-4', { mainDocument: 'Eine ganz andere Verwaltungsvorschrift ohne Stammnorm' });
    const assignment = assignSeparateAnnexes([second, first, main, other]);
    expect(assignment.annexesOf.get('VVSH-3')).toEqual(['VVSH-2', 'VVSH-1']);
    expect(assignment.unresolved.get('VVSH-4')).toMatch(/keine VwV/u);
    // Zwei gleichnamige Stammnormen mit derselben Gliederungsnummer: mehrdeutig, nie geraten.
    const twin = vwv('VVSH-5', { title: 'Vereinbarung zum Qualifizierungskonzept' });
    const ambiguous = assignSeparateAnnexes([first, main, twin]);
    expect(ambiguous.mainOf.size).toBe(0);
    expect([...ambiguous.ambiguousMains.keys()].sort()).toEqual(['VVSH-3', 'VVSH-5']);
  });

  it('entscheidet gleichnamige Änderungsbekanntmachungen über das gemeinsame Erlassdatum, sonst nicht', () => {
    const facts = (date: string) => ({ gliederungsnummer: '2330.54', documentDates: [date] }) as never;
    const older = vwv('VVSH-10', { title: 'Änderung der Finanzierungsrichtlinien', source: facts('2014-12-03') });
    const newer = vwv('VVSH-20', { title: 'Änderung der Finanzierungsrichtlinien', source: facts('2015-07-14') });
    const annex = vwv('VVSH-21', { mainDocument: 'Änderung der Finanzierungsrichtlinien', source: facts('2015-07-14') });
    expect(assignSeparateAnnexes([older, newer, annex]).mainOf.get('VVSH-21')).toBe('VVSH-20');
    // Zwei Kandidaten mit demselben Datum: mehrdeutig, keine Zuordnung.
    const twin = vwv('VVSH-22', { title: 'Änderung der Finanzierungsrichtlinien', source: facts('2015-07-14') });
    expect(assignSeparateAnnexes([older, newer, twin, annex]).mainOf.has('VVSH-21')).toBe(false);
  });

  it('hängt Anlagen an den Normkörper an und übernimmt ihre Sperrgründe', () => {
    const main = vwv('VVSH-3', { title: 'Stammnorm' });
    const clean = vwv('VVSH-1', { mainDocument: 'Stammnorm', body: [{ type: 'annex', label: 'Anlage 1', children: [{ type: 'paragraphText', text: 'Lehrgang' }] }, { type: 'paragraph', label: '§ 1', children: [{ type: 'paragraphText', text: 'Gegenstand' }] }] });
    const table = vwv('VVSH-2', { mainDocument: 'Stammnorm', outcome: 'review', blockers: [{ kind: 'parse', code: 'table-layout', detail: 'Tabelle' }, { kind: 'parse', code: 'vwv-annex-document', detail: 'Anlage' }] });
    const attached = attachAnnexes(main.result, [{ id: clean.id, result: clean.result }, { id: table.id, result: table.result }]);
    expect(attached).toEqual(['VVSH-1', 'VVSH-2']);
    const body = main.result.record!.versions[0]!.body;
    expect(body.map((block) => [block.type, block.label])).toEqual([['paragraphText', undefined], ['annex', 'Anlage 1'], ['annex', 'Anlage']]);
    // Der Rest des Anlagendokuments (§ 1 der Mustersatzung) gehört in die Anlage.
    expect(body[1]!.children!.map((child) => child.type)).toEqual(['paragraphText', 'paragraph']);
    expect(main.result.outcome).toBe('review');
    expect(main.result.blockers.map((blocker) => blocker.code)).toEqual(['table-layout']);
    expect(main.result.annexDocuments!.map((annex) => annex.documentId)).toEqual(['VVSH-1', 'VVSH-2']);
  });

  it('nimmt Bezeichnung und Überschrift einer Anlage aus dem Titel des Anlagendokuments', () => {
    expect(annexLabel('Musterbetriebssatzung für Eigenbetriebe - Anlage 2: Mustersatzung II Betriebssatzung')).toEqual({ label: 'Anlage 2', title: 'Mustersatzung II Betriebssatzung' });
    const annex = vwv('VVSH-9', { title: 'Richtlinie - Anlage 3: Antragsvordruck', mainDocument: 'Richtlinie' });
    expect(annexBlockFor(annex.result)).toMatchObject({ type: 'annex', label: 'Anlage 3', title: 'Antragsvordruck' });
  });
});

describe('R2: Abbildungs-Assets', () => {
  it('legt Abbildungen inhaltsadressiert unter assets/ ab, alle anderen Rohquellen je Norm', () => {
    const sha = 'f'.repeat(64);
    expect(assetObjectKey(sha, 'image/png')).toBe(`nsh/juris-sh/2023-12-01/assets/${sha}.png`);
    expect(assetObjectKey(sha, 'image/jpeg')).toBe(`nsh/juris-sh/2023-12-01/assets/${sha}.jpg`);
    expect(() => assetObjectKey(sha, 'image/svg+xml')).toThrow(/Medienart/u);
    expect(rawObjectKey({ sourceArea: 'vwv', sourceIdentity: 'VVSH-1' }, { role: 'figure', sha256: sha, contentType: 'image/png' })).toBe(`nsh/juris-sh/2023-12-01/assets/${sha}.png`);
    expect(rawObjectKey({ sourceArea: 'vwv', sourceIdentity: 'VVSH-1' }, { role: 'pdf', sha256: sha, contentType: 'application/pdf' })).toMatch(/^nsh\/juris-sh\/2023-12-01\/vwv\//u);
  });

  it('verlangt an Abbildungs-Rohquellen die gebundene PDF-Ausgabe (Lage und SHA-256)', () => {
    const problems = validateManifestEntry({ rawDocuments: [{ role: 'figure', url: 'https://example.test/a.pdf', finalUrl: 'https://example.test/a.pdf', sha256: 'f'.repeat(64), contentType: 'image/png', retrievedAt: '2026-09-18T00:00:00.000Z', byteLength: 10 }] } as never, 'x');
    expect(problems.some((problem) => /packagePath\/packageSha256/u.test(problem))).toBe(true);
  });
});

describe('Historische Einzelfassungen (Run 8)', () => {
  const unit = (nn: number, key: string, options: { from?: string; to?: string; version?: string; text?: string } = {}) => ({
    documentId: `jlr-NNLSH0000TESTNN${String(nn).padStart(11, '0')}`,
    nn,
    key,
    ...(options.from ? { validFrom: options.from } : {}),
    ...(options.to ? { validTo: options.to } : {}),
    ...(options.version ? { versionDate: options.version } : {}),
    parsed: { body: [{ type: 'paragraphText', text: options.text ?? key }] } as never,
    layout: {} as never,
    raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
  });

  it('ordnet eine reine Paragraphenfolge nach der Nummer, wenn juris die alten Fassungen hinter die Neufassung stellt', async () => {
    const { selectBaselineUnits } = await import('@landesrecht/importer-juris-sh/pipeline/historical.ts');
    const selection = selectBaselineUnits([unit(1, 'Eingangsformel', { from: '2003-01-01' }), unit(2, '§ 1', { from: '2021-12-17' }), unit(3, '§ 13', { from: '2021-12-17' }), unit(4, 'Teil 1', { from: '2025-03-29' }), unit(5, '§ 8', { from: '2021-12-17' }), unit(6, 'Anlage 1', { from: '2021-12-17' })]);
    expect(selection.problems).toEqual([]);
    expect(selection.selected.map((entry) => entry.key)).toEqual(['Eingangsformel', '§ 1', '§ 8', '§ 13', 'Anlage 1']);
    // Mit einer Gliederungseinheit zwischen den Paragraphen bleibt es ein Befund.
    const nested = selectBaselineUnits([unit(1, '§ 1', { from: '2021-01-01' }), unit(2, 'Abschnitt 2', { from: '2021-01-01' }), unit(3, '§ 13', { from: '2021-01-01' }), unit(4, '§ 8', { from: '2021-01-01' })]);
    expect(nested.problems[0]).toMatch(/Reihenfolge nicht aufsteigend/u);
  });

  it('wertet wortgleiche Doppelfassungen als eine, textlich verschiedene nie', async () => {
    const { selectBaselineUnits } = await import('@landesrecht/importer-juris-sh/pipeline/historical.ts');
    const twins = selectBaselineUnits([unit(1, '§ 1', { from: '2023-11-17', to: '2025-11-14', version: '2023-10-27', text: 'Text A' }), unit(2, '§ 1', { from: '2023-11-17', version: '2023-10-27', text: 'Text A' })]);
    expect(twins.problems).toEqual([]);
    expect(twins.selected.map((entry) => entry.nn)).toEqual([1]);
    const different = selectBaselineUnits([unit(1, '§ 1', { from: '2023-11-17', to: '2025-11-14', version: '2023-10-27', text: 'Ministerium A' }), unit(2, '§ 1', { from: '2023-11-17', version: '2023-10-27', text: 'Ministerium B' })]);
    expect(different.problems[0]).toMatch(/2 Fassungen gelten zugleich/u);
  });

  it('lässt eine Fassung ohne „Gültig ab“ weg, die erst nach dem Stichtag erlassen wurde', async () => {
    const { selectBaselineUnits } = await import('@landesrecht/importer-juris-sh/pipeline/historical.ts');
    const selection = selectBaselineUnits([unit(1, '§ 1', { from: '2020-01-01' }), unit(2, 'Einheit 2', { version: '2026-05-04' })]);
    expect(selection.problems).toEqual([]);
    expect(selection.omitted.map((entry) => entry.key)).toEqual(['Einheit 2']);
    const undatedBefore = selectBaselineUnits([unit(1, '§ 1', { from: '2020-01-01' }), unit(2, 'Einheit 2', { version: '2019-05-04' })]);
    expect(undatedBefore.problems[0]).toMatch(/ohne „Gültig ab“/u);
  });
});
