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
  /** Umkehrung von `number-sentences`: „In Satz 1 wird die Satznummerierung „¹“ gestrichen.“ – vorwärts fällt ¹ am Anfang weg. */
  | { kind: 'unnumber-sentences' }
  /** Glied `block` an Stelle `index` unter `parent` (Indexpfad; `[]` = oberste Ebene). */
  | { kind: 'insert-block'; parent: number[]; index: number; block: NormBodyBlock }
  | { kind: 'relabel'; path: number[]; from: string; to: string }
  | { kind: 'insert-title'; path: number[]; title: string }
  /** Wörter oder Satzzeichen am Ende des einzigen Feldes streichen (`text` wie zitiert). */
  | { kind: 'delete-final'; text: string }
  /** Schluss des einzigen Feldes ersetzen; beide Seiten wie zitiert (Wort oder anschließendes Satzzeichen). */
  | { kind: 'replace-final-words'; from: string; to: string }
  /**
   * „Der Wortlaut wird Abs. 1.“: Der unbezeichnete Inhalt der Vorschrift unter `parent` ab `index` (ein Textglied, wenn
   * `text`, dann `count` weitere Glieder) wird der Absatz `label` – so, wie der Parser einen bezeichneten Absatz bildet
   * (`subparagraphBlocks`: erster Fließtext als `text`, der Rest als Kinder).
   */
  | { kind: 'number-paragraph'; parent: number[]; index: number; label: string; text: boolean; count: number }
  /** Umkehrung von `number-paragraph`: „In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“ – vorwärts wird der einzige Absatz unbezeichneter Wortlaut. */
  | { kind: 'unnumber-paragraph'; parent: number[]; index: number; label: string; text: boolean; count: number }
  /**
   * Wiederhergestellt aus den Verkündungen (`restoration` im Rezept, `restore.ts`): Der Befehl trägt den Alttext nicht
   * (Neufassung, Aufhebung, Streichung ohne Anker); der Stand am Stichtag stammt aus der Stammverkündung und den
   * Änderungen bis zum Stichtag. Feld `key` des Glieds `path`: `before` am Stichtag, `after` nach dem Befehl.
   */
  | { kind: 'replace-text'; path: number[]; key: 'text' | 'title'; before: string; after: string }
  /** Glieder `before` (Stichtag) ab Stelle `index` unter `parent` werden die Glieder `after` (nach dem Befehl; leer bei Aufhebung). */
  | { kind: 'replace-blocks'; parent: number[]; index: number; before: NormBodyBlock[]; after: NormBodyBlock[] };

export const STRUCTURAL_KINDS: ReadonlySet<string> = new Set(['insert-sentence', 'renumber-sentence', 'number-sentences', 'unnumber-sentences', 'insert-block', 'relabel', 'insert-title', 'delete-final', 'replace-final-words', 'number-paragraph', 'unnumber-paragraph', 'replace-text', 'replace-blocks']);

/** Operationen, deren Alttext aus den Verkündungen wiederhergestellt ist (nicht aus dem Befehl). */
export const RESTORE_KINDS: ReadonlySet<string> = new Set(['replace-text', 'replace-blocks']);

function swapText(body: NormBodyBlock[], path: readonly number[], key: 'text' | 'title', from: string, to: string, step: string): void {
  const block = blockAt(body, path);
  if (!block || block[key] !== from) throw new StructuralError('target-not-found', `${step}: Feld ${key} des Glieds [${path.join(',')}] ist nicht der belegte Wortlaut`);
  block[key] = to;
}

