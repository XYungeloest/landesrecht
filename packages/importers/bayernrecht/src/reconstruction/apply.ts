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
import { bodyFingerprint, forwardOrder, isRecipeV2, recipeAmendments, recipeChangesTitle, recipeProblems, recipeRestores, stableStringify, type AnyReconstructionRecipe, type RecipeStep, type ScopeRecord } from './recipe.ts';
import { StructuralError, structuralBackward, structuralForward, STRUCTURAL_KINDS, type StructuralOperation } from './structural.ts';
import { applyTitleToBody, projectTitle, sameTitle, titleBody, TitleError, titleState, type LawTitleFields, type RecipeTitle } from './title.ts';

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
  if (!attached) return { text: value, attached };
  // „ , “ allein (GVBl. 2025 S. 695: „die Angabe „und“ durch die Angabe „ , “ ersetzt“): Das Leerzeichen hinter dem
  // Satzzeichen ist Schreibweise des Zitats; das Leerzeichen vor dem folgenden Wort steht schon im Text.
  const text = value.trimStart();
  return { text: /^[,;.:)]\s+$/u.test(text) ? text.trimEnd() : text, attached };
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
/**
 * Halbsatz `number` im Satz [start, end): Teile zwischen Semikola. `undefined`: der Satz trägt kein Semikolon (dann gilt der
 * ganze Satz); `'none'`: so viele Halbsätze hat er nicht.
 */
export function halfSentenceRange(text: string, start: number, end: number, number: number): { start: number; end: number } | 'none' | undefined {
  const cuts: number[] = [];
  for (let at = text.indexOf(';', start); at >= 0 && at < end; at = text.indexOf(';', at + 1)) cuts.push(at + 1);
  if (cuts.length === 0) return undefined;
  const bounds = [start, ...cuts, end];
  if (number < 1 || number > bounds.length - 1) return 'none';
  return { start: bounds[number - 1]!, end: bounds[number]! };
}

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
      if (scope.halfSentence !== undefined) {
        const half = halfSentenceRange(text, start, end, scope.halfSentence);
        if (half === 'none') throw new ReconstructionError('sentence-missing', `${step}: Halbsatz ${scope.halfSentence} in Satz ${scope.sentence} nicht gefunden`);
        if (half) {
          start = half.start;
          end = half.end;
        }
      }
    }
    for (const position of occurrences(text, needle, start, end)) hits.push({ ref, text, position });
  }
  // Ein Treffer mitten in einem längeren Wort ist nie die Angabe („Anwärter“ in „Anwärterinnen“, „10“ in „2010“): Er zählt
  // nicht mit. Bleibt genau ein ganzer Treffer, ist er gemeint (GVBl. 2026 S. 425 § 17, UntVergV § 1 Abs. 1).
  const whole = hits.filter((hit) => !partOfWord(hit.text, hit.position, needle));
  if (whole.length === 1 && hits.length > 1) return whole[0]!;
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

/** Steht der Treffer als Teil eines längeren Wortes (Buchstabe oder Ziffer unmittelbar an einer Wortkante des Suchtexts)? */
function partOfWord(text: string, position: number, needle: string): boolean {
  const before = text[position - 1];
  const after = text[position + needle.length];
  return (WORD.test(needle[0]!) && before !== undefined && WORD.test(before)) || (WORD.test(needle.at(-1)!) && after !== undefined && WORD.test(after));
}

/** Das einzige Textfeld eines Bereichs (für „am Ende“ und „angefügt“). */
function singleField(scope: ScopeRecord, step: string, key?: 'text' | 'title'): FieldRef {
  const fields = key ? scope.fields.filter((field) => field.key === key) : scope.fields;
  if (fields.length !== 1) throw new ReconstructionError('end-not-determined', `${step}: „am Ende“ setzt genau ein Textfeld voraus, der Bereich hat ${fields.length}`);
  return fields[0]!;
}

