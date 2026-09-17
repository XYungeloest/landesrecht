/**
 * Vollständige Enumeration eines Quellbereichs (`data/imports/bayernrecht/enumeration-<bereich>.json`).
 *
 * Zwei unabhängige Quellen, wie im West-Adapter Sitemap und Suchindex:
 *
 *   Fortführungsnachweis  `/Content/Document/ffn` bzw. `/Content/Document/ffn-mbl`: Dokument-ID,
 *                         BayRS-Gliederungsnummer, Sachgebiet, Titel und – für Verwaltungsvorschriften –
 *                         die vollständige Änderungshistorie. Zwei Abrufe für den ganzen Bestand.
 *   Facetten-Trefferliste `/Search/Filter/NORMTYP/<typ>` samt Folgeseiten: Dokument-ID, **Normtyp** und
 *                         Rechtsstand. Nur diese Quelle nennt den Normtyp, und nur sie zählt den
 *                         vollständigen Portalbestand.
 *   Manifest              bereits verarbeitete Stammnormen – sie dürfen nie aus der Enumeration fallen.
 *
 * Schlüssel ist die Portal-Dokument-ID; sie ist zugleich die Quellidentität des Manifests. Anders als
 * bei RECHT.NRW gibt es keine Fassungsadressen und keine Term-IDs, die erst aufgelöst werden müssten:
 * Das Portal führt je Norm genau ein Dokument. Der Abgleich der beiden Quellen ist deshalb ein reiner
 * Mengenvergleich – und genau der macht die nach der Quellen-Discovery offene Abdeckungslücke sichtbar
 * (`data/audits/bayernrecht/ENUMERATION_GAP.md`).
 *
 * **Fixpunkt.** Der Rebuild wird mit seinem eigenen Ergebnis als Vorgänger wiederholt, bis sich
 * fachlich nichts mehr ändert (gleicher Fingerabdruck). Ein zweiter Rebuild aus denselben Eingaben ist
 * damit byteidentisch. Konvergiert er nicht innerhalb von `ENUMERATION_MAX_PASSES` Durchläufen, ist das
 * ein harter Fehler (`EnumerationFixpointError`) – keine stille Teillösung.
 *
 * Status: pending | processing | done | review | failed | excluded. `processing` markiert die gerade
 * bearbeitete Stammnorm (Checkpoint vor der Arbeit); nach einem harten Abbruch gilt sie beim Resume als
 * offen. Die Ausgabe ist deterministisch sortiert; ein Wiederholungslauf mit unveränderten Quellen
 * ändert die Datei nicht.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { BASELINE_DATE, type SourceArea } from '../common/constants.ts';
import { isImportedStatus, type ImportManifest, type ImportStatus, type ManifestEntry } from '../common/manifest.ts';
import { compareSourceIdentity, enumerationPath } from '../common/paths.ts';
import { latestChangeDate, type FfnDocument, type FfnEntry } from './fortfuehrungsnachweis.ts';
import type { FacetDocument } from './inventory.ts';
import { AREA_NORM_TYPES, documentUrl, zipUrl, type NormType } from './portal.ts';

export const ENUMERATION_SCHEMA = 'bayernrecht-enumeration/1' as const;
export const ENUMERATION_STATUSES = ['pending', 'processing', 'done', 'review', 'failed', 'excluded'] as const;
export type EnumerationStatus = (typeof ENUMERATION_STATUSES)[number];

/** Obergrenze der Durchläufe bis zum Fixpunkt; ein Überschreiten ist ein Fehler im Rebuild, kein Quellbefund. */
export const ENUMERATION_MAX_PASSES = 8;

/** Laufmetadaten – nicht Teil des fachlichen Fingerabdrucks. */
export const ENUMERATION_ITEM_RUNTIME_FIELDS = ['updatedAt', 'lastRunId'] as const;

/** Beleg einer Listenseite, aus der ein Eintrag stammt (Quellseite, ihr SHA-256, ihre Abrufzeit). */
export interface ListingEvidence {
  kind: 'fortfuehrungsnachweis' | 'facet-hitlist';
  url: string;
  sha256: string;
  retrievedAt: string;
}

