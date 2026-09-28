import type { APIRoute } from 'astro';

import { JURISDICTION_LIST } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdictionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { OSTRECHT_RUNTIME_META_KEYS } from '@landesrecht/runtime/ostrecht-d1-store.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiJurisdiction, type ApiJurisdictionsResponse } from '../../../lib/api-types.ts';
import { getStoreRegistry, jsonResponse } from '../../../lib/runtime/context.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  const registry = await getStoreRegistry();
  const jurisdictions: ApiJurisdiction[] = await Promise.all(
    JURISDICTION_LIST.map(async (jurisdiction) => {
      const store = registry.has(jurisdiction.id) ? registry.get(jurisdiction.id) : null;
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
      };
      if (jurisdiction.upstreamSourceOfTruth) entry.upstreamSourceOfTruth = { system: jurisdiction.upstreamSourceOfTruth.system, label: jurisdiction.upstreamSourceOfTruth.label, siteUrl: jurisdiction.upstreamSourceOfTruth.siteUrl };
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
  const payload: ApiJurisdictionsResponse = { schemaVersion: SIMRECHT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), jurisdictions };
  return jsonResponse(payload);
};