/**
 * Bereich, dessen Ende „am Ende“ meint: das ganze Feld, oder mit Satzangabe („In Satz 4 wird der Punkt am Ende durch …
 * ersetzt“, GVBl. 2024 S. 573) der Satz ohne das Leerzeichen vor der nächsten Satznummer.
 */
function finalRange(text: string, scope: ScopeRecord, step: string): { start: number; end: number } {
  if (scope.sentence === undefined) return { start: 0, end: text.length };
  const range = sentenceRange(text, scope.sentence);
  if (!range) throw new ReconstructionError('sentence-missing', `${step}: Satz ${scope.sentence} im Feld nicht gefunden`);
  let end = range.end;
  while (end > range.start && text[end - 1] === ' ') end -= 1;
  return { start: range.start, end };
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
const FIELD_KINDS: ReadonlySet<string> = new Set(['insert-sentence', 'renumber-sentence', 'number-sentences', 'unnumber-sentences', 'delete-final', 'replace-final-words']);

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
      const { start, end } = finalRange(text, scope, step);
      if (!text.slice(start, end).endsWith(operation.from)) throw new ReconstructionError('target-not-found', `${step}: Text endet nicht auf „${operation.from}“`);
      const at = end - operation.from.length;
      writeField(body, ref, `${text.slice(0, at)}${finalReplacement(operation.to)}${text.slice(end)}`);
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
      const { start, end } = finalRange(text, scope, step);
      if (!text.slice(start, end).endsWith(replacement) || end - replacement.length <= start) throw new ReconstructionError('target-not-found', `${step}: Text endet nicht auf dem neuen Schluss „${replacement.slice(-40)}“`);
      const at = end - replacement.length;
      writeField(body, ref, `${text.slice(0, at)}${operation.from}${text.slice(end)}`);
      return { ref, position: at };
    }
    default:
      throw new ReconstructionError('unknown-operation', `${step}: unbekannte Operation ${(operation as { kind: string }).kind}`);
  }
}

/* ------------------------------------------------------------------ Körper und Überschrift */

/** Arbeitszustand einer Rückrechnung: der Körper und – wenn Titelschritte vorkommen – die Überschrift der Norm. */
export interface LawState {
  body: NormBodyBlock[];
  title?: RecipeTitle;
}

type StepLike = Pick<RecipeStep, 'id' | 'scope' | 'operation'> & { target?: RecipeStep['target'] };

function titleStep(state: LawState, step: StepLike, label: string, direction: 'forward' | 'backward'): { ref: FieldRef; position: number; before: string; after: string } {
  if (!state.title) throw new ReconstructionError('title-state-missing', `${label}: Schritt an der Überschrift der Norm, aber kein Titelzustand – applyReverseRecipeToLaw verwenden`);
  const synthetic = titleBody(state.title);
  const before = String(synthetic[0]!.text);
  const at = direction === 'forward' ? applyForward(synthetic, step.scope, step.operation, label) : applyBackward(synthetic, step.scope, step.operation, label);
  const after = String(synthetic[0]!.text);
  try {
    const next = projectTitle(state.title, after);
    const body = applyTitleToBody(state.body, state.title, next);
    if (body !== state.body) state.body.splice(0, state.body.length, ...body);
    state.title = next;
  } catch (error) {
    if (error instanceof TitleError) throw new ReconstructionError(error.code, `${label}: ${error.message}`);
    throw error;
  }
  return { ref: at.ref, position: at.position, before, after };
}

/** Ein Schritt rückwärts auf Körper oder Überschrift (Zustand wird verändert). */
export function stepBackward(state: LawState, step: StepLike, label = step.id): { ref: FieldRef; position: number } {
  if (step.target === 'title') return titleStep(state, step, label, 'backward');
  return applyBackward(state.body, step.scope, step.operation, label);
}

