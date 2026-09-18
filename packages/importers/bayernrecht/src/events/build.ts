/**
 * Aufbau des Post-Baseline-Ereignisregisters Bayern.
 *
 * Ablauf:
 *   1. Abgleichbestand laden (`resolve.ts`) – die beiden Enumerationsdateien, nur lesend.
 *   2. Übersichten abrufen (`harvest.ts`) – Ausgabenverzeichnisse des GVBl. mit den von der Plattform
 *      veröffentlichten Prüfsummen und die Trefferlisten beider Organe.
 *   3. Je Veröffentlichung im Zeitraum die Detailseite holen, soweit sie etwas zur Stichtagsfrage
 *      beiträgt (`needsFullText`), und daraus Ereignisse bilden (`derivePublicationEvents`).
 *   4. Ziele auflösen, Vollständigkeit prüfen, Berichte schreiben.
 *
 * Maßgeblich ist durchgehend das **Verkündungsdatum**, nicht das Ausfertigungs- oder Erlassdatum. Der
 * Unterschied entscheidet über die Stichtagsgeltung: Eine am 27.11.2023 erlassene Bekanntmachung, die
 * erst am 21.02.2024 im BayMBl. verkündet wurde, galt am 2023-12-01 **nicht** – belegt in der
 * Dezember-Sonderauswertung. Das Ausfertigungsdatum bleibt als `enactmentDate` erhalten, ersetzt aber
 * nie das Verkündungsdatum.
 *
 * Der Lauf ist resumierbar: Der Fortschritt steckt im Abrufcache `.cache/bayernrecht/`. Wird ein Budget
 * erschöpft, hält der Lauf sauber an, schreibt das bis dahin Erreichte nicht (Dry-run bleibt Dry-run)
 * und meldet, was offen blieb; der nächste Lauf holt genau diese Adressen nach.
 */
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import { createBayernRechtFetcher } from '../common/fetcher.ts';
import type { EvidenceStrength } from '../common/evidence.ts';
import {
  classifyCommand,
  classifyPublication,
  commandWindow,
  extractEffectiveDate,
  extractTerminationDate,
  scanCitations,
  scanRepealList,
  targetTitleFromPublicationTitle,
  type CitedNorm,
} from './classify.ts';
import { parsePublicationDocument, type PublicationDocument } from './documents.ts';
import {
  detailUrl,
  harvestListings,
  needsFullText,
  coveredVolumes,
  fetchPage,
  HarvestHalt,
  MIN_DELAY_MS,
  EXPORT_PROBE,
  type HarvestContext,
  type HarvestedListingEntry,
} from './harvest.ts';
import {
  BASELINE,
  DECEMBER_2023_END,
  DECEMBER_2023_START,
  EVALUATION_DATE,
  EVENT_LEDGER_SCHEMA,
  EVENT_TYPES,
  FIRST_POST_BASELINE_DAY,
  ORGAN_PROVENANCE,
  TERMINATING_EVENT_TYPES,
  deriveConfidence,
  deriveEvidenceStrength,
  eventId,
  isBaselineOnlyCandidate,
  isFullTermination,
  isFutureTermination,
  isPostBaseline,
  sortEvents,
  toExcerpt,
  validateLedger,
  type EventLedger,
  type EventProcessingStatus,
  type EventSubtype,
  type EventType,
  type GazetteIssue,
  type LedgerEvent,
  type LedgerSource,
  type PublicationOrgan,
  type TargetResolution,
} from './ledger.ts';
import { canonicalBayRs, loadStock, publicationReference, resolveTarget, type StockIndex, type TargetCandidate } from './resolve.ts';

export const EVENTS_DATA_DIR = `${IMPORT_DATA_DIR}/events`;
export const LEDGER_PATH = `${EVENTS_DATA_DIR}/ledger.json`;
export const REPORT_PATH = `${AUDIT_DIR}/EVENT_LEDGER.md`;
export const DECEMBER_REPORT_PATH = `${AUDIT_DIR}/POST_BASELINE_DECEMBER_2023.md`;

export interface BuildOptions {
  root: string;
  cacheDir?: string;
  offline?: boolean;
  refresh?: boolean;
  /** Höchstzahl der Netzabrufe dieses Laufs; danach hält der Lauf sauber an (resumierbar). */
  maxNetworkRequests?: number;
  /** Höchstzahl der verarbeiteten Veröffentlichungen (Probelauf). */
  limit?: number;
  evaluationDate?: string;
  log?: (line: string) => void;
}

export interface UnresolvedPublication {
  organ: PublicationOrgan;
  citation: string;
  publishedAt?: string;
  title: string;
  reason: string;
}

export interface BuildStatistics {
  publicationsInPeriod: number;
  publicationsWithFullText: number;
  publicationsWithoutTextLayer: number;
  eventsTotal: number;
  eventsByType: Record<EventType, number>;
  eventsByTypeAndYear: { year: string; counts: Record<EventType, number> }[];
  eventsByOrgan: Record<PublicationOrgan, number>;
  subtypes: Record<string, number>;
  evidence: Record<EvidenceStrength, number>;
  processing: Record<string, number>;
  targetResolution: Record<string, number>;
  targetsResolvedStrong: number;
  baselineOnly: LedgerEvent[];
  futureTermination: LedgerEvent[];
  partialTermination: LedgerEvent[];
  missingPredecessor: LedgerEvent[];
  ambiguous: LedgerEvent[];
  unparsed: UnresolvedPublication[];
  networkRequests: number;
  cacheHits: number;
  pending: string[];
  december: DecemberAnalysis;
  stock: StockIndex['sources'];
}

export interface DecemberPublication {
  organ: PublicationOrgan;
  citation: string;
  issue: string;
  publishedAt: string;
  enactmentDate?: string;
  title: string;
  eventTypes: EventType[];
  /** Betrifft eine am Stichtag geltende Vorschrift (Änderung, Aufhebung, Neufassung einer Vorschrift). */
  addressesExistingNorm: boolean;
  /** Vor dem Stichtag ausgefertigt, aber erst danach verkündet – galt am Stichtag noch nicht. */
  enactedBeforeBaseline: boolean;
  targets: { title: string; bayRsNumber?: string; resolution: TargetResolution }[];
}

export interface DecemberAnalysis {
  issues: GazetteIssue[];
  publications: DecemberPublication[];
  /** Ausfertigungen aus November/Dezember 2023, die erst im Folgejahr verkündet wurden. */
  crossYear: DecemberPublication[];
  eventsTotal: number;
  addressingExistingNorms: number;
  enactedBeforeBaseline: number;
}

export interface BuildResult {
  ledger: EventLedger;
  statistics: BuildStatistics;
  report: string;
  decemberReport: string;
}

/* ----------------------------------------------------------------- Ereignisse je Veröffentlichung */

export interface PublicationInput {
  entry: HarvestedListingEntry;
  document?: PublicationDocument;
  /** Kennung, Adresse und SHA-256 der tatsächlich benutzten Quelle (Detailseite, sonst Trefferliste). */
  sourceId: string;
  sourceUrl: string;
  sourceSha256: string;
  /** Ausgabe des GVBl., aus der die Veröffentlichung stammt – trägt die veröffentlichte Prüfsumme. */
  issue?: GazetteIssue;
}

/** Ereignistypen, die sich gegen eine vorbestehende Vorschrift richten. */
const NORM_DIRECTED: readonly EventType[] = ['amend', 'repeal', 'replace', 'recast', 'expire', 'extend'];

