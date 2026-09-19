/**
 * Lauf 9: Stammverkündung, die nur als PDF-Ausgabe des GVBl. vorliegt – Prüfung ihres **Textlayers** (nie OCR) als
 * mögliche Quelle des Stands am Stichtag.
 *
 * Aus einem Textlayer entsteht kein Wortlaut, solange Worttrennung, Leerraum oder Gestalt nicht eindeutig sind. Diese
 * Prüfung sagt für jede solche Norm, woran es liegt – in dieser Reihenfolge:
 *
 * - `pdf-not-cached`: die Ausgabe (oder ihr Ausgabenverzeichnis) ist noch nicht abgerufen (Bedarf);
 * - `pdf-checksum-mismatch`: SHA-256 ≠ von der Plattform veröffentlichte Prüfsumme;
 * - `pdf-ocr`: der Textlayer stammt aus Texterkennung (unsichtbarer Text über einem Seitenbild, Erzeuger) oder es gibt
 *   keinen (Scan) – OCR ist keine Rechtsquelle;
 * - `pdf-undecodable`: eine Schrift oder ein Inhaltsstrom ist nicht sicher dekodierbar;
 * - `pdf-not-located`: auf der Anfangsseite laut Fundstelle steht das Ausfertigungsdatum der Norm nicht;
 * - `pdf-ambiguous`: auf den Anfangsseiten der Verkündung sind Wortgrenzen oder Satzgestalt nicht eindeutig –
 *   Unterschneidung („T eil“, „V om“), Trennstrich am Zeilenende vor Kleinbuchstaben („Versicherungs- träger“ neben
 *   „Mahn- und“), Satznummern als gewöhnliche Ziffern;
 * - `pdf-unconverted`: nichts davon gefunden – eine Umsetzung in das Blockmodell (Gliederung, Absätze, Sätze) aus dem
 *   Seitenlayout ist aber nicht belegt; Review.
 *
 * Kein Zustand führt zu einem Rezept: Die Prüfung ist Befund, nicht Quelle.
 */
import { locateBase, parseParenthetical } from '../baseline-only/references.ts';
import { pdfText } from './pdf.ts';
import { longGermanDate, lookupPage } from './pages.ts';
import { readCached, type CurrentNorm } from './source.ts';

export type PdfBaseState = 'pdf-not-cached' | 'pdf-checksum-mismatch' | 'pdf-ocr' | 'pdf-undecodable' | 'pdf-not-located' | 'pdf-ambiguous' | 'pdf-unconverted';

export interface PdfBaseAssessment {
  state: PdfBaseState;
  detail: string;
  url?: string;
  needs?: string[];
}

/** Befunde auf einem Seitentext des Textlayers, die Wortgrenzen oder Satzgestalt mehrdeutig machen. */
export interface LayerAmbiguities {
  kerning: string[];
  hyphenation: string[];
  sentenceNumbers: string[];
}

// Einzelner Großbuchstabe, Leerzeichen, Kleinbuchstaben: „T eil“, „V orschriften“, „V om“ – Unterschneidung im Satz.
// Großgeschriebene Einbuchstabenwörter gibt es im Normtext nicht (Abkürzungen tragen einen Punkt).
const KERNING = /(?<![\p{L}\d.])([A-ZÄÖÜ]) ([a-zäöüß]{2,})/gu;
// Trennstrich am Zeilenende: „Versicherungs- träger“. „Mahn- und …“ (Ergänzungsstrich) ist dasselbe Zeichenbild – ohne
// Zeilenlayout nicht zu unterscheiden, außer vor Konjunktionen.
const HYPHENATION = /(\p{L}{2,})- (?!(?:und|oder|bzw|sowie|als|bis)\b)([a-zäöüß]\p{L}*)/gu;
// Satznummern stehen im Textlayer als gewöhnliche Ziffern vor dem Satzanfang: „… erteilt. 2 Die …“.
const SENTENCE_NUMBER = /[.:;] (\d{1,2}) (?=[A-ZÄÖÜ])/gu;

export function layerAmbiguities(text: string): LayerAmbiguities {
  const collect = (pattern: RegExp): string[] => [...text.matchAll(pattern)].map((match) => match[0]);
  return { kerning: collect(KERNING), hyphenation: collect(HYPHENATION), sentenceNumbers: collect(SENTENCE_NUMBER) };
}

