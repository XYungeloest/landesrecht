/**
 * Lauf 9: **Vorwärts** – der Stand der Verkündungen am Stichtag aus der Stammverkündung und allen Änderungen bis zum
 * Stichtag, jede Änderung in ihrer Reihenfolge vorwärts angewandt.
 *
 * Vorwärts trägt jeder Befehl, was er braucht: Neufassung, Einfügung und Anfügung bringen ihren Wortlaut mit, Aufhebung
 * und Streichung nennen, was entfällt. Die Umkehrung dieser Befehle (Lauf 7: Rücknahme bis zur Stammfassung) scheitert an
 * genau den Befehlen, die vorwärts keine Mühe machen. Angewandt wird auf dem **Blockmodell der Verkündung**
 * (`baseline-only/html.ts`, für das GVBl. gegliedert von `nestLaw`); zitierte Glieder werden in dasselbe Modell gebracht
 * (`quoteBlocks`).
 *
 * Jeder Schritt verlangt Eindeutigkeit wie die Rücknahme: der zu ersetzende oder zu streichende Wortlaut genau einmal im
 * Bereich, das Glied genau einmal, der Satz mit genau dieser Nummer. Was nicht eindeutig oder nicht lesbar ist, bricht ab
 * (`ForwardError`) – es wird nichts vermutet. Der so gewonnene Stand ist Quelle des Alttexts für die Rücknahme nach dem
 * Stichtag und Maßstab der Wortlautprobe gegen den zurückgerechneten Stichtagskörper (`run.ts`).
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { applyForward } from './apply.ts';
import type { ParsedDeletion, ParsedOperation } from './formulas.ts';
import type { GazetteUnit } from './gazette.ts';
import { blockAt, blockLabelMatches, formatPath, locateBlock, relabel, resolvePath, sentenceRange, type FieldRef, type LocationPath, type LocationStep } from './location.ts';
import { nestLaw, type PriorAmendment, type UsedPriorAmendment } from './publication.ts';
import { forwardSentences, type PublicationBase, type RestoreRequest } from './restore.ts';
import { commandLeaves, isNormTitle, parseLeaf, type Leaf } from './steps.ts';
import { listFrameOrUndefined, SAME_KIND, sentenceNumbers, singleTextField, structuralForward, superscriptNumber, type StructuralTemplate } from './structural.ts';
import type { CommandBlock } from './structure.ts';

export class ForwardError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ForwardError';
  }
}

/** Organ der Stammverkündung: das GVBl. wird gegliedert (`nestLaw`), die Amtsblätter bleiben im Modell von `html.ts`. */
export type ForwardOrgan = 'GVBl' | 'other';

const read = (body: readonly NormBodyBlock[], ref: FieldRef): string => {
  const value = blockAt(body, ref.path)?.[ref.key];
  if (typeof value !== 'string') throw new ForwardError('field-missing', `Feld [${ref.path.join(',')}].${ref.key} fehlt`);
  return value;
};
const write = (body: NormBodyBlock[], ref: FieldRef, value: string): void => {
  const block = blockAt(body, ref.path);
  if (!block) throw new ForwardError('field-missing', `Glied [${ref.path.join(',')}] fehlt`);
  block[ref.key] = value;
};
const childrenAt = (body: NormBodyBlock[], parent: readonly number[]): NormBodyBlock[] => {
  if (parent.length === 0) return body;
  const block = blockAt(body, parent);
  if (!block) throw new ForwardError('block-missing', `Glied [${parent.join(',')}] fehlt`);
  block.children ??= [];
  return block.children;
};

/* ------------------------------------------------------------------ Zitierte Glieder → Blockmodell */

const DECIMAL = /^(\d+[a-z]?(?:\.\d+[a-z]?)*)\.?$/u;

/**
 * Zitierte Einheiten („„3.6 Text“ – „a) …“ – „…““) im Blockmodell der Verkündung: Anführungszeichen des äußeren Zitats
 * entfallen; Überschriften werden `heading`, bezeichnete Einheiten `item`, übrige `paragraphText`. Für das GVBl. gliedert
 * `nestLaw` (§/Art. mit Überschrift, „(n)“ als Absatz, Aufzählungen mit Ebene); ohne eigene Paragraphenzeile unter einem
 * Hilfsglied, das danach wieder entfällt. Sonst werden Dezimalnummern relativ zur ersten verschachtelt, alles andere hängt
 * am jeweils letzten Dezimalglied – wie `html.ts` die Seite gliedert.
 */
