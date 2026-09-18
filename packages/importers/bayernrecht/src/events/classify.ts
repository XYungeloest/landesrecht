/**
 * Erkennung: Was tut eine Verkündung, wann wirkt sie, und gegen welche Vorschrift richtet sie sich?
 *
 * Zwei Ebenen, bewusst getrennt:
 *
 *   1. **Veröffentlichungsebene** (`classifyPublication`) – aus dem Titel, wie ihn die amtliche
 *      Trefferliste führt, und aus der Gattungsangabe des Seitenkopfs. Das ergibt den Grundtyp
 *      (`amend`, `repeal`, `recast`, `treaty`, `notice` …). Diese Ebene steht auch dann zur Verfügung,
 *      wenn eine Veröffentlichung keine HTML-Detailseite hat.
 *   2. **Befehlsebene** (`classifyCommand`) – aus dem Wortlaut unmittelbar hinter dem Zitat der
 *      betroffenen Vorschrift. Erst sie unterscheidet innerhalb eines Mantelakts, ob eine bestimmte
 *      Norm geändert, aufgehoben oder neu gefasst wird.
 *
 * Die Befehlsebene schlägt die Veröffentlichungsebene, wo sie greift – ein „Gesetz zur Änderung …“
 * kann in § 7 eine andere Vorschrift *aufheben*, und genau dieses Ereignis ist für die
 * Stichtagsrekonstruktion das wertvolle.
 *
 * Es wird nichts geraten. Gibt es weder ein Muster noch einen Befehl, entsteht `unknown` mit Rohtext.
 * Ein Datum wird nie ergänzt: Fehlt die Inkrafttretensvorschrift, bleibt `effectiveDate` leer.
 */
import type { EventSubtype, EventType } from './ledger.ts';
import { parseLongGermanDate } from './resolve.ts';

/* ------------------------------------------------------------------- Zitate im Verkündungstext */

export interface CitedNorm {
  /** BayRS-Gliederungsnummer, wie sie im Zitat steht. */
  bayRsNumber?: string;
  /** Kürzestmöglicher sinnvoller Titel – der erste der Kandidaten. */
  title?: string;
  /**
   * Alle Titelkandidaten, von der kürzesten zur längsten Lesart. Der deutsche Genitiv macht die Grenze
   * eines Normtitels im Fließtext mehrdeutig: In „Verordnung zur Durchführung **des**
   * Polizeiorganisationsgesetzes (DVPOG)“ gehört das Genitivattribut zum Titel, in „Auf Grund des § 70
   * **der** Straßenverkehrs-Zulassungs-Ordnung (StVZO)“ gehört es nicht dazu. Statt zu raten, werden
   * beide Lesarten geführt; entschieden wird erst beim Abgleich gegen den Bestand, und nur durch eine
   * **vollständige** Übereinstimmung.
   */
  titleCandidates: string[];
  /**
   * Strukturverweis unmittelbar vor dem Titel („§ 7 der Verordnung X …“). Seine Anwesenheit macht aus
   * einem „wird aufgehoben“ eine **Teil**aufhebung – und die beweist das Gegenteil eines Endes: Die
   * Vorschrift bestand im Übrigen fort. Ohne diese Unterscheidung führte jede Teilaufhebung zu einem
   * falschen baseline-only-Kandidaten.
   */
  scopeReference?: string;
  abbreviation?: string;
  enactmentDate?: string;
  /** Fundstelle der **zitierten Norm** („GVBl. S. 236“, „AllMBl. 2015 S. 262“). */
  citation?: string;
  /** Zeichenbereich des Zitats im Text – Grundlage für Auszug und Befehlszuordnung. */
  start: number;
  end: number;
  /** Wörtlicher Ausschnitt ab dem Beginn des Zitats. */
  raw: string;
}

/**
 * Klammerzusatz, der eine Fundstelle oder eine BayRS-Nummer trägt. Der Punkt hinter dem Blattnamen fehlt in
 * der Quelle gelegentlich („(BayMBl Nr. 580)“, BayMBl. 2025 Nr. 113) – er ist deshalb optional.
 */
const REFERENCE_PAREN = /\(([^()]*(?:BayRS|(?<![\p{L}])(?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl)(?:\.|\s+(?=\d|S\.|Nr\.)))[^()]*)\)/gu;
/** Der Ausfertigungsteil unmittelbar vor der Klammer. */
const ENACTMENT_TAIL = /(?:vom|v\.)\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s*$/u;
/**
 * Fassungsangabe zwischen Titel und Ausfertigungsdatum. Bayerische Zitate lauten regelmäßig
 * „Die Gemeindeordnung (GO) **in der Fassung der Bekanntmachung** vom 22. August 1998 (GVBl. S. 796,
 * BayRS 2020-1-1-I)“. Ohne diesen Schritt bliebe als Titel „Fassung der Bekanntmachung“ übrig.
 */
const VERSION_TAIL = /\s*in\s+der\s+(?:jeweils\s+)?(?:geltenden\s+)?Fassung\s+der\s+(?:Bekanntmachung|Bek\.|Neubekanntmachung)$/u;
/** Abkürzungsklammer unmittelbar vor dem Ausfertigungsteil. */
const ABBREVIATION_TAIL = /\(([^()]{1,60})\)\s*$/u;
/**
 * Abkürzung hinter einem Gedankenstrich statt in Klammern: „Europamedaillen-Bekanntmachung – EuMedBek“
 * (BayMBl. 2026 Nr. 377), „Richtlinien für den Lärmschutz an Straßen – RLS-90“. Nur ein einzelnes Wort
 * mit mindestens zwei Großbuchstaben gilt als Abkürzung – „– Teil A“ oder „– Ausgabe 2019“ nicht.
 */
