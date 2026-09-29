import type { APIRoute } from 'astro';

import { buildJurisdictionsPayload } from '../../../lib/api-jurisdictions.ts';
import { getStoreRegistry, jsonResponse } from '../../../lib/runtime/context.ts';

export const prerender = false;

export const GET: APIRoute = async () => jsonResponse(await buildJurisdictionsPayload(await getStoreRegistry()));