export interface EnumerationItem {
  /** Stabiler Schlüssel und zugleich Quellidentität: die Portal-Dokument-ID. */
  key: string;
  sourceIdentity: string;
  documentId: string;
  /** Amtliche Gliederungsnummer der Bayerischen Rechtssammlung; Verwaltungsvorschriften führen keine. */
  bayRsNumber?: string;
  /** Sachgebietsnummern des Fortführungsnachweises von oben nach unten (`["1","11","110","1102"]`). */
  sectionPath?: string[];
  /** Bezeichnung des untersten Sachgebiets. */
  sectionTitle?: string;
  title: string;
  titleSource: 'fortfuehrungsnachweis' | 'facet-hitlist' | 'manifest';
  /** Titelmarke `*` des Fortführungsnachweises – Bedeutung dort nicht erläutert, hier nur festgehalten. */
  titleMarker?: string;
  /** Normtyp laut Portalfacette; `unbekannt`, solange keine Facette den Eintrag führt. */
  normType: NormType | 'unbekannt';
  normTypeSource: 'facet-hitlist' | 'unbekannt';
  /** Dokumentseite der Norm im Portal. */
  sourceUrl: string;
  /** XML-Export der Norm (ZIP); der Bulk-Lauf lädt genau diese Adresse. */
  zipUrl: string;
  /** Quellseite, aus der der Eintrag stammt (vorrangig der Fortführungsnachweis). */
  listingUrl: string;
  /** SHA-256 dieser Quellseite. */
  sourceSha256: string;
  /** Abrufzeit dieser Quellseite. */
  retrievedAt: string;
  /** Alle Belegseiten (Fortführungsnachweis und/oder Trefferlistenseite). */
  listings: ListingEvidence[];
  status: EnumerationStatus;
  signals: { fortfuehrungsnachweis: boolean; facet: boolean; manifest: boolean };
  /** „Rechtsstand“ der Trefferzeile (Tag, ab dem der angezeigte Text gilt). */
  legalStatusDate?: string;
  /** Änderungsnotizen des Fortführungsnachweises, in Reihenfolge. */
  changeNotes?: string[];
  /** Jüngstes datiertes Änderungsdatum aus den Notizen. */
  latestChange?: string;
  /**
   * Hat die Vorschrift laut Fortführungsnachweis nach dem Stichtag eine Änderung erfahren?
   * `true`/`false` nur bei datierten Notizen; ohne datierte Notiz bleibt das Feld weg (unbekannt).
   */
  changedAfterBaseline?: boolean;
  attempts: number;
  lastError?: { code: string; message: string };
  outcome?: { importStatus: string; targetSlug?: string; reviewCategories?: string[]; parserVersion?: string; transformerVersion?: string };
  updatedAt?: string;
  lastRunId?: string;
}

export interface EnumerationCrosscheck {
  /** Einträge des Fortführungsnachweises (nach Bereichszuschnitt). */
  fortfuehrungsnachweisEntries: number;
  /** Zeilen des Nachweises mit Inhalt, aber ohne Verweis – gezählt, nicht übergangen. */
  fortfuehrungsnachweisUnlinkedRows: number;
  /** Dokumente der Portalfacetten dieses Bereichs. */
  facetDocuments: number;
  /** Sollmenge der Facetten laut Trefferzähler. */
  facetTotal: number;
  inBoth: number;
  onlyFortfuehrungsnachweis: number;
  onlyFacet: number;
  /** Die Differenzmengen selbst – sie sind der Befund, nicht nur ihre Größe. */
  onlyFortfuehrungsnachweisIds: string[];
  onlyFacetIds: string[];
  items: number;
  withNormType: number;
  withBayRsNumber: number;
  carriedFromManifest: number;
  duplicateIds: number;
  ok: boolean;
  problems: string[];
  notes: string[];
}

export interface EnumerationSourceSummary {
  fortfuehrungsnachweis?: { url: string; sha256: string; retrievedAt: string; byteLength: number; entries: number; sections: number; unlinkedRows: number };
  facets?: { normTypes: NormType[]; pages: number; documents: number; total: number; complete: boolean; inventoryPath: string; inventoryFingerprint: string };
}

