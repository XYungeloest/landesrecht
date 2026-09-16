/**
 * PDF-Prüfung und PDF-Policy des RECHT.NRW-Imports ohne Netz: Einordnung selbst erzeugter PDF-Dateien
 * (Textlayer unkomprimiert und FlateDecode, reiner Scan, verschlüsselt), Textvollständigkeit (Anlage nur
 * referenziert, Kopferlass mit Regelungsgehalt nur in PDF-Anlagen, „nicht abgedruckt“, geprüfte
 * Transkription), der echte Kopferlass der VV zur LHO sowie die Prüfung strukturierter Transkriptionen.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { assessTextCompleteness, inspectPdf, type AttachmentInput, type TextCompletenessAssessment } from '@landesrecht/importer-recht-nrw/common/pdf.ts';
import { TRANSCRIPTION_SCHEMA, transcriptionIntegrity, usableTranscription, validateTranscription, type StructuredTranscription } from '@landesrecht/importer-recht-nrw/common/transcription.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';
import { parseLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

const encoder = new TextEncoder();
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

type PdfPart = string | Uint8Array;

function concat(parts: readonly PdfPart[]): Uint8Array {
  const chunks = parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : part));
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** Minimale, gültige PDF-Datei mit Querverweistabelle; jedes Objekt besteht aus Teilen (Text oder Bytes). */
function buildPdf(objects: ReadonlyArray<readonly PdfPart[]>, trailerExtra = ''): Uint8Array {
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = chunks[0]!.byteLength;
  objects.forEach((parts, index) => {
    offsets.push(length);
    const chunk = concat([`${index + 1} 0 obj\n`, ...parts, '\nendobj\n']);
    chunks.push(chunk);
    length += chunk.byteLength;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concat(chunks);
}

function stream(dictionary: string, data: PdfPart): PdfPart[] {
  const body = typeof data === 'string' ? encoder.encode(data) : data;
  return [`<< ${dictionary}/Length ${body.byteLength} >>\nstream\n`, body, '\nendstream'];
}

const CATALOG = ['<< /Type /Catalog /Pages 2 0 R >>'];
const PAGES = ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
const TEXT_PAGE = ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'];
const FONT = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const HELLO = 'BT /F1 12 Tf 72 760 Td (Hello) Tj ET';

const textPdf = (): Uint8Array => buildPdf([CATALOG, PAGES, TEXT_PAGE, stream('', HELLO), FONT]);
const flatePdf = (content = HELLO): Uint8Array => buildPdf([CATALOG, PAGES, TEXT_PAGE, stream('/Filter /FlateDecode ', new Uint8Array(deflateSync(Buffer.from(content, 'latin1')))), FONT]);
const scanPdf = (): Uint8Array => buildPdf([
  CATALOG,
  PAGES,
  ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>'],
  stream('', 'q 595 0 0 842 0 0 cm /Im1 Do Q'),
  stream('/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 ', new Uint8Array(64).fill(128)),
]);
const encryptedPdf = (): Uint8Array => buildPdf([
  CATALOG,
  PAGES,
  TEXT_PAGE,
  stream('/Filter /FlateDecode ', Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 11) % 256)),
  FONT,
  ['<< /Filter /Standard /V 2 /R 3 /Length 128 /O <00> /U <00> /P -1340 >>'],
], ' /Encrypt 6 0 R');

const pdfAttachment = (label: string, extra: Partial<AttachmentInput> = {}): AttachmentInput => ({ label, url: `https://recht.nrw.de/system/files/BA/${encodeURIComponent(label.toLowerCase())}.pdf`, mediaType: 'application/pdf', ...extra });
const codes = (assessment: TextCompletenessAssessment): string[] => assessment.findings.map((finding) => finding.code);

const COMPLETE_BODY = '1 Gebühren 1.1 Für Amtshandlungen nach diesem Runderlass werden Gebühren erhoben. 1.2 Die Höhe der Gebühren ergibt sich aus der Anlage. 2 Inkrafttreten Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft.';
const COVER_DECREE = 'Die Verwaltungsvorschriften werden als Anlage zu dieser Veröffentlichung bekannt gegeben. Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft.';
const NOT_PRINTED = 'Die Anlage zu diesem Runderlass wird nicht abgedruckt; sie ist bei der Bezirksregierung einsehbar. Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft.';

