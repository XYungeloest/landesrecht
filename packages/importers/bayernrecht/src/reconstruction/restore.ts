/**
 * Alttext aus den Verkündungen (Lauf 7, `forward-from-publication`): Neufassungen, Aufhebungen und Streichungen ohne
 * Anker tragen den bisherigen Wortlaut nicht im Befehl – die Rücknahme allein kann sie nicht umkehren. Liegt die
 * Stammverkündung digital und amtlich vor und gilt am Stichtag ihre Fassung (oder die Fassung nach Änderungen, die
 * ebenfalls digital vorliegen), steht der Alttext dort.
 *
 * Der Stand am Stichtag wird **vorwärts** aus den Verkündungen gebaut (`publication.ts`: Stammverkündung → Blockmodell
 * der Verkündung, `baseline-only/html.ts`). Für einen nicht umkehrbaren Befehl wird im heutigen (Portal-)Körper der Ort
 * aufgelöst wie bei jeder Rücknahme; der Alttext kommt aus dem Stand der Verkündungen – gefunden **über den Wortlaut**,
 * nicht über die Gliederung (die Verkündung gliedert anders als das Portal):
 *
 * - **Streichung ohne Anker** („In Nr. 3 wird die Angabe „X“ gestrichen.“): das Feld der Verkündung, aus dem durch
 *   Streichen genau dieses Wortlauts **zeichengleich** das heutige Feld des Portals wird.
 * - **Aufhebung und Neufassung von Sätzen** („Satz 2 wird aufgehoben.“, „Die Sätze 3 bis 6 werden wie folgt
 *   gefasst: „…““): das Feld der Verkündung, aus dem durch Streichen bzw. Ersetzen genau dieser Sätze zeichengleich das
 *   heutige Feld wird.
 *
 * Das ist eine Probe Zeichen für Zeichen auf dem ganzen Feld: Außer der geänderten Stelle muss alles übereinstimmen.
 * Findet sich kein oder mehr als ein Feld (mit verschiedenem Wortlaut), wird nichts wiederhergestellt. Der Schritt
 * ersetzt dann das Feld (`replace-text`: Stichtag → nach dem Befehl) und ist vorwärts exakt prüfbar wie jeder andere.
 *
 * Nach der Rücknahme aller Änderungen muss der ganze zurückgerechnete Stichtagskörper **im Wortlaut** mit dem Stand der
 * Verkündungen übereinstimmen (`wordingAgreement`) – das verbindet beide Wege: rückwärts vom Portal, vorwärts aus den
 * Verkündungen.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { GazetteUnit } from './gazette.ts';
import type { FormulaId, ParsedDeletion } from './formulas.ts';
import { blockAt, blockCandidates, blockLabelMatches, formatPath, locateBlock, parseLocation, resolvePath, sentenceRange, type FieldRef, type LocationPath, type LocationStep } from './location.ts';
import { stableStringify, type ScopeRecord } from './recipe.ts';
import { quoteGroups, squash, textDelta, blockWording, type StructuralOperation } from './structural.ts';

export class RestoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RestoreError';
  }
}

/** Eine Verkündung, aus der der Stand am Stichtag gebaut ist. */
export interface RestorationSource {
  /** `base-publication`: Stammverkündung; `prior-amendment`: Änderung vor dem Stichtag, vorwärts angewandt. */
  role: 'base-publication' | 'prior-amendment';
  citation: string;
  url: string;
  sha256: string;
  retrievedAt?: string;
  /** Verkündungsdatum. */
  publishedAt?: string;
  /** Amtlichkeit: `electronic-official` (BayMBl. ab 2019, Amtsblätter 2009–2018) oder `printed-official` (GVBl.). */
  authority: string;
  representation: string;
  /** Inkrafttreten (nur Änderungen). */
  effectiveDate?: string;
}

/** Stand am Stichtag aus den Verkündungen. */
export interface PublicationBase {
  /** Blockmodell der Verkündung (ohne Kopf), am Stichtag. */
  body: NormBodyBlock[];
  sources: RestorationSource[];
  /** Umsetzer der Verkündungsseite (`baseline-only/html.ts`, `CONVERTER_VERSION`). */
  converter: string;
  /** SHA-256 des normalisierten Seitentexts der Stammverkündung (Ausgangstext-Fingerabdruck). */
  pageTextSha256: string;
  /** Fundstelle der Stammverkündung. */
  citation: string;
  /** Verkündungsdatum, wie die Stammverkündung es selbst druckt (für eine relative Inkrafttretensregel). */
  publishedAt?: string;
  /** Anhänge der Verkündung (PDF), wie die Seite sie listet (`publicationAttachments`). */
  attachments?: ReadonlyArray<{ label: string; url: string }>;
  /**
   * Heutiger Portalkörper der Norm (vor jeder Rücknahme) – nur, um die Portalgestalt wiederhergestellter Glieder aus der
   * ganzen Norm zu lernen (`learnedForm`); nie Teil des Rezepts. Fehlt er, gelten nur die Geschwisterglieder.
   */
  portal?: readonly NormBodyBlock[];
  /**
   * Darstellungskonventionen des Portals für dieses Amtsblatt, aus allen Normen der Schlange gelernt (`formConventions`) –
   * nur für Knotenarten, die die Norm selbst nicht belegt. Nie Teil des Rezepts.
   */
  conventions?: FormConventions;
}

/** Was ein nicht umkehrbarer Befehl über seinen Ort sagt. */
export type RestoreRequest =
  | { kind: 'delete-words'; words: string[]; locations: LocationPath[]; each: boolean }
  | { kind: 'repeal-sentences'; location: string; path: LocationPath; sentences: number[] }
  | { kind: 'recast-sentences'; location: string; path: LocationPath; sentences: number[]; text: string }
  /** Ganze Glieder: `targets` unter `context` (Neufassung: ersetzt durch die zitierten Glieder; Aufhebung: entfallen). */
  | { kind: 'recast-blocks' | 'repeal-blocks'; location: string; context: LocationPath; targets: LocationStep[]; groups: string[]; wording?: boolean }
  /** Der unbezeichnete Text vor dem ersten Glied (Vorbemerkung, Präambel, Einleitungsformel) neu gefasst. */
  | { kind: 'recast-vorspann'; location: string; groups: string[] }
  /** Lauf 8: Überschrift eines Glieds neu gefasst („Die Überschrift wird wie folgt gefasst:“ unter „Nr. 4 wird wie folgt geändert:“). */
  | { kind: 'recast-title'; location: string; path: LocationPath; groups: string[] };

export const deletionRequest = (item: ParsedDeletion): RestoreRequest => ({ kind: 'delete-words', words: item.words, locations: item.locations, each: item.each });

/* ------------------------------------------------------------------------------ Befehl lesen */

// Der Gegenstand steht vor der Schlussformel; „In Nr. 3 werden die Sätze 1 und 2 wie folgt gefasst:“ → „In Nr. 3 werden
// die Sätze 1 und 2“ (`subjectLocation` löst „In … werden“ auf).
const RECAST_PATTERNS: readonly RegExp[] = [
  /^(.+?)\s+(?:wie\s+folgt\s+(?:neu\s+)?gefasst|neu\s+gefasst|wie\s+folgt\s+ersetzt)\s*[:.]?$/u,
  /^(.+?)\s+(?:erhält|erhalten)\s+(?:folgende|die\s+folgende)\s+(?:neue\s+)?Fassung\s*[:.]?$/u,
  /^(.+?)\s+(?:erhält|erhalten)\s+folgenden\s+(?:neuen\s+)?Wortlaut\s*[:.]?$/u,
  // „Teil 1 Nr. 17.1 wird durch folgende Nr. 17.1 ersetzt:“, „In Abs. 2 wird Satz 3 durch die folgenden Sätze 3 bis 6 ersetzt:“
  /^(.+?)\s+durch\s+(?:(?:die|den|das)\s+)?folgenden?\s+[^„]*?\s+ersetzt\s*[:.]?$/u,
];
const REPEAL_PATTERNS: readonly RegExp[] = [/^(.+?)\s+(?:aufgehoben|gestrichen)\s*\.?$/u];

/** „Nrn. 1 bis 5“ → „Nrn. 1, 2, 3, 4 und 5“ (Zahlen, Dezimalstufen, Buchstaben) – sonst unverändert. */
function expandRanges(location: string): string {
  return location.replace(/(\d+(?:\.\d+)*|[a-z]{1,2})\s+bis\s+(\d+(?:\.\d+)*|[a-z]{1,2})(?![\p{L}\d.])/gu, (whole, from: string, to: string) => {
    const numeric = /^(.*?)(\d+)$/u;
    const left = numeric.exec(from);
    const right = numeric.exec(to);
    const values: string[] = [];
    if (left && right && left[1] === right[1] && Number(left[2]) < Number(right[2]) && Number(right[2]) - Number(left[2]) < 60) {
      for (let value = Number(left[2]); value <= Number(right[2]); value += 1) values.push(`${left[1]}${value}`);
    } else if (/^[a-z]$/u.test(from) && /^[a-z]$/u.test(to) && from < to) {
      for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) values.push(String.fromCharCode(code));
    } else if (/^([a-z])\1$/u.test(from) && /^([a-z])\1$/u.test(to) && from < to) {
      for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) values.push(String.fromCharCode(code).repeat(2));
    } else return whole;
    return `${values.slice(0, -1).join(', ')} und ${values.at(-1)}`;
  });
}

/** „In Nr. 3 werden die Sätze 1 und 2“ → „Nr. 3 Sätze 1 und 2“; Artikel und „bisherige/neue“ fallen weg. */
const ORDINALS: Readonly<Record<string, number>> = { erste: 1, zweite: 2, dritte: 3, vierte: 4, fünfte: 5, sechste: 6, siebte: 7, achte: 8, neunte: 9, zehnte: 10 };

function subjectLocation(subject: string): string {
  let text = subject.trim().replace(/^(?:In|Im)\s+(.+?)\s+(?:wird|werden)\s+/u, '$1 ').replace(/\s+(?:wird|werden)$/u, '');
  // „Der erste Satz“, „erster Spiegelstrich“ (BayMBl. 2024 Nr. 243, 2025 Nr. 543) → „Satz 1“, „Spiegelstrich 1“.
  text = text.replace(/(?:(?:der|die|das|den|dem)\s+)?(erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte|neunte|zehnte)[nrs]?\s+(Satz|Spiegelstrich|Spiegelsprich)(?![\p{L}])/giu, (_whole, ordinal: string, kind: string) => `${kind === 'Satz' ? 'Satz' : 'Spiegelstrich'} ${ORDINALS[ordinal.toLowerCase()]}`);
  // „Der bisherige Art. 9 wird Art. 10 und …“ ist eine Umnummerierung mit Neufassung – nicht hier.
  if (/\s(?:wird|werden)\s/u.test(` ${text} `)) return text;
  // „Satz 1 der Vorbemerkung“ / „Satz 3 des Abs. 2“: der Satz nach hinten.
  const genitive = /^((?:(?:die|der)\s+)?(?:bisherigen?\s+)?(?:Satz|Sätze)\s+\d+(?:\s*(?:,|und|bis)\s*\d+)*)\s+(?:der|des)\s+(.+)$/iu.exec(text);
  if (genitive) text = `${genitive[2]} ${genitive[1]}`;
  text = text.replace(/(?:^|\s)(?:die|der|das|den|dem)\s+/giu, ' ').replace(/(?:^|\s)(?:bisherigen?|neuen?)\s+/giu, ' ');
  return text.replace(/\s+/gu, ' ').trim();
}

