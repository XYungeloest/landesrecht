/**
 * Parser für das native Drupal-Dokumentformat von RECHT.NRW: `section.legaldoc-article`
 * je Einheit mit `h2 > span.field--field_num` (§/Artikel), optionaler Überschrift
 * (`span.field--field_headline`), Fußnoten je Einheit (`div.footnote-item`) und dem Text
 * (`div.field--field_text`). Gliederungsüberschriften stehen als zentrierte fette Absätze am
 * Ende des vorangehenden Einheitentexts. Die erste Sektion ohne Nummer trägt Vorspann,
 * Ausfertigungsdatum und Inhaltsübersicht.
 *
 * Bekannte Portalvarianten (jeweils strukturell, nicht per Sonderfall erkannt):
 *  - Nummernfeld mit Spanne („Artikel I bis III“): Überschrift auf Einheitenebene, keine Einheit.
 *  - Nummernfeld mit Gliederung („1. Abschnitt“, „Unterabschnitt 2“): Gliederungsebene.
 *  - Nummernfeld mit doppelt kodierter Entity („§&nbsp;1“): als Leerzeichen gelesen, Befund.
 *  - Sektion ohne Nummer nur mit Fußnoten: Fußnotenblöcke (kein Fließtext).
 *  - Sektion ohne Nummer mit Normtext nach einer Einheit: Quelldefekt (fehlendes Kennzeichen), Befund
 *    (fail-closed) – außer als Fortsetzung einer Nummernfeld-Sektion ohne Text („geteilte Sektion“);
 *    vor der ersten Einheit ist nummernloser Text Vorspann/Präambel.
 *  - `<ul>`/`<ol>` mit `<p>`-Kindern statt `<li>`: Absätze werden wie Absätze gelesen (kein Textverlust).
 *  - Artikel nur als zentrierte fette Absätze mit je Artikel neu beginnender §-Zählung (altes
 *    Ausführungsrecht): die Artikel eröffnen Zählbereiche – nur wenn das Dokument keine Artikel-
 *    Nummernfelder hat und die §-Nummern der Nummernfelder sich tatsächlich wiederholen.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { buildBody, demoteToTocText, extractFootnoteMarkers, hasConsentEvidence, normalizeEntityArtifacts, parseAnnexHeading, parseDivisionHeading, parseItem, parseSubparagraph, parseTreatyHeading, parseUnitHeading, parseUnitRangeHeading, tableBlock, type ParsedBody, type SourceFootnote, type SourceLine } from './body-common.ts';
import { allByClass, attr, byClass, children, classes, describeElement, elementChildren, findFirst, hasClass, isElement, isLayoutTable, isTextNode, normalizeWhitespace, parseHtmlFragment, tableCells, tableRows, textOf, type HtmlElement, type HtmlNode } from './html.ts';

export interface NativeParseResult extends ParsedBody {
  issuedLine?: string;
}

const INLINE_TAGS = new Set(['b', 'i', 'u', 'span', 'a', 'sup', 'sub', 'em', 'strong', 'br', 'small']);
const TRANSPARENT_TAGS = new Set(['p', 'div', 'td', 'th', 'tr', 'tbody', 'thead', 'table']);
const SIGNATURE_PATTERN = /^(Die Landesregierung|Der Ministerpräsident|Die Ministerpräsidentin|Für die Landesregierung)/u;
/** Zentrierte fette Zeile, die nur ein Artikelkennzeichen trägt („Artikel 3“, „Art. 7 8)“ mit altem Fußnotenzeichen). */
const BARE_ARTICLE_LINE = /^(?:Artikel|Art\.)\s*\d+\s?[a-z]?(?:\s*\d{1,2}\))?$/u;

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

