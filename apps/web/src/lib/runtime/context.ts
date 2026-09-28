/**
 * Datenzugriff je Anfrage. Im Cloudflare-Worker bindet die Registry die D1-Datenbanken der
 * Jurisdiktionen; ohne Worker (Prerendering im Node-Build, lokale Entwicklung ohne Wrangler,
 * Tests) fällt sie auf den Dateistore über content/ zurück. Die Dateiloader (node:fs) werden
 * dynamisch importiert, damit das Worker-Bundle sie nie auflösen muss.
 */
import { JURISDICTION_IDS, JURISDICTIONS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
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
    const [{ loadJurisdictionNorms, loadJurisdictionPublications }, { createFileNormStore }] = await Promise.all([
      import('@landesrecht/legal-core/lib/loader.ts'),
      import('@landesrecht/runtime/file-store.ts'),
    ]);
    const stores: Partial<Record<JurisdictionId, NormStore>> = {};
    for (const jurisdiction of JURISDICTION_IDS) {
      if (JURISDICTIONS[jurisdiction].runtimeSource === 'ostrecht-d1') {
        // Ost hat keinen Dateibestand. Lokal (Entwicklung, Audit) kann eine SQLite im OstRecht-Schema angegeben werden
        // (OSTRECHT_D1_SQLITE, z. B. ein Seed aus `scripts/d1-runtime-seed.mjs` von OstRecht); sonst bleibt Ost leer.
        const sqlitePath = typeof process !== 'undefined' ? process.env?.OSTRECHT_D1_SQLITE : undefined;
        if (sqlitePath) {
          // Variabler Modulpfad: `node:sqlite` darf nie ins Worker-Bundle (nur Node außerhalb des Workers lädt ihn).
          const sqliteModule = '@landesrecht/runtime/sqlite-d1.ts';
          const [{ openSqliteD1 }, { createReadOnlyD1 }, { createOstRechtD1Store }] = await Promise.all([
            import(/* @vite-ignore */ sqliteModule) as Promise<typeof import('@landesrecht/runtime/sqlite-d1.ts')>,
            import('@landesrecht/runtime/read-only-d1.ts'),
            import('@landesrecht/runtime/ostrecht-d1-store.ts'),
          ]);
          stores[jurisdiction] = createOstRechtD1Store(createReadOnlyD1(await openSqliteD1(sqlitePath, { readOnly: true })));
          continue;
        }
      }
      stores[jurisdiction] = createFileNormStore(jurisdiction, await loadJurisdictionNorms(jurisdiction), { publications: await loadJurisdictionPublications(jurisdiction) });
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
  // Reihenfolge = Priorität: alle vier Länder aus der Registry (Ost über den Read-only-Adapter der OstRecht-D1);
  // der OstRecht-Provider bleibt als Legacy-Auflösung (Verweis auf OstRecht-Adressen) für Verweise, die die Registry nicht kennt.
  return createReferenceResolver([
    createFederalProvider(),
    createContentProvider(registry, { jurisdictions: ['west', 'nsh', 'baywue', 'ost'] }),
    createOstRechtProvider(),
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
