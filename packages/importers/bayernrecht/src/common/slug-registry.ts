/**
 * Dauerhafte Slugvergabe des BayWü-Bestands (`data/imports/bayernrecht/slug-registry.json`).
 *
 * Verfahren wie im West- und im NSH-Adapter (eigener Zustand, eigene Jurisdiktionskonvention):
 *  - Reservierung je Quellidentität: Ein einmal vergebener Slug bleibt, auch wenn eine spätere Quellfassung
 *    eine andere Abkürzung trägt.
 *  - Kollisionen werden deterministisch gelöst: `<kandidat>-<8 Hex der Quellidentität>`; jede Kollision wird
 *    als Review-Hinweis dokumentiert (Kategorie `identity`).
 *
 * Jurisdiktionskonvention: Der Landeszusatz des Simulationslandes ist immer `-baywue` (aus der
 * Jurisdiktions-ID `baywue`). Die realen bayerischen Kürzel dürfen nie in einen Slug gelangen: Ein
 * Kandidat auf `-bayern`, `-bay` oder `-by` wird auf `-baywue` überführt, bevor er reserviert wird, und
 * bleibt er es doch, ist das ein harter Fehler – nicht eine stille Korrektur. Slugs ohne Landeszusatz
 * (ausgeschriebene Titel) bleiben unverändert; es wird nichts angehängt, was die Quelle nicht hergibt.
 * Der ausgeschriebene Name des Simulationslandes (`…-bayern-wuerttemberg`) ist kein Quellzusatz und
 * bleibt deshalb stehen.
 *
 * Slugmigration (Nutzerentscheidung Run 5): Nur für einzeln belegte, sachlich falsche Slugs – etwa aus einem
 * früher falsch übergeleiteten historischen Titel – und nur über `slug-migrations.json`. Der neue Slug entsteht
 * aus dem heutigen (bereinigten) Kandidaten; der alte wird stillgelegt (`retired`), nie wieder vergeben und
 * permanent auf den Nachfolger umgeleitet (`packages/legal-core/src/config/slug-redirects.json`). Keine
 * allgemeine Massenmigration: Ohne Migrationseintrag bleibt jeder Slug stabil.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { TARGET_JURISDICTION } from './constants.ts';
import { isImportedStatus, type ImportManifest } from './manifest.ts';
import { identityHash, SLUG_REGISTRY_PATH } from './paths.ts';

export const SLUG_REGISTRY_SCHEMA = 'bayernrecht-slug-registry/1' as const;
/** Landeszusatz des Simulationslandes; niemals `-bayern`, `-bay` oder `-by`. */
export const JURISDICTION_SUFFIX = `-${TARGET_JURISDICTION}`;
/** Reale Landeskürzel Bayerns; als Slugzusatz verboten (Reihenfolge: längster zuerst). */
export const FORBIDDEN_SOURCE_SUFFIXES = ['-bayern', '-bay', '-by'] as const;
export { SLUG_REGISTRY_PATH };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Welcher verbotene Quellzusatz am Ende steht (oder `undefined`). */
export function forbiddenSourceSuffix(slug: string): string | undefined {
  return FORBIDDEN_SOURCE_SUFFIXES.find((suffix) => slug.endsWith(suffix));
}

export interface SlugRegistryEntry {
  slug: string;
  sourceIdentity: string;
  /** Kandidat der Erstvergabe (Abkürzung, Kurzbezeichnung oder Titel, bereits übergeleitet). */
  candidate: string;
  assignment: 'derived' | 'collision-suffix';
}

/** Stillgelegter Slug: nie wieder vergeben, permanent auf den Nachfolger umgeleitet. */
export interface RetiredSlug {
  slug: string;
  sourceIdentity: string;
  /** Nachfolger nach einer Slug-Migration (permanente Umleitung). Fehlt bei einer Rücknahme aus dem Bestand. */
  successor?: string;
  migration?: string;
  /** Rücknahme aus dem Stichtagsbestand (amtlich belegt nicht am Stichtag): kein Nachfolger, keine Umleitung. */
  withdrawn?: { reason: string; date: string };
}

export interface SlugRegistry {
  schemaVersion: typeof SLUG_REGISTRY_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  entries: SlugRegistryEntry[];
  retired?: RetiredSlug[];
}