export interface EnumerationFile {
  schemaVersion: typeof ENUMERATION_SCHEMA;
  sourceArea: SourceArea;
  baselineDate: string;
  /** Laufmetadatum: ändert sich nur mit dem fachlichen Inhalt. */
  generatedAt: string;
  contentFingerprint: string;
  sources: EnumerationSourceSummary;
  crosscheck: EnumerationCrosscheck;
  items: EnumerationItem[];
}

export class EnumerationFixpointError extends Error {
  readonly passes: number;
  readonly differences: string[];

  constructor(area: SourceArea, passes: number, differences: string[]) {
    super(`Enumeration ${area}: kein Fixpunkt nach ${passes} Durchläufen – der Rebuild ändert sich weiter (${differences.slice(0, 5).join('; ')}${differences.length > 5 ? `; … ${differences.length} insgesamt` : ''}); keine stille Teillösung, Rebuild-Logik prüfen`);
    this.name = 'EnumerationFixpointError';
    this.passes = passes;
    this.differences = differences;
  }
}

/** Enumerationsstatus zu einem Manifest-Importstatus (dieselbe Zuordnung wie im West-Adapter). */
export function statusForImportStatus(importStatus: ImportStatus | string): EnumerationStatus {
  if (importStatus === 'needs-review') return 'review';
  if (importStatus === 'excluded') return 'excluded';
  if (importStatus === 'failed') return 'failed';
  if (isImportedStatus(importStatus as ImportStatus) || importStatus === 'not-at-baseline' || importStatus === 'dry-run') return 'done';
  return 'failed';
}

function outcomeFromManifest(entry: ManifestEntry): NonNullable<EnumerationItem['outcome']> {
  const outcome: NonNullable<EnumerationItem['outcome']> = { importStatus: entry.importStatus, parserVersion: entry.parserVersion, transformerVersion: entry.transformerVersion };
  if (entry.targetSlug) outcome.targetSlug = entry.targetSlug;
  return outcome;
}

export function enumerationFingerprint(file: Pick<EnumerationFile, 'sourceArea' | 'baselineDate' | 'items' | 'sources' | 'crosscheck'>): string {
  const items = file.items.map((item) => {
    const copy: Record<string, unknown> = { ...item };
    for (const field of ENUMERATION_ITEM_RUNTIME_FIELDS) delete copy[field];
    return copy;
  });
  return createHash('sha256').update(stableStringify({ sourceArea: file.sourceArea, baselineDate: file.baselineDate, sources: file.sources, crosscheck: file.crosscheck, items })).digest('hex');
}

/** Fachliche Unterschiede zweier Enumerationen (Schlüssel entfernt/neu/geändert), ohne Laufmetadaten. */
export function enumerationItemDifferences(before: Pick<EnumerationFile, 'items'>, after: Pick<EnumerationFile, 'items'>, limit = 20): string[] {
  const strip = (item: EnumerationItem): string => {
    const copy: Record<string, unknown> = { ...item };
    for (const field of ENUMERATION_ITEM_RUNTIME_FIELDS) delete copy[field];
    return stableStringify(copy);
  };
  const left = new Map(before.items.map((item) => [item.key, strip(item)]));
  const right = new Map(after.items.map((item) => [item.key, strip(item)]));
  const differences: string[] = [];
  for (const key of left.keys()) if (!right.has(key)) differences.push(`${key} entfernt`);
  for (const [key, value] of right) {
    if (!left.has(key)) differences.push(`${key} neu`);
    else if (left.get(key) !== value) differences.push(`${key} geändert`);
  }
  return differences.slice(0, limit);
}

export function enumerationStatusCounts(file: Pick<EnumerationFile, 'items'>): Record<EnumerationStatus, number> {
  const counts = Object.fromEntries(ENUMERATION_STATUSES.map((status) => [status, 0])) as Record<EnumerationStatus, number>;
  for (const item of file.items) counts[item.status] += 1;
  return counts;
}

