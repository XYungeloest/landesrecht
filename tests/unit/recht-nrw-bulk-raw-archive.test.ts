/**
 * Rohquellen im Bulkmodus (R2-Archiv, verzögerter Upload, Staging außerhalb von Git): Review-Fälle, Parser-/
 * Integritätsfehler nach erfolgreichem Abruf, unbekannte Struktur (LRMB), blockierte Schreibvorgänge und der
 * anschließende Retry aus dem Cache. Geprüft werden Staging-Datei, SHA-256, ArchiveReference (bucket/objectKey/
 * archiveStatus), Dublettenfreiheit im Staging und Netzfreiheit des Retrys. Außerdem: Bulk `west` erzeugt keine
 * andere Jurisdiktion. Alle Schreibvorgänge in temporären Verzeichnissen, kein Netz.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { createR2Archive, envelopeKey, r2ObjectKey } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { TARGET_JURISDICTION } from '@landesrecht/importer-recht-nrw/common/constants.ts';
import { loadImportEnvironment, type ImportEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { createRechtNrwFetcher, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { IMPORT_DATA_DIR, readManifest, readManifestEntry, type ManifestRawDocument } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { SYNTHETIC_PDF, syntheticFetch } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { readSlugRegistry, SLUG_REGISTRY_PATH } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';
import { importRechtNrwNorm } from '@landesrecht/importer-recht-nrw/lrgv/pipeline.ts';
import { importRechtNrwLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/pipeline.ts';

import { cleanupTempBases, exists, listFiles, tempBase } from '../helpers/recht-nrw-bulk-stub.ts';

const repoRoot = process.cwd();
const fixtures = join(repoRoot, 'tests', 'fixtures', 'recht-nrw');
const NATIVE_URL = 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw';
const ANNEX_URL = 'https://recht.nrw.de/system/files/BA/4242-1-anlage.htm';
const ANNEX_PDF_URL = 'https://recht.nrw.de/system/files/BA/4242-2-anlage.pdf';
const TERM = '515151';
const LRMB_DIRECT = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062022-runderlass-testbestimmungen-fuer-die-ordnungsbehoerden';
const LRMB_PDF = 'https://recht.nrw.de/system/files/pdf/ministerial-journal/2022/03/16/abc/anlage-testbestimmungen.pdf';
const now = (): Date => new Date('2026-09-15T12:00:00.000Z');
const noSleep = async (): Promise<void> => undefined;
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

let nativeHtml: string;
let annexHtml: string;
let lrmbDirectHtml: string;
beforeAll(async () => {
  nativeHtml = await readFile(join(fixtures, 'version-page-native.html'), 'utf8');
  annexHtml = await readFile(join(fixtures, 'annex.htm'), 'utf8');
  lrmbDirectHtml = await readFile(join(fixtures, 'lrmb', 'page-direct.html'), 'utf8');
});
afterAll(cleanupTempBases);

/** Fassungsseite mit widersprüchlichem Intervall („Gültig bis“ vor „Gültig ab“): Review-Fall selection-inconsistent-interval. */
const reviewHtml = (): string => nativeHtml.replace('<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div>', '<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div><div class="info-box-item"><div class="field__label">Gültig bis</div><div class="field__item"> 29.03.2018 </div></div>');
/** Fassungsseite mit zusätzlichem Nummernfeld außerhalb der Einheiten: der Parser zählt eine Einheit weniger als das Roh-HTML (Integritätsfehler → failed). */
const integrityHtml = (): string => nativeHtml.replace('<p class="text-align-center">Der Ministerpräsident</p>', '<p class="text-align-center"><span class="field field--field_num">§ 9</span> Der Ministerpräsident</p>');

interface BulkRoot {
  base: string;
  root: string;
  stagingDir: string;
  cacheDir: string;
  environment: ImportEnvironment;
  fetcher: (pages: ReadonlyMap<string, string>, options?: { offline?: boolean }) => RechtNrwFetcher;
}

