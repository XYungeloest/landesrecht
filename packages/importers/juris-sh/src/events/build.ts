/**
 * Aufbau des Post-Baseline-Ereignisregisters Schleswig-Holstein.
 *
 * Der Lauf liest ausschließlich lokal zwischengespeicherte amtliche PDFs (Discovery-Cache
 * `.cache/schleswig-holstein/`), prüft jede Datei gegen den in `EVENT_SOURCES` festgeschriebenen
 * SHA-256 und erzeugt daraus drei Ergebnisse:
 *
 *   data/imports/juris-sh/events/ledger.json         alle Ereignisse, deterministisch sortiert
 *   data/imports/juris-sh/events/vwv-inventory.json  Inventar der Verwaltungsvorschriften mit Gl.Nr.
 *   data/audits/juris-sh/EVENT_LEDGER.md             Bericht mit Kennzahlen und Kandidatenlisten
 *
 * Kein Netzzugriff: Der Adapter ruft hier nichts ab. Fehlt eine Quelle im Cache, ist das ein Fehler
 * mit Angabe der Adresse – es wird nichts aus einer Ersatzquelle zusammengesetzt.
 *
 * Die fachlich entscheidende Regel steckt in `resolvePublicationDate`: Für eine Verkündung zählt das
 * **Ausgabedatum des Blattes**, nicht das Ausfertigungsdatum. Lässt sich die Ausgabe nicht datieren,
 * bleibt das Ereignis ohne Datum und damit ohne Beweiskraft für den Stichtag.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { AUDIT_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import type { EvidenceStrength } from '../common/evidence.ts';
import { parseAnnualContents, parseIssueSchedule, type IssueRecord, type TocDateKind, type TocDateLayout, type TocEntry } from './contents.ts';
import {
  BASELINE,
  EVALUATION_DATE,
  EVENT_LEDGER_SCHEMA,
  EVENT_TYPES,
  FIRST_POST_BASELINE_DAY,
  VWV_INVENTORY_SCHEMA,
  deriveConfidence,
  deriveEvidenceStrength,
  eventId,
  isBaselineOnlyCandidate,
  isFullTermination,
  isFutureTermination,
  isPostBaseline,
  TERMINATING_EVENT_TYPES,
  sortEvents,
  toExcerpt,
  validateLedger,
  type EventLedger,
  type EventType,
  type LedgerEvent,
  type LedgerSource,
  type PublicationOrgan,
  type VwvInventoryEntry,
} from './ledger.ts';
import { extractPdfPages, summarizeReadability, type PageDiagnostics } from './pdf-text.ts';
import { citationForEvent, classifyRegisterLine, erlassverzeichnisEventCitation, normalizeEventLine, parseErlassverzeichnis, parseSystematicOverview, type RegisterEntry, type RegisterParseResult } from './registers.ts';

export const EVENTS_DATA_DIR = `${IMPORT_DATA_DIR}/events`;
export const LEDGER_PATH = `${EVENTS_DATA_DIR}/ledger.json`;
export const VWV_INVENTORY_PATH = `${EVENTS_DATA_DIR}/vwv-inventory.json`;
export const REPORT_PATH = `${AUDIT_DIR}/EVENT_LEDGER.md`;

/** Verzeichnis des Discovery-Caches; bewusst nicht `CACHE_DIR` des Adapters, sondern die Discovery-Ablage. */
export const DISCOVERY_CACHE_DIR = '.cache/schleswig-holstein';

export type SourceKind = 'register-gvobl' | 'register-vwv' | 'toc' | 'gazette';

export interface SourceDefinition {
  id: string;
  label: string;
  organ: PublicationOrgan;
  kind: SourceKind;
  /** Dateiname im Rohcache (`.cache/schleswig-holstein/raw/`). */
  file: string;
  url: string;
  /** Erwarteter SHA-256 der Rohdatei; eine Abweichung bricht den Lauf ab. */
  sha256: string;
  /** Stand der Quelle, wie sie ihn selbst angibt. */
  asOf: string;
  /** Jahrgang, auf den sich ein Inhaltsverzeichnis oder ein Jahrgangs-PDF bezieht. */
  volumeYear?: number;
  toc?: { dateKind: TocDateKind; layout: TocDateLayout };
}

/**
 * Quellen des Registers. Alle liegen nach der Discovery im Cache; `sha256` ist der dort dokumentierte
 * Wert (`.cache/schleswig-holstein/meta/<datei>.json`).
 */
