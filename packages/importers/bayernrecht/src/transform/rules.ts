/**
 * Regeln der Rechtsüberleitung Bayern → Freistaat Bayern-Württemberg (`baywue`).
 *
 * Aufbau wie beim erprobten RECHT.NRW- und beim juris-SH-Transformer: Schutzmuster werden vor der
 * Anwendung längengleich maskiert und bleiben byteidentisch; jede Ersetzung ist einer benannten
 * Regel zugeordnet und wird mit ihrer Quellposition protokolliert.
 *
 * Drei Besonderheiten Bayerns, die den Regelsatz bestimmen:
 *
 *  1. **Der Zielname enthält den Quellnamen vollständig** („Bayern“ → „Bayern-Württemberg“). Bei
 *     Schleswig-Holstein → Niedersachsen-Holstein teilten Quelle und Ziel nur den *End*teil; dort
 *     genügte es, nie ein Teilwort zu ersetzen, und die Idempotenz fiel ab. Hier fällt sie nicht ab:
 *     Eine zweite Anwendung derselben Regel ergäbe „Bayern-Württemberg-Württemberg“.
 *
 *     Sie wird deshalb **konstruiert**, nicht nachträglich repariert: Jede Regel, die den Zielnamen
 *     erzeugen kann, trägt unmittelbar hinter dem Quellnamen einen **negativen Lookahead auf den
 *     bereits angehängten Zielteil** (`APPENDED_GUARD`, `APPENDED_GUARD_UPPER`). Ein „Bayern“, dem
 *     schon „-Württemberg“ folgt, ist damit für jede Regel unerreichbar – in der ersten wie in jeder
 *     weiteren Anwendung, und unabhängig davon, welche Regel den Namen erzeugt hat. Der angehängte
 *     Teil wird aus dem Jurisdiktionsregister abgeleitet, nicht literal gesetzt.
 *
 *  2. **Das Adjektiv ist unregelmäßig.** Die Quelle sagt „bayerisch“, nicht „bayernisch“. Eine
 *     mechanische Ableitung aus dem Eigennamen (Namensteile plus „isch“, wie bei NSH) träfe die
 *     Quellform gar nicht. Es gibt deshalb eine ausdrückliche Zuordnung `bayerisch…` → Zielform in
 *     allen Flexionen und beiden Schreibungen. Welche Zielform gilt, ist eine redaktionelle
 *     Festlegung; sie steht an genau einer Stelle (`targetAdjective`, `adjectiveDecision`).
 *
 *  3. **Abkürzungen mit „Bay“ werden nicht übergeleitet.** Praktisch jede bayerische Abkürzung
 *     beginnt mit „Bay“ (BayVerf, BayBO, BayHO, BayRS, BayVwVfG, BayMBl.). Der Regelsatz enthält
 *     **keine** Abkürzungsregel; die Entscheidung ist konservativ und wird in `detection.ts` als
 *     `manual-review` gemeldet, nicht im Text vollzogen. Begründung: docs/BAYERN_TRANSFORMATION.md.
 *
 * Wörter, die nur zufällig mit „Bay“ beginnen oder „Bayer“ enthalten (Bayreuth, Bayerwald), können
 * von keiner Regel getroffen werden: Die Namensregel verlangt „Bayern“ mit anschließender
 * Nicht-Buchstaben-Grenze, die Adjektivregel „bayerisch“ mit derselben Grenze. Landschaftsnamen mit
 * dem Adjektiv („Bayerischer Wald“, „Bayerisches Meer“) sind über Schutzmuster ausgenommen.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { SOURCE_STATE, TARGET_JURISDICTION } from '../common/constants.ts';

/** Version der Transformationsregeln; der Bulk-Runner erkennt daran veraltete Übernahmen. */
export const TRANSFORMER_VERSION = 'bayernrecht-transformer/1.0.0';

export interface TransformationRule {
  id: string;
  pattern: RegExp;
  replacement?: string;
  /** Ersetzung aus dem Treffer; `null` = kein sicherer Fall, der Treffer bleibt unverändert. */
  replace?: (match: RegExpMatchArray, source: string) => string | null;
}