async function bulkRoot(name: string, options: { registeredSlugs?: Array<[string, string]> } = {}): Promise<BulkRoot> {
  const base = await tempBase(`recht-nrw-raw-${name}-`);
  const root = join(base, 'root');
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  await mkdir(join(root, IMPORT_DATA_DIR), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
  await cp(join(repoRoot, IMPORT_DATA_DIR, 'institution-mapping.json'), join(root, IMPORT_DATA_DIR, 'institution-mapping.json'));
  if (options.registeredSlugs) await writeFile(join(root, SLUG_REGISTRY_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-slug-registry/1', jurisdiction: 'west', entries: options.registeredSlugs.map(([sourceIdentity, slug]) => ({ slug, sourceIdentity, candidate: slug, assignment: 'derived' })) }));
  const stagingDir = join(base, 'staging');
  const cacheDir = join(base, 'cache');
  const archive = createR2Archive({ root, stagingDir, upload: 'deferred' });
  const environment = await loadImportEnvironment(root, { mode: 'bulk', archive, stagingDir, projection: 'record-only', runId: 'raw-test' });
  const fetcher = (pages: ReadonlyMap<string, string>, options: { offline?: boolean } = {}): RechtNrwFetcher => createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, offline: Boolean(options.offline), fetchImplementation: syntheticFetch(pages) });
  return { base, root, stagingDir, cacheDir, environment, fetcher };
}

const lrgvPages = (page: string): Map<string, string> => new Map([[NATIVE_URL, page], [ANNEX_URL, annexHtml], [ANNEX_PDF_URL, SYNTHETIC_PDF]]);

/** Prüft je Rohdokument: ArchiveReference, Staging-Datei mit passendem SHA-256, Umschlag. */
async function expectStaged(context: BulkRoot, termId: string, rawDocuments: readonly ManifestRawDocument[], sources: ReadonlyMap<string, string>): Promise<void> {
  expect(rawDocuments.length).toBeGreaterThan(0);
  for (const raw of rawDocuments) {
    const bytes = new TextEncoder().encode(sources.get(raw.url) ?? '');
    expect(raw.sha256, raw.url).toBe(sha(bytes));
    expect(raw).toMatchObject({ archiveStatus: 'staged', bucket: 'landesrecht-quellen' });
    expect(raw.objectKey).toBe(r2ObjectKey({ termId, sha256: raw.sha256, role: raw.role === 'legacy-text' ? 'text-document' : raw.role === 'annex' || raw.role === 'pdf' ? 'attachment' : 'version-page', contentType: raw.contentType }));
    expect(raw.objectKey!.startsWith(`${TARGET_JURISDICTION}/recht-nrw/2023-12-01/term-${termId}/`)).toBe(true);
    const staged = await readFile(join(context.stagingDir, raw.objectKey!));
    expect(sha(new Uint8Array(staged))).toBe(raw.sha256);
    expect(staged.byteLength).toBe(raw.byteLength);
    const envelope = JSON.parse(await readFile(join(context.stagingDir, envelopeKey(raw.objectKey!)), 'utf8')) as Record<string, unknown>;
    expect(envelope).toMatchObject({ schemaVersion: 'recht-nrw-r2-envelope/1', objectKey: raw.objectKey, bucket: 'landesrecht-quellen', sha256: raw.sha256, url: raw.url, termId, jurisdiction: 'west' });
  }
  expect(raw(rawDocuments)).toEqual(new Set(rawDocuments.map((entry) => entry.objectKey)));
}
const raw = (documents: readonly ManifestRawDocument[]): Set<string | undefined> => new Set(documents.map((entry) => entry.objectKey));

describe('Rohquellen gescheiterter Bulkimporte (LRGV, Bulkmodus, Staging)', () => {
  it('Review-Fall nach erfolgreichem Abruf: Rohquellen gestagt, ArchiveReference im Manifest, kein Inhalt', async () => {
    const context = await bulkRoot('review');
    const pages = lrgvPages(reviewHtml());
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: context.fetcher(pages), write: true, now, environment: context.environment });
    expect(result.status).toBe('needs-review');
    expect(result.findings.map((finding) => finding.code)).toContain('selection-inconsistent-interval');
    const entry = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(entry).toMatchObject({ importStatus: 'needs-review', targetSlug: '', archive: { mode: 'r2', bucket: 'landesrecht-quellen' } });
    await expectStaged(context, TERM, entry!.rawDocuments, pages);
    expect(entry!.rawDocuments.map((document) => document.role)).toEqual(['version-page']);
    expect(await readdir(join(context.root, 'content', 'norms', 'west'))).toEqual([]);
    expect(await exists(join(context.root, 'sources'))).toBe(false);
  });

  it('Integritätsfehler (Parser zählt Einheiten anders als das Roh-HTML) → failed: Rohquellen samt Anlagen gestagt; Retry offline aus dem Cache erzeugt kein zweites Objekt', async () => {
    const context = await bulkRoot('integrity');
    const pages = lrgvPages(integrityHtml());
    const online = context.fetcher(pages);
    const first = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: online, write: true, now, environment: context.environment });
    expect(first.status).toBe('failed');
    expect(first.findings.map((finding) => finding.code)).toContain('integrity-parse-units');
    expect(online.stats.networkRequests).toBe(3);
    const entry = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(entry).toMatchObject({ importStatus: 'failed', targetSlug: '', integrity: { fetchParse: false } });
    expect(entry!.rawDocuments.map((document) => document.role).sort()).toEqual(['annex', 'annex', 'version-page']);
    await expectStaged(context, TERM, entry!.rawDocuments, pages);
    const stagedBefore = await listFiles(context.stagingDir);
    expect(stagedBefore).toHaveLength(entry!.rawDocuments.length * 2);
    expect(context.environment.archive.stats).toMatchObject({ stored: 3, uploaded: 0 });
    expect(await readdir(join(context.root, 'content', 'norms', 'west'))).toEqual([]);

    // Retry: derselbe Quellstand aus dem Cache (kein Netz), gleiche Hashes und Objektschlüssel, keine neuen Staging-Dateien.
    const offline = context.fetcher(pages, { offline: true });
    const second = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: offline, write: true, now, environment: context.environment });
    expect(second.status).toBe('failed');
    expect(offline.stats).toMatchObject({ networkRequests: 0, cacheHits: 3 });
    const retried = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(retried!.rawDocuments.map(({ retrievedAt: _retrievedAt, ...rest }) => rest)).toEqual(entry!.rawDocuments.map(({ retrievedAt: _retrievedAt, ...rest }) => rest));
    expect(retried!.sha256).toBe(entry!.sha256);
    expect(await listFiles(context.stagingDir)).toEqual(stagedBefore);
    for (const file of stagedBefore) if (!file.endsWith('.envelope.json')) expect(sha(new Uint8Array(await readFile(join(context.stagingDir, file))))).toBe(file.split('/').pop()!.slice(0, 16) ? retried!.rawDocuments.find((document) => document.objectKey === file)!.sha256 : '');
  });

  it('blockierter Schreibvorgang (Beispielkorpus-Norm mit versionierten Quellen) → failed nach dem Staging; die gespeicherte Fassung bleibt byteidentisch', async () => {
    // Die Beispielkorpus-Norm ist in der Slug-Registry eingetragen (wie produktiv: aus dem Manifest gesät).
    const context = await bulkRoot('blocked', { registeredSlugs: [[`term:${TERM}`, 'testvo-west']] });
    const normDir = join(context.root, 'content', 'norms', 'west', 'testvo-west', 'versions');
    await mkdir(normDir, { recursive: true });
    const protectedVersion = '{"versionId":"2023-12-01","sourceReferences":[{"availability":"versioned","localSource":"sources/recht-nrw/term-515151/x.html"}]}';
    await writeFile(join(normDir, '2023-12-01.json'), protectedVersion);
    const pages = lrgvPages(nativeHtml);
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: context.fetcher(pages), write: true, now, environment: context.environment });
    expect(result.status).toBe('failed');
    expect(result.findings.map((finding) => finding.code)).toContain('existing-versions');
    expect(await readFile(join(normDir, '2023-12-01.json'), 'utf8')).toBe(protectedVersion);
    const entry = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(entry).toMatchObject({ importStatus: 'failed', targetSlug: '' });
    await expectStaged(context, TERM, entry!.rawDocuments, pages);
  });

  it('außerhalb des Bulkmodus tragen Rohdokumente gescheiterter Importe keinen Archivstatus und keine R2-Adresse; nichts liegt unter sources/', async () => {
    const context = await bulkRoot('sample');
    const pages = lrgvPages(integrityHtml());
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: context.fetcher(pages), write: true, now });
    expect(result.status).toBe('failed');
    const entry = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(entry!.rawDocuments.length).toBeGreaterThan(0);
    for (const document of entry!.rawDocuments) {
      expect(document.archiveStatus).toBeUndefined();
      expect(document.bucket).toBeUndefined();
      expect(document.objectKey).toBeUndefined();
    }
    // Bekannte Unschärfe (nicht Gegenstand dieses Tests): `localSource` bleibt als geplanter Ablageort stehen, ohne Datei.
    expect(await exists(join(context.root, 'sources'))).toBe(false);
    expect(await exists(context.stagingDir)).toBe(false);
  });
});

