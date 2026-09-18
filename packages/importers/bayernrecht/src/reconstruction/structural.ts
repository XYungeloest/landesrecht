/**
 * Strukturelle Änderungsbefehle, die die vorherige Fassung **vollständig bestimmen** – erhoben aus den echten
 * Befehlen der Kandidaten (`data/audits/bayernrecht/RECONSTRUCTION.md`, Tabelle „Änderungsformeln“):
 *
 * | Formel | echtes Beispiel | rückwärts |
 * | --- | --- | --- |
 * | `insert-sentence` | „Folgender Satz 2 wird angefügt: „²Mehrgeschlechtliche Schreibweisen … unzulässig.““ | der Satz steht genau einmal, wörtlich, an der Stelle → entfernen |
 * | `insert-block` | „Folgender Abs. 6 wird angefügt: „(6) Für Angelegenheiten … entsprechend.““ | das Glied trägt genau diese Bezeichnung und genau diesen Wortlaut → entfernen |
 * | `relabel` | „Der bisherige Abs. 3 wird Abs. 4.“, „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“ | Bezeichnung zurücksetzen |
 * | `renumber-sentence` | „Der bisherige Satz 2 wird Satz 3.“ | Satznummer zurücksetzen |
 * | `number-sentences` | „Der Wortlaut wird Satz 1.“ | Satznummer ¹ entfernen |
 * | `insert-title` | „In § 5 wird folgende Überschrift eingefügt: „Übergangsregelung““ | Überschrift entfernen |
 * | `replace-final-words` | „In Nr. 3 wird die Angabe „ .“ am Ende durch die Angabe „oder“ ersetzt.“ | Schluss zurücksetzen |
 * | `delete-final-words` | „In Nr. 5 wird das Wort „oder“ am Ende gestrichen.“ | Wort am Ende wieder anfügen |
 *
 * Eindeutig heißt: Das eingefügte Glied oder der eingefügte Satz steht im heutigen Text **wörtlich** so, wie die
 * Verkündung ihn zitiert (Leerraum ausgenommen), unter genau der genannten Bezeichnung und genau einmal; der
 * Anker („nach Nr. 4“) ist das unmittelbar vorangehende Glied; ein angefügtes Glied ist das letzte seiner Art.
 * Eine Einfügung ohne diese Übereinstimmung, ein Glied mit Abbildung, eine Umnummerierung, deren Ziel nicht
 * eindeutig ist – das alles ist ein Fehler, kein Anlass zu raten. Das entfernte Glied steht im Rezept (es ist
 * durch den Wortlaut der Verkündung belegt) und wird vorwärts an derselben Stelle wieder eingesetzt.
 *
 * Die Befehle werden in Befehlsreihenfolge ausgeführt; eine Ortsangabe bezieht sich auf die Zählung, die zu
 * diesem Zeitpunkt gilt. Rückwärts wird deshalb jeder Befehl **im Zustand unmittelbar nach ihm** aufgelöst.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/persist.ts';

import type { GazetteUnit } from './gazette.ts';
import { blockAt, blockCandidates, blockLabelMatches, formatPath, locateBlock, parseLocation, relabel, resolvePath, type FieldRef, type LocationPath, type LocationStep, type StepKind } from './location.ts';

export class StructuralError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'StructuralError';
  }
}

/* ---------------------------------------------------------------------------- Satznummern */

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export const superscriptNumber = (value: number): string => [...String(value)].map((digit) => SUPERSCRIPT_DIGITS[Number(digit)]).join('');

/** Satznummern an Satzanfängen (Textanfang oder nach Leerraum, „(“, „„“), in Reihenfolge – auch mit Lücken. */
export function sentenceNumbers(text: string): Array<{ value: number; start: number; end: number }> {
  const found: Array<{ value: number; start: number; end: number }> = [];
  for (const match of text.matchAll(/(?<=^|[\s(„])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=\S)/gu)) {
    const value = Number([...match[1]!].map((character) => SUPERSCRIPT_DIGITS.indexOf(character)).join(''));
    found.push({ value, start: match.index!, end: match.index! + match[1]!.length });
  }
  return found;
}

function uniqueNumber(text: string, value: number, step: string): { start: number; end: number } {
  const hits = sentenceNumbers(text).filter((marker) => marker.value === value);
  if (hits.length !== 1) throw new StructuralError(hits.length === 0 ? 'sentence-missing' : 'sentence-ambiguous', `${step}: Satznummer ${superscriptNumber(value)} steht ${hits.length}-mal im Feld (erwartet: genau einmal)`);
  return hits[0]!;
}

/* ------------------------------------------------------------------------ Konkrete Operationen */

export type StructuralOperation =
  /** Satz (oder Satzfolge, mit Satznummer) nach Satz `after` bzw. am Ende; `numberFirst`: vorwärts erhält der bisher einzige Satz die Nummer ¹. */
  | { kind: 'insert-sentence'; after: number | 'end'; text: string; numberFirst: boolean }
  /**
   * Satznummer `from` → `to`. `occurrence`: welche der Nummern `from` vorwärts gemeint ist (0 = erste), wenn ein
   * zuvor eingefügter Satz dieselbe Nummer trägt („Nach Satz 1 wird folgender Satz 2 eingefügt“ vor „Der bisherige
   * Satz 2 wird Satz 3“) – bestimmt beim Rückwärtsrechnen, wo die Nummer `to` eindeutig ist.
   */
  | { kind: 'renumber-sentence'; from: number; to: number; occurrence?: number }
  | { kind: 'number-sentences' }
  /** Glied `block` an Stelle `index` unter `parent` (Indexpfad; `[]` = oberste Ebene). */
  | { kind: 'insert-block'; parent: number[]; index: number; block: NormBodyBlock }
  | { kind: 'relabel'; path: number[]; from: string; to: string }
  | { kind: 'insert-title'; path: number[]; title: string }
  /** Wörter oder Satzzeichen am Ende des einzigen Feldes streichen (`text` wie zitiert). */
  | { kind: 'delete-final'; text: string }
  /** Schluss des einzigen Feldes ersetzen; beide Seiten wie zitiert (Wort oder anschließendes Satzzeichen). */
  | { kind: 'replace-final-words'; from: string; to: string };

