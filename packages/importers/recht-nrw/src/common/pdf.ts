/**
 * PDF-Prüfung und PDF-Policy (docs/RECHT_NRW_BULK_READINESS.md, docs/LEGAL_SCOPE.md).
 *
 * `inspectPdf` liest ohne Abhängigkeiten die Struktur einer PDF-Datei: Seitenzahl, Verschlüsselung,
 * Schriften, Textoperatoren (auch in Flate-komprimierten Inhalts- und Objektströmen) und Bildobjekte.
 * Daraus folgt nur eine Einordnung (Textlayer, Scan, unklar) – keine Texterkennung, keine OCR.
 *
 * `assessTextCompleteness` entscheidet je Vorschrift:
 *   html-complete                    Normtext vollständig im HTML
 *   html-with-pdf-attachments        Normtext im HTML, Anlagen (auch normative) nur als PDF:
 *                                    Übernahme erlaubt; Anlagen unverändert archiviert und als Quelle der
 *                                    Fassung referenziert; Review `attachment` (nicht blockierend)
 *   pdf-only-essential-attachments   wesentlicher Regelungsgehalt nur in PDF-Anlagen (Kopferlass):
 *                                    keine Übernahme, blockierender Review, bis eine geprüfte strukturierte
 *                                    Transkription vorliegt
 *   pdf-only                         Normtext nur als PDF: wie oben
 *   structured-transcription         eine geprüfte Transkription ersetzt den fehlenden HTML-Text
 * Textbasierte PDFs sind für einen strukturierten Extraktionspfad vorbereitet (Textlayer erkannt), werden
 * aber nie ungeprüft übernommen; Scan-PDFs gehen in den manuellen Transkriptionsworkflow.
 */
import { inflateSync } from 'node:zlib';

import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import type { ManifestAttachment, TextCompleteness } from './manifest.ts';

export interface PdfInspection {
  isPdf: boolean;
  version?: string;
  pages?: number;
  encrypted: boolean;
  fontResources: number;
  textOperators: number;
  imageXObjects: number;
  textLayer: boolean;
  scanLike: boolean;
  extractable: 'text-layer' | 'scan' | 'unknown';
  notes: string[];
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function countTextOperators(content: string): number {
  let count = 0;
  for (const block of content.matchAll(/\bBT\b([\s\S]*?)\bET\b/gu)) count += countMatches(block[1]!, /(?:\)|\]|>)\s*(?:Tj|TJ|'|")/gu);
  return count;
}

export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const text = latin1(bytes);
  const header = /^%PDF-(\d\.\d)/u.exec(text.slice(0, 1024));
  const inspection: PdfInspection = { isPdf: Boolean(header), encrypted: false, fontResources: 0, textOperators: 0, imageXObjects: 0, textLayer: false, scanLike: false, extractable: 'unknown', notes: [] };
  if (!header) {
    inspection.notes.push('Keine PDF-Signatur');
    return inspection;
  }
  inspection.version = header[1]!;
  inspection.encrypted = /\/Encrypt\b/u.test(text);
  const views = [text];
  let undecodable = 0;
  for (const match of text.matchAll(/<<((?:(?!>>\s*stream)[\s\S]){0,2000})>>\s*stream\r?\n/gu)) {
    const dictionary = match[1]!;
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    if (/\/Subtype\s*\/Image/u.test(dictionary)) continue;
    if (!/\/Filter\s*\/FlateDecode/u.test(dictionary)) continue;
    try {
      views.push(latin1(inflateSync(bytes.subarray(start, end))));
    } catch {
      undecodable += 1;
    }
  }
  if (undecodable > 0) inspection.notes.push(`${undecodable} komprimierte Ströme nicht lesbar`);
  const all = views.join('\n');
  inspection.pages = countMatches(all, /\/Type\s*\/Page(?![s\w])/gu) || undefined;
  inspection.fontResources = countMatches(all, /\/Type\s*\/Font\b/gu) + countMatches(all, /\/Font\s*<</gu);
  inspection.imageXObjects = countMatches(all, /\/Subtype\s*\/Image\b/gu);
  inspection.textOperators = views.slice(1).reduce((sum, view) => sum + countTextOperators(view), countTextOperators(text));
  inspection.textLayer = inspection.textOperators > 0 && inspection.fontResources > 0;
  inspection.scanLike = !inspection.textLayer && inspection.imageXObjects > 0;
  inspection.extractable = inspection.textLayer ? 'text-layer' : inspection.scanLike ? 'scan' : 'unknown';
  if (inspection.encrypted) inspection.notes.push('PDF ist verschlüsselt');
  return inspection;
}

