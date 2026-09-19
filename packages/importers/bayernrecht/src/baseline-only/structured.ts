/**
 * Strukturbefehle **vorwärts** (Stammfassung → Stichtag), gebaut auf den Operationen der Rückrechnung
 * (`reconstruction/structural.ts`: `replace-blocks`, `replace-text`, `relabel`, `insert-sentence`, `number-sentences`).
 * Jede Operation wird im Körper **vor** dem Befehl aufgelöst und über `applyForward`/`applyBackward` angewandt; der
 * Rundlauf in `chain.ts#applyAmendment` prüft, dass rückwärts exakt der Körper davor entsteht.
 *
 * Exportiert für Agent R (Vorwärtsrekonstruktion der Portalnormen):
 * - `quotedEntries` / `quotedBlocks`: zitierter neuer Wortlaut (mehrere Einheiten) → Glieder, in der Gestalt der Glieder,
 *   die er ersetzt oder neben die er tritt (Vorlage), mit dem Text so normalisiert wie der Umsetzer der Stammfassung
 *   (`html.ts#normalizeText`, `decodeEntities`).
 * - `forwardBlockRecast`: „Nr. 1 wird wie folgt gefasst“ (Glied mit Untergliederung), „Die Nrn. 1.1 bis 1.3 werden wie
 *   folgt gefasst“ (Bereich), „Die Überschrift wird wie folgt gefasst“.
 * - `forwardInsertBlocks`: „Nach Nr. 3 wird folgende Nr. 4 eingefügt“, „Der Nr. 1.4 werden folgende Nrn. 1.4.3 und 1.4.4
 *   angefügt“ – auch gegliedert.
 * - `forwardRelabel`, `forwardInsertSentence`, `forwardNumberSentences`: die Vorlagen von `parseStructural` vorwärts.
 * - `forwardRepealSentences`: „Satz 1 wird aufgehoben.“; `forwardDeleteSentence`: „Der Satz „…“ wird gestrichen.“; `forwardDeleteWords`: „In Nr. 4.3 wird die Angabe „ , X“ gestrichen.“
 * - `normalizePreamble`: „In der Präambel in Satz 3 werden …“ → „In Satz 3 der Präambel werden …“ (ein Ort, nicht zwei).
 *
 * Was nicht eindeutig ist, wird nicht geraten: fehlt die Vorlage für eine Gliederungstiefe, stimmen Bezeichnungen und
 * Befehl nicht überein oder hat der Text Satznummern, die eine Streichung verschieben würde, bleibt es ein Befund.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { GazetteUnit } from '../reconstruction/gazette.ts';
import { blockAt, blockCandidates, formatPath, locateBlock, parseLocation, relabel, resolvePath, type FieldRef, type LocationPath, type LocationStep, type ResolvedScope } from '../reconstruction/location.ts';
import type { Operation } from '../reconstruction/formulas.ts';
import { compareValues, sentenceNumbers, superscriptNumber, type StructuralTemplate } from '../reconstruction/structural.ts';
import { decodeEntities, normalizeText } from './html.ts';

export interface StructuredStep {
  operation: Operation;
  scope: ResolvedScope;
  location: string;
  formula: 'recast' | 'insert-unit' | 'relabel' | 'insert-sentence' | 'number-sentences' | 'delete-words' | 'insert-words' | 'append-words' | 'renumber-sentence';
}

export type StructuredResult = { steps: StructuredStep[] } | { error: string };

const DECIMAL = /^(\d+(?:\.\d+)*)\.?$/u;
const decimalParts = (label: string | undefined): number[] | undefined => {
  const match = DECIMAL.exec((label ?? '').trim());
  return match ? match[1]!.split('.').map(Number) : undefined;
};
const stripOpening = (value: string): string => value.replace(/^\s*[„‚]/u, '');
const stripClosing = (value: string): string => value.replace(/[“”‘]\s*[.,;]?\s*$/u, '');
const plain = (label: string | undefined): string => (label ?? '').replace(/^[„‚]/u, '').trim();
const noScope = (resolved: string[]): ResolvedScope => ({ fields: [], resolved, widened: [] });

/* ------------------------------------------------------------------------ Zitierter Wortlaut → Glieder */

export interface QuotedEntry {
  label?: string;
  text: string;
}

/**
 * Einheiten des zitierten neuen Wortlauts als Einträge: Bezeichnung (ohne öffnendes Anführungszeichen) und Text,
 * normalisiert wie im Umsetzer der Stammfassung; das öffnende Zeichen steht an der ersten, das schließende an der letzten
 * Einheit. `undefined`, wenn der Wortlaut nicht genau in Anführungszeichen steht.
 */
export function quotedEntries(quoted: readonly GazetteUnit[]): QuotedEntry[] | undefined {
  if (quoted.length === 0) return undefined;
  const entries: QuotedEntry[] = quoted.map((unit) => ({ ...(unit.label ? { label: normalizeText(decodeEntities(unit.label)) } : {}), text: normalizeText(decodeEntities(unit.text)) }));
  const first = entries[0]!;
  if (first.label !== undefined && /^[„‚]/u.test(first.label)) first.label = plain(first.label);
  else if (/^[„‚]/u.test(first.text)) first.text = stripOpening(first.text).trim();
  else return undefined;
  const last = entries.at(-1)!;
  if (!/[“”‘]\s*[.,;]?\s*$/u.test(last.text)) return undefined;
  last.text = stripClosing(last.text).trim();
  if (entries.some((entry) => /[„“”]/u.test(`${entry.label ?? ''}`))) return undefined;
  return entries;
}

/** Gestalt eines Glieds als Vorlage: Art, Überschrift oder Text, Bezeichnungsschreibweise. */
function shaped(model: NormBodyBlock, label: string, text: string): NormBodyBlock | undefined {
  const titled = typeof model.title === 'string' && typeof model.text !== 'string';
  const texted = typeof model.text === 'string' && typeof model.title !== 'string';
  if (!titled && !texted) return undefined;
  const styled = model.label?.trim().endsWith('.') ? `${label.replace(/\.$/u, '')}.` : label.replace(/\.$/u, '');
  if (model.type === 'section') return { type: 'section', label: styled, ...(titled ? { title: text } : { text }), children: [] };
  if (model.type !== 'item') return undefined;
  return { type: 'item', label: styled, ...(titled ? { title: text } : { text }) };
}

/** Gestalt eines nummerierten Absatzes im Umsetzer (`html.ts#leafBlock`: Glied mit Bezeichnung und Text). */
const DEFAULT_ITEM: NormBodyBlock = { type: 'item', label: '0', text: '' };

/** Erstes dezimal bezeichnetes Unterglied einer Vorlage (Vorlage für die nächste Gliederungstiefe). */
const decimalChild = (model: NormBodyBlock | undefined): NormBodyBlock | undefined => model?.children?.find((child) => decimalParts(child.label) !== undefined && (child.type === 'item' || child.type === 'section'));

/**
 * Glieder aus dem zitierten Wortlaut. `labels`: die Bezeichnungen, die der Befehl nennt (oberste Ebene, in Folge);
 * `model`: ein Glied derselben Ebene (das ersetzte oder das Geschwister), dessen Gestalt die neuen Glieder haben –
 * Überschrift oder Text, Abschnitt oder Glied; tiefere Ebenen nach dem ersten dezimalen Unterglied der Vorlage.
 * Unbezeichnete Einheiten werden Textglieder, Buchstaben- und Strichglieder Glieder des zuletzt geöffneten Glieds.
 */
