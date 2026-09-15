/**
 * Parser für die Legacy-Textdateien von RECHT.NRW (`/system/files/BH/<id>.htm`): aus Word
 * exportiertes HTML mit den Klassen `lrueberschrift` (Titel), `lrdetail` (§-/Artikelüberschrift),
 * `lrfundstelle` (Fundstelle in Fußnote 1), zentrierten fetten Absätzen (Gliederung), Absätzen
 * mit „(1)“-Kennzeichen, eingerückten Nummerierungen (`margin-left`) und einer Fußnotentabelle
 * am Ende (`<a name=FNn>`). Word-Hilfselemente (`<o:p>`, `<u5:p>`, `span.SpellE`) werden
 * ignoriert. Jedes unbekannte Element und jede unbekannte Absatzklasse ist ein Befund.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { buildBody, extractFootnoteMarkers, parseAnnexHeading, parseDivisionHeading, parseItem, parseSubparagraph, parseUnitHeading, tableBlock, type ParsedBody, type SourceFootnote, type SourceLine } from './body-common.ts';
import { attr, children, classes, describeElement, elementChildren, findFirst, hasClass, isElement, isTextNode, normalizeWhitespace, parseHtml, textOf, type HtmlElement, type HtmlNode } from './html.ts';

export interface LegacyDocumentHead {
  /** Titelzeilen aus `p.lrueberschrift` (Langtitel, ggf. Kurzbezeichnung/Abkürzung in Folgezeilen). */
  titleLines: string[];
  /** „Vom 5. April 2005“ */
  issuedLine?: string;
  /** Fundstelle/Änderungshistorie aus Fußnote 1 (`p.lrfundstelle`). */
  citationNote?: string;
}

export interface LegacyParseResult extends ParsedBody {
  head: LegacyDocumentHead;
}

const IGNORED_TAGS = new Set(['hr', 'o:p', 'u5:p', 'u6:p', 'u7:p', 'u8:p', 'u9:p', 'u10:p', 'u11:p', 'u12:p', 'u13:p', 'style', 'meta', 'title', 'head', 'link']);
const INLINE_TAGS = new Set(['b', 'i', 'u', 'span', 'a', 'sup', 'sub', 'font', 'em', 'strong', 'br', 'st1:place', 'st1:personname', 'nobr', 'small', 'big']);
const TRANSPARENT_TAGS = new Set(['p', 'div', 'td', 'th', 'tr', 'tbody', 'thead', 'table', 'center', 'blockquote']);
const KNOWN_PARAGRAPH_CLASSES = new Set(['lrueberschrift', 'lrdetail', 'lrfundstelle', 'msonormal', 'feldinhalt', 'feldinhalt0', 'betreff', 'msobodytext', 'msolistparagraph', 'msolistparagraphcxspmiddle', 'msolistparagraphcxspfirst', 'msolistparagraphcxsplast', 'msotoc1', 'msotoc2', 'msotoc3', 'msotitle']);

function isIgnorable(node: HtmlElement): boolean {
  const name = node.tagName.toLowerCase();
  return IGNORED_TAGS.has(name) || /^u\d+:p$/u.test(name) || name === 'o:p';
}

/** Text eines Absatzes mit `<br>`-Umbrüchen; unbekannte Inline-Elemente werden gemeldet. */
function paragraphText(node: HtmlElement, findings: ImportFinding[], context: string): string {
  const parts: string[] = [];
  const visit = (current: HtmlNode): void => {
    if (isTextNode(current)) {
      parts.push(current.value);
      return;
    }
    if (!isElement(current)) return;
    const name = current.tagName.toLowerCase();
    if (isIgnorable(current)) {
      // Word-Hilfselemente (<u6:p>, <o:p>) sind oft nicht geschlossen und umschließen dann den
      // eigentlichen Text: das Element wird ignoriert, sein Inhalt bleibt erhalten.
      if (name !== 'style' && name !== 'head' && name !== 'title') for (const child of children(current)) visit(child);
      return;
    }
    if (name === 'br') {
      parts.push('\n');
      return;
    }
    if (name === 'img') {
      findings.push({ severity: 'error', code: 'image-in-text', message: `Bild im Text (${context}); Bilder werden nicht übernommen` });
      return;
    }
    if (!INLINE_TAGS.has(name) && !TRANSPARENT_TAGS.has(name)) {
      findings.push({ severity: 'error', code: 'unknown-inline-element', message: `Unbekanntes Element <${name}> in ${context}` });
    }
    if (name === 'p' && parts.length > 0) parts.push('\n');
    for (const child of children(current)) visit(child);
  };
  for (const child of children(node)) visit(child);
  return normalizeWhitespace(parts.join(''), true);
}

