/**
 * Parser für das native Drupal-Dokumentformat von RECHT.NRW: `section.legaldoc-article`
 * je Einheit mit `h2 > span.field--field_num` (§/Artikel), optionaler Überschrift
 * (`span.field--field_headline`), Fußnoten je Einheit (`div.footnote-item`) und dem Text
 * (`div.field--field_text`). Gliederungsüberschriften stehen als zentrierte fette Absätze am
 * Ende des vorangehenden Einheitentexts. Die erste Sektion ohne Nummer trägt Vorspann,
 * Ausfertigungsdatum und Inhaltsübersicht.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { buildBody, extractFootnoteMarkers, hasConsentEvidence, parseAnnexHeading, parseDivisionHeading, parseItem, parseSubparagraph, parseTreatyHeading, parseUnitHeading, tableBlock, type ParsedBody, type SourceFootnote, type SourceLine } from './body-common.ts';
import { allByClass, attr, byClass, children, classes, describeElement, elementChildren, findFirst, hasClass, isElement, isLayoutTable, isTextNode, normalizeWhitespace, parseHtmlFragment, tableCells, tableRows, textOf, type HtmlElement, type HtmlNode } from './html.ts';

export interface NativeParseResult extends ParsedBody {
  issuedLine?: string;
}

const INLINE_TAGS = new Set(['b', 'i', 'u', 'span', 'a', 'sup', 'sub', 'em', 'strong', 'br', 'small']);
const TRANSPARENT_TAGS = new Set(['p', 'div', 'td', 'th', 'tr', 'tbody', 'thead', 'table']);

function inlineText(node: HtmlElement, findings: ImportFinding[], context: string): string {
  const parts: string[] = [];
  const visit = (current: HtmlNode): void => {
    if (isTextNode(current)) {
      parts.push(current.value);
      return;
    }
    if (!isElement(current)) return;
    const name = current.tagName.toLowerCase();
    if (name === 'br') {
      parts.push('\n');
      return;
    }
    if (name === 'img') {
      findings.push({ severity: 'error', code: 'image-in-text', message: `Bild im Text (${context}); Bilder werden nicht übernommen` });
      return;
    }
    if (!INLINE_TAGS.has(name) && !TRANSPARENT_TAGS.has(name)) findings.push({ severity: 'error', code: 'unknown-inline-element', message: `Unbekanntes Element <${name}> in ${context}` });
    if (name === 'p' && parts.length > 0) parts.push('\n');
    for (const child of children(current)) visit(child);
  };
  for (const child of children(node)) visit(child);
  return normalizeWhitespace(parts.join(''), true);
}

function isBoldParagraph(node: HtmlElement): boolean {
  const visible = normalizeWhitespace(textOf(node));
  if (!visible) return false;
  const strong = elementChildren(node).filter((child) => child.tagName === 'strong' || child.tagName === 'b').map((child) => textOf(child)).join(' ');
  return normalizeWhitespace(strong) === visible;
}

function parseTable(table: HtmlElement, findings: ImportFinding[]): SourceLine {
  const rows: Array<Array<{ text: string; header: boolean; colspan?: number; rowspan?: number }>> = [];
  for (const row of allByTagDeep(table, 'tr')) {
    rows.push(elementChildren(row).filter((cell) => cell.tagName === 'td' || cell.tagName === 'th').map((cell) => {
      const entry: { text: string; header: boolean; colspan?: number; rowspan?: number } = { text: inlineText(cell, findings, 'Tabellenzelle'), header: cell.tagName === 'th' };
      const colspan = Number.parseInt(attr(cell, 'colspan') ?? '1', 10);
      const rowspan = Number.parseInt(attr(cell, 'rowspan') ?? '1', 10);
      if (colspan > 1) entry.colspan = colspan;
      if (rowspan > 1) entry.rowspan = rowspan;
      return entry;
    }));
  }
  return { kind: 'table', block: tableBlock(rows, findings), footnotes: [] };
}

function allByTagDeep(node: HtmlNode, tagName: string, output: HtmlElement[] = []): HtmlElement[] {
  for (const child of children(node)) {
    if (isElement(child)) {
      if (child.tagName === tagName) output.push(child);
      else allByTagDeep(child, tagName, output);
    }
  }
  return output;
}

/** Übersetzt die Absätze eines Einheitentexts in flache Zeilen. */
function parseTextField(field: HtmlElement, findings: ImportFinding[], lines: SourceLine[], state: { sawUnit: boolean; issuedLine?: string }, unitFootnotes: string[]): void {
  const wrapper = byClass(field, 'tex2jax_process') ?? field;
  let pendingItemLevel: number | null = null;
  for (const node of elementChildren(wrapper)) {
    const name = node.tagName.toLowerCase();
    if (name === 'table') {
      // Einzeilige Hülltabelle um eine Tabelle (Word-Layout): Zellinhalte wie Absätze des Felds lesen.
      if (isLayoutTable(node)) for (const cell of tableRows(node).flatMap(tableCells)) parseTextField(cell, findings, lines, state, unitFootnotes);
      else lines.push(parseTable(node, findings));
      continue;
    }
    if (name === 'ul' || name === 'ol') {
      for (const item of elementChildren(node).filter((child) => child.tagName === 'li')) {
        const text = inlineText(item, findings, 'Listenpunkt').replace(/\n/gu, ' ');
        const parsed = parseItem(text);
        if (parsed) lines.push({ kind: 'item', label: parsed.label, text: parsed.text, level: parsed.level, footnotes: [] });
        else lines.push({ kind: 'item', text, level: 0, footnotes: [] });
      }
      continue;
    }
    if (name === 'div') {
      parseTextField(node, findings, lines, state, unitFootnotes);
      continue;
    }
    if (name !== 'p') {
      findings.push({ severity: 'error', code: 'unknown-block-element', message: `Unbekanntes Blockelement ${describeElement(node)} im Einheitentext` });
      continue;
    }
    const raw = inlineText(node, findings, 'p');
    if (!raw) continue;
    const centered = hasClass(node, 'text-align-center');
    const bold = isBoldParagraph(node);
    const flat = raw.replace(/\n/gu, ' ');
    const { text, footnotes } = extractFootnoteMarkers(flat);
    if (!text) continue;

    if (!state.sawUnit && !state.issuedLine && /^Vom\s+\d{1,2}\.\s*\p{L}+\s+\d{4}/u.test(text)) state.issuedLine = text;

    if (centered) {
      const division = parseDivisionHeading(text);
      if (division) {
        const line: SourceLine = { kind: 'division', level: division.level, label: division.label, footnotes };
        if (division.title) line.title = division.title;
        lines.push(line);
        continue;
      }
      // Mehrzeilige Gliederungsüberschrift: „Zweiter Teil“ + „Von den Grundrechten …“
      const previous = lines[lines.length - 1];
      if (bold && previous && previous.kind === 'division' && !previous.title) {
        previous.title = text;
        continue;
      }
      const annex = bold ? parseAnnexHeading(text) : null;
      if (annex && /^Anlage/u.test(text)) {
        const line: SourceLine = { kind: 'annex', label: annex.label, footnotes };
        if (annex.title) line.title = annex.title;
        lines.push(line);
        continue;
      }
      // Nachstehend veröffentlichter Vertragstext eines Zustimmungsgesetzes: eigener Container mit
      // eigener Artikelzählung (nur nach Zustimmungsformel/Veröffentlichungsvermerk im Gesetzestext).
      const treaty = bold && state.sawUnit ? parseTreatyHeading(text) : null;
      if (treaty && hasConsentEvidence(lines)) {
        const line: SourceLine = { kind: 'annex', label: treaty.label, footnotes };
        if (treaty.title) line.title = treaty.title;
        lines.push(line);
        continue;
      }
      if (/^(Die Landesregierung|Der Ministerpräsident|Die Ministerpräsidentin|Für die Landesregierung)/u.test(text) && state.sawUnit) {
        lines.push({ kind: 'signature', text });
        continue;
      }
      lines.push({ kind: 'text', text, centered: true, bold, footnotes });
      continue;
    }

    const subparagraph = parseSubparagraph(text);
    if (subparagraph) {
      pendingItemLevel = null;
      lines.push({ kind: 'subparagraph', label: subparagraph.label, text: subparagraph.text, footnotes });
      continue;
    }
    const item = parseItem(text);
    if (item) {
      pendingItemLevel = item.level;
      lines.push({ kind: 'item', label: item.label, text: item.text, level: item.level, footnotes });
      continue;
    }
    pendingItemLevel = null;
    lines.push({ kind: 'text', text, centered: false, bold, footnotes });
  }
  void pendingItemLevel;
  void unitFootnotes;
}

