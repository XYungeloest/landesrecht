/**
 * Paketzugriff des Bulk-Laufs – **ausschließlich** aus dem lokalen Cache (`.cache/bayernrecht/`).
 *
 * Der Bulk ruft nichts ab. Beschaffung ist Sache von `fetch-corpus`; was dort nicht angekommen ist,
 * ist hier `skipped-not-cached` und kein Fehler. Das ist keine Bequemlichkeit, sondern die Trennung,
 * die den Lauf wiederholbar macht: Zweimal derselbe Cache heißt zweimal derselbe Bestand, und der
 * Import hängt nicht davon ab, ob das Portal gerade antwortet.
 *
 * Gelesen wird über denselben Cacheschlüssel wie überall im Adapter (`sha256(url).slice(0,40)`,
 * `<schlüssel>.bin` neben `<schlüssel>.json`), damit die Bytes des Beschaffungslaufs, des
 * Beispielkorpus und der Stichtagsklassifikation dieselben sind.
 *
 * **Der SHA-256 wird nachgerechnet, nicht geglaubt.** Der Wert der Begleitdatei ist eine Behauptung
 * über die Bytes; im Manifest steht der Hash der Bytes, die tatsächlich geparst wurden. Weichen
 * beide voneinander ab, ist das ein Befund an dieser einen Norm.
 *
 * Fehlerteilung (sie trägt die Unterscheidung systemisch/normlokal im Runner):
 *   nicht vorhanden          → `undefined`; der Lauf führt die Norm als `skipped-not-cached` weiter
 *   Eintrag beschädigt       → `CachedPackageProblem`; **normlokal**, der Lauf geht weiter
 *   Medium nicht lesbar      → `CacheUnreadableError`; **systemisch**, der Lauf hält an
 * Ein einzelner kaputter Eintrag ist ein Datenfehler, ein nicht lesbares Cacheverzeichnis ein
 * Umgebungsfehler – nur das Zweite entwertet jeden weiteren Versuch dieses Laufs.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { cacheEntryPaths } from '../fetch/cache.ts';

/** Das Cachemedium selbst ist nicht lesbar (Rechte, E/A-Fehler): systemischer Abbruch. */
export class CacheUnreadableError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`Cacheeintrag ${path} nicht lesbar: ${message}`);
    this.name = 'CacheUnreadableError';
    this.path = path;
  }
}

/** Ein vorhandener, aber unbrauchbarer Cacheeintrag – Befund an dieser Norm, kein Laufabbruch. */
export interface CachedPackageProblem {
  problem: string;
}

export interface CachedPackage {
  url: string;
  key: string;
  bytes: Uint8Array;
  /** SHA-256 der gelesenen Bytes – nachgerechnet; genau dieser Wert geht ins Manifest. */
  sha256: string;
  /** SHA-256 laut Begleitdatei (Behauptung des Beschaffungslaufs). */
  declaredSha256: string;
  contentType: string;
  /** Abrufzeitpunkt als ISO-Zeitstempel; ein reines Tagesdatum wird auf Mitternacht ergänzt. */
  retrievedAt: string;
  byteLength: number;
}

export function isCachedPackageProblem(value: CachedPackage | CachedPackageProblem | undefined): value is CachedPackageProblem {
  return value !== undefined && 'problem' in value;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Das Manifest verlangt einen Zeitstempel; ein Tagesdatum wird ergänzt, alles andere abgelehnt. */
export function normalizeRetrievedAt(value: string): string | undefined {
  if (ISO_TIMESTAMP.test(value)) return value;
  if (ISO_DATE.test(value)) return `${value}T00:00:00.000Z`;
  return undefined;
}

function ioProblem(error: unknown): NodeJS.ErrnoException {
  return error as NodeJS.ErrnoException;
}

/**
 * Liest das Exportpaket einer Adresse aus dem Cache. `undefined` heißt: nicht im Cache – der
 * Beschaffungslauf war hier noch nicht.
 */
export async function readCachedPackage(cacheDir: string, url: string): Promise<CachedPackage | CachedPackageProblem | undefined> {
  const paths = cacheEntryPaths(cacheDir, url);
  let raw: string;
  try {
    raw = await readFile(paths.metadata, 'utf8');
  } catch (error) {
    if (ioProblem(error).code === 'ENOENT') return undefined;
    throw new CacheUnreadableError(paths.metadata, (error as Error).message);
  }
  let metadata: { url?: string; contentType?: string; retrievedAt?: string; sha256?: string; byteLength?: number };
  try {
    metadata = JSON.parse(raw) as typeof metadata;
  } catch (error) {
    return { problem: `Begleitdatei ${paths.key}.json ist kein gültiges JSON: ${(error as Error).message}` };
  }
  if (typeof metadata.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(metadata.sha256)) {
    return { problem: `Begleitdatei ${paths.key}.json führt keinen SHA-256` };
  }
  const retrievedAt = normalizeRetrievedAt(String(metadata.retrievedAt ?? ''));
  if (!retrievedAt) return { problem: `Begleitdatei ${paths.key}.json führt keinen brauchbaren Abrufzeitpunkt (${String(metadata.retrievedAt)})` };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(paths.bytes));
  } catch (error) {
    if (ioProblem(error).code === 'ENOENT') return { problem: `Begleitdatei ${paths.key}.json ohne Paketdatei ${paths.key}.bin` };
    throw new CacheUnreadableError(paths.bytes, (error as Error).message);
  }
  if (metadata.byteLength !== undefined && metadata.byteLength !== bytes.byteLength) {
    return { problem: `Cacheeintrag ${paths.key}: Begleitdatei nennt ${metadata.byteLength} Bytes, die Datei hat ${bytes.byteLength}` };
  }
  return {
    url,
    key: paths.key,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    declaredSha256: metadata.sha256,
    contentType: metadata.contentType ?? 'application/zip',
    retrievedAt,
    byteLength: bytes.byteLength,
  };
}
