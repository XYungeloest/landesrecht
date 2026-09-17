/**
 * Analyse der historischen LRMB-Lücken (`historical-gap`, Befund `validity-undetermined`): undatierte
 * SMBl-Altdatensätze, deren Geltung am Stichtag nicht belegt ist (`lrmb/validity.ts`).
 *
 * Die Analyse liest ausschließlich vorhandene Daten – Manifest, Audit-Reports, Enumeration (Suchindex)
 * und den netzfreien Quellcache – und prüft je Fall, welche amtlichen Belege bereits vorliegen und welche
 * automatisierbar wären:
 *
 *   1. Ausfertigungsdatum (Erlasskopf, Seitentitel, Suchindex) und Stammfundstelle (Fundstellenverlauf,
 *      Fußzeile) – Voraussetzung jeder Zuordnung;
 *   2. Fundstellenverlauf: Änderungen, Ministerialblatt-Zuordnung, letzte Änderung vor/nach dem Stichtag;
 *   3. eigene Geltungsformeln im Text, die die Pipeline nicht liest (z. B. „mit Ablauf des Haushaltsjahres
 *      2016 außer Kraft“) – `lrmb/repeal-patterns.ts`;
 *   4. Nachfolgevorschriften: Aufhebungs-/Ablösungsformeln anderer Dokumente des Bestands, die diese
 *      Vorschrift mit Datum und Fundstelle nennen (starker Gegenbeleg der Fortgeltung; nie automatische
 *      Relation);
 *   5. Suchindex-Signale (`field_historically`, `field_outforce_date`) – nur Hinweis, nie Beleg.
 *
 * Ergebnis: je Fall eine Belegklasse für die Arbeitsplanung (`data/audits/recht-nrw/lrmb/historical-gap.json`)
 * und aggregierte Zahlen für `HISTORICAL_GAP_ANALYSE.md`. Der Fünf-Bedingungen-Nachweis bleibt unverändert.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EnumerationFile, SearchSignals } from '../common/enumeration.ts';
import { decodeHtml } from '../common/fetcher.ts';
import { compareSourceIdentity, type ImportManifest, type ManifestEntry } from '../common/manifest.ts';
import type { ReviewPriority } from '../common/review-priority.ts';
import { plainTextOf, type OfflineSourceReader } from '../common/review-sources.ts';
import { parseVersionPage } from '../common/version-page.ts';
import { parseLrmbDocument } from './parser.ts';
import { detectRepealStatements, matchRepealStatements, otherStatements, selfStatements, type RepealMatch, type RepealStatement } from './repeal-patterns.ts';
import { parseDecreeFromTitle, parseGazetteCitation } from './text-metadata.ts';

export const HISTORICAL_GAP_SCHEMA = 'recht-nrw-historical-gap-analysis/1' as const;

export type GapReason = 'no-start-evidence' | 'no-continuity-amendment' | 'continuity-failed' | 'other';

/** Belegklasse für die Arbeitsplanung (keine Rechtsaussage). */
export type EvidenceClass =
  | 'self-expiry-before-baseline'
  | 'successor-strong'
  | 'successor-weak'
  | 'amendment-chain-identified'
  | 'amendment-chain-unidentified'
  | 'in-force-clause-only'
  | 'index-outforce-only'
  | 'no-signal';

export interface SuccessorEvidence {
  citingIdentity?: string;
  citingUrl: string;
  citingTitle?: string;
  kind: RepealStatement['kind'];
  level: RepealMatch['level'];
  matched: RepealMatch['matched'];
  text: string;
  effective?: RepealStatement['effective'];
}

export interface HistoricalGapCase {
  sourceIdentity: string;
  title: string;
  sourceUrl: string;
  sourceDocumentType: string;
  reason: GapReason;
  reasonText: string;
  issuedOn?: string;
  issuedOnSource?: 'head' | 'title' | 'search-index';
  smblNumber?: string;
  baseCitation?: string;
  changeNote?: { amendments: number; identified: number; complete: boolean; latestDecreeDate?: string; latestAfterBaseline: boolean };
  inForceClause: boolean;
  /** Eigene Außerkrafttretens-/Aufhebungsformeln des Textes (Selbstaussagen). */
  selfStatements: Array<{ kind: RepealStatement['kind']; text: string; effective?: RepealStatement['effective'] }>;
  successorEvidence: SuccessorEvidence[];
  indexSignals?: SearchSignals;
  evidenceClass: EvidenceClass;
  priority?: ReviewPriority;
  pageAvailable: boolean;
}

