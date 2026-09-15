/**
 * LegalProvider für OstRecht. Zwei Betriebsarten:
 *  - `records`: bereits adaptierte Datensätze (z. B. aus einem Sync-Lauf oder Tests);
 *  - `siteUrl`: nur Verweisauflösung auf das öffentliche OstRecht, solange die ostdeutschen
 *    Normen noch nicht in dieses Portal übernommen sind.
 * Die Übernahme oder Synchronisation des Bestands läuft über packages/importers/ostrecht.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { parseProvision, provisionAnchor, type LegalReference } from '@landesrecht/legal-core/lib/references.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';

import { formatReferenceLabel } from './federal.ts';
import { OSTRECHT_TARGET_JURISDICTION } from './ostrecht.ts';
import { describeVersion, type LegalProvider, type ResolvedReference } from './provider.ts';

export interface OstRechtProviderOptions {
  records?: readonly NormRecord[];
  siteUrl?: string;
  asOf?: string;
}

/** OstRecht-Normadresse: `<site>/norm/<slug>/` beziehungsweise `/version/<versionId>/`. */
export function buildOstRechtNormUrl(siteUrl: string, slug: string, versionId?: string, anchor?: string): string {
  const base = `${siteUrl.replace(/\/+$/u, '')}/norm/${slug}/${versionId ? `version/${versionId}/` : ''}`;
  return anchor ? `${base}#${anchor}` : base;
}

export function createOstRechtProvider(options: OstRechtProviderOptions = {}): LegalProvider {
  const jurisdiction = getJurisdiction(OSTRECHT_TARGET_JURISDICTION);
  const siteUrl = options.siteUrl ?? jurisdiction.externalSourceOfTruth?.siteUrl ?? '';
  const storeOptions = options.asOf ? { asOf: options.asOf } : {};
  const store = createFileNormStore(OSTRECHT_TARGET_JURISDICTION, options.records ?? [], storeOptions);
  const label = jurisdiction.externalSourceOfTruth?.label ?? 'OstRecht';

  async function resolveSlug(norm: string): Promise<string | null> {
    if (!options.records) return norm.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const direct = await store.getNormSummary(norm);
    if (direct) return direct.slug;
    const needle = norm.trim().toLowerCase();
    const summaries = await store.listNormSummaries();
    return summaries.find((summary) => summary.abbr?.toLowerCase() === needle || summary.shortTitle.toLowerCase() === needle)?.slug ?? null;
  }

  return {
    id: 'ostrecht',
    label,
    jurisdictions: [OSTRECHT_TARGET_JURISDICTION],
    providesNorms: Boolean(options.records),
    async getNorm(jurisdictionId, slug) {
      if (jurisdictionId !== OSTRECHT_TARGET_JURISDICTION) return null;
      return store.getNorm(slug, 'all');
    },
    async getNormVersion(jurisdictionId, slug, versionId) {
      if (jurisdictionId !== OSTRECHT_TARGET_JURISDICTION) return null;
      const record = await store.getNorm(slug, [versionId]);
      return record?.versions.find((version) => version.versionId === versionId) ?? null;
    },
    async listVersions(jurisdictionId, slug) {
      if (jurisdictionId !== OSTRECHT_TARGET_JURISDICTION) return [];
      const record = await store.getNorm(slug, 'none');
      return record ? record.versions.map(describeVersion) : [];
    },
    async search(state) {
      return store.search(state);
    },
    async resolveReference(reference: LegalReference) {
      if (reference.jurisdiction !== OSTRECHT_TARGET_JURISDICTION) return null;
      const slug = await resolveSlug(reference.norm);
      if (!slug) return null;
      const provision = parseProvision(reference.provision);
      const resolved: ResolvedReference = {
        reference,
        url: buildOstRechtNormUrl(siteUrl, slug, reference.versionId, provision ? provisionAnchor(provision) : undefined),
        external: true,
        label: formatReferenceLabel(reference),
        system: label,
      };
      return resolved;
    },
  };
}
