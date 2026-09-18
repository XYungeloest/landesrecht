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
      const listed = listedReplacement(node);
      if (listed !== undefined) {
        // „In Satz 1 werden ersetzt:“ – „das Wort „A“ durch das Wort „B“ und“ – „das Wort „C“ durch das Wort „D“.“
        // (BayMBl. 2023 Nr. 632, 647): ein Befehl, dessen Paare als Unterglieder gesetzt sind.
        const command = `${node.text} ${node.children.map((child) => child.text).join(' ')}`;
        leaves.push({ node: { ...node, text: listed, children: [] }, context, labels: nodeLabels, command, ...(statisticsOnly ? { statisticsOnly } : {}) });
        continue;
      }
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
      // „Nach Nr. 1.2 wird folgende Nr. 1.3 angefügt.“ mit folgendem Zitat: für die Erkennung wie mit Doppelpunkt.
      const parseText = node.quoted.length > 0 ? node.text.replace(/\.\s*$/u, ':') : node.text;
      const structural = parseStructural(parseText, context, node.quoted);
      const leaf: Leaf = { node: parseText === node.text ? node : { ...node, text: parseText }, context, labels: nodeLabels, command: quoted === '' ? node.text : `${node.text} ${quoted}`, ...(structural ? { structural } : {}), ...(statisticsOnly ? { statisticsOnly } : {}) };
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

const LISTED_PAIR = /^(?:das\s+Wort|die\s+Wörter|die\s+Angabe|die\s+Angaben)\s+„[^„“]*(?:„[^„“]*“[^„“]*)*“\s+durch\s+(?:das\s+Wort|die\s+Wörter|die\s+Angabe|die\s+Angaben)\s+„[^„“]*(?:„[^„“]*“[^„“]*)*“\s*(?:und|,|;|\.)?$/u;

/**
 * Ersetzung mit untergliederten Paaren → ein Befehlssatz („In Satz 1 werden das Wort „A“ durch das Wort „B“ und das
 * Wort „C“ durch das Wort „D“ ersetzt.“), sonst `undefined`. Jedes Unterglied muss genau ein Paar sein.
 */
function listedReplacement(node: CommandNode): string | undefined {
  const head = /^(.+?\s(?:wird|werden))\s+ersetzt\s*:\s*$/u.exec(node.text.trim());
  if (!head || node.quoted.length > 0 || node.children.length < 2) return undefined;
  if (!node.children.every((child) => child.children.length === 0 && child.quoted.length === 0 && LISTED_PAIR.test(child.text.trim()))) return undefined;
  const parts = node.children.map((child) => child.text.trim().replace(/\s*[,;.]$/u, ''));
  const last = parts.length - 1;
  const joined = parts.map((part, index) => (index < last ? (/\sund$/u.test(part) ? part : `${part},`) : part.replace(/\s+und$/u, ''))).join(' ');
  return `${head[1]} ${joined} ersetzt.`;
}

/**
 * Befehle in Bearbeitungsgruppen (Indizes, vorwärts): Läufe aufeinanderfolgender Umnummerierungen am selben Ort bilden
 * eine Gruppe, jeder andere Befehl eine eigene.
 */
function relabelRuns(parsed: ReadonlyArray<{ leaf: Leaf; parsed: Parsed }>): number[][] {
  const contextOf = (index: number): string | undefined => {
    const template = parsed[index]!.parsed.items?.[0]?.template;
    return template?.kind === 'relabel' ? formatPath(template.context) : undefined;
  };
  const groups: number[][] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const context = contextOf(index);
    const last = groups.at(-1);
    if (context !== undefined && last && contextOf(last.at(-1)!) === context && last.at(-1) === index - 1) last.push(index);
    else groups.push([index]);
  }
  return groups;
}

/** Ein Befehl als Folge von Vorlagen (strukturell) oder Operationen mit Orten (Wortlaut). */
type Parsed = { formulas: FormulaId[]; items?: Array<{ formula: FormulaId; template?: StructuralTemplate; parsed?: ParsedOperation }>; reason?: string };

