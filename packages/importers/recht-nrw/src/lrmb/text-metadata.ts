/**
 * Metadaten aus dem Text einer LRMB-Vorschrift (RECHT.NRW, Ministerialblatt):
 *
 *   Erlasskopf        „Runderlass / des Ministeriums der Finanzen / B 2905 - A 13 - IV A 2 / Vom 13. Dezember 2021“
 *                     „RdErl. d. Ministeriums für Umwelt … - VI-7 - 78.01.52 - v. 2.5.2003“
 *   Fundstellenverlauf „MBl. NRW. 2018 S. 242, geändert durch Runderlass vom 26. Juli 2021 (MBl. NRW. 2021 S. 535), …“
 *   Geltungsklauseln  „Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft und am 30. Juni 2022 außer Kraft.“
 *
 * Alle Angaben bleiben wörtlich erhalten (Aktenzeichen, Erlassnummern, Fundstellen); geparste Werte
 * sind zusätzliche Felder. Nicht erkannte Formen werden nicht geraten, sondern als unvollständig markiert.
 */
import { parseGermanDate, parseGermanLongDate } from '../common/source-identity.ts';

export interface HeadLine {
  text: string;
  centered: boolean;
  bold: boolean;
}

export type DecreeKind = 'runderlass' | 'gemeinsamer-runderlass' | 'erlass' | 'verwaltungsvorschrift' | 'bekanntmachung';

export interface LrmbHead {
  titleLines: string[];
  decreeKind?: DecreeKind;
  /** Wörtliche Erlasskopfzeile(n), z. B. „Runderlass des Ministeriums des Innern - 14 - 36.03 -“. */
  decreeText?: string;
  /** Herausgebende Stelle im Wortlaut des Kopfes („des Ministeriums des Innern“). */
  issuingAuthorityText?: string;
  /** Aktenzeichen/Erlassnummer im Wortlaut, ohne umschließende Striche. */
  fileReference?: string;
  issuedOn?: string;
  issuedText?: string;
  /** Zahl der Kopfabsätze, die nicht zum Normkörper gehören. */
  consumed: number;
}

const DECREE_START = /^(Gemeinsamer\s+Runderlass|Runderlass|RdErl\.|Erlass|Verwaltungsvorschrift|Bekanntmachung)(?=\s|$)/u;
const AUTHORITY_START = /^(?:des|der|d\.)(?:\s+|$)/u;
const ISSUED = /^(?:Vom|vom)\s+(\d{1,2}\.\s*\p{L}+\s+\d{4})\s*$/u;
const ISSUED_SHORT = /\bv\.\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})\s*$/u;

function decreeKindOf(word: string): DecreeKind {
  if (/^Gemeinsamer/u.test(word)) return 'gemeinsamer-runderlass';
  if (/^(Runderlass|RdErl\.)$/u.test(word)) return 'runderlass';
  if (word === 'Erlass') return 'erlass';
  if (word === 'Verwaltungsvorschrift') return 'verwaltungsvorschrift';
  return 'bekanntmachung';
}

const clean = (value: string): string => value.replace(/\s+/gu, ' ').replace(/\s+([,.;])/gu, '$1').trim();

/**
 * Liest den Erlasskopf aus den ersten Absätzen. Jeder Absatz ist bereits in Zeilen (`<br>`) zerlegt.
 * Der Kopf endet vor dem ersten nicht zentrierten Absatz nach Titel oder Erlasszeile.
 */
