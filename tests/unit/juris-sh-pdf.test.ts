/**
 * juris-SH-Adapter: PDF-Ausgabe (Layout → Parser → Integrität), Stichtagseinordnung, SH-Modell, historische
 * Einzelfassungen und der öffentliche Ausgabeweg mit anonymer Sitzung. Synthetische Seiten (Wortkästen wie
 * `pdftotext -bbox-layout`), kein Netz, kein poppler.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createExportClient, pdfExportUrl, rateLimitedFetch } from '@landesrecht/importer-juris-sh/export/client.ts';
import { compareIntegrity } from '@landesrecht/importer-juris-sh/parse/integrity.ts';
import { bodyText, joinLines, normalizeLabel, parseJurisPdf, type ParsedJurisPdf } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import { buildLayout, parseBboxLayout, type PdfPageGeometry, type PdfWord } from '@landesrecht/importer-juris-sh/parse/pdf-layout.ts';
import { classifyEdition, splitTitle, toSourceLaw } from '@landesrecht/importer-juris-sh/parse/source-law.ts';
import { selectBaselineUnits, unitNumber, type UnitVersion } from '@landesrecht/importer-juris-sh/pipeline/historical.ts';
import { unitIdsByFrame } from '@landesrecht/importer-juris-sh/enumerate/sitemap.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/juris-sh-state.ts';

afterAll(cleanupTempRoots);

const CHAR = 4.2;
const SPACE = 3;
const H = 15.8;
const CENTER = (77 + 537) / 2;

interface Part { x: number; text: string; h?: number }

/** Wörter einer Zeile: Teile an festen x-Positionen, Wörter mit Zeichenbreite und Wortabstand. */
function lineWords(page: number, y: number, parts: Part[]): PdfWord[] {
  const words: PdfWord[] = [];
  for (const part of parts) {
    let x = part.x;
    const height = part.h ?? H;
    for (const token of part.text.split(' ')) {
      const width = token.length * CHAR;
      words.push({ page, x0: x, x1: x + width, y0: y - height, y1: y, text: token });
      x += width + SPACE;
    }
  }
  return words;
}

const width = (text: string): number => text.split(' ').reduce((sum, token) => sum + token.length * CHAR, 0) + (text.split(' ').length - 1) * SPACE;
const centered = (page: number, y: number, text: string): PdfWord[] => lineWords(page, y, [{ x: CENTER - width(text) / 2, text }]);
const left = (page: number, y: number, text: string, x = 77): PdfWord[] => lineWords(page, y, [{ x, text }]);

