/**
 * Ladeumgebung des juris-SH-Adapters: alles, was ein Lauf an Zustand braucht, in einem Objekt –
 * Manifest, Slug-Registry, Review-Queue, Overrides, Institutionen-Zuordnung und Archivbindung.
 * Einzelabruf, Stichprobe und Bulk-Lauf verwenden dieselbe Umgebung; nur Modus und Archiv unterscheiden sich.
 *
 * ARCHITEKTUR (Übergangslösung, bewusst dokumentiert)
 * --------------------------------------------------
 * Portalneutrale, bereits erprobte Module werden aus dem West-Adapter importiert statt kopiert:
 *
 *   @landesrecht/importer-recht-nrw/common/atomic.ts          atomare Schreibvorgänge, Zustandsfehler
 *   @landesrecht/importer-recht-nrw/common/stable-json.ts     kanonische JSON-Form (Fingerabdrücke)
 *   @landesrecht/importer-recht-nrw/common/fetcher.ts         schonender Abruf (hier über einen Wrapper)
 *   @landesrecht/importer-recht-nrw/common/r2-transport.ts    R2-Transporte (Bucket, Objektschlüssel als Parameter)
 *   @landesrecht/importer-recht-nrw/common/html.ts            parse5-Helfer
 *   @landesrecht/importer-recht-nrw/common/body-common.ts     Aufbau des Normkörpers aus flachen Zeilen
 *   @landesrecht/importer-recht-nrw/common/version-selection.ts  Stichtagsauswahl aus einer Fassungsfolge
 *   @landesrecht/importer-recht-nrw/common/document-sanity.ts  Dokumentidentität und Plausibilität
 *   @landesrecht/importer-recht-nrw/common/pdf.ts             PDF-Prüfung und Textvollständigkeit
 *
 * Diese Module kennen weder RECHT.NRW-Adressen noch die Jurisdiktion West; sie sind echte Werkzeuge.
 * Der Import über die Exports-Map des West-Pakets ist eine Übergangslösung: Sobald ein dritter Adapter
 * dieselben Module braucht, werden sie nach `@landesrecht/importer-common` extrahiert. Bis dahin wird das
 * eingefrorene West-Paket nur gelesen, nie geändert.
 *
 * Portalspezifisch und deshalb hier neu geschrieben: Manifest, Zustandspfade, Review-Anbindung, Overrides,
 * Slug-Registry (Landeszusatz `-nsh`), Unresolved-Datensätze und diese Umgebung. Die Institutionen-Zuordnung
 * (`data/imports/juris-sh/institution-mapping.json`) gehört fachlich zur Transformation und wird von dort
 * gelesen (`transform/institution-registry.ts`) – die Umgebung reicht sie nur durch.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { compileInstitutionRegistry, emptyInstitutionRegistry, readInstitutionRegistry, type CompiledInstitutionRegistry } from '../transform/institution-registry.ts';
import { CACHE_DIR, R2_PREFIX, SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from './constants.ts';
import { emptyManifest, readManifest, type ImportManifest } from './manifest.ts';
import { emptyOverrideRegistry, readOverrides, type OverrideRegistry } from './overrides.ts';
import { emptyReviewQueue, readReviewQueue, type ReviewQueue } from './review.ts';
import { createSlugReserver, emptySlugRegistry, readSlugRegistry, seedSlugRegistryFromManifest, type SlugRegistry, type SlugRegistryEntry } from './slug-registry.ts';

/** Bucket des Quellenarchivs (wie West; die Präfixe trennen die Bestände). */
export const R2_SOURCES_BUCKET = 'landesrecht-quellen';
/** Staging der Rohquellen vor dem Upload – außerhalb von Git, damit nie Quellbytes versioniert werden. */
export const DEFAULT_STAGING_DIR = join('.cache', `${SOURCE_SYSTEM}-r2-staging`);

/**
 * Archivbindung der Rohquellen. `versioned-sample` ist nur für die Stichprobe erlaubt (wenige Dokumente
 * unter `sources/`), der Bulk-Lauf staged ins Cacheverzeichnis und lädt von dort nach R2 – im Repository
 * landen niemals Bulk-Rohquellen.
 */
export interface ArchiveBinding {
  mode: 'versioned-sample' | 'staging' | 'r2';
  /** Objektpräfix `nsh/juris-sh/2023-12-01` aus den Adapterkonstanten. */
  prefix: string;
  bucket?: string;
  stagingDir?: string;
}

export interface ImportEnvironment {
  root: string;
  mode: 'sample' | 'bulk';
  manifest: ImportManifest;
  slugRegistry: SlugRegistry;
  reviewQueue: ReviewQueue;
  overrides: OverrideRegistry;
  /** Institutionen-Zuordnung (gelesen und kompiliert von `transform/institution-registry.ts`). */
  institutions: CompiledInstitutionRegistry;
  archive: ArchiveBinding;
  /** full-plan: D1-Plan über den ganzen Bestand (Einzelimport); record-only: nur die Norm (Bulk). */
  projection: 'full-plan' | 'record-only';
  /** Cacheverzeichnis der Rohabrufe (nicht versioniert). */
  cacheDir: string;
  runId?: string;
}

