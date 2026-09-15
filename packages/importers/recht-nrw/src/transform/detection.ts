/**
 * Erkennung vor der Transformation (auf dem unveränderten Quelltext):
 *
 *   Detection → Klassifikation (Kategorie) → Entscheidung
 *     protected            Fundstelle, URL, Eigenname – bleibt byteidentisch
 *     safe-auto-transform  Landesbezeichnung mit benannter Regel; Verfassungsorgane mit Landesnamen
 *     manual-review        Ministerium, Behörde, Körperschaft, Kommune, Geographie, Restformen – bleibt unverändert
 *     informational        reiner Hinweis ohne Handlungsbedarf
 *   → Transformation → Prüfung nach der Transformation (Residuen, nicht angewandte Regeln, stille Änderungen)
 *
 * Kein Befund geht verloren: jede Erkennung steht mit Pfad, Quellposition, Kontext, Kategorie,
 * Entscheidung und Begründung im Transformationsreport.
 */
import { findProtectedSpans, planTransformation, PROTECTED_PATTERNS } from './rules.ts';

export const REFERENCE_CATEGORIES = [
  'jurisdiction-name',
  'legislature',
  'ministry',
  'authority',
  'public-body',
  'regional-body',
  'municipality',
  'geography',
  'institution',
  'source-citation',
  'external-name',
  'other',
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export const REFERENCE_DECISIONS = ['protected', 'safe-auto-transform', 'manual-review', 'informational'] as const;
export type ReferenceDecision = (typeof REFERENCE_DECISIONS)[number];

export interface DetectionField {
  path: string;
  text: string;
}

export interface DetectedReference {
  /** Stabil je Quelltext: Pfad, Quellposition, Detektor. */
  id: string;
  path: string;
  start: number;
  end: number;
  term: string;
  context: string;
  category: ReferenceCategory;
  decision: ReferenceDecision;
  detector: string;
  /** Nur bei `safe-auto-transform` der Landesbezeichnung: angewandte Regel und Ergebnis. */
  transformRule?: string;
  replacement?: string;
  reason: string;
}

interface Detector {
  id: string;
  category: ReferenceCategory;
  decision: ReferenceDecision;
  pattern: RegExp;
  reason: string;
}

const REASONS = {
  constitutional: 'Verfassungsorgan des Landes; nur die Landesbezeichnung wird nach den Regeln für Landesnamen übergeleitet.',
  court: 'Gericht des Herkunftslandes; die Gerichtsorganisation des Landes Westdeutschland ist nicht festgelegt – nur die Landesbezeichnung wird übergeleitet, die Zuordnung ist manuell zu entscheiden.',
  ministry: 'Ressortbezeichnung des Herkunftslandes; der Zuschnitt im Land Westdeutschland ist nicht festgelegt – die historische Bezeichnung bleibt, eine Überleitung erfolgt nur nach Einzelentscheidung.',
  authority: 'Landesbehörde des Herkunftslandes ohne festgelegte Entsprechung – die Bezeichnung bleibt, die Zuordnung ist manuell zu entscheiden.',
  publicBody: 'Körperschaft oder Anstalt mit regionaler Bezeichnung des Herkunftslandes – die Bezeichnung bleibt, die Zuordnung ist manuell zu entscheiden.',
  regionalBody: 'Regionale Körperschaft oder Verwaltungsgliederung des Herkunftslandes – keine automatische Entsprechung.',
  municipality: 'Kommune des Herkunftslandes – keine automatische Entsprechung in der Simulation.',
  geography: 'Geographische Bezeichnung – keine automatische Entsprechung in der Simulation.',
  residual: 'Form der Landesbezeichnung ohne sichere Überleitungsregel (z. B. Abkürzung mit Punkt oder Flexionsform) – bleibt unverändert, Entscheidung manuell.',
} as const;

const STATE = 'Nordrhein-Westfalen';

/** Institutionelle und geographische Detektoren. */
export const INSTITUTION_DETECTORS: readonly Detector[] = [
  { id: 'legislature-state', category: 'legislature', decision: 'safe-auto-transform', pattern: new RegExp(`\\bLandtag(?:s|es)?\\s+(?:von\\s+|des\\s+Landes\\s+)?${STATE}\\b`, 'gu'), reason: REASONS.constitutional },
  { id: 'constitutional-organ-state', category: 'institution', decision: 'safe-auto-transform', pattern: new RegExp(`\\b(?:Landesregierung|Ministerpräsident(?:in|en)?|Staatskanzlei|Landesrechnungshof|Verfassungsgerichtshof|Landesverfassungsgericht)\\s+(?:des\\s+Landes\\s+|für\\s+das\\s+Land\\s+|von\\s+)?${STATE}\\b`, 'gu'), reason: REASONS.constitutional },
  { id: 'court-state', category: 'institution', decision: 'manual-review', pattern: new RegExp(`\\b(?:Oberverwaltungsgericht|Landessozialgericht|Finanzgericht|Landesarbeitsgericht|Oberlandesgericht)\\s+(?:für\\s+das\\s+Land\\s+|des\\s+Landes\\s+)?${STATE}\\b`, 'gu'), reason: REASONS.court },
  { id: 'ministry-portfolio', category: 'ministry', decision: 'manual-review', pattern: /\b(?:Ministerium|Ministerin|Minister|Staatskanzlei) (?:für|des|der) [\p{L}\s,-]{3,120}?(?=[.;:)]|,\s*[\p{Ll}\d]|\s(?:des Landes|in|im|mit|nach|vom|zur|zum|über|zugleich|im Einvernehmen)\b|$)/gu, reason: REASONS.ministry },
  { id: 'ministry-compound', category: 'ministry', decision: 'manual-review', pattern: /\b(?:Innen|Finanz|Justiz|Kultus|Wirtschafts|Sozial|Arbeits|Umwelt|Verkehrs|Bau)minister(?:ium|iums|in|s)?\b/gu, reason: REASONS.ministry },
  { id: 'authority-district-government', category: 'authority', decision: 'manual-review', pattern: /\bBezirksregierung(?:en)?\b/gu, reason: REASONS.authority },
  { id: 'authority-state-office', category: 'authority', decision: 'manual-review', pattern: /\bLandes(?:amt|anstalt|institut) für [\p{L}\s,-]{3,60}?(?=[.,;:)]|\s(?:des|der|in|im|und)\b)/gu, reason: REASONS.authority },
  { id: 'authority-state-enterprise', category: 'authority', decision: 'manual-review', pattern: /\bLandesbetrieb [\p{L}\s-]{3,40}?(?=[.,;:)]|\s(?:des|der|in|im|und)\b)/gu, reason: REASONS.authority },
  { id: 'authority-named', category: 'authority', decision: 'manual-review', pattern: /\b(?:Landeskriminalamt(?:es|s)?|Landesoberbergamt(?:es|s)?)\b/gu, reason: REASONS.authority },
  { id: 'public-body-regional', category: 'public-body', decision: 'manual-review', pattern: new RegExp(`\\b(?:(?:Landes)?[Uu]nfallkasse\\s+${STATE}|(?:Ärztekammer|Zahnärztekammer|Apothekerkammer|Tierärztekammer|Psychotherapeutenkammer|Kassenärztliche Vereinigung|Kassenzahnärztliche Vereinigung)(?:en)?\\s+(?:Nordrhein|Westfalen-Lippe)|Deutschen?\\s+Rentenversicherung\\s+(?:Rheinland|Westfalen))\\b`, 'gu'), reason: REASONS.publicBody },
  { id: 'regional-body-association', category: 'regional-body', decision: 'manual-review', pattern: /\b(?:Landschaftsverb(?:and|ände|andes|änden)|Regionalverband Ruhr|Kommunalverband Ruhrgebiet|Landschaftsversammlung)\b/gu, reason: REASONS.regionalBody },
  { id: 'regional-body-district', category: 'regional-body', decision: 'manual-review', pattern: /\bRegierungsbezirk(?:e|es|en)?\b/gu, reason: REASONS.regionalBody },
  { id: 'municipality', category: 'municipality', decision: 'manual-review', pattern: /\b(?:Düsseldorf|Köln|Münster|Detmold|Arnsberg|Dortmund|Essen|Duisburg|Bochum|Wuppertal|Bielefeld|Bonn|Gelsenkirchen|Mönchengladbach|Aachen|Krefeld|Oberhausen|Hagen|Hamm|Mülheim an der Ruhr|Leverkusen|Solingen|Herne|Neuss|Paderborn|Recklinghausen|Bottrop|Remscheid|Moers|Siegen|Bergisch Gladbach|Gütersloh|Minden|Kleve|Soest)\b/gu, reason: REASONS.municipality },
  { id: 'geography-region', category: 'geography', decision: 'manual-review', pattern: /\b(?:Rheinland|(?<!Nordrhein-)Westfalen(?:-Lippe)?|Lippe|Ruhrgebiet|Rheinland-Pfalz|Niederrhein|Sauerland|Siegerland|Münsterland|Ostwestfalen|Bergisch(?:es|en)? Land|Eifel|Ruhr)\b/gu, reason: REASONS.geography },
  { id: 'geography-river', category: 'geography', decision: 'manual-review', pattern: /\b(?:Rhein|Ems|Weser|Ruhr|Lippe|Emscher|Wupper|Sieg|Erft)\b(?=\s|[.,;])/gu, reason: REASONS.geography },
];