describe('Rohquellen gescheiterter Bulkimporte (LRMB)', () => {
  it('nicht abrufbare Anlage (Review-Fall) und Integritätsfehler (failed): Fassungsseite im Bulk gestagt; Retry offline erzeugt kein zweites Objekt', async () => {
    const context = await bulkRoot('lrmb');
    const pages = new Map([[LRMB_DIRECT, lrmbDirectHtml]]);
    const online = context.fetcher(pages);
    const result = await importRechtNrwLrmbDocument({ url: LRMB_DIRECT, root: context.root, fetcher: online, write: true, now, environment: context.environment });
    expect(result.status).toBe('needs-review');
    expect(result.findings.map((finding) => finding.code)).toContain('attachment-fetch-failed');
    expect(online.stats.networkRequests).toBe(2);
    const entry = (await readManifest(context.root)).entries.find((candidate) => candidate.sourceArea === 'lrmb');
    expect(entry).toMatchObject({ importStatus: 'needs-review', targetSlug: '', archive: { mode: 'r2' } });
    const termId = entry!.sourceIdentity.slice('term:'.length);
    expect(entry!.rawDocuments.map((document) => document.role)).toEqual(['version-page']);
    await expectStaged(context, termId, entry!.rawDocuments, pages);
    const stagedBefore = await listFiles(context.stagingDir);
    expect(await readdir(join(context.root, 'content', 'norms', 'west'))).toEqual([]);

    const offline = context.fetcher(pages, { offline: true });
    const retry = await importRechtNrwLrmbDocument({ url: LRMB_DIRECT, root: context.root, fetcher: offline, write: true, now, environment: context.environment });
    expect(retry.status).toBe('needs-review');
    expect(offline.stats.networkRequests).toBe(0);
    expect(await listFiles(context.stagingDir)).toEqual(stagedBefore);
    expect((await readManifest(context.root)).entries.find((candidate) => candidate.sourceArea === 'lrmb')!.rawDocuments.map((document) => document.objectKey)).toEqual(entry!.rawDocuments.map((document) => document.objectKey));

    // Mit erreichbarer Anlage wird dieselbe Seite übernommen: der Review-Fall lag an der Quelle, nicht am Staging.
    const complete = await bulkRoot('lrmb-complete');
    const imported = await importRechtNrwLrmbDocument({ url: LRMB_DIRECT, root: complete.root, fetcher: complete.fetcher(new Map([[LRMB_DIRECT, lrmbDirectHtml], [LRMB_PDF, SYNTHETIC_PDF]])), write: true, now, environment: complete.environment });
    expect(imported.status).toBe('imported-with-warnings');
    expect(await readdir(join(complete.root, 'content', 'norms'))).toEqual(['west']);

    const sample = await bulkRoot('lrmb-sample');
    const sampleResult = await importRechtNrwLrmbDocument({ url: LRMB_DIRECT, root: sample.root, fetcher: sample.fetcher(pages), write: true, now });
    expect(sampleResult.status).toBe('needs-review');
    // Beispielmodus: Review-Fälle archivieren versioniert unter sources/ (Ausnahme des Beispielkorpus), nie in R2.
    const sampleEntry = (await readManifest(sample.root)).entries.find((candidate) => candidate.sourceArea === 'lrmb');
    expect(sampleEntry!.rawDocuments.every((document) => document.archiveStatus === 'versioned' && document.objectKey === undefined && document.bucket === undefined && document.localSource?.startsWith('sources/recht-nrw/'))).toBe(true);
    for (const document of sampleEntry!.rawDocuments) expect(sha(new Uint8Array(await readFile(join(sample.root, document.localSource!))))).toBe(document.sha256);
  });
});

