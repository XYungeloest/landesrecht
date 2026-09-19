/**
 * Parser der juris-PDF-Ausgabe (Bürgerservice Schleswig-Holstein) → Dokumentmodell mit Normkörper.
 *
 * Aufbau einer Ausgabe (belegt an der Stichprobe, `data/audits/juris-sh/SAMPLE_REPORT.md`):
 *
 *   Kopf           „Schlüssel: Wert“-Zeilen (Amtliche/juris-Abkürzung, Ausfertigungsdatum, Gültig ab/bis,
 *                  Dokumenttyp, Fundstelle, Gliederungs-Nr; bei VwV Normgeber, Aktenzeichen, Erlassdatum)
 *   Titel          zentrierte Zeilen
 *   Ausgabevermerk „Gesamtausgabe in der Gültigkeit vom … bis …“ bzw. „Zum … aktuellste verfügbare Fassung
 *                  der Gesamtausgabe“; bei aufgehobenen Normen ein Vermerk („V aufgeh. durch …“)
 *   Stand          „Stand: letzte berücksichtigte Änderung: …“
 *   Verzeichnis    „Nichtamtliches Inhaltsverzeichnis“ – redaktionell (juris), nicht Normtext; je Einheit
 *                  Bezeichnung, Überschrift und „Gültig ab (bis)“
 *   Normtext       zentrierte Gliederungs- und Einzelnormüberschriften, linksbündige Absätze, Nummern mit
 *                  hängendem Einzug, Fußnoten („Fußnoten“, „*)“), Anlagen
 *
 * Fail-closed: Was der Parser nicht sicher zuordnen kann, wird als Befund gemeldet (Tabellenlayout,
 * Abbildungsseiten, unbekannte Überschrift, Verzeichnis ohne Entsprechung im Normtext). Befunde der Stufe
 * `warning` führen die Norm in den Review; der Text bleibt dabei vollständig erhalten (Textintegrität).
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { isCentered, type PdfLayout, type PdfLine } from './pdf-layout.ts';

export interface ParseFinding {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  page?: number;
}

export interface TocEntry {
  label?: string;
  title: string;
  validFrom?: string;
  validTo?: string;
}

export interface ParsedJurisPdf {
  header: Record<string, string>;
  title: string;
  titleLines: string[];
  edition?: { text: string; validFrom?: string; validTo?: string; currentAsOf?: string };
  /** Vermerk statt Normtext (aufgehobene Normen): „V aufgeh. durch …“. */
  statusNote?: string;
  stand?: string;
  /** Nur bei VwV-Anlagen als eigenes Dokument: Titel des Hauptdokuments. */
  mainDocument?: string;
  toc: TocEntry[];
  body: NormBodyBlock[];
  /** Sichtbarer Normtext der Quelle (ohne Kopf, Titel, Verzeichnis, Seitenmobiliar) – Grundlage der Integritätsprüfung. */
  sourceText: string;
  /** Benannt ausgenommene Zeilen (Zwischenüberschrift „Fußnoten“). */
  excludedSourceLines: number;
  /** Zeilen des Normkörpers (für die Zusammensetzung historischer Einzelfassungen). */
  bodyLines: PdfLine[];
  titleFootnoteLines: PdfLine[];
  /** Einzelfassung: „Weitere Fassungen dieser Norm“ (Zeilen, ohne Kennung). */
  otherVersions?: string[];
  /** „Redaktionelle Hinweise“ der Einzelfassung. */
  editorialNotes?: string[];
  findings: ParseFinding[];
  pages: number;
}

const DATE = /(\d{2})\.(\d{2})\.(\d{4})/u;
const DATE_ONLY = /^\d{2}\.\d{2}\.\d{4}(?:\s+bis)?$/u;

