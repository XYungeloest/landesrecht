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
import { applyBackward, ReconstructionError, stepBackward, stepForward, type LawState } from './apply.ts';
import { containerLocation, isParsedDeletion, NON_INVERTIBLE_FORMULAS, parseCommand, SUPPORTED_FORMULAS, type FormulaId, type Operation, type ParsedOperation } from './formulas.ts';
import { blockAt, formatPath, parseLocation, resolvePath, type LocationPath } from './location.ts';
import { stableStringify, type RecipeStep, type ScopeRecord } from './recipe.ts';
import { commandUnitPath, deletionRequest, realizeRestore, RestoreError, restoreRequest, restoreUnit, unitFor, type PublicationBase, type RestoreRequest } from './restore.ts';
import { parseStructural, quoteGroups, realize, StructuralError, structuralEvidence, type StructuralOperation, type StructuralParse, type StructuralTemplate } from './structural.ts';
import type { CommandBlock, CommandNode } from './structure.ts';
import type { GazetteUnit } from './gazette.ts';
import { sameTitle, TITLE_FIELD, TitleError, titleText, type RecipeTitle } from './title.ts';

export interface StepFailure {
  state: ReconstructionState;
  reason: string;
  detail: string;
}

export interface Leaf {
  node: CommandNode;
  context: LocationPath[];
  labels: string[];
  command: string;
  structural?: StructuralParse;
  /** Befehl mit Untergliederung, der weder Gliederung noch Umnummerierung ist. */
  hasChildren?: boolean;
  /** Nur für die Formelstatistik gelesen (Ort nicht bestimmbar). */
  statisticsOnly?: boolean;
  /**
   * Lauf 9: Ort in der **bisherigen** Zählung, wenn ein übergeordneter Befehl umnummeriert („Der bisherige § 3 wird § 4
   * und wie folgt geändert:“). Die Rücknahme arbeitet im heutigen Text unter der neuen Bezeichnung; in der Stammverkündung
   * und im Stand am Stichtag trägt das Glied die bisherige.
   */
  sourceContext?: LocationPath[];
  /**
   * Lauf 9: Befehl an der Inhaltsübersicht („In der Inhaltsübersicht wird …“, „Die Inhaltsübersicht wird gestrichen.“,
   * Unterbefehle von „Die Inhaltsübersicht wird wie folgt geändert:“). Die Inhaltsübersicht ist nicht Wortlaut der
   * Vorschrift; führt der Körper keine, betrifft der Befehl ihn nicht.
   */
  toc?: boolean;
}

/** Unterbefehle, die in Wahrheit zitierter Wortlaut sind (siehe `commandLeaves`); sonst `undefined`. */
function quotedChildren(node: CommandNode): GazetteUnit[] | undefined {
  if (node.children.length === 0 || !/:\s*$/u.test(node.text.trim())) return undefined;
  const units: GazetteUnit[] = [];
  const visit = (entry: CommandNode): void => {
    units.push(entry.unit, ...entry.quoted);
    entry.children.forEach(visit);
  };
  node.children.forEach(visit);
  const ordered = [...new Map(units.map((unit) => [unit.index, unit])).values()].sort((left, right) => left.index - right.index);
  const first = ordered[0];
  if (!first || !/^[„‚]/u.test(`${first.label ?? ''}${first.text}`.trim())) return undefined;
  const groups = quoteGroups(ordered);
  return groups && groups.length > 0 ? ordered : undefined;
}

/** Führt der Körper eine Inhaltsübersicht (Glied mit Überschrift „Inhaltsübersicht“/„Inhaltsverzeichnis“)? */
export function hasTableOfContents(body: readonly NormBodyBlock[]): boolean {
  const visit = (blocks: readonly NormBodyBlock[]): boolean => blocks.some((block) => /^Inhalts(?:übersicht|verzeichnis)$/u.test(String(block.title ?? block.text ?? '').trim()) || visit(block.children ?? []));
  return visit(body);
}

/** Ort ist die Inhaltsübersicht (Inhaltsverzeichnis) der Norm. */
export const TOC_COMMAND = /^(?:(?:In|Im|Der|Die|Dem|Den)\s+(?:der\s+)?)?Inhalts(?:übersicht|verzeichnis)(?![\p{L}])/u;

