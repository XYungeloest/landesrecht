/**
 * Ortsangaben der Änderungsbefehle („In Art. 48 Abs. 2 Satz 1 …“) und ihre Auflösung im Normkörper.
 *
 * **Die Auflösung ist eine Obermenge, nie eine Vermutung.** Jede Stufe, die sich strukturell belegen lässt
 * (Paragraph, Artikel, Absatz, Nummer, Buchstabe, Spiegelstrich, Satz über die Satznummern), grenzt den
 * Bereich ein. Stufen, die der Körper nicht eigens auszeichnet (Halbsatz, „Satzteil nach …“, Sätze ohne
 * Satznummern in Verwaltungsvorschriften), lassen den Bereich so, wie er ist – der Bereich bleibt dann
 * größer als der zitierte Ort und **enthält** ihn. Weil der zu ändernde Wortlaut im Bereich genau einmal
 * vorkommen muss, macht ein größerer Bereich die Rückrechnung nur strenger, nie unsicherer.
 *
 * Stufen, die der Körper auszeichnet, müssen dagegen **genau einmal** gefunden werden. Fehlt ein zitierter
 * Absatz oder gibt es zwei Paragraphen mit derselben Bezeichnung, scheitert die Auflösung – geraten wird
 * nicht.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

export type StepKind =
  | 'teil'
  | 'abschnitt'
  | 'unterabschnitt'
  | 'anlage'
  | 'paragraph'
  | 'artikel'
  | 'absatz'
  | 'satz'
  | 'halbsatz'
  | 'nummer'
  | 'buchstabe'
  | 'doppelbuchstabe'
  | 'spiegelstrich'
  | 'satzteil-vor'
  | 'satzteil-nach'
  | 'ueberschrift';

export interface LocationStep {
  kind: StepKind;
  value: string;
}

export type LocationPath = LocationStep[];

/** Rangfolge für Aufzählungen („§ 5 Abs. 2 und § 9 Abs. 2 Satz 1“): Ein neuer Schlüssel ersetzt alles ab seinem Rang. */
const RANK: Record<StepKind, number> = {
  teil: 0,
  anlage: 0,
  abschnitt: 1,
  unterabschnitt: 2,
  paragraph: 3,
  artikel: 3,
  absatz: 4,
  satz: 5,
  nummer: 6,
  buchstabe: 7,
  doppelbuchstabe: 8,
  spiegelstrich: 9,
  halbsatz: 10,
  'satzteil-vor': 10,
  'satzteil-nach': 10,
  ueberschrift: 10,
};
const TERMINAL: ReadonlySet<StepKind> = new Set(['halbsatz', 'satzteil-vor', 'satzteil-nach', 'ueberschrift']);

const ORDINALS: Readonly<Record<string, string>> = {
  ersten: '1', zweiten: '2', dritten: '3', vierten: '4', fünften: '5', sechsten: '6', siebten: '7', achten: '8', neunten: '9', zehnten: '10',
  erste: '1', zweite: '2', dritte: '3', vierte: '4', fünfte: '5', sechste: '6', siebte: '7', achte: '8', neunte: '9', zehnte: '10',
  erster: '1', zweiter: '2', dritter: '3', vierter: '4', fünfter: '5', sechster: '6', siebter: '7', achter: '8', neunter: '9', zehnter: '10',
};

const ROMAN: Readonly<Record<string, string>> = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10', XI: '11', XII: '12' };

const VALUE = String.raw`\d+[a-z]?(?:\.\d+[a-z]?)*\.?|[IVX]+|[A-Z]|[a-z]{1,3}`;

interface Token {
  kind: StepKind | 'value' | 'join';
  value: string;
}

