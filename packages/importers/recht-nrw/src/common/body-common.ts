/**
 * Gemeinsame Bausteine beider Textparser: Gliederungserkennung, Absatz- und Listenkennzeichen,
 * Fußnotenmarken, Tabellen und der Aufbau des verschachtelten Normkörpers aus einer flachen
 * Folge von Zeilen. Fail-closed: Unbekanntes wird als Befund gemeldet, nie stillschweigend
 * verworfen.
 */
import type { NormBodyBlock, StructureType } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

/** Flache Zeile, wie sie ein Formatparser liefert; der Builder verschachtelt sie. */
export type SourceLine =
  | { kind: 'division'; level: DivisionLevel; label: string; title?: string; footnotes: string[] }
  | { kind: 'unit'; unitType: 'paragraph' | 'article'; label: string; title?: string; footnotes: string[] }
  /**
   * Spanne oder Aufzählung von Einheiten („Artikel I bis III“, „§§ 15 bis 16“): eine Überschrift auf
   * Einheitenebene (schließt die vorangehende Einheit), aber keine Einheit – die einzelnen Artikel
   * werden nicht erfunden (Änderungs-/Aufhebungsbereich in Mantel- und Anpassungsgesetzen).
   */
  | { kind: 'unit-range'; unitType: 'paragraph' | 'article'; label: string; title?: string; footnotes: string[] }
  | { kind: 'annex'; label: string; title?: string; footnotes: string[] }
  | { kind: 'subparagraph'; label: string; text: string; footnotes: string[] }
  | { kind: 'item'; label?: string; text: string; level: number; footnotes: string[] }
  | { kind: 'text'; text: string; centered: boolean; bold: boolean; footnotes: string[] }
  | { kind: 'heading'; text: string; footnotes: string[] }
  | { kind: 'table'; block: NormBodyBlock; footnotes: string[] }
  /** Fußnoten ohne Einheit (Vorspann, nummernlose Sektion): eigene Fußnotenblöcke, kein Fließtext. */
  | { kind: 'footnotes'; labels: string[] }
  /**
   * Schließt die offene Einheit (und ihre Absätze), ohne einen Block zu erzeugen: nachfolgende Zeilen gehören
   * zur umgebenden Ebene (Gliederung oder Dokument), z. B. der redaktionelle Hinweis des Portals nach der
   * letzten Einheit. Es entsteht kein Text und keine Einheit.
   */
  | { kind: 'close-unit' }
  | { kind: 'signature'; text: string };

export type DivisionLevel = 'book' | 'part' | 'chapter' | 'section' | 'subsection';

export interface SourceFootnote {
  label: string;
  text: string;
}

export interface ParsedBody {
  blocks: NormBodyBlock[];
  footnotes: SourceFootnote[];
  findings: ImportFinding[];
  /** Roh-Kennzahlen des Parsers (für die Textintegritätsprüfung). */
  stats: BodyStats;
}

export interface BodyStats {
  units: number;
  unitLabels: string[];
  tables: number;
  annexes: number;
  textLength: number;
  lines: number;
}

const DIVISION_RANK: Record<DivisionLevel, number> = { book: 1, part: 2, chapter: 3, section: 4, subsection: 5 };

const ORDINALS = '(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebt|Siebent|Acht|Neunt|Zehnt|Elft|Zwölft|Dreizehnt|Vierzehnt|Fünfzehnt|Sechzehnt|Siebzehnt|Achtzehnt|Neunzehnt|Zwanzigst|Einundzwanzigst|Zweiundzwanzigst)(?:e|er|es)';
const DIVISION_WORD = '(Buch|Teil|Kapitel|Abschnitt|Unterabschnitt|Titel)';
const DIVISION_PATTERNS = [
  new RegExp(`^${ORDINALS}\\s+${DIVISION_WORD}\\b(.*)$`, 'u'),
  new RegExp(`^(?:\\d+\\.|[IVXLC]+\\.?)\\s+${DIVISION_WORD}\\b(.*)$`, 'u'),
  new RegExp(`^${DIVISION_WORD}\\s+(?:\\d+|[IVXLC]+)[a-z]?\\b(.*)$`, 'u'),
];

const DIVISION_LEVELS: Record<string, DivisionLevel> = {
  Buch: 'book',
  Teil: 'part',
  Kapitel: 'chapter',
  Abschnitt: 'section',
  Unterabschnitt: 'subsection',
  Titel: 'subsection',
};

