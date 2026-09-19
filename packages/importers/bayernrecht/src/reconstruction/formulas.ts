/**
 * Änderungsformeln: Welcher Befehl ist welche Formel, und welche Formel bestimmt die vorherige Fassung
 * vollständig?
 *
 * Die Formeln sind **aus den tatsächlich vorkommenden Befehlen erhoben** (Clusterung der Befehle aller
 * Kandidaten, siehe `data/audits/bayernrecht/RECONSTRUCTION.md`), nicht aus einem Lehrbuch. Unterstützt
 * ist nur, was an echten Beispielen belegt ist und die vorherige Fassung **vollständig bestimmt**:
 *
 * | Formel | Beispiel | Rückwärts |
 * | --- | --- | --- |
 * | `replace-words` | „In § 31 Abs. 6 Satz 2 wird die Angabe „Nr. 3“ durch die Angabe „Nr. 2“ ersetzt.“ | „Nr. 2“ → „Nr. 3“ |
 * | `insert-words` | „In Art. 6 … wird nach der Angabe „Fahrrads“ die Angabe „oder …“ eingefügt.“ | eingefügten Wortlaut hinter dem Anker entfernen |
 * | `delete-words-anchored` | „In Nr. 3.1.1 Satz 3 wird vor der Angabe „44“ die Angabe „Art.“ gestrichen.“ | Gestrichenes am Anker wieder einsetzen |
 * | `append-words` | „Der Überschrift wird die Angabe „ , Verordnungsermächtigung“ angefügt.“ | angefügten Wortlaut am Ende entfernen |
 * | `replace-final-punctuation` | „In Nr. 13 wird der Punkt am Ende durch ein Komma ersetzt.“ | Schlusszeichen zurücksetzen |
 *
 * Alles andere ist **nicht** rückrechenbar oder wird nicht maschinell angewandt – mit Begründung:
 *
 * - `recast` („… wird wie folgt gefasst:“, „erhält folgende Fassung“): Der Alttext steht nicht im Befehl.
 * - `repeal-unit` („Abs. 3 wird aufgehoben.“): Der Alttext steht nicht im Befehl.
 * - `annex-recast` („erhalten die aus dem Anhang ersichtliche Fassung“): Anlage ohne Alttext.
 * - `delete-words` („In Art. 3 Abs. 6 wird die Angabe „nach dem Stand der Technik“ gestrichen.“): Der
 *   Wortlaut ist bekannt, **die Stelle nicht** – die Streichung lässt keine Spur, an der sich ablesen
 *   ließe, wo er stand. Jede Einfügestelle ergäbe im Rundlauf wieder den heutigen Text; der Rundlauf
 *   beweist hier also nichts.
 * - Strukturelle Befehle (Satz oder Glied einfügen, Umnummerierung, „Der Wortlaut wird Satz 1“, Überschrift einfügen,
 *   Angabe am Ende ersetzen oder streichen) erkennt und wendet `structural.ts` an – nur, wenn das Eingefügte wörtlich
 *   und eindeutig im heutigen Text steht. Was dort nicht eindeutig ist, bleibt `insert-unit` bzw. `renumber` mit Grund.
 * - `replace-by-punctuation` („das Wort „oder“ durch ein Komma ersetzt“): Das Komma ist im Text nicht
 *   eindeutig wiederzufinden; nicht unterstützt.
 * - `unrecognized`: Formel nicht erkannt – im Zweifel ausgeschlossen.
 */
import { formatPath, joinLocation, parseLocation, type LocationPath } from './location.ts';
import type { StructuralOperation } from './structural.ts';

export const FORMULAS = [
  'replace-words',
  'insert-words',
  'delete-words-anchored',
  'append-words',
  'replace-final-punctuation',
  'replace-final-words',
  'delete-final-words',
  'insert-sentence',
  'insert-block',
  'relabel',
  'renumber-sentence',
  'number-sentences',
  'unnumber-sentences',
  'number-paragraph',
  'unnumber-paragraph',
  'insert-title',
  'delete-words',
  'recast',
  'repeal-unit',
  'annex-recast',
  'insert-unit',
  'renumber',
  'replace-by-punctuation',
  'container',
  'unrecognized',
] as const;
export type FormulaId = (typeof FORMULAS)[number];

