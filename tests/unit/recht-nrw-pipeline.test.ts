/**
 * End-to-End-Test des Importpfads ohne Netz: ein Fake-Fetcher liefert die HTML-Fixtures, das
 * Zielrepository ist ein temporäres Verzeichnis. Geprüft werden Dry-run, Schreiblauf,
 * kanonischer Output, Manifest, Audit-Report, D1-Projektion, Volltextsuche und Normrouting.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { getNormUrl, getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { resolveVersionAt } from '@landesrecht/legal-core/lib/versions.ts';
import { RechtNrwFetchError, type FetchedDocument, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { unresolvedSourcePath } from '@landesrecht/importer-recht-nrw/common/unresolved.ts';
import { importRechtNrwNorm, type ImportResult } from '@landesrecht/importer-recht-nrw/lrgv/pipeline.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

const repoRoot = process.cwd();
const fixtures = join(repoRoot, 'tests', 'fixtures', 'recht-nrw');
const LATER_URL = 'https://recht.nrw.de/lrgv/gesetz/16122023-testgesetz-nordrhein-westfalen-testg-nrw';
const BASELINE_URL = 'https://recht.nrw.de/lrgv/gesetz/01012020-testgesetz-nordrhein-westfalen-testg-nrw';
const TEXT_URL = 'https://recht.nrw.de/system/files/BH/9999-1.htm';
const NATIVE_URL = 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw';
const ANNEX_URL = 'https://recht.nrw.de/system/files/BA/4242-1-anlage.htm';
const ANNEX_PDF_URL = 'https://recht.nrw.de/system/files/BA/4242-2-anlage.pdf';

function fakeFetcher(files: Record<string, string>): RechtNrwFetcher & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string): Promise<FetchedDocument> {
      requested.push(url);
      const file = files[url];
      if (!file) throw new Error(`Fake-Fetcher: ${url} nicht vorgesehen`);
      const bytes = file.endsWith('.pdf') ? new TextEncoder().encode('%PDF-1.4 fake') : new Uint8Array(await readFile(join(fixtures, file)));
      return { url, finalUrl: url, status: 200, contentType: file.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: createHash('sha256').update(bytes).digest('hex'), bytes, fromCache: false };
    },
  };
}

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-import-'));
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  await mkdir(join(root, 'packages', 'legal-core'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
  // Vorhandene Fixture-Norm (Slug-Kollision bleibt ausgeschlossen, Projektion enthält beide).
  await cp(join(repoRoot, 'tests', 'fixtures', 'content', 'norms', 'west', 'testfixture-schulgesetz-west'), join(root, 'content', 'norms', 'west', 'testfixture-schulgesetz-west'), { recursive: true });
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('RECHT.NRW-Importpfad (Fixtures, ohne Netz)', () => {
  const files = { [LATER_URL]: 'version-page-later.html', [BASELINE_URL]: 'version-page-legacy.html', [TEXT_URL]: 'legacy-text.htm' };
  const now = (): Date => new Date('2026-09-15T12:00:00.000Z');

  it('wählt aus einer späteren Einstiegsadresse die Stichtagsfassung und schreibt im Dry-run nichts', async () => {
    const fetcher = fakeFetcher(files);
    const result = await importRechtNrwNorm({ url: LATER_URL, root, fetcher, now });
    expect(result.status).toBe('dry-run');
    expect(result.selection?.selected?.validFrom).toBe('2020-01-01');
    expect(result.page?.address.url).toBe(BASELINE_URL);
    expect(fetcher.requested).toEqual([LATER_URL, BASELINE_URL, TEXT_URL]);
    expect(result.record?.meta.slug).toBe('testg-west');
    expect(result.writtenFiles).toEqual([]);
    expect(await readdir(join(root, 'content', 'norms', 'west'))).toEqual(['testfixture-schulgesetz-west']);
    expect(result.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.integrity?.fetchParse.ok).toBe(true);
    expect(result.projection?.norms).toBe(2);
  });

  let written: ImportResult;
  it('schreibt im Schreiblauf Rohquellen, kanonische Dateien, Report und Manifest', async () => {
    written = await importRechtNrwNorm({ url: LATER_URL, root, fetcher: fakeFetcher(files), write: true, now });
    expect(written.status).toBe('imported-with-warnings');
    expect(written.writtenFiles).toEqual(expect.arrayContaining([
      'content/norms/west/testg-west/meta.json',
      'content/norms/west/testg-west/history.json',
      'content/norms/west/testg-west/versions/2023-12-01.json',
      'data/audits/recht-nrw/testg-west.json',
      'data/imports/recht-nrw/manifest/lrgv/term-424242.json',
      'data/imports/recht-nrw/review/lrgv/term-424242.json',
    ]));
    const rawFiles = written.writtenFiles.filter((file) => file.startsWith('sources/recht-nrw/term-424242/'));
    expect(rawFiles).toHaveLength(2);
    for (const file of rawFiles) {
      const bytes = await readFile(join(root, file));
      const expected = file.includes('legacy-text') ? await readFile(join(fixtures, 'legacy-text.htm')) : await readFile(join(fixtures, 'version-page-legacy.html'));
      expect(Buffer.compare(bytes, expected)).toBe(0);
    }
    const record = await loadNorm('west', 'testg-west', root);
    expect(record.versions.map((version) => version.versionId)).toEqual(['2023-12-01']);
    expect(record.versions[0]!.sourceValidFrom).toBe('2020-01-01');
    expect(record.versions[0]!.sourceValidTo).toBe('2023-12-15');
    expect(resolveVersionAt(record, '2024-06-01')?.versionId).toBe('2023-12-01');
    expect(record.meta.sourceReferences.every((reference) => reference.url?.startsWith('https://recht.nrw.de/'))).toBe(true);
    expect(record.meta.sourceReferences.filter((reference) => reference.availability === 'versioned').map((reference) => reference.localSource)).toEqual(rawFiles);
    const manifest = await readManifest(root);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({ sourceIdentity: 'term:424242', targetSlug: 'testg-west', sourceValidFrom: '2020-01-01', sourceValidTo: '2023-12-15', baselineDate: '2023-12-01', importStatus: 'imported-with-warnings', parserVersion: 'recht-nrw-parser/1.2.0', contentFormat: 'legacy-file', selectedVersionUrl: BASELINE_URL });
    expect(manifest.entries[0]!.versionsConsidered.filter((entry) => entry.selected)).toHaveLength(1);
    const report = JSON.parse(await readFile(join(root, 'data', 'audits', 'recht-nrw', 'testg-west.json'), 'utf8')) as { changes: unknown[]; unresolved: unknown[]; integrity: { fetchParse: { ok: boolean } } };
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.unresolved.length).toBeGreaterThan(0);
    expect(report.integrity.fetchParse.ok).toBe(true);
  });

  it('ist wiederholbar und überschreibt keine fremden Fassungen', async () => {
    const again = await importRechtNrwNorm({ url: BASELINE_URL, root, fetcher: fakeFetcher(files), write: true, now });
    expect(again.status).toBe('imported-with-warnings');
    expect(again.record?.meta.slug).toBe('testg-west');
    expect((await readManifest(root)).entries).toHaveLength(1);
    await mkdir(join(root, 'content', 'norms', 'west', 'testg-west', 'versions'), { recursive: true });
    await writeFile(join(root, 'content', 'norms', 'west', 'testg-west', 'versions', '2026-01-01.json'), '{}');
    const blocked = await importRechtNrwNorm({ url: BASELINE_URL, root, fetcher: fakeFetcher(files), write: true, now });
    expect(blocked.status).toBe('failed');
    expect(blocked.findings.map((finding) => finding.code)).toContain('existing-versions');
    expect(await readFile(join(root, 'content', 'norms', 'west', 'testg-west', 'versions', '2026-01-01.json'), 'utf8')).toBe('{}');
    await rm(join(root, 'content', 'norms', 'west', 'testg-west', 'versions', '2026-01-01.json'));
  });

  it('projiziert die importierte Norm nach D1 und findet sie in der Volltextsuche mit Strukturadresse', async () => {
    const record = await loadNorm('west', 'testg-west', root);
    const fixture = await loadNorm('west', 'testfixture-schulgesetz-west', root);
    const db = await openSqliteD1(':memory:', { migrationsDir: join(repoRoot, 'data', 'd1') });
    executePlan(db, buildProjectionPlan([record, fixture], { jurisdiction: 'west', full: true, now: '2026-01-01T00:00:00.000Z' }));
    checkSearchIndexIntegrity(db);
    const store = createD1NormStore(db, 'west');
    const summaries = await store.listNormSummaries();
    expect(summaries.map((summary) => summary.slug)).toEqual(['testfixture-schulgesetz-west', 'testg-west']);
    const hit = await store.search(createSearchState({ q: 'Prüfung des Landesrechts' }));
    expect(hit.hits.map((entry) => [entry.slug, entry.unit?.anchor])).toEqual([['testg-west', 'paragraph-1']]);
    const reference = await store.search(createSearchState({ q: '§ 2 Absatz 2 TestG' }));
    expect(reference.hits[0]?.unit?.url).toBe(`${getNormUrl('west', 'testg-west')}#paragraph-2`);
    const loaded = await store.getNorm('testg-west', 'all');
    expect(loaded?.versions[0]!.body.some((block) => block.type === 'annex')).toBe(true);
    expect(getNormVersionUrl('west', 'testg-west', '2023-12-01')).toBe('/west/norm/testg-west/version/2023-12-01/');
    db.close();
  });

  it('importiert eine native Fassung mit HTM-Anlage und registriert PDF-Anlagen nur als Quelle', async () => {
    const result = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fakeFetcher({ [NATIVE_URL]: 'version-page-native.html', [ANNEX_URL]: 'annex.htm', [ANNEX_PDF_URL]: 'annex.pdf' }), write: true, now });
    expect(result.status).toBe('imported-with-warnings');
    expect(result.record?.meta.slug).toBe('testvo-west');
    expect(result.record?.meta.type).toBe('verordnung');
    expect(result.record?.meta.abbr).toBe('TestVO West');
    expect(result.record?.meta.sourceCitation).toBe('Testverordnung Nordrhein-Westfalen vom 16. November 2006 (GV. NRW. 2006 S. 516)');
    expect(result.record?.meta.initialCitation).toBe('Testverordnung Westdeutschland in der am 1. Dezember 2023 übernommenen Fassung (Ausgangsrechtsstand West)');
    expect(result.record?.versions[0]!.sourceValidTo).toBeUndefined();
    const body = result.record!.versions[0]!.body;
    const annexes = body.filter((block) => block.type === 'annex');
    expect(annexes).toHaveLength(1);
    expect(JSON.stringify(annexes[0])).toContain('Pauschale in Euro');
    expect(result.findings.map((finding) => finding.code)).toContain('annex-pdf-only');
    expect(result.record?.meta.sourceReferences.some((reference) => reference.kind === 'primary-pdf' && reference.url?.endsWith('2018-03-30-testverordnung.pdf'))).toBe(true);
    expect((await readManifest(root)).entries.map((entry) => entry.targetSlug).sort()).toEqual(['testg-west', 'testvo-west']);
  });

  it('führt eine nicht abrufbare Anlage als Review-Fall; Budget- und Sperrfehler beenden den Lauf', async () => {
    const isolated = await mkdtemp(join(tmpdir(), 'landesrecht-import-anlage-'));
    try {
      await mkdir(join(isolated, 'content', 'norms', 'west'), { recursive: true });
      await writeFile(join(isolated, 'package.json'), '{"name":"tmp"}');
      const base = fakeFetcher({ [NATIVE_URL]: 'version-page-native.html', [ANNEX_PDF_URL]: 'annex.pdf' });
      const failingAnnex = (kind: 'not-found' | 'budget-exhausted'): RechtNrwFetcher => ({
        stats: base.stats,
        fetch: (url) => (url === ANNEX_URL ? Promise.reject(new RechtNrwFetchError(kind, url, kind === 'not-found' ? 'HTTP 404' : 'Abrufbudget erreicht', kind === 'not-found' ? 404 : undefined)) : base.fetch(url)),
      });
      const missing = await importRechtNrwNorm({ url: NATIVE_URL, root: isolated, fetcher: failingAnnex('not-found'), write: true, now });
      expect(missing.status).toBe('needs-review');
      expect(missing.findings.map((finding) => finding.code)).toContain('attachment-fetch-failed');
      expect(missing.reviewItems.map((item) => item.category)).toContain('attachment');
      expect(await readdir(join(isolated, 'content', 'norms', 'west'))).toEqual([]);
      await expect(importRechtNrwNorm({ url: NATIVE_URL, root: isolated, fetcher: failingAnnex('budget-exhausted'), now })).rejects.toMatchObject({ kind: 'budget-exhausted' });
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });

  it('führt eine Seite ohne Stammnorm-Kennung als expliziten Datensatz statt still abzubrechen', async () => {
    const isolated = await mkdtemp(join(tmpdir(), 'landesrecht-import-unresolved-'));
    try {
      await mkdir(join(isolated, 'content', 'norms', 'west'), { recursive: true });
      await writeFile(join(isolated, 'package.json'), '{"name":"tmp"}');
      const withoutTerm = (await readFile(join(fixtures, 'version-page-native.html'), 'utf8')).replace(/taxonomy\/term\/515151/gu, 'taxonomy/term/');
      await writeFile(join(fixtures, '.tmp-no-term.html'), withoutTerm);
      const result = await importRechtNrwNorm({ url: NATIVE_URL, root: isolated, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-no-term.html', [ANNEX_URL]: 'annex.htm', [ANNEX_PDF_URL]: 'annex.pdf' }), write: true, now });
      expect(result.status).toBe('failed');
      expect(result.findings.map((finding) => finding.code)).toContain('missing-stem-id');
      expect(result.unresolvedReport).toBe(unresolvedSourcePath('lrgv', NATIVE_URL));
      const record = JSON.parse(await readFile(join(isolated, result.unresolvedReport!), 'utf8')) as { url: string; reason: Array<{ code: string }>; documents: Array<{ sha256: string; httpStatus: number }> };
      expect(record.url).toBe(NATIVE_URL);
      expect(record.reason.map((entry) => entry.code)).toContain('missing-stem-id');
      expect(record.documents[0]).toMatchObject({ httpStatus: 200 });
      expect(record.documents[0]!.sha256).toMatch(/^[0-9a-f]{64}$/u);
      // Keine erfundene Identität: weder Norm noch Manifesteintrag.
      expect(await readdir(join(isolated, 'content', 'norms', 'west'))).toEqual([]);
      expect((await readManifest(isolated)).entries).toEqual([]);
    } finally {
      await rm(join(fixtures, '.tmp-no-term.html'), { force: true });
      await rm(isolated, { recursive: true, force: true });
    }
  });

  it('dokumentiert LRGV-Portaleinträge fremden Dokumenttyps als expliziten Datensatz ohne Abruf', async () => {
    const isolated = await mkdtemp(join(tmpdir(), 'landesrecht-import-not-lrgv-'));
    try {
      await mkdir(join(isolated, 'content', 'norms', 'west'), { recursive: true });
      await writeFile(join(isolated, 'package.json'), '{"name":"tmp"}');
      const url = 'https://recht.nrw.de/lrgv/verwaltungsvorschrift/16012026-finanzordnung-fino-lfm-nrw';
      const fetcher = fakeFetcher({});
      const result = await importRechtNrwNorm({ url, root: isolated, fetcher, write: true, now });
      expect(result.status).toBe('failed');
      expect(result.findings[0]?.code).toBe('not-lrgv');
      expect(fetcher.requested).toEqual([]);
      expect(result.unresolvedReport).toBe(unresolvedSourcePath('lrgv', url));
      const record = JSON.parse(await readFile(join(isolated, result.unresolvedReport!), 'utf8')) as { url: string; importStatus: string; reason: Array<{ code: string }>; documents: unknown[] };
      expect(record).toMatchObject({ url, importStatus: 'failed', documents: [] });
      expect(record.reason.map((entry) => entry.code)).toEqual(['not-lrgv']);
      expect((await readManifest(isolated)).entries).toEqual([]);
      // Fremde Bereiche (LRMB) gehören zum anderen Pfad und erhalten keinen LRGV-Datensatz.
      const outside = await importRechtNrwNorm({ url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/irgendwas', root: isolated, fetcher: fakeFetcher({}), write: true, now });
      expect(outside.unresolvedReport).toBeUndefined();
      expect(outside.writtenFiles.filter((file) => file.includes('/unresolved/'))).toEqual([]);
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });

  it('führt Quellstrukturdefekte als Review-Fälle mit Quellkontext: PDF-only-Fassungsseite und Sektion ohne Nummernfeld', async () => {
    const isolated = await mkdtemp(join(tmpdir(), 'landesrecht-import-structure-'));
    try {
      await mkdir(join(isolated, 'content', 'norms', 'west'), { recursive: true });
      await writeFile(join(isolated, 'package.json'), '{"name":"tmp"}');
      const native = await readFile(join(fixtures, 'version-page-native.html'), 'utf8');
      // Fassungsseite nur mit PDF-Download (Erstes Gesetz zur Befristung des Landesrechts, term 28965): kein iframe, kein natives Dokument.
      const pdfOnly = native.replace(/<div id="block-rnrw-content">[\s\S]*<\/article><\/div>/u, '<div id="block-rnrw-content"><article><div></div></article></div>');
      await writeFile(join(fixtures, '.tmp-pdf-only.html'), pdfOnly);
      const pdf = await importRechtNrwNorm({ url: NATIVE_URL, root: isolated, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-pdf-only.html' }), now });
      expect(pdf.status).toBe('needs-review');
      expect(pdf.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code)).toEqual(['content-pdf-only']);
      expect(pdf.findings[0]!.message).toContain('2018-03-30-testverordnung.pdf');
      expect(pdf.findings[0]!.message).toContain('term:515151');
      expect(pdf.reviewItems.map((item) => item.category)).toContain('other');

      // Sektion ohne Nummernfeld mit Normtext (Gerichtsgliederungsgesetz, term 26552): Review statt failed, Befund mit Term, URL, Phase, Quellhash.
      const unnumbered = (await readFile(join(fixtures, 'broken-html', 'native-unnumbered-section.html'), 'utf8')).replace(/<!--[\s\S]*?-->/u, '');
      const start = native.indexOf('<div class="field field--field_body">');
      const end = native.indexOf('<div class="field field--field_conclusions');
      await writeFile(join(fixtures, '.tmp-unnumbered.html'), `${native.slice(0, start)}${unnumbered}\n${native.slice(end)}`);
      const structure = await importRechtNrwNorm({ url: NATIVE_URL, root: isolated, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-unnumbered.html', [ANNEX_URL]: 'annex.htm', [ANNEX_PDF_URL]: 'annex.pdf' }), now });
      expect(structure.status).toBe('needs-review');
      const finding = structure.findings.find((entry) => entry.code === 'structure-unnumbered-section')!;
      expect(finding.severity).toBe('error');
      expect(finding.message).toMatch(/Sektion 3 ohne Nummernfeld enthält Normtext .*\[term:515151 · https:\/\/recht\.nrw\.de\/lrgv\/rechtsverordnung\/30032018-testverordnung-nordrhein-westfalen-testvo-nrw · Phase parse-source-format · Quelle sha256 [0-9a-f]{16}\]$/u);
      expect(structure.reviewItems.map((item) => item.category)).toContain('unknown-structure');
      expect(structure.integrity?.fetchParse.ok).toBe(true);
    } finally {
      await rm(join(fixtures, '.tmp-pdf-only.html'), { force: true });
      await rm(join(fixtures, '.tmp-unnumbered.html'), { force: true });
      await rm(isolated, { recursive: true, force: true });
    }
  });

  it('bricht bei Vorschriften außerhalb von LRGV und bei Datenfehlern fail-closed ab', async () => {
    const outside = await importRechtNrwNorm({ url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/irgendwas', root, fetcher: fakeFetcher({}), now });
    expect(outside.status).toBe('failed');
    expect(outside.findings[0]?.code).toBe('not-lrgv');
    const invalid = await importRechtNrwNorm({ url: 'https://example.org/lrgv/gesetz/01012020-x', root, fetcher: fakeFetcher({}), now });
    expect(invalid.findings[0]?.code).toBe('invalid-url');
    const broken = (await readFile(join(fixtures, 'version-page-native.html'), 'utf8')).replace('<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div>', '<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div><div class="info-box-item"><div class="field__label">Gültig bis</div><div class="field__item"> 29.03.2018 </div></div>');
    await writeFile(join(fixtures, '.tmp-broken.html'), broken);
    try {
      const failed = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-broken.html' }), now });
      expect(failed.status).toBe('needs-review');
      expect(failed.findings[0]?.code).toBe('selection-inconsistent-interval');
      // Die Norm wurde im vorigen Test bereits übernommen: Manifest und Inhalt bleiben beim übernommenen Stand.
      expect(failed.findings.map((finding) => finding.code)).toContain('import-regression');
      expect(failed.manifestEntry).toMatchObject({ sourceIdentity: 'term:515151', importStatus: 'imported-with-warnings', targetSlug: 'testvo-west' });
      expect(failed.reviewItems.map((item) => item.category)).toEqual(expect.arrayContaining(['version-selection', 'other']));

      // Bulk-Fall (Regression): Der Runner übergibt für einen erst im Lauf aufgelösten Slug-Stamm ein leeres
      // Manifest. Der gespeicherte Stand muss trotzdem gefunden werden, sonst überschreibt der Fehlschlag ihn.
      const emptyManifest = { schemaVersion: 'recht-nrw-import-manifest/2' as const, sourceSystem: 'recht-nrw' as const, baselineDate: '2023-12-01', entries: [] };
      const withoutKnownIdentity = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-broken.html' }), write: true, now, manifest: emptyManifest });
      expect(withoutKnownIdentity.findings.map((finding) => finding.code)).toContain('import-regression');
      expect(withoutKnownIdentity.manifestEntry).toMatchObject({ importStatus: 'imported-with-warnings', targetSlug: 'testvo-west' });
      expect((await readManifest(root)).entries.find((entry) => entry.sourceIdentity === 'term:515151')).toMatchObject({ importStatus: 'imported-with-warnings', targetSlug: 'testvo-west' });
      const override = { id: 'test-valid-to', sourceIdentity: 'term:515151', field: 'sourceValidTo' as const, value: null, reason: 'Testentscheidung', evidence: { source: 'Test' }, reviewedAt: '2026-09-15' };
      const overridden = await importRechtNrwNorm({ url: NATIVE_URL, root, fetcher: fakeFetcher({ [NATIVE_URL]: '.tmp-broken.html', [ANNEX_URL]: 'annex.htm', [ANNEX_PDF_URL]: 'annex.pdf' }), now, overrides: [override] });
      expect(overridden.status).toBe('dry-run');
      expect(overridden.findings.some((finding) => finding.code === 'override-applied')).toBe(true);
      expect(overridden.manifestEntry?.overrides).toEqual([{ id: 'test-valid-to', field: 'sourceValidTo', value: null, reason: 'Testentscheidung', evidence: { source: 'Test' }, reviewedAt: '2026-09-15' }]);
    } finally {
      await rm(join(fixtures, '.tmp-broken.html'), { force: true });
    }
  });
});