/** „Erster Teil“, „2. Abschnitt“, „Kapitel 3“, „Erster Abschnitt - Von den Grundrechten“ */
export function parseDivisionHeading(text: string): { level: DivisionLevel; label: string; title?: string } | null {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  for (const pattern of DIVISION_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (!match) continue;
    const word = match[1]!;
    const rest = (match[2] ?? '').trim();
    const level = DIVISION_LEVELS[word];
    if (!level) continue;
    const label = cleaned.slice(0, cleaned.length - rest.length).trim();
    const title = rest.replace(/^[\s:–—-]+/u, '').trim();
    return title ? { level, label, title } : { level, label };
  }
  return null;
}

const UNIT_PATTERN = /^(§{1,2}|Art\.|Artikel)\s*(\d+\s?[a-z]?)\b\s*(.*)$/u;
/**
 * Römisch nummerierte Artikel („Artikel I“, „Art. XLVIII“): nur die vollständige, wohlgeformte
 * Zahl ohne Zusatz. Spannen („Artikel I bis III“, „Artikel XXVIII und XXIX“) bleiben unerkannt,
 * weil ihre Zuordnung mehrdeutig ist (fail-closed).
 */
const ROMAN_ARTICLE_PATTERN = /^(Art\.|Artikel)\s+(?=[IVXLCDM])(M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))$/u;

export interface UnitHeadingOptions {
  /** Römische Artikelnummern zulassen – nur bei eindeutigem Markup (natives `field--field_num`). */
  romanArticles?: boolean;
}

/** „§ 5“, „§ 3a“, „Artikel 12“, „Art. 4“ → Einheit; Rest ist Überschrift. */
export function parseUnitHeading(text: string, options: UnitHeadingOptions = {}): { unitType: 'paragraph' | 'article'; label: string; title?: string } | null {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  const match = UNIT_PATTERN.exec(cleaned);
  if (!match) {
    if (!options.romanArticles) return null;
    const roman = ROMAN_ARTICLE_PATTERN.exec(cleaned);
    return roman ? { unitType: 'article', label: `${roman[1]} ${roman[2]}` } : null;
  }
  const marker = match[1]!;
  const number = match[2]!.replace(/\s+/gu, '');
  const unitType = marker.startsWith('§') ? 'paragraph' : 'article';
  const label = unitType === 'paragraph' ? `§ ${number}` : `${marker === 'Art.' ? 'Art.' : 'Artikel'} ${number}`;
  const title = match[3]!.replace(/^[\s:–—-]+/u, '').trim();
  return title ? { unitType, label, title } : { unitType, label };
}

/**
 * Spanne oder Aufzählung von Einheiten: „Artikel I bis III“, „Art. XXVIII und XXIX“, „§§ 15 bis 16“,
 * „§ 5 und 6“, „Artikel 3 bis 5“. Römische Zahlen werden hier nur formal geprüft (Buchstabenklasse),
 * weil keine Einheit entsteht – die Spanne bleibt eine Überschrift auf Einheitenebene.
 */
const UNIT_RANGE_PATTERN = /^(§{1,2}|Art\.|Artikel)\s*(\d+\s?[a-z]?|[IVXLCDM]+)\s+(bis|und|,)\s*(\d+\s?[a-z]?|[IVXLCDM]+)\b\s*(.*)$/u;

export function parseUnitRangeHeading(text: string): { unitType: 'paragraph' | 'article'; label: string; title?: string } | null {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  const match = UNIT_RANGE_PATTERN.exec(cleaned);
  if (!match) return null;
  const marker = match[1]!;
  const from = match[2]!.replace(/\s+/gu, '');
  const to = match[4]!.replace(/\s+/gu, '');
  const roman = (value: string): boolean => /^[IVXLCDM]+$/u.test(value);
  if (roman(from) !== roman(to)) return null;
  const connector = match[3] === ',' ? ', ' : ` ${match[3]} `;
  const unitType = marker.startsWith('§') ? 'paragraph' : 'article';
  const label = unitType === 'paragraph' ? `§§ ${from}${connector}${to}` : `${marker === 'Art.' ? 'Art.' : 'Artikel'} ${from}${connector}${to}`;
  const title = match[5]!.replace(/^[\s:–—-]+/u, '').trim();
  return title ? { unitType, label, title } : { unitType, label };
}

/**
 * Doppelt kodierte Entities im Portalmarkup („§&amp;nbsp;1“ wird als Text „§&nbsp;1“ ausgeliefert):
 * nur das beobachtete Muster `&nbsp;` wird als Leerzeichen gelesen; alles andere bleibt unverändert
 * und läuft in die Strukturerkennung (fail-closed).
 */