export const EVENT_SOURCES: readonly SourceDefinition[] = [
  {
    id: 'gvobl-systematische-uebersicht',
    label: 'Systematische Übersicht GVOBl. Schl.-H. (Register der geltenden Gesetze und Verordnungen)',
    organ: 'gvobl',
    kind: 'register-gvobl',
    file: 'gvobl_systematische_uebersicht.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/home/gvobl/gvobl-service/_documents/gvobl_service_systematische_uebersicht.pdf?__blob=publicationFile&v=2',
    sha256: '2e75c53a82c2b98752fabc2d4491ea1cc44c891a678d84f7b720987881dc406e',
    asOf: '2024-12-13',
  },
  {
    id: 'ab-erlassverzeichnis',
    label: 'Erlassverzeichnis Amtsbl. Schl.-H. (Register der geltenden Verwaltungsvorschriften)',
    organ: 'amtsblatt',
    kind: 'register-vwv',
    file: 'ab_erlassverzeichnis.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/home/amtsblatt/ab_service/ab_service_dokumente/ab_service_erlassverzeichnis.pdf?__blob=publicationFile&v=6',
    sha256: '4915b4712db5d3b317d092ef56e0d286beb4c55d2cf91662e6cb73288938e510',
    asOf: '2024-09-30',
  },
  {
    id: 'gvobl-jiv-2023',
    label: 'Jahresinhaltsverzeichnis GVOBl. Schl.-H. 2023',
    organ: 'gvobl',
    kind: 'toc',
    file: 'gvobl_jiv_2023.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2023/GVOBl_Jahresinhaltsverzeichnis_2023.pdf',
    sha256: '90aed1dfe6593dfc8be3781e7a6e4b99c5a5cba4a90fbb9ebf267f44aff5e64f',
    asOf: '2023-12-31',
    volumeYear: 2023,
    toc: { dateKind: 'ausfertigung', layout: 'day-with-month-headers' },
  },
  {
    id: 'gvobl-jiv-2024',
    label: 'Jahresinhaltsverzeichnis GVOBl. Schl.-H. 2024',
    organ: 'gvobl',
    kind: 'toc',
    file: 'gvobl_jiv_2024.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2024/I_Jahresinhaltsverzeichnis_2024.pdf',
    sha256: '889946ce5469141ad8b01f52d0015a1a59181a01cae9691a5c6bf5b3812e3411',
    asOf: '2024-12-31',
    volumeYear: 2024,
    toc: { dateKind: 'ausfertigung', layout: 'full-date' },
  },
  {
    id: 'ab-jiv-2023',
    label: 'Jahresinhaltsverzeichnis Amtsbl. Schl.-H. 2023',
    organ: 'amtsblatt',
    kind: 'toc',
    file: 'ab_jiv_2023.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_2023/I_Jahresinhaltsverzeichnis_2023.pdf',
    sha256: 'c7894bb2b65468f0970233f5d467fb1854e22a44c1cd2b9fc94a11185c0664e7',
    asOf: '2023-12-31',
    volumeYear: 2023,
    // Die Spaltenüberschrift lautet „Datum der Veröffentlichung“, geführt wird aber das Datum der
    // Entscheidung (Bek./Erl.). Das Verkündungsdatum kommt deshalb aus dem Ausgabenplan, nicht von hier.
    toc: { dateKind: 'veroeffentlichung', layout: 'day-with-month-headers' },
  },
  {
    id: 'gvobl-2023',
    label: 'Gesetz- und Verordnungsblatt für Schleswig-Holstein, Jahrgang 2023',
    organ: 'gvobl',
    kind: 'gazette',
    file: 'GVOBl_2023.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2023/GVOBl_2023.pdf',
    sha256: '8a971d7662c94980ba51637fc3785c363d623bd2cb8580f6d76300adb44cc2f0',
    asOf: '2023-12-31',
    volumeYear: 2023,
  },
  {
    id: 'gvobl-2024',
    label: 'Gesetz- und Verordnungsblatt für Schleswig-Holstein, Jahrgang 2024',
    organ: 'gvobl',
    kind: 'gazette',
    file: 'GVOBl_2024.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/gvobl_jahrgang_2024/II_GVOBl_Jahrgang_2024',
    sha256: '98dec69331e1b773acf3beadb2225efc33597462f6ca547bb9427a12221fd967',
    asOf: '2024-12-31',
    volumeYear: 2024,
  },
  {
    id: 'ab-2023',
    label: 'Amtsblatt für Schleswig-Holstein, Jahrgang 2023',
    organ: 'amtsblatt',
    kind: 'gazette',
    file: 'II_Amtsblatt_2023.pdf',
    url: 'https://verkuendungsportal.schleswig-holstein.de/mm/ab_jahrgang_2023/II_Amtsblatt_2023.pdf',
    sha256: '756f2747e27c10c181f7e9b1d8b4282cab28b329cd0ba1650ca85f3f5068496d',
    asOf: '2023-12-31',
    volumeYear: 2023,
  },
];

export interface BuildOptions {
  root: string;
  cacheDir?: string;
  offline?: boolean;
  /** Höchstzahl der Ereignisse je Quelle (Probelauf); ohne Angabe wird alles verarbeitet. */
  limit?: number;
  evaluationDate?: string;
}

export interface UnresolvedLine {
  sourceId: string;
  page: number;
  line: number;
  text: string;
}

export interface BuildStatistics {
  eventsTotal: number;
  eventsByType: Record<EventType, number>;
  postBaselineByType: Record<EventType, number>;
  evidence: Record<EvidenceStrength, number>;
  processing: Record<string, number>;
  unresolvedLines: number;
  readability: { sourceId: string; pages: number; clean: number; shiftCorrected: number; unreadable: number }[];
  baselineOnly: LedgerEvent[];
  futureTermination: LedgerEvent[];
  defused: LedgerEvent[];
  superseded: LedgerEvent[];
  /** Teilaufhebungen und Teilaußerkrafttreten ab dem Stichtag – Belege für den Fortbestand, kein Ende. */
  partialTermination: LedgerEvent[];
  vwvEntries: number;
  vwvWithEvents: number;
  december: DecemberAnalysis;
}

export interface DecemberPublication {
  organ: PublicationOrgan;
  issue: string;
  publishedAt: string;
  decisionDate?: string;
  title: string;
  printedPage?: number;
  citation: string;
  /** Betrifft eine am Stichtag geltende Vorschrift (Änderung einer benannten Gliederungsnummer). */
  affectsExistingNorm: boolean;
  gliederungsnummer?: string;
  /** Vor dem Stichtag ausgefertigt, aber erst danach verkündet – galt am Stichtag noch nicht. */
  signedBeforeBaseline: boolean;
}

