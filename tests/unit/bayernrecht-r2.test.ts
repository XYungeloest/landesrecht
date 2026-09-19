/**
 * R2-Rohquellenarchiv des BAYERN.RECHT-Adapters – ohne Netz, mit Speichertransport und temporären Wurzeln.
 *
 * Geprüft wird an den Eigenschaften, auf die sich der echte Sync verlässt:
 *   - Objektschlüssel sind deterministisch, inhaltsadressiert und liegen unter `baywue/bayernrecht/2023-12-01/`;
 *     jeder Schlüssel außerhalb ist ein Fehler, bevor ein Transport ihn sieht (Präfixschutz).
 *   - Staging legt genau die Cachebytes ab (SHA-256 nachgerechnet), nur für übernommene Normen, markiert das
 *     Manifest `staged` und ist wiederholbar ohne Änderung.
 *   - Das Audit vor dem Sync sperrt bei einem fehlenden oder veränderten Objekt – der Transport wird dann nie
 *     aufgerufen.
 *   - Der Sync überschreibt nie, setzt `uploaded` → `verified` und lässt alles außerhalb von `baywue/` unverändert.
 *
 * Kein Test schreibt in den echten Bestand oder ruft Cloudflare an.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createMemoryR2Transport, WranglerAuthError, type MemoryR2Transport, type R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { IMPLEMENTED_COMMANDS, parseCliArguments } from '@landesrecht/importer-bayernrecht/cli.ts';
import { R2_PREFIX, type SourceArea } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { manifestEntryPath } from '@landesrecht/importer-bayernrecht/common/paths.ts';
import { readManifest, readManifestEntry, writeManifestEntry, type ImportStatus, type ManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import { cacheEntryPaths } from '@landesrecht/importer-bayernrecht/fetch/cache.ts';
import { ArchiveError, assertArchiveKey, deterministicSample, envelopeKey, guardTransport, KEY_PREFIX, r2ObjectKey } from '@landesrecht/importer-bayernrecht/r2/archive.ts';
import { auditRemote, auditStaging, inventoryBucket } from '@landesrecht/importer-bayernrecht/r2/audit.ts';
import { createOAuthTransport, runR2Sync } from '@landesrecht/importer-bayernrecht/r2/command.ts';
import { archiveCandidates, assertStagingDir, stageRawSources } from '@landesrecht/importer-bayernrecht/r2/stage.ts';
import { syncArchive } from '@landesrecht/importer-bayernrecht/r2/sync.ts';
import { normAssetObjectKey } from '@landesrecht/runtime/assets.ts';
import { serveNormAsset } from '../../apps/web/src/lib/assets.ts';
import { buildZipArchive, gifBytes } from '../helpers/bayernrecht-parse.ts';
import { cleanupTempRoots, sampleManifestEntry, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const WEST_KEY = 'west/recht-nrw/2023-12-01/term-1/0123456789abcdef-version-page.html';

interface Spec {
  identity: string;
  area: SourceArea;
  status: ImportStatus;
  slug: string;
}

const SPECS: Spec[] = [
  { identity: 'BayTestG', area: 'landesrecht', status: 'imported', slug: 'baytestg-baywue' },
  { identity: 'BayVV_2170_1_1_I', area: 'vwv', status: 'imported-with-warnings', slug: 'bayvv-2170-baywue' },
  { identity: 'BayReviewV', area: 'landesrecht', status: 'needs-review', slug: '' },
];

interface Fixture {
  root: string;
  cacheDir: string;
  stagingDir: string;
  bytes: Map<string, Uint8Array>;
}

async function fixture(options: { skipCache?: string[] } = {}): Promise<Fixture> {
  const root = await tempRoot('landesrecht-bayernrecht-r2-');
  const cacheDir = join(root, '.cache', 'bayernrecht');
  const stagingDir = join(root, '.cache', 'bayernrecht-r2-staging');
  const bytes = new Map<string, Uint8Array>();
  for (const spec of SPECS) {
    const payload = new TextEncoder().encode(`PK Exportpaket ${spec.identity} `.repeat(20));
    const url = `https://www.gesetze-bayern.de/Content/Zip/${spec.identity}`;
    bytes.set(spec.identity, payload);
    if (!options.skipCache?.includes(spec.identity)) {
      const paths = cacheEntryPaths(cacheDir, url);
      await mkdir(cacheDir, { recursive: true });
      await writeFile(paths.bytes, payload);
      await writeFile(paths.metadata, JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'application/zip', retrievedAt: '2026-09-18T00:27:16.668Z', sha256: sha256(payload), byteLength: payload.byteLength }));
    }
    const entry: ManifestEntry = sampleManifestEntry({
      sourceIdentity: spec.identity,
      sourceArea: spec.area,
      importStatus: spec.status,
      targetSlug: spec.slug,
      sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${spec.identity}`,
      sha256: sha256(payload),
      contentType: 'application/zip',
      rawDocuments: [{ role: 'text-document', url, finalUrl: url, sha256: sha256(payload), contentType: 'application/zip', retrievedAt: '2026-09-18T00:27:16.668Z', byteLength: payload.byteLength }],
    });
    await writeManifestEntry(root, entry);
  }
  return { root, cacheDir, stagingDir, bytes };
}

const shardText = (root: string, spec: Spec): Promise<string> => readFile(join(root, manifestEntryPath(spec.area, spec.identity)), 'utf8');

async function staged(f: Fixture): Promise<void> {
  const manifest = await readManifest(f.root);
  const result = await stageRawSources({ root: f.root, manifest, cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
  expect(result.problems).toEqual([]);
}

/** Speichertransport ohne Listing (Regime readback, wie der Prozesstransport `wrangler`). */
function withoutList(inner: MemoryR2Transport): R2Transport {
  return { name: 'memory-ohne-listing', bucket: inner.bucket, head: (key) => inner.head(key), get: (key) => inner.get(key), put: (key, bytes, options) => inner.put(key, bytes, options) };
}

