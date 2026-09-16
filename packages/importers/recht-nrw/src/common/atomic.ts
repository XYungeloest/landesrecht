/**
 * Atomare Dateischreibvorgänge für Checkpoints des Bulkimports: Temp-Datei im Zielverzeichnis →
 * schreiben → fsync → umbenennen → Verzeichnis-fsync (soweit das Dateisystem es erlaubt). Ein
 * Abbruch (Ctrl-C, Absturz, Stromausfall) hinterlässt entweder die alte oder die neue Datei, nie
 * eine halbe JSON-Datei. Temp-Dateien tragen das Präfix `.tmp-` und werden beim Resume entfernt.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const TEMP_PREFIX = '.tmp-';

async function fsyncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Nicht jedes Dateisystem erlaubt fsync auf Verzeichnissen; die Umbenennung bleibt atomar.
  }
}

/** Schreibt Bytes oder Text atomar. Unveränderte Inhalte werden nicht neu geschrieben (keine mtime-Änderung). */
export async function writeFileAtomic(target: string, data: string | Uint8Array, options: { skipIfUnchanged?: boolean } = {}): Promise<boolean> {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true });
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (options.skipIfUnchanged !== false) {
    try {
      const existing = await readFile(target);
      if (existing.equals(bytes)) return false;
    } catch {
      // Datei existiert noch nicht.
    }
  }
  const temp = join(directory, `${TEMP_PREFIX}${basename(target)}-${process.pid}-${randomBytes(4).toString('hex')}`);
  const handle = await open(temp, 'w');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  await fsyncDirectory(directory);
  return true;
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonAtomic(target: string, value: unknown): Promise<boolean> {
  return writeFileAtomic(target, jsonText(value));
}

/** Liest JSON; fehlende Datei → `undefined`, beschädigte Datei → Fehler mit Pfad (systemisch). */
export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new CorruptStateError(file, (error as Error).message);
  }
}

/** Beschädigte Zustandsdatei (Manifest, Queue, Enumeration): systemischer Fehler, der Lauf bricht ab. */
export class CorruptStateError extends Error {
  readonly file: string;

  constructor(file: string, message: string) {
    super(`Beschädigte Zustandsdatei ${file}: ${message}`);
    this.name = 'CorruptStateError';
    this.file = file;
  }
}

/** Entfernt liegengebliebene Temp-Dateien (rekursiv) nach einem harten Abbruch. */
export async function removeStaleTempFiles(directory: string): Promise<string[]> {
  const removed: string[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith(TEMP_PREFIX)) {
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    } else if (entry.isDirectory()) {
      removed.push(...(await removeStaleTempFiles(path)));
    }
  }
  return removed;
}
