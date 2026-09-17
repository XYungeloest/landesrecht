/**
 * Gemeinsames Importmanifest des RECHT.NRW-Imports für beide Quellbereiche: LRGV (Gesetze und
 * Rechtsverordnungen) und LRMB (Verwaltungsvorschriften aus dem Ministerialblatt). Je Stammnorm ein
 * Eintrag.
 *
 * Ablage (bulkfähig): eine Datei je Stammnorm unter
 * `data/imports/recht-nrw/manifest/<bereich>/term-<id>.json`. Nach jeder verarbeiteten Stammnorm wird
 * genau diese Datei atomar geschrieben – ein Manifest mit mehreren Tausend Einträgen muss dafür nicht
 * neu geschrieben werden, und ein Abbruch beschädigt keine anderen Einträge. Das frühere
 * Einzeldatei-Manifest (`manifest.json`, Schema 1 oder 2) wird beim Lesen übernommen und beim
 * nächsten Schreiben in Einzeldateien überführt.
 *
 * Laufmetadaten (`importedAt`, `runId`) ändern sich nur, wenn sich der fachliche Inhalt eines Eintrags
 * ändert; ein Wiederholungslauf mit unveränderten Quellen erzeugt keinen Diff.
 */
import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { CorruptStateError, readJsonFile, TEMP_PREFIX, writeJsonAtomic } from './atomic.ts';

export const MANIFEST_SCHEMA = 'recht-nrw-import-manifest/2' as const;
export const MANIFEST_SCHEMA_V1 = 'recht-nrw-import-manifest/1';
export const MANIFEST_ENTRY_SCHEMA = 'recht-nrw-import-manifest-entry/2' as const;
export const IMPORT_DATA_DIR = join('data', 'imports', 'recht-nrw');
/** Früheres Einzeldatei-Manifest (nur noch Lesen/Migration). */
export const MANIFEST_PATH = join(IMPORT_DATA_DIR, 'manifest.json');
export const MANIFEST_DIR = join(IMPORT_DATA_DIR, 'manifest');
export const SAMPLE_CORPUS_PATH = join(IMPORT_DATA_DIR, 'sample-corpus.json');
export const LRMB_SAMPLE_CORPUS_PATH = join(IMPORT_DATA_DIR, 'lrmb-sample-corpus.json');
export const RECONSTRUCTIONS_DIR = join(IMPORT_DATA_DIR, 'reconstructions');
export const AUDIT_DIR = join('data', 'audits', 'recht-nrw');
/** Versionierte Rohquellen der Beispielkorpora (Ausnahme; im Bulkimport verboten). */
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

/**
 * Provenienz der Stichtagsgeltung: wie im kanonischen Modell (`exact`, `verified-active-at-baseline`,
 * `reconstructed`), zusätzlich `undetermined` – nur im Manifest, nie in einer Fassung (kein Import).
 */
export const VALIDITY_PROVENANCES = ['exact', 'verified-active-at-baseline', 'reconstructed', 'undetermined'] as const;
export type ValidityProvenance = (typeof VALIDITY_PROVENANCES)[number];

export const RECONSTRUCTION_STATUSES = ['direct', 'reconstructed', 'reconstruction-required', 'not-applicable'] as const;
export type ReconstructionStatus = (typeof RECONSTRUCTION_STATUSES)[number];

/** Vollständigkeit des Normtextes (PDF-Policy, docs/RECHT_NRW_BULK_READINESS.md). */
export const TEXT_COMPLETENESS = ['html-complete', 'html-with-pdf-attachments', 'pdf-only', 'pdf-only-essential-attachments', 'essential-attachment-missing', 'structured-transcription'] as const;
export type TextCompleteness = (typeof TEXT_COMPLETENESS)[number];

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
  'successor-repeal',
  'search-index-signal',
  'reconstruction',
  'override',
] as const;
export type ValidityEvidenceKind = (typeof VALIDITY_EVIDENCE_KINDS)[number];