/** Formeln, deren Rückrechnung dieses Modell ausführt. */
export const SUPPORTED_FORMULAS: ReadonlySet<FormulaId> = new Set([
  'replace-words', 'insert-words', 'delete-words-anchored', 'append-words', 'replace-final-punctuation',
  // Seit der mehrstufigen Rückrechnung, je an echten Befehlen belegt (`structural.ts`):
  'replace-final-words', 'delete-final-words', 'insert-sentence', 'insert-block', 'relabel', 'renumber-sentence', 'number-sentences', 'insert-title',
  // Run 5: Satzzeichen statt Wort, nur wenn das Satzzeichen im Bereich genau einmal steht; „Der Wortlaut wird Abs. 1.“
  'replace-by-punctuation', 'number-paragraph',
  // Lauf 7: „In Satz 1 wird die Satznummerierung „¹“ gestrichen.“; Lauf 8: „… die Absatzbezeichnung „(1)“ gestrichen.“
  'unnumber-sentences', 'unnumber-paragraph',
]);

/** Formeln, die die vorherige Fassung grundsätzlich nicht bestimmen. */
export const NON_INVERTIBLE_FORMULAS: ReadonlySet<FormulaId> = new Set(['recast', 'repeal-unit', 'annex-recast', 'delete-words']);

/** Eine Änderung in Vorwärtsrichtung (vom Stichtagstext zum heutigen Text). */
export type Operation =
  | { kind: 'replace'; from: string; to: string }
  | { kind: 'insert'; anchor: string; side: 'after' | 'before'; text: string }
  | { kind: 'delete-anchored'; anchor: string; side: 'after' | 'before'; text: string }
  | { kind: 'append'; text: string }
  | { kind: 'replace-final'; from: string; to: string }
  /** Strukturelle Operationen (`structural.ts`): Sätze, Glieder, Bezeichnungen, Überschriften, Schluss eines Feldes. */
  | StructuralOperation;

export interface ParsedOperation {
  formula: FormulaId;
  operation: Operation;
  /** Eine oder mehrere Ortsangaben (bei „jeweils“ über mehrere Orte). */
  locations: LocationPath[];
  /** Der Befehl sagt „jeweils“ – jeder Ort muss dann genau ein Vorkommen tragen. */
  each: boolean;
}

/** Streichung ohne Anker: Wortlaut bekannt, Stelle nicht – nur aus dem Stand der Verkündungen wiederherstellbar (`restore.ts`). */
export interface ParsedDeletion {
  formula: 'delete-words';
  words: string[];
  locations: LocationPath[];
  each: boolean;
}

export interface ParsedCommand {
  /** Formeln aller Klauseln des Befehls (für die Statistik). */
  formulas: FormulaId[];
  /** Gesetzt, wenn der Befehl vollständig unterstützt ist. */
  operations?: ParsedOperation[];
  /** Grund, falls nicht unterstützt. */
  reason?: string;
  /**
   * Nur gesetzt, wenn der Befehl bis auf Streichungen ohne Anker vollständig lesbar ist: alle Klauseln in
   * Befehlsreihenfolge. Die Streichungen sind aus der Stammverkündung wiederherstellbar (Lauf 7).
   */
  restorable?: Array<ParsedOperation | ParsedDeletion>;
}

export const isParsedDeletion = (item: ParsedOperation | ParsedDeletion): item is ParsedDeletion => 'words' in item;

/* ------------------------------------------------------------------------------- Zitate */

export interface MaskedText {
  masked: string;
  quotes: string[];
}

const PAIRS: Readonly<Record<string, string>> = { '„': '“', '‚': '‘' };
const ALT_CLOSERS: Readonly<Record<string, string>> = { '“': '”' };

/**
 * Ersetzt Zitate der obersten Ebene durch Platzhalter `⟦n⟧`. Verschachtelte Zitate bleiben Teil des
 * äußeren. `undefined`, wenn die Zitate nicht aufgehen – ein halbes Zitat wird nie gedeutet.
 */
export function maskQuotes(text: string): MaskedText | undefined {
  const quotes: string[] = [];
  let masked = '';
  const stack: string[] = [];
  let current = '';
  for (const character of text) {
    const expected = stack.at(-1);
    if (expected !== undefined && (character === expected || ALT_CLOSERS[expected] === character)) {
      stack.pop();
      if (stack.length === 0) {
        masked += `⟦${quotes.length}⟧`;
        quotes.push(current);
        current = '';
      } else {
        current += character;
      }
      continue;
    }
    if (PAIRS[character] !== undefined) {
      if (stack.length > 0) current += character;
      stack.push(PAIRS[character]!);
      continue;
    }
    if (stack.length > 0) current += character;
    else masked += character;
  }
  if (stack.length > 0) return undefined;
  return { masked, quotes };
}