describe('PDF-Prüfung: Einordnung selbst erzeugter PDF-Dateien', () => {
  it('unkomprimierter Inhaltsstrom mit BT (Hello) Tj ET → Textlayer, extrahierbar', () => {
    const inspection = inspectPdf(textPdf());
    expect(inspection).toMatchObject({ isPdf: true, version: '1.4', pages: 1, encrypted: false, textOperators: 1, imageXObjects: 0, textLayer: true, scanLike: false, extractable: 'text-layer', notes: [] });
    expect(inspection.fontResources).toBeGreaterThan(0);
  });

  it('FlateDecode-komprimierter Inhaltsstrom → Textoperatoren nach dem Entpacken erkannt', () => {
    const bytes = flatePdf();
    expect(latin1(bytes)).not.toContain('(Hello) Tj');
    expect(inspectPdf(bytes)).toMatchObject({ isPdf: true, pages: 1, textOperators: 1, textLayer: true, scanLike: false, extractable: 'text-layer', notes: [] });
    expect(inspectPdf(flatePdf('BT /F1 12 Tf [(Hel) 20 (lo)] TJ ET BT /F1 12 Tf (Welt) Tj ET')).textOperators).toBe(2);
  });

  it('nur Bildobjekt ohne Textoperatoren → Scan', () => {
    expect(inspectPdf(scanPdf())).toMatchObject({ isPdf: true, pages: 1, fontResources: 0, textOperators: 0, imageXObjects: 1, textLayer: false, scanLike: true, extractable: 'scan' });
  });

  it('verschlüsselte PDF wird erkannt und vermerkt; unlesbare Ströme ergeben keine Einordnung', () => {
    const inspection = inspectPdf(encryptedPdf());
    expect(inspection).toMatchObject({ isPdf: true, encrypted: true, textLayer: false, scanLike: false, extractable: 'unknown' });
    expect(inspection.notes).toEqual(['1 komprimierte Ströme nicht lesbar', 'PDF ist verschlüsselt']);
  });

  it('Bytes ohne PDF-Signatur sind keine PDF', () => {
    expect(inspectPdf(encoder.encode('<!DOCTYPE html><html></html>'))).toMatchObject({ isPdf: false, textLayer: false, scanLike: false, extractable: 'unknown', notes: ['Keine PDF-Signatur'] });
  });
});

