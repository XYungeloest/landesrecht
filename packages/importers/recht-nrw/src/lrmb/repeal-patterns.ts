/**
 * Aufhebungs-, Außerkrafttretens- und Ablösungsformeln in LRMB-Texten (Verwaltungsvorschriften und
 * Ministerialblatt-Einträge), gewonnen aus den realen Mustern des Bestands (Cache-Scan September 2026,
 * 6 493 Seiten und Einträge):
 *
 *   „Der RdErl. d. Ministers für … – III R – 8000.2.4 – v. 17.9.1980 (SMBl. NRW. 280) wird aufgehoben.“
 *   „Den RdErl. v. 10. 8. 1998 (SMBl. NRW. 20501) hebe ich auf.“
 *   „Die RdErl. v. 2. 11. 1964, 21. 10. 1980 und 23. 3. 1983 (SMB1. NRW. 20500) hebe ich mit der Maßgabe auf, …“
 *   „Der Runderlass … vom 11. Juli 2016 (MBl. NRW. S. 608) tritt gleichzeitig außer Kraft.“
 *   „Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.“
 *   „Die Bek. d. Landesregierung v. 21.3.1989 (MBl. NRW. S. 296/SMBl. NRW. 1110) ist gegenstandslos.“
 *   „Der Runderlass … vom 3. Januar 1994 (MBl. NRW. S. 1098), der durch Runderlass vom 2. Januar 1997
 *    (MBl. NRW. S. 121) geändert worden ist, wird aufgehoben.“
 *
 * Abgegrenzt werden Teilaufhebungen in Änderungsbefehlen („Satz 2 wird aufgehoben“, „Buchstabe a wird
 * aufgehoben“, „das Wort „und“ wird durch das Wort „oder“ ersetzt“): sie betreffen nie die ganze Vorschrift.
 *
 * Jede Aussage trägt ihren Satz wörtlich, die erkannte Formel, das Subjekt (`self`: der erlassende Text
 * selbst; `other`: eine bezeichnete andere Vorschrift; `partial`: Bestandteil; `unspecified`: kein
 * Vorschriftenkopf erkennbar), die genannten Kennungen (Datum, Fundstellen, SMBl-Nummer, Aktenzeichen)
 * und – wenn genannt – den Zeitpunkt. Nichts wird geraten: ohne Datum bleibt eine Zuordnung `supporting`.
 *
 * Verwendung: Auswertung im Review-Report (`common/review-report.ts`, `lrmb/historical-gap.ts`):
 * Nachfolgevorschriften als Gegenbeleg der Fortgeltung, eigene Außerkrafttretensformeln ohne Tagesdatum.
 * Die Geltungsentscheidung der Pipeline (`lrmb/validity.ts`) bleibt unverändert; eine Übernahme dorthin
 * wäre nur fail-closed zulässig (mehr Review, nie weniger Belegpflicht) und erhöht `LRMB_PARSER_VERSION`.
 */
import { parseGermanDate, parseGermanLongDate } from '../common/source-identity.ts';

export type RepealKind = 'repealed' | 'expired' | 'replaced' | 'obsolete' | 'not-applicable' | 'new-version';
export type RepealSubject = 'self' | 'other' | 'partial' | 'unspecified';

export interface RepealCitation {
  /** Wörtliche Fundstelle („SMBl. NRW. 20020“, „MBl. NRW. S. 479“). */
  text: string;
  gazette: 'SMBl' | 'MBl';
  /** SMBl-Gliederungsnummer („20020“). */
  smblNumber?: string;
  /** MBl-Seite (mit Buchstabenzusatz) und – falls genannt – Jahr. */
  page?: string;
  year?: number;
}

export interface RepealReference {
  dateText: string;
  date?: string;
  citations: RepealCitation[];
  /** Aktenzeichen im Wortlaut („IV C 3 – 4729“), falls neben dem Datum genannt. */
  fileReference?: string;
}

export interface RepealEffective {
  kind: 'date' | 'end-of-year' | 'simultaneous' | 'event';
  /** ISO-Datum bei `date` und `end-of-year`. */
  date?: string;
  text: string;
}

