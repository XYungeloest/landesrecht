/**
 * Lokaler Entwicklungsbetrieb ohne externe OstRecht-D1 (apps/web/src/lib/runtime/configuration.ts): Produktion bleibt
 * fail-closed; nur im Entwicklungsmodus wird Ost `unavailable-local` (503 für Ost-Anfragen), West/NSH/BayWü arbeiten
 * weiter. Eine lokale Kopie im OstRecht-Schema ist `fixture` (development only), nie der produktive Bestand.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { OSTRECHT_D1_BINDING, RUNTIME_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import { isJurisdictionUnavailableError } from '@landesrecht/runtime/registry.ts';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { parseSearchState } from '@landesrecht/search/query.ts';

import { buildJurisdictionsPayload } from '../../apps/web/src/lib/api-jurisdictions.ts';
import { buildWorkerRegistry, isRuntimeConfigurationError, requestedJurisdictions, unavailableJurisdictionResponse } from '../../apps/web/src/lib/runtime/configuration.ts';
import { checkHealth, healthResponse } from '../../apps/web/src/lib/runtime/health.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';

const migrationsDir = join(resolveRepositoryRoot(), 'data', 'd1');

/** Eigene D1s (leeres Landesrecht-Schema) für West/NSH/BayWü; Ost nach Wahl. */
async function env(ost: 'none' | 'empty' | 'fixture'): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { APP_ENV: 'production' };
  for (const jurisdiction of JURISDICTION_IDS) {
    if (RUNTIME_D1_BINDINGS[jurisdiction] === OSTRECHT_D1_BINDING) continue;
    result[RUNTIME_D1_BINDINGS[jurisdiction]] = await openSqliteD1(':memory:', { migrationsDir });
  }
  if (ost === 'empty') result[OSTRECHT_D1_BINDING] = await openSqliteD1(':memory:');
  if (ost === 'fixture') result[OSTRECHT_D1_BINDING] = (await openOstRechtFixture()).native;
  return result;
}

describe('Produktion bleibt fail-closed', () => {
  it('9. ohne Ost-Binding: Konfigurationsfehler und Health 503', async () => {
    const production = await env('none');
    await expect(buildWorkerRegistry(production, 'production')).rejects.toSatisfy(isRuntimeConfigurationError);
    const health = await checkHealth(production, { mode: 'production' });
    expect(health.status).toBe('error');
    expect(health.d1[OSTRECHT_D1_BINDING]).toBe('missing');
    expect(health.mode).toBeUndefined();
    expect(healthResponse(health).status).toBe(503);
    // Auch eine leere (schemalose) Ost-D1 bleibt in Produktion ein Fehler, nie ein Entwicklungszustand.
    const empty = await checkHealth(await env('empty'), { mode: 'production' });
    expect(empty.status).toBe('error');
    expect(empty.d1[OSTRECHT_D1_BINDING]).toBe('error');
  });

  it('12. mit Ost-Binding: unverändertes Verhalten, Ost mit Runtime-Status, ohne Verfügbarkeitsvermerk', async () => {
    const registry = await buildWorkerRegistry(await env('fixture'), 'production');
    expect(registry.unavailable()).toEqual([]);
    const payload = await buildJurisdictionsPayload(registry, new Date('2026-09-29T00:00:00Z'));
    const ost = payload.jurisdictions.find((entry) => entry.id === 'ost')!;
    expect(ost.availability).toBeUndefined();
    expect(ost.runtime?.syncState).toBe('complete');
    expect(ost.search).toBeDefined();
    expect(ost.normCount).toBeGreaterThan(0);
    for (const entry of payload.jurisdictions) expect(entry.availability).toBeUndefined();
  });
});