/** Landesbezeichnung in jeder Form (für Restformen und die Prüfung nach der Transformation). */
export const SOURCE_STATE_REFERENCE = /Nordrhein-Westfal\p{L}*|[Nn]ordrhein-[Ww]estfälisch\p{L}*|(?<![\p{L}\d])NRW(?![\p{L}\d])/gu;

const STATE_SPECIFIC = /NRW|Nordrhein-Westfal|\bNW\b/u;
/** Maskierungszeichen (Private Use Area), längengleich zum maskierten Text. */
const MASK = String.fromCharCode(0xe000);

function maskRanges(value: string, ranges: ReadonlyArray<{ start: number; end: number }>): string {
  let output = value;
  for (const range of ranges) output = `${output.slice(0, range.start)}${MASK.repeat(range.end - range.start)}${output.slice(range.end)}`;
  return output;
}

function contextOf(value: string, start: number, end: number): string {
  const from = Math.max(0, start - 60);
  const to = Math.min(value.length, end + 60);
  return `${from > 0 ? '…' : ''}${value.slice(from, to)}${to < value.length ? '…' : ''}`;
}

function reference(field: DetectionField, start: number, end: number, category: ReferenceCategory, decision: ReferenceDecision, detector: string, reason: string): DetectedReference {
  return { id: `${field.path}@${start}:${detector}`, path: field.path, start, end, term: field.text.slice(start, end), context: contextOf(field.text, start, end), category, decision, detector, reason };
}