export interface RepealStatement {
  kind: RepealKind;
  subject: RepealSubject;
  /** Satz im Wortlaut (Leerraum normalisiert). */
  text: string;
  /** Formel, die den Befund trägt („wird aufgehoben“, „hebe ich … auf“). */
  phrase: string;
  /** Vorschriftenbezeichnung (Kopf der Nominalphrase, wörtlich) bei `other` und `self`. */
  head?: string;
  references: RepealReference[];
  effective?: RepealEffective;
  /** strong: bezeichnete andere Vorschrift mit Datum; supporting: Selbstaussage oder ohne Datum. */
  strength: 'strong' | 'supporting';
  /** Zeichenposition des Satzes im normalisierten Eingabetext. */
  offset: number;
}

const MONTHS = 'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember';
/** „17.9.1980“, „2. 11. 1964“, „12 2. 1963“ (Texterkennung), „13. Oktober 2000“, „30. Juli. 2014“. */
const DATE = `(?:\\d{1,2}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*\\d{4}|\\d{1,2}\\s+\\d{1,2}\\s*\\.\\s*\\d{4}|\\d{1,2}\\.\\s*(?:${MONTHS})\\.?\\s*\\d{4})`;
const DATE_RE = new RegExp(DATE, 'u');

/** Abkürzungen, deren Punkt keinen Satz beendet (Erlassköpfe, Fundstellen, Datumsangaben). */
const ABBREVIATIONS = new Set(['rderl', 'erl', 'bek', 'gem', 'abs', 'nr', 'nrn', 'art', 'ziff', 'buchst', 'halbs', 'mbl', 'smbl', 'smbi', 'mbi', 'mb1', 'smb1', 'gv', 'sgv', 'gabl', 'gabi', 'nrw', 'nw', 'bgbl', 'banz', 'tgb', 'az', 'vgl', 'bzw', 'ggf', 'usw', 'ca', 'str', 'sog', 'dr', 'prof', 'min', 'reg', 'bez', 'bl', 'ausg', 'bd', 'anl', 'bst', 'evtl', 'insb', 'kap', 'tit', 'ders', 'lit', 'zit', 'ff', 'mdj', 'prfm', 'rupr', 'rupmdj', 'inkl', 'einschl', 'vgi', 'jm', 'im', 'fm', 'mags', 'mswks']);

/** Ob der Punkt an Position `index` einen Satz beendet (Folgezeichen groß, Vorwort keine Abkürzung). */
const MONTH_RE = new RegExp(`^\\s+(?:${MONTHS})\\b`, 'u');

function isSentenceEnd(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const after = text.slice(index + 1, index + 40);
  const follows = /^[“"»)]?\s+(?:(?:\d+(?:\.\d+)*\.?|[IVX]+\.|[a-z]\))\s+)?[A-ZÄÖÜ„“"(]/u.test(after) || /^[“"»)]?\s*(?:;|$)/u.test(after);
  if (!follows) return false;
  const before = /([\p{L}\d]+)$/u.exec(text.slice(Math.max(0, index - 30), index));
  if (!before) return true;
  const token = before[1]!;
  if (/^\d+$/u.test(token)) {
    // Listennummer („1. Die …“) und Jahreszahl („… bis zum 30.9.2012. Gleichzeitig …“) beenden den Satz;
    // die Tagesangabe eines Datums („26. September“) nicht.
    if (/^(?:1[89]|20)\d{2}$/u.test(token)) return /^\s+[A-ZÄÖÜ„]/u.test(after);
    return token.length <= 3 && /^\s+[A-ZÄÖÜ„]/u.test(after) && !MONTH_RE.test(after) && /(?:^|\s)$/u.test(text.slice(Math.max(0, index - 30), index - token.length));
  }
  if (/\d/u.test(token)) return !ABBREVIATIONS.has(token.toLowerCase());
  if (token.length <= 2) return false;
  return !ABBREVIATIONS.has(token.toLowerCase());
}

function sentenceStart(text: string, from: number): number {
  for (let index = from - 1; index >= 0; index -= 1) {
    const char = text[index]!;
    if ((char === '.' && isSentenceEnd(text, index)) || char === ';' || char === '!' || char === '?') return index + 1;
    if (char === ':') return index + 1;
  }
  return 0;
}

function sentenceEnd(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]!;
    if ((char === '.' && isSentenceEnd(text, index)) || char === ';' || char === '!' || char === '?') return index + 1;
  }
  return text.length;
}

function crossesSentenceEnd(text: string, from: number, to: number): boolean {
  for (let index = from; index < to - 1; index += 1) if (text[index] === '.' && isSentenceEnd(text, index)) return true;
  return false;
}

