import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAnchorMap, countBlockTypes, getStructuralReference, getStructuralReferenceNumber } from '@landesrecht/legal-core/lib/body.ts';
import { parseBodyBlocks, type NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { extractFootnoteMarkers, parseDivisionHeading, parseItem, parseSubparagraph, parseUnitHeading, tableBlock } from '@landesrecht/importer-recht-nrw/common/body-common.ts';
import { bodyMetrics, checkParseIntegrity, rawMetrics } from '@landesrecht/importer-recht-nrw/common/integrity.ts';
import { parseLegacyDocument, repairLegacyMarkup } from '@landesrecht/importer-recht-nrw/common/legacy-parser.ts';
import { parseNativeDocument } from '@landesrecht/importer-recht-nrw/common/native-parser.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';
import { extractStructuralIntents } from '@landesrecht/search/query.ts';

const fixtures = join(process.cwd(), 'tests', 'fixtures', 'recht-nrw');
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

function find(blocks: NormBodyBlock[], predicate: (block: NormBodyBlock) => boolean): NormBodyBlock | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block;
    const nested = block.children ? find(block.children, predicate) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

describe('Strukturerkennung', () => {
  it('erkennt Gliederungen, Einheiten, Absätze, Nummerierungen und Fußnotenmarken', () => {
    expect(parseDivisionHeading('Erster Teil')).toEqual({ level: 'part', label: 'Erster Teil' });
    expect(parseDivisionHeading('2. Abschnitt')).toEqual({ level: 'section', label: '2. Abschnitt' });
    expect(parseDivisionHeading('Erster Abschnitt - Von den Grundrechten')).toEqual({ level: 'section', label: 'Erster Abschnitt', title: 'Von den Grundrechten' });
    expect(parseDivisionHeading('Kapitel 3 Verfahren')).toEqual({ level: 'chapter', label: 'Kapitel 3', title: 'Verfahren' });
    expect(parseDivisionHeading('Inhaltsübersicht')).toBeNull();
    expect(parseUnitHeading('§ 3a Elektronische Kommunikation')).toEqual({ unitType: 'paragraph', label: '§ 3a', title: 'Elektronische Kommunikation' });
    expect(parseUnitHeading('Artikel 12')).toEqual({ unitType: 'article', label: 'Artikel 12' });
    expect(parseUnitHeading('Art. 5 Gemeinderat')).toEqual({ unitType: 'article', label: 'Art. 5', title: 'Gemeinderat' });
    expect(parseSubparagraph('(3a) Text')).toEqual({ label: '(3a)', text: 'Text' });
    expect(parseItem('1. Punkt')).toEqual({ label: '1.', text: 'Punkt', level: 0 });
    expect(parseItem('b) Buchstabe')).toEqual({ label: 'b)', text: 'Buchstabe', level: 1 });
    expect(extractFootnoteMarkers('§ 5 (Fn 4, 6) Bezüge')).toEqual({ text: '§ 5 Bezüge', footnotes: ['4', '6'] });
  });
});

describe('Legacy-Parser (Word-HTML)', () => {
  const result = parseLegacyDocument(fixture('legacy-text.htm'));

  it('liest Kopf, Einheiten, Absätze, verschachtelte Listen, Anlage mit Tabelle und Fußnoten', () => {
    expect(result.head.titleLines).toEqual(['Testgesetz', 'für das Land Nordrhein-Westfalen', '(Testgesetz NRW – TestG NRW)']);
    expect(result.head.issuedLine).toBe('Vom 7. März 1995');
    expect(result.head.citationNote).toMatch(/^GV\. NRW\. 1995 S\. 196/u);
    expect(result.stats.unitLabels).toEqual(['§ 1', '§ 2']);
    expect(result.footnotes.map((footnote) => footnote.label)).toEqual(['1', '2', '3']);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.findings.some((finding) => finding.code === 'empty-footnote')).toBe(true);
    const types = countBlockTypes(result.blocks);
    expect(types.part).toBe(1);
    expect(types.section).toBe(1);
    expect(types.paragraph).toBe(2);
    expect(types.subparagraph).toBe(4);
    expect(types.item).toBe(2);
    expect(types.subitem).toBe(2);
    expect(types.table).toBe(2);
    expect(types.annex).toBe(1);
    expect(types.signature).toBe(1);
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
  });

  it('verschachtelt Buchstaben unter Nummern und hängt Fußnoten an die Einheit', () => {
    const paragraph2 = find(result.blocks, (block) => block.type === 'paragraph' && block.label === '§ 2')!;
    const item2 = find(paragraph2.children!, (block) => block.type === 'item' && block.label === '2.')!;
    expect(item2.children?.map((child) => child.label)).toEqual(['a)', 'b)']);
    const paragraph1 = find(result.blocks, (block) => block.type === 'paragraph' && block.label === '§ 1')!;
    expect(paragraph1.children?.at(0)).toMatchObject({ type: 'footnote', label: 'Fn 2' });
    // Ungeschlossene Word-Hilfselemente (<U6:P>) verlieren keinen Text.
    expect(paragraph1.children?.some((child) => child.type === 'subparagraph' && child.label === '(2)' && child.text?.startsWith('Es gilt für Behörden'))).toBe(true);
  });

  it('übernimmt Anlage und Tabelle strukturiert (colspan bleibt erhalten)', () => {
    const annex = result.blocks.find((block) => block.type === 'annex')!;
    expect(annex.label).toBe('Anlage 1');
    expect(annex.title).toBe('Gebührentabelle');
    const table = annex.children!.find((block) => block.type === 'table')!;
    expect(table.children).toHaveLength(3);
    expect(table.children![2]!.children![0]).toMatchObject({ type: 'tableCell', text: 'Zwischensumme', colspan: 2 });
  });

  it('meldet unbekannte Strukturen und Bilder statt sie zu verwerfen', () => {
    const broken = parseLegacyDocument(fixture('legacy-text.htm').replace('<p>(1) Zuständig sind</p>', '<p class=unbekannt>(1) Zuständig sind</p><blink>x</blink><p><img src="a.png"> Bild</p>'));
    const codes = broken.findings.map((finding) => finding.code);
    expect(codes).toContain('unknown-paragraph-class');
    expect(codes).toContain('unknown-block-element');
    expect(codes).toContain('image-in-text');
  });
});

