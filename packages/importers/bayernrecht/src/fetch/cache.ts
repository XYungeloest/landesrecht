/**
 * Cachezugriff des Beschaffungslaufs (`fetch-corpus`).
 *
 * Der Lauf legt nichts Eigenes an: Er benutzt denselben Cache wie jeder andere Abruf des Adapters
 * (`.cache/bayernrecht/`, Schlüssel `sha256(url).slice(0,40)`, `<schlüssel>.bin` + `<schlüssel>.json`),
 * damit die bereits geladenen Pakete des Beispielkorpus zählen und ein späterer Parserlauf dieselben
 * Bytes sieht. Gelesen wird hier nur **beschreibend**: Gibt es den Eintrag, wie groß ist er, welchen
 * SHA-256 hat er laut Begleitdatei, beginnt er mit der ZIP-Signatur?
 *
 * Bewusst wird beim Wiederanlauf **nicht** der ganze Eintrag gelesen und nachgehasht: Der Bestand
 * umfasst mehrere Gigabyte, und ein Wiederanlauf soll Sekunden dauern, nicht Minuten. Geprüft werden
 * Vorhandensein, Größe (Begleitdatei gegen Datei) und die ersten Bytes. Weicht die Größe ab, gilt der
 * Eintrag als beschädigt – das ist ein Befund, kein stiller Neuabruf.
 *
 * Geschrieben wird hier nur in einem Fall: Eine Antwort, die kein ZIP ist, wird aus dem Cache entfernt,
 * damit ein Wiederanlauf sie erneut versucht statt Müll für einen Bestand zu halten.
 */
import { open, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

/** Lokale Signatur eines ZIP-Pakets (`PK\x03\x04`); leeres Archiv: `PK\x05\x06`. */
export const ZIP_MAGIC = [0x50, 0x4b] as const;

export interface CacheEntryPaths {
  key: string;
  bytes: string;
  metadata: string;
  notFound: string;
}

export function cacheEntryPaths(cacheDir: string, url: string): CacheEntryPaths {
  const key = cacheKey(url);
  return { key, bytes: join(cacheDir, `${key}.bin`), metadata: join(cacheDir, `${key}.json`), notFound: join(cacheDir, `${key}.404.json`) };
}

/** Begleitdatei eines Cacheeintrags, soweit der Beschaffungslauf sie braucht. */
export interface CachedPackage {
  url: string;
  status: number;
  contentType: string;
  retrievedAt: string;
  sha256: string;
  byteLength: number;
  /** Erste Bytes der Datei – Grundlage der ZIP-Signaturprüfung. */
  magic: Uint8Array;
}

/** Ein vorhandener Cacheeintrag, der nicht benutzbar ist (Größe passt nicht zur Begleitdatei). */
export interface CorruptCacheEntry {
  corrupt: string;
}

export function isCorruptCacheEntry(value: CachedPackage | CorruptCacheEntry | undefined): value is CorruptCacheEntry {
  return value !== undefined && 'corrupt' in value;
}

async function readMagic(path: string, length = 4): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Beginnen die Bytes mit der ZIP-Signatur? */
export function hasZipMagic(magic: Uint8Array): boolean {
  return magic.length >= 2 && magic[0] === ZIP_MAGIC[0] && magic[1] === ZIP_MAGIC[1];
}

/** Nennt der Content-Type ein ZIP? `application/zip`, `application/x-zip-compressed`, … */
export function isZipContentType(contentType: string): boolean {
  return /zip/iu.test(contentType);
}

/**
 * Beschreibt den Cacheeintrag einer Adresse, ohne ihn vollständig zu lesen. `undefined` heißt: nicht
 * im Cache (der Lauf ruft ab). `{ corrupt }` heißt: vorhanden, aber unbrauchbar – ein Befund.
 */
export async function peekCachedPackage(cacheDir: string, url: string): Promise<CachedPackage | CorruptCacheEntry | undefined> {
  const paths = cacheEntryPaths(cacheDir, url);
  let metadata: Partial<CachedPackage> & { byteLength?: number };
  try {
    metadata = JSON.parse(await readFile(paths.metadata, 'utf8')) as Partial<CachedPackage>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return { corrupt: `Begleitdatei ${paths.key}.json nicht lesbar: ${(error as Error).message}` };
  }
  let size: number;
  try {
    size = (await stat(paths.bytes)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { corrupt: `Begleitdatei ${paths.key}.json ohne Paketdatei ${paths.key}.bin` };
    throw error;
  }
  if (typeof metadata.sha256 !== 'string' || metadata.sha256.length !== 64) return { corrupt: `Cacheeintrag ${paths.key} ohne SHA-256 in der Begleitdatei` };
  if (metadata.byteLength !== undefined && metadata.byteLength !== size) return { corrupt: `Cacheeintrag ${paths.key}: Begleitdatei nennt ${metadata.byteLength} Bytes, die Datei hat ${size}` };
  return {
    url: metadata.url ?? url,
    status: metadata.status ?? 200,
    contentType: metadata.contentType ?? 'application/octet-stream',
    retrievedAt: metadata.retrievedAt ?? '',
    sha256: metadata.sha256,
    byteLength: size,
    magic: await readMagic(paths.bytes),
  };
}

/** Entfernt einen Cacheeintrag (nur für Antworten, die kein ZIP sind – sonst wird nie gelöscht). */
export async function removeCachedPackage(cacheDir: string, url: string): Promise<void> {
  const paths = cacheEntryPaths(cacheDir, url);
  await rm(paths.bytes, { force: true });
  await rm(paths.metadata, { force: true });
}
