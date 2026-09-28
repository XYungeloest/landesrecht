/**
 * Konsolidierungsengine der Simulationsrechtsfortschreibung – Port von OstRecht
 * (`../staatsregierung/scripts/lib/consolidation-engine.mjs`, `applyPatchRecipe`) mit identischem Verhalten:
 *
 *   - jede Operation nennt Zielanker, Hash- oder Alttexterwartung, erwartete Trefferzahl, Quelle,
 *     Änderungsstelle und Wirkdatum (`assertOperationContract`);
 *   - null oder mehrere Treffer (`locateExactlyOne`), ein abweichender Hash oder ein abweichender Alttext
 *     (`assertExpectedBlock`) und ein vom Rezept abweichendes Wirkdatum brechen ab – fail closed, nie Raten;
 *   - Hashes sind `sha256(canonicalJson(block))` (`hash.ts`); `repealLaw` hasht `{ title, body }`,
 *     `replaceBody` den Normkörper, `replaceSiblingRange` den Geschwisterbereich.
 *
 * Die Engine arbeitet auf dem **rohen** JSON der gespeicherten Fassung (keine Normalisierung), damit die
 * von Rezeptautoren über der Datei berechneten Hashes gelten. Sie kennt weder Dateien noch Fassungen; das
 * übernimmt `consolidate/`.
 */
import { sha256 } from './hash.ts';

export const CONSOLIDATION_OPERATIONS = [
  'replaceProvision',
  'replaceBody',
  'replaceSiblingRange',
  'replaceText',
  'insertProvisionBefore',
  'insertProvisionAfter',
  'insertParagraph',
  'repealProvision',
  'deleteProvision',
  'renameProvision',
  'renameLaw',
  'replaceHeading',
  'amendTable',
  'appendAnnex',
  'designationReplacement',
  'designationReplacementBody',
  'repealLaw',
] as const;
export type ConsolidationOperationName = (typeof CONSOLIDATION_OPERATIONS)[number];

/** Operationen ohne Zielanker: sie wirken auf Titel oder ganzen Normkörper. */
export const OPERATIONS_WITHOUT_TARGET: readonly ConsolidationOperationName[] = ['renameLaw', 'repealLaw', 'replaceBody', 'designationReplacementBody'];
/** Operationen, deren `value` ein einzelner Block ist. */
export const OPERATIONS_WITH_BLOCK_VALUE: readonly ConsolidationOperationName[] = ['replaceProvision', 'insertProvisionBefore', 'insertProvisionAfter', 'insertParagraph', 'amendTable', 'appendAnnex'];
/** Operationen, deren `value` eine Blockliste ist. */
export const OPERATIONS_WITH_BLOCK_LIST_VALUE: readonly ConsolidationOperationName[] = ['replaceBody', 'replaceSiblingRange'];
/** Operationen, deren `value` ein String ist. */
export const OPERATIONS_WITH_TEXT_VALUE: readonly ConsolidationOperationName[] = ['replaceText', 'renameProvision', 'renameLaw', 'replaceHeading', 'designationReplacement', 'designationReplacementBody'];

export interface OperationTarget {
  type?: string;
  label?: string;
  title?: string;
  text?: string;
  parentType?: string;
  parentLabel?: string;
}

/** Roher Body-Block einer gespeicherten Fassung (unnormalisiertes JSON). */
export interface RawBlock {
  [key: string]: unknown;
  type?: string;
  label?: string;
  title?: string;
  text?: string;
  children?: RawBlock[];
}

export interface ConsolidationOperation {
  op: string;
  target?: OperationTarget;
  /** Nur `replaceSiblingRange`: letzter Block des zu ersetzenden Bereichs (dieselbe Geschwisterliste). */
  throughTarget?: OperationTarget;
  /** `replaceText`: Feld des Zielblocks (Standard `text`); `renameLaw`: `title` | `shortTitle` | `abbr` (Standard `title`). */
  field?: string;
  expectedHash?: string;
  expectedOld?: string;
  expectedMatches?: number;
  value?: unknown;
  /** Nur `insertParagraph`: Einfügeposition in den Kindern des Ziels (Standard Ende). */
  position?: 'start' | 'end';
  source?: string;
  sourceProvision?: string;
  effectiveDate?: string;
}

export interface PatchRecipe {
  amendmentAct?: string;
  effectiveDate: string;
  operations: readonly ConsolidationOperation[];
}

