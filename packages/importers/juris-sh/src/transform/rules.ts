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
 *   3. Kürzel: „Schl.-H.“ und „SH“ werden übergeleitet, wenn unmittelbar eine Staatsform
 *      („Land“, „Landes“, „Lande“) vorausgeht oder wenn sie abgesetzter Bestandteil einer bekannten
 *      Abkürzung sind (amtliche Abkürzung einer Norm des Bestands oder im Text eingeführte Abkürzung
 *      einer Bezeichnung mit dem Landesnamen; Version 1.1.0): „LStVollzG SH“ → „LStVollzG NSH“. Alle
 *      übrigen Vorkommen bleiben unverändert: Fundstellen („GVOBl. Schl.-H. S. 123“) und Aktenzeichen über
 *      Schutzmuster, unbekannte Kurzbezeichnungen über die Erkennung mit Entscheidung `manual-review`
 *      (detection.ts). Im Zweifel wird nicht ersetzt.
 *   4. Historische Bezeichnungen (preußische „Provinz Schleswig-Holstein“) sind Schutzmuster und werden nie
 *      übergeleitet; die Nachprüfung meldet eine übergeleitete historische Bezeichnung als Fehler.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';

/** Version der Transformationsregeln; der Bulk-Runner erkennt daran veraltete Übernahmen. */
export const TRANSFORMER_VERSION = 'juris-sh-transformer/1.2.0';

export interface TransformationRule {
  id: string;
  pattern: RegExp;
  replacement?: string;
  /** Ersetzung aus dem Treffer; `null` = kein sicherer Fall, der Treffer bleibt unverändert. */
  replace?: (match: RegExpMatchArray, source: string) => string | null;
}

export interface TransformationOptions {
  /**
   * Abkürzungen mit Landeskürzel, die eindeutig eine Norm oder Einrichtung des Landes bezeichnen (Version 1.1.0,
   * Nutzerauftrag Run 7): amtliche Abkürzungen der Normen des Bestands („MBG Schl.-H.“, „LStVollzG SH“,
   * „GVFG-SH“, „SH AbgG“) und im Text selbst eingeführte Abkürzungen einer Bezeichnung mit dem Landesnamen
   * („… Schleswig-Holstein (LVermGeo SH)“). Nur das abgesetzte Landeskürzel (Leerzeichen oder Bindestrich) wird auf
   * die Zielkonvention „NSH“ übergeleitet – wie West („VwVfG NRW“ → „VwVfG West“). Verschmolzene Formen
   * („SHBesG“, „FINISHG“) sind nicht eindeutig und bleiben unverändert.
   */
  knownStateLawAbbreviations?: ReadonlySet<string>;
}

export const PROTECTED_CATEGORIES = ['source-citation', 'external-name', 'historical-name'] as const;
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

/**
 * Abgesetztes Landeskürzel in einer Abkürzung: „SH“ bzw. „Schl.-H.“ als eigener Teil, getrennt durch Leerzeichen oder
 * Bindestrich – am Anfang („SH-BeamtVG“, „Schl.-H. BHV1-VO“), am Ende („MBG Schl.-H.“) oder, seit 1.2.0, in der Mitte
 * („IZG-SH-KostenVO“, „SoVerm KI SH ErG“, „StBauFR SH 2015“).
 */
export const ABBREVIATION_STATE_MARKER = new RegExp(String.raw`(?:(?<=^|[\s-])SH(?=$|[\s.-])|(?<=^|[\s-])${DOTTED_ABBREVIATION}(?=$|[\s-]))`, 'u');
const MARKER_TOKEN = new RegExp(String.raw`(^|[\s-])(SH|${DOTTED_ABBREVIATION})(?=$|[\s.-])`, 'u');
/** Landeskürzel in beiden Schreibweisen (Kurzform „SH“, Punktform „Schl.-H.“). */
const STATE_MARKER_VARIANTS = String.raw`(?:SH|${DOTTED_ABBREVIATION})`;

