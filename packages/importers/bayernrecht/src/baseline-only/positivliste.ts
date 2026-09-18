/**
 * Positivliste der VwVWBek: „Verzeichnis der ab 1. Januar 2016 fortgeltenden veröffentlichten
 * Verwaltungsvorschriften“ (Anlage 1 zur Bekanntmachung über die Weitergeltung von Verwaltungsvorschriften,
 * AllMBl. 2016 S. 1555).
 *
 * Nach Nr. 1 VwVWBek traten die bis 31. Dezember 2015 erlassenen veröffentlichten Verwaltungsvorschriften der
 * Staatsregierung, der Staatskanzlei und der Staatsministerien außer Kraft, soweit sie nicht in diesem Verzeichnis
 * stehen. Das Verzeichnis liegt nur als PDF auf der Verkündungsplattform; sein Textlayer wird mit
 * `reconstruction/pdf.ts#pdfText` gelesen (kein OCR – eine nicht sicher dekodierbare Schrift macht die ganze Liste
 * unlesbar, und dann wird nichts gefolgert).
 *
 * Je Vorschrift führt die Liste: Dokumentklasse, Gliederungsnummer(n), Ressort, Langtitel, Erlassdatum,
 * Fassungsdatum (Datum der damals geltenden Fassung), Anwendungsbeginn und gegebenenfalls Anwendungsende.
 *
 * **Vollständigkeit der Zerlegung.** Eine Vorschrift „steht nicht in der Liste“ ist nur dann eine Aussage, wenn
 * jede Zeile der Liste erkannt wurde. Geprüft wird das an den Datumsangaben: Jedes Datum des Textes muss genau
 * einer erkannten Zeile angehören. Sonst gilt die Liste als nicht auswertbar.
 */
import { pdfText } from '../reconstruction/pdf.ts';
import { glnrStem } from './chain.ts';
import { titleKey } from './identity.ts';
import { isPageMiss, type Platform, type PlatformPage } from './platform.ts';

export const POSITIVLISTE_URL = 'https://www.verkuendung-bayern.de/fileadmin/Anlage_1_Positivliste_veroeffentlichte_Verwaltungsvorschriften.pdf';
export const POSITIVLISTE_CITATION = 'Anlage 1 zur VwVWBek (AllMBl. 2016 S. 1555): Verzeichnis der ab 1. Januar 2016 fortgeltenden veröffentlichten Verwaltungsvorschriften';

export interface PositivlisteRow {
  klasse: string;
  /** Gliederungsnummern der Zeile (mehrere mit „|“ getrennt). */
  gliederungsnummern: string[];
  ressort: string;
  title: string;
  erlassdatum: string;
  fassungsdatum: string;
  anwendungsbeginn: string;
  anwendungsende?: string;
}

export interface Positivliste {
  page: PlatformPage;
  rows: PositivlisteRow[];
  /** Spätestes Fassungsdatum der Liste – untere Schranke ihres Stands. */
  latestFassung: string;
}

export type PositivlisteLoad = { ok: true; list: Positivliste } | { ok: false; reason: string; pending?: boolean };

const ISO = String.raw`\d{4}-\d{2}-\d{2}`;
/** Gliederungsnummer, wie die Liste sie druckt – auch mit Zeilenumbruch („2210.1.1.3.0- K“, „2210.2.1.6.5. 1-K“) oder ohne Ressortzusatz. */
const GLNR = String.raw`\d[\d.]*(?:\s\d[\d.]*)?(?:-\s?[A-Za-zÄÖÜ]+)?`;
const ROW = new RegExp(
  String.raw`(?<![\d.])(\d{3})\s+(${GLNR}(?:\s*\|\s*${GLNR})*)\s+(St[A-Za-zÄÖÜ]*)\s+(.+?)\s+(${ISO})\s+(${ISO})\s+(${ISO})(?:\s+(${ISO}))?(?=\s+\d{3}\s+\d|\s*$)`,
  'gu',
);

/** Zerlegt den Textlayer der Liste. `complete` nur, wenn jedes Datum des Textes einer Zeile angehört. */
/** Zwischenüberschrift der Liste mitten im Text (zwischen zwei Zeilen) – kein Teil eines Titels. */
const LIST_HEADING = /Anlage\s+1\s+Positivliste\s+der\s+nach\s+dem\s+\d{2}\.\d{2}\.\d{4}\s+fortgeltenden\s+veröffentlichten\s+Verwaltungsvorschriften\s+\(Positivliste\s+1\)/gu;