/** Ein Schritt vorwärts auf Körper oder Überschrift (Zustand wird verändert); bei Titelschritten mit Vorher/Nachher der Überschrift. */
export function stepForward(state: LawState, step: StepLike, label = step.id): { ref: FieldRef; position: number; title?: { before: string; after: string } } {
  if (step.target === 'title') {
    const result = titleStep(state, step, label, 'forward');
    return { ref: result.ref, position: result.position, title: { before: result.before, after: result.after } };
  }
  return applyForward(state.body, step.scope, step.operation, label);
}

const cloneState = (state: LawState): LawState => ({ body: structuredClone(state.body) as NormBodyBlock[], ...(state.title ? { title: { ...state.title } } : {}) });

/** Alle Schritte rückwärts auf Körper und Überschrift, in umgekehrter Reihenfolge. Ergebnis ist eine Kopie. */
export function reverseLawSteps(current: LawState, steps: readonly StepLike[]): LawState {
  const state = cloneState(current);
  for (const step of [...steps].reverse()) stepBackward(state, step);
  return state;
}

/** Alle Schritte vorwärts auf Körper und Überschrift. Ergebnis ist eine Kopie. */
export function forwardLawSteps(baseline: LawState, steps: readonly StepLike[]): LawState {
  const state = cloneState(baseline);
  for (const step of steps) stepForward(state, step);
  return state;
}

/** Alle Schritte rückwärts, in umgekehrter Reihenfolge. Ergebnis ist eine Kopie. Titelschritte verlangen `reverseLawSteps`. */
export function reverseSteps(currentBody: readonly NormBodyBlock[], steps: readonly StepLike[]): NormBodyBlock[] {
  return reverseLawSteps({ body: currentBody as NormBodyBlock[] }, steps).body;
}

/** Alle Schritte vorwärts, in Befehlsreihenfolge. Ergebnis ist eine Kopie. Titelschritte verlangen `forwardLawSteps`. */
export function forwardSteps(baselineBody: readonly NormBodyBlock[], steps: readonly StepLike[]): NormBodyBlock[] {
  return forwardLawSteps({ body: baselineBody as NormBodyBlock[] }, steps).body;
}

const TITLE_RECIPE = 'Das Rezept ändert auch die Überschrift der Norm: applyReverseRecipeToLaw/verifyRoundTripLaw verwenden';

/**
 * Optionen der Anwendung. `restorationChecked`: Der Aufrufer hat die Verkündungen der Wiederherstellung
 * (`recipe.restoration.sources`, Stammverkündung und Änderungen vor dem Stichtag) mit ihrer SHA-256 unverändert im
 * Cache geprüft und archiviert sie mit der Norm. Ohne diese Zusicherung lehnen alle Funktionen ein Rezept mit
 * wiederhergestelltem Alttext ab – ein Aufrufer, der die Wiederherstellung nicht kennt, übernimmt sie nicht still.
 */
export interface RecipeApplyOptions {
  restorationChecked?: boolean;
}

const RESTORATION_RECIPE = 'Das Rezept stellt Alttext aus den Verkündungen wieder her (restoration): deren Quellen mit SHA-256 prüfen, archivieren und { restorationChecked: true } übergeben';

function refuseRestoration(recipe: AnyReconstructionRecipe, options: RecipeApplyOptions | undefined): string | undefined {
  return recipeRestores(recipe) && !options?.restorationChecked ? `${recipe.documentId}: ${RESTORATION_RECIPE}` : undefined;
}