/* ------------------------------------------------------------------------------ Formeln */

// „die Worte“ / „den Worten“: ältere Befehle (GVBl. 2014 S. 286, 2015 S. 243) – dieselbe Formel wie „die Wörter“.
// „der Klammerzusatz „(A)““ (BayMBl. 2019 Nr. 423) ist eine Angabe.
// Lauf 9: auch „der Betrag“, „die Jahreszahl“, „das Datum“, „die Wortfolge“ (FMBl. 2010 S. 178; BayMBl. 2023 Nr. 513).
const OBJ = String.raw`(?:die\s+Angaben?|das\s+Wort|die\s+Wörter|die\s+Worte|die\s+Zahlen?|das\s+Zeichen|die\s+Zeichen|der\s+Klammerzusatz|den\s+Klammerzusatz|der\s+Betrag|den\s+Betrag|die\s+Beträge|die\s+Jahreszahl|das\s+Datum|die\s+Wortfolge)`;
const ANCHOR_OBJ = String.raw`(?:der\s+Angabe|dem\s+Wort|den\s+Wörtern|den\s+Worten|der\s+Zahl|den\s+Angaben|dem\s+Klammerzusatz|dem\s+Betrag|der\s+Jahreszahl|dem\s+Datum|der\s+Wortfolge)`;
const Q = String.raw`⟦(\d+)⟧`;
const VERB = String.raw`(?:(?:wird|werden)\s+)?`;
const EACH = String.raw`(?:jeweils\s+)?`;
const PUNCT_NAME: Readonly<Record<string, string>> = {
  'der Punkt': '.', 'das Komma': ',', 'das Semikolon': ';', 'der Doppelpunkt': ':', 'der Schlusspunkt': '.',
  'ein Komma': ',', 'einen Punkt': '.', 'ein Semikolon': ';', 'einen Doppelpunkt': ':',
};

const NON_INVERTIBLE_LEAF: ReadonlyArray<[RegExp, FormulaId, string]> = [
  [/ersichtlichen?\s+(?:Fassung|Anlage|Anhang)|aus\s+dem\s+Anhang\s+zu\s+dieser|beigefügten?\s+(?:neuen?\s+)?(?:Anhang|Anlage|Fassung)/u, 'annex-recast', 'Anlage oder Anhang in neuer Fassung aus einer beigefügten Datei; der Alttext steht nicht im Befehl'],
  [/(?:^|\s)(?:wie\s+folgt\s+)?(?:neu\s+)?gefasst\s*[:.]?\s*$/u, 'recast', 'Neufassung; der Alttext steht nicht im Befehl'],
  [/(?:erhält|erhalten)\s+(?:folgende|die\s+folgende)\s+(?:neue\s+)?Fassung\s*[:.]?\s*$/u, 'recast', 'Neufassung; der Alttext steht nicht im Befehl'],
  [/(?:erhält|erhalten)\s+folgenden\s+(?:neuen\s+)?Wortlaut\s*[:.]?\s*$/u, 'recast', 'Neufassung; der Alttext steht nicht im Befehl'],
  [/durch\s+(?:die\s+)?(?:Anlage|Anhang)\s*[\dIVX]*[a-z]?\s+(?:dieser|zu\s+dieser)\s+(?:Bekanntmachung|Verordnung|Richtlinie)\s+ersetzt\.?$/u, 'annex-recast', 'Anlage durch eine beigefügte Anlage ersetzt; der Alttext steht nicht im Befehl'],
  [/(?:wird|werden)\s+wie\s+folgt\s+ersetzt\s*:\s*$/u, 'recast', 'Ersetzung durch neuen Wortlaut ohne Alttext'],
  [/\bdurch\s+(?:(?:den|die|das)\s+)?folgenden?\b[\s\S]*ersetzt\s*:\s*$/u, 'recast', 'Ersetzung durch neuen Wortlaut ohne Alttext'],
  // „Die bisherige Anlage wird durch die folgende Anlage ersetzt.“ (BayMBl. 2024 Nr. 655)
  [/\bdurch\s+(?:die\s+)?folgende\s+(?:Anlage|Anhang)\b[^„]*ersetzt\s*[.:]?\s*$/u, 'annex-recast', 'Anlage durch eine folgende Anlage ersetzt; der Alttext steht nicht im Befehl'],
  // Auch mit dem Glied zwischen Verb und Partizip: „In Spiegelstrich 5 wird Satz 3 aufgehoben.“ (BayMBl. 2021 Nr. 548)
  [/(?:wird|werden)\s+(?:[^„“”⟦:]{1,60}\s)?aufgehoben\s*\.?$/u, 'repeal-unit', 'Aufhebung; der aufgehobene Wortlaut steht nicht im Befehl'],
];