export interface TransformationOptions {
  /**
   * Amtliche Kurzbezeichnungen von Normen des Herkunftslandes („BayBO“, „BayHO“). Reserviert für
   * eine später ausdrücklich beschlossene Überleitung des Landeszusatzes in Normabkürzungen;
   * Version 1.0.0 leitet Normabkürzungen grundsätzlich nicht über (siehe Modulkopf, Punkt 3).
   */
  knownStateLawAbbreviations?: ReadonlySet<string>;
}

export const PROTECTED_CATEGORIES = ['source-citation', 'external-name'] as const;
export type ProtectedCategory = (typeof PROTECTED_CATEGORIES)[number];

export interface ProtectedPattern {
  id: string;
  category: ProtectedCategory;
  pattern: RegExp;
  reason: string;
}

const TARGET = getJurisdiction(TARGET_JURISDICTION);

/** „Freistaat Bayern-Württemberg“ → „Bayern-Württemberg“ (Eigenname ohne Staatsform). */
export function targetProperName(): string {
  const prefix = `${TARGET.stateForm} `;
  return TARGET.name.startsWith(prefix) ? TARGET.name.slice(prefix.length) : TARGET.name;
}

/** Kurzbezeichnung des Ziellandes („BayWü“) aus dem Jurisdiktionsregister. */
export function targetShortName(): string {
  return TARGET.shortName;
}

/** Vollständige Bezeichnung des Ziellandes („Freistaat Bayern-Württemberg“) aus dem Register. */
export function targetStateName(): string {
  return TARGET.name;
}

/** Staatsform des Ziellandes („Freistaat“) aus dem Register. */
export function targetStateForm(): string {
  return TARGET.stateForm;
}

/** Amtliches Verkündungsblatt des Ziellandes („GVBl. BayWü“) aus dem Register. */
export function targetGazette(): { abbreviation: string; title: string } {
  return TARGET.gazette;
}

/** Namensteile des Ziellandes: `['Bayern', 'Württemberg']`. */
export function targetNameParts(): string[] {
  return targetProperName().split('-');
}

/**
 * Der Teil, den der Zielname dem Quellnamen anhängt („Württemberg“) – oder `undefined`, wenn der
 * Zielname den Quellnamen nicht als Anfangsteil enthält. Alles, was die Idempotenz hier sichert,
 * hängt an dieser einen Ableitung; sie liest ausschließlich das Jurisdiktionsregister.
 */
export function targetAppendedPart(): string | undefined {
  const proper = targetProperName();
  return proper.startsWith(`${SOURCE_STATE}-`) ? proper.slice(SOURCE_STATE.length + 1) : undefined;
}

function withCase(value: string, upper: boolean): string {
  const head = upper ? value.slice(0, 1).toLocaleUpperCase('de-DE') : value.slice(0, 1).toLocaleLowerCase('de-DE');
  return `${head}${value.slice(1)}`;
}

/**
 * **Redaktionelle Festlegung (einzige Stelle).** Das Adjektiv des Ziellandes lautet
 * „bayern-württembergisch“: alle Namensteile außer dem letzten als bloßer Stamm, nur der letzte
 * trägt „-isch“.
 *
 * Begründung – zwei Gründe, ein sprachlicher und ein struktureller:
 *
 *  * **Sprachlich** ist das die durchgehende Bildung zusammengesetzter Ländernamen im Deutschen:
 *    „baden-württembergisch“ (obwohl Baden für sich „badisch“ heißt), „nordrhein-westfälisch“,
 *    „sachsen-anhaltisch“, „schleswig-holsteinisch“. Der vordere Bestandteil erscheint als
 *    Toponym-Stamm, nicht in seiner eigenen Adjektivform. „Baden-Württemberg“ ist der
 *    nächstliegende Fall überhaupt und entscheidet ihn: nicht „badisch-württembergisch“.
 *  * **Strukturell** enthält die gewählte Form die Quellform „bayerisch“ nicht mehr. Die
 *    Adjektivregel ist damit aus demselben Grund idempotent wie die Namensregel – und ohne eigenen
 *    Lookahead. Die verworfene Alternative „bayerisch-württembergisch“ trüge die Quellform in sich
 *    und verlangte einen zweiten Schutz; sie wäre zudem nach der Nachprüfung eine dauerhaft
 *    verbleibende Quellbezeichnung.
 *
 * Wer die Festlegung ändern will, ändert diese Funktion – und muss die Idempotenz für die neue Form
 * eigens sicherstellen (`tests/unit/bayernrecht-transform.test.ts`, Abschnitt Idempotenz).
 */