function hint(prefix: string, value: string | undefined): string[] {
  return value === undefined || value.trim() === '' ? [] : [`${prefix}:${value.trim()}`];
}

/** Fundstelle, wie das jeweilige Organ sie druckt. */
export function formatCitation(organ: PublicationOrgan, volume: number, position: number): string {
  return `${ORGAN_PROVENANCE[organ].citationLabel} ${volume} ${organ === 'gvbl' ? 'S.' : 'Nr.'} ${position}`;
}

/**
 * Teilbereichsbefehle. Ein „§ 7 der Verordnung X wird aufgehoben“ ist keine Aufhebung der Vorschrift,
 * sondern ihr Gegenteil: Sie bestand im Übrigen fort. Solche Ereignisse zählen nie als Ende.
 */
function partialSubtype(eventType: EventType, scoped: boolean): EventSubtype | undefined {
  if (!scoped) return undefined;
  if (eventType === 'repeal' || eventType === 'replace') return 'teilaufhebung';
  if (eventType === 'expire') return 'teilausserkrafttreten';
  return undefined;
}

/**
 * Bildet die Ereignisse einer Veröffentlichung. Reine Funktion ohne Datei- und Netzzugriff – genau
 * diese Funktion prüfen die Tests.
 *
 * Ein Ereignis je betroffener Gliederungsnummer. Ein Mantelgesetz, das acht Vorschriften ändert, liefert
 * acht Ereignisse mit acht Zielen; die Plattform selbst führt die Veröffentlichung unter diesen acht
 * Nummern. Zusätzlich entsteht je ausdrücklich im Text aufgehobener oder außer Kraft gesetzter
 * Vorschrift, die **nicht** unter den Gliederungsnummern steht, ein eigenes Ende-Ereignis – das ist der
 * Fall „neue Vorschrift löst alte ab“, und er ist für den Stichtag der wertvollste.
 */
