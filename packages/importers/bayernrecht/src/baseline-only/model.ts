/**
 * Datenmodell der Wiederherstellung heute fehlender Stichtagsnormen („baseline-only“).
 *
 *   data/imports/bayernrecht/baseline-only/<id>.json      Rezept je sicher wiederhergestellter Norm
 *   data/imports/bayernrecht/baseline-only/candidates.json  jeder Kandidat des Ereignisregisters mit Ergebnis
 *                                                         und – wenn unsicher – dem genau benannten fehlenden Glied
 *   data/audits/bayernrecht/BASELINE_ONLY.md               Bericht
 *
 * `<id>` ist die stabile Kennung der Ausgangsverkündung (`baymbl-2021-182`, `kwmbl-2016-10-194`); dieselbe
 * Kennung ist `sourceIdentity` des Manifesteintrags im Bereich `events`.
 */
import type { NormBodyBlock, NormType } from '@landesrecht/legal-core/lib/schema.ts';

import { AUDIT_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import type { ValidityEvidence } from '../common/evidence.ts';
import type { Operation, FormulaId } from '../reconstruction/formulas.ts';
import type { ResolvedScope } from '../reconstruction/location.ts';

export const BASELINE_ONLY_DIR = `${IMPORT_DATA_DIR}/baseline-only`;
export const CANDIDATES_PATH = `${BASELINE_ONLY_DIR}/candidates.json`;
export const BASELINE_ONLY_REPORT_PATH = `${AUDIT_DIR}/BASELINE_ONLY.md`;
export const RECIPE_SCHEMA = 'bayernrecht-baseline-only-recipe/1' as const;
export const CANDIDATES_SCHEMA = 'bayernrecht-baseline-only-candidates/1' as const;

export const recipePath = (id: string): string => `${BASELINE_ONLY_DIR}/${id}.json`;

/**
 * Ergebnis je Kandidat:
 *   safe              Rezept: Stammverkündung, Änderungen, Beginn und Ende amtlich belegt, Text geprüft
 *   missing-base      Ausgangsfassung nicht elektronisch (Papier, nie verkündet, nur PDF, Anlage nur als PDF)
 *   incomplete-chain  Ausgangsfassung da, aber ein Glied der Änderungsfolge fehlt oder ist nicht anwendbar
 *   contradictory     Belege widersprechen sich (Seite ≠ Zitat, Verkündung ändert statt aufzuheben …)
 *   undetermined      Identität, Beginn, Ende, Weitergeltung oder Umfang nicht belegbar
 *   not-at-baseline   belegt: galt am Stichtag nicht (nach ihm erlassen, vor ihm beendet, erst danach in Kraft)
 *   out-of-scope      belegt: keine Vorschrift des Landesrechts (docs/LEGAL_SCOPE.md)
 *   pending           Quelle in diesem Lauf nicht erreichbar (offline, Budget) – kein Befund, nur offen
 */
export const OUTCOMES = ['safe', 'missing-base', 'incomplete-chain', 'contradictory', 'undetermined', 'not-at-baseline', 'out-of-scope', 'pending'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Genau benannte fehlende Glieder (Codes) mit ihrem Ergebnis. */
export const MISSING_LINKS = {
  'identity-not-strong': 'undetermined',
  'identity-date-missing': 'undetermined',
  'citation-not-located': 'undetermined',
  'citation-ambiguous': 'undetermined',
  'end-undetermined': 'undetermined',
  'not-a-repeal': 'contradictory',
  'ended-before-baseline': 'not-at-baseline',
  'enacted-after-baseline': 'not-at-baseline',
  'base-unpublished': 'missing-base',
  'base-paper-only': 'missing-base',
  'base-pdf-only': 'missing-base',
  'base-not-found': 'missing-base',
  'base-no-text': 'missing-base',
  'annex-pdf-only': 'missing-base',
  'base-identity-mismatch': 'contradictory',
  'base-not-fetched': 'pending',
  'scope-not-state-regulation': 'out-of-scope',
  'scope-publication-notice': 'out-of-scope',
  'scope-normativity-review': 'undetermined',
  'text-structure-unsupported': 'undetermined',
  'text-image-in-body': 'missing-base',
  'begin-no-commencement-clause': 'undetermined',
  'begin-not-calendar-date': 'undetermined',
  'begin-unreadable': 'undetermined',
  'begin-after-baseline': 'not-at-baseline',
  'own-expiry-before-baseline': 'contradictory',
  'own-expiry-unreadable': 'undetermined',
  'vwvwbek-positivliste': 'undetermined',
  'vwvwbek-not-listed': 'not-at-baseline',
  'vwvwbek-amended-before-2016': 'incomplete-chain',
  'chain-organ-unsearchable': 'incomplete-chain',
  'chain-fulltext-unverified': 'incomplete-chain',
  'chain-amtsblatt-unsearchable': 'incomplete-chain',
  'chain-scan-incomplete': 'pending',
  'chain-correction': 'incomplete-chain',
  'chain-named-amendment-missing': 'incomplete-chain',
  'chain-earlier-end': 'not-at-baseline',
  'amendment-block-unreadable': 'incomplete-chain',
  'amendment-commencement-undetermined': 'incomplete-chain',
  'amendment-formula-unsupported': 'incomplete-chain',
  'amendment-target-unresolved': 'incomplete-chain',
  'amendment-round-trip-failed': 'incomplete-chain',
  'amendment-retroactive': 'incomplete-chain',
  'duplicate-conflicting-end': 'contradictory',
  'present-in-bestand': 'contradictory',
  'record-invalid': 'undetermined',
} as const satisfies Readonly<Record<string, Outcome>>;
export type MissingLink = keyof typeof MISSING_LINKS;

export interface MissingLinkRecord {
  code: MissingLink;
  detail: string;
}

/** Eine amtliche Quelle des Rezepts. */
export interface RecipeSource {
  /**
   * `registry`: amtliches Verzeichnis als Beleg der Geltung (Positivliste der VwVWBek, PDF). `annex`: Anlage der
   * Stammverkündung, die nur als Datei vorliegt (Vordruck, Übersicht) – archiviert und referenziert, kein Normtext.
   */
  role: 'base' | 'amendment' | 'repeal' | 'chain-publication' | 'listing' | 'registry' | 'annex';
  url: string;
  sha256: string;
  retrievedAt: string;
  byteLength: number;
  contentType: string;
  /** Fundstelle (`BayMBl. 2021 Nr. 182`, `KWMBl. 2016 S. 194`). */
  citation?: string;
  /** Verkündungsdatum. */
  publishedAt?: string;
  authority?: 'electronic-official' | 'printed-official';
  representation?: 'official-electronic-edition' | 'official-platform-informational-copy';
  /** Amtliche PDF-Ausgabe (nicht geladen) mit der von der Plattform veröffentlichten Prüfsumme. */
  pdf?: { url: string; sha256Published?: string; page?: number };
}

export interface RecipeStep {
  id: string;
  command: string;
  formula: FormulaId;
  location: string;
  scope: ResolvedScope;
  operation: Operation;
}

export interface RecipeAmendment {
  citation: string;
  /** Ausfertigungsdatum der Änderung (Kopf ihrer Verkündung). */
  documentDate: string;
  url: string;
  sha256: string;
  publishedAt: string;
  effectiveDate: string;
  effectiveEvidence: string[];
  section?: string;
  intro: string;
  steps: RecipeStep[];
  /** Änderungen der Überschrift der Norm selbst (`chain.ts#applyToTitle`). */
  titleChanges?: Array<{ id: string; command: string; formula: FormulaId; before: string; after: string }>;
  /** Fingerabdruck des Quellkörpers nach dieser Änderung (kanonisches JSON, SHA-256). */
  afterFingerprint: string;
}

export interface BaselineOnlyRecipe {
  schemaVersion: typeof RECIPE_SCHEMA;
  /** Stabile Kennung der Ausgangsverkündung = `sourceIdentity` im Manifest (Bereich `events`). */
  id: string;
  baselineDate: string;
  method: 'reconstructed-from-publications';
  converterVersion: string;
  norm: {
    title: string;
    /** Überschrift der Stammfassung, wenn eine angewandte Änderung sie geändert hat (`title` ist die am Stichtag). */
    originalTitle?: string;
    shortTitle?: string;
    abbr?: string;
    type: NormType;
    /** Publikationstyp laut Verkündungsplattform (`Verwaltungsvorschrift`), soweit geführt. */
    publicationType?: string;
    /** Ausfertigungsdatum (ISO). */
    documentDate: string;
    /** Fundstelle der Stammverkündung. */
    fundstelle: string;
    gliederungsnummern: string[];
    bayRsNumber?: string;
    issuer?: string;
    dateLine?: string;
    /** Vollzitat der Quelle (Stammfundstelle, bei Änderungen mit „zuletzt geändert durch …“). */
    citation: string;
  };
  sources: RecipeSource[];
  base: {
    url: string;
    sha256: string;
    /** Ausgangstext-Fingerabdruck: SHA-256 des normalisierten Seitentexts der Stammverkündung. */
    pageTextSha256: string;
    /** Fingerabdruck des Quellkörpers vor Änderungen (Kopfzeilen + Körper, kanonisches JSON). */
    bodyFingerprint: string;
    integrity: { pageCharacters: number; canonicalCharacters: number; styledLabels: number };
    nested: boolean;
    titleCheck: { overlap: number; reverseOverlap: number; issuerOnly: boolean; sameAbbreviation?: string };
  };
  amendments: RecipeAmendment[];
  /** Beginn der Stichtagsfassung: Inkrafttreten der Stammfassung bzw. der letzten angewandten Änderung. */
  begin: { date: string; commencementDate: string; evidence: string[] };
  /** Ende: letzter Geltungstag der Norm laut Aufhebungsbefehl. */
  end: { lastDay: string; kind: 'repeal' | 'expiry' | 'replacement'; eventIds: string[]; repeal: { url: string; citation: string; publishedAt: string; sha256: string }; evidence: string[] };
  /** Letzter Geltungstag dieser Textfassung (früher als das Ende, wenn eine Änderung nach dem Stichtag folgt). */
  textValidTo?: { date: string; reason: string };
  chain: {
    method: string;
    complete: boolean;
    /** BayMBl.-Volltextsuche (Suchwörter, Treffer über alle Jahrgänge). */
    fulltext?: { query: string; hits: number };
    /** Amtsblätter 2009–2018: Zahl der im Zeitraum vollständig gelesenen Veröffentlichungen. */
    amtsblattDocuments?: number;
    examined: number;
    citing: Array<{ url: string; citation: string; relations: string[] }>;
    evidence: string[];
  };
  identity: {
    citedTitle: string;
    parenthetical?: string;
    priorClause?: string;
    registerTitle: string;
    registerDate?: string;
    /** Zitat ohne Fundstelle: wie die Ausgangsverkündung gefunden wurde (Inhaltsübersichten, `search.ts`). */
    foundBy?: string;
  };
  evidence: ValidityEvidence[];
  expected: {
    /** Fingerabdruck des Quellkörpers am Stichtag (vor der Überleitung – nie des übergeleiteten Texts). */
    baselineFingerprint: string;
  };
}

export interface CandidateRecord {
  eventId: string;
  registerTitle: string;
  matchStrength: string;
  repeal: { url: string; citation: string; publishedAt?: string };
  outcome: Outcome;
  missing?: MissingLinkRecord;
  /** Kennung der Ausgangsverkündung (wenn aufgelöst) – verbindet Kandidaten derselben Norm. */
  normId?: string;
  documentDate?: string;
  fundstelle?: string;
  baseUrl?: string;
  lastDay?: string;
  priorClause?: string;
  /**
   * Dieselbe Aufhebung, zweimal im Register: Das Ereignis aus dem Titel der Veröffentlichung („Aufhebung der
   * Bekanntmachung über …“) ohne Zitat und das Ereignis aus dem Zitat im Text. Das titelbasierte übernimmt dann
   * Ergebnis und Norm des zitierten (`duplicateOf` = dessen Kennung).
   */
  duplicateOf?: string;
  /** Kennzahlen des Trichters. */
  funnel: { strongIdentity: boolean; baseFound: boolean; fullChain: boolean; safe: boolean };
}

export interface CandidatesFile {
  schemaVersion: typeof CANDIDATES_SCHEMA;
  baselineDate: string;
  evaluationDate: string;
  converterVersion: string;
  totals: Metrics;
  candidates: CandidateRecord[];
}

export interface Metrics {
  candidates: number;
  strongIdentity: number;
  baseFound: number;
  fullChain: number;
  safelyReconstructed: number;
  /** Verschiedene Normen unter den sicher wiederhergestellten Kandidaten. */
  safeNorms: number;
  /** Register-Ereignisse ohne Zitat, die mit dem zitierten Ereignis derselben Aufhebung verbunden wurden (`duplicateOf`). */
  duplicates: number;
  byOutcome: Record<Outcome, number>;
  byMissingLink: Record<string, number>;
}

/** Leerer Körper ist nie ein Ergebnis. */
export type Body = NormBodyBlock[];