export function quotedBlocks(entries: readonly QuotedEntry[], labels: readonly string[], model: NormBodyBlock, alternates: readonly NormBodyBlock[] = []): { blocks: NormBodyBlock[] } | { error: string } {
  // Vorlage einer tieferen Ebene: das erste dezimale Unterglied der Vorlage der Ebene darüber – hat diese keines, das
  // eines gleichrangigen Glieds (Geschwister der obersten Vorlage), in der Reihenfolge der Nähe.
  const levelModels = (depth: number, parentModel: NormBodyBlock | undefined): NormBodyBlock | undefined => {
    const direct = decimalChild(parentModel);
    if (direct) return direct;
    let frontier: readonly NormBodyBlock[] = alternates;
    for (let level = 1; level <= depth; level += 1) {
      const next = frontier.map((candidate) => decimalChild(candidate)).filter((child): child is NormBodyBlock => child !== undefined);
      if (level === depth) return next[0];
      frontier = next;
    }
    return undefined;
  };
  const top = decimalParts(labels[0]);
  if (!top) return { error: `Bezeichnung „${labels[0]}“ ist keine dezimale Nummer` };
  const blocks: NormBodyBlock[] = [];
  const stack: Array<{ parts: number[]; block: NormBodyBlock; model: NormBodyBlock | undefined }> = [];
  for (const entry of entries) {
    const parts = decimalParts(entry.label);
    if (parts && parts.length >= top.length) {
      const depth = parts.length - top.length;
      while (stack.length > depth) stack.pop();
      if (stack.length !== depth) return { error: `Nummer ${entry.label} ohne übergeordnetes Glied im zitierten Wortlaut` };
      const parent = stack.at(-1);
      if (parent && parts.slice(0, -1).join('.') !== parent.parts.join('.')) return { error: `Nummer ${entry.label} gehört nicht unter ${parent.parts.join('.')}` };
      const siblings = parent ? (parent.block.children ?? []).filter((child) => decimalParts(child.label)) : blocks;
      const previous = siblings.at(-1);
      const expected = previous ? decimalParts(previous.label)!.at(-1)! + 1 : parent ? 1 : parts.at(-1)!;
      if (parts.at(-1) !== expected) return { error: `Nummer ${entry.label} folgt nicht lückenlos` };
      // Ohne Vorlage in Norm und Nachbarn: ein nummerierter Absatz unter einem Glied wird, wie im Umsetzer, Glied mit Text.
      const levelModel = parent ? levelModels(depth, parent.model) ?? (parent.block.type === 'item' ? DEFAULT_ITEM : undefined) : model;
      if (!levelModel) return { error: `keine Vorlage für die Gliederungstiefe von ${entry.label}` };
      const block = shaped(levelModel, entry.label!, entry.text);
      if (!block) return { error: `Vorlage ${levelModel.label ?? levelModel.type} ohne eindeutige Gestalt (Überschrift oder Text)` };
      if (parent) (parent.block.children ??= []).push(block);
      else blocks.push(block);
      stack.push({ parts, block, model: levelModel });
      continue;
    }
    const owner = stack.at(-1);
    if (!owner) return { error: `zitierter Wortlaut beginnt nicht mit der Nummer ${labels[0]}` };
    const child: NormBodyBlock = entry.label ? { type: 'item', label: entry.label, text: entry.text } : { type: 'paragraphText', text: entry.text };
    (owner.block.children ??= []).push(child);
  }
  const produced = blocks.map((block) => (block.label ?? '').replace(/\.$/u, ''));
  if (produced.join('|') !== labels.map((label) => label.replace(/\.$/u, '')).join('|')) return { error: `zitierte Glieder ${produced.join(', ') || '–'} ≠ Befehl ${labels.join(', ')}` };
  return { blocks };
}

/** Geschwister nach Nähe zur Stelle `index` (das Glied selbst zuerst), nur dezimal bezeichnete. */
function nearest(siblings: readonly NormBodyBlock[], index: number): NormBodyBlock[] {
  return siblings
    .map((block, position) => ({ block, distance: Math.abs(position - index) + (position > index ? 0.5 : 0) }))
    .filter((entry) => decimalParts(entry.block.label) !== undefined)
    .sort((left, right) => left.distance - right.distance)
    .map((entry) => entry.block);
}

/* ------------------------------------------------------------------------------ Ortsangaben */

/** „Nrn. 1.1 bis 1.3“, „Nrn. 1.4.3 und 1.4.4“, „Nr. 1“, „Nr. 1.1“ → Nummern (gleiches Präfix bei Bereichen). */
export function numberList(text: string): string[] | undefined {
  const match = /^(?:(?:Die|Der|Den|Das)\s+)?(?:folgenden?\s+|bisherigen?\s+)?(?:Nrn?\.|Nummern?)\s*([\d.]+(?:\s*(?:,|und|bis)\s*[\d.]+)*)$/u.exec(text.trim());
  if (!match) return undefined;
  const tokens = match[1]!.split(/\s*(?:,|und)\s*/u);
  const values: string[] = [];
  for (const token of tokens) {
    const range = /^([\d.]+?)\s*bis\s*([\d.]+)$/u.exec(token);
    if (!range) {
      values.push(token.replace(/\.$/u, ''));
      continue;
    }
    const from = range[1]!.replace(/\.$/u, '').split('.');
    const to = range[2]!.replace(/\.$/u, '').split('.');
    if (from.length !== to.length || from.slice(0, -1).join('.') !== to.slice(0, -1).join('.')) return undefined;
    for (let value = Number(from.at(-1)); value <= Number(to.at(-1)); value += 1) values.push([...from.slice(0, -1), String(value)].join('.'));
  }
  return values.length > 0 ? values : undefined;
}

const nummer = (value: string): LocationStep => ({ kind: 'nummer', value });

/* ------------------------------------------------------------------------------- Neufassung */

const RECAST_HEAD = /^(?:(?:Die|Der|Das)\s+)?(.+?)\s+(?:wird|werden|erhält|erhalten)\s+(?:wie\s+folgt\s+(?:neu\s+)?gefasst|folgende\s+(?:neue\s+)?Fassung)\s*:?\s*$/u;

/**
 * Neufassung ganzer Glieder vorwärts: ein Glied mit Untergliederung oder ein Bereich aufeinanderfolgender Glieder
 * (`replace-blocks`), oder die Überschrift eines Glieds (`replace-text`). Der neue Wortlaut steht in `quoted`.
 */
export function forwardBlockRecast(body: readonly NormBodyBlock[], command: string, quoted: readonly GazetteUnit[], context: readonly LocationPath[]): StructuredResult {
  const head = RECAST_HEAD.exec(command.replace(/\s+/gu, ' ').trim().replace(/\.$/u, ':'));
  if (!head) return { error: 'keine Neufassung' };
  const entries = quotedEntries(quoted);
  if (!entries) return { error: 'neuer Wortlaut nicht in Anführungszeichen' };
  const where = head[1]!.trim();
  const flat = context.flat();
  // „Die Überschrift wird wie folgt gefasst: „2. Verstoß …““ – im Kontext des Glieds.
  if (/^Überschrift$/u.test(where)) {
    const located = locateBlock(body, flat);
    if (!located.ok || located.path.length === 0) return { error: `Glied der Überschrift nicht bestimmt (${formatPath(flat)})` };
    const block = blockAt(body, located.path)!;
    if (typeof block.title !== 'string') return { error: `${formatPath(flat)} hat keine Überschrift` };
    if (entries.length !== 1) return { error: `neue Überschrift in ${entries.length} Einheiten` };
    const entry = entries[0]!;
    if (entry.label !== undefined && entry.label.replace(/\.$/u, '') !== (block.label ?? '').replace(/\.$/u, '')) return { error: `neue Überschrift bezeichnet „${entry.label}“, das Glied „${block.label ?? ''}“` };
    return { steps: [{ operation: { kind: 'replace-text', path: located.path, key: 'title', before: block.title, after: entry.text }, scope: noScope(located.resolved), location: `${formatPath(flat)} Überschrift`, formula: 'recast' }] };
  }
  const numbers = numberList(where);
  if (!numbers) return { error: `Ortsangabe der Neufassung nicht lesbar: „${where}“` };
  const paths: number[][] = [];
  for (const value of numbers) {
    const located = locateBlock(body, [...flat, nummer(value)]);
    if (!located.ok) return { error: `${formatPath([...flat, nummer(value)])}: ${located.reason}` };
    paths.push(located.path);
  }
  const parent = paths[0]!.slice(0, -1);
  const index = paths[0]!.at(-1)!;
  if (paths.some((path, position) => path.slice(0, -1).join(',') !== parent.join(',') || path.at(-1) !== index + position)) return { error: 'die neu gefassten Glieder stehen nicht unmittelbar hintereinander' };
  const before = paths.map((path) => structuredClone(blockAt(body, path)!));
  const siblingsOf = parent.length === 0 ? body : blockAt(body, parent)?.children ?? [];
  const built = quotedBlocks(entries, numbers, before[0]!, nearest(siblingsOf, index));
  if ('error' in built) return built;
  return { steps: [{ operation: { kind: 'replace-blocks', parent, index, before, after: built.blocks }, scope: noScope(numbers.map((value) => formatPath([...flat, nummer(value)]))), location: numbers.map((value) => formatPath([...flat, nummer(value)])).join(', '), formula: 'recast' }] };
}