interface VerbPattern {
  kind: RepealKind;
  pattern: RegExp;
  /** Bezug steht hinter der Formel (Passiv „aufgehoben durch …“, „An die Stelle der … treten“). */
  objectAfter?: boolean;
}

const VERB_PATTERNS: readonly VerbPattern[] = [
  { kind: 'repealed', pattern: /\b(?:wird|werden|ist|sind)\s+(?:hiermit\s+|damit\s+|gleichzeitig\s+|zugleich\s+|insoweit\s+)?aufgehoben\b(?!\s+durch)/gu },
  { kind: 'repealed', pattern: /\b(?:ist|sind|wurde|wurden)\s+(?:bereits\s+)?aufgehoben\s+durch\b/gu, objectAfter: true },
  { kind: 'repealed', pattern: /\bhebe\s+ich\b[^;]{0,160}?\bauf\b/gu },
  { kind: 'repealed', pattern: /\b(?:wird|werden)\s+(?:hiermit\s+)?außer\s+Kraft\s+gesetzt\b/gu },
  { kind: 'expired', pattern: /\b(?:tritt|treten)\b[^;]{0,140}?\baußer\s+Kraft\b/gu },
  { kind: 'expired', pattern: /\b(?:ist|sind)\s+(?:am|mit\s+Ablauf\s+des)\s+[^;]{0,40}?\baußer\s+Kraft\s+getreten\b/gu },
  { kind: 'expired', pattern: /\bverliert\s+(?:seine|ihre)\s+Gültigkeit\b/gu },
  { kind: 'expired', pattern: new RegExp(`\\b(?:gilt|gelten|ist\\s+befristet|sind\\s+befristet)\\s+(?:längstens\\s+)?bis\\s+(?:zum\\s+|einschließlich\\s+)?(?:Ablauf\\s+des\\s+)?${DATE}`, 'gu') },
  { kind: 'replaced', pattern: /\b(?:wird|werden)\s+(?:[^;]{0,160}?\s+)?(?:ersetzt|abgelöst)\b/gu },
  { kind: 'replaced', pattern: /\ban\s+(?:seine|ihre|deren|dessen)\s+Stelle\s+(?:tritt|treten)\b/gu },
  { kind: 'replaced', pattern: /\b[Aa]n\s+die\s+Stelle\s+(?:der|des)\s+[^;]{0,160}?\b(?:tritt|treten)\b/gu, objectAfter: true },
  { kind: 'obsolete', pattern: /\b(?:ist|sind|wird|werden)\s+(?:damit\s+|hiermit\s+|somit\s+)?gegenstandslos\b(?:\s+geworden)?/gu },
  { kind: 'not-applicable', pattern: /\b(?:ist|sind)\b[^;]{0,160}?\bnicht\s+mehr\s+anzuwenden\b/gu },
  { kind: 'new-version', pattern: /\b(?:wird|werden)\s+(?:wie\s+folgt\s+)?neu\s+gefasst\b|\berh(?:ält|alten)\s+folgende\s+Fassung\b/gu },
];

