/**
 * Datenmodell des Post-Baseline-Ereignisregisters Bayern (`bayernrecht-event-ledger/1`).
 *
 * Zweck. BAYERN.RECHT führt ausschließlich den heutigen Stand und stellt außer Kraft getretene
 * Vorschriften ausdrücklich nicht bereit (`docs/BAYERN_SOURCE_DISCOVERY.md`, Abschnitt 6). Für den
 * Stichtag 2023-12-01 gibt es aus dem Portal deshalb keine Baseline. Die amtlichen Verkündungsorgane
 * liefern zwar keinen konsolidierten Normtext, wohl aber die Belege, die eine spätere Stichtagsprüfung
 * als Erstes braucht:
 *
 *   1. Welche Vorschrift wurde nach dem 2023-12-01 aufgehoben, ersetzt oder ist abgelaufen?
 *      Ist ihr Vorgänger heute nicht mehr im Portal, dann galt sie am Stichtag und fehlt heute
 *      („baseline-only-Kandidat“). Das ist der wichtigste Vollständigkeitsnachweis.
 *   2. Welche Vorschrift hat sich seit dem Stichtag geändert? Für den unveränderten Rest ist der
 *      heutige Text zugleich der Stichtagstext.
 *
 * Das Register **entscheidet nicht** über die Geltung einer Vorschrift und **erzeugt keinen Normtext**.
 * Es sammelt Belege in derselben Evidenzsprache wie der Adapter (`src/common/evidence.ts`), damit
 * Auswertungen über West, NSH und BayWü vergleichbar bleiben.
 *
 * Provenienzrang (verbindlich, aus den Nutzungshinweisen der Quellen):
 *   BayMBl. elektronisch  ist AMTLICH        → `publicationAuthority: 'electronic-official'`
 *   GVBl.   elektronisch  ist NACHRICHTLICH  → `publicationAuthority: 'printed-official'`,
 *                                              `digitalRepresentation: 'official-platform-informational-copy'`
 * Nirgends wird behauptet, die digitale GVBl.-Kopie sei die amtliche Fassung; amtlich ist dort die
 * Druckausgabe des Verlags Bayerische Staatszeitung.
 *
 * Es wird nichts geraten: Ein Ereignis ohne Datum bleibt ohne Datum, ein Ziel ohne strukturiertes
 * Identitätsmerkmal wird nie `strong`, eine nicht zuordenbare Quelle wird als `unknown` mit Rohtext
 * geführt statt verworfen.
 */
import { createHash } from 'node:crypto';

import { EVIDENCE_STRENGTHS, type EvidenceStrength } from '../common/evidence.ts';

export const EVENT_LEDGER_SCHEMA = 'bayernrecht-event-ledger/1' as const;

/** Stichtag des Ausgangsrechtsstands; Ereignisse ab dem Folgetag sind „nach dem Stichtag“. */
export const BASELINE = '2023-12-01' as const;
export const FIRST_POST_BASELINE_DAY = '2023-12-02' as const;

/**
 * Auswertungsstichtag des Berichts: Trennt bereits eingetretene Ereignisse von künftigen Befristungen
 * und begrenzt den erfassten Zeitraum nach oben. Bewusst eine Konstante und nicht `new Date()` – nur so
 * ist ein Wiederholungslauf byteidentisch. Wird die Konstante erhöht, wandern abgelaufene Befristungen
 * von „künftig“ zu „eingetreten“ und der Erfassungszeitraum verlängert sich.
 */
export const EVALUATION_DATE = '2026-09-18' as const;

/** Sondermonat: Verkündungen unmittelbar nach dem Stichtag legen die Vorgängerfassung offen. */
export const DECEMBER_2023_START = '2023-12-02' as const;
export const DECEMBER_2023_END = '2023-12-31' as const;

