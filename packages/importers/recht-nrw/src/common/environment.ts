/**
 * Gemeinsame Importumgebung beider Quellbereiche: Archiv (Beispielkorpus oder R2), Overrides, Slug-Registry,
 * Institutionen-Zuordnung, bekannte Normabkürzungen (Transformationsregeln), Projektionsmodus und Laufkennung.
 * Einzelimport, Beispielkorpus und Bulk-Lauf verwenden dieselbe Umgebung – nur Archiv und Modus unterscheiden sich.
 */
import { splitTitle } from '../lrgv/normalize.ts';
import { compileInstitutionRegistry, readInstitutionRegistry, type CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { stateLawAbbreviationBase, type TransformationOptions } from '../transform/rules.ts';
import { assertArchiveAllowed, createVersionedSampleArchive, type RawSourceArchive } from './archive.ts';
import { readEnumeration, searchSignalsByUrl, type SearchSignals } from './enumeration.ts';
import { readManifest, type ImportManifest } from './manifest.ts';
import { readOverrides, type OverrideRegistry } from './overrides.ts';
import { listExistingSlugs } from './persist.ts';
import { createSlugReserver, emptySlugRegistry, readSlugRegistry, seedSlugRegistryFromManifest, type SlugRegistry, type SlugRegistryEntry } from './slug-registry.ts';

export interface ImportEnvironment {
  root: string;
  mode: 'sample' | 'bulk';
  archive: RawSourceArchive;
  overrides: OverrideRegistry;
  slugRegistry: SlugRegistry;
  institutions: CompiledInstitutionRegistry;
  transformation: TransformationOptions;
  /** full-plan: D1-Plan über den ganzen Bestand (Einzelimport); record-only: nur die Norm (Bulk). */
  projection: 'full-plan' | 'record-only';
  /** Suchindex-Signale je Fassungsadresse (LRMB-Belegprüfung). */
  searchSignals: Map<string, SearchSignals>;
  runId?: string;
  stagingDir?: string;
}

export interface EnvironmentOptions {
  mode?: 'sample' | 'bulk';
  archive?: RawSourceArchive;
  projection?: ImportEnvironment['projection'];
  runId?: string;
  stagingDir?: string;
  manifest?: ImportManifest;
}

/** Abkürzungen der LRGV-Normen (Suchindex, Manifest) ohne Landeszusatz. */
export async function loadKnownStateLawAbbreviations(root: string, manifest?: ImportManifest): Promise<Set<string>> {
  const known = new Set<string>();
  const add = (value: string | undefined): void => {
    const base = value ? stateLawAbbreviationBase(value) : undefined;
    if (base) known.add(base);
  };
  const enumeration = await readEnumeration(root, 'lrgv').catch(() => undefined);
  for (const item of enumeration?.items ?? []) {
    if (item.portalType !== 'gesetz' && item.portalType !== 'rechtsverordnung') continue;
    add(item.search?.abbreviation);
    add(splitTitle(item.title).abbr);
  }
  for (const entry of (manifest ?? (await readManifest(root))).entries) if (entry.sourceArea === 'lrgv') add(splitTitle(entry.sourceTitle).abbr);
  return known;
}

export async function loadImportEnvironment(root: string, options: EnvironmentOptions = {}): Promise<ImportEnvironment> {
  const mode = options.mode ?? 'sample';
  const manifest = options.manifest ?? (await readManifest(root));
  const archive = options.archive ?? (mode === 'sample' ? createVersionedSampleArchive(root) : undefined);
  if (!archive) throw new Error('Bulkmodus braucht ein ausdrücklich gewähltes Archiv (R2)');
  assertArchiveAllowed(root, mode, archive, options.stagingDir);
  let slugRegistry = await readSlugRegistry(root);
  slugRegistry = seedSlugRegistryFromManifest(slugRegistry, manifest);
  const lrmbEnumeration = await readEnumeration(root, 'lrmb').catch(() => undefined);
  const environment: ImportEnvironment = {
    root,
    mode,
    archive,
    overrides: await readOverrides(root),
    slugRegistry,
    institutions: await readInstitutionRegistry(root),
    transformation: { knownStateLawAbbreviations: await loadKnownStateLawAbbreviations(root, manifest) },
    projection: options.projection ?? (mode === 'bulk' ? 'record-only' : 'full-plan'),
    searchSignals: searchSignalsByUrl(lrmbEnumeration),
  };
  if (options.runId) environment.runId = options.runId;
  if (options.stagingDir) environment.stagingDir = options.stagingDir;
  return environment;
}

/** Testumgebung ohne Dateizugriff (leere Registries, Beispielarchiv im angegebenen Root). */
export function createTestEnvironment(root: string, overrides: Partial<ImportEnvironment> = {}): ImportEnvironment {
  return {
    root,
    mode: 'sample',
    archive: createVersionedSampleArchive(root),
    overrides: { schemaVersion: 'recht-nrw-overrides/1', entries: [] },
    slugRegistry: emptySlugRegistry(),
    institutions: compileInstitutionRegistry({ schemaVersion: 'recht-nrw-institution-mapping/1', defaults: {}, entries: [] }),
    transformation: {},
    projection: 'full-plan',
    searchSignals: new Map(),
    ...overrides,
  };
}

/**
 * Slugvergabe für eine Quelle: Reservierungen laufen auf einer Kopie der Registry und werden erst mit
 * `commit()` (nach erfolgreicher Übernahme) in die Umgebung übernommen.
 */
export async function slugReservationFor(environment: ImportEnvironment, sourceIdentity: string): Promise<{ reserveSlug(candidate: string): string; collisions: string[]; notes: string[]; commit(): SlugRegistryEntry[] }> {
  const draft: SlugRegistry = { ...environment.slugRegistry, entries: [...environment.slugRegistry.entries] };
  const reserver = createSlugReserver(draft, await listExistingSlugs(environment.root));
  const collisions: string[] = [];
  const notes: string[] = [];
  return {
    collisions,
    notes,
    reserveSlug(candidate) {
      const reservation = reserver.reserve(sourceIdentity, candidate);
      if (reservation.collision) collisions.push(`${reservation.collision.candidate} → ${reservation.slug} (belegt durch ${reservation.collision.heldBy})`);
      if (reservation.candidateChanged) notes.push(`Slug ${reservation.slug} bleibt stabil; Kandidat geändert (${reservation.candidateChanged.previous} → ${reservation.candidateChanged.current})`);
      return reservation.slug;
    },
    commit() {
      const added = draft.entries.filter((entry) => !environment.slugRegistry.entries.some((existing) => existing.sourceIdentity === entry.sourceIdentity));
      environment.slugRegistry.entries.push(...added);
      return added;
    },
  };
}
