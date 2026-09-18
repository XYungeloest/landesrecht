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
  | 'ueberschrift'
  /** Vorbemerkung, Einleitung, Präambel: der unbezeichnete Text vor dem ersten bezeichneten Glied (Verwaltungsvorschriften). */
  | 'vorspann'
  /** Tabellenzeile über den Schlüssel in ihrer ersten Zelle („in der Zeile der Kennziffer 821“, GVBl. 2025 S. 178). */
  | 'zeile'
  /** Tabellenspalte einer Zeile, 1-basiert („Spalte 6“). */
  | 'spalte';

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
  vorspann: 3,
  zeile: 6,
  spalte: 7,
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
    .replace(/^(?:In|Im|in|im|Dem|Der|Den|Die|Das)\s+/u, '')
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
  // „Satz 1 der Vorbemerkung“: Der Satz steht vor seinem Bezugsglied.
  const vorspannFirst = /^(?:Satz|Sätze)\s+(\d+)\s+(?:der|in\s+der)\s+(?:Vorbemerkung|Einleitung|Präambel)$/u.exec(rest);
  if (vorspannFirst) return [{ kind: 'vorspann', value: '' }, { kind: 'satz', value: vorspannFirst[1]! }];
  while (rest !== '') {
    let match: RegExpExecArray | null;
    // „Im Wortlaut vor Buchst. a“ = Satzteil vor Buchst. a; „Im Wortlaut“ allein = der Text des Glieds (keine Stufe).
    if ((match = /^(?:dem\s+)?Wortlaut\s+vor\s+/u.exec(rest))) {
      rest = `Satzteil vor ${rest.slice(match[0].length)}`;
      continue;
    }
    if ((match = /^(?:dem\s+)?Wortlaut(?![\p{L}])\s*/u.exec(rest)) && tokens.length === 0) {
      rest = rest.slice(match[0].length);
      if (rest === '') return tokens;
      continue;
    }
    if ((match = /^(?:der\s+|die\s+)?(?:Vorbemerkung|Einleitung|Präambel)(?![\p{L}])\s*/u.exec(rest))) {
      tokens.push({ kind: 'vorspann', value: '' });
      rest = rest.slice(match[0].length);
      continue;
    }
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
    // „Zeile der Kennziffer 821“, „Spalte 6“ (Tabellen in Anlagen, GVBl. 2025 S. 178)
    if ((match = /^(?:(?:in\s+)?der\s+)?Zeile\s+(?:der|mit\s+der)\s+Kennziffer\s+(\d+[a-z]?)(?=\s|,|$)\s*/u.exec(rest))) {
      tokens.push({ kind: 'zeile', value: match[1]! });
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^(?:(?:in\s+)?der\s+)?Spalte\s+(\d+)(?=\s|,|$)\s*/u.exec(rest))) {
      tokens.push({ kind: 'spalte', value: match[1]! });
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
      // „Der Anlage wird folgende Nr. 19 angefügt“ (GVBl. 2025 S. 272): die einzige, unnummerierte Anlage.
      if (!value && kind === 'anlage' && (rest === '' || /^(?:Nr\.|Nrn\.|Abs\.|Satz|Buchst\.|Abschnitt|Teil|Zeile|Spalte)(?![\p{L}])/u.test(rest))) {
        tokens.push({ kind, value: '' });
        keyedHit = true;
        break;
      }
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
  // „Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage“: Die Anlage im Genitiv ist das äußerste Glied.
  for (const path of paths) {
    const at = path.findIndex((step) => step.kind === 'anlage');
    if (at > 0 && path.slice(0, at).every((step) => step.kind === 'teil' || step.kind === 'abschnitt' || step.kind === 'unterabschnitt' || step.kind === 'nummer')) path.unshift(...path.splice(at, 1));
  }
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
            case 'anlage': return step.value === '' ? 'Anlage' : `Anlage ${step.value}`;
            case 'satzteil-vor': return `Satzteil vor ${step.value}`;
            case 'satzteil-nach': return `Satzteil nach ${step.value}`;
            case 'ueberschrift': return 'Überschrift';
            case 'vorspann': return 'Vorbemerkung';
            case 'zeile': return `Zeile ${step.value}`;
            case 'spalte': return `Spalte ${step.value}`;
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
      if (value === '') return label === 'Anlage';
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

/**
 * Nummer oder Buchstabe als Tabellenzeile (Art. 6 Abs. 6 BayRKG: „1. | Kraftwagens | 0,25 €,“; BayMBl. 2025 Nr. 286:
 * „k)⏎Arbeitsgericht Würzburg: | 13 Kammern“): Die Aufzählung ist als Tabelle gesetzt, die erste Zelle beginnt mit
 * dem Gliederungszeichen. Genau eine Zeile im Bereich muss es tragen.
 */
function tableRowNumber(step: LocationStep, located: Located, body: readonly NormBodyBlock[]): Located | 'missing' | 'ambiguous' {
  const mark = step.kind === 'nummer' ? `${step.value}.` : `${step.value})`;
  const starts = (text: string): boolean => {
    const cell = text.trim();
    return cell === mark || (cell.startsWith(mark) && /^\s/u.test(cell.slice(mark.length)));
  };
  const rows = descendants(located, body).filter((entry) => entry.block.type === 'tableRow' && typeof entry.block.children?.[0]?.text === 'string' && starts(entry.block.children[0].text));
  if (rows.length === 0) return 'missing';
  if (rows.length !== 1) return 'ambiguous';
  return { block: rows[0]!.block, path: rows[0]!.path };
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
  const marker = markers?.find((entry) => entry.number === number);
  if (markers && marker) {
    const next = markers.find((entry) => entry.number === number + 1);
    return { start: marker.start, end: next ? next.start : text.length };
  }
  // Fließtext, der nicht mit Satz 1 beginnt („⁴… ⁵…“ hinter einer Aufzählung): Die Nummer muss genau einmal an einem
  // Satzanfang stehen; der Satz reicht bis zur nächsten Satznummer.
  const all = [...text.matchAll(/(?<=^|[\s(„])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=\S)/gu)].map((match) => ({ value: Number([...match[1]!].map((character) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(character)).join('')), start: match.index! }));
  const hits = all.filter((entry) => entry.value === number);
  if (hits.length !== 1 || all[0]!.value > number) return undefined;
  const next = all.find((entry) => entry.start > hits[0]!.start);
  return { start: hits[0]!.start, end: next ? next.start : text.length };
}

/**
 * Löst einen Pfad im Körper auf. `context` sind die Stufen der übergeordneten Befehle
 * („Art. 53 wird wie folgt geändert:“ → „a) Abs. 2 …“ → „aa) In Satz 3 …“).
 */
export function resolvePath(body: readonly NormBodyBlock[], path: LocationPath): ScopeResult {
  let located: Located = ROOT;
  let sentence: number | undefined;
  let mode: 'all' | 'leading' | 'heading' | 'vorspann' = 'all';
  const resolved: string[] = [];
  const widened: string[] = [];
  for (const step of path) {
    if (step.kind === 'vorspann') {
      if (located.block || mode !== 'all') return { ok: false, reason: 'Vorbemerkung nur auf oberster Ebene' };
      mode = 'vorspann';
      widened.push('Vorbemerkung (unbezeichneter Text vor dem ersten bezeichneten Glied)');
      continue;
    }
    if (mode === 'vorspann' && step.kind === 'satz') {
      widened.push(formatPath([step]));
      continue;
    }
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
          // Ein Glied ohne eigenen Text, dessen Wortlaut als einziges Textglied darunter steht (BayMBl.: „4.2.2
          // Überschrift“ – „¹… ²… ³…“): Trägt genau ein unbezeichnetes Textglied die Satznummer, ist es der Satz.
          if (own === undefined && sentence === undefined && located.block) {
            const number = Number(step.value);
            const texts = (located.block.children ?? []).map((child, index) => ({ child, index })).filter(({ child }) => child.type === 'paragraphText' && !child.label && typeof child.text === 'string');
            const carrying = texts.filter(({ child }) => sentenceMarkers(child.text!) !== undefined && sentenceRange(child.text!, number) !== undefined);
            if (carrying.length === 1 && texts.length === 1) {
              located = { block: carrying[0]!.child, path: [...located.path, carrying[0]!.index] };
              sentence = number;
              resolved.push(`${label} (einziges Textglied)`);
              continue;
            }
          }
          // Ohne Satznummern (Verwaltungsvorschriften, Absätze mit nur einem Satz) bleibt der Bereich, wie er ist.
          widened.push(label);
          continue;
        }
        if (sentence !== undefined) return { ok: false, reason: `${label}: zweite Satzangabe` };
        const number = Number(step.value);
        if (!markers.some((marker) => marker.number === number)) {
          // Nach einer Aufzählung setzt der Absatz im Fließtext fort („⁴…“ hinter Nr. 1 bis 3): genau ein unbezeichnetes
          // Textglied des Absatzes trägt die Satznummer.
          const rest = (located.block?.children ?? []).map((child, index) => ({ child, index })).filter(({ child }) => child.type === 'paragraphText' && typeof child.text === 'string' && sentenceRange(child.text, number) !== undefined);
          if (rest.length !== 1 || sentence !== undefined) return { ok: false, reason: `${label}: Satz im Text nicht nummeriert vorhanden` };
          located = { block: rest[0]!.child, path: [...located.path, rest[0]!.index] };
          sentence = number;
          resolved.push(`${label} (Absatzrest hinter der Aufzählung)`);
          continue;
        }
        // Die Eingrenzung auf den Satz gilt nur für den eigenen Text; Kinder (Nummern) gehören zum Satz davor.
        if ((located.block?.children ?? []).length > 0) {
          widened.push(label);
          continue;
        }
        sentence = number;
        resolved.push(label);
        continue;
      }
      case 'zeile': {
        const rows = descendants(located, body).filter((entry) => entry.block.type === 'tableRow' && typeof entry.block.children?.[0]?.text === 'string' && entry.block.children[0].text.replace(/\s+/gu, ' ').trim() === step.value);
        if (rows.length !== 1) return { ok: false, reason: `${label}: ${rows.length === 0 ? 'keine' : 'mehrere'} Tabellenzeilen mit diesem Schlüssel in der ersten Zelle` };
        located = { block: rows[0]!.block, path: rows[0]!.path };
        resolved.push(label);
        continue;
      }
      case 'spalte': {
        const cells = located.block?.type === 'tableRow' ? (located.block.children ?? []) : [];
        const index = Number(step.value) - 1;
        const cell = cells[index];
        if (!cell || !/^table(?:Header)?Cell$/u.test(cell.type as string)) return { ok: false, reason: `${label}: keine Zelle ${step.value} in der Tabellenzeile` };
        located = { block: cell, path: [...located.path, index] };
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
          const row = step.kind === 'nummer' || step.kind === 'buchstabe' ? tableRowNumber(step, located, body) : 'missing';
          if (row === 'ambiguous') return { ok: false, reason: `${label} mehrfach vorhanden (Tabellenzeilen)` };
          if (row !== 'missing') {
            located = row;
            resolved.push(`${label} (Tabellenzeile mit Nummer in der ersten Zelle)`);
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
  if (mode === 'vorspann') {
    // Oberste Ebene bis zum ersten bezeichneten Glied, ohne den Normkopf (`heading`) – eine Obermenge der Vorbemerkung.
    fields = [];
    for (let index = 0; index < body.length; index += 1) {
      const block = body[index]!;
      if (normalizeLabel(block.label) !== '' || (block.type as string) === 'section' || (block.type as string) === 'part') break;
      if (block.type === 'heading') continue;
      fields.push(...fieldsOf({ block, path: [index] }, body));
    }
  } else if (mode === 'heading') fields = [{ path: located.path, key: 'title' }];
  else if (mode === 'leading') fields = leadingFields(located, body);
  else fields = fieldsOf(located, body);
  if (sentence !== undefined) {
    fields = located.block && typeof located.block.text === 'string' ? [{ path: located.path, key: 'text' }] : [];
  }
  if (fields.length === 0) return { ok: false, reason: `${formatPath(path)}: kein Textfeld im Bereich` };
  return { ok: true, scope: { fields, ...(sentence !== undefined ? { sentence } : {}), resolved, widened } };
}

/* ---------------------------------------------------------------------- Glieder als Blöcke */

export type BlockResult = { ok: true; path: number[]; resolved: string[]; widened: string[] } | { ok: false; reason: string };

/**
 * Löst einen Pfad bis zu einem **Glied** (Block) auf – für strukturelle Befehle (Einfügen, Umnummerieren), die ein
 * Glied und nicht einen Wortlaut treffen. Nur Stufen, die der Körper auszeichnet; jede muss genau einmal gefunden
 * werden. Satz-, Halbsatz- und Satzteilangaben sind hier nicht zulässig. Ein leerer Pfad ist die Norm selbst
 * (`path: []`).
 */
export function locateBlock(body: readonly NormBodyBlock[], path: LocationPath): BlockResult {
  let located: Located = ROOT;
  const resolved: string[] = [];
  const widened: string[] = [];
  for (const step of path) {
    const label = formatPath([step]);
    // Ein Satz ist kein Glied des Körpers; Nummern „in Satz 2“ hängen am Absatz. Der Bereich bleibt Obermenge.
    if (step.kind === 'satz' || step.kind === 'halbsatz') {
      widened.push(label);
      continue;
    }
    if (step.kind === 'satzteil-vor' || step.kind === 'satzteil-nach' || step.kind === 'ueberschrift') return { ok: false, reason: `${label}: kein Glied` };
    const hit = step.kind === 'spiegelstrich' ? findDash(step, located, body) : findUnique(step, located, body);
    if (hit === 'ambiguous') return { ok: false, reason: `${label} mehrfach vorhanden` };
    if (hit === 'missing') {
      if (step.kind === 'absatz' && !descendants(located, body).some((entry) => /^\(\d+[a-z]?\)$/u.test(normalizeLabel(entry.block.label)))) {
        widened.push(label);
        continue;
      }
      return { ok: false, reason: `${label} nicht gefunden` };
    }
    located = hit;
    resolved.push(label);
  }
  return { ok: true, path: located.path, resolved, widened };
}

/** Passt die Bezeichnung eines Blocks zu einer Gliedangabe? (für strukturelle Befehle) */
export function blockLabelMatches(block: NormBodyBlock, step: LocationStep): boolean {
  return step.kind === 'spiegelstrich' ? DASH_LABELS.has(normalizeLabel(block.label)) : labelMatches(step, block);
}

/**
 * Bezeichnung eines Glieds in der Schreibweise, die der Körper für ein gleichartiges Glied führt: aus „(3)“ wird
 * für den Wert 4 „(4)“, aus „§ 5“ „§ 6“, aus „3.“ „4.“, aus „a)“ „b)“. `undefined`, wenn die Schreibweise nicht
 * eindeutig übertragbar ist (römische Zählung, fremde Form).
 */
export function relabel(existing: string | undefined, step: LocationStep, value: string): string | undefined {
  const label = normalizeLabel(existing);
  if (!labelMatches(step, { type: 'paragraph', label })) return undefined;
  if (/[IVX]/u.test(step.value) || /[IVX]/u.test(value)) return undefined;
  switch (step.kind) {
    case 'absatz':
      return `(${value})`;
    case 'paragraph':
      return label.startsWith('§ ') ? `§ ${value}` : `§${value}`;
    case 'artikel':
      return label.startsWith('Artikel ') ? `Artikel ${value}` : `Art. ${value}`;
    case 'nummer':
      return label.startsWith('Nr. ') ? `Nr. ${value}` : label.endsWith('.') ? `${value}.` : value;
    case 'buchstabe':
    case 'doppelbuchstabe':
      return label.endsWith(')') ? `${value})` : `${value}.`;
    case 'teil':
    case 'abschnitt':
    case 'unterabschnitt':
    case 'anlage': {
      const prefix = label.replace(/\s+\S+$/u, '');
      return `${prefix} ${value}`;
    }
    default:
      return undefined;
  }
}

/**
 * Alle Glieder mit der Bezeichnung `step` auf der flachsten Ebene unter `context` (für die Unterscheidung
 * gleich bezeichneter Glieder über ihren Wortlaut – etwa ein neu eingefügtes „3.“ neben dem bisherigen „3.“,
 * bevor dieses umnummeriert ist). `undefined`, wenn der Kontext nicht eindeutig auflösbar ist.
 */
export function blockCandidates(body: readonly NormBodyBlock[], context: LocationPath, step: LocationStep): number[][] | undefined {
  const base = locateBlock(body, context);
  if (!base.ok) return undefined;
  const located: Located = base.path.length === 0 ? ROOT : { block: blockAt(body, base.path), path: base.path };
  const hits = descendants(located, body).filter((entry) => labelMatches(step, entry.block));
  if (hits.length === 0) return [];
  const shallowest = Math.min(...hits.map((hit) => hit.depth));
  return hits.filter((hit) => hit.depth === shallowest).map((hit) => hit.path);
}