/** Zeilenabstand im Absatz 15 (Kästen überlappen um 0,8), Absatzabstand 26. */
function syntheticNorm(): { pages: PdfPageGeometry[]; words: PdfWord[] } {
  const pages: PdfPageGeometry[] = [{ page: 1, width: 595.3, height: 841.9 }, { page: 2, width: 595.3, height: 841.9 }];
  const words: PdfWord[] = [];
  let y = 60;
  const header = (key: string, value: string): void => {
    words.push(...lineWords(1, y, [{ x: 58, text: key }, ...(value ? [{ x: 204, text: value }] : [])]));
    y += 16;
  };
  header('Amtliche Abkürzung:', 'TestVO');
  header('Ausfertigungsdatum:', '01.02.2020');
  header('Gültig ab:', '01.03.2020');
  header('Dokumenttyp:', 'Verordnung');
  header('Fundstelle:', 'GVOBl. 2020, 1');
  header('Gliederungs-Nr:', '2000-1-1');
  y += 24;
  for (const text of ['Landesverordnung über Testfälle', '(Testverordnung - TestVO)', 'Vom 1. Februar 2020']) {
    words.push(...centered(1, y, text));
    y += 15;
  }
  y += 11;
  words.push(...left(1, y, 'Zum 18.09.2026 aktuellste verfügbare Fassung der Gesamtausgabe'));
  y += 28;
  words.push(...lineWords(1, y, [{ x: 82, text: 'Stand: letzte berücksichtigte Änderung: § 2 geändert (LVO v. 01.01.2021,' }]));
  y += 15;
  words.push(...left(1, y, 'GVOBl. S. 5)', 129));
  y += 26;
  words.push(...left(1, y, 'Nichtamtliches Inhaltsverzeichnis'));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 247, text: 'Titel' }, { x: 467, text: 'Gültig ab' }]));
  y += 24;
  const toc = (text: string, date: string): void => {
    words.push(...lineWords(1, y, [{ x: 84, text }, { x: 447, text: date }]));
    y += 22;
  };
  toc('Landesverordnung über Testfälle (Testverordnung - TestVO)', '01.03.2020');
  toc('Eingangsformel', '01.03.2020');
  toc('§ 1 - Geltungsbereich', '01.03.2020');
  toc('§ 2 - Pflichten', '01.01.2021');
  y += 6;
  words.push(...left(1, y, 'Aufgrund des § 1 des Testgesetzes vom 1. Januar 2019 (GVOBl. Schl.-H. S. 1) verordnet das'));
  y += 15;
  words.push(...left(1, y, 'Ministerium:'));
  y += 26;
  words.push(...centered(1, y, '§1'));
  y += 15;
  words.push(...centered(1, y, 'Geltungsbereich'));
  y += 26;
  words.push(...left(1, y, '(1) Diese Verordnung gilt für alle Testfälle, die im Land Schleswig-Holstein durchgeführt werden, und für Test-'));
  y += 15;
  words.push(...left(1, y, 'fälle aller Art.'));
  y += 26;
  words.push(...left(1, y, '(2) Sie gilt nicht für Vorhaben, die ausschließlich der Ausbildung dienen, insbesondere nicht für'));
  y += 26;
  words.push(...lineWords(1, y, [{ x: 77, text: '1.' }, { x: 107, text: 'Übungen der Schulen und Hochschulen, die im Rahmen des Unterrichts oder der Lehre' }]));
  y += 15;
  words.push(...left(1, y, 'stattfinden, und', 107));
  y += 26;
  words.push(...lineWords(1, y, [{ x: 77, text: '2.' }, { x: 107, text: 'Proben,' }]));
  y += 15;
  words.push(...left(1, y, 'soweit durch Gesetz nichts anderes bestimmt ist.'));
  y += 40;
  words.push(...centered(1, y, '- Seite 1 von 2 -'));

  y = 80;
  words.push(...centered(2, y, '§2'));
  y += 15;
  words.push(...centered(2, y, 'Pflichten'));
  y += 26;
  words.push(...left(2, y, 'Die Beteiligten haben die Regeln zu beachten, die das zuständige Ministerium bekannt macht.'));
  // Fußnotenzeichen hochgestellt am Zeilenende (kleiner, angehoben).
  words.push({ page: 2, x0: 77 + width('Die Beteiligten haben die Regeln zu beachten, die das zuständige Ministerium bekannt macht.') + 1, x1: 77 + width('Die Beteiligten haben die Regeln zu beachten, die das zuständige Ministerium bekannt macht.') + 10, y0: y - 13, y1: y - 5, text: "*)" });
  y += 26;
  words.push(...left(2, y, 'Fußnoten'));
  y += 26;
  words.push(...lineWords(2, y, [{ x: 77, text: '*)' }, { x: 104, text: 'Die Bekanntmachung erfolgt im Amtsblatt für Schleswig-Holstein.' }]));
  y += 40;
  words.push(...centered(2, y, '- Seite 2 von 2 -'));
  return { pages, words };
}

function parsedNorm(): ParsedJurisPdf {
  const { pages, words } = syntheticNorm();
  return parseJurisPdf(buildLayout(pages, words));
}

