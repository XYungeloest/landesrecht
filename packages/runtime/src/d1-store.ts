/**
 * NormStore über eine D1-Datenbank (eine Jurisdiktion). Lädt nie den gesamten Bestand:
 * Übersichten kommen aus schmalen Spalten, Normkörper blockweise nur für angeforderte
 * Fassungen, Suchtreffer über den FTS5-Index mit Kandidatenabfrage und Seitenzuschnitt.
 * Jede gelesene Zeile wird über die kanonischen Parser re-validiert (D1 ist abgeleitet).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import {
  parseNormHistory,
  parseNormMeta,
  parseNormVersion,
  validateNormRecord,
  type NormBodyBlock,
  type NormRecord,
  type NormStatus,
  type NormType,
  type NormVersion,
} from '@landesrecht/legal-core/lib/schema.ts';
import {
  buildFtsConjuncts,
  buildFtsMatch,
  buildSearchQueryPlan,
  evaluateDocument,
  MATCH_LABELS,
  SEARCH_RANK_WEIGHTS,
  type SearchDocument,
  type SearchHit,
  type SearchQueryPlan,
  type SearchState,
  type SearchUnit,
  type StructuralIntent,
} from '@landesrecht/search/index.ts';

import type { D1Database } from './d1-types.ts';
import { normId, RUNTIME_META_KEYS } from './projection.ts';
import { selectVersionIds, type BodySelection, type NormStore, type NormSummary, type NormSummaryQuery, type StoreStats } from './store.ts';

interface NormRow {
  jurisdiction: string;
  slug: string;
  title: string;
  short_title: string;
  abbr: string | null;
  type: string;
  status: string;
  current_version_id: string;
  current_valid_from: string;
  version_count: number;
  last_change_date: string | null;
  subjects_json: string;
  meta_json?: string;
  history_json?: string;
}

interface VersionRow {
  version_id: string;
  version_json: string;
}

interface BlockRow {
  block_index: number;
  part_index: number;
  block_json: string;
}

interface CandidateRow {
  norm_id: string;
  version_id: string;
}

interface UnitRow {
  unit_index: number;
  anchor: string;
  block_type: string;
  references_json: string | null;
  label: string;
  heading: string;
  body: string;
}

const SUMMARY_COLUMNS = 'jurisdiction, slug, title, short_title, abbr, type, status, current_version_id, current_valid_from, version_count, last_change_date, subjects_json';
const MAX_UNITS_PER_HIT = 8;

function toSummary(row: NormRow): NormSummary {
  const summary: NormSummary = {
    jurisdiction: row.jurisdiction as JurisdictionId,
    slug: row.slug,
    title: row.title,
    shortTitle: row.short_title,
    type: row.type as NormType,
    status: row.status as NormStatus,
    currentVersionId: row.current_version_id,
    currentValidFrom: row.current_valid_from,
    versionCount: Number(row.version_count),
    lastChangeDate: row.last_change_date,
    subjects: JSON.parse(row.subjects_json) as string[],
    url: getNormUrl(row.jurisdiction as JurisdictionId, row.slug),
  };
  if (row.abbr) summary.abbr = row.abbr;
  return summary;
}

/** Setzt blockweise gespeicherte Body-Teile in Reihenfolge zusammen. */
export function assembleBlocks(rows: readonly BlockRow[]): NormBodyBlock[] {
  const parts = new Map<number, string[]>();
  for (const row of rows) {
    const bucket = parts.get(Number(row.block_index)) ?? [];
    bucket[Number(row.part_index)] = row.block_json;
    parts.set(Number(row.block_index), bucket);
  }
  return [...parts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, pieces]) => JSON.parse(pieces.join('')) as NormBodyBlock);
}

function referenceConditions(references: readonly StructuralIntent[]): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const intent of references) {
    const conditions: string[] = [];
    if (intent.kind === 'paragraph') {
      conditions.push("json_extract(u.references_json, '$.paragraph') = ?");
      params.push(intent.number);
    } else if (intent.kind === 'article') {
      conditions.push("json_extract(u.references_json, '$.article') = ?");
      params.push(intent.number);
    }
    const subsection = intent.kind === 'subsection' ? intent.number : intent.subsection;
    if (subsection) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(json_extract(u.references_json, '$.subsections')) je WHERE je.value = ?)");
      params.push(subsection);
    }
    clauses.push(`(v.norm_id, v.version_id) IN (SELECT u.norm_id, u.version_id FROM law_search_units u WHERE ${conditions.join(' AND ')})`);
  }
  return { sql: clauses.map((clause) => ` AND ${clause}`).join(''), params };
}

