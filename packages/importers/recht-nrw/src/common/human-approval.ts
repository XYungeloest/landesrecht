/**
 * Human Approval der Legacy-Ausnahmen (West Reference Baseline, Stichtag `SIMULATION_BASELINE_DATE`).
 *
 * Jede Ausnahme in `data/imports/recht-nrw/legacy-exceptions.json` wurde maschinell vorbereitet
 * (`preparedBy: "automated-review"`) und wartet auf die redaktionelle Bestätigung eines Menschen
 * (`approvalStatus`). Dieses Modul liefert drei Bausteine:
 *
 *  1. **Freigabereport** (`approval-report`): `data/audits/recht-nrw/HUMAN_APPROVAL_WEST.md` und
 *     `human-approval-west.json` – deterministisch aus Daten (Ausnahmefelder, Manifest-Evidenz,
 *     Evidence-Pass-Fälle, Review-Shards), nie aus freiem Text, damit jeder Lauf denselben Report ergibt.
 *     Empfehlung und Risikoklasse folgen dokumentierten Regeln (`assessException`):
 *
 *       - `DEPUBLIKATION BEIBEHALTEN` (low): eigene Außerkrafttretensformel der amtlichen Fassungsseite
 *         (Beweisklasse strong) nennt ein Datum vor dem Stichtag; kein starker Beleg für Geltung am Stichtag.
 *       - `DEPUBLIKATION BEIBEHALTEN` (medium): amtliche Nachfolgevorschrift hebt die Norm vor dem Stichtag
 *         auf (Nachfolgebeleg strong: Datum, Fundstelle, Titel stimmen); widersprochen nur durch das offene
 *         Portalintervall, kein eigener Text, der über den Stichtag hinaus gilt.
 *       - `DELIVER-LEGACY BEIBEHALTEN` (low/medium): Text vollständig und SHA-256-identisch, nur
 *         `structure-unnumbered-section`, `legacyAssessment.impact = structure-only`; low bei genau einer
 *         Sektion mit vorgeschlagenem Override, medium bei mehreren Sektionen oder nötiger redaktioneller
 *         Entscheidung.
 *       - `MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH` (high): sonst – widersprüchliche oder mehrdeutige
 *         Außerkrafttretensformeln, starker Beleg für Geltung am Stichtag gegen einen Aufhebungsbeleg, oder
 *         Legacy-Fall, bei dem „kein Rechtsinhaltverlust“ nicht klar bejahbar ist.
 *
 *     Beweisklassen: strong/contradictory tragen die Entscheidung, supporting ergänzt, insufficient trägt
 *     nie allein.
 *
 *  2. **Approval-CLI** (`approval`): ändert genau einen Fall (`--term`), verlangt eine Begründung, trägt nie
 *     automatisch einen Namen ein (kein Git-/OS-Nutzer, kein Agent) und schreibt `approvalHistory`.
 *     `rejected` heißt nur „nicht freigegeben“ – keine automatische Folgeaktion.
 *
 *  3. **Statusbefehl** (`approval-status`): eine Zeile; Exit 0 = vollständig freigegeben, 2 = technisch valide,
 *     Freigabe ausstehend, 1 = inkonsistent.
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { CliOptions, Io } from '../cli.ts';
import { EVIDENCE_PASS_PATH, type EvidencePassCase, type EvidencePassReport } from '../lrmb/evidence-pass.ts';
import { readJsonFile, writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { TARGET_JURISDICTION } from './constants.ts';
import { APPROVAL_STATUSES, LEGACY_EXCEPTIONS_PATH, readLegacyExceptions, validateLegacyExceptionRegistry, type ApprovalStatus, type LegacyException, type LegacyExceptionRegistry } from './legacy-exceptions.ts';
import { AUDIT_DIR, compareSourceIdentity, isImportedStatus, readManifestEntry, type EvidenceStrength, type ManifestEntry, type ValidityEvidence } from './manifest.ts';
import { reviewShardPath, type ReviewItem } from './review-queue.ts';

export const HUMAN_APPROVAL_SCHEMA = 'recht-nrw-human-approval/1' as const;
export const HUMAN_APPROVAL_JSON_PATH = join(AUDIT_DIR, 'human-approval-west.json');
export const HUMAN_APPROVAL_MARKDOWN_PATH = join(AUDIT_DIR, 'HUMAN_APPROVAL_WEST.md');

export const RECOMMENDATIONS = ['DELIVER-LEGACY BEIBEHALTEN', 'DEPUBLIKATION BEIBEHALTEN', 'MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RISK_CLASSES = ['low', 'medium', 'high'] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];
/** Reihenfolge im Report: starke Depublikationsbelege, dann contradictory-Evidenz mit Empfehlung, Deliver-Legacy, zuletzt menschliche Entscheidung. */
export const APPROVAL_GROUPS = ['depublish-strong', 'depublish-contradictory', 'deliver-legacy', 'human-decision'] as const;
export type ApprovalGroup = (typeof APPROVAL_GROUPS)[number];

const GROUP_TITLES: Record<ApprovalGroup, string> = {
  'depublish-strong': 'Depublikationen mit starkem Außerkrafttretensbeleg (eigene Formel vor dem Stichtag)',
  'depublish-contradictory': 'Depublikationen mit contradictory-Evidenz (amtlicher Nachfolgebeleg, offenes Portalintervall)',
  'deliver-legacy': 'Deliver-Legacy (Text identisch, nur Struktur)',
  'human-decision': 'Menschliche Entscheidung erforderlich (widersprüchliche oder unvollständige Evidenz)',
};

const STRENGTH_ROLE: Record<EvidenceStrength, string> = {
  strong: 'trägt die Entscheidung',
  contradictory: 'trägt die Entscheidung (Widerspruch)',
  supporting: 'ergänzend',
  insufficient: 'trägt nicht allein',
};

