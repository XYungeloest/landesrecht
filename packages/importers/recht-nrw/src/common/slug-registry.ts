/**
 * Dauerhafte Slugvergabe für den West-Bestand (`data/imports/recht-nrw/slug-registry.json`).
 *
 *  - Reservierung je Quellidentität: ein einmal vergebener Slug bleibt – auch wenn eine spätere
 *    Quellfassung eine andere Abkürzung oder Kurzbezeichnung trägt.
 *  - Kollisionen werden deterministisch gelöst: `<kandidat>-<term-id>` (nur bei echter Kollision mit
 *    einer anderen Quellidentität oder einem fremden Verzeichnis, z. B. einer redaktionellen Norm).
 *  - Jede Kollision wird im Importlauf als Review-Hinweis (`slug-collision`) dokumentiert.
 *
 * Die Reihenfolge der Erstvergabe folgt der sortierten Enumeration; damit ist auch die Kollisionsauflösung
 * bei Wiederholung identisch.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from './atomic.ts';
import { IMPORT_DATA_DIR, isImportedStatus, type ImportManifest } from './manifest.ts';

export const SLUG_REGISTRY_SCHEMA = 'recht-nrw-slug-registry/1' as const;
export const SLUG_REGISTRY_PATH = join(IMPORT_DATA_DIR, 'slug-registry.json');

export interface SlugRegistryEntry {
  slug: string;
  sourceIdentity: string;
  /** Kandidat der Erstvergabe (Abkürzung, Kurzbezeichnung oder Titel, transformiert). */
  candidate: string;
  assignment: 'derived' | 'collision-suffix';
}

export interface SlugRegistry {
  schemaVersion: typeof SLUG_REGISTRY_SCHEMA;
  jurisdiction: 'west';
  entries: SlugRegistryEntry[];
}

export interface SlugReservation {
  slug: string;
  collision?: { candidate: string; heldBy: string };
  /** Der Kandidat hat sich gegenüber der Erstvergabe geändert; der Slug bleibt stabil. */
  candidateChanged?: { previous: string; current: string };
  newlyReserved: boolean;
}

export function emptySlugRegistry(): SlugRegistry {
  return { schemaVersion: SLUG_REGISTRY_SCHEMA, jurisdiction: 'west', entries: [] };
}

export function validateSlugRegistry(registry: SlugRegistry): void {
  const slugs = new Set<string>();
  const identities = new Set<string>();
  for (const entry of registry.entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.slug)) throw new Error(`${SLUG_REGISTRY_PATH}: ungültiger Slug ${entry.slug}`);
    if (slugs.has(entry.slug)) throw new Error(`${SLUG_REGISTRY_PATH}: Slug ${entry.slug} doppelt vergeben`);
    if (identities.has(entry.sourceIdentity)) throw new Error(`${SLUG_REGISTRY_PATH}: ${entry.sourceIdentity} hat mehrere Slugs`);
    slugs.add(entry.slug);
    identities.add(entry.sourceIdentity);
  }
}

export async function readSlugRegistry(root: string): Promise<SlugRegistry> {
  const registry = await readJsonFile<SlugRegistry>(join(root, SLUG_REGISTRY_PATH));
  if (!registry) return emptySlugRegistry();
  if (registry.schemaVersion !== SLUG_REGISTRY_SCHEMA) throw new Error(`${SLUG_REGISTRY_PATH}: unbekannte Schemaversion ${registry.schemaVersion}`);
  validateSlugRegistry(registry);
  return registry;
}

export async function writeSlugRegistry(root: string, registry: SlugRegistry): Promise<boolean> {
  validateSlugRegistry(registry);
  const sorted: SlugRegistry = { ...registry, entries: [...registry.entries].sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0)) };
  return writeJsonAtomic(join(root, SLUG_REGISTRY_PATH), sorted);
}

/** Übernimmt Slugs bereits importierter Manifesteinträge, die noch nicht registriert sind (Migration). */
export function seedSlugRegistryFromManifest(registry: SlugRegistry, manifest: ImportManifest): SlugRegistry {
  const entries = [...registry.entries];
  for (const entry of manifest.entries) {
    if (!entry.targetSlug || !isImportedStatus(entry.importStatus)) continue;
    if (entries.some((existing) => existing.sourceIdentity === entry.sourceIdentity || existing.slug === entry.targetSlug)) continue;
    entries.push({ slug: entry.targetSlug, sourceIdentity: entry.sourceIdentity, candidate: entry.targetSlug, assignment: /-\d+$/u.test(entry.targetSlug) && entry.targetSlug.endsWith(entry.sourceIdentity.replace(/^term:/u, '')) ? 'collision-suffix' : 'derived' });
  }
  const seeded = { ...registry, entries };
  validateSlugRegistry(seeded);
  return seeded;
}

/**
 * Reserviert Slugs in einem Registry-Objekt (wird verändert). `existingSlugs` sind die Verzeichnisse unter
 * `content/norms/west/`; ein Verzeichnis ohne Registry-Eintrag gilt als fremd (Kollision).
 */
export function createSlugReserver(registry: SlugRegistry, existingSlugs: ReadonlySet<string>): { reserve(sourceIdentity: string, candidate: string): SlugReservation; readonly changed: boolean } {
  let changed = false;
  const bySlug = new Map(registry.entries.map((entry) => [entry.slug, entry]));
  const byIdentity = new Map(registry.entries.map((entry) => [entry.sourceIdentity, entry]));
  return {
    get changed() {
      return changed;
    },
    reserve(sourceIdentity, candidate) {
      const heldBy = (slug: string): string | undefined => bySlug.get(slug)?.sourceIdentity ?? (existingSlugs.has(slug) ? 'nicht registriertes Verzeichnis' : undefined);
      const own = byIdentity.get(sourceIdentity);
      if (own) {
        const reservation: SlugReservation = { slug: own.slug, newlyReserved: false };
        if (own.candidate !== candidate && own.slug !== candidate) reservation.candidateChanged = { previous: own.candidate, current: candidate };
        // Eine bestehende Kollisionsreservierung meldet die Kollision bei jeder Verarbeitung erneut (stabiler Befund,
        // kein Diff bei Wiederholungsläufen).
        if (own.assignment === 'collision-suffix') {
          const holder = heldBy(own.candidate);
          reservation.collision = { candidate: own.candidate, heldBy: holder && holder !== sourceIdentity ? holder : 'frühere Reservierung' };
        }
        return reservation;
      }
      const holder = heldBy(candidate);
      let entry: SlugRegistryEntry;
      if (!holder) {
        entry = { slug: candidate, sourceIdentity, candidate, assignment: 'derived' };
      } else {
        const suffixed = `${candidate}-${sourceIdentity.replace(/^term:/u, '').replace(/[^a-z0-9]+/giu, '-').toLowerCase()}`;
        const suffixHolder = heldBy(suffixed);
        if (suffixHolder) throw new Error(`Slug ${suffixed} für ${sourceIdentity} ist bereits durch ${suffixHolder} belegt`);
        entry = { slug: suffixed, sourceIdentity, candidate, assignment: 'collision-suffix' };
      }
      registry.entries.push(entry);
      bySlug.set(entry.slug, entry);
      byIdentity.set(sourceIdentity, entry);
      changed = true;
      const reservation: SlugReservation = { slug: entry.slug, newlyReserved: true };
      if (holder) reservation.collision = { candidate, heldBy: holder };
      return reservation;
    },
  };
}
