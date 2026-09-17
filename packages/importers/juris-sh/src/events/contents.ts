/**
 * Parser der Jahresinhaltsverzeichnisse und der Ausgabenkopfzeilen beider Verkündungsblätter.
 *
 * Warum beides gebraucht wird: Die Register (`registers.ts`) führen nur den *geltenden* Bestand und
 * datieren auf Ende 2024 bzw. 30.09.2024. Für die kritische Zone um den Stichtag 2023-12-01 braucht das
 * Ereignisregister zusätzlich, was in den letzten Wochen des Jahres 2023 überhaupt verkündet wurde.
 * Zwei Fallen liegen genau hier:
 *
 *   – Ausfertigungsdatum ≠ Verkündungsdatum. GVOBl. Nr. 16 vom 07.12.2023 enthält Ausfertigungen vom
 *     08.11. bis 27.11.2023; sie galten am Stichtag noch nicht. Maßgeblich ist das Verkündungsdatum,
 *     also das Ausgabedatum des Blattes.
 *   – Der Jahrgangswechsel verschiebt Normen über die Stichtagsgrenze: Ausfertigungen vom November und
 *     Dezember 2023 erscheinen erst im GVOBl.-Jahrgang 2024.
 *
 * Deshalb zwei Auswertungen:
 *   `parseAnnualContents`  Zeitliche Übersicht eines Jahrgangs: Datum, Titel, Ausgabe, Seite und die
 *                          Beziehungszeile (`GS Schl.-H. II, Gl.Nr. …` = neue Vorschrift,
 *                          `Ändert … Gl.Nr. …` = Änderung).
 *   `parseIssueSchedule`   Ausgabennummer → Ausgabedatum, gewonnen aus den laufenden Kopfzeilen der
 *                          Jahrgangs-PDFs. Die Kopfzeilen sind auch auf beschädigten Seiten sauber und
 *                          damit die verlässlichste Quelle für das Verkündungsdatum.
 *
 * Auch hier gilt fail-closed: Ohne Ausgabennummer oder ohne Datum entsteht kein Eintrag mit geratenen
 * Werten, sondern ein Eintrag ohne das fehlende Feld.
 */
import { parseGermanDate } from './registers.ts';

export type TocDateKind = 'ausfertigung' | 'veroeffentlichung';
export type TocDateLayout = 'day-with-month-headers' | 'full-date';

export interface TocRelation {
  /** `new` = eigene Gliederungsnummer (neue Vorschrift), `amend` = ändert eine benannte Vorschrift. */
  kind: 'new' | 'amend';
  gliederungsnummer?: string;
  text: string;
}

export interface TocEntry {
  /** Datum laut Überschrift der Spalte: Ausfertigung (GVOBl.) bzw. Veröffentlichung (Amtsbl.). */
  date?: string;
  dateKind: TocDateKind;
  title: string;
  /** Nummer der Ausgabe, in der die Veröffentlichung erschienen ist (`16`, `49/50`). */
  issueNumber?: string;
  /** Gedruckte Seite im Jahrgang. */
  printedPage?: number;
  relations: TocRelation[];
  page: number;
  line: number;
}

export interface TocParseResult {
  entries: TocEntry[];
  /** Zeilen innerhalb eines Eintrags, die zu keinem Muster passten. */
  unmatched: { page: number; line: number; text: string }[];
}

const MONTH_HEADER = /^\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*$/u;
const YEAR_HEADER = /^\s*((?:19|20)\d{2})\s*$/u;
const DAY_ENTRY = /^\s*(\d{1,2})\.\s{2,}(\S.*)$/u;
const FULL_DATE_ENTRY = /^\s*(\d{1,2}\.\d{1,2}\.\d{4})\s{2,}(\S.*)$/u;
const COLUMNS = /\s{2,}(\d{1,3}(?:\/\d{1,3})?)\s{2,}(\d{1,4})\s*$/u;
const RELATION = /^\s*(?:(?:Artikel|Art\.)\s*\d+[a-z]?\s+)?(?:Ändert|ändert|GS\s+Schl\.-H\.|Gl\.Nr\.)/u;
const GLIEDERUNGSNUMMER = /Gl\.Nr\.\s*((?:B\s+)?\d[\d.\-]*[\da-z])/u;

