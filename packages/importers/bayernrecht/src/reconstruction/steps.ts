/**
 * Eine Änderung zurücknehmen: Befehlsblock → Befehle → Schritte, **rückwärts im jeweils aktuellen Zustand**.
 *
 * Die Befehle einer Änderung werden in ihrer Reihenfolge ausgeführt; die Ortsangabe eines Befehls bezieht sich auf
 * den Stand, den die vorangehenden Befehle hinterlassen haben (etwa die neue Zählung nach „Der bisherige Abs. 3
 * wird Abs. 4.“). Rückwärts wird deshalb der **letzte** Befehl zuerst aufgelöst – im heutigen Körper –, dann der
 * vorletzte im Körper ohne den letzten und so fort. Jeder Schritt hält seinen aufgelösten Bereich fest; vorwärts
 * werden die Schritte in Befehlsreihenfolge auf denselben Bereichen wieder angewandt.
 *
 * Ein Befehl, der ein Glied umnummeriert und zugleich ändert („Der bisherige § 5 wird § 6 und wie folgt
 * geändert:“), ist zuerst eine Umnummerierung; seine Unterbefehle gelten für das Glied unter der **neuen**
 * Bezeichnung.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import type { ReconstructionState } from '../baseline/reconstruction.ts';
import { applyBackward, applyForward, ReconstructionError } from './apply.ts';
import { containerLocation, NON_INVERTIBLE_FORMULAS, parseCommand, SUPPORTED_FORMULAS, type FormulaId, type Operation, type ParsedOperation } from './formulas.ts';
import { blockAt, formatPath, parseLocation, resolvePath, type LocationPath } from './location.ts';
import { stableStringify, type RecipeStep, type ScopeRecord } from './recipe.ts';
import { parseStructural, realize, StructuralError, structuralEvidence, type StructuralOperation, type StructuralParse, type StructuralTemplate } from './structural.ts';
import type { CommandBlock, CommandNode } from './structure.ts';

export interface StepFailure {
  state: ReconstructionState;
  reason: string;
  detail: string;
}

interface Leaf {
  node: CommandNode;
  context: LocationPath[];
  labels: string[];
  command: string;
  structural?: StructuralParse;
  /** Befehl mit Untergliederung, der weder Gliederung noch Umnummerierung ist. */
  hasChildren?: boolean;
  /** Nur für die Formelstatistik gelesen (Ort nicht bestimmbar). */
  statisticsOnly?: boolean;
}

/** Unbestimmter Ort für Unterbefehle, deren Bezug nicht auflösbar ist (nur Statistik). */
const UNDETERMINED: LocationPath = [{ kind: 'teil', value: '<unbestimmt>' }];

/** Blätter des Befehlsbaums mit dem Ort ihrer übergeordneten Befehle. */
export function commandLeaves(block: CommandBlock): { leaves: Leaf[]; failures: string[] } {
  const leaves: Leaf[] = [];
  const failures: string[] = [];
  const base: LocationPath[] = [];
  const opensList = block.commands.some((node) => node.depth >= 1);
  if (opensList) {
    const introPaths = parseLocation(block.introPrefix);
    if (!introPaths || introPaths.length !== 1) failures.push(`Ortsangabe des Einleitungssatzes nicht lesbar: „${block.introPrefix}“`);
    else if (introPaths[0]!.length > 0) base.push(introPaths[0]!);
    if (block.introScope !== undefined) {
      const scoped = parseLocation(block.introScope);
      if (!scoped || scoped.length !== 1) failures.push(`Ortsangabe „${block.introScope}“ nicht lesbar`);
      else base.push(scoped[0]!);
    }
  }
  const walk = (nodes: readonly CommandNode[], context: LocationPath[], labels: string[], statisticsOnly: boolean): void => {
    for (const node of nodes) {
      const nodeLabels = node.label ? [...labels, node.label] : labels;
      const container = containerLocation(node.text);
      if (container !== undefined && node.children.length > 0) {
        const paths = parseLocation(container);
        if (!paths || paths.length !== 1) {
          if (!statisticsOnly) failures.push(`Ortsangabe „${container}“ nicht lesbar (${nodeLabels.join(' ')})`);
          walk(node.children, [...context, UNDETERMINED], nodeLabels, true);
          continue;
        }
        walk(node.children, [...context, paths[0]!], nodeLabels, statisticsOnly);
        continue;
      }
      const quoted = node.quoted.map((unit) => `${unit.label ? `${unit.label} ` : ''}${unit.text}`).join(' ');
      const structural = parseStructural(node.text, context, node.quoted);
      const leaf: Leaf = { node, context, labels: nodeLabels, command: quoted === '' ? node.text : `${node.text} ${quoted}`, ...(structural ? { structural } : {}), ...(statisticsOnly ? { statisticsOnly } : {}) };
      if (node.children.length > 0) {
        // „Der bisherige § 5 wird § 6 und wie folgt geändert:“ – Unterbefehle am Glied unter neuer Bezeichnung.
        const template = structural?.templates?.[0];
        if (structural?.formula === 'relabel' && template?.kind === 'relabel' && template.pairs.length === 1 && /wie\s+folgt\s+geändert\s*:\s*$/u.test(node.text)) {
          leaves.push(leaf);
          walk(node.children, [...context, [template.pairs[0]![1]]], nodeLabels, statisticsOnly);
          continue;
        }
        leaves.push({ ...leaf, hasChildren: true });
        walk(node.children, [...context, UNDETERMINED], nodeLabels, true);
        continue;
      }
      leaves.push(leaf);
    }
  };
  walk(block.commands, base, [], false);
  return { leaves, failures };
}

