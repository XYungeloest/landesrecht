/**
 * Dateizugriff der Konsolidierung: rohe Normdateien (unnormalisiertes JSON, Schlüsselreihenfolge erhalten),
 * Serialisierung wie die Importer (`JSON.stringify(value, null, 2) + '\n'`), Prüfsummen und Ablageorte.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { ContentValidationError } from '@landesrecht/legal-core/lib/schema.ts';

import { SIMULATION_DATA_DIR } from '../common/paths.ts';

export type RawObject = Record<string, unknown>;

export interface RawVersionFile {
  versionId: string;
  raw: RawObject;
  text: string;
}

/** Roher Normdatensatz von der Platte: Reihenfolge und Wortlaut der Dateien unverändert. */
export interface RawNorm {
  slug: string;
  meta: RawObject;
  metaText: string;
  history: RawObject;
  historyText: string;
  versions: RawVersionFile[];
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function normRelativeDir(jurisdiction: JurisdictionId, slug: string): string {
  return `content/norms/${jurisdiction}/${slug}`;
}

export function actsDir(jurisdiction: JurisdictionId): string {
  return `${SIMULATION_DATA_DIR}/${jurisdiction}/acts`;
}

export function amendmentsDir(jurisdiction: JurisdictionId): string {
  return `${SIMULATION_DATA_DIR}/${jurisdiction}/amendments`;
}

export function manifestPath(jurisdiction: JurisdictionId): string {
  return `${SIMULATION_DATA_DIR}/${jurisdiction}/consolidation-manifest.json`;
}

export function isBaselineVersionFile(fileName: string): boolean {
  return fileName === `${SIMULATION_BASELINE_DATE}.json`;
}

export async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function parseJsonText(text: string, path: string): RawObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ContentValidationError(`${path}: enthält ungültiges JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ContentValidationError(`${path}: muss ein JSON-Objekt sein`);
  return value as RawObject;
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function listDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Liest eine gespeicherte Norm roh; `null`, wenn das Verzeichnis nicht existiert. */
export async function readRawNorm(root: string, jurisdiction: JurisdictionId, slug: string): Promise<RawNorm | null> {
  const relative = normRelativeDir(jurisdiction, slug);
  const directory = join(root, relative);
  const metaText = await readTextIfExists(join(directory, 'meta.json'));
  if (metaText === undefined) return null;
  const historyText = await readTextIfExists(join(directory, 'history.json'));
  if (historyText === undefined) throw new ContentValidationError(`${relative}/history.json: fehlt`);
  const versions: RawVersionFile[] = [];
  for (const fileName of await listJsonFiles(join(directory, 'versions'))) {
    const text = await readFile(join(directory, 'versions', fileName), 'utf8');
    const raw = parseJsonText(text, `${relative}/versions/${fileName}`);
    const versionId = fileName.replace(/\.json$/u, '');
    if (raw.versionId !== versionId) throw new ContentValidationError(`${relative}/versions/${fileName}.versionId: muss dem Dateinamen entsprechen`);
    versions.push({ versionId, raw, text });
  }
  return {
    slug,
    meta: parseJsonText(metaText, `${relative}/meta.json`),
    metaText,
    history: parseJsonText(historyText, `${relative}/history.json`),
    historyText,
    versions,
  };
}
