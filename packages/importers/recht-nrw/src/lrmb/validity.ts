/**
 * Stichtagsprüfung für LRMB-Dokumente (Verwaltungsvorschriften).
 *
 * RECHT.NRW weist darauf hin, dass Fassungen von Verwaltungsvorschriften erst ab Oktober 2025
 * vollständig vorliegen. Eine Fassungsseite zeigt meist den konsolidierten Text mit dem
 * Fundstellenverlauf am Textende; ihr „Gültig ab“ kann älter sein als der gezeigte Textstand.
 * Deshalb gilt ein LRMB-Dokument nur dann als am Stichtag geltend und sein Text als
 * Stichtagsfassung, wenn Belege es tragen:
 *
 *   1. Dokument lebt am Stichtag: Portalintervall deckt den Stichtag (datierte Stammnorm, lokale
 *      Stichtagsauswahl) oder – bei undatierten Altdatensätzen – belegter Beginn vor dem Stichtag UND
 *      nachgewiesener Fortbestand über eine spätere Änderung oder eine spätere Aufhebung. Eine spätere Änderung
 *      trägt den Fortbestand nur, wenn alle Kontinuitätsprüfungen bestehen (`assessUndatedContinuity`):
 *        same-stem            der Ministerialblatt-Eintrag nennt die Stammvorschrift mit Datum und Fundstelle
 *        explicit-amendment   der Eintrag ändert ausdrücklich diese Vorschrift („… wird wie folgt geändert“)
 *        unbroken-chain       die Eingangsformel nennt die unmittelbar vorhergehende Änderung (keine Lücke)
 *        consistent-identity  alle Änderungen beziehen sich auf dieselbe Stammfundstelle
 *        no-contrary-evidence kein Aufhebungs-, Ablösungs- oder Neufassungshinweis, kein Außerkrafttreten
 *                             laut Suchindex vor dem Stichtag
 *      Sonst `undetermined` (Review, kein Import).
 *   2. Textstand = Stichtag: Der Fundstellenverlauf der gewählten Seite nennt die eingearbeiteten
 *      Änderungen. Jede Änderung braucht ein belegtes Inkrafttreten.
 *      – alle eingearbeiteten Änderungen vor dem Stichtag und keine fehlende → direkt übernehmbar;
 *      – eingearbeitete Änderung nach dem Stichtag oder fehlende Änderung vor dem Stichtag →
 *        Rekonstruktion erforderlich (nur mit geprüftem Rekonstruktionsrezept);
 *      – Inkrafttreten nicht belegbar, Änderungskette widersprüchlich → Rekonstruktion unsicher (Review).
 *
 * Beweisklassen (`common/manifest.ts`, `EVIDENCE_STRENGTHS`) und Entscheidungsregeln (Evidence Pass, Parser 1.3.0):
 *   strong        Portalintervall datierter Fassungen; Ministerialblatt-Änderung mit Stammfundstelle; ausdrücklicher
 *                 Änderungsbefehl; lückenlose Kette; eigene Außerkrafttretensformel mit Datum (P1); Aufhebung/Ablösung
 *                 durch eine benannte Nachfolgevorschrift mit Datum, Fundstelle und belegter Wirksamkeit (P2);
 *                 Inkrafttreten „am Tag nach der Veröffentlichung“ plus Veröffentlichungsdatum der Stammfundstelle (P4)
 *   supporting    Fundstellenverlauf, Inkrafttretensklausel ohne Datum, Veröffentlichungsvermerk, Stammfundstelle ohne
 *                 Veröffentlichungsdatum (P4), Nachfolgebeleg ohne datierbare Wirksamkeit, Hinweis „vollständig ab“
 *   insufficient  `field_historically`, `field_outforce_date`/`field_effective_from` des Suchindex, Datumsgleichheit
 *                 ohne Fundstelle, Titelähnlichkeit, bloßes Vorhandensein im Portal – nie alleinige Grundlage
 *   contradictory zwei starke Belege widersprechen einander (z. B. Außerkrafttreten vor einer belegten späteren
 *                 Änderung, Aufhebung vor dem Stichtag gegen ein Portalintervall über den Stichtag)
 *
 *   Regel A  strong Ende (P1 eigene Formel, P2 Aufhebung) vor dem Stichtag, kein widersprechender starker Beleg
 *            → not-active-at-baseline (Befund validity-expired-before-baseline / validity-repealed-before-baseline)
 *   Regel B  strong Beginn vor dem Stichtag (Klausel mit Datum, P4-Ableitung, eingearbeitete datierte Änderung) UND
 *            strong Fortbestand (Fünf-Bedingungen-Kontinuität P3 oder P2-Aufhebung nach dem Stichtag), kein
 *            widersprechender Beleg → active-at-baseline; Textstand nach Regel 2 (direct = verified-active-at-baseline,
 *            sonst reconstruction-required)
 *   Regel C  nur supporting/insufficient Belege oder ein contradictory-Befund → undetermined (Review)
 *   Mehrere eigene Außerkrafttretensformeln mit verschiedenen Daten → contradictory (validity-expiry-ambiguous).
 *
 * Nichts wird geraten: fehlende Belege führen zu `undetermined` bzw. Review, nie zu einer Annahme.
 * Geltung ≠ Normativität: Die Pipeline entscheidet die Normativität vor dieser Prüfung.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { previousDay } from '@landesrecht/legal-core/lib/schema.ts';
import type { SourceValidityStatus } from '@landesrecht/legal-core/lib/schema.ts';

import { validateValidityEvidence, type BaselineStatus, type ValidityEvidence, type ValidityProvenance } from '../common/manifest.ts';
import type { SelectionResult } from '../common/version-selection.ts';
import { nextDay } from './gazette.ts';
import type { SuccessorMatch } from './successor-index.ts';
import type { ChangeNote, ChangeNoteAmendment, ExpiryClause, ValidityClauses } from './text-metadata.ts';

export interface AmendmentEvidence {
  /** Eintrag im Fundstellenverlauf bzw. Veröffentlichungsvermerk. */
  note: ChangeNoteAmendment;
  /** Ob der Fundstellenverlauf der gewählten Seite die Änderung nennt (eingearbeitet). */
  incorporated: boolean;
  gazetteUrl?: string;
  gazetteSha256?: string;
  gazetteTitle?: string;
  /** Text des Ministerialblatt-Eintrags (Änderungsbefehle; nicht im Audit-Report gespeichert). */
  gazetteText?: string;
  publishedOn?: string;
  inForce?: string;
  inForceDerivation: string;
  /** Beleg, dass der Ministerialblatt-Eintrag diese Vorschrift ändert. */
  identification?: { ok: boolean; reason: string };
  /** Vorherige Änderung laut Eingangsformel („der zuletzt durch Runderlass vom … geändert worden ist“). */
  predecessor?: { latest: boolean; date?: string };
}

