/**
 * Textextraktion für das Inventar: PDF über poppler (`pdftotext`, `pdfinfo`), DOCX über das enthaltene
 * `word/document.xml`, Text unverändert. Es wird nie OCR ausgeführt: Ein PDF ohne Textebene bleibt als Scan
 * gekennzeichnet (`textLayer: none`).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TextLayerStatus = 'text' | 'sparse' | 'none' | 'not-applicable';

export interface ExtractedText {
  /** Text mit Layouterhalt (Spalten, Tabellen) – Grundlage der Sichtprüfung. */
  layout: string;
  /** Lesefolge ohne Layout – Grundlage der Volltextsuche im Inventar. */
  raw: string;
  pageCount?: number;
  /** Zeichen je Seite (ohne Leerraum); Grundlage der Textebenen-Einstufung. */
  charactersPerPage?: number;
  textLayer: TextLayerStatus;
  /** Werkzeug und Version (Reproduzierbarkeit). */
  tool: string;
  pdfInfo?: Record<string, string>;
}

let toolVersion: string | undefined;

async function pdftotextVersion(): Promise<string> {
  if (toolVersion) return toolVersion;
  try {
    const { stderr, stdout } = await execFileAsync('pdftotext', ['-v']);
    toolVersion = `${stderr || stdout}`.split('\n')[0]?.trim() || 'pdftotext';
  } catch {
    toolVersion = 'pdftotext (Version unbekannt)';
  }
  return toolVersion;
}

async function pdfInfo(path: string): Promise<Record<string, string>> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [path], { maxBuffer: 1 << 20 });
    const info: Record<string, string> = {};
    for (const line of stdout.split('\n')) {
      const index = line.indexOf(':');
      if (index < 0) continue;
      info[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return info;
  } catch {
    return {};
  }
}

async function pdftotext(path: string, layout: boolean): Promise<string> {
  const { stdout } = await execFileAsync('pdftotext', [...(layout ? ['-layout'] : []), '-enc', 'UTF-8', path, '-'], { maxBuffer: 64 << 20 });
  // Google-Docs-PDFs tragen Nullbreite-Leerzeichen (U+200B) um jedes Wort; sie sind kein Text.
  return stdout.replace(/​/gu, '').replace(/\f/gu, '\n\f\n');
}

function classifyTextLayer(text: string, pageCount: number | undefined): { status: TextLayerStatus; charactersPerPage: number } {
  const characters = text.replace(/\s+/gu, '').length;
  const pages = pageCount && pageCount > 0 ? pageCount : 1;
  const charactersPerPage = Math.round(characters / pages);
  if (characters === 0) return { status: 'none', charactersPerPage };
  // Unter 150 Zeichen je Seite ist das Dokument entweder ein Scan mit Restzeichen oder ein Deckblatt.
  return { status: charactersPerPage < 150 ? 'sparse' : 'text', charactersPerPage };
}

export async function extractPdf(path: string): Promise<ExtractedText> {
  const info = await pdfInfo(path);
  const pageCount = info.Pages ? Number.parseInt(info.Pages, 10) : undefined;
  const [layout, raw] = await Promise.all([pdftotext(path, true), pdftotext(path, false)]);
  const { status, charactersPerPage } = classifyTextLayer(raw, pageCount);
  return { layout, raw, ...(pageCount !== undefined ? { pageCount } : {}), charactersPerPage, textLayer: status, tool: await pdftotextVersion(), pdfInfo: info };
}

/** DOCX: `word/document.xml` entpacken, Absätze (`w:p`) als Zeilen, Tabellenzellen mit Tabulator. */
export async function extractDocx(path: string): Promise<ExtractedText> {
  const { stdout } = await execFileAsync('unzip', ['-p', path, 'word/document.xml'], { maxBuffer: 64 << 20 });
  const paragraphs = stdout
    .replace(/<w:tab\/>/gu, '\t')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<\/w:tc>/gu, '\t')
    .replace(/<w:br[^>]*\/>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'")
    .replace(/[ \t]+\n/gu, '\n');
  const { charactersPerPage } = classifyTextLayer(paragraphs, 1);
  return { layout: paragraphs, raw: paragraphs, charactersPerPage, textLayer: 'not-applicable', tool: 'unzip word/document.xml' };
}

export async function extractPlainText(bytes: Uint8Array): Promise<ExtractedText> {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\r\n?/gu, '\n');
  const { charactersPerPage } = classifyTextLayer(text, 1);
  return { layout: text, raw: text, charactersPerPage, textLayer: 'not-applicable', tool: 'utf-8' };
}

export const SUPPORTED_MEDIA_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
};

export function mediaTypeFor(fileName: string, bytes: Uint8Array): string {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (head.startsWith('%PDF')) return 'application/pdf';
  if (head.startsWith('PK') && extension === 'docx') return SUPPORTED_MEDIA_TYPES.docx!;
  // Eine „.pdf“/„.docx“ ohne passende Signatur ist keine PDF/DOCX – nicht nach der Endung raten.
  if (extension === 'pdf' || extension === 'docx') return 'application/octet-stream';
  return SUPPORTED_MEDIA_TYPES[extension] ?? 'application/octet-stream';
}