export interface ApprovalEvidence {
  kind: ValidityEvidence['kind'] | 'text-integrity';
  title: string;
  citation: string;
  date: string;
  url: string;
  sha256: string;
  documentType: string;
  /** Kurzer Formel-Ausschnitt (eine Zeile). */
  excerpt: string;
  evidenceStrength: EvidenceStrength | 'n/a';
  supports: string;
  role: string;
}

export interface LegacyQuestions {
  textComplete: boolean;
  hashIdentical: boolean;
  unclassified: string;
  impact: 'structure-only' | 'possible-legal-content';
  officialSourceHash: string;
  reviewCase: string;
  deliverable: boolean;
}

export interface DepublishQuestions {
  newEvidence: string;
  evidenceClass: string;
  officialSource: string;
  stemNormUnambiguous: boolean;
  relevantDate: string;
  beforeBaseline: boolean;
  compelling: boolean;
  uncertainty: string;
}

export interface ApprovalItem {
  order: number;
  group: ApprovalGroup;
  exceptionId: string;
  sourceIdentity: string;
  sourceArea: LegacyException['sourceArea'];
  title: string;
  targetSlug: string;
  exceptionType: LegacyException['disposition'];
  disposition: LegacyException['disposition'];
  recommendation: Recommendation;
  approvalStatus: ApprovalStatus;
  riskClass: RiskClass;
  quickReview: string;
  sourceUrl: string;
  citation: string;
  sourceHashes: { source: string; normTextLegacy: string; normTextCurrent: string; normTextMethod: string };
  evidence: ApprovalEvidence[];
  parserVersionPrevious: string;
  parserVersionCurrent: string;
  legacyImportStatus: string;
  transformer: string;
  textIntegrity: LegacyException['textIntegrity'];
  findings: string[];
  findingMessages: string[];
  baselineStatus: string;
  reviewReferences: string[];
  evidenceReferences: NonNullable<LegacyException['evidenceReferences']>;
  publicStatus: { state: 'published' | 'depublished' | 'unknown'; detail: string };
  structuralDefect: string;
  reason: string;
  followUp: string;
  preparedAt: string;
  preparedBy: string;
  legacyQuestions?: LegacyQuestions;
  depublishQuestions?: DepublishQuestions;
  decision?: LegacyException['decision'];
  approvalHistory: NonNullable<LegacyException['approvalHistory']>;
}

export interface HumanApprovalReport {
  schemaVersion: typeof HUMAN_APPROVAL_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  baselineDate: string;
  generatedAt: string;
  summary: { total: number; deliverLegacy: number; depublish: number; pending: number; approved: number; rejected: number; superseded: number; byRisk: Record<RiskClass, number>; byRecommendation: Record<Recommendation, number> };
  items: ApprovalItem[];
}

/* ------------------------------------------------------------------------------------------ */
/* Bewertung je Ausnahme (deterministische Regeln)                                              */

export interface ExceptionAssessment {
  group: ApprovalGroup;
  recommendation: Recommendation;
  riskClass: RiskClass;
}

const before = (date: string | undefined, baseline: string): boolean => date !== undefined && date < baseline;

/** Empfehlung, Gruppe und Risikoklasse aus Ausnahme und Manifest-Evidenz (siehe Kopfkommentar). */
export function assessException(exception: LegacyException, evidence: readonly ValidityEvidence[], baseline: string): ExceptionAssessment {
  if (exception.disposition === 'deliver-legacy') {
    const assessment = exception.legacyAssessment;
    const onlyStructure = exception.current.findings.every((code) => code === 'structure-unnumbered-section');
    const integrity = exception.textIntegrity.identical && exception.textIntegrity.legacyChars === exception.textIntegrity.currentChars;
    if (assessment && assessment.impact === 'structure-only' && integrity && onlyStructure) {
      const simple = assessment.unclassifiedSections.length === 1 && assessment.resolution === 'override-proposed';
      return { group: 'deliver-legacy', recommendation: 'DELIVER-LEGACY BEIBEHALTEN', riskClass: simple ? 'low' : 'medium' };
    }
    return { group: 'human-decision', recommendation: 'MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH', riskClass: 'high' };
  }
  const ownExpiryBefore = evidence.some((item) => item.kind === 'text-expiry-clause' && item.strength === 'strong' && item.supports === 'contradiction' && before(item.date, baseline));
  const successorBefore = evidence.some((item) => item.kind === 'successor-repeal' && item.successor?.evidenceStrength === 'strong' && before(item.date, baseline));
  const validAtBaseline = evidence.some((item) => item.strength === 'strong' && ((item.supports === 'valid-to' && item.date !== undefined && item.date >= baseline) || item.supports === 'active-at-baseline'));
  const contradictedExpiry = evidence.some((item) => item.kind === 'text-expiry-clause' && item.strength === 'contradictory');
  if (ownExpiryBefore && !validAtBaseline && !contradictedExpiry) return { group: 'depublish-strong', recommendation: 'DEPUBLIKATION BEIBEHALTEN', riskClass: 'low' };
  if (successorBefore && !validAtBaseline && !contradictedExpiry) return { group: 'depublish-contradictory', recommendation: 'DEPUBLIKATION BEIBEHALTEN', riskClass: 'medium' };
  return { group: 'human-decision', recommendation: 'MENSCHLICHE ENTSCHEIDUNG ERFORDERLICH', riskClass: 'high' };
}

/* ------------------------------------------------------------------------------------------ */
/* Report aufbauen                                                                              */

export interface ApprovalCaseInput {
  exception: LegacyException;
  manifest: ManifestEntry | undefined;
  evidencePass: EvidencePassCase | undefined;
  reviewItems: readonly ReviewItem[];
  contentPresent: boolean;
}