/**
 * Neufassung eines Buchstaben- oder Doppelbuchstabenglieds in einer **flachen** Aufzählung (der Umsetzer verschachtelt nur
 * dezimale Nummern; „a)“, „aa)“, „aaa)“ stehen nebeneinander, RMRatBek, AllMBl. 2017 S. 3): „Nr. 3 Buchst. c
 * Doppelbuchst. cc wird wie folgt gefasst: „cc) Musik-Organisationen: Bayerischer Musikrat e. V.““ (BayMBl. 2021 Nr. 488).
 * Das Glied „cc)“ ist das erste nach „c)“ und vor dem nächsten Buchstaben; zu ihm gehören die unbezeichneten Absätze bis
 * zum nächsten bezeichneten Glied. Der neue Wortlaut wird ebenso flach gesetzt.
 */
export function forwardFlatRecast(body: readonly NormBodyBlock[], command: string, quoted: readonly GazetteUnit[], context: readonly LocationPath[]): StructuredResult {
  const head = RECAST_HEAD.exec(command.replace(/\s+/gu, ' ').trim().replace(/\.$/u, ':'));
  if (!head) return { error: 'keine Neufassung' };
  const located = parseLocation(head[1]!.trim());
  if (!located || located.length !== 1) return { error: 'Ortsangabe nicht lesbar' };
  const path = [...context.flat(), ...located[0]!];
  const letterAt = path.findIndex((step) => step.kind === 'buchstabe');
  if (letterAt < 1 || path.slice(letterAt + 1).some((step) => step.kind !== 'doppelbuchstabe') || path.length - letterAt > 2) return { error: 'kein Buchstabenglied' };
  const owner = locateBlock(body, path.slice(0, letterAt));
  if (!owner.ok || owner.path.length === 0) return { error: `${formatPath(path.slice(0, letterAt))}: nicht bestimmt` };
  const siblings = blockAt(body, owner.path)!.children ?? [];
  const labelOf = (block: NormBodyBlock): string => (block.label ?? '').replace(/[.)]$/u, '');
  const single = (label: string): boolean => /^[a-z]$/u.test(label);
  const letter = path[letterAt]!.value;
  const letters = siblings.map((block, index) => ({ index, label: labelOf(block) })).filter((entry) => entry.label === letter && single(entry.label));
  if (letters.length !== 1) return { error: `Buchst. ${letter} ${letters.length}-mal in der flachen Aufzählung` };
  let start = letters[0]!.index;
  const target = path[letterAt + 1]?.value;
  if (target) {
    const next = siblings.findIndex((block, index) => index > start && labelOf(block) === target);
    const stop = siblings.findIndex((block, index) => index > start && single(labelOf(block)));
    if (next < 0 || (stop >= 0 && next > stop)) return { error: `Doppelbuchst. ${target} nicht unter Buchst. ${letter}` };
    start = next;
  }
  let end = start + 1;
  while (end < siblings.length && !siblings[end]!.label) end += 1;
  const entries = quotedEntries(quoted);
  if (!entries) return { error: 'neuer Wortlaut nicht in Anführungszeichen' };
  if (entries[0]!.label === undefined || labelOf({ type: 'item', label: entries[0]!.label }) !== (target ?? letter)) return { error: `neuer Wortlaut bezeichnet „${entries[0]!.label ?? ''}“` };
  if (entries.slice(1).some((entry) => entry.label !== undefined)) return { error: 'neuer Wortlaut mit weiteren Gliedern' };
  const model = siblings[start]!;
  if (model.type !== 'item' || typeof model.text !== 'string' || model.children?.length) return { error: 'Glied ohne die Gestalt eines Aufzählungsglieds' };
  const after: NormBodyBlock[] = [{ type: 'item', label: model.label!, text: entries[0]!.text }, ...entries.slice(1).map((entry) => ({ type: 'paragraphText' as const, text: entry.text }))];
  return { steps: [{ operation: { kind: 'replace-blocks', parent: owner.path, index: start, before: siblings.slice(start, end).map((block) => structuredClone(block)), after }, scope: noScope([formatPath(path)]), location: `${formatPath(path)} (flache Aufzählung)`, formula: 'recast' }] };
}

/**
 * Glied einer flachen Buchstabenaufzählung: „Nr. 3 Buchst. f Doppelbuchst. cc Dreifachbuchst. ccc“ – je Stufe das erste
 * Glied mit dieser Bezeichnung hinter dem der Stufe darüber und vor dem nächsten Glied einer höheren Stufe (kürzere
 * Buchstabenfolge). Dazu gehören die unbezeichneten Absätze bis zum nächsten bezeichneten Glied.
 */
function flatLocate(body: readonly NormBodyBlock[], owner: LocationPath, letters: readonly string[]): { parent: number[]; index: number; end: number } | { error: string } {
  const located = locateBlock(body, owner);
  if (!located.ok || located.path.length === 0) return { error: `${formatPath(owner)}: nicht bestimmt` };
  const siblings = blockAt(body, located.path)!.children ?? [];
  const labelOf = (block: NormBodyBlock): string => (block.label ?? '').replace(/[.)]$/u, '');
  let index = -1;
  for (const letter of letters) {
    const level = letter.length;
    const found = siblings.findIndex((block, position) => position > index && labelOf(block) === letter);
    const stop = siblings.findIndex((block, position) => position > index && /^[a-z]+$/u.test(labelOf(block)) && labelOf(block).length < level);
    if (found < 0 || (index >= 0 && stop >= 0 && found > stop)) return { error: `${letter}) nicht in der flachen Aufzählung` };
    index = found;
  }
  let end = index + 1;
  while (end < siblings.length && !siblings[end]!.label) end += 1;
  return { parent: located.path, index, end };
}

const LETTER_KIND: Readonly<Record<string, number>> = { 'Buchst.': 1, 'Doppelbuchst.': 2, 'Dreifachbuchst.': 3 };

/** Kontext „Nr. 3 Buchst. f Doppelbuchst. cc“ → Glied und Buchstabenfolge. */
function flatContext(context: readonly LocationPath[]): { owner: LocationPath; letters: string[] } | undefined {
  const flat = context.flat();
  const first = flat.findIndex((step) => step.kind === 'buchstabe');
  if (first < 1) return undefined;
  const letters = flat.slice(first).map((step) => step.value);
  if (flat.slice(first).some((step) => step.kind !== 'buchstabe' && step.kind !== 'doppelbuchstabe')) return undefined;
  return { owner: flat.slice(0, first), letters };
}

/**
 * „Dreifachbuchst. ccc wird aufgehoben.“ / „Die Dreifachbuchst. ddd bis ggg werden die Dreifachbuchst. ccc bis fff.“ in
 * einer flachen Aufzählung (RMRatBek, BayMBl. 2021 Nr. 740): Aufhebung (`replace-blocks`) und Umbenennung (`relabel`).
 */
