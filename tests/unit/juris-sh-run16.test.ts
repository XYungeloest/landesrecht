/**
 * juris-SH-Adapter, Run 16: Tabellenbelege über das sichere Raster hinaus. Jede Regel mit der Geometrie eines echten
 * Falls aus der juris-Ausgabe (Seitenmaße, Abstände und Spaltenränder wie im Textlayer) und mindestens einem
 * Gegenbeispiel, das nicht als Tabelle gelesen werden darf. Synthetisch, kein Netz.
 */
import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { buildBody, isRowNumberSuccessor, wrappedGrid, type ParseFinding, type RelocatedLine } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import type { PdfLayout, PdfLine } from '@landesrecht/importer-juris-sh/parse/pdf-layout.ts';

const H = 15.8;

function line(y: number, gapBefore: number, segments: Array<[number, number, string]>, over: Partial<PdfLine> = {}): PdfLine {
  const text = segments.map(([, , value]) => value).join(' ');
  return { page: 1, index: y, x0: segments[0]![0], x1: segments.at(-1)![1], y0: y - H, y1: y, height: H, segments: segments.map(([x0, x1, value]) => ({ x0, x1, text: value })), text, superscripts: [], plainText: text, gapBefore, ...over };
}

/** Satzspiegel der juris-Ausgabe: Zeilenabstand -1 (Kästen überlappen), Absatzschwelle 2,2. */
function layoutOf(lines: PdfLine[]): PdfLayout {
  return { pages: [{ page: 1, width: 595.3, height: 841.9 }], lines, bodyHeight: H, left: 77, right: 537.7, lineGap: -1, paragraphGap: 2.2 };
}

const cells = (table: NormBodyBlock): string[][] => table.children!.map((row) => row.children!.map((cell) => `${cell.colspan ? `[${cell.colspan}]` : ''}${cell.text ?? ''}`));

function grid(lines: PdfLine[], at = 0, lookbehind = true): string[][] | { rejection: string } {
  const result = wrappedGrid(lines, at, layoutOf(lines), { lookbehind });
  return 'table' in result ? cells(result.table) : { rejection: result.rejection };
}

function body(lines: PdfLine[]): { blocks: NormBodyBlock[]; findings: ParseFinding[] } {
  const findings: ParseFinding[] = [];
  const reorders: RelocatedLine[] = [];
  return { blocks: buildBody(lines, layoutOf(lines), findings, false, [], reorders), findings };
}

const tables = (blocks: NormBodyBlock[]): NormBodyBlock[] => blocks.flatMap((block) => (block.type === 'table' ? [block] : tables(block.children ?? [])));

