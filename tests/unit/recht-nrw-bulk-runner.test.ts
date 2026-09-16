/**
 * Bulk-Runner des RECHT.NRW-Imports ohne Netz: Dry-run, Checkpoints, Resume, SIGINT-Pfad, Auswahl
 * (limit/only/retry), Budget, Sperrantworten, systemische Abbrüche, Determinismus, Laufzusammenfassung und
 * Skalierung. Verarbeitung überwiegend über eine günstige Stub-Verarbeitung, zusätzlich ein End-to-End-Lauf
 * mit der Standardverarbeitung über die synthetische LRGV-Quelle. Alle Schreibvorgänge in temporären Roots.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ArchiveError, createR2Archive } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import { CorruptStateError } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import {
  createStopController,
  currentParserVersion,
  defaultItemProcessor,
  RUN_STATUSES,
  RUN_SUMMARY_SCHEMA,
  runBulkImport,
  runIdFor,
  RUNS_DIR,
  RUNTIME_METADATA_FIELDS,
  withoutRuntimeMetadata,
  type BulkRunOptions,
  type ItemOutcome,
  type ItemProcessor,
  type ProcessorContext,
} from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { buildEnumeration, enumerationPath, readEnumeration, writeEnumeration, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { createTestEnvironment, loadImportEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { createRechtNrwFetcher, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { AUDIT_DIR, emptyManifest, IMPORT_DATA_DIR, MANIFEST_DIR, manifestEntryPath, readManifest, writeManifestEntry, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { NORM_BACKUP_PREFIX, NORM_TEMP_PREFIX } from '@landesrecht/importer-recht-nrw/common/persist.ts';
import { createMemoryR2Transport, type MemoryR2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { mergeReviewItems, readReviewQueue, REVIEW_DIR, reviewShardPath, writeReviewShard, type ReviewItem } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { SYNTHETIC_TERM_BASE, syntheticFetch, syntheticLrgvSource } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { readSlugRegistry } from '@landesrecht/importer-recht-nrw/common/slug-registry.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

const repoRoot = process.cwd();
const NOW = new Date('2026-09-15T12:00:00.000Z');
const fixedNow = (): Date => NOW;
const noSleep = async (): Promise<void> => undefined;

const bases: string[] = [];
async function tempBase(prefix = 'recht-nrw-bulk-runner-'): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), prefix));
  bases.push(base);
  return base;
}
afterAll(async () => {
  for (const base of bases.splice(0)) await rm(base, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------------------------ */
/* Hilfen                                                                                       */

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(path, root)));
    else output.push(relative(root, path));
  }
  return output.sort();
}

async function snapshot(root: string, skip: (path: string) => boolean = () => false): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of await listFiles(root)) if (!skip(path)) map.set(path, await readFile(join(root, path), 'utf8'));
  return map;
}

/** Fachlicher Vergleichsstand: JSON außerhalb von `content/` ohne Laufmetadaten, Inhalte als Text. */
async function comparable(root: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of await listFiles(root)) {
    if (path.startsWith(`${RUNS_DIR}/`)) continue;
    const text = await readFile(join(root, path), 'utf8');
    map.set(path, path.endsWith('.json') && !path.startsWith('content/') ? withoutRuntimeMetadata(JSON.parse(text)) : text);
  }
  return map;
}

async function prepareRoot(count: number, options: { collideEvery?: number; template?: string } = {}): Promise<{ base: string; root: string; order: string[]; source: ReturnType<typeof syntheticLrgvSource> }> {
  const base = await tempBase();
  const root = join(base, 'root');
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  const source = syntheticLrgvSource(options.template ?? '<html>synthetisch</html>', count, options.collideEvery !== undefined ? { collideEvery: options.collideEvery } : {});
  const file = buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, now: NOW.toISOString() });
  await writeEnumeration(root, file);
  return { base, root, order: file.items.map((item) => item.key), source };
}

async function enumerationOnDisk(root: string): Promise<EnumerationFile> {
  const file = await readEnumeration(root, 'lrgv');
  if (!file) throw new Error('Enumeration fehlt');
  return file;
}

function statusCounts(file: EnumerationFile): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of file.items) if (!item.mergedInto) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function indexOf(key: string): number {
  const match = /synthetikverordnung-(\d+)-/u.exec(key);
  if (!match) throw new Error(`kein synthetischer Schlüssel: ${key}`);
  return Number(match[1]);
}

function termOf(item: Pick<EnumerationItem, 'key'>): string {
  return `term:${SYNTHETIC_TERM_BASE + indexOf(item.key)}`;
}