/** Zerlegt eine Ortsangabe in Schlüssel, Werte und Verbinder. `undefined` bei unbekannten Wörtern. */
function tokenize(input: string): Token[] | undefined {
  let rest = input
    .replace(/[  ]/gu, ' ')
    .replace(/^(?:In|Im|in|im)\s+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const tokens: Token[] = [];
  // Längere Formen zuerst, und nie mitten im Wort („Teils“ ist nicht „Teil“ + „s“).
  const keyed: Array<[RegExp, StepKind]> = [
    [/^(?:§§|§)\s*/u, 'paragraph'],
    [/^(?:Art\.|Artikeln|Artikels|Artikel)(?![\p{L}])\s*/u, 'artikel'],
    [/^(?:Abs\.|Absätzen|Absätze|Absatzes|Absatz)(?![\p{L}])\s*/u, 'absatz'],
    [/^(?:Sätzen|Sätze|Satzes|Satz)(?![\p{L}])\s*/u, 'satz'],
    [/^(?:Halbsatzes|Halbsatz)(?![\p{L}])\s*/u, 'halbsatz'],
    [/^(?:Nrn\.|Nr\.|Nummern|Nummer)(?![\p{L}])\s*/u, 'nummer'],
    [/^(?:Doppelbuchst\.|Doppelbuchstaben|Doppelbuchstabe)(?![\p{L}])\s*/u, 'doppelbuchstabe'],
    [/^(?:Buchst\.|Buchstaben|Buchstabe)(?![\p{L}])\s*/u, 'buchstabe'],
    [/^(?:Spiegelstrichen|Spiegelstrichs|Spiegelstrich)(?![\p{L}])\s*/u, 'spiegelstrich'],
    [/^(?:Unterabschnitts|Unterabschnitt)(?![\p{L}])\s*/u, 'unterabschnitt'],
    [/^(?:Abschnitts|Abschnitt)(?![\p{L}])\s*/u, 'abschnitt'],
    [/^(?:Teiles|Teils|Teil)(?![\p{L}])\s*/u, 'teil'],
    [/^(?:Anlagen|Anlage)(?![\p{L}])\s*/u, 'anlage'],
  ];
  while (rest !== '') {
    let match: RegExpExecArray | null;
    if ((match = /^(?:der|dem|den|des|die|das)\s+Überschrift(?:\s+(?:des|der|zu))?\s*/u.exec(rest)) || (match = /^Überschrift(?:\s+(?:des|der|zu))?\s*/u.exec(rest))) {
      tokens.push({ kind: 'ueberschrift', value: '' });
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^(?:(?:in\s+)?(?:dem|den|der|im)\s+)?Satzteil(?:en)?\s+(vor|nach)\s+(?:(?:dem|der|den)\s+)?/u.exec(rest))) {
      // „Satzteil vor Nr. 1“, „Satzteil vor dem ersten Spiegelstrich“, „Satzteil nach Nr. 20“
      const direction = match[1] === 'vor' ? 'satzteil-vor' : 'satzteil-nach';
      rest = rest.slice(match[0].length);
      const target = /^((?:Nr\.|Nrn\.|Buchst\.|Spiegelstrich(?:en)?|(?:ersten|zweiten|dritten|letzten)\s+Spiegelstrich|den\s+Spiegelstrichen|Spiegelstrichen)\s*(?:\d+[a-z]?\.?|[a-z])?)\s*/u.exec(rest);
      if (!target) return undefined;
      tokens.push({ kind: direction, value: target[1]!.trim() });
      rest = rest.slice(target[0].length);
      continue;
    }
    if ((match = /^(?:im\s+|in\s+dem\s+|dem\s+|der\s+|den\s+)?(ersten|zweiten|dritten|vierten|fünften|sechsten|siebten|achten|neunten|zehnten|erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte|neunte|zehnte|erster|zweiter|dritter|vierter|fünfter|sechster|siebter|achter|neunter|zehnter)\s+Spiegelstrich(?:s|es)?\s*/u.exec(rest))) {
      tokens.push({ kind: 'spiegelstrich', value: ORDINALS[match[1]!]! });
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^(?:,\s*|und\s+|sowie\s+|(?:in|im|und in|sowie in|und im|sowie im)\s+)/u.exec(rest))) {
      tokens.push({ kind: 'join', value: match[0].trim() });
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^(?:bis)\s+/u.exec(rest))) {
      // „Nr. 6 bis 8“ – ein Bereich ist eine Aufzählung ohne benannte Glieder; nicht unterstützt.
      return undefined;
    }
    let keyedHit = false;
    for (const [pattern, kind] of keyed) {
      const hit = pattern.exec(rest);
      if (!hit) continue;
      rest = rest.slice(hit[0].length);
      // „Buchstabe a)“: die Klammer gehört zur Bezeichnung, nicht zum Wert.
      const value = new RegExp(`^(${VALUE})\\)?(?=\\s|,|$)\\s*`, 'u').exec(rest);
      if (!value) return undefined;
      tokens.push({ kind, value: value[1]!.replace(/\.$/u, '') });
      rest = rest.slice(value[0].length);
      keyedHit = true;
      break;
    }
    if (keyedHit) continue;
    if ((match = new RegExp(`^(${VALUE})(?=\\s|,|$)\\s*`, 'u').exec(rest)) && tokens.at(-1)?.kind === 'join') {
      tokens.push({ kind: 'value', value: match[1]!.replace(/\.$/u, '') });
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^(?:der|des|dem|den|die|das|zu)\s+(?=(?:§|Art\.|Artikel|Anlage|Teil|Abschnitt|Unterabschnitt|Nr\.|Nrn\.|Abs\.|Absätzen|Sätzen|Sätze|Satz|Buchst\.|Spiegelstrich))/u.exec(rest))) {
      // „Überschrift des § 6“ → Genitiv vor dem Bezugsglied; „Satz 7 der Präambel“ bleibt unbekannt.
      rest = rest.slice(match[0].length);
      continue;
    }
    return undefined;
  }
  return tokens;
}