export function derivePublicationEvents(input: PublicationInput, stock: StockIndex): LedgerEvent[] {
  const { entry, document } = input;
  const organ = entry.organ;
  const provenance = ORGAN_PROVENANCE[organ];
  const citation = formatCitation(organ, entry.volume, entry.position);
  const reference = publicationReference(organ, entry.volume, entry.position);
  const issueLabel = organ === 'gvbl' ? (document?.issue ?? (input.issue ? `${input.issue.volume}/${input.issue.issue}` : `${entry.volume}`)) : `${entry.volume} Nr. ${entry.position}`;
  const gliederungsnummern = [...new Set([...entry.gliederungsnummern, ...(document?.gliederungsnummern ?? [])])];
  const classification = classifyPublication(entry.title, document?.documentKind, { hasGliederungsnummer: gliederungsnummern.length > 0, organ });
  const text = document?.text ?? '';
  const citations = text === '' ? [] : scanCitations(text);
  const effectiveDate = text === '' ? undefined : extractEffectiveDate(text);
  const publicationTermination = text === '' ? undefined : extractTerminationDate(text);
  const needsText = needsFullText(entry);
  // Der amtliche Titel benennt sein Ziel selbst („Änderung der Richtlinie …“). Für
  // Verwaltungsvorschriften ist das oft das einzige Merkmal, weil sie einander ohne
  // Gliederungsnummer zitieren. Geprüft wird es nur auf vollständige Übereinstimmung.
  const titleTarget = targetTitleFromPublicationTitle(entry.title);
  const missingTextLayer = needsText && document !== undefined && !document.hasTextLayer;

  const byBayRs = new Map<string, CitedNorm>();
  for (const cited of citations) {
    const key = canonicalBayRs(cited.bayRsNumber);
    if (key !== undefined && !byBayRs.has(key)) byBayRs.set(key, cited);
  }
  // Aufhebungsliste: Der Befehl steht vor den Zielen, und die Gliederungsnummern der Veröffentlichung
  // bezeichnen nur die Sachgebiete. Dann sind die Listenglieder die Ziele, nicht die Nummern.
  const repealList = TERMINATING_EVENT_TYPES.includes(classification.eventType) && document !== undefined ? scanRepealList(document.paragraphs) : [];

  const base = {
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    sourceSha256: input.sourceSha256,
    organ,
    publicationAuthority: provenance.authority,
    digitalRepresentation: provenance.representation,
    citation,
    issue: issueLabel,
    sourcePosition: entry.position,
    ...(entry.publishedAt ? { eventDate: entry.publishedAt } : {}),
    ...(entry.enactmentDate ? { enactmentDate: entry.enactmentDate } : {}),
    ...(document?.gazettePdfPath ? { gazettePdfUrl: `https://www.verkuendung-bayern.de${document.gazettePdfPath}` } : input.issue ? { gazettePdfUrl: `https://www.verkuendung-bayern.de${input.issue.pdfUrl}` } : {}),
    ...(document?.gazettePdfSha256Published ?? input.issue?.sha256Published ? { gazettePdfSha256Published: document?.gazettePdfSha256Published ?? input.issue!.sha256Published } : {}),
  };

  const events: LedgerEvent[] = [];
  let ordinal = 0;

  const emit = (part: {
    eventType: EventType;
    subtype?: EventSubtype;
    targetTitle: string;
    targetAbbreviation?: string;
    targetBayRsNumber?: string;
    targetResolution: TargetResolution;
    targetIdentityHints: string[];
    effectiveDate?: string;
    terminationDate?: string;
    excerpt: string;
    rawText?: string;
    processingOverride?: EventProcessingStatus;
  }): void => {
    const evidenceInput = {
      eventType: part.eventType,
      ...(entry.publishedAt ? { eventDate: entry.publishedAt } : {}),
      citation,
      targetTitle: part.targetTitle,
      targetMatchStrength: part.targetResolution.matchStrength,
    };
    const strength = deriveEvidenceStrength(evidenceInput);
    const processingStatus: EventProcessingStatus =
      part.processingOverride ??
      (part.targetResolution.status === 'missing-predecessor'
        ? 'missing-predecessor'
        : missingTextLayer
          ? 'no-text-layer'
          : part.eventType === 'unknown'
            ? 'unparsed'
            : part.targetResolution.status === 'ambiguous' || strength === 'insufficient'
              ? 'needs-review'
              : 'recorded');
    events.push({
      ...base,
      id: eventId({ sourceId: input.sourceId, position: entry.position, ordinal, text: `${part.eventType}|${part.targetBayRsNumber ?? ''}|${part.targetTitle}|${part.excerpt}` }),
      eventType: part.eventType,
      ...(part.subtype ? { subtype: part.subtype } : {}),
      ...(part.effectiveDate ? { effectiveDate: part.effectiveDate } : {}),
      ...(part.terminationDate ? { terminationDate: part.terminationDate } : {}),
      targetTitle: part.targetTitle,
      ...(part.targetAbbreviation ? { targetAbbreviation: part.targetAbbreviation } : {}),
      ...(part.targetBayRsNumber ? { targetBayRsNumber: part.targetBayRsNumber } : {}),
      targetIdentityHints: part.targetIdentityHints,
      targetResolution: part.targetResolution,
      excerpt: toExcerpt(part.excerpt),
      evidenceStrength: strength,
      confidence: deriveConfidence(evidenceInput),
      processingStatus,
      ...(part.rawText ? { rawText: part.rawText } : {}),
    });
    ordinal += 1;
  };

  /** Merkmale des Ziels, gebündelt für Auflösung und Auszug. */
  const candidateFor = (cited: CitedNorm | undefined, gliederungsnummer: string | undefined, addressesExistingNorm: boolean, terminating: boolean): TargetCandidate => ({
    // Die Gliederungsnummer des BayMBl. bezeichnet ein Sachgebiet, nicht die einzelne Vorschrift;
    // als Identitätsmerkmal taugt dort nur, was der Verkündungstext selbst nennt.
    ...(organ === 'gvbl' && gliederungsnummer !== undefined ? { gliederungsnummer } : {}),
    ...(cited?.bayRsNumber && organ === 'baymbl' ? { gliederungsnummer: cited.bayRsNumber } : {}),
    ...(cited?.title ?? titleTarget ? { title: (cited?.title ?? titleTarget)! } : {}),
    ...(cited?.titleCandidates?.length || titleTarget ? { titleCandidates: [...(cited?.titleCandidates ?? []), ...(titleTarget ? [titleTarget] : [])] } : {}),
    ...(cited?.abbreviation ? { abbreviation: cited.abbreviation } : {}),
    ...(cited?.enactmentDate ? { enactmentDate: cited.enactmentDate } : {}),
    ...(cited?.citation ? { targetCitation: cited.citation } : {}),
    publicationReference: reference,
    terminating,
    addressesExistingNorm,
  });

  const identityHints = (cited: CitedNorm | undefined, gliederungsnummer: string | undefined): string[] => [
    ...hint(organ === 'gvbl' ? 'bayrs' : 'gl-nr-sachgebiet', gliederungsnummer),
    ...hint('zitat-bayrs', cited?.bayRsNumber),
    ...hint('zitat-titel', cited?.title),
    ...hint('zitat-abkuerzung', cited?.abbreviation),
    ...hint('zitat-ausfertigung', cited?.enactmentDate),
    ...hint('zitat-fundstelle', cited?.citation),
    ...hint('teilbereich', cited?.scopeReference),
    ...hint('ausfertigung-verkuendung', entry.enactmentDate),
    ...hint('ressort', entry.ressort),
  ];

  if (repealList.length > 0) {
    for (const cited of repealList) {
      const resolution = resolveTarget(stock, {
        ...candidateFor(cited, cited.bayRsNumber, true, true),
        // Die Fundstelle der Aufhebungsbekanntmachung steht im Änderungsverlauf der aufgehobenen
        // Vorschrift gerade nicht mehr – sie ist aus dem Bestand verschwunden.
        publicationReference: undefined,
      });
      emit({
        eventType: classification.eventType,
        targetTitle: cited.title ?? entry.title,
        ...(cited.abbreviation ? { targetAbbreviation: cited.abbreviation } : {}),
        ...(resolution.bayRsNumber ? { targetBayRsNumber: resolution.bayRsNumber } : {}),
        targetResolution: resolution,
        targetIdentityHints: [...identityHints(cited, undefined), ...hint('gl-nr-sachgebiet', gliederungsnummern.join(', ')), 'aufhebungsliste'],
        ...(effectiveDate ? { effectiveDate } : {}),
        ...(publicationTermination ? { terminationDate: publicationTermination } : {}),
        excerpt: cited.raw,
      });
    }
    return events;
  }

  if (gliederungsnummern.length > 0) {
    for (const gliederungsnummer of gliederungsnummern) {
      const key = canonicalBayRs(gliederungsnummer);
      const cited = key === undefined ? undefined : byBayRs.get(key);
      const command = cited && text !== '' ? classifyCommand(commandWindow(text, cited) ?? '') : undefined;
      const eventType = command?.eventType ?? classification.eventType;
      const terminating = TERMINATING_EVENT_TYPES.includes(eventType);
      const scoped = cited?.scopeReference !== undefined;
      const resolution = resolveTarget(stock, candidateFor(cited, gliederungsnummer, NORM_DIRECTED.includes(eventType), terminating && !scoped));
      emit({
        eventType,
        ...(partialSubtype(eventType, scoped) ?? command?.subtype ?? classification.subtype ? { subtype: (partialSubtype(eventType, scoped) ?? command?.subtype ?? classification.subtype)! } : {}),
        targetTitle: cited?.title ?? titleTarget ?? entry.title,
        ...(cited?.abbreviation ? { targetAbbreviation: cited.abbreviation } : {}),
        ...(resolution.bayRsNumber ?? canonicalBayRs(gliederungsnummer) ? { targetBayRsNumber: (resolution.bayRsNumber ?? canonicalBayRs(gliederungsnummer))! } : {}),
        targetResolution: resolution,
        targetIdentityHints: identityHints(cited, gliederungsnummer),
        ...(effectiveDate ? { effectiveDate } : {}),
        ...(terminating && publicationTermination ? { terminationDate: publicationTermination } : {}),
        excerpt: cited?.raw ?? `${entry.title} (${citation}${entry.enactmentDate ? `, ausgefertigt ${entry.enactmentDate}` : ''})`,
        ...(eventType === 'unknown' ? { rawText: text === '' ? entry.title : text.slice(0, 2000) } : {}),
      });
    }
  } else {
    const cited = citations.find((candidate) => text !== '' && classifyCommand(commandWindow(text, candidate) ?? '') !== undefined);
    const command = cited && text !== '' ? classifyCommand(commandWindow(text, cited) ?? '') : undefined;
    const eventType = command?.eventType ?? classification.eventType;
    const terminating = TERMINATING_EVENT_TYPES.includes(eventType);
    const scoped = cited?.scopeReference !== undefined;
    const resolution = resolveTarget(stock, candidateFor(cited, undefined, NORM_DIRECTED.includes(eventType), terminating && !scoped));
    emit({
      eventType,
      ...(partialSubtype(eventType, scoped) ?? command?.subtype ?? classification.subtype ? { subtype: (partialSubtype(eventType, scoped) ?? command?.subtype ?? classification.subtype)! } : {}),
      targetTitle: cited?.title ?? titleTarget ?? entry.title,
      ...(cited?.abbreviation ? { targetAbbreviation: cited.abbreviation } : {}),
      ...(resolution.bayRsNumber ? { targetBayRsNumber: resolution.bayRsNumber } : {}),
      targetResolution: resolution,
      targetIdentityHints: [...identityHints(cited, undefined), ...hint('zieltitel-aus-verkuendungstitel', titleTarget)],
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(terminating && publicationTermination ? { terminationDate: publicationTermination } : {}),
      excerpt: cited?.raw ?? `${entry.title} (${citation}${entry.enactmentDate ? `, ausgefertigt ${entry.enactmentDate}` : ''})`,
      ...(eventType === 'unknown' ? { rawText: text === '' ? entry.title : text.slice(0, 2000) } : {}),
    });
  }

  // Zusätzliche Ende-Ereignisse: im Text ausdrücklich aufgehobene oder außer Kraft gesetzte
  // Vorschriften, die nicht unter den Gliederungsnummern der Veröffentlichung stehen. Das ist der Fall
  // „neue Vorschrift löst die alte ab“ – und die alte steht heute nicht mehr im Portal.
  const covered = new Set(gliederungsnummern.map((value) => canonicalBayRs(value)).filter((value): value is string => value !== undefined));
  for (const cited of citations) {
    const command = text === '' ? undefined : classifyCommand(commandWindow(text, cited) ?? '');
    if (!command || !TERMINATING_EVENT_TYPES.includes(command.eventType)) continue;
    const key = canonicalBayRs(cited.bayRsNumber);
    if (key !== undefined && covered.has(key)) continue;
    // Ohne Titel und ohne Gliederungsnummer ist das Ziel nicht bestimmbar; ein solches Ende wird nicht
    // erfunden, sondern nur dann geführt, wenn die Quelle wenigstens einen Titel nennt.
    if (key === undefined && cited.title === undefined) continue;
    const scoped = cited.scopeReference !== undefined;
    const resolution = resolveTarget(stock, {
      ...candidateFor(cited, cited.bayRsNumber, true, !scoped),
      // Die Fundstelle der Veröffentlichung belegt hier nicht das Ziel: Sie steht im Änderungsverlauf
      // der abgelösten Vorschrift gerade nicht mehr, weil diese aus dem Bestand verschwunden ist.
      publicationReference: undefined,
    });
    emit({
      eventType: command.eventType,
      subtype: partialSubtype(command.eventType, scoped) ?? 'ausserkrafttreten-durch-nachfolger',
      targetTitle: cited.title ?? entry.title,
      ...(cited.abbreviation ? { targetAbbreviation: cited.abbreviation } : {}),
      ...(resolution.bayRsNumber ?? key ? { targetBayRsNumber: (resolution.bayRsNumber ?? key)! } : {}),
      targetResolution: resolution,
      targetIdentityHints: identityHints(cited, cited.bayRsNumber),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(publicationTermination ? { terminationDate: publicationTermination } : {}),
      excerpt: cited.raw,
    });
  }

  return events;
}