describe('Run 16: Kopfzeilen (header-unassigned)', () => {
  // jlr-NNLSH00002A78 (Abgeordnetengesetz): Kopfzellen breiter als ihre Zahlenspalten, „Zahlungsgrenze“ über zwei Spalten.
  const header = [
    line(100, 21, [[83, 136, 'Geburtsjahr'], [186, 286, 'Anhebung um Monate'], [353, 426, 'Zahlungsgrenze']]),
    line(121, 21, [[342, 360, 'Jahr'], [416, 444, 'Monat']]),
    line(143, 22, [[83, 106, '1947'], [233, 239, '1'], [346, 357, '65'], [427, 433, '1']]),
    line(164, 21, [[83, 106, '1948'], [233, 239, '2'], [346, 357, '65'], [427, 433, '2']]),
    line(185, 21, [[83, 106, '1956'], [230, 242, '10'], [346, 357, '65'], [424, 435, '10']]),
  ];

  it('ordnet eine Kopfzelle bündig über ihrer schmaleren Spalte zu, die Unterköpfe bilden eine eigene Zeile', () => {
    expect(grid(header)).toEqual([
      ['Geburtsjahr', 'Anhebung um Monate', '[2]Zahlungsgrenze'],
      ['', '', 'Jahr', 'Monat'],
      ['1947', '1', '65', '1'],
      ['1948', '2', '65', '2'],
      ['1956', '10', '65', '10'],
    ]);
  });

  it('Gegenbeispiel: eine nicht bündige, nicht zentrierte breite Einzelzelle bleibt unzugeordnet', () => {
    const shifted = [line(100, 21, [[95, 150, 'Geburtsjahr'], [186, 286, 'Anhebung um Monate'], [353, 426, 'Zahlungsgrenze']]), ...header.slice(1)];
    expect(grid(shifted)).toMatchObject({ rejection: 'header-unassigned' });
  });

  // jlr-NNLSH000031A3 / 31A7 (Lärmschutzbereiche): „Koordinaten“ über „X | Y“, keine der beiden Spalten überdeckt.
  const coordinates = [
    line(100, 21, [[81, 139, 'Bezeichnung'], [271, 326, 'Koordinaten']]),
    line(115, -1, [[81, 139, 'Kurvenpunkt']]),
    line(121, 6, [[232, 238, 'X'], [360, 365, 'Y']]),
    line(142, 21, [[107, 113, '1'], [205, 265, '32456729.73'], [336, 390, '6085270.00']]),
    line(163, 21, [[107, 113, '2'], [205, 265, '32456725.01'], [336, 390, '6085280.00']]),
  ];

  it('nimmt eine spaltenübergreifende Kopfzelle mit Unterköpfen darunter', () => {
    expect(grid(coordinates)).toEqual([
      ['Bezeichnung Kurvenpunkt', '[2]Koordinaten'],
      ['', 'X', 'Y'],
      ['1', '32456729.73', '6085270.00'],
      ['2', '32456725.01', '6085280.00'],
    ]);
  });

  it('Gegenbeispiel: allein in ihrer Zeile und ohne Unterköpfe darunter ist die übergreifende Zelle nicht belegt', () => {
    const lonely = [line(100, 21, [[271, 326, 'Koordinaten']]), ...coordinates.slice(3)];
    expect(grid(lonely)).toMatchObject({ rejection: 'header-unassigned' });
  });

  it('Gegenbeispiel: eine Titelzeile über alle Spalten wird keine Kopfzelle (Koordinatensystem-Zeile vor der Tabelle)', () => {
    const titled = [line(90, 10, [[77, 439, 'Koordinatensystem: UTM-Abbildung in Zone 32, Ellipsoid GRS80, Datum ETRS89']]), ...coordinates.map((entry, position) => (position === 0 ? { ...entry, gapBefore: 10.4 } : entry))];
    expect(grid(titled, 1)).toMatchObject({ rejection: 'header-unassigned' });
    expect(grid(titled, 1, false)).toEqual(grid(coordinates));
    const result = body(titled);
    expect(tables(result.blocks).map(cells)[0]?.[0]).toEqual(['Bezeichnung Kurvenpunkt', '[2]Koordinaten']);
  });
});