/**
 * Strukturelle Invarianten einer Enumeration (Audit, Coverage):
 *   - jede Dokument-ID kommt genau einmal vor, Schlüssel und Quellidentität stimmen überein
 *   - Statuszählung: Summe aller Status = Einträge
 *   - jeder Eintrag trägt mindestens einen Beleg (Listenseite oder Manifest)
 *   - die Einträge sind nach Dokument-ID sortiert (der Diff bleibt zeilenstabil)
 */
export function checkEnumerationInvariants(file: Pick<EnumerationFile, 'items'>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const item of file.items) {
    if (seen.has(item.key)) problems.push(`${item.key}: mehrfacher Eintrag`);
    seen.add(item.key);
    if (item.key !== item.documentId || item.sourceIdentity !== item.documentId) problems.push(`${item.key}: Schlüssel, Quellidentität und Dokument-ID stimmen nicht überein`);
    if (!(ENUMERATION_STATUSES as readonly string[]).includes(item.status)) problems.push(`${item.key}: unbekannter Status ${item.status}`);
    if (item.listings.length === 0 && !item.signals.manifest) problems.push(`${item.key}: kein Beleg (weder Listenseite noch Manifest)`);
  }
  const counts = enumerationStatusCounts(file);
  const sum = Object.values(counts).reduce((total, value) => total + value, 0);
  if (sum !== file.items.length) problems.push(`Statussumme ${sum} ≠ Einträge ${file.items.length}`);
  const sorted = [...file.items].sort((left, right) => compareSourceIdentity(left.key, right.key));
  if (sorted.some((item, index) => item.key !== file.items[index]!.key)) problems.push('Einträge sind nicht nach Dokument-ID sortiert');
  return problems;
}

export interface BuildEnumerationInput {
  area: SourceArea;
  /** Fortführungsnachweis des Bereichs samt Beleg der abgerufenen Seite. */
  fortfuehrungsnachweis?: { document: FfnDocument; url: string; sha256: string; retrievedAt: string; byteLength: number };
  /** Facettenbestand: nur die Dokumente der Normtypen dieses Bereichs sind maßgeblich. */
  facets?: { documents: readonly FacetDocument[]; total: number; pages: number; complete: boolean; inventoryPath: string; inventoryFingerprint: string };
  previous?: EnumerationFile;
  manifest?: ImportManifest;
  now: string;
  baselineDate?: string;
  /** Einmalige Übergänge des Rebuilds (nicht Teil der Datei). */
  log?: (line: string) => void;
}

interface PassResult {
  file: EnumerationFile;
  transitions: string[];
}

function ffnFields(entry: FfnEntry, baselineDate: string): Partial<EnumerationItem> {
  const latest = latestChangeDate(entry);
  const fields: Partial<EnumerationItem> = { title: entry.title, titleSource: 'fortfuehrungsnachweis' };
  if (entry.bayRsNumber) fields.bayRsNumber = entry.bayRsNumber;
  if (entry.titleMarker) fields.titleMarker = entry.titleMarker;
  if (entry.sectionPath.length > 0) {
    fields.sectionPath = entry.sectionPath.map((section) => section.number);
    fields.sectionTitle = entry.sectionPath[entry.sectionPath.length - 1]!.title;
  }
  if (entry.notes.length > 0) fields.changeNotes = [...entry.notes];
  if (latest) {
    fields.latestChange = latest;
    fields.changedAfterBaseline = latest > baselineDate;
  }
  return fields;
}