export const STRUCTURAL_KINDS: ReadonlySet<string> = new Set(['insert-sentence', 'renumber-sentence', 'number-sentences', 'insert-block', 'relabel', 'insert-title', 'delete-final', 'replace-final-words']);

function childrenAt(body: NormBodyBlock[], parent: readonly number[]): NormBodyBlock[] {
  if (parent.length === 0) return body;
  const block = blockAt(body, parent);
  if (!block) throw new StructuralError('block-missing', `Glied [${parent.join(',')}] fehlt`);
  block.children ??= [];
  return block.children;
}

function fieldText(body: readonly NormBodyBlock[], ref: FieldRef, step: string): string {
  const value = blockAt(body, ref.path)?.[ref.key];
  if (typeof value !== 'string') throw new StructuralError('field-missing', `${step}: Feld ${ref.key} unter [${ref.path.join(',')}] fehlt`);
  return value;
}

function writeText(body: NormBodyBlock[], ref: FieldRef, value: string, step: string): void {
  const block = blockAt(body, ref.path);
  if (!block) throw new StructuralError('field-missing', `${step}: Glied [${ref.path.join(',')}] fehlt`);
  block[ref.key] = value;
}

const PUNCTUATION = /^[,;.:]$/u;
/**
 * Gestalt eines Zitats am Feldende: Ein Zitat, das mit einem Satzzeichen beginnt („ .“, „ , soweit …“), schließt
 * unmittelbar an; ein Wort („oder“) steht nach einem Leerzeichen.
 */
export const finalSurface = (value: string): string => {
  const trimmed = value.trim();
  return /^[,;.:]/u.test(trimmed) ? trimmed : ` ${trimmed}`;
};

function replaceEnd(text: string, from: string, to: string, step: string): string {
  const old = finalSurface(from);
  if (!text.endsWith(old) || text.length === old.length) throw new StructuralError('target-not-found', `${step}: Text endet nicht auf „${old}“`);
  if (old.startsWith(' ') && text[text.length - old.length - 1] === ' ') throw new StructuralError('spacing', `${step}: doppeltes Leerzeichen vor „${old.trim()}“`);
  return `${text.slice(0, -old.length)}${finalSurface(to)}`;
}

/** Vorwärts (Stichtag → heute). `field` ist das einzige Textfeld des Bereichs (nur Satz- und Schlussoperationen). */
export function structuralForward(body: NormBodyBlock[], field: FieldRef | undefined, operation: StructuralOperation, step: string): void {
  switch (operation.kind) {
    case 'insert-sentence': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      let text = fieldText(body, field, step);
      if (operation.numberFirst) {
        if (sentenceNumbers(text).length > 0) throw new StructuralError('spacing', `${step}: der bisherige Satz trägt schon eine Satznummer`);
        text = `¹${text}`;
      }
      if (operation.after === 'end') {
        writeText(body, field, `${text} ${operation.text}`, step);
        return;
      }
      const marker = uniqueNumber(text, operation.after, step);
      const next = sentenceNumbers(text).find((entry) => entry.start > marker.start);
      if (!next) writeText(body, field, `${text} ${operation.text}`, step);
      else {
        if (text[next.start - 1] !== ' ') throw new StructuralError('spacing', `${step}: vor Satz ${superscriptNumber(next.value)} steht kein Leerzeichen`);
        writeText(body, field, `${text.slice(0, next.start)}${operation.text} ${text.slice(next.start)}`, step);
      }
      return;
    }
    case 'renumber-sentence': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      let marker: { start: number; end: number };
      if (operation.occurrence === undefined) marker = uniqueNumber(text, operation.from, step);
      else {
        const hits = sentenceNumbers(text).filter((entry) => entry.value === operation.from);
        if (hits.length < 2 || hits[operation.occurrence] === undefined) throw new StructuralError('sentence-ambiguous', `${step}: Satznummer ${superscriptNumber(operation.from)} steht nicht wie belegt mehrfach im Feld`);
        marker = hits[operation.occurrence]!;
      }
      writeText(body, field, `${text.slice(0, marker.start)}${superscriptNumber(operation.to)}${text.slice(marker.end)}`, step);
      return;
    }
    case 'number-sentences': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      if (sentenceNumbers(text).length > 0) throw new StructuralError('sentence-ambiguous', `${step}: der Wortlaut trägt schon Satznummern`);
      writeText(body, field, `¹${text}`, step);
      return;
    }
    case 'insert-block': {
      const siblings = childrenAt(body, operation.parent);
      if (operation.index > siblings.length) throw new StructuralError('block-missing', `${step}: Stelle ${operation.index} unter [${operation.parent.join(',')}] gibt es nicht`);
      siblings.splice(operation.index, 0, structuredClone(operation.block));
      return;
    }
    case 'relabel': {
      const block = blockAt(body, operation.path);
      if (!block || block.label !== operation.from) throw new StructuralError('target-not-found', `${step}: Glied [${operation.path.join(',')}] trägt nicht die Bezeichnung „${operation.from}“`);
      block.label = operation.to;
      return;
    }
    case 'insert-title': {
      const block = blockAt(body, operation.path);
      if (!block || block.title !== undefined) throw new StructuralError('target-not-found', `${step}: Glied [${operation.path.join(',')}] fehlt oder trägt schon eine Überschrift`);
      block.title = operation.title;
      return;
    }
    case 'delete-final': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const surface = finalSurface(operation.text);
      if (!text.endsWith(surface) || text.length === surface.length) throw new StructuralError('target-not-found', `${step}: Text endet nicht auf „${surface}“`);
      writeText(body, field, text.slice(0, -surface.length), step);
      return;
    }
    case 'replace-final-words': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      writeText(body, field, replaceEnd(fieldText(body, field, step), operation.from, operation.to, step), step);
      return;
    }
  }
}