export const EVENT_TYPES = [
  'new',
  'amend',
  'repeal',
  'replace',
  'recast',
  'expire',
  'extend',
  'commencement',
  'correction',
  'treaty',
  'notice',
  'unknown',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Ereignisarten, die das Ende einer Vorschrift belegen können – nur sie tragen einen Kandidaten. */
export const TERMINATING_EVENT_TYPES: readonly EventType[] = ['repeal', 'replace', 'expire'];

/**
 * Feinunterscheidung innerhalb eines Ereignistyps. Fachlich nötig, weil dieselbe Rechtsfolge in Bayern
 * in sehr verschiedener sprachlicher Gestalt auftritt: Eine Verlängerung der Geltungsdauer ist formal
 * eine Änderung, hebt aber ein Fristende auf; eine Neubekanntmachung ist formal eine Verkündung,
 * ersetzt aber die Vorfassung.
 */
export const EVENT_SUBTYPES = [
  'aenderungsgesetz',
  'aenderungsverordnung',
  'mantelaenderung',
  'teilaufhebung',
  'teilausserkrafttreten',
  'befristungsverlaengerung',
  'entfristung',
  'neubekanntmachung',
  'ausserkrafttreten-durch-nachfolger',
  'berichtigung',
  'staatsvertrag',
  'zustaendigkeitsaenderung',
  'inkrafttretensbekanntmachung',
  'redaktionell',
] as const;
export type EventSubtype = (typeof EVENT_SUBTYPES)[number];

/**
 * Verarbeitungsstand eines Ereignisses:
 *   recorded              regulär erfasst
 *   needs-review          erkannt, aber nicht entscheidungsreif (Ziel oder Datum unklar)
 *   missing-predecessor   Ende einer Vorschrift ohne bestimmbaren Vorgänger – Pflichtreviewfall
 *   no-text-layer         Quelle liegt nur als PDF ohne Textebene vor; kein OCR, deshalb Review
 *   defused-by-extension  ein Fristende, das eine spätere Verlängerung/Entfristung aufgehoben hat
 *   superseded-by-later-expiry  ein Fristende, das ein späteres Fristende derselben Vorschrift ersetzt
 *   unparsed              Quelle nicht zuordenbar; nur Rohtext, Typ `unknown`
 */
export const EVENT_PROCESSING_STATUSES = [
  'recorded',
  'needs-review',
  'missing-predecessor',
  'no-text-layer',
  'defused-by-extension',
  'superseded-by-later-expiry',
  'unparsed',
] as const;
export type EventProcessingStatus = (typeof EVENT_PROCESSING_STATUSES)[number];

/** Verkündungsorgan, aus dem der Beleg stammt. */
export const PUBLICATION_ORGANS = ['gvbl', 'baymbl'] as const;
export type PublicationOrgan = (typeof PUBLICATION_ORGANS)[number];

/**
 * Amtlichkeit der benutzten Verkündungsform. `electronic-official`: die elektronische Ausgabe ist
 * selbst die amtliche Verkündung (BayMBl. seit 2019). `printed-official`: amtlich ist die Druckausgabe,
 * die elektronische Fassung ist nachrichtlich (GVBl.).
 */
export const PUBLICATION_AUTHORITIES = ['electronic-official', 'printed-official'] as const;
export type PublicationAuthority = (typeof PUBLICATION_AUTHORITIES)[number];

/** Was die benutzte digitale Datei ist – nie mehr, als die Quelle selbst über sich sagt. */
export const DIGITAL_REPRESENTATIONS = ['official-electronic-edition', 'official-platform-informational-copy'] as const;
export type DigitalRepresentation = (typeof DIGITAL_REPRESENTATIONS)[number];

/** Provenienzrang je Organ – verbindlich und an genau einer Stelle festgelegt. */
export const ORGAN_PROVENANCE: Readonly<Record<PublicationOrgan, { authority: PublicationAuthority; representation: DigitalRepresentation; label: string; citationLabel: string }>> = {
  baymbl: {
    authority: 'electronic-official',
    representation: 'official-electronic-edition',
    label: 'Bayerisches Ministerialblatt (BayMBl.)',
    citationLabel: 'BayMBl.',
  },
  gvbl: {
    authority: 'printed-official',
    representation: 'official-platform-informational-copy',
    label: 'Bayerisches Gesetz- und Verordnungsblatt (GVBl.)',
    citationLabel: 'GVBl.',
  },
};

/**
 * Merkmale, über die ein Ziel identifiziert wurde. **Ein bloß ähnlicher Titel ist nie darunter** – er
 * ist kein strukturiertes Identitätsmerkmal und trägt keine starke Auflösung.
 */
export const TARGET_MATCH_CRITERIA = ['bayrs', 'abbreviation', 'exact-title', 'ausfertigungsdatum', 'fundstelle'] as const;
export type TargetMatchCriterion = (typeof TARGET_MATCH_CRITERIA)[number];

/**
 * Stand der Zielauflösung eines Ereignisses:
 *   resolved              Ziel im heutigen Bestand (Enumeration) eindeutig wiedergefunden
 *   absent-from-portal    Ziel eindeutig benannt, im heutigen Bestand aber nicht vorhanden –
 *                         bei einem Ende nach dem Stichtag ist das der baseline-only-Kandidat
 *   ambiguous             mehrere Bestandseinträge passen; keine automatische Entscheidung
 *   unidentified          die Quelle nennt kein strukturiertes Identitätsmerkmal – es wurde nichts
 *                         gefunden, und Titelähnlichkeit ersetzt keinen Fund
 *   missing-predecessor   Ende einer Vorschrift, deren Vorgänger die Quelle nicht bestimmbar benennt
 *   not-applicable        Ereignis richtet sich nicht gegen eine vorbestehende Vorschrift (`new`,
 *                         `notice`, `treaty` ohne Änderungsbefehl)
 */
export const TARGET_RESOLUTION_STATUSES = ['resolved', 'absent-from-portal', 'ambiguous', 'unidentified', 'missing-predecessor', 'not-applicable'] as const;
export type TargetResolutionStatus = (typeof TARGET_RESOLUTION_STATUSES)[number];

export interface TargetResolution {
  status: TargetResolutionStatus;
  /** Beweiskraft der Zuordnung selbst – unabhängig von der Beweiskraft des Ereignisses. */
  matchStrength: EvidenceStrength;
  /** Quellidentität im Bestand (Dokument-ID der Enumeration), nur bei `resolved`. */
  sourceIdentity?: string;
  /** BayRS-Gliederungsnummer des Ziels, so wie die Quelle sie nennt (kanonisiert für den Vergleich). */
  bayRsNumber?: string;
  /** Welche strukturierten Merkmale getragen haben; leere Liste heißt: keine Identität nachgewiesen. */
  matchedOn: TargetMatchCriterion[];
  /** Bei `ambiguous`: die konkurrierenden Quellidentitäten, damit ein Review sie sieht. */
  candidates?: string[];
  /** Begründung in Klartext; erscheint unverändert im Bericht. */
  note: string;
}

/** Höchstlänge des wörtlichen Ausschnitts; längere Stellen werden mit „…“ gekürzt. */
export const EXCERPT_MAX_LENGTH = 320;

export interface LedgerEvent {
  /** Stabil aus Quelle, Fundstelle, laufender Nummer und normalisiertem Belegtext. */
  id: string;
  eventType: EventType;
  subtype?: EventSubtype;
  /** Verkündungsdatum des Belegs (ISO) – nicht das Ausfertigungsdatum. Fehlt es, nie `strong`. */
  eventDate?: string;
  /** Ausfertigungs-/Erlassdatum, wie die Quelle es führt. Nie Ersatz für `eventDate`. */
  enactmentDate?: string;
  /** Inkrafttreten, falls die Quelle es ausdrücklich und abweichend nennt. */
  effectiveDate?: string;
  /** Außerkrafttreten/Fristende, falls die Quelle es ausdrücklich nennt. */
  terminationDate?: string;
  targetTitle: string;
  targetAbbreviation?: string;
  /** BayRS-Gliederungsnummer des Ziels (kanonisiert), soweit die Quelle sie nennt. */
  targetBayRsNumber?: string;
  /** Weitere Merkmale zur späteren Zuordnung (BayRS, Titel, Ausfertigung, Fundstelle, Ressort). */
  targetIdentityHints: string[];
  targetResolution: TargetResolution;
  /** Fundstelle im Verkündungsblatt („GVBl. 2024 S. 682“, „BayMBl. 2024 Nr. 100“). */
  citation: string;
  /** Ausgabe bzw. laufende Nummer („2024/24“ bzw. „2024 Nr. 100“). */
  issue: string;
  /** Gedruckte Seite (GVBl.) bzw. laufende Nummer (BayMBl.) als Zahl. */
  sourcePosition: number;
  sourceId: string;
  sourceUrl: string;
  /** SHA-256 der abgerufenen Quelle (Detailseite bzw. Trefferliste). */
  sourceSha256: string;
  /** Adresse der amtlichen PDF-Ausgabe, soweit die Plattform sie nennt. */
  gazettePdfUrl?: string;
  /** Von der Plattform veröffentlichte SHA-256 der PDF-Ausgabe (Integritätsbeleg, ohne Abruf). */
  gazettePdfSha256Published?: string;
  organ: PublicationOrgan;
  publicationAuthority: PublicationAuthority;
  digitalRepresentation: DigitalRepresentation;
  /** Wörtlicher Auszug der Quelle (Leerraum normalisiert, gekürzt). */
  excerpt: string;
  evidenceStrength: EvidenceStrength;
  /** 0…1, aus denselben Merkmalen abgeleitet wie `evidenceStrength` – siehe `deriveConfidence`. */
  confidence: number;
  processingStatus: EventProcessingStatus;
  /** Ungekürzter Belegtext; bei `unknown`/`unparsed` und bei Reviewfällen gesetzt. */
  rawText?: string;
}

export interface LedgerSource {
  id: string;
  label: string;
  organ: PublicationOrgan;
  kind: 'issue-index' | 'publication-index' | 'publication';
  url: string;
  sha256: string;
  retrievedAt: string;
  publicationAuthority: PublicationAuthority;
  digitalRepresentation: DigitalRepresentation;
}

/** Ausgabe eines Verkündungsblatts mit der von der Plattform veröffentlichten Prüfsumme. */
export interface GazetteIssue {
  organ: PublicationOrgan;
  volume: number;
  issue: string;
  publishedAt: string;
  pages?: string;
  pdfUrl: string;
  /** SHA-256, die die Plattform selbst zu dieser Ausgabe veröffentlicht (`data-content`). */
  sha256Published: string;
}

export interface EventLedger {
  schemaVersion: typeof EVENT_LEDGER_SCHEMA;
  jurisdiction: 'baywue';
  sourceState: 'Bayern';
  baselineDate: typeof BASELINE;
  firstPostBaselineDay: typeof FIRST_POST_BASELINE_DAY;
  evaluationDate: typeof EVALUATION_DATE;
  /** Provenienzrang je Organ – im Register selbst mitgeführt, damit ein Leser ihn nicht suchen muss. */
  provenance: typeof ORGAN_PROVENANCE;
  sources: LedgerSource[];
  issues: GazetteIssue[];
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
 * Stabile Ereigniskennung aus Quelle, Position, laufender Nummer und normalisiertem Belegtext.
 * Der Inhaltsanteil sorgt dafür, dass eine geänderte Quelle neue Kennungen erzeugt, statt alte Belege
 * stillschweigend umzudeuten.
 */
export function eventId(input: { sourceId: string; position: number; ordinal: number; text: string }): string {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(input.sourceId)) throw new Error(`Ungültige Quellkennung ${input.sourceId} (erlaubt: a-z, 0-9, Bindestrich)`);
  if (!Number.isInteger(input.position) || input.position < 0) throw new Error(`Ungültige Position ${input.position}`);
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0) throw new Error(`Ungültige laufende Nummer ${input.ordinal}`);
  const material = [input.sourceId, String(input.position), String(input.ordinal), input.text.replace(/\s+/gu, ' ').trim()].join('␟');
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 10);
  return `${input.sourceId}-n${String(input.position).padStart(5, '0')}-${String(input.ordinal).padStart(2, '0')}-${digest}`;
}

