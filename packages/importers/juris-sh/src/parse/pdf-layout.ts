/**
 * Geometrie des juris-PDF-Textlayers: Wörter mit Koordinaten → Zeilen → Zeilenmerkmale.
 *
 * Grundlage ist `pdftotext -bbox-layout` (poppler): Jedes Wort des Textlayers mit seinem Rechteck. Es wird
 * kein OCR und keine Bildauswertung verwendet; was nicht im Textlayer steht, existiert für den Parser nicht
 * (und fällt der Textintegritätsprüfung auf, wenn eine Seite Abbildungen trägt).
 *
 * Aus den Wörtern entstehen Zeilen (gemeinsame Grundlinie). Hochgestellte, kleinere Wörter (Fußnotenzeichen
 * „*)“, „1)“) bilden keine eigene Zeile, sondern werden der Zeile zugeordnet, deren Höhe sie überlappen
 * bzw. über der sie stehen. Innerhalb einer Zeile trennt ein großer waagerechter Abstand Spalten (Tabellen,
 * Inhaltsverzeichnis, hängende Einzüge). Seitenmobiliar („- Seite n von m -“, Spaltenkopf „Titel … Gültig
 * ab“) wird markiert, nicht verworfen – verworfen wird erst beim Blockbau, und nur benannt.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PdfWord {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

export interface PdfPageGeometry {
  page: number;
  width: number;
  height: number;
}

export interface LineSegment {
  x0: number;
  x1: number;
  text: string;
}

export interface PdfLine {
  page: number;
  /** Laufende Nummer über das ganze Dokument (Lesereihenfolge). */
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Median der Worthöhen der Zeile (Schriftgröße). */
  height: number;
  /** Spalten der Zeile (durch große Abstände getrennt). */
  segments: LineSegment[];
  /** Zeilentext; Spalten durch ein Leerzeichen getrennt, hochgestellte Zeichen angehängt. */
  text: string;
  /** Hochgestellte Zeichen dieser Zeile (Fußnotenzeichen), in Reihenfolge. */
  superscripts: string[];
  /** Zeilentext ohne hochgestellte Zeichen (Titel, Bezeichnungen). */
  plainText: string;
  /** Senkrechter Abstand zur vorigen Zeile derselben Seite (Oberkante − Unterkante); auf neuer Seite `Infinity`. */
  gapBefore: number;
  furniture?: 'page-footer' | 'toc-column-header';
}

export interface PdfLayout {
  pages: PdfPageGeometry[];
  lines: PdfLine[];
  /** Typische Worthöhe (Median über alle Wörter). */
  bodyHeight: number;
  /** Linker Textrand (häufigster Zeilenanfang) und rechter Rand (oberes Quantil der Zeilenenden). */
  left: number;
  right: number;
  /** Typischer Zeilenabstand innerhalb eines Absatzes (häufigster Abstand; oft leicht negativ, die Wortkästen überlappen). */
  lineGap: number;
  /** Ab diesem Abstand beginnt ein neuer Absatz bzw. eine neue Zeilengruppe. */
  paragraphGap: number;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? match;
  });
}

/** Wörter und Seitenmaße aus der XHTML-Ausgabe von `pdftotext -bbox-layout`. */
export function parseBboxLayout(xhtml: string): { pages: PdfPageGeometry[]; words: PdfWord[] } {
  const pages: PdfPageGeometry[] = [];
  const words: PdfWord[] = [];
  const pagePattern = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/gu;
  const wordPattern = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/gu;
  let pageNumber = 0;
  for (const page of xhtml.matchAll(pagePattern)) {
    pageNumber += 1;
    pages.push({ page: pageNumber, width: Number(page[1]), height: Number(page[2]) });
    for (const word of page[3]!.matchAll(wordPattern)) {
      const text = decode(word[5]!);
      if (text.trim() === '') continue;
      words.push({ page: pageNumber, x0: Number(word[1]), y0: Number(word[2]), x1: Number(word[3]), y1: Number(word[4]), text });
    }
  }
  return { pages, words };
}

export class PdfTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfTextError';
  }
}

/** Höchstlaufzeit eines poppler-Aufrufs; ein hängender Aufruf ist ein Befund am Dokument, kein Stillstand des Laufs. */
export const POPPLER_TIMEOUT_MS = 180_000;

/**
 * Führt ein poppler-Werkzeug über eine temporäre Datei aus (nicht über die Standardeingabe: große Eingaben über
 * stdin haben im Vollkorpus einen Aufruf dauerhaft blockiert).
 */
