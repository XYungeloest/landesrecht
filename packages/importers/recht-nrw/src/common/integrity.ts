/**
 * Textintegritätsprüfung in zwei Stufen:
 *  1. Fetch → Parse: Kennzahlen aus dem rohen HTML (Anzahl §/Artikel-Überschriften, Tabellen,
 *     grober Textumfang) gegen den geparsten Quellzustand.
 *  2. Source-Normalized → Canonical: Einheiten, Blöcke, Tabellen, Anlagen und Textumfang müssen
 *     nach der Transformation gleich bleiben (Text darf sich nur durch die protokollierten
 *     Ersetzungen ändern).
 * Doppelte Einheitenkennzeichen werden in beiden Stufen gemeldet.
 */
import { countBlockTypes } from '@landesrecht/legal-core/lib/body.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { bodyTextLength, extractFootnoteMarkers, normalizeEntityArtifacts } from './body-common.ts';
import { parseHtml, allByClass, byClass, findFirst, textOf, allByTag, attr, classes, hasClass, isLayoutTable, type HtmlElement } from './html.ts';
import { countLegacyUnitHeadings } from './legacy-parser.ts';
import { classifyInlineArticleLines, detectInlineArticleScopes, detectTocSections, isBoldParagraph } from './native-parser.ts';

export interface IntegrityCheck {
  name: string;
  expected: number | string;
  actual: number | string;
  ok: boolean;
  message?: string;
}

export interface IntegrityReport {
  stage: 'fetch-parse' | 'source-canonical';
  ok: boolean;
  checks: IntegrityCheck[];
}

export interface BodyMetrics {
  units: number;
  unitLabels: string[];
  duplicateLabels: string[];
  blocks: number;
  tables: number;
  annexes: number;
  footnotes: number;
  textLength: number;
  fingerprint: string;
}

/**
 * Kennzahlen des Normkörpers. Doppelte Einheitenkennzeichen werden je Zählbereich geprüft: ein
 * Artikel (Mantelgesetz: „Artikel 12 § 1“, „Artikel 15 § 1“) und eine Anlage (eigene §-/Artikel-
 * zählung, nachstehend veröffentlichter Vertragstext) bilden jeweils einen eigenen Bereich;
 * Gliederungen (Teil, Abschnitt …) nicht. Innerhalb eines Bereichs bleibt jedes Duplikat ein Fehler.
 */
export function bodyMetrics(blocks: readonly NormBodyBlock[]): BodyMetrics {
  const counts = countBlockTypes(blocks);
  const labels: string[] = [];
  const scopedLabels: string[] = [];
  const visit = (entries: readonly NormBodyBlock[], quoted: boolean, scope: string): void => {
    for (const block of entries) {
      if (!quoted && (block.type === 'paragraph' || block.type === 'article') && block.label) {
        labels.push(block.label);
        scopedLabels.push(scope ? `${block.label} (in ${scope})` : block.label);
      }
      if (!block.children) continue;
      const opensScope = block.type === 'article' || block.type === 'annex';
      const childScope = opensScope ? [scope, block.label ?? block.title ?? block.type].filter(Boolean).join(' › ') : scope;
      visit(block.children, quoted || block.type === 'quotedProvision', childScope);
    }
  };
  visit(blocks, false, '');
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const label of scopedLabels) {
    if (seen.has(label)) duplicates.add(label);
    seen.add(label);
  }
  return {
    units: labels.length,
    unitLabels: labels,
    duplicateLabels: [...duplicates],
    blocks: Object.values(counts).reduce((sum, value) => sum + value, 0),
    tables: counts.table ?? 0,
    annexes: counts.annex ?? 0,
    footnotes: counts.footnote ?? 0,
    textLength: bodyTextLength(blocks),
    fingerprint: fingerprintText(blocks),
  };
}

/** Grober Fingerabdruck der Wortfolge (FNV-1a über den normalisierten Text). */
export function fingerprintText(blocks: readonly NormBodyBlock[]): string {
  let hash = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if (block.type === 'footnote') continue;
      if (block.label) feed(block.label);
      if (block.title) feed(block.title);
      if (block.text) feed(block.text.replace(/\s+/gu, ' '));
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return hash.toString(16).padStart(8, '0');
}

export interface RawMetrics {
  units: number;
  tables: number;
  textLength: number;
}

/**
 * Nummernfeld des nativen Formats, das der Parser als Einheit zählt: „§ 5“, „Artikel 12“ oder
 * ein einzelner wohlgeformter römischer Artikel („Artikel I“, ggf. mit Fußnotenmarke). Spannen
 * („Artikel I bis III“) und Gliederungen („1. Abschnitt“) zählen wie im Parser nicht; doppelt
 * kodierte Entities („§&nbsp;1“) werden wie im Parser als Leerzeichen gelesen.
 */