export function parseLrmbHead(paragraphs: ReadonlyArray<{ lines: string[]; centered: boolean; bold: boolean }>): LrmbHead {
  const head: LrmbHead = { titleLines: [], consumed: 0 };
  const decreeParts: string[] = [];
  let authority: string[] = [];
  let reference: string[] = [];
  let state: 'title' | 'authority' | 'reference' | 'done' = 'title';
  for (const [index, paragraph] of paragraphs.entries()) {
    const text = clean(paragraph.lines.join(' '));
    if (!text) {
      if (head.consumed === index) head.consumed = index + 1;
      continue;
    }
    if (!paragraph.centered && index > 0) break;
    if (!paragraph.centered && index === 0 && !DECREE_START.test(text)) break;
    for (const rawLine of paragraph.lines) {
      const line = clean(rawLine);
      if (!line) continue;
      const issued = ISSUED.exec(line);
      if (issued) {
        head.issuedText = line;
        const iso = parseGermanLongDate(issued[1]);
        if (iso) head.issuedOn = iso;
        state = 'done';
        continue;
      }
      const decree = DECREE_START.exec(line);
      const decreeRest = decree ? line.slice(decree[0].length).trim() : '';
      const nextLine = clean(paragraph.lines[paragraph.lines.indexOf(rawLine) + 1] ?? '');
      // Erlasszeile nur mit herausgebender Stelle („Runderlass des …“ oder „Runderlass“ + Zeile „des …“);
      // „Runderlass für die Fassung …“ oder „Verwaltungsvorschrift Technische Baubestimmungen …“ sind Titel.
      const isDecreeLine = decree !== null && (AUTHORITY_START.test(decreeRest) || (decreeRest === '' && AUTHORITY_START.test(nextLine)));
      if (decree && isDecreeLine && state !== 'done' && !head.decreeKind) {
        head.decreeKind = decreeKindOf(decree[1]!);
        decreeParts.push(line);
        const rest = line.slice(decree[0].length).trim();
        if (rest) {
          const short = ISSUED_SHORT.exec(rest);
          const withoutDate = short ? rest.slice(0, short.index).trim() : rest;
          if (short) {
            head.issuedText = short[0].trim();
            const iso = parseGermanDate(short[1]!.replace(/\s/gu, ''));
            if (iso) head.issuedOn = iso;
          }
          const split = /\s[-–]\s|\s[-–]$|\sAz\.\s/u.exec(withoutDate);
          if (split) {
            authority.push(withoutDate.slice(0, split.index));
            reference.push(withoutDate.slice(split.index));
            state = short ? 'done' : 'reference';
          } else {
            authority.push(withoutDate);
            state = short ? 'done' : 'authority';
          }
        } else {
          state = 'authority';
        }
        continue;
      }
      if (state === 'authority' && (AUTHORITY_START.test(line) || authority.length > 0) && !/^[-–]|^Az\./u.test(line) && !/\d/u.test(line)) {
        authority.push(line);
        decreeParts.push(line);
        continue;
      }
      if ((state === 'authority' || state === 'reference') && head.decreeKind) {
        const short = ISSUED_SHORT.exec(line);
        if (short) {
          head.issuedText = short[0].trim();
          const iso = parseGermanDate(short[1]!.replace(/\s/gu, ''));
          if (iso) head.issuedOn = iso;
          const before = line.slice(0, short.index).trim();
          if (before) reference.push(before);
          decreeParts.push(line);
          state = 'done';
          continue;
        }
        reference.push(line);
        decreeParts.push(line);
        state = 'reference';
        continue;
      }
      if (state === 'title' && paragraph.centered) head.titleLines.push(line);
    }
    head.consumed = index + 1;
    if (state === 'done') break;
  }
  if (decreeParts.length > 0) head.decreeText = clean(decreeParts.join(' '));
  const authorityText = clean(authority.join(' ')).replace(/[,\s]+$/u, '');
  if (authorityText) head.issuingAuthorityText = authorityText;
  const referenceText = clean(reference.join(' ')).replace(/^[-–\s]+|[-–\s]+$/gu, '').replace(/^Az\.\s*/u, 'Az. ').trim();
  if (referenceText) head.fileReference = referenceText;
  return head;
}

/**
 * Erlassangaben aus dem Seitentitel undatierter Altdatensätze, z. B.
 * „Verwaltungsvorschriften zur LANDESHAUSHALTSORDNUNG (VV - LHO) RdErl. d. Finanzministers v. 21 7 1972 -IDS-Tgb.Nr 3061/72¹)“.
 * Liefert nur, was eindeutig lesbar ist; OCR-Reste bleiben wörtlich.
 */
export function parseDecreeFromTitle(title: string): { title: string; decreeText: string; issuingAuthorityText: string; issuedOn?: string; issuedText: string; fileReference?: string } | undefined {
  const match = /^(.*?)\s+(RdErl\.|Runderlass|Gem\.\s*RdErl\.)\s+(d(?:\.|es|er))\s+(.+?)\s+v\.\s*(\d{1,2}[.\s]+\d{1,2}[.\s]+\d{4})\s*(?:[-–—]\s*(.*?))?\s*[¹²³]?\)?\s*$/u.exec(title.replace(/\s+/gu, ' ').trim());
  if (!match) return undefined;
  const dateText = match[5]!;
  const parts = dateText.split(/[.\s]+/u).filter(Boolean);
  const iso = parts.length === 3 ? parseGermanDate(`${parts[0]}.${parts[1]}.${parts[2]}`) : undefined;
  const result: { title: string; decreeText: string; issuingAuthorityText: string; issuedOn?: string; issuedText: string; fileReference?: string } = {
    title: match[1]!.trim(),
    decreeText: `${match[2]} ${match[3]} ${match[4]} v. ${dateText}${match[6] ? ` - ${match[6]}` : ''}`.trim(),
    issuingAuthorityText: `${match[3]} ${match[4]}`.trim(),
    issuedText: `v. ${dateText}`,
  };
  if (iso) result.issuedOn = iso;
  const reference = match[6]?.replace(/[¹²³)]+$/u, '').trim();
  if (reference) result.fileReference = reference;
  return result;
}

