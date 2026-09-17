/**
 * Laufzeit-Fehlermodus des Workers (apps/web/src/lib/runtime/configuration.ts): fehlende oder falsche
 * D1-Bindings sind ein Konfigurationsfehler mit klarer 500-Antwort (intern, ohne Umgebungswerte) – nie eine
 * stille leere Website. Fake-Umgebung, keine Cloudflare-Abhängigkeit.
 */
import { describe, expect, it } from 'vitest';

import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';

import { assertCompleteBindings, configurationErrorResponse, isRuntimeConfigurationError, RuntimeConfigurationError } from '../../apps/web/src/lib/runtime/configuration.ts';

const d1 = (): unknown => ({ prepare: () => ({}), batch: async () => [] });

function envWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const env: Record<string, unknown> = { APP_ENV: 'production', SITE_URL: 'https://landesrecht.example' };
  for (const jurisdiction of JURISDICTION_IDS) env[D1_BINDINGS[jurisdiction]] = d1();
  return { ...env, ...overrides };
}

const caught = (action: () => void): RuntimeConfigurationError => {
  try {
    action();
  } catch (error) {
    if (isRuntimeConfigurationError(error)) return error;
    throw error;
  }
  throw new Error('kein Konfigurationsfehler');
};

describe('Worker-Konfiguration', () => {
  it('akzeptiert eine vollständige Umgebung', () => {
    expect(() => assertCompleteBindings(envWith())).not.toThrow();
  });

  it('meldet jede fehlende oder falsche D1-Bindung mit Namen – fail-closed, keine Teilkonfiguration', () => {
    const one = caught(() => assertCompleteBindings(envWith({ LANDESRECHT_NSH: undefined })));
    expect(one.missing).toEqual(['LANDESRECHT_NSH']);
    expect(one.message).toMatch(/LANDESRECHT_NSH.*wrangler\.jsonc/u);
    const wrongType = caught(() => assertCompleteBindings(envWith({ LANDESRECHT_OST: { bucket: 'r2-statt-d1' } })));
    expect(wrongType.missing).toEqual(['LANDESRECHT_OST']);
    const all = caught(() => assertCompleteBindings({ APP_ENV: 'production' }));
    expect(all.missing).toHaveLength(JURISDICTION_IDS.length);
    expect(all.message).toMatch(/^Alle D1-Bindings fehlen/u);
  });

  it('antwortet mit einer internen 500-Klartextmeldung ohne Umgebungswerte und ohne Caching', async () => {
    const env = envWith({ LANDESRECHT_WEST: undefined, GEHEIM: 'wert-der-nie-erscheint-0123456789' });
    const error = caught(() => assertCompleteBindings(env));
    const response = configurationErrorResponse(error);
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).toMatch(/^Konfigurationsfehler des Landesrechtsportals \(HTTP 500\)\./u);
    expect(body).toContain('LANDESRECHT_WEST');
    expect(body).not.toContain('wert-der-nie-erscheint');
    expect(body).not.toContain('landesrecht.example');
    expect(isRuntimeConfigurationError(new Error('anderer Fehler'))).toBe(false);
  });
});