export function quoteBlocks(units: readonly GazetteUnit[], organ: ForwardOrgan): NormBodyBlock[] {
  if (units.length === 0) throw new ForwardError('quote-missing', 'Befehl ohne zitierten Wortlaut');
  const flat: NormBodyBlock[] = units.map((unit, index) => {
    let label = unit.label?.trim();
    let text = unit.text.trim();
    if (index === 0) {
      if (label && /^[„‚]/u.test(label)) label = label.slice(1).trim();
      else if (/^[„‚]/u.test(text)) text = text.slice(1).trim();
      else throw new ForwardError('quote-unreadable', `Zitat beginnt nicht mit „: „${text.slice(0, 60)}“`);
    }
    if (index === units.length - 1) {
      const closed = text.replace(/[“‘]\s*[.;,]?\s*$/u, '');
      if (closed === text) throw new ForwardError('quote-unreadable', `Zitat endet nicht mit “: „${text.slice(-60)}“`);
      text = closed.trim();
    }
    // Amtsblätter: „1. Zweck der Zuwendung“ als Überschrift mit Nummer ist ein Abschnitt (wie `html.ts`).
    if (unit.heading && label && organ !== 'GVBl' && DECIMAL.test(label)) return { type: 'section', label, ...(text ? { title: text } : {}), children: [] } as NormBodyBlock;
    if (unit.heading) return { type: 'heading', title: `${label ? `${label} ` : ''}${text}`.trim() } as NormBodyBlock;
    if (label) return { type: 'item', label, ...(text ? { text } : {}) } as NormBodyBlock;
    return { type: 'paragraphText', text } as NormBodyBlock;
  });
  if (organ === 'GVBl') {
    const unitHeading = flat[0]!.type === 'heading' || (flat[0]!.type === 'paragraphText' && /^(?:§\s*\d+[a-z]?|Art\.\s*\d+[a-z]?)$/u.test(String(flat[0]!.text)));
    if (unitHeading) return nestLaw(flat);
    // Absätze und Aufzählungen ohne eigene Paragraphenzeile: unter einem Hilfsglied gliedern, das danach entfällt.
    const nested = nestLaw([{ type: 'heading', title: '§ 0' } as NormBodyBlock, ...flat]);
    if (nested.length !== 1 || nested[0]!.label !== '§ 0') throw new ForwardError('quote-unreadable', 'Zitat nicht gliederbar');
    return nested[0]!.children ?? [];
  }
  const out: NormBodyBlock[] = [];
  const stack: Array<{ depth: number; block: NormBodyBlock }> = [];
  let base: number | undefined;
  for (const block of flat) {
    const decimal = block.type === 'item' || block.type === 'section' ? DECIMAL.exec(String(block.label)) : null;
    if (decimal) {
      const depth = decimal[1]!.split('.').length;
      base ??= depth;
      while (stack.length > 0 && stack.at(-1)!.depth >= depth) stack.pop();
      if (depth < base) throw new ForwardError('quote-unreadable', `Zitat: Gliederungsnummer ${String(block.label)} über der ersten`);
      const top = stack.at(-1);
      if (top) (top.block.children ??= []).push(block);
      else out.push(block);
      stack.push({ depth, block });
      continue;
    }
    const owner = stack.at(-1)?.block;
    if (owner) (owner.children ??= []).push(block);
    else out.push(block);
  }
  return out;
}

/* ------------------------------------------------------------------------------- Einzelschritte */

function locateUnique(body: readonly NormBodyBlock[], path: LocationPath, step: string): number[] {
  const located = locateBlock(body, path);
  if (!located.ok || located.path.length === 0) throw new ForwardError('location-unresolved', `${step} ${formatPath(path)}: ${located.ok ? 'die ganze Norm' : located.reason}`);
  if (located.widened.length > 0) throw new ForwardError('location-unresolved', `${step} ${formatPath(path)}: nur als Bereich aufgelöst (${located.widened.join(', ')})`);
  return located.path;
}