describe('PDF-Policy: Textvollständigkeit je Vorschrift', () => {
  it('vollständiger HTML-Text mit bloß referenzierter PDF-Anlage → nicht blockierend, nur Hinweis annex-pdf-only', () => {
    const assessment = assessTextCompleteness({ bodyText: COMPLETE_BODY, bodyUnits: 2, attachments: [pdfAttachment('Gebührentarif (PDF)', { bytes: textPdf() })] });
    expect(assessment).toMatchObject({ completeness: 'html-with-pdf-attachments', blocking: false });
    expect(assessment.findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'annex-pdf-only' })]);
    expect(assessment.findings[0]!.message).toContain('Textlayer vorhanden, strukturierte Extraktion vorbereitet');
    expect(assessment.attachments).toEqual([expect.objectContaining({ essential: false, handling: 'archived-source-only', pdf: { pages: 1, textLayer: true, scanLike: false, encrypted: false } })]);

    const scanned = assessTextCompleteness({ bodyText: COMPLETE_BODY, bodyUnits: 2, attachments: [pdfAttachment('Gebührentarif (PDF)', { bytes: scanPdf() })] });
    expect(scanned.blocking).toBe(false);
    expect(scanned.findings[0]!.message).toContain('Scan, manuelle Transkription nötig');
  });

  it('ohne PDF-Anlagen ist der HTML-Text vollständig', () => {
    expect(assessTextCompleteness({ bodyText: COMPLETE_BODY, bodyUnits: 2, attachments: [] })).toEqual({ completeness: 'html-complete', attachments: [], findings: [], blocking: false });
  });

  it('Kopferlass „als Anlage zu dieser Veröffentlichung bekannt gegeben“ mit nur PDF-Anlagen → blockierend attachment-pdf-only-essential', () => {
    const assessment = assessTextCompleteness({ bodyText: COVER_DECREE, bodyUnits: 0, attachments: [pdfAttachment('Verwaltungsvorschriften (PDF)', { bytes: textPdf() }), pdfAttachment('Muster (PDF)', { bytes: scanPdf() })] });
    expect(assessment).toMatchObject({ completeness: 'pdf-only-essential-attachments', blocking: true });
    expect(assessment.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'attachment-pdf-only-essential' })]);
    expect(assessment.findings[0]!.message).toContain('2 PDF-Anlage(n)');
    expect(assessment.findings[0]!.message).toContain('1 mit Textlayer, 1 Scan');
    expect(assessment.attachments.map((attachment) => [attachment.essential, attachment.handling])).toEqual([[true, 'review'], [true, 'review']]);
  });

  it('„Die Anlage … wird nicht abgedruckt“ mit PDF-Anlage → blockierend', () => {
    const assessment = assessTextCompleteness({ bodyText: NOT_PRINTED, bodyUnits: 0, attachments: [pdfAttachment('Anlage (PDF)')] });
    expect(assessment).toMatchObject({ completeness: 'pdf-only-essential-attachments', blocking: true });
    expect(codes(assessment)).toEqual(['attachment-pdf-only-essential']);
    expect(assessment.findings[0]!.message).toContain('0 mit Textlayer, 0 Scan');
  });

  it('eine geprüfte, verwendbare Transkription aller wesentlichen Anlagen hebt die Blockade auf – eine teilweise nicht', () => {
    const original = flatePdf();
    const transcriptionOk = usableTranscription(validTranscription(sha256(original)), { sha256: sha256(original) }).ok;
    expect(transcriptionOk).toBe(true);

    const complete = assessTextCompleteness({ bodyText: COVER_DECREE, bodyUnits: 0, attachments: [pdfAttachment('Verwaltungsvorschriften (PDF)', { bytes: original, transcription: transcriptionOk })] });
    expect(complete).toMatchObject({ completeness: 'structured-transcription', blocking: false, findings: [] });
    expect(complete.attachments[0]).toMatchObject({ essential: true, handling: 'structured-transcription' });

    const partial = assessTextCompleteness({ bodyText: COVER_DECREE, bodyUnits: 0, attachments: [pdfAttachment('Verwaltungsvorschriften (PDF)', { bytes: original, transcription: true }), pdfAttachment('Muster (PDF)', { bytes: original })] });
    expect(partial.blocking).toBe(true);
    expect(partial.findings[0]!.message).toContain('nur in 1 PDF-Anlage(n)');

    const pending = { ...validTranscription(sha256(original)), review: { status: 'pending' as const } };
    const notUsable = usableTranscription(pending, { sha256: sha256(original) });
    expect(notUsable.ok).toBe(false);
    expect(assessTextCompleteness({ bodyText: COVER_DECREE, bodyUnits: 0, attachments: [pdfAttachment('Verwaltungsvorschriften (PDF)', { bytes: original, transcription: notUsable.ok })] }).blocking).toBe(true);
  });

  it('Anlage in nicht unterstütztem Format → Hinweis attachment-unsupported-format, Behandlung review', () => {
    const assessment = assessTextCompleteness({ bodyText: COMPLETE_BODY, bodyUnits: 2, attachments: [{ label: 'Kalkulationstabelle (XLSX)', url: 'https://recht.nrw.de/system/files/BA/tabelle.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] });
    expect(assessment.findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'attachment-unsupported-format' })]);
    expect(assessment.findings[0]!.message).toContain('weder HTML noch PDF');
    expect(assessment.attachments[0]).toMatchObject({ essential: false, handling: 'review' });
    expect(assessment.blocking).toBe(false);
  });

  it('verschlüsselte PDF-Anlage ohne erkennbaren Textlayer → Behandlung review, Verschlüsselung im Manifest vermerkt', () => {
    const assessment = assessTextCompleteness({ bodyText: COMPLETE_BODY, bodyUnits: 2, attachments: [pdfAttachment('Anlage (PDF)', { bytes: encryptedPdf() })] });
    expect(assessment.attachments[0]).toMatchObject({ handling: 'review', pdf: { pages: 1, textLayer: false, scanLike: false, encrypted: true } });
    expect(assessment.findings[0]!.message).toContain('Textlayer nicht erkennbar');
    expect(assessment.blocking).toBe(false);
  });

  it('Normtext nur als PDF → blockierend attachment-pdf-only-text; mit geprüfter Transkription nicht blockierend', () => {
    const missing = assessTextCompleteness({ bodyText: '', bodyUnits: 0, htmlTextMissing: true, attachments: [] });
    expect(missing).toMatchObject({ completeness: 'pdf-only', blocking: true });
    expect(missing.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'attachment-pdf-only-text' })]);
    expect(assessTextCompleteness({ bodyText: '', bodyUnits: 0, htmlTextMissing: true, mainTextTranscription: true, attachments: [] })).toMatchObject({ completeness: 'structured-transcription', blocking: false, findings: [] });
  });

  it('dokumentierter Override „not-normative“ nimmt eine Anlage aus dem wesentlichen Regelungsgehalt', () => {
    const assessment = assessTextCompleteness({ bodyText: COVER_DECREE, bodyUnits: 0, attachments: [pdfAttachment('Verwaltungsvorschriften (PDF)', { bytes: textPdf() }), pdfAttachment('Ausfüllhinweise (PDF)', { handlingOverride: 'not-normative' })] });
    expect(assessment.attachments.map((attachment) => attachment.essential)).toEqual([true, false]);
    expect(assessment.findings[0]!.message).toContain('nur in 1 PDF-Anlage(n)');
    expect(assessment.blocking).toBe(true);
  });
});

