/**
 * Parser für die Legacy-Textdateien von RECHT.NRW (`/system/files/BH/<id>.htm`): aus Word
 * exportiertes HTML mit den Klassen `lrueberschrift` (Titel), `lrdetail` (§-/Artikelüberschrift),
 * `lrfundstelle` (Fundstelle in Fußnote 1), zentrierten fetten Absätzen (Gliederung), Absätzen
 * mit „(1)“-Kennzeichen, eingerückten Nummerierungen (`margin-left`) und einer Fußnotentabelle
 * am Ende (`<a name=FNn>`). Word-Hilfselemente (`<o:p>`, `<u5:p>`, `span.SpellE`) werden
 * ignoriert. Jedes unbekannte Element und jede unbekannte Absatzklasse ist ein Befund.
 *
 * `lrdetail` trägt im Portal nicht nur Einheitenüberschriften. Die Klassifikation ist eine feste
 * Kette (`classifyDetailHeading`): Einheit → Einheitenspanne („§§ 15 bis 16“) → Gliederung
 * („Teil 1“) → Anlage → Einheit mit hergeleitetem Zeichen („84“ nach „§ 83“, Befund) → Absatztext
 * („(1) …“, Befund) → Fortsetzung des Einheitentitels → reine Überschrift (Befund); alles andere
 * bleibt ein Fehler. Inhaltsübersichten, die Einheiten als `lrdetail` wiederholen, werden wie im
 * nativen Format als Text übernommen (`detectLegacyToc`).
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { buildBody, demoteToTocText, extractFootnoteMarkers, hasConsentEvidence, inferUnitHeading, parseAnnexHeading, parseDivisionHeading, parseItem, parseSubparagraph, parseTreatyHeading, parseUnitHeading, parseUnitRangeHeading, tableBlock, type DivisionLevel, type ParsedBody, type SourceFootnote, type SourceLine } from './body-common.ts';
import { attr, children, classes, describeElement, elementChildren, findFirst, hasClass, isElement, isLayoutTable, isTextNode, normalizeWhitespace, parseHtml, tableCells, tableRows, textOf, type HtmlElement, type HtmlNode } from './html.ts';

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

// `<textend>`/`<textstart: …>`: inhaltsleere Marker des Portal-CMS (mit Metadatenattributen), ungeschlossen wie <u6:p>.
const IGNORED_TAGS = new Set(['hr', 'o:p', 'u5:p', 'u6:p', 'u7:p', 'u8:p', 'u9:p', 'u10:p', 'u11:p', 'u12:p', 'u13:p', 'style', 'meta', 'title', 'head', 'link', 'textend', 'textstart:']);
const INLINE_TAGS = new Set(['b', 'i', 'u', 'span', 'a', 'sup', 'sub', 'font', 'em', 'strong', 'br', 'st1:place', 'st1:personname', 'nobr', 'small', 'big']);
// `<dir>` (veraltete Verzeichnisliste) dient in Word-Exporten nur der Einrückung; in Zellen ist sie bedeutungslos.
const TRANSPARENT_TAGS = new Set(['p', 'div', 'td', 'th', 'tr', 'tbody', 'thead', 'table', 'center', 'blockquote', 'dir']);
/** Durchstreichung: ohne sichtbaren Text rein präsentational, mit Text semantisch unklar (gestrichen?) → Befund. */
const STRUCK_TAGS = new Set(['s', 'strike', 'del']);
/** Titel der Inhaltsübersicht („Inhaltsübersicht (Fn 7)“): Überschrift, kein Normtext. */
const TOC_TITLE_CLASS = 'verzeichnistitelstammdokument';
const KNOWN_PARAGRAPH_CLASSES = new Set(['lrueberschrift', 'lrdetail', 'lrfundstelle', 'msonormal', 'feldinhalt', 'feldinhalt0', 'betreff', 'msobodytext', 'msolistparagraph', 'msolistparagraphcxspmiddle', 'msolistparagraphcxspfirst', 'msolistparagraphcxsplast', 'msotoc1', 'msotoc2', 'msotoc3', 'msotitle', 'default', 'juristischerabsatznummeriert', TOC_TITLE_CLASS]);
/**
 * Word-Formatvorlagen ohne eigene Struktursemantik (die Struktur trägt der Text: „(1)“, „1.“):
 * `e0`/`e1`, `1-1text`, `MsoToc9`, `MsoBodyText2`, `NummerierungStufe1` (Stufe → Einrückungsebene),
 * `MsoNormal0` (Variante der Standardvorlage), `MsoPapDefault` (Absatz-Standardeigenschaften, die
 * Word als eigene Klasse exportiert, z. B. Tarifstellen-Anlagen der AVwGebO).
 */