export interface DecemberAnalysis {
  issues: { organ: PublicationOrgan; issue: string; publishedAt: string; firstPage?: number; lastPage?: number }[];
  publications: DecemberPublication[];
  crossYear: DecemberPublication[];
  /** Sammelbekanntmachungen „Weitergeltung von Verwaltungsvorschriften“, je Fundstelle und Datum. */
  collectiveContinuation: { citation: string; eventDate?: string; affectedVwv: number }[];
}

export interface BuildResult {
  ledger: EventLedger;
  inventory: { schemaVersion: typeof VWV_INVENTORY_SCHEMA; jurisdiction: 'nsh'; sourceState: 'Schleswig-Holstein'; baselineDate: string; registerAsOf: string; sourceUrl: string; sourceSha256: string; entries: VwvInventoryEntry[] };
  unresolved: UnresolvedLine[];
  statistics: BuildStatistics;
  report: string;
}

interface LoadedSource {
  definition: SourceDefinition;
  pages: PageDiagnostics[];
  usable: { page: number; text: string }[];
  summary: ReturnType<typeof summarizeReadability>;
}

async function loadSource(definition: SourceDefinition, options: BuildOptions): Promise<LoadedSource> {
  const raw = join(options.root, options.cacheDir ?? DISCOVERY_CACHE_DIR, 'raw', definition.file);
  let bytes: Buffer;
  try {
    bytes = await readFile(raw);
  } catch {
    throw new Error(`Quelle fehlt im Cache: ${raw} (${definition.url}). Der Lauf ruft nichts ab; die Datei gehört in den Discovery-Cache.`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== definition.sha256) {
    throw new Error(`SHA-256 von ${definition.file} weicht ab: erwartet ${definition.sha256}, gefunden ${digest}. Die Quelle wurde ersetzt – EVENT_SOURCES bewusst nachziehen, nicht stillschweigend übernehmen.`);
  }
  const pages = extractPdfPages(raw, { pageTextDir: join(options.root, options.cacheDir ?? DISCOVERY_CACHE_DIR, 'pagetext'), ...(options.offline ? { offline: true } : {}) });
  return { definition, pages, usable: pages.filter((page) => page.status !== 'unreadable').map((page) => ({ page: page.page, text: page.text })), summary: summarizeReadability(pages) };
}

function emptyCounter<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function hint(prefix: string, value: string | undefined): string[] {
  return value === undefined || value.trim() === '' ? [] : [`${prefix}:${value.trim()}`];
}

/* ------------------------------------------------------------------------- Registerereignisse */

/**
 * Ereignisse aus einem bereits geparsten Register. Getrennt von `eventsFromRegister`, damit die
 * Umsetzung Registerzeile → Ereignis für sich prüfbar bleibt.
 */
function registerEvents(source: { definition: SourceDefinition }, parsed: RegisterParseResult, unresolved: UnresolvedLine[]): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  const isVwv = source.definition.kind === 'register-vwv';
  for (const entry of parsed.entries) {
    const classifications = entry.eventLines.map((line) => classifyRegisterLine(line.text));
    for (const [index, line] of entry.eventLines.entries()) {
      const classified = classifications[index]!;
      // Entschärfung, zwei Wege – beide heben ein Außerkrafttreten auf, das nie eingetreten ist:
      //   1. Eine spätere Entfristung in derselben Normhistorie („geänd./entfristet“).
      //   2. Ein späteres Fristende derselben Vorschrift. Ändert ein Änderungsakt die Befristungs-
      //      vorschrift, nennt das Register beides: „§ 50 geänd. (Art. 2 LVO v. 14.11.2023)“ und
      //      „außer Kraft 30.12.2028 (Art. 2 LVO v. 14.11.2023)“. Das frühere Datum ist damit ersetzt.
      //      Ohne diese Regel gälte eine bis 2028 verlängerte Verordnung als 2023 erloschen.
      const isExpiry = classified.eventType === 'expire';
      const later = classifications.slice(index + 1);
      const entfristet = isExpiry && later.some((entry) => entry.removesExpiry);
      const superseded =
        isExpiry &&
        !entfristet &&
        classified.eventDate !== undefined &&
        classified.scope === undefined &&
        later.some((entry) => entry.eventType === 'expire' && entry.scope === undefined && entry.eventDate !== undefined && entry.eventDate > classified.eventDate!);
      const defused = entfristet || superseded;
      const citation =
        citationForEvent(normalizeEventLine(line.text), classified.keywordEnd) ?? (isVwv ? erlassverzeichnisEventCitation(line.text) : '');
      const targetGliederungsnummer = classified.referencedGliederungsnummer ?? entry.gliederungsnummer;
      const evidenceInput = {
        eventType: classified.eventType,
        ...(classified.eventDate ? { eventDate: classified.eventDate } : {}),
        citation,
        targetTitle: entry.title,
        targetGliederungsnummer,
        ...(defused ? { contradicted: true } : {}),
      };
      const strength = deriveEvidenceStrength(evidenceInput);
      const event: LedgerEvent = {
        id: eventId({ sourceId: source.definition.id, page: line.page, line: line.line, text: line.text }),
        eventType: classified.eventType,
        ...(classified.subtype ? { subtype: classified.subtype } : {}),
        ...(classified.eventDate ? { eventDate: classified.eventDate } : {}),
        ...(classified.effectiveDate ? { effectiveDate: classified.effectiveDate } : {}),
        targetTitle: entry.title,
        ...(entry.abbreviation ? { targetAbbreviation: entry.abbreviation } : {}),
        targetGliederungsnummer,
        targetIdentityHints: [
          ...hint('gl-nr', entry.gliederungsnummer),
          ...hint('ressort', entry.ressort),
          ...hint('ausfertigung', entry.issuedDate),
          ...hint('stammfundstelle', entry.citation),
          ...hint('teil', classified.scope),
          ...hint('verweis-gl-nr', classified.referencedGliederungsnummer),
        ],
        citation,
        sourceId: source.definition.id,
        sourceUrl: source.definition.url,
        sourceSha256: source.definition.sha256,
        sourcePage: line.page,
        sourceLine: line.line,
        organ: source.definition.organ,
        excerpt: toExcerpt(line.text),
        evidenceStrength: strength,
        confidence: deriveConfidence(evidenceInput),
        processingStatus: entfristet
          ? 'defused-by-entfristung'
          : superseded
            ? 'superseded-by-later-expiry'
            : classified.eventType === 'unknown'
              ? 'unparsed'
              : strength === 'insufficient'
                ? 'needs-review'
                : 'recorded',
        ...(classified.eventType === 'unknown' ? { rawText: line.text } : {}),
      };
      events.push(event);
      if (classified.eventType === 'unknown') unresolved.push({ sourceId: source.definition.id, page: line.page, line: line.line, text: line.text });
    }
  }
  return events;
}