export interface EvidenceInput {
  eventType: EventType;
  eventDate?: string;
  citation: string;
  targetTitle: string;
  /** Beweiskraft der Zielauflösung – ein bloß ähnlicher Titel liefert hier nie `strong`. */
  targetMatchStrength: EvidenceStrength;
  /** Der Beleg steht gegen einen anderen starken Beleg derselben Vorschrift. */
  contradicted?: boolean;
}

/**
 * Beweisklasse eines Ereignisses. `strong` setzt drei Merkmale voraus: Verkündungsdatum, Fundstelle und
 * ein **strukturell** identifiziertes Ziel. Die Zielauflösung ist dabei die bindende Schranke: Wer das
 * Ziel nur über Titelähnlichkeit gefunden hat, bekommt höchstens `supporting`.
 */
export function deriveEvidenceStrength(input: EvidenceInput): EvidenceStrength {
  if (input.contradicted) return 'contradictory';
  const hasDate = input.eventDate !== undefined && ISO_DATE.test(input.eventDate);
  const hasCitation = input.citation.trim() !== '';
  const hasTitle = input.targetTitle.trim() !== '';
  const known = input.eventType !== 'unknown';
  if (hasDate && hasCitation && hasTitle && known && input.targetMatchStrength === 'strong') return 'strong';
  if (known && hasTitle && (hasDate || hasCitation) && input.targetMatchStrength !== 'insufficient') return 'supporting';
  if (known && hasTitle && hasDate && hasCitation) return 'supporting';
  return 'insufficient';
}

