/**
 * Sprechende, dauerhafte Portaladressen. Alle Routen werden hier gebildet; Komponenten,
 * API-Antworten und Suchdokumente rufen ausschließlich diese Helfer auf.
 *
 *   /<land>/                                   Länderseite
 *   /<land>/norm/<slug>/                       geltende Fassung (dynamischer Link)
 *   /<land>/norm/<slug>/version/<versionId>/   unveränderliche Fassung
 *   /<land>/norm/<slug>/daten/ | /historie/ | /vergleich/ | /quellen/
 *
 * `<land>` ist das öffentliche URL-Segment der Jurisdiktion (`bayern-wuerttemberg`, nicht `baywue`).
 */
import { getJurisdiction, getJurisdictionByPathSegment, type JurisdictionId } from '../config/jurisdictions.ts';

export const NORM_SUBPAGES = ['daten', 'historie', 'vergleich', 'quellen'] as const;
export type NormSubpage = (typeof NORM_SUBPAGES)[number];

export const PORTAL_PATHS = {
  home: '/',
  search: '/suche/',
  help: '/hilfe/',
  imprint: '/impressum/',
  api: '/api/v1',
  simrecht: '/.well-known/simrecht.json',
} as const;

function segment(jurisdiction: JurisdictionId): string {
  return getJurisdiction(jurisdiction).pathSegment;
}

export function getJurisdictionUrl(jurisdiction: JurisdictionId): string {
  return `/${segment(jurisdiction)}/`;
}

export function getNormUrl(jurisdiction: JurisdictionId, slug: string): string {
  return `/${segment(jurisdiction)}/norm/${slug}/`;
}

export function getNormVersionUrl(jurisdiction: JurisdictionId, slug: string, versionId: string): string {
  return `${getNormUrl(jurisdiction, slug)}version/${versionId}/`;
}

export function getNormSubpageUrl(jurisdiction: JurisdictionId, slug: string, subpage: NormSubpage, versionId?: string): string {
  const base = versionId ? getNormVersionUrl(jurisdiction, slug, versionId) : getNormUrl(jurisdiction, slug);
  return `${base}${subpage}/`;
}

export function getNormAnchorUrl(jurisdiction: JurisdictionId, slug: string, anchor: string, versionId?: string): string {
  const base = versionId ? getNormVersionUrl(jurisdiction, slug, versionId) : getNormUrl(jurisdiction, slug);
  return `${base}#${anchor}`;
}

export function getSearchUrl(params: Record<string, string | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `${PORTAL_PATHS.search}?${query}` : PORTAL_PATHS.search;
}

export function getApiJurisdictionsUrl(): string {
  return `${PORTAL_PATHS.api}/jurisdictions`;
}

export function getApiNormUrl(jurisdiction: JurisdictionId, slug: string): string {
  return `${PORTAL_PATHS.api}/norms/${jurisdiction}/${slug}`;
}

export function getApiNormVersionsUrl(jurisdiction: JurisdictionId, slug: string): string {
  return `${getApiNormUrl(jurisdiction, slug)}/versions`;
}

export function getApiSearchUrl(): string {
  return `${PORTAL_PATHS.api}/search`;
}

/** Löst ein URL-Segment zur Jurisdiktions-ID auf; `undefined` für unbekannte Segmente. */
export function resolveJurisdictionSegment(value: string | undefined): JurisdictionId | undefined {
  if (!value) return undefined;
  return getJurisdictionByPathSegment(value)?.id;
}

/** Absolute URL aus Site-Origin und Portalpfad. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/u, '')}${path}`;
}