export interface TocSectionDetection {
  /** Sektionen der Inhaltsübersicht (leer, wenn keine Inhaltsübersicht als Sektionen vorliegt). */
  sections: Set<HtmlElement>;
  /** Anzahl der nummerierten Sektionen in der Inhaltsübersicht. */
  units: number;
  /** Gesetzt, wenn die Region wie eine Inhaltsübersicht aussieht, aber nicht sicher aufgelöst werden kann. */
  reason?: string;
}

function unitLabelOf(section: HtmlElement): string | undefined {
  const numText = textOf(byClass(section, 'field--field_num'));
  if (!numText) return undefined;
  return parseUnitHeading(extractFootnoteMarkers(numText).text, { romanArticles: true })?.label;
}

/**
 * Inhaltsübersicht, die das Portal als eigene Einheitensektionen angelegt hat (z. B. die
 * Wasserverbandsgesetze): auf die zentrierte fette Überschrift „Inhaltsübersicht“ folgen
 * nummerierte Sektionen („Artikel 1“ mit den Gliederungszeilen als Text, „Artikel 2 …“ ohne
 * Text), bis die Einheitenfolge mit derselben Kennung neu beginnt. Die Region gilt nur dann als
 * Inhaltsübersicht, wenn alle ihre Zeilen Überschriftenzeilen sind (Einheiten- oder Gliederungs-
 * kennzeichen, keine Absätze, Nummerierungen oder Tabellen) und jede Kennung später als echte
 * Einheit wiederkehrt. Andernfalls bleibt sie unangetastet (fail-closed) und wird gemeldet.
 * Wird auch von der Integritätsprüfung (`rawMetrics`) genutzt, damit Roh- und Parsezählung
 * dieselben Sektionen ausnehmen.
 */