function isCentered(node: HtmlElement): boolean {
  const style = attr(node, 'style') ?? '';
  return attr(node, 'align') === 'center' || /text-align:\s*center/u.test(style) || hasClass(node, 'lrueberschrift') || hasClass(node, 'lrdetail');
}

function isBold(node: HtmlElement): boolean {
  // Absatz gilt als fett, wenn sein gesamter sichtbarer Text in <b> steht.
  const visible = textOf(node);
  if (!visible) return false;
  const boldText = elementChildrenDeep(node, 'b').map((element) => textOf(element)).join(' ');
  return normalizeWhitespace(boldText) === normalizeWhitespace(visible) || /font-weight:\s*bold/u.test(attr(node, 'style') ?? '');
}

function elementChildrenDeep(node: HtmlNode, tagName: string, output: HtmlElement[] = []): HtmlElement[] {
  for (const child of children(node)) {
    if (isElement(child)) {
      if (child.tagName.toLowerCase() === tagName) output.push(child);
      else elementChildrenDeep(child, tagName, output);
    }
  }
  return output;
}

function marginLevel(node: HtmlElement): number | null {
  const margin = /margin-left:\s*([\d.]+)pt/u.exec(attr(node, 'style') ?? '');
  if (!margin) return null;
  const points = Number.parseFloat(margin[1]!);
  if (points < 20) return null;
  if (points < 55) return 0;
  if (points < 90) return 1;
  if (points < 125) return 2;
  return 3;
}

function parseTable(table: HtmlElement, findings: ImportFinding[]): { footnotes: SourceFootnote[]; citationNote?: string } | { block: ReturnType<typeof tableBlock> } {
  const rows = elementChildrenDeep(table, 'tr');
  const footnotes: SourceFootnote[] = [];
  let citationNote: string | undefined;
  let anchoredRows = 0;
  const parsedRows: Array<Array<{ text: string; header: boolean; colspan?: number; rowspan?: number }>> = [];
  for (const row of rows) {
    const cells = elementChildren(row).filter((cell) => cell.tagName === 'td' || cell.tagName === 'th');
    const anchor = cells[0] ? findFirst(cells[0], (element) => element.tagName === 'a' && /^FN\d+/u.test(attr(element, 'name') ?? '')) : undefined;
    if (anchor && cells.length >= 2) {
      anchoredRows += 1;
      const label = /^FN(\d+)/u.exec(attr(anchor, 'name') ?? '')![1]!;
      const text = paragraphText(cells[1]!, findings, `Fußnote ${label}`);
      if (!citationNote && findFirst(cells[1]!, (element) => hasClass(element, 'lrfundstelle'))) citationNote = text;
      if (!text) findings.push({ severity: 'info', code: 'empty-footnote', message: `Fußnote ${label} ist in der Quelle leer` });
      footnotes.push({ label, text: text || '(in der Quelle ohne Text)' });
    } else if (footnotes.length > 0 && cells.length >= 2 && !textOf(cells[0]!)) {
      // Fortsetzungszeile einer Fußnote (leere Nummernzelle)
      const previous = footnotes[footnotes.length - 1]!;
      const continuation = paragraphText(cells[1]!, findings, `Fußnote ${previous.label}`);
      if (continuation) previous.text = `${previous.text}\n${continuation}`;
    }
    parsedRows.push(cells.map((cell) => {
      const entry: { text: string; header: boolean; colspan?: number; rowspan?: number } = { text: paragraphText(cell, findings, 'Tabellenzelle'), header: cell.tagName === 'th' };
      const colspan = Number.parseInt(attr(cell, 'colspan') ?? '1', 10);
      const rowspan = Number.parseInt(attr(cell, 'rowspan') ?? '1', 10);
      if (colspan > 1) entry.colspan = colspan;
      if (rowspan > 1) entry.rowspan = rowspan;
      return entry;
    }));
  }
  const isFootnoteTable = anchoredRows > 0 && anchoredRows * 2 >= rows.length;
  if (isFootnoteTable) return citationNote ? { footnotes, citationNote } : { footnotes };
  return { block: tableBlock(parsedRows) };
}

