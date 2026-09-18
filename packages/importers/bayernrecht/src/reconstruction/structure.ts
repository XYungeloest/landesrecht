/**
 * Vom Einheitenstrom einer Verkündung zum **Befehlsblock** einer bestimmten Norm.
 *
 * Eine Verkündung kann viele Normen ändern (Mantelgesetz, Anpassungsverordnung). Für die Rückrechnung
 * zählt genau der Abschnitt, der die Zielnorm ändert: der **Einleitungssatz** („Die Verordnung X vom …,
 * die zuletzt durch … geändert worden ist, wird wie folgt geändert:“) und die ihm folgenden Befehle bis
 * zum nächsten Abschnitt.
 *
 * Der Einleitungssatz wird über das Zitat der Norm gefunden – mit denselben strukturierten Merkmalen, die
 * auch das Ereignisregister zulässt (Gliederungsnummer, Abkürzung, Ausfertigungsdatum, Fundstelle,
 * vollständiger Titel). Ein Zitat, auf das „… geändert worden ist“ folgt, ist nie Gegenstand eines
 * Befehls. **Findet sich der Einleitungssatz nicht genau einmal, gibt es keinen Block** – es wird nicht
 * der wahrscheinlichste genommen.
 */
import { parseLongGermanDate } from '../events/resolve.ts';
import type { GazetteUnit } from './gazette.ts';

/** Identität der Zielnorm, wie der heutige Portalbestand sie führt. */
export interface NormIdentity {
  documentId: string;
  title: string;
  abbreviations: string[];
  bayRsNumber?: string;
  /** Ausfertigungsdatum (ISO). */
  documentDate?: string;
  /** Datum der Bekanntmachung der Neufassung (ISO), wenn die Norm „in der Fassung der Bekanntmachung“ zitiert wird. */
  versionDate?: string;
  /** Fundstellen der Norm selbst (`GVBl. S. 496`, `AllMBl. S. 695`, `JMBl. 2002 S. 10`). */
  references: string[];
}

export interface CommandNode {
  unit: GazetteUnit;
  /** Gliederungszeichen ohne einleitendes Anführungszeichen. */
  label?: string;
  /** Gliederungstiefe relativ zum Einleitungssatz (1 = erste Befehlsebene). */
  depth: number;
  text: string;
  /** Einheiten mit dem einzufügenden oder neu zu fassenden Wortlaut (Blockzitat hinter „…:“). */
  quoted: GazetteUnit[];
  children: CommandNode[];
}

export interface CommandBlock {
  /** Einleitungssatz (volltextlich, wie er in der Verkündung steht). */
  intro: GazetteUnit;
  /** Das Zitat der Norm im Einleitungssatz. */
  citation: NormCitation;
  /** Befehlstext des Einleitungssatzes ohne Zitat und ohne Änderungshistorie. */
  introCommand: string;
  /** Wortlaut vor dem Zitat („In § 37 Abs. 2 Satzteil nach Nr. 2 der“). */
  introPrefix: string;
  /** Die Klausel „…, die zuletzt durch … geändert worden ist“, falls vorhanden. */
  priorAmendmentClause?: string;
  /** Überschrift des Abschnitts (`§ 2 Änderung des …`), falls die Verkündung gegliedert ist. */
  section?: string;
  /** Ort aus einem ungegliederten Zwischensatz („§ 1 wird wie folgt geändert:“), gilt für alle Befehle. */
  introScope?: string;
  commands: CommandNode[];
  /** Alle Einheiten des Blocks einschließlich des Einleitungssatzes (für Beleg und Prüfsumme). */
  units: GazetteUnit[];
}

export type BlockFailure =
  | { code: 'intro-not-found'; detail: string }
  | { code: 'intro-ambiguous'; detail: string }
  | { code: 'structure-unreadable'; detail: string };

const normalizeTitleKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[„“”"‚‘’']/gu, '')
    .replace(/[\u2010-\u2015\u2212]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();

/** Verkündungsblätter, deren Fundstellen ein Normzitat trägt. */
const GAZETTE = '(?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl|MABl|StAnz|LUMBl|KMBl|BayVBl)';

/** `GVBl. S. 496` → `gvbl||496`; `JMBl. 2002 S. 10` → `jmbl|2002|10`; `BayMBl. Nr. 472` → `baymbl||472`. */
export function referenceKey(value: string): string | undefined {
  // „KWMBl. I S. 194“: Die Teilangabe (I, II) gehört zum Blatt, nicht zur Seite.
  const match = new RegExp(`(${GAZETTE})\\.?\\s*(?:[IV]{1,3}\\s+)?(\\d{4})?\\s*(?:S\\.|Nr\\.)\\s*(\\d+)`, 'u').exec(value);
  if (!match) return undefined;
  return `${match[1]!.toLowerCase()}|${match[2] ?? ''}|${match[3]}`;
}

/** Alle Fundstellen einer Klammer (`GVBl. S. 410, 764, BayRS …` → nur die erste Seite zählt). */
export function referencesIn(value: string): string[] {
  return [...value.matchAll(new RegExp(`${GAZETTE}\\.?\\s*(?:[IV]{1,3}\\s+)?(?:\\d{4}\\s*)?(?:S\\.|Nr\\.)\\s*\\d+`, 'gu'))].map((match) => match[0]);
}

function referencesMatch(left: string, right: string): boolean {
  const a = referenceKey(left);
  const b = referenceKey(right);
  if (!a || !b) return false;
  const [organA, yearA, pageA] = a.split('|');
  const [organB, yearB, pageB] = b.split('|');
  return organA === organB && pageA === pageB && (yearA === '' || yearB === '' || yearA === yearB);
}

/**
 * Ein Normzitat im Verkündungstext: Ausfertigungsteil („vom 27. Dezember 1991“) und Fundstellenklammer
 * („(GVBl. S. 496, BayRS 404-1-J)“), oder die bereinigte Fassung („in der in der Bayerischen
 * Rechtssammlung (BayRS 300-2-3-J) veröffentlichten bereinigten Fassung“).
 *
 * Eigens statt `events/classify.ts#scanCitations`: Der Einleitungssatz ist der Anker jeder Rückrechnung,
 * und er muss auch dort gefunden werden, wo das Register ihn nicht braucht – Aktenzeichen zwischen Datum
 * und Klammer („vom 7. Oktober 2019, Az. A1-7130-1/94 (BayMBl. Nr. 424)“), ältere Blätter (`MABl.`).
 */
export interface NormCitation {
  /** Beginn des Ausfertigungsteils („vom …“ bzw. „in der in der …“). */
  anchorStart: number;
  /** Ende der Fundstellenklammer (bzw. der Wendung „… bereinigten Fassung“). */
  end: number;
  /** Text vor dem Ausfertigungsteil (Titel, Abkürzung, Ortsangabe). */
  head: string;
  date?: string;
  parenthetical: string;
  bayRsNumber?: string;
  references: string[];
  abbreviation?: string;
  /** Zitiert „in der Fassung der Bekanntmachung vom …“ (Neubekanntmachung) statt der Stammfassung. */
  versionForm: boolean;
  /** „… in der in der Bayerischen Rechtssammlung … veröffentlichten bereinigten Fassung“. */
  consolidatedForm: boolean;
}

const DATED_CITATION = new RegExp(
  // Aktenzeichen zwischen Datum und Fundstelle, mit oder ohne „Az.“ („vom 4. Dezember 2019, A1-7141-1/37 (BayMBl. 2020 Nr. 4)“).
  `vom\\s+(\\d{1,2}\\.\\s*[A-Za-zÄÖÜäöü]+\\s+\\d{4})(?:\\s*,\\s*(?:Az\\.[^()]{0,80}?|[A-Z0-9][A-Za-z0-9.]*(?:[-/][A-Za-z0-9.]+){1,6}))?\\s*\\(([^()]*)\\)`,
  'gu',
);
const CONSOLIDATED_CITATION = /in\s+der\s+in\s+der\s+Bayerischen\s+Rechtssammlung\s+\(([^()]*)\)\s+veröffentlichten\s+bereinigten\s+Fassung/gu;

export function normCitations(text: string): NormCitation[] {
  const found: NormCitation[] = [];
  const build = (anchorStart: number, end: number, parenthetical: string, date: string | undefined, consolidatedForm: boolean): void => {
    const rawHead = text.slice(Math.max(0, anchorStart - 400), anchorStart);
    const versionForm = /in\s+der\s+Fassung\s+der\s+(?:Bekanntmachung|Neubekanntmachung)\s*$/u.test(rawHead);
    const head = rawHead.replace(/\s*in\s+der\s+Fassung\s+der\s+(?:Bekanntmachung|Neubekanntmachung)\s*$/u, '').trimEnd();
    const bayRs = /BayRS\s*([0-9A-Za-zÄÖÜäöü]+(?:[.\-/][0-9A-Za-zÄÖÜäöü]+)*)/u.exec(parenthetical)?.[1];
    const abbreviationRaw = /\(([^()]{1,60})\)\s*$/u.exec(head)?.[1];
    const abbreviation = abbreviationRaw?.replace(/[\u2010-\u2015\u2212]/gu, '-').split(/\s+-\s+/u).at(-1)?.trim();
    found.push({
      anchorStart,
      end,
      head,
      ...(date ? { date } : {}),
      parenthetical,
      ...(bayRs ? { bayRsNumber: bayRs } : {}),
      references: referencesIn(parenthetical),
      ...(abbreviation && !/\s/u.test(abbreviation) ? { abbreviation } : {}),
      versionForm,
      consolidatedForm,
    });
  };
  for (const match of text.matchAll(DATED_CITATION)) {
    build(match.index!, match.index! + match[0].length, match[2]!, parseLongGermanDate(match[1]!), false);
  }
  for (const match of text.matchAll(CONSOLIDATED_CITATION)) {
    build(match.index!, match.index! + match[0].length, match[1]!, undefined, true);
  }
  return found.sort((left, right) => left.anchorStart - right.anchorStart);
}

/** Welche Merkmale des Zitats stimmen mit der Zielnorm überein? */
export function citationMatches(cited: NormCitation, identity: NormIdentity): string[] {
  const matched: string[] = [];
  if (identity.bayRsNumber && cited.bayRsNumber && cited.bayRsNumber.replace(/\s+/gu, '') === identity.bayRsNumber.replace(/\s+/gu, '')) matched.push('bayrs');
  if (cited.abbreviation && identity.abbreviations.includes(cited.abbreviation)) matched.push('abbreviation');
  if (cited.date && (cited.date === identity.documentDate || cited.date === identity.versionDate)) matched.push('date');
  if (cited.references.some((reference) => identity.references.some((own) => referencesMatch(own, reference)))) matched.push('reference');
  const title = normalizeTitleKey(identity.title);
  if (title.length >= 8 && normalizeTitleKey(cited.head).endsWith(title)) matched.push('title');
  return matched;
}

/**
 * Starke Übereinstimmung: zwei unabhängige Merkmale, eines davon Datum oder Gliederungsnummer. Ein
 * Titel oder eine Abkürzung allein genügt nie.
 */
export function isStrongMatch(matched: readonly string[]): boolean {
  const others = matched.filter((entry) => entry !== 'date' && entry !== 'bayrs');
  if (matched.includes('date')) return others.length > 0 || matched.includes('bayrs');
  if (matched.includes('bayrs')) return others.length > 0;
  return false;
}

const PRIOR_CLAUSE = /^\s*,?\s*(?:die|das|der|welche[rs]?)\s+(?:zuletzt\s+)?durch\s+([\s\S]{0,600}?)\s+(?:geändert|neu\s+gefasst)\s+worden\s+(?:ist|sind)\s*,?/u;
/** Kurzform der Verwaltungsvorschriften: „…, zuletzt geändert durch Bekanntmachung vom … (BayMBl. Nr. 895)“. */
const PRIOR_CLAUSE_SHORT = /^\s*,?\s*(?:zuletzt\s+)?geändert\s+(?:durch|mit)\s+([^()]{0,200}\([^()]*\))\s*,?/u;
/** Unvollständig gesetzt: „…, die zuletzt durch Bekanntmachung vom … (BayMBl. Nr. 941), wird wie folgt geändert:“ (ohne „geändert worden ist“). */
const PRIOR_CLAUSE_UNFINISHED = /^\s*,?\s*(?:die|das|der)\s+(?:zuletzt\s+)?durch\s+([^()]{0,200}\([^()]*\))\s*,\s*(?=(?:wird|werden)\s)/u;

/**
 * Befehlsform für die **Erkennung** (nie für Wortlaut oder Rezept): Ein Zeilenumbruch mit Trennstrich mitten im
 * Befehlsverb („wird wie folgt ge- ändert:“, GVBl. 2023 S. 626) wird zusammengezogen.
 */
export const commandForm = (text: string): string => text.replace(/\bge-\s+ändert\b/gu, 'geändert');

/** Label ohne einleitendes Anführungszeichen. */
const cleanLabel = (label: string | undefined): string | undefined => label?.replace(/^[„‚"]+/u, '').trim() || undefined;

const OPENERS = /[„‚]/gu;
const CLOSERS = /[“”‘]/gu;

function quoteBalance(value: string): number {
  return (value.match(OPENERS)?.length ?? 0) - (value.match(CLOSERS)?.length ?? 0);
}

/**
 * Satzfehler: ein Zitat „… mit geradem Anführungszeichen geschlossen („… eingefordert."“, BayMBl. 2024 Nr. 474; „„- … -"“,
 * BayMBl. 2025 Nr. 233). Nur am Ende der Einheit und nur, wenn es das einzige gerade Anführungszeichen ist.
 */
const asciiClose = (unit: GazetteUnit): boolean => (unit.text.match(/"/gu)?.length ?? 0) === 1 && /"\s*[.;,]?\s*$/u.test(unit.text);

const startsQuoted = (unit: GazetteUnit): boolean => /^[„‚]/u.test(unit.label ?? '') || /^[„‚]/u.test(unit.text);

/** Ebene eines Befehls: GVBl. über `EBENE<n>`, BayMBl. über Punktgliederung, sonst über die Zeichenform. */
function depthOf(unit: GazetteUnit, introLabel: string | undefined): number | undefined {
  const ebene = /\bEBENE(\d)/u.exec(unit.className)?.[1];
  if (ebene) return Number(ebene);
  const label = cleanLabel(unit.label);
  if (!label) return undefined;
  if (introLabel && /^\d+(?:\.\d+)*\.?$/u.test(introLabel) && /^\d+(?:\.\d+)+\.?$/u.test(label)) {
    const base = introLabel.replace(/\.$/u, '');
    if (!label.startsWith(`${base}.`)) return undefined;
    return label.replace(/\.$/u, '').split('.').length - base.split('.').length;
  }
  if (/^\d+[a-z]?\.$/u.test(label)) return 1;
  // Dezimal gegliederte Befehle unter einem Einleitungssatz ohne Nummer (BayMBl. 2023 Nr. 647: „§ 1“ – „2. Nr. 2.2 wird
  // wie folgt geändert:“ – „2.1 In der Überschrift …“): Ebene = Zahl der Glieder; das Präfix prüft `blockFromCandidate`.
  if (!introLabel && /^\d+(?:\.\d+)+\.?$/u.test(label)) return label.replace(/\.$/u, '').split('.').length;
  if (/^[a-z]\)$/u.test(label)) return 2;
  if (/^([a-z])\1\)$/u.test(label)) return 3;
  if (/^([a-z])\1\1\)$/u.test(label)) return 4;
  return undefined;
}

/** Abschnittsüberschrift (`§ 2 Änderung des …`, `Art. 3`) vor der Einheit. */
function sectionHeading(units: readonly GazetteUnit[], index: number): string | undefined {
  for (let at = index - 1; at >= 0; at -= 1) {
    const unit = units[at]!;
    if (unit.heading && /^(?:§|Art\.|Artikel)\s*\d+/u.test(unit.text)) return unit.text;
  }
  return undefined;
}

/** Anführungstiefe an einer Stelle des Textes (0 = außerhalb jedes Zitats). */
function quoteDepthAt(text: string, position: number): number {
  return Math.max(0, quoteBalance(text.slice(0, position)));
}

/**
 * Der Befehl hinter einem Zitat: Text nach der Fundstellenklammer ohne die Klausel „…, die zuletzt durch
 * … geändert worden ist,“. `undefined`, wenn kein Befehlsverb folgt – dann ist das Zitat nicht Gegenstand
 * eines Befehls (etwa die Ermächtigungsgrundlage oder die Änderungshistorie selbst).
 */
export function commandAfterCitation(text: string, cited: NormCitation): { command: string; priorClause?: string } | undefined {
  if (quoteDepthAt(text, cited.anchorStart) > 0) return undefined;
  // Aktenzeichen hinter der Fundstelle („(BayMBl. 2023 Nr. 354), Az. G4-7271-1/1387, wird …“) gehört zum Zitat.
  const after = commandForm(text.slice(cited.end)).replace(/^\s*,\s*Az\.\s*[^,()]{1,60}(?=,)/u, '');
  if (/^[\s,]*(?:zuletzt\s+)?(?:geändert|aufgehoben|ersetzt|eingefügt|angefügt|neu\s+gefasst)\s+worden\s+(?:ist|sind)/u.test(after)) return undefined;
  const prior = PRIOR_CLAUSE.exec(after) ?? PRIOR_CLAUSE_SHORT.exec(after) ?? PRIOR_CLAUSE_UNFINISHED.exec(after);
  const command = (prior ? after.slice(prior[0].length) : after.replace(/^\s*,?\s*/u, '')).trim();
  const verbFirst = /^(?:wird|werden|erhält|erhalten)(?![\p{L}])/u.test(command);
  // „In Teil 1 … der Anlage **wird** in der Zeile … der AufbewV …, die zuletzt …, die Angabe „X“ durch …
  // ersetzt.“ – das Verb steht vor dem Zitat, hinter ihm nur noch das Objekt.
  const verbBefore = /(?:^|\s)(?:wird|werden)\s/u.test(text.slice(0, cited.anchorStart));
  const objectFirst = verbBefore && /^(?:die|das|der)\s+(?:Angabe|Angaben|Wörter|Wort|Zahl|Zahlen)\s[\s\S]*(?:ersetzt|gestrichen|eingefügt)\.?$/u.test(command);
  // „Gemäß … wird Nr. 1.3 Satz 3 der BeVBek … vom … (…), die zuletzt … geändert worden ist, wie folgt geändert:“ (BayMBl. 2026 Nr. 58).
  const listAfter = verbBefore && /^wie\s+folgt\s+geändert\s*:$/u.test(command);
  if (listAfter) return { command, ...(prior ? { priorClause: prior[1]!.trim() } : {}) };
  if (!verbFirst && !objectFirst) return undefined;
  // Ein Änderungsbefehl ändert: „… werden die anliegenden Vordrucke bekannt gemacht“ ist keiner.
  if (!/(?:geändert|ersetzt|eingefügt|angefügt|gestrichen|aufgehoben|gefasst|Fassung|vorangestellt)(?![\p{L}])/u.test(command)) return undefined;
  return { command, ...(prior ? { priorClause: prior[1]!.trim() } : {}) };
}

/** Ist die Einheit ein Einleitungssatz (Zitat einer Norm mit anschließendem Befehl)? */
function isIntroLike(unit: GazetteUnit): boolean {
  return normCitations(unit.text).some((cited) => commandAfterCitation(unit.text, cited) !== undefined);
}

/** Alle Normzitate der Seite, auf die ein Änderungsbefehl folgt – Grundlage der Seitwärtsprüfung der Kette. */
export function amendingCitations(units: readonly GazetteUnit[]): Array<{ unit: GazetteUnit; citation: NormCitation }> {
  const found: Array<{ unit: GazetteUnit; citation: NormCitation }> = [];
  for (const unit of units) {
    if (unit.heading) continue;
    for (const citation of normCitations(unit.text)) if (commandAfterCitation(unit.text, citation) !== undefined) found.push({ unit, citation });
  }
  return found;
}

export interface IntroCandidate {
  unit: GazetteUnit;
  citation: NormCitation;
  matched: string[];
}

/** Alle Einleitungssätze der Seite, deren Zitat die Zielnorm stark bezeichnet und einen Befehl trägt. */
export function introCandidates(units: readonly GazetteUnit[], identity: NormIdentity): IntroCandidate[] {
  const found: IntroCandidate[] = [];
  for (const unit of units) {
    if (unit.heading) continue;
    for (const cited of normCitations(unit.text)) {
      if (commandAfterCitation(unit.text, cited) === undefined) continue;
      const matched = citationMatches(cited, identity);
      if (isStrongMatch(matched)) found.push({ unit, citation: cited, matched });
    }
  }
  return found;
}

/**
 * Schwach bezeichnete Einleitungssätze – nur für eine Seite, die ein **amtlicher Verweis** (Vollzitat der Norm oder
 * Einleitungssatz einer jüngeren Änderung) als Änderung genau dieser Norm nennt. Dann genügt ein Merkmal, das die
 * Norm selbst trägt: Ausfertigungsdatum oder BayRS-Nummer – der Titel kann sich durch dieselbe Änderung geändert
 * haben, die Fundstelle kann mit Druckfehler gesetzt sein („AIIMBl.“). Kein Widerspruch darf bestehen: eine andere
 * BayRS-Nummer, eine andere Fundstelle bei beiderseits gelesenen Fundstellen oder ein anderes Datum schließen aus.
 * Verwendet wird das Ergebnis nur, wenn es **genau einen** solchen Satz gibt (`walk.ts`).
 */
export function weakIntroCandidates(units: readonly GazetteUnit[], identity: NormIdentity): IntroCandidate[] {
  const found: IntroCandidate[] = [];
  for (const unit of units) {
    if (unit.heading) continue;
    for (const cited of normCitations(unit.text)) {
      if (commandAfterCitation(unit.text, cited) === undefined) continue;
      const matched = citationMatches(cited, identity);
      if (isStrongMatch(matched) || !(matched.includes('date') || matched.includes('bayrs'))) continue;
      const bayRsConflict = Boolean(identity.bayRsNumber && cited.bayRsNumber && cited.bayRsNumber.replace(/\s+/gu, '') !== identity.bayRsNumber.replace(/\s+/gu, ''));
      const referenceConflict = identity.references.length > 0 && cited.references.length > 0 && !matched.includes('reference');
      const dateConflict = Boolean(cited.date && identity.documentDate && cited.date !== identity.documentDate && cited.date !== identity.versionDate);
      if (bayRsConflict || referenceConflict || dateConflict) continue;
      found.push({ unit, citation: cited, matched });
    }
  }
  return found;
}

/**
 * Ortsangabe vor dem Normtitel im Einleitungssatz: „In § 37 Abs. 2 Satzteil nach Nr. 2 der
 * Zuständigkeitsverordnung (ZustV) …“ → „In § 37 Abs. 2 Satzteil nach Nr. 2“. Der Titel selbst gehört
 * nicht dazu; er endet am Artikel („der“, „des“), der ihn einleitet. Kein Strukturverweis → leer.
 */
export function locationPrefix(head: string): string {
  const text = head.replace(/^\(\d+[a-z]?\)\s*/u, '').trim();
  // Auch der Dativ und der Artikel am Satzanfang („Dem Art. 5 des …“, „Die Anlage 1 der …“): Der Ort darf nie
  // verloren gehen – sonst würden die Befehle in der ganzen Norm statt im genannten Glied gesucht.
  const match = /^((?:(?:In|Im|Dem|Der|Den|Die|Das)\s+)?(?:(?:der|dem|den)\s+)?(?:Überschrift|Inhaltsübersicht|Inhaltsverzeichnis|§§?|Art\.|Artikel|Anlage|Anlagen|Abschnitt|Teil|Nr\.|Nrn\.|Abs\.|Satz|Anhang)[\s\S]*?)\s+(?:der|des|zur|zum|zu)\s+[\p{Lu}„]/u.exec(text);
  return match ? match[1]!.trim() : '';
}

/**
 * Der Befehlsblock für die Zielnorm. Scheitert ausdrücklich, statt zu raten:
 * kein Einleitungssatz → `intro-not-found`; mehr als einer → `intro-ambiguous`.
 */
export function commandBlock(units: readonly GazetteUnit[], identity: NormIdentity): CommandBlock | BlockFailure {
  const candidates = introCandidates(units, identity);
  const distinctUnits = [...new Set(candidates.map((candidate) => candidate.unit.index))];
  if (distinctUnits.length === 0) return { code: 'intro-not-found', detail: 'Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl' };
  if (distinctUnits.length > 1 || candidates.length > 1) {
    return { code: 'intro-ambiguous', detail: `${candidates.length} Zitate der Norm mit Änderungsbefehl (Einheiten ${distinctUnits.join(', ')}); mehrere Änderungsabschnitte in einer Verkündung werden nicht zusammengeführt` };
  }
  return blockFromCandidate(units, candidates[0]!);
}

/**
 * Alle Befehlsblöcke der Seite für die Zielnorm, je Einleitungssatz einer, in Seitenreihenfolge – mit dem
 * Abschnitt, in dem sie stehen. Eine Verkündung kann dieselbe Norm in mehreren Abschnitten ändern („§ 1
 * Änderung …“, „§ 2 Weitere Änderung …“, jeweils mit eigenem Inkrafttreten); welcher Block gemeint ist,
 * entscheidet die Kette (`walk.ts`) über den zitierten Abschnitt, nie die Wahrscheinlichkeit.
 * Mehrere Zitate in **einer** Einheit bleiben mehrdeutig.
 */
export function commandBlocks(units: readonly GazetteUnit[], identity: NormIdentity): { blocks: CommandBlock[]; failures: BlockFailure[] } {
  const candidates = introCandidates(units, identity);
  const byUnit = new Map<number, IntroCandidate[]>();
  for (const candidate of candidates) byUnit.set(candidate.unit.index, [...(byUnit.get(candidate.unit.index) ?? []), candidate]);
  const blocks: CommandBlock[] = [];
  const failures: BlockFailure[] = [];
  if (candidates.length === 0) failures.push({ code: 'intro-not-found', detail: 'Kein Einleitungssatz zitiert die Norm mit einem Änderungsbefehl' });
  for (const [index, list] of [...byUnit].sort((left, right) => left[0] - right[0])) {
    if (list.length > 1) {
      failures.push({ code: 'intro-ambiguous', detail: `Einheit ${index} zitiert die Norm ${list.length}-mal mit Änderungsbefehl` });
      continue;
    }
    const block = blockFromCandidate(units, list[0]!);
    if (isBlockFailure(block)) failures.push(block);
    else blocks.push(block);
  }
  return { blocks, failures };
}

/** Befehlsblock zu einem bestimmten Einleitungssatz. */
export function blockFromCandidate(units: readonly GazetteUnit[], candidate: IntroCandidate): CommandBlock | BlockFailure {
  const { unit: intro, citation } = candidate;
  const parsedCommand = commandAfterCitation(intro.text, citation)!;
  const introCommand = parsedCommand.command;
  // Steht das Verb vor dem Zitat („Gemäß …, wird Nr. 1.3 Satz 3 der …“), beginnt die Ortsangabe hinter dem Verb.
  const beforeAnchor = intro.text.slice(0, citation.anchorStart);
  const verbAt = Math.max(beforeAnchor.lastIndexOf(' wird '), beforeAnchor.lastIndexOf(' werden '));
  const introPrefix = locationPrefix(beforeAnchor) || (verbAt >= 0 ? locationPrefix(beforeAnchor.slice(verbAt).replace(/^\s*(?:wird|werden)\s+/u, '')) : '');
  const section = sectionHeading(units, intro.index);

  const blockUnits: GazetteUnit[] = [intro];
  const commands: CommandNode[] = [];
  /** Ort, den ein ungegliederter Zwischensatz („§ 1 wird wie folgt geändert:“) allen Befehlen voranstellt. */
  let introScope: string | undefined;
  // „… wird wie folgt geändert.“ (Punkt statt Doppelpunkt, GVBl. 2025 S. 298) nur, wenn gegliederte Befehle folgen.
  const nextUnit = units[intro.index + 1];
  const opensList = /wie\s+folgt\s+geändert\s*:\s*$/u.test(commandForm(intro.text))
    || (/wie\s+folgt\s+geändert\s*\.\s*$/u.test(commandForm(intro.text)) && nextUnit !== undefined && !nextUnit.heading && /^(?:\d+\.|[a-z]\))$/u.test(cleanLabel(nextUnit.label) ?? ''));
  if (opensList) {
    const introLabel = cleanLabel(intro.label);
    const stack: CommandNode[] = [];
    let quoteOwner: CommandNode | undefined;
    let balance = 0;
    const isContainer = (node: CommandNode | undefined): boolean => node !== undefined && /:\s*$/u.test(node.text);
    for (let at = intro.index + 1; at < units.length; at += 1) {
      const unit = units[at]!;
      if (quoteOwner) {
        quoteOwner.quoted.push(unit);
        blockUnits.push(unit);
        balance += quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        if (balance === 1 && asciiClose(unit)) balance = 0;
        if (balance <= 0) quoteOwner = undefined;
        continue;
      }
      const last = stack.at(-1);
      // Eine zitierte Überschrift ist im BayMBl. als Überschriftelement gesetzt („Der Nr. 1 wird folgende Überschrift
      // vorangestellt:“ – h3 „„Teil 1 Bayerischer Demenzfonds“.“, BayMBl. 2025 Nr. 391): Sie gehört zum Zitat des Befehls.
      if (unit.heading && startsQuoted(unit) && last && last.quoted.length === 0 && /:\s*$/u.test(last.text)) {
        last.quoted.push(unit);
        blockUnits.push(unit);
        balance = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        if (balance > 0) quoteOwner = last;
        continue;
      }
      if (unit.heading) break;
      // Tabellenkopf und -zellen hinter einem Befehl mit Doppelpunkt („… werden die folgenden Zeilen eingefügt:“) gehören
      // zum Zitat, auch wenn die erste Zelle nicht mit dem Anführungszeichen beginnt (GVBl. 2025 S. 21, 2026 S. 151).
      if ((unit.tag === 'th' || unit.tag === 'td') && last && /:\s*$/u.test(last.text)) {
        last.quoted.push(unit);
        blockUnits.push(unit);
        balance += quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        if (balance > 0) quoteOwner = last;
        continue;
      }
      if (startsQuoted(unit) && last && last.quoted.length === 0 && ANNOUNCES_QUOTE.test(last.text)) {
        // „Nach Nr. 1.2 wird folgende Nr. 1.3 angefügt.“ – Punkt statt Doppelpunkt, das Zitat folgt (BayMBl. 2025 Nr. 398).
        last.quoted.push(unit);
        blockUnits.push(unit);
        balance = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        if (balance === 1 && asciiClose(unit)) balance = 0;
        if (balance > 0) quoteOwner = last;
        continue;
      }
      if (startsQuoted(unit) && last && last.quoted.length === 0 && !/[.:]\s*$/u.test(last.text)) {
        // Ein Befehl über mehrere Einheiten: „In Nr. 6 werden die Wörter“ – „„…““ – „durch die Wörter“ – „„…““ –
        // „ersetzt.“ (BayMBl. 2024 Nr. 72). Die Teile werden in Reihenfolge zum Befehlstext zusammengesetzt.
        let text = `${last.text} ${unit.label ? `${unit.label} ` : ''}${unit.text}`;
        let open = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        blockUnits.push(unit);
        while (at + 1 < units.length) {
          const next = units[at + 1]!;
          if (next.heading || (open <= 0 && (cleanLabel(next.label) !== undefined || /[.:]\s*$/u.test(text)))) break;
          at += 1;
          text = `${text} ${next.label ? `${next.label} ` : ''}${next.text}`;
          open += quoteBalance(`${next.label ?? ''} ${next.text}`);
          blockUnits.push(next);
        }
        if (open !== 0) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: Zitat in einem über mehrere Einheiten gesetzten Befehl nicht geschlossen` };
        last.text = text;
        continue;
      }
      if (startsQuoted(unit)) {
        if (!last || !/:\s*$/u.test(last.text)) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: Zitat ohne vorangehenden Befehl mit Doppelpunkt` };
        last.quoted.push(unit);
        blockUnits.push(unit);
        balance = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
        if (balance === 1 && asciiClose(unit)) balance = 0;
        if (balance > 0) quoteOwner = last;
        continue;
      }
      // Listenförmige Verkündung (BayMBl.): „2. Diese Bekanntmachung tritt … in Kraft.“ steht auf der
      // Ebene des Einleitungssatzes und beendet den Block.
      if (introLabel && /^\d+\.$/u.test(introLabel) && /^\d+\.$/u.test(cleanLabel(unit.label) ?? '') && unit.tag === intro.tag) break;
      if (cleanLabel(unit.label) === undefined && !/\bEBENE\d/u.test(unit.className)) {
        // Ungegliederter Satz: entweder ein Ortszusatz direkt nach dem Einleitungssatz, oder das einzige
        // Glied eines Befehls „… wird wie folgt geändert:“, oder das Ende des Blocks.
        if (stack.length === 0 && commands.length === 0 && introScope === undefined && /^(.+?)\s+(?:wird|werden)\s+wie\s+folgt\s+geändert\s*:\s*$/u.test(unit.text)) {
          introScope = /^(.+?)\s+(?:wird|werden)\s+wie\s+folgt\s+geändert\s*:\s*$/u.exec(unit.text)![1]!;
          blockUnits.push(unit);
          continue;
        }
        const parent = stack.find((node, position) => position === stack.length - 1 && isContainer(node)) ?? (stack.length >= 2 && stack.at(-1)!.unit.label === undefined && isContainer(stack.at(-2)) ? stack.at(-2) : undefined);
        if (stack.length === 0 && commands.length === 0) {
          const node: CommandNode = { unit, depth: 1, text: unit.text, quoted: [], children: [] };
          commands.push(node);
          stack.push(node);
          blockUnits.push(unit);
          continue;
        }
        if (!parent) break;
        while (stack.at(-1) !== parent) stack.pop();
        const node: CommandNode = { unit, depth: parent.depth + 1, text: unit.text, quoted: [], children: [] };
        parent.children.push(node);
        stack.push(node);
        blockUnits.push(unit);
        continue;
      }
      const depth = depthOf(unit, introLabel);
      if (depth === undefined || depth < 1) break;
      // Eine neue Norm im selben Abschnitt beendet den Block (Anpassungsverordnungen mit „(1) … (2) …“).
      if (depth === 1 && isIntroLike(unit)) break;
      const node: CommandNode = { unit, ...(cleanLabel(unit.label) ? { label: cleanLabel(unit.label)! } : {}), depth, text: unit.text, quoted: [], children: [] };
      while (stack.length > 0 && stack.at(-1)!.depth >= depth) stack.pop();
      const parent = stack.at(-1);
      if (parent) {
        if (depth !== parent.depth + 1) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: Gliederungssprung von Ebene ${parent.depth} auf ${depth}` };
        const decimal = /^\d+(?:\.\d+)+\.?$/u.test(node.label ?? '') && !introLabel;
        if (decimal && !node.label!.startsWith(`${(parent.label ?? '').replace(/\.$/u, '')}.`)) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: „${node.label}“ gehört nicht zu „${parent.label ?? ''}“` };
        parent.children.push(node);
      } else {
        if (depth !== 1) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: erster Befehl auf Ebene ${depth}` };
        commands.push(node);
      }
      stack.push(node);
      blockUnits.push(unit);
    }
    if (quoteOwner) return { code: 'structure-unreadable', detail: 'Ein Zitat wird bis zum Ende der Seite nicht geschlossen' };
    if (commands.length === 0) {
      // Flache Liste (BayMBl. 2024 Nr. 370): „1. Die Bekanntmachung … wird wie folgt geändert:“ – „2. In der Überschrift …“ –
      // „3. Nr. 1 wird wie folgt geändert:“ – „3.1 …“ – „4. Diese Bekanntmachung tritt … in Kraft.“ Die Befehle stehen auf
      // der Ebene des Einleitungssatzes; sie enden an der Inkrafttretensvorschrift, einer Überschrift oder einer weiteren Norm.
      const flat = flatListCommands(units, intro, introLabel);
      if (typeof flat === 'string') return { code: 'structure-unreadable', detail: flat };
      commands.push(...flat.commands);
      blockUnits.push(...flat.units);
    }
    if (commands.length === 0) return { code: 'structure-unreadable', detail: 'Der Einleitungssatz kündigt Befehle an, es folgen aber keine' };
  } else if (/:\s*$/u.test(intro.text)) {
    // „… wird wie folgt gefasst:“ / „… wird folgender Satz angefügt:“ – das Zitat folgt als Block.
    const node: CommandNode = { unit: intro, depth: 0, text: `${introPrefix} ${introCommand}`.trim(), quoted: [], children: [] };
    let balance = 0;
    for (let at = intro.index + 1; at < units.length; at += 1) {
      const unit = units[at]!;
      if (balance <= 0 && !startsQuoted(unit)) break;
      node.quoted.push(unit);
      blockUnits.push(unit);
      balance += quoteBalance(`${unit.label ?? ''} ${unit.text}`);
      if (balance <= 0) break;
    }
    commands.push(node);
  } else {
    // Ein-Satz-Befehl im Einleitungssatz („In § 37 Abs. 2 der ZustV … wird die Angabe „Nr. 1“ gestrichen.“). Steht das
    // Verb vor dem Zitat („In Teil 1 … der Anlage wird in der Zeile der Kennziffer 821 Spalte 6 der AufbewV …, die Angabe
    // „X“ durch … ersetzt.“, GVBl. 2025 S. 178), ist alles davor der Ort: „In Teil 1 … der Anlage Zeile … Spalte 6 wird …“.
    const verbSplit = /^((?:In|Im)\s[\s\S]+?)\s+(wird|werden)\s+([\s\S]*)$/u.exec(beforeAnchor.trim());
    // Zwischen Verb und Normbezeichnung nur Ortsangaben („in der Zeile der Kennziffer 821 Spalte 6 der …“).
    const inner = verbSplit ? /^(?:(?:in|im)\s+(?:(?:der|dem|den)\s+)?)?((?:(?:Zeile\s+(?:der|mit\s+der)\s+Kennziffer\s+\d+[a-z]?|Spalte\s+\d+|Nr\.\s*\d+(?:\.\d+)*[a-z]?|Satz\s+\d+|Abs\.\s*\d+[a-z]?|Buchst\.\s*[a-z]{1,2})\s+)*)(?:der|des|zur|zum)\s+[\p{Lu}„]/u.exec(verbSplit[3]!) : null;
    if (verbSplit && inner && /^(?:die|das|der)\s+(?:Angabe|Angaben|Wörter|Wort|Zahl|Zahlen)\s/u.test(introCommand)) {
      const where = inner[1]!.trim();
      commands.push({ unit: intro, depth: 0, text: `${verbSplit[1]!}${where ? ` ${where}` : ''} ${verbSplit[2]!} ${introCommand}`, quoted: [], children: [] });
    } else commands.push({ unit: intro, depth: 0, text: `${introPrefix} ${introCommand}`.trim(), quoted: [], children: [] });
  }

  return {
    intro,
    citation,
    introCommand,
    introPrefix,
    ...(parsedCommand.priorClause ? { priorAmendmentClause: parsedCommand.priorClause } : {}),
    ...(section ? { section } : {}),
    ...(introScope ? { introScope } : {}),
    commands,
    units: blockUnits,
  };
}

export const isBlockFailure = (value: CommandBlock | BlockFailure): value is BlockFailure => 'code' in value;

/** Ein Befehl kündigt ein Zitat an („folgende Nr. 1.3“, „die folgenden Sätze“, „wie folgt gefasst“). */
const ANNOUNCES_QUOTE = /(?:\bfolgende[nrs]?\b|\bwie\s+folgt\s+(?:neu\s+)?gefasst\b)[^„]*[.:]\s*$/u;

/** Befehle einer flachen Liste auf der Ebene des Einleitungssatzes (siehe `blockFromCandidate`). */
function flatListCommands(units: readonly GazetteUnit[], intro: GazetteUnit, introLabel: string | undefined): { commands: CommandNode[]; units: GazetteUnit[] } | string {
  if (!introLabel || !/^\d+\.$/u.test(introLabel)) return { commands: [], units: [] };
  const commands: CommandNode[] = [];
  const used: GazetteUnit[] = [];
  const stack: CommandNode[] = [];
  let quoteOwner: CommandNode | undefined;
  let balance = 0;
  for (let at = intro.index + 1; at < units.length; at += 1) {
    const unit = units[at]!;
    if (quoteOwner) {
      quoteOwner.quoted.push(unit);
      used.push(unit);
      balance += quoteBalance(`${unit.label ?? ''} ${unit.text}`);
      if (balance <= 0) quoteOwner = undefined;
      continue;
    }
    if (unit.heading) break;
    const last = stack.at(-1);
    if (startsQuoted(unit) || ((unit.tag === 'th' || unit.tag === 'td') && last && /:\s*$/u.test(last.text))) {
      if (!last || !(/:\s*$/u.test(last.text) || ANNOUNCES_QUOTE.test(last.text))) return `Einheit ${unit.index}: Zitat ohne vorangehenden Befehl mit Doppelpunkt`;
      last.quoted.push(unit);
      used.push(unit);
      balance = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
      if (balance > 0) quoteOwner = last;
      continue;
    }
    const label = cleanLabel(unit.label);
    if (!label) break;
    const top = /^(\d+)\.$/u.exec(label);
    const nested = /^(\d+)((?:\.\d+)+)\.?$/u.exec(label);
    if (top && /(?:tritt|treten)\b[\s\S]*\bin\s+Kraft/u.test(unit.text)) break;
    if (top && isIntroLike(unit)) break;
    const depth = top ? 1 : nested ? 1 + nested[2]!.split('.').filter(Boolean).length : undefined;
    if (depth === undefined) break;
    const node: CommandNode = { unit, label, depth, text: unit.text, quoted: [], children: [] };
    while (stack.length > 0 && stack.at(-1)!.depth >= depth) stack.pop();
    const parent = stack.at(-1);
    if (parent) {
      if (depth !== parent.depth + 1 || !label.startsWith(parent.label!.replace(/\.$/u, '') + '.')) return `Einheit ${unit.index}: Gliederungssprung in der flachen Liste`;
      parent.children.push(node);
    } else {
      if (depth !== 1) return `Einheit ${unit.index}: erster Befehl der flachen Liste auf Ebene ${depth}`;
      commands.push(node);
    }
    stack.push(node);
    used.push(unit);
  }
  if (quoteOwner) return 'Ein Zitat wird bis zum Ende der Seite nicht geschlossen';
  return { commands, units: used };
}

/** Ausfertigungsdaten in einer Änderungsklausel („… vom 23. Dezember 2022 (GVBl. S. 718) …“). */
export function clauseAmendments(clause: string): Array<{ date?: string; reference?: string; text: string }> {
  const parts = [...clause.matchAll(/vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})(?:\s*,\s*Az\.[^()]{0,80}?)?\s*\(([^)]*)\)/gu)];
  return parts.map((part) => {
    const date = parseLongGermanDate(part[1]!);
    return { ...(date ? { date } : {}), ...(part[2] ? { reference: part[2].trim() } : {}), text: part[0] };
  });
}
