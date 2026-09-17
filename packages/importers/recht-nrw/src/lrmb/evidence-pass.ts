/**
 * Evidence Pass – Offline-Simulation der Geltungsentscheidung (`lrmb/validity.ts`, Parser 1.3.0) über den gesamten
 * LRMB-Bestand: Manifest, netzfreier Quellcache (Fassungsseiten, Ministerialblatt-Einträge), Enumeration (Suchindex)
 * und Nachfolgebeleg-Index (`lrmb/successor-index.ts`). Es wird nichts geschrieben und keine Quelle nachgeladen; das
 * Ergebnis ist ein Vorher/Nachher-Bericht (`data/audits/recht-nrw/lrmb/EVIDENCE_PASS.{json,md}`):
 *
 *   vorher   Manifeststand (baselineStatus, validityProvenance, reconstructionStatus, importStatus)
 *   nachher  simulierte Entscheidung der neuen Engine je Regel (P1 eigene Außerkrafttretensformel, P2 Nachfolgebeleg,
 *            P3 Fünf-Bedingungen-Kontinuität, P4 Stammfundstelle) mit Beweisklassen und Widerspruchsbefunden
 *
 * Geltung ≠ Normativität: Für Einträge mit offener oder verneinter Normativität wird die Geltung nur informativ
 * simuliert; der Importstatus bliebe Review bzw. ausgeschlossen. Die Regeneration des Bestands
 * (`bulk --area lrmb --write --regenerate-stale`) führt der Koordinator aus.
 */
import { join } from 'node:path';

