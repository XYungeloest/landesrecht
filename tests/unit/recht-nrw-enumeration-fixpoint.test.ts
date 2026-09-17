/**
 * Fixpunkt des Enumerations-Rebuilds und Konvergenz des Bulk-Runners bei Portal-Stämmen mit identischem Slug für
 * viele Stammnormen (echtes Muster: `stem:verwaltungsvorschrift/richtlinie-ueber-die-gewaehrung-von-zuwendungen-zur-
 * foerderung`, 53 Adressen, dutzende Förderrichtlinien). Ursache des früheren Zyklus „Rebuild → 1 Eintrag pending →
 * Resume → Rebuild …“: Der Runner trennte je Lauf nur eine Gruppe ab, der Schlüssel der zweiten Abtrennung kollidierte
 * mit dem ersten (`@ältestes Datum`), die Adressen fielen still aus der Enumeration, und der Rebuild öffnete sie als
 * einen Stammeintrag – ein Term je Zyklus. Jetzt: Abtrennungen werden im selben Lauf verarbeitet, Schlüssel sind
 * kollisionsfrei (`@jüngstes Datum`, sonst nächstjüngeres), der Rebuild läuft bis zum Fixpunkt und ist byteidentisch
 * wiederholbar. Alles ohne Netz: Fixtures, Stub-Verarbeitung, temporäre Roots.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runBulkImport, type BulkRunOptions, type ItemOutcome, type ItemProcessor } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import {
  buildEnumeration,
  checkEnumerationFixpoint,
  checkEnumerationInvariants,
  ENUMERATION_MAX_PASSES,
  EnumerationFixpointError,
  enumerationIsFixpoint,
  enumerationJsonText,
  enumerationStatusCounts,
  findDuplicateIdentities,
  readEnumeration,
  SEARCH_URL,
  SITEMAP_INDEX_URL,
  stemBaseKey,
  writeEnumeration,
  type BuildEnumerationInput,
  type EnumerationFile,
  type EnumerationItem,
  type SearchHit,
} from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { createTestEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import type { FetchedDocument, FetchRequest, RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { ImportManifest, ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

const VV = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift';
const INDEX = 'state_law_ministerial_gazette';
const NOW = '2026-09-17T08:00:00.000Z';
const LATER = '2026-09-18T08:00:00.000Z';
const fixedNow = (): Date => new Date(NOW);

/* ------------------------------------------------------------------------------------------ */
/* Fixtures: eine „Welt“ aus Stammnormen mit Fassungsadressen (Wahrheit des Portals).           */

interface Norm {
  term: string;
  title: string;
  /** Fassungen als [ISO-Datum, Slug]; die Fassungsliste jeder Seite nennt alle Adressen der Stammnorm. */
  versions: Array<[string, string]>;
}

interface World {
  norms: Norm[];
  sitemap: string[];
  hits: SearchHit[];
  termOf: Map<string, string>;
  versionsOf: Map<string, string[]>;
  titleOf: Map<string, string>;
}

function dated(date: string, slug: string): string {
  const [year, month, day] = date.split('-');
  return `${VV}/${day}${month}${year}-${slug}`;
}

function world(norms: Norm[]): World {
  const termOf = new Map<string, string>();
  const versionsOf = new Map<string, string[]>();
  const titleOf = new Map<string, string>();
  const sitemap: string[] = [];
  const hits: SearchHit[] = [];
  for (const norm of norms) {
    const urls = norm.versions.map(([date, slug]) => dated(date, slug));
    for (const url of urls) {
      termOf.set(url, norm.term);
      sitemap.push(url);
    }
    versionsOf.set(norm.term, [...urls].sort());
    titleOf.set(norm.term, norm.title);
    const newest = [...norm.versions].sort((left, right) => (left[0] < right[0] ? 1 : -1))[0]!;
    hits.push({ nodeId: norm.term.slice('term:'.length), url: dated(newest[0], newest[1]), indexType: INDEX, title: norm.title });
  }
  return { norms, sitemap: sitemap.sort(), hits, termOf, versionsOf, titleOf };
}

/** Förderrichtlinien-Muster: `count` Stammnormen mit identischem Slug, je 1–3 Fassungen. */
function sameSlugWorld(count: number, slug = 'richtlinie-foerderung'): World {
  const norms: Norm[] = [];
  for (let index = 0; index < count; index += 1) {
    const year = 2000 + index;
    const versions: Array<[string, string]> = [[`${year}-01-01`, slug]];
    if (index % 3 === 1) versions.push([`${year}-06-01`, slug]);
    if (index % 3 === 2) versions.push([`${year}-06-01`, slug], [`${year}-09-01`, slug]);
    norms.push({ term: `term:${100 + index}`, title: `Richtlinie zur Förderung ${index}`, versions });
  }
  return world(norms);
}