/** Einzeln entschiedene Slugmigration (`data/imports/bayernrecht/slug-migrations.json`). */
export interface SlugMigration {
  id: string;
  sourceIdentity: string;
  /** Der sachlich falsche Slug, der stillgelegt wird. */
  from: string;
  reason: string;
  evidence: string;
  decidedBy: string;
  decidedAt: string;
}

export const SLUG_MIGRATIONS_SCHEMA = 'bayernrecht-slug-migrations/1' as const;
export const SLUG_MIGRATIONS_PATH = 'data/imports/bayernrecht/slug-migrations.json';

export async function readSlugMigrations(root: string): Promise<SlugMigration[]> {
  const file = await readJsonFile<{ schemaVersion: string; migrations: SlugMigration[] }>(join(root, SLUG_MIGRATIONS_PATH));
  if (!file) return [];
  if (file.schemaVersion !== SLUG_MIGRATIONS_SCHEMA) throw new Error(`${SLUG_MIGRATIONS_PATH}: unbekannte Schemaversion ${String(file.schemaVersion)}`);
  for (const [index, migration] of file.migrations.entries()) {
    for (const field of ['id', 'sourceIdentity', 'from', 'reason', 'evidence', 'decidedBy', 'decidedAt'] as const) {
      if (typeof migration[field] !== 'string' || migration[field] === '') throw new Error(`${SLUG_MIGRATIONS_PATH}: migrations[${index}].${field} fehlt`);
    }
    assertJurisdictionSlug(migration.from, `${SLUG_MIGRATIONS_PATH}: migrations[${index}].from`);
  }
  return file.migrations;
}

export interface SlugReservation {
  slug: string;
  collision?: { candidate: string; heldBy: string };
  /** Der Kandidat hat sich gegenüber der Erstvergabe geändert; der Slug bleibt stabil. */
  candidateChanged?: { previous: string; current: string };
  newlyReserved: boolean;
  /** Slugmigration: der stillgelegte Vorgänger (permanent umgeleitet). */
  migratedFrom?: string;
}

export function emptySlugRegistry(): SlugRegistry {
  return { schemaVersion: SLUG_REGISTRY_SCHEMA, jurisdiction: TARGET_JURISDICTION, entries: [] };
}

/**
 * Überführt einen Slugkandidaten in die Jurisdiktionskonvention: Zeichen entschärfen und den
 * Landeszusatz der Quelle durch `-baywue` ersetzen. Ein bereits korrekter Kandidat bleibt unverändert.
 */
export function jurisdictionSlugCandidate(candidate: string): string {
  const normalized = candidate
    .trim()
    .toLowerCase()
    .replace(/[äÄ]/gu, 'ae')
    .replace(/[öÖ]/gu, 'oe')
    .replace(/[üÜ]/gu, 'ue')
    .replace(/ß/gu, 'ss')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (normalized === '') throw new Error(`Slugkandidat ${JSON.stringify(candidate)} ergibt keinen Slug`);
  const source = forbiddenSourceSuffix(normalized);
  const withJurisdiction = source ? `${normalized.slice(0, -source.length)}${JURISDICTION_SUFFIX}` : normalized;
  const remaining = forbiddenSourceSuffix(withJurisdiction);
  if (remaining) throw new Error(`Slug ${withJurisdiction} trägt den Quellzusatz ${remaining} statt ${JURISDICTION_SUFFIX}`);
  if (!SLUG.test(withJurisdiction)) throw new Error(`Slug ${withJurisdiction} ist nicht wohlgeformt`);
  return withJurisdiction;
}

/**
 * Harte Prüfung eines fertigen Slugs: Er muss wohlgeformt sein und darf keinen realen Landeszusatz
 * Bayerns tragen. Wird überall dort benutzt, wo ein Slug nicht aus `jurisdictionSlugCandidate` stammt
 * (Registry, Manifest, Overrides) – ein `-bay`, `-by` oder `-bayern` wird dort nicht still korrigiert.
 */