import type { EnumerationFile, SearchSignals } from '../common/enumeration.ts';
import { decodeHtml, type FetchedDocument } from '../common/fetcher.ts';
import { AUDIT_DIR, compareSourceIdentity, type EvidenceStrength, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import type { OfflineSourceReader } from '../common/review-sources.ts';
import { parseVersionUrl } from '../common/source-identity.ts';
import { selectSourceVersionAtBaseline } from '../common/version-selection.ts';
import { parseVersionPage, type RechtNrwVersionPage } from '../common/version-page.ts';
import { parseLrmbDocument } from './parser.ts';
import { resolveAmendmentEvidence, resolveBasePublication, smblNumberFor, sourceVersionCandidates, successorTargetFor } from './pipeline.ts';
import { matchSuccessors, type SuccessorIndex } from './successor-index.ts';
import { parseChangeNote, parseDecreeFromTitle, parsePublicationHistoryItem, parseValidityClauses, type ChangeNoteAmendment } from './text-metadata.ts';
import { assessLrmbValidity, type LrmbValidityAssessment, type LrmbValidityInput, type ValidityDecisionRule } from './validity.ts';

export const EVIDENCE_PASS_SCHEMA = 'recht-nrw-lrmb-evidence-pass/1' as const;
export const EVIDENCE_PASS_PATH = join(AUDIT_DIR, 'lrmb', 'EVIDENCE_PASS.json');
export const EVIDENCE_PASS_MARKDOWN_PATH = join(AUDIT_DIR, 'lrmb', 'EVIDENCE_PASS.md');

/** Ergebnisklasse der simulierten Geltungsentscheidung (Arbeitsstatistik, kein Rechtsstatus). */
export type EvidencePassOutcome =
  | 'not-at-baseline'
  | 'verified-active-at-baseline'
  | 'active-exact'
  | 'reconstruction-required'
  | 'contradictory'
  | 'undetermined'
  | 'not-simulated';

export interface EvidencePassCase {
  sourceIdentity: string;
  title: string;
  sourceUrl: string;
  sourceDocumentType: string;
  /** Normativität laut Manifest; nur `include` führt bei belegter Geltung zur Übernahme. */
  normativity: 'include' | 'exclude' | 'review';
  before: { importStatus: ManifestEntry['importStatus']; baselineStatus: ManifestEntry['baselineStatus']; provenance?: ManifestEntry['validityProvenance']; reconstructionStatus: ManifestEntry['reconstructionStatus']; historicalGap: boolean };
  after?: {
    baselineStatus: LrmbValidityAssessment['baselineStatus'];
    provenance: LrmbValidityAssessment['provenance'];
    textStatus: LrmbValidityAssessment['textStatus'];
    decisionRule: ValidityDecisionRule;
    findings: string[];
    /** Erste Meldung des Befunds `validity-undetermined` bzw. des Widerspruchs (Grund). */
    reason?: string;
    start?: LrmbValidityAssessment['start'];
    evidenceByStrength: Record<EvidenceStrength, number>;
    evidenceKinds: string[];
  };
  outcome: EvidencePassOutcome;
  /** Übergang Manifest → Simulation, z. B. „undetermined → not-active-at-baseline“. */
  transition: string;
  skipReason?: string;
  p1?: { date: string; via: string; phrase?: string; decided: boolean };
  p2?: { strong: number; supporting: number; insufficient: number; earliestEffective?: string; latestEffective?: string; decided: boolean };
  p3?: { identifiedAmendments: number; amendments: number; postBaselineIdentified: number; continuitySupported?: boolean; failedChecks?: string[] };
  p4?: { citation: string; identified: boolean; publishedOn?: string; derivedInForce: boolean; fetchRequired: boolean };
  /** Fehlender Beleg (bei `undetermined`): Grund aus der Engine, generalisiert. */
  missingEvidence?: string;
}

export interface EvidencePassSummary {
  entries: number;
  simulated: number;
  notSimulated: Record<string, number>;
  byNormativity: Record<string, number>;
  before: { baselineStatus: Record<string, number>; provenance: Record<string, number>; historicalGap: number };
  after: { baselineStatus: Record<string, number>; provenance: Record<string, number>; outcome: Record<string, number>; decisionRule: Record<string, number> };
  /** Nur Einträge mit Normativität `include` (Import entscheidbar). */
  afterNormative: { outcome: Record<string, number>; decisionRule: Record<string, number> };
  transitions: Record<string, number>;
  /** Historische Lücken (Befund validity-undetermined im Manifest): vorher/nachher. */
  historicalGap: { before: number; after: { notAtBaseline: number; verifiedActive: number; reconstructionRequired: number; contradictory: number; undetermined: number; notSimulated: number }; undeterminedByReason: Record<string, number> };
  rules: {
    p1: { detected: number; decided: number; contradicted: number; ambiguous: number };
    p2: { withStrong: number; withSupportingOnly: number; withInsufficientOnly: number; decidedBefore: number; decidedContinuity: number; contradicted: number };
    p3: { withIdentifiedAmendments: number; continuitySupported: number; continuityFailed: number; failedChecks: Record<string, number> };
    p4: { withBaseCitation: number; identified: number; derivedInForce: number; fetchRequired: number };
  };
}

export interface EvidencePassReport {
  schemaVersion: typeof EVIDENCE_PASS_SCHEMA;
  generatedAt: string;
  baselineDate: string;
  parserVersion: string;
  note: string;
  successorIndex: { generatedAt: string; sources: number; statements: number };
  summary: EvidencePassSummary;
  cases: EvidencePassCase[];
}

export interface EvidencePassInput {
  manifest: ImportManifest;
  reader: OfflineSourceReader;
  successorIndex: SuccessorIndex;
  enumeration?: EnumerationFile;
  baselineDate: string;
  parserVersion: string;
  now: string;
  log?: (message: string) => void;
}

function count(values: Array<string | undefined>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const value of values) map[value ?? '–'] = (map[value ?? '–'] ?? 0) + 1;
  return Object.fromEntries(Object.entries(map).sort(([left, a], [right, b]) => b - a || left.localeCompare(right)));
}

export function generalizeReason(message: string): string {
  return message
    .replace(/^Undatierter Datensatz ohne Beleg der Geltung am Stichtag:\s*/u, '')
    .replace(/\([^)]*\)/gu, '')
    .replace(/„[^“]*“/gu, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/gu, '<datum>')
    .replace(/\s+/gu, ' ')
    .replace(/\s+:/gu, ':')
    .trim()
    .replace(/[:;,.]+$/u, '');
}

