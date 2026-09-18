/**
 * Identität und Ende einer heute fehlenden Stichtagsnorm – gelesen im **Aufhebungsbefehl** selbst.
 *
 * Das Ereignisregister (`events/ledger.ts`) nennt je Kandidat den Titel und das Ausfertigungsdatum, unter
 * dem die Norm aufgehoben wurde. Für die Wiederherstellung reicht das nicht: Gebraucht werden die
 * Fundstelle der Stammfassung, eine etwaige Änderungsklausel („…, die zuletzt durch … geändert worden
 * ist“), der Befehl selbst und das Datum, ab dem er wirkt. Das alles steht in der Verkündung des
 * Aufhebungsbefehls – und nur dort wird es gelesen.
 *
 * Gesucht wird das Zitat genau so, wie das Register es gefunden hat: der Titel unmittelbar vor „vom
 * <Ausfertigungsdatum>“. Findet es sich nicht genau einmal (oder mehrfach mit verschiedener Fundstelle),
 * gibt es keine Identität – es wird nicht der wahrscheinlichste Treffer genommen.
 */
import { commencementStatements } from '../reconstruction/commencement.ts';
import type { GazetteUnit } from '../reconstruction/gazette.ts';
import { clauseAmendments } from '../reconstruction/structure.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { parseParenthetical, type ParsedParenthetical } from './references.ts';

const DATE = String.raw`\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}`;

/** Titel für den Vergleich: klein, ohne Anführungszeichen, einheitliche Striche, einfacher Leerraum. */
export function titleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[„“”"‚‘’'«»]/gu, '')
    .replace(/[‐-―−]/gu, '-')
    .replace(/[   ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[\s,;:]+$/u, '')
    .trim();
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface PriorAmendment {
  date?: string;
  reference?: string;
  text: string;
}

export interface LocatedCitation {
  unitIndex: number;
  /** Text des Glieds, in dem das Zitat steht (Beleg). */
  unitText: string;
  /** Der Titel, wie ihn die Verkündung vor „vom“ führt (Ausschnitt ab dem Registertitel). */
  citedTitle: string;
  documentDate: string;
  /** Datum, unter dem das Ereignisregister die Norm führt, wenn es das einer Änderung ist (siehe `reanchor`). */
  registerDate?: string;
  aktenzeichen?: string;
  parenthetical?: string;
  fundstelle: ParsedParenthetical;
  /** „…, die zuletzt durch … geändert worden ist“ (ohne Einleitung), falls vorhanden. */
  priorClause?: string;
  /** Die Klausel sagt „zuletzt“ – es kann weitere, frühere Änderungen geben. */
  priorClauseLast: boolean;
  priorAmendments: PriorAmendment[];
  /** Zitiert „in der Fassung der Bekanntmachung vom …“ (Neubekanntmachung). */
  versionForm: boolean;
  /** Text hinter Zitat und Änderungsklausel bis zum Ende des Glieds. */
  command: string;
}

/** `citations`: alle Fundorte des Zitats (gleiche Fundstelle und Klausel); das Ende wird am Fundort mit Befehl gelesen. */
export type LocateResult = { ok: true; citation: LocatedCitation; citations: LocatedCitation[] } | { ok: false; code: 'citation-not-located' | 'citation-ambiguous'; detail: string };

const PRIOR_LONG = new RegExp(String.raw`^\s*,?\s*(?:die|das|der|welche[rs]?)\s+(zuletzt\s+)?durch\s+([\s\S]{0,700}?)\s+(?:geändert|neu\s+gefasst|berichtigt)\s+worden\s+(?:ist|sind)\s*[,;.]?`, 'u');
const PRIOR_SHORT = /^\s*,?\s*(zuletzt\s+)?geändert\s+durch\s+([^()]{0,240}\([^()]*\))\s*[,;]?/u;
const CORRECTION_SHORT = new RegExp(String.raw`^\s*,?\s*berichtigt\s+(?:am|vom)\s+${DATE}\s*\([^()]*\)\s*[,;]?`, 'u');

function balancedParenthesis(text: string, start: number): { inner: string; end: number } | undefined {
  if (text[start] !== '(') return undefined;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(start + 1, index), end: index + 1 };
    }
  }
  return undefined;
}

