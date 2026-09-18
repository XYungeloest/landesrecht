/**
 * Rückrechnung von Änderungen nach dem Stichtag (Methode `reverse-amendment`).
 *
 * Für jede Norm der Klasse `changed-after-baseline` entscheidet dieser Lauf, ob sich ihr Stichtagstext
 * **sicher** aus dem heutigen Text und dem Änderungsbefehl zurückrechnen lässt – und schreibt für genau
 * diese Normen ein Rezept. Alle übrigen erhalten einen Zustand der Rekonstruktionsschlange mit Grund.
 *
 * Angegangen werden nur Normen mit **genau einem** stark belegten Änderungsschritt nach dem Stichtag.
 * Für sie müssen alle Prüfungen bestehen:
 *
 * 1. Detailseite der Verkündung und heutiges Paket liegen im Cache (kein Netz).
 * 2. Der Einleitungssatz für die Norm steht genau einmal in der Verkündung; der Befehlsblock ist lesbar.
 * 3. **Jeder** Befehl des Blocks hat eine unterstützte, rückrechenbare Formel (`formulas.ts`).
 * 4. Das Inkrafttreten für die Norm ist bestimmt, liegt **nach** dem Stichtag und nicht nach dem
 *    Auswertungsstichtag, und der heutige Text gilt laut Paket seit genau diesem Tag.
 * 5. Die Kette ist einschrittig (`chain.ts`: Vollzitat, Änderungsverlauf, vorangehende Änderung,
 *    übrige Verkündungen).
 * 6. Jeder Ort ist auflösbar, jeder Wortlaut im Bereich genau einmal vorhanden.
 * 7. **Rundlauf:** rückwärts und wieder vorwärts ergibt exakt den heutigen Körper.
 *
 * Normen werden **nicht** nach `content/` geschrieben. Ergebnis sind Rezepte, die Schlange und die
 * Stichtagsentscheidungen in `baseline.json`.
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import type { BaselineDecision } from '../baseline/classify.ts';
import { COMMAND_STATE_PRIORITY, NON_INVERTIBLE_EVENT_TYPES, type ReconstructionState } from '../baseline/reconstruction.ts';
import { BASELINE_PATH, EVENT_LEDGER_PATH, type BaselineFile } from '../baseline/run.ts';
import { AUDIT_DIR, BASELINE_DATE, EVALUATION_DATE, IMPORT_DATA_DIR, PARSER_VERSION } from '../common/constants.ts';
import { RECONSTRUCTION_QUEUE_PATH } from '../common/paths.ts';
import { applyForward, ReconstructionError, reverseSteps, verifyRoundTrip } from './apply.ts';
import { checkChain, publicationKeyFromCitation, publicationKeyString, type PublicationKey } from './chain.ts';
import { commencementFor, effectiveDateVerdict, ownCommencement, sectionRef } from './commencement.ts';
import { containerLocation, FORMULAS, NON_INVERTIBLE_FORMULAS, parseCommand, SUPPORTED_FORMULAS, type FormulaId, type ParsedOperation } from './formulas.ts';
import { gazetteUnits, normalizeGazetteText, type GazetteUnit } from './gazette.ts';
import { decodeEntities } from '../events/listings.ts';
import { blockAt, formatPath, parseLocation, resolvePath, type LocationPath } from './location.ts';
import { bodyFingerprint, RECIPE_SCHEMA, recipeProblems, stableStringify, WHITESPACE_NORMALIZATION, type ReconstructionRecipe, type RecipeStep, type ScopeRecord } from './recipe.ts';
import { packageUrl, parseCurrentNorm, readCached, type CurrentNorm } from './source.ts';
import { amendingCitations, citationMatches, clauseAmendments, commandBlock, isBlockFailure, isStrongMatch, type CommandBlock, type CommandNode, type NormCitation } from './structure.ts';

export const RECONSTRUCTION_DIR = join(IMPORT_DATA_DIR, 'reconstruction');
export const RECONSTRUCTION_REPORT_PATH = join(AUDIT_DIR, 'RECONSTRUCTION.md');
export const QUEUE_SCHEMA = 'bayernrecht-reconstruction-queue/1' as const;

/** Ereignis des Registers, soweit die Rückrechnung es braucht. */
export interface LedgerRecord {
  id: string;
  sourceUrl: string;
  sourceSha256?: string;
  organ: string;
  publicationAuthority: string;
  digitalRepresentation: string;
  citation: string;
  eventDate?: string;
  enactmentDate?: string;
  effectiveDate?: string;
  gazettePdfUrl?: string;
  gazettePdfSha256Published?: string;
  eventType: string;
  subtype?: string;
  targetResolution?: { status?: string; matchStrength?: string; sourceIdentity?: string };
}

export interface QueueEntry {
  documentId: string;
  state: ReconstructionState;
  /** Maschinenlesbarer Grund (`multi-step`, `recast`, `chain-last-amendment` …). */
  reason: string;
  detail: string;
  /** Weitere nicht bestandene Prüfungen neben dem maßgeblichen Grund, je Zustand und Grund einmal (erster Befund, Anzahl). */
  alsoFailed: Array<{ state: ReconstructionState; reason: string; detail: string; count: number }>;
  steps: number;
  priority: number;
  events: Array<{ id: string; eventType: string; eventDate: string; citation: string }>;
  formulas?: FormulaId[];
  effectiveDate?: string;
  /** Vorangehende Änderung laut Einleitungssatz des Änderungsbefehls. */
  priorAmendment?: string;
  /** Befehl, Orte und Rundlauf bestanden; ausgeschlossen nur, weil der Beginn der Stichtagsfassung nicht belegt ist. */
  roundTripVerified?: boolean;
  /** Ergebnis je Prüfung (nur Einschrittkandidaten; fehlend = nicht erreicht). */
  checks?: Partial<Record<CheckName, boolean>>;
  recipe?: { path: string; steps: number; currentFingerprint: string; baselineFingerprint: string };
}

export interface ReconstructionQueue {
  schemaVersion: typeof QUEUE_SCHEMA;
  baselineDate: string;
  evaluationDate: string;
  totals: {
    changedAfterBaseline: number;
    singleStep: number;
    recipeReady: number;
    byState: Record<string, number>;
    byReason: Record<string, number>;
    singleStepByState: Record<string, number>;
    singleStepByReason: Record<string, number>;
    /** Je Prüfung: wie viele Einschrittkandidaten sie bestanden, nicht bestanden oder nicht erreicht haben. */
    checks: Record<string, { passed: number; failed: number; notReached: number }>;
    /** Einschrittkandidaten, deren Rundlauf exakt ist, die aber am fehlenden Beleg für den Beginn der Stichtagsfassung scheitern. */
    roundTripVerifiedWithoutStart: number;
    /** Je Formel: Zahl der Befehlsklauseln und der Normen, in denen sie vorkommt (nur Einschrittkandidaten mit lesbarem Block). */
    formulas: Record<string, { clauses: number; norms: number; supported: boolean; invertible: boolean }>;
  };
  entries: QueueEntry[];
}

export interface ReconstructionRun {
  queue: ReconstructionQueue;
  recipes: ReconstructionRecipe[];
  baseline: BaselineFile;
}

interface Failure {
  state: ReconstructionState;
  reason: string;
  detail: string;
  /**
   * Die Norm bleibt ausgeschlossen, aber die übrigen Prüfungen laufen weiter – damit die Schlange zeigt,
   * ob Befehl und Rundlauf bestanden hätten (fehlender Beleg für den Beginn der Stichtagsfassung).
   */
  soft?: boolean;
}

