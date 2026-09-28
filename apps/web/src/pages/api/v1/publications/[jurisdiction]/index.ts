import type { APIRoute } from 'astro';

import { getPublicationLabel } from '@landesrecht/legal-core/lib/publications.ts';
import { getApiPublicationUrl, getPublicationsUrl, getPublicationUrl } from '@landesrecht/legal-core/lib/routes.ts';

import { SIMRECHT_SCHEMA_VERSION, type ApiError, type ApiPublicationsResponse, type ApiPublicationSummary } from '../../../../../lib/api-types.ts';
import { resolveApiJurisdiction } from '../../../../../lib/api-jurisdiction.ts';
import { getStoreRegistry, jsonResponse } from '../../../../../lib/runtime/context.ts';

export const prerender = false;

/** Verkündungsblatt-Ausgaben einer Jurisdiktion, jüngste zuerst (nur law_publications). */
export const GET: APIRoute = async ({ params }) => {
  const jurisdiction = resolveApiJurisdiction(params.jurisdiction);
  const registry = await getStoreRegistry();
  if (!jurisdiction || !registry.has(jurisdiction)) {
    const error: ApiError = { schemaVersion: SIMRECHT_SCHEMA_VERSION, error: 'Unbekannte Jurisdiktion', status: 404 };
    return jsonResponse(error, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const publications = await registry.get(jurisdiction).listPublications();
  const payload: ApiPublicationsResponse = {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    jurisdiction,
    url: getPublicationsUrl(jurisdiction),
    publications: publications.map((publication) => {
      const summary: ApiPublicationSummary = {
        slug: publication.slug,
        title: publication.title,
        label: getPublicationLabel(publication),
        gazette: publication.gazette,
        year: publication.year,
        issue: publication.issue,
        date: publication.date,
        entryCount: publication.entries.length,
        url: getPublicationUrl(jurisdiction, publication.slug),
        apiUrl: getApiPublicationUrl(jurisdiction, publication.slug),
      };
      if (publication.seriesTitle !== undefined) summary.seriesTitle = publication.seriesTitle;
      return summary;
    }),
  };
  return jsonResponse(payload);
};