const oneLine = (text: string | undefined, max = 160): string => {
  const flat = (text ?? '').replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
/** Satz mit Schlusspunkt (für zusammengesetzte Kurzprüfungen). */
const sentence = (text: string): string => (/[.!?…]$/u.test(text) ? text : `${text}.`);

function documentTypeOf(item: ValidityEvidence, manifest: ManifestEntry | undefined): string {
  switch (item.kind) {
    case 'successor-repeal': return 'Nachfolgevorschrift (amtliche LRMB-Fassungsseite)';
    case 'text-expiry-clause': case 'text-in-force-clause': return `eigener Text der Fassungsseite (${manifest?.sourceDocumentType ?? 'Vorschrift'})`;
    case 'portal-version-list': case 'portal-version-interval': return 'Portal-Metadaten der Fassungsseite';
    case 'search-index-signal': return 'Suchindex des Portals (nur Hinweis)';
    default: return item.kind;
  }
}

function evidenceTitle(item: ValidityEvidence): string {
  if (item.kind === 'successor-repeal' && item.successor) return `Aufhebung durch ${oneLine(item.successor.successorTitle, 110)}${item.successor.successorIdentity ? ` (${item.successor.successorIdentity})` : ''}`;
  if (item.kind === 'text-expiry-clause') return 'Eigene Außerkrafttretensformel';
  if (item.kind === 'text-in-force-clause') return 'Eigene Inkrafttretensformel';
  if (item.kind === 'portal-version-interval') return 'Portalintervall der gewählten Fassung';
  if (item.kind === 'portal-version-list') return 'Fassungsliste des Portals';
  if (item.kind === 'search-index-signal') return 'Suchindex-Signal';
  return item.kind;
}

function toEvidence(item: ValidityEvidence, manifest: ManifestEntry | undefined): ApprovalEvidence {
  const strength = item.strength ?? 'insufficient';
  return {
    kind: item.kind,
    title: evidenceTitle(item),
    citation: item.citation ?? item.successor?.citation ?? '',
    date: item.date ?? item.successor?.effectiveDate ?? '',
    url: item.sourceUrl ?? item.successor?.sourceUrl ?? '',
    sha256: item.sha256 ?? item.successor?.sha256 ?? '',
    documentType: documentTypeOf(item, manifest),
    excerpt: oneLine(item.excerpt ?? item.statement, 140),
    evidenceStrength: strength,
    supports: item.supports,
    role: STRENGTH_ROLE[strength],
  };
}

function legacyQuestions(exception: LegacyException, reviewItems: readonly ReviewItem[], assessment: ExceptionAssessment): LegacyQuestions {
  const legacy = exception.legacyAssessment!;
  const review = reviewItems.filter((item) => item.status === 'open' && item.category === 'unknown-structure').map((item) => item.id);
  return {
    textComplete: exception.textIntegrity.legacyChars === exception.textIntegrity.currentChars,
    hashIdentical: exception.textIntegrity.identical,
    unclassified: `Sektion(en) ${legacy.unclassifiedSections.join(', ')} ohne Nummernfeld – nach Zählung/Querverweis: ${legacy.expectedLabels.join(', ')}`,
    impact: legacy.impact,
    officialSourceHash: exception.source.sha256,
    reviewCase: review.length ? review.join(', ') : 'kein offener unknown-structure-Fall',
    deliverable: assessment.recommendation === 'DELIVER-LEGACY BEIBEHALTEN',
  };
}

function depublishQuestions(exception: LegacyException, evidence: readonly ValidityEvidence[], evidencePass: EvidencePassCase | undefined, assessment: ExceptionAssessment, baseline: string): DepublishQuestions {
  const carrying = evidence.filter((item) => item.strength === 'strong' || item.strength === 'contradictory');
  const decisive = carrying.find((item) => item.kind === 'text-expiry-clause' && item.supports === 'contradiction') ?? carrying.find((item) => item.kind === 'successor-repeal') ?? carrying[0];
  const stem = decisive?.kind !== 'successor-repeal' || (decisive.successor?.matched.length ?? 0) >= 2;
  const date = decisive?.date ?? decisive?.successor?.effectiveDate ?? '';
  const classes = [...new Set(carrying.map((item) => item.strength))].join(', ') || 'keine tragende Klasse';
  return {
    newEvidence: decisive ? `${evidenceTitle(decisive)}: ${oneLine(decisive.excerpt ?? decisive.statement, 120)}` : 'kein tragender Beleg im Manifest',
    evidenceClass: classes,
    officialSource: decisive?.sourceUrl ?? decisive?.successor?.sourceUrl ?? exception.source.url,
    stemNormUnambiguous: stem,
    relevantDate: date,
    beforeBaseline: before(date, baseline),
    compelling: assessment.recommendation === 'DEPUBLIKATION BEIBEHALTEN',
    uncertainty: assessment.recommendation === 'DEPUBLIKATION BEIBEHALTEN'
      ? (assessment.group === 'depublish-contradictory' ? 'nur das offene Portalintervall widerspricht (Portal weist kein Ende aus)' : 'keine; Portal weist lediglich kein Ende aus')
      : oneLine(evidencePass?.after?.reason ?? 'widersprüchliche Geltungsevidenz', 200),
  };
}

function quickReview(exception: LegacyException, assessment: ExceptionAssessment, evidence: readonly ValidityEvidence[], manifest: ManifestEntry | undefined, evidencePass: EvidencePassCase | undefined, baseline: string): string {
  if (exception.disposition === 'deliver-legacy') {
    const legacy = exception.legacyAssessment!;
    const base = `Text vollständig und SHA-256-identisch (${exception.textIntegrity.currentChars} Zeichen); Sektion(en) ${legacy.unclassifiedSections.join(', ')} ohne Nummernfeld (${legacy.expectedLabels.join(', ')}), Zuordnung nur strukturell.`;
    return assessment.recommendation === 'DELIVER-LEGACY BEIBEHALTEN'
      ? `${base} ${legacy.resolution === 'editorial-decision' ? 'Endgültige Auflösung braucht eine redaktionelle Entscheidung.' : 'Override des Kennzeichens vorgeschlagen.'}`
      : `${base} Rechtsinhaltverlust nicht klar ausschließbar – menschliche Entscheidung.`;
  }
  const expiry = evidence.find((item) => item.kind === 'text-expiry-clause' && item.strength === 'strong' && item.supports === 'contradiction');
  const successor = evidence.find((item) => item.kind === 'successor-repeal');
  if (assessment.group === 'depublish-strong' && expiry) return `Eigene Außerkrafttretensformel der amtlichen Fassungsseite nennt ${expiry.date} (vor Stichtag ${baseline}); Quellhash unverändert, Depublikation ausgeführt (${manifest?.runId ?? 'Lauf unbekannt'}).`;
  if (assessment.group === 'depublish-contradictory' && successor?.successor) return `Nachfolgevorschrift ${successor.successor.successorIdentity ?? ''} (${successor.successor.citation}) hebt die Vorschrift zum ${successor.date ?? successor.successor.effectiveDate ?? '?'} auf; nur das offene Portalintervall widerspricht.`;
  return `Widersprüchliche Geltungsevidenz: ${sentence(oneLine(evidencePass?.after?.reason ?? exception.structuralDefect, 180))} Kein Beleg trägt allein – Entscheidung des Nutzers nötig.`;
}

function publicStatus(exception: LegacyException, manifest: ManifestEntry | undefined, contentPresent: boolean): ApprovalItem['publicStatus'] {
  if (!manifest) return { state: 'unknown', detail: 'kein Manifesteintrag' };
  if (isImportedStatus(manifest.importStatus) && contentPresent) return { state: 'published', detail: `veröffentlicht: content/norms/${TARGET_JURISDICTION}/${manifest.targetSlug} (${manifest.parserVersion}, ${manifest.importStatus})` };
  if (exception.disposition === 'depublish') return { state: 'depublished', detail: `depubliziert: Manifest ${manifest.importStatus} (${manifest.parserVersion}), Lauf ${manifest.runId ?? '–'}; kein Ziel-Slug` };
  return { state: 'unknown', detail: `Manifest ${manifest.importStatus}, Inhalt ${contentPresent ? 'vorhanden' : 'fehlt'}` };
}

export function buildApprovalItem(input: ApprovalCaseInput, baseline: string): Omit<ApprovalItem, 'order'> {
  const { exception, manifest, evidencePass, reviewItems } = input;
  const evidence = manifest?.validityEvidence ?? [];
  const assessment = assessException(exception, evidence, baseline);
  const evidenceList: ApprovalEvidence[] = evidence.map((item) => toEvidence(item, manifest));
  evidenceList.push({
    kind: 'text-integrity',
    title: exception.disposition === 'deliver-legacy' ? 'Textintegrität gespeicherte Fassung ↔ Parser aktuell' : 'Quellhash der Fassungsseite (Manifest-Rohdokument)',
    citation: '',
    date: exception.preparedAt,
    url: exception.source.url,
    sha256: exception.textIntegrity.currentSha256,
    documentType: 'Prüfung des Importers',
    excerpt: oneLine(exception.textIntegrity.method, 140),
    evidenceStrength: 'n/a',
    supports: exception.textIntegrity.identical ? 'identisch' : 'abweichend',
    role: exception.disposition === 'deliver-legacy' ? 'trägt die Entscheidung (Textidentität)' : 'ergänzend (Quelle unverändert)',
  });
  const openReview = reviewItems.filter((item) => item.status === 'open').map((item) => `${item.id} (${item.category}, ${item.severity})`);
  const item: Omit<ApprovalItem, 'order'> = {
    group: assessment.group,
    exceptionId: exception.id,
    sourceIdentity: exception.sourceIdentity,
    sourceArea: exception.sourceArea,
    title: manifest?.sourceTitle ?? evidencePass?.title ?? exception.targetSlug,
    targetSlug: exception.targetSlug,
    exceptionType: exception.disposition,
    disposition: exception.disposition,
    recommendation: assessment.recommendation,
    approvalStatus: exception.approvalStatus,
    riskClass: assessment.riskClass,
    quickReview: quickReview(exception, assessment, evidence, manifest, evidencePass, baseline),
    sourceUrl: exception.source.url,
    citation: evidence.map((entry) => entry.citation ?? entry.successor?.citation).find((value): value is string => Boolean(value)) ?? '',
    sourceHashes: { source: exception.source.sha256, normTextLegacy: exception.textIntegrity.legacySha256, normTextCurrent: exception.textIntegrity.currentSha256, normTextMethod: exception.textIntegrity.method },
    evidence: evidenceList,
    parserVersionPrevious: exception.legacy.parserVersion,
    parserVersionCurrent: exception.current.parserVersion,
    legacyImportStatus: exception.legacy.importStatus,
    transformer: exception.legacy.transformerVersion,
    textIntegrity: exception.textIntegrity,
    findings: [...exception.current.findings],
    findingMessages: (manifest?.findings ?? []).filter((finding) => finding.severity === 'error').map((finding) => `${finding.code}: ${oneLine(finding.message, 200)}`),
    baselineStatus: manifest?.baselineStatus ?? 'unbekannt',
    reviewReferences: openReview,
    evidenceReferences: exception.evidenceReferences ?? [],
    publicStatus: publicStatus(exception, manifest, input.contentPresent),
    structuralDefect: exception.structuralDefect,
    reason: exception.reason,
    followUp: exception.followUp ?? '',
    preparedAt: exception.preparedAt,
    preparedBy: exception.preparedBy,
    approvalHistory: exception.approvalHistory ?? [],
    ...(exception.decision ? { decision: exception.decision } : {}),
    ...(exception.disposition === 'deliver-legacy' ? { legacyQuestions: legacyQuestions(exception, reviewItems, assessment) } : { depublishQuestions: depublishQuestions(exception, evidence, evidencePass, assessment, baseline) }),
  };
  return item;
}

export function buildHumanApprovalReport(cases: readonly ApprovalCaseInput[], options: { baselineDate?: string; now: string }): HumanApprovalReport {
  const baseline = options.baselineDate ?? SIMULATION_BASELINE_DATE;
  const seen = new Set<string>();
  for (const { exception } of cases) {
    if (seen.has(exception.sourceIdentity)) throw new Error(`Human Approval: doppelte Ausnahme für ${exception.sourceIdentity}`);
    seen.add(exception.sourceIdentity);
  }
  const unordered = cases.map((input) => buildApprovalItem(input, baseline));
  unordered.sort((left, right) => APPROVAL_GROUPS.indexOf(left.group) - APPROVAL_GROUPS.indexOf(right.group) || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const items: ApprovalItem[] = unordered.map((item, index) => ({ order: index + 1, ...item }));
  const count = (status: ApprovalStatus): number => items.filter((item) => item.approvalStatus === status).length;
  const byRisk = { low: 0, medium: 0, high: 0 } as Record<RiskClass, number>;
  const byRecommendation = Object.fromEntries(RECOMMENDATIONS.map((value) => [value, 0])) as Record<Recommendation, number>;
  for (const item of items) {
    byRisk[item.riskClass] += 1;
    byRecommendation[item.recommendation] += 1;
  }
  return {
    schemaVersion: HUMAN_APPROVAL_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    baselineDate: baseline,
    generatedAt: options.now,
    summary: { total: items.length, deliverLegacy: items.filter((item) => item.disposition === 'deliver-legacy').length, depublish: items.filter((item) => item.disposition === 'depublish').length, pending: count('pending-human-review'), approved: count('approved'), rejected: count('rejected'), superseded: count('superseded'), byRisk, byRecommendation },
    items,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Markdown                                                                                     */

const STATUS_LABEL: Record<ApprovalStatus, string> = { 'pending-human-review': 'AUSSTEHEND', approved: 'FREIGEGEBEN', rejected: 'NICHT FREIGEGEBEN', superseded: 'GEGENSTANDSLOS' };
const yesNo = (value: boolean): string => (value ? 'ja' : 'nein');
const cell = (text: string): string => text.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
const short = (sha: string): string => (sha ? `${sha.slice(0, 16)}…` : '–');

/** Tragender Beleg der Übersicht: Außerkrafttretensformel (Widerspruch zur Portalgeltung) vor Nachfolgebeleg vor sonstigem starken Beleg. */
function primaryEvidence(item: ApprovalItem): string {
  if (item.disposition === 'deliver-legacy') return `Textidentität SHA-256 ${short(item.sourceHashes.normTextCurrent)} (Portalintervall strong)`;
  const carrying = item.evidence.filter((entry) => entry.evidenceStrength === 'strong' || entry.evidenceStrength === 'contradictory');
  const decisive = carrying.find((entry) => entry.kind === 'text-expiry-clause' && entry.supports === 'contradiction') ?? carrying.find((entry) => entry.kind === 'successor-repeal') ?? carrying[0];
  return decisive ? `${decisive.title}${decisive.date ? ` ${decisive.date}` : ''} [${decisive.evidenceStrength}]` : 'kein tragender Beleg';
}

export function renderHumanApprovalMarkdown(report: HumanApprovalReport): string {
  const lines: string[] = [];
  const summary = report.summary;
  lines.push('# Human Approval – West Reference Baseline');
  lines.push('');
  lines.push(`West Reference Baseline · Stichtag ${report.baselineDate} · ${summary.total} Ausnahmen · ${summary.deliverLegacy} Deliver-Legacy · ${summary.depublish} Depublikation/Regression`);
  lines.push('');
  lines.push(`Stand: ${report.generatedAt} · Quelle: \`${LEGACY_EXCEPTIONS_PATH}\` (vorbereitet durch \`automated-review\`) · maschinenlesbar: \`${HUMAN_APPROVAL_JSON_PATH}\` · Erzeugung: \`npm run import:recht-nrw:approval-report -- --write\``);
  lines.push('');
  lines.push(`Freigabestatus: ${summary.pending} ausstehend · ${summary.approved} freigegeben · ${summary.rejected} nicht freigegeben${summary.superseded ? ` · ${summary.superseded} gegenstandslos` : ''}. Risiko: ${summary.byRisk.low} low · ${summary.byRisk.medium} medium · ${summary.byRisk.high} high. Empfehlungen: ${RECOMMENDATIONS.map((value) => `${summary.byRecommendation[value]} × ${value}`).join(' · ')}.`);
  lines.push('');
  lines.push('Dieser Report bereitet die redaktionelle Entscheidung vor; er ersetzt sie nicht. Jede Empfehlung folgt den dokumentierten Regeln in `packages/importers/recht-nrw/src/common/human-approval.ts` und ist aus Ausnahmefeldern, Manifest-Evidenz, Evidence-Pass-Fällen und Review-Shards abgeleitet. Beweisklassen: **strong/contradictory** tragen die Entscheidung, **supporting** ergänzt, **insufficient** trägt nie allein. Risikoklassen: **low** = eindeutiger amtlicher Beleg bzw. reine Strukturabweichung ohne Textverlust; **medium** = mehrere Belege oder Legacy mit struktureller Einschränkung; **high** = widersprüchliche/unvollständige Evidenz. Die 16 Depublikationen sind ausgeführt (Versionsreport: gegenstandslos) und bleiben hier als Depublikations-Entscheidung zur Bestätigung; sie werden nicht als `superseded` geführt.');
  lines.push('');
  lines.push('Entscheidung eintragen: `npm run import:recht-nrw:approval -- --term term:<id> --decision approve|reject --reason "…" [--approved-by "…"] --write` · Status: `npm run import:recht-nrw:approval-status`.');
  lines.push('');
  lines.push('## Übersicht');
  lines.push('');
  lines.push('| Nr. | Term-ID | Titel | Typ | Entscheidung (Vorschlag) | Grund | Amtlicher Beleg | Textintegrität | Aktueller Status | Risiko | Nutzerentscheidung |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const item of report.items) {
    lines.push(`| ${item.order} | ${item.sourceIdentity} | ${cell(oneLine(item.title, 70))} | ${item.exceptionType} | ${item.recommendation} | ${cell(item.findings.join(', ') || '–')} | ${cell(primaryEvidence(item))} | ${item.textIntegrity.identical ? 'identisch' : 'abweichend'} (${item.disposition === 'deliver-legacy' ? 'Normtext' : 'Fassungsseite'}) | ${item.publicStatus.state === 'published' ? 'veröffentlicht (Legacy-Parser)' : item.publicStatus.state === 'depublished' ? 'depubliziert' : 'unbekannt'} | ${item.riskClass} | ${STATUS_LABEL[item.approvalStatus]} |`);
  }
  lines.push('');
  let currentGroup: ApprovalGroup | undefined;
  for (const item of report.items) {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      lines.push(`## ${GROUP_TITLES[item.group]}`);
      lines.push('');
    }
    lines.push(`### ${item.order}. ${item.sourceIdentity} – ${oneLine(item.title, 140)}`);
    lines.push('');
    lines.push(`- Typ: \`${item.exceptionType}\` (Ausnahme \`${item.exceptionId}\`) · Quellbereich: ${item.sourceArea.toUpperCase()} · Ziel-Slug: \`${item.targetSlug}\``);
    lines.push(`- Aktueller öffentlicher Status: ${item.publicStatus.detail}`);
    lines.push(`- Vorgeschlagene Ausnahme: ${item.disposition === 'deliver-legacy' ? 'gespeicherte Fassung weiter ausliefern (deliver-legacy)' : 'kontrollierte Depublikation (depublish)'}; Risiko **${item.riskClass}**`);
    lines.push(`- Parser alt/aktuell: \`${item.parserVersionPrevious}\` → \`${item.parserVersionCurrent}\` · Transformer: \`${item.transformer}\``);
    lines.push(`- Quell-URL: <${item.sourceUrl}> · Fundstelle: ${item.citation || 'Fassungsseite RECHT.NRW'}`);
    lines.push(`- Source-SHA-256: \`${item.sourceHashes.source}\``);
    lines.push(`- Normtext-SHA-256 (${item.disposition === 'deliver-legacy' ? 'sichtbarer Text' : 'Fassungsseite, Bytes'}): Legacy \`${item.sourceHashes.normTextLegacy}\` · aktuell \`${item.sourceHashes.normTextCurrent}\``);
    lines.push(`- Vorbereitet: ${item.preparedAt} durch \`${item.preparedBy}\` · Evidenzreferenzen: ${item.evidenceReferences.map((reference) => `${reference.kind} \`${reference.ref}\``).join(', ') || '–'}`);
    lines.push('');
    lines.push('**Ausgangslage.** ' + `Mit \`${item.parserVersionPrevious}\` als \`${item.legacyImportStatus}\` übernommen; der Reimport mit \`${item.parserVersionCurrent}\` ergibt keinen Import mehr (import-regression). Stichtagsstatus laut Manifest: ${item.baselineStatus}.`);
    lines.push('');
    lines.push('**Neuer Befund.** ' + `${item.findings.map((code) => `\`${code}\``).join(', ') || 'kein Fehlercode'}${item.findingMessages.length ? ` – ${item.findingMessages.join(' | ')}` : ''}. ${item.structuralDefect}`);
    lines.push('');
    lines.push('**Amtliche Evidenz.**');
    lines.push('');
    lines.push('| Beleg | Klasse | Rolle | Datum | Fundstelle | Dokumenttyp | Ausschnitt | Quelle (SHA-256) |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const evidence of item.evidence) lines.push(`| ${cell(evidence.title)} | ${evidence.evidenceStrength} | ${cell(evidence.role)} | ${evidence.date || '–'} | ${cell(evidence.citation) || '–'} | ${cell(evidence.documentType)} | ${cell(evidence.excerpt) || '–'} | ${evidence.url ? `<${evidence.url}>` : '–'} (${short(evidence.sha256)}) |`);
    lines.push('');
    lines.push('**Textintegrität.** ' + `${item.textIntegrity.identical ? 'identisch' : 'ABWEICHEND'}: ${item.textIntegrity.legacyChars} ↔ ${item.textIntegrity.currentChars} Zeichen; Verfahren: ${item.textIntegrity.method}.${item.textIntegrity.note ? ` ${item.textIntegrity.note}` : ''}`);
    lines.push('');
    if (item.legacyQuestions) {
      const q = item.legacyQuestions;
      lines.push('**Legacy-Fragen.**');
      lines.push('');
      lines.push(`- Text vollständig? ${yesNo(q.textComplete)} · hash-/semantisch identisch? ${yesNo(q.hashIdentical)}`);
      lines.push(`- Was kann Parser ${item.parserVersionCurrent.replace(/^.*\//u, '')} nicht einordnen? ${q.unclassified}`);
      lines.push(`- Nur Struktur oder möglicherweise Rechtsinhalt? ${q.impact === 'structure-only' ? 'nur Struktur (kein Textverlust, keine Textänderung)' : 'möglicherweise Rechtsinhalt'}`);
      lines.push(`- Amtlicher Source-Hash? \`${q.officialSourceHash}\` · Reviewfall? ${q.reviewCase}`);
      lines.push(`- Weiter auslieferbar? ${yesNo(q.deliverable)}`);
      lines.push('');
    }
    if (item.depublishQuestions) {
      const q = item.depublishQuestions;
      lines.push('**Depublikations-Fragen.**');
      lines.push('');
      lines.push(`- Welcher neue Beleg? ${q.newEvidence}`);
      lines.push(`- Klasse: ${q.evidenceClass} · amtliche Quelle: <${q.officialSource}>`);
      lines.push(`- Stammnorm eindeutig? ${yesNo(q.stemNormUnambiguous)} · relevantes Datum: ${q.relevantDate || '–'} · vor Stichtag ${report.baselineDate}? ${yesNo(q.beforeBaseline)}`);
      lines.push(`- Zwingend? ${yesNo(q.compelling)} · Unsicherheit: ${q.uncertainty}`);
      lines.push('');
    }
    lines.push(`**Kurzprüfung.** ${item.quickReview}`);
    lines.push('');
    lines.push(`**Begründung der Ausnahme.** ${item.reason}${item.followUp ? ` Folgeschritt: ${item.followUp}` : ''}`);
    lines.push('');
    lines.push(`**Vorgeschlagene Entscheidung.** \`${item.recommendation}\``);
    lines.push('');
    lines.push('**Freigabe.**');
    lines.push('');
    lines.push(`- Status: ${STATUS_LABEL[item.approvalStatus]}`);
    lines.push(`- Entscheidung Nutzer: ${item.decision ? (item.decision.status === 'approved' ? 'freigegeben' : 'nicht freigegeben') : '–'}`);
    lines.push(`- Begründung Nutzer: ${item.decision?.reason ?? '–'}`);
    lines.push(`- Datum: ${item.decision?.decidedAt ?? '–'}${item.decision?.approvedBy ? ` · durch: ${item.decision.approvedBy}` : ''}`);
    if (item.approvalHistory.length) lines.push(`- Verlauf: ${item.approvalHistory.map((step) => `${step.from} → ${step.to} (${step.at}${step.by ? `, ${step.by}` : ''}: ${oneLine(step.reason, 100)})`).join('; ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------------------------------ */
/* Daten aus dem Repository sammeln                                                             */

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectApprovalCases(root: string, registry: LegacyExceptionRegistry): Promise<ApprovalCaseInput[]> {
  const evidencePass = await readJsonFile<EvidencePassReport>(join(root, EVIDENCE_PASS_PATH));
  const passCases = new Map((evidencePass?.cases ?? []).map((item) => [item.sourceIdentity, item]));
  const cases: ApprovalCaseInput[] = [];
  for (const exception of registry.entries) {
    const manifest = await readManifestEntry(root, exception.sourceArea, exception.sourceIdentity);
    const shard = await readJsonFile<{ items?: ReviewItem[] }>(join(root, reviewShardPath(exception.sourceArea, exception.sourceIdentity)));
    const contentPresent = await exists(join(root, 'content', 'norms', TARGET_JURISDICTION, exception.targetSlug, 'meta.json'));
    cases.push({ exception, manifest, evidencePass: passCases.get(exception.sourceIdentity), reviewItems: shard?.items ?? [], contentPresent });
  }
  return cases;
}

/* ------------------------------------------------------------------------------------------ */
/* Entscheidung und Status                                                                      */

export interface ApprovalDecisionInput {
  sourceIdentity: string;
  decision: 'approve' | 'reject';
  reason: string;
  /** Nur, wenn ausdrücklich angegeben; nie automatisch ermittelt. */
  approvedBy?: string;
  now: string;
}

/** Wendet genau eine Entscheidung an (rein, ohne Datei-I/O); Ergebnis ist validiert. */
export function applyApprovalDecision(registry: LegacyExceptionRegistry, input: ApprovalDecisionInput): { registry: LegacyExceptionRegistry; before: ApprovalStatus; after: ApprovalStatus; exception: LegacyException } {
  if (!/^term:\d+$/u.test(input.sourceIdentity)) throw new Error(`--term erwartet term:<id>, erhalten ${input.sourceIdentity}`);
  if (input.decision !== 'approve' && input.decision !== 'reject') throw new Error('--decision erwartet approve|reject');
  const reason = input.reason?.trim();
  if (!reason) throw new Error('--reason (Begründung) ist Pflicht');
  if (input.approvedBy !== undefined && !input.approvedBy.trim()) throw new Error('--approved-by darf nicht leer sein');
  const index = registry.entries.findIndex((entry) => entry.sourceIdentity === input.sourceIdentity);
  if (index < 0) throw new Error(`keine Legacy-Ausnahme für ${input.sourceIdentity}`);
  const current = registry.entries[index]!;
  const after: ApprovalStatus = input.decision === 'approve' ? 'approved' : 'rejected';
  const by = input.approvedBy?.trim();
  const exception: LegacyException = {
    ...current,
    approvalStatus: after,
    decision: { status: after, decidedAt: input.now, reason, ...(by ? { approvedBy: by } : {}) },
    approvalHistory: [...(current.approvalHistory ?? []), { from: current.approvalStatus, to: after, at: input.now, reason, ...(by ? { by } : {}) }],
  };
  const entries = registry.entries.map((entry, position) => (position === index ? exception : entry));
  const next: LegacyExceptionRegistry = { ...registry, entries };
  validateLegacyExceptionRegistry(next);
  return { registry: next, before: current.approvalStatus, after, exception };
}

export interface ApprovalStatusSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  superseded: number;
  line: string;
  /** 0 = vollständig freigegeben, 2 = valide, Freigabe ausstehend (oder abgelehnt). */
  exitCode: 0 | 2;
}

export function summarizeApprovalStatus(registry: LegacyExceptionRegistry): ApprovalStatusSummary {
  const count = (status: ApprovalStatus): number => registry.entries.filter((entry) => entry.approvalStatus === status).length;
  const approved = count('approved');
  const pending = count('pending-human-review');
  const rejected = count('rejected');
  const superseded = count('superseded');
  const total = registry.entries.length;
  const line = `West Human Approval · ${total} exceptions · ${approved} approved · ${pending} pending · ${rejected} rejected${superseded ? ` · ${superseded} superseded` : ''}`;
  return { total, approved, pending, rejected, superseded, line, exitCode: pending === 0 && rejected === 0 ? 0 : 2 };
}

/* ------------------------------------------------------------------------------------------ */
/* CLI                                                                                         */

export async function runApprovalReportCommand(options: CliOptions, root: string, io: Io, now = new Date().toISOString()): Promise<number> {
  const registry = await readLegacyExceptions(root);
  const report = buildHumanApprovalReport(await collectApprovalCases(root, registry), { baselineDate: options.baseline, now });
  if (options.json) io.print(JSON.stringify(report, null, 2));
  else {
    const summary = report.summary;
    io.print(`Human Approval ${report.jurisdiction} · Stichtag ${report.baselineDate} · ${summary.total} Ausnahmen (${summary.deliverLegacy} deliver-legacy, ${summary.depublish} depublish) · ${summary.pending} ausstehend, ${summary.approved} freigegeben, ${summary.rejected} nicht freigegeben`);
    io.print(`Risiko: low ${summary.byRisk.low}, medium ${summary.byRisk.medium}, high ${summary.byRisk.high} · Empfehlungen: ${RECOMMENDATIONS.map((value) => `${value} ${summary.byRecommendation[value]}`).join(', ')}`);
    for (const item of report.items) io.print(`  ${String(item.order).padStart(2)}. ${item.sourceIdentity.padEnd(11)} ${item.exceptionType.padEnd(14)} ${item.riskClass.padEnd(6)} ${item.recommendation.padEnd(36)} ${STATUS_LABEL[item.approvalStatus]}`);
  }
  if (!options.write) {
    io.print(`Dry-run: nichts geschrieben (mit --write werden ${HUMAN_APPROVAL_MARKDOWN_PATH} und ${HUMAN_APPROVAL_JSON_PATH} geschrieben).`);
    return 0;
  }
  await writeJsonAtomic(join(root, HUMAN_APPROVAL_JSON_PATH), report);
  await writeFileAtomic(join(root, HUMAN_APPROVAL_MARKDOWN_PATH), renderHumanApprovalMarkdown(report));
  io.print(`Geschrieben: ${HUMAN_APPROVAL_MARKDOWN_PATH}, ${HUMAN_APPROVAL_JSON_PATH}`);
  return 0;
}

export async function runApprovalCommand(options: CliOptions, root: string, io: Io, now = new Date().toISOString()): Promise<number> {
  if (!options.term) throw new Error('approval benötigt --term term:<id>');
  if (options.decision !== 'approve' && options.decision !== 'reject') throw new Error('approval benötigt --decision approve|reject');
  if (!options.reason?.trim()) throw new Error('approval benötigt --reason "<Begründung>"');
  const registry = await readLegacyExceptions(root);
  const result = applyApprovalDecision(registry, { sourceIdentity: options.term, decision: options.decision, reason: options.reason, ...(options.approvedBy !== undefined ? { approvedBy: options.approvedBy } : {}), now });
  io.print(`${result.exception.sourceIdentity} (${result.exception.id}, ${result.exception.disposition}): ${result.before} → ${result.after}${result.exception.decision?.approvedBy ? ` durch ${result.exception.decision.approvedBy}` : ' (ohne Namensangabe)'}; Begründung: ${result.exception.decision?.reason}`);
  if (result.after === 'rejected') io.print('Hinweis: rejected bedeutet nur „nicht freigegeben“ – keine automatische Folgeaktion; die Ausnahme greift nicht mehr (fail-closed).');
  if (!options.write) {
    io.print(`Dry-run: ${LEGACY_EXCEPTIONS_PATH} nicht geändert (mit --write speichern).`);
    return 0;
  }
  await writeJsonAtomic(join(root, LEGACY_EXCEPTIONS_PATH), result.registry);
  io.print(`Gespeichert: ${LEGACY_EXCEPTIONS_PATH} (${summarizeApprovalStatus(result.registry).line}); Report neu erzeugen: npm run import:recht-nrw:approval-report -- --write`);
  return 0;
}

export async function runApprovalStatusCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  let registry: LegacyExceptionRegistry;
  try {
    registry = await readLegacyExceptions(root);
  } catch (error) {
    io.error(`West Human Approval · inkonsistent: ${(error as Error).message}`);
    return 1;
  }
  const unknown = registry.entries.filter((entry) => !(APPROVAL_STATUSES as readonly string[]).includes(entry.approvalStatus));
  if (unknown.length) {
    io.error(`West Human Approval · inkonsistent: unbekannter Status bei ${unknown.map((entry) => entry.sourceIdentity).join(', ')}`);
    return 1;
  }
  const summary = summarizeApprovalStatus(registry);
  if (options.json) io.print(JSON.stringify({ ...summary, status: summary.exitCode === 0 ? 'approved' : 'pending' }, null, 2));
  else io.print(summary.line);
  return summary.exitCode;
}