const KNOWN_PARAGRAPH_CLASS_PATTERNS = [/^e\d+$/u, /^\d+-\d+text$/u, /^msotoc\d$/u, /^msobodytext\d*$/u, /^nummerierungstufe\d$/u, /^msonormal\d+$/u, /^msopapdefault$/u];
/** Einrückung je `<dir>`-Ebene in Punkt: Word exportiert eine Listenebene (36pt) als `<dir><dir>`. */
const DIR_INDENT_POINTS = 18;
/**
 * Word-Export-Defekt: fehlendes Leerzeichen zwischen Tagname und erstem Attribut (`<pclass=MsoNormal>`,
 * `<pstyle='margin-left:72.0pt'>`, `<ahref="#FN4">`). parse5 liest das als unbekanntes, nie geschlossenes
 * Element, das den gesamten Restinhalt verschluckt.
 */
const MALFORMED_TAG_PATTERN = /<(p|a)(class|style|align|href)=/giu;
/** Text, der wie ein (nicht lesbares) Einheitenkennzeichen beginnt: bleibt fail-closed ein Fehler. */
const UNIT_LIKE_START = /^(?:§|Art\b|Artikel\b|Paragraph\b|Nr\.?\s*\d|\d)/u;
/** Überschrift ohne Einheitenkennzeichen: kurz und ohne Satzende. */
const MAX_HEADING_LENGTH = 200;
const TOC_HEADING = /^Inhalts(?:übersicht|verzeichnis)$/u;

function isIgnorable(node: HtmlElement): boolean {
  const name = node.tagName.toLowerCase();
  return IGNORED_TAGS.has(name) || /^u\d+:p$/u.test(name) || name === 'o:p';
}

function isKnownParagraphClass(className: string): boolean {
  return KNOWN_PARAGRAPH_CLASSES.has(className) || KNOWN_PARAGRAPH_CLASS_PATTERNS.some((pattern) => pattern.test(className));
}

