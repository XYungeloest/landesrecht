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
 *      Stichtagsauswahl) oder – bei undatierten Altdatensätzen – Inkrafttreten bzw. eine Änderung vor
 *      dem Stichtag UND eine Änderung nach dem Stichtag (eine aufgehobene Vorschrift wird nicht mehr geändert).
 *      Eine Außerkrafttretensklausel vor dem Stichtag widerlegt die Geltung.
 *   2. Textstand = Stichtag: Der Fundstellenverlauf der gewählten Seite nennt die eingearbeiteten
 *      Änderungen. Jede Änderung braucht ein belegtes Inkrafttreten (Ministerialblatt-Eintrag, der die
 *      Vorschrift mit Datum und Fundstelle nennt, oder Veröffentlichungsvermerk mit Inkrafttreten).
 *      – alle eingearbeiteten Änderungen vor dem Stichtag und keine fehlende Änderung vor dem
 *        Stichtag → direkt übernehmbar;
 *      – eingearbeitete Änderung nach dem Stichtag oder fehlende Änderung vor dem Stichtag →
 *        Rekonstruktion erforderlich (nur mit geprüftem Rekonstruktionsrezept);
 *      – Inkrafttreten nicht belegbar, Änderungskette widersprüchlich → Rekonstruktion unsicher (Review).
 *
 * Nichts wird geraten: fehlende Belege führen zu `undetermined` bzw. Review, nie zu einer Annahme.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { previousDay } from '@landesrecht/legal-core/lib/schema.ts';
import type { SourceValidityStatus } from '@landesrecht/legal-core/lib/schema.ts';

import type { BaselineStatus, ValidityEvidence } from '../common/manifest.ts';
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
  publishedOn?: string;
  inForce?: string;
  inForceDerivation: string;
  /** Beleg, dass der Ministerialblatt-Eintrag diese Vorschrift ändert. */
  identification?: { ok: boolean; reason: string };
  /** Vorherige Änderung laut Eingangsformel („der zuletzt durch Runderlass vom … geändert worden ist“). */
  predecessor?: { latest: boolean; date?: string };
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
}

export interface LrmbValidityAssessment {
  baselineStatus: BaselineStatus;
  textStatus: 'direct' | 'reconstruction-required' | 'not-applicable';
  sourceValidFrom?: string;
  sourceValidTo?: string;
  sourceValidity: SourceValidityStatus;
  evidence: ValidityEvidence[];
  findings: ImportFinding[];
  /** Eingearbeitete Änderungen mit Inkrafttreten nach dem Stichtag (rückwärts zu rekonstruieren). */
  postBaselineAmendments: AmendmentEvidence[];
  /** Nicht eingearbeitete Änderungen mit Inkrafttreten bis zum Stichtag (vorwärts zu rekonstruieren). */
  missingPreBaselineAmendments: AmendmentEvidence[];
}

const describe = (amendment: AmendmentEvidence): string => `Runderlass vom ${amendment.note.decreeDate ?? amendment.note.decreeDateText}${amendment.note.citation ? ` (${amendment.note.citation.text})` : amendment.note.unpublished ? ' (n. v.)' : ''}`;

