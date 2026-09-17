/**
 * Importmanifest des BAYERN.RECHT-Adapters: ein Eintrag je Stammnorm, eine Datei je Eintrag.
 *
 * Ablage (bulkfähig, wie West und NSH): `data/imports/bayernrecht/manifest/<bereich>/<identität>.json`.
 * Nach jeder verarbeiteten Stammnorm wird genau diese Datei atomar geschrieben; ein Abbruch beschädigt
 * keine anderen Einträge. Laufmetadaten (`importedAt`, `runId`) ändern sich nur, wenn sich der fachliche
 * Inhalt ändert – ein Wiederholungslauf mit unveränderten Quellen erzeugt keinen Diff.
 *
 * Wiederverwendung statt Kopie: Die atomaren Schreib-/Lesevorgänge kommen unverändert aus dem erprobten
 * West-Adapter (`@landesrecht/importer-recht-nrw/common/atomic.ts`); sie kennen weder Portal noch
 * Jurisdiktion. Der Manifestinhalt dagegen ist portalspezifisch (Pfade, Bereiche, Kennzeichen) und deshalb
 * hier neu geschrieben – bewusst feldgleich zum NSH-Manifest, damit ein gemeinsamer Unterbau
 * (`@landesrecht/importer-common`) später leichtfällt; siehe Modulkopf von `environment.ts`.
 *
 * Gegenüber West zusätzlich:
 *   baselineRecoveryMethod  Wie der Stichtagsstand gewonnen wurde. BAYERN.RECHT führt für viele
 *                           Vorschriften nur die aktuelle Fassung; der Stichtag 2023-12-01 muss deshalb
 *                           oft über historische Fassungen, das Zurücknehmen späterer Änderungen oder
 *                           aus Verkündungen gewonnen werden.
 *   sourceProvenance        Wie amtlich die benutzte Darstellung ist (gedruckt/elektronisch amtlich,
 *                           Portalfaksimile oder born-digital) – reine Provenienz, nie Normtext.
 *
 * Bayern-spezifisch zusätzlich:
 *   bayRsNumber             Die amtliche Gliederungsnummer der Bayerischen Rechtssammlung (BayRS), z. B.
 *                           „2170-1-1-I“. Sie ist kein Ersatz für `sourceIdentity` (die Quellidentität
 *                           bleibt die Kennung des Portals), sondern ein Identitätshinweis: Sie bindet den
 *                           Eintrag an die amtliche Systematik, macht Verwechslungen gleichnamiger
 *                           Vorschriften erkennbar und trägt die fachliche Ordnung des Bestands.
 *                           Optional, weil Verwaltungsvorschriften und Verkündungsereignisse keine
 *                           BayRS-Nummer führen – ist sie gesetzt, wird sie hart geprüft.
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CorruptStateError, readJsonFile, TEMP_PREFIX, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import { BASELINE_DATE, PARSER_VERSION, SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from './constants.ts';
import { BASELINE_STATUSES, validateEvidenceList, type BaselineStatus, type ValidityEvidence } from './evidence.ts';
import { compareSourceIdentity, identityFileName, isBayRsNumber, manifestAreaDir, manifestEntryPath } from './paths.ts';

export const MANIFEST_SCHEMA = 'bayernrecht-import-manifest/1' as const;
export const MANIFEST_ENTRY_SCHEMA = 'bayernrecht-import-manifest-entry/1' as const;

/** Statuswerte wie West und NSH – Auswertungen über alle Bestände bleiben vergleichbar. */
export const IMPORT_STATUSES = ['imported', 'imported-with-warnings', 'dry-run', 'failed', 'needs-review', 'excluded', 'not-at-baseline'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const REVIEW_STATUSES = ['none', 'open', 'resolved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Wie der Stichtagsstand gewonnen wurde:
 *   current-source                   die abgerufene Quellfassung gilt am Stichtag selbst
 *   portal-historical-version        eine im Portal geführte historische Fassung deckt den Stichtag
 *   reverse-post-baseline-event      spätere Änderungen wurden nachvollziehbar zurückgenommen
 *   reconstructed-from-publications  Stand aus Verkündungen zusammengesetzt (nur mit geprüftem Rezept)
 *
 * Gegenüber dem NSH-Adapter heißt der zweite Wert `portal-historical-version` statt
 * `historical-juris-version`: Er benennt die Portalfunktion, nicht den Anbieter.
 */
export const BASELINE_RECOVERY_METHODS = ['current-source', 'portal-historical-version', 'reverse-post-baseline-event', 'reconstructed-from-publications'] as const;
export type BaselineRecoveryMethod = (typeof BASELINE_RECOVERY_METHODS)[number];

export const PUBLICATION_AUTHORITIES = ['printed-official', 'electronic-official', 'unknown'] as const;
export const DIGITAL_REPRESENTATIONS = ['official-portal-facsimile', 'born-digital', 'unknown'] as const;

/** Provenienz der benutzten Darstellung – Aussage über die Quelle, nie über den Normtext. */
export interface SourceProvenance {
  publicationAuthority: (typeof PUBLICATION_AUTHORITIES)[number];
  digitalRepresentation: (typeof DIGITAL_REPRESENTATIONS)[number];
  /** Klartextnachweis, woraus die Einstufung folgt (Portalvermerk, Fundstelle, Impressum). */
  note?: string;
}

export const RAW_DOCUMENT_ROLES = ['version-page', 'stem-page', 'text-document', 'annex', 'pdf', 'gazette', 'event-page'] as const;
export type RawDocumentRole = (typeof RAW_DOCUMENT_ROLES)[number];

export const ARCHIVE_STATUSES = ['versioned', 'staged', 'uploaded', 'verified'] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export interface ManifestRawDocument {
  role: RawDocumentRole;
  url: string;
  finalUrl: string;
  sha256: string;
  contentType: string;
  retrievedAt: string;
  byteLength: number;
  /** Versionierter Beispielkorpus (nur Stichprobe; im Bulk verboten). */
  localSource?: string;
  /** Bulk: unveränderliches R2-Objekt unter dem Präfix aus `constants.ts`. */
  bucket?: string;
  objectKey?: string;
  archiveStatus?: ArchiveStatus;
}

export interface ManifestOverride {
  field: string;
  value: unknown;
  reason: string;
  id?: string;
  evidence?: { source: string; url?: string; sha256?: string; note?: string };
  reviewedAt?: string;
}

export interface ManifestVersionConsidered {
  validFrom: string;
  validTo: string | null;
  url?: string;
  selected: boolean;
}

export interface ManifestEntry {
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceArea: SourceArea;
  /** Stabile Quellkennung der Stammnorm im Portal (Format folgt der Quellen-Discovery). */
  sourceIdentity: string;
  /** Bayern-spezifisch: amtliche BayRS-Gliederungsnummer als Identitätshinweis (kein Ersatz der Kennung). */
  bayRsNumber?: string;
  sourceTitle: string;
  /** Dokumentart der Quelle (Gesetz, Verordnung, Verwaltungsvorschrift …), wie die Quelle sie führt. */
  sourceType: string;
  /** Adresse, mit der die Verarbeitung gestartet wurde. */
  sourceUrl: string;
  sourceVersion: { url: string; validFrom?: string; validTo?: string | null };
  selectedVersionUrl: string;
  sourceValidFrom: string;
  sourceValidTo: string | null;
  baselineStatus: BaselineStatus;
  /** Weg, auf dem der Stichtagsstand gewonnen wurde. */
  baselineRecoveryMethod: BaselineRecoveryMethod;
  /** Amtlichkeit und Digitalisierungsgrad der benutzten Darstellung. */
  sourceProvenance: SourceProvenance;
  validityEvidence: ValidityEvidence[];
  retrievedAt: string;
  sha256: string;
  contentType: string;
  parserVersion: string;
  transformerVersion: string;
  targetJurisdiction: JurisdictionId;
  /** Leer, solange nichts übernommen wurde (ausgeschlossen, Review, fehlgeschlagen). */
  targetSlug: string;
  baselineDate: string;
  importStatus: ImportStatus;
  reviewStatus: ReviewStatus;
  rawDocuments: ManifestRawDocument[];
  versionsConsidered: ManifestVersionConsidered[];
  overrides: ManifestOverride[];
  findings: ImportFinding[];
  integrity: { fetchParse: boolean; sourceCanonical: boolean };
  transformation: { changes: number; unresolved: number; detections?: number; postTransformAudit?: boolean; reportPath?: string };
  importedAt?: string;
  /** Kennung des Laufs, der den fachlichen Inhalt zuletzt geändert hat. */
  runId?: string;
}

export interface ImportManifest {
  schemaVersion: typeof MANIFEST_SCHEMA;
  sourceSystem: typeof SOURCE_SYSTEM;
  baselineDate: string;
  entries: ManifestEntry[];
}

export interface ManifestShard {
  schemaVersion: typeof MANIFEST_ENTRY_SCHEMA;
  entry: ManifestEntry;
}

/** Laufmetadaten, die fachlich nicht zählen (Determinismus-Vergleich, stabile Zeitstempel). */
export const MANIFEST_RUNTIME_FIELDS = ['importedAt', 'runId'] as const;

export function emptyManifest(): ImportManifest {
  return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: SOURCE_SYSTEM, baselineDate: BASELINE_DATE, entries: [] };
}

export const isImportedStatus = (status: ImportStatus): boolean => status === 'imported' || status === 'imported-with-warnings';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function oneOf(problems: string[], where: string, field: string, value: unknown, allowed: readonly string[]): void {
  if (!allowed.includes(String(value))) problems.push(`${where}: ${field} ist ${JSON.stringify(value)}, erwartet ${allowed.join('|')}`);
}

/**
 * Harte Schemaprüfung eines Manifesteintrags. Fail-closed: Jede Abweichung wird benannt, nichts wird
 * stillschweigend ergänzt oder umgedeutet. Rückgabe ist die Liste der Probleme (leer = gültig).
 */
export function validateManifestEntry(value: unknown, where = 'Manifesteintrag'): string[] {
  const problems: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${where}: kein Objekt`];
  const entry = value as Record<string, unknown>;

  if (entry.sourceSystem !== SOURCE_SYSTEM) problems.push(`${where}: sourceSystem ist ${String(entry.sourceSystem)}, erwartet ${SOURCE_SYSTEM}`);
  oneOf(problems, where, 'sourceArea', entry.sourceArea, SOURCE_AREAS);
  if (typeof entry.sourceIdentity !== 'string' || entry.sourceIdentity.trim() === '') problems.push(`${where}: sourceIdentity fehlt`);
  else if (/\s/u.test(entry.sourceIdentity)) problems.push(`${where}: sourceIdentity enthält Leerraum (${entry.sourceIdentity})`);
  if (entry.bayRsNumber !== undefined) {
    if (typeof entry.bayRsNumber !== 'string' || entry.bayRsNumber.trim() === '') problems.push(`${where}: bayRsNumber ist gesetzt, aber leer (Feld weglassen, wenn die Quelle keine führt)`);
    else if (!isBayRsNumber(entry.bayRsNumber)) problems.push(`${where}: bayRsNumber ${entry.bayRsNumber} ist keine BayRS-Gliederungsnummer`);
  }
  for (const field of ['sourceTitle', 'sourceType', 'sourceUrl', 'selectedVersionUrl', 'contentType', 'parserVersion', 'transformerVersion'] as const) {
    if (typeof entry[field] !== 'string' || (entry[field] as string).trim() === '') problems.push(`${where}: ${field} fehlt`);
  }
  if (typeof entry.targetSlug !== 'string') problems.push(`${where}: targetSlug fehlt (leer erlaubt)`);
  else if (entry.targetSlug !== '' && !SLUG.test(entry.targetSlug)) problems.push(`${where}: targetSlug ${entry.targetSlug} ist kein gültiger Slug`);
  if (entry.targetJurisdiction !== TARGET_JURISDICTION) problems.push(`${where}: targetJurisdiction ist ${String(entry.targetJurisdiction)}, erwartet ${TARGET_JURISDICTION}`);
  if (entry.baselineDate !== BASELINE_DATE) problems.push(`${where}: baselineDate ist ${String(entry.baselineDate)}, erwartet ${BASELINE_DATE}`);

  if (typeof entry.sourceValidFrom !== 'string' || !ISO_DATE.test(entry.sourceValidFrom)) problems.push(`${where}: sourceValidFrom ist kein ISO-Datum`);
  if (!(entry.sourceValidTo === null || (typeof entry.sourceValidTo === 'string' && ISO_DATE.test(entry.sourceValidTo)))) problems.push(`${where}: sourceValidTo ist weder null noch ISO-Datum`);
  if (typeof entry.sourceValidFrom === 'string' && typeof entry.sourceValidTo === 'string' && entry.sourceValidTo < entry.sourceValidFrom) problems.push(`${where}: sourceValidTo liegt vor sourceValidFrom`);
  if (typeof entry.retrievedAt !== 'string' || !ISO_TIMESTAMP.test(entry.retrievedAt)) problems.push(`${where}: retrievedAt ist kein ISO-Zeitstempel`);
  if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) problems.push(`${where}: sha256 ist kein SHA-256`);

  oneOf(problems, where, 'baselineStatus', entry.baselineStatus, BASELINE_STATUSES);
  oneOf(problems, where, 'baselineRecoveryMethod', entry.baselineRecoveryMethod, BASELINE_RECOVERY_METHODS);
  oneOf(problems, where, 'importStatus', entry.importStatus, IMPORT_STATUSES);
  oneOf(problems, where, 'reviewStatus', entry.reviewStatus, REVIEW_STATUSES);

  const provenance = entry.sourceProvenance as Record<string, unknown> | undefined;
  if (!provenance || typeof provenance !== 'object') problems.push(`${where}: sourceProvenance fehlt`);
  else {
    oneOf(problems, where, 'sourceProvenance.publicationAuthority', provenance.publicationAuthority, PUBLICATION_AUTHORITIES);
    oneOf(problems, where, 'sourceProvenance.digitalRepresentation', provenance.digitalRepresentation, DIGITAL_REPRESENTATIONS);
    if (provenance.note !== undefined && typeof provenance.note !== 'string') problems.push(`${where}: sourceProvenance.note ist keine Zeichenkette`);
  }

  const version = entry.sourceVersion as Record<string, unknown> | undefined;
  if (!version || typeof version !== 'object' || typeof version.url !== 'string') problems.push(`${where}: sourceVersion.url fehlt`);

  problems.push(...validateEvidenceList(entry.validityEvidence, `${where}.validityEvidence`));

  if (!Array.isArray(entry.rawDocuments)) problems.push(`${where}: rawDocuments fehlt`);
  else {
    entry.rawDocuments.forEach((raw: unknown, index: number) => {
      const document = raw as Record<string, unknown>;
      const at = `${where}.rawDocuments[${index}]`;
      if (!document || typeof document !== 'object') return problems.push(`${at}: kein Objekt`);
      oneOf(problems, at, 'role', document.role, RAW_DOCUMENT_ROLES);
      for (const field of ['url', 'finalUrl', 'contentType', 'retrievedAt'] as const) if (typeof document[field] !== 'string' || (document[field] as string) === '') problems.push(`${at}: ${field} fehlt`);
      if (typeof document.sha256 !== 'string' || !SHA256.test(document.sha256)) problems.push(`${at}: sha256 ist kein SHA-256`);
      if (typeof document.byteLength !== 'number' || !Number.isInteger(document.byteLength) || document.byteLength < 0) problems.push(`${at}: byteLength fehlt`);
      if (document.archiveStatus !== undefined) oneOf(problems, at, 'archiveStatus', document.archiveStatus, ARCHIVE_STATUSES);
      if (document.archiveStatus !== undefined && document.archiveStatus !== 'versioned' && typeof document.objectKey !== 'string') problems.push(`${at}: Archivstatus ${String(document.archiveStatus)} ohne objectKey`);
      return undefined;
    });
  }

  if (!Array.isArray(entry.versionsConsidered)) problems.push(`${where}: versionsConsidered fehlt`);
  else if (entry.versionsConsidered.filter((candidate: unknown) => (candidate as { selected?: boolean }).selected).length > 1) problems.push(`${where}: mehrere Fassungen als selected markiert`);
  if (!Array.isArray(entry.overrides)) problems.push(`${where}: overrides fehlt`);
  if (!Array.isArray(entry.findings)) problems.push(`${where}: findings fehlt`);

  const integrity = entry.integrity as Record<string, unknown> | undefined;
  if (!integrity || typeof integrity.fetchParse !== 'boolean' || typeof integrity.sourceCanonical !== 'boolean') problems.push(`${where}: integrity.fetchParse/sourceCanonical fehlen`);
  const transformation = entry.transformation as Record<string, unknown> | undefined;
  if (!transformation || typeof transformation.changes !== 'number' || typeof transformation.unresolved !== 'number') problems.push(`${where}: transformation.changes/unresolved fehlen`);

  // Übernommene Einträge brauchen Slug und Stichtagsgeltung; nicht übernommene dürfen keinen Slug tragen.
  if (typeof entry.importStatus === 'string' && (IMPORT_STATUSES as readonly string[]).includes(entry.importStatus)) {
    const imported = isImportedStatus(entry.importStatus as ImportStatus);
    if (imported && (entry.targetSlug === '' || entry.targetSlug === undefined)) problems.push(`${where}: übernommener Eintrag ohne targetSlug`);
    if (imported && entry.baselineStatus !== 'active-at-baseline') problems.push(`${where}: übernommener Eintrag mit baselineStatus ${String(entry.baselineStatus)}`);
    if (!imported && typeof entry.targetSlug === 'string' && entry.targetSlug !== '') problems.push(`${where}: nicht übernommener Eintrag (${entry.importStatus}) mit targetSlug ${entry.targetSlug}`);
  }
  return problems;
}

/** Wie `validateManifestEntry`, wirft aber mit vollständiger Problemliste. */
export function assertManifestEntry(value: unknown, where = 'Manifesteintrag'): ManifestEntry {
  const problems = validateManifestEntry(value, where);
  if (problems.length > 0) throw new Error(`${where} ist ungültig:\n  - ${problems.join('\n  - ')}`);
  return value as ManifestEntry;
}

/** Gerüst eines Eintrags mit den Adapterkonstanten; Pflichtfelder der Quelle müssen gesetzt werden. */
export function manifestEntryDefaults(): Pick<ManifestEntry, 'sourceSystem' | 'targetJurisdiction' | 'baselineDate' | 'parserVersion' | 'validityEvidence' | 'rawDocuments' | 'versionsConsidered' | 'overrides' | 'findings' | 'integrity' | 'transformation' | 'reviewStatus' | 'targetSlug'> {
  return {
    sourceSystem: SOURCE_SYSTEM,
    targetJurisdiction: TARGET_JURISDICTION,
    baselineDate: BASELINE_DATE,
    parserVersion: PARSER_VERSION,
    validityEvidence: [],
    rawDocuments: [],
    versionsConsidered: [],
    overrides: [],
    findings: [],
    integrity: { fetchParse: false, sourceCanonical: false },
    transformation: { changes: 0, unresolved: 0 },
    reviewStatus: 'none',
    targetSlug: '',
  };
}

async function listShardFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith('.json') && !file.startsWith(TEMP_PREFIX)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Liest einen einzelnen Manifesteintrag oder `undefined`; beschädigte oder schemawidrige Dateien brechen ab. */
export async function readManifestEntry(root: string, area: SourceArea, sourceIdentity: string): Promise<ManifestEntry | undefined> {
  const relative = manifestEntryPath(area, sourceIdentity);
  const shard = await readJsonFile<ManifestShard>(join(root, relative));
  if (!shard) return undefined;
  if (shard.schemaVersion !== MANIFEST_ENTRY_SCHEMA) throw new CorruptStateError(relative, `unbekannte Schemaversion ${String(shard.schemaVersion)}`);
  const problems = validateManifestEntry(shard.entry, relative);
  if (problems.length > 0) throw new CorruptStateError(relative, problems.join('; '));
  return shard.entry;
}

export async function readManifest(root: string): Promise<ImportManifest> {
  const byIdentity = new Map<string, ManifestEntry>();
  for (const area of SOURCE_AREAS) {
    const directory = join(root, manifestAreaDir(area));
    for (const file of await listShardFiles(directory)) {
      const relative = `${manifestAreaDir(area)}/${file}`;
      const shard = await readJsonFile<ManifestShard>(join(directory, file));
      if (!shard || shard.schemaVersion !== MANIFEST_ENTRY_SCHEMA) throw new CorruptStateError(relative, 'kein gültiger Manifesteintrag');
      const problems = validateManifestEntry(shard.entry, relative);
      if (problems.length > 0) throw new CorruptStateError(relative, problems.join('; '));
      if (shard.entry.sourceArea !== area) throw new CorruptStateError(relative, `Eintrag gehört zum Bereich ${shard.entry.sourceArea}, liegt aber unter ${area}`);
      if (`${identityFileName(shard.entry.sourceIdentity)}.json` !== file) throw new CorruptStateError(relative, `Dateiname passt nicht zur Quellidentität ${shard.entry.sourceIdentity}`);
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
 * Schreibt einen Eintrag atomar (Prüfung vor dem Schreiben). Ist der fachliche Inhalt unverändert, bleiben
 * die Laufmetadaten des gespeicherten Eintrags erhalten – kein Diff bei Wiederholungsläufen.
 */
export async function writeManifestEntry(root: string, entry: ManifestEntry): Promise<{ path: string; changed: boolean }> {
  assertManifestEntry(entry, `Manifesteintrag ${entry?.sourceIdentity ?? '?'}`);
  const relative = manifestEntryPath(entry.sourceArea, entry.sourceIdentity);
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
  const changed = await writeJsonAtomic(join(root, relative), shard);
  return { path: relative, changed };
}

/** Entfernt den Eintrag einer Stammnorm (nur für Reparaturläufe; im Normalbetrieb wird nichts gelöscht). */
export async function removeManifestEntry(root: string, area: SourceArea, sourceIdentity: string): Promise<void> {
  await rm(join(root, manifestEntryPath(area, sourceIdentity)), { force: true });
}

export async function writeManifest(root: string, manifest: ImportManifest): Promise<string> {
  for (const entry of [...manifest.entries].sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity))) await writeManifestEntry(root, entry);
  return join(root, 'data', 'imports', SOURCE_SYSTEM, 'manifest');
}

export function upsertManifestEntry(manifest: ImportManifest, entry: ManifestEntry): ImportManifest {
  const entries = manifest.entries.filter((existing) => existing.sourceIdentity !== entry.sourceIdentity);
  entries.push(entry);
  return { ...manifest, entries: entries.sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity)) };
}