function outcomeOf(assessment: LrmbValidityAssessment): EvidencePassOutcome {
  if (assessment.decisionRule === 'contradictory') return 'contradictory';
  if (assessment.baselineStatus === 'not-active-at-baseline') return 'not-at-baseline';
  if (assessment.baselineStatus === 'undetermined') return 'undetermined';
  if (assessment.textStatus === 'reconstruction-required') return 'reconstruction-required';
  return assessment.provenance === 'verified-active-at-baseline' ? 'verified-active-at-baseline' : 'active-exact';
}

async function readPage(reader: OfflineSourceReader, entry: ManifestEntry, role: 'version-page' | 'stem-page'): Promise<Array<{ document: FetchedDocument; page: RechtNrwVersionPage }>> {
  const raws = entry.rawDocuments.filter((raw) => raw.role === role);
  const pages: Array<{ document: FetchedDocument; page: RechtNrwVersionPage }> = [];
  for (const raw of raws) {
    const document = await reader.read(raw.url, raw.localSource);
    if (!document || !/html/iu.test(document.contentType)) continue;
    try {
      pages.push({ document, page: parseVersionPage(decodeHtml(document), raw.url) });
    } catch {
      // keine Fassungsadresse oder unlesbare Seite – wird als „nicht simuliert“ gezählt
    }
  }
  if (pages.length === 0 && role === 'version-page') {
    const document = await reader.read(entry.selectedVersionUrl);
    if (document && /html/iu.test(document.contentType)) {
      try {
        pages.push({ document, page: parseVersionPage(decodeHtml(document), entry.selectedVersionUrl) });
      } catch {
        // s. o.
      }
    }
  }
  return pages;
}