describe('juris-PDF: Layout und Parser', () => {
  it('liest Wortkästen aus pdftotext -bbox-layout', () => {
    const xhtml = '<doc><page width="595.3" height="841.9"><flow><block><line><word xMin="77.0" yMin="100.0" xMax="120.0" yMax="115.8">Test&amp;Co</word></line></block></flow></page></doc>';
    const { pages, words } = parseBboxLayout(xhtml);
    expect(pages).toEqual([{ page: 1, width: 595.3, height: 841.9 }]);
    expect(words).toEqual([{ page: 1, x0: 77, y0: 100, x1: 120, y1: 115.8, text: 'Test&Co' }]);
  });

  it('trennt Kopf, Titel, Ausgabevermerk, Stand, Verzeichnis und Normtext', () => {
    const { pages, words } = syntheticNorm();
    const layout = buildLayout(pages, words);
    if (process.env.DEBUG_LAYOUT) console.log(layout.left, layout.right, layout.lineGap, layout.paragraphGap, layout.lines.map((line) => `${line.x0.toFixed(0)}-${line.x1.toFixed(0)} g${line.gapBefore.toFixed(1)} ${line.text.slice(0, 40)}`));
    const parsed = parsedNorm();
    expect(parsed.header).toMatchObject({ 'Amtliche Abkürzung': 'TestVO', 'Ausfertigungsdatum': '01.02.2020', 'Gültig ab': '01.03.2020', Dokumenttyp: 'Verordnung', Fundstelle: 'GVOBl. 2020, 1', 'Gliederungs-Nr': '2000-1-1' });
    expect(parsed.title).toBe('Landesverordnung über Testfälle (Testverordnung - TestVO) Vom 1. Februar 2020');
    expect(parsed.edition).toMatchObject({ currentAsOf: '2026-09-18' });
    expect(parsed.stand).toBe('letzte berücksichtigte Änderung: § 2 geändert (LVO v. 01.01.2021, GVOBl. S. 5)');
    expect(parsed.toc.map((entry) => [entry.label, entry.title, entry.validFrom])).toEqual([
      [undefined, 'Landesverordnung über Testfälle (Testverordnung - TestVO)', '2020-03-01'],
      [undefined, 'Eingangsformel', '2020-03-01'],
      ['§ 1', 'Geltungsbereich', '2020-03-01'],
      ['§ 2', 'Pflichten', '2021-01-01'],
    ]);
    expect(parsed.findings.filter((finding) => finding.severity !== 'info')).toEqual([]);
  });

  it('baut Einzelnormen, Absätze, Aufzählungen mit Folgesatz, Silbentrennung und Fußnoten', () => {
    const parsed = parsedNorm();
    const [formula, first, second] = parsed.body;
    expect(formula).toMatchObject({ type: 'paragraphText', text: 'Aufgrund des § 1 des Testgesetzes vom 1. Januar 2019 (GVOBl. Schl.-H. S. 1) verordnet das Ministerium:' });
    expect(first).toMatchObject({ type: 'paragraph', label: '§ 1', title: 'Geltungsbereich' });
    expect(first!.children![0]).toMatchObject({ type: 'subparagraph', label: '(1)', text: 'Diese Verordnung gilt für alle Testfälle, die im Land Schleswig-Holstein durchgeführt werden, und für Testfälle aller Art.' });
    const two = first!.children![1]!;
    expect(two).toMatchObject({ type: 'subparagraph', label: '(2)' });
    expect(two.children!.map((child) => [child.type, child.label, child.text])).toEqual([
      ['item', '1.', 'Übungen der Schulen und Hochschulen, die im Rahmen des Unterrichts oder der Lehre stattfinden, und'],
      ['item', '2.', 'Proben,'],
      ['paragraphText', undefined, 'soweit durch Gesetz nichts anderes bestimmt ist.'],
    ]);
    expect(second).toMatchObject({ type: 'paragraph', label: '§ 2', title: 'Pflichten' });
    expect(second!.children![0]!.text).toBe('Die Beteiligten haben die Regeln zu beachten, die das zuständige Ministerium bekannt macht.*)');
    expect(second!.children![1]).toMatchObject({ type: 'footnote', label: '*)', text: 'Die Bekanntmachung erfolgt im Amtsblatt für Schleswig-Holstein.' });
  });

  it('prüft die Textintegrität gegen den sichtbaren Normtext (Seitenmobiliar und „Fußnoten“ benannt ausgenommen)', () => {
    const parsed = parsedNorm();
    expect(parsed.excludedSourceLines).toBe(1);
    expect(parsed.sourceText).not.toContain('Seite 1 von 2');
    expect(compareIntegrity(parsed.sourceText, bodyText(parsed.body), [], joinLines).class).toBe('exact');
    const lost = compareIntegrity(parsed.sourceText, bodyText(parsed.body.slice(0, 2)), [], joinLines);
    expect(lost.class).toBe('mismatch');
    expect(lost.firstDivergence).toBeDefined();
    expect(compareIntegrity('ein Wort mehr', 'ein Wort', [], joinLines).class).toBe('review');
  });

  it('löst Silbentrennung nur, wo sie eine ist', () => {
    expect(joinLines('Gemeinde-', 'verbände')).toBe('Gemeindeverbände');
    expect(joinLines('Nord-', 'und Ostsee')).toBe('Nord- und Ostsee');
    expect(joinLines('Schleswig-', 'Holstein')).toBe('Schleswig-Holstein');
    expect(joinLines('Absatz', '2')).toBe('Absatz 2');
    expect(joinLines('vom 5. November 2008 (GV-', 'OBl. Schl.-H. S. 588)')).toBe('vom 5. November 2008 (GVOBl. Schl.-H. S. 588)');
    expect(joinLines('nach der EU-', 'Richtlinie')).toBe('nach der EU-Richtlinie');
    expect(normalizeLabel('§1')).toBe('§ 1');
    expect(normalizeLabel('§§ 156 bis 161')).toBe('§§ 156 bis 161');
    expect(normalizeLabel('Anlage:')).toBe('Anlage');
  });
});

