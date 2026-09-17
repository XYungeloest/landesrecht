/**
 * PDF-Fälle des RECHT.NRW-Imports (`data/audits/recht-nrw/lrmb/PDF_FAELLE.{json,md}`).
 *
 * Erfasst jede Stammnorm, deren Manifest PDF-Quellen nennt: Normtext nur als PDF, Regelungsgehalt nur
 * in PDF-Anlagen (Kopferlass), „nicht abgedruckte“ Anlagen, sowie übernommene Normen mit archivierten
 * PDF-Anlagen (LRGV und LRMB). Je Datei: Seitenzahl, Textlayer, Verschlüsselung, geschätzter Textumfang
 * (Zeichen in Textoperatoren; keine Texterkennung), Haupttext oder Anlage, SHA-256 der Quelle.
 *
 * Die Transkriptionspriorität ist eine Arbeitshilfe für spätere strukturierte Transkriptionen
 * (`common/transcription.ts`): sie ordnet, entscheidet nichts und löst keine Massentranskription aus.
 *
 *   Faktoren: Review-Priorität der Stammnorm (`common/review-priority.ts`) + Regelungsgehalt nur im PDF
 *   (Haupttext/Kopferlass) +20 + Textlayer vorhanden +10 / Scan −10 + Normativität eindeutig +5
 *   − Aufwand (1 je 10 Seiten, höchstens −25).
 */
import { inflateSync } from 'node:zlib';

import { inspectPdf, type PdfInspection } from '../common/pdf.ts';
import { compareSourceIdentity, type ImportManifest, type ManifestAttachment, type ManifestEntry } from '../common/manifest.ts';
import { bandOf, type PriorityBand, type ReviewPriority } from '../common/review-priority.ts';
import type { OfflineSourceReader } from '../common/review-sources.ts';

export const PDF_CASES_SCHEMA = 'recht-nrw-pdf-cases/1' as const;

export interface PdfDocumentReport {
  role: 'main-text' | 'attachment' | 'publication-pdf';
  label: string;
  url: string;
  sha256?: string;
  byteLength?: number;
  essential: boolean;
  handling?: ManifestAttachment['handling'];
  available: 'local' | 'cache' | 'not-available';
  pages?: number;
  textLayer?: boolean;
  scanLike?: boolean;
  encrypted?: boolean;
  /** Zeichen in Textoperatoren (Schätzung ohne Texterkennung). */
  estimatedTextChars?: number;
  notes: string[];
}

export interface PdfCase {
  sourceIdentity: string;
  sourceArea: ManifestEntry['sourceArea'];
  title: string;
  sourceUrl: string;
  importStatus: ManifestEntry['importStatus'];
  targetSlug?: string;
  baselineStatus: ManifestEntry['baselineStatus'];
  normativity?: 'include' | 'exclude' | 'review';
  textCompleteness?: ManifestEntry['textCompleteness'];
  /** Wo der Regelungsgehalt steht. */
  mainText: 'html' | 'pdf-only' | 'html-with-essential-pdf' | 'essential-missing' | 'structured-transcription';
  pdfDocuments: number;
  htmlAttachments: number;
  pagesKnown: number;
  textLayerDocuments: number;
  scanDocuments: number;
  unknownDocuments: number;
  estimatedTextChars: number;
  documents: PdfDocumentReport[];
  reviewPriority: ReviewPriority;
  transcriptionPriority: { score: number; band: PriorityBand; factors: string[] };
}

export interface PdfCasesReport {
  schemaVersion: typeof PDF_CASES_SCHEMA;
  generatedAt: string;
  note: string;
  summary: {
    cases: number;
    byArea: Record<string, number>;
    byMainText: Record<string, number>;
    documents: number;
    pagesKnown: number;
    textLayerDocuments: number;
    scanDocuments: number;
    unknownDocuments: number;
    notAvailable: number;
    estimatedTextChars: number;
  };
  cases: PdfCase[];
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
}

/** Ströme, die keinen Seiteninhalt tragen (Bilder, Schriften, Metadaten, Querverweise, Objektströme). */
const NON_CONTENT_STREAM = /\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType)\b|\/Length[123]\b|\/Type\s*\/(?:XRef|ObjStm|Metadata|Font|FontDescriptor|CMap)\b|\/Filter\s*\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)\b/u;
const MAX_STREAM_BYTES = 8_000_000;

