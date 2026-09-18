/**
 * Gezielter, resumierbarer Abruf der Verkündungen, die eine Rückrechnung braucht.
 *
 * Der Bedarf entsteht **nur** aus dem Gang der Kette (`walk.ts`): Nennt ein Einleitungssatz oder das Vollzitat
 * eine Änderung, deren Seite nicht im Cache liegt, ist das ein Bedarf. Abgerufen wird ausschließlich über den
 * Adapter-Fetcher (`createBayernRechtFetcher`: sequenziell, Mindestabstand, identifizierender User-Agent, Cache
 * mit Prüfsumme, Negativ-Cache für 404), mit Abrufbudget. Nach jeder Runde wird der Gang neu berechnet – eine
 * gefundene Seite kann den nächsten Verweis freilegen (Kette über mehrere Stufen, PDF-Ausgaben älterer
 * Jahrgänge über das Ausgabenverzeichnis).
 *
 * **Nie doppelt:** Was im Cache liegt oder belegt 404 ist, wird nicht erneut abgerufen. Der Prüfpunkt
 * (`reconstruction-fetch.json`) hält jeden Versuch fest; ein abgebrochener Lauf setzt an derselben Stelle fort,
 * und ein Wiederholungslauf mit `--offline` läuft vollständig netzfrei.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { IMPORT_DATA_DIR } from '../common/constants.ts';
import { createBayernRechtFetcher, RUN_STOPPING_FETCH_ERRORS } from '../common/fetcher.ts';
import { loadRunContext, type RunContext } from './context.ts';
import { packageUrl, parseCurrentNorm, readCached } from './source.ts';
import { walkChain, type WalkInput } from './walk.ts';
import type { CurrentNorm } from './source.ts';

export const FETCH_CHECKPOINT_PATH = `${IMPORT_DATA_DIR}/reconstruction-fetch.json`;
export const FETCH_CHECKPOINT_SCHEMA = 'bayernrecht-reconstruction-fetch/1' as const;

export interface FetchAttempt {
  url: string;
  status: 'fetched' | 'cached' | 'not-found' | 'error';
  sha256?: string;
  bytes?: number;
  contentType?: string;
  retrievedAt?: string;
  error?: string;
  /** Normen, deren Kette die Quelle braucht. */
  neededBy: string[];
  round: number;
}

export interface FetchCheckpoint {
  schemaVersion: typeof FETCH_CHECKPOINT_SCHEMA;
  /** Netzabrufe aller Läufe zusammen (aus den Versuchen mit Status `fetched`/`not-found`/`error`). */
  networkRequests: number;
  attempts: FetchAttempt[];
}

/** Eingaben des Gangs für eine Norm (aus Kontext und heutigem Paket). */
export function walkInputFor(ctx: RunContext, documentId: string, norm: CurrentNorm): WalkInput {
  return {
    root: ctx.root,
    baselineDate: ctx.baselineDate,
    evaluationDate: ctx.evaluationDate,
    identity: norm.identity,
    ...(norm.inForceFrom ? { inForceFrom: norm.inForceFrom } : {}),
    ...(norm.fullCitation ? { fullCitation: norm.fullCitation } : {}),
    ...(norm.changeHistory ? { changeHistory: norm.changeHistory } : {}),
    ...(ctx.registerNotes.has(documentId) ? { registerNotes: ctx.registerNotes.get(documentId)! } : {}),
    ledgerEvents: ctx.eventsByDocument.get(documentId) ?? [],
    ledgerByPublication: ctx.ledgerByPublication,
    postBaselinePublications: ctx.postBaselinePublications,
    amendingByPage: ctx.amendingByPage,
  };
}

/** Alle fehlenden Quellen der Ketten aller geänderten Normen: Adresse → Normen. */
export async function collectNeeds(ctx: RunContext, only?: readonly string[]): Promise<Map<string, Set<string>>> {
  const needs = new Map<string, Set<string>>();
  for (const decision of ctx.baseline.decisions) {
    if (decision.class !== 'changed-after-baseline') continue;
    if (only && !only.includes(decision.documentId)) continue;
    const source = await readCached(ctx.root, packageUrl(decision.documentId));
    if (!source) continue;
    let norm: CurrentNorm;
    try {
      norm = parseCurrentNorm(decision.documentId, source, ctx.evaluationDate);
    } catch {
      continue;
    }
    const walk = await walkChain(walkInputFor(ctx, decision.documentId, norm));
    for (const url of walk.needs) needs.set(url, new Set([...(needs.get(url) ?? []), decision.documentId]));
  }
  return needs;
}

async function readCheckpoint(root: string): Promise<FetchCheckpoint> {
  try {
    const parsed = JSON.parse(await readFile(join(root, FETCH_CHECKPOINT_PATH), 'utf8')) as FetchCheckpoint;
    if (parsed.schemaVersion === FETCH_CHECKPOINT_SCHEMA) return parsed;
  } catch {
    // kein Prüfpunkt: erster Lauf
  }
  return { schemaVersion: FETCH_CHECKPOINT_SCHEMA, networkRequests: 0, attempts: [] };
}

