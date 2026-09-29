/**
 * Nutzlast von `GET /api/v1/jurisdictions` – ohne Astro-Abhängigkeit, damit beide Laufzeitmodi mit einer Fake-Registry
 * testbar sind (tests/unit/web-local-dev.test.ts). Produktion: jede Jurisdiktion ist `available`, Ost trägt den
 * vollständigen Runtime-Status der OstRecht-D1 (ein verletzter Contract bleibt ein Fehler). Entwicklung: eine lokal nicht
 * verfügbare Jurisdiktion erscheint mit `availability` (kein Store, keine Zahlen, keine Suchabdeckung), die übrigen normal.
 */
import { getJurisdictionStatusSummary } from '@landesrecht/legal-core/config/inventory-status.ts';
import { JURISDICTION_LIST } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdictionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { OSTRECHT_RUNTIME_META_KEYS } from '@landesrecht/runtime/ostrecht-d1-store.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';
import { getStoreSearchCoverage } from '@landesrecht/runtime/store.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiJurisdiction, type ApiJurisdictionsResponse } from './api-types.ts';

export async function buildJurisdictionsPayload(registry: StoreRegistry, now: Date = new Date()): Promise<ApiJurisdictionsResponse> {
  const jurisdictions: ApiJurisdiction[] = await Promise.all(
    JURISDICTION_LIST.map(async (jurisdiction) => {
      const store = registry.has(jurisdiction.id) ? registry.get(jurisdiction.id) : null;
      const availability = registry.availability(jurisdiction.id);
      const stats = store ? await store.getStats() : { normCount: 0 };
      const entry: ApiJurisdiction = {
        id: jurisdiction.id,
        name: jurisdiction.name,
        shortName: jurisdiction.shortName,
        pathSegment: jurisdiction.pathSegment,
        baselineDate: jurisdiction.baselineDate,
        url: getJurisdictionUrl(jurisdiction.id),
        normCount: stats.normCount,
        runtimeSource: jurisdiction.runtimeSource,
        ...(store ? { search: await getStoreSearchCoverage(store) } : {}),
      };
      // Nur Entwicklung: `unavailable-local` (kein Bestand) oder `fixture` (lokaler Teilbestand, development only).
      if (availability.state !== 'available') entry.availability = availability;
      if (jurisdiction.upstreamSourceOfTruth) entry.upstreamSourceOfTruth = { system: jurisdiction.upstreamSourceOfTruth.system, label: jurisdiction.upstreamSourceOfTruth.label, siteUrl: jurisdiction.upstreamSourceOfTruth.siteUrl };
      const status = getJurisdictionStatusSummary(jurisdiction.id);
      if (status) entry.status = status;
      if (jurisdiction.legacySource) entry.legacySource = { system: jurisdiction.legacySource.system, label: jurisdiction.legacySource.label, siteUrl: jurisdiction.legacySource.siteUrl };
      if (store && jurisdiction.runtimeSource === 'ostrecht-d1') {
        const [syncState, syncedAt, upstreamCorpusHash, projectionFingerprint] = await Promise.all([
          store.getRuntimeMeta(OSTRECHT_RUNTIME_META_KEYS.syncState),
          store.getRuntimeMeta(OSTRECHT_RUNTIME_META_KEYS.lastSyncAt),
          store.getRuntimeMeta(OSTRECHT_RUNTIME_META_KEYS.corpusHash),
          store.getRuntimeMeta(OSTRECHT_RUNTIME_META_KEYS.projectionFingerprint),
        ]);
        entry.runtime = { syncState, syncedAt, upstreamCorpusHash, projectionFingerprint };
      }
      return entry;
    }),
  );
  return { schemaVersion: SIMRECHT_SCHEMA_VERSION, generatedAt: now.toISOString(), jurisdictions };
}