/** Rückwärts (heute → Stichtag). */
export function structuralBackward(body: NormBodyBlock[], field: FieldRef | undefined, operation: StructuralOperation, step: string): void {
  switch (operation.kind) {
    case 'insert-sentence': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      let text = fieldText(body, field, step);
      const first = sentenceNumbers(operation.text)[0];
      const positions: number[] = [];
      for (let at = text.indexOf(operation.text); at >= 0; at = text.indexOf(operation.text, at + 1)) positions.push(at);
      const valid = positions.filter((at) => {
        if (first !== undefined && !sentenceNumbers(text).some((marker) => marker.start === at)) return false;
        const end = at + operation.text.length;
        const followed = end === text.length || (text[end] === ' ' && sentenceNumbers(text).some((marker) => marker.start === end + 1));
        if (!followed || at === 0 || text[at - 1] !== ' ') return false;
        if (operation.after === 'end') return end === text.length;
        const previous = sentenceNumbers(text).filter((marker) => marker.start < at).at(-1);
        return previous?.value === operation.after;
      });
      if (valid.length !== 1) throw new StructuralError(valid.length === 0 ? 'target-not-found' : 'target-ambiguous', `${step}: eingefügter Satz „${operation.text.slice(0, 80)}“ steht ${valid.length}-mal an der genannten Stelle (erwartet: genau einmal)`);
      const at = valid[0]!;
      const end = at + operation.text.length;
      text = end === text.length ? text.slice(0, at - 1) : `${text.slice(0, at)}${text.slice(end + 1)}`;
      if (operation.numberFirst) {
        const markers = sentenceNumbers(text);
        if (markers.length !== 1 || markers[0]!.value !== 1 || markers[0]!.start !== 0) throw new StructuralError('sentence-ambiguous', `${step}: nach Entfernen bleibt nicht genau der Satz ¹`);
        text = text.slice(markers[0]!.end);
      }
      writeText(body, field, text, step);
      return;
    }
    case 'renumber-sentence': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const marker = uniqueNumber(text, operation.to, step);
      writeText(body, field, `${text.slice(0, marker.start)}${superscriptNumber(operation.from)}${text.slice(marker.end)}`, step);
      return;
    }
    case 'number-sentences': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const markers = sentenceNumbers(text);
      if (markers.length !== 1 || markers[0]!.value !== 1 || markers[0]!.start !== 0) throw new StructuralError('sentence-ambiguous', `${step}: der Wortlaut trägt nicht genau die Satznummer ¹ am Anfang`);
      writeText(body, field, text.slice(markers[0]!.end), step);
      return;
    }
    case 'insert-block': {
      const siblings = childrenAt(body, operation.parent);
      const present = siblings[operation.index];
      if (!present || stableStringify(present) !== stableStringify(operation.block)) throw new StructuralError('target-not-found', `${step}: an Stelle ${operation.index} unter [${operation.parent.join(',')}] steht nicht das eingefügte Glied`);
      siblings.splice(operation.index, 1);
      return;
    }
    case 'relabel': {
      const block = blockAt(body, operation.path);
      if (!block || block.label !== operation.to) throw new StructuralError('target-not-found', `${step}: Glied [${operation.path.join(',')}] trägt nicht die Bezeichnung „${operation.to}“`);
      block.label = operation.from;
      return;
    }
    case 'insert-title': {
      const block = blockAt(body, operation.path);
      if (!block || block.title !== operation.title) throw new StructuralError('target-not-found', `${step}: Glied [${operation.path.join(',')}] trägt nicht die eingefügte Überschrift`);
      delete block.title;
      return;
    }
    case 'delete-final': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const surface = finalSurface(operation.text);
      if (text.endsWith(surface.trim()) && PUNCTUATION.test(surface)) throw new StructuralError('target-ambiguous', `${step}: Text endet schon auf „${surface}“`);
      writeText(body, field, `${text}${surface}`, step);
      return;
    }
    case 'replace-final-words': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      writeText(body, field, replaceEnd(fieldText(body, field, step), operation.to, operation.from, step), step);
      return;
    }
  }
}

/* --------------------------------------------------------------------------- Zitate der Verkündung */

/** Zitierte Einheiten in Gruppen je Zitat (ein Glied, ein Satz), äußere Anführungszeichen entfernt. */
export function quoteGroups(units: readonly GazetteUnit[]): string[] | undefined {
  const groups: string[] = [];
  let current: string[] = [];
  let balance = 0;
  for (const unit of units) {
    const text = `${unit.label ?? ''} ${unit.text}`.trim();
    if (balance <= 0) {
      // Äußeres Zitat „…“; manche Verkündungen setzen es als ‚…‘ (GVBl. 2026 S. 487).
      if (!/^[„‚]/u.test(text)) return undefined;
      if (current.length > 0) groups.push(current.join(' '));
      current = [];
    }
    current.push(text);
    balance += (text.match(/[„‚]/gu)?.length ?? 0) - (text.match(/[“‘]/gu)?.length ?? 0);
  }
  if (balance !== 0) return undefined;
  if (current.length > 0) groups.push(current.join(' '));
  return groups.map((group) => (group.startsWith('‚') ? group.replace(/^‚/u, '').replace(/‘\s*[.;,]?\s*$/u, '') : group.replace(/^„/u, '').replace(/“\s*[.;,]?\s*$/u, '')).trim());
}

/** Vergleichsform: aller Leerraum entfernt – sonst Zeichen für Zeichen. */
export const squash = (value: string): string => value.replace(/\s+/gu, '');

