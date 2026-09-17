/**
 * Healthcheck `/health` (apps/web/src/lib/runtime/health.ts) mit Fake-Umgebung: Worker lebt, D1-Bindings je
 * Jurisdiktion erreichbar/fehlend/fehlerhaft/zu langsam; Antwortcodes 200/503; keine internen Daten, kein Cache.
 */
import { describe, expect, it } from 'vitest';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';

import { checkHealth, HEALTH_TIMEOUT_MS, healthResponse } from '../../apps/web/src/lib/runtime/health.ts';

function fakeD1(behaviour: 'ok' | 'throws' | 'hangs' | 'wrong' = 'ok') {
  const queries: string[] = [];
  return {
    queries,
    prepare(query: string) {
      queries.push(query);
      return {
        bind() { return this; },
        async first() {
          if (behaviour === 'throws') throw new Error('D1_ERROR: no such table');
          if (behaviour === 'hangs') return new Promise(() => undefined);
          return behaviour === 'wrong' ? { ok: 0 } : { ok: 1 };
        },
        async all() { return { results: [], success: true }; },
        async run() { return { results: [], success: true }; },
      };
    },
    async batch() { return []; },
  };
}

function fullEnv(): Record<string, unknown> {
  const env: Record<string, unknown> = { APP_ENV: 'production', SECRET_LIKE_VALUE: 'nicht-ausgeben-0123456789' };
  for (const jurisdiction of JURISDICTION_IDS) env[D1_BINDINGS[jurisdiction]] = fakeD1();
  return env;
}

describe('Healthcheck', () => {
  it('meldet ok, wenn jede D1-Bindung SELECT 1 beantwortet, und fragt nur das', async () => {
    const env = fullEnv();
    const report = await checkHealth(env, { now: () => new Date('2026-09-16T10:00:00Z') });
    expect(report).toEqual({ status: 'ok', worker: 'ok', storage: 'd1', d1: { LANDESRECHT_WEST: 'ok', LANDESRECHT_NSH: 'ok', LANDESRECHT_OST: 'ok', LANDESRECHT_BAYWUE: 'ok' }, checkedAt: '2026-09-16T10:00:00.000Z' });
    for (const jurisdiction of JURISDICTION_IDS) expect((env[D1_BINDINGS[jurisdiction]] as ReturnType<typeof fakeD1>).queries).toEqual(['SELECT 1 AS ok']);
    const response = healthResponse(report);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.text();
    expect(body).not.toContain('nicht-ausgeben');
    expect(JSON.parse(body)).toEqual(report);
  });

  it('meldet fehlende, fehlerhafte und zu langsame Bindungen einzeln und antwortet mit 503', async () => {
    const env = fullEnv();
    delete env.LANDESRECHT_NSH;
    env.LANDESRECHT_OST = fakeD1('throws');
    env.LANDESRECHT_BAYWUE = fakeD1('hangs');
    const report = await checkHealth(env, { timeoutMs: 20 });
    expect(report.status).toBe('error');
    expect(report.d1).toEqual({ LANDESRECHT_WEST: 'ok', LANDESRECHT_NSH: 'missing', LANDESRECHT_OST: 'error', LANDESRECHT_BAYWUE: 'timeout' });
    expect(healthResponse(report).status).toBe(503);
    const wrong = fullEnv();
    wrong.LANDESRECHT_WEST = fakeD1('wrong');
    expect((await checkHealth(wrong)).d1.LANDESRECHT_WEST).toBe('error');
    const notD1 = fullEnv();
    notD1.LANDESRECHT_WEST = { bucket: 'kein-d1' };
    expect((await checkHealth(notD1)).d1.LANDESRECHT_WEST).toBe('missing');
  });

  it('meldet außerhalb des Workers den Dateistore und bleibt ok', async () => {
    const report = await checkHealth(null);
    expect(report).toMatchObject({ status: 'ok', worker: 'ok', storage: 'file', d1: {} });
    expect(HEALTH_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });
});
