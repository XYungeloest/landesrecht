/**
 * Regeln der Rechtsüberleitung Schleswig-Holstein → Land Niedersachsen-Holstein (`nsh`).
 *
 * Aufbau wie beim erprobten RECHT.NRW-Transformer: Schutzmuster werden vor der Anwendung
 * längengleich maskiert und bleiben byteidentisch; jede Ersetzung ist einer benannten Regel
 * zugeordnet und wird mit ihrer Quellposition protokolliert.
 *
 * Besonderheiten Schleswig-Holstein gegenüber Nordrhein-Westfalen:
 *
 *   1. Quell- und Zielname teilen den Bestandteil „Holstein“. Deshalb ersetzt **keine** Regel ein
 *      Teilwort: jede Regel trifft genau die vollständige Landesbezeichnung
 *      („Schleswig…Holstein“, Adjektiv, Landeskürzel) und setzt an ihre Stelle die Zielbezeichnung
 *      aus dem Jurisdiktionsregister. „Schleswig“ allein (Stadt, Kreis Schleswig-Flensburg) und
 *      „Holstein“ allein (Landschaft) sind nie Gegenstand einer Regel. Damit kann keine Doppelung
 *      („…-Holstein-Holstein“) entstehen, und die Anwendung ist idempotent: die Zielbezeichnung
 *      enthält den Quellnamen nicht mehr.
 *   2. Schreibvarianten: Bindestrich, Gedankenstrich, geschütztes Trennzeichen, Leerzeichen und
 *      Zeilenumbruch zwischen den Namensteilen werden erkannt und auf die kanonische
 *      Bindestrichform des Ziellandes vereinheitlicht.
 *   3. Kürzel: „Schl.-H.“ und „SH“ werden nur übergeleitet, wenn unmittelbar eine Staatsform
 *      („Land“, „Landes“, „Lande“) vorausgeht – dann bezeichnen sie eindeutig das Land. Alle
 *      übrigen Vorkommen bleiben unverändert: Fundstellen („GVOBl. Schl.-H. S. 123“) über
 *      Schutzmuster, amtliche Kurzbezeichnungen („LVwG SH“) über die Erkennung mit Entscheidung
 *      `manual-review` (detection.ts). Im Zweifel wird nicht ersetzt.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';

/** Version der Transformationsregeln; der Bulk-Runner erkennt daran veraltete Übernahmen. */
export const TRANSFORMER_VERSION = 'juris-sh-transformer/1.0.0';

export interface TransformationRule {
  id: string;
  pattern: RegExp;
  replacement?: string;
  /** Ersetzung aus dem Treffer; `null` = kein sicherer Fall, der Treffer bleibt unverändert. */
  replace?: (match: RegExpMatchArray, source: string) => string | null;
}