export function parseLegacyDocument(html: string): LegacyParseResult {
  const findings: ImportFinding[] = [];
  const document = parseHtml(html);
  const body = findFirst(document, (element) => element.tagName === 'body');
  if (!body) throw new Error('Legacy-Dokument ohne <body>');
  // Manche Dateien enthalten vor dem eigentlichen Dokument einen Kopf mit Gliederungsnummer und
  // ein zweites <html>; parse5 fasst alles in einen Body zusammen. Das Dokument beginnt mit
  // `div.Section1`/`div.WordSection1`, sonst wird der ganze Body gelesen.
  const section = findFirst(body, (element) => element.tagName === 'div' && classes(element).some((name) => /section1/iu.test(name)));
  const container = section ?? body;

  const head: LegacyDocumentHead = { titleLines: [] };
  const footnotes: SourceFootnote[] = [];
  const lines: SourceLine[] = [];
  let sawFirstUnit = false;

  const pushText = (text: string, centered: boolean, bold: boolean, footnoteLabels: string[]): void => {
    if (!text) return;
    if (!sawFirstUnit && !head.issuedLine && /^Vom\s+\d{1,2}\.\s*\p{L}+\s+\d{4}/u.test(text)) head.issuedLine = text;
    const subparagraph = parseSubparagraph(text);
    if (subparagraph && !centered) {
      lines.push({ kind: 'subparagraph', label: subparagraph.label, text: subparagraph.text, footnotes: footnoteLabels });
      return;
    }
    lines.push({ kind: 'text', text, centered, bold, footnotes: footnoteLabels });
  };

  const topLevel: HtmlElement[] = [];
  const collect = (parent: HtmlElement): void => {
    for (const node of elementChildren(parent)) {
      const name = node.tagName.toLowerCase();
      if (name === 'div' || (isIgnorable(node) && name !== 'style' && name !== 'head')) collect(node);
      else topLevel.push(node);
    }
  };
  collect(container);

  for (const node of topLevel) {
    const name = node.tagName.toLowerCase();
    if (isIgnorable(node)) continue;
    if (name === 'table') {
      const result = parseTable(node, findings);
      if ('footnotes' in result) {
        footnotes.push(...result.footnotes);
        if (result.citationNote && !head.citationNote) head.citationNote = result.citationNote;
      } else {
        lines.push({ kind: 'table', block: result.block, footnotes: [] });
      }
      continue;
    }
    if (name === 'hr') continue;
    if (INLINE_TAGS.has(name)) {
      // Vereinzelte Inline-Elemente auf Dokumentebene (Word-Export): als Fließtext übernehmen.
      const stray = extractFootnoteMarkers(paragraphText(node, findings, `<${name}> auf Dokumentebene`).replace(/\n/gu, ' '));
      if (stray.text) pushText(stray.text, false, false, stray.footnotes);
      continue;
    }
    if (name !== 'p') {
      findings.push({ severity: 'error', code: 'unknown-block-element', message: `Unbekanntes Blockelement ${describeElement(node)} auf Dokumentebene` });
      continue;
    }
    const classNames = classes(node).map((entry) => entry.toLowerCase());
    for (const className of classNames) {
      if (!KNOWN_PARAGRAPH_CLASSES.has(className)) findings.push({ severity: 'error', code: 'unknown-paragraph-class', message: `Unbekannte Absatzklasse „${className}“: ${textOf(node).slice(0, 80)}` });
    }
    const rawText = paragraphText(node, findings, `p.${classNames[0] ?? 'default'}`);
    if (!rawText) continue;

    if (hasClass(node, 'lrueberschrift')) {
      head.titleLines.push(...rawText.split('\n').map((line) => extractFootnoteMarkers(line).text).filter(Boolean));
      continue;
    }
    if (hasClass(node, 'lrdetail')) {
      const [first, ...rest] = rawText.split('\n');
      const marker = extractFootnoteMarkers(first ?? '');
      const unit = parseUnitHeading(marker.text);
      const title = extractFootnoteMarkers(rest.join(' ')).text;
      if (unit) {
        sawFirstUnit = true;
        const line: SourceLine = { kind: 'unit', unitType: unit.unitType, label: unit.label, footnotes: marker.footnotes };
        const unitTitle = [unit.title, title].filter(Boolean).join(' ').trim();
        if (unitTitle) line.title = unitTitle;
        lines.push(line);
        continue;
      }
      const annex = parseAnnexHeading(marker.text);
      if (annex) {
        const line: SourceLine = { kind: 'annex', label: annex.label, footnotes: marker.footnotes };
        const annexTitle = [annex.title, title].filter(Boolean).join(' ').trim();
        if (annexTitle) line.title = annexTitle;
        lines.push(line);
        continue;
      }
      const headingText = extractFootnoteMarkers(rawText.replace(/\n/gu, ' ')).text;
      if (headingText) {
        findings.push({ severity: 'error', code: 'unparsed-unit-heading', message: `lrdetail ohne erkennbare Einheit: „${rawText.slice(0, 80)}“` });
        lines.push({ kind: 'heading', text: headingText, footnotes: marker.footnotes });
      } else if (marker.footnotes.length > 0) {
        const previous = lines[lines.length - 1];
        if (previous && 'footnotes' in previous) previous.footnotes.push(...marker.footnotes);
      }
      continue;
    }
    if (hasClass(node, 'lrfundstelle')) {
      head.citationNote = rawText;
      continue;
    }

    const centered = isCentered(node);
    const bold = isBold(node);
    const flat = rawText.replace(/\n/gu, ' ');
    const { text, footnotes: footnoteLabels } = extractFootnoteMarkers(flat);
    if (!text) continue;

    if (centered) {
      const division = parseDivisionHeading(text);
      if (division && bold) {
        const line: SourceLine = { kind: 'division', level: division.level, label: division.label, footnotes: footnoteLabels };
        if (division.title) line.title = division.title;
        lines.push(line);
        continue;
      }
      const annex = bold ? parseAnnexHeading(text) : null;
      if (annex && /^Anlage/u.test(text)) {
        const line: SourceLine = { kind: 'annex', label: annex.label, footnotes: footnoteLabels };
        if (annex.title) line.title = annex.title;
        lines.push(line);
        continue;
      }
      // Zweite Zeile einer Gliederungsüberschrift („Mitgliedschaft und Beruf“ nach „Erster Teil“)
      const previous = lines[lines.length - 1];
      if (bold && previous && previous.kind === 'division' && !previous.title) {
        previous.title = text;
        previous.footnotes.push(...footnoteLabels);
        continue;
      }
      if (bold && previous && previous.kind === 'annex' && !previous.title) {
        previous.title = text;
        continue;
      }
      if (/^(Die Landesregierung|Der Ministerpräsident|Die Ministerpräsidentin|Für die Landesregierung)/u.test(text) && sawFirstUnit) {
        lines.push({ kind: 'signature', text });
        continue;
      }
      pushText(text, true, bold, footnoteLabels);
      continue;
    }

    const level = marginLevel(node);
    const item = parseItem(text);
    if (item && level !== null) {
      lines.push({ kind: 'item', label: item.label, text: item.text, level: Math.max(level, item.level), footnotes: footnoteLabels });
      continue;
    }
    if (level !== null && lines[lines.length - 1]?.kind === 'item') {
      // Fortsetzungsabsatz innerhalb einer Nummerierung
      lines.push({ kind: 'item', text, level, footnotes: footnoteLabels });
      continue;
    }
    if (item && item.level === 0 && /^\d{1,3}\.$/u.test(item.label) && lines[lines.length - 1]?.kind !== 'text') {
      lines.push({ kind: 'item', label: item.label, text: item.text, level: 0, footnotes: footnoteLabels });
      continue;
    }
    pushText(text, false, bold, footnoteLabels);
  }

  const { blocks, stats } = buildBody(lines, footnotes, findings);
  return { head, blocks, footnotes, findings, stats };
}
