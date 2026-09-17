/**
 * Gemeinsame Hilfen der Bulk-Runner-Tests (Regressionstests zu Retry, Dry-run, Dubletten, Invarianten):
 * temporäre Roots mit synthetischer LRGV-Enumeration und eine günstige Stub-Verarbeitung mit echten
 * Checkpoints (Manifesteintrag und Review-Datei je Stammnorm, nur im Schreiblauf). Kein Netz.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import type { BulkRunOptions, ItemOutcome, ItemProcessor, ProcessorContext } from '@landesrecht/importer-recht-nrw/common/bulk-runner.ts';
import { buildEnumeration, readEnumeration, writeEnumeration, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { createTestEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import type { RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { writeManifestEntry, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { mergeReviewItems, writeReviewShard, type ReviewItem, type ReviewItemInput } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { SYNTHETIC_TERM_BASE, syntheticLrgvSource } from '@landesrecht/importer-recht-nrw/common/simulation.ts';
import { currentParserVersion } from '@landesrecht/importer-recht-nrw/common/staleness.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

export const NOW = new Date('2026-09-15T12:00:00.000Z');
export const fixedNow = (): Date => NOW;

const bases: string[] = [];

export async function tempBase(prefix = 'recht-nrw-bulk-'): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), prefix));
  bases.push(base);
  return base;
}

export async function cleanupTempBases(): Promise<void> {
  for (const base of bases.splice(0)) await rm(base, { recursive: true, force: true });
}

export async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

export async function listFiles(directory: string, root = directory): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(path, root)));
    else output.push(relative(root, path));
  }
  return output.sort();
}

/** Vollständiger Dateistand eines Verzeichnisses (Pfad → Inhalt). */
export async function snapshot(root: string, skip: (path: string) => boolean = () => false): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of await listFiles(root)) if (!skip(path)) map.set(path, await readFile(join(root, path), 'utf8'));
  return map;
}

export async function prepareRoot(count: number, options: { collideEvery?: number; template?: string } = {}): Promise<{ base: string; root: string; order: string[]; source: ReturnType<typeof syntheticLrgvSource> }> {
  const base = await tempBase();
  const root = join(base, 'root');
  await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
  const source = syntheticLrgvSource(options.template ?? '<html>synthetisch</html>', count, options.collideEvery !== undefined ? { collideEvery: options.collideEvery } : {});
  const file = buildEnumeration({ area: 'lrgv', sitemap: source.sitemap, search: source.search, now: NOW.toISOString() });
  await writeEnumeration(root, file);
  return { base, root, order: file.items.map((item) => item.key), source };
}

export async function enumerationOnDisk(root: string): Promise<EnumerationFile> {
  const file = await readEnumeration(root, 'lrgv');
  if (!file) throw new Error('Enumeration fehlt');
  return file;
}

export function statusCounts(file: EnumerationFile): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of file.items) if (!item.mergedInto) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

export function indexOf(key: string): number {
  const match = /synthetikverordnung-(\d+)-/u.exec(key);
  if (!match) throw new Error(`kein synthetischer Schlüssel: ${key}`);
  return Number(match[1]);
}

export function termOf(item: Pick<EnumerationItem, 'key'>): string {
  return `term:${SYNTHETIC_TERM_BASE + indexOf(item.key)}`;
}

