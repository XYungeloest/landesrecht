/**
 * Klassen der NSH-Reviewfälle (Lauf 17): Jeder offene Fall gehört genau einer Gruppe, die sagt, ob er ein technischer
 * Blocker ist, eine fachliche Entscheidung braucht oder nicht sperrt – und ob eine Klassenentscheidung des Nutzers ihn
 * erledigt (`data/imports/juris-sh/review-class-decisions.json`, angewandt mit `review --apply-class-decisions`).
 * Gemeinsam genutzt von der Freeze-Readiness (`scripts/nsh-freeze-readiness.ts`) und der CLI; entscheidet nichts selbst.
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { IMPORT_DATA_DIR } from '../common/constants.ts';
import { decideReviewItem, REVIEW_REASON_CODES, type ReviewDecision, type ReviewItem, type ReviewQueue, type ReviewReasonCode } from '../common/review.ts';
import type { AnnexGapGroup } from './annex-gaps.ts';

export type CaseClass = 'technical-blocker' | 'human-decision' | 'non-blocking';

export interface ReviewCaseClass {
  class: CaseClass;
  /** Stabile Kennung der Gruppe (für Klassenentscheidungen). */
  group: string;
  /** Lesbare Gruppe (Berichte). */
  label: string;
  decision: string;
}

const detailsOf = (item: Pick<ReviewItem, 'details'>): string => (Array.isArray(item.details) ? item.details.join(' | ') : String(item.details ?? ''));

/** Klasse eines offenen Falls; `annexGroup` aus `reports/annex-gaps.ts` für Anlagenfälle. */
export function classifyReviewCase(item: Pick<ReviewItem, 'category' | 'key' | 'details'>, annexGroup?: AnnexGapGroup): ReviewCaseClass {
  const details = detailsOf(item);
  const as = (klass: CaseClass, group: string, label: string, decision: string): ReviewCaseClass => ({ class: klass, group, label, decision });
  if (item.category === 'contradictory-evidence') return as('technical-blocker', 'contradictory-evidence', 'widersprüchliche Belege', 'Belege auflösen (muss 0 sein)');
  if (item.category === 'import-regression') {
    if (item.key === 'baseline-locked') return as('human-decision', 'seed-conflict', 'Seed-Konflikt (fortgeschriebene Norm)', 'Seed-Entscheidung (Konfliktbericht)');
    if (item.key === 'baseline-frozen' || item.key === 'baseline-frozen-addition') return as('technical-blocker', 'frozen-deviation', 'Abweichung vom eingefrorenen Ausgangsrechtsstand', 'dokumentierte Freigabe (Bugfix, neue Evidenz, Review, Schema) oder Adapter korrigieren');
    if (/table-layout/u.test(details)) return as('human-decision', 'unsafe-table', 'Tabelle ohne sicheres Raster (zurückgenommen)', 'Tabellenstruktur nicht belegt');
    if (/enacted-after-baseline|repealed-before-baseline/u.test(details)) return as('human-decision', 'withdrawal-not-at-baseline', 'zurückgenommen: am Stichtag nicht geltend', 'Rücknahme bestätigen');
    return as('technical-blocker', 'technical-regression', 'technische Regression', 'Ursache im Adapter beheben');
  }
  if (/table-layout/u.test(item.key)) return as('human-decision', 'unsafe-table', 'Tabelle ohne sicheres Raster', 'Tabellenstruktur nicht belegt');
  if (item.key === 'integrity:mismatch') return as('technical-blocker', 'integrity-mismatch', 'Textintegrität: Abweichung', 'Zeichenverlust im Parser beheben');
  if (item.key === 'integrity:review') return as('human-decision', 'integrity-review', 'Textintegrität: Einzelzeichen prüfen', 'Abweichung bestätigen');
  if (item.key === 'schema:title-missing' || item.key === 'parse:toc-unit-missing') return as('technical-blocker', 'parser-structure', 'Parser: Titel bzw. Verzeichniseinheit', 'Parser anpassen');
  if (item.key === 'parse:empty-footnote') return as('human-decision', 'empty-footnote', 'Quelle: Fußnotenzeichen ohne Text', 'fehlender Fußnotentext – nicht ergänzbar');
  if (item.category === 'institution-mapping') return as('human-decision', 'state-name', 'Landesbezeichnung oder Kürzel ohne Regel', 'Transformationsregel festlegen');
  if (item.category === 'incomplete-annex') {
    if (item.key === 'parse:vwv-annex-document' || item.key === 'parse:annex-separate-document' || annexGroup === 'assignment-unclear') return as('human-decision', 'annex-parent-unresolved', 'Anlage ohne sichere Stammnorm', 'Zuordnung nicht belegt');
    if (annexGroup === 'non-normative-missing') return as('non-blocking', 'annex-non-normative', 'nur nichtnormative Anlage fehlt', 'nach Bestätigung übernehmbar');
    if (annexGroup === 'normative-separate') return as('technical-blocker', 'annex-separate', 'normative Anlage separat vorhanden', 'Anlage anhängen');
    if (annexGroup === 'completely-missing') return as('human-decision', 'text-missing', 'Normtext vollständig fehlend', 'Quelle fehlt');
    return as('human-decision', 'annex-missing', 'normative Anlage nur als nicht zugängliche PDF-Datei', 'Quelle fehlt (keine OCR)');
  }
  if (item.category === 'pdf-only') return /figure/u.test(item.key) ? as('human-decision', 'figure-uncertain', 'Abbildung nicht sicher zuzuordnen', 'Abbildung nicht belegt') : as('human-decision', 'text-incomplete', 'technischer Vermerk: Text unvollständig', 'fehlender Text – nicht ergänzbar');
  if (item.category === 'historical-gap') {
    const group = /rückwirkende Fassung/u.test(details) ? ['historical-retroactive', 'nur rückwirkende Einzelfassung am Stichtag'] : /Reihenfolge/u.test(details) ? ['historical-order', 'Einheitenfolge der Einzelfassungen'] : /zugleich am Stichtag/u.test(details) ? ['historical-parallel', 'zwei Einzelfassungen am Stichtag'] : ['historical-other', 'Einzelfassungen nicht eindeutig'];
    return as('human-decision', group[0]!, group[1]!, 'Stichtagsfassung aus Evidenz bestimmen');
  }
  if (item.category === 'validity') return /C-undetermined/u.test(item.key) ? as('human-decision', 'validity-register', 'Register (Ende) gegen Fortbestand', 'Geltung am Stichtag entscheiden') : as('human-decision', 'validity-undetermined', 'Geltung am Stichtag unbestimmt', 'Geltung am Stichtag entscheiden');
  if (item.category === 'reconstruction-required') return as('human-decision', 'reconstruction', 'Stichtagsfassung ohne Quelle', 'Quelle beschaffen');
  return as('human-decision', item.category, item.category, 'fachliche Entscheidung');
}

