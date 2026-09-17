/**
 * Dry-run-Sicherheit des Bulkimports: `bulk` ohne `--write` erzeugt keinerlei persistente Mutation – weder Inhalte,
 * Manifest, Review-Dateien, Slug-Registry, Enumeration, Evidenz- oder Unresolved-Datensätze noch Staging, R2-Transport
 * oder Laufzusammenfassung – auch nicht mit --retry-failed/--retry-review/--regenerate-stale/--only. Einzige, bewusste
 * Ausnahme: der Abruf-Cache (`.cache/recht-nrw/`, außerhalb des Ausgaberoots), damit ein späterer Schreiblauf netzfrei
 * denselben Quellstand verarbeitet. Standardverarbeitung über die synthetische LRGV-Quelle, kein Netz.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createR2Archive } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { defaultItemProcessor, runBulkImport, RUNS_DIR } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { buildEnumeration, enumerationPath, writeEnumeration, type SearchHit } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { loadImportEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { createRechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { IMPORT_DATA_DIR, readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { createMemoryR2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { readReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { syntheticFetch, syntheticLrgvSource } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { SLUG_REGISTRY_PATH } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';

import { cleanupTempBases, enumerationOnDisk, exists, fixedNow, listFiles, snapshot, statusCounts, tempBase } from '../helpers/recht-nrw-bulk-stub.ts';

const repoRoot = process.cwd();
const noSleep = async (): Promise<void> => undefined;
const NOTICE_URL = 'https://recht.nrw.de/lrgv/bekanntmachung/01012021-bekanntmachung-inkrafttreten-staatsvertrag-synthetik';

afterAll(cleanupTempBases);

describe('Bulk-Runner: Dry-run erzeugt keine persistente Mutation', () => {
  it('Standardverarbeitung (R2 verzögert, echter Fetcher mit Cache): Ausgaberoot byteidentisch, kein Staging, kein Transportzugriff, keine Laufzusammenfassung; nur der Cache wird befüllt', { timeout: 60_000 }, async () => {
    const base = await tempBase('recht-nrw-dry-run-');
    const root = join(base, 'root');
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await mkdir(join(root, IMPORT_DATA_DIR), { recursive: true });
    await cp(join(repoRoot, IMPORT_DATA_DIR, 'institution-mapping.json'), join(root, IMPORT_DATA_DIR, 'institution-mapping.json'));
    const template = await readFile(join(repoRoot, 'tests', 'fixtures', 'recht-nrw', 'version-page-native.html'), 'utf8');
    const source = syntheticLrgvSource(template, 6, { collideEvery: 3 });
    // Zusätzlich eine Bekanntmachung (Evidenzquelle) und eine nicht abrufbare Adresse (failed).
    source.pages.set(NOTICE_URL, template.replace('Testverordnung Nordrhein-Westfalen (TestVO NRW)', 'Bekanntmachung über das Inkrafttreten des Staatsvertrages Synthetik'));
    const missingUrl = 'https://recht.nrw.de/lrgv/gesetz/01012020-fehlendes-gesetz-nrw';
    const hits: SearchHit[] = [...source.search.hits, { nodeId: '777', url: NOTICE_URL, indexType: 'state_law_and_regulations', title: 'Bekanntmachung über das Inkrafttreten des Staatsvertrages Synthetik' }];
    const file = buildEnumeration({ area: 'lrgv', sitemap: { pages: 1, urls: [...source.sitemap.urls, NOTICE_URL, missingUrl] }, search: { total: hits.length, hits }, now: fixedNow().toISOString() });
    // Vorhandener Bearbeitungsstand, damit auch Retry-Auswahlen greifen: ein Eintrag failed, einer review.
    const failedKey = file.items.find((item) => item.urls.includes(missingUrl))!.key;
    Object.assign(file.items.find((item) => item.key === failedKey)!, { status: 'failed', attempts: 1, lastError: { code: 'fetch-not-found', message: 'HTTP 404' } });
    await writeEnumeration(root, file);
    // Fremde Steuerdateien, die ein Schreiblauf anfassen würde: Slug-Registry, Manifest-/Review-Verzeichnisse.
    await writeFile(join(root, SLUG_REGISTRY_PATH), JSON.stringify({ schemaVersion: 'recht-nrw-slug-registry/1', jurisdiction: 'west', entries: [] }));
    const before = await snapshot(root);
    const enumerationBytes = await readFile(join(root, enumerationPath('lrgv')));

    const stagingDir = join(base, 'staging');
    const cacheDir = join(base, 'cache');
    const transport = createMemoryR2Transport();
    const archive = createR2Archive({ root, stagingDir, transport, upload: 'immediate' });
    const fetchImplementation = syntheticFetch(source.pages);
    const manifest = await readManifest(root);
    const environment = await loadImportEnvironment(root, { mode: 'bulk', archive, stagingDir, projection: 'record-only', manifest });
    const runs: Array<Record<string, unknown>> = [
      { resume: false },
      { resume: true, retryFailed: true, retryReview: true, regenerateStale: true },
      { resume: false, only: [failedKey, 'term:900002'] },
    ];
    let cacheFilesAfterFirst = 0;
    for (const [index, options] of runs.entries()) {
      const fetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, fetchImplementation });
      const { summary, enumeration } = await runBulkImport({ root, area: 'lrgv', write: false, resume: false, fetcher, environment, manifest, reviewQueue: await readReviewQueue(root), processor: defaultItemProcessor, now: fixedNow, runId: `dry-${index}`, ...options });
      expect(summary.mode).toBe('dry-run');
      expect(['completed', 'nothing-to-do']).toContain(summary.runStatus);
      if (index === 0) {
        expect(summary.processed).toBe(7);
        expect(summary.outcomes).toMatchObject({ dryRun: 6, excluded: 1, failed: 0 });
        expect(summary.network.requests).toBe(6 * 3 + 1);
        // Nur im Speicher: die Enumeration des Laufs trägt Ergebnisse, die Datei nicht.
        expect(statusCounts(enumeration)).toEqual({ done: 6, excluded: 1, failed: 1 });
        cacheFilesAfterFirst = (await listFiles(cacheDir)).length;
        expect(cacheFilesAfterFirst).toBeGreaterThan(0);
      } else if (index === 1) {
        // Retry des fehlgeschlagenen Eintrags: genau ein Abruf (HTTP 404, negativ gecacht), sonst alles aus dem Cache.
        expect(summary.network.requests).toBe(1);
        expect(summary.outcomes.failed).toBe(1);
        expect((await listFiles(cacheDir)).length).toBe(cacheFilesAfterFirst + 1);
      } else {
        // Wiederholungen laufen netzfrei aus dem Cache (auch die 404-Antwort); der Cache wächst nicht.
        expect(summary.network.requests).toBe(0);
        expect((await listFiles(cacheDir)).length).toBe(cacheFilesAfterFirst + 1);
      }
      // Keine persistente Mutation im Ausgaberoot.
      expect(await snapshot(root)).toEqual(before);
      expect(Buffer.compare(await readFile(join(root, enumerationPath('lrgv'))), enumerationBytes)).toBe(0);
      expect(statusCounts(await enumerationOnDisk(root))).toEqual({ pending: 7, failed: 1 });
      expect(await readdir(join(root, 'content', 'norms', 'west'))).toEqual([]);
      expect((await readManifest(root)).entries).toEqual([]);
      expect((await readReviewQueue(root)).items).toEqual([]);
      for (const relative of [join(IMPORT_DATA_DIR, 'manifest'), join(IMPORT_DATA_DIR, 'review'), join(IMPORT_DATA_DIR, 'evidence'), join('data', 'audits', 'recht-nrw', 'lrgv', 'unresolved'), RUNS_DIR]) expect(await exists(join(root, relative)), relative).toBe(false);
      expect(await exists(stagingDir)).toBe(false);
      expect(transport.objects.size).toBe(0);
      expect(transport.calls).toEqual([]);
      expect(environment.archive.stats).toEqual({ stored: 0, uploaded: 0, verified: 0, alreadyPresent: 0 });
      // Slugreservierungen laufen im Dry-run nur im Speicher (deterministische Kollisionsauflösung); die Datei bleibt leer.
      expect(JSON.parse(await readFile(join(root, SLUG_REGISTRY_PATH), 'utf8')).entries).toEqual([]);
    }
    // Der Cache liegt außerhalb des Ausgaberoots und enthält nur Abrufe (Bytes + Metadaten), keine Importergebnisse.
    const cached = await listFiles(cacheDir);
    expect(cached.every((name) => /\.(?:bin|json)$/u.test(name))).toBe(true);
    expect((await listFiles(base)).filter((path) => !path.startsWith('root/') && !path.startsWith('cache/'))).toEqual([]);
  });
});