export function detectTocSections(root: HtmlNode): TocSectionDetection {
  const none: TocSectionDetection = { sections: new Set(), units: 0 };
  const sections = allByClass(root, 'legaldoc-article');
  const isTocHeading = (paragraph: HtmlElement): boolean => hasClass(paragraph, 'text-align-center') && /^Inhalts(?:übersicht|verzeichnis)$/u.test(textOf(paragraph));
  const paragraphsOf = (section: HtmlElement): HtmlElement[] => {
    const field = byClass(section, 'field--field_text');
    return field ? allByTagDeep(field, 'p') : [];
  };
  let start = -1;
  const preamble = byClass(root, 'field--field_preamble');
  if (preamble && allByTagDeep(preamble, 'p').some(isTocHeading)) start = 0;
  else {
    const headingIndex = sections.findIndex((section) => paragraphsOf(section).some(isTocHeading));
    if (headingIndex >= 0) start = headingIndex + 1;
  }
  if (start < 0) return none;

  const labels = sections.map(unitLabelOf);
  let first = -1;
  let restart = -1;
  for (let index = start; index < sections.length; index += 1) {
    const label = labels[index];
    if (!label) continue;
    if (first < 0) first = index;
    else if (label === labels[first]) {
      restart = index;
      break;
    }
  }
  if (first < 0 || restart < 0) return none;
  let last = first;
  for (let index = first; index < restart; index += 1) if (labels[index]) last = index;
  const region = sections.slice(first, last + 1);

  // Nur Überschriftenzeilen: Einheitenkennzeichen („§ 1 Rechtsform …“) oder Gliederung („Erster Teil …“).
  for (const section of region) {
    const field = byClass(section, 'field--field_text');
    const wrapper = field ? byClass(field, 'tex2jax_process') ?? field : undefined;
    if (wrapper && elementChildren(wrapper).some((node) => node.tagName.toLowerCase() !== 'p')) return none;
    for (const paragraph of paragraphsOf(section)) {
      const text = extractFootnoteMarkers(textOf(paragraph)).text;
      if (text && !parseUnitHeading(text) && !parseDivisionHeading(text)) return none;
    }
  }
  const later = new Set(labels.slice(restart).filter((label): label is string => Boolean(label)));
  const tocLabels = region.map(unitLabelOf).filter((label): label is string => Boolean(label));
  const missing = tocLabels.filter((label) => !later.has(label));
  if (missing.length > 0) return { ...none, reason: `Kennzeichen ${missing.join(', ')} der Inhaltsübersicht kehren im Text nicht wieder` };
  return { sections: new Set(region), units: tocLabels.length };
}