/** Ein Durchlauf des Rebuilds. */
function buildEnumerationPass(input: BuildEnumerationInput): PassResult {
  const { area } = input;
  const baselineDate = input.baselineDate ?? BASELINE_DATE;
  const problems: string[] = [];
  const notes: string[] = [];
  const transitions: string[] = [];
  const normTypes = AREA_NORM_TYPES[area];

  const ffnEntries = input.fortfuehrungsnachweis?.document.entries ?? [];
  const facetDocuments = (input.facets?.documents ?? []).filter((document) => (normTypes as readonly string[]).includes(document.normType));
  const previousByKey = new Map((input.previous?.items ?? []).map((item) => [item.key, item]));
  const manifestByIdentity = new Map((input.manifest?.entries ?? []).filter((entry) => entry.sourceArea === area).map((entry) => [entry.sourceIdentity, entry]));

  const ffnById = new Map<string, FfnEntry>();
  for (const entry of ffnEntries) {
    if (ffnById.has(entry.documentId)) {
      problems.push(`${entry.documentId}: mehrfach im Fortführungsnachweis (Zeilen ${ffnById.get(entry.documentId)!.row} und ${entry.row})`);
      continue;
    }
    ffnById.set(entry.documentId, entry);
  }
  const facetById = new Map<string, FacetDocument>();
  for (const document of facetDocuments) {
    if (facetById.has(document.documentId)) {
      problems.push(`${document.documentId}: mehrfach in der Facetten-Trefferliste`);
      continue;
    }
    facetById.set(document.documentId, document);
  }

  const documentIds = [...new Set([...ffnById.keys(), ...facetById.keys(), ...manifestByIdentity.keys()])].sort(compareSourceIdentity);
  const items: EnumerationItem[] = [];
  let carriedFromManifest = 0;
  for (const documentId of documentIds) {
    const ffn = ffnById.get(documentId);
    const facet = facetById.get(documentId);
    const manifestEntry = manifestByIdentity.get(documentId);
    const previous = previousByKey.get(documentId);
    const listings: ListingEvidence[] = [];
    if (input.fortfuehrungsnachweis && ffn) listings.push({ kind: 'fortfuehrungsnachweis', url: input.fortfuehrungsnachweis.url, sha256: input.fortfuehrungsnachweis.sha256, retrievedAt: input.fortfuehrungsnachweis.retrievedAt });
    if (facet) listings.push({ kind: 'facet-hitlist', url: facet.sourceUrl, sha256: facet.sourceSha256, retrievedAt: facet.retrievedAt });
    const primary = listings[0];
    if (!ffn && !facet) {
      carriedFromManifest += 1;
      notes.push(`${documentId} wird aus dem Manifest geführt – weder Fortführungsnachweis noch Facette führen die Vorschrift noch`);
    }

    const title = ffn?.title ?? facet?.title ?? manifestEntry?.sourceTitle ?? previous?.title ?? documentId;
    const titleSource: EnumerationItem['titleSource'] = ffn ? 'fortfuehrungsnachweis' : facet ? 'facet-hitlist' : 'manifest';
    const item: EnumerationItem = {
      key: documentId,
      sourceIdentity: documentId,
      documentId,
      title,
      titleSource,
      normType: facet?.normType ?? 'unbekannt',
      normTypeSource: facet ? 'facet-hitlist' : 'unbekannt',
      sourceUrl: documentUrl(documentId),
      zipUrl: zipUrl(documentId),
      listingUrl: primary?.url ?? '',
      sourceSha256: primary?.sha256 ?? '',
      retrievedAt: primary?.retrievedAt ?? '',
      listings,
      status: 'pending',
      signals: { fortfuehrungsnachweis: Boolean(ffn), facet: Boolean(facet), manifest: Boolean(manifestEntry) },
      attempts: previous?.attempts ?? 0,
    };
    if (ffn) Object.assign(item, ffnFields(ffn, baselineDate));
    else if (previous?.bayRsNumber) item.bayRsNumber = previous.bayRsNumber;
    if (!ffn && manifestEntry?.bayRsNumber) item.bayRsNumber = manifestEntry.bayRsNumber;
    if (facet?.legalStatusDate) item.legalStatusDate = facet.legalStatusDate;

    // Bearbeitungsstand: der frühere Eintrag trägt ihn, sonst das Manifest (Quelle der Wahrheit der
    // Verarbeitung). Ein `processing` aus einem abgebrochenen Lauf gilt beim Resume als offen.
    if (previous) {
      item.status = previous.status;
      if (previous.lastError) item.lastError = previous.lastError;
      if (previous.outcome) item.outcome = previous.outcome;
      if (previous.updatedAt) item.updatedAt = previous.updatedAt;
      if (previous.lastRunId) item.lastRunId = previous.lastRunId;
    } else if (manifestEntry) {
      item.status = statusForImportStatus(manifestEntry.importStatus);
      item.outcome = outcomeFromManifest(manifestEntry);
    }
    if (item.status === 'processing') {
      transitions.push(`${documentId}: Status processing aus einem abgebrochenen Lauf gilt wieder als offen`);
      item.status = 'pending';
    }
    items.push(item);
  }

  const ffnIds = new Set(ffnById.keys());
  const facetIds = new Set(facetById.keys());
  const onlyFfnIds = [...ffnIds].filter((id) => !facetIds.has(id)).sort(compareSourceIdentity);
  const onlyFacetIds = [...facetIds].filter((id) => !ffnIds.has(id)).sort(compareSourceIdentity);
  const inBoth = [...ffnIds].filter((id) => facetIds.has(id)).length;
  const duplicateIds = items.length - new Set(items.map((item) => item.key)).size;

  if (input.fortfuehrungsnachweis === undefined) problems.push('Fortführungsnachweis fehlt – die Enumeration wäre unbelegt');
  if (input.facets === undefined) problems.push('Facettenbestand fehlt – ohne ihn ist kein Normtyp bekannt und die Abdeckungslücke nicht messbar');
  if (input.facets && !input.facets.complete) problems.push('Facettenbestand ist unvollständig (siehe data/audits/bayernrecht/facet-inventory.json)');
  if (input.facets && facetDocuments.length !== input.facets.total) problems.push(`Facettenbestand ${facetDocuments.length} Dokumente, Trefferzähler ${input.facets.total}`);
  if (onlyFfnIds.length > 0) notes.push(`${onlyFfnIds.length} Dokumente stehen nur im Fortführungsnachweis, nicht in der Facette`);
  if (onlyFacetIds.length > 0) notes.push(`${onlyFacetIds.length} Dokumente stehen nur in der Facette, nicht im Fortführungsnachweis (Abdeckungslücke, siehe data/audits/bayernrecht/ENUMERATION_GAP.md)`);
  if (duplicateIds > 0) problems.push(`${duplicateIds} doppelte Dokument-IDs`);
  if (items.length === 0) problems.push('Enumeration ohne Einträge');

  const crosscheck: EnumerationCrosscheck = {
    fortfuehrungsnachweisEntries: ffnEntries.length,
    fortfuehrungsnachweisUnlinkedRows: input.fortfuehrungsnachweis?.document.unlinkedRows.length ?? 0,
    facetDocuments: facetDocuments.length,
    facetTotal: input.facets?.total ?? 0,
    inBoth,
    onlyFortfuehrungsnachweis: onlyFfnIds.length,
    onlyFacet: onlyFacetIds.length,
    onlyFortfuehrungsnachweisIds: onlyFfnIds,
    onlyFacetIds,
    items: items.length,
    withNormType: items.filter((item) => item.normType !== 'unbekannt').length,
    withBayRsNumber: items.filter((item) => item.bayRsNumber).length,
    carriedFromManifest,
    duplicateIds,
    ok: problems.length === 0,
    problems,
    notes,
  };

  const sources: EnumerationSourceSummary = {};
  if (input.fortfuehrungsnachweis) {
    sources.fortfuehrungsnachweis = {
      url: input.fortfuehrungsnachweis.url,
      sha256: input.fortfuehrungsnachweis.sha256,
      retrievedAt: input.fortfuehrungsnachweis.retrievedAt,
      byteLength: input.fortfuehrungsnachweis.byteLength,
      entries: ffnEntries.length,
      sections: input.fortfuehrungsnachweis.document.sections.length,
      unlinkedRows: input.fortfuehrungsnachweis.document.unlinkedRows.length,
    };
  }
  if (input.facets) {
    sources.facets = { normTypes: [...normTypes], pages: input.facets.pages, documents: facetDocuments.length, total: input.facets.total, complete: input.facets.complete, inventoryPath: input.facets.inventoryPath, inventoryFingerprint: input.facets.inventoryFingerprint };
  }

  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate,
    generatedAt: input.now,
    contentFingerprint: '',
    sources,
    crosscheck,
    items,
  };
  file.contentFingerprint = enumerationFingerprint(file);
  return { file, transitions };
}

