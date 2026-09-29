/**
 * BayWü-Freeze-Readiness (Lauf 18): veraltetes Paketdatum trotz Änderung nach dem Stichtag (Klassifikation 3b),
 * Review-Modell mit `resolved-excluded` und ReasonCode, Klassen der Restfälle, Rücknahme mit reservierter Adresse.
 */
import { describe, expect, it } from 'vitest';

import { checkSlugRegistry } from '@landesrecht/importer-bayernrecht/audit/audit.ts';
import { applyClassDecisions, classifyReviewCase, parseClassDecisions, reconstructionReasonCode } from '@landesrecht/importer-bayernrecht/audit/review-classes.ts';
import { classifyBaseline } from '@landesrecht/importer-bayernrecht/baseline/classify.ts';
import { decideReviewItem, mergeReviewItems, validateReviewItem, emptyReviewQueue } from '@landesrecht/importer-bayernrecht/common/review.ts';

import { sampleManifestEntry } from '../helpers/bayernrecht-state.ts';

const EVALUATION = '2026-09-18';
const base = { documentId: 'BayFüAkV', documentDate: '1979-05-08', inForceFrom: '2007-05-01', evaluationDate: EVALUATION };

describe('Klassifikation 3b: Paketdatum veraltet', () => {
  it('eine nach dem Stichtag ausgefertigte, am Quellstand wirksame Änderung widerlegt „unverändert seit vor dem Stichtag“', () => {
    const decision = classifyBaseline({ ...base, postBaselineEvents: [{ type: 'amend', date: '2024-06-14', enactmentDate: '2024-06-04', effectiveDate: '2024-07-01', citation: 'GVBl. 2024 S. 98' }] });
    expect(decision).toMatchObject({ class: 'changed-after-baseline', status: 'active-at-baseline', method: 'undetermined', reason: 'amended-after-baseline-portal-date-stale' });
    expect(decision.blockers[0]).toContain('GVBl. 2024 S. 98');
  });

  it('auch rückwirkend in Kraft gesetzt: nach dem Stichtag ausgefertigt gehört die Änderung nicht zum Ausgangsrechtsstand (6.2)', () => {
    const decision = classifyBaseline({ ...base, inForceFrom: '2023-11-08', postBaselineEvents: [{ type: 'amend', date: '2024-05-31', enactmentDate: '2024-05-14', effectiveDate: '2023-11-08' }] });
    expect(decision.reason).toBe('amended-after-baseline-portal-date-stale');
  });

  it('das Vollzitat allein genügt, außer das Register weist die Änderung als erst künftig wirksam aus', () => {
    expect(classifyBaseline({ ...base, lastAmendmentDate: '2025-10-23' }).class).toBe('changed-after-baseline');
    const future = classifyBaseline({ ...base, lastAmendmentDate: '2025-06-01', postBaselineEvents: [{ type: 'amend', date: '2025-06-10', enactmentDate: '2025-06-01', effectiveDate: '2028-07-01' }] });
    expect(future).toMatchObject({ class: 'unchanged-since-baseline', reason: 'text-unchanged-since-before-baseline' });
  });

  it('Gegenbeispiele: Änderung vor dem Stichtag, Berichtigung, künftige Änderung', () => {
    expect(classifyBaseline({ ...base, lastAmendmentDate: '2020-09-14' }).class).toBe('unchanged-since-baseline');
    expect(classifyBaseline({ ...base, postBaselineEvents: [{ type: 'correction', date: '2024-02-01', enactmentDate: '2024-01-20' }] }).class).toBe('unchanged-since-baseline');
    expect(classifyBaseline({ ...base, postBaselineEvents: [{ type: 'amend', date: '2026-03-01', enactmentDate: '2026-02-16', effectiveDate: '2026-11-01' }] }).class).toBe('unchanged-since-baseline');
  });
});

