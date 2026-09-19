/**
 * Rückrechnung von Änderungen nach dem Stichtag (Methode `reverse-amendment`), ein- und mehrstufig.
 *
 * Für jede Norm der Klasse `changed-after-baseline` entscheidet dieser Lauf, ob sich ihr Stichtagstext **sicher**
 * aus dem heutigen Text und den amtlichen Änderungsbefehlen zurückrechnen lässt – und schreibt für genau diese
 * Normen ein Rezept (`bayernrecht-reverse-amendment/1` für eine Änderung, `/2` für mehrere). Alle übrigen erhalten
 * einen Zustand der Rekonstruktionsschlange, **genau eine Gruppe** und ihre Gründe (`groups.ts`).
 *
 * Ablauf je Norm, jede Prüfung notwendig:
 *
 * 1. Heutiges Paket im Cache, geparst wie im Bulk (Quelltext vor der Überleitung).
 * 2. **Kette** (`walk.ts`): vom Vollzitat über die „zuletzt geändert durch …“-Verweise bis zur letzten Änderung
 *    vor dem Stichtag oder zur Stammfassung; Inkrafttreten je Änderung und Abschnitt; Gegenproben mit Register,
 *    Änderungsverlauf, Fortführungsnachweis und allen übrigen Verkündungen.
 * 3. **Rücknahme** je Änderung, jüngste zuerst (`steps.ts`): jeder Befehl mit unterstützter, eindeutig
 *    umkehrbarer Formel, aufgelöst im Zustand unmittelbar nach ihm; je Änderung Vorwärtsprobe.
 * 4. **Beginn der Stichtagsfassung**: Kalenderdatum der letzten Änderung vor dem Stichtag (ihre Verkündung liegt
 *    im Cache) oder der Inkrafttretensvorschrift der Stammfassung.
 * 5. **Forward-Replay**: Stichtagskörper plus alle Änderungen, älteste zuerst, ergibt exakt den heutigen Körper –
 *    auch nach Serialisierung des Rezepts.
 *
 * Normen werden **nicht** nach `content/` geschrieben. Ergebnis: Rezepte, Schlange, Quellenregister, Audit und
 * die Stichtagsentscheidungen in `baseline.json` (frisch gelesen beim Schreiben; nur eigene Entscheidungen).
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import type { BaselineDecision } from '../baseline/classify.ts';
import { COMMAND_STATE_PRIORITY, NON_INVERTIBLE_EVENT_TYPES, type ReconstructionState } from '../baseline/reconstruction.ts';
import { BASELINE_PATH, type BaselineFile } from '../baseline/run.ts';
import { AUDIT_DIR, IMPORT_DATA_DIR, PARSER_VERSION } from '../common/constants.ts';
import { RECONSTRUCTION_QUEUE_PATH } from '../common/paths.ts';
import { decodeEntities } from '../events/listings.ts';
import { FETCH_CHECKPOINT_PATH, walkInputFor, type FetchCheckpoint } from './acquire.ts';
import { verifyRoundTripLaw } from './apply.ts';
import { buildAudit, RECONSTRUCTION_AUDIT_PATH, type ReconstructionAudit } from './audit.ts';
import { lastAmendmentClause } from './chain.ts';
import { commencementFor, ownCommencement, sectionRef } from './commencement.ts';
import { loadRunContext, pageUnits, type LedgerRecord, type RunContext } from './context.ts';
import { FORMULAS, NON_INVERTIBLE_FORMULAS, parseCommand, SUPPORTED_FORMULAS, type FormulaId } from './formulas.ts';
import { normalizeGazetteText, type GazetteUnit } from './gazette.ts';
import { assignGroup, emptySurvey, GROUPS, surveyCommand, type CommandSurvey, type GroupReason, type ReconstructionGroup } from './groups.ts';
import { publicationCitation, SOURCE_AUTHORITY } from './pages.ts';
import {
  bodyFingerprint,
  isRecipeV2,
  RECIPE_SCHEMA,
  RECIPE_SCHEMA_V2,
  recipeAmendments,
  recipeProblems,
  WHITESPACE_NORMALIZATION,
  type AnyReconstructionRecipe,
  type RecipeAmendment,
  type RecipeAmendmentV2,
  type RecipeSource,
  type ReconstructionRecipe,
  type RecipeRestoration,
  type RecipeTitle,
  type RecipeTitleChange,
} from './recipe.ts';
import { buildSourceRegister, RECONSTRUCTION_SOURCES_PATH, type SourceRegister } from './register.ts';
import { cachePlatform, loadPublicationBase, proveRestoration, type PriorAmendment, type UsedPriorAmendment } from './publication.ts';
import { forwardPublicationBase } from './forward.ts';
import { assessPdfBase, type PdfBaseState } from './pdfbase.ts';
import { formConventions, TYPOGRAPHY_NORMALIZATION, wordingAgreement, type FormConventions, type PublicationBase } from './restore.ts';
import { packageUrl, parseCurrentNorm, readCached, type CurrentNorm } from './source.ts';
import { commandLeaves, reverseAmendment } from './steps.ts';
import { titleState } from './title.ts';
import { clauseAmendments, commandBlocks, type CommandBlock } from './structure.ts';
import { recheckUndetermined, applyUndeterminedDecisions, type UndeterminedResult } from './undetermined.ts';
import { walkChain, type WalkResult, type WalkStep } from './walk.ts';

export const RECONSTRUCTION_DIR = join(IMPORT_DATA_DIR, 'reconstruction');
export const RECONSTRUCTION_REPORT_PATH = join(AUDIT_DIR, 'RECONSTRUCTION.md');
export const QUEUE_SCHEMA = 'bayernrecht-reconstruction-queue/2' as const;

export type { LedgerRecord } from './context.ts';

export interface QueueEntry {
  documentId: string;
  state: ReconstructionState;
  /** Maschinenlesbarer Grund (`prior-source-missing`, `recast`, `chain-last-amendment` …). */
  reason: string;
  detail: string;
  /** Genau eine Gruppe (`groups.ts`). */
  group: ReconstructionGroup;
  /** Alle Gründe (maßgeblicher zuerst), je Zustand und Grund einmal. */
  reasons: Array<{ state: string; reason: string; detail: string }>;
  /** Weitere nicht bestandene Prüfungen neben dem maßgeblichen Grund (erster Befund, Anzahl). */
  alsoFailed: Array<{ state: ReconstructionState; reason: string; detail: string; count: number }>;
  /** Stark zugeordnete Ereignisse des Registers nach dem Stichtag. */
  steps: number;
  /** Zahl der zurückzunehmenden Änderungen (Kette, sonst Register). */
  amendments: number;
  /** Zurückzunehmende Änderungen laut Kette, jüngste zuerst (soweit erreicht). */
  chain?: string[];
  priority: number;
  events: Array<{ id: string; eventType: string; eventDate: string; citation: string }>;
  formulas?: FormulaId[];
  effectiveDate?: string;
  priorAmendment?: string;
  /** Befehle, Orte und Rundlauf bestanden; ausgeschlossen nur, weil der Beginn der Stichtagsfassung nicht belegt ist. */
  roundTripVerified?: boolean;
  checks?: Partial<Record<CheckName, boolean>>;
  /** Fehlende Quellen, die ein gezielter Abruf beschaffen könnte. */
  needs?: string[];
  /**
   * Lauf 7, nur offene Normen: Stammverkündung für Alttext – `available`, `available-chain-incomplete` (Kette bis zur Stammfassung
   * nicht lückenlos) oder der Grund, warum sie fehlt (`base-pdf-only`, `base-paper-only`, `base-none`, …), mit Beleg.
   */
  restorationBase?: { state: string; detail?: string; pdfLayer?: PdfBaseState };
  recipe?: { path: string; schema: string; amendments: number; steps: number; currentFingerprint: string; baselineFingerprint: string };
}