describe('Objektschlüssel und Präfixschutz', () => {
  it('bildet deterministische, inhaltsadressierte Schlüssel unter baywue/bayernrecht/2023-12-01/', () => {
    expect(KEY_PREFIX).toBe(`${R2_PREFIX}/`);
    expect(KEY_PREFIX).toBe('baywue/bayernrecht/2023-12-01/');
    const input = { sourceArea: 'landesrecht' as const, sourceIdentity: 'AkadGrAuslHsStV', sha256: '5783881fc8931bf8fef517e72ad03993b38f11938cb27ddad69ec715a000b82b', role: 'text-document' as const, contentType: 'application/zip' };
    const key = r2ObjectKey(input);
    expect(key).toMatch(/^baywue\/bayernrecht\/2023-12-01\/landesrecht\/akadgrauslhsstv-[0-9a-f]{12}\/5783881fc8931bf8-text-document\.zip$/u);
    expect(r2ObjectKey(input)).toBe(key);
    expect(envelopeKey(key)).toBe(`${key}.envelope.json`);
  });

  it('entschärft BayRS-Nummern mit Punkt und Schrägstrich und hält sie auseinander', () => {
    const base = { sourceArea: 'vwv' as const, sha256: 'b'.repeat(64), role: 'text-document' as const, contentType: 'application/zip' };
    const dotted = r2ObjectKey({ ...base, sourceIdentity: '2170.1.1' });
    const dashed = r2ObjectKey({ ...base, sourceIdentity: '2170-1-1' });
    const slashed = r2ObjectKey({ ...base, sourceIdentity: '2038-3-4-1/2' });
    for (const key of [dotted, dashed, slashed]) expect(() => assertArchiveKey(key)).not.toThrow();
    expect(new Set([dotted, dashed, slashed]).size).toBe(3);
    expect(slashed.split('/')).toHaveLength(6);
  });

  it('lehnt Schlüssel außerhalb von baywue/ und nicht kanonische Schlüssel ab', () => {
    for (const key of [WEST_KEY, 'baywue/other/2023-12-01/x.zip', 'nsh/juris-sh/2023-12-01/x', `/${KEY_PREFIX}x.zip`, `${KEY_PREFIX}../../west/x.zip`, `${KEY_PREFIX}a//b.zip`, `${KEY_PREFIX}`, `${KEY_PREFIX}a b.zip`]) {
      expect(() => assertArchiveKey(key), key).toThrow(ArchiveError);
    }
    expect(() => r2ObjectKey({ sourceArea: 'landesrecht', sourceIdentity: 'X', sha256: 'kein-hash', role: 'text-document', contentType: 'application/zip' })).toThrow(/SHA-256/u);
  });

  it('der geschützte Transport reicht fremde Schlüssel nie an den Transport weiter', async () => {
    const memory = createMemoryR2Transport();
    const guarded = guardTransport(memory);
    await expect(guarded.put(WEST_KEY, new Uint8Array([1]), { contentType: 'text/html', metadata: {} })).rejects.toThrow(/außerhalb/u);
    await expect(guarded.get(WEST_KEY)).rejects.toThrow(/außerhalb/u);
    await expect(guarded.head(WEST_KEY)).rejects.toThrow(/außerhalb/u);
    await expect(guarded.list!('')).rejects.toThrow(/außerhalb/u);
    await expect(guarded.list!('west/')).rejects.toThrow(/außerhalb/u);
    expect(memory.calls).toEqual([]);
    expect(memory.objects.size).toBe(0);
    await guarded.put(`${KEY_PREFIX}landesrecht/x-000000000000/0123456789abcdef-text-document.zip`, new Uint8Array([1]), { contentType: 'application/zip', metadata: {} });
    expect([...memory.objects.keys()]).toEqual([`${KEY_PREFIX}landesrecht/x-000000000000/0123456789abcdef-text-document.zip`]);
    expect(() => guardTransport(createMemoryR2Transport({ bucket: 'landesrecht-quellen-staging' }))).toThrow(/Bucket/u);
  });

  it('die deterministische Stichprobe wählt bei gleicher Saat dieselben Objekte', () => {
    const keys = Array.from({ length: 40 }, (_, index) => `${KEY_PREFIX}landesrecht/k${index}/x.zip`);
    const first = deterministicSample(keys, (key) => key, '2023-12-01', 5);
    expect(deterministicSample([...keys].reverse(), (key) => key, '2023-12-01', 5)).toEqual(first);
    expect(deterministicSample(keys, (key) => key, 'andere-saat', 5)).not.toEqual(first);
  });
});