const NOUN = '(?:Runderlass(?:e|es)?|Runderlaß|RdErl\\.|Rd\\.?\\s?Erl\\.|Erlass(?:e|es)?|Erlaß|Bek\\.|Bekanntmachung(?:en)?|Richtlinien?|Verwaltungsvorschrift(?:en)?|Verwaltungsverordnung|Allgemeine\\s+Verfügung(?:en)?|Allgemeinverfügung|Allgemeine\\s+Erlaubnis|Satzung|Geschäftsordnung|Kopferlass|Rahmen\\p{L}+|Bestimmungen|Grundsätze|Anordnung(?:en)?|Verfügung(?:en)?|Vereinbarung|Prüfungsordnung|Wahlordnung|Dienstanweisung(?:en)?|Leitlinien?|Empfehlungen|Rundverfügung(?:en)?|Ausführungsbestimmungen|Durchführungsbestimmungen|Durchführungserlass|VV|AVV|Verwaltungsanordnung(?:en)?|Beurteilungsrichtlinien?|Förderrichtlinien?|Regelung(?:en)?|Hinweise|Richtwerte|Muster(?:erlass)?|Sprachprüfungsordnung|Lohntarifvertrag|Tarifvertrag|Vertragsbedingungen)';
const DETERMINER = '(?:Der|Die|Das|Den|Mein|Meine|Meinen|Unser|Unsere|Unseren|Dieser|Diese|Dieses|Folgende[rnms]?|Alle|Sämtliche|Beide|meine|meinen|die|der|den|das)';
const ADJECTIVE = '(?:gemeinsame[rnms]?|gem\\.|Gem\\.|bisherige[rnms]?|vorstehende[rnms]?|nachstehende[rnms]?|nicht\\s+veröffentlichte[rnms]?|vorläufige[rnms]?|frühere[rnms]?|genannte[rnms]?|o\\.\\s?a\\.|oben\\s+genannte[rnms]?|vorgenannte[rnms]?|entsprechende[rnms]?|bestehende[rnms]?|geltende[rnms]?|alte[rnms]?|bezeichnete[rnms]?|sonstige[rnms]?|bekannt\\s?gegebene[rnms]?)';
/** Nummern, Überschriftenwörter und Adverbien vor dem Subjekt („10 Aufhebungsvorschrift Der RdErl. …“, „Gleichzeitig …“). */
const PREFIX = '^(?:(?:\\d+(?:\\.\\d+)*\\.?|[IVX]+\\.|[a-z]\\)|\\(\\d+\\))\\s+)*(?:(?:Gleichzeitig|Hiermit|Damit|Zugleich|Ferner|Außerdem|Im\\s+Übrigen|Mit\\s+Inkrafttreten\\s+dieses\\s+(?:Runderlasses|Erlasses))\\s*,?\\s+)?(?:(?:In-?[Kk]raft-?[Tt]reten|Außerkrafttreten|Inkrafttreten|Aufhebung(?:svorschrift|en)?|Schlussbestimmung(?:en)?|Übergangs-\\s+und\\s+Schlussbestimmungen|Aufgehobene\\s+Verwaltungsvorschriften?|Aufhebung\\s+(?:des|von)\\s+[\\p{L}\\s]{3,40}?)\\s*[,/]?\\s+)*';
const PREFIX_RE = new RegExp(PREFIX, 'u');
const HEAD_RE = new RegExp(`${PREFIX}(?:${DETERMINER}\\s+)?(?:${ADJECTIVE}\\s+)*(${NOUN})(?![\\p{L}-])`, 'u');
const SELF_RE = new RegExp(`${PREFIX}(?:(?:Dieser|Diese|Dieses)\\s+(?:${ADJECTIVE}\\s+)*${NOUN}|(?:Der|Die)\\s+vorliegende[rn]?\\s+${NOUN}|(?:Er|Sie|Es)\\b)`, 'u');
const PARTIAL_RE = new RegExp('^(?:(?:\\d+(?:\\.\\d+)*\\.?|[IVX]+\\.|[a-z]{1,2}\\)|[a-z]{1,2}\\.)\\s+)*(?:(?:In|Im)\\s+)?(?:(?:der|die|das|den|dem|Der|Die|Das|Den|Dem)\\s+)?(?:bisherige[rnms]?\\s+|neue[rnms]?\\s+)?(?:Nummern?|Nr\\.|Nrn\\.|Satz|Sätze|Absatz|Absätze|Abs\\.|Buchstaben?|Buchst\\.|Anlagen?|Angaben?|Wort|Wörter|Zahl|Punkt|Komma|Spiegelstrich(?:e)?|Halbsatz|Teil|Abschnitt|Ziffern?|Ziff\\.|Überschrift|Fußnoten?|Tabelle|Zeile|Unterabsatz|Doppelbuchstabe|Klammerzusatz|Inhaltsübersicht|Inhaltsverzeichnis|Gliederungsnummer|Bezeichnung|Datum|Verweis|Vorbemerkung|Präambel|\\d+(?:\\.\\d+)*|[a-z]{1,2}\\)|[a-z]{1,2}\\.)(?![\\p{L}-])', 'u');
const CITATION_RE = /\b(S?MB[lI1]\.?\s*(?:NRW\.?|NW\.?)?\s*(?:(\d{4})\s*)?(?:S\.\s*(\d+)\s*([a-z])?|(\d{2,7})))(?![\d])/gu;
/** Nebensätze über frühere Änderungen der bezeichneten Vorschrift – ihre Daten sind keine Aufhebungsbezüge. */
const AMENDMENT_CLAUSE = new RegExp(`,?\\s*(?:(?:der|die|das)\\s+(?:zuletzt\\s+)?durch\\s+[^,]*?geändert\\s+worden\\s+ist|(?:zuletzt\\s+)?geändert\\s+durch\\s+(?:RdErl\\.|Runderlass|Erlass|Gem\\.\\s*RdErl\\.)?\\s*(?:v\\.|vom)\\s*${DATE}\\s*(?:\\([^)]*\\))?(?:\\s*,\\s*${DATE}\\s*(?:\\([^)]*\\))?)*|i\\.\\s?d\\.\\s?F\\.\\s+(?:der\\s+Änderung(?:en)?\\s+)?(?:v\\.|vom)\\s*${DATE}(?:\\s*,\\s*${DATE})*(?:\\s*\\([^)]*\\))?|neugefasst\\s+durch\\s+(?:RdErl\\.|Runderlass)\\s+(?:v\\.|vom)\\s*${DATE}(?:\\s*,\\s*[^,]{0,40})?)`, 'gu');