/** Zahlenwert zur Beweisklasse; dieselben Merkmale, nur feiner aufgelöst (zwei Nachkommastellen). */
export function deriveConfidence(input: EvidenceInput): number {
  if (input.contradicted) return 0.3;
  let score = 0.35;
  if (input.eventDate !== undefined && ISO_DATE.test(input.eventDate)) score += 0.2;
  if (input.citation.trim() !== '') score += 0.15;
  if (input.eventType !== 'unknown') score += 0.1;
  if (input.targetMatchStrength === 'strong') score += 0.2;
  else if (input.targetMatchStrength === 'supporting') score += 0.1;
  return Math.round(Math.min(1, score) * 100) / 100;
}

/** Ereignis nach dem Stichtag? Ohne Datum lautet die Antwort immer „nein“ – es wird nichts unterstellt. */
export function isPostBaseline(event: Pick<LedgerEvent, 'eventDate'>): boolean {
  return event.eventDate !== undefined && event.eventDate >= FIRST_POST_BASELINE_DAY;
}

/** Belegt das Ereignis das Ende der ganzen Vorschrift (und nicht nur eines Teils)? */
export function isFullTermination(event: Pick<LedgerEvent, 'eventType' | 'subtype'>): boolean {
  if (!TERMINATING_EVENT_TYPES.includes(event.eventType)) return false;
  return event.subtype !== 'teilaufhebung' && event.subtype !== 'teilausserkrafttreten';
}

