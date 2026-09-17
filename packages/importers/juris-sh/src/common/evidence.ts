/**
 * Evidenzmodell des juris-SH-Adapters: reine Datenstrukturen, Validierung und Entscheidungsregeln.
 *
 * Muster ist der erprobte Evidence Pass des West-Imports (`recht-nrw/src/lrmb/validity.ts` und die
 * Evidenzfelder in `recht-nrw/src/common/manifest.ts`), hier aber portalunabhängig: Dieses Modul
 * kennt keine juris-Seite, kein HTML und keine Erkennungsregel. Es beantwortet nur die Frage, was
 * eine Menge von Belegen über den Stichtag aussagt. Die portalspezifische Erkennung (welcher
 * Seitenbestandteil welchen Beleg erzeugt) entsteht später im Parser-/Enumerationsstrang.
 *
 * Dimensionen (worüber ein Beleg etwas aussagt):
 *   begin      Geltungsbeginn der Vorschrift oder der Fassung
 *   end        Außerkrafttreten, Ablauf, Aufhebung durch die Vorschrift selbst
 *   successor  Aufhebung/Ablösung durch eine andere, benannte Vorschrift
 *   amendment  Änderung der Vorschrift (belegt zugleich ihren Fortbestand zum Änderungszeitpunkt)
 *   identity   Identität des Dokuments (gehört der Text zur behaupteten Vorschrift?)
 *   validity   Geltung als solche (Portalintervall, Fassungsliste, ausdrücklicher Geltungsvermerk)
 *
 * Beweisklassen (identisch zu West, damit Auswertungen vergleichbar bleiben):
 *   strong         amtlicher Beleg mit eindeutiger Identität und Datum – trägt allein eine Entscheidung
 *   supporting     amtlicher Beleg ohne Datum oder ohne eindeutige Identität – stützt, entscheidet nie allein
 *   insufficient   Suchindex, Titelähnlichkeit, bloßes Vorhandensein – nur Hinweis
 *   contradictory  zwei starke Belege widersprechen einander – keine automatische Entscheidung, Review
 *
 * Entscheidungsregeln (mehr gibt es bewusst nicht; nichts wird geraten):
 *   A  starkes Ende (end oder successor) mit Datum vor dem Stichtag und kein widersprechender
 *      starker Beleg → not-active-at-baseline
 *   B  starker Beginn mit Datum bis zum Stichtag UND starker Fortbestand (Änderung, Geltungsbeleg oder
 *      Aufhebung nach dem Stichtag) → active-at-baseline
 *   C  sonst – nur stützende/unzureichende Belege, widersprüchliche Belege oder gar nichts → undetermined
 */

export const EVIDENCE_DIMENSIONS = ['begin', 'end', 'successor', 'amendment', 'identity', 'validity'] as const;
export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];