/** Glieder `targets` unter `context`: aufeinanderfolgende Kinder eines Eltern-Glieds. */
function locateRun(body: readonly NormBodyBlock[], context: LocationPath, targets: readonly LocationStep[], step: string): { parent: number[]; index: number; count: number } {
  const paths = targets.map((target) => locateUnique(body, [...context, target], step));
  const parent = paths[0]!.slice(0, -1);
  if (paths.some((path, at) => path.slice(0, -1).join(',') !== parent.join(',') || path.at(-1)! !== paths[0]!.at(-1)! + at)) throw new ForwardError('location-unresolved', `${step}: die Glieder ${targets.map((target) => formatPath([target])).join(', ')} stehen nicht aufeinanderfolgend unter einem Glied`);
  return { parent, index: paths[0]!.at(-1)!, count: paths.length };
}

/** Streichung ohne Anker vorwärts: das Wort genau einmal im Bereich; mit ihm ein Leerzeichen davor, sonst danach. */
function deleteWords(body: NormBodyBlock[], deletion: ParsedDeletion | Extract<RestoreRequest, { kind: 'delete-words' }>, step: string): void {
  for (const path of deletion.locations) {
    const scope = resolvePath(body, path);
    if (!scope.ok) throw new ForwardError('location-unresolved', `${step} ${formatPath(path)}: ${scope.reason}`);
    for (const word of deletion.words) {
      const needle = word.trim();
      const hits: Array<{ ref: FieldRef; at: number }> = [];
      for (const ref of scope.scope.fields) {
        const text = read(body, ref);
        for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
          const end = at + needle.length;
          const leftOk = at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!) || !/^[\p{L}\p{N}]/u.test(needle);
          const rightOk = end === text.length || !/[\p{L}\p{N}]/u.test(text[end]!) || !/[\p{L}\p{N}]$/u.test(needle);
          if (leftOk && rightOk) hits.push({ ref, at });
        }
      }
      if (hits.length !== 1) throw new ForwardError('target-ambiguous', `${step} ${formatPath(path)}: zu streichender Wortlaut „${needle}“ steht ${hits.length}-mal im Bereich`);
      const { ref, at } = hits[0]!;
      const text = read(body, ref);
      const end = at + needle.length;
      // Beginnt das Zitat mit Satzzeichen („ , Bezirke“), steht es am vorigen Wort: nur das Zitat entfällt.
      const next = /^[,;.:)]/u.test(needle) ? `${text.slice(0, at).trimEnd()}${text.slice(end)}` : at > 0 && text[at - 1] === ' ' ? `${text.slice(0, at - 1)}${text.slice(end)}` : text[end] === ' ' ? `${text.slice(0, at)}${text.slice(end + 1)}` : `${text.slice(0, at)}${text.slice(end)}`;
      write(body, ref, next);
    }
  }
}

function sentencesForward(body: NormBodyBlock[], request: Extract<RestoreRequest, { kind: 'repeal-sentences' | 'recast-sentences' }>, step: string): void {
  const scope = resolvePath(body, request.path);
  if (!scope.ok) throw new ForwardError('location-unresolved', `${step} ${request.location}: ${scope.reason}`);
  const hits = scope.scope.fields.filter((ref) => request.sentences.every((number) => sentenceRange(read(body, ref), number) !== undefined));
  if (hits.length !== 1) throw new ForwardError('sentence-ambiguous', `${step} ${request.location}: ${hits.length} Felder tragen die Sätze`);
  const ref = hits[0]!;
  const text = read(body, ref);
  const after = forwardSentences(text, request);
  if (after === undefined) throw new ForwardError('sentence-ambiguous', `${step} ${request.location}: Sätze nicht bestimmbar`);
  write(body, ref, after);
  // Ein aufgehobener letzter Satz, der mit Doppelpunkt eine Aufzählung einleitet („²Mit Ablauf des … treten außer Kraft:“ –
  // „1. …“ – „2. …“), nimmt die Aufzählung mit: ihre Glieder stehen im Blockmodell hinter dem Textfeld.
  const last = Math.max(...request.sentences);
  const range = sentenceRange(text, last);
  if (request.kind === 'repeal-sentences' && range && range.end === text.length && /:\s*$/u.test(text)) {
    const parent = ref.path.slice(0, -1);
    const siblings = childrenAt(body, parent);
    const own = ref.path.at(-1)!;
    // Das Textfeld ist ein eigenes Glied (Absatztext) – oder der Text des Glieds selbst, dann folgen die Aufzählungsglieder als Kinder.
    const holder = blockAt(body, ref.path)!;
    const listIn = holder.type === 'paragraphText' ? siblings : (holder.children ?? []);
    let at = holder.type === 'paragraphText' ? own + 1 : 0;
    const start = at;
    while (at < listIn.length && (listIn[at]!.type === 'item' || listIn[at]!.type === 'subitem')) at += 1;
    if (at === start) throw new ForwardError('sentence-ambiguous', `${step} ${request.location}: der Satz leitet eine Aufzählung ein, die nicht folgt`);
    listIn.splice(start, at - start);
  }
}

