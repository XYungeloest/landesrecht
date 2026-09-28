/**
 * Dateinamen eines Zip-Archivs aus dem zentralen Verzeichnis (ohne Entpacken, ohne Fremdabhängigkeit).
 * Namen werden als UTF-8 gelesen und NFC-normalisiert; macOS schreibt sie zerlegt (NFD).
 */
import { readFile } from 'node:fs/promises';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;

export async function listZipEntries(path: string): Promise<string[]> {
  const bytes = await readFile(path);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 0xffff); index -= 1) {
    if (bytes.readUInt32LE(index) === END_OF_CENTRAL_DIRECTORY) { end = index; break; }
  }
  if (end < 0) throw new Error(`${path}: kein Zip-Endverzeichnis gefunden`);
  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let index = 0; index < entries; index += 1) {
    if (bytes.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) throw new Error(`${path}: Zip-Verzeichniseintrag ${index} ungültig`);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    names.push(bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').normalize('NFC'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
