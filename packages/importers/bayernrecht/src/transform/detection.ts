/**
 * Erkennung vor der Transformation (auf dem unveränderten Quelltext):
 *
 *   Detection → Klassifikation (Kategorie) → Entscheidung
 *     protected            Fundstelle, Verkündungsblattname, BayRS-Nummer, URL, Prüfsumme,
 *                          Landschaftsname – bleibt byteidentisch
 *     safe-auto-transform  Landesbezeichnung mit benannter Regel; Verfassungsorgane mit Landesbezug
 *     manual-review        Staatsministerium, Behörde, Körperschaft, Kommune, Geographie, Abkürzung
 *                          mit „Bay“, unklare Restformen – Text bleibt unverändert
 *     informational        reiner Hinweis ohne Handlungsbedarf (Institutionen-Zuordnung `preserve`)
 *   → Transformation → Prüfung nach der Transformation (Residuen, Doppelbildungen, nicht
 *     angewandte Regeln, stille Änderungen)
 *
 * Institutionen werden über die zentrale Zuordnung (`institution-registry.ts`) eingeordnet; der
 * Normtext ändert sich dadurch nicht. Kein Befund geht verloren: jede Erkennung steht mit Pfad,
 * Quellposition, Kontext, Kategorie, Entscheidung, Begründung und gegebenenfalls dem
 * Zuordnungseintrag im Report – auch die, die unverändert bleibt.
 */
import { SOURCE_STATE } from '../common/constants.ts';
import type { CompiledInstitutionRegistry, InstitutionStatus } from './institution-registry.ts';
import {
  APPENDED_GUARD,
  APPENDED_GUARD_UPPER,
  BAY_ABBREVIATION,
  findProtectedSpans,
  NAME_SEPARATOR,
  planTransformation,
  PROTECTED_PATTERNS,
  SOURCE_ADJECTIVE,
  targetNameParts,
  targetStateName,
  type TransformationOptions,
} from './rules.ts';

/** Das Abkürzungsmuster gehört sprachlich zur Quelle und steht deshalb in `rules.ts`. */
export { BAY_ABBREVIATION } from './rules.ts';

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
  /** Historischer Staat, historisches Organ oder historischer Vertragsname (Königreich Bayern, Königl. Bayer. …). */
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
  compoundProperName:
    'Zusammengesetzter Eigenname mit „Bayern“ ohne Trennzeichen (BayernLabo, BayernPortal, BayernLB, Bayernhymne). ' +
    'Keine Bezeichnung des Landes, sondern Marke, Einrichtung oder Werk. Die Überleitungsregel verlangt hinter dem ' +
    'Landesnamen eine Wortgrenze und fasst ihn deshalb nicht an; eine Überleitung wäre eine redaktionelle ' +
    'Entscheidung über die Institutionen-Zuordnung, keine Regel auf Wortteilen.',
  bayAbbreviation:
    'Amtliche Abkürzung mit dem Landeszusatz „Bay“ (BayVerf, BayBO, BayHO, BayRS, BayVwVfG, BayMBl.). ' +
    'Ob der Landeszusatz in Abkürzungen übergeleitet wird, ist eine Grundsatzentscheidung mit Folgen für ' +
    'den gesamten Bestand und jede Verweisung; Version 1.0.0 ersetzt sie nicht – die Entscheidung ist manuell.',
} as const;

/** Vollständige Quellbezeichnung; nie ein Teilwort, nie ein bereits übergeleiteter Name. */
const STATE = String.raw`${SOURCE_STATE}${APPENDED_GUARD}(?![\p{L}])`;
/** Staatsform der Quelle im Genitiv („des Freistaates Bayern“, „des Landes Bayern“). */
const OF_STATE = String.raw`(?:von\s+|des\s+(?:Freistaates|Freistaats|Landes)\s+|im\s+(?:Freistaat|Land)\s+)?`;
/** Quelladjektiv in allen Flexionen und Schreibungen. */
const ADJECTIVE = String.raw`[${SOURCE_ADJECTIVE.slice(0, 1).toLocaleUpperCase('de-DE')}${SOURCE_ADJECTIVE.slice(0, 1)}]${SOURCE_ADJECTIVE.slice(1)}(?:e[mnrs]?)?`;