export async function runEvidencePass(input: EvidencePassInput): Promise<EvidencePassReport> {
  const baseline = input.baselineDate;
  const signalsByIdentity = new Map<string, SearchSignals>();
  for (const item of input.enumeration?.items ?? []) if (item.sourceIdentity && item.search) signalsByIdentity.set(item.sourceIdentity, item.search);
  const entries = input.manifest.entries.filter((entry) => entry.sourceArea === 'lrmb').sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const cases: EvidencePassCase[] = [];
  const offlineFetch = async (url: string): Promise<FetchedDocument | undefined> => input.reader.read(url);

  for (const [index, entry] of entries.entries()) {
    if (input.log && index % 500 === 0) input.log(`Evidence Pass ${index + 1}/${entries.length}`);
    const historicalGap = entry.findings.some((finding) => finding.code === 'validity-undetermined');
    const passCase: EvidencePassCase = {
      sourceIdentity: entry.sourceIdentity,
      title: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      sourceDocumentType: entry.sourceDocumentType,
      normativity: entry.normativity?.decision ?? 'review',
      before: { importStatus: entry.importStatus, baselineStatus: entry.baselineStatus, ...(entry.validityProvenance ? { provenance: entry.validityProvenance } : {}), reconstructionStatus: entry.reconstructionStatus, historicalGap },
      outcome: 'not-simulated',
      transition: `${entry.baselineStatus} → nicht simuliert`,
    };
    cases.push(passCase);
    const address = parseVersionUrl(entry.selectedVersionUrl) ?? parseVersionUrl(entry.sourceUrl);
    if (!address || address.section !== 'lrmb') {
      passCase.skipReason = 'keine LRMB-Fassungsadresse';
      continue;
    }
    const [selectedPage] = await readPage(input.reader, entry, 'version-page');
    if (!selectedPage) {
      passCase.skipReason = 'Fassungsseite nicht im Cache';
      continue;
    }
    const { page, document: pageDocument } = selectedPage;
    const undated = !page.address.pathDate;
    const stemPages = await readPage(input.reader, entry, 'stem-page');
    const latest = [selectedPage, ...stemPages].sort((left, right) => (right.page.validFrom ?? '').localeCompare(left.page.validFrom ?? ''))[0]!;
    const latestPage = latest.page;

    const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
    const titleDecree = parseDecreeFromTitle(page.title);
    const title = titleDecree?.title ?? page.title;
    const issuedOn = parse.head.issuedOn ?? titleDecree?.issuedOn ?? page.issuedOn;
    const changeNote = parse.changeNoteText ? parseChangeNote(parse.changeNoteText) : undefined;
    const latestParse = latestPage === page ? parse : latestPage.content.format === 'native' ? parseLrmbDocument(latestPage.content.bodyHtml) : undefined;
    const latestChangeNote = latestParse?.changeNoteText ? parseChangeNote(latestParse.changeNoteText) : undefined;
    const publicationItems = latestPage.changeHistoryItems.map((item) => parsePublicationHistoryItem(item)).filter((item): item is ChangeNoteAmendment => item !== undefined);
    const completenessText = latestPage.changeHistoryItems.find((item) => /Redaktioneller Hinweis/u.test(item));
    const baseCitation = changeNote?.base ?? latestChangeNote?.base;
    const resolved = await resolveAmendmentEvidence({ ...(changeNote ? { changeNote } : {}), ...(latestChangeNote ? { latestChangeNote } : {}), publicationItems, ...(issuedOn ? { issuedOn } : {}), ...(baseCitation ? { baseCitation } : {}), fetchGazette: offlineFetch });
    const amendments = [...resolved.amendments.values()].sort((left, right) => (left.note.decreeDate ?? '').localeCompare(right.note.decreeDate ?? ''));
    const clauses = parseValidityClauses(parse.bodyTexts);
    const selection = undated ? undefined : selectSourceVersionAtBaseline(sourceVersionCandidates(page), baseline);

    const validityInput: LrmbValidityInput = {
      baseline,
      page: { url: page.address.url, sha256: pageDocument.sha256, undated, hasLaterVersions: page.versions.some((version) => Boolean(page.validFrom) && version.validFrom > page.validFrom!) },
      clauses,
      amendments,
      versionStarts: page.versions.map((version) => version.validFrom),
      contraryTexts: [...new Set([...page.changeHistoryItems, ...latestPage.changeHistoryItems])].filter((item) => !/Redaktioneller Hinweis/u.test(item)),
    };
    if (page.validFrom) validityInput.page.validFrom = page.validFrom;
    if (page.validTo) validityInput.page.validTo = page.validTo;
    if (selection) validityInput.selection = selection;
    if (completenessText) validityInput.completenessNotice = { text: completenessText.replace(/^Redaktioneller Hinweis\s*:?\s*/u, ''), url: latestPage.address.url, sha256: latest.document.sha256 };
    if (changeNote) validityInput.changeNote = changeNote;
    if (issuedOn) validityInput.issuedOn = issuedOn;
    const signals = signalsByIdentity.get(entry.sourceIdentity);
    if (signals) {
      validityInput.indexSignals = {};
      if (signals.historically !== undefined) validityInput.indexSignals.historically = signals.historically;
      if (signals.outforceDate) validityInput.indexSignals.outforceDate = signals.outforceDate;
      if (signals.effectiveFrom) validityInput.indexSignals.effectiveFrom = signals.effectiveFrom;
    }
    const termId = entry.sourceIdentity.replace(/^term:/u, '');
    const target = successorTargetFor({ termId, pageUrl: page.address.url, title, ...(issuedOn ? { issuedOn } : {}), ...(baseCitation ? { baseCitation } : {}), fileReference: parse.head.fileReference ?? titleDecree?.fileReference, smblNumber: smblNumberFor([...page.attachments.map((attachment) => attachment.url), ...entry.rawDocuments.map((raw) => raw.url)], parse.classificationNumber) });
    const successors = matchSuccessors(input.successorIndex, target);
    if (successors.length > 0) validityInput.successors = successors;
    if (undated && baseCitation) {
      const needsFetch = clauses.inForce?.kind === 'day-after-publication';
      const publication = await resolveBasePublication({ citation: baseCitation, ...(issuedOn ? { issuedOn } : {}), fetch: needsFetch ? offlineFetch : undefined });
      validityInput.basePublication = publication.evidence;
      passCase.p4 = { citation: baseCitation.text, identified: publication.evidence.identified, derivedInForce: Boolean(publication.evidence.identified && publication.evidence.publishedOn && needsFetch), fetchRequired: needsFetch && !publication.evidence.identified, ...(publication.evidence.publishedOn ? { publishedOn: publication.evidence.publishedOn } : {}) };
    }

    const assessment = assessLrmbValidity(validityInput);
    const strengths: Record<EvidenceStrength, number> = { strong: 0, supporting: 0, insufficient: 0, contradictory: 0 };
    for (const evidence of assessment.evidence) if (evidence.strength) strengths[evidence.strength] += 1;
    const reasonFinding = assessment.findings.find((finding) => finding.code === 'validity-undetermined' || finding.code.startsWith('validity-') || finding.code.startsWith('selection-'));
    passCase.after = {
      baselineStatus: assessment.baselineStatus,
      provenance: assessment.provenance,
      textStatus: assessment.textStatus,
      decisionRule: assessment.decisionRule,
      findings: [...new Set(assessment.findings.map((finding) => finding.code))],
      ...(reasonFinding ? { reason: reasonFinding.message.slice(0, 300) } : {}),
      ...(assessment.start ? { start: assessment.start } : {}),
      evidenceByStrength: strengths,
      evidenceKinds: [...new Set(assessment.evidence.map((evidence) => evidence.kind))].sort(),
    };
    passCase.outcome = outcomeOf(assessment);
    passCase.transition = `${entry.baselineStatus} → ${assessment.baselineStatus}${assessment.baselineStatus === 'active-at-baseline' ? ` (${assessment.textStatus === 'reconstruction-required' ? 'reconstruction-required' : assessment.provenance})` : assessment.decisionRule === 'contradictory' ? ' (contradictory)' : ''}`;
    if (assessment.baselineStatus === 'undetermined' && reasonFinding) passCase.missingEvidence = generalizeReason(reasonFinding.message);
    const expiry = clauses.expiry ?? clauses.expiryConflicts?.[0];
    if (expiry) passCase.p1 = { date: expiry.date, via: clauses.expiryConflicts ? 'conflict' : expiry.via, ...(expiry.phrase ? { phrase: expiry.phrase } : {}), decided: assessment.decisionRule === 'P1-self-expiry' };
    if (successors.length > 0) {
      const strong = successors.filter((match) => match.strength === 'strong');
      const dates = strong.map((match) => match.effective.date!).sort();
      passCase.p2 = { strong: strong.length, supporting: successors.filter((match) => match.strength === 'supporting').length, insufficient: successors.filter((match) => match.strength === 'insufficient').length, ...(dates[0] ? { earliestEffective: dates[0], latestEffective: dates[dates.length - 1]! } : {}), decided: assessment.decisionRule === 'P2-successor-repeal' || assessment.decisionRule === 'P2-successor-continuity' };
    }
    if (amendments.length > 0) {
      const identified = amendments.filter((amendment) => amendment.identification?.ok);
      passCase.p3 = { identifiedAmendments: identified.length, amendments: amendments.length, postBaselineIdentified: identified.filter((amendment) => amendment.inForce && amendment.inForce > baseline).length, ...(assessment.continuity ? { continuitySupported: assessment.continuity.supported, failedChecks: assessment.continuity.checks.filter((check) => !check.ok).map((check) => check.id) } : {}) };
    }
  }

  const simulated = cases.filter((passCase) => passCase.after);
  const normative = simulated.filter((passCase) => passCase.normativity === 'include');
  const gaps = cases.filter((passCase) => passCase.before.historicalGap);
  const gapOutcome = (outcome: EvidencePassOutcome): number => gaps.filter((passCase) => passCase.outcome === outcome).length;
  const failedChecks = count(simulated.flatMap((passCase) => passCase.p3?.failedChecks ?? []));
  const summary: EvidencePassSummary = {
    entries: cases.length,
    simulated: simulated.length,
    notSimulated: count(cases.filter((passCase) => !passCase.after).map((passCase) => passCase.skipReason)),
    byNormativity: count(cases.map((passCase) => passCase.normativity)),
    before: { baselineStatus: count(cases.map((passCase) => passCase.before.baselineStatus)), provenance: count(cases.map((passCase) => passCase.before.provenance)), historicalGap: gaps.length },
    after: { baselineStatus: count(simulated.map((passCase) => passCase.after!.baselineStatus)), provenance: count(simulated.map((passCase) => passCase.after!.provenance)), outcome: count(simulated.map((passCase) => passCase.outcome)), decisionRule: count(simulated.map((passCase) => passCase.after!.decisionRule)) },
    afterNormative: { outcome: count(normative.map((passCase) => passCase.outcome)), decisionRule: count(normative.map((passCase) => passCase.after!.decisionRule)) },
    transitions: count(cases.map((passCase) => passCase.transition)),
    historicalGap: {
      before: gaps.length,
      after: { notAtBaseline: gapOutcome('not-at-baseline'), verifiedActive: gapOutcome('verified-active-at-baseline') + gapOutcome('active-exact'), reconstructionRequired: gapOutcome('reconstruction-required'), contradictory: gapOutcome('contradictory'), undetermined: gapOutcome('undetermined'), notSimulated: gapOutcome('not-simulated') },
      undeterminedByReason: count(gaps.filter((passCase) => passCase.outcome === 'undetermined').map((passCase) => passCase.missingEvidence)),
    },
    rules: {
      p1: { detected: simulated.filter((passCase) => passCase.p1).length, decided: simulated.filter((passCase) => passCase.p1?.decided).length, contradicted: simulated.filter((passCase) => passCase.after!.findings.includes('validity-expiry-contradicted')).length, ambiguous: simulated.filter((passCase) => passCase.after!.findings.includes('validity-expiry-ambiguous')).length },
      p2: { withStrong: simulated.filter((passCase) => (passCase.p2?.strong ?? 0) > 0).length, withSupportingOnly: simulated.filter((passCase) => passCase.p2 && passCase.p2.strong === 0 && passCase.p2.supporting > 0).length, withInsufficientOnly: simulated.filter((passCase) => passCase.p2 && passCase.p2.strong === 0 && passCase.p2.supporting === 0).length, decidedBefore: simulated.filter((passCase) => passCase.after!.decisionRule === 'P2-successor-repeal').length, decidedContinuity: simulated.filter((passCase) => passCase.after!.decisionRule === 'P2-successor-continuity').length, contradicted: simulated.filter((passCase) => passCase.after!.findings.includes('validity-successor-contradicted')).length },
      p3: { withIdentifiedAmendments: simulated.filter((passCase) => (passCase.p3?.identifiedAmendments ?? 0) > 0).length, continuitySupported: simulated.filter((passCase) => passCase.p3?.continuitySupported === true).length, continuityFailed: simulated.filter((passCase) => passCase.p3?.continuitySupported === false).length, failedChecks },
      p4: { withBaseCitation: simulated.filter((passCase) => passCase.p4).length, identified: simulated.filter((passCase) => passCase.p4?.identified).length, derivedInForce: simulated.filter((passCase) => passCase.p4?.derivedInForce).length, fetchRequired: simulated.filter((passCase) => passCase.p4?.fetchRequired).length },
    },
  };
  return {
    schemaVersion: EVIDENCE_PASS_SCHEMA,
    generatedAt: input.now,
    baselineDate: baseline,
    parserVersion: input.parserVersion,
    note: 'Offline-Simulation der Geltungsentscheidung (lrmb/validity.ts) über Cache und Manifest; nichts wurde geschrieben oder nachgeladen. Ergebnisse sind Arbeitsstatistik; verbindlich wird die Entscheidung erst durch die Regeneration des Bestands. Geltung ≠ Normativität.',
    successorIndex: { generatedAt: input.successorIndex.generatedAt, sources: input.successorIndex.sources.length, statements: input.successorIndex.statements.length },
    summary,
    cases,
  };
}