export function isoDate(value: string | undefined): string | undefined {
  const match = value ? DATE.exec(value) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

const HEADER_KEYS = ['Amtliche Abkürzung', 'juris-Abkürzung', 'Ausfertigungsdatum', 'Neugefasst', 'Fassung vom', 'Textnachweis ab', 'Gültig ab', 'Gültig bis', 'Dokumenttyp', 'Quelle', 'Fundstelle', 'Gliederungs-Nr', 'Kennung', 'Normgeber', 'Aktenzeichen', 'Erlassdatum', 'Normen', 'Norm', 'Fundstellen', 'Stand'] as const;

const ORDINAL = '(?:Erster|Zweiter|Dritter|Vierter|Fünfter|Sechster|Siebenter|Siebter|Achter|Neunter|Zehnter|Elfter|Zwölfter|Dreizehnter|Vierzehnter|Fünfzehnter|Sechzehnter|Siebzehnter|Achtzehnter|Neunzehnter|Zwanzigster)';
const CONTAINER_PATTERNS: ReadonlyArray<{ type: NormBodyBlock['type']; level: number; pattern: RegExp }> = [
  { type: 'book', level: 0, pattern: new RegExp(`^(?:${ORDINAL}\\s+Buch|Buch\\s+[\\dIVXLC]+[a-z]?)\\b`, 'u') },
  { type: 'part', level: 1, pattern: new RegExp(`^(?:${ORDINAL}\\s+Teil|Teil\\s+[\\dIVXLC]+[a-z]?)\\b`, 'u') },
  { type: 'chapter', level: 2, pattern: new RegExp(`^(?:${ORDINAL}\\s+Kapitel|Kapitel\\s+[\\dIVXLC]+[a-z]?)\\b`, 'u') },
  { type: 'section', level: 3, pattern: new RegExp(`^(?:${ORDINAL}\\s+Abschnitt|Abschnitt\\s+[\\dIVXLC]+[a-z]?)\\b`, 'u') },
  { type: 'subsection', level: 4, pattern: new RegExp(`^(?:${ORDINAL}\\s+Unterabschnitt|Unterabschnitt\\s+[\\dIVXLC]+[a-z]?)\\b`, 'u') },
];
const UNIT_PATTERNS: ReadonlyArray<{ type: NormBodyBlock['type']; pattern: RegExp }> = [
  { type: 'paragraph', pattern: /^§§\s*\d+\s*[a-z]?\s+(?:bis|und)\s+\d+\s*[a-z]?\b|^§\s*\d+\s*[a-z]?\b/u },
  { type: 'article', pattern: /^(?:Artikel|Art\.)\s*\d+\s*[a-z]?\b/u },
  { type: 'annex', pattern: /^(?:Anlage|Anhang)(?:\s+\d+[a-z]?|\s+[A-Z](?=\s|:|$))?(?=\s*[:(]|\s+zu\b|$)/u },
  { type: 'preamble', pattern: /^Präambel$/u },
];
/**
 * Gliederungszeichen einer Aufzählung: „1.“, „1a.“, „1)“, „a)“, „aa)“, „aaa)“, „a.“, „aa.“, „(a)“, „(1)“, „A.“, „IV.“,
 * Dezimalgliederung („8.2“, „1.1.1.“) und Spiegelstriche. Eine Zeile mit solchem Zeichen im ersten Segment ist
 * ein Listeneintrag, keine Tabellenzeile.
 */
const ITEM_LABEL = /^(?:\d+[a-z]?\.|\d+\)|[a-z]\)|[a-z]{2}\)|[a-z]{3}\)|[a-z]{1,2}\.|\([a-z]{1,2}\)|\(\d+[a-z]?\)|\d+(?:\.\d+)+\.?|[A-Z]\.|[IVX]+\.|[-–•])$/u;
const SUBPARAGRAPH = /^\((\d+[a-z]?)\)\s*(.*)$/u;
const FOOTNOTE_MARKER = /^(\*{1,3}\)|\d{1,2}\)|\[\d{1,2}\]\)?)$/u;
/** Fußnotenzeichen am Zeilenanfang, wenn Zeichen und Text ein Wortkasten-Segment bilden („[1]) Fristablauf …“). */
const FOOTNOTE_MARKER_PREFIX = /^(\*{1,3}\)|\d{1,2}\)|\[\d{1,2}\]\)?)\s+(\S.*)$/u;
const CONJUNCTIONS = new Set(['und', 'oder', 'bis', 'sowie', 'bzw', 'bzw.', 'beziehungsweise', 'noch', 'als', 'wie']);

/** Normalisierte Bezeichnung: „§1“ → „§ 1“, „Art.5“ → „Art. 5“. */
export function normalizeLabel(label: string): string {
  return label.replace(/^§§\s*/u, '§§ ').replace(/^§(?!§)\s*/u, '§ ').replace(/^(Art\.)\s*/u, '$1 ').replace(/:$/u, '').replace(/\s+/gu, ' ').trim();
}

/** Verbindet eine Zeile mit der Fortsetzung: Silbentrennung am Zeilenende wird aufgelöst. */
export function joinLines(previous: string, next: string): string {
  if (previous === '') return next;
  if (next === '') return previous;
  if (/[A-Za-zÄÖÜäöüß]-$/u.test(previous)) {
    const firstWord = next.split(/\s/u)[0] ?? '';
    // Getrennte Abkürzung aus Großbuchstaben („GV-/OBl.“ → „GVOBl.“); „EU-/Richtlinie“ bleibt gekoppelt.
    const lastToken = /([A-Za-zÄÖÜäöüß]+)-$/u.exec(previous)?.[1] ?? "";
    if (/^[A-ZÄÖÜ]{2,4}$/u.test(lastToken) && /^[A-ZÄÖÜ]{2}/u.test(firstWord)) return `${previous.slice(0, -1)}${next}`;
    if (/^[a-zäöüß]/u.test(next) && !CONJUNCTIONS.has(firstWord.replace(/[,;:.]$/u, ''))) return `${previous.slice(0, -1)}${next}`;
    if (/^[a-zäöüß]/u.test(next)) return `${previous} ${next}`;
    return `${previous}${next}`;
  }
  return `${previous} ${next}`;
}

function containerFor(text: string): { type: NormBodyBlock['type']; level: number } | undefined {
  return CONTAINER_PATTERNS.find((entry) => entry.pattern.test(text));
}

function unitFor(text: string): NormBodyBlock['type'] | undefined {
  return UNIT_PATTERNS.find((entry) => entry.pattern.test(text))?.type;
}

