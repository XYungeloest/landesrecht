/**
 * Bulk-Readiness-Prüfung (`npm run import:recht-nrw:readiness`): maschinenlesbares READY / NOT READY mit
 * konkreten Blockern. Geprüft werden ausschließlich systemische Voraussetzungen (docs/RECHT_NRW_BULK_READINESS.md);
 * offene Review-Fälle einzelner Normen sind nie ein Blocker.
 *
 * „Aktuell“ ist deterministisch definiert – nie über die Uhrzeit des Aufrufs, sondern über Zeitstempel und
 * Fingerabdrücke des Bestands:
 *
 *   - Manifest-Wasserzeichen (`manifestWatermark`): der jüngste `importedAt` aller Manifesteinträge. Er ändert
 *     sich nur, wenn ein Lauf den fachlichen Inhalt eines Eintrags geändert hat (`writeManifestEntry` bewahrt die
 *     Laufmetadaten unveränderter Einträge). Inhalte unter `content/` entstehen ausschließlich aus solchen Läufen;
 *     das Wasserzeichen ist damit auch die jüngste Inhaltsänderung.
 *   - Ein Audit-Report ist aktuell, wenn sein Schreibzeitpunkt nicht vor dem Wasserzeichen liegt **und** seine
 *     Zählfingerabdrücke (Manifesteinträge, Rohobjekte, Normanzahl) dem heutigen Bestand entsprechen.
 *   - Enumerations-Fixpoint: ein erneuter Rebuild aus denselben Eingaben (Abrufcache, Offline-Fetcher) liefert
 *     denselben fachlichen Fingerabdruck (`enumerationFingerprint`, ohne Laufmetadaten).
 *
 * Schnittstellen zu anderen Bausteinen (austauschbar über `evaluateReadiness`-Optionen):
 *   - `EnumerationFixpointCheck` `(root, area)` – Fixpoint-Prüfung; Standard `defaultEnumerationFixpointCheck` über
 *     `enumerationIsFixpoint` (common/enumeration.ts) mit Offline-Fetcher aus `.cache/recht-nrw`.
 *   - `versionReportChecks(report)` – Bewertung des Versionsreports aus `common/version-report.ts` (veraltete Einträge
 *     je Importstatus, Legacy-Ausnahmen aus `data/imports/recht-nrw/legacy-exceptions.json`); Tests speisen einen
 *     fertigen Report über `options.versionReport` ein.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { loadAllNorms } from '@landesrecht/legal-core/lib/loader.ts';

import { parseLrmbDocument } from '../lrmb/parser.ts';
import { parseDecreeFromTitle } from '../lrmb/text-metadata.ts';
import { readJsonFile } from './atomic.ts';
import { collectCoverageInput, computeCoverage, coverageComparable, COVERAGE_PATH, type CoverageReport } from './coverage.ts';
import { checkDocumentIdentityAndBody } from './document-sanity.ts';
import { enumerationIsFixpoint, enumerationPath, readEnumeration, type EnumerationFixpointResult as EnumerationFixpoint } from './enumeration.ts';
import { createRechtNrwFetcher, RechtNrwFetchError } from './fetcher.ts';
import { IMPORT_STATUSES, isImportedStatus, readManifest, SOURCE_AREAS, type ImportManifest, type SourceArea } from './manifest.ts';
import { missingR2Environment } from './r2-transport.ts';
import { readReviewQueue, type ReviewQueue } from './review-queue.ts';
import { isSyntheticFixture } from './search-audit.ts';
import { GOLDEN_RESULTS_JSON_PATH } from './search-golden.ts';
import { parseVersionPage } from './version-page.ts';
import { collectVersionReport, type VersionReport } from './version-report.ts';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'notice';
  detail: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
  notices: string[];
}

export const D1_SCALE_REPORT_PATH = join('data', 'audits', 'recht-nrw', 'd1-scale.json');
export const R2_AUDIT_PATH = join('data', 'audits', 'recht-nrw', 'r2', 'R2_AUDIT.json');
export const D1_REMOTE_CHECK_PATH = join('data', 'audits', 'recht-nrw', 'd1', 'D1_REMOTE_CHECK.json');
export const SEARCH_AUDIT_FULL_PATH = join('data', 'audits', 'recht-nrw', 'search', 'search-audit-full.json');
export const JUNIT_PATH = join('test-results', 'junit.xml');
export const READINESS_DOC = join('docs', 'RECHT_NRW_BULK_READINESS.md');
export const REFERENCE_BASELINE_DOC = join('docs', 'WEST_REFERENCE_BASELINE.md');
/** Pflichtabschnitte der Referenzbaseline (Überschriften zweiter Ebene). */
export const REFERENCE_BASELINE_SECTIONS = ['## Referenzstichtag', '## Kennzahlen', '## Auditstatus', '## Einschränkungen'] as const;

/** Testnamen (Vitest-Beschreibungen), die für ein GO vorhanden und grün sein müssen. */
export const REQUIRED_TEST_MARKERS = ['Enumeration', 'Resume', 'Budget', 'SIGINT', 'Cache', 'R2', 'Dokumentidentität', 'Landeshundegesetz', 'Undatierte', 'PDF', 'Coverage', 'Skalierung', 'Suchintegrität', 'Readiness', 'Secret-Scan'] as const;
/** Testname des statischen Secret-Scans (tests/unit/content-and-config.test.ts). */
export const SECRET_SCAN_TEST_MARKER = 'Secret-Scan';

export const REQUIRED_COMPONENTS = [
  'packages/importers/recht-nrw/src/common/enumeration.ts',
  'packages/importers/recht-nrw/src/common/bulk-runner.ts',
  'packages/importers/recht-nrw/src/common/archive.ts',
  'packages/importers/recht-nrw/src/common/r2-transport.ts',
  'packages/importers/recht-nrw/src/common/document-sanity.ts',
  'packages/importers/recht-nrw/src/common/pdf.ts',
  'packages/importers/recht-nrw/src/common/transcription.ts',
  'packages/importers/recht-nrw/src/common/coverage.ts',
  'packages/importers/recht-nrw/src/common/search-audit.ts',
  'packages/importers/recht-nrw/src/lrmb/reconstruction-queue.ts',
  'packages/runtime/src/incremental.ts',
  'packages/runtime/src/sql-batches.ts',
  'scripts/d1-apply-batches.ts',
  'scripts/r2-audit.ts',
  'scripts/d1-remote-check.ts',
] as const;