/** Enthält die Abkürzung ein abgesetztes Landeskürzel (und ist sie keine Fundstelle)? */
export function isStateAbbreviation(abbreviation: string): boolean {
  const normalized = abbreviation.replace(/\s+/gu, ' ').trim();
  if (normalized.length < 4 || normalized.length > 40) return false;
  if (/^(?:GVOB[lIL]|GOVBl|GVBl|Amtsbl|Amtsblatt|ABl|NB[lL]|MBl|SchlHA|GS|StPOGS|OBl)\b/u.test(normalized)) return false;
  if (/^\d/u.test(normalized) || /\s(?:und|oder|vom|der|des|in|für|nach)\s/u.test(` ${normalized} `)) return false;
  const stem = stateAbbreviationStem(normalized);
  if (stem === undefined) return false;
  // Der Stamm muss eine Abkürzung sein: kein Aktenzeichen („II 32/1200 - 75 SH“), kein Satzrest („Holstein - MBG …“),
  // höchstens drei Teile, jeder Teil mit Großbuchstaben bzw. Ziffern; lange Wörter nur mit mehreren Großbuchstaben.
  if (/[/]|\s[-–]\s|\s[-–]\d/u.test(stem)) return false;
  const tokens = stem.split(' ');
  if (tokens.length > 3) return false;
  const upper = (text: string): number => [...text].filter((character) => /[A-ZÄÖÜ]/u.test(character)).length;
  return /^[A-ZÄÖÜ]/u.test(stem) && tokens.every((token) => /^\d+$/u.test(token) || (/^[A-ZÄÖÜ]/u.test(token) && token.split('-').every((part) => part.length <= 8 || upper(part) >= 2)));
}

/** Abkürzung ohne das (genau einmal vorkommende) abgesetzte Landeskürzel; `undefined`, wenn es fehlt oder mehrfach steht. */
export function stateAbbreviationStem(abbreviation: string): string | undefined {
  const normalized = abbreviation.replace(/\s+/gu, ' ').trim();
  const global = new RegExp(ABBREVIATION_STATE_MARKER.source, 'gu');
  if ([...normalized.matchAll(global)].length !== 1) return undefined;
  const stem = normalized.replace(MARKER_TOKEN, (_, before: string) => (before === ' ' ? ' ' : before)).replace(/^[\s.-]+|[\s-]+$/gu, '').replace(/\s{2,}/gu, ' ').replace(/--+/gu, '-').trim();
  return stem === '' ? undefined : stem;
}

/**
 * Amtliche Kurzbezeichnung mit Landeskürzel aus dem Titel einer Norm („… Schleswig-Holstein (Studienakkreditierungs-
 * verordnung SH)“, 1.2.0): Anders als eine freie Abkürzung darf sie ein langes Wort tragen – der Titel belegt sie als
 * Bezeichnung der Norm. Höchstens vier Wörter, das Kürzel genau einmal, kein Verkündungsblatt, kein Aktenzeichen.
 */
export function isStateShortTitle(value: string): boolean {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length < 4 || normalized.length > 60) return false;
  if (/^(?:GVOB[lIL]|GOVBl|GVBl|Amtsbl|Amtsblatt|ABl|NB[lL]|MBl|SchlHA|GS|StPOGS|OBl)\b/u.test(normalized) || /[/]|\s[-–]\s/u.test(normalized)) return false;
  const stem = stateAbbreviationStem(normalized);
  return stem !== undefined && /^[A-ZÄÖÜ]/u.test(stem) && stem.split(' ').length <= 4 && !/\s(?:und|oder|vom|der|des|in|für|nach)\s/u.test(` ${stem} `);
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Regexquelle einer bekannten Abkürzung: Leerraum flexibel; das Landeskürzel in beiden Schreibweisen und mit Leerzeichen
 * oder Bindestrich abgesetzt – „MBG Schl.-H.“ trifft auch „MBG SH“, „MBG-SH“, „MBG Schl.- H.“. Maßgeblich ist der
 * Abkürzungsstamm („MBG“), die Schreibweise des Kürzels ist Variante.
 */