/** Rang des Bezugsglieds eines Satzteils („Nr. 20“ → Nummer, „dem ersten Spiegelstrich“ → Spiegelstrich). */
function satzteilRank(target: string): number {
  if (/^Nrn?\./u.test(target)) return RANK.nummer;
  if (/^Buchst\./u.test(target)) return RANK.buchstabe;
  if (/Spiegelstrich/u.test(target)) return RANK.spiegelstrich;
  return RANK.satz;
}

/**
 * Zerlegt eine Ortsangabe in einen oder mehrere Pfade. `[]` = ganze Norm (keine Ortsangabe);
 * `undefined` = nicht lesbar – dann gibt es keine Rückrechnung.
 */
export function parseLocation(input: string): LocationPath[] | undefined {
  const text = input.trim();
  if (text === '') return [[]];
  const tokens = tokenize(text);
  if (!tokens) return undefined;
  const paths: LocationPath[] = [];
  let current: LocationPath = [];
  let pendingJoin = false;
  // „Überschrift des § 6“: Die Überschrift steht vor ihrem Bezugsglied und wird hinten angehängt.
  let headingPending = false;
  for (const token of tokens) {
    if (token.kind === 'join') {
      // „sowie in“, „und in“: aufeinanderfolgende Verbinder sind ein Verbinder.
      if (pendingJoin) continue;
      if (current.length > 0 || headingPending) {
        if (headingPending) current.push({ kind: 'ueberschrift', value: '' });
        headingPending = false;
        paths.push(current);
      }
      pendingJoin = true;
      continue;
    }
    if (token.kind === 'value') {
      const last = (pendingJoin ? paths.at(-1) : current)?.at(-1);
      if (!last || !pendingJoin || TERMINAL.has(last.kind)) return undefined;
      current = [...paths.at(-1)!.slice(0, -1), { kind: last.kind, value: token.value }];
      pendingJoin = false;
      continue;
    }
    if (token.kind === 'ueberschrift') {
      headingPending = true;
      if (pendingJoin) {
        const base = paths.at(-1) ?? [];
        current = base.filter((step) => !TERMINAL.has(step.kind) && RANK[step.kind] < RANK.paragraph);
        pendingJoin = false;
      }
      continue;
    }
    const kind = token.kind as StepKind;
    if (pendingJoin) {
      const base = paths.at(-1) ?? [];
      const kept: LocationPath = [];
      // „… § 6 Nr. 19 und in dem Satzteil nach Nr. 20“: Der Satzteil gehört zum Glied, das die Nummern
      // trägt – sein Rang ist der Rang dessen, worauf er sich bezieht.
      const rank = kind === 'satzteil-vor' || kind === 'satzteil-nach' ? satzteilRank(token.value) : RANK[kind];
      for (const step of base) {
        if (TERMINAL.has(step.kind) || RANK[step.kind] >= rank) break;
        kept.push(step);
      }
      current = kept;
      pendingJoin = false;
    }
    current.push({ kind, value: token.value });
  }
  if (headingPending) current.push({ kind: 'ueberschrift', value: '' });
  if (pendingJoin) return undefined;
  if (current.length > 0) paths.push(current);
  return paths.length > 0 ? paths : undefined;
}