/**
 * Beweisklassen (docs/RECHT_NRW_LRMB_IMPORT.md, Abschnitt 4; Entscheidungsregeln in `lrmb/validity.ts`):
 *   strong         amtlicher Beleg mit eindeutiger Identität und Datum – trägt allein eine Statusentscheidung
 *   supporting     amtlicher Beleg ohne Datum oder ohne eindeutige Identität – stützt, entscheidet nie allein
 *   insufficient   Suchindex, Titelähnlichkeit, bloßes Vorhandensein – nur Hinweis
 *   contradictory  zwei starke Belege widersprechen einander (oder ein starker Beleg widerspricht der
 *                  Änderungshistorie) – keine automatische Entscheidung, Review
 */
export const EVIDENCE_STRENGTHS = ['strong', 'supporting', 'insufficient', 'contradictory'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const EVIDENCE_SUPPORTS = ['valid-from', 'valid-to', 'active-at-baseline', 'text-state', 'completeness', 'contradiction', 'continuity'] as const;
export type EvidenceSupports = (typeof EVIDENCE_SUPPORTS)[number];

export const SUCCESSOR_STATEMENT_KINDS = ['repealed', 'expired', 'replaced', 'obsolete', 'not-applicable', 'new-version'] as const;

/**
 * Nachfolgebeleg: eine andere amtliche Vorschrift (RECHT.NRW-Seite oder Ministerialblatt-Eintrag) hebt die
 * Vorschrift auf, setzt sie außer Kraft oder ersetzt sie. Prüfhinweis mit Beleg – nie eine `successor`-Relation
 * im kanonischen Normmodell.
 */
export interface SuccessorEvidenceRecord {
  /** Vorgängeridentität, wie die Nachfolgevorschrift sie nennt (Ausfertigungsdatum + Fundstelle/Nummer/Az.). */
  predecessorIdentity: string;
  successorTitle: string;
  /** Quellidentität der Nachfolgevorschrift im Manifest (`term:<id>`), falls bekannt. */
  successorIdentity?: string;
  statementKind: (typeof SUCCESSOR_STATEMENT_KINDS)[number];
  /** Wirksamkeitsdatum der Aufhebung/Ablösung (ISO), nur wenn amtlich belegt. */
  effectiveDate?: string;
  effectiveDerivation: string;
  /** Fundstelle(n) der Vorgängervorschrift im Wortlaut der Aufhebungsformel. */
  citation: string;
  /** Übereinstimmende Merkmale der Zuordnung (date, gazette-page, smbl-number, file-reference, title-keyword). */
  matched: string[];
  sourceUrl: string;
  sha256: string;
  evidenceStrength: EvidenceStrength;
}

export interface ValidityEvidence {
  kind: ValidityEvidenceKind;
  /** Was der Beleg stützt oder widerlegt. */
  supports: EvidenceSupports;
  /** Beweisklasse (siehe `EVIDENCE_STRENGTHS`). */
  strength?: EvidenceStrength;
  statement: string;
  date?: string;
  sourceUrl?: string;
  sha256?: string;
  /** Fundstelle (Ministerialblatt), auf die sich der Beleg stützt. */
  citation?: string;
  /** Wörtlicher Textausschnitt der Quelle (Leerraum normalisiert, gekürzt). */
  excerpt?: string;
  /** Nur `successor-repeal`: strukturierter Nachfolgebeleg. */
  successor?: SuccessorEvidenceRecord;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

/** Schemaprüfung eines Belegs (additiv, fail-closed): Liste der Probleme, leer bei gültigem Beleg. */
export function validateValidityEvidence(value: unknown): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object') return ['Beleg ist kein Objekt'];
  const evidence = value as Record<string, unknown>;
  if (!(VALIDITY_EVIDENCE_KINDS as readonly string[]).includes(String(evidence.kind))) problems.push(`unbekannte Belegart ${String(evidence.kind)}`);
  if (!(EVIDENCE_SUPPORTS as readonly string[]).includes(String(evidence.supports))) problems.push(`unbekannte Aussage ${String(evidence.supports)}`);
  if (evidence.strength !== undefined && !(EVIDENCE_STRENGTHS as readonly string[]).includes(String(evidence.strength))) problems.push(`unbekannte Beweisklasse ${String(evidence.strength)}`);
  if (typeof evidence.statement !== 'string' || evidence.statement.trim() === '') problems.push('statement fehlt');
  for (const field of ['date'] as const) if (evidence[field] !== undefined && (typeof evidence[field] !== 'string' || !ISO_DATE.test(evidence[field] as string))) problems.push(`${field} ist kein ISO-Datum`);
  if (evidence.sha256 !== undefined && (typeof evidence.sha256 !== 'string' || evidence.sha256 === '')) problems.push('sha256 ungültig');
  for (const field of ['sourceUrl', 'citation', 'excerpt'] as const) if (evidence[field] !== undefined && typeof evidence[field] !== 'string') problems.push(`${field} ist keine Zeichenkette`);
  if (evidence.kind === 'successor-repeal' && evidence.successor === undefined) problems.push('successor-repeal ohne strukturierten Nachfolgebeleg');
  if (evidence.successor !== undefined) {
    const successor = evidence.successor as Record<string, unknown>;
    if (!successor || typeof successor !== 'object') problems.push('successor ist kein Objekt');
    else {
      for (const field of ['predecessorIdentity', 'successorTitle', 'effectiveDerivation', 'citation', 'sourceUrl'] as const) if (typeof successor[field] !== 'string' || (successor[field] as string).trim() === '') problems.push(`successor.${field} fehlt`);
      if (!(SUCCESSOR_STATEMENT_KINDS as readonly string[]).includes(String(successor.statementKind))) problems.push(`successor.statementKind unbekannt (${String(successor.statementKind)})`);
      if (successor.effectiveDate !== undefined && (typeof successor.effectiveDate !== 'string' || !ISO_DATE.test(successor.effectiveDate))) problems.push('successor.effectiveDate ist kein ISO-Datum');
      if (typeof successor.sha256 !== 'string' || !SHA256.test(successor.sha256)) problems.push('successor.sha256 ungültig');
      if (!Array.isArray(successor.matched) || successor.matched.some((item) => typeof item !== 'string')) problems.push('successor.matched fehlt');
      if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(String(successor.evidenceStrength))) problems.push(`successor.evidenceStrength unbekannt (${String(successor.evidenceStrength)})`);
      if (successor.evidenceStrength === 'strong' && successor.effectiveDate === undefined) problems.push('starker Nachfolgebeleg ohne Wirksamkeitsdatum');
    }
  }
  return problems;
}

