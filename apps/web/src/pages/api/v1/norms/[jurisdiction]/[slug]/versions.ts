import type { APIRoute } from 'astro';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { classifyNormVersion, getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiError, type ApiVersionDescriptor, type ApiVersionsResponse } from '../../../../../../lib/api-types.ts';
import { resolveApiJurisdiction } from '../../../../../../lib/api-jurisdiction.ts';
import { getStoreRegistry, jsonResponse } from '../../../../../../lib/runtime/context.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const jurisdiction = resolveApiJurisdiction(params.jurisdiction);
  const registry = await getStoreRegistry();
  if (!jurisdiction || !params.slug || !registry.has(jurisdiction)) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Unbekannte Jurisdiktion oder Norm', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const record = await registry.get(jurisdiction).getNorm(params.slug, 'none');
  if (!record) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Norm nicht gefunden', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const current = getApplicableVersion(record, EDITORIAL_REFERENCE_DATE);
  const versions: ApiVersionDescriptor[] = record.versions.map((version) => {
    const descriptor: ApiVersionDescriptor = {
      versionId: version.versionId,
      simulationValidFrom: version.simulationValidFrom,
      simulationValidTo: version.simulationValidTo,
      temporalKind: classifyNormVersion(record, version, EDITORIAL_REFERENCE_DATE),
      citation: version.citation,
      changeNote: version.changeNote,
      url: getNormVersionUrl(jurisdiction, record.meta.slug, version.versionId),
    };
    if (version.sourceValidFrom !== undefined) descriptor.sourceValidFrom = version.sourceValidFrom;
    if (version.sourceValidTo !== undefined) descriptor.sourceValidTo = version.sourceValidTo;
    return descriptor;
  });
  const payload: ApiVersionsResponse = {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    jurisdiction,
    slug: record.meta.slug,
    currentVersionId: current.versionId,
    versions,
  };
  return jsonResponse(payload);
};