/** Rangfolge der Zustände, wenn mehrere Prüfungen scheitern: der schwerste Grund zählt. */
const PRECEDENCE: readonly ReconstructionState[] = [
  'missing-base',
  'command-unreadable',
  'asset-missing',
  'non-invertible-amendment',
  'partial-chain',
  'contradictory',
  'effective-date-undetermined',
  'unsupported-formula',
  'ambiguous-target',
  'round-trip-failed',
];

const byPrecedence = (left: Failure, right: Failure): number => PRECEDENCE.indexOf(left.state) - PRECEDENCE.indexOf(right.state);

const DETAIL_URL = /^https:\/\/www\.verkuendung-bayern\.de\/(gvbl|baymbl)\/(\d{4})-(\d+)\/$/u;

interface Context {
  root: string;
  /** Änderungsnotizen des Fortführungsnachweises je Norm. */
  registerNotes: Map<string, string[]>;
  baselineDate: string;
  evaluationDate: string;
  postBaselinePublications: Set<string>;
  /** Je Detailseite die Normzitate mit Änderungsbefehl (Seitwärtsprüfung der Kette). */
  amendingByPage: Map<string, NormCitation[]>;
  units: Map<string, GazetteUnit[]>;
}

async function loadLedger(root: string): Promise<LedgerRecord[]> {
  const raw = await readFile(join(root, EVENT_LEDGER_PATH), 'utf8');
  return (JSON.parse(raw) as { events: LedgerRecord[] }).events;
}

async function pageUnits(ctx: Pick<Context, 'root' | 'units'>, url: string): Promise<GazetteUnit[] | undefined> {
  if (ctx.units.has(url)) return ctx.units.get(url);
  const cached = await readCached(ctx.root, url);
  if (!cached) return undefined;
  const units = gazetteUnits(new TextDecoder().decode(cached.bytes));
  ctx.units.set(url, units);
  return units;
}

/* ------------------------------------------------------- Inkrafttreten der vorangehenden Änderung */

export interface PriorInForce {
  ok: boolean;
  /** Spätestes belegtes Inkrafttreten aller vorangehenden Änderungen (ISO). */
  date?: string;
  evidence: string[];
  sources: Array<{ url: string; sha256: string; citation: string; retrievedAt?: string }>;
  reason?: string;
}

const CALENDAR_DATE = /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}/u;

/** Adresse der Detailseite zu „GVBl. S. 594“ bzw. „BayMBl. Nr. 472“ im Jahrgang des Ausfertigungsdatums. */
export function priorDetailUrl(reference: string | undefined, date: string | undefined): string | undefined {
  if (!reference || !date) return undefined;
  const year = date.slice(0, 4);
  const gvbl = /^GVBl\.?\s*S\.\s*(\d+)/u.exec(reference.trim());
  if (gvbl) return `https://www.verkuendung-bayern.de/gvbl/${year}-${gvbl[1]}/`;
  const baymbl = /^BayMBl\.?\s*Nr\.\s*(\d+)/u.exec(reference.trim());
  if (baymbl) return `https://www.verkuendung-bayern.de/baymbl/${year}-${baymbl[1]}/`;
  return undefined;
}

/**
 * Beleg für das Inkrafttreten der vorangehenden Änderung(en) – und damit für den Beginn der Stichtagsfassung.
 * Verkündet ist nicht in Kraft: Belegt ist nur, was die Inkrafttretensvorschrift der vorangehenden Verkündung
 * mit **ausdrücklichem Kalenderdatum** sagt, für genau den Abschnitt, der die Norm geändert hat (Mantelregel und
 * Abweichungen wie beim Inkrafttreten der zurückgenommenen Änderung). Die Detailseite muss im Cache liegen und
 * das Ausfertigungsdatum der vorangehenden Änderung tragen (Identität). „Am Tag nach der Verkündung“ bleibt
 * unbelegt – das Verkündungsdatum liest die Rückrechnung nicht aus der Seite.
 */
export async function priorAmendmentInForce(ctx: Pick<Context, 'root' | 'units'>, priorClause: string, baselineDate: string): Promise<PriorInForce> {
  const amendments = clauseAmendments(priorClause);
  const evidence: string[] = [];
  const sources: PriorInForce['sources'] = [];
  const dates: string[] = [];
  if (amendments.length === 0) return { ok: false, evidence, sources, reason: 'vorangehende Änderung nicht lesbar' };
  for (const amendment of amendments) {
    const url = priorDetailUrl(amendment.reference, amendment.date);
    if (!url) return { ok: false, evidence, sources, reason: `keine Detailseite zu „${amendment.text}“ bestimmbar` };
    const cached = await readCached(ctx.root, url);
    if (!cached) return { ok: false, evidence, sources, reason: `Verkündung der vorangehenden Änderung nicht im Cache: ${url}` };
    const html = new TextDecoder().decode(cached.bytes);
    const enacted = /vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/u.exec(amendment.text)?.[1];
    if (!enacted || !normalizeGazetteText(decodeEntities(html.replace(/<[^>]+>/gu, ' '))).includes(normalizeGazetteText(enacted))) {
      return { ok: false, evidence, sources, reason: `Detailseite ${url} trägt das Ausfertigungsdatum „${enacted ?? '?'}“ nicht – Identität nicht belegt` };
    }
    const units = await pageUnits(ctx, url);
    if (!units || units.length === 0) return { ok: false, evidence, sources, reason: `Detailseite ${url} ohne Textkörper` };
    // Der ändernde Abschnitt steht vor „vom …“: „§ 2 der Verordnung vom 1. Oktober 2019 (GVBl. S. 594)“.
    const before = priorClause.slice(Math.max(0, priorClause.indexOf(amendment.text) - 120), priorClause.indexOf(amendment.text));
    const heading = /(§|Art\.|Artikel)\s*(\d+[a-z]?)(?:(?!§|Art\.|Artikel)[\s\S])*$/u.exec(before);
    const section = heading ? `${heading[1] === 'Artikel' ? 'Art.' : heading[1]} ${heading[2]}` : undefined;
    const commencement = commencementFor(units, amendment.date ?? baselineDate, section, section !== undefined);
    if (!commencement.ok) return { ok: false, evidence, sources, reason: `Inkrafttreten von „${amendment.text}“ nicht lesbar: ${commencement.reason}` };
    // Relativ ist, was sich auf die Verkündung bezieht („am Tag nach der Verkündung“) oder kein Kalenderdatum trägt;
    // „mit Wirkung vom 1. Januar 2018“ ist ein ausdrückliches Datum.
    const relative = commencement.applicable.find((statement) => /[Vv]erkünd/u.test(statement.text) || !CALENDAR_DATE.test(statement.text));
    if (relative) return { ok: false, evidence, sources, reason: `Inkrafttreten von „${amendment.text}“ ohne Kalenderdatum: „${relative.text.slice(0, 140)}“` };
    const latest = commencement.dates.at(-1)!;
    if (latest > baselineDate) return { ok: false, evidence, sources, reason: `vorangehende Änderung „${amendment.text}“ tritt erst am ${latest} in Kraft – nach dem Stichtag` };
    dates.push(latest);
    evidence.push(`Vorangehende Änderung ${amendment.text}${section ? ` (${section})` : ''}: ${commencement.applicable.map((statement) => `„${statement.text}“`).join(' ')} – ${url}, SHA-256 ${cached.sha256.slice(0, 16)}…`);
    sources.push({ url, sha256: cached.sha256, citation: amendment.text, ...(cached.retrievedAt ? { retrievedAt: cached.retrievedAt } : {}) });
  }
  return { ok: true, date: dates.sort().at(-1)!, evidence, sources };
}

