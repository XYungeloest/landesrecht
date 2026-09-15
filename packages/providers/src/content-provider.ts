/**
 * Provider über die Store-Registry des Portals (D1 im Worker, Dateien lokal). Verweise auf
 * Landesnormen führen zu internen Portalrouten; die Auflösung der Vorschrift nutzt das
 * Sprungziel der Normseite.
 */
import { getJurisdiction, isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseProvision, provisionAnchor, type LegalReference } from '@landesrecht/legal-core/lib/references.ts';
import { getNormUrl, getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { VOCABULARY } from '@landesrecht/legal-core/lib/display.ts';
import type { StoreRegistry } from '@landesrecht/runtime/registry.ts';

import { describeVersion, type LegalProvider, type ResolvedReference } from './provider.ts';
import { formatReferenceLabel } from './federal.ts';

export interface ContentProviderOptions {
  /** Auf welche Jurisdiktionen dieser Provider antwortet (Standard: alle mit Store). */
  jurisdictions?: JurisdictionId[];
}

/** Ein Slug oder eine Abkürzung als Normkennung zu einem Slug auflösen. */
export async function resolveNormSlug(registry: StoreRegistry, jurisdiction: JurisdictionId, norm: string): Promise<string | null> {
  const store = registry.get(jurisdiction);
  const direct = await store.getNormSummary(norm);
  if (direct) return direct.slug;
  const needle = norm.trim().toLowerCase();
  const summaries = await store.listNormSummaries();
  const match = summaries.find((summary) => summary.abbr?.toLowerCase() === needle || summary.shortTitle.toLowerCase() === needle || summary.title.toLowerCase() === needle);
  return match?.slug ?? null;
}

export function createContentProvider(registry: StoreRegistry, options: ContentProviderOptions = {}): LegalProvider {
  const jurisdictions = options.jurisdictions ?? registry.list().map((store) => store.jurisdiction);
  const serves = (jurisdiction: string): jurisdiction is JurisdictionId => isJurisdictionId(jurisdiction) && jurisdictions.includes(jurisdiction) && registry.has(jurisdiction);

  return {
    id: 'landesrecht',
    label: VOCABULARY.portalName,
    jurisdictions,
    providesNorms: true,
    async getNorm(jurisdiction, slug) {
      if (!serves(jurisdiction)) return null;
      return registry.get(jurisdiction).getNorm(slug, 'all');
    },
    async getNormVersion(jurisdiction, slug, versionId) {
      if (!serves(jurisdiction)) return null;
      const record = await registry.get(jurisdiction).getNorm(slug, [versionId]);
      return record?.versions.find((version) => version.versionId === versionId) ?? null;
    },
    async listVersions(jurisdiction, slug) {
      if (!serves(jurisdiction)) return [];
      const record = await registry.get(jurisdiction).getNorm(slug, 'none');
      return record ? record.versions.map(describeVersion) : [];
    },
    async search(state) {
      return registry.search({ ...state, jurisdictions: state.jurisdictions.filter(serves) });
    },
    async resolveReference(reference: LegalReference) {
      if (!serves(reference.jurisdiction)) return null;
      const slug = await resolveNormSlug(registry, reference.jurisdiction, reference.norm);
      if (!slug) return null;
      const base = reference.versionId ? getNormVersionUrl(reference.jurisdiction, slug, reference.versionId) : getNormUrl(reference.jurisdiction, slug);
      const provision = parseProvision(reference.provision);
      const resolved: ResolvedReference = {
        reference,
        url: provision ? `${base}#${provisionAnchor(provision)}` : base,
        external: false,
        label: formatReferenceLabel(reference),
        system: `${VOCABULARY.portalName} ${getJurisdiction(reference.jurisdiction).shortName}`,
      };
      return resolved;
    },
  };
}