/** Feld eines Befehls am Ort: das einzige Textfeld oder – bei einem Glied mit Aufzählung – der Text davor bzw. danach. */
function fieldFor(body: readonly NormBodyBlock[], context: LocationPath, step: string, side: 'first' | 'last'): FieldRef {
  const frame = listFrameOrUndefined(body, context, step);
  if (frame) {
    if (side === 'first') return frame.first;
    if (!frame.last) throw new ForwardError('end-not-determined', `${step} ${formatPath(context)}: Aufzählung ohne Schlusstext`);
    return frame.last;
  }
  try {
    return singleTextField(body, context, step).field;
  } catch (error) {
    // Ein gegliedertes Glied ohne eigenen Rahmen (nur Unterglieder): Ende ist das letzte, Anfang das erste Feld in
    // Leserichtung – der Wortlaut in dieser Folge bleibt derselbe.
    const scope = resolvePath(body, context);
    if (!scope.ok || scope.scope.sentence !== undefined) throw new ForwardError('end-not-determined', (error as Error).message);
    const fields = scope.scope.fields.filter((field) => field.key === 'text');
    const pick = side === 'last' ? fields.at(-1) : fields[0];
    if (!pick) throw new ForwardError('end-not-determined', (error as Error).message);
    return pick;
  }
}

