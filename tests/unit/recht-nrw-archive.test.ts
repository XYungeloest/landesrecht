/**
 * R2-Quellenarchiv des RECHT.NRW-Imports ohne Netz: Objektschlüssel und Archivrollen, unveränderlicher
 * Upload mit Rückleseprüfung (Speicher-Transport), Staging mit späterem r2-sync, Schutzprüfung des
 * Bulkmodus, Quellenreferenzen sowie AWS-Signatur V4 und Zugangsdaten aus der Umgebung.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ARCHIVE_ROLES, ArchiveError, archiveRoleFor, assertArchiveAllowed, createR2Archive, createVersionedSampleArchive, DEFAULT_R2_STAGING_DIR, envelopeKey, extensionFor, R2_SOURCES_BUCKET, r2ObjectKey, syncStagedObjects, type ArchivedObject } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import type { FetchedDocument } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { MANIFEST_SCHEMA, RAW_DOCUMENT_ROLES, readManifestEntry, type ImportManifest, type ManifestEntry, type ManifestRawDocument } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { createMemoryR2Transport, createS3R2Transport, encodeS3PathSegment, missingR2Environment, R2TransportError, s3R2TransportFromEnv, signAwsV4 } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { parseSourceReference, type SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

const repoRoot = process.cwd();
const LHUNDG_PAGE = join(repoRoot, 'sources', 'recht-nrw', 'term-23528', '1febb67789d814c3-version-page.html');
const LHUNDG_URL = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landeshundegesetz-vv-lhundg-nrw';
const LHUNDG_KEY = 'west/recht-nrw/2023-12-01/term-23528/1febb67789d814c3-version-page.html';
const RETRIEVED_AT = '2026-09-15T10:00:00.000Z';
const HTML = 'text/html; charset=UTF-8';
const META = { termId: '23528', sourceArea: 'lrmb', role: 'version-page' } as const;
const EMPTY_PAYLOAD = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function fetched(bytes: Uint8Array, url = LHUNDG_URL, contentType = HTML): FetchedDocument {
  return { url, finalUrl: url, status: 200, contentType, retrievedAt: RETRIEVED_AT, sha256: sha256(bytes), bytes, fromCache: false, headers: { etag: '"vv-lhundg"' } };
}

async function lhundgDocument(): Promise<FetchedDocument> {
  return fetched(new Uint8Array(await readFile(LHUNDG_PAGE)));
}

const temporary: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function caught(action: () => unknown): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Fehler erwartet, aber keiner aufgetreten');
}

async function archiveError(action: () => unknown): Promise<ArchiveError> {
  const error = await caught(action);
  expect(error).toBeInstanceOf(ArchiveError);
  return error as ArchiveError;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function rawDocumentOf(object: ArchivedObject): ManifestRawDocument {
  return { role: object.role, url: object.url, finalUrl: object.finalUrl, sha256: object.sha256, contentType: object.contentType, retrievedAt: object.retrievedAt, byteLength: object.byteLength, ...(object.bucket ? { bucket: object.bucket } : {}), ...(object.objectKey ? { objectKey: object.objectKey } : {}), archiveStatus: 'staged' };
}

function manifestWith(raw: ManifestRawDocument): ImportManifest {
  const entry: ManifestEntry = {
    sourceSystem: 'recht-nrw',
    sourceArea: 'lrmb',
    sourceDocumentType: 'verwaltungsvorschrift',
    sourceIdentity: 'term:23528',
    sourceTitle: 'Verwaltungsvorschriften zum Landeshundegesetz (VV LHundG NRW)',
    sourceType: 'verwaltungsvorschrift',
    sourceUrl: LHUNDG_URL,
    stemUrl: 'https://recht.nrw.de/taxonomy/term/23528',
    sourceVersion: { url: LHUNDG_URL },
    selectedVersionUrl: LHUNDG_URL,
    sourceValidFrom: '2020-07-31',
    sourceValidTo: '2024-07-30',
    baselineStatus: 'active-at-baseline',
    validityEvidence: [],
    retrievedAt: RETRIEVED_AT,
    sha256: raw.sha256,
    contentType: raw.contentType,
    contentFormat: 'native',
    parserVersion: 'recht-nrw-lrmb-parser/1.0.0',
    transformerVersion: 'recht-nrw-transformer/test',
    targetJurisdiction: 'west',
    targetSlug: '',
    baselineDate: '2023-12-01',
    importStatus: 'dry-run',
    reviewStatus: 'none',
    reconstructionStatus: 'not-applicable',
    reconstructionSources: [],
    reconstructionSteps: [],
    archive: { mode: 'r2', bucket: R2_SOURCES_BUCKET },
    importedAt: RETRIEVED_AT,
    rawDocuments: [raw],
    versionsConsidered: [],
    overrides: [],
    findings: [],
    integrity: { fetchParse: true, sourceCanonical: true },
    transformation: { changes: 0, unresolved: 0 },
  };
  return { schemaVersion: MANIFEST_SCHEMA, sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries: [entry] };
}

describe('R2-Objektschlüssel und Archivrollen', () => {
  it('bildet west/recht-nrw/2023-12-01/term-<id>/<SHA-Präfix>-<Rolle>.<ext> aus der archivierten VV-LHundG-Seite', async () => {
    const document = await lhundgDocument();
    expect(document.sha256.slice(0, 16)).toBe('1febb67789d814c3');
    const key = r2ObjectKey({ termId: '23528', sha256: document.sha256, role: archiveRoleFor('version-page'), contentType: HTML });
    expect(key).toBe(LHUNDG_KEY);
    expect(key).toMatch(/^west\/recht-nrw\/2023-12-01\/term-\d+\/[a-f0-9]{16}-[a-z-]+\.(?:html|pdf|json|xml|bin)$/u);
    expect(envelopeKey(key)).toBe(`${LHUNDG_KEY}.envelope.json`);
  });

  it('Dateiendung folgt dem Content-Type; ein anderer Stichtag nur ausdrücklich', () => {
    const hash = sha256('Anhang VV zur LHO');
    expect([extensionFor('application/pdf'), extensionFor('application/json'), extensionFor('text/xml'), extensionFor(HTML), extensionFor('application/octet-stream')]).toEqual(['pdf', 'json', 'xml', 'html', 'bin']);
    expect(r2ObjectKey({ termId: '33532', sha256: hash, role: 'attachment', contentType: 'application/pdf' })).toBe(`west/recht-nrw/2023-12-01/term-33532/${hash.slice(0, 16)}-attachment.pdf`);
    expect(r2ObjectKey({ termId: '33532', sha256: hash, role: 'amendment', contentType: HTML, baselineDate: '2024-01-01' })).toBe(`west/recht-nrw/2024-01-01/term-33532/${hash.slice(0, 16)}-amendment.html`);
  });

  it('verweigert Schlüssel ohne numerische Term-ID oder ohne gültigen SHA-256', () => {
    const hash = sha256('x');
    expect(() => r2ObjectKey({ termId: 'abc', sha256: hash, role: 'version-page', contentType: HTML })).toThrow(/numerische Term-ID/u);
    expect(() => r2ObjectKey({ termId: '../23528', sha256: hash, role: 'version-page', contentType: HTML })).toThrow(/numerische Term-ID/u);
    expect(() => r2ObjectKey({ termId: '23528', sha256: 'abc', role: 'version-page', contentType: HTML })).toThrow(/SHA-256/u);
    expect(() => r2ObjectKey({ termId: '23528', sha256: hash.toUpperCase(), role: 'version-page', contentType: HTML })).toThrow(/SHA-256/u);
  });

  it('ordnet jede Rohdokumentrolle einer Archivrolle zu', () => {
    const mapping = Object.fromEntries(RAW_DOCUMENT_ROLES.map((role) => [role, archiveRoleFor(role)]));
    expect(mapping).toEqual({ 'version-page': 'version-page', 'stem-page': 'version-page', 'legacy-text': 'text-document', annex: 'attachment', pdf: 'attachment', 'gazette-amendment': 'amendment' });
    for (const role of Object.values(mapping)) expect(ARCHIVE_ROLES).toContain(role);
  });
});

describe('R2-Archiv im Sofortmodus (Speicher-Transport)', () => {
  it('lädt hoch, liest zurück, prüft Größe und SHA-256 und legt den Umschlag mit Quell-URL und Abrufzeit ab', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport();
    const archive = createR2Archive({ root, transport, upload: 'immediate' });
    const document = await lhundgDocument();
    const object = archive.locate(document, META);
    expect(object).toMatchObject({ status: 'staged', bucket: R2_SOURCES_BUCKET, objectKey: LHUNDG_KEY, archiveRole: 'version-page', sha256: document.sha256, byteLength: document.bytes.byteLength });

    const stored = await archive.store(document, object);
    expect(stored.status).toBe('verified');
    expect(archive.stats).toEqual({ stored: 1, uploaded: 1, verified: 1, alreadyPresent: 0 });
    expect(transport.calls.slice(0, 3)).toEqual([`head ${LHUNDG_KEY}`, `put ${LHUNDG_KEY}`, `get ${LHUNDG_KEY}`]);

    const uploaded = transport.objects.get(LHUNDG_KEY);
    expect(uploaded && Buffer.from(uploaded.bytes).equals(Buffer.from(document.bytes))).toBe(true);
    expect(uploaded?.metadata).toMatchObject({ sha256: document.sha256, 'source-url': LHUNDG_URL, 'final-url': LHUNDG_URL, 'retrieved-at': RETRIEVED_AT, role: 'version-page', 'term-id': '23528', 'source-area': 'lrmb', 'byte-length': String(document.bytes.byteLength) });

    const envelope = transport.objects.get(envelopeKey(LHUNDG_KEY));
    expect(envelope?.contentType).toBe('application/json');
    expect(JSON.parse(decode(envelope!.bytes))).toMatchObject({ schemaVersion: 'recht-nrw-r2-envelope/1', objectKey: LHUNDG_KEY, bucket: R2_SOURCES_BUCKET, sha256: document.sha256, byteLength: document.bytes.byteLength, contentType: HTML, url: LHUNDG_URL, finalUrl: LHUNDG_URL, retrievedAt: RETRIEVED_AT, role: 'version-page', sourceRole: 'version-page', termId: '23528', sourceArea: 'lrmb', jurisdiction: 'west', baselineDate: '2023-12-01', headers: { etag: '"vv-lhundg"' } });

    const staged = await readFile(join(root, DEFAULT_R2_STAGING_DIR, LHUNDG_KEY));
    expect(sha256(new Uint8Array(staged))).toBe(document.sha256);
  });

  it('gleiche Bytes erneut: bereits vorhanden, kein zweiter Upload', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport();
    const document = await lhundgDocument();
    const first = createR2Archive({ root, transport, upload: 'immediate' });
    await first.store(document, first.locate(document, META));

    const second = createR2Archive({ root, transport, upload: 'immediate' });
    const again = await second.store(document, second.locate(document, META));
    expect(again.status).toBe('verified');
    expect(second.stats).toEqual({ stored: 1, uploaded: 0, verified: 0, alreadyPresent: 1 });
    expect(transport.calls.filter((call) => call === `put ${LHUNDG_KEY}`)).toHaveLength(1);
  });

  it('Objekt ohne SHA-256-Metadaten mit identischem Inhalt gilt nach Rücklesen als bereits vorhanden', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport();
    const document = await lhundgDocument();
    transport.objects.set(LHUNDG_KEY, { bytes: Uint8Array.from(document.bytes), contentType: HTML, metadata: {} });
    const archive = createR2Archive({ root, transport, upload: 'immediate' });
    await archive.store(document, archive.locate(document, META));
    expect(archive.stats).toMatchObject({ uploaded: 0, alreadyPresent: 1 });
    expect(transport.calls).not.toContain(`put ${LHUNDG_KEY}`);
  });

  it('gleicher Schlüssel mit anderem SHA-256 ist ein harter Konflikt – Rohquellen werden nie überschrieben', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const document = await lhundgDocument();
    const foreign = new TextEncoder().encode('<html><h1>Anderes Dokument</h1></html>');

    const withMetadata = createMemoryR2Transport();
    withMetadata.objects.set(LHUNDG_KEY, { bytes: foreign, contentType: HTML, metadata: { sha256: sha256(foreign) } });
    const archive = createR2Archive({ root, transport: withMetadata, upload: 'immediate' });
    const conflict = await archiveError(() => archive.store(document, archive.locate(document, META)));
    expect(conflict.kind).toBe('conflict');
    expect(conflict.message).toContain('nie überschrieben');
    expect(withMetadata.calls).not.toContain(`put ${LHUNDG_KEY}`);
    expect(decode(withMetadata.objects.get(LHUNDG_KEY)!.bytes)).toBe('<html><h1>Anderes Dokument</h1></html>');
    expect(archive.stats).toMatchObject({ uploaded: 0, verified: 0, alreadyPresent: 0 });

    const withoutMetadata = createMemoryR2Transport();
    withoutMetadata.objects.set(LHUNDG_KEY, { bytes: foreign, contentType: HTML, metadata: {} });
    const other = createR2Archive({ root, transport: withoutMetadata, upload: 'immediate' });
    expect((await archiveError(() => other.store(document, other.locate(document, META)))).kind).toBe('conflict');
    expect(withoutMetadata.calls).not.toContain(`put ${LHUNDG_KEY}`);
  });

  it('fehlerhafte Rücklesung nach dem Upload ist ein Prüfungsfehler', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport({ corruptReadback: true });
    const archive = createR2Archive({ root, transport, upload: 'immediate' });
    const document = await lhundgDocument();
    const error = await archiveError(() => archive.store(document, archive.locate(document, META)));
    expect(error.kind).toBe('verification');
    expect(error.message).toContain('Rückleseprüfung');
    expect(archive.stats).toMatchObject({ uploaded: 0, verified: 0 });
  });

  it('Transportausfall beim Upload wird als Transportfehler gemeldet', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport({ failPut: (key) => key === LHUNDG_KEY });
    const archive = createR2Archive({ root, transport, upload: 'immediate' });
    const document = await lhundgDocument();
    const error = await archiveError(() => archive.store(document, archive.locate(document, META)));
    expect(error.kind).toBe('transport');
    expect(error.message).toContain(LHUNDG_KEY);
    expect(error.message).toContain('simulierter Ausfall');
    expect(transport.objects.size).toBe(0);
  });

  it('Bytes, die nicht zum SHA-256 passen, werden vor jedem Transportzugriff abgewiesen', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const transport = createMemoryR2Transport();
    const archive = createR2Archive({ root, transport, upload: 'immediate' });
    const document = await lhundgDocument();
    const object = archive.locate(document, META);
    const tampered: FetchedDocument = { ...document, bytes: new TextEncoder().encode('manipuliert') };
    expect((await archiveError(() => archive.store(tampered, object))).kind).toBe('verification');
    expect(transport.calls).toEqual([]);
  });

  it('Sofort-Upload ohne Transport ist eine Schutzverletzung', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const error = await archiveError(() => createR2Archive({ root, upload: 'immediate' }));
    expect(error.kind).toBe('guard');
  });
});

describe('R2-Archiv verzögert: Staging außerhalb von Git und r2-sync', () => {
  it('stagt Objekt und Umschlag im temporären Staging-Verzeichnis ohne Transportzugriff', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const stagingDir = await tempDir('landesrecht-r2-staging-');
    const transport = createMemoryR2Transport();
    const archive = createR2Archive({ root, stagingDir, transport, upload: 'deferred' });
    const document = await lhundgDocument();
    const object = await archive.store(document, archive.locate(document, META));
    expect(object.status).toBe('staged');
    expect(archive.stats).toEqual({ stored: 1, uploaded: 0, verified: 0, alreadyPresent: 0 });
    expect(transport.calls).toEqual([]);
    expect(sha256(new Uint8Array(await readFile(join(stagingDir, LHUNDG_KEY))))).toBe(document.sha256);
    expect(JSON.parse(await readFile(join(stagingDir, envelopeKey(LHUNDG_KEY)), 'utf8'))).toMatchObject({ objectKey: LHUNDG_KEY, sha256: document.sha256, url: LHUNDG_URL, retrievedAt: RETRIEVED_AT });
    expect(await exists(join(root, DEFAULT_R2_STAGING_DIR))).toBe(false);
  });

  it('r2-sync im Dry-run lädt nichts hoch und schreibt kein Manifest', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const stagingDir = await tempDir('landesrecht-r2-staging-');
    const archive = createR2Archive({ root, stagingDir, upload: 'deferred' });
    const document = await lhundgDocument();
    const manifest = manifestWith(rawDocumentOf(await archive.store(document, archive.locate(document, META))));
    const transport = createMemoryR2Transport();

    const result = await syncStagedObjects({ root, manifest, transport, stagingDir, dryRun: true });
    expect(result).toEqual({ pending: 1, uploaded: 0, alreadyPresent: 0, missingStaging: [] });
    expect(transport.calls).toEqual([]);
    expect(transport.objects.size).toBe(0);
    expect(manifest.entries[0]!.rawDocuments[0]!.archiveStatus).toBe('staged');
    expect(await readManifestEntry(root, 'lrmb', 'term:23528')).toBeUndefined();
  });

  it('r2-sync lädt gestagte Objekte mit Rückleseprüfung hoch und markiert sie als geprüft', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const stagingDir = await tempDir('landesrecht-r2-staging-');
    const archive = createR2Archive({ root, stagingDir, upload: 'deferred' });
    const document = await lhundgDocument();
    const manifest = manifestWith(rawDocumentOf(await archive.store(document, archive.locate(document, META))));
    const transport = createMemoryR2Transport();
    const log: string[] = [];

    const result = await syncStagedObjects({ root, manifest, transport, stagingDir, dryRun: false, log: (line) => log.push(line) });
    expect(result).toEqual({ pending: 1, uploaded: 1, alreadyPresent: 0, missingStaging: [] });
    expect(sha256(transport.objects.get(LHUNDG_KEY)!.bytes)).toBe(document.sha256);
    expect(JSON.parse(decode(transport.objects.get(envelopeKey(LHUNDG_KEY))!.bytes))).toMatchObject({ objectKey: LHUNDG_KEY, termId: '23528', sourceArea: 'lrmb' });
    expect(log).toEqual([`hochgeladen: ${LHUNDG_KEY}`]);
    const written = await readManifestEntry(root, 'lrmb', 'term:23528');
    expect(written?.rawDocuments[0]).toMatchObject({ objectKey: LHUNDG_KEY, archiveStatus: 'verified' });

    const repeat = await syncStagedObjects({ root, manifest, transport, stagingDir, dryRun: false });
    expect(repeat).toEqual({ pending: 0, uploaded: 0, alreadyPresent: 0, missingStaging: [] });
  });

  it('fehlende Staging-Datei wird gemeldet; manipulierte Staging-Datei ist ein Prüfungsfehler', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const stagingDir = await tempDir('landesrecht-r2-staging-');
    const document = await lhundgDocument();
    const located = createR2Archive({ root, stagingDir, upload: 'deferred' }).locate(document, META);
    const transport = createMemoryR2Transport();

    const missing = await syncStagedObjects({ root, manifest: manifestWith(rawDocumentOf(located)), transport, stagingDir, dryRun: false });
    expect(missing).toEqual({ pending: 1, uploaded: 0, alreadyPresent: 0, missingStaging: [LHUNDG_KEY] });
    expect(transport.objects.size).toBe(0);

    const archive = createR2Archive({ root, stagingDir, upload: 'deferred' });
    await archive.store(document, located);
    await writeFile(join(stagingDir, LHUNDG_KEY), 'manipuliert');
    const error = await archiveError(() => syncStagedObjects({ root, manifest: manifestWith(rawDocumentOf(located)), transport, stagingDir, dryRun: false }));
    expect(error.kind).toBe('verification');
    expect(transport.calls).toEqual([]);
  });
});

describe('Schutzprüfung im Bulkmodus: Rohquellen nach R2, nicht nach Git', () => {
  it('versionierter Beispielkorpus ist im Bulkmodus verboten, im Beispielmodus erlaubt', () => {
    const sample = createVersionedSampleArchive(repoRoot);
    expect(() => assertArchiveAllowed(repoRoot, 'sample', sample)).not.toThrow();
    let error: unknown;
    try {
      assertArchiveAllowed(repoRoot, 'bulk', sample);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ArchiveError);
    expect((error as ArchiveError).kind).toBe('guard');
  });

  it('Staging im Repository außerhalb von .cache ist verboten', () => {
    const archive = createR2Archive({ root: repoRoot, upload: 'deferred' });
    for (const stagingDir of ['sources/recht-nrw-r2-staging', 'data/imports/r2-staging', '.', '.cachefremd/staging', join(repoRoot, 'content', 'r2')]) {
      let error: unknown;
      try {
        assertArchiveAllowed(repoRoot, 'bulk', archive, stagingDir);
      } catch (thrown) {
        error = thrown;
      }
      expect(error, stagingDir).toBeInstanceOf(ArchiveError);
      expect((error as ArchiveError).kind, stagingDir).toBe('guard');
    }
  });

  it('.cache/ und Pfade außerhalb des Repositorys (tmp) sind erlaubt', () => {
    const archive = createR2Archive({ root: repoRoot, upload: 'deferred' });
    for (const stagingDir of [DEFAULT_R2_STAGING_DIR, '.cache', join(repoRoot, '.cache', 'r2'), join(tmpdir(), 'landesrecht-r2-staging'), '../landesrecht-r2-staging']) {
      expect(() => assertArchiveAllowed(repoRoot, 'bulk', archive, stagingDir), stagingDir).not.toThrow();
    }
    expect(() => assertArchiveAllowed(repoRoot, 'bulk', archive)).not.toThrow();
  });
});

describe('Quellenreferenz eines R2-archivierten Objekts', () => {
  it('referenceFields liefert r2-archived mit Bucket landesrecht-quellen und Objektschlüssel, ohne sources/recht-nrw-Pfad', async () => {
    const root = await tempDir('landesrecht-r2-root-');
    const archive = createR2Archive({ root, transport: createMemoryR2Transport(), upload: 'immediate' });
    const document = await lhundgDocument();
    const stored = await archive.store(document, archive.locate(document, META));
    expect(archive.referenceFields(stored)).toEqual({ availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: LHUNDG_KEY });

    // Zusammensetzung wie in lrmb/pipeline.ts (Quellenreferenzen der Fassung).
    const reference: SourceReference = { kind: 'official-portal-snapshot', system: 'recht-nrw', label: 'RECHT.NRW-Seite der gewählten Fassung', ...archive.referenceFields(stored), url: document.finalUrl, retrievedAt: document.retrievedAt.slice(0, 10), sha256: document.sha256, externalId: 'term:23528', mediaType: 'text/html' };
    const parsed = parseSourceReference(reference, 'sourceReferences[0]');
    expect(parsed).toMatchObject({ availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: LHUNDG_KEY, sha256: document.sha256, url: LHUNDG_URL, retrievedAt: '2026-09-15' });
    expect(parsed.localSource).toBeUndefined();
    expect(JSON.stringify(reference)).not.toContain('sources/recht-nrw');
    expect(() => parseSourceReference({ ...reference, localSource: 'sources/recht-nrw/term-23528/1febb67789d814c3-version-page.html' }, 'sourceReferences[0]')).toThrow(/localSource/u);
    const { sha256: _withoutHash, ...unhashed } = reference;
    expect(() => parseSourceReference(unhashed, 'sourceReferences[0]')).toThrow(/sha256/u);
  });

  it('der Beispielkorpus verweist dagegen auf die versionierte Datei unter sources/recht-nrw', async () => {
    const root = await tempDir('landesrecht-sample-root-');
    const sample = createVersionedSampleArchive(root);
    const document = await lhundgDocument();
    const object = sample.locate(document, META);
    expect(sample.referenceFields(object)).toEqual({ availability: 'versioned', localSource: relative(repoRoot, LHUNDG_PAGE) });
    expect(object.objectKey).toBeUndefined();
  });
});

describe('R2-Zugang: AWS-Signatur V4 und Zugangsdaten aus der Umgebung', () => {
  it('signiert das offizielle AWS-Beispiel (GET /test.txt, Range bytes=0-9) mit der dokumentierten Signatur', () => {
    const signed = signAwsV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { Range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY_PAYLOAD, 'x-amz-date': '20130524T000000Z' },
      payloadHash: EMPTY_PAYLOAD,
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      amzDate: '20130524T000000Z',
    });
    expect(signed.canonicalRequest).toBe(['GET', '/test.txt', '', 'host:examplebucket.s3.amazonaws.com', 'range:bytes=0-9', `x-amz-content-sha256:${EMPTY_PAYLOAD}`, 'x-amz-date:20130524T000000Z', '', 'host;range;x-amz-content-sha256;x-amz-date', EMPTY_PAYLOAD].join('\n'));
    expect(signed.stringToSign).toBe(['AWS4-HMAC-SHA256', '20130524T000000Z', '20130524/us-east-1/s3/aws4_request', '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972'].join('\n'));
    expect(signed.signedHeaders).toBe('host;range;x-amz-content-sha256;x-amz-date');
    expect(signed.signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    expect(signed.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  it('kodiert R2-Pfadsegmente nach RFC 3986', () => {
    expect(encodeS3PathSegment('term-23528')).toBe('term-23528');
    expect(encodeS3PathSegment('1febb67789d814c3-version-page.html')).toBe('1febb67789d814c3-version-page.html');
    expect(encodeS3PathSegment('~._-')).toBe('~._-');
    expect(encodeS3PathSegment('Anlage zu § 23.pdf')).toBe('Anlage%20zu%20%C2%A7%2023.pdf');
    expect(encodeS3PathSegment("!'()*")).toBe('%21%27%28%29%2A');
    expect(encodeS3PathSegment('a/b')).toBe('a%2Fb');
  });

  it('S3-Transport signiert Anfragen über ein injiziertes fetch (ohne Netz)', async () => {
    const requests: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const responses = [new Response(null, { status: 404 }), new Response(null, { status: 200 }), new Response('Rohquelle', { status: 200 }), new Response('Fehler', { status: 500 })];
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), method: init?.method ?? 'GET', headers: { ...(init?.headers as Record<string, string>) } });
      const next = responses.shift();
      if (!next) throw new Error('unerwartete Anfrage');
      return next;
    }) as typeof fetch;
    const transport = createS3R2Transport({ accountId: 'account123', accessKeyId: 'AKIDTEST', secretAccessKey: 'geheimer-schluessel', bucket: R2_SOURCES_BUCKET, fetchImplementation: fetchStub, now: () => new Date(RETRIEVED_AT) });

    expect(await transport.head(LHUNDG_KEY)).toBeNull();
    expect(requests[0]).toMatchObject({ url: `https://account123.r2.cloudflarestorage.com/landesrecht-quellen/${LHUNDG_KEY}`, method: 'HEAD' });
    expect(requests[0]!.headers['x-amz-date']).toBe('20260915T100000Z');
    expect(requests[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDTEST\/20260915\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/u);

    const bytes = new TextEncoder().encode('Rohquelle');
    await transport.put(LHUNDG_KEY, bytes, { contentType: 'text/html', metadata: { sha256: sha256(bytes), 'Source-URL': 'https://recht.nrw.de/a b' } });
    expect(requests[1]!.method).toBe('PUT');
    expect(requests[1]!.headers).toMatchObject({ 'content-type': 'text/html', 'x-amz-meta-sha256': sha256(bytes), 'x-amz-meta-source-url': 'https%3A%2F%2Frecht.nrw.de%2Fa%20b', 'x-amz-content-sha256': sha256(bytes) });
    expect(requests[1]!.headers.authorization).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-sha256;x-amz-meta-source-url,');

    expect(decode((await transport.get(LHUNDG_KEY))!)).toBe('Rohquelle');
    const failure = await caught(() => transport.get(LHUNDG_KEY));
    expect(failure).toBeInstanceOf(R2TransportError);
    expect((failure as R2TransportError).status).toBe(500);
    expect(JSON.stringify(requests)).not.toContain('geheimer-schluessel');
  });

  it('ohne vollständige Zugangsdaten gibt es keinen Transport; fehlende Variablen werden ohne Werte genannt', () => {
    expect(missingR2Environment({})).toEqual(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
    expect(s3R2TransportFromEnv({}, R2_SOURCES_BUCKET)).toBeUndefined();

    const partial = { R2_ACCOUNT_ID: 'account123', R2_ACCESS_KEY_ID: 'AKIDTEST', R2_SECRET_ACCESS_KEY: '' };
    expect(s3R2TransportFromEnv(partial, R2_SOURCES_BUCKET)).toBeUndefined();
    expect(missingR2Environment(partial)).toEqual(['R2_SECRET_ACCESS_KEY']);

    const secretOnly = missingR2Environment({ R2_SECRET_ACCESS_KEY: 'geheimer-schluessel' });
    expect(secretOnly).toEqual(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID']);
    expect(secretOnly.join(' ')).not.toContain('geheimer-schluessel');

    const complete = { CLOUDFLARE_ACCOUNT_ID: 'account123', R2_ACCESS_KEY_ID: 'AKIDTEST', R2_SECRET_ACCESS_KEY: 'geheimer-schluessel' };
    expect(missingR2Environment(complete)).toEqual([]);
    expect(s3R2TransportFromEnv(complete, R2_SOURCES_BUCKET)).toMatchObject({ name: 's3', bucket: 'landesrecht-quellen' });
    expect(s3R2TransportFromEnv({ ...complete, R2_BUCKET: 'landesrecht-quellen-test' }, R2_SOURCES_BUCKET)?.bucket).toBe('landesrecht-quellen-test');
  });
});
