import type { APIRoute } from 'astro';

import { buildSimRechtDeclaration } from '../../lib/simrecht.ts';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildSimRechtDeclaration(), null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