/** Erkennt alle landesbezogenen Bezeichnungen im unveränderten Quelltext. */
export function detectReferences(fields: readonly DetectionField[]): DetectedReference[] {
  const detections: DetectedReference[] = [];
  for (const field of fields) {
    if (!field.text) continue;
    const found: DetectedReference[] = [];
    const { protectedSpans, segments } = planTransformation(field.text);
    for (const span of protectedSpans) {
      if (!STATE_SPECIFIC.test(span.text)) continue;
      const pattern = PROTECTED_PATTERNS.find((entry) => entry.id === span.id);
      found.push(reference(field, span.start, span.end, span.category, 'protected', `protected:${span.id}`, pattern?.reason ?? 'Schutzmuster'));
    }
    for (const segment of segments) {
      const entry = reference(field, segment.start, segment.end, 'jurisdiction-name', 'safe-auto-transform', `rule:${segment.rule}`, `Landesbezeichnung wird nach Regel ${segment.rule} übergeleitet („${segment.from}“ → „${segment.to}“).`);
      entry.transformRule = segment.rule;
      entry.replacement = segment.to;
      found.push(entry);
    }
    const residualMasked = maskRanges(field.text, [...protectedSpans, ...segments]);
    for (const match of residualMasked.matchAll(new RegExp(SOURCE_STATE_REFERENCE.source, SOURCE_STATE_REFERENCE.flags))) {
      const start = match.index ?? 0;
      found.push(reference(field, start, start + match[0].length, 'jurisdiction-name', 'manual-review', 'jurisdiction-name-residual', REASONS.residual));
    }
    const institutionMasked = maskRanges(field.text, protectedSpans);
    for (const detector of INSTITUTION_DETECTORS) {
      for (const match of institutionMasked.matchAll(new RegExp(detector.pattern.source, detector.pattern.flags))) {
        const start = match.index ?? 0;
        if (match[0].length === 0 || match[0].includes(MASK)) continue;
        found.push(reference(field, start, start + match[0].length, detector.category, detector.decision, detector.id, detector.reason));
      }
    }
    detections.push(...found.sort((left, right) => left.start - right.start || left.end - right.end || left.detector.localeCompare(right.detector)));
  }
  return detections;
}