export function isBoldParagraph(node: HtmlElement): boolean {
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

interface ParseState {
  sawUnit: boolean;
  issuedLine?: string;
  /** Zentrierte fette Artikelüberschriften eröffnen Zählbereiche (siehe `detectInlineArticleScopes`). */
  inlineArticleScopes: boolean;
}

/** Nummernfeld ohne Fußnotenmarken und Entity-Artefakte. */
function cleanNumberText(raw: string): { text: string; footnotes: string[]; repaired: boolean } {
  const artifacts = normalizeEntityArtifacts(raw);
  const marker = extractFootnoteMarkers(artifacts.text);
  return { text: marker.text, footnotes: marker.footnotes, repaired: artifacts.repaired };
}

/**
 * Artikel nur als zentrierte fette Absätze („Artikel 3“) mit je Artikel neu beginnender §-Zählung in
 * den Nummernfeldern (z. B. Ausführungsgesetz zum BGB). Die Regel gilt dokumentweit und nur unter
 * drei Bedingungen, damit Artikelüberschriften angehängter Änderungsgesetze in anderen Dokumenten
 * unverändert Überschriften bleiben: kein Nummernfeld ist ein Artikel, mindestens eine §-Nummer der
 * Nummernfelder wiederholt sich, und es gibt mindestens eine solche Artikelzeile. Parser und
 * Integritätszählung (`rawMetrics`) nutzen dieselbe Entscheidung.
 */
export function detectInlineArticleScopes(root: HtmlNode): boolean {
  const labels = allByClass(root, 'field--field_num').map((element) => parseUnitHeading(cleanNumberText(textOf(element)).text, { romanArticles: true }));
  if (labels.some((unit) => unit?.unitType === 'article')) return false;
  const paragraphLabels = labels.filter((unit): unit is NonNullable<typeof unit> => Boolean(unit)).map((unit) => unit.label);
  if (new Set(paragraphLabels).size === paragraphLabels.length) return false;
  return allByClass(root, 'field--field_text').some((field) => allByTagDeep(field, 'p').some((paragraph) => hasClass(paragraph, 'text-align-center') && isBoldParagraph(paragraph) && textOf(paragraph, { breaks: true }).split('\n').some((line) => BARE_ARTICLE_LINE.test(extractFootnoteMarkers(line).text))));
}

/**
 * Zerlegt einen zentrierten fetten Absatz zeilenweise in Artikelüberschriften und Begleitzeilen:
 * Zeilen vor der ersten Artikelzeile werden Überschriften, Zeilen danach der Artikeltitel. Liefert
 * `null`, wenn der Absatz keine Artikelzeile enthält oder als Ganzes eine andere Überschrift ist.
 */
export function classifyInlineArticleLines(raw: string): SourceLine[] | null {
  const lines = raw.split('\n').map((line) => extractFootnoteMarkers(line)).filter((line) => line.text);
  if (lines.length === 0) return null;
  const flat = lines.map((line) => line.text).join(' ');
  if (parseDivisionHeading(flat) || (parseAnnexHeading(flat) && /^Anlage/u.test(flat)) || parseTreatyHeading(flat) || SIGNATURE_PATTERN.test(flat)) return null;
  if (!lines.some((line) => BARE_ARTICLE_LINE.test(line.text))) return null;
  const output: SourceLine[] = [];
  let current: Extract<SourceLine, { kind: 'unit' }> | undefined;
  for (const line of lines) {
    if (BARE_ARTICLE_LINE.test(line.text)) {
      const unit = parseUnitHeading(line.text)!;
      current = { kind: 'unit', unitType: 'article', label: unit.label, footnotes: line.footnotes };
      if (unit.title) current.title = unit.title;
      output.push(current);
    } else if (current) {
      current.title = [current.title, line.text].filter(Boolean).join(' ');
      current.footnotes.push(...line.footnotes);
    } else {
      output.push({ kind: 'heading', text: line.text, footnotes: line.footnotes });
    }
  }
  return output;
}

/** Übersetzt die Absätze eines Einheitentexts in flache Zeilen. */
function parseTextField(field: HtmlElement, findings: ImportFinding[], lines: SourceLine[], state: ParseState): void {
  const wrapper = byClass(field, 'tex2jax_process') ?? field;
  for (const node of elementChildren(wrapper)) parseBlockNode(node, findings, lines, state);
}

function parseBlockNode(node: HtmlElement, findings: ImportFinding[], lines: SourceLine[], state: ParseState): void {
  const name = node.tagName.toLowerCase();
  if (name === 'table') {
    // Einzeilige Hülltabelle um eine Tabelle (Word-Layout): Zellinhalte wie Absätze des Felds lesen.
    if (isLayoutTable(node)) for (const cell of tableRows(node).flatMap(tableCells)) parseTextField(cell, findings, lines, state);
    else lines.push(parseTable(node, findings));
    return;
  }
  if (name === 'ul' || name === 'ol') {
    let blockChildren = 0;
    for (const item of elementChildren(node)) {
      if (item.tagName === 'li') {
        const text = inlineText(item, findings, 'Listenpunkt').replace(/\n/gu, ' ');
        const parsed = parseItem(text);
        if (parsed) lines.push({ kind: 'item', label: parsed.label, text: parsed.text, level: parsed.level, footnotes: [] });
        else lines.push({ kind: 'item', text, level: 0, footnotes: [] });
        continue;
      }
      // Portalmarkup mit <p> (oder anderen Blöcken) direkt in <ul>: als Absätze lesen, nie verwerfen.
      blockChildren += 1;
      parseBlockNode(item, findings, lines, state);
    }
    if (blockChildren > 0) findings.push({ severity: 'info', code: 'list-with-block-children', message: `<${name}> mit ${blockChildren} Blockelement(en) statt <li>; als Absätze übernommen` });
    return;
  }
  if (name === 'div') {
    parseTextField(node, findings, lines, state);
    return;
  }
  if (name !== 'p') {
    findings.push({ severity: 'error', code: 'unknown-block-element', message: `Unbekanntes Blockelement ${describeElement(node)} im Einheitentext: „${textOf(node).slice(0, 80)}“` });
    return;
  }
  const raw = inlineText(node, findings, 'p');
  if (!raw) return;
  const centered = hasClass(node, 'text-align-center');
  const bold = isBoldParagraph(node);
  const flat = raw.replace(/\n/gu, ' ');
  const { text, footnotes } = extractFootnoteMarkers(flat);
  if (!text) return;

  if (!state.sawUnit && !state.issuedLine && /^Vom\s+\d{1,2}\.\s*\p{L}+\s+\d{4}/u.test(text)) state.issuedLine = text;

  if (centered) {
    const division = parseDivisionHeading(text);
    if (division) {
      const line: SourceLine = { kind: 'division', level: division.level, label: division.label, footnotes };
      if (division.title) line.title = division.title;
      lines.push(line);
      return;
    }
    // Artikel als zentrierte Überschrift (Zählbereich) – vor der Titelfortsetzung, damit „Artikel 1“
    // nach „Erster Abschnitt“ nicht zum Gliederungstitel wird; `rawMetrics` zählt zustandsfrei gleich.
    const articleLines = state.inlineArticleScopes && bold ? classifyInlineArticleLines(raw) : null;
    if (articleLines) {
      for (const line of articleLines) {
        if (line.kind === 'unit') state.sawUnit = true;
        lines.push(line);
      }
      return;
    }
    // Mehrzeilige Gliederungsüberschrift: „Zweiter Teil“ + „Von den Grundrechten …“
    const previous = lines[lines.length - 1];
    if (bold && previous && previous.kind === 'division' && !previous.title) {
      previous.title = text;
      return;
    }
    const annex = bold ? parseAnnexHeading(text) : null;
    if (annex && /^Anlage/u.test(text)) {
      const line: SourceLine = { kind: 'annex', label: annex.label, footnotes };
      if (annex.title) line.title = annex.title;
      lines.push(line);
      return;
    }
    // Nachstehend veröffentlichter Vertragstext eines Zustimmungsgesetzes: eigener Container mit
    // eigener Artikelzählung (nur nach Zustimmungsformel/Veröffentlichungsvermerk im Gesetzestext).
    const treaty = bold && state.sawUnit ? parseTreatyHeading(text) : null;
    if (treaty && hasConsentEvidence(lines)) {
      const line: SourceLine = { kind: 'annex', label: treaty.label, footnotes };
      if (treaty.title) line.title = treaty.title;
      lines.push(line);
      return;
    }
    if (SIGNATURE_PATTERN.test(text) && state.sawUnit) {
      lines.push({ kind: 'signature', text });
      return;
    }
    lines.push({ kind: 'text', text, centered: true, bold, footnotes });
    return;
  }

  const subparagraph = parseSubparagraph(text);
  if (subparagraph) {
    lines.push({ kind: 'subparagraph', label: subparagraph.label, text: subparagraph.text, footnotes });
    return;
  }
  const item = parseItem(text);
  if (item) {
    lines.push({ kind: 'item', label: item.label, text: item.text, level: item.level, footnotes });
    return;
  }
  lines.push({ kind: 'text', text, centered: false, bold, footnotes });
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
  return parseUnitHeading(cleanNumberText(numText).text, { romanArticles: true })?.label;
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

/** Erste Zeile einer nummernlosen Sektion, die Normtext statt einer Überschrift ist. */
function isBodyContentLine(line: SourceLine | undefined): boolean {
  if (!line) return false;
  return line.kind === 'subparagraph' || line.kind === 'item' || line.kind === 'table' || (line.kind === 'text' && !line.centered);
}

export function parseNativeDocument(bodyHtml: string): NativeParseResult {
  const findings: ImportFinding[] = [];
  const fragment = parseHtmlFragment(bodyHtml);
  const footnotes: SourceFootnote[] = [];
  const lines: SourceLine[] = [];
  const state: ParseState = { sawUnit: false, inlineArticleScopes: detectInlineArticleScopes(fragment) };
  let footnoteCounter = 0;
  const repairedNumbers: string[] = [];
  const rangeHeadings: string[] = [];
  const divisionNumbers: string[] = [];
  const continuedSections: string[] = [];
  /** Hat die vorige Sektion Textzeilen geliefert? (Nummernfeld-Sektion ohne Text → der Text folgt in einer nummernlosen Sektion.) */
  let previousSectionHadText = true;

  const sections = allByClass(fragment, 'legaldoc-article');
  if (sections.length === 0) findings.push({ severity: 'error', code: 'no-sections', message: 'Natives Dokument ohne legaldoc-article-Sektionen' });
  if (state.inlineArticleScopes) findings.push({ severity: 'info', code: 'inline-article-scopes', message: 'Artikel stehen nur als zentrierte Überschriften im Text; die §-Zählung beginnt je Artikel neu – Artikel eröffnen Zählbereiche' });

  const toc = detectTocSections(fragment);
  if (toc.reason) findings.push({ severity: 'error', code: 'toc-sections-unresolved', message: `Inhaltsübersicht als Einheitensektionen angelegt, aber nicht auflösbar: ${toc.reason}` });
  else if (toc.units > 0) findings.push({ severity: 'info', code: 'toc-sections-demoted', message: `Inhaltsübersicht: ${toc.units} Einheitensektion(en) als Text übernommen (keine Einheiten)` });

  // Vorspann (field--field_preamble): Ausfertigungsdatum, Eingangsformel
  const preamble = byClass(fragment, 'field--field_preamble');
  if (preamble) for (const field of allByClass(preamble, 'field--field_text')) parseTextField(field, findings, lines, state);

  sections.forEach((section, sectionIndex) => {
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
        const number = cleanNumberText(numText);
        lines.push({ kind: 'text', text: [number.text, extractFootnoteMarkers(headlineText).text].filter(Boolean).join(' '), centered: false, bold: false, footnotes: [...number.footnotes, ...unitFootnoteLabels] });
      } else if (unitFootnoteLabels.length > 0) {
        lines.push({ kind: 'footnotes', labels: unitFootnoteLabels });
      }
      const tocField = byClass(section, 'field--field_text');
      if (tocField) parseTextField(tocField, findings, lines, state);
      for (let index = before; index < lines.length; index += 1) lines[index] = demoteToTocText(lines[index]!);
      previousSectionHadText = true;
      return;
    }
    if (numText) {
      const number = cleanNumberText(numText);
      if (number.repaired) repairedNumbers.push(numText);
      const cleanNum = number.text;
      const markers = number.footnotes;
      // Römische Artikelnummern nur hier: `field--field_num` ist das eindeutige Nummernfeld des Portals.
      const unit = parseUnitHeading(cleanNum, { romanArticles: true });
      const headline = extractFootnoteMarkers(headlineText).text;
      if (unit) {
        state.sawUnit = true;
        const line: SourceLine = { kind: 'unit', unitType: unit.unitType, label: unit.label, footnotes: [...markers, ...unitFootnoteLabels] };
        const title = [unit.title, headline].filter(Boolean).join(' ').trim();
        if (title) line.title = title;
        lines.push(line);
      } else {
        const range = parseUnitRangeHeading(cleanNum);
        const division = range ? null : parseDivisionHeading(cleanNum);
        const annex = range || division ? null : parseAnnexHeading(cleanNum);
        if (range) {
          rangeHeadings.push(range.label);
          const line: SourceLine = { kind: 'unit-range', unitType: range.unitType, label: range.label, footnotes: [...markers, ...unitFootnoteLabels] };
          const title = [range.title, headline].filter(Boolean).join(' ').trim();
          if (title) line.title = title;
          lines.push(line);
        } else if (division) {
          divisionNumbers.push(division.label);
          const line: SourceLine = { kind: 'division', level: division.level, label: division.label, footnotes: [...markers, ...unitFootnoteLabels] };
          const title = [division.title, headline].filter(Boolean).join(' ').trim();
          if (title) line.title = title;
          lines.push(line);
        } else if (annex) {
          const line: SourceLine = { kind: 'annex', label: annex.label, footnotes: unitFootnoteLabels };
          const title = [annex.title, headline].filter(Boolean).join(' ').trim();
          if (title) line.title = title;
          lines.push(line);
        } else {
          findings.push({ severity: 'error', code: 'unparsed-unit-heading', message: `Einheitennummer nicht erkannt (Sektion ${sectionIndex + 1}, field--field_num): „${numText.slice(0, 80)}“` });
          lines.push({ kind: 'heading', text: [cleanNum, headline].filter(Boolean).join(' '), footnotes: unitFootnoteLabels });
        }
      }
    } else if (unitFootnoteLabels.length > 0) {
      // Fußnoten ohne Einheit (Vorspann, nummernlose Sektion): Fußnotenblöcke, kein Fließtext.
      lines.push({ kind: 'footnotes', labels: unitFootnoteLabels });
    }
    const before = lines.length;
    const lineBefore = lines[before - 1];
    const textField = byClass(section, 'field--field_text');
    if (textField) parseTextField(textField, findings, lines, state);
    const bodyContent = !numText && isBodyContentLine(lines[before]);
    if (bodyContent && state.sawUnit && !previousSectionHadText) {
      // Portalvariante „geteilte Sektion“: Nummernfeld-Sektion ohne Text, der Text folgt in einer
      // nummernlosen Sektion und gehört zur vorigen Einheit.
      continuedSections.push(String(sectionIndex + 1));
    } else if (bodyContent && (state.sawUnit || lineBefore?.kind === 'division')) {
      // Nummernlose Sektion mit Normtext nach einer Einheit mit Text oder direkt nach einer
      // Gliederungsüberschrift: fehlendes §-/Artikel-Kennzeichen in der Quelle. Ihr Text würde sonst
      // still der vorigen Einheit (oder der Gliederung) zugeschlagen. Vor der ersten Einheit ist
      // nummernloser Text Vorspann/Präambel.
      const first = lines[before]!;
      const snippet = 'text' in first ? first.text.slice(0, 80) : first.kind;
      findings.push({ severity: 'error', code: 'structure-unnumbered-section', message: `Sektion ${sectionIndex + 1} ohne Nummernfeld enthält Normtext (Quelle ohne §-/Artikel-Kennzeichen): „${snippet}“` });
    }
    previousSectionHadText = lines.length > before;
    for (const child of elementChildren(section)) {
      const paragraph = findFirst(child, (element) => hasClass(element, 'paragraph--type--article')) ?? (hasClass(child, 'paragraph--type--article') ? child : undefined);
      if (!paragraph) continue;
      for (const inner of elementChildren(paragraph)) {
        const known = ['alert', 'paragraph-header', 'footnote-container', 'field--field_text'].some((name) => hasClass(inner, name));
        if (!known) findings.push({ severity: 'warning', code: 'unknown-section-part', message: `Unbekannter Sektionsbestandteil ${describeElement(inner)} (${classes(inner).join(' ').slice(0, 60)})` });
      }
    }
  });
  if (repairedNumbers.length > 0) findings.push({ severity: 'warning', code: 'entity-artifact-repaired', message: `Doppelt kodierte Entity „&nbsp;“ in ${repairedNumbers.length} Nummernfeld(ern) als Leerzeichen gelesen: ${repairedNumbers.map((entry) => `„${entry}“`).join(', ')}` });
  if (rangeHeadings.length > 0) findings.push({ severity: 'info', code: 'unit-range-heading', message: `${rangeHeadings.length} Nummernfeld(er) mit Einheitenspanne als Überschrift übernommen (keine Einheiten): ${rangeHeadings.join(', ')}` });
  if (divisionNumbers.length > 0) findings.push({ severity: 'info', code: 'division-in-number-field', message: `${divisionNumbers.length} Nummernfeld(er) mit Gliederungskennzeichen als Gliederungsebene übernommen: ${divisionNumbers.join(', ')}` });
  if (continuedSections.length > 0) findings.push({ severity: 'info', code: 'section-continuation', message: `${continuedSections.length} nummernlose Sektion(en) setzen den Text der vorigen Nummernfeld-Sektion ohne Text fort (Sektion ${continuedSections.join(', ')})` });

  // Schlussformel (field--field_conclusions): Unterschriften
  const conclusions = byClass(fragment, 'field--field_conclusions');
  if (conclusions) {
    for (const field of allByClass(conclusions, 'field--field_text')) {
      const before = lines.length;
      parseTextField(field, findings, lines, state);
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