function sentenceNumbersOf(list: string): number[] | undefined {
  // Mehrere, auch nicht zusammenhängende Sätze („Die Sätze 3 und 7 werden aufgehoben.“) – je Satz ein Bereich.
  const tokens = list.split(/\s*(?:,|und)\s*/u).map((token) => token.trim()).filter(Boolean);
  const numbers: number[] = [];
  for (const token of tokens) {
    const range = /^(\d+)\s*bis\s*(\d+)$/u.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) return undefined;
      for (let value = from; value <= to; value += 1) numbers.push(value);
      continue;
    }
    if (!/^\d+$/u.test(token)) return undefined;
    numbers.push(Number(token));
  }
  return [...new Set(numbers)].sort((left, right) => left - right);
}

/**
 * Neufassung oder Aufhebung → Anfrage an die Wiederherstellung, sonst ein Grund. Nur Sätze (Feldebene); ganze Glieder
 * bleiben offen (ihre Gestalt im Portal ist aus der Verkündung nicht bestimmt).
 */
export function restoreRequest(text: string, context: readonly LocationPath[], quoted: readonly GazetteUnit[], formula: FormulaId): RestoreRequest | { error: string } {
  const trimmed = text.trim();
  if (/\bjeweils\b/u.test(trimmed)) return { error: '„jeweils“ bei Neufassung oder Aufhebung' };
  const repeal = formula !== 'recast';
  const subject = (repeal ? REPEAL_PATTERNS : RECAST_PATTERNS).map((pattern) => pattern.exec(trimmed)).find(Boolean)?.[1];
  if (!subject) return { error: `Gegenstand der ${repeal ? 'Aufhebung' : 'Neufassung'} nicht lesbar` };
  if (/[„“]/u.test(subject)) return { error: 'Gegenstand mit Zitat' };
  if (repeal && quoted.length > 0) return { error: 'Aufhebung mit Zitat' };
  let groups: string[] = [];
  if (!repeal) {
    const read = quoteGroups(quoted);
    if (!read || read.length === 0) return { error: 'Neufassung ohne lesbares Zitat' };
    groups = read;
  }
  let location = subjectLocation(subject);
  const flatContext = context.flat();
  // „Der Satz erhält folgende neue Fassung:“ unter „In Nr. 4 Satz 2 …“, „Der Spiegelstrich …“: der Ort ist der Kontext.
  if (/^(?:Satz|Spiegelstrich)$/u.test(location) && flatContext.at(-1)?.kind === (location === 'Satz' ? 'satz' : 'spiegelstrich')) {
    const last = flatContext.at(-1)!;
    return restoreRequest(`${formatPath([last])} wird wie folgt gefasst:`, [flatContext.slice(0, -1)], quoted, formula);
  }
  // „Die Überschrift wird wie folgt gefasst:“ (unter „Nr. 4 wird wie folgt geändert:“), „Die Überschrift in Nr. 4 …“.
  const heading = /^Überschrift(?:\s+(?:in|zu|von|der|des)\s+(.+))?$/u.exec(location);
  if (heading) {
    if (repeal) return { error: 'Aufhebung einer Überschrift' };
    const own = heading[1] ? parseLocation(heading[1].replace(/^(?:der|des|dem)\s+/u, '')) : [[]];
    if (!own || own.length !== 1) return { error: `Ortsangabe „${heading[1]}“ nicht lesbar` };
    const path = [...flatContext, ...own[0]!];
    if (path.length === 0) return { error: 'Überschrift der Norm selbst (Titelzeile) – nicht aus der Verkündung' };
    if (groups.length !== 1) return { error: 'Neugefasste Überschrift nicht als ein Zitat lesbar' };
    return { kind: 'recast-title', location: `${formatPath(path)} Überschrift`, path, groups };
  }
  // „Der Wortlaut von Nr. 7.8 wird wie folgt neu gefasst:“ / „In Nr. 6.5 wird der Wortlaut wie folgt gefasst:“: der Inhalt
  // des Glieds ohne seine Überschrift (BayMBl. 2024 Nr. 313, 2026 Nr. 258).
  const wordingOnly = /^Wortlaut\s+(?:von|der|des)\s+/u.test(location) || /\sWortlaut$/u.test(location);
  location = location.replace(/^Wortlaut\s+(?:von|der|des)\s+/u, '').replace(/\s+Wortlaut$/u, '');
  const sentence = /^(.*?)(?:\s*,)?\s*(?:Satz|Sätze)\s+(\d+(?:\s*(?:,|und|bis)\s*\d+)*)$/u.exec(location);
  if (sentence) {
    const sentences = sentenceNumbersOf(sentence[2]!);
    if (!sentences) return { error: `Satzangabe „${sentence[2]}“ nicht lesbar` };
    const parents = parseLocation(sentence[1]!);
    if (!parents || parents.length !== 1) return { error: `Ortsangabe „${sentence[1]}“ nicht lesbar` };
    const path = [...context.flat(), ...parents[0]!];
    const label = `${formatPath(path)} ${sentences.length === 1 ? `Satz ${sentences[0]}` : `Sätze ${sentences.join(', ')}`}`.trim();
    if (repeal) return { kind: 'repeal-sentences', location: label, path, sentences };
    if (sentences.some((value, index) => index > 0 && value !== sentences[index - 1]! + 1)) return { error: 'Neufassung nicht zusammenhängender Sätze' };
    return { kind: 'recast-sentences', location: label, path, sentences, text: groups.join(' ') };
  }
  const paths = parseLocation(expandRanges(location));
  if (!paths || paths.length === 0) return { error: `Ortsangabe „${location}“ nicht lesbar` };
  if (paths.length === 1 && paths[0]!.length === 1 && paths[0]![0]!.kind === 'vorspann' && context.length === 0) {
    if (repeal) return { error: 'Aufhebung der Vorbemerkung' };
    return { kind: 'recast-vorspann', location: 'Vorbemerkung', groups };
  }
  // „Die Nrn. 6, 6.1 und 6.2 werden wie folgt gefasst:“ (BayMBl. 2021 Nr. 924): Glieder, die in der Dezimalgliederung unter
  // dem ersten stehen, sind Teil von ihm – gefasst wird das erste Glied als Ganzes.
  if (paths.length > 1 && paths.every((path) => path.length === paths[0]!.length && path.at(-1)!.kind === 'nummer')) {
    const head = paths[0]!.at(-1)!.value.replace(/\.$/u, '');
    if (paths.slice(1).every((path) => path.at(-1)!.value.startsWith(`${head}.`))) paths.splice(1);
  }
  // Mehrere Glieder: gleicher Kontext, letzte Stufe gleicher Art.
  const prefix = paths[0]!.slice(0, -1);
  const targets = paths.map((path) => path.at(-1)!);
  if (paths.some((path) => path.length !== paths[0]!.length || stableStringify(path.slice(0, -1)) !== stableStringify(prefix))) return { error: `„${location}“: Glieder mit verschiedenem Kontext` };
  if (targets.some((target) => target.kind !== targets[0]!.kind || !BLOCK_KINDS.has(target.kind))) return { error: `„${location}“: kein Glied (${targets.map((target) => target.kind).join(', ')})` };
  const full = [...context.flat(), ...prefix];
  if (wordingOnly && (repeal || targets.length !== 1)) return { error: `„${location}“: Wortlaut mehrerer Glieder oder Aufhebung des Wortlauts` };
  return { kind: repeal ? 'repeal-blocks' : 'recast-blocks', location: `${full.length > 0 ? formatPath(full) : ''} ${targets.map((target) => formatPath([target])).join(', ')}${wordingOnly ? ' (Wortlaut ohne Überschrift)' : ''}`.trim(), context: full, targets, groups, ...(wordingOnly ? { wording: true } : {}) };
}

const BLOCK_KINDS: ReadonlySet<string> = new Set(['nummer', 'absatz', 'buchstabe', 'doppelbuchstabe', 'spiegelstrich', 'paragraph', 'artikel', 'abschnitt', 'unterabschnitt', 'teil', 'anlage']);

/* ------------------------------------------------------------------------------ Felder */

interface FieldValue extends FieldRef {
  text: string;
}

function allFields(body: readonly NormBodyBlock[]): FieldValue[] {
  const out: FieldValue[] = [];
  const visit = (blocks: readonly NormBodyBlock[], prefix: number[]): void => {
    blocks.forEach((block, index) => {
      const path = [...prefix, index];
      if (typeof block.title === 'string') out.push({ path, key: 'title', text: block.title });
      if (typeof block.text === 'string') out.push({ path, key: 'text', text: block.text });
      if (block.children) visit(block.children, path);
    });
  };
  visit(body, []);
  return out;
}

const readText = (body: readonly NormBodyBlock[], ref: FieldRef): string | undefined => {
  let blocks = body;
  let block: NormBodyBlock | undefined;
  for (const index of ref.path) {
    block = blocks[index];
    if (!block) return undefined;
    blocks = block.children ?? [];
  }
  const value = block?.[ref.key];
  return typeof value === 'string' ? value : undefined;
};

/** Satzfolge `sentences` (zusammenhängend) in `text`: Bereich samt Satznummern; bis zur nächsten Satznummer. */
function sentenceSpan(text: string, sentences: readonly number[]): { start: number; end: number } | undefined {
  const first = sentenceRange(text, sentences[0]!);
  const last = sentenceRange(text, sentences.at(-1)!);
  if (!first || !last || last.end < first.start) return undefined;
  return { start: first.start, end: last.end };
}

/** Vorwärts: Wie wird aus dem Feld der Verkündung das heutige? `undefined`, wenn der Befehl dort nicht passt. */
function forwardSentences(before: string, request: Extract<RestoreRequest, { kind: 'repeal-sentences' | 'recast-sentences' }>): string | undefined {
  if (request.kind === 'repeal-sentences') {
    // Je Satz von hinten; nicht zusammenhängende Sätze einzeln.
    let text = before;
    for (const number of [...request.sentences].reverse()) {
      const span = sentenceRange(text, number);
      if (!span) return undefined;
      const head = text.slice(0, span.start);
      const tail = text.slice(span.end);
      text = tail === '' ? head.trimEnd() : `${head}${tail}`;
    }
    return text;
  }
  const span = sentenceSpan(before, request.sentences);
  if (!span) return undefined;
  const head = before.slice(0, span.start);
  const tail = before.slice(span.end);
  return tail === '' ? `${head}${request.text}` : `${head}${request.text} ${tail}`;
}

/** Alle Wortlaute nacheinander genau an einer Stelle gestrichen (mit dem Leerzeichen davor oder danach). */
function deletionVariants(before: string, words: readonly string[]): Set<string> {
  let states = new Set([before]);
  for (const word of words) {
    const next = new Set<string>();
    const needle = word.trim();
    if (needle === '') return new Set();
    for (const state of states) {
      for (let at = state.indexOf(needle); at >= 0; at = state.indexOf(needle, at + 1)) {
        const end = at + needle.length;
        // Das Wort muss als Ganzes stehen (kein Teil eines längeren Worts), außer es beginnt/endet mit einem Satzzeichen.
        const leftOk = at === 0 || !/[\p{L}\p{N}]/u.test(state[at - 1]!) || !/^[\p{L}\p{N}]/u.test(needle);
        const rightOk = end === state.length || !/[\p{L}\p{N}]/u.test(state[end]!) || !/[\p{L}\p{N}]$/u.test(needle);
        if (!leftOk || !rightOk) continue;
        if (at > 0 && state[at - 1] === ' ') next.add(`${state.slice(0, at - 1)}${state.slice(end)}`);
        if (state[end] === ' ') next.add(`${state.slice(0, at)}${state.slice(end + 1)}`);
        next.add(`${state.slice(0, at)}${state.slice(end)}`);
      }
    }
    states = next;
  }
  return states;
}