describe('Run 16: Zeilennummern und Zeilenrhythmus (columns-vary, ambiguous-row-gap)', () => {
  it('erkennt die Fortsetzung einer Dezimalgliederung', () => {
    expect(isRowNumberSuccessor('7.1', '7.2')).toBe(true);
    expect(isRowNumberSuccessor('4.7', '4.7.1')).toBe(true);
    expect(isRowNumberSuccessor('4.7.1.2', '4.7.2')).toBe(true);
    expect(isRowNumberSuccessor('2.2', '3')).toBe(true);
    expect(isRowNumberSuccessor('2', '2.1')).toBe(true);
    expect(isRowNumberSuccessor('7.1', '7.3')).toBe(false);
    expect(isRowNumberSuccessor('4.7', '4.7.2')).toBe(false);
    expect(isRowNumberSuccessor('9.2', '1.')).toBe(false);
  });

  // jlr-NNLSH00002B97 (Gebührentarif Landeslabor): „2.1 | Fische“ ohne Betragsspalte.
  const tariff = [
    line(100, 21, [[82, 130, 'Tarifstelle'], [164, 222, 'Gegenstand'], [470, 490, 'Euro']]),
    line(121, 21, [[82, 88, '2'], [164, 400, 'Pathologisch-anatomische Zerlegung und Befund']]),
    line(142, 21, [[82, 97, '2.1'], [164, 196, 'Fische']]),
    line(163, 21, [[82, 105, '2.1.1'], [164, 350, 'Fische, Befunderhebung je Sendung'], [470, 490, '5-12']]),
    line(184, 21, [[82, 97, '2.2'], [164, 245, 'Sonstige Tiere'], [460, 490, '50-100']]),
  ];

  it('nimmt Zeilen mit fortgesetzter Nummer auch mit nur zwei Segmenten in die Tariftabelle', () => {
    expect(grid(tariff)).toEqual([
      ['Tarifstelle', 'Gegenstand', 'Euro'],
      ['2', 'Pathologisch-anatomische Zerlegung und Befund', ''],
      ['2.1', 'Fische', ''],
      ['2.1.1', 'Fische, Befunderhebung je Sendung', '5-12'],
      ['2.2', 'Sonstige Tiere', '50-100'],
    ]);
  });

  it('Gegenbeispiel: eine nicht fortsetzende Nummer („5.1“ nach „2“) mit zwei Segmenten beendet die Tabelle', () => {
    const jump = [...tariff.slice(0, 2), line(142, 21, [[82, 97, '5.1'], [164, 196, 'Fische']]), ...tariff.slice(3)];
    const result = wrappedGrid(jump, 0, layoutOf(jump));
    expect('table' in result ? result.end : -1).toBe(2);
  });

  // VVSH-VVSH000004823 (Regionalplan): Tabellenzeilen im Abstand 1,2 (zwischen Zeilen- und Absatzabstand).
  const rhythm = [
    line(100, 1.5, [[139, 187, 'Ahrensbök'], [250, 261, '85'], [336, 501, 'Vogelzug zum Großen Plöner See']]),
    line(117, 1.2, [[139, 220, 'Scharbeutz, Süsel'], [250, 261, '92'], [336, 520, 'Beeinträchtigungsbereich Seeadler']]),
    line(134, 1.2, [[139, 220, 'Scharbeutz, Süsel'], [250, 261, '93']]),
    line(151, 1.2, [[139, 176, 'Ratekau'], [250, 267, '192']]),
  ];

  it('liest Teilzeilen im Zeilenrhythmus der Tabelle als neue Zeilen', () => {
    expect(grid(rhythm)).toEqual([
      ['Ahrensbök', '85', 'Vogelzug zum Großen Plöner See'],
      ['Scharbeutz, Süsel', '92', 'Beeinträchtigungsbereich Seeadler'],
      ['Scharbeutz, Süsel', '93', ''],
      ['Ratekau', '192', ''],
    ]);
  });

  it('Gegenbeispiel: ein Abstand außerhalb des Rhythmus bleibt nicht beweiskräftig', () => {
    const off = [...rhythm.slice(0, 2), { ...rhythm[2]!, gapBefore: 0.5 }, rhythm[3]!];
    expect(grid(off)).toMatchObject({ rejection: 'ambiguous-row-gap' });
  });
});