/** Rückwärts über alle Änderungen des Rezepts, mit allen Fingerabdruck- und Titelprüfungen. */
function reverseRecipeState(current: LawState, recipe: AnyReconstructionRecipe): LawState {
  const problems = recipeProblems(recipe);
  if (problems.length > 0) throw new ReconstructionError('recipe-invalid', `${recipe.documentId}: Rezept ungültig – ${problems.join('; ')}`);
  const fingerprint = bodyFingerprint(current.body);
  if (fingerprint !== recipe.expected.currentFingerprint) {
    throw new ReconstructionError('current-mismatch', `${recipe.documentId}: heutiger Körper (${fingerprint.slice(0, 16)}) ist nicht der geprüfte (${recipe.expected.currentFingerprint.slice(0, 16)}); das Rezept gilt nicht`);
  }
  if (recipe.title && (!current.title || !sameTitle(current.title, recipe.title.current))) {
    throw new ReconstructionError('current-title-mismatch', `${recipe.documentId}: heutige Überschrift ist nicht die geprüfte („${recipe.title.current.title.slice(0, 80)}“)`);
  }
  let state = cloneState(current);
  if (isRecipeV2(recipe)) {
    for (const amendment of recipe.amendments) {
      if (bodyFingerprint(state.body) !== amendment.expected.afterFingerprint) throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Stand nach ${amendment.citation} ist nicht der geprüfte`);
      state = reverseLawSteps(state, amendment.steps);
      if (bodyFingerprint(state.body) !== amendment.expected.beforeFingerprint) throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Stand vor ${amendment.citation} weicht vom geprüften ab`);
    }
  } else {
    state = reverseLawSteps(state, recipe.steps);
  }
  const result = bodyFingerprint(state.body);
  if (result !== recipe.expected.baselineFingerprint) {
    throw new ReconstructionError('result-mismatch', `${recipe.documentId}: Ergebnis (${result.slice(0, 16)}) weicht vom geprüften Stichtagskörper (${recipe.expected.baselineFingerprint.slice(0, 16)}) ab`);
  }
  if (recipe.title && (!state.title || !sameTitle(state.title, recipe.title.baseline))) {
    throw new ReconstructionError('result-title-mismatch', `${recipe.documentId}: rückgerechnete Überschrift weicht von der geprüften ab`);
  }
  return state;
}

/**
 * Rechnet den heutigen Körper auf den Stichtag zurück – v1 (eine Änderung) und v2 (mehrere, jüngste zuerst).
 * Wirft, wenn der Körper nicht der ist, für den das Rezept geprüft wurde, wenn eine Operation ihr Ziel nicht
 * eindeutig findet, oder wenn das Ergebnis (auch ein Zwischenstand einer v2-Kette) vom geprüften abweicht.
 * Ein Rezept, das auch die Überschrift der Norm ändert, lehnt diese Funktion ab (`applyReverseRecipeToLaw`).
 */
export function applyReverseRecipe(currentBody: readonly NormBodyBlock[], recipe: AnyReconstructionRecipe, options?: RecipeApplyOptions): NormBodyBlock[] {
  if (recipeChangesTitle(recipe)) throw new ReconstructionError('title-recipe', `${recipe.documentId}: ${TITLE_RECIPE}`);
  const refused = refuseRestoration(recipe, options);
  if (refused) throw new ReconstructionError('restoration-recipe', refused);
  return reverseRecipeState({ body: currentBody as NormBodyBlock[] }, recipe).body;
}

/**
 * Wie `applyReverseRecipe`, aber für die ganze Norm: Körper **und** Überschrift (`title`, `shortTitle`, `abbr`, die
 * Abkürzungszeile im Kopfblock). Für Rezepte ohne Titelschritt ist das Ergebnis im Körper identisch mit
 * `applyReverseRecipe`, die übrigen Felder bleiben. Reine Funktion; gibt eine Kopie von `law` zurück.
 */
export function applyReverseRecipeToLaw<T extends LawTitleFields>(law: T, recipe: AnyReconstructionRecipe, options?: RecipeApplyOptions): T {
  const refused = refuseRestoration(recipe, options);
  if (refused) throw new ReconstructionError('restoration-recipe', refused);
  const current: LawState = { body: law.body, ...(recipe.title ? { title: titleState(law) } : {}) };
  const state = reverseRecipeState(current, recipe);
  const result = { ...law, body: state.body } as T;
  if (recipe.title && state.title) {
    result.title = state.title.title;
    if (state.title.shortTitle === undefined) delete result.shortTitle;
    else result.shortTitle = state.title.shortTitle;
    if (state.title.abbr === undefined) delete result.abbr;
    else result.abbr = state.title.abbr;
  }
  return result;
}

