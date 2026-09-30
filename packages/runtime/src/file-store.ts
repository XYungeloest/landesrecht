/**
 * NormStore über bereits geladene kanonische Datensätze (content/). Für lokale Entwicklung
 * ohne Wrangler, Prerendering und Tests. Antwortet mit denselben Strukturen wie der D1-Store,
 * damit Oberflächen und API keinen Unterschied sehen.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getIndexLetter, getNormSortKey, getNormVersionIdentity } from '@landesrecht/legal-core/lib/identity.ts';
import { classifySimulationChange, type SimulationChangeKind } from '@landesrecht/legal-core/lib/simulation-change.ts';
import { comparePublicationsNewestFirst } from '@landesrecht/legal-core/lib/publications.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormRecord, Publication } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion, getNormLastChangeDate } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument, buildSearchQueryPlan, runSearch, type SearchDocument } from '@landesrecht/search/index.ts';

import { selectVersionIds, type BodySelection, type NormFacetQuery, type NormStore, type NormSummary, type NormSummaryQuery, type NormTypeCount } from './store.ts';

export interface FileStoreOptions {
  asOf?: string;
  /** Verkündungsblatt-Ausgaben (content/publications/); fremde Jurisdiktionen werden übergangen. */
  publications?: readonly Publication[];
}

export function createFileNormStore(jurisdiction: JurisdictionId, records: readonly NormRecord[], options: FileStoreOptions = {}): NormStore {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const own = records.filter((record) => record.meta.jurisdiction === jurisdiction);
  const bySlug = new Map(own.map((record) => [record.meta.slug, record]));
  const publications = (options.publications ?? []).filter((publication) => publication.jurisdiction === jurisdiction).sort(comparePublicationsNewestFirst);
  let documents: SearchDocument[] | null = null;

  function summarize(record: NormRecord): NormSummary {
    const current = getApplicableVersion(record, asOf);
    const change = classifySimulationChange(record);
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
      simulationChangeKind: change.kind,
      lastSimulationChangeDate: change.lastChangeDate,
    };
    if (identity.abbr !== undefined) summary.abbr = identity.abbr;
    return summary;
  }

  const matches = (record: NormRecord, query: NormFacetQuery & Pick<NormSummaryQuery, 'status' | 'subject'>, ignore: { types?: boolean; changeKind?: boolean; letter?: boolean } = {}): boolean => {
    const summary = summarize(record);
    if (!ignore.types && query.types && query.types.length > 0 && !query.types.includes(record.meta.type)) return false;
    if (!ignore.changeKind && query.changeKind && summary.simulationChangeKind !== query.changeKind) return false;
    if (!ignore.letter && query.letter && getIndexLetter(summary.title) !== query.letter) return false;
    if (query.status && record.meta.status !== query.status) return false;
    if (query.subject && !record.meta.subjects.includes(query.subject)) return false;
    return true;
  };

  function allDocuments(): SearchDocument[] {
    documents ??= own.flatMap((record) => record.versions.map((version) => buildSearchDocument(record, version, asOf)));
    return documents;
  }

  return {
    kind: 'files',
    jurisdiction,

    async countNormsByType(): Promise<NormTypeCount[]> {
      const counts = new Map<NormRecord['meta']['type'], number>();
      for (const record of own) counts.set(record.meta.type, (counts.get(record.meta.type) ?? 0) + 1);
      return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((left, right) => left.type.localeCompare(right.type));
    },

    async countNormFacets(query = {}) {
      const byType = new Map<NormRecord['meta']['type'], number>();
      const byChangeKind: Record<SimulationChangeKind, number> = { 'baseline-unchanged': 0, 'baseline-changed': 0, 'simulation-new': 0 };
      const byLetter = new Map<string, number>();
      let total = 0;
      for (const record of own) {
        const summary = summarize(record);
        if (matches(record, query)) total += 1;
        if (matches(record, query, { types: true })) byType.set(record.meta.type, (byType.get(record.meta.type) ?? 0) + 1);
        if (matches(record, query, { changeKind: true })) byChangeKind[summary.simulationChangeKind] += 1;
        if (matches(record, query, { letter: true })) byLetter.set(getIndexLetter(summary.title), (byLetter.get(getIndexLetter(summary.title)) ?? 0) + 1);
      }
      return {
        total,
        byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((left, right) => left.type.localeCompare(right.type)),
        byChangeKind,
        byLetter: [...byLetter.entries()].map(([letter, count]) => ({ letter, count })).sort((left, right) => left.letter.localeCompare(right.letter)),
      };
    },

    async listNormSummaries(query = {}) {
      const types = query.types && query.types.length > 0 ? query.types : query.type ? [query.type] : undefined;
      const summaries = own.filter((record) => matches(record, { ...query, ...(types ? { types } : {}) })).map(summarize);
      const byTitle = (left: NormSummary, right: NormSummary): number => getNormSortKey(left.title).localeCompare(getNormSortKey(right.title)) || left.slug.localeCompare(right.slug);
      summaries.sort(query.sort === 'change' ? (left, right) => (right.lastSimulationChangeDate ?? '').localeCompare(left.lastSimulationChangeDate ?? '') || byTitle(left, right) : byTitle);
      const offset = Math.max(query.offset ?? 0, 0);
      return summaries.slice(offset, offset + (query.limit ?? 500));
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

    async listPublications(query = {}) {
      return query.limit === undefined ? [...publications] : publications.slice(0, Math.max(0, query.limit));
    },

    async getPublication(slug) {
      return publications.find((publication) => publication.slug === slug) ?? null;
    },
  };
}