const FLAT_REPEAL = /^(?:Der\s+)?(Buchst\.|Doppelbuchst\.|Dreifachbuchst\.)\s*([a-z]{1,3})\s+wird\s+aufgehoben\.?$/u;
const FLAT_RELABEL = /^Die\s+(?:bisherigen\s+)?(Buchst\.|Doppelbuchst\.|Dreifachbuchst\.)\s*([a-z]{1,3})\s+bis\s+([a-z]{1,3})\s+werden\s+die\s+(?:Buchst\.|Doppelbuchst\.|Dreifachbuchst\.)\s*([a-z]{1,3})\s+bis\s+([a-z]{1,3})\.?$/u;
export const FLAT_LETTER_COMMAND = new RegExp(`${FLAT_REPEAL.source}|${FLAT_RELABEL.source}`, 'u');

export function forwardFlatLetters(body: readonly NormBodyBlock[], command: string, context: readonly LocationPath[]): StructuredResult {
  const text = command.replace(/\s+/gu, ' ').trim();
  const within = flatContext(context);
  if (!within) return { error: 'kein Buchstabenkontext' };
  const repeal = FLAT_REPEAL.exec(text);
  if (repeal) {
    const letter = repeal[2]!;
    if (letter.length !== LETTER_KIND[repeal[1]!] || letter.length !== within.letters.length + 1) return { error: `Stufe von ${letter}) passt nicht zum Kontext` };
    const at = flatLocate(body, within.owner, [...within.letters, letter]);
    if ('error' in at) return at;
    const siblings = blockAt(body, at.parent)!.children!;
    const location = `${formatPath(context.flat())} ${letter})`;
    return { steps: [{ operation: { kind: 'replace-blocks', parent: at.parent, index: at.index, before: siblings.slice(at.index, at.end).map((block) => structuredClone(block)), after: [] }, scope: noScope([location]), location: `${location} (flache Aufzählung)`, formula: 'delete-words' }] };
  }
  const relabelled = FLAT_RELABEL.exec(text);
  if (!relabelled) return { error: 'kein Buchstabenbefehl' };
  const spell = (from: string, to: string): string[] | undefined => {
    if (from.length !== to.length || !/^(.)\1*$/u.test(from) || !/^(.)\1*$/u.test(to) || from > to) return undefined;
    const values: string[] = [];
    for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) values.push(String.fromCharCode(code).repeat(from.length));
    return values;
  };
  const fromValues = spell(relabelled[2]!, relabelled[3]!);
  const toValues = spell(relabelled[4]!, relabelled[5]!);
  if (!fromValues || !toValues || fromValues.length !== toValues.length || fromValues[0]!.length !== within.letters.length + 1) return { error: 'Buchstabenbereich nicht eindeutig' };
  const down = toValues[0]! < fromValues[0]!;
  const order = fromValues.map((value, index) => [value, toValues[index]!] as const);
  if (!down) order.reverse();
  const working = structuredClone(body) as NormBodyBlock[];
  const steps: StructuredStep[] = [];
  for (const [from, to] of order) {
    const at = flatLocate(working, within.owner, [...within.letters, from]);
    if ('error' in at) return at;
    const block = blockAt(working, [...at.parent, at.index])!;
    const next = block.label!.replace(from, to);
    steps.push({ operation: { kind: 'relabel', path: [...at.parent, at.index], from: block.label!, to: next }, scope: noScope([`${formatPath(context.flat())} ${from})`]), location: `${formatPath(context.flat())} ${from}) → ${to})`, formula: 'relabel' });
    block.label = next;
  }
  return { steps };
}

/* -------------------------------------------------------------------------------- Einfügung */

/**
 * Einfügung ganzer, auch gegliederter Glieder vorwärts (`replace-blocks` ohne bisherige Glieder). `template` ist die
 * Vorlage von `parseStructural` (`insert-blocks`). Eine schon vergebene Bezeichnung ist nur zulässig, wenn ein späterer
 * Befehl derselben Änderung das bisherige Glied umnummeriert (`relabelledLater`).
 */
export function forwardInsertBlocks(body: readonly NormBodyBlock[], template: Extract<StructuralTemplate, { kind: 'insert-blocks' }>, quoted: readonly GazetteUnit[], relabelledLater: ReadonlySet<string>): StructuredResult {
  if (template.targets.some((target) => target.kind !== 'nummer')) return { error: 'nur nummerierte Glieder' };
  const entries = quotedEntries(quoted);
  if (!entries) return { error: 'neuer Wortlaut nicht in Anführungszeichen' };
  const labels = template.targets.map((target) => target.value);
  let parent: number[];
  let index: number;
  let model: NormBodyBlock | undefined;
  if (template.anchor && template.anchor.side === 'after') {
    const anchor = locateBlock(body, [...template.context, template.anchor.step]);
    if (!anchor.ok) return { error: `Anker ${formatPath([template.anchor.step])}: ${anchor.reason}` };
    const anchorBlock = blockAt(body, anchor.path)!;
    const anchorParts = decimalParts(anchorBlock.label);
    if (!anchorParts || anchorParts.length !== decimalParts(labels[0])?.length) return { error: 'Anker und neues Glied auf verschiedener Ebene' };
    parent = anchor.path.slice(0, -1);
    index = anchor.path.at(-1)! + 1;
    model = anchorBlock;
  } else if (template.append && !template.anchor) {
    const owner = locateBlock(body, template.context);
    if (!owner.ok || owner.path.length === 0) return { error: `Glied für das Anfügen nicht bestimmt (${formatPath(template.context)})` };
    const children = blockAt(body, owner.path)!.children ?? [];
    model = [...children].reverse().find((child) => decimalParts(child.label));
    if (!model) return { error: 'Anfügen an ein Glied ohne nummerierte Unterglieder' };
    const modelParts = decimalParts(model.label)!;
    if (modelParts.length !== decimalParts(labels[0])?.length || modelParts.at(-1)! + 1 !== decimalParts(labels[0])!.at(-1)) return { error: `angefügte Nummer ${labels[0]} folgt nicht auf ${model.label}` };
    parent = owner.path;
    index = children.length;
  } else return { error: 'Einfügung ohne Anker' };
  const siblings = parent.length === 0 ? body : blockAt(body, parent)?.children ?? [];
  for (const label of labels) {
    const taken = siblings.some((sibling) => (sibling.label ?? '').replace(/\.$/u, '') === label);
    if (taken && !relabelledLater.has(label)) return { error: `Bezeichnung ${label} ist schon vergeben – Umnummerierung wird nicht geraten` };
  }
  const built = quotedBlocks(entries, labels, model, nearest(siblings, Math.max(0, index - 1)));
  if ('error' in built) return built;
  const location = labels.map((label) => formatPath([...template.context, nummer(label)])).join(', ');
  return { steps: [{ operation: { kind: 'replace-blocks', parent, index, before: [], after: built.blocks }, scope: noScope([location]), location, formula: 'insert-unit' }] };
}

/* --------------------------------------------------------------------- Umnummerierung, Sätze */

/**
 * „Die bisherige Nr. 2 wird Nr. 3.“ vorwärts. Mehrere gleich bezeichnete Glieder (das eben eingefügte neue „2.“ neben dem
 * bisherigen): gemeint ist das bisherige, also keines aus `inserted`.
 */
export function forwardRelabel(body: readonly NormBodyBlock[], template: Extract<StructuralTemplate, { kind: 'relabel' }>, inserted: ReadonlySet<NormBodyBlock>): StructuredResult {
  const up = template.pairs.every(([from, to]) => compareValues(to.value, from.value) > 0);
  const down = template.pairs.every(([from, to]) => compareValues(to.value, from.value) < 0);
  if (!up && !down) return { error: 'Umnummerierung weder durchgehend auf- noch absteigend' };
  // Vorwärts zuerst das Glied, dessen neue Bezeichnung noch frei ist: aufsteigend von hinten, absteigend von vorn.
  const ordered = [...template.pairs].sort((left, right) => (up ? compareValues(right[0].value, left[0].value) : compareValues(left[0].value, right[0].value)));
  const working = structuredClone(body) as NormBodyBlock[];
  const steps: StructuredStep[] = [];
  for (const [from, to] of ordered) {
    const candidates = (blockCandidates(working, template.context, from) ?? []).filter((path) => {
      const original = blockAt(body, path);
      return original !== undefined && !inserted.has(original);
    });
    if (candidates.length !== 1) return { error: `${formatPath([...template.context, from])}: ${candidates.length === 0 ? 'nicht gefunden' : 'mehrfach vorhanden'}` };
    const path = candidates[0]!;
    const block = blockAt(working, path)!;
    const next = relabel(block.label, from, to.value);
    if (next === undefined || block.label === undefined) return { error: `Bezeichnung „${block.label ?? ''}“ nicht eindeutig umzuschreiben` };
    steps.push({ operation: { kind: 'relabel', path, from: block.label, to: next }, scope: noScope([formatPath([...template.context, from])]), location: `${formatPath([...template.context, from])} → ${formatPath([to])}`, formula: 'relabel' });
    block.label = next;
  }
  return { steps };
}

