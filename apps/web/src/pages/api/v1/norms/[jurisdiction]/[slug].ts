import type { APIRoute } from 'astro';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiError, type ApiNormResponse } from '../../../../../lib/api-types.ts';
import { getStoreRegistry, jsonResponse } from '../../../../../lib/runtime/context.ts';
import { resolveApiJurisdiction } from '../../../../../lib/api-jurisdiction.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const jurisdiction = resolveApiJurisdiction(params.jurisdiction);
  const registry = await getStoreRegistry();
  if (!jurisdiction || !params.slug || !registry.has(jurisdiction)) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Unbekannte Jurisdiktion oder Norm', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const record = await registry.get(jurisdiction).getNorm(params.slug, 'current');
  if (!record) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Norm nicht gefunden', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const version = getApplicableVersion(record, EDITORIAL_REFERENCE_DATE);
  const payload: ApiNormResponse = {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    referenceDate: EDITORIAL_REFERENCE_DATE,
    jurisdiction,
    url: getNormUrl(jurisdiction, record.meta.slug),
    meta: record.meta,
    history: record.history,
    currentVersionId: version.versionId,
    version,
  };
  return jsonResponse(payload);
};