function manifestEntry(term: string, urls: string[], title: string, importStatus: ManifestEntry['importStatus']): ManifestEntry {
  return {
    sourceSystem: 'recht-nrw', sourceArea: 'lrmb', sourceDocumentType: 'sonstige-verwaltungsvorschrift', sourceIdentity: term, sourceTitle: title, sourceType: 'verwaltungsvorschrift', sourceUrl: urls[0]!,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${term.slice(5)}`, sourceVersion: { url: urls[0]!, validFrom: '2020-01-01', validTo: null }, selectedVersionUrl: urls[0]!, sourceValidFrom: '2020-01-01', sourceValidTo: null,
    baselineStatus: 'active-at-baseline', validityEvidence: [], retrievedAt: NOW, sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: 'recht-nrw-lrmb-parser/1.2.0', transformerVersion: 'recht-nrw-transformer/2.1.0',
    targetJurisdiction: 'west', targetSlug: importStatus === 'imported' ? `${term.slice(5)}-west` : '', baselineDate: '2023-12-01', importStatus, reviewStatus: importStatus === 'needs-review' ? 'open' : 'none', reconstructionStatus: 'not-applicable', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW, rawDocuments: [],
    versionsConsidered: urls.map((url, index) => ({ validFrom: `20${10 + index}-01-01`, validTo: null, url, selected: index === 0 })), overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
  };
}

const manifestOf = (entries: Iterable<ManifestEntry>): ImportManifest => ({ schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries: [...entries] });

type Decision = 'done' | 'not-at-baseline' | 'review' | 'excluded' | 'failed';

interface TruthHooks {
  /** Abruffehler vor der Stammnorm-Kennung (keine Identität, kein Manifest); `true` = scheitern. */
  fetchFails?: (item: EnumerationItem, call: number) => boolean;
  decide?: (term: string) => Decision;
}

/**
 * Stub-Verarbeitung „wie das Portal“: Die Einstiegsseite nennt Term-ID und Fassungsliste ihrer Stammnorm; das
 * Manifest sammelt sich in `manifest` (der Runner hält es je Lauf im Speicher; der Rebuild liest es ein).
 */
function truthProcessor(truth: World, manifest: Map<string, ManifestEntry>, hooks: TruthHooks = {}): { processor: ItemProcessor; calls: string[] } {
  const calls: string[] = [];
  const processor: ItemProcessor = async (item) => {
    calls.push(item.key);
    if (hooks.fetchFails?.(item, calls.length)) return { status: 'failed', importStatus: 'failed', errorCodes: ['fetch-network'], message: 'synthetischer Abruffehler' };
    const term = truth.termOf.get(item.entryUrl);
    if (!term) return { status: 'failed', importStatus: 'failed', errorCodes: ['missing-stem-id'], message: `keine Stammnorm für ${item.entryUrl}` };
    const versionUrls = truth.versionsOf.get(term)!;
    const title = truth.titleOf.get(term)!;
    const decision = hooks.decide?.(term) ?? 'done';
    if (decision === 'failed') return { status: 'failed', importStatus: 'failed', sourceIdentity: term, versionUrls, errorCodes: ['transform-failed'], message: 'synthetischer Importfehler nach Seitenabruf' };
    const importStatus: ManifestEntry['importStatus'] = decision === 'done' ? 'imported' : decision === 'review' ? 'needs-review' : decision;
    const entry = manifestEntry(term, versionUrls, title, importStatus);
    manifest.set(term, entry);
    const outcome: ItemOutcome = { status: decision === 'not-at-baseline' ? 'done' : decision, importStatus, sourceIdentity: term, versionUrls, manifestEntry: entry };
    if (decision === 'review') outcome.reviewCategories = ['normativity'];
    if (importStatus === 'imported') outcome.targetSlug = entry.targetSlug;
    return outcome;
  };
  return { processor, calls };
}

const noNetworkFetcher = (): RechtNrwFetcher => ({ stats: { networkRequests: 0, cacheHits: 0 }, fetch: async (url) => { throw new Error(`unerwarteter Abruf ${url}`); } });

const bases: string[] = [];
afterAll(async () => {
  for (const base of bases.splice(0)) await rm(base, { recursive: true, force: true });
});

function buildInput(truth: World, overrides: Partial<BuildEnumerationInput> = {}): BuildEnumerationInput {
  return { area: 'lrmb', sitemap: { pages: 1, urls: truth.sitemap }, search: { total: truth.hits.length, hits: truth.hits }, now: NOW, ...overrides };
}

async function prepareRoot(file: EnumerationFile): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'recht-nrw-enumeration-fixpoint-'));
  bases.push(base);
  const root = join(base, 'root');
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  await writeEnumeration(root, file);
  return root;
}

function runOptions(root: string, processor: ItemProcessor, overrides: Partial<BulkRunOptions> = {}): BulkRunOptions {
  return { root, area: 'lrmb', write: true, resume: false, fetcher: noNetworkFetcher(), environment: createTestEnvironment(root), now: fixedNow, processor, ...overrides };
}

async function onDisk(root: string): Promise<EnumerationFile> {
  const file = await readEnumeration(root, 'lrmb');
  if (!file) throw new Error('Enumeration fehlt');
  return file;
}

const active = (file: EnumerationFile): EnumerationItem[] => file.items.filter((item) => !item.mergedInto);
const byKey = (file: EnumerationFile, key: string): EnumerationItem => {
  const item = file.items.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Eintrag ${key} fehlt (vorhanden: ${file.items.map((candidate) => candidate.key).join(', ')})`);
  return item;
};