/**
 * Registerseiten → Ereignisse. Wählt den Parser nach `kind` und liefert zugleich die Zeilen, die zu
 * keinem Muster passten. Ohne Datei- und ohne Netzzugriff – genau diese Funktion prüfen die Tests.
 */
export function eventsFromRegister(definition: SourceDefinition, pages: readonly { page: number; text: string }[]): { events: LedgerEvent[]; unresolved: UnresolvedLine[]; parsed: RegisterParseResult } {
  if (definition.kind !== 'register-gvobl' && definition.kind !== 'register-vwv') throw new Error(`Quelle ${definition.id} ist kein Register (kind=${definition.kind})`);
  const parsed = definition.kind === 'register-gvobl' ? parseSystematicOverview(pages) : parseErlassverzeichnis(pages);
  const unresolved: UnresolvedLine[] = [];
  return { events: registerEvents({ definition }, parsed, unresolved), unresolved, parsed };
}

/* ------------------------------------------------------------------- Verkündungen aus den ToCs */

/** Verkündungsdatum einer Veröffentlichung: Ausgabedatum des Blattes, sonst gar keines. */
export function resolvePublicationDate(schedule: readonly IssueRecord[], entry: TocEntry): IssueRecord | undefined {
  if (entry.issueNumber === undefined) return undefined;
  return schedule.find((record) => record.issue === entry.issueNumber);
}

export function tocEvents(source: { definition: SourceDefinition }, entries: readonly TocEntry[], schedule: readonly IssueRecord[]): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  const organLabel = source.definition.organ === 'gvobl' ? 'GVOBl. Schl.-H.' : 'Amtsbl. Schl.-H.';
  const volumeYear = source.definition.volumeYear;
  for (const entry of entries) {
    const issue = resolvePublicationDate(schedule, entry);
    const publishedAt = issue?.publishedAt;
    const citation = entry.printedPage === undefined ? '' : `${organLabel} ${volumeYear ?? ''} S. ${entry.printedPage}`.replace(/\s+/gu, ' ');
    const relations = entry.relations.length > 0 ? entry.relations : [{ kind: 'new' as const, text: '' }];
    for (const [index, relation] of relations.entries()) {
      const eventType: EventType = entry.relations.length === 0 ? 'publication-only' : relation.kind === 'amend' ? 'amend' : 'new';
      const targetGliederungsnummer = relation.gliederungsnummer;
      const evidenceInput = {
        eventType,
        ...(publishedAt ? { eventDate: publishedAt } : {}),
        citation,
        targetTitle: entry.title,
        ...(targetGliederungsnummer ? { targetGliederungsnummer } : {}),
      };
      const strength = deriveEvidenceStrength(evidenceInput);
      events.push({
        id: eventId({ sourceId: source.definition.id, page: entry.page, line: entry.line, text: `${index}|${relation.text}|${entry.title}` }),
        eventType,
        ...(publishedAt ? { eventDate: publishedAt } : {}),
        targetTitle: entry.title,
        ...(targetGliederungsnummer ? { targetGliederungsnummer } : {}),
        targetIdentityHints: [
          ...hint(entry.dateKind === 'ausfertigung' ? 'ausfertigung' : 'entscheidung', entry.date),
          ...hint('ausgabe', entry.issueNumber),
          ...hint('seite', entry.printedPage === undefined ? undefined : String(entry.printedPage)),
          ...hint('beziehung', relation.text),
          ...hint('jahrgang', volumeYear === undefined ? undefined : String(volumeYear)),
        ],
        citation,
        sourceId: source.definition.id,
        sourceUrl: source.definition.url,
        sourceSha256: source.definition.sha256,
        sourcePage: entry.page,
        sourceLine: entry.line,
        organ: source.definition.organ,
        excerpt: toExcerpt(`${entry.date ?? '?'} ${entry.title}${relation.text === '' ? '' : ` – ${relation.text}`}`),
        evidenceStrength: strength,
        confidence: deriveConfidence(evidenceInput),
        processingStatus: publishedAt === undefined ? 'needs-review' : strength === 'insufficient' ? 'needs-review' : 'recorded',
      });
    }
  }
  return events;
}

/* ------------------------------------------------------------------------------ Dezember 2023 */

const DECEMBER_START = '2023-12-02';
const DECEMBER_END = '2023-12-31';

