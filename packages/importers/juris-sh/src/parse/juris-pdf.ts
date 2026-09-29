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

import { characterStream } from './integrity.ts';
import type { PdfImage } from './pdf-figures.ts';
import { isCentered, type LineSegment, type PdfLayout, type PdfLine } from './pdf-layout.ts';

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
  /** VwV: Metadatenzeilen am Anfang des Dokuments (Gliederungsnummer, Fundstelle), aus dem Normkörper genommen. */
  vwvMetadata?: VwvLeadMetadata;
  /** Aus dem Normkörper genommene, als Metadaten erklärte Zeilen (Textintegrität: `explained-difference`). */
  relocated: RelocatedLine[];
  /** Als `figure`-Block übernommene Abbildungen des Normkörpers (Lage: vor Zeile `beforeLine` von `bodyLines`). */
  figures: PlacedFigure[];
}

/** Übernommene Abbildung: vor der Zeile `beforeLine` des Normkörpers (Index in `bodyLines`; Länge = am Ende). */
export interface PlacedFigure extends PdfImage {
  beforeLine: number;
}

/**
 * Erklärte Zeile für die Textintegrität: ohne `replacement` aus dem Normkörper genommen (Metadatum, juris-Vermerk); mit
 * `replacement` in anderer Reihenfolge übernommen (mehrzeilige Tabellenzellen: Quelle zeilenweise, Normkörper
 * zellenweise – vorher geprüft, dass die Zeichen dieselben sind).
 */
export interface RelocatedLine {
  reason: string;
  text: string;
  replacement?: string;
}

export interface VwvLeadMetadata {
  gliederungsnummer?: string;
  /** Amtliche Fundstelle in der Schreibweise des Dokuments („Amtsbl. Schl.-H. 2010 S. 199“). */
  fundstelle?: string;
  /** Änderungsvermerk hinter der Fundstelle („Geändert durch Verwaltungsvorschrift vom …“). */
  amendmentNote?: string;
  /** Wiederholter Titel am Anfang des Dokuments. */
  repeatedTitle?: boolean;
}

const VWV_GL_LINE = /^Gl\.\s?-?\s?Nrn?\.?:?\s*([0-9][0-9A-Za-z.\-–]*(?:(?:\s(?:und|u\.)\s|,\s?|\s)[0-9][0-9A-Za-z.\-–]*)*)\*?\s*(.*)$/u;
const VWV_FUNDSTELLE_LINE = /^Fundstellen?:\s*(.+)$/u;
const AMENDMENT_NOTE = /\s((?:Geändert|Zuletzt geändert|Ergänzt|Berichtigt|Neugefasst|Neu gefasst)\b.*)$/u;

/**
 * VwV-Kopfzeilen im Dokument: Die juris-Ausgabe setzt unter den Titel „Gl.Nr. …“ und „Fundstelle: …“ (bei Dokumenten
 * mit Inhaltsverzeichnis zusätzlich den Titel noch einmal). Das sind Metadaten, kein Vorschriftentext. Genommen wird
 * nur ein geschlossener Vorspann am Anfang des Normkörpers: der wörtlich wiederholte Titel, eine Zeile „Gl.Nr.“ und eine
 * Zeile „Fundstelle:“ (auch zusammen in einem Block). Alles andere – auch die Bekanntmachungszeile – bleibt Normtext.
 */
