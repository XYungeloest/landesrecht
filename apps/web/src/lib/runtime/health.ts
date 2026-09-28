/**
 * Nichtsensitiver Healthcheck (`GET /health`): Worker lebt, je Jurisdiktion ist das D1-Binding vorhanden und
 * antwortet auf `SELECT 1` innerhalb einer kurzen Frist. Kein R2-Zugriff, keine Bestandszahlen, keine
 * Umgebungswerte – nur Binding-Namen (aus wrangler.jsonc) und ein Status je Binding. Ohne Worker-Umgebung
 * (Node-Prerendering, lokaler Dateistore) wird `storage: file` gemeldet. Testbar mit Fake-Umgebung
 * (tests/unit/web-runtime-health.test.ts).
 */
import { JURISDICTION_IDS, JURISDICTIONS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { OSTRECHT_D1_BINDING, RUNTIME_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import type { D1Database } from '@landesrecht/runtime/d1-types.ts';
import { OSTRECHT_SYNC_STATE_COMPLETE } from '@landesrecht/runtime/ostrecht-contract.ts';
import { getOstRechtFreshness, type SearchCoverage } from '@landesrecht/runtime/ostrecht-freshness.ts';
import { createReadOnlyD1 } from '@landesrecht/runtime/read-only-d1.ts';

export type BindingHealth = 'ok' | 'missing' | 'error' | 'timeout' | 'incomplete';

export interface HealthReport {
  /** `degraded`: alle Bindings antworten, aber die Suche ist nur teilweise bereit (HTTP 200, kein Ausfall). */
  status: 'ok' | 'degraded' | 'error';
  worker: 'ok';
  storage: 'd1' | 'file';
  d1: Record<string, BindingHealth>;
  /**
   * Such-Readiness der OstRecht-D1 (nur wenn gebunden): `partial`, wenn am Landesrecht-Stichtag geltende Fassungen im
   * Volltextindex von OstRecht fehlen; `fullText` benennt, dass frühere Fassungen dort nie volltextindexiert sind.
   */
  search?: Record<string, SearchCoverage | { readiness: 'unknown' }>;
  checkedAt: string;
}

export interface HealthOptions {
  /** Frist je D1-Abfrage (Standard 3 000 ms). */
  timeoutMs?: number;
  now?: () => Date;
}

export const HEALTH_TIMEOUT_MS = 3_000;

/** OstRecht-D1: zusätzlich muss der vorgelagerte Sync vollständig sein (`sync_state = complete`), sonst `incomplete`. */
const OSTRECHT_PROBE = "SELECT CASE WHEN (SELECT value FROM law_runtime_meta WHERE key = 'sync_state') = ? THEN 1 ELSE 2 END AS ok";

async function probeBinding(binding: unknown, timeoutMs: number, kind: 'landesrecht' | 'ostrecht' = 'landesrecht'): Promise<BindingHealth> {
  if (!binding || typeof (binding as D1Database).prepare !== 'function') return 'missing';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const query = Promise.resolve()
      .then(() => (kind === 'ostrecht'
        ? (binding as D1Database).prepare(OSTRECHT_PROBE).bind(OSTRECHT_SYNC_STATE_COMPLETE).first<{ ok: number }>()
        : (binding as D1Database).prepare('SELECT 1 AS ok').first<{ ok: number }>()))
      .then((row): BindingHealth => (row && Number(row.ok) === 1 ? 'ok' : row && Number(row.ok) === 2 ? 'incomplete' : 'error'), (): BindingHealth => 'error');
    return await Promise.race([query, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkHealth(env: Record<string, unknown> | null, options: HealthOptions = {}): Promise<HealthReport> {
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const d1: Record<string, BindingHealth> = {};
  if (env) {
    const bindings = [...new Set(JURISDICTION_IDS.map((jurisdiction) => RUNTIME_D1_BINDINGS[jurisdiction]))];
    const kindOf = (binding: string): 'landesrecht' | 'ostrecht' => (binding === OSTRECHT_D1_BINDING && JURISDICTIONS.ost.runtimeSource === 'ostrecht-d1' ? 'ostrecht' : 'landesrecht');
    const results = await Promise.all(bindings.map(async (binding) => [binding, await probeBinding(env[binding], timeoutMs, kindOf(binding))] as const));
    for (const [binding, health] of results) d1[binding] = health;
  }
  const healthy = env === null || Object.values(d1).every((health) => health === 'ok');
  let search: HealthReport['search'];
  if (env && d1[OSTRECHT_D1_BINDING] === 'ok' && JURISDICTIONS.ost.runtimeSource === 'ostrecht-d1') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<{ readiness: 'unknown' }>((resolve) => { timer = setTimeout(() => resolve({ readiness: 'unknown' }), timeoutMs); });
      const coverage = getOstRechtFreshness(createReadOnlyD1(env[OSTRECHT_D1_BINDING] as D1Database)).then((report) => report.coverage, (): { readiness: 'unknown' } => ({ readiness: 'unknown' }));
      search = { [OSTRECHT_D1_BINDING]: await Promise.race([coverage, deadline]) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const degraded = healthy && search !== undefined && Object.values(search).some((entry) => entry.readiness !== 'ready');
  return { status: healthy ? (degraded ? 'degraded' : 'ok') : 'error', worker: 'ok', storage: env ? 'd1' : 'file', d1, ...(search ? { search } : {}), checkedAt: now().toISOString() };
}

/** 200 bei `ok`, sonst 503; nie cachen. */
export function healthResponse(report: HealthReport): Response {
  return new Response(`${JSON.stringify(report, null, 2)}\n`, {
    status: report.status === 'error' ? 503 : 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
