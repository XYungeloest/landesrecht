/**
 * Dokumenttyp und Normativitätsfilter für LRMB-Dokumente.
 *
 * Quelltypen (sourceDocumentType): verwaltungsvorschrift, allgemeine-verwaltungsvorschrift,
 * runderlass, richtlinie, durchfuehrungserlass, sonstige-verwaltungsvorschrift. Die Zuordnung folgt
 * ausschließlich Titel und Erlasskopf; im Zweifel `sonstige-verwaltungsvorschrift`.
 *
 * Normativität (docs/LEGAL_SCOPE.md): include | exclude | review. Zweifelhafte Dokumente werden nie
 * automatisch zu Landesrecht erklärt; Ausschlussgründe gehen vor, danach Prüffälle, erst dann die
 * Aufnahme bei eindeutigem Verwaltungsvorschriften-Charakter.
 */
import type { NormType } from '@landesrecht/legal-core/lib/schema.ts';

import type { DecreeKind } from './text-metadata.ts';

export const LRMB_DOCUMENT_TYPES = ['verwaltungsvorschrift', 'allgemeine-verwaltungsvorschrift', 'runderlass', 'richtlinie', 'durchfuehrungserlass', 'sonstige-verwaltungsvorschrift'] as const;
export type LrmbDocumentType = (typeof LRMB_DOCUMENT_TYPES)[number];

export interface DocumentTypeClassification {
  sourceDocumentType: LrmbDocumentType;
  normType: NormType;
  reason: string;
}

export function classifyLrmbDocumentType(input: { title: string; decreeKind?: DecreeKind }): DocumentTypeClassification {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const funding = /Zuwendung|Förderrichtlinie|Förderung von|Förderprogramm|Billigkeitsleistung/u.test(title);
  if (/^Allgemeine Verwaltungsvorschrift/u.test(title)) return { sourceDocumentType: 'allgemeine-verwaltungsvorschrift', normType: 'allgemeine-verwaltungsvorschrift', reason: 'Titel beginnt mit „Allgemeine Verwaltungsvorschrift(en)“' };
  if (/Durchführungserlass/u.test(title)) return { sourceDocumentType: 'durchfuehrungserlass', normType: 'durchfuehrungserlass', reason: 'Titel nennt einen Durchführungserlass' };
  if (/(?:^|\s|-)(?:[A-ZÄÖÜ][a-zäöüß]*)?[Rr]ichtlinien?\b|förderungsbestimmungen\b|Förderbestimmungen\b/u.test(title)) return { sourceDocumentType: 'richtlinie', normType: funding ? 'foerderrichtlinie' : 'richtlinie', reason: funding ? 'Titel nennt eine Richtlinie/Bestimmungen über Zuwendungen' : 'Titel nennt eine Richtlinie' };
  if (/^Verwaltungsvorschrift(?:en)?\b|\bVV\b/u.test(title)) return { sourceDocumentType: 'verwaltungsvorschrift', normType: 'verwaltungsvorschrift', reason: 'Titel nennt Verwaltungsvorschrift(en)' };
  if (input.decreeKind === 'runderlass' || input.decreeKind === 'gemeinsamer-runderlass' || /^Runderlass\b|\bRdErl\./u.test(title)) return { sourceDocumentType: 'runderlass', normType: 'runderlass', reason: 'Erlasskopf oder Titel: Runderlass' };
  return { sourceDocumentType: 'sonstige-verwaltungsvorschrift', normType: 'verwaltungsvorschrift', reason: 'Kein spezifischerer Typ erkennbar' };
}

export interface NormativityInput {
  /** URL-Segment des Portals: verwaltungsvorschrift | bekanntmachung | rechtsverordnung. */
  portalType: string;
  title: string;
  decreeKind?: DecreeKind;
  bodyText: string;
}

export interface NormativityDecision {
  decision: 'include' | 'exclude' | 'review';
  reasons: string[];
}