describe('PDF-Policy: Kopferlass der VV zur LHO (archivierte Originalquelle)', () => {
  const LHO = [
    { file: '5268140689b31bf3-version-page.html', url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/08062022-verwaltungsvorschriften-zur-landeshaushaltsordnung-vv-zur-lho' },
    { file: '5e1027e55a2983da-stem-page.html', url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/22042026-verwaltungsvorschriften-zur-landeshaushaltsordnung-vv-zur-lho' },
  ];

  for (const { file, url } of LHO) {
    it(`Kopferlass mit Anlagen nur als PDF ist blockierend und nie als vollständige Norm übernehmbar (${file})`, async () => {
      const page = parseVersionPage(await readFile(join(process.cwd(), 'sources', 'recht-nrw', 'term-33532', file), 'utf8'), url);
      expect(page.title).toBe('Verwaltungsvorschriften zur Landeshaushaltsordnung (VV zur LHO)');
      const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
      const bodyText = parse.bodyTexts.join(' ');
      expect(bodyText).toContain('nicht abgedruckt');
      expect(page.attachments.length).toBeGreaterThan(20);
      expect(page.attachments.every((attachment) => attachment.mediaType === 'application/pdf')).toBe(true);

      // Vorprüfung wie in lrmb/pipeline.ts (Stufe text-completeness) – ohne Anlagenbytes.
      const preliminary = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: page.attachments.map((attachment) => ({ label: attachment.label, url: attachment.url, mediaType: attachment.mediaType })) });
      expect(preliminary).toMatchObject({ completeness: 'pdf-only-essential-attachments', blocking: true });
      expect(codes(preliminary)).toEqual(['attachment-pdf-only-essential']);
      expect(preliminary.attachments.every((attachment) => attachment.essential && attachment.handling === 'review')).toBe(true);

      // Auch mit geladenen Anlagen, die einen Textlayer haben: keine ungeprüfte Übernahme.
      const loaded = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: page.attachments.map((attachment) => ({ label: attachment.label, url: attachment.url, mediaType: attachment.mediaType, bytes: flatePdf() })) });
      expect(loaded.blocking).toBe(true);
      expect(loaded.findings[0]!.message).toContain(`${page.attachments.length} mit Textlayer, 0 Scan`);

      // Eine einzelne geprüfte Transkription reicht nicht; erst alle wesentlichen Anlagen.
      const oneTranscribed = assessTextCompleteness({ bodyText, bodyUnits: parse.stats.units, attachments: page.attachments.map((attachment, index) => ({ label: attachment.label, url: attachment.url, mediaType: attachment.mediaType, transcription: index === 0 })) });
      expect(oneTranscribed.blocking).toBe(true);
    });
  }
});