function applyTemplate(body: NormBodyBlock[], template: StructuralTemplate, quoted: readonly GazetteUnit[], organ: ForwardOrgan, step: string): void {
  switch (template.kind) {
    case 'relabel':
      relabelForward(body, [template], step);
      return;
    case 'renumber-sentences': {
      const ref = fieldFor(body, template.context, step, 'first');
      let text = read(body, ref);
      const markers = sentenceNumbers(text);
      const hits = template.pairs.map(([from]) => {
        const found = markers.filter((marker) => marker.value === from);
        if (found.length !== 1) throw new ForwardError('sentence-ambiguous', `${step}: Satznummer ${superscriptNumber(from)} steht ${found.length}-mal`);
        return found[0]!;
      });
      for (const [index, hit] of [...hits.entries()].sort((left, right) => right[1].start - left[1].start)) text = `${text.slice(0, hit.start)}${superscriptNumber(template.pairs[index]![1])}${text.slice(hit.end)}`;
      write(body, ref, text);
      return;
    }
    case 'number-sentences': {
      const ref = fieldFor(body, template.context, step, 'first');
      structuralForward(body, ref, { kind: template.kind }, step);
      return;
    }
    case 'unnumber-sentences': {
      // Vorwärts entfällt die Nummer ¹ am Anfang; weitere Sätze hebt derselbe Befehlsblock meist danach auf („a) In Satz 1
      // wird die Satznummerierung „¹“ gestrichen. b) Satz 2 wird aufgehoben.“, GVBl. 2022 S. 695).
      const ref = fieldFor(body, template.context, step, 'first');
      const text = read(body, ref);
      if (!text.startsWith('¹')) throw new ForwardError('sentence-ambiguous', `${step}: der Wortlaut beginnt nicht mit ¹`);
      write(body, ref, text.slice(1));
      return;
    }
    case 'insert-sentence': {
      const ref = fieldFor(body, template.context, step, template.after === 'end' ? 'last' : 'first');
      let text = read(body, ref);
      if (template.after === 'end') {
        if (template.first === 2 && sentenceNumbers(text).length === 0 && /^²/u.test(template.text)) text = `¹${text}`;
        write(body, ref, `${text.trimEnd()} ${template.text}`);
        return;
      }
      const range = sentenceRange(text, template.after);
      if (!range) throw new ForwardError('sentence-ambiguous', `${step}: Satz ${template.after} nicht bestimmt`);
      const head = text.slice(0, range.end).trimEnd();
      const tail = text.slice(range.end).trimStart();
      write(body, ref, tail === '' ? `${head} ${template.text}` : `${head} ${template.text} ${tail}`);
      return;
    }
    case 'insert-blocks': {
      const blocks = quoteBlocks(quoted, organ);
      if (blocks.length !== template.targets.length || blocks.some((block, index) => !blockLabelMatches(block, template.targets[index]!))) throw new ForwardError('quote-unreadable', `${step}: zitierte Glieder (${blocks.map((block) => block.label ?? '–').join(', ')}) passen nicht zu ${template.targets.map((target) => formatPath([target])).join(', ')}`);
      let parent: number[];
      let index: number;
      if (template.anchor) {
        const anchor = locateUnique(body, [...template.context, template.anchor.step], step);
        parent = anchor.slice(0, -1);
        index = anchor.at(-1)! + (template.anchor.side === 'after' ? 1 : 0);
      } else {
        const context = template.context.length === 0 ? [] : locateUnique(body, template.context, step);
        const first = template.targets[0]!;
        const previous = previousValue(first.value);
        if (template.append || previous === undefined) {
          parent = context;
          const siblings = childrenAt(body, parent);
          const pattern = SAME_KIND[first.kind];
          const last = pattern ? siblings.map((sibling, at) => ({ sibling, at })).filter(({ sibling }) => pattern.test((sibling.label ?? '').replace(/\s+/gu, ' ').trim())).at(-1) : undefined;
          if (!template.append) throw new ForwardError('location-unresolved', `${step}: Stelle des eingefügten Glieds ohne Anker nicht bestimmt`);
          index = last ? last.at + 1 : siblings.length;
        } else {
          const anchor = locateUnique(body, [...template.context, { kind: first.kind, value: previous }], step);
          parent = anchor.slice(0, -1);
          index = anchor.at(-1)! + 1;
        }
      }
      childrenAt(body, parent).splice(index, 0, ...blocks);
      return;
    }
    case 'insert-title': {
      const path = locateUnique(body, template.context, step);
      const block = blockAt(body, path)!;
      if (typeof block.title === 'string') throw new ForwardError('title-present', `${step}: das Glied trägt schon eine Überschrift`);
      block.title = template.title;
      return;
    }
    case 'replace-final':
      structuralForward(body, fieldFor(body, template.context, step, 'last'), { kind: 'replace-final-words', from: template.from, to: template.to }, step);
      return;
    case 'delete-final':
      structuralForward(body, fieldFor(body, template.context, step, 'last'), { kind: 'delete-final', text: template.text }, step);
      return;
    case 'number-paragraph': {
      const path = template.context.length === 0 ? [] : locateUnique(body, template.context, step);
      const children = childrenAt(body, path);
      if (children.length === 0 || children.some((child) => child.type === 'subparagraph')) throw new ForwardError('location-unresolved', `${step}: die Vorschrift trägt schon Absätze`);
      const first = children[0]!;
      const text = first.type === 'paragraphText' && first.children === undefined && typeof first.text === 'string' && Object.keys(first).every((key) => key === 'type' || key === 'text');
      structuralForward(body, undefined, { kind: 'number-paragraph', parent: path, index: 0, label: '(1)', text, count: children.length - (text ? 1 : 0) }, step);
      return;
    }
    case 'unnumber-paragraph': {
      const path = locateUnique(body, template.context, step);
      const children = childrenAt(body, path);
      const index = children.findIndex((child) => child.type === 'subparagraph' && /^\(1\)$/u.test(String(child.label).trim()));
      if (index < 0) throw new ForwardError('location-unresolved', `${step}: Abs. 1 nicht gefunden`);
      const own = children[index]!;
      // Vorwärts wird der Absatz zum unbezeichneten Wortlaut: eigener Text als Textglied, dann seine Unterglieder.
      children.splice(index, 1, ...(typeof own.text === 'string' ? [{ type: 'paragraphText', text: own.text } as NormBodyBlock] : []), ...(own.children ?? []));
      return;
    }
  }
}