describe('Staging', () => {
  it('Dry-run schreibt weder Staging noch Manifest', async () => {
    const f = await fixture();
    const before = await Promise.all(SPECS.map((spec) => shardText(f.root, spec)));
    const result = await stageRawSources({ root: f.root, manifest: await readManifest(f.root), cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: false });
    expect(result).toMatchObject({ candidates: 2, written: 2, manifestEntriesUpdated: 2, problems: [] });
    await expect(readFile(join(f.stagingDir, KEY_PREFIX))).rejects.toThrow();
    expect(await Promise.all(SPECS.map((spec) => shardText(f.root, spec)))).toEqual(before);
  });

  it('legt nur übernommene Normen unverändert ab, mit Umschlag und Manifeststatus staged', async () => {
    const f = await fixture();
    const reviewBefore = await shardText(f.root, SPECS[2]!);
    await staged(f);
    const manifest = await readManifest(f.root);
    const candidates = archiveCandidates(manifest);
    expect(candidates.map((candidate) => candidate.entry.sourceIdentity).sort()).toEqual(['BayTestG', 'BayVV_2170_1_1_I']);
    for (const candidate of candidates) {
      const onDisk = new Uint8Array(await readFile(join(f.stagingDir, candidate.objectKey)));
      expect(sha256(onDisk)).toBe(sha256(f.bytes.get(candidate.entry.sourceIdentity)!));
      expect(candidate.raw).toMatchObject({ bucket: 'landesrecht-quellen', objectKey: candidate.objectKey, archiveStatus: 'staged' });
      const envelope = JSON.parse(await readFile(join(f.stagingDir, candidate.envelopeKey), 'utf8')) as Record<string, unknown>;
      expect(envelope).toMatchObject({ schemaVersion: 'bayernrecht-r2-envelope/1', objectKey: candidate.objectKey, bucket: 'landesrecht-quellen', sha256: candidate.raw.sha256, byteLength: candidate.raw.byteLength, contentType: 'application/zip', url: candidate.raw.url, finalUrl: candidate.raw.finalUrl, retrievedAt: candidate.raw.retrievedAt, sourceIdentity: candidate.entry.sourceIdentity, sourceArea: candidate.entry.sourceArea, jurisdiction: 'baywue', baselineDate: '2023-12-01' });
    }
    // Die nicht übernommene Norm bleibt unberührt.
    expect(await shardText(f.root, SPECS[2]!)).toBe(reviewBefore);
    expect((await readManifestEntry(f.root, 'landesrecht', 'BayReviewV'))!.rawDocuments[0]!.archiveStatus).toBeUndefined();
  });

  it('ein zweiter Lauf ändert nichts', async () => {
    const f = await fixture();
    await staged(f);
    const before = await Promise.all(SPECS.map((spec) => shardText(f.root, spec)));
    const again = await stageRawSources({ root: f.root, manifest: await readManifest(f.root), cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
    expect(again).toMatchObject({ written: 0, alreadyStaged: 2, envelopesWritten: 0, manifestEntriesUpdated: 0, problems: [] });
    expect(await Promise.all(SPECS.map((spec) => shardText(f.root, spec)))).toEqual(before);
  });

  it('stagt keine Bytes, die nicht zum Manifest passen, und fehlende Cachepakete sind ein Befund', async () => {
    const f = await fixture({ skipCache: ['BayVV_2170_1_1_I'] });
    const tampered = new Uint8Array(f.bytes.get('BayTestG')!);
    tampered[10] = tampered[10]! ^ 0xff;
    await writeFile(cacheEntryPaths(f.cacheDir, 'https://www.gesetze-bayern.de/Content/Zip/BayTestG').bytes, tampered);
    const result = await stageRawSources({ root: f.root, manifest: await readManifest(f.root), cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
    expect(result.problems.map((problem) => `${problem.code}:${problem.sourceIdentity}`).sort()).toEqual(['cache-mismatch:BayTestG', 'cache-missing:BayVV_2170_1_1_I']);
    expect(result.written).toBe(0);
    for (const entry of (await readManifest(f.root)).entries) expect(entry.rawDocuments[0]!.archiveStatus).toBeUndefined();
  });

  it('verweigert ein Staging in versionierten Repository-Pfaden', async () => {
    const f = await fixture();
    expect(() => assertStagingDir(f.root, join(f.root, 'data', 'r2-staging'))).toThrow(/versionierten/u);
    expect(() => assertStagingDir(f.root, join(f.root, '.cache', 'bayernrecht-r2-staging'))).not.toThrow();
  });
});

describe('Audit vor dem Sync', () => {
  it('besteht nach vollständigem Staging', async () => {
    const f = await fixture();
    await staged(f);
    const audit = await auditStaging({ manifest: await readManifest(f.root), stagingDir: f.stagingDir });
    expect(audit).toMatchObject({ ok: true, expectedObjects: 2, presentObjects: 2, presentEnvelopes: 2, missing: [], shaMismatch: [], manifestProblems: [], keyProblems: [], stagingOnly: [] });
  });

  it('ein fehlendes Objekt sperrt den Sync – der Transport wird nie aufgerufen', async () => {
    const f = await fixture();
    await staged(f);
    const manifest = await readManifest(f.root);
    const [first] = archiveCandidates(manifest);
    await rm(join(f.stagingDir, first!.objectKey));
    const audit = await auditStaging({ manifest, stagingDir: f.stagingDir });
    expect(audit.ok).toBe(false);
    expect(audit.missing).toEqual([first!.objectKey]);
    const memory = createMemoryR2Transport();
    const result = await syncArchive({ root: f.root, manifest, transport: memory, stagingDir: f.stagingDir, concurrency: 4 });
    expect(result.blocked).toBe(true);
    expect(result.blockReasons.join(' ')).toMatch(/fehlen im Staging/u);
    expect(memory.calls).toEqual([]);
    expect(memory.objects.size).toBe(0);
    for (const entry of (await readManifest(f.root)).entries.filter((candidate) => candidate.importStatus !== 'needs-review')) expect(entry.rawDocuments[0]!.archiveStatus).toBe('staged');
  });

  it('veränderte Bytes gleicher Größe sperren den Sync (SHA-256 nachgerechnet)', async () => {
    const f = await fixture();
    await staged(f);
    const manifest = await readManifest(f.root);
    const [first] = archiveCandidates(manifest);
    const path = join(f.stagingDir, first!.objectKey);
    const bytes = new Uint8Array(await readFile(path));
    bytes[5] = bytes[5]! ^ 0x01;
    await writeFile(path, bytes);
    const audit = await auditStaging({ manifest, stagingDir: f.stagingDir });
    expect(audit.shaMismatch).toHaveLength(1);
    const memory = createMemoryR2Transport();
    expect((await syncArchive({ root: f.root, manifest, transport: memory, stagingDir: f.stagingDir })).blocked).toBe(true);
    expect(memory.calls).toEqual([]);
  });
});

describe('Sync', () => {
  it('überträgt unter baywue/, prüft über Listing und Stichprobe und setzt verified', async () => {
    const f = await fixture();
    await staged(f);
    const memory = createMemoryR2Transport();
    await memory.put(WEST_KEY, new TextEncoder().encode('<html>West</html>'), { contentType: 'text/html', metadata: {} });
    const before = await inventoryBucket(memory);
    memory.calls.length = 0;
    const manifest = await readManifest(f.root);
    const result = await syncArchive({ root: f.root, manifest, transport: memory, stagingDir: f.stagingDir, concurrency: 4, verification: 'etag', sampleRate: 1 });
    expect(result).toMatchObject({ blocked: false, verification: 'etag', pending: 2, uploaded: 2, envelopesUploaded: 2, alreadyPresent: 0, verified: 2, verifiedByListing: 4, readbacks: 2 });
    for (const call of memory.calls) expect(call.split(' ')[1]!.startsWith(KEY_PREFIX), call).toBe(true);
    const baywue = [...memory.objects.keys()].filter((key) => key.startsWith('baywue/'));
    expect(baywue).toHaveLength(4);
    for (const candidate of archiveCandidates(manifest)) expect(sha256(memory.objects.get(candidate.objectKey)!.bytes)).toBe(candidate.raw.sha256);
    for (const entry of (await readManifest(f.root)).entries) {
      expect(entry.rawDocuments[0]!.archiveStatus).toBe(entry.importStatus === 'needs-review' ? undefined : 'verified');
    }
    const after = await inventoryBucket(memory);
    expect(after.outsideFingerprint).toBe(before.outsideFingerprint);
    expect([before.jurisdictionObjects, after.jurisdictionObjects, after.objects]).toEqual([0, 4, 5]);
    expect(new TextDecoder().decode(memory.objects.get(WEST_KEY)!.bytes)).toBe('<html>West</html>');

    const stagingAudit = await auditStaging({ manifest: await readManifest(f.root), stagingDir: f.stagingDir });
    const remote = await auditRemote({ transport: guardTransport(memory), manifest: await readManifest(f.root), local: stagingAudit.local, sampleSize: 150, envelopeSampleSize: 25, seed: '2023-12-01' });
    expect(remote).toMatchObject({ ok: true, listedObjects: 4, rawObjects: 2, envelopeObjects: 2, missing: [], pending: [], unexpected: [], notVerified: [] });
    expect(remote.sample).toMatchObject({ checked: 2, failures: [] });
    expect(remote.envelopeSample).toMatchObject({ checked: 2, failures: [] });

    // Wiederholung: nichts mehr offen, kein Upload.
    memory.calls.length = 0;
    const again = await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, concurrency: 4 });
    expect(again).toMatchObject({ pending: 0, uploaded: 0 });
    expect(memory.calls.filter((call) => call.startsWith('put '))).toEqual([]);
  });

  it('archivierte Objekte einer zurückgenommenen Norm bleiben und sind kein Widerspruch; fremde Schlüssel schon', async () => {
    const f = await fixture();
    await staged(f);
    const memory = createMemoryR2Transport();
    await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, verification: 'etag' });
    // Die erste Norm wird aus dem Stichtagsbestand zurückgenommen (amtliche Verkündung: Inkrafttreten nach dem Stichtag).
    const [first] = archiveCandidates(await readManifest(f.root));
    for (const entry of (await readManifest(f.root)).entries) {
      if (entry.sourceIdentity !== first!.entry.sourceIdentity) continue;
      entry.importStatus = 'not-at-baseline' as ImportStatus;
      entry.targetSlug = '';
      entry.findings = [...entry.findings, { severity: 'info', code: 'withdrawn-not-at-baseline', message: 'Aus dem Stichtagsbestand genommen' }];
      await writeManifestEntry(f.root, entry);
    }
    const manifest = await readManifest(f.root);
    const stagingAudit = await auditStaging({ manifest, stagingDir: f.stagingDir });
    const remote = await auditRemote({ transport: guardTransport(memory), manifest, local: stagingAudit.local, sampleSize: 150, envelopeSampleSize: 25, seed: '2023-12-01' });
    expect(remote.unexpected).toEqual([]);
    expect(remote.retainedWithdrawn).toEqual([first!.objectKey, first!.envelopeKey].sort());
    expect(remote.ok).toBe(true);
    // Ein Objekt ohne Bezug bleibt eine Abweichung.
    const stray = `${KEY_PREFIX}landesrecht/fremd/0123456789abcdef-text-document.zip`;
    await memory.put(stray, new TextEncoder().encode('x'), { contentType: 'application/zip', metadata: {} });
    const again = await auditRemote({ transport: guardTransport(memory), manifest, local: stagingAudit.local, sampleSize: 150, envelopeSampleSize: 25, seed: '2023-12-01' });
    expect(again.unexpected).toEqual([stray]);
    expect(again.ok).toBe(false);
  });

  it('überschreibt nie: ein vorhandener Schlüssel mit anderem Inhalt ist ein harter Fehler', async () => {
    const f = await fixture();
    await staged(f);
    const manifest = await readManifest(f.root);
    const [first] = archiveCandidates(manifest);
    const memory = createMemoryR2Transport();
    const foreign = new TextEncoder().encode('fremder Inhalt');
    await memory.put(first!.objectKey, foreign, { contentType: 'application/zip', metadata: {} });
    await expect(syncArchive({ root: f.root, manifest, transport: memory, stagingDir: f.stagingDir })).rejects.toThrow(/nie überschreiben/u);
    expect(memory.objects.get(first!.objectKey)!.bytes).toEqual(foreign);
  });

  it('ein archivierter Umschlag bleibt: abweichender Quelltitel wird übernommen, abweichende Kernfelder brechen ab', async () => {
    // Nach einer Parserkorrektur lautet der Quelltitel anders („Biersteuer1)“ → „Biersteuer“). Der archivierte
    // Umschlag ist Provenienz und wird nie ersetzt; mit gleichen Kernfeldern gilt er, sonst bricht der Sync ab.
    const f = await fixture();
    await staged(f);
    const memory = createMemoryR2Transport();
    await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, verification: 'etag' });
    const [first] = archiveCandidates(await readManifest(f.root));
    const archived = memory.objects.get(first!.envelopeKey)!.bytes;

    // Neuer Titel, R2-Felder durch einen Bulk-Lauf geleert: Staging behält den vorhandenen Umschlag (Kernfelder gleich).
    for (const entry of (await readManifest(f.root)).entries) {
      if (entry.sourceIdentity !== first!.entry.sourceIdentity) continue;
      entry.sourceTitle = `${entry.sourceTitle} (korrigiert)`;
      for (const raw of entry.rawDocuments) { delete raw.archiveStatus; delete raw.objectKey; delete raw.bucket; }
      await writeManifestEntry(f.root, entry);
    }
    const restaged = await stageRawSources({ root: f.root, manifest: await readManifest(f.root), cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
    expect(restaged).toMatchObject({ envelopesKept: 1, envelopesWritten: 0, problems: [] });

    // Liegt im Staging dennoch ein abweichender Umschlag (älterer Lauf), gilt der archivierte.
    await writeFile(join(f.stagingDir, first!.envelopeKey), new TextEncoder().encode(new TextDecoder().decode(archived).replace('"sourceTitle": "', '"sourceTitle": "X ')));
    const adopted = await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, verification: 'etag' });
    expect(adopted).toMatchObject({ envelopesAdopted: 1, uploaded: 0, envelopesUploaded: 0 });
    expect(memory.objects.get(first!.envelopeKey)!.bytes).toEqual(archived);
    expect(new Uint8Array(await readFile(join(f.stagingDir, first!.envelopeKey)))).toEqual(archived);

    // Abweichende Kernfelder im Archiv: harter Fehler, nichts wird ersetzt.
    const tampered = new TextEncoder().encode(new TextDecoder().decode(archived).replace(/"retrievedAt": "[^"]+"/u, '"retrievedAt": "2000-01-01T00:00:00.000Z"'));
    memory.objects.set(first!.envelopeKey, { ...memory.objects.get(first!.envelopeKey)!, bytes: tampered });
    await writeFile(join(f.stagingDir, first!.envelopeKey), new TextEncoder().encode(new TextDecoder().decode(archived).replace('"sourceTitle": "', '"sourceTitle": "Y ')));
    for (const entry of (await readManifest(f.root)).entries) {
      for (const raw of entry.rawDocuments) if (raw.archiveStatus) raw.archiveStatus = 'staged';
      await writeManifestEntry(f.root, entry);
    }
    await expect(syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, verification: 'etag' })).rejects.toThrow(/Kernfeldern/u);
    expect(memory.objects.get(first!.envelopeKey)!.bytes).toEqual(tampered);
  });

  it('ohne Listing: Rücklesung je Objekt (readback)', async () => {
    const f = await fixture();
    await staged(f);
    const memory = createMemoryR2Transport();
    const result = await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: withoutList(memory), stagingDir: f.stagingDir });
    expect(result).toMatchObject({ verification: 'readback', uploaded: 2, envelopesUploaded: 2, verified: 2, readbacks: 4 });
    for (const entry of (await readManifest(f.root)).entries.filter((candidate) => candidate.importStatus !== 'needs-review')) expect(entry.rawDocuments[0]!.archiveStatus).toBe('verified');
  });
});

