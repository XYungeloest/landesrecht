/**
 * Dateibasierte Loader für den kanonischen Bestand unter
 * content/norms/<jurisdiction>/<slug>/{meta.json,history.json,versions/*.json} und
 * content/publications/<jurisdiction>/<slug>.json.
 *
 * Nur für Node (Skripte, Tests, lokale Entwicklung, Prerendering). Der Worker importiert
 * dieses Modul nie; er liest ausschließlich die D1-Projektion.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { JURISDICTION_IDS, type JurisdictionId } from '../config/jurisdictions.ts';
import { resolveRepositoryRoot } from './repository-root.ts';
import {
  ContentValidationError,
  parseNormHistory,
  parseNormMeta,
  parseNormVersion,
  parsePublication,
  validateNormRecord,
  type NormRecord,
  type Publication,
} from './schema.ts';
import { assertBaselineConsistency } from './versions.ts';

export const NORM_CONTENT_DIR = 'norms';
export const PUBLICATION_CONTENT_DIR = 'publications';

export function getContentRoot(root = resolveRepositoryRoot()): string {
  return join(root, 'content');
}

export function getNormDirectory(jurisdiction: JurisdictionId, slug: string, root = resolveRepositoryRoot()): string {
  return join(getContentRoot(root), NORM_CONTENT_DIR, jurisdiction, slug);
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new ContentValidationError(`${filePath}: enthält ungültiges JSON`);
    throw error;
  }
}

async function listDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function listNormSlugs(jurisdiction: JurisdictionId, root = resolveRepositoryRoot()): Promise<string[]> {
  return listDirectories(join(getContentRoot(root), NORM_CONTENT_DIR, jurisdiction));
}

export async function loadNorm(jurisdiction: JurisdictionId, slug: string, root = resolveRepositoryRoot()): Promise<NormRecord> {
  const directory = getNormDirectory(jurisdiction, slug, root);
  const relative = `content/${NORM_CONTENT_DIR}/${jurisdiction}/${slug}`;
  const meta = parseNormMeta(await readJson(join(directory, 'meta.json')), `${relative}/meta.json`);
  if (meta.slug !== slug) throw new ContentValidationError(`${relative}/meta.json.slug: muss dem Verzeichnisnamen entsprechen`);
  if (meta.jurisdiction !== jurisdiction) throw new ContentValidationError(`${relative}/meta.json.jurisdiction: muss dem Jurisdiktionsverzeichnis „${jurisdiction}“ entsprechen`);

  const history = parseNormHistory(await readJson(join(directory, 'history.json')), `${relative}/history.json`);
  const versionFiles = await listJsonFiles(join(directory, 'versions'));
  const versions = await Promise.all(
    versionFiles.map(async (fileName) => {
      const version = parseNormVersion(await readJson(join(directory, 'versions', fileName)), `${relative}/versions/${fileName}`);
      if (version.versionId !== fileName.replace(/\.json$/u, '')) {
        throw new ContentValidationError(`${relative}/versions/${fileName}.versionId: muss dem Dateinamen entsprechen`);
      }
      return version;
    }),
  );

  const record = validateNormRecord({ meta, history, versions }, relative);
  assertBaselineConsistency(record);
  return record;
}

export async function loadJurisdictionNorms(jurisdiction: JurisdictionId, root = resolveRepositoryRoot()): Promise<NormRecord[]> {
  const slugs = await listNormSlugs(jurisdiction, root);
  const records = await Promise.all(slugs.map((slug) => loadNorm(jurisdiction, slug, root)));
  return records.sort((left, right) => left.meta.title.localeCompare(right.meta.title, 'de'));
}

export async function loadAllNorms(root = resolveRepositoryRoot()): Promise<NormRecord[]> {
  const groups = await Promise.all(JURISDICTION_IDS.map((jurisdiction) => loadJurisdictionNorms(jurisdiction, root)));
  return groups.flat();
}

export async function loadJurisdictionPublications(jurisdiction: JurisdictionId, root = resolveRepositoryRoot()): Promise<Publication[]> {
  const directory = join(getContentRoot(root), PUBLICATION_CONTENT_DIR, jurisdiction);
  const files = await listJsonFiles(directory);
  const publications = await Promise.all(
    files.map(async (fileName) => {
      const relative = `content/${PUBLICATION_CONTENT_DIR}/${jurisdiction}/${fileName}`;
      const publication = parsePublication(await readJson(join(directory, fileName)), relative);
      if (publication.slug !== fileName.replace(/\.json$/u, '')) throw new ContentValidationError(`${relative}.slug: muss dem Dateinamen entsprechen`);
      if (publication.jurisdiction !== jurisdiction) throw new ContentValidationError(`${relative}.jurisdiction: muss „${jurisdiction}“ sein`);
      return publication;
    }),
  );
  return publications.sort((left, right) => right.date.localeCompare(left.date));
}

export async function loadAllPublications(root = resolveRepositoryRoot()): Promise<Publication[]> {
  const groups = await Promise.all(JURISDICTION_IDS.map((jurisdiction) => loadJurisdictionPublications(jurisdiction, root)));
  return groups.flat();
}
