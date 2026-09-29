import type { APIRoute } from 'astro';

import { getPublicationLabel } from '@landesrecht/legal-core/lib/publications.ts';
import { getNormUrl, getNormVersionUrl, getPublicationUrl } from '@landesrecht/legal-core/lib/routes.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiError, type ApiPublicationEntry, type ApiPublicationResponse } from '../../../../../lib/api-types.ts';
import { resolveApiJurisdiction } from '../../../../../lib/api-jurisdiction.ts';
import { getStoreRegistry, jsonResponse } from '../../../../../lib/runtime/context.ts';

export const prerender = false;

/** Eine Ausgabe mit Einträgen und Quellenbelegen (SHA-256, Archivobjekt); keine Bilddaten. */
export const GET: APIRoute = async ({ params }) => {
  const jurisdiction = resolveApiJurisdiction(params.jurisdiction);
  const registry = await getStoreRegistry();
  if (!jurisdiction || !params.slug || !registry.has(jurisdiction)) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Unbekannte Jurisdiktion oder Verkündung', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const publication = await registry.get(jurisdiction).getPublication(params.slug);
  if (!publication) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Verkündung nicht gefunden', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const entries: ApiPublicationEntry[] = publication.entries.map((entry) => {
    // Ohne veröffentlichte Portalnorm keine Adresse (nie ein erfundener Link); Stand in `consolidationStatus`.
    if (!entry.normSlug) return { ...entry };
    const result: ApiPublicationEntry = { ...entry, normUrl: getNormUrl(jurisdiction, entry.normSlug) };
    if (entry.versionId) result.versionUrl = getNormVersionUrl(jurisdiction, entry.normSlug, entry.versionId);
    return result;
  });
  const payload: ApiPublicationResponse = {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    jurisdiction,
    url: getPublicationUrl(jurisdiction, publication.slug),
    label: getPublicationLabel(publication),
    publication,
    entries,
  };
  return jsonResponse(payload);
};