export interface IndexSignals {
  historically?: boolean;
  outforceDate?: string;
  effectiveFrom?: string;
}

/** P4: Ministerialblatt-Eintrag der Stammfundstelle (amtliche Veröffentlichung der Stammfassung). */
export interface BasePublicationEvidence {
  citation: string;
  /** Ob der Eintrag eindeutig als die Stammvorschrift identifiziert wurde (Erlasskopf-Datum = Ausfertigungsdatum). */
  identified: boolean;
  reason: string;
  publishedOn?: string;
  url?: string;
  sha256?: string;
}

export interface LrmbValidityInput {
  baseline: string;
  /** Gewählte Fassungsseite. */
  page: { url: string; sha256: string; validFrom?: string; validTo?: string; undated: boolean; hasLaterVersions: boolean };
  selection?: SelectionResult;
  completenessNotice?: { text: string; url: string; sha256: string };
  changeNote?: ChangeNote;
  clauses: ValidityClauses;
  issuedOn?: string;
  /** Alle Änderungen der Stammnorm (eingearbeitete und spätere), chronologisch. */
  amendments: AmendmentEvidence[];
  /** Beginn der Portalfassungen, die als eigene Fassung erfasst sind (Änderungen, die dort beginnen, sind keine Textänderung der gewählten Seite). */
  versionStarts: string[];
  /** Suchindex-Signale (nur unterstützend oder unzureichend, nie alleinige Grundlage). */
  indexSignals?: IndexSignals;
  /** Portalvermerke zu dieser Vorschrift (Änderungshistorie), geprüft auf Aufhebungs- und Ablösungshinweise. */
  contraryTexts?: string[];
  /** P2: Nachfolgebelege aus dem Index (`lrmb/successor-index.ts`); nur Zuordnungen der Stufe `strong` zählen als Beleg. */
  successors?: SuccessorMatch[];
  /** P4: Veröffentlichung der Stammfassung. */
  basePublication?: BasePublicationEvidence;
}

export interface ContinuityCheck {
  id: 'same-stem' | 'explicit-amendment' | 'unbroken-chain' | 'consistent-identity' | 'no-contrary-evidence';
  ok: boolean;
  strength: 'strong' | 'supporting' | 'insufficient';
  statement: string;
}

export interface ContinuityAssessment {
  supported: boolean;
  checks: ContinuityCheck[];
}

/** Welche Regel die Entscheidung getragen hat (Audit, Evidence-Pass-Statistik). */
export type ValidityDecisionRule =
  | 'portal-interval'
  | 'portal-no-version'
  | 'P1-self-expiry'
  | 'P2-successor-repeal'
  | 'P3-amendment-continuity'
  | 'P2-successor-continuity'
  | 'contradictory'
  | 'insufficient';

export interface LrmbValidityAssessment {
  baselineStatus: BaselineStatus;
  textStatus: 'direct' | 'reconstruction-required' | 'not-applicable';
  sourceValidFrom?: string;
  sourceValidTo?: string;
  sourceValidity: SourceValidityStatus;
  provenance: ValidityProvenance;
  continuity?: ContinuityAssessment;
  evidence: ValidityEvidence[];
  findings: ImportFinding[];
  /** Regel der Geltungsentscheidung. */
  decisionRule: ValidityDecisionRule;
  /** Belegter Beginn vor dem Stichtag (undatierte Datensätze): Datum und Herleitung. */
  start?: { date: string; derivation: string; strength: 'strong' | 'supporting' };
  /** Eingearbeitete Änderungen mit Inkrafttreten nach dem Stichtag (rückwärts zu rekonstruieren). */
  postBaselineAmendments: AmendmentEvidence[];
  /** Nicht eingearbeitete Änderungen mit Inkrafttreten bis zum Stichtag (vorwärts zu rekonstruieren). */
  missingPreBaselineAmendments: AmendmentEvidence[];
}

const describe = (amendment: AmendmentEvidence): string => `Runderlass vom ${amendment.note.decreeDate ?? amendment.note.decreeDateText}${amendment.note.citation ? ` (${amendment.note.citation.text})` : amendment.note.unpublished ? ' (n. v.)' : ''}`;
const excerptOf = (text: string): string => text.replace(/\s+/gu, ' ').trim().slice(0, 300);

const EXPLICIT_AMENDMENT = /\b(?:wird|werden)\s+(?:[^.:;]{0,80}\s)?wie\s+folgt\s+geändert\b|\b(?:wird|werden)\s+[^.:;]{0,80}\bgeändert\s*:/u;
const WHOLE_REPEAL = /\b(?:Der|Die|Dieser|Diese)\s+(?:Runderlass|Erlass|Verwaltungsvorschrift(?:en)?|Richtlinie[n]?|Bestimmungen)\b[^.]{0,300}?\b(?:wird|werden)\s+aufgehoben\b/u;
const WHOLE_NEW_VERSION = /\b(?:Der|Die)\s+(?:Runderlass|Erlass|Verwaltungsvorschrift(?:en)?|Richtlinie[n]?)\b[^.]{0,300}?\b(?:erhält\s+folgende\s+Fassung|wird\s+(?:wie\s+folgt\s+)?neu\s+gefasst)\b/u;
const CONTRARY_NOTICE = /\b(?:aufgehoben|außer\s+Kraft\s+(?:gesetzt|getreten)|ersetzt\s+durch|abgelöst\s+durch)\b/iu;