function filterConditions(state: SearchState, plan: SearchQueryPlan): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (state.types.length > 0) {
    clauses.push(`n.type IN (${state.types.map(() => '?').join(', ')})`);
    params.push(...state.types);
  }
  if (state.statuses.length > 0) {
    clauses.push(`n.status IN (${state.statuses.map(() => '?').join(', ')})`);
    params.push(...state.statuses);
  }
  if (state.subjects.length > 0) {
    clauses.push(`EXISTS (SELECT 1 FROM law_norm_subjects s WHERE s.norm_id = n.id AND s.subject IN (${state.subjects.map(() => '?').join(', ')}))`);
    params.push(...state.subjects);
  }
  if (state.validOn) {
    clauses.push('v.simulation_valid_from <= ? AND (v.simulation_valid_to IS NULL OR v.simulation_valid_to >= ?)');
    params.push(state.validOn, state.validOn);
  } else if (state.versionScope !== 'all') {
    clauses.push('v.temporal_kind = ?');
    params.push(state.versionScope);
  }
  for (const conjunct of buildFtsConjuncts(plan)) {
    clauses.push('(v.norm_id, v.version_id) IN (SELECT norm_id, version_id FROM law_search WHERE law_search MATCH ?)');
    params.push(conjunct);
  }
  const references = referenceConditions(plan.references);
  return { sql: clauses.map((clause) => ` AND ${clause}`).join('') + references.sql, params: [...params, ...references.params] };
}

function orderBy(sort: SearchState['sort'], ranked: boolean): string {
  if (sort === 'title') return 'n.sort_key, n.slug';
  if (sort === 'activity') return 'COALESCE(n.last_change_date, v.simulation_valid_from) DESC, n.sort_key';
  return ranked
    ? "identity_hit DESC, (v.temporal_kind = 'current') DESC, best, n.sort_key, n.slug"
    : "(v.temporal_kind = 'current') DESC, n.sort_key, n.slug";
}

