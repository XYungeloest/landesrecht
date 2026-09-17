/**
 * Fortführungsnachweis von BAYERN.RECHT – die erste Enumerationsquelle.
 *
 *   `/Content/Document/ffn`      Rechtsvorschriften der Bayerischen Rechtssammlung (BayRS/GVBl.)
 *   `/Content/Document/ffn-mbl`  Verwaltungsvorschriften der Amtsblätter (BayMBl.)
 *
 * Beide Seiten sind statisch, unpaginiert und sitzungsfrei: zwei Abrufe für das gesamte
 * Vollständigkeitsverzeichnis. Aufbau (belegt, Fixtures unter `tests/fixtures/bayernrecht/`):
 *
 *   <table id="ffn">
 *     <tr style="text-align: center"> <td><strong>Gliederungsnummer</strong></td> … </tr>   Kopfzeile
 *     <tr> <td><strong>01-1</strong></td> <td><strong>Baden-Württemberg</strong></td> </tr>  Sachgebiet
 *     <tr> <td>01-1-2-U</td> <td><a href="BayBwEgauquVertr">Staatsvertrag …</a></td> </tr>   Vorschrift
 *     <tr style="font-size: smaller"> <td /> <td>1) mehrfach geänd. (…)</td> </tr>           Änderungsnotiz
 *
 * Drei Eigenheiten, die der Aufrufer kennen muss:
 *
 *  1. **Im `ffn-mbl` ist die Gliederungsnummernspalte leer.** Die fachliche Einordnung einer
 *     Verwaltungsvorschrift steckt dort ausschließlich in der zuletzt genannten Sachgebietszeile.
 *     Deshalb wird der Sachgebietspfad mitgeführt und an jedem Eintrag festgehalten.
 *  2. **Die Notizzeilen gehören zum jeweils vorangehenden Eintrag.** Im `ffn-mbl` sind das
 *     vollständige Änderungshistorien mit Datum und Fundstelle – daraus lässt sich ohne weiteren
 *     Abruf ablesen, ob sich eine Vorschrift seit dem Stichtag geändert hat.
 *  3. **Manche Titel beginnen mit `*`.** Was das Zeichen bedeutet, sagt die Seite nicht; es gibt keine
 *     Legende. Es wird als Titelmarke festgehalten und nicht gedeutet.
 */
import { decodeEntities, isDocumentId, textOf } from './portal.ts';

export interface FfnSection {
  number: string;
  title: string;
}

export interface FfnEntry {
  documentId: string;
  /** Gliederungsnummer der Zeile (BayRS); im `ffn-mbl` durchgehend leer und dann nicht gesetzt. */
  bayRsNumber?: string;
  title: string;
  /** Titelmarke `*` – Bedeutung ist im Nachweis nicht erläutert, wird nur festgehalten. */
  titleMarker?: string;
  /** Sachgebietspfad von oben nach unten (Nummern), aus den Zwischenüberschriften. */
  sectionPath: FfnSection[];
  /** Notizzeilen unter dem Eintrag (Änderungshistorie, Berichtigungen), in Reihenfolge. */
  notes: string[];
  /** Zeilennummer der Datenzeile in der Tabelle (1-basiert) – Beleg beim Nachschlagen. */
  row: number;
}

export interface FfnDocument {
  /** Überschrift der Seite (z. B. „Fortführungsnachweis Vorschriften“). */
  heading: string;
  sections: FfnSection[];
  entries: FfnEntry[];
  /** Zeilen mit Inhalt, aber ohne Verweis auf ein Dokument (im `ffn-mbl` belegt: „Bek StMD: Satzung der BayKommun AöR“). */
  unlinkedRows: Array<{ row: number; text: string }>;
}

const TABLE = /<table[^>]*id="ffn"[^>]*>([\s\S]*?)<\/table>/iu;
const ROW = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/giu;
const CELL = /<td\b([^>]*?)(?:\/>|>([\s\S]*?)<\/td>)/giu;
const LINK = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/iu;

function cells(rowHtml: string): string[] {
  CELL.lastIndex = 0;
  const values: string[] = [];
  for (const match of rowHtml.matchAll(CELL)) values.push(match[2] ?? '');
  return values;
}