export interface QueueTotals {
  changedAfterBaseline: number;
  recipeReady: number;
  recipeReadySingle: number;
  recipeReadyMulti: number;
  byGroup: Record<string, number>;
  byState: Record<string, number>;
  byReason: Record<string, number>;
  /** Je Gruppe die maßgeblichen Gründe. */
  byGroupReason: Record<string, Record<string, number>>;
  checks: Record<string, { passed: number; failed: number; notReached: number }>;
  roundTripVerifiedWithoutStart: number;
  formulas: Record<string, { clauses: number; norms: number; supported: boolean; invertible: boolean }>;
  /** Lauf 7: offene Normen je Verfügbarkeit der Stammverkündung. */
  byRestorationBase?: Record<string, number>;
  /** Lauf 9: Befund zum PDF-Textlayer der Normen, deren Stammverkündung nur als PDF-Ausgabe vorliegt. */
  byPdfLayer?: Record<string, number>;
}

export interface ReconstructionQueue {
  schemaVersion: typeof QUEUE_SCHEMA;
  baselineDate: string;
  evaluationDate: string;
  /** Stand vor der mehrstufigen Rückrechnung (aus der Schlange v1 übernommen und fortgeführt). */
  before: { recipeReady: number; reconstructionRequired: number; byState: Record<string, number>; source: string };
  totals: QueueTotals;
  entries: QueueEntry[];
}

export interface ReconstructionRun {
  queue: ReconstructionQueue;
  recipes: AnyReconstructionRecipe[];
  baseline: BaselineFile;
  audit: ReconstructionAudit;
  sources: SourceRegister;
  undetermined: UndeterminedResult[];
  /** Stand des gezielten Abrufs laut Prüfpunkt (nur Bericht). */
  fetch?: { networkRequests: number; fetched: number; notFound: number; errors: number };
}

async function readFetchSummary(root: string): Promise<ReconstructionRun['fetch']> {
  try {
    const checkpoint = JSON.parse(await readFile(join(root, FETCH_CHECKPOINT_PATH), 'utf8')) as FetchCheckpoint;
    return {
      networkRequests: checkpoint.networkRequests,
      fetched: checkpoint.attempts.filter((attempt) => attempt.status === 'fetched').length,
      notFound: checkpoint.attempts.filter((attempt) => attempt.status === 'not-found').length,
      errors: checkpoint.attempts.filter((attempt) => attempt.status === 'error').length,
    };
  } catch {
    return undefined;
  }
}

interface Failure {
  state: ReconstructionState;
  reason: string;
  detail: string;
  /** Die Norm bleibt ausgeschlossen, aber Befehle und Rundlauf werden noch geprüft (nur der Beginn fehlt). */
  soft?: boolean;
}

/** Rangfolge der Zustände, wenn mehrere Prüfungen scheitern: der schwerste Grund zählt. */
const PRECEDENCE: readonly ReconstructionState[] = [
  'contradictory',
  'missing-base',
  'command-unreadable',
  'asset-missing',
  'non-invertible-amendment',
  'partial-chain',
  'effective-date-undetermined',
  'unsupported-formula',
  'ambiguous-target',
  'round-trip-failed',
];

const byPrecedence = (left: Failure, right: Failure): number => PRECEDENCE.indexOf(left.state) - PRECEDENCE.indexOf(right.state);

/* ------------------------------------------------------- Inkrafttreten der vorangehenden Änderung */