describe('Nativer Parser (Drupal)', () => {
  const page = parseVersionPage(fixture('version-page-native.html'), 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw');
  const result = parseNativeDocument(page.content.format === 'native' ? page.content.bodyHtml : '');

  it('liest Vorspann, Einheiten mit Überschrift, Absätze, Listen, Tabelle, Fußnoten und Schlussformel', () => {
    expect(result.issuedLine).toBe('Vom 16. November 2006');
    expect(result.stats.unitLabels).toEqual(['§ 1', '§ 2']);
    expect(result.footnotes).toHaveLength(1);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    const types = countBlockTypes(result.blocks);
    expect(types.section).toBe(1);
    expect(types.paragraph).toBe(2);
    expect(types.subparagraph).toBe(2);
    expect(types.item).toBe(2);
    expect(types.subitem).toBe(1);
    expect(types.table).toBe(1);
    expect(types.tableHeaderCell).toBe(2);
    expect(types.signature).toBe(2);
    expect(types.footnote).toBe(1);
    const paragraph1 = find(result.blocks, (block) => block.type === 'paragraph' && block.label === '§ 1')!;
    expect(paragraph1.title).toBe('Begriffe');
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
  });

  it('ordnet die Gliederungsüberschrift aus dem Vorspann der Einheit korrekt zu', () => {
    const section = result.blocks.find((block) => block.type === 'section')!;
    expect(section.label).toBe('Erster Abschnitt');
    expect(section.title).toBe('Allgemeines');
    expect(section.children?.map((child) => child.label)).toEqual(['§ 1', '§ 2']);
  });
});

describe('Römisch nummerierte Artikel', () => {
  // Gekürzt aus recht.nrw.de/lrgv/gesetz/27022014-gesetz-zur-anpassung-landesrechtlicher-straf-und-bussgeldvorschriften-das
  const SPAN_SECTION = '<section class="legaldoc-article"><div class="paragraph paragraph--type--article"><div class="paragraph-header article-header"><h2><span class="field field--field_num">Artikel I bis III</span></h2></div>'
    + '<div class="footnote-container"><div class="footnote-item"><div class="field field--field_footnote_description"><div class="tex2jax_process"><p>entfällt; sind in die jeweiligen Bestimmungen eingearbeitet worden.</p></div></div></div></div>'
    + '<div class="field field--field_text"><div class="tex2jax_process"><p class="text-align-center">ZWEITER ABSCHNITT</p><p class="text-align-center"><strong>Änderung von Vorschriften auf dem Gebiete<br>des Rechts der Verwaltung</strong></p></div></div></div></section>';

  it('erkennt „Artikel <römisch>“ nur mit Option und nur als vollständige, wohlgeformte Zahl', () => {
    expect(parseUnitHeading('Artikel I')).toBeNull();
    expect(parseUnitHeading('Artikel I', { romanArticles: true })).toEqual({ unitType: 'article', label: 'Artikel I' });
    expect(parseUnitHeading('Art. XLVIII', { romanArticles: true })).toEqual({ unitType: 'article', label: 'Art. XLVIII' });
    expect(parseUnitHeading('Artikel 12 Zuständigkeit', { romanArticles: true })).toEqual({ unitType: 'article', label: 'Artikel 12', title: 'Zuständigkeit' });
    // Spannen und Aufzählungen bleiben fail-closed; „IL“ ist keine wohlgeformte römische Zahl.
    expect(parseUnitHeading('Artikel I bis III', { romanArticles: true })).toBeNull();
    expect(parseUnitHeading('Art. VIII bis XI', { romanArticles: true })).toBeNull();
    expect(parseUnitHeading('Artikel XXVIII und XXIX', { romanArticles: true })).toBeNull();
    expect(parseUnitHeading('Artikel IL', { romanArticles: true })).toBeNull();
    // Gliederungsebenen mit römischer Nummer sind keine Artikel.
    expect(parseUnitHeading('Teil I', { romanArticles: true })).toBeNull();
    expect(parseUnitHeading('Abschnitt II', { romanArticles: true })).toBeNull();
    expect(parseUnitHeading('Anlage II', { romanArticles: true })).toBeNull();
    expect(parseDivisionHeading('Teil I')).toEqual({ level: 'part', label: 'Teil I' });
    expect(parseDivisionHeading('Abschnitt II')).toEqual({ level: 'section', label: 'Abschnitt II' });
  });

  it('liest ein natives Dokument mit Artikel I/II unter „Teil I“ und bildet Anker und Strukturreferenzen', () => {
    const html = fixture('native-roman-articles.html');
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.stats.unitLabels).toEqual(['Artikel I', 'Artikel II']);
    const part = result.blocks.find((block) => block.type === 'part')!;
    expect(part.label).toBe('Teil I');
    expect(part.children?.filter((child) => child.type === 'article').map((child) => child.label)).toEqual(['Artikel I', 'Artikel II']);
    const article1 = find(result.blocks, (block) => block.type === 'article' && block.label === 'Artikel I')!;
    expect(article1.children?.at(0)).toMatchObject({ type: 'footnote', label: 'Fn 2' });
    expect(article1.children?.filter((child) => child.type === 'item').map((child) => child.label)).toEqual(['1.', '2.', '3.', '4.']);
    const anchors = [...buildAnchorMap(result.blocks).values()];
    expect(anchors).toEqual(['teil-i', 'artikel-i', 'artikel-ii']);
    expect(getStructuralReference(article1)).toEqual({ article: 'i' });
    expect(getStructuralReference(find(result.blocks, (block) => block.label === 'Artikel II')!)).toEqual({ article: 'ii', subsections: ['1'] });
    expect(getStructuralReference(part)).toBeUndefined();
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
    // Die parserunabhängige Zählung im Roh-HTML muss zum Parser passen.
    expect(rawMetrics('native', html).units).toBe(result.stats.units);
  });

  it('lässt Artikelspannen („Artikel I bis III“) fail-closed und zählt sie auch im Roh-HTML nicht', () => {
    const result = parseNativeDocument(SPAN_SECTION);
    expect(result.findings).toContainEqual(expect.objectContaining({ severity: 'error', code: 'unparsed-unit-heading', message: 'Einheitennummer nicht erkannt: „Artikel I bis III“' }));
    expect(result.stats.unitLabels).toEqual([]);
    expect(find(result.blocks, (block) => block.type === 'heading' && block.title === 'Artikel I bis III')).toBeDefined();
    expect(rawMetrics('native', SPAN_SECTION).units).toBe(0);
    expect(rawMetrics('native', SPAN_SECTION.replace('Artikel I bis III', 'Artikel III (Fn 1)')).units).toBe(1);
  });

  it('adressiert römische Artikel in Strukturreferenz und Suchanfrage kleingeschrieben, ohne mit arabischen zu kollidieren', () => {
    expect(getStructuralReferenceNumber('Artikel IV')).toBe('iv');
    expect(getStructuralReferenceNumber('Art. XLVIII')).toBe('xlviii');
    expect(getStructuralReferenceNumber('Artikel 4')).toBe('4');
    expect(getStructuralReferenceNumber('Teil I')).toBeUndefined();
    expect(getStructuralReferenceNumber('Artikel I bis III')).toBeUndefined();
    expect(extractStructuralIntents('Art. IV Landesmediengesetz').references).toEqual([{ kind: 'article', number: 'iv' }]);
    expect(extractStructuralIntents('Artikel vom 3. Mai').references).toEqual([]);
    expect(extractStructuralIntents('Artikel Ich').references).toEqual([]);
  });
});

