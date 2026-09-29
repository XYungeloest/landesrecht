/**
 * Klassen der BayWü-Reviewfälle (Lauf 18, wie NSH `juris-sh/src/reports/review-classes.ts`): Jeder offene Fall gehört genau
 * einer Gruppe, die sagt, ob er ein technischer Blocker ist oder eine fachliche Entscheidung braucht, und welche
 * Begründungsklasse (`reasonCode`) eine bewusste Nichtveröffentlichung trüge. Rekonstruktionsfälle werden nach dem Zustand
 * der Rekonstruktionsqueue (`data/imports/bayernrecht/reconstruction-queue.json`) eingeordnet, nicht als eine Blockerklasse.
 * Entschieden wird nur durch Klassenentscheidungen des Nutzers (`data/imports/bayernrecht/review-class-decisions.json`,
 * `review --apply-class-decisions`); dieses Modul entscheidet nichts selbst.
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { decideReviewItem, REVIEW_REASON_CODES, type ReviewDecision, type ReviewItem, type ReviewQueue, type ReviewReasonCode } from '../common/review.ts';

export type CaseClass = 'technical-blocker' | 'human-decision' | 'non-blocking';

export interface ReviewCaseClass {
  class: CaseClass;
  /** Stabile Gruppe (für Klassenentscheidungen). */
  group: string;
  label: string;
  /** Begründungsklasse einer bewussten Nichtveröffentlichung. */
  reasonCode?: ReviewReasonCode;
}

/** Ausschnitt eines Queue-Eintrags, den die Klassifikation braucht. */
export interface QueueFacts {
  state: string;
  reason: string;
  group: string;
}

const ASSET_CODES: Record<string, ReviewReasonCode> = {
  'annex-replacement': 'missing-normative-annex',
  'table-replacement': 'unsafe-table-structure',
  'image-replacement': 'missing-normative-image',
};

/** Begründungsklasse eines nicht rekonstruierbaren Falls aus Zustand und Gruppe der Queue. */
export function reconstructionReasonCode(facts: QueueFacts): ReviewReasonCode {
  const asset = ASSET_CODES[facts.group];
  switch (facts.state) {
    case 'asset-missing':
      return asset ?? 'missing-normative-annex';
    case 'non-invertible-amendment':
      return asset ?? 'old-text-missing';
    case 'command-unreadable':
      return 'source-scan-unreadable';
    case 'unsupported-formula':
    case 'round-trip-failed':
      return 'command-not-invertible';
    case 'ambiguous-target':
      return 'structure-ambiguous';
    case 'missing-base':
      return 'missing-primary-source';
    case 'partial-chain':
      return facts.reason === 'chain-commencement-order' ? 'baseline-validity-unresolved' : 'missing-primary-source';
    default:
      // effective-date-undetermined, contradictory
      return 'baseline-validity-unresolved';
  }
}

const REASON_LABELS: Record<ReviewReasonCode, string> = {
  'old-text-missing': 'Alttext fehlt (Neufassung, Aufhebung, Streichung ohne alten Wortlaut)',
  'command-not-invertible': 'Änderungsbefehl nicht sicher umkehrbar',
  'source-scan-unreadable': 'Befehl bzw. Quelle nicht lesbar (Scan, Textlayer)',
  'missing-primary-source': 'Primärquelle fehlt (Vorgänger, Stammverkündung, Kette unvollständig)',
  'baseline-validity-unresolved': 'Stichtagsgeltung bzw. Fassungsfolge nicht belegt',
  'structure-ambiguous': 'Ziel der Änderung mehrdeutig',
  'missing-normative-annex': 'normative Anlage nicht rekonstruierbar',
  'unsafe-table-structure': 'normative Tabelle nicht rekonstruierbar',
  'missing-normative-image': 'normative Abbildung nicht rekonstruierbar',
  'text-unproven-after-baseline': 'heutiger Text nach dem Stichtag geändert (Paketdatum veraltet), Stichtagsfassung nicht rückrechenbar',
  'not-at-baseline': 'am Stichtag nicht geltend',
  'source-deficiency': 'Quellmangel',
  'baseline-seed-authoritative': 'Seed bleibt maßgeblich',
};

export const reasonLabel = (code: ReviewReasonCode): string => REASON_LABELS[code];

/** Klasse eines offenen Falls; `facts` aus der Rekonstruktionsqueue für Rekonstruktionsfälle. */
export function classifyReviewCase(item: Pick<ReviewItem, 'category' | 'key'>, facts?: QueueFacts): ReviewCaseClass {
  const as = (klass: CaseClass, group: string, label: string, reasonCode?: ReviewReasonCode): ReviewCaseClass => ({ class: klass, group, label, ...(reasonCode ? { reasonCode } : {}) });
  if (item.category === 'contradictory-evidence') return as('technical-blocker', 'contradictory-evidence', 'widersprüchliche Belege zu einer veröffentlichten Norm');
  if (item.category === 'import-regression') {
    if (item.key === 'baseline-locked' || item.key === 'import-regression') return as('technical-blocker', 'published-regression', 'veröffentlichte Norm weicht vom Wiederholungslauf ab (Seed-Konflikt oder Regression)');
    return as('technical-blocker', 'technical-regression', 'technische Regression');
  }
  if (item.category === 'reconstruction-required') {
    if (!facts) return as('human-decision', 'reconstruction-unclassified', 'Rekonstruktion ohne Queue-Eintrag');
    if (facts.state === 'recipe-ready') return as('technical-blocker', 'recipe-not-applied', 'Rezept bereit, Norm nicht übernommen');
    const stale = item.key === 'baseline-amended-after-baseline-portal-date-stale';
    const code = stale ? 'text-unproven-after-baseline' : reconstructionReasonCode(facts);
    return as('human-decision', `reconstruction:${code}`, `Rekonstruktion: ${REASON_LABELS[code]}`, code);
  }
  if (item.category === 'validity') return as('human-decision', 'validity', 'Geltung am Stichtag nicht belegt', 'baseline-validity-unresolved');
  if (item.category === 'incomplete-annex') return as('human-decision', 'incomplete-annex', 'normative Anlage fehlt', 'missing-normative-annex');
  if (item.category === 'unknown-structure') return as('technical-blocker', 'unknown-structure', 'Parser: unbekannte Struktur');
  return as('human-decision', item.category, item.category);
}