export function assessLrmbValidity(input: LrmbValidityInput): LrmbValidityAssessment {
  const { baseline } = input;
  const evidence: ValidityEvidence[] = [];
  const findings: ImportFinding[] = [];
  const result = (partial: Omit<LrmbValidityAssessment, 'evidence' | 'findings'>): LrmbValidityAssessment => ({ ...partial, evidence, findings });
  if (input.completenessNotice) evidence.push({ kind: 'portal-completeness-notice', supports: 'completeness', statement: `Redaktioneller Hinweis des Portals: ${input.completenessNotice.text}`, sourceUrl: input.completenessNotice.url, sha256: input.completenessNotice.sha256 });

  // --- 1. Widerlegung durch Außerkrafttretensklausel ------------------------------------------
  const expiry = input.clauses.expiry;
  if (expiry) evidence.push({ kind: 'text-expiry-clause', supports: expiry.date < baseline ? 'contradiction' : 'valid-to', statement: expiry.text, date: expiry.date, sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (input.clauses.inForce) evidence.push({ kind: 'text-in-force-clause', supports: 'valid-from', statement: input.clauses.inForce.text, ...(input.clauses.inForce.date ? { date: input.clauses.inForce.date } : {}), sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (expiry && expiry.date < baseline) {
    findings.push({ severity: 'error', code: 'validity-expired-before-baseline', message: `Der Text tritt am ${expiry.date} außer Kraft – vor dem Stichtag ${baseline}; ${input.page.validTo ? `Portal nennt Gültig bis ${input.page.validTo}` : 'das Portal weist kein Ende aus (Widerspruch zur Fassungsseite)'}` });
    return result({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
  }
  if (expiry && input.page.validTo && expiry.date < input.page.validTo) findings.push({ severity: 'error', code: 'metadata-validity-conflict', message: `Außerkrafttreten laut Text (${expiry.date}) liegt vor „Gültig bis“ des Portals (${input.page.validTo})` });
  if (expiry && input.page.validTo && expiry.date > input.page.validTo) findings.push({ severity: 'warning', code: 'validity-ended-before-expiry-clause', message: `Portal: Gültig bis ${input.page.validTo}; Text: Außerkrafttreten erst ${expiry.date} (vorzeitige Aufhebung oder Ersetzung, Stichtag nicht betroffen)` });

  // --- 2. Geltung des Dokuments am Stichtag ---------------------------------------------------
  const inForceKnown = input.amendments.filter((amendment) => amendment.inForce);
  const preBaselineAmendment = inForceKnown.find((amendment) => amendment.inForce! <= baseline);
  const postBaselineAmendment = inForceKnown.find((amendment) => amendment.inForce! > baseline);
  let alive: 'yes' | 'no' | 'unknown' = 'unknown';
  if (!input.page.undated) {
    const selection = input.selection;
    if (selection?.status === 'selected' && selection.selected) {
      alive = 'yes';
      evidence.push({ kind: 'portal-version-interval', supports: 'active-at-baseline', statement: `Portalfassung gültig ${selection.selected.validFrom} bis ${selection.selected.validTo ?? 'offen'} (lokale Stichtagsauswahl über ${selection.candidates.length} Fassung(en))`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else if (selection && selection.status === 'no-version-at-baseline') {
      alive = 'no';
      findings.push({ severity: 'info', code: 'validity-not-at-baseline', message: selection.problems.join('; ') || 'Keine Portalfassung deckt den Stichtag ab' });
      evidence.push({ kind: 'portal-version-list', supports: 'contradiction', statement: `Keine Portalfassung deckt den Stichtag ab (${selection.candidates.map((candidate) => `${candidate.validFrom}–${candidate.validTo ?? 'offen'}`).join(', ')})`, sourceUrl: input.page.url, sha256: input.page.sha256 });
    } else {
      findings.push({ severity: 'error', code: `selection-${selection?.status ?? 'missing'}`, message: selection?.problems.join('; ') || 'Stichtagsauswahl nicht möglich' });
      return result({ baselineStatus: 'undetermined', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
    }
  } else {
    const started = (input.clauses.inForce?.date && input.clauses.inForce.date <= baseline) || (input.issuedOn !== undefined && input.issuedOn <= baseline && preBaselineAmendment !== undefined);
    if (started && postBaselineAmendment) {
      alive = 'yes';
      evidence.push({ kind: 'gazette-amendment', supports: 'active-at-baseline', statement: `Undatierter Datensatz: vor dem Stichtag in Kraft (${input.clauses.inForce?.date ? `Inkrafttreten ${input.clauses.inForce.date}` : `Änderung in Kraft ${preBaselineAmendment!.inForce}`}) und nach dem Stichtag noch geändert (${describe(postBaselineAmendment)}, in Kraft ${postBaselineAmendment.inForce}) – eine aufgehobene Vorschrift wird nicht geändert`, ...(postBaselineAmendment.gazetteUrl ? { sourceUrl: postBaselineAmendment.gazetteUrl } : {}), ...(postBaselineAmendment.gazetteSha256 ? { sha256: postBaselineAmendment.gazetteSha256 } : {}) });
    } else {
      findings.push({ severity: 'error', code: 'validity-undetermined', message: `Undatierter Datensatz ohne Beleg der Geltung am Stichtag (${started ? 'Beginn belegt, aber kein Beleg für Fortbestand nach dem Stichtag' : 'kein belegter Beginn vor dem Stichtag'})` });
      return result({ baselineStatus: 'undetermined', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
    }
  }
  if (alive === 'no') return result({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', sourceValidity: 'exact', postBaselineAmendments: [], missingPreBaselineAmendments: [] });

  // --- 3. Textstand der gewählten Seite ------------------------------------------------------
  if (input.changeNote) evidence.push({ kind: 'portal-change-history', supports: 'text-state', statement: `Fundstellenverlauf: ${input.changeNote.raw}`, sourceUrl: input.page.url, sha256: input.page.sha256 });
  if (input.changeNote && !input.changeNote.complete) findings.push({ severity: 'error', code: 'reconstruction-uncertain-change-note', message: `Fundstellenverlauf nicht vollständig lesbar: „${input.changeNote.raw}“` });
  const textStart = input.page.undated ? undefined : input.page.validFrom;
  const relevant = input.amendments.filter((amendment) => !(amendment.inForce && input.versionStarts.includes(amendment.inForce) && !amendment.incorporated));
  for (const amendment of relevant) {
    if (amendment.gazetteUrl && amendment.identification?.ok) {
      evidence.push({ kind: 'gazette-amendment', supports: 'text-state', statement: `${describe(amendment)}: ${amendment.identification.reason}; Inkrafttreten ${amendment.inForce ?? 'unbekannt'} (${amendment.inForceDerivation})`, ...(amendment.inForce ? { date: amendment.inForce } : {}), sourceUrl: amendment.gazetteUrl, ...(amendment.gazetteSha256 ? { sha256: amendment.gazetteSha256 } : {}) });
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
    evidence.push({ kind: 'gazette-amendment-chain', supports: 'completeness', statement: `Änderungskette lückenlos: ${chronological.map((amendment) => amendment.note.decreeDate ?? amendment.note.decreeDateText).join(' → ')} (jede Eingangsformel nennt die vorhergehende Änderung)` });
  }

  const postBaselineAmendments = relevant.filter((amendment) => amendment.incorporated && amendment.inForce && amendment.inForce > baseline);
  const missingPreBaselineAmendments = relevant.filter((amendment) => !amendment.incorporated && amendment.inForce && amendment.inForce <= baseline && (!textStart || amendment.inForce > textStart));
  const incorporatedPre = relevant.filter((amendment) => amendment.incorporated && amendment.inForce && amendment.inForce <= baseline && (!textStart || amendment.inForce > textStart));
  const laterNotIncorporated = relevant.filter((amendment) => !amendment.incorporated && amendment.inForce && amendment.inForce > baseline);
  if (findings.some((finding) => finding.severity === 'error')) {
    return result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', postBaselineAmendments, missingPreBaselineAmendments });
  }

  const latestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort().pop();
  const earliestIn = (entries: AmendmentEvidence[]): string | undefined => entries.map((entry) => entry.inForce!).sort()[0];
  if (postBaselineAmendments.length > 0 || missingPreBaselineAmendments.length > 0) {
    findings.push({ severity: 'error', code: 'reconstruction-required', message: [postBaselineAmendments.length ? `Text enthält Änderungen mit Inkrafttreten nach dem Stichtag: ${postBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : '', missingPreBaselineAmendments.length ? `Text enthält Änderungen vor dem Stichtag nicht: ${missingPreBaselineAmendments.map((entry) => `${describe(entry)} in Kraft ${entry.inForce}`).join('; ')}` : ''].filter(Boolean).join('. ') });
    const reconstructed: LrmbValidityAssessment = result({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', postBaselineAmendments, missingPreBaselineAmendments });
    const from = latestIn([...incorporatedPre, ...missingPreBaselineAmendments]) ?? textStart;
    const to = earliestIn([...postBaselineAmendments, ...laterNotIncorporated]);
    if (from) reconstructed.sourceValidFrom = from;
    if (to) reconstructed.sourceValidTo = previousDay(to);
    return reconstructed;
  }

  // Direkt übernehmbar.
  const direct: LrmbValidityAssessment = result({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidity: 'exact', postBaselineAmendments, missingPreBaselineAmendments });
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
  return direct;
}