/** ISO-Datum plus `days` Tage (UTC, ohne Zeitzonenfehler). */
function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Erster Tag, an dem die Vorschrift nicht mehr gilt – das **Wirksamwerden** des Endes, nicht die
 * Verkündung des Belegs:
 *
 *   terminationDate (letzter Geltungstag, „mit Ablauf des …“)  → Folgetag
 *   effectiveDate   (Inkrafttreten des aufhebenden Akts)       → dieser Tag
 *   sonst eventDate (Verkündung; frühestmögliches Ende)        → dieser Tag
 *
 * Belegt: Die EuMedBek (AllMBl. 2018 S. 962) wurde am 16. September 2026 zum 1. Oktober 2026
 * aufgehoben (BayMBl. 2026 Nr. 377). Am Auswertungsstichtag 2026-09-18 galt sie noch und stand im
 * Portal; das Verkündungsdatum hätte sie zum baseline-only-Kandidaten gemacht.
 */
export function endEffectiveDay(event: Pick<LedgerEvent, 'terminationDate' | 'effectiveDate' | 'eventDate'>): string | undefined {
  if (event.terminationDate !== undefined) return addIsoDays(event.terminationDate, 1);
  return event.effectiveDate ?? event.eventDate;
}

/**
 * Baseline-only-Kandidat: Ein Ende der *ganzen* Vorschrift nach dem Stichtag, dessen Vorgänger im
 * heutigen Portalbestand **nicht** mehr geführt wird. Die Vorschrift galt dann am 2023-12-01 und fehlt
 * heute – genau diese Vorschriften muss ein späterer Import zusätzlich beschaffen.
 *
 * Maßgeblich ist das Wirksamwerden des Endes (`endEffectiveDay`): Es muss nach dem Stichtag und
 * spätestens am Auswertungsstichtag liegen. Eine Vorschrift, deren Ende erst künftig wirkt, gilt heute
 * noch – sie gehört in den Portalbestand, nicht zu den heute fehlenden. Ein entschärftes oder ersetztes
 * Fristende zählt nicht, und ein Teilaußerkrafttreten beweist das Gegenteil eines Endes.
 */