export interface GazetteCitation {
  gazette: 'MBl. NRW.' | 'SMBl. NRW.' | 'MB.NRW' | 'GV. NRW.';
  year: number;
  /** Seite mit Buchstabenzusatz („410a“) oder Ausgabennummer bei MB.NRW. */
  page?: string;
  number?: string;
  text: string;
}

export interface ChangeNoteAmendment {
  raw: string;
  decreeDateText: string;
  decreeDate?: string;
  /** Datum ohne Jahr in der Quelle („19. Februar“) – Jahr nur aus der Fundstelle ableitbar, nie geraten. */
  decreeDateIncomplete: boolean;
  citation?: GazetteCitation;
  /** „(n. v.)“: nicht veröffentlicht. */
  unpublished: boolean;
  /** Nur neues Format: „in Kraft getreten am …“. */
  inForce?: string;
}

export interface ChangeNote {
  raw: string;
  base?: GazetteCitation;
  amendments: ChangeNoteAmendment[];
  /** Ob der gesamte Text ohne Rest verstanden wurde. */
  complete: boolean;
}

/** Vereinheitlicht Leerzeichen um Satzzeichen („MBl . NRW.“, „( MBl. … )“). */
export function normalizeCitationText(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(/MBl\s*\.\s*NRW\s*\./gu, 'MBl. NRW.').replace(/MBL\.\s*NRW\./gu, 'MBl. NRW.').replace(/\(\s+/gu, '(').replace(/\s+\)/gu, ')').replace(/\s+,/gu, ',').trim();
}

const CITATION = /(MBl\. NRW\.|SMBl\. NRW\.|GV\. NRW\.)\s*(\d{4})\s*S\.\s*(\d+)\s*([a-z])?(?![\p{L}\d])/u;

export function parseGazetteCitation(value: string): GazetteCitation | undefined {
  const text = normalizeCitationText(value);
  const match = CITATION.exec(text);
  if (match) return { gazette: match[1] as GazetteCitation['gazette'], year: Number(match[2]), page: `${match[3]}${match[4] ?? ''}`, text: match[0].trim() };
  const mb = /MB\.\s?NRW\s+(\d{4})\s+Nr\.\s*(\d+)/u.exec(text);
  if (mb) return { gazette: 'MB.NRW', year: Number(mb[1]), number: mb[2]!, text: mb[0] };
  return undefined;
}

function parseDecreeDate(value: string): { iso?: string; incomplete: boolean } {
  const text = value.replace(/(\p{L})\.(\s+\d{4})/u, '$1$2');
  const long = parseGermanLongDate(text);
  if (long) return { iso: long, incomplete: false };
  const short = parseGermanDate(text);
  if (short) return { iso: short, incomplete: false };
  return { incomplete: /\d{1,2}\.\s*\p{L}+/u.test(text) };
}

/** Fundstellenverlauf am Ende des Textes bzw. im Änderungshistorie-Block. */
export function parseChangeNote(value: string): ChangeNote {
  const raw = normalizeCitationText(value);
  const note: ChangeNote = { raw, amendments: [], complete: false };
  const baseMatch = /^(MBl\. NRW\.|SMBl\. NRW\.)\s*\d{4}\s*S\.\s*\d+\s*[a-z]?/u.exec(raw);
  if (baseMatch) {
    const base = parseGazetteCitation(baseMatch[0]);
    if (base) note.base = base;
  }
  let rest = baseMatch ? raw.slice(baseMatch[0].length) : raw;
  rest = rest.replace(/^[\s,.]+/u, '');
  const amended = /^(?:zuletzt\s+)?geändert\s+durch\s+(?:Runderlasse?|Erlasse?|RdErl\.)\s+vom\s+/u.exec(rest);
  if (amended) {
    const list = rest.slice(amended[0].length);
    const pattern = /\s*([^()]+?)\s*\(([^()]*)\)\s*[,.]?/gu;
    let consumed = 0;
    for (const match of list.matchAll(pattern)) {
      if ((match.index ?? 0) !== consumed) break;
      consumed = (match.index ?? 0) + match[0].length;
      const dateText = match[1]!.replace(/^(?:und|sowie)\s+/u, '').trim();
      const inside = match[2]!.trim();
      const parsedDate = parseDecreeDate(dateText);
      const amendment: ChangeNoteAmendment = { raw: match[0].trim(), decreeDateText: dateText, decreeDateIncomplete: parsedDate.incomplete && !parsedDate.iso, unpublished: /^n\.\s*v\.?$/u.test(inside) };
      if (parsedDate.iso) amendment.decreeDate = parsedDate.iso;
      const citation = parseGazetteCitation(inside);
      if (citation) amendment.citation = citation;
      note.amendments.push(amendment);
    }
    note.complete = list.slice(consumed).replace(/[\s.]/gu, '') === '';
  } else {
    note.complete = rest.replace(/[\s.]/gu, '') === '';
  }
  return note;
}