/** „3.6“ → „3.5“, „5“ → „4“, „c“ → „b“; `undefined` für den ersten Wert. */
function previousValue(value: string): string | undefined {
  const decimal = /^(.*?)(\d+)$/u.exec(value);
  if (decimal) return Number(decimal[2]) > 1 ? `${decimal[1]}${Number(decimal[2]) - 1}` : undefined;
  if (/^[b-z]$/u.test(value)) return String.fromCharCode(value.charCodeAt(0) - 1);
  return undefined;
}

/** Umnummerierungen einer Gruppe gleichzeitig: alle Glieder nach der bisherigen Zählung, dann alle neu bezeichnet. */
function relabelForward(body: NormBodyBlock[], templates: ReadonlyArray<Extract<StructuralTemplate, { kind: 'relabel' }>>, step: string): void {
  const targets: Array<{ path: number[]; from: LocationStep; to: LocationStep }> = [];
  for (const template of templates) for (const [from, to] of template.pairs) targets.push({ path: locateUnique(body, [...template.context, from], step), from, to });
  for (const { path, from, to } of targets) {
    const block = blockAt(body, path)!;
    const next = relabel(block.label, from, to.value);
    if (next === undefined) throw new ForwardError('relabel-unreadable', `${step}: Bezeichnung „${block.label ?? ''}“ nicht übertragbar`);
    block.label = next;
  }
}

function applyRestore(body: NormBodyBlock[], request: RestoreRequest, quoted: readonly GazetteUnit[], organ: ForwardOrgan, step: string): void {
  switch (request.kind) {
    case 'delete-words':
      deleteWords(body, request, step);
      return;
    case 'repeal-sentences':
    case 'recast-sentences':
      sentencesForward(body, request, step);
      return;
    case 'recast-blocks':
    case 'repeal-blocks': {
      const run = locateRun(body, request.context, request.targets, step);
      const siblings = childrenAt(body, run.parent);
      if (request.kind === 'repeal-blocks') {
        siblings.splice(run.index, run.count);
        return;
      }
      const blocks = quoteBlocks(quoted, organ);
      if (request.wording) {
        if (run.count !== 1) throw new ForwardError('location-unresolved', `${step}: Wortlaut mehrerer Glieder`);
        const own = siblings[run.index]!;
        delete own.text;
        own.children = blocks;
        return;
      }
      siblings.splice(run.index, run.count, ...blocks);
      return;
    }
    case 'recast-vorspann': {
      let end = 0;
      while (end < body.length && body[end]!.type === 'paragraphText' && body[end]!.label === undefined && !body[end]!.children) end += 1;
      if (end === 0) throw new ForwardError('location-unresolved', `${step}: keine Vorbemerkung`);
      body.splice(0, end, ...request.groups.map((group) => ({ type: 'paragraphText', text: group }) as NormBodyBlock));
      return;
    }
    case 'recast-title': {
      const block = blockAt(body, locateUnique(body, request.path, step))!;
      if (typeof block.title === 'string') block.title = request.groups[0]!;
      else throw new ForwardError('title-missing', `${step}: das Glied trägt keine Überschrift`);
      return;
    }
  }
}