export interface AcquireOptions {
  maxRequests: number;
  offline: boolean;
  maxRounds?: number;
  only?: readonly string[];
  log?: (line: string) => void;
  /** Mindestabstand zwischen Netzabrufen (Standard des Fetchers). */
  minDelayMs?: number;
}

export interface AcquireResult {
  rounds: number;
  networkRequests: number;
  cacheHits: number;
  fetched: number;
  notFound: number;
  errors: number;
  /** Nach dem letzten Lauf noch fehlende Quellen (Budget, offline, Fehler). */
  stillMissing: string[];
  stoppedBy?: string;
  checkpoint: FetchCheckpoint;
}

/**
 * Runden: Bedarf aus dem Gang berechnen → fehlende Seiten nacheinander abrufen → neu berechnen, bis kein neuer
 * Bedarf entsteht oder das Budget erschöpft ist. Der Prüfpunkt wird nach jedem Abruf fortgeschrieben.
 */
export async function acquireSources(root: string, options: AcquireOptions): Promise<AcquireResult> {
  const log = options.log ?? ((): void => undefined);
  const checkpoint = await readCheckpoint(root);
  const fetcher = createBayernRechtFetcher({ root, offline: options.offline, budget: { maxRequests: options.maxRequests }, ...(options.minDelayMs !== undefined ? { minDelayMs: options.minDelayMs } : {}) });
  const attempted = new Set(checkpoint.attempts.filter((attempt) => attempt.status === 'not-found' || attempt.status === 'error').map((attempt) => attempt.url));
  const result: AcquireResult = { rounds: 0, networkRequests: 0, cacheHits: 0, fetched: 0, notFound: 0, errors: 0, stillMissing: [], checkpoint };
  const maxRounds = options.maxRounds ?? 6;
  const record = async (attempt: FetchAttempt): Promise<void> => {
    checkpoint.attempts = [...checkpoint.attempts.filter((entry) => entry.url !== attempt.url), attempt].sort((left, right) => (left.url < right.url ? -1 : 1));
    await writeJsonAtomic(join(root, FETCH_CHECKPOINT_PATH), checkpoint);
  };
  for (let round = 1; round <= maxRounds; round += 1) {
    const ctx = await loadRunContext(root);
    const needs = await collectNeeds(ctx, options.only);
    const open = [...needs.keys()].filter((url) => !attempted.has(url)).sort();
    result.rounds = round;
    log(`Runde ${round}: ${needs.size} fehlende Quelle(n), davon ${open.length} noch nicht versucht`);
    if (open.length === 0) {
      result.stillMissing = [...needs.keys()].sort();
      break;
    }
    for (const url of open) {
      const neededBy = [...needs.get(url)!].sort();
      try {
        const document = await fetcher.fetch(url, url.endsWith('.pdf') ? { accept: 'application/pdf' } : {});
        if (document.fromCache) result.cacheHits += 1;
        else {
          result.fetched += 1;
          checkpoint.networkRequests += 1;
        }
        await record({ url, status: document.fromCache ? 'cached' : 'fetched', sha256: document.sha256, bytes: document.bytes.byteLength, contentType: document.contentType, retrievedAt: document.retrievedAt, neededBy, round });
        log(`  ${document.fromCache ? 'Cache ' : 'Abruf '} ${url} (${neededBy.slice(0, 3).join(', ')}${neededBy.length > 3 ? ' …' : ''})`);
      } catch (error) {
        const kind = (error as { kind?: string }).kind;
        if (kind && RUN_STOPPING_FETCH_ERRORS.includes(kind as never)) {
          result.stoppedBy = `${kind}: ${(error as Error).message}`;
          log(`  Halt: ${result.stoppedBy}`);
          break;
        }
        if (kind === 'network' && options.offline) {
          result.stillMissing.push(url);
          continue;
        }
        attempted.add(url);
        if (kind === 'not-found') {
          result.notFound += 1;
          // Ein Negativ-Cache-Treffer ist kein Netzabruf.
          const known = checkpoint.attempts.find((attempt) => attempt.url === url && attempt.status === 'not-found');
          if (!known) checkpoint.networkRequests += 1;
          await record({ url, status: 'not-found', neededBy, round });
          log(`  404    ${url}`);
        } else {
          result.errors += 1;
          checkpoint.networkRequests += 1;
          await record({ url, status: 'error', error: (error as Error).message, neededBy, round });
          log(`  Fehler ${url}: ${(error as Error).message}`);
        }
      }
    }
    if (result.stoppedBy || options.offline) {
      const ctxAfter = await loadRunContext(root);
      result.stillMissing = [...(await collectNeeds(ctxAfter, options.only)).keys()].sort();
      break;
    }
  }
  result.networkRequests = fetcher.stats.networkRequests;
  result.cacheHits += 0;
  await writeJsonAtomic(join(root, FETCH_CHECKPOINT_PATH), checkpoint);
  return result;
}
