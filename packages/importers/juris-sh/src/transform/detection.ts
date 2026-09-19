/**
 * Erkennung vor der Transformation (auf dem unveränderten Quelltext):
 *
 *   Detection → Klassifikation (Kategorie) → Entscheidung
 *     protected            Fundstelle, Verkündungsblattname, URL, Prüfsumme – bleibt byteidentisch
 *     safe-auto-transform  Landesbezeichnung mit benannter Regel; Verfassungsorgane mit Landesnamen
 *     manual-review        Ministerium, Behörde, Körperschaft, Kommune, Geographie, amtliche
 *                          Kurzbezeichnung mit „SH“, unklare Restformen – Text bleibt unverändert
 *     informational        reiner Hinweis ohne Handlungsbedarf (Institutionen-Zuordnung `preserve`)
 *   → Transformation → Prüfung nach der Transformation (Residuen, Doppelbildungen, nicht
 *     angewandte Regeln, stille Änderungen)
 *
 * Institutionen werden über die zentrale Zuordnung (`institution-registry.ts`) eingeordnet; der
 * Normtext ändert sich dadurch nicht. Kein Befund geht verloren: jede Erkennung steht mit Pfad,
 * Quellposition, Kontext, Kategorie, Entscheidung, Begründung und gegebenenfalls dem
 * Zuordnungseintrag im Report.
 */
import type { CompiledInstitutionRegistry, InstitutionStatus } from './institution-registry.ts';
import { DOTTED_ABBREVIATION, findProtectedSpans, NAME_SEPARATOR, planTransformation, PROTECTED_PATTERNS, targetProperName, targetStateName, type TransformationOptions } from './rules.ts';