export function normalizeEntityArtifacts(text: string): { text: string; repaired: boolean } {
  const repaired = /&nbsp;/u.test(text);
  return { text: repaired ? text.replace(/&nbsp;/gu, ' ') : text, repaired };
}

interface UnitOrder { number: number; suffix: string }

function unitOrderOf(label: string): UnitOrder | null {
  const match = /(\d+)([a-z]?)$/u.exec(label.replace(/\s+/gu, ''));
  return match ? { number: Number.parseInt(match[1]!, 10), suffix: match[2] ?? '' } : null;
}

/** „§ 33d“ → „33e“ oder „§ 83“ → „84“ / „84a“: die Nummer setzt die Zählung unmittelbar fort. */
function continuesCount(previous: UnitOrder, next: UnitOrder): boolean {
  if (next.number === previous.number) return next.suffix.length === 1 && (previous.suffix === '' ? next.suffix === 'a' : next.suffix.charCodeAt(0) === previous.suffix.charCodeAt(0) + 1);
  return next.number === previous.number + 1 && next.suffix === '';
}

export interface InferredUnitHeading {
  kind: 'unit' | 'unit-range';
  unitType: 'paragraph' | 'article';
  label: string;
  title?: string;
}

/**
 * Legacy-Überschrift ohne Einheitenzeichen („84 (Fn 3)“ zwischen „§ 83“ und „§ 85“, „15 bis 16“ nach
 * „§ 14“, „33e“ nach „§ 33d“): das Zeichen wird ausschließlich aus der unmittelbar vorhergehenden
 * Einheit hergeleitet und nur, wenn die Nummer deren Zählung lückenlos fortsetzt. Alles andere bleibt
 * unerkannt (fail-closed). Die Herleitung ist als Befund zu protokollieren.
 */
export function inferUnitHeading(text: string, previous: { unitType: 'paragraph' | 'article'; label: string } | undefined): InferredUnitHeading | null {
  if (!previous) return null;
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  const previousOrder = unitOrderOf(previous.label);
  if (!previousOrder) return null;
  const marker = previous.unitType === 'paragraph' ? '§' : previous.label.startsWith('Art.') ? 'Art.' : 'Artikel';
  const range = /^(\d+[a-z]?)\s+(bis|und)\s+(\d+[a-z]?)\b\s*(.*)$/u.exec(cleaned);
  if (range) {
    const from = unitOrderOf(range[1]!);
    if (!from || !continuesCount(previousOrder, from)) return null;
    const parsed = parseUnitRangeHeading(`${marker === '§' ? '§§' : marker} ${range[1]} ${range[2]} ${range[3]} ${range[4] ?? ''}`);
    return parsed ? { kind: 'unit-range', ...parsed } : null;
  }
  const single = /^(\d+[a-z]?)\b\s*(.*)$/u.exec(cleaned);
  if (!single) return null;
  const next = unitOrderOf(single[1]!);
  if (!next || !continuesCount(previousOrder, next)) return null;
  // Eine folgende Zahl („84 2 Satz 1“) wäre kein Einheitenkennzeichen.
  if (/^\d/u.test(single[2] ?? '')) return null;
  const parsed = parseUnitHeading(`${marker} ${single[1]} ${single[2] ?? ''}`);
  return parsed ? { kind: 'unit', ...parsed } : null;
}