function decemberAnalysis(
  tocBySource: Map<string, TocEntry[]>,
  scheduleByOrganYear: Map<string, IssueRecord[]>,
  vwvEvents: readonly LedgerEvent[],
): DecemberAnalysis {
  const issues: DecemberAnalysis['issues'] = [];
  for (const [key, schedule] of scheduleByOrganYear) {
    const organ = key.split(':')[0] as PublicationOrgan;
    for (const record of schedule) {
      if (record.publishedAt >= DECEMBER_START && record.publishedAt <= DECEMBER_END) {
        issues.push({ organ, issue: record.issue, publishedAt: record.publishedAt, ...(record.firstPage !== undefined ? { firstPage: record.firstPage } : {}), ...(record.lastPage !== undefined ? { lastPage: record.lastPage } : {}) });
      }
    }
  }
  issues.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.organ.localeCompare(right.organ));

  const publications: DecemberPublication[] = [];
  const crossYear: DecemberPublication[] = [];
  for (const [sourceId, entries] of tocBySource) {
    const definition = EVENT_SOURCES.find((candidate) => candidate.id === sourceId)!;
    const schedule = scheduleByOrganYear.get(`${definition.organ}:${definition.volumeYear}`) ?? [];
    const organLabel = definition.organ === 'gvobl' ? 'GVOBl. Schl.-H.' : 'Amtsbl. Schl.-H.';
    for (const entry of entries) {
      const issue = resolvePublicationDate(schedule, entry);
      if (!issue) continue;
      const relation = entry.relations[0];
      const record: DecemberPublication = {
        organ: definition.organ,
        issue: issue.issue,
        publishedAt: issue.publishedAt,
        ...(entry.date ? { decisionDate: entry.date } : {}),
        title: entry.title,
        ...(entry.printedPage !== undefined ? { printedPage: entry.printedPage } : {}),
        citation: entry.printedPage === undefined ? '' : `${organLabel} ${definition.volumeYear} S. ${entry.printedPage}`,
        affectsExistingNorm: entry.relations.some((candidate) => candidate.kind === 'amend'),
        ...(relation?.gliederungsnummer ? { gliederungsnummer: relation.gliederungsnummer } : {}),
        signedBeforeBaseline: entry.date !== undefined && entry.date <= BASELINE,
      };
      if (issue.publishedAt >= DECEMBER_START && issue.publishedAt <= DECEMBER_END) publications.push(record);
      else if (record.signedBeforeBaseline && issue.publishedAt > BASELINE && definition.volumeYear !== undefined && definition.volumeYear > 2023) crossYear.push(record);
      else if (entry.date !== undefined && entry.date >= '2023-11-01' && entry.date <= DECEMBER_END && issue.publishedAt > DECEMBER_END) crossYear.push(record);
    }
  }
  publications.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || (left.printedPage ?? 0) - (right.printedPage ?? 0));
  crossYear.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || (left.printedPage ?? 0) - (right.printedPage ?? 0));

  // Sammelbekanntmachungen „Weitergeltung von Verwaltungsvorschriften über den 31. Dezember … hinaus“.
  // Es gibt mehrere; sie werden einzeln ausgewiesen, statt eine davon stellvertretend zu nennen.
  const collective = vwvEvents.filter((event) => event.subtype === 'kollektive-weitergeltung' && event.eventDate !== undefined && event.eventDate >= '2023-11-01' && event.eventDate <= DECEMBER_END);
  const grouped = new Map<string, { citation: string; eventDate?: string; targets: Set<string> }>();
  for (const event of collective) {
    const key = `${event.eventDate ?? ''}|${event.citation}`;
    const group = grouped.get(key) ?? { citation: event.citation, ...(event.eventDate ? { eventDate: event.eventDate } : {}), targets: new Set<string>() };
    group.targets.add(event.targetGliederungsnummer ?? event.targetTitle);
    grouped.set(key, group);
  }
  const collectiveContinuation = [...grouped.values()]
    .map((group) => ({ citation: group.citation, ...(group.eventDate ? { eventDate: group.eventDate } : {}), affectedVwv: group.targets.size }))
    .sort((left, right) => (left.eventDate ?? '').localeCompare(right.eventDate ?? '') || left.citation.localeCompare(right.citation));
  return { issues, publications, crossYear, collectiveContinuation };
}

/* ------------------------------------------------------------------------------------ Aufbau */