const compact = (text: string): string => text.replace(/\s+/gu, '');

/** Textlayer der Stammverkündung einer Norm mit Fundstelle im GVBl., die nur als PDF-Ausgabe vorliegt. */
export async function assessPdfBase(root: string, norm: CurrentNorm): Promise<PdfBaseAssessment | undefined> {
  const identity = norm.identity;
  const referenceText = identity.references[0];
  if (!referenceText || !identity.documentDate) return undefined;
  const reference = parseParenthetical(referenceText).primary;
  if (!reference || reference.organ !== 'GVBl' || reference.kind !== 'page') return undefined;
  const location = locateBase(reference, identity.documentDate);
  const refs = location.volumes.map((volume) => ({ organ: 'gvbl' as const, volume, position: reference.position }));
  if (refs.length === 0) return undefined;
  const found = await lookupPage(root, refs, undefined, { allowPdf: true });
  if (found.status === 'missing') return { state: 'pdf-not-cached', detail: `PDF-Ausgabe nicht im Cache (${found.needs.join(', ')})`, needs: found.needs };
  if (found.status !== 'found' || found.page.kind !== 'pdf' || !found.page.pdf) return undefined;
  const page = found.page;
  const pdfInfo = page.pdf!;
  const cached = await readCached(root, page.url);
  if (!cached) return { state: 'pdf-not-cached', detail: `PDF-Ausgabe nicht im Cache (${page.url})`, needs: [page.url] };
  const where = `${page.url} (Ausgabe ${pdfInfo.issue}, S. ${pdfInfo.pages})`;
  if (cached.sha256 !== pdfInfo.publishedSha256) return { state: 'pdf-checksum-mismatch', url: page.url, detail: `${where}: SHA-256 ${cached.sha256.slice(0, 16)}… ≠ veröffentlichte Prüfsumme ${pdfInfo.publishedSha256.slice(0, 16)}…` };
  const text = pdfText(cached.bytes);
  if (!text.ok) {
    const ocr = /Texterkennung|kein verwertbarer Textlayer/u.test(text.reason ?? '');
    return { state: ocr ? 'pdf-ocr' : 'pdf-undecodable', url: page.url, detail: `${where}: ${text.reason}` };
  }
  const range = /^(\d+)\s*-\s*(\d+)$/u.exec(pdfInfo.pages);
  const index = range ? page.ref.position - Number(range[1]) : -1;
  const start = text.pages[index];
  if (start === undefined || !compact(start).includes(compact(longGermanDate(identity.documentDate)))) {
    return { state: 'pdf-not-located', url: page.url, detail: `${where}: auf S. ${page.ref.position} steht das Ausfertigungsdatum ${identity.documentDate} nicht` };
  }
  const own = start.slice(Math.max(0, start.search(/Der Landtag|verordnet|erlässt|bekannt gemacht/u)));
  const ambiguities = layerAmbiguities(`${own} ${text.pages[index + 1] ?? ''}`);
  const parts = [
    ambiguities.kerning.length ? `Unterschneidung ${ambiguities.kerning.length}× (etwa „${ambiguities.kerning[0]}“)` : '',
    ambiguities.hyphenation.length ? `Trennstrich am Zeilenende ${ambiguities.hyphenation.length}× (etwa „${ambiguities.hyphenation[0]}“)` : '',
    ambiguities.sentenceNumbers.length ? `Satznummern als Ziffern ${ambiguities.sentenceNumbers.length}× (etwa „${ambiguities.sentenceNumbers[0]}“)` : '',
  ].filter(Boolean);
  if (parts.length > 0) return { state: 'pdf-ambiguous', url: page.url, detail: `${where}, S. ${page.ref.position} f.: Textlayer mehrdeutig – ${parts.join('; ')}; Worttrennung und Satzgestalt wären zu raten → Review` };
  return { state: 'pdf-unconverted', url: page.url, detail: `${where}, S. ${page.ref.position} f.: Textlayer ohne erkennbare Mehrdeutigkeit; die Umsetzung in Gliederung, Absätze und Sätze aus dem Seitenlayout ist nicht belegt → Review` };
}