const DASH_ABBREVIATION_TAIL = /\s[\u2013\u2014-]\s*([A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöüß0-9./-]{1,39})\s*$/u;

/** Abkürzung am Ende eines Titels in Klammern oder hinter einem Gedankenstrich; sonst `undefined`. */
export function titleAbbreviation(title: string): { abbreviation: string; index: number; form: 'paren' | 'dash' } | undefined {
  const paren = ABBREVIATION_TAIL.exec(title);
  if (paren) {
    const candidate = paren[1]!.replace(/[\u2010-\u2015\u2212]/gu, '-').split(/\s+-\s+/u).at(-1)!.trim();
    if (!/\s/u.test(candidate) && (candidate.match(/[A-ZÄÖÜ]/gu) ?? []).length >= 2) return { abbreviation: candidate, index: paren.index, form: 'paren' };
    return undefined;
  }
  const dash = DASH_ABBREVIATION_TAIL.exec(title);
  if (dash) {
    const candidate = dash[1]!.replace(/[\u2010-\u2015\u2212]/gu, '-').replace(/[.]$/u, '');
    if ((candidate.match(/[A-ZÄÖÜ]/gu) ?? []).length >= 2) return { abbreviation: candidate, index: dash.index, form: 'dash' };
  }
  return undefined;
}
/**
 * Grenze, ab der ein Titel beginnt: Satzzeichen, Artikelwort oder Gliederungsverweis. Gesucht wird die
 * **letzte** Grenze vor dem Zitat – der Titel ist der kürzestmögliche sinnvolle Rest.
 */
const TITLE_BOUNDARY = /(?:[.;:!?»„“”]|(?<![\p{L}])(?:[Dd]ie|[Dd]as|[Dd]er|des|dem|den|durch|nach|gemäß|Gemäß|Nach|und|sowie|von|zum|zur|über|auf\sGrund|in\sVerbindung\smit)\s|§\s*\d+[a-z]?\s|Art\.\s*\d+[a-z]?\s|Nr\.\s*\d+\s)/gu;

/** Wieviel Text vor einer Fundstellenklammer für Titel und Abkürzung durchsucht wird. */
const TITLE_WINDOW = 260;
/** Wieviel Text hinter einem Zitat den Änderungsbefehl trägt. */
export const COMMAND_WINDOW = 180;

