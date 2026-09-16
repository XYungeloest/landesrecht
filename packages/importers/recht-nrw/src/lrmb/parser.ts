/**
 * Parser für LRMB-Texte (Verwaltungsvorschriften, Runderlasse, Richtlinien) im nativen
 * Drupal-Format von RECHT.NRW. Anders als LRGV-Normen haben LRMB-Texte meist eine einzige
 * Sektion ohne §-Nummern; gegliedert wird dezimal (1, 1.1, 1.1.1) mit drei Schreibweisen:
 *
 *   <p><strong>1<br>Zu § 1 …</strong></p>            Nummer und Überschrift fett
 *   <p><strong>1.1</strong><br>Text …</p>             Nummer fett, Text im selben Absatz
 *   <p>4.2<br>Besonderes Interesse<br>Text …</p>      Nummer, Überschrift und Text in Zeilen
 *   <p>1.<br>Auf Grund …</p>                           ältere Erlasse mit Punkt
 *
 * Außerdem: römische Teile („II. Besonderer Teil“), Anlagen, Tabellen, Listen, Buchstaben- und
 * Spiegelstrichaufzählungen, Inhaltsübersichten, Fußnoten (`[1]` mit Definition am Ende) und der
 * Fundstellenverlauf am Textende. Der Erlasskopf (Titel, Erlassart, herausgebende Stelle,
 * Aktenzeichen, Datum) wird getrennt geliefert und nicht in den Normkörper übernommen.
 *
 * Abbildung auf das gemeinsame Blockmodell: Teil → `part`, Nummer 1 → `section`, Nummer 1.1 und
 * tiefer → `subsection` (Tiefe aus der Nummer); Fließtext → `paragraphText`,
 * Aufzählungen → `item`/`subitem`, Tabellen → `table`, Fußnoten → `footnote`.
 *
 * Fail-closed: unbekannte Elemente, Bilder und doppelte Nummern im selben Gliederungsraum sind
 * Fehler; Lücken in der Nummernfolge werden gemeldet. Kein Text wird verworfen.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { bodyTextLength, parseDivisionHeading, parseItem, tableBlock, type SourceFootnote } from '../common/body-common.ts';
import { allByClass, attr, children, describeElement, elementChildren, hasClass, isElement, isTextNode, normalizeWhitespace, parseHtmlFragment, textOf, type HtmlElement, type HtmlNode } from '../common/html.ts';
import { parseLrmbHead, type LrmbHead } from './text-metadata.ts';

/** 1.1.0: gemeinsame Parserbausteine geändert (Tabellenraster, Zählbereiche, Legacy-Wrapper) – Bestand wird aus dem Cache regeneriert. */
export const LRMB_PARSER_VERSION = 'recht-nrw-lrmb-parser/1.1.0';

interface Line {
  text: string;
  bold: boolean;
  footnotes: string[];
}

interface Paragraph {
  kind: 'p' | 'table' | 'list' | 'heading';
  lines: Line[];
  centered: boolean;
  alignRight: boolean;
  /** Anker einer Fußnotendefinition (`<a href="#_ftnref1">[1]</a>`). */
  footnoteDefinition?: string;
  table?: NormBodyBlock;
  items?: Line[];
}

export interface LrmbBodyStats {
  units: number;
  unitLabels: string[];
  parts: number;
  annexes: number;
  tables: number;
  lists: number;
  footnotes: number;
  footnoteMarkers: number;
  tocBlocks: number;
  paragraphs: number;
  textLength: number;
  /** Textumfang außerhalb des Normkörpers (Kopf, Fundstellenverlauf, Fußnotendefinitionen, Fußzeile). */
  excludedTextLength: number;
  numberingIssues: string[];
  duplicateLabels: string[];
}