/* --------------------------------------------------------------------------- Befehlsbaum */

interface Leaf {
  node: CommandNode;
  context: LocationPath[];
  labels: string[];
  command: string;
  /** Befehl mit Untergliederung, der kein reiner Gliederungsbefehl ist (Umnummerierung mit Änderungen). */
  hasChildren?: boolean;
}

/** Blätter des Befehlsbaums mit dem Ort ihrer übergeordneten Befehle. Unlesbare Orte werden gemeldet. */
function leavesOf(block: CommandBlock): { leaves: Leaf[]; failures: string[] } {
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
  const walk = (nodes: readonly CommandNode[], context: LocationPath[], labels: string[]): void => {
    for (const node of nodes) {
      const nodeLabels = node.label ? [...labels, node.label] : labels;
      const container = containerLocation(node.text);
      if (container !== undefined && node.children.length > 0) {
        const paths = parseLocation(container);
        if (!paths || paths.length !== 1) {
          failures.push(`Ortsangabe „${container}“ nicht lesbar (${nodeLabels.join(' ')})`);
          continue;
        }
        walk(node.children, [...context, paths[0]!], nodeLabels);
        continue;
      }
      const quoted = node.quoted.map((unit) => `${unit.label ? `${unit.label} ` : ''}${unit.text}`).join(' ');
      leaves.push({ node, context, labels: nodeLabels, command: quoted === '' ? node.text : `${node.text} ${quoted}`, ...(node.children.length > 0 ? { hasChildren: true } : {}) });
      // „Der bisherige § 5 wird § 6 und wie folgt geändert:“ – die Glieder darunter werden nur für die
      // Formelstatistik gelesen; ihr Ort bezieht sich auf eine Nummerierung, die das Modell nicht nachführt.
      if (node.children.length > 0) walk(node.children, [...context, [{ kind: 'teil', value: '\u0000unbestimmt' }]], nodeLabels);
    }
  };
  walk(block.commands, base, []);
  return { leaves, failures };
}