/* ------------------------------------------------------------------------------------ Aufbau */

export async function buildEventLedger(options: BuildOptions): Promise<BuildResult> {
  const evaluationDate = options.evaluationDate ?? EVALUATION_DATE;
  const log = options.log ?? ((): void => undefined);
  const stock = await loadStock(options.root);
  log(`  Abgleichbestand: ${stock.sources.map((source) => `${source.area} ${source.items}`).join(', ')} Einträge`);

  const fetcher = createBayernRechtFetcher({
    root: options.root,
    minDelayMs: MIN_DELAY_MS,
    ...(options.offline ? { offline: true } : {}),
    ...(options.refresh ? { refresh: true } : {}),
    ...(options.cacheDir ? { cacheDir: join(options.root, options.cacheDir) } : {}),
  });
  const context: HarvestContext = { fetcher, log, limits: { ...(options.maxNetworkRequests === undefined ? {} : { maxNetworkRequests: options.maxNetworkRequests }) } };

  const listing = await harvestListings(context, coveredVolumes(BASELINE, evaluationDate));
  const pending = [...listing.pending];

  const issues: GazetteIssue[] = listing.issues
    .map((row) => ({
      organ: row.organ,
      volume: row.volume,
      issue: row.issue,
      publishedAt: row.publishedAt,
      ...(row.pages ? { pages: row.pages } : {}),
      pdfUrl: row.pdfPath,
      sha256Published: row.sha256Published,
    }))
    .sort((left, right) => right.volume - left.volume || right.issue.localeCompare(left.issue));
  const issueByPublishedAt = new Map<string, GazetteIssue>();
  for (const issue of issues) if (!issueByPublishedAt.has(`${issue.organ}:${issue.publishedAt}`)) issueByPublishedAt.set(`${issue.organ}:${issue.publishedAt}`, issue);

  const inPeriod = listing.entries
    .filter((entry) => entry.publishedAt !== undefined && entry.publishedAt >= FIRST_POST_BASELINE_DAY && entry.publishedAt <= evaluationDate)
    .sort((left, right) => (left.publishedAt ?? '').localeCompare(right.publishedAt ?? '') || left.organ.localeCompare(right.organ) || left.position - right.position);
  const selected = options.limit === undefined ? inPeriod : inPeriod.slice(0, options.limit);
  log(`  Veröffentlichungen im Zeitraum ${FIRST_POST_BASELINE_DAY} bis ${evaluationDate}: ${inPeriod.length}${options.limit === undefined ? '' : ` (verarbeitet: ${selected.length})`}`);

  const events: LedgerEvent[] = [];
  const unparsed: UnresolvedPublication[] = [];
  let withFullText = 0;
  let withoutTextLayer = 0;
  let processed = 0;

  for (const entry of selected) {
    let document: PublicationDocument | undefined;
    let sourceId = entry.listingSourceId;
    let sourceUrl = entry.listingUrl;
    let sourceSha256 = entry.listingSha256;
    if (needsFullText(entry)) {
      try {
        const url = detailUrl(entry.detailPath!);
        const page = await fetchPage(context, url, `Detailseite ${formatCitation(entry.organ, entry.volume, entry.position)}`);
        document = parsePublicationDocument(page.html, entry.organ, entry.volume, entry.position);
        sourceId = `${entry.organ}-${entry.volume}-${entry.position}`;
        sourceUrl = url;
        sourceSha256 = page.sha256;
        if (document.hasTextLayer) withFullText += 1;
        else {
          withoutTextLayer += 1;
          unparsed.push({
            organ: entry.organ,
            citation: formatCitation(entry.organ, entry.volume, entry.position),
            ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
            title: entry.title,
            reason: 'Detailseite ohne HTML-Textkörper – nur PDF. Kein OCR; als Review geführt.',
          });
        }
      } catch (error) {
        if (!(error instanceof HarvestHalt)) throw error;
        pending.push(error.pending);
        log(`  Sauberer Halt (${error.reason}): ${error.pending}`);
        break;
      }
    }
    const issue = entry.organ === 'gvbl' && entry.publishedAt !== undefined ? issueByPublishedAt.get(`gvbl:${entry.publishedAt}`) : undefined;
    const produced = derivePublicationEvents(
      { entry, ...(document ? { document } : {}), sourceId, sourceUrl, sourceSha256, ...(issue ? { issue } : {}) },
      stock,
    );
    events.push(...produced);
    for (const event of produced) {
      if (event.eventType !== 'unknown') continue;
      unparsed.push({
        organ: entry.organ,
        citation: formatCitation(entry.organ, entry.volume, entry.position),
        ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
        title: entry.title,
        reason: 'Kein Titelmuster und kein Befehl im Text getroffen; als unknown mit Rohtext geführt.',
      });
    }
    processed += 1;
    if (processed % 250 === 0) log(`  … ${processed}/${selected.length} Veröffentlichungen, ${events.length} Ereignisse, ${fetcher.stats.networkRequests} Netzabrufe`);
  }

  const sources: LedgerSource[] = listing.documents.map((document) => ({
    id: document.id,
    label: document.kind === 'issue-index' ? `Ausgabenverzeichnis ${ORGAN_PROVENANCE[document.organ].citationLabel}` : `Trefferliste ${ORGAN_PROVENANCE[document.organ].citationLabel}`,
    organ: document.organ,
    kind: document.kind,
    url: document.url,
    sha256: document.sha256,
    retrievedAt: document.retrievedAt,
    publicationAuthority: ORGAN_PROVENANCE[document.organ].authority,
    digitalRepresentation: ORGAN_PROVENANCE[document.organ].representation,
  }));

  const ledger: EventLedger = {
    schemaVersion: EVENT_LEDGER_SCHEMA,
    jurisdiction: 'baywue',
    sourceState: 'Bayern',
    baselineDate: BASELINE,
    firstPostBaselineDay: FIRST_POST_BASELINE_DAY,
    evaluationDate: EVALUATION_DATE,
    provenance: ORGAN_PROVENANCE,
    sources,
    issues,
    events: sortEvents(events),
  };
  const problems = validateLedger(ledger);
  if (problems.length > 0) throw new Error(`Ereignisregister ist nicht schemakonform (${problems.length} Probleme): ${problems.slice(0, 5).join('; ')}`);

  const december = analyseDecember(ledger, issues, selected);
  const statistics = summarize(ledger, {
    publicationsInPeriod: selected.length,
    publicationsWithFullText: withFullText,
    publicationsWithoutTextLayer: withoutTextLayer,
    unparsed,
    networkRequests: fetcher.stats.networkRequests,
    cacheHits: fetcher.stats.cacheHits,
    pending,
    december,
    stock: stock.sources,
    evaluationDate,
  });

  return {
    ledger,
    statistics,
    report: renderReport(ledger, statistics, evaluationDate),
    decemberReport: renderDecemberReport(ledger, statistics, evaluationDate),
  };
}

