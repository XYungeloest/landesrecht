/**
 * Textintegrität: sichtbarer Quelltext gegen kanonischen Text.
 *
 * Die Frage ist nicht, ob zwei Zeichenketten gleich sind – das sind sie nie –, sondern ob beim Weg
 * durch den Parser **Text verloren gegangen ist**. Erlaubt sind deshalb Leerraum, Entitäten,
 * typografische Normalisierung (Anführungszeichen, Gedankenstriche, Unicode-Hochzahlen) und
 * strukturelle Neuzusammensetzung: Ein Satz, der im Export aus `<p>`, `<sup>` und `<verweis.norm>`
 * besteht und im Zielmodell ein Block ist, ist derselbe Satz. Nicht erlaubt sind verlorene Sätze,
 * Tabellen, Fußnoten und Anlageninhalte – und keine Verdopplung.
 *
 * Verglichen wird deshalb die **Wortmenge** (Multimenge inhaltstragender Wörter), nicht die
 * Reihenfolge: Nur so ist eine Neuzusammensetzung ohne Verlust von einem Verlust zu unterscheiden.
 * Zusätzlich wird abschnittsweise geprüft, ob ein ganzer Quellabschnitt fehlt; das ist der Beleg,
 * den ein Befund braucht, um eine Arbeitsanweisung zu sein.
 *
 * Was verglichen wird (und was nicht):
 *
 *   `byrecht-norm`  Quelle: `<rumpf>`, alle `<annex>` und `<titelangaben>` (der Parser führt deren
 *                   erste Zeile als Titel, die weiteren als Überschriftenblock).
 *                   Kanonisch: Titel + Normkörper + Änderungsverlauf + Vollzitat.
 *   `byrecht-vv`    Quelle: `<vv1.0><rumpf>`. Kanonisch: Normkörper + Vollzitat.
 *                   Titel und Fundstellen stehen in `<metadaten>`, nicht im Rumpf – sie sind
 *                   Metadaten, kein Normtext, und stehen deshalb auf beiden Seiten außen vor.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { BayernRechtDialect } from '../parse/flow.ts';
import { childElements, elementChildren, isElement, type XmlElement, type XmlNode } from '../parse/xml.ts';
import type { TextIntegrityClass, TextIntegrityResult } from './model.ts';
import { excerptOf } from './signature.ts';

/**
 * Inline-Elemente: Sie unterbrechen keinen Textabschnitt. Ein Satz mit `<sup>`, `<verweis.norm>`
 * oder `<br/>` bleibt **ein** Abschnitt – sonst zerfiele jeder Satz in Bruchstücke und die
 * abschnittsweise Verlustprüfung meldete Unsinn.
 */
const INLINE_ELEMENTS: readonly string[] = [
  'br', 'sup', 'sub', 'span', 'symbol', 'a', 'graphic',
  'verweis.norm', 'v.norm', 'v.abk', 'fn.call', 'fn.text',
  'satz.nr', 'kurzbezeichnung', 'amtlicheAbk', 'b', 'i', 'u', 'em', 'strong',
];
// `fn.def` steht bewusst **nicht** in dieser Liste: Der Fußnotentext ist ein eigener Abschnitt (und im
// Zielmodell ein eigener Block). Nur getrennt erfasst lässt sich belegen, dass er fehlt – als
// Bestandteil des Aufrufsatzes ginge sein Verlust in dessen Wortmenge unter.

/** Typografische Normalisierung: unterschiedliche Schreibung desselben Zeichens wird ein Zeichen. */
export function normalizeTypography(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[­​‌‍﻿]/gu, '')
    .replace(/[      \t\r\n]/gu, ' ')
    .replace(/[„“”»«‟„“]/gu, '"')
    .replace(/[‚‘’‹›]/gu, "'")
    .replace(/[–—‐‑‒−]/gu, '-')
    .replace(/…/gu, '...')
    // Unicode-Hochzahlen werden gewöhnliche Ziffern: Der Parser schreibt Satznummern und
    // Hochstellungen als Hochzahl („¹Die Abmarkung“, „m³“), der Export als eigenes Element.
    // Die Ziffernfolge bleibt dabei eine Zahl – „¹⁰“ ist die Satznummer 10, nicht 1 und 0.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, (run) => [...run].map((character) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(character)).join(''))
    .replace(/[⁺⁻⁼⁽⁾ⁿⁱ]/gu, (character) => '+-=()ni'.charAt('⁺⁻⁼⁽⁾ⁿⁱ'.indexOf(character)))
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Inhaltstragende Wörter eines Textes.
 *
 * Gezählt werden Folgen aus Buchstaben und Ziffern; Zeichensetzung und Leerraum trennen nur. An der
 * Grenze zwischen Buchstabe und Ziffer wird zusätzlich getrennt („BayEUG)1“ → „BayEUG“, „1“). Das
 * ist kein Schönheitsschritt, sondern die Voraussetzung der Vergleichbarkeit: Der Parser klebt
 * Fußnotenzeichen und Satznummern an das Nachbarwort („…FGO1“, „¹Die“), im Export stehen sie als
 * eigenes Element. Die Trennung wird auf **beide** Seiten gleich angewandt; verglichen wird dadurch
 * die Wortfolge, nicht die Typografie.
 */