export function parsePositivliste(input: string): { rows: PositivlisteRow[]; complete: boolean; unassigned: number } {
  const text = input.replace(LIST_HEADING, ' ');
  const rows: PositivlisteRow[] = [];
  let consumed = 0;
  for (const match of text.matchAll(ROW)) {
    rows.push({
      klasse: match[1]!,
      gliederungsnummern: match[2]!.split('|').map((value) => value.replace(/\s+/gu, '').trim()).filter(Boolean),
      ressort: match[3]!,
      title: match[4]!.trim(),
      erlassdatum: match[5]!,
      fassungsdatum: match[6]!,
      anwendungsbeginn: match[7]!,
      ...(match[8] ? { anwendungsende: match[8] } : {}),
    });
    consumed += match[8] ? 4 : 3;
  }
  const total = (text.match(new RegExp(ISO, 'gu')) ?? []).length;
  return { rows, complete: rows.length > 0 && consumed === total, unassigned: total - consumed };
}

let cached: { sha256: string; result: PositivlisteLoad } | undefined;

/** Liest die Positivliste (Cache, sonst im Budget über die Plattform). */
export async function loadPositivliste(platform: Platform): Promise<PositivlisteLoad> {
  const page = await platform.get(POSITIVLISTE_URL);
  if (isPageMiss(page)) return { ok: false, reason: `${POSITIVLISTE_URL}: ${page.detail}`, pending: page.missing !== 'not-found' };
  if (cached && cached.sha256 === page.sha256) return cached.result;
  const text = pdfText(page.bytes);
  let result: PositivlisteLoad;
  if (!text.ok) result = { ok: false, reason: `Textlayer der Positivliste nicht sicher lesbar: ${text.reason ?? 'unbekannt'}` };
  else {
    const parsed = parsePositivliste(text.pages.join(' '));
    result = parsed.complete
      ? { ok: true, list: { page, rows: parsed.rows, latestFassung: parsed.rows.map((row) => row.fassungsdatum).sort().at(-1)! } }
      : { ok: false, reason: `Positivliste nicht vollständig zerlegt (${parsed.rows.length} Zeilen, ${parsed.unassigned} Datumsangaben ohne Zeile)` };
  }
  cached = { sha256: page.sha256, result };
  return result;
}

export type PositivlisteMatch =
  | { status: 'listed'; row: PositivlisteRow }
  | { status: 'not-listed'; detail: string }
  | { status: 'ambiguous'; rows: PositivlisteRow[]; detail: string };

const words = (value: string): Set<string> => new Set(titleKey(value).split(/[^\p{L}\d]+/u).filter((word) => word.length > 3));

/**
 * Findet die Vorschrift in der Liste: gleiches Erlassdatum und gleiche Gliederungsnummer (ohne Ressortzusatz).
 * Mehrere solche Zeilen (etwa mehrere Ferienordnungen desselben Tages) werden über den Titel unterschieden –
 * alle Wörter des Listentitels müssen im Titel der Verkündung stehen; bleibt es mehrdeutig, wird nichts gefolgert.
 */
export function findInPositivliste(list: Positivliste, input: { documentDate: string; gliederungsnummern: readonly string[]; title: string }): PositivlisteMatch {
  const stems = new Set(input.gliederungsnummern.map(glnrStem));
  const sameDate = list.rows.filter((row) => row.erlassdatum === input.documentDate);
  const sameNumber = sameDate.filter((row) => row.gliederungsnummern.some((value) => stems.has(glnrStem(value))));
  if (sameNumber.length === 0) {
    return { status: 'not-listed', detail: `keine Zeile mit Erlassdatum ${input.documentDate} und Gliederungsnummer ${[...stems].join(', ')} (${sameDate.length} Zeile(n) mit diesem Erlassdatum unter anderen Nummern)` };
  }
  if (sameNumber.length === 1) return { status: 'listed', row: sameNumber[0]! };
  const own = words(input.title);
  const byTitle = sameNumber.filter((row) => [...words(row.title)].every((word) => own.has(word)));
  if (byTitle.length === 1) return { status: 'listed', row: byTitle[0]! };
  return { status: 'ambiguous', rows: sameNumber, detail: `${sameNumber.length} Zeilen mit Erlassdatum ${input.documentDate} und derselben Gliederungsnummer: ${sameNumber.map((row) => `„${row.title.slice(0, 80)}“`).join('; ')}` };
}
