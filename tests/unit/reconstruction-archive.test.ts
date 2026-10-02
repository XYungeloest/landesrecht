import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReconstructionArchiveFetcher } from '../../scripts/lib/reconstruction-archive.ts';
import { sha256Hex } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'reconstruction-archive-test-'));
  roots.push(root);
  const bytes = '<p>synthetische Primärquelle</p>';
  const raw = { role: 'version-page' as const, url: 'https://example.invalid/source', finalUrl: 'https://example.invalid/source/', localSource: 'source.html', sha256: sha256Hex(bytes), byteLength: Buffer.byteLength(bytes), contentType: 'text/html', retrievedAt: '2023-12-01T00:00:00Z', archiveStatus: 'versioned' as const };
  await writeFile(join(root, raw.localSource), bytes);
  const manifest = { sourceIdentity: 'synthetic:test', rawDocuments: [raw] } as ManifestEntry;
  const network = vi.fn(() => { throw new Error('Netz verboten'); });
  vi.stubGlobal('fetch', network);
  return { root, raw, bytes, network, fetcher: createReconstructionArchiveFetcher(root, manifest) };
}
describe('Rekonstruktionsarchiv ohne HTTP-Cache', () => {
  it('liefert hashgeprüfte Bytes und archivierte Metadaten für Original- und Redirect-URL', async () => {
    const f = await fixture();
    for (const url of [f.raw.url, f.raw.finalUrl]) {
      const document = await f.fetcher.fetch(url);
      expect(Buffer.from(document.bytes).toString()).toBe(f.bytes);
      expect(document.sha256).toBe(f.raw.sha256);
      expect(document.retrievedAt).toBe(f.raw.retrievedAt);
    }
    expect(f.fetcher.stats).toEqual({ networkRequests: 0, cacheHits: 2 });
    expect(f.network).not.toHaveBeenCalled();
  });
  it.each(['missing', 'hash', 'length', 'unknown', 'outside'] as const)('scheitert geschlossen bei %s', async (kind) => {
    const f = await fixture();
    if (kind === 'missing') await rm(join(f.root, f.raw.localSource));
    if (kind === 'hash') await writeFile(join(f.root, f.raw.localSource), f.bytes.replace('Primär', 'Sekund'));
    if (kind === 'length') f.raw.byteLength++;
    if (kind === 'outside') f.raw.localSource = '../source.html';
    await expect(f.fetcher.fetch(kind === 'unknown' ? 'https://example.invalid/unknown' : f.raw.url)).rejects.toThrow(/synthetic:test:.*Pfad.*SHA-256.*nicht vollständig auditierbar/u);
    expect(f.network).not.toHaveBeenCalled();
  });
});