/** Kanonisiert Leerraum und typografische Varianten, ohne den Wortlaut zu verändern. */
export function normalizeQuote(value: string): string {
  return value.replace(/[\u00a0\u202f\u2009]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

/**
 * Alle Normzitate eines Verkündungstextes. Ausgangspunkt ist immer die Fundstellenklammer – sie ist
 * das einzige zuverlässige Ankerzeichen; der Titel davor wird nur so weit zurück gelesen, wie eine
 * Satz- oder Artikelgrenze es zulässt.
 */
export function scanCitations(text: string): CitedNorm[] {
  const found: CitedNorm[] = [];
  for (const match of text.matchAll(REFERENCE_PAREN)) {
    const parenStart = match.index!;
    const parenEnd = parenStart + match[0].length;
    const inner = normalizeQuote(match[1]!);
    const bayRs = /BayRS\s*([0-9A-Za-zÄÖÜäöü]+(?:[.\-/][0-9A-Za-zÄÖÜäöü]+)*)/u.exec(inner)?.[1];
    const citation = /((?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl)\.?\s*(?:\d{4}\s*)?(?:S\.|Nr\.)\s*\d+)/u.exec(inner)?.[1];

    let head = text.slice(Math.max(0, parenStart - TITLE_WINDOW), parenStart).replace(/\s+$/u, '');
    const enactment = ENACTMENT_TAIL.exec(head);
    let enactmentDate: string | undefined;
    if (enactment) {
      enactmentDate = parseLongGermanDate(enactment[1]!);
      head = head.slice(0, enactment.index).replace(/\s+$/u, '');
    } else {
      // „… in der in der Bayerischen Rechtssammlung (BayRS 2011-2-I) veröffentlichten bereinigten
      // Fassung“ – bereinigte Fassungen tragen kein Ausfertigungsdatum. Es wird keines erfunden.
      head = head.replace(/\s*in\s+der\s+in\s+der\s+Bayerischen\s+Rechtssammlung$/u, '');
    }
    head = head.replace(VERSION_TAIL, '').replace(/\s+$/u, '');

    const abbreviationMatch = ABBREVIATION_TAIL.exec(head);
    let abbreviation: string | undefined;
    if (abbreviationMatch) {
      const candidate = abbreviationMatch[1]!.replace(/[\u2010-\u2015\u2212]/gu, '-').split(/\s+-\s+/u).at(-1)!.trim();
      if (!/\s/u.test(candidate) && (candidate.match(/[A-ZÄÖÜ]/gu) ?? []).length >= 2) abbreviation = candidate;
      head = head.slice(0, abbreviationMatch.index).replace(/\s+$/u, '');
    }
    // Abkürzung hinter einem Gedankenstrich: Sie bleibt im Titel (die Kennung des Ereignisses hängt am
    // Titel), zählt aber als Abkürzung, und der Titel ohne sie wird als weitere Lesart geführt.
    const dashAbbreviation = abbreviationMatch ? undefined : titleAbbreviation(head);
    if (dashAbbreviation?.form === 'dash') abbreviation = dashAbbreviation.abbreviation;

    const headStart = Math.max(0, parenStart - TITLE_WINDOW);
    const candidates = extractTitleCandidates(head);
    const titleCandidates = candidates.map((candidate) => candidate.text);
    if (dashAbbreviation?.form === 'dash') {
      for (const candidate of extractTitleCandidates(head.slice(0, dashAbbreviation.index))) if (!titleCandidates.includes(candidate.text)) titleCandidates.push(candidate.text);
    }
    const title = titleCandidates[0];
    // Ein Zitat ohne jedes Identitätsmerkmal ist kein Zitat, sondern eine Fundstellenangabe im Fließtext.
    if (bayRs === undefined && title === undefined && citation === undefined) continue;
    const start = candidates.length === 0 ? parenStart : headStart + candidates[candidates.length - 1]!.offset;
    const scopeReference = SCOPE_REFERENCE.exec(text.slice(Math.max(0, start - SCOPE_WINDOW), start))?.[0];
    found.push({
      ...(bayRs === undefined ? {} : { bayRsNumber: bayRs }),
      ...(title === undefined ? {} : { title }),
      titleCandidates,
      ...(scopeReference === undefined ? {} : { scopeReference: normalizeQuote(scopeReference) }),
      ...(abbreviation === undefined ? {} : { abbreviation }),
      ...(enactmentDate === undefined ? {} : { enactmentDate }),
      ...(citation === undefined ? {} : { citation }),
      start: Math.max(0, start),
      end: parenEnd,
      raw: normalizeQuote(text.slice(Math.max(0, start), Math.min(text.length, parenEnd + COMMAND_WINDOW))),
    });
  }
  return found;
}

/** Höchstzahl der Titelkandidaten je Zitat; mehr Lesarten bringen keine zusätzliche Sicherheit. */
const MAX_TITLE_CANDIDATES = 4;

/** Wieviel Text vor dem Titel auf einen Strukturverweis geprüft wird. */
const SCOPE_WINDOW = 70;

/**
 * Strukturverweis unmittelbar vor dem Titel, samt einem etwaigen Artikel: „§ 7 der“, „Art. 3 Abs. 2
 * des“, „Anlage 1 zur“. Nur ein *unmittelbar* anschließender Verweis begrenzt den Gegenstand – ein
 * Paragraphenzeichen irgendwo im Satz tut das nicht.
 */
const SCOPE_REFERENCE =
  /(?:§{1,2}|Art\.|Abs\.|Nr\.|Satz|Sätze|Anlage|Anl\.|Teil|Abschnitt|Buchst\.|Überschrift)\s*[\dIVXa-z]*(?:\s*(?:und|bis|,)\s*[\dIVXa-z]+)*(?:\s+(?:Abs\.|Satz|Nr\.|Buchst\.)\s*[\dIVXa-z]+)*\s*(?:der|des|dem|den|die|das|zur|zum)?\s*$/u;

/**
 * Zitatschutt: Wo eine Klammer mitten im Satz steht, liest der Rückwärtslauf Teile der vorangehenden
 * Fundstelle mit („S. 796, BayRS 2020-1-1-I), die zuletzt durch …“). Solche Bruchstücke sind keine
 * Titel. Sie werden verworfen statt als Titel geführt – ein falscher Titel im Register wäre schlimmer
 * als gar keiner, weil er wie ein Identitätsmerkmal aussieht.
 */
const TITLE_DEBRIS =
  /BayRS|GVBl\.|BayMBl\.|AllMBl\.|JMBl\.|FMBl\.|KWMBl\.|BGBl\.|\),|\bAuf\s+Grund\b|\bEs\s+verordnen\b|\bverordnet\b|\bDer\s+Landtag\b|^(?:S\.|Nr\.|Abs\.|Satz|Art\.|Buchst\.)\s|^(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/u;

/**
 * Zusammengesetztes Vorschriftenwort – ein einzelnes Wort genügt als Titel, wenn es eines ist
 * („Gemeindeordnung“, „Bekanntmachungsverordnung“). Ein beliebiges einzelnes Substantiv genügt nicht.
 */
const NORM_NOUN = /(?:gesetz|ordnung|verordnung|satzung|statut|vertrag|abkommen|richtlinie|richtlinien|bekanntmachung|verfassung|erlass|anordnung)(?:es|s|en)?$/iu;

/** Sieht der Kandidat wie ein Normtitel aus – und nicht wie ein Satzrest oder ein Zitatbruchstück? */
export function isPlausibleTitle(candidate: string): boolean {
  if (candidate.length < 6 || candidate.length > 200) return false;
  if (!/^[A-ZÄÖÜ]/u.test(candidate)) return false;
  if (candidate.split(/\s+/u).length < 2 && !(candidate.length >= 10 && NORM_NOUN.test(candidate))) return false;
  return !TITLE_DEBRIS.test(candidate);
}

export interface TitleCandidate {
  text: string;
  /** Beginn des Kandidaten im übergebenen Ausschnitt – nötig, um den Strukturverweis davor zu finden. */
  offset: number;
}

/**
 * Titelkandidaten aus dem Text unmittelbar vor der Ausfertigungsangabe, von der kürzesten Lesart (ab
 * der letzten Grenze) zur längsten. Entschieden wird hier **nicht** – die Entscheidung fällt beim
 * Abgleich gegen den Bestand, und nur bei vollständiger Übereinstimmung.
 */
export function extractTitleCandidates(head: string): TitleCandidate[] {
  const trimmed = head.replace(/\s+$/u, '');
  if (trimmed === '') return [];
  TITLE_BOUNDARY.lastIndex = 0;
  // Der Textanfang ist immer eine Grenze – zusätzlich zu den gefundenen, nicht an ihrer Stelle.
  const boundaries = [0, ...[...trimmed.matchAll(TITLE_BOUNDARY)].map((match) => match.index! + match[0].length)].sort((left, right) => left - right);
  const candidates: TitleCandidate[] = [];
  for (const boundary of boundaries.reverse()) {
    const candidate = normalizeQuote(trimmed.slice(boundary)).replace(/[,;:]$/u, '').trim();
    if (!isPlausibleTitle(candidate)) continue;
    if (candidates.some((entry) => entry.text === candidate)) continue;
    candidates.push({ text: candidate, offset: boundary });
    if (candidates.length >= MAX_TITLE_CANDIDATES) break;
  }
  return candidates;
}

/* ---------------------------------------------------------------------------- Befehlsebene */

export interface CommandClassification {
  eventType: EventType;
  subtype?: EventSubtype;
  /** Die Wortfolge, die den Befehl trägt – erscheint im Auszug des Ereignisses. */
  keyword: string;
}

/**
 * Reihenfolge der Prüfungen ist fachlich bindend. Aufhebung und Außerkrafttreten stehen **vor** der
 * Änderung: Ein Satz „… wird aufgehoben“ in einem Änderungsgesetz ist ein Ende, keine Änderung.
 * Umgekehrt darf ein „Nr. 10.18 wird aufgehoben“ tief im Änderungsbefehl das Ganze nicht zum Ende
 * machen – deshalb wird nur ein schmales Fenster unmittelbar hinter dem Zitat gelesen
 * (`COMMAND_WINDOW`), in dem der erste, die ganze Vorschrift betreffende Befehl steht.
 */
const COMMAND_RULES: readonly { pattern: RegExp; eventType: EventType; subtype?: EventSubtype }[] = [
  { pattern: /\bwird\s+neu\s+bekannt\s*gemacht\b/u, eventType: 'recast', subtype: 'neubekanntmachung' },
  { pattern: /\b(?:wird|werden)\s+(?:hiermit\s+)?aufgehoben\b/u, eventType: 'repeal' },
  { pattern: /\btritt\s+mit\s+Ablauf\s+des\s+[^;:]{0,40}?\s*außer\s+Kraft\b/u, eventType: 'expire' },
  { pattern: /\b(?:tritt|treten)\s+[^;:]{0,60}?außer\s+Kraft\b/u, eventType: 'expire' },
  { pattern: /\bGeltungsdauer\s+[^.]{0,60}\bverlängert\b/u, eventType: 'extend', subtype: 'befristungsverlaengerung' },
  { pattern: /\b(?:wird|werden)\s+wie\s+folgt\s+(?:geändert|gefasst)\b/u, eventType: 'amend' },
  { pattern: /\berhält\s+folgende\s+Fassung\b/u, eventType: 'amend' },
  { pattern: /\b(?:wird|werden)\s+(?:folgender?maßen\s+)?geändert\b/u, eventType: 'amend' },
  { pattern: /\b(?:wird|werden)\s+ersetzt\b/u, eventType: 'amend' },
  { pattern: /\b(?:wird|werden)\s+(?:neu\s+gefasst|neugefasst)\b/u, eventType: 'recast', subtype: 'neubekanntmachung' },
  { pattern: /\bwird\s+berichtigt\b/u, eventType: 'correction', subtype: 'berichtigung' },
];

/**
 * Klassifiziert den Wortlaut unmittelbar hinter einem Normzitat. `undefined`, wenn kein Befehl dasteht.
 *
 * Es entscheidet der **erste** Befehl im Fenster; die Reihenfolge der Regeln entscheidet nur bei
 * gleichem Beginn. Sonst machte ein Unterbefehl das Ganze zum Ende: „Nr. 5 der Europamedaillen-
 * Bekanntmachung (EuMedBek) … wird wie folgt geändert: 1.1 … gestrichen. 1.2 Die Sätze 3 bis 5 werden
 * aufgehoben.“ (BayMBl. 2024 Nr. 7) ist eine Änderung, keine Aufhebung der EuMedBek.
 */
export function classifyCommand(window: string): CommandClassification | undefined {
  let best: { rule: (typeof COMMAND_RULES)[number]; match: RegExpExecArray } | undefined;
  for (const rule of COMMAND_RULES) {
    const match = rule.pattern.exec(window);
    if (match && (best === undefined || match.index < best.match.index)) best = { rule, match };
  }
  if (best === undefined) return undefined;
  return { eventType: best.rule.eventType, ...(best.rule.subtype ? { subtype: best.rule.subtype } : {}), keyword: normalizeQuote(best.match[0]) };
}

/** Wieviel Text hinter einem Zitat überhaupt betrachtet wird, bevor die Änderungshistorie entfernt ist. */
const COMMAND_LOOKAHEAD = 460;

/**
 * Der Textausschnitt, in dem der Befehl zu diesem Zitat stehen muss.
 *
 * Zwei Eigenheiten der deutschen Zitierweise machen das nötig, und beide führen ohne Behandlung zu
 * falschen Ereignissen:
 *
 * 1. **Änderungshistorie als Zwischenklausel.** Der Regelfall lautet „Die Zuständigkeitsverordnung
 *    (ZustV) vom 16. Juni 2015 (GVBl. S. 184), **die zuletzt durch Verordnung vom 3. September 2024
 *    (GVBl. S. 418) geändert worden ist**, wird wie folgt geändert“. Zwischen Zitat und Befehl steht
 *    also eine Klausel, die selbst ein Zitat enthält. Sie wird entfernt, damit der Befehl gefunden wird.
 * 2. **Das Zitat der Änderungshistorie ist kein Gegenstand.** Dasselbe eingebettete Zitat
 *    („GVBl. S. 418“) stünde sonst unmittelbar vor „geändert worden ist, wird wie folgt geändert“ und
 *    erzeugte ein zweites, falsches Änderungsereignis gegen das falsche Ziel. Ein Zitat, auf das
 *    unmittelbar „… worden ist“ folgt, ist deshalb nie Gegenstand eines Befehls.
 */
export function commandWindow(text: string, citation: CitedNorm): string | undefined {
  const tail = text.slice(citation.end, citation.end + COMMAND_LOOKAHEAD);
  if (/^[\s,]*(?:zuletzt\s+)?(?:geändert|aufgehoben|ersetzt|eingefügt|angefügt|neu\s+gefasst|neugefasst)\s+worden\s+(?:ist|sind)/u.test(tail)) return undefined;
  const cleaned = tail.replace(
    /,?\s*(?:die|das|der|welche[rs]?)\s+(?:zuletzt\s+)?durch[\s\S]{0,340}?(?:geändert|neu\s+gefasst|neugefasst)\s+worden\s+(?:ist|sind)/gu,
    ',',
  );
  return cleaned.slice(0, COMMAND_WINDOW);
}

/* --------------------------------------------------------------- Veröffentlichungsebene */

export interface PublicationClassification {
  eventType: EventType;
  subtype?: EventSubtype;
  /** Regel, die getragen hat – erscheint im Bericht, damit die Zuordnung nachvollziehbar bleibt. */
  rule: string;
}

/**
 * Titelmuster in verbindlicher Reihenfolge. Die Reihenfolge entscheidet mehr als die Muster selbst:
 * „Bekanntmachung der Neufassung der Verordnung zur Änderung …“ ist eine Neufassung, keine Änderung;
 * „Berichtigung des Gesetzes zur Änderung …“ ist eine Berichtigung, keine Änderung.
 */
const TITLE_RULES: readonly { pattern: RegExp; eventType: EventType; subtype?: EventSubtype; rule: string }[] = [
  // Auch „Neunte Berichtigung der Verzeichnisse …“ ist eine Berichtigung; der Zähler davor ändert nichts.
  { pattern: /(?:^|\s)(?:Druckfehler)?[Bb]erichtigung\s+(?:der|des)\b|^(?:Druckfehler)?[Bb]erichtigung\b/u, eventType: 'correction', subtype: 'berichtigung', rule: 'Titel nennt eine Berichtigung' },
  { pattern: /^Aufhebung\b|\bzur\s+Aufhebung\b|^Aufhebung\s+von\b/u, eventType: 'repeal', rule: 'Titel nennt eine Aufhebung' },
  { pattern: /\bAußerkrafttreten\b/u, eventType: 'expire', rule: 'Titel nennt ein Außerkrafttreten' },
  { pattern: /\bNeufassung\b|\bNeubekanntmachung\b|^Bekanntmachung\s+der\s+Neufassung\b/u, eventType: 'recast', subtype: 'neubekanntmachung', rule: 'Titel nennt eine Neufassung' },
  { pattern: /\bVerlängerung\s+der\s+Geltungsdauer\b|\bWeitergeltung\b|\bFortgeltung\b/u, eventType: 'extend', subtype: 'befristungsverlaengerung', rule: 'Titel nennt eine Verlängerung oder Weitergeltung' },
  // `\b` gilt in JavaScript nur für [A-Za-z0-9_]; vor „ü“ oder „Ä“ greift es nie. Deshalb hier und
  // in der Änderungsregel die ausdrückliche Buchstabengrenze `(?<![\p{L}])`.
  { pattern: /(?<![\p{L}])über\s+das\s+Inkrafttreten(?![\p{L}])|(?<![\p{L}])des\s+Inkrafttretens(?![\p{L}])|^Inkrafttreten\b/u, eventType: 'commencement', subtype: 'inkrafttretensbekanntmachung', rule: 'Titel nennt ein Inkrafttreten' },
  { pattern: /\bStaatsvertrag(?:s|es)?\b|\bAbkommen(?:s)?\b|\bNotenwechsel(?:s)?\b|\bVerwaltungsvereinbarung\b|\bVertrag(?:s|es)?\s+zwischen\b/u, eventType: 'treaty', subtype: 'staatsvertrag', rule: 'Titel nennt einen Staatsvertrag oder ein Abkommen' },
  { pattern: /\bzur\s+Änderung(?![\p{L}])|(?<![\p{L}])Änderung\s+(?:der|des)(?![\p{L}])|(?<![\p{L}])Änderungs(?:gesetz|verordnung|satzung)(?:es)?(?![\p{L}])/u, eventType: 'amend', rule: 'Titel nennt eine Änderung' },
  {
    pattern: /^(?:Hinweis|Mitteilung|Bekanntmachung\s+der\s+Entscheidung|Ausschreibung|Stellenausschreibung|Stellenausschreibungen|Erteilung|Erlöschen|Verleihung|Besetzung|Allgemeinverfügung|Öffentliche|Veröffentlichung)\b/u,
    eventType: 'notice',
    rule: 'Titel kündigt eine bloße Bekanntgabe an',
  },
];

/** Gattungen des Seitenkopfs, die für sich schon eine neue Vorschrift belegen. */
const NEW_NORM_KINDS = new Set(['gesetz', 'verordnung', 'satzung', 'verwaltungsvorschrift', 'staatsvertrag']);

/**
 * Nennt der Titel überhaupt eine Rechtsvorschrift als Gegenstand? Das BayMBl. verkündet auch
 * Verwaltungsakte, und deren Titel sehen aus wie Normereignisse: „Aufhebung der bergrechtlichen
 * Erlaubnis ‚Augsburg-Ost‘“, „Aufhebung der Ausschreibung einer Schulratsstelle“, „Änderung der
 * Anschrift der honorarkonsularischen Vertretung“. Sie heben keine Vorschrift auf. Ohne
 * Gliederungsnummer und ohne Vorschriftenwort im Titel wird ein solcher Eintrag als `notice` geführt –
 * er bleibt im Register, zählt aber nicht als Ende einer Vorschrift.
 */
export const NORM_OBJECT_PATTERN =
  /\b(?:Gesetz|Gesetze|Gesetzes|Gesetzen|Verordnung|Verordnungen|Bekanntmachung|Bekanntmachungen|Richtlinie|Richtlinien|Verwaltungsvorschrift|Verwaltungsvorschriften|Satzung|Satzungen|Vorschrift|Vorschriften|Erlass|Erlasse|Erlasses|Statut|Statuts|Anordnung|Anordnungen|Staatsvertrag|Staatsvertrags|Abkommen|Ordnung|Tarifvertrag|Tarifverträge|Tarifvertrages|Schreiben|Verfassung)\b/u;

/** Ereignistypen, die eine Rechtsvorschrift als Gegenstand voraussetzen. */
const NORM_DIRECTED_TYPES: readonly EventType[] = ['amend', 'repeal', 'replace', 'recast', 'expire', 'extend'];

export interface PublicationClassificationOptions {
  /**
   * Führt die Plattform die Veröffentlichung unter einer Gliederungsnummer? Dann ist sie Teil der
   * Rechtssammlung, und die Prüfung auf ein Vorschriftenwort im Titel entfällt.
   */
  hasGliederungsnummer?: boolean;
  /** Verkündungsorgan – entscheidet über den Auffangfall (siehe unten). */
  organ?: 'gvbl' | 'baymbl';
}

/**
 * Grundtyp einer Veröffentlichung aus Titel und Gattungsangabe. `documentKind` kommt aus dem Seitenkopf
 * der Detailseite („Gesetz“, „Verordnung“, „Verwaltungsvorschrift“); fehlt er, entscheidet der Titel
 * allein.
 */
export function classifyPublication(title: string, documentKind?: string, options: PublicationClassificationOptions = {}): PublicationClassification {
  const normalized = normalizeQuote(title);
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(normalized)) {
      if (NORM_DIRECTED_TYPES.includes(rule.eventType) && options.hasGliederungsnummer !== true && !NORM_OBJECT_PATTERN.test(normalized)) {
        return { eventType: 'notice', rule: `${rule.rule}, der Gegenstand ist aber keine Rechtsvorschrift (kein Vorschriftenwort im Titel, keine Gliederungsnummer)` };
      }
      const subtype = rule.eventType === 'amend' ? amendSubtype(normalized, documentKind) : rule.subtype;
      return { eventType: rule.eventType, ...(subtype ? { subtype } : {}), rule: rule.rule };
    }
  }
  const kind = (documentKind ?? '').toLowerCase();
  if (NEW_NORM_KINDS.has(kind)) return { eventType: 'new', rule: `Gattungsangabe „${documentKind}“ ohne Änderungs- oder Aufhebungsmuster im Titel` };
  if (/^(?:Gesetz|Verordnung|Satzung)\s+(?:über|zur|zum|betreffend)\b/u.test(normalized)) return { eventType: 'new', rule: 'Titel benennt eine neue Vorschrift' };
  if (/^Bekanntmachung\b|^Richtlinien?\b|^Verwaltungsvorschrift\b|^Vollzug\b|^Gemeinsame\s+Bekanntmachung\b/u.test(normalized)) {
    return { eventType: 'new', rule: 'Titel benennt eine Bekanntmachung oder Richtlinie ohne Änderungsmuster' };
  }
  // Auffangfall des BayMBl.: Das Ministerialblatt verkündet weit überwiegend Bekanntgaben, die gar
  // keine Vorschriften sind – Stellenausschreibungen, Prüfungstermine, Hilfsmittelverzeichnisse,
  // Studienzeiten. Führt die Plattform sie **nicht** unter einer Gliederungsnummer, gehören sie nicht
  // zur Vorschriftensammlung; sie werden als Bekanntgabe geführt statt als unbestimmt. Mit
  // Gliederungsnummer bleibt es bei `unknown`: Dort ist die Einordnung offen und gehört auf die
  // Arbeitsliste.
  if (options.organ === 'baymbl' && options.hasGliederungsnummer !== true) {
    return { eventType: 'notice', rule: 'BayMBl.-Veröffentlichung ohne Gliederungsnummer und ohne Normereignis-Muster: Bekanntgabe außerhalb der Vorschriftensammlung' };
  }
  return { eventType: 'unknown', rule: 'kein Muster getroffen' };
}