describe('Tabellen: Parser und Integritätszählung stimmen überein', () => {
  it('Legacy: Fußnotentabelle mit gemischt geschriebenen Ankern („Fn2“), Beschriftung ohne Anker und leerer Schlusszeile', () => {
    // Auszug aus /system/files/BH/24244-24353.htm (Landesamt für Finanzen) und BH/51994-26206.htm (AVwGebO).
    const html = `<html><body><div class=WordSection1>
<p class=lrueberschrift>Testgesetz</p>
<p class=lrdetail>§ 1 (Fn 2)<br>Zweck</p>
<p>(1) Dieses Gesetz regelt die Errichtung des Landesamtes für Finanzen als Landesoberbehörde. (Fn 3)</p>
<table class=MsoNormalTable border=0 cellspacing=0 cellpadding=0 width="99%" style='width:99.18%;border-collapse:collapse'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'><td width="10%" valign=top><p class=MsoNormal><a name=FN1></a><span class=SpellE><span style='mso-bookmark: FN1'>Fn</span></span><span style='mso-bookmark:FN1'> 1</span></p></td>
  <td width="90%" valign=top><p class=lrfundstelle>In Kraft getreten am 1. September 2013 (GV. NRW. S. 482); geändert durch Artikel 1 des Gesetzes vom 18. Dezember 2018 (GV. NRW. S. 818).</p></td></tr>
 <tr style='mso-yfti-irow:1'><td width="10%" valign=top><p class=MsoNormal><a name=Fn2></a><span class=SpellE><span style='mso-bookmark: Fn2'>Fn</span></span><span style='mso-bookmark:Fn2'> 2</span></p></td>
  <td width="90%" valign=top><p class=lrfundstelle>§ 1 geändert und § 7 aufgehoben durch Artikel 1 des Gesetzes vom 18. Dezember 2018 (GV. NRW. S. 818).</p></td></tr>
 <tr style='mso-yfti-irow:2'><td width="10%" valign=top><p class=MsoNormal>Fn 3</p></td>
  <td width="90%" valign=top><p class=lrfundstelle>Tarifstelle 03 geändert durch Artikel 2 der Verordnung vom 8. August 2023 (GV. NRW. S. 490).</p></td></tr>
 <tr style='mso-yfti-irow:3;mso-yfti-lastrow:yes'><td width="10%" valign=top><p class=MsoNormal><o:p>&nbsp;</o:p></p></td><td width="90%" valign=top><p class=MsoNormal><o:p>&nbsp;</o:p></p></td></tr>
</table>
</div></body></html>`;
    const result = parseLegacyDocument(html);
    expect(result.footnotes.map((footnote) => footnote.label)).toEqual(['1', '2', '3']);
    expect(result.footnotes[2]!.text).toMatch(/^Tarifstelle 03/u);
    expect(result.head.citationNote).toMatch(/^In Kraft getreten am 1\. September 2013/u);
    expect(countBlockTypes(result.blocks).table).toBeUndefined();
    expect(result.findings.filter((finding) => finding.code === 'dangling-footnote')).toEqual([]);
    const paragraph = find(result.blocks, (block) => block.type === 'paragraph' && block.label === '§ 1')!;
    expect(paragraph.children?.some((child) => child.type === 'footnote' && child.label === 'Fn 2')).toBe(true);
    const raw = rawMetrics('legacy-file', html);
    expect(raw.tables).toBe(0);
    expect(checkParseIntegrity(raw, bodyMetrics(result.blocks)).ok).toBe(true);
  });

  it('Legacy: einzeilige Hülltabelle um eine Tabelle wird aufgelöst, innere Tabelle und Anmerkung bleiben erhalten', () => {
    // Auszug aus /system/files/BH/4884-26138.htm (APO-BK, § 43 Notenstufen).
    const html = `<html><body><div class=WordSection1>
<p class=lrdetail>§ 43<br>Notenstufen</p>
<p>(1) Die Noten werden wie folgt vergeben:</p>
<table class=MsoNormalTable border=0 cellspacing=0 cellpadding=0 width=0 style='width:492.5pt;mso-cellspacing:0cm'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes;mso-yfti-lastrow:yes'>
  <td width="98%" valign=top style='width:98.42%;padding:2.4pt 2.4pt 2.4pt 2.4pt'>
   <table class=MsoNormalTable border=0 cellspacing=0 cellpadding=0 width=0 style='width:457.4pt;margin-left:21.7pt;border-collapse:collapse'>
    <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>
     <td width=99 valign=top><span style='font-size:12.0pt'><br clear=all style='page-break-before:always'> </span><p class=MsoNormal><b>Note</b></p></td>
     <td width=168 valign=top><p class=MsoNormal><b>Punkte nach <br> Notentendenz</b></p></td>
     <td width=342 valign=top><p class=MsoNormal><b>Notendefinition </b></p></td></tr>
    <tr style='mso-yfti-irow:1'>
     <td width=99 valign=top><p class=MsoNormal>sehr gut</p></td>
     <td width=168 valign=top><p class=MsoNormal>&nbsp;15 - 13 Punkte</p></td>
     <td width=342 valign=top><p class=MsoNormal>Die Leistungen entsprechen den Anforderungen in besonderem Maße. </p></td></tr>
   </table>
   <p class=MsoNormal>*) Eine oder mehrere schwach ausreichende Leistungen können dazu führen, dass die notwendigen Punktzahlen nicht erreicht werden.</p>
  </td>
  <td width="1%" valign=top style='width:1.58%;padding:2.4pt 2.4pt 2.4pt 2.4pt'><p class=MsoNormal>&nbsp;</p></td>
 </tr>
</table>
<p>(2) Die Punktzahlen ergeben sich aus der Tabelle.</p>
</div></body></html>`;
    const result = parseLegacyDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(countBlockTypes(result.blocks).table).toBe(1);
    const table = find(result.blocks, (block) => block.type === 'table')!;
    expect(table.children!.map((row) => row.children!.map((cell) => cell.text))).toEqual([
      ['Note', 'Punkte nach\nNotentendenz', 'Notendefinition'],
      ['sehr gut', '15 - 13 Punkte', 'Die Leistungen entsprechen den Anforderungen in besonderem Maße.'],
    ]);
    expect(find(result.blocks, (block) => block.type === 'paragraphText' && (block.text ?? '').startsWith('*) Eine oder mehrere'))).toBeDefined();
    expect(find(result.blocks, (block) => block.type === 'subparagraph' && block.label === '(2)')).toBeDefined();
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
    const raw = rawMetrics('legacy-file', html);
    expect(raw.tables).toBe(1);
    expect(checkParseIntegrity(raw, bodyMetrics(result.blocks)).ok).toBe(true);
  });

  it('Nativ: Inhaltsübersicht-Tabelle im Vorspann wird gezählt; Zeilen mit fehlenden Zellen werden aufgefüllt', () => {
    // Auszüge aus POG NRW (Vorspann-Inhaltsübersicht), BestG NRW („Anlage 1“-Zeile) und APO-SMA (§ 7 Absatz 2).
    const html = `<div id="block-rnrw-content"><article><div>
<div class="field field--field_preamble field__items">
 <div class="field__item"><div class="paragraph paragraph--type--formel"><div class="field field--field_text"><div class="tex2jax_process"><p class="text-align-center">Vom 5. Juli 2002</p></div></div></div></div>
 <div class="field__item"><div class="paragraph paragraph--type--toc paragraph--view-mode--default"><div class="paragraph-header"><h2><span class="field field--field_headline">Inhaltsübersicht</span></h2></div>
  <div class="field field--field_text field--name-field-text"><div class="tex2jax_process"><p class="text-align-center">&nbsp;</p>
   <table><tbody>
    <tr><td colspan="2"><p class="text-align-center"><strong>Erster Abschnitt</strong><br><strong>Organisation der Polizei</strong></p></td></tr>
    <tr><td><p class="text-align-right">§ 1</p></td><td>Träger der Polizei</td></tr>
    <tr><td><p class="text-align-right">§ 2</p></td><td>Polizeibehörden</td></tr>
    <tr><td><p>Anlage 1</p></td></tr>
   </tbody></table></div></div></div></div>
</div>
<div class="field field--field_body">
<section class="legaldoc-article"><div class="paragraph paragraph--type--article paragraph--view-mode--full">
<div class="paragraph-header article-header"><h2><span class="field field--field_num">§ 1</span> <span class="field field--field_headline">Träger der Polizei</span></h2></div>
<div class="field field--field_text"><div class="tex2jax_process"><p>(1) Träger der Polizei ist das Land.</p></div></div>
</div></section>
<section class="legaldoc-article"><div class="paragraph paragraph--type--article paragraph--view-mode--full">
<div class="paragraph-header article-header"><h2><span class="field field--field_num">§ 2</span></h2></div>
<div class="field field--field_text"><div class="tex2jax_process"><p>(2) Die praktische Ausbildung umfasst:</p>
<table><tbody>
 <tr><td><p>3.</p></td><td><p>Einrichtung für Körperbehinderte</p></td><td><p>1,5 Monate</p></td></tr>
 <tr><td><p>4.1</p></td><td><p>Kinderkrankenhaus, pädiatrische Fachabteilung eines Krankenhauses oder</p></td></tr>
 <tr><td><p>4.2</p></td><td><p>Fachabteilung für Innere Medizin eines Krankenhauses</p></td><td><p>2,0 Monate</p></td></tr>
</tbody></table></div></div>
</div></section>
</div>
</div></article></div>`;
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.findings.filter((finding) => finding.code === 'table-row-padded')).toHaveLength(2);
    expect(countBlockTypes(result.blocks).table).toBe(2);
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
    const toc = result.blocks.find((block) => block.type === 'table')!;
    expect(toc.children![0]!.children![0]).toMatchObject({ type: 'tableCell', colspan: 2 });
    expect(toc.children![3]!.children!.map((cell) => cell.text)).toEqual(['Anlage 1', '']);
    const training = find(find(result.blocks, (block) => block.label === '§ 2')!.children!, (block) => block.type === 'table')!;
    expect(training.children!.map((row) => row.children!.map((cell) => cell.text))).toEqual([
      ['3.', 'Einrichtung für Körperbehinderte', '1,5 Monate'],
      ['4.1', 'Kinderkrankenhaus, pädiatrische Fachabteilung eines Krankenhauses oder', ''],
      ['4.2', 'Fachabteilung für Innere Medizin eines Krankenhauses', '2,0 Monate'],
    ]);
    const raw = rawMetrics('native', html);
    expect(raw.tables).toBe(2);
    expect(checkParseIntegrity(raw, bodyMetrics(result.blocks)).ok).toBe(true);
  });

  it('Nativ: einzeilige Hülltabelle um eine Tabelle wird aufgelöst', () => {
    // Auszug aus APO-BK (Fassung ab 01.08.2025, § 43 Absatz 1).
    const html = `<div class="field field--field_body"><section class="legaldoc-article"><div class="paragraph paragraph--type--article">
<div class="paragraph-header article-header"><h2><span class="field field--field_num">§ 43</span></h2></div>
<div class="field field--field_text"><div class="tex2jax_process"><p>(1) Die Noten werden wie folgt vergeben:</p>
<table><tbody><tr><td>
 <table><tbody><tr><td><p><strong>Note</strong></p></td><td><p><strong>Punkte</strong></p></td></tr><tr><td><p>sehr gut</p></td><td><p>15 - 13 Punkte</p></td></tr></tbody></table>
 <p>*) Eine oder mehrere schwach ausreichende Leistungen können dazu führen, dass die notwendigen Punktzahlen nicht erreicht werden.</p>
</td><td><p>&nbsp;</p></td></tr></tbody></table>
</div></div></div></section></div>`;
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(countBlockTypes(result.blocks).table).toBe(1);
    const table = find(result.blocks, (block) => block.type === 'table')!;
    expect(table.children!.map((row) => row.children!.map((cell) => cell.text))).toEqual([['Note', 'Punkte'], ['sehr gut', '15 - 13 Punkte']]);
    expect(find(result.blocks, (block) => block.type === 'paragraphText' && (block.text ?? '').startsWith('*) Eine'))).toBeDefined();
    const raw = rawMetrics('native', html);
    expect(raw.tables).toBe(1);
    expect(checkParseIntegrity(raw, bodyMetrics(result.blocks)).ok).toBe(true);
  });

  it('Mehrzeilige Tabellen mit verschachtelten Tabellen bleiben fail-closed (Zählung weicht ab)', () => {
    const html = `<div class="field field--field_body"><section class="legaldoc-article"><div class="paragraph paragraph--type--article">
<div class="paragraph-header article-header"><h2><span class="field field--field_num">§ 1</span></h2></div>
<div class="field field--field_text"><div class="tex2jax_process">
<table><tbody><tr><td><p>Kopf</p></td></tr><tr><td><table><tbody><tr><td><p>innen</p></td></tr></tbody></table></td></tr></tbody></table>
</div></div></div></section></div>`;
    const result = parseNativeDocument(html);
    expect(checkParseIntegrity(rawMetrics('native', html), bodyMetrics(result.blocks)).checks.find((check) => check.name === 'tables')?.ok).toBe(false);
  });

  it('tableBlock füllt nur fehlende Zellen am Zeilenende auf und respektiert rowspan/colspan', () => {
    const findings: Array<{ code: string }> = [];
    const spanned = tableBlock([
      [{ text: 'A', header: true, rowspan: 2 }, { text: 'B', header: true, colspan: 2 }],
      [{ text: 'C', header: false }, { text: 'D', header: false }],
      [{ text: 'E', header: false }, { text: 'F', header: false }, { text: 'G', header: false }],
    ], findings as never);
    expect(findings).toEqual([]);
    expect(() => parseBodyBlocks([spanned], 'body')).not.toThrow();
    const padded = tableBlock([[{ text: 'a', header: false }, { text: 'b', header: false }, { text: 'c', header: false }], [{ text: 'd', header: false }]], findings as never);
    expect(findings.map((finding) => finding.code)).toEqual(['table-row-padded']);
    expect(padded.children![1]!.children!.map((cell) => cell.text)).toEqual(['d', '', '']);
    expect(() => parseBodyBlocks([padded], 'body')).not.toThrow();
  });
});