export function isBaselineOnlyCandidate(event: LedgerEvent, evaluationDate: string = EVALUATION_DATE): boolean {
  if (!isFullTermination(event)) return false;
  if (event.processingStatus !== 'recorded') return false;
  if (event.targetResolution.status !== 'absent-from-portal') return false;
  if (event.evidenceStrength === 'insufficient' || event.evidenceStrength === 'contradictory') return false;
  const day = endEffectiveDay(event);
  return day !== undefined && day >= FIRST_POST_BASELINE_DAY && day <= evaluationDate;
}

/** Künftige Befristung: belegt ebenfalls die Geltung am Stichtag, aber die Vorschrift gilt weiter. */
export function isFutureTermination(event: LedgerEvent, evaluationDate: string = EVALUATION_DATE): boolean {
  if (!isFullTermination(event)) return false;
  if (event.processingStatus !== 'recorded') return false;
  const day = endEffectiveDay(event);
  return day !== undefined && day > evaluationDate;
}

/** Deterministische Ordnung: Datum (ohne Datum zuletzt), dann Quelle, Position, Kennung. */
export function compareEvents(left: LedgerEvent, right: LedgerEvent): number {
  const leftDate = left.eventDate ?? '9999-12-31';
  const rightDate = right.eventDate ?? '9999-12-31';
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
  if (left.organ !== right.organ) return left.organ < right.organ ? -1 : 1;
  if (left.sourcePosition !== right.sourcePosition) return left.sourcePosition - right.sourcePosition;
  if (left.sourceId !== right.sourceId) return left.sourceId < right.sourceId ? -1 : 1;
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
  for (const field of ['eventDate', 'enactmentDate', 'effectiveDate', 'terminationDate'] as const) {
    if (event[field] !== undefined && (typeof event[field] !== 'string' || !ISO_DATE.test(event[field] as string))) problems.push(`${where}: ${field} ist kein ISO-Datum`);
  }
  if (typeof event.targetTitle !== 'string' || event.targetTitle.trim() === '') problems.push(`${where}: targetTitle fehlt`);
  if (!Array.isArray(event.targetIdentityHints) || event.targetIdentityHints.some((hint) => typeof hint !== 'string')) problems.push(`${where}: targetIdentityHints ist keine Liste von Zeichenketten`);
  problems.push(...validateTargetResolution(event.targetResolution, `${where}.targetResolution`));
  if (typeof event.citation !== 'string' || (event.citation as string).trim() === '') problems.push(`${where}: citation fehlt`);
  if (typeof event.issue !== 'string' || (event.issue as string).trim() === '') problems.push(`${where}: issue fehlt`);
  if (!Number.isInteger(event.sourcePosition) || (event.sourcePosition as number) < 0) problems.push(`${where}: sourcePosition fehlt`);
  if (typeof event.sourceUrl !== 'string' || !(event.sourceUrl as string).startsWith('https://')) problems.push(`${where}: sourceUrl fehlt oder ist nicht https`);
  if (typeof event.sourceSha256 !== 'string' || !SHA256.test(event.sourceSha256 as string)) problems.push(`${where}: sourceSha256 ist kein SHA-256`);
  if (event.gazettePdfSha256Published !== undefined && (typeof event.gazettePdfSha256Published !== 'string' || !SHA256.test(event.gazettePdfSha256Published as string))) {
    problems.push(`${where}: gazettePdfSha256Published ist kein SHA-256`);
  }
  if (!(PUBLICATION_ORGANS as readonly string[]).includes(String(event.organ))) problems.push(`${where}: unbekanntes Organ ${String(event.organ)}`);
  const organ = event.organ as PublicationOrgan;
  const expected = ORGAN_PROVENANCE[organ];
  if (expected) {
    if (event.publicationAuthority !== expected.authority) problems.push(`${where}: publicationAuthority ${String(event.publicationAuthority)} widerspricht dem Provenienzrang von ${organ} (${expected.authority})`);
    if (event.digitalRepresentation !== expected.representation) problems.push(`${where}: digitalRepresentation ${String(event.digitalRepresentation)} widerspricht dem Provenienzrang von ${organ} (${expected.representation})`);
  }
  if (typeof event.excerpt !== 'string' || (event.excerpt as string).trim() === '' || (event.excerpt as string).length > EXCERPT_MAX_LENGTH) problems.push(`${where}: excerpt fehlt oder ist länger als ${EXCERPT_MAX_LENGTH} Zeichen`);
  if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(String(event.evidenceStrength))) problems.push(`${where}: unbekannte Beweisklasse ${String(event.evidenceStrength)}`);
  if (typeof event.confidence !== 'number' || (event.confidence as number) < 0 || (event.confidence as number) > 1) problems.push(`${where}: confidence liegt nicht in [0,1]`);
  if (!(EVENT_PROCESSING_STATUSES as readonly string[]).includes(String(event.processingStatus))) problems.push(`${where}: unbekannter processingStatus ${String(event.processingStatus)}`);
  if (event.evidenceStrength === 'strong') {
    if (event.eventDate === undefined) problems.push(`${where}: starker Beleg ohne Verkündungsdatum`);
    if (String(event.citation ?? '').trim() === '') problems.push(`${where}: starker Beleg ohne Fundstelle`);
    const resolution = event.targetResolution as TargetResolution | undefined;
    if (resolution?.matchStrength !== 'strong') problems.push(`${where}: starker Beleg ohne strukturell identifiziertes Ziel (Titelähnlichkeit trägt nicht)`);
  }
  if (event.eventType === 'unknown' && typeof event.rawText !== 'string') problems.push(`${where}: unknown-Ereignis ohne rawText`);
  // Vollständigkeitsregel: Zu jedem Ende gehört ein bestimmter Vorgänger oder ein ausdrücklicher Reviewfall.
  if (TERMINATING_EVENT_TYPES.includes(event.eventType as EventType)) {
    const status = (event.targetResolution as TargetResolution | undefined)?.status;
    if (status === 'not-applicable') problems.push(`${where}: ${String(event.eventType)} ohne Zielauflösung – ein Ende ohne Vorgänger gibt es nicht`);
    if (status === 'missing-predecessor' && event.processingStatus !== 'missing-predecessor') {
      problems.push(`${where}: Ende ohne bestimmbaren Vorgänger muss processingStatus 'missing-predecessor' tragen`);
    }
  }
  return problems;
}