export interface PriorInForce {
  ok: boolean;
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
 * Beleg für das Inkrafttreten einer vorangehenden Änderung aus ihrer eigenen Verkündung (Einzelprüfung; der Lauf
 * selbst verwendet die Kette in `walk.ts`, die dieselben Regeln anwendet). Belegt ist nur ein ausdrückliches
 * Kalenderdatum am oder vor dem Stichtag, für den ändernden Abschnitt, auf einer Seite mit dem Ausfertigungsdatum.
 */
export async function priorAmendmentInForce(ctx: Pick<RunContext, 'root' | 'units'>, priorClause: string, baselineDate: string): Promise<PriorInForce> {
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
    const before = priorClause.slice(Math.max(0, priorClause.indexOf(amendment.text) - 120), priorClause.indexOf(amendment.text));
    const heading = /(§|Art\.|Artikel)\s*(\d+[a-z]?)(?:(?!§|Art\.|Artikel)[\s\S])*$/u.exec(before);
    const section = heading ? `${heading[1] === 'Artikel' ? 'Art.' : heading[1]} ${heading[2]}` : undefined;
    const commencement = commencementFor(units, amendment.date ?? baselineDate, section, section !== undefined);
    if (!commencement.ok) return { ok: false, evidence, sources, reason: `Inkrafttreten von „${amendment.text}“ nicht lesbar: ${commencement.reason}` };
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

/* ----------------------------------------------------------------------- Einzelne Norm */

/** Prüfungen in ihrer Reihenfolge – für die Übersicht, an welcher Stelle die Normen scheitern. */
export const CHECKS = ['sources', 'chain', 'effectiveDate', 'block', 'formulas', 'roundTrip', 'baselineStart'] as const;
export type CheckName = (typeof CHECKS)[number];

interface NormOutcome {
  checks: Partial<Record<CheckName, boolean>>;
  failures: Failure[];
  formulas: FormulaId[];
  survey: CommandSurvey;
  amendments: number;
  chain?: string[];
  needs: string[];
  effectiveDate?: string;
  priorAmendment?: string;
  roundTripVerified?: boolean;
  stammfassungAfterBaseline?: string;
  recipe?: AnyReconstructionRecipe;
  walk?: WalkResult;
  /** Warum keine Stammverkündung für die Wiederherstellung bereitstand (nur Hinweis). */
  restoreNote?: string;
  /** Lauf 7: Stammverkündung verfügbar (`available`), Kette bis zu ihr unvollständig, oder der Grund, warum nicht (`base-…`). */
  restorationBase?: string;
  /** Lauf 9: warum der Stand am Stichtag nicht vorwärts gewonnen wurde. */
  forwardNote?: string;
  /** Lauf 9: Befund zum Textlayer einer Stammverkündung, die nur als PDF-Ausgabe vorliegt (`pdfbase.ts`). */
  pdfLayer?: PdfBaseState;
}

const stepLabel = (step: Pick<WalkStep, 'citation' | 'section'>): string => `${step.citation}${step.section ? ` (${step.section})` : ''}`;

/** Befehle einer Verkündung für die Norm in die Befundklassen einordnen (unabhängig vom Ausgang). */
function surveyBlock(survey: CommandSurvey, block: CommandBlock): void {
  const { leaves } = commandLeaves(block);
  for (const leaf of leaves) {
    const topLevel = leaf.node.depth === 0 && block.introPrefix.trim() === '' && /(?:wie\s+folgt\s+(?:neu\s+)?gefasst|erhält\s+folgende\s+(?:neue\s+)?Fassung)\s*:?\s*$/u.test(leaf.node.text);
    const formulas = leaf.structural ? [leaf.structural.formula as FormulaId] : (commandFormulas(leaf.node.text, leaf.context) ?? ['unrecognized' as FormulaId]);
    surveyCommand(survey, leaf.command, formulas, topLevel);
  }
}

function commandFormulas(text: string, context: Parameters<typeof parseCommand>[1]): FormulaId[] | undefined {
  return parseCommand(text, context).formulas;
}

async function reconstructNorm(ctx: RunContext, documentId: string): Promise<NormOutcome> {
  const failures: Failure[] = [];
  const checks: Partial<Record<CheckName, boolean>> = {};
  const outcome: NormOutcome = { checks, failures, formulas: [], survey: emptySurvey(), amendments: 0, needs: [] };
  const fail = (state: ReconstructionState, reason: string, detail: string, soft = false): NormOutcome => {
    failures.push({ state, reason, detail, ...(soft ? { soft } : {}) });
    return outcome;
  };
  const ledgerEvents = ctx.eventsByDocument.get(documentId) ?? [];
  outcome.amendments = new Set(ledgerEvents.map((event) => event.sourceUrl)).size;

  const packageSource = await readCached(ctx.root, packageUrl(documentId));
  if (!packageSource) return fail('missing-base', 'current-package-not-cached', 'Heutiges Exportpaket nicht im Cache');
  let norm: CurrentNorm;
  try {
    norm = parseCurrentNorm(documentId, packageSource, ctx.evaluationDate);
  } catch (error) {
    return fail('missing-base', 'current-package-unreadable', `Heutiges Paket nicht lesbar: ${(error as Error).message}`);
  }

  // Befund der Befehle aller Register-Ereignisse (für Gruppe und Gründe, auch wenn die Kette früher scheitert).
  for (const event of ledgerEvents) {
    if (NON_INVERTIBLE_EVENT_TYPES.includes(event.eventType)) outcome.survey.fullRecast.push(`${event.eventType} ${event.citation}`);
    const units = await pageUnits(ctx, event.sourceUrl);
    if (!units) continue;
    for (const block of commandBlocks(units, norm.identity).blocks) surveyBlock(outcome.survey, block);
  }

  // Stammfassung, die erst nach dem Stichtag gilt: am Stichtag galt sie nicht (Vorgänger oder nichts). Belegt nur,
  // wenn ihre eigene Inkrafttretensvorschrift genau das `inkraft` des Pakets nennt; sonst widersprechen sich die Belege.
  if (!lastAmendmentClause(norm.fullCitation) && ledgerEvents.length === 0 && norm.inForceFrom && norm.inForceFrom > ctx.baselineDate && norm.identity.documentDate && norm.identity.documentDate <= ctx.baselineDate) {
    const own = ownCommencement(norm.body, ctx.baselineDate);
    if (!own.ok && own.date === norm.inForceFrom) {
      outcome.stammfassungAfterBaseline = `Das Vollzitat nennt keine Änderung; die Stammfassung vom ${norm.identity.documentDate} tritt nach ihrer eigenen Inkrafttretensvorschrift erst am ${norm.inForceFrom} in Kraft (${own.evidence[0]?.slice(0, 160) ?? ''}) – am Stichtag galt ein Vorgänger oder keine Norm`;
    } else {
      return fail('contradictory', 'portal-in-force-unexplained', `Das Vollzitat nennt keine Änderung und das Register kein Ereignis, der Text gilt laut Paket aber erst seit ${norm.inForceFrom}; die eigene Inkrafttretensvorschrift ${own.ok ? `nennt ${own.date}` : `belegt das nicht (${own.reason ?? ''})`} – welche Änderung den Text trägt, ist nicht belegt`);
    }
  }

  // Lauf 7: Stammverkündung (digital, amtlich) für Alttext, den die Befehle nicht tragen. Liegt sie vor, geht die Kette
  // auch über den Stichtag hinaus bis zur Stammfassung (`deep`, für die Probe der Wiederherstellung).
  const loadedBase = await loadPublicationBase((ctx.platform ??= cachePlatform(ctx.root)), norm);
  if (!loadedBase.ok) outcome.restoreNote = `Stammverkündung nicht verfügbar (${loadedBase.code}): ${loadedBase.detail}`;
  outcome.restorationBase = loadedBase.ok ? 'available' : loadedBase.code;
  // Lauf 9: nur als PDF-Ausgabe – Befund zum Textlayer (Quelle wird er nie ohne eindeutige Wortgrenzen und Gestalt).
  if (!loadedBase.ok && loadedBase.code === 'base-pdf-only') {
    const assessment = await assessPdfBase(ctx.root, norm);
    if (assessment) {
      outcome.pdfLayer = assessment.state;
      outcome.restoreNote += ` · PDF-Textlayer (${assessment.state}): ${assessment.detail}`;
    }
  }

  // 2 – Kette.
  const walk = await walkChain({ ...walkInputFor(ctx, documentId, norm), deep: loadedBase.ok, provisional: loadedBase.ok });
  outcome.walk = walk;
  outcome.needs = [...new Set(walk.needs)].sort();
  outcome.chain = walk.steps.map(stepLabel);
  outcome.amendments = Math.max(outcome.amendments, walk.steps.length);
  for (const step of walk.steps) if (step.block) surveyBlock(outcome.survey, step.block);
  const sourceFailure = walk.failures.find((failure) => failure.state === 'missing-base');
  checks.sources = !sourceFailure;
  if (walk.failures.length > 0) {
    const failure = walk.failures[0]!;
    if (failure.reason === 'commencement-unreadable') checks.effectiveDate = false;
    else checks.chain = false;
    // Wie weit die Rücknahme ohne die Kette gekommen wäre, bleibt ungeprüft; der Befund ist der der Kette.
    return fail(failure.state, failure.reason, failure.detail);
  }
  checks.chain = true;
  checks.effectiveDate = true;
  outcome.effectiveDate = [...walk.steps[0]!.effectiveDates].sort().at(-1)!;
  if (walk.steps.at(-1)!.priorClause) outcome.priorAmendment = walk.steps.at(-1)!.priorClause!;

  // Lauf 7: Die Stammverkündung trägt den Alttext für Befehle, die die Rücknahme allein nicht umkehren kann (Neufassung,
  // Aufhebung, Streichung ohne Anker) – wenn die Stammfassung die Fassung am Stichtag ist oder die Kette bis zu ihr
  // zurückreicht (dann wird die Wiederherstellung durch Rücknahme auch aller Änderungen vor dem Stichtag geprüft).
  let restoreBase: PublicationBase | undefined;
  const oldestStep = walk.steps.at(-1)!;
  const stammfassungAtBaseline = walk.witnesses.length === 0 && !oldestStep.priorClause;
  // Lauf 9: Reicht die Kette bis zur Stammfassung, wird der Stand am Stichtag **vorwärts** gewonnen (Stammverkündung und
  // Änderungen vor dem Stichtag, `forward.ts`) – Quelle des Alttexts und Maßstab der Probe. Gelingt das nicht, gilt Lauf 7
  // (Stammverkündung als Quelle, Probe durch Rücknahme bis zur Stammfassung).
  const priorAmendments = (walk.prior ?? []).map((step): PriorAmendment => ({
    label: stepLabel(step),
    ...(step.block ? { block: step.block } : {}),
    url: step.page.url,
    sha256: step.page.sha256,
    ...(step.page.retrievedAt ? { retrievedAt: step.page.retrievedAt } : {}),
    ...(step.eventDate ? { publishedAt: step.eventDate } : {}),
    authority: SOURCE_AUTHORITY[step.ref.organ].publicationAuthority,
    representation: SOURCE_AUTHORITY[step.ref.organ].digitalRepresentation,
    ...(step.section ? { section: step.section } : {}),
  }));
  let forward: { used: UsedPriorAmendment[]; commands: number } | undefined;
  const eligible = loadedBase.ok && !oldestStep.block?.citation.versionForm && !oldestStep.block?.citation.consolidatedForm;
  if (loadedBase.ok && eligible && !stammfassungAtBaseline && walk.prior) {
    const state = forwardPublicationBase(loadedBase.base, priorAmendments);
    if (state.ok) {
      forward = { used: state.used, commands: state.commands };
      restoreBase = { ...state.base, portal: norm.body, ...(ctx.conventions ? { conventions: ctx.conventions } : {}) };
    } else outcome.forwardNote = state.detail;
  }
  if (!restoreBase && loadedBase.ok && eligible && (stammfassungAtBaseline || walk.prior)) restoreBase = { ...loadedBase.base, portal: norm.body, ...(ctx.conventions ? { conventions: ctx.conventions } : {}) };
  else if (!restoreBase && loadedBase.ok && walk.priorFailure) {
    outcome.restoreNote = `Kette bis zur Stammfassung: ${walk.priorFailure.detail}`;
    outcome.restorationBase = 'available-chain-incomplete';
  }

  // Lauf 8: Befunde über Veröffentlichungen nach dem Stichtag außerhalb der Kette gelten nur mit Wortlautprobe gegen die
  // Stammverkündung; ohne sie bleibt es beim Befund.
  const provisional = walk.provisional ?? [];
  if (provisional.length > 0 && !restoreBase) {
    checks.chain = false;
    const first = provisional[0]!;
    return fail(first.state, first.reason, `${first.detail} – ausräumbar nur durch die Wortlautprobe gegen die Stammverkündung, die hier nicht möglich ist (${outcome.restoreNote ?? 'die Stammfassung ist nicht die Fassung am Stichtag und die Kette reicht nicht bis zu ihr'})`);
  }

  // 3 – Rücknahme, jüngste Änderung zuerst.
  let body: NormBodyBlock[] = structuredClone(norm.body);
  // Überschrift der Norm (Titelzeile und Abkürzungszeile), falls ein Befehl sie ändert.
  const currentTitle = titleState(norm.document.law);
  let title: RecipeTitle = currentTitle;
  const reversed: Array<{ step: WalkStep; steps: ReturnType<typeof reverseAmendment>['steps']; before: NormBodyBlock[]; after: NormBodyBlock[] }> = [];
  const multi = walk.steps.length > 1;
  for (const [index, step] of walk.steps.entries()) {
    const reversal = reverseAmendment(body, step.block!, multi ? `a${index + 1}-` : '', title, restoreBase ? { base: restoreBase, fallback: true } : undefined);
    outcome.formulas.push(...reversal.formulas);
    if (reversal.failures.length > 0) {
      const structural = reversal.failures.some((failure) => failure.state === 'command-unreadable');
      checks.block = !structural;
      checks.formulas = !reversal.failures.some((failure) => ['unsupported-formula', 'non-invertible-amendment', 'asset-missing'].includes(failure.state));
      if (checks.formulas) checks.roundTrip = false;
      for (const failure of reversal.failures) failures.push({ ...failure, detail: `${stepLabel(step)}: ${failure.detail}` });
      return outcome;
    }
    reversed.push({ step, steps: reversal.steps, before: reversal.before!, after: body });
    body = reversal.before!;
    if (reversal.titleBefore) title = reversal.titleBefore;
  }
  const titleChange = reversed.some((entry) => entry.steps.some((recipeStep) => recipeStep.target === 'title')) ? { current: currentTitle, baseline: title } : undefined;
  checks.block = true;
  checks.formulas = true;
  checks.roundTrip = true;
  const baselineBody = body;

  // Wiederhergestellter Alttext: Der Stand der Verkündungen muss den zurückgerechneten Körper im ganzen Wortlaut tragen –
  // bei der Stammfassung am Stichtag direkt; sonst nach Rücknahme auch aller Änderungen vor dem Stichtag bis zur
  // Stammfassung (wiederum mit Alttext aus der Stammverkündung, wo nötig).
  const restoredSteps = reversed.flatMap((entry) => entry.steps).filter((recipeStep) => recipeStep.restoredFrom !== undefined).length;
  let restoration: RecipeRestoration | undefined;
  if ((restoredSteps > 0 || provisional.length > 0) && restoreBase) {
    const prior: PriorAmendment[] = stammfassungAtBaseline ? [] : priorAmendments;
    // Vorwärts: der ganze Stichtagskörper gleicht im Wortlaut dem vorwärts gewonnenen Stand; sonst Lauf 7.
    const proof: ReturnType<typeof proveRestoration> = forward
      ? (() => {
        const agreement = wordingAgreement(baselineBody, restoreBase!);
        return agreement.ok
          ? { ok: true as const, agreement, prior: forward.used, stammfassungFingerprint: '' }
          : { ok: false as const, reason: 'restoration-disagrees', detail: `gegen den Stand am Stichtag (Stammverkündung und ${forward.used.length} Änderung(en) vorwärts): ${agreement.detail}` };
      })()
      : proveRestoration(baselineBody, title, prior, restoreBase);
    if (!proof.ok && restoredSteps === 0) {
      // Nur die vorläufigen Befunde waren zu prüfen: Sie bleiben der Grund, die Probe ist der Beleg, warum.
      checks.chain = false;
      const first = provisional[0]!;
      return fail(first.state, first.reason, `${first.detail}; die Wortlautprobe gegen die Stammverkündung räumt das nicht aus: ${proof.detail}`);
    }
    if (!proof.ok) {
      checks.roundTrip = false;
      return fail('non-invertible-amendment', proof.reason, `Alttext aus der Stammverkündung: ${proof.detail}`);
    }
    restoration = {
      method: 'forward-from-publication',
      sources: [
        ...restoreBase.sources.map((source) => ({ ...source })),
        ...proof.prior.map((entry) => ({
          role: 'prior-amendment' as const,
          citation: entry.citation,
          url: entry.url,
          sha256: entry.sha256,
          ...(entry.retrievedAt ? { retrievedAt: entry.retrievedAt } : {}),
          ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
          authority: entry.authority,
          representation: entry.representation,
          ...(entry.section ? { section: entry.section } : {}),
          introIndex: entry.introIndex,
        })),
      ],
      converter: restoreBase.converter,
      pageTextSha256: restoreBase.pageTextSha256,
      publicationFingerprint: bodyFingerprint(loadedBase.ok ? loadedBase.base.body : restoreBase.body),
      ...(forward
        ? { derivation: 'forward' as const, forwardFingerprint: bodyFingerprint(restoreBase.body), priorSteps: forward.commands }
        : proof.prior.length > 0 ? { stammfassungFingerprint: proof.stammfassungFingerprint, priorSteps: proof.prior.reduce((sum, entry) => sum + entry.steps, 0) } : {}),
      agreement: { normalization: TYPOGRAPHY_NORMALIZATION, characters: proof.agreement.characters, detail: proof.agreement.detail },
      restoredSteps,
      ...(provisional.length > 0 ? { chainChecks: provisional.map((entry) => ({ reason: entry.reason, detail: entry.detail })) } : {}),
    };
  }

  // 4 – Beginn der Stichtagsfassung.
  let start: ReconstructionRecipe['baselineTextInForce'] | undefined;
  if (walk.witnesses.length > 0) {
    const date = walk.witnesses.flatMap((witness) => witness.effectiveDates).sort().at(-1)!;
    start = {
      date,
      evidence: [
        'Stand nach der vorangehenden Änderung; ihr Inkrafttreten ist durch ihre eigene Verkündung belegt',
        ...walk.witnesses.map((witness) => `Vorangehende Änderung ${witness.namedAs}${witness.section && !witness.namedAs.startsWith(witness.section) ? ` (${witness.section})` : ''}: ${witness.effectiveDateEvidence.map((statement) => `„${statement}“`).join(' ')} – ${witness.page.url}, SHA-256 ${witness.page.sha256.slice(0, 16)}…`),
      ],
      sources: walk.witnesses.map((witness) => ({ url: witness.page.url, sha256: witness.page.sha256, citation: witness.namedAs, ...(witness.page.retrievedAt ? { retrievedAt: witness.page.retrievedAt } : {}) })),
    };
  } else {
    const oldest = walk.steps.at(-1)!;
    if (oldest.block?.citation.versionForm || oldest.block?.citation.consolidatedForm) {
      checks.baselineStart = false;
      outcome.roundTripVerified = true;
      return fail('partial-chain', 'baseline-text-in-force-unproven', `Der Befehl zitiert die Norm ${oldest.block.citation.versionForm ? '„in der Fassung der Bekanntmachung“' : 'in der bereinigten Fassung der BayRS'}; die Inkrafttretensvorschrift des Stammgesetzes belegt nicht den Beginn dieser Fassung`, true);
    }
    const stamm = loadedBase.ok && loadedBase.base.publishedAt ? { publishedAt: loadedBase.base.publishedAt, url: loadedBase.base.sources[0]!.url } : undefined;
    const own = ownCommencement(baselineBody, ctx.baselineDate, stamm);
    if (!own.ok) {
      checks.baselineStart = false;
      outcome.roundTripVerified = true;
      if (own.reason && /nach dem Stichtag/u.test(own.reason)) outcome.stammfassungAfterBaseline = `Rückgerechnete Stammfassung: ${own.reason}`;
      return fail('partial-chain', 'baseline-text-in-force-unproven', `Beginn der Stichtagsfassung (Stammfassung) nicht belegt: ${own.reason ?? ''}`, true);
    }
    const relativeUsed = stamm !== undefined && own.evidence.some((line) => line.startsWith('Verkündungsdatum ') && line.includes('laut Stammverkündung selbst'));
    const stammSource = loadedBase.ok ? loadedBase.base.sources[0]! : undefined;
    start = {
      date: own.date!,
      ...(relativeUsed && stammSource ? { sources: [{ url: stammSource.url, sha256: stammSource.sha256, citation: stammSource.citation, ...(stammSource.retrievedAt ? { retrievedAt: stammSource.retrievedAt } : {}) }] } : {}),
      evidence: [
        'Stammfassung: Der Einleitungssatz der ältesten zurückgenommenen Änderung nennt keine vorangehende, Änderungsverlauf und Fortführungsnachweis führen vor dem Stichtag keine',
        ...own.evidence,
        ...(restoration ? [`Alttext nicht umkehrbarer Befehle aus der Stammverkündung ${restoration.sources[0]!.citation} (${restoration.sources[0]!.url}, SHA-256 ${restoration.sources[0]!.sha256.slice(0, 16)}…); ${restoration.agreement.detail}`] : []),
      ],
    };
  }
  checks.baselineStart = true;

  // 5 – Rezept, Forward-Replay, Serialisierung.
  const recipe = buildRecipe(ctx, documentId, norm, packageSource, walk, reversed, start, baselineBody, titleChange, restoration);
  if ('problem' in recipe) return fail('contradictory', 'recipe-invalid', recipe.problem);
  const law = norm.document.law;
  // Die Quellen der Wiederherstellung hat dieser Lauf eben aus dem Cache gelesen (SHA-256 im Rezept).
  const roundTrip = verifyRoundTripLaw(law, recipe.recipe, { restorationChecked: true });
  if (!roundTrip.ok) {
    checks.roundTrip = false;
    return fail('round-trip-failed', 'round-trip', roundTrip.detail);
  }
  const reread = JSON.parse(JSON.stringify(recipe.recipe)) as AnyReconstructionRecipe;
  const again = verifyRoundTripLaw(law, reread, { restorationChecked: true });
  if (!again.ok) return fail('round-trip-failed', 'round-trip-serialized', again.detail);
  outcome.recipe = recipe.recipe;
  return outcome;
}

function amendmentRecord(step: WalkStep, eventDate: string): RecipeAmendment {
  const event: LedgerRecord | undefined = step.ledgerEvent as LedgerRecord | undefined;
  const authority = SOURCE_AUTHORITY[step.ref.organ];
  const block = step.block!;
  return {
    eventId: event?.id ?? `publication:${step.ref.organ}-${step.ref.volume}-${step.ref.position}`,
    citation: event?.citation ?? publicationCitation(step.ref),
    organ: event?.organ ?? step.ref.organ,
    publicationAuthority: event?.publicationAuthority ?? authority.publicationAuthority,
    digitalRepresentation: event?.digitalRepresentation ?? authority.digitalRepresentation,
    url: step.page.url,
    sha256: step.page.sha256,
    ...(step.page.retrievedAt ? { retrievedAt: step.page.retrievedAt } : {}),
    ...((event?.gazettePdfUrl ?? step.page.gazettePdfUrl) ? { gazettePdfUrl: (event?.gazettePdfUrl ?? step.page.gazettePdfUrl)! } : {}),
    ...((event?.gazettePdfSha256Published ?? step.page.gazettePdfSha256Published) ? { gazettePdfSha256Published: (event?.gazettePdfSha256Published ?? step.page.gazettePdfSha256Published)! } : {}),
    eventDate,
    ...((event?.enactmentDate ?? step.enactmentDate) ? { enactmentDate: (event?.enactmentDate ?? step.enactmentDate)! } : {}),
    effectiveDate: [...step.effectiveDates].sort().at(-1)!,
    effectiveDateEvidence: step.effectiveDateEvidence,
    ...(block.section ? { section: block.section } : {}),
    intro: block.intro.text,
    ...(block.priorAmendmentClause ? { priorAmendment: block.priorAmendmentClause } : {}),
  };
}

function buildRecipe(
  ctx: RunContext,
  documentId: string,
  norm: CurrentNorm,
  packageSource: { url: string; sha256: string; retrievedAt?: string },
  walk: WalkResult,
  reversed: Array<{ step: WalkStep; steps: ReturnType<typeof reverseAmendment>['steps']; before: NormBodyBlock[]; after: NormBodyBlock[] }>,
  start: ReconstructionRecipe['baselineTextInForce'],
  baselineBody: NormBodyBlock[],
  titleChange?: RecipeTitleChange,
  restoration?: RecipeRestoration,
): { recipe: AnyReconstructionRecipe } | { problem: string } {
  for (const entry of reversed) if (!entry.step.eventDate) return { problem: `${stepLabel(entry.step)}: Verkündungsdatum nicht belegt` };
  const source = {
    url: packageSource.url,
    sha256: packageSource.sha256,
    ...(packageSource.retrievedAt ? { retrievedAt: packageSource.retrievedAt } : {}),
    parserVersion: PARSER_VERSION,
    inForceFrom: norm.inForceFrom!,
    ...(norm.fullCitation ? { fullCitation: norm.fullCitation } : {}),
  };
  const expected = { currentFingerprint: bodyFingerprint(norm.body), baselineFingerprint: bodyFingerprint(baselineBody) };
  let recipe: AnyReconstructionRecipe;
  if (reversed.length === 1) {
    const only = reversed[0]!;
    recipe = {
      schemaVersion: RECIPE_SCHEMA,
      documentId,
      baselineDate: ctx.baselineDate,
      method: 'reverse-amendment',
      source,
      amendment: amendmentRecord(only.step, only.step.eventDate!),
      baselineTextInForce: start,
      chain: [...walk.evidence, ...walk.notes.map((note) => `Hinweis: ${note}`)],
      steps: only.steps,
      ...(titleChange ? { title: titleChange } : {}),
      ...(restoration ? { restoration } : {}),
      whitespace: WHITESPACE_NORMALIZATION,
      expected,
    };
  } else {
    const amendments: RecipeAmendmentV2[] = reversed.map((entry) => ({
      ...amendmentRecord(entry.step, entry.step.eventDate!),
      effectiveDates: [...entry.step.effectiveDates].sort(),
      steps: entry.steps,
      expected: { beforeFingerprint: bodyFingerprint(entry.before), afterFingerprint: bodyFingerprint(entry.after) },
    }));
    const sources: RecipeSource[] = [
      ...amendments.map((amendment) => ({ role: 'reversed-amendment' as const, citation: amendment.citation, url: amendment.url, sha256: amendment.sha256, ...(amendment.retrievedAt ? { retrievedAt: amendment.retrievedAt } : {}) })),
      ...(start.sources ?? []).map((entry) => ({ role: 'baseline-start' as const, citation: entry.citation, url: entry.url, sha256: entry.sha256, ...(entry.retrievedAt ? { retrievedAt: entry.retrievedAt } : {}) })),
    ];
    recipe = {
      schemaVersion: RECIPE_SCHEMA_V2,
      documentId,
      baselineDate: ctx.baselineDate,
      method: 'reverse-amendment',
      source,
      amendments,
      baselineTextInForce: start,
      chain: [...walk.evidence, ...walk.notes.map((note) => `Hinweis: ${note}`)],
      sources,
      ...(titleChange ? { title: titleChange } : {}),
      ...(restoration ? { restoration } : {}),
      whitespace: WHITESPACE_NORMALIZATION,
      expected,
    };
  }
  const problems = recipeProblems(recipe);
  if (problems.length > 0) return { problem: problems.join('; ') };
  return { recipe };
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
            value: `reverse-amendment ${(entry.chain ?? [entry.events[0]?.citation ?? '–']).join(' ← ')}, in Kraft ${entry.effectiveDate}; Rezept ${entry.recipe.path} (${entry.recipe.schema}, ${entry.recipe.amendments} Änderung(en), ${entry.recipe.steps} Schritt(e), Stichtagskörper ${entry.recipe.baselineFingerprint.slice(0, 16)})`,
            source: RECONSTRUCTION_EVIDENCE_SOURCE,
          },
        ],
        blockers: [],
      };
    }
    return { ...decision, blockers: [...decision.blockers, `${RECONSTRUCTION_BLOCKER}${entry.state} (${entry.reason}) – ${entry.detail}`] };
  });
  return recountBaseline({ ...baseline, decisions });
}