/** Kurze Verordnung mit Titelfußnote; `footnote` ist die Zeile unter „Fußnoten“ (ein Segment). */
function footnoteNorm(footnote: string, options: { listHeavy?: boolean; labels?: string[]; continuation?: boolean } = {}): ParsedJurisPdf & { layoutLeft: number } {
  const pages: PdfPageGeometry[] = [{ page: 1, width: 595.3, height: 841.9 }];
  const words: PdfWord[] = [];
  let y = 60;
  for (const [key, value] of [['Ausfertigungsdatum:', '10.05.2001'], ['Textnachweis ab:', '01.01.2003'], ['Dokumenttyp:', 'Verordnung'], ['Gliederungs-Nr:', '791-4-200']] as const) {
    words.push(...lineWords(1, y, [{ x: 58, text: key }, { x: 204, text: value }]));
    y += 16;
  }
  y += 24;
  for (const text of ['Landesverordnung', 'zur einstweiligen Sicherstellung', 'Vom 10. Mai 2001']) {
    words.push(...centered(1, y, text));
    y += 15;
  }
  y += 11;
  words.push(...left(1, y, 'Zum 18.09.2026 aktuellste verfügbare Fassung der Gesamtausgabe'));
  y += 26;
  words.push(...left(1, y, 'Fußnoten'));
  y += 26;
  words.push(...left(1, y, footnote));
  y += 26;
  words.push(...left(1, y, 'Nichtamtliches Inhaltsverzeichnis'));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 247, text: 'Titel' }, { x: 467, text: 'Gültig ab' }]));
  y += 24;
  words.push(...lineWords(1, y, [{ x: 84, text: '§ 1 - Sicherstellung' }, { x: 447, text: '01.01.2003' }]));
  y += 30;
  words.push(...centered(1, y, '§1'));
  y += 15;
  words.push(...centered(1, y, 'Sicherstellung'));
  y += 26;
  words.push(...left(1, y, 'Das Gebiet wird einstweilig sichergestellt; es gelten die folgenden Verbote für alle Personen, die'));
  y += 15;
  words.push(...left(1, y, 'das Gebiet betreten:'));
  // Listenlastig: viele volle Zeilen mit der Einrückung der Aufzählung, wenige am Satzspiegel.
  const labels = options.labels ?? Array.from({ length: options.listHeavy ? 6 : 1 }, (_, index) => `${index + 1}.`);
  for (const label of labels) {
    y += 26;
    words.push(...lineWords(1, y, [{ x: 77, text: label }, { x: 105, text: 'das Befahren, Betreten und Befestigen von Flächen außerhalb der vorhandenen Wege und Plätze' }]));
    if (options.continuation === false) continue;
    y += 15;
    words.push(...left(1, y, 'sowie das Lagern von Gegenständen jeder Art, soweit nicht zugelassen und angezeigt,', 105));
  }
  const layout = buildLayout(pages, words);
  return Object.assign(parseJurisPdf(layout), { layoutLeft: layout.left });
}