/** Der Befehl ohne Zitate beginnt mit einer Ortsangabe „In …“ / „Im …“ vor dem Verb. */
function splitLocation(masked: string): { location: string; rest: string } {
  const match = /^(?:In|Im)\s+(.+?)\s+((?:wird|werden)\s[\s\S]*)$/u.exec(masked);
  if (match && !/⟦/u.test(match[1]!)) return { location: match[1]!, rest: match[2]! };
  return { location: '', rest: masked };
}

interface ClauseResult {
  formula: FormulaId;
  operations?: Operation[];
  each: boolean;
  reason?: string;
  /** Streichung ohne Anker: die gestrichenen Wortlaute in Reihenfolge. */
  words?: string[];
}

function quote(quotes: readonly string[], index: string): string {
  return quotes[Number(index)]!;
}

/** Eine Klausel („die Angabe ⟦0⟧ durch die Angabe ⟦1⟧ ersetzt“). */
function parseClause(clause: string, quotes: readonly string[]): ClauseResult {
  let text = clause.trim().replace(/^(?:,\s*|und\s+|sowie\s+)/u, '').trim();
  text = text.replace(/^(?:wird|werden)\s+/u, '');
  let each = false;
  if (/^jeweils\s+/u.test(text)) {
    each = true;
    text = text.replace(/^jeweils\s+/u, '');
  }
  if (/\bjeweils\b/u.test(text)) each = true;

  // Ersetzung: ein oder mehrere Paare „⟦a⟧ durch ⟦b⟧“.
  const pair = String.raw`(?:${OBJ}\s+)?${Q}\s+${VERB}${EACH}durch\s+(?:${OBJ}\s+)?${Q}`;
  const replaceClause = new RegExp(String.raw`^${pair}(?:(?:\s*,\s*|\s+und\s+|\s+sowie\s+)${pair})*\s+ersetzt$`, 'u');
  if (replaceClause.test(text)) {
    const operations: Operation[] = [];
    for (const match of text.matchAll(new RegExp(pair, 'gu'))) {
      operations.push({ kind: 'replace', from: quote(quotes, match[1]!), to: quote(quotes, match[2]!) });
    }
    return { formula: 'replace-words', operations, each };
  }

  // „Der Schlusspunkt wird durch ein Komma ersetzt.“ (GVBl. 2014 S. 208) ist „der Punkt am Ende“.
  const final = new RegExp(String.raw`^(der\s+Punkt|das\s+Komma|das\s+Semikolon|der\s+Doppelpunkt|der\s+Schlusspunkt)(?:\s+am\s+(?:Ende(?:\s+des\s+Satzes)?|Satzende)|(?<=Schlusspunkt))\s+${VERB}durch\s+(?:(ein\s+Komma|einen\s+Punkt|ein\s+Semikolon|einen\s+Doppelpunkt)|(?:${OBJ}\s+)?${Q})\s+ersetzt$`, 'u').exec(text);
  if (final) {
    const from = PUNCT_NAME[final[1]!.replace(/\s+/gu, ' ')]!;
    const to = final[2] ? PUNCT_NAME[final[2].replace(/\s+/gu, ' ')]! : quote(quotes, final[3]!);
    return { formula: 'replace-final-punctuation', operations: [{ kind: 'replace-final', from, to }], each };
  }

  // „die Angabe „ .“ am Ende durch die Angabe „oder“ ersetzt“ / „das Wort „oder“ am Ende durch einen Punkt ersetzt“:
  // Die Stelle ist das Ende des Feldes – eindeutig.
  const finalWords = new RegExp(String.raw`^(?:${OBJ}\s+)?${Q}\s+am\s+Ende\s+${VERB}durch\s+(?:(ein\s+Komma|einen\s+Punkt|ein\s+Semikolon|einen\s+Doppelpunkt)|(?:${OBJ}\s+)?${Q})\s+ersetzt$`, 'u').exec(text);
  if (finalWords) {
    const to = finalWords[2] ? PUNCT_NAME[finalWords[2].replace(/\s+/gu, ' ')]! : quote(quotes, finalWords[3]!);
    return { formula: 'replace-final-words', operations: [{ kind: 'replace-final-words', from: quote(quotes, finalWords[1]!), to }], each };
  }
  const finalDelete = new RegExp(String.raw`^(?:(?:${OBJ}\s+)?${Q}|(der\s+Punkt|das\s+Komma|das\s+Semikolon))\s+am\s+Ende\s+${VERB}gestrichen$`, 'u').exec(text);
  if (finalDelete) {
    const removed = finalDelete[1] !== undefined ? quote(quotes, finalDelete[1]) : PUNCT_NAME[finalDelete[2]!.replace(/\s+/gu, ' ')]!;
    return { formula: 'delete-final-words', operations: [{ kind: 'delete-final', text: removed }], each };
  }

  // „In Spiegelstrich 5 wird das Wort „und“ durch ein Komma ersetzt.“ – rückwärts muss das Komma im Bereich genau einmal
  // stehen (sonst Mehrdeutigkeit); das Satzzeichen schließt ohne Leerzeichen an.
  const byPunctuation = new RegExp(String.raw`^(?:${OBJ}\s+)?${Q}\s+${VERB}${EACH}durch\s+(ein\s+Komma|einen\s+Punkt|ein\s+Semikolon)\s+ersetzt$`, 'u').exec(text);
  if (byPunctuation) {
    return { formula: 'replace-by-punctuation', operations: [{ kind: 'replace', from: quote(quotes, byPunctuation[1]!), to: ` ${PUNCT_NAME[byPunctuation[2]!.replace(/\s+/gu, ' ')]!}` }], each };
  }
  if (new RegExp(String.raw`(?:${OBJ}\s+)?${Q}\s+${VERB}durch\s+(?:ein\s+Komma|einen\s+Punkt|ein\s+Semikolon)\s+ersetzt`, 'u').test(text)) {
    return { formula: 'replace-by-punctuation', each, reason: 'Ersetzung durch ein Satzzeichen in einer nicht erkannten Form' };
  }

  const insert = new RegExp(String.raw`^(nach|vor)\s+${ANCHOR_OBJ}\s+${Q}\s+${VERB}${EACH}(?:(?:${OBJ}\s+)${Q}|(ein\s+Komma|ein\s+Semikolon))\s+eingefügt$`, 'u').exec(text);
  if (insert) {
    const inserted = insert[3] !== undefined ? quote(quotes, insert[3]) : PUNCT_NAME[insert[4]!.replace(/\s+/gu, ' ')]!;
    return {
      formula: 'insert-words',
      operations: [{ kind: 'insert', anchor: quote(quotes, insert[2]!), side: insert[1] === 'nach' ? 'after' : 'before', text: inserted }],
      each: each || /jeweils/u.test(text),
    };
  }

  // Mehrere Einfügungen mit je eigenem Anker und einem Schlussverb: „nach der Angabe ⟦0⟧ wird die Angabe ⟦1⟧ und nach
  // der Angabe ⟦2⟧ wird die Angabe ⟦3⟧ eingefügt“ (GVBl. 2025 S. 695). Jede Einfügung wird für sich zurückgenommen.
  const insertPair = String.raw`(nach|vor)\s+${ANCHOR_OBJ}\s+${Q}\s+${VERB}${EACH}${OBJ}\s+${Q}`;
  const insertList = new RegExp(String.raw`^${insertPair}(?:(?:\s*,\s*|\s+und\s+|\s+sowie\s+)${insertPair})+\s+eingefügt$`, 'u');
  if (insertList.test(text)) {
    const operations: Operation[] = [];
    for (const match of text.matchAll(new RegExp(insertPair, 'gu'))) {
      operations.push({ kind: 'insert', anchor: quote(quotes, match[2]!), side: match[1] === 'nach' ? 'after' : 'before', text: quote(quotes, match[3]!) });
    }
    return { formula: 'insert-words', operations, each: each || /jeweils/u.test(text) };
  }

  const anchoredDelete = new RegExp(String.raw`^(nach|vor)\s+${ANCHOR_OBJ}\s+${Q}\s+${VERB}${EACH}(?:(?:${OBJ}\s+)${Q}|(das\s+Komma|der\s+Punkt|das\s+Semikolon))\s+${VERB}gestrichen$`, 'u').exec(text);
  if (anchoredDelete) {
    const removed = anchoredDelete[3] !== undefined ? quote(quotes, anchoredDelete[3]) : PUNCT_NAME[anchoredDelete[4]!.replace(/\s+/gu, ' ')]!;
    return {
      formula: 'delete-words-anchored',
      operations: [{ kind: 'delete-anchored', anchor: quote(quotes, anchoredDelete[2]!), side: anchoredDelete[1] === 'nach' ? 'after' : 'before', text: removed }],
      each: each || /jeweils/u.test(text),
    };
  }

  if (new RegExp(String.raw`^${OBJ}\s+${Q}(?:(?:\s*,\s*|\s+und\s+|\s+sowie\s+)${OBJ}\s+${Q})*\s+${VERB}${EACH}gestrichen$`, 'u').test(text)) {
    const words = [...text.matchAll(/⟦(\d+)⟧/gu)].map((match) => quote(quotes, match[1]!));
    return { formula: 'delete-words', each, reason: 'Streichung ohne Anker: der Wortlaut ist bekannt, die Stelle nicht', words };
  }

  // „werden am Ende die Wörter „…“ angefügt“, „die Wörter „…“ werden angefügt“ (Objekt vor dem Verb).
  const append = new RegExp(String.raw`^(?:am\s+Ende\s+)?${OBJ}\s+${Q}\s+${VERB}(?:am\s+Ende\s+)?angefügt$`, 'u').exec(text);
  if (append) {
    return { formula: 'append-words', operations: [{ kind: 'append', text: quote(quotes, append[1]!) }], each };
  }

  return { formula: 'unrecognized', each, reason: `Klausel nicht erkannt: „${clause.trim().slice(0, 120)}“` };
}