/* ------------------------------------------------------------------------------ Dezember 2023 */

function analyseDecember(ledger: EventLedger, issues: readonly GazetteIssue[], entries: readonly HarvestedListingEntry[]): DecemberAnalysis {
  const inDecember = issues.filter((issue) => issue.publishedAt >= DECEMBER_2023_START && issue.publishedAt <= DECEMBER_2023_END);
  const byCitation = new Map<string, LedgerEvent[]>();
  for (const event of ledger.events) {
    const list = byCitation.get(event.citation);
    if (list) list.push(event);
    else byCitation.set(event.citation, [event]);
  }

  const toPublication = (entry: HarvestedListingEntry): DecemberPublication | undefined => {
    const citation = formatCitation(entry.organ, entry.volume, entry.position);
    const own = byCitation.get(citation) ?? [];
    if (own.length === 0) return undefined;
    return {
      organ: entry.organ,
      citation,
      issue: own[0]!.issue,
      publishedAt: entry.publishedAt!,
      ...(entry.enactmentDate ? { enactmentDate: entry.enactmentDate } : {}),
      title: entry.title,
      eventTypes: [...new Set(own.map((event) => event.eventType))].sort(),
      addressesExistingNorm: own.some((event) => NORM_DIRECTED.includes(event.eventType)),
      enactedBeforeBaseline: entry.enactmentDate !== undefined && entry.enactmentDate <= BASELINE,
      targets: own.map((event) => ({ title: event.targetTitle, ...(event.targetBayRsNumber ? { bayRsNumber: event.targetBayRsNumber } : {}), resolution: event.targetResolution })),
    };
  };

  const publications: DecemberPublication[] = [];
  const crossYear: DecemberPublication[] = [];
  for (const entry of entries) {
    if (entry.publishedAt === undefined) continue;
    const record = entry.publishedAt >= DECEMBER_2023_START && entry.publishedAt <= DECEMBER_2023_END ? toPublication(entry) : undefined;
    if (record) {
      publications.push(record);
      continue;
    }
    // Jahrgangswechsel: vor oder kurz nach dem Stichtag ausgefertigt, aber erst im Folgejahr verkündet.
    if (entry.enactmentDate !== undefined && entry.enactmentDate >= '2023-11-01' && entry.enactmentDate <= DECEMBER_2023_END && entry.publishedAt > DECEMBER_2023_END) {
      const late = toPublication(entry);
      if (late) crossYear.push(late);
    }
  }
  publications.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.organ.localeCompare(right.organ) || left.citation.localeCompare(right.citation));
  crossYear.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.citation.localeCompare(right.citation));

  return {
    issues: inDecember,
    publications,
    crossYear,
    eventsTotal: publications.reduce((sum, publication) => sum + publication.targets.length, 0),
    addressingExistingNorms: publications.filter((publication) => publication.addressesExistingNorm).length,
    enactedBeforeBaseline: publications.filter((publication) => publication.enactedBeforeBaseline).length,
  };
}

/* --------------------------------------------------------------------------------- Kennzahlen */

function emptyCounter<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function summarize(
  ledger: EventLedger,
  extra: {
    publicationsInPeriod: number;
    publicationsWithFullText: number;
    publicationsWithoutTextLayer: number;
    unparsed: UnresolvedPublication[];
    networkRequests: number;
    cacheHits: number;
    pending: string[];
    december: DecemberAnalysis;
    stock: StockIndex['sources'];
    evaluationDate: string;
  },
): BuildStatistics {
  const eventsByType = emptyCounter(EVENT_TYPES);
  const eventsByOrgan: Record<PublicationOrgan, number> = { gvbl: 0, baymbl: 0 };
  const evidence: Record<EvidenceStrength, number> = { strong: 0, supporting: 0, insufficient: 0, contradictory: 0 };
  const processing: Record<string, number> = {};
  const targetResolution: Record<string, number> = {};
  const subtypes: Record<string, number> = {};
  const byYear = new Map<string, Record<EventType, number>>();

  for (const event of ledger.events) {
    eventsByType[event.eventType] += 1;
    eventsByOrgan[event.organ] += 1;
    evidence[event.evidenceStrength] += 1;
    processing[event.processingStatus] = (processing[event.processingStatus] ?? 0) + 1;
    targetResolution[event.targetResolution.status] = (targetResolution[event.targetResolution.status] ?? 0) + 1;
    if (event.subtype) subtypes[event.subtype] = (subtypes[event.subtype] ?? 0) + 1;
    const year = event.eventDate?.slice(0, 4) ?? 'ohne Datum';
    const counts = byYear.get(year) ?? emptyCounter(EVENT_TYPES);
    counts[event.eventType] += 1;
    byYear.set(year, counts);
  }

  return {
    publicationsInPeriod: extra.publicationsInPeriod,
    publicationsWithFullText: extra.publicationsWithFullText,
    publicationsWithoutTextLayer: extra.publicationsWithoutTextLayer,
    eventsTotal: ledger.events.length,
    eventsByType,
    eventsByTypeAndYear: [...byYear.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([year, counts]) => ({ year, counts })),
    eventsByOrgan,
    subtypes,
    evidence,
    processing,
    targetResolution,
    targetsResolvedStrong: ledger.events.filter((event) => event.targetResolution.matchStrength === 'strong' && (event.targetResolution.status === 'resolved' || event.targetResolution.status === 'absent-from-portal')).length,
    baselineOnly: ledger.events.filter((event) => isBaselineOnlyCandidate(event, extra.evaluationDate)),
    futureTermination: ledger.events.filter((event) => isFutureTermination(event, extra.evaluationDate)),
    partialTermination: ledger.events.filter((event) => TERMINATING_EVENT_TYPES.includes(event.eventType) && !isFullTermination(event) && isPostBaseline(event)),
    missingPredecessor: ledger.events.filter((event) => event.processingStatus === 'missing-predecessor'),
    ambiguous: ledger.events.filter((event) => event.targetResolution.status === 'ambiguous'),
    unparsed: extra.unparsed,
    networkRequests: extra.networkRequests,
    cacheHits: extra.cacheHits,
    pending: extra.pending,
    december: extra.december,
    stock: extra.stock,
  };
}

