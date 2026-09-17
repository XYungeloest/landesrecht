/**
 * Seitenweise Textgewinnung aus den Jahrgangs- und Register-PDFs der Verkündungsblätter
 * Schleswig-Holstein – mit Lesbarkeitsprüfung und der einzigen zulässigen Reparatur: dem Rückversatz
 * der defekten ToUnicode-Zuordnung um +29 Zeichencodes.
 *
 * Befund aus der Discovery (`docs/SCHLESWIG_HOLSTEIN_PUBLICATION_DISCOVERY.md`, § 5): Teile der
 * Jahrgangs-PDFs verwenden subsettete Schriften mit fehlerhafter `ToUnicode`-Tabelle. Der Textlayer
 * liefert dort einen konstant um 29 Zeichencodes nach unten verschobenen Text; roh
 * `'LHPLW/DQGHVZDSSHQ` steht für `DiemitLandeswappen`. Deckblätter, Inhaltsverzeichnisse und alle
 * Register sind dagegen unbeschädigt.
 *
 * Regeln (fail-closed):
 *   1. Beurteilt wird zeilenweise, nicht seitenweise – beschädigte Seiten tragen eine *saubere*
 *      Kopfzeile über beschädigtem Satz. Eine seitenweite Korrektur würde die Kopfzeile zerstören.
 *   2. Der Versatz wird erst *auf Seitenebene nachgewiesen* (mindestens zwei Zeilen, deren Rückversatz
 *      eindeutig deutschen Fachwortschatz erzeugt) und dann auf die beschädigten Zeilen derselben Seite
 *      angewandt. Ohne diesen Nachweis wird nichts verschoben.
 *   3. Was danach nicht lesbar ist, wird nicht geraten, sondern als `unreadable` verworfen: Die Zeile
 *      erscheint leer, eine überwiegend unlesbare Seite liefert gar keinen Text.
 *   4. Kein OCR, keine Heuristik über den Versatz hinaus.
 *
 * Grenze des Rückversatzes: Wortzwischenräume innerhalb eines beschädigten Satzlaufs fehlen in der
 * Quelle (die PDF setzt sie über Positionierung, nicht über Leerzeichen-Glyphen), und Umlaute fallen
 * aus. `Schriftstcke` bleibt `Schriftstcke`. Korrigierter Text taugt deshalb für Erkennung und
 * Statistik, **nicht** als Normtext – für das Ereignisregister wird er ohnehin nicht gebraucht, weil
 * alle Registerquellen sauber sind.
 *
 * Die Textgewinnung selbst übernimmt `pdftotext -layout` (poppler); `@landesrecht/importer-recht-nrw/
 * common/pdf.ts` prüft nur die PDF-Struktur und extrahiert bewusst keinen Text. Das Ergebnis wird im
 * Cache abgelegt, damit ein Lauf ohne poppler (und ohne Netz) reproduzierbar bleibt.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const PAGE_STATUSES = ['clean', 'shift-corrected', 'unreadable'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export interface PdfPage {
  /** 1-basierte Seite im PDF (nicht die gedruckte Seitenzahl des Verkündungsblatts). */
  page: number;
  status: PageStatus;
  /** Nutzbarer Text. Bei `unreadable` leer; unlesbare Einzelzeilen erscheinen als Leerzeile. */
  text: string;
}

export interface PageDiagnostics extends PdfPage {
  linesClean: number;
  linesShifted: number;
  linesUnreadable: number;
  /** Zeilen, die zu kurz für eine Beurteilung sind (Seitenzahlen, Striche) – sie bleiben unverändert. */
  linesNeutral: number;
  /** Zeilen, deren Rückversatz den Schaden eindeutig belegt hat. */
  shiftProof: number;
}

/** Bekannter Zeichenversatz der defekten ToUnicode-CMaps. */
export const CHARACTER_SHIFT = 29;

/**
 * Fachwortschatz beider Verkündungsblätter. Bewusst nur Wörter ab vier Zeichen: Ein zufälliger Treffer
 * in beschädigtem Text würde sonst eine unlesbare Zeile als lesbar durchgehen lassen.
 */
const GERMAN_MARKERS: readonly string[] = [
  'gesetz', 'verordnung', 'schleswig', 'holstein', 'gvobl', 'amtsbl', 'bekanntmachung', 'absatz', 'artikel',
  'landes', 'ministerium', 'kraft', 'geänd', 'nummer', 'satz', 'über', 'richtlinie', 'erlass', 'beschluss',
  'anlage', 'durch', 'nicht', 'oder', 'sind', 'werden', 'dieser', 'diese', 'sowie', 'staat', 'recht',
  'verwaltung', 'förder', 'vom', 'ausgabe', 'januar', 'februar', 'dezember', 'seite', 'vorschrift',
];