/**
 * Das Feld der Verkündung, aus dem durch den Befehl das heutige Feld `current` wird – gesucht über den ganzen Stand
 * der Verkündungen. Mehrere Felder mit **demselben** Wortlaut sind eindeutig (der Alttext ist derselbe).
 */
function sourceField(base: PublicationBase, current: string, forward: (before: string) => boolean): string[] {
  const hits = new Set<string>();
  for (const field of allFields(base.body)) if (forward(field.text)) hits.add(field.text);
  return [...hits];
}

/* ------------------------------------------------------------------------------ Schritte */

export interface RestoredStep {
  location: string;
  scope: ScopeRecord;
  operation: StructuralOperation;
  evidence: { baseline: string; current: string };
}

function scopeFields(working: readonly NormBodyBlock[], path: LocationPath, label: string): { fields: FieldRef[]; resolved: string[]; widened: string[] } {
  const resolved = resolvePath(working, path);
  if (!resolved.ok) throw new RestoreError('location-unresolved', `${label} ${formatPath(path)}: ${resolved.reason}`);
  return { fields: resolved.scope.fields, resolved: resolved.scope.resolved, widened: resolved.scope.widened };
}

/**
 * Setzt einen nicht umkehrbaren Befehl im Zustand unmittelbar nach ihm (`working`) zurück – mit dem Alttext aus den
 * Verkündungen. Liefert die Schritte (vorwärts: Stichtag → nach dem Befehl); `working` bleibt unverändert.
 */
export function realizeRestore(working: readonly NormBodyBlock[], base: PublicationBase, request: RestoreRequest, label: string): RestoredStep[] {
  const steps: RestoredStep[] = [];
  const restoreField = (location: string, path: LocationPath, forward: (before: string, current: string) => boolean, what: string): void => {
    const scope = scopeFields(working, path, label);
    const matches: Array<{ field: FieldRef; current: string; before: string }> = [];
    for (const field of scope.fields) {
      const current = readText(working, field);
      if (current === undefined) continue;
      for (const before of sourceField(base, current, (candidate) => forward(candidate, current))) matches.push({ field, current, before });
    }
    const befores = new Set(matches.map((match) => match.before));
    const fields = new Set(matches.map((match) => `${match.field.path.join('.')}:${match.field.key}`));
    if (matches.length === 0) throw new RestoreError('restore-not-found', `${label} ${location}: kein Feld der Verkündung (${base.citation}) wird durch ${what} zeichengleich zum heutigen Feld`);
    if (befores.size > 1 || fields.size > 1) throw new RestoreError('restore-ambiguous', `${label} ${location}: ${befores.size} Alttexte für ${fields.size} Feld(er) – nicht eindeutig`);
    const { field, current, before } = matches[0]!;
    if (before === current) throw new RestoreError('restore-no-change', `${label} ${location}: der Alttext ist der heutige Wortlaut`);
    steps.push({
      location,
      scope: { fields: [field], resolved: scope.resolved, widened: scope.widened },
      operation: { kind: 'replace-text', path: field.path, key: field.key, before, after: current },
      evidence: textDelta(before, current),
    });
  };
  switch (request.kind) {
    case 'delete-words': {
      if (request.locations.length > 1 && !request.each) throw new RestoreError('restore-ambiguous', `${label}: mehrere Orte ohne „jeweils“`);
      for (const path of request.locations) {
        try {
          restoreField(formatPath(path), path, (before, current) => before.length > current.length && deletionVariants(before, request.words).has(current), `Streichen von ${request.words.map((word) => `„${word}“`).join(', ')}`);
        } catch (error) {
          // Das Feld trägt noch weitere Änderungen (ältere Änderungen nach dem Stichtag, erst später zurückgenommen): Die
          // Stelle der Streichung bestimmt dann der Wortlaut **um** sie in der Verkündung (`anchoredDeletion`).
          if (!(error instanceof RestoreError) || error.code !== 'restore-not-found' || request.words.length !== 1) throw error;
          steps.push(anchoredDeletion(working, base, formatPath(path), path, request.words[0]!, label));
        }
      }
      return steps;
    }
    case 'repeal-sentences':
    case 'recast-sentences': {
      const what = request.kind === 'repeal-sentences' ? `Aufheben von ${request.location}` : `Neufassen von ${request.location}`;
      // Die Sätze gehören zu genau einem Feld des Glieds; aufgelöst wird das Glied, der Satz ist Teil der Probe.
      try {
        restoreField(request.location, request.path, (before, current) => forwardSentences(before, request) === current, what);
      } catch (error) {
        if (!(error instanceof RestoreError) || error.code !== 'restore-not-found' || request.kind !== 'repeal-sentences' || request.sentences.length !== 1) throw error;
        steps.push(anchoredSentence(working, base, request, label));
      }
      return steps;
    }
    case 'recast-blocks':
    case 'repeal-blocks':
      return [request.wording ? restoreWording(working, base, request, label) : restoreBlocks(working, base, request, label)];
    case 'recast-vorspann':
      return [restoreVorspann(working, base, request, label)];
    case 'recast-title':
      return [restoreTitle(working, base, request, label)];
  }
}

/**
 * Neugefasster Wortlaut eines Glieds ohne seine Überschrift: Das Glied der Verkündung wird in Portalgestalt gebracht (wie
 * beim Rückfall); seine Überschrift muss die heutige sein, sein Inhalt steht ganz in Untergliedern (kein eigener Text) –
 * dann werden nur diese ersetzt. Heute muss der Inhalt wörtlich das Zitat sein.
 */
function restoreWording(working: readonly NormBodyBlock[], base: PublicationBase, request: Extract<RestoreRequest, { kind: 'recast-blocks' | 'repeal-blocks' }>, label: string): RestoredStep {
  const where = `${label} ${request.location}`;
  const path = [...request.context, request.targets[0]!];
  const portal = locateBlock(working, path);
  if (!portal.ok || portal.path.length === 0) throw new RestoreError('location-unresolved', `${where}: im heutigen Text nicht eindeutig`);
  const current = blockAt(working, portal.path)!;
  if (typeof current.text === 'string' || !current.children || current.children.length === 0) throw new RestoreError('restore-shape', `${where}: das heutige Glied trägt eigenen Text oder keine Unterglieder`);
  if (squash(current.children.map((child) => blockWording(child).text).join(' ')) !== squash(request.groups.join(' '))) throw new RestoreError('restore-new-mismatch', `${where}: der heutige Wortlaut des Glieds ist nicht wörtlich das Zitat`);
  const unit = restoreUnit(working, base, { steps: path, blockPath: portal.path }, label);
  const restored = (unit.operation as Extract<StructuralOperation, { kind: 'replace-blocks' }>).before[0]!;
  if ((restored.title ?? '') !== (current.title ?? '') || restored.label !== current.label || typeof restored.text === 'string' || !restored.children) throw new RestoreError('restore-shape', `${where}: Überschrift oder Gestalt des Glieds der Verkündung weicht vom heutigen Glied ab`);
  const before = restored.children;
  const after = structuredClone(current.children) as NormBodyBlock[];
  return {
    location: request.location,
    scope: { fields: [], resolved: [request.location], widened: [] },
    operation: { kind: 'replace-blocks', parent: portal.path, index: 0, before, after },
    evidence: textDelta(before.map((block) => blockWording(block).text).join(' '), after.map((block) => blockWording(block).text).join(' ')),
  };
}

/**
 * Neugefasste Überschrift eines Glieds: Das Glied steht in Verkündung und heutigem Text unter derselben Ortsangabe; heute
 * trägt es genau die zitierte Überschrift, in der Verkündung die bisherige – als Überschrift, oder (BayMBl.: „4. Förderung“)
 * als überschriftartiger Text des Glieds, den das Portal als Überschrift führt.
 */
function restoreTitle(working: readonly NormBodyBlock[], base: PublicationBase, request: Extract<RestoreRequest, { kind: 'recast-title' }>, label: string): RestoredStep {
  const where = `${label} ${request.location}`;
  const portal = locateBlock(working, request.path);
  if (!portal.ok || portal.path.length === 0) throw new RestoreError('location-unresolved', `${where}: im heutigen Text nicht eindeutig`);
  const current = blockAt(working, portal.path)!;
  if (typeof current.title !== 'string' || typography(current.title) !== typography(request.groups[0]!)) throw new RestoreError('restore-new-mismatch', `${where}: die heutige Überschrift ist nicht wörtlich die zitierte`);
  const publication = locateBlock(base.body, request.path);
  if (!publication.ok || publication.path.length === 0) throw notFound(base, request.path, where);
  const old = blockAt(base.body, publication.path)!;
  const before = typeof old.title === 'string' ? old.title : typeof old.text === 'string' && textClass(old.text) === '|überschriftartig' ? old.text : undefined;
  if (before === undefined) throw new RestoreError('restore-not-found', `${where}: das Glied der Verkündung trägt keine Überschrift`);
  if (before === current.title) throw new RestoreError('restore-no-change', `${where}: die Überschrift der Verkündung ist die heutige`);
  return {
    location: request.location,
    scope: { fields: [{ path: portal.path, key: 'title' }], resolved: portal.resolved, widened: portal.widened },
    operation: { kind: 'replace-text', path: portal.path, key: 'title', before, after: current.title },
    evidence: textDelta(before, current.title),
  };
}

/* ---------------------------------------------------------------- Stelle über den umgebenden Wortlaut */

/** Wortgrenze: nicht mitten in einem Wort beginnen oder enden. */
const trimToWords = (value: string, side: 'left' | 'right'): string => {
  if (side === 'left') {
    const at = value.search(/\s/u);
    return at >= 0 && at < value.length - 1 ? value.slice(at + 1) : value;
  }
  const at = value.lastIndexOf(' ');
  return at > 0 ? value.slice(0, at) : value;
};

/**
 * Streichung ohne Anker in einem Feld, das noch andere Änderungen trägt: In der Verkündung steht der gestrichene Wortlaut
 * genau einmal; der Wortlaut unmittelbar davor und danach (je bis 40 Zeichen, an Wortgrenzen) steht im heutigen Feld
 * genau einmal **ohne** ihn dazwischen. Dort wird er wieder eingesetzt. Die übrigen Unterschiede des Feldes bleiben der
 * Rücknahme der übrigen Änderungen und der Probe im Wortlaut überlassen.
 */