/** Wortlaut eines Glieds in Dokumentreihenfolge (Bezeichnung, Überschrift, Text, Unterglieder). */
export function blockWording(block: NormBodyBlock): { text: string; figures: number } {
  const parts: string[] = [];
  let figures = 0;
  const visit = (entry: NormBodyBlock): void => {
    if ((entry.type as string) === 'figure') figures += 1;
    for (const value of [entry.label, entry.title, entry.text]) if (typeof value === 'string' && value.trim() !== '') parts.push(value);
    for (const child of entry.children ?? []) visit(child);
  };
  visit(block);
  return { text: parts.join(' '), figures };
}

/* --------------------------------------------------------------------------------- Befehle */

/** Vorlage eines strukturellen Befehls; aufgelöst wird sie erst im Körper (`realize`). */
export type StructuralTemplate =
  | { kind: 'insert-sentence'; context: LocationPath; after: number | 'end'; first: number; text: string }
  | { kind: 'renumber-sentences'; context: LocationPath; pairs: Array<[number, number]> }
  | { kind: 'number-sentences'; context: LocationPath }
  | { kind: 'insert-blocks'; context: LocationPath; targets: LocationStep[]; quotes: string[]; anchor?: { side: 'after' | 'before'; step: LocationStep }; append: boolean }
  | { kind: 'relabel'; context: LocationPath; pairs: Array<[LocationStep, LocationStep]> }
  | { kind: 'insert-title'; context: LocationPath; title: string }
  | { kind: 'replace-final'; context: LocationPath; from: string; to: string }
  | { kind: 'delete-final'; context: LocationPath; text: string };

export type StructuralFormula = 'insert-sentence' | 'insert-block' | 'relabel' | 'renumber-sentence' | 'number-sentences' | 'insert-title' | 'replace-final-words' | 'delete-final-words';

export interface StructuralParse {
  formula: StructuralFormula | 'insert-unit' | 'renumber' | 'unrecognized';
  templates?: StructuralTemplate[];
  reason?: string;
}

const KIND_WORDS: ReadonlyArray<[RegExp, StepKind]> = [
  [/^(?:§§?)$/u, 'paragraph'],
  [/^(?:Art\.|Artikel)$/u, 'artikel'],
  [/^(?:Abs\.|Absatz|Absätze)$/u, 'absatz'],
  [/^(?:Nr\.|Nrn\.|Nummer|Nummern)$/u, 'nummer'],
  [/^(?:Buchst\.|Buchstabe|Buchstaben)$/u, 'buchstabe'],
  [/^(?:Doppelbuchst\.)$/u, 'doppelbuchstabe'],
  [/^(?:Teil)$/u, 'teil'],
  [/^(?:Abschnitt|Abschnitte)$/u, 'abschnitt'],
  [/^(?:Anlage|Anlagen)$/u, 'anlage'],
];

const kindOf = (word: string): StepKind | undefined => KIND_WORDS.find(([pattern]) => pattern.test(word))?.[1];

const UNIT = String.raw`(§§?|Art\.|Artikel|Abs\.|Absatz|Absätze|Nrn?\.|Nummer|Nummern|Buchst\.|Buchstabe|Buchstaben|Doppelbuchst\.|Teil|Abschnitt|Anlage)`;
const VALUE = String.raw`(\d+[a-z]?(?:\.\d+[a-z]?)*|[a-z]{1,3})`;
const VALUES = String.raw`(\d+[a-z]?(?:\.\d+[a-z]?)*|[a-z]{1,3})((?:\s*(?:,|und|bis)\s*(?:\d+[a-z]?(?:\.\d+[a-z]?)*|[a-z]{1,3}))*)`;

/** „5 bis 7“ / „3 und 4“ / „2, 3 und 4“ → Werte; Buchstabenbereiche und Unterbereiche nur, wenn eindeutig. */
function expandValues(first: string, rest: string): string[] | undefined {
  const tokens = `${first}${rest}`.split(/\s*(?:,|und)\s*/u).map((token) => token.trim()).filter(Boolean);
  const output: string[] = [];
  for (const token of tokens) {
    const range = /^(\S+)\s*bis\s*(\S+)$/u.exec(token);
    if (!range) {
      output.push(token.trim());
      continue;
    }
    const from = range[1]!;
    const to = range[2]!;
    if (/^\d+$/u.test(from) && /^\d+$/u.test(to) && Number(from) <= Number(to)) {
      for (let value = Number(from); value <= Number(to); value += 1) output.push(String(value));
      continue;
    }
    const prefix = /^(.*\.)(\d+)$/u.exec(from);
    const prefixTo = /^(.*\.)(\d+)$/u.exec(to);
    if (prefix && prefixTo && prefix[1] === prefixTo[1] && Number(prefix[2]) <= Number(prefixTo[2])) {
      for (let value = Number(prefix[2]); value <= Number(prefixTo[2]); value += 1) output.push(`${prefix[1]}${value}`);
      continue;
    }
    if (/^[a-z]$/u.test(from) && /^[a-z]$/u.test(to) && from <= to) {
      for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) output.push(String.fromCharCode(code));
      continue;
    }
    return undefined;
  }
  return output;
}

function sentenceList(text: string): number[] | undefined {
  const match = /^(\d+)((?:\s*(?:,|und|bis)\s*\d+)*)$/u.exec(text.trim());
  if (!match) return undefined;
  return expandValues(match[1]!, match[2]!)?.map(Number);
}

const flat = (context: readonly LocationPath[]): LocationPath => context.flat();

function locationOf(text: string, context: readonly LocationPath[]): LocationPath | undefined {
  if (text.trim() === '') return flat(context);
  const paths = parseLocation(text);
  if (!paths || paths.length !== 1) return undefined;
  return [...flat(context), ...paths[0]!];
}

