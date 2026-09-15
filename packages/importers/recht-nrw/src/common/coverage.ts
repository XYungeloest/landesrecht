/**
 * Coverage-Report des RECHT.NRW-Imports (`data/audits/recht-nrw/coverage.json`).
 *
 * LRGV:  enumeriert → am Stichtag geltend → importiert | Review | nicht verfügbar | ausgeschlossen
 * LRMB:  enumeriert → normativ → am Stichtag geltend → direkt | rekonstruiert | Review | ausgeschlossen
 *
 * Im Beispielkorpus ist „enumeriert“ die Zahl der geprüften Quellen; im Bulkimport kommt sie aus
 * dem Enumerationsstand (Sitemap/Suchindex) und wird ausdrücklich übergeben.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AUDIT_DIR, type ImportManifest, type ManifestEntry } from './manifest.ts';
import type { ReviewQueue } from './review-queue.ts';

export const COVERAGE_SCHEMA = 'recht-nrw-coverage/1' as const;
export const COVERAGE_PATH = join(AUDIT_DIR, 'coverage.json');

export interface LrgvCoverage {
  enumerated: number;
  atBaseline: number;
  imported: number;
  review: number;
  unavailable: number;
  excluded: number;
}

export interface LrmbCoverage {
  enumerated: number;
  normative: number;
  atBaseline: number;
  direct: number;
  reconstructed: number;
  review: number;
  excluded: number;
}

export interface CoverageReport {
  schemaVersion: typeof COVERAGE_SCHEMA;
  generatedAt: string;
  baselineDate: string;
  scope: 'sample' | 'bulk';
  lrgv: LrgvCoverage;
  lrmb: LrmbCoverage;
  reviewQueue: { open: number; openBlocking: number; byCategory: Record<string, number> };
  quality: { integrityFailures: number; postTransformAuditFailures: number; unresolvedReferences: number; failedImports: number };
}

const isImported = (entry: ManifestEntry): boolean => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings';
const isUnavailable = (entry: ManifestEntry): boolean => entry.importStatus === 'failed' && entry.findings.some((finding) => /^(fetch-|source-unavailable|selection-not-available)/u.test(finding.code));

export function computeCoverage(manifest: ImportManifest, queue: ReviewQueue, options: { now: string; scope?: 'sample' | 'bulk'; enumerated?: { lrgv?: number; lrmb?: number } }): CoverageReport {
  const lrgvEntries = manifest.entries.filter((entry) => entry.sourceArea === 'lrgv');
  const lrmbEntries = manifest.entries.filter((entry) => entry.sourceArea === 'lrmb');
  const open = queue.items.filter((item) => item.status === 'open');
  const importedIdentities = new Set(manifest.entries.filter(isImported).map((entry) => entry.sourceIdentity));
  const blockedIdentities = (area: 'lrgv' | 'lrmb', categories?: readonly string[]): number => new Set(open.filter((item) => item.sourceArea === area && item.severity === 'blocking' && item.occurrence === 'current' && !importedIdentities.has(item.sourceIdentity) && (!categories || categories.includes(item.category))).map((item) => item.sourceIdentity)).size;
  const byCategory: Record<string, number> = {};
  for (const item of open) byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  return {
    schemaVersion: COVERAGE_SCHEMA,
    generatedAt: options.now,
    baselineDate: manifest.baselineDate,
    scope: options.scope ?? 'sample',
    lrgv: {
      enumerated: options.enumerated?.lrgv ?? lrgvEntries.length,
      atBaseline: lrgvEntries.filter((entry) => entry.baselineStatus === 'active-at-baseline').length,
      imported: lrgvEntries.filter(isImported).length,
      review: Math.max(lrgvEntries.filter((entry) => entry.importStatus === 'needs-review').length, blockedIdentities('lrgv') - blockedIdentities('lrgv', ['source-unavailable'])),
      unavailable: Math.max(lrgvEntries.filter(isUnavailable).length, blockedIdentities('lrgv', ['source-unavailable'])),
      excluded: lrgvEntries.filter((entry) => entry.importStatus === 'excluded' || entry.importStatus === 'not-at-baseline').length,
    },
    lrmb: {
      enumerated: options.enumerated?.lrmb ?? lrmbEntries.length,
      normative: lrmbEntries.filter((entry) => entry.normativity?.decision === 'include').length,
      atBaseline: lrmbEntries.filter((entry) => entry.baselineStatus === 'active-at-baseline').length,
      direct: lrmbEntries.filter((entry) => isImported(entry) && entry.reconstructionStatus === 'direct').length,
      reconstructed: lrmbEntries.filter((entry) => isImported(entry) && entry.reconstructionStatus === 'reconstructed').length,
      review: lrmbEntries.filter((entry) => entry.importStatus === 'needs-review').length,
      excluded: lrmbEntries.filter((entry) => entry.importStatus === 'excluded' || entry.importStatus === 'not-at-baseline').length,
    },
    reviewQueue: { open: open.length, openBlocking: open.filter((item) => item.severity === 'blocking').length, byCategory },
    quality: {
      integrityFailures: manifest.entries.filter((entry) => isImported(entry) && (!entry.integrity.fetchParse || !entry.integrity.sourceCanonical)).length,
      postTransformAuditFailures: manifest.entries.filter((entry) => entry.transformation.postTransformAudit === false).length,
      unresolvedReferences: manifest.entries.reduce((sum, entry) => sum + entry.transformation.unresolved, 0),
      failedImports: manifest.entries.filter((entry) => entry.importStatus === 'failed').length,
    },
  };
}

export async function writeCoverage(root: string, report: CoverageReport): Promise<string> {
  const target = join(root, COVERAGE_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}