export async function buildEventLedger(options: BuildOptions): Promise<BuildResult> {
  const evaluationDate = options.evaluationDate ?? EVALUATION_DATE;
  const loaded: LoadedSource[] = [];
  for (const definition of EVENT_SOURCES) loaded.push(await loadSource(definition, options));

  const scheduleByOrganYear = new Map<string, IssueRecord[]>();
  for (const source of loaded) {
    if (source.definition.kind !== 'gazette' || source.definition.volumeYear === undefined) continue;
    scheduleByOrganYear.set(`${source.definition.organ}:${source.definition.volumeYear}`, parseIssueSchedule(source.usable));
  }

  const unresolved: UnresolvedLine[] = [];
  const tocBySource = new Map<string, TocEntry[]>();
  let events: LedgerEvent[] = [];
  let vwvInventory: VwvInventoryEntry[] = [];
  let vwvSource: SourceDefinition | undefined;
  const vwvEvents: LedgerEvent[] = [];

  for (const source of loaded) {
    if (source.definition.kind === 'register-gvobl') {
      const produced = eventsFromRegister(source.definition, source.usable);
      unresolved.push(...produced.unresolved);
      events.push(...(options.limit === undefined ? produced.events : produced.events.slice(0, options.limit)));
      continue;
    }
    if (source.definition.kind === 'register-vwv') {
      const { events: produced, unresolved: open, parsed } = eventsFromRegister(source.definition, source.usable);
      unresolved.push(...open);
      const limited = options.limit === undefined ? produced : produced.slice(0, options.limit);
      events.push(...limited);
      vwvEvents.push(...limited);
      vwvSource = source.definition;
      vwvInventory = buildVwvInventory(parsed.entries, limited);
      continue;
    }
    if (source.definition.kind === 'toc' && source.definition.toc) {
      const parsed = parseAnnualContents(source.usable, source.definition.toc);
      tocBySource.set(source.definition.id, parsed.entries);
      const schedule = scheduleByOrganYear.get(`${source.definition.organ}:${source.definition.volumeYear}`) ?? [];
      const produced = tocEvents(source, parsed.entries, schedule);
      events.push(...(options.limit === undefined ? produced : produced.slice(0, options.limit)));
    }
  }

  events = sortEvents(events);

  const sources: LedgerSource[] = loaded.map((source) => ({
    id: source.definition.id,
    label: source.definition.label,
    organ: source.definition.organ,
    url: source.definition.url,
    sha256: source.definition.sha256,
    asOf: source.definition.asOf,
    pages: source.summary.pages,
    pagesClean: source.summary.clean,
    pagesShiftCorrected: source.summary.shiftCorrected,
    pagesUnreadable: source.summary.unreadable,
  }));

  const ledger: EventLedger = {
    schemaVersion: EVENT_LEDGER_SCHEMA,
    jurisdiction: 'nsh',
    sourceState: 'Schleswig-Holstein',
    baselineDate: BASELINE,
    evaluationDate: EVALUATION_DATE,
    sources,
    events,
  };
  const problems = validateLedger(ledger);
  if (problems.length > 0) throw new Error(`Ereignisregister ist nicht schemakonform (${problems.length} Probleme): ${problems.slice(0, 5).join('; ')}`);

  const statistics = summarize(ledger, unresolved, vwvInventory, decemberAnalysis(tocBySource, scheduleByOrganYear, vwvEvents), evaluationDate);
  const inventory = {
    schemaVersion: VWV_INVENTORY_SCHEMA,
    jurisdiction: 'nsh' as const,
    sourceState: 'Schleswig-Holstein' as const,
    baselineDate: BASELINE,
    registerAsOf: vwvSource?.asOf ?? '',
    sourceUrl: vwvSource?.url ?? '',
    sourceSha256: vwvSource?.sha256 ?? '',
    entries: vwvInventory,
  };
  return { ledger, inventory, unresolved, statistics, report: renderReport(ledger, statistics, evaluationDate) };
}

function buildVwvInventory(entries: readonly RegisterEntry[], events: readonly LedgerEvent[]): VwvInventoryEntry[] {
  const byGliederungsnummer = new Map<string, LedgerEvent[]>();
  for (const event of events) {
    const key = event.targetGliederungsnummer ?? '';
    if (key === '') continue;
    byGliederungsnummer.set(key, [...(byGliederungsnummer.get(key) ?? []), event]);
  }
  return entries
    .map((entry) => {
      const own = byGliederungsnummer.get(entry.gliederungsnummer) ?? [];
      return {
        gliederungsnummer: entry.gliederungsnummer,
        title: entry.title,
        ...(entry.ressort ? { ressort: entry.ressort } : {}),
        ...(entry.issuedAs ? { issuedAs: entry.issuedAs } : {}),
        ...(entry.issuedDate ? { issuedDate: entry.issuedDate } : {}),
        citation: entry.citation,
        sourcePage: entry.page,
        eventCount: own.length,
        postBaselineEventCount: own.filter((event) => isPostBaseline(event)).length,
        eventIds: own.map((event) => event.id).sort(),
      };
    })
    .sort((left, right) => compareGliederungsnummer(left.gliederungsnummer, right.gliederungsnummer));
}