/**
 * Vollständiger Rebuild bis zum Fixpunkt: Der Durchlauf wird mit seinem eigenen Ergebnis als Vorgänger
 * wiederholt, bis ein weiterer Durchlauf nichts Fachliches mehr ändert. Ein zweiter Rebuild aus
 * denselben Eingaben ist damit byteidentisch. Ohne Fixpunkt innerhalb von `ENUMERATION_MAX_PASSES`
 * Durchläufen: harter Fehler, keine stille Teillösung.
 */
export function buildEnumeration(input: BuildEnumerationInput): EnumerationFile {
  const log = input.log ?? ((): void => undefined);
  let current = buildEnumerationPass(input);
  let passes = 1;
  for (const line of current.transitions) log(line);
  for (;;) {
    const next = buildEnumerationPass({ ...input, previous: current.file });
    passes += 1;
    if (next.file.contentFingerprint === current.file.contentFingerprint) break;
    const differences = enumerationItemDifferences(current.file, next.file);
    if (passes >= ENUMERATION_MAX_PASSES) throw new EnumerationFixpointError(input.area, passes, differences);
    log(`Durchlauf ${passes}: ${differences.length} weitere Änderung(en) (${differences.slice(0, 3).join('; ')})`);
    for (const line of next.transitions) log(line);
    current = next;
  }
  const file = current.file;
  file.generatedAt = input.now;
  if (input.previous && input.previous.contentFingerprint === file.contentFingerprint) file.generatedAt = input.previous.generatedAt;
  log(`Fixpunkt nach ${passes - 1} Durchlauf/Durchläufen (Prüfdurchlauf ${passes} unverändert)`);
  return file;
}