describe('Legacy-Parser: präsentationale Wrapper, CMS-Marker und Word-Defekte', () => {
  // Gekürzte Auszüge aus RECHT.NRW-Anlagen (/system/files/BA/…) und Legacy-Textdateien (/system/files/BH/…).
  const legacy = (body: string): string => `<html><head><meta charset="utf-8"></head><body lang=DE><div class=WordSection1>${body}</div></body></html>`;
  const FOOTNOTE_TABLE = '<table><tr><td><p class=MsoNormal><a name=FN1>Fn 1</a></p></td><td><p class=lrfundstelle>GV. NRW. 2005 S. 1</p></td></tr><tr><td><a name=FN4>Fn 4</a></td><td>Vierte Fußnote</td></tr></table>';
  const errors = (result: ReturnType<typeof parseLegacyDocument>) => result.findings.filter((finding) => finding.severity === 'error');
  /** Sichtbare Wörter eines Markup-Auszugs, die im Normkörper fehlen (Textverlust). */
  const lostWords = (snippet: string, blocks: NormBodyBlock[]): string[] => {
    const serialized = JSON.stringify(blocks);
    return snippet.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' ').split(/\s+/u)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((word) => word && !serialized.includes(word));
  };

  it('behandelt <dir> auf Dokumentebene als Einrückung: Text bleibt, Buchstaben nisten unter Nummern', () => {
    // recht.nrw.de/system/files/BA/4467-3392-sgv_221_19930511_1_anlage1.htm (Staatsvertrag Studienplatzvergabe)
    const snippet = '<p class=lrdetail>Artikel 8</p><P>(2) Bei der Einbeziehung eines Studiengangs ist insbesondere festzulegen,</P><DIR> <DIR> <P>1. ob für den Studiengang</P><DIR> <DIR> <P>a) ein Verteilungsverfahren,</P> <P>b) ein allgemeines Auswahlverfahren</P></DIR> </DIR> </DIR> </DIR> <P>durchzuführen ist,</P><DIR> <DIR> <P>2. für welche Bewerber die Einbeziehung gilt,</P> <P>3. für welche Fälle den Hochschulen die Entscheidung vorbehalten bleibt.</P></DIR> </DIR>';
    const result = parseLegacyDocument(legacy(snippet));
    expect(errors(result)).toEqual([]);
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    const subparagraph = find(result.blocks, (block) => block.type === 'subparagraph' && block.label === '(2)')!;
    expect(subparagraph.children!.map((child) => `${child.type}${child.label ? ` ${child.label}` : ''}`)).toEqual(['item 1.', 'paragraphText', 'item 2.', 'item 3.']);
    expect(subparagraph.children![0]!.children!.map((child) => child.label)).toEqual(['a)', 'b)']);
    expect(subparagraph.children![1]!.text).toBe('durchzuführen ist,');
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
  });

  it('nimmt <dir> in Tabellenzellen und <center> um Tabellen transparent', () => {
    // BA/4831-3471-sgv_77_19970930_1_anlage2.htm und BA/4339-3371-sgv_2221_19570926_1_anlage1.htm
    const snippet = '<TABLE><TR><TD><DIR><DIR><P>2000 - 9999 EW:</DIR></DIR></TD><TD><P>zwölf Proben im ersten Jahr</TD></TR></TABLE>'
      + '<P ALIGN="CENTER">Für die Evangelische Kirche im Rheinland</P><P ALIGN="CENTER"><CENTER><TABLE><TR><TD><P ALIGN="CENTER">gez. D. Heinrich Held<BR>Präses</TD><TD><P ALIGN="CENTER">gez. Hans Ulrich<BR>Oberkirchenrat</TD></TR></TABLE></CENTER></P>';
    const result = parseLegacyDocument(legacy(snippet));
    expect(errors(result)).toEqual([]);
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    const tables = result.blocks.filter((block) => block.type === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[0]!.children![0]!.children!.map((cell) => cell.text)).toEqual(['2000 - 9999 EW:', 'zwölf Proben im ersten Jahr']);
    expect(tables[1]!.children![0]!.children![0]!.text).toBe('gez. D. Heinrich Held\nPräses');
    expect(rawMetrics('legacy-file', legacy(snippet)).tables).toBe(2);
  });

  it('ignoriert <s> nur ohne sichtbaren Text; durchgestrichener Text bleibt fail-closed', () => {
    // BA/5027-3455-sgv_7134_20020121_1_anlage1.htm (Gebührenordnung Vermessung)
    const snippet = "<p><span style='color:black'>2.3.1.1.4</span><s><span style='color:red'><br></span></s>DIN A 1 oder Rahmenkarte<br><i>Gebühr</i>: Euro 50</p>";
    const result = parseLegacyDocument(legacy(snippet));
    expect(errors(result)).toEqual([]);
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    expect(result.blocks[0]!.text).toBe('2.3.1.1.4 DIN A 1 oder Rahmenkarte Gebühr: Euro 50');
    const struck = parseLegacyDocument(legacy('<p>Gebühr: <s>Euro 40</s> Euro 50</p>'));
    expect(struck.findings).toContainEqual(expect.objectContaining({ severity: 'error', code: 'unknown-inline-element', message: expect.stringContaining('Durchgestrichener Text <s>') }));
    expect(struck.blocks[0]!.text).toBe('Gebühr: Euro 40 Euro 50');
  });

  it('ignoriert die CMS-Marker <textend>/<textstart:> in der Fußnotentabelle ohne Textverlust', () => {
    // BH/4474-25026.htm (Kapazitätsverordnung); die Marker sind ungeschlossen und umschließen den Rest der Zelle.
    const table = '<table><tr><td><p class=MsoNormal><TEXTEND><TEXTSTART: CO_KLAMMER="" _x002c_ CO_NORM_NR="2" _x002c_ CO_DATUM="25.08.1994"><a name=FN1><TEXTEND><TEXTSTART: CO_KLAMMER="">Fn 1</a></p></td><td><p class=lrfundstelle>GV. NRW. 1994 S. 776, geändert durch VO vom 28. August 2021</p></td></tr></table>';
    const result = parseLegacyDocument(legacy('<p class=lrdetail>§ 1 (Fn <a href="#FN1">1</a>)<br>Geltungsbereich</p><p>(1) Diese Verordnung gilt.</p>' + table));
    expect(errors(result)).toEqual([]);
    expect(result.head.citationNote).toBe('GV. NRW. 1994 S. 776, geändert durch VO vom 28. August 2021');
    expect(result.footnotes).toEqual([{ label: '1', text: 'GV. NRW. 1994 S. 776, geändert durch VO vom 28. August 2021' }]);
    expect(find(result.blocks, (block) => block.type === 'paragraph')!.children![0]).toMatchObject({ type: 'footnote', label: 'Fn 1' });
  });

  it('repariert Tags ohne Leerzeichen vor dem Attribut (<pclass=…>, <pstyle=…>, <ahref=…>) mit Warnung und ohne Textverlust', () => {
    // BH/4145-25922.htm, BH/4963-25845.htm, BH/5136-1806.htm: parse5 liest <pstyle='…'> als nie geschlossenes
    // Element, das alle folgenden Einheiten verschluckt (Integritätsbefund „Textumfang -86 %“).
    expect(repairLegacyMarkup('<pclass=MsoNormal><ahref="#FN4">x</a><p class=a>')).toEqual({ html: '<p class=MsoNormal><a href="#FN4">x</a><p class=a>', repaired: 2 });
    const snippet = '<p class=lrdetail>§ 6 (Fn <ahref="#FN4"><a href="#FN4">4</a>)<br>Genehmigung im Einzelfall</p>'
      + '<p>(1) Die Genehmigung ist für jede einzelne Nebentätigkeit zu erteilen.</p>'
      + "<pstyle='margin-left:72.0pt'>\n<p class=MsoNormal>für die Zulassung von Ausnahmen für Impfungen und Heilversuche</p>"
      + "<pclass=MsoNormal align=center style='text-align:center'>\n<p class=lrdetail>§ 7<br>Brucellose-Verordnung</p><p>Zuständige Behörde ist das Ministerium.</p>";
    const html = legacy(snippet + FOOTNOTE_TABLE);
    const result = parseLegacyDocument(html);
    expect(errors(result)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'malformed-tag-repaired', message: expect.stringContaining('3 Tag(s)') }));
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    expect(result.stats.unitLabels).toEqual(['§ 6', '§ 7']);
    const unit6 = find(result.blocks, (block) => block.type === 'paragraph' && block.label === '§ 6')!;
    expect(unit6.title).toBe('Genehmigung im Einzelfall');
    expect(unit6.children![0]).toMatchObject({ type: 'footnote', label: 'Fn 4', text: 'Vierte Fußnote' });
    expect(checkParseIntegrity(rawMetrics('legacy-file', html), bodyMetrics(result.blocks)).ok).toBe(true);
  });

  it('kennt Word-Vorlagen ohne Struktursemantik und bildet den Titel der Inhaltsübersicht als Überschrift ab', () => {
    // BH/23504-25638.htm (JAVollzG), BH/4063-25909.htm (KrO), BH/4876-26136.htm (PO-Externe), BH/11181-25585.htm (UKVO)
    const snippet = '<p class=verzeichnistitelstammdokument><b>Inhaltsübersicht </b>(Fn <a href="#FN4">4</a>)<u5:p></u5:p><o:p></o:p></p>'
      + '<p class=MsoToc9>§ 1 Ziel und Aufgaben</p>'
      + '<p class=lrdetail>§ 1<br>Ziel und Aufgaben</p>'
      + '<p class=juristischerabsatznummeriert>(1) Tragende Elemente der erzieherischen Gestaltung sind insbesondere</p>'
      + '<p class=NummerierungStufe1>1. Soziale Trainingskurse,</p><p class=NummerierungStufe1>2. Gruppenarbeit.</p>'
      + '<p class=default>(2) Nimmt der Kreis die Aufgaben der Jugendhilfe wahr, gilt Absatz 1.</p>'
      + "<p class=e0 style='margin-bottom:0cm;margin-bottom:.0001pt'>(3) Die schriftlichen Fächer müssen die Aufgabenfelder erfassen.</p>"
      + '<p class=1-1text>Das Universitätsklinikum stellt einen Struktur- und Entwicklungsplan auf.</p>'
      + '<p class=MsoBodyText2>Namens des Ministerpräsidenten</p>';
    const result = parseLegacyDocument(legacy(snippet + FOOTNOTE_TABLE));
    expect(errors(result)).toEqual([]);
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    expect(result.stats.unitLabels).toEqual(['§ 1']);
    expect(result.blocks[0]).toMatchObject({ type: 'heading', title: 'Inhaltsübersicht', children: [{ type: 'footnote', label: 'Fn 4' }] });
    expect(result.blocks[1]).toMatchObject({ type: 'paragraphText', text: '§ 1 Ziel und Aufgaben' });
    const unit = find(result.blocks, (block) => block.type === 'paragraph')!;
    expect(unit.children!.map((child) => `${child.type} ${child.label}`)).toEqual(['subparagraph (1)', 'subparagraph (2)', 'subparagraph (3)']);
    expect(unit.children![0]!.children!.map((child) => `${child.type} ${child.label}`)).toEqual(['item 1.', 'item 2.']);
    expect(unit.children![2]!.children!.map((child) => child.text)).toEqual(['Das Universitätsklinikum stellt einen Struktur- und Entwicklungsplan auf.', 'Namens des Ministerpräsidenten']);
    // Unbekannte Vorlagen und Blockelemente bleiben Befunde.
    const unknown = parseLegacyDocument(legacy('<p class=e0text>Text</p><ul><li>Punkt</li></ul>'));
    expect(unknown.findings.map((finding) => finding.code)).toEqual(['unknown-paragraph-class', 'unknown-block-element']);
  });

  it('liest <h2>Anlage</h2> als Anlagenüberschrift mit Titel aus dem folgenden fetten Absatz', () => {
    // BA/9125-33462-sgv_101_20060426_1_anlage.htm (Dritter Staatsvertrag Niedersachsen/NRW)
    const snippet = "<h2>Anlage</h2><p class=MsoNormal align=center style='text-align:center'><b>Dritter Staatsvertrag <br></b><b>zwischen den Ländern Niedersachsen und Nordrhein-Westfalen<o:p></o:p></b></p><p class=MsoNormal>Um den Verlauf der gemeinsamen Landesgrenze zweckmäßig zu gestalten, schließen die Länder folgenden Vertrag:</p>";
    const result = parseLegacyDocument(legacy(snippet));
    expect(errors(result)).toEqual([]);
    expect(lostWords(snippet, result.blocks)).toEqual([]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ type: 'annex', label: 'Anlage', title: 'Dritter Staatsvertrag zwischen den Ländern Niedersachsen und Nordrhein-Westfalen' });
    expect(result.blocks[0]!.children![0]).toMatchObject({ type: 'paragraphText', text: expect.stringMatching(/^Um den Verlauf/u) });
  });
});