/** Jede Sitemap-Adresse hängt an genau einem aktiven Eintrag; kein Schlüssel trägt mehr als ein „@“. */
function expectComplete(file: EnumerationFile, truth: World): void {
  const holders = new Map<string, string[]>();
  for (const item of active(file)) for (const url of item.urls) holders.set(url, [...(holders.get(url) ?? []), item.key]);
  for (const url of truth.sitemap) expect(holders.get(url), url).toHaveLength(1);
  expect(file.items.every((item) => (item.key.match(/@/gu) ?? []).length <= 1)).toBe(true);
  expect(new Set(file.items.map((item) => item.key)).size).toBe(file.items.length);
  expect(findDuplicateIdentities(file)).toEqual([]);
}

/** Rebuild bis zum Fixpunkt; danach ist ein zweiter Rebuild aus denselben Eingaben byteidentisch. */
function rebuildConverged(truth: World, previous: EnumerationFile, manifest: ImportManifest): { file: EnumerationFile; log: string[] } {
  const log: string[] = [];
  const file = buildEnumeration(buildInput(truth, { previous, manifest, now: LATER, log: (line) => log.push(line) }));
  expect(checkEnumerationInvariants(file, { manifestIdentities: new Set(manifest.entries.map((entry) => entry.sourceIdentity)) })).toEqual([]);
  expect(file.crosscheck.ok).toBe(true);
  const check = checkEnumerationFixpoint(file, buildInput(truth, { manifest }));
  expect(check).toMatchObject({ fixpoint: true, differences: [], transitions: [] });
  const second = buildEnumeration(buildInput(truth, { previous: file, manifest, now: '2026-09-19T08:00:00.000Z' }));
  expect(enumerationJsonText(second)).toBe(enumerationJsonText(file));
  return { file, log };
}

/* ------------------------------------------------------------------------------------------ */