function parseLeaf(leaf: Leaf): Parsed {
  if (leaf.structural) {
    const formula = leaf.structural.formula as FormulaId;
    if (!leaf.structural.templates) return { formulas: [formula], reason: leaf.structural.reason ?? 'nicht lesbar' };
    const items: NonNullable<Parsed['items']> = leaf.structural.templates.map((template) => ({ formula, template }));
    const followUp = leaf.structural.followUp;
    if (!followUp) return { formulas: [formula], items };
    // Weiterer Befehl im selben Satz, am umnummerierten Glied (nach der Umnummerierung ausgeführt).
    const command = parseCommand(followUp.text, [followUp.context]);
    if (!command.operations) return { formulas: [formula, ...command.formulas], reason: command.reason ?? 'weiterer Befehl nicht unterstützt' };
    return { formulas: [formula, ...command.formulas], items: [...items, ...command.operations.map((parsed) => ({ formula: parsed.formula, parsed }))] };
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
  type Item = NonNullable<Parsed['items']>[number];
  const realizeItem = (leaf: Leaf, item: Item): RecipeStep[] => {
    const realizedSteps: RecipeStep[] = [];
    if (item.template) {
      const realized = realize(working, item.template, `${leaf.labels.join(' ')}`, explicit.has(formatPath((item.template as { context: LocationPath }).context)));
      for (const entry of realized) {
        const scope: ScopeRecord = { fields: entry.field ? [entry.field] : [], resolved: entry.resolved, widened: entry.widened };
        realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: item.formula, location: entry.location, scope, operation: entry.operation as Operation, evidence: structuralEvidence(entry.operation) });
      }
      return realizedSteps;
    }
    const operation = item.parsed!;
    const scopes: ScopeRecord[] = [];
    for (const path of operation.locations) {
      const resolved = resolvePath(working, path);
      if (!resolved.ok) throw new ReconstructionError('location-unresolved', `${leaf.labels.join(' ')} ${formatPath(path)}: ${resolved.reason}`);
      scopes.push(resolved.scope);
    }
    if (scopes.length > 1) {
      // Dasselbe Feld darf mehrfach vorkommen, wenn die Orte verschiedene Sätze darin sind („In Satz 2 und 3 wird jeweils …“).
      const seen = new Map<string, Set<string>>();
      for (const scope of scopes) {
        for (const field of scope.fields) {
          const key = `${field.path.join('.')}:${field.key}`;
          const sentence = scope.sentence === undefined ? '*' : String(scope.sentence);
          const taken = seen.get(key) ?? new Set<string>();
          if (taken.has(sentence) || (taken.size > 0 && (sentence === '*' || taken.has('*')))) throw new ReconstructionError('overlapping-locations', `${leaf.labels.join(' ')}: die Orte von „jeweils“ überschneiden sich`);
          taken.add(sentence);
          seen.set(key, taken);
        }
      }
    }
    operation.locations.forEach((path, index) => {
      realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: operation.formula, location: formatPath(path), scope: scopes[index]!, operation: operation.operation, evidence: { baseline: '', current: '' } });
    });
    return realizedSteps;
  };
  // Rückwärts in umgekehrter Reihenfolge der konkreten Schritte.
  const undo = (leaf: Leaf, realizedSteps: readonly RecipeStep[]): void => {
    for (const step of [...realizedSteps].reverse()) applyBackward(working, step.scope, step.operation, `${leaf.labels.join(' ')} ${step.location}`);
  };
  try {
    for (const group of [...relabelRuns(parsed)].reverse()) {
      if (group.length === 1) {
        const { leaf, parsed: command } = parsed[group[0]!]!;
        const leafSteps: RecipeStep[] = [];
        for (const item of [...command.items!].reverse()) {
          const realizedSteps = realizeItem(leaf, item);
          undo(leaf, realizedSteps);
          leafSteps.unshift(...realizedSteps);
        }
        collected.unshift(leafSteps);
        continue;
      }
      // Aufeinanderfolgende Umnummerierungen am selben Ort („Der bisherige Buchst. b wird Buchst. c …“ – „Der bisherige
      // Buchst. c wird Buchst. d.“ – „Die bisherigen Buchst. d und e werden die Buchst. e und f.“) nennen die Glieder
      // alle nach der **bisherigen** Zählung: Sie gelten gleichzeitig. Rückwärts werden zuerst die weiteren Befehle
      // dieser Sätze (am Glied unter neuer Bezeichnung) zurückgenommen, dann alle Umnummerierungen als eine.
      const rest = new Map<number, RecipeStep[]>();
      for (const index of [...group].reverse()) {
        const { leaf, parsed: command } = parsed[index]!;
        const leafSteps: RecipeStep[] = [];
        for (const item of command.items!.slice(1).reverse()) {
          const realizedSteps = realizeItem(leaf, item);
          undo(leaf, realizedSteps);
          leafSteps.unshift(...realizedSteps);
        }
        rest.set(index, leafSteps);
      }
      const owners = group.flatMap((index) => (parsed[index]!.parsed.items![0]!.template as Extract<StructuralTemplate, { kind: 'relabel' }>).pairs.map(() => index));
      const first = parsed[group[0]!]!;
      const template = first.parsed.items![0]!.template as Extract<StructuralTemplate, { kind: 'relabel' }>;
      const merged: StructuralTemplate = { kind: 'relabel', context: template.context, pairs: group.flatMap((index) => (parsed[index]!.parsed.items![0]!.template as Extract<StructuralTemplate, { kind: 'relabel' }>).pairs) };
      const realized = realize(working, merged, group.map((index) => parsed[index]!.leaf.labels.join(' ')).join(', '), false);
      const relabels = new Map<number, RecipeStep[]>(group.map((index) => [index, []]));
      for (const entry of realized) {
        const owner = owners[entry.pair!]!;
        const { leaf, parsed: command } = parsed[owner]!;
        relabels.get(owner)!.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: command.items![0]!.formula, location: entry.location, scope: { fields: [], resolved: entry.resolved, widened: entry.widened }, operation: entry.operation as Operation, evidence: structuralEvidence(entry.operation) });
      }
      for (const entry of [...realized].reverse()) applyBackward(working, { fields: [], resolved: entry.resolved, widened: entry.widened }, entry.operation as Operation, `${first.leaf.labels.join(' ')} ${entry.location}`);
      for (const index of [...group].reverse()) collected.unshift([...relabels.get(index)!, ...rest.get(index)!]);
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