export const REFERENCE_CATEGORIES = [
  'jurisdiction-name',
  'official-abbreviation',
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
  'historical-name',
  'other',
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export const REFERENCE_DECISIONS = ['protected', 'safe-auto-transform', 'manual-review', 'informational'] as const;
export type ReferenceDecision = (typeof REFERENCE_DECISIONS)[number];

export interface DetectionField {
  path: string;
  text: string;
}

export interface DetectionOptions {
  transformation?: TransformationOptions;
  institutions?: CompiledInstitutionRegistry;
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
  /** Eintrag der zentralen Institutionen-Zuordnung. */
  mapping?: { status: InstitutionStatus; entry?: string; group?: string; target?: string };
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
  court: `Gericht des Herkunftslandes; die Gerichtsorganisation im ${targetStateName()} ist nicht festgelegt – nur die Landesbezeichnung wird übergeleitet, die Zuordnung ist manuell zu entscheiden.`,
  ministry: `Ressortbezeichnung des Herkunftslandes; der Zuschnitt im ${targetStateName()} ist nicht festgelegt – die historische Bezeichnung bleibt, eine Überleitung erfolgt nur nach Einzelentscheidung.`,
  authority: 'Landesbehörde des Herkunftslandes ohne festgelegte Entsprechung – die Bezeichnung bleibt, die Zuordnung ist manuell zu entscheiden.',
  publicBody: 'Körperschaft oder Anstalt mit regionaler Bezeichnung des Herkunftslandes – die Bezeichnung bleibt, die Zuordnung ist manuell zu entscheiden.',
  regionalBody: 'Kommunaler Landesverband oder Verwaltungsgliederung des Herkunftslandes – keine automatische Entsprechung.',
  municipality: 'Kommune des Herkunftslandes – keine automatische Entsprechung in der Simulation.',
  geography: 'Geographische Bezeichnung – keine automatische Entsprechung in der Simulation.',
  residual: 'Form der Landesbezeichnung ohne sichere Überleitungsregel – bleibt unverändert, Entscheidung manuell.',
  abbreviationAmbiguous: 'Landeskürzel ohne vorangestellte Staatsform; es kann eine Fundstelle, eine Kurzbezeichnung oder das Land meinen – es wird nicht ersetzt, die Entscheidung ist manuell.',
  officialAbbreviation: 'Landeszusatz in einer amtlichen Kurzbezeichnung einer Norm des Herkunftslandes (z. B. „LVwG SH“); amtliche Abkürzungen werden nicht automatisch übergeleitet – Entscheidung manuell.',
} as const;

/** Vollständige Landesbezeichnung in allen Schreibvarianten (nie ein Namensteil allein). */
const STATE = String.raw`Schleswig${NAME_SEPARATOR}Holstein`;
/** Adjektiv in allen Flexionen und Schreibungen. */
const ADJECTIVE = String.raw`[Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinisch(?:e[mnrs]?)?`;

/** Institutionelle und geographische Detektoren. */
export const INSTITUTION_DETECTORS: readonly Detector[] = [
  { id: 'legislature-state', category: 'legislature', decision: 'safe-auto-transform', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+Landtag(?:s|es)?|Landtag(?:s|es)?\s+(?:von\s+|des\s+Landes\s+)?${STATE})(?![\p{L}\d])`, 'gu'), reason: REASONS.constitutional },
  { id: 'constitutional-organ-state', category: 'institution', decision: 'safe-auto-transform', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:(?:Landesregierung|Ministerpräsident(?:in|en)?|Staatskanzlei|Landesrechnungshof|Landesverfassungsgericht)\s+(?:des\s+Landes\s+|für\s+das\s+Land\s+|von\s+)?${STATE}|${ADJECTIVE}\s+(?:Landesregierung|Staatskanzlei|Landesrechnungshof|Landesverfassungsgericht))(?![\p{L}\d])`, 'gu'), reason: REASONS.constitutional },
  { id: 'court-state', category: 'institution', decision: 'manual-review', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+(?:Oberverwaltungsgericht|Verwaltungsgericht|Landessozialgericht|Sozialgericht|Finanzgericht|Landesarbeitsgericht|Arbeitsgericht|Oberlandesgericht|Anwaltsgerichtshof)|(?:Oberverwaltungsgericht|Landessozialgericht|Finanzgericht|Landesarbeitsgericht|Oberlandesgericht)\s+(?:für\s+das\s+Land\s+|des\s+Landes\s+)?${STATE}|Oberlandesgericht\s+Schleswig(?!${NAME_SEPARATOR}Holstein))(?![\p{L}\d])`, 'gu'), reason: REASONS.court },
  { id: 'ministry-portfolio', category: 'ministry', decision: 'manual-review', pattern: /\b(?:Ministerium|Ministerin|Minister|Staatskanzlei) (?:für|des|der) [\p{L}\s,-]{3,120}?(?=[.;:)]|,\s*[\p{Ll}\d]|\s(?:des Landes|in|im|mit|nach|vom|zur|zum|über|zugleich|im Einvernehmen)\b|$)/gu, reason: REASONS.ministry },
  { id: 'ministry-compound', category: 'ministry', decision: 'manual-review', pattern: /\b(?:Innen|Finanz|Justiz|Bildungs|Kultus|Wissenschafts|Wirtschafts|Sozial|Arbeits|Umwelt|Verkehrs|Bau|Landwirtschafts)minister(?:ium|iums|in|s)?\b/gu, reason: REASONS.ministry },
  { id: 'authority-state-office', category: 'authority', decision: 'manual-review', pattern: /\bLandes(?:amt|anstalt|institut) für [\p{L}\s,-]{3,60}?(?=[.,;:)]|\s(?:des|der|in|im|und)\b)/gu, reason: REASONS.authority },
  { id: 'authority-state-enterprise', category: 'authority', decision: 'manual-review', pattern: /\bLandesbetrieb [\p{L}\s-]{3,40}?(?=[.,;:)]|\s(?:des|der|in|im|und)\b)/gu, reason: REASONS.authority },
  { id: 'authority-named', category: 'authority', decision: 'manual-review', pattern: /\b(?:Landeskriminalamt(?:es|s)?|Landespolizeiamt(?:es|s)?|Landesarchiv(?:es|s)?|Landesbibliothek|Landesnaturschutzbeauftragte(?:r|n)?)\b/gu, reason: REASONS.authority },
  { id: 'public-body-regional', category: 'public-body', decision: 'manual-review', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:(?:Landes)?[Uu]nfallkasse\s+(?:Nord|${STATE})|(?:Ärztekammer|Zahnärztekammer|Apothekerkammer|Tierärztekammer|Psychotherapeutenkammer|Handwerkskammer|Landwirtschaftskammer|Rechtsanwaltskammer|Kassenärztliche\s+Vereinigung|Kassenzahnärztliche\s+Vereinigung)\s+${STATE}|Investitionsbank\s+${STATE}|Deutsche[nr]?\s+Rentenversicherung\s+Nord)(?![\p{L}\d])`, 'gu'), reason: REASONS.publicBody },
  { id: 'regional-body-association', category: 'regional-body', decision: 'manual-review', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+(?:Gemeindetag|Landkreistag|Städteverband|Städtebund|Heimatbund)|Städteverband\s+${STATE}|Kommunale[rn]?\s+Landesverb(?:and|ände|andes|änden))(?![\p{L}\d])`, 'gu'), reason: REASONS.regionalBody },
  { id: 'municipality', category: 'municipality', decision: 'manual-review', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:Kiel|Lübeck|Flensburg|Neumünster|Norderstedt|Elmshorn|Pinneberg|Itzehoe|Rendsburg|Husum|Eckernförde|Bad Segeberg|Bad Oldesloe|Ratzeburg|Plön|Meldorf|Kaltenkirchen|Wedel|Ahrensburg|Reinbek|Geesthacht|Glückstadt|Brunsbüttel|Kappeln|Eutin|Mölln|Preetz|Schwarzenbek|Uetersen|Barmstedt|Quickborn|Halstenbek|Henstedt-Ulzburg|Bargteheide|Büdelsdorf|Niebüll|Tönning|Friedrichstadt|Marne|Wilster|Lauenburg|Schleswig(?!${NAME_SEPARATOR}Holstein))(?![\p{L}\d])`, 'gu'), reason: REASONS.municipality },
  { id: 'geography-region', category: 'geography', decision: 'manual-review', pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:Nordfriesland|Dithmarschen|Ostholstein|Stormarn|Steinburg|Segeberg|Herzogtum\s+Lauenburg|Angeln|Eiderstedt|Fehmarn|Sylt|Föhr|Amrum|Pellworm|Helgoland|Nordsee|Ostsee|Wattenmeer|Nord-Ostsee-Kanal|(?<!Schleswig${NAME_SEPARATOR})Holstein)(?![\p{L}\d])`, 'gu'), reason: REASONS.geography },
  { id: 'geography-river', category: 'geography', decision: 'manual-review', pattern: /\b(?:Elbe|Eider|Trave|Schlei|Treene|Krückau|Pinnau|Bille|Flensburger Förde|Kieler Förde)\b(?=\s|[.,;)])/gu, reason: REASONS.geography },
];

/**
 * Landesbezeichnung in jeder Form – für Restformen und die Prüfung nach der Transformation.
 * Bewusst nicht enthalten: „Schleswig“ und „Holstein“ als Einzelnamen. „Holstein“ ist Bestandteil
 * der Zielbezeichnung; ein Einzeltreffer wäre nach jeder Überleitung ein Falschbefund.
 */
export const SOURCE_STATE_REFERENCE = new RegExp(
  String.raw`Schleswig${NAME_SEPARATOR}Holstein\p{L}*|[Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinisch\p{L}*|${DOTTED_ABBREVIATION}|(?<![\p{L}\d.])SH(?![\p{L}\d])`,
  'gu',
);

/**
 * Doppelbildung aus Quell- und Zielnamen („…-Holstein-Holstein“): darf nie entstehen.
 * Schreibungsunabhängig (`i`), damit auch die Versalform einer Überschrift erfasst wird – eine
 * Doppelbildung ist in jeder Schreibung falsch.
 */
const TARGET_TAIL = targetProperName().split('-').at(-1) ?? targetProperName();
export const DOUBLED_TARGET_NAME = new RegExp(String.raw`${TARGET_TAIL}(?:isch(?:e[mnrs]?)?)?[-‐-―−]${TARGET_TAIL}`, 'giu');

const STATE_SPECIFIC = /Schleswig|Holstein|Schl\.\s?[-‐-―−]\s?H\.|(?<![\p{L}\d.])SH(?![\p{L}\d])/u;
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

/** Vorangehendes Wort sieht nach amtlicher Abkürzung aus (mindestens zwei Großbuchstaben). */
function precededByAbbreviation(text: string, start: number): boolean {
  const before = /([\p{L}\d.]+)\s$/u.exec(text.slice(0, start));
  const token = before?.[1];
  if (!token) return false;
  return [...token].filter((character) => character !== character.toLocaleLowerCase('de-DE')).length >= 2;
}

/** Restform einordnen: amtliche Kurzbezeichnung, mehrdeutiges Kürzel oder unklare Landesform. */
function classifyResidual(text: string, start: number, term: string): { category: ReferenceCategory; reason: string } {
  if (term === 'SH') {
    return precededByAbbreviation(text, start)
      ? { category: 'official-abbreviation', reason: REASONS.officialAbbreviation }
      : { category: 'jurisdiction-name', reason: REASONS.abbreviationAmbiguous };
  }
  if (term.startsWith('Schl.')) return { category: 'jurisdiction-name', reason: REASONS.abbreviationAmbiguous };
  return { category: 'jurisdiction-name', reason: REASONS.residual };
}

/** Wendet die zentrale Institutionen-Zuordnung auf eine manuelle Erkennung an (Text bleibt unverändert). */
function applyInstitutionMapping(detection: DetectedReference, registry: CompiledInstitutionRegistry): void {
  const resolved = registry.resolve(detection.term, detection.category);
  if (resolved.source === 'none') return;
  const mapping: NonNullable<DetectedReference['mapping']> = { status: resolved.status };
  if (resolved.entry) {
    mapping.entry = resolved.entry.id;
    mapping.group = resolved.entry.group;
    if (resolved.entry.target) mapping.target = resolved.entry.target;
  }
  detection.mapping = mapping;
  if (detection.decision !== 'manual-review') return;
  if (resolved.status === 'preserve' || resolved.status === 'historical-source-only') {
    detection.decision = 'informational';
    detection.reason = `Institutionen-Zuordnung ${resolved.entry?.id ?? detection.category} (${resolved.status}): ${resolved.entry?.reason ?? 'Standard der Kategorie'}`;
  } else if (resolved.entry) {
    detection.reason = `${detection.reason} Zuordnung ${resolved.entry.id} (${resolved.status}${resolved.entry.target ? ` → ${resolved.entry.target}` : ''}): ${resolved.entry.reason}`;
  }
}

/** Erkennt alle landesbezogenen Bezeichnungen im unveränderten Quelltext. */
export function detectReferences(fields: readonly DetectionField[], options: DetectionOptions = {}): DetectedReference[] {
  const detections: DetectedReference[] = [];
  for (const field of fields) {
    if (!field.text) continue;
    const found: DetectedReference[] = [];
    const { protectedSpans, segments } = planTransformation(field.text, options.transformation);
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
      if (match[0].includes(MASK)) continue;
      const classified = classifyResidual(field.text, start, match[0]);
      found.push(reference(field, start, start + match[0].length, classified.category, 'manual-review', 'jurisdiction-name-residual', classified.reason));
    }
    const institutionMasked = maskRanges(field.text, protectedSpans);
    for (const detector of INSTITUTION_DETECTORS) {
      for (const match of institutionMasked.matchAll(new RegExp(detector.pattern.source, detector.pattern.flags))) {
        const start = match.index ?? 0;
        if (match[0].length === 0 || match[0].includes(MASK)) continue;
        const detection = reference(field, start, start + match[0].length, detector.category, detector.decision, detector.id, detector.reason);
        if (options.institutions) applyInstitutionMapping(detection, options.institutions);
        found.push(detection);
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

export interface DoubledName {
  path: string;
  term: string;
  context: string;
}

export interface PostTransformAudit {
  ok: boolean;
  checkedFields: number;
  residuals: ResidualReference[];
  /** Doppelbildungen aus Quell- und Zielnamen; jeder Befund ist ein Fehler. */
  doubledNames: DoubledName[];
  unappliedTransforms: Array<{ path: string; rule: string; expected: number; applied: number }>;
  unrecordedChanges: string[];
}

/**
 * Prüfung nach der Transformation (fail-closed): Jede verbliebene Landesbezeichnung muss geschützt
 * oder als Erkennung mit dokumentierter Entscheidung belegt sein; es darf keine Doppelbildung
 * („…-Holstein-Holstein“) entstanden sein; jede sichere Ersetzung muss angewandt und protokolliert
 * sein; kein Feld darf sich ohne Protokolleintrag verändert haben.
 */
export function auditTransformation(fields: ReadonlyArray<{ path: string; source: string; transformed: string }>, detections: readonly DetectedReference[], changes: ReadonlyArray<{ path: string; rule: string }>): PostTransformAudit {
  const residuals: ResidualReference[] = [];
  const doubledNames: DoubledName[] = [];
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
    for (const match of field.transformed.matchAll(new RegExp(DOUBLED_TARGET_NAME.source, DOUBLED_TARGET_NAME.flags))) {
      const start = match.index ?? 0;
      doubledNames.push({ path: field.path, term: match[0], context: contextOf(field.transformed, start, start + match[0].length) });
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
    ok: residuals.every((residual) => residual.status !== 'unexplained') && doubledNames.length === 0 && unappliedTransforms.length === 0 && unrecordedChanges.length === 0,
    checkedFields: fields.length,
    residuals,
    doubledNames,
    unappliedTransforms,
    unrecordedChanges,
  };
}