describe('Enumeration-Fixpunkt: Portal-Stämme mit identischem Slug für mehrere Stammnormen', () => {
  it('zwei Term-IDs mit identischem Slug: ein Lauf löst beide auf, der Rebuild ist Fixpunkt und byteidentisch wiederholbar', async () => {
    const truth = world([
      { term: 'term:1', title: 'Richtlinie zur Förderung A', versions: [['2020-01-01', 'richtlinie'], ['2021-01-01', 'richtlinie']] },
      { term: 'term:2', title: 'Richtlinie zur Förderung B', versions: [['2022-01-01', 'richtlinie']] },
    ]);
    const seeded = buildEnumeration(buildInput(truth));
    expect(seeded.items.map((item) => [item.key, item.urls.length])).toEqual([['stem:verwaltungsvorschrift/richtlinie', 3]]);
    const root = await prepareRoot(seeded);
    const manifest = new Map<string, ManifestEntry>();
    const stub = truthProcessor(truth, manifest);
    const run = await runBulkImport(runOptions(root, stub.processor, { runId: 'zwei' }));
    expect(run.summary).toMatchObject({ runStatus: 'completed', selected: 2, processed: 2 });
    expect(run.summary.outcomes).toMatchObject({ imported: 2, split: 1, merged: 0 });
    expect(stub.calls).toEqual(['stem:verwaltungsvorschrift/richtlinie', 'stem:verwaltungsvorschrift/richtlinie@2021-01-01']);
    const after = await onDisk(root);
    expect(enumerationStatusCounts(after)).toEqual({ pending: 0, processing: 0, done: 2, review: 0, failed: 0, excluded: 0 });
    expect(byKey(after, 'stem:verwaltungsvorschrift/richtlinie')).toMatchObject({ sourceIdentity: 'term:2', urls: [dated('2022-01-01', 'richtlinie')] });
    expect(byKey(after, 'stem:verwaltungsvorschrift/richtlinie@2021-01-01')).toMatchObject({ sourceIdentity: 'term:1', status: 'done', attempts: 1, titleSource: 'slug', urls: [dated('2020-01-01', 'richtlinie'), dated('2021-01-01', 'richtlinie')], entryUrl: dated('2021-01-01', 'richtlinie') });
    expectComplete(after, truth);

    const { file: rebuilt, log } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    expect(rebuilt.items.map((item) => [item.key, item.status, item.urls.length])).toEqual([['term:1', 'done', 2], ['term:2', 'done', 1]]);
    expect(byKey(rebuilt, 'term:1')).toMatchObject({ title: 'Richtlinie zur Förderung A', titleSource: 'search-index', attempts: 1, outcome: { importStatus: 'imported', targetSlug: '1-west' }, lastRunId: 'zwei' });
    expect(log.at(-1)).toBe('Fixpunkt nach 1 Durchlauf/Durchläufen (Prüfdurchlauf 2 unverändert)');
    expectComplete(rebuilt, truth);
  });

  it('drei und mehr Term-IDs mit identischem Slug (Förderrichtlinien-Muster): alle Stammnormen in EINEM Lauf, kollisionsfreie Schlüssel, keine verlorenen Adressen', async () => {
    for (const count of [3, 12]) {
      const truth = sameSlugWorld(count);
      const seeded = buildEnumeration(buildInput(truth));
      expect(seeded.items).toHaveLength(1);
      const root = await prepareRoot(seeded);
      const manifest = new Map<string, ManifestEntry>();
      const stub = truthProcessor(truth, manifest);
      const run = await runBulkImport(runOptions(root, stub.processor, { runId: `foerder-${count}` }));
      // Früher: ein Term je Zyklus „Resume → Rebuild“; jetzt terminiert die Kette der Abtrennungen im selben Lauf.
      expect(run.summary).toMatchObject({ runStatus: 'completed', processed: count });
      expect(run.summary.outcomes).toMatchObject({ imported: count, split: count - 1, merged: 0, failed: 0 });
      const after = await onDisk(root);
      expect(enumerationStatusCounts(after).done).toBe(count);
      expect(enumerationStatusCounts(after).pending).toBe(0);
      expect(new Set(active(after).map((item) => item.sourceIdentity)).size).toBe(count);
      expectComplete(after, truth);
      for (const item of after.items) expect(stemBaseKey(item.key)).toBe('stem:verwaltungsvorschrift/richtlinie-foerderung');
      const { file: rebuilt } = rebuildConverged(truth, after, manifestOf(manifest.values()));
      expect(rebuilt.items.map((item) => item.key)).toEqual(truth.norms.map((norm) => norm.term));
      for (const norm of truth.norms) expect(byKey(rebuilt, norm.term)).toMatchObject({ status: 'done', attempts: 1, urls: truth.versionsOf.get(norm.term), title: norm.title });
      expectComplete(rebuilt, truth);
      // Ein weiterer Lauf hat nichts zu tun.
      expect((await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { resume: true, runId: 'leer', enumeration: rebuilt }))).summary.runStatus).toBe('nothing-to-do');
    }
  });

  it('historischer Slugwechsel und mehrere Adressen derselben Term-ID: ein Eintrag mit allen Fassungen, Zusammenführung statt Abtrennung', async () => {
    const truth = world([
      { term: 'term:7', title: 'Runderlass mit neuer Bezeichnung', versions: [['2010-01-01', 'alte-bezeichnung'], ['2015-01-01', 'alte-bezeichnung'], ['2020-01-01', 'neue-bezeichnung'], ['2023-01-01', 'neue-bezeichnung']] },
    ]);
    const seeded = buildEnumeration(buildInput(truth));
    expect(seeded.items.map((item) => item.key)).toEqual(['stem:verwaltungsvorschrift/alte-bezeichnung', 'stem:verwaltungsvorschrift/neue-bezeichnung']);
    const root = await prepareRoot(seeded);
    const manifest = new Map<string, ManifestEntry>();
    const run = await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'slugwechsel' }));
    expect(run.summary).toMatchObject({ processed: 1 });
    expect(run.summary.outcomes).toMatchObject({ imported: 1, merged: 1, split: 0 });
    const after = await onDisk(root);
    expect(byKey(after, 'stem:verwaltungsvorschrift/alte-bezeichnung')).toMatchObject({ sourceIdentity: 'term:7', status: 'done', urls: truth.versionsOf.get('term:7') });
    expect(byKey(after, 'stem:verwaltungsvorschrift/neue-bezeichnung')).toMatchObject({ mergedInto: 'term:7', status: 'done' });
    const { file: rebuilt } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    expect(rebuilt.items.map((item) => [item.key, item.urls.length, item.mergedInto ?? null])).toEqual([['term:7', 4, null]]);
    expect(byKey(rebuilt, 'term:7')).toMatchObject({ status: 'done', attempts: 1, title: 'Runderlass mit neuer Bezeichnung', entryUrl: dated('2023-01-01', 'neue-bezeichnung') });
    expectComplete(rebuilt, truth);
  });

  it('Split und Merge in einem Lauf: Slugwechsel einer Stammnorm plus fremde Stammnorm unter dem neuen Slug', async () => {
    const truth = world([
      { term: 'term:1', title: 'Richtlinie Eins', versions: [['2010-01-01', 'eins'], ['2021-01-01', 'zwei']] },
      { term: 'term:2', title: 'Richtlinie Zwei', versions: [['2015-01-01', 'zwei']] },
    ]);
    const seeded = buildEnumeration(buildInput(truth));
    const root = await prepareRoot(seeded);
    const manifest = new Map<string, ManifestEntry>();
    const stub = truthProcessor(truth, manifest);
    const run = await runBulkImport(runOptions(root, stub.processor, { runId: 'split-merge' }));
    expect(run.summary).toMatchObject({ runStatus: 'completed', processed: 2 });
    expect(run.summary.outcomes).toMatchObject({ imported: 2, merged: 1, split: 1 });
    const after = await onDisk(root);
    // `stem:zwei` ist beim Erreichen in der Warteschlange bereits zusammengeführt und wird übersprungen.
    expect(stub.calls).toEqual(['stem:verwaltungsvorschrift/eins', 'stem:verwaltungsvorschrift/zwei@2015-01-01']);
    expect(byKey(after, 'stem:verwaltungsvorschrift/eins')).toMatchObject({ sourceIdentity: 'term:1', urls: [dated('2010-01-01', 'eins'), dated('2021-01-01', 'zwei')] });
    expect(byKey(after, 'stem:verwaltungsvorschrift/zwei')).toMatchObject({ mergedInto: 'term:1' });
    expect(byKey(after, 'stem:verwaltungsvorschrift/zwei@2015-01-01')).toMatchObject({ sourceIdentity: 'term:2', status: 'done', urls: [dated('2015-01-01', 'zwei')] });
    expectComplete(after, truth);
    const { file: rebuilt } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    expect(rebuilt.items.map((item) => [item.key, item.urls.length])).toEqual([['term:1', 2], ['term:2', 1]]);
    expectComplete(rebuilt, truth);
  });

  it('Rebuild auf teilweise verarbeitetem Bestand (--limit): Rest wird EIN offener Stammeintrag ohne „@“, Resume löst ihn vollständig auf', async () => {
    const truth = sameSlugWorld(3);
    const root = await prepareRoot(buildEnumeration(buildInput(truth)));
    const manifest = new Map<string, ManifestEntry>();
    const first = await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'limit', limit: 1 }));
    // Die Abtrennung übersteigt das Limit: sie bleibt offen, der Lauf meldet limit-reached.
    expect(first.summary).toMatchObject({ runStatus: 'limit-reached', processed: 1 });
    expect(first.summary.outcomes).toMatchObject({ split: 1 });
    const partial = await onDisk(root);
    expect(enumerationStatusCounts(partial)).toMatchObject({ done: 1, pending: 1 });
    const split = partial.items.find((item) => item.key.includes('@'))!;
    expect(split).toMatchObject({ status: 'pending', attempts: 0 });
    expectComplete(partial, truth);

    const { file: rebuilt, log } = rebuildConverged(truth, partial, manifestOf(manifest.values()));
    expect(rebuilt.items.map((item) => [item.key, item.status])).toEqual([['term:102', 'done'], ['stem:verwaltungsvorschrift/richtlinie-foerderung', 'pending']]);
    expect(byKey(rebuilt, 'stem:verwaltungsvorschrift/richtlinie-foerderung').urls).toEqual([...truth.versionsOf.get('term:100')!, ...truth.versionsOf.get('term:101')!].sort());
    expect(log).toContain(`stem:verwaltungsvorschrift/richtlinie-foerderung: übernimmt den Stand des abgetrennten Eintrags ${split.key} (pending, 0 Versuche)`);
    expectComplete(rebuilt, truth);

    await writeEnumeration(root, rebuilt);
    const second = await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'resume', resume: true }));
    expect(second.summary).toMatchObject({ runStatus: 'completed', processed: 2 });
    expect(second.summary.outcomes).toMatchObject({ imported: 2, split: 1 });
    const { file: final } = rebuildConverged(truth, await onDisk(root), manifestOf(manifest.values()));
    expect(final.items.map((item) => [item.key, item.status])).toEqual([['term:100', 'done'], ['term:101', 'done'], ['term:102', 'done']]);
    expectComplete(final, truth);
  });

  it('mit --only wird die Abtrennung nicht in die Warteschlange gestellt; sie bleibt offen und der Rebuild führt sie als Stammeintrag', async () => {
    const truth = sameSlugWorld(3);
    const root = await prepareRoot(buildEnumeration(buildInput(truth)));
    const manifest = new Map<string, ManifestEntry>();
    const run = await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'only', only: ['stem:verwaltungsvorschrift/richtlinie-foerderung'] }));
    expect(run.summary).toMatchObject({ runStatus: 'completed', processed: 1 });
    expect(run.summary.outcomes.split).toBe(1);
    const after = await onDisk(root);
    expect(enumerationStatusCounts(after)).toMatchObject({ done: 1, pending: 1 });
    const { file: rebuilt } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    expect(rebuilt.items.map((item) => [item.key, item.status])).toEqual([['term:102', 'done'], ['stem:verwaltungsvorschrift/richtlinie-foerderung', 'pending']]);
  });

  it('Rebuild nach Retry: ein fehlgeschlagener abgetrennter Eintrag behält Status, Versuche und Fehler; --retry-failed löst den Rest auf', async () => {
    const truth = sameSlugWorld(3);
    const root = await prepareRoot(buildEnumeration(buildInput(truth)));
    const manifest = new Map<string, ManifestEntry>();
    const failing = truthProcessor(truth, manifest, { fetchFails: (item) => item.key.includes('@') && item.attempts === 0 });
    const first = await runBulkImport(runOptions(root, failing.processor, { runId: 'fehler' }));
    expect(first.summary).toMatchObject({ runStatus: 'completed', processed: 2 });
    expect(first.summary.outcomes).toMatchObject({ imported: 1, failed: 1, split: 1 });
    const after = await onDisk(root);
    const failed = after.items.find((item) => item.status === 'failed')!;
    expect(failed).toMatchObject({ key: 'stem:verwaltungsvorschrift/richtlinie-foerderung@2001-06-01', attempts: 1, lastError: { code: 'fetch-network' } });
    expect(failed.sourceIdentity).toBeUndefined();
    expectComplete(after, truth);

    const { file: rebuilt, log } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    const rest = byKey(rebuilt, 'stem:verwaltungsvorschrift/richtlinie-foerderung');
    expect(rest).toMatchObject({ status: 'failed', attempts: 1, lastError: { code: 'fetch-network', message: 'synthetischer Abruffehler' }, lastRunId: 'fehler', urls: failed.urls });
    expect(rest.sourceIdentity).toBeUndefined();
    expect(log).toContain('stem:verwaltungsvorschrift/richtlinie-foerderung: übernimmt den Stand des abgetrennten Eintrags stem:verwaltungsvorschrift/richtlinie-foerderung@2001-06-01 (failed, 1 Versuche)');
    expect(enumerationStatusCounts(rebuilt)).toMatchObject({ done: 1, failed: 1, pending: 0 });

    await writeEnumeration(root, rebuilt);
    // Ohne --retry-failed nichts zu tun; mit --retry-failed löst der Lauf beide verbliebenen Stammnormen auf.
    expect((await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'idle', resume: true }))).summary.runStatus).toBe('nothing-to-do');
    const retry = await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'retry', resume: true, retryFailed: true }));
    expect(retry.summary).toMatchObject({ runStatus: 'completed', processed: 2 });
    expect(retry.summary.outcomes).toMatchObject({ imported: 2, split: 1, failed: 0 });
    const { file: final } = rebuildConverged(truth, await onDisk(root), manifestOf(manifest.values()));
    expect(final.items.map((item) => [item.key, item.status, item.attempts])).toEqual([['term:100', 'done', 1], ['term:101', 'done', 2], ['term:102', 'done', 1]]);
    expect(byKey(final, 'term:101').lastError).toBeUndefined();
    expectComplete(final, truth);
  });

  it('not-at-baseline, Review, Failed mit Identität ohne Manifest und Excluded überleben Rebuild und Fixpunkt unverändert', async () => {
    const truth = world([
      { term: 'term:11', title: 'Richtlinie Nicht am Stichtag', versions: [['2019-01-01', 'nab'], ['2024-01-01', 'nab']] },
      { term: 'term:12', title: 'Hinweise zur Anwendung', versions: [['2020-01-01', 'review']] },
      { term: 'term:13', title: 'Richtlinie Fehlerhaft', versions: [['2020-01-01', 'fehler']] },
      { term: 'term:14', title: 'Richtlinie Ausgeschlossen', versions: [['2020-01-01', 'excluded']] },
    ]);
    const decisions: Record<string, Decision> = { 'term:11': 'not-at-baseline', 'term:12': 'review', 'term:13': 'failed', 'term:14': 'excluded' };
    const root = await prepareRoot(buildEnumeration(buildInput(truth)));
    const manifest = new Map<string, ManifestEntry>();
    const run = await runBulkImport(runOptions(root, truthProcessor(truth, manifest, { decide: (term) => decisions[term]! }).processor, { runId: 'stati' }));
    expect(run.summary.outcomes).toMatchObject({ notAtBaseline: 1, review: 1, failed: 1, excluded: 1, split: 0 });
    const after = await onDisk(root);
    expect(enumerationStatusCounts(after)).toEqual({ pending: 0, processing: 0, done: 1, review: 1, failed: 1, excluded: 1 });
    expect(manifest.has('term:13')).toBe(false);

    const { file: rebuilt } = rebuildConverged(truth, after, manifestOf(manifest.values()));
    expect(byKey(rebuilt, 'term:11')).toMatchObject({ status: 'done', attempts: 1, outcome: { importStatus: 'not-at-baseline' }, urls: truth.versionsOf.get('term:11') });
    expect(byKey(rebuilt, 'term:12')).toMatchObject({ status: 'review', attempts: 1, outcome: { importStatus: 'needs-review', reviewCategories: ['normativity'] } });
    // Identität allein aus der früheren Enumeration (kein Manifesteintrag nach Importfehler): bleibt term:-Eintrag mit Fehler.
    expect(byKey(rebuilt, 'term:13')).toMatchObject({ status: 'failed', attempts: 1, sourceIdentity: 'term:13', lastError: { code: 'transform-failed' } });
    expect(byKey(rebuilt, 'term:14')).toMatchObject({ status: 'excluded', attempts: 1, outcome: { importStatus: 'excluded' } });
    expect(enumerationStatusCounts(rebuilt)).toEqual(enumerationStatusCounts(after));
    expectComplete(rebuilt, truth);

    // Auswahl nach dem Rebuild: Resume hat nichts zu tun; Retry-Flags wählen genau failed bzw. review.
    await writeEnumeration(root, rebuilt);
    expect((await runBulkImport(runOptions(root, truthProcessor(truth, manifest).processor, { runId: 'idle', resume: true }))).summary.runStatus).toBe('nothing-to-do');
    const retry = truthProcessor(truth, manifest, { decide: (term) => decisions[term]! });
    const retried = await runBulkImport(runOptions(root, retry.processor, { runId: 'retry', resume: true, retryFailed: true, retryReview: true }));
    expect(retried.summary).toMatchObject({ selected: 2, processed: 2 });
    expect(retry.calls.sort()).toEqual(['term:12', 'term:13']);
    const { file: again } = rebuildConverged(truth, await onDisk(root), manifestOf(manifest.values()));
    expect(again.items.map((item) => [item.key, item.status, item.attempts])).toEqual([['term:11', 'done', 1], ['term:12', 'review', 2], ['term:13', 'failed', 2], ['term:14', 'excluded', 1]]);
  });
});

