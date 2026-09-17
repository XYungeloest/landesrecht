/**
 * Bulk-Runner: Retry-Semantik (--retry-failed, --retry-review, --regenerate-stale, --only und Kombinationen),
 * Dublettenfreiheit über Läufe und Rebuilds, Stabilität von not-at-baseline, Erhalt getroffener Review-Entscheidungen.
 * Stub-Verarbeitung mit echten Checkpoints, alle Schreibvorgänge in temporären Roots, kein Netz.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runBulkImport } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { buildEnumeration, checkEnumerationInvariants, findDuplicateIdentities, writeEnumeration, type EnumerationItem } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { readManifest, manifestEntryPath } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { decideReviewItem, readReviewQueue, reviewItemId, writeReviewShard } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { SYNTHETIC_TERM_BASE } from '@landesrecht/importer-recht-nrw/common/simulation.ts';

import { cleanupTempBases, enumerationOnDisk, indexOf, prepareRoot, runOptions, statusCounts, stubProcessor, termOf, type Decision } from '../helpers/recht-nrw-bulk-stub.ts';

afterAll(cleanupTempBases);

const invariants = async (root: string): Promise<string[]> => {
  const file = await enumerationOnDisk(root);
  const manifest = await readManifest(root);
  return checkEnumerationInvariants(file, { manifestIdentities: new Set(manifest.entries.map((entry) => entry.sourceIdentity)) });
};

describe('Bulk-Runner: Retry-Semantik', () => {
  it('Kombination --retry-failed --retry-review --regenerate-stale: jeder Eintrag höchstens einmal, erledigte Einträge unberührt, jede Norm einmal geschrieben', async () => {
    const { root, order } = await prepareRoot(24);
    const decide = (item: EnumerationItem): Decision => (indexOf(item.key) % 4 === 1 ? { status: 'failed', code: 'quelle' } : indexOf(item.key) % 4 === 2 ? { status: 'review' } : indexOf(item.key) % 4 === 3 ? { status: 'done', importStatus: 'not-at-baseline' } : { status: 'done' });
    const initial = stubProcessor({ decide });
    const first = await runBulkImport(runOptions(root, { processor: initial.processor, runId: 'basis' }));
    expect(first.summary).toMatchObject({ runStatus: 'completed', processed: 24 });
    expect(statusCounts(await enumerationOnDisk(root))).toEqual({ done: 12, review: 6, failed: 6 });
    expect(new Set(initial.manifestWrites).size).toBe(initial.manifestWrites.length);

    // Ein übernommener Eintrag gilt als veraltet (Parserversion), einer mit not-at-baseline ebenfalls.
    const manifest = await readManifest(root);
    const staleImported = termOf({ key: order[3]! });
    const staleNotAtBaseline = termOf({ key: order[6]! });
    manifest.entries = manifest.entries.map((entry) => ([staleImported, staleNotAtBaseline].includes(entry.sourceIdentity) ? { ...entry, parserVersion: 'recht-nrw-parser/0.0.1' } : entry));

    const combined = stubProcessor({ decide: () => ({ status: 'done' }) });
    const retry = await runBulkImport(runOptions(root, { processor: combined.processor, manifest, resume: true, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'kombiniert' }));
    const expected = new Set([...order.filter((key) => indexOf(key) % 4 === 1 || indexOf(key) % 4 === 2), order[3]!, order[6]!]);
    expect(retry.summary).toMatchObject({ runStatus: 'completed', selected: expected.size, processed: expected.size });
    expect(new Set(combined.calls)).toEqual(expected);
    expect(combined.calls).toHaveLength(expected.size);
    expect(new Set(combined.manifestWrites).size).toBe(combined.manifestWrites.length);

    const after = await enumerationOnDisk(root);
    expect(statusCounts(after)).toEqual({ done: 24 });
    for (const item of after.items) expect(item.attempts, item.key).toBe(expected.has(item.key) ? 2 : 1);
    expect(after.items.filter((item) => !expected.has(item.key)).every((item) => item.lastRunId === 'basis')).toBe(true);
    expect(findDuplicateIdentities(after)).toEqual([]);
    expect(await invariants(root)).toEqual([]);
    expect((await readManifest(root)).entries).toHaveLength(24);
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor().processor, resume: true, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'leer' }))).summary.runStatus).toBe('nothing-to-do');
  });

  it('--only mit Retry-Flags wählt nur die genannten Einträge; erneut fehlgeschlagene bleiben failed ohne zweiten Manifesteintrag', async () => {
    const { root, order } = await prepareRoot(8);
    await runBulkImport(runOptions(root, { processor: stubProcessor({ decide: (item) => (indexOf(item.key) <= 2 ? { status: 'failed', code: 'x' } : { status: 'done' }) }).processor, runId: 'basis' }));
    const only = stubProcessor({ decide: () => ({ status: 'failed', code: 'x' }) });
    const run = await runBulkImport(runOptions(root, { processor: only.processor, only: [order[0]!, String(SYNTHETIC_TERM_BASE + 5)], retryFailed: true, retryReview: true, runId: 'only' }));
    expect(run.summary).toMatchObject({ runStatus: 'completed', selected: 2, processed: 2 });
    expect(only.calls.map(indexOf).sort((left, right) => left - right)).toEqual([indexOf(order[0]!), 5].sort((left, right) => left - right));
    const after = await enumerationOnDisk(root);
    expect(after.items.find((item) => item.key === order[0])).toMatchObject({ status: 'failed', attempts: 2, lastError: { code: 'x' } });
    expect(after.items.find((item) => indexOf(item.key) === 5)).toMatchObject({ status: 'failed', attempts: 2 });
    expect((await readManifest(root)).entries.map((entry) => entry.sourceIdentity)).not.toContain(termOf({ key: order[0]! }));
    expect(await invariants(root)).toEqual([]);
  });

  it('not-at-baseline bleibt stabil: weder Resume noch Retry-Flags wählen den Eintrag erneut; ein Rebuild erhält ihn', async () => {
    const { root, source } = await prepareRoot(5);
    const nab = stubProcessor({ decide: () => ({ status: 'done', importStatus: 'not-at-baseline' }) });
    await runBulkImport(runOptions(root, { processor: nab.processor, runId: 'nab' }));
    let file = await enumerationOnDisk(root);
    expect(file.items.every((item) => item.status === 'done' && item.outcome?.importStatus === 'not-at-baseline')).toBe(true);
    const manifest = await readManifest(root);
    expect(manifest.entries.every((entry) => entry.importStatus === 'not-at-baseline' && entry.targetSlug === '')).toBe(true);
    const idle = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, manifest, resume: true, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'idle' }));
    expect(idle.summary.runStatus).toBe('nothing-to-do');

    // Rebuild mit Manifest und früherer Enumeration: Identität, Status und Ergebnis bleiben; keine Dubletten.
    for (const now of ['2026-09-16T00:00:00.000Z', '2026-09-17T00:00:00.000Z']) {
      file = buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, previous: file, manifest, now });
      expect(file.items.map((item) => item.key)).toEqual(manifest.entries.map((entry) => entry.sourceIdentity));
      expect(file.items.every((item) => item.status === 'done' && item.attempts === 1 && item.outcome?.importStatus === 'not-at-baseline')).toBe(true);
      expect(findDuplicateIdentities(file)).toEqual([]);
    }
    await writeEnumeration(root, file);
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor().processor, manifest, resume: true, regenerateStale: true, runId: 'idle-2' }))).summary.runStatus).toBe('nothing-to-do');
  });
});

describe('Bulk-Runner: Retry erzeugt keine Dublette', () => {
  it('ein wiederholter Eintrag, der auf eine schon aktive Quellidentität auflöst, wird zusammengeführt – auch ohne gemeinsame Adresse in der Fassungsliste', async () => {
    const { root, order } = await prepareRoot(4);
    // Eintrag 2 scheitert zunächst vor der Stammnorm-Kennung (Abruffehler); sein Slug-Stamm gehört in Wahrheit zu
    // Stammnorm 1 (Slugwechsel), deren Fassungsliste die Adressen von Eintrag 2 nicht nennt.
    const identity = (item: EnumerationItem): string => (indexOf(item.key) === 2 ? termOf({ key: order[0]! }) : termOf(item));
    const first = await runBulkImport(runOptions(root, { processor: stubProcessor({ identity, decide: (item) => (indexOf(item.key) === 2 ? { status: 'failed', code: 'fetch-network', withoutIdentity: true } : { status: 'done' }) }).processor, runId: 'basis' }));
    expect(first.summary.outcomes).toMatchObject({ imported: 3, failed: 1, merged: 0 });
    expect((await enumerationOnDisk(root)).items.find((item) => indexOf(item.key) === 2)?.sourceIdentity).toBeUndefined();

    const retry = stubProcessor({ identity });
    const second = await runBulkImport(runOptions(root, { processor: retry.processor, resume: true, retryFailed: true, runId: 'retry' }));
    expect(second.summary).toMatchObject({ runStatus: 'completed', processed: 1 });
    expect(second.summary.outcomes.merged).toBe(1);
    const after = await enumerationOnDisk(root);
    expect(findDuplicateIdentities(after)).toEqual([]);
    expect(after.items.filter((item) => !item.mergedInto && item.sourceIdentity === termOf({ key: order[0]! }))).toHaveLength(1);
    expect(after.items.find((item) => item.key === order[0])).toMatchObject({ mergedInto: termOf({ key: order[0]! }), status: 'done' });
    expect(after.items.find((item) => indexOf(item.key) === 2)).toMatchObject({ status: 'done', sourceIdentity: termOf({ key: order[0]! }), attempts: 2 });
    expect(statusCounts(after)).toEqual({ done: 3 });
    expect((await readManifest(root)).entries).toHaveLength(3);
    expect(await invariants(root)).toEqual([]);
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor({ identity }).processor, resume: true, retryFailed: true, retryReview: true, runId: 'idle' }))).summary.runStatus).toBe('nothing-to-do');
  });

  it('scheitert ein Eintrag nach Auflösung auf eine bereits verarbeitete Stammnorm, wird er ihr Stub – die Norm bleibt übernommen, der Fehler sichtbar', async () => {
    const { root, order } = await prepareRoot(3);
    const identity = (item: EnumerationItem): string => (indexOf(item.key) === 2 ? termOf({ key: order[0]! }) : termOf(item));
    const stub = stubProcessor({ identity, decide: (item) => (indexOf(item.key) === 2 ? { status: 'failed', code: 'parser-page-2' } : { status: 'done' }) });
    const run = await runBulkImport(runOptions(root, { processor: stub.processor, runId: 'basis' }));
    expect(run.summary.outcomes).toMatchObject({ imported: 2, failed: 1, merged: 1, split: 0 });
    expect(run.summary.failures.map((failure) => failure.code)).toEqual(['parser-page-2']);
    const after = await enumerationOnDisk(root);
    expect(after.items.find((item) => indexOf(item.key) === 2)).toMatchObject({ mergedInto: termOf({ key: order[0]! }), status: 'done', attempts: 1, lastError: { code: 'parser-page-2' } });
    expect(after.items.find((item) => item.key === order[0])).toMatchObject({ status: 'done', sourceIdentity: termOf({ key: order[0]! }), outcome: { importStatus: 'imported' } });
    expect(after.items.find((item) => item.key === order[0])?.mergedInto).toBeUndefined();
    expect(after.items).toHaveLength(3);
    expect(statusCounts(after)).toEqual({ done: 2 });
    expect(findDuplicateIdentities(after)).toEqual([]);
    expect(await invariants(root)).toEqual([]);
    expect((await readManifest(root)).entries.find((entry) => entry.sourceIdentity === termOf({ key: order[0]! }))?.importStatus).toBe('imported');
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor({ identity }).processor, resume: true, retryFailed: true, runId: 'retry' }))).summary.runStatus).toBe('nothing-to-do');
  });

  it('Slugwechsel über Läufe: Zusammenführung, Rebuild und erneuter Lauf erzeugen weder neue Norm noch neue Verarbeitung', async () => {
    const { root, order, source } = await prepareRoot(6);
    const first = (await enumerationOnDisk(root)).items.find((item) => item.key === order[0])!;
    const second = (await enumerationOnDisk(root)).items.find((item) => item.key === order[1])!;
    // Die Fassungsliste von Stammnorm 1 nennt auch die Adressen von Eintrag 2 (Slugwechsel).
    const versionUrls = (item: EnumerationItem): string[] => (item.key === first.key ? [...first.urls, ...second.urls] : [...item.urls]);
    const run1 = await runBulkImport(runOptions(root, { processor: stubProcessor({ versionUrls }).processor, runId: 'lauf-1' }));
    expect(run1.summary).toMatchObject({ processed: 5, outcomes: expect.objectContaining({ merged: 1 }) });
    const manifest = await readManifest(root);
    expect(manifest.entries).toHaveLength(5);

    const rebuilt = buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, previous: await enumerationOnDisk(root), manifest, now: '2026-09-16T00:00:00.000Z' });
    expect(rebuilt.items).toHaveLength(5);
    expect(rebuilt.items.filter((item) => item.mergedInto)).toEqual([]);
    expect(rebuilt.items.find((item) => item.key === termOf({ key: order[0]! }))?.urls).toEqual([...first.urls, ...second.urls].sort());
    expect(findDuplicateIdentities(rebuilt)).toEqual([]);
    await writeEnumeration(root, rebuilt);

    const run2 = stubProcessor({ versionUrls });
    const idle = await runBulkImport(runOptions(root, { processor: run2.processor, manifest, resume: true, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'lauf-2' }));
    expect(idle.summary.runStatus).toBe('nothing-to-do');
    expect(run2.calls).toEqual([]);
    expect((await readManifest(root)).entries).toHaveLength(5);
    expect(await invariants(root)).toEqual([]);
  });
});

describe('Bulk-Runner: Review-Entscheidungen überleben Wiederholungsläufe', () => {
  it('--retry-review reaktiviert keine entschiedenen Fälle; verschwundene Befunde werden abgelöst, nie gelöscht', async () => {
    const { root, order } = await prepareRoot(3);
    const inputs = [
      { category: 'metadata-conflict' as const, key: 'issue-date', severity: 'blocking' as const, summary: 'Datum widersprüchlich', details: [] },
      { category: 'attachment' as const, key: 'annex-pdf-only:Anlage 1', severity: 'non-blocking' as const, summary: 'PDF-Anlage', details: [] },
    ];
    const review = stubProcessor({ decide: (item) => (indexOf(item.key) === 1 ? { status: 'review', reviewInputs: inputs } : { status: 'done' }) });
    await runBulkImport(runOptions(root, { processor: review.processor, runId: 'basis' }));
    const identity = termOf({ key: order[0]! });
    const decidedId = reviewItemId(identity, 'attachment', 'annex-pdf-only:Anlage 1');
    let queue = await readReviewQueue(root);
    expect(queue.items.map((item) => item.status)).toEqual(['open', 'open']);
    queue = decideReviewItem(queue, decidedId, { decision: 'accepted', reason: 'Anlage als archivierte Quelle genügt', decidedAt: '2026-09-15T13:00:00.000Z', decidedBy: 'Redaktion' });
    await writeReviewShard(root, queue, 'lrgv', identity);

    // Wiederholung mit identischem Befund: Entscheidung bleibt, offener Fall bleibt offen.
    const again = stubProcessor({ decide: (item) => (indexOf(item.key) === 1 ? { status: 'review', reviewInputs: inputs } : { status: 'done' }) });
    const retry = await runBulkImport(runOptions(root, { processor: again.processor, resume: true, retryReview: true, reviewQueue: queue, runId: 'retry-1' }));
    expect(retry.summary).toMatchObject({ processed: 1, outcomes: expect.objectContaining({ review: 1 }) });
    queue = await readReviewQueue(root);
    expect(queue.items.find((item) => item.id === decidedId)).toMatchObject({ status: 'accepted', occurrence: 'current', decision: { decidedBy: 'Redaktion', reason: 'Anlage als archivierte Quelle genügt' } });
    expect(queue.items.find((item) => item.category === 'metadata-conflict')).toMatchObject({ status: 'open', occurrence: 'current' });

    // Der offene Befund verschwindet: superseded durch den Importer, der entschiedene bleibt entschieden (not-reproduced).
    const resolved = stubProcessor({ decide: () => ({ status: 'done' }) });
    const third = await runBulkImport(runOptions(root, { processor: resolved.processor, resume: true, retryReview: true, reviewQueue: queue, runId: 'retry-2' }));
    expect(third.summary).toMatchObject({ processed: 1 });
    expect(statusCounts(await enumerationOnDisk(root))).toEqual({ done: 3 });
    queue = await readReviewQueue(root);
    expect(queue.items).toHaveLength(2);
    expect(queue.items.find((item) => item.id === decidedId)).toMatchObject({ status: 'accepted', occurrence: 'not-reproduced', decision: { decidedBy: 'Redaktion' } });
    expect(queue.items.find((item) => item.category === 'metadata-conflict')).toMatchObject({ status: 'superseded', occurrence: 'not-reproduced', decision: { decision: 'superseded', decidedBy: 'importer' } });
    expect(JSON.parse(await readFile(join(root, manifestEntryPath('lrgv', identity)), 'utf8')).entry.reviewStatus).toBe('resolved');
  });
});