/**
 * „Die bisherigen Sätze 3 bis 6 werden die Sätze 6 bis 9.“ vorwärts, auch über mehrere Textfelder eines Glieds (eigener
 * Text und unbezeichnete Absätze, BayMBl. 2021 Nr. 413 zu Nr. 2.3.1): Jede bisherige Satznummer steht in genau einem Feld;
 * Sätze, die dieselbe Änderung eben eingefügt hat (`inserted`: Feld → Nummern), sind nicht „bisherige“. Aufsteigend von
 * hinten, absteigend von vorn – keine Nummer steht zwischendurch doppelt im selben Feld.
 */
export function forwardRenumberSentences(body: readonly NormBodyBlock[], template: Extract<StructuralTemplate, { kind: 'renumber-sentences' }>, inserted: ReadonlyMap<string, ReadonlySet<number>>): StructuredResult {
  const up = template.pairs.every(([from, to]) => to > from);
  const down = template.pairs.every(([from, to]) => to < from);
  if (!up && !down) return { error: 'Umnummerierung weder durchgehend auf- noch absteigend' };
  const resolved = resolvePath(body, template.context);
  if (!resolved.ok) return { error: `${formatPath(template.context)}: ${resolved.reason}` };
  const working = structuredClone(body) as NormBodyBlock[];
  const ordered = [...template.pairs].sort((left, right) => (up ? right[0] - left[0] : left[0] - right[0]));
  const steps: StructuredStep[] = [];
  const done = new Map<string, Set<number>>();
  for (const [from, to] of ordered) {
    const holders = resolved.scope.fields.filter((field) => {
      if (field.key !== 'text') return false;
      const key = `${field.path.join(',')}:${field.key}`;
      const markers = sentenceNumbers(String(blockAt(working, field.path)?.text ?? '')).filter((marker) => marker.value === from);
      const fresh = inserted.get(key)?.has(from) ? 1 : 0;
      const renamed = done.get(key)?.has(from) ? 1 : 0;
      return markers.length - fresh - renamed === 1 && markers.length === 1;
    });
    if (holders.length !== 1) return { error: `bisheriger Satz ${from} in ${holders.length} Feldern` };
    const field = holders[0]!;
    const key = `${field.path.join(',')}:${field.key}`;
    const operation = { kind: 'renumber-sentence' as const, from, to };
    const text = String(blockAt(working, field.path)!.text);
    const marker = sentenceNumbers(text).find((entry) => entry.value === from)!;
    blockAt(working, field.path)!.text = `${text.slice(0, marker.start)}${superscriptNumber(to)}${text.slice(marker.end)}`;
    (done.get(key) ?? done.set(key, new Set()).get(key)!).add(to);
    steps.push({ operation, scope: { fields: [field], resolved: resolved.scope.resolved, widened: resolved.scope.widened }, location: `${formatPath(template.context)} Satz ${from} → ${to}`, formula: 'renumber-sentence' });
  }
  return { steps };
}

/** Das einzige Textfeld eines Orts (Satzbefehle). */
function singleText(body: readonly NormBodyBlock[], context: LocationPath): { field: FieldRef; scope: ResolvedScope } | { error: string } {
  const resolved = resolvePath(body, context);
  if (!resolved.ok) return { error: `${formatPath(context)}: ${resolved.reason}` };
  let fields = resolved.scope.fields.filter((field) => field.key === 'text');
  if (fields.length === 2) {
    // Überschriftzeile als Text des Glieds („6.4 Antragsfrist“), darunter genau ein unbezeichneter Absatz: Der Wortlaut
    // ist der Absatz (vgl. `chain.ts#headingScope`).
    const [own, child] = fields as [FieldRef, FieldRef];
    const block = blockAt(body, own.path);
    const paragraph = blockAt(body, child.path);
    const headingLike = block && typeof block.title !== 'string' && typeof block.text === 'string' && block.text.length <= 160 && !/[.!?:;]$/u.test(block.text.trim());
    if (headingLike && block.children?.length === 1 && paragraph?.type === 'paragraphText' && !paragraph.label && child.path.slice(0, -1).join(',') === own.path.join(',')) fields = [child];
  }
  if (fields.length !== 1) return { error: `${formatPath(context)}: ${fields.length} Textfelder – Satzbefehl nicht eindeutig` };
  return { field: fields[0]!, scope: { fields: [fields[0]!], resolved: resolved.scope.resolved, widened: resolved.scope.widened } };
}

/** „Der Wortlaut wird Satz 1.“ / „Der bisherige Wortlaut wird zu Satz 1 und ihm wird die Angabe „1“ vorangestellt.“ */
export const NUMBER_FIRST_SENTENCE = /^Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+(?:zu\s+)?Satz\s+1(?:\s+und\s+ihm\s+wird\s+die\s+Angabe\s+„1“\s+vorangestellt)?\.?$/u;

export function forwardNumberSentences(body: readonly NormBodyBlock[], context: LocationPath): StructuredResult {
  const single = singleText(body, context);
  if ('error' in single) return single;
  const text = String(blockAt(body, single.field.path)?.text ?? '');
  if (sentenceNumbers(text).length > 0) return { error: `${formatPath(context)} trägt schon Satznummern` };
  return { steps: [{ operation: { kind: 'number-sentences' }, scope: single.scope, location: formatPath(context), formula: 'number-sentences' }] };
}

/** „Folgender Satz 2 wird angefügt: „²…““ vorwärts – nur am Ende und nur mit Satznummer im neuen Wortlaut. */
export function forwardInsertSentence(body: readonly NormBodyBlock[], template: Extract<StructuralTemplate, { kind: 'insert-sentence' }>, explicitNumbering: boolean): StructuredResult {
  let single = singleText(body, template.context);
  if ('error' in single && template.after !== 'end') {
    // „Nach Satz 2 werden folgende Sätze 3 bis 5 eingefügt“ in einem Glied mit mehreren Textfeldern: das Feld mit Satz 2.
    const resolved = resolvePath(body, template.context);
    const after = template.after;
    const holders = resolved.ok ? resolved.scope.fields.filter((field) => field.key === 'text' && sentenceNumbers(String(blockAt(body, field.path)?.text ?? '')).filter((marker) => marker.value === after).length === 1) : [];
    if (resolved.ok && holders.length === 1) single = { field: holders[0]!, scope: { fields: [holders[0]!], resolved: resolved.scope.resolved, widened: resolved.scope.widened } };
  }
  if ('error' in single) return single;
  const text = String(blockAt(body, single.field.path)?.text ?? '');
  const markers = sentenceNumbers(text);
  const numbered = sentenceNumbers(template.text).length > 0;
  if (!numbered) return { error: 'eingefügter Satz ohne Satznummer' };
  if (template.after === 'end') {
    if (markers.length === 0 && !(template.first === 2 && !explicitNumbering)) return { error: 'Satznummern des bisherigen Texts nicht belegt' };
    if (markers.length > 0 && markers.at(-1)!.value !== template.first - 1) return { error: `Satz ${template.first} folgt nicht auf den letzten Satz ${markers.at(-1)!.value}` };
  } else if (!markers.some((marker) => marker.value === template.after)) return { error: `Satz ${template.after} nicht im Text` };
  const numberFirst = template.after === 'end' && template.first === 2 && !explicitNumbering && markers.length === 0;
  return { steps: [{ operation: { kind: 'insert-sentence', after: template.after, text: template.text, numberFirst }, scope: single.scope, location: formatPath(template.context), formula: 'insert-sentence' }] };
}