function anchoredDeletion(working: readonly NormBodyBlock[], base: PublicationBase, location: string, path: LocationPath, word: string, label: string): RestoredStep {
  const needle = word.trim();
  const scope = scopeFields(working, path, label);
  const found: Array<{ field: FieldRef; current: string; before: string }> = [];
  for (const source of allFields(base.body)) {
    const hits: number[] = [];
    for (let at = source.text.indexOf(needle); at >= 0; at = source.text.indexOf(needle, at + 1)) hits.push(at);
    for (const at of hits) {
      const leftRaw = source.text.slice(Math.max(0, at - 40), at);
      const rightRaw = source.text.slice(at + needle.length, at + needle.length + 40);
      const left = at - 40 > 0 ? trimToWords(leftRaw, 'left') : leftRaw;
      const right = at + needle.length + 40 < source.text.length ? trimToWords(rightRaw, 'right') : rightRaw;
      if (left.trim() === '' && right.trim() === '') continue;
      // Der Leerraum um den Wortlaut in der Verkündung bestimmt, was mit ihm gestrichen wurde.
      const variants = [
        { current: `${left.replace(/\s+$/u, '')}${right.startsWith(' ') ? '' : left.endsWith(' ') ? ' ' : ''}${right}`, inserted: `${left}${needle}${right}` },
        { current: `${left}${right.replace(/^\s+/u, '')}`, inserted: `${left}${needle}${right}` },
      ];
      for (const field of scope.fields) {
        const current = readText(working, field);
        if (current === undefined) continue;
        for (const variant of new Set(variants.map((entry) => JSON.stringify(entry)))) {
          const { current: shortened, inserted } = JSON.parse(variant) as { current: string; inserted: string };
          const first = current.indexOf(shortened);
          if (first < 0 || current.indexOf(shortened, first + 1) >= 0) continue;
          found.push({ field, current, before: `${current.slice(0, first)}${inserted}${current.slice(first + shortened.length)}` });
        }
      }
    }
  }
  const befores = new Set(found.map((entry) => `${entry.field.path.join('.')}:${entry.field.key}:${entry.before}`));
  if (befores.size !== 1) throw new RestoreError(befores.size === 0 ? 'restore-not-found' : 'restore-ambiguous', `${label} ${location}: Stelle von „${needle.slice(0, 60)}“ über den umgebenden Wortlaut der Verkündung ${befores.size === 0 ? 'nicht gefunden' : 'nicht eindeutig'}`);
  const { field, current, before } = found[0]!;
  return {
    location: `${location} (Stelle nach dem umgebenden Wortlaut der Verkündung)`,
    scope: { fields: [field], resolved: scope.resolved, widened: scope.widened },
    operation: { kind: 'replace-text', path: field.path, key: field.key, before, after: current },
    evidence: textDelta(before, current),
  };
}

/**
 * Aufgehobener Satz in einem Feld, das noch andere Änderungen trägt: Der Satz kommt aus dem Feld der Verkündung, dessen
 * Satz davor (oder danach) im heutigen Feld wörtlich steht; eingesetzt wird er vor der Satznummer des folgenden Satzes
 * (oder am Ende).
 */
function anchoredSentence(working: readonly NormBodyBlock[], base: PublicationBase, request: Extract<RestoreRequest, { kind: 'repeal-sentences' }>, label: string): RestoredStep {
  const number = request.sentences[0]!;
  const scope = scopeFields(working, request.path, label);
  const sentenceText = (text: string, value: number): string | undefined => {
    const range = sentenceRange(text, value);
    return range ? text.slice(range.start, range.end).trim() : undefined;
  };
  const found: Array<{ field: FieldRef; current: string; before: string }> = [];
  for (const field of scope.fields) {
    const current = readText(working, field);
    if (current === undefined) continue;
    const previous = number > 1 ? sentenceText(current, number - 1) : undefined;
    const nextMarker = sentenceRange(current, number + 1);
    if (sentenceRange(current, number)) continue;
    for (const source of allFields(base.body)) {
      const repealed = sentenceText(source.text, number);
      if (!repealed) continue;
      const sourcePrevious = number > 1 ? sentenceText(source.text, number - 1) : undefined;
      const sourceNext = sentenceText(source.text, number + 1);
      const anchoredBefore = previous !== undefined && sourcePrevious !== undefined && previous === sourcePrevious;
      const anchoredAfter = nextMarker !== undefined && sourceNext !== undefined && current.slice(nextMarker.start, nextMarker.end).trim() === sourceNext;
      if (!anchoredBefore && !anchoredAfter) continue;
      let before: string;
      if (nextMarker) before = `${current.slice(0, nextMarker.start)}${repealed} ${current.slice(nextMarker.start)}`;
      else if (previous !== undefined) before = `${current.trimEnd()} ${repealed}`;
      else continue;
      found.push({ field, current, before });
    }
  }
  let where = 'Stelle nach dem Nachbarsatz der Verkündung';
  if (found.length === 0) {
    // Der Nachbarsatz ist selbst geändert (ein älterer Befehl derselben Änderung, erst danach zurückgenommen): War der
    // aufgehobene Satz der letzte seines Glieds in der Verkündung und trägt das Glied heute genau die Sätze davor, steht er
    // am Ende. Das Glied der Verkündung ergibt sich aus der Ortsangabe, nicht aus dem Wortlaut.
    const located = locateBlock(base.body, request.path);
    const sources = located.ok && located.path.length > 0 ? allFields([blockAt(base.body, located.path)!]).filter((source) => sentenceText(source.text, number) !== undefined && sentenceRange(source.text, number + 1) === undefined) : [];
    const targets = scope.fields.map((field) => ({ field, current: readText(working, field) })).filter((entry): entry is { field: FieldRef; current: string } => entry.current !== undefined && number > 1 && sentenceRange(entry.current, number - 1) !== undefined && sentenceRange(entry.current, number) === undefined);
    if (sources.length === 1 && targets.length === 1) {
      found.push({ field: targets[0]!.field, current: targets[0]!.current, before: `${targets[0]!.current.trimEnd()} ${sentenceText(sources[0]!.text, number)!}` });
      where = 'letzter Satz des Glieds in der Verkündung, Stelle am Ende';
    }
  }
  const befores = new Set(found.map((entry) => `${entry.field.path.join('.')}:${entry.before}`));
  if (befores.size !== 1) throw new RestoreError(befores.size === 0 ? 'restore-not-found' : 'restore-ambiguous', `${label} ${request.location}: aufgehobener Satz über den Nachbarsatz der Verkündung ${befores.size === 0 ? 'nicht gefunden' : 'nicht eindeutig'}`);
  const { field, current, before } = found[0]!;
  return {
    location: `${request.location} (${where})`,
    scope: { fields: [field], resolved: scope.resolved, widened: scope.widened },
    operation: { kind: 'replace-text', path: field.path, key: field.key, before, after: current },
    evidence: textDelta(before, current),
  };
}

/* ------------------------------------------------------------------------------ Glieder */

interface Token {
  key: 'label' | 'title' | 'text';
  value: string;
}

/** Bezeichnung, Überschrift und Text jedes Glieds in Leserichtung. */
function tokensOf(block: NormBodyBlock): Token[] {
  const out: Token[] = [];
  const visit = (entry: NormBodyBlock): void => {
    for (const key of ['label', 'title', 'text'] as const) if (typeof entry[key] === 'string') out.push({ key, value: entry[key]! });
    for (const child of entry.children ?? []) visit(child);
  };
  visit(block);
  return out;
}

/** Gestalt eines Glieds: Typ, belegte Felder, Gestalt der Unterglieder (ohne Wortlaut). */
function shapeOf(block: NormBodyBlock): string {
  const own = [block.type, ...(['label', 'title', 'text'] as const).filter((key) => typeof block[key] === 'string')].join('+');
  return `${own}(${(block.children ?? []).map(shapeOf).join(',')})`;
}

const sameWording = (left: readonly Token[], right: readonly Token[]): boolean => left.length === right.length && left.every((token, index) => typography(token.value) === typography(right[index]!.value));

/**
 * Das Glied der Verkündung `old` in der Gestalt des Portals – nach dem Vorbild eines Geschwisterglieds, dessen
 * Verkündungsgestalt dieselbe ist und das im Portal denselben Wortlaut trägt (Probe: Gestalt und Wortlaut gleich). Die
 * Felder des Vorbilds werden der Reihe nach mit dem Wortlaut von `old` besetzt; sonst nichts.
 */
function portalShape(old: NormBodyBlock, pairs: ReadonlyArray<{ publication: NormBodyBlock; portal: NormBodyBlock }>): NormBodyBlock | undefined {
  const tokens = tokensOf(old);
  const shape = shapeOf(old);
  for (const { publication, portal } of pairs) {
    if (shapeOf(publication) !== shape) continue;
    const portalTokens = tokensOf(portal);
    if (!sameWording(tokensOf(publication), portalTokens)) continue;
    if (portalTokens.length !== tokens.length) continue;
    // Bezeichnungen stehen an denselben Stellen.
    if (portalTokens.some((token, index) => (token.key === 'label') !== (tokens[index]!.key === 'label'))) continue;
    const copy = structuredClone(portal) as NormBodyBlock;
    let at = 0;
    const fill = (entry: NormBodyBlock): void => {
      for (const key of ['label', 'title', 'text'] as const) if (typeof entry[key] === 'string') entry[key] = tokens[at++]!.value;
      for (const child of entry.children ?? []) fill(child);
    };
    fill(copy);
    return copy;
  }
  return undefined;
}

const PLACEHOLDER = /^\(?(?:aufgehoben|weggefallen|gestrichen|entfallen|außer\s+Kraft)\)?\.?$/u;

/** Kinder unter `parent` (Indexpfad; `[]` = oberste Ebene). */
const childrenAt = (body: readonly NormBodyBlock[], parent: readonly number[]): readonly NormBodyBlock[] => (parent.length === 0 ? body : (blockAt(body, parent)?.children ?? []));

/** Glied mit Bezeichnung `step` unmittelbar unter `parent` – genau eines. */
function childIndex(body: readonly NormBodyBlock[], parent: readonly number[], step: LocationStep): number | undefined {
  const hits = childrenAt(body, parent).map((block, index) => ({ block, index })).filter(({ block }) => blockLabelMatches(block, step));
  return hits.length === 1 ? hits[0]!.index : undefined;
}

/**
 * Eltern-Glied über die Überschrift, wenn seine Bezeichnung seit dem Stichtag gewechselt hat („Der bisherige Art. 7 wird
 * Art. 8“ in derselben Änderung): das Glied der Verkündung mit gleichem Typ und gleicher Überschrift – genau eines –, unter
 * dem das Ziel steht.
 */
function parentByTitle(working: readonly NormBodyBlock[], publication: readonly NormBodyBlock[], context: LocationPath, first: LocationStep): number[] | undefined {
  const located = locateBlock(working, context);
  if (!located.ok || located.path.length === 0) return undefined;
  const portalParent = blockAt(working, located.path);
  if (!portalParent || typeof portalParent.title !== 'string' || portalParent.title.trim() === '') return undefined;
  const hits: number[][] = [];
  const visit = (blocks: readonly NormBodyBlock[], prefix: number[]): void => {
    blocks.forEach((block, index) => {
      const path = [...prefix, index];
      if (block.type === portalParent.type && typeof block.title === 'string' && typography(block.title) === typography(portalParent.title!)) hits.push(path);
      if (block.children) visit(block.children, path);
    });
  };
  visit(publication, []);
  if (hits.length !== 1) return undefined;
  return childIndex(publication, hits[0]!, first) !== undefined ? hits[0]! : undefined;
}

/**
 * Das Eltern-Glied der Verkündung im heutigen Text, über die Bezeichnungen seiner Vorfahren – je Ebene genau ein Glied
 * gleicher Bezeichnung und gleichen Typs. Für aufgehobene Glieder, deren Bezeichnung im heutigen Text fehlt oder ein
 * anderes Glied trägt („Nr. 3.6 wird aufgehoben. – Die bisherige Nr. 3.7 wird Nr. 3.6.“): Der Kontext des Befehls
 * („Nr. 3.6“ ohne Eltern) führt dort nicht zum Abschnitt „3.“.
 */