describe('Befehl r2-sync', () => {
  it('ist registriert und liest seine Optionen', () => {
    expect(IMPLEMENTED_COMMANDS).toContain('r2-sync');
    expect(parseCliArguments(['r2-sync', '--write', '--r2-transport', 'wrangler-api', '--concurrency', '32', '--verify', 'etag', '--sample', '10', '--seed', 'x', '--stage-only'])).toMatchObject({ command: 'r2-sync', write: true, r2Transport: 'wrangler-api', concurrency: 32, verify: 'etag', sample: 10, seed: 'x', stageOnly: true });
    expect(() => parseCliArguments(['r2-sync', '--r2-transport', 's3'])).toThrow(/Wrangler-OAuth/u);
    expect(() => parseCliArguments(['r2-sync', '--verify', 'md5'])).toThrow(/etag\|readback/u);
  });

  it('lehnt ein gesetztes CLOUDFLARE_API_TOKEN ab (nur Wrangler-OAuth)', () => {
    expect(() => createOAuthTransport('wrangler-api', '/nirgends', { CLOUDFLARE_API_TOKEN: 'x'.repeat(40) })).toThrow(/ausschließlich die Wrangler-OAuth-Anmeldung/u);
    expect(() => createOAuthTransport('wrangler', '/nirgends', { CLOUDFLARE_API_TOKEN: 'x'.repeat(40) })).toThrow(ArchiveError);
  });

  it('läuft durch: Staging, Audit, Sync, Nachprüfung, Bericht mit Bucketzählung vorher/nachher', async () => {
    const f = await fixture();
    const memory = createMemoryR2Transport();
    await memory.put(WEST_KEY, new TextEncoder().encode('<html>West</html>'), { contentType: 'text/html', metadata: {} });
    const out: string[] = [];
    const io = { print: (line: string) => out.push(line), error: (line: string) => out.push(line) };
    const code = await runR2Sync({ write: true, json: false, transport: 'wrangler-api', concurrency: 4, verify: 'etag' }, f.root, io, { createTransport: () => memory });
    expect(code, out.join('\n')).toBe(0);
    const report = JSON.parse(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.json'), 'utf8')) as Record<string, any>;
    expect(report.status).toBe('verified');
    expect(report.prefix).toBe(KEY_PREFIX);
    expect(report.staging).toMatchObject({ ok: true, expectedObjects: 2, missing: 0 });
    expect(report.remote).toMatchObject({ ok: true, listedObjects: 4, rawObjects: 2, missing: 0, unexpected: 0 });
    expect(report.remote.sample).toMatchObject({ checked: 2, failures: 0 });
    expect(report.bucketBefore).toMatchObject({ objects: 1, jurisdictionObjects: 0 });
    expect(report.bucketAfter).toMatchObject({ objects: 5, jurisdictionObjects: 4 });
    expect(report.outsideJurisdictionUnchanged).toBe(true);
    expect(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.md'), 'utf8')).toContain('Außerhalb von `baywue/` ist der Bucket unverändert');
  });

  it('Abbruch und Fortsetzung: Zwischenstand im Bericht, Laufhistorie, „vorher“ = vor dem ersten Lauf', async () => {
    const f = await fixture();
    const memory = createMemoryR2Transport();
    await memory.put(WEST_KEY, new TextEncoder().encode('<html>West</html>'), { contentType: 'text/html', metadata: {} });
    let puts = 0;
    // Erster Lauf: der dritte PUT scheitert endgültig (wie der vereinzelte 403 im echten Lauf).
    const flaky: R2Transport = { ...memory, list: (prefix) => memory.list!(prefix), head: (key) => memory.head(key), get: (key) => memory.get(key), put: async (key, bytes, options) => { puts += 1; if (puts === 3) throw new Error('PUT HTTP 403 (10042)'); return memory.put(key, bytes, options); } };
    const quiet = { print: (): void => undefined, error: (): void => undefined };
    expect(await runR2Sync({ write: true, json: false, transport: 'wrangler-api', verify: 'etag' }, f.root, quiet, { createTransport: () => flaky })).toBe(1);
    const failed = JSON.parse(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.json'), 'utf8')) as Record<string, any>;
    expect(failed.status).toBe('failed');
    expect(failed.sync).toMatchObject({ uploaded: 1, envelopesUploaded: 1 });
    // Zweiter Lauf mit gesundem Transport setzt fort; Vorhandenes wird erkannt, nicht neu geschrieben.
    expect(await runR2Sync({ write: true, json: false, transport: 'wrangler-api', verify: 'etag' }, f.root, quiet, { createTransport: () => memory })).toBe(0);
    const report = JSON.parse(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.json'), 'utf8')) as Record<string, any>;
    expect(report.status).toBe('verified');
    expect(report.sync).toMatchObject({ alreadyPresent: 1, uploaded: 1 });
    expect(report.runs.map((run: { status: string }) => run.status)).toEqual(['failed', 'verified']);
    expect(report.operation).toMatchObject({ runs: 2, outsideUnchangedAcrossRuns: true });
    expect(report.operation.bucketBeforeFirstRun).toMatchObject({ objects: 1, jurisdictionObjects: 0 });
    expect(report.operation.bucketAfterLastRun).toMatchObject({ objects: 5, jurisdictionObjects: 4 });
    expect(report.bucketBefore).toMatchObject({ objects: 3, jurisdictionObjects: 2 });
    expect(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.md'), 'utf8')).toContain('## Läufe dieses Archivs');
  });

  it('sperrt den Sync bei fehlendem Rohpaket, bevor ein Transport entsteht', async () => {
    const f = await fixture({ skipCache: ['BayTestG'] });
    let created = false;
    const io = { print: (): void => undefined, error: (): void => undefined };
    const code = await runR2Sync({ write: true, json: false, transport: 'wrangler-api' }, f.root, io, { createTransport: () => { created = true; return createMemoryR2Transport(); } });
    expect(code).toBe(1);
    expect(created).toBe(false);
    const report = JSON.parse(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.json'), 'utf8')) as Record<string, any>;
    expect(report.status).toBe('blocked');
    expect(report.sync).toBeNull();
  });

  it('hält die Remotephase an, wenn die Anmeldung interaktiv erneuert werden muss', async () => {
    const f = await fixture();
    const memory = createMemoryR2Transport();
    const expired: R2Transport = { ...withoutList(memory), name: 'wrangler-api', list: async () => { throw new WranglerAuthError('expired', 'Wrangler-Anmeldung abgelaufen – npx wrangler login'); } };
    const errors: string[] = [];
    const code = await runR2Sync({ write: true, json: false, transport: 'wrangler-api', concurrency: 32, verify: 'etag' }, f.root, { print: () => undefined, error: (line) => errors.push(line) }, { createTransport: () => expired });
    expect(code).toBe(2);
    expect(memory.calls.filter((call) => call.startsWith('put '))).toEqual([]);
    const report = JSON.parse(await readFile(join(f.root, 'data', 'audits', 'bayernrecht', 'R2_AUDIT.json'), 'utf8')) as Record<string, any>;
    expect(report.status).toBe('halted');
    expect(report.halt.resumeCommand).toContain('npx wrangler login');
    expect(report.halt.resumeCommand).toContain('npm run import:bayernrecht:r2-sync -- --write --r2-transport wrangler-api --concurrency 32 --verify etag');
    // Das Staging ist geschrieben, der Status bleibt staged – der nächste Lauf setzt fort.
    for (const entry of (await readManifest(f.root)).entries.filter((candidate) => candidate.importStatus !== 'needs-review')) expect(entry.rawDocuments[0]!.archiveStatus).toBe('staged');
  });
});

describe('Abbildungs-Assets (Rolle figure)', () => {
  const url = 'https://www.gesetze-bayern.de/Content/Zip/BayBildV';
  const image = gifBytes(40, 30, 'Übersichtskarte');
  const zip = buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'img/Karte.gif', content: image },
  ]);

  async function figureFixture(options: { tamperPackage?: boolean } = {}): Promise<Fixture & { key: string }> {
    const root = await tempRoot('landesrecht-bayernrecht-r2-figure-');
    const cacheDir = join(root, '.cache', 'bayernrecht');
    const stagingDir = join(root, '.cache', 'bayernrecht-r2-staging');
    const paths = cacheEntryPaths(cacheDir, url);
    await mkdir(cacheDir, { recursive: true });
    const cachedZip = options.tamperPackage ? buildZipArchive([{ path: 'mimetype', content: 'bayportalnorm+zip' }, { path: 'img/Karte.gif', content: image }, { path: 'x', content: 'y' }]) : zip;
    await writeFile(paths.bytes, cachedZip);
    await writeFile(paths.metadata, JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'application/zip', retrievedAt: '2026-09-18T00:27:16.668Z', sha256: sha256(cachedZip), byteLength: cachedZip.byteLength }));
    await writeManifestEntry(root, sampleManifestEntry({
      sourceIdentity: 'BayBildV', sourceArea: 'landesrecht', importStatus: 'imported', targetSlug: 'baybildv-baywue',
      sourceUrl: 'https://www.gesetze-bayern.de/Content/Document/BayBildV', sha256: sha256(zip), contentType: 'application/zip',
      rawDocuments: [
        { role: 'text-document', url, finalUrl: url, sha256: sha256(zip), contentType: 'application/zip', retrievedAt: '2026-09-18T00:27:16.668Z', byteLength: zip.byteLength },
        { role: 'figure', url, finalUrl: url, sha256: sha256(image), contentType: 'image/gif', retrievedAt: '2026-09-18T00:27:16.668Z', byteLength: image.byteLength, packagePath: 'img/Karte.gif', packageSha256: sha256(zip) },
      ],
    }));
    return { root, cacheDir, stagingDir, bytes: new Map(), key: `${KEY_PREFIX}assets/${sha256(image)}.gif` };
  }

  it('bildet inhaltsadressierte Schlüssel, die der Worker genau so liest', () => {
    const sha = sha256(image);
    const key = r2ObjectKey({ sourceArea: 'landesrecht', sourceIdentity: 'BayBildV', sha256: sha, role: 'figure', contentType: 'image/gif' });
    expect(key).toBe(`baywue/bayernrecht/2023-12-01/assets/${sha}.gif`);
    expect(key).toBe(normAssetObjectKey('baywue', sha, 'gif'));
    // Unabhängig von Norm und Bereich: dieselbe Datei hat denselben Schlüssel.
    expect(r2ObjectKey({ sourceArea: 'vwv', sourceIdentity: 'BayAndereV', sha256: sha, role: 'figure', contentType: 'image/gif' })).toBe(key);
    expect(() => r2ObjectKey({ sourceArea: 'landesrecht', sourceIdentity: 'BayBildV', sha256: sha, role: 'figure', contentType: 'image/jpg' })).toThrow(ArchiveError);
  });

  it('entnimmt die Bilddatei dem gebundenen Paket, stagt, synchronisiert – und der Worker liefert sie aus', async () => {
    const f = await figureFixture();
    const manifest = await readManifest(f.root);
    const result = await stageRawSources({ root: f.root, manifest, cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
    expect(result).toMatchObject({ candidates: 2, written: 2, problems: [] });
    expect(sha256(new Uint8Array(await readFile(join(f.stagingDir, f.key))))).toBe(sha256(image));
    const envelope = JSON.parse(await readFile(join(f.stagingDir, envelopeKey(f.key)), 'utf8')) as Record<string, unknown>;
    expect(envelope).toMatchObject({ objectKey: f.key, contentType: 'image/gif', role: 'figure', url, packagePath: 'img/Karte.gif', packageSha256: sha256(zip), sourceIdentity: 'BayBildV' });

    const memory = createMemoryR2Transport();
    const synced = await syncArchive({ root: f.root, manifest: await readManifest(f.root), transport: memory, stagingDir: f.stagingDir, verification: 'etag', sampleRate: 1 });
    expect(synced).toMatchObject({ blocked: false, uploaded: 2, verified: 2 });
    expect(memory.objects.get(f.key)!.contentType).toBe('image/gif');
    expect((await readManifestEntry(f.root, 'landesrecht', 'BayBildV'))!.rawDocuments.map((raw) => raw.archiveStatus)).toEqual(['verified', 'verified']);

    const bucket = { get: async (key: string) => (memory.objects.has(key) ? { arrayBuffer: async () => memory.objects.get(key)!.bytes.slice().buffer } : null) };
    const response = await serveNormAsset({ jurisdiction: 'bayern-wuerttemberg', file: `${sha256(image)}.gif` }, bucket);
    expect(response.status).toBe(200);
    expect(sha256(new Uint8Array(await response.arrayBuffer()))).toBe(sha256(image));
  });

  it('entnimmt nichts aus einem Paket, das nicht den gebundenen SHA-256 trägt', async () => {
    const f = await figureFixture({ tamperPackage: true });
    const result = await stageRawSources({ root: f.root, manifest: await readManifest(f.root), cacheDir: f.cacheDir, stagingDir: f.stagingDir, write: true });
    expect(result.problems.map((problem) => `${problem.code}:${problem.objectKey}`)).toEqual(expect.arrayContaining([`cache-mismatch:${f.key}`]));
    await expect(readFile(join(f.stagingDir, f.key))).rejects.toThrow();
  });
});
