/**
 * Nichtsensitiver Healthcheck (`GET /health`): Worker lebt, je Jurisdiktion ist das D1-Binding vorhanden und
 * antwortet auf `SELECT 1` innerhalb einer kurzen Frist. Kein R2-Zugriff, keine Bestandszahlen, keine
 * Umgebungswerte – nur Binding-Namen (aus wrangler.jsonc) und ein Status je Binding. Ohne Worker-Umgebung
 * (Node-Prerendering, lokaler Dateistore) wird `storage: file` gemeldet. Testbar mit Fake-Umgebung
 * (tests/unit/web-runtime-health.test.ts).
 */
import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import type { D1Database } from '@landesrecht/runtime/d1-types.ts';

export type BindingHealth = 'ok' | 'missing' | 'error' | 'timeout';

export interface HealthReport {
  status: 'ok' | 'error';
  worker: 'ok';
  storage: 'd1' | 'file';
  d1: Record<string, BindingHealth>;
  checkedAt: string;
}

export interface HealthOptions {
  /** Frist je D1-Abfrage (Standard 3 000 ms). */
  timeoutMs?: number;
  now?: () => Date;
}

export const HEALTH_TIMEOUT_MS = 3_000;

async function probeBinding(binding: unknown, timeoutMs: number): Promise<BindingHealth> {
  if (!binding || typeof (binding as D1Database).prepare !== 'function') return 'missing';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const query = Promise.resolve()
      .then(() => (binding as D1Database).prepare('SELECT 1 AS ok').first<{ ok: number }>())
      .then((row): BindingHealth => (row && Number(row.ok) === 1 ? 'ok' : 'error'), (): BindingHealth => 'error');
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
    const results = await Promise.all(JURISDICTION_IDS.map(async (jurisdiction) => [D1_BINDINGS[jurisdiction], await probeBinding(env[D1_BINDINGS[jurisdiction]], timeoutMs)] as const));
    for (const [binding, health] of results) d1[binding] = health;
  }
  const healthy = env === null || Object.values(d1).every((health) => health === 'ok');
  return { status: healthy ? 'ok' : 'error', worker: 'ok', storage: env ? 'd1' : 'file', d1, checkedAt: now().toISOString() };
}

/** 200 bei `ok`, sonst 503; nie cachen. */
export function healthResponse(report: HealthReport): Response {
  return new Response(`${JSON.stringify(report, null, 2)}\n`, {
    status: report.status === 'ok' ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