describe('Enumeration-Fixpunkt: Rangfolge der Adresszuordnung und Fortführung bekannter Terme', () => {
  const A = dated('2020-01-01', 'alpha');
  const B = dated('2021-01-01', 'alpha');
  const C = dated('2022-01-01', 'beta');
  const truth = world([
    { term: 'term:1', title: 'Richtlinie Alpha', versions: [['2020-01-01', 'alpha'], ['2021-01-01', 'alpha']] },
    { term: 'term:2', title: 'Richtlinie Beta', versions: [['2022-01-01', 'beta']] },
  ]);

  it('Manifest-Fassungslisten haben Vorrang: eine schwache Zuordnung der früheren Enumeration (Stub, ungetrimmter Eintrag) erzeugt keinen Konflikt', () => {
    const previous = buildEnumeration(buildInput(truth));
    // Früherer Zustand: Stub `stem:beta` in term:1 zusammengeführt (hält B und C), term:1 aktiv mit A – wie nach einem
    // Lauf mit nicht deckungsgleichen Fassungslisten; das Manifest von term:2 nennt C, das von term:1 nennt A und B.
    Object.assign(byKey(previous, 'stem:verwaltungsvorschrift/alpha'), { sourceIdentity: 'term:1', status: 'done', attempts: 1, urls: [A], outcome: { importStatus: 'imported' } });
    Object.assign(byKey(previous, 'stem:verwaltungsvorschrift/beta'), { mergedInto: 'term:1', status: 'done', urls: [B, C] });
    const manifest = manifestOf([manifestEntry('term:1', [A, B], 'Richtlinie Alpha', 'imported'), manifestEntry('term:2', [C], 'Richtlinie Beta', 'imported')]);
    const { file } = rebuildConverged(truth, previous, manifest);
    expect(file.items.map((item) => [item.key, item.urls])).toEqual([['term:1', [A, B]], ['term:2', [C]]]);
    expect(file.crosscheck).toMatchObject({ termConflicts: 0, notes: [], duplicateUrlAssignments: 0 });
    expect(byKey(file, 'term:2')).toMatchObject({ status: 'done', titleSource: 'search-index', outcome: { importStatus: 'imported' } });
    expectComplete(file, truth);
  });

  it('nennen zwei Manifest-Fassungslisten dieselbe Adresse, bleibt sie beim Slug-Stamm (Befund, kein Fehler) – stabil über Rebuilds', () => {
    const manifest = manifestOf([manifestEntry('term:1', [A, B], 'Richtlinie Alpha', 'imported'), manifestEntry('term:2', [B, C], 'Richtlinie Beta', 'imported')]);
    const { file } = rebuildConverged(truth, buildEnumeration(buildInput(truth)), manifest);
    expect(file.items.map((item) => [item.key, item.urls])).toEqual([['term:1', [A]], ['term:2', [C]], ['stem:verwaltungsvorschrift/alpha', [B]]]);
    expect(file.crosscheck.termConflicts).toBe(1);
    expect(file.crosscheck.notes).toEqual([`${B} ist mehreren Stammnormen zugeordnet (term:1, term:2)`]);
  });

  it('führt einen aktiven Term ohne Manifesteintrag weiter, dessen Adressen ein Manifest einer anderen Stammnorm beansprucht (kein Verlust von Identität und Stand)', () => {
    const previous = buildEnumeration(buildInput(truth));
    Object.assign(byKey(previous, 'stem:verwaltungsvorschrift/beta'), { sourceIdentity: 'term:9', status: 'excluded', attempts: 1, outcome: { importStatus: 'excluded' }, lastRunId: 'alt' });
    // Das Manifest von term:2 nennt C (die einzige Adresse von term:9); term:9 hat keinen Manifesteintrag.
    const manifest = manifestOf([manifestEntry('term:2', [C], 'Richtlinie Beta', 'imported')]);
    const { file } = rebuildConverged(truth, previous, manifest);
    expect(file.items.map((item) => item.key)).toEqual(['term:2', 'term:9', 'stem:verwaltungsvorschrift/alpha']);
    expect(byKey(file, 'term:9')).toMatchObject({ sourceIdentity: 'term:9', status: 'excluded', attempts: 1, urls: [C], outcome: { importStatus: 'excluded' }, lastRunId: 'alt' });
    expect(file.crosscheck.notes).toEqual(['term:9 wird aus der früheren Enumeration geführt (kein Manifesteintrag; alle Fassungsadressen anderen Stammnormen zugeordnet)']);
    expect(file.crosscheck).toMatchObject({ ok: true, duplicateUrlAssignments: 0 });
  });
});

