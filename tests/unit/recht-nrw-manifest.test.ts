/**
 * Gemeinsames Manifest (Schema 2, Hochstufung von Schema 1), Review-Queue (Fälle verschwinden bei
 * Reimport nicht), Ableitung der Review-Fälle und Coverage-Report – ohne Netz.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeCoverage } from '@landesrecht/importer-recht-nrw/common/coverage.ts';
import { emptyManifest, MANIFEST_PATH, readManifest, upgradeManifestEntryV1, writeManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { reviewStatusFor } from '@landesrecht/importer-recht-nrw/common/persist.ts';
import { deriveReviewItems } from '@landesrecht/importer-recht-nrw/common/review-derivation.ts';
import { emptyReviewQueue, mergeReviewItems, reviewItemId, type ReviewItemInput } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';

const v1Entry = {
  sourceSystem: 'recht-nrw', sourceIdentity: 'term:1', sourceTitle: 'Testgesetz', sourceType: 'gesetz', sourceUrl: 'https://recht.nrw.de/lrgv/gesetz/01012020-test', stemUrl: 'https://recht.nrw.de/taxonomy/term/1',
  selectedVersionUrl: 'https://recht.nrw.de/lrgv/gesetz/01012020-test', sourceValidFrom: '2020-01-01', sourceValidTo: null, retrievedAt: '2026-09-15T10:00:00.000Z', sha256: 'a'.repeat(64), contentType: 'text/html',
  contentFormat: 'native', parserVersion: 'recht-nrw-parser/1.0.0', targetJurisdiction: 'west', targetSlug: 'testg-west', baselineDate: '2023-12-01', importStatus: 'imported-with-warnings', importedAt: '2026-09-15T10:00:00.000Z',
  rawDocuments: [], versionsConsidered: [], overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 3, unresolved: 2, reportPath: 'data/audits/recht-nrw/testg-west.json' },
};

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-manifest-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Gemeinsames Manifest', () => {
  it('stuft Einträge der Schemaversion 1 verlustfrei hoch', () => {
    const entry = upgradeManifestEntryV1(v1Entry);
    expect(entry).toMatchObject({ sourceArea: 'lrgv', sourceDocumentType: 'gesetz', baselineStatus: 'active-at-baseline', reviewStatus: 'open', reconstructionStatus: 'direct', transformerVersion: 'recht-nrw-transformer/1.0.0' });
    expect(entry.sourceVersion).toEqual({ url: v1Entry.selectedVersionUrl, validFrom: '2020-01-01', validTo: null });
    expect(entry.validityEvidence[0]).toMatchObject({ kind: 'portal-version-interval', sha256: 'a'.repeat(64) });
    expect(entry.targetSlug).toBe('testg-west');
  });

  it('liest Manifeste der Version 1 und schreibt Version 2', async () => {
    await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
    await writeFile(join(root, MANIFEST_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-import-manifest/1', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries: [v1Entry] }));
    const manifest = await readManifest(root);
    expect(manifest.schemaVersion).toBe('recht-nrw-import-manifest/2');
    expect(manifest.entries[0]!.sourceArea).toBe('lrgv');
    await writeManifest(root, manifest);
    expect(JSON.parse(await readFile(join(root, MANIFEST_PATH), 'utf8')).schemaVersion).toBe('recht-nrw-import-manifest/2');
  });
});

describe('Review-Queue', () => {
  const run = { sourceArea: 'lrmb' as const, sourceIdentity: 'term:9', sourceUrl: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/x', now: '2026-09-15T10:00:00.000Z' };
  const items: ReviewItemInput[] = [
    { category: 'reconstruction-required', key: 'reconstruction-required', severity: 'blocking', summary: 'Änderung nach dem Stichtag', details: [] },
    { category: 'attachment', key: 'annex-pdf-only:Anlage 1', severity: 'non-blocking', summary: 'PDF-Anlage', details: [] },
  ];

  it('legt Fälle mit stabiler Kennung an', () => {
    const queue = mergeReviewItems(emptyReviewQueue(), run, items);
    expect(queue.items.map((item) => [item.category, item.status, item.occurrence])).toEqual([['reconstruction-required', 'open', 'current'], ['attachment', 'open', 'current']]);
    expect(queue.items[0]!.id).toBe(reviewItemId('term:9', 'reconstruction-required', 'reconstruction-required'));
    expect(reviewStatusFor(queue, 'term:9')).toBe('open');
  });

  it('lässt Fälle bei Reimport nicht verschwinden und erhält Entscheidungen', () => {
    let queue = mergeReviewItems(emptyReviewQueue(), run, items);
    queue.items[1]!.status = 'accepted';
    queue.items[1]!.resolution = { decidedAt: '2026-09-15T11:00:00.000Z', note: 'PDF-Anlage als Quelle genügt' };
    queue = mergeReviewItems(queue, { ...run, now: '2026-09-16T10:00:00.000Z' }, [items[1]!]);
    expect(queue.items).toHaveLength(2);
    const reconstruction = queue.items.find((item) => item.category === 'reconstruction-required')!;
    expect(reconstruction).toMatchObject({ status: 'open', occurrence: 'not-reproduced', firstSeenAt: '2026-09-15T10:00:00.000Z' });
    const attachment = queue.items.find((item) => item.category === 'attachment')!;
    expect(attachment).toMatchObject({ status: 'accepted', occurrence: 'current', lastSeenAt: '2026-09-16T10:00:00.000Z', firstSeenAt: '2026-09-15T10:00:00.000Z' });
    expect(attachment.resolution?.note).toContain('PDF');
    expect(reviewStatusFor(queue, 'term:9')).toBe('resolved');
  });

  it('leitet Kategorien aus Befunden und Erkennungen ab', () => {
    const derived = deriveReviewItems([
      { severity: 'error', code: 'selection-gap', message: 'Lücke' },
      { severity: 'warning', code: 'version-history-overlap', message: 'Überlappung 2001' },
      { severity: 'warning', code: 'annex-pdf-only', message: 'Anlage „A“ nur PDF' },
      { severity: 'error', code: 'selection-page-contradiction', message: 'Widerspruch' },
      { severity: 'warning', code: 'unresolved-source-references', message: 'aggregiert' },
      { severity: 'error', code: 'normativity-review', message: 'zweifelhaft' },
    ], { unresolved: [
      { path: 'body[1].text', term: 'Bezirksregierung', context: '', category: 'authority', decision: 'manual-review', reason: '', manualDecisionRequired: true },
      { path: 'body[2].text', term: 'Bezirksregierung', context: '', category: 'authority', decision: 'manual-review', reason: '', manualDecisionRequired: true },
    ] } as never);
    expect(derived.map((item) => [item.category, item.severity])).toEqual([
      ['version-selection', 'blocking'], ['historical-gap', 'non-blocking'], ['attachment', 'non-blocking'], ['metadata-conflict', 'blocking'], ['normativity', 'blocking'], ['institution-mapping', 'non-blocking'],
    ]);
    expect(derived[5]!.details).toEqual(['Bezirksregierung ×2 (body[1].text, body[2].text)']);
  });
});

describe('Coverage-Report', () => {
  function entry(overrides: Partial<ManifestEntry>): ManifestEntry {
    return { ...upgradeManifestEntryV1(v1Entry), ...overrides };
  }

  it('zählt LRGV und LRMB getrennt nach den festgelegten Kennzahlen', () => {
    const manifest = { ...emptyManifest(), entries: [
      entry({ sourceIdentity: 'term:1' }),
      entry({ sourceIdentity: 'term:2', importStatus: 'imported' }),
      entry({ sourceIdentity: 'term:3', sourceArea: 'lrmb', normativity: { decision: 'include', reasons: [] }, reconstructionStatus: 'direct' }),
      entry({ sourceIdentity: 'term:4', sourceArea: 'lrmb', normativity: { decision: 'include', reasons: [] }, reconstructionStatus: 'reconstructed' }),
      entry({ sourceIdentity: 'term:5', sourceArea: 'lrmb', normativity: { decision: 'include', reasons: [] }, importStatus: 'needs-review', baselineStatus: 'undetermined', reconstructionStatus: 'reconstruction-required' }),
      entry({ sourceIdentity: 'term:6', sourceArea: 'lrmb', normativity: { decision: 'exclude', reasons: ['Personalnachricht'] }, importStatus: 'excluded', baselineStatus: 'undetermined', reconstructionStatus: 'not-applicable' }),
    ] };
    const queue = mergeReviewItems(emptyReviewQueue(), { sourceArea: 'lrgv', sourceIdentity: 'url:x', sourceUrl: 'x', now: 'n' }, [{ category: 'source-unavailable', key: 'fetch-http', severity: 'blocking', summary: '404', details: [] }]);
    const report = computeCoverage(manifest, queue, { now: '2026-09-15T12:00:00.000Z' });
    expect(report.lrgv).toEqual({ enumerated: 2, atBaseline: 2, imported: 2, review: 0, unavailable: 1, excluded: 0 });
    expect(report.lrmb).toEqual({ enumerated: 4, normative: 3, atBaseline: 2, direct: 1, reconstructed: 1, review: 1, excluded: 1 });
    expect(report.reviewQueue).toEqual({ open: 1, openBlocking: 1, byCategory: { 'source-unavailable': 1 } });
  });
});
