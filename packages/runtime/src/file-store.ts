/**
 * NormStore über bereits geladene kanonische Datensätze (content/). Für lokale Entwicklung
 * ohne Wrangler, Prerendering und Tests. Antwortet mit denselben Strukturen wie der D1-Store,
 * damit Oberflächen und API keinen Unterschied sehen.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getNormSortKey, getNormVersionIdentity } from '@landesrecht/legal-core/lib/identity.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion, getNormLastChangeDate } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument, buildSearchQueryPlan, runSearch, type SearchDocument } from '@landesrecht/search/index.ts';

import { selectVersionIds, type BodySelection, type NormStore, type NormSummary } from './store.ts';

export interface FileStoreOptions {
  asOf?: string;
}

export function createFileNormStore(jurisdiction: JurisdictionId, records: readonly NormRecord[], options: FileStoreOptions = {}): NormStore {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const own = records.filter((record) => record.meta.jurisdiction === jurisdiction);
  const bySlug = new Map(own.map((record) => [record.meta.slug, record]));
  let documents: SearchDocument[] | null = null;

  function summarize(record: NormRecord): NormSummary {
    const current = getApplicableVersion(record, asOf);
    const identity = getNormVersionIdentity(record, current);
    const summary: NormSummary = {
      jurisdiction,
      slug: record.meta.slug,
      title: identity.title,
      shortTitle: identity.shortTitle,
      type: record.meta.type,
      status: record.meta.status,
      currentVersionId: current.versionId,
      currentValidFrom: current.simulationValidFrom,
      versionCount: record.versions.length,
      lastChangeDate: getNormLastChangeDate(record, asOf),
      subjects: record.meta.subjects,
      url: getNormUrl(jurisdiction, record.meta.slug),
    };
    if (identity.abbr !== undefined) summary.abbr = identity.abbr;
    return summary;
  }

  function allDocuments(): SearchDocument[] {
    documents ??= own.flatMap((record) => record.versions.map((version) => buildSearchDocument(record, version, asOf)));
    return documents;
  }

  return {
    kind: 'files',
    jurisdiction,

    async listNormSummaries(query = {}) {
      return own
        .filter((record) => (!query.type || record.meta.type === query.type)
          && (!query.status || record.meta.status === query.status)
          && (!query.subject || record.meta.subjects.includes(query.subject)))
        .map(summarize)
        .sort((left, right) => getNormSortKey(left.title).localeCompare(getNormSortKey(right.title)) || left.slug.localeCompare(right.slug))
        .slice(0, query.limit ?? 500);
    },

    async getNormSummary(slug) {
      const record = bySlug.get(slug);
      return record ? summarize(record) : null;
    },

    async getNorm(slug, bodies: BodySelection = 'current') {
      const record = bySlug.get(slug);
      if (!record) return null;
      const wanted = selectVersionIds(record, getApplicableVersion(record, asOf).versionId, bodies);
      return {
        ...record,
        versions: record.versions.map((version) => (wanted.has(version.versionId) ? version : { ...version, body: [] })),
      };
    },

    async search(state) {
      return runSearch(allDocuments(), { ...state, jurisdictions: [jurisdiction] }, buildSearchQueryPlan(state));
    },

    async getStats() {
      return {
        normCount: own.length,
        versionCount: own.reduce((sum, record) => sum + record.versions.length, 0),
        projectedAt: null,
        projectionFingerprint: 'files',
      };
    },

    async getRuntimeMeta() {
      return null;
    },
  };
}
