import redirects from './slug-redirects.json' with { type: 'json' };
import { isJurisdictionId, type JurisdictionId } from './jurisdictions.ts';

/**
 * Permanente Umleitungen stillgelegter Norm-Slugs je Land (von den Importern aus ihrer Slug-Registry erzeugt, nie von
 * Hand gepflegt). Ein stillgelegter Slug war sachlich falsch (z. B. aus einem früher falsch übergeleiteten
 * historischen Titel); er wird nie wieder vergeben und leitet dauerhaft auf den Nachfolger um.
 */
export const SLUG_REDIRECTS_SCHEMA = 'landesrecht-slug-redirects/1';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function parseSlugRedirects(value: unknown): Map<JurisdictionId, ReadonlyMap<string, string>> {
  const file = value as { schemaVersion?: unknown; jurisdictions?: Record<string, Record<string, unknown>> };
  if (!file || file.schemaVersion !== SLUG_REDIRECTS_SCHEMA || typeof file.jurisdictions !== 'object' || file.jurisdictions === null) {
    throw new Error(`slug-redirects.json: Schema ${SLUG_REDIRECTS_SCHEMA} erwartet`);
  }
  const result = new Map<JurisdictionId, ReadonlyMap<string, string>>();
  for (const [jurisdiction, entries] of Object.entries(file.jurisdictions)) {
    if (!isJurisdictionId(jurisdiction)) throw new Error(`slug-redirects.json: unbekannte Jurisdiktion ${jurisdiction}`);
    const map = new Map<string, string>();
    for (const [from, to] of Object.entries(entries)) {
      if (!SLUG.test(from) || typeof to !== 'string' || !SLUG.test(to) || from === to) throw new Error(`slug-redirects.json: ungültige Umleitung ${jurisdiction}/${from} → ${String(to)}`);
      map.set(from, to);
    }
    for (const to of map.values()) if (map.has(to)) throw new Error(`slug-redirects.json: Umleitungskette über ${jurisdiction}/${to}`);
    result.set(jurisdiction, map);
  }
  return result;
}

const REDIRECTS = parseSlugRedirects(redirects);

/** Nachfolger eines stillgelegten Slugs oder `undefined`. */
export function getSlugRedirect(jurisdiction: JurisdictionId, slug: string): string | undefined {
  return REDIRECTS.get(jurisdiction)?.get(slug);
}