function swapBlocks(body: NormBodyBlock[], parent: readonly number[], index: number, from: readonly NormBodyBlock[], to: readonly NormBodyBlock[], step: string): void {
  const siblings = childrenAt(body, parent);
  const present = siblings.slice(index, index + from.length);
  if (present.length !== from.length || stableStringify(present) !== stableStringify(from)) throw new StructuralError('target-not-found', `${step}: an Stelle ${index} unter [${parent.join(',')}] stehen nicht die belegten Glieder`);
  siblings.splice(index, from.length, ...structuredClone(to as NormBodyBlock[]));
}

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
    case 'unnumber-sentences': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const markers = sentenceNumbers(text);
      // Lauf 10: Weitere Sätze (²…) dürfen folgen, wenn dieselbe Änderung sie danach aufhebt (GVBl. 2023 S. 577).
      if (markers.length === 0 || markers[0]!.value !== 1 || markers[0]!.start !== 0 || markers.slice(1).some((marker, index) => marker.value !== index + 2)) throw new StructuralError('sentence-ambiguous', `${step}: der Wortlaut trägt nicht die Satznummer ¹ am Anfang`);
      writeText(body, field, text.slice(markers[0]!.end), step);
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
    case 'number-paragraph': {
      const siblings = childrenAt(body, operation.parent);
      const size = (operation.text ? 1 : 0) + operation.count;
      if (operation.index + size > siblings.length || size === 0) throw new StructuralError('block-missing', `${step}: unter [${operation.parent.join(',')}] fehlen die Glieder des Wortlauts`);
      const taken = siblings.slice(operation.index, operation.index + size);
      const block: NormBodyBlock = { type: 'subparagraph', label: operation.label };
      if (operation.text) {
        const first = taken[0]!;
        if (first.type !== 'paragraphText' || first.children !== undefined || first.label !== undefined || typeof first.text !== 'string' || Object.keys(first).some((key) => key !== 'type' && key !== 'text')) throw new StructuralError('target-not-found', `${step}: der Wortlaut beginnt nicht mit einem einfachen Textglied`);
        block.text = first.text;
      }
      if (operation.count > 0) block.children = taken.slice(operation.text ? 1 : 0);
      siblings.splice(operation.index, size, block);
      return;
    }
    case 'unnumber-paragraph': {
      const siblings = childrenAt(body, operation.parent);
      const block = siblings[operation.index];
      if (!block || block.type !== 'subparagraph' || block.label !== operation.label || Object.keys(block).some((key) => !['type', 'label', 'text', 'children'].includes(key))) throw new StructuralError('target-not-found', `${step}: an Stelle ${operation.index} unter [${operation.parent.join(',')}] steht nicht der Absatz „${operation.label}“`);
      if ((typeof block.text === 'string') !== operation.text || (block.children?.length ?? 0) !== operation.count) throw new StructuralError('target-not-found', `${step}: Absatz „${operation.label}“ hat nicht die belegte Gestalt`);
      siblings.splice(operation.index, 1, ...(operation.text ? [{ type: 'paragraphText', text: block.text! } as NormBodyBlock] : []), ...(block.children ?? []));
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
    case 'replace-text':
      swapText(body, operation.path, operation.key, operation.before, operation.after, step);
      return;
    case 'replace-blocks':
      swapBlocks(body, operation.parent, operation.index, operation.before, operation.after, step);
      return;
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
    case 'unnumber-sentences': {
      if (!field) throw new StructuralError('field-missing', `${step}: kein Feld`);
      const text = fieldText(body, field, step);
      const markers = sentenceNumbers(text);
      if (markers.length > 0 && (markers[0]!.start === 0 || markers.some((marker, index) => marker.value !== index + 2))) throw new StructuralError('sentence-ambiguous', `${step}: der Wortlaut trägt schon Satznummern`);
      writeText(body, field, `¹${text}`, step);
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
    case 'number-paragraph': {
      const siblings = childrenAt(body, operation.parent);
      const block = siblings[operation.index];
      if (!block || block.type !== 'subparagraph' || block.label !== operation.label || Object.keys(block).some((key) => !['type', 'label', 'text', 'children'].includes(key))) throw new StructuralError('target-not-found', `${step}: an Stelle ${operation.index} unter [${operation.parent.join(',')}] steht nicht der Absatz „${operation.label}“`);
      if ((typeof block.text === 'string') !== operation.text || (block.children?.length ?? 0) !== operation.count) throw new StructuralError('target-not-found', `${step}: Absatz „${operation.label}“ hat nicht die belegte Gestalt`);
      siblings.splice(operation.index, 1, ...(operation.text ? [{ type: 'paragraphText', text: block.text! } as NormBodyBlock] : []), ...(block.children ?? []));
      return;
    }
    case 'unnumber-paragraph': {
      const siblings = childrenAt(body, operation.parent);
      const size = (operation.text ? 1 : 0) + operation.count;
      if (operation.index + size > siblings.length || size === 0) throw new StructuralError('block-missing', `${step}: unter [${operation.parent.join(',')}] fehlen die Glieder des Wortlauts`);
      const taken = siblings.slice(operation.index, operation.index + size);
      const block: NormBodyBlock = { type: 'subparagraph', label: operation.label };
      if (operation.text) {
        const first = taken[0]!;
        if (first.type !== 'paragraphText' || first.children !== undefined || first.label !== undefined || typeof first.text !== 'string' || Object.keys(first).some((key) => key !== 'type' && key !== 'text')) throw new StructuralError('target-not-found', `${step}: der Wortlaut beginnt nicht mit einem einfachen Textglied`);
        block.text = first.text;
      }
      if (operation.count > 0) block.children = taken.slice(operation.text ? 1 : 0);
      siblings.splice(operation.index, size, block);
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
    case 'replace-text':
      swapText(body, operation.path, operation.key, operation.after, operation.before, step);
      return;
    case 'replace-blocks':
      swapBlocks(body, operation.parent, operation.index, operation.after, operation.before, step);
      return;
  }
}

/* --------------------------------------------------------------------------- Zitate der Verkündung */

/** Zitierte Einheiten in Gruppen je Zitat (ein Glied, ein Satz), äußere Anführungszeichen entfernt. */
export function quoteGroups(units: readonly GazetteUnit[], options: { dashes?: boolean } = {}): string[] | undefined {
  const groups: string[] = [];
  let current: string[] = [];
  let balance = 0;
  for (const unit of units) {
    let text = `${unit.label ?? ''} ${unit.text}`.trim();
    // Spiegelstriche setzen die Verkündungen als Listenpunkt ohne Zeichen im Text (`li.MBLSpiegelstrich18`, BayMBl. 2024
    // Nr. 442; `li` ohne Klasse, GVBl. 2025 S. 272); der Körper führt sie mit der Bezeichnung „–“. Für den Vergleich
    // eingefügter Glieder wird der Strich ergänzt – stimmt er nicht, scheitert der wörtliche Vergleich.
    if (options.dashes && unit.tag === 'li' && (unit.className === '' || /Spiegelstrich/u.test(unit.className)) && !unit.label) text = /^[„‚]/u.test(text) ? `${text[0]}– ${text.slice(1)}` : `– ${text}`;
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
  | { kind: 'unnumber-sentences'; context: LocationPath }
  | { kind: 'insert-blocks'; context: LocationPath; targets: LocationStep[]; quotes: string[]; anchor?: { side: 'after' | 'before'; step: LocationStep }; append: boolean }
  | { kind: 'relabel'; context: LocationPath; pairs: Array<[LocationStep, LocationStep]> }
  | { kind: 'insert-title'; context: LocationPath; title: string }
  | { kind: 'replace-final'; context: LocationPath; from: string; to: string }
  | { kind: 'delete-final'; context: LocationPath; text: string }
  | { kind: 'number-paragraph'; context: LocationPath }
  | { kind: 'unnumber-paragraph'; context: LocationPath };

export type StructuralFormula = 'insert-sentence' | 'insert-block' | 'relabel' | 'renumber-sentence' | 'number-sentences' | 'unnumber-sentences' | 'insert-title' | 'replace-final-words' | 'delete-final-words' | 'number-paragraph' | 'unnumber-paragraph';

export interface StructuralParse {
  formula: StructuralFormula | 'insert-unit' | 'renumber' | 'unrecognized';
  templates?: StructuralTemplate[];
  reason?: string;
  /**
   * Weiterer Befehl im selben Satz, nach der Umnummerierung auszuführen, am Glied unter seiner **neuen** Bezeichnung:
   * „Der bisherige Buchst. b wird Buchst. c und nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ eingefügt.“
   */
  followUp?: { text: string; context: LocationPath };
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
  // Lauf 11: Satzfehler „die Nrn. 6.1. bis 6.3.“ (BayMBl. 2022 Nr. 702) – ein Schlusspunkt einer mehrstufigen
  // Dezimalbezeichnung vor „bis“/„und“/Komma gehört nicht zur Bezeichnung (bewiesen erst durch Vorwärtsprobe und Wortlaut).
  const text = input.trim().replace(/\s+/gu, ' ').replace(/(?<![„\d.])(\d+(?:\.\d+)+)\.(?=\s*(?:bis|und|,)\s)/gu, '$1')
    // „die folgenden Nrn. 4.5 bis Nr. 4.7“ (BayMBl. 2022 Nr. 702): die wiederholte Einheit.
    .replace(/\b(Nrn\.\s+\d+(?:\.\d+)*)\s+(bis|und)\s+Nr\.\s+(?=\d)/gu, '$1 $2 ');
  let match: RegExpExecArray | null;

  // „Der Wortlaut wird Satz 1.“
  if (/^Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+Satz\s+1(?:\.|\s+und\s+(?:wird\s+)?wie\s+folgt\s+geändert\s*:)?$/u.test(text)) return { formula: 'number-sentences', templates: [{ kind: 'number-sentences', context: flat(context) }] };
  // „In Satz 1 wird die Satznummerierung „¹“ gestrichen.“ (GVBl. 2019 S. 380; BayMBl. 2022 Nr. 694), auch mit weiterem Befehl
  // am selben Ort („… gestrichen und die Angabe „2022“ durch die Angabe „2025“ ersetzt.“ – danach ausgeführt).
  // Auch „Die Satznummerierung in Satz 1 wird gestrichen.“ (BayMBl. 2020 Nr. 350) und ohne Zitat der Nummer.
  const unnumber = /^(?:(?:In|Im)\s+(.+?)\s+wird\s+die\s+Satznummerierung(?:\s+[„"]¹[“"])?\s+gestrichen|Die\s+Satznummerierung(?:\s+[„"]¹[“"]|\s+(?:in|im)\s+(.+?))?\s+wird\s+gestrichen)(?:\s+und\s+([\s\S]+?))?\.?$/u.exec(text);
  if (unnumber) {
    const where = locationOf(unnumber[1] ?? unnumber[2] ?? '', context);
    if (!where) return { formula: 'renumber', reason: 'Satznummerierung gestrichen: Ort nicht lesbar' };
    // „In Satz 1 …“: gemeint ist das Feld, dessen einziger Satz die Nummer verliert.
    const field = where.at(-1)?.kind === 'satz' && where.at(-1)?.value === '1' ? where.slice(0, -1) : where;
    const parsed: StructuralParse = { formula: 'unnumber-sentences', templates: [{ kind: 'unnumber-sentences', context: field }] };
    if (!unnumber[3]) return parsed;
    const rest = unnumber[3].trim();
    return { ...parsed, followUp: { text: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.`, context: field } };
  }
  // „In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“ (GVBl. 2022 S. 680): Der einzige Absatz verliert seine Bezeichnung.
  // Auch „In Abs. 1 wird die Angabe „(1)“ gestrichen.“ (GVBl. 2025 S. 254, 2026 S. 306) – nur am Ort Abs. 1.
  const unlabel = /^(?:(?:In|Im)\s+(.+?)\s+wird\s+die\s+(Absatzbezeichnung|Angabe)\s+[„"]\(1\)[“"]\s+gestrichen|Die\s+(Absatzbezeichnung)\s+[„"]\(1\)[“"]\s+wird\s+gestrichen)\.?$/u.exec(text);
  if (unlabel) {
    const where = locationOf(unlabel[1] ?? '', context);
    if (!where) return { formula: 'renumber', reason: 'Absatzbezeichnung gestrichen: Ort nicht lesbar' };
    if (unlabel[2] === 'Angabe' && !(where.at(-1)?.kind === 'absatz' && where.at(-1)?.value === '1')) return undefined;
    const owner = where.at(-1)?.kind === 'absatz' && where.at(-1)?.value === '1' ? where.slice(0, -1) : where;
    return { formula: 'unnumber-paragraph', templates: [{ kind: 'unnumber-paragraph', context: owner }] };
  }
  // „Der Wortlaut wird Satz 1 und nach dem Wort „…“ werden die Wörter „…“ eingefügt.“ (GVBl. 2023 S. 318): erst die Nummer,
  // dann der weitere Befehl am selben Ort.
  const numberedAnd = /^Der\s+Wortlaut\s+wird\s+Satz\s+1\s+und\s+(?!(?:wird\s+)?wie\s+folgt)([\s\S]+?)\.?$/u.exec(text);
  // Nur mit einem vollständigen weiteren Befehl, nicht mit einer Neufassung mit Zitat („… und Nr. 2 wie folgt gefasst:“).
  if (numberedAnd && !/(?:wie\s+folgt|:\s*$)/u.test(numberedAnd[1]!)) {
    const rest = numberedAnd[1]!.trim();
    return { formula: 'number-sentences', templates: [{ kind: 'number-sentences', context: flat(context) }], followUp: { text: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.`, context: flat(context) } };
  }
  // „Der Wortlaut wird Abs. 1.“ (GVBl. 2024 S. 562, 2026 S. 190)
  if (/^Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+Abs\.\s*1\.?$/u.test(text)) return { formula: 'number-paragraph', templates: [{ kind: 'number-paragraph', context: flat(context) }] };

  // Umnummerierung mit weiterem Befehl: „Der bisherige Satz 3 wird Satz 4 und nach der Angabe „Bei dem“ … eingefügt.“,
  // „Nr. 6 wird Nr. 5 und in Buchst. c wird die Angabe „Nrn.“ durch die Angabe „Nr.“ ersetzt.“
  const combined = new RegExp(String.raw`^((?:(?:Der|Die|Das)\s+)?(?:bisherigen?\s+)?(?:${UNIT}|Satz)\s+${VALUE}\s+wird\s+(?:zu\s+)?(?:${UNIT}|Satz)\s+${VALUE})(?:\s+und|,)\s+(?!(?:wird\s+)?wie\s+folgt)([\s\S]+?)\.?$`, 'u').exec(text);
  if (combined) {
    const head = parseStructural(`${combined[1]!}.`, context, []);
    const renumbered = head?.templates?.[0];
    if (head && renumbered && (renumbered.kind === 'relabel' || renumbered.kind === 'renumber-sentences') && (renumbered.kind === 'relabel' ? renumbered.pairs.length === 1 : renumbered.pairs.length === 1)) {
      const rest = combined[combined.length - 1]!.trim();
      const target: LocationStep = renumbered.kind === 'relabel' ? renumbered.pairs[0]![1] : { kind: 'satz', value: String(renumbered.pairs[0]![1]) };
      const restContext = renumbered.kind === 'relabel' ? [...renumbered.context, target] : [...renumbered.context, target];
      return { ...head, followUp: { text: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.`, context: restContext } };
    }
  }

  // Satzumnummerierung: „Der bisherige Satz 2 wird Satz 3.“ / „Die bisherigen Sätze 2 und 3 werden die Sätze 3 und 4.“
  if ((match = /^(?:In\s+(.+?)\s+(?:wird|werden)\s+)?(?:(?:Der|Die)\s+)?(?:bisherigen?\s+)?(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:wird|werden)\s+(?:zu\s+)?(?:(?:die|den)\s+)?(?:Satz|Sätzen?)\s+([\d\s,undbis]+?)(?:\s+und\s+(?:wird\s+)?wie\s+folgt\s+geändert\s*:)?\.?$/u.exec(text))) {
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

  // Überschrift: „In § 5 wird folgende Überschrift eingefügt:“ / „Folgende Überschrift wird eingefügt:“ /
  // „Der Nr. 1 wird folgende Überschrift vorangestellt:“ (BayMBl. 2025 Nr. 391)
  if ((match = /^(?:(?:In|Im)\s+(.+?)\s+wird\s+folgende\s+Überschrift\s+eingefügt|Folgende\s+Überschrift\s+wird\s+eingefügt|Es\s+wird\s+folgende\s+Überschrift\s+eingefügt|(?:Der|Dem)\s+(.+?)\s+wird\s+folgende\s+Überschrift\s+vorangestellt)\s*:$/u.exec(text))) {
    if (match[1] === undefined && match[2] !== undefined) match[1] = match[2];
    const where = locationOf(match[1] ?? '', context);
    const groups = quoteGroups(quoted);
    if (!where || !groups || groups.length !== 1 || where.length === 0) return { formula: 'insert-unit', reason: 'Eingefügte Überschrift: Ort oder Zitat nicht eindeutig' };
    return { formula: 'insert-title', templates: [{ kind: 'insert-title', context: where, title: groups[0]! }] };
  }

  // Satz: „Folgender Satz 2 wird angefügt:“, „Dem Abs. 1 wird folgender Satz 3 angefügt:“, „Nach Satz 1 wird folgender Satz 2 eingefügt:“,
  // „Die folgenden Sätze 3 und 4 werden angefügt:“, „Nach Satz 2 werden die folgenden Sätze 3 und 4 eingefügt:“
  const sentence = /^(?:(?:Dem|Der|Den)\s+(.+?)\s+(?:wird|werden)\s+|(?:Es\s+(?:wird|werden)\s+)|(?:In\s+(.+?)\s+(?:wird|werden)\s+))?(?:die\s+)?folgende[nr]?\s+(?:neue[nr]?\s+)?(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:(?:wird|werden)\s+)?angefügt\s*:$/u.exec(text)
    ?? /^(?:Die\s+)?[Ff]olgende[nr]?\s+(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:wird|werden)\s+angefügt\s*:$/u.exec(text);
  // Auch „In der Einleitung wird nach Satz 2 folgender Satz 3 angefügt:“ (BayMBl. 2021 Nr. 305) und ohne Anker „Es wird
  // folgender neuer Satz 4 eingefügt:“ (BayMBl. 2023 Nr. 610) – die Nummer des neuen Satzes nennt die Stelle (nach Satz 3).
  let insertAfter = /^(?:In\s+(.+?)\s+(?:wird|werden)\s+)?[Nn]ach\s+Satz\s+(\d+)\s+(?:(?:wird|werden)\s+)?(?:die\s+)?folgende[nr]?\s+(?:neue[nr]?\s+)?(?:Satz|Sätze)\s+([\d\s,undbis]+?)\s+(?:eingefügt|angefügt)\s*:$/u.exec(text);
  const unanchored = insertAfter ? null : /^(?:In\s+(.+?)\s+(?:wird|werden)\s+|Es\s+(?:wird|werden)\s+)(?:die\s+)?folgende[nr]?\s+(?:neue[nr]?\s+)?(?:Satz|Sätze)\s+(\d+)((?:\s*(?:,|und|bis)\s*\d+)*)\s+eingefügt\s*:$/u.exec(text);
  if (unanchored && Number(unanchored[2]) > 1) {
    const synthetic = [unanchored[0], unanchored[1], String(Number(unanchored[2]) - 1), `${unanchored[2]}${unanchored[3] ?? ''}`] as unknown as RegExpExecArray;
    insertAfter = synthetic;
  }
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
  const blockPattern = new RegExp(String.raw`^(?:(?:(?:In|Im)\s+(.+?)\s+(?:wird|werden)\s+)|(?:(?:Dem|Der|Den)\s+(.+?)\s+(?:wird|werden)\s+)|(?:Es\s+(?:wird|werden)\s+))?(?:(nach|vor|Nach|Vor)\s+(?:dem\s+|der\s+)?${UNIT}\s+${VALUE}\s+(?:(?:wird|werden)\s+)?)?(?:die\s+)?[Ff]olgende[nrs]?\s+(?:neue[nrs]?\s+)?${UNIT}\s+${VALUES}\s+(?:(?:wird|werden)\s+)?(eingefügt|angefügt)\s*:$`, 'u');
  const blockAppendFirst = new RegExp(String.raw`^(?:Die\s+)?[Ff]olgende[nrs]?\s+${UNIT}\s+${VALUES}\s+(?:wird|werden)\s+(angefügt|eingefügt)\s*:$`, 'u');
  // Lauf 10: „Nach § 2 Abs. 2 wird folgender Abs. 2a eingefügt:“ (GVBl. 2020 S. 511) – Anker mit mehrstufigem Ort: der
  // Ort ohne letzte Stufe ist der Bereich, die letzte Stufe der Anker. „Es werden folgende Nr. 4 und folgende neue Nrn. 5
  // bis 7 eingefügt:“ (GVBl. 2012 S. 12) – eine lückenlose Folge.
  let blockText = text;
  const deepAnchor = new RegExp(String.raw`^(Nach|Vor)\s+(.+?)\s+((?:wird|werden)\s+(?:die\s+)?[Ff]olgende[nrs]?\s+(?:neue[nrs]?\s+)?${UNIT}\s+[\s\S]+)$`, 'u').exec(text);
  if (deepAnchor) {
    const paths = parseLocation(deepAnchor[2]!);
    if (paths && paths.length === 1 && paths[0]!.length > 1) blockText = `In ${formatPath(paths[0]!.slice(0, -1))} ${deepAnchor[3]!.replace(/^(wird|werden)\s+/u, `$1 ${deepAnchor[1]!.toLowerCase()} ${formatPath(paths[0]!.slice(-1))} `)}`;
  }
  // „Art. 1 wird folgender Abs. 3 angefügt:“ (GVBl. 2014 S. 117) – ohne Artikel, sonst wie „Dem Art. 1 wird …“.
  if (/^(?:Art\.|§|Nr\.|Abs\.|Anlage|Teil|Abschnitt)\s*\d[\w.]*(?:\s+(?:Abs\.|Nr\.|Buchst\.)\s*\w[\w.]*)*\s+(?:wird|werden)\s+(?:die\s+)?folgende[nrs]?\s[\s\S]*angefügt\s*:$/u.test(blockText)) blockText = `Dem ${blockText}`;
  const joinedRun = /folgende\s+Nr\.\s+(\d+)\s+und\s+folgende\s+(?:neue\s+)?Nrn\.\s+(\d+)\s+bis\s+(\d+)/u.exec(blockText);
  if (joinedRun && Number(joinedRun[2]) === Number(joinedRun[1]) + 1) blockText = blockText.replace(joinedRun[0], `folgende Nrn. ${joinedRun[1]} bis ${joinedRun[3]}`);
  if ((match = blockPattern.exec(blockText))) {
    const where = locationOf(match[1] ?? match[2] ?? '', context);
    const anchorKind = match[4] ? kindOf(match[4]) : undefined;
    const targetKind = kindOf(match[6]!);
    const values = expandValues(match[7]!, match[8]!);
    const verb = match[9]!;
    const groups = quoteGroups(quoted, { dashes: true });
    if (!where || !targetKind || !values || !groups || (match[4] && !anchorKind)) return { formula: 'insert-unit', reason: 'Eingefügtes Glied: Ort, Bezeichnung oder Zitat nicht lesbar' };
    if (groups.length !== values.length && groups.length !== 1) return { formula: 'insert-unit', reason: `Eingefügte Glieder: ${values.length} genannt, ${groups.length} zitiert` };
    // „Es wird folgende neue Nr. 3.6 eingefügt:“ nennt keinen Anker; rückwärts genügt das Glied mit genau dieser
    // Bezeichnung und genau diesem Wortlaut (die Stelle hält die Operation fest).
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
    const groups = quoteGroups(quoted, { dashes: true });
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
  /** Umnummerierung: Index des Paars in `template.pairs`, aus dem der Schritt stammt. */
  pair?: number;
  field?: FieldRef;
  location: string;
  resolved: string[];
  widened: string[];
  /** Toleriert Satzfehler der Quelle (Portal oder Verkündung), im Rezept vermerkt. */
  note?: string;
}

export function singleTextField(body: readonly NormBodyBlock[], path: LocationPath, step: string): { field: FieldRef; resolved: string[]; widened: string[] } {
  const scope = resolvePath(body, path);
  if (!scope.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath(path)}: ${scope.reason}`);
  if (scope.scope.sentence !== undefined) throw new StructuralError('location-unresolved', `${step}: Satzangabe als Ort eines Satzbefehls`);
  const fields = scope.scope.fields.filter((field) => field.key === 'text');
  if (fields.length !== 1) throw new StructuralError('end-not-determined', `${step} ${formatPath(path)}: genau ein Textfeld verlangt, der Bereich hat ${fields.length}`);
  return { field: fields[0]!, resolved: scope.scope.resolved, widened: scope.scope.widened };
}

/**
 * Ein Absatz, dessen Satz über eine Aufzählung läuft (Art. 7 Abs. 2 BayUIG: „¹Soweit ein Antrag“ – „1. …“ … „5. …“ –
 * „ist er abzulehnen, …“): eigener Text, nur bezeichnete Aufzählungsglieder, dann genau ein unbezeichneter Schlusstext
 * als letztes Kind. Satz 1 beginnt im eigenen Text; ein angefügter Satz steht am Ende des Schlusstexts.
 */
function listFrame(body: readonly NormBodyBlock[], path: LocationPath): { first: FieldRef; last?: FieldRef; inner: FieldRef[]; resolved: string[]; widened: string[] } | undefined {
  const scope = resolvePath(body, path);
  if (!scope.ok || scope.scope.sentence !== undefined) return undefined;
  const fields = scope.scope.fields.filter((field) => field.key === 'text');
  if (fields.length < 2) return undefined;
  const first = fields[0]!;
  const owner = blockAt(body, first.path);
  const children = owner?.children ?? [];
  const isItem = (child: NormBodyBlock): boolean => (child.type === 'item' || child.type === 'subitem') && Boolean(child.label);
  // BayMBl.: Der Text vor der Aufzählung ist ein eigener Absatz, die Aufzählung (und ein Schlusstext) stehen als
  // Geschwister dahinter unter demselben Glied („3.2 Nicht Antragsberechtigte“ – „Nicht antragsberechtigt sind“ – „– …“).
  if (owner && owner.type === 'paragraphText' && typeof owner.text === 'string' && children.length === 0 && first.path.length > 0) {
    const parent = first.path.slice(0, -1);
    const start = first.path.at(-1)!;
    const rest = (parent.length === 0 ? body : (blockAt(body, parent)?.children ?? [])).slice(start + 1);
    if (!fields.every((field) => field.path.slice(0, parent.length).join(',') === parent.join(',') && field.path[parent.length]! >= start)) return undefined;
    const end = rest.at(-1);
    const closed = end !== undefined && end.type === 'paragraphText' && !end.label && (end.children?.length ?? 0) === 0 && rest.length >= 2 && rest.slice(0, -1).every(isItem);
    if (closed) {
      const last = fields.at(-1)!;
      if (last.path.join(',') !== [...parent, start + rest.length].join(',') || fields.length < 3) return undefined;
      return { first, last, inner: fields.slice(1, -1), resolved: scope.scope.resolved, widened: scope.scope.widened };
    }
    if (rest.length === 0 || !rest.every(isItem)) return undefined;
    return { first, inner: fields.slice(1), resolved: scope.scope.resolved, widened: scope.scope.widened };
  }
  if (!owner || typeof owner.text !== 'string' || children.length === 0) return undefined;
  if (!fields.every((field) => field.path.slice(0, first.path.length).join(',') === first.path.join(','))) return undefined;
  const tail = children.at(-1)!;
  const tailed = tail.type === 'paragraphText' && !tail.label && (tail.children?.length ?? 0) === 0 && children.length >= 2 && children.slice(0, -1).every(isItem);
  if (tailed) {
    const last = fields.at(-1)!;
    if (last.path.join(',') !== [...first.path, children.length - 1].join(',') || fields.length < 3) return undefined;
    return { first, last, inner: fields.slice(1, -1), resolved: scope.scope.resolved, widened: scope.scope.widened };
  }
  // Ohne Schlusstext: eigener Text, dann nur bezeichnete Aufzählungsglieder (Art. 2 Abs. 1 BayUIG am Stichtag).
  if (!children.every(isItem)) return undefined;
  return { first, inner: fields.slice(1), resolved: scope.scope.resolved, widened: scope.scope.widened };
}

const markersIn = (body: readonly NormBodyBlock[], fields: readonly FieldRef[]): number => fields.reduce((sum, field) => sum + sentenceNumbers(String(blockAt(body, field.path)?.[field.key] ?? '')).length, 0);

export const SAME_KIND: Readonly<Partial<Record<StepKind, RegExp>>> = {
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
      const frame = template.after === 'end' ? listFrameOrUndefined(body, template.context, step) : undefined;
      if (frame && frame.last) {
        // Der angefügte Satz ist der ganze Schlusstext hinter der Aufzählung (Art. 2 Abs. 1 BayUIG, GVBl. 2024 S. 605): Er
        // steht als eigenes Textglied, das es vorher nicht gab – rückwärts entfällt das Glied. Nur mit ausdrücklicher
        // Satznummerierung. Fehlt im Portaltext genau der Schlusspunkt des zitierten Satzes, ist das ein Satzfehler des
        // Portals: Das Glied wird so, wie es im Portal steht, entfernt und vorwärts wieder eingesetzt; vermerkt im Rezept.
        const tailText = String(blockAt(body, frame.last.path)?.text ?? '');
        const whole = tailText === template.text;
        const missingPeriod = !whole && template.text.endsWith('.') && tailText === template.text.slice(0, -1);
        if ((whole || missingPeriod) && explicitNumbering && sentenceNumbers(tailText)[0]?.start === 0) {
          const parent = frame.last.path.slice(0, -1);
          const index = frame.last.path.at(-1)!;
          return [{
            operation: { kind: 'insert-block', parent, index, block: structuredClone(blockAt(body, frame.last.path)!) },
            location: `${formatPath(template.context)} (Satz ${template.first} als eigener Schlusstext hinter der Aufzählung)`,
            resolved: frame.resolved,
            widened: frame.widened,
            ...(missingPeriod ? { note: `Portaltext ohne den Schlusspunkt des angefügten Satzes („…${template.text.slice(-40)}“); das Glied wird wörtlich wie im Portal behandelt` } : {}),
          }];
        }
        // Angefügter Satz hinter dem Schlusstext einer Aufzählung. Die Satznummer ¹ im eigenen Text stammt nur dann nicht
        // aus dieser Änderung, wenn die Änderung sie ausdrücklich setzt („Der Wortlaut wird Satz 1.“) oder der Absatz
        // schon vorher weitere Sätze zählte.
        const lastText = tailText;
        const before = sentenceNumbers(lastText).filter((marker) => marker.value < template.first).length + markersIn(body, frame.inner);
        if (!explicitNumbering && before === 0) throw new StructuralError('sentence-ambiguous', `${step} ${formatPath(template.context)}: Satz ${template.first} hinter einer Aufzählung ohne ausdrückliche Satznummerierung`);
        return [{ operation: { kind: 'insert-sentence', after: 'end', text: template.text, numberFirst: false }, field: frame.last, location: `${formatPath(template.context)} (Schlusstext hinter der Aufzählung)`, resolved: frame.resolved, widened: frame.widened }];
      }
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
    case 'unnumber-sentences': {
      // Rückwärts erhält der einzige Satz des Feldes wieder ¹: Das Feld trägt heute keine Satznummer. An einem Glied mit
      // Aufzählung steht ¹ am Anfang des eigenen Texts; dann trägt kein Teil des Rahmens eine Satznummer.
      const frame = listFrameOrUndefined(body, template.context, step);
      if (frame) {
        if (markersIn(body, [frame.first, ...frame.inner, ...(frame.last ? [frame.last] : [])]) > 0) throw new StructuralError('sentence-ambiguous', `${step} ${formatPath(template.context)}: der Absatz mit Aufzählung trägt noch Satznummern`);
        return [{ operation: { kind: 'unnumber-sentences' }, field: frame.first, location: `${formatPath(template.context)} (Text vor der Aufzählung)`, resolved: frame.resolved, widened: frame.widened }];
      }
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      // Rückwärts: kein ¹, keine Nummer am Anfang; folgen ², ³ … lückenlos (ein später aufgehobener Satz ist schon
      // zurückgenommen), erhält der Anfang ¹.
      const numbers = sentenceNumbers(fieldText(body, field, step));
      if (numbers.length > 0 && (numbers[0]!.start === 0 || numbers.some((marker, index) => marker.value !== index + 2))) throw new StructuralError('sentence-ambiguous', `${step} ${formatPath(template.context)}: der Wortlaut trägt noch Satznummern`);
      return [{ operation: { kind: 'unnumber-sentences' }, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'number-sentences': {
      const frame = listFrameOrUndefined(body, template.context, step);
      if (frame) {
        // „Der Wortlaut wird Satz 1.“ an einem Absatz mit Aufzählung: ¹ steht am Anfang des eigenen Texts, sonst trägt
        // der Absatz (nach Rücknahme der späteren Befehle) keine Satznummer.
        const firstMarkers = sentenceNumbers(String(blockAt(body, frame.first.path)?.text ?? ''));
        if (firstMarkers.length !== 1 || firstMarkers[0]!.value !== 1 || firstMarkers[0]!.start !== 0 || markersIn(body, [...frame.inner, ...(frame.last ? [frame.last] : [])]) > 0) throw new StructuralError('sentence-ambiguous', `${step} ${formatPath(template.context)}: der Absatz mit Aufzählung trägt nicht genau die Satznummer ¹ am Anfang`);
        return [{ operation: { kind: 'number-sentences' }, field: frame.first, location: `${formatPath(template.context)} (Text vor der Aufzählung)`, resolved: frame.resolved, widened: frame.widened }];
      }
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      return [{ operation: { kind: 'number-sentences' }, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'replace-final':
    case 'delete-final': {
      const { field, resolved, widened } = singleTextField(body, template.context, step);
      const operation: StructuralOperation = template.kind === 'replace-final' ? { kind: 'replace-final-words', from: template.from, to: template.to } : { kind: 'delete-final', text: template.text };
      return [{ operation, field, location: formatPath(template.context), resolved, widened }];
    }
    case 'unnumber-paragraph': {
      // Rückwärts: Die Vorschrift trägt heute keinen bezeichneten Absatz; ihr Wortlaut (ein einfaches Textglied, dann die
      // übrigen Glieder) wird wieder Abs. 1.
      const located = locateBlock(body, template.context);
      if (!located.ok || located.path.length === 0) throw new StructuralError('location-unresolved', `${step} ${formatPath(template.context)}: ${located.ok ? 'die ganze Norm' : located.reason}`);
      const children = blockAt(body, located.path)?.children ?? [];
      // Der bisherige Abs. 1 ist der unbezeichnete Wortlaut am Anfang – bis zum ersten bezeichneten Absatz (stehen die
      // übrigen Absätze nach Rücknahme ihrer Aufhebung wieder da: „b) … Absatzbezeichnung „(1)“ gestrichen. c) Die Abs. 2
      // und 3 werden aufgehoben.“, GVBl. 2024 S. 458).
      const end = children.findIndex((child) => child.type === 'subparagraph');
      const leading = end < 0 ? children : children.slice(0, end);
      if (leading.length === 0 || leading.some((child) => (child.type as string) === 'footnote') || (end >= 0 && children.slice(end).some((child) => child.type !== 'subparagraph' || normalizeLabelText(child.label) === '(1)'))) throw new StructuralError('location-unresolved', `${step} ${formatPath(template.context)}: kein unbezeichneter Wortlaut vor den bezeichneten Absätzen`);
      const first = leading[0]!;
      const text = first.type === 'paragraphText' && first.children === undefined && first.label === undefined && typeof first.text === 'string' && Object.keys(first).every((key) => key === 'type' || key === 'text');
      const operation: StructuralOperation = { kind: 'unnumber-paragraph', parent: located.path, index: 0, label: '(1)', text, count: leading.length - (text ? 1 : 0) };
      return [{ operation, location: `${formatPath(template.context)} Abs. 1`, resolved: located.resolved, widened: located.widened }];
    }
    case 'number-paragraph': {
      // Rückwärts (nach Rücknahme der späteren Befehle) ist der Absatz (1) das einzige Glied der Vorschrift; seine
      // Kinder sind kein Fußnotenvermerk an der Absatznummer (den der Parser voranstellt).
      const located = locateBlock(body, template.context);
      if (!located.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath(template.context)}: ${located.reason}`);
      const owner = located.path.length === 0 ? undefined : blockAt(body, located.path);
      const children = located.path.length === 0 ? body : (owner?.children ?? []);
      const only = children[0];
      if (children.length !== 1 || !only || only.type !== 'subparagraph' || normalizeLabelText(only.label) !== '(1)') throw new StructuralError('location-unresolved', `${step} ${formatPath(template.context)}: Abs. 1 ist nicht das einzige Glied der Vorschrift`);
      if ((only.children ?? []).some((child) => (child.type as string) === 'footnote')) throw new StructuralError('location-unresolved', `${step}: Fußnote am Absatz – Zugehörigkeit zur Absatznummer nicht bestimmt`);
      const operation: StructuralOperation = { kind: 'number-paragraph', parent: located.path, index: 0, label: only.label!, text: typeof only.text === 'string', count: only.children?.length ?? 0 };
      return [{ operation, location: `${formatPath(template.context)} Abs. 1`, resolved: located.resolved, widened: located.widened }];
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
      for (const pair of [...ordered].reverse()) {
        const [from, to] = pair;
        const located = locateBlock(working, [...template.context, to]);
        if (!located.ok) throw new StructuralError('location-unresolved', `${step} ${formatPath([...template.context, to])}: ${located.reason}`);
        const block = blockAt(working, located.path)!;
        const oldLabel = relabel(block.label, to, from.value);
        if (oldLabel === undefined || block.label === undefined) throw new StructuralError('renumber-ambiguous', `${step}: Bezeichnung „${block.label ?? ''}“ nicht eindeutig umzuschreiben`);
        const operation: StructuralOperation = { kind: 'relabel', path: located.path, from: oldLabel, to: block.label };
        structuralBackward(working, undefined, operation, step);
        realized.unshift({ operation, pair: template.pairs.indexOf(pair), location: `${formatPath([...template.context, from])} → ${formatPath([to])}`, resolved: located.resolved, widened: located.widened });
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
        } else if (!located.ok && /mehrfach/u.test(located.reason)) {
          // Lauf 10: ein Zitat für mehrere Glieder („Nach § 7 werden die folgenden §§ 8 und 9 eingefügt:“ vor „Die bisherigen
          // §§ 8 bis 10 werden die §§ 10 bis 12.“, GVBl. 2023 S. 577): das Glied, dessen Wortlaut im Zitat steht und das
          // unmittelbar auf den Anker (oder das vorige eingefügte Glied) folgt.
          const all = squash(template.quotes.join(' '));
          const candidates = (blockCandidates(body, template.context, target) ?? []).filter((path) => {
            if (!all.includes(squash(blockWording(blockAt(body, path)!).text))) return false;
            const index = path.at(-1)!;
            const siblings = path.length === 1 ? body : (blockAt(body, path.slice(0, -1))?.children ?? []);
            if (parent !== undefined) return path.slice(0, -1).join(',') === parent.join(',') && index === previousIndex! + 1;
            return !template.anchor || template.anchor.side !== 'after' || (siblings[index - 1] !== undefined && blockLabelMatches(siblings[index - 1]!, template.anchor.step));
          });
          if (candidates.length === 1) located = { ok: true, path: candidates[0]!, resolved: [`${formatPath([target])} (nach Wortlaut und Stelle unterschieden)`], widened: [] };
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
        // Der Anker ist das unmittelbar vorangehende (folgende) Glied – oder, wenn dieses selbst gegliedert ist, sein
        // letztes (erstes) Unterglied: „Nach § 14 wird folgender Teil 4 eingefügt“, wenn § 14 der letzte Paragraph von Teil 3 ist.
        const edge = (block: NormBodyBlock | undefined, side: 'last' | 'first'): NormBodyBlock[] => {
          const chain: NormBodyBlock[] = [];
          for (let current = block; current; current = side === 'last' ? current.children?.at(-1) : current.children?.[0]) chain.push(current);
          return chain;
        };
        if (template.anchor && position === 0 && template.anchor.side === 'after') {
          if (!edge(siblings[index - 1], 'last').some((block) => blockLabelMatches(block, template.anchor!.step))) throw new StructuralError('anchor-mismatch', `${step}: vor ${formatPath([target])} steht nicht ${formatPath([template.anchor.step])}`);
        }
        if (template.anchor && position === template.targets.length - 1 && template.anchor.side === 'before') {
          if (!edge(siblings[index + 1], 'first').some((block) => blockLabelMatches(block, template.anchor!.step))) throw new StructuralError('anchor-mismatch', `${step}: nach ${formatPath([target])} steht nicht ${formatPath([template.anchor.step])}`);
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

/** Rahmen einer Aufzählung nur, wenn der Bereich nicht ohnehin genau ein Textfeld hat. */
export function listFrameOrUndefined(body: readonly NormBodyBlock[], path: LocationPath, step: string): ReturnType<typeof listFrame> {
  try {
    singleTextField(body, path, step);
    return undefined;
  } catch (error) {
    if (!(error instanceof StructuralError) || error.code !== 'end-not-determined') return undefined;
    return listFrame(body, path);
  }
}

const normalizeLabelText = (label: string | undefined): string => (label ?? '').replace(/\s+/gu, ' ').trim();

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
    case 'unnumber-sentences': return { baseline: '¹', current: '(ohne Satznummer)' };
    case 'insert-block': return { baseline: '(Glied fehlt)', current: blockWording(operation.block).text.slice(0, 200) };
    case 'relabel': return { baseline: operation.from, current: operation.to };
    case 'insert-title': return { baseline: '(ohne Überschrift)', current: operation.title };
    case 'delete-final': return { baseline: `…${finalSurface(operation.text)}`, current: '(am Ende gestrichen)' };
    case 'replace-final-words': return { baseline: `…${finalSurface(operation.from)}`, current: `…${finalSurface(operation.to)}` };
    case 'number-paragraph': return { baseline: '(Wortlaut ohne Absatzbezeichnung)', current: operation.label };
    case 'unnumber-paragraph': return { baseline: operation.label, current: '(Wortlaut ohne Absatzbezeichnung)' };
    case 'replace-text': return textDelta(operation.before, operation.after);
    case 'replace-blocks': return { baseline: operation.before.length === 0 ? '(Glied fehlt)' : operation.before.map((block) => blockWording(block).text).join(' ').slice(0, 200), current: operation.after.length === 0 ? '(aufgehoben)' : operation.after.map((block) => blockWording(block).text).join(' ').slice(0, 200) };
  }
}

/** Kurzbeleg zweier Fassungen eines Feldes: der geänderte Abschnitt mit etwas Umgebung. */
export function textDelta(before: string, after: string): { baseline: string; current: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
  const from = Math.max(0, start - 40);
  const cut = (text: string): string => {
    const stop = Math.min(text.length, text.length - end + 40);
    const core = text.slice(from, stop);
    return `${from > 0 ? '…' : ''}${core.length > 400 ? `${core.slice(0, 400)}…` : core}${stop < text.length ? '…' : ''}`;
  };
  return { baseline: cut(before), current: cut(after) };
}
