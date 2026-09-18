/**
 * Erkennung wiederhergestellter baseline-only-Normen im Bestand – leichtgewichtig, damit Audit und Abdeckung sie
 * zählen können, ohne den Wiederherstellungspfad zu laden.
 *
 * Ein Eintrag ist eine wiederhergestellte heute fehlende Stichtagsnorm, wenn er im Bereich `events` steht, den Weg
 * `reconstructed-from-publications` trägt und auf sein Rezept verweist (`baselineOnly.recipe`).
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import type { ManifestEntry } from '../common/manifest.ts';
import { BASELINE_ONLY_DIR, CANDIDATES_PATH, RECIPE_SCHEMA } from './model.ts';

export interface BaselineOnlyMarker {
  recipe: string;
  eventIds: string[];
  statement: string;
  outcome: 'safe';
}

export function baselineOnlyMarker(entry: ManifestEntry): BaselineOnlyMarker | undefined {
  const marker = (entry as ManifestEntry & { baselineOnly?: BaselineOnlyMarker }).baselineOnly;
  return marker && typeof marker.recipe === 'string' ? marker : undefined;
}

/** Wiederhergestellte heute fehlende Stichtagsnorm? */
export function isBaselineOnlyEntry(entry: ManifestEntry): boolean {
  return entry.sourceArea === 'events' && entry.baselineRecoveryMethod === 'reconstructed-from-publications' && baselineOnlyMarker(entry) !== undefined;
}

/** Ereigniskennungen der bereits übernommenen baseline-only-Normen (für „noch offen“-Zählungen). */
export function restoredBaselineOnlyEventIds(entries: readonly ManifestEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!isBaselineOnlyEntry(entry) || (entry.importStatus !== 'imported' && entry.importStatus !== 'imported-with-warnings')) continue;
    for (const id of baselineOnlyMarker(entry)!.eventIds) ids.add(id);
  }
  return ids;
}

export interface StoredRecipeHead {
  path: string;
  id: string;
  schemaVersion: string;
  base: { url: string; sha256: string };
}

/** Rezeptköpfe unter `data/imports/bayernrecht/baseline-only/` (ohne `candidates.json`). */
export async function readRecipeHeads(root: string): Promise<StoredRecipeHead[]> {
  let files: string[];
  try {
    files = (await readdir(join(root, BASELINE_ONLY_DIR))).filter((file) => file.endsWith('.json') && `${BASELINE_ONLY_DIR}/${file}` !== CANDIDATES_PATH && !file.startsWith('.')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const heads: StoredRecipeHead[] = [];
  for (const file of files) {
    const path = `${BASELINE_ONLY_DIR}/${file}`;
    const recipe = await readJsonFile<{ id?: string; schemaVersion?: string; base?: { url?: string; sha256?: string } }>(join(root, path));
    heads.push({ path, id: recipe?.id ?? '', schemaVersion: recipe?.schemaVersion ?? '', base: { url: recipe?.base?.url ?? '', sha256: recipe?.base?.sha256 ?? '' } });
  }
  return heads;
}

export { RECIPE_SCHEMA };