const ORIGINAL_URL = 'https://recht.nrw.de/system/files/BA/49029-53519-smbl_631_20220606_a_anlagevv.pdf';

function validTranscription(originalSha256: string): StructuredTranscription {
  const body: NormBodyBlock[] = [
    { type: 'heading', text: 'Anhang VV zur LHO' },
    { type: 'subsection', label: '1', title: 'Zu § 23 LHO', children: [{ type: 'paragraphText', text: 'Zuwendungen dürfen nur gewährt werden, wenn der Zuwendungszweck ohne die Zuwendung nicht oder nicht im notwendigen Umfang erreicht werden kann.' }] },
  ];
  return {
    schemaVersion: TRANSCRIPTION_SCHEMA,
    kind: 'structured-transcription',
    sourceIdentity: 'term:33532',
    target: { type: 'attachment', label: 'Anhang VV zur LHO (PDF)' },
    source: { url: ORIGINAL_URL, sha256: originalSha256, mediaType: 'application/pdf', pageRange: '1-12', pageCount: 12 },
    transcribedAt: '2026-09-01',
    transcribedBy: 'Redaktion',
    review: { status: 'verified', reviewedAt: '2026-09-10', reviewedBy: 'Zweitprüfung' },
    integrity: { status: 'checked', checkedAt: '2026-09-10', ...transcriptionIntegrity(body), method: 'Zeichenzahl und SHA-256 des Blockbaums' },
    body,
  };
}