/** Sachgebietspfad fortschreiben: `01-1-1` hängt unter `01-1`, `02` ersetzt den ganzen Pfad. */
export function updateSectionPath(path: readonly FfnSection[], section: FfnSection): FfnSection[] {
  const next = [...path];
  while (next.length > 0 && !section.number.startsWith(next[next.length - 1]!.number)) next.pop();
  // Gleiche Nummer auf gleicher Ebene: ersetzen statt schachteln.
  if (next.length > 0 && next[next.length - 1]!.number === section.number) next.pop();
  next.push(section);
  return next;
}

export function parseFortfuehrungsnachweis(html: string): FfnDocument {
  const table = TABLE.exec(html);
  if (!table) throw new Error('Keine Tabelle <table id="ffn"> – die Seite ist kein Fortführungsnachweis');
  const heading = textOf(/<div class="col-sm-9"[^>]*>\s*<b>([\s\S]*?)<\/b>/u.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/u.exec(html)?.[1] ?? '');
  const sections: FfnSection[] = [];
  const entries: FfnEntry[] = [];
  const unlinkedRows: Array<{ row: number; text: string }> = [];
  let path: FfnSection[] = [];
  let row = 0;
  ROW.lastIndex = 0;
  for (const match of table[1]!.matchAll(ROW)) {
    row += 1;
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const columns = cells(body);
    const isNote = /font-size:\s*smaller/iu.test(attributes);
    if (isNote) {
      const note = textOf(columns[columns.length - 1] ?? '');
      if (note === '') continue;
      const last = entries[entries.length - 1];
      if (last) last.notes.push(note);
      else unlinkedRows.push({ row, text: note });
      continue;
    }
    const link = LINK.exec(columns[1] ?? '');
    if (!link) {
      const number = textOf(columns[0] ?? '');
      const title = textOf(columns[1] ?? '');
      // Kopfzeile der Tabelle: keine Gliederung, sondern Spaltenbeschriftung.
      if (number === 'Gliederungsnummer' || (number === '' && title === 'Titel')) continue;
      if (number === '' && title === '') continue;
      if (/<strong>/iu.test(columns[0] ?? '') || /<strong>/iu.test(columns[1] ?? '')) {
        const section: FfnSection = { number, title };
        sections.push(section);
        path = updateSectionPath(path, section);
        continue;
      }
      unlinkedRows.push({ row, text: `${number} | ${title}`.trim() });
      continue;
    }
    const documentId = decodeEntities(link[1]!).trim().replace(/^\.?\//u, '');
    if (!isDocumentId(documentId)) {
      unlinkedRows.push({ row, text: `unbrauchbare Dokument-ID ${JSON.stringify(documentId)}` });
      continue;
    }
    const rawTitle = textOf(link[2]!);
    const marker = /^\*+/u.exec(rawTitle)?.[0];
    const entry: FfnEntry = {
      documentId,
      title: marker ? rawTitle.slice(marker.length).trim() : rawTitle,
      sectionPath: [...path],
      notes: [],
      row,
    };
    const number = textOf(columns[0] ?? '');
    if (number !== '') entry.bayRsNumber = number;
    if (marker) entry.titleMarker = marker;
    entries.push(entry);
  }
  return { heading, sections, entries, unlinkedRows };
}

/** Dokument-IDs, die der Nachweis mehrfach führt (Dublette wäre ein Quellbefund, kein Parserfehler). */
export function duplicateFfnIds(document: Pick<FfnDocument, 'entries'>): string[] {
  const counts = new Map<string, number>();
  for (const entry of document.entries) counts.set(entry.documentId, (counts.get(entry.documentId) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
}

const CHANGE_NOTE_DATE = /(?:vom|v\.)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/u;

/**
 * Datum einer Änderungsnotiz („Änderung vom 21.11.2023, BayMBl. 2023 Nr. 584“, „mehrfach geänd.
 * (Abk. v. 22.01.1992, 314)“). Nur Notizen mit vollständigem Tagesdatum liefern einen Wert; aus
 * Jahreszahlen allein wird kein Datum geraten.
 */
export function changeNoteDate(note: string): string | undefined {
  const match = CHANGE_NOTE_DATE.exec(note);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? undefined : iso;
}

/** Jüngstes datiertes Änderungsdatum eines Eintrags; ohne datierte Notiz `undefined`. */
export function latestChangeDate(entry: Pick<FfnEntry, 'notes'>): string | undefined {
  const dates = entry.notes.map(changeNoteDate).filter((date): date is string => Boolean(date));
  return dates.length === 0 ? undefined : dates.sort()[dates.length - 1];
}
