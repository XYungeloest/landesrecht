import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { countBlockTypes } from '@landesrecht/legal-core/lib/body.ts';
import { parseBodyBlocks, type NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { extractFootnoteMarkers, parseDivisionHeading, parseItem, parseSubparagraph, parseUnitHeading } from '@landesrecht/importer-recht-nrw/common/body-common.ts';
import { parseLegacyDocument } from '@landesrecht/importer-recht-nrw/common/legacy-parser.ts';
import { parseNativeDocument } from '@landesrecht/importer-recht-nrw/common/native-parser.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';

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