describe('PDF-Transkription: fail-closed Prüfung strukturierter Transkriptionen', () => {
  const ORIGINAL = sha256(flatePdf());
  const valid = validTranscription(ORIGINAL);

  it('vollständig gültige, geprüfte Transkription ist für das passende Original verwendbar', () => {
    expect(validateTranscription(valid)).toEqual([]);
    const usable = usableTranscription(valid, { sha256: ORIGINAL });
    expect(usable.ok).toBe(true);
    expect(usable.reason).toBe(`geprüfte Transkription (Seiten 1-12, ${valid.integrity.characterCount} Zeichen)`);
    expect(validateTranscription({ ...valid, source: { ...valid.source, pageRange: '1-3, 5, 7-9' } })).toEqual([]);
  });

  it('fehlender SHA-256 des Originals → nicht verwendbar', () => {
    const missing = { ...valid, source: { ...valid.source, sha256: '' } };
    expect(validateTranscription(missing)).toEqual(['SHA-256 des Originals fehlt']);
    expect(usableTranscription(missing, { sha256: ORIGINAL })).toEqual({ ok: false, reason: 'SHA-256 des Originals fehlt' });
  });

  it('Primärquelle nicht auf recht.nrw.de → nicht verwendbar', () => {
    for (const url of ['https://www.example.org/anlagevv.pdf', 'http://recht.nrw.de/system/files/BA/anlagevv.pdf', 'https://recht.nrw.de.example.org/anlagevv.pdf']) {
      const foreign = { ...valid, source: { ...valid.source, url } };
      expect(validateTranscription(foreign), url).toEqual(['Transkription ohne amtliche Primärquelle (source.url auf recht.nrw.de)']);
      expect(usableTranscription(foreign, { sha256: ORIGINAL }).ok, url).toBe(false);
    }
  });

  it('ungültiger Seitenbereich → nicht verwendbar', () => {
    for (const pageRange of ['', 'Seite 1 bis 12', '1-', '1–12', 'a-b']) {
      const invalid = { ...valid, source: { ...valid.source, pageRange } };
      expect(validateTranscription(invalid), pageRange).toEqual(['Seitenbereich fehlt oder ist ungültig (z. B. „1-12“)']);
      expect(usableTranscription(invalid, { sha256: ORIGINAL }).ok, pageRange).toBe(false);
    }
  });

  it('Integrität verletzt (Zeichenzahl oder SHA-256 des Blockbaums) → nicht verwendbar', () => {
    const wrongCount = { ...valid, integrity: { ...valid.integrity, characterCount: valid.integrity.characterCount + 1 } };
    expect(validateTranscription(wrongCount)).toEqual([`Integrität: Zeichenzahl ${valid.integrity.characterCount + 1} ≠ ${valid.integrity.characterCount}`]);
    expect(usableTranscription(wrongCount, { sha256: ORIGINAL }).ok).toBe(false);

    const editedBody: NormBodyBlock[] = [...valid.body.slice(0, 1), { type: 'subsection', label: '1', title: 'Zu § 23 LHO', children: [{ type: 'paragraphText', text: 'Zuwendungen dürfen nie gewährt werden, wenn der Zuwendungszweck ohne die Zuwendung nicht oder nicht im notwendigen Umfang erreicht werden kann.' }] }];
    const edited = { ...valid, body: editedBody };
    expect(transcriptionIntegrity(editedBody).characterCount).toBe(valid.integrity.characterCount);
    expect(validateTranscription(edited)).toEqual(['Integrität: SHA-256 des Blockbaums weicht ab']);
    expect(usableTranscription(edited, { sha256: ORIGINAL }).ok).toBe(false);
  });

  it('ungeprüfter oder abgelehnter Prüferstatus, ungeprüfte Integrität oder anderes Original → nicht verwendbar', () => {
    const pending = { ...valid, review: { status: 'pending' as const } };
    expect(validateTranscription(pending)).toEqual([]);
    expect(usableTranscription(pending, { sha256: ORIGINAL })).toEqual({ ok: false, reason: 'Prüferstatus pending' });
    expect(usableTranscription({ ...valid, review: { status: 'rejected', reviewedAt: '2026-09-10' } }, { sha256: ORIGINAL })).toEqual({ ok: false, reason: 'Prüferstatus rejected' });
    expect(validateTranscription({ ...valid, review: { status: 'verified' } })).toEqual(['Geprüfte Transkription ohne Prüfdatum']);
    expect(usableTranscription({ ...valid, integrity: { ...valid.integrity, status: 'unchecked' } }, { sha256: ORIGINAL })).toEqual({ ok: false, reason: 'Integrität nicht geprüft' });
    expect(usableTranscription(valid, { sha256: sha256(textPdf()) })).toEqual({ ok: false, reason: 'Original weicht vom transkribierten Dokument ab (SHA-256)' });
  });

  it('ungültige Struktur, leerer Körper, fehlende Anlagenbezeichnung oder Quellidentität → nicht verwendbar', () => {
    const brokenBody = [{ type: 'paragraphText' }] as NormBodyBlock[];
    const broken = { ...valid, body: brokenBody, integrity: { ...valid.integrity, ...transcriptionIntegrity(brokenBody) } };
    expect(validateTranscription(broken)).toEqual([expect.stringMatching(/^Blockstruktur ungültig: /u)]);
    expect(validateTranscription({ ...valid, body: [] })).toEqual(['leerer Normkörper']);
    expect(validateTranscription({ ...valid, target: { type: 'attachment' } })).toEqual(['Anlagen-Transkription ohne Anlagenbezeichnung']);
    expect(validateTranscription({ ...valid, sourceIdentity: '33532' })).toEqual(['sourceIdentity muss term:<id> sein']);
    expect(validateTranscription({ ...valid, transcribedAt: '' })).toEqual(['Transkriptionsdatum fehlt']);
    for (const transcription of [broken, { ...valid, body: [] }, { ...valid, sourceIdentity: '33532' }]) expect(usableTranscription(transcription, { sha256: ORIGINAL }).ok).toBe(false);
  });
});