export function stubManifestEntry(input: { item: EnumerationItem; sourceIdentity: string; slug: string; importStatus: ManifestEntry['importStatus']; runId: string; now: string }): ManifestEntry {
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
    baselineStatus: input.importStatus === 'not-at-baseline' ? 'not-active-at-baseline' : 'active-at-baseline',
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
    reconstructionStatus: input.slug ? 'direct' : 'not-applicable',
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

export interface Decision {
  status: ItemOutcome['status'];
  code?: string;
  /** Importstatus für `done` (Standard imported; z. B. not-at-baseline). */
  importStatus?: ManifestEntry['importStatus'];
  /** Review-Befunde für `review` (Standard: ein synthetischer Fall). */
  reviewInputs?: ReviewItemInput[];
  /** `failed` vor der Stammnorm-Kennung (z. B. Abruffehler): Ergebnis ohne Quellidentität und Fassungsliste. */
  withoutIdentity?: boolean;
}

export interface StubHooks {
  decide?: (item: EnumerationItem, call: number) => Decision;
  before?: (item: EnumerationItem, context: ProcessorContext, call: number) => void | Promise<void>;
  versionUrls?: (item: EnumerationItem) => string[];
  /** Quellidentität je Eintrag (Standard: aus dem synthetischen Schlüssel). */
  identity?: (item: EnumerationItem) => string;
}

export function stubProcessor(hooks: StubHooks = {}): { processor: ItemProcessor; calls: string[]; manifestWrites: string[] } {
  const calls: string[] = [];
  const manifestWrites: string[] = [];
  const processor: ItemProcessor = async (item, context) => {
    calls.push(item.key);
    await hooks.before?.(item, context, calls.length);
    const decision = hooks.decide?.(item, calls.length) ?? { status: 'done' };
    const sourceIdentity = hooks.identity?.(item) ?? termOf(item);
    const slug = `synth-${sourceIdentity.slice('term:'.length)}-west`;
    const outcome: ItemOutcome = { status: decision.status, importStatus: 'imported', sourceIdentity, versionUrls: hooks.versionUrls?.(item) ?? [...item.urls] };
    if (decision.status === 'failed') {
      outcome.importStatus = 'failed';
      outcome.errorCodes = [decision.code ?? 'synthetic-failure'];
      outcome.message = `synthetischer Fehler ${decision.code ?? ''}`.trim();
      if (decision.withoutIdentity) {
        delete outcome.sourceIdentity;
        delete outcome.versionUrls;
      }
      return outcome;
    }
    if (decision.status === 'excluded') {
      outcome.importStatus = 'excluded';
      return outcome;
    }
    const importStatus: ManifestEntry['importStatus'] = decision.status === 'review' ? 'needs-review' : decision.importStatus ?? 'imported';
    const imported = importStatus === 'imported' || importStatus === 'imported-with-warnings';
    const entry = stubManifestEntry({ item, sourceIdentity, slug: imported ? slug : '', importStatus, runId: context.runId, now: context.now().toISOString() });
    outcome.importStatus = importStatus;
    outcome.manifestEntry = entry;
    if (imported) outcome.targetSlug = slug;
    // Wie persistReview der Importpfade: Befunde des Laufs einführen (bei `done` keine), verschwundene Fälle ablösen.
    const inputs: ReviewItemInput[] = decision.status === 'review' ? decision.reviewInputs ?? [{ category: 'other', key: 'synthetic', severity: 'blocking', summary: 'Synthetischer Review-Fall', details: [item.key] }] : [];
    const queue = mergeReviewItems(context.reviewQueue, { sourceArea: 'lrgv', sourceIdentity, sourceUrl: item.entryUrl, now: context.now().toISOString() }, inputs);
    const reviewItems: ReviewItem[] = queue.items.filter((candidate) => candidate.sourceIdentity === sourceIdentity);
    if (inputs.length > 0) outcome.reviewCategories = [...new Set(inputs.map((input) => input.category))].sort();
    outcome.reviewItems = reviewItems;
    entry.reviewStatus = reviewItems.some((candidate) => candidate.status === 'open' && candidate.occurrence === 'current') ? 'open' : reviewItems.some((candidate) => candidate.status !== 'open') ? 'resolved' : 'none';
    if (context.write) {
      if (reviewItems.length > 0) await writeReviewShard(context.root, queue, 'lrgv', sourceIdentity);
      await writeManifestEntry(context.root, entry);
      manifestWrites.push(sourceIdentity);
    }
    return outcome;
  };
  return { processor, calls, manifestWrites };
}

export function noNetworkFetcher(): RechtNrwFetcher {
  return {
    stats: { networkRequests: 0, cacheHits: 0 },
    fetch: async (url) => {
      throw new Error(`unerwarteter Abruf ${url}`);
    },
  };
}

export function runOptions(root: string, overrides: Partial<BulkRunOptions> & Pick<BulkRunOptions, 'processor'>): BulkRunOptions {
  return { root, area: 'lrgv', write: true, resume: false, fetcher: noNetworkFetcher(), environment: createTestEnvironment(root), now: fixedNow, ...overrides };
}
