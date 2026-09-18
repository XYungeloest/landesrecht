/**
 * Permanente Umleitung stillgelegter Norm-Slugs (`@landesrecht/legal-core/config/slug-redirects.json`). Erfasst die
 * Normseiten `/<land>/norm/<slug>/…` (alle Unterseiten) und die API `/api/v1/norms/<land>/<slug>…`; Unterpfad und
 * Abfrage bleiben erhalten. Alles andere bleibt unberührt.
 */
import { getSlugRedirect } from '@landesrecht/legal-core/config/slug-redirects.ts';
import { getJurisdictionByPathSegment, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { resolveApiJurisdiction } from './api-jurisdiction.ts';

type Lookup = (jurisdiction: JurisdictionId, slug: string) => string | undefined;

export function normRedirectLocation(url: URL, lookup: Lookup = getSlugRedirect): string | undefined {
  const page = /^\/([^/]+)\/norm\/([^/]+)(\/.*)?$/u.exec(url.pathname);
  if (page) {
    const jurisdiction = getJurisdictionByPathSegment(decodeURIComponent(page[1]!));
    const target = jurisdiction ? lookup(jurisdiction.id, decodeURIComponent(page[2]!)) : undefined;
    if (jurisdiction && target) return `/${jurisdiction.pathSegment}/norm/${target}${page[3] ?? '/'}${url.search}`;
  }
  const api = /^\/api\/v1\/norms\/([^/]+)\/([^/]+?)(\.json)?(\/.*)?$/u.exec(url.pathname);
  if (api) {
    const jurisdiction = resolveApiJurisdiction(decodeURIComponent(api[1]!));
    const target = jurisdiction ? lookup(jurisdiction, decodeURIComponent(api[2]!)) : undefined;
    if (target) return `/api/v1/norms/${api[1]}/${target}${api[3] ?? ''}${api[4] ?? ''}${url.search}`;
  }
  return undefined;
}

/** 301 mit Cache: Die Umleitung ist dauerhaft (der alte Slug wird nie wieder vergeben). */
export function normRedirectResponse(location: string): Response {
  return new Response(null, { status: 301, headers: { location, 'cache-control': 'public, max-age=86400' } });
}
