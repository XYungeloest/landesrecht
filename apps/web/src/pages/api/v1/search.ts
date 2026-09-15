import type { APIRoute } from 'astro';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { parseSearchState } from '@landesrecht/search/query.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiSearchResponse } from '../../../lib/api-types.ts';
import { getStoreRegistry, jsonResponse } from '../../../lib/runtime/context.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const state = parseSearchState(url.searchParams);
  const registry = await getStoreRegistry();
  const page = await registry.search(state);
  const payload: ApiSearchResponse = {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    referenceDate: EDITORIAL_REFERENCE_DATE,
    query: {
      q: state.q,
      jurisdictions: state.jurisdictions,
      types: state.types,
      statuses: state.statuses,
      versionScope: state.versionScope,
      ...(state.validOn ? { validOn: state.validOn } : {}),
      sort: state.sort,
    },
    total: page.total,
    offset: page.offset,
    limit: page.limit,
    hits: page.hits.map(({ rank: _rank, ...hit }) => hit),
  };
  return jsonResponse(payload, { headers: { 'cache-control': 'public, max-age=60, s-maxage=600' } });
};
