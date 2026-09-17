/**
 * Datenzugriff je Anfrage. Im Cloudflare-Worker bindet die Registry die D1-Datenbanken der
 * Jurisdiktionen; ohne Worker (Prerendering im Node-Build, lokale Entwicklung ohne Wrangler,
 * Tests) fällt sie auf den Dateistore über content/ zurück. Die Dateiloader (node:fs) werden
 * dynamisch importiert, damit das Worker-Bundle sie nie auflösen muss.
 */
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { createFederalProvider } from '@landesrecht/providers/federal.ts';
import { createContentProvider } from '@landesrecht/providers/content-provider.ts';
import { createOstRechtProvider } from '@landesrecht/providers/ostrecht-provider.ts';
import { createReferenceResolver, type ReferenceResolver } from '@landesrecht/providers/resolver.ts';
import { createRegistryFromEnv, createStoreRegistry, type StoreRegistry } from '@landesrecht/runtime/registry.ts';
import type { NormStore } from '@landesrecht/runtime/store.ts';

import { assertCompleteBindings } from './configuration.ts';

let workerEnvPromise: Promise<Record<string, unknown> | null> | null = null;
let fileRegistryPromise: Promise<StoreRegistry> | null = null;

/** Worker-Umgebung (`cloudflare:workers`) oder `null` außerhalb des Workers (Prerendering, Tests). */
export async function resolveWorkerEnv(): Promise<Record<string, unknown> | null> {
  workerEnvPromise ??= (async () => {
    try {
      const module = (await import(/* @vite-ignore */ 'cloudflare:workers')) as { env?: Record<string, unknown> };
      return module.env ?? null;
    } catch {
      return null;
    }
  })();
  return workerEnvPromise;
}

function createFileRegistry(): Promise<StoreRegistry> {
  fileRegistryPromise ??= (async () => {
    const [{ loadJurisdictionNorms }, { createFileNormStore }] = await Promise.all([
      import('@landesrecht/legal-core/lib/loader.ts'),
      import('@landesrecht/runtime/file-store.ts'),
    ]);
    const stores: Partial<Record<JurisdictionId, NormStore>> = {};
    for (const jurisdiction of JURISDICTION_IDS) {
      stores[jurisdiction] = createFileNormStore(jurisdiction, await loadJurisdictionNorms(jurisdiction));
    }
    return createStoreRegistry(stores);
  })();
  return fileRegistryPromise;
}

export async function getStoreRegistry(): Promise<StoreRegistry> {
  const env = await resolveWorkerEnv();
  if (env) {
    // Fail-closed: Jede fehlende D1-Bindung ist ein Konfigurationsfehler (500 über src/middleware.ts), nie ein
    // stiller Rückfall auf Dateien oder eine leere Jurisdiktion.
    assertCompleteBindings(env);
    return createRegistryFromEnv(env);
  }
  return createFileRegistry();
}

export async function getReferenceResolver(): Promise<ReferenceResolver> {
  const registry = await getStoreRegistry();
  // Reihenfolge = Priorität: Ost wird zunächst auf OstRecht aufgelöst (externe Source of Truth);
  // sobald ostdeutsche Normen intern vorliegen, wird der ContentProvider davor gestellt.
  return createReferenceResolver([
    createFederalProvider(),
    createOstRechtProvider(),
    createContentProvider(registry, { jurisdictions: ['west', 'nsh', 'baywue'] }),
  ]);
}

export function notFound(message = 'Nicht gefunden'): Response {
  return new Response(message, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600', ...(init.headers ?? {}) },
  });
}

export const PAGE_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';