/** Repariert den Tag-Defekt kontrolliert (nur die beobachteten Tag/Attribut-Paare) und zählt die Stellen. */
export function repairLegacyMarkup(html: string): { html: string; repaired: number } {
  let repaired = 0;
  const output = html.replace(MALFORMED_TAG_PATTERN, (_match, tag: string, attribute: string) => {
    repaired += 1;
    return `<${tag} ${attribute}=`;
  });
  return { html: output, repaired };
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
    if (STRUCK_TAGS.has(name)) {
      // <s><span><br></span></s> (Word-Export) ist reine Formatierung; durchgestrichener Text bleibt ein Befund.
      const struck = textOf(current);
      if (struck) findings.push({ severity: 'error', code: 'unknown-inline-element', message: `Durchgestrichener Text <${name}> in ${context}: „${struck.slice(0, 60)}“` });
    } else if (!INLINE_TAGS.has(name) && !TRANSPARENT_TAGS.has(name)) {
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

/** Einrückungsebene aus `margin-left`, umschließenden `<dir>`-Ebenen oder der Vorlage `NummerierungStufeN`. */
function marginLevel(node: HtmlElement, dirDepth = 0): number | null {
  const numberingLevel = classes(node).map((name) => /^nummerierungstufe(\d)$/iu.exec(name)).find(Boolean);
  if (numberingLevel) return Number.parseInt(numberingLevel[1]!, 10) - 1;
  const margin = /margin-left:\s*([\d.]+)pt/u.exec(attr(node, 'style') ?? '');
  if (!margin && dirDepth === 0) return null;
  const points = (margin ? Number.parseFloat(margin[1]!) : 0) + dirDepth * DIR_INDENT_POINTS;
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
  let emptyRows = 0;
  const parsedRows: Array<Array<{ text: string; header: boolean; colspan?: number; rowspan?: number }>> = [];
  for (const row of rows) {
    const cells = elementChildren(row).filter((cell) => cell.tagName === 'td' || cell.tagName === 'th');
    if (cells.every((cell) => !textOf(cell))) emptyRows += 1;
    // Ankernamen sind in der Quelle uneinheitlich geschrieben („FN1“, „Fn2“); spätere Fußnoten
    // tragen teils nur die Beschriftung „Fn 2“ ohne Anker.
    const anchor = cells[0] ? findFirst(cells[0], (element) => element.tagName === 'a' && /^FN\d+/iu.test(attr(element, 'name') ?? '')) : undefined;
    const labelMatch = anchor ? /^FN(\d+)/iu.exec(attr(anchor, 'name') ?? '') : (anchoredRows > 0 && cells[0] ? /^Fn\s*(\d+)$/u.exec(textOf(cells[0])) : null);
    if (labelMatch && cells.length >= 2) {
      anchoredRows += 1;
      const label = labelMatch[1]!;
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
  // Leere Schlusszeilen (Word-Export) zählen nicht gegen die Fußnotentabelle.
  const isFootnoteTable = anchoredRows > 0 && anchoredRows * 2 >= rows.length - emptyRows;
  if (isFootnoteTable) return citationNote ? { footnotes, citationNote } : { footnotes };
  return { block: tableBlock(parsedRows, findings) };
}

/** Dokumentcontainer: `div.Section1`/`div.WordSection1`, sonst der ganze Body. */
function documentContainer(html: string): HtmlElement {
  const document = parseHtml(html);
  const body = findFirst(document, (element) => element.tagName === 'body');
  if (!body) throw new Error('Legacy-Dokument ohne <body>');
  // Manche Dateien enthalten vor dem eigentlichen Dokument einen Kopf mit Gliederungsnummer und
  // ein zweites <html>; parse5 fasst alles in einen Body zusammen.
  const section = findFirst(body, (element) => element.tagName === 'div' && classes(element).some((name) => /section1/iu.test(name)));
  return section ?? body;
}

interface TopLevel {
  nodes: HtmlElement[];
  /** Zahl der umschließenden `<dir>`-Ebenen (Einrückung) je Blockelement. */
  dirDepth: Map<HtmlElement, number>;
  /** `<center>` vererbt Zentrierung. */
  centeredByWrapper: Set<HtmlElement>;
}

/** Blockelemente des Dokuments in Lesereihenfolge; Hüllelemente (div, dir, center, Hülltabellen) werden aufgelöst. */
function collectTopLevel(container: HtmlElement): TopLevel {
  const result: TopLevel = { nodes: [], dirDepth: new Map(), centeredByWrapper: new Set() };
  const collect = (parent: HtmlElement, depth = 0, centered = false): void => {
    for (const node of elementChildren(parent)) {
      const name = node.tagName.toLowerCase();
      if (name === 'div' || name === 'dir' || name === 'center' || (isIgnorable(node) && name !== 'style' && name !== 'head')) collect(node, depth + (name === 'dir' ? 1 : 0), centered || name === 'center');
      // Einzeilige Word-Hülltabelle um eine Tabelle: Zellinhalte (Absätze, innere Tabelle) auf Dokumentebene heben.
      else if (name === 'table' && isLayoutTable(node)) for (const cell of tableRows(node).flatMap(tableCells)) collect(cell, depth, centered);
      else {
        result.nodes.push(node);
        if (depth > 0) result.dirDepth.set(node, depth);
        if (centered) result.centeredByWrapper.add(node);
      }
    }
  };
  collect(container);
  return result;
}

export interface UnitContext {
  unitType: 'paragraph' | 'article';
  label: string;
}

export type DetailClassification =
  | { kind: 'unit'; unitType: 'paragraph' | 'article'; label: string; title?: string; footnotes: string[]; inferred: boolean }
  | { kind: 'unit-range'; unitType: 'paragraph' | 'article'; label: string; title?: string; footnotes: string[]; inferred: boolean }
  | { kind: 'division'; level: DivisionLevel; label: string; title?: string; footnotes: string[] }
  | { kind: 'annex'; label: string; title?: string; footnotes: string[] }
  | { kind: 'subparagraph'; label: string; text: string; footnotes: string[] }
  | { kind: 'title-continuation'; text: string; footnotes: string[] }
  | { kind: 'heading'; text: string; footnotes: string[] }
  | { kind: 'footnotes-only'; footnotes: string[] }
  | { kind: 'empty' }
  | { kind: 'unparsed'; text: string; footnotes: string[] };

/**
 * Klassifiziert den Text einer `lrdetail`-Überschrift (Zeilen durch `\n`). `previousUnit` ist die
 * zuletzt gelesene Einheit (für hergeleitete Zeichen), `previousTitle` der Titel der unmittelbar
 * vorangehenden Einheitenzeile (für Titelfortsetzungen). Parser und Integritätszählung nutzen
 * dieselbe Kette.
 */
export function classifyDetailHeading(rawText: string, context: { previousUnit?: UnitContext; previousTitle?: string } = {}): DetailClassification {
  const [first = '', ...rest] = rawText.split('\n');
  const marker = extractFootnoteMarkers(first);
  const restText = extractFootnoteMarkers(rest.join(' ')).text;
  const all = extractFootnoteMarkers(rawText.replace(/\n/gu, ' '));
  const footnotes = all.footnotes;
  const joinTitle = (own: string | undefined): string | undefined => [own, restText].filter(Boolean).join(' ').trim() || undefined;
  const withTitle = <T extends DetailClassification>(base: T, own: string | undefined): T => {
    const title = joinTitle(own);
    return title ? { ...base, title } : base;
  };

  const unit = parseUnitHeading(marker.text);
  if (unit) return withTitle({ kind: 'unit', unitType: unit.unitType, label: unit.label, footnotes, inferred: false }, unit.title);
  const range = parseUnitRangeHeading(marker.text);
  if (range) return withTitle({ kind: 'unit-range', unitType: range.unitType, label: range.label, footnotes, inferred: false }, range.title);
  const division = parseDivisionHeading(marker.text);
  if (division) return withTitle({ kind: 'division', level: division.level, label: division.label, footnotes }, division.title);
  const annex = parseAnnexHeading(marker.text);
  if (annex) return withTitle({ kind: 'annex', label: annex.label, footnotes }, annex.title);
  if (!all.text) return footnotes.length > 0 ? { kind: 'footnotes-only', footnotes } : { kind: 'empty' };
  const inferred = inferUnitHeading(marker.text, context.previousUnit);
  if (inferred) return withTitle({ kind: inferred.kind, unitType: inferred.unitType, label: inferred.label, footnotes, inferred: true }, inferred.title);
  const subparagraph = parseSubparagraph(all.text);
  if (subparagraph) return { kind: 'subparagraph', label: subparagraph.label, text: subparagraph.text, footnotes };
  if (UNIT_LIKE_START.test(all.text)) return { kind: 'unparsed', text: all.text, footnotes };
  const continuation = context.previousTitle !== undefined && (/^\p{Ll}/u.test(all.text) || /(?:\bund|\boder|\bsowie|,|-|–)$/u.test(context.previousTitle));
  if (continuation) return { kind: 'title-continuation', text: all.text, footnotes };
  if (all.text.length <= MAX_HEADING_LENGTH && !/[.;]$/u.test(all.text)) return { kind: 'heading', text: all.text, footnotes };
  return { kind: 'unparsed', text: all.text, footnotes };
}

export interface LegacyTocDetection {
  /** Blockelemente der Inhaltsübersicht (Einheiten- und Gliederungszeilen), die als Text zu lesen sind. */
  region: Set<HtmlElement>;
  /** Anzahl der `lrdetail`-Einheiten in der Region. */
  units: number;
  reason?: string;
}

/**
 * Inhaltsübersicht, die Einheiten als `lrdetail` wiederholt (z. B. Ruhrverbandsgesetz: „Artikel 1“,
 * „Artikel 2 …“ zwischen der Überschrift „Inhaltsübersicht“ und dem Textbeginn). Die Region beginnt
 * beim ersten `lrdetail`-Einheitenkennzeichen nach der Überschrift und endet, wo dasselbe Kennzeichen
 * erneut als `lrdetail` erscheint. Sie gilt nur als Inhaltsübersicht, wenn sie ausschließlich
 * Überschriftenzeilen enthält (Einheiten- oder Gliederungskennzeichen, keine Absätze, Nummerierungen
 * oder Tabellen) und jedes Kennzeichen später wiederkehrt; sonst bleibt sie unangetastet und wird
 * gemeldet. Parser und Integritätszählung (`countLegacyUnitHeadings`) nutzen dieselbe Entscheidung.
 */
export function detectLegacyToc(nodes: readonly HtmlElement[]): LegacyTocDetection {
  const none: LegacyTocDetection = { region: new Set(), units: 0 };
  const plainText = (node: HtmlElement): string => extractFootnoteMarkers(textOf(node)).text;
  const tocIndex = nodes.findIndex((node) => node.tagName === 'p' && TOC_HEADING.test(plainText(node)));
  if (tocIndex < 0) return none;
  const detailLabel = (node: HtmlElement): string | undefined => {
    if (node.tagName !== 'p' || !hasClass(node, 'lrdetail')) return undefined;
    const classification = classifyDetailHeading(textOf(node, { breaks: true }));
    return classification.kind === 'unit' ? classification.label : undefined;
  };
  let first = -1;
  let firstLabel: string | undefined;
  let restart = -1;
  for (let index = tocIndex + 1; index < nodes.length; index += 1) {
    const label = detailLabel(nodes[index]!);
    if (!label) continue;
    if (first < 0) {
      first = index;
      firstLabel = label;
    } else if (label === firstLabel) {
      restart = index;
      break;
    }
  }
  if (first < 0 || restart < 0) return none;
  const region = nodes.slice(first, restart);
  for (const node of region) {
    if (node.tagName !== 'p') return { ...none, reason: `Blockelement ${describeElement(node)} in der Inhaltsübersicht` };
    const text = plainText(node);
    if (!text) continue;
    if (hasClass(node, 'lrdetail')) {
      const kind = classifyDetailHeading(textOf(node, { breaks: true })).kind;
      if (kind !== 'unit' && kind !== 'division' && kind !== 'annex') return { ...none, reason: `Zeile „${text.slice(0, 60)}“ ist kein Kennzeichen` };
      continue;
    }
    if (!parseUnitHeading(text) && !parseDivisionHeading(text)) return { ...none, reason: `Zeile „${text.slice(0, 60)}“ ist keine Überschriftenzeile` };
  }
  const later = new Set(nodes.slice(restart).map(detailLabel).filter((label): label is string => Boolean(label)));
  const tocLabels = region.map(detailLabel).filter((label): label is string => Boolean(label));
  const missing = tocLabels.filter((label) => !later.has(label));
  if (missing.length > 0) return { ...none, reason: `Kennzeichen ${missing.join(', ')} der Inhaltsübersicht kehren im Text nicht wieder` };
  return { region: new Set(region), units: tocLabels.length };
}

/**
 * Zahl der `lrdetail`-Einheiten, die der Parser als Einheit liest (einschließlich hergeleiteter
 * Zeichen, ohne Inhaltsübersicht) – parserunabhängige Zählung für die Integritätsprüfung über
 * dieselbe Klassifikationskette.
 */
export function countLegacyUnitHeadings(html: string): number {
  const topLevel = collectTopLevel(documentContainer(repairLegacyMarkup(html).html));
  const toc = detectLegacyToc(topLevel.nodes);
  let previousUnit: UnitContext | undefined;
  let count = 0;
  for (const node of topLevel.nodes) {
    if (node.tagName !== 'p' || !hasClass(node, 'lrdetail') || toc.region.has(node)) continue;
    const classification = classifyDetailHeading(textOf(node, { breaks: true }), previousUnit ? { previousUnit } : {});
    if (classification.kind === 'unit') {
      count += 1;
      previousUnit = { unitType: classification.unitType, label: classification.label };
    }
  }
  return count;
}

export function parseLegacyDocument(html: string): LegacyParseResult {
  const findings: ImportFinding[] = [];
  const repair = repairLegacyMarkup(html);
  if (repair.repaired > 0) findings.push({ severity: 'warning', code: 'malformed-tag-repaired', message: `${repair.repaired} Tag(s) ohne Leerzeichen vor dem Attribut (z. B. <pclass=…>) im Quellmarkup repariert` });
  const container = documentContainer(repair.html);

  const head: LegacyDocumentHead = { titleLines: [] };
  const footnotes: SourceFootnote[] = [];
  const lines: SourceLine[] = [];
  let sawFirstUnit = false;
  let previousUnit: UnitContext | undefined;
  const inferredMarkers: string[] = [];
  const detailHeadings: string[] = [];
  const detailBodyTexts: string[] = [];
  const titleContinuations: string[] = [];
  const detailDivisions: string[] = [];

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

  const { nodes: topLevel, dirDepth, centeredByWrapper } = collectTopLevel(container);
  const toc = detectLegacyToc(topLevel);
  if (toc.reason) findings.push({ severity: 'warning', code: 'toc-region-unresolved', message: `Inhaltsübersicht mit lrdetail-Einträgen erkannt, aber nicht auflösbar (Zeilen bleiben Einheiten): ${toc.reason}` });
  else if (toc.units > 0) findings.push({ severity: 'info', code: 'toc-sections-demoted', message: `Inhaltsübersicht: ${toc.units} lrdetail-Einheit(en) als Text übernommen (keine Einheiten)` });

  for (const node of topLevel) {
    const name = node.tagName.toLowerCase();
    if (isIgnorable(node)) continue;
    const linesBefore = lines.length;
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
    // Word-Überschriften (<h2>Anlage</h2>) entsprechen zentrierten fetten Absätzen.
    const isHeadingElement = /^h[1-6]$/u.test(name);
    if (name !== 'p' && !isHeadingElement) {
      findings.push({ severity: 'error', code: 'unknown-block-element', message: `Unbekanntes Blockelement ${describeElement(node)} auf Dokumentebene: „${textOf(node).slice(0, 80)}“` });
      continue;
    }
    const classNames = classes(node).map((entry) => entry.toLowerCase());
    for (const className of classNames) {
      if (!isKnownParagraphClass(className)) findings.push({ severity: 'error', code: 'unknown-paragraph-class', message: `Unbekannte Absatzklasse „${className}“ (p.${className}): „${textOf(node).slice(0, 80)}“` });
    }
    const rawText = paragraphText(node, findings, `p.${classNames[0] ?? 'default'}`);
    if (!rawText) continue;

    if (classNames.includes(TOC_TITLE_CLASS)) {
      const marker = extractFootnoteMarkers(rawText.replace(/\n/gu, ' '));
      if (marker.text) lines.push({ kind: 'heading', text: marker.text, footnotes: marker.footnotes });
      continue;
    }

    if (hasClass(node, 'lrueberschrift')) {
      head.titleLines.push(...rawText.split('\n').map((line) => extractFootnoteMarkers(line).text).filter(Boolean));
      continue;
    }
    if (hasClass(node, 'lrdetail')) {
      const previous = lines[lines.length - 1];
      const context: { previousUnit?: UnitContext; previousTitle?: string } = {};
      if (previousUnit && !toc.region.has(node)) context.previousUnit = previousUnit;
      if (previous?.kind === 'unit' && previous.title) context.previousTitle = previous.title;
      const detail = classifyDetailHeading(rawText, context);
      const snippet = rawText.replace(/\s+/gu, ' ').slice(0, 80);
      switch (detail.kind) {
        case 'unit': {
          if (!toc.region.has(node)) {
            sawFirstUnit = true;
            previousUnit = { unitType: detail.unitType, label: detail.label };
          }
          if (detail.inferred) inferredMarkers.push(`„${snippet}“ → ${detail.label}`);
          const line: SourceLine = { kind: 'unit', unitType: detail.unitType, label: detail.label, footnotes: detail.footnotes };
          if (detail.title) line.title = detail.title;
          lines.push(line);
          break;
        }
        case 'unit-range': {
          if (detail.inferred) inferredMarkers.push(`„${snippet}“ → ${detail.label}`);
          const line: SourceLine = { kind: 'unit-range', unitType: detail.unitType, label: detail.label, footnotes: detail.footnotes };
          if (detail.title) line.title = detail.title;
          lines.push(line);
          break;
        }
        case 'division': {
          detailDivisions.push(detail.label);
          const line: SourceLine = { kind: 'division', level: detail.level, label: detail.label, footnotes: detail.footnotes };
          if (detail.title) line.title = detail.title;
          lines.push(line);
          break;
        }
        case 'annex': {
          const line: SourceLine = { kind: 'annex', label: detail.label, footnotes: detail.footnotes };
          if (detail.title) line.title = detail.title;
          lines.push(line);
          break;
        }
        case 'subparagraph':
          detailBodyTexts.push(snippet);
          lines.push({ kind: 'subparagraph', label: detail.label, text: detail.text, footnotes: detail.footnotes });
          break;
        case 'title-continuation': {
          // Nur erreichbar, wenn die vorangehende Zeile eine Einheit mit Titel ist (siehe `classifyDetailHeading`).
          const unitLine = previous as Extract<SourceLine, { kind: 'unit' }>;
          titleContinuations.push(`${unitLine.label}: „${detail.text.slice(0, 60)}“`);
          unitLine.title = `${unitLine.title ?? ''} ${detail.text}`.trim();
          unitLine.footnotes.push(...detail.footnotes);
          break;
        }
        case 'heading':
          detailHeadings.push(snippet);
          lines.push({ kind: 'heading', text: detail.text, footnotes: detail.footnotes });
          break;
        case 'footnotes-only':
          if (previous && 'footnotes' in previous) previous.footnotes.push(...detail.footnotes);
          break;
        case 'empty':
          break;
        default:
          findings.push({ severity: 'error', code: 'unparsed-unit-heading', message: `lrdetail ohne erkennbare Einheit (p.lrdetail nach ${previousUnit?.label ?? 'Dokumentanfang'}): „${snippet}“` });
          lines.push({ kind: 'heading', text: detail.text, footnotes: detail.footnotes });
          break;
      }
      if (toc.region.has(node)) for (let index = linesBefore; index < lines.length; index += 1) lines[index] = demoteToTocText(lines[index]!);
      continue;
    }
    if (hasClass(node, 'lrfundstelle')) {
      head.citationNote = rawText;
      continue;
    }

    const centered = isHeadingElement || centeredByWrapper.has(node) || isCentered(node);
    const bold = isHeadingElement || isBold(node);
    const flat = rawText.replace(/\n/gu, ' ');
    const { text, footnotes: footnoteLabels } = extractFootnoteMarkers(flat);
    if (!text) continue;

    if (centered) {
      const division = parseDivisionHeading(text);
      if (division && bold) {
        const line: SourceLine = { kind: 'division', level: division.level, label: division.label, footnotes: footnoteLabels };
        if (division.title) line.title = division.title;
        lines.push(line);
      } else {
        const annex = bold ? parseAnnexHeading(text) : null;
        // Nachstehend veröffentlichter Vertragstext eines Zustimmungsgesetzes: eigener Container mit
        // eigener Artikelzählung (nur nach Zustimmungsformel/Veröffentlichungsvermerk im Gesetzestext).
        const treaty = bold && sawFirstUnit ? parseTreatyHeading(text) : null;
        const previous = lines[lines.length - 1];
        if (annex && /^Anlage/u.test(text)) {
          const line: SourceLine = { kind: 'annex', label: annex.label, footnotes: footnoteLabels };
          if (annex.title) line.title = annex.title;
          lines.push(line);
        } else if (treaty && hasConsentEvidence(lines)) {
          const line: SourceLine = { kind: 'annex', label: treaty.label, footnotes: footnoteLabels };
          if (treaty.title) line.title = treaty.title;
          lines.push(line);
        } else if (bold && previous && previous.kind === 'division' && !previous.title) {
          // Zweite Zeile einer Gliederungsüberschrift („Mitgliedschaft und Beruf“ nach „Erster Teil“)
          previous.title = text;
          previous.footnotes.push(...footnoteLabels);
        } else if (bold && previous && previous.kind === 'annex' && !previous.title) {
          previous.title = text;
        } else if (/^(Die Landesregierung|Der Ministerpräsident|Die Ministerpräsidentin|Für die Landesregierung)/u.test(text) && sawFirstUnit) {
          lines.push({ kind: 'signature', text });
        } else {
          pushText(text, true, bold, footnoteLabels);
        }
      }
      if (toc.region.has(node)) for (let index = linesBefore; index < lines.length; index += 1) lines[index] = demoteToTocText(lines[index]!);
      continue;
    }

    const level = marginLevel(node, dirDepth.get(node) ?? 0);
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

  if (inferredMarkers.length > 0) findings.push({ severity: 'warning', code: 'unit-marker-inferred', message: `${inferredMarkers.length} lrdetail-Überschrift(en) ohne Einheitenzeichen; Zeichen aus der fortlaufenden Zählung hergeleitet: ${inferredMarkers.join('; ')}` });
  if (detailDivisions.length > 0) findings.push({ severity: 'info', code: 'division-in-detail-heading', message: `${detailDivisions.length} lrdetail-Überschrift(en) mit Gliederungskennzeichen als Gliederungsebene übernommen: ${detailDivisions.join(', ')}` });
  if (detailBodyTexts.length > 0) findings.push({ severity: 'warning', code: 'detail-body-text', message: `${detailBodyTexts.length} lrdetail-Absatz/-Absätze mit Absatztext „(n) …“ als Absatz übernommen: ${detailBodyTexts.map((entry) => `„${entry}“`).join('; ')}` });
  if (titleContinuations.length > 0) findings.push({ severity: 'warning', code: 'unit-title-continued', message: `${titleContinuations.length} lrdetail-Zeile(n) als Fortsetzung des Einheitentitels übernommen: ${titleContinuations.join('; ')}` });
  if (detailHeadings.length > 0) findings.push({ severity: 'warning', code: 'detail-heading', message: `${detailHeadings.length} lrdetail-Überschrift(en) ohne Einheitenkennzeichen als Überschrift übernommen: ${detailHeadings.map((entry) => `„${entry}“`).join('; ')}` });

  const { blocks, stats } = buildBody(lines, footnotes, findings);
  return { head, blocks, footnotes, findings, stats };
}