function applyOperation(body: NormBodyBlock[], operation: ParsedOperation, step: string): void {
  for (const path of operation.locations) {
    // Die Überschrift der Norm steht nicht im Körper.
    if (isNormTitle(path)) continue;
    let scope: ReturnType<typeof resolvePath> = resolvePath(body, path);
    // Amtsblätter setzen die Überschrift eines Glieds als seinen Text („1.1 Allgemeines“): Das Glied ohne Überschrift, dessen
    // Text überschriftartig ist, trägt sie dort.
    if (!scope.ok && path.at(-1)?.kind === 'ueberschrift') {
      const owner = locateBlock(body, path.slice(0, -1));
      const block = owner.ok && owner.path.length > 0 ? blockAt(body, owner.path) : undefined;
      if (block && typeof block.title !== 'string' && typeof block.text === 'string' && block.text.length <= 150 && !/[.;:,]\s*$/u.test(block.text)) scope = { ok: true, scope: { fields: [{ path: owner.ok ? owner.path : [], key: 'text' }], resolved: [...(owner.ok ? owner.resolved : []), 'Überschrift (als Text des Glieds)'], widened: [] } } as unknown as ReturnType<typeof resolvePath>;
    }
    if (!scope.ok) throw new ForwardError('location-unresolved', `${step} ${formatPath(path)}: ${scope.reason}`);
    try {
      applyForward(body, scope.scope, operation.operation, step);
    } catch (error) {
      throw new ForwardError('apply-failed', (error as Error).message);
    }
  }
}

/* ---------------------------------------------------------------------------- Ganze Änderung */

export interface ForwardAmendmentResult {
  body: NormBodyBlock[];
  /** Angewandte Befehle (Blätter). */
  commands: number;
}

/** Wendet einen Befehlsblock vorwärts an; wirft `ForwardError`, wenn ein Befehl nicht eindeutig anwendbar ist. */
export function forwardAmendment(before: readonly NormBodyBlock[], block: CommandBlock, organ: ForwardOrgan, label: string): ForwardAmendmentResult {
  const body = structuredClone(before) as NormBodyBlock[];
  const { leaves, failures } = commandLeaves(block);
  if (failures.length > 0) throw new ForwardError('location-unreadable', `${label}: ${failures[0]}`);
  const parsed = leaves.map((leaf) => ({ leaf, parsed: parseLeaf(leaf, true) }));
  let commands = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    const { leaf, parsed: command } = parsed[index]!;
    const step = `${label} ${leaf.labels.join(' ')}`.trim();
    // Inhaltsübersicht: im Blockmodell der Verkündung nicht geführt (`nestLaw`), die Befehle betreffen es nicht.
    if (leaf.toc) continue;
    if (leaf.statisticsOnly) throw new ForwardError('location-unreadable', `${step}: Ort des Befehls nicht bestimmt`);
    // Neufassung der Überschrift der Norm selbst: nicht Teil des Körpers.
    if (!command.items && leaf.context.flat().length === 0 && /^Die\s+Überschrift\s+(?:wird\s+wie\s+folgt\s+(?:neu\s+)?gefasst|erhält\s+folgende\s+(?:neue\s+)?Fassung)\s*:?$/u.test(leaf.node.text.trim())) continue;
    if (leaf.hasChildren) throw new ForwardError('unrecognized', `${step} „${leaf.node.text.slice(0, 120)}“: Befehl mit eigener Änderung und Untergliederung`);
    if (!command.items) throw new ForwardError(command.formulas[0] ?? 'unrecognized', `${step} „${leaf.node.text.slice(0, 120)}“: ${command.reason ?? 'nicht lesbar'}`);
    // Aufeinanderfolgende Umnummerierungen am selben Ort gelten gleichzeitig.
    const first = command.items[0]!.template;
    if (first?.kind === 'relabel') {
      const group: Array<{ leaf: Leaf; items: NonNullable<typeof command.items> }> = [{ leaf, items: command.items }];
      while (index + 1 < parsed.length) {
        const next = parsed[index + 1]!;
        const template = next.parsed.items?.[0]?.template;
        if (template?.kind !== 'relabel' || formatPath(template.context) !== formatPath(first.context)) break;
        group.push({ leaf: next.leaf, items: next.parsed.items! });
        index += 1;
      }
      relabelForward(body, group.map((entry) => entry.items[0]!.template as Extract<StructuralTemplate, { kind: 'relabel' }>), step);
      for (const entry of group) {
        for (const item of entry.items.slice(1)) applyItem(body, item, entry.leaf, organ, `${label} ${entry.leaf.labels.join(' ')}`);
        commands += 1;
      }
      continue;
    }
    for (const item of command.items) applyItem(body, item, leaf, organ, step);
    commands += 1;
  }
  return { body, commands };
}