const EXCLUDE: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /Stellenausschreibung|Ausschreibung\s+(?:von\s+)?Stellen|Stellenangebot/u, reason: 'Stellenausschreibung' },
  { pattern: /Personalnachricht|Ernennung(?:en)?\b|Versetzung in den Ruhestand/u, reason: 'Personalnachricht' },
  { pattern: /\böffentliche\s+Sitzung\b|\bSitzung\s+der\b|Tagesordnung/u, reason: 'Sitzungs- oder Tagesordnungsbekanntmachung' },
  { pattern: /Verleihung\s+von\s+Körperschaftsrechten|Anerkennung\s+als\s+(?:Erholungsort|Luftkurort|Kurort|Heilbad)|Verleihung\s+(?:der\s+Bezeichnung|des\s+Prädikats)/u, reason: 'Einzelfallentscheidung (Verleihung/Anerkennung)' },
  { pattern: /Plangenehmigung|Planfeststellung|Genehmigung\s+(?:des|der)\s+[A-ZÄÖÜ][\p{L}-]+\s+(?:in|für)\s+[A-ZÄÖÜ]/u, reason: 'Einzelfallentscheidung (Genehmigung/Planfeststellung)' },
  { pattern: /Wahlergebnis|Ergebnis\s+der\s+Wahl|Wahlbekanntmachung/u, reason: 'Wahlbekanntmachung' },
  { pattern: /Feststellung\s+(?:eines\s+Nachfolgers|einer\s+Nachfolgerin|von\s+Nachfolgern|von\s+Nachfolgerinnen|der\s+Nachfolge)\b/u, reason: 'Wahlbekanntmachung (Feststellung der Mandatsnachfolge)' },
  { pattern: /^(?:[\p{L}\s-]+)?Satzung\b|Hauptsatzung|Betriebssatzung|Weiterbildungsordnung|Berufsordnung|Beitragsordnung|Haushaltssatzung/u, reason: 'Autonome Satzung einer Körperschaft (kein Landesrecht im Sinne von docs/LEGAL_SCOPE.md)' },
  { pattern: /^Berichtigung\b/u, reason: 'Berichtigung (wird an der berichtigten Vorschrift berücksichtigt, kein eigenes Dokument)' },
  { pattern: /Landesentwicklungsplan|Beteiligung\s+bei\s+der\s+Änderung|Öffentliche\s+Bekanntmachung\s+gemäß/u, reason: 'Verfahrensbekanntmachung ohne eigenen Regelungsgehalt' },
];

const REVIEW: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bHinweise\b|\bEmpfehlungen?\b|\bMerkblatt\b|\bLeitfaden\b|\bHandreichung\b|\bArbeitshilfe\b/u, reason: 'Hinweise/Empfehlungen: Verbindlichkeit nicht automatisch feststellbar' },
  { pattern: /\bKopferlass\b/u, reason: 'Kopferlass: Regelungsgehalt liegt im bekanntgemachten Dokument' },
  { pattern: /\bMuster\b|\bVordruck/u, reason: 'Muster/Vordruck: normativer Gehalt prüfen' },
  { pattern: /Preis(?:es)?\b.*Verleihung|Verleihung\s+des\s+Preises|Preisverleihung/u, reason: 'Preis- oder Ehrungsregelung: Außenwirkung prüfen' },
];

export function assessNormativity(input: NormativityInput): NormativityDecision {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const excluded = EXCLUDE.filter((entry) => entry.pattern.test(title)).map((entry) => entry.reason);
  if (excluded.length > 0) return { decision: 'exclude', reasons: excluded };
  if (input.portalType === 'bekanntmachung') return { decision: 'review', reasons: ['Bekanntmachung: normativer Gehalt nicht automatisch feststellbar'] };
  const review = REVIEW.filter((entry) => entry.pattern.test(title)).map((entry) => entry.reason);
  if (review.length > 0) return { decision: 'review', reasons: review };
  if (input.portalType !== 'verwaltungsvorschrift') return { decision: 'review', reasons: [`Portaltyp „${input.portalType}“ außerhalb der Verwaltungsvorschriften`] };
  const head = input.decreeKind !== undefined || /\bRdErl\.|Runderlass|Verwaltungsvorschrift|Richtlinie|Durchführungserlass|Erlass\b/u.test(title);
  const abstractGeneral = /\b(?:Behörden|Dienststellen|Bußgeldbehörden|Ordnungsbehörden|Zuwendungsempfänger|Beschäftigten|Hochschulen|Bewilligungsbehörden|zuständige[nr]?\s+Stellen?|gilt|gelten|sind\s+.+?\s+anzuwenden|ist\s+.+?\s+zu\s+)/u.test(input.bodyText);
  if (head && abstractGeneral) return { decision: 'include', reasons: ['Verwaltungsvorschrift/Erlass mit abstrakt-generellem Regelungsgehalt (Adressatenkreis, Regelungsformeln)'] };
  return { decision: 'review', reasons: [head ? 'Erlasskopf vorhanden, abstrakt-genereller Regelungsgehalt nicht erkennbar' : 'Weder Erlasskopf noch Vorschriftentitel erkennbar'] };
}

/** Dokumentierter Override `normativity` (data/imports/recht-nrw/overrides.json) ersetzt die Regelentscheidung. */
export function applyNormativityOverride(decision: NormativityDecision, override: { value: unknown; reason: string; id: string } | undefined): NormativityDecision {
  if (!override) return decision;
  return { decision: override.value as NormativityDecision['decision'], reasons: [`Override ${override.id}: ${override.reason}`, ...decision.reasons.map((reason) => `(Regel: ${reason})`)] };
}