export function targetAdjective(upper: boolean): string {
  return `${targetNameParts().map((part) => withCase(part, upper)).join('-')}isch`;
}

/** Adjektiv der Quelle – unregelmäßig, deshalb ausdrücklich benannt und nicht abgeleitet. */
export const SOURCE_ADJECTIVE = 'bayerisch' as const;

/** Die redaktionelle Festlegung in maschinenlesbarer Form (Report, Dokumentation, Tests). */
export function adjectiveDecision(): { id: string; source: string; chosen: string; rejected: string; reason: string } {
  const appended = targetAppendedPart();
  return {
    id: 'adjektiv-kompositionsstamm',
    source: SOURCE_ADJECTIVE,
    chosen: targetAdjective(false),
    rejected: appended ? `${SOURCE_ADJECTIVE}-${withCase(appended, false)}isch` : `${SOURCE_ADJECTIVE}…`,
    reason:
      'Zusammengesetzte Ländernamen bilden das Adjektiv mit bloßem Stamm der vorderen Bestandteile ' +
      '(baden-württembergisch trotz badisch, nordrhein-westfälisch, sachsen-anhaltisch). Die gewählte ' +
      'Form enthält die Quellform „bayerisch“ nicht mehr und ist deshalb ohne zusätzlichen Schutz idempotent.',
  };
}

/**
 * Trennzeichen zwischen Namensteilen: Binde-/Gedankenstrich, Leerzeichen, Zeilenumbruch – auch mit
 * Leerraum vor dem Strich. Die Toleranz ist hier keine Bequemlichkeit: Das Trennzeichen steht im
 * Idempotenzschutz und in der Doppelbildungsprüfung; jede Schreibweise, die es nicht erfasst, wäre
 * eine Lücke in beiden.
 */
export const NAME_SEPARATOR = String.raw`(?:\s*[-‐-―−]\s*|\s+)`;

/** Sonderzeichen eines Namens für die Verwendung in einem regulären Ausdruck entschärfen. */
function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const APPENDED = targetAppendedPart();

/**
 * Der Schutz gegen die zweite Anwendung: unmittelbar hinter dem Quellnamen darf nicht schon der
 * angehängte Zielteil stehen. Enthält der Zielname den Quellnamen nicht (anderes Zielland), ist der
 * Schutz eine leere Zusicherung – nicht ein falscher.
 */
export const APPENDED_GUARD = APPENDED ? String.raw`(?!${NAME_SEPARATOR}${escapeForPattern(APPENDED)})` : '';
export const APPENDED_GUARD_UPPER = APPENDED ? String.raw`(?!${NAME_SEPARATOR}${escapeForPattern(APPENDED.toLocaleUpperCase('de-DE'))})` : '';

/** Vollständiger Quellname mit optionalem Genitiv-s; nie ein Teilwort, nie ein fertiger Zielname. */
export const SOURCE_STATE_NAME = String.raw`\b${escapeForPattern(SOURCE_STATE)}(s?)${APPENDED_GUARD}(?![\p{L}])`;
/** Versalschreibung aus Überschriften und Titelblättern („BAYERN“). */
export const SOURCE_STATE_NAME_UPPER = String.raw`\b${escapeForPattern(SOURCE_STATE.toLocaleUpperCase('de-DE'))}(S?)${APPENDED_GUARD_UPPER}(?![\p{L}])`;

const ADJECTIVE_HEAD = SOURCE_ADJECTIVE.slice(0, 1);
const ADJECTIVE_REST = SOURCE_ADJECTIVE.slice(1);
/** „bayerisch“ in beiden Schreibungen und allen Flexionen (`-e`, `-em`, `-en`, `-er`, `-es`). */
export const SOURCE_ADJECTIVE_PATTERN = String.raw`\b([${ADJECTIVE_HEAD.toLocaleUpperCase('de-DE')}${ADJECTIVE_HEAD}])${ADJECTIVE_REST}(e[mnrs]?)?(?![\p{L}])`;
/** Versalschreibung des Adjektivs („BAYERISCHES“). */
export const SOURCE_ADJECTIVE_UPPER_PATTERN = String.raw`\b${SOURCE_ADJECTIVE.toLocaleUpperCase('de-DE')}(E[MNRS]?)?(?![\p{L}])`;