/** Zustand einer Norm während der Konsolidierung: Titel, roher Körper, Aufhebungsmarke. */
export interface ConsolidationState {
  title: string;
  /** Kurzbezeichnung und Abkürzung der Fassung (renameLaw mit `field`). */
  shortTitle?: string;
  abbr?: string;
  body: RawBlock[];
  repealed?: boolean;
}

/** Felder der Normbezeichnung, die `renameLaw` umbenennen kann (Standard `title`). */
export const RENAME_LAW_FIELDS = ['title', 'shortTitle', 'abbr'] as const;
export type RenameLawField = (typeof RENAME_LAW_FIELDS)[number];

export class ConsolidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsolidationError';
  }
}

interface BlockLocation {
  block: RawBlock;
  parent: RawBlock | null;
  siblings: RawBlock[];
  index: number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function walk(blocks: RawBlock[], visitor: (block: RawBlock, location: Omit<BlockLocation, 'block'>) => void, parent: RawBlock | null = null): void {
  for (const [index, block] of blocks.entries()) {
    visitor(block, { parent, siblings: blocks, index });
    if (Array.isArray(block.children)) walk(block.children, visitor, block);
  }
}

function matchesTarget(block: RawBlock, target: OperationTarget, parent: RawBlock | null): boolean {
  return (!target.type || block.type === target.type)
    && (!target.label || block.label === target.label)
    && (!target.title || block.title === target.title)
    && (!target.text || block.text === target.text)
    && (!target.parentType || parent?.type === target.parentType)
    && (!target.parentLabel || parent?.label === target.parentLabel);
}

/** Alle Treffer eines Zielankers (Ergebnisprüfungen mit Trefferzahl). */
export function locateAll(body: RawBlock[], target: OperationTarget): RawBlock[] {
  const matches: RawBlock[] = [];
  walk(body, (block, location) => {
    if (matchesTarget(block, target, location.parent)) matches.push(block);
  });
  return matches;
}

/** Genau ein Treffer des Zielankers – sonst Abbruch (0 oder > 1 Treffer). */
export function locateExactlyOne(body: RawBlock[], target: OperationTarget, operation: string): BlockLocation {
  const matches: BlockLocation[] = [];
  walk(body, (block, location) => {
    if (matchesTarget(block, target, location.parent)) matches.push({ block, ...location });
  });
  if (matches.length !== 1) {
    throw new ConsolidationError(`${operation}: Ziel ${JSON.stringify(target)} hat ${matches.length} statt genau einem Treffer`);
  }
  return matches[0]!;
}

function isBlock(value: unknown): value is RawBlock {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Vertrag jeder Operation (Pflichtfelder, Zielanker, Erwartung, Trefferzahl, Wertform). */
export function assertOperationContract(operation: ConsolidationOperation): asserts operation is ConsolidationOperation & { op: ConsolidationOperationName; expectedMatches: number } {
  if (!(CONSOLIDATION_OPERATIONS as readonly string[]).includes(operation.op)) {
    throw new ConsolidationError(`nicht unterstützte Konsolidierungsoperation: ${operation.op}`);
  }
  const op = operation.op as ConsolidationOperationName;
  for (const field of ['source', 'sourceProvision', 'effectiveDate'] as const) {
    if (!operation[field]) throw new ConsolidationError(`${op}: Pflichtfeld ${field} fehlt`);
  }
  if (operation.expectedMatches === undefined) {
    throw new ConsolidationError(`${op}: Pflichtfeld expectedMatches fehlt`);
  }
  if (!OPERATIONS_WITHOUT_TARGET.includes(op) && !operation.target) {
    throw new ConsolidationError(`${op}: eindeutiger Zielanker fehlt`);
  }
  if (!operation.expectedHash && operation.expectedOld === undefined && op !== 'renameLaw') {
    throw new ConsolidationError(`${op}: expectedHash oder expectedOld fehlt`);
  }
  if (!Number.isInteger(operation.expectedMatches) || operation.expectedMatches < 1) {
    throw new ConsolidationError(`${op}: expectedMatches muss mindestens 1 sein`);
  }
  if (OPERATIONS_WITH_TEXT_VALUE.includes(op) && typeof operation.value !== 'string') {
    throw new ConsolidationError(`${op}: value muss ein String sein`);
  }
  if ((op === 'designationReplacement' || op === 'designationReplacementBody') && typeof operation.expectedOld !== 'string') {
    throw new ConsolidationError(`${op}: expectedOld (zu ersetzende Bezeichnung) muss ein String sein`);
  }
  if (OPERATIONS_WITH_BLOCK_VALUE.includes(op) && !isBlock(operation.value)) {
    throw new ConsolidationError(`${op}: value muss ein Block (Objekt) sein`);
  }
  if (op === 'repealProvision' && operation.value !== undefined && typeof operation.value !== 'string') {
    throw new ConsolidationError('repealProvision: value (Wegfallvermerk) muss ein String sein');
  }
}

/** Hash- und Alttexterwartung am gefundenen Zielblock. */
export function assertExpectedBlock(block: RawBlock, operation: ConsolidationOperation): void {
  if (operation.expectedHash && sha256(block) !== operation.expectedHash) {
    throw new ConsolidationError(`${operation.op}: Zielhash weicht ab (${sha256(block)} statt ${operation.expectedHash})`);
  }
  if (operation.expectedOld !== undefined && operation.op !== 'designationReplacement') {
    const field = operation.field ?? 'text';
    if (block[field] !== operation.expectedOld) {
      throw new ConsolidationError(`${operation.op}: erwarteter alter Wert in ${field} wurde nicht gefunden`);
    }
  }
}

/** Ersetzt eine Bezeichnung in allen Stringfeldern eines Werts und zählt die Treffer. */
export function replaceInObject<T>(value: T, oldText: string, newText: string): { value: T; matches: number } {
  let matches = 0;
  const visit = (entry: unknown): unknown => {
    if (typeof entry === 'string') {
      const parts = entry.split(oldText);
      matches += parts.length - 1;
      return parts.join(newText);
    }
    if (Array.isArray(entry)) return entry.map(visit);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(Object.entries(entry as Record<string, unknown>).map(([key, child]) => [key, visit(child)]));
    }
    return entry;
  };
  return { value: visit(value) as T, matches };
}

/**
 * Wendet ein Patch-Rezept auf einen Zustand an und liefert den neuen Zustand (Eingabe bleibt unverändert).
 * Jede Operation muss das Wirkdatum des Rezepts tragen.
 */
export function applyPatchRecipe(input: ConsolidationState, recipe: PatchRecipe): ConsolidationState {
  const result = clone(input);
  if (!Array.isArray(recipe.operations) || recipe.operations.length === 0) {
    throw new ConsolidationError(`${recipe.amendmentAct ?? 'Patch-Rezept'}: operations fehlt`);
  }

  for (const operation of recipe.operations) {
    assertOperationContract(operation);
    if (operation.effectiveDate !== recipe.effectiveDate) {
      throw new ConsolidationError(`${operation.op}: Wirksamkeitsdatum weicht vom Rezept ab`);
    }

    if (operation.op === 'renameLaw') {
      if (operation.expectedMatches !== 1) {
        throw new ConsolidationError('renameLaw: genau ein Titeltreffer ist erforderlich');
      }
      const field = (operation.field ?? 'title') as RenameLawField;
      if (!RENAME_LAW_FIELDS.includes(field)) throw new ConsolidationError(`renameLaw: unbekanntes Feld ${field}`);
      if (result[field] === operation.value) continue;
      if (!operation.expectedOld || result[field] !== operation.expectedOld) {
        throw new ConsolidationError(`renameLaw: erwarteter bisheriger Wert von ${field} wurde nicht gefunden`);
      }
      result[field] = operation.value as string;
      continue;
    }
    if (operation.op === 'repealLaw') {
      if (operation.expectedMatches !== 1) {
        throw new ConsolidationError('repealLaw: genau ein Normtreffer ist erforderlich');
      }
      const currentHash = sha256({ title: result.title, body: result.body });
      if (currentHash !== operation.expectedHash) {
        throw new ConsolidationError(`repealLaw: Zielhash weicht ab (${currentHash} statt ${operation.expectedHash})`);
      }
      result.repealed = true;
      continue;
    }
    if (operation.op === 'replaceBody') {
      if (operation.expectedMatches !== 1 || !Array.isArray(operation.value)) {
        throw new ConsolidationError('replaceBody: genau ein Normkörper und ein Array als value sind erforderlich');
      }
      const currentHash = sha256(result.body);
      if (currentHash !== operation.expectedHash) {
        throw new ConsolidationError(`replaceBody: Zielhash weicht ab (${currentHash} statt ${operation.expectedHash})`);
      }
      result.body = clone(operation.value as RawBlock[]);
      continue;
    }
    if (operation.op === 'designationReplacementBody') {
      const replacement = replaceInObject(result.body, operation.expectedOld as string, operation.value as string);
      if (replacement.matches !== operation.expectedMatches) {
        throw new ConsolidationError(`designationReplacementBody (${operation.sourceProvision} / ${JSON.stringify(operation.expectedOld)}): ${replacement.matches} statt ${operation.expectedMatches} Treffer`);
      }
      result.body = replacement.value;
      continue;
    }

    const location = locateExactlyOne(result.body, operation.target!, operation.op);
    if (operation.op !== 'designationReplacement' && operation.expectedMatches !== 1) {
      throw new ConsolidationError(`${operation.op}: genau ein Zieltreffer ist erforderlich`);
    }
    if (operation.op === 'replaceSiblingRange') {
      if (!operation.throughTarget || !Array.isArray(operation.value)) {
        throw new ConsolidationError('replaceSiblingRange: throughTarget und ein Array als value sind erforderlich');
      }
      const end = locateExactlyOne(result.body, operation.throughTarget, operation.op);
      if (location.siblings !== end.siblings || end.index < location.index) {
        throw new ConsolidationError('replaceSiblingRange: Anfang und Ende müssen in derselben Geschwisterliste in richtiger Reihenfolge liegen');
      }
      const current = location.siblings.slice(location.index, end.index + 1);
      if (!operation.expectedHash || sha256(current) !== operation.expectedHash) {
        throw new ConsolidationError(`replaceSiblingRange: Bereichshash weicht ab (${sha256(current)} statt ${operation.expectedHash})`);
      }
      location.siblings.splice(location.index, current.length, ...clone(operation.value as RawBlock[]));
      continue;
    }
    assertExpectedBlock(location.block, operation);

    if (operation.op === 'replaceProvision') {
      location.siblings.splice(location.index, 1, clone(operation.value as RawBlock));
    } else if (operation.op === 'insertProvisionBefore') {
      location.siblings.splice(location.index, 0, clone(operation.value as RawBlock));
    } else if (operation.op === 'insertProvisionAfter') {
      location.siblings.splice(location.index + 1, 0, clone(operation.value as RawBlock));
    } else if (operation.op === 'insertParagraph') {
      location.block.children ??= [];
      const index = operation.position === 'start' ? 0 : location.block.children.length;
      location.block.children.splice(index, 0, clone(operation.value as RawBlock));
    } else if (operation.op === 'deleteProvision') {
      location.siblings.splice(location.index, 1);
    } else if (operation.op === 'repealProvision') {
      const replacement = (operation.value as string | undefined) ?? '(weggefallen)';
      if (Object.hasOwn(location.block, 'text')) {
        location.block.text = replacement;
        location.block.children = [];
      } else {
        location.block.children = [{ type: 'paragraphText', text: replacement }];
      }
    } else if (operation.op === 'renameProvision') {
      location.block.label = operation.value as string;
    } else if (operation.op === 'replaceHeading') {
      location.block.title = operation.value as string;
    } else if (operation.op === 'amendTable') {
      if (location.block.type !== 'table') throw new ConsolidationError('amendTable: Ziel ist keine Tabelle');
      location.siblings.splice(location.index, 1, clone(operation.value as RawBlock));
    } else if (operation.op === 'appendAnnex') {
      result.body.push(clone(operation.value as RawBlock));
    } else if (operation.op === 'replaceText') {
      const field = operation.field ?? 'text';
      location.block[field] = operation.value;
    } else if (operation.op === 'designationReplacement') {
      const replacement = replaceInObject(location.block, operation.expectedOld as string, operation.value as string);
      const expectedMatches = operation.expectedMatches ?? 1;
      if (replacement.matches !== expectedMatches) {
        throw new ConsolidationError(`designationReplacement (${operation.sourceProvision} / ${JSON.stringify(operation.expectedOld)}): ${replacement.matches} statt ${expectedMatches} Treffer`);
      }
      location.siblings.splice(location.index, 1, replacement.value);
    }
  }

  return result;
}