/* ------------------------------------------------------------------------------------------------ */
/* Klassenentscheidungen                                                                            */

export const CLASS_DECISIONS_PATH = 'data/imports/bayernrecht/review-class-decisions.json';
export const CLASS_DECISIONS_SCHEMA = 'bayernrecht-review-class-decisions/1';

export interface ClassDecisionRule {
  id: string;
  /** Gruppen aus `classifyReviewCase`. */
  groups: string[];
  status: 'resolved-excluded';
  reasonCode: ReviewReasonCode;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  reference: string;
  /** Nur diese Quellidentitäten (Einzelfallregel); fehlt die Liste, gilt die Regel für die ganze Gruppe. */
  sourceIdentities?: string[];
}

export interface ClassDecisionFile {
  schemaVersion: typeof CLASS_DECISIONS_SCHEMA;
  rules: ClassDecisionRule[];
}

export function parseClassDecisions(value: unknown): ClassDecisionFile {
  const file = value as ClassDecisionFile;
  if (!file || file.schemaVersion !== CLASS_DECISIONS_SCHEMA || !Array.isArray(file.rules)) throw new Error(`${CLASS_DECISIONS_PATH}: Schema ${CLASS_DECISIONS_SCHEMA} erwartet`);
  const groups = new Set<string>();
  for (const rule of file.rules) {
    if (!rule.id || !Array.isArray(rule.groups) || rule.groups.length === 0 || !rule.reason?.trim() || !rule.decidedBy?.trim() || !/^\d{4}-\d{2}-\d{2}$/u.test(rule.decidedAt ?? '') || !rule.reference?.trim()) throw new Error(`${CLASS_DECISIONS_PATH}: Regel ${rule.id ?? '?'} unvollständig`);
    if (rule.status !== 'resolved-excluded' || !(REVIEW_REASON_CODES as readonly string[]).includes(rule.reasonCode)) throw new Error(`${CLASS_DECISIONS_PATH}: Regel ${rule.id} ohne gültigen Status/reasonCode`);
    if (rule.sourceIdentities) continue;
    for (const group of rule.groups) {
      if (groups.has(group)) throw new Error(`${CLASS_DECISIONS_PATH}: Gruppe ${group} in mehreren Regeln`);
      groups.add(group);
    }
  }
  return file;
}

export async function readClassDecisions(root: string): Promise<ClassDecisionFile | undefined> {
  const value = await readJsonFile<unknown>(join(root, CLASS_DECISIONS_PATH));
  return value === undefined ? undefined : parseClassDecisions(value);
}

/** Wendet die Klassenentscheidungen auf offene Fälle an; entschiedene Fälle bleiben unberührt. */
export function applyClassDecisions(queue: ReviewQueue, file: ClassDecisionFile, factsById: ReadonlyMap<string, QueueFacts> = new Map()): { queue: ReviewQueue; decided: Array<{ id: string; sourceIdentity: string; rule: string }> } {
  let next = queue;
  const decided: Array<{ id: string; sourceIdentity: string; rule: string }> = [];
  // Eine Norm mit offenem technischem Konflikt (veröffentlicht, aber Regression oder Seed-Konflikt) wird nicht per
  // Klasse entschieden – der Konflikt bleibt sichtbar, bis ein Mensch ihn einzeln entscheidet.
  const conflicted = new Set(queue.items.filter((entry) => entry.status === 'open' && entry.occurrence === 'current' && classifyReviewCase(entry).class === 'technical-blocker' && entry.category === 'import-regression').map((entry) => entry.sourceIdentity));
  for (const item of queue.items.filter((entry) => entry.status === 'open' && entry.occurrence === 'current' && !conflicted.has(entry.sourceIdentity))) {
    const klass = classifyReviewCase(item, factsById.get(item.sourceIdentity));
    const rule = file.rules.find((candidate) => candidate.groups.includes(klass.group) && (!candidate.sourceIdentities || candidate.sourceIdentities.includes(item.sourceIdentity)));
    if (!rule) continue;
    const decision: ReviewDecision = { decision: rule.status, reason: rule.reason, decidedAt: rule.decidedAt, decidedBy: rule.decidedBy, classDecision: rule.id, reasonCode: rule.reasonCode };
    next = decideReviewItem(next, item.id, decision);
    decided.push({ id: item.id, sourceIdentity: item.sourceIdentity, rule: rule.id });
  }
  return { queue: next, decided };
}

/** Queue-Fakten je Quellidentität aus `reconstruction-queue.json`. */
export async function readQueueFacts(root: string): Promise<Map<string, QueueFacts>> {
  const queue = await readJsonFile<{ entries?: Array<QueueFacts & { documentId: string }> }>(join(root, 'data/imports/bayernrecht/reconstruction-queue.json'));
  return new Map((queue?.entries ?? []).map((entry) => [entry.documentId, { state: entry.state, reason: entry.reason, group: entry.group }]));
}
