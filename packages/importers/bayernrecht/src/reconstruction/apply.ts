/**
 * Anwendung eines Rückrechnungsrezepts – **reine Funktionen**, ohne Netz und ohne Dateizugriff, damit der
 * Bulk sie aufrufen kann: parsen → `applyReverseRecipe` → `verifyRoundTrip` → überleiten → prüfen →
 * schreiben.
 *
 * Gearbeitet wird auf dem **bayerischen Quelltext** (`parseBayernRechtPackage(...).law.body`), nicht auf
 * dem übergeleiteten: Die Änderungsbefehle zitieren den bayerischen Wortlaut.
 *
 * Jede Operation muss ihr Ziel **genau einmal** finden – im aufgelösten Bereich des Rezepts, im jeweils
 * aktuellen Zustand des Körpers. Kein Treffer, zwei Treffer, ein abweichender Anschluss an Leerraum: Das
 * ist ein Fehler, nie ein stilles Weitermachen.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { Operation } from './formulas.ts';
import { blockAt, sentenceRange, type FieldRef } from './location.ts';
import { bodyFingerprint, forwardOrder, isRecipeV2, recipeAmendments, recipeProblems, stableStringify, type AnyReconstructionRecipe, type RecipeStep, type ScopeRecord } from './recipe.ts';
import { StructuralError, structuralBackward, structuralForward, STRUCTURAL_KINDS, type StructuralOperation } from './structural.ts';

export type { AnyReconstructionRecipe, ReconstructionRecipe, ReconstructionRecipeV2 } from './recipe.ts';
export { recipeAmendments, recipeSources } from './recipe.ts';

export class ReconstructionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ReconstructionError';
  }
}

/** Ein Zitat, das mit Leerraum und Satzzeichen beginnt („ , Forsten“), schließt direkt an das vorangehende Wort an. */
const ATTACHED = /^\s*[,;.:)]/u;
const PUNCTUATION_ONLY = /^[,;.:]$/u;

interface Surface {
  text: string;
  attached: boolean;
}

export function surface(value: string): Surface {
  const attached = ATTACHED.test(value);
  return { text: attached ? value.trimStart() : value, attached };
}

function readField(body: readonly NormBodyBlock[], ref: FieldRef): string {
  const block = blockAt(body, ref.path);
  const value = block?.[ref.key];
  if (typeof value !== 'string') throw new ReconstructionError('field-missing', `Feld ${ref.key} unter [${ref.path.join(',')}] fehlt im Körper`);
  return value;
}

function writeField(body: NormBodyBlock[], ref: FieldRef, value: string): void {
  const block = blockAt(body, ref.path);
  if (!block) throw new ReconstructionError('field-missing', `Block [${ref.path.join(',')}] fehlt im Körper`);
  block[ref.key] = value;
}