export interface LrmbParseResult {
  head: LrmbHead;
  blocks: NormBodyBlock[];
  footnotes: SourceFootnote[];
  changeNoteText?: string;
  citationFooter?: string;
  /** SMBl-Gliederungsnummer, sofern der Text sie voranstellt (Ministerialblatt-Seiten). */
  classificationNumber?: string;
  findings: ImportFinding[];
  stats: LrmbBodyStats;
  style: 'decimal' | 'flat';
  /** Alle Texte des Normkörpers in Lesereihenfolge (für Geltungsklauseln). */
  bodyTexts: string[];
  /** Kopfzeilen für die Erkennung des Erlassorgans. */
  headLines: Array<{ path: string; text: string }>;
}

const INLINE = new Set(['span', 'em', 'i', 'u', 'sub', 'sup', 'small', 'abbr', 'font', 'strong', 'b', 'a', 'br']);
const NUMBER_ONLY = /^(\d{1,2}(?:\.\d{1,2}){0,5})\.?$/u;
const ROMAN_PART = /^([IVXLC]+)\.\s+(\S.*)$/u;
const CHANGE_NOTE = /^(?:MBl|SMBl|MBL)\s*\.?\s*NRW\b|^MB\.\s?NRW\b/u;
const TOC_LINE = /^\d{1,2}(?:\.\d{1,2})*\.?\s+\S/u;

function paragraphLines(element: HtmlElement, findings: ImportFinding[]): { lines: Line[]; footnoteDefinition?: string } {
  const lines: Array<Line & { hasText: boolean }> = [{ text: '', bold: true, footnotes: [], hasText: false }];
  let footnoteDefinition: string | undefined;
  const current = (): Line & { hasText: boolean } => lines[lines.length - 1]!;
  const visit = (node: HtmlNode, bold: boolean): void => {
    if (isTextNode(node)) {
      current().text += node.value;
      if (node.value.replace(/\s/gu, '')) {
        current().hasText = true;
        if (!bold) current().bold = false;
      }
      return;
    }
    if (!isElement(node)) return;
    const name = node.tagName.toLowerCase();
    if (name === 'br') {
      lines.push({ text: '', bold: true, footnotes: [], hasText: false });
      return;
    }
    if (name === 'img') {
      findings.push({ severity: 'error', code: 'image-in-text', message: 'Bild im Text; Bilder werden nicht übernommen' });
      return;
    }
    if (name === 'a') {
      const href = attr(node, 'href') ?? '';
      const marker = /^#_ftn(\d+)$/u.exec(href);
      const reference = /^#_ftnref(\d+)$/u.exec(href);
      if (marker) {
        current().footnotes.push(marker[1]!);
        return;
      }
      if (reference) {
        footnoteDefinition = reference[1]!;
        return;
      }
    }
    if (!INLINE.has(name)) findings.push({ severity: 'error', code: 'unknown-inline-element', message: `Unbekanntes Inline-Element <${name}> im LRMB-Text` });
    for (const child of children(node)) visit(child, bold || name === 'strong' || name === 'b');
  };
  for (const child of children(element)) visit(child, false);
  // Leere Zeilen bleiben erhalten: sie trennen logische Absätze („<br><br>“).
  const cleaned = lines.map((line) => ({ text: normalizeWhitespace(line.text), bold: line.hasText && line.bold, footnotes: line.footnotes }));
  while (cleaned.length > 0 && !cleaned[0]!.text && cleaned[0]!.footnotes.length === 0) cleaned.shift();
  while (cleaned.length > 0 && !cleaned[cleaned.length - 1]!.text && cleaned[cleaned.length - 1]!.footnotes.length === 0) cleaned.pop();
  return footnoteDefinition ? { lines: cleaned, footnoteDefinition } : { lines: cleaned };
}