export function assertJurisdictionSlug(slug: string, where = 'Slug'): string {
  if (!SLUG.test(slug)) throw new Error(`${where} ${slug} ist nicht wohlgeformt`);
  const forbidden = forbiddenSourceSuffix(slug);
  if (forbidden) throw new Error(`${where} ${slug} trägt den Quellzusatz ${forbidden} statt ${JURISDICTION_SUFFIX}`);
  return slug;
}

export function validateSlugRegistry(registry: SlugRegistry, path = SLUG_REGISTRY_PATH): void {
  if (registry.jurisdiction !== TARGET_JURISDICTION) throw new Error(`${path}: Registry gehört zu ${String(registry.jurisdiction)}, erwartet ${TARGET_JURISDICTION}`);
  const slugs = new Set<string>();
  const identities = new Set<string>();
  const retired = new Set<string>();
  for (const entry of registry.retired ?? []) {
    if (!SLUG.test(entry.slug)) throw new Error(`${path}: ungültiger stillgelegter Slug ${entry.slug}`);
    if (retired.has(entry.slug)) throw new Error(`${path}: stillgelegter Slug ${entry.slug} doppelt`);
    retired.add(entry.slug);
  }
  for (const entry of registry.entries) {
    if (retired.has(entry.slug)) throw new Error(`${path}: Slug ${entry.slug} ist stillgelegt und darf nicht wieder vergeben werden`);
    if (!SLUG.test(entry.slug)) throw new Error(`${path}: ungültiger Slug ${entry.slug}`);
    const forbidden = forbiddenSourceSuffix(entry.slug);
    if (forbidden) throw new Error(`${path}: Slug ${entry.slug} trägt den Quellzusatz ${forbidden} statt ${JURISDICTION_SUFFIX}`);
    if (slugs.has(entry.slug)) throw new Error(`${path}: Slug ${entry.slug} doppelt vergeben`);
    if (identities.has(entry.sourceIdentity)) throw new Error(`${path}: ${entry.sourceIdentity} hat mehrere Slugs`);
    slugs.add(entry.slug);
    identities.add(entry.sourceIdentity);
  }
  for (const entry of registry.retired ?? []) {
    const current = registry.entries.find((candidate) => candidate.sourceIdentity === entry.sourceIdentity);
    if (entry.withdrawn) {
      if (entry.successor || current) throw new Error(`${path}: zurückgenommener Slug ${entry.slug} darf weder Nachfolger noch aktive Reservierung für ${entry.sourceIdentity} haben`);
      continue;
    }
    if (!entry.successor || !entry.migration) throw new Error(`${path}: stillgelegter Slug ${entry.slug} ohne Nachfolger und Migration`);
    if (!current || current.slug !== entry.successor) throw new Error(`${path}: stillgelegter Slug ${entry.slug} verweist auf ${entry.successor}, ${entry.sourceIdentity} führt ${current?.slug ?? '(keinen Slug)'}`);
  }
}

export async function readSlugRegistry(root: string): Promise<SlugRegistry> {
  const registry = await readJsonFile<SlugRegistry>(join(root, SLUG_REGISTRY_PATH));
  if (!registry) return emptySlugRegistry();
  if (registry.schemaVersion !== SLUG_REGISTRY_SCHEMA) throw new Error(`${SLUG_REGISTRY_PATH}: unbekannte Schemaversion ${String(registry.schemaVersion)}`);
  validateSlugRegistry(registry);
  return registry;
}

export async function writeSlugRegistry(root: string, registry: SlugRegistry): Promise<boolean> {
  validateSlugRegistry(registry);
  const sorted: SlugRegistry = {
    ...registry,
    entries: [...registry.entries].sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0)),
    ...(registry.retired && registry.retired.length > 0 ? { retired: [...registry.retired].sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0)) } : {}),
  };
  return writeJsonAtomic(join(root, SLUG_REGISTRY_PATH), sorted);
}