export const REQUIRED_SCRIPTS = ['import:recht-nrw:enumerate', 'import:recht-nrw:bulk', 'import:recht-nrw:coverage', 'import:recht-nrw:readiness', 'import:recht-nrw:r2-sync', 'import:recht-nrw:audit', 'import:recht-nrw:search-audit', 'd1:plan', 'd1:scale-test', 'audit:r2', 'audit:d1-remote'] as const;

/* ------------------------------------------------------------------------------------------ */
/* Wasserzeichen und Fingerabdrücke des Bestands                                               */

export interface ManifestWatermark {
  /** Jüngster `importedAt` aller Einträge (letzter fachlicher Schreibzeitpunkt des Manifests); leer ohne Einträge. */
  latestImportedAt: string;
  entries: number;
  imported: number;
  /** Rohobjekte mit R2-Objektschlüssel (Erwartungsmenge des R2-Audits, `scripts/r2-audit.ts`). */
  r2RawObjects: number;
}

export function manifestWatermark(manifest: Pick<ImportManifest, 'entries'>): ManifestWatermark {
  let latestImportedAt = '';
  let imported = 0;
  let r2RawObjects = 0;
  for (const entry of manifest.entries) {
    if (entry.importedAt > latestImportedAt) latestImportedAt = entry.importedAt;
    if (isImportedStatus(entry.importStatus)) imported += 1;
    for (const raw of entry.rawDocuments) if (raw.objectKey) r2RawObjects += 1;
  }
  return { latestImportedAt, entries: manifest.entries.length, imported, r2RawObjects };
}

/** ISO-Zeitstempel vergleichbar (lexikografisch, nur bei vollständigem ISO-Format). */
function isoOrEmpty(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) ? value : '';
}

/* ------------------------------------------------------------------------------------------ */
/* Enumerations-Fixpoint                                                                       */

export interface EnumerationFixpointResult {
  area: SourceArea;
  /** `fixpoint`: Rebuild fachlich identisch; `changed`: Abweichung; `unavailable`: Eingaben nicht offline verfügbar. */
  status: 'fixpoint' | 'changed' | 'unavailable';
  storedFingerprint?: string;
  rebuiltFingerprint?: string;
  /** Fachliche Unterschiede eines erneuten Rebuilds (Anzahl). */
  changedItems: number;
  /** Bis zu zehn Unterschiede (Schlüssel mit Feld, wie `enumerationItemDifferences` sie meldet). */
  changedKeys: string[];
  detail: string;
}

/**
 * Schnittstelle der Fixpoint-Prüfung: `(root, area)` → Ergebnis. Standard: `defaultEnumerationFixpointCheck`
 * (Offline-Rebuild über `enumerationIsFixpoint`); Tests speisen über `evaluateReadiness(root, { checkEnumerationFixpoint })`
 * eine eigene Implementierung ein.
 */
export type EnumerationFixpointCheck = (root: string, area: SourceArea, options?: EnumerationFixpointOptions) => Promise<EnumerationFixpointResult>;

export interface EnumerationFixpointOptions {
  cacheDir?: string;
  manifest?: ImportManifest;
}

/**
 * Standardimplementierung über `enumerationIsFixpoint` (common/enumeration.ts): Sitemap und Suchindex kommen aus dem
 * Abrufcache (Offline-Fetcher, kein Netz); der Rebuild verwendet die gespeicherte Enumeration als Vorgänger und das
 * Manifest. Fehlende Cacheeinträge machen die Prüfung `unavailable` (Hinweis, kein Blocker).
 */