const TOC_NOISE: readonly RegExp[] = [
  /^\s*$/u,
  /^\s*Zeitliche\s+Übersicht/u,
  /^\s*Sachverzeichnis/u,
  /^\s*Ausferti-?\s*$/u,
  /^\s*gungs-?\s*$/u,
  /^\s*datum\s*$/u,
  /^\s*Datum\s+der\s*$/u,
  /^\s*Veröffent-?\s*$/u,
  /^\s*lichung\s*$/u,
  /^\s*Inhalt\s*$/u,
  /^\s*Nummer\s*$/u,
  /^\s*Nr\.\s*des\s*$/u,
  /^\s*des\s*$/u,
  /^\s*GVOBl\.\s*$/u,
  /^\s*Schl\.-H\.\s*$/u,
  /^\s*Amtsblattes\s*$/u,
  /^\s*Seite\s*$/u,
  /^\s*[IVXLC]+\s*$/u,
  /^\s*Der\s+Jahrgang\b/u,
  /^\s*Es\s+wird\s+empfohlen\b/u,
];

function isNoise(text: string): boolean {
  return TOC_NOISE.some((pattern) => pattern.test(text));
}

function relationOf(text: string): TocRelation {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const gliederungsnummer = GLIEDERUNGSNUMMER.exec(normalized)?.[1]?.replace(/\s+/gu, ' ');
  const kind: TocRelation['kind'] = /ändert|Ändert/u.test(normalized) ? 'amend' : 'new';
  return { kind, ...(gliederungsnummer ? { gliederungsnummer } : {}), text: normalized };
}

export interface TocOptions {
  dateKind: TocDateKind;
  layout: TocDateLayout;
}

/**
 * Liest die „Zeitliche Übersicht“ eines Jahresinhaltsverzeichnisses. Zwei Satzarten kommen vor:
 * Tagesangabe unter Jahr- und Monatsüberschriften (GVOBl. 2023, Amtsbl. 2023) und vollständiges Datum
 * je Zeile (GVOBl. 2024).
 */
export function parseAnnualContents(pages: readonly { page: number; text: string }[], options: TocOptions): TocParseResult {
  const entries: TocEntry[] = [];
  const unmatched: TocParseResult['unmatched'] = [];
  let year: string | undefined;
  let month: string | undefined;
  let open: TocEntry | undefined;
  let columnsFound = false;
  let relationsStarted = false;
  let day: string | undefined;

  const close = (): void => {
    if (!open) return;
    open.title = open.title.replace(/\s+/gu, ' ').trim();
    if (open.title !== '') entries.push(open);
    open = undefined;
    columnsFound = false;
    relationsStarted = false;
    day = undefined;
  };

  const MONTHS: Readonly<Record<string, string>> = {
    Januar: '01', Februar: '02', März: '03', April: '04', Mai: '05', Juni: '06',
    Juli: '07', August: '08', September: '09', Oktober: '10', November: '11', Dezember: '12',
  };

  const startEntry = (page: number, line: number, rawDate: string, rest: string, isFullDate: boolean): void => {
    close();
    let date: string | undefined;
    if (isFullDate) date = parseGermanDate(rawDate);
    else {
      day = rawDate;
      if (year && month) date = parseGermanDate(`${rawDate}.${MONTHS[month]}.${year}`);
    }
    open = { ...(date ? { date } : {}), dateKind: options.dateKind, title: '', relations: [], page, line };
    absorbTitleLine(rest);
  };

  const absorbTitleLine = (text: string): void => {
    if (!open) return;
    const columns = COLUMNS.exec(text);
    if (columns) {
      open.issueNumber = columns[1]!;
      open.printedPage = Number(columns[2]!);
      columnsFound = true;
      open.title += ` ${text.slice(0, columns.index).trim()}`;
      return;
    }
    open.title += ` ${text.trim()}`;
  };

  for (const { page, text } of pages) {
    for (const [index, rawLine] of text.split('\n').entries()) {
      const line = index + 1;
      if (isNoise(rawLine)) continue;
      const yearHeader = YEAR_HEADER.exec(rawLine);
      if (yearHeader) {
        close();
        year = yearHeader[1]!;
        continue;
      }
      const monthHeader = MONTH_HEADER.exec(rawLine);
      if (monthHeader) {
        close();
        month = monthHeader[1]!;
        continue;
      }
      const fullDate = FULL_DATE_ENTRY.exec(rawLine);
      if (options.layout === 'full-date' && fullDate) {
        startEntry(page, line, fullDate[1]!, fullDate[2]!, true);
        continue;
      }
      const dayEntry = options.layout === 'day-with-month-headers' ? DAY_ENTRY.exec(rawLine) : undefined;
      if (dayEntry) {
        startEntry(page, line, dayEntry[1]!, dayEntry[2]!, false);
        continue;
      }
      if (!open) continue;
      if (RELATION.test(rawLine)) {
        open.relations.push(relationOf(rawLine));
        relationsStarted = true;
        continue;
      }
      if (relationsStarted) {
        // Die Beziehungszeilen stehen am Ende eines Eintrags; danach folgt der nächste Eintrag.
        close();
        continue;
      }
      if (/^\s*\d{1,4}\s*$/u.test(rawLine)) continue;
      // Der Titel bricht auch nach der Spaltenzeile noch um (Satzart des Jahrgangs 2024).
      absorbTitleLine(rawLine);
      if (rawLine.trim().length < 3) unmatched.push({ page, line, text: rawLine.trim() });
    }
    close();
  }
  close();
  void day;
  return { entries, unmatched };
}

