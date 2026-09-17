/**
 * Minimaler ZIP-Leser für die **Prüfung** der Exportpakete des Beispielkorpus.
 *
 * Absichtlich unabhängig vom Paketleser des Parserstrangs (`src/parse/package.ts`): Der Korpus soll
 * belegen, welche Strukturfälle in den abgelegten Paketen tatsächlich stecken. Prüfte er das mit
 * demselben Code, den er prüft, wäre der Beleg zirkulär – ein Fehler im Parser fiele im Korpus nicht
 * auf, sondern würde von ihm bestätigt. Deshalb liest diese Datei die Pakete für sich.
 *
 * Umfang: zentrales Verzeichnis lesen, lokale Köpfe auswerten, `stored` und `deflate` auspacken.
 * Zip64, Verschlüsselung und unbekannte Verfahren werden abgelehnt statt falsch gelesen; in den
 * Exporten von BAYERN.RECHT kommen sie nicht vor.
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  offset: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Verzeichnis eines ZIP-Pakets in Paketreihenfolge. */
export function readZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const data = view(bytes);
  let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= 0 && offset >= bytes.byteLength - 22 - 0xffff; offset -= 1) {
    if (data.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error('Kein ZIP-Paket: Ende des zentralen Verzeichnisses nicht gefunden');
  const entryCount = data.getUint16(end + 10, true);
  const directoryOffset = data.getUint32(end + 16, true);
  if (directoryOffset === 0xffffffff || entryCount === 0xffff) throw new Error('Zip64-Paket – wird nicht gelesen, statt es falsch zu lesen');
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  const decoder = new TextDecoder('utf-8');
  for (let index = 0; index < entryCount; index += 1) {
    if (data.getUint32(cursor, true) !== CENTRAL_FILE_HEADER) throw new Error(`Beschädigtes zentrales Verzeichnis bei Eintrag ${index}`);
    const flags = data.getUint16(cursor + 8, true);
    if ((flags & 0x0001) !== 0) throw new Error('Verschlüsseltes ZIP-Paket – wird nicht gelesen');
    const method = data.getUint16(cursor + 10, true);
    const compressedSize = data.getUint32(cursor + 20, true);
    const uncompressedSize = data.getUint32(cursor + 24, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const extraLength = data.getUint16(cursor + 30, true);
    const commentLength = data.getUint16(cursor + 32, true);
    const offset = data.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, compressedSize, uncompressedSize, method, offset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Inhalt eines Eintrags; nur `stored` (0) und `deflate` (8) kommen in den Exporten vor. */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const data = view(bytes);
  if (data.getUint32(entry.offset, true) !== LOCAL_FILE_HEADER) throw new Error(`Beschädigter lokaler Kopf von ${entry.name}`);
  const nameLength = data.getUint16(entry.offset + 26, true);
  const extraLength = data.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const payload = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return payload;
  if (entry.method === 8) return new Uint8Array(inflateRawSync(payload));
  throw new Error(`${entry.name}: unbekanntes Kompressionsverfahren ${entry.method}`);
}

/**
 * Text eines Eintrags. Die XML-Dateien tragen `encoding="iso-8859-1"` in der Deklaration, sind aber
 * mit einer UTF-8-BOM ausgeliefert (belegt in der Quellen-Discovery). Gelesen wird deshalb als UTF-8,
 * und die BOM wird abgeschnitten – nicht als Zeichen im Text stehen gelassen.
 */
export function readZipEntryText(bytes: Uint8Array, entry: ZipEntry): string {
  return new TextDecoder('utf-8').decode(readZipEntry(bytes, entry)).replace(/^﻿/u, '');
}
