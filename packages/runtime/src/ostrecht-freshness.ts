/**
 * Freshness der OstRecht-D1 gegenüber dem Landesrecht-Stichtag (nur Leseabfragen).
 *
 * OstRecht indexiert Sucheinheiten nur für die an seinem eigenen Projektionsstichtag geltende Fassung. Rückt
 * `EDITORIAL_REFERENCE_DATE` von Landesrecht über den Beginn einer Folgefassung hinaus, bevor OstRecht neu
 * synchronisiert, gilt hier eine Fassung als aktuell, deren Sucheinheiten fehlen. Dieser Check nennt genau diese
 * Normen (`staleNorms`), den Projektionsstand von OstRecht (`law_runtime_meta`, Fenster des indexierten Stichtags) und
 * leitet daraus die Such-Readiness ab: `ready` (jede geltende Fassung ist indexiert) oder `partial`. Er schreibt und
 * synchronisiert nichts. Frühere Fassungen sind in Variante A nie volltextindexiert (`historicalFullText`).
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';

import type { ReadOnlyD1Database } from './read-only-d1.ts';

export type SearchReadiness = 'ready' | 'partial';
/** Umfang des Volltextindex je Jurisdiktion. */
export type FullTextCoverage = 'all-versions' | 'current-version-only';

export interface SearchCoverage {
  /** `ready`: jede am Stichtag geltende Fassung ist volltextindexiert; `partial`: einzelne geltende Fassungen fehlen im Index. */
  readiness: SearchReadiness;
  fullText: FullTextCoverage;
  /** Fassungsnavigation und Versionsseiten früherer Fassungen sind immer vollständig. */
  historicalVersions: 'navigable';
  /** Normen, deren geltende Fassung im Volltextindex fehlt (nur Titel, Abkürzung und Metadaten suchbar). */
  staleNormCount: number;
}

export const FULL_SEARCH_COVERAGE: SearchCoverage = { readiness: 'ready', fullText: 'all-versions', historicalVersions: 'navigable', staleNormCount: 0 };

export interface OstRechtStaleNorm {
  slug: string;
  /** Am Landesrecht-Stichtag geltende Fassung (ohne Sucheinheiten). */
  currentVersionId: string;
  currentValidFrom: string;
  /** Von OstRecht indexierte Fassung derselben Norm (falls vorhanden). */
  indexedVersionId: string | null;
}

export interface OstRechtFreshnessReport {
  referenceDate: string;
  upstream: {
    syncedAt: string | null;
    syncState: string | null;
    projectionFingerprint: string | null;
    /** Fenster des OstRecht-Projektionsstichtags: jüngster Beginn einer dort geltenden, frühester Beginn einer dort künftigen Fassung. */
    indexedAsOf: { notBefore: string | null; before: string | null };
  };
  staleNorms: OstRechtStaleNorm[];
  /** true, wenn mehr als `STALE_NORM_LIMIT` Normen betroffen sind (Liste gekürzt). */
  truncated: boolean;
  coverage: SearchCoverage;
  checkedAt: string;
}

export const STALE_NORM_LIMIT = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export interface OstRechtFreshnessOptions {
  asOf?: string;
  now?: () => Date;
}

export async function checkOstRechtFreshness(db: Pick<ReadOnlyD1Database, 'prepare'>, options: OstRechtFreshnessOptions = {}): Promise<OstRechtFreshnessReport> {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  if (!ISO_DATE.test(asOf)) throw new Error(`Kein ISO-Datum: ${asOf}`);
  const now = options.now ?? (() => new Date());
  const meta = new Map((await db.prepare("SELECT key, value FROM law_runtime_meta WHERE key IN ('last_sync_at', 'sync_state', 'projection_fingerprint')").all<{ key: string; value: string }>()).results.map((row) => [row.key, row.value]));
  const window = await db.prepare(
    `SELECT (SELECT max(v.valid_from) FROM law_versions v WHERE v.temporal_kind = 'current') AS not_before,
            (SELECT min(v.valid_from) FROM law_versions v WHERE v.temporal_kind = 'future') AS before`,
  ).first<{ not_before: string | null; before: string | null }>();
  const rows = (await db.prepare(
    `SELECT n.slug AS slug, v.version_id AS version_id, v.valid_from AS valid_from,
            (SELECT u.version_id FROM law_search_units u WHERE u.norm_id = n.id LIMIT 1) AS indexed_version_id
     FROM law_versions v JOIN law_norms n ON n.id = v.norm_id
     WHERE v.valid_from <= ? AND (v.valid_to IS NULL OR v.valid_to >= ?)
       AND n.status NOT IN ('repealed', 'historical', 'pending-effective')
       AND NOT EXISTS (SELECT 1 FROM law_search_units u WHERE u.norm_id = v.norm_id AND u.version_id = v.version_id)
     ORDER BY n.slug LIMIT ?`,
  ).bind(asOf, asOf, STALE_NORM_LIMIT + 1).all<{ slug: string; version_id: string; valid_from: string; indexed_version_id: string | null }>()).results;
  const truncated = rows.length > STALE_NORM_LIMIT;
  const staleNorms = rows.slice(0, STALE_NORM_LIMIT).map((row) => ({ slug: row.slug, currentVersionId: row.version_id, currentValidFrom: row.valid_from, indexedVersionId: row.indexed_version_id ?? null }));
  return {
    referenceDate: asOf,
    upstream: { syncedAt: meta.get('last_sync_at') ?? null, syncState: meta.get('sync_state') ?? null, projectionFingerprint: meta.get('projection_fingerprint') ?? null, indexedAsOf: { notBefore: window?.not_before ?? null, before: window?.before ?? null } },
    staleNorms,
    truncated,
    coverage: { readiness: staleNorms.length === 0 ? 'ready' : 'partial', fullText: 'current-version-only', historicalVersions: 'navigable', staleNormCount: truncated ? STALE_NORM_LIMIT + 1 : staleNorms.length },
    checkedAt: now().toISOString(),
  };
}

interface CacheEntry {
  checkedAt: number;
  asOf: string;
  promise: Promise<OstRechtFreshnessReport>;
}

const cache = new WeakMap<object, CacheEntry>();
export const OSTRECHT_FRESHNESS_RECHECK_MS = 5 * 60_000;

/** Zwischengespeicherter Freshness-Bericht je Binding (der Worker fragt ihn bei jeder Ost-Suche ab). */
export async function getOstRechtFreshness(db: ReadOnlyD1Database, options: OstRechtFreshnessOptions & { recheckAfterMs?: number; clock?: () => number } = {}): Promise<OstRechtFreshnessReport> {
  const clock = options.clock ?? Date.now;
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const cached = cache.get(db);
  if (cached && cached.asOf === asOf && clock() - cached.checkedAt < (options.recheckAfterMs ?? OSTRECHT_FRESHNESS_RECHECK_MS)) return cached.promise;
  const promise = checkOstRechtFreshness(db, options);
  cache.set(db, { checkedAt: clock(), asOf, promise });
  try {
    return await promise;
  } catch (error) {
    cache.delete(db);
    throw error;
  }
}

export function resetOstRechtFreshnessCache(db: object): void {
  cache.delete(db);
}
