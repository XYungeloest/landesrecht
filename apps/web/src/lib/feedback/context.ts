import { getJurisdictionByPathSegment } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { buildAnchorMap, getProvisionEntries } from '@landesrecht/legal-core/lib/body.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { getNormVersionUrl, getProvisionUrl, getNormSubpageUrl, getPublicationUrl, getPublicationsUrl, getJurisdictionUrl, NORM_SUBPAGES, PORTAL_PATHS } from '@landesrecht/legal-core/lib/routes.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';
import type { FeedbackContext } from '@landesrecht/runtime/feedback.ts';

export class FeedbackContextError extends Error {}

/** Nur Pfad transportieren, nie Suchbegriffe, Textmarker, Fragment oder fremde Origin. */
export async function resolveFeedbackContext(value: string, origin: string, registry: () => Promise<StoreRegistry>): Promise<FeedbackContext | null> {
  if (!value.trim()) return null;
  if (value.length > 1024 || /[\\\u0000-\u0020]/u.test(value) || value.startsWith('//')) throw new FeedbackContextError('Ungültiger Seitenbezug');
  let url: URL;
  try { url = new URL(value, origin); } catch { throw new FeedbackContextError('Ungültiger Seitenbezug'); }
  if (url.origin !== origin || url.username || url.password || !['https:', 'http:'].includes(url.protocol)) throw new FeedbackContextError('Ungültiger Seitenbezug');
  // Keine kodierten Separatoren, Punktsegmente, doppelte Schrägstriche oder unbekannten Routen.
  const rawPath = value.split(/[?#]/u)[0]!;
  if (/%(?:2f|5c|2e|00)/iu.test(rawPath) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(rawPath)) throw new FeedbackContextError('Ungültiger Seitenbezug');
  const path = url.pathname;
  if (path.includes('//')) throw new FeedbackContextError('Ungültiger Seitenbezug');
  const empty = { path, jurisdiction: null, norm: null, version: null, provision: null };
  const staticPaths: readonly string[] = [PORTAL_PATHS.home, PORTAL_PATHS.search, PORTAL_PATHS.changes, PORTAL_PATHS.subjects, PORTAL_PATHS.about, PORTAL_PATHS.help, PORTAL_PATHS.contact, PORTAL_PATHS.privacy, PORTAL_PATHS.imprint];
  if (staticPaths.includes(path)) return empty;
  const parts = path.split('/').filter(Boolean);
  const jurisdiction = getJurisdictionByPathSegment(parts[0] ?? '');
  if (!jurisdiction) throw new FeedbackContextError('Unbekannte Seite');
  const base = { ...empty, jurisdiction: jurisdiction.id };
  if (path === getJurisdictionUrl(jurisdiction.id) || path === getPublicationsUrl(jurisdiction.id)) return base;
  const store = (await registry()).get(jurisdiction.id);
  if (parts[1] === 'verkuendungen' && parts.length === 3) {
    const publication = await store.getPublication(parts[2]!);
    if (publication && path === getPublicationUrl(jurisdiction.id, publication.slug)) return base;
    throw new FeedbackContextError('Unbekannte Verkündung');
  }
  if (parts[1] !== 'norm' || !parts[2]) throw new FeedbackContextError('Unbekannte Seite');
  const slug = parts[2];
  let rest = parts.slice(3);
  const explicitVersion = rest[0] === 'version' ? rest[1] : undefined;
  if (rest[0] === 'version') { if (!explicitVersion) throw new FeedbackContextError('Fassung fehlt'); rest = rest.slice(2); }
  if (rest.length > 1) throw new FeedbackContextError('Unbekannte Normseite');
  const record = await store.getNorm(slug, explicitVersion ? [explicitVersion] : 'current');
  if (!record) throw new FeedbackContextError('Unbekannte Norm');
  const version = explicitVersion ? record.versions.find(v => v.versionId === explicitVersion) : getApplicableVersion(record);
  if (!version) throw new FeedbackContextError('Unbekannte Fassung');
  const context = { ...base, norm: slug, version: version.versionId };
  if (!rest.length) return { ...context, path: getNormVersionUrl(jurisdiction.id, slug, version.versionId) };
  const tail = rest[0]!;
  if ((NORM_SUBPAGES as readonly string[]).includes(tail)) return { ...context, path: getNormSubpageUrl(jurisdiction.id, slug, tail as typeof NORM_SUBPAGES[number], version.versionId) };
  const entries = getProvisionEntries(version.body, buildAnchorMap(version.body));
  const provision = entries.find(entry => entry.anchor === tail);
  if (!provision) throw new FeedbackContextError('Unbekannte Einzelvorschrift');
  return { ...context, provision: provision.anchor, path: getProvisionUrl(jurisdiction.id, slug, provision.anchor, version.versionId) };
}