export interface HistoricalGapAnalysis {
  schemaVersion: typeof HISTORICAL_GAP_SCHEMA;
  generatedAt: string;
  baselineDate: string;
  note: string;
  scanned: { lrmbPages: number; gazetteEntries: number; statementsOther: number; statementsSelf: number };
  summary: {
    cases: number;
    byReason: Record<string, number>;
    byEvidenceClass: Record<string, number>;
    byDocumentType: Record<string, number>;
    byIssuedDecade: Record<string, number>;
    issuedOnSource: Record<string, number>;
    withChangeNote: number;
    withIdentifiedAmendment: number;
    withSelfExpiryBeforeBaseline: number;
    withSuccessorStrong: number;
    withSuccessorWeak: number;
    indexHistorically: Record<string, number>;
    indexOutforceBeforeBaseline: number;
  };
  cases: HistoricalGapCase[];
}

interface AuditReport {
  head?: { issuedOn?: string; fileReference?: string };
  changeNote?: { base?: { text: string; page?: string; year?: number }; complete: boolean; amendments: Array<{ decreeDate?: string }> };
  amendments?: Array<{ identification?: { ok: boolean }; note: { decreeDate?: string } }>;
  validity?: { evidence?: Array<{ kind: string }> };
}

export interface HistoricalGapInput {
  manifest: ImportManifest;
  enumeration?: EnumerationFile;
  priorities: Map<string, ReviewPriority>;
  reader?: OfflineSourceReader;
  root: string;
  baselineDate: string;
  now: string;
  log?: (message: string) => void;
}

interface IndexedStatement {
  statement: RepealStatement;
  citingUrl: string;
  citingIdentity?: string;
  citingTitle?: string;
}

export function gapReasonOf(message: string): GapReason {
  if (/kein belegter Beginn/u.test(message)) return 'no-start-evidence';
  if (/keine Änderung nach dem Stichtag/u.test(message)) return 'no-continuity-amendment';
  if (/ohne Kontinuitätsbeleg/u.test(message)) return 'continuity-failed';
  return 'other';
}

export function smblNumberOf(entry: ManifestEntry, classificationNumber?: string): string | undefined {
  for (const url of [...(entry.attachments ?? []).map((attachment) => attachment.url), ...entry.rawDocuments.map((raw) => raw.url)]) {
    const match = /smbl_(\d{2,7})_/u.exec(url);
    if (match) return match[1];
  }
  return classificationNumber;
}

function count(values: Array<string | undefined>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const value of values) map[value ?? '–'] = (map[value ?? '–'] ?? 0) + 1;
  return Object.fromEntries(Object.entries(map).sort(([left, a], [right, b]) => b - a || left.localeCompare(right)));
}

export function classifyEvidence(gapCase: Pick<HistoricalGapCase, 'selfStatements' | 'successorEvidence' | 'changeNote' | 'inForceClause' | 'indexSignals'>, baselineDate: string): EvidenceClass {
  if (gapCase.selfStatements.some((statement) => (statement.kind === 'expired' || statement.kind === 'repealed') && statement.effective?.date && statement.effective.date < baselineDate)) return 'self-expiry-before-baseline';
  if (gapCase.successorEvidence.some((evidence) => evidence.level === 'strong')) return 'successor-strong';
  if (gapCase.successorEvidence.length > 0) return 'successor-weak';
  if (gapCase.changeNote && gapCase.changeNote.identified > 0) return 'amendment-chain-identified';
  if (gapCase.changeNote && gapCase.changeNote.amendments > 0) return 'amendment-chain-unidentified';
  if (gapCase.inForceClause) return 'in-force-clause-only';
  if (gapCase.indexSignals?.outforceDate && gapCase.indexSignals.outforceDate <= baselineDate) return 'index-outforce-only';
  return 'no-signal';
}