describe('Run 16: Absätze und Aufzählungen in Zellen', () => {
  // jlr-NNLSH00002AB5 (Ausbildungsplan): Aufzählung in der dritten Spalte, Tabellenzeilen im Abstand 37.
  const plan = [
    line(100, 37, [[82, 89, 'II'], [151, 243, 'Oberste Landwirt-'], [272, 437, 'In diesem Ausbildungsabschnitt wird'], [460, 476, '4,5']]),
    line(115, -0.9, [[151, 229, 'schaftsbehörde'], [272, 447, 'der/die Anwärter/in in folgenden Berei-']]),
    line(130, -0.8, [[272, 338, 'chen geschult:']]),
    line(155, 10.1, [[272, 275, '-'], [302, 428, 'Gesetze, Verordnungen und']]),
    line(170, -0.8, [[302, 436, 'sonstige einschlägige Bestim-']]),
    line(185, -0.8, [[302, 339, 'mungen']]),
    line(214, 14.2, [[272, 275, '-'], [302, 391, 'Verwaltungsabläufe']]),
    line(266, 37, [[82, 92, 'III'], [151, 236, 'Landwirtschafts-'], [272, 437, 'In diesem Ausbildungsabschnitt wird'], [460, 466, '2']]),
    line(281, -0.9, [[151, 225, 'kammer (LWK)'], [272, 447, 'der/die Anwärter/in in folgenden Berei-']]),
    line(296, -0.8, [[272, 338, 'chen geschult:']]),
    line(321, 10.1, [[272, 275, '-'], [302, 369, 'Pflanzenschutz']]),
  ];

  it('nimmt Aufzählungspunkte einer Zelle als Zeilen desselben Zelleninhalts', () => {
    expect(grid(plan)).toEqual([
      ['II', 'Oberste Landwirtschaftsbehörde', 'In diesem Ausbildungsabschnitt wird der/die Anwärter/in in folgenden Bereichen geschult:\n- Gesetze, Verordnungen und sonstige einschlägige Bestimmungen\n- Verwaltungsabläufe', '4,5'],
      ['III', 'Landwirtschaftskammer (LWK)', 'In diesem Ausbildungsabschnitt wird der/die Anwärter/in in folgenden Bereichen geschult:\n- Pflanzenschutz', '2'],
    ]);
  });

  it('Gegenbeispiel: zwei Spalten „Nummer | Überschrift“ mit eingerücktem Absatz sind eine Gliederung, keine Tabelle', () => {
    const outline = [
      line(100, 21, [[77, 89, '1'], [107, 300, 'Begriff des Datenschutz-Behördenaudits']]),
      line(125, 10.1, [[107, 520, 'Die Durchführung eines Audits dient der Verbesserung']]),
      line(146, 21, [[77, 89, '2'], [107, 330, 'Gegenstand des Datenschutz-Behördenaudits']]),
    ];
    const result = wrappedGrid(outline, 0, layoutOf(outline));
    expect('table' in result && result.end > 1).toBe(false);
  });

  it('Gegenbeispiel: ein Absatz nach der Tabelle im Tabellenabstand gehört nicht mehr zur Zelle', () => {
    const after = [...plan.slice(0, 7), line(250, 37, [[272, 520, 'Anmerkung: gilt für alle Abschnitte']])];
    const result = wrappedGrid(after, 0, layoutOf(after));
    expect('table' in result ? result.end : -1).not.toBe(8);
  });
});

describe('Run 16: Bindestrich am Zellenende (hyphenated-cell)', () => {
  // jlr-NNLSH00002BF6 (friesische Ortsnamen): nachgestellter Namensteil „Neu-“ vor einer Zeile im Rhythmus.
  const names = [
    line(100, 21, [[81, 119, 'Arlewatt'], [313, 338, 'Alwat']]),
    line(121, 21, [[81, 167, 'Augustenkoog, Alt-'], [313, 406, 'Uule Augustenkuuch']]),
    line(142, 21, [[81, 172, 'Augustenkoog, Neu-'], [313, 406, 'Naie Augustenkuuch']]),
    line(163, 21, [[81, 114, 'Autrum'], [313, 347, 'Outrem']]),
  ];

  it('behält den Bindestrich eines nachgestellten Namensteils', () => {
    const result = body(names);
    expect(tables(result.blocks).map(cells)).toEqual([[
      ['Arlewatt', 'Alwat'],
      ['Augustenkoog, Alt-', 'Uule Augustenkuuch'],
      ['Augustenkoog, Neu-', 'Naie Augustenkuuch'],
      ['Autrum', 'Outrem'],
    ]]);
  });

  it('Gegenbeispiel: Silbentrennung vor einer abgesetzten Zeile bleibt Befund', () => {
    const split = [names[0]!, line(121, 21, [[81, 200, 'Ausgaben zur Deckung eines kassenmä-'], [313, 406, '13.602.046,2 €']]), names[3]!, line(184, 21, [[81, 130, 'Bargum'], [313, 344, 'Beerch']])];
    const result = wrappedGrid(split, 0, layoutOf(split));
    expect(result).toMatchObject({ rejection: 'hyphenated-cell' });
  });
});

