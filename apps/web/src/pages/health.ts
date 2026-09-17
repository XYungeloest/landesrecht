import type { APIRoute } from 'astro';

import { checkHealth, healthResponse } from '../lib/runtime/health.ts';
import { resolveWorkerEnv } from '../lib/runtime/context.ts';

export const prerender = false;

/** `GET /health`: Worker lebt, D1-Bindings erreichbar (200) oder nicht (503). Keine internen Daten. */
export const GET: APIRoute = async () => healthResponse(await checkHealth(await resolveWorkerEnv()));
