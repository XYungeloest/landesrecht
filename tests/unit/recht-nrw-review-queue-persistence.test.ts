/**
 * Review-Entscheidungen sind persistent: über den Schreibpfad (persistReview → Review-Datei je Quelle) und über den
 * echten LRGV-Importpfad. Gleicher Befund → Entscheidung bleibt; verschwundener Befund → resolved/superseded, nie
 * gelöscht; wieder auftretender Befund → erneut offen mit Historie. Temporäre Roots, kein Netz.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FetchedDocument, RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { emptyManifest, readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { persistReview } from '@landesrecht/importer-recht-nrw/common/persist.ts';
import { decideReviewItem, emptyReviewQueue, readReviewQueue, reviewItemId, reviewShardPath, writeReviewShard, type ReviewItemInput } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { importRechtNrwNorm } from '@landesrecht/importer-recht-nrw/lrgv/pipeline.ts';

import { cleanupTempBases, tempBase } from '../helpers/recht-nrw-bulk-stub.ts';

const repoRoot = process.cwd();
const fixtures = join(repoRoot, 'tests', 'fixtures', 'recht-nrw');
const NATIVE_URL = 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw';
const ANNEX_URL = 'https://recht.nrw.de/system/files/BA/4242-1-anlage.htm';
const ANNEX_PDF_URL = 'https://recht.nrw.de/system/files/BA/4242-2-anlage.pdf';
const now = (): Date => new Date('2026-09-15T12:00:00.000Z');

afterAll(cleanupTempBases);

describe('Review-Entscheidungen über den Schreibpfad (persistReview, Review-Dateien)', () => {
  const run = (nowIso: string) => ({ sourceArea: 'lrgv' as const, sourceIdentity: 'term:4711', sourceUrl: 'https://recht.nrw.de/lrgv/gesetz/01012020-test', now: nowIso });
  const conflict: ReviewItemInput = { category: 'metadata-conflict', key: 'issue-date', severity: 'blocking', summary: 'Datum widersprüchlich', details: ['Infobox 2020-01-01', 'Text 2020-02-01'] };
  const attachment: ReviewItemInput = { category: 'attachment', key: 'annex-pdf-only:Anlage 1', severity: 'non-blocking', summary: 'PDF-Anlage ohne Text', details: [] };

  it('Entscheidung treffen → Reimport mit identischem Befund → Entscheidung bleibt; Befund verschwindet → superseded/resolved, nie gelöscht; erneut → offen mit Historie', async () => {
    const root = join(await tempBase('recht-nrw-review-'), 'root');
    await mkdir(root, { recursive: true });
    const first = await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: emptyReviewQueue(), run: run('2026-09-15T10:00:00.000Z'), items: [conflict, attachment] });
    expect(first.reviewStatus).toBe('open');
    expect(first.written).toEqual([reviewShardPath('lrgv', 'term:4711').replace(/\\/gu, '/')]);
    const attachmentId = reviewItemId('term:4711', 'attachment', 'annex-pdf-only:Anlage 1');
    const conflictId = reviewItemId('term:4711', 'metadata-conflict', 'issue-date');

    // Manuelle Entscheidung (wie `review --decide … --write`).
    let queue = decideReviewItem(await readReviewQueue(root), attachmentId, { decision: 'accepted', reason: 'Anlage als archivierte Quelle genügt', decidedAt: '2026-09-15T11:00:00.000Z', decidedBy: 'Redaktion', override: 'anlage-1' });
    await writeReviewShard(root, queue, 'lrgv', 'term:4711');

    // Reimport mit identischem Befund.
    const second = await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: await readReviewQueue(root), run: run('2026-09-16T10:00:00.000Z'), items: [conflict, attachment] });
    queue = await readReviewQueue(root);
    expect(queue.items).toHaveLength(2);
    expect(queue.items.find((item) => item.id === attachmentId)).toMatchObject({ status: 'accepted', occurrence: 'current', updatedAt: '2026-09-15T11:00:00.000Z', decision: { decision: 'accepted', decidedBy: 'Redaktion', override: 'anlage-1', reason: 'Anlage als archivierte Quelle genügt' } });
    expect(queue.items.find((item) => item.id === conflictId)).toMatchObject({ status: 'open', occurrence: 'current', firstSeenAt: '2026-09-15T10:00:00.000Z' });
    expect(second.reviewStatus).toBe('open');

    // Der offene Befund verschwindet, der entschiedene ebenfalls: nichts wird gelöscht.
    const third = await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: await readReviewQueue(root), run: run('2026-09-17T10:00:00.000Z'), items: [] });
    queue = await readReviewQueue(root);
    expect(queue.items).toHaveLength(2);
    expect(queue.items.find((item) => item.id === conflictId)).toMatchObject({ status: 'superseded', occurrence: 'not-reproduced', decision: { decision: 'superseded', decidedBy: 'importer', decidedAt: '2026-09-17T10:00:00.000Z' } });
    expect(queue.items.find((item) => item.id === attachmentId)).toMatchObject({ status: 'accepted', occurrence: 'not-reproduced', decision: { decidedBy: 'Redaktion' } });
    expect(third.reviewStatus).toBe('resolved');
    expect(third.written).toEqual([reviewShardPath('lrgv', 'term:4711').replace(/\\/gu, '/')]);

    // Ein vom Importer abgelöster Befund tritt wieder auf: erneut offen, Ablösung in der Historie; die manuelle Entscheidung bleibt.
    const fourth = await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: await readReviewQueue(root), run: run('2026-09-18T10:00:00.000Z'), items: [conflict, attachment] });
    queue = await readReviewQueue(root);
    const reopened = queue.items.find((item) => item.id === conflictId)!;
    expect(reopened).toMatchObject({ status: 'open', occurrence: 'current', updatedAt: '2026-09-18T10:00:00.000Z' });
    expect(reopened.decision).toBeUndefined();
    expect(reopened.history).toEqual([{ decision: 'superseded', reason: expect.stringContaining('nicht mehr auf'), decidedAt: '2026-09-17T10:00:00.000Z', decidedBy: 'importer' }]);
    expect(queue.items.find((item) => item.id === attachmentId)).toMatchObject({ status: 'accepted', occurrence: 'current', decision: { decidedBy: 'Redaktion' } });
    expect(fourth.reviewStatus).toBe('open');
    // Die Datei enthält genau diese zwei Fälle; keine Kennung ging verloren.
    const shard = JSON.parse(await readFile(join(root, reviewShardPath('lrgv', 'term:4711')), 'utf8')) as { items: Array<{ id: string }> };
    expect(shard.items.map((item) => item.id).sort()).toEqual([attachmentId, conflictId].sort());
  });

  it('eine manuell entschiedene Ablehnung (excluded) bleibt auch beim Verschwinden des Befunds bestehen und wird nicht vom Importer überschrieben', async () => {
    const root = join(await tempBase('recht-nrw-review-'), 'root');
    await mkdir(root, { recursive: true });
    await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: emptyReviewQueue(), run: run('2026-09-15T10:00:00.000Z'), items: [conflict] });
    const id = reviewItemId('term:4711', 'metadata-conflict', 'issue-date');
    await writeReviewShard(root, decideReviewItem(await readReviewQueue(root), id, { decision: 'excluded', reason: 'Vorschrift gehört nicht zum Bestand', decidedAt: '2026-09-15T11:00:00.000Z', decidedBy: 'Redaktion' }), 'lrgv', 'term:4711');
    await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: await readReviewQueue(root), run: run('2026-09-16T10:00:00.000Z'), items: [] });
    const item = (await readReviewQueue(root)).items.find((candidate) => candidate.id === id)!;
    expect(item).toMatchObject({ status: 'excluded', occurrence: 'not-reproduced', decision: { decision: 'excluded', decidedBy: 'Redaktion' } });
    expect(item.history).toBeUndefined();
    await persistReview({ root, write: true, manifest: emptyManifest(), reviewQueue: await readReviewQueue(root), run: run('2026-09-17T10:00:00.000Z'), items: [conflict] });
    expect((await readReviewQueue(root)).items.find((candidate) => candidate.id === id)).toMatchObject({ status: 'excluded', occurrence: 'current', decision: { decidedBy: 'Redaktion' } });
  });
});

describe('Review-Entscheidungen über den LRGV-Importpfad (Fixtures)', () => {
  let root: string;
  let files: Record<string, string>;
  beforeAll(async () => {
    root = join(await tempBase('recht-nrw-review-pipeline-'), 'root');
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
    const native = await readFile(join(fixtures, 'version-page-native.html'), 'utf8');
    files = {
      [NATIVE_URL]: native.replace('<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div>', '<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div><div class="info-box-item"><div class="field__label">Gültig bis</div><div class="field__item"> 29.03.2018 </div></div>'),
      [ANNEX_URL]: await readFile(join(fixtures, 'annex.htm'), 'utf8'),
      [ANNEX_PDF_URL]: '%PDF-1.4 fake',
    };
  });
  const fetcher = (): RechtNrwFetcher => ({
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string): Promise<FetchedDocument> {
      const text = files[url];
      if (text === undefined) throw new Error(`nicht vorgesehen: ${url}`);
      const bytes = new TextEncoder().encode(text);
      return { url, finalUrl: url, status: 200, contentType: url.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: createHash('sha256').update(bytes).digest('hex'), bytes, fromCache: false };
    },
  });

  it('Entscheidung zum Review-Fall des Importpfads überlebt den Reimport; Manifest meldet resolved statt open', async () => {
    const first = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fetcher(), write: true, now });
    expect(first.status).toBe('needs-review');
    const identity = 'term:515151';
    let queue = await readReviewQueue(root);
    const selection = queue.items.find((item) => item.sourceIdentity === identity && item.category === 'version-selection')!;
    expect(selection.status).toBe('open');
    expect((await readManifest(root)).entries[0]!.reviewStatus).toBe('open');

    queue = decideReviewItem(queue, selection.id, { decision: 'deferred', reason: 'Intervall der Quelle wird nach dem Bulk geprüft', decidedAt: '2026-09-15T13:00:00.000Z', decidedBy: 'Redaktion' });
    await writeReviewShard(root, queue, 'lrgv', identity);
    const openBefore = queue.items.filter((item) => item.sourceIdentity === identity && item.status === 'open').length;

    // Reimport ohne übergebene Queue: der Importpfad liest die Review-Dateien selbst.
    const second = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fetcher(), write: true, now: () => new Date('2026-09-16T12:00:00.000Z') });
    expect(second.status).toBe('needs-review');
    queue = await readReviewQueue(root);
    expect(queue.items.find((item) => item.id === selection.id)).toMatchObject({ status: 'deferred', occurrence: 'current', decision: { decidedBy: 'Redaktion', reason: 'Intervall der Quelle wird nach dem Bulk geprüft' } });
    expect(queue.items.filter((item) => item.sourceIdentity === identity && item.status === 'open')).toHaveLength(openBefore);
    expect(queue.items.every((item) => item.sourceIdentity !== identity || item.occurrence === 'current')).toBe(true);
    const entry = (await readManifest(root)).entries.find((candidate) => candidate.sourceIdentity === identity)!;
    expect(entry.reviewStatus).toBe(openBefore > 0 ? 'open' : 'resolved');
  });
});