/** Gliederungsnummern numerisch je Abschnitt vergleichen (`1101.9` vor `1101.34`). */
export function compareGliederungsnummer(left: string, right: string): number {
  const parts = (value: string): (number | string)[] => value.split(/[.\-]/u).map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function summarize(ledger: EventLedger, unresolved: readonly UnresolvedLine[], inventory: readonly VwvInventoryEntry[], december: DecemberAnalysis, evaluationDate: string): BuildStatistics {
  const eventsByType = emptyCounter(EVENT_TYPES);
  const postBaselineByType = emptyCounter(EVENT_TYPES);
  const evidence: Record<EvidenceStrength, number> = { strong: 0, supporting: 0, insufficient: 0, contradictory: 0 };
  const processing: Record<string, number> = {};
  for (const event of ledger.events) {
    eventsByType[event.eventType] += 1;
    if (isPostBaseline(event)) postBaselineByType[event.eventType] += 1;
    evidence[event.evidenceStrength] += 1;
    processing[event.processingStatus] = (processing[event.processingStatus] ?? 0) + 1;
  }
  return {
    eventsTotal: ledger.events.length,
    eventsByType,
    postBaselineByType,
    evidence,
    processing,
    unresolvedLines: unresolved.length,
    readability: ledger.sources.map((source) => ({ sourceId: source.id, pages: source.pages, clean: source.pagesClean, shiftCorrected: source.pagesShiftCorrected, unreadable: source.pagesUnreadable })),
    baselineOnly: ledger.events.filter((event) => isBaselineOnlyCandidate(event, evaluationDate)),
    futureTermination: ledger.events.filter((event) => isFutureTermination(event, evaluationDate)),
    defused: ledger.events.filter((event) => event.processingStatus === 'defused-by-entfristung'),
    superseded: ledger.events.filter((event) => event.processingStatus === 'superseded-by-later-expiry'),
    partialTermination: ledger.events.filter((event) => TERMINATING_EVENT_TYPES.includes(event.eventType) && !isFullTermination(event) && isPostBaseline(event)),
    vwvEntries: inventory.length,
    vwvWithEvents: inventory.filter((entry) => entry.eventCount > 0).length,
    december,
  };
}

/* ------------------------------------------------------------------------------------ Bericht */

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function renderReport(ledger: EventLedger, statistics: BuildStatistics, evaluationDate: string): string {
  const lines: string[] = [];
  lines.push('# Ereignisregister Schleswig-Holstein (Post-Baseline)');
  lines.push('');
  lines.push(`Erzeugt von \`node scripts/import-juris-sh.ts events --write\`. Schema \`${ledger.schemaVersion}\`.`);
  lines.push(`Stichtag **${ledger.baselineDate}**; als Ereignis „nach dem Stichtag“ zählt ein Datum ab **${FIRST_POST_BASELINE_DAY}**.`);
  lines.push(`Auswertungsstichtag **${evaluationDate}** (Konstante, kein Tagesdatum – ein Wiederholungslauf erzeugt denselben Bericht).`);
  lines.push('');
  lines.push('Das Register enthält ausschließlich Belege aus den amtlichen Verkündungsblättern. Es erzeugt keinen Normtext');
  lines.push('und trifft keine Entscheidung über die Geltung einer Vorschrift; es liefert die Belege, aus denen eine spätere');
  lines.push('Stichtagsprüfung entscheidet.');
  lines.push('');
  lines.push('## 1 Quellen');
  lines.push('');
  lines.push(table(['Quelle', 'Stand', 'Seiten', 'sauber', 'versatzkorrigiert', 'unlesbar', 'SHA-256 (Anfang)'],
    ledger.sources.map((source) => [source.label, source.asOf, String(source.pages), String(source.pagesClean), String(source.pagesShiftCorrected), String(source.pagesUnreadable), `\`${source.sha256.slice(0, 16)}…\``])));
  lines.push('');
  lines.push('Adressen:');
  for (const source of ledger.sources) lines.push(`- \`${source.id}\`: ${source.url}`);
  lines.push('');
  lines.push('## 2 Ereignisse');
  lines.push('');
  lines.push(`Gesamt: **${statistics.eventsTotal}**, davon mit Datum ab ${FIRST_POST_BASELINE_DAY}: **${Object.values(statistics.postBaselineByType).reduce((sum, value) => sum + value, 0)}**.`);
  lines.push('');
  lines.push(table(['Ereignistyp', 'gesamt', `ab ${FIRST_POST_BASELINE_DAY}`],
    EVENT_TYPES.filter((type) => statistics.eventsByType[type] > 0).map((type) => [`\`${type}\``, String(statistics.eventsByType[type]), String(statistics.postBaselineByType[type])])));
  lines.push('');
  lines.push('## 3 Evidenz und Verarbeitungsstand');
  lines.push('');
  lines.push(table(['Beweisklasse', 'Anzahl'], (['strong', 'supporting', 'insufficient', 'contradictory'] as const).map((strength) => [`\`${strength}\``, String(statistics.evidence[strength])])));
  lines.push('');
  lines.push(table(['Verarbeitungsstand', 'Anzahl'], Object.entries(statistics.processing).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [`\`${key}\``, String(value)])));
  lines.push('');
  lines.push(`Nicht zuordenbare Registerzeilen: **${statistics.unresolvedLines}** (als \`unknown\` mit Rohtext im Register geführt, nicht verworfen).`);
  lines.push(`Entschärfte Außerkrafttreten (spätere Entfristung in derselben Normhistorie): **${statistics.defused.length}**.`);
  lines.push(`Ersetzte Außerkrafttreten (späteres Fristende derselben Vorschrift, verlängerte Befristung): **${statistics.superseded.length}**.`);
  lines.push('');
  lines.push('## 4 Baseline-only-Kandidaten');
  lines.push('');
  lines.push('Vorschriften mit starkem Beleg für ein Ende (Aufhebung, Ersetzung, Ablauf) zwischen');
  lines.push(`${FIRST_POST_BASELINE_DAY} und ${evaluationDate}. Sie galten am Stichtag und fehlen im heutigen Bestand –`);
  lines.push('genau diese Vorschriften muss ein späterer Import zusätzlich beschaffen.');
  lines.push('');
  lines.push(`Anzahl: **${statistics.baselineOnly.length}**.`);
  lines.push('');
  lines.push(table(['Datum', 'Typ', 'Gl.Nr.', 'Titel', 'Fundstelle'],
    statistics.baselineOnly.map((event) => [event.eventDate ?? '', `\`${event.eventType}\``, event.targetGliederungsnummer ?? '', event.targetTitle.slice(0, 110), event.citation])));
  lines.push('');
  lines.push(`Zusätzlich **${statistics.futureTermination.length}** Vorschriften mit einem erst nach dem ${evaluationDate} wirkenden Ende (künftige Befristung).`);
  lines.push('Auch sie galten am Stichtag; sie gelten aber weiterhin und sind deshalb keine baseline-only-Kandidaten.');
  lines.push('');
  lines.push(`Nicht gezählt sind **${statistics.partialTermination.length}** Teilaufhebungen und Teilaußerkrafttreten ab ${FIRST_POST_BASELINE_DAY}`);
  lines.push('(z. B. „§ 251 Abs. 4 … außer Kraft 19.3.2024“). Sie beweisen das Gegenteil eines Endes: Die Vorschrift bestand');
  lines.push('zu diesem Zeitpunkt im Übrigen fort und galt damit auch am Stichtag.');
  lines.push('');
  lines.push('## 5 Dezember 2023 – die kritische Zone um den Stichtag');
  lines.push('');
  lines.push('Maßgeblich ist das **Ausgabedatum des Blattes**, nicht das Ausfertigungs- oder Entscheidungsdatum.');
  lines.push('');
  lines.push(table(['Organ', 'Ausgabe', 'ausgegeben', 'gedruckte Seiten'],
    statistics.december.issues.map((issue) => [issue.organ === 'gvobl' ? 'GVOBl.' : 'Amtsbl.', issue.issue, issue.publishedAt, issue.firstPage === undefined ? '' : `${issue.firstPage}–${issue.lastPage}`])));
  lines.push('');
  const december = statistics.december.publications;
  lines.push(`In diesen Ausgaben verkündet: **${december.length}** Veröffentlichungen mit Eintrag im Jahresinhaltsverzeichnis.`);
  lines.push(`Davon ändern **${december.filter((entry) => entry.affectsExistingNorm).length}** eine namentlich benannte Vorschrift – diese Vorschriften galten am Stichtag.`);
  lines.push(`**${december.filter((entry) => entry.signedBeforeBaseline).length}** wurden vor dem Stichtag ausgefertigt bzw. entschieden, aber erst danach verkündet: Sie galten am ${ledger.baselineDate} **noch nicht**.`);
  lines.push('');
  lines.push(table(['verkündet', 'Ausgabe', 'Datum der Entscheidung', 'vor Stichtag ausgefertigt', 'ändert', 'Titel', 'Fundstelle'],
    december.map((entry) => [entry.publishedAt, `${entry.organ === 'gvobl' ? 'GVOBl.' : 'Amtsbl.'} ${entry.issue}`, entry.decisionDate ?? '', entry.signedBeforeBaseline ? 'ja' : 'nein', entry.affectsExistingNorm ? entry.gliederungsnummer ?? 'ja' : '–', entry.title.slice(0, 90), entry.citation])));
  lines.push('');
  lines.push('### Jahrgangswechsel');
  lines.push('');
  lines.push(`**${statistics.december.crossYear.length}** Ausfertigungen aus November/Dezember 2023 sind erst im Folgejahrgang verkündet worden.`);
  lines.push('Sie galten am Stichtag nicht, obwohl ihr Ausfertigungsdatum davor liegt.');
  lines.push('');
  lines.push(table(['verkündet', 'Ausgabe', 'ausgefertigt', 'Titel', 'Fundstelle'],
    statistics.december.crossYear.map((entry) => [entry.publishedAt, `${entry.organ === 'gvobl' ? 'GVOBl.' : 'Amtsbl.'} ${entry.issue}`, entry.decisionDate ?? '', entry.title.slice(0, 100), entry.citation])));
  lines.push('');
  lines.push('### Kollektive Weitergeltung');
  lines.push('');
  lines.push('Sammelbekanntmachungen „Weitergeltung von Verwaltungsvorschriften über den 31. Dezember … hinaus“, wie das');
  lines.push('Erlassverzeichnis sie bei den einzelnen Vorschriften vermerkt. Jeder Vermerk belegt, dass die betroffene');
  lines.push('Verwaltungsvorschrift am Stichtag galt und darüber hinaus weitergilt.');
  lines.push('');
  lines.push(table(['Bek. vom', 'Fundstelle', 'betroffene Verwaltungsvorschriften'],
    statistics.december.collectiveContinuation.map((entry) => [entry.eventDate ?? '', entry.citation === '' ? '–' : entry.citation, String(entry.affectedVwv)])));
  lines.push('');
  lines.push('## 6 Inventar der Verwaltungsvorschriften');
  lines.push('');
  lines.push(`Das Erlassverzeichnis (Stand ${ledger.sources.find((source) => source.id === 'ab-erlassverzeichnis')?.asOf ?? ''}) führt **${statistics.vwvEntries}** Verwaltungsvorschriften mit eindeutiger Gliederungsnummer;`);
  lines.push(`bei **${statistics.vwvWithEvents}** davon ist mindestens ein Ereignis vermerkt. Inventar: \`${VWV_INVENTORY_PATH}\`.`);
  lines.push('');
  lines.push('## 7 Grenzen');
  lines.push('');
  lines.push('- Beide Register führen nur den **geltenden** Bestand und datieren **nach** dem Stichtag (Systematische Übersicht Ende 2024, Erlassverzeichnis 30.09.2024). Zwischen 2023-12-01 und dem Registerstand aufgehobene Vorschriften fehlen dort und sind nur aus den Verkündungsblättern zu gewinnen.');
  lines.push('- Für das GVOBl. ab 2025 gibt es keinen robots-konform erreichbaren Index (Fundstellennachweis „noch nicht verfügbar“, Portalsuche und Sitemap-Teildateien gesperrt). Ereignisse ab 2025 stehen hier nur, soweit die Register sie führen.');
  lines.push('- Nachrichtenblatt Schule und Hochschul-Nachrichtenblatt sind eigenständige Verkündungsorgane und in diesem Register **nicht** enthalten.');
  lines.push('- Das Justizministerialblatt Teil B ist per robots.txt für automatisierte Abrufe gesperrt und bleibt unerhoben.');
  lines.push('- Die Archiv-PDFs sind amtliche Informationskopien, nicht die maßgebliche gedruckte Ausgabe.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------------------- Persistenz */

export async function writeEventLedger(root: string, result: BuildResult): Promise<string[]> {
  const written: string[] = [];
  if (await writeJsonAtomic(join(root, LEDGER_PATH), result.ledger)) written.push(LEDGER_PATH);
  if (await writeJsonAtomic(join(root, VWV_INVENTORY_PATH), result.inventory)) written.push(VWV_INVENTORY_PATH);
  if (await writeFileAtomic(join(root, REPORT_PATH), result.report)) written.push(REPORT_PATH);
  return written;
}