/** Zeile einer Inhaltsübersicht: Einheiten und Gliederungen werden zu schlichtem Text (kein Sprungziel, keine Einheit). */
export function demoteToTocText(line: SourceLine): SourceLine {
  switch (line.kind) {
    case 'division':
    case 'unit':
    case 'unit-range':
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

export function parseAnnexHeading(text: string): { label: string; title?: string } | null {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  const match = /^(Anlage(?:\s+\d+[a-z]?)?)(?:\s*(?:\(zu\s+[^)]+\)|zu\s+§\s*\S+.*?))?\s*[:–—-]?\s*(.*)$/u.exec(cleaned);
  if (!match) return null;
  const title = match[2]!.trim();
  return title ? { label: match[1]!, title } : { label: match[1]! };
}

/**
 * Überschrift eines im Zustimmungsgesetz nachstehend veröffentlichten Vertragstexts („Vertrag“,
 * „Abkommen zur Bereinigung …“, „Staatsvertrag über …“). Der Vertragstext hat eine eigene
 * Artikel-/§-Zählung und wird als Anlage-Container geführt (docs/LEGAL_SCOPE.md, Staatsverträge).
 * Nur in Verbindung mit einem Zustimmungsbeleg im vorangehenden Text (`hasConsentEvidence`).
 */
const TREATY_HEADING_PATTERN = /^(Vertrag|Staatsvertrag|Abkommen|Verwaltungsabkommen|Übereinkommen|Vereinbarung)(?:\s+(.*))?$/u;

export function parseTreatyHeading(text: string): { label: string; title?: string } | null {
  const cleaned = text.replace(/\s+/gu, ' ').trim();
  const match = TREATY_HEADING_PATTERN.exec(cleaned);
  if (!match) return null;
  const title = (match[2] ?? '').replace(/^[\s:–—-]+/u, '').trim();
  return title ? { label: match[1]!, title } : { label: match[1]! };
}

/** Zustimmungsformel oder Veröffentlichungsvermerk („… wird zugestimmt“, „wird nachstehend veröffentlicht“) in bereits gelesenen Zeilen. */
export function hasConsentEvidence(lines: readonly SourceLine[]): boolean {
  const pattern = /\bwird\s+(?:hiermit\s+)?zugestimmt\b|\b(?:wird|werden)\s+nachstehend\b[^.]{0,80}?\bveröffentlicht\b/u;
  return lines.some((line) => (line.kind === 'text' || line.kind === 'subparagraph' || line.kind === 'item') && pattern.test(line.text));
}

const SUBPARAGRAPH_PATTERN = /^\((\d+[a-z]?)\)\s*(.*)$/su;
const ITEM_PATTERNS: Array<{ pattern: RegExp; level: number }> = [
  { pattern: /^(\d{1,3}\.)\s+(.*)$/su, level: 0 },
  { pattern: /^([a-z]{1,2}\))\s+(.*)$/su, level: 1 },
  { pattern: /^([a-z]{2}\))\s+(.*)$/su, level: 2 },
  { pattern: /^(\d{1,2}\.\d{1,2}\.?)\s+(.*)$/su, level: 1 },
  { pattern: /^([–-])\s+(.*)$/su, level: 0 },
];

export function parseSubparagraph(text: string): { label: string; text: string } | null {
  const match = SUBPARAGRAPH_PATTERN.exec(text.trim());
  return match ? { label: `(${match[1]})`, text: match[2]!.trim() } : null;
}

export function parseItem(text: string): { label: string; text: string; level: number } | null {
  const cleaned = text.trim();
  for (const { pattern, level } of ITEM_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match) return { label: match[1]!, text: match[2]!.trim(), level };
  }
  return null;
}

/** Entfernt „(Fn 4)“, „(Fn 1, 2)“ und liefert die referenzierten Fußnotennummern. */
export function extractFootnoteMarkers(text: string): { text: string; footnotes: string[] } {
  const footnotes: string[] = [];
  const cleaned = text
    .replace(/\(\s*Fn\s*((?:\d+\s*,?\s*)+)\)/gu, (_match, numbers: string) => {
      for (const number of numbers.split(/\s*,\s*/u)) if (number.trim()) footnotes.push(number.trim());
      return ' ';
    })
    .replace(/\s+/gu, ' ')
    .trim();
  return { text: cleaned, footnotes };
}

export function tableBlock(rows: Array<Array<{ text: string; header: boolean; colspan?: number; rowspan?: number }>>, findings?: ImportFinding[]): NormBodyBlock {
  const table: NormBodyBlock = {
    type: 'table',
    children: rows.map((cells) => ({
      type: 'tableRow' as StructureType,
      children: cells.map((cell) => {
        const block: NormBodyBlock = { type: cell.header ? 'tableHeaderCell' : 'tableCell', text: cell.text };
        if (cell.header) block.scope = 'col';
        if (cell.colspan && cell.colspan > 1) block.colspan = cell.colspan;
        if (cell.rowspan && cell.rowspan > 1) block.rowspan = cell.rowspan;
        return block;
      }),
    })),
  };
  padShortTableRows(table, findings);
  return table;
}

/**
 * Zeilen mit weniger Zellen als die Tabelle Spalten hat (HTML lässt fehlende Zellen am Zeilenende
 * einfach leer) werden mit leeren Zellen aufgefüllt – das entspricht der Darstellung der Quelle
 * und verliert keinen Text. Rowspan/Colspan werden wie in der Schemaprüfung belegt.
 */