const ROMAN_ARTICLE_NUMBER = /^(?:Art\.|Artikel)\s+(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u;
function isNativeUnitNumber(raw: string): boolean {
  const text = normalizeEntityArtifacts(raw).text;
  if (/^(§{1,2}|Art\.|Artikel)\s*\d/u.test(text)) return true;
  return ROMAN_ARTICLE_NUMBER.test(text.replace(/\(\s*Fn[^)]*\)/gu, ' ').replace(/\s+/gu, ' ').trim());
}

/** Kennzahlen direkt aus dem rohen HTML, unabhängig vom Parser. */
export function rawMetrics(format: 'legacy-file' | 'native', html: string): RawMetrics {
  const document = parseHtml(html);
  if (format === 'legacy-file') {
    // Einheiten über dieselbe Klassifikationskette wie der Parser (hergeleitete Zeichen, Inhaltsübersicht).
    const units = countLegacyUnitHeadings(html);
    // Fußnotenanker sind uneinheitlich geschrieben („FN1“, „Fn2“); einzeilige Hülltabellen löst der Parser auf.
    const isFootnoteTable = (table: HtmlElement): boolean => Boolean(findFirst(table, (element) => element.tagName === 'a' && /^FN\d+/iu.test(attr(element, 'name') ?? '')));
    const tables = allByTag(document, 'table').filter((table) => !isFootnoteTable(table) && !isLayoutTable(table));
    // Kopftabelle mit Gliederungsnummer (vor dem Dokument) nicht mitzählen.
    const bodyTables = tables.filter((table) => !classes(table).length ? textOf(table).length > 12 : true);
    const body = findFirst(document, (element) => element.tagName === 'body');
    const visible = textOf(body);
    const footnoteTables = allByTag(document, 'table').filter(isFootnoteTable);
    const footnoteText = footnoteTables.map((table) => textOf(table)).join(' ');
    return { units, tables: bodyTables.length, textLength: Math.max(0, visible.length - footnoteText.length) };
  }
  // Eine als Einheitensektionen angelegte Inhaltsübersicht liest der Parser als Text; ihre
  // Nummernfelder werden hier mit derselben Strukturregel ausgenommen (keine Parserheuristik).
  const tocSections = detectTocSections(document).sections;
  const tocNums = new Set([...tocSections].map((section) => byClass(section, 'field--field_num')).filter((element): element is HtmlElement => Boolean(element)));
  const nums = allByClass(document, 'field--field_num').filter((element) => !tocNums.has(element) && isNativeUnitNumber(textOf(element)));
  const texts = allByClass(document, 'field--field_text').filter((element) => !findFirst(element, (child) => classes(child).includes('field--field_text')));
  // Der Parser liest Tabellen aus allen Textfeldern (Vorspann mit Inhaltsübersicht, Einheiten,
  // Schlussformel) und löst einzeilige Hülltabellen auf – gezählt wird exakt dasselbe.
  const tables = texts.flatMap((element) => allByTag(element, 'table')).filter((table) => !isLayoutTable(table));
  const textLength = texts.reduce((sum, element) => sum + textOf(element).length, 0);
  // Artikel als zentrierte Überschriften mit neu beginnender §-Zählung: dieselbe dokumentweite
  // Entscheidung und dieselbe Zeilenklassifikation wie im Parser.
  let inlineArticles = 0;
  if (detectInlineArticleScopes(document)) {
    const tocTexts = new Set([...tocSections].map((section) => byClass(section, 'field--field_text')).filter((element): element is HtmlElement => Boolean(element)));
    for (const field of texts) {
      if (tocTexts.has(field)) continue;
      // Absätze in echten Tabellen liest der Parser als Zellen, nicht als Überschriften.
      const inTable = new Set(allByTag(field, 'table').filter((table) => !isLayoutTable(table)).flatMap((table) => allByTag(table, 'p')));
      for (const paragraph of allByTag(field, 'p')) {
        if (inTable.has(paragraph) || !hasClass(paragraph, 'text-align-center') || !isBoldParagraph(paragraph)) continue;
        const lines = classifyInlineArticleLines(textOf(paragraph, { breaks: true }));
        if (lines) inlineArticles += lines.filter((line) => line.kind === 'unit').length;
      }
    }
  }
  return { units: nums.length + inlineArticles, tables: tables.length, textLength };
}

/** Zeichenumfang, den die protokollierten Ersetzungen im Normkörper erklären (`body[…]`-Pfade). */
export function explainedBodyDelta(changes: ReadonlyArray<{ path: string; from: string; to: string }>): number {
  return changes.filter((change) => change.path.startsWith('body')).reduce((sum, change) => sum + change.to.length - change.from.length, 0);
}