/** Hinweise im HTML-Text, dass der Regelungsgehalt in den Anlagen steht (Kopferlass, „nicht abgedruckt“). */
const ESSENTIAL_ATTACHMENT_REFERENCES: readonly RegExp[] = [
  /\b(?:werden|wird|sind|ist)\s+(?:[^.]{0,60}\s)?nicht\s+abgedruckt\b/u,
  /\b(?:Verwaltungsvorschrift(?:en)?|Richtlinie[n]?|Bestimmungen|Vorschriften|Regelungen|VV)\b[^.]{0,160}?\b(?:als\s+Anlagen?|in\s+(?:der|den)\s+Anlagen?)\s+(?:zu\s+dieser\s+Veröffentlichung\s+)?(?:beigefügt|einsehbar|veröffentlicht|bekannt\s*gegeben)\b/u,
];

export interface AttachmentInput {
  label: string;
  url: string;
  mediaType: string;
  bytes?: Uint8Array;
  /** Geprüfte strukturierte Transkription vorhanden und nutzbar. */
  transcription?: boolean;
  /** Dokumentierter Override `attachmentHandling`. */
  handlingOverride?: 'archived-source-only' | 'structured-transcription' | 'not-normative';
}

export interface TextCompletenessInput {
  /** Normtext ohne Kopf und Fundstellenverlauf. */
  bodyText: string;
  bodyUnits: number;
  /** Kein HTML-Normtext vorhanden (nur PDF der Veröffentlichung). */
  htmlTextMissing?: boolean;
  mainTextTranscription?: boolean;
  attachments: AttachmentInput[];
}

export interface TextCompletenessAssessment {
  completeness: TextCompleteness;
  attachments: ManifestAttachment[];
  findings: ImportFinding[];
  /** Blockiert die Übernahme als vollständige Norm. */
  blocking: boolean;
}

export const SHORT_BODY_CHARACTERS = 1_500;