/**
 * Index aller Aufhebungs-/Ablösungsaussagen über andere Vorschriften im netzfreien Bestand (LRMB-Seiten
 * des Manifests und alle Ministerialblatt-Einträge des Caches). Schlüssel: genanntes Ausfertigungsdatum.
 */
export async function buildSuccessorIndex(input: Pick<HistoricalGapInput, 'manifest' | 'reader' | 'log'> & { gazetteUrls?: readonly string[] }): Promise<{ byDate: Map<string, IndexedStatement[]>; scanned: { lrmbPages: number; gazetteEntries: number; statementsOther: number; statementsSelf: number } }> {
  const byDate = new Map<string, IndexedStatement[]>();
  const scanned = { lrmbPages: 0, gazetteEntries: 0, statementsOther: 0, statementsSelf: 0 };
  if (!input.reader) return { byDate, scanned };
  const sources: Array<{ url: string; identity?: string; title?: string; localSource?: string; gazette: boolean }> = [];
  for (const entry of input.manifest.entries.filter((candidate) => candidate.sourceArea === 'lrmb')) {
    const page = entry.rawDocuments.find((raw) => raw.role === 'version-page');
    sources.push({ url: page?.url ?? entry.sourceUrl, identity: entry.sourceIdentity, title: entry.sourceTitle, gazette: false, ...(page?.localSource ? { localSource: page.localSource } : {}) });
    for (const raw of entry.rawDocuments.filter((candidate) => candidate.role === 'gazette-amendment')) sources.push({ url: raw.url, identity: entry.sourceIdentity, title: `Ministerialblatt-Eintrag zu ${entry.sourceTitle.slice(0, 80)}`, gazette: true, ...(raw.localSource ? { localSource: raw.localSource } : {}) });
  }
  for (const url of input.gazetteUrls ?? []) if (!sources.some((source) => source.url === url)) sources.push({ url, gazette: true });
  const seenUrls = new Set<string>();
  for (const [index, source] of sources.entries()) {
    if (seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    if (input.log && index % 500 === 0) input.log(`Nachfolgebelege ${index + 1}/${sources.length}`);
    const document = await input.reader.read(source.url, source.localSource);
    if (!document || !/html/iu.test(document.contentType)) continue;
    const text = plainTextOf(decodeHtml(document));
    if (!text) continue;
    if (source.gazette) scanned.gazetteEntries += 1;
    else scanned.lrmbPages += 1;
    const statements = detectRepealStatements(text);
    scanned.statementsSelf += selfStatements(statements).length;
    for (const statement of otherStatements(statements)) {
      scanned.statementsOther += 1;
      for (const reference of statement.references) {
        if (!reference.date) continue;
        const list = byDate.get(reference.date) ?? [];
        const indexed: IndexedStatement = { statement, citingUrl: source.url };
        if (source.identity) indexed.citingIdentity = source.identity;
        if (source.title) indexed.citingTitle = source.title;
        if (!list.some((existing) => existing.citingUrl === indexed.citingUrl && existing.statement.offset === statement.offset)) list.push(indexed);
        byDate.set(reference.date, list);
      }
    }
  }
  return { byDate, scanned };
}

export async function analyzeHistoricalGaps(input: HistoricalGapInput): Promise<HistoricalGapAnalysis> {
  const gaps = input.manifest.entries.filter((entry) => entry.sourceArea === 'lrmb' && entry.findings.some((finding) => finding.code === 'validity-undetermined')).sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const signalsByIdentity = new Map<string, SearchSignals>();
  for (const item of input.enumeration?.items ?? []) if (item.sourceIdentity && item.search) signalsByIdentity.set(item.sourceIdentity, item.search);
  const gazetteUrls = input.manifest.entries.flatMap((entry) => entry.rawDocuments.filter((raw) => raw.role === 'gazette-amendment').map((raw) => raw.url));
  const successors = await buildSuccessorIndex({ manifest: input.manifest, gazetteUrls, ...(input.reader ? { reader: input.reader } : {}), ...(input.log ? { log: input.log } : {}) });

  const cases: HistoricalGapCase[] = [];
  for (const [index, entry] of gaps.entries()) {
    if (input.log && index % 250 === 0) input.log(`Historische Lücken ${index + 1}/${gaps.length}`);
    const finding = entry.findings.find((candidate) => candidate.code === 'validity-undetermined')!;
    let audit: AuditReport | undefined;
    if (entry.transformation.reportPath) {
      try {
        audit = JSON.parse(await readFile(join(input.root, entry.transformation.reportPath), 'utf8')) as AuditReport;
      } catch {
        audit = undefined;
      }
    }
    const titleDecree = parseDecreeFromTitle(entry.sourceTitle);
    const signals = signalsByIdentity.get(entry.sourceIdentity);
    const issuedOn = audit?.head?.issuedOn ?? titleDecree?.issuedOn ?? signals?.dateOfIssue;
    const issuedOnSource: HistoricalGapCase['issuedOnSource'] | undefined = audit?.head?.issuedOn ? 'head' : titleDecree?.issuedOn ? 'title' : signals?.dateOfIssue ? 'search-index' : undefined;

    let pageAvailable = false;
    let selfFound: RepealStatement[] = [];
    let classificationNumber: string | undefined;
    let footerCitation: string | undefined;
    if (input.reader) {
      const raw = entry.rawDocuments.find((candidate) => candidate.role === 'version-page');
      const document = await input.reader.read(raw?.url ?? entry.sourceUrl, raw?.localSource);
      if (document && /html/iu.test(document.contentType)) {
        pageAvailable = true;
        const html = decodeHtml(document);
        const page = parseVersionPage(html, raw?.url ?? entry.sourceUrl);
        const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
        // Ohne parsbaren Normkörper (Legacy-Format, Minimalseite) dient der Fließtext der Seite als Grundlage.
        selfFound = selfStatements(detectRepealStatements(parse.bodyTexts.length > 0 ? parse.bodyTexts : plainTextOf(html)));
        if (parse.classificationNumber) classificationNumber = parse.classificationNumber;
        if (parse.citationFooter) footerCitation = parse.citationFooter;
      }
    }
    const baseCitation = audit?.changeNote?.base?.text ?? (footerCitation ? parseGazetteCitation(footerCitation)?.text : undefined);
    const baseParsed = baseCitation ? parseGazetteCitation(baseCitation) : undefined;
    const smblNumber = smblNumberOf(entry, classificationNumber);
    const target = { ...(issuedOn ? { issuedOn } : {}), ...(smblNumber ? { smblNumber } : {}), ...(baseParsed?.page ? { gazettePage: baseParsed.page, gazetteYear: baseParsed.year } : {}), ...(audit?.head?.fileReference ? { fileReference: audit.head.fileReference } : {}), title: titleDecree?.title ?? entry.sourceTitle };
    const successorEvidence: SuccessorEvidence[] = [];
    for (const indexed of issuedOn ? successors.byDate.get(issuedOn) ?? [] : []) {
      if (indexed.citingIdentity === entry.sourceIdentity) continue;
      for (const match of matchRepealStatements([indexed.statement], target)) {
        const evidence: SuccessorEvidence = { citingUrl: indexed.citingUrl, kind: match.statement.kind, level: match.level, matched: match.matched, text: match.statement.text.slice(0, 400) };
        if (indexed.citingIdentity) evidence.citingIdentity = indexed.citingIdentity;
        if (indexed.citingTitle) evidence.citingTitle = indexed.citingTitle;
        if (match.statement.effective) evidence.effective = match.statement.effective;
        successorEvidence.push(evidence);
      }
    }
    successorEvidence.sort((left, right) => (left.level === right.level ? left.citingUrl.localeCompare(right.citingUrl) : left.level === 'strong' ? -1 : 1));

    const amendments = audit?.amendments ?? [];
    const decreeDates = amendments.map((amendment) => amendment.note.decreeDate).filter((date): date is string => Boolean(date)).sort();
    const gapCase: HistoricalGapCase = {
      sourceIdentity: entry.sourceIdentity,
      title: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      sourceDocumentType: entry.sourceDocumentType,
      reason: gapReasonOf(finding.message),
      reasonText: finding.message.replace(/^Undatierter Datensatz ohne Beleg der Geltung am Stichtag:\s*/u, ''),
      inForceClause: Boolean(audit?.validity?.evidence?.some((evidence) => evidence.kind === 'text-in-force-clause')),
      selfStatements: selfFound.map((statement) => ({ kind: statement.kind, text: statement.text.slice(0, 300), ...(statement.effective ? { effective: statement.effective } : {}) })),
      successorEvidence,
      evidenceClass: 'no-signal',
      pageAvailable,
    };
    if (issuedOn) gapCase.issuedOn = issuedOn;
    if (issuedOnSource) gapCase.issuedOnSource = issuedOnSource;
    if (smblNumber) gapCase.smblNumber = smblNumber;
    if (baseCitation) gapCase.baseCitation = baseCitation;
    if (audit?.changeNote) {
      const latest = decreeDates[decreeDates.length - 1];
      gapCase.changeNote = { amendments: audit.changeNote.amendments.length, identified: amendments.filter((amendment) => amendment.identification?.ok).length, complete: audit.changeNote.complete, latestAfterBaseline: Boolean(latest && latest > input.baselineDate), ...(latest ? { latestDecreeDate: latest } : {}) };
    }
    if (signals) gapCase.indexSignals = signals;
    const priority = input.priorities.get(entry.sourceIdentity);
    if (priority) gapCase.priority = priority;
    gapCase.evidenceClass = classifyEvidence(gapCase, input.baselineDate);
    cases.push(gapCase);
  }

  return {
    schemaVersion: HISTORICAL_GAP_SCHEMA,
    generatedAt: input.now,
    baselineDate: input.baselineDate,
    note: 'Belegklassen sind Arbeitshilfen für die fachliche Prüfung; keine Klasse ersetzt den Fünf-Bedingungen-Nachweis (docs/RECHT_NRW_LRMB_IMPORT.md). Nachfolgebelege sind Prüfhinweise, keine Relationen.',
    scanned: successors.scanned,
    summary: {
      cases: cases.length,
      byReason: count(cases.map((gapCase) => gapCase.reason)),
      byEvidenceClass: count(cases.map((gapCase) => gapCase.evidenceClass)),
      byDocumentType: count(cases.map((gapCase) => gapCase.sourceDocumentType)),
      byIssuedDecade: count(cases.map((gapCase) => (gapCase.issuedOn ? `${gapCase.issuedOn.slice(0, 3)}0er` : undefined))),
      issuedOnSource: count(cases.map((gapCase) => gapCase.issuedOnSource)),
      withChangeNote: cases.filter((gapCase) => gapCase.changeNote).length,
      withIdentifiedAmendment: cases.filter((gapCase) => (gapCase.changeNote?.identified ?? 0) > 0).length,
      withSelfExpiryBeforeBaseline: cases.filter((gapCase) => gapCase.evidenceClass === 'self-expiry-before-baseline').length,
      withSuccessorStrong: cases.filter((gapCase) => gapCase.successorEvidence.some((evidence) => evidence.level === 'strong')).length,
      withSuccessorWeak: cases.filter((gapCase) => gapCase.successorEvidence.length > 0 && !gapCase.successorEvidence.some((evidence) => evidence.level === 'strong')).length,
      indexHistorically: count(cases.map((gapCase) => String(gapCase.indexSignals?.historically))),
      indexOutforceBeforeBaseline: cases.filter((gapCase) => gapCase.indexSignals?.outforceDate && gapCase.indexSignals.outforceDate <= input.baselineDate).length,
    },
    cases,
  };
}

const CLASS_LABEL: Record<EvidenceClass, string> = {
  'self-expiry-before-baseline': 'eigene Außerkrafttretensformel vor dem Stichtag (nicht von der Pipeline gelesen)',
  'successor-strong': 'Aufhebung/Ablösung durch andere Vorschrift, Datum + Fundstelle/Nummer belegt',
  'successor-weak': 'Aufhebung/Ablösung durch andere Vorschrift, nur Datum (manuell prüfen)',
  'amendment-chain-identified': 'Fundstellenverlauf mit zugeordneter Ministerialblatt-Änderung, keine spätere Änderung',
  'amendment-chain-unidentified': 'Fundstellenverlauf ohne zuordenbaren Ministerialblatt-Eintrag',
  'in-force-clause-only': 'nur Inkrafttretensklausel, keine spätere Änderung',
  'index-outforce-only': 'nur Suchindex-Außerkrafttreten (unzureichend)',
  'no-signal': 'kein Beleg im Bestand',
};

export function renderHistoricalGapMarkdown(analysis: HistoricalGapAnalysis, limit = 100): string {
  const lines: string[] = [];
  lines.push('# Historische LRMB-Lücken – Belegstatistik', '', `Stand: ${analysis.generatedAt}, Stichtag ${analysis.baselineDate}. ${analysis.note}`, '');
  lines.push(`Gescannt: ${analysis.scanned.lrmbPages} LRMB-Seiten und ${analysis.scanned.gazetteEntries} Ministerialblatt-Einträge; ${analysis.scanned.statementsOther} Aussagen über andere Vorschriften, ${analysis.scanned.statementsSelf} Selbstaussagen.`, '');
  const table = (title: string, record: Record<string, number>, labels?: Record<string, string>): void => {
    lines.push(`## ${title}`, '', '| Wert | Fälle |', '| --- | --- |');
    for (const [key, value] of Object.entries(record)) lines.push(`| ${labels?.[key] ? `${key} – ${labels[key]}` : key} | ${value} |`);
    lines.push('');
  };
  table('Grund der Unbestimmtheit', analysis.summary.byReason);
  table('Belegklasse', analysis.summary.byEvidenceClass, CLASS_LABEL);
  table('Dokumenttyp', analysis.summary.byDocumentType);
  table('Ausfertigungsjahrzehnt', analysis.summary.byIssuedDecade);
  table('Quelle des Ausfertigungsdatums', analysis.summary.issuedOnSource);
  table('Suchindex „historisch“', analysis.summary.indexHistorically);
  lines.push(`Fundstellenverlauf vorhanden: ${analysis.summary.withChangeNote}; davon mit zugeordneter Ministerialblatt-Änderung: ${analysis.summary.withIdentifiedAmendment}. Suchindex-Außerkrafttreten vor dem Stichtag: ${analysis.summary.indexOutforceBeforeBaseline}.`, '');
  const section = (title: string, predicate: (gapCase: HistoricalGapCase) => boolean): void => {
    const selected = analysis.cases.filter(predicate).sort((left, right) => (right.priority?.score ?? 0) - (left.priority?.score ?? 0) || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity)).slice(0, limit);
    if (selected.length === 0) return;
    lines.push(`## ${title} (${analysis.cases.filter(predicate).length}, Top ${selected.length})`, '', '| Term | Titel | Ausfertigung | SMBl | Beleg | Score |', '| --- | --- | --- | --- | --- | --- |');
    for (const gapCase of selected) {
      const evidence = gapCase.selfStatements.find((statement) => statement.effective?.date)?.text ?? gapCase.successorEvidence[0]?.text ?? gapCase.reasonText;
      lines.push(`| ${gapCase.sourceIdentity} | ${gapCase.title.replace(/\|/gu, '¦').slice(0, 80)} | ${gapCase.issuedOn ?? '?'} | ${gapCase.smblNumber ?? '–'} | ${evidence.replace(/\|/gu, '¦').slice(0, 160)} | ${gapCase.priority?.score ?? '–'} |`);
    }
    lines.push('');
  };
  section('Eigene Außerkrafttretensformel vor dem Stichtag', (gapCase) => gapCase.evidenceClass === 'self-expiry-before-baseline');
  section('Nachfolgebeleg stark (Datum + Fundstelle/Nummer)', (gapCase) => gapCase.evidenceClass === 'successor-strong');
  section('Nachfolgebeleg schwach (nur Datum)', (gapCase) => gapCase.evidenceClass === 'successor-weak');
  section('Fundstellenverlauf mit zugeordneter Änderung', (gapCase) => gapCase.evidenceClass === 'amendment-chain-identified');
  return `${lines.join('\n')}\n`;
}