function mirrorParent(publication: readonly NormBodyBlock[], publicationParent: readonly number[], working: readonly NormBodyBlock[]): number[] | undefined {
  const path: number[] = [];
  let publicationLevel: readonly NormBodyBlock[] = publication;
  let workingLevel: readonly NormBodyBlock[] = working;
  for (const position of publicationParent) {
    const block = publicationLevel[position];
    if (!block || typeof block.label !== 'string') return undefined;
    const own = publicationLevel.filter((entry) => entry.label === block.label);
    const hits = workingLevel.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.label === block.label && entry.type === block.type);
    if (own.length !== 1 || hits.length !== 1) return undefined;
    path.push(hits[0]!.index);
    publicationLevel = block.children ?? [];
    workingLevel = hits[0]!.entry.children ?? [];
  }
  return path;
}

/** Eltern-Glied der Ziele: aufgelöster Kontext; die Ziele müssen seine unmittelbaren Kinder sein. */
function parentOf(body: readonly NormBodyBlock[], context: LocationPath, first: LocationStep): number[] | undefined {
  const located = locateBlock(body, context);
  if (!located.ok) return undefined;
  if (childIndex(body, located.path, first) !== undefined) return located.path;
  // Das Glied steht tiefer (Verkündung ohne die Zwischenebene): über die flachste Fundstelle.
  const candidates = blockCandidates(body, context, first);
  if (!candidates || candidates.length !== 1) return undefined;
  return candidates[0]!.slice(0, -1);
}

function restoreBlocks(working: readonly NormBodyBlock[], base: PublicationBase, request: Extract<RestoreRequest, { kind: 'recast-blocks' | 'repeal-blocks' }>, label: string): RestoredStep {
  const where = `${label} ${request.location}`;
  // Verkündung: die bisherigen Glieder, aufeinanderfolgend unter einem Eltern-Glied.
  const publicationParent = parentOf(base.body, request.context, request.targets[0]!) ?? parentByTitle(working, base.body, request.context, request.targets[0]!);
  if (!publicationParent) throw notFound(base, [...request.context, request.targets[0]!], where);
  const publicationIndices = request.targets.map((target) => childIndex(base.body, publicationParent, target));
  if (publicationIndices.some((index) => index === undefined) || publicationIndices.some((index, position) => position > 0 && index !== publicationIndices[position - 1]! + 1)) throw new RestoreError('restore-not-found', `${where}: die Glieder stehen in der Verkündung nicht aufeinanderfolgend`);
  const publicationSiblings = childrenAt(base.body, publicationParent);
  const old = publicationIndices.map((index) => publicationSiblings[index!]!);

  // Portal: Eltern-Glied und Stelle.
  const portalParent = parentOf(working, request.context, request.targets[0]!) ?? mirrorParent(base.body, publicationParent, working) ?? (() => {
    const located = locateBlock(working, request.context);
    return located.ok ? located.path : undefined;
  })();
  if (!portalParent) throw new RestoreError('location-unresolved', `${where}: im heutigen Text nicht aufgelöst`);
  const portalSiblings = childrenAt(working, portalParent);
  let index: number;
  let after: NormBodyBlock[];
  if (request.kind === 'recast-blocks') {
    const first = childIndex(working, portalParent, request.targets[0]!);
    if (first === undefined) throw new RestoreError('location-unresolved', `${where}: neu gefasstes Glied im heutigen Text nicht eindeutig`);
    // Die neu gefassten Glieder: so viele, wie der Befehl zitiert; ihr Wortlaut muss dem Zitat gleichen.
    let count = 0;
    let wording = '';
    const target = squash(request.groups.join(' '));
    while (first + count < portalSiblings.length && wording.length < target.length) {
      wording += squash(blockWording(portalSiblings[first + count]!).text);
      count += 1;
    }
    if (wording !== target) throw new RestoreError('restore-new-mismatch', `${where}: das neu gefasste Glied im heutigen Text ist nicht wörtlich der zitierte Wortlaut`);
    index = first;
    after = portalSiblings.slice(first, first + count).map((block) => structuredClone(block) as NormBodyBlock);
  } else {
    // Aufgehoben: nicht mehr da oder als Platzhalter „(aufgehoben)“.
    const present = request.targets.map((target) => childIndex(working, portalParent, target));
    if (present.every((position) => position !== undefined)) {
      const blocks = present.map((position) => portalSiblings[position!]!);
      if (!blocks.every((block) => (block.children ?? []).length === 0 && PLACEHOLDER.test(String(block.text ?? '').trim())) || present.some((position, at) => at > 0 && position !== present[at - 1]! + 1)) throw new RestoreError('restore-new-mismatch', `${where}: das aufgehobene Glied steht noch im heutigen Text`);
      index = present[0]!;
      after = blocks.map((block) => structuredClone(block) as NormBodyBlock);
    } else if (present.some((position) => position !== undefined)) {
      throw new RestoreError('restore-new-mismatch', `${where}: ein Teil der aufgehobenen Glieder steht noch im heutigen Text`);
    } else {
      // Stelle: hinter dem Glied, das in der Verkündung unmittelbar davor steht (sonst vor dem danach).
      const before = publicationSiblings[publicationIndices[0]! - 1];
      const next = publicationSiblings[publicationIndices.at(-1)! + 1];
      const anchor = (block: NormBodyBlock | undefined): number | undefined => {
        if (!block || typeof block.label !== 'string') return undefined;
        const hits = portalSiblings.map((entry, position) => ({ entry, position })).filter(({ entry }) => entry.label === block.label && sameWording(tokensOf(entry), tokensOf(block)));
        if (hits.length === 1) return hits[0]!.position;
        // Das Nachbarglied kann selbst später geändert sein: dann genügt seine Bezeichnung, wenn sie genau einmal vorkommt
        // (die Probe im Wortlaut prüft die Stelle am Ende).
        const labelled = portalSiblings.map((entry, position) => ({ entry, position })).filter(({ entry }) => entry.label === block.label);
        return labelled.length === 1 ? labelled[0]!.position : undefined;
      };
      const previous = anchor(before);
      const following = anchor(next);
      // Der vorangehende Absatz ist der erste und hat seine Bezeichnung verloren („In Abs. 1 wird die Absatzbezeichnung
      // „(1)“ gestrichen.“ in derselben Änderung): Heute trägt die Vorschrift keinen bezeichneten Absatz; der Wortlaut von
      // Abs. 1 ist ihr ganzer Inhalt – die aufgehobenen folgen ihm.
      const unlabelledFirst = before !== undefined && typeof before.label === 'string' && /^\(1\)$/u.test(before.label.trim()) && publicationIndices[0] === 1 && next === undefined && portalSiblings.length > 0 && portalSiblings.every((entry) => entry.type !== 'subparagraph');
      if (previous !== undefined) index = previous + 1;
      else if (following !== undefined) index = following;
      else if (unlabelledFirst) index = portalSiblings.length;
      else if (publicationIndices[0] === 0 && portalSiblings.length === 0) index = 0;
      else throw new RestoreError('restore-position', `${where}: Stelle des aufgehobenen Glieds im heutigen Text nicht bestimmt (kein gleichlautendes Nachbarglied)`);
      after = [];
    }
  }

  // Gestalt des Portals: gleiche Darstellung der Geschwister, sonst nach einem gleich gestalteten Geschwisterglied.
  const pairs = siblingPairs(publicationSiblings, portalSiblings, new Set(publicationIndices as number[]));
  const gaps: string[] = [];
  const conventions: string[] = [];
  const before = old.map((block) => {
    const sibling = portalForm(block, pairs);
    if (sibling) return sibling;
    const learned = learnedForm(block, base, publicationParent);
    gaps.push(...learned.gaps);
    conventions.push(...learned.conventions);
    return learned.block;
  });
  if (before.some((block) => block === undefined)) throw new RestoreError('restore-shape', `${where}: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Gestalt und gleichem Wortlaut in Verkündung und Portal${gaps.length > 0 ? `; ${gaps.join(', ')}` : ''}`);
  const restored = before as NormBodyBlock[];
  return {
    location: `${request.location}${conventionNote(conventions)}`,
    scope: { fields: [], resolved: [request.location], widened: [] },
    operation: { kind: 'replace-blocks', parent: portalParent, index, before: restored, after },
    evidence: { baseline: restored.map((block) => blockWording(block).text).join(' ').slice(0, 300), current: after.length === 0 ? '(aufgehoben)' : after.map((block) => blockWording(block).text).join(' ').slice(0, 300) },
  };
}

/** Vorbemerkung: die unbezeichneten Textglieder am Anfang (im Portal nach dem Rahmen). */
function leadingTexts(body: readonly NormBodyBlock[], skipFrame: boolean): { start: number; blocks: NormBodyBlock[] } {
  const start = skipFrame ? portalCoreStart(body) : 0;
  const blocks: NormBodyBlock[] = [];
  for (let at = start; at < body.length; at += 1) {
    const block = body[at]!;
    if (block.type !== 'paragraphText' || block.label !== undefined || block.title !== undefined || block.children !== undefined || typeof block.text !== 'string') break;
    blocks.push(block);
  }
  return { start, blocks };
}

function restoreVorspann(working: readonly NormBodyBlock[], base: PublicationBase, request: Extract<RestoreRequest, { kind: 'recast-vorspann' }>, label: string): RestoredStep {
  const where = `${label} ${request.location}`;
  const portal = leadingTexts(working, true);
  const publication = leadingTexts(base.body, false);
  if (portal.blocks.length === 0 || publication.blocks.length === 0) throw new RestoreError('restore-not-found', `${where}: keine Vorbemerkung im heutigen Text oder in der Verkündung`);
  if (squash(portal.blocks.map((block) => block.text).join(' ')) !== squash(request.groups.join(' '))) throw new RestoreError('restore-new-mismatch', `${where}: die heutige Vorbemerkung ist nicht wörtlich der zitierte Wortlaut`);
  return {
    location: request.location,
    scope: { fields: [], resolved: ['Vorbemerkung (unbezeichneter Text vor dem ersten Glied)'], widened: [] },
    operation: { kind: 'replace-blocks', parent: [], index: portal.start, before: publication.blocks.map((block) => ({ type: 'paragraphText', text: block.text! }) as NormBodyBlock), after: portal.blocks.map((block) => structuredClone(block) as NormBodyBlock) },
    evidence: { baseline: publication.blocks.map((block) => block.text).join(' ').slice(0, 300), current: portal.blocks.map((block) => block.text).join(' ').slice(0, 300) },
  };
}

/* ------------------------------------------------------------------------ Probe im Wortlaut */

/** Typografische Vereinheitlichung für den Vergleich Portal ↔ Verkündung – nur für die Probe, nie für den Text. */
export const TYPOGRAPHY_NORMALIZATION = 'Anführungszeichen („“”‚‘’"\') → "; Binde-, Gedanken-, Minus- und Rahmenstriche → -; hochgestellte Satznummern entfernt (nicht vor ⁾ oder „)“), übrige hochgestellte Ziffern → Ziffern, ⁾ → ); Trennstrich am Zeilenende vor Kleinbuchstaben zusammengezogen („Lern- ergebnisse“; nicht vor und, oder, bzw., sowie, als, bis, wie); × → x; Leerraum entfernt';