const cell = (value: unknown): string => String(value ?? '–').replace(/\|/gu, '¦').replace(/\n/gu, ' ');

export function renderEvidencePassMarkdown(report: EvidencePassReport, limit = 200): string {
  const lines: string[] = [];
  const { summary } = report;
  lines.push('# Evidence Pass – Historische-Lücken-Reevaluation (Offline-Simulation)', '', `Stand: ${report.generatedAt}, Stichtag ${report.baselineDate}, Engine ${report.parserVersion}. ${report.note}`, '');
  lines.push(`Nachfolgebeleg-Index: ${report.successorIndex.sources} zitierende Quellen, ${report.successorIndex.statements} Aussagen (Stand ${report.successorIndex.generatedAt}).`, '');
  const table = (title: string, record: Record<string, number>): void => {
    lines.push(`### ${title}`, '', '| Wert | Fälle |', '| --- | --- |');
    for (const [key, value] of Object.entries(record)) lines.push(`| ${cell(key)} | ${value} |`);
    lines.push('');
  };
  lines.push('## Bestand', '', `- LRMB-Einträge: ${summary.entries}; simuliert: ${summary.simulated}; nicht simuliert: ${Object.entries(summary.notSimulated).map(([key, value]) => `${key} ${value}`).join(', ') || '–'}`, `- Normativität: ${Object.entries(summary.byNormativity).map(([key, value]) => `${key} ${value}`).join(', ')}`, '');
  table('Vorher: baselineStatus (Manifest)', summary.before.baselineStatus);
  table('Nachher: baselineStatus (Simulation)', summary.after.baselineStatus);
  table('Nachher: Ergebnisklasse (alle simulierten Einträge)', summary.after.outcome);
  table('Nachher: Ergebnisklasse (nur Normativität include – importentscheidend)', summary.afterNormative.outcome);
  table('Entscheidungsregel (alle simulierten Einträge)', summary.after.decisionRule);
  table('Übergänge Manifest → Simulation', summary.transitions);
  const gap = summary.historicalGap;
  lines.push('## Historische Lücken (Befund validity-undetermined im Manifest)', '', `Vorher: ${gap.before} Fälle. Nachher: automatisch not-at-baseline ${gap.after.notAtBaseline}, verified-active-at-baseline ${gap.after.verifiedActive}, reconstruction-required ${gap.after.reconstructionRequired}, contradictory (Review) ${gap.after.contradictory}, weiterhin undetermined ${gap.after.undetermined}, nicht simuliert ${gap.after.notSimulated}.`, '');
  table('Weiterhin undetermined – fehlender Beleg', gap.undeterminedByReason);
  lines.push('## Regeln', '', `- P1 eigene Außerkrafttretensformel: erkannt ${summary.rules.p1.detected}, entscheidend ${summary.rules.p1.decided}, widersprochen ${summary.rules.p1.contradicted}, mehrdeutig ${summary.rules.p1.ambiguous}`, `- P2 Nachfolgebelege: mit starkem Beleg ${summary.rules.p2.withStrong}, nur unterstützend ${summary.rules.p2.withSupportingOnly}, nur unzureichend (Datumsgleichheit) ${summary.rules.p2.withInsufficientOnly}; entscheidend vor dem Stichtag ${summary.rules.p2.decidedBefore}, als Fortbestandsbeleg ${summary.rules.p2.decidedContinuity}, widersprochen ${summary.rules.p2.contradicted}`, `- P3 Ministerialblatt-Kontinuität: mit zugeordneten Änderungen ${summary.rules.p3.withIdentifiedAmendments}, Kontinuität bestanden ${summary.rules.p3.continuitySupported}, gescheitert ${summary.rules.p3.continuityFailed} (${Object.entries(summary.rules.p3.failedChecks).map(([key, value]) => `${key} ${value}`).join(', ') || '–'})`, `- P4 Stammfundstelle: mit Fundstelle ${summary.rules.p4.withBaseCitation}, Eintrag identifiziert ${summary.rules.p4.identified}, Inkrafttreten abgeleitet ${summary.rules.p4.derivedInForce}, Abruf erforderlich (nicht im Cache) ${summary.rules.p4.fetchRequired}`, '');
  const section = (title: string, predicate: (passCase: EvidencePassCase) => boolean, detail: (passCase: EvidencePassCase) => string): void => {
    const selected = report.cases.filter(predicate);
    if (selected.length === 0) return;
    lines.push(`## ${title} (${selected.length}${selected.length > limit ? `, gezeigt ${limit}` : ''})`, '', '| Term | Titel | Normativität | Übergang | Detail |', '| --- | --- | --- | --- | --- |');
    for (const passCase of selected.slice(0, limit)) lines.push(`| ${passCase.sourceIdentity} | ${cell(passCase.title).slice(0, 80)} | ${passCase.normativity} | ${cell(passCase.transition)} | ${cell(detail(passCase)).slice(0, 220)} |`);
    lines.push('');
  };
  section('P1: eigene Außerkrafttretensformel entscheidet (not-at-baseline)', (passCase) => passCase.p1?.decided === true, (passCase) => `${passCase.p1!.date} („${passCase.p1!.phrase ?? ''}“, ${passCase.p1!.via})`);
  section('P2: Nachfolgebeleg entscheidet', (passCase) => passCase.p2?.decided === true, (passCase) => `${passCase.after!.decisionRule}; wirksam ${passCase.p2!.earliestEffective ?? '?'}; ${passCase.after!.reason ?? ''}`);
  section('P2: starker Nachfolgebeleg ohne Entscheidung (Widerspruch oder Beginn fehlt)', (passCase) => (passCase.p2?.strong ?? 0) > 0 && passCase.p2?.decided !== true, (passCase) => `${passCase.after!.decisionRule}; wirksam ${passCase.p2!.earliestEffective ?? '?'}; ${passCase.after!.reason ?? passCase.missingEvidence ?? ''}`);
  section('Widersprüchliche Belege (Review)', (passCase) => passCase.outcome === 'contradictory', (passCase) => passCase.after!.reason ?? '');
  section('P3: Kontinuität über Ministerialblatt bestanden', (passCase) => passCase.after?.decisionRule === 'P3-amendment-continuity', (passCase) => `${passCase.after!.provenance}/${passCase.after!.textStatus}; Beginn ${passCase.after!.start?.date ?? '?'} (${passCase.after!.start?.derivation ?? ''})`);
  section('P4: Inkrafttreten über Stammfundstelle abgeleitet', (passCase) => passCase.p4?.derivedInForce === true, (passCase) => `${passCase.p4!.citation}, veröffentlicht ${passCase.p4!.publishedOn}`);
  section('Ohne Entscheidung mangels Beleg (historische Lücken, weiterhin undetermined)', (passCase) => passCase.before.historicalGap && passCase.outcome === 'undetermined', (passCase) => `${passCase.missingEvidence ?? ''}${passCase.p2 ? `; Nachfolgebelege stark ${passCase.p2.strong}/unterstützend ${passCase.p2.supporting}/unzureichend ${passCase.p2.insufficient}` : ''}${passCase.p4?.fetchRequired ? '; P4-Abruf offen' : ''}`);
  lines.push(`Vollständige Fallliste: \`${EVIDENCE_PASS_PATH.replace(/\\/gu, '/')}\` (Feld \`cases\`, deterministisch nach Term-ID sortiert).`, '');
  return `${lines.join('\n')}\n`;
}