/**
 * Ressortzuschnitt: eine Folge großgeschriebener Nomen, verbunden durch Komma oder eine der
 * Verbindungen „und“, „für“, „der“, „des“, „im“, „mit“, „sowie“. Deckt die realen bayerischen
 * Ressortbezeichnungen ab („der Finanzen und für Heimat“, „des Innern, für Sport und Integration“,
 * „für Wirtschaft, Landesentwicklung und Energie“) und endet von selbst am ersten kleingeschriebenen
 * Wort – anders als eine Zeichenzahlgrenze, die über das Satzende hinausliefe.
 */
const PORTFOLIO = String.raw`[A-ZÄÖÜ][\p{L}]+(?:(?:,\s+(?:für\s+)?|(?:\s+(?:und|für|der|des|im|mit|sowie))+\s+)[A-ZÄÖÜ][\p{L}]+)*`;

/** Kopfwörter der bayerischen Ressortbezeichnungen; die Staatskanzlei läuft über `authority-named`. */
const MINISTRY_HEAD = String.raw`(?:Staatsministeri(?:um|ums)|Staatsminister(?:in|s)?|Ministeri(?:um|ums)|Minister(?:in|s)?)`;

/**
 * Institutionelle und geographische Detektoren.
 *
 * Geographie bewusst **ohne** die mehrdeutigen Flussnamen „Main“, „Inn“, „Regen“ und „Naab“: Sie
 * sind im Fließtext nicht von gewöhnlichen Wörtern zu unterscheiden, und ein Falschbefund in der
 * Review-Queue ist teurer als ein fehlender Hinweis auf einen Fluss, der ohnehin nie transformiert
 * wird.
 */