/* ------------------------------------------------------------------------------------------------ */
/* Klassenentscheidungen                                                                            */

export const CLASS_DECISIONS_PATH = `${IMPORT_DATA_DIR}/review-class-decisions.json`;
export const CLASS_DECISIONS_SCHEMA = 'juris-sh-review-class-decisions/1';

export interface ClassDecisionRule {
  id: string;
  /** Gruppen aus `classifyReviewCase`, die diese Entscheidung erledigt. */
  groups: string[];
  status: 'resolved-excluded' | 'resolved-imported';
  reasonCode?: ReviewReasonCode;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  /** Wo die Entscheidung getroffen wurde (Auftrag, Dokument). */
  reference: string;
  /** Nur diese Dokumente (einzeln geprüfte Fälle); fehlt die Liste, gilt die Regel für die ganze Gruppe. */
  sourceIdentities?: string[];
  /** Beleglage je Dokument (einzeln geprüfte Fälle). */
  evidence?: Record<string, string>;
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
    if (rule.status === 'resolved-excluded' && !(REVIEW_REASON_CODES as readonly string[]).includes(rule.reasonCode ?? '')) throw new Error(`${CLASS_DECISIONS_PATH}: Regel ${rule.id} ohne gültigen reasonCode`);
    if (rule.sourceIdentities) continue; // Einzelfallregeln dürfen Gruppen mit anderen Regeln teilen
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

/**
 * Wendet die Klassenentscheidungen auf offene Fälle an. Nur offene Fälle, nur passende Gruppen; jede Entscheidung
 * trägt Regel, Begründung und Klassenkennung. Entschiedene Fälle bleiben unberührt.
 */
export function applyClassDecisions(queue: ReviewQueue, file: ClassDecisionFile, annexGroups: ReadonlyMap<string, AnnexGapGroup> = new Map()): { queue: ReviewQueue; decided: Array<{ id: string; sourceIdentity: string; rule: string }> } {
  let next = queue;
  const decided: Array<{ id: string; sourceIdentity: string; rule: string }> = [];
  for (const item of queue.items.filter((entry) => entry.status === 'open')) {
    const klass = classifyReviewCase(item, annexGroups.get(item.id));
    const rule = file.rules.find((candidate) => candidate.groups.includes(klass.group) && (!candidate.sourceIdentities || candidate.sourceIdentities.includes(item.sourceIdentity)));
    if (!rule) continue;
    const decision: ReviewDecision = { decision: rule.status, reason: rule.reason, decidedAt: rule.decidedAt, decidedBy: rule.decidedBy, classDecision: rule.id, ...(rule.reasonCode ? { reasonCode: rule.reasonCode } : {}) };
    next = decideReviewItem(next, item.id, decision);
    decided.push({ id: item.id, sourceIdentity: item.sourceIdentity, rule: rule.id });
  }
  return { queue: next, decided };
}
