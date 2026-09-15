/**
 * Gemeinsames Importmanifest des RECHT.NRW-Imports (`data/imports/recht-nrw/manifest.json`) für
 * beide Quellbereiche: LRGV (Gesetze und Rechtsverordnungen) und LRMB (Verwaltungsvorschriften aus
 * dem Ministerialblatt). Je Stammnorm ein Eintrag; deterministisch aus dem Importlauf erzeugt, nach
 * Quellidentität sortiert und für den Bulkimport als Zustandsdatei (Resume, Deduplizierung) geeignet.
 *
 * Schemaversion 2 ergänzt Quellbereich, Dokumenttyp, Stichtagsstatus mit Belegen, Transformer- und
 * Reviewstatus sowie den Rekonstruktionspfad. Manifeste der Version 1 (nur LRGV) werden beim Lesen
 * verlustfrei hochgestuft und beim nächsten Schreiben als Version 2 gespeichert.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

export const MANIFEST_SCHEMA = 'recht-nrw-import-manifest/2' as const;
export const MANIFEST_SCHEMA_V1 = 'recht-nrw-import-manifest/1';
export const MANIFEST_PATH = join('data', 'imports', 'recht-nrw', 'manifest.json');
export const SAMPLE_CORPUS_PATH = join('data', 'imports', 'recht-nrw', 'sample-corpus.json');
export const LRMB_SAMPLE_CORPUS_PATH = join('data', 'imports', 'recht-nrw', 'lrmb-sample-corpus.json');
export const RECONSTRUCTIONS_DIR = join('data', 'imports', 'recht-nrw', 'reconstructions');
export const AUDIT_DIR = join('data', 'audits', 'recht-nrw');
export const RAW_ARCHIVE_DIR = join('sources', 'recht-nrw');

export const SOURCE_AREAS = ['lrgv', 'lrmb'] as const;
export type SourceArea = (typeof SOURCE_AREAS)[number];

export const IMPORT_STATUSES = ['imported', 'imported-with-warnings', 'dry-run', 'failed', 'needs-review', 'excluded', 'not-at-baseline'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const REVIEW_STATUSES = ['none', 'open', 'resolved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Ergebnis der Stichtagsprüfung der Quelle. */
export const BASELINE_STATUSES = ['active-at-baseline', 'not-active-at-baseline', 'undetermined'] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

export const RECONSTRUCTION_STATUSES = ['direct', 'reconstructed', 'reconstruction-required', 'not-applicable'] as const;
export type ReconstructionStatus = (typeof RECONSTRUCTION_STATUSES)[number];

export const VALIDITY_EVIDENCE_KINDS = [
  'portal-version-interval',
  'portal-version-list',
  'portal-change-history',
  'portal-completeness-notice',
  'text-in-force-clause',
  'text-expiry-clause',
  'gazette-publication',
  'gazette-amendment',
  'gazette-amendment-chain',
  'reconstruction',
  'override',
] as const;
export type ValidityEvidenceKind = (typeof VALIDITY_EVIDENCE_KINDS)[number];

export interface ValidityEvidence {
  kind: ValidityEvidenceKind;
  /** Was der Beleg stützt oder widerlegt. */
  supports: 'valid-from' | 'valid-to' | 'active-at-baseline' | 'text-state' | 'completeness' | 'contradiction';
  statement: string;
  date?: string;
  sourceUrl?: string;
  sha256?: string;
}

export interface ManifestRawDocument {
  role: 'version-page' | 'legacy-text' | 'annex' | 'pdf' | 'stem-page' | 'gazette-amendment';
  url: string;
  finalUrl: string;
  sha256: string;
  contentType: string;
  retrievedAt: string;
  byteLength: number;
  localSource?: string;
}

export interface ReconstructionSource {
  role: 'base' | 'amendment' | 'change-history';
  label: string;
  url: string;
  sha256: string;
  retrievedAt: string;
  localSource?: string;
  citation?: string;
  inForce?: string;
}

export interface ReconstructionStepRecord {
  id: string;
  amendment: string;
  mode: 'forward' | 'reverse';
  operation: string;
  target: string;
  instruction: string;
  beforeFingerprint: string;
  afterFingerprint: string;
  /** Blöcke, die durch das Zurücknehmen einer Einfügung leer wurden und entfallen. */
  removedBlocks?: number;
}

export interface ManifestOverride {
  field: 'sourceValidTo';
  value: string | null;
  reason: string;
}