/** Feinunterscheidung der Änderungsakte: Mantelakt, Änderungsgesetz oder Änderungsverordnung. */
function amendSubtype(title: string, documentKind?: string): EventSubtype | undefined {
  if (/\bund\s+weiterer\s+(?:Rechtsvorschriften|Vorschriften|Gesetze|Verordnungen)\b|\bweiterer\s+Rechtsvorschriften\b/u.test(title)) return 'mantelaenderung';
  const kind = (documentKind ?? '').toLowerCase();
  if (kind === 'gesetz' || /^Gesetz\b/u.test(title)) return 'aenderungsgesetz';
  if (kind === 'verordnung' || /^Verordnung\b/u.test(title)) return 'aenderungsverordnung';
  return undefined;
}

/* ------------------------------------------------------------------------------------ Daten */

/**
 * Inkrafttretensdatum aus der Schlussvorschrift. Erfasst werden die in Bayern gebräuchlichen Formen
 * einschließlich der Rückwirkung. Nennt der Text mehrere, gilt das **erste** – das ist die
 * Grundregel, spätere Sätze regeln Teilbereiche.
 */
export function extractEffectiveDate(text: string): string | undefined {
  const patterns = [
    /\b(?:tritt|treten)\s+(?:rückwirkend\s+)?(?:zum|am|mit\s+Wirkung\s+vom|mit\s+Wirkung\s+zum)\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+in\s+Kraft/u,
    /\b(?:tritt|treten)\s+am\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+in\s+Kraft/u,
    /\bmit\s+Wirkung\s+vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+in\s+Kraft/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const parsed = match === null ? undefined : parseLongGermanDate(match[1]!);
    if (parsed) return parsed;
  }
  return undefined;
}

