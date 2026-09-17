/**
 * Review-Report des RECHT.NRW-Imports (`review-report`): Statistik der Review-Queue, reproduzierbare
 * Prioritäten, Arbeitslisten (Markdown + JSON), PDF-Fälle, historische LRMB-Lücken, Nachfolgebeleg-Index,
 * Evidence Pass (Offline-Simulation der Geltungsentscheidung) und die Gruppierung der Rekonstruktionsqueue.
 *
 * Ausgaben (mit `--write`), deterministische Teilreports statt einer monolithischen Analyse:
 *   data/audits/recht-nrw/review/summary.json                 Kennzahlen, Kategorien, Kombinationen, Dateiverzeichnis
 *   data/audits/recht-nrw/review/by-category/<bereich>-<kategorie>.json, groups-*.json
 *   data/audits/recht-nrw/review/by-source/<bereich>/<importstatus>/<dokumenttyp>.json
 *   data/audits/recht-nrw/review/priorities.json              Score je Stammnorm mit Faktoren
 *   data/audits/recht-nrw/review/work-lists/<liste>.{json,md} Top-Listen (historische Lücken, PDF-only,
 *                                                             Rekonstruktionen, Normativität, Institutionen, Parser)
 *   data/audits/recht-nrw/REVIEW_SUMMARY.md                   kompakte Zusammenfassung
 *   data/audits/recht-nrw/lrmb/PDF_FAELLE.{json,md}           PDF-Fälle mit Transkriptionspriorität
 *   data/audits/recht-nrw/lrmb/historical-gap.json + HISTORICAL_GAP_STATISTIK.md
 *   data/audits/recht-nrw/lrmb/successor-index.json           Nachfolgebeleg-Index (liest die Pipeline, P2)
 *   data/audits/recht-nrw/lrmb/EVIDENCE_PASS.{json,md}        Vorher/Nachher der Geltungsentscheidung (Simulation)
 *
 * Alles ist lesend und netzfrei (Quellcache im Offline-Modus). Es wird keine Entscheidung getroffen, kein
 * Review-Fall verändert und kein Belegstandard abgesenkt.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { CliOptions, Io } from '../cli.ts';
import { EVIDENCE_PASS_MARKDOWN_PATH, EVIDENCE_PASS_PATH, renderEvidencePassMarkdown, runEvidencePass, type EvidencePassReport } from '../lrmb/evidence-pass.ts';
import { analyzeHistoricalGaps, renderHistoricalGapMarkdown, type HistoricalGapAnalysis, type HistoricalGapCase } from '../lrmb/historical-gap.ts';
import { LRMB_PARSER_VERSION } from '../lrmb/parser.ts';
import { buildPdfCasesReport, renderPdfCasesMarkdown, type PdfCasesReport } from '../lrmb/pdf-cases.ts';
import { buildReconstructionQueue, listRecipes, type ReconstructionQueue } from '../lrmb/reconstruction-queue.ts';
import { buildSuccessorIndex, SUCCESSOR_INDEX_PATH, type SuccessorIndex } from '../lrmb/successor-index.ts';
import { writeFileAtomic, writeJsonAtomic } from './atomic.ts';
import { readEnumeration, type EnumerationFile, type SearchSignals } from './enumeration.ts';
import { AUDIT_DIR, compareSourceIdentity, readManifest, SOURCE_AREAS, type ImportManifest, type SourceArea } from './manifest.ts';
import { analyzeReviewQueue, splitReviewAnalysis, type IdentitySummary, type ReviewAnalysis } from './review-analysis.ts';
import { buildReferenceCounts, reviewPriority, type PriorityBand, type ReviewPriority } from './review-priority.ts';
import { readReviewQueue, type ReviewCategory, type ReviewItem, type ReviewQueue } from './review-queue.ts';
import { createOfflineSourceReader, type OfflineSourceReader } from './review-sources.ts';

export const REVIEW_REPORT_SCHEMA = 'recht-nrw-review-report/1' as const;
export const REVIEW_REPORT_DIR = join(AUDIT_DIR, 'review');
export const REVIEW_WORK_LIST_DIR = join(REVIEW_REPORT_DIR, 'work-lists');
export const REVIEW_SUMMARY_PATH = join(AUDIT_DIR, 'REVIEW_SUMMARY.md');
export const PDF_CASES_PATH = join(AUDIT_DIR, 'lrmb', 'PDF_FAELLE.json');
export const PDF_CASES_MARKDOWN_PATH = join(AUDIT_DIR, 'lrmb', 'PDF_FAELLE.md');
export const HISTORICAL_GAP_PATH = join(AUDIT_DIR, 'lrmb', 'historical-gap.json');
export const HISTORICAL_GAP_MARKDOWN_PATH = join(AUDIT_DIR, 'lrmb', 'HISTORICAL_GAP_STATISTIK.md');

export interface WorkListItem {
  rank: number;
  sourceIdentity: string;
  sourceArea: SourceArea;
  title?: string;
  sourceUrl: string;
  targetSlug?: string;
  importStatus?: string;
  score: number;
  band: PriorityBand;
  factors: string[];
  blockingCategories: ReviewCategory[];
  nonBlockingCategories: ReviewCategory[];
  openFindings: number;
  /** Listenspezifische Angaben (z. B. Belegklasse, Seiten, Richtung). */
  detail: Record<string, string | number | boolean | undefined>;
  example?: { id: string; summary: string };
}

