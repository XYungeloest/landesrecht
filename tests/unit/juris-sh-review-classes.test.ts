/** NSH-Reviewklassen und Klassenentscheidungen (Lauf 17): resolved-excluded mit ReasonCode, Historie bleibt. */
import { describe, expect, it } from 'vitest';

import { decideReviewItem, validateReviewItem, type ReviewItem, type ReviewQueue } from '@landesrecht/importer-juris-sh/common/review.ts';
import { applyClassDecisions, classifyReviewCase, parseClassDecisions, type ClassDecisionFile } from '@landesrecht/importer-juris-sh/reports/review-classes.ts';

const item = (id: string, category: ReviewItem['category'], key: string, details: string[] = [], sourceIdentity = 'jlr-NNLSH0000TEST'): ReviewItem => ({
  id, category, key, severity: 'blocking', summary: 's', details, jurisdiction: 'nsh', sourceSystem: 'juris-sh', sourceArea: 'landesrecht', sourceIdentity, sourceUrl: 'https://example.invalid', firstSeenAt: '2026-09-01', updatedAt: '2026-09-01', occurrence: 'current', status: 'open',
});

const rules: ClassDecisionFile = parseClassDecisions({
  schemaVersion: 'juris-sh-review-class-decisions/1',
  rules: [
    { id: 'unsafe-table-structure', groups: ['unsafe-table'], status: 'resolved-excluded', reasonCode: 'unsafe-table-structure', reason: 'Raster nicht belegt', decidedBy: 'Nutzer', decidedAt: '2026-09-29', reference: 'Test' },
    { id: 'validity', groups: ['validity-register'], status: 'resolved-excluded', reasonCode: 'baseline-validity-unresolved', reason: 'geprüft', decidedBy: 'Nutzer', decidedAt: '2026-09-29', reference: 'Test', sourceIdentities: ['jlr-NNLSH0000A'] },
  ],
});

describe('Reviewklassen', () => {
  it('ordnet Fälle Gruppen zu (Tabellen, Anlagen, Rücknahme, Seed-Konflikt, Integrität)', () => {
    expect(classifyReviewCase(item('1', 'unknown-structure', 'parse:table-layout')).group).toBe('unsafe-table');
    expect(classifyReviewCase(item('2', 'incomplete-annex', 'parse:incomplete-source-text'), 'normative-pdf-only').group).toBe('annex-missing');
    expect(classifyReviewCase(item('3', 'incomplete-annex', 'parse:vwv-annex-document')).group).toBe('annex-parent-unresolved');
    expect(classifyReviewCase(item('4', 'import-regression', 'imported-before', ['enacted-after-baseline: ausgefertigt am 2025-02-27'])).group).toBe('withdrawal-not-at-baseline');
    expect(classifyReviewCase(item('5', 'import-regression', 'baseline-locked')).group).toBe('seed-conflict');
    expect(classifyReviewCase(item('6', 'unknown-structure', 'integrity:mismatch')).class).toBe('technical-blocker');
  });

  it('entscheidet offene Fälle der Gruppe mit ReasonCode, Einzelfallregeln nur für ihre Dokumente; Historie bleibt', () => {
    const queue: ReviewQueue = { schemaVersion: 'juris-sh-review-queue/1', items: [item('a', 'unknown-structure', 'parse:table-layout'), item('b', 'validity', 'evidence:C-undetermined', [], 'jlr-NNLSH0000A'), item('c', 'validity', 'evidence:C-undetermined', [], 'jlr-NNLSH0000B')] };
    const { queue: next, decided } = applyClassDecisions(queue, rules);
    expect(decided.map((entry) => entry.id)).toEqual(['a', 'b']);
    const table = next.items.find((entry) => entry.id === 'a')!;
    expect(table.status).toBe('resolved-excluded');
    expect(table.decision).toMatchObject({ reasonCode: 'unsafe-table-structure', classDecision: 'unsafe-table-structure' });
    expect(validateReviewItem(table)).toEqual([]);
    expect(next.items.find((entry) => entry.id === 'c')!.status).toBe('open');
  });

  it('verlangt für resolved-excluded einen ReasonCode', () => {
    const queue: ReviewQueue = { schemaVersion: 'juris-sh-review-queue/1', items: [item('x', 'validity', 'baseline:undetermined')] };
    expect(() => decideReviewItem(queue, 'x', { decision: 'resolved-excluded', reason: 'ohne Code', decidedAt: '2026-09-29' })).toThrow(/reasonCode/u);
    expect(validateReviewItem({ ...item('y', 'validity', 'k'), status: 'resolved-excluded' })).toEqual([expect.stringMatching(/reasonCode/u)]);
  });
});