/**
 * Außerkrafttretensdatum als **letzter Geltungstag**. „mit Ablauf des 31. Dezember 2025“ ist der
 * bayerische Regelfall und meint den letzten Geltungstag – das Datum wird unverändert übernommen.
 * „tritt am 1. Februar 2025 außer Kraft“ (ebenso „zum“, „mit Wirkung vom“) meint den ersten Tag ohne
 * Geltung; letzter Geltungstag ist der Vortag.
 */
export function extractTerminationDate(text: string): string | undefined {
  const lastDay = /\b(?:tritt|treten)\s+mit\s+Ablauf\s+des\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+außer\s+Kraft/u.exec(text);
  const lastDayParsed = lastDay === null ? undefined : parseLongGermanDate(lastDay[1]!);
  if (lastDayParsed) return lastDayParsed;
  const firstDayWithout = /\b(?:tritt|treten)\s+(?:am|zum|mit\s+Wirkung\s+vom)\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\s+außer\s+Kraft/u.exec(text);
  const firstDayParsed = firstDayWithout === null ? undefined : parseLongGermanDate(firstDayWithout[1]!);
  if (firstDayParsed) return previousDay(firstDayParsed);
  const inverted = /\baußer\s+Kraft\s+(?:tritt|treten)([^.]{0,40}?)(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/u.exec(text);
  const invertedParsed = inverted === null ? undefined : parseLongGermanDate(inverted[2]!);
  if (invertedParsed) return /\bAblauf\b/u.test(inverted![1]!) ? invertedParsed : previousDay(invertedParsed);
  return undefined;
}

function previousDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- Aufhebungslisten */

/**
 * Das BayMBl. hebt Verwaltungsvorschriften regelmäßig **als Liste** auf:
 *
 * ```text
 * 1.    Es werden folgende Verwaltungsvorschriften aufgehoben:
 * 1.1   Bekanntmachung … über die Vereinbarung über Richtlinien … vom 10. Juli 2006, Az. I5/… (AllMBl. S. 252),
 * 1.2   Bekanntmachung … über die Gewährung einer Entschädigung … vom 14. März 1978, Az. IX/… (AllMBl. S. 57),
 * 1.3   Schreiben … über die Grundsätze für die Zulassung … vom 28. April 2005, Az. I 4/2921/4/05.
 * 2.    Diese Bekanntmachung tritt am 1. Oktober 2026 in Kraft.
 * ```
 *
 * Der Aufhebungsbefehl steht hier **vor** den Zielen, nicht dahinter – `classifyCommand` findet ihn
 * deshalb nicht, und die Gliederungsnummern der Veröffentlichung bezeichnen nur die Sachgebiete, nicht
 * die einzelnen Vorschriften. Ohne diese Sonderbehandlung gingen genau die Belege verloren, die den
 * Stichtagsbestand offenlegen: aufgehobene Verwaltungsvorschriften, die das Portal heute nicht mehr
 * führt.
 *
 * Beachtet wird außerdem, dass ein Listenglied selbst ein eingebettetes Zitat tragen kann
 * („… des Gesetzes zum Schutze der arbeitenden Jugend (JArbSchG) vom 12. April 1976 (BGBl I S. 965) vom
 * 14. März 1978 …“). Maßgeblich ist deshalb immer das **letzte** Ausfertigungsdatum des Glieds.
 */
const REPEAL_LIST_TRIGGER = /\b(?:werden|wird)\s+(?:die\s+|der\s+|das\s+)?(?:folgende[nr]?|nachstehende[nr]?|hiermit\s+folgende[nr]?)\b[^:.]{0,120}\baufgehoben\b\s*:?|\baufgehoben\s*:\s*$/u;
/** Ein Listenglied endet die Liste, sobald die Schlussvorschrift beginnt. */
const REPEAL_LIST_END = /^\s*(?:Diese[rs]?\s+(?:Bekanntmachung|Verordnung|Richtlinie)|Die\s+Bekanntmachung\s+tritt)\b|\b(?:tritt|treten)\s+(?:am|mit|rückwirkend)\b/u;
/** Führende Gliederungsziffer eines Listenglieds („1.2 “, „a) “). */
const LIST_MARKER = /^\s*(?:\d+(?:\.\d+)*\.?|[a-z]\))\s+/u;
/** Das letzte Ausfertigungsdatum eines Listenglieds. */
const LAST_ENACTMENT = /\bvom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})\b(?![\s\S]*\bvom\s+\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}\b)/u;