/** Container („Art. 53 wird wie folgt geändert:“) → Ortsangabe, sonst `undefined`. */
export function containerLocation(text: string): string | undefined {
  const match = /^(.+?)\s+(?:wird|werden)\s+wie\s+folgt\s+geändert\s*:\s*$/u.exec(text.trim());
  if (!match) return undefined;
  const location = match[1]!.replace(/^(?:Die|Der|Das)\s+/u, '').trim();
  // „Der bisherige Abs. 2 wird Abs. 4 und wird wie folgt geändert:“ ist eine Umnummerierung, kein Ort.
  if (/(?:^|\s)(?:wird|werden|bisherigen?|und)(?:\s|$)/u.test(location)) return undefined;
  return location;
}

/**
 * Zerlegt einen Befehl (ein Listenglied oder den Ein-Satz-Befehl des Einleitungssatzes) in Operationen.
 * `context` sind die Ortsangaben der übergeordneten Befehle, von außen nach innen.
 */
/** „Folgende Nr. 1.34.2 wir angefügt:“ (BayMBl. 2023 Nr. 327): „wir“ ist nie Subjekt eines Befehls – nur vor einem Befehlsverb. */
export function repairCommandVerb(text: string): string {
  // „gelöscht“ (BayMBl. 2024 Nr. 283: „… wird die Angabe „…“ gelöscht.“) ist „gestrichen“.
  return text
    .replace(/(„[^„“”]*[“”])|\bwir\s+(angefügt|eingefügt|ersetzt|gestrichen|aufgehoben|gefasst|vorangestellt)\b/gu, (match, quoted: string | undefined, verb: string | undefined) => quoted ?? `wird ${verb!}`)
    .replace(/\sgelöscht(\s*\.?\s*)$/u, ' gestrichen$1');
}

