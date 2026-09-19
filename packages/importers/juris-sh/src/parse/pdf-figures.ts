/**
 * Abbildungen der juris-PDF-Ausgabe: eingebettete Bilder mit Lage auf der Seite und Bildbytes.
 *
 * Grundlage ist `pdftohtml -xml -zoom 1` (poppler): je Seite `<image top left width height src>` in Punkten – demselben
 * Koordinatensystem wie `pdftotext -bbox-layout` – und je Bild eine Datei (PNG bzw. JPEG, verlustfrei aus dem
 * eingebetteten Bild erzeugt). Kein OCR, keine Bildauswertung: Ein Bild wird als `figure`-Block mit inhaltsadressiertem
 * Asset übernommen (SHA-256, Medienart, Pixelmaße, Herkunft „Seite n, Bild k“ der PDF-Ausgabe) – nie als Text.
 *
 * Ob ein Bild übernommen wird, entscheidet der Parser (`juris-pdf.ts`, `placeFigures`): Signets des Dokumentkopfs und
 * das juris-Symbol „Es ist Text als PDF-Datei vorhanden“ sind kein Normtext; ein Bild, das Text überdeckt oder dessen
 * Seitenverhältnis in der Ausgabe verzerrt ist (juris-Satzfehler), bleibt Review.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hasNonSignetImages, POPPLER_TIMEOUT_MS, runPdfimagesList } from './pdf-layout.ts';

export type FigureMediaType = 'image/png' | 'image/jpeg';

export interface PdfImage {
  page: number;
  /** Laufende Nummer des Bildes auf der Seite (1-basiert, Reihenfolge der Ausgabe). */
  index: number;
  /** Lage in Punkten (Ursprung oben links). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sha256: string;
  mediaType: FigureMediaType;
  extension: 'png' | 'jpg';
  byteLength: number;
  /** Pixelmaße des Bildes. */
  width: number;
  height: number;
  /** Herkunft innerhalb der PDF-Ausgabe: `seite-<n>/bild-<k>.<endung>`. */
  sourcePath: string;
}

export interface PdfImageWithBytes extends PdfImage {
  bytes: Uint8Array;
}

/** Pixelmaße aus dem Kopf einer PNG- bzw. JPEG-Datei. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return undefined;
      const marker = bytes[offset + 1]!;
      const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
      // SOF0–SOF15 außer DHT (C4), JPG (C8), DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) + bytes[offset + 8]! };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

/** `<page number>`- und `<image>`-Elemente der XML-Ausgabe von `pdftohtml -xml`. */
export function parsePdftohtmlImages(xml: string): Array<{ page: number; index: number; top: number; left: number; width: number; height: number; src: string }> {
  const images: Array<{ page: number; index: number; top: number; left: number; width: number; height: number; src: string }> = [];
  const pagePattern = /<page number="(\d+)"[^>]*>([\s\S]*?)<\/page>/gu;
  const imagePattern = /<image top="(-?[\d.]+)" left="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" src="([^"]+)"\/>/gu;
  for (const page of xml.matchAll(pagePattern)) {
    let index = 0;
    for (const image of page[2]!.matchAll(imagePattern)) {
      index += 1;
      images.push({ page: Number(page[1]), index, top: Number(image[1]), left: Number(image[2]), width: Number(image[3]), height: Number(image[4]), src: image[5]! });
    }
  }
  return images;
}

/**
 * Alle Bilder der PDF-Ausgabe mit Lage und Bytes. `undefined`, wenn poppler fehlt oder scheitert – dann ist
 * unbekannt, ob Abbildungen fehlen (der Aufrufer macht daraus einen Befund, nie „keine Abbildungen“).
 */
export function runPdfImages(bytes: Uint8Array): PdfImageWithBytes[] | undefined {
  // Ein einzelner Fehlschlag (Zeitlimit, Ressourcen) wird einmal wiederholt; das Ergebnis ist deterministisch.
  return extractPdfImages(bytes) ?? extractPdfImages(bytes);
}

function extractPdfImages(bytes: Uint8Array): PdfImageWithBytes[] | undefined {
  const directory = mkdtempSync(join(tmpdir(), 'juris-sh-img-'));
  try {
    writeFileSync(join(directory, 'input.pdf'), bytes);
    const result = spawnSync('pdftohtml', ['-xml', '-zoom', '1', '-q', join(directory, 'input.pdf'), join(directory, 'out')], { timeout: POPPLER_TIMEOUT_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
    if (result.error || result.status !== 0) return undefined;
    const xml = readFileSync(join(directory, 'out.xml'), 'utf8');
    const files = new Set(readdirSync(directory));
    const images: PdfImageWithBytes[] = [];
    for (const image of parsePdftohtmlImages(xml)) {
      const name = image.src.split('/').at(-1)!;
      if (!files.has(name)) return undefined;
      const data = new Uint8Array(readFileSync(join(directory, name)));
      const extension = /\.jpe?g$/iu.test(name) ? 'jpg' : /\.png$/iu.test(name) ? 'png' : undefined;
      const dimensions = imageDimensions(data);
      if (!extension || !dimensions) return undefined;
      images.push({
        page: image.page,
        index: image.index,
        x0: image.left,
        y0: image.top,
        x1: image.left + image.width,
        y1: image.top + image.height,
        sha256: createHash('sha256').update(data).digest('hex'),
        mediaType: extension === 'png' ? 'image/png' : 'image/jpeg',
        extension,
        byteLength: data.byteLength,
        width: dimensions.width,
        height: dimensions.height,
        sourcePath: `seite-${image.page}/bild-${image.index}.${extension}`,
        bytes: data,
      });
    }
    return images;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Ohne Bytes (Parserergebnis, Berichte). */
export function withoutBytes(image: PdfImageWithBytes): PdfImage {
  const { bytes: _bytes, ...rest } = image;
  return rest;
}

/**
 * Bilder einer Ausgabe für den Parser: leer, wenn sie nur die Kopfsignets trägt; `null`, wenn Bilder vorhanden, aber
 * nicht auslesbar sind (Befund `figure`). Ohne `pdfimages` ist ebenfalls unbekannt, ob Abbildungen fehlen: `null`.
 */
export function readFigureImages(bytes: Uint8Array): PdfImageWithBytes[] | null {
  const listed = runPdfimagesList(bytes);
  if (!listed) return null;
  if (!hasNonSignetImages(listed)) return [];
  return runPdfImages(bytes) ?? null;
}
