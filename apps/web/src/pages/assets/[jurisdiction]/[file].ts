import type { APIRoute } from 'astro';

import { R2_SOURCES_BINDING } from '@landesrecht/runtime/bindings.ts';

import { serveNormAsset, type AssetBucket } from '../../../lib/assets.ts';
import { resolveWorkerEnv } from '../../../lib/runtime/context.ts';

export const prerender = false;

/** Abbildungs-Asset einer Norm (inhaltsadressiert, unveränderlich); Prüfung in `lib/assets.ts`. */
export const GET: APIRoute = async ({ params }) => {
  const env = await resolveWorkerEnv();
  return serveNormAsset(params, env?.[R2_SOURCES_BINDING] as AssetBucket | undefined);
};