/** Mindestzahl an Buchstaben, ab der eine Zeile überhaupt beurteilt wird. */
const MIN_LETTERS_FOR_JUDGEMENT = 12;
/** Ab diesem Kleinbuchstabenanteil gilt eine Zeile ohne weitere Prüfung als sauber. */
const CLEAN_LOWERCASE_RATIO = 0.45;
/** Abkürzungsreiche Zeilen („Vom 9.1.2017, GVOBl. S. 2“) brauchen zusätzlich einen Fachwortschatztreffer. */
const MARKER_LOWERCASE_RATIO = 0.15;
/** Beschädigter Satz enthält praktisch keine Kleinbuchstaben. */
const DAMAGED_LOWERCASE_RATIO = 0.1;
/** Nach dem Rückversatz erwarteter Kleinbuchstabenanteil (Nachweis bzw. Anwendung). */
const SHIFT_PROOF_RATIO = 0.55;
const SHIFT_APPLY_RATIO = 0.45;
/** Zwei unabhängige Zeilen müssen den Versatz belegen, bevor eine Seite korrigiert wird. */
const SHIFT_PROOF_LINES = 2;
/** Anteil unlesbarer Zeilen, ab dem die ganze Seite verworfen wird. */
const PAGE_UNREADABLE_RATIO = 0.2;

const LETTER = /[A-Za-zÄÖÜäöüß]/u;

/**
 * Zeichen aus Symbolschriften, die `pdftotext` in den Bereich für private Nutzung abbildet.
 * Ohne diese Normalisierung liefe der Aufzählungspunkt des Erlassverzeichnisses als `` durch.
 */
export function normalizePrivateUseCharacters(text: string): string {
  return text.replace(//gu, '•').replace(//gu, ' ');
}

/**
 * Rückversatz um +29. Leerzeichen bleiben Leerzeichen (sie stammen aus der Layoutauffüllung von
 * `pdftotext`, nicht aus der beschädigten Schrift); alles außerhalb der betroffenen Codebereiche
 * bleibt unverändert.
 */
export function applyCharacterShift(text: string, offset: number = CHARACTER_SHIFT): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === ' ') out += character;
    else if ((code >= 33 && code <= 126) || (code >= 161 && code <= 222)) out += String.fromCodePoint(code + offset);
    else out += character;
  }
  return out;
}

export interface LineScore {
  letters: number;
  lowercaseRatio: number;
  markers: number;
}

export function scoreLine(line: string): LineScore {
  const letters = [...line].filter((character) => LETTER.test(character));
  const lowercase = letters.filter((character) => character.toLowerCase() === character && character.toUpperCase() !== character).length;
  const lowered = line.toLowerCase();
  return {
    letters: letters.length,
    lowercaseRatio: letters.length === 0 ? 0 : lowercase / letters.length,
    markers: GERMAN_MARKERS.filter((marker) => lowered.includes(marker)).length,
  };
}

export type LineVerdict = 'clean' | 'neutral' | 'damaged';

/** Erste Stufe: Ist die Zeile so lesbar, wie sie ist? „damaged“ heißt nur „nicht lesbar“, nicht „verschoben“. */
export function judgeLine(line: string): LineVerdict {
  const score = scoreLine(line);
  if (score.letters < MIN_LETTERS_FOR_JUDGEMENT) return 'neutral';
  if (score.lowercaseRatio >= CLEAN_LOWERCASE_RATIO) return 'clean';
  if (score.lowercaseRatio >= MARKER_LOWERCASE_RATIO && score.markers >= 1) return 'clean';
  return 'damaged';
}

/** Belegt der Rückversatz dieser Zeile den bekannten Schaden? Maßstab für den Seitennachweis. */
export function provesCharacterShift(line: string): boolean {
  if (judgeLine(line) !== 'damaged') return false;
  if (scoreLine(line).lowercaseRatio >= DAMAGED_LOWERCASE_RATIO) return false;
  const shifted = scoreLine(applyCharacterShift(line));
  return shifted.lowercaseRatio >= SHIFT_PROOF_RATIO && shifted.markers >= 2;
}

/**
 * Klassifiziert eine Seite und liefert den nutzbaren Text. Zweistufig: erst den Versatz auf der Seite
 * nachweisen, dann nur die beschädigten Zeilen zurückversetzen, deren Ergebnis tatsächlich lesbar ist.
 */