function abbreviationSource(abbreviation: string): string {
  const normalized = abbreviation.replace(/\s+/gu, ' ').trim();
  const part = (text: string): string => escapeRegExp(text).replace(/ /gu, String.raw`\s*`).replace(/-/gu, String.raw`\s?-\s?`);
  const prefix = /^SH([\s.-])(.+)$/u.exec(normalized);
  if (prefix) return `SH${prefix[1] === '.' ? String.raw`\.` : String.raw`(?:\s?-\s?|\s+)`}${part(prefix[2]!)}`;
  const marker = MARKER_TOKEN.exec(normalized);
  if (!marker) return part(normalized);
  const before = normalized.slice(0, marker.index + marker[1]!.length).replace(/[\s-]+$/u, '');
  const after = normalized.slice(marker.index + marker[0].length).replace(/^[\s-]+/u, '');
  const separator = String.raw`(?:\s?-\s?|\s+)`;
  return `${before ? `${part(before)}${separator}` : ''}${STATE_MARKER_VARIANTS}${after ? `${separator}${part(after)}` : ''}`;
}

/** Setzt in einer Abkürzung das abgesetzte Landeskürzel auf die Zielkonvention („MBG Schl.-H.“ → „MBG NSH“). */
export function targetAbbreviation(abbreviation: string, after = ''): string {
  const dotted = new RegExp(`${DOTTED_ABBREVIATION}$`, 'u').exec(abbreviation);
  if (dotted) return `${abbreviation.slice(0, dotted.index)}${targetShortName()}${SENTENCE_CONTINUATION_AFTER_DOT.test(after) ? '.' : ''}`;
  if (/^SH(?=[\s.-])/u.test(abbreviation)) return `${targetShortName()}${abbreviation.slice(2)}`;
  // Kürzel in der Mitte oder am Anfang in Punktform: genau dieses Vorkommen ersetzen.
  return abbreviation.replace(MARKER_TOKEN, (_, before: string) => `${before}${targetShortName()}`);
}

function stateName(match: RegExpMatchArray): string {
  return `${targetProperName()}${match[1] ?? ''}`;
}

const RULE_CACHE = new WeakMap<ReadonlySet<string>, TransformationRule[]>();

/** Reihenfolge ist Priorität: spezifischere Muster zuerst. Je Abkürzungsmenge einmal gebaut (Zwischenspeicher). */
export function transformationRules(options: TransformationOptions = {}): TransformationRule[] {
  const set = options.knownStateLawAbbreviations;
  if (set) {
    const cached = RULE_CACHE.get(set);
    if (cached) return cached;
    const built = buildTransformationRules(options);
    RULE_CACHE.set(set, built);
    return built;
  }
  return buildTransformationRules(options);
}