/** Kopf: Schlüssel am linken Rand, Wert in der zweiten Spalte (auch auf der Folgezeile). */
function parseHeader(lines: PdfLine[], findings: ParseFinding[], paragraphGap: number): { header: Record<string, string>; next: number } {
  const header: Record<string, string> = {};
  let index = 0;
  let lastKey: string | undefined;
  let valueX: number | undefined;
  while (index < lines.length) {
    const line = lines[index]!;
    const first = line.segments[0]!.text;
    const key = HEADER_KEYS.find((candidate) => first === `${candidate}:` || first.startsWith(`${candidate}: `));
    if (key) {
      const inline = first.slice(key.length + 1).trim();
      const rest = [inline, ...line.segments.slice(1).map((segment) => segment.text)].filter(Boolean).join(' ');
      header[key] = rest;
      lastKey = key;
      valueX = line.segments[1]?.x0 ?? valueX;
      index += 1;
      continue;
    }
    // Fortsetzung eines Werts: in der Wertspalte, ohne Schlüssel.
    if (lastKey && valueX !== undefined && Math.abs(line.x0 - valueX) < 6 && line.gapBefore < paragraphGap) {
      header[lastKey] = header[lastKey] ? joinLines(header[lastKey]!, line.text) : line.text;
      index += 1;
      continue;
    }
    break;
  }
  if (Object.keys(header).length === 0) findings.push({ severity: 'error', code: 'header-missing', message: 'Kein Dokumentkopf (Schlüssel: Wert) auf Seite 1' });
  return { header, next: index };
}

/** Redaktionelle Anhänge der juris-Einzelfassung. */
export const EDITORIAL_TRAILER = /^(?:Weitere Fassungen dieser Norm|Redaktionelle Hinweise)$/u;

/** Aufhebungs- und Gegenstandsvermerke der juris-Ausgabe ohne Normtext. */
const STATUS_NOTE = /^(?:[A-Z]{1,3}\s+)?(?:aufgeh\.|aufgehoben|außer Kraft|gegenstandslos|erledigt)/u;

const EDITION = /^(?:Gesamtausgabe in der Gültigkeit vom\s+(\d{2}\.\d{2}\.\d{4})(?:\s+bis\s+(\d{2}\.\d{2}\.\d{4}))?|Zum\s+(\d{2}\.\d{2}\.\d{4})\s+aktuellste verfügbare Fassung der Gesamtausgabe)$/u;