export function recountBaseline(baseline: BaselineFile): BaselineFile {
  const byStatus: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const decision of baseline.decisions) {
    byStatus[decision.status] = (byStatus[decision.status] ?? 0) + 1;
    byMethod[decision.method] = (byMethod[decision.method] ?? 0) + 1;
  }
  return { ...baseline, totals: { ...baseline.totals, byStatus, byMethod } };
}

/* ---------------------------------------------------------------------------- Lauf */

export interface ReconstructionOptions {
  baselineDate?: string;
  evaluationDate?: string;
  /** Nur diese Normen (Probelauf); die Schlange enthält dann nur sie. */
  only?: readonly string[];
}

/** Stand vor der mehrstufigen Rückrechnung: aus der Schlange v1 gelesen, danach fortgeführt. */
async function readBefore(root: string): Promise<ReconstructionQueue['before']> {
  try {
    const previous = JSON.parse(await readFile(join(root, RECONSTRUCTION_QUEUE_PATH), 'utf8')) as { schemaVersion?: string; before?: ReconstructionQueue['before']; totals?: { recipeReady?: number; changedAfterBaseline?: number; byState?: Record<string, number> } };
    if (previous.schemaVersion === QUEUE_SCHEMA && previous.before) return previous.before;
    if (previous.totals?.recipeReady !== undefined) {
      return {
        recipeReady: previous.totals.recipeReady,
        reconstructionRequired: (previous.totals.changedAfterBaseline ?? 0) - previous.totals.recipeReady,
        byState: previous.totals.byState ?? {},
        source: `Schlange ${previous.schemaVersion ?? '?'} vor der mehrstufigen Rückrechnung`,
      };
    }
  } catch {
    // keine frühere Schlange
  }
  return { recipeReady: 0, reconstructionRequired: 0, byState: {}, source: 'keine frühere Schlange' };
}