export function validateTargetResolution(value: unknown, where = 'targetResolution'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt`];
  const resolution = value as Record<string, unknown>;
  if (!(TARGET_RESOLUTION_STATUSES as readonly string[]).includes(String(resolution.status))) problems.push(`${where}: unbekannter Status ${String(resolution.status)}`);
  if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(String(resolution.matchStrength))) problems.push(`${where}: unbekannte Beweisklasse ${String(resolution.matchStrength)}`);
  if (!Array.isArray(resolution.matchedOn) || resolution.matchedOn.some((entry) => !(TARGET_MATCH_CRITERIA as readonly string[]).includes(String(entry)))) {
    problems.push(`${where}: matchedOn enthält ein unbekanntes Merkmal`);
  }
  if (typeof resolution.note !== 'string' || resolution.note.trim() === '') problems.push(`${where}: note fehlt`);
  // Die bindende Regel des Auftrags: ohne strukturiertes Merkmal keine starke Zuordnung.
  if (resolution.matchStrength === 'strong' && (!Array.isArray(resolution.matchedOn) || resolution.matchedOn.length === 0)) {
    problems.push(`${where}: starke Zuordnung ohne strukturiertes Identitätsmerkmal`);
  }
  if (resolution.status === 'resolved' && (typeof resolution.sourceIdentity !== 'string' || resolution.sourceIdentity.trim() === '')) {
    problems.push(`${where}: resolved ohne Quellidentität`);
  }
  return problems;
}

export function validateLedger(ledger: EventLedger): string[] {
  const problems: string[] = [];
  if (ledger.schemaVersion !== EVENT_LEDGER_SCHEMA) problems.push(`Unbekannte Schemaversion ${ledger.schemaVersion}`);
  if (ledger.baselineDate !== BASELINE) problems.push(`Unerwarteter Stichtag ${ledger.baselineDate}`);
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