export interface IssueRecord {
  /** Nummer der Ausgabe, wie das Blatt sie führt (`16`, `49/50`). */
  issue: string;
  publishedAt: string;
  /** Kleinste und größte gedruckte Seite, die in einer Kopfzeile dieser Ausgabe vorkommt. */
  firstPage?: number;
  lastPage?: number;
  /** Zahl der PDF-Seiten mit dieser Kopfzeile – Plausibilitätsmaß, kein amtlicher Wert. */
  pageCount: number;
}

const RUNNING_HEAD = /(?:Gesetz-\s*und\s*Verordnungsblatt|Amtsblatt)\s+für\s+Schleswig-Holstein\s+(\d{4});\s*Ausgabe\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/u;
const RUNNING_HEAD_ISSUE = /Nr\.\s*(\d{1,3}(?:\/\d{1,3})?)/u;
const RUNNING_HEAD_PAGE_LEFT = /^\s*(\d{1,4})\s{2,}/u;
const RUNNING_HEAD_PAGE_RIGHT = /\s{2,}(\d{1,4})\s*$/u;

/**
 * Ausgabennummer → Ausgabedatum aus den laufenden Kopfzeilen eines Jahrgangs-PDF.
 * Die Kopfzeile trägt links oder rechts die gedruckte Seite und am jeweils anderen Rand die
 * Ausgabennummer; beide Anordnungen kommen vor (gerade/ungerade Seiten gespiegelt).
 */
export function parseIssueSchedule(pages: readonly { page: number; text: string }[]): IssueRecord[] {
  const byIssue = new Map<string, IssueRecord>();
  for (const { text } of pages) {
    for (const rawLine of text.split('\n')) {
      const head = RUNNING_HEAD.exec(rawLine);
      if (!head) continue;
      const issue = RUNNING_HEAD_ISSUE.exec(rawLine)?.[1];
      const publishedAt = parseGermanDate(head[2]!);
      if (!issue || !publishedAt) continue;
      const existing = byIssue.get(issue);
      const record: IssueRecord = existing ?? { issue, publishedAt, pageCount: 0 };
      if (existing && existing.publishedAt !== publishedAt) {
        // Widersprüchliche Kopfzeilen: Der Befund wird nicht stillschweigend überschrieben.
        continue;
      }
      record.pageCount += 1;
      const printed = Number(RUNNING_HEAD_PAGE_LEFT.exec(rawLine)?.[1] ?? RUNNING_HEAD_PAGE_RIGHT.exec(rawLine)?.[1] ?? Number.NaN);
      if (Number.isInteger(printed)) {
        record.firstPage = record.firstPage === undefined ? printed : Math.min(record.firstPage, printed);
        record.lastPage = record.lastPage === undefined ? printed : Math.max(record.lastPage, printed);
      }
      byIssue.set(issue, record);
    }
  }
  return [...byIssue.values()].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.issue.localeCompare(right.issue));
}

/** Ausgabe, in der eine gedruckte Seite erschienen ist – Grundlage für „wann wurde das verkündet?“. */
export function issueForPage(schedule: readonly IssueRecord[], printedPage: number): IssueRecord | undefined {
  return schedule.find((record) => record.firstPage !== undefined && record.lastPage !== undefined && printedPage >= record.firstPage && printedPage <= record.lastPage);
}