/** Inhaltsströme (unkomprimiert oder FlateDecode) als latin1-Text; Bild-, Schrift- und Strukturströme werden übersprungen. */
function contentStreams(bytes: Uint8Array): string[] {
  const text = latin1(bytes);
  const views: string[] = [];
  let cursor = 0;
  for (;;) {
    const streamAt = text.indexOf('stream', cursor);
    if (streamAt < 0) break;
    cursor = streamAt + 6;
    if (text.slice(streamAt - 3, streamAt) === 'end') continue;
    const dictionaryStart = text.lastIndexOf('<<', streamAt);
    const dictionary = dictionaryStart >= 0 && streamAt - dictionaryStart < 4000 ? text.slice(dictionaryStart, streamAt) : '';
    if (!dictionary || NON_CONTENT_STREAM.test(dictionary)) continue;
    const bodyStart = text[cursor] === '\r' ? (text[cursor + 1] === '\n' ? cursor + 2 : cursor + 1) : text[cursor] === '\n' ? cursor + 1 : cursor;
    const bodyEnd = text.indexOf('endstream', bodyStart);
    if (bodyEnd < 0) break;
    cursor = bodyEnd + 9;
    if (bodyEnd - bodyStart > MAX_STREAM_BYTES) continue;
    if (/\/Filter\s*\/FlateDecode\b/u.test(dictionary) && !/\/Filter\s*\[/u.test(dictionary)) {
      try {
        views.push(latin1(inflateSync(bytes.subarray(bodyStart, bodyEnd))));
      } catch {
        // unlesbarer Strom – wird nicht geschätzt
      }
    } else if (!/\/Filter\b/u.test(dictionary)) {
      views.push(text.slice(bodyStart, bodyEnd));
    }
  }
  return views;
}

const isDelimiter = (char: string | undefined): boolean => char === undefined || /[\s()<>[\]{}/%]/u.test(char);

/**
 * Zeichen in Textoperatoren (`(…) Tj`, `[(…)] TJ`, `<…> Tj`) über alle Inhaltsströme – eine Schätzung ohne
 * Texterkennung. Linearer Tokenizer (keine regulären Ausdrücke auf Binärdaten): Literale mit Escapes und
 * verschachtelten Klammern, Hexstrings als Zwei-Byte-Glyphen, Arrays für TJ.
 */
export function estimatePdfTextChars(bytes: Uint8Array): number {
  let count = 0;
  for (const view of contentStreams(bytes)) {
    let inText = false;
    let arrayChars = -1;
    for (let index = 0; index < view.length; index += 1) {
      const char = view[index]!;
      if (!inText) {
        if (char === 'B' && view[index + 1] === 'T' && isDelimiter(view[index - 1]) && isDelimiter(view[index + 2])) {
          inText = true;
          index += 1;
        }
        continue;
      }
      if (char === 'E' && view[index + 1] === 'T' && isDelimiter(view[index - 1]) && isDelimiter(view[index + 2])) {
        inText = false;
        arrayChars = -1;
        index += 1;
        continue;
      }
      let chars = -1;
      let next = index;
      if (char === '(') {
        let depth = 1;
        let length = 0;
        next = index + 1;
        while (next < view.length && depth > 0) {
          const current = view[next]!;
          if (current === '\\') {
            next += /^[0-7]{3}/u.test(view.slice(next + 1, next + 4)) ? 4 : 2;
            length += 1;
            continue;
          }
          if (current === '(') depth += 1;
          else if (current === ')') depth -= 1;
          if (depth > 0) length += 1;
          next += 1;
        }
        chars = length;
      } else if (char === '<' && view[index + 1] !== '<') {
        next = view.indexOf('>', index + 1);
        if (next < 0) break;
        chars = Math.floor(view.slice(index + 1, next).replace(/\s+/gu, '').length / 4);
        next += 1;
      } else if (char === '[') {
        arrayChars = 0;
        continue;
      } else if (char === ']') {
        const operator = /^\s*(TJ)(?![\w])/u.exec(view.slice(index + 1, index + 8));
        if (operator && arrayChars >= 0) count += arrayChars;
        arrayChars = -1;
        continue;
      } else {
        continue;
      }
      if (arrayChars >= 0) arrayChars += chars;
      else {
        const operator = /^\s*(Tj|'|")(?![\w])/u.exec(view.slice(next, next + 8));
        if (operator) count += chars;
      }
      index = next - 1;
    }
  }
  return count;
}

function mainTextOf(entry: ManifestEntry): PdfCase['mainText'] {
  switch (entry.textCompleteness) {
    case 'pdf-only': return 'pdf-only';
    case 'pdf-only-essential-attachments': return 'html-with-essential-pdf';
    case 'essential-attachment-missing': return 'essential-missing';
    case 'structured-transcription': return 'structured-transcription';
    default: return 'html';
  }
}

export function transcriptionPriority(pdfCase: Omit<PdfCase, 'transcriptionPriority'>): PdfCase['transcriptionPriority'] {
  const factors: string[] = [];
  let score = pdfCase.reviewPriority.score;
  factors.push(`Review-Priorität der Stammnorm (${score >= 0 ? '+' : '−'}${Math.abs(score)})`);
  const add = (value: number, label: string): void => {
    if (value === 0) return;
    score += value;
    factors.push(`${label} (${value > 0 ? '+' : '−'}${Math.abs(value)})`);
  };
  if (pdfCase.mainText === 'pdf-only' || pdfCase.mainText === 'html-with-essential-pdf') add(20, 'Regelungsgehalt nur im PDF');
  if (pdfCase.mainText === 'essential-missing') add(-20, 'wesentliche Anlage nicht verlinkt (Quelle fehlt)');
  if (pdfCase.textLayerDocuments > 0 && pdfCase.scanDocuments === 0) add(10, 'Textlayer in allen geprüften PDF-Dateien');
  else if (pdfCase.scanDocuments > 0) add(-10, `${pdfCase.scanDocuments} Scan-PDF (manuelle Transkription)`);
  if (pdfCase.normativity === 'include') add(5, 'Normativität eindeutig');
  add(-Math.min(25, Math.floor(pdfCase.pagesKnown / 10)), `Aufwand ${pdfCase.pagesKnown} Seiten`);
  return { score, band: bandOf(score), factors };
}

function hasPdf(entry: ManifestEntry): boolean {
  return (entry.attachments ?? []).some((attachment) => /pdf/iu.test(attachment.mediaType)) || entry.rawDocuments.some((raw) => raw.role === 'pdf' || /pdf/iu.test(raw.contentType)) || entry.textCompleteness === 'pdf-only' || entry.textCompleteness === 'pdf-only-essential-attachments' || entry.textCompleteness === 'essential-attachment-missing';
}

export interface PdfCasesInput {
  manifest: ImportManifest;
  priorities: Map<string, ReviewPriority>;
  reader?: OfflineSourceReader;
  now: string;
  log?: (message: string) => void;
}

export async function buildPdfCasesReport(input: PdfCasesInput): Promise<PdfCasesReport> {
  const cases: PdfCase[] = [];
  const entries = input.manifest.entries.filter(hasPdf).sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const inspections = new Map<string, { inspection: PdfInspection; chars: number; available: PdfDocumentReport['available']; byteLength: number }>();
  for (const [index, entry] of entries.entries()) {
    if (input.log && index % 50 === 0) input.log(`PDF-Fälle ${index + 1}/${entries.length}`);
    const documents: PdfDocumentReport[] = [];
    const seen = new Set<string>();
    const inspect = async (url: string, localSource: string | undefined, sha256: string | undefined): Promise<{ inspection?: PdfInspection; chars?: number; available: PdfDocumentReport['available']; byteLength?: number; sha256?: string }> => {
      const key = sha256 ?? url;
      const cached = inspections.get(key);
      if (cached) return { ...cached, sha256: sha256 ?? undefined };
      if (!input.reader) return { available: 'not-available' };
      const document = await input.reader.read(url, localSource);
      if (!document) return { available: 'not-available' };
      const inspection = inspectPdf(document.bytes);
      const result = { inspection, chars: estimatePdfTextChars(document.bytes), available: localSource && document.retrievedAt === '' ? 'local' as const : 'cache' as const, byteLength: document.bytes.byteLength };
      inspections.set(key, result);
      return { ...result, sha256: document.sha256 };
    };
    const rawByUrl = new Map(entry.rawDocuments.map((raw) => [raw.url, raw]));
    for (const attachment of entry.attachments ?? []) {
      if (!/pdf/iu.test(attachment.mediaType)) continue;
      seen.add(attachment.url);
      const raw = rawByUrl.get(attachment.url);
      const report: PdfDocumentReport = { role: 'attachment', label: attachment.label, url: attachment.url, essential: attachment.essential, handling: attachment.handling, available: 'not-available', notes: [] };
      if (raw) {
        report.sha256 = raw.sha256;
        report.byteLength = raw.byteLength;
      }
      if (attachment.pdf) {
        if (attachment.pdf.pages !== undefined) report.pages = attachment.pdf.pages;
        report.textLayer = attachment.pdf.textLayer;
        report.scanLike = attachment.pdf.scanLike;
        report.encrypted = attachment.pdf.encrypted;
      }
      const inspected = await inspect(attachment.url, raw?.localSource, raw?.sha256);
      report.available = inspected.available;
      if (inspected.inspection) {
        if (inspected.inspection.pages !== undefined) report.pages = inspected.inspection.pages;
        report.textLayer = inspected.inspection.textLayer;
        report.scanLike = inspected.inspection.scanLike;
        report.encrypted = inspected.inspection.encrypted;
        report.notes.push(...inspected.inspection.notes);
        if (!report.sha256 && inspected.sha256) report.sha256 = inspected.sha256;
        if (inspected.byteLength !== undefined) report.byteLength = inspected.byteLength;
      }
      if (inspected.chars !== undefined) report.estimatedTextChars = inspected.chars;
      documents.push(report);
    }
    for (const raw of entry.rawDocuments) {
      if (seen.has(raw.url) || !(raw.role === 'pdf' || /pdf/iu.test(raw.contentType))) continue;
      seen.add(raw.url);
      const report: PdfDocumentReport = { role: entry.textCompleteness === 'pdf-only' ? 'main-text' : 'publication-pdf', label: raw.role === 'pdf' ? 'PDF der Veröffentlichung' : raw.role, url: raw.url, sha256: raw.sha256, byteLength: raw.byteLength, essential: entry.textCompleteness === 'pdf-only', available: 'not-available', notes: [] };
      const inspected = await inspect(raw.url, raw.localSource, raw.sha256);
      report.available = inspected.available;
      if (inspected.inspection) {
        if (inspected.inspection.pages !== undefined) report.pages = inspected.inspection.pages;
        report.textLayer = inspected.inspection.textLayer;
        report.scanLike = inspected.inspection.scanLike;
        report.encrypted = inspected.inspection.encrypted;
        report.notes.push(...inspected.inspection.notes);
      }
      if (inspected.chars !== undefined) report.estimatedTextChars = inspected.chars;
      documents.push(report);
    }
    const priority = input.priorities.get(entry.sourceIdentity) ?? { score: 0, band: bandOf(0), factors: ['keine offenen Review-Befunde'] };
    const partial: Omit<PdfCase, 'transcriptionPriority'> = {
      sourceIdentity: entry.sourceIdentity,
      sourceArea: entry.sourceArea,
      title: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      importStatus: entry.importStatus,
      baselineStatus: entry.baselineStatus,
      mainText: mainTextOf(entry),
      pdfDocuments: documents.length,
      htmlAttachments: (entry.attachments ?? []).filter((attachment) => /html/iu.test(attachment.mediaType)).length,
      pagesKnown: documents.reduce((sum, document) => sum + (document.pages ?? 0), 0),
      textLayerDocuments: documents.filter((document) => document.textLayer === true).length,
      scanDocuments: documents.filter((document) => document.scanLike === true).length,
      unknownDocuments: documents.filter((document) => document.textLayer === undefined || (!document.textLayer && !document.scanLike)).length,
      estimatedTextChars: documents.reduce((sum, document) => sum + (document.estimatedTextChars ?? 0), 0),
      documents,
      reviewPriority: priority,
    };
    if (entry.targetSlug) partial.targetSlug = entry.targetSlug;
    if (entry.normativity) partial.normativity = entry.normativity.decision;
    if (entry.textCompleteness) partial.textCompleteness = entry.textCompleteness;
    cases.push({ ...partial, transcriptionPriority: transcriptionPriority(partial) });
  }
  cases.sort((left, right) => right.transcriptionPriority.score - left.transcriptionPriority.score || compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
  const count = (values: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const value of values) map[value] = (map[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(map).sort(([left], [right]) => left.localeCompare(right)));
  };
  const documents = cases.flatMap((pdfCase) => pdfCase.documents);
  return {
    schemaVersion: PDF_CASES_SCHEMA,
    generatedAt: input.now,
    note: 'Arbeitshilfe für spätere strukturierte Transkriptionen; Seitenzahl, Textlayer und Textumfang sind PDF-Strukturprüfungen ohne Texterkennung. Keine Übernahme ohne geprüfte Transkription (docs/RECHT_NRW_BULK_READINESS.md).',
    summary: {
      cases: cases.length,
      byArea: count(cases.map((pdfCase) => pdfCase.sourceArea)),
      byMainText: count(cases.map((pdfCase) => pdfCase.mainText)),
      documents: documents.length,
      pagesKnown: documents.reduce((sum, document) => sum + (document.pages ?? 0), 0),
      textLayerDocuments: documents.filter((document) => document.textLayer === true).length,
      scanDocuments: documents.filter((document) => document.scanLike === true).length,
      unknownDocuments: documents.filter((document) => document.textLayer === undefined).length,
      notAvailable: documents.filter((document) => document.available === 'not-available').length,
      estimatedTextChars: documents.reduce((sum, document) => sum + (document.estimatedTextChars ?? 0), 0),
    },
    cases,
  };
}

const MAIN_TEXT_LABEL: Record<PdfCase['mainText'], string> = { html: 'HTML + PDF-Anlagen', 'pdf-only': 'Normtext nur PDF', 'html-with-essential-pdf': 'Kopferlass, Regelungsgehalt in PDF-Anlagen', 'essential-missing': 'Anlage „nicht abgedruckt“, nicht verlinkt', 'structured-transcription': 'geprüfte Transkription' };

export function renderPdfCasesMarkdown(report: PdfCasesReport, limit = 400): string {
  const lines: string[] = [];
  lines.push('# PDF-Fälle des RECHT.NRW-Imports', '', `Stand: ${report.generatedAt}. ${report.note}`, '');
  lines.push('## Zusammenfassung', '');
  lines.push(`- Stammnormen mit PDF-Quellen: ${report.summary.cases} (${Object.entries(report.summary.byArea).map(([area, count]) => `${area} ${count}`).join(', ')})`);
  lines.push(`- Regelungsgehalt: ${Object.entries(report.summary.byMainText).map(([kind, count]) => `${MAIN_TEXT_LABEL[kind as PdfCase['mainText']]} ${count}`).join('; ')}`);
  lines.push(`- PDF-Dateien: ${report.summary.documents} (bekannte Seiten ${report.summary.pagesKnown}; Textlayer ${report.summary.textLayerDocuments}, Scan ${report.summary.scanDocuments}, ungeprüft ${report.summary.unknownDocuments}, nicht verfügbar ${report.summary.notAvailable})`);
  lines.push(`- geschätzter Textumfang (Textoperatoren): ${report.summary.estimatedTextChars.toLocaleString('de-DE')} Zeichen`, '');
  lines.push('## Priorisierung für die Transkription', '');
  lines.push('| Rang | Term | Bereich | Titel | Regelungsgehalt | PDF | Seiten | Textlayer | Zeichen (geschätzt) | Status | Score | Faktoren |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [index, pdfCase] of report.cases.slice(0, limit).entries()) {
    const layer = pdfCase.pdfDocuments === 0 ? '–' : `${pdfCase.textLayerDocuments}/${pdfCase.pdfDocuments}${pdfCase.scanDocuments ? ` (Scan ${pdfCase.scanDocuments})` : ''}`;
    lines.push(`| ${index + 1} | ${pdfCase.sourceIdentity} | ${pdfCase.sourceArea} | ${pdfCase.title.replace(/\|/gu, '¦').slice(0, 90)} | ${MAIN_TEXT_LABEL[pdfCase.mainText]} | ${pdfCase.pdfDocuments} | ${pdfCase.pagesKnown} | ${layer} | ${pdfCase.estimatedTextChars.toLocaleString('de-DE')} | ${pdfCase.importStatus} | ${pdfCase.transcriptionPriority.score} (${pdfCase.transcriptionPriority.band}) | ${pdfCase.transcriptionPriority.factors.join('; ')} |`);
  }
  lines.push('', '## Dateien je Fall', '');
  for (const pdfCase of report.cases.slice(0, limit)) {
    lines.push(`### ${pdfCase.sourceIdentity} – ${pdfCase.title.slice(0, 120)}`, '');
    lines.push(`Quelle: ${pdfCase.sourceUrl} · Status ${pdfCase.importStatus} · Stichtag ${pdfCase.baselineStatus}${pdfCase.textCompleteness ? ` · Textvollständigkeit ${pdfCase.textCompleteness}` : ''}${pdfCase.htmlAttachments ? ` · HTML-Anlagen ${pdfCase.htmlAttachments}` : ''}`, '');
    lines.push('| Rolle | Bezeichnung | Seiten | Textlayer | Zeichen (geschätzt) | wesentlich | Behandlung | verfügbar | SHA-256 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const document of pdfCase.documents) {
      lines.push(`| ${document.role} | ${document.label.replace(/\|/gu, '¦')} | ${document.pages ?? '?'} | ${document.textLayer === undefined ? '?' : document.textLayer ? 'ja' : document.scanLike ? 'nein (Scan)' : 'nein'} | ${document.estimatedTextChars?.toLocaleString('de-DE') ?? '?'} | ${document.essential ? 'ja' : 'nein'} | ${document.handling ?? '–'} | ${document.available} | ${document.sha256 ? document.sha256.slice(0, 16) : '–'} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
