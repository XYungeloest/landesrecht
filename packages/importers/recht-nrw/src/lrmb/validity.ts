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
 *      nachgewiesener Fortbestand über eine spätere Änderung. Eine spätere Änderung trägt den Fortbestand
 *      nur, wenn alle Kontinuitätsprüfungen bestehen (`assessUndatedContinuity`):
 *        same-stem            der Ministerialblatt-Eintrag nennt die Stammvorschrift mit Datum und Fundstelle
 *        explicit-amendment   der Eintrag ändert ausdrücklich diese Vorschrift („… wird wie folgt geändert“)
 *        unbroken-chain       die Eingangsformel nennt die unmittelbar vorhergehende Änderung (keine Lücke)
 *        consistent-identity  alle Änderungen beziehen sich auf dieselbe Stammfundstelle
 *        no-contrary-evidence kein Aufhebungs-, Ablösungs- oder Neufassungshinweis, kein Außerkrafttreten
 *                             laut Suchindex vor dem Stichtag
 *      Sonst `undetermined` (Review, kein Import). Eine Außerkrafttretensklausel vor dem Stichtag widerlegt
 *      die Geltung.
 *   2. Textstand = Stichtag: Der Fundstellenverlauf der gewählten Seite nennt die eingearbeiteten
 *      Änderungen. Jede Änderung braucht ein belegtes Inkrafttreten.
 *      – alle eingearbeiteten Änderungen vor dem Stichtag und keine fehlende → direkt übernehmbar;
 *      – eingearbeitete Änderung nach dem Stichtag oder fehlende Änderung vor dem Stichtag →
 *        Rekonstruktion erforderlich (nur mit geprüftem Rekonstruktionsrezept);
 *      – Inkrafttreten nicht belegbar, Änderungskette widersprüchlich → Rekonstruktion unsicher (Review).
 *
 * Beweiswert (docs/RECHT_NRW_LRMB_IMPORT.md):
 *   strong        Portalintervall datierter Fassungen, Ministerialblatt-Änderung mit Stammfundstelle,
 *                 ausdrücklicher Änderungsbefehl, lückenlose Änderungskette, Außerkrafttretensklausel
 *   supporting    Fundstellenverlauf, Inkrafttretensklausel, Veröffentlichungsvermerk, Hinweis „vollständig ab“
 *   insufficient  `field_historically`, `field_outforce_date`/`field_effective_from` des Suchindex allein,
 *                 SMBl-Nummer, bloßes Vorhandensein im Portal – nie alleinige Grundlage
 *
 * Nichts wird geraten: fehlende Belege führen zu `undetermined` bzw. Review, nie zu einer Annahme.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { previousDay } from '@landesrecht/legal-core/lib/schema.ts';
import type { SourceValidityStatus } from '@landesrecht/legal-core/lib/schema.ts';

import type { BaselineStatus, ValidityEvidence, ValidityProvenance } from '../common/manifest.ts';
import type { SelectionResult } from '../common/version-selection.ts';
import type { ChangeNote, ChangeNoteAmendment, ValidityClauses } from './text-metadata.ts';

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
  /** Eingearbeitete Änderungen mit Inkrafttreten nach dem Stichtag (rückwärts zu rekonstruieren). */
  postBaselineAmendments: AmendmentEvidence[];
  /** Nicht eingearbeitete Änderungen mit Inkrafttreten bis zum Stichtag (vorwärts zu rekonstruieren). */
  missingPreBaselineAmendments: AmendmentEvidence[];
}

const describe = (amendment: AmendmentEvidence): string => `Runderlass vom ${amendment.note.decreeDate ?? amendment.note.decreeDateText}${amendment.note.citation ? ` (${amendment.note.citation.text})` : amendment.note.unpublished ? ' (n. v.)' : ''}`;

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
  for (const text of input.contraryTexts ?? []) if (CONTRARY_NOTICE.test(text)) contrary.push(`Portalvermerk: „${text.replace(/\s+/gu, ' ').slice(0, 160)}“`);
  // Suchindex-Signale sind unzureichende Belege: sie werden genannt, entscheiden aber nie allein.
  const indexNotes = [input.indexSignals?.historically ? 'Suchindex markiert „historisch“' : '', input.indexSignals?.outforceDate ? `Suchindex nennt Außerkrafttreten ${input.indexSignals.outforceDate}` : ''].filter(Boolean);
  checks.push(contrary.length === 0
    ? { id: 'no-contrary-evidence', ok: true, strength: 'supporting', statement: `Kein Aufhebungs-, Ablösungs- oder Neufassungshinweis in Portalvermerken und Änderungstexten${indexNotes.length ? ` (${indexNotes.join('; ')} – allein unzureichend, nicht entscheidend)` : ''}` }
    : { id: 'no-contrary-evidence', ok: false, strength: 'supporting', statement: contrary.join('; ') });
  return { supported: checks.every((check) => check.ok), checks };
}