/**
 * Erkennt einen strukturellen Befehl. `undefined`: kein struktureller Befehl (dann gelten die Wortlautformeln).
 * `quoted`: die Einheiten mit dem zitierten Wortlaut hinter „…:“.
 */
export function parseStructural(input: string, context: readonly LocationPath[], quoted: readonly GazetteUnit[]): StructuralParse | undefined {
  const text = input.trim().replace(/\s+/gu, ' ');
  let match: RegExpExecArray | null;

  // „Der Wortlaut wird Satz 1.“
  if (/^Der\s+Wortlaut\s+wird\s+Satz\s+1\.?$/u.test(text)) return { formula: 'number-sentences', templates: [{ kind: 'number-sentences', context: flat(context) }] };

  // Satzumnummerierung: „Der bisherige Satz 2 wird Satz 3.“ / „Die bisherigen Sätze 2 und 3 werden die Sätze 3 und 4.“
  if ((match = /^(?:In\s+(.+?)\s+(?:wird|werden)\s+)?(?:(?:Der|Die)\s+)?(?:bisherigen?\s+)?(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:wird|werden)\s+(?:zu\s+)?(?:(?:die|den)\s+)?(?:Satz|Sätzen?)\s+([\d\s,undbis]+?)\.?$/u.exec(text))) {
    const where = locationOf(match[1] ?? '', context);
    const from = sentenceList(match[2]!);
    const to = sentenceList(match[3]!);
    if (!where || !from || !to || from.length !== to.length) return { formula: 'renumber', reason: 'Satzumnummerierung nicht eindeutig lesbar' };
    return { formula: 'renumber-sentence', templates: [{ kind: 'renumber-sentences', context: where, pairs: from.map((value, index) => [value, to[index]!] as [number, number]) }] };
  }

  // Gliedumnummerierung: „Der bisherige Abs. 3 wird Abs. 4.“ / „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“
  // „§ 4 wird § 3 und wie folgt geändert:“ (die Unterbefehle behandelt die Befehlsstruktur)
  const relabelPattern = new RegExp(String.raw`^(?:(?:Der|Die|Das)\s+)?(?:bisherigen?\s+)?${UNIT}\s+${VALUES}\s+(?:wird|werden)\s+(?:zu\s+)?(?:(?:die|der|den|dem)\s+)?${UNIT}\s+${VALUES}(\s+und\s+(?:wird\s+)?wie\s+folgt\s+geändert\s*:)?\.?$`, 'u');
  if ((match = relabelPattern.exec(text))) {
    const fromKind = kindOf(match[1]!);
    const toKind = kindOf(match[4]!);
    const from = expandValues(match[2]!, match[3]!);
    const to = expandValues(match[5]!, match[6]!);
    if (!fromKind || fromKind !== toKind || !from || !to || from.length !== to.length) return { formula: 'renumber', reason: 'Umnummerierung nicht eindeutig lesbar (Art oder Zahl der Glieder)' };
    return { formula: 'relabel', templates: [{ kind: 'relabel', context: flat(context), pairs: from.map((value, index) => [{ kind: fromKind, value }, { kind: toKind, value: to[index]! }] as [LocationStep, LocationStep]) }] };
  }

  // Überschrift: „In § 5 wird folgende Überschrift eingefügt:“ / „Folgende Überschrift wird eingefügt:“
  if ((match = /^(?:(?:In|Im)\s+(.+?)\s+wird\s+folgende\s+Überschrift\s+eingefügt|Folgende\s+Überschrift\s+wird\s+eingefügt)\s*:$/u.exec(text))) {
    const where = locationOf(match[1] ?? '', context);
    const groups = quoteGroups(quoted);
    if (!where || !groups || groups.length !== 1 || where.length === 0) return { formula: 'insert-unit', reason: 'Eingefügte Überschrift: Ort oder Zitat nicht eindeutig' };
    return { formula: 'insert-title', templates: [{ kind: 'insert-title', context: where, title: groups[0]! }] };
  }

  // Satz: „Folgender Satz 2 wird angefügt:“, „Dem Abs. 1 wird folgender Satz 3 angefügt:“, „Nach Satz 1 wird folgender Satz 2 eingefügt:“,
  // „Die folgenden Sätze 3 und 4 werden angefügt:“, „Nach Satz 2 werden die folgenden Sätze 3 und 4 eingefügt:“
  const sentence = /^(?:(?:Dem|Der|Den)\s+(.+?)\s+(?:wird|werden)\s+|(?:Es\s+(?:wird|werden)\s+)|(?:In\s+(.+?)\s+(?:wird|werden)\s+))?(?:die\s+)?folgende[nr]?\s+(?:neuen?\s+)?(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:(?:wird|werden)\s+)?angefügt\s*:$/u.exec(text)
    ?? /^(?:Die\s+)?[Ff]olgende[nr]?\s+(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:wird|werden)\s+angefügt\s*:$/u.exec(text);
  const insertAfter = /^(?:In\s+(.+?)\s+(?:wird|werden)\s+)?[Nn]ach\s+Satz\s+(\d+)\s+(?:wird|werden)\s+(?:die\s+)?folgende[nr]?\s+(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+eingefügt\s*:$/u.exec(text);
  if (sentence || insertAfter) {
    const where = locationOf(sentence ? (sentence.length === 4 ? (sentence[1] ?? sentence[2] ?? '') : '') : (insertAfter![1] ?? ''), context);
    const numbers = sentenceList(sentence ? (sentence.length === 4 ? sentence[3]! : sentence[1]!) : insertAfter![3]!);
    const groups = quoteGroups(quoted);
    if (!where || !numbers || !groups || groups.length === 0) return { formula: 'insert-unit', reason: 'Eingefügter Satz: Ort, Satznummer oder Zitat nicht lesbar' };
    const inserted = groups.join(' ');
    const markers = sentenceNumbers(inserted);
    const first = numbers[0]!;
    const numbered = markers.length > 0;
    if (numbered && (markers.length !== numbers.length || markers.some((marker, index) => marker.value !== numbers[index]) || markers[0]!.start !== 0)) {
      return { formula: 'insert-unit', reason: `Eingefügter Satz: Satznummern im Zitat (${markers.map((marker) => marker.value).join(', ')}) passen nicht zum Befehl (${numbers.join(', ')})` };
    }
    if (!numbered && numbers.length !== 1) return { formula: 'insert-unit', reason: 'Mehrere eingefügte Sätze ohne Satznummern: die Satzgrenzen sind nicht belegt' };
    const after: number | 'end' = insertAfter ? Number(insertAfter[2]) : 'end';
    if (typeof after === 'number' && after !== first - 1) return { formula: 'insert-unit', reason: `„Nach Satz ${after}“ fügt Satz ${first} ein – die Stelle ist nicht eindeutig` };
    return { formula: 'insert-sentence', templates: [{ kind: 'insert-sentence', context: where, after, first, text: inserted }] };
  }

  // Glied: „Nach Nr. 4 wird folgende Nr. 5 eingefügt:“, „Folgender Abs. 6 wird angefügt:“, „Dem § 3 wird folgender Abs. 4 angefügt:“,
  // „Nach Abs. 2 werden die folgenden Abs. 3 und 4 eingefügt:“, „Vor Nr. 1 wird folgende Nr. 1 eingefügt:“
  const blockPattern = new RegExp(String.raw`^(?:(?:(?:In|Im)\s+(.+?)\s+(?:wird|werden)\s+)|(?:(?:Dem|Der|Den)\s+(.+?)\s+(?:wird|werden)\s+))?(?:(nach|vor|Nach|Vor)\s+(?:dem\s+|der\s+)?${UNIT}\s+${VALUE}\s+(?:(?:wird|werden)\s+)?)?(?:die\s+)?[Ff]olgende[nrs]?\s+(?:neuen?\s+)?${UNIT}\s+${VALUES}\s+(?:(?:wird|werden)\s+)?(eingefügt|angefügt)\s*:$`, 'u');
  const blockAppendFirst = new RegExp(String.raw`^(?:Die\s+)?[Ff]olgende[nrs]?\s+${UNIT}\s+${VALUES}\s+(?:wird|werden)\s+(angefügt|eingefügt)\s*:$`, 'u');
  if ((match = blockPattern.exec(text))) {
    const where = locationOf(match[1] ?? match[2] ?? '', context);
    const anchorKind = match[4] ? kindOf(match[4]) : undefined;
    const targetKind = kindOf(match[6]!);
    const values = expandValues(match[7]!, match[8]!);
    const verb = match[9]!;
    const groups = quoteGroups(quoted);
    if (!where || !targetKind || !values || !groups || (match[4] && !anchorKind)) return { formula: 'insert-unit', reason: 'Eingefügtes Glied: Ort, Bezeichnung oder Zitat nicht lesbar' };
    if (groups.length !== values.length && groups.length !== 1) return { formula: 'insert-unit', reason: `Eingefügte Glieder: ${values.length} genannt, ${groups.length} zitiert` };
    if (verb === 'eingefügt' && !match[3]) return { formula: 'insert-unit', reason: 'Eingefügtes Glied ohne Anker („nach …“/„vor …“): die Stelle ist nicht bestimmt' };
    return {
      formula: 'insert-block',
      templates: [{
        kind: 'insert-blocks',
        context: where,
        targets: values.map((value) => ({ kind: targetKind, value })),
        quotes: groups,
        ...(match[3] ? { anchor: { side: match[3].toLowerCase() === 'nach' ? 'after' as const : 'before' as const, step: { kind: anchorKind!, value: match[5]! } } } : {}),
        append: verb === 'angefügt',
      }],
    };
  }
  if ((match = blockAppendFirst.exec(text))) {
    const targetKind = kindOf(match[1]!);
    const values = expandValues(match[2]!, match[3]!);
    const groups = quoteGroups(quoted);
    if (!targetKind || !values || !groups) return { formula: 'insert-unit', reason: 'Angefügtes Glied: Bezeichnung oder Zitat nicht lesbar' };
    if (groups.length !== values.length && groups.length !== 1) return { formula: 'insert-unit', reason: `Angefügte Glieder: ${values.length} genannt, ${groups.length} zitiert` };
    if (match[4] === 'eingefügt') return { formula: 'insert-unit', reason: 'Eingefügtes Glied ohne Anker: die Stelle ist nicht bestimmt' };
    return { formula: 'insert-block', templates: [{ kind: 'insert-blocks', context: flat(context), targets: values.map((value) => ({ kind: targetKind, value })), quotes: groups, append: true }] };
  }
  return undefined;
}

/* ------------------------------------------------------------------- Auflösung im Körper */

/** Ein aufgelöster Schritt: konkrete Operation, Feld (bei Satz- und Schlussoperationen), Ort und Beleg. */
export interface RealizedStep {
  operation: StructuralOperation;
  field?: FieldRef;
  location: string;
  resolved: string[];
  widened: string[];
}

function singleTextField(body: readonly NormBodyBlock[], path: LocationPath, step: string): { field: FieldRef; resolved: string[]; widened: string[] } {
  const scope = resolvePath(body, path);
  if (!scope.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath(path)}: ${scope.reason}`);
  if (scope.scope.sentence !== undefined) throw new StructuralError('location-unresolved', `${step}: Satzangabe als Ort eines Satzbefehls`);
  const fields = scope.scope.fields.filter((field) => field.key === 'text');
  if (fields.length !== 1) throw new StructuralError('end-not-determined', `${step} ${formatPath(path)}: genau ein Textfeld verlangt, der Bereich hat ${fields.length}`);
  return { field: fields[0]!, resolved: scope.scope.resolved, widened: scope.scope.widened };
}

const SAME_KIND: Readonly<Partial<Record<StepKind, RegExp>>> = {
  absatz: /^\(\d+[a-z]?\)$/u,
  nummer: /^(?:Nr\.\s*)?\d+[a-z]?(?:\.\d+[a-z]?)*\.?$/u,
  buchstabe: /^[a-z]{1,2}[).]$/u,
  paragraph: /^§\s*\d+[a-z]?$/u,
  artikel: /^(?:Art\.|Artikel)\s*\d+[a-z]?$/u,
  teil: /^Teil\s+\S+$/u,
  abschnitt: /^Abschnitt\s+\S+$/u,
  anlage: /^Anlage\s+\S+$/u,
};

/**
 * Löst eine Vorlage im **Zustand unmittelbar nach dem Befehl** auf. Ergebnis: die konkreten Schritte in
 * Vorwärtsreihenfolge. `explicitNumbering`: Die Änderung enthält für diesen Ort „Der Wortlaut wird Satz 1“.
 */
export function realize(body: readonly NormBodyBlock[], template: StructuralTemplate, step: string, explicitNumbering: boolean): RealizedStep[] {
  switch (template.kind) {
    case 'insert-sentence': {
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      const text = String(blockAt(body, field.path)?.text ?? '');
      const markers = sentenceNumbers(text);
      const numbered = sentenceNumbers(template.text).length > 0;
      const last = sentenceNumbers(template.text).at(-1)?.value ?? template.first;
      // Satz 2 an einen bisher einzigen, unnummerierten Satz angefügt: Das Portal nummeriert dann auch Satz 1.
      const numberFirst = numbered && template.after === 'end' && template.first === 2 && !explicitNumbering && markers.length === last && markers.every((marker, index) => marker.value === index + 1);
      return [{ operation: { kind: 'insert-sentence', after: template.after, text: template.text, numberFirst }, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'renumber-sentences': {
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      const up = template.pairs.every(([from, to]) => to > from);
      const down = template.pairs.every(([from, to]) => to < from);
      if (!up && !down) throw new StructuralError('renumber-ambiguous', `${step}: Umnummerierung weder durchgehend auf- noch absteigend`);
      const ordered = [...template.pairs].sort((left, right) => (up ? right[0] - left[0] : left[0] - right[0]));
      // Rückwärts im aktuellen Zustand: Nummer `to` eindeutig, danach steht `from` gegebenenfalls zweimal (ein zuvor
      // eingefügter Satz trägt sie schon) – dann hält `occurrence` fest, welche vorwärts gemeint ist.
      const working = structuredClone(body) as NormBodyBlock[];
      const realized: RealizedStep[] = [];
      for (const [from, to] of [...ordered].reverse()) {
        const operation: StructuralOperation = { kind: 'renumber-sentence', from, to };
        const before = String(blockAt(working, field.path)?.[field.key] ?? '');
        structuralBackward(working, field, operation, step);
        const text = String(blockAt(working, field.path)?.[field.key] ?? '');
        const same = sentenceNumbers(text).filter((entry) => entry.value === from);
        if (same.length > 1) {
          const target = sentenceNumbers(before).find((entry) => entry.value === to)!;
          operation.occurrence = same.findIndex((entry) => entry.start === target.start);
          if (operation.occurrence < 0) throw new StructuralError('sentence-ambiguous', `${step}: Satz ${from} nicht eindeutig zuzuordnen`);
        }
        realized.unshift({ operation, field, location: `${formatPath(template.context)} Satz ${from} → ${to}`, resolved, widened });
      }
      return realized;
    }
    case 'number-sentences': {
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      return [{ operation: { kind: 'number-sentences' }, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'replace-final':
    case 'delete-final': {
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      const operation: StructuralOperation = template.kind === 'replace-final' ? { kind: 'replace-final-words', from: template.from, to: template.to } : { kind: 'delete-final', text: template.text };
      return [{ operation, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'insert-title': {
      const located = locateBlock(body, template.context);
      if (!located.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath(template.context)}: ${located.reason}`);
      const block = blockAt(body, located.path);
      if (!block || typeof block.title !== 'string' || squash(block.title) !== squash(template.title)) throw new StructuralError('inserted-text-mismatch', `${step}: Überschrift von ${formatPath(template.context)} ist nicht die eingefügte („${template.title.slice(0, 60)}“)`);
      return [{ operation: { kind: 'insert-title', path: located.path, title: block.title }, location: formatPath(template.context), resolved: located.resolved, widened: located.widened }];
    }
    case 'relabel': {
      const up = template.pairs.every(([from, to]) => compareValues(to.value, from.value) > 0);
      const down = template.pairs.every(([from, to]) => compareValues(to.value, from.value) < 0);
      if (!up && !down) throw new StructuralError('renumber-ambiguous', `${step}: Umnummerierung weder durchgehend auf- noch absteigend`);
      const ordered = [...template.pairs].sort((left, right) => (up ? compareValues(right[0].value, left[0].value) : compareValues(left[0].value, right[0].value)));
      // Aufgelöst wird rückwärts, also in umgekehrter Vorwärtsreihenfolge, jeweils im aktuellen Zustand.
      const working = structuredClone(body) as NormBodyBlock[];
      const realized: RealizedStep[] = [];
      for (const [from, to] of [...ordered].reverse()) {
        const located = locateBlock(working, [...template.context, to]);
        if (!located.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath([...template.context, to])}: ${located.reason}`);
        const block = blockAt(working, located.path)!;
        const oldLabel = relabel(block.label, to, from.value);
        if (oldLabel === undefined || block.label === undefined) throw new StructuralError('renumber-ambiguous', `${step}: Bezeichnung „${block.label ?? ''}“ nicht eindeutig umzuschreiben`);
        const operation: StructuralOperation = { kind: 'relabel', path: located.path, from: oldLabel, to: block.label };
        structuralBackward(working, undefined, operation, step);
        realized.unshift({ operation, location: `${formatPath([...template.context, from])} → ${formatPath([to])}`, resolved: located.resolved, widened: located.widened });
      }
      return realized;
    }
    case 'insert-blocks': {
      const realized: RealizedStep[] = [];
      const combined: string[] = [];
      let parent: number[] | undefined;
      let previousIndex: number | undefined;
      template.targets.forEach((target, position) => {
        let located = locateBlock(body, [...template.context, target]);
        if (!located.ok && /mehrfach/u.test(located.reason) && template.quotes.length === template.targets.length) {
          // Gleich bezeichnete Glieder (das neue „3.“ neben dem bisherigen, das erst der nächste Befehl umnummeriert):
          // Das eingefügte ist genau das, dessen Wortlaut das Zitat ist.
          const candidates = (blockCandidates(body, template.context, target) ?? []).filter((path) => squash(blockWording(blockAt(body, path)!).text) === squash(template.quotes[position]!));
          if (candidates.length === 1) located = { ok: true, path: candidates[0]!, resolved: [`${formatPath([target])} (nach Wortlaut unterschieden)`], widened: [] };
        }
        if (!located.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath([...template.context, target])}: ${located.reason}`);
        const path = located.path;
        const here = path.slice(0, -1);
        const index = path.at(-1)!;
        if (parent !== undefined && (here.join(',') !== parent.join(',') || index !== previousIndex! + 1)) throw new StructuralError('location-unresolved', `${step}: die eingefügten Glieder stehen nicht unmittelbar hintereinander`);
        parent = here;
        previousIndex = index;
        const block = blockAt(body, path)!;
        const wording = blockWording(block);
        if (wording.figures > 0) throw new StructuralError('image-in-inserted-unit', `${step}: das eingefügte Glied ${formatPath([target])} enthält eine Abbildung; ihr Inhalt ist nicht mit dem Zitat vergleichbar`);
        // Je Glied ein Zitat – oder ein Zitat für alle Glieder zusammen (dann wird die Folge als Ganzes verglichen).
        if (template.quotes.length === template.targets.length && squash(wording.text) !== squash(template.quotes[position]!)) throw new StructuralError('inserted-text-mismatch', `${step}: ${formatPath([target])} im heutigen Text ist nicht wörtlich das eingefügte Glied („${template.quotes[position]!.slice(0, 80)}“ ≠ „${wording.text.slice(0, 80)}“)`);
        combined.push(wording.text);
        const siblings = here.length === 0 ? body : (blockAt(body, here)?.children ?? []);
        if (template.anchor && position === 0 && template.anchor.side === 'after') {
          const previous = siblings[index - 1];
          if (!previous || !blockLabelMatches(previous, template.anchor.step)) throw new StructuralError('anchor-mismatch', `${step}: vor ${formatPath([target])} steht nicht ${formatPath([template.anchor.step])}`);
        }
        if (template.anchor && position === template.targets.length - 1 && template.anchor.side === 'before') {
          const next = siblings[index + 1];
          if (!next || !blockLabelMatches(next, template.anchor.step)) throw new StructuralError('anchor-mismatch', `${step}: nach ${formatPath([target])} steht nicht ${formatPath([template.anchor.step])}`);
        }
        if (template.append && position === template.targets.length - 1) {
          const pattern = SAME_KIND[target.kind];
          if (!pattern) throw new StructuralError('location-unresolved', `${step}: angefügtes Glied der Art ${target.kind} nicht prüfbar`);
          if (siblings.slice(index + 1).some((sibling) => pattern.test((sibling.label ?? '').replace(/\s+/gu, ' ').trim()))) throw new StructuralError('anchor-mismatch', `${step}: ${formatPath([target])} ist nicht das letzte Glied seiner Art`);
        }
        realized.push({ operation: { kind: 'insert-block', parent: here, index, block: structuredClone(block) }, location: formatPath([...template.context, target]), resolved: located.resolved, widened: located.widened });
      });
      if (template.quotes.length !== template.targets.length && squash(combined.join(' ')) !== squash(template.quotes.join(' '))) throw new StructuralError('inserted-text-mismatch', `${step}: die eingefügten Glieder im heutigen Text sind nicht wörtlich das Zitat`);
      return realized;
    }
  }
}