/** Gleichartige Befunde zusammenfassen: je Zustand und Grund der erste Befund und die Anzahl. */
function groupFailures(failures: readonly Failure[]): QueueEntry['alsoFailed'] {
  const grouped = new Map<string, QueueEntry['alsoFailed'][number]>();
  for (const failure of failures) {
    const key = `${failure.state}/${failure.reason}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { state: failure.state, reason: failure.reason, detail: failure.detail, count: 1 });
  }
  return [...grouped.values()];
}

/* ----------------------------------------------------------------------- Einzelne Norm */

/** Prüfungen in ihrer Reihenfolge – für die Übersicht, an welcher Stelle die Einschrittkandidaten scheitern. */
export const CHECKS = ['sources', 'block', 'formulas', 'effectiveDate', 'chain', 'roundTrip', 'baselineStart'] as const;
export type CheckName = (typeof CHECKS)[number];

interface NormOutcome {
  checks: Partial<Record<CheckName, boolean>>;
  failures: Failure[];
  formulas: FormulaId[];
  effectiveDate?: string;
  priorAmendment?: string;
  /** Befehl, Orte und Rundlauf haben bestanden; ausgeschlossen nur wegen eines weichen Grundes. */
  roundTripVerified?: boolean;
  recipe?: ReconstructionRecipe;
}

const snippet = (text: string, position: number, length: number): string => {
  const start = Math.max(0, position - 60);
  const end = Math.min(text.length, position + length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

function fieldText(body: CurrentNorm['body'], scope: ScopeRecord, at: { ref: { path: number[]; key: 'text' | 'title' } }): string {
  const block = blockAt(body, at.ref.path);
  return String(block?.[at.ref.key] ?? '');
}

async function reconstructNorm(ctx: Context, documentId: string, event: LedgerRecord): Promise<NormOutcome> {
  const failures: Failure[] = [];
  const checks: Partial<Record<CheckName, boolean>> = {};
  const outcome: NormOutcome = { checks, failures, formulas: [] };
  const fail = (state: ReconstructionState, reason: string, detail: string): NormOutcome => {
    failures.push({ state, reason, detail });
    return outcome;
  };

  const detail = DETAIL_URL.exec(event.sourceUrl);
  if (!detail) return fail('missing-base', 'no-detail-page', `Das Ereignis verweist auf keine Detailseite (${event.sourceUrl})`);
  const page = await readCached(ctx.root, event.sourceUrl);
  if (!page) return fail('missing-base', 'detail-page-not-cached', `Detailseite nicht im Cache: ${event.sourceUrl} (nicht abgerufen)`);
  const units = await pageUnits(ctx, event.sourceUrl);
  if (!units || units.length === 0) return fail('missing-base', 'no-text-layer', 'Detailseite ohne HTML-Textkörper (kein OCR)');
  const packageSource = await readCached(ctx.root, packageUrl(documentId));
  if (!packageSource) return fail('missing-base', 'current-package-not-cached', 'Heutiges Exportpaket nicht im Cache');
  let norm: CurrentNorm;
  try {
    norm = parseCurrentNorm(documentId, packageSource, ctx.evaluationDate);
  } catch (error) {
    return fail('missing-base', 'current-package-unreadable', `Heutiges Paket nicht lesbar: ${(error as Error).message}`);
  }
  if (!event.eventDate) return fail('contradictory', 'event-without-date', 'Ereignis ohne Verkündungsdatum');
  checks.sources = true;
  const eventKey: PublicationKey = { organ: detail[1] as 'gvbl' | 'baymbl', volume: Number(detail[2]), position: Number(detail[3]) };

  // 2 – Befehlsblock.
  const block = commandBlock(units, norm.identity);
  if (isBlockFailure(block)) {
    checks.block = false;
    if (block.code === 'intro-ambiguous') return fail('partial-chain', 'multiple-sections', block.detail);
    return fail('command-unreadable', block.code, block.detail);
  }

  // 3 – Formeln.
  const { leaves, failures: structureFailures } = leavesOf(block);
  for (const message of structureFailures) failures.push({ state: 'command-unreadable', reason: 'location-unreadable', detail: message });
  const parsed = leaves.map((leaf) => ({ leaf, parsed: parseCommand(leaf.node.depth === 0 ? leaf.node.text : leaf.node.text, leaf.context) }));
  for (const { leaf, parsed: command } of parsed) {
    outcome.formulas.push(...command.formulas);
    if (command.operations && leaf.hasChildren) {
      failures.push({ state: 'unsupported-formula', reason: 'unrecognized', detail: `${leaf.labels.join(' ')} „${leaf.node.text.slice(0, 140)}“: Befehl mit eigener Änderung und Untergliederung` });
      continue;
    }
    if (command.operations) continue;
    const worst = command.formulas.find((formula) => NON_INVERTIBLE_FORMULAS.has(formula)) ?? command.formulas.find((formula) => !SUPPORTED_FORMULAS.has(formula)) ?? command.formulas[0]!;
    const label = leaf.labels.length > 0 ? `${leaf.labels.join(' ')} ` : '';
    const text = `${label}„${leaf.node.text.slice(0, 140)}“: ${command.reason}`;
    if (worst === 'annex-recast') failures.push({ state: 'asset-missing', reason: worst, detail: text });
    else if (NON_INVERTIBLE_FORMULAS.has(worst)) failures.push({ state: 'non-invertible-amendment', reason: worst, detail: text });
    else failures.push({ state: 'unsupported-formula', reason: worst, detail: text });
  }

  checks.block = structureFailures.length === 0;
  checks.formulas = parsed.every(({ leaf, parsed: command }) => command.operations !== undefined && !leaf.hasChildren);

  // 4 – Inkrafttreten.
  const mantel = new Set(amendingCitations(units).map((entry) => entry.unit.index)).size > 1;
  const section = sectionRef(block.section, block.intro.label?.replace(/^[„‚]/u, ''));
  const commencement = commencementFor(units, event.eventDate, section, mantel);
  if (!commencement.ok) {
    checks.effectiveDate = false;
    failures.push({ state: 'effective-date-undetermined', reason: 'commencement-unreadable', detail: commencement.reason });
  } else {
    outcome.effectiveDate = commencement.dates.at(-1)!;
    const verdict = effectiveDateVerdict(commencement.dates, { baselineDate: ctx.baselineDate, evaluationDate: ctx.evaluationDate, ...(norm.inForceFrom ? { inForceFrom: norm.inForceFrom } : {}) });
    checks.effectiveDate = verdict.ok;
    if (!verdict.ok) failures.push({ state: 'contradictory', reason: verdict.reason, detail: verdict.detail });
  }

  // 5 – Kette.
  const others: string[] = [];
  for (const [url, citations] of ctx.amendingByPage) {
    if (url === event.sourceUrl) continue;
    if (citations.some((citation) => isStrongMatch(citationMatches(citation, norm.identity)))) others.push(url);
  }
  const chain = checkChain({
    baselineDate: ctx.baselineDate,
    event: eventKey,
    ...(norm.fullCitation ? { fullCitation: norm.fullCitation } : {}),
    ...(norm.changeHistory ? { changeHistory: norm.changeHistory } : {}),
    ...(block.priorAmendmentClause ? { priorClause: block.priorAmendmentClause } : {}),
    postBaselinePublications: ctx.postBaselinePublications,
    otherAmendingPublications: others.sort(),
    ...(ctx.registerNotes.has(documentId) ? { registerNotes: ctx.registerNotes.get(documentId)! } : {}),
  });
  // Das Inkrafttreten der vorangehenden Änderung ist belegt, wenn ihre Verkündung im Cache liegt und ein
  // Kalenderdatum am oder vor dem Stichtag nennt – dann fällt der einzige weiche Kettenbefund weg.
  const priorProof = block.priorAmendmentClause && chain.failures.some((failure) => failure.reason === 'prior-amendment-in-force-unproven')
    ? await priorAmendmentInForce(ctx, block.priorAmendmentClause, ctx.baselineDate)
    : undefined;
  const chainFailures = priorProof?.ok ? chain.failures.filter((failure) => failure.reason !== 'prior-amendment-in-force-unproven') : chain.failures;
  for (const failure of chainFailures) {
    const detail = failure.reason === 'prior-amendment-in-force-unproven' && priorProof?.reason ? `${failure.detail} (${priorProof.reason})` : failure.detail;
    failures.push({ state: failure.state, reason: failure.reason, detail, ...(failure.reason === 'prior-amendment-in-force-unproven' ? { soft: true } : {}) });
  }
  if (block.priorAmendmentClause) outcome.priorAmendment = block.priorAmendmentClause;
  checks.chain = chainFailures.every((failure) => failure.reason === 'prior-amendment-in-force-unproven');
  if (chainFailures.some((failure) => failure.reason === 'prior-amendment-in-force-unproven')) checks.baselineStart = false;
  if (chainFailures.length === 0 && chain.stammfassung && (block.citation.versionForm || block.citation.consolidatedForm)) {
    checks.baselineStart = false;
    failures.push({
      state: 'partial-chain',
      reason: 'baseline-text-in-force-unproven',
      detail: `Der Befehl zitiert die Norm ${block.citation.versionForm ? '„in der Fassung der Bekanntmachung“' : 'in der bereinigten Fassung der BayRS'}; die Inkrafttretensvorschrift des Stammgesetzes belegt nicht den Beginn dieser Fassung`,
      soft: true,
    });
  }

  if (failures.some((failure) => !failure.soft)) return outcome;
  checks.roundTrip = false;

  // 6 – Orte auflösen, Schritte bilden.
  const steps: RecipeStep[] = [];
  for (const { leaf, parsed: command } of parsed) {
    for (const operation of command.operations as ParsedOperation[]) {
      const scopes: ScopeRecord[] = [];
      for (const path of operation.locations) {
        const resolved = resolvePath(norm.body, path);
        if (!resolved.ok) return fail('ambiguous-target', 'location-unresolved', `${leaf.labels.join(' ')} ${formatPath(path)}: ${resolved.reason}`);
        scopes.push(resolved.scope);
      }
      if (scopes.length > 1) {
        const seen = new Set<string>();
        for (const scope of scopes) {
          for (const field of scope.fields) {
            const key = `${field.path.join('.')}:${field.key}`;
            if (seen.has(key)) return fail('ambiguous-target', 'overlapping-locations', `${leaf.labels.join(' ')}: die Orte von „jeweils“ überschneiden sich`);
            seen.add(key);
          }
        }
      }
      operation.locations.forEach((path, index) => {
        steps.push({
          id: `s${String(steps.length + 1).padStart(2, '0')}`,
          command: leaf.command,
          commandPath: leaf.labels,
          formula: operation.formula,
          location: formatPath(path),
          scope: scopes[index]!,
          operation: operation.operation,
          evidence: { baseline: '', current: '' },
        });
      });
    }
  }
  if (steps.length === 0) return fail('unsupported-formula', 'no-operation', 'Kein anwendbarer Schritt');

  // 7 – Rückwärts, vorwärts, Rundlauf.
  let baselineBody;
  try {
    baselineBody = reverseSteps(norm.body, steps);
  } catch (error) {
    const code = error instanceof ReconstructionError ? error.code : 'error';
    return fail(code === 'target-ambiguous' || code === 'end-not-determined' ? 'ambiguous-target' : 'round-trip-failed', `reverse-${code}`, (error as Error).message);
  }
  // Vorher-/Nachher-Belege: vorwärts Schritt für Schritt, Ausschnitt um die Stelle.
  const walker = structuredClone(baselineBody);
  try {
    for (const step of steps) {
      const beforeBody = structuredClone(walker);
      const at = applyForward(walker, step.scope, step.operation, step.id);
      const before = fieldText(beforeBody, step.scope, at);
      const after = fieldText(walker, step.scope, at);
      const changed = Math.max(0, after.length - before.length);
      step.evidence = { baseline: snippet(before, at.position, Math.max(0, before.length - after.length)), current: snippet(after, at.position, changed) };
    }
  } catch (error) {
    const code = error instanceof ReconstructionError ? error.code : 'error';
    return fail(code === 'target-ambiguous' ? 'ambiguous-target' : 'round-trip-failed', `forward-${code}`, (error as Error).message);
  }

  // Rundlauf auf dem Körper: vorwärts muss exakt der heutige Körper herauskommen.
  if (stableStringify(walker) !== stableStringify(norm.body)) return fail('round-trip-failed', 'round-trip', 'Vorwärts angewandt ergibt der Stichtagskörper nicht den heutigen Körper');
  if (bodyFingerprint(baselineBody) === bodyFingerprint(norm.body)) return fail('round-trip-failed', 'no-change', 'Rückrechnung ändert nichts');
  checks.roundTrip = true;
  if (failures.length > 0) {
    outcome.roundTripVerified = true;
    return outcome;
  }

  // 8 – Beginn der Stichtagsfassung: bei einer vorangehenden Änderung deren belegtes Inkrafttreten, sonst die
  // eigene Inkrafttretensvorschrift der Stammfassung.
  const own = priorProof?.ok
    ? { ok: true, date: priorProof.date, evidence: priorProof.evidence }
    : ownCommencement(baselineBody, ctx.baselineDate);
  checks.baselineStart = own.ok;
  if (!own.ok) {
    failures.push({ state: 'partial-chain', reason: 'baseline-text-in-force-unproven', detail: `Beginn der Stichtagsfassung (Stammfassung) nicht belegt: ${'reason' in own ? own.reason : ''}`, soft: true });
    outcome.roundTripVerified = true;
    return outcome;
  }

  const recipe: ReconstructionRecipe = {
    schemaVersion: RECIPE_SCHEMA,
    documentId,
    baselineDate: ctx.baselineDate,
    method: 'reverse-amendment',
    source: {
      url: packageSource.url,
      sha256: packageSource.sha256,
      ...(packageSource.retrievedAt ? { retrievedAt: packageSource.retrievedAt } : {}),
      parserVersion: PARSER_VERSION,
      inForceFrom: norm.inForceFrom!,
      ...(norm.fullCitation ? { fullCitation: norm.fullCitation } : {}),
    },
    amendment: {
      eventId: event.id,
      citation: event.citation,
      organ: event.organ,
      publicationAuthority: event.publicationAuthority,
      digitalRepresentation: event.digitalRepresentation,
      url: event.sourceUrl,
      sha256: page.sha256,
      ...(page.retrievedAt ? { retrievedAt: page.retrievedAt } : {}),
      ...(event.gazettePdfUrl ? { gazettePdfUrl: event.gazettePdfUrl } : {}),
      ...(event.gazettePdfSha256Published ? { gazettePdfSha256Published: event.gazettePdfSha256Published } : {}),
      eventDate: event.eventDate,
      ...(event.enactmentDate ? { enactmentDate: event.enactmentDate } : {}),
      effectiveDate: outcome.effectiveDate!,
      effectiveDateEvidence: commencement.ok ? commencement.applicable.map((statement) => statement.text) : [],
      ...(block.section ? { section: block.section } : {}),
      intro: block.intro.text,
      ...(block.priorAmendmentClause ? { priorAmendment: block.priorAmendmentClause } : {}),
    },
    baselineTextInForce: {
      date: own.date!,
      evidence: priorProof?.ok
        ? ['Stand nach der vorangehenden Änderung; ihr Inkrafttreten ist durch ihre eigene Verkündung belegt', ...own.evidence]
        : [
            'Stammfassung: Der Einleitungssatz nennt keine vorangehende Änderung, der Änderungsverlauf führt vor dem Stichtag keine',
            ...own.evidence,
          ],
      ...(priorProof?.ok ? { sources: priorProof.sources } : {}),
    },
    chain: chain.evidence,
    steps,
    whitespace: WHITESPACE_NORMALIZATION,
    expected: { currentFingerprint: bodyFingerprint(norm.body), baselineFingerprint: bodyFingerprint(baselineBody) },
  };
  const problems = recipeProblems(recipe);
  if (problems.length > 0) return fail('contradictory', 'recipe-invalid', problems.join('; '));
  const roundTrip = verifyRoundTrip(norm.body, recipe);
  if (!roundTrip.ok) {
    checks.roundTrip = false;
    return fail('round-trip-failed', 'round-trip', roundTrip.detail);
  }
  // Die Datei wird wie gespeichert wieder gelesen: Auch die JSON-Form muss den Rundlauf bestehen.
  const reread = JSON.parse(JSON.stringify(recipe)) as ReconstructionRecipe;
  const again = verifyRoundTrip(norm.body, reread);
  if (!again.ok) return fail('round-trip-failed', 'round-trip-serialized', again.detail);
  outcome.recipe = recipe;
  return outcome;
}

/* -------------------------------------------------------------------- Stichtagsstatus */

const RECONSTRUCTION_BLOCKER = 'Rekonstruktion: ';
const RECONSTRUCTION_EVIDENCE_SOURCE = 'reconstruction';

/** Stellt die Entscheidung der Klassifikation wieder her (idempotent gegenüber früheren Läufen). */
function restoreChanged(decision: BaselineDecision, baselineDate: string): BaselineDecision {
  const inForce = decision.evidence.find((entry) => entry.kind === 'text-in-force')?.value;
  return {
    ...decision,
    status: 'active-at-baseline',
    method: 'undetermined',
    reason: 'text-changed-after-baseline',
    evidence: decision.evidence.filter((entry) => entry.source !== RECONSTRUCTION_EVIDENCE_SOURCE),
    blockers: [`Der gezeigte Text gilt erst ab ${inForce ?? '–'}; die Fassung vom ${baselineDate} ist zu beschaffen`],
  };
}

export function applyDecisions(baseline: BaselineFile, entries: readonly QueueEntry[]): BaselineFile {
  const byId = new Map(entries.map((entry) => [entry.documentId, entry]));
  const decisions = baseline.decisions.map((original) => {
    if (original.class !== 'changed-after-baseline') return original;
    const entry = byId.get(original.documentId);
    const decision = restoreChanged(original, baseline.baselineDate);
    if (!entry) return decision;
    if (entry.state === 'recipe-ready' && entry.recipe) {
      return {
        ...decision,
        status: 'active-at-baseline' as const,
        method: 'reverse-amendment' as const,
        reason: 'reverse-amendment-verified',
        evidence: [
          ...decision.evidence,
          {
            kind: 'post-baseline-event' as const,
            value: `reverse-amendment ${entry.events[0]!.citation}, in Kraft ${entry.effectiveDate}; Rezept ${entry.recipe.path} (${entry.recipe.steps} Schritt(e), Stichtagskörper ${entry.recipe.baselineFingerprint.slice(0, 16)})`,
            source: RECONSTRUCTION_EVIDENCE_SOURCE,
          },
        ],
        blockers: [],
      };
    }
    return { ...decision, blockers: [...decision.blockers, `${RECONSTRUCTION_BLOCKER}${entry.state} (${entry.reason}) – ${entry.detail}`] };
  });
  const byStatus: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const decision of decisions) {
    byStatus[decision.status] = (byStatus[decision.status] ?? 0) + 1;
    byMethod[decision.method] = (byMethod[decision.method] ?? 0) + 1;
  }
  return { ...baseline, totals: { ...baseline.totals, byStatus, byMethod }, decisions };
}

/* ---------------------------------------------------------------------------- Lauf */

export interface ReconstructionOptions {
  baselineDate?: string;
  evaluationDate?: string;
  /** Nur diese Normen (Probelauf); die Schlange enthält dann nur sie. */
  only?: readonly string[];
}

export async function runReconstruction(root: string, options: ReconstructionOptions = {}): Promise<ReconstructionRun> {
  const baselineDate = options.baselineDate ?? BASELINE_DATE;
  const evaluationDate = options.evaluationDate ?? EVALUATION_DATE;
  const baseline = JSON.parse(await readFile(join(root, BASELINE_PATH), 'utf8')) as BaselineFile;
  const ledger = await loadLedger(root);

  const postBaseline = ledger.filter((event) => (event.eventDate ?? '') > baselineDate);
  const postBaselinePublications = new Set<string>();
  for (const event of postBaseline) {
    const key = publicationKeyFromCitation(event.citation);
    if (key) postBaselinePublications.add(publicationKeyString(key));
  }
  const registerNotes = new Map<string, string[]>();
  for (const file of ['enumeration-landesrecht.json', 'enumeration-vwv.json']) {
    try {
      const parsed = JSON.parse(await readFile(join(root, IMPORT_DATA_DIR, file), 'utf8')) as { items?: Array<{ documentId?: string; changeNotes?: string[] }> };
      for (const item of parsed.items ?? []) if (item.documentId && item.changeNotes && item.changeNotes.length > 0) registerNotes.set(item.documentId, item.changeNotes);
    } catch {
      // Ohne Enumeration fehlt nur eine der Gegenproben; die übrigen bleiben.
    }
  }
  const ctx: Context = { root, registerNotes, baselineDate, evaluationDate, postBaselinePublications, amendingByPage: new Map(), units: new Map() };
  for (const url of [...new Set(postBaseline.map((event) => event.sourceUrl).filter((url) => DETAIL_URL.test(url)))].sort()) {
    const units = await pageUnits(ctx, url);
    if (!units) continue;
    ctx.amendingByPage.set(url, amendingCitations(units).map((entry) => entry.citation));
  }

  // Stark zugeordnete Ereignisse nach dem Stichtag je Norm – dieselbe Regel wie die Stichtagsklassifikation.
  const eventsByDocument = new Map<string, LedgerRecord[]>();
  for (const event of postBaseline) {
    const resolution = event.targetResolution;
    if (resolution?.status !== 'resolved' || resolution.matchStrength !== 'strong' || !resolution.sourceIdentity) continue;
    const list = eventsByDocument.get(resolution.sourceIdentity) ?? [];
    list.push(event);
    eventsByDocument.set(resolution.sourceIdentity, list);
  }

  const changed = baseline.decisions.filter((decision) => decision.class === 'changed-after-baseline').filter((decision) => !options.only || options.only.includes(decision.documentId));
  const entries: QueueEntry[] = [];
  const recipes: ReconstructionRecipe[] = [];
  const formulaStats = new Map<FormulaId, { clauses: number; norms: Set<string> }>();

  for (const decision of changed) {
    const events = [...(eventsByDocument.get(decision.documentId) ?? [])].sort((left, right) => (left.eventDate! < right.eventDate! ? -1 : left.eventDate! > right.eventDate! ? 1 : left.id < right.id ? -1 : 1));
    const eventSummary = events.map((event) => ({ id: event.id, eventType: event.eventType, eventDate: event.eventDate!, citation: event.citation }));
    const base = { documentId: decision.documentId, steps: events.length, events: eventSummary, alsoFailed: [] as QueueEntry['alsoFailed'] };
    const nonInvertible = events.filter((event) => NON_INVERTIBLE_EVENT_TYPES.includes(event.eventType));
    if (events.length === 0) {
      entries.push({ ...base, state: 'missing-base', reason: 'no-post-baseline-event', detail: 'Kein stark zugeordnetes Ereignis nach dem Stichtag belegt die Änderung; die Kette ist unbekannt', priority: COMMAND_STATE_PRIORITY['missing-base'] });
      continue;
    }
    if (nonInvertible.length > 0) {
      entries.push({ ...base, state: 'non-invertible-amendment', reason: 'recast-event', detail: `${nonInvertible.map((event) => `${event.eventType} ${event.eventDate} (${event.citation})`).join(', ')}: Neufassung, der Alttext folgt daraus nicht`, priority: COMMAND_STATE_PRIORITY['non-invertible-amendment'] + events.length });
      continue;
    }
    if (events.length > 1) {
      entries.push({ ...base, state: 'partial-chain', reason: 'multi-step', detail: `${events.length} belegte Änderungsschritte nach dem Stichtag; nur einschrittige Ketten werden zurückgerechnet`, priority: COMMAND_STATE_PRIORITY['partial-chain'] + events.length });
      continue;
    }

    const outcome = await reconstructNorm(ctx, decision.documentId, events[0]!);
    const seenInNorm = new Set<FormulaId>();
    for (const formula of outcome.formulas) {
      const stat = formulaStats.get(formula) ?? { clauses: 0, norms: new Set<string>() };
      stat.clauses += 1;
      stat.norms.add(decision.documentId);
      formulaStats.set(formula, stat);
      seenInNorm.add(formula);
    }
    const formulas = [...seenInNorm].sort((left, right) => FORMULAS.indexOf(left) - FORMULAS.indexOf(right));
    const extra = {
      ...(formulas.length > 0 ? { formulas } : {}),
      ...(outcome.effectiveDate ? { effectiveDate: outcome.effectiveDate } : {}),
      ...(outcome.priorAmendment ? { priorAmendment: outcome.priorAmendment } : {}),
      ...(outcome.roundTripVerified ? { roundTripVerified: true } : {}),
      checks: outcome.checks,
    };
    if (outcome.recipe) {
      const path = `${RECONSTRUCTION_DIR}/${decision.documentId}.json`;
      recipes.push(outcome.recipe);
      entries.push({
        ...base,
        ...extra,
        state: 'recipe-ready',
        reason: 'reverse-amendment-verified',
        detail: `${outcome.recipe.steps.length} Schritt(e) aus ${outcome.recipe.amendment.citation}, in Kraft ${outcome.recipe.amendment.effectiveDate}; Rundlauf exakt`,
        priority: COMMAND_STATE_PRIORITY['recipe-ready'],
        recipe: { path, steps: outcome.recipe.steps.length, currentFingerprint: outcome.recipe.expected.currentFingerprint, baselineFingerprint: outcome.recipe.expected.baselineFingerprint },
      });
      continue;
    }
    const failures = [...outcome.failures].sort(byPrecedence);
    const primary = failures[0]!;
    entries.push({
      ...base,
      ...extra,
      state: primary.state,
      reason: primary.reason,
      detail: primary.detail,
      alsoFailed: groupFailures(failures.slice(1).filter((failure) => failure.state !== primary.state || failure.reason !== primary.reason)),
      priority: COMMAND_STATE_PRIORITY[primary.state] + 1,
    });
  }

  entries.sort((left, right) => (left.priority !== right.priority ? left.priority - right.priority : left.documentId < right.documentId ? -1 : 1));
  const count = (list: readonly QueueEntry[], key: (entry: QueueEntry) => string): Record<string, number> => {
    const output: Record<string, number> = {};
    for (const entry of list) output[key(entry)] = (output[key(entry)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(output).sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1)));
  };
  const singleStep = entries.filter((entry) => entry.steps === 1 && entry.reason !== 'recast-event');
  const formulas: ReconstructionQueue['totals']['formulas'] = {};
  for (const formula of FORMULAS) {
    const stat = formulaStats.get(formula);
    if (!stat) continue;
    formulas[formula] = { clauses: stat.clauses, norms: stat.norms.size, supported: SUPPORTED_FORMULAS.has(formula), invertible: !NON_INVERTIBLE_FORMULAS.has(formula) };
  }
  const queue: ReconstructionQueue = {
    schemaVersion: QUEUE_SCHEMA,
    baselineDate,
    evaluationDate,
    totals: {
      changedAfterBaseline: entries.length,
      singleStep: singleStep.length,
      recipeReady: entries.filter((entry) => entry.state === 'recipe-ready').length,
      byState: count(entries, (entry) => entry.state),
      byReason: count(entries, (entry) => `${entry.state}/${entry.reason}`),
      singleStepByState: count(singleStep, (entry) => entry.state),
      singleStepByReason: count(singleStep, (entry) => `${entry.state}/${entry.reason}`),
      checks: Object.fromEntries(CHECKS.map((check) => [check, {
        passed: singleStep.filter((entry) => entry.checks?.[check] === true).length,
        failed: singleStep.filter((entry) => entry.checks?.[check] === false).length,
        notReached: singleStep.filter((entry) => entry.checks?.[check] === undefined).length,
      }])),
      roundTripVerifiedWithoutStart: singleStep.filter((entry) => entry.roundTripVerified).length,
      formulas,
    },
    entries,
  };
  return { queue, recipes: recipes.sort((left, right) => (left.documentId < right.documentId ? -1 : 1)), baseline: options.only ? baseline : applyDecisions(baseline, entries) };
}

/** Schreibt Rezepte (und entfernt veraltete), Schlange, Stichtagsentscheidungen und Bericht. */
export async function writeReconstruction(root: string, run: ReconstructionRun): Promise<string[]> {
  const written: string[] = [];
  const directory = join(root, RECONSTRUCTION_DIR);
  const current = new Set(run.recipes.map((recipe) => `${recipe.documentId}.json`));
  for (const recipe of run.recipes) {
    if (await writeJsonAtomic(join(directory, `${recipe.documentId}.json`), recipe)) written.push(`${RECONSTRUCTION_DIR}/${recipe.documentId}.json`);
  }
  let existing: string[] = [];
  try {
    existing = await readdir(directory);
  } catch {
    existing = [];
  }
  for (const name of existing) {
    if (!name.endsWith('.json') || current.has(name)) continue;
    await rm(join(directory, name));
    written.push(`${RECONSTRUCTION_DIR}/${name} (entfernt: kein gültiges Rezept mehr)`);
  }
  if (await writeJsonAtomic(join(root, RECONSTRUCTION_QUEUE_PATH), run.queue)) written.push(RECONSTRUCTION_QUEUE_PATH);
  if (await writeJsonAtomic(join(root, BASELINE_PATH), run.baseline)) written.push(BASELINE_PATH);
  if (await writeFileAtomic(join(root, RECONSTRUCTION_REPORT_PATH), renderReconstructionReport(run))) written.push(RECONSTRUCTION_REPORT_PATH);
  return written;
}

/* -------------------------------------------------------------------------- Bericht */

const STATE_LABELS: Readonly<Record<ReconstructionState, string>> = {
  'recipe-ready': 'sicher zurückgerechnet (Rezept, Rundlauf exakt)',
  'partial-chain': 'Kette nicht einschrittig',
  'missing-base': 'Beleg fehlt',
  'non-invertible-amendment': 'Befehl nicht umkehrbar',
  'asset-missing': 'Anlage ohne Alttext',
  contradictory: 'Belege widersprechen einander',
  'command-unreadable': 'Befehl nicht auffindbar oder nicht lesbar',
  'unsupported-formula': 'Formel nicht maschinell angewandt',
  'ambiguous-target': 'Ort oder Wortlaut nicht eindeutig',
  'effective-date-undetermined': 'Inkrafttreten nicht bestimmbar',
  'round-trip-failed': 'Rundlauf gescheitert',
};

const FORMULA_LABELS: Readonly<Record<FormulaId, string>> = {
  'replace-words': '„… wird die Angabe „X“ durch die Angabe „Y“ ersetzt“',
  'insert-words': '„… wird nach/vor der Angabe „X“ die Angabe „Y“ eingefügt“',
  'delete-words-anchored': '„… wird nach/vor der Angabe „X“ die Angabe „Y“ gestrichen“',
  'append-words': '„Der Überschrift wird die Angabe „Y“ angefügt“',
  'replace-final-punctuation': '„… wird der Punkt am Ende durch … ersetzt“',
  'delete-words': '„… wird die Angabe „X“ gestrichen“ (ohne Anker)',
  recast: '„… wird wie folgt gefasst:“ / „erhält folgende Fassung“',
  'repeal-unit': '„… wird aufgehoben“ / „Satz 5 wird gestrichen“',
  'annex-recast': '„… erhalten die aus dem Anhang ersichtliche Fassung“',
  'insert-unit': '„Folgender Abs. 3 wird angefügt: …“ / „Nach Nr. 4 wird folgende Nr. 5 eingefügt: …“',
  renumber: '„Der bisherige Abs. 2 wird Abs. 3“ / „Der Wortlaut wird Satz 1“',
  'replace-by-punctuation': '„… das Wort „oder“ durch ein Komma ersetzt“',
  container: '„Art. 5 wird wie folgt geändert:“ (Gliederung)',
  unrecognized: 'nicht erkannt',
};

const pad = (value: number | string, width = 5): string => String(value).padStart(width);

const CHECK_LABELS: Readonly<Record<CheckName, string>> = {
  sources: 'Detailseite und heutiges Paket im Cache',
  block: 'Einleitungssatz genau einmal, Befehlsblock und Orte lesbar',
  formulas: 'jede Klausel mit unterstützter, rückrechenbarer Formel',
  effectiveDate: 'Inkrafttreten bestimmt, nach dem Stichtag, = inkraft des Pakets',
  chain: 'einschrittig: Vollzitat, Änderungsverlauf, Fortführungsnachweis, übrige Verkündungen',
  roundTrip: 'Orte aufgelöst, Wortlaut je Bereich genau einmal, Rundlauf exakt',
  baselineStart: 'Beginn der Stichtagsfassung (≤ Stichtag) belegt',
};

const cell = (value: string): string => value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ');

export function renderReconstructionReport(run: ReconstructionRun): string {
  const { queue, recipes } = run;
  const t = queue.totals;
  const lines: string[] = [];
  const push = (...values: string[]): void => {
    lines.push(...values);
  };
  push('# Rückrechnung von Änderungen – BayWü', '');
  push(`Stichtag **${queue.baselineDate}** · Auswertungsstichtag ${queue.evaluationDate} · erzeugt von \`npm run import:bayernrecht:reconstruction-queue -- --write\` (offline, nur Cache). Methode und Begründungen: \`docs/BAYWUE_RECONSTRUCTION.md\`. Schlange: \`data/imports/bayernrecht/reconstruction-queue.json\`. Rezepte: \`data/imports/bayernrecht/reconstruction/<documentId>.json\`.`, '');
  push('## Kennzahl', '');
  push(`Von **${t.changedAfterBaseline}** Normen der Klasse \`changed-after-baseline\` sind **${t.recipeReady} sicher zurückgerechnet** (Methode \`reverse-amendment\`, Status \`active-at-baseline\` ohne Blocker). Die übrigen **${t.changedAfterBaseline - t.recipeReady}** bleiben \`reconstruction-required\` – mit einem Zustand der Rekonstruktionsschlange und Begründung.`, '');
  push(`Angegangen wurden nur die **${t.singleStep}** Normen mit genau einem stark belegten Änderungsschritt nach dem Stichtag (stark aufgelöstes Ereignis des Registers mit Verkündung nach dem Stichtag – dieselbe Regel wie die Stichtagsklassifikation). Der Auftrag nannte 258; mit dieser Regel sind es ${t.singleStep}. ${t.recipeReady} davon sind zurückgerechnet.`, '');
  push(`**${t.roundTripVerifiedWithoutStart}** weitere Einschrittkandidaten bestehen Befehl, Inkrafttreten, Kette und den exakten Rundlauf – und bleiben trotzdem draußen, weil der **Beginn der Stichtagsfassung** nicht belegt ist. Entweder fehlt die Verkündung der vorangehenden Änderung (verkündet ist nicht in Kraft; ihr Inkrafttreten belegt nur ihre eigene Verkündung mit Kalenderdatum), oder die Norm begrenzt ihre eigene Geltung. Sie sind die ersten Kandidaten, sobald ein solcher Beleg vorliegt.`, '');
  push('## Wo die Einschrittkandidaten scheitern', '');
  push('Jede Prüfung nur für Kandidaten, die die vorherigen erreicht haben; „nicht erreicht“ heißt, eine frühere Prüfung hat die Norm bereits ausgeschlossen.', '');
  push('| Prüfung | bestanden | nicht bestanden | nicht erreicht |', '| --- | ---: | ---: | ---: |');
  for (const check of CHECKS) {
    const counts = t.checks[check]!;
    push(`| ${CHECK_LABELS[check]} | ${counts.passed} | ${counts.failed} | ${counts.notReached} |`);
  }
  push('');
  push('## Zustände', '');
  push('| Zustand | alle 519 | davon einschrittig | Bedeutung |', '| --- | ---: | ---: | --- |');
  for (const [state, value] of Object.entries(t.byState)) push(`| \`${state}\` | ${value} | ${t.singleStepByState[state] ?? 0} | ${STATE_LABELS[state as ReconstructionState] ?? ''} |`);
  push('');
  push('## Gründe', '');
  push('Je Norm zählt der schwerste Grund (Rangfolge: Beleg fehlt → Befehl unlesbar → Anlage → nicht umkehrbar → Kette → Widerspruch → Inkrafttreten → Formel → Mehrdeutigkeit → Rundlauf). Weitere gescheiterte Prüfungen stehen in der Schlange unter `alsoFailed`.', '');
  push('| Zustand / Grund | Normen |', '| --- | ---: |');
  for (const [reason, value] of Object.entries(t.byReason)) push(`| \`${reason}\` | ${value} |`);
  push('');
  push('## Änderungsformeln', '');
  push('Erhoben aus den Befehlsblöcken der Einschrittkandidaten, deren Einleitungssatz sich in der Verkündung fand. „Klauseln“ zählt jede Formel je Befehl; eine Norm fällt, sobald **eine** ihrer Klauseln nicht unterstützt ist.', '');
  push('| Formel | Wortlaut (Beispiel) | Klauseln | Normen | bestimmt Alttext | angewandt |', '| --- | --- | ---: | ---: | :---: | :---: |');
  for (const [formula, stat] of Object.entries(t.formulas).sort((left, right) => right[1].clauses - left[1].clauses)) {
    const determines = formula === 'insert-unit' || formula === 'renumber' || formula === 'replace-by-punctuation' || formula === 'unrecognized' || formula === 'container' ? '(ja)' : stat.invertible ? 'ja' : 'nein';
    push(`| \`${formula}\` | ${FORMULA_LABELS[formula as FormulaId]} | ${stat.clauses} | ${stat.norms} | ${determines} | ${stat.supported ? 'ja' : 'nein'} |`);
  }
  push('', '„(ja)“: bestimmt den Alttext grundsätzlich, wird aber nicht maschinell angewandt (strukturelle Änderung, Satzzeichen ohne eindeutige Stelle, nicht erkannte Formel).', '');
  push('## Zurückgerechnete Normen', '');
  if (recipes.length === 0) push('Keine.');
  else {
    push('| Norm | Verkündung | in Kraft | Beginn Stichtagsfassung | Schritte | Formeln | Stichtagskörper |', '| --- | --- | --- | --- | ---: | --- | --- |');
    for (const recipe of recipes) {
      const formulas = [...new Set(recipe.steps.map((step) => step.formula))].join(', ');
      push(`| \`${recipe.documentId}\` | ${recipe.amendment.citation} | ${recipe.amendment.effectiveDate} | ${recipe.baselineTextInForce.date} | ${recipe.steps.length} | ${formulas} | \`${recipe.expected.baselineFingerprint.slice(0, 16)}\` |`);
    }
    push('');
    for (const recipe of recipes) {
      push(`### ${recipe.documentId}`, '');
      push(`- Änderung: ${recipe.amendment.citation} (${recipe.amendment.url}, SHA-256 \`${recipe.amendment.sha256.slice(0, 16)}…\`), verkündet ${recipe.amendment.eventDate}, in Kraft ${recipe.amendment.effectiveDate} („${cell(recipe.amendment.effectiveDateEvidence.join(' '))}“)`);
      push(`- Beginn der Stichtagsfassung: ${recipe.baselineTextInForce.date} – ${cell(recipe.baselineTextInForce.evidence.slice(1).join(' · '))}`);
      for (const step of recipe.steps) {
        push(`- ${step.id} \`${step.formula}\` in ${step.location}: „${cell(step.command)}“`);
        push(`  - Stichtag: „${cell(step.evidence.baseline)}“`);
        push(`  - heute: „${cell(step.evidence.current)}“`);
      }
      push('');
    }
  }
  push('## Rundlauf bestanden, Beginn der Stichtagsfassung nicht belegt', '');
  const pending = queue.entries.filter((entry) => entry.roundTripVerified);
  if (pending.length === 0) push('Keine.');
  else {
    push('| Norm | Verkündung | in Kraft | vorangehende Änderung laut Befehl | Grund |', '| --- | --- | --- | --- | --- |');
    for (const entry of pending) push(`| \`${entry.documentId}\` | ${entry.events[0]!.citation} | ${entry.effectiveDate ?? '–'} | ${cell(entry.priorAmendment ?? '– (Stammfassung)')} | \`${entry.reason}\` |`);
  }
  push('');
  push('## Einschrittige Kandidaten, die nicht zurückgerechnet wurden', '');
  push('| Norm | Zustand | Grund | Befund |', '| --- | --- | --- | --- |');
  for (const entry of queue.entries.filter((candidate) => candidate.steps === 1 && candidate.state !== 'recipe-ready' && candidate.reason !== 'recast-event')) {
    push(`| \`${entry.documentId}\` | \`${entry.state}\` | \`${entry.reason}\` | ${cell(entry.detail).slice(0, 220)} |`);
  }
  push('');
  return `${lines.join('\n')}\n`;
}

export function reconstructionSummary(run: ReconstructionRun): string[] {
  const t = run.queue.totals;
  return [
    `Rückrechnung BayWü, Stichtag ${run.queue.baselineDate}: ${t.changedAfterBaseline} geänderte Normen, ${t.singleStep} einschrittig, ${t.recipeReady} sicher zurückgerechnet`,
    ...Object.entries(t.byState).map(([state, count]) => `  ${pad(count)}  ${state}`),
    '  Formeln (Klauseln / Normen / unterstützt):',
    ...Object.entries(t.formulas)
      .sort((left, right) => right[1].clauses - left[1].clauses)
      .map(([formula, stat]) => `  ${pad(stat.clauses)} ${pad(stat.norms, 4)}  ${formula}${stat.supported ? ' (unterstützt)' : stat.invertible ? '' : ' (nicht umkehrbar)'}`),
  ];
}