export function createD1NormStore(db: D1Database, jurisdiction: JurisdictionId): NormStore {
  async function loadDocument(id: string, versionId: string, unitsMatch: string | null, references: readonly StructuralIntent[]): Promise<SearchDocument | null> {
    const row = await db.prepare('SELECT search_document_json FROM law_versions WHERE norm_id = ? AND version_id = ?').bind(id, versionId).first<{ search_document_json: string }>();
    if (!row) return null;
    const document = JSON.parse(row.search_document_json) as Omit<SearchDocument, 'units'>;

    let unitRows: UnitRow[];
    if (unitsMatch) {
      unitRows = (await db.prepare(
        `SELECT unit_index, anchor, block_type, references_json, label, heading, body FROM (
           SELECT s.unit_index, s.anchor, s.block_type, s.references_json, s.label, s.heading, s.body,
                  row_number() OVER (ORDER BY rank) AS position
           FROM law_search s WHERE law_search MATCH ? AND s.norm_id = ? AND s.version_id = ? AND rank MATCH ?
         ) WHERE position <= ? ORDER BY unit_index`,
      ).bind(unitsMatch, id, versionId, SEARCH_RANK_WEIGHTS, MAX_UNITS_PER_HIT).all<UnitRow>()).results;
    } else if (references.length > 0) {
      const { sql, params } = referenceConditions(references);
      unitRows = (await db.prepare(
        `SELECT u.unit_index, u.anchor, u.block_type, u.references_json, u.label, u.heading, u.body FROM law_search_units u
         JOIN law_versions v ON v.norm_id = u.norm_id AND v.version_id = u.version_id
         WHERE u.norm_id = ? AND u.version_id = ?${sql} ORDER BY u.unit_index LIMIT ?`,
      ).bind(id, versionId, ...params, MAX_UNITS_PER_HIT).all<UnitRow>()).results;
    } else {
      unitRows = (await db.prepare(
        'SELECT unit_index, anchor, block_type, references_json, label, heading, body FROM law_search_units WHERE norm_id = ? AND version_id = ? ORDER BY unit_index LIMIT ?',
      ).bind(id, versionId, MAX_UNITS_PER_HIT).all<UnitRow>()).results;
    }

    const units: SearchUnit[] = unitRows.map((unit) => {
      const entry: SearchUnit = {
        index: Number(unit.unit_index),
        type: unit.block_type as SearchUnit['type'],
        anchor: unit.anchor,
        label: unit.label,
        heading: unit.heading,
        body: unit.body,
      };
      if (unit.references_json) entry.references = JSON.parse(unit.references_json) as SearchUnit['references'];
      return entry;
    });
    return { ...document, units };
  }

  return {
    kind: 'd1',
    jurisdiction,

    async listNormSummaries(query = {}) {
      const clauses = ['n.jurisdiction = ?'];
      const params: unknown[] = [jurisdiction];
      if (query.type) { clauses.push('n.type = ?'); params.push(query.type); }
      if (query.status) { clauses.push('n.status = ?'); params.push(query.status); }
      if (query.subject) { clauses.push('EXISTS (SELECT 1 FROM law_norm_subjects s WHERE s.norm_id = n.id AND s.subject = ?)'); params.push(query.subject); }
      const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000);
      const rows = await db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM law_norms n WHERE ${clauses.join(' AND ')} ORDER BY n.sort_key, n.slug LIMIT ?`).bind(...params, limit).all<NormRow>();
      return rows.results.map(toSummary);
    },

    async getNormSummary(slug) {
      const row = await db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM law_norms n WHERE n.id = ?`).bind(normId(jurisdiction, slug)).first<NormRow>();
      return row ? toSummary(row) : null;
    },

    async getNorm(slug, bodies: BodySelection = 'current') {
      const id = normId(jurisdiction, slug);
      const normRow = await db.prepare('SELECT meta_json, history_json, current_version_id FROM law_norms WHERE id = ?').bind(id).first<{ meta_json: string; history_json: string; current_version_id: string }>();
      if (!normRow) return null;
      const versionRows = (await db.prepare('SELECT version_id, version_json FROM law_versions WHERE norm_id = ? ORDER BY simulation_valid_from').bind(id).all<VersionRow>()).results;
      const skeleton: NormVersion[] = versionRows.map((row) => ({ ...(JSON.parse(row.version_json) as Omit<NormVersion, 'body'>), body: [] }));
      const wanted = selectVersionIds({ versions: skeleton }, normRow.current_version_id, bodies);
      const versions = await Promise.all(
        skeleton.map(async (version) => {
          if (!wanted.has(version.versionId)) return version;
          const blocks = (await db.prepare('SELECT block_index, part_index, block_json FROM law_version_blocks WHERE norm_id = ? AND version_id = ? ORDER BY block_index, part_index').bind(id, version.versionId).all<BlockRow>()).results;
          return { ...version, body: assembleBlocks(blocks) };
        }),
      );
      const record: NormRecord = {
        meta: parseNormMeta(JSON.parse(normRow.meta_json), `d1:${id}/meta`),
        history: parseNormHistory(JSON.parse(normRow.history_json), `d1:${id}/history`),
        versions: versions.map((version) => parseNormVersion(version, `d1:${id}/versions/${version.versionId}`)),
      };
      return validateNormRecord(record, `d1:${id}`);
    },

    async search(state) {
      const plan = buildSearchQueryPlan(state);
      const match = buildFtsMatch(plan);
      const filters = filterConditions(state, plan);
      const pageLimit = state.offset + state.limit;

      let candidates: CandidateRow[];
      let total: number;
      if (match) {
        const identityParams = plan.identityVariants.length > 0 ? plan.identityVariants : [''];
        const identityExpression = plan.identityVariants.length > 0
          ? `(lower(n.abbr) IN (${identityParams.map(() => '?').join(', ')}) OR lower(n.short_title) IN (${identityParams.map(() => '?').join(', ')}) OR lower(n.title) IN (${identityParams.map(() => '?').join(', ')}))`
          : '0';
        const identityBinds = plan.identityVariants.length > 0 ? [...identityParams, ...identityParams, ...identityParams] : [];
        const rows = await db.prepare(
          `SELECT s.norm_id, s.version_id, min(s.rank) AS best,
                  max(${identityExpression}) AS identity_hit
           FROM law_search s
           JOIN law_versions v ON v.norm_id = s.norm_id AND v.version_id = s.version_id
           JOIN law_norms n ON n.id = s.norm_id
           WHERE law_search MATCH ? AND rank MATCH ? AND n.jurisdiction = ?${filters.sql}
           GROUP BY s.norm_id, s.version_id
           ORDER BY ${orderBy(state.sort, true)} LIMIT ?`,
        ).bind(...identityBinds, match, SEARCH_RANK_WEIGHTS, jurisdiction, ...filters.params, pageLimit).all<CandidateRow>();
        candidates = rows.results;
        const count = await db.prepare(
          `SELECT count(*) AS total FROM (
             SELECT DISTINCT s.norm_id, s.version_id FROM law_search s
             JOIN law_versions v ON v.norm_id = s.norm_id AND v.version_id = s.version_id
             JOIN law_norms n ON n.id = s.norm_id
             WHERE law_search MATCH ? AND n.jurisdiction = ?${filters.sql})`,
        ).bind(match, jurisdiction, ...filters.params).first<{ total: number }>();
        total = Number(count?.total ?? 0);
      } else {
        const rows = await db.prepare(
          `SELECT v.norm_id, v.version_id FROM law_versions v JOIN law_norms n ON n.id = v.norm_id
           WHERE n.jurisdiction = ?${filters.sql} ORDER BY ${orderBy(state.sort, false)} LIMIT ?`,
        ).bind(jurisdiction, ...filters.params, pageLimit).all<CandidateRow>();
        candidates = rows.results;
        const count = await db.prepare(
          `SELECT count(*) AS total FROM law_versions v JOIN law_norms n ON n.id = v.norm_id WHERE n.jurisdiction = ?${filters.sql}`,
        ).bind(jurisdiction, ...filters.params).first<{ total: number }>();
        total = Number(count?.total ?? 0);
      }

      const hits: SearchHit[] = [];
      for (const candidate of candidates.slice(state.offset)) {
        const document = await loadDocument(candidate.norm_id, candidate.version_id, match, plan.references);
        if (!document) continue;
        const hit = evaluateDocument(document, plan) ?? fallbackHit(document);
        hits.push(hit);
      }
      return { total, offset: state.offset, limit: state.limit, hits };
    },

    async getStats() {
      const rows = (await db.prepare('SELECT key, value FROM law_runtime_meta').all<{ key: string; value: string }>()).results;
      const meta = new Map(rows.map((row) => [row.key, row.value]));
      return {
        normCount: Number(meta.get(RUNTIME_META_KEYS.normCount) ?? 0),
        versionCount: Number(meta.get(RUNTIME_META_KEYS.versionCount) ?? 0),
        projectedAt: meta.get(RUNTIME_META_KEYS.lastProjectedAt) ?? null,
        projectionFingerprint: meta.get(RUNTIME_META_KEYS.projectionFingerprint) ?? null,
      } satisfies StoreStats;
    },

    async getRuntimeMeta(key) {
      const row = await db.prepare('SELECT value FROM law_runtime_meta WHERE key = ?').bind(key).first<{ value: string }>();
      return row?.value ?? null;
    },
  };
}

/** Fail-safe: Ein Kandidat, den die Bewertung nicht reproduziert, bleibt ein Volltexttreffer. */
function fallbackHit(document: SearchDocument): SearchHit {
  const hit: SearchHit = {
    jurisdiction: document.jurisdiction,
    slug: document.slug,
    versionId: document.versionId,
    url: document.url,
    versionUrl: document.versionUrl,
    versionKind: document.versionKind,
    title: document.title,
    shortTitle: document.shortTitle,
    type: document.type,
    status: document.status,
    subjects: document.subjects,
    citation: document.citation,
    simulationValidFrom: document.simulationValidFrom,
    simulationValidTo: document.simulationValidTo,
    lastChangeDate: document.lastChangeDate,
    matchKind: 'body',
    matchLabel: MATCH_LABELS.body,
    snippet: document.summary ?? document.citation,
    rank: [5, document.versionKind === 'current' ? 0 : 1],
  };
  if (document.abbr !== undefined) hit.abbr = document.abbr;
  return hit;
}

export type { NormSummaryQuery };