export function summarizeDecisions(detections: readonly DetectedReference[]): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {};
  for (const detection of detections) {
    const byDecision = (summary[detection.category] ??= {});
    byDecision[detection.decision] = (byDecision[detection.decision] ?? 0) + 1;
  }
  return summary;
}

export interface ResidualReference {
  path: string;
  term: string;
  context: string;
  status: 'protected' | 'documented' | 'unexplained';
  detectionId?: string;
}

export interface PostTransformAudit {
  ok: boolean;
  checkedFields: number;
  residuals: ResidualReference[];
  unappliedTransforms: Array<{ path: string; rule: string; expected: number; applied: number }>;
  unrecordedChanges: string[];
}

/**
 * Prüfung nach der Transformation: Jede verbliebene Landesbezeichnung muss geschützt oder als
 * Erkennung mit dokumentierter Entscheidung belegt sein; jede sichere Ersetzung muss angewandt und
 * protokolliert sein; kein Feld darf sich ohne Protokolleintrag verändert haben.
 */
export function auditTransformation(fields: ReadonlyArray<{ path: string; source: string; transformed: string }>, detections: readonly DetectedReference[], changes: ReadonlyArray<{ path: string; rule: string }>): PostTransformAudit {
  const residuals: ResidualReference[] = [];
  const unrecordedChanges: string[] = [];
  const changedPaths = new Set(changes.map((change) => change.path));
  for (const field of fields) {
    if (field.source !== field.transformed && !changedPaths.has(field.path)) unrecordedChanges.push(field.path);
    const { spans } = findProtectedSpans(field.transformed);
    for (const match of field.transformed.matchAll(new RegExp(SOURCE_STATE_REFERENCE.source, SOURCE_STATE_REFERENCE.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const entry: ResidualReference = { path: field.path, term: match[0], context: contextOf(field.transformed, start, end), status: 'unexplained' };
      if (spans.some((span) => span.start <= start && span.end >= end)) entry.status = 'protected';
      else {
        const documented = detections.find((detection) => detection.path === field.path && detection.decision !== 'safe-auto-transform' && detection.term.includes(match[0]));
        if (documented) {
          entry.status = 'documented';
          entry.detectionId = documented.id;
        }
      }
      residuals.push(entry);
    }
  }
  const key = (path: string, rule: string): string => `${path}::${rule}`;
  const expected = new Map<string, number>();
  for (const detection of detections) if (detection.transformRule) expected.set(key(detection.path, detection.transformRule), (expected.get(key(detection.path, detection.transformRule)) ?? 0) + 1);
  const applied = new Map<string, number>();
  for (const change of changes) applied.set(key(change.path, change.rule), (applied.get(key(change.path, change.rule)) ?? 0) + 1);
  const unappliedTransforms: PostTransformAudit['unappliedTransforms'] = [];
  for (const entry of new Set([...expected.keys(), ...applied.keys()])) {
    const separator = entry.lastIndexOf('::');
    const path = entry.slice(0, separator);
    const rule = entry.slice(separator + 2);
    if ((expected.get(entry) ?? 0) !== (applied.get(entry) ?? 0)) unappliedTransforms.push({ path, rule, expected: expected.get(entry) ?? 0, applied: applied.get(entry) ?? 0 });
  }
  return {
    ok: residuals.every((residual) => residual.status !== 'unexplained') && unappliedTransforms.length === 0 && unrecordedChanges.length === 0,
    checkedFields: fields.length,
    residuals,
    unappliedTransforms,
    unrecordedChanges,
  };
}