function padShortTableRows(table: NormBodyBlock, findings?: ImportFinding[]): void {
  const rows = table.children ?? [];
  const occupied: boolean[][] = [];
  rows.forEach((row, rowIndex) => {
    occupied[rowIndex] ??= [];
    let column = 0;
    for (const cell of row.children ?? []) {
      while (occupied[rowIndex]![column]) column += 1;
      for (let rowOffset = 0; rowOffset < (cell.rowspan ?? 1); rowOffset += 1) {
        occupied[rowIndex + rowOffset] ??= [];
        for (let columnOffset = 0; columnOffset < (cell.colspan ?? 1); columnOffset += 1) occupied[rowIndex + rowOffset]![column + columnOffset] = true;
      }
      column += cell.colspan ?? 1;
    }
  });
  const width = Math.max(0, ...occupied.map((row) => row.length));
  let padded = 0;
  rows.forEach((row, rowIndex) => {
    const missing = width - (occupied[rowIndex] ?? []).filter(Boolean).length;
    for (let index = 0; index < missing; index += 1) (row.children ??= []).push({ type: 'tableCell', text: '' });
    if (missing > 0) padded += 1;
  });
  if (padded > 0) findings?.push({ severity: 'info', code: 'table-row-padded', message: `${padded} Tabellenzeile(n) mit fehlenden Zellen am Zeilenende um leere Zellen ergänzt` });
}

/**
 * Baut aus flachen Zeilen den verschachtelten Normkörper: Gliederungen enthalten Einheiten,
 * Einheiten enthalten Absätze, Absätze enthalten Nummerierungen (nach Ebene verschachtelt).
 * Fußnotenreferenzen einer Einheit werden als `footnote`-Blöcke am Ende der Einheit
 * materialisiert (Text aus der Fußnotenliste), damit der Bezug nicht verloren geht.
 */
