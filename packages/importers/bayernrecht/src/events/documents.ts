/**
 * Zerlegung der Detailseiten einzelner Veröffentlichungen der Verkündungsplattform Bayern
 * (`/gvbl/<jahr>-<seite>/`, `/baymbl/<jahr>-<nummer>/`).
 *
 * Diese Seiten sind der eigentliche Gewinn dieses Strangs: Sie tragen den **Volltext der Verkündung in
 * HTML** – also den Änderungsbefehl im Wortlaut, die Inkrafttretensvorschrift und, im Fall einer
 * Ablösung, den ausdrücklichen Außerkrafttretensbefehl gegen die Vorgängervorschrift. Ein PDF muss
 * dafür nicht geladen werden, es fällt kein OCR an, und der wörtliche Auszug im Register stammt aus
 * der Verkündung selbst statt aus einer Trefferliste.
 *
 * Mitgeführt wird außerdem die **von der Plattform veröffentlichte SHA-256 der amtlichen PDF-Ausgabe**
 * (`Hash-Prüfsumme der PDF-Datei (sha256)`). Sie ist der Integritätsbeleg für die Ausgabe, ohne dass die
 * Ausgabe geladen wird.
 *
 * Fehlt einer Seite der Textkörper (`article#documentbox`) – etwa weil die Veröffentlichung nur als
 * gescanntes PDF vorliegt –, wird das gemeldet und als Review geführt. Es wird **kein OCR** versucht und
 * nichts geraten.
 */
import { decodeEntities, htmlToText, parseGermanDate } from './listings.ts';
import type { PublicationOrgan } from './ledger.ts';

export interface PublicationDocument {
  organ: PublicationOrgan;
  volume: number;
  position: number;
  /** Fundstelle, wie die Seite sie in der Überschrift führt. */
  reference: string;
  /** Verkündungsdatum aus der Überschrift (nur BayMBl. nennt es dort). */
  publishedAt?: string;
  /** Gattung laut Seitenkopf: `Gesetz`, `Verordnung`, `Verwaltungsvorschrift`, `Bekanntmachung` … */
  documentKind?: string;
  /** Gliederungsnummern aus dem Seitenkopf (`structure-numbers`). */
  gliederungsnummern: string[];
  ressort?: string;
  /** Ausgabe, unter der die Veröffentlichung erschienen ist (`2024/24` bzw. `2024 Nr. 100`). */
  issue?: string;
  gazettePdfPath?: string;
  /** SHA-256 der PDF-Ausgabe, von der Plattform selbst veröffentlicht (immer kleingeschrieben). */
  gazettePdfSha256Published?: string;
  /** Titel aus dem Textkörper (`h2`), sonst leer. */
  title: string;
  /** Der Volltext der Verkündung, Leerraum normalisiert. Leer, wenn kein Textkörper vorhanden ist. */
  text: string;
  /** Absätze des Textkörpers – Grundlage für den wörtlichen Auszug an der belegenden Stelle. */
  paragraphs: string[];
  /** Kein HTML-Textkörper vorhanden: Review, kein OCR, keine Vermutung. */
  hasTextLayer: boolean;
}

const HEADLINE = /<h1[^>]*>([\s\S]*?)<\/h1>/iu;
const DOCUMENT_BOX = /<article[^>]*id="documentbox"[^>]*>([\s\S]*?)<\/article>/iu;
const STRUCTURE_NUMBERS = /<div[^>]*class="[^"]*structure-numbers[^"]*"[^>]*>([\s\S]*?)<\/div>/iu;
const RESSORT = /<div[^>]*class="[^"]*\bressort\b[^"]*"[^>]*>([\s\S]*?)<\/div>/iu;
const HASH = /Hash-Prüfsumme der PDF-Datei[^<]*\(sha256\):\s*<strong>\s*([0-9a-fA-F]{64})\s*<\/strong>/iu;
const PDF_HREF = /href="(\/files\/(?:gvbl|baymbl)\/[^"#]+\.pdf)/u;
const PDF_LABEL = /aria-label="Link zum PDF ([^"]*)"/u;
const HEAD_RIGHT_KIND = /<div[^>]*id="head-right"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/iu;
const BODY_TITLE = /<h2[^>]*>([\s\S]*?)<\/h2>/iu;

/**
 * Absatzweise Zerlegung des Textkörpers; Überschriften und Listenglieder bleiben eigene Absätze.
 * Die Definitionslisten (`dt`/`dd`) sind wichtig: Aufhebungsbekanntmachungen des BayMBl. führen die
 * aufgehobenen Vorschriften als Definitionsliste, je Vorschrift ein `dd`.
 */
function splitParagraphs(fragment: string): string[] {
  const parts = fragment
    .replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ')
    .split(/<\/(?:p|h[1-6]|li|div|td|dd|dt)>/iu)
    .map((part) => htmlToText(part))
    .filter((part) => part !== '');
  return parts;
}

/** Zerlegt eine Detailseite. Wirft nie – was fehlt, fehlt und wird als solches gemeldet. */
export function parsePublicationDocument(html: string, organ: PublicationOrgan, volume: number, position: number): PublicationDocument {
  const headline = htmlToText(HEADLINE.exec(html)?.[1] ?? '');
  const box = DOCUMENT_BOX.exec(html)?.[1];
  const paragraphs = box === undefined ? [] : splitParagraphs(box);
  const text = paragraphs.join(' ').replace(/\s+/gu, ' ').trim();
  const structure = htmlToText(STRUCTURE_NUMBERS.exec(html)?.[1] ?? '');
  const ressort = htmlToText(RESSORT.exec(html)?.[1] ?? '');
  const hash = HASH.exec(html)?.[1];
  const pdfPath = PDF_HREF.exec(html)?.[1];
  const label = decodeEntities(PDF_LABEL.exec(html)?.[1] ?? '').replace(/[\u00a0\u202f]/gu, ' ');
  const kind = htmlToText(HEAD_RIGHT_KIND.exec(html)?.[1] ?? '');
  const title = box === undefined ? '' : htmlToText(BODY_TITLE.exec(box)?.[1] ?? '');
  // GVBl.: „Link zum PDF 2024/24 vom 30.12.2024: …“ · BayMBl.: „Link zum PDF Amtliche elektronische Ausgabe: …“
  const issue = /^(\d{4}\/\d{1,2})\s+vom\s+\d{1,2}\.\d{1,2}\.\d{4}/u.exec(label)?.[1];
  const publishedAt = parseGermanDate(headline) ?? (/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(label)?.[1] === undefined ? undefined : parseGermanDate(label));

  return {
    organ,
    volume,
    position,
    reference: headline.replace(/^(?:Fundstelle|Veröffentlichung)\s+/u, '').trim(),
    ...(publishedAt ? { publishedAt } : {}),
    ...(kind === '' ? {} : { documentKind: kind }),
    gliederungsnummern: structure.split(/[\s,;]+/u).map((part) => part.trim()).filter((part) => part !== '' && /^\d/u.test(part)),
    ...(ressort === '' ? {} : { ressort }),
    ...(issue === undefined ? {} : { issue }),
    ...(pdfPath === undefined ? {} : { gazettePdfPath: pdfPath }),
    ...(hash === undefined ? {} : { gazettePdfSha256Published: hash.toLowerCase() }),
    title,
    text,
    paragraphs,
    hasTextLayer: text !== '',
  };
}