/** Prüft, ob eine Änderung nach dem Stichtag den Fortbestand eines undatierten Datensatzes trägt. */
export function assessUndatedContinuity(input: LrmbValidityInput, post: AmendmentEvidence): ContinuityAssessment {
  const checks: ContinuityCheck[] = [];
  checks.push(post.identification?.ok
    ? { id: 'same-stem', ok: true, strength: 'strong', statement: `${describe(post)}: ${post.identification.reason}` }
    : { id: 'same-stem', ok: false, strength: 'strong', statement: `${describe(post)}: Stammvorschrift nicht eindeutig identifiziert (${post.identification?.reason ?? 'kein Ministerialblatt-Eintrag'})` });
  const gazetteText = post.gazetteText?.replace(/\s+/gu, ' ');
  checks.push(gazetteText && EXPLICIT_AMENDMENT.test(gazetteText)
    ? { id: 'explicit-amendment', ok: true, strength: 'strong', statement: `${describe(post)} ändert die Vorschrift ausdrücklich („${EXPLICIT_AMENDMENT.exec(gazetteText)![0]}“)` }
    : { id: 'explicit-amendment', ok: false, strength: 'strong', statement: `${describe(post)}: kein ausdrücklicher Änderungsbefehl für diese Vorschrift${gazetteText ? '' : ' (Text des Eintrags nicht verfügbar)'}` });

  const chronological = [...input.amendments].filter((amendment) => amendment.note.decreeDate).sort((left, right) => left.note.decreeDate!.localeCompare(right.note.decreeDate!));
  const position = chronological.indexOf(post);
  const previous = position > 0 ? chronological[position - 1] : undefined;
  if (previous) {
    checks.push(post.predecessor?.date === previous.note.decreeDate
      ? { id: 'unbroken-chain', ok: true, strength: 'strong', statement: `Eingangsformel nennt die vorhergehende Änderung vom ${previous.note.decreeDate} – keine Aufhebung oder Neufassung dazwischen belegt` }
      : { id: 'unbroken-chain', ok: false, strength: 'strong', statement: post.predecessor?.date ? `Eingangsformel nennt ${post.predecessor.date}, der Fundstellenverlauf aber ${previous.note.decreeDate}` : `Eingangsformel nennt keine vorhergehende Änderung, obwohl der Fundstellenverlauf die Änderung vom ${previous.note.decreeDate} führt` });
  } else {
    checks.push(post.predecessor?.date
      ? { id: 'unbroken-chain', ok: false, strength: 'strong', statement: `Eingangsformel nennt eine frühere Änderung vom ${post.predecessor.date}, die im Fundstellenverlauf fehlt` }
      : { id: 'unbroken-chain', ok: true, strength: 'strong', statement: 'Erste Änderung der Stammvorschrift; keine Zwischenänderung' });
  }

  // Jede Ministerialblatt-Änderung des Fundstellenverlaufs muss der Stammvorschrift zugeordnet sein; eine nicht
  // zuordenbare Änderung (anderer Titel, andere Stammfundstelle, kein Eintrag) widerlegt die konsistente Identität.
  const identified = input.amendments.filter((amendment) => amendment.identification?.ok);
  const unidentified = input.amendments.filter((amendment) => amendment.identification && !amendment.identification.ok);
  checks.push(input.changeNote?.base && identified.length > 0 && unidentified.length === 0
    ? { id: 'consistent-identity', ok: true, strength: 'strong', statement: `Alle ${identified.length} Ministerialblatt-Änderungen sind der Stammvorschrift ${input.changeNote.base.text} zugeordnet` }
    : { id: 'consistent-identity', ok: false, strength: 'strong', statement: !input.changeNote?.base ? 'Stammfundstelle im Fundstellenverlauf nicht lesbar' : unidentified.length > 0 ? `${unidentified.length} Änderung(en) nicht der Stammvorschrift ${input.changeNote.base.text} zugeordnet (${unidentified.map((amendment) => `${describe(amendment)}: ${amendment.identification!.reason}`).join('; ').slice(0, 300)})` : 'Keine Änderung der Stammvorschrift zugeordnet' });

  const contrary: string[] = [];
  const between = chronological.slice(0, Math.max(0, position)).filter((amendment) => !amendment.inForce || amendment.inForce > (input.clauses.inForce?.date ?? input.issuedOn ?? ''));
  for (const amendment of [...between, post]) {
    const text = amendment.gazetteText?.replace(/\s+/gu, ' ') ?? '';
    if (WHOLE_REPEAL.test(text)) contrary.push(`${describe(amendment)} hebt die Vorschrift auf`);
    if (WHOLE_NEW_VERSION.test(text)) contrary.push(`${describe(amendment)} fasst die Vorschrift neu`);
  }
  for (const text of input.contraryTexts ?? []) if (isContraryNotice(text, post.inForce ?? input.baseline)) contrary.push(`Portalvermerk: „${text.replace(/\s+/gu, ' ').slice(0, 160)}“`);
  // Suchindex-Signale sind unzureichende Belege: sie werden genannt, entscheiden aber nie allein.
  const indexNotes = [input.indexSignals?.historically ? 'Suchindex markiert „historisch“' : '', input.indexSignals?.outforceDate ? `Suchindex nennt Außerkrafttreten ${input.indexSignals.outforceDate}` : ''].filter(Boolean);
  checks.push(contrary.length === 0
    ? { id: 'no-contrary-evidence', ok: true, strength: 'supporting', statement: `Kein Aufhebungs-, Ablösungs- oder Neufassungshinweis in Portalvermerken und Änderungstexten${indexNotes.length ? ` (${indexNotes.join('; ')} – allein unzureichend, nicht entscheidend)` : ''}` }
    : { id: 'no-contrary-evidence', ok: false, strength: 'supporting', statement: contrary.join('; ') });
  return { supported: checks.every((check) => check.ok), checks };
}