/* ------------------------------------------------------------------------------------ Bericht */

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n| ${header.map(() => '–').join(' | ')} |`;
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function cell(value: string | undefined): string {
  return (value ?? '').replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}

function renderReport(ledger: EventLedger, statistics: BuildStatistics, evaluationDate: string): string {
  const lines: string[] = [];
  lines.push('# Ereignisregister Bayern (Post-Baseline)');
  lines.push('');
  lines.push(`Erzeugt von \`npm run import:bayernrecht:events -- --write\`. Schema \`${ledger.schemaVersion}\`.`);
  lines.push(`Stichtag **${ledger.baselineDate}**; als Ereignis „nach dem Stichtag“ zählt ein **Verkündungsdatum** ab **${FIRST_POST_BASELINE_DAY}**.`);
  lines.push(`Auswertungsstichtag **${evaluationDate}** (Konstante, kein Tagesdatum – ein Wiederholungslauf erzeugt denselben Bericht).`);
  lines.push('');
  lines.push('Das Register enthält ausschließlich Belege aus den amtlichen Verkündungsorganen des Freistaats Bayern.');
  lines.push('Es erzeugt keinen Normtext und entscheidet nicht über die Geltung einer Vorschrift; es liefert die Belege,');
  lines.push('aus denen eine spätere Stichtagsprüfung entscheidet.');
  lines.push('');
  lines.push('## 1 Provenienzrang');
  lines.push('');
  lines.push(table(['Organ', 'Amtlichkeit', 'benutzte digitale Form'], [
    ['Bayerisches Ministerialblatt (BayMBl.)', '**amtlich in elektronischer Form** (`electronic-official`)', '`official-electronic-edition`'],
    ['Bayerisches Gesetz- und Verordnungsblatt (GVBl.)', '**amtlich ist die Druckausgabe** (`printed-official`)', '`official-platform-informational-copy`'],
  ]));
  lines.push('');
  lines.push('Die elektronische GVBl.-Fassung der Verkündungsplattform ist nach den Nutzungshinweisen des Freistaats');
  lines.push('ausdrücklich **nachrichtlich**; amtlich ist allein die Papierausgabe. Jedes GVBl.-Ereignis trägt diesen Rang');
  lines.push('in `publicationAuthority` und `digitalRepresentation` mit. Nirgends wird behauptet, die digitale Kopie sei');
  lines.push('die amtliche Fassung.');
  lines.push('');
  lines.push('## 2 Quellen');
  lines.push('');
  lines.push(`Übersichtsseiten: **${ledger.sources.length}** (Ausgabenverzeichnisse und Trefferlisten), je mit Adresse, Abrufzeit und SHA-256 in \`${LEDGER_PATH}\`.`);
  lines.push(`Einzelverkündungen mit Volltext: **${statistics.publicationsWithFullText}**; deren Adresse und SHA-256 stehen an jedem Ereignis (\`sourceUrl\`, \`sourceSha256\`).`);
  lines.push('');
  lines.push(`Ausgaben des GVBl. mit der **von der Plattform selbst veröffentlichten** SHA-256 der PDF-Ausgabe: **${ledger.issues.length}**.`);
  lines.push('Diese Prüfsumme ist der Integritätsbeleg der amtlichen Ausgabe, ohne dass die Ausgabe geladen werden musste.');
  lines.push('');
  lines.push(table(['Ausgabe', 'verkündet', 'Seiten', 'SHA-256 (Plattformangabe, Anfang)'],
    ledger.issues.filter((issue) => issue.publishedAt >= FIRST_POST_BASELINE_DAY).slice(0, 12).map((issue) => [`${issue.volume}/${issue.issue}`, issue.publishedAt, cell(issue.pages), `\`${issue.sha256Published.slice(0, 20)}…\``])));
  lines.push('');
  lines.push(`Abgleichbestand (nur gelesen): ${statistics.stock.map((source) => `\`${source.path}\` (${source.items} Einträge)`).join(', ')}.`);
  lines.push('');
  lines.push(`Netzabrufe dieses Laufs: **${statistics.networkRequests}**, aus dem Cache bedient: **${statistics.cacheHits}**.`);
  lines.push('');
  lines.push('## 3 Ereignisse');
  lines.push('');
  lines.push(`Verarbeitete Veröffentlichungen im Zeitraum: **${statistics.publicationsInPeriod}** (GVBl. und BayMBl. zusammen).`);
  lines.push(`Ereignisse gesamt: **${statistics.eventsTotal}** – GVBl. ${statistics.eventsByOrgan.gvbl}, BayMBl. ${statistics.eventsByOrgan.baymbl}.`);
  lines.push('');
  lines.push(table(['Ereignistyp', ...statistics.eventsByTypeAndYear.map((entry) => entry.year), 'gesamt'],
    EVENT_TYPES.filter((type) => statistics.eventsByType[type] > 0).map((type) => [
      `\`${type}\``,
      ...statistics.eventsByTypeAndYear.map((entry) => String(entry.counts[type])),
      String(statistics.eventsByType[type]),
    ])));
  lines.push('');
  const unused = EVENT_TYPES.filter((type) => statistics.eventsByType[type] === 0);
  if (unused.length > 0) {
    lines.push(`Nicht aufgetreten: ${unused.map((type) => `\`${type}\``).join(', ')}.`);
    lines.push('Die bayerischen Quellen drücken die Ablösung einer Vorschrift durch eine neue nicht als eigenen Typ aus, sondern');
    lines.push(`als Aufhebung oder Außerkrafttreten durch den Nachfolger (Subtyp \`ausserkrafttreten-durch-nachfolger\`, **${statistics.subtypes['ausserkrafttreten-durch-nachfolger'] ?? 0}** Ereignisse).`);
    lines.push('Die Typen bleiben im Schema, damit ein späterer Lauf sie führen kann, ohne das Schema zu ändern.');
    lines.push('');
  }
  lines.push(table(['Subtyp', 'Anzahl'], Object.entries(statistics.subtypes).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [`\`${key}\``, String(value)])));
  lines.push('');
  lines.push('## 4 Evidenz, Zielauflösung, Verarbeitungsstand');
  lines.push('');
  lines.push(table(['Beweisklasse', 'Anzahl'], (['strong', 'supporting', 'insufficient', 'contradictory'] as const).map((strength) => [`\`${strength}\``, String(statistics.evidence[strength])])));
  lines.push('');
  lines.push(table(['Zielauflösung', 'Anzahl'], Object.entries(statistics.targetResolution).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [`\`${key}\``, String(value)])));
  lines.push('');
  lines.push(`Ziele mit **strukturell starker** Zuordnung (Gliederungsnummer, Fundstelle im Änderungsverlauf, eindeutige Abkürzung oder vollständiger Titel): **${statistics.targetsResolvedStrong}**.`);
  lines.push('Ein bloß ähnlicher Titel trägt nie eine starke Zuordnung – das ist die bindende Regel dieses Registers.');
  lines.push('');
  lines.push(table(['Verarbeitungsstand', 'Anzahl'], Object.entries(statistics.processing).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [`\`${key}\``, String(value)])));
  lines.push('');
  lines.push('## 5 Baseline-only-Kandidaten');
  lines.push('');
  lines.push('Ein Ende der **ganzen** Vorschrift (Aufhebung, Ersetzung, Ablauf) mit Verkündung zwischen');
  lines.push(`${FIRST_POST_BASELINE_DAY} und ${evaluationDate}, dessen Vorgänger im heutigen Portalbestand **nicht** mehr geführt wird.`);
  lines.push('Die Vorschrift galt damit am Stichtag und fehlt heute – genau diese Vorschriften muss ein späterer Import');
  lines.push('zusätzlich beschaffen. Das ist der wichtigste Vollständigkeitsnachweis dieses Registers.');
  lines.push('');
  lines.push(`Anzahl: **${statistics.baselineOnly.length}**.`);
  lines.push('');
  lines.push(table(['verkündet', 'Typ', 'Ziel', 'Gl.-Nr.', 'Merkmale', 'Fundstelle'],
    statistics.baselineOnly.map((event) => [
      event.eventDate ?? '',
      `\`${event.eventType}\``,
      cell(event.targetTitle).slice(0, 110),
      cell(event.targetBayRsNumber) || '–',
      event.targetResolution.matchedOn.join(', '),
      cell(event.citation),
    ])));
  lines.push('');
  lines.push(`Zusätzlich **${statistics.futureTermination.length}** Vorschriften mit einem erst nach dem ${evaluationDate} wirkenden Ende (künftige Befristung).`);
  lines.push('Auch sie galten am Stichtag; sie gelten aber weiterhin und sind deshalb keine baseline-only-Kandidaten.');
  lines.push('');
  lines.push(`Nicht gezählt sind **${statistics.partialTermination.length}** Teilaufhebungen und Teilaußerkrafttreten nach dem Stichtag`);
  lines.push('(„§ 7 der Verordnung X wird aufgehoben“). Sie beweisen das Gegenteil eines Endes: Die Vorschrift bestand');
  lines.push('im Übrigen fort und galt damit auch am Stichtag.');
  lines.push('');
  lines.push('## 6 Vollständigkeit der Enden');
  lines.push('');
  lines.push('Zu jedem `repeal`, `replace` und `expire` gehört entweder ein bestimmter Vorgänger oder ein ausdrücklicher');
  lines.push('Reviewfall. Kein Ereignis verschwindet, und keines wird stillschweigend verworfen.');
  lines.push('');
  const terminating = ledger.events.filter((event) => TERMINATING_EVENT_TYPES.includes(event.eventType));
  lines.push(table(['Ende-Ereignisse', 'Anzahl'], [
    ['gesamt', String(terminating.length)],
    ['Vorgänger im Bestand wiedergefunden (`resolved`)', String(terminating.filter((event) => event.targetResolution.status === 'resolved').length)],
    ['Vorgänger benannt, heute nicht mehr im Bestand (`absent-from-portal`)', String(terminating.filter((event) => event.targetResolution.status === 'absent-from-portal').length)],
    ['mehrdeutig (`ambiguous`, Review)', String(terminating.filter((event) => event.targetResolution.status === 'ambiguous').length)],
    ['ohne bestimmbaren Vorgänger (`missing-predecessor`, Review)', String(terminating.filter((event) => event.targetResolution.status === 'missing-predecessor').length)],
  ]));
  lines.push('');
  lines.push(`Reviewfälle \`missing-predecessor\`: **${statistics.missingPredecessor.length}**.`);
  lines.push('');
  lines.push(table(['verkündet', 'Typ', 'Titel der Veröffentlichung', 'Fundstelle'],
    statistics.missingPredecessor.slice(0, 40).map((event) => [event.eventDate ?? '', `\`${event.eventType}\``, cell(event.targetTitle).slice(0, 110), cell(event.citation)])));
  lines.push('');
  lines.push(`Mehrdeutige Ziele insgesamt: **${statistics.ambiguous.length}** (Mantelakte und gleichnamige Vorschriften; keine automatische Entscheidung).`);
  lines.push('');
  lines.push('## 7 Nicht zugeordnete Veröffentlichungen');
  lines.push('');
  lines.push(`Ohne Textebene (nur PDF, kein OCR): **${statistics.publicationsWithoutTextLayer}**. Ohne getroffenes Muster (\`unknown\`): **${statistics.eventsByType.unknown}**.`);
  lines.push('Beide bleiben mit Rohtext im Register und sind die Arbeitsliste für eine spätere Verfeinerung.');
  lines.push('');
  lines.push(table(['Organ', 'Fundstelle', 'verkündet', 'Titel', 'Grund'],
    statistics.unparsed.slice(0, 40).map((entry) => [ORGAN_PROVENANCE[entry.organ].citationLabel, cell(entry.citation), entry.publishedAt ?? '', cell(entry.title).slice(0, 90), cell(entry.reason)])));
  lines.push('');
  lines.push('## 8 Grenzen');
  lines.push('');
  lines.push('- Der **CSV-Jahreslistenexport des BayMBl.** hängt an einem POST. Ein GET mit allen Formularfeldern liefert nur die Formularseite zurück (geprüft). Er wurde nicht erzwungen; ausgewertet sind die Übersichtsseiten, die denselben Inhalt strukturiert führen.');
  lines.push('- Die **Gliederungsnummer einer BayMBl.-Veröffentlichung bezeichnet ein Sachgebiet**, nicht die einzelne Verwaltungsvorschrift; der Fortführungsnachweis zum BayMBl. führt Nummern nur an den Sachgebietsüberschriften. Für Verwaltungsvorschriften trägt die Identität deshalb die Fundstelle im Änderungsverlauf oder der vollständige Titel.');
  lines.push('- **Kein OCR.** Eine Veröffentlichung ohne HTML-Textkörper wird als Review geführt, nicht geraten.');
  lines.push('- Das Register erfasst BayMBl.-Veröffentlichungen ohne Gliederungsnummer und ohne Normereignis-Muster im Titel (Stellenausschreibungen, Exequaturs, Verleihungen) **nur aus den Listenangaben**. Sie sind als `notice` enthalten, aber ohne Volltext.');
  lines.push('- `www.bayerische-staatszeitung.de` (Verlag der GVBl.-Papierausgabe) wurde nicht berührt: ausdrücklicher TDM-Vorbehalt nach § 44b UrhG.');
  if (statistics.pending.length > 0) {
    lines.push(`- **Dieser Lauf ist sauber angehalten**, bevor der Plan vollständig war: ${statistics.pending.join('; ')}. Ein erneuter Lauf setzt genau dort fort (der Fortschritt steckt im Abrufcache).`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderDecemberReport(ledger: EventLedger, statistics: BuildStatistics, evaluationDate: string): string {
  const december = statistics.december;
  const lines: string[] = [];
  lines.push('# Dezember 2023 – die kritische Zone um den Stichtag');
  lines.push('');
  lines.push(`Stichtag **${ledger.baselineDate}**, Auswertungsstichtag **${evaluationDate}** (Konstante).`);
  lines.push(`Erfasst sind alle Verkündungen vom ${DECEMBER_2023_START} bis ${DECEMBER_2023_END}.`);
  lines.push('');
  lines.push('Warum dieser Monat gesondert ausgewertet wird: Eine Änderung unmittelbar nach dem Stichtag **legt die am');
  lines.push('1. Dezember 2023 geltende Vorgängerfassung offen**. Der Änderungsbefehl nennt die geänderte Vorschrift mit');
  lines.push('Titel, Ausfertigungsdatum, Fundstelle und Gliederungsnummer und beschreibt im Wortlaut, was vorher dastand.');
  lines.push('Für die Stichtagsrekonstruktion ist das die dichteste Beweislage, die die Verkündungsorgane hergeben.');
  lines.push('');
  lines.push('## 1 Ausgaben des GVBl. in diesem Zeitraum');
  lines.push('');
  lines.push('Mit der von der Plattform selbst veröffentlichten SHA-256 der amtlichen PDF-Ausgabe. Zur Einordnung: Die');
  lines.push('letzte Ausgabe **vor** dem Stichtag ist 22/2023 vom 30.11.2023 (Seiten 613–624).');
  lines.push('');
  lines.push(table(['Ausgabe', 'verkündet', 'Seiten', 'SHA-256 (Plattformangabe)'],
    december.issues.map((issue) => [`${issue.volume}/${issue.issue}`, issue.publishedAt, cell(issue.pages), `\`${issue.sha256Published}\``])));
  lines.push('');
  lines.push('Die elektronische GVBl.-Ausgabe ist **nachrichtlich**; amtlich ist die Druckausgabe. Die Prüfsumme belegt die');
  lines.push('Unverändertheit der elektronischen Kopie, nicht ihre Amtlichkeit.');
  lines.push('');
  lines.push('## 2 Verkündungen');
  lines.push('');
  lines.push(`Veröffentlichungen mit Verkündung zwischen ${DECEMBER_2023_START} und ${DECEMBER_2023_END}: **${december.publications.length}**`);
  lines.push(`(GVBl. ${december.publications.filter((publication) => publication.organ === 'gvbl').length}, BayMBl. ${december.publications.filter((publication) => publication.organ === 'baymbl').length}), daraus **${december.eventsTotal}** Ereignisse.`);
  lines.push('');
  lines.push(`Davon richten sich **${december.addressingExistingNorms}** gegen eine vorbestehende Vorschrift (Änderung, Aufhebung, Neufassung, Ablauf).`);
  lines.push('**Jede dieser Vorschriften galt am 2023-12-01** – der Änderungsbefehl setzt ihre Geltung voraus und nennt sie');
  lines.push('in der Fassung, die am Stichtag galt.');
  lines.push('');
  lines.push(`**${december.enactedBeforeBaseline}** Veröffentlichungen wurden **vor** dem Stichtag ausgefertigt bzw. erlassen, aber erst danach verkündet.`);
  lines.push(`Sie galten am ${ledger.baselineDate} **noch nicht**. Ein Import, der nach dem Ausfertigungsdatum filtert, nimmt sie`);
  lines.push('fälschlich in den Stichtagsbestand auf. Maßgeblich ist das Verkündungsdatum.');
  lines.push('');
  lines.push(table(['verkündet', 'Organ', 'ausgefertigt', 'vor Stichtag ausgefertigt', 'Typen', 'Titel', 'Fundstelle'],
    december.publications.map((publication) => [
      publication.publishedAt,
      ORGAN_PROVENANCE[publication.organ].citationLabel,
      publication.enactmentDate ?? '',
      publication.enactedBeforeBaseline ? '**ja**' : 'nein',
      publication.eventTypes.map((type) => `\`${type}\``).join(' '),
      cell(publication.title).slice(0, 100),
      cell(publication.citation),
    ])));
  lines.push('');
  lines.push('## 3 Offengelegte Vorgängerfassungen');
  lines.push('');
  lines.push('Je Ereignis das Ziel und der Stand seiner Auflösung. `resolved` heißt: Die Vorschrift steht heute noch im');
  lines.push('Portal – ihr Stichtagstext ist der heutige Text minus die seither erfolgten Änderungen. `absent-from-portal`');
  lines.push('heißt: Sie steht heute nicht mehr im Portal und muss gesondert beschafft werden.');
  lines.push('');
  const decemberTargets = december.publications.flatMap((publication) =>
    publication.targets
      .filter((target) => target.resolution.status === 'resolved' || target.resolution.status === 'absent-from-portal')
      .map((target) => [publication.publishedAt, cell(publication.citation), cell(target.title).slice(0, 90), cell(target.bayRsNumber) || '–', `\`${target.resolution.status}\``, target.resolution.matchedOn.join(', ')]),
  );
  lines.push(table(['verkündet', 'Fundstelle', 'Zielnorm', 'Gl.-Nr.', 'Auflösung', 'Merkmale'], decemberTargets));
  lines.push('');
  lines.push('## 4 Jahrgangswechsel');
  lines.push('');
  lines.push(`**${december.crossYear.length}** Ausfertigungen aus November/Dezember 2023 sind erst nach dem 31.12.2023 verkündet worden –`);
  lines.push('zum Teil Monate später. Sie galten am Stichtag nicht, obwohl ihr Ausfertigungsdatum davor liegt.');
  lines.push('');
  lines.push(table(['verkündet', 'Organ', 'ausgefertigt', 'Titel', 'Fundstelle'],
    december.crossYear.slice(0, 60).map((publication) => [
      publication.publishedAt,
      ORGAN_PROVENANCE[publication.organ].citationLabel,
      publication.enactmentDate ?? '',
      cell(publication.title).slice(0, 100),
      cell(publication.citation),
    ])));
  lines.push('');
  lines.push('## 5 Was daraus folgt');
  lines.push('');
  lines.push('1. **Verkündungsdatum vor Ausfertigungsdatum.** Die Tabelle in Abschnitt 4 zeigt den Effekt in voller Schärfe.');
  lines.push('2. **Jede geänderte Vorschrift dieses Monats ist ein Rekonstruktionsfall mit dichter Beweislage**: Der');
  lines.push('   Änderungsbefehl benennt die Vorfassung wörtlich. Für sie ist der Stichtagstext aus dem heutigen Text und');
  lines.push('   diesem Befehl rückrechenbar – das Register liefert den Beleg, nicht die Rückrechnung.');
  lines.push('3. **Vorschriften mit `absent-from-portal`** sind heute verschwunden und brauchen eine eigene Beschaffung.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/* -------------------------------------------------------------------------------- Persistenz */

export async function writeEventLedger(root: string, result: BuildResult): Promise<string[]> {
  const written: string[] = [];
  if (await writeJsonAtomic(join(root, LEDGER_PATH), result.ledger)) written.push(LEDGER_PATH);
  if (await writeFileAtomic(join(root, REPORT_PATH), result.report)) written.push(REPORT_PATH);
  if (await writeFileAtomic(join(root, DECEMBER_REPORT_PATH), result.decemberReport)) written.push(DECEMBER_REPORT_PATH);
  return written;
}

/** Kurzfassung für die Konsole. */
export function eventsSummary(result: BuildResult): string[] {
  const statistics = result.statistics;
  const lines = [
    `Ereignisregister Bayern: ${statistics.eventsTotal} Ereignisse aus ${statistics.publicationsInPeriod} Veröffentlichungen (${FIRST_POST_BASELINE_DAY} bis ${result.ledger.evaluationDate}).`,
    `  Organe: GVBl. ${statistics.eventsByOrgan.gvbl} (nachrichtliche Fassung, amtlich ist die Druckausgabe) · BayMBl. ${statistics.eventsByOrgan.baymbl} (elektronisch amtlich)`,
    `  Typen: ${EVENT_TYPES.filter((type) => statistics.eventsByType[type] > 0).map((type) => `${type} ${statistics.eventsByType[type]}`).join(', ')}`,
    `  Evidenz: strong ${statistics.evidence.strong}, supporting ${statistics.evidence.supporting}, insufficient ${statistics.evidence.insufficient}`,
    `  Ziele strukturell stark aufgelöst: ${statistics.targetsResolvedStrong}`,
    `  Baseline-only-Kandidaten: ${statistics.baselineOnly.length} · missing-predecessor: ${statistics.missingPredecessor.length} · mehrdeutig: ${statistics.ambiguous.length}`,
    `  Dezember 2023: ${statistics.december.publications.length} Verkündungen, ${statistics.december.addressingExistingNorms} gegen bestehende Vorschriften, ${statistics.december.enactedBeforeBaseline} vor dem Stichtag ausgefertigt`,
    `  Netzabrufe: ${statistics.networkRequests} (Cache: ${statistics.cacheHits}) · ${EXPORT_PROBE.result}`,
  ];
  if (statistics.pending.length > 0) lines.push(`  Sauberer Halt, offen geblieben: ${statistics.pending.join('; ')}`);
  return lines;
}