function runPoppler(tool: string, args: readonly string[], bytes: Uint8Array, maxBuffer: number): ReturnType<typeof spawnSync> {
  const directory = mkdtempSync(join(tmpdir(), 'juris-sh-pdf-'));
  const file = join(directory, 'input.pdf');
  try {
    writeFileSync(file, bytes);
    return spawnSync(tool, [...args.map((arg) => (arg === '<input>' ? file : arg))], { maxBuffer, timeout: POPPLER_TIMEOUT_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Ruft `pdftotext -bbox-layout` auf (poppler). Kein Netz, kein OCR. */
export function runPdftotextBbox(bytes: Uint8Array): string {
  const result = runPoppler('pdftotext', ['-bbox-layout', '-enc', 'UTF-8', '<input>', '-'], bytes, 512 * 1024 * 1024);
  if (result.error) throw new PdfTextError(`pdftotext nicht ausführbar oder Zeitüberschreitung: ${result.error.message} (poppler installieren)`);
  if (result.status !== 0) throw new PdfTextError(`pdftotext endete mit ${result.status}: ${String(result.stderr).slice(0, 300)}`);
  return String(result.stdout);
}

/**
 * Signets des Dokumentkopfs (Seite 1): Landeswappen 57×40 (alle 5 195 Ausgaben), juris-Schriftzug 75×15 bzw. 94×15.
 * Nur Vorfilter für `pdftohtml` (Laufzeit); ob ein Bild Signet oder Abbildung ist, entscheidet die Lage
 * (`placeFigures` in `juris-pdf.ts`).
 */
const HEADER_SIGNET_SIZES = new Set(['57x40', '75x15', '94x15']);

/** Eingebettete Bilder je Seite (`pdfimages -list`): Seite und Pixelmaße; `undefined`, wenn das Werkzeug fehlt. */
export function runPdfimagesList(bytes: Uint8Array): Array<{ page: number; width: number; height: number }> | undefined {
  const result = runPoppler('pdfimages', ['-list', '<input>'], bytes, 64 * 1024 * 1024);
  if (result.error || result.status !== 0) return undefined;
  const images: Array<{ page: number; width: number; height: number }> = [];
  for (const line of String(result.stdout).split('\n').slice(2)) {
    const match = /^\s*(\d+)\s+\d+\s+(image|smask|mask|stencil)\s+(\d+)\s+(\d+)/u.exec(line);
    if (!match || match[2] !== 'image') continue;
    images.push({ page: Number(match[1]), width: Number(match[3]), height: Number(match[4]) });
  }
  return images;
}

/** Trägt die Ausgabe außer den Kopfsignets Bilder? Dann werden Lage und Bytes gelesen (`runPdfImages`). */
export function hasNonSignetImages(images: ReadonlyArray<{ page: number; width: number; height: number }>): boolean {
  return images.some((image) => !(image.page === 1 && HEADER_SIGNET_SIZES.has(`${image.width}x${image.height}`)));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/** Ein Wort gilt als hochgestellt, wenn es deutlich kleiner ist als der Text. */
const SUPERSCRIPT_RATIO = 0.8;
/** Spaltentrennung: waagerechter Abstand größer als dieses Vielfache der Schrifthöhe. */
const COLUMN_GAP_FACTOR = 0.9;

/** Satzspiegel der juris-PDF-Ausgabe (A4): linker Rand des Fließtexts, rechter Rand des Blocksatzes. */
export const TEMPLATE_MARGINS = { left: 77, right: 537 } as const;

export const PAGE_FOOTER = /^-\s*Seite\s+\d+\s+von\s+\d+\s*-$/u;

export function buildLayout(pages: PdfPageGeometry[], words: PdfWord[]): PdfLayout {
  const bodyHeight = median(words.map((word) => word.y1 - word.y0));
  const lines: PdfLine[] = [];
  let index = 0;
  for (const page of pages) {
    const pageWords = words.filter((word) => word.page === page.page);
    const normal = pageWords.filter((word) => word.y1 - word.y0 >= bodyHeight * SUPERSCRIPT_RATIO);
    const small = pageWords.filter((word) => word.y1 - word.y0 < bodyHeight * SUPERSCRIPT_RATIO);
    // Zeilen aus normal großen Wörtern: gleiche Zeilenmitte (±35 % der Schrifthöhe) – Nummern und Text einer
    // Zeile stehen nicht immer auf exakt derselben Grundlinie.
    const groups: PdfWord[][] = [];
    const centerOf = (word: PdfWord): number => (word.y0 + word.y1) / 2;
    for (const word of [...normal].sort((left, right) => centerOf(left) - centerOf(right) || left.x0 - right.x0)) {
      const group = groups.find((candidate) => Math.abs(centerOf(candidate[0]!) - centerOf(word)) <= bodyHeight * 0.35);
      if (group) group.push(word);
      else groups.push([word]);
    }
    // Hochgestellte Wörter gehören zu der Zeile, die sie überlappen und deren Unterkante unter ihrer liegt
    // (Hochstellung sitzt oben in der eigenen Zeile); sonst zur nächsten Zeile darunter.
    const superscriptsOf = new Map<PdfWord[], PdfWord[]>();
    const bottomOf = (group: PdfWord[]): number => Math.max(...group.map((entry) => entry.y1));
    const topOf = (group: PdfWord[]): number => Math.min(...group.map((entry) => entry.y0));
    for (const word of small) {
      const candidates = groups.filter((group) => word.y1 > topOf(group) - 1 && word.y0 < bottomOf(group) && bottomOf(group) >= word.y1 - 0.5);
      const overlapping = candidates.sort((left, right) => bottomOf(left) - bottomOf(right))[0];
      const below = groups.filter((group) => topOf(group) >= word.y0 - 1).sort((left, right) => topOf(left) - topOf(right))[0];
      const target = overlapping ?? below;
      if (!target) {
        groups.push([word]);
        continue;
      }
      superscriptsOf.set(target, [...(superscriptsOf.get(target) ?? []), word]);
    }
    groups.sort((left, right) => centerOf(left[0]!) - centerOf(right[0]!));
    let previousBottom: number | undefined;
    for (const group of groups) {
      const sorted = [...group].sort((left, right) => left.x0 - right.x0);
      const height = median(sorted.map((word) => word.y1 - word.y0));
      const sups = (superscriptsOf.get(group) ?? []).sort((left, right) => left.x0 - right.x0);
      // Wörter und Hochstellungen in waagerechter Reihenfolge; ein hochgestelltes Wort hängt am Vorgänger.
      const tokens = [...sorted.map((word) => ({ word, sup: false })), ...sups.map((word) => ({ word, sup: true }))].sort((left, right) => left.word.x0 - right.word.x0);
      const segments: LineSegment[] = [];
      let text = '';
      let previous: PdfWord | undefined;
      for (const { word, sup } of tokens) {
        if (sup) {
          text += word.text;
          if (segments.length > 0) {
            const last = segments.at(-1)!;
            last.text += word.text;
            last.x1 = Math.max(last.x1, word.x1);
          } else segments.push({ x0: word.x0, x1: word.x1, text: word.text });
          previous = word;
          continue;
        }
        const gap = previous ? word.x0 - previous.x1 : 0;
        if (!previous || gap > height * COLUMN_GAP_FACTOR) {
          segments.push({ x0: word.x0, x1: word.x1, text: word.text });
          text += text === '' ? word.text : ` ${word.text}`;
        } else {
          const last = segments.at(-1)!;
          last.text += ` ${word.text}`;
          last.x1 = word.x1;
          text += ` ${word.text}`;
        }
        previous = word;
      }
      const y0 = Math.min(...group.map((word) => word.y0));
      const y1 = Math.max(...group.map((word) => word.y1));
      const line: PdfLine = {
        page: page.page,
        index: index++,
        x0: Math.min(...tokens.map((token) => token.word.x0)),
        x1: Math.max(...tokens.map((token) => token.word.x1)),
        y0,
        y1,
        height,
        segments,
        text,
        superscripts: sups.map((word) => word.text),
        plainText: sorted.map((word) => word.text).join(' '),
        gapBefore: previousBottom === undefined ? Number.POSITIVE_INFINITY : y0 - previousBottom,
      };
      if (PAGE_FOOTER.test(text.trim())) line.furniture = 'page-footer';
      lines.push(line);
      previousBottom = y1;
    }
  }
  // Spaltenkopf des Inhaltsverzeichnisses („Titel“ … „Gültig ab“) am Seitenanfang.
  for (const line of lines) {
    if (line.segments.length === 2 && line.segments[0]!.text === 'Titel' && /^Gültig ab$/u.test(line.segments[1]!.text)) line.furniture = 'toc-column-header';
  }
  const content = lines.filter((line) => !line.furniture);
  // Satzspiegel aus vollen Textzeilen (Blocksatz): Kopfzeilen („Schlüssel: Wert“), Tabellenspalten und
  // Überschriften würden den häufigsten Zeilenanfang sonst verschieben.
  const fullLines = content.filter((line) => {
    const width = pages.find((page) => page.page === line.page)?.width ?? 595;
    return line.segments.length === 1 && line.x1 - line.x0 >= 250 && line.x0 <= width * 0.2 && !/^[A-Za-zÄÖÜäöü][\wÄÖÜäöüß .-]*:\s/u.test(line.text);
  });
  const starts = fullLines.map((line) => Math.round(line.x0));
  const counts = new Map<number, number>();
  for (const start of starts) counts.set(start, (counts.get(start) ?? 0) + 1);
  // Kurze Dokumente (Einzelfassungen, aufgehobene Normen) haben kaum volle Zeilen: dann gilt der Satzspiegel
  // der juris-Ausgabe (A4, belegt an allen Dokumenten der Stichprobe).
  const enough = fullLines.length >= 3;
  const observedLeft = enough ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0] : TEMPLATE_MARGINS.left;
  // Listenlastige Normen: Der häufigste Anfang voller Zeilen ist dann die Einrückung der Aufzählung. Beginnen
  // Textzeilen am Satzspiegel der Ausgabe, gilt dieser.
  const atTemplateLeft = content.filter((line) => Math.abs(line.x0 - TEMPLATE_MARGINS.left) <= 2 && !/^[A-Za-zÄÖÜäöü][\wÄÖÜäöüß .-]*:\s/u.test(line.text)).length;
  const left = observedLeft > TEMPLATE_MARGINS.left + 5 && atTemplateLeft >= 2 ? TEMPLATE_MARGINS.left : observedLeft;
  // Der rechte Rand zeigt sich nur an Blocksatzzeilen; Listen und Verzeichnisse enden früher. Reicht keine Zeile
  // an den Satzspiegel heran, gilt der Satzspiegel der Ausgabe.
  const observedRight = enough ? quantile(fullLines.map((line) => line.x1), 0.9) : TEMPLATE_MARGINS.right;
  const right = observedRight < TEMPLATE_MARGINS.right - 25 ? TEMPLATE_MARGINS.right : observedRight;
  const gapCounts = new Map<number, number>();
  for (const line of content) {
    // Nur enge Abstände: Zeilen desselben Absatzes (Wortkästen überlappen leicht). Absatzabstände wären in
    // kurzen Dokumenten sonst häufiger als Zeilenabstände.
    if (!Number.isFinite(line.gapBefore) || line.gapBefore > bodyHeight * 0.25 || line.gapBefore < -bodyHeight * 0.5) continue;
    const key = Math.round(line.gapBefore);
    gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
  }
  const lineGap = [...gapCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  const paragraphGap = lineGap + Math.max(3, bodyHeight * 0.2);
  return { pages, lines, bodyHeight, left, right, lineGap, paragraphGap };
}

export function layoutFromPdf(bytes: Uint8Array): PdfLayout {
  const { pages, words } = parseBboxLayout(runPdftotextBbox(bytes));
  if (pages.length === 0) throw new PdfTextError('PDF ohne Seiten im Textlayer');
  return buildLayout(pages, words);
}

/**
 * Zentrierte Zeile: symmetrische Ränder, deutlich eingerückt und schmaler als der Satzspiegel. Blocksatzzeilen
 * mit hängendem Einzug (Aufzählungen) sind breit und rechtsbündig – sie gelten nicht als zentriert.
 */
export function isCentered(line: PdfLine, layout: PdfLayout): boolean {
  const center = (layout.left + layout.right) / 2;
  const pageCenter = (layout.pages.find((page) => page.page === line.page)?.width ?? layout.left + layout.right) / 2;
  const middle = (line.x0 + line.x1) / 2;
  const width = line.x1 - line.x0;
  const symmetric = Math.abs(middle - center) <= Math.max(16, layout.bodyHeight) || Math.abs(middle - pageCenter) <= Math.max(10, layout.bodyHeight * 0.7);
  return symmetric && line.x0 >= Math.min(layout.left, pageCenter - (layout.right - layout.left) / 2) + layout.bodyHeight * 1.5 && width <= (layout.right - layout.left) * 0.85;
}