export function parseJurisPdf(layout: PdfLayout, options: { imagesByPage?: Map<number, number> } = {}): ParsedJurisPdf {
  const findings: ParseFinding[] = [];
  const all = layout.lines.filter((line) => !line.furniture);
  const { header, next } = parseHeader(all, findings, layout.paragraphGap);
  let cursor = next;

  const isVwv = header.Normgeber !== undefined || header.Erlassdatum !== undefined;
  // Titel: zentrierte Zeilen nach dem Kopf (bei VwV bis zur Gliederungsnummer, die zum Dokument gehört).
  const titleLines: string[] = [];
  // Lange Titel füllen fast die Zeilenbreite; zentriert sind sie trotzdem (symmetrisch, nicht bündig am Satzspiegel).
  const wideCentered = (line: PdfLine): boolean => Math.abs((line.x0 + line.x1) / 2 - (layout.left + layout.right) / 2) <= Math.max(16, layout.bodyHeight) && line.x0 >= layout.left + 5 && line.segments.length === 1 && !/^(?:Stand:|Fußnoten$|Nichtamtliches|V\s|Zum\s)/u.test(line.text) && !STATUS_NOTE.test(line.text);
  const VWV_NUMBER_LINE = /^Gl\.\s?-?\s?Nr\.?/u;
  // VwV: Der Titel steht zwischen Kopf und der Zeile „Gl.Nr. …“ – auch dann, wenn er bündig und voll breit gesetzt ist.
  if (isVwv) {
    const numberLine = all.slice(cursor, cursor + 6).findIndex((line) => VWV_NUMBER_LINE.test(line.text));
    // Nur ein zusammenhängender Block (Folgezeilen ohne Absatzabstand) ist Titel.
    const block = numberLine > 0 ? all.slice(cursor, cursor + numberLine) : [];
    if (numberLine > 0 && block.slice(1).every((line) => line.gapBefore < layout.paragraphGap + 5)) {
      for (const line of all.slice(cursor, cursor + numberLine)) titleLines.push(line.plainText.replace(/\s*\*+\)?$/u, ''));
      cursor += numberLine;
    }
  }
  const titleTaken = titleLines.length > 0;
  while (!titleTaken && cursor < all.length && (isCentered(all[cursor]!, layout) || wideCentered(all[cursor]!)) && !EDITION.test(all[cursor]!.text) && !(isVwv && VWV_NUMBER_LINE.test(all[cursor]!.text)) && !(titleLines.length > 0 && (unitFor(all[cursor]!.text.trim()) || containerFor(all[cursor]!.text.trim()) || /^Inhaltsübersicht:?$/u.test(all[cursor]!.text.trim())))) {
    // Titel ohne Fußnotenzeichen (hochgestellt oder als „*“ am Zeilenende).
    titleLines.push(all[cursor]!.plainText.replace(/\s*\*+\)?$/u, ''));
    cursor += 1;
  }
  // Anlage einer Verwaltungsvorschrift als eigenes Dokument („Zum Hauptdokument : …“).
  let mainDocument: string | undefined;
  if (titleLines.length === 0 && cursor < all.length && /^Zum Hauptdokument\s*:/u.test(all[cursor]!.text)) {
    let value = all[cursor]!.text.replace(/^Zum Hauptdokument\s*:\s*/u, '');
    cursor += 1;
    while (cursor < all.length && all[cursor]!.gapBefore < layout.paragraphGap && !isCentered(all[cursor]!, layout)) {
      value = joinLines(value, all[cursor]!.text);
      cursor += 1;
    }
    mainDocument = value;
    findings.push({ severity: 'warning', code: 'vwv-annex-document', message: `Anlage einer Verwaltungsvorschrift als eigenes Dokument (Hauptdokument „${value.slice(0, 80)}“) – gehört zum Hauptdokument, keine eigene Norm` });
  }
  if (titleLines.length === 0 && !mainDocument) findings.push({ severity: 'error', code: 'title-missing', message: 'Kein zentrierter Titel nach dem Kopf' });
  const title = titleLines.reduce((text, line) => joinLines(text, line), '');

  // Ausgabevermerk, Aufhebungsvermerk, Stand, Fußnoten zum Titel.
  const titleFootnotes: NormBodyBlock[] = [];
  const titleFootnoteLines: PdfLine[] = [];
  let edition: ParsedJurisPdf['edition'];
  let statusNote: string | undefined;
  let stand: string | undefined;
  while (!isVwv && cursor < all.length) {
    const line = all[cursor]!;
    const editionMatch = EDITION.exec(line.text);
    if (editionMatch) {
      edition = { text: line.text };
      if (editionMatch[1]) edition.validFrom = isoDate(editionMatch[1]);
      if (editionMatch[2]) edition.validTo = isoDate(editionMatch[2]);
      if (editionMatch[3]) edition.currentAsOf = isoDate(editionMatch[3]);
      cursor += 1;
      continue;
    }
    if (/^Stand:/u.test(line.text)) {
      let value = line.text.replace(/^Stand:\s*/u, '');
      cursor += 1;
      // Fortsetzungszeilen stehen eingerückt in der Wertspalte.
      while (cursor < all.length && all[cursor]!.x0 >= line.x0 + layout.bodyHeight * 1.5 && all[cursor]!.gapBefore < layout.paragraphGap && !isCentered(all[cursor]!, layout)) {
        value = joinLines(value, all[cursor]!.text);
        cursor += 1;
      }
      stand = value;
      continue;
    }
    if (/^Fußnoten$/u.test(line.text)) {
      // Fußnoten zum Titel (vor dem Verzeichnis): Normtext der Verkündung, als Fußnotenblöcke an den Anfang.
      cursor += 1;
      while (cursor < all.length && !/^Nichtamtliches Inhaltsverzeichnis$/u.test(all[cursor]!.text) && !isCentered(all[cursor]!, layout)) {
        const current = all[cursor]!;
        const prefixed = current.segments.length === 1 ? FOOTNOTE_MARKER_PREFIX.exec(current.text) : null;
        const marker = current.segments.length > 1 && FOOTNOTE_MARKER.test(current.segments[0]!.text) ? current.segments[0]!.text : FOOTNOTE_MARKER.test(current.text) ? current.text : prefixed?.[1];
        if (marker) {
          const rest = current.segments.length > 1 && current.segments[0]!.text === marker ? current.segments.slice(1).map((segment) => segment.text).join(' ') : (prefixed?.[2] ?? '');
          titleFootnotes.push({ type: 'footnote', label: marker, text: rest });
        } else if (titleFootnotes.length > 0) {
          titleFootnotes.at(-1)!.text = joinLines(titleFootnotes.at(-1)!.text ?? '', current.text);
        } else {
          titleFootnotes.push({ type: 'footnote', text: current.text });
        }
        titleFootnoteLines.push(current);
        cursor += 1;
      }
      continue;
    }
    if (/^Nichtamtliches Inhaltsverzeichnis$/u.test(line.text) || isCentered(line, layout)) break;
    // Vermerk vor „Stand“ (z. B. „V aufgeh. durch § 9 …“) – Status, kein Normtext. Nur erkennbare
    // Aufhebungsvermerke; alles andere gehört zum Normtext.
    if (!stand && !edition && (statusNote !== undefined || STATUS_NOTE.test(line.text))) {
      statusNote = statusNote ? joinLines(statusNote, line.text) : line.text;
      cursor += 1;
      continue;
    }
    break;
  }

  // Nichtamtliches Inhaltsverzeichnis (redaktionell, nicht Normtext).
  const toc: TocEntry[] = [];
  if (cursor < all.length && /^Nichtamtliches Inhaltsverzeichnis$/u.test(all[cursor]!.text)) {
    cursor += 1;
    if (isVwv) {
      // Verzeichnis der VwV: ein geschlossener Zeilenblock ohne Datum direkt unter der Überschrift.
      let first = true;
      while (cursor < all.length && !isCentered(all[cursor]!, layout) && (first || all[cursor]!.gapBefore < layout.paragraphGap)) {
        toc.push({ title: all[cursor]!.text });
        cursor += 1;
        first = false;
      }
    } else {
      let current: TocEntry | undefined;
      let pendingBis = false;
      while (cursor < all.length) {
        const line = all[cursor]!;
        const right = line.segments.length > 1 ? line.segments.at(-1)! : undefined;
        const hasDate = right !== undefined && DATE_ONLY.test(right.text) && right.x0 > (layout.left + layout.right) / 2;
        const leftText = (hasDate ? line.segments.slice(0, -1) : line.segments).map((segment) => segment.text).join(' ');
        if (hasDate && !(pendingBis && leftText === '')) {
          if (current && pendingBis && leftText !== '' && line.gapBefore < layout.paragraphGap && !/ - /u.test(leftText)) {
            // Fortsetzung des Titels und Enddatum auf derselben Zeile.
            current.title = joinLines(current.title, leftText);
            current.validTo = isoDate(right!.text);
            pendingBis = false;
            cursor += 1;
            continue;
          }
          // „Bezeichnung - Überschrift“ nur, wenn links eine Bezeichnung steht (nicht im Titel der Norm,
          // der selbst „(Kurzbezeichnung - Abk.)“ enthalten kann).
          const separator = leftText.indexOf(' - ');
          const labelPart = separator > 0 ? leftText.slice(0, separator).trim() : '';
          const labelLike = labelPart !== '' && (unitFor(labelPart) !== undefined || containerFor(labelPart) !== undefined || /^(?:[IVXLC]+\.|\d+(?:\.\d+)*\.?|[A-Z]\.|Anlage\b|Anhang\b|Abschnitt\b|Teil\b|Kapitel\b|Unterabschnitt\b|Titel\b|Buch\b)/u.test(labelPart) || (labelPart.length <= 30 && !labelPart.includes('(')));
          current = labelLike ? { label: labelPart, title: leftText.slice(separator + 3).trim() } : unitFor(leftText) || containerFor(leftText) ? { label: leftText, title: '' } : { title: leftText };
          const from = isoDate(right!.text);
          if (from) current.validFrom = from;
          pendingBis = /bis$/u.test(right!.text);
          toc.push(current);
          cursor += 1;
          continue;
        }
        if (current && line.gapBefore < layout.paragraphGap && !isCentered(line, layout)) {
          if (leftText !== '') current.title = joinLines(current.title, leftText);
          if (hasDate || (right && DATE_ONLY.test(right.text))) {
            current.validTo = isoDate(right!.text);
            pendingBis = false;
          } else if (pendingBis && DATE_ONLY.test(line.text)) {
            current.validTo = isoDate(line.text);
            pendingBis = false;
          }
          cursor += 1;
          continue;
        }
        if (pendingBis && DATE_ONLY.test(line.text)) {
          current!.validTo = isoDate(line.text);
          pendingBis = false;
          cursor += 1;
          continue;
        }
        break;
      }
    }
  }

  // Redaktionelle Anhänge der Einzelfassungen („Weitere Fassungen dieser Norm“, „Redaktionelle Hinweise“):
  // juris-Satz, kein Normtext – benannt ausgenommen und getrennt festgehalten.
  const rest = all.slice(cursor);
  const trailer = rest.findIndex((line) => EDITORIAL_TRAILER.test(line.text.trim()));
  const bodyLines = trailer >= 0 ? rest.slice(0, trailer) : rest;
  const editorialLines = trailer >= 0 ? rest.slice(trailer) : [];
  const otherVersions: string[] = [];
  const editorialNotes: string[] = [];
  let editorialSection = '';
  for (const line of editorialLines) {
    const text = line.text.trim();
    if (EDITORIAL_TRAILER.test(text)) {
      editorialSection = text;
      continue;
    }
    if (editorialSection === 'Weitere Fassungen dieser Norm') otherVersions.push(text);
    else editorialNotes.push(text);
  }
  const imagesByPage = options.imagesByPage;
  if (imagesByPage) {
    for (const [page, count] of imagesByPage) {
      if (page >= (bodyLines[0]?.page ?? 1)) findings.push({ severity: 'warning', code: 'figure', message: `Seite ${page}: ${count} Abbildung(en) – nicht im Textlayer, Inhalt nicht übernehmbar`, page });
    }
  }
  const body = dropEmptyFootnotes([...titleFootnotes, ...buildBody(bodyLines, layout, findings, isVwv)], findings);
  if (statusNote && bodyLines.length > 0) findings.push({ severity: 'warning', code: 'status-note-with-text', message: `Aufhebungsvermerk „${statusNote.slice(0, 80)}“ neben Normtext – Zuordnung unsicher` });
  checkTocAgainstBody(toc, body, findings, isVwv);
  // Sichtbarer Normtext: Titelfußnoten und Normkörper. Ausgenommen (benannt): die Zwischenüberschrift
  // „Fußnoten“ der juris-Ausgabe – sie ist Satzmittel, kein Normtext.
  const sourceLines = [...titleFootnoteLines, ...bodyLines].filter((line) => !/^Fußnoten$/u.test(line.text.trim()));
  return {
    header,
    title,
    titleLines,
    ...(edition ? { edition } : {}),
    ...(statusNote ? { statusNote } : {}),
    ...(stand ? { stand } : {}),
    ...(mainDocument ? { mainDocument } : {}),
    toc,
    body,
    sourceText: sourceLines.map((line) => line.text).join('\n'),
    excludedSourceLines: [...titleFootnoteLines, ...bodyLines].length - sourceLines.length,
    bodyLines,
    titleFootnoteLines,
    ...(otherVersions.length > 0 ? { otherVersions } : {}),
    ...(editorialNotes.length > 0 ? { editorialNotes } : {}),
    findings,
    pages: layout.pages.length,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Normkörper                                                                                       */

interface OpenBlock {
  block: NormBodyBlock;
  /** x-Position des Textbeginns (für Fortsetzungszeilen mit hängendem Einzug). */
  textX: number;
  /** x-Position der Bezeichnung (Nummer), für die Verschachtelung von Aufzählungen. */
  labelX: number;
  lastLine: PdfLine;
}

export function buildBody(lines: PdfLine[], layout: PdfLayout, findings: ParseFinding[], isVwv: boolean): NormBodyBlock[] {
  const root: NormBodyBlock[] = [];
  /** Offene Gliederungsebenen (book … subsection), innerste zuletzt. */
  const containers: Array<{ block: NormBodyBlock; level: number }> = [];
  let unit: NormBodyBlock | undefined;
  let open: OpenBlock | undefined;
  /** Offene Aufzählungen (für Verschachtelung nach Einzug). */
  let items: OpenBlock[] = [];
  /** Absatz bzw. Textblock, der die folgenden Aufzählungen aufnimmt. */
  let holderBlock: OpenBlock | undefined;
  let inFootnotes = false;
  let tableRun = 0;
  let previousCentered = false;
  const paragraphBreak = layout.paragraphGap;

  const target = (): NormBodyBlock[] => {
    if (unit) return (unit.children ??= []);
    const container = containers.at(-1);
    return container ? (container.block.children ??= []) : root;
  };
  const closeText = (): void => {
    open = undefined;
    items = [];
    holderBlock = undefined;
  };
  const pushContainer = (type: NormBodyBlock['type'], level: number, label: string): void => {
    closeText();
    unit = undefined;
    while (containers.length > 0 && containers.at(-1)!.level >= level) containers.pop();
    const block: NormBodyBlock = { type, label, children: [] };
    (containers.at(-1)?.block.children ?? root).push(block);
    containers.push({ block, level });
  };
  const pushUnit = (type: NormBodyBlock['type'], label: string): void => {
    closeText();
    const block: NormBodyBlock = { type, label: normalizeLabel(label), children: [] };
    if (type === 'annex') {
      // Anlagen stehen auf oberster Ebene hinter dem Normtext.
      containers.length = 0;
      root.push(block);
    } else {
      (containers.at(-1)?.block.children ?? root).push(block);
    }
    unit = block;
  };
  const appendTitle = (text: string): void => {
    const heading = unit ?? containers.at(-1)?.block;
    if (!heading) {
      target().push({ type: 'heading', text });
      return;
    }
    heading.title = heading.title ? joinLines(heading.title, text) : text;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const text = line.text.trim();
    const newPage = !Number.isFinite(line.gapBefore);
    const gap = newPage ? 0 : line.gapBefore;
    const breakBefore = gap > paragraphBreak;

    // Fußnoten.
    if (/^Fußnoten$/u.test(text)) {
      closeText();
      inFootnotes = true;
      continue;
    }
    if (inFootnotes) {
      if (FOOTNOTE_MARKER.test(text)) {
        const block: NormBodyBlock = { type: 'footnote', label: text, text: '' };
        target().push(block);
        open = { block, textX: line.x0, labelX: line.x0, lastLine: line };
        continue;
      }
      const prefixed = line.segments.length === 1 ? FOOTNOTE_MARKER_PREFIX.exec(text) : null;
      if (prefixed) {
        const block: NormBodyBlock = { type: 'footnote', label: prefixed[1]!, text: prefixed[2]! };
        target().push(block);
        open = { block, textX: line.x0, labelX: line.x0, lastLine: line };
        continue;
      }
      const markerFirst = line.segments.length > 1 && FOOTNOTE_MARKER.test(line.segments[0]!.text);
      if (markerFirst) {
        const block: NormBodyBlock = { type: 'footnote', label: line.segments[0]!.text, text: line.segments.slice(1).map((segment) => segment.text).join(' ') };
        target().push(block);
        open = { block, textX: line.segments[1]!.x0, labelX: line.x0, lastLine: line };
        continue;
      }
      if (open?.block.type === 'footnote' && !unitFor(text)) {
        open.block.text = joinLines(open.block.text ?? '', text);
        open.lastLine = line;
        continue;
      }
      inFootnotes = false;
    }

    // Überschriften: zentriert (Gliederung, Einzelnorm, Titelzeilen) oder alleinstehende Anlage.
    const container = containerFor(text);
    const unitType = unitFor(text);
    // Überschriften beginnen nach einem Abstand (oder setzen eine Überschrift fort); eine zufällig symmetrische
    // Fortsetzungszeile mitten im Absatz ist keine Überschrift.
    const previousText = lines[index - 1]?.text.trim() ?? '';
    const continuesSentence: boolean = open !== undefined && newPage && !/[.:;]$/u.test(previousText);
    const centered: boolean = isCentered(line, layout) && (previousCentered || (breakBefore && !continuesSentence) || (newPage && !continuesSentence));
    previousCentered = centered;
    const standaloneAnnex = unitType === 'annex' && line.segments.length === 1 && text.length < 40 && (breakBefore || newPage);
    if (centered || standaloneAnnex) {
      if (container && centered) {
        pushContainer(container.type, container.level, text);
        continue;
      }
      if (unitType && (centered || standaloneAnnex)) {
        const match = UNIT_PATTERNS.find((entry) => entry.type === unitType)!.pattern.exec(text)!;
        const label = match[0].trim();
        pushUnit(unitType, label);
        const rest = text.slice(match[0].length).trim();
        if (rest) appendTitle(rest);
        continue;
      }
      // Titelzeile einer eben eröffneten Überschrift (noch ohne Inhalt).
      const heading = unit ?? containers.at(-1)?.block;
      const headingOpen = heading && !open && (heading.children?.length ?? 0) === 0 && (previousCentered || gap <= paragraphBreak * 1.2);
      if (headingOpen) {
        appendTitle(text);
        continue;
      }
      // Sonstige Zwischenüberschrift. Folgt ihr (nach weiteren zentrierten Zeilen) eine Einzelnorm, gliedert
      // sie zwischen Einzelnormen: Die offene Einzelnorm endet. Sonst bleibt sie in der Einzelnorm bzw. Anlage.
      let lookahead = index + 1;
      while (lookahead < lines.length && lookahead <= index + 4 && isCentered(lines[lookahead]!, layout) && !unitFor(lines[lookahead]!.text.trim()) && !containerFor(lines[lookahead]!.text.trim())) lookahead += 1;
      const nextText = lines[lookahead]?.text.trim() ?? '';
      const introducesUnit = lookahead < lines.length && isCentered(lines[lookahead]!, layout) && (unitFor(nextText) === 'paragraph' || unitFor(nextText) === 'article');
      closeText();
      if (introducesUnit && unit && unit.type !== 'annex') unit = undefined;
      target().push({ type: 'heading', text });
      continue;
    }

    // Tabellenlayout: mehrere Spalten, erste Spalte keine Aufzählungsnummer.
    // Einheitenbezeichnung mit abgesetzter Überschrift („§ 3   Zweck“, „Artikel 2   Finanzkorrekturen“) ist keine Tabellenzeile.
    const multiColumn = line.segments.length >= 2 && !ITEM_LABEL.test(line.segments[0]!.text) && !FOOTNOTE_MARKER.test(line.segments[0]!.text) && !/^(?:§\s*\d|Art(?:ikel|\.)\s*(?:\d|[IVX]+\b))/u.test(line.segments[0]!.text);
    if (multiColumn) {
      tableRun += 1;
      if (tableRun === 2) findings.push({ severity: 'warning', code: 'table-layout', message: `Tabellenlayout (mehrere Spalten) ab „${text.slice(0, 60)}“ – Struktur aus dem Textlayer nicht sicher rekonstruierbar`, page: line.page });
    } else tableRun = 0;

    // Absatz „(1)“.
    const subparagraph = SUBPARAGRAPH.exec(text);
    if (subparagraph && (breakBefore || newPage || !open) && line.x0 <= layout.left + layout.bodyHeight * 2) {
      items = [];
      const block: NormBodyBlock = { type: 'subparagraph', label: `(${subparagraph[1]})`, text: subparagraph[2] ?? '' };
      target().push(block);
      open = { block, textX: line.x0, labelX: line.x0, lastLine: line };
      holderBlock = open;
      continue;
    }

    // Aufzählung: Nummer als eigene Spalte, Text mit hängendem Einzug. Aufzählungen gehören zum einleitenden
    // Absatz bzw. Textblock davor (auch wenn die Nummern am linken Rand stehen).
    const itemLine = line.segments.length >= 2 && ITEM_LABEL.test(line.segments[0]!.text);
    const openIsItem = open !== undefined && (open.block.type === 'item' || open.block.type === 'subitem');
    if (itemLine && (breakBefore || newPage || !open || openIsItem || line.x0 <= open.labelX + 2)) {
      const labelX = line.segments[0]!.x0;
      while (items.length > 0 && items.at(-1)!.labelX >= labelX - 2) items.pop();
      const parent = items.at(-1);
      const holder = parent ? (parent.block.children ??= []) : holderBlock ? (holderBlock.block.children ??= []) : target();
      const block: NormBodyBlock = { type: parent ? 'subitem' : 'item', label: line.segments[0]!.text, text: line.segments.slice(1).map((segment) => segment.text).join(' ') };
      holder.push(block);
      const entry: OpenBlock = { block, textX: line.segments[1]!.x0, labelX, lastLine: line };
      items.push(entry);
      open = entry;
      continue;
    }

    // Zurück auf eine äußere Einrückung nach einer (Unter-)Aufzählung: Text des Elements, dessen Textspalte die
    // Zeile trifft – als eigener Textblock hinter den Unterpunkten; am linken Rand gehört er zum Absatz.
    if (openIsItem && !breakBefore && !newPage && line.x0 <= open!.labelX + 2) {
      let level = items.length - 1;
      while (level >= 0 && !(Math.abs(items[level]!.textX - line.x0) <= 4 || items[level]!.labelX < line.x0 - 2)) level -= 1;
      const owner = level >= 0 ? items[level] : undefined;
      items = level >= 0 ? items.slice(0, level + 1) : [];
      const block: NormBodyBlock = { type: 'paragraphText', text };
      (owner ? (owner.block.children ??= []) : holderBlock ? (holderBlock.block.children ??= []) : target()).push(block);
      open = { block, textX: line.x0, labelX: line.x0, lastLine: line };
      continue;
    }

    // Fortsetzung des offenen Blocks.
    if (open && !breakBefore && (newPage || gap <= paragraphBreak)) {
      open.block.text = joinLines(open.block.text ?? '', text);
      open.lastLine = line;
      continue;
    }

    // Neuer Absatz ohne Nummer.
    items = [];
    const block: NormBodyBlock = { type: 'paragraphText', text };
    target().push(block);
    open = { block, textX: line.x0, labelX: line.x0, lastLine: line };
    holderBlock = open;
  }
  if (!isVwv && root.length === 0) findings.push({ severity: 'info', code: 'empty-body', message: 'Kein Normtext (Ausgabe ohne Einheiten)' });
  return root;
}

/** Jede Einheit des Verzeichnisses (§, Artikel, Anlage) muss als Überschrift im Normtext stehen – in derselben Reihenfolge. */
/**
 * Fußnotenzeichen ohne Fußnotentext (Quelle: „*)“ allein) ergeben keinen gültigen Block. Sie werden nicht
 * erfunden oder aufgefüllt, sondern entfernt und als Befund `empty-footnote` gemeldet (führt in den Review).
 */
function dropEmptyFootnotes(blocks: NormBodyBlock[], findings: ParseFinding[]): NormBodyBlock[] {
  const kept: NormBodyBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'footnote' && !(block.text ?? '').trim() && !(block.children?.length)) {
      findings.push({ severity: 'warning', code: 'empty-footnote', message: `Fußnotenzeichen ${block.label ?? '?'} ohne Fußnotentext in der Quelle` });
      continue;
    }
    if (block.children) block.children = dropEmptyFootnotes(block.children, findings);
    kept.push(block);
  }
  return kept;
}