describe('Enumeration-Fixpunkt: Prüfung für Readiness', () => {
  const truth = sameSlugWorld(3);

  it('checkEnumerationFixpoint: konvergierter Stand ist Fixpunkt; ein Stand mit ausstehenden Übergängen nicht', () => {
    const converged = buildEnumeration(buildInput(truth));
    expect(checkEnumerationFixpoint(converged, buildInput(truth))).toMatchObject({ fixpoint: true, differences: [], transitions: [], fingerprint: converged.contentFingerprint, rebuiltFingerprint: converged.contentFingerprint });
    // Stand wie nach einem Lauf, dessen Stammeintrag aufgelöst und auf seine Fassungsliste getrimmt ist, während die
    // übrigen Adressen des Stamms an keinem Eintrag mehr hängen: Der Rebuild muss sie erst als Restadressen öffnen.
    const stale = buildEnumeration(buildInput(truth));
    Object.assign(byKey(stale, 'stem:verwaltungsvorschrift/richtlinie-foerderung'), { sourceIdentity: 'term:102', status: 'done', attempts: 1, urls: truth.versionsOf.get('term:102') });
    const manifest = manifestOf([manifestEntry('term:102', truth.versionsOf.get('term:102')!, 'Richtlinie zur Förderung 2', 'imported')]);
    const check = checkEnumerationFixpoint(stale, buildInput(truth, { manifest }));
    expect(check.fixpoint).toBe(false);
    expect(check.differences).toEqual(['term:102 neu', 'stem:verwaltungsvorschrift/richtlinie-foerderung geändert']);
    expect(check.transitions).toEqual(['stem:verwaltungsvorschrift/richtlinie-foerderung: 3 Restadresse(n) außerhalb der Fassungsliste von term:102; Eintrag beginnt erneut offen']);
    expect(check.rebuiltFingerprint).not.toBe(check.fingerprint);
    // Der eigentliche Rebuild bringt denselben Stand zum Fixpunkt.
    expect(checkEnumerationFixpoint(buildEnumeration(buildInput(truth, { previous: stale, manifest })), buildInput(truth, { manifest })).fixpoint).toBe(true);
  });

  it('enumerationIsFixpoint(root, area, { fetcher }): liest Enumeration, Sitemap und Suchindex (offline aus dem Cache) und meldet den Fixpunkt', async () => {
    const converged = buildEnumeration(buildInput(truth));
    const root = await prepareRoot(converged);
    const pages: Record<string, string> = {
      [SITEMAP_INDEX_URL]: '<sitemapindex><sitemap><loc>https://recht.nrw.de/sitemap/page/1/sitemap.xml</loc></sitemap></sitemapindex>',
      'https://recht.nrw.de/sitemap/page/1/sitemap.xml': `<urlset>${truth.sitemap.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`,
      [SEARCH_URL]: JSON.stringify({ hits: { total: { value: truth.hits.length }, hits: truth.hits.map((hit) => ({ _id: `entity:node/${hit.nodeId}:de`, _source: { url: [hit.url.slice('https://recht.nrw.de'.length)], title: [hit.title], type: [INDEX], search_api_id: [`entity:node/${hit.nodeId}:de`] }, sort: [hit.nodeId] })) } }),
    };
    const fetcher: RechtNrwFetcher = {
      stats: { networkRequests: 0, cacheHits: 0 },
      async fetch(url: string, request: FetchRequest = {}): Promise<FetchedDocument> {
        const text = pages[url];
        if (text === undefined) throw new Error(`unerwarteter Abruf ${url}`);
        return { url, finalUrl: url, status: 200, contentType: request.method === 'POST' ? 'application/json' : 'application/xml', retrievedAt: NOW, sha256: '0'.repeat(64), bytes: new TextEncoder().encode(text), fromCache: true };
      },
    };
    const result = await enumerationIsFixpoint(root, 'lrmb', { fetcher, manifest: manifestOf([]) });
    expect(result).toMatchObject({ fixpoint: true, differences: [], fingerprint: converged.contentFingerprint });
    expect(await enumerationIsFixpoint(root, 'lrgv', { fetcher, manifest: manifestOf([]) })).toBeUndefined();
  });

  it('ohne Fixpunkt innerhalb der Obergrenze meldet der Rebuild einen harten Fehler statt einer stillen Teillösung', () => {
    expect(ENUMERATION_MAX_PASSES).toBeGreaterThanOrEqual(3);
    const error = new EnumerationFixpointError('lrmb', ENUMERATION_MAX_PASSES, ['stem:x geändert', 'term:1 neu']);
    expect(error.name).toBe('EnumerationFixpointError');
    expect(error.message).toContain(`kein Fixpunkt nach ${ENUMERATION_MAX_PASSES} Durchläufen`);
    expect(error.message).toContain('stem:x geändert; term:1 neu');
    expect(error.differences).toHaveLength(2);
  });
});