describe('Entwicklungsbetrieb ohne externe OstRecht-D1', () => {
  it('10. ohne Ost-Binding (oder mit leerer lokaler D1): West/NSH/BayWü verfügbar, Ost unavailable-local, API 200-fähig', async () => {
    for (const variant of ['none', 'empty'] as const) {
      const registry = await buildWorkerRegistry(await env(variant), 'development');
      expect(registry.has('west') && registry.has('nsh') && registry.has('baywue')).toBe(true);
      expect(registry.has('ost')).toBe(false);
      expect(registry.availability('ost')).toMatchObject({ state: 'unavailable-local', mode: 'development' });
      const payload = await buildJurisdictionsPayload(registry, new Date('2026-09-29T00:00:00Z'));
      const byId = new Map(payload.jurisdictions.map((entry) => [entry.id, entry]));
      expect(byId.get('ost')).toMatchObject({ normCount: 0, availability: { state: 'unavailable-local' } });
      expect(byId.get('ost')?.search).toBeUndefined();
      expect(byId.get('ost')?.runtime).toBeUndefined();
      for (const id of ['west', 'nsh', 'baywue'] as const) {
        expect(byId.get(id)?.availability).toBeUndefined();
        expect(byId.get(id)?.status?.baselineStatus).toBe('FROZEN');
      }
    }
    // Eigene Bindings bleiben auch lokal Pflicht.
    await expect(buildWorkerRegistry({ ...(await env('none')), LANDESRECHT_WEST: undefined }, 'development')).rejects.toSatisfy(isRuntimeConfigurationError);
  });

  it('11. Ost-spezifische Anfragen: klare 503-Antwort; gemischte Suche ohne Ost', async () => {
    const registry = await buildWorkerRegistry(await env('none'), 'development');
    expect(requestedJurisdictions(new URL('https://x/ost/norm/gemo'))).toEqual(['ost']);
    expect(requestedJurisdictions(new URL('https://x/api/v1/norms/ost/gemo'))).toEqual(['ost']);
    expect(requestedJurisdictions(new URL('https://x/bayern-wuerttemberg/'))).toEqual(['baywue']);
    expect(requestedJurisdictions(new URL('https://x/suche?jurisdiction=ost'))).toEqual([]);
    expect(() => registry.get('ost')).toThrow(/lokal nicht verfügbar/u);
    await expect(registry.search(parseSearchState(new URLSearchParams('q=Gesetz&jurisdiction=ost')))).rejects.toSatisfy(isJurisdictionUnavailableError);
    await expect(registry.search(parseSearchState(new URLSearchParams('q=Gesetz&jurisdiction=ost,west')))).resolves.toMatchObject({ total: 0 });
    expect(registry.unavailable()).toEqual([expect.objectContaining({ jurisdiction: 'ost', state: 'unavailable-local' })]);
    const api = unavailableJurisdictionResponse('ost', registry.availability('ost'), true);
    expect(api.status).toBe(503);
    expect(api.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(await api.text())).toMatchObject({ error: 'jurisdiction-unavailable', jurisdiction: 'ost', mode: 'development', availability: { state: 'unavailable-local' } });
    const page = unavailableJurisdictionResponse('ost', registry.availability('ost'), false);
    expect(page.status).toBe(503);
    expect(await page.text()).toMatch(/lokal nicht verfügbar.*Entwicklungsbetrieb/u);
  });

  it('Health: lokal fehlende Ost-D1 ist ein erwarteter, diagnostizierter Entwicklungszustand (200, degraded)', async () => {
    const health = await checkHealth(await env('none'), { mode: 'development' });
    expect(health).toMatchObject({ status: 'degraded', mode: 'development', d1: { [OSTRECHT_D1_BINDING]: 'unavailable-local', LANDESRECHT_WEST: 'ok' } });
    expect(health.diagnostics?.[0]).toMatch(/OSTRECHT_RECHT: lokal nicht gebunden/u);
    expect(healthResponse(health).status).toBe(200);
    // Ein fehlendes eigenes Binding bleibt auch lokal ein Fehler.
    const own = await checkHealth({ ...(await env('none')), LANDESRECHT_NSH: undefined }, { mode: 'development' });
    expect(own.status).toBe('error');
  });

  it('Fixture-Modus: lokale OstRecht-Kopie ist fixture / development only, nie als vollständig ausgewiesen', async () => {
    const registry = await buildWorkerRegistry(await env('fixture'), 'development');
    expect(registry.has('ost')).toBe(true);
    expect(registry.availability('ost')).toMatchObject({ state: 'fixture', mode: 'development' });
    expect(registry.availability('ost').reason).toMatch(/development only/u);
    const payload = await buildJurisdictionsPayload(registry, new Date('2026-09-29T00:00:00Z'));
    expect(payload.jurisdictions.find((entry) => entry.id === 'ost')?.availability).toMatchObject({ state: 'fixture' });
  });
});