/** Inkrafttretensangaben („tritt mit Wirkung vom 1.1.2008 in Kraft“) sind keine Bezüge auf andere Vorschriften. */
const IN_FORCE_DATE = new RegExp(`\\b(?:mit\\s+Wirkung\\s+)?(?:vom|am|zum|ab\\s+dem|ab)\\s+${DATE}(?=\\s+(?:in\\s+Kraft\\b|an\\b|wirksam\\b))`, 'gu');

function withoutInForceDates(text: string): string {
  return text.replace(IN_FORCE_DATE, ' ');
}

function parseDate(text: string): string | undefined {
  const compact = text.replace(/\s+/gu, ' ').trim();
  const numeric = /^(\d{1,2})[.\s]+(\d{1,2})[.\s]+(\d{4})$/u.exec(compact.replace(/\s*\.\s*/gu, '.'));
  if (numeric) return parseGermanDate(`${numeric[1]}.${numeric[2]}.${numeric[3]}`);
  return parseGermanLongDate(compact.replace(/(\p{L})\.(\s+\d{4})/u, '$1$2'));
}

function citationsIn(text: string): RepealCitation[] {
  const result: RepealCitation[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const gazette = match[1]!.startsWith('S') ? 'SMBl' : 'MBl';
    const citation: RepealCitation = { text: match[1]!.replace(/\s+/gu, ' ').trim(), gazette };
    if (match[5]) {
      if (gazette === 'SMBl') citation.smblNumber = match[5];
      else citation.page = match[5];
    } else if (match[3]) citation.page = `${match[3]}${match[4] ?? ''}`;
    if (match[2]) citation.year = Number(match[2]);
    result.push(citation);
  }
  return result;
}