export function parseCommand(text: string, context: readonly LocationPath[]): ParsedCommand {
  const trimmed = repairCommandVerb(text.trim());
  if (containerLocation(trimmed) !== undefined) return { formulas: ['container'], reason: 'Gliederungsbefehl ohne eigene Änderung' };
  for (const [pattern, formula, reason] of NON_INVERTIBLE_LEAF) {
    if (pattern.test(trimmed)) return { formulas: [formula], reason };
  }
  if (/(?:eingefügt|angefügt|vorangestellt)\s*:\s*$/u.test(trimmed) || /^(?:Es\s+wird|Es\s+werden)\s+folgender?\b/u.test(trimmed)) {
    return { formulas: ['insert-unit'], reason: 'Einfügung eines ganzen Glieds (Satz, Absatz, Nummer, Überschrift): strukturelle Änderung, von diesem Modell nicht angewandt' };
  }
  const UNIT = String.raw`(?:§§?|Art\.|Abs\.|Nrn?\.|Satz|Sätze|Buchst\.|Teil|Abschnitt|Anlagen?|Absätze)`;
  const renumberPattern = new RegExp(String.raw`^(?:(?:Die|Der|Das)\s+)?${UNIT}\s+[\d.a-z]+(?:\s*(?:,|und|bis)\s*[\d.a-z]+)*\s+(?:wird|werden)\s+(?:zu\s+)?(?:(?:die|den|der)\s+)?${UNIT}\s+[\d.a-z]+(?:\s*(?:,|und|bis)\s*[\d.a-z]+)*(?:\s+und\s+(?:wird\s+)?(?:[\s\S]*\s)?wie\s+folgt\s+geändert\s*:)?\.?$`, 'u');
  if (/^(?:Der|Die|Das)\s+bisherigen?\s/u.test(trimmed) || /^Der\s+Wortlaut\s+wird\s/u.test(trimmed) || renumberPattern.test(trimmed)) {
    return { formulas: ['renumber'], reason: 'Umnummerierung: strukturelle Änderung, von diesem Modell nicht angewandt' };
  }
  // Satznummern und Absatzbezeichnungen sind Gliederung, nicht Wortlaut: „Die Satznummerierung „¹“ wird
  // gestrichen.“, „In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“, „Satz 7 wird Satz 5 und …“.
  if (/Satznummerierung|Absatzbezeichnung/u.test(trimmed) || /^(?:In\s+\S+\s+\S+\s+)?(?:Satz|Abs\.|Nr\.|§|Art\.|Buchst\.)\s*[\d.a-z]+\s+wird\s+(?:zu\s+)?(?:Satz|Abs\.|Nr\.|§|Art\.|Buchst\.)\s*[\d.a-z]+\s*(?:,|und\b)/u.test(trimmed)) {
    return { formulas: ['renumber'], reason: 'Umnummerierung oder Satz-/Absatzbezeichnung: strukturelle Änderung, von diesem Modell nicht angewandt' };
  }
  if (/(?:wird|werden)\s+gestrichen\s*\.?$/u.test(trimmed) && !/[„‚]/u.test(trimmed)) {
    return { formulas: ['repeal-unit'], reason: 'Streichung eines Glieds; der Wortlaut steht nicht im Befehl' };
  }

  // Ein überzähliges schließendes Anführungszeichen am Befehlsende („… ersetzt“.“, BayMBl. 2023 Nr. 632) wird nicht
  // gedeutet: Es kann das Ende eines Zitats sein, in dem der Befehl nur zitiert wird.
  const masked = maskQuotes(trimmed.replace(/\.\s*$/u, ''));
  if (!masked) return { formulas: ['unrecognized'], reason: 'Zitate im Befehl gehen nicht auf' };
  if (/\.\s+[A-ZÄÖÜ]/u.test(masked.masked)) return { formulas: ['unrecognized'], reason: 'Mehrere Sätze in einem Befehl; der Ortsbezug der Folgesätze ist nicht bestimmt' };

  let body = masked.masked.trim();
  let location = '';
  // „Der Überschrift wird die Angabe ⟦0⟧ angefügt.“ / „Dem Spiegelstrich 4 wird …“
  const dative = /^(?:Der|Dem|Den)\s+(.+?)\s+((?:wird|werden)\s+[\s\S]*angefügt)$/u.exec(body);
  if (dative && !/⟦/u.test(dative[1]!)) {
    location = /^Überschrift/u.test(dative[1]!) ? `der ${dative[1]!}` : dative[1]!;
    body = dative[2]!;
  } else {
    const split = splitLocation(body);
    location = split.location;
    body = split.rest;
  }
  // Zweite Ortsangabe hinter dem Verb: „In der Präambel wird in Satz 1 die Angabe ⟦0⟧ gestrichen.“ (BayMBl. 2024 Nr. 69),
  // „In der Präambel werden in Satz 2 nach dem Wort ⟦0⟧ …“ – der Ort ist „Präambel Satz 1“; nur wenn beide zusammen lesbar sind.
  const inner = /^((?:wird|werden)\s+(?:jeweils\s+)?)(?:in|im)\s+([^⟦]+?)\s+(?=(?:die|das|der|den|dem|nach|vor|jeweils)\s)/u.exec(body);
  if (inner && location !== '' && parseLocation(`${location} ${inner[2]!}`)) {
    location = `${location} ${inner[2]!}`;
    body = `${inner[1]!}${body.slice(inner[0].length)}`;
  }
  // Objekt zuerst: „Die Angabe ⟦0⟧ wird durch die Angabe ⟦1⟧ ersetzt.“ / „Nach der Angabe ⟦0⟧ wird …“
  body = body.replace(/^(Die|Das|Der|Nach|Vor)\b/u, (word) => word.toLowerCase());

  const ownPaths = parseLocation(location);
  if (!ownPaths) return { formulas: ['unrecognized'], reason: `Ortsangabe nicht lesbar: „${location}“` };

  // Klauseln an ihren Schlussverben trennen.
  const clauses: string[] = [];
  let rest = body;
  const closer = /\b(ersetzt|eingefügt|gestrichen|angefügt)\b/u;
  while (rest.trim() !== '') {
    const match = closer.exec(rest);
    if (!match) return { formulas: ['unrecognized'], reason: `Befehlsrest ohne Schlussverb: „${rest.trim().slice(0, 80)}“` };
    clauses.push(rest.slice(0, match.index + match[0].length));
    rest = rest.slice(match.index + match[0].length);
  }
  if (clauses.length === 0) return { formulas: ['unrecognized'], reason: 'Kein Befehl erkannt' };

  const formulas: FormulaId[] = [];
  const operations: ParsedOperation[] = [];
  const sequence: Array<ParsedOperation | ParsedDeletion> = [];
  let reason: string | undefined;
  // Grund einer anderen Klausel als einer Streichung ohne Anker: Dann ist der Befehl auch mit Wiederherstellung nicht lesbar.
  let otherReason: string | undefined;
  for (const clause of clauses) {
    const parsed = parseClause(clause, masked.quotes);
    formulas.push(parsed.formula);
    // Pfade: eigene Ortsangabe relativ zum Kontext; mehrere eigene Pfade nur mit „jeweils“.
    const paths = ownPaths.map((own) => joinLocation(context, own));
    // Jeder Ort mit eigener Präposition („In der Überschrift und in § 2 Abs. 5 werden …“, GVBl. 2024 S. 98) zählt
    // die Orte einzeln auf wie „jeweils“; in jedem muss der Wortlaut dann genau einmal stehen.
    const enumerated = /\s(?:und|sowie)\s+(?:in|im)\s/u.test(` ${location} `);
    if (!parsed.operations) {
      reason ??= parsed.reason;
      if (parsed.formula === 'delete-words' && parsed.words && parsed.words.length > 0 && (paths.length === 1 || parsed.each || enumerated)) {
        sequence.push({ formula: 'delete-words', words: parsed.words, locations: paths, each: parsed.each || enumerated });
      } else otherReason ??= parsed.reason ?? 'nicht unterstützt';
      continue;
    }
    // Lauf 9: Mehrere Orte ohne „jeweils“ („In § 13 Abs. 1 und 2 werden nach dem Wort „Finanzen“ die Worte … eingefügt.“,
    // GVBl. 2014 S. 286) gelten je Ort – wie mit „jeweils“: In jedem muss der Wortlaut dann genau einmal stehen.
    const eachPlace = paths.length > 1 && !parsed.each && !enumerated;
    if (parsed.each && paths.length < 2) {
      reason ??= '„jeweils“ an nur einem Ort: der Befehl behauptet mehrere Vorkommen, deren Herkunft im heutigen Text nicht zu unterscheiden ist';
      otherReason ??= reason;
      continue;
    }
    for (const operation of parsed.operations) {
      const item = { formula: parsed.formula, operation, locations: paths, each: parsed.each || eachPlace };
      operations.push(item);
      sequence.push(item);
    }
  }
  if (reason !== undefined || operations.length === 0) {
    const restorable = otherReason === undefined && sequence.some(isParsedDeletion) ? { restorable: sequence } : {};
    return { formulas, reason: reason ?? 'Keine anwendbare Operation', ...restorable };
  }
  return { formulas, operations };
}