export const defaultEnumerationFixpointCheck: EnumerationFixpointCheck = async (root, area, options = {}) => {
  const fetcher = createRechtNrwFetcher({ cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'), offline: true });
  let result: EnumerationFixpoint | undefined;
  try {
    result = await enumerationIsFixpoint(root, area, { fetcher, ...(options.manifest ? { manifest: options.manifest } : {}) });
  } catch (error) {
    if (error instanceof RechtNrwFetchError) return { area, status: 'unavailable', changedItems: 0, changedKeys: [], detail: `Eingaben nicht im Abrufcache (${error.message}); Fixpoint nur nach npm run import:recht-nrw:enumerate -- --area ${area} prüfbar` };
    throw error;
  }
  if (!result) return { area, status: 'unavailable', changedItems: 0, changedKeys: [], detail: `${enumerationPath(area)} fehlt` };
  const base = { area, storedFingerprint: result.fingerprint, rebuiltFingerprint: result.rebuiltFingerprint, changedItems: result.differences.length, changedKeys: result.differences.slice(0, 10) };
  if (result.fixpoint) return { ...base, status: 'fixpoint', detail: `Rebuild aus dem Abrufcache fachlich unverändert (${fetcher.stats.cacheHits} Cachetreffer${result.transitions.length ? `, ${result.transitions.length} einmalige Übergänge nur im Protokoll` : ''})` };
  return { ...base, status: 'changed', detail: `Rebuild weicht ab: ${result.differences.length} Unterschiede (${result.differences.slice(0, 5).join('; ')}${result.differences.length > 5 ? '; …' : ''}); npm run import:recht-nrw:enumerate -- --area ${area} --offline --write` };
};

export function fixpointCheck(result: EnumerationFixpointResult): ReadinessCheck {
  const label = `Enumerations-Fixpoint ${result.area.toUpperCase()}`;
  if (result.status === 'fixpoint') return { id: `enumeration-fixpoint-${result.area}`, label, status: 'pass', detail: result.detail };
  // Ohne Cache ist der Fixpoint nicht prüfbar: kein Blocker, aber sichtbar (die Bulk-Freigabe setzt einen Rebuild voraus).
  if (result.status === 'unavailable') return { id: `enumeration-fixpoint-${result.area}`, label, status: 'notice', detail: result.detail };
  return { id: `enumeration-fixpoint-${result.area}`, label, status: 'fail', detail: result.detail };
}

/* ------------------------------------------------------------------------------------------ */
/* Versionsreport (veraltete Einträge je Status, Legacy-Ausnahmen) – Quelle: common/version-report.ts */

const shortVersion = (version: string): string => version.replace(/^recht-nrw-/u, '');

/**
 * Zwei Prüfungen aus dem Versionsreport: (1) unbegründet veraltete Einträge je Status – Blocker; begründete oder
 * gegenstandslose Legacy-Ausnahmen – Hinweis; (2) Parserstände: aktuell (pass), nur dokumentierte Altstände (notice),
 * sonst fail. Die Meldung nennt je Bereich und Status „veraltet/gesamt“ und den Regenerationsbefehl.
 */
export function versionReportChecks(report: VersionReport): ReadinessCheck[] {
  const perStatus: string[] = [];
  const outdatedVersions = new Map<string, number>();
  let outdatedTotal = 0;
  let unjustifiedTotal = 0;
  let justifiedTotal = 0;
  for (const area of SOURCE_AREAS) {
    const item = report.areas[area];
    if (!item) continue;
    outdatedTotal += item.outdated.total;
    unjustifiedTotal += item.outdated.unjustified.length;
    justifiedTotal += item.outdated.justified.length;
    for (const status of IMPORT_STATUSES) {
      const counts = item.byStatus[status];
      if (!counts || counts.outdated === 0) continue;
      const unjustified = item.outdated.unjustified.filter((entry) => entry.importStatus === status).length;
      perStatus.push(`${area} ${status} ${unjustified}/${counts.outdated}${counts.outdated - unjustified > 0 ? ` (${counts.outdated - unjustified} Ausnahme${counts.outdated - unjustified === 1 ? '' : 'n'})` : ''}`);
      for (const [key, count] of Object.entries(counts.outdatedVersions)) outdatedVersions.set(`${area} ${key}`, (outdatedVersions.get(`${area} ${key}`) ?? 0) + count);
    }
  }
  const label = 'Keine unbegründet veralteten Einträge je Status';
  const stale: ReadinessCheck = report.blockers.length > 0
    ? { id: 'stale-entries', label, status: 'fail', detail: `${unjustifiedTotal} unbegründet (unbegründet/veraltet: ${perStatus.join(', ')}); ${report.blockers.join(' | ')}${report.notices.length ? `; Hinweise: ${report.notices.join(' | ')}` : ''}` }
    : report.notices.length > 0
      ? { id: 'stale-entries', label, status: 'notice', detail: `${outdatedTotal} veraltete Einträge, ${justifiedTotal} mit Legacy-Ausnahme${perStatus.length ? ` (${perStatus.join(', ')})` : ''}; ${report.notices.join(' | ')}` }
      : { id: 'stale-entries', label, status: 'pass', detail: 'alle Einträge mit aktuellem Parser/Transformer' };
  const current = SOURCE_AREAS.map((area) => `${area} ${shortVersion(report.areas[area]?.currentParserVersion ?? '?')} + ${shortVersion(report.areas[area]?.currentTransformerVersion ?? '?')}`).join(', ');
  const distribution = [...outdatedVersions.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `${key.replace(/recht-nrw-/gu, '')}: ${count}`).join('; ');
  const parser: ReadinessCheck = {
    id: 'parser-versions',
    label: 'Parserstände aktuell oder dokumentiert',
    status: outdatedTotal === 0 ? 'pass' : report.ready ? 'notice' : 'fail',
    detail: `aktuell ${current}${outdatedTotal ? `; ältere Stände: ${distribution}` : '; keine älteren Stände im Manifest'}`,
  };
  return [stale, parser];
}

/* ------------------------------------------------------------------------------------------ */
/* Review-Queue ↔ Manifest                                                                     */

export interface ReviewQueueConsistency {
  openItems: number;
  /** Offene Fälle, deren Quellidentität nicht im Manifest steht (bis zu zehn). */
  orphanIdentities: string[];
  orphanCount: number;
  /** `needs-review`-Einträge ohne offenen blockierenden Fall. */
  needsReviewWithoutBlocking: string[];
  /** Manifest `reviewStatus: open` ohne offenen Fall bzw. offener Fall bei `reviewStatus` ≠ open. */
  reviewStatusMismatch: string[];
  /** Übernommene Einträge mit offenem blockierenden Fall (Hinweis: dokumentierte Übernahme mit Blocker). */
  importedWithBlocking: string[];
  /** Offene Fälle, deren Ziel-Slug vom Manifest abweicht. */
  slugMismatch: string[];
  /** Offene Fälle, die im letzten Lauf nicht mehr auftraten (Hinweis). */
  notReproduced: number;
}

export function analyzeReviewQueueConsistency(manifest: Pick<ImportManifest, 'entries'>, queue: Pick<ReviewQueue, 'items'>): ReviewQueueConsistency {
  const byIdentity = new Map(manifest.entries.map((entry) => [entry.sourceIdentity, entry]));
  const open = queue.items.filter((item) => item.status === 'open');
  const openIdentities = new Set(open.map((item) => item.sourceIdentity));
  const blockingIdentities = new Set(open.filter((item) => item.severity === 'blocking').map((item) => item.sourceIdentity));
  const orphans = [...new Set(open.filter((item) => !byIdentity.has(item.sourceIdentity)).map((item) => item.sourceIdentity))].sort();
  const needsReviewWithoutBlocking = manifest.entries.filter((entry) => entry.importStatus === 'needs-review' && !blockingIdentities.has(entry.sourceIdentity)).map((entry) => entry.sourceIdentity);
  const reviewStatusMismatch = manifest.entries.filter((entry) => (entry.reviewStatus === 'open') !== openIdentities.has(entry.sourceIdentity)).map((entry) => `${entry.sourceIdentity} (${entry.reviewStatus}, offene Fälle ${openIdentities.has(entry.sourceIdentity) ? 'ja' : 'nein'})`);
  const importedWithBlocking = manifest.entries.filter((entry) => isImportedStatus(entry.importStatus) && blockingIdentities.has(entry.sourceIdentity)).map((entry) => entry.sourceIdentity);
  const slugMismatch = open.filter((item) => item.targetSlug && byIdentity.get(item.sourceIdentity)?.targetSlug && item.targetSlug !== byIdentity.get(item.sourceIdentity)!.targetSlug).map((item) => item.id);
  return {
    openItems: open.length,
    orphanIdentities: orphans.slice(0, 10),
    orphanCount: orphans.length,
    needsReviewWithoutBlocking: needsReviewWithoutBlocking.slice(0, 10),
    reviewStatusMismatch: reviewStatusMismatch.slice(0, 10),
    importedWithBlocking,
    slugMismatch: slugMismatch.slice(0, 10),
    notReproduced: open.filter((item) => item.occurrence === 'not-reproduced').length,
  };
}

export function reviewQueueConsistencyCheck(consistency: ReviewQueueConsistency, options: { legacyFile?: boolean } = {}): ReadinessCheck {
  const problems: string[] = [];
  if (options.legacyFile) problems.push('frühere Einzeldatei review-queue.json noch nicht migriert');
  if (consistency.needsReviewWithoutBlocking.length) problems.push(`needs-review ohne offenen blockierenden Fall: ${consistency.needsReviewWithoutBlocking.join(', ')}`);
  if (consistency.reviewStatusMismatch.length) problems.push(`reviewStatus ≠ Queue: ${consistency.reviewStatusMismatch.join(', ')}`);
  if (consistency.slugMismatch.length) problems.push(`Ziel-Slug weicht ab: ${consistency.slugMismatch.join(', ')}`);
  const notes: string[] = [];
  // Fälle ohne Stammnorm-Kennung (Abbruch vor der Term-Auflösung) haben nie einen Manifesteintrag – normlokal, Hinweis.
  if (consistency.orphanCount) notes.push(`${consistency.orphanCount} offene Fälle ohne Manifesteintrag (${consistency.orphanIdentities.slice(0, 3).join(', ')}${consistency.orphanCount > 3 ? ', …' : ''})`);
  if (consistency.importedWithBlocking.length) notes.push(`${consistency.importedWithBlocking.length} übernommene Einträge mit offenem blockierenden Fall (${consistency.importedWithBlocking.slice(0, 3).join(', ')}${consistency.importedWithBlocking.length > 3 ? ', …' : ''})`);
  if (consistency.notReproduced) notes.push(`${consistency.notReproduced} offene Fälle im letzten Lauf nicht reproduziert`);
  const summary = `${consistency.openItems} offene Fälle`;
  if (problems.length) return { id: 'review-queue', label: 'Review-Queue konsistent (Schema 2, je Quelle, Manifest ↔ Fälle)', status: 'fail', detail: `${summary}; ${problems.join('; ')}${notes.length ? `; Hinweise: ${notes.join('; ')}` : ''}` };
  return { id: 'review-queue', label: 'Review-Queue konsistent (Schema 2, je Quelle, Manifest ↔ Fälle)', status: notes.length ? 'notice' : 'pass', detail: notes.length ? `${summary}; ${notes.join('; ')}` : summary };
}

/* ------------------------------------------------------------------------------------------ */
/* Audit-Reports: R2, D1 remote, Search full, Golden Set                                       */

export interface R2AuditReport {
  schemaVersion?: string;
  endedAt?: string;
  counts?: { manifestEntries?: number; manifestRawObjects?: number };
  differences?: Record<string, number>;
  sample?: { checked?: number; failures?: number; envelopeFailures?: number };
}

/** Abweichungen, die das R2-Audit als relevant wertet (Exit 1); `stagingOnly`/`r2Only`/`envelopeBytesDiffer` sind historisch erklärbar. */
export const R2_RELEVANT_DIFFERENCES = ['manifestOnly', 'sizeMismatch', 'hashMismatch', 'r2OnlyUnexpected', 'stagingOnlyUnexpected', 'archiveStatusNotVerified'] as const;

export function r2AuditCheck(report: R2AuditReport | undefined, watermark: ManifestWatermark): ReadinessCheck {
  const label = 'R2-Audit grün und aktuell';
  if (!report) return { id: 'r2-audit', label, status: 'fail', detail: `${R2_AUDIT_PATH} fehlt (npm run audit:r2 -- --write)` };
  const relevant = R2_RELEVANT_DIFFERENCES.map((key) => report.differences?.[key] ?? 0).reduce((sum, value) => sum + value, 0) + (report.sample?.failures ?? 0) + (report.sample?.envelopeFailures ?? 0);
  const endedAt = isoOrEmpty(report.endedAt);
  const problems: string[] = [];
  if (relevant > 0) problems.push(`${relevant} relevante Abweichungen (${R2_RELEVANT_DIFFERENCES.filter((key) => (report.differences?.[key] ?? 0) > 0).map((key) => `${key} ${report.differences?.[key]}`).join(', ')}${report.sample?.failures ? `, Stichprobe ${report.sample.failures}` : ''}${report.sample?.envelopeFailures ? `, Umschläge ${report.sample.envelopeFailures}` : ''})`);
  if (!endedAt || endedAt < watermark.latestImportedAt) problems.push(`Report (${endedAt || 'ohne Zeitstempel'}) älter als die letzte Manifeständerung (${watermark.latestImportedAt || '–'})`);
  if ((report.counts?.manifestEntries ?? -1) !== watermark.entries) problems.push(`Manifesteinträge im Report ${report.counts?.manifestEntries ?? '–'} ≠ ${watermark.entries}`);
  if ((report.counts?.manifestRawObjects ?? -1) !== watermark.r2RawObjects) problems.push(`Rohobjekte im Report ${report.counts?.manifestRawObjects ?? '–'} ≠ ${watermark.r2RawObjects}`);
  if ((report.sample?.checked ?? 0) === 0) problems.push('keine Byte-Stichprobe');
  if (problems.length) return { id: 'r2-audit', label, status: 'fail', detail: `${problems.join('; ')} (npm run audit:r2 -- --write)` };
  return { id: 'r2-audit', label, status: 'pass', detail: `0 relevante Abweichungen, ${report.sample?.checked} Byte-Stichproben, Report ${endedAt} ≥ Manifest ${watermark.latestImportedAt}, ${watermark.r2RawObjects} Rohobjekte` };
}

export interface D1RemoteCheckReport {
  schemaVersion?: string;
  database?: string;
  checkedAt?: string;
  differences?: number;
  results?: Array<{ name: string; equal: boolean; local?: unknown; remote?: unknown }>;
}

function d1NormCount(report: D1RemoteCheckReport): number | undefined {
  const rows = report.results?.find((result) => result.name === 'law_norms')?.remote as Array<{ n?: number }> | undefined;
  return rows?.[0]?.n;
}

export function d1RemoteCheck(report: D1RemoteCheckReport | undefined, watermark: ManifestWatermark, contentNorms: number): ReadinessCheck {
  const label = 'D1-Audit lokal ↔ remote grün und aktuell';
  if (!report) return { id: 'd1-remote', label, status: 'fail', detail: `${D1_REMOTE_CHECK_PATH} fehlt (npm run audit:d1-remote -- --write)` };
  const checkedAt = isoOrEmpty(report.checkedAt);
  const norms = d1NormCount(report);
  const problems: string[] = [];
  if ((report.differences ?? 1) !== 0) problems.push(`${report.differences ?? '?'} Abweichungen lokal ↔ remote (${(report.results ?? []).filter((result) => !result.equal).map((result) => result.name).join(', ')})`);
  if (!checkedAt || checkedAt < watermark.latestImportedAt) problems.push(`Report (${checkedAt || 'ohne Zeitstempel'}) älter als die letzte Manifeständerung (${watermark.latestImportedAt || '–'})`);
  if (norms !== contentNorms) problems.push(`law_norms remote ${norms ?? '–'} ≠ ${contentNorms} Normen im Bestand`);
  if (problems.length) return { id: 'd1-remote', label, status: 'fail', detail: `${problems.join('; ')} (npm run audit:d1-remote -- --write)` };
  return { id: 'd1-remote', label, status: 'pass', detail: `${report.database ?? 'D1'}: ${report.results?.length ?? 0} Prüfungen identisch, ${norms} Normen, Report ${checkedAt} ≥ Manifest ${watermark.latestImportedAt}` };
}

export interface SearchAuditFullReport {
  writtenAt?: string;
  ok?: boolean;
  norms?: number;
  failures?: unknown[];
  profile?: { mode?: string };
}

export function searchAuditCheck(report: SearchAuditFullReport | undefined, watermark: ManifestWatermark, contentNorms: number): ReadinessCheck {
  const label = 'Such-Vollaudit aktuell und ohne Fehler';
  const command = 'npm run import:recht-nrw:search-audit -- --mode full --write';
  if (!report) return { id: 'search-full', label, status: 'fail', detail: `${SEARCH_AUDIT_FULL_PATH} fehlt (${command})` };
  const writtenAt = isoOrEmpty(report.writtenAt);
  const failures = Array.isArray(report.failures) ? report.failures.length : Number.NaN;
  const problems: string[] = [];
  if (report.profile?.mode !== 'full') problems.push(`Modus ${report.profile?.mode ?? '–'} statt full`);
  if (report.ok !== true || failures !== 0) problems.push(`${Number.isNaN(failures) ? 'Fehlerliste fehlt' : `${failures} Fehler`}, ok=${String(report.ok)}`);
  if (!writtenAt || writtenAt < watermark.latestImportedAt) problems.push(`Report (${writtenAt || 'ohne Zeitstempel'}) älter als die jüngste Inhaltsänderung (Manifest ${watermark.latestImportedAt || '–'})`);
  if (report.norms !== contentNorms) problems.push(`geprüfte Normen ${report.norms ?? '–'} ≠ ${contentNorms} im Bestand`);
  if (problems.length) return { id: 'search-full', label, status: 'fail', detail: `${problems.join('; ')} (${command})` };
  return { id: 'search-full', label, status: 'pass', detail: `${report.norms} Normen, 0 Fehler, Report ${writtenAt} ≥ Manifest ${watermark.latestImportedAt}` };
}

export interface GoldenResultsReport {
  evaluations?: Array<{ matchMode?: string; evaluatedAt?: string; overall?: { queries?: number; failed?: number; recallAt10?: number } }>;
}

/** Golden Set: Fehlschläge sind Blocker (Sollergebnis nicht gefunden); ein älterer Stand ist ein Hinweis (Qualitätsmetrik). */
export function goldenResultsCheck(report: GoldenResultsReport | undefined, watermark: ManifestWatermark): ReadinessCheck {
  const label = 'Search Golden Set ohne Fehlschläge';
  const command = 'npm run import:recht-nrw:search-audit -- --golden --write';
  const evaluations = report?.evaluations ?? [];
  if (evaluations.length === 0) return { id: 'search-golden', label, status: 'fail', detail: `${GOLDEN_RESULTS_JSON_PATH} fehlt oder ohne Auswertung (${command})` };
  const failed = evaluations.reduce((sum, evaluation) => sum + (evaluation.overall?.failed ?? 0), 0);
  const summary = evaluations.map((evaluation) => `${evaluation.matchMode ?? '?'}: ${evaluation.overall?.queries ?? 0} Anfragen, Recall@10 ${evaluation.overall?.recallAt10 ?? '–'}, ${evaluation.overall?.failed ?? 0} Fehlschläge`).join('; ');
  if (failed > 0) return { id: 'search-golden', label, status: 'fail', detail: `${summary} (${command})` };
  const stale = evaluations.some((evaluation) => !isoOrEmpty(evaluation.evaluatedAt) || isoOrEmpty(evaluation.evaluatedAt) < watermark.latestImportedAt);
  if (stale) return { id: 'search-golden', label, status: 'notice', detail: `${summary}; Auswertung älter als die letzte Manifeständerung (${watermark.latestImportedAt || '–'}; ${command})` };
  return { id: 'search-golden', label, status: 'pass', detail: summary };
}

/* ------------------------------------------------------------------------------------------ */
/* JUnit: Secret-Scan                                                                          */

export function secretScanCheck(junit: string | undefined): ReadinessCheck {
  const label = 'Keine Zugangsdaten im Bestand (statischer Secret-Scan)';
  if (junit === undefined) return { id: 'secrets', label, status: 'fail', detail: `${JUNIT_PATH} fehlt (npm run test)` };
  const cases = [...junit.matchAll(/<testcase\b[^>]*\bname="([^"]*)"[^>]*(?:\/>|>([\s\S]*?)<\/testcase>)/gu)].filter((match) => match[1]!.includes(SECRET_SCAN_TEST_MARKER));
  if (cases.length === 0) return { id: 'secrets', label, status: 'fail', detail: `Testfall „${SECRET_SCAN_TEST_MARKER}“ nicht im JUnit-Ergebnis` };
  const failed = cases.filter((match) => /<(?:failure|error|skipped)\b/u.test(match[2] ?? ''));
  if (failed.length) {
    const message = /<(?:failure|error)\b[^>]*\bmessage="([^"]*)"/u.exec(failed[0]![2] ?? '')?.[1] ?? 'übersprungen';
    return { id: 'secrets', label, status: 'fail', detail: `Secret-Scan nicht grün: ${message.replace(/&quot;/gu, '"').split('\n')[0]}` };
  }
  return { id: 'secrets', label, status: 'pass', detail: `Testfall grün (${cases.length})` };
}