export interface WorkList {
  name: string;
  title: string;
  description: string;
  total: number;
  items: WorkListItem[];
}

export interface GroupedWorkList {
  name: string;
  title: string;
  description: string;
  total: number;
  groups: Array<{ key: string; label: string; identities: number; occurrences?: number; blocking?: number; examples: string[] }>;
}

export interface ReviewReport {
  schemaVersion: typeof REVIEW_REPORT_SCHEMA;
  generatedAt: string;
  baselineDate: string;
  analysis: ReviewAnalysis;
  priorities: Array<{ sourceIdentity: string; sourceArea: SourceArea; score: number; band: PriorityBand; factors: string[] }>;
  bandDistribution: Record<PriorityBand, number>;
  workLists: WorkList[];
  groupedLists: GroupedWorkList[];
  pdfCases: PdfCasesReport;
  historicalGaps: HistoricalGapAnalysis;
  reconstructionQueue: ReconstructionQueue;
  /** Nachfolgebeleg-Index (P2), aus dem netzfreien Bestand; leer ohne Quellzugriff. */
  successorIndex: SuccessorIndex;
  /** Offline-Simulation der Geltungsentscheidung (nur mit Quellzugriff). */
  evidencePass?: EvidencePassReport;
}

export interface ReviewReportInput {
  root: string;
  manifest: ImportManifest;
  queue: ReviewQueue;
  enumerations: Partial<Record<SourceArea, EnumerationFile>>;
  recipes: ReadonlySet<string>;
  baselineDate: string;
  now: string;
  limit: number;
  reader?: OfflineSourceReader;
  log?: (message: string) => void;
}

function signalsByIdentity(enumerations: Partial<Record<SourceArea, EnumerationFile>>): Map<string, SearchSignals> {
  const map = new Map<string, SearchSignals>();
  for (const file of Object.values(enumerations)) for (const item of file?.items ?? []) if (item.sourceIdentity && item.search) map.set(item.sourceIdentity, item.search);
  return map;
}

