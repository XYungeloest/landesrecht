/**
 * Sprechende, dauerhafte Portaladressen. Alle Routen werden hier gebildet; Komponenten,
 * API-Antworten und Suchdokumente rufen ausschließlich diese Helfer auf.
 *
 *   /<land>/                                   Länderseite
 *   /<land>/norm/<slug>/                       geltende Fassung (dynamischer Link)
 *   /<land>/norm/<slug>/version/<versionId>/   unveränderliche Fassung
 *   /<land>/norm/<slug>/daten/ | /historie/ | /vergleich/ | /quellen/
 *   /assets/<land>/<sha256>.<endung>           Asset einer normativen Abbildung (inhaltsadressiert, unveränderlich)
 *
 * `<land>` ist das öffentliche URL-Segment der Jurisdiktion (`bayern-wuerttemberg`, nicht `baywue`).
 */
import { getJurisdiction, getJurisdictionByPathSegment, type JurisdictionId } from '../config/jurisdictions.ts';
import { FIGURE_FILE_EXTENSIONS, FIGURE_MEDIA_TYPES, type FigureMediaType, type NormBodyAsset } from './schema.ts';

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

/** Adresse eines Abbildungs-Assets: je Land, inhaltsadressiert über SHA-256, Endung aus der Medienart. */
export function getNormAssetUrl(jurisdiction: JurisdictionId, asset: Pick<NormBodyAsset, 'sha256' | 'mediaType'>): string {
  return `/assets/${segment(jurisdiction)}/${asset.sha256}.${FIGURE_FILE_EXTENSIONS[asset.mediaType]}`;
}

/** Zerlegt einen Asset-Dateinamen („<sha256>.<endung>“); `undefined`, wenn er nicht der Form entspricht. */
export function parseNormAssetFileName(fileName: string): { sha256: string; mediaType: FigureMediaType; extension: string } | undefined {
  const match = /^([0-9a-f]{64})\.([a-z]{3,4})$/u.exec(fileName);
  if (!match) return undefined;
  const mediaType = FIGURE_MEDIA_TYPES.find((type) => FIGURE_FILE_EXTENSIONS[type] === match[2]);
  return mediaType ? { sha256: match[1]!, mediaType, extension: match[2]! } : undefined;
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