/** Ein Befehl als Folge von Vorlagen (strukturell) oder Operationen mit Orten (Wortlaut). */
type Parsed = { formulas: FormulaId[]; items?: Array<{ formula: FormulaId; template?: StructuralTemplate; parsed?: ParsedOperation }>; reason?: string };

function parseLeaf(leaf: Leaf): Parsed {
  if (leaf.structural) {
    const formula = leaf.structural.formula as FormulaId;
    if (!leaf.structural.templates) return { formulas: [formula], reason: leaf.structural.reason ?? 'nicht lesbar' };
    return { formulas: [formula], items: leaf.structural.templates.map((template) => ({ formula, template })) };
  }
  const command = parseCommand(leaf.node.text, leaf.context);
  if (!command.operations) return { formulas: command.formulas, reason: command.reason ?? 'nicht unterstützt' };
  return { formulas: command.formulas, items: command.operations.map((parsed) => ({ formula: parsed.formula, parsed })) };
}

export interface AmendmentReversal {
  /** Schritte in Befehlsreihenfolge (vorwärts). */
  steps: RecipeStep[];
  /** Körper vor der Änderung (rückgerechnet). */
  before?: NormBodyBlock[];
  formulas: FormulaId[];
  failures: StepFailure[];
}

const snippet = (text: string, position: number, length: number): string => {
  const start = Math.max(0, position - 60);
  const end = Math.min(text.length, position + length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

function failureFor(formula: FormulaId, detail: string): StepFailure {
  if (formula === 'annex-recast') return { state: 'asset-missing', reason: formula, detail };
  if (NON_INVERTIBLE_FORMULAS.has(formula)) return { state: 'non-invertible-amendment', reason: formula, detail };
  return { state: 'unsupported-formula', reason: formula, detail };
}

const codeState = (code: string): ReconstructionState => (code === 'target-ambiguous' || code === 'end-not-determined' || code === 'location-unresolved' || code === 'sentence-ambiguous' || code === 'renumber-ambiguous' || code === 'anchor-mismatch' ? 'ambiguous-target' : code === 'image-in-inserted-unit' ? 'asset-missing' : 'round-trip-failed');

/**
 * Nimmt eine Änderung zurück: `after` ist der Körper mit der Änderung (bei der jüngsten der heutige). `idPrefix`
 * unterscheidet die Schritte mehrerer Änderungen (`a1-s01`). Scheitert ausdrücklich, statt zu raten.
 */
export function reverseAmendment(after: readonly NormBodyBlock[], block: CommandBlock, idPrefix = ''): AmendmentReversal {
  const result: AmendmentReversal = { steps: [], formulas: [], failures: [] };
  const { leaves, failures: structureFailures } = commandLeaves(block);
  for (const message of structureFailures) result.failures.push({ state: 'command-unreadable', reason: 'location-unreadable', detail: message });
  const parsed = leaves.map((leaf) => ({ leaf, parsed: parseLeaf(leaf) }));
  for (const { leaf, parsed: command } of parsed) {
    result.formulas.push(...command.formulas);
    if (leaf.statisticsOnly) continue;
    const label = leaf.labels.length > 0 ? `${leaf.labels.join(' ')} ` : '';
    if (leaf.hasChildren) {
      result.failures.push({ state: 'unsupported-formula', reason: 'unrecognized', detail: `${label}„${leaf.node.text.slice(0, 140)}“: Befehl mit eigener Änderung und Untergliederung` });
      continue;
    }
    if (!command.items) {
      const worst = command.formulas.find((formula) => NON_INVERTIBLE_FORMULAS.has(formula)) ?? command.formulas.find((formula) => !SUPPORTED_FORMULAS.has(formula)) ?? command.formulas[0]!;
      result.failures.push(failureFor(worst, `${label}„${leaf.node.text.slice(0, 140)}“: ${command.reason ?? ''}`));
    }
  }
  // Numbering-Befehle („Der Wortlaut wird Satz 1“) je Ort: dann nummeriert kein angefügter Satz implizit.
  const explicit = new Set(parsed.flatMap(({ parsed: command }) => (command.items ?? []).filter((item) => item.template?.kind === 'number-sentences').map((item) => formatPath((item.template as { context: LocationPath }).context))));
  if (result.failures.length > 0) return result;

  // Rückwärts: letzter Befehl zuerst, je im aktuellen Zustand aufgelöst.
  const working = structuredClone(after) as NormBodyBlock[];
  const collected: RecipeStep[][] = [];
  try {
    for (const { leaf, parsed: command } of [...parsed].reverse()) {
      const leafSteps: RecipeStep[] = [];
      for (const item of [...command.items!].reverse()) {
        const realizedSteps: RecipeStep[] = [];
        if (item.template) {
          const realized = realize(working, item.template, `${leaf.labels.join(' ')}`, explicit.has(formatPath((item.template as { context: LocationPath }).context)));
          for (const entry of realized) {
            const scope: ScopeRecord = { fields: entry.field ? [entry.field] : [], resolved: entry.resolved, widened: entry.widened };
            realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: item.formula, location: entry.location, scope, operation: entry.operation as Operation, evidence: structuralEvidence(entry.operation) });
          }
        } else {
          const operation = item.parsed!;
          const scopes: ScopeRecord[] = [];
          for (const path of operation.locations) {
            const resolved = resolvePath(working, path);
            if (!resolved.ok) throw new ReconstructionError('location-unresolved', `${leaf.labels.join(' ')} ${formatPath(path)}: ${resolved.reason}`);
            scopes.push(resolved.scope);
          }
          if (scopes.length > 1) {
            const seen = new Set<string>();
            for (const scope of scopes) {
              for (const field of scope.fields) {
                const key = `${field.path.join('.')}:${field.key}`;
                if (seen.has(key)) throw new ReconstructionError('overlapping-locations', `${leaf.labels.join(' ')}: die Orte von „jeweils“ überschneiden sich`);
                seen.add(key);
              }
            }
          }
          operation.locations.forEach((path, index) => {
            realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: operation.formula, location: formatPath(path), scope: scopes[index]!, operation: operation.operation, evidence: { baseline: '', current: '' } });
          });
        }
        // Rückwärts in umgekehrter Reihenfolge der konkreten Schritte.
        for (const step of [...realizedSteps].reverse()) applyBackward(working, step.scope, step.operation, `${leaf.labels.join(' ')} ${step.location}`);
        leafSteps.unshift(...realizedSteps);
      }
      collected.unshift(leafSteps);
    }
  } catch (error) {
    const code = error instanceof ReconstructionError || error instanceof StructuralError ? error.code : 'error';
    result.failures.push({ state: codeState(code), reason: `reverse-${code}`, detail: (error as Error).message });
    return result;
  }
  const steps = collected.flat();
  steps.forEach((step, index) => {
    step.id = `${idPrefix}s${String(index + 1).padStart(2, '0')}`;
  });

  // Vorwärts, Schritt für Schritt, mit Vorher-/Nachher-Beleg; das Ergebnis muss exakt der Körper nach der Änderung sein.
  const walker = structuredClone(working) as NormBodyBlock[];
  try {
    for (const step of steps) {
      const beforeBody = structuredClone(walker) as NormBodyBlock[];
      const at = applyForward(walker, step.scope, step.operation, step.id);
      if (step.evidence.baseline === '' && step.evidence.current === '') {
        const before = String(blockAt(beforeBody, at.ref.path)?.[at.ref.key] ?? '');
        const afterText = String(blockAt(walker, at.ref.path)?.[at.ref.key] ?? '');
        step.evidence = { baseline: snippet(before, at.position, Math.max(0, before.length - afterText.length)), current: snippet(afterText, at.position, Math.max(0, afterText.length - before.length)) };
      }
    }
  } catch (error) {
    const code = error instanceof ReconstructionError ? error.code : 'error';
    result.failures.push({ state: code === 'target-ambiguous' ? 'ambiguous-target' : 'round-trip-failed', reason: `forward-${code}`, detail: (error as Error).message });
    return result;
  }
  if (stableStringify(walker) !== stableStringify(after)) {
    result.failures.push({ state: 'round-trip-failed', reason: 'round-trip', detail: 'Vorwärts angewandt ergibt der rückgerechnete Körper nicht den Körper nach der Änderung' });
    return result;
  }
  if (stableStringify(working) === stableStringify(after)) {
    result.failures.push({ state: 'round-trip-failed', reason: 'no-change', detail: 'Rücknahme ändert nichts' });
    return result;
  }
  result.steps = steps;
  result.before = working;
  return result;
}

export type { StructuralOperation };