export function computePriorities(input: Pick<ReviewReportInput, 'manifest' | 'queue' | 'enumerations' | 'baselineDate'>): Map<string, ReviewPriority> {
  const references = buildReferenceCounts(input.manifest.entries);
  const signals = signalsByIdentity(input.enumerations);
  const itemsByIdentity = new Map<string, ReviewItem[]>();
  for (const item of input.queue.items) itemsByIdentity.set(item.sourceIdentity, [...(itemsByIdentity.get(item.sourceIdentity) ?? []), item]);
  const priorities = new Map<string, ReviewPriority>();
  const identities = new Set([...input.manifest.entries.map((entry) => entry.sourceIdentity), ...itemsByIdentity.keys()]);
  const entries = new Map(input.manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  for (const identity of [...identities].sort(compareSourceIdentity)) {
    const context: Parameters<typeof reviewPriority>[2] = { baselineDate: input.baselineDate };
    const referenceCount = references.get(identity);
    if (referenceCount !== undefined) context.referenceCount = referenceCount;
    const indexSignals = signals.get(identity);
    if (indexSignals) context.indexSignals = indexSignals;
    priorities.set(identity, reviewPriority(entries.get(identity), itemsByIdentity.get(identity) ?? [], context));
  }
  return priorities;
}

function toWorkList(name: string, title: string, description: string, summaries: IdentitySummary[], priorities: Map<string, ReviewPriority>, limit: number, detail: (summary: IdentitySummary) => WorkListItem['detail']): WorkList {
  const ranked = [...summaries].sort((left, right) => (priorities.get(right.sourceIdentity)?.score ?? 0) - (priorities.get(left.sourceIdentity)?.score ?? 0) || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const items = ranked.slice(0, limit).map((summary, index): WorkListItem => {
    const priority = priorities.get(summary.sourceIdentity) ?? { score: 0, band: 'D' as const, factors: [] };
    const item: WorkListItem = { rank: index + 1, sourceIdentity: summary.sourceIdentity, sourceArea: summary.sourceArea, sourceUrl: summary.sourceUrl, score: priority.score, band: priority.band, factors: priority.factors, blockingCategories: summary.blockingCategories, nonBlockingCategories: summary.nonBlockingCategories, openFindings: summary.open, detail: detail(summary) };
    if (summary.title) item.title = summary.title;
    if (summary.targetSlug) item.targetSlug = summary.targetSlug;
    if (summary.importStatus) item.importStatus = summary.importStatus;
    const example = summary.examples[0];
    if (example) item.example = { id: example.id, summary: example.summary };
    return item;
  });
  return { name, title, description, total: summaries.length, items };
}

export async function buildReviewReport(input: ReviewReportInput): Promise<ReviewReport> {
  const log = input.log ?? (() => undefined);
  log('Statistik der Review-Queue');
  const analysis = analyzeReviewQueue(input.queue, input.manifest, input.now);
  const priorities = computePriorities(input);
  const bandDistribution: Record<PriorityBand, number> = { A: 0, B: 0, C: 0, D: 0 };
  const openIdentities = new Set(analysis.identities.map((summary) => summary.sourceIdentity));
  for (const [identity, priority] of priorities) if (openIdentities.has(identity)) bandDistribution[priority.band] += 1;

  log('PDF-Fälle');
  const pdfCases = await buildPdfCasesReport({ manifest: input.manifest, priorities, now: input.now, ...(input.reader ? { reader: input.reader } : {}), log });
  log('Nachfolgebeleg-Index');
  const successorIndex = await buildSuccessorIndex({ manifest: input.manifest, now: input.now, ...(input.reader ? { reader: input.reader } : {}), log });
  log('Historische LRMB-Lücken');
  const historicalGaps = await analyzeHistoricalGaps({ manifest: input.manifest, priorities, root: input.root, baselineDate: input.baselineDate, now: input.now, successorIndex, ...(input.enumerations.lrmb ? { enumeration: input.enumerations.lrmb } : {}), ...(input.reader ? { reader: input.reader } : {}), log });
  let evidencePass: EvidencePassReport | undefined;
  if (input.reader) {
    log('Evidence Pass (Offline-Simulation der Geltungsentscheidung)');
    evidencePass = await runEvidencePass({ manifest: input.manifest, reader: input.reader, successorIndex, baselineDate: input.baselineDate, parserVersion: LRMB_PARSER_VERSION, now: input.now, ...(input.enumerations.lrmb ? { enumeration: input.enumerations.lrmb } : {}), log });
  }
  const gapByIdentity = new Map(historicalGaps.cases.map((gapCase) => [gapCase.sourceIdentity, gapCase]));
  const reconstructionQueue = buildReconstructionQueue(input.manifest, input.queue, input.recipes);
  const queueByIdentity = new Map(reconstructionQueue.items.map((item) => [item.sourceIdentity, item]));
  const pdfByIdentity = new Map(pdfCases.cases.map((pdfCase) => [pdfCase.sourceIdentity, pdfCase]));
  const entries = new Map(input.manifest.entries.map((entry) => [entry.sourceIdentity, entry]));

  const has = (summary: IdentitySummary, category: ReviewCategory, blockingOnly = false): boolean => (blockingOnly ? (summary.categories[category]?.blocking ?? 0) > 0 : Boolean(summary.categories[category]));
  const gapDetail = (summary: IdentitySummary): WorkListItem['detail'] => {
    const gapCase: HistoricalGapCase | undefined = gapByIdentity.get(summary.sourceIdentity);
    return { grund: gapCase?.reason, belegklasse: gapCase?.evidenceClass, ausfertigung: gapCase?.issuedOn, smbl: gapCase?.smblNumber, fundstellenverlauf: gapCase?.changeNote ? `${gapCase.changeNote.amendments} Änderung(en), ${gapCase.changeNote.identified} zugeordnet` : undefined, nachfolgebelege: gapCase?.successorEvidence.length, selbstaussage: gapCase?.selfStatements.find((statement) => statement.effective?.date)?.text };
  };
  const pdfSummaries = analysis.identities.filter((summary) => pdfByIdentity.has(summary.sourceIdentity) && (has(summary, 'attachment', true) || entries.get(summary.sourceIdentity)?.textCompleteness === 'pdf-only' || entries.get(summary.sourceIdentity)?.textCompleteness === 'pdf-only-essential-attachments' || entries.get(summary.sourceIdentity)?.textCompleteness === 'essential-attachment-missing'));
  const pdfPriorities = new Map([...priorities.entries()].map(([identity, priority]) => [identity, pdfByIdentity.get(identity)?.transcriptionPriority ?? priority]));

  const workLists: WorkList[] = [
    toWorkList('historische-luecken', 'Top historische Lücken (LRMB, historical-gap)', 'Undatierte Altdatensätze ohne Beleg der Geltung am Stichtag, geordnet nach Review-Priorität; Belegklasse aus der Lückenanalyse (lrmb/historical-gap.json).', analysis.identities.filter((summary) => has(summary, 'historical-gap')), priorities, input.limit, gapDetail),
    toWorkList('pdf-only', 'Top PDF-only-Fälle (Transkriptionspriorität)', 'Normtext oder Regelungsgehalt nur als PDF bzw. blockierende Anlagenbefunde, geordnet nach Transkriptionspriorität (lrmb/PDF_FAELLE.json).', pdfSummaries, pdfPriorities, input.limit, (summary) => {
      const pdfCase = pdfByIdentity.get(summary.sourceIdentity);
      return { regelungsgehalt: pdfCase?.mainText, pdfDateien: pdfCase?.pdfDocuments, seiten: pdfCase?.pagesKnown, textlayer: pdfCase ? `${pdfCase.textLayerDocuments}/${pdfCase.pdfDocuments}` : undefined, zeichenGeschaetzt: pdfCase?.estimatedTextChars };
    }),
    toWorkList('rekonstruktionen', 'Top Rekonstruktionen (reconstruction-required / -uncertain)', 'Fälle mit Rekonstruktionsbedarf oder unsicherer Rekonstruktion, geordnet nach Review-Priorität; Richtung und Quellenlage aus der Rekonstruktionsqueue.', analysis.identities.filter((summary) => has(summary, 'reconstruction-required') || has(summary, 'reconstruction-uncertain')), priorities, input.limit, (summary) => {
      const item = queueByIdentity.get(summary.sourceIdentity);
      return { queueStatus: item?.status, richtung: item?.direction, aenderungen: item?.amendments, quellenVollstaendig: item?.sourceCompleteness, befehle: item?.estimatedSteps, queueScore: item?.priority.score, blocker: item?.blockers.slice(0, 2).join(' | ') };
    }),
    toWorkList('normativitaet', 'Top Normativitätsfälle (normativity)', 'Dokumente, deren Normativität manuell zu entscheiden ist, geordnet nach Review-Priorität; Gründe aus dem Manifest.', analysis.identities.filter((summary) => has(summary, 'normativity')), priorities, input.limit, (summary) => {
      const entry = entries.get(summary.sourceIdentity);
      return { portaltyp: entry?.sourceType, dokumenttyp: entry?.sourceDocumentType, gruende: entry?.normativity?.reasons.join('; '), stichtag: entry?.baselineStatus };
    }),
    toWorkList('institutionen-normen', 'Top Normen mit Institutionen-Mapping (institution-mapping)', 'Stammnormen mit offenen Erlassorgan- oder Bezeichnungsentscheidungen, geordnet nach Review-Priorität.', analysis.identities.filter((summary) => has(summary, 'institution-mapping')), priorities, input.limit, (summary) => ({ befunde: summary.categories['institution-mapping']?.open, erlassorgan: summary.examples.some((example) => example.category === 'institution-mapping' && /Erlassorgan|enacting/iu.test(example.summary)) })),
    toWorkList('parser-normen', 'Top Parserfälle (unknown-structure / text-integrity)', 'Stammnormen mit Struktur- oder Integritätsbefunden, geordnet nach Review-Priorität; blockierende Fälle zuerst über den Score.', analysis.identities.filter((summary) => has(summary, 'unknown-structure') || has(summary, 'text-integrity')), priorities, input.limit, (summary) => ({ blockierend: (summary.categories['unknown-structure']?.blocking ?? 0) + (summary.categories['text-integrity']?.blocking ?? 0), befunde: (summary.categories['unknown-structure']?.open ?? 0) + (summary.categories['text-integrity']?.open ?? 0) })),
  ];
  const groupedLists: GroupedWorkList[] = [
    { name: 'institutionen-bezeichnungen', title: 'Top Institutionen-Mappings (Bezeichnungen über alle Normen)', description: 'Bezeichnungen ohne automatische Entsprechung, gruppiert über alle Stammnormen (nur Darstellung; jede Gruppe nennt Beispiel-Terms).', total: analysis.groups.institutionTerms.length, groups: analysis.groups.institutionTerms.slice(0, input.limit).map((group) => ({ key: `${group.detectionCategory}|${group.term}`, label: `${group.term} [${group.detectionCategory}]`, identities: group.identities, occurrences: group.occurrences, examples: group.examples })) },
    { name: 'parser-muster', title: 'Top Parserfälle (Befundmuster)', description: 'Struktur- und Integritätsbefunde nach Code und generalisierter Meldung; ein behobener Parserfehler löst alle Stammnormen der Gruppe.', total: analysis.groups.parserFindings.length, groups: analysis.groups.parserFindings.slice(0, input.limit).map((group) => ({ key: group.pattern, label: group.pattern, identities: group.identities, occurrences: group.open, blocking: group.blocking, examples: group.examples })) },
    { name: 'anlagen-muster', title: 'Anlagenbefunde (Muster)', description: 'Anlagenbefunde nach generalisierter Meldung.', total: analysis.groups.attachments.length, groups: analysis.groups.attachments.slice(0, input.limit).map((group) => ({ key: group.pattern, label: group.pattern, identities: group.identities, occurrences: group.open, blocking: group.blocking, examples: group.examples })) },
  ];

  const priorityRows = [...priorities.entries()].filter(([identity]) => openIdentities.has(identity)).map(([sourceIdentity, priority]) => ({ sourceIdentity, sourceArea: (entries.get(sourceIdentity)?.sourceArea ?? analysis.identities.find((summary) => summary.sourceIdentity === sourceIdentity)?.sourceArea ?? 'lrmb') as SourceArea, ...priority })).sort((left, right) => right.score - left.score || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));

  const report: ReviewReport = { schemaVersion: REVIEW_REPORT_SCHEMA, generatedAt: input.now, baselineDate: input.baselineDate, analysis, priorities: priorityRows, bandDistribution, workLists, groupedLists, pdfCases, historicalGaps, reconstructionQueue, successorIndex };
  if (evidencePass) report.evidencePass = evidencePass;
  return report;
}

// --- Markdown ------------------------------------------------------------------------------------

const cell = (value: unknown): string => String(value ?? '–').replace(/\|/gu, '¦').replace(/\n/gu, ' ');

export function renderWorkListMarkdown(list: WorkList): string {
  const detailKeys = [...new Set(list.items.flatMap((item) => Object.keys(item.detail).filter((key) => item.detail[key] !== undefined)))];
  const lines = [`# ${list.title}`, '', list.description, '', `Gesamt: ${list.total} Stammnormen; gezeigt: ${list.items.length}. Score = Arbeitspriorität (kein Rechtsstatus), Bänder A ≥ 60, B ≥ 40, C ≥ 20, D darunter.`, ''];
  lines.push(`| Rang | Term | Bereich | Titel | Score | Blocker | weitere Befunde | Status | ${detailKeys.join(' | ')}${detailKeys.length ? ' | ' : ''}Beispiel | Faktoren |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |${detailKeys.map(() => ' --- |').join('')} --- | --- |`);
  for (const item of list.items) {
    const details = detailKeys.map((key) => cell(item.detail[key]).slice(0, 120));
    lines.push(`| ${item.rank} | ${item.sourceIdentity} | ${item.sourceArea} | ${cell(item.title).slice(0, 90)} | ${item.score} (${item.band}) | ${item.blockingCategories.join(', ') || '–'} | ${item.nonBlockingCategories.join(', ') || '–'} | ${cell(item.importStatus)} | ${details.join(' | ')}${detailKeys.length ? ' | ' : ''}${item.example ? `${cell(item.example.summary).slice(0, 140)}` : '–'} | ${item.factors.join('; ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderGroupedListMarkdown(list: GroupedWorkList): string {
  const lines = [`# ${list.title}`, '', list.description, '', `Gruppen gesamt: ${list.total}; gezeigt: ${list.groups.length}.`, '', '| Rang | Gruppe | Stammnormen | Vorkommen | blockierend | Beispiele |', '| --- | --- | --- | --- | --- | --- |'];
  for (const [index, group] of list.groups.entries()) lines.push(`| ${index + 1} | ${cell(group.label).slice(0, 140)} | ${group.identities} | ${group.occurrences ?? '–'} | ${group.blocking ?? '–'} | ${group.examples.join(', ')} |`);
  return `${lines.join('\n')}\n`;
}

const PRIORITY_MODEL = [
  'Quelltyp: Gesetz +30, Rechtsverordnung +25, Allgemeine VwV +25, VwV +22, Durchführungserlass +18, Runderlass +15, Richtlinie +15, sonstige +8; Portaltyp Bekanntmachung −10',
  'Stichtagsrelevanz: am Stichtag geltend +25, unbestimmt +10, nicht geltend −40, ausgeschlossen −40',
  'Gesetzesbezug +10; Verwaltungsrelevanz (breiter Anwenderkreis laut Titel) +5; Referenzhäufigkeit +3 je Titelnennung (max. +15)',
  'Blocker: mindestens ein blockierender Befund +15 (Norm fehlt im Bestand)',
  'Beleglage: starke Belege +8, nur unterstützende +3, keine Belege bei unbestimmter Geltung −5',
  'PDF-only −10 und −1 je 20 Seiten (max. −15); wesentliche Anlage nicht verlinkt −15',
  'Rekonstruktion: −1 je 5 Befehle (max. −20), Änderungsquellen unvollständig −5, Rekonstruktion unsicher −5',
  'Parserbefund blockierend +5 (systematisch behebbar); −1 je weiterem offenen Befund (max. −10)',
  'Altdatensatz vor 1990 −5; Suchindex-Außerkrafttreten vor dem Stichtag −15 (Hinweis, kein Beleg)',
];

export function renderReviewSummary(report: ReviewReport): string {
  const { analysis } = report;
  const lines: string[] = [];
  lines.push('# Review-Zusammenfassung RECHT.NRW', '', `Stand: ${report.generatedAt} · Stichtag ${report.baselineDate} · Erzeugt mit \`npm run import:recht-nrw:review-report -- --write\`.`, '');
  lines.push('Grundsatz: keine Massenentscheidung, keine Absenkung von Belegstandards. Reviewzahlen sinken nur durch behobene Parserfehler, bessere amtliche Evidenz oder echte Deduplizierung. Der Score ist eine Arbeitspriorität, kein Rechtsstatus.', '');
  lines.push('## Kennzahlen', '');
  lines.push(`- Review-Fälle gesamt: ${analysis.totals.items} (offen ${analysis.totals.open}, blockierend ${analysis.totals.openBlocking}, nicht blockierend ${analysis.totals.openNonBlocking}, abgelöst ${analysis.totals.superseded}, entschieden ${analysis.totals.decided})`);
  lines.push(`- Betroffene Stammnormen mit offenen Befunden: ${analysis.totals.identities} – davon mit Blocker (nicht übernommen) ${analysis.totals.identitiesWithBlocking}, nur nichtblockierend (übernommen, Entscheidung offen) ${analysis.totals.identitiesNonBlockingOnly}, ohne Manifesteintrag ${analysis.totals.identitiesWithoutManifestEntry}`);
  for (const area of SOURCE_AREAS) lines.push(`- ${area.toUpperCase()}: ${analysis.byArea[area].open} offene Befunde (${analysis.byArea[area].blocking} blockierend) bei ${analysis.byArea[area].identities} Stammnormen (${analysis.byArea[area].identitiesWithBlocking} mit Blocker)`);
  lines.push(`- Befunde je Stammnorm: ${analysis.findingsPerIdentity.slice(0, 6).map((row) => `${row.findings}: ${row.identities}`).join(', ')}${analysis.findingsPerIdentity.length > 6 ? ', …' : ''}`, '');
  lines.push('## Kategorien', '', '| Bereich | Kategorie | offen | blockierend | Stammnormen | alleiniger Blocker bei | häufigster Schlüssel |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const category of analysis.byCategory) lines.push(`| ${category.sourceArea} | ${category.category} | ${category.open} | ${category.blocking} | ${category.identities} | ${category.soleBlockerIdentities} | ${cell(category.keys[0]?.pattern).slice(0, 90)} (${category.keys[0]?.open ?? 0}) |`);
  lines.push('', '## Wichtigste Gruppen', '', '### Kategorie-Kombinationen je Stammnorm', '', '| Kombination | Stammnormen | davon mit Blocker | Beispiele |', '| --- | --- | --- | --- |');
  for (const combination of analysis.combinations.slice(0, 12)) lines.push(`| ${combination.categories.join(' + ')} | ${combination.identities} | ${combination.withBlocking} | ${combination.examples.join(', ')} |`);
  lines.push('', '### Institutionen-Bezeichnungen (gruppiert, Darstellung)', '', '| Bezeichnung | Kategorie | Stammnormen | Vorkommen | Beispiele |', '| --- | --- | --- | --- | --- |');
  for (const group of analysis.groups.institutionTerms.slice(0, 12)) lines.push(`| ${cell(group.term)} | ${group.detectionCategory} | ${group.identities} | ${group.occurrences} | ${group.examples.slice(0, 3).join(', ')} |`);
  lines.push('', '### Parserbefunde (Muster)', '', '| Muster | offen | blockierend | Stammnormen | Beispiele |', '| --- | --- | --- | --- | --- |');
  for (const group of analysis.groups.parserFindings.slice(0, 12)) lines.push(`| ${cell(group.pattern).slice(0, 120)} | ${group.open} | ${group.blocking} | ${group.identities} | ${group.examples.slice(0, 3).join(', ')} |`);
  lines.push('', '## Prioritätsmodell (`common/review-priority.ts`)', '');
  for (const factor of PRIORITY_MODEL) lines.push(`- ${factor}`);
  lines.push('', `Bänder (Stammnormen mit offenen Befunden): A ${report.bandDistribution.A}, B ${report.bandDistribution.B}, C ${report.bandDistribution.C}, D ${report.bandDistribution.D}.`, '');
  lines.push('## Top-Prioritäten (alle Kategorien)', '', '| Rang | Term | Bereich | Titel | Score | Blocker | Faktoren |', '| --- | --- | --- | --- | --- | --- | --- |');
  const summaries = new Map(analysis.identities.map((summary) => [summary.sourceIdentity, summary]));
  for (const [index, row] of report.priorities.slice(0, 20).entries()) {
    const summary = summaries.get(row.sourceIdentity);
    lines.push(`| ${index + 1} | ${row.sourceIdentity} | ${row.sourceArea} | ${cell(summary?.title).slice(0, 80)} | ${row.score} (${row.band}) | ${summary?.blockingCategories.join(', ') || '–'} | ${row.factors.join('; ').slice(0, 200)} |`);
  }
  lines.push('', '## Arbeitslisten', '');
  for (const list of report.workLists) lines.push(`- \`${REVIEW_WORK_LIST_DIR.replace(/\\/gu, '/')}/${list.name}.md\` – ${list.title}: ${list.total} Stammnormen, Top ${list.items.length}${list.items[0] ? ` (z. B. ${list.items.slice(0, 3).map((item) => item.sourceIdentity).join(', ')})` : ''}`);
  for (const list of report.groupedLists) lines.push(`- \`${REVIEW_WORK_LIST_DIR.replace(/\\/gu, '/')}/${list.name}.md\` – ${list.title}: ${list.total} Gruppen`);
  lines.push('', '## LRMB', '');
  const gaps = report.historicalGaps.summary;
  lines.push(`- Historische Lücken (Statistik \`lrmb/HISTORICAL_GAP_STATISTIK.md\`, Analyse und Vorschläge \`lrmb/HISTORICAL_GAP_ANALYSE.md\`): ${gaps.cases} Fälle – Gründe ${Object.entries(gaps.byReason).map(([key, value]) => `${key} ${value}`).join(', ')}; Belegklassen ${Object.entries(gaps.byEvidenceClass).map(([key, value]) => `${key} ${value}`).join(', ')}`);
  lines.push(`- PDF-Fälle (\`lrmb/PDF_FAELLE.md\`): ${report.pdfCases.summary.cases} Stammnormen, ${report.pdfCases.summary.documents} PDF-Dateien, ${report.pdfCases.summary.pagesKnown} bekannte Seiten (Textlayer ${report.pdfCases.summary.textLayerDocuments}, Scan ${report.pdfCases.summary.scanDocuments}); Regelungsgehalt ${Object.entries(report.pdfCases.summary.byMainText).map(([key, value]) => `${key} ${value}`).join(', ')}`);
  const queue = report.reconstructionQueue;
  lines.push(`- Rekonstruktionsqueue: ${queue.summary.total} (offen ${queue.summary.queued}, Rezeptentwurf ${queue.summary.recipeDraft}, unsicher ${queue.summary.blockedUncertain}, übernommen ${queue.summary.imported}); Gruppen ${Object.entries(queue.summary.byGroup).map(([key, value]) => `${key} ${value}`).join(', ')}${queue.groups ? `; Richtung ${Object.entries(queue.groups.byDirection).map(([key, value]) => `${key} ${value}`).join(', ')}; Änderungen ${Object.entries(queue.groups.byAmendments).map(([key, value]) => `${key}: ${value}`).join(', ')}; Quellen ${Object.entries(queue.groups.bySourceCompleteness).map(([key, value]) => `${key} ${value}`).join(', ')}` : ''}`);
  lines.push(`- Nachfolgebeleg-Index (\`lrmb/successor-index.json\`): ${report.successorIndex.sources.length} zitierende Quellen, ${report.successorIndex.statements.length} Aussagen über andere Vorschriften (gescannt: ${report.successorIndex.scanned.lrmbPages} LRMB-Seiten, ${report.successorIndex.scanned.gazetteEntries} Ministerialblatt-Einträge)`);
  if (report.evidencePass) {
    const pass = report.evidencePass.summary;
    lines.push(`- Evidence Pass (\`lrmb/EVIDENCE_PASS.md\`, Simulation ${report.evidencePass.parserVersion}): ${pass.simulated}/${pass.entries} simuliert; historische Lücken ${pass.historicalGap.before} → automatisch not-at-baseline ${pass.historicalGap.after.notAtBaseline}, verified-active-at-baseline ${pass.historicalGap.after.verifiedActive}, reconstruction-required ${pass.historicalGap.after.reconstructionRequired}, contradictory ${pass.historicalGap.after.contradictory}, weiterhin undetermined ${pass.historicalGap.after.undetermined}; Regeln P1 ${pass.rules.p1.decided}, P2 ${pass.rules.p2.decidedBefore + pass.rules.p2.decidedContinuity}, P3 ${pass.rules.p3.continuitySupported}, P4 ${pass.rules.p4.derivedInForce}`);
  }
  lines.push('', '## Nächste fachliche Schritte', '');
  const steps: string[] = [];
  const parserTop = analysis.groups.parserFindings[0];
  if (parserTop) steps.push(`Parser: Muster „${parserTop.pattern.slice(0, 80)}“ betrifft ${parserTop.identities} Stammnormen – ein Parserfix löst die Gruppe (Regressionstest mit Beispiel ${parserTop.examples[0]}).`);
  const institutionTop = analysis.groups.institutionTerms[0];
  if (institutionTop) steps.push(`Institutionen: Bezeichnung „${institutionTop.term}“ (${institutionTop.detectionCategory}) in ${institutionTop.identities} Normen – eine dokumentierte Zuordnung in institution-mapping.json schließt alle Vorkommen.`);
  if (gaps.withSelfExpiryBeforeBaseline > 0) steps.push(`Historische Lücken: ${gaps.withSelfExpiryBeforeBaseline} Texte tragen eine eigene Außerkrafttretensformel vor dem Stichtag (z. B. „mit Ablauf des Haushaltsjahres …“), die die Pipeline nicht liest – Erweiterung von parseValidityClauses fail-closed prüfen (Parserversion erhöhen).`);
  if (gaps.withSuccessorStrong > 0) steps.push(`Historische Lücken: ${gaps.withSuccessorStrong} Vorschriften werden von anderen Vorschriften des Bestands mit Datum und Fundstelle aufgehoben oder abgelöst – fachlich prüfen; liegt die Aufhebung vor dem Stichtag, ist sie Gegenbeleg der Fortgeltung, liegt sie danach, belegt sie den Fortbestand bis zur Aufhebung (keine automatische Relation).`);
  if (gaps.withSuccessorWeak > 0) steps.push(`Historische Lücken: ${gaps.withSuccessorWeak} weitere Aufhebungshinweise nur über das Datum – manuelle Prüfliste.`);
  const pdfTop = report.pdfCases.cases.find((pdfCase) => pdfCase.mainText !== 'html');
  if (pdfTop) steps.push(`PDF: höchste Transkriptionspriorität ${pdfTop.sourceIdentity} (${pdfTop.title.slice(0, 60)}, ${pdfTop.pagesKnown} Seiten, Textlayer ${pdfTop.textLayerDocuments}/${pdfTop.pdfDocuments}); VV zur LHO nach docs/VV_LHO_TRANSKRIPTIONSPLAN.md.`);
  const normativityCategory = analysis.byCategory.find((category) => category.category === 'normativity');
  if (normativityCategory) steps.push(`Normativität: ${normativityCategory.identities} Dokumente warten auf eine Einzelentscheidung; Liste \`normativitaet.md\` beginnt mit den Vorschriften mit Gesetzesbezug und Erlasskopf.`);
  if (queue.summary.queued > 0) steps.push(`Rekonstruktion: ${queue.summary.queued} Fälle mit vollständigen Quellen warten auf ein geprüftes Rezept (\`rekonstruktionen.md\`).`);
  for (const step of steps) lines.push(`- ${step}`);
  return `${lines.join('\n')}\n`;
}

// --- Kommando -----------------------------------------------------------------------------------

export async function runReviewReportCommand(options: CliOptions, root: string, io: Io): Promise<number> {
  const manifest = await readManifest(root);
  const queue = await readReviewQueue(root);
  const enumerations: Partial<Record<SourceArea, EnumerationFile>> = {};
  for (const area of SOURCE_AREAS) {
    const enumeration = await readEnumeration(root, area).catch(() => undefined);
    if (enumeration) enumerations[area] = enumeration;
  }
  const reader = options.noSources ? undefined : createOfflineSourceReader(root, options.cacheDir ? { cacheDir: options.cacheDir } : {});
  const report = await buildReviewReport({ root, manifest, queue, enumerations, recipes: await listRecipes(root), baselineDate: options.baseline, now: new Date().toISOString(), limit: options.limit ?? 100, ...(reader ? { reader } : {}), log: (message) => io.print(`  … ${message}`) });
  if (options.json) {
    io.print(JSON.stringify({ ...report, analysis: { ...report.analysis, identities: report.analysis.identities.length }, pdfCases: report.pdfCases.summary, historicalGaps: report.historicalGaps.summary, successorIndex: { generatedAt: report.successorIndex.generatedAt, scanned: report.successorIndex.scanned, sources: report.successorIndex.sources.length, statements: report.successorIndex.statements.length }, ...(report.evidencePass ? { evidencePass: report.evidencePass.summary } : {}) }, null, 2));
  } else {
    io.print(renderReviewSummary(report));
  }
  if (reader) io.print(`Quellen: ${reader.stats.local} versioniert, ${reader.stats.cache} aus dem Cache, ${reader.stats.missing} nicht verfügbar (kein Netzabruf).`);
  if (!options.write) {
    io.print('Dry-run: nichts geschrieben (mit --write werden Teilreports, Prioritäten, Arbeitslisten, REVIEW_SUMMARY.md, PDF-Fälle, Lückenanalyse, Nachfolgebeleg-Index und Evidence Pass geschrieben).');
    return 0;
  }
  const written: string[] = [];
  const writeJson = async (path: string, value: unknown): Promise<void> => {
    await writeJsonAtomic(join(root, path), value);
    written.push(path);
  };
  const writeText = async (path: string, value: string): Promise<void> => {
    await writeFileAtomic(join(root, path), value);
    written.push(path);
  };
  const split = splitReviewAnalysis(report.analysis);
  await writeJson(join(REVIEW_REPORT_DIR, 'summary.json'), split.summary);
  for (const [file, value] of [...split.parts.entries()].sort(([left], [right]) => left.localeCompare(right))) await writeJson(join(REVIEW_REPORT_DIR, file), value);
  // Frühere monolithische Analyse (9,8 MB) – ersetzt durch die Teilreports.
  await rm(join(root, REVIEW_REPORT_DIR, 'review-analysis.json'), { force: true });
  await writeJson(join(REVIEW_REPORT_DIR, 'priorities.json'), { schemaVersion: 'recht-nrw-review-priorities/1', generatedAt: report.generatedAt, baselineDate: report.baselineDate, model: PRIORITY_MODEL, bandDistribution: report.bandDistribution, items: report.priorities });
  for (const list of report.workLists) {
    await writeJson(join(REVIEW_WORK_LIST_DIR, `${list.name}.json`), { schemaVersion: 'recht-nrw-review-work-list/1', generatedAt: report.generatedAt, ...list });
    await writeText(join(REVIEW_WORK_LIST_DIR, `${list.name}.md`), renderWorkListMarkdown(list));
  }
  for (const list of report.groupedLists) {
    await writeJson(join(REVIEW_WORK_LIST_DIR, `${list.name}.json`), { schemaVersion: 'recht-nrw-review-grouped-list/1', generatedAt: report.generatedAt, ...list });
    await writeText(join(REVIEW_WORK_LIST_DIR, `${list.name}.md`), renderGroupedListMarkdown(list));
  }
  await writeText(REVIEW_SUMMARY_PATH, renderReviewSummary(report));
  await writeJson(PDF_CASES_PATH, report.pdfCases);
  await writeText(PDF_CASES_MARKDOWN_PATH, renderPdfCasesMarkdown(report.pdfCases));
  await writeJson(HISTORICAL_GAP_PATH, report.historicalGaps);
  await writeText(HISTORICAL_GAP_MARKDOWN_PATH, renderHistoricalGapMarkdown(report.historicalGaps));
  if (reader) await writeJson(SUCCESSOR_INDEX_PATH, report.successorIndex);
  if (report.evidencePass) {
    await writeJson(EVIDENCE_PASS_PATH, report.evidencePass);
    await writeText(EVIDENCE_PASS_MARKDOWN_PATH, renderEvidencePassMarkdown(report.evidencePass));
  }
  for (const path of written) io.print(`Geschrieben: ${path.replace(/\\/gu, '/')}`);
  return 0;
}