function fileReferenceIn(before: string, tail: string): string | undefined {
  const cleanedTail = tail.replace(/\(\s*n\.\s*[vV]\.\s*\)/gu, '').trim();
  const afterDate = /^[-–—]\s*(.{2,60}?)\s*(?:[-–—]\s*(?:,|\(|$)|\(|,|$)/u.exec(cleanedTail);
  if (afterDate && /\d/u.test(afterDate[1]!)) return afterDate[1]!.trim();
  // „… Soziales – III R – 8000.2.4 – v. 17.9.1980“: Aktenzeichen zwischen dem letzten Wort der Stelle und dem Datum.
  const head = before.replace(/(?:v\.|vom)\s*$/u, '').trim();
  if (!/[-–—]$/u.test(head)) return undefined;
  const words = [...head.matchAll(/\p{L}{3,}[,.]?\s+[-–—]\s+/gu)];
  const last = words[words.length - 1];
  if (!last) return undefined;
  const reference = head.slice((last.index ?? 0) + last[0].length).replace(/\s*[-–—]$/u, '').trim();
  return /\d/u.test(reference) && !DATE_RE.test(reference) && reference.length <= 60 ? reference : undefined;
}

/** Datumsangaben einer Vorschriftenbezeichnung mit den jeweils folgenden Fundstellen und dem Aktenzeichen. */
function referencesIn(phrase: string): RepealReference[] {
  const cleaned = withoutInForceDates(phrase.replace(AMENDMENT_CLAUSE, ' '));
  const dates = [...cleaned.matchAll(new RegExp(`(?:\\b(?:vom|v\\.|und|u\\.|sowie|bzw\\.)\\s*|,\\s*)(${DATE})`, 'gu'))];
  const references: RepealReference[] = [];
  for (const [position, match] of dates.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = position + 1 < dates.length ? dates[position + 1]!.index ?? cleaned.length : cleaned.length;
    const tail = cleaned.slice(start, end);
    const reference: RepealReference = { dateText: match[1]!.replace(/\s+/gu, ' ').trim(), citations: citationsIn(tail) };
    const iso = parseDate(match[1]!);
    if (iso) reference.date = iso;
    const fileReference = fileReferenceIn(cleaned.slice(0, match.index ?? 0), tail);
    if (fileReference) reference.fileReference = fileReference;
    references.push(reference);
  }
  return references;
}

function effectiveIn(sentence: string, verbIndex: number, verbLength: number): RepealEffective | undefined {
  const regionStart = Math.max(0, verbIndex - 80);
  const region = sentence.slice(regionStart);
  const phraseEnd = verbIndex + verbLength - regionStart;
  const dated = [...region.matchAll(new RegExp(`\\b(?:mit\\s+Ablauf\\s+des|am|zum|bis\\s+zum|bis\\s+einschließlich|bis)\\s+(${DATE})`, 'gu'))];
  // „tritt am 1. August 2022 in Kraft und am 31. Juli 2026 außer Kraft“: die letzte Angabe vor dem Ende der Formel;
  // „Sie tritt außer Kraft am 31. Dezember 2012“: die erste Angabe danach.
  const inside = dated.filter((match) => (match.index ?? 0) < phraseEnd);
  const chosen = inside[inside.length - 1] ?? dated.find((match) => (match.index ?? 0) >= phraseEnd);
  if (chosen) {
    const date = parseDate(chosen[1]!);
    if (date) return { kind: 'date', date, text: chosen[0].replace(/\s+/gu, ' ') };
  }
  const yearEnd = /\bmit\s+Ablauf\s+des\s+(?:Haushalts|Kalender|Schul|Rechnungs)?[Jj]ahr(?:e)?s\s+(\d{4})\b/u.exec(region);
  if (yearEnd) return { kind: 'end-of-year', date: `${yearEnd[1]}-12-31`, text: yearEnd[0] };
  const simultaneous = /\b(?:gleichzeitig|zugleich|zeitgleich|zum\s+selben\s+Zeitpunkt|zum\s+gleichen\s+Zeitpunkt|ab\s+diesem\s+Zeitpunkt|mit\s+sofortiger\s+Wirkung|ab\s+sofort|mit\s+(?:dem\s+)?In-?[Kk]raft-?[Tt]reten|mit\s+(?:der\s+)?(?:Veröffentlichung|Bekanntgabe|Bekanntmachung)\b|mit\s+Ablauf\s+dieses\s+Datums|zum\s+selben\s+Tag|vom\s+gleichen\s+Zeitpunkt\s+an)/iu.exec(region);
  if (simultaneous) return { kind: 'simultaneous', text: simultaneous[0].replace(/\s+/gu, ' ') };
  const event = /\b(?:nach\s+Ablauf\s+von\s+[^.;]{1,40}?\b(?:Jahren|Monaten)|mit\s+Ablauf\s+(?:des|der)\s+[^.;]{3,80}?(?=\s+außer))/u.exec(region);
  if (event) return { kind: 'event', text: event[0].replace(/\s+/gu, ' ') };
  return undefined;
}

export function normalizeRepealText(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(/\s+([,.;:)])/gu, '$1').replace(/\(\s+/gu, '(').trim();
}

function headOf(phrase: string): string | undefined {
  const head = HEAD_RE.exec(phrase);
  return head ? head[0].replace(PREFIX_RE, '').trim() : undefined;
}

/**
 * Erkennt Aufhebungs-, Außerkrafttretens-, Ablösungs- und Neufassungsaussagen in einem Text oder in
 * Absätzen (Absätze werden mit Satzgrenze verbunden). Deterministisch nach Position sortiert; je Satz und
 * Formel entsteht genau eine Aussage.
 */
export function detectRepealStatements(input: string | readonly string[]): RepealStatement[] {
  const text = normalizeRepealText(typeof input === 'string' ? input : input.map((part) => part.trim()).filter(Boolean).map((part) => (/[.;:!?]$/u.test(part) ? part : `${part}.`)).join(' '));
  const statements: RepealStatement[] = [];
  const seen = new Set<string>();
  for (const { kind, pattern, objectAfter } of VERB_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const verbIndex = match.index;
      const verbEnd = verbIndex + match[0].length;
      if (crossesSentenceEnd(text, verbIndex, verbEnd)) {
        // Die Formel reicht über ein Satzende („… in Kraft. Er tritt … außer Kraft“): hinter dem Verb weitersuchen.
        pattern.lastIndex = verbIndex + 1;
        continue;
      }
      const start = sentenceStart(text, verbIndex);
      const end = sentenceEnd(text, verbEnd);
      const sentence = text.slice(start, end).trim();
      const key = `${start}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const subjectText = withoutInForceDates(text.slice(start, verbIndex)).replace(/\s+/gu, ' ').trim();
      const phrase = match[0].replace(/\s+/gu, ' ');
      const statement: RepealStatement = { kind, subject: 'unspecified', text: sentence, phrase, references: [], strength: 'supporting', offset: start };
      // Objekt der Formel: vor dem Verb („Den RdErl. v. … hebe ich auf“), in der Formel („hebe ich meine Erlasse v. … auf“) oder dahinter (Passiv, „An die Stelle der …“).
      // Objekt in der Formel: „hebe ich meine Erlasse v. … auf“, „treten die Richtlinien vom … außer Kraft“, „sind die Grundsätze … nicht mehr anzuwenden“.
      const inlineObject = /^hebe\s+ich\b/u.test(phrase)
        ? phrase.replace(/^hebe\s+ich\s+(?:hiermit\s+|damit\s+|gleichzeitig\s+|zugleich\s+)?/u, '').replace(/\s+auf$/u, '')
        : /^(?:tritt|treten|ist|sind|wird|werden)\s+(?:die|der|das|den|meine|mein|folgende|alle|sämtliche)\b/u.test(phrase)
          ? phrase.replace(/^(?:tritt|treten|ist|sind|wird|werden)\s+/u, '').replace(/\s+(?:außer\s+Kraft|nicht\s+mehr\s+anzuwenden|ersetzt|abgelöst|aufgehoben|gegenstandslos(?:\s+geworden)?)$/u, '').replace(/^(?:die|der|das|den)\b/u, 'Die')
          : '';
      const afterObject = /^[Aa]n\s+die\s+Stelle\b/u.test(phrase) ? phrase.replace(/^[Aa]n\s+die\s+Stelle\s+(?:der|des)\s+/u, 'Der ').replace(/\s+(?:tritt|treten)$/u, '') : text.slice(verbEnd, end).trim().replace(/^(?:durch|der|des)\s+/u, 'Der ');
      const candidates = objectAfter ? [afterObject] : [subjectText, inlineObject].filter(Boolean);
      const effective = effectiveIn(sentence, verbIndex - start, match[0].length);
      if (PARTIAL_RE.test(subjectText) && !HEAD_RE.test(subjectText)) {
        statement.subject = 'partial';
      } else if (SELF_RE.test(subjectText) && !DATE_RE.test(subjectText)) {
        statement.subject = 'self';
        const head = headOf(subjectText);
        if (head) statement.head = head;
      } else {
        const object = candidates.find((candidate) => headOf(candidate) !== undefined);
        const head = object ? headOf(object) : undefined;
        const references = object ? referencesIn(object) : [];
        if (head && object && references.length === 0 && !objectAfter && /^(?:Der|Die|Das)\s/u.test(object.replace(PREFIX_RE, '')) && effective?.kind !== 'simultaneous' && (kind === 'expired' || kind === 'not-applicable')) {
          // „Der RdErl. tritt mit Wirkung vom 1.2.2004 in Kraft und mit Ablauf des 31.12.2008 außer Kraft.“ – ohne Datum: der Text selbst.
          statement.subject = 'self';
          statement.head = head;
        } else if (head) {
          statement.subject = 'other';
          statement.head = head;
          statement.references = references;
        }
      }
      if (kind === 'new-version' && statement.subject !== 'other' && statement.subject !== 'self') statement.subject = 'partial';
      if (kind === 'replaced' && statement.subject === 'unspecified' && /\b(?:Wort|Wörter|Angabe|Zahl|Bezeichnung|Datum|Satz|Nummer|Buchstabe|Absatz)\b/u.test(subjectText)) statement.subject = 'partial';
      if (effective && kind !== 'new-version' && kind !== 'obsolete') statement.effective = effective;
      statement.strength = statement.subject === 'other' && statement.references.some((reference) => reference.date) ? 'strong' : 'supporting';
      statements.push(statement);
    }
  }
  return statements.sort((left, right) => left.offset - right.offset || left.kind.localeCompare(right.kind));
}

/** Aussagen, die den erlassenden Text selbst betreffen. */
export function selfStatements(statements: readonly RepealStatement[]): RepealStatement[] {
  return statements.filter((statement) => statement.subject === 'self');
}

/** Aussagen über andere, bezeichnete Vorschriften (mögliche Nachfolge- oder Aufhebungsbelege). */
export function otherStatements(statements: readonly RepealStatement[]): RepealStatement[] {
  return statements.filter((statement) => statement.subject === 'other');
}

export interface RepealTarget {
  /** Ausfertigungsdatum der Vorschrift (ISO). */
  issuedOn?: string;
  smblNumber?: string;
  /** Stammfundstelle im Ministerialblatt (Seite, ggf. Jahr). */
  gazettePage?: string;
  gazetteYear?: number;
  fileReference?: string;
  /** Titel (für Stichwortabgleich). */
  title?: string;
}

export interface RepealMatch {
  statement: RepealStatement;
  reference: RepealReference;
  /** Übereinstimmende Merkmale; das Datum ist Pflicht. */
  matched: Array<'date' | 'smbl-number' | 'gazette-page' | 'file-reference' | 'title-keyword'>;
  /** strong: Datum plus Fundstelle, SMBl-Nummer oder Aktenzeichen; weak: nur Datum (ggf. mit Titelstichwort). */
  level: 'strong' | 'weak';
}

const STOPWORDS = new Set(['verwaltungsvorschriften', 'verwaltungsvorschrift', 'runderlass', 'richtlinien', 'richtlinie', 'landes', 'nordrhein', 'westfalen', 'ministerium', 'ministeriums', 'ministers', 'durchführung', 'bestimmungen', 'grundsätze', 'gesetz', 'gesetzes', 'verordnung', 'bekanntmachung', 'allgemeine', 'allgemeinen', 'landesregierung', 'anwendung', 'ausführung', 'gewährung', 'zuwendungen', 'förderung']);

export function titleKeywords(title: string): string[] {
  return [...new Set((title.toLowerCase().match(/\p{L}{8,}/gu) ?? []).filter((word) => !STOPWORDS.has(word)))];
}

/**
 * Ordnet Aussagen über andere Vorschriften einer Zielvorschrift zu. Pflicht ist ein übereinstimmendes
 * Ausfertigungsdatum; `strong` nur mit zusätzlicher Fundstelle, SMBl-Nummer oder Aktenzeichen. Eine
 * Zuordnung ist ein Prüfhinweis für die fachliche Entscheidung, nie eine automatische Relation.
 */
export function matchRepealStatements(statements: readonly RepealStatement[], target: RepealTarget): RepealMatch[] {
  if (!target.issuedOn) return [];
  const keywords = target.title ? titleKeywords(target.title) : [];
  const targetPage = target.gazettePage?.replace(/[a-z]$/u, '');
  const matches: RepealMatch[] = [];
  for (const statement of statements) {
    if (statement.subject !== 'other') continue;
    for (const reference of statement.references) {
      if (reference.date !== target.issuedOn) continue;
      const matched: RepealMatch['matched'] = ['date'];
      if (target.smblNumber && reference.citations.some((citation) => citation.smblNumber === target.smblNumber)) matched.push('smbl-number');
      if (targetPage && reference.citations.some((citation) => citation.gazette === 'MBl' && citation.page?.replace(/[a-z]$/u, '') === targetPage && (!citation.year || !target.gazetteYear || citation.year === target.gazetteYear))) matched.push('gazette-page');
      if (target.fileReference && reference.fileReference && reference.fileReference.replace(/[\s–—-]+/gu, '') === target.fileReference.replace(/[\s–—-]+/gu, '')) matched.push('file-reference');
      const lowered = statement.text.toLowerCase();
      if (keywords.some((word) => lowered.includes(word))) matched.push('title-keyword');
      matches.push({ statement, reference, matched, level: matched.some((item) => item === 'smbl-number' || item === 'gazette-page' || item === 'file-reference') ? 'strong' : 'weak' });
    }
  }
  return matches;
}