function buildTransformationRules(options: TransformationOptions): TransformationRule[] {
  const known = [...new Set([...(options.knownStateLawAbbreviations ?? [])].map((entry) => entry.replace(/\s+/gu, ' ').trim()))].filter((entry) => isStateAbbreviation(entry) || isStateShortTitle(entry)).sort((left, right) => right.length - left.length || left.localeCompare(right));
  const abbreviationRules: TransformationRule[] = known.length === 0 ? [] : [{
    id: 'jurisdiction-abbreviation-known-law',
    // Links genügt eine Wortgrenze gegen Buchstaben: „Abs. 1MBG Schl.-H.“ (fehlendes Leerzeichen der Quelle) trifft.
    pattern: new RegExp(String.raw`(?<![\p{L}.-])(?:${known.map(abbreviationSource).join('|')})(?![\p{L}\d-])`, 'gu'),
    replace: (match, source) => targetAbbreviation(match[0], source.slice((match.index ?? 0) + match[0].length)),
  }];
  return [
    ...abbreviationRules,
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
    id: 'historical-state',
    category: 'historical-name',
    // Nutzerauftrag Run 7 (Regel wie BayWü): Historische Staaten und ihre Organe werden nicht rückwirkend
    // übergeleitet – die preußische „Provinz Schleswig-Holstein“ (1867–1946) samt Provinzialverband,
    // Provinziallandtag und Oberpräsident. Nur fortgeltende heutige Selbstbezüge des Landes werden übergeleitet.
    pattern: new RegExp(String.raw`\b(?:(?:[Pp]reußische[nr]?\s+)?Provinz(?:en)?|Provinzialverband(?:es|s)?|Provinziallandtag(?:es|s)?|Provinzialverwaltung|Oberpräsident(?:en|in)?\s+(?:der|in\s+der)\s+Provinz|Herzogt(?:um|ums|ümer))\s+(?:der\s+|des\s+)?Schleswig${NAME_SEPARATOR}Holstein(?:s)?(?![\p{L}-])`, 'gu'),
    reason: 'Historische Staats- bzw. Verwaltungsbezeichnung (preußische Provinz Schleswig-Holstein) bleibt unverändert',
  },
  {
    id: 'gazette-dotted',
    category: 'source-citation',
    // „GVOBI.“ (großes I statt kleinem l) ist eine Schreibvariante im Quelltext der juris-Ausgabe; ebenso „GVOBl.-Schl.-H.“,
    // „GVOBl Schl.-H.“, „GOVBl.“, „Amtsblatt Schl.-H.“ und „GS Schl.-H.“ (Sammlung des schleswig-holsteinischen Landesrechts).
    // Nachrichtenblätter der Ressorts tragen das Ressortkürzel mit oder ohne Punkt („NBl. MSB. Schl.-H.“, „NBl. HS MBWK Schl.-H.“).
    // „OBl. Schl.-H.“: Rest von „GV-/OBl.“ nach Trennung am Zeilenende (1.2.0). Ohne Blattnamen, aber mit Seitenangabe
    // („(Schl.-H. S. 31)“, „Schl.-H. 2010 S. 415“) ist das Kürzel ebenfalls Teil einer Fundstelle.
    pattern: new RegExp(String.raw`(?:\b(?:GVOB[lIL]|GOVBl|GVBl|Amtsbl|Amtsblatt|ABl|NB[lL]|MBl|SchlHA|GS|StPOGS|OBl)\.?\s*-?\s*(?:[A-ZÄÖÜ]{2,8}\.?\s*){0,2}${DOTTED_ABBREVIATION}(?:\s*(?:\d{4}\s*)?S\.\s*\d+[a-z]?)?|(?<![\p{L}])${DOTTED_ABBREVIATION}\s*(?:\d{4}\s*,?\s*)?S\.\s*\d+[a-z]?)`, 'gu'),
    reason: 'Amtliche Fundstelle des Herkunftslandes (Verkündungs-, Amts- oder Nachrichtenblatt) bleibt unverändert',
  },
  {
    id: 'gazette-short',
    category: 'source-citation',
    pattern: /\b(?:GVOBl|GVBl|Amtsbl|ABl|NBl|MBl)\.\s*SH\b(?:\s*(?:\d{4}\s*)?S\.\s*\d+[a-z]?)?/gu,
    reason: 'Amtliche Fundstelle des Herkunftslandes in Kurzschreibung bleibt unverändert',
  },
  {
    id: 'file-reference',
    category: 'source-citation',
    // Aktenzeichen der Justiz- und Finanzverwaltung: „– V 340 a/5607 – 19 SH –“, „V/430 a/4541 – 3 SH“, „– 1510 E – 61 SH – 5 SH –“,
    // „(II 334/2200 – Arb. – 18 SH)“, „– 065.81-LKN-SH –“ – das „SH“ gehört zum Aktenzeichen.
    // 1.2.0: auch „II 178/ 3200 125g SH –“ (ohne Strich vor der laufenden Nummer) und „– 90 SH – 5 – SH –“.
    pattern: /(?:\/\s?\d{2,5}\s?(?:[–-]\s?)?\d{1,3}\s?[a-z]?\s+SH\b|(?<=[–-]\s?)\d{1,3}\s?[a-z]?\s+SH(?=\s?(?:[–-]|\)|<|$))|(?<=\d\s?[–-]\s?)SH(?=\s?[–-])|\b\d{3}\.\d{2}-[A-Z]{2,5}-SH\b)/gu,
    reason: 'Aktenzeichen der Quelle bleibt unverändert',
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

/**
 * Im Text eingeführte Abkürzungen einer Bezeichnung mit dem Landesnamen – „Landesamt für Vermessung und
 * Geoinformation Schleswig-Holstein (LVermGeo SH)“, „(Mitbestimmungsgesetz Schleswig-Holstein - MBG Schl.-H.)“,
 * „Zentrales IT-Management der Landesregierung Schleswig-Holstein (ZIT SH)“. Nur die unmittelbar folgende Klammer
 * bzw. der Gedankenstrich-Zusatz zählt; die Abkürzung muss ein abgesetztes Landeskürzel tragen.
 */
/**
 * Amtliche Kurzbezeichnungen mit Landeskürzel aus einem Normtitel (1.2.0): Klammerzusätze des Titels („(Studien-
 * akkreditierungsverordnung SH)“, „(Mitbestimmungsgesetz Schleswig-Holstein - MBG Schl.-H.)“), auch der Teil hinter
 * einem Gedankenstrich. Belegt ist nur, was der Titel selbst als Bezeichnung der Norm nennt.
 */
export function titleShortTitles(title: string): Set<string> {
  const found = new Set<string>();
  for (const match of title.replace(/\s+/gu, ' ').matchAll(/\(([^()]{2,80})\)/gu)) {
    for (const part of match[1]!.split(/\s[-–]\s/u)) {
      const value = part.trim();
      if (isStateAbbreviation(value) || isStateShortTitle(value)) found.add(value);
    }
  }
  return found;
}

export function definedStateAbbreviations(texts: readonly string[]): Set<string> {
  const found = new Set<string>();
  const name = String.raw`(?:Schleswig${NAME_SEPARATOR}Holstein(?:s)?|[Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinisch\p{L}*(?:\s+[\p{L}-]+){1,6})`;
  const parenthesized = new RegExp(String.raw`${name}\s*\(\s*(?:[^()]{0,60}?\s[-–]\s)?([^()]{2,40}?)\s*(?:[-–]\s*)?\)`, 'gu');
  const dashed = new RegExp(String.raw`${name}\s[-–]\s([^()]{2,40}?)\s*(?:[-–]\s*)?\)`, 'gu');
  // Kurzbezeichnung in Klammer oder zwischen Gedankenstrichen, deren Satz den Landesnamen vorher nennt
  // („Richtlinie … der schleswig-holsteinischen Landesverwaltung – KfzRL SH –“).
  const introduced = /[(–-]\s*([A-ZÄÖÜ][^()–;,]{1,30}?[\s-](?:SH|Schl\.\s?[-‐-―−]\s?H\.)(?:[\s-][A-ZÄÖÜ\d][^()–;,\s]{0,12}){0,2}|SH[.\s-][A-ZÄÖÜ][^()–;,\s]{1,20})\s*[)–-]/gu;
  const stateBefore = new RegExp(String.raw`Schleswig${NAME_SEPARATOR}Holstein|[Ss]chleswig${NAME_SEPARATOR}[Hh]olsteinisch`, 'u');
  for (const text of texts) {
    const flat = text.replace(/\s+/gu, ' ');
    const add = (candidate: string): void => {
      const value = candidate.trim();
      if (isStateAbbreviation(value) && /^[A-ZÄÖÜ]/u.test(value)) found.add(value);
    };
    for (const match of [...flat.matchAll(parenthesized), ...flat.matchAll(dashed)]) add(match[1]!);
    for (const match of flat.matchAll(introduced)) {
      const start = match.index ?? 0;
      if (stateBefore.test(flat.slice(Math.max(0, start - 200), start))) add(match[1]!);
    }
  }
  return found;
}