export function buildBody(lines: readonly SourceLine[], footnotes: readonly SourceFootnote[], findings: ImportFinding[]): { blocks: NormBodyBlock[]; stats: BodyStats } {
  const root: NormBodyBlock[] = [];
  const footnoteText = new Map(footnotes.map((footnote) => [footnote.label, footnote.text]));
  const stats: BodyStats = { units: 0, unitLabels: [], tables: 0, annexes: 0, textLength: 0, lines: lines.length };

  interface Frame { block: NormBodyBlock; rank: number; kind: 'division' | 'unit' | 'annex' | 'subparagraph' }
  const stack: Frame[] = [];
  let listStack: Array<{ block: NormBodyBlock; level: number }> = [];

  const container = (): NormBodyBlock[] => (stack.length > 0 ? (stack[stack.length - 1]!.block.children ??= []) : root);
  const popTo = (rank: number): void => {
    while (stack.length > 0 && stack[stack.length - 1]!.rank >= rank) stack.pop();
    listStack = [];
  };
  const attachFootnotes = (block: NormBodyBlock, labels: string[]): void => {
    for (const label of labels) {
      const text = footnoteText.get(label);
      if (!text) {
        findings.push({ severity: 'warning', code: 'dangling-footnote', message: `Fußnote ${label} wird referenziert, aber nicht gefunden` });
        continue;
      }
      (block.children ??= []).push({ type: 'footnote', label: `Fn ${label}`, text });
    }
  };
  const openUnit = (line: Extract<SourceLine, { kind: 'unit' }>): void => {
    // Artikel (Rang 9) sind Container für nachfolgende Paragraphen (Rang 10): in Mantel- und
    // Ausführungsgesetzen beginnt die §-Zählung je Artikel neu („Artikel 12 § 1“, „Artikel 15 § 1“).
    // Ein neuer Artikel schließt Paragraphen und Artikel, ein Paragraph nur Paragraphen.
    const rank = line.unitType === 'article' ? 9 : 10;
    popTo(rank);
    const block: NormBodyBlock = { type: line.unitType, label: line.label, children: [] };
    if (line.title) block.title = line.title;
    container().push(block);
    stack.push({ block, rank, kind: 'unit' });
    stats.units += 1;
    stats.unitLabels.push(line.label);
    attachFootnotes(block, line.footnotes);
  };
  const pushLeaf = (block: NormBodyBlock, footnoteLabels: string[]): void => {
    container().push(block);
    attachFootnotes(block, footnoteLabels);
  };
  const pushItem = (line: Extract<SourceLine, { kind: 'item' }>): void => {
    const block: NormBodyBlock = { type: line.level === 0 ? 'item' : 'subitem', text: line.text, level: line.level, children: [] };
    if (line.label) block.label = line.label;
    block.numberingStyle = line.label ? (/^\d+\./u.test(line.label) ? 'decimal' : /^[a-z]+\)/u.test(line.label) ? 'lower-alpha' : 'none') : 'none';
    while (listStack.length > 0 && listStack[listStack.length - 1]!.level >= line.level) listStack.pop();
    const parent = listStack[listStack.length - 1];
    if (parent) (parent.block.children ??= []).push(block);
    else container().push(block);
    listStack.push({ block, level: line.level });
    attachFootnotes(block, line.footnotes);
  };

  for (const line of lines) {
    if (line.kind !== 'item') listStack = [];
    switch (line.kind) {
      case 'division': {
        const rank = DIVISION_RANK[line.level];
        popTo(rank);
        const block: NormBodyBlock = { type: line.level, label: line.label, children: [] };
        if (line.title) block.title = line.title;
        container().push(block);
        stack.push({ block, rank, kind: 'division' });
        attachFootnotes(block, line.footnotes);
        break;
      }
      case 'annex': {
        popTo(1);
        const block: NormBodyBlock = { type: 'annex', label: line.label, children: [] };
        if (line.title) block.title = line.title;
        root.push(block);
        stack.push({ block, rank: 1, kind: 'annex' });
        stats.annexes += 1;
        attachFootnotes(block, line.footnotes);
        break;
      }
      case 'unit':
        openUnit(line);
        break;
      case 'unit-range': {
        // Überschrift auf Einheitenebene: schließt wie eine Einheit die vorangehende, öffnet aber keinen
        // Container (die Spanne hat keinen eigenen Normtext außer Fußnoten/Vermerken).
        popTo(line.unitType === 'article' ? 9 : 10);
        const block: NormBodyBlock = { type: 'heading', title: line.label };
        if (line.title) block.text = line.title;
        stats.textLength += line.label.length + (line.title?.length ?? 0);
        pushLeaf(block, line.footnotes);
        break;
      }
      case 'footnotes': {
        for (const label of line.labels) {
          const text = footnoteText.get(label);
          if (!text) {
            findings.push({ severity: 'warning', code: 'dangling-footnote', message: `Fußnote ${label} wird referenziert, aber nicht gefunden` });
            continue;
          }
          container().push({ type: 'footnote', label: `Fn ${label}`, text });
        }
        break;
      }
      case 'subparagraph': {
        popTo(20);
        const block: NormBodyBlock = { type: 'subparagraph', label: line.label, text: line.text, children: [] };
        container().push(block);
        stack.push({ block, rank: 20, kind: 'subparagraph' });
        stats.textLength += line.text.length;
        attachFootnotes(block, line.footnotes);
        break;
      }
      case 'item':
        pushItem(line);
        stats.textLength += line.text.length;
        break;
      case 'text': {
        stats.textLength += line.text.length;
        if (line.bold && line.centered) pushLeaf({ type: 'heading', title: line.text }, line.footnotes);
        else pushLeaf({ type: 'paragraphText', text: line.text }, line.footnotes);
        break;
      }
      case 'heading':
        // Freistehende Überschrift: schließt Absatz und Einheit (bleibt in Artikel/Gliederung/Anlage).
        popTo(10);
        stats.textLength += line.text.length;
        pushLeaf({ type: 'heading', title: line.text }, line.footnotes);
        break;
      case 'table':
        stats.tables += 1;
        stats.textLength += JSON.stringify(line.block).length / 4;
        pushLeaf(line.block, line.footnotes);
        break;
      case 'close-unit':
        popTo(10);
        break;
      case 'signature':
        popTo(1);
        root.push({ type: 'signature', text: line.text });
        break;
      default:
        break;
    }
  }

  // Einheiten ohne Kinder wären für den Normkörper unzulässig (children Pflicht) – ein leeres
  // Array ist gültig; Divisionen ohne Inhalt bleiben ebenfalls gültig.
  stats.textLength = Math.round(stats.textLength);
  return { blocks: root, stats };
}

/** Sichtbarer Textumfang eines Normkörpers (für Integritätsvergleiche). */
export function bodyTextLength(blocks: readonly NormBodyBlock[]): number {
  let total = 0;
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if (block.type === 'footnote') continue;
      if (block.label) total += block.label.length + 1;
      if (block.title) total += block.title.length + 1;
      if (block.text) total += block.text.length + 1;
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return total;
}
