/**
 * Gemeinsame Helfer der Qualitäts-Audits (`scripts/audit-*.ts`): deterministische Stichproben,
 * Reportausgabe (JSON + Markdown) unter `data/audits/recht-nrw/quality/`, Korpuszugriff und
 * Zeitmessung beim Abruf der Website. Keine Netzabrufe ohne ausdrückliche Option des Aufrufers.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

export const QUALITY_REPORT_DIR = join('data', 'audits', 'recht-nrw', 'quality');
export const DEPLOYED_SITE_URL = 'https://landesrecht.xyungeloestlp.workers.dev';
/** Fester Seed aller Stichproben: gleiche Eingabe → gleiche Auswahl. */
export const AUDIT_SEED = 20231201;

export const repositoryRoot = (): string => resolveRepositoryRoot();

/** Kommandozeilenoptionen `--name wert` und Schalter `--flag`. */
export function parseCliArgs(argv: readonly string[]): { flags: Set<string>; values: Map<string, string> } {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values.set(argument.slice(2), next);
      index += 1;
    } else {
      flags.add(argument.slice(2));
    }
  }
  return { flags, values };
}

/** mulberry32: kleiner, deterministischer Zufallsgenerator für Stichproben. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministische Stichprobe ohne Zurücklegen (Fisher-Yates mit Seed) über bereits sortierte Eingaben. */
export function seededSample<T>(items: readonly T[], count: number, seed = AUDIT_SEED): T[] {
  const random = createSeededRandom(seed);
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Gleichmäßige Stichprobe: jedes k-te Element ab dem ersten (deterministisch, ohne Zufall). */
export function stridedSample<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (items.length <= count) return [...items];
  const step = items.length / count;
  const result: T[] = [];
  for (let index = 0; index < count; index += 1) result.push(items[Math.floor(index * step)]!);
  return result;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function mdEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}

export function mdTable(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map(mdEscape).join(' | ')} |`);
  return lines.join('\n');
}

export interface AuditReport {
  name: string;
  json: unknown;
  markdown: string;
}

/** Schreibt `<name>.json` und `<name>.md` deterministisch (keine Zeitstempel, feste Sortierung). */
export async function writeAuditReport(report: AuditReport, root = repositoryRoot()): Promise<{ json: string; markdown: string }> {
  const directory = join(root, QUALITY_REPORT_DIR);
  await mkdir(directory, { recursive: true });
  const json = join(directory, `${report.name}.json`);
  const markdown = join(directory, `${report.name}.md`);
  await writeFile(json, stableJson(report.json), 'utf8');
  await writeFile(markdown, report.markdown.endsWith('\n') ? report.markdown : `${report.markdown}\n`, 'utf8');
  return { json, markdown };
}

/** West-Bestand, nach Slug sortiert (deterministische Reihenfolge für alle Audits). */
export async function loadWestCorpus(root = repositoryRoot()): Promise<NormRecord[]> {
  const norms = await loadJurisdictionNorms('west', root);
  return norms.sort((left, right) => left.meta.slug.localeCompare(right.meta.slug));
}

export interface FetchedPage {
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  bytes: number;
  contentType: string;
  body: string;
  error?: string;
}

/** GET mit Zeitmessung; Fehler werden als Status 0 gemeldet, nie geworfen. */
export async function fetchPage(url: string, init: { method?: 'GET' | 'HEAD'; timeoutMs?: number } = {}): Promise<FetchedPage> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(url, { method: init.method ?? 'GET', redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'landesrecht-audit/1 (+quality audit, read-only)' } });
    const body = init.method === 'HEAD' ? '' : await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok,
      durationMs: Math.round(performance.now() - started),
      bytes: init.method === 'HEAD' ? Number.parseInt(response.headers.get('content-length') ?? '0', 10) || 0 : Buffer.byteLength(body, 'utf8'),
      contentType: response.headers.get('content-type') ?? '',
      body,
    };
  } catch (error) {
    return { url, status: 0, ok: false, durationMs: Math.round(performance.now() - started), bytes: 0, contentType: '', body: '', error: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface PageFetcher {
  get(url: string): Promise<FetchedPage>;
  readonly requests: number;
  readonly cacheHits: number;
}

/**
 * Seitenabruf mit Budget, optionalem Mindestabstand und optionalem lokalen HTML-Cache (nur für
 * wiederholte Entwicklungsläufe; der Cache liegt außerhalb des Repositories). Gecachte Antworten
 * zählen nicht gegen das Budget.
 */
export function createPageFetcher(options: { budget: number; cacheDir?: string; delayMs?: number }): PageFetcher {
  const budget = createRequestBudget(options.budget);
  let cacheHits = 0;
  let last = 0;
  const cacheFile = (url: string): string | undefined => {
    if (!options.cacheDir) return undefined;
    return join(options.cacheDir, `${createHash('sha1').update(url).digest('hex')}.json`);
  };
  return {
    async get(url) {
      const file = cacheFile(url);
      if (file) {
        try {
          const cached = JSON.parse(await readFile(file, 'utf8')) as FetchedPage;
          cacheHits += 1;
          return cached;
        } catch {
          // kein Cacheeintrag
        }
      }
      budget.take();
      const wait = options.delayMs ? last + options.delayMs - Date.now() : 0;
      if (wait > 0) await sleep(wait);
      const page = await fetchPage(url);
      last = Date.now();
      if (file) {
        await mkdir(options.cacheDir!, { recursive: true });
        await writeFile(file, stableJson(page), 'utf8');
      }
      return page;
    },
    get requests() { return budget.used; },
    get cacheHits() { return cacheHits; },
  };
}

/** Abrufzähler mit hartem Budget (Schutz vor unbeabsichtigt vielen Anfragen). */
export function createRequestBudget(limit: number): { take(): void; readonly used: number; readonly limit: number } {
  let used = 0;
  return {
    take() {
      if (used >= limit) throw new Error(`Abrufbudget von ${limit} Anfragen erschöpft`);
      used += 1;
    },
    get used() { return used; },
    get limit() { return limit; },
  };
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
}