/** Neues Format der Änderungshistorie (ab 2025): „Veröffentlichung: MB.NRW 2026 Nr. 94 Geändert durch Runderlass vom 10. April 2026, in Kraft getreten am 22. April 2026.“ */
export function parsePublicationHistoryItem(value: string): ChangeNoteAmendment | undefined {
  const raw = normalizeCitationText(value);
  const match = /Veröffentlichung:\s*(.+?)\s+Geändert\s+durch\s+(?:Runderlass|Erlass)\s+vom\s+(\d{1,2}\.\s*\p{L}+\s+\d{4})(?:,\s*in\s+Kraft\s+getreten\s+am\s+(\d{1,2}\.\s*\p{L}+\s+\d{4}))?/u.exec(raw);
  if (!match) return undefined;
  const amendment: ChangeNoteAmendment = { raw, decreeDateText: match[2]!, decreeDateIncomplete: false, unpublished: false };
  const decreeDate = parseGermanLongDate(match[2]);
  if (decreeDate) amendment.decreeDate = decreeDate;
  const citation = parseGazetteCitation(match[1]!);
  if (citation) amendment.citation = citation;
  const inForce = parseGermanLongDate(match[3]);
  if (inForce) amendment.inForce = inForce;
  return amendment;
}

export interface ValidityClause {
  kind: 'day-after-publication' | 'date' | 'retroactive-date';
  date?: string;
  text: string;
}

export interface ValidityClauses {
  inForce?: ValidityClause;
  expiry?: { date: string; text: string };
  /** Sätze mit Geltungsformeln, die nicht eindeutig verstanden wurden. */
  unparsed: string[];
}

const DATE = '(\\d{1,2}\\.\\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\.?\\s+\\d{4}|\\d{1,2}\\.\\s?\\d{1,2}\\.\\s?\\d{4})';
const SELF_SUBJECT = /^(?:\d+(?:\.\d+)*\s+)?(?:Inkrafttreten,?\s*(?:Außerkrafttreten)?\s*)?(?:(?:Dieser|Diese|Der|Die)\s+(?:Runderlass|Erlass|RdErl\.|Verwaltungsvorschriften?|Richtlinien?|Bestimmungen|Vorschriften|Durchführungserlass|Allgemeine\s+Verwaltungsvorschrift(?:en)?)(?![\p{L}])[^.]*?|(?:Er|Sie)\s+)(?:tritt|treten)\b/u;

function isoOf(text: string): string | undefined {
  const cleaned = text.replace(/(\p{L})\.(\s+\d{4})/u, '$1$2');
  return parseGermanLongDate(cleaned) ?? parseGermanDate(cleaned.replace(/\s/gu, ''));
}

/** Liest Inkraft- und Außerkrafttreten dieser Vorschrift (nicht anderer, mit aufgehobener Vorschriften). */
export function parseValidityClauses(texts: readonly string[]): ValidityClauses {
  const result: ValidityClauses = { unparsed: [] };
  const sentences = texts.flatMap((text) => text.replace(/\s+/gu, ' ').split(/(?<=[\p{Ll})\]]\.)\s+(?=[A-ZÄÖÜ])/u));
  for (const sentence of sentences) {
    const subject = SELF_SUBJECT.exec(sentence);
    if (!subject) continue;
    const inForce = new RegExp(`(?:tritt|treten)\\s+(?:(am\\s+Tag\\s+nach\\s+(?:der|ihrer|seiner)\\s+Veröffentlichung(?:\\s+im\\s+Ministerialblatt[^,.]*?)?)|am\\s+${DATE}|mit\\s+Wirkung\\s+vom\\s+${DATE})\\s+in\\s+Kraft`, 'u').exec(sentence);
    if (inForce && !result.inForce) {
      if (inForce[1]) result.inForce = { kind: 'day-after-publication', text: sentence };
      else if (inForce[2]) result.inForce = { kind: 'date', date: isoOf(inForce[2])!, text: sentence };
      else if (inForce[3]) result.inForce = { kind: 'retroactive-date', date: isoOf(inForce[3])!, text: sentence };
    }
    const expiry = new RegExp(`(?:mit\\s+Ablauf\\s+des|am)\\s+${DATE}\\s+außer\\s+Kraft`, 'u').exec(sentence);
    if (expiry && !result.expiry && (subject[0] !== '' || inForce)) {
      const date = isoOf(expiry[1]!);
      if (date) result.expiry = { date, text: sentence };
    }
    if (!inForce && !expiry && /in\s+Kraft|außer\s+Kraft/u.test(sentence)) result.unparsed.push(sentence);
  }
  return result;
}
