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
  const match = new RegExp(`(${GAZETTE})\\.?\\s*(\\d{4})?\\s*(?:S\\.|Nr\\.)\\s*(\\d+)`, 'u').exec(value);
  if (!match) return undefined;
  return `${match[1]!.toLowerCase()}|${match[2] ?? ''}|${match[3]}`;
}

/** Alle Fundstellen einer Klammer (`GVBl. S. 410, 764, BayRS …` → nur die erste Seite zählt). */
export function referencesIn(value: string): string[] {
  return [...value.matchAll(new RegExp(`${GAZETTE}\\.?\\s*(?:\\d{4}\\s*)?(?:S\\.|Nr\\.)\\s*\\d+`, 'gu'))].map((match) => match[0]);
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
  `vom\\s+(\\d{1,2}\\.\\s*[A-Za-zÄÖÜäöü]+\\s+\\d{4})(?:\\s*,\\s*Az\\.[^()]{0,80}?)?\\s*\\(([^()]*)\\)`,
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
const PRIOR_CLAUSE_SHORT = /^\s*,?\s*zuletzt\s+geändert\s+durch\s+([^()]{0,200}\([^()]*\))\s*,?/u;

/** Label ohne einleitendes Anführungszeichen. */
const cleanLabel = (label: string | undefined): string | undefined => label?.replace(/^[„‚"]+/u, '').trim() || undefined;

const OPENERS = /[„‚]/gu;
const CLOSERS = /[“”‘]/gu;

function quoteBalance(value: string): number {
  return (value.match(OPENERS)?.length ?? 0) - (value.match(CLOSERS)?.length ?? 0);
}

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
  const after = text.slice(cited.end);
  if (/^[\s,]*(?:zuletzt\s+)?(?:geändert|aufgehoben|ersetzt|eingefügt|angefügt|neu\s+gefasst)\s+worden\s+(?:ist|sind)/u.test(after)) return undefined;
  const prior = PRIOR_CLAUSE.exec(after) ?? PRIOR_CLAUSE_SHORT.exec(after);
  const command = (prior ? after.slice(prior[0].length) : after.replace(/^\s*,?\s*/u, '')).trim();
  const verbFirst = /^(?:wird|werden|erhält|erhalten)(?![\p{L}])/u.test(command);
  // „In Teil 1 … der Anlage **wird** in der Zeile … der AufbewV …, die zuletzt …, die Angabe „X“ durch …
  // ersetzt.“ – das Verb steht vor dem Zitat, hinter ihm nur noch das Objekt.
  const objectFirst = /(?:^|\s)(?:wird|werden)\s/u.test(text.slice(0, cited.anchorStart)) && /^(?:die|das|der)\s+(?:Angabe|Angaben|Wörter|Wort|Zahl|Zahlen)\s[\s\S]*(?:ersetzt|gestrichen|eingefügt)\.?$/u.test(command);
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
 * Ortsangabe vor dem Normtitel im Einleitungssatz: „In § 37 Abs. 2 Satzteil nach Nr. 2 der
 * Zuständigkeitsverordnung (ZustV) …“ → „In § 37 Abs. 2 Satzteil nach Nr. 2“. Der Titel selbst gehört
 * nicht dazu; er endet am Artikel („der“, „des“), der ihn einleitet. Kein Strukturverweis → leer.
 */
export function locationPrefix(head: string): string {
  const text = head.replace(/^\(\d+[a-z]?\)\s*/u, '').trim();
  const match = /^((?:In\s+)?(?:(?:der|dem|den)\s+)?(?:Überschrift|Inhaltsübersicht|Inhaltsverzeichnis|§§?|Art\.|Artikel|Anlage|Anlagen|Abschnitt|Teil|Nr\.|Nrn\.|Abs\.|Satz|Anhang)[\s\S]*?)\s+(?:der|des|zur|zum|zu)\s+[\p{Lu}„]/u.exec(text);
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
  const { unit: intro, citation } = candidates[0]!;
  const parsedCommand = commandAfterCitation(intro.text, citation)!;
  const introCommand = parsedCommand.command;
  const introPrefix = locationPrefix(intro.text.slice(0, citation.anchorStart));
  const section = sectionHeading(units, intro.index);

  const blockUnits: GazetteUnit[] = [intro];
  const commands: CommandNode[] = [];
  /** Ort, den ein ungegliederter Zwischensatz („§ 1 wird wie folgt geändert:“) allen Befehlen voranstellt. */
  let introScope: string | undefined;
  const opensList = /wie\s+folgt\s+geändert\s*:\s*$/u.test(intro.text);
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
        if (balance <= 0) quoteOwner = undefined;
        continue;
      }
      if (unit.heading) break;
      const last = stack.at(-1);
      if (startsQuoted(unit)) {
        if (!last || !/:\s*$/u.test(last.text)) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: Zitat ohne vorangehenden Befehl mit Doppelpunkt` };
        last.quoted.push(unit);
        blockUnits.push(unit);
        balance = quoteBalance(`${unit.label ?? ''} ${unit.text}`);
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
        parent.children.push(node);
      } else {
        if (depth !== 1) return { code: 'structure-unreadable', detail: `Einheit ${unit.index}: erster Befehl auf Ebene ${depth}` };
        commands.push(node);
      }
      stack.push(node);
      blockUnits.push(unit);
    }
    if (quoteOwner) return { code: 'structure-unreadable', detail: 'Ein Zitat wird bis zum Ende der Seite nicht geschlossen' };
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
    // Ein-Satz-Befehl im Einleitungssatz („In § 37 Abs. 2 der ZustV … wird die Angabe „Nr. 1“ gestrichen.“).
    commands.push({ unit: intro, depth: 0, text: `${introPrefix} ${introCommand}`.trim(), quoted: [], children: [] });
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

/** Ausfertigungsdaten in einer Änderungsklausel („… vom 23. Dezember 2022 (GVBl. S. 718) …“). */
export function clauseAmendments(clause: string): Array<{ date?: string; reference?: string; text: string }> {
  const parts = [...clause.matchAll(/vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})(?:\s*,\s*Az\.[^()]{0,80}?)?\s*\(([^)]*)\)/gu)];
  return parts.map((part) => {
    const date = parseLongGermanDate(part[1]!);
    return { ...(date ? { date } : {}), ...(part[2] ? { reference: part[2].trim() } : {}), text: part[0] };
  });
}