/**
 * Lauf 7: Darstellungskonventionen des Portals je Amtsblatt (`formConventions`) – über **alle** geänderten Normen mit
 * digitaler Stammverkündung, unabhängig von `--only`, damit jede Norm dieselbe Grundlage hat.
 */
export async function portalConventions(ctx: RunContext): Promise<FormConventions> {
  const samples: PublicationBase[] = [];
  for (const decision of ctx.baseline.decisions) {
    if (decision.class !== 'changed-after-baseline') continue;
    const source = await readCached(ctx.root, packageUrl(decision.documentId));
    if (!source) continue;
    let norm: CurrentNorm;
    try {
      norm = parseCurrentNorm(decision.documentId, source, ctx.evaluationDate);
    } catch {
      continue;
    }
    const loaded = await loadPublicationBase((ctx.platform ??= cachePlatform(ctx.root)), norm);
    if (loaded.ok) samples.push({ ...loaded.base, portal: norm.body });
  }
  return formConventions(samples);
}

export async function runReconstruction(root: string, options: ReconstructionOptions = {}): Promise<ReconstructionRun> {
  const ctx = await loadRunContext(root, options);
  ctx.conventions = await portalConventions(ctx);
  const before = await readBefore(root);
  const changed = ctx.baseline.decisions.filter((decision) => decision.class === 'changed-after-baseline').filter((decision) => !options.only || options.only.includes(decision.documentId));
  const entries: QueueEntry[] = [];
  const recipes: AnyReconstructionRecipe[] = [];
  const outcomes = new Map<string, NormOutcome>();
  const formulaStats = new Map<FormulaId, { clauses: number; norms: Set<string> }>();

  for (const decision of changed) {
    const events = ctx.eventsByDocument.get(decision.documentId) ?? [];
    const eventSummary = events.map((event) => ({ id: event.id, eventType: event.eventType, eventDate: event.eventDate!, citation: event.citation }));
    const outcome = await reconstructNorm(ctx, decision.documentId);
    outcomes.set(decision.documentId, outcome);
    const seenInNorm = new Set<FormulaId>();
    for (const formula of outcome.formulas) {
      const stat = formulaStats.get(formula) ?? { clauses: 0, norms: new Set<string>() };
      stat.clauses += 1;
      stat.norms.add(decision.documentId);
      formulaStats.set(formula, stat);
      seenInNorm.add(formula);
    }
    const formulas = [...seenInNorm].sort((left, right) => FORMULAS.indexOf(left) - FORMULAS.indexOf(right));
    const base = {
      documentId: decision.documentId,
      steps: events.length,
      amendments: outcome.amendments,
      events: eventSummary,
      ...(outcome.chain && outcome.chain.length > 0 ? { chain: outcome.chain } : {}),
      ...(formulas.length > 0 ? { formulas } : {}),
      ...(outcome.effectiveDate ? { effectiveDate: outcome.effectiveDate } : {}),
      ...(outcome.priorAmendment ? { priorAmendment: outcome.priorAmendment } : {}),
      ...(outcome.roundTripVerified ? { roundTripVerified: true } : {}),
      checks: outcome.checks,
      ...(outcome.needs.length > 0 ? { needs: outcome.needs } : {}),
    };
    if (outcome.recipe) {
      const recipe = outcome.recipe;
      const amendments = recipeAmendments(recipe);
      const path = `${RECONSTRUCTION_DIR}/${decision.documentId}.json`;
      recipes.push(recipe);
      const grouped = assignGroup({ state: 'recipe-ready', reason: 'reverse-amendment-verified', amendments: amendments.length, survey: outcome.survey, failures: [] });
      entries.push({
        ...base,
        state: 'recipe-ready',
        reason: 'reverse-amendment-verified',
        detail: `${amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0)} Schritt(e) aus ${amendments.map((amendment) => amendment.citation).join(' ← ')}, in Kraft ${amendments[0]!.effectiveDate}; Rundlauf exakt`,
        group: grouped.group,
        reasons: [],
        alsoFailed: [],
        priority: COMMAND_STATE_PRIORITY['recipe-ready'],
        recipe: {
          path,
          schema: recipe.schemaVersion,
          amendments: amendments.length,
          steps: amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0),
          currentFingerprint: recipe.expected.currentFingerprint,
          baselineFingerprint: recipe.expected.baselineFingerprint,
        },
      });
      continue;
    }
    const failures = [...outcome.failures].sort(byPrecedence);
    const primary = failures[0] ?? { state: 'missing-base' as ReconstructionState, reason: 'unknown', detail: 'kein Befund' };
    const grouped = assignGroup({
      state: primary.state,
      reason: primary.reason,
      amendments: outcome.amendments,
      survey: outcome.survey,
      failures: failures.map((failure): GroupReason => ({ state: failure.state, reason: failure.reason, detail: failure.detail })),
      ...(outcome.stammfassungAfterBaseline ? { stammfassungAfterBaseline: outcome.stammfassungAfterBaseline } : {}),
    });
    entries.push({
      ...base,
      state: primary.state,
      reason: primary.reason,
      detail: primary.detail,
      group: grouped.group,
      reasons: dedupeReasons(grouped.reasons),
      alsoFailed: groupFailures(failures.slice(1).filter((failure) => failure.state !== primary.state || failure.reason !== primary.reason)),
      priority: COMMAND_STATE_PRIORITY[primary.state] + Math.min(outcome.amendments, 9),
      ...(outcome.restorationBase ? { restorationBase: { state: outcome.restorationBase, ...(outcome.pdfLayer ? { pdfLayer: outcome.pdfLayer } : {}), ...(outcome.restoreNote || outcome.forwardNote ? { detail: [outcome.restoreNote, outcome.forwardNote].filter(Boolean).join(' · ') } : {}) } } : {}),
    });
  }

  const groupOrder = (group: ReconstructionGroup): number => GROUPS.indexOf(group);
  entries.sort((left, right) => (left.state === 'recipe-ready') !== (right.state === 'recipe-ready') ? (left.state === 'recipe-ready' ? -1 : 1) : groupOrder(left.group) !== groupOrder(right.group) ? groupOrder(left.group) - groupOrder(right.group) : left.priority !== right.priority ? left.priority - right.priority : left.documentId < right.documentId ? -1 : 1);

  const count = (list: readonly QueueEntry[], key: (entry: QueueEntry) => string): Record<string, number> => {
    const output: Record<string, number> = {};
    for (const entry of list) output[key(entry)] = (output[key(entry)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(output).sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1)));
  };
  const formulas: QueueTotals['formulas'] = {};
  for (const formula of FORMULAS) {
    const stat = formulaStats.get(formula);
    if (!stat) continue;
    formulas[formula] = { clauses: stat.clauses, norms: stat.norms.size, supported: SUPPORTED_FORMULAS.has(formula), invertible: !NON_INVERTIBLE_FORMULAS.has(formula) };
  }
  const byGroup: Record<string, number> = {};
  for (const group of GROUPS) byGroup[group] = entries.filter((entry) => entry.group === group).length;
  const byGroupReason: Record<string, Record<string, number>> = {};
  for (const group of GROUPS) byGroupReason[group] = count(entries.filter((entry) => entry.group === group && entry.state !== 'recipe-ready'), (entry) => `${entry.state}/${entry.reason}`);
  const ready = entries.filter((entry) => entry.state === 'recipe-ready');
  const queue: ReconstructionQueue = {
    schemaVersion: QUEUE_SCHEMA,
    baselineDate: ctx.baselineDate,
    evaluationDate: ctx.evaluationDate,
    before,
    totals: {
      changedAfterBaseline: entries.length,
      recipeReady: ready.length,
      recipeReadySingle: ready.filter((entry) => entry.recipe?.amendments === 1).length,
      recipeReadyMulti: ready.filter((entry) => (entry.recipe?.amendments ?? 0) > 1).length,
      byGroup,
      byState: count(entries, (entry) => entry.state),
      byReason: count(entries, (entry) => `${entry.state}/${entry.reason}`),
      byGroupReason,
      checks: Object.fromEntries(CHECKS.map((check) => [check, {
        passed: entries.filter((entry) => entry.checks?.[check] === true).length,
        failed: entries.filter((entry) => entry.checks?.[check] === false).length,
        notReached: entries.filter((entry) => entry.checks?.[check] === undefined).length,
      }])),
      roundTripVerifiedWithoutStart: entries.filter((entry) => entry.roundTripVerified).length,
      formulas,
      byRestorationBase: count(entries.filter((entry) => entry.state !== 'recipe-ready'), (entry) => entry.restorationBase?.state ?? 'not-reached'),
      byPdfLayer: count(entries.filter((entry) => entry.state !== 'recipe-ready' && entry.restorationBase?.state === 'base-pdf-only'), (entry) => entry.restorationBase?.pdfLayer ?? 'not-assessed'),
    },
    entries,
  };
  recipes.sort((left, right) => (left.documentId < right.documentId ? -1 : 1));
  const audit = await buildAudit(ctx.root, recipes, ctx.baselineDate, ctx.conventions);
  const sources = buildSourceRegister([...outcomes].map(([documentId, outcome]) => ({ documentId, walk: outcome.walk, recipe: outcome.recipe })));
  const undetermined = options.only ? [] : await recheckUndetermined(ctx);
  const baseline = options.only ? ctx.baseline : applyUndeterminedDecisions(applyDecisions(ctx.baseline, entries), undetermined);
  const fetch = await readFetchSummary(root);
  return { queue, recipes, baseline, audit, sources, undetermined, ...(fetch ? { fetch } : {}) };
}