export const EVIDENCE_STRENGTHS = ['strong', 'supporting', 'insufficient', 'contradictory'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/**
 * Belegarten. Portalneutral formuliert: Was den Beleg trägt (Fassungsliste, Verkündungsblatt,
 * Normtext, Index), nicht wie die Quelle ihn darstellt.
 */
export const EVIDENCE_KINDS = [
  'portal-version-interval',
  'portal-version-list',
  'portal-change-history',
  'portal-completeness-notice',
  'text-in-force-clause',
  'text-expiry-clause',
  'gazette-publication',
  'gazette-amendment',
  'successor-repeal',
  'index-signal',
  'reconstruction',
  'override',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Ergebnis der Stichtagsprüfung; gleiche Werte wie im West-Manifest. */
export const BASELINE_STATUSES = ['active-at-baseline', 'not-active-at-baseline', 'undetermined'] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

export interface ValidityEvidence {
  kind: EvidenceKind;
  dimension: EvidenceDimension;
  strength: EvidenceStrength;
  /** Was der Beleg sagt, in einem Satz – erscheint unverändert im Manifest und in Reports. */
  statement: string;
  /** Wirksamkeitsdatum des Belegs (ISO). Für starke Belege außer `identity` Pflicht. */
  date?: string;
  sourceUrl?: string;
  sha256?: string;
  /** Fundstelle im amtlichen Verkündungsblatt. */
  citation?: string;
  /** Wörtlicher Ausschnitt der Quelle (Leerraum normalisiert, gekürzt). */
  excerpt?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

/** Schemaprüfung eines Belegs (fail-closed): Liste der Probleme, leer bei gültigem Beleg. */
export function validateValidityEvidence(value: unknown, where = 'Beleg'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt`];
  const evidence = value as Record<string, unknown>;
  if (!(EVIDENCE_KINDS as readonly string[]).includes(String(evidence.kind))) problems.push(`${where}: unbekannte Belegart ${String(evidence.kind)}`);
  if (!(EVIDENCE_DIMENSIONS as readonly string[]).includes(String(evidence.dimension))) problems.push(`${where}: unbekannte Dimension ${String(evidence.dimension)}`);
  if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(String(evidence.strength))) problems.push(`${where}: unbekannte Beweisklasse ${String(evidence.strength)}`);
  if (typeof evidence.statement !== 'string' || evidence.statement.trim() === '') problems.push(`${where}: statement fehlt`);
  if (evidence.date !== undefined && (typeof evidence.date !== 'string' || !ISO_DATE.test(evidence.date))) problems.push(`${where}: date ist kein ISO-Datum`);
  if (evidence.sha256 !== undefined && (typeof evidence.sha256 !== 'string' || !SHA256.test(evidence.sha256))) problems.push(`${where}: sha256 ist kein SHA-256`);
  for (const field of ['sourceUrl', 'citation', 'excerpt'] as const) {
    if (evidence[field] !== undefined && typeof evidence[field] !== 'string') problems.push(`${where}: ${field} ist keine Zeichenkette`);
  }
  // Ein starker Beleg trägt allein eine Statusentscheidung: Ohne Datum und ohne Fundstelle/Adresse ist er
  // höchstens stützend. Die Identitätsdimension braucht kein Datum (sie datiert nichts).
  if (evidence.strength === 'strong' && evidence.dimension !== 'identity') {
    if (evidence.date === undefined) problems.push(`${where}: starker Beleg ohne Datum`);
    if (evidence.sourceUrl === undefined && evidence.citation === undefined) problems.push(`${where}: starker Beleg ohne Quellenangabe (sourceUrl oder citation)`);
  }
  return problems;
}

export function validateEvidenceList(value: unknown, where = 'validityEvidence'): string[] {
  if (!Array.isArray(value)) return [`${where}: keine Liste`];
  return value.flatMap((entry, index) => validateValidityEvidence(entry, `${where}[${index}]`));
}

/** Welche Regel getragen hat – für Laufstatistik und Audit nachvollziehbar. */
export type BaselineDecisionRule = 'A-strong-end-before-baseline' | 'B-strong-begin-and-continuity' | 'C-undetermined';

export interface BaselineAssessment {
  status: BaselineStatus;
  rule: BaselineDecisionRule;
  /** Belege, die die Entscheidung getragen haben (leer bei Regel C). */
  decisive: ValidityEvidence[];
  /** Begründung in Klartext, wird in Manifest, Review und Laufbericht übernommen. */
  reasons: string[];
  /** Widersprüchliche Belege; ihr Vorliegen erzwingt immer Regel C. */
  contradictions: ValidityEvidence[];
}

const isStrong = (evidence: ValidityEvidence): boolean => evidence.strength === 'strong';
const onOrBefore = (date: string | undefined, baseline: string): boolean => date !== undefined && date <= baseline;
const strictlyBefore = (date: string | undefined, baseline: string): boolean => date !== undefined && date < baseline;
const onOrAfter = (date: string | undefined, baseline: string): boolean => date !== undefined && date >= baseline;

/**
 * Wendet die Regeln A/B/C auf eine Belegmenge an. Reine Funktion ohne Datei- oder Netzzugriff.
 *
 * Ein Portalintervall (`portal-version-interval`) erzeugt üblicherweise zwei Belege: einen starken
 * Beginn (Fassungsbeginn) und einen starken Fortbestand in der Dimension `validity` (Fassungsende offen
 * oder nach dem Stichtag). So trägt auch der einfache Fall die Entscheidung über Regel B, ohne dass es
 * eine Sonderregel braucht.
 */
export function assessBaselineValidity(input: { baseline: string; evidence: readonly ValidityEvidence[] }): BaselineAssessment {
  const { baseline } = input;
  if (!ISO_DATE.test(baseline)) throw new Error(`Stichtag ${baseline} ist kein ISO-Datum`);
  const problems = validateEvidenceList(input.evidence);
  if (problems.length > 0) throw new Error(`Ungültige Belege: ${problems.join('; ')}`);

  const evidence = [...input.evidence];
  const contradictions = evidence.filter((item) => item.strength === 'contradictory');

  const strongEnd = evidence.filter((item) => isStrong(item) && (item.dimension === 'end' || item.dimension === 'successor') && strictlyBefore(item.date, baseline));
  const strongBegin = evidence.filter((item) => isStrong(item) && item.dimension === 'begin' && onOrBefore(item.date, baseline));
  // Fortbestand: ein starker Beleg, der die Vorschrift am oder nach dem Stichtag noch als bestehend zeigt –
  // eine spätere Änderung, ein Geltungsbeleg über den Stichtag hinaus oder eine erst danach wirksame Aufhebung.
  const strongContinuity = evidence.filter((item) => isStrong(item) && (item.dimension === 'amendment' || item.dimension === 'validity' || item.dimension === 'successor') && onOrAfter(item.date, baseline));

  const undetermined = (reasons: string[]): BaselineAssessment => ({ status: 'undetermined', rule: 'C-undetermined', decisive: [], reasons, contradictions });

  if (contradictions.length > 0) {
    return undetermined([`Regel C: ${contradictions.length} widersprüchliche(r) Beleg(e) – keine automatische Entscheidung`, ...contradictions.map((item) => `widersprüchlich: ${item.statement}`)]);
  }
  if (strongEnd.length > 0 && strongContinuity.length > 0) {
    // Starkes Ende vor dem Stichtag und zugleich starker Fortbestand danach: Das ist ein Widerspruch der
    // Belege selbst, auch wenn keiner von ihnen als `contradictory` eingestuft wurde.
    return {
      status: 'undetermined',
      rule: 'C-undetermined',
      decisive: [],
      reasons: ['Regel C: starkes Ende vor dem Stichtag steht gegen starken Fortbestand danach', ...strongEnd.map((item) => `Ende: ${item.statement}`), ...strongContinuity.map((item) => `Fortbestand: ${item.statement}`)],
      contradictions: [...strongEnd, ...strongContinuity],
    };
  }
  if (strongEnd.length > 0) {
    return {
      status: 'not-active-at-baseline',
      rule: 'A-strong-end-before-baseline',
      decisive: strongEnd,
      reasons: [`Regel A: starkes Ende vor dem Stichtag ${baseline}`, ...strongEnd.map((item) => `${item.date}: ${item.statement}`)],
      contradictions,
    };
  }
  if (strongBegin.length > 0 && strongContinuity.length > 0) {
    return {
      status: 'active-at-baseline',
      rule: 'B-strong-begin-and-continuity',
      decisive: [...strongBegin, ...strongContinuity],
      reasons: [`Regel B: starker Beginn bis zum Stichtag ${baseline} und starker Fortbestand`, ...strongBegin.map((item) => `Beginn ${item.date}: ${item.statement}`), ...strongContinuity.map((item) => `Fortbestand ${item.date}: ${item.statement}`)],
      contradictions,
    };
  }
  const missing: string[] = [];
  if (strongBegin.length === 0) missing.push('starker Beginn fehlt');
  if (strongContinuity.length === 0) missing.push('starker Fortbestand fehlt');
  return undetermined([`Regel C: ${missing.join(', ')} – Stichtagsgeltung unbestimmt (Review, kein Import)`]);
}

/** Zählung je Dimension und Beweisklasse (Laufstatistik, Evidence-Pass-Report). */
export function summarizeEvidence(evidence: readonly ValidityEvidence[]): Record<EvidenceDimension, Record<EvidenceStrength, number>> {
  const summary = Object.fromEntries(EVIDENCE_DIMENSIONS.map((dimension) => [dimension, Object.fromEntries(EVIDENCE_STRENGTHS.map((strength) => [strength, 0]))])) as Record<EvidenceDimension, Record<EvidenceStrength, number>>;
  for (const item of evidence) summary[item.dimension][item.strength] += 1;
  return summary;
}