export const formatPath = (path: LocationPath): string =>
  path.length === 0
    ? '(ganze Norm)'
    : path
        .map((step) => {
          switch (step.kind) {
            case 'paragraph': return `§ ${step.value}`;
            case 'artikel': return `Art. ${step.value}`;
            case 'absatz': return `Abs. ${step.value}`;
            case 'satz': return `Satz ${step.value}`;
            case 'halbsatz': return `Halbsatz ${step.value}`;
            case 'nummer': return `Nr. ${step.value}`;
            case 'buchstabe': return `Buchst. ${step.value}`;
            case 'doppelbuchstabe': return `Doppelbuchst. ${step.value}`;
            case 'spiegelstrich': return `Spiegelstrich ${step.value}`;
            case 'teil': return `Teil ${step.value}`;
            case 'abschnitt': return `Abschnitt ${step.value}`;
            case 'unterabschnitt': return `Unterabschnitt ${step.value}`;
            case 'anlage': return `Anlage ${step.value}`;
            case 'satzteil-vor': return `Satzteil vor ${step.value}`;
            case 'satzteil-nach': return `Satzteil nach ${step.value}`;
            case 'ueberschrift': return 'Überschrift';
          }
        })
        .join(' ');

/* ------------------------------------------------------------------------------ Auflösung */

/** Ein Textfeld des Körpers, adressiert über den Indexpfad der Blöcke. */
export interface FieldRef {
  path: number[];
  key: 'text' | 'title';
}

/** Aufgelöster Bereich: die Textfelder, in denen der Wortlaut genau einmal vorkommen muss. */
export interface ResolvedScope {
  fields: FieldRef[];
  /** Satzeingrenzung über die Satznummern (nur wenn genau ein Feld und die Nummern belegt sind). */
  sentence?: number;
  /** Welche Stufen strukturell belegt, welche nur als Obermenge geführt sind. */
  resolved: string[];
  widened: string[];
}

export type ScopeResult = { ok: true; scope: ResolvedScope } | { ok: false; reason: string };

interface Located {
  block: NormBodyBlock | undefined;
  path: number[];
}

const ROOT: Located = { block: undefined, path: [] };

function childrenOf(located: Located, body: readonly NormBodyBlock[]): readonly NormBodyBlock[] {
  return located.block ? (located.block.children ?? []) : body;
}

/** Alle Nachfahren mit Tiefe, in Dokumentreihenfolge. */
function descendants(located: Located, body: readonly NormBodyBlock[]): Array<{ block: NormBodyBlock; path: number[]; depth: number }> {
  const output: Array<{ block: NormBodyBlock; path: number[]; depth: number }> = [];
  const visit = (blocks: readonly NormBodyBlock[], prefix: number[], depth: number): void => {
    blocks.forEach((block, index) => {
      const path = [...prefix, index];
      output.push({ block, path, depth });
      if (block.children) visit(block.children, path, depth + 1);
    });
  };
  visit(childrenOf(located, body), located.path, 0);
  return output;
}

const normalizeLabel = (value: string | undefined): string => (value ?? '').replace(/[ \s]+/gu, ' ').trim();

function labelMatches(step: LocationStep, block: NormBodyBlock): boolean {
  const label = normalizeLabel(block.label);
  if (label === '') return false;
  const value = step.value;
  const arabic = ROMAN[value] ?? value;
  switch (step.kind) {
    case 'paragraph':
      return label === `§ ${value}` || label === `§${value}`;
    case 'artikel':
      return label === `Art. ${value}` || label === `Artikel ${value}`;
    case 'absatz':
      return label === `(${value})`;
    case 'nummer':
      return label === `${value}.` || label === value || label === `Nr. ${value}`;
    case 'buchstabe':
      return label === `${value})` || label === `${value}.`;
    case 'doppelbuchstabe':
      return label === `${value})`;
    case 'teil':
      return label === `Teil ${value}` || label === `Teil ${arabic}`;
    case 'abschnitt':
      return label === `Abschnitt ${value}` || label === `Abschnitt ${arabic}`;
    case 'unterabschnitt':
      return label === `Unterabschnitt ${value}` || label === `Unterabschnitt ${arabic}`;
    case 'anlage':
      return label === `Anlage ${value}` || label === `Anlage ${arabic}`;
    default:
      return false;
  }
}

/**
 * Eindeutiger Treffer: unter allen Nachfahren die flachste Ebene, auf der die Bezeichnung vorkommt – dort
 * genau einmal. Zwei gleich bezeichnete Glieder auf derselben Ebene sind mehrdeutig.
 */