describe('Review-Modell und Klassen', () => {
  const run = { sourceArea: 'landesrecht' as const, sourceIdentity: 'BayTestG', sourceUrl: 'https://example.invalid', now: '2026-09-29T00:00:00Z' };
  const queue = mergeReviewItems(emptyReviewQueue(), run, [
    { category: 'reconstruction-required', key: 'baseline-text-changed-after-baseline', severity: 'blocking', summary: 's', details: [] },
    { category: 'validity', key: 'baseline-no-issue-date', severity: 'blocking', summary: 's', details: [] },
  ]);

  it('resolved-excluded verlangt einen ReasonCode', () => {
    const id = queue.items[0]!.id;
    expect(() => decideReviewItem(queue, id, { decision: 'resolved-excluded', reason: 'x', decidedAt: '2026-09-29' })).toThrow(/reasonCode/u);
    const decided = decideReviewItem(queue, id, { decision: 'resolved-excluded', reason: 'x', decidedAt: '2026-09-29', reasonCode: 'old-text-missing' });
    expect(validateReviewItem(decided.items.find((item) => item.id === id))).toEqual([]);
    expect(validateReviewItem({ ...queue.items[0]!, status: 'resolved-excluded' })).toEqual([expect.stringMatching(/reasonCode/u)]);
  });

  it('ordnet Rekonstruktionsfälle nach Queue-Zustand, nicht als eine Blockerklasse', () => {
    expect(reconstructionReasonCode({ state: 'non-invertible-amendment', reason: 'recast', group: 'missing-predecessor-text' })).toBe('old-text-missing');
    expect(reconstructionReasonCode({ state: 'non-invertible-amendment', reason: 'recast', group: 'annex-replacement' })).toBe('missing-normative-annex');
    expect(reconstructionReasonCode({ state: 'asset-missing', reason: 'annex-recast', group: 'table-replacement' })).toBe('unsafe-table-structure');
    expect(reconstructionReasonCode({ state: 'command-unreadable', reason: 'location-unreadable', group: 'missing-predecessor-text' })).toBe('source-scan-unreadable');
    expect(reconstructionReasonCode({ state: 'missing-base', reason: 'prior-source-missing', group: 'single-amendment' })).toBe('missing-primary-source');
    expect(reconstructionReasonCode({ state: 'partial-chain', reason: 'chain-commencement-order', group: 'missing-predecessor-text' })).toBe('baseline-validity-unresolved');
    expect(reconstructionReasonCode({ state: 'unsupported-formula', reason: 'insert-unit', group: 'single-amendment' })).toBe('command-not-invertible');
    expect(classifyReviewCase({ category: 'reconstruction-required', key: 'baseline-amended-after-baseline-portal-date-stale' }, { state: 'missing-base', reason: 'x', group: 'single-amendment' }).reasonCode).toBe('text-unproven-after-baseline');
    expect(classifyReviewCase({ category: 'import-regression', key: 'import-regression' }).class).toBe('technical-blocker');
    expect(classifyReviewCase({ category: 'reconstruction-required', key: 'baseline-text-changed-after-baseline' }, { state: 'recipe-ready', reason: 'x', group: 'single-amendment' }).class).toBe('technical-blocker');
  });

  it('Klassenentscheidungen erledigen nur offene Fälle ihrer Gruppe, mit ReasonCode; Historie bleibt', () => {
    const file = parseClassDecisions({ schemaVersion: 'bayernrecht-review-class-decisions/1', rules: [{ id: 'old-text-missing', groups: ['reconstruction:old-text-missing'], status: 'resolved-excluded', reasonCode: 'old-text-missing', reason: 'Alttext fehlt', decidedBy: 'Nutzer', decidedAt: '2026-09-29', reference: 'Test' }] });
    const { queue: next, decided } = applyClassDecisions(queue, file, new Map([['BayTestG', { state: 'non-invertible-amendment', reason: 'recast', group: 'missing-predecessor-text' }]]));
    expect(decided).toHaveLength(1);
    const item = next.items.find((entry) => entry.category === 'reconstruction-required')!;
    expect(item).toMatchObject({ status: 'resolved-excluded', decision: { reasonCode: 'old-text-missing', classDecision: 'old-text-missing' } });
    expect(next.items.find((entry) => entry.category === 'validity')!.status).toBe('open');
    expect(() => parseClassDecisions({ schemaVersion: 'bayernrecht-review-class-decisions/1', rules: [{ id: 'x', groups: ['g'], status: 'resolved-excluded', reasonCode: 'erfunden', reason: 'r', decidedBy: 'b', decidedAt: '2026-09-29', reference: 'r' }] })).toThrow(/reasonCode/u);
  });
});

describe('Rücknahme mit reservierter Adresse', () => {
  it('eine wegen unbelegten Stichtagstexts zurückgenommene Norm behält ihre Reservierung – nur mit Befund', () => {
    const registry = { entries: [{ slug: 'fueakv-baywue', sourceIdentity: 'BayVwV9421', candidate: 'fueakv-baywue', assignment: 'derived' as const }] };
    const withdrawn = sampleManifestEntry({ sourceIdentity: 'BayVwV9421', importStatus: 'needs-review', targetSlug: '', findings: [{ severity: 'warning', code: 'withdrawn-text-unproven', message: 'zurückgenommen' }] });
    expect(checkSlugRegistry({ entries: [withdrawn] }, registry)).toEqual([]);
    const plain = sampleManifestEntry({ sourceIdentity: 'BayVwV9421', importStatus: 'needs-review', targetSlug: '', findings: [] });
    expect(checkSlugRegistry({ entries: [plain] }, registry).map((finding) => finding.check)).toEqual(['slug-reserviert-ohne-uebernahme']);
  });
});