function checkTocAgainstBody(toc: TocEntry[], body: NormBodyBlock[], findings: ParseFinding[], isVwv: boolean): void {
  if (isVwv) return;
  const bodyLabels: string[] = [];
  const annexHeadings: string[] = [];
  const walk = (blocks: NormBodyBlock[]): void => {
    for (const block of blocks) {
      if (block.type === 'annex' && block.label) annexHeadings.push(normalizeLabel(`${block.label} ${block.title ?? ''}`));
      if ((block.type === 'paragraph' || block.type === 'article' || block.type === 'annex') && block.label) bodyLabels.push(normalizeLabel(block.label));
      if (block.children) walk(block.children);
    }
  };
  walk(body);
  const tocLabels = toc.map((entry) => entry.label).filter((label): label is string => label !== undefined && /^(?:§|Art|Artikel|Anlage|Anhang)/u.test(label)).map(normalizeLabel);
  const missing = tocLabels.filter((label) => !bodyLabels.includes(label) && !(/^(?:Anlage|Anhang)/u.test(label) && annexHeadings.some((heading) => heading.startsWith(label) || label.startsWith(heading))));
  if (missing.length > 0) findings.push({ severity: 'warning', code: 'toc-unit-missing', message: `${missing.length} Einheit(en) des Verzeichnisses ohne Überschrift im Normtext: ${missing.slice(0, 5).join(', ')}` });
  const extra = bodyLabels.filter((label) => !tocLabels.includes(label));
  if (tocLabels.length > 0 && extra.length > 0) findings.push({ severity: 'warning', code: 'body-unit-not-in-toc', message: `${extra.length} Überschrift(en) im Normtext ohne Eintrag im Verzeichnis: ${extra.slice(0, 5).join(', ')}` });
  let position = 0;
  for (const label of tocLabels) {
    const found = bodyLabels.indexOf(label, position);
    if (found < 0) continue;
    if (found < position) {
      findings.push({ severity: 'warning', code: 'toc-order', message: `Reihenfolge weicht vom Verzeichnis ab bei ${label}` });
      break;
    }
    position = found;
  }
}

/** Aller Text eines Normkörpers (Bezeichnung, Überschrift, Text), rekursiv – die kanonische Seite der Integritätsprüfung. */
export function bodyText(blocks: readonly NormBodyBlock[]): string {
  const parts: string[] = [];
  const walk = (block: NormBodyBlock): void => {
    for (const value of [block.label, block.title, block.text]) if (value) parts.push(value);
    for (const child of block.children ?? []) walk(child);
  };
  for (const block of blocks) walk(block);
  return parts.join('\n');
}