export interface ManifestEntry {
  sourceSystem: 'recht-nrw';
  sourceArea: SourceArea;
  /** Dokumenttyp der Quelle: LRGV gesetz|rechtsverordnung; LRMB verwaltungsvorschrift|allgemeine-verwaltungsvorschrift|runderlass|richtlinie|durchfuehrungserlass|sonstige-verwaltungsvorschrift. */
  sourceDocumentType: string;
  sourceIdentity: string;
  sourceTitle: string;
  /** URL-Segment des Portals (gesetz, rechtsverordnung, verwaltungsvorschrift, bekanntmachung). */
  sourceType: string;
  /** Adresse, mit der der Import gestartet wurde. */
  sourceUrl: string;
  /** Stabile Adresse der Stammnorm (Taxonomie-Term). */
  stemUrl: string;
  /** Gewählte Quellfassung (Adresse und Portalintervall). */
  sourceVersion: { url: string; validFrom?: string; validTo?: string | null };
  selectedVersionUrl: string;
  sourceValidFrom: string;
  sourceValidTo: string | null;
  baselineStatus: BaselineStatus;
  validityEvidence: ValidityEvidence[];
  retrievedAt: string;
  sha256: string;
  contentType: string;
  contentFormat: 'legacy-file' | 'native';
  parserVersion: string;
  transformerVersion: string;
  targetJurisdiction: JurisdictionId;
  /** Leer, wenn nichts übernommen wurde (ausgeschlossen, Review, fehlgeschlagen vor der Transformation). */
  targetSlug: string;
  baselineDate: string;
  importStatus: ImportStatus;
  reviewStatus: ReviewStatus;
  reconstructionStatus: ReconstructionStatus;
  reconstructionSources: ReconstructionSource[];
  reconstructionSteps: ReconstructionStepRecord[];
  /** Nur LRMB: Normativitätsentscheidung mit Gründen. */
  normativity?: { decision: 'include' | 'exclude' | 'review'; reasons: string[] };
  importedAt: string;
  rawDocuments: ManifestRawDocument[];
  versionsConsidered: Array<{ validFrom: string; validTo: string | null; url?: string; selected: boolean }>;
  overrides: ManifestOverride[];
  findings: ImportFinding[];
  integrity: { fetchParse: boolean; sourceCanonical: boolean };
  transformation: { changes: number; unresolved: number; detections?: number; postTransformAudit?: boolean; reportPath?: string };
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

export interface LrmbSampleCorpusEntry {
  url: string;
  sourceType: string;
  fundstelle: string;
  expected: { decision: 'include' | 'exclude' | 'review'; baselineStatus: BaselineStatus; textStatus: 'direct' | 'reconstructed' | 'reconstruction-required' | 'not-applicable' };
  specialty: string;
  rationale: string;
}

export interface LrmbSampleCorpus {
  schemaVersion: 'recht-nrw-lrmb-sample-corpus/1';
  description: string;
  entries: LrmbSampleCorpusEntry[];
}

export async function readLrmbSampleCorpus(root: string): Promise<LrmbSampleCorpus> {
  const parsed = JSON.parse(await readFile(join(root, LRMB_SAMPLE_CORPUS_PATH), 'utf8')) as LrmbSampleCorpus;
  if (parsed.schemaVersion !== 'recht-nrw-lrmb-sample-corpus/1') throw new Error(`${LRMB_SAMPLE_CORPUS_PATH}: unbekannte Schemaversion`);
  return parsed;
}

export function emptyManifest(): ImportManifest {
  return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: 'recht-nrw', baselineDate: SIMULATION_BASELINE_DATE, entries: [] };
}

/** Hochstufung eines Eintrags der Schemaversion 1 (nur LRGV, Transformer 1.0.0). */
export function upgradeManifestEntryV1(entry: Record<string, unknown>): ManifestEntry {
  const legacy = entry as unknown as Omit<ManifestEntry, 'sourceArea' | 'sourceDocumentType' | 'sourceVersion' | 'baselineStatus' | 'validityEvidence' | 'transformerVersion' | 'reviewStatus' | 'reconstructionStatus' | 'reconstructionSources' | 'reconstructionSteps'>;
  const imported = legacy.importStatus === 'imported' || legacy.importStatus === 'imported-with-warnings';
  return {
    ...legacy,
    sourceArea: 'lrgv',
    sourceDocumentType: legacy.sourceType,
    sourceVersion: { url: legacy.selectedVersionUrl, validFrom: legacy.sourceValidFrom, validTo: legacy.sourceValidTo },
    baselineStatus: imported ? 'active-at-baseline' : 'undetermined',
    validityEvidence: imported ? [{ kind: 'portal-version-interval', supports: 'active-at-baseline', statement: `RECHT.NRW-Fassung gültig ${legacy.sourceValidFrom} bis ${legacy.sourceValidTo ?? 'offen'} (aus Manifest v1 übernommen)`, sourceUrl: legacy.selectedVersionUrl, sha256: legacy.sha256 }] : [],
    transformerVersion: 'recht-nrw-transformer/1.0.0',
    reviewStatus: legacy.transformation.unresolved > 0 ? 'open' : 'none',
    reconstructionStatus: imported ? 'direct' : 'not-applicable',
    reconstructionSources: [],
    reconstructionSteps: [],
  };
}

export async function readManifest(root: string): Promise<ImportManifest> {
  let parsed: { schemaVersion?: string; entries?: Array<Record<string, unknown>>; baselineDate?: string };
  try {
    parsed = JSON.parse(await readFile(join(root, MANIFEST_PATH), 'utf8')) as typeof parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest();
    throw error;
  }
  if (parsed.schemaVersion === MANIFEST_SCHEMA_V1) {
    return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: 'recht-nrw', baselineDate: parsed.baselineDate ?? SIMULATION_BASELINE_DATE, entries: (parsed.entries ?? []).map(upgradeManifestEntryV1) };
  }
  if (parsed.schemaVersion !== MANIFEST_SCHEMA) throw new Error(`${MANIFEST_PATH}: unbekannte Schemaversion ${parsed.schemaVersion}`);
  return parsed as unknown as ImportManifest;
}

export async function writeManifest(root: string, manifest: ImportManifest): Promise<string> {
  const target = join(root, MANIFEST_PATH);
  await mkdir(dirname(target), { recursive: true });
  const sorted: ImportManifest = { ...manifest, schemaVersion: MANIFEST_SCHEMA, entries: [...manifest.entries].sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity)) };
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