function tableFrom(table: HtmlElement, findings: ImportFinding[]): NormBodyBlock {
  const rows: Array<Array<{ text: string; header: boolean; colspan?: number; rowspan?: number }>> = [];
  const rowsOf = (node: HtmlNode, output: HtmlElement[] = []): HtmlElement[] => {
    for (const child of children(node)) if (isElement(child)) (child.tagName === 'tr' ? output.push(child) : child.tagName !== 'table' && rowsOf(child, output));
    return output;
  };
  for (const row of rowsOf(table)) {
    rows.push(elementChildren(row).filter((cell) => cell.tagName === 'td' || cell.tagName === 'th').map((cell) => {
      const entry: { text: string; header: boolean; colspan?: number; rowspan?: number } = { text: paragraphLines(cell, findings).lines.map((line) => line.text).join(' '), header: cell.tagName === 'th' };
      const colspan = Number.parseInt(attr(cell, 'colspan') ?? '1', 10);
      const rowspan = Number.parseInt(attr(cell, 'rowspan') ?? '1', 10);
      if (colspan > 1) entry.colspan = colspan;
      if (rowspan > 1) entry.rowspan = rowspan;
      return entry;
    }));
  }
  return tableBlock(rows);
}

function collectParagraphs(container: HtmlElement, findings: ImportFinding[], output: Paragraph[]): void {
  for (const node of elementChildren(container)) {
    const name = node.tagName.toLowerCase();
    if (name === 'p' || /^h[2-6]$/u.test(name)) {
      const { lines, footnoteDefinition } = paragraphLines(node, findings);
      const centered = hasClass(node, 'text-align-center');
      const alignRight = hasClass(node, 'text-align-right');
      // Logische Absätze: Trennung an Leerzeilen und vor fett gesetzten Nummernzeilen innerhalb eines <p>.
      const groups: Line[][] = [[]];
      for (const [position, line] of lines.entries()) {
        const current = groups[groups.length - 1]!;
        if (!line.text && line.footnotes.length === 0) {
          if (current.length > 0) groups.push([]);
          continue;
        }
        if (position > 0 && current.length > 0 && line.bold && NUMBER_ONLY.test(line.text)) groups.push([]);
        groups[groups.length - 1]!.push(line);
      }
      for (const group of groups.filter((entry) => entry.length > 0)) {
        const paragraph: Paragraph = { kind: name === 'p' ? 'p' : 'heading', lines: name === 'p' ? group : group.map((line) => ({ ...line, bold: true })), centered, alignRight };
        if (footnoteDefinition) paragraph.footnoteDefinition = footnoteDefinition;
        output.push(paragraph);
      }
      if (lines.length === 0) output.push({ kind: 'p', lines: [], centered, alignRight, ...(footnoteDefinition ? { footnoteDefinition } : {}) });
    } else if (name === 'table') {
      output.push({ kind: 'table', lines: [], centered: false, alignRight: false, table: tableFrom(node, findings) });
    } else if (name === 'ul' || name === 'ol') {
      const items = elementChildren(node).filter((child) => child.tagName === 'li').map((item) => {
        const { lines } = paragraphLines(item, findings);
        return { text: lines.map((line) => line.text).join(' '), bold: false, footnotes: lines.flatMap((line) => line.footnotes) };
      });
      output.push({ kind: 'list', lines: [], centered: false, alignRight: false, items });
    } else if (name === 'div' || name === 'blockquote' || name === 'section') {
      collectParagraphs(node, findings, output);
    } else if (name === 'hr') {
      continue;
    } else {
      findings.push({ severity: 'error', code: 'unknown-block-element', message: `Unbekanntes Blockelement ${describeElement(node)} im LRMB-Text` });
      output.push({ kind: 'p', lines: [{ text: normalizeWhitespace(textOf(node)), bold: false, footnotes: [] }], centered: false, alignRight: false });
    }
  }
}

const isEmpty = (paragraph: Paragraph): boolean => paragraph.kind === 'p' && paragraph.lines.every((line) => !line.text) && !paragraph.footnoteDefinition;
const flat = (paragraph: Paragraph): string => paragraph.lines.map((line) => line.text).join(' ').trim();
const titleLike = (text: string, bold = false): boolean => text.length <= (bold ? 220 : 100) && !/[.:;,]$/u.test(text) && text.split(/\s+/u).length <= (bold ? 32 : 14);

interface Frame {
  block: NormBodyBlock;
  kind: 'part' | 'annex' | 'provision';
  depth: number;
  label: string;
  scope: string;
}