export const RAW_DOCUMENT_ROLES = ['version-page', 'legacy-text', 'annex', 'pdf', 'stem-page', 'gazette-amendment'] as const;
export type RawDocumentRole = (typeof RAW_DOCUMENT_ROLES)[number];

export interface ManifestRawDocument {
  role: RawDocumentRole;
  url: string;
  finalUrl: string;
  sha256: string;
  contentType: string;
  retrievedAt: string;
  byteLength: number;
  /** Beispielkorpus: versionierte Kopie unter `sources/recht-nrw/`. */
  localSource?: string;
  /** Bulk: unveränderliches R2-Objekt. */
  bucket?: string;
  objectKey?: string;
  /** staged: im lokalen Staging (außerhalb von Git), uploaded/verified: in R2, Rücklesung geprüft. */
  archiveStatus?: 'versioned' | 'staged' | 'uploaded' | 'verified';
}

export interface ReconstructionSource {
  role: 'base' | 'amendment' | 'change-history';
  label: string;
  url: string;
  sha256: string;
  retrievedAt: string;
  localSource?: string;
  objectKey?: string;
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

/** Arbeitsgrundlage der Rekonstruktionsqueue (keine rechtliche Bewertung). */
export interface ReconstructionPlan {
  direction: 'reverse' | 'forward' | 'mixed';
  amendments: Array<{ decreeDate?: string; citation?: string; inForce?: string; gazetteUrl?: string; gazetteSha256?: string; instructionCount: number; direction: 'reverse' | 'forward' }>;
  /** Anteil der Änderungen mit abrufbarem und zugeordnetem Ministerialblatt-Eintrag. */
  sourceCompleteness: number;
  estimatedSteps: number;
}

export interface ManifestOverride {
  field: string;
  value: unknown;
  reason: string;
  id?: string;
  evidence?: { source: string; url?: string; sha256?: string; note?: string };
  reviewedAt?: string;
}

export interface ManifestAttachment {
  label: string;
  url: string;
  mediaType: string;
  /** Ergebnis der PDF-Prüfung (Textlayer oder Scan). */
  pdf?: { pages?: number; textLayer: boolean; scanLike: boolean; encrypted: boolean };
  essential: boolean;
  handling: 'html-annex' | 'archived-source-only' | 'structured-transcription' | 'review';
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
  validityProvenance?: ValidityProvenance;
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
  reconstructionPlan?: ReconstructionPlan;
  /** Nur LRMB: Normativitätsentscheidung mit Gründen. */
  normativity?: { decision: 'include' | 'exclude' | 'review'; reasons: string[] };
  /** Dokumentidentität und Plausibilität des Normkörpers. */
  documentIdentity?: { status: 'consistent' | 'review' | 'mismatch'; signals: string[] };
  textCompleteness?: TextCompleteness;
  attachments?: ManifestAttachment[];
  /** Zustimmungsgesetz zu einem Staatsvertrag (LRGV). */
  consentLaw?: { detected: boolean; treatyTitle?: string; treatyTextLocation: 'html-annex' | 'pdf-attachment' | 'inline' | 'unknown'; evidence: string[] };
  /** Ablage der Rohquellen: versionierter Beispielkorpus oder R2. */
  archive?: { mode: 'versioned-sample' | 'r2'; bucket?: string };
  importedAt: string;
  /** Kennung des Laufs, der den fachlichen Inhalt zuletzt geändert hat. */
  runId?: string;
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

export interface ManifestShard {
  schemaVersion: typeof MANIFEST_ENTRY_SCHEMA;
  entry: ManifestEntry;
}

export interface SampleCorpusEntry {
  url: string;
  rationale: string;
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

/** Laufmetadaten, die fachlich nicht zählen (Determinismus-Vergleich, stabile Zeitstempel). */
export const MANIFEST_RUNTIME_FIELDS = ['importedAt', 'runId'] as const;

export async function readLrmbSampleCorpus(root: string): Promise<LrmbSampleCorpus> {
  const parsed = await readJsonFile<LrmbSampleCorpus>(join(root, LRMB_SAMPLE_CORPUS_PATH));
  if (parsed?.schemaVersion !== 'recht-nrw-lrmb-sample-corpus/1') throw new Error(`${LRMB_SAMPLE_CORPUS_PATH}: fehlt oder unbekannte Schemaversion`);
  return parsed;
}

export async function readSampleCorpus(root: string): Promise<SampleCorpus> {
  const parsed = await readJsonFile<SampleCorpus>(join(root, SAMPLE_CORPUS_PATH));
  if (parsed?.schemaVersion !== 'recht-nrw-sample-corpus/1') throw new Error(`${SAMPLE_CORPUS_PATH}: fehlt oder unbekannte Schemaversion`);
  return parsed;
}

export function emptyManifest(): ImportManifest {
  return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: 'recht-nrw', baselineDate: SIMULATION_BASELINE_DATE, entries: [] };
}

/** Numerische Ordnung für `term:<id>`, sonst Codepunkt-Ordnung (unabhängig von der Locale). */
export function compareSourceIdentity(left: string, right: string): number {
  const leftTerm = /^term:(\d+)$/u.exec(left);
  const rightTerm = /^term:(\d+)$/u.exec(right);
  if (leftTerm && rightTerm) return Number(leftTerm[1]) - Number(rightTerm[1]);
  if (leftTerm) return -1;
  if (rightTerm) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Dateiname einer Stammnorm: `term-<id>`, sonst ein Hash der Kennung. */
export function identityFileName(sourceIdentity: string): string {
  const term = /^term:(\d+)$/u.exec(sourceIdentity);
  if (term) return `term-${term[1]}`;
  return `id-${createHash('sha256').update(sourceIdentity).digest('hex').slice(0, 20)}`;
}

export function manifestEntryPath(area: SourceArea, sourceIdentity: string): string {
  return join(MANIFEST_DIR, area, `${identityFileName(sourceIdentity)}.json`);
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

async function readLegacyManifest(root: string): Promise<ManifestEntry[]> {
  const parsed = await readJsonFile<{ schemaVersion?: string; entries?: Array<Record<string, unknown>> }>(join(root, MANIFEST_PATH));
  if (!parsed) return [];
  if (parsed.schemaVersion === MANIFEST_SCHEMA_V1) return (parsed.entries ?? []).map(upgradeManifestEntryV1);
  if (parsed.schemaVersion !== MANIFEST_SCHEMA) throw new CorruptStateError(MANIFEST_PATH, `unbekannte Schemaversion ${parsed.schemaVersion}`);
  return (parsed.entries ?? []) as unknown as ManifestEntry[];
}

async function listShardFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith('.json') && !file.startsWith(TEMP_PREFIX)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Liest einen einzelnen Manifesteintrag (Shard) oder `undefined`. */
export async function readManifestEntry(root: string, area: SourceArea, sourceIdentity: string): Promise<ManifestEntry | undefined> {
  const file = join(root, manifestEntryPath(area, sourceIdentity));
  const shard = await readJsonFile<ManifestShard>(file);
  if (!shard) return undefined;
  if (shard.schemaVersion !== MANIFEST_ENTRY_SCHEMA || !shard.entry) throw new CorruptStateError(file, `unbekannte Schemaversion ${shard.schemaVersion}`);
  return shard.entry;
}

export async function readManifest(root: string): Promise<ImportManifest> {
  const byIdentity = new Map<string, ManifestEntry>();
  for (const entry of await readLegacyManifest(root)) byIdentity.set(entry.sourceIdentity, entry);
  for (const area of SOURCE_AREAS) {
    const directory = join(root, MANIFEST_DIR, area);
    for (const file of await listShardFiles(directory)) {
      const path = join(directory, file);
      const shard = await readJsonFile<ManifestShard>(path);
      if (!shard || shard.schemaVersion !== MANIFEST_ENTRY_SCHEMA || !shard.entry?.sourceIdentity) throw new CorruptStateError(path, 'kein gültiger Manifesteintrag');
      if (shard.entry.sourceArea !== area) throw new CorruptStateError(path, `Eintrag gehört zum Bereich ${shard.entry.sourceArea}, liegt aber unter ${area}`);
      if (`${identityFileName(shard.entry.sourceIdentity)}.json` !== file) throw new CorruptStateError(path, `Dateiname passt nicht zur Quellidentität ${shard.entry.sourceIdentity}`);
      byIdentity.set(shard.entry.sourceIdentity, shard.entry);
    }
  }
  return { ...emptyManifest(), entries: [...byIdentity.values()].sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity)) };
}

function withoutRuntime(entry: ManifestEntry): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...entry };
  for (const field of MANIFEST_RUNTIME_FIELDS) delete copy[field];
  return copy;
}