export function contentTokens(value: string, options: { fold?: boolean } = {}): string[] {
  const text = options.fold === false ? value.normalize('NFC').replace(/\s+/gu, ' ').trim() : normalizeTypography(value);
  const tokens: string[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    for (const part of match[0].split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u)) if (part !== '') tokens.push(part);
  }
  return tokens;
}

function countTokens(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/** Ein Textabschnitt der Quelle: der kleinste Zusammenhang, dessen Verlust sich belegen lässt. */
export interface SourceSegment {
  /** Elementkette von der Wurzel des Quelltextes bis zum Abschnitt – die Position des Befundes. */
  path: string[];
  text: string;
}

/** Elementkette als Pfad, auf die letzten Stufen gekürzt: `<titelangaben → fn.def → p>`. */
export function segmentPath(path: readonly string[]): string {
  return `<${path.slice(-4).join(' → ')}>`;
}

/**
 * Sichtbarer Quelltext, abschnittsweise. Ein Element, dessen Kinder alle Inline-Elemente sind, ist
 * ein Abschnitt; sonst wird abgestiegen und freistehender Text wird ein eigener Abschnitt.
 */
export function sourceSegments(element: XmlElement): SourceSegment[] {
  const segments: SourceSegment[] = [];
  const walk = (node: XmlElement, path: string[]): void => {
    const here = [...path, node.name];
    const children = elementChildren(node);
    if (children.every((child) => INLINE_ELEMENTS.includes(child.name))) {
      const text = elementText(node);
      if (text.trim() !== '') segments.push({ path: here, text });
      return;
    }
    let pending = '';
    for (const child of node.children) {
      if (!isElement(child)) {
        pending += child.value;
        continue;
      }
      if (INLINE_ELEMENTS.includes(child.name)) {
        pending += elementText(child);
        continue;
      }
      if (pending.trim() !== '') segments.push({ path: here, text: pending });
      pending = '';
      walk(child, here);
    }
    if (pending.trim() !== '') segments.push({ path: here, text: pending });
  };
  walk(element, []);
  return segments;
}

/**
 * Aller Text eines Teilbaums (Attribute zählen nicht: sie sind keine sichtbare Textstelle).
 *
 * Getrennt wird genau dort, wo auch der Parser trennt: an der Grenze eines Blockelements. Innerhalb
 * eines Textlaufs wird **roh** aneinandergehängt, denn der Parser tut dasselbe – stünde hier ein
 * Leerzeichen, zerfiele „Stundentafel<span>Technikerschule</span>“ auf der Quellseite in zwei Wörter
 * und auf der Zielseite in eines. `<br/>` trennt: Es wird im Zielmodell zum Zeilenumbruch.
 */
export function elementText(node: XmlNode): string {
  if (!isElement(node)) return node.value;
  if (node.name === 'br') return ' ';
  let text = '';
  for (const child of node.children) {
    text += isElement(child) && !INLINE_ELEMENTS.includes(child.name) ? ` ${elementText(child)} ` : elementText(child);
  }
  return text;
}

/**
 * Wiederholungen der Quelle, die der kanonische Text einmal führt.
 *
 * `<annex.nummer>` steht je Anlage doppelt im Export – einmal als Kurzform („Anlage 1“), einmal als
 * Langform („Anlage 1 (zu § 7 Abs. 1)“); sind beide gleich, führt der Zielkörper sie einmal. Das ist
 * eine Wiederholung **der Quelle**, kein Textverlust, und wird deshalb als Erklärung abgezogen
 * statt als Fehlbefund gemeldet.
 */
export function repeatedSourceText(root: XmlElement): string[] {
  const repeated: string[] = [];
  const walk = (element: XmlElement): void => {
    if (element.name === 'annex.koerper') {
      const seen = new Set<string>();
      for (const number of childElements(element, 'annex.nummer')) {
        const text = normalizeTypography(elementText(number));
        if (text === '') continue;
        if (seen.has(text)) repeated.push(text);
        else seen.add(text);
      }
    }
    for (const child of elementChildren(element)) walk(child);
  };
  walk(root);
  return repeated;
}

/** Die Teilbäume, die den sichtbaren Quelltext tragen – je DTD verschieden. */
export function bodyElements(root: XmlElement, dialect: BayernRechtDialect): XmlElement[] {
  if (dialect === 'byrecht-norm') {
    const parts: XmlElement[] = [];
    const head = childElements(root, 'kopf')[0];
    const versioned = head ? childElements(head, 'angaben.versabh')[0] : undefined;
    const titles = versioned ? childElements(versioned, 'titelangaben')[0] : undefined;
    if (titles) parts.push(titles);
    parts.push(...childElements(root, 'rumpf'), ...childElements(root, 'annex'));
    return parts;
  }
  const textData = childElements(root, 'textdaten')[0];
  const vv = textData ? childElements(textData, 'vv1.0')[0] : undefined;
  return vv ? childElements(vv, 'rumpf') : [];
}

/**
 * Aufrufzeichen der übernommenen Fußnoten.
 *
 * Das Zielmodell führt das Aufrufzeichen zweimal: einmal im laufenden Text an der Aufrufstelle
 * („… FGO¹“) und einmal als Beschriftung des Fußnotenblocks. Die Quelle nennt es einmal
 * (`<fn.text>`). Das ist die Darstellungsform der Fußnote, keine Verdopplung von Normtext.
 *
 * Nicht mitgezählt werden Fußnoten, die gar nicht erst zu einem Block werden: solche ohne
 * Fußnotentext und solche in `<titelangaben>` – dort verwirft der Parser den Fußnotenblock, und
 * genau das ist ein Befund, der nicht wegerklärt werden darf.
 */
export function transferredFootnoteMarkers(root: XmlElement, dialect: BayernRechtDialect): string[] {
  const markers: string[] = [];
  // Auch Fußnoten in <titelangaben>: Der Parser führt sie samt Label im Körper (titleFootnotes).
  const walk = (node: XmlElement): void => {
    if (node.name === 'fn.call') {
      const marker = elementText(childElements(node, 'fn.text')[0] ?? { kind: 'text', value: '' }).trim();
      const definition = childElements(node, 'fn.def')[0];
      if (marker !== '' && definition && elementText(definition).trim() !== '') markers.push(marker);
      return;
    }
    for (const child of elementChildren(node)) walk(child);
  };
  for (const element of bodyElements(root, dialect)) walk(element);
  return markers;
}

/** Aller Text eines Normkörpers: Beschriftung, Überschrift und Text jedes Blocks, rekursiv. */
export function blockText(blocks: readonly NormBodyBlock[]): string {
  let text = '';
  const walk = (block: NormBodyBlock): void => {
    for (const value of [block.label, block.title, block.text]) if (value) text += `${value} `;
    for (const child of block.children ?? []) walk(child);
  };
  for (const block of blocks) walk(block);
  return text;
}

export interface IntegrityInput {
  dialect: BayernRechtDialect;
  root: XmlElement;
  /** Kanonische Textbestandteile des geparsten Dokuments (Titel, Körper, Änderungsverlauf, Zitat). */
  canonicalParts: readonly (string | undefined)[];
  /**
   * Benannte Erklärungen für zulässige Unterschiede, als Paare aus Grund und Text. Der Text wird von
   * der Differenz abgezogen; bleibt danach nichts übrig, ist der Unterschied erklärt.
   */
  explained?: ReadonlyArray<{ reason: string; text: string }>;
}

/**
 * Höchstzahl unerklärter Wörter, die noch als Einzelbefund (`review`) durchgehen. Darüber ist es
 * kein Ausreißer mehr, sondern ein Muster – und damit ein Importhindernis.
 */
export const REVIEW_TOKEN_LIMIT = 3;

/**
 * Ein Quellabschnitt gilt als verloren, wenn er mindestens so viele Wörter trägt und fast alle von
 * ihnen im kanonischen Text fehlen. Kürzere Abschnitte bleiben außen vor: Ein Abschnitt aus einem
 * einzigen „1.“ ist kein Beleg für einen verlorenen Satz, sondern eine Gliederungsmarke, die
 * anderswo im Text aufgeht. „Fast alle“ statt „alle“, weil ein verlorener Satz seine Allerweltswörter
 * („der“, „vom“, „7“) an anderer Stelle des Dokuments wiederfindet – die Wortmenge ist dort gedeckt,
 * der Satz gleichwohl fort.
 */
const LOST_SEGMENT_TOKENS = 4;
const LOST_SEGMENT_SHARE = 0.8;

export function compareTextIntegrity(input: IntegrityInput): TextIntegrityResult {
  const segments = bodyElements(input.root, input.dialect).flatMap((element) => sourceSegments(element));
  const sourceText = segments.map((segment) => segment.text).join(' ');
  const canonicalText = input.canonicalParts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');

  const sourceTokens = contentTokens(sourceText);
  const canonicalTokens = contentTokens(canonicalText);
  const base: TextIntegrityResult = {
    class: 'exact',
    sourceTokens: sourceTokens.length,
    canonicalTokens: canonicalTokens.length,
    missing: 0,
    extra: 0,
    explanations: [],
  };

  // `exact`: dieselbe Wortfolge, ohne dass typografisch normalisiert werden musste.
  const plainSource = contentTokens(sourceText, { fold: false });
  const plainCanonical = contentTokens(canonicalText, { fold: false });
  if (plainSource.length === plainCanonical.length && plainSource.every((token, index) => token === plainCanonical[index])) return base;

  const sourceCounts = countTokens(sourceTokens);
  const canonicalCounts = countTokens(canonicalTokens);
  const missing = new Map<string, number>();
  const extra = new Map<string, number>();
  for (const [token, count] of sourceCounts) {
    const difference = count - (canonicalCounts.get(token) ?? 0);
    if (difference > 0) missing.set(token, difference);
  }
  for (const [token, count] of canonicalCounts) {
    const difference = count - (sourceCounts.get(token) ?? 0);
    if (difference > 0) extra.set(token, difference);
  }
  if (missing.size === 0 && extra.size === 0) return { ...base, class: 'normalized-equivalent' };

  // Benannte Erklärungen abziehen: Was eine Erklärung deckt, ist kein Unterschied mehr.
  const explanations: string[] = [];
  for (const explanation of input.explained ?? []) {
    let used = false;
    for (const token of contentTokens(explanation.text)) {
      if (subtract(missing, token) || subtract(extra, token)) used = true;
    }
    if (used) explanations.push(explanation.reason);
  }

  const missingTotal = total(missing);
  const extraTotal = total(extra);
  const result: TextIntegrityResult = {
    ...base,
    class: 'explained-difference',
    missing: missingTotal,
    extra: extraTotal,
    explanations: explanations.sort(),
  };
  if (missingTotal === 0 && extraTotal === 0) return result;

  // Ein ganzer verlorener Abschnitt ist der aussagekräftigste Beleg – er kommt zuerst.
  const ranked = segments
    .map((segment) => {
      const tokens = contentTokens(segment.text);
      return { segment, tokens: tokens.length, absent: tokens.filter((token) => (missing.get(token) ?? 0) > 0).length };
    })
    .filter((entry) => entry.absent >= 3)
    .sort((left, right) => right.absent - left.absent || right.absent / right.tokens - left.absent / left.tokens);
  const lost = ranked.find((entry) => entry.tokens >= LOST_SEGMENT_TOKENS && entry.absent / entry.tokens >= LOST_SEGMENT_SHARE);
  // Beleg ist der Abschnitt mit den meisten fehlenden Wörtern – auch dann, wenn er die Schwelle für
  // „verloren“ nicht erreicht. Ein Befund ohne Fundstelle ist keine Arbeitsanweisung.
  const evidence = lost ?? ranked[0];
  if (evidence) result.lostExcerpt = excerptOf(`${segmentPath(evidence.segment.path)} ${evidence.segment.text}`);
  const duplicated = [...extra.entries()].sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))[0];
  if (duplicated) result.duplicatedExcerpt = excerptOf(`${duplicated[0]} (${duplicated[1]}× mehr als in der Quelle)`);

  result.class = classify(missingTotal, extraTotal, lost !== undefined);
  return result;
}

function classify(missing: number, extra: number, lostSegment: boolean): TextIntegrityClass {
  if (lostSegment) return 'mismatch';
  if (missing > REVIEW_TOKEN_LIMIT || extra > REVIEW_TOKEN_LIMIT) return 'mismatch';
  return 'review';
}

function subtract(counts: Map<string, number>, token: string): boolean {
  const count = counts.get(token);
  if (count === undefined || count <= 0) return false;
  if (count === 1) counts.delete(token);
  else counts.set(token, count - 1);
  return true;
}

function total(counts: Map<string, number>): number {
  let sum = 0;
  for (const count of counts.values()) sum += count;
  return sum;
}