function roundTripState(current: LawState, recipe: AnyReconstructionRecipe): { ok: boolean; detail: string } {
  let baseline: LawState;
  try {
    baseline = reverseRecipeState(current, recipe);
  } catch (error) {
    return { ok: false, detail: `Rückwärts: ${(error as Error).message}` };
  }
  let forward: LawState;
  try {
    forward = forwardLawSteps(baseline, forwardOrder(recipe));
  } catch (error) {
    return { ok: false, detail: `Vorwärts: ${(error as Error).message}` };
  }
  const expected = stableStringify(current.body);
  const actual = stableStringify(forward.body);
  if (actual !== expected) {
    let at = 0;
    while (at < expected.length && expected[at] === actual[at]) at += 1;
    return { ok: false, detail: `Rundlauf weicht ab bei Zeichen ${at}: erwartet „${expected.slice(Math.max(0, at - 30), at + 30)}“, erhalten „${actual.slice(Math.max(0, at - 30), at + 30)}“` };
  }
  if (current.title && (!forward.title || !sameTitle(forward.title, current.title))) return { ok: false, detail: `Rundlauf der Überschrift weicht ab: erwartet „${current.title.title}“, erhalten „${forward.title?.title ?? '–'}“` };
  const titleChanged = Boolean(recipe.title && baseline.title && current.title && !sameTitle(baseline.title, current.title));
  if (bodyFingerprint(baseline.body) === recipe.expected.currentFingerprint && !titleChanged) return { ok: false, detail: 'Rückrechnung ändert nichts – kein Nachweis einer Änderung' };
  const amendments = recipeAmendments(recipe);
  const steps = amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0);
  return { ok: true, detail: `Rundlauf exakt: ${amendments.length} Änderung(en), ${steps} Schritt(e), ${recipe.expected.baselineFingerprint.slice(0, 16)} → ${recipe.expected.currentFingerprint.slice(0, 16)}${recipe.title ? `; Überschrift „${recipe.title.baseline.title.slice(0, 60)}“ → „${recipe.title.current.title.slice(0, 60)}“` : ''}` };
}

/**
 * Beweis durch Rundlauf: rückwärts, dann vorwärts (Forward-Replay: Stichtagskörper plus alle Änderungen, älteste
 * zuerst) – das Ergebnis muss **exakt** der heutige Körper sein (kanonisches JSON, ohne jede Normalisierung).
 * Rezepte mit Titelschritten lehnt diese Funktion ab (`verifyRoundTripLaw`).
 */
export function verifyRoundTrip(currentBody: readonly NormBodyBlock[], recipe: AnyReconstructionRecipe, options?: RecipeApplyOptions): { ok: boolean; detail: string } {
  if (recipeChangesTitle(recipe)) return { ok: false, detail: `${recipe.documentId}: ${TITLE_RECIPE}` };
  const refused = refuseRestoration(recipe, options);
  if (refused) return { ok: false, detail: refused };
  return roundTripState({ body: currentBody as NormBodyBlock[] }, recipe);
}

/** Rundlauf über die ganze Norm: Körper und – bei Titelschritten – Überschrift (`title`, `shortTitle`, `abbr`). */
export function verifyRoundTripLaw(law: LawTitleFields, recipe: AnyReconstructionRecipe, options?: RecipeApplyOptions): { ok: boolean; detail: string } {
  const refused = refuseRestoration(recipe, options);
  if (refused) return { ok: false, detail: refused };
  return roundTripState({ body: law.body, ...(recipe.title ? { title: titleState(law) } : {}) }, recipe);
}