export interface EnumerationFixpointResult {
  fixpoint: boolean;
  differences: string[];
  transitions: string[];
  fingerprint: string;
  rebuiltFingerprint: string;
}

/**
 * Prüft ohne Netz, ob ein erneuter Rebuild aus denselben Eingaben den Stand fachlich unverändert ließe.
 * Für Readiness und Audit; kein Fixpunkt bedeutet: Rebuild ausstehend (`enumerate --write`).
 */
export function checkEnumerationFixpoint(file: EnumerationFile, input: Omit<BuildEnumerationInput, 'previous' | 'now' | 'log'>): EnumerationFixpointResult {
  const pass = buildEnumerationPass({ ...input, previous: file, now: file.generatedAt });
  const fingerprint = enumerationFingerprint(file);
  const rebuiltFingerprint = pass.file.contentFingerprint;
  const differences = fingerprint === rebuiltFingerprint ? [] : enumerationItemDifferences(file, pass.file);
  if (fingerprint !== rebuiltFingerprint && differences.length === 0) differences.push('Kopf- oder Abgleichsdaten geändert (Quellen, Abgleich, Hinweise)');
  return { fixpoint: fingerprint === rebuiltFingerprint, differences, transitions: pass.transitions, fingerprint, rebuiltFingerprint };
}

export async function readEnumeration(root: string, area: SourceArea): Promise<EnumerationFile | undefined> {
  const file = await readJsonFile<EnumerationFile>(join(root, enumerationPath(area)));
  if (!file) return undefined;
  if (file.schemaVersion !== ENUMERATION_SCHEMA || file.sourceArea !== area || !Array.isArray(file.items)) throw new Error(`${enumerationPath(area)}: keine gültige Enumeration`);
  return file;
}

/**
 * Serialisierung mit einem Eintrag je Zeile: kompakt (mehrere Tausend Einträge) und zeilenweise diffbar –
 * ein Statuswechsel ändert genau eine Zeile.
 */
export function enumerationJsonText(file: EnumerationFile): string {
  const { items, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "items": [\n${items.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]\n}\n`;
}

/** Schreibt atomar; der Fingerabdruck wird neu berechnet (Statusänderungen gehören zum Inhalt). */
export async function writeEnumeration(root: string, file: EnumerationFile): Promise<boolean> {
  const next: EnumerationFile = { ...file, contentFingerprint: enumerationFingerprint(file) };
  return writeFileAtomic(join(root, enumerationPath(file.sourceArea)), enumerationJsonText(next));
}
