/**
 * Datenmodell des Post-Baseline-Ereignisregisters Schleswig-Holstein (`juris-sh-event-ledger/1`).
 *
 * Zweck: Aus den amtlichen Registern und Inhaltsverzeichnissen der beiden Verkündungsblätter wird je
 * Registerzeile ein Ereignis gebildet. Das Register beantwortet zwei Fragen, die für den Stichtag
 * 2023-12-01 entscheidend sind:
 *
 *   1. Welche Vorschrift ist nach dem Stichtag aufgehoben, ersetzt, ausgelaufen oder neu gefasst worden?
 *      Ein solches Ereignis beweist, dass die Vorschrift am Stichtag noch galt („baseline-only-Kandidat“).
 *   2. Welche Verwaltungsvorschriften mit Gliederungsnummer waren im Bestand?
 *
 * Es wird nichts geraten. Eine Zeile, die sich nicht sicher zuordnen lässt, wird als `unknown` mit ihrem
 * Rohtext erfasst – nie verworfen und nie mit einem erfundenen Datum ergänzt. Das Register enthält
 * ausschließlich Belege; es erzeugt keinen Normtext.
 *
 * Evidenzklassen sind identisch zum Adapter (`common/evidence.ts`), damit Auswertungen über den
 * West-Bestand und den NSH-Bestand vergleichbar bleiben:
 *   strong         eindeutiges Datum UND Fundstelle UND eindeutig benanntes Ziel
 *   supporting     amtlicher Beleg, dem eines dieser drei Merkmale fehlt
 *   insufficient   bloßer Hinweis (Rohzeile, unklares Ziel, kein Datum, keine Fundstelle)
 *   contradictory  der Beleg steht gegen einen anderen starken Beleg derselben Vorschrift
 *                  (Regelfall in Schleswig-Holstein: `außer Kraft <Datum>` und später `geänd./entfristet`)
 *
 * `eventDate` ist bewusst optional: Zahlreiche Registerzeilen („teilw. außer Kraft (LVO v. …)“,
 * „Keine Befristung!“) nennen kein Ereignisdatum. Ein solches Ereignis wird erfasst, ist aber nie
 * `strong` und zählt nie als Nachweis für den Stichtag. Ein Datum wird nie ergänzt.
 */
import { createHash } from 'node:crypto';

import { EVIDENCE_STRENGTHS, type EvidenceStrength } from '../common/evidence.ts';

export const EVENT_LEDGER_SCHEMA = 'juris-sh-event-ledger/1' as const;
export const VWV_INVENTORY_SCHEMA = 'juris-sh-vwv-inventory/1' as const;

/** Stichtag des Ausgangsrechtsstands; Ereignisse ab dem Folgetag sind „nach dem Stichtag“. */
export const BASELINE = '2023-12-01' as const;
export const FIRST_POST_BASELINE_DAY = '2023-12-02' as const;

/**
 * Auswertungsstichtag des Berichts: Trennt bereits eingetretene Ereignisse von künftigen Befristungen.
 * Bewusst eine Konstante und nicht `new Date()`, damit ein Wiederholungslauf denselben Bericht erzeugt.
 * Wird die Konstante erhöht, wandern abgelaufene Befristungen von „künftig“ zu „eingetreten“.
 */
export const EVALUATION_DATE = '2026-09-17' as const;