function stubManifestEntry(input: { item: EnumerationItem; sourceIdentity: string; slug: string; importStatus: ManifestEntry['importStatus']; runId: string; now: string }): ManifestEntry {
  const { item, now } = input;
  return {
    sourceSystem: 'recht-nrw',
    sourceArea: 'lrgv',
    sourceDocumentType: 'rechtsverordnung',
    sourceIdentity: input.sourceIdentity,
    sourceTitle: item.title,
    sourceType: 'rechtsverordnung',
    sourceUrl: item.entryUrl,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${input.sourceIdentity.slice('term:'.length)}`,
    sourceVersion: { url: item.entryUrl, validFrom: '2018-03-30', validTo: null },
    selectedVersionUrl: item.entryUrl,
    sourceValidFrom: '2018-03-30',
    sourceValidTo: null,
    baselineStatus: 'active-at-baseline',
    validityEvidence: [],
    retrievedAt: now,
    sha256: createHash('sha256').update(item.key).digest('hex'),
    contentType: 'text/html; charset=UTF-8',
    contentFormat: 'native',
    parserVersion: currentParserVersion('lrgv'),
    transformerVersion: TRANSFORMER_VERSION,
    targetJurisdiction: 'west',
    targetSlug: input.slug,
    baselineDate: '2023-12-01',
    importStatus: input.importStatus,
    reviewStatus: input.importStatus === 'needs-review' ? 'open' : 'none',
    reconstructionStatus: 'direct',
    reconstructionSources: [],
    reconstructionSteps: [],
    importedAt: now,
    runId: input.runId,
    rawDocuments: [],
    versionsConsidered: [],
    overrides: [],
    findings: [],
    integrity: { fetchParse: true, sourceCanonical: true },
    transformation: { changes: 0, unresolved: 0 },
  };
}

interface Decision {
  status: ItemOutcome['status'];
  code?: string;
}

interface StubHooks {
  decide?: (item: EnumerationItem, call: number) => Decision;
  before?: (item: EnumerationItem, context: ProcessorContext, call: number) => void | Promise<void>;
  versionUrls?: (item: EnumerationItem) => string[];
}

/**
 * Günstige Verarbeitung mit echten Checkpoints: Manifesteintrag und Review-Datei je Stammnorm (nur im
 * Schreiblauf), Ergebnis mit Quellidentität und Fassungsliste wie die Importpfade.
 */
function stubProcessor(hooks: StubHooks = {}): { processor: ItemProcessor; calls: string[] } {
  const calls: string[] = [];
  const processor: ItemProcessor = async (item, context) => {
    calls.push(item.key);
    await hooks.before?.(item, context, calls.length);
    const decision = hooks.decide?.(item, calls.length) ?? { status: 'done' };
    const sourceIdentity = termOf(item);
    const slug = `synth-${indexOf(item.key)}-west`;
    const outcome: ItemOutcome = { status: decision.status, importStatus: 'imported', sourceIdentity, versionUrls: hooks.versionUrls?.(item) ?? [...item.urls] };
    if (decision.status === 'failed') {
      outcome.importStatus = 'failed';
      outcome.errorCodes = [decision.code ?? 'synthetic-failure'];
      outcome.message = `synthetischer Fehler ${decision.code ?? ''}`.trim();
      return outcome;
    }
    if (decision.status === 'excluded') {
      outcome.importStatus = 'excluded';
      return outcome;
    }
    const importStatus: ManifestEntry['importStatus'] = decision.status === 'review' ? 'needs-review' : 'imported';
    const entry = stubManifestEntry({ item, sourceIdentity, slug: decision.status === 'review' ? '' : slug, importStatus, runId: context.runId, now: context.now().toISOString() });
    outcome.importStatus = importStatus;
    outcome.manifestEntry = entry;
    if (decision.status === 'done') outcome.targetSlug = slug;
    if (decision.status === 'review') {
      const queue = mergeReviewItems(context.reviewQueue, { sourceArea: 'lrgv', sourceIdentity, sourceUrl: item.entryUrl, now: context.now().toISOString() }, [{ category: 'other', key: 'synthetic', severity: 'blocking', summary: 'Synthetischer Review-Fall', details: [item.key] }]);
      const reviewItems: ReviewItem[] = queue.items;
      outcome.reviewCategories = ['other'];
      outcome.reviewItems = reviewItems;
      if (context.write) await writeReviewShard(context.root, queue, 'lrgv', sourceIdentity);
    }
    if (context.write) await writeManifestEntry(context.root, entry);
    return outcome;
  };
  return { processor, calls };
}

function noNetworkFetcher(): RechtNrwFetcher {
  return {
    stats: { networkRequests: 0, cacheHits: 0 },
    fetch: async (url) => {
      throw new Error(`unerwarteter Abruf ${url}`);
    },
  };
}

function runOptions(root: string, overrides: Partial<BulkRunOptions> & Pick<BulkRunOptions, 'processor'>): BulkRunOptions {
  return { root, area: 'lrgv', write: true, resume: false, fetcher: noNetworkFetcher(), environment: createTestEnvironment(root), now: fixedNow, ...overrides };
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
}

function hangingResponse(init: RequestInit | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

const tempLeftovers = async (root: string): Promise<string[]> => (await listFiles(root)).filter((path) => path.includes('.tmp-') || path.includes(NORM_BACKUP_PREFIX));

/* ------------------------------------------------------------------------------------------ */

describe('Bulk-Runner: Abtrennung fremder Adressen (Regression)', () => {
  /**
   * Regression aus dem echten LRGV-Bulk: Der Schlüssel eines abgetrennten Eintrags trug bei jeder Verarbeitung
   * ein weiteres „@datum“; die Dublettenprüfung griff nie, die Enumeration wuchs unbegrenzt (4 642 statt 3 342
   * Einträge, Schlüssel mit 13 Segmenten) und der Lauf terminierte nicht.
   */
  it('hält den Schlüssel stabil und terminiert: keine Mehrfachsuffixe, keine wachsende Enumeration', async () => {
    const { root } = await prepareRoot(3);
    const seeded = await enumerationOnDisk(root);
    // Dritte Fassungsadresse je Stammnorm, damit auch ein abgetrennter Eintrag erneut abtrennen kann.
    for (const item of seeded.items) item.urls = [...new Set([...item.urls, item.urls[0]!.replace(/\/\d{8}-/u, '/01012010-')])].sort();
    await writeEnumeration(root, seeded);

    const onlyFirstUrl = (item: EnumerationItem): string[] => [item.urls[0]!];
    const first = await runBulkImport(runOptions(root, { processor: stubProcessor({ versionUrls: onlyFirstUrl }).processor, runId: 'split-1' }));
    expect(first.summary.outcomes.split).toBe(3);
    const afterFirst = await enumerationOnDisk(root);
    expect(afterFirst.items).toHaveLength(6);
    expect(statusCounts(afterFirst)).toMatchObject({ pending: 3 });

    const second = await runBulkImport(runOptions(root, { processor: stubProcessor({ versionUrls: onlyFirstUrl }).processor, resume: true, runId: 'split-2' }));
    expect(second.summary.runStatus).toBe('completed');
    const afterSecond = await enumerationOnDisk(root);
    expect(afterSecond.items.every((item) => (item.key.match(/@/gu) ?? []).length <= 1)).toBe(true);

    // Dritter Lauf: nichts mehr offen, keine weiteren Einträge – die Kette terminiert.
    const third = await runBulkImport(runOptions(root, { processor: stubProcessor({ versionUrls: onlyFirstUrl }).processor, resume: true, runId: 'split-3' }));
    expect(third.summary.outcomes.split).toBe(0);
    const afterThird = await enumerationOnDisk(root);
    expect(afterThird.items).toHaveLength(afterSecond.items.length);
    expect(statusCounts(afterThird).pending).toBeUndefined();
  });

  /**
   * Regression aus dem echten LRGV-Bulk: `--retry-failed` wählt ausschließlich fehlgeschlagene Stammnormen aus.
   * Bleiben deren Fehler reproduzierbar, meldete die Systemerkennung nach 20 Wiederholungen „aborted-systemic“ und
   * brach ab; die übrigen Einträge wurden nie erneut versucht.
   */
  it('bricht bei --retry-failed nicht systemisch ab, wenn sich bekannte Fehler wiederholen', async () => {
    const { root } = await prepareRoot(60);
    const everyThird = (item: EnumerationItem): { status: ItemOutcome['status']; code?: string } => (indexOf(item.key) % 3 === 0 ? { status: 'failed', code: 'quellfall' } : { status: 'done' });
    const base = await runBulkImport(runOptions(root, { processor: stubProcessor({ decide: everyThird }).processor, runId: 'retry-basis' }));
    expect(base.summary).toMatchObject({ runStatus: 'completed', processed: 60 });
    expect(base.summary.outcomes.failed).toBe(20);

    const retry = await runBulkImport(runOptions(root, { processor: stubProcessor({ decide: () => ({ status: 'failed', code: 'quellfall' }) }).processor, resume: true, retryFailed: true, runId: 'retry-lauf' }));
    expect(retry.summary).toMatchObject({ runStatus: 'completed', selected: 20, processed: 20 });
    expect((await enumerationOnDisk(root)).items.filter((item) => item.status === 'failed').every((item) => item.attempts === 2)).toBe(true);

    // Neue Fehlschläge in Folge lösen weiterhin den systemischen Abbruch aus.
    const fresh = await prepareRoot(40);
    const systemic = await runBulkImport(runOptions(fresh.root, { processor: stubProcessor({ decide: () => ({ status: 'failed', code: 'portalstruktur' }) }).processor, runId: 'systemisch' }));
    expect(systemic.summary.runStatus).toBe('aborted-systemic');
  });
});

describe('Bulk-Runner: Dry-run und Schreiblauf', () => {
  it('schreibt im Dry-run nichts: Enumeration bytegleich, keine Manifest- oder Review-Dateien, keine Laufzusammenfassung', async () => {
    const { root } = await prepareRoot(100);
    const enumerationFile = join(root, enumerationPath('lrgv'));
    const bytes = await readFile(enumerationFile);
    const before = await snapshot(root);
    const stub = stubProcessor({ decide: (item) => (indexOf(item.key) % 10 === 0 ? { status: 'review' } : { status: 'done' }) });
    const { summary, enumeration } = await runBulkImport(runOptions(root, { write: false, processor: stub.processor }));
    expect(summary).toMatchObject({ mode: 'dry-run', runStatus: 'completed', selected: 100, processed: 100 });
    expect(summary.outcomes).toMatchObject({ imported: 90, review: 10, failed: 0 });
    expect(stub.calls).toHaveLength(100);
    // Nur im Speicher fortgeschrieben.
    expect(statusCounts(enumeration)).toEqual({ done: 90, review: 10 });
    expect(Buffer.compare(await readFile(enumerationFile), bytes)).toBe(0);
    expect(await snapshot(root)).toEqual(before);
    for (const directory of [MANIFEST_DIR, REVIEW_DIR, RUNS_DIR]) expect(await exists(join(root, directory))).toBe(false);
    expect(statusCounts(await enumerationOnDisk(root))).toEqual({ pending: 100 });
  });

  it('schreibt im Schreiblauf je Stammnorm Checkpoint processing, Ergebnis, Manifest- und Review-Datei', async () => {
    const { root, order } = await prepareRoot(30);
    const checkpoints: Array<{ call: number; current: string; previous?: string }> = [];
    const stub = stubProcessor({
      decide: (item) => (indexOf(item.key) % 10 === 0 ? { status: 'review' } : { status: 'done' }),
      before: async (item, _context, call) => {
        if (call !== 1 && call !== 15 && call !== 30) return;
        const onDisk = await enumerationOnDisk(root);
        const current = onDisk.items.find((entry) => entry.key === item.key)!;
        const previous = call > 1 ? onDisk.items.find((entry) => entry.key === order[call - 2]) : undefined;
        checkpoints.push({ call, current: current.status, ...(previous ? { previous: previous.status } : {}) });
      },
    });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, runId: 'schreiblauf' }));
    expect(summary).toMatchObject({ mode: 'write', runStatus: 'completed', selected: 30, processed: 30 });
    expect(summary.outcomes).toMatchObject({ imported: 27, review: 3 });
    expect(checkpoints.map((entry) => [entry.call, entry.current])).toEqual([[1, 'processing'], [15, 'processing'], [30, 'processing']]);
    expect(checkpoints.slice(1).every((entry) => entry.previous === 'done' || entry.previous === 'review')).toBe(true);

    const onDisk = await enumerationOnDisk(root);
    expect(statusCounts(onDisk)).toEqual({ done: 27, review: 3 });
    expect(onDisk.items.every((item) => item.attempts === 1 && item.lastRunId === 'schreiblauf' && item.sourceIdentity === termOf(item))).toBe(true);
    expect(onDisk.items.find((item) => indexOf(item.key) === 3)?.outcome).toEqual({ importStatus: 'imported', targetSlug: 'synth-3-west', parserVersion: currentParserVersion('lrgv'), transformerVersion: TRANSFORMER_VERSION });
    expect((await readManifest(root)).entries).toHaveLength(30);
    expect((await readReviewQueue(root)).items).toHaveLength(3);
    expect(await exists(join(root, RUNS_DIR, 'schreiblauf.json'))).toBe(true);
    expect(await tempLeftovers(root)).toEqual([]);

    // Ohne --resume verweigert der Runner einen weiteren Schreiblauf über vorhandenem Fortschritt.
    await expect(runBulkImport(runOptions(root, { processor: stubProcessor().processor }))).rejects.toThrow(/--resume/u);
    // Die Enumeration ist Pflicht.
    const empty = await tempBase();
    await expect(runBulkImport(runOptions(empty, { processor: stubProcessor().processor }))).rejects.toThrow(/Keine Enumeration/u);
  });
});

describe('Bulk-Runner: Resume', () => {
  it('Resume: Abbruch nach 37 von 100, Fortsetzung ab Eintrag 38 ohne Doppelverarbeitung und ohne verlorene Manifesteinträge', async () => {
    const { root, order } = await prepareRoot(100);
    const stop = createStopController();
    const first = stubProcessor({ decide: (item) => (indexOf(item.key) % 25 === 0 ? { status: 'review' } : { status: 'done' }), before: (_item, _context, call) => { if (call === 37) stop.requestStop(); } });
    const interrupted = await runBulkImport(runOptions(root, { processor: first.processor, stop, runId: 'resume-1' }));
    expect(interrupted.summary).toMatchObject({ runStatus: 'interrupted', selected: 100, processed: 37 });
    expect(first.calls).toEqual(order.slice(0, 37));
    const afterStop = await enumerationOnDisk(root);
    expect(statusCounts(afterStop).processing).toBeUndefined();
    expect(afterStop.items.filter((item) => item.status === 'pending').map((item) => item.key)).toEqual(order.slice(37));
    expect((await readManifest(root)).entries).toHaveLength(37);

    const second = stubProcessor({ decide: (item) => (indexOf(item.key) % 25 === 0 ? { status: 'review' } : { status: 'done' }) });
    const resumed = await runBulkImport(runOptions(root, { processor: second.processor, resume: true, runId: 'resume-2' }));
    expect(resumed.summary).toMatchObject({ runStatus: 'completed', selected: 63, processed: 63 });
    expect(second.calls[0]).toBe(order[37]);
    expect(second.calls).toEqual(order.slice(37));
    const all = [...first.calls, ...second.calls];
    expect(all).toHaveLength(100);
    expect(new Set(all).size).toBe(100);

    const manifest = await readManifest(root);
    expect(manifest.entries.map((entry) => entry.sourceIdentity)).toEqual(Array.from({ length: 100 }, (_value, index) => `term:${SYNTHETIC_TERM_BASE + index + 1}`));
    expect((await readdir(join(root, MANIFEST_DIR, 'lrgv'))).filter((file) => file.endsWith('.json'))).toHaveLength(100);
    expect((await readReviewQueue(root)).items.map((item) => item.sourceIdentity)).toEqual(['term:900025', 'term:900050', 'term:900075', 'term:900100']);
    const final = await enumerationOnDisk(root);
    expect(statusCounts(final)).toEqual({ done: 96, review: 4 });
    expect(final.items.every((item) => item.attempts === 1)).toBe(true);
    expect(final.items.filter((item) => item.lastRunId === 'resume-1').map((item) => item.key).sort()).toEqual(order.slice(0, 37).sort());
    const dataFiles = (await listFiles(join(root, 'data'))).filter((file) => file.endsWith('.json'));
    expect(dataFiles.length).toBe(100 + 4 + 2 + 1);
    for (const path of dataFiles) expect(typeof JSON.parse(await readFile(join(root, 'data', path), 'utf8'))).toBe('object');
    expect(await tempLeftovers(root)).toEqual([]);
    expect((await readdir(join(root, RUNS_DIR))).sort()).toEqual(['resume-1.json', 'resume-2.json']);

    const again = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, resume: true, runId: 'resume-3' }));
    expect(again.summary).toMatchObject({ runStatus: 'nothing-to-do', selected: 0, processed: 0 });
  });

  it('Resume nach hartem Abbruch: Eintrag im Status processing wird erneut verarbeitet, Temp- und Sicherungsreste werden bereinigt', async () => {
    const { root, order } = await prepareRoot(10);
    const limited = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, limit: 4, runId: 'hart-1' }));
    expect(limited.summary.runStatus).toBe('limit-reached');
    // Absturz simulieren: Checkpoint „processing“ geschrieben, Arbeit nicht abgeschlossen, Temp-Reste liegen herum.
    const crashed = await enumerationOnDisk(root);
    crashed.items.find((item) => item.key === order[7])!.status = 'processing';
    await writeEnumeration(root, crashed);
    await writeFile(join(root, MANIFEST_DIR, 'lrgv', '.tmp-term-900008.json-4711-deadbeef'), '{"halb');
    await mkdir(join(root, AUDIT_DIR), { recursive: true });
    await writeFile(join(root, AUDIT_DIR, '.tmp-bericht.json-4711-deadbeef'), '{');
    await mkdir(join(root, 'content', 'norms', 'west', `${NORM_TEMP_PREFIX}synth-8-west-4711-deadbeef`, 'versions'), { recursive: true });
    await writeFile(join(root, 'content', 'norms', 'west', `${NORM_TEMP_PREFIX}synth-8-west-4711-deadbeef`, 'meta.json'), '{}');
    await mkdir(join(root, 'content', 'norms', 'west', `${NORM_BACKUP_PREFIX}alt-west-4711-deadbeef`), { recursive: true });
    await writeFile(join(root, 'content', 'norms', 'west', `${NORM_BACKUP_PREFIX}alt-west-4711-deadbeef`, 'meta.json'), '{"slug":"alt-west"}');

    const logs: string[] = [];
    const resumed = stubProcessor();
    const run = await runBulkImport(runOptions(root, { processor: resumed.processor, resume: true, runId: 'hart-2', log: (line) => logs.push(line) }));
    expect(run.summary).toMatchObject({ runStatus: 'completed', selected: 6, processed: 6 });
    expect(resumed.calls).toEqual(order.slice(4));
    expect(logs.some((line) => line.startsWith('Wiederherstellung: wiederhergestellt alt-west'))).toBe(true);
    expect(logs.filter((line) => line.startsWith('Temp-Datei entfernt:'))).toHaveLength(2);
    expect(await readFile(join(root, 'content', 'norms', 'west', 'alt-west', 'meta.json'), 'utf8')).toBe('{"slug":"alt-west"}');
    expect(await tempLeftovers(root)).toEqual([]);
    const final = await enumerationOnDisk(root);
    expect(statusCounts(final)).toEqual({ done: 10 });
    expect(final.items.find((item) => item.key === order[7])).toMatchObject({ status: 'done', attempts: 1, lastRunId: 'hart-2' });
    expect((await readManifest(root)).entries).toHaveLength(10);
  });
});

describe('Bulk-Runner: SIGINT', () => {
  it('SIGINT: erstes Signal beendet den Lauf nach der laufenden Stammnorm (interrupted); die Stammnorm ist vollständig geschrieben', async () => {
    const { root, order } = await prepareRoot(10);
    const stop = createStopController();
    expect(stop.stopRequested).toBe(false);
    const stub = stubProcessor({ before: (_item, _context, call) => { if (call === 3) stop.requestStop(); } });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, stop, runId: 'sigint-1' }));
    expect(summary.runStatus).toBe('interrupted');
    expect(summary.processed).toBe(3);
    expect(summary.stopReason).toContain('Abbruchsignal');
    expect(stop.stopRequested).toBe(true);
    expect(stop.abort.signal.aborted).toBe(false);
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[2])).toMatchObject({ status: 'done', attempts: 1 });
    expect(statusCounts(onDisk)).toEqual({ done: 3, pending: 7 });
    expect((await readManifest(root)).entries.map((entry) => entry.sourceIdentity).sort()).toEqual(order.slice(0, 3).map((key) => termOf({ key })).sort());
    const written = JSON.parse(await readFile(join(root, RUNS_DIR, 'sigint-1.json'), 'utf8')) as { runStatus: string; stopReason: string };
    expect(written).toMatchObject({ runStatus: 'interrupted', stopReason: summary.stopReason });

    // Signal schon vor dem Start: keine Stammnorm wird angefasst.
    const early = createStopController();
    early.requestStop();
    const untouched = stubProcessor();
    const earlyRun = await runBulkImport(runOptions(root, { processor: untouched.processor, stop: early, resume: true, runId: 'sigint-2' }));
    expect(earlyRun.summary).toMatchObject({ runStatus: 'interrupted', processed: 0, selected: 7 });
    expect(untouched.calls).toEqual([]);
  });

  it('SIGINT: zweites Signal bricht den laufenden Abruf ab; die Stammnorm geht zurück auf pending und wird beim Resume verarbeitet', async () => {
    const { base, root, order } = await prepareRoot(10);
    const cacheDir = join(base, 'cache');
    const stop = createStopController();
    let requests = 0;
    const hangingFetch = ((_input: string | URL | Request, init?: RequestInit) => {
      requests += 1;
      if (requests === 4) {
        setTimeout(() => {
          stop.requestStop();
          expect(stop.abort.signal.aborted).toBe(false);
          stop.requestStop();
        }, 1);
        return hangingResponse(init);
      }
      return Promise.resolve(html('<html>ok</html>'));
    }) as typeof fetch;
    const fetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, timeoutMs: 60_000, signal: stop.abort.signal, fetchImplementation: hangingFetch });
    const fetching = stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const { summary } = await runBulkImport(runOptions(root, { processor: fetching.processor, fetcher, stop, runId: 'sigint-abort' }));
    expect(stop.abort.signal.aborted).toBe(true);
    expect(summary.runStatus).toBe('interrupted');
    expect(summary.processed).toBe(3);
    expect(summary.stopReason).toContain('[interrupted]');
    expect(summary.network.requests).toBe(4);
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[3])).toMatchObject({ status: 'pending', attempts: 0, lastError: { code: 'interrupted' } });
    expect(statusCounts(onDisk)).toEqual({ done: 3, pending: 7 });
    expect((await readManifest(root)).entries).toHaveLength(3);
    expect(await tempLeftovers(root)).toEqual([]);

    const resumedFetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, fetchImplementation: (async () => html('<html>ok</html>')) as typeof fetch });
    const resumed = stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const again = await runBulkImport(runOptions(root, { processor: resumed.processor, fetcher: resumedFetcher, resume: true, runId: 'sigint-resume' }));
    expect(again.summary).toMatchObject({ runStatus: 'completed', processed: 7 });
    expect(resumed.calls[0]).toBe(order[3]);
    const final = await enumerationOnDisk(root);
    expect(statusCounts(final)).toEqual({ done: 10 });
    expect(final.items.find((item) => item.key === order[3])?.lastError).toBeUndefined();
  });
});

describe('Bulk-Runner: Auswahl mit limit, only, retryFailed und retryReview', () => {
  it('limit begrenzt die Auswahl (limit-reached) und setzt beim nächsten Lauf fort', async () => {
    const { root, order } = await prepareRoot(20);
    const first = stubProcessor();
    const limited = await runBulkImport(runOptions(root, { processor: first.processor, limit: 5, runId: 'limit-1' }));
    expect(limited.summary).toMatchObject({ runStatus: 'limit-reached', selected: 5, processed: 5 });
    expect(limited.summary.options.limit).toBe(5);
    expect(first.calls).toEqual(order.slice(0, 5));
    const rest = stubProcessor();
    const exact = await runBulkImport(runOptions(root, { processor: rest.processor, limit: 15, resume: true, runId: 'limit-2' }));
    expect(exact.summary).toMatchObject({ runStatus: 'completed', selected: 15, processed: 15 });
    expect(rest.calls).toEqual(order.slice(5));
    const none = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, limit: 5, resume: true, runId: 'limit-3' }));
    expect(none.summary.runStatus).toBe('nothing-to-do');
  });

  it('only wählt Einträge über Schlüssel, Term-ID oder Fassungsadresse – auch erledigte und ohne --resume', async () => {
    const { root, order } = await prepareRoot(20);
    await runBulkImport(runOptions(root, { processor: stubProcessor().processor, runId: 'only-0' }));
    const olderVersionOfNine = 'https://recht.nrw.de/lrgv/rechtsverordnung/18052013-synthetikverordnung-9-nordrhein-westfalen-synthvo9-nrw';
    const selected = stubProcessor();
    const { summary } = await runBulkImport(runOptions(root, { processor: selected.processor, only: [order[2]!, String(SYNTHETIC_TERM_BASE + 5), olderVersionOfNine], runId: 'only-1' }));
    expect(summary).toMatchObject({ runStatus: 'completed', selected: 3, processed: 3 });
    expect(summary.options.only).toEqual([order[2], '900005', olderVersionOfNine]);
    expect(selected.calls.map(indexOf).sort((left, right) => left - right)).toEqual([indexOf(order[2]!), 5, 9].sort((left, right) => left - right));
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.filter((item) => item.attempts === 2).map((item) => indexOf(item.key)).sort((left, right) => left - right)).toEqual([indexOf(order[2]!), 5, 9].sort((left, right) => left - right));
    const unknown = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, only: ['term:1'], runId: 'only-2' }));
    expect(unknown.summary.runStatus).toBe('nothing-to-do');
  });

  it('retryFailed und retryReview wählen fehlgeschlagene bzw. Review-Einträge erneut aus', async () => {
    const { root, order } = await prepareRoot(30);
    const failedKeys = order.filter((key) => indexOf(key) % 10 === 3);
    const reviewKeys = order.filter((key) => indexOf(key) % 10 === 7);
    let healthy = false;
    const decide = (item: EnumerationItem): Decision => {
      if (healthy) return { status: 'done' };
      if (indexOf(item.key) % 10 === 3) return { status: 'failed', code: `synthetic-${indexOf(item.key)}` };
      if (indexOf(item.key) % 10 === 7) return { status: 'review' };
      return { status: 'done' };
    };
    const initial = await runBulkImport(runOptions(root, { processor: stubProcessor({ decide }).processor, runId: 'retry-0' }));
    expect(initial.summary.runStatus).toBe('completed');
    expect(initial.summary.outcomes).toMatchObject({ imported: 24, review: 3, failed: 3 });
    expect(initial.summary.failures.map((failure) => failure.key)).toEqual(failedKeys);
    expect((await enumerationOnDisk(root)).items.find((item) => item.key === failedKeys[0])?.lastError).toEqual({ code: `synthetic-${indexOf(failedKeys[0]!)}`, message: `synthetischer Fehler synthetic-${indexOf(failedKeys[0]!)}` });

    healthy = true;
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor({ decide }).processor, resume: true, runId: 'retry-1' }))).summary.runStatus).toBe('nothing-to-do');

    const retryFailed = stubProcessor({ decide });
    const failedRun = await runBulkImport(runOptions(root, { processor: retryFailed.processor, resume: true, retryFailed: true, runId: 'retry-2' }));
    expect(failedRun.summary).toMatchObject({ runStatus: 'completed', processed: 3 });
    expect(failedRun.summary.options).toMatchObject({ retryFailed: true, retryReview: false });
    expect(retryFailed.calls).toEqual(failedKeys);
    const afterFailed = await enumerationOnDisk(root);
    expect(statusCounts(afterFailed)).toEqual({ done: 27, review: 3 });
    expect(afterFailed.items.filter((item) => item.lastError)).toEqual([]);

    const retryReview = stubProcessor({ decide });
    const reviewRun = await runBulkImport(runOptions(root, { processor: retryReview.processor, resume: true, retryReview: true, runId: 'retry-3' }));
    expect(reviewRun.summary).toMatchObject({ runStatus: 'completed', processed: 3 });
    expect(retryReview.calls).toEqual(reviewKeys);
    expect(statusCounts(await enumerationOnDisk(root))).toEqual({ done: 30 });
    expect((await runBulkImport(runOptions(root, { processor: stubProcessor().processor, resume: true, retryFailed: true, retryReview: true, runId: 'retry-4' }))).summary.runStatus).toBe('nothing-to-do');
  });

  it('regenerateStale wählt erledigte Einträge mit veralteter Parser- oder Transformerversion', async () => {
    const { root, order } = await prepareRoot(10);
    await runBulkImport(runOptions(root, { processor: stubProcessor().processor, runId: 'stale-0' }));
    const manifest = await readManifest(root);
    const staleIdentity = termOf({ key: order[4]! });
    manifest.entries = manifest.entries.map((entry) => (entry.sourceIdentity === staleIdentity ? { ...entry, parserVersion: 'recht-nrw-parser/0.0.1' } : entry));
    const regenerate = stubProcessor();
    const { summary } = await runBulkImport(runOptions(root, { processor: regenerate.processor, resume: true, regenerateStale: true, manifest, runId: 'stale-1' }));
    expect(summary).toMatchObject({ runStatus: 'completed', processed: 1 });
    expect(regenerate.calls).toEqual([order[4]]);
    expect((await readManifest(root)).entries.find((entry) => entry.sourceIdentity === staleIdentity)?.parserVersion).toBe(currentParserVersion('lrgv'));
  });

  it('führt Einträge derselben Stammnorm über die Fassungsliste zusammen und verarbeitet sie nicht erneut', async () => {
    const { root, order } = await prepareRoot(20);
    const onDisk = await enumerationOnDisk(root);
    const first = onDisk.items.find((item) => indexOf(item.key) === 1)!;
    const second = onDisk.items.find((item) => indexOf(item.key) === 2)!;
    const stub = stubProcessor({ versionUrls: (item) => (item.key === first.key ? [...first.urls, ...second.urls] : [...item.urls]) });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, runId: 'merge' }));
    expect(summary).toMatchObject({ runStatus: 'completed', selected: 20, processed: 19 });
    expect(summary.outcomes.merged).toBe(1);
    expect(stub.calls).not.toContain(second.key);
    expect(stub.calls).toEqual(order.filter((key) => key !== second.key));
    const after = await enumerationOnDisk(root);
    expect(after.items.find((item) => item.key === second.key)).toMatchObject({ mergedInto: 'term:900001', status: 'done' });
    expect(after.items.find((item) => item.key === first.key)?.urls).toEqual([...first.urls, ...second.urls].sort());
    expect(summary.enumeration).toMatchObject({ done: 19, pending: 0 });
    const again = await runBulkImport(runOptions(root, { processor: stubProcessor().processor, resume: true, retryFailed: true, retryReview: true, runId: 'merge-2' }));
    expect(again.summary.runStatus).toBe('nothing-to-do');
  });

  it('verarbeitet Beispielkorpus-Einträge mit versionierten Rohquellen nie und übernimmt ihren Manifeststatus in die Enumeration', async () => {
    const { root, order } = await prepareRoot(8);
    const file = await enumerationOnDisk(root);
    const byKey = new Map(file.items.map((item) => [item.key, item]));
    const plan: Array<[number, ManifestEntry['importStatus'], 'versioned' | 'staged']> = [[2, 'imported-with-warnings', 'versioned'], [3, 'not-at-baseline', 'versioned'], [4, 'excluded', 'versioned'], [5, 'needs-review', 'versioned'], [6, 'failed', 'versioned'], [7, 'imported', 'staged']];
    const manifest = emptyManifest();
    for (const [position, importStatus, archiveStatus] of plan) {
      const item = byKey.get(order[position]!)!;
      const sourceIdentity = termOf(item);
      item.sourceIdentity = sourceIdentity;
      const entry = stubManifestEntry({ item, sourceIdentity, slug: importStatus.startsWith('imported') ? `probe-${position}-west` : '', importStatus, runId: 'sample', now: NOW.toISOString() });
      // Veraltete Parserversion: auch regenerateStale darf den Beispielkorpus nicht erfassen.
      entry.parserVersion = 'recht-nrw-parser/0.0.1';
      const location = archiveStatus === 'versioned' ? { localSource: `sources/recht-nrw/term-${sourceIdentity.slice('term:'.length)}/${entry.sha256.slice(0, 16)}-version-page.html` } : { bucket: 'landesrecht-quellen', objectKey: `west/recht-nrw/2023-12-01/term-${sourceIdentity.slice('term:'.length)}/${entry.sha256.slice(0, 16)}-version-page.html` };
      entry.rawDocuments = [{ role: 'version-page', url: item.entryUrl, finalUrl: item.entryUrl, sha256: entry.sha256, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW.toISOString(), byteLength: 100, archiveStatus, ...location }];
      manifest.entries.push(entry);
    }
    const previouslyFailed = byKey.get(order[6]!)!;
    previouslyFailed.status = 'failed';
    previouslyFailed.attempts = 1;
    await writeEnumeration(root, file);

    const logs: string[] = [];
    const stub = stubProcessor();
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, manifest, resume: true, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'probe-1', log: (line) => logs.push(line) }));
    const samples = [2, 3, 4, 5, 6].map((position) => order[position]!);
    expect(stub.calls).toEqual(order.filter((key) => !samples.includes(key)));
    expect(summary).toMatchObject({ runStatus: 'completed', selected: 3, processed: 3 });
    expect(logs.filter((line) => line.startsWith('Beispielkorpus: 5 Einträge'))).toHaveLength(1);
    const onDisk = await enumerationOnDisk(root);
    const at = (position: number): EnumerationItem | undefined => onDisk.items.find((item) => item.key === order[position]);
    expect(at(2)).toMatchObject({ status: 'done', attempts: 0, outcome: { importStatus: 'imported-with-warnings', targetSlug: 'probe-2-west', parserVersion: 'recht-nrw-parser/0.0.1', transformerVersion: TRANSFORMER_VERSION } });
    expect(at(3)).toMatchObject({ status: 'done', attempts: 0, outcome: { importStatus: 'not-at-baseline' } });
    expect(at(4)).toMatchObject({ status: 'excluded', attempts: 0, outcome: { importStatus: 'excluded' } });
    expect(at(5)).toMatchObject({ status: 'review', attempts: 0, outcome: { importStatus: 'needs-review' } });
    expect(at(5)?.outcome).not.toHaveProperty('targetSlug');
    expect(at(6)).toMatchObject({ status: 'failed', attempts: 1, outcome: { importStatus: 'failed' } });
    // Ein Eintrag mit R2-/Staging-Archiv ist nicht betroffen und wird normal verarbeitet.
    expect(at(7)).toMatchObject({ status: 'done', attempts: 1, lastRunId: 'probe-1' });
    expect(summary.enumeration).toEqual({ pending: 0, processing: 0, done: 5, review: 1, failed: 1, excluded: 1 });

    const targetedLogs: string[] = [];
    const targeted = stubProcessor();
    const second = await runBulkImport(runOptions(root, { processor: targeted.processor, manifest, only: samples, retryFailed: true, retryReview: true, regenerateStale: true, runId: 'probe-2', log: (line) => targetedLogs.push(line) }));
    expect(second.summary).toMatchObject({ runStatus: 'nothing-to-do', selected: 0, processed: 0 });
    expect(targeted.calls).toEqual([]);
    // Bereits übernommene Status werden nicht erneut gemeldet.
    expect(targetedLogs.some((line) => line.startsWith('Beispielkorpus:'))).toBe(false);
  });
});

describe('Bulk-Runner: Budget und Sperrantworten', () => {
  it('Budget: erschöpftes Abrufbudget beendet den Lauf mit budget-exhausted (kein Fehler); die Stammnorm bleibt pending und wird beim Resume abgeschlossen', async () => {
    const { base, root, order, source } = await prepareRoot(12);
    const cacheDir = join(base, 'cache');
    const fetching = (): ReturnType<typeof stubProcessor> => stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const limitedFetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, budget: { maxRequests: 5 }, fetchImplementation: syntheticFetch(source.pages) });
    const first = fetching();
    const { summary } = await runBulkImport(runOptions(root, { processor: first.processor, fetcher: limitedFetcher, budgetDescription: { maxRequests: 5 }, runId: 'budget-1' }));
    expect(summary.runStatus).toBe('budget-exhausted');
    expect(summary.processed).toBe(5);
    expect(summary.stopReason).toContain('Abrufbudget von 5 Netzabrufen');
    expect(summary.failures).toEqual([]);
    expect(summary.outcomes.failed).toBe(0);
    expect(summary.network.requests).toBe(5);
    expect(summary.options.maxRequests).toBe(5);
    expect(first.calls).toEqual(order.slice(0, 6));
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[5])).toMatchObject({ status: 'pending', attempts: 0, lastError: { code: 'budget-exhausted' } });
    expect(statusCounts(onDisk)).toEqual({ done: 5, pending: 7 });
    expect((await readManifest(root)).entries).toHaveLength(5);

    const freshFetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, budget: { maxRequests: 100 }, fetchImplementation: syntheticFetch(source.pages) });
    const second = fetching();
    const resumed = await runBulkImport(runOptions(root, { processor: second.processor, fetcher: freshFetcher, resume: true, runId: 'budget-2' }));
    expect(resumed.summary).toMatchObject({ runStatus: 'completed', processed: 7 });
    expect(second.calls[0]).toBe(order[5]);
    expect(resumed.summary.network.requests).toBe(7);
    const final = await enumerationOnDisk(root);
    expect(statusCounts(final)).toEqual({ done: 12 });
    expect(final.items.find((item) => item.key === order[5])?.lastError).toBeUndefined();
  });

  it('Budget: Laufzeitbudget des Runners (maxRuntimeMs, injizierte Uhr) endet vor der nächsten Stammnorm', async () => {
    const { root, order } = await prepareRoot(10);
    let time = 10_000;
    const stub = stubProcessor({ before: () => { time += 1_000; } });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, maxRuntimeMs: 5_000, clock: () => time, runId: 'laufzeit' }));
    expect(summary).toMatchObject({ runStatus: 'budget-exhausted', processed: 5, durationMs: 5_000 });
    expect(summary.stopReason).toContain('Laufzeitbudget von 5 s');
    expect(summary.options.maxRuntimeMs).toBe(5_000);
    expect(stub.calls).toEqual(order.slice(0, 5));
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[5])).toMatchObject({ status: 'pending', attempts: 0 });
    expect(onDisk.items.find((item) => item.key === order[5])?.lastError).toBeUndefined();
  });

  it('beendet den Lauf bei wiederholten Sperrantworten (429) kontrolliert; die Stammnorm geht zurück auf pending', async () => {
    const { base, root, order, source } = await prepareRoot(8);
    const cacheDir = join(base, 'cache');
    const slept: number[] = [];
    const blocking = syntheticFetch(source.pages, { blockFromRequest: 4 });
    const fetcher = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, maxRetries: 5, maxConsecutiveBlocks: 3, sleep: async (ms) => { slept.push(ms); }, fetchImplementation: blocking });
    const fetching = stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const { summary } = await runBulkImport(runOptions(root, { processor: fetching.processor, fetcher, runId: 'blocked-1' }));
    expect(summary.runStatus).toBe('aborted-systemic');
    expect(summary.processed).toBe(3);
    expect(summary.stopReason).toContain('aufeinanderfolgende Sperrantworten');
    // Drei erfolgreiche Abrufe, dann drei Sperrantworten für die vierte Stammnorm (zwei Wiederholungen).
    expect(summary.network).toMatchObject({ requests: 6, blockedResponses: 3, retries: 2 });
    expect(slept).toEqual([4_000, 8_000]);
    expect(blocking.requests).toHaveLength(6);
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[3])).toMatchObject({ status: 'pending', attempts: 0, lastError: { code: 'blocked' } });
    expect(statusCounts(onDisk)).toEqual({ done: 3, pending: 5 });

    const unblocked = createRechtNrwFetcher({ cacheDir, minDelayMs: 0, sleep: noSleep, fetchImplementation: syntheticFetch(source.pages) });
    const resumed = stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const again = await runBulkImport(runOptions(root, { processor: resumed.processor, fetcher: unblocked, resume: true, runId: 'blocked-2' }));
    expect(again.summary).toMatchObject({ runStatus: 'completed', processed: 5 });
    expect(resumed.calls[0]).toBe(order[3]);
  });

  it('beendet den Lauf nach aufeinanderfolgenden 403-Antworten mit blocked; die auslösende Stammnorm bleibt pending', async () => {
    const { base, root, order } = await prepareRoot(6);
    const forbidden = (async () => new Response('verboten', { status: 403 })) as typeof fetch;
    const fetcher = createRechtNrwFetcher({ cacheDir: join(base, 'cache'), minDelayMs: 0, sleep: noSleep, maxConsecutiveBlocks: 3, fetchImplementation: forbidden });
    const fetching = stubProcessor({ before: async (item, context) => { await context.fetcher.fetch(item.entryUrl); } });
    const { summary } = await runBulkImport(runOptions(root, { processor: fetching.processor, fetcher, runId: 'forbidden' }));
    expect(summary.runStatus).toBe('aborted-systemic');
    expect(summary.network.blockedResponses).toBe(3);
    expect(summary.processed).toBe(2);
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items.find((item) => item.key === order[2])).toMatchObject({ status: 'pending', lastError: { code: 'blocked' } });
    expect(onDisk.items.filter((item) => item.status === 'processing')).toEqual([]);
  });
});

describe('Bulk-Runner: Systemische Abbrüche', () => {
  it('bricht bei gehäuft gleichem Fehlercode mit aborted-systemic ab', async () => {
    const { root, order } = await prepareRoot(40);
    const stub = stubProcessor({ decide: () => ({ status: 'failed', code: 'parser-structure-changed' }) });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, runId: 'systemisch-code' }));
    expect(summary.runStatus).toBe('aborted-systemic');
    expect(summary.processed).toBe(15);
    expect(summary.stopReason).toContain('parser-structure-changed');
    expect(summary.failures).toHaveLength(15);
    expect(summary.enumeration).toMatchObject({ failed: 15, pending: 25, processing: 0 });
    expect(stub.calls).toEqual(order.slice(0, 15));

    const custom = await prepareRoot(10);
    const tight = await runBulkImport(runOptions(custom.root, { processor: stubProcessor({ decide: () => ({ status: 'failed', code: 'gleich' }) }).processor, systemic: { window: 10, maxSameCodeFailures: 3, maxConsecutiveFailures: 100 }, runId: 'systemisch-eng' }));
    expect(tight.summary).toMatchObject({ runStatus: 'aborted-systemic', processed: 3 });
  });

  it('bricht bei vielen Fehlern in Folge mit unterschiedlichen Codes ab', async () => {
    const { root } = await prepareRoot(30);
    const stub = stubProcessor({ decide: (item) => ({ status: 'failed', code: `fehler-${indexOf(item.key)}` }) });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, runId: 'systemisch-folge' }));
    expect(summary).toMatchObject({ runStatus: 'aborted-systemic', processed: 20 });
    expect(summary.stopReason).toContain('20 Stammnormen in Folge');
  });

  it('norm-lokale Einzelfehler und Ausnahmen brechen den Lauf nicht ab', async () => {
    const { root } = await prepareRoot(100);
    const stub = stubProcessor({
      decide: (item) => (indexOf(item.key) % 5 === 0 ? { status: 'failed', code: 'norm-lokal' } : { status: 'done' }),
      before: (item) => {
        if (indexOf(item.key) % 5 !== 0 && indexOf(item.key) % 7 === 0) throw new Error(`kaputt ${indexOf(item.key)}`);
      },
    });
    // Dry-run genügt: die Fehlerklassifikation hängt nicht vom Schreibmodus ab (Checkpoints prüfen andere Tests).
    const { summary, enumeration } = await runBulkImport(runOptions(root, { write: false, processor: stub.processor, runId: 'lokal' }));
    expect(summary).toMatchObject({ runStatus: 'completed', processed: 100 });
    expect(summary.outcomes).toMatchObject({ failed: 32, imported: 68 });
    expect(summary.failures).toHaveLength(32);
    expect(summary.failures.filter((failure) => failure.code === 'exception')).toHaveLength(12);
    expect(enumeration.items.find((item) => indexOf(item.key) === 7)).toMatchObject({ status: 'failed', attempts: 1, lastError: { code: 'exception', message: 'kaputt 7' } });
    expect(statusCounts(enumeration)).toEqual({ done: 68, failed: 32 });
  });

  it('beendet den Lauf bei beschädigten Zustandsdateien oder Archivfehlern sofort; die Stammnorm bleibt pending', async () => {
    for (const [name, error] of [['CorruptStateError', new CorruptStateError('data/imports/recht-nrw/manifest/lrgv/term-1.json', 'kein JSON')], ['ArchiveError', new ArchiveError('conflict', 'R2-Objekt existiert mit anderem SHA-256')]] as const) {
      const { root, order } = await prepareRoot(6);
      const stub = stubProcessor({ before: (_item, _context, call) => { if (call === 3) throw error; } });
      const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, runId: `zustand-${name}` }));
      expect(summary).toMatchObject({ runStatus: 'aborted-systemic', processed: 2, stopReason: error.message });
      const onDisk = await enumerationOnDisk(root);
      expect(onDisk.items.find((item) => item.key === order[2])).toMatchObject({ status: 'pending', attempts: 0, lastError: { code: name } });
      expect(statusCounts(onDisk)).toEqual({ done: 2, pending: 4 });
    }
  });
});

describe('Bulk-Runner: Determinismus und Laufzusammenfassung', () => {
  it('entfernt Laufmetadaten stabil (withoutRuntimeMetadata, RUNTIME_METADATA_FIELDS)', () => {
    expect(RUNTIME_METADATA_FIELDS).toEqual(expect.arrayContaining(['retrievedAt', 'importedAt', 'generatedAt', 'updatedAt', 'firstSeenAt', 'decidedAt', 'lastRunId', 'runId', 'startedAt', 'endedAt', 'durationMs']));
    const left = { b: 1, a: { updatedAt: '2026-01-01', list: [{ runId: 'x', d: 2, lastRunId: 'y' }], importedAt: 'z' }, durationMs: 5 };
    const right = { a: { list: [{ d: 2 }] }, b: 1 };
    expect(withoutRuntimeMetadata(left)).toBe(withoutRuntimeMetadata(right));
    expect(withoutRuntimeMetadata({ a: 1, b: 2 })).not.toBe(withoutRuntimeMetadata({ a: 1, b: 3 }));
  });

  it('zwei identische Läufe in frischen Roots ergeben bis auf Laufmetadaten identische Manifest-, Review- und Enumerationsdateien', async () => {
    const decide = (item: EnumerationItem): Decision => (indexOf(item.key) % 9 === 0 ? { status: 'review' } : indexOf(item.key) % 13 === 0 ? { status: 'failed', code: 'deterministisch' } : { status: 'done' });
    const runs: Array<{ root: string; summary: unknown }> = [];
    for (const [name, now] of [['a', new Date('2026-09-15T12:00:00.000Z')], ['b', new Date('2026-09-16T08:30:00.000Z')]] as const) {
      const { root } = await prepareRoot(30);
      const { summary } = await runBulkImport(runOptions(root, { processor: stubProcessor({ decide }).processor, now: () => now }));
      expect(summary.runId).toBe(runIdFor('lrgv', now));
      runs.push({ root, summary });
    }
    const [a, b] = [runs[0]!, runs[1]!];
    const filesA = await comparable(a.root);
    const filesB = await comparable(b.root);
    expect([...filesA.keys()]).toEqual([...filesB.keys()]);
    expect([...filesA.keys()].filter((path) => path.startsWith(`${MANIFEST_DIR}/`))).toHaveLength(30 - 2);
    expect([...filesA.keys()].filter((path) => path.startsWith(`${REVIEW_DIR}/`))).toHaveLength(3);
    expect(filesA).toEqual(filesB);
    expect(withoutRuntimeMetadata(a.summary)).toBe(withoutRuntimeMetadata(b.summary));
    // Ohne das Entfernen der Laufmetadaten unterscheiden sich die Dateien tatsächlich.
    const raw = async (root: string): Promise<string> => readFile(join(root, enumerationPath('lrgv')), 'utf8');
    expect(await raw(a.root)).not.toBe(await raw(b.root));
    expect((await enumerationOnDisk(a.root)).contentFingerprint).toBe((await enumerationOnDisk(b.root)).contentFingerprint);
  });

  it('schreibt die Laufzusammenfassung unter data/audits/recht-nrw/runs/<runId>.json mit den dokumentierten Feldern', async () => {
    expect(RUN_STATUSES).toEqual(['completed', 'limit-reached', 'nothing-to-do', 'budget-exhausted', 'interrupted', 'aborted-systemic']);
    expect(RUNS_DIR).toBe(join('data', 'audits', 'recht-nrw', 'runs'));
    expect(runIdFor('lrmb', new Date('2026-01-02T03:04:05.678Z'))).toBe('recht-nrw-2023-12-01-lrmb-20260102T030405Z');
    const { root } = await prepareRoot(10);
    const stub = stubProcessor({ decide: (item) => (indexOf(item.key) === 4 ? { status: 'failed', code: 'einzelfall' } : indexOf(item.key) === 5 ? { status: 'review' } : indexOf(item.key) === 6 ? { status: 'excluded' } : { status: 'done' }) });
    const { summary } = await runBulkImport(runOptions(root, { processor: stub.processor, gitCommit: 'abc1234', budgetDescription: { maxRequests: 3_000 }, maxRuntimeMs: 3_600_000, clock: () => 42 }));
    const runId = runIdFor('lrgv', NOW);
    expect(runId).toBe('recht-nrw-2023-12-01-lrgv-20260915T120000Z');
    const path = join(root, RUNS_DIR, `${runId}.json`);
    const written = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(written).toEqual(JSON.parse(JSON.stringify(summary)));
    expect(Object.keys(written).sort()).toEqual(['archive', 'baselineDate', 'd1Projection', 'durationMs', 'endedAt', 'enumeration', 'failures', 'gitCommit', 'mode', 'network', 'options', 'outcomes', 'parserVersion', 'processed', 'runId', 'runStatus', 'schemaVersion', 'selected', 'sourceArea', 'startedAt', 'transformerVersion'].sort());
    expect(written).toMatchObject({
      schemaVersion: RUN_SUMMARY_SCHEMA,
      runId,
      sourceArea: 'lrgv',
      mode: 'write',
      runStatus: 'completed',
      gitCommit: 'abc1234',
      parserVersion: currentParserVersion('lrgv'),
      transformerVersion: TRANSFORMER_VERSION,
      baselineDate: '2023-12-01',
      startedAt: NOW.toISOString(),
      endedAt: NOW.toISOString(),
      durationMs: 0,
      options: { resume: false, limit: null, only: [], refresh: false, retryFailed: false, retryReview: false, regenerateStale: false, maxRuntimeMs: 3_600_000, maxRequests: 3_000 },
      selected: 10,
      processed: 10,
      outcomes: { imported: 7, importedWithWarnings: 0, dryRun: 0, review: 1, failed: 1, excluded: 1, notAtBaseline: 0, reconstructed: 0, merged: 0, split: 0 },
      network: { requests: 0, cacheHits: 0, bytes: 0, retries: 0, blockedResponses: 0, cacheCorrupt: 0 },
      archive: { mode: 'versioned-sample', stored: 0, uploaded: 0, verified: 0, alreadyPresent: 0 },
      d1Projection: { status: 'not-run' },
      enumeration: { pending: 0, processing: 0, done: 7, review: 1, failed: 1, excluded: 1 },
      failures: [{ code: 'einzelfall', message: 'synthetischer Fehler einzelfall' }],
    });
    expect(RUN_STATUSES).toContain(written.runStatus);
    expect(written).not.toHaveProperty('stopReason');
  });
});

describe('Bulk-Runner: Skalierung', () => {
  it('Skalierung: 3.000 synthetische Stammnormen mit Zusammenführungsprüfung – Zählungen stimmen', { timeout: 60_000 }, async () => {
    const { root } = await prepareRoot(3_000);
    const started = performance.now();
    const stub = stubProcessor({ decide: (item) => (indexOf(item.key) % 100 === 0 ? { status: 'review' } : indexOf(item.key) % 250 === 0 ? { status: 'failed', code: 'selten' } : { status: 'done' }) });
    const { summary, enumeration } = await runBulkImport(runOptions(root, { write: false, processor: stub.processor }));
    const durationMs = performance.now() - started;
    expect(summary).toMatchObject({ runStatus: 'completed', selected: 3_000, processed: 3_000 });
    expect(summary.outcomes).toMatchObject({ imported: 2_964, review: 30, failed: 6, merged: 0, split: 0 });
    expect(summary.enumeration).toEqual({ pending: 0, processing: 0, done: 2_964, review: 30, failed: 6, excluded: 0 });
    expect(stub.calls).toHaveLength(3_000);
    expect(new Set(stub.calls).size).toBe(3_000);
    expect(new Set(enumeration.items.map((item) => item.sourceIdentity)).size).toBe(3_000);
    expect(durationMs).toBeLessThan(45_000);
  });

  it('Skalierung: Checkpoints über einer Enumeration mit 3.000 Einträgen bleiben konsistent (Schreiblauf in Etappen)', { timeout: 60_000 }, async () => {
    const { root, order } = await prepareRoot(3_000);
    const first = stubProcessor();
    const stage1 = await runBulkImport(runOptions(root, { processor: first.processor, limit: 20, runId: 'etappe-1' }));
    expect(stage1.summary).toMatchObject({ runStatus: 'limit-reached', selected: 20, processed: 20 });
    const second = stubProcessor();
    const stage2 = await runBulkImport(runOptions(root, { processor: second.processor, limit: 10, resume: true, runId: 'etappe-2' }));
    expect(stage2.summary).toMatchObject({ runStatus: 'limit-reached', selected: 10, processed: 10 });
    expect(second.calls).toEqual(order.slice(20, 30));
    const onDisk = await enumerationOnDisk(root);
    expect(onDisk.items).toHaveLength(3_000);
    expect(statusCounts(onDisk)).toEqual({ done: 30, pending: 2_970 });
    expect(stage2.summary.enumeration).toMatchObject({ done: 30, pending: 2_970, processing: 0 });
    expect((await readManifest(root)).entries).toHaveLength(30);
    expect(await tempLeftovers(root)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* End-to-End mit der Standardverarbeitung (LRGV-Importpfad, Speicher-R2, synthetische Quelle). */

describe('Bulk-Runner: End-to-End mit Standardverarbeitung und synthetischer LRGV-Quelle', () => {
  const COUNT = 30;
  const COLLIDE_EVERY = 7;
  let base: string;
  let fetchImplementation: typeof fetch;
  let source: ReturnType<typeof syntheticLrgvSource>;
  let rootA: string;
  let transportA: MemoryR2Transport;
  let comparableA: Map<string, string>;

  async function prepareE2eRoot(name: string): Promise<string> {
    const root = join(base, name);
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await mkdir(join(root, IMPORT_DATA_DIR), { recursive: true });
    await cp(join(repoRoot, IMPORT_DATA_DIR, 'institution-mapping.json'), join(root, IMPORT_DATA_DIR, 'institution-mapping.json'));
    await writeEnumeration(root, buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, now: NOW.toISOString() }));
    return root;
  }

  async function e2eRun(root: string, options: { runId: string; transport: MemoryR2Transport; write: boolean; resume: boolean; cache: string; offline?: boolean; stopAfter?: number; only?: string[]; limit?: number }) {
    const stop = createStopController();
    const stagingDir = join(base, `${relative(base, root)}-staging`);
    const archive = createR2Archive({ root, stagingDir, transport: options.transport, upload: 'immediate' });
    const fetcher = createRechtNrwFetcher({ cacheDir: join(base, options.cache), offline: Boolean(options.offline), fetchImplementation, minDelayMs: 0, sleep: noSleep, signal: stop.abort.signal });
    const manifest = await readManifest(root);
    const environment = await loadImportEnvironment(root, { mode: 'bulk', archive, stagingDir, projection: 'record-only', manifest });
    let processed = 0;
    const processor: ItemProcessor = async (item, context) => {
      const outcome = await defaultItemProcessor(item, context);
      processed += 1;
      if (options.stopAfter !== undefined && processed === options.stopAfter) stop.requestStop();
      return outcome;
    };
    return runBulkImport({ root, area: 'lrgv', write: options.write, resume: options.resume, fetcher, environment, manifest, reviewQueue: await readReviewQueue(root), stop, processor, now: fixedNow, runId: options.runId, ...(options.only ? { only: options.only } : {}), ...(options.limit !== undefined ? { limit: options.limit } : {}) });
  }

  const collidingIdentities = Array.from({ length: Math.floor(COUNT / COLLIDE_EVERY) }, (_value, index) => `term:${SYNTHETIC_TERM_BASE + (index + 1) * COLLIDE_EVERY}`);

  it('Dry-run mit Standardverarbeitung schreibt weder Inhalte noch Archivobjekte', { timeout: 60_000 }, async () => {
    base = await tempBase('recht-nrw-bulk-e2e-');
    const template = await readFile(join(repoRoot, 'tests', 'fixtures', 'recht-nrw', 'version-page-native.html'), 'utf8');
    source = syntheticLrgvSource(template, COUNT, { collideEvery: COLLIDE_EVERY });
    // Die synthetische Quelle liefert je Norm Fassungsseite, HTM-Anlage und PDF-Anlage.
    fetchImplementation = syntheticFetch(source.pages);

    const root = await prepareE2eRoot('dry');
    const before = await snapshot(root);
    const transport = createMemoryR2Transport();
    const { summary } = await e2eRun(root, { runId: 'e2e-dry', transport, write: false, resume: false, cache: 'cache-dry', limit: 12 });
    expect(summary).toMatchObject({ mode: 'dry-run', runStatus: 'limit-reached', processed: 12 });
    expect(summary.outcomes.dryRun).toBe(12);
    expect(summary.failures).toEqual([]);
    expect(transport.objects.size).toBe(0);
    expect(await snapshot(root)).toEqual(before);
    expect(await exists(join(base, 'dry-staging'))).toBe(false);
  });

  it('Schreiblauf mit SIGINT nach 11 Stammnormen und Resume: Slugkollisionen mit Term-Suffix, keine Doppelimporte', { timeout: 60_000 }, async () => {
    rootA = await prepareE2eRoot('root-a');
    transportA = createMemoryR2Transport();
    const first = await e2eRun(rootA, { runId: 'e2e-1', transport: transportA, write: true, resume: false, cache: 'cache', stopAfter: 11 });
    expect(first.summary).toMatchObject({ runStatus: 'interrupted', processed: 11 });
    expect(statusCounts(await enumerationOnDisk(rootA))).toEqual({ done: 11, pending: COUNT - 11 });
    const second = await e2eRun(rootA, { runId: 'e2e-2', transport: transportA, write: true, resume: true, cache: 'cache' });
    expect(second.summary).toMatchObject({ runStatus: 'completed', processed: COUNT - 11, selected: COUNT - 11 });
    expect([...first.summary.failures, ...second.summary.failures]).toEqual([]);
    expect(first.summary.outcomes.importedWithWarnings + first.summary.outcomes.imported + second.summary.outcomes.importedWithWarnings + second.summary.outcomes.imported).toBe(COUNT);
    // Je Norm Fassungsseite, HTM- und PDF-Anlage; nichts doppelt abgerufen.
    expect(first.summary.network.requests + second.summary.network.requests).toBe(COUNT * 3);

    const manifest = await readManifest(rootA);
    expect(manifest.entries).toHaveLength(COUNT);
    expect(new Set(manifest.entries.map((entry) => entry.sourceIdentity)).size).toBe(COUNT);
    expect(manifest.entries.every((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings')).toBe(true);
    const registry = await readSlugRegistry(rootA);
    expect(registry.entries).toHaveLength(COUNT);
    const suffixed = registry.entries.filter((entry) => entry.assignment === 'collision-suffix');
    expect(suffixed.map((entry) => entry.sourceIdentity).sort()).toEqual([...collidingIdentities].sort());
    for (const entry of suffixed) {
      const term = entry.sourceIdentity.slice('term:'.length);
      const index = Number(term) - SYNTHETIC_TERM_BASE;
      expect(entry.slug).toBe(`${entry.candidate}-${term}`);
      expect(entry.candidate).toBe(`synthvo${index - 1}-west`);
      expect(registry.entries.find((other) => other.slug === entry.candidate)?.sourceIdentity).toBe(`term:${Number(term) - 1}`);
    }
    expect(registry.entries.filter((entry) => entry.assignment === 'derived').every((entry) => entry.slug === `synthvo${Number(entry.sourceIdentity.slice('term:'.length)) - SYNTHETIC_TERM_BASE}-west`)).toBe(true);
    const slugs = (await readdir(join(rootA, 'content', 'norms', 'west'))).filter((name) => !name.startsWith('.')).sort();
    expect(slugs).toEqual(registry.entries.map((entry) => entry.slug).sort());
    expect(manifest.entries.map((entry) => entry.targetSlug).sort()).toEqual(slugs);
    const collisionReviews = (await readReviewQueue(rootA)).items.filter((item) => item.category === 'slug-collision');
    expect([...new Set(collisionReviews.map((item) => item.sourceIdentity))].sort()).toEqual([...collidingIdentities].sort());
    // Je Norm Fassungsseite, HTM- und PDF-Anlage, jeweils Objekt und Umschlag.
    expect(transportA.objects.size).toBe(COUNT * 3 * 2);
    expect(first.summary.archive.verified + second.summary.archive.verified).toBe(COUNT * 3);
    expect(statusCounts(await enumerationOnDisk(rootA))).toEqual({ done: COUNT });
    expect(await tempLeftovers(rootA)).toEqual([]);
    expect((await readdir(join(rootA, RUNS_DIR))).sort()).toEqual(['e2e-1.json', 'e2e-2.json']);
    comparableA = await comparable(rootA);
  });

  it('ist deterministisch: ein ununterbrochener Lauf in einem zweiten Root aus dem Cache (offline) ergibt fachlich identische Dateien', { timeout: 60_000 }, async () => {
    const rootB = await prepareE2eRoot('root-b');
    const transportB = createMemoryR2Transport();
    const { summary } = await e2eRun(rootB, { runId: 'e2e-b', transport: transportB, write: true, resume: false, cache: 'cache', offline: true });
    expect(summary).toMatchObject({ runStatus: 'completed', processed: COUNT });
    expect(summary.network.requests).toBe(0);
    const comparableB = await comparable(rootB);
    const differing = [...new Set([...comparableA.keys(), ...comparableB.keys()])].filter((path) => comparableA.get(path) !== comparableB.get(path));
    expect(differing).toEqual([]);
    expect(transportB.objects.size).toBe(transportA.objects.size);
    expect([...transportB.objects.keys()].sort()).toEqual([...transportA.objects.keys()].sort());
  });

  it('Wiederholungslauf ist ein No-op: Resume ohne offene Einträge und erneute Verarbeitung aus dem Cache ändern keine Datei (Normen ohne Slugkollision)', { timeout: 60_000 }, async () => {
    const outsideRuns = (path: string): boolean => path.startsWith(`${RUNS_DIR}/`);
    const before = await snapshot(rootA, outsideRuns);
    const idle = await e2eRun(rootA, { runId: 'e2e-3', transport: transportA, write: true, resume: true, cache: 'cache' });
    expect(idle.summary).toMatchObject({ runStatus: 'nothing-to-do', selected: 0, processed: 0 });
    expect(await snapshot(rootA, outsideRuns)).toEqual(before);

    // Normen mit Slugkollision sind ausgenommen: siehe den folgenden Test (bekannter Fehler).
    const keys = (await enumerationOnDisk(rootA)).items.filter((item) => !collidingIdentities.includes(item.sourceIdentity ?? '')).map((item) => item.key);
    expect(keys).toHaveLength(COUNT - collidingIdentities.length);
    const objectsBefore = transportA.objects.size;
    const repeat = await e2eRun(rootA, { runId: 'e2e-4', transport: transportA, write: true, resume: false, cache: 'cache', offline: true, only: keys });
    expect(repeat.summary).toMatchObject({ runStatus: 'completed', processed: keys.length });
    expect(repeat.summary.network.requests).toBe(0);
    expect(repeat.summary.archive).toMatchObject({ uploaded: 0, alreadyPresent: keys.length * 3 });
    expect(transportA.objects.size).toBe(objectsBefore);
    const after = await snapshot(rootA, outsideRuns);
    const enumerationFile = enumerationPath('lrgv');
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
    // Nur die Enumeration trägt neue Laufmetadaten (updatedAt, lastRunId) und den Zähler attempts.
    expect(changed).toEqual([enumerationFile]);
    const strip = (text: string): string => withoutRuntimeMetadata({ ...JSON.parse(text), items: (JSON.parse(text) as EnumerationFile).items.map(({ attempts: _attempts, ...rest }) => rest), contentFingerprint: null });
    expect(strip(after.get(enumerationFile)!)).toBe(strip(before.get(enumerationFile)!));
  });

  // Regression: Die Slug-Registry meldet eine bestehende Kollisionsreservierung erneut; der Befund slug-collision bleibt,
  // Manifest- und Review-Datei bleiben byteidentisch.
  it('erneute Verarbeitung einer Norm mit Slugkollision lässt Manifest- und Review-Datei unverändert', { timeout: 60_000 }, async () => {
    const shards = collidingIdentities.flatMap((identity) => [manifestEntryPath('lrgv', identity), reviewShardPath('lrgv', identity)]);
    const before = await Promise.all(shards.map((path) => readFile(join(rootA, path), 'utf8')));
    const keys = (await enumerationOnDisk(rootA)).items.filter((item) => collidingIdentities.includes(item.sourceIdentity ?? '')).map((item) => item.key);
    const repeat = await e2eRun(rootA, { runId: 'e2e-5', transport: transportA, write: true, resume: false, cache: 'cache', offline: true, only: keys });
    expect(repeat.summary.processed).toBe(collidingIdentities.length);
    const after = await Promise.all(shards.map((path) => readFile(join(rootA, path), 'utf8')));
    expect(after).toEqual(before);
  });
});