/** Zerlegt, was hinter „vom <Datum>“ steht: Aktenzeichen, Fundstellenklammer, Änderungsklausel, Befehl. */
export function parseCitationTail(tail: string): Pick<LocatedCitation, 'aktenzeichen' | 'parenthetical' | 'fundstelle' | 'priorClause' | 'priorClauseLast' | 'priorAmendments' | 'command'> {
  let rest = tail;
  let aktenzeichen: string | undefined;
  const az = /^\s*,?\s*(Az\.\s*[^()]*?)(?=\s*\(|\s*,\s*(?:die|das|der|zuletzt|geändert|berichtigt)\b|\s+(?:wird|werden|tritt|treten)\b|\s*[,.;]?\s*$)/u.exec(rest);
  if (az) {
    aktenzeichen = az[1]!.trim().replace(/[,;]$/u, '');
    rest = rest.slice(az[0].length);
  }
  let parenthetical: string | undefined;
  const open = /^\s*\(/u.exec(rest);
  if (open) {
    const balanced = balancedParenthesis(rest, open[0].length - 1);
    if (balanced) {
      parenthetical = balanced.inner.trim();
      rest = rest.slice(balanced.end);
    }
  }
  let priorClause: string | undefined;
  let priorClauseLast = false;
  const earlyAz = /^\s*,\s*(Az\.\s*[^,()]*?)\s*(?=,\s*(?:die|das|der|zuletzt)\s)/u.exec(rest);
  if (earlyAz) {
    aktenzeichen ??= earlyAz[1]!.trim();
    rest = rest.slice(earlyAz[0].length);
  }
  const long = PRIOR_LONG.exec(rest);
  const short = long ? null : PRIOR_SHORT.exec(rest);
  if (long) {
    priorClause = long[2]!.trim();
    priorClauseLast = Boolean(long[1]);
    rest = rest.slice(long[0].length);
  } else if (short) {
    priorClause = short[2]!.trim();
    priorClauseLast = Boolean(short[1]);
    rest = rest.slice(short[0].length);
  }
  // Aktenzeichen hinter der Fundstelle („(AllMBl. S. 244), Az. 41i-G8092.1-2017/48-1, wird aufgehoben.“).
  const trailingAz = /^\s*,\s*(Az\.\s*[^,()]*?)\s*(?=,|\s+(?:wird|werden|tritt|treten)\b)/u.exec(rest);
  if (trailingAz) {
    aktenzeichen ??= trailingAz[1]!.trim();
    rest = rest.slice(trailingAz[0].length);
  }
  const correction = CORRECTION_SHORT.exec(rest);
  const fundstelle = parseParenthetical(parenthetical ?? (aktenzeichen ? aktenzeichen : ''));
  if (correction) {
    fundstelle.corrections.push(correction[0].replace(/^\s*,?\s*/u, '').replace(/[,;]\s*$/u, '').trim());
    rest = rest.slice(correction[0].length);
  }
  return {
    ...(aktenzeichen ? { aktenzeichen } : {}),
    ...(parenthetical !== undefined ? { parenthetical } : {}),
    fundstelle,
    ...(priorClause ? { priorClause } : {}),
    priorClauseLast,
    priorAmendments: priorClause ? clauseAmendments(priorClause) : [],
    command: rest.replace(/\s+/gu, ' ').trim().replace(/^[,;]\s*/u, ''),
  };
}

/**
 * Findet das Zitat der aufgehobenen Norm in der Verkündung des Aufhebungsbefehls: Registertitel unmittelbar
 * vor „vom <Ausfertigungsdatum>“.
 */
export function locateCitation(units: readonly GazetteUnit[], input: { title: string; documentDate: string }): LocateResult {
  const wanted = titleKey(input.title);
  const hits: LocatedCitation[] = [];
  for (const unit of units) {
    const text = unit.text;
    for (const match of text.matchAll(new RegExp(String.raw`\bvom\s+(${DATE})`, 'gu'))) {
      if (parseLongGermanDate(match[1]!) !== input.documentDate) continue;
      const before = text.slice(0, match.index);
      // Zwischen Titel und „vom“ darf die Abkürzung stehen („Landesfamilienkassenverordnung (LFamKV) vom …“).
      const withoutAbbreviation = before.replace(/\s*\([^()]{1,80}\)\s*$/u, '');
      if (!titleKey(before).endsWith(wanted) && !titleKey(withoutAbbreviation).endsWith(wanted)) continue;
      const anchored = reanchor(text, match.index!) ?? { start: match.index!, end: match.index! + match[0].length, date: input.documentDate, reanchored: false };
      const head = sentenceTail(text.slice(0, anchored.start));
      const versionForm = /in\s+der\s+Fassung\s+der\s+(?:Bekanntmachung|Neubekanntmachung)\s*$/u.test(head);
      const tail = parseCitationTail(text.slice(anchored.end));
      hits.push({
        unitIndex: unit.index,
        unitText: `${unit.label ? `${unit.label} ` : ''}${text}`,
        citedTitle: head.trim(),
        documentDate: anchored.date,
        ...(anchored.reanchored ? { registerDate: input.documentDate } : {}),
        versionForm,
        ...tail,
      });
    }
  }
  if (hits.length === 0) return { ok: false, code: 'citation-not-located', detail: `Titel „${input.title.slice(0, 120)}“ mit Ausfertigung ${input.documentDate} steht nicht in der Verkündung` };
  const signatures = new Set(hits.map((hit) => `${hit.documentDate}|${hit.parenthetical ?? ''}|${hit.priorClause ?? ''}`));
  if (signatures.size > 1) return { ok: false, code: 'citation-ambiguous', detail: `${hits.length} Zitate mit verschiedener Fundstelle oder Änderungsklausel (Einheiten ${hits.map((hit) => hit.unitIndex).join(', ')})` };
  return { ok: true, citation: hits[0]!, citations: hits };
}

/**
 * Der zitierte Titel beginnt mit seinem Satz: Satznummern (`²Die Bekanntmachung …`) und ein vorangehender
 * Satz („¹Diese Bekanntmachung tritt … in Kraft.“) gehören nicht dazu.
 */
function sentenceTail(head: string): string {
  const boundaries = [...head.matchAll(/(?:^|\s)[¹²³⁴⁵⁶⁷⁸⁹⁰]+(?=\S)|[.;:]\s+(?=[A-ZÄÖÜ„])/gu)];
  const last = boundaries.at(-1);
  const start = last ? last.index! + last[0].length : 0;
  return head.slice(start).replace(/^[¹²³⁴⁵⁶⁷⁸⁹⁰]+/u, '').trim();
}

/** Einleitung einer Änderungsklausel unmittelbar vor „vom <Datum>“: dann ist das Datum das der Änderung. */
const AMENDMENT_LEAD_IN = /(?:,\s*)?(?:(?:die|das|der|welche[rs]?)\s+(?:zuletzt\s+)?durch|(?:zuletzt\s+)?geändert\s+durch|berichtigt\s+durch)\s+(?:(?:§|Art\.|Nr\.)\s*\d+[a-z]?(?:\s+(?:Nr\.|Abs\.)\s*\d+)?\s+(?:der|des)\s+)?(?:Gemeinsame\s+)?(?:Bekanntmachung|Verordnung|Gesetz|Richtlinie)\s*$/u;

/**
 * Das Ereignisregister liest in Aufhebungslisten das **letzte** Datum eines Glieds als Ausfertigungsdatum
 * (`events/classify.ts#scanRepealList`). Trägt das Glied eine Änderungsklausel („… vom 25. November 2004
 * (KWMBl. I S. 431), die zuletzt durch Bekanntmachung vom 17. November 2020 (BayMBl. Nr. 698) geändert worden
 * ist“), ist das die Änderung, nicht die Norm. Dann gilt das Zitat davor – belegt durch die Klausel selbst.
 */
function reanchor(text: string, index: number): { start: number; end: number; date: string; reanchored: true } | undefined {
  const before = text.slice(0, index);
  if (!AMENDMENT_LEAD_IN.test(before)) return undefined;
  const earlier = [...before.matchAll(new RegExp(String.raw`\bvom\s+(${DATE})`, 'gu'))];
  for (const candidate of earlier.reverse()) {
    const date = parseLongGermanDate(candidate[1]!);
    if (!date) continue;
    const end = candidate.index! + candidate[0].length;
    const between = before.slice(end);
    // Zwischen dem früheren Zitat und der Klausel stehen nur Aktenzeichen und Fundstellenklammer.
    const rest = between.replace(/^\s*,?\s*Az\.[^()]*?(?=\s*\()/u, '').replace(/^\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/u, '');
    if (AMENDMENT_LEAD_IN.test(rest) && /^\s*,?\s*(?:(?:die|das|der|welche[rs]?)\s|zuletzt\s|geändert\s|berichtigt\s)/u.test(rest)) {
      return { start: candidate.index!, end, date, reanchored: true };
    }
  }
  return undefined;
}

/* ----------------------------------------------------------------------------------- Ende */

export interface EndDetermination {
  ok: boolean;
  /** Letzter Geltungstag (ISO) – `sourceValidTo` der wiederhergestellten Fassung. */
  lastDay?: string;
  kind?: 'repeal' | 'expiry' | 'replacement';
  evidence: string[];
  /** not-a-repeal: Die Verkündung ändert die Norm oder Teile von ihr, sie beendet sie nicht. */
  code?: 'not-a-repeal' | 'end-unreadable';
  reason?: string;
}

/** Befehl, der für ein Listenglied gilt: Einleitungssatz der Aufhebungsliste. */
const LIST_TRIGGER = /\b(?:werden|wird)\s+(?:die\s+|der\s+|das\s+)?(?:folgende[nr]?|nachstehende[nr]?|hiermit\s+folgende[nr]?)\b[^:]{0,160}?\baufgehoben\b\s*:?\s*$|\baufgehoben\s*:\s*$/u;
const LIST_EXPIRY = new RegExp(String.raw`\b(?:treten|tritt)\s+mit\s+Ablauf\s+des\s+(${DATE})\s+außer\s+Kraft\s*:?\s*$`, 'u');
/**
 * „am Tag nach der Veröffentlichung“ – für das BayMBl. gleichbedeutend mit „nach der Bekanntmachung“: Die
 * Veröffentlichung auf der Verkündungsplattform ist die amtliche Bekanntmachung (Nutzungshinweise zum
 * BayMBl.). `commencement.ts` kennt nur „Verkündung“ und „Bekanntmachung“; diese Lesart gilt hier allein für
 * das **Ende** der aufgehobenen Norm, nie für den Beginn einer Fassung.
 */
const DAY_AFTER_PUBLICATION = /^(?:Diese|Die)\s+Bekanntmachung\s+tritt\s+am\s+Tag(?:e)?\s+nach\s+(?:der|ihrer)\s+(?:Veröffentlichung|Bekanntgabe)\s+in\s+Kraft\.?$/u;

const fail = (code: NonNullable<EndDetermination['code']>, reason: string, evidence: string[] = [], kind?: EndDetermination['kind']): EndDetermination => ({ ok: false, code, reason, evidence, ...(kind ? { kind } : {}) });

/**
 * Wann endet die Norm? Gelesen im Befehl hinter dem Zitat oder im Einleitungssatz der Aufhebungsliste, und
 * – bei einer bloßen Aufhebung – in der Inkrafttretensvorschrift der aufhebenden Verkündung
 * (`commencement.ts`). „mit Ablauf des X“ ist der letzte Geltungstag; „am X außer Kraft“ und eine Aufhebung,
 * die am X in Kraft tritt, enden mit dem Vortag.
 */
export function determineEnd(units: readonly GazetteUnit[], citation: LocatedCitation, publishedAt: string): EndDetermination {
  const command = citation.command;
  const evidence: string[] = [];
  const quoted = `„${citation.unitText.slice(0, 400)}“`;
  const expiry = new RegExp(String.raw`^\W*(?:tritt|treten)\s+mit\s+Ablauf\s+des\s+(${DATE})\s+außer\s+Kraft`, 'u').exec(command);
  if (expiry) {
    const lastDay = parseLongGermanDate(expiry[1]!);
    if (!lastDay) return fail('end-unreadable', `Außerkrafttretensdatum nicht lesbar: „${command.slice(0, 120)}“`);
    return { ok: true, lastDay, kind: 'expiry', evidence: [`Befehl: ${quoted}`] };
  }
  const expiryOn = new RegExp(String.raw`^\W*(?:tritt|treten)\s+(?:am|mit\s+Wirkung\s+vom)\s+(${DATE})\s+außer\s+Kraft`, 'u').exec(command);
  if (expiryOn) {
    const first = parseLongGermanDate(expiryOn[1]!);
    if (!first) return fail('end-unreadable', `Außerkrafttretensdatum nicht lesbar: „${command.slice(0, 120)}“`);
    return { ok: true, lastDay: addDays(first, -1), kind: 'expiry', evidence: [`Befehl: ${quoted} (außer Kraft ab ${first}, letzter Geltungstag ${addDays(first, -1)})`] };
  }
  if (/^\W*(?:wird|werden)\s+(?:wie\s+folgt\s+)?(?:geändert|berichtigt|gefasst|ergänzt)/u.test(command) || /^\W*(?:erhält|erhalten)\s/u.test(command)) {
    return fail('not-a-repeal', `Die Verkündung ändert die Norm, sie hebt sie nicht auf: ${quoted}`);
  }
  let kind: EndDetermination['kind'];
  if (/^\W*(?:wird|werden)\s+(?:hiermit\s+)?aufgehoben/u.test(command)) kind = 'repeal';
  else if (/^\W*(?:wird|werden)\s+durch\s+[\s\S]*\b(?:ersetzt|abgelöst)\b/u.test(command)) kind = 'replacement';
  else if (/^\W*(?:tritt|treten)\s+außer\s+Kraft/u.test(command)) kind = 'repeal';
  else {
    // Listenglied: Der Befehl steht im Einleitungssatz der Liste vor dem Glied.
    const at = units.findIndex((unit) => unit.index === citation.unitIndex);
    for (let index = at - 1; index >= 0 && index >= at - 80; index -= 1) {
      const unit = units[index]!;
      const listExpiry = LIST_EXPIRY.exec(unit.text);
      if (listExpiry) {
        const lastDay = parseLongGermanDate(listExpiry[1]!);
        if (!lastDay) return fail('end-unreadable', `Außerkrafttretensdatum der Liste nicht lesbar: „${unit.text.slice(0, 120)}“`);
        return { ok: true, lastDay, kind: 'expiry', evidence: [`Listeneinleitung: „${unit.text}“`, `Listenglied: ${quoted}`] };
      }
      if (LIST_TRIGGER.test(unit.text)) {
        kind = 'repeal';
        evidence.push(`Listeneinleitung: „${unit.text}“`, `Listenglied: ${quoted}`);
        break;
      }
      // Eine Überschrift ohne Listenbefehl beendet die Suche: Der Befehl gehört nicht zu diesem Abschnitt.
      if (unit.heading) break;
    }
    if (!kind) {
      // Ohne Befehl hinter dem Zitat und ohne Aufhebungsliste ist das Zitat Eingangssatz einer Änderung
      // (Teilaufhebungen einzelner Nummern stehen dann in den Gliedern darunter) – kein Ende der Norm.
      return fail('not-a-repeal', `Kein Aufhebungs- oder Außerkrafttretensbefehl für die ganze Norm: ${quoted}`);
    }
  }
  if (evidence.length === 0) evidence.push(`Befehl: ${quoted}`);
  const { statements, unreadable } = commencementStatements(units, publishedAt);
  let effective: string | undefined;
  let effectiveText: string | undefined;
  const relative = unreadable.filter((sentence) => DAY_AFTER_PUBLICATION.test(sentence));
  if (unreadable.length > 0 && !(unreadable.length === 1 && relative.length === 1 && statements.every((statement) => statement.date === undefined))) {
    return fail('end-unreadable', `Inkrafttretensvorschrift der aufhebenden Verkündung nicht lesbar: „${unreadable[0]!.slice(0, 160)}“`, evidence, kind);
  }
  if (relative.length === 1) {
    effective = addDays(publishedAt, 1);
    effectiveText = relative[0]!;
  } else {
    const general = statements.filter((statement) => statement.refs === null);
    if (general.length !== 1 || !general[0]!.date) return fail('end-unreadable', general.length === 0 ? 'Aufhebende Verkündung ohne lesbare Grundregel zum Inkrafttreten' : `${general.length} Grundregeln zum Inkrafttreten der aufhebenden Verkündung`, evidence, kind);
    if (statements.some((statement) => statement.refs !== null)) return fail('end-unreadable', 'Die aufhebende Verkündung regelt ihr Inkrafttreten abschnittsweise; welcher Teil die Aufhebung trägt, wird nicht geraten', evidence, kind);
    effective = general[0]!.date;
    effectiveText = general[0]!.text;
  }
  evidence.push(`Inkrafttreten der aufhebenden Verkündung (verkündet ${publishedAt}): „${effectiveText}“ (${effective}); letzter Geltungstag der aufgehobenen Norm ${addDays(effective, -1)}`);
  return { ok: true, lastDay: addDays(effective, -1), kind, evidence };
}

/**
 * Ende über alle Fundorte des Zitats: Übergangs- und Verweisungssätze („Für Studierende … gilt die
 * Bekanntmachung … weiter“) tragen keinen Befehl; maßgeblich ist der Fundort mit Aufhebungs- oder
 * Außerkrafttretensbefehl. Zwei Fundorte mit verschiedenem Ende sind ein Widerspruch.
 */
export function determineEndAcross(units: readonly GazetteUnit[], citations: readonly LocatedCitation[], publishedAt: string): EndDetermination & { citation?: LocatedCitation } {
  const results = citations.map((citation) => ({ citation, end: determineEnd(units, citation, publishedAt) }));
  const definite = results.filter((result) => result.end.ok);
  const lastDays = new Set(definite.map((result) => result.end.lastDay));
  if (lastDays.size > 1) return { ok: false, code: 'end-unreadable', reason: `Mehrere Fundorte mit verschiedenem Ende (${[...lastDays].join(', ')})`, evidence: definite.flatMap((result) => result.end.evidence) };
  if (definite.length > 0) return { ...definite[0]!.end, citation: definite[0]!.citation };
  // Kein Fundort trägt ein Ende: der schwerste Befund zählt (Änderung statt Aufhebung vor unlesbarem Ende).
  const notRepeal = results.find((result) => result.end.code === 'not-a-repeal');
  const unreadable = results.find((result) => result.end.code === 'end-unreadable');
  const chosen = unreadable ?? notRepeal ?? results[0]!;
  return { ...chosen.end, citation: chosen.citation };
}
