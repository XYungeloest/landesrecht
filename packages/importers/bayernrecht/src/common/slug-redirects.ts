/**
 * Permanente Umleitungen stillgelegter BayWü-Slugs (`packages/legal-core/src/config/slug-redirects.json`, Eintrag
 * `baywue`). Abgeleitet aus `retired` der Slug-Registry; der Worker leitet alte Adressen mit 301 auf den Nachfolger um.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { SLUG_REDIRECTS_SCHEMA } from '@landesrecht/legal-core/config/slug-redirects.ts';

import { TARGET_JURISDICTION } from './constants.ts';
import type { SlugRegistry } from './slug-registry.ts';

export const SLUG_REDIRECTS_PATH = 'packages/legal-core/src/config/slug-redirects.json';

export async function writeSlugRedirects(root: string, registry: Pick<SlugRegistry, 'retired'>): Promise<boolean> {
  const path = join(root, SLUG_REDIRECTS_PATH);
  const stored = await readJsonFile<{ schemaVersion: string; jurisdictions: Record<string, Record<string, string>> }>(path);
  const own = Object.fromEntries([...(registry.retired ?? [])].filter((entry) => entry.successor).sort((left, right) => left.slug.localeCompare(right.slug)).map((entry) => [entry.slug, entry.successor!]));
  const jurisdictions = { ...(stored?.jurisdictions ?? {}) };
  if (Object.keys(own).length > 0) jurisdictions[TARGET_JURISDICTION] = own;
  else delete jurisdictions[TARGET_JURISDICTION];
  const ordered = Object.fromEntries(Object.entries(jurisdictions).sort(([left], [right]) => left.localeCompare(right)));
  return writeJsonAtomic(path, { schemaVersion: SLUG_REDIRECTS_SCHEMA, jurisdictions: ordered });
}
