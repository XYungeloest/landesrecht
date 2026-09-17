/**
 * Strukturprüfung eines Exportpakets für den Beispielkorpus.
 *
 * Der Korpus behauptet nicht, welche Strukturfälle eine Norm abdeckt – er **prüft es am abgelegten
 * Paket nach**. Jede Angabe in `data/imports/bayernrecht/corpus.json` ist damit an den Bytes belegt,
 * deren SHA-256 daneben steht. Findet sich ein vorgesehener Fall im Paket nicht, ist das ein Fehler
 * des Korpus, kein Grund zum Abrunden.
 *
 * Die Erkennung bleibt bewusst grob (Zählungen über das XML, kein Aufbau eines Dokumentbaums): Sie
 * beantwortet die Frage „kommt dieser Fall hier vor?“, nicht „wie sieht er aus?“. Die Auswertung der
 * Struktur ist Sache des Parserstrangs.
 */
import { readZipDirectory, readZipEntryText, type ZipEntry } from './zip.ts';

/** Strukturfälle, die ein Paket abdecken kann. Jeder ist am XML oder am Paketinhalt nachweisbar. */
export const STRUCTURE_CASES = [
  'dtd-byrecht-norm',
  'dtd-byrecht-vv',
  'gliederung-verschachtelt',
  'vorschrift-ohne-gliederung',
  'vorschrift-ohne-nummer',
  'aufgehobene-vorschriften',
  'tabellen',
  'anlagen-strukturiert',
  'anlagen-pdf',
  'bildbeilagen',
  'fussnoten',
  'verweise',
  'aenderungsverlauf',
  'satznummern',
  'satznummern-hochgestellt',
  'leere-metadaten',
  'kein-builddate',
] as const;
export type StructureCase = (typeof STRUCTURE_CASES)[number];

export interface PackageInspection {
  /** Klartextkennung des Pakets (`bayportalnorm+zip`, `bayportalvv+zip`, `pdf+zip`). */
  mimetype?: string;
  entries: Array<{ name: string; size: number }>;
  /** Pfad des Normdokuments im Paket. */
  xmlPath: string;
  xmlByteLength: number;
  /** Wurzelelement laut `<!DOCTYPE>` (`byrecht-norm` oder `byrecht-vv`). */
  doctype?: string;
  /** Konsolidierungsstand `@builddate`; Verwaltungsvorschriften führen keinen. */
  buildDate?: string;
  pdfAttachments: number;
  /** Bilddateien im Paket (`img/…`). Die Portalhilfe nennt sie, die Quellen-Discovery fand keine. */
  imageAttachments: number;
  counts: {
    einzelnorm: number;
    gliederung: number;
    jurAbsatz: number;
    annex: number;
    table: number;
    tableRows: number;
    footnotes: number;
    references: number;
    sentenceNumbers: number;
    superscripts: number;
    repealedPlaceholders: number;
  };
  cases: StructureCase[];
}

const countOf = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

/** Bilddateien des Pakets; die Portalhilfe nennt „Bilddateien“, belegt sind sie an `img/…jpg`. */
const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif|tiff?|svg|webp)$/iu;

/** Größte Schachtelungstiefe eines Elements (öffnende und schließende Marken in Reihenfolge zählen). */
export function maxNestingDepth(xml: string, tag: string): number {
  const token = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'gu');
  let depth = 0;
  let maximum = 0;
  for (const match of xml.matchAll(token)) {
    if (match[0].startsWith('</')) depth = Math.max(0, depth - 1);
    else if (match[1] !== '/') {
      depth += 1;
      maximum = Math.max(maximum, depth);
    }
  }
  return maximum;
}

/** Das Normdokument eines Pakets: die einzige XML-Datei außerhalb von `META-INF`. */
export function findNormXmlEntry(entries: readonly ZipEntry[]): ZipEntry {
  const candidates = entries.filter((entry) => entry.name.toLowerCase().endsWith('.xml') && !entry.name.startsWith('META-INF/'));
  if (candidates.length === 0) throw new Error('Paket ohne Normdokument (keine XML-Datei außerhalb von META-INF)');
  if (candidates.length > 1) throw new Error(`Paket mit ${candidates.length} Normdokumenten (${candidates.map((entry) => entry.name).join(', ')}) – erwartet wird genau eines`);
  return candidates[0]!;
}