export function assessTextCompleteness(input: TextCompletenessInput): TextCompletenessAssessment {
  const findings: ImportFinding[] = [];
  const bodyText = input.bodyText.replace(/\s+/gu, ' ').trim();
  const references = ESSENTIAL_ATTACHMENT_REFERENCES.filter((pattern) => pattern.test(bodyText));
  const pdfAttachments = input.attachments.filter((attachment) => /pdf/iu.test(attachment.mediaType));
  // Kopferlass: der Text erklärt ausdrücklich, dass die Vorschrift selbst in den Anlagen steht. Ein bloßer
  // Verweis auf eine Anlage („Die Gebühren ergeben sich aus der Anlage“) macht den HTML-Text nicht unvollständig.
  const coverDecree = pdfAttachments.length > 0 && references.length > 0;
  const attachments: ManifestAttachment[] = input.attachments.map((attachment) => {
    const pdf = /pdf/iu.test(attachment.mediaType);
    const html = /html/iu.test(attachment.mediaType);
    const inspection = pdf && attachment.bytes ? inspectPdf(attachment.bytes) : undefined;
    const essential = pdf && coverDecree && attachment.handlingOverride !== 'not-normative';
    let handling: ManifestAttachment['handling'] = pdf ? 'archived-source-only' : html ? 'html-annex' : 'review';
    if (attachment.transcription) handling = 'structured-transcription';
    else if (essential || (inspection && !inspection.textLayer && !inspection.scanLike)) handling = 'review';
    if (!pdf && !html && !attachment.transcription) findings.push({ severity: 'warning', code: 'attachment-unsupported-format', message: `Anlage „${attachment.label}“ (${attachment.mediaType}) ist weder HTML noch PDF; archiviert, Übernahme manuell prüfen` });
    const entry: ManifestAttachment = { label: attachment.label, url: attachment.url, mediaType: attachment.mediaType, essential, handling };
    if (inspection) entry.pdf = { ...(inspection.pages !== undefined ? { pages: inspection.pages } : {}), textLayer: inspection.textLayer, scanLike: inspection.scanLike, encrypted: inspection.encrypted };
    return entry;
  });

  if (input.htmlTextMissing) {
    if (input.mainTextTranscription) return { completeness: 'structured-transcription', attachments, findings, blocking: false };
    findings.push({ severity: 'error', code: 'attachment-pdf-only-text', message: 'Normtext liegt nur als PDF vor; Übernahme erst mit geprüfter strukturierter Transkription (docs/RECHT_NRW_BULK_READINESS.md)' });
    return { completeness: 'pdf-only', attachments, findings, blocking: true };
  }
  // „… nicht abgedruckt“, aber die Seite verlinkt überhaupt keine Anlage: der Regelungsgehalt fehlt vollständig.
  if (input.attachments.length === 0 && ESSENTIAL_ATTACHMENT_REFERENCES[0]!.test(bodyText)) {
    findings.push({ severity: 'error', code: 'attachment-missing-essential', message: 'Der Text erklärt Bestandteile als „nicht abgedruckt“, die Seite verlinkt aber keine Anlage; Text unvollständig, keine Übernahme' });
    return { completeness: 'essential-attachment-missing', attachments, findings, blocking: true };
  }
  if (coverDecree) {
    const untranscribed = attachments.filter((attachment) => attachment.essential && attachment.handling !== 'structured-transcription');
    if (untranscribed.length === 0) {
      // Vollständig nur, wenn tatsächlich transkribiert wurde; als nicht normativ markierte Anlagen bleiben Quellen.
      const transcribed = attachments.some((attachment) => attachment.handling === 'structured-transcription');
      return { completeness: transcribed ? 'structured-transcription' : 'html-with-pdf-attachments', attachments, findings, blocking: false };
    }
    const scans = untranscribed.filter((attachment) => attachment.pdf?.scanLike).length;
    const textPdfs = untranscribed.filter((attachment) => attachment.pdf?.textLayer).length;
    findings.push({ severity: 'error', code: 'attachment-pdf-only-essential', message: `Wesentlicher Regelungsgehalt steht nur in ${untranscribed.length} PDF-Anlage(n) (${references.length > 0 ? 'Text verweist auf die Anlagen' : 'kurzer Kopferlass'}; ${textPdfs} mit Textlayer, ${scans} Scan); keine Übernahme als vollständige Norm, strukturierte Transkription erforderlich` });
    return { completeness: 'pdf-only-essential-attachments', attachments, findings, blocking: true };
  }
  if (pdfAttachments.length > 0) {
    for (const attachment of attachments.filter((entry) => /pdf/iu.test(entry.mediaType) && entry.handling !== 'structured-transcription')) {
      const kind = attachment.pdf ? (attachment.pdf.textLayer ? 'Textlayer vorhanden, strukturierte Extraktion vorbereitet' : attachment.pdf.scanLike ? 'Scan, manuelle Transkription nötig' : 'Textlayer nicht erkennbar') : 'nicht geprüft';
      findings.push({ severity: 'warning', code: 'annex-pdf-only', message: `Anlage „${attachment.label}“ liegt nur als PDF vor (${kind}); unverändert archiviert und als Quelle referenziert, nicht als Text übernommen` });
    }
    return { completeness: 'html-with-pdf-attachments', attachments, findings, blocking: false };
  }
  return { completeness: 'html-complete', attachments, findings, blocking: false };
}