export interface EnvironmentOptions {
  mode?: 'sample' | 'bulk';
  archive?: Partial<ArchiveBinding>;
  projection?: ImportEnvironment['projection'];
  cacheDir?: string;
  stagingDir?: string;
  runId?: string;
  manifest?: ImportManifest;
}

/** Stellt sicher, dass kein Bulk-Lauf Rohquellen in versionierte Pfade schreibt. */
export function assertArchiveAllowed(mode: 'sample' | 'bulk', archive: ArchiveBinding): void {
  if (mode === 'bulk' && archive.mode === 'versioned-sample') throw new Error('Der Bulk-Lauf darf keine Rohquellen versionieren (Archiv staging oder r2 wählen)');
  if (archive.mode !== 'versioned-sample' && !archive.stagingDir) throw new Error('Archivmodus staging/r2 braucht ein Staging-Verzeichnis außerhalb von Git');
  if (archive.prefix !== R2_PREFIX) throw new Error(`Archivpräfix ${archive.prefix} weicht von ${R2_PREFIX} ab (Bestände dürfen sich nicht überlagern)`);
}

export async function loadImportEnvironment(root: string, options: EnvironmentOptions = {}): Promise<ImportEnvironment> {
  const mode = options.mode ?? 'sample';
  const manifest = options.manifest ?? (await readManifest(root));
  const archive: ArchiveBinding = {
    mode: options.archive?.mode ?? (mode === 'sample' ? 'versioned-sample' : 'staging'),
    prefix: options.archive?.prefix ?? R2_PREFIX,
    bucket: options.archive?.bucket ?? R2_SOURCES_BUCKET,
    ...(options.archive?.mode === 'versioned-sample' && !options.stagingDir ? {} : { stagingDir: options.stagingDir ?? options.archive?.stagingDir ?? join(root, DEFAULT_STAGING_DIR) }),
  };
  assertArchiveAllowed(mode, archive);
  return {
    root,
    mode,
    manifest,
    slugRegistry: seedSlugRegistryFromManifest(await readSlugRegistry(root), manifest),
    reviewQueue: await readReviewQueue(root),
    overrides: await readOverrides(root),
    institutions: await readInstitutionRegistry(root),
    archive,
    projection: options.projection ?? (mode === 'bulk' ? 'record-only' : 'full-plan'),
    cacheDir: options.cacheDir ?? join(root, CACHE_DIR),
    ...(options.runId ? { runId: options.runId } : {}),
  };
}

/** Testumgebung ohne Dateizugriff (leere Registries, Stichprobenarchiv im angegebenen Root). */
export function createTestEnvironment(root: string, overrides: Partial<ImportEnvironment> = {}): ImportEnvironment {
  return {
    root,
    mode: 'sample',
    manifest: emptyManifest(),
    slugRegistry: emptySlugRegistry(),
    reviewQueue: emptyReviewQueue(),
    overrides: emptyOverrideRegistry(),
    institutions: compileInstitutionRegistry(emptyInstitutionRegistry()),
    archive: { mode: 'versioned-sample', prefix: R2_PREFIX, bucket: R2_SOURCES_BUCKET },
    projection: 'full-plan',
    cacheDir: join(root, CACHE_DIR),
    ...overrides,
  };
}

/** Bereits belegte Normverzeichnisse der Zieljurisdiktion (fremde Slugs zählen als Kollision). */
export async function listExistingSlugs(root: string): Promise<Set<string>> {
  const entries = await readdir(join(root, 'content', 'norms', TARGET_JURISDICTION), { withFileTypes: true }).catch(() => []);
  return new Set(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name));
}

export interface SlugReservationHandle {
  /** Liefert den endgültigen Slug (Landeszusatz `-nsh`, Kollisionssuffix deterministisch). */
  reserveSlug(candidate: string): string;
  collisions: string[];
  notes: string[];
  /** Übernimmt die Reservierungen in die Umgebung – erst nach erfolgreicher Übernahme aufrufen. */
  commit(): SlugRegistryEntry[];
}

/**
 * Slugvergabe für eine Quelle: Reservierungen laufen auf einer Kopie der Registry und werden erst mit
 * `commit()` in die Umgebung übernommen. Ein abgebrochener Import hinterlässt so keine Reservierung.
 */
export async function slugReservationFor(environment: ImportEnvironment, sourceIdentity: string): Promise<SlugReservationHandle> {
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

/** Bereiche, über die ein Lauf geht: der gewählte oder alle (Reihenfolge = Verarbeitungsreihenfolge). */
export function areasOf(area?: SourceArea): readonly SourceArea[] {
  return area ? [area] : SOURCE_AREAS;
}