describe('juris-PDF: Fußnotenzeichen, leere Fußnoten, Satzspiegel', () => {
  it('erkennt „[1])“ als Fußnotenzeichen, auch im selben Segment wie der Text', () => {
    const parsed = footnoteNorm('[1]) Fristablauf 31.12.2004');
    expect(parsed.body[0]).toMatchObject({ type: 'footnote', label: '[1])', text: 'Fristablauf 31.12.2004' });
    expect(classifyEdition(parsed, false)).toMatchObject({ class: 'undetermined' });
    expect(classifyEdition(parsed, false).basis).toMatch(/Fristablauf/u);
  });

  it('entfernt ein Fußnotenzeichen ohne Text und meldet es (Review statt erfundenem Inhalt)', () => {
    const parsed = footnoteNorm('*)');
    expect(parsed.body.some((block) => block.type === 'footnote')).toBe(false);
    expect(parsed.findings.map((finding) => finding.code)).toContain('empty-footnote');
  });

  it('hält Aufzählungen mit „a.“, „(b)“, Dezimalgliederung und Artikelüberschriften nicht für Tabellen', () => {
    const parsed = footnoteNorm('*) Test', { labels: ['a.', 'b.', 'aa.', '(c)', '8.2', '1.1.1.', 'Artikel 2'], continuation: false });
    expect(parsed.findings.filter((finding) => finding.code === 'table-layout')).toEqual([]);
    const table = footnoteNorm('*) Test', { labels: ['HB', 'HH', 'BY'], continuation: false });
    expect(table.findings.map((finding) => finding.code)).toContain('table-layout');
  });

  it('nimmt bei listenlastigen Normen den Satzspiegel der Ausgabe als linken Rand', () => {
    const parsed = footnoteNorm('*) Test', { listHeavy: true });
    expect(parsed.layoutLeft).toBe(77);
    expect(parsed.title).toBe('Landesverordnung zur einstweiligen Sicherstellung Vom 10. Mai 2001');
  });
});

describe('juris-PDF: Titel von Verwaltungsvorschriften', () => {
  it('nimmt den ganzen Block zwischen Kopf und „Gl.Nr.“-Zeile als Titel, auch wenn er voll breit gesetzt ist', () => {
    const pages: PdfPageGeometry[] = [{ page: 1, width: 595.3, height: 841.9 }];
    const words: PdfWord[] = [];
    let y = 60;
    for (const [key, value] of [['Normgeber:', 'Ministerium'], ['Erlassdatum:', '15.01.2010'], ['Fassung vom:', '15.01.2010'], ['Gültig ab:', '15.01.2010'], ['Gliederungs-Nr:', '7521.17'], ['Norm:', '§ 34 WG'], ['Fundstelle:', 'Amtsbl SH 2010, 199']] as const) {
      words.push(...lineWords(1, y, [{ x: 58, text: key }, { x: 204, text: value }]));
      y += 16;
    }
    y += 40;
    words.push(...left(1, y, 'Einführung der DIN 4261 Kleinkläranlagen als allgemein anerkannte Regeln der Technik und', 86));
    y += 15;
    words.push(...left(1, y, 'landesrechtliche Regelung gemäß Anhang 1 der Abwasserverordnung für Wartungsberichte', 81));
    y += 30;
    words.push(...centered(1, y, 'Gl.Nr. 7521.17'));
    y += 30;
    words.push(...left(1, y, 'Bekanntmachung des Ministeriums vom 15. Januar 2010'));
    y += 26;
    words.push(...left(1, y, 'Das Ministerium hat die Norm eingeführt und macht dies bekannt.'));
    const parsed = parseJurisPdf(buildLayout(pages, words));
    expect(parsed.header.Norm).toBe('§ 34 WG');
    expect(parsed.title).toBe('Einführung der DIN 4261 Kleinkläranlagen als allgemein anerkannte Regeln der Technik und landesrechtliche Regelung gemäß Anhang 1 der Abwasserverordnung für Wartungsberichte');
    expect(parsed.findings.map((finding) => finding.code)).not.toContain('title-missing');
  });
});