describe('Run 16: keine Verluste und Tabellenbeginn an Tarifnummern', () => {
  it('fällt auf das bisherige Raster zurück, wenn die neuen Belege nicht tragen (großzügiger Kopf-Colspan + Zeilennummer)', () => {
    // Kopfzelle nur „irgendwo über“ zwei Spalten (bisher zugelassen) – die Tabelle bleibt so, wie sie vor Run 16 war.
    const lines = [
      line(100, 21, [[82, 213, 'Anordnung der Einstellplätze'], [262, 431, 'Erforderliche Fahrgassenbreite (in m)']]),
      line(115, -1, [[82, 212, 'zur Fahrgasse im Winkel von'], [262, 405, 'bei einer Einstellplatzbreite von']]),
      line(136, 21, [[262, 294, '2,30 m'], [373, 405, '2,40 m'], [455, 487, '2,50 m']]),
      line(158, 22, [[82, 119, '90 Grad'], [262, 282, '6,50'], [373, 393, '6,00'], [455, 475, '5,50']]),
      line(180, 22, [[82, 119, '45 Grad'], [262, 282, '3,50'], [373, 393, '3,25'], [455, 475, '3,00']]),
    ];
    const result = body(lines);
    const found = tables(result.blocks).map(cells);
    expect(found.some((table) => table[0]?.[0] === 'Anordnung der Einstellplätze zur Fahrgasse im Winkel von')).toBe(false);
  });

  it('beginnt eine Tabelle an einer Tarifnummer mit drei Spalten, aber nicht an einem Inhaltsverzeichnis', () => {
    const tariffStart = [
      line(100, 21, [[82, 105, '3.1.1'], [164, 400, 'für Grundflächen im Vorteilsgebiet'], [430, 530, '0,1 bis 1,0 Beitragseinheiten/ha']]),
      line(121, 21, [[82, 105, '3.1.2'], [164, 400, 'durch das Einleiten von Schmutzwasser'], [430, 530, '0,5 bis 3,0 Beitragseinheiten']]),
      line(142, 21, [[82, 97, '3.2'], [164, 400, 'für Grundflächen, die die Unterhaltung erschweren'], [430, 530, '1 bis 8 Beitragseinheiten']]),
    ];
    expect(tables(body(tariffStart).blocks)).toHaveLength(1);
    const contents = [
      line(100, 21, [[82, 97, '2.1'], [120, 300, 'Legionellen'], [520, 526, '2']]),
      line(121, 21, [[82, 97, '2.2'], [120, 400, 'Technische Regelwerke und Hintergrundpapiere'], [520, 526, '2']]),
      line(142, 21, [[82, 97, '3.1'], [120, 300, 'Verdunstungskühlanlagen'], [520, 526, '4']]),
    ];
    expect(tables(body(contents).blocks)).toHaveLength(0);
  });
});

describe('Run 16: amtliche Inhaltsübersicht als Tabelle', () => {
  // jlr-NNLSH00002AA4 (Gemeindeordnung): Gliederungswörter in der ersten Spalte, Paragraphenbereiche in der zweiten.
  const toc = [
    line(100, 21.7, [[83, 167, 'Inhaltsverzeichnis:']]),
    line(127, 27, [[458, 467, '§§']]),
    line(154, 27, [[83, 129, 'Erster Teil']]),
    line(169, -0.8, [[83, 252, 'Grundlagen der Gemeindeverfassung'], [458, 485, '1 - 10']]),
    line(196, 27, [[83, 209, 'Dritter Teil Gemeindegebiet'], [458, 490, '13 - 16']]),
    line(223, 27, [[83, 237, '1. Abschnitt: Gemeindevertretung'], [458, 490, '27 - 47']]),
    line(250, 27, [[83, 132, 'Achter Teil']]),
    line(40, Number.POSITIVE_INFINITY, [[83, 171, 'Schlussvorschriften'], [458, 507, '132 -135 a']], { page: 2 }),
    line(70, 17.9, [[283, 334, 'Erster Teil']], { page: 2 }),
    line(85, -0.6, [[214, 404, 'Grundlagen der Gemeindeverfassung']], { page: 2 }),
  ];

  it('liest Gliederungswörter nach der Überschrift „Inhaltsverzeichnis“ als Zelleninhalt, auch über den Seitenwechsel', () => {
    const result = wrappedGrid(toc, 3, layoutOf(toc));
    expect('table' in result && cells(result.table)).toEqual([
      ['Erster Teil Grundlagen der Gemeindeverfassung', '1 - 10'],
      ['Dritter Teil Gemeindegebiet', '13 - 16'],
      ['1. Abschnitt: Gemeindevertretung', '27 - 47'],
      ['Achter Teil Schlussvorschriften', '132 -135 a'],
    ]);
    expect('table' in result && result.end).toBe(8);
  });

  it('Gegenbeispiel: ohne die Überschrift „Inhaltsverzeichnis“ bleiben Gliederungswörter Überschriften', () => {
    const plain = toc.slice(2);
    const result = wrappedGrid(plain, 1, layoutOf(plain));
    expect('table' in result && result.end > 2).toBe(false);
  });
});