/** Zeile einer Inhaltsübersicht: Einheiten und Gliederungen werden zu schlichtem Text (kein Sprungziel, keine Einheit). */
function asTocText(line: SourceLine): SourceLine {
  switch (line.kind) {
    case 'division':
    case 'unit':
    case 'annex':
      return { kind: 'text', text: [line.label, line.title].filter(Boolean).join(' '), centered: false, bold: false, footnotes: line.footnotes };
    case 'heading':
      return { kind: 'text', text: line.text, centered: false, bold: false, footnotes: line.footnotes };
    case 'text':
      return { ...line, centered: false, bold: false };
    default:
      return line;
  }
}

export function parseNativeDocument(bodyHtml: string): NativeParseResult {
  const findings: ImportFinding[] = [];
  const fragment = parseHtmlFragment(bodyHtml);
  const footnotes: SourceFootnote[] = [];
  const lines: SourceLine[] = [];
  const state: { sawUnit: boolean; issuedLine?: string } = { sawUnit: false };
  let footnoteCounter = 0;

  const sections = allByClass(fragment, 'legaldoc-article');
  if (sections.length === 0) findings.push({ severity: 'error', code: 'no-sections', message: 'Natives Dokument ohne legaldoc-article-Sektionen' });

  const toc = detectTocSections(fragment);
  if (toc.reason) findings.push({ severity: 'error', code: 'toc-sections-unresolved', message: `Inhaltsübersicht als Einheitensektionen angelegt, aber nicht auflösbar: ${toc.reason}` });
  else if (toc.units > 0) findings.push({ severity: 'info', code: 'toc-sections-demoted', message: `Inhaltsübersicht: ${toc.units} Einheitensektion(en) als Text übernommen (keine Einheiten)` });

  // Vorspann (field--field_preamble): Ausfertigungsdatum, Eingangsformel
  const preamble = byClass(fragment, 'field--field_preamble');
  if (preamble) for (const field of allByClass(preamble, 'field--field_text')) parseTextField(field, findings, lines, state, []);

  for (const section of sections) {
    const numText = textOf(byClass(section, 'field--field_num'));
    const headlineText = textOf(byClass(section, 'field--field_headline'));
    // Fußnoten der Einheit: Nummern werden dokumentweit fortlaufend vergeben.
    const unitFootnoteLabels: string[] = [];
    for (const item of allByClass(section, 'footnote-item')) {
      footnoteCounter += 1;
      const label = String(footnoteCounter);
      footnotes.push({ label, text: inlineText(item, findings, `Fußnote ${label}`).replace(/\n/gu, ' ') });
      unitFootnoteLabels.push(label);
    }
    if (toc.sections.has(section)) {
      // Inhaltsübersicht als Sektionen: Kennzeichen und Zeilen als Text übernehmen, keine Einheiten.
      const before = lines.length;
      if (numText) {
        const { text: cleanNum, footnotes: markers } = extractFootnoteMarkers(numText);
        lines.push({ kind: 'text', text: [cleanNum, extractFootnoteMarkers(headlineText).text].filter(Boolean).join(' '), centered: false, bold: false, footnotes: [...markers, ...unitFootnoteLabels] });
      } else {
        for (const label of unitFootnoteLabels) lines.push({ kind: 'text', text: `Fn ${label}: ${footnotes.find((entry) => entry.label === label)?.text ?? ''}`, centered: false, bold: false, footnotes: [] });
      }
      const tocField = byClass(section, 'field--field_text');
      if (tocField) parseTextField(tocField, findings, lines, state, unitFootnoteLabels);
      for (let index = before; index < lines.length; index += 1) lines[index] = asTocText(lines[index]!);
      continue;
    }
    if (numText) {
      const { text: cleanNum, footnotes: markers } = extractFootnoteMarkers(numText);
      // Römische Artikelnummern nur hier: `field--field_num` ist das eindeutige Nummernfeld des Portals.
      const unit = parseUnitHeading(cleanNum, { romanArticles: true });
      if (unit) {
        state.sawUnit = true;
        const line: SourceLine = { kind: 'unit', unitType: unit.unitType, label: unit.label, footnotes: [...markers, ...unitFootnoteLabels] };
        const title = [unit.title, extractFootnoteMarkers(headlineText).text].filter(Boolean).join(' ').trim();
        if (title) line.title = title;
        lines.push(line);
      } else {
        const annex = parseAnnexHeading(cleanNum);
        if (annex) {
          const line: SourceLine = { kind: 'annex', label: annex.label, footnotes: unitFootnoteLabels };
          const title = [annex.title, headlineText].filter(Boolean).join(' ').trim();
          if (title) line.title = title;
          lines.push(line);
        } else {
          findings.push({ severity: 'error', code: 'unparsed-unit-heading', message: `Einheitennummer nicht erkannt: „${numText}“` });
          lines.push({ kind: 'heading', text: [cleanNum, headlineText].filter(Boolean).join(' '), footnotes: unitFootnoteLabels });
        }
      }
    } else if (unitFootnoteLabels.length > 0) {
      // Vorspann-Fußnoten ohne Einheit: als Fußnotenblöcke an den Vorspann anhängen.
      lines.push({ kind: 'heading', text: 'Vorspann', footnotes: unitFootnoteLabels });
      lines.pop();
      for (const label of unitFootnoteLabels) lines.push({ kind: 'text', text: `Fn ${label}: ${footnotes.find((entry) => entry.label === label)?.text ?? ''}`, centered: false, bold: false, footnotes: [] });
    }
    const textField = byClass(section, 'field--field_text');
    if (textField) parseTextField(textField, findings, lines, state, unitFootnoteLabels);
    for (const child of elementChildren(section)) {
      const paragraph = findFirst(child, (element) => hasClass(element, 'paragraph--type--article')) ?? (hasClass(child, 'paragraph--type--article') ? child : undefined);
      if (!paragraph) continue;
      for (const inner of elementChildren(paragraph)) {
        const known = ['alert', 'paragraph-header', 'footnote-container', 'field--field_text'].some((name) => hasClass(inner, name));
        if (!known) findings.push({ severity: 'warning', code: 'unknown-section-part', message: `Unbekannter Sektionsbestandteil ${describeElement(inner)} (${classes(inner).join(' ').slice(0, 60)})` });
      }
    }
  }

  // Schlussformel (field--field_conclusions): Unterschriften
  const conclusions = byClass(fragment, 'field--field_conclusions');
  if (conclusions) {
    for (const field of allByClass(conclusions, 'field--field_text')) {
      const before = lines.length;
      parseTextField(field, findings, lines, state, []);
      for (let index = before; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (line.kind === 'text') lines[index] = { kind: 'signature', text: line.text };
      }
    }
  }

  const { blocks, stats } = buildBody(lines, footnotes, findings);
  const result: NativeParseResult = { blocks, footnotes, findings, stats };
  if (state.issuedLine) result.issuedLine = state.issuedLine;
  return result;
}