const typography = (value: string): string =>
  value
    .replace(/[„“”‚‘’"'«»›‹]/gu, '"')
    .replace(/[‐‑‒–—−─-]/gu, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/gu, (character) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(character)))
    .replace(/⁾/gu, ')')
    .replace(/×/gu, 'x')
    .replace(/\s+/gu, '');

/**
 * Vereinheitlichung für die Probe (`TYPOGRAPHY_NORMALIZATION`): zusätzlich zu `typography` die Satznummern, die das
 * Portal auch dort setzt, wo die Verkündung keine druckt (GVBl. 2022 S. 553, § 5 Abs. 1), und der Trennstrich einer
 * Zeilentrennung, den eine Verkündung stehen ließ (GVBl. 2018 S. 264, § 11 Abs. 1 „Lern- ergebnisse“). Beides auf
 * beiden Seiten, nur für den Vergleich.
 */
const LINE_BREAK_HYPHEN = /(\p{L})[-‐‑]\s+(?!(?:und|u|oder|bzw|sowie|als|bis|wie|noch|beziehungsweise|respektive|resp)(?![\p{L}]))(?=\p{Ll})/gu;
const proofTypography = (value: string): string => typography(value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?![⁾)⁰¹²³⁴⁵⁶⁷⁸⁹])/gu, '').replace(LINE_BREAK_HYPHEN, '$1'));

/** Wortlaut in Leserichtung: Bezeichnung, Überschrift, Text je Glied. */
function wordingOf(blocks: readonly NormBodyBlock[]): string {
  const parts: string[] = [];
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      for (const value of [block.label, block.title, block.text]) if (typeof value === 'string') parts.push(value);
      if (block.children) visit(block.children);
    }
  };
  visit(blocks);
  return parts.join(' ');
}

const HEAD_TEXT = /^(?:Gemeinsame\s+)?(?:Bekanntmachung(?:en)?|Richtlinien?|Verwaltungsvorschrift(?:en)?|Schreiben|Anordnung|Erlass)\b[\s\S]*\bvom\s/u;
const REFERENCE_TEXT = /^\((?:BayMBl|AllMBl|AIIMBl|KWMBl|FMBl|JMBl|StAnz|GVBl|MABl|LUMBl)\.?[^)]*\)$/u;

/** Beginn des Portalkörpers ohne Rahmen: nach Kopfblock, Erlassstelle mit Datum und Fundstellen. */
function portalCoreStart(body: readonly NormBodyBlock[]): number {
  let start = 0;
  if (body[0]?.type === 'heading') start = 1;
  while (start < body.length && body[start]!.type === 'paragraphText' && !body[start]!.children && typeof body[start]!.text === 'string' && (HEAD_TEXT.test(body[start]!.text!) || REFERENCE_TEXT.test(body[start]!.text!.trim()))) start += 1;
  return start;
}

/** Ende des Portalkörpers ohne Rahmen: vor der Schlussformel. */
function portalCoreEnd(body: readonly NormBodyBlock[]): number {
  const start = portalCoreStart(body);
  const end = body.findIndex((block, index) => index >= start && !block.label && block.title === 'Schlussformel');
  return end < 0 ? body.length : end;
}

/** Schlussformel des Portals (Unterschrift), soweit vorhanden. */
function portalClosing(body: readonly NormBodyBlock[]): NormBodyBlock[] {
  const end = portalCoreEnd(body);
  const closing = body[end];
  return closing && closing.title === 'Schlussformel' ? (closing.children ?? []) : [];
}

/** Portalkörper ohne Rahmen: Kopfblock, Erlassstelle mit Datum, Fundstellen vorn; Schlussformel und alles danach. */
export function portalCore(body: readonly NormBodyBlock[]): NormBodyBlock[] {
  return body.slice(portalCoreStart(body), portalCoreEnd(body));
}

/** Blockmodell der Verkündung ohne Unterschrift und alles danach (Anlagenhinweise, Verteiler). */
export function publicationCore(body: readonly NormBodyBlock[]): NormBodyBlock[] {
  const end = body.findIndex((block) => (block.type as string) === 'signature');
  return body.slice(0, end < 0 ? body.length : end);
}

export interface WordingAgreement {
  ok: boolean;
  /** Verglichene Zeichen (vereinheitlicht). */
  characters: number;
  detail: string;
}

/**
 * Stimmt der zurückgerechnete Stichtagskörper (Portalgestalt) im Wortlaut mit dem Stand der Verkündungen überein?
 * Verglichen wird der ganze Text ohne Rahmen, typografisch vereinheitlicht (`TYPOGRAPHY_NORMALIZATION`); jede
 * Abweichung im Wortlaut – ein Wort, eine Zahl, ein Satzzeichen – ist ein Widerspruch.
 */
export function wordingAgreement(baselineBody: readonly NormBodyBlock[], base: PublicationBase): WordingAgreement {
  const portal = proofTypography(wordingOf(portalCore(baselineBody)));
  const publication = proofTypography(wordingOf(publicationCore(base.body)));
  if (portal === publication) return { ok: true, characters: portal.length, detail: `Wortlaut gleich (${portal.length} Zeichen, typografisch vereinheitlicht)` };
  // Die Unterschrift steht in der Verkündung manchmal als letzter Absatz statt als Unterschrift; das Portal führt sie in
  // der Schlussformel. Genau dieser Überhang ist kein Unterschied im Wortlaut der Vorschrift.
  const closing = proofTypography(wordingOf(portalClosing(baselineBody)));
  if (publication.startsWith(portal) && publication.length > portal.length && closing.startsWith(publication.slice(portal.length))) {
    return { ok: true, characters: portal.length, detail: `Wortlaut gleich (${portal.length} Zeichen, typografisch vereinheitlicht); in der Verkündung folgt die Unterschrift als Absatz („${publication.slice(portal.length, portal.length + 60)}“), im Portal in der Schlussformel` };
  }
  let at = 0;
  while (at < portal.length && at < publication.length && portal[at] === publication[at]) at += 1;
  return {
    ok: false,
    characters: at,
    detail: `Stichtagskörper (Portal, zurückgerechnet) und Stand der Verkündungen (${base.citation}) weichen ab Zeichen ${at} ab: Portal „…${portal.slice(Math.max(0, at - 40), at + 40)}…“, Verkündung „…${publication.slice(Math.max(0, at - 40), at + 40)}…“`,
  };
}

/* ------------------------------------------------------------------ Ganze Glieder (Rückfall) */

/** Stufen, die kein eigenes Glied bilden. */
const NON_BLOCK_KINDS: ReadonlySet<string> = new Set(['satz', 'halbsatz', 'satzteil-vor', 'satzteil-nach', 'ueberschrift', 'vorspann', 'zeile', 'spalte']);

const stripArticles = (value: string): string => value.replace(/^(?:(?:die|der|das|den|dem)\s+)?(?:bisherigen?\s+|neuen?\s+)?/iu, '').trim();

/**
 * Ort eines Befehls, soweit er ein Glied bestimmt: „In X wird …“, „X wird …“, „Dem X wird … angefügt“; bei Einfügung
 * eines Glieds das Glied darüber (die Einfügung ändert dessen Kinder). Ohne lesbaren eigenen Ort: der Ort der
 * übergeordneten Befehle.
 */
export function commandUnitPath(text: string, context: readonly LocationPath[]): LocationPath {
  const base = context.flat();
  const trimmed = text.trim();
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  if ((match = /^(?:In|Im)\s+(.+?)\s+(?:wird|werden)\s/u.exec(trimmed))) candidates.push(match[1]!);
  if ((match = /^(?:Dem|Der|Den|Die|Das)\s+(.+?)\s+(?:wird|werden)\s/u.exec(trimmed))) candidates.push(match[1]!);
  if ((match = /^(?:Nach|Vor)\s+(.+?)\s+(?:wird|werden)\s/u.exec(trimmed))) candidates.push(match[1]!);
  if ((match = /^(.+?)\s+(?:wird|werden|erhält|erhalten)\s/u.exec(trimmed))) candidates.push(match[1]!);
  const insertsBlock = /(?:eingefügt|angefügt|vorangestellt)\s*[:.]?\s*$/u.test(trimmed) && !/folgende[rsn]?\s+(?:neue[rn]?\s+)?(?:Satz|Sätze)\b/u.test(trimmed);
  for (const candidate of candidates) {
    if (/[„“⟦]/u.test(candidate)) continue;
    const paths = parseLocation(stripArticles(candidate));
    if (!paths || paths.length !== 1 || paths[0]!.length === 0) continue;
    const own = [...base, ...paths[0]!];
    // „Nach Nr. 4 wird folgende Nr. 5 eingefügt“: geändert wird das Glied, das Nr. 4 und Nr. 5 enthält.
    return insertsBlock && /^(?:Nach|Vor)\s/u.test(trimmed) ? own.slice(0, -1) : insertsBlock && /^(?:Es\s|Folgende)/u.test(trimmed) ? base : own;
  }
  return base;
}

/**
 * Glied nicht in der Verkündung: Ist es eine Anlage und führt die Seite Anhänge, steht die Anlage nur als PDF-Anhang bei –
 * ohne Textlayer-Umsetzung kein belegter Alttext (`restore-annex-attachment`); sonst `restore-not-found`.
 */
function notFound(base: PublicationBase, path: LocationPath, where: string): RestoreError {
  const annex = path.find((step) => step.kind === 'anlage');
  if (annex && base.attachments && base.attachments.length > 0) {
    const named = base.attachments.filter((attachment) => new RegExp(`^Anlagen?\\b[^:]*?(?:^|\\s|,)${annex.value ? annex.value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') : ''}(?:\\s|,|:|$)`, 'u').test(attachment.label) || (!annex.value && /^Anlage\b/u.test(attachment.label)));
    const list = (named.length > 0 ? named : base.attachments).map((attachment) => `„${attachment.label}“`).slice(0, 3).join(', ');
    return new RestoreError('restore-annex-attachment', `${where}: die Anlage steht in der Verkündung (${base.citation}) nur als PDF-Anhang (${list}) – kein Text der Seite`);
  }
  return new RestoreError('restore-not-found', `${where}: in der Verkündung (${base.citation}) nicht eindeutig gefunden`);
}

/** Das kleinste Glied, das der Pfad (von innen nach außen gekürzt) im Körper eindeutig trifft; nie die ganze Norm. */
export function unitFor(body: readonly NormBodyBlock[], path: LocationPath): { steps: LocationPath; blockPath: number[] } | undefined {
  const blocks = path.filter((step) => !NON_BLOCK_KINDS.has(step.kind));
  for (let length = blocks.length; length >= 1; length -= 1) {
    const steps = blocks.slice(0, length);
    const located = locateBlock(body, steps);
    // Nur genau aufgelöste Glieder (keine übersprungene Stufe) – dasselbe Glied muss auch in der Verkündung getroffen werden.
    if (located.ok && located.path.length > 0 && located.widened.length === 0) return { steps, blockPath: located.path };
  }
  return undefined;
}

/** Signatur eines Knotens ohne Wortlaut: Typ, belegte Felder, übrige Attribute mit Wert. */
function nodeSignatures(block: NormBodyBlock, out: Set<string> = new Set()): Set<string> {
  const { children, text: _text, title: _title, label: _label, ...rest } = block;
  out.add(`${block.type}|${(['label', 'title', 'text'] as const).filter((key) => typeof block[key] === 'string').join('+')}|${stableStringify(rest)}`);
  for (const child of children ?? []) nodeSignatures(child, out);
  return out;
}