/**
 * Starke Belege, die einem Ende der Vorschrift zu `endDate` widersprechen: spätere zugeordnete Änderungen, spätere
 * Einträge des Fundstellenverlaufs, ein späteres eigenes Inkrafttreten, ein späteres Ausfertigungsdatum.
 */
function contradictionsAgainstEnd(input: LrmbValidityInput, endDate: string): string[] {
  const contradictions: string[] = [];
  for (const amendment of input.amendments) {
    const later = amendment.inForce ?? (amendment.identification?.ok ? amendment.note.decreeDate : undefined);
    if (amendment.identification?.ok && later && later > endDate) contradictions.push(`${describe(amendment)} ändert die Vorschrift nach dem Ende (${amendment.inForce ? `in Kraft ${amendment.inForce}` : `erlassen ${amendment.note.decreeDate}`})`);
    else if (amendment.note.decreeDate && amendment.note.decreeDate > endDate) contradictions.push(`Fundstellenverlauf nennt eine Änderung vom ${amendment.note.decreeDate} nach dem Ende`);
  }
  if (input.clauses.inForce?.date && input.clauses.inForce.date > endDate) contradictions.push(`Inkrafttreten laut Text (${input.clauses.inForce.date}) liegt nach dem Ende`);
  if (input.issuedOn && input.issuedOn > endDate) contradictions.push(`Ausfertigungsdatum ${input.issuedOn} liegt nach dem Ende`);
  return contradictions;
}