/** Mindestlänge eines Listenglieds, damit es als Vorschriftenangabe gilt. */
const MIN_LIST_ITEM_LENGTH = 25;

/**
 * Aufgehobene Vorschriften aus einer Aufhebungsliste. Liefert eine leere Liste, wenn der Text keine
 * solche Liste enthält – dann gilt die gewöhnliche Befehlserkennung.
 */
export function scanRepealList(paragraphs: readonly string[]): CitedNorm[] {
  const triggerIndex = paragraphs.findIndex((paragraph) => REPEAL_LIST_TRIGGER.test(paragraph));
  if (triggerIndex < 0) return [];
  const found: CitedNorm[] = [];
  for (const paragraph of paragraphs.slice(triggerIndex + 1)) {
    const item = normalizeQuote(paragraph.replace(LIST_MARKER, ''));
    if (item === '') continue;
    if (REPEAL_LIST_END.test(item)) break;
    if (item.length < MIN_LIST_ITEM_LENGTH) continue;
    const enactment = LAST_ENACTMENT.exec(item);
    if (!enactment) continue;
    const enactmentDate = parseLongGermanDate(enactment[1]!);
    const title = normalizeQuote(item.slice(0, enactment.index)).replace(/[,;:]$/u, '').trim();
    if (title.length < 6 || !/^[A-ZÄÖÜ]/u.test(title)) continue;
    const tail = item.slice(enactment.index);
    const citation = /((?:GVBl|BayMBl|AllMBl|JMBl|FMBl|KWMBl)\.?\s*(?:\d{4}\s*)?(?:S\.|Nr\.)\s*\d+)/u.exec(tail)?.[1];
    const bayRs = /BayRS\s*([0-9A-Za-zÄÖÜäöü]+(?:[.\-/][0-9A-Za-zÄÖÜäöü]+)*)/u.exec(item)?.[1];
    const abbreviation = titleAbbreviation(title);
    const titleCandidates = [title];
    if (abbreviation?.form === 'dash') titleCandidates.push(normalizeQuote(title.slice(0, abbreviation.index)));
    found.push({
      ...(bayRs === undefined ? {} : { bayRsNumber: bayRs }),
      title,
      titleCandidates,
      ...(abbreviation === undefined ? {} : { abbreviation: abbreviation.abbreviation }),
      ...(enactmentDate === undefined ? {} : { enactmentDate }),
      ...(citation === undefined ? {} : { citation }),
      start: 0,
      end: 0,
      raw: toRawExcerpt(item),
    });
  }
  return found;
}