describe('Mehrjurisdiktions-Sicherheit des Bulkimports', () => {
  it('ein erfolgreicher Bulkimport schreibt ausschließlich unter content/norms/west mit Jurisdiktion west; Manifest, Slug-Registry und Objektschlüssel tragen west', async () => {
    const context = await bulkRoot('west');
    const pages = lrgvPages(nativeHtml);
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root: context.root, fetcher: context.fetcher(pages), write: true, now, environment: context.environment });
    expect(result.status).toBe('imported-with-warnings');
    expect(await readdir(join(context.root, 'content', 'norms'))).toEqual(['west']);
    expect(await readdir(join(context.root, 'content', 'norms', 'west'))).toEqual(['testvo-west']);
    const record = await loadNorm('west', 'testvo-west', context.root);
    expect(record.meta.jurisdiction).toBe('west');
    expect(record.meta.id).toBe('west:testvo-west');
    expect(TARGET_JURISDICTION).toBe('west');
    const entry = await readManifestEntry(context.root, 'lrgv', `term:${TERM}`);
    expect(entry).toMatchObject({ targetJurisdiction: 'west', targetSlug: 'testvo-west' });
    expect(entry!.rawDocuments.every((document) => document.objectKey?.startsWith('west/recht-nrw/2023-12-01/'))).toBe(true);
    expect((await readSlugRegistry(context.root)).jurisdiction).toBe('west');
    expect(record.versions[0]!.sourceReferences?.filter((reference) => reference.availability === 'r2-archived').every((reference) => reference.bucket === 'landesrecht-quellen' && reference.objectKey?.startsWith('west/'))).toBe(true);
  });
});
