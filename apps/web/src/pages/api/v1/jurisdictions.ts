import type { APIRoute } from 'astro';

import { JURISDICTION_LIST } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdictionUrl } from '@landesrecht/legal-core/lib/routes.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiJurisdiction, type ApiJurisdictionsResponse } from '../../../lib/api-types.ts';
import { getStoreRegistry, jsonResponse } from '../../../lib/runtime/context.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  const registry = await getStoreRegistry();
  const jurisdictions: ApiJurisdiction[] = await Promise.all(
    JURISDICTION_LIST.map(async (jurisdiction) => {
      const stats = registry.has(jurisdiction.id) ? await registry.get(jurisdiction.id).getStats() : { normCount: 0 };
      const entry: ApiJurisdiction = {
        id: jurisdiction.id,
        name: jurisdiction.name,
        shortName: jurisdiction.shortName,
        pathSegment: jurisdiction.pathSegment,
        baselineDate: jurisdiction.baselineDate,
        url: getJurisdictionUrl(jurisdiction.id),
        normCount: stats.normCount,
      };
      if (jurisdiction.externalSourceOfTruth) entry.externalSourceOfTruth = { ...jurisdiction.externalSourceOfTruth };
      return entry;
    }),
  );
  const payload: ApiJurisdictionsResponse = { schemaVersion: SIMRECHT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), jurisdictions };
  return jsonResponse(payload);
};