/**
 * Glied der Verkündung in Portalgestalt. Erst die Gleichheit: Tragen Geschwisterglieder in Verkündung und Portal
 * **dieselbe** Darstellung (kanonisches JSON gleich) und kommt im Glied keine andere Knotenart vor als in ihnen, ist das
 * Glied der Verkündung schon in Portalgestalt. Sonst nach dem Vorbild eines gleich gestalteten Geschwisterglieds
 * (`portalShape`).
 */
function portalForm(old: NormBodyBlock, pairs: ReadonlyArray<{ publication: NormBodyBlock; portal: NormBodyBlock }>): NormBodyBlock | undefined {
  const same = pairs.filter((pair) => stableStringify(pair.publication) === stableStringify(pair.portal));
  if (same.length > 0) {
    const validated = new Set<string>();
    for (const pair of same) nodeSignatures(pair.publication, validated);
    if ([...nodeSignatures(old)].every((signature) => validated.has(signature))) return structuredClone(old) as NormBodyBlock;
  }
  return portalShape(old, pairs) ?? mappedForm(old, pairs);
}

/** Knotenart für die Zuordnung Verkündung → Portal: Typ, belegte Felder, Tiefe im Glied. */
const nodeKind = (block: NormBodyBlock, depth: number): string => `${block.type}|${(['label', 'title', 'text'] as const).filter((key) => typeof block[key] === 'string').join('+')}|${depth}`;

/**
 * Zuordnung der Knotenarten nach Geschwistergliedern, die in Verkündung und Portal **denselben Wortlaut** und **denselben
 * Baum** tragen (gleiche Kinderzahl, gleiche belegte Felder je Knoten) und sich nur in Typ und Attributen unterscheiden
 * (etwa `section` ↔ `subsection`, `level` an Listengliedern). Jede Knotenart des bisherigen Glieds muss darin
 * widerspruchsfrei belegt sein; dann wird es Knoten für Knoten übertragen, der Wortlaut bleibt der der Verkündung.
 */
function mappedForm(old: NormBodyBlock, pairs: ReadonlyArray<{ publication: NormBodyBlock; portal: NormBodyBlock }>): NormBodyBlock | undefined {
  // Je Knotenart der Verkündung: wie das Portal sie darstellt – Typ, Attribute und Ort des Texts: als Text („same“), als
  // erstes Kind „paragraphText“ („child“, BayMBl.: „1.2 Text“ → Unterabschnitt mit Absatz) oder als Überschrift („title“).
  type Handling = 'same' | 'child' | 'title';
  const mapping = new Map<string, string>();
  const conflicts = new Set<string>();
  const keysOf = (block: NormBodyBlock): string => (['label', 'title', 'text'] as const).filter((key) => typeof block[key] === 'string').join('+');
  const formOf = (block: NormBodyBlock, handling: Handling): string => {
    const { children: _children, label: _label, title: _title, text: _text, ...form } = block;
    return stableStringify({ handling, form });
  };
  const explain = (publication: NormBodyBlock, portal: NormBodyBlock, depth: number, into: Map<string, string>): boolean => {
    const pChildren = publication.children ?? [];
    const wChildren = portal.children ?? [];
    const attempt = (handling: Handling, offset: number): boolean => {
      if (wChildren.length - offset !== pChildren.length) return false;
      const local = new Map(into);
      const kind = nodeKind(publication, depth);
      const value = formOf(portal, handling);
      if (local.has(kind) && local.get(kind) !== value) return false;
      local.set(kind, value);
      for (let index = 0; index < pChildren.length; index += 1) if (!explain(pChildren[index]!, wChildren[index + offset]!, depth + 1, local)) return false;
      into.clear();
      for (const [key, entry] of local) into.set(key, entry);
      return true;
    };
    if (keysOf(publication) === keysOf(portal) && attempt('same', 0)) return true;
    const text = publication.text;
    if (typeof text === 'string' && typeof publication.title !== 'string') {
      const first = wChildren[0];
      if (portal.text === undefined && portal.title === undefined && first && first.type === 'paragraphText' && first.text === text && first.label === undefined && first.title === undefined && (first.children ?? []).length === 0 && publication.label === portal.label && attempt('child', 1)) return true;
      if (portal.text === undefined && portal.title === text && publication.label === portal.label && attempt('title', 0)) return true;
    }
    return false;
  };
  let used = 0;
  for (const pair of pairs) {
    if (!sameWording(tokensOf(pair.publication), tokensOf(pair.portal))) continue;
    const local = new Map<string, string>();
    if (!explain(pair.publication, pair.portal, 0, local)) continue;
    used += 1;
    for (const [kind, value] of local) {
      if (mapping.has(kind) && mapping.get(kind) !== value) conflicts.add(kind);
      mapping.set(kind, value);
    }
  }
  if (used === 0) return undefined;
  const convert = (block: NormBodyBlock, depth: number): NormBodyBlock | undefined => {
    const kind = nodeKind(block, depth);
    if (!mapping.has(kind) || conflicts.has(kind)) return undefined;
    const { handling, form } = JSON.parse(mapping.get(kind)!) as { handling: Handling; form: Record<string, unknown> };
    const node = { ...form } as unknown as NormBodyBlock;
    if (typeof block.label === 'string') node.label = block.label;
    if (typeof block.title === 'string') node.title = block.title;
    const children: NormBodyBlock[] = [];
    if (handling === 'same' && typeof block.text === 'string') node.text = block.text;
    if (handling === 'title' && typeof block.text === 'string') node.title = block.text;
    if (handling === 'child' && typeof block.text === 'string') children.push({ type: 'paragraphText', text: block.text });
    for (const child of block.children ?? []) {
      const converted = convert(child, depth + 1);
      if (!converted) return undefined;
      children.push(converted);
    }
    if (children.length > 0 || block.children) node.children = children;
    return node;
  };
  return convert(old, 0);
}

/**
 * Portalgestalt aus der **ganzen Norm** (Rückfall, wenn kein Geschwisterglied sie belegt): Stammverkündung und heutiger
 * Portalkörper (`base.portal`, vor jeder Rücknahme – so belegt kein schon wiederhergestelltes Glied sich selbst) werden
 * Glied für Glied über die Bezeichnungen zugeordnet (unbezeichnete Glieder nur bei gleicher Anzahl der Reihe nach). Je
 * Knotenart der Verkündung – Typ, belegte Felder, Attribute, Typ des Eltern-Glieds – wird notiert, wie das Portal sie
 * darstellt: gleich („same“: gleiche belegte Felder, Typ und Attribute des Portals), der Text als erstes Kind
 * „paragraphText“ („child“) oder als Überschrift („title“), die beiden letzten nur bei gleichem Wortlaut. Ein Paar, das
 * sich so nicht erklären lässt, oder zwei verschiedene Darstellungen derselben Knotenart sperren die Knotenart. Das
 * Glied wird nur übertragen, wenn **jede** seiner Knotenarten belegt und nicht gesperrt ist; der Wortlaut bleibt der der
 * Verkündung (die Wortlautprobe prüft ihn).
 */
interface LearnedForms {
  forms: Map<string, string>;
  conflicts: Set<string>;
  /** Je Knotenart die beobachteten Darstellungen (bei Widerspruch mehrere). */
  observations: Map<string, string[]>;
}

const learnedCache = new WeakMap<PublicationBase, LearnedForms>();

const contentKeys = (block: NormBodyBlock): string => (['label', 'title', 'text'] as const).filter((key) => typeof block[key] === 'string').join('+');

/** Art der Bezeichnung: Strich, Dezimalgliederung mit Stufenzahl, Buchstaben, Doppelbuchstaben, römisch, „(n)“. */
function labelClass(label: string | undefined): string {
  if (label === undefined) return '';
  const value = label.trim();
  if (/^[–—•·-]$/u.test(value)) return 'strich';
  const decimal = /^(\d+[a-z]?(?:\.\d+[a-z]?)*)\.?$/u.exec(value);
  if (decimal) return `dezimal${decimal[1]!.split('.').length}`;
  if (/^[a-z]\)$/u.test(value)) return 'buchstabe';
  if (/^([a-z])\1\)$/u.test(value)) return 'doppelbuchstabe';
  if (/^([a-z])\1\1\)$/u.test(value)) return 'dreifachbuchstabe';
  if (/^[IVXLC]+\.?$/u.test(value)) return 'roemisch';
  if (/^\(\d+[a-z]?\)$/u.test(value)) return 'absatz';
  if (/^(?:§|Art\.)/u.test(value)) return value.startsWith('§') ? 'paragraph' : 'artikel';
  return 'sonst';
}

/**
 * Text wie eine Überschrift (kurz, ohne Satzzeichen am Ende: „1. Allgemeines“) oder wie ein Satz – das Portal setzt den
 * einen als Überschrift des Glieds, den anderen als Absatz darunter (BayMBl.: „1. Zweck der Förderung“ → `section` mit
 * `title`, „1.1 Der Freistaat gewährt …“ → `subsection` mit `paragraphText`).
 */
const textClass = (text: string | undefined): string => (typeof text !== 'string' ? '' : text.length <= 150 && !/[.;:,]\s*$/u.test(text.trim()) ? '|überschriftartig' : '|satz');

/**
 * Knotenart in drei Stufen: vollständig (Typ, Felder, Attribute, Art der Bezeichnung, gegliedert, Art des Texts); ohne die
 * Art des Texts; ohne Art der Bezeichnung und des Texts („*“). Belegt wird zuerst die feinste Stufe; eine gröbere nur, wenn
 * die feinere weder in der Norm noch als Konvention belegt ist – und nie über einen Widerspruch hinweg.
 */
function formKinds(block: NormBodyBlock, parentType: string): [string, string, string] {
  const { children, label, title: _title, text, type: _type, ...rest } = block;
  const head = `${parentType}>${block.type}|${contentKeys(block)}|${stableStringify(rest)}`;
  const nested = (children ?? []).length > 0 ? '|gegliedert' : '';
  return [`${head}|${labelClass(label)}${nested}${textClass(text)}`, `${head}|${labelClass(label)}${nested}|*`, `${head}|*${nested}|*`];
}

function pairChildren(publication: readonly NormBodyBlock[], portal: readonly NormBodyBlock[]): Array<[NormBodyBlock, NormBodyBlock]> {
  const out: Array<[NormBodyBlock, NormBodyBlock]> = [];
  // Gleiche Bezeichnung auf beiden Seiten gleich oft (Spiegelstriche „–“): der Reihe nach.
  const seen = new Set<string>();
  for (const block of publication) {
    if (typeof block.label !== 'string' || seen.has(block.label)) continue;
    seen.add(block.label);
    const own = publication.filter((entry) => entry.label === block.label);
    const hits = portal.filter((entry) => entry.label === block.label);
    if (own.length === hits.length) own.forEach((entry, index) => out.push([entry, hits[index]!]));
  }
  const unlabelledPublication = publication.filter((block) => typeof block.label !== 'string');
  const unlabelledPortal = portal.filter((block) => typeof block.label !== 'string');
  if (unlabelledPublication.length === unlabelledPortal.length) unlabelledPublication.forEach((block, index) => out.push([block, unlabelledPortal[index]!]));
  return out;
}

type FormHandling = 'same' | 'child' | 'title';