function findUnique(step: LocationStep, located: Located, body: readonly NormBodyBlock[]): Located | 'missing' | 'ambiguous' {
  const hits = descendants(located, body).filter((entry) => labelMatches(step, entry.block));
  if (hits.length === 0) return 'missing';
  const shallowest = Math.min(...hits.map((hit) => hit.depth));
  const top = hits.filter((hit) => hit.depth === shallowest);
  if (top.length !== 1) return 'ambiguous';
  return { block: top[0]!.block, path: top[0]!.path };
}

const DASH_LABELS = new Set(['–', '-', '—', '•', '·']);

/** n-ter Spiegelstrich: n-tes Kind mit Strichbezeichnung auf der flachsten Ebene, die Striche führt. */
function findDash(step: LocationStep, located: Located, body: readonly NormBodyBlock[]): Located | 'missing' | 'ambiguous' {
  const dashes = descendants(located, body).filter((entry) => DASH_LABELS.has(normalizeLabel(entry.block.label)));
  if (dashes.length === 0) return 'missing';
  const shallowest = Math.min(...dashes.map((entry) => entry.depth));
  const top = dashes.filter((entry) => entry.depth === shallowest);
  // Die Striche einer Ebene müssen Geschwister sein, sonst ist „der dritte Spiegelstrich“ nicht bestimmt.
  const parents = new Set(top.map((entry) => entry.path.slice(0, -1).join('.')));
  if (parents.size !== 1) return 'ambiguous';
  const index = Number(step.value) - 1;
  const hit = top[index];
  return hit ? { block: hit.block, path: hit.path } : 'missing';
}

/** Alle Textfelder eines Bereichs (eigener Text, Überschrift, alle Nachfahren). */
export function fieldsOf(located: Located, body: readonly NormBodyBlock[]): FieldRef[] {
  const fields: FieldRef[] = [];
  if (located.block) {
    if (typeof located.block.title === 'string') fields.push({ path: located.path, key: 'title' });
    if (typeof located.block.text === 'string') fields.push({ path: located.path, key: 'text' });
  }
  for (const entry of descendants(located, body)) {
    if (typeof entry.block.title === 'string') fields.push({ path: entry.path, key: 'title' });
    if (typeof entry.block.text === 'string') fields.push({ path: entry.path, key: 'text' });
  }
  return fields;
}

const LIST_TYPES = new Set(['item', 'subitem']);

/** Satzteil vor der ersten Aufzählung: eigener Text des Blocks und Fließtext vor dem ersten Listenglied. */
function leadingFields(located: Located, body: readonly NormBodyBlock[]): FieldRef[] {
  const fields: FieldRef[] = [];
  if (located.block && typeof located.block.text === 'string') fields.push({ path: located.path, key: 'text' });
  const children = childrenOf(located, body);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (LIST_TYPES.has(child.type) || DASH_LABELS.has(normalizeLabel(child.label))) break;
    if (child.type === 'paragraphText' && typeof child.text === 'string') fields.push({ path: [...located.path, index], key: 'text' });
  }
  return fields;
}

export function blockAt(body: readonly NormBodyBlock[], path: readonly number[]): NormBodyBlock | undefined {
  let blocks: readonly NormBodyBlock[] = body;
  let block: NormBodyBlock | undefined;
  for (const index of path) {
    block = blocks[index];
    if (!block) return undefined;
    blocks = block.children ?? [];
  }
  return block;
}

/** Satznummern (¹, ², … ¹⁰) eines Textes in Reihenfolge; `undefined`, wenn die Folge nicht lückenlos ist. */
export function sentenceMarkers(text: string): Array<{ number: number; start: number; end: number }> | undefined {
  const digits: Readonly<Record<string, string>> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const markers: Array<{ number: number; start: number; end: number }> = [];
  for (const match of text.matchAll(/(?<=^|[\s(„])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=\S)/gu)) {
    const value = Number([...match[1]!].map((character) => digits[character]).join(''));
    if (value !== markers.length + 1) continue;
    markers.push({ number: value, start: match.index!, end: match.index! + match[1]!.length });
  }
  return markers.length === 0 ? undefined : markers;
}

/** Zeichenbereich des Satzes `number` in `text` (samt Satznummer). */
export function sentenceRange(text: string, number: number): { start: number; end: number } | undefined {
  const markers = sentenceMarkers(text);
  if (!markers) return undefined;
  const marker = markers.find((entry) => entry.number === number);
  if (!marker) return undefined;
  const next = markers.find((entry) => entry.number === number + 1);
  return { start: marker.start, end: next ? next.start : text.length };
}

