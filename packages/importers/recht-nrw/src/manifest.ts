/**
 * Importmanifest des RECHT.NRW-Imports (`data/imports/recht-nrw/manifest.json`).
 * Je Stammnorm ein Eintrag; deterministisch aus dem Importlauf erzeugt, nach Quellidentität
 * sortiert und für den späteren Bulkimport als Zustandsdatei (Resume, Deduplizierung) geeignet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

export const MANIFEST_SCHEMA = 'recht-nrw-import-manifest/1';
export const MANIFEST_PATH = join('data', 'imports', 'recht-nrw', 'manifest.json');
export const SAMPLE_CORPUS_PATH = join('data', 'imports', 'recht-nrw', 'sample-corpus.json');
export const AUDIT_DIR = join('data', 'audits', 'recht-nrw');
export const RAW_ARCHIVE_DIR = join('sources', 'recht-nrw');

export type ImportStatus = 'imported' | 'imported-with-warnings' | 'dry-run' | 'failed' | 'needs-review';

export interface ManifestRawDocument {
  role: 'version-page' | 'legacy-text' | 'annex' | 'pdf';
  url: string;
  finalUrl: string;
  sha256: string;
  contentType: string;
  retrievedAt: string;
  byteLength: number;
  localSource?: string;
}

export interface ManifestEntry {
  sourceSystem: 'recht-nrw';
  sourceIdentity: string;
  sourceTitle: string;
  sourceType: string;
  /** Adresse, mit der der Import gestartet wurde. */
  sourceUrl: string;
  /** Stabile Adresse der Stammnorm (Taxonomie-Term). */
  stemUrl: string;
  selectedVersionUrl: string;
  sourceValidFrom: string;
  sourceValidTo: string | null;
  retrievedAt: string;
  sha256: string;
  contentType: string;
  contentFormat: 'legacy-file' | 'native';
  parserVersion: string;
  targetJurisdiction: JurisdictionId;
  targetSlug: string;
  baselineDate: string;
  importStatus: ImportStatus;
  importedAt: string;
  rawDocuments: ManifestRawDocument[];
  versionsConsidered: Array<{ validFrom: string; validTo: string | null; url?: string; selected: boolean }>;
  overrides: ManifestOverride[];
  findings: ImportFinding[];
  integrity: { fetchParse: boolean; sourceCanonical: boolean };
  transformation: { changes: number; unresolved: number; reportPath?: string };
}

export interface ManifestOverride {
  field: 'sourceValidTo';
  value: string | null;
  reason: string;
}

export interface ImportManifest {
  schemaVersion: typeof MANIFEST_SCHEMA;
  sourceSystem: 'recht-nrw';
  baselineDate: string;
  entries: ManifestEntry[];
}

export interface SampleCorpusEntry {
  url: string;
  rationale: string;
  overrides?: ManifestOverride[];
}

export interface SampleCorpus {
  schemaVersion: 'recht-nrw-sample-corpus/1';
  description: string;
  entries: SampleCorpusEntry[];
}

export function emptyManifest(): ImportManifest {
  return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: 'recht-nrw', baselineDate: SIMULATION_BASELINE_DATE, entries: [] };
}

export async function readManifest(root: string): Promise<ImportManifest> {
  try {
    const parsed = JSON.parse(await readFile(join(root, MANIFEST_PATH), 'utf8')) as ImportManifest;
    if (parsed.schemaVersion !== MANIFEST_SCHEMA) throw new Error(`${MANIFEST_PATH}: unbekannte Schemaversion ${parsed.schemaVersion}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest();
    throw error;
  }
}

export async function writeManifest(root: string, manifest: ImportManifest): Promise<string> {
  const target = join(root, MANIFEST_PATH);
  await mkdir(dirname(target), { recursive: true });
  const sorted: ImportManifest = { ...manifest, entries: [...manifest.entries].sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity)) };
  await writeFile(target, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  return target;
}

export function upsertManifestEntry(manifest: ImportManifest, entry: ManifestEntry): ImportManifest {
  const entries = manifest.entries.filter((existing) => existing.sourceIdentity !== entry.sourceIdentity);
  entries.push(entry);
  return { ...manifest, entries };
}

export async function readSampleCorpus(root: string): Promise<SampleCorpus> {
  const parsed = JSON.parse(await readFile(join(root, SAMPLE_CORPUS_PATH), 'utf8')) as SampleCorpus;
  if (parsed.schemaVersion !== 'recht-nrw-sample-corpus/1') throw new Error(`${SAMPLE_CORPUS_PATH}: unbekannte Schemaversion`);
  return parsed;
}
