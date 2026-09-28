/**
 * Sim-Quellenarchiv in R2 – ohne Netz, mit Speichertransport und temporären Wurzeln:
 *   - Schlüssel `<jurisdiction>/simulation/<sha256>.<ext>` sind inhaltsadressiert; alles außerhalb ist ein Fehler,
 *     bevor ein Transport es sieht (Präfixschutz, kein Löschweg).
 *   - Staging legt genau die Cachekopie ab (SHA-256 nachgerechnet), daneben den Umschlag, und führt das Manifest;
 *     nichts wird überschrieben, ein abweichender Inhalt ist ein Konflikt.
 *   - Sync (readback und etag) lädt hoch, prüft nach, setzt `verified` und stuft nie zurück.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createMemoryR2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { parseCliArguments } from '@landesrecht/importer-simulation/cli.ts';
import { archiveExtension, ArchiveError, assertArchiveKey, envelopeCoreProblems, envelopeFor, envelopeKey, guardTransport, isArchiveKey, objectKeyForSource, objectMetadata, parseArchiveKey, r2ObjectKey } from '@landesrecht/importer-simulation/r2/archive.ts';
import { R2_REPORT_JSON_PATH, R2_REPORT_MD_PATH, runR2Sync, writeR2Report } from '@landesrecht/importer-simulation/r2/command.ts';
import { parseArchiveManifest, R2_ARCHIVE_MANIFEST_PATH, readArchiveManifest } from '@landesrecht/importer-simulation/r2/manifest.ts';
import { assertStagingDir, DEFAULT_STAGING_DIR, stageSources, summarizeManifest, syncStaged } from '@landesrecht/importer-simulation/r2/sync.ts';
import { INVENTORY_PATH } from '@landesrecht/importer-simulation/common/paths.ts';
import type { InventorySource, SourceInventory } from '@landesrecht/importer-simulation/inventory/scan.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

function source(path: string, bytes: Uint8Array, jurisdiction: InventorySource['jurisdictionCandidate'], mediaType = 'application/pdf'): InventorySource {
  return {
    sha256: sha256(bytes),
    paths: [path],
    fileName: path.split('/').pop()!,
    jurisdictionCandidate: jurisdiction,
    mediaType,
    byteLength: bytes.byteLength,
    pageCount: 2,
    textLayer: 'text',
    extraction: { tool: 'test', textPath: '', layoutPath: '' },
    detected: { dates: [], documentType: 'gazette', signals: [], references: [], repealMentions: [] },
  };
}

async function fixture(): Promise<{ root: string; inventory: SourceInventory; bytes: Map<string, Uint8Array> }> {
  const root = await tempRoot('landesrecht-simulation-r2-');
  const bytes = new Map<string, Uint8Array>([
    ['west/GV-West-2026-2.pdf', new TextEncoder().encode('%PDF-1.4 GV. West 2026 Nr. 2 '.repeat(30))],
    ['baywü/GVBl-Süd-2024-1.pdf', new TextEncoder().encode('%PDF-1.4 GVBl. Süd 2024 Nr. 1 '.repeat(30))],
    ['nsh/Mitteilung.txt', new TextEncoder().encode('Verkündungsmitteilung NSH\n')],
  ]);
  const sources = [
    source('west/GV-West-2026-2.pdf', bytes.get('west/GV-West-2026-2.pdf')!, 'west'),
    source('baywü/GVBl-Süd-2024-1.pdf', bytes.get('baywü/GVBl-Süd-2024-1.pdf')!, 'baywue'),
    source('nsh/Mitteilung.txt', bytes.get('nsh/Mitteilung.txt')!, 'nsh', 'text/plain'),
  ];
  const archive = join(root, '.cache', 'simulation', 'archive');
  await mkdir(archive, { recursive: true });
  for (const entry of sources) await writeFile(join(archive, `${entry.sha256}.${archiveExtension(entry)}`), bytes.get(entry.paths[0]!)!);
  const inventory: SourceInventory = {
    schemaVersion: 'landesrecht-simulation-source-inventory/1',
    archiveDir: 'imports',
    scannedAt: '2026-09-28',
    tools: {},
    totals: { files: 3, sources: 3, duplicateFiles: 0, byJurisdiction: { baywue: 1, nsh: 1, west: 1 }, byMediaType: {}, byTextLayer: {}, byDocumentType: {} },
    container: { file: 'imports/Archiv.zip', present: false },
    sources,
  };
  await mkdir(join(root, 'data', 'simulation'), { recursive: true });
  await writeFile(join(root, INVENTORY_PATH), `${JSON.stringify(inventory, null, 2)}\n`);
  return { root, inventory, bytes };
}

const io = () => {
  const lines: string[] = [];
  return { lines, io: { print: (line: string) => lines.push(line), error: (line: string) => lines.push(`! ${line}`) } };
};

describe('Objektschlüssel und Präfixschutz', () => {
  const hash = 'a'.repeat(64);

  it('bildet inhaltsadressierte Schlüssel unter <jurisdiction>/simulation/ und lehnt alles andere ab', () => {
    expect(r2ObjectKey({ jurisdiction: 'west', sha256: hash, extension: 'pdf' })).toBe(`west/simulation/${hash}.pdf`);
    expect(objectKeyForSource({ sha256: hash, paths: ['baywü/GVBl. 03_26 (1).PDF'], jurisdictionCandidate: 'baywue' })).toBe(`baywue/simulation/${hash}.pdf`);
    expect(archiveExtension({ paths: ['west/Datei'] })).toBe('bin');
    expect(archiveExtension({ paths: ['west/Datei.DOCX'] })).toBe('docx');
    expect(envelopeKey(`nsh/simulation/${hash}.txt`)).toBe(`nsh/simulation/${hash}.txt.envelope.json`);
    expect(parseArchiveKey(`nsh/simulation/${hash}.txt.envelope.json`)).toEqual({ jurisdiction: 'nsh', sha256: hash, extension: 'txt', envelope: true });
    for (const bad of ['west/recht-nrw/2023-12-01/term-1/abc-version-page.html', `sachsen/simulation/${hash}.pdf`, `west/simulation/${hash.slice(0, 40)}.pdf`, `west/simulation/../${hash}.pdf`, `west/simulation/${hash}`]) {
      expect(isArchiveKey(bad), bad).toBe(false);
      expect(() => assertArchiveKey(bad)).toThrow(ArchiveError);
    }
    expect(() => r2ObjectKey({ jurisdiction: 'west', sha256: 'kein-hash', extension: 'pdf' })).toThrow(/SHA-256/u);
    expect(() => r2ObjectKey({ jurisdiction: 'west', sha256: hash, extension: 'p/df' })).toThrow(/Endung/u);
  });

  it('der Transportwächter lässt nur Sim-Schlüssel und Jurisdiktionspräfixe durch und verlangt den Quellen-Bucket', async () => {
    const inner = createMemoryR2Transport({ bucket: 'landesrecht-quellen' });
    const guarded = guardTransport(inner);
    await guarded.put(`west/simulation/${hash}.pdf`, new Uint8Array([1]), { contentType: 'application/pdf', metadata: {} });
    expect(await guarded.head(`west/simulation/${hash}.pdf`)).toMatchObject({ size: 1 });
    await expect(guarded.head('west/recht-nrw/2023-12-01/term-1/x-version-page.html')).rejects.toThrow(/außerhalb/u);
    await expect(guarded.get(`ost/other/${hash}.pdf`)).rejects.toThrow(ArchiveError);
    await expect(guarded.put('west/', new Uint8Array(), { contentType: 'text/plain', metadata: {} })).rejects.toThrow(ArchiveError);
    expect((await guarded.list!('west/simulation/')).map((object) => object.key)).toEqual([`west/simulation/${hash}.pdf`]);
    await expect(guarded.list!('west/')).rejects.toThrow(/außerhalb/u);
    await expect(guarded.list!('west/recht-nrw/')).rejects.toThrow(ArchiveError);
    expect(inner.calls.filter((call) => call.includes('recht-nrw'))).toEqual([]);
    expect(() => guardTransport(createMemoryR2Transport({ bucket: 'landesrecht-quellen-staging' }))).toThrow(/Bucket/u);
    expect('delete' in guarded).toBe(false);
  });

  it('der Umschlag trägt Originaldateinamen, SHA-256, Größe, Medienart, Kandidat und Inventar-Zeitpunkt', () => {
    const bytes = new TextEncoder().encode('inhalt');
    const entry = { ...source('baywü/BayWü GVBl. 03_26 (1).pdf', bytes, 'baywue'), paths: ['baywü/BayWü GVBl. 03_26 (1).pdf', 'baywü/Kopie/BayWü GVBl. 03_26 (1).pdf'] };
    const key = objectKeyForSource(entry);
    const envelope = envelopeFor(entry, { scannedAt: '2026-09-28' }, key);
    expect(envelope).toMatchObject({ schemaVersion: 'simulation-r2-envelope/1', bucket: 'landesrecht-quellen', objectKey: key, sha256: sha256(bytes), byteLength: bytes.byteLength, contentType: 'application/pdf', fileNames: ['BayWü GVBl. 03_26 (1).pdf'], archivePaths: entry.paths, jurisdictionCandidate: 'baywue', inventoriedAt: '2026-09-28', sourceSystem: 'simulation', pageCount: 2 });
    for (const value of Object.values(objectMetadata(envelope))) expect(/^[\x20-\x7e]*$/u.test(value), value).toBe(true);
    expect(envelopeCoreProblems({ ...envelope, fileNames: ['anders.pdf'] }, envelope)).toEqual([]);
    expect(envelopeCoreProblems({ ...envelope, sha256: 'b'.repeat(64) }, envelope)).toHaveLength(1);
    expect(() => envelopeFor(entry, { scannedAt: '2026-09-28' }, `west/simulation/${entry.sha256}.pdf`)).toThrow(/Jurisdiktionskandidat/u);
    expect(() => assertStagingDir('/repo', 'data/staging')).toThrow(/versionierten/u);
    expect(assertStagingDir('/repo', DEFAULT_STAGING_DIR)).toBe(`/repo/${DEFAULT_STAGING_DIR}`);
  });
});

describe('Staging aus dem Cache', () => {
  it('stagt nur mit --stage-only, nachgerechnet, mit Umschlag und Manifest; wiederholbar ohne Änderung', async () => {
    const { root, inventory, bytes } = await fixture();
    const manifest = await readArchiveManifest(root);
    const dry = await stageSources({ root, inventory, manifest, write: false });
    expect(dry).toMatchObject({ sources: 3, staged: 3, alreadyStaged: 0, alreadyArchived: 0, missingCache: [], conflicts: [], byJurisdiction: { baywue: 1, nsh: 1, west: 1 } });
    await expect(stat(join(root, DEFAULT_STAGING_DIR))).rejects.toThrow();
    await expect(stat(join(root, R2_ARCHIVE_MANIFEST_PATH))).rejects.toThrow();

    const written = await stageSources({ root, inventory, manifest, write: true });
    expect(written.staged).toBe(3);
    const west = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'west')!;
    const key = objectKeyForSource(west);
    expect(new Uint8Array(await readFile(join(root, DEFAULT_STAGING_DIR, key)))).toEqual(bytes.get('west/GV-West-2026-2.pdf'));
    const envelope = JSON.parse(await readFile(join(root, DEFAULT_STAGING_DIR, envelopeKey(key)), 'utf8')) as Record<string, unknown>;
    expect(envelope).toMatchObject({ objectKey: key, sha256: west.sha256, fileNames: ['GV-West-2026-2.pdf'], jurisdictionCandidate: 'west', inventoriedAt: '2026-09-28' });
    const stored = parseArchiveManifest(JSON.parse(await readFile(join(root, R2_ARCHIVE_MANIFEST_PATH), 'utf8')));
    expect(stored.objects.map((object) => [object.objectKey, object.status])).toEqual([...inventory.sources].map(objectKeyForSource).sort().map((objectKey) => [objectKey, 'staged']));
    expect(stored.objects.find((object) => object.jurisdiction === 'nsh')).toMatchObject({ mediaType: 'text/plain', fileNames: ['Mitteilung.txt'] });

    const again = await stageSources({ root, inventory, manifest: await readArchiveManifest(root), write: true });
    expect(again).toMatchObject({ staged: 0, alreadyStaged: 3, conflicts: [] });
  });

  it('meldet fehlende Cachekopien und überschreibt nie eine abweichende Staging-Datei', async () => {
    const { root, inventory } = await fixture();
    const nsh = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'nsh')!;
    const { rm } = await import('node:fs/promises');
    await rm(join(root, '.cache', 'simulation', 'archive', `${nsh.sha256}.txt`));
    const west = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'west')!;
    const target = join(root, DEFAULT_STAGING_DIR, objectKeyForSource(west));
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, 'fremder Inhalt');
    const manifest = await readArchiveManifest(root);
    const result = await stageSources({ root, inventory, manifest, write: true });
    expect(result.missingCache).toHaveLength(1);
    expect(result.missingCache[0]).toContain('nsh/Mitteilung.txt');
    expect(result.conflicts).toEqual([`${objectKeyForSource(west)}: Staging-Datei mit anderem Inhalt vorhanden (wird nicht überschrieben)`]);
    expect(await readFile(target, 'utf8')).toBe('fremder Inhalt');
    expect(manifest.objects.map((object) => object.jurisdiction)).toEqual(['baywue']);
    const { lines, io: fakeIo } = io();
    expect(await runR2Sync({ write: false, stageOnly: true }, root, fakeIo)).toBe(1);
    expect(lines.some((line) => line.includes('Staging mit Befunden'))).toBe(true);
  });
});

describe('Sync nach R2 (Speichertransport)', () => {
  it('readback: lädt Objekt und Umschlag hoch, liest zurück, setzt verified und ist wiederholbar', async () => {
    const { root, inventory, bytes } = await fixture();
    const manifest = await readArchiveManifest(root);
    await stageSources({ root, inventory, manifest, write: true });
    const transport = guardTransport(createMemoryR2Transport({ bucket: 'landesrecht-quellen' }));
    const now = () => new Date('2026-09-28T10:00:00.000Z');
    const sync = await syncStaged({ root, manifest, transport, verification: 'readback', concurrency: 2, now });
    expect(sync).toMatchObject({ pending: 3, uploaded: 3, alreadyPresent: 0, verified: 3, missingStaging: [], verification: 'readback' });
    const west = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'west')!;
    const key = objectKeyForSource(west);
    expect(await transport.get(key)).toEqual(bytes.get('west/GV-West-2026-2.pdf'));
    expect(await transport.head(key)).toMatchObject({ size: west.byteLength, sha256: west.sha256, contentType: 'application/pdf' });
    expect(await transport.head(envelopeKey(key))).toMatchObject({ contentType: 'application/json' });
    const stored = await readArchiveManifest(root);
    expect(stored.objects.every((object) => object.status === 'verified' && object.verification === 'readback' && object.verifiedAt === '2026-09-28T10:00:00.000Z')).toBe(true);
    expect(summarizeManifest(stored)).toEqual({ baywue: { staged: 0, verified: 1 }, nsh: { staged: 0, verified: 1 }, west: { staged: 0, verified: 1 } });
    // Zweiter Lauf: nichts offen; erneutes Staging stuft nichts zurück.
    expect(await syncStaged({ root, manifest: stored, transport, verification: 'readback' })).toMatchObject({ pending: 0, uploaded: 0, verified: 0 });
    const restaged = await stageSources({ root, inventory, manifest: stored, write: true });
    expect(restaged.alreadyArchived).toBe(3);
    expect((await readArchiveManifest(root)).objects.every((object) => object.status === 'verified')).toBe(true);
  });

  it('etag: prüft über das Listing je Jurisdiktionspräfix nach und lässt vorhandene Objekte stehen', async () => {
    const { root, inventory, bytes } = await fixture();
    const manifest = await readArchiveManifest(root);
    await stageSources({ root, inventory, manifest, write: true });
    const inner = createMemoryR2Transport({ bucket: 'landesrecht-quellen' });
    const west = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'west')!;
    await inner.put(objectKeyForSource(west), bytes.get('west/GV-West-2026-2.pdf')!, { contentType: 'application/pdf', metadata: { sha256: west.sha256 } });
    const transport = guardTransport(inner);
    const sync = await syncStaged({ root, manifest, transport, verification: 'etag', concurrency: 4 });
    expect(sync).toMatchObject({ pending: 3, uploaded: 2, alreadyPresent: 1, verified: 3, verification: 'etag' });
    expect(inner.calls.filter((call) => call.startsWith('list ')).sort()).toEqual(['list baywue/simulation/', 'list baywue/simulation/', 'list nsh/simulation/', 'list nsh/simulation/', 'list west/simulation/', 'list west/simulation/']);
    expect(inner.calls.filter((call) => call.startsWith('get '))).toEqual([]);
    const listed = await transport.list!('west/simulation/');
    expect(listed.find((object) => object.key === objectKeyForSource(west))?.md5).toBe(md5(bytes.get('west/GV-West-2026-2.pdf')!));
    expect((await readArchiveManifest(root)).objects.every((object) => object.status === 'verified' && object.verification === 'etag')).toBe(true);
  });

  it('überschreibt nie: ein vorhandener Schlüssel mit anderem Inhalt ist ein Konflikt, in beiden Prüfregimen', async () => {
    const { root, inventory } = await fixture();
    const manifest = await readArchiveManifest(root);
    await stageSources({ root, inventory, manifest, write: true });
    const west = inventory.sources.find((entry) => entry.jurisdictionCandidate === 'west')!;
    const inner = createMemoryR2Transport({ bucket: 'landesrecht-quellen' });
    const foreignBytes = new TextEncoder().encode('anderer Inhalt');
    await inner.put(objectKeyForSource(west), foreignBytes, { contentType: 'application/pdf', metadata: { sha256: sha256(foreignBytes) } });
    const transport = guardTransport(inner);
    await expect(syncStaged({ root, manifest, transport, verification: 'readback', concurrency: 1 })).rejects.toThrow(/nie überschrieben/u);
    await expect(syncStaged({ root, manifest, transport, verification: 'etag' })).rejects.toThrow(/nie überschrieben/u);
    expect(await inner.get(objectKeyForSource(west))).toEqual(foreignBytes);
    expect(manifest.objects.find((object) => object.jurisdiction === 'west')!.status).toBe('staged');
    await expect(syncStaged({ root, manifest, transport: guardTransport({ name: 'ohne-listing', bucket: 'landesrecht-quellen', head: async () => null, get: async () => null, put: async () => undefined }), verification: 'etag' })).rejects.toThrow(/Listing/u);
  });
});

describe('Befehl r2-sync und Bericht', () => {
  it('Dry-run schreibt nichts; --stage-only schreibt Staging, Manifest und Bericht; --write nutzt den Transport', async () => {
    const { root } = await fixture();
    const dry = io();
    expect(await runR2Sync({ write: false, stageOnly: false }, root, dry.io)).toBe(0);
    expect(dry.lines.at(-1)).toContain('Dry-run');
    await expect(stat(join(root, R2_ARCHIVE_MANIFEST_PATH))).rejects.toThrow();

    const staged = io();
    expect(await runR2Sync({ write: false, stageOnly: true }, root, staged.io)).toBe(0);
    expect(staged.lines.at(-1)).toContain('Gestagt (kein Netz)');
    const report = JSON.parse(await readFile(join(root, R2_REPORT_JSON_PATH), 'utf8')) as Record<string, unknown>;
    expect(report).toMatchObject({ mode: 'stage-only', bucket: 'landesrecht-quellen', prefix: '<jurisdiction>/simulation/', objects: { total: 3, staged: 3, verified: 0 } });
    expect(await readFile(join(root, R2_REPORT_MD_PATH), 'utf8')).toContain('| Upload | nicht ausgeführt (kein Netz) |');

    const transport = createMemoryR2Transport({ bucket: 'landesrecht-quellen' });
    const written = io();
    expect(await runR2Sync({ write: true, stageOnly: false, verify: 'etag', concurrency: 2 }, root, written.io, () => transport)).toBe(0);
    expect(written.lines.at(-1)).toMatch(/hochgeladen 3/u);
    expect((await readArchiveManifest(root)).objects.every((object) => object.status === 'verified')).toBe(true);
    expect(transport.objects.size).toBe(6);
    for (const key of transport.objects.keys()) expect(isArchiveKey(key), key).toBe(true);
    const done = JSON.parse(await readFile(join(root, R2_REPORT_JSON_PATH), 'utf8')) as { objects: { verified: number }; sync: { verification: string } };
    expect(done.objects.verified).toBe(3);
    expect(done.sync.verification).toBe('etag');
  });

  it('ohne Inventar gibt es nichts zu archivieren; der Bericht ist auch ohne Sync schreibbar', async () => {
    const root = await tempRoot('landesrecht-simulation-r2-leer-');
    await expect(runR2Sync({ write: false, stageOnly: false }, root, io().io)).rejects.toThrow(/source-inventory\.json fehlt/u);
    const manifest = { schemaVersion: 'landesrecht-simulation-r2-archive/1' as const, bucket: 'landesrecht-quellen', objects: [] };
    const written = await writeR2Report(root, { mode: 'dry-run', stage: { sources: 0, bytes: 0, staged: 0, alreadyStaged: 0, alreadyArchived: 0, missingCache: [], conflicts: [], byJurisdiction: {} }, manifest, now: () => new Date('2026-09-28T00:00:00.000Z') });
    expect(written).toEqual([R2_REPORT_JSON_PATH, R2_REPORT_MD_PATH]);
    expect(() => parseArchiveManifest({ ...manifest, bucket: 'fremd' })).toThrow(/bucket/u);
    expect(() => parseArchiveManifest({ ...manifest, objects: [{ sha256: 'a'.repeat(64), jurisdiction: 'west', objectKey: 'west/recht-nrw/x.pdf', envelopeKey: 'west/recht-nrw/x.pdf.envelope.json', byteLength: 1, mediaType: 'application/pdf', fileNames: [], status: 'staged' }] })).toThrow(/außerhalb/u);
  });

  it('die CLI kennt r2-sync und completeness mit ihren Optionen', () => {
    expect(parseCliArguments(['r2-sync', '--stage-only', '--verify', 'etag', '--concurrency', '8', '--limit', '2', '--r2-transport', 'wrangler-api', '--staging-dir', '.cache/x'])).toMatchObject({ command: 'r2-sync', stageOnly: true, verify: 'etag', concurrency: 8, limit: 2, r2Transport: 'wrangler-api', stagingDir: '.cache/x', write: false });
    expect(parseCliArguments(['completeness', '--write', '--jurisdiction', 'west'])).toMatchObject({ command: 'completeness', write: true, jurisdiction: 'west' });
    expect(() => parseCliArguments(['r2-sync', '--write', '--stage-only'])).toThrow(/schließen sich aus/u);
    expect(() => parseCliArguments(['r2-sync', '--verify', 'md5'])).toThrow(/readback\|etag/u);
    expect(() => parseCliArguments(['r2-sync', '--concurrency', '0'])).toThrow(/positive/u);
    expect(() => parseCliArguments(['r2-sync', '--r2-transport', 's3'])).toThrow(/wrangler\|wrangler-api/u);
    expect(() => parseCliArguments(['completeness', '--jurisdiction', 'sachsen'])).toThrow(/Jurisdiktion/u);
  });
});