/**
 * Amtliche Abkürzung mit dem Landeszusatz „Bay“ (BayVerf, BayBO, BayHO, BayRS, BayVwVfG, BayMBl.).
 *
 * Sie wird von **keiner** Regel getroffen – die Überleitung von Abkürzungen ist eine
 * Grundsatzentscheidung mit Folgen für den gesamten Bestand und jede Verweisung, und sie fällt
 * konservativ aus (docs/BAYERN_TRANSFORMATION.md). Das Muster dient der Erkennung, der Restposten-
 * suche und der Prüfung von Zuordnungszielen.
 *
 * Die Kurzform des Ziellandes („BayWü“) beginnt selbst mit dem Zusatz und ist ausdrücklich
 * ausgenommen; sonst meldete jede Simulationsfundstelle sich selbst als Quellabkürzung.
 */
export const BAY_PREFIX = SOURCE_STATE.slice(0, 3);
const TARGET_SHORT_TAIL = TARGET.shortName.startsWith(BAY_PREFIX) ? TARGET.shortName.slice(BAY_PREFIX.length) : undefined;
export const BAY_ABBREVIATION = TARGET_SHORT_TAIL
  ? String.raw`\b${escapeForPattern(BAY_PREFIX)}(?!${escapeForPattern(TARGET_SHORT_TAIL)}(?![\p{L}]))[A-ZÄÖÜ]\p{L}*`
  : String.raw`\b${escapeForPattern(BAY_PREFIX)}[A-ZÄÖÜ]\p{L}*`;

/**
 * Staatsformen, wie sie **in der Quelle** vor dem Landesnamen stehen. Bayern führt sich als
 * Freistaat; „Land Bayern“ kommt in Verweisen auf Bundesrecht vor. Quellseitig, deshalb literal.
 */
const SOURCE_STATE_FORM = String.raw`(?:Freistaat|Land)`;
const SOURCE_STATE_FORM_GENITIVE = String.raw`(?:Freistaates|Freistaats|Landes)`;

function stateName(match: RegExpMatchArray): string {
  return `${targetProperName()}${match[1] ?? ''}`;
}

/** Reihenfolge ist Priorität: spezifischere Muster zuerst. */
export function transformationRules(_options: TransformationOptions = {}): TransformationRule[] {
  return [
    { id: 'jurisdiction-name-genitive', pattern: new RegExp(String.raw`(?<=\b${SOURCE_STATE_FORM_GENITIVE}\s)${SOURCE_STATE_NAME}`, 'gu'), replace: stateName },
    { id: 'jurisdiction-name-dative', pattern: new RegExp(String.raw`(?<=\b(?:im|dem|vom|beim|zum|am)\s+${SOURCE_STATE_FORM}\s)${SOURCE_STATE_NAME}`, 'gu'), replace: stateName },
    { id: 'jurisdiction-name-full', pattern: new RegExp(String.raw`(?<=\b${SOURCE_STATE_FORM}\s)${SOURCE_STATE_NAME}`, 'gu'), replace: stateName },
    {
      id: 'jurisdiction-name-adjective',
      pattern: new RegExp(SOURCE_ADJECTIVE_PATTERN, 'gu'),
      replace: (match) => `${targetAdjective(match[1] === ADJECTIVE_HEAD.toLocaleUpperCase('de-DE'))}${match[2] ?? ''}`,
    },
    {
      id: 'jurisdiction-name-adjective-upper',
      pattern: new RegExp(SOURCE_ADJECTIVE_UPPER_PATTERN, 'gu'),
      replace: (match) => `${targetAdjective(true).toLocaleUpperCase('de-DE')}${match[1] ?? ''}`,
    },
    { id: 'jurisdiction-name-bare', pattern: new RegExp(SOURCE_STATE_NAME, 'gu'), replace: stateName },
    {
      id: 'jurisdiction-name-upper',
      pattern: new RegExp(SOURCE_STATE_NAME_UPPER, 'gu'),
      replace: (match) => `${targetProperName().toLocaleUpperCase('de-DE')}${match[1] ?? ''}`,
    },
  ];
}