/** Wörtlicher Ausschnitt eines Listenglieds, auf die Länge eines Belegs gekürzt. */
function toRawExcerpt(item: string): string {
  return item.length <= 400 ? item : `${item.slice(0, 399).trimEnd()}…`;
}

/* --------------------------------------------------- Zielnorm aus dem Titel der Veröffentlichung */

/**
 * Die amtlichen Titel benennen ihr Ziel selbst: „Änderung **der Richtlinie zur Förderung der
 * Inklusion in der Kindertagesbetreuung**“, „Verordnung zur Änderung **der Zuständigkeitsverordnung**“,
 * „Aufhebung **der Bekanntmachung über das Sachverständigenwesen**“.
 *
 * Diese Ableitung ist keine Titelähnlichkeit, sondern eine Zerlegung des amtlichen Titels. Das Ergebnis
 * wird anschließend **vollständig** gegen den Bestand geprüft; passt es nicht Zeichen für Zeichen,
 * bleibt es folgenlos. Sie ist vor allem für das BayMBl. nötig: Verwaltungsvorschriften zitieren
 * einander ohne Gliederungsnummer, und die Gliederungsnummer der Veröffentlichung bezeichnet dort nur
 * ein Sachgebiet.
 *
 * Der deutsche Genitiv bleibt eine Grenze: „Änderung **des** 49. Jahreskrankenhausbauprogramms“ liefert
 * die gebeugte Form, die im Bestand so nicht steht. Dann passt nichts – und es wird nichts zugeordnet.
 */
const TARGET_FROM_TITLE: readonly RegExp[] = [
  /^(?:[A-ZÄÖÜ][\wÄÖÜäöüß-]*\s+)?zur\s+(?:Änderung|Aufhebung)\s+(?:der|des)\s+(.{6,200})$/u,
  /^(?:Änderung|Aufhebung|Berichtigung|Neufassung|Neubekanntmachung|Außerkrafttreten)\s+(?:der|des|von|vom)\s+(.{6,200})$/u,
  /^(?:Verlängerung|Weitergeltung|Fortgeltung)\s+der\s+Geltungsdauer\s+(?:der|des)\s+(.{6,200})$/u,
];

/** Zusätze hinter dem Titel, die nicht zum Namen der Vorschrift gehören. */
const TARGET_TITLE_TAIL = /\s*(?:;|\u2013|\u2014|\s-\s)\s.*$/u;

export function targetTitleFromPublicationTitle(title: string): string | undefined {
  const normalized = normalizeQuote(title);
  for (const pattern of TARGET_FROM_TITLE) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const candidate = match[1]!.replace(TARGET_TITLE_TAIL, '').trim();
    if (isPlausibleTitle(candidate)) return candidate;
  }
  return undefined;
}