describe('Run 16: Anlagenbezeichnung mit abgesetztem Buchstaben', () => {
  it('liest „Anlage 1 a:“ wie „Anlage 1a:“ als Anlage (Gegenbeispiel: „Anlage 1 zu § 3“ bleibt „Anlage 1“)', () => {
    const lines = [
      line(100, 10, [[77, 134, 'Anlage 1 a:']]),
      line(115, -1, [[77, 200, 'Ausbildungsplan']]),
      line(140, 10, [[77, 300, 'Die Ausbildung dauert zwei Jahre.']]),
      line(165, 10, [[77, 160, 'Anlage 2 zu § 3']]),
      line(190, 10, [[77, 300, 'Muster des Zeugnisses.']]),
    ];
    const labels = body(lines).blocks.filter((block) => block.type === 'annex').map((block) => block.label);
    expect(labels).toEqual(['Anlage 1 a', 'Anlage 2']);
  });
});

describe('Run 17: Textintegrität bei wiederholtem Tabellenkopf und leerem Fußnotenzeichen', () => {
  it('ordnet eine Tabellenumordnung dem Vorkommen zu, an dem der Normtext sie trägt (jlr-NNLSH000032B5)', async () => {
    const { compareIntegrity } = await import('@landesrecht/importer-juris-sh/parse/integrity.ts');
    // Derselbe Kopf steht zweimal: zuerst als Fließtext (Seite ohne Raster), dann als Tabelle (Zellen zusammengefügt).
    const head = 'Lfd. Register- Angelegenheit\nNr. zeichen';
    const source = `Teil 1\n${head}\n1.1 Akten\nTeil 2\n${head}\n2.1 Akten`;
    const canonical = `Teil 1 ${head.replace('\n', ' ')} 1.1 Akten Teil 2 Lfd. Nr. Registerzeichen Angelegenheit 2.1 Akten`;
    const result = compareIntegrity(source, canonical, [{ reason: 'Tabelle', text: head, replacement: 'Lfd. Nr.\nRegisterzeichen\nAngelegenheit' }]);
    expect(result.class).toBe('explained-difference');
  });

  it('erklärt das entfernte leere Fußnotenzeichen an seiner Stelle, nicht am ersten gleichen Zeichen (VVSH-VVSH000007928)', async () => {
    const { compareIntegrity } = await import('@landesrecht/importer-juris-sh/parse/integrity.ts');
    const source = 'Anlage 1 Einzelheiten\nprotokolliert werden.\n1)\n2) Bei HTTPS Zugriffen';
    const canonical = 'Anlage 1 Einzelheiten protokolliert werden. 2) Bei HTTPS Zugriffen';
    expect(compareIntegrity(source, canonical, [{ reason: 'leeres Fußnotenzeichen', text: '1)' }]).class).toBe('explained-difference');
    // Gegenbeispiel: ohne Erklärung bleibt der Verlust ein Befund.
    expect(compareIntegrity(source, canonical, []).class).not.toBe('explained-difference');
  });
});