const NOTICE_DATE = /\b(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b|\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/gu;
const MONTH_INDEX: Record<string, string> = { Januar: '01', Februar: '02', März: '03', April: '04', Mai: '05', Juni: '06', Juli: '07', August: '08', September: '09', Oktober: '10', November: '11', Dezember: '12' };

/**
 * Ob ein Portalvermerk („Aufgehoben durch Runderlass vom 17. Februar 2026, in Kraft getreten am …“) der Fortgeltung bis
 * `until` widerspricht: nur, wenn er undatiert ist (fail-closed) oder sein spätestes Datum vor `until` liegt. Eine
 * spätere Aufhebung ist mit der Geltung bis dahin vereinbar; `until` ist das Inkrafttreten der Fortbestandsänderung (P3)
 * bzw. die Wirksamkeit des Nachfolgebelegs (P2).
 */
export function isContraryNotice(text: string, until: string): boolean {
  const normalized = text.replace(/\s+/gu, ' ');
  if (!CONTRARY_NOTICE.test(normalized)) return false;
  const dates: string[] = [];
  for (const match of normalized.matchAll(NOTICE_DATE)) {
    if (match[3]) dates.push(`${match[3]}-${MONTH_INDEX[match[2]!]}-${match[1]!.padStart(2, '0')}`);
    else if (match[6]) dates.push(`${match[6]}-${match[5]!.padStart(2, '0')}-${match[4]!.padStart(2, '0')}`);
  }
  if (dates.length === 0) return true;
  return dates.sort().pop()! < until;
}

/** Aufhebungs-, Neufassungs- und Ablösungshinweise vor `until` in Änderungstexten und Portalvermerken. */
function contraryHints(input: LrmbValidityInput, until: string): string[] {
  const hints: string[] = [];
  for (const amendment of input.amendments) {
    if (amendment.inForce && amendment.inForce >= until) continue;
    const text = amendment.gazetteText?.replace(/\s+/gu, ' ') ?? '';
    if (WHOLE_REPEAL.test(text)) hints.push(`${describe(amendment)} hebt die Vorschrift auf`);
    if (WHOLE_NEW_VERSION.test(text)) hints.push(`${describe(amendment)} fasst die Vorschrift neu`);
  }
  for (const text of input.contraryTexts ?? []) if (isContraryNotice(text, until)) hints.push(`Portalvermerk: „${text.replace(/\s+/gu, ' ').slice(0, 160)}“`);
  return hints;
}

export function assessLrmbValidity(input: LrmbValidityInput): LrmbValidityAssessment {
  const { baseline } = input;
  const evidence: ValidityEvidence[] = [];
  const findings: ImportFinding[] = [];
  const result = (partial: Omit<LrmbValidityAssessment, 'evidence' | 'findings' | 'provenance'> & { provenance?: ValidityProvenance }): LrmbValidityAssessment => {
    const provenance = partial.provenance ?? (partial.baselineStatus === 'undetermined' ? 'undetermined' : partial.sourceValidity);
    for (const [index, item] of evidence.entries()) {
      const problems = validateValidityEvidence(item);
      if (problems.length > 0) findings.push({ severity: 'error', code: 'validity-evidence-schema', message: `Beleg ${index + 1} (${item.kind}) verletzt das Belegschema: ${problems.join('; ')}` });
    }
    return { ...partial, provenance, evidence, findings };
  };
  const undetermined = (rule: ValidityDecisionRule): LrmbValidityAssessment => result({ baselineStatus: 'undetermined', textStatus: 'not-applicable', sourceValidity: 'exact', decisionRule: rule, postBaselineAmendments: [], missingPreBaselineAmendments: [] });
  const notActive = (rule: ValidityDecisionRule): LrmbValidityAssessment => result({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', sourceValidity: 'exact', decisionRule: rule, postBaselineAmendments: [], missingPreBaselineAmendments: [] });

  if (input.completenessNotice) evidence.push({ kind: 'portal-completeness-notice', supports: 'completeness', strength: 'supporting', statement: `Redaktioneller Hinweis des Portals: ${input.completenessNotice.text}`, sourceUrl: input.completenessNotice.url, sha256: input.completenessNotice.sha256 });
  if (input.indexSignals && (input.indexSignals.historically !== undefined || input.indexSignals.outforceDate || input.indexSignals.effectiveFrom)) {
    evidence.push({ kind: 'search-index-signal', supports: input.indexSignals.outforceDate && input.indexSignals.outforceDate <= baseline ? 'contradiction' : 'active-at-baseline', strength: 'insufficient', statement: `Suchindex (nur Hinweis): historisch ${input.indexSignals.historically ?? '–'}, Gültig ab ${input.indexSignals.effectiveFrom ?? '–'}, Außerkrafttreten ${input.indexSignals.outforceDate ?? '–'}` });
  }

  // --- 1a. Eigene Außerkrafttretensformeln (P1) --------------------------------------------------
  if (input.clauses.expiryConflicts && input.clauses.expiryConflicts.length > 1) {
    for (const clause of input.clauses.expiryConflicts) evidence.push({ kind: 'text-expiry-clause', supports: 'contradiction', strength: 'contradictory', statement: `Eigene Außerkrafttretensformel (${clause.via}) nennt ${clause.date}; eine weitere Formel nennt ein anderes Datum`, date: clause.date, excerpt: excerptOf(clause.text), sourceUrl: input.page.url, sha256: input.page.sha256 });
    findings.push({ severity: 'error', code: 'validity-expiry-ambiguous', message: `Mehrere eigene Außerkrafttretensformeln mit verschiedenen Daten (${input.clauses.expiryConflicts.map((clause) => clause.date).join(', ')}) – kein Ende bestimmbar` });
    return undetermined('contradictory');
  }
  const expiry: ExpiryClause | undefined = input.clauses.expiry;
  // Eigene Änderungen (Ministerialblatt-Einträge des Fundstellenverlaufs) und Fassungswechsel derselben Stammnorm sind keine
  // Nachfolger: Sie führen die Vorschrift fort. Nur Zuordnungen der Stufe `strong` zählen als Beleg.
  const ownGazetteUrls = new Set(input.amendments.filter((amendment) => amendment.gazetteUrl && amendment.identification?.ok).map((amendment) => amendment.gazetteUrl!));
  const strongSuccessors = (input.successors ?? []).filter((match) => match.level === 'strong' && !ownGazetteUrls.has(match.source.url) && !(match.effective.date && input.versionStarts.includes(match.effective.date)));
  if (input.clauses.inForce) evidence.push({ kind: 'text-in-force-clause', supports: 'valid-from', strength: input.clauses.inForce.date ? 'strong' : 'supporting', statement: input.clauses.inForce.text, ...(input.clauses.inForce.date ? { date: input.clauses.inForce.date } : {}), excerpt: excerptOf(input.clauses.inForce.text), sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (expiry) {
    const contradictions = contradictionsAgainstEnd(input, expiry.date);
    // „mit Ablauf des 31.12.“ und ein Nachfolger „in Kraft ab 1.1.“ meinen dasselbe Ende: ein Tag Toleranz.
    for (const match of strongSuccessors.filter((candidate) => candidate.strength === 'strong' && candidate.effective.date! > nextDay(expiry.date))) contradictions.push(`Nachfolgebeleg ${match.record.successorTitle.slice(0, 80)} nennt ein Ende erst am ${match.effective.date}`);
    if (contradictions.length > 0) {
      evidence.push({ kind: 'text-expiry-clause', supports: 'contradiction', strength: 'contradictory', statement: `Eigene Außerkrafttretensformel (${expiry.via}) nennt ${expiry.date}, widersprochen durch: ${contradictions.join('; ')}`, date: expiry.date, excerpt: excerptOf(expiry.text), sourceUrl: input.page.url, sha256: input.page.sha256 });
      findings.push({ severity: 'error', code: 'validity-expiry-contradicted', message: `Außerkrafttreten laut Text (${expiry.date}, „${expiry.phrase ?? expiry.text.slice(0, 80)}“) widerspricht anderen Belegen: ${contradictions.join('; ')}` });
      return undetermined('contradictory');
    }
    evidence.push({ kind: 'text-expiry-clause', supports: expiry.date < baseline ? 'contradiction' : 'valid-to', strength: 'strong', statement: `${expiry.via === 'repeal-pattern' ? 'Eigene Außerkrafttretensformel' : 'Außerkrafttretensklausel'}: ${expiry.text}`, date: expiry.date, excerpt: excerptOf(expiry.text), sourceUrl: input.page.url, sha256: input.page.sha256 });
  }
  if (expiry && expiry.date < baseline) {
    findings.push({ severity: 'error', code: 'validity-expired-before-baseline', message: `Der Text tritt am ${expiry.date} außer Kraft („${expiry.phrase ?? expiry.text.slice(0, 80)}“) – vor dem Stichtag ${baseline}; ${input.page.validTo ? `Portal nennt Gültig bis ${input.page.validTo}` : 'das Portal weist kein Ende aus (Widerspruch zur Fassungsseite)'}` });
    return notActive('P1-self-expiry');
  }
  if (expiry && input.page.validTo && expiry.date < input.page.validTo) findings.push({ severity: 'error', code: 'metadata-validity-conflict', message: `Außerkrafttreten laut Text (${expiry.date}) liegt vor „Gültig bis“ des Portals (${input.page.validTo})` });
  if (expiry && input.page.validTo && expiry.date > input.page.validTo) findings.push({ severity: 'warning', code: 'validity-ended-before-expiry-clause', message: `Portal: Gültig bis ${input.page.validTo}; Text: Außerkrafttreten erst ${expiry.date} (vorzeitige Aufhebung oder Ersetzung, Stichtag nicht betroffen)` });

  // --- 1b. Nachfolgebelege (P2): Aufhebung/Ablösung durch eine benannte Vorschrift ---------------
  let successorContinuity: SuccessorMatch | undefined;
  const successorEvidence = (match: SuccessorMatch, supports: ValidityEvidence['supports'], strength: ValidityEvidence['strength'], note: string): ValidityEvidence => ({ kind: 'successor-repeal', supports, strength, statement: `${match.record.successorTitle.slice(0, 120)}: „${match.statement.phrase}“ (${match.statement.kind}) für ${match.record.predecessorIdentity}; Wirksamkeit ${match.effective.date ?? 'nicht datierbar'} (${match.effective.derivation}); ${note}`, ...(match.effective.date ? { date: match.effective.date } : {}), citation: match.record.citation, excerpt: excerptOf(match.statement.text), sourceUrl: match.source.url, sha256: match.source.sha256, successor: match.record });
  const decidingBefore = strongSuccessors.filter((match) => match.strength === 'strong' && match.effective.date! < baseline).sort((left, right) => left.effective.date!.localeCompare(right.effective.date!));
  const decidingAfter = strongSuccessors.filter((match) => match.strength === 'strong' && match.effective.date! >= baseline).sort((left, right) => left.effective.date!.localeCompare(right.effective.date!));
  for (const match of strongSuccessors.filter((candidate) => candidate.strength !== 'strong')) evidence.push(successorEvidence(match, match.effective.date && match.effective.date < baseline ? 'contradiction' : 'continuity', 'supporting', 'starke Zuordnung, aber Wirksamkeit nicht belegt oder Formel nicht entscheidend – kein automatischer Status'));
  if (decidingBefore.length > 0) {
    const earliest = decidingBefore[0]!;
    const contradictions = contradictionsAgainstEnd(input, earliest.effective.date!);
    if (!input.page.undated && input.selection?.status === 'selected') contradictions.push(`Portalintervall der gewählten Fassung deckt den Stichtag (Gültig ab ${input.selection.selected?.validFrom ?? '?'})`);
    if (decidingAfter.length > 0) contradictions.push(`weiterer starker Nachfolgebeleg nennt ein Ende erst am ${decidingAfter[0]!.effective.date}`);
    // Eine eigene Außerkrafttretensformel mit späterem Datum ist kein Widerspruch: vorzeitige Aufhebung oder Ersetzung.
    if (contradictions.length > 0) {
      for (const match of decidingBefore) evidence.push(successorEvidence(match, 'contradiction', 'contradictory', `widersprochen durch: ${contradictions.join('; ')}`));
      findings.push({ severity: 'error', code: 'validity-successor-contradicted', message: `Aufhebung/Ablösung durch ${earliest.record.successorTitle.slice(0, 100)} (wirksam ${earliest.effective.date}) widerspricht anderen Belegen: ${contradictions.join('; ')}` });
      return undetermined('contradictory');
    }
    for (const match of decidingBefore) evidence.push(successorEvidence(match, 'contradiction', 'strong', 'vor dem Stichtag – Vorschrift gilt am Stichtag nicht mehr'));
    findings.push({ severity: 'error', code: 'validity-repealed-before-baseline', message: `${earliest.record.successorTitle.slice(0, 100)} hebt die Vorschrift mit Wirkung vom ${earliest.effective.date} auf oder ersetzt sie („${earliest.statement.text.slice(0, 160)}“) – vor dem Stichtag ${baseline}` });
    return notActive('P2-successor-repeal');
  }
  if (decidingAfter.length > 0) {
    const earliest = decidingAfter[0]!;
    const contradictions = contradictionsAgainstEnd(input, earliest.effective.date!);
    if (contradictions.length > 0) {
      for (const match of decidingAfter) evidence.push(successorEvidence(match, 'continuity', 'contradictory', `widersprochen durch: ${contradictions.join('; ')}`));
      findings.push({ severity: 'error', code: 'validity-successor-contradicted', message: `Aufhebung/Ablösung durch ${earliest.record.successorTitle.slice(0, 100)} (wirksam ${earliest.effective.date}) widerspricht anderen Belegen: ${contradictions.join('; ')}` });
      return undetermined('contradictory');
    }
    // Wie bei P3 (no-contrary-evidence): kein Aufhebungs-, Ablösungs- oder Neufassungshinweis bis zur Aufhebung.
    const contrary = contraryHints(input, earliest.effective.date!);
    if (contrary.length > 0) {
      for (const match of decidingAfter) evidence.push(successorEvidence(match, 'continuity', 'contradictory', `Gegenhinweis vor der Aufhebung: ${contrary.join('; ')}`));
      findings.push({ severity: 'error', code: 'validity-successor-contradicted', message: `Fortbestand bis ${earliest.effective.date} laut ${earliest.record.successorTitle.slice(0, 100)} steht gegen Aufhebungs-/Neufassungshinweise: ${contrary.join('; ')}` });
      return undetermined('contradictory');
    }
    for (const match of decidingAfter) evidence.push(successorEvidence(match, 'continuity', 'strong', 'nach dem Stichtag – belegt den Fortbestand bis zur Aufhebung'));
    successorContinuity = earliest;
  }

  // --- 1c. Veröffentlichung der Stammfassung (P4) -------------------------------------------------
  let start: LrmbValidityAssessment['start'] | undefined;
  if (input.clauses.inForce?.date && input.clauses.inForce.date <= baseline) start = { date: input.clauses.inForce.date, derivation: `Inkrafttreten ${input.clauses.inForce.date} (Klausel)`, strength: 'strong' };
  if (input.basePublication) {
    const publication = input.basePublication;
    if (publication.identified && publication.publishedOn) {
      const derived = input.clauses.inForce?.kind === 'day-after-publication' ? nextDay(publication.publishedOn) : undefined;
      evidence.push({ kind: 'gazette-publication', supports: 'valid-from', strength: derived ? 'strong' : 'supporting', statement: derived ? `Stammfassung veröffentlicht am ${publication.publishedOn} (${publication.citation}); Klausel „am Tag nach der Veröffentlichung“ → Inkrafttreten ${derived}` : `Stammfassung veröffentlicht am ${publication.publishedOn} (${publication.citation}); ${publication.reason} – Veröffentlichung ist kein Inkrafttreten`, date: derived ?? publication.publishedOn, citation: publication.citation, ...(publication.url ? { sourceUrl: publication.url } : {}), ...(publication.sha256 ? { sha256: publication.sha256 } : {}) });
      if (derived && derived <= baseline && !start) start = { date: derived, derivation: `Tag nach der Veröffentlichung der Stammfassung am ${publication.publishedOn} (${publication.citation})`, strength: 'strong' };
    } else {
      evidence.push({ kind: 'gazette-publication', supports: 'valid-from', strength: 'supporting', statement: `Stammfundstelle ${publication.citation} (amtliche Veröffentlichung; ${publication.reason}) – kein Inkrafttretensbeleg`, citation: publication.citation, ...(publication.url ? { sourceUrl: publication.url } : {}), ...(publication.sha256 ? { sha256: publication.sha256 } : {}) });
    }
  }

  // --- 2. Geltung des Dokuments am Stichtag ---------------------------------------------------
  const inForceKnown = input.amendments.filter((amendment) => amendment.inForce);
  const preBaselineAmendment = inForceKnown.find((amendment) => amendment.inForce! <= baseline);
  let alive: 'yes' | 'no' | 'unknown' = 'unknown';
  let continuity: ContinuityAssessment | undefined;
  let rule: ValidityDecisionRule = 'insufficient';
  if (!input.page.undated) {
    const selection = input.selection;
    if (selection?.status === 'selected' && selection.selected) {
      alive = 'yes';
      rule = 'portal-interval';
      evidence.push({ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: `Portalfassung gültig ${selection.selected.validFrom} bis ${selection.selected.validTo ?? 'offen'} (lokale Stichtagsauswahl über ${selection.candidates.length} Fassung(en))`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else if (selection && selection.status === 'no-version-at-baseline') {
      alive = 'no';
      rule = 'portal-no-version';
      findings.push({ severity: 'info', code: 'validity-not-at-baseline', message: selection.problems.join('; ') || 'Keine Portalfassung deckt den Stichtag ab' });
      evidence.push({ kind: 'portal-version-list', supports: 'contradiction', strength: 'strong', statement: `Keine Portalfassung deckt den Stichtag ab (${selection.candidates.map((candidate) => `${candidate.validFrom}–${candidate.validTo ?? 'offen'}`).join(', ')})`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else {
      findings.push({ severity: 'error', code: `selection-${selection?.status ?? 'missing'}`, message: selection?.problems.join('; ') || 'Stichtagsauswahl nicht möglich' });
      return undetermined('insufficient');
    }
  } else {
    if (!start && input.issuedOn !== undefined && input.issuedOn <= baseline && preBaselineAmendment !== undefined) start = { date: preBaselineAmendment.inForce!, derivation: `Änderung in Kraft ${preBaselineAmendment.inForce}; ${describe(preBaselineAmendment)}, Ausfertigung ${input.issuedOn}`, strength: 'strong' };
    const started = start !== undefined && start.strength === 'strong';
    const postCandidates = inForceKnown.filter((amendment) => amendment.inForce! > baseline).sort((left, right) => left.inForce!.localeCompare(right.inForce!));
    const post = postCandidates.find((amendment) => amendment.identification?.ok) ?? postCandidates[0];
    if (started && post) {
      continuity = assessUndatedContinuity(input, post);
      for (const check of continuity.checks) {
        evidence.push({ kind: check.id === 'unbroken-chain' ? 'gazette-amendment-chain' : check.id === 'no-contrary-evidence' ? 'portal-change-history' : 'gazette-amendment', supports: check.ok ? 'continuity' : 'contradiction', strength: check.strength, statement: `${check.ok ? 'bestanden' : 'nicht bestanden'} (${check.id}): ${check.statement}`, ...(post.gazetteUrl && check.id !== 'no-contrary-evidence' ? { sourceUrl: post.gazetteUrl } : {}), ...(post.gazetteSha256 && check.id !== 'no-contrary-evidence' ? { sha256: post.gazetteSha256 } : {}) });
      }
    }
    if (started && post && continuity?.supported) {
      alive = 'yes';
      rule = 'P3-amendment-continuity';
      evidence.push({ kind: 'gazette-amendment', supports: 'active-at-baseline', strength: 'strong', statement: `Undatierter Datensatz: vor dem Stichtag in Kraft (${start!.derivation}) und Fortbestand über ${describe(post)} (in Kraft ${post.inForce}) mit bestandenen Kontinuitätsprüfungen belegt`, ...(post.gazetteUrl ? { sourceUrl: post.gazetteUrl } : {}), ...(post.gazetteSha256 ? { sha256: post.gazetteSha256 } : {}) });
    } else if (started && successorContinuity) {
      alive = 'yes';
      rule = 'P2-successor-continuity';
      evidence.push({ kind: 'successor-repeal', supports: 'active-at-baseline', strength: 'strong', statement: `Undatierter Datensatz: vor dem Stichtag in Kraft (${start!.derivation}) und bis zur Aufhebung/Ablösung am ${successorContinuity.effective.date} durch ${successorContinuity.record.successorTitle.slice(0, 100)} fortbestehend (${successorContinuity.effective.derivation})`, date: successorContinuity.effective.date!, citation: successorContinuity.record.citation, sourceUrl: successorContinuity.source.url, sha256: successorContinuity.source.sha256, successor: successorContinuity.record });
    } else {
      const reason = !started ? `kein belegter Beginn vor dem Stichtag${start ? ` (nur unterstützend: ${start.derivation})` : ''}` : !post ? 'Beginn belegt, aber keine Änderung nach dem Stichtag als Beleg für den Fortbestand' : `spätere Änderung ohne Kontinuitätsbeleg (${continuity!.checks.filter((check) => !check.ok).map((check) => check.id).join(', ')})`;
      findings.push({ severity: 'error', code: 'validity-undetermined', message: `Undatierter Datensatz ohne Beleg der Geltung am Stichtag: ${reason}` });
      const open = undetermined('insufficient');
      if (continuity) open.continuity = continuity;
      if (start) open.start = start;
      return open;
    }
  }
  if (alive === 'no') return notActive(rule);

  // --- 3. Textstand der gewählten Seite ------------------------------------------------------
  if (input.changeNote) evidence.push({ kind: 'portal-change-history', supports: 'text-state', strength: 'supporting', statement: `Fundstellenverlauf: ${input.changeNote.raw}`, sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (input.changeNote && !input.changeNote.complete) findings.push({ severity: 'error', code: 'reconstruction-uncertain-change-note', message: `Fundstellenverlauf nicht vollständig lesbar: „${input.changeNote.raw}“` });
  const textStart = input.page.undated ? undefined : input.page.validFrom;
  const relevant = input.amendments.filter((amendment) => !(amendment.inForce && input.versionStarts.includes(amendment.inForce) && !amendment.incorporated));
  for (const amendment of relevant) {
    if (amendment.gazetteUrl && amendment.identification?.ok) {
      evidence.push({ kind: 'gazette-amendment', supports: 'text-state', strength: 'strong', statement: `${describe(amendment)}: ${amendment.identification.reason}; Inkrafttreten ${amendment.inForce ?? 'unbekannt'} (${amendment.inForceDerivation})`, ...(amendment.inForce ? { date: amendment.inForce } : {}), ...(amendment.note.citation ? { citation: amendment.note.citation.text } : {}), sourceUrl: amendment.gazetteUrl, ...(amendment.gazetteSha256 ? { sha256: amendment.gazetteSha256 } : {}) });
    }
    if (!amendment.inForce) {
      const irrelevant = textStart && amendment.note.decreeDate && amendment.note.decreeDate < textStart && !amendment.incorporated;
      if (!irrelevant) findings.push({ severity: 'error', code: 'reconstruction-uncertain-in-force', message: `${describe(amendment)}: Inkrafttreten nicht belegbar (${amendment.identification && !amendment.identification.ok ? amendment.identification.reason : amendment.inForceDerivation})` });
    }
  }
  // Änderungskette: jede Eingangsformel muss die unmittelbar vorhergehende Änderung nennen.
  const chronological = [...relevant].sort((left, right) => (left.note.decreeDate ?? '').localeCompare(right.note.decreeDate ?? ''));
  chronological.forEach((amendment, position) => {
    if (!amendment.predecessor) return;
    const previous = chronological[position - 1];
    if (amendment.predecessor.date && previous?.note.decreeDate !== amendment.predecessor.date) {
      findings.push({ severity: 'error', code: 'reconstruction-uncertain-chain', message: `${describe(amendment)} nennt als vorherige Änderung den Runderlass vom ${amendment.predecessor.date}, der Fundstellenverlauf aber ${previous ? `den vom ${previous.note.decreeDate}` : 'keine'}` });
    }
  });
  if (chronological.length > 0 && chronological.every((amendment) => amendment.predecessor !== undefined || amendment === chronological[0])) {
    evidence.push({ kind: 'gazette-amendment-chain', supports: 'completeness', strength: 'strong', statement: `Änderungskette lückenlos: ${chronological.map((amendment) => amendment.note.decreeDate ?? amendment.note.decreeDateText).join(' → ')} (jede Eingangsformel nennt die vorhergehende Änderung)` });
  }

  const postBaselineAmendments = relevant.filter((amendment) => amendment.incorporated && amendment.inForce && amendment.inForce > baseline);
  const missingPreBaselineAmendments = relevant.filter((amendment) => !amendment.incorporated && amendment.inForce && amendment.inForce <= baseline && (!textStart || amendment.inForce > textStart));
  const incorporatedPre = relevant.filter((amendment) => amendment.incorporated && amendment.inForce && amendment.inForce <= baseline && (!textStart || amendment.inForce > textStart));
  const laterNotIncorporated = relevant.filter((amendment) => !amendment.incorporated && amendment.inForce && amendment.inForce > baseline);
  const withContext = (assessment: LrmbValidityAssessment): LrmbValidityAssessment => {
    if (continuity) assessment.continuity = continuity;
    if (start) assessment.start = start;
    return assessment;
  };
  if (findings.some((finding) => finding.severity === 'error')) {
    return withContext(result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', decisionRule: rule, postBaselineAmendments, missingPreBaselineAmendments }));
  }

  const latestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort().pop();
  const earliestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort()[0];
  if (postBaselineAmendments.length > 0 || missingPreBaselineAmendments.length > 0) {
    findings.push({ severity: 'error', code: 'reconstruction-required', message: [postBaselineAmendments.length ? `Text enthält Änderungen mit Inkrafttreten nach dem Stichtag: ${postBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : '', missingPreBaselineAmendments.length ? `Text enthält Änderungen vor dem Stichtag nicht: ${missingPreBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : ''].filter(Boolean).join('. ') });
    const reconstructed: LrmbValidityAssessment = withContext(result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', decisionRule: rule, postBaselineAmendments, missingPreBaselineAmendments }));
    const from = latestIn([...incorporatedPre, ...missingPreBaselineAmendments]) ?? textStart;
    const to = earliestIn([...postBaselineAmendments, ...laterNotIncorporated]);
    if (from) reconstructed.sourceValidFrom = from;
    if (to) reconstructed.sourceValidTo = previousDay(to);
    return reconstructed;
  }

  // Direkt übernehmbar.
  const direct: LrmbValidityAssessment = withContext(result({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidity: 'exact', decisionRule: rule, postBaselineAmendments, missingPreBaselineAmendments }));
  const textStateStart = latestIn(incorporatedPre);
  if (textStateStart) {
    direct.sourceValidFrom = textStateStart;
    direct.sourceValidity = 'verified-active-at-baseline';
    const nextChange = earliestIn(laterNotIncorporated);
    if (input.page.validTo) direct.sourceValidTo = nextChange && previousDay(nextChange) < input.page.validTo ? previousDay(nextChange) : input.page.validTo;
    else if (nextChange) direct.sourceValidTo = previousDay(nextChange);
  } else if (textStart) {
    direct.sourceValidFrom = textStart;
    if (input.page.validTo) direct.sourceValidTo = input.page.validTo;
  } else {
    direct.sourceValidity = 'verified-active-at-baseline';
    if (start) direct.sourceValidFrom = start.date;
    else if (input.clauses.inForce?.date) direct.sourceValidFrom = input.clauses.inForce.date;
    const nextChange = earliestIn(laterNotIncorporated);
    if (nextChange) direct.sourceValidTo = previousDay(nextChange);
  }
  // Ein starker Nachfolgebeleg nach dem Stichtag begrenzt das Intervall (Ende = Tag vor der Aufhebung), nie eine Schätzung.
  if (successorContinuity?.effective.date) {
    const end = previousDay(successorContinuity.effective.date);
    if (!direct.sourceValidTo || end < direct.sourceValidTo) direct.sourceValidTo = end;
  }
  direct.provenance = direct.sourceValidity;
  return direct;
}