export const EVENT_TYPES = ['new', 'amend', 'repeal', 'replace', 'expire', 'recast', 'commencement', 'correction', 'publication-only', 'unknown'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Ereignisarten, die das Ende einer Vorschrift belegen – nur sie tragen einen baseline-only-Kandidaten. */
export const TERMINATING_EVENT_TYPES: readonly EventType[] = ['repeal', 'replace', 'expire'];

/**
 * Subtypen, die trotz `repeal`/`expire` **kein** Ende der Vorschrift belegen. Ein
 * Teilaußerkrafttreten (`§ 251 Abs. 4 … außer Kraft 19.3.2024`) beweist im Gegenteil, dass die
 * Vorschrift im Übrigen fortbesteht; ein „Ablauf der Wahlperiode“ nennt kein Datum.
 */
export const PARTIAL_TERMINATION_SUBTYPES: readonly EventSubtype[] = ['teilausserkrafttreten', 'teilaufhebung', 'ablauf-legislaturperiode'];

/** Belegt das Ereignis das Ende der ganzen Vorschrift (und nicht nur eines Teils)? */
export function isFullTermination(event: Pick<LedgerEvent, 'eventType' | 'subtype'>): boolean {
  if (!TERMINATING_EVENT_TYPES.includes(event.eventType)) return false;
  return event.subtype === undefined || !PARTIAL_TERMINATION_SUBTYPES.includes(event.subtype);
}

/**
 * Feinunterscheidung innerhalb eines Ereignistyps. Sie ist fachlich nötig, weil eine Entfristung
 * formal eine Änderung ist, für die Stichtagsprüfung aber eine Befristung aufhebt.
 */
export const EVENT_SUBTYPES = [
  'entfristung',
  'befristungsverlaengerung',
  'kollektive-weitergeltung',
  'teilaufhebung',
  'teilausserkrafttreten',
  'berichtigung',
  'ressortbezeichnung',
  'neufassung',
  'aenderungsbefehl',
  'ablauf-legislaturperiode',
  'unbefristet',
  'zustaendigkeitsuebertragung',
] as const;
export type EventSubtype = (typeof EVENT_SUBTYPES)[number];

/**
 * Verarbeitungsstand eines Ereignisses:
 *   recorded                 regulär erfasst
 *   defused-by-entfristung   ein `außer Kraft`-Eintrag, den eine spätere Entfristung derselben
 *                            Normhistorie aufgehoben hat – zählt nicht als Ende
 *   superseded-by-later-expiry  ein `außer Kraft`-Eintrag, den ein späteres Fristende derselben
 *                            Vorschrift ersetzt hat (verlängerte Befristung) – zählt nicht als Ende
 *   needs-review             erkannt, aber nicht entscheidungsreif (Ziel oder Datum unklar)
 *   unparsed                 Zeile nicht zuordenbar; nur Rohtext, Typ `unknown`
 */
export const EVENT_PROCESSING_STATUSES = ['recorded', 'defused-by-entfristung', 'superseded-by-later-expiry', 'needs-review', 'unparsed'] as const;
export type EventProcessingStatus = (typeof EVENT_PROCESSING_STATUSES)[number];

/** Verkündungsorgan, aus dem der Beleg stammt. */
export const PUBLICATION_ORGANS = ['gvobl', 'amtsblatt'] as const;
export type PublicationOrgan = (typeof PUBLICATION_ORGANS)[number];

/** Höchstlänge des wörtlichen Ausschnitts; längere Zeilen werden mit „…“ gekürzt. */
export const EXCERPT_MAX_LENGTH = 200;

export interface LedgerEvent {
  /** Stabil aus Quelle, Seite, Zeile und Zeileninhalt; ändert sich nur, wenn sich die Quelle ändert. */
  id: string;
  eventType: EventType;
  subtype?: EventSubtype;
  /** Datum des Ereignisses (ISO). Fehlt, wenn die Registerzeile keines nennt – dann nie `strong`. */
  eventDate?: string;
  /** Datum, ab dem die Rechtsfolge wirkt (neues Fristende, Inkrafttreten der ablösenden Vorschrift). */
  effectiveDate?: string;
  targetTitle: string;
  targetAbbreviation?: string;
  targetGliederungsnummer?: string;
  /** Weitere Merkmale zur späteren Zuordnung (Gl.Nr., Titel, Ausfertigung, Fundstelle, Ressort). */
  targetIdentityHints: string[];
  /** Fundstelle des Ereignisses im Verkündungsblatt; leer, wenn die Zeile keine nennt. */
  citation: string;
  sourceId: string;
  sourceUrl: string;
  sourceSha256: string;
  sourcePage: number;
  sourceLine: number;
  organ: PublicationOrgan;
  excerpt: string;
  evidenceStrength: EvidenceStrength;
  /** 0…1, aus denselben Merkmalen abgeleitet wie `evidenceStrength` – siehe `deriveConfidence`. */
  confidence: number;
  processingStatus: EventProcessingStatus;
  /** Ungekürzte Zeile; nur bei `unknown`/`unparsed` gesetzt, damit nichts verloren geht. */
  rawText?: string;
}

export interface VwvInventoryEntry {
  gliederungsnummer: string;
  title: string;
  /** Ressortkürzel des Erlassverzeichnisses (z. B. `IV 16`, `StK OD 12`); fehlt bei Sammeleinträgen. */
  ressort?: string;
  /** Art der Veröffentlichung laut Register: `Bek.`, `Erl.`, `Rd.Erl.`, `Gem.Erl.` … */
  issuedAs?: string;
  issuedDate?: string;
  /** Fundstelle im Amtsblatt (`Seite` oder `Jahrgang/Seite`), so wie das Register sie führt. */
  citation: string;
  sourcePage: number;
  eventCount: number;
  /** Ereignisse mit Datum ab dem Stichtag + 1 Tag. */
  postBaselineEventCount: number;
  /** Ereignis-IDs dieses Eintrags, damit Inventar und Register verknüpft bleiben. */
  eventIds: string[];
}

export interface LedgerSource {
  id: string;
  label: string;
  organ: PublicationOrgan;
  url: string;
  sha256: string;
  /** Stand der Quelle (Registerstand bzw. Jahrgang), so wie die Quelle ihn selbst angibt. */
  asOf: string;
  pages: number;
  pagesClean: number;
  pagesShiftCorrected: number;
  pagesUnreadable: number;
}

export interface EventLedger {
  schemaVersion: typeof EVENT_LEDGER_SCHEMA;
  jurisdiction: 'nsh';
  sourceState: 'Schleswig-Holstein';
  baselineDate: typeof BASELINE;
  evaluationDate: typeof EVALUATION_DATE;
  sources: LedgerSource[];
  events: LedgerEvent[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

/** Kürzt einen Ausschnitt auf `EXCERPT_MAX_LENGTH` und normalisiert Leerraum. */
export function toExcerpt(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return normalized.length <= EXCERPT_MAX_LENGTH ? normalized : `${normalized.slice(0, EXCERPT_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Stabile Ereigniskennung aus Quelle, Seite, Zeile und normalisiertem Zeileninhalt.
 * Der Inhaltsanteil sorgt dafür, dass eine geänderte Quelle neue Kennungen erzeugt, statt alte Belege
 * stillschweigend umzudeuten.
 */
export function eventId(input: { sourceId: string; page: number; line: number; text: string }): string {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(input.sourceId)) throw new Error(`Ungültige Quellkennung ${input.sourceId} (erlaubt: a-z, 0-9, Bindestrich)`);
  if (!Number.isInteger(input.page) || input.page < 1) throw new Error(`Ungültige Seitenzahl ${input.page}`);
  if (!Number.isInteger(input.line) || input.line < 1) throw new Error(`Ungültige Zeilennummer ${input.line}`);
  const material = [input.sourceId, String(input.page), String(input.line), input.text.replace(/\s+/gu, ' ').trim()].join('␟');
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 10);
  return `${input.sourceId}-p${String(input.page).padStart(4, '0')}-l${String(input.line).padStart(3, '0')}-${digest}`;
}

export interface EvidenceInput {
  eventType: EventType;
  eventDate?: string;
  citation: string;
  targetTitle: string;
  targetGliederungsnummer?: string;
  /** Der Beleg widerspricht einem anderen starken Beleg derselben Vorschrift. */
  contradicted?: boolean;
}

/**
 * Beweisklasse eines Ereignisses. `strong` setzt alle drei Merkmale voraus: Datum, Fundstelle und ein
 * eindeutig benanntes Ziel (Gliederungsnummer oder ein Titel, der mehr als ein Wort trägt).
 */
export function deriveEvidenceStrength(input: EvidenceInput): EvidenceStrength {
  if (input.contradicted) return 'contradictory';
  const hasDate = input.eventDate !== undefined && ISO_DATE.test(input.eventDate);
  const hasCitation = input.citation.trim() !== '';
  const hasTarget = (input.targetGliederungsnummer ?? '').trim() !== '' || input.targetTitle.trim().split(/\s+/u).length > 1;
  const known = input.eventType !== 'unknown';
  if (hasDate && hasCitation && hasTarget && known) return 'strong';
  if (known && hasTarget && (hasDate || hasCitation)) return 'supporting';
  return 'insufficient';
}

/** Zahlenwert zur Beweisklasse; dieselben Merkmale, nur feiner aufgelöst (zwei Nachkommastellen). */
export function deriveConfidence(input: EvidenceInput): number {
  if (input.contradicted) return 0.3;
  let score = 0.4;
  if (input.eventDate !== undefined && ISO_DATE.test(input.eventDate)) score += 0.25;
  if (input.citation.trim() !== '') score += 0.15;
  if ((input.targetGliederungsnummer ?? '').trim() !== '') score += 0.1;
  if (input.eventType !== 'unknown') score += 0.1;
  return Math.round(Math.min(1, score) * 100) / 100;
}

/** Ereignis nach dem Stichtag? Ohne Datum lautet die Antwort immer „nein“ – es wird nichts unterstellt. */
export function isPostBaseline(event: Pick<LedgerEvent, 'eventDate'>): boolean {
  return event.eventDate !== undefined && event.eventDate >= FIRST_POST_BASELINE_DAY;
}

/**
 * Baseline-only-Kandidat: Die Vorschrift endete nach dem Stichtag und vor dem Auswertungsstichtag – sie
 * galt am Stichtag, ist heute aber nicht mehr im geltenden Bestand. Ein entschärftes (entfristetes)
 * Außerkrafttreten zählt nicht, ein erst künftig wirkendes Ende ebenfalls nicht.
 */
export function isBaselineOnlyCandidate(event: LedgerEvent, evaluationDate: string = EVALUATION_DATE): boolean {
  if (!isFullTermination(event)) return false;
  if (event.processingStatus !== 'recorded') return false;
  if (event.evidenceStrength !== 'strong') return false;
  const date = event.eventDate;
  return date !== undefined && date >= FIRST_POST_BASELINE_DAY && date <= evaluationDate;
}

/** Künftige Befristung: belegt ebenfalls die Geltung am Stichtag, aber die Vorschrift gilt weiter. */
export function isFutureTermination(event: LedgerEvent, evaluationDate: string = EVALUATION_DATE): boolean {
  if (!isFullTermination(event)) return false;
  if (event.processingStatus !== 'recorded') return false;
  const date = event.eventDate;
  return date !== undefined && date > evaluationDate;
}

/** Deterministische Ordnung: Datum (ohne Datum zuletzt), dann Quelle, Seite, Zeile, Kennung. */
export function compareEvents(left: LedgerEvent, right: LedgerEvent): number {
  const leftDate = left.eventDate ?? '9999-12-31';
  const rightDate = right.eventDate ?? '9999-12-31';
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
  if (left.sourceId !== right.sourceId) return left.sourceId < right.sourceId ? -1 : 1;
  if (left.sourcePage !== right.sourcePage) return left.sourcePage - right.sourcePage;
  if (left.sourceLine !== right.sourceLine) return left.sourceLine - right.sourceLine;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function sortEvents(events: readonly LedgerEvent[]): LedgerEvent[] {
  return [...events].sort(compareEvents);
}

/** Schemaprüfung eines Ereignisses (fail-closed): Liste der Probleme, leer bei gültigem Ereignis. */
export function validateLedgerEvent(value: unknown, where = 'Ereignis'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt`];
  const event = value as Record<string, unknown>;
  if (typeof event.id !== 'string' || event.id.trim() === '') problems.push(`${where}: id fehlt`);
  if (!(EVENT_TYPES as readonly string[]).includes(String(event.eventType))) problems.push(`${where}: unbekannter Ereignistyp ${String(event.eventType)}`);
  if (event.subtype !== undefined && !(EVENT_SUBTYPES as readonly string[]).includes(String(event.subtype))) problems.push(`${where}: unbekannter Subtyp ${String(event.subtype)}`);
  for (const field of ['eventDate', 'effectiveDate'] as const) {
    if (event[field] !== undefined && (typeof event[field] !== 'string' || !ISO_DATE.test(event[field] as string))) problems.push(`${where}: ${field} ist kein ISO-Datum`);
  }
  if (typeof event.targetTitle !== 'string' || event.targetTitle.trim() === '') problems.push(`${where}: targetTitle fehlt`);
  if (!Array.isArray(event.targetIdentityHints) || event.targetIdentityHints.some((hint) => typeof hint !== 'string')) problems.push(`${where}: targetIdentityHints ist keine Liste von Zeichenketten`);
  if (typeof event.citation !== 'string') problems.push(`${where}: citation fehlt`);
  if (typeof event.sourceUrl !== 'string' || !(event.sourceUrl as string).startsWith('https://')) problems.push(`${where}: sourceUrl fehlt oder ist nicht https`);
  if (typeof event.sourceSha256 !== 'string' || !SHA256.test(event.sourceSha256 as string)) problems.push(`${where}: sourceSha256 ist kein SHA-256`);
  if (!Number.isInteger(event.sourcePage) || (event.sourcePage as number) < 1) problems.push(`${where}: sourcePage fehlt`);
  if (!Number.isInteger(event.sourceLine) || (event.sourceLine as number) < 1) problems.push(`${where}: sourceLine fehlt`);
  if (!(PUBLICATION_ORGANS as readonly string[]).includes(String(event.organ))) problems.push(`${where}: unbekanntes Organ ${String(event.organ)}`);
  if (typeof event.excerpt !== 'string' || (event.excerpt as string).length > EXCERPT_MAX_LENGTH) problems.push(`${where}: excerpt fehlt oder ist länger als ${EXCERPT_MAX_LENGTH} Zeichen`);
  if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(String(event.evidenceStrength))) problems.push(`${where}: unbekannte Beweisklasse ${String(event.evidenceStrength)}`);
  if (typeof event.confidence !== 'number' || (event.confidence as number) < 0 || (event.confidence as number) > 1) problems.push(`${where}: confidence liegt nicht in [0,1]`);
  if (!(EVENT_PROCESSING_STATUSES as readonly string[]).includes(String(event.processingStatus))) problems.push(`${where}: unbekannter processingStatus ${String(event.processingStatus)}`);
  if (event.evidenceStrength === 'strong' && (event.eventDate === undefined || String(event.citation ?? '').trim() === '')) problems.push(`${where}: starker Beleg ohne Datum oder Fundstelle`);
  if (event.eventType === 'unknown' && typeof event.rawText !== 'string') problems.push(`${where}: unknown-Ereignis ohne rawText`);
  return problems;
}

export function validateLedger(ledger: EventLedger): string[] {
  const problems: string[] = [];
  if (ledger.schemaVersion !== EVENT_LEDGER_SCHEMA) problems.push(`Unbekannte Schemaversion ${ledger.schemaVersion}`);
  const seen = new Set<string>();
  for (const [index, event] of ledger.events.entries()) {
    problems.push(...validateLedgerEvent(event, `events[${index}]`));
    if (seen.has(event.id)) problems.push(`events[${index}]: doppelte Kennung ${event.id}`);
    seen.add(event.id);
  }
  const sorted = sortEvents(ledger.events);
  if (sorted.some((event, index) => event.id !== ledger.events[index]?.id)) problems.push('events sind nicht deterministisch sortiert');
  return problems;
}
