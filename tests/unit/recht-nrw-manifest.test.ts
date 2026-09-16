/**
 * Gemeinsames Manifest (eine Datei je Stammnorm, Hochstufung früherer Formate), Review-Queue (Schema 2:
 * Entscheidungen, Ablösung statt Löschen), dokumentierte Overrides, Slug-Registry und Ableitung der
 * Review-Fälle – ohne Netz.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CorruptStateError } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { MANIFEST_PATH, manifestEntryPath, readManifest, readManifestEntry, upgradeManifestEntryV1, writeManifest, writeManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { OVERRIDES_PATH, readOverrides } from '@landesrecht/importer-recht-nrw/common/overrides.ts';
import { reviewStatusFor } from '@landesrecht/importer-recht-nrw/common/persist.ts';
import { deriveReviewItems } from '@landesrecht/importer-recht-nrw/common/review-derivation.ts';
import { decideReviewItem, emptyReviewQueue, mergeReviewItems, readReviewQueue, REVIEW_QUEUE_PATH, reviewItemId, reviewShardPath, writeReviewQueue, type ReviewItemInput } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { createSlugReserver, emptySlugRegistry, seedSlugRegistryFromManifest, validateSlugRegistry } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';

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

  it('liest frühere Einzeldatei-Manifeste und schreibt je Stammnorm eine Datei', async () => {
    await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
    await writeFile(join(root, MANIFEST_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-import-manifest/1', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries: [v1Entry] }));
    const manifest = await readManifest(root);
    expect(manifest.schemaVersion).toBe('recht-nrw-import-manifest/2');
    expect(manifest.entries[0]!.sourceArea).toBe('lrgv');
    await writeManifest(root, manifest);
    expect(existsSync(join(root, MANIFEST_PATH))).toBe(false);
    const shard = JSON.parse(await readFile(join(root, manifestEntryPath('lrgv', 'term:1')), 'utf8')) as { schemaVersion: string; entry: { sourceIdentity: string } };
    expect(shard).toMatchObject({ schemaVersion: 'recht-nrw-import-manifest-entry/2', entry: { sourceIdentity: 'term:1' } });
    expect((await readManifest(root)).entries.map((entry) => entry.sourceIdentity)).toEqual(['term:1']);
  });

  it('behält Laufmetadaten bei unverändertem Inhalt (kein Diff im Wiederholungslauf)', async () => {
    const entry = { ...upgradeManifestEntryV1(v1Entry), sourceIdentity: 'term:5' };
    await writeManifestEntry(root, { ...entry, importedAt: 'A', runId: 'lauf-1' });
    const repeat = await writeManifestEntry(root, { ...entry, importedAt: 'B', runId: 'lauf-2' });
    expect(repeat.changed).toBe(false);
    expect(await readManifestEntry(root, 'lrgv', 'term:5')).toMatchObject({ importedAt: 'A', runId: 'lauf-1' });
    const changed = await writeManifestEntry(root, { ...entry, importedAt: 'C', runId: 'lauf-3', sourceValidTo: '2030-01-01' });
    expect(changed.changed).toBe(true);
    expect(await readManifestEntry(root, 'lrgv', 'term:5')).toMatchObject({ importedAt: 'C', runId: 'lauf-3', sourceValidTo: '2030-01-01' });
  });

  it('meldet beschädigte Manifestdateien als systemischen Zustandsfehler', async () => {
    const file = join(root, manifestEntryPath('lrmb', 'term:2'));
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, '{"schemaVersion": "recht-nrw-import-manifest-entry/2", "entry": ');
    await expect(readManifest(root)).rejects.toBeInstanceOf(CorruptStateError);
    await rm(file);
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
    expect(queue.items.map((item) => [item.category, item.status, item.occurrence])).toEqual([['attachment', 'open', 'current'], ['reconstruction-required', 'open', 'current']].sort((left, right) => reviewItemId('term:9', left[0] as never, left[0] === 'attachment' ? 'annex-pdf-only:Anlage 1' : 'reconstruction-required').localeCompare(reviewItemId('term:9', right[0] as never, right[0] === 'attachment' ? 'annex-pdf-only:Anlage 1' : 'reconstruction-required'))));
    expect(queue.items.some((item) => item.id === reviewItemId('term:9', 'reconstruction-required', 'reconstruction-required'))).toBe(true);
    expect(queue.items.every((item) => item.firstSeenAt === run.now && item.updatedAt === run.now)).toBe(true);
    expect(reviewStatusFor(queue, 'term:9')).toBe('open');
  });

  it('lässt Fälle bei Reimport nicht verschwinden, erhält Entscheidungen und löst verschwundene Befunde ab', () => {
    let queue = mergeReviewItems(emptyReviewQueue(), run, items);
    const attachmentId = reviewItemId('term:9', 'attachment', 'annex-pdf-only:Anlage 1');
    queue = decideReviewItem(queue, attachmentId, { decision: 'accepted', reason: 'PDF-Anlage als archivierte Quelle genügt', decidedAt: '2026-09-15T11:00:00.000Z', decidedBy: 'Redaktion' });
    queue = mergeReviewItems(queue, { ...run, now: '2026-09-16T10:00:00.000Z' }, [items[1]!]);
    expect(queue.items).toHaveLength(2);
    const reconstruction = queue.items.find((item) => item.category === 'reconstruction-required')!;
    expect(reconstruction).toMatchObject({ status: 'superseded', occurrence: 'not-reproduced', firstSeenAt: '2026-09-15T10:00:00.000Z', decision: { decision: 'superseded', decidedBy: 'importer' } });
    const attachment = queue.items.find((item) => item.category === 'attachment')!;
    expect(attachment).toMatchObject({ status: 'accepted', occurrence: 'current', firstSeenAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T11:00:00.000Z', decision: { decidedBy: 'Redaktion' } });
    expect(reviewStatusFor(queue, 'term:9')).toBe('resolved');
    queue = mergeReviewItems(queue, { ...run, now: '2026-09-17T10:00:00.000Z' }, items);
    const reopened = queue.items.find((item) => item.category === 'reconstruction-required')!;
    expect(reopened).toMatchObject({ status: 'open', occurrence: 'current' });
    expect(reopened.history).toHaveLength(1);
    expect(reopened.decision).toBeUndefined();
    expect(queue.items.find((item) => item.category === 'attachment')!.status).toBe('accepted');
  });

  it('verlangt für Entscheidungen Begründung, Datum und einen bekannten Fall', () => {
    const queue = mergeReviewItems(emptyReviewQueue(), run, items);
    const id = queue.items[0]!.id;
    expect(() => decideReviewItem(queue, id, { decision: 'deferred', reason: ' ', decidedAt: '2026-09-15' })).toThrow(/Begründung/u);
    expect(() => decideReviewItem(queue, 'term:9:other:x', { decision: 'excluded', reason: 'x', decidedAt: '2026-09-15' })).toThrow(/existiert nicht/u);
    const deferred = decideReviewItem(queue, id, { decision: 'deferred', reason: 'nach dem Bulk', decidedAt: '2026-09-15', override: 'kibiz-source-valid-to', replacement: { sourceValidTo: '2026-07-31' } });
    expect(deferred.items.find((item) => item.id === id)).toMatchObject({ status: 'deferred', decision: { override: 'kibiz-source-valid-to', replacement: { sourceValidTo: '2026-07-31' } } });
  });

  it('schreibt je Quelle eine Datei und übernimmt frühere Einzeldateien (Schema 1)', async () => {
    const { updatedAt: _updatedAt, ...v1Item } = mergeReviewItems(emptyReviewQueue(), run, [items[0]!]).items[0]!;
    const legacy = { schemaVersion: 'recht-nrw-review-queue/1', items: [{ ...v1Item, status: 'resolved', lastSeenAt: '2026-09-15T12:00:00.000Z', resolution: { decidedAt: '2026-09-15T12:00:00.000Z', note: 'erledigt' } }] };
    await writeFile(join(root, REVIEW_QUEUE_PATH), JSON.stringify(legacy));
    const queue = await readReviewQueue(root);
    expect(queue.items[0]).toMatchObject({ status: 'resolved', updatedAt: '2026-09-15T12:00:00.000Z', decision: { decision: 'resolved', reason: 'erledigt' } });
    await writeReviewQueue(root, queue);
    expect(existsSync(join(root, REVIEW_QUEUE_PATH))).toBe(false);
    expect(existsSync(join(root, reviewShardPath('lrmb', 'term:9')))).toBe(true);
    expect((await readReviewQueue(root)).items).toHaveLength(1);
  });

  it('leitet Kategorien aus Befunden und Erkennungen ab', () => {
    const derived = deriveReviewItems([
      { severity: 'error', code: 'selection-gap', message: 'Lücke' },
      { severity: 'warning', code: 'version-history-overlap', message: 'Überlappung 2001' },
      { severity: 'warning', code: 'annex-pdf-only', message: 'Anlage „A“ nur PDF' },
      { severity: 'error', code: 'selection-page-contradiction', message: 'Widerspruch' },
      { severity: 'warning', code: 'unresolved-source-references', message: 'aggregiert' },
      { severity: 'error', code: 'normativity-review', message: 'zweifelhaft' },
      { severity: 'error', code: 'document-identity-mismatch', message: 'anderes Dokument' },
      { severity: 'error', code: 'attachment-pdf-only-essential', message: 'nur PDF' },
    ], { unresolved: [
      { path: 'body[1].text', term: 'Bezirksregierung', context: '', category: 'authority', decision: 'manual-review', reason: '', manualDecisionRequired: true },
      { path: 'body[2].text', term: 'Bezirksregierung', context: '', category: 'authority', decision: 'manual-review', reason: '', manualDecisionRequired: true },
    ] } as never);
    expect(derived.map((item) => [item.category, item.severity])).toEqual([
      ['version-selection', 'blocking'], ['historical-gap', 'non-blocking'], ['attachment', 'non-blocking'], ['metadata-conflict', 'blocking'], ['normativity', 'blocking'], ['document-identity', 'blocking'], ['attachment', 'blocking'], ['institution-mapping', 'non-blocking'],
    ]);
    expect(derived.at(-1)!.details).toEqual(['Bezirksregierung ×2 (body[1].text, body[2].text)']);
  });
});

describe('Overrides und Slug-Registry', () => {
  it('validiert dokumentierte Overrides fail-closed', async () => {
    const valid = { id: 'kibiz-source-valid-to', sourceIdentity: 'term:32564', field: 'sourceValidTo', value: '2026-07-31', reason: 'Folgefassung ab 01.08.2026', evidence: { source: 'Fassungsliste' }, reviewedAt: '2026-09-15' };
    await writeFile(join(root, OVERRIDES_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-overrides/1', entries: [valid] }));
    expect((await readOverrides(root)).entries).toHaveLength(1);
    for (const invalid of [{ ...valid, evidence: { source: '' } }, { ...valid, reason: '' }, { ...valid, value: '31.07.2026' }, { ...valid, field: 'geltung' }, { ...valid, sourceIdentity: 'url:x' }]) {
      await writeFile(join(root, OVERRIDES_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-overrides/1', entries: [invalid] }));
      await expect(readOverrides(root)).rejects.toThrow();
    }
    await writeFile(join(root, OVERRIDES_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-overrides/1', entries: [valid, { ...valid, id: 'doppelt' }] }));
    await expect(readOverrides(root)).rejects.toThrow(/mehrere Overrides/u);
    await rm(join(root, OVERRIDES_PATH));
  });

  it('vergibt Slugs stabil je Quellidentität und löst Kollisionen deterministisch', () => {
    const registry = emptySlugRegistry();
    const reserver = createSlugReserver(registry, new Set(['fremd-west']));
    expect(reserver.reserve('term:1', 'foo-west')).toMatchObject({ slug: 'foo-west', newlyReserved: true });
    expect(reserver.reserve('term:2', 'foo-west')).toMatchObject({ slug: 'foo-west-2', collision: { candidate: 'foo-west', heldBy: 'term:1' } });
    expect(reserver.reserve('term:1', 'foo-neu-west')).toMatchObject({ slug: 'foo-west', newlyReserved: false, candidateChanged: { previous: 'foo-west', current: 'foo-neu-west' } });
    expect(reserver.reserve('term:3', 'fremd-west').slug).toBe('fremd-west-3');
    expect(reserver.changed).toBe(true);
    expect(() => validateSlugRegistry(registry)).not.toThrow();
    const seeded = seedSlugRegistryFromManifest(emptySlugRegistry(), { schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries: [upgradeManifestEntryV1(v1Entry)] });
    expect(seeded.entries).toEqual([{ slug: 'testg-west', sourceIdentity: 'term:1', candidate: 'testg-west', assignment: 'derived' }]);
  });
});