export function assessLrmbValidity(input: LrmbValidityInput): LrmbValidityAssessment {
  const { baseline } = input;
  const evidence: ValidityEvidence[] = [];
  const findings: ImportFinding[] = [];
  const result = (partial: Omit<LrmbValidityAssessment, 'evidence' | 'findings' | 'provenance'> & { provenance?: ValidityProvenance }): LrmbValidityAssessment => {
    const provenance = partial.provenance ?? (partial.baselineStatus === 'undetermined' ? 'undetermined' : partial.sourceValidity);
    return { ...partial, provenance, evidence, findings };
  };
  if (input.completenessNotice) evidence.push({ kind: 'portal-completeness-notice', supports: 'completeness', strength: 'supporting', statement: `Redaktioneller Hinweis des Portals: ${input.completenessNotice.text}`, sourceUrl: input.completenessNotice.url, sha256: input.completenessNotice.sha256 });
  if (input.indexSignals && (input.indexSignals.historically !== undefined || input.indexSignals.outforceDate || input.indexSignals.effectiveFrom)) {
    evidence.push({ kind: 'search-index-signal', supports: input.indexSignals.outforceDate && input.indexSignals.outforceDate <= baseline ? 'contradiction' : 'active-at-baseline', strength: 'insufficient', statement: `Suchindex (nur Hinweis): historisch ${input.indexSignals.historically ?? '–'}, Gültig ab ${input.indexSignals.effectiveFrom ?? '–'}, Außerkrafttreten ${input.indexSignals.outforceDate ?? '–'}` });
  }

  // --- 1. Widerlegung durch Außerkrafttretensklausel ------------------------------------------
  const expiry = input.clauses.expiry;
  if (expiry) evidence.push({ kind: 'text-expiry-clause', supports: expiry.date < baseline ? 'contradiction' : 'valid-to', strength: 'strong', statement: expiry.text, date: expiry.date, sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (input.clauses.inForce) evidence.push({ kind: 'text-in-force-clause', supports: 'valid-from', strength: 'supporting', statement: input.clauses.inForce.text, ...(input.clauses.inForce.date ? { date: input.clauses.inForce.date } : {}), sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (expiry && expiry.date < baseline) {
    findings.push({ severity: 'error', code: 'validity-expired-before-baseline', message: `Der Text tritt am ${expiry.date} außer Kraft – vor dem Stichtag ${baseline}; ${input.page.validTo ? `Portal nennt Gültig bis ${input.page.validTo}` : 'das Portal weist kein Ende aus (Widerspruch zur Fassungsseite)'}` });
    return result({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
  }
  if (expiry && input.page.validTo && expiry.date < input.page.validTo) findings.push({ severity: 'error', code: 'metadata-validity-conflict', message: `Außerkrafttreten laut Text (${expiry.date}) liegt vor „Gültig bis“ des Portals (${input.page.validTo})` });
  if (expiry && input.page.validTo && expiry.date > input.page.validTo) findings.push({ severity: 'warning', code: 'validity-ended-before-expiry-clause', message: `Portal: Gültig bis ${input.page.validTo}; Text: Außerkrafttreten erst ${expiry.date} (vorzeitige Aufhebung oder Ersetzung, Stichtag nicht betroffen)` });

  // --- 2. Geltung des Dokuments am Stichtag ---------------------------------------------------
  const inForceKnown = input.amendments.filter((amendment) => amendment.inForce);
  const preBaselineAmendment = inForceKnown.find((amendment) => amendment.inForce! <= baseline);
  let alive: 'yes' | 'no' | 'unknown' = 'unknown';
  let continuity: ContinuityAssessment | undefined;
  if (!input.page.undated) {
    const selection = input.selection;
    if (selection?.status === 'selected' && selection.selected) {
      alive = 'yes';
      evidence.push({ kind: 'portal-version-interval', supports: 'active-at-baseline', strength: 'strong', statement: `Portalfassung gültig ${selection.selected.validFrom} bis ${selection.selected.validTo ?? 'offen'} (lokale Stichtagsauswahl über ${selection.candidates.length} Fassung(en))`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else if (selection && selection.status === 'no-version-at-baseline') {
      alive = 'no';
      findings.push({ severity: 'info', code: 'validity-not-at-baseline', message: selection.problems.join('; ') || 'Keine Portalfassung deckt den Stichtag ab' });
      evidence.push({ kind: 'portal-version-list', supports: 'contradiction', strength: 'strong', statement: `Keine Portalfassung deckt den Stichtag ab (${selection.candidates.map((candidate) => `${candidate.validFrom}–${candidate.validTo ?? 'offen'}`).join(', ')})`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else {
      findings.push({ severity: 'error', code: `selection-${selection?.status ?? 'missing'}`, message: selection?.problems.join('; ') || 'Stichtagsauswahl nicht möglich' });
      return result({ baselineStatus: 'undetermined', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
    }
  } else {
    const started = Boolean((input.clauses.inForce?.date && input.clauses.inForce.date <= baseline) || (input.issuedOn !== undefined && input.issuedOn <= baseline && preBaselineAmendment !== undefined));
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
      evidence.push({ kind: 'gazette-amendment', supports: 'active-at-baseline', strength: 'strong', statement: `Undatierter Datensatz: vor dem Stichtag in Kraft (${input.clauses.inForce?.date ? `Inkrafttreten ${input.clauses.inForce.date}` : `Änderung in Kraft ${preBaselineAmendment!.inForce}`}) und Fortbestand über ${describe(post)} (in Kraft ${post.inForce}) mit bestandenen Kontinuitätsprüfungen belegt`, ...(post.gazetteUrl ? { sourceUrl: post.gazetteUrl } : {}), ...(post.gazetteSha256 ? { sha256: post.gazetteSha256 } : {}) });
    } else {
      const reason = !started ? 'kein belegter Beginn vor dem Stichtag' : !post ? 'Beginn belegt, aber keine Änderung nach dem Stichtag als Beleg für den Fortbestand' : `spätere Änderung ohne Kontinuitätsbeleg (${continuity!.checks.filter((check) => !check.ok).map((check) => check.id).join(', ')})`;
      findings.push({ severity: 'error', code: 'validity-undetermined', message: `Undatierter Datensatz ohne Beleg der Geltung am Stichtag: ${reason}` });
      const undetermined = result({ baselineStatus: 'undetermined', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
      if (continuity) undetermined.continuity = continuity;
      return undetermined;
    }
  }
  if (alive === 'no') return result({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });

  // --- 3. Textstand der gewählten Seite ------------------------------------------------------
  if (input.changeNote) evidence.push({ kind: 'portal-change-history', supports: 'text-state', strength: 'supporting', statement: `Fundstellenverlauf: ${input.changeNote.raw}`, sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (input.changeNote && !input.changeNote.complete) findings.push({ severity: 'error', code: 'reconstruction-uncertain-change-note', message: `Fundstellenverlauf nicht vollständig lesbar: „${input.changeNote.raw}“` });
  const textStart = input.page.undated ? undefined : input.page.validFrom;
  const relevant = input.amendments.filter((amendment) => !(amendment.inForce && input.versionStarts.includes(amendment.inForce) && !amendment.incorporated));
  for (const amendment of relevant) {
    if (amendment.gazetteUrl && amendment.identification?.ok) {
      evidence.push({ kind: 'gazette-amendment', supports: 'text-state', strength: 'strong', statement: `${describe(amendment)}: ${amendment.identification.reason}; Inkrafttreten ${amendment.inForce ?? 'unbekannt'} (${amendment.inForceDerivation})`, ...(amendment.inForce ? { date: amendment.inForce } : {}), sourceUrl: amendment.gazetteUrl, ...(amendment.gazetteSha256 ? { sha256: amendment.gazetteSha256 } : {}) });
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
  const withContinuity = (assessment: LrmbValidityAssessment): LrmbValidityAssessment => {
    if (continuity) assessment.continuity = continuity;
    return assessment;
  };
  if (findings.some((finding) => finding.severity === 'error')) {
    return withContinuity(result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', postBaselineAmendments, missingPreBaselineAmendments }));
  }

  const latestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort().pop();
  const earliestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort()[0];
  if (postBaselineAmendments.length > 0 || missingPreBaselineAmendments.length > 0) {
    findings.push({ severity: 'error', code: 'reconstruction-required', message: [postBaselineAmendments.length ? `Text enthält Änderungen mit Inkrafttreten nach dem Stichtag: ${postBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : '', missingPreBaselineAmendments.length ? `Text enthält Änderungen vor dem Stichtag nicht: ${missingPreBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : ''].filter(Boolean).join('. ') });
    const reconstructed: LrmbValidityAssessment = withContinuity(result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', postBaselineAmendments, missingPreBaselineAmendments }));
    const from = latestIn([...incorporatedPre, ...missingPreBaselineAmendments]) ?? textStart;
    const to = earliestIn([...postBaselineAmendments, ...laterNotIncorporated]);
    if (from) reconstructed.sourceValidFrom = from;
    if (to) reconstructed.sourceValidTo = previousDay(to);
    return reconstructed;
  }

  // Direkt übernehmbar.
  const direct: LrmbValidityAssessment = withContinuity(result({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidity: 'exact', postBaselineAmendments, missingPreBaselineAmendments }));
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
    if (input.clauses.inForce?.date) direct.sourceValidFrom = input.clauses.inForce.date;
  }
  direct.provenance = direct.sourceValidity;
  return direct;
}