/**
 * „Nr. 1.9 wird wie folgt geändert: Der Wortlaut wird Nr. 1.9.1.“ (BayMBl. 2021 Nr. 690): Das Glied besteht aus seiner
 * Zeile („1.9 Amtsgericht Landshut“) und genau einem unbezeichneten Absatz; dieser Absatz wird das Glied „1.9.1“ – in der
 * Gestalt, die der Umsetzer einem nummerierten Absatz gibt (Glied mit Text).
 */
export const WORDING_BECOMES_NUMBER = /^Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+(?:zu\s+)?(?:Nr\.|Nummer)\s*([\d.]+?)\.?$/u;

export function forwardWordingBecomesNumber(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = WORDING_BECOMES_NUMBER.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'kein „Der Wortlaut wird Nr. …“' };
  const located = locateBlock(body, context);
  if (!located.ok || located.path.length === 0) return { error: `Glied nicht bestimmt (${formatPath(context)})` };
  const block = blockAt(body, located.path)!;
  const own = decimalParts(block.label);
  const target = decimalParts(match[1]);
  if (!own || !target || target.length !== own.length + 1 || target.slice(0, -1).join('.') !== own.join('.') || target.at(-1) !== 1) return { error: `Nr. ${match[1]} ist nicht die erste Unternummer von ${block.label ?? '–'}` };
  const children = block.children ?? [];
  if (children.length !== 1 || children[0]!.type !== 'paragraphText' || children[0]!.label || children[0]!.children?.length) return { error: 'Wortlaut ist nicht genau ein unbezeichneter Absatz' };
  const after: NormBodyBlock = { ...structuredClone(block), children: [{ type: 'item', label: match[1]!.replace(/\.$/u, ''), text: children[0]!.text! }] };
  return { steps: [{ operation: { kind: 'replace-blocks', parent: located.path.slice(0, -1), index: located.path.at(-1)!, before: [structuredClone(block)], after: [after] }, scope: noScope(located.resolved), location: `${formatPath(context)} → Nr. ${match[1]}`, formula: 'relabel' }] };
}

/**
 * „Nr. 1.3 wird gestrichen.“ / „Die Nrn. 5 und 6 werden aufgehoben.“ vorwärts: ganze Glieder fallen weg
 * (`replace-blocks` ohne neue Glieder); die übrigen behalten ihre Nummern, umnummeriert wird nur auf Befehl.
 */
export const DELETE_BLOCKS = /^(?:(?:Die|Der)\s+)?(?:Nrn?\.|Nummern?)\s*([\d.]+(?:\s*(?:,|und|bis)\s*[\d.]+)*)\s+(?:wird|werden)\s+(?:gestrichen|aufgehoben)\.?$/u;

export function forwardDeleteBlocks(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = DELETE_BLOCKS.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Aufhebung ganzer Glieder' };
  const numbers = numberList(`Nrn. ${match[1]}`);
  if (!numbers) return { error: `Nummern „${match[1]}“ nicht lesbar` };
  const paths: number[][] = [];
  for (const value of numbers) {
    const located = locateBlock(body, [...context, nummer(value)]);
    if (!located.ok) return { error: `${formatPath([...context, nummer(value)])}: ${located.reason}` };
    paths.push(located.path);
  }
  const parent = paths[0]!.slice(0, -1);
  const index = paths[0]!.at(-1)!;
  if (paths.some((path, position) => path.slice(0, -1).join(',') !== parent.join(',') || path.at(-1) !== index + position)) return { error: 'die aufgehobenen Glieder stehen nicht unmittelbar hintereinander' };
  const siblings = parent.length === 0 ? body : blockAt(body, parent)?.children ?? [];
  if (siblings.length === paths.length) return { error: 'Aufhebung aller Unterglieder – das Glied bliebe leer' };
  const location = numbers.map((value) => formatPath([...context, nummer(value)])).join(', ');
  return { steps: [{ operation: { kind: 'replace-blocks', parent, index, before: paths.map((path) => structuredClone(blockAt(body, path)!)), after: [] }, scope: noScope([location]), location, formula: 'delete-words' }] };
}

/**
 * Zusammengesetzter Befehl: „Die Wörter „A“ werden gestrichen und nach dem Wort „B“ werden die Wörter „C“ eingefügt.“
 * Geteilt wird nur an „ und “ hinter einem Befehlsverb, vor dem ein neuer Befehl mit Ortsangabe oder Wortangabe beginnt,
 * und nur, wenn jeder Teil seine Anführungszeichen schließt. `undefined`: nicht teilbar.
 */