export const INSTITUTION_DETECTORS: readonly Detector[] = [
  {
    id: 'legislature-state',
    category: 'legislature',
    decision: 'safe-auto-transform',
    pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+Landtag(?:s|es)?|Landtag(?:s|es)?\s+${OF_STATE}${STATE})(?![\p{L}\d])`, 'gu'),
    reason: REASONS.constitutional,
  },
  {
    id: 'constitutional-organ-state',
    category: 'institution',
    decision: 'safe-auto-transform',
    pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:(?:Staatsregierung|Ministerpräsident(?:in|en)?)\s+${OF_STATE}${STATE}|${ADJECTIVE}\s+Staatsregierung)(?![\p{L}\d])`, 'gu'),
    reason: REASONS.constitutional,
  },
  {
    id: 'court-state',
    category: 'institution',
    decision: 'manual-review',
    pattern: new RegExp(
      String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+(?:Verfassungsgerichtshof(?:es|s)?|Verwaltungsgerichtshof(?:es|s)?|Oberste[nrms]?\s+Landesgericht(?:es|s)?|Landessozialgericht(?:es|s)?|Landesarbeitsgericht(?:es|s)?|Oberlandesgericht(?:es|s)?)|(?:Verfassungsgerichtshof|Verwaltungsgerichtshof)\s+${OF_STATE}${STATE})(?![\p{L}\d])`,
      'gu',
    ),
    reason: REASONS.court,
  },
  {
    id: 'ministry-portfolio',
    category: 'ministry',
    decision: 'manual-review',
    pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+)?${MINISTRY_HEAD}\s+(?:für|des|der)\s+${PORTFOLIO}`, 'gu'),
    reason: REASONS.ministry,
  },
  {
    id: 'ministry-compound',
    category: 'ministry',
    decision: 'manual-review',
    pattern: /(?<![\p{L}\d])(?:Innen|Finanz|Justiz|Kultus|Wissenschafts|Wirtschafts|Sozial|Arbeits|Umwelt|Verkehrs|Bau|Gesundheits|Landwirtschafts|Digital)(?:staats)?minister(?:ium|iums|in|s)?(?![\p{L}\d])/gu,
    reason: REASONS.ministry,
  },
  {
    id: 'authority-state-office',
    category: 'authority',
    decision: 'manual-review',
    pattern: new RegExp(String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+)?Landes(?:amt|amtes|amts|anstalt|institut)\s+für\s+${PORTFOLIO}`, 'gu'),
    reason: REASONS.authority,
  },
  {
    id: 'authority-named',
    category: 'authority',
    decision: 'manual-review',
    pattern: new RegExp(
      String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+(?:Staatskanzlei|Oberste[nrms]?\s+Rechnungshof(?:es|s)?|Landeskriminalamt(?:es|s)?|Landesamt(?:es|s)?\s+für\s+Verfassungsschutz|Landesarchiv(?:es|s)?|Staatsarchiv(?:es|s)?|Landeszentrale\s+für\s+politische\s+Bildungsarbeit)|Staatskanzlei|Oberste[rn]?\s+Rechnungshof(?:es|s)?)(?![\p{L}\d])`,
      'gu',
    ),
    reason: REASONS.authority,
  },
  {
    id: 'public-body-regional',
    category: 'public-body',
    decision: 'manual-review',
    pattern: new RegExp(
      String.raw`(?<![\p{L}\d])(?:${ADJECTIVE}\s+(?:Rundfunk(?:s|es)?|Landesbank|Versorgungskammer|Landesärztekammer|Landeszahnärztekammer|Landesapothekerkammer|Architektenkammer|Ingenieurekammer(?:-Bau)?|Landesstiftung)|Kassen(?:zahn)?ärztliche[rn]?\s+Vereinigung\s+${SOURCE_STATE}s?|(?:Landes)?[ÄA]rztekammer\s+${SOURCE_STATE}s?|Handwerkskammer\s+für\s+${PORTFOLIO})(?![\p{L}\d])`,
      'gu',
    ),
    reason: REASONS.publicBody,
  },
  {
    id: 'regional-body-association',
    category: 'regional-body',
    decision: 'manual-review',
    pattern: new RegExp(String.raw`(?<![\p{L}\d])${ADJECTIVE}\s+(?:Gemeindetag(?:s|es)?|Städtetag(?:s|es)?|Landkreistag(?:s|es)?|Bezirketag(?:s|es)?|Bauernverband(?:es|s)?)(?![\p{L}\d])`, 'gu'),
    reason: REASONS.regionalBody,
  },
  {
    id: 'municipality',
    category: 'municipality',
    decision: 'manual-review',
    // Bayreuth steht hier bewusst: Der Name beginnt mit „Bay“, wird von keiner Regel getroffen und
    // ist als Kommune benannt, damit er nicht als unklare Restform erscheint.
    pattern: /(?<![\p{L}\d])(?:München|Nürnberg|Augsburg|Regensburg|Würzburg|Ingolstadt|Fürth|Erlangen|Bayreuth|Bamberg|Aschaffenburg|Landshut|Kempten|Rosenheim|Neu-Ulm|Schweinfurt|Passau|Freising|Straubing|Dachau|Coburg|Amberg|Weiden|Ansbach|Kaufbeuren|Memmingen|Hof|Deggendorf|Garmisch-Partenkirchen|Berchtesgaden|Lindau|Füssen)(?![\p{L}\d])/gu,
    reason: REASONS.municipality,
  },
  {
    id: 'geography-region',
    category: 'geography',
    decision: 'manual-review',
    pattern: /(?<![\p{L}\d])(?:Oberbayern|Niederbayern|Oberpfalz|Oberfranken|Mittelfranken|Unterfranken|Schwaben|Allgäu|Fichtelgebirge|Frankenwald|Bayerwald|Chiemgau|Berchtesgadener\s+Land|Rhön|Spessart|Steigerwald|Fränkische\s+Schweiz)(?![\p{L}\d])/gu,
    reason: REASONS.geography,
  },
  {
    id: 'geography-water',
    category: 'geography',
    decision: 'manual-review',
    pattern: /(?<![\p{L}\d])(?:Donau|Isar|Lech|Altmühl|Iller|Wörnitz|Chiemsee|Starnberger\s+See|Königssee|Ammersee|Walchensee|Tegernsee|Bodensee)(?![\p{L}\d])/gu,
    reason: REASONS.geography,
  },
];

/**
 * Landesbezeichnung in jeder Form – für Restformen und die Prüfung nach der Transformation.
 *
 * Die erste Alternative trägt denselben negativen Lookahead wie die Regeln: Ein „Bayern“, dem schon
 * „-Württemberg“ folgt, ist der fertige Zielname und darf hier nicht als Restform erscheinen. Ohne
 * diesen Lookahead meldete die Nachprüfung jede korrekt übergeleitete Norm als defekt.
 *
 * Bewusst enthalten ist die Abkürzung mit „Bay“: Sie **ist** der Landeszusatz in abgekürzter Form,
 * bleibt konservativ unverändert und wird über `classifyResidual` als `official-abbreviation` mit
 * Entscheidung `manual-review` belegt.
 */