/** Regelsatz ohne Optionen (Kompatibilität, Berichte). */
export const TRANSFORMATION_RULES: readonly TransformationRule[] = transformationRules();

/**
 * Schutzmuster: byteidentisch erhalten. Amtliche Fundstellen und Verkündungsblattnamen des
 * Herkunftslandes, die Bayerische Rechtssammlung, Bundesfundstellen, Adressen, Prüfsummen,
 * Dateinamen und Landschaftsnamen mit dem Quelladjektiv sind Provenienz oder fremder Eigenname und
 * werden nie übergeleitet – auch dann nicht, wenn sie die Landesbezeichnung enthalten.
 *
 * Die Reihenfolge ist Priorität: Ein früheres Muster maskiert seinen Bereich für alle späteren.
 */
export const PROTECTED_PATTERNS: readonly ProtectedPattern[] = [
  { id: 'url', category: 'source-citation', pattern: /https?:\/\/\S+/gu, reason: 'Adresse der Quelle bleibt unverändert' },
  { id: 'file-name', category: 'source-citation', pattern: /(?<![\w/.-])[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:pdf|htm|html|xml|json|zip|csv|jpg|jpeg|gif|png)(?![\w])/gu, reason: 'Dateiname der archivierten Quelle bleibt unverändert' },
  { id: 'checksum', category: 'source-citation', pattern: /\b[a-f0-9]{64}\b/gu, reason: 'Prüfsumme der archivierten Quelle bleibt unverändert' },
  {
    id: 'gazette-title',
    category: 'source-citation',
    // Alle Flexionsformen des Adjektivs, nicht nur der Nominativ: Ein Blattname steht im Normtext
    // fast immer gebeugt („bekannt gemacht im Bayerischen Ministerialblatt"). Ohne die gebeugten
    // Formen wird die Fundstelle übergeleitet und behauptet, eine bayerische Vorschrift sei im
    // Verkündungsblatt der Simulation erschienen – ein Provenienzfehler, den niemand mehr sieht.
    pattern: /\b(?:Bayerische[mnrs]?\s+Gesetz-\s*und\s+Verordnungsblatt(?:e?s)?|Bayerische[mnrs]?\s+Rechtssammlung|Bayerische[mnrs]?\s+Ministerialblatt(?:e?s)?|Bayerische[mnrs]?\s+Staatsanzeiger(?:s)?|Allgemeine[mnrs]?\s+Ministerialblatt(?:e?s)?)\b/gu,
    reason: 'Amtlicher Name eines Verkündungs- oder Amtsblatts bzw. der Bayerischen Rechtssammlung bleibt unverändert (alle Flexionsformen)',
  },
  {
    id: 'gazette-bavarian',
    category: 'source-citation',
    pattern: /\b(?:Bay)?GVBl\.?\s*(?:[IVX]+\s+)?(?:\d{4}\s+)?(?:S\.|Nr\.)\s*\d+[a-z]?(?:\s*,\s*\d+[a-z]?)*/gu,
    reason: 'Amtliche Fundstelle im Bayerischen Gesetz- und Verordnungsblatt bleibt unverändert',
  },
  {
    id: 'gazette-ministerial',
    category: 'source-citation',
    pattern: /\b(?:BayMBl|AllMBl|FMBl|KWMBl|MABl|LMBl|StAnz|BayStAnz|MBl)\.?\s*(?:\d{4}\s+)?(?:S\.|Nr\.)\s*\d+[a-z]?(?:\s*,\s*\d+[a-z]?)*/gu,
    reason: 'Amtliche Fundstelle in einem Ministerial- oder Amtsblatt des Herkunftslandes bleibt unverändert',
  },
  { id: 'gazette-ministerial-short', category: 'source-citation', pattern: /\b(?:BayMBl|AllMBl|FMBl|KWMBl|MABl|LMBl|BayStAnz|StAnz)\./gu, reason: 'Kürzel eines Ministerial- oder Amtsblatts des Herkunftslandes bleibt unverändert' },
  {
    id: 'bayrs-number',
    category: 'source-citation',
    pattern: /\bBayRS\s+(?:[IVXLC]+(?:\s+S\.\s*\d+[a-z]?)?|\d[0-9A-Za-z]*(?:[.\-/][0-9A-Za-z]+)*)/gu,
    reason: 'Gliederungsnummer bzw. Band der Bayerischen Rechtssammlung bleibt unverändert',
  },
  { id: 'gazette-federal', category: 'source-citation', pattern: /\bBGBl\.\s*[IVX]*\s*(?:\d{4}\s*)?S\.\s*\d+/gu, reason: 'Fundstelle im Bundesgesetzblatt bleibt unverändert' },
  {
    id: 'landscape-proper-name',
    category: 'external-name',
    pattern: /\b(?:[Bb]ayerische[mnrs]?\s+(?:Wald(?:es|e)?|Meer(?:es|e)?|Alpen)|Bayerisch\s+Eisenstein)\b/gu,
    reason: 'Landschafts- oder Ortsname mit dem Quelladjektiv (Bayerischer Wald, Bayerisches Meer, Bayerisch Eisenstein) ist kein Landesbezug und bleibt unverändert',
  },
];