function dedupeReasons(reasons: readonly GroupReason[]): QueueEntry['reasons'] {
  const seen = new Set<string>();
  const output: QueueEntry['reasons'] = [];
  for (const reason of reasons) {
    const key = `${reason.state}/${reason.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ state: reason.state, reason: reason.reason, detail: reason.detail });
  }
  return output;
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

/**
 * Schreibt Rezepte (und entfernt veraltete), Schlange, Quellenregister, Audit, Stichtagsentscheidungen und Bericht.
 * `baseline.json` wird **frisch gelesen**: Übernommen werden nur die Entscheidungen dieses Laufs (Klasse
 * `changed-after-baseline` und die neu geprüften unbestimmten Fälle); alles andere bleibt, wie es auf der Platte steht.
 */
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
  if (await writeJsonAtomic(join(root, RECONSTRUCTION_SOURCES_PATH), run.sources)) written.push(RECONSTRUCTION_SOURCES_PATH);
  if (await writeJsonAtomic(join(root, RECONSTRUCTION_AUDIT_PATH), run.audit)) written.push(RECONSTRUCTION_AUDIT_PATH);
  const fresh = JSON.parse(await readFile(join(root, BASELINE_PATH), 'utf8')) as BaselineFile;
  const mine = new Map(run.baseline.decisions.map((decision) => [decision.documentId, decision]));
  const touched = new Set([...run.queue.entries.map((entry) => entry.documentId), ...run.undetermined.filter((result) => result.decision).map((result) => result.documentId)]);
  const merged = recountBaseline({ ...fresh, decisions: fresh.decisions.map((decision) => (touched.has(decision.documentId) && mine.has(decision.documentId) && decision.class === mine.get(decision.documentId)!.class ? mine.get(decision.documentId)! : decision)) });
  if (await writeJsonAtomic(join(root, BASELINE_PATH), merged)) written.push(BASELINE_PATH);
  if (await writeFileAtomic(join(root, RECONSTRUCTION_REPORT_PATH), renderReconstructionReport(run))) written.push(RECONSTRUCTION_REPORT_PATH);
  return written;
}

import { renderReconstructionReport, reconstructionSummary } from './report.ts';
export { renderReconstructionReport, reconstructionSummary };
export type { GazetteUnit };
export { isRecipeV2 };