/** Übernimmt Slugs bereits übernommener Manifesteinträge, die noch nicht registriert sind (Migration). */
export function seedSlugRegistryFromManifest(registry: SlugRegistry, manifest: ImportManifest): SlugRegistry {
  const entries = [...registry.entries];
  for (const entry of manifest.entries) {
    if (!entry.targetSlug || !isImportedStatus(entry.importStatus)) continue;
    if (entries.some((existing) => existing.sourceIdentity === entry.sourceIdentity || existing.slug === entry.targetSlug)) continue;
    const suffix = identityHash(entry.sourceIdentity).slice(0, 8);
    entries.push({ slug: entry.targetSlug, sourceIdentity: entry.sourceIdentity, candidate: entry.targetSlug, assignment: entry.targetSlug.endsWith(`-${suffix}`) ? 'collision-suffix' : 'derived' });
  }
  const seeded: SlugRegistry = { ...registry, entries };
  validateSlugRegistry(seeded);
  return seeded;
}

/**
 * Reserviert Slugs in einem Registry-Objekt (wird verändert). `existingSlugs` sind die vorhandenen
 * Normverzeichnisse der Jurisdiktion; ein Verzeichnis ohne Registry-Eintrag gilt als fremd (Kollision).
 */
export function createSlugReserver(registry: SlugRegistry, existingSlugs: ReadonlySet<string>, migrations: readonly SlugMigration[] = []): { reserve(sourceIdentity: string, candidate: string): SlugReservation; readonly changed: boolean } {
  let changed = false;
  const bySlug = new Map(registry.entries.map((entry) => [entry.slug, entry]));
  const byIdentity = new Map(registry.entries.map((entry) => [entry.sourceIdentity, entry]));
  const retired = new Set((registry.retired ?? []).map((entry) => entry.slug));
  return {
    get changed() {
      return changed;
    },
    reserve(sourceIdentity, rawCandidate) {
      const candidate = jurisdictionSlugCandidate(rawCandidate);
      const heldBy = (slug: string): string | undefined => bySlug.get(slug)?.sourceIdentity ?? (retired.has(slug) ? 'stillgelegter Slug' : existingSlugs.has(slug) ? 'nicht registriertes Verzeichnis' : undefined);
      const own = byIdentity.get(sourceIdentity);
      // Einzeln entschiedene Migration: der heutige Kandidat wird neu reserviert, der alte Slug stillgelegt.
      const migration = own ? migrations.find((entry) => entry.sourceIdentity === sourceIdentity && entry.from === own!.slug) : undefined;
      if (own && migration) {
        const from = own.slug;
        registry.entries.splice(registry.entries.indexOf(own), 1);
        bySlug.delete(from);
        byIdentity.delete(sourceIdentity);
        retired.add(from);
        const target = heldBy(candidate) ? `${candidate}-${identityHash(sourceIdentity).slice(0, 8)}` : candidate;
        if (heldBy(target)) throw new Error(`Slugmigration ${migration.id}: Ziel ${target} ist bereits durch ${heldBy(target)} belegt`);
        const next: SlugRegistryEntry = { slug: target, sourceIdentity, candidate, assignment: target === candidate ? 'derived' : 'collision-suffix' };
        registry.entries.push(next);
        registry.retired = [...(registry.retired ?? []), { slug: from, sourceIdentity, successor: target, migration: migration.id }];
        bySlug.set(target, next);
        byIdentity.set(sourceIdentity, next);
        changed = true;
        return { slug: target, newlyReserved: true, migratedFrom: from };
      }
      if (own) {
        const reservation: SlugReservation = { slug: own.slug, newlyReserved: false };
        if (own.candidate !== candidate && own.slug !== candidate) reservation.candidateChanged = { previous: own.candidate, current: candidate };
        // Eine bestehende Kollisionsreservierung meldet die Kollision bei jeder Verarbeitung erneut
        // (stabiler Befund, kein Diff bei Wiederholungsläufen).
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
        const suffixed = `${candidate}-${identityHash(sourceIdentity).slice(0, 8)}`;
        const suffixHolder = heldBy(suffixed);
        if (suffixHolder) throw new Error(`Slug ${suffixed} für ${sourceIdentity} ist bereits durch ${suffixHolder} belegt`);
        entry = { slug: suffixed, sourceIdentity, candidate, assignment: 'collision-suffix' };
      }
      registry.entries.push(entry);
      bySlug.set(entry.slug, entry);
      byIdentity.set(sourceIdentity, entry);
      changed = true;
      return { slug: entry.slug, newlyReserved: true, ...(holder ? { collision: { candidate, heldBy: holder } } : {}) };
    },
  };
}