describe('juris-PDF: SH-Modell und Stichtag', () => {
  const document = { documentId: 'jlr-NNLSH0000TEST', area: 'landesrecht' as const, url: pdfExportUrl('jlr-NNLSH0000TEST', 'gesamtausgabe'), sha256: 'a'.repeat(64), retrievedAt: '2026-09-18T12:00:00.000Z', byteLength: 1000 };

  it('übernimmt nur Metadaten, die die Ausgabe nennt; Quellidentität DOKNR, Permalink als stabile Adresse', () => {
    const { law } = toSourceLaw(parsedNorm(), document);
    expect(law).toMatchObject({ title: 'Landesverordnung über Testfälle (Testverordnung - TestVO)', shortTitle: 'Testverordnung', abbr: 'TestVO', type: 'verordnung', documentDate: '2020-02-01', citation: 'GVOBl. 2020, 1', sourceIdentity: 'jlr-NNLSH0000TEST' });
    expect(law.externalIdentifiers).toEqual([
      { system: 'juris-sh', value: 'jlr-NNLSH0000TEST', url: 'https://www.gesetze-rechtsprechung.sh.juris.de/perma?d=jlr-NNLSH0000TEST' },
      { system: 'gliederungsnummer-sh', value: '2000-1-1' },
    ]);
    expect(law.sourceReferences[0]).toMatchObject({ kind: 'official-portal-snapshot', mediaType: 'application/pdf', sourceRole: 'structure-bearing', retrievedAt: '2026-09-18', externalId: 'jlr-NNLSH0000TEST', sourceNumber: '2000-1-1' });
    expect(splitTitle('Gesetz über X (Beispielgesetz - BspG -) Vom 1. Mai 2000')).toMatchObject({ title: 'Gesetz über X (Beispielgesetz - BspG -)', shortTitle: 'Beispielgesetz', abbrInTitle: 'BspG' });
  });

  it('ordnet den Stichtag aus Kopf, Ausgabevermerk und Verzeichnis ein', () => {
    const parsed = parsedNorm();
    expect(classifyEdition(parsed, false)).toMatchObject({ class: 'unchanged-since-baseline' });
    const changed = { ...parsed, toc: [...parsed.toc, { label: '§ 3', title: 'Neu', validFrom: '2024-05-01' }] };
    expect(classifyEdition(changed, false)).toMatchObject({ class: 'changed-after-baseline', changedUnits: ['§ 3'] });
    expect(classifyEdition({ ...parsed, header: { ...parsed.header, 'Gültig ab': '01.01.2024' } }, false).class).toBe('enacted-after-baseline');
    expect(classifyEdition({ ...parsed, header: { ...parsed.header, 'Gültig bis': '31.12.2022' } }, false).class).toBe('repealed-before-baseline');
    expect(classifyEdition({ ...parsed, body: [], statusNote: 'V aufgeh. durch …', header: { ...parsed.header, 'Gültig bis': '30.04.2025' } }, false).class).toBe('repealed-after-baseline');
  });
});