/* ------------------------------------------------------------------------------------------ */
/* Referenzbaseline                                                                            */

export function referenceBaselineCheck(markdown: string | undefined): ReadinessCheck {
  const label = 'Referenzbaseline vorhanden (Kennzahlen-Abschnitt)';
  if (markdown === undefined) return { id: 'reference-baseline', label, status: 'fail', detail: `${REFERENCE_BASELINE_DOC} fehlt` };
  const missing = REFERENCE_BASELINE_SECTIONS.filter((heading) => !markdown.split('\n').some((line) => line.trim() === heading || line.trim().startsWith(`${heading} `)));
  if (missing.length) return { id: 'reference-baseline', label, status: 'fail', detail: `fehlende Abschnitte: ${missing.join(', ')}` };
  const placeholders = (markdown.match(/<[^<>\n]{1,80}>/gu) ?? []).filter((token) => !/^<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>$/u.test(token));
  if (placeholders.length) return { id: 'reference-baseline', label, status: 'notice', detail: `${REFERENCE_BASELINE_DOC}: ${placeholders.length} Platzhalter noch offen (${[...new Set(placeholders)].slice(0, 4).join(', ')}${placeholders.length > 4 ? ', …' : ''})` };
  return { id: 'reference-baseline', label, status: 'pass', detail: REFERENCE_BASELINE_DOC };
}