export const SOURCE_STATE_REFERENCE = new RegExp(
  [
    String.raw`\b${SOURCE_STATE}${APPENDED_GUARD}\p{L}*`,
    String.raw`\b${SOURCE_STATE.toLocaleUpperCase('de-DE')}${APPENDED_GUARD_UPPER}\p{L}*`,
    String.raw`\b[${SOURCE_ADJECTIVE.slice(0, 1).toLocaleUpperCase('de-DE')}${SOURCE_ADJECTIVE.slice(0, 1)}]${SOURCE_ADJECTIVE.slice(1)}\p{L}*`,
    String.raw`\b${SOURCE_ADJECTIVE.toLocaleUpperCase('de-DE')}\p{L}*`,
    BAY_ABBREVIATION,
  ].join('|'),
  'gu',
);

/**
 * Doppelbildung aus Quell- und Zielnamen („Bayern-Württemberg-Württemberg“, aber auch
 * „Bayern-Bayern“): darf nie entstehen. Schreibungsunabhängig (`i`), damit auch die Versalform einer
 * Überschrift erfasst wird – eine Doppelbildung ist in jeder Schreibung falsch.
 */
export const DOUBLED_TARGET_NAME = new RegExp(
  targetNameParts().map((part) => String.raw`${part}(?:isch(?:e[mnrs]?)?)?${NAME_SEPARATOR}${part}`).join('|'),
  'giu',
);

/**
 * Zusammengesetzter Eigenname: „Bayern“ unmittelbar mit weiteren Buchstaben verwachsen, ohne
 * Trennzeichen – `BayernLabo`, `BayernPortal`, `BayernLB`, `Bayernhymne`, `Bayernwerk`.
 *
 * Solche Namen sind **keine Bezeichnung des Landes**, sondern Marken, Einrichtungen und Werke. Die
 * Überleitungsregel fasst sie richtigerweise nicht an: Sie verlangt hinter „Bayern“ eine
 * Wortgrenze. Die Restpostensuche verlangte das bisher nicht und meldete damit genau das als
 * Defekt, was die Regel bewusst verschont – 58 Normen scheiterten daran.
 *
 * Erfasst bleiben sie trotzdem, nur als **eigener Befund**: Wer „BayernLabo“ übergeleitet sehen
 * will, entscheidet das redaktionell über die Institutionen-Zuordnung, nicht über eine Regel, die
 * Wortteile ersetzt.
 *
 * Nicht erfasst sind die Flexionsformen des Landesnamens selbst (`Bayerns`); sie trägt die Regel.
 */
const COMPOUND_PROPER_NAME = new RegExp(String.raw`^${SOURCE_STATE}(?!s(?![\p{L}]))\p{L}+$`, 'u');

/** Grober Vorfilter: Enthält ein Schutzbereich überhaupt etwas Landesbezogenes? */
const STATE_SPECIFIC = new RegExp(
  [SOURCE_STATE, SOURCE_STATE.toLocaleUpperCase('de-DE'), String.raw`[${SOURCE_ADJECTIVE.slice(0, 1).toLocaleUpperCase('de-DE')}${SOURCE_ADJECTIVE.slice(0, 1)}]${SOURCE_ADJECTIVE.slice(1)}`, BAY_ABBREVIATION].join('|'),
  'u',
);

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

const BAY_ABBREVIATION_EXACT = new RegExp(String.raw`^(?:${BAY_ABBREVIATION})$`, 'u');

/** Restform einordnen: amtliche Abkürzung mit „Bay“ oder unklare Landesform. */
function classifyResidual(term: string): { category: ReferenceCategory; reason: string } {
  if (BAY_ABBREVIATION_EXACT.test(term)) return { category: 'official-abbreviation', reason: REASONS.bayAbbreviation };
  if (COMPOUND_PROPER_NAME.test(term)) return { category: 'external-name', reason: REASONS.compoundProperName };
  return { category: 'jurisdiction-name', reason: REASONS.residual };
}

/** Ist der Treffer ein zusammengesetzter Eigenname und damit keine Restform des Landesnamens? */
export function isCompoundProperName(term: string): boolean {
  return COMPOUND_PROPER_NAME.test(term);
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
      const classified = classifyResidual(match[0]);
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
 * („Bayern-Württemberg-Württemberg“) entstanden sein; jede sichere Ersetzung muss angewandt und
 * protokolliert sein; kein Feld darf sich ohne Protokolleintrag verändert haben.
 */
export function auditTransformation(
  fields: ReadonlyArray<{ path: string; source: string; transformed: string }>,
  detections: readonly DetectedReference[],
  changes: ReadonlyArray<{ path: string; rule: string }>,
): PostTransformAudit {
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