describe('Historische Einzelfassungen', () => {
  const unit = (nn: number, key: string, validFrom?: string, validTo?: string): UnitVersion => ({
    documentId: `jlr-NNLSH0000TESTNN${String(nn).padStart(11, '0')}`,
    nn,
    key,
    ...(validFrom ? { validFrom } : {}),
    ...(validTo ? { validTo } : {}),
    parsed: {} as ParsedJurisPdf,
    layout: {} as UnitVersion['layout'],
    raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
  });

  it('wählt je Einheit die am Stichtag geltende Fassung, lässt spätere und frühere weg und meldet Überlappungen', () => {
    const selection = selectBaselineUnits([
      unit(1, 'Eingangsformel', '2003-01-01'),
      unit(2, '§ 1', '2018-07-31', '2023-07-29'),
      unit(3, '§ 1', '2023-07-30', '2024-12-17'),
      unit(4, '§ 1', '2024-12-18'),
      unit(5, '§ 2', '2025-01-01'),
      unit(6, '§ 3', '2018-01-01', '2020-12-31'),
    ]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([1, 3]);
    expect(selection.omitted.map((entry) => entry.key)).toEqual(['§ 2', '§ 3']);
    expect(selection.problems).toEqual([]);
    const overlap = selectBaselineUnits([unit(1, '§ 1', '2020-01-01'), unit(2, '§ 1', '2023-01-01')]);
    expect(overlap.problems[0]).toMatch(/2 Fassungen gelten zugleich/u);
    const gap = selectBaselineUnits([unit(1, '§ 1', '2020-01-01', '2023-06-30'), unit(2, '§ 1', '2024-01-01')]);
    expect(gap.problems[0]).toMatch(/Lücke am Stichtag/u);
    expect(unitNumber('jlr-NNLSH00002BC4NN00000000009')).toBe(9);
  });

  it('liest Einheiten je Rahmendokument aus der Sitemap', () => {
    const base = 'https://www.gesetze-rechtsprechung.sh.juris.de/bssh/document/';
    const byFrame = unitIdsByFrame([[`${base}jlr-NNLSH0000000A`, `${base}jlr-NNLSH0000000ANN00000000001`, `${base}jlr-NNLSH0000000ANN00000000002`, `${base}VVSH-VVSH000000001`]]);
    expect([...byFrame.entries()]).toEqual([['jlr-NNLSH0000000A', ['jlr-NNLSH0000000ANN00000000001', 'jlr-NNLSH0000000ANN00000000002']]]);
  });
});

describe('Öffentlicher Ausgabeweg (PDF) mit anonymer Sitzung', () => {
  const ORIGIN = 'https://www.gesetze-rechtsprechung.sh.juris.de';
  const PDF = new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n%synthetic')]);

  function server(calls: Array<{ url: string; cookie: string | null }>): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get('cookie');
      calls.push({ url, cookie });
      if (url.startsWith(`${ORIGIN}/perma?d=`)) return new Response(null, { status: 301, headers: { location: `${ORIGIN}/jportal/perma?portal=bssh&d=x` } });
      if (url.startsWith(`${ORIGIN}/jportal/perma?`)) {
        const headers = new Headers({ location: `${ORIGIN}/bssh/?query=DOKNR%3Ax` });
        headers.append('set-cookie', 'JSESSIONID=abc; Path=/; Secure');
        headers.append('set-cookie', 'jwtCookie=token; Path=/');
        return new Response(null, { status: 302, headers });
      }
      if (url.startsWith(`${ORIGIN}/bssh/`)) return new Response('<html><body><div id="main" aria-busy="true"></div></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.startsWith(`${ORIGIN}/jportal/recherche3doc/`)) {
        if (cookie?.includes('jwtCookie=token')) return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });
        return new Response('Leider kann die angeforderte Ausgabe nicht durchgeführt werden, da Ihre letzte Sitzung bereits beendet wurde.', { status: 200, headers: { 'content-type': 'text/plain;charset=ISO-8859-1' } });
      }
      return new Response('nicht gefunden', { status: 404 });
    }) as typeof fetch;
  }

  it('eröffnet die Sitzung über den öffentlichen Permalink, lädt das PDF per GET ohne CSRF und ersetzt einen Hinweistext im Cache', async () => {
    const root = await tempRoot();
    const calls: Array<{ url: string; cookie: string | null }> = [];
    const noSleep = async (): Promise<void> => undefined;
    const client = createExportClient({ root, sleep: noSleep, minDelayMs: 0, baseFetch: server(calls) });
    const document = await client.pdf('jlr-NNLSH00002D11', 'gesamtausgabe');
    expect(new TextDecoder().decode(document.bytes.slice(0, 5))).toBe('%PDF-');
    expect(client.stats.client.sessionsOpened).toBe(1);
    expect(calls.some((call) => call.url.includes('/wsrest/'))).toBe(false);
    expect(calls.filter((call) => call.url.includes('recherche3doc')).map((call) => Boolean(call.cookie))).toEqual([false, true]);
    // Wiederholung: aus dem Cache, ohne Netz.
    const again = await client.pdf('jlr-NNLSH00002D11', 'gesamtausgabe');
    expect(again.fromCache).toBe(true);
    expect(pdfExportUrl('jlr-NNLSH00002D11', 'dokument')).toContain(encodeURIComponent('"docId":"jlr-NNLSH00002D11"'));
    expect(pdfExportUrl('jlr-NNLSH00002D11', 'gesamtausgabe')).toContain(encodeURIComponent('"docPart":"X"'));
  });

  it('hält einen gemeinsamen Mindestabstand über alle Anfragen', async () => {
    const waits: number[] = [];
    let now = 0;
    const limited = rateLimitedFetch((async () => new Response('ok')) as typeof fetch, 1000, async (ms) => { waits.push(ms); now += ms; }, () => now);
    await limited('https://example.invalid/a');
    await limited('https://example.invalid/b');
    await limited('https://example.invalid/c');
    expect(waits).toEqual([1000, 1000]);
  });
});