function applyItem(body: NormBodyBlock[], item: NonNullable<ReturnType<typeof parseLeaf>['items']>[number], leaf: Leaf, organ: ForwardOrgan, step: string): void {
  if (item.template) applyTemplate(body, item.template, leaf.node.quoted, organ, step);
  else if (item.restore) applyRestore(body, item.restore, leaf.node.quoted, organ, step);
  else if (item.parsed) applyOperation(body, item.parsed, step);
  else throw new ForwardError('unrecognized', `${step}: leerer Befehl`);
}

export interface ForwardStateResult {
  ok: boolean;
  body?: NormBodyBlock[];
  /** Je angewandte Änderung: Bezeichnung und Zahl der Befehle. */
  applied: Array<{ label: string; commands: number }>;
  reason?: string;
  detail?: string;
}

/**
 * Stand am Stichtag: die Stammverkündung, darauf die Änderungen **ältest zuerst**. Scheitert eine, ist der Stand nicht
 * belegt (`ok: false`, Grund und Stelle).
 */
export function forwardState(base: readonly NormBodyBlock[], amendments: ReadonlyArray<{ label: string; block: CommandBlock }>, organ: ForwardOrgan): ForwardStateResult {
  let body = structuredClone(base) as NormBodyBlock[];
  const applied: ForwardStateResult['applied'] = [];
  for (const amendment of amendments) {
    try {
      const result = forwardAmendment(body, amendment.block, organ, amendment.label);
      body = result.body;
      applied.push({ label: amendment.label, commands: result.commands });
    } catch (error) {
      // Befunde der Einzelschritte (`ForwardError`, `StructuralError`, `ReconstructionError`) tragen einen Code; alles
      // andere ist ein Programmfehler.
      const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
      if (typeof code !== 'string') throw error;
      return { ok: false, applied, reason: code, detail: `${amendment.label}: ${(error as Error).message}` };
    }
  }
  return { ok: true, body, applied };
}

/**
 * Stand der Verkündungen am Stichtag als Quelle (`PublicationBase`): der Körper der Stammverkündung, darauf die Änderungen
 * vor dem Stichtag (`prior`, **jüngste zuerst** wie aus `walk.ts`) vorwärts. Die Quellenangaben der Stammverkündung
 * bleiben; die Änderungen stehen in `used` (mit Einleitungssatz der Seite und Zahl der angewandten Befehle).
 */
export function forwardPublicationBase(base: PublicationBase, prior: readonly PriorAmendment[]): { ok: true; base: PublicationBase; used: UsedPriorAmendment[]; commands: number } | { ok: false; reason: string; detail: string } {
  const organ: ForwardOrgan = base.citation.startsWith('GVBl') ? 'GVBl' : 'other';
  const chronological = [...prior].reverse();
  if (chronological.some((step) => !step.block)) return { ok: false, reason: 'forward-prior-unreadable', detail: 'Änderung vor dem Stichtag ohne Befehlsblock' };
  const state = forwardState(base.body, chronological.map((step) => ({ label: step.label, block: step.block! })), organ);
  if (!state.ok) return { ok: false, reason: `forward-${state.reason ?? 'failed'}`, detail: `Vorwärts bis zum Stichtag: ${state.detail ?? ''}` };
  const used: UsedPriorAmendment[] = chronological.map((step, index) => ({
    citation: step.label,
    url: step.url,
    sha256: step.sha256,
    ...(step.retrievedAt ? { retrievedAt: step.retrievedAt } : {}),
    ...(step.publishedAt ? { publishedAt: step.publishedAt } : {}),
    authority: step.authority,
    representation: step.representation,
    ...(step.section ? { section: step.section } : {}),
    introIndex: step.block!.intro.index,
    steps: state.applied[index]!.commands,
  }));
  return { ok: true, base: { ...base, body: state.body! }, used, commands: used.reduce((sum, entry) => sum + entry.steps, 0) };
}