/**
 * Löst einen Pfad im Körper auf. `context` sind die Stufen der übergeordneten Befehle
 * („Art. 53 wird wie folgt geändert:“ → „a) Abs. 2 …“ → „aa) In Satz 3 …“).
 */
export function resolvePath(body: readonly NormBodyBlock[], path: LocationPath): ScopeResult {
  let located: Located = ROOT;
  let sentence: number | undefined;
  let mode: 'all' | 'leading' | 'heading' = 'all';
  const resolved: string[] = [];
  const widened: string[] = [];
  for (const step of path) {
    const label = formatPath([step]);
    if (mode !== 'all') return { ok: false, reason: `Nach „${mode === 'heading' ? 'Überschrift' : 'Satzteil vor'}“ folgt keine weitere Stufe (${label})` };
    switch (step.kind) {
      case 'halbsatz':
      case 'satzteil-nach':
        widened.push(label);
        continue;
      case 'satzteil-vor':
        mode = 'leading';
        resolved.push(label);
        continue;
      case 'ueberschrift':
        if (!located.block) return { ok: false, reason: 'Überschrift der Norm selbst: gehört zu den Metadaten, nicht zum Körper' };
        if (typeof located.block.title !== 'string') return { ok: false, reason: `${label}: das Glied führt keine Überschrift` };
        mode = 'heading';
        resolved.push(label);
        continue;
      case 'satz': {
        const own = located.block?.text;
        const markers = own === undefined ? undefined : sentenceMarkers(own);
        if (!markers) {
          // Ohne Satznummern (Verwaltungsvorschriften, Absätze mit nur einem Satz) bleibt der Bereich, wie er ist.
          widened.push(label);
          continue;
        }
        if (sentence !== undefined) return { ok: false, reason: `${label}: zweite Satzangabe` };
        const number = Number(step.value);
        if (!markers.some((marker) => marker.number === number)) return { ok: false, reason: `${label}: Satz im Text nicht nummeriert vorhanden` };
        // Die Eingrenzung auf den Satz gilt nur für den eigenen Text; Kinder (Nummern) gehören zum Satz davor.
        if ((located.block?.children ?? []).length > 0) {
          widened.push(label);
          continue;
        }
        sentence = number;
        resolved.push(label);
        continue;
      }
      case 'spiegelstrich': {
        const hit = findDash(step, located, body);
        if (hit === 'missing') return { ok: false, reason: `${label} nicht gefunden` };
        if (hit === 'ambiguous') return { ok: false, reason: `${label} nicht eindeutig` };
        located = hit;
        resolved.push(label);
        continue;
      }
      default: {
        const hit = findUnique(step, located, body);
        if (hit === 'ambiguous') return { ok: false, reason: `${label} mehrfach vorhanden` };
        if (hit === 'missing') {
          // Absätze ohne Absatzbezeichnung (Verwaltungsvorschriften): Bereich bleibt als Obermenge.
          if (step.kind === 'absatz' && !descendants(located, body).some((entry) => /^\(\d+[a-z]?\)$/u.test(normalizeLabel(entry.block.label)))) {
            widened.push(label);
            continue;
          }
          return { ok: false, reason: `${label} nicht gefunden` };
        }
        // Ein bezeichnetes, aber leeres Glied („6.6“ ohne Text, der Text steht als Geschwister dahinter):
        // Der Bereich bleibt beim Elternglied – eine Obermenge, keine Vermutung über die Zugehörigkeit.
        if (fieldsOf(hit, body).length === 0) {
          const parentPath = hit.path.slice(0, -1);
          located = parentPath.length === 0 ? ROOT : { block: blockAt(body, parentPath), path: parentPath };
          widened.push(`${label} (leeres Glied, Text beim Elternglied)`);
          continue;
        }
        located = hit;
        resolved.push(label);
      }
    }
  }
  let fields: FieldRef[];
  if (mode === 'heading') fields = [{ path: located.path, key: 'title' }];
  else if (mode === 'leading') fields = leadingFields(located, body);
  else fields = fieldsOf(located, body);
  if (sentence !== undefined) {
    fields = located.block && typeof located.block.text === 'string' ? [{ path: located.path, key: 'text' }] : [];
  }
  if (fields.length === 0) return { ok: false, reason: `${formatPath(path)}: kein Textfeld im Bereich` };
  return { ok: true, scope: { fields, ...(sentence !== undefined ? { sentence } : {}), resolved, widened } };
}