/** Unbestimmter Ort für Unterbefehle, deren Bezug nicht auflösbar ist (nur Statistik). */
const UNDETERMINED: LocationPath = [{ kind: 'teil', value: '<unbestimmt>' }];

/** Blätter des Befehlsbaums mit dem Ort ihrer übergeordneten Befehle. */
const flatContext = (context: readonly LocationPath[]): LocationPath => context.flat();

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
  const walk = (nodes: readonly CommandNode[], context: LocationPath[], labels: string[], statisticsOnly: boolean, source: LocationPath[] = context): void => {
    const sourceOf = (): Partial<Leaf> => (stableStringify(source) === stableStringify(context) ? {} : { sourceContext: source });
    for (let node of nodes) {
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
      if (TOC_COMMAND.test(node.text.trim())) {
        // Inhaltsübersicht: der Befehl und alle Unterbefehle betreffen sie (nur markiert, nicht gelesen).
        const mark = (entries: readonly CommandNode[], labelsOf: string[]): void => {
          for (const entry of entries) {
            const entryLabels = entry.label ? [...labelsOf, entry.label] : labelsOf;
            if (entry.children.length > 0) mark(entry.children, entryLabels);
            else leaves.push({ node: entry, context, labels: entryLabels, command: entry.text, toc: true, ...(statisticsOnly ? { statisticsOnly } : {}) });
          }
        };
        if (node.children.length > 0) mark(node.children, nodeLabels);
        else leaves.push({ node, context, labels: nodeLabels, command: node.text, toc: true, ...(statisticsOnly ? { statisticsOnly } : {}) });
        continue;
      }
      if (container !== undefined && node.children.length > 0) {
        const paths = parseLocation(container);
        if (!paths || paths.length !== 1) {
          if (!statisticsOnly) failures.push(`Ortsangabe „${container}“ nicht lesbar (${nodeLabels.join(' ')})`);
          walk(node.children, [...context, UNDETERMINED], nodeLabels, true);
          continue;
        }
        walk(node.children, [...context, paths[0]!], nodeLabels, statisticsOnly, [...source, paths[0]!]);
        continue;
      }
      // Lauf 9: Zitierter Wortlaut mit eigenen Gliederungszeichen („Nr. 1.1.10 erhält folgende Fassung:“ – „„1.1.10 …“ –
      // „a) …“), den die Befehlsstruktur als Unterbefehle las: Beginnt das erste Unterglied mit dem öffnenden
      // Anführungszeichen und schließen die Unterglieder das Zitat, sind sie Zitat, keine Befehle.
      const inner = quotedChildren(node);
      if (inner) node = { ...node, quoted: [...node.quoted, ...inner], children: [] };
      const quoted = node.quoted.map((unit) => `${unit.label ? `${unit.label} ` : ''}${unit.text}`).join(' ');
      // „Nach Nr. 1.2 wird folgende Nr. 1.3 angefügt.“ mit folgendem Zitat: für die Erkennung wie mit Doppelpunkt.
      const parseText = node.quoted.length > 0 ? node.text.replace(/\.\s*$/u, ':') : node.text;
      const structural = parseStructural(parseText, context, node.quoted);
      const leaf: Leaf = { node: parseText === node.text ? node : { ...node, text: parseText }, context, labels: nodeLabels, command: quoted === '' ? node.text : `${node.text} ${quoted}`, ...(structural ? { structural } : {}), ...(statisticsOnly ? { statisticsOnly } : {}), ...sourceOf() };
      if (node.children.length > 0) {
        // „Der bisherige § 5 wird § 6 und wie folgt geändert:“ – Unterbefehle am Glied unter neuer Bezeichnung.
        const template = structural?.templates?.[0];
        if (structural?.formula === 'relabel' && template?.kind === 'relabel' && template.pairs.length === 1 && /wie\s+folgt\s+geändert\s*:\s*$/u.test(node.text)) {
          leaves.push(leaf);
          walk(node.children, [...context, [template.pairs[0]![1]]], nodeLabels, statisticsOnly, [...source, [template.pairs[0]![0]]]);
          continue;
        }
        // „Satz 3 wird Satz 2 und wie folgt geändert:“ (BayMBl. 2025 Nr. 315): Unterbefehle am Satz unter neuer Nummer.
        if (structural?.formula === 'renumber-sentence' && template?.kind === 'renumber-sentences' && template.pairs.length === 1 && /wie\s+folgt\s+geändert\s*:\s*$/u.test(node.text)) {
          leaves.push(leaf);
          walk(node.children, [...context, [...(template.context.length > flatContext(context).length ? template.context.slice(flatContext(context).length) : []), { kind: 'satz', value: String(template.pairs[0]![1]) }]], nodeLabels, statisticsOnly);
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

/**
 * Ein Befehl als Folge von Vorlagen (strukturell), Operationen mit Orten (Wortlaut) oder – mit dem Stand der
 * Verkündungen am Stichtag – Wiederherstellungen (`restore`: Alttext aus der Stammverkündung, `restore.ts`).
 */
export type Parsed = { formulas: FormulaId[]; items?: Array<{ formula: FormulaId; template?: StructuralTemplate; parsed?: ParsedOperation; restore?: RestoreRequest }>; reason?: string };

/** Nicht umkehrbarer Befehl → Wiederherstellung aus den Verkündungen, soweit er dafür lesbar ist. */
function restorableLeaf(leaf: Leaf, command: Parsed & { restorable?: ReturnType<typeof parseCommand>['restorable'] }): Parsed | undefined {
  if (command.restorable) {
    return { formulas: command.formulas, items: command.restorable.map((item) => (isParsedDeletion(item) ? { formula: item.formula, restore: deletionRequest(item) } : { formula: item.formula, parsed: item })) };
  }
  // „Der bisherige Art. 9 wird Art. 10 und wie folgt gefasst:“, „Der bisherige Satz 5 wird Satz 6 und wie folgt gefasst:“:
  // erst die Umnummerierung, dann die Neufassung unter der neuen Bezeichnung (Alttext aus der Verkündung).
  // Auch mehrere Glieder oder Sätze („Die bisherigen Sätze 4 und 5 werden die Sätze 5 und 6 und wie folgt gefasst:“,
  // BayMBl. 2026 Nr. 188; „Die Abs. 4 und 5 werden die Abs. 3 und 4 und wie folgt gefasst:“, GVBl. 2024 S. 662).
  const UNIT = String.raw`(?:Nrn?\.|Abs\.|Absätze|Buchst\.|§§?|Art\.|Sätze|Satz|Spiegelstrich|Doppelbuchst\.)`;
  const VALUES = String.raw`[\d.a-z]+(?:\s*(?:,|und|bis)\s*[\d.a-z]+)*`;
  const combined = new RegExp(String.raw`^((?:(?:Der|Die|Das)\s+)?(?:bisherigen?\s+)?${UNIT}\s*${VALUES}\s+(?:wird|werden)\s+(?:zu\s+)?(?:(?:die|der|den|dem)\s+)?(${UNIT}\s*${VALUES}))\s+und\s+(?:wird\s+|werden\s+)?(?:wie\s+folgt\s+(?:neu\s+)?gefasst|erhält\s+folgende\s+(?:neue\s+)?Fassung|erhalten\s+folgende\s+(?:neue\s+)?Fassung)\s*:?$`, 'u').exec(leaf.node.text.trim());
  if (combined && leaf.node.quoted.length > 0) {
    const head = parseStructural(`${combined[1]!}.`, leaf.context, []);
    const template = head?.templates?.[0];
    const request = restoreRequest(`${combined[2]!} ${/\s(?:und|bis)\s|,/u.test(combined[2]!) ? 'werden' : 'wird'} wie folgt gefasst:`, leaf.context, leaf.node.quoted, 'recast');
    // In der Stammverkündung trägt das Glied die bisherige Bezeichnung.
    if (template?.kind === 'relabel' && !('error' in request)) {
      const olds = template.pairs.map(([from]) => formatPath([from]));
      const source = restoreRequest(`${olds.join(', ').replace(/, ([^,]*)$/u, ' und $1')} ${olds.length > 1 ? 'werden' : 'wird'} wie folgt gefasst:`, leaf.sourceContext ?? leaf.context, leaf.node.quoted, 'recast');
      if (!('error' in source) && source.kind === request.kind) request.source = source;
    }
    if (head && template && (template.kind === 'relabel' || template.kind === 'renumber-sentences') && !('error' in request)) {
      return { formulas: [head.formula as FormulaId, 'recast'], items: [{ formula: head.formula as FormulaId, template }, { formula: 'recast', restore: request }] };
    }
  }
  let formula = command.formulas.length === 1 ? command.formulas[0]! : undefined;
  // „Der bisherige Satz 8 wird gestrichen.“ ist keine Umnummerierung, sondern eine Aufhebung.
  if (formula === 'renumber' && leaf.node.quoted.length === 0 && /^(?:Der|Die)\s+bisherigen?\s+(?:Satz|Sätze|Nr\.|Nrn\.|Abs\.|Buchst\.|Spiegelstrich)\s[^„“]*\s(?:wird|werden)\s+(?:gestrichen|aufgehoben)\s*\.?$/u.test(leaf.node.text.trim())) formula = 'repeal-unit';
  if (formula !== 'recast' && formula !== 'repeal-unit') return undefined;
  const request = restoreRequest(leaf.node.text, leaf.context, leaf.node.quoted, formula);
  if ('error' in request) return { formulas: command.formulas, reason: `${command.reason ?? ''} – aus der Verkündung nicht wiederherstellbar: ${request.error}` };
  if (leaf.sourceContext) {
    const source = restoreRequest(leaf.node.text, leaf.sourceContext, leaf.node.quoted, formula);
    if (!('error' in source) && source.kind === request.kind) request.source = source;
  }
  return { formulas: command.formulas, items: [{ formula, restore: request }] };
}

export function parseLeaf(leaf: Leaf, restore?: PublicationBase | true): Parsed {
  const parsed = parseLeafPlain(leaf);
  if (parsed.items || !restore) return parsed;
  // Umnummerierung mit weiterem Befehl ohne Alttext („Nr. 4.4.4 wird Nr. 4.4.3 und in Satz 2 werden die Wörter „…“
  // gestrichen.“, BayMBl. 2024 Nr. 644): erst die Umnummerierung, dann die Wiederherstellung am Glied unter neuer Bezeichnung.
  const followUp = leaf.structural?.followUp;
  if (followUp && leaf.structural?.templates) {
    const command = parseCommand(followUp.text, [followUp.context]);
    const formula = leaf.structural.formula as FormulaId;
    const head = leaf.structural.templates.map((template) => ({ formula, template }));
    if (command.restorable) {
      return {
        formulas: [formula, ...command.formulas],
        items: [...head, ...command.restorable.map((item) => (isParsedDeletion(item) ? { formula: item.formula, restore: deletionRequest(item) } : { formula: item.formula, parsed: item }))],
      };
    }
    // „Die bisherige Nr. 8 wird Nr. 9 und Satz 2 wird aufgehoben.“ (BayMBl. 2023 Nr. 439): Aufhebung am umnummerierten Glied.
    if (command.formulas.length === 1 && (command.formulas[0] === 'repeal-unit' || command.formulas[0] === 'recast')) {
      const request = restoreRequest(followUp.text, [followUp.context], [], command.formulas[0]);
      if (!('error' in request)) return { formulas: [formula, ...command.formulas], items: [...head, { formula: command.formulas[0], restore: request }] };
    }
  }
  if (leaf.structural) return parsed;
  const command = parseCommand(leaf.node.text, leaf.context);
  return restorableLeaf(leaf, { ...parsed, ...(command.restorable ? { restorable: command.restorable } : {}) }) ?? parsed;
}

function parseLeafPlain(leaf: Leaf): Parsed {
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
  /** Überschrift der Norm vor der Änderung (nur mit Titelzustand). */
  titleBefore?: RecipeTitle;
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

const codeState = (code: string): ReconstructionState => (code === 'target-ambiguous' || code === 'end-not-determined' || code === 'location-unresolved' || code === 'sentence-ambiguous' || code === 'renumber-ambiguous' || code === 'anchor-mismatch' || code === 'title-projection' ? 'ambiguous-target' : code === 'image-in-inserted-unit' ? 'asset-missing' : 'round-trip-failed');

/** Toleriert gelesene Satzfehler der Verkündung am Befehl – im Rezeptschritt vermerkt. */
const defectOf = (leaf: Leaf, note?: string): { sourceDefect?: string } => {
  const defects = [...(leaf.node.defects ?? []), ...(note ? [note] : [])];
  return defects.length > 0 ? { sourceDefect: defects.join('; ') } : {};
};

/** Ort „Überschrift“ ohne übergeordnetes Glied: die Überschrift der Norm selbst. */
export const isNormTitle = (path: LocationPath): boolean => path.length === 1 && path[0]!.kind === 'ueberschrift';

/**
 * Nimmt eine Änderung zurück: `after` ist der Körper mit der Änderung (bei der jüngsten der heutige). `idPrefix`
 * unterscheidet die Schritte mehrerer Änderungen (`a1-s01`). Scheitert ausdrücklich, statt zu raten.
 */
export interface RestoreOptions {
  /** Stand der Verkündungen (Stammverkündung) für Alttext. */
  base: PublicationBase;
  /**
   * Rückfall: Ein Befehl, den die Rücknahme nicht lesen oder umkehren kann, ersetzt das ganze Glied, das er ändert, durch
   * das der Stammverkündung (`restoreUnit`); weitere Befehle an diesem Glied gehen darin auf. Nur wo die Probe im
   * Wortlaut das Ergebnis trägt (Rücknahme der Änderungen nach dem Stichtag), nie bei der Probe selbst.
   */
  fallback?: boolean;
  /** Befehle (Index in `commandLeaves`), deren Rücknahme im ersten Versuch scheiterte: Sie gehen in den Rückfall. */
  forced?: ReadonlySet<number>;
}

export function reverseAmendment(after: readonly NormBodyBlock[], block: CommandBlock, idPrefix = '', titleAfter?: RecipeTitle, restoreInput?: PublicationBase | RestoreOptions): AmendmentReversal {
  const result: AmendmentReversal = { steps: [], formulas: [], failures: [] };
  const options: RestoreOptions | undefined = restoreInput === undefined ? undefined : 'base' in restoreInput && 'fallback' in restoreInput ? restoreInput : 'body' in restoreInput ? { base: restoreInput } : restoreInput;
  const restore = options?.base;
  const { leaves, failures: structureFailures } = commandLeaves(block);
  for (const message of structureFailures) result.failures.push({ state: 'command-unreadable', reason: 'location-unreadable', detail: message });
  let parsed = leaves.map((leaf, index) => ({ leaf, index, parsed: leaf.toc ? { formulas: ['container' as FormulaId] } : parseLeaf(leaf, restore) }));
  // Befehle an der Inhaltsübersicht: Führt der heutige Körper keine, betreffen sie ihn nicht (kein Schritt); sonst sind sie
  // nicht umgesetzt.
  if (parsed.some(({ leaf }) => leaf.toc)) {
    if (hasTableOfContents(after)) for (const { leaf } of parsed.filter((entry) => entry.leaf.toc)) result.failures.push({ state: 'unsupported-formula', reason: 'toc-command', detail: `${leaf.labels.join(' ')} „${leaf.node.text.slice(0, 140)}“: Befehl an der Inhaltsübersicht, die der Körper führt – nicht umgesetzt` });
    parsed = parsed.filter(({ leaf }) => !leaf.toc);
  }
  const failing: Array<{ leaf: Leaf; failure: StepFailure }> = [];
  for (const { leaf, index, parsed: command } of parsed) {
    result.formulas.push(...command.formulas);
    if (leaf.statisticsOnly) continue;
    if (options?.forced?.has(index)) {
      failing.push({ leaf, failure: { state: 'non-invertible-amendment', reason: 'restore-forced', detail: `${leaf.labels.join(' ')} „${leaf.node.text.slice(0, 140)}“: Rücknahme gescheitert, Rückfall auf das ganze Glied` } });
      continue;
    }
    const label = leaf.labels.length > 0 ? `${leaf.labels.join(' ')} ` : '';
    if (leaf.hasChildren) {
      failing.push({ leaf, failure: { state: 'unsupported-formula', reason: 'unrecognized', detail: `${label}„${leaf.node.text.slice(0, 140)}“: Befehl mit eigener Änderung und Untergliederung` } });
      continue;
    }
    if (!command.items) {
      const worst = command.formulas.find((formula) => NON_INVERTIBLE_FORMULAS.has(formula)) ?? command.formulas.find((formula) => !SUPPORTED_FORMULAS.has(formula)) ?? command.formulas[0]!;
      failing.push({ leaf, failure: failureFor(worst, `${label}„${leaf.node.text.slice(0, 140)}“: ${command.reason ?? ''}`) });
    }
  }
  // Rückfall (nur mit Stammverkündung und nur wo zulässig): ganze Glieder aus der Verkündung für die nicht lesbaren Befehle.
  const units: Array<{ steps: LocationPath; blockPath: number[]; sourceSteps?: LocationPath }> = [];
  if (failing.length > 0 && restore && options?.fallback && structureFailures.length === 0) {
    for (const { leaf } of failing) {
      const unit: (ReturnType<typeof unitFor> & { sourceSteps?: LocationPath }) | undefined = unitFor(after, commandUnitPath(leaf.node.text, leaf.context));
      if (unit && leaf.sourceContext) unit.sourceSteps = commandUnitPath(leaf.node.text, leaf.sourceContext).filter((step) => !['satz', 'halbsatz', 'satzteil-vor', 'satzteil-nach', 'ueberschrift', 'vorspann', 'zeile', 'spalte'].includes(step.kind)).slice(0, unit.steps.length);
      if (!unit) {
        units.length = 0;
        break;
      }
      units.push(unit);
    }
  }
  const within = (path: readonly number[], outer: readonly number[]): boolean => outer.length <= path.length && outer.every((value, index) => path[index] === value);
  const fallbackUnits = units.filter((unit, index) => !units.some((other, at) => at !== index && within(unit.blockPath, other.blockPath) && (other.blockPath.length < unit.blockPath.length || at < index)));
  if (fallbackUnits.length > 0) {
    // Befehle innerhalb eines ersetzten Glieds gehen in ihm auf.
    parsed = parsed.filter(({ leaf }) => {
      const unit = unitFor(after, commandUnitPath(leaf.node.text, leaf.context));
      return !unit || !fallbackUnits.some((outer) => within(unit.blockPath, outer.blockPath));
    });
    for (const { leaf, failure } of failing) {
      const unit = unitFor(after, commandUnitPath(leaf.node.text, leaf.context));
      if (!unit || !fallbackUnits.some((outer) => within(unit.blockPath, outer.blockPath))) result.failures.push(failure);
    }
  } else {
    for (const { failure } of failing) result.failures.push(failure);
  }
  // Numbering-Befehle („Der Wortlaut wird Satz 1“) je Ort: dann nummeriert kein angefügter Satz implizit.
  const explicit = new Set(parsed.flatMap(({ parsed: command }) => (command.items ?? []).filter((item) => item.template?.kind === 'number-sentences').map((item) => formatPath((item.template as { context: LocationPath }).context))));
  if (result.failures.length > 0) return result;

  // Rückwärts: letzter Befehl zuerst, je im aktuellen Zustand aufgelöst. Die Überschrift der Norm (`titleAfter`) wird
  // mitgeführt, wenn ein Befehl sie ändert.
  const state: LawState = { body: structuredClone(after) as NormBodyBlock[], ...(titleAfter ? { title: { ...titleAfter } } : {}) };
  const working = state.body;
  const collected: RecipeStep[][] = [];
  // Rückfall zuerst (vorwärts zuletzt): die ersetzten Glieder im Stand nach der Änderung.
  const fallbackSteps: RecipeStep[] = [];
  try {
    for (const unit of fallbackUnits) {
      const entry = restoreUnit(working, restore!, unit, 'Rückfall');
      const commands = leaves.filter((leaf) => {
        const own = unitFor(after, commandUnitPath(leaf.node.text, leaf.context));
        return own !== undefined && within(own.blockPath, unit.blockPath);
      });
      const step: RecipeStep = { id: '', command: commands.map((leaf) => leaf.command).join(' | '), commandPath: commands[0]?.labels ?? [], formula: 'recast', location: entry.location, scope: entry.scope, operation: entry.operation as Operation, evidence: entry.evidence, restoredFrom: restore!.citation };
      stepBackward(state, step, entry.location);
      fallbackSteps.push(step);
    }
  } catch (error) {
    if (error instanceof RestoreError || error instanceof ReconstructionError || error instanceof StructuralError) {
      result.failures.push({ state: 'non-invertible-amendment', reason: error instanceof RestoreError ? error.code : `restore-${error.code}`, detail: error.message });
      return result;
    }
    throw error;
  }
  type Item = NonNullable<Parsed['items']>[number];
  const realizeItem = (leaf: Leaf, item: Item): RecipeStep[] => {
    const realizedSteps: RecipeStep[] = [];
    if (item.restore) {
      // Alttext aus dem Stand der Verkündungen am Stichtag (Lauf 7).
      for (const entry of realizeRestore(working, restore!, item.restore, leaf.labels.join(' '))) {
        realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: item.formula, location: entry.location, scope: entry.scope, operation: entry.operation as Operation, evidence: entry.evidence, restoredFrom: restore!.citation, ...defectOf(leaf) });
      }
      return realizedSteps;
    }
    if (item.template) {
      const realized = realize(working, item.template, `${leaf.labels.join(' ')}`, explicit.has(formatPath((item.template as { context: LocationPath }).context)));
      for (const entry of realized) {
        const scope: ScopeRecord = { fields: entry.field ? [entry.field] : [], resolved: entry.resolved, widened: entry.widened };
        realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: item.formula, location: entry.location, scope, operation: entry.operation as Operation, evidence: structuralEvidence(entry.operation), ...defectOf(leaf, entry.note) });
      }
      return realizedSteps;
    }
    const operation = item.parsed!;
    const scopes: ScopeRecord[] = [];
    const targets: Array<'title' | undefined> = [];
    for (const path of operation.locations) {
      if (isNormTitle(path)) {
        if (!state.title) throw new ReconstructionError('location-unresolved', `${leaf.labels.join(' ')} ${formatPath(path)}: Überschrift der Norm selbst, ohne Titelzustand`);
        scopes.push({ fields: [TITLE_FIELD], resolved: ['Überschrift der Norm (Titelzeile und Abkürzungszeile)'], widened: [] });
        targets.push('title');
        continue;
      }
      const resolved = resolvePath(working, path);
      if (!resolved.ok) throw new ReconstructionError('location-unresolved', `${leaf.labels.join(' ')} ${formatPath(path)}: ${resolved.reason}`);
      scopes.push(resolved.scope);
      targets.push(undefined);
    }
    if (scopes.length > 1) {
      // Dasselbe Feld darf mehrfach vorkommen, wenn die Orte verschiedene Sätze darin sind („In Satz 2 und 3 wird jeweils …“).
      const seen = new Map<string, Set<string>>();
      for (const [position, scope] of scopes.entries()) {
        for (const field of scope.fields) {
          const key = `${targets[position] ?? 'body'}:${field.path.join('.')}:${field.key}`;
          const sentence = scope.sentence === undefined ? '*' : `${scope.sentence}${scope.halfSentence !== undefined ? `/${scope.halfSentence}` : ''}`;
          const taken = seen.get(key) ?? new Set<string>();
          if (taken.has(sentence) || (taken.size > 0 && (sentence === '*' || taken.has('*')))) throw new ReconstructionError('overlapping-locations', `${leaf.labels.join(' ')}: die Orte von „jeweils“ überschneiden sich`);
          taken.add(sentence);
          seen.set(key, taken);
        }
      }
    }
    operation.locations.forEach((path, index) => {
      realizedSteps.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: operation.formula, location: targets[index] === 'title' ? 'Überschrift der Norm' : formatPath(path), scope: scopes[index]!, operation: operation.operation, evidence: { baseline: '', current: '' }, ...(targets[index] ? { target: targets[index]! } : {}), ...defectOf(leaf) });
    });
    return realizedSteps;
  };
  // Rückwärts in umgekehrter Reihenfolge der konkreten Schritte.
  const undo = (leaf: Leaf, realizedSteps: readonly RecipeStep[]): void => {
    for (const step of [...realizedSteps].reverse()) stepBackward(state, step, `${leaf.labels.join(' ')} ${step.location}`);
  };
  let currentGroup: number[] = [];
  try {
    for (const group of [...relabelRuns(parsed)].reverse()) {
      currentGroup = group.map((position) => parsed[position]!.index);
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
        relabels.get(owner)!.push({ id: '', command: leaf.command, commandPath: leaf.labels, formula: command.items![0]!.formula, location: entry.location, scope: { fields: [], resolved: entry.resolved, widened: entry.widened }, operation: entry.operation as Operation, evidence: structuralEvidence(entry.operation), ...defectOf(leaf) });
      }
      for (const entry of [...realized].reverse()) applyBackward(working, { fields: [], resolved: entry.resolved, widened: entry.widened }, entry.operation as Operation, `${first.leaf.labels.join(' ')} ${entry.location}`);
      for (const index of [...group].reverse()) collected.unshift([...relabels.get(index)!, ...rest.get(index)!]);
    }
  } catch (error) {
    // Rückfall: Die Befehle, deren Rücknahme scheiterte, gehen in das ganze Glied aus der Stammverkündung ein.
    const known = error instanceof RestoreError || error instanceof ReconstructionError || error instanceof StructuralError;
    if (known && restore && options?.fallback && currentGroup.length > 0 && !currentGroup.every((index) => options.forced?.has(index)) && (options.forced?.size ?? 0) < 12) {
      const retry = reverseAmendment(after, block, idPrefix, titleAfter, { ...options, forced: new Set([...(options.forced ?? []), ...currentGroup]) });
      if (retry.failures.length === 0) return retry;
    }
    if (error instanceof RestoreError) {
      result.failures.push({ state: 'non-invertible-amendment', reason: error.code, detail: error.message });
      return result;
    }
    const code = error instanceof ReconstructionError || error instanceof StructuralError || error instanceof TitleError ? error.code : 'error';
    result.failures.push({ state: codeState(code), reason: `reverse-${code}`, detail: (error as Error).message });
    return result;
  }
  const steps = [...collected.flat(), ...fallbackSteps];
  steps.forEach((step, index) => {
    step.id = `${idPrefix}s${String(index + 1).padStart(2, '0')}`;
  });

  // Vorwärts, Schritt für Schritt, mit Vorher-/Nachher-Beleg; das Ergebnis muss exakt der Körper nach der Änderung sein.
  const forward: LawState = { body: structuredClone(working) as NormBodyBlock[], ...(state.title ? { title: { ...state.title } } : {}) };
  const walker = forward.body;
  try {
    for (const step of steps) {
      const beforeBody = structuredClone(walker) as NormBodyBlock[];
      const at = stepForward(forward, step, step.id);
      if (at.title) {
        step.evidence = { baseline: at.title.before, current: at.title.after };
        continue;
      }
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
  if (stableStringify(forward.body) !== stableStringify(after) || (titleAfter && (!forward.title || !sameTitle(forward.title, titleAfter)))) {
    result.failures.push({ state: 'round-trip-failed', reason: 'round-trip', detail: 'Vorwärts angewandt ergibt der rückgerechnete Körper (oder die Überschrift) nicht den Stand nach der Änderung' });
    return result;
  }
  if (stableStringify(state.body) === stableStringify(after) && (!titleAfter || !state.title || titleText(state.title) === titleText(titleAfter))) {
    result.failures.push({ state: 'round-trip-failed', reason: 'no-change', detail: 'Rücknahme ändert nichts' });
    return result;
  }
  result.steps = steps;
  result.before = state.body;
  if (state.title) result.titleBefore = state.title;
  return result;
}

export type { StructuralOperation };