const TEXT_TOLERANCE = 0.12;

/** Absoluter Spielraum für Gliederungszeichen und Überschriften, die der Parser zusätzlich zählt. */
const TEXT_SLACK_CHARS = 200;

export function checkParseIntegrity(raw: RawMetrics, parsed: BodyMetrics): IntegrityReport {
  const checks: IntegrityCheck[] = [];
  checks.push({ name: 'units', expected: raw.units, actual: parsed.units, ok: raw.units === parsed.units, message: raw.units === parsed.units ? undefined : 'Anzahl der §/Artikel-Überschriften weicht vom Roh-HTML ab' });
  const tablesOk = parsed.tables === raw.tables;
  checks.push({ name: 'tables', expected: raw.tables, actual: parsed.tables, ok: tablesOk, message: tablesOk ? undefined : 'Tabellen fehlen oder wurden zusätzlich erzeugt' });
  const ratio = raw.textLength === 0 ? 1 : parsed.textLength / raw.textLength;
  const lower = raw.textLength * (1 - TEXT_TOLERANCE) - TEXT_SLACK_CHARS;
  const upper = raw.textLength * (1 + TEXT_TOLERANCE * 2) + TEXT_SLACK_CHARS;
  const textOk = parsed.textLength >= lower && parsed.textLength <= upper;
  checks.push({ name: 'textLength', expected: raw.textLength, actual: parsed.textLength, ok: textOk, message: textOk ? undefined : `Textumfang weicht um ${Math.round((ratio - 1) * 100)} % vom Roh-HTML ab` });
  checks.push({ name: 'duplicateUnits', expected: 0, actual: parsed.duplicateLabels.length, ok: parsed.duplicateLabels.length === 0, message: parsed.duplicateLabels.length ? `Doppelte Einheiten: ${parsed.duplicateLabels.join(', ')}` : undefined });
  return { stage: 'fetch-parse', ok: checks.every((check) => check.ok), checks };
}

/**
 * Source-Normalized → Canonical. `explainedDelta` ist der Zeichenumfang, den die protokollierten
 * Ersetzungen im Normkörper erklären (`explainedBodyDelta`): stimmt der kanonische Umfang exakt mit
 * Quelle + Delta überein, ist die Abweichung vollständig belegt – unabhängig davon, wie klein die Norm
 * ist (bei kurzen Normen überschreiten wenige Ersetzungen die relative Toleranz).
 */
export function checkTransformIntegrity(source: BodyMetrics, canonical: BodyMetrics, explainedDelta?: number): IntegrityReport {
  const checks: IntegrityCheck[] = [];
  const same = (name: string, expected: number, actual: number, message: string): void => {
    checks.push({ name, expected, actual, ok: expected === actual, message: expected === actual ? undefined : message });
  };
  same('units', source.units, canonical.units, 'Anzahl der Einheiten hat sich durch die Transformation verändert');
  same('blocks', source.blocks, canonical.blocks, 'Anzahl der Blöcke hat sich verändert');
  same('tables', source.tables, canonical.tables, 'Tabellen sind verloren gegangen');
  same('annexes', source.annexes, canonical.annexes, 'Anlagen sind verloren gegangen');
  same('footnotes', source.footnotes, canonical.footnotes, 'Fußnotenblöcke sind verloren gegangen');
  const labelsOk = source.unitLabels.join('\0') === canonical.unitLabels.join('\0');
  checks.push({ name: 'unitLabels', expected: source.unitLabels.length, actual: canonical.unitLabels.length, ok: labelsOk, message: labelsOk ? undefined : 'Reihenfolge oder Kennzeichen der Einheiten weichen ab' });
  const ratio = source.textLength === 0 ? 1 : canonical.textLength / source.textLength;
  const explained = explainedDelta !== undefined && canonical.textLength === source.textLength + explainedDelta;
  const textOk = explained || (ratio >= 0.97 && ratio <= 1.03);
  checks.push({ name: 'textLength', expected: source.textLength, actual: canonical.textLength, ok: textOk, message: textOk ? undefined : `Textumfang weicht um ${Math.round((ratio - 1) * 100)} % ab${explainedDelta !== undefined ? ` (protokollierte Ersetzungen erklären ${explainedDelta >= 0 ? '+' : ''}${explainedDelta} Zeichen)` : ''}` });
  checks.push({ name: 'duplicateUnits', expected: 0, actual: canonical.duplicateLabels.length, ok: canonical.duplicateLabels.length === 0 });
  return { stage: 'source-canonical', ok: checks.every((check) => check.ok), checks };
}