/**
 * Schreibt einen Eintrag atomar. Ist der fachliche Inhalt unverändert, bleiben die Laufmetadaten des
 * gespeicherten Eintrags erhalten (kein Diff bei Wiederholungsläufen).
 */
export async function writeManifestEntry(root: string, entry: ManifestEntry): Promise<{ path: string; changed: boolean }> {
  const path = manifestEntryPath(entry.sourceArea, entry.sourceIdentity);
  const previous = await readManifestEntry(root, entry.sourceArea, entry.sourceIdentity);
  let next = entry;
  if (previous && JSON.stringify(withoutRuntime(previous)) === JSON.stringify(withoutRuntime(entry))) {
    next = { ...entry };
    for (const field of MANIFEST_RUNTIME_FIELDS) {
      if (previous[field] === undefined) delete next[field];
      else (next as unknown as Record<string, unknown>)[field] = previous[field];
    }
  }
  const shard: ManifestShard = { schemaVersion: MANIFEST_ENTRY_SCHEMA, entry: next };
  const changed = await writeJsonAtomic(join(root, path), shard);
  return { path: path.replace(/\\/gu, '/'), changed };
}

/** Schreibt alle Einträge als Einzeldateien und entfernt das frühere Einzeldatei-Manifest. */
export async function writeManifest(root: string, manifest: ImportManifest): Promise<string> {
  for (const entry of [...manifest.entries].sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity))) await writeManifestEntry(root, entry);
  await rm(join(root, MANIFEST_PATH), { force: true });
  return join(root, MANIFEST_DIR);
}

export function upsertManifestEntry(manifest: ImportManifest, entry: ManifestEntry): ImportManifest {
  const entries = manifest.entries.filter((existing) => existing.sourceIdentity !== entry.sourceIdentity);
  entries.push(entry);
  return { ...manifest, entries };
}

export const isImportedStatus = (status: ImportStatus): boolean => status === 'imported' || status === 'imported-with-warnings';