/** Alle Vorkommen, auch überlappende. */
export function occurrences(haystack: string, needle: string, start = 0, end = haystack.length): number[] {
  const positions: number[] = [];
  if (needle === '') return positions;
  let index = haystack.indexOf(needle, start);
  while (index >= 0 && index + needle.length <= end) {
    positions.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return positions;
}

interface Hit {
  ref: FieldRef;
  text: string;
  position: number;
}

/** Der einzige Treffer im Bereich – sonst ein Fehler mit der Zahl der Treffer. */
function uniqueHit(body: readonly NormBodyBlock[], scope: ScopeRecord, needle: string, step: string, what: string): Hit {
  if (needle === '') throw new ReconstructionError('empty-needle', `${step}: leerer Suchtext (${what})`);
  const hits: Hit[] = [];
  for (const ref of scope.fields) {
    const text = readField(body, ref);
    let start = 0;
    let end = text.length;
    if (scope.sentence !== undefined) {
      const range = sentenceRange(text, scope.sentence);
      if (!range) throw new ReconstructionError('sentence-missing', `${step}: Satz ${scope.sentence} im Feld nicht gefunden`);
      start = range.start;
      end = range.end;
    }
    for (const position of occurrences(text, needle, start, end)) hits.push({ ref, text, position });
  }
  if (hits.length !== 1) {
    throw new ReconstructionError(hits.length === 0 ? 'target-not-found' : 'target-ambiguous', `${step}: ${what} „${needle.slice(0, 80)}“ kommt im Bereich ${hits.length}-mal vor (erwartet: genau einmal)`);
  }
  // Der Treffer darf kein Wortteil sein: „10“ in „2010“ ist nicht die Angabe „10“.
  const hit = hits[0]!;
  const before = hit.text[hit.position - 1];
  const after = hit.text[hit.position + needle.length];
  if ((WORD.test(needle[0]!) && before !== undefined && WORD.test(before)) || (WORD.test(needle.at(-1)!) && after !== undefined && WORD.test(after))) {
    throw new ReconstructionError('target-not-found', `${step}: ${what} „${needle.slice(0, 80)}“ steht nur als Teil eines längeren Wortes im Bereich`);
  }
  return hit;
}

const WORD = /[\p{L}\p{Nd}]/u;

/** Das einzige Textfeld eines Bereichs (für „am Ende“ und „angefügt“). */
function singleField(scope: ScopeRecord, step: string, key?: 'text' | 'title'): FieldRef {
  const fields = key ? scope.fields.filter((field) => field.key === key) : scope.fields;
  if (fields.length !== 1) throw new ReconstructionError('end-not-determined', `${step}: „am Ende“ setzt genau ein Textfeld voraus, der Bereich hat ${fields.length}`);
  return fields[0]!;
}

const insertedAfter = (text: string): string => (ATTACHED.test(text) ? text.trimStart() : ` ${text}`);
const appended = (text: string): string => (ATTACHED.test(text) ? text.trimStart() : ` ${text}`);
const finalReplacement = (to: string): string => (PUNCTUATION_ONLY.test(to) ? to : ATTACHED.test(to) ? to.trimStart() : ` ${to}`);

function insertedBefore(text: string, step: string): string {
  if (ATTACHED.test(text)) throw new ReconstructionError('spacing', `${step}: Satzzeichen vor einem Anker einzufügen ist im Leerraum nicht bestimmt`);
  return `${text.trimEnd()} `;
}

function deleted(text: string, side: 'after' | 'before', step: string): string {
  if (side === 'after') return ATTACHED.test(text) || PUNCTUATION_ONLY.test(text.trim()) ? text.trimStart() : ` ${text}`;
  if (ATTACHED.test(text) || PUNCTUATION_ONLY.test(text.trim())) throw new ReconstructionError('spacing', `${step}: Satzzeichen vor einem Anker zu streichen ist im Leerraum nicht bestimmt`);
  return `${text.trimEnd()} `;
}

/** Operationen mit Feld (Satz, Schluss des Feldes) arbeiten auf dem einzigen Textfeld des Bereichs. */
const FIELD_KINDS: ReadonlySet<string> = new Set(['insert-sentence', 'renumber-sentence', 'number-sentences', 'delete-final', 'replace-final-words']);

function structural(body: NormBodyBlock[], scope: ScopeRecord, operation: StructuralOperation, step: string, direction: 'forward' | 'backward'): { ref: FieldRef; position: number } {
  const field = FIELD_KINDS.has(operation.kind) ? singleField(scope, step, 'text') : undefined;
  try {
    if (direction === 'forward') structuralForward(body, field, operation, step);
    else structuralBackward(body, field, operation, step);
  } catch (error) {
    if (error instanceof StructuralError) throw new ReconstructionError(error.code, error.message);
    throw error;
  }
  if (field) return { ref: field, position: 0 };
  const path = 'path' in operation ? operation.path : 'parent' in operation ? [...operation.parent, operation.index] : [];
  return { ref: { path, key: 'text' }, position: 0 };
}

/** Wendet eine Operation **vorwärts** an (Stichtagstext → heutiger Text). */
export function applyForward(body: NormBodyBlock[], scope: ScopeRecord, operation: Operation, step: string): { ref: FieldRef; position: number } {
  if (STRUCTURAL_KINDS.has(operation.kind)) return structural(body, scope, operation as StructuralOperation, step, 'forward');
  switch (operation.kind) {
    case 'replace': {
      const from = surface(operation.from);
      const to = surface(operation.to);
      const hit = uniqueHit(body, scope, from.text, step, 'zu ersetzender Wortlaut');
      let before = hit.text.slice(0, hit.position);
      const after = hit.text.slice(hit.position + from.text.length);
      if (to.attached && !from.attached) {
        if (!before.endsWith(' ')) throw new ReconstructionError('spacing', `${step}: anschließendes Zitat ohne Leerzeichen davor`);
        before = before.slice(0, -1);
      }
      if (from.attached && !to.attached) {
        if (before === '' || before.endsWith(' ')) throw new ReconstructionError('spacing', `${step}: Leerzeichen vor dem neuen Wortlaut nicht bestimmt`);
        before = `${before} `;
      }
      writeField(body, hit.ref, `${before}${to.text}${after}`);
      return { ref: hit.ref, position: before.length };
    }
    case 'insert': {
      const anchor = surface(operation.anchor).text;
      const hit = uniqueHit(body, scope, anchor, step, 'Anker');
      if (operation.side === 'after') {
        const at = hit.position + anchor.length;
        writeField(body, hit.ref, `${hit.text.slice(0, at)}${insertedAfter(operation.text)}${hit.text.slice(at)}`);
        return { ref: hit.ref, position: at };
      }
      writeField(body, hit.ref, `${hit.text.slice(0, hit.position)}${insertedBefore(operation.text, step)}${hit.text.slice(hit.position)}`);
      return { ref: hit.ref, position: hit.position };
    }
    case 'delete-anchored': {
      const anchor = surface(operation.anchor).text;
      const hit = uniqueHit(body, scope, anchor, step, 'Anker');
      const removed = deleted(operation.text, operation.side, step);
      if (operation.side === 'after') {
        const at = hit.position + anchor.length;
        if (hit.text.slice(at, at + removed.length) !== removed) throw new ReconstructionError('target-not-found', `${step}: hinter dem Anker steht nicht „${removed}“`);
        writeField(body, hit.ref, `${hit.text.slice(0, at)}${hit.text.slice(at + removed.length)}`);
        return { ref: hit.ref, position: at };
      }
      const at = hit.position - removed.length;
      if (at < 0 || hit.text.slice(at, hit.position) !== removed) throw new ReconstructionError('target-not-found', `${step}: vor dem Anker steht nicht „${removed}“`);
      writeField(body, hit.ref, `${hit.text.slice(0, at)}${hit.text.slice(hit.position)}`);
      return { ref: hit.ref, position: at };
    }
    case 'append': {
      const ref = singleField(scope, step);
      const text = readField(body, ref);
      writeField(body, ref, `${text}${appended(operation.text)}`);
      return { ref, position: text.length };
    }
    case 'replace-final': {
      const ref = singleField(scope, step, 'text');
      const text = readField(body, ref);
      if (!text.endsWith(operation.from)) throw new ReconstructionError('target-not-found', `${step}: Text endet nicht auf „${operation.from}“`);
      const at = text.length - operation.from.length;
      writeField(body, ref, `${text.slice(0, at)}${finalReplacement(operation.to)}`);
      return { ref, position: at };
    }
    default:
      throw new ReconstructionError('unknown-operation', `${step}: unbekannte Operation ${(operation as { kind: string }).kind}`);
  }
}

/** Wendet eine Operation **rückwärts** an (heutiger Text → Stichtagstext). */
export function applyBackward(body: NormBodyBlock[], scope: ScopeRecord, operation: Operation, step: string): { ref: FieldRef; position: number } {
  if (STRUCTURAL_KINDS.has(operation.kind)) return structural(body, scope, operation as StructuralOperation, step, 'backward');
  switch (operation.kind) {
    case 'replace': {
      const from = surface(operation.from);
      const to = surface(operation.to);
      const hit = uniqueHit(body, scope, to.text, step, 'neuer Wortlaut');
      let before = hit.text.slice(0, hit.position);
      const after = hit.text.slice(hit.position + to.text.length);
      if (to.attached && !from.attached) {
        if (before === '' || before.endsWith(' ')) throw new ReconstructionError('spacing', `${step}: anschließender neuer Wortlaut steht nicht unmittelbar am Wort davor`);
        before = `${before} `;
      }
      if (from.attached && !to.attached) {
        if (!before.endsWith(' ')) throw new ReconstructionError('spacing', `${step}: vor dem neuen Wortlaut fehlt das Leerzeichen`);
        before = before.slice(0, -1);
      }
      writeField(body, hit.ref, `${before}${from.text}${after}`);
      return { ref: hit.ref, position: before.length };
    }
    case 'insert': {
      const anchor = surface(operation.anchor).text;
      if (operation.side === 'after') {
        const inserted = insertedAfter(operation.text);
        const hit = uniqueHit(body, scope, `${anchor}${inserted}`, step, 'Anker mit eingefügtem Wortlaut');
        const at = hit.position + anchor.length;
        writeField(body, hit.ref, `${hit.text.slice(0, at)}${hit.text.slice(at + inserted.length)}`);
        return { ref: hit.ref, position: at };
      }
      const inserted = insertedBefore(operation.text, step);
      const hit = uniqueHit(body, scope, `${inserted}${anchor}`, step, 'eingefügter Wortlaut mit Anker');
      writeField(body, hit.ref, `${hit.text.slice(0, hit.position)}${hit.text.slice(hit.position + inserted.length)}`);
      return { ref: hit.ref, position: hit.position };
    }
    case 'delete-anchored': {
      const anchor = surface(operation.anchor).text;
      const hit = uniqueHit(body, scope, anchor, step, 'Anker');
      const removed = deleted(operation.text, operation.side, step);
      const at = operation.side === 'after' ? hit.position + anchor.length : hit.position;
      writeField(body, hit.ref, `${hit.text.slice(0, at)}${removed}${hit.text.slice(at)}`);
      return { ref: hit.ref, position: at };
    }
    case 'append': {
      const ref = singleField(scope, step);
      const text = readField(body, ref);
      const added = appended(operation.text);
      if (!text.endsWith(added) || text.length === added.length) throw new ReconstructionError('target-not-found', `${step}: Text endet nicht auf den angefügten Wortlaut`);
      writeField(body, ref, text.slice(0, -added.length));
      return { ref, position: text.length - added.length };
    }
    case 'replace-final': {
      const ref = singleField(scope, step, 'text');
      const text = readField(body, ref);
      const replacement = finalReplacement(operation.to);
      if (!text.endsWith(replacement)) throw new ReconstructionError('target-not-found', `${step}: Text endet nicht auf dem neuen Schluss „${replacement.slice(-40)}“`);
      const at = text.length - replacement.length;
      writeField(body, ref, `${text.slice(0, at)}${operation.from}`);
      return { ref, position: at };
    }
    default:
      throw new ReconstructionError('unknown-operation', `${step}: unbekannte Operation ${(operation as { kind: string }).kind}`);
  }
}

/** Alle Schritte rückwärts, in umgekehrter Reihenfolge. Ergebnis ist eine Kopie. */
export function reverseSteps(currentBody: readonly NormBodyBlock[], steps: readonly Pick<RecipeStep, 'id' | 'scope' | 'operation'>[]): NormBodyBlock[] {
  const body = structuredClone(currentBody) as NormBodyBlock[];
  for (const step of [...steps].reverse()) applyBackward(body, step.scope, step.operation, step.id);
  return body;
}

/** Alle Schritte vorwärts, in Befehlsreihenfolge. Ergebnis ist eine Kopie. */
export function forwardSteps(baselineBody: readonly NormBodyBlock[], steps: readonly Pick<RecipeStep, 'id' | 'scope' | 'operation'>[]): NormBodyBlock[] {
  const body = structuredClone(baselineBody) as NormBodyBlock[];
  for (const step of steps) applyForward(body, step.scope, step.operation, step.id);
  return body;
}

/**
 * Rechnet den heutigen Körper auf den Stichtag zurück – v1 (eine Änderung) und v2 (mehrere, jüngste zuerst).
 * Wirft, wenn der Körper nicht der ist, für den das Rezept geprüft wurde, wenn eine Operation ihr Ziel nicht
 * eindeutig findet, oder wenn das Ergebnis (auch ein Zwischenstand einer v2-Kette) vom geprüften abweicht.
 */
export function applyReverseRecipe(currentBody: readonly NormBodyBlock[], recipe: AnyReconstructionRecipe): NormBodyBlock[] {
  const problems = recipeProblems(recipe);
  if (problems.length > 0) throw new ReconstructionError('recipe-invalid', `${recipe.documentId}: Rezept ungültig – ${problems.join('; ')}`);
  const current = bodyFingerprint(currentBody);
  if (current !== recipe.expected.currentFingerprint) {
    throw new ReconstructionError('current-mismatch', `${recipe.documentId}: heutiger Körper (${current.slice(0, 16)}) ist nicht der geprüfte (${recipe.expected.currentFingerprint.slice(0, 16)}); das Rezept gilt nicht`);
  }
  let body = structuredClone(currentBody) as NormBodyBlock[];
  if (isRecipeV2(recipe)) {
    for (const amendment of recipe.amendments) {
      if (bodyFingerprint(body) !== amendment.expected.afterFingerprint) throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Stand nach ${amendment.citation} ist nicht der geprüfte`);
      body = reverseSteps(body, amendment.steps);
      if (bodyFingerprint(body) !== amendment.expected.beforeFingerprint) throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Stand vor ${amendment.citation} weicht vom geprüften ab`);
    }
  } else {
    body = reverseSteps(body, recipe.steps);
  }
  const result = bodyFingerprint(body);
  if (result !== recipe.expected.baselineFingerprint) {
    throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Ergebnis (${result.slice(0, 16)}) weicht vom geprüften Stichtagskörper (${recipe.expected.baselineFingerprint.slice(0, 16)}) ab`);
  }
  return body;
}

/**
 * Beweis durch Rundlauf: rückwärts, dann vorwärts (Forward-Replay: Stichtagskörper plus alle Änderungen, älteste
 * zuerst) – das Ergebnis muss **exakt** der heutige Körper sein (kanonisches JSON, ohne jede Normalisierung).
 */
export function verifyRoundTrip(currentBody: readonly NormBodyBlock[], recipe: AnyReconstructionRecipe): { ok: boolean; detail: string } {
  let baseline: NormBodyBlock[];
  try {
    baseline = applyReverseRecipe(currentBody, recipe);
  } catch (error) {
    return { ok: false, detail: `Rückwärts: ${(error as Error).message}` };
  }
  let forward: NormBodyBlock[];
  try {
    forward = forwardSteps(baseline, forwardOrder(recipe));
  } catch (error) {
    return { ok: false, detail: `Vorwärts: ${(error as Error).message}` };
  }
  const expected = stableStringify(currentBody);
  const actual = stableStringify(forward);
  if (actual !== expected) {
    let at = 0;
    while (at < expected.length && expected[at] === actual[at]) at += 1;
    return { ok: false, detail: `Rundlauf weicht ab bei Zeichen ${at}: erwartet „${expected.slice(Math.max(0, at - 30), at + 30)}“, erhalten „${actual.slice(Math.max(0, at - 30), at + 30)}“` };
  }
  if (bodyFingerprint(baseline) === recipe.expected.currentFingerprint) return { ok: false, detail: 'Rückrechnung ändert nichts – kein Nachweis einer Änderung' };
  const amendments = recipeAmendments(recipe);
  const steps = amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0);
  return { ok: true, detail: `Rundlauf exakt: ${amendments.length} Änderung(en), ${steps} Schritt(e), ${recipe.expected.baselineFingerprint.slice(0, 16)} → ${recipe.expected.currentFingerprint.slice(0, 16)}` };
}