describe('Doppelte Einheitenkennzeichen in getrennten Zählbereichen', () => {
  /** Minimale native Sektion (Portalmarkup gekürzt auf die vom Parser gelesenen Teile). */
  const section = (num?: string, headline?: string, textHtml = ''): string => [
    '<section class="legaldoc-article"><div class="paragraph paragraph--type--article"><div class="paragraph-header article-header">',
    num ? `<h2><span class="field field--field_num">${num}</span>${headline ? `<span class="field field--field_headline">${headline}</span>` : ''}</h2>` : '',
    '</div>',
    textHtml ? `<div class="field field--field_text field__item"><div class="tex2jax_process">${textHtml}</div></div>` : '',
    '</div></section>',
  ].join('');
  const document = (...sections: string[]): string => `<div class="field field--field_body">${sections.join('')}</div>`;
  const labelsOf = (block: NormBodyBlock | undefined): Array<string | undefined> => (block?.children ?? []).filter((child) => child.type === 'paragraph' || child.type === 'article').map((child) => child.label);

  it('Mantelgesetz: die §-Zählung beginnt je Artikel neu, Sprungziele tragen den Artikel als Namensraum', () => {
    const html = document(
      section('Artikel 1', 'Gesetz über A'), section('§ 1', 'Zweck', '<p>Text A1.</p>'), section('§ 2', undefined, '<p>Text A2.</p>'), section('§ 3', undefined, '<p>Text A3.</p>'),
      section('Artikel 2', 'Gesetz über B'), section('§ 1', 'Zweck', '<p>Text B1.</p>'), section('§ 2', undefined, '<p>Text B2.</p>'),
    );
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.stats.unitLabels).toEqual(['Artikel 1', '§ 1', '§ 2', '§ 3', 'Artikel 2', '§ 1', '§ 2']);
    expect(result.blocks.map((block) => block.label)).toEqual(['Artikel 1', 'Artikel 2']);
    expect(labelsOf(result.blocks[0])).toEqual(['§ 1', '§ 2', '§ 3']);
    expect(labelsOf(result.blocks[1])).toEqual(['§ 1', '§ 2']);
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
    const metrics = bodyMetrics(result.blocks);
    expect(metrics.units).toBe(7);
    expect(metrics.duplicateLabels).toEqual([]);
    expect(checkParseIntegrity(rawMetrics('native', html), metrics).ok).toBe(true);
    const anchors = [...buildAnchorMap(result.blocks).values()];
    expect(anchors).toEqual(['artikel-1', 'artikel-1-paragraph-1', 'artikel-1-paragraph-2', 'artikel-1-paragraph-3', 'artikel-2', 'artikel-2-paragraph-1', 'artikel-2-paragraph-2']);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('Anlage mit eigener §-Zählung ist ein eigener Zählbereich', () => {
    const html = document(
      section('§ 1', 'Geltung', '<p>Dieses Gesetz gilt.</p>'),
      section('§ 2', 'Inkrafttreten', '<p>Es tritt in Kraft.</p><p class="text-align-center"><strong>Anlage 1 Gebührenordnung</strong></p>'),
      section('§ 1', 'Gebührenpflicht', '<p>Gebühren werden erhoben.</p>'), section('§ 2', 'Höhe', '<p>Die Höhe beträgt 10 Euro.</p>'),
    );
    const result = parseNativeDocument(html);
    const annex = result.blocks.find((block) => block.type === 'annex')!;
    expect(annex).toMatchObject({ label: 'Anlage 1', title: 'Gebührenordnung' });
    expect(labelsOf(annex)).toEqual(['§ 1', '§ 2']);
    expect(bodyMetrics(result.blocks).duplicateLabels).toEqual([]);
    expect(checkParseIntegrity(rawMetrics('native', html), bodyMetrics(result.blocks)).ok).toBe(true);
    expect([...buildAnchorMap(result.blocks).values()]).toEqual(['paragraph-1', 'paragraph-2', 'anlage-1', 'anlage-1-paragraph-1', 'anlage-1-paragraph-2']);
  });

  it('echte Duplikate im selben Zählbereich bleiben ein Fehler (Wurzel wie Artikel)', () => {
    const root = parseNativeDocument(document(section('§ 1', undefined, '<p>a</p>'), section('§ 2', undefined, '<p>b</p>'), section('§ 1', undefined, '<p>c</p>')));
    expect(bodyMetrics(root.blocks).duplicateLabels).toEqual(['§ 1']);
    expect(checkParseIntegrity(rawMetrics('native', ''), bodyMetrics(root.blocks)).checks.find((check) => check.name === 'duplicateUnits')).toMatchObject({ ok: false, message: 'Doppelte Einheiten: § 1' });
    const nested = parseNativeDocument(document(section('Artikel 1'), section('§ 1', undefined, '<p>a</p>'), section('§ 1', undefined, '<p>b</p>'), section('Artikel 2'), section('§ 1', undefined, '<p>c</p>')));
    expect(bodyMetrics(nested.blocks).duplicateLabels).toEqual(['§ 1 (in Artikel 1)']);
    // Gliederungen eröffnen keinen Zählbereich: § 1 in zwei Abschnitten bleibt doppelt.
    const divided = parseNativeDocument(document(section(undefined, undefined, '<p class="text-align-center"><strong>Erster Abschnitt</strong></p>'), section('§ 1', undefined, '<p>a</p><p class="text-align-center"><strong>Zweiter Abschnitt</strong></p>'), section('§ 1', undefined, '<p>b</p>')));
    expect(bodyMetrics(divided.blocks).duplicateLabels).toEqual(['§ 1']);
  });

  // Auszug aus dem Eifel-Rur-Verbandsgesetz (RECHT.NRW, native Fassung): das Portal führt die
  // Inhaltsübersicht als eigene Einheitensektionen „Artikel 1“ bis „Artikel 3“ vor dem Text.
  const tocIntro = section(undefined, undefined, '<p class="text-align-center"><strong>Vom 7. Februar 1990</strong></p> <p class="text-align-center"><strong>Inhaltsübersicht</strong></p>');
  const tocArticle1 = section('Artikel 1', undefined, '<p class="text-align-center">Erster Teil<br>Allgemeines</p> <p>§ 1 Rechtsform, Name, Sitz</p> <p class="text-align-center">Zweiter Teil<br>Aufgaben, Unternehmen, Übersichten</p> <p>§ 2 Aufgaben des Verbandes</p>');
  const mainText = [
    section('Artikel 1'),
    section('§ 1', 'Rechtsform, Name, Sitz', '<p>(1) Der Wasserverband Eifel-Rur ist eine Körperschaft des öffentlichen Rechts.</p><p class="text-align-center"><strong>Zweiter Teil<br>Aufgaben, Unternehmen, Übersichten</strong></p>'),
    section('§ 2', 'Aufgaben des Verbandes', '<p>(1) Der Verband hat die Aufgabe, im Verbandsgebiet den Wasserabfluss zu regeln.</p>'),
    section('Artikel 2', 'Vorbereitender Ausschuß', '<p>(1) Zur Vorbereitung der Bildung des Verbandes wird ein Ausschuß gebildet.</p>'),
    section('Artikel 3', 'Inkrafttreten', '<p>Dieses Gesetz tritt am 1. Januar 1993 in Kraft.</p>'),
  ];

  it('liest eine als Einheitensektionen angelegte Inhaltsübersicht als Text (Roh- und Parsezählung stimmen überein)', () => {
    const html = document(tocIntro, tocArticle1, section('Artikel 2', 'Vorbereitender Ausschuß'), section(), section('Artikel 3', 'Inkrafttreten'), ...mainText);
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.findings.find((finding) => finding.code === 'toc-sections-demoted')?.message).toMatch(/3 Einheitensektion/u);
    expect(result.stats.unitLabels).toEqual(['Artikel 1', '§ 1', '§ 2', 'Artikel 2', 'Artikel 3']);
    // Die Übersicht bleibt als Text erhalten, ohne Einheiten oder Gliederungsblöcke zu bilden.
    const firstUnit = result.blocks.findIndex((block) => block.type === 'article');
    const tocTexts = result.blocks.slice(0, firstUnit).filter((block) => block.type === 'paragraphText').map((block) => block.text);
    expect(tocTexts).toEqual(['Artikel 1', 'Erster Teil Allgemeines', '§ 1 Rechtsform, Name, Sitz', 'Zweiter Teil Aufgaben, Unternehmen, Übersichten', '§ 2 Aufgaben des Verbandes', 'Artikel 2 Vorbereitender Ausschuß', 'Artikel 3 Inkrafttreten']);
    expect(countBlockTypes(result.blocks).part).toBe(1);
    const raw = rawMetrics('native', html);
    expect(raw.units).toBe(5);
    const report = checkParseIntegrity(raw, bodyMetrics(result.blocks));
    expect(report.checks.filter((check) => !check.ok)).toEqual([]);
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
  });

  it('lässt eine Inhaltsübersicht unangetastet, deren Kennzeichen im Text nicht wiederkehren (fail-closed)', () => {
    const html = document(tocIntro, tocArticle1, section('Artikel 2', 'Vorbereitender Ausschuß'), section('Artikel 4', 'Übergangsvorschrift'), ...mainText);
    const result = parseNativeDocument(html);
    expect(result.findings.find((finding) => finding.code === 'toc-sections-unresolved')).toMatchObject({ severity: 'error', message: expect.stringContaining('Artikel 4') });
    expect(result.stats.units).toBe(8);
    expect(rawMetrics('native', html).units).toBe(8);
    expect(bodyMetrics(result.blocks).duplicateLabels).toEqual(['Artikel 1', 'Artikel 2']);
  });

  // Auszug aus dem Gesetz über den Beitritt zum Abkommen zur Bereinigung der Stichtaglücken (1952):
  // der Abkommenstext folgt mit eigener Artikelzählung im Text von Artikel 3 des Gesetzes.
  const treatyLaw = (consentText: string, publishText: string): string => document(
    section(undefined, undefined, '<p class="text-align-center">Vom 24. Juni 1952</p>'),
    section('Artikel 1', undefined, `<p>${consentText}</p>`),
    section('Artikel 2', undefined, `<p>(1) ${publishText}</p><p>(2) Der Tag, an dem es gemäß Artikel 7 für das Land Nordrhein-Westfalen in Kraft tritt, ist im Gesetz- und Verordnungsblatt Nordrhein-Westfalen bekanntzugeben.</p>`),
    section('Artikel 3', undefined, '<p>Dieses Gesetz tritt am Tage nach der Verkündung in Kraft.</p> <p class="text-align-center"><strong>Abkommen<br>zur Bereinigung der Stichtaglücken und der<br>Doppelzuständigkeiten in den Entschädigungsgesetzen<br>vom 9./10. Mai 1951.</strong></p> <p>Die Länder der Bundesrepublik und das Land Berlin treffen das nachstehende Abkommen:</p>'),
    section('Artikel 1', undefined, '<p>(1) Wer seinen Wohnsitz in einem Land vor dem dort geltenden Stichtag aufgegeben hat, erhält Wiedergutmachung von demjenigen Lande, in dem er länger gewohnt hat.</p>'),
    section('Artikel 2', undefined, '<p>Wurde der Wohnsitz mehrmals gewechselt, so gewährt dasjenige Land Wiedergutmachung, in welchem der Antragsteller die längste Zeit gewohnt hat.</p>'),
  );

  it('führt den nachstehend veröffentlichten Vertragstext eines Zustimmungsgesetzes als eigenen Anlage-Zählbereich', () => {
    const html = treatyLaw('Dem Beitritt des Landes Nordrhein-Westfalen zum Abkommen zur Bereinigung der Stichtaglücken vom 9./10. Mai 1951 wird zugestimmt.', 'Das Abkommen wird nachstehend mit Gesetzeskraft veröffentlicht.');
    const result = parseNativeDocument(html);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.blocks.map((block) => `${block.type} ${block.label ?? ''}`)).toEqual(['paragraphText ', 'article Artikel 1', 'article Artikel 2', 'article Artikel 3', 'annex Abkommen']);
    const annex = result.blocks[4]!;
    expect(annex.title).toBe('zur Bereinigung der Stichtaglücken und der Doppelzuständigkeiten in den Entschädigungsgesetzen vom 9./10. Mai 1951.');
    expect(labelsOf(annex)).toEqual(['Artikel 1', 'Artikel 2']);
    expect(bodyMetrics(result.blocks).duplicateLabels).toEqual([]);
    expect(checkParseIntegrity(rawMetrics('native', html), bodyMetrics(result.blocks)).ok).toBe(true);
    expect([...buildAnchorMap(result.blocks).values()]).toEqual(['artikel-1', 'artikel-2', 'artikel-3', 'anlage-abkommen', 'anlage-abkommen-artikel-1', 'anlage-abkommen-artikel-2']);
    expect(() => parseBodyBlocks(result.blocks, 'body')).not.toThrow();
  });

  it('eröffnet ohne Zustimmungsformel oder Veröffentlichungsvermerk keinen Vertrags-Zählbereich (fail-closed)', () => {
    const result = parseNativeDocument(treatyLaw('Das Land tritt dem Abkommen bei.', 'Das Abkommen ist beigefügt.'));
    expect(result.blocks.some((block) => block.type === 'annex')).toBe(false);
    expect(bodyMetrics(result.blocks).duplicateLabels).toEqual(['Artikel 1', 'Artikel 2']);
  });
});