/* ------------------------------------------------------------------------------------------ */
/* Gesamtprüfung                                                                               */

async function newestMtime(directory: string, ignore: RegExp): Promise<number> {
  let newest = 0;
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (ignore.test(path)) continue;
    if (entry.isDirectory()) newest = Math.max(newest, await newestMtime(path, ignore));
    else if (entry.isFile() && /\.(?:ts|mjs|json|astro)$/u.test(entry.name)) newest = Math.max(newest, (await stat(path)).mtimeMs);
  }
  return newest;
}

async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface ReadinessOptions {
  env?: Record<string, string | undefined>;
  /** Fixpoint-Prüfung (Standard: Offline-Rebuild aus dem Abrufcache). */
  checkEnumerationFixpoint?: EnumerationFixpointCheck;
  /** Fertiger Versionsreport (Tests); sonst `collectVersionReport` (Manifest + Legacy-Ausnahmen). */
  versionReport?: VersionReport;
}

export async function evaluateReadiness(root: string, options: ReadinessOptions = {}): Promise<ReadinessResult> {
  const env = options.env ?? process.env;
  const checks: ReadinessCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string, notice = false): void => {
    checks.push({ id, label, status: ok ? 'pass' : notice ? 'notice' : 'fail', detail });
  };
  const push = (check: ReadinessCheck): void => {
    checks.push(check);
  };

  let manifest: ImportManifest | undefined;
  try {
    manifest = await readManifest(root);
  } catch (error) {
    add('manifest', 'Manifest lesbar', false, (error as Error).message);
  }
  const watermark = manifestWatermark(manifest ?? { entries: [] });

  // 1–2. Enumeration und Abgleich je Bereich; Fixpoint (Rebuild aus denselben Eingaben).
  const fixpoint = options.checkEnumerationFixpoint ?? defaultEnumerationFixpointCheck;
  for (const area of SOURCE_AREAS) {
    try {
      const file = await readEnumeration(root, area);
      if (!file) {
        add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()}`, false, `data/imports/recht-nrw/enumeration-${area}.json fehlt (npm run import:recht-nrw:enumerate -- --area ${area} --write)`);
        continue;
      }
      const cross = file.crosscheck;
      add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()} mit Abgleich`, cross.ok && cross.sitemapUrls > 0 && cross.searchHits > 0 && file.items.length > 0, `${file.items.length} Einträge; Sitemap ${cross.sitemapUrls} Adressen / ${cross.sitemapStems} Stämme; Suchindex ${cross.searchHits}; Schnittmenge ${cross.intersection}, nur Sitemap ${cross.onlySitemap}, nur Suchindex ${cross.onlySearch}${cross.ok ? '' : `; Abweichungen: ${cross.problems.join('; ')}`}`);
      push(fixpointCheck(await fixpoint(root, area, manifest ? { manifest } : {})));
    } catch (error) {
      add(`enumeration-${area}`, `Enumeration ${area.toUpperCase()}`, false, (error as Error).message);
    }
  }

  // 3. Komponenten und Befehle.
  const missingComponents: string[] = [];
  for (const component of REQUIRED_COMPONENTS) {
    try {
      await stat(join(root, component));
    } catch {
      missingComponents.push(component);
    }
  }
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const missingScripts = REQUIRED_SCRIPTS.filter((script) => !packageJson.scripts?.[script]);
  add('components', 'Bulk-Komponenten und Befehle vorhanden (keine offenen Architekturblocker)', missingComponents.length === 0 && missingScripts.length === 0, missingComponents.length || missingScripts.length ? `fehlend: ${[...missingComponents, ...missingScripts].join(', ')}` : `${REQUIRED_COMPONENTS.length} Module, ${REQUIRED_SCRIPTS.length} Befehle`);

  // 4. Tests grün, aktuell und mit den geforderten Prüfungen; Secret-Scan als eigener Nachweis.
  const junit = await readTextIfExists(join(root, JUNIT_PATH));
  if (junit === undefined) add('tests', 'Alle Tests grün und aktuell', false, `${JUNIT_PATH} fehlt (npm run test)`);
  else {
    const suite = /<testsuites\b[^>]*\btests="(\d+)"[^>]*\bfailures="(\d+)"[^>]*\berrors="(\d+)"/u.exec(junit);
    const tests = Number(suite?.[1] ?? 0);
    const failures = Number(suite?.[2] ?? 1);
    const errors = Number(suite?.[3] ?? 1);
    const skipped = (junit.match(/<skipped\b/gu) ?? []).length;
    const names = [...junit.matchAll(/<testcase\b[^>]*\bname="([^"]*)"/gu)].map((match) => match[1]!).join('\n');
    const missingMarkers = REQUIRED_TEST_MARKERS.filter((marker) => !names.includes(marker));
    const junitTime = (await stat(join(root, JUNIT_PATH))).mtimeMs;
    const newestSource = Math.max(await newestMtime(join(root, 'packages'), /node_modules|\.astro|dist/u), await newestMtime(join(root, 'tests'), /node_modules/u), await newestMtime(join(root, 'scripts'), /node_modules/u));
    const fresh = junitTime >= newestSource;
    add('tests', 'Alle Tests grün und aktuell', tests > 0 && failures === 0 && errors === 0 && skipped === 0 && missingMarkers.length === 0 && fresh, `${tests} Tests, ${failures} Fehlschläge, ${errors} Fehler, ${skipped} übersprungen${missingMarkers.length ? `; fehlende Prüfungen: ${missingMarkers.join(', ')}` : ''}${fresh ? '' : '; Testergebnisse älter als der Quellcode (npm run test)'}`);
  }
  push(secretScanCheck(junit));

  // 5. R2 vorbereitet (Bindings, Umgebungsvariablen dokumentiert); Zugangsdaten nur Hinweis.
  try {
    const wrangler = await readFile(join(root, 'apps', 'web', 'wrangler.jsonc'), 'utf8');
    const example = await readFile(join(root, '.env.example'), 'utf8');
    const ok = /"bucket_name":\s*"landesrecht-quellen"/u.test(wrangler) && /"bucket_name":\s*"landesrecht-quellen-staging"/u.test(wrangler) && ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].every((name) => example.includes(name));
    add('r2-config', 'R2-Konfiguration vorbereitet (Bucket-Bindings, Variablen dokumentiert, Staging außerhalb von Git)', ok, ok ? 'landesrecht-quellen (+ staging); Variablen in .env.example' : 'Bucket-Binding oder dokumentierte Variablen fehlen');
    const missing = missingR2Environment(env);
    add('r2-credentials', 'R2-Zugangsdaten in dieser Umgebung', missing.length === 0, missing.length === 0 ? 'vorhanden (sofortiger Upload möglich)' : `S3-Variablen nicht gesetzt (${missing.join(', ')}); Bulk stagt nach .cache/recht-nrw-r2-staging, Upload über die Wrangler-Anmeldung: import:recht-nrw:r2-sync -- --write (Standardtransport wrangler; lokal schneller: --r2-transport wrangler-api --concurrency 32 --verify etag)`, true);
  } catch (error) {
    add('r2-config', 'R2-Konfiguration vorbereitet', false, (error as Error).message);
  }

  // 6. Review-Queue persistent, lesbar und konsistent zum Manifest.
  let queue: ReviewQueue | undefined;
  try {
    queue = await readReviewQueue(root);
    let legacy = false;
    try {
      await stat(join(root, 'data', 'imports', 'recht-nrw', 'review-queue.json'));
      legacy = true;
    } catch {
      legacy = false;
    }
    push(reviewQueueConsistencyCheck(analyzeReviewQueueConsistency(manifest ?? { entries: [] }, queue), { legacyFile: legacy }));
  } catch (error) {
    add('review-queue', 'Review-Queue konsistent', false, (error as Error).message);
  }

  // 7. Coverage berechenbar, gespeicherter Report aktuell, Bestand konsistent; Versionsreport je Status.
  let contentNorms = 0;
  try {
    const input = await collectCoverageInput(root, new Date().toISOString());
    const computed = computeCoverage(input);
    const stored = await readJsonFile<CoverageReport>(join(root, COVERAGE_PATH));
    const current = stored?.schemaVersion === computed.schemaVersion && coverageComparable(stored) === coverageComparable(computed);
    add('coverage', 'Coverage-Report aktuell und konsistent', current, current ? `LRGV-Basis ${computed.lrgv.base.count}, LRMB-Basis ${computed.lrmb.base.count}; Kennzahlen entsprechen dem Bestand` : 'coverage.json fehlt oder ist veraltet (npm run import:recht-nrw:coverage -- --write)');
    const ohneManifest = (computed.lrgv.crosscheck?.enumerationWithoutManifest ?? 0) + (computed.lrmb.crosscheck?.enumerationWithoutManifest ?? 0);
    const verarbeitetOhneManifest = ohneManifest > 0 ? `; ${ohneManifest} verarbeitete Einträge ohne Manifest (Abbruch vor der Stammnorm-Kennung, normlokal)` : '';
    add('consistency', 'Manifest ↔ Inhalte ↔ Slug-Registry konsistent', computed.consistency.ok, computed.consistency.ok ? `keine Abweichung${verarbeitetOhneManifest}` : `ohne Inhalt ${computed.consistency.importedWithoutContent.length}, ohne Manifest ${computed.consistency.contentWithoutManifest.join(', ') || 0}, Slug-Abweichungen ${computed.consistency.slugRegistryMismatches.length}${verarbeitetOhneManifest}`);
    contentNorms = input.contentSlugs.size;
  } catch (error) {
    add('coverage', 'Coverage-Report aktuell', false, (error as Error).message);
  }
  if (manifest) {
    try {
      const report = options.versionReport ?? (await collectVersionReport(root, { manifest }));
      for (const check of versionReportChecks(report)) push(check);
    } catch (error) {
      add('stale-entries', 'Keine unbegründet veralteten Einträge je Status', false, (error as Error).message);
    }
  }

  // 8. D1-Skalierungstest und D1-Audit lokal ↔ remote.
  const scale = await readJsonFile<{ ok?: boolean; norms?: number; full?: { durationMs?: number }; incremental?: { equivalent?: boolean } }>(join(root, D1_SCALE_REPORT_PATH)).catch(() => undefined);
  add('d1-scale', 'D1-Skalierungstest grün', Boolean(scale?.ok && (scale.norms ?? 0) >= 2_000 && scale.incremental?.equivalent), scale ? `${scale.norms} synthetische Normen, Vollprojektion ${Math.round((scale.full?.durationMs ?? 0) / 1000)} s, inkrementell äquivalent ${scale.incremental?.equivalent}` : `${D1_SCALE_REPORT_PATH} fehlt (npm run d1:scale-test -- --write)`);
  push(d1RemoteCheck(await readJsonFile<D1RemoteCheckReport>(join(root, D1_REMOTE_CHECK_PATH)).catch(() => undefined), watermark, contentNorms));

  // 9. R2-Audit, Such-Vollaudit, Golden Set.
  push(r2AuditCheck(await readJsonFile<R2AuditReport>(join(root, R2_AUDIT_PATH)).catch(() => undefined), watermark));
  push(searchAuditCheck(await readJsonFile<SearchAuditFullReport>(join(root, SEARCH_AUDIT_FULL_PATH)).catch(() => undefined), watermark, contentNorms));
  push(goldenResultsCheck(await readJsonFile<GoldenResultsReport>(join(root, GOLDEN_RESULTS_JSON_PATH)).catch(() => undefined), watermark));

  // 10–11. Dokumentidentität und VV-LHundG-Regression auf der archivierten Originalquelle.
  try {
    if (!manifest) throw new Error('Manifest nicht lesbar');
    const lhundg = manifest.entries.find((entry) => entry.sourceIdentity === 'term:23528');
    const page = lhundg?.rawDocuments.find((raw) => raw.role === 'version-page' && raw.localSource);
    if (!lhundg || !page?.localSource) throw new Error('VV LHundG (term:23528) nicht im Manifest oder ohne versionierte Quelle');
    const parsedPage = parseVersionPage(await readFile(join(root, page.localSource), 'utf8'), lhundg.selectedVersionUrl);
    const parsed = parseLrmbDocument(parsedPage.content.format === 'native' ? parsedPage.content.bodyHtml : '');
    const titleDecree = parseDecreeFromTitle(parsedPage.title);
    const sanity = checkDocumentIdentityAndBody({ sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle: titleDecree?.title ?? parsedPage.title, documentTitleLines: parsed.head.titleLines, head: parsed.head, ...(titleDecree?.issuedOn ? { titleDecree: { issuedOn: titleDecree.issuedOn } } : {}), baseCitation: 'MBl. NRW. 2003 S. 580', blocks: parsed.blocks, attachments: parsedPage.attachments });
    const materials = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: 'Gesetz über die Prüfung', blocks: [{ type: 'heading', text: 'Gesetzentwurf der Landesregierung' }, { type: 'heading', text: 'A. Problem' }, { type: 'paragraphText', text: 'Die Prüfung ist nicht geregelt.' }, { type: 'heading', text: 'B. Lösung' }, { type: 'paragraphText', text: 'Das Gesetz regelt die Prüfung.' }, { type: 'heading', text: 'Begründung' }, { type: 'heading', text: 'Zu § 1' }, { type: 'paragraphText', text: 'Die Vorschrift bestimmt den Zweck.' }] });
    add('document-sanity', 'Document Body Sanity Check grün', materials.status === 'mismatch', `Materialiendokument → ${materials.status}`);
    add('vv-lhundg', 'VV-LHundG-Regression grün', sanity.status === 'consistent' && isImportedStatus(lhundg.importStatus) && lhundg.reconstructionStatus === 'reconstructed', `Dokumentidentität ${sanity.status}; Import ${lhundg.importStatus}, ${lhundg.reconstructionStatus}`);
  } catch (error) {
    add('vv-lhundg', 'VV-LHundG-Regression grün', false, (error as Error).message);
  }

  // 12. Policies und Referenzbaseline dokumentiert.
  try {
    const doc = await readFile(join(root, READINESS_DOC), 'utf8');
    const headings = ['## Undatierte LRMB-Altdatensätze', '## PDF-only-Policy', '## GO/No-Go-Checkliste', '## Befehle für den Bulk-Lauf'];
    const missing = headings.filter((heading) => !doc.includes(heading));
    add('policies', 'Undatierte-LRMB- und PDF-only-Policy dokumentiert', missing.length === 0, missing.length ? `fehlende Abschnitte: ${missing.join(', ')}` : READINESS_DOC);
  } catch {
    add('policies', 'Policies dokumentiert', false, `${READINESS_DOC} fehlt`);
  }
  push(referenceBaselineCheck(await readTextIfExists(join(root, REFERENCE_BASELINE_DOC))));

  // 13. Keine synthetischen Fixtures im Produktionsbestand.
  try {
    const fixtures = (await loadAllNorms(root)).filter((norm) => isSyntheticFixture(norm)).map((norm) => `${norm.meta.jurisdiction}:${norm.meta.slug}`);
    add('fixtures', 'Keine synthetischen Fixtures im Produktionsbestand', fixtures.length === 0, fixtures.length ? fixtures.join(', ') : 'content/ enthält nur übernommene Normen');
  } catch (error) {
    add('fixtures', 'Keine synthetischen Fixtures im Produktionsbestand', false, (error as Error).message);
  }

  const blockers = checks.filter((check) => check.status === 'fail').map((check) => `${check.label}: ${check.detail}`);
  const notices = checks.filter((check) => check.status === 'notice').map((check) => `${check.label}: ${check.detail}`);
  return { ready: blockers.length === 0, checks, blockers, notices };
}