export function inspectPackage(bytes: Uint8Array): PackageInspection {
  const directory = readZipDirectory(bytes);
  const mimetypeEntry = directory.find((entry) => entry.name === 'mimetype');
  const xmlEntry = findNormXmlEntry(directory);
  const xml = readZipEntryText(bytes, xmlEntry);
  const doctype = /<!DOCTYPE\s+([A-Za-z0-9._-]+)/u.exec(xml)?.[1];
  const buildDate = /<[A-Za-z0-9._-]+\s[^>]*builddate="([^"]+)"/u.exec(xml)?.[1];
  const counts: PackageInspection['counts'] = {
    einzelnorm: countOf(xml, /<einzelnorm\b/gu),
    gliederung: countOf(xml, /<gliederung\b/gu),
    jurAbsatz: countOf(xml, /<jurAbsatz\b/gu),
    annex: countOf(xml, /<annex\b(?!\.)/gu),
    table: countOf(xml, /<table\b/gu),
    tableRows: countOf(xml, /<tr\b/gu),
    footnotes: countOf(xml, /<fn\.call\b/gu),
    references: countOf(xml, /<verweis\.norm\b/gu),
    sentenceNumbers: countOf(xml, /<satz\.nr\b/gu),
    superscripts: countOf(xml, /<sup>/gu),
    // Aufgehobene Vorschriften bleiben als Platzhalter stehen: `<span class="i"> (aufgehoben)</span>`.
    repealedPlaceholders: countOf(xml, /\(aufgehoben\)/gu),
  };
  const pdfAttachments = directory.filter((entry) => entry.name.toLowerCase().endsWith('.pdf')).length;
  const imageAttachments = directory.filter((entry) => IMAGE_EXTENSION.test(entry.name)).length;
  const cases: StructureCase[] = [];
  const add = (value: StructureCase, condition: boolean): void => {
    if (condition) cases.push(value);
  };
  add('dtd-byrecht-norm', doctype === 'byrecht-norm');
  add('dtd-byrecht-vv', doctype === 'byrecht-vv');
  add('gliederung-verschachtelt', maxNestingDepth(xml, 'gliederung') > 1);
  // Eine `einzelnorm` unmittelbar unter `<rumpf>` steht außerhalb jeder Gliederung (z. B. die Präambel).
  add('vorschrift-ohne-gliederung', /<rumpf>\s*(?:<normzitat>[\s\S]*?<\/normzitat>\s*|<aenderungsverlauf>[\s\S]*?<\/aenderungsverlauf>\s*)*<einzelnorm\b/u.test(xml));
  add('vorschrift-ohne-nummer', /<para\.nr\s*\/>/u.test(xml));
  add('aufgehobene-vorschriften', counts.repealedPlaceholders > 0);
  add('tabellen', counts.table > 0);
  add('anlagen-strukturiert', counts.annex > 0);
  add('anlagen-pdf', pdfAttachments > 0);
  add('bildbeilagen', imageAttachments > 0);
  add('fussnoten', counts.footnotes > 0);
  add('verweise', counts.references > 0);
  add('aenderungsverlauf', /<aenderungsverlauf\b/u.test(xml));
  add('satznummern', counts.sentenceNumbers > 0);
  add('satznummern-hochgestellt', doctype === 'byrecht-vv' && counts.superscripts > 0);
  add('leere-metadaten', /<kurzbezeichnung\s*\/>|<kurzbezeichnung><\/kurzbezeichnung>|<amtlicheAbk\s*\/>|<annex\.titel\s*\/>|<fn\.text\s*\/>/u.test(xml));
  add('kein-builddate', buildDate === undefined);
  const inspection: PackageInspection = {
    entries: directory.map((entry) => ({ name: entry.name, size: entry.uncompressedSize })),
    xmlPath: xmlEntry.name,
    xmlByteLength: xmlEntry.uncompressedSize,
    pdfAttachments,
    imageAttachments,
    counts,
    cases,
  };
  if (mimetypeEntry) inspection.mimetype = readZipEntryText(bytes, mimetypeEntry).trim();
  if (doctype) inspection.doctype = doctype;
  if (buildDate) inspection.buildDate = buildDate;
  return inspection;
}