/** Zerlegt den nativen LRMB-Text (Seite oder Ministerialblatt-Eintrag). */
export function parseLrmbDocument(html: string): LrmbParseResult {
  const findings: ImportFinding[] = [];
  const fragment = parseHtmlFragment(html);
  const wrappers = allByClass(fragment, 'tex2jax_process');
  const containers = wrappers.length > 0 ? wrappers : allByClass(fragment, 'field--field_text');
  if (containers.length === 0) findings.push({ severity: 'error', code: 'missing-content', message: 'Kein Textfeld (tex2jax_process/field--field_text) im LRMB-Dokument' });
  if (allByClass(fragment, 'field--field_num').some((element) => /^(§|Art)/u.test(textOf(element)))) findings.push({ severity: 'error', code: 'structure-lrmb-paragraph-units', message: 'LRMB-Dokument mit §/Artikel-Einheiten; dieser Aufbau wird vom LRMB-Parser nicht übernommen (Review)' });
  const paragraphs: Paragraph[] = [];
  for (const container of containers) collectParagraphs(container, findings, paragraphs);

  const stats: LrmbBodyStats = { units: 0, unitLabels: [], parts: 0, annexes: 0, tables: 0, lists: 0, footnotes: 0, footnoteMarkers: 0, tocBlocks: 0, paragraphs: paragraphs.length, textLength: 0, excludedTextLength: 0, numberingIssues: [], duplicateLabels: [] };
  let index = 0;
  const result: Omit<LrmbParseResult, 'head' | 'blocks' | 'stats' | 'style' | 'bodyTexts' | 'headLines'> = { footnotes: [], findings };

  // SMBl-Gliederungsnummer (nur Ministerialblatt-Einträge): alleinstehende fette Zahl vor dem Titel.
  while (index < paragraphs.length && isEmpty(paragraphs[index]!)) index += 1;
  const first = paragraphs[index];
  if (first?.kind === 'p' && first.lines.length === 1 && first.lines[0]!.bold && /^\d{3,6}$/u.test(first.lines[0]!.text) && !first.centered) {
    result.classificationNumber = first.lines[0]!.text;
    stats.excludedTextLength += first.lines[0]!.text.length;
    index += 1;
  }

  // Erlasskopf.
  const headInput = paragraphs.slice(index).map((paragraph) => ({ lines: paragraph.lines.map((line) => line.text), centered: paragraph.centered, bold: paragraph.lines.length > 0 && paragraph.lines.every((line) => line.bold) }));
  const head = parseLrmbHead(headInput);
  const headParagraphs = paragraphs.slice(index, index + head.consumed);
  for (const paragraph of headParagraphs) stats.excludedTextLength += flat(paragraph).length;
  index += head.consumed;

  // Textende: Fußnotendefinitionen, Fundstellenverlauf, Fußzeile des Ministerialblatts.
  let end = paragraphs.length;
  const definitions: Array<{ label: string; text: string }> = [];
  for (let cursor = paragraphs.length - 1; cursor >= index; cursor -= 1) {
    const paragraph = paragraphs[cursor]!;
    if (paragraph.footnoteDefinition) {
      const inline = flat(paragraph).replace(/^\[\d+\]\s*/u, '');
      const following = paragraphs.slice(cursor + 1, end).filter((entry) => !isEmpty(entry)).map(flat).join(' ');
      definitions.unshift({ label: paragraph.footnoteDefinition, text: normalizeWhitespace(`${inline} ${following}`) });
      end = cursor;
    }
  }
  for (const definition of definitions) stats.excludedTextLength += definition.text.length;
  while (end > index) {
    const paragraph = paragraphs[end - 1]!;
    if (isEmpty(paragraph)) {
      end -= 1;
      continue;
    }
    const text = flat(paragraph);
    if (paragraph.alignRight && /^-?\s*MBl\.\s*NRW\./u.test(text)) {
      result.citationFooter = text.replace(/^-\s*/u, '');
      stats.excludedTextLength += text.length;
      end -= 1;
      continue;
    }
    if (!result.changeNoteText && CHANGE_NOTE.test(text.replace(/\s+/gu, ' '))) {
      result.changeNoteText = normalizeWhitespace(paragraph.lines.map((line) => line.text).join(''));
      stats.excludedTextLength += text.length;
      end -= 1;
      continue;
    }
    break;
  }
  result.footnotes.push(...definitions);

  // Normkörper.
  const root: NormBodyBlock[] = [];
  const stack: Frame[] = [];
  const bodyTexts: string[] = [];
  const seen = new Map<string, number>();
  let decimal = false;
  let lastHeading = '';
  const containerOf = (): NormBodyBlock[] => (stack.length > 0 ? (stack[stack.length - 1]!.block.children ??= []) : root);
  const scope = (): string => stack.find((frame) => frame.kind !== 'provision')?.label ?? '';
  const attachFootnotes = (block: NormBodyBlock, labels: string[]): void => {
    for (const label of labels) {
      stats.footnoteMarkers += 1;
      const definition = definitions.find((entry) => entry.label === label);
      if (!definition) {
        findings.push({ severity: 'error', code: 'text-dangling-footnote', message: `Fußnote [${label}] wird referenziert, aber nicht definiert` });
        continue;
      }
      (block.children ??= []).push({ type: 'footnote', label: `Fn ${label}`, text: definition.text });
      stats.footnotes += 1;
    }
  };
  const pushText = (text: string, footnotes: string[]): void => {
    if (!text) return;
    bodyTexts.push(text);
    const item = parseItem(text);
    const block: NormBodyBlock = item ? { type: item.level === 0 ? 'item' : 'subitem', label: item.label, text: item.text, level: item.level } : { type: 'paragraphText', text };
    if (item) block.numberingStyle = /^\d/u.test(item.label) ? 'decimal' : /^[a-z]/u.test(item.label) ? 'lower-alpha' : 'dash';
    containerOf().push(block);
    attachFootnotes(block, footnotes);
  };
  const openProvision = (label: string, title: string | undefined): NormBodyBlock => {
    const depth = label.split('.').length;
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      if (top.kind !== 'provision') break;
      if (top.depth < depth && label.startsWith(`${top.label}.`)) break;
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (depth > 1 && !(parent?.kind === 'provision' && parent.depth === depth - 1)) stats.numberingIssues.push(`Nummer ${label} ohne übergeordnete Nummer ${label.split('.').slice(0, -1).join('.')}`);
    // Die Gliederungstiefe ergibt sich aus der Nummer; `level` ist im Blockmodell Listenpunkten vorbehalten.
    const block: NormBodyBlock = { type: depth === 1 ? 'section' : 'subsection', label, children: [] };
    if (title) block.title = title;
    const siblings = containerOf();
    const previous = [...siblings].reverse().find((sibling) => sibling.type === block.type && sibling.label && sibling.label.split('.').length === depth);
    const lastComponent = Number(label.split('.').pop());
    const previousComponent = previous?.label ? Number(previous.label.split('.').pop()) : 0;
    if (lastComponent !== previousComponent + 1) stats.numberingIssues.push(`Nummernfolge ${previous?.label ?? '(Beginn)'} → ${label}`);
    siblings.push(block);
    const key = `${scope()}|${label}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) === 2) stats.duplicateLabels.push(scope() ? `${scope()} ${label}` : label);
    stack.push({ block, kind: 'provision', depth, label, scope: scope() });
    stats.units += 1;
    stats.unitLabels.push(label);
    decimal = true;
    return block;
  };

  for (const paragraph of paragraphs.slice(index, end)) {
    if (isEmpty(paragraph)) continue;
    if (paragraph.kind === 'table' && paragraph.table) {
      containerOf().push(paragraph.table);
      stats.tables += 1;
      bodyTexts.push(JSON.stringify(paragraph.table));
      continue;
    }
    if (paragraph.kind === 'list' && paragraph.items) {
      stats.lists += 1;
      for (const item of paragraph.items) {
        if (!item.text) continue;
        const parsed = parseItem(item.text);
        const block: NormBodyBlock = parsed ? { type: parsed.level === 0 ? 'item' : 'subitem', label: parsed.label, text: parsed.text, level: parsed.level } : { type: 'item', text: item.text, level: 0, numberingStyle: 'bullet' };
        containerOf().push(block);
        bodyTexts.push(item.text);
        attachFootnotes(block, item.footnotes);
      }
      continue;
    }
    const lines = paragraph.lines.filter((line) => line.text);
    if (lines.length === 0) continue;
    const firstLine = lines[0]!;
    const allBold = lines.every((line) => line.bold);

    // Inhaltsübersicht: viele nummerierte Zeilen in einem Absatz.
    const tocLines = lines.filter((line) => TOC_LINE.test(line.text)).length;
    if (lines.length >= 3 && (tocLines >= 5 || (tocLines >= 3 && /Inhalts(?:übersicht|verzeichnis)/u.test(lastHeading)))) {
      const block: NormBodyBlock = { type: 'paragraphText', text: lines.map((line) => line.text).join('\n') };
      containerOf().push(block);
      bodyTexts.push(block.text!);
      stats.tocBlocks += 1;
      continue;
    }

    // Teil (römisch oder „Teil A“).
    const roman = firstLine.bold ? ROMAN_PART.exec(firstLine.text) : null;
    const division = firstLine.bold && !roman ? parseDivisionHeading(firstLine.text) : null;
    if (roman || (division && (division.level === 'part' || division.level === 'chapter'))) {
      stack.length = 0;
      const block: NormBodyBlock = { type: 'part', label: roman ? `${roman[1]}.` : division!.label, children: [] };
      const title = roman ? roman[2] : division!.title;
      if (title) block.title = title;
      root.push(block);
      stack.push({ block, kind: 'part', depth: 0, label: block.label!, scope: block.label! });
      stats.parts += 1;
      bodyTexts.push(firstLine.text);
      for (const line of lines.slice(1)) pushText(line.text, line.footnotes);
      continue;
    }

    // Anlage im Text.
    if ((firstLine.bold || paragraph.centered) && /^Anlage(?:\s+\d+[a-z]?)?(?:\s|$)/u.test(firstLine.text) && firstLine.text.length <= 120) {
      stack.length = 0;
      const match = /^(Anlage(?:\s+\d+[a-z]?)?)\s*[:–-]?\s*(.*)$/u.exec(firstLine.text)!;
      const block: NormBodyBlock = { type: 'annex', label: match[1]!, children: [] };
      if (match[2]) block.title = match[2];
      root.push(block);
      stack.push({ block, kind: 'annex', depth: 0, label: match[1]!, scope: match[1]! });
      stats.annexes += 1;
      bodyTexts.push(firstLine.text);
      for (const line of lines.slice(1)) pushText(line.text, line.footnotes);
      continue;
    }

    // Dezimal nummerierte Vorschrift.
    const number = NUMBER_ONLY.exec(firstLine.text);
    if (number) {
      let rest = lines.slice(1);
      let title: string | undefined;
      if (rest[0] && rest[0].bold && titleLike(rest[0].text, true)) {
        title = rest[0].text;
        rest = rest.slice(1);
      } else if (rest.length >= 2 && titleLike(rest[0]!.text) && !rest[0]!.bold && !/^\(/u.test(rest[0]!.text)) {
        title = rest[0]!.text;
        rest = rest.slice(1);
      }
      const block = openProvision(number[1]!, title);
      bodyTexts.push([number[1], title].filter(Boolean).join(' '));
      attachFootnotes(block, [...firstLine.footnotes, ...(title ? lines[1]!.footnotes : [])]);
      if (rest.length > 0) pushText(rest.map((line) => line.text).join(' '), rest.flatMap((line) => line.footnotes));
      continue;
    }

    // Überschrift.
    if (allBold && titleLike(flat(paragraph)) && (paragraph.centered || paragraph.kind === 'heading' || lines.length === 1)) {
      const block: NormBodyBlock = { type: 'heading', title: flat(paragraph) };
      containerOf().push(block);
      bodyTexts.push(block.title!);
      lastHeading = block.title!;
      attachFootnotes(block, lines.flatMap((line) => line.footnotes));
      continue;
    }

    pushText(flat(paragraph), lines.flatMap((line) => line.footnotes));
  }

  if (stats.duplicateLabels.length > 0) findings.push({ severity: 'error', code: 'structure-duplicate-number', message: `Doppelte Nummern im selben Gliederungsraum: ${stats.duplicateLabels.join(', ')}` });
  if (stats.numberingIssues.length > 0) findings.push({ severity: 'warning', code: 'structure-numbering', message: `Auffälligkeiten der Nummernfolge: ${stats.numberingIssues.slice(0, 8).join('; ')}${stats.numberingIssues.length > 8 ? ' …' : ''}` });
  const unusedDefinitions = definitions.filter((definition) => !paragraphs.some((paragraph) => paragraph.lines.some((line) => line.footnotes.includes(definition.label))));
  if (unusedDefinitions.length > 0) findings.push({ severity: 'warning', code: 'text-unreferenced-footnote', message: `Fußnotendefinition(en) ohne Verweis: ${unusedDefinitions.map((entry) => entry.label).join(', ')}` });
  stats.textLength = bodyTextLength(root);
  // Für die Organerkennung nur Erlassart und herausgebende Stelle (ohne Aktenzeichen und Datum).
  const decreeWord = head.decreeText ? /^(Gemeinsamer\s+Runderlass|Runderlass|RdErl\.|Erlass|Verwaltungsvorschrift|Bekanntmachung)/u.exec(head.decreeText)?.[1] : undefined;
  const headLines = decreeWord && head.issuingAuthorityText ? [{ path: 'head.decree', text: `${decreeWord} ${head.issuingAuthorityText}` }] : head.decreeText ? [{ path: 'head.decree', text: head.decreeText }] : [];
  return { ...result, head, blocks: root, stats, style: decimal ? 'decimal' : 'flat', bodyTexts, headLines };
}

export interface LrmbRawMetrics {
  /** Absätze, deren erste Zeile eine Dezimalnummer ist (unabhängig vom Parser gezählt). */
  numberedParagraphs: number;
  tables: number;
  footnoteMarkers: number;
  textLength: number;
}

/** Kennzahlen direkt aus dem rohen HTML (Regex, ohne DOM-Parser), für die Integritätsprüfung. */
export function lrmbRawMetrics(html: string): LrmbRawMetrics {
  const decode = (value: string): string => value.replace(/<[^>]+>/gu, '').replace(/&nbsp;|&#160;/gu, ' ').replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/\s+/gu, ' ').trim();
  const start = html.search(/class="[^"]*tex2jax_process/u);
  const scoped = start >= 0 ? html.slice(start) : html;
  let numberedParagraphs = 0;
  let textLength = 0;
  for (const match of scoped.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gu)) {
    const inner = match[1]!;
    const segments = inner.split(/<br\s*\/?>/u);
    let firstText = true;
    let previousEmpty = true;
    for (const segment of segments) {
      const text = decode(segment);
      if (!text) {
        previousEmpty = true;
        continue;
      }
      if (NUMBER_ONLY.test(text) && (firstText || previousEmpty || /<(?:strong|b)>/u.test(segment))) numberedParagraphs += 1;
      firstText = false;
      previousEmpty = false;
    }
    textLength += decode(inner.replace(/<a href="#_ftn\d+">\[\d+\]<\/a>/gu, '').replace(/<br\s*\/?>/gu, ' ')).length;
  }
  for (const match of scoped.matchAll(/<(?:li|td|th)\b[^>]*>([\s\S]*?)<\/(?:li|td|th)>/gu)) textLength += decode(match[1]!).length;
  return {
    numberedParagraphs,
    tables: (scoped.match(/<table\b/gu) ?? []).length,
    footnoteMarkers: (scoped.match(/href="#_ftn\d+"/gu) ?? []).length,
    textLength,
  };
}