export function splitCombined(text: string): string[] | undefined {
  const parts: string[] = [];
  let rest = text.replace(/\s+/gu, ' ').trim().replace(/\.$/u, '');
  // „In Satz 2 wird die Satznummerierung und nach dem Wort „können“ die Wörter „im Übrigen“ gestrichen und …“ (BayMBl.
  // 2021 Nr. 19): Die Satznummer fällt zuletzt weg – vorher sind die übrigen Befehle noch „in Satz 2“ auffindbar.
  const numbering = /^(In\s+Satz\s+\d+)\s+wird\s+die\s+Satznummerierung\s+und\s+(.+\bgestrichen\b.*)$/u.exec(rest);
  if (numbering) {
    const tail = `${numbering[1]!} werden ${numbering[2]!}`;
    return [...(splitCombined(tail) ?? [`${tail}.`]), `${numbering[1]!} wird die Satznummerierung gestrichen.`];
  }
  const boundary = /(\b(?:gestrichen|ersetzt|eingefügt|angefügt|aufgehoben|vorangestellt))\s+und\s+(?=(?:nach|vor)\s+(?:dem|den|der)\s|(?:in|im)\s+(?:Satz|Nr\.|Abs\.|der|dem)\s|(?:das|die|der|den)\s+(?:Wort|Wörter|Angabe|Angaben|Satz|Sätze|Klammerzusatz)\b)/u;
  for (;;) {
    const match = boundary.exec(rest);
    if (!match) break;
    const head = rest.slice(0, match.index + match[1]!.length);
    if ((head.match(/„/gu) ?? []).length !== (head.match(/[“”]/gu) ?? []).length) return undefined;
    parts.push(head);
    rest = rest.slice(match.index + match[0].length);
  }
  if (parts.length === 0) return undefined;
  parts.push(rest);
  return parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`);
}

/**
 * „Nach dem Wort „Wörterbücher“ im ersten Halbsatz werden die Wörter „…“ eingefügt.“ (BayMBl. 2023 Nr. 149): Steht der
 * Anker im Bereich mehrfach, grenzt der Halbsatz ein – Halbsätze sind die durch Semikolon getrennten Teile des Felds. Der
 * Anker muss im genannten Halbsatz aller Felder des Bereichs genau einmal als ganzes Wort stehen.
 */
const HALF_SENTENCE_INSERT = /^(?:In\s+(.+?)\s+)?([Nn]ach|[Vv]or)\s+(?:dem\s+Wort|den\s+Wörtern|der\s+Angabe)\s+„([^„“”]+)[“”]\s+im\s+(ersten|zweiten|dritten|letzten)\s+Halbsatz\s+(?:wird|werden)\s+(?:das\s+Wort|die\s+Wörter|die\s+Angabe)\s+„([^„“”]+)[“”]\s+eingefügt\.?$/u;

export function forwardHalfSentenceInsert(body: readonly NormBodyBlock[], command: string, context: readonly LocationPath[]): StructuredResult {
  const match = HALF_SENTENCE_INSERT.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Einfügung mit Halbsatzangabe' };
  let path: LocationPath = context.flat();
  if (match[1]) {
    const parsed = parseLocation(match[1]);
    if (!parsed || parsed.length !== 1) return { error: `Ortsangabe „${match[1]}“ nicht lesbar` };
    path = [...path, ...parsed[0]!];
  }
  const after = /^[Nn]ach$/u.test(match[2]!);
  const anchor = match[3]!;
  const which = match[4]!;
  const inserted = match[5]!;
  const resolved = resolvePath(body, path);
  if (!resolved.ok) return { error: `${formatPath(path)}: ${resolved.reason}` };
  const word = /[\p{L}\p{Nd}]/u;
  const hits: Array<{ field: FieldRef; text: string; position: number }> = [];
  for (const field of resolved.scope.fields) {
    const text = String(blockAt(body, field.path)?.[field.key] ?? '');
    const bounds = [0, ...[...text.matchAll(/;/gu)].map((m) => m.index! + 1), text.length + 1];
    const halves = bounds.slice(0, -1).map((start, index) => ({ start, end: bounds[index + 1]! - 1 }));
    const position = which === 'letzten' ? halves.length - 1 : ['ersten', 'zweiten', 'dritten'].indexOf(which);
    const half = halves[position];
    if (!half || halves.length < 2) continue;
    for (let at = text.indexOf(anchor, half.start); at >= 0 && at + anchor.length <= half.end; at = text.indexOf(anchor, at + 1)) {
      const before = text[at - 1];
      const next = text[at + anchor.length];
      if ((word.test(anchor[0]!) && before !== undefined && word.test(before)) || (word.test(anchor.at(-1)!) && next !== undefined && word.test(next))) continue;
      hits.push({ field, text, position: at });
    }
  }
  if (hits.length !== 1) return { error: `Anker „${anchor}“ steht im ${which} Halbsatz ${hits.length}-mal` };
  const { field, text, position } = hits[0]!;
  const attached = /^[,;.:]/u.test(inserted.trim());
  const piece = inserted.trim();
  const next = after
    ? `${text.slice(0, position + anchor.length)}${attached ? piece : ` ${piece}`}${text.slice(position + anchor.length)}`
    : `${text.slice(0, position)}${piece} ${text.slice(position)}`;
  return { steps: [{ operation: { kind: 'replace-text', path: field.path, key: field.key, before: text, after: next }, scope: noScope([formatPath(path)]), location: `${formatPath(path)} (${which} Halbsatz)`, formula: 'insert-words' }] };
}

/**
 * „Die Wörter „genauere Regelungen werden durch KMS getroffen;“ werden angefügt.“ im Kontext eines Glieds (BayMBl. 2023
 * Nr. 149): angefügt am Ende des einzigen Textfelds (`append` der Rückrechnung).
 */
export const APPEND_WORDS = /^(?:Das\s+Wort|Die\s+Wörter|Die\s+Angabe)\s+„([^„“”]+)[“”]\s+(?:wird|werden)\s+angefügt\.?$/u;

export function forwardAppendWords(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = APPEND_WORDS.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'kein Anfügen von Wörtern' };
  const single = singleText(body, context);
  if ('error' in single) return single;
  return { steps: [{ operation: { kind: 'append', text: match[1]! }, scope: single.scope, location: formatPath(context), formula: 'append-words' }] };
}

/** „In Satz 2 wird die Satznummerierung gestrichen.“: Die hochgestellte Satznummer des Satzes fällt weg. */
export const REMOVE_NUMBERING = /^In\s+Satz\s+(\d+)\s+wird\s+die\s+Satznummerierung\s+gestrichen\.?$/u;

export function forwardRemoveNumbering(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = REMOVE_NUMBERING.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Streichung der Satznummerierung' };
  const number = Number(match[1]);
  const resolved = resolvePath(body, context);
  if (!resolved.ok) return { error: `${formatPath(context)}: ${resolved.reason}` };
  const holders = resolved.scope.fields.filter((field) => field.key === 'text' && sentenceNumbers(String(blockAt(body, field.path)?.text ?? '')).filter((marker) => marker.value === number).length === 1);
  if (holders.length !== 1) return { error: `Satznummer ${number} in ${holders.length} Feldern` };
  const field = holders[0]!;
  const text = String(blockAt(body, field.path)!.text);
  const marker = sentenceNumbers(text).find((entry) => entry.value === number)!;
  const after = `${text.slice(0, marker.start)}${text.slice(marker.end)}`;
  return { steps: [{ operation: { kind: 'replace-text', path: field.path, key: 'text', before: text, after }, scope: noScope([formatPath(context)]), location: `${formatPath(context)} Satz ${number} (Satznummer)`, formula: 'delete-words' }] };
}

/* ----------------------------------------------------------------------------- Streichung */

const DELETE_SENTENCE = /^Der\s+Satz\s+„([^„“”]+)[“”]\s+wird\s+gestrichen\.?$/u;

/**
 * „Der Satz „Über eine Fortsetzung des Schulversuchs wird bis zum Ende des Sommersemesters 2013 entschieden.“ wird
 * gestrichen.“ (KWMBl. 2015 S. 121): Der Satz steht im Bereich genau einmal, als ganzer Satz (am Feldanfang oder hinter
 * einem Satzende); das Feld trägt keine Satznummern (sonst verschöbe die Streichung die Zählung). Ist der Satz das ganze
 * Feld, entfällt das Textglied.
 */
export function forwardDeleteSentence(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = DELETE_SENTENCE.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Satzstreichung' };
  const sentence = match[1]!.trim();
  const resolved = resolvePath(body, context);
  if (!resolved.ok) return { error: `${formatPath(context)}: ${resolved.reason}` };
  const hits: Array<{ field: FieldRef; text: string; position: number }> = [];
  for (const field of resolved.scope.fields) {
    const text = String(blockAt(body, field.path)?.[field.key] ?? '');
    for (let position = text.indexOf(sentence); position >= 0; position = text.indexOf(sentence, position + 1)) hits.push({ field, text, position });
  }
  let defect = '';
  if (hits.length === 0) {
    // Zitierfehler von höchstens einem Zeichen („Sommersemesters“ zitiert, „Sommersemsters“ in der Stammfassung,
    // KWMBl. 2015 S. 121 zu KWMBl. 2013 S. 69): nur ein ganzer Satz, nur genau einer, ab 40 Zeichen. Gestrichen wird der
    // Satz der Stammfassung wörtlich; die Abweichung steht im Rezept.
    const fuzzy: Array<{ field: FieldRef; text: string; position: number; found: string }> = [];
    for (const field of resolved.scope.fields) {
      const text = String(blockAt(body, field.path)?.[field.key] ?? '');
      for (const match of text.matchAll(/(?:^|(?<=[.!?]\s))[^.!?]+[.!?](?=\s|$)/gu)) {
        if (sentence.length >= 40 && oneEditApart(match[0], sentence)) fuzzy.push({ field, text, position: match.index!, found: match[0] });
      }
    }
    if (fuzzy.length === 1) {
      const only = fuzzy[0]!;
      defect = ` (Zitat weicht um ein Zeichen vom Wortlaut ab: zitiert „${sentence}“, Stammfassung „${only.found}“ – gestrichen wird der Satz der Stammfassung)`;
      return deleteSentenceAt(body, only, only.found, context, defect);
    }
  }
  if (hits.length !== 1) return { error: `Satz „${sentence.slice(0, 60)}“ steht im Bereich ${hits.length}-mal` };
  return deleteSentenceAt(body, hits[0]!, sentence, context, defect);
}

/** Genau eine Einfügung, Streichung oder Ersetzung eines Zeichens trennt die beiden Wortlaute. */
export function oneEditApart(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  while (i < left.length && i < right.length && left[i] === right[i]) i += 1;
  if (left.length === right.length) return left.slice(i + 1) === right.slice(i + 1);
  return left.length > right.length ? left.slice(i + 1) === right.slice(i) : left.slice(i) === right.slice(i + 1);
}

function deleteSentenceAt(body: readonly NormBodyBlock[], hit: { field: FieldRef; text: string; position: number }, sentence: string, context: LocationPath, defect: string): StructuredResult {
  const { field, text, position } = hit;
  if (field.key !== 'text') return { error: 'Satz steht in einer Überschrift' };
  if (sentenceNumbers(text).length > 0) return { error: 'Feld mit Satznummern – die Streichung verschöbe die Zählung' };
  const startOk = position === 0 || /[.!?:]\s$/u.test(text.slice(0, position));
  const end = position + sentence.length;
  const endOk = end === text.length || text[end] === ' ';
  if (!startOk || !endOk || !/[.!?]$/u.test(sentence)) return { error: 'kein ganzer Satz' };
  const location = `${formatPath(context.length > 0 ? context : []) || 'ganzer Text'}${defect}`;
  if (position === 0 && end === text.length) {
    const block = blockAt(body, field.path)!;
    if (block.type !== 'paragraphText' || block.children?.length) return { error: 'Satz ist der ganze Text eines gegliederten Glieds' };
    return { steps: [{ operation: { kind: 'replace-blocks', parent: field.path.slice(0, -1), index: field.path.at(-1)!, before: [structuredClone(block)], after: [] }, scope: noScope([location]), location, formula: 'delete-words' }] };
  }
  const after = end === text.length ? text.slice(0, position).replace(/\s+$/u, '') : `${text.slice(0, position)}${text.slice(end + 1)}`;
  return { steps: [{ operation: { kind: 'replace-text', path: field.path, key: 'text', before: text, after }, scope: noScope([location]), location, formula: 'delete-words' }] };
}

/**
 * „In Nr. 4.3 Satz 1 Buchst. c wird die Angabe „ , ANBest-K“ gestrichen.“ (BayMBl. 2023 Nr. 617): Rückwärts ist die Stelle
 * unbestimmt (`delete-words` ist nicht umkehrbar), vorwärts nicht – der Wortlaut muss im Bereich genau einmal als ganzes
 * Wort stehen. Ein Zitat, das mit einem Satzzeichen beginnt, schließt unmittelbar an; sonst fällt ein Leerzeichen mit weg.
 */
const DELETE_WORDS = /^(?:In\s+(.+?)\s+(?:wird|werden)\s+(?:jeweils\s+)?(?:das\s+Wort|die\s+Wörter|die\s+Angaben?|der\s+Klammerzusatz)|(?:Das\s+Wort|Die\s+Wörter|Die\s+Angaben?|Der\s+Klammerzusatz))\s+„([^„“”]+)[“”]\s+(?:wird|werden)?\s*gestrichen\.?$/u;

export function forwardDeleteWords(body: readonly NormBodyBlock[], command: string, context: readonly LocationPath[]): StructuredResult {
  const match = DELETE_WORDS.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Streichung von Wörtern' };
  if (/\bjeweils\b/u.test(command)) return { error: 'Streichung „jeweils“ an mehreren Orten wird nicht vorwärts angewandt' };
  let path: LocationPath = context.flat();
  if (match[1]) {
    const parsed = parseLocation(match[1]);
    if (!parsed || parsed.length !== 1) return { error: `Ortsangabe „${match[1]}“ nicht lesbar` };
    path = [...path, ...parsed[0]!];
  }
  const quoted = match[2]!;
  const attached = /^\s*[,;.:]/u.test(quoted);
  const needle = quoted.trim();
  if (needle === '') return { error: 'leerer Wortlaut' };
  const resolved = resolvePath(body, path);
  if (!resolved.ok) return { error: `${formatPath(path)}: ${resolved.reason}` };
  const word = /[\p{L}\p{Nd}]/u;
  const hits: Array<{ field: FieldRef; text: string; position: number }> = [];
  for (const field of resolved.scope.fields) {
    const text = String(blockAt(body, field.path)?.[field.key] ?? '');
    for (let position = text.indexOf(needle); position >= 0; position = text.indexOf(needle, position + 1)) {
      const before = text[position - 1];
      const after = text[position + needle.length];
      if ((word.test(needle[0]!) && before !== undefined && word.test(before)) || (word.test(needle.at(-1)!) && after !== undefined && word.test(after))) continue;
      hits.push({ field, text, position });
    }
  }
  if (hits.length !== 1) return { error: `„${needle.slice(0, 60)}“ steht im Bereich ${formatPath(path)} ${hits.length}-mal` };
  const { field, text, position } = hits[0]!;
  let start = position;
  let end = position + needle.length;
  if (!attached) {
    if (start > 0 && text[start - 1] === ' ') start -= 1;
    else if (end < text.length && text[end] === ' ') end += 1;
  } else if (start > 0 && text[start - 1] === ' ') return { error: 'Leerzeichen vor dem gestrichenen Satzzeichen – Zitat und Text passen nicht' };
  const after = `${text.slice(0, start)}${text.slice(end)}`;
  if (after.trim() === '') return { error: 'Streichung leert das Feld' };
  return { steps: [{ operation: { kind: 'replace-text', path: field.path, key: field.key, before: text, after }, scope: noScope([formatPath(path)]), location: formatPath(path), formula: 'delete-words' }] };
}

/**
 * „Satz 1 wird aufgehoben.“ / „Die Sätze 2 und 3 werden aufgehoben.“ vorwärts: Der Satz fällt mit seiner Satznummer
 * weg; die übrigen Sätze behalten ihre Nummern (umnummeriert wird nur auf ausdrücklichen Befehl). Nur in einem Feld, das
 * die Satznummern trägt.
 */
const REPEAL_SENTENCES = /^(?:Satz\s+(\d+)\s+wird|Die\s+Sätze\s+(\d+)\s+(und|bis)\s+(\d+)\s+werden)\s+aufgehoben\.?$/u;

export function forwardRepealSentences(body: readonly NormBodyBlock[], command: string, context: LocationPath): StructuredResult {
  const match = REPEAL_SENTENCES.exec(command.replace(/\s+/gu, ' ').trim());
  if (!match) return { error: 'keine Aufhebung von Sätzen' };
  const numbers = match[1] ? [Number(match[1])] : match[3] === 'und' ? [Number(match[2]), Number(match[4])] : Array.from({ length: Number(match[4]) - Number(match[2]) + 1 }, (_, index) => Number(match[2]) + index);
  const resolved = resolvePath(body, context);
  if (!resolved.ok) return { error: `${formatPath(context)}: ${resolved.reason}` };
  const holders = resolved.scope.fields.filter((field) => field.key === 'text' && numbers.every((value) => sentenceNumbers(String(blockAt(body, field.path)?.text ?? '')).filter((marker) => marker.value === value).length === 1));
  if (holders.length !== 1) return { error: `${formatPath(context)}: Satznummer(n) ${numbers.join(', ')} in ${holders.length} Feldern` };
  const field = holders[0]!;
  const text = String(blockAt(body, field.path)!.text);
  const markers = sentenceNumbers(text);
  let after = text;
  for (const value of [...numbers].sort((left, right) => right - left)) {
    const current = sentenceNumbers(after);
    const at = current.findIndex((marker) => marker.value === value);
    const start = current[at]!.start;
    const next = current[at + 1];
    after = next ? `${after.slice(0, start)}${after.slice(next.start)}` : after.slice(0, start).trimEnd();
  }
  if (after.trim() === '' || markers.length === numbers.length) return { error: 'Aufhebung aller Sätze des Felds – das Glied entfiele' };
  return { steps: [{ operation: { kind: 'replace-text', path: field.path, key: 'text', before: text, after }, scope: noScope([formatPath(context)]), location: `${formatPath(context)} Satz ${numbers.join(', ')}`, formula: 'delete-words' }] };
}

/* ------------------------------------------------------------------------------- Präambel */

/** „In der Präambel in Satz 3 werden …“ → „In Satz 3 der Präambel werden …“: ein Ort (Vorspann, Satz 3), nicht zwei. */
export function normalizePreamble(text: string): string {
  return text.replace(/^In\s+der\s+(?:Präambel|Vorbemerkung)\s+in\s+(Satz\s+\d+)\s+/u, 'In $1 der Präambel ');
}