export function classifyPage(page: number, rawText: string): PageDiagnostics {
  const lines = normalizePrivateUseCharacters(rawText).split('\n');
  const verdicts = lines.map((line) => judgeLine(line));
  const shiftProof = lines.filter((line) => provesCharacterShift(line)).length;
  const shiftProven = shiftProof >= SHIFT_PROOF_LINES;

  const out: string[] = [];
  let linesClean = 0;
  let linesShifted = 0;
  let linesUnreadable = 0;
  let linesNeutral = 0;
  for (const [index, line] of lines.entries()) {
    const verdict = verdicts[index]!;
    if (verdict === 'neutral') {
      linesNeutral += 1;
      out.push(line);
      continue;
    }
    if (verdict === 'clean') {
      linesClean += 1;
      out.push(line);
      continue;
    }
    if (shiftProven && scoreLine(line).lowercaseRatio < DAMAGED_LOWERCASE_RATIO) {
      const shifted = applyCharacterShift(line);
      if (scoreLine(shifted).lowercaseRatio >= SHIFT_APPLY_RATIO) {
        linesShifted += 1;
        out.push(shifted);
        continue;
      }
    }
    linesUnreadable += 1;
    out.push('');
  }

  const judged = linesClean + linesShifted + linesUnreadable;
  const base = { page, linesClean, linesShifted, linesUnreadable, linesNeutral, shiftProof };
  if (judged === 0 || linesUnreadable / judged > PAGE_UNREADABLE_RATIO) return { ...base, status: 'unreadable', text: '' };
  return { ...base, status: linesShifted > 0 ? 'shift-corrected' : 'clean', text: out.join('\n') };
}

/** Zerlegt eine `pdftotext`-Ausgabe an den Seitenvorschüben; ein leerer Rest am Ende zählt nicht mit. */
export function splitPageText(document: string): string[] {
  const pages = document.split('\f');
  if (pages.length > 0 && pages[pages.length - 1]!.trim() === '') pages.pop();
  return pages;
}

export function classifyDocument(document: string): PageDiagnostics[] {
  return splitPageText(document).map((text, index) => classifyPage(index + 1, text));
}

export interface ExtractOptions {
  /** Verzeichnis für die zwischengespeicherte `pdftotext`-Ausgabe (Standard neben dem PDF). */
  pageTextDir?: string;
  /** Kein externer Aufruf: Fehlt die Zwischendatei, ist das ein Fehler statt eines stillen Ergebnisses. */
  offline?: boolean;
}

/**
 * Liefert den Seitentext eines PDF. Reihenfolge: Zwischendatei im Cache, sonst `pdftotext -layout`.
 * Beides schlägt fehl → harter Fehler mit Handlungsanweisung, nie ein leeres Ergebnis.
 */
export function extractPdfPages(pdfPath: string, options: ExtractOptions = {}): PageDiagnostics[] {
  const directory = options.pageTextDir ?? join(dirname(pdfPath), '..', 'pagetext');
  const basename = pdfPath.replace(/\\/gu, '/').split('/').pop()!.replace(/\.pdf$/iu, '');
  const cacheFile = join(directory, `${basename}.pages.txt`);
  if (existsSync(cacheFile)) return classifyDocument(readFileSync(cacheFile, 'utf8'));
  if (options.offline) throw new Error(`Seitentext fehlt: ${cacheFile}. Im Offline-Betrieb wird nichts erzeugt – Lauf ohne --offline wiederholen.`);
  if (!existsSync(pdfPath)) throw new Error(`PDF fehlt: ${pdfPath}. Die Datei gehört in den Discovery-Cache (.cache/schleswig-holstein/raw/).`);
  mkdirSync(directory, { recursive: true });
  const result = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, cacheFile], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`pdftotext (poppler) hat ${pdfPath} nicht verarbeitet: ${result.error?.message ?? `Exit ${String(result.status)}`}. Entweder poppler installieren oder ${cacheFile} bereitstellen.`);
  }
  const text = readFileSync(cacheFile, 'utf8');
  // Nur zur Sicherheit: eine leere Ausgabe ist ein Fehler, kein Ergebnis.
  if (text.trim() === '') throw new Error(`pdftotext hat für ${pdfPath} keinen Text geliefert.`);
  writeFileSync(cacheFile, text);
  return classifyDocument(text);
}

export interface ReadabilitySummary {
  pages: number;
  clean: number;
  shiftCorrected: number;
  unreadable: number;
}

export function summarizeReadability(pages: readonly PdfPage[]): ReadabilitySummary {
  return {
    pages: pages.length,
    clean: pages.filter((page) => page.status === 'clean').length,
    shiftCorrected: pages.filter((page) => page.status === 'shift-corrected').length,
    unreadable: pages.filter((page) => page.status === 'unreadable').length,
  };
}