export interface TransformationOptions {
  /**
   * Amtliche Kurzbezeichnungen von Normen des Herkunftslandes ohne Landeszusatz („LVwG“, „LBO“).
   * Reserviert für eine spätere, ausdrücklich beschlossene Überleitung des Landeszusatzes in
   * Normabkürzungen; Version 1.0.0 leitet Normabkürzungen grundsätzlich nicht über.
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

/** „Land Niedersachsen-Holstein“ → „Niedersachsen-Holstein“ (Eigenname ohne Staatsform). */
export function targetProperName(): string {
  const prefix = `${TARGET.stateForm} `;
  return TARGET.name.startsWith(prefix) ? TARGET.name.slice(prefix.length) : TARGET.name;
}

/** Kurzbezeichnung des Ziellandes („NSH“) aus dem Jurisdiktionsregister. */
export function targetShortName(): string {
  return TARGET.shortName;
}

/** Vollständige Bezeichnung des Ziellandes („Land Niedersachsen-Holstein“) aus dem Register. */
export function targetStateName(): string {
  return TARGET.name;
}

/** Amtliches Verkündungsblatt des Ziellandes („GVOBl. NSH“) aus dem Register. */
export function targetGazette(): { abbreviation: string; title: string } {
  return TARGET.gazette;
}

function withCase(value: string, upper: boolean): string {
  const head = upper ? value.slice(0, 1).toLocaleUpperCase('de-DE') : value.slice(0, 1).toLocaleLowerCase('de-DE');
  return `${head}${value.slice(1)}`;
}

/**
 * Adjektiv des Ziellandes, mechanisch aus dem Eigennamen gebildet (wie „Sachsen-Anhalt“ →
 * „sachsen-anhaltisch“): Namensteile mit „isch“. Groß-/Kleinschreibung wird je Namensteil aus der
 * Quellform übernommen, damit „Schleswig-Holsteinischer Landtag“ zu einer parallelen Form wird.
 */
export function targetAdjective(leadingUpper: boolean, trailingUpper: boolean): string {
  const parts = targetProperName().split('-');
  const head = withCase(parts[0] ?? '', leadingUpper);
  const tail = parts.slice(1).map((part, index) => withCase(part, index === parts.length - 2 ? trailingUpper : false));
  return `${[head, ...tail].join('-')}isch`;
}

/** Trennzeichen zwischen den Namensteilen: Binde-/Gedankenstrich, Leerzeichen, Zeilenumbruch. */
export const NAME_SEPARATOR = String.raw`(?:[-‐-―−]\s*|\s+)`;

/** Vollständige Landesbezeichnung, mit optionalem Genitiv-s; nie ein Namensteil allein. */
const STATE_NAME = String.raw`\bSchleswig${NAME_SEPARATOR}Holstein(s?)(?![\p{L}])`;
/**
 * Versalschreibung, wie sie in Überschriften und Titelblättern vorkommt. Eigene Regel, weil die
 * übrigen Muster die Groß-/Kleinschreibung tragen und deshalb bewusst nicht `i` gesetzt haben –
 * ohne diese Regel bliebe `SCHLESWIG-HOLSTEIN` stehen und blockierte die Norm in der Nachprüfung.
 */
const STATE_NAME_UPPER = String.raw`\bSCHLESWIG${NAME_SEPARATOR}HOLSTEIN(S?)(?![\p{L}])`;
/** Adjektiv in allen Flexionen und Schreibungen. */
const STATE_ADJECTIVE = String.raw`\b([Ss])chleswig${NAME_SEPARATOR}([Hh])olsteinisch(e[mnrs]?)?(?![\p{L}])`;
/** Punktkürzel des Herkunftslandes in seinen Schreibvarianten. */
export const DOTTED_ABBREVIATION = String.raw`Schl\.\s?[-‐-―−]\s?H\.`;
/** Staatsform unmittelbar vor dem Kürzel: nur dann bezeichnet das Kürzel eindeutig das Land. */
const STATE_FORM_BEFORE = String.raw`(?<=\b(?:Land|Landes|Lande)\s)`;

/** Nach „… Schl.-H.“ beginnt ein neuer Satz (Großbuchstabe, Anführungszeichen) oder der Text endet. */
const SENTENCE_CONTINUATION_AFTER_DOT = /^(?:\s*$|\s+[A-ZÄÖÜ„"])/u;

function stateName(match: RegExpMatchArray): string {
  return `${targetProperName()}${match[1] ?? ''}`;
}

/** Reihenfolge ist Priorität: spezifischere Muster zuerst. */
export function transformationRules(_options: TransformationOptions = {}): TransformationRule[] {
  return [
    { id: 'jurisdiction-name-genitive', pattern: new RegExp(String.raw`(?<=\bLandes\s)${STATE_NAME}`, 'gu'), replace: stateName },
    { id: 'jurisdiction-name-dative', pattern: new RegExp(String.raw`(?<=\b(?:im|dem|vom|beim|zum|am)\s+Land\s)${STATE_NAME}`, 'gu'), replace: stateName },
    { id: 'jurisdiction-name-full', pattern: new RegExp(String.raw`(?<=\bLand\s)${STATE_NAME}`, 'gu'), replace: stateName },
    {
      id: 'jurisdiction-name-adjective',
      pattern: new RegExp(STATE_ADJECTIVE, 'gu'),
      replace: (match) => `${targetAdjective(match[1] === 'S', match[2] === 'H')}${match[3] ?? ''}`,
    },
    { id: 'jurisdiction-name-bare', pattern: new RegExp(STATE_NAME, 'gu'), replace: stateName },
    {
      id: 'jurisdiction-name-upper',
      pattern: new RegExp(STATE_NAME_UPPER, 'gu'),
      replace: (match) => `${targetProperName().toLocaleUpperCase('de-DE')}${match[1] ?? ''}`,
    },
    {
      id: 'jurisdiction-abbreviation-dotted',
      pattern: new RegExp(`${STATE_FORM_BEFORE}${DOTTED_ABBREVIATION}`, 'gu'),
      replace: (match, source) => {
        const after = source.slice((match.index ?? 0) + match[0].length);
        return `${targetShortName()}${SENTENCE_CONTINUATION_AFTER_DOT.test(after) ? '.' : ''}`;
      },
    },
    { id: 'jurisdiction-abbreviation', pattern: new RegExp(String.raw`${STATE_FORM_BEFORE}SH(?![\p{L}\d])`, 'gu'), replacement: targetShortName() },
  ];
}

/** Regelsatz ohne Optionen (Kompatibilität, Berichte). */
export const TRANSFORMATION_RULES: readonly TransformationRule[] = transformationRules();

/**
 * Schutzmuster: byteidentisch erhalten. Amtliche Fundstellen und Verkündungsblattnamen des
 * Herkunftslandes, Bundesfundstellen, Adressen, Prüfsummen und Dateinamen sind Provenienz und
 * werden nie übergeleitet – auch dann nicht, wenn sie die Landesbezeichnung enthalten.
 */
export const PROTECTED_PATTERNS: readonly ProtectedPattern[] = [
  { id: 'url', category: 'source-citation', pattern: /https?:\/\/\S+/gu, reason: 'Adresse der Quelle bleibt unverändert' },
  { id: 'file-name', category: 'source-citation', pattern: /(?<![\w/.-])[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:pdf|htm|html|xml|json|zip|csv)(?![\w])/gu, reason: 'Dateiname der archivierten Quelle bleibt unverändert' },
  { id: 'checksum', category: 'source-citation', pattern: /\b[a-f0-9]{64}\b/gu, reason: 'Prüfsumme der archivierten Quelle bleibt unverändert' },
  {
    id: 'gazette-title',
    category: 'source-citation',
    pattern: new RegExp(String.raw`\b(?:Gesetz-\s*und\s+Verordnungsblatt|Amtsblatt|Nachrichtenblatt)(?:\s+(?:für|des\s+Landes|der\s+Landesregierung))?\s+(?:das\s+Land\s+)?Schleswig${NAME_SEPARATOR}Holstein(?:s)?\b`, 'gu'),
    reason: 'Amtlicher Name eines Verkündungs- oder Amtsblatts des Herkunftslandes bleibt unverändert',
  },
  {
    id: 'gazette-dotted',
    category: 'source-citation',
    // „GVOBI.“ (großes I statt kleinem l) ist eine Schreibvariante im Quelltext der juris-Ausgabe.
    // Nachrichtenblätter der Ressorts tragen das Ressortkürzel mit oder ohne Punkt („NBl. MSB. Schl.-H.“, „NBl. MBWK Schl.-H.“).
    pattern: new RegExp(String.raw`\b(?:GVOB[lI]|GVBl|Amtsbl|ABl|NBl|MBl|SchlHA)\.\s*(?:[A-ZÄÖÜ]{2,8}\.?\s+)?${DOTTED_ABBREVIATION}(?:\s*(?:\d{4}\s*)?S\.\s*\d+[a-z]?)?`, 'gu'),
    reason: 'Amtliche Fundstelle des Herkunftslandes (Verkündungs-, Amts- oder Nachrichtenblatt) bleibt unverändert',
  },
  {
    id: 'gazette-short',
    category: 'source-citation',
    pattern: /\b(?:GVOBl|GVBl|Amtsbl|ABl|NBl|MBl)\.\s*SH\b(?:\s*(?:\d{4}\s*)?S\.\s*\d+[a-z]?)?/gu,
    reason: 'Amtliche Fundstelle des Herkunftslandes in Kurzschreibung bleibt unverändert',
  },
  { id: 'gazette-federal', category: 'source-citation', pattern: /\bBGBl\.\s*[IVX]*\s*(?:\d{4}\s*)?S\.\s*\d+/gu, reason: 'Fundstelle im Bundesgesetzblatt bleibt unverändert' },
  { id: 'external-proper-names', category: 'external-name', pattern: /\b(?:IB\.SH|HSH|NDR|SH\.Netz)\b/gu, reason: 'Eigenname eines externen Trägers bleibt unverändert' },
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