export function extractVwvLeadMetadata(body: NormBodyBlock[], title: string): { body: NormBodyBlock[]; metadata: VwvLeadMetadata; relocated: Array<{ reason: string; text: string }> } {
  const metadata: VwvLeadMetadata = {};
  const relocated: Array<{ reason: string; text: string }> = [];
  // Titel im Kopf und im Dokument unterscheiden sich in der Typografie (Bindestrich/Halbgeviertstrich).
  const normalize = (value: string): string => value.replace(/[\s\u00ad]+/gu, ' ').replace(/[\u2010-\u2015]/gu, '-').replace(/-\s/gu, '-').trim();
  const lead = (block: NormBodyBlock | undefined): boolean => block !== undefined && (block.type === 'heading' || block.type === 'paragraphText') && !block.children?.length && typeof block.text === 'string';
  let index = 0;
  // Wiederholter Titel: aufeinanderfolgende Blöcke, deren Text zusammen genau den Titel ergibt.
  if (title) {
    let joined = '';
    for (let probe = 0; probe < 6 && lead(body[probe]); probe += 1) {
      joined = joined ? joinLines(joined, body[probe]!.text!) : body[probe]!.text!;
      if (normalize(joined) === normalize(title)) {
        for (const block of body.slice(0, probe + 1)) relocated.push({ reason: 'Titel (Metadatum, wiederholt)', text: block.text! });
        metadata.repeatedTitle = true;
        index = probe + 1;
        break;
      }
      if (!normalize(title).startsWith(normalize(joined))) break;
    }
  }
  // „Gl.Nr.“- und „Fundstelle:“-Zeilen im Vorspann (bis zu sechs Blöcke; ältere Bekanntmachungen setzen die
  // Bekanntmachungszeile davor). Genommen wird nur die Metadatenzeile selbst: Hängt an der Fundstelle ohne Absatzabstand
  // weiterer Text (Bekanntmachungszeile), bleibt er Normtext; trägt der Block Unterpunkte, bleiben sie an seiner Stelle.
  const replaced = new Map<number, NormBodyBlock[]>();
  const leadText = (block: NormBodyBlock | undefined): boolean => block !== undefined && (block.type === 'heading' || block.type === 'paragraphText') && typeof block.text === 'string';
  for (let probe = index; probe < Math.min(body.length, index + 6); probe += 1) {
    if (!leadText(body[probe])) break;
    const block = body[probe]!;
    const text = block.text!.trim();
    const gl = VWV_GL_LINE.exec(text);
    const rest = gl ? gl[2]!.trim() : text;
    const fundstelle = VWV_FUNDSTELLE_LINE.exec(rest);
    if (!gl && !fundstelle) continue;
    if (gl && rest && !fundstelle) continue;
    if (fundstelle && metadata.fundstelle) continue;
    // Mehrere Gliederungsnummern (Änderungs- und Sammelbekanntmachungen: „Gl.Nr. 2030.32“, „Gl.Nr. 2030.35“) werden gesammelt.
    if (gl) metadata.gliederungsnummer = metadata.gliederungsnummer ? `${metadata.gliederungsnummer}, ${gl[1]!.trim()}` : gl[1]!.trim();
    let remainder = '';
    if (fundstelle) {
      const note = AMENDMENT_NOTE.exec(fundstelle[1]!);
      if (note) {
        // Mit Änderungsvermerk: Fundstelle(n) davor, Vermerk dahinter (Metadaten, wie bisher).
        metadata.fundstelle = fundstelle[1]!.slice(0, note.index).trim().replace(/[,;]$/u, '');
        metadata.amendmentNote = note[1]!.trim();
      } else {
        // Ohne Vermerk endet die Fundstelle mit der (letzten) Seitenangabe („… S. 1961“, „…, S. 37; SchlHA … S. 11“);
        // ohne Absatzabstand angehängter Text (Bekanntmachungszeile) bleibt Normtext.
        const cited = /^(.*?\bS\.?\s*\d+(?:\s*ff?\.)?(?:\s*;\s*[^;]*?\bS\.?\s*\d+(?:\s*ff?\.)?)*)(?=[\s,;]|$)\s*[,;]?\s*([\s\S]*)$/u.exec(fundstelle[1]!);
        metadata.fundstelle = (cited ? cited[1]! : fundstelle[1]!).trim().replace(/[,;]$/u, '');
        remainder = cited ? cited[2]!.trim() : '';
      }
    }
    const metadataText = remainder ? text.slice(0, text.length - remainder.length).trim() : text;
    relocated.push({ reason: gl && fundstelle ? 'Gliederungsnummer und Fundstelle (Metadaten)' : gl ? 'Gliederungsnummer (Metadatum)' : 'Fundstelle (Metadatum)', text: metadataText });
    if (remainder) replaced.set(probe, [{ ...block, text: remainder }]);
    else replaced.set(probe, block.children ?? []);
  }
  if (!metadata.gliederungsnummer && !metadata.fundstelle) return { body, metadata: {}, relocated: [] };
  return { body: body.slice(index).flatMap((block, offset) => replaced.get(index + offset) ?? [block]), metadata, relocated };
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
  // Bereiche („§§ 2 u. 3“, „§ 16 bis 92“, „§§ 19 - 26“, „Artikel 1 -3“) und römisch gezählte Artikel („Artikel II“) sind Einheiten.
  { type: 'paragraph', pattern: /^§§?\s*\d+\s*[a-z]?\s*(?:bis|und|u\.|[-–])\s*\d+\s*[a-z]?\b|^§\s*\d+\s*[a-z]?\b/u },
  { type: 'article', pattern: /^(?:Artikel|Art\.)\s*(?:\d+\s*[a-z]?(?:\s*(?:bis|und|u\.|[-–])\s*\d+\s*[a-z]?)?|[IVXLC]+)\b/u },
  // „Anlage 1 a:“ (Buchstabe abgesetzt, Run 16) wie „Anlage 1a:“.
  { type: 'annex', pattern: /^(?:Anlage|Anhang)(?:\s*\d+(?:\s?[a-z])?|\s+[A-Z](?=\s|:|$))?(?=\s*[:(]|\s+zu\b|$)/u },
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

/** Titelzeile, die mit einem Anschlusswort endet und deshalb fortgesetzt wird. */
const TITLE_CONTINUATION = /\s(?:nach|gemäß|und|oder|sowie|zu|zum|zur|zu den|des|der|den|dem|die|das|für|über|im|in|vom|von|mit|auf|bei|aus|gegen)$/u;

/** Redaktionelle Anhänge der juris-Einzelfassung. */
export const EDITORIAL_TRAILER = /^(?:Weitere Fassungen dieser Norm|Redaktionelle Hinweise)$/u;

/** Aufhebungs- und Gegenstandsvermerke der juris-Ausgabe ohne Normtext. */
const STATUS_NOTE = /^(?:[A-Z]{1,3}\s+)?(?:aufgeh\.|aufgehoben|außer Kraft|gegenstandslos|erledigt)/u;

const EDITION = /^(?:Gesamtausgabe in der Gültigkeit vom\s+(\d{2}\.\d{2}\.\d{4})(?:\s+bis\s+(\d{2}\.\d{2}\.\d{4}))?|Zum\s+(\d{2}\.\d{2}\.\d{4})\s+aktuellste verfügbare Fassung der Gesamtausgabe)$/u;

export interface ParseOptions {
  /**
   * Eingebettete Bilder der Ausgabe (`runPdfImages`). `null`: Bilder vorhanden, aber nicht auslesbar – Befund.
   * Fehlt die Angabe, prüft der Parser keine Abbildungen (Einheitentests ohne PDF).
   */
  images?: readonly PdfImage[] | null;
}

export function parseJurisPdf(layout: PdfLayout, options: ParseOptions = {}): ParsedJurisPdf {
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
  // Run 16: Ein Briefkopf rechts über dem Titel, der nur Erlassdatum und Aktenzeichen des juris-Kopfs wiederholt
  // („07.12.2022“ / „Az: LAsD 3114-234588/2022“), gehört zum Kopf, nicht zum Titel.
  if (isVwv) {
    const repeatsHeader = (line: PdfLine): boolean => {
      const text = line.text.trim().replace(/^Az\.?:?\s*/u, '');
      return line.segments.length === 1 && line.x0 > (layout.left + layout.right) / 2 && (text === header.Erlassdatum?.trim() || text === header.Aktenzeichen?.trim());
    };
    while (cursor < all.length && repeatsHeader(all[cursor]!)) cursor += 1;
  }
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
  // Endet die bisherige Titelzeile mit einem Anschlusswort („… nach“, „… gemäß“, „… und“), setzt die nächste Zeile den
  // Titel fort – auch wenn sie mit einer Bezeichnung beginnt („§ 76 SGB XI“).
  const continues = (): boolean => titleLines.length > 0 && TITLE_CONTINUATION.test(titleLines.at(-1)!) && all[cursor]!.gapBefore < layout.paragraphGap + layout.bodyHeight;
  while (!titleTaken && cursor < all.length && (isCentered(all[cursor]!, layout) || wideCentered(all[cursor]!)) && !EDITION.test(all[cursor]!.text) && !(isVwv && VWV_NUMBER_LINE.test(all[cursor]!.text)) && (continues() || !(titleLines.length > 0 && (unitFor(all[cursor]!.text.trim()) || containerFor(all[cursor]!.text.trim()) || /^Inhaltsübersicht:?$/u.test(all[cursor]!.text.trim()))))) {
    // Titel ohne Fußnotenzeichen (hochgestellt oder als „*“ am Zeilenende).
    titleLines.push(all[cursor]!.plainText.replace(/\s*\*+\)?$/u, ''));
    cursor += 1;
  }
  // Anlage einer Verwaltungsvorschrift als eigenes Dokument („Zum Hauptdokument : …“) – mit oder ohne eigenen Titel
  // („Musterbetriebssatzung für Eigenbetriebe - Anlage 2: …“), vor oder nach dem Verzeichnis.
  let mainDocument: string | undefined;
  const takeMainDocument = (): void => {
    if (mainDocument !== undefined || cursor >= all.length || !/^Zum Hauptdokument\s*:/u.test(all[cursor]!.text)) return;
    let value = all[cursor]!.text.replace(/^Zum Hauptdokument\s*:\s*/u, '');
    cursor += 1;
    while (cursor < all.length && all[cursor]!.gapBefore < layout.paragraphGap && !isCentered(all[cursor]!, layout)) {
      value = joinLines(value, all[cursor]!.text);
      cursor += 1;
    }
    mainDocument = value;
    findings.push({ severity: 'warning', code: 'vwv-annex-document', message: `Anlage einer Verwaltungsvorschrift als eigenes Dokument (Hauptdokument „${value.slice(0, 80)}“) – gehört zum Hauptdokument, keine eigene Norm` });
  };
  takeMainDocument();
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
      // Über einen Seitenumbruch läuft das Verzeichnis weiter, wenn die erste Zeile der neuen Seite in derselben
      // Einrückung wie die Verzeichniszeilen steht (Normtext beginnt am Satzspiegel oder mit dem zentrierten Titel).
      let first = true;
      const tocStarts: number[] = [];
      const continuesAcrossPage = (line: PdfLine): boolean => !Number.isFinite(line.gapBefore) && line.x0 >= layout.left + layout.bodyHeight * 1.5 && tocStarts.some((start) => Math.abs(start - line.x0) <= 2);
      // Eine lange Verzeichniszeile kann zufällig mittig stehen: Sie zählt zum Verzeichnis, wenn sie die erste ist oder in
      // der Einrückung der übrigen Verzeichniszeilen beginnt.
      const tocIndent = (line: PdfLine): boolean => tocStarts.some((start) => Math.abs(start - line.x0) <= 2);
      while (cursor < all.length && (first || ((!isCentered(all[cursor]!, layout) || tocIndent(all[cursor]!)) && (all[cursor]!.gapBefore < layout.paragraphGap || continuesAcrossPage(all[cursor]!))))) {
        toc.push({ title: all[cursor]!.text });
        tocStarts.push(all[cursor]!.x0);
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
          // „§§ 19 - 26“ ist ein Bereich, keine Trennung „Bezeichnung - Überschrift“.
          const dash = leftText.indexOf(' - ');
          const wholeUnit = unitFor(leftText);
          const rangeLabel = dash > 0 && wholeUnit !== undefined && UNIT_PATTERNS.find((entry) => entry.type === wholeUnit)!.pattern.exec(leftText)![0].trim() === leftText.replace(/\s*\*+\)?\s*$/u, '').trim();
          const separator = rangeLabel ? -1 : dash;
          const labelPart = separator > 0 ? leftText.slice(0, separator).trim() : '';
          const labelLike = labelPart !== '' && (unitFor(labelPart) !== undefined || containerFor(labelPart) !== undefined || /^(?:[IVXLC]+\.|\d+(?:\.\d+)*\.?|[A-Z]\.|Anlage\b|Anhang\b|Abschnitt\b|Teil\b|Kapitel\b|Unterabschnitt\b|Titel\b|Buch\b)/u.test(labelPart) || (labelPart.length <= 30 && !labelPart.includes('(')));
          current = labelLike ? { label: labelPart, title: leftText.slice(separator + 3).trim() } : unitFor(leftText) || containerFor(leftText) ? { label: leftText.replace(/\s*\*+\)?\s*$/u, ''), title: '' } : { title: leftText };
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

  takeMainDocument();

  // Redaktionelle Anhänge der Einzelfassungen („Weitere Fassungen dieser Norm“, „Redaktionelle Hinweise“):
  // juris-Satz, kein Normtext – benannt ausgenommen und getrennt festgehalten.
  const rest = all.slice(cursor);
  const trailer = rest.findIndex((line) => EDITORIAL_TRAILER.test(line.text.trim()));
  let bodyLines = trailer >= 0 ? rest.slice(0, trailer) : rest;
  const editorialLines = trailer >= 0 ? rest.slice(trailer) : [];
  // VwV: Das Verzeichnis kann hinter den Kopfzeilen des Erlasses stehen (Gl.Nr., Fundstelle, Erlasskopf mit Datum und
  // Aktenzeichen). Es ist dann derselbe geschlossene Zeilenblock unter der Überschrift – redaktionell, kein Normtext.
  if (isVwv && toc.length === 0) {
    const headingAt = bodyLines.slice(0, 12).findIndex((line) => /^Nichtamtliches Inhaltsverzeichnis$/u.test(line.text.trim()));
    const leadLine = (line: PdfLine, position: number): boolean => VWV_NUMBER_LINE.test(line.text) || /^Fundstelle[n]?\s*:/u.test(line.text) || /^(?:Gemeinsamer?\s+)?(?:Runderlass|Erlass|Bekanntmachung|Allgemeine\s+Verwaltungsvorschrift|Verwaltungsvorschrift|Richtlinie)\b/u.test(line.text) || (position > 0 && line.gapBefore < layout.paragraphGap);
    if (headingAt > 0 && bodyLines.slice(0, headingAt).every((line, position) => leadLine(line, position))) {
      let endAt = headingAt + 1;
      while (endAt < bodyLines.length && bodyLines[endAt]!.gapBefore < layout.paragraphGap && !isCentered(bodyLines[endAt]!, layout)) {
        toc.push({ title: bodyLines[endAt]!.text });
        endAt += 1;
      }
      if (toc.length > 0) bodyLines = [...bodyLines.slice(0, headingAt), ...bodyLines.slice(endAt)];
    }
  }
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
  let figures: PlacedFigure[] = [];
  if (options.images === null) findings.push({ severity: 'warning', code: 'figure', message: 'Eingebettete Bilder nicht auslesbar (pdftohtml) – Abbildungen nicht prüfbar' });
  else if (options.images) figures = placeFigures(options.images, { before: all[cursor - 1], bodyLines, after: editorialLines[0], layout, findings });
  const reorders: RelocatedLine[] = [];
  let body = dropEmptyFootnotes([...titleFootnotes, ...buildBody(bodyLines, layout, findings, isVwv, figures, reorders)], findings);
  let vwvMetadata: VwvLeadMetadata | undefined;
  let relocated: RelocatedLine[] = [];
  {
    const cleaned = removeEditorialNotes(body, findings);
    body = cleaned.body;
    relocated.push(...cleaned.relocated, ...reorders);
  }
  if (isVwv) {
    const extracted = extractVwvLeadMetadata(body, title);
    if (extracted.relocated.length > 0) {
      body = extracted.body;
      vwvMetadata = extracted.metadata;
      relocated = [...relocated, ...extracted.relocated];
    }
  }
  if (statusNote && bodyLines.length > 0) findings.push({ severity: 'warning', code: 'status-note-with-text', message: `Aufhebungsvermerk „${statusNote.slice(0, 80)}“ neben Normtext – Zuordnung unsicher` });
  checkTocAgainstBody(toc, body, findings, isVwv);
  // Sichtbarer Normtext: Titelfußnoten und Normkörper. Ausgenommen (benannt): die Zwischenüberschrift
  // „Fußnoten“ der juris-Ausgabe – sie ist Satzmittel, kein Normtext.
  const sourceLines = [...titleFootnoteLines, ...bodyLines].filter((line) => !/^Fußnoten$/u.test(line.text.trim()));
  return {
    header,
    title,
    titleLines,
    ...(vwvMetadata ? { vwvMetadata } : {}),
    relocated,
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
    figures,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Tabellen                                                                                         */

/** Zeile mit mehreren Spalten, deren erste Spalte keine Aufzählungsnummer, kein Fußnotenzeichen, keine Einheitenbezeichnung ist. */
function isMultiColumnLine(line: PdfLine): boolean {
  return line.segments.length >= 2 && !ITEM_LABEL.test(line.segments[0]!.text) && !FOOTNOTE_MARKER.test(line.segments[0]!.text) && !/^(?:§\s*\d|Art(?:ikel|\.)\s*(?:\d|[IVX]+\b))/u.test(line.segments[0]!.text);
}

/** Tabellen mit mehr Spalten sind im Textlayer nicht mehr sicher von Satzspiegel-Artefakten zu trennen. */
const TABLE_MAX_COLUMNS = 16;

/** Warum ein Block von Mehrspaltenzeilen kein sicheres Raster ist (Befundtext und Clusterung). */
export type GridRejection = 'single-row' | 'too-many-columns' | 'columns-vary' | 'no-gutter' | 'hyphenated-cell' | 'empty-cell' | 'superscript-outside-cell';

/**
 * Strukturierte Tabelle aus einem Block aufeinanderfolgender Mehrspaltenzeilen – nur für das sicher erkennbare
 * Raster: Jede Zeile hat genau dieselbe Zahl k ≥ 2 von Spalten, zwischen Spalte i und i+1 liegt über alle Zeilen ein
 * gemeinsamer Zwischenraum (größtes rechtes Ende von i < kleinster Anfang von i+1; gilt für links-, rechtsbündige und
 * zentrierte Spalten), keine Zelle ist leer und keine endet mit einer Worttrennung (sonst liefe eine Zelle über mehrere
 * Zeilen). Hochgestellte Fußnotenzeichen bleiben wie im übrigen Normtext an ihrem Wort („Bestimmungsgrenze*)“). Jede
 * Zeile ist eine Tabellenzeile. Kopfzeilen werden nicht geraten (alle Zellen `tableCell`). Alles andere bleibt Befund
 * `table-layout` (Review).
 */
export function diagnoseGrid(rows: readonly PdfLine[]): { table: NormBodyBlock } | { rejection: GridRejection } {
  const columns = rows[0]?.segments.length ?? 0;
  if (rows.length < 2 || columns < 2) return { rejection: 'single-row' };
  if (columns > TABLE_MAX_COLUMNS) return { rejection: 'too-many-columns' };
  if (rows.some((row) => row.segments.length !== columns)) return { rejection: 'columns-vary' };
  if (rows.some((row) => row.segments.some((segment) => segment.text.trim() === ''))) return { rejection: 'empty-cell' };
  // Hochgestellte Zeichen hängen im Textlayer am Wort ihrer Spalte („Bestimmungsgrenze*)“); stehen sie in keiner Zelle,
  // ginge ein Fußnotenzeichen verloren – kein Raster.
  if (rows.some((row) => row.superscripts.some((mark) => !row.segments.some((segment) => segment.text.includes(mark))))) return { rejection: 'superscript-outside-cell' };
  if (rows.some((row) => row.segments.some((segment) => /\p{L}-$/u.test(segment.text.trim())))) return { rejection: 'hyphenated-cell' };
  for (let column = 0; column < columns - 1; column += 1) {
    const rightEdge = Math.max(...rows.map((row) => row.segments[column]!.x1));
    const nextStart = Math.min(...rows.map((row) => row.segments[column + 1]!.x0));
    if (!(rightEdge < nextStart)) return { rejection: 'no-gutter' };
  }
  return {
    table: {
      type: 'table',
      columns,
      children: rows.map((row) => ({ type: 'tableRow', children: row.segments.map((segment) => ({ type: 'tableCell', text: segment.text.trim() })) })),
    },
  };
}

export function gridTable(rows: readonly PdfLine[]): NormBodyBlock | undefined {
  const result = diagnoseGrid(rows);
  return 'table' in result ? result.table : undefined;
}

/**
 * Längstes sicheres Raster am Anfang eines Blocks von Mehrspaltenzeilen (mindestens zwei Zeilen). Folgt dem Raster eine
 * Zeile anderer Gestalt (eine nummerierte Überschrift „4  Schlussbestimmungen“, eine Tabelle mit anderen Spalten), endet
 * die Tabelle davor; die übrigen Zeilen werden wie sonst gelesen.
 */
export function leadingGrid(rows: readonly PdfLine[]): { table: NormBodyBlock; rows: number } | { rejection: GridRejection } {
  let first: GridRejection | undefined;
  for (let length = rows.length; length >= 2; length -= 1) {
    const result = diagnoseGrid(rows.slice(0, length));
    if ('table' in result) return { table: result.table, rows: length };
    first ??= result.rejection;
  }
  return { rejection: first ?? 'single-row' };
}

/** Zelle einer Zeile des Textlayers im Raster (vor dem Zusammenfügen zu Tabellenzeilen). */
interface PlacedCell {
  text: string;
  span: number;
  spanning?: boolean;
  /** Die Zeile trägt im Textlayer mehrere Segmente (Kopfzeile, nicht Titelzeile). */
  multi?: boolean;
}

/** Zelle einer Tabellenzeile im Aufbau; `null` = von einer Zelle links davon überdeckt (colspan). */
type GridCell = { text: string; span: number } | undefined | null;

/** Lage eines Segments im Spaltenraster: Startspalte und Zahl der überdeckten Spalten. */
interface GridPlacement {
  column: number;
  span: number;
  /** Kopfzelle über mehreren Spalten, die keine davon vollständig überdeckt (`centeredSpan`). */
  spanning?: boolean;
  /** Kopfzelle, breiter als ihre Spalte, bündig mit deren Rand (Run 16). */
  aligned?: boolean;
  /** Kopfzelle über mehreren Spalten, weder zentriert noch bündig (bisherige, großzügige Regel). */
  loose?: boolean;
}

export interface WrappedGridResult {
  table: NormBodyBlock;
  /** Erste und (ausschließlich) letzte Zeile des Normkörpers, die die Tabelle bilden (`start` kann vor dem Aufrufpunkt liegen). */
  start: number;
  end: number;
  reorder: RelocatedLine;
  bands: Array<[number, number]>;
}

const BAND_TOLERANCE = 3;

/** Zeilenbezeichnung einer Tarif- oder Verzeichnistabelle in der ersten Spalte („7“, „7.2“, „4.7.1.1“). */
const ROW_NUMBER = /^\d+(?:\.\d+)*\.?$/u;

/**
 * Folgt die Zeilenbezeichnung `next` in der Dezimalgliederung unmittelbar auf `previous`? Erste Unterstufe („4.7“ →
 * „4.7.1“), nächste Nummer derselben Stufe („7.1“ → „7.2“) oder einer übergeordneten Stufe („4.7.1.2“ → „4.7.2“, „4.7.2“ →
 * „5“). Andere Nummern (Sprung, Neubeginn einer Aufzählung „1.“) sind keine Fortsetzung der Tabelle.
 */
export function isRowNumberSuccessor(previous: string, next: string): boolean {
  const a = previous.replace(/\.$/u, '').split('.').map(Number);
  const b = next.replace(/\.$/u, '').split('.').map(Number);
  const samePrefix = (length: number): boolean => b.slice(0, length).every((value, position) => value === a[position]);
  if (b.length === a.length + 1) return samePrefix(a.length) && b.at(-1) === 1;
  if (b.length <= a.length) return samePrefix(b.length - 1) && b.at(-1) === a[b.length - 1]! + 1;
  return false;
}

/** Paragraphenbereich einer Inhaltsübersicht („1 - 10“, „47 a - 47 f“, „§§ 132 -135 a“). */
const SECTION_RANGE = /^(?:§§?\s*)?\d+\s*[a-z]?(?:\s*[-–]\s*\d+\s*[a-z]?)?$/u;

/** Aufzählungszeichen, das in einer Tabellenzelle einer Aufzählung vorangeht („-“, „•“). */
const CELL_BULLET = /^[-–•]$/u;

/**
 * Tabelle mit mehrzeiligen Zellen und Kopfzeilen (Run 8/9). Belegt ist das Raster nur, wenn die Geometrie es trägt:
 *
 *   Spalten   aus den vollständigen Zeilen (größte Spaltenzahl k, mindestens zwei solche Zeilen) mit durchgehendem
 *             Zwischenraum. Jedes Segment jeder Zeile überdeckt genau eine Spalte oder – als Zelle über mehrere
 *             Spalten (colspan) – mehrere benachbarte Spalten; vor der ersten vollständigen Zeile (Kopfbereich) muss
 *             ein Segment in seiner Spalte liegen oder über ihr zentriert sein. Ein Segment, das keine Spalte
 *             trifft, beendet das Raster (eine über mehrere Spalten geratene Überschrift wird nie zugeordnet).
 *   Zeilen    Der Abstand zur Vorzeile entscheidet – nach dem Satz der juris-Ausgabe, in der Zeilen derselben
 *             Tabellenzelle im Zeilenabstand des Absatzes stehen und jede neue Tabellenzeile durch den Zellenrand
 *             abgesetzt beginnt: Zeilenabstand (bis `lineGap` + 1 pt) ⇒ Fortsetzung der laufenden Tabellenzeile,
 *             deutlich mehr (ab `lineGap` + 2,5 pt) ⇒ neue Tabellenzeile (auch ohne Text in der ersten Spalte:
 *             Summen-, Zwischen-, Kopfzeile mit leeren Zellen). Dazwischen ist der Abstand nicht beweiskräftig; dann
 *             entscheidet allein die Worttrennung: Endet eine Zelle der laufenden Zeile getrennt („Zivil-“), setzt
 *             die Zeile sie fort; sonst ist nur eine vollständige Zeile eine neue Tabellenzeile – alles andere kein
 *             Raster. Über einen Seitenwechsel gilt dasselbe, zusätzlich muss eine neue Zeile die häufigste
 *             Zellenbelegung der Tabelle tragen.
 *   Anfang    Einzelzeilen unmittelbar vor der ersten Mehrspaltenzeile gehören zur Tabelle, wenn sie in einer Spalte
 *             liegen, nicht am Satzspiegel beginnen, nicht mit Satzzeichen enden und der Abstand zur Tabelle klein ist
 *             („sehr gut“ über „= 16 - 18 Punkte | …“, „Kurvenpunkt“ über „| X | Y“); ebenso Einzelzeilen innerhalb
 *             der Tabelle, denen eine eng anschließende Mehrspaltenzeile folgt.
 *   Wörter    Eine Zeile, deren Segment einen Spaltenzwischenraum überspannt, weil ein Fußnotenzeichen den Abstand
 *             verkürzt („2130*“ neben „Festliegende …“), wird an den Zwischenräumen des Rasters neu aufgeteilt.
 *
 * Nicht belegt (kein Raster, Befund bleibt): eine Zelle, die nach dem Zusammenfügen getrennt endet, eine Zeile mit
 * nicht beweiskräftigem Abstand ohne Worttrennung und ohne vollständige Belegung, ein Seitenwechsel innerhalb einer
 * Zeile ohne diese Belege. Leere Zellen bleiben leer; nichts wird aufgefüllt. Eine Kopfzeile wird nicht als solche
 * gekennzeichnet (alle Zellen `tableCell`).
 */
export function wrappedGrid(lines: readonly PdfLine[], at: number, layout: PdfLayout, options: { lookbehind?: boolean } = {}): WrappedGridResult | { rejection: string; detail?: string } {
  // Belegregeln aus Run 16 zuerst; trägt die Tabelle damit nicht, gilt unverändert das bisherige Raster (eine schon
  // übernommene Tabelle geht durch die neuen Regeln nie verloren).
  const extended = wrappedGridWith(lines, at, layout, options, true);
  if ('table' in extended) return extended;
  const previous = wrappedGridWith(lines, at, layout, options, false);
  return 'table' in previous ? previous : extended;
}

/**
 * `run16`: zusätzliche Belege (Run 16, docs/SCHLESWIG_HOLSTEIN_BULK_READINESS.md § 8d) – Kopfzelle bündig über ihrer
 * Spalte, spaltenübergreifende Kopfzelle mit Unterköpfen, strenger Kopf-Colspan, Tabellenüberschrift keine Kopfzeile,
 * fortgesetzte Zeilennummern, Zeilenrhythmus, Absätze und Aufzählungen in Zellen.
 */
function wrappedGridWith(lines: readonly PdfLine[], at: number, layout: PdfLayout, options: { lookbehind?: boolean }, run16: boolean): WrappedGridResult | { rejection: string; detail?: string } {
  const continuationMax = layout.lineGap + 1;
  const rowMin = layout.lineGap + 2.5;
  const isContinuationGap = (gap: number): boolean => Number.isFinite(gap) && gap <= continuationMax;
  const isRowGap = (gap: number): boolean => Number.isFinite(gap) && gap >= rowMin;
  const nearGap = (gap: number): boolean => Number.isFinite(gap) && gap <= layout.bodyHeight * 1.5;
  // Run 16: Amtliche Inhaltsübersicht als Tabelle („Dritter Teil Gemeindegebiet | 13 - 16“): Nach der Überschrift
  // „Inhaltsverzeichnis“ bzw. „Inhaltsübersicht“ und mit Paragraphenbereichen in der letzten Spalte sind Gliederungswörter
  // („Erster Teil“, „1. Abschnitt:“) Zelleninhalt, keine Überschriften des Normkörpers.
  const tocMode = run16 && lines.slice(Math.max(0, at - 3), at).some((entry) => /^(?:Inhaltsverzeichnis|Inhaltsübersicht)\s*:?$/u.test(entry.text.trim())) && SECTION_RANGE.test(lines[at]!.segments.at(-1)!.text.trim());
  const isHeadingLine = (line: PdfLine): boolean => {
    const text = line.text.trim();
    if (/^Fußnoten$/u.test(text)) return true;
    return !tocMode && (unitFor(text) !== undefined || containerFor(text) !== undefined);
  };
  /**
   * Einzelzeile, die eine Tabellenzelle sein kann: kein Satzende, keine Überschrift. Ob sie in eine Spalte passt,
   * entscheidet die Zuordnung (eine Absatzzeile über die ganze Breite trifft mehrere Spalten und fällt dort heraus).
   */
  const cellLike = (line: PdfLine): boolean => line.segments.length === 1 && (tocMode ? !/^Fußnoten$/u.test(line.text.trim()) : !/[.:;]$/u.test(line.text.trim()) && !isHeadingLine(line) && !/^(?:\d+[a-z]?\.|\d+\)|[a-z]\)|[-–•])\s/u.test(line.text.trim()));

  // Anfang: Einzelzeilen vor der Mehrspaltenzeile bis zum Beginn ihrer Zeilengruppe (höchstens drei).
  let start = at;
  if (options.lookbehind !== false) {
    let probe = at;
    for (let back = 0; back < 3 && probe > 0; back += 1) {
      const previous = lines[probe - 1]!;
      if (!cellLike(previous) || previous.page !== lines[probe]!.page || !nearGap(lines[probe]!.gapBefore)) break;
      probe -= 1;
      if (!isContinuationGap(previous.gapBefore)) {
        start = probe;
        break;
      }
    }
  }

  // Kandidatenzone: Mehrspaltenzeilen, eng anschließende Einzelzeilen und Einzelzeilen, denen eine eng anschließende
  // Mehrspaltenzeile folgt – bis zur ersten Überschrift, Aufzählung oder abgesetzten Einzelzeile.
  const zone: PdfLine[] = [];
  /** Warum die Kandidatenzone endet (Analyse eines zu kurzen Rasters). */
  let zoneEnd = 'Ende des Normkörpers';
  const firstWidth = lines[start]!.segments.length;
  /** Zuletzt gelesene Zeilenbezeichnung der ersten Spalte (Tariftabelle) und ihre Lage. */
  let lastRowNumber: { label: string; x0: number } | undefined;
  /** Abstände, mit denen die Tabellenzeilen der Zone nach ihrer ersten Zeile beginnen (Mehrspaltenzeilen nach Abstand). */
  const rowStarts: number[] = [];
  /** Rechter Rand der ersten Spalte (größtes Ende des ersten Segments einer Mehrspaltenzeile). */
  let firstColumnRight = Number.NEGATIVE_INFINITY;
  /**
   * Zeile innerhalb einer Zelle rechts der ersten Spalte, deutlich enger gesetzt als jede Tabellenzeile der Zone: ein
   * weiterer Absatz oder Aufzählungspunkt derselben Zelle („In diesem Ausbildungsabschnitt … geschult:“ / „- Gesetze …“).
   * Belegt nur, wenn die Zone ihre Zeilen mit einem um mindestens 5 pt größeren Abstand setzt.
   */
  /**
   * Abstand, mit dem nach Zeile `index` die nächste Tabellenzeile in der ersten Spalte beginnt – solange bis dahin nur
   * Fortsetzungen und Zeilen rechts der ersten Spalte stehen (sonst endet die Tabelle vorher: kein Beleg).
   */
  const nextRowStartGap = (index: number): number | undefined => {
    for (let probe = index + 1; probe < lines.length && probe <= index + 80; probe += 1) {
      const candidate = lines[probe]!;
      if (isHeadingLine(candidate)) return undefined;
      if (candidate.x0 > firstColumnRight + BAND_TOLERANCE) continue;
      if (candidate.segments.length >= 2 && isMultiColumnLine(candidate)) return Number.isFinite(candidate.gapBefore) ? candidate.gapBefore : undefined;
      if (!isContinuationGap(candidate.gapBefore)) return undefined;
    }
    return undefined;
  };
  /** Zeilen der Zone, die als weiterer Absatz bzw. Aufzählungspunkt einer Zelle belegt sind. */
  const cellParagraphs = new Set<PdfLine>();
  /** Zeilen, die erst die fortgesetzte Zeilennummer (Run 16) als Tabellenzeile belegt. */
  const numberedByRule = new Set<PdfLine>();
  const insideCell = (line: PdfLine, index: number): boolean => {
    // Erst ab drei Spalten: Zwei Spalten „Nummer | Text“ mit eingerückten Folgeabsätzen sind eine gegliederte Aufzählung.
    if (Math.max(firstWidth, ...zone.map((entry) => entry.segments.length)) < 3) return false;
    if (!Number.isFinite(line.gapBefore) || isContinuationGap(line.gapBefore) || isHeadingLine(line)) return false;
    if (line.x0 <= firstColumnRight + BAND_TOLERANCE || line.gapBefore > layout.bodyHeight * 2) return false;
    // Belege: Zeilenbeginne der Zone nach ihrer ersten Zeile und der nächste Zeilenbeginn danach.
    const next = nextRowStartGap(index);
    const evidence = [...rowStarts, ...(next !== undefined ? [next] : [])];
    return evidence.length > 0 && line.gapBefore <= Math.min(...evidence) - 5;
  };
  /** Aufzählungspunkt einer Zelle am Anfang einer neuen Seite (rechts der ersten Spalte). */
  const bulletAfterPageBreak = (line: PdfLine): boolean => Math.max(firstWidth, ...zone.map((entry) => entry.segments.length)) >= 3 && !Number.isFinite(line.gapBefore) && line.segments.length >= 2 && CELL_BULLET.test(line.segments[0]!.text.trim()) && line.x0 > firstColumnRight + BAND_TOLERANCE;
  for (let index = start; index < lines.length && zone.length < 5000; index += 1) {
    const line = lines[index]!;
    zoneEnd = `vor Zeile „${line.text.trim().slice(0, 50)}“`;
    if (index > start && isHeadingLine(line)) {
      zoneEnd += ' (Überschrift)';
      break;
    }
    const widest = Math.max(firstWidth, ...zone.map((entry) => entry.segments.length));
    const label = line.segments[0]!.text.trim();
    // Eine Zeile mit Aufzählungszeichen in der ersten Spalte ist eine Tabellenzeile, wenn die Tabelle mindestens drei
    // Spalten hat und die Zeile mindestens drei Segmente trägt („1.1 | Erteilung einer Auskunft | bis 250“ im
    // Kostentarif) – oder zwei, wenn ihre Bezeichnung an derselben Stelle die Gliederung der vorigen Tabellenzeile
    // unmittelbar fortsetzt („7.1 | … | 80 Euro“ → „7.2 | Übertragung …“, Gebühr erst in der Folgezeile). Eine
    // Aufzählung hat nur Zeichen und Text.
    const numberedRow = !run16 ? firstWidth >= 3 && line.segments.length >= 3 && ITEM_LABEL.test(label) && /^\d/u.test(label) : widest >= 3 && line.segments.length >= 2 && ITEM_LABEL.test(label) && /^\d/u.test(label) && (
      line.segments.length >= 3 ||
      (lastRowNumber !== undefined && ROW_NUMBER.test(label) && Math.abs(line.segments[0]!.x0 - lastRowNumber.x0) <= BAND_TOLERANCE && isRowNumberSuccessor(lastRowNumber.label, label))
    );
    const withinCell = run16 && index > start && (insideCell(line, index) || bulletAfterPageBreak(line));
    if (withinCell) cellParagraphs.add(line);
    // Neu belegte Zeilennummer (Run 16): nicht schon nach der bisherigen Regel (erste Zeile mit drei Spalten, drei Segmente).
    if (numberedRow && !isMultiColumnLine(line) && !(firstWidth >= 3 && line.segments.length >= 3)) numberedByRule.add(line);
    if (line.segments.length >= 2 && !isMultiColumnLine(line) && !numberedRow && !withinCell) {
      zoneEnd += ' (Aufzählung)';
      break;
    }
    if (index > start && line.segments.length < 2 && !isContinuationGap(line.gapBefore) && !withinCell) {
      const next = lines[index + 1];
      const nextMultiColumn = next !== undefined && next.page === line.page && isMultiColumnLine(next);
      // Abstände, in denen die Tabelle bisher ihre Zeilen setzt.
      const rowGaps = zone.slice(1).map((entry) => entry.gapBefore).filter((gap) => Number.isFinite(gap) && !isContinuationGap(gap));
      // In der Inhaltsübersicht (Run 16) zählt auch der Abstand vor ihrer ersten Zeile als Zeilenabstand.
      const knownGap = [...rowGaps, ...(tocMode && Number.isFinite(zone[0]?.gapBefore) ? [zone[0]!.gapBefore] : [])].some((gap) => Math.abs(gap - line.gapBefore) <= 1.5);
      // Erste Zeile einer umbrochenen Zelle: eng schließt die Mehrspaltenzeile an – oder eine Einzelzeile in einer
      // anderen Spalte („Zusätzliche Einwendungsfrist (§ 10 Abs. 3 BImSchG)“ / „(2 Wochen)“ weit rechts).
      const nextOtherColumn = next !== undefined && next.page === line.page && next.segments.length === 1 && next.x0 >= line.x0 + layout.bodyHeight * 3;
      const startsWrappedRow = (nextMultiColumn || nextOtherColumn) && isContinuationGap(next!.gapBefore) && (nearGap(line.gapBefore) || knownGap || (tocMode && !Number.isFinite(line.gapBefore)));
      // Zeile mit nur einer belegten Spalte im Zeilenraster der Tabelle („Kreisfreie Städte“ vor „01 | Flensburg | …“):
      // die nächste Mehrspaltenzeile folgt im selben Abstand.
      const singleCellRow = nextMultiColumn && isRowGap(line.gapBefore) && Number.isFinite(next!.gapBefore) && Math.abs(next!.gapBefore - line.gapBefore) <= 1.5;
      // Inhaltsübersicht (Run 16): eine Zeile, deren Paragraphenbereich im Textlayer mit dem Titel verschmolzen ist.
      const tocRow = tocMode && knownGap && (/\s(?:§§?\s*)?\d+\s*[a-z]?\s*[-–]\s*\d+\s*[a-z]?$/u.test(line.text.trim()) || (next !== undefined && next.page === line.page + 1 && !Number.isFinite(next.gapBefore) && isMultiColumnLine(next) && SECTION_RANGE.test(next.segments.at(-1)!.text.trim())));
      const startsRow = cellLike(line) && (startsWrappedRow || singleCellRow || tocRow);
      if (!startsRow) {
        zoneEnd += ' (abgesetzte Einzelzeile)';
        break;
      }
    }
    if (line.segments.length >= 2 && !withinCell) {
      if (ROW_NUMBER.test(label)) lastRowNumber = { label, x0: line.segments[0]!.x0 };
      firstColumnRight = Math.max(firstColumnRight, line.segments[0]!.x1);
      if (index > start && Number.isFinite(line.gapBefore) && !isContinuationGap(line.gapBefore)) rowStarts.push(line.gapBefore);
    }
    zone.push(line);
  }
  const k = Math.max(0, ...zone.map((line) => line.segments.length));
  if (k < 2) return { rejection: 'single-row' };
  if (k > TABLE_MAX_COLUMNS) return { rejection: 'too-many-columns' };

  // Spaltenränder aus den vollständigen Zeilen; endet die Zone in Zeilen, die den Zwischenraum verletzen (etwa eine
  // nummerierte Überschrift „2  Erhaltungsziele“ hinter der Tabelle), wird sie davor beendet.
  let left: number[] = [];
  let right: number[] = [];
  let zoneLength = zone.length;
  let gutters = false;
  for (let attempt = 0; attempt < 60 && zoneLength >= 2 && !gutters; attempt += 1) {
    const full = zone.slice(0, zoneLength).filter((line) => line.segments.length === k);
    // Auch eine einzige vollständige Zeile (Kopfzeile über allen Spalten) trägt das Raster: Jede weitere Zelle muss in
    // ihre Spalte passen, und die Tabelle braucht mindestens zwei Zeilen.
    if (full.length < 1) break;
    left = Array.from({ length: k }, (_, column) => Math.min(...full.map((line) => line.segments[column]!.x0)));
    right = Array.from({ length: k }, (_, column) => Math.max(...full.map((line) => line.segments[column]!.x1)));
    gutters = left.every((value, column) => column === 0 || right[column - 1]! < value);
    if (!gutters) zoneLength -= 1;
  }
  if (!gutters) return { rejection: 'no-gutter' };
  const bandWidth = (column: number): number => right[column]! - left[column]!;
  const overlap = (segment: { x0: number; x1: number }, column: number): number => Math.min(segment.x1, right[column]!) - Math.max(segment.x0, left[column]!);

  /**
   * Kopfzelle über mehreren Spalten, die keine dieser Spalten vollständig überdeckt („Koordinaten“ über „X | Y | Z“):
   * Sie liegt im freien Raum zwischen den Nachbarspalten und ist über genau einem zusammenhängenden Spaltenbereich
   * zentriert. Ob darunter Unterköpfe in diesem Bereich stehen, prüft die Tabelle danach (sonst kein Raster).
   */
  const centeredSpan = (segment: { x0: number; x1: number }, blocked: ReadonlySet<number>): GridPlacement | undefined => {
    const candidates: GridPlacement[] = [];
    for (let first = 0; first < k; first += 1) {
      // Nie über alle Spalten (das ist eine Tabellenüberschrift) und nie über Spalten, die andere Segmente derselben
      // Zeile belegen.
      for (let last = first + 1; last < k && last - first + 1 < k; last += 1) {
        if (Array.from({ length: last - first + 1 }, (_, offset) => first + offset).some((column) => blocked.has(column))) break;
        const free = (first === 0 || segment.x0 > right[first - 1]!) && (last === k - 1 || segment.x1 < left[last + 1]!);
        const unionCenter = (left[first]! + right[last]!) / 2;
        const tolerance = Math.max(2 * BAND_TOLERANCE, 0.05 * (right[last]! - left[first]!));
        if (free && Math.abs((segment.x0 + segment.x1) / 2 - unionCenter) <= tolerance) candidates.push({ column: first, span: last - first + 1 });
      }
    }
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  /** Kopfzellen über mehreren Spalten nach `centeredSpan` (Zeile, Spalte, Spannweite) – zur Prüfung der Unterköpfe. */
  const spanningHeads: Array<{ row: number; column: number; span: number; multi: boolean }> = [];
  const hitsOf = (segment: { x0: number; x1: number }): number[] => Array.from({ length: k }, (_, column) => column).filter((column) => overlap(segment, column) > 0.5);

  const place = (segment: { x0: number; x1: number }, strict: boolean, multi = false, blocked: ReadonlySet<number> = new Set()): GridPlacement | undefined => {
    const direct = placeDirect(segment, strict, multi, blocked);
    if (direct || !strict) return direct;
    const spanning = run16 ? centeredSpan(segment, blocked) : undefined;
    return spanning ? { ...spanning, spanning: true } : undefined;
  };
  const placeDirect = (segment: { x0: number; x1: number }, strict: boolean, multi: boolean, blocked: ReadonlySet<number>): GridPlacement | undefined => {
    const hit = hitsOf(segment);
    if (hit.length === 0) return undefined;
    const first = hit[0]!;
    const last = hit.at(-1)!;
    if (hit.length > 1) {
      if (last - first !== hit.length - 1) return undefined;
      // Im Kopfbereich: Ist die Zelle über einem breiteren freien Spaltenbereich zentriert, der die getroffenen Spalten
      // enthält („Erforderliche Fahrgassenbreite“ über „2,30 m | 2,40 m | 2,50 m“), gilt dieser (mit Unterkopfprüfung).
      const wider = run16 && strict ? centeredSpan(segment, blocked) : undefined;
      if (wider && wider.column <= first && wider.column + wider.span - 1 >= last && wider.span > hit.length) return { ...wider, spanning: true };
      // Zelle über mehrere Spalten: im Kopfbereich über den Spalten zentriert, in Datenzeilen innerhalb ihrer Spalten.
      const center = (segment.x0 + segment.x1) / 2;
      // Eine Einzelzeile über alle Spalten im Kopfbereich ist die Überschrift der Tabelle, keine Kopfzelle.
      if (run16 && strict && !multi && hit.length === k) return undefined;
      // Kopfbereich: über den Spalten zentriert oder an beiden Rändern bündig; eine Kopfzelle, die mitten in einer
      // Spalte endet („Erforderliche Fahrgassenbreite (in m)“ linksbündig über drei Spalten), ist nicht zuzuordnen.
      const unionCenter = (left[first]! + right[last]!) / 2;
      const flush = Math.abs(segment.x0 - left[first]!) <= BAND_TOLERANCE && Math.abs(segment.x1 - right[last]!) <= BAND_TOLERANCE;
      const exact = Math.abs(center - unionCenter) <= Math.max(2 * BAND_TOLERANCE, 0.05 * (right[last]! - left[first]!)) || flush;
      const inUnion = strict
        ? center >= left[first]! - BAND_TOLERANCE && center <= right[last]! + BAND_TOLERANCE
        : segment.x0 >= left[first]! - BAND_TOLERANCE && segment.x1 <= right[last]! + BAND_TOLERANCE;
      // `loose`: im Kopfbereich nur „irgendwo über den Spalten“, weder zentriert noch bündig (bisherige Regel; mit den
      // neuen Belegregeln nicht kombinierbar, siehe unten).
      return inUnion ? { column: first, span: hit.length, ...(strict && !exact ? { loose: true } : {}) } : undefined;
    }
    const contained = segment.x0 >= left[first]! - BAND_TOLERANCE && segment.x1 <= right[first]! + BAND_TOLERANCE;
    const centered = Math.abs((segment.x0 + segment.x1) / 2 - (left[first]! + right[first]!) / 2) <= 0.25 * Math.max(segment.x1 - segment.x0, bandWidth(first));
    const between = (first === 0 || segment.x0 > right[first - 1]!) && (first === k - 1 || segment.x1 < left[first + 1]!);
    // Kopfzeile mit mehreren Segmenten, deren Kopfzelle breiter als ihre (Zahlen-)Spalte ist („Geburtsjahr“ über
    // „1947“): Sie liegt allein über dieser Spalte, bündig mit ihrem linken oder rechten Rand.
    const aligned = Math.abs(segment.x0 - left[first]!) <= BAND_TOLERANCE || Math.abs(segment.x1 - right[first]!) <= BAND_TOLERANCE;
    if (strict ? contained || centered : between) return { column: first, span: 1 };
    if (run16 && strict && multi && between && aligned) return { column: first, span: 1, aligned: true };
    return undefined;
  };

  /** Segmente einer Zeile, notfalls an den Zwischenräumen des Rasters neu aus den Wörtern gebildet. */
  const segmentsOf = (line: PdfLine): LineSegment[] => {
    if (!line.words || line.words.length === 0) return line.segments;
    // Trennstelle: Das nächste Wort beginnt am linken Rand einer Spalte (rechtsbündige Zahl oder linksbündiger Text), das
    // vorige endet davor – etwa „Klein Bennebek“ vor „117“, wenn der Abstand unter der Spaltenschwelle liegt.
    const gutterBetween = (a: { x1: number }, b: { x0: number }): boolean => left.some((value, column) => column > 0 && a.x1 < value - 0.5 && b.x0 >= value - BAND_TOLERANCE && (column === k - 1 || b.x0 < left[column + 1]! - BAND_TOLERANCE));
    const rebuilt: LineSegment[] = [];
    let lastBase: { x1: number } | undefined;
    for (const word of line.words) {
      const current = rebuilt.at(-1);
      if (word.superscript) {
        if (current) {
          current.text += word.text;
          current.x1 = Math.max(current.x1, word.x1);
        } else rebuilt.push({ x0: word.x0, x1: word.x1, text: word.text });
        continue;
      }
      if (current && lastBase && !gutterBetween(lastBase, word)) {
        current.text += ` ${word.text}`;
        current.x1 = Math.max(current.x1, word.x1);
      } else rebuilt.push({ x0: word.x0, x1: word.x1, text: word.text });
      lastBase = word;
    }
    return rebuilt.length > line.segments.length ? rebuilt : line.segments;
  };

  /** Zeile → Zellen (Startspalte, Spannweite); `undefined`, wenn ein Segment keine Spalte trifft. */
  const cellsOf = (line: PdfLine, strict: boolean): Map<number, PlacedCell> | undefined => {
    const tryWith = (segments: readonly LineSegment[], containedOnly = false): Map<number, PlacedCell> | undefined => {
      const cells = new Map<number, PlacedCell>();
      const covered = new Set<number>();
      const hits = segments.map(hitsOf);
      for (const [position, segment] of segments.entries()) {
        const blocked = new Set(hits.flatMap((columns, other) => (other === position ? [] : columns)));
        // Mehrere Segmente schon im Textlayer (nicht erst durch Teilung an den Spaltenrändern): Kopfzeile, keine Titelzeile.
        const placement = place(segment, strict, line.segments.length >= 2, blocked);
        if (!placement) return undefined;
        if (containedOnly && (placement.span !== 1 || placement.spanning)) return undefined;
        // Aufzählungszeichen und Text in derselben Zelle („- | Gesetze, Verordnungen und“): ein Zelleninhalt.
        const marker = cells.get(placement.column);
        if (marker && placement.span === 1 && marker.span === 1 && CELL_BULLET.test(marker.text)) {
          marker.text = `${marker.text} ${segment.text.trim()}`;
          continue;
        }
        for (let column = placement.column; column < placement.column + placement.span; column += 1) {
          if (covered.has(column)) return undefined;
          covered.add(column);
        }
        if (placement.aligned || placement.spanning) newRules.add('Kopfzelle');
        if (placement.loose) looseSpans += 1;
        cells.set(placement.column, { text: segment.text.trim(), span: placement.span, ...(placement.spanning ? { spanning: true, multi: line.segments.length >= 2 } : {}) });
      }
      return cells;
    };
    // Eine feinere Aufteilung an Spaltenrändern hat Vorrang (verschmolzene Zellen); sonst die Segmente der Zeile.
    // Im Kopfbereich wird eine Einzelzeile nur geteilt, wenn jedes Teil in genau einer Spalte liegt („1150*“ |
    // „Lagunen des Küstenraums“); sonst ist sie über mehrere Spalten eine Überschrift, keine Zellenfolge.
    const split = segmentsOf(line);
    const fromSplit = split.length > line.segments.length ? tryWith(split, run16 && strict && line.segments.length === 1) : undefined;
    if (run16 && fromSplit && line.segments.length >= 2) splitLines.add(line);
    return fromSplit ?? tryWith(line.segments);
  };

  const rows: GridCell[][] = [];
  /**
   * Belegregeln aus Run 16, die diese Tabelle trägt (Kopfzelle, Zeilennummer, Zeilenrhythmus, Zellenabsatz). Sie werden
   * nie mit einer nur großzügig zugeordneten Kopfzelle (`loose`) kombiniert: Eine so entstehende Tabelle ist nicht belegt.
   */
  const newRules = new Set<string>();
  let looseSpans = 0;
  /** Mehrspaltenzeilen, deren Zellen erst die Teilung an den Spaltenrändern ergab (kein einfaches Raster mehr). */
  const splitLines = new Set<PdfLine>();
  /** Ablehnung mit der Zeile, an der sie entstand (für Befund und Analyse). */
  const reject = (rejection: string, line?: PdfLine): { rejection: string; detail?: string } => ({ rejection, ...(line ? { detail: `Zeile „${line.text.trim().slice(0, 60)}“ (${line.segments.map((segment) => `${Math.round(segment.x0)}–${Math.round(segment.x1)}`).join(', ')}) gegen Spalten ${left.map((value, column) => `${Math.round(value)}–${Math.round(right[column]!)}`).join(', ')}` } : {}) });
  /** Zellenbelegungen abgeschlossener, abgesetzt begonnener Tabellenzeilen (Summen-, Zwischenzeilen). */
  const rowShapes = new Set<string>();
  const shapeOf = (row: readonly GridCell[]): string => row.map((cell, column) => (cell ? column : -1)).filter((column) => column >= 0).join(',');
  let current: GridCell[] | undefined;
  let continuations = 0;
  let spans = 0;
  let fullSeen = false;
  let end = start;
  /** Abgesetzte Zeile, die keine Spalte trifft und die Tabelle beendet (Analyse eines zu kurzen Rasters). */
  let stop: PdfLine | undefined;
  const isFull = (cells: Map<number, PlacedCell>): boolean => [...cells.values()].reduce((sum, cell) => sum + cell.span, 0) === k;
  /** Abstände, mit denen vollständig belegte Tabellenzeilen beginnen (Zeilenrhythmus). */
  const fullRowGaps: number[] = [];
  const newRow = (cells: Map<number, PlacedCell>, gap: number): void => {
    current = Array.from({ length: k }, () => undefined);
    for (const [column, cell] of cells) {
      current[column] = { text: cell.text, span: cell.span };
      if (cell.span > 1) spans += 1;
      if (cell.spanning) spanningHeads.push({ row: rows.length, column, span: cell.span, multi: cell.multi === true });
      for (let covered = column + 1; covered < column + cell.span; covered += 1) current[covered] = null;
    }
    rows.push(current);
    if (Number.isFinite(gap) && !isContinuationGap(gap) && isFull(cells)) fullRowGaps.push(gap);
  };
  /**
   * Fortsetzungszellen gehören in eine bestehende Zelle derselben Spalte(n); sonst nicht belegt. `paragraph`: weiterer
   * Absatz bzw. Aufzählungspunkt derselben Zelle (Zeilenumbruch im Zellentext wie im übrigen Bestand).
   */
  const continueRow = (cells: Map<number, PlacedCell>, paragraph = false): boolean => {
    for (const [column, cell] of cells) {
      let owner = column;
      while (owner > 0 && current![owner] === null) owner -= 1;
      const target = current![owner];
      if (target === undefined) {
        // Noch leere Spalte(n) der Zeile: Der Wert steht erst in der Folgezeile, weil die Zelle davor umbrochen ist
        // („Zusätzliche Einwendungsfrist (§ 10 Abs. 3 BImSchG)“ / „(2 Wochen)“). Eine spaltenübergreifende Kopfzelle
        // beginnt nie in einer Fortsetzungszeile.
        if (owner !== column || cell.spanning) return false;
        for (let covered = column; covered < column + cell.span; covered += 1) if (current![covered] !== undefined) return false;
        current![column] = cell;
        if (cell.span > 1) spans += 1;
        for (let covered = column + 1; covered < column + cell.span; covered += 1) current![covered] = null;
        continue;
      }
      if (!target || column + cell.span > owner + target.span) return false;
      target.text = paragraph ? `${target.text}\n${cell.text}` : joinLines(target.text, cell.text);
    }
    continuations += 1;
    return true;
  };
  /**
   * Zeile innerhalb der laufenden Tabellenzeile trotz Abstand: weiterer Absatz oder Aufzählungspunkt einer schon
   * belegten Zelle rechts der ersten Spalte, deutlich enger als jeder Zeilenbeginn der Tabelle (mindestens 5 pt) – oder
   * ein Aufzählungspunkt einer solchen Zelle am Anfang einer neuen Seite.
   */
  const withinCurrentCells = (line: PdfLine, cells: Map<number, PlacedCell>, gap: number): boolean => {
    // Nur im Datenbereich (Kopfzeilen sind eigene Zeilen) und nur in genau die Spalte(n) einer belegten Zelle.
    if (!current || !fullSeen || k < 3 || !cellParagraphs.has(line) || cells.has(0) || cells.size === 0) return false;
    const filled = [...cells.entries()].every(([column, cell]) => {
      const target = current![column];
      return column > 0 && Boolean(target?.text) && target!.span === cell.span;
    });
    if (!filled) return false;
    return Number.isFinite(gap) || [...cells.values()].every((cell) => /^[-–•]\s/u.test(cell.text));
  };
  /** Zellen, deren Bindestrich am Ende zum Wort gehört (Run 16, siehe Zeilenabstand). */
  const wordHyphens = new Set<object>();
  const hyphenated = (): number[] => (current ?? []).map((cell, column) => (cell && !wordHyphens.has(cell) && /\p{L}-$/u.test(cell.text) ? column : -1)).filter((column) => column >= 0);
  const filledColumns = (cells: Map<number, PlacedCell>): number[] => [...cells.keys()].sort((a, b) => a - b);

  for (let index = 0; index < zoneLength; index += 1) {
    const line = zone[index]!;
    const cells = cellsOf(line, !fullSeen);
    // Run 16: Vorgezogene Einzelzeile, im Satzspiegel zentriert und nicht bündig in ihrer Spalte, ist die Überschrift
    // der Tabelle („Kostentarif“), keine Zeile (ohne sie entscheidet der Aufrufer neu).
    if (run16 && cells && start + index < at && isCentered(line, layout) && [...cells.entries()].some(([column, cell]) => cell.span > 1 || Math.abs(line.x0 - left[column]!) > BAND_TOLERANCE)) return reject('header-unassigned', line);
    const gap = line.gapBefore;
    if (!cells) {
      // Eine eng anschließende Zeile, die in keine Spalte passt, ist eine nicht belegte Fortsetzung; eine abgesetzte
      // Zeile beendet die Tabelle (sie gehört nicht mehr dazu).
      if (rows.length === 0) return reject(fullSeen ? 'cell-unassigned' : 'header-unassigned', line);
      if (isContinuationGap(gap)) return reject('cell-unassigned', line);
      stop = line;
      break;
    }
    if (!current) {
      newRow(cells, gap);
    } else if (isContinuationGap(gap)) {
      if (!continueRow(cells)) return reject('cell-unassigned', line);
    } else {
      const open = hyphenated();
      const columns = filledColumns(cells);
      const continuesOpen = open.length > 0 && open.every((column) => columns.includes(column));
      if (open.length === 0 && withinCurrentCells(line, cells, gap)) {
        if (!continueRow(cells, true)) return reject('cell-unassigned', line);
        newRules.add('Zellenabsatz');
      } else if (isRowGap(gap)) {
        // Deutlich abgesetzt nach einer getrennt endenden Zelle: widersprüchlich – außer (Run 16) die Zelle endet mit
        // einem nachgestellten Namensteil („Augustenkoog, Neu-“ für Neu-Augustenkoog), die Folgezeile ist vollständig
        // und steht genau im Zeilenrhythmus der Tabelle: Dann gehört der Bindestrich zum Wort, keine Silbentrennung
        // („kassenmä-“, „Stun-“ bleiben Befund).
        const invertedNames = open.every((column) => /,\s*\p{Lu}\p{Ll}*-$/u.test(current![column]!.text));
        if (open.length > 0 && run16 && invertedNames && isFull(cells) && fullRowGaps.some((rowGap) => Math.abs(rowGap - gap) <= 0.5)) {
          for (const column of open) wordHyphens.add(current[column]!);
          newRules.add('Bindestrich im Wort');
        } else if (open.length > 0) return reject('hyphenated-cell', line);
        rowShapes.add(shapeOf(current));
        newRow(cells, gap);
      } else if (!Number.isFinite(gap)) {
        // Seitenwechsel: Fortsetzung nur mit Worttrennung; neue Zeile nur vollständig oder in einer Belegung, die die
        // Tabelle schon als abgesetzte Zeile gezeigt hat (Summenzeile ohne erste Spalte).
        if (open.length > 0) {
          if (!continuesOpen || !continueRow(cells)) return reject('page-break-in-table', line);
        } else if (tocMode && current[k - 1] === undefined) {
          // Inhaltsübersicht: Eintrag ohne Paragraphenbereich („Achter Teil“) setzt sich auf der neuen Seite fort.
          if (!continueRow(cells)) return reject('page-break-in-table', line);
        } else if (isFull(cells) || rowShapes.has(columns.join(',')) || (tocMode && cells.has(0))) {
          // Inhaltsübersicht (Run 16): Jede Zeile beginnt in der ersten Spalte; ein Seitenwechsel ohne Worttrennung
          // beginnt eine neue Zeile.
          rowShapes.add(shapeOf(current));
          newRow(cells, gap);
        } else return reject('page-break-in-table', line);
      } else if (open.length > 0) {
        if (!continuesOpen || !continueRow(cells)) return reject('ambiguous-row-gap', line);
      } else if (isFull(cells)) {
        rowShapes.add(shapeOf(current));
        newRow(cells, gap);
      } else if (run16 && cells.has(0) && fullRowGaps.some((rowGap) => Math.abs(rowGap - gap) <= 0.5)) {
        // Zeilenrhythmus der Tabelle: Der Abstand liegt zwischen Zeilen- und Absatzabstand, aber genau dort, wo die
        // Tabelle schon vollständige Zeilen beginnt; die Zeile beginnt in der ersten Spalte (Teilzeile ohne Spalte 3).
        rowShapes.add(shapeOf(current));
        newRow(cells, gap);
        newRules.add('Zeilenrhythmus');
      } else return reject('ambiguous-row-gap', line);
    }
    if (line.segments.length === k) fullSeen = true;
    end = start + index + 1;
  }
  // Spaltenübergreifende Kopfzelle ohne vollständige Überdeckung: belegt nur mit mindestens zwei Unterköpfen darunter in
  // ihrem Bereich („Koordinaten“ über „X | Y | Z“); steht sie allein in ihrer Zeile (möglicherweise eine Überschrift),
  // darf die Zeile darunter nur Unterköpfe dieses Bereichs tragen.
  for (const head of spanningHeads) {
    const below = rows[head.row + 1];
    const columnsBelow = (below ?? []).map((cell, column) => (cell ? column : -1)).filter((column) => column >= 0);
    const inside = columnsBelow.filter((column) => column >= head.column && column < head.column + head.span);
    if (inside.length < 2 || (!head.multi && inside.length !== columnsBelow.length)) return { rejection: 'header-unassigned', detail: `Kopfzelle über Spalten ${head.column + 1}–${head.column + head.span} ohne Unterköpfe` };
  }
  if (zone.slice(0, end - start).some((line) => numberedByRule.has(line))) newRules.add('Zeilennummer');
  if (looseSpans > 0 && newRules.size > 0) return { rejection: 'header-unassigned', detail: `Kopfzelle nur großzügig über mehreren Spalten zugeordnet, zusammen mit ${[...newRules].join(', ')}` };
  if (rows.length < 2) return stop ? reject('single-row', stop) : zoneLength < zone.length ? reject('single-row', zone[zoneLength]) : { rejection: 'single-row', detail: `Zone aus ${zone.length} Zeile(n) endet ${zoneEnd}` };
  // Eine Tabelle zeigt ihre Spalten in mindestens zwei Zeilen: Eine Zeile über alle Spalten und eine einzige mehrzellige
  // Zeile („als Arbeitnehmer/in“ / „wird in Ergänzung zum Arbeitsvertrag vom … geschlossen: … Zusatzvereinbarung“) sind
  // ein Formularsatz mit Lücken, kein Raster.
  if (rows.filter((row) => row.filter((cell) => cell).length >= 2).length < 2) return { rejection: 'single-row' };
  // Keine Zelle darf getrennt enden (umbrochene Zelle ohne belegte Fortsetzung).
  if (rows.some((row) => row.some((cell) => cell && !wordHyphens.has(cell) && /\p{L}-$/u.test(cell.text)))) return { rejection: 'hyphenated-cell' };
  // Run 16: Zeilen, die erst die neuen Belege tragen (Zeilen mit Dezimalnummer, Bindestrich im Wort, geteilte Zeilen), kann
  // das einfache Raster nicht wiedergeben – dann gilt dieses Ergebnis. Aufzählungsnummern („1.“) zählen nicht.
  const beyondSimple = run16 && (splitLines.size > 0 || wordHyphens.size > 0 || zone.slice(0, end - start).some((entry) => entry.segments.length >= 2 && !isMultiColumnLine(entry) && /^\d+(?:\.\d+)+$/u.test(entry.segments[0]!.text.trim())));
  if (continuations === 0 && spans === 0 && !beyondSimple && rows.every((row) => row.every((cell) => cell !== undefined))) return { rejection: 'single-row' }; // einfaches Raster: `leadingGrid`
  // Kein Zeichen verloren oder hinzugekommen: dieselben Buchstaben und Ziffern in Quelle und Zellen (nur die Folge ändert
  // sich, weil Zellen über mehrere Zeilen laufen).
  const consumed = lines.slice(start, end);
  const sourceText = consumed.map((line) => line.text).join('\n');
  const cellText = rows.map((row) => row.filter((cell): cell is { text: string; span: number } => Boolean(cell)).map((cell) => cell.text).join('\n')).join('\n');
  const sorted = (text: string): string => [...characterStream(text)].sort().join('');
  if (sorted(sourceText) !== sorted(cellText)) return { rejection: 'cell-unassigned' };
  return {
    reorder: { reason: 'Tabelle mit mehrzeiligen Zellen (Quelle zeilenweise, Normkörper zellenweise)', text: sourceText, replacement: cellText },
    bands: left.map((value, column) => [value, right[column]!] as [number, number]),
    table: {
      type: 'table',
      columns: k,
      children: rows.map((row) => ({
        type: 'tableRow',
        children: row.flatMap((cell): NormBodyBlock[] => (cell === null ? [] : [{ type: 'tableCell', text: cell?.text ?? '', ...(cell && cell.span > 1 ? { colspan: cell.span } : {}) }])),
      })),
    },
    start,
    end,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Abbildungen                                                                                      */

/** juris-Vermerk zu einer nicht in die Ausgabe aufgenommenen PDF-Anlage (mit Symbolbild davor). */
export const PDF_ATTACHMENT_NOTE = /^Es ist Text als PDF-Datei vorhanden\.?/u;
/** Zulässige Abweichung des Seitenverhältnisses zwischen Bild (Pixel) und Lage in der Ausgabe. */
const FIGURE_ASPECT_TOLERANCE = 1.25;
/** Bilder unter dieser Fläche (Punkt²) sind Satzmittel (Abstandshalter, Linien), keine Abbildung. */
const FIGURE_MIN_AREA = 16;

const before = (page: number, y: number, other: { page: number; y: number }): boolean => page < other.page || (page === other.page && y < other.y);

/**
 * Ordnet die Bilder der Ausgabe dem Normkörper zu. Übernommen (als `figure`) wird ein Bild im Bereich des Normkörpers
 * (nach Kopf, Titel und Verzeichnis, vor den redaktionellen Anhängen), das keinen Text überdeckt und unverzerrt
 * gesetzt ist. Nicht übernommen, aber benannt: Signets im Kopf, das juris-Symbol einer nicht aufgenommenen
 * PDF-Anlage (der Vermerk selbst ist ein technischer Hinweis, siehe `removeEditorialNotes`) und Abstandshalter.
 * Alles andere ist ein Befund `figure` (Review) – eine Abbildung wird nie stillschweigend verworfen.
 */
export function placeFigures(images: readonly PdfImage[], context: { before?: PdfLine; bodyLines: readonly PdfLine[]; after?: PdfLine; layout: PdfLayout; findings: ParseFinding[] }): PlacedFigure[] {
  const { bodyLines, layout, findings } = context;
  const start = context.before ? { page: context.before.page, y: context.before.y1 - 1 } : { page: 1, y: Number.NEGATIVE_INFINITY };
  const end = context.after ? { page: context.after.page, y: context.after.y0 } : { page: Number.POSITIVE_INFINITY, y: 0 };
  const placed: PlacedFigure[] = [];
  const sorted = [...images].sort((left, right) => left.page - right.page || left.y0 - right.y0 || left.x0 - right.x0);
  for (const image of sorted) {
    const where = `Seite ${image.page}, Bild ${image.index}`;
    // Kopf (Signets: Landeswappen, juris-Logo) und redaktionelle Anhänge.
    if (before(image.page, image.y0, start) || !before(image.page, image.y0, end)) continue;
    const placedWidth = image.x1 - image.x0;
    const placedHeight = image.y1 - image.y0;
    if (placedWidth * placedHeight < FIGURE_MIN_AREA) continue;
    const pageLines = bodyLines.filter((line) => line.page === image.page);
    // juris-Symbol vor „Es ist Text als PDF-Datei vorhanden“.
    const next = pageLines.find((line) => line.y0 >= image.y1 - 2);
    if (next && next.y0 - image.y1 < 30 && PDF_ATTACHMENT_NOTE.test(next.text.trim())) continue;
    const geometry = layout.pages.find((page) => page.page === image.page);
    if (geometry && (image.x0 < -1 || image.y0 < -1 || image.x1 > geometry.width + 1 || image.y1 > geometry.height + 1)) {
      findings.push({ severity: 'warning', code: 'figure', message: `${where}: Abbildung ragt über die Seite hinaus – Lage nicht belegt`, page: image.page });
      continue;
    }
    const within = (value: number): boolean => value <= FIGURE_ASPECT_TOLERANCE && value >= 1 / FIGURE_ASPECT_TOLERANCE;
    const ratio = (placedWidth / placedHeight) / (image.width / image.height);
    // Um 90° gedreht gesetzt (Querformat-Karte auf Hochformatseite): Das Bild selbst liegt aufrecht vor und wird so übernommen.
    const rotated = !within(ratio) && within((placedWidth / placedHeight) / (image.height / image.width));
    if (!within(ratio) && !rotated) {
      findings.push({ severity: 'warning', code: 'figure', message: `${where}: Abbildung in der Ausgabe verzerrt gesetzt (${image.width}×${image.height} Pixel auf ${Math.round(placedWidth)}×${Math.round(placedHeight)} pt) – Darstellung der Quelle nicht verlässlich`, page: image.page });
      continue;
    }
    const covered = pageLines.find((line) => Math.min(line.y1, image.y1) - Math.max(line.y0, image.y0) > 2 && Math.min(line.x1, image.x1) - Math.max(line.x0, image.x0) > 2);
    if (covered) {
      findings.push({ severity: 'warning', code: 'figure', message: `${where}: Abbildung überdeckt Text („${covered.text.slice(0, 50)}“) – Zuordnung nicht sicher`, page: image.page });
      continue;
    }
    // Vor der ersten Zeile, die nicht vollständig über dem Bild endet (Legendensymbol neben seiner Beschreibung: davor).
    let beforeLine = bodyLines.findIndex((line) => line.page > image.page || (line.page === image.page && line.y1 > image.y0 + 1));
    if (beforeLine < 0) beforeLine = bodyLines.length;
    placed.push({ ...image, beforeLine });
    findings.push({ severity: 'info', code: 'figure-asset', message: `${where}: Abbildung als Asset übernommen (${image.width}×${image.height} Pixel, ${image.mediaType}${rotated ? ', in der Ausgabe um 90° gedreht gesetzt' : ''}, SHA-256 ${image.sha256.slice(0, 12)}…)`, page: image.page });
  }
  return placed;
}

/** `figure`-Block einer übernommenen Abbildung. */
export function figureBlock(figure: PdfImage): NormBodyBlock {
  return { type: 'figure', asset: { sha256: figure.sha256, mediaType: figure.mediaType, byteLength: figure.byteLength, sourcePath: figure.sourcePath, width: figure.width, height: figure.height } };
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

/** Analysehaken (nur Werkzeuge außerhalb des Imports): jede abgelehnte Tabelle mit Grund und Zeile. */
export type TableTrace = (entry: { lines: readonly PdfLine[]; findingCount: number; index: number; line: PdfLine; rejection: string; wrapped?: { rejection: string; detail?: string }; simple?: string }) => void;
let tableTrace: TableTrace | undefined;
export function setTableTrace(trace: TableTrace | undefined): void {
  tableTrace = trace;
}

export function buildBody(lines: PdfLine[], layout: PdfLayout, findings: ParseFinding[], isVwv: boolean, figures: readonly PlacedFigure[] = [], reorders: RelocatedLine[] = []): NormBodyBlock[] {
  const root: NormBodyBlock[] = [];
  const pendingFigures = [...figures].sort((left, right) => left.beforeLine - right.beforeLine || left.page - right.page || left.y0 - right.y0 || left.x0 - right.x0);
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
  /** Erste Zeile nach der zuletzt übernommenen Tabelle. */
  let tableEnd = -1;
  /** Mehrspaltige Zeilen, die als Fortsetzung des Fließtexts erkannt wurden (keine Tabellenzeilen). */
  const textContinuations = new Set<number>();
  /** Grund, aus dem der zuletzt begonnene Block kein sicheres Raster ist (Befundtext). */
  let tableRejection: string = 'single-row';
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

  // Abbildungen an ihrer Stelle im Normkörper: in der offenen Einzelnorm bzw. Anlage, als eigener Block.
  const emitFigures = (upTo: number): void => {
    while (pendingFigures.length > 0 && pendingFigures[0]!.beforeLine <= upTo) {
      closeText();
      previousCentered = false;
      target().push(figureBlock(pendingFigures.shift()!));
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    emitFigures(index);
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
    // Eine Fußnote setzt sich nie in einer zentrierten Überschrift der nächsten Seite fort („§ 2“ nach „… getreten.]“).
    const continuesSentence: boolean = open !== undefined && open.block.type !== 'footnote' && newPage && !/[.:;]$/u.test(previousText);
    // Eine Mehrspaltenzeile, auf die eine Zeile mit denselben Spaltenanfängen folgt, ist eine Tabellenzeile, keine
    // zufällig mittig stehende Überschrift („Richtung  050°/230°“ über „Länge  2162 m“).
    const nextLine = lines[index + 1];
    // Spalten „gleich“ heißt: jede Spalte überlappt waagerecht die Spalte der Folgezeile (Kopf „Punktzahl“ über „105 - 97“).
    // Auch eine Kopfzeile mit weniger Spalten („X | Y“ über „1 | 3245… | 6085…“): jede ihrer Spalten liegt über einer
    // eigenen Spalte der Folgezeile.
    const overlaps = (segment: LineSegment, other: LineSegment): boolean => Math.min(segment.x1, other.x1) > Math.max(segment.x0, other.x0);
    const tableRow = nextLine !== undefined && isMultiColumnLine(line) && isMultiColumnLine(nextLine) && nextLine.page === line.page && nextLine.segments.length >= line.segments.length && (() => {
      let cursor = 0;
      for (const segment of line.segments) {
        while (cursor < nextLine.segments.length && !overlaps(segment, nextLine.segments[cursor]!)) cursor += 1;
        if (cursor >= nextLine.segments.length) return false;
        cursor += 1;
      }
      return true;
    })();
    // Eine Einheitenbezeichnung allein auf einer zentrierten Zeile am Seitenanfang („Artikel 3“ nach „(Änderungsanweisungen)“
    // oder „Gliederungsnummer: …“ der Vorseite) ist eine Überschrift, auch wenn die Vorseite ohne Satzzeichen endet.
    const labelOnly = unitType !== undefined && line.segments.length === 1 && UNIT_PATTERNS.find((entry) => entry.type === unitType)!.pattern.exec(text)![0].trim() === text;
    const centered: boolean = !tableRow && isCentered(line, layout) && (previousCentered || (breakBefore && !continuesSentence) || (newPage && (!continuesSentence || labelOnly)));
    const previousLineCentered = previousCentered;
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
        // Zentrierte Fortsetzung einer Überschrift, die mit einem Anschlusswort endet („… Abgaben nach“ / „§ 9 KAG, der …“):
        // Titelzeile, keine Einheit.
        const openHeading = unit ?? containers.at(-1)?.block;
        if (openHeading?.title && !open && (openHeading.children?.length ?? 0) === 0 && previousLineCentered && gap <= layout.lineGap + 1 && TITLE_CONTINUATION.test(openHeading.title)) {
          appendTitle(text);
          continue;
        }
        // Anlagenkennung als Seitenmarke (rechts oben, auf jeder Seite einer mehrseitigen Anlage wiederholt): keine neue Anlage.
        if (unitType === 'annex' && unit?.type === 'annex' && unit.label === normalizeLabel(label) && (newPage || line.x0 > (layout.left + layout.right) / 2)) {
          closeText();
          target().push({ type: 'heading', text });
          continue;
        }
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
    // Mehrspaltige Zeile, die den Satz der Zeile davor fortsetzt (eng anschließend an eine Textzeile ohne Satzende, erste
    // Spalte klein geschrieben oder Zeile davor mit Worttrennung): Fließtext mit rechtsbündiger Zahl („… Pflicht-“ /
    // „stundenzahl   25,5.“), keine Tabellenzeile.
    const previousLine = index > 0 && index - 1 >= tableEnd ? lines[index - 1] : undefined;
    // Nur eine mit Kleinbuchstaben beginnende erste Spalte setzt einen Satz fort; eine Zahlenzeile unter einer umbrochenen
    // Zellenbezeichnung („Wohngebäude mit Ge-“ / „83   97,28   101,59“) ist eine Tabellenzeile.
    const continuesText = previousLine !== undefined && previousLine.page === line.page && previousLine.segments.length === 1 && Number.isFinite(line.gapBefore) && line.gapBefore <= layout.lineGap + 1 && !/[.:;]$/u.test(previousLine.text.trim()) && !isCentered(previousLine, layout) && /^\p{Ll}/u.test(line.segments[0]!.text.trim());
    const multiColumn = isMultiColumnLine(line) && !continuesText;
    if (isMultiColumnLine(line) && continuesText) {
      textContinuations.add(index);
      findings.push({ severity: 'info', code: 'table-text-continuation', message: `Mehrspaltige Zeile „${text.slice(0, 60)}“ setzt den Satz der Zeile davor fort – Fließtext, keine Tabellenzeile`, page: line.page });
    }
    // Beginnt hier ein sicher rekonstruierbares Raster (siehe `gridTable`), wird es als Tabelle übernommen.
    // Run 16: Auch eine Zeile mit Dezimalnummer einer Tarif- oder Verzeichnisgliederung und mindestens zwei weiteren
    // Spalten („2.1 | Arbeitgeberverband … | Branchentarifvertrag …“) kann eine Tabelle beginnen; ob sie trägt,
    // entscheidet allein das Raster. Eine Aufzählung („1. | Vor- und Familiennamen | 0101 bis 0106,“) beginnt keine.
    const numberedStart = !multiColumn && !continuesText && line.segments.length >= 3 && /^\d+(?:\.\d+)+$/u.test(line.segments[0]!.text.trim());
    if ((multiColumn || numberedStart) && tableRun === 0) {
      let end = index + 1;
      while (end < lines.length && isMultiColumnLine(lines[end]!) && !unitFor(lines[end]!.text.trim()) && !containerFor(lines[end]!.text.trim())) end += 1;
      const figureInside = pendingFigures.some((figure) => figure.beforeLine > index && figure.beforeLine < end);
      const simple = end - index >= 2 && !figureInside && !numberedStart ? leadingGrid(lines.slice(index, end)) : undefined;
      // Mehrzeilige Zellen, Kopfzeilen, Zellen über mehrere Spalten: nur, wenn das Raster weiter trägt als das einfache.
      // Zeilen vor dem Aufrufpunkt (Anfang der ersten Tabellenzeile) sind schon als Block ausgegeben; sie werden nur
      // übernommen, wenn genau dieser Block zurückgenommen werden kann – sonst ohne sie.
      let wrapped = figureInside ? undefined : wrappedGrid(lines, index, layout);
      const emitted = (from: number): NormBodyBlock[] | undefined => {
        const texts = lines.slice(from, index).map((entry) => entry.text.trim());
        const blocks = target();
        const last = blocks.at(-1);
        if (last && (last.type === 'paragraphText' || last.type === 'heading') && !last.children?.length && last.text === texts.reduce((joined, part) => joinLines(joined, part), '')) return [last];
        const tail = blocks.slice(-texts.length);
        if (tail.length === texts.length && tail.every((block, offset) => block.type === 'heading' && !block.children?.length && block.text === texts[offset])) return tail;
        return undefined;
      };
      let removable: NormBodyBlock[] | undefined;
      if (wrapped && 'table' in wrapped && wrapped.start < index) {
        removable = index - wrapped.start <= 3 && wrapped.start >= tableEnd ? emitted(wrapped.start) : undefined;
        if (!removable) wrapped = wrappedGrid(lines, index, layout, { lookbehind: false });
      } else if (wrapped && 'rejection' in wrapped && index > 0) {
        // Die vorgezogene Zeile (etwa ein zentrierter Titel) trägt das Raster nicht: ohne sie versuchen.
        const retry = wrappedGrid(lines, index, layout, { lookbehind: false });
        if ('table' in retry) wrapped = retry;
      }
      // Ein Inhaltsverzeichnis („2.1 | Legionellen | 2“, Punktleitern, Seitenzahlen) ist keine Tabelle, auch wenn es
      // mit einer Dezimalnummer beginnt.
      const tableOfContents = (table: NormBodyBlock): boolean => {
        const rows = table.children ?? [];
        const lastCells = rows.map((row) => row.children?.at(-1)?.text?.trim() ?? '');
        return rows.some((row) => row.children?.some((cell) => /\.{5,}|…{2,}/u.test(cell.text ?? ''))) || lastCells.every((text) => text === '' || /^\d{1,3}$/u.test(text));
      };
      if (numberedStart && wrapped && 'table' in wrapped && tableOfContents(wrapped.table)) wrapped = { rejection: 'single-row', detail: 'Inhaltsverzeichnis mit Dezimalnummern' };
      const wrappedFree = wrapped && 'table' in wrapped && !pendingFigures.some((figure) => figure.beforeLine > index && figure.beforeLine < wrapped.end);
      const useWrapped = Boolean(wrappedFree && (!simple || !('table' in simple) || (wrapped as WrappedGridResult).end > index + simple.rows));
      const grid = useWrapped ? { table: (wrapped as WrappedGridResult).table, rows: (wrapped as WrappedGridResult).end - index } : simple;
      if (grid && 'table' in grid) {
        const table = grid.table;
        const tableStart = useWrapped ? (wrapped as WrappedGridResult).start : index;
        if (useWrapped) {
          reorders.push((wrapped as WrappedGridResult).reorder);
          if (tableStart < index && removable) for (const _block of removable) target().pop();
        }
        // Zeile unmittelbar vor der Tabelle, die dem Satz nach zu ihr gehört (eng anschließend oder selbst mehrspaltig),
        // aber keiner Spalte sicher zuzuordnen ist: Befund.
        const previous = tableStart > 0 ? lines[tableStart - 1] : undefined;
        const first = lines[tableStart]!;
        const near = previous !== undefined && previous.page === first.page && Number.isFinite(first.gapBefore) && first.gapBefore <= layout.bodyHeight * 2;
        const inTable = (position: number): boolean => position < tableEnd;
        // Überschriften („Sechster Teil“) und Linien („______“) vor einer Tabelle sind keine Tabellenzeilen.
        const previousText = previous?.text.trim() ?? '';
        const ruleLine = /^[\s_\-–—=]+$/u.test(previousText);
        const headingBefore = unitFor(previousText) !== undefined || containerFor(previousText) !== undefined || /^Nichtamtliches Inhaltsverzeichnis$/u.test(previousText);
        const headerOutside = near && !inTable(tableStart - 1) && !ruleLine && !headingBefore && !textContinuations.has(tableStart - 1) && (isMultiColumnLine(previous!) || (previous!.segments.length === 1 && first.gapBefore <= layout.lineGap + 1 && !/[.:;]$/u.test(previousText)));
        if (headerOutside) findings.push({ severity: 'warning', code: 'table-layout', message: `Tabellenlayout ab „${first.text.trim().slice(0, 60)}“: die Zeile unmittelbar davor gehört dem Satz nach zur Tabelle (Kopf oder Zeile), ist aber keiner Spalte sicher zuzuordnen [row-before-table]`, page: first.page });
        closeText();
        target().push(table);
        findings.push({ severity: 'info', code: 'table-structured', message: `Tabelle (${table.columns} Spalten, ${table.children!.length} Zeilen) ab „${first.text.trim().slice(0, 60)}“ aus dem Spaltenraster übernommen${useWrapped ? ' (mehrzeilige Zellen bzw. Kopfzeile)' : ''}`, page: first.page });
        previousCentered = false;
        index += grid.rows - 1;
        tableEnd = index + 1;
        continue;
      }
      tableRejection = figureInside ? 'figure-inside' : wrapped && 'rejection' in wrapped && wrapped.rejection !== 'single-row' ? wrapped.rejection : grid ? grid.rejection : 'single-row';
      tableTrace?.({ lines, findingCount: findings.length, index, line, rejection: tableRejection, wrapped: wrapped && 'rejection' in wrapped ? wrapped : undefined, simple: grid && 'rejection' in grid ? grid.rejection : undefined });
    }
    if (multiColumn) {
      tableRun += 1;
      if (tableRun === 2) findings.push({ severity: 'warning', code: 'table-layout', message: `Tabellenlayout (mehrere Spalten) ab „${text.slice(0, 60)}“ – Struktur aus dem Textlayer nicht sicher rekonstruierbar [${tableRejection}]`, page: line.page });
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
  emitFigures(Number.POSITIVE_INFINITY);
  if (!isVwv && root.length === 0) findings.push({ severity: 'info', code: 'empty-body', message: 'Kein Normtext (Ausgabe ohne Einheiten)' });
  return root;
}

/** Jede Einheit des Verzeichnisses (§, Artikel, Anlage) muss als Überschrift im Normtext stehen – in derselben Reihenfolge. */
/** juris-Vermerk „Verkündet als Artikel … des Gesetzes …“ (nicht im Verkündungsblatt; je Einzelnorm wiederholt). */
const PROMULGATED_AS = /^Verkündet als\b/u;
/** juris-Anmerkungen. */
const JURIS_ANNOTATION = /^(?:Anm\.\s*juris|[Rr]edakt(?:ionelle)?\.?\s*Anm(?:erkung)?\.?)\s*:?/u;
/** Technische Vermerke der juris-Ausgabe; sie zeigen zugleich an, dass Text fehlt. */
const TECHNICAL_NOTE = /aus technischen Gründen[^.]*nicht (?:ab)?gespeichert|(?:sind|ist|wird|werden) (?:hier |daher )?(?:im Intra-\/Internet )?nicht (?:ab)?gespeichert|sind nicht abgedruckt|in gespeicherter Form unleserlich|^Es ist Text als PDF-Datei vorhanden\b|^\[?\s*hier nicht (?:ab)?gespeichert\s*\]?\s*!?$/u;
/** Vermerk eines fehlenden Teils mitten im Text („(Gleichung nicht gespeichert)“, „… hier nicht gespeichert!“): Text bleibt, Befund. */
const INLINE_MISSING = /\((?:[A-ZÄÖÜ][\p{L}-]*\s)?nicht (?:ab)?gespeichert\)|\[[^\]]{0,60}nicht (?:ab)?gespeichert\]|hier nicht (?:ab)?gespeichert\s*!/u;
/** juris-Verzeichnis der Anlagen am Ende einer VwV („Anlagen (nichtamtliches Verzeichnis) Anlage 1: …“) – redaktionell. */
const ANNEX_LIST = /^Anlagen?\s*\(nichtamtliches Verzeichnis\)/u;
const ANNEX_LIST_INLINE = /\s+Anlagen?\s*\(nichtamtliches Verzeichnis\)[\s\S]*$/u;

/**
 * Entfernt juris-redaktionelle Zusätze aus dem Normkörper (Audit „NSH-Audit“, Klasse B5/B6): „Verkündet als …“-Fußnoten,
 * juris-Anmerkungen und technische Vermerke. Sie werden als erklärte Zeilen festgehalten (Textintegrität), nicht
 * verworfen. Ein technischer Vermerk („… aus technischen Gründen nicht gespeichert“) belegt zugleich, dass Normtext
 * fehlt: Befund `incomplete-source-text` (Review).
 */
export function removeEditorialNotes(blocks: NormBodyBlock[], findings: ParseFinding[]): { body: NormBodyBlock[]; relocated: Array<{ reason: string; text: string }> } {
  const relocated: Array<{ reason: string; text: string }> = [];
  /** Einheit, in der ein Vermerk steht („Anlage 3 (Muster …)“), für Befund und Anlagenklassifikation (Run 16). */
  const unitOf = (block: NormBodyBlock): string | undefined => (['paragraph', 'article', 'annex', 'preamble'].includes(block.type) ? [block.label, block.title].filter(Boolean).join(' ').slice(0, 120) || undefined : undefined);
  const walk = (list: NormBodyBlock[], unit?: string): NormBodyBlock[] => {
    const kept: NormBodyBlock[] = [];
    for (const block of list) {
      const text = (block.text ?? '').trim();
      const leaf = !block.children?.length;
      if (leaf && block.type === 'footnote' && PROMULGATED_AS.test(text)) {
        relocated.push({ reason: 'juris-Vermerk „Verkündet als …“', text: `${block.label ?? ''} ${text}`.trim() });
        continue;
      }
      if (leaf && (block.type === 'footnote' || block.type === 'paragraphText') && JURIS_ANNOTATION.test(text)) {
        relocated.push({ reason: 'juris-Anmerkung', text: `${block.label ?? ''} ${text}`.trim() });
        continue;
      }
      if (leaf && block.type === 'paragraphText' && ANNEX_LIST.test(text)) {
        relocated.push({ reason: 'juris-Verzeichnis der Anlagen (nichtamtlich)', text });
        continue;
      }
      // Verzeichnis ohne Absatzabstand an den letzten Absatz angehängt („… außer Kraft. Anlagen (nichtamtliches
      // Verzeichnis) Anlage 1: …“): Der Absatz bleibt, das Verzeichnis (bis zum Blockende) wird herausgenommen.
      const inline = block.type === 'paragraphText' || block.type === 'heading' ? ANNEX_LIST_INLINE.exec(block.text ?? '') : null;
      if (inline && inline.index > 0) {
        relocated.push({ reason: 'juris-Verzeichnis der Anlagen (nichtamtlich)', text: inline[0].trim() });
        const trimmed = { ...block, text: block.text!.slice(0, inline.index).trimEnd() };
        kept.push(block.children ? { ...trimmed, children: walk(block.children, unitOf(block) ?? unit) } : trimmed);
        continue;
      }
      if (leaf && (block.type === 'footnote' || block.type === 'paragraphText' || block.type === 'heading') && TECHNICAL_NOTE.test(text) && text.length <= 300) {
        relocated.push({ reason: 'technischer Vermerk der juris-Ausgabe', text: `${block.label ?? ''} ${text}`.trim() });
        // „Es ist Text als PDF-Datei vorhanden. Bitte gesondert ausdrucken.“: Der Inhalt (meist eine Anlage, Karte oder
        // Tabelle) liegt in juris als eigene PDF-Datei vor, die die Gesamtausgabe nicht enthält.
        const attachment = PDF_ATTACHMENT_NOTE.test(text);
        const where = unit ? `${unit}: ` : '';
        findings.push({ severity: 'warning', code: 'incomplete-source-text', message: attachment ? `${where}juris-Vermerk „${text.slice(0, 80)}“ – Inhalt liegt nur als gesonderte PDF-Datei vor, nicht in der Ausgabe` : `${where}Technischer Vermerk der Ausgabe: „${text.slice(0, 120)}“ – Normtext unvollständig` });
        continue;
      }
      for (const value of [block.title, block.text]) {
        const missing = value ? INLINE_MISSING.exec(value) : null;
        if (missing) findings.push({ severity: 'warning', code: 'incomplete-source-text', message: `Vermerk „${missing[0]}“ im Text – ein Teil der Vorschrift fehlt in der Ausgabe` });
      }
      kept.push(block.children ? { ...block, children: walk(block.children, unitOf(block) ?? unit) } : block);
    }
    return kept;
  };
  return { body: walk(blocks), relocated };
}

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
  // Vergleichsform: ohne Fußnotenzeichen („Artikel 2 *)“), Anlagenzählung ohne Satzvarianten („Anlage3“, „Anlage 1 a“),
  // Bereiche mit einheitlichem Trenner („Artikel 1 -3“ / „Artikel 1 - 3“).
  const comparable = (label: string): string => normalizeLabel(label).replace(/\s*\*+\)?\s*$/u, '').replace(/^(Anlage|Anhang)(\d)/u, '$1 $2').replace(/^((?:Anlage|Anhang)\s+\d+)\s+([a-z])\b/u, '$1$2').replace(/(\d)\s*[-–]\s*(\d)/gu, '$1 - $2').replace(/\s+/gu, ' ').trim();
  const bodyLabels: string[] = [];
  // Einheiten innerhalb von Anlagen (Satzung, Staatsvertrag als Anlage) bilden eigene Nummernräume, die das Verzeichnis
  // in der Regel nicht führt.
  const annexInternal: string[] = [];
  const annexHeadings: string[] = [];
  // Anlagen stehen auf oberster Ebene; ihre Einheiten folgen ihnen als Geschwister (siehe `pushUnit`).
  let afterAnnex = false;
  const walk = (blocks: NormBodyBlock[], insideAnnex: boolean, top: boolean): void => {
    for (const block of blocks) {
      if (block.type === 'annex' && block.label) annexHeadings.push(comparable(`${block.label} ${block.title ?? ''}`));
      if (top && block.type === 'annex') afterAnnex = true;
      const internal = block.type !== 'annex' && (insideAnnex || (top && afterAnnex));
      if ((block.type === 'paragraph' || block.type === 'article' || block.type === 'annex') && block.label) (internal ? annexInternal : bodyLabels).push(comparable(block.label));
      if (block.children) walk(block.children, insideAnnex || block.type === 'annex' || internal, false);
    }
  };
  walk(body, false, true);
  const tocEntries = toc.filter((entry): entry is TocEntry & { label: string } => entry.label !== undefined && /^(?:§|Art|Artikel|Anlage|Anhang)/u.test(entry.label));
  const tocLabels = tocEntries.map((entry) => comparable(entry.label));
  // Verzeichniseintrag, dessen Überschrift selbst nur eine Bezeichnung ist („Artikel IV  § 10“): auch sie ist eine Einheit.
  for (const entry of toc) {
    const type = unitFor(entry.title.trim());
    if (!type) continue;
    const match = UNIT_PATTERNS.find((candidate) => candidate.type === type)!.pattern.exec(entry.title.trim())!;
    if (/^(?:\*+\)?)?$/u.test(entry.title.trim().slice(match[0].length).trim())) tocLabels.push(comparable(match[0]));
  }
  const tocAnnexHeadings = tocEntries.filter((entry) => /^(?:Anlage|Anhang)/u.test(entry.label)).map((entry) => comparable(`${entry.label} ${entry.title}`));
  const hasTocAnnexes = tocAnnexHeadings.length > 0;
  const missing = tocLabels.filter((label) => !bodyLabels.includes(label) && !annexInternal.includes(label) && !(/^(?:Anlage|Anhang)/u.test(label) && annexHeadings.some((heading) => heading.startsWith(label) || label.startsWith(heading))));
  if (missing.length > 0) findings.push({ severity: 'warning', code: 'toc-unit-missing', message: `${missing.length} Einheit(en) des Verzeichnisses ohne Überschrift im Normtext: ${missing.slice(0, 5).join(', ')}` });
  const extra = bodyLabels.filter((label) => {
    if (tocLabels.includes(label)) return false;
    if (/^(?:Anlage|Anhang)/u.test(label)) {
      // Verzeichnisse führen Anlagen uneinheitlich: ohne Anlageneinträge, als bloße „Anlage“ (Zwischenüberschrift,
      // Kartenanlage) oder mit der Überschrift als Bezeichnung („Anlage 2 zu § 3“) ist eine Anlage im Normtext kein Befund.
      if (!hasTocAnnexes || /^(?:Anlage|Anhang)$/u.test(label)) return false;
      if (tocAnnexHeadings.some((heading) => heading.startsWith(label) || label.startsWith(heading))) return false;
    }
    return true;
  });
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
