/**
 * Ableitung der Review-Fälle aus Befunden und Transformationsreport – für LRGV und LRMB gleich.
 * Jede Kategorie der gemeinsamen Review-Queue hat hier ihre Zuordnungsregel.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';

import type { TransformationReport } from '../transform/transform.ts';
import type { ReviewCategory, ReviewItemInput } from './review-queue.ts';

interface Rule {
  test: (finding: ImportFinding) => boolean;
  category: ReviewCategory;
  severity: (finding: ImportFinding) => ReviewItemInput['severity'];
  key: (finding: ImportFinding) => string;
}

const blockingIfError = (finding: ImportFinding): ReviewItemInput['severity'] => (finding.severity === 'error' ? 'blocking' : 'non-blocking');

const RULES: readonly Rule[] = [
  { test: (finding) => /^selection-(page-contradiction|not-confirmed)$/u.test(finding.code), category: 'metadata-conflict', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code.startsWith('selection-'), category: 'version-selection', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code.startsWith('version-history-'), category: 'historical-gap', severity: () => 'non-blocking', key: (finding) => `${finding.code}:${finding.message}` },
  { test: (finding) => /^(fetch-|source-unavailable|exception)/u.test(finding.code), category: 'source-unavailable', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => /^(integrity-|post-transform-audit|text-)/u.test(finding.code), category: 'text-integrity', severity: blockingIfError, key: (finding) => finding.code },
  { test: (finding) => /^(unknown-|unparsed-|image-in-text|no-sections|missing-content|structure-)/u.test(finding.code), category: 'unknown-structure', severity: blockingIfError, key: (finding) => `${finding.code}:${finding.message}` },
  { test: (finding) => finding.code.startsWith('annex-') || finding.code.startsWith('attachment-'), category: 'attachment', severity: blockingIfError, key: (finding) => `${finding.code}:${finding.message}` },
  { test: (finding) => finding.code === 'enacting-body-mapping-required' || finding.code === 'organ-formula-conflict', category: 'institution-mapping', severity: () => 'non-blocking', key: () => 'enacting-body' },
  { test: (finding) => finding.code === 'slug-collision', category: 'slug-collision', severity: () => 'non-blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code.startsWith('normativity-'), category: 'normativity', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code === 'reconstruction-required', category: 'reconstruction-required', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code.startsWith('reconstruction-'), category: 'reconstruction-uncertain', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code === 'validity-undetermined', category: 'historical-gap', severity: () => 'blocking', key: (finding) => finding.code },
  { test: (finding) => finding.code.startsWith('validity-') || finding.code.startsWith('metadata-'), category: 'metadata-conflict', severity: blockingIfError, key: (finding) => finding.code },
];

/** Befunde ohne eigene Kategorie, die kein Review auslösen (reine Hinweise oder bereits aggregiert). */
const IGNORED_CODES = new Set(['unresolved-source-references', 'override-applied', 'path-date-mismatch', 'dry-run']);

export function deriveReviewItems(findings: readonly ImportFinding[], report?: TransformationReport): ReviewItemInput[] {
  const items: ReviewItemInput[] = [];
  for (const finding of findings) {
    if (finding.severity === 'info' || IGNORED_CODES.has(finding.code)) continue;
    const rule = RULES.find((candidate) => candidate.test(finding));
    if (rule) {
      items.push({ category: rule.category, key: rule.key(finding), severity: rule.severity(finding), summary: finding.message, details: [`${finding.severity} ${finding.code}`] });
    } else if (finding.severity === 'error') {
      items.push({ category: 'other', key: finding.code, severity: 'blocking', summary: finding.message, details: [`error ${finding.code}`] });
    }
  }
  if (report) {
    const byCategory = new Map<string, Map<string, { count: number; paths: string[] }>>();
    for (const entry of report.unresolved) {
      const terms = byCategory.get(entry.category) ?? new Map<string, { count: number; paths: string[] }>();
      const term = terms.get(entry.term) ?? { count: 0, paths: [] };
      term.count += 1;
      if (term.paths.length < 3) term.paths.push(entry.path);
      terms.set(entry.term, term);
      byCategory.set(entry.category, terms);
    }
    for (const [category, terms] of [...byCategory.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const total = [...terms.values()].reduce((sum, term) => sum + term.count, 0);
      items.push({
        category: 'institution-mapping',
        key: `detections:${category}`,
        severity: 'non-blocking',
        summary: `${total} Bezeichnung(en) der Kategorie ${category} ohne automatische Entsprechung (manuelle Entscheidung, Text unverändert)`,
        details: [...terms.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([term, info]) => `${term} ×${info.count} (${info.paths.join(', ')})`),
      });
    }
  }
  return items;
}