export interface ProtectedSpan {
  start: number;
  end: number;
  id: string;
  category: ProtectedCategory;
  text: string;
}

export interface TransformSegment {
  start: number;
  end: number;
  rule: string;
  from: string;
  to: string;
}

/** Maskierungszeichen (Private Use Area), längengleich zum maskierten Text. */
const MASK = String.fromCharCode(0xe000);

function mask(value: string, start: number, end: number): string {
  return `${value.slice(0, start)}${MASK.repeat(end - start)}${value.slice(end)}`;
}

/** Findet Schutzstellen in Prioritätsreihenfolge (spätere Muster sehen frühere nicht). */
export function findProtectedSpans(value: string): { spans: ProtectedSpan[]; masked: string } {
  let masked = value;
  const spans: ProtectedSpan[] = [];
  for (const entry of PROTECTED_PATTERNS) {
    for (const match of [...masked.matchAll(new RegExp(entry.pattern.source, entry.pattern.flags))]) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].length === 0 || match[0].includes(MASK)) continue;
      spans.push({ start, end, id: entry.id, category: entry.category, text: value.slice(start, end) });
    }
    for (const span of spans.filter((candidate) => candidate.id === entry.id)) masked = mask(masked, span.start, span.end);
  }
  return { spans: spans.sort((left, right) => left.start - right.start), masked };
}

/** Plant alle Ersetzungen auf dem Quelltext (Positionen beziehen sich auf den unveränderten Text). */
export function planTransformation(value: string, options: TransformationOptions = {}): { protectedSpans: ProtectedSpan[]; segments: TransformSegment[] } {
  const { spans, masked: protectedMasked } = findProtectedSpans(value);
  let masked = protectedMasked;
  const segments: TransformSegment[] = [];
  for (const rule of transformationRules(options)) {
    const found: TransformSegment[] = [];
    for (const match of masked.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].includes(MASK)) continue;
      let replacement: string | null;
      if (rule.replace) replacement = rule.replace(match, masked);
      else {
        const groups = match.slice(1);
        replacement = (rule.replacement ?? '').replace(/\$(\d)/gu, (_placeholder, index: string) => String(groups[Number.parseInt(index, 10) - 1] ?? ''));
      }
      if (replacement === null) continue;
      found.push({ start, end, rule: rule.id, from: value.slice(start, end), to: replacement });
    }
    for (const segment of found) masked = mask(masked, segment.start, segment.end);
    segments.push(...found);
  }
  return { protectedSpans: spans, segments: segments.sort((left, right) => left.start - right.start) };
}

export function applySegments(value: string, segments: readonly TransformSegment[]): string {
  let output = '';
  let cursor = 0;
  for (const segment of [...segments].sort((left, right) => left.start - right.start)) {
    output += value.slice(cursor, segment.start) + segment.to;
    cursor = segment.end;
  }
  return output + value.slice(cursor);
}