function handlingOf(publication: NormBodyBlock, portal: NormBodyBlock): FormHandling | undefined {
  if (contentKeys(publication) === contentKeys(portal)) return 'same';
  const text = publication.text;
  if (typeof text !== 'string' || typeof publication.title === 'string' || portal.text !== undefined) return undefined;
  const first = portal.children?.[0];
  // Text als erstes Kind (auch wenn der Wortlaut seit dem Stichtag geändert ist: dann nach dem Bau allein – das Glied trägt
  // keinen eigenen Text, sein erstes Kind ist ein unbezeichneter Absatz).
  if (portal.title === undefined && first && first.type === 'paragraphText' && first.label === undefined && first.title === undefined && (first.children ?? []).length === 0 && typeof first.text === 'string') return 'child';
  if (typeof portal.title === 'string' && typography(portal.title) === typography(text)) return 'title';
  // Überschrift nach dem Bau, wenn der Wortlaut seit dem Stichtag geändert ist: das Portal trägt eine Überschrift und
  // keinen eigenen Text, die Verkündung einen überschriftartigen Text und keine Überschrift.
  if (typeof portal.title === 'string' && textClass(text) === '|überschriftartig') return 'title';
  return undefined;
}

/** Die in der Norm gelernten Darstellungen (Knotenart → Darstellung, gesperrte Knotenarten) – für Diagnose und Tests. */
export function learnedForms(base: PublicationBase): { forms: ReadonlyMap<string, string>; conflicts: ReadonlySet<string>; observations: ReadonlyMap<string, string[]> } | undefined {
  const learned = learnForms(base);
  return learned ? { forms: learned.forms, conflicts: learned.conflicts, observations: learned.observations } : undefined;
}

function learnForms(base: PublicationBase): LearnedForms | undefined {
  if (!base.portal) return undefined;
  const cached = learnedCache.get(base);
  if (cached) return cached;
  const forms = new Map<string, string>();
  const conflicts = new Set<string>();
  const observations = new Map<string, string[]>();
  const observe = (kind: string, value: string): void => {
    const list = observations.get(kind) ?? [];
    if (!list.includes(value)) list.push(value);
    observations.set(kind, list);
  };
  const visit = (publication: readonly NormBodyBlock[], portal: readonly NormBodyBlock[], parentType: string): void => {
    for (const [left, right] of pairChildren(publication, portal)) {
      const kinds = formKinds(left, parentType);
      const handling = handlingOf(left, right);
      if (!handling) {
        for (const kind of kinds) {
          conflicts.add(kind);
          observe(kind, `unerklärt: ${right.type}|${contentKeys(right)} (${String(left.label ?? '')})`);
        }
        continue;
      }
      const { children: _children, label: _label, title: _title, text: _text, ...form } = right;
      const value = stableStringify({ handling, form });
      for (const kind of kinds) {
        observe(kind, value);
        if (forms.has(kind) && forms.get(kind) !== value) conflicts.add(kind);
        forms.set(kind, value);
      }
      visit(left.children ?? [], (right.children ?? []).slice(handling === 'child' ? 1 : 0), left.type);
    }
  };
  visit(base.body, base.portal, '(Norm)');
  const learned = { forms, conflicts, observations };
  learnedCache.set(base, learned);
  return learned;
}

/** Portalgestalt eines Glieds aus der ganzen Norm, sonst aus den Konventionen des Amtsblatts. */
interface LearnedShape {
  block?: NormBodyBlock;
  /** Knotenarten ohne Beleg oder mit Widerspruch (Begründung im Fehlerfall). */
  gaps: string[];
  /** Knotenarten, deren Darstellung aus den Konventionen des Amtsblatts stammt (mit Zahl der Normen). */
  conventions: string[];
}

function learnedForm(old: NormBodyBlock, base: PublicationBase, publicationParent: readonly number[]): LearnedShape {
  const result: LearnedShape = { gaps: [], conventions: [] };
  const learned = learnForms(base);
  if (!learned) return result;
  const parentType = publicationParent.length === 0 ? '(Norm)' : blockAt(base.body, publicationParent)?.type;
  if (!parentType) return result;
  const organ = organOf(base);
  const convert = (block: NormBodyBlock, parent: string): NormBodyBlock | undefined => {
    const kinds = formKinds(block, parent);
    let entry: string | undefined;
    let conflict = false;
    for (const kind of kinds) {
      if (learned.conflicts.has(kind)) {
        conflict = true;
        break;
      }
      entry = learned.forms.get(kind);
      if (entry !== undefined) break;
      const convention = base.conventions?.get(`${organ}|${kind}`);
      if (convention) {
        entry = convention.value;
        result.conventions.push(`${kind.split('|')[0]}${kind.endsWith('|*') ? ' (allgemein)' : ''} (${convention.norms} Normen)`);
        break;
      }
    }
    if (entry === undefined) {
      result.gaps.push(`${kinds[0]} ${conflict ? 'widersprüchlich dargestellt' : 'weder in der Norm noch als Konvention belegt'}`);
      return undefined;
    }
    const { handling, form } = JSON.parse(entry) as { handling: FormHandling; form: Record<string, unknown> };
    const node = { ...form } as unknown as NormBodyBlock;
    if (typeof block.label === 'string') node.label = block.label;
    if (typeof block.title === 'string') node.title = block.title;
    const children: NormBodyBlock[] = [];
    if (handling === 'same' && typeof block.text === 'string') node.text = block.text;
    if (handling === 'title' && typeof block.text === 'string') node.title = block.text;
    if (handling === 'child' && typeof block.text === 'string') children.push({ type: 'paragraphText', text: block.text });
    for (const child of block.children ?? []) {
      const converted = convert(child, block.type);
      if (!converted) return undefined;
      children.push(converted);
    }
    if (children.length > 0 || block.children) node.children = children;
    return node;
  };
  const block = convert(old, parentType);
  if (block) result.block = block;
  return result;
}

/** Amtsblatt einer Stammverkündung („GVBl.“, „BayMBl.“, …) – aus der Fundstelle. */
const organOf = (base: PublicationBase): string => base.citation.split(/\s/u)[0] ?? '';

/** Darstellungskonvention: die eine Darstellung einer Knotenart in allen Normen eines Amtsblatts, mit Zahl der Normen. */
export interface FormConvention {
  value: string;
  norms: number;
}

/** Schlüssel `Amtsblatt|Knotenart` → Konvention. */
export type FormConventions = ReadonlyMap<string, FormConvention>;

/** Mindestzahl der Normen, die eine Konvention tragen. */
export const CONVENTION_MIN_NORMS = 5;

/**
 * Konventionen der Portaldarstellung je Amtsblatt, aus allen Normen mit Stammverkündung (Stammverkündung ↔ heutiges
 * Portal, `learnForms`): Eine Knotenart gilt als Konvention, wenn sie in mindestens `CONVENTION_MIN_NORMS` Normen genau
 * **eine** Darstellung hat, in keiner Norm eine andere, und höchstens jede zehnte Norm ein unerklärtes Paar dieser Art
 * zeigt (durch spätere Änderungen umgebaute Glieder). Rückfall für Knotenarten, die die Norm selbst nicht belegt.
 */
export function formConventions(samples: Iterable<PublicationBase>, minNorms = CONVENTION_MIN_NORMS): Map<string, FormConvention> {
  const explained = new Map<string, Map<string, number>>();
  const unexplained = new Map<string, number>();
  for (const base of samples) {
    const learned = learnForms(base);
    if (!learned) continue;
    const organ = organOf(base);
    for (const [kind, values] of learned.observations) {
      const key = `${organ}|${kind}`;
      if (values.some((value) => value.startsWith('unerklärt'))) unexplained.set(key, (unexplained.get(key) ?? 0) + 1);
      for (const value of values.filter((entry) => !entry.startsWith('unerklärt'))) {
        const counts = explained.get(key) ?? new Map<string, number>();
        counts.set(value, (counts.get(value) ?? 0) + 1);
        explained.set(key, counts);
      }
    }
  }
  const conventions = new Map<string, FormConvention>();
  for (const [key, counts] of explained) {
    if (counts.size !== 1) continue;
    const [value, norms] = [...counts][0]!;
    if (norms < minNorms || (unexplained.get(key) ?? 0) * 10 > norms) continue;
    conventions.set(key, { value, norms });
  }
  return conventions;
}

/** Hinweis im Ort eines Schritts, wenn die Portalgestalt (teils) aus den Konventionen des Amtsblatts stammt. */
const conventionNote = (conventions: readonly string[]): string => (conventions.length > 0 ? ` (Portalgestalt nach Konvention des Amtsblatts: ${[...new Set(conventions)].join(', ')})` : '');

function siblingPairs(publicationSiblings: readonly NormBodyBlock[], portalSiblings: readonly NormBodyBlock[], skip: ReadonlySet<number>): Array<{ publication: NormBodyBlock; portal: NormBodyBlock }> {
  const pairs: Array<{ publication: NormBodyBlock; portal: NormBodyBlock }> = [];
  publicationSiblings.forEach((block, position) => {
    if (skip.has(position) || typeof block.label !== 'string') return;
    const hits = portalSiblings.filter((entry) => entry.label === block.label);
    if (hits.length === 1) pairs.push({ publication: block, portal: hits[0]! });
  });
  return pairs;
}

/**
 * Rückfall für einen Befehl, den die Rücknahme nicht lesen oder umkehren kann: Das ganze Glied, das er ändert, wird
 * durch das Glied der Stammverkündung ersetzt (`replace-blocks`: Stichtag → nach der Änderung). Zulässig nur, wo die
 * Probe im Wortlaut das Ergebnis trägt (Stammfassung am Stichtag, Rücknahme nach dem Stichtag) – nie bei der Rücknahme
 * der Änderungen vor dem Stichtag selbst.
 */
export function restoreUnit(working: readonly NormBodyBlock[], base: PublicationBase, unit: { steps: LocationPath; blockPath: number[] }, label: string): RestoredStep {
  const where = `${label} ${formatPath(unit.steps)}`;
  const located = locateBlock(base.body, unit.steps);
  if (!located.ok || located.path.length === 0) throw notFound(base, unit.steps, where);
  const old = blockAt(base.body, located.path)!;
  const current = blockAt(working, unit.blockPath)!;
  const parent = unit.blockPath.slice(0, -1);
  const index = unit.blockPath.at(-1)!;
  const publicationSiblings = childrenAt(base.body, located.path.slice(0, -1));
  const portalSiblings = childrenAt(working, parent);
  const sibling = portalForm(old, siblingPairs(publicationSiblings, portalSiblings, new Set([located.path.at(-1)!])));
  const learned = sibling ? undefined : learnedForm(old, base, located.path.slice(0, -1));
  const before = sibling ?? learned?.block;
  if (!before) throw new RestoreError('restore-shape', `${where}: Gestalt im Portal nicht belegt – kein Geschwisterglied mit gleicher Darstellung oder gleicher Gestalt und gleichem Wortlaut${learned && learned.gaps.length > 0 ? `; ${learned.gaps.join(', ')}` : ''}`);
  if (stableStringify(before) === stableStringify(current)) throw new RestoreError('restore-no-change', `${where}: das Glied der Verkündung ist das heutige`);
  return {
    location: `${formatPath(unit.steps)} (ganzes Glied aus der Stammverkündung)${conventionNote(learned?.conventions ?? [])}`,
    scope: { fields: [], resolved: [formatPath(unit.steps)], widened: [] },
    operation: { kind: 'replace-blocks', parent, index, before: [before], after: [structuredClone(current) as NormBodyBlock] },
    evidence: textDelta(blockWording(before).text, blockWording(current).text),
  };
}