/** Vergleich von Gliedwerten („5“ < „5a“ < „6“, „a“ < „b“, „1.2“ < „1.10“). */
export function compareValues(left: string, right: string): number {
  const split = (value: string): Array<number | string> => value.split(/(\d+)/u).filter(Boolean).map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  const a = split(left);
  const b = split(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

/** Beleg eines strukturellen Schritts (Vorher/Nachher in Kurzform). */
export function structuralEvidence(operation: StructuralOperation): { baseline: string; current: string } {
  switch (operation.kind) {
    case 'insert-sentence': return { baseline: '(Satz fehlt)', current: operation.text.slice(0, 200) };
    case 'renumber-sentence': return { baseline: `Satz ${superscriptNumber(operation.from)}`, current: `Satz ${superscriptNumber(operation.to)}` };
    case 'number-sentences': return { baseline: '(ohne Satznummer)', current: '¹' };
    case 'insert-block': return { baseline: '(Glied fehlt)', current: blockWording(operation.block).text.slice(0, 200) };
    case 'relabel': return { baseline: operation.from, current: operation.to };
    case 'insert-title': return { baseline: '(ohne Überschrift)', current: operation.title };
    case 'delete-final': return { baseline: `…${finalSurface(operation.text)}`, current: '(am Ende gestrichen)' };
    case 'replace-final-words': return { baseline: `…${finalSurface(operation.from)}`, current: `…${finalSurface(operation.to)}` };
  }
}
