/**
 * NormStore über eine D1-Datenbank (eine Jurisdiktion). Lädt nie den gesamten Bestand:
 * Übersichten kommen aus schmalen Spalten, Normkörper blockweise nur für angeforderte
 * Fassungen, Suchtreffer über den FTS5-Index mit Kandidatenabfrage und Seitenzuschnitt.
 * Jede gelesene Zeile wird über die kanonischen Parser re-validiert (D1 ist abgeleitet).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { comparePublicationsNewestFirst } from '@landesrecht/legal-core/lib/publications.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import { expandNormTypeFilter } from '@landesrecht/legal-core/lib/schema.ts';
import { isSimulationChangeKind, type SimulationChangeKind } from '@landesrecht/legal-core/lib/simulation-change.ts';
import {
  parseNormHistory,
  parseNormMeta,
  parseNormVersion,
  parsePublication,
  validateNormRecord,
  type NormBodyBlock,
  type NormStatus,
  type NormType,
  type Publication,
} from '@landesrecht/legal-core/lib/schema.ts';
import {
  buildFtsAndMatch,
  buildFtsConjuncts,
  buildFtsMatch,
  buildFtsTitleMatch,
  buildSearchQueryPlan,
  buildSearchVariants,
  compareHits,
  compareRank,
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

import type { D1SchemaDialect, DialectCounts, DialectDocumentRow } from './d1-dialect.ts';
import type { D1Database } from './d1-types.ts';
import { normId, RUNTIME_META_KEYS } from './projection.ts';
import type { ReadOnlyD1Database } from './read-only-d1.ts';
import { selectVersionIds, type BodySelection, type NormStore, type NormSummary, type NormSummaryQuery, type NormTypeCount, type StoreStats } from './store.ts';

/** Der Store liest nur; eine Read-only-Hülle (OstRecht-D1) genügt ihm. */
export type ReadableD1 = Pick<D1Database, 'prepare'> | ReadOnlyD1Database;

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
  simulation_change_kind: string;
  last_simulation_change_date: string | null;
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

const SUMMARY_COLUMNS = 'jurisdiction, slug, title, short_title, abbr, type, status, current_version_id, current_valid_from, version_count, last_change_date, subjects_json, simulation_change_kind, last_simulation_change_date';

/** Dialekt der eigenen Projektion (`data/d1/0001_landesrecht.sql`). */
export function landesrechtDialect(jurisdiction: JurisdictionId): D1SchemaDialect {
  return {
    id: 'landesrecht',
    normId,
    normScope: { sql: 'n.jurisdiction = ?', params: [jurisdiction] },
    publicationScope: { sql: 'jurisdiction = ?', params: [jurisdiction] },
    summaryColumns: SUMMARY_COLUMNS,
    summaryParams: [],
    sortKey: 'n.sort_key',
    indexLetter: 'n.index_letter',
    simulationChangeKind: 'n.simulation_change_kind',
    lastSimulationChangeDate: 'n.last_simulation_change_date',
    validFrom: 'v.simulation_valid_from',
    validTo: 'v.simulation_valid_to',
    currentFlag: "(v.temporal_kind = 'current')",
    temporalKind: (kind) => ({ sql: 'v.temporal_kind = ?', params: [kind] }),
    unitIndex: (alias) => `${alias}.unit_index`,
    documentQuery: (placeholders) => `SELECT v.norm_id, v.version_id, v.search_document_json, n.simulation_change_kind, n.last_simulation_change_date FROM law_versions v JOIN law_norms n ON n.id = v.norm_id WHERE v.norm_id IN (${placeholders})`,
    adaptDocument: (row) => withSimulationChange(JSON.parse(row.search_document_json) as Omit<SearchDocument, 'units'>, row),
    adaptRecord: ({ id, meta, history, versions }) => validateNormRecord({
      meta: parseNormMeta(meta, `d1:${id}/meta`),
      history: parseNormHistory(history, `d1:${id}/history`),
      versions: versions.map((version) => parseNormVersion(version, `d1:${id}/versions/${String(version.versionId)}`)),
    }, `d1:${id}`),
    currentVersionId: (_record, stored) => stored,
    adaptSummary: (summary) => summary,
    stats: (meta, _counts) => ({
      normCount: Number(meta.get(RUNTIME_META_KEYS.normCount) ?? 0),
      versionCount: Number(meta.get(RUNTIME_META_KEYS.versionCount) ?? 0),
      projectedAt: meta.get(RUNTIME_META_KEYS.lastProjectedAt) ?? null,
      projectionFingerprint: meta.get(RUNTIME_META_KEYS.projectionFingerprint) ?? null,
    }),
    runtimeMetaKey: (key) => key,
    adaptPublication: (json, context) => parsePublication(json, context),
  };
}
const MAX_UNITS_PER_HIT = 8;
/** Obergrenze der Nachsuche nach Identitätstreffern (exakte Bezeichnung) außerhalb der Kandidatenseite. */
const IDENTITY_SCAN_LIMIT = 500;
/** Normkennungen je Sammelabfrage (D1 erlaubt höchstens 100 gebundene Parameter je Anweisung). */
const D1_MAX_BIND_CHUNK = 40;

/**
 * Eine gebundene, aber noch nicht projizierte D1 (kein Schema, z. B. leere Datenbank einer Jurisdiktion ohne
 * Bestand) ist ein gültiger Leerzustand, kein Serverfehler: Lesepfade liefern dann leere Ergebnisse. Jeder
 * andere Fehler (Bindung fehlt, SQL-Fehler, beschädigte Zeilen) bleibt ein Fehler.
 */
export function isUnprojectedDatabaseError(error: unknown): boolean {
  return /no such table:\s*law_/iu.test(String((error as Error)?.message ?? error));
}

async function unlessUnprojected<T>(action: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUnprojectedDatabaseError(error)) return fallback();
    throw error;
  }
}

/** Klassifikation aus der Zeile in das Suchdokument übernehmen (Trefferkennzeichnung, ohne Neuprojektion der Dokumente). */
export function withSimulationChange<T extends object>(document: T, row: { simulation_change_kind?: unknown; last_simulation_change_date?: unknown }): T & { simulationChangeKind?: SimulationChangeKind; lastSimulationChangeDate?: string | null } {
  if (!isSimulationChangeKind(row.simulation_change_kind)) return document;
  return { ...document, simulationChangeKind: row.simulation_change_kind, lastSimulationChangeDate: typeof row.last_simulation_change_date === 'string' ? row.last_simulation_change_date : null };
}

function toSummary(row: NormRow): NormSummary {
  if (!isSimulationChangeKind(row.simulation_change_kind)) throw new Error(`d1:${row.jurisdiction}/${row.slug}: unbekannte Klassifikation ${String(row.simulation_change_kind)} (Projektion veraltet? Migration 0003 und Vollprojektion)`);
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
    simulationChangeKind: row.simulation_change_kind,
    lastSimulationChangeDate: row.last_simulation_change_date ?? null,
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

/** Bedingungen einer Strukturadresse direkt auf einer Einheit (Alias `u`). */
function referenceUnitConditions(references: readonly StructuralIntent[]): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const intent of references) {
    if (intent.kind === 'paragraph') {
      conditions.push("json_extract(u.references_json, '$.paragraph') = ?");
      params.push(intent.number);
    } else if (intent.kind === 'article') {
      conditions.push("json_extract(u.references_json, '$.article') = ?");
      params.push(intent.number);
    } else if (intent.kind === 'number') {
      conditions.push("json_extract(u.references_json, '$.number') = ?");
      params.push(intent.number);
    }
    const subsection = intent.kind === 'subsection' ? intent.number : intent.subsection;
    if (subsection) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(json_extract(u.references_json, '$.subsections')) je WHERE je.value = ?)");
      params.push(subsection);
    }
  }
  return { conditions, params };
}

/** Fassungen, die mindestens eine Einheit mit der Strukturadresse enthalten (Kandidatenabfrage). */
function referenceConditions(references: readonly StructuralIntent[]): { sql: string; params: unknown[] } {
  const { conditions, params } = referenceUnitConditions(references);
  if (conditions.length === 0) return { sql: '', params: [] };
  return { sql: ` AND (v.norm_id, v.version_id) IN (SELECT u.norm_id, u.version_id FROM law_search_units u WHERE ${conditions.join(' AND ')})`, params };
}

/**
 * Filterbedingungen der Kandidaten- und Zählabfrage. `conjuncts` fügt je Suchwort eine AND-Unterabfrage auf
 * Normebene hinzu (Plan `or-prefix`); im Plan `and-first` erzwingt bereits der MATCH-Ausdruck alle Wörter.
 */
function filterConditions(dialect: D1SchemaDialect, state: SearchState, plan: SearchQueryPlan, conjuncts = true): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const types = expandNormTypeFilter(state.types);
  if (types.length > 0) {
    clauses.push(`n.type IN (${types.map(() => '?').join(', ')})`);
    params.push(...types);
  }
  if (state.statuses.length > 0) {
    clauses.push(`n.status IN (${state.statuses.map(() => '?').join(', ')})`);
    params.push(...state.statuses);
  }
  if (state.subjects.length > 0) {
    clauses.push(`EXISTS (SELECT 1 FROM law_norm_subjects s WHERE s.norm_id = n.id AND s.subject IN (${state.subjects.map(() => '?').join(', ')}))`);
    params.push(...state.subjects);
  }
  if (state.simulationChange) {
    clauses.push(`${dialect.simulationChangeKind} = ?`);
    params.push(state.simulationChange);
  }
  if (dialect.versionScope) clauses.push(dialect.versionScope);
  if (state.validOn) {
    clauses.push(`${dialect.validFrom} <= ? AND (${dialect.validTo} IS NULL OR ${dialect.validTo} >= ?)`);
    params.push(state.validOn, state.validOn);
  } else if (state.versionScope !== 'all') {
    const kind = dialect.temporalKind(state.versionScope);
    clauses.push(kind.sql);
    params.push(...kind.params);
  }
  if (conjuncts) {
    // Über `rowid` statt der UNINDEXED-Spalten des FTS-Index: FTS5 mit externem Inhalt lädt für jede UNINDEXED-Spalte
    // die vollständige Zeile der Inhaltstabelle (einschließlich `body`); der Umweg über law_search_units liest nur
    // den Schlüssel (gemessen: 2–3× schneller bei häufigen Präfixen wie „das“*).
    for (const conjunct of buildFtsConjuncts(plan)) {
      clauses.push('(v.norm_id, v.version_id) IN (SELECT u2.norm_id, u2.version_id FROM law_search_units u2 WHERE u2.id IN (SELECT rowid FROM law_search WHERE law_search MATCH ?))');
      params.push(conjunct);
    }
  }
  const references = referenceConditions(plan.references);
  return { sql: clauses.map((clause) => ` AND ${clause}`).join('') + references.sql, params: [...params, ...references.params] };
}

/** Änderungsvorschriften sind Änderungsträger, keine gleichrangigen Stammnormen: bei gleicher Trefferart dahinter (wie in OstRecht). */
const AMENDMENT_FLAG = "(n.type = 'aenderungsvorschrift')";

function orderBy(dialect: D1SchemaDialect, sort: SearchState['sort'], ranked: boolean): string {
  if (sort === 'title') return `${dialect.sortKey}, n.slug`;
  if (sort === 'activity') return `COALESCE(n.last_change_date, ${dialect.validFrom}) DESC, ${dialect.sortKey}`;
  return ranked
    ? `identity_hit DESC, ${dialect.currentFlag} DESC, ${AMENDMENT_FLAG}, best, ${dialect.sortKey}, n.slug`
    : `${dialect.currentFlag} DESC, ${AMENDMENT_FLAG}, ${dialect.sortKey}, n.slug`;
}

export function createD1NormStore(db: ReadableD1, jurisdiction: JurisdictionId, dialect: D1SchemaDialect = landesrechtDialect(jurisdiction)): NormStore {
  const unitIndex = dialect.unitIndex('u');
  /**
   * Lädt die Suchdokumente einer Kandidatenliste in Kandidatenreihenfolge (null für fehlende Fassungen).
   * Alle Kandidaten einer Seite werden gemeinsam abgefragt: Eine Volltextabfrage je Kandidat müsste die gesamten
   * FTS-Postings des Suchausdrucks erneut durchlaufen (bei häufigen Präfixen wie „west“* ≈ 300 ms D1-Zeit je
   * Kandidat); mit `row_number() OVER (PARTITION BY norm_id, version_id ORDER BY rank)` bleibt die Auswahl je
   * Fassung identisch (die bestbewerteten MAX_UNITS_PER_HIT Einheiten), die Postings werden aber nur einmal gelesen.
   */
  async function loadDocuments(candidates: readonly CandidateRow[], unitsMatch: string | null, references: readonly StructuralIntent[]): Promise<Array<SearchDocument | null>> {
    if (candidates.length === 0) return [];
    const pairKey = (row: { norm_id: string; version_id: string }): string => `${row.norm_id}#${row.version_id}`;
    const wanted = new Set(candidates.map(pairKey));
    const normIds = [...new Set(candidates.map((candidate) => candidate.norm_id))];
    const documents = new Map<string, Omit<SearchDocument, 'units'>>();
    const referenceRows = new Map<string, UnitRow[]>();
    const unitRows = new Map<string, UnitRow[]>();
    const collect = (target: Map<string, UnitRow[]>, rows: Array<UnitRow & CandidateRow>): void => {
      for (const row of rows) {
        const key = pairKey(row);
        if (!wanted.has(key)) continue;
        const list = target.get(key) ?? [];
        list.push(row);
        target.set(key, list);
      }
    };

    // Höchstens D1_MAX_BIND_CHUNK Normkennungen je Anweisung (D1 begrenzt die gebundenen Parameter).
    for (let start = 0; start < normIds.length; start += D1_MAX_BIND_CHUNK) {
      const chunk = normIds.slice(start, start + D1_MAX_BIND_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const documentQuery = db.prepare(dialect.documentQuery(placeholders)).bind(...chunk)
        .all<DialectDocumentRow>().then((result) => result.results);

      // Einheiten der Strukturadresse zuerst (sonst könnte „§ 28“ bei großen Normen hinter den acht
      // bestbewerteten Volltext-Einheiten verschwinden), dann die Volltext-Treffer.
      const referenceQuery: Promise<Array<UnitRow & CandidateRow>> = references.length > 0
        ? (() => {
            const { conditions, params } = referenceUnitConditions(references);
            return db.prepare(
              `SELECT norm_id, version_id, unit_index, anchor, block_type, references_json, label, heading, body FROM (
                 SELECT u.norm_id, u.version_id, ${unitIndex} AS unit_index, u.anchor, u.block_type, u.references_json, u.label, u.heading, u.body,
                        row_number() OVER (PARTITION BY u.norm_id, u.version_id ORDER BY ${unitIndex}) AS position
                 FROM law_search_units u WHERE u.norm_id IN (${placeholders})${conditions.map((condition) => ` AND ${condition}`).join('')}
               ) WHERE position <= ? ORDER BY norm_id, version_id, unit_index`,
            ).bind(...chunk, ...params, MAX_UNITS_PER_HIT).all<UnitRow & CandidateRow>().then((result) => result.results);
          })()
        : Promise.resolve([]);

      let unitQuery: Promise<Array<UnitRow & CandidateRow>>;
      if (unitsMatch) {
        unitQuery = db.prepare(
          `SELECT norm_id, version_id, unit_index, anchor, block_type, references_json, label, heading, body FROM (
             SELECT u.norm_id, u.version_id, ${unitIndex} AS unit_index, u.anchor, u.block_type, u.references_json, u.label, u.heading, u.body,
                    row_number() OVER (PARTITION BY u.norm_id, u.version_id ORDER BY s.rank) AS position
             FROM law_search s JOIN law_search_units u ON u.id = s.rowid
             WHERE law_search MATCH ? AND u.norm_id IN (${placeholders}) AND rank MATCH ?
           ) WHERE position <= ? ORDER BY norm_id, version_id, unit_index`,
        ).bind(unitsMatch, ...chunk, SEARCH_RANK_WEIGHTS, MAX_UNITS_PER_HIT).all<UnitRow & CandidateRow>().then((result) => result.results);
      } else if (references.length > 0) {
        unitQuery = Promise.resolve([]);
      } else {
        unitQuery = db.prepare(
          `SELECT norm_id, version_id, unit_index, anchor, block_type, references_json, label, heading, body FROM (
             SELECT u.norm_id, u.version_id, ${unitIndex} AS unit_index, u.anchor, u.block_type, u.references_json, u.label, u.heading, u.body,
                    row_number() OVER (PARTITION BY u.norm_id, u.version_id ORDER BY ${unitIndex}) AS position
             FROM law_search_units u WHERE u.norm_id IN (${placeholders})
           ) WHERE position <= ? ORDER BY norm_id, version_id, unit_index`,
        ).bind(...chunk, MAX_UNITS_PER_HIT).all<UnitRow & CandidateRow>().then((result) => result.results);
      }
      const [documentRows, referenceResult, unitResult] = await Promise.all([documentQuery, referenceQuery, unitQuery]);
      for (const row of documentRows) if (wanted.has(pairKey(row))) documents.set(pairKey(row), dialect.adaptDocument(row));
      collect(referenceRows, referenceResult);
      collect(unitRows, unitResult);
    }

    return candidates.map((candidate) => {
      const key = pairKey(candidate);
      const document = documents.get(key);
      if (!document) return null;
      const seen = new Set<number>();
      const merged = [...(referenceRows.get(key) ?? []), ...(unitRows.get(key) ?? [])].filter((unit) => {
        if (seen.has(Number(unit.unit_index))) return false;
        seen.add(Number(unit.unit_index));
        return true;
      });
      const units: SearchUnit[] = merged.map((unit) => {
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
    });
  }

  return {
    kind: 'd1',
    jurisdiction,

    async countNormsByType(): Promise<NormTypeCount[]> {
      const rows = await unlessUnprojected(() => db.prepare(`SELECT n.type AS type, COUNT(*) AS count FROM law_norms n WHERE ${dialect.normScope.sql} GROUP BY n.type ORDER BY n.type`).bind(...dialect.normScope.params).all<{ type: string; count: number }>(), () => ({ results: [] as Array<{ type: string; count: number }> }));
      return rows.results.map((row) => ({ type: row.type as NormType, count: Number(row.count) }));
    },

    async countNormFacets(query = {}) {
      const where = (parts: { types?: boolean; changeKind?: boolean; letter?: boolean }): { sql: string; params: unknown[] } => {
        const clauses = [dialect.normScope.sql];
        const params: unknown[] = [...dialect.normScope.params];
        if (parts.types !== false && query.types && query.types.length > 0) { clauses.push(`n.type IN (${query.types.map(() => '?').join(', ')})`); params.push(...query.types); }
        if (parts.changeKind !== false && query.changeKind) { clauses.push(`${dialect.simulationChangeKind} = ?`); params.push(query.changeKind); }
        if (parts.letter !== false && query.letter) { clauses.push(`${dialect.indexLetter} = ?`); params.push(query.letter); }
        return { sql: clauses.join(' AND '), params };
      };
      const run = async <T>(select: string, filter: { sql: string; params: unknown[] }, group: string): Promise<T[]> => (await unlessUnprojected(() => db.prepare(`SELECT ${select} FROM law_norms n WHERE ${filter.sql} GROUP BY ${group} ORDER BY ${group}`).bind(...filter.params).all<T>(), () => ({ results: [] as T[] }))).results;
      const [byType, byKind, byLetter] = await Promise.all([
        run<{ type: string; count: number }>('n.type AS type, COUNT(*) AS count', where({ types: false }), 'n.type'),
        run<{ kind: string; count: number }>(`${dialect.simulationChangeKind} AS kind, COUNT(*) AS count`, where({ changeKind: false }), 'kind'),
        run<{ letter: string; count: number }>(`${dialect.indexLetter} AS letter, COUNT(*) AS count`, where({ letter: false }), 'letter'),
      ]);
      const total = Number((await unlessUnprojected(() => db.prepare(`SELECT COUNT(*) AS count FROM law_norms n WHERE ${where({}).sql}`).bind(...where({}).params).first<{ count: number }>(), () => null))?.count ?? 0);
      const byChangeKind = { 'baseline-unchanged': 0, 'baseline-changed': 0, 'simulation-new': 0 } as Record<SimulationChangeKind, number>;
      for (const row of byKind) if (isSimulationChangeKind(row.kind)) byChangeKind[row.kind] = Number(row.count);
      return { total, byType: byType.map((row) => ({ type: row.type as NormType, count: Number(row.count) })), byChangeKind, byLetter: byLetter.map((row) => ({ letter: String(row.letter), count: Number(row.count) })) };
    },

    async listNormSummaries(query = {}) {
      const clauses = [dialect.normScope.sql];
      const params: unknown[] = [...dialect.summaryParams, ...dialect.normScope.params];
      const types = query.types && query.types.length > 0 ? query.types : query.type ? [query.type] : [];
      if (types.length > 0) { clauses.push(`n.type IN (${types.map(() => '?').join(', ')})`); params.push(...types); }
      if (query.status) { clauses.push('n.status = ?'); params.push(query.status); }
      if (query.subject) { clauses.push('EXISTS (SELECT 1 FROM law_norm_subjects s WHERE s.norm_id = n.id AND s.subject = ?)'); params.push(query.subject); }
      if (query.changeKind) { clauses.push(`${dialect.simulationChangeKind} = ?`); params.push(query.changeKind); }
      if (query.letter) { clauses.push(`${dialect.indexLetter} = ?`); params.push(query.letter); }
      const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000);
      const offset = Math.max(query.offset ?? 0, 0);
      const order = query.sort === 'change' ? `${dialect.lastSimulationChangeDate} DESC, ${dialect.sortKey}, n.slug` : `${dialect.sortKey}, n.slug`;
      const rows = await unlessUnprojected(() => db.prepare(`SELECT ${dialect.summaryColumns} FROM law_norms n WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...params, limit, offset).all<NormRow>(), () => ({ results: [] as NormRow[] }));
      return rows.results.map((row) => dialect.adaptSummary(toSummary(row)));
    },

    async getNormSummary(slug) {
      const row = await unlessUnprojected(() => db.prepare(`SELECT ${dialect.summaryColumns} FROM law_norms n WHERE n.id = ? AND ${dialect.normScope.sql}`).bind(...dialect.summaryParams, dialect.normId(jurisdiction, slug), ...dialect.normScope.params).first<NormRow>(), () => null);
      return row ? dialect.adaptSummary(toSummary(row)) : null;
    },

    async getNormSummaries(slugs) {
      const ids = [...new Set(slugs)].map((slug) => dialect.normId(jurisdiction, slug));
      const summaries: NormSummary[] = [];
      // Gebündelt und nacheinander: wenige Abfragen statt einer je Norm (Verkündungsseiten mit vielen Einträgen).
      for (let start = 0; start < ids.length; start += D1_MAX_BIND_CHUNK) {
        const chunk = ids.slice(start, start + D1_MAX_BIND_CHUNK);
        const rows = await unlessUnprojected(() => db.prepare(`SELECT ${dialect.summaryColumns} FROM law_norms n WHERE n.id IN (${chunk.map(() => '?').join(', ')}) AND ${dialect.normScope.sql}`).bind(...dialect.summaryParams, ...chunk, ...dialect.normScope.params).all<NormRow>(), () => ({ results: [] as NormRow[] }));
        summaries.push(...rows.results.map((row) => dialect.adaptSummary(toSummary(row))));
      }
      return summaries;
    },

    async getNorm(slug, bodies: BodySelection = 'current') {
      const id = dialect.normId(jurisdiction, slug);
      const normRow = await unlessUnprojected(() => db.prepare('SELECT meta_json, history_json, current_version_id FROM law_norms WHERE id = ?').bind(id).first<{ meta_json: string; history_json: string; current_version_id: string }>(), () => null);
      if (!normRow) return null;
      const versionRows = (await db.prepare(`SELECT version_id, version_json FROM law_versions WHERE norm_id = ? ORDER BY ${dialect.validFrom.replace(/^v\./u, '')}`).bind(id).all<VersionRow>()).results;
      const skeleton: Array<Record<string, unknown> & { versionId: string; body: NormBodyBlock[] }> = versionRows.map((row) => ({ ...(JSON.parse(row.version_json) as Record<string, unknown>), versionId: row.version_id, body: [] as NormBodyBlock[] }));
      const derived = dialect.derivedQuery ? await db.prepare(dialect.derivedQuery).bind(id).first<Record<string, unknown>>() : undefined;
      const meta = JSON.parse(normRow.meta_json) as Record<string, unknown>;
      const history = JSON.parse(normRow.history_json) as Record<string, unknown>;
      // Erst das Skelett übersetzen (Baseline-Regel, Geltungsachse), dann die Körper der gewünschten Fassungen laden.
      const skeletonRecord = dialect.adaptRecord({ id, meta, history, versions: skeleton, derived });
      if (!skeletonRecord) return null;
      const wanted = selectVersionIds(skeletonRecord, dialect.currentVersionId(skeletonRecord, normRow.current_version_id), bodies);
      const versions = await Promise.all(
        skeleton.map(async (version) => {
          if (!wanted.has(version.versionId)) return version;
          const blocks = (await db.prepare('SELECT block_index, part_index, block_json FROM law_version_blocks WHERE norm_id = ? AND version_id = ? ORDER BY block_index, part_index').bind(id, version.versionId).all<BlockRow>()).results;
          return { ...version, body: assembleBlocks(blocks) };
        }),
      );
      return dialect.adaptRecord({ id, meta, history, versions, derived });
    },

    async search(state) {
      return unlessUnprojected(() => searchProjected(state), () => ({ total: 0, offset: state.offset, limit: state.limit, hits: [] }));
    },

    async getStats() {
      const rows = (await unlessUnprojected(() => db.prepare('SELECT key, value FROM law_runtime_meta').all<{ key: string; value: string }>(), () => ({ results: [] as Array<{ key: string; value: string }> }))).results;
      const meta = new Map(rows.map((row) => [row.key, row.value]));
      const counts = dialect.statsQuery ? await unlessUnprojected(() => db.prepare(dialect.statsQuery!).first<DialectCounts>(), () => null) : null;
      return dialect.stats(meta, counts) satisfies StoreStats;
    },

    async getRuntimeMeta(key) {
      const row = await unlessUnprojected(() => db.prepare('SELECT value FROM law_runtime_meta WHERE key = ?').bind(dialect.runtimeMetaKey(key)).first<{ value: string }>(), () => null);
      return row?.value ?? null;
    },

    async listPublications(query = {}) {
      // Nur law_publications; der Normenbestand wird dafür nicht gelesen. Eine Datenbank ohne die Tabelle (Schema 0001,
      // Migration 0002 noch nicht eingespielt) ist ein Leerzustand, kein Fehler.
      const rows = await unlessUnprojected(() => db.prepare(`SELECT slug, publication_json FROM law_publications WHERE ${dialect.publicationScope.sql} ORDER BY publication_date DESC, slug`).bind(...dialect.publicationScope.params).all<{ slug: string; publication_json: string }>(), () => ({ results: [] as Array<{ slug: string; publication_json: string }> }));
      const publications: Publication[] = rows.results.map((row) => dialect.adaptPublication(JSON.parse(row.publication_json), `d1:${jurisdiction}/publications/${row.slug}`)).sort(comparePublicationsNewestFirst);
      return query.limit === undefined ? publications : publications.slice(0, Math.max(0, query.limit));
    },

    async getPublication(slug) {
      const row = await unlessUnprojected(() => db.prepare(`SELECT publication_json FROM law_publications WHERE ${dialect.publicationScope.sql} AND slug = ?`).bind(...dialect.publicationScope.params, slug).first<{ publication_json: string }>(), () => null);
      return row ? dialect.adaptPublication(JSON.parse(row.publication_json), `d1:${jurisdiction}/publications/${slug}`) : null;
    },
  };

  async function searchProjected(state: SearchState): Promise<ReturnType<NormStore['search']> extends Promise<infer Page> ? Page : never> {
    const plan = buildSearchQueryPlan(state);
    const orMatch = buildFtsMatch(plan);
    const andMatch = plan.matchMode === 'and-first' ? buildFtsAndMatch(plan) : null;
    const pageLimit = state.offset + state.limit;
    // Kandidatenordnung nach Bezeichnung: bei Adressanfragen („Nr. 1.1 FüR“) die Bezeichnung ohne Adresse, damit die
    // Norm, die die Bewertung im Speicher ohnehin voranstellt, nicht an der Kandidatengrenze scheitert – eine
    // Abkürzung, die normalisiert einem Funktionswort gleicht („FüR“ → „für“), träfe sonst hunderte Einheiten.
    // Neben den gefalteten Varianten die rohe Schreibung („für“ zu „FüR“): SQLite senkt in lower() nur ASCII ab, deshalb
    // werden Ä/Ö/Ü vorher ersetzt. Ohne sie fände die Kandidatenordnung eine Abkürzung mit Umlaut nie als Bezeichnung.
    const poolIdentity = plan.identityVariants.length > 0
      ? [...new Set([plan.identityRaw, ...plan.identityVariants])]
      : plan.references.length > 0 && plan.subjectRaw !== '' ? [...new Set([plan.subjectRaw, ...plan.subjectVariants])] : [];
    const identityParams = poolIdentity.length > 0 ? poolIdentity : [''];
    const folded = (column: string): string => `lower(replace(replace(replace(${column}, 'Ä', 'ä'), 'Ö', 'ö'), 'Ü', 'ü'))`;
    // Auch Aliasse (frühere oder alternative Bezeichnungen, `aliases_json`) sind Bezeichnungen der Norm.
    const identityList = identityParams.map(() => '?').join(', ');
    const identityExpression = poolIdentity.length > 0
      ? `(${folded('n.abbr')} IN (${identityList}) OR ${folded('n.short_title')} IN (${identityList}) OR ${folded('n.title')} IN (${identityList})
          OR EXISTS (SELECT 1 FROM json_each(n.aliases_json) alias WHERE ${folded('alias.value')} IN (${identityList})))`
      : '0';
    const identityBinds = poolIdentity.length > 0 ? [...identityParams, ...identityParams, ...identityParams, ...identityParams] : [];

    // Kandidatenseite eines MATCH-Ausdrucks. Der Join über `rowid` auf law_search_units vermeidet, dass FTS5 für die
    // UNINDEXED-Spalten jede Trefferzeile vollständig (mit `body`) aus der Inhaltstabelle lädt.
    const rankedCandidates = async (match: string, filters: { sql: string; params: unknown[] }, withIdentity: boolean): Promise<CandidateRow[]> => (await db.prepare(
      `SELECT u.norm_id, u.version_id, min(s.rank) AS best, max(${withIdentity ? identityExpression : '0'}) AS identity_hit
       FROM law_search s JOIN law_search_units u ON u.id = s.rowid
       JOIN law_versions v ON v.norm_id = u.norm_id AND v.version_id = u.version_id
       JOIN law_norms n ON n.id = u.norm_id
       WHERE law_search MATCH ? AND rank MATCH ? AND ${dialect.normScope.sql}${filters.sql}
       GROUP BY u.norm_id, u.version_id
       ORDER BY ${orderBy(dialect, state.sort, true)} LIMIT ?`,
    ).bind(...(withIdentity ? identityBinds : []), match, SEARCH_RANK_WEIGHTS, ...dialect.normScope.params, ...filters.params, pageLimit).all<CandidateRow>()).results;
    /** Gesamtzahl über den MATCH-Ausdruck (Plan `and-first`: der Ausdruck selbst erzwingt alle Wörter). */
    const countMatched = async (match: string, filters: { sql: string; params: unknown[] }): Promise<number> => Number((await db.prepare(
      `SELECT count(*) AS total FROM (
         SELECT DISTINCT u.norm_id, u.version_id FROM law_search s JOIN law_search_units u ON u.id = s.rowid
         JOIN law_versions v ON v.norm_id = u.norm_id AND v.version_id = u.version_id
         JOIN law_norms n ON n.id = u.norm_id
         WHERE law_search MATCH ? AND ${dialect.normScope.sql}${filters.sql})`,
    ).bind(match, ...dialect.normScope.params, ...filters.params).first<{ total: number }>())?.total ?? 0);
    /**
     * Gesamtzahl des Plans `or-prefix` ohne treibenden MATCH: Die AND-Unterabfragen je Wort bestimmen die Menge bereits
     * vollständig (jede Fassung, die alle Wörter enthält, trifft auch das OR); der Lauf über alle OR-Trefferzeilen
     * entfällt. Ergibt sie 0, wird die Kandidatenabfrage gar nicht erst gestellt.
     */
    const countConjunctive = async (filters: { sql: string; params: unknown[] }): Promise<number> => Number((await db.prepare(
      `SELECT count(*) AS total FROM law_versions v JOIN law_norms n ON n.id = v.norm_id WHERE ${dialect.normScope.sql}${filters.sql}`,
    ).bind(...dialect.normScope.params, ...filters.params).first<{ total: number }>())?.total ?? 0);

    // Titel mit Strukturangaben („… zu § 74 Absatz 4 …“): Kandidaten ohne Strukturfilter; übernommen wird nur, was
    // evaluateDocument als Titeltreffer bestätigt (titleCarriesReferences).
    const wantsRelaxed = plan.references.length > 0 && plan.freeText;
    const relaxedTitleHits = async (match: string, conjuncts: boolean, known: ReadonlySet<string>): Promise<SearchHit[]> => {
      const relaxed = filterConditions(dialect, state, { ...plan, references: [] }, conjuncts);
      const rows = await rankedCandidates(match, relaxed, false);
      const unknown = rows.filter((candidate) => !known.has(`${candidate.norm_id}#${candidate.version_id}`));
      const titleHits: SearchHit[] = [];
      for (const document of await loadDocuments(unknown, match, [])) {
        const hit = document ? evaluateDocument(document, plan) : null;
        if (hit) titleHits.push(hit);
      }
      return titleHits;
    };

    // Wirksamer MATCH-Ausdruck und wirksame Filter: im Plan `and-first` zuerst der strenge Ausdruck ohne
    // Unterabfragen (und bei Strukturangaben die entspannte Titelsuche); liefert beides nichts, der großzügige
    // `or-prefix`-Plan (Wörter aus verschiedenen Einheiten, Präfixe auf früheren Wörtern), sofern er sich unterscheidet.
    let match = orMatch;
    let filters = filterConditions(dialect, state, plan);
    let candidates: CandidateRow[] = [];
    let total = 0;
    let titleHits: SearchHit[] | null = null;
    const pairKey = (row: CandidateRow): string => `${row.norm_id}#${row.version_id}`;
    if (andMatch && orMatch) {
      match = andMatch;
      filters = filterConditions(dialect, state, plan, false);
      candidates = await rankedCandidates(andMatch, filters, true);
      total = candidates.length > 0 ? await countMatched(andMatch, filters) : 0;
      if (candidates.length === 0 && wantsRelaxed) titleHits = await relaxedTitleHits(andMatch, false, new Set());
      if (candidates.length === 0 && (titleHits?.length ?? 0) === 0 && andMatch !== orMatch) {
        match = orMatch;
        filters = filterConditions(dialect, state, plan);
        titleHits = null;
        total = await countConjunctive(filters);
        candidates = total > 0 ? await rankedCandidates(orMatch, filters, true) : [];
      }
    } else if (match) {
      total = await countConjunctive(filters);
      candidates = total > 0 ? await rankedCandidates(match, filters, true) : [];
    } else {
      const rows = await db.prepare(
        `SELECT v.norm_id, v.version_id FROM law_versions v JOIN law_norms n ON n.id = v.norm_id
         WHERE ${dialect.normScope.sql}${filters.sql} ORDER BY ${orderBy(dialect, state.sort, false)} LIMIT ?`,
      ).bind(...dialect.normScope.params, ...filters.params, pageLimit).all<CandidateRow>();
      candidates = rows.results;
      total = await countConjunctive(filters);
    }

    // Titeltreffer (alle Suchwörter in Titel, Kurztitel oder Abkürzung) zusätzlich als Kandidaten: bm25 über Einheiten
    // zieht Normen mit vielen Nennungen im Text vor, die Bewertung im Speicher ordnet Titeltreffer aber vor Volltext.
    const pageFull = candidates.length >= pageLimit;
    const titleMatch = match && state.sort === 'relevance' ? buildFtsTitleMatch(plan) : null;
    if (titleMatch) {
      const known = new Set(candidates.map(pairKey));
      candidates = [...candidates, ...(await rankedCandidates(titleMatch, filters, true)).filter((row) => !known.has(pairKey(row)))];
    }

    // Sortiert wie im Dateistore: echte Adresstreffer vor Titeltreffern.
    if (match && wantsRelaxed) {
      titleHits ??= await relaxedTitleHits(match, match === orMatch, new Set(candidates.map(pairKey)));
      if (titleHits.length > 0) {
        const referenceHits: SearchHit[] = [];
        for (const document of await loadDocuments(candidates, match, plan.references)) {
          if (document) referenceHits.push(evaluateDocument(document, plan) ?? fallbackHit(document));
        }
        const merged = [...referenceHits, ...titleHits].sort((left, right) => compareHits(left, right, state.sort));
        return { total: total + titleHits.length, offset: state.offset, limit: state.limit, hits: merged.slice(state.offset, state.offset + state.limit) };
      }
    }

    // Alle Kandidaten gemeinsam laden (Reihenfolge bleibt die der Kandidatenliste), dann bei Relevanzsortierung nach
    // Trefferart ordnen: Bezeichnung, Adresse und Titel vor Text; innerhalb der Textstufen bleibt die bm25-Reihenfolge.
    let hits: SearchHit[] = [];
    for (const document of await loadDocuments(candidates, match, plan.references)) {
      if (!document) continue;
      hits.push(evaluateDocument(document, plan) ?? fallbackHit(document));
    }
    if (state.sort === 'relevance') hits = sortPageByMatchKind(hits);

    // Identitätstreffer (exakter Titel, Kurzbezeichnung, Abkürzung) dürfen nicht an der Kandidatengrenze
    // scheitern: Der SQL-Vergleich kennt die Normalisierung der Suche nicht (Umlaute, ß), deshalb wird bei
    // Bedarf einmalig über Bezeichnungen nachgesucht und im Speicher verglichen. Ist die Kandidatenseite nicht
    // voll, liegt bereits jede passende Fassung darauf; die Nachsuche entfällt.
    if (match && plan.identityVariants.length > 0 && pageFull && !hits.some((hit) => hit.matchKind === 'identity')) {
      const rows = await db.prepare(
        `SELECT DISTINCT u.norm_id, u.version_id, n.title, n.short_title, n.abbr, n.aliases_json
         FROM law_search s JOIN law_search_units u ON u.id = s.rowid
         JOIN law_versions v ON v.norm_id = u.norm_id AND v.version_id = u.version_id
         JOIN law_norms n ON n.id = u.norm_id
         WHERE law_search MATCH ? AND ${dialect.normScope.sql}${filters.sql} LIMIT ?`,
      ).bind(match, ...dialect.normScope.params, ...filters.params, IDENTITY_SCAN_LIMIT).all<{ norm_id: string; version_id: string; title: string; short_title: string | null; abbr: string | null; aliases_json: string | null }>();
      const known = new Set(candidates.map(pairKey));
      const identityHits: SearchHit[] = [];
      const nameMatches = rows.results.filter((row) => {
        if (known.has(pairKey(row))) return false;
        const aliases = row.aliases_json ? (JSON.parse(row.aliases_json) as unknown[]).filter((value): value is string => typeof value === 'string') : [];
        const names = [row.title, row.short_title, row.abbr, ...aliases].filter((value): value is string => Boolean(value));
        return names.some((name) => buildSearchVariants(name).some((variant) => plan.identityVariants.includes(variant)));
      });
      for (const document of await loadDocuments(nameMatches, match, plan.references)) {
        const hit = document ? evaluateDocument(document, plan) : null;
        if (hit?.matchKind === 'identity') identityHits.push(hit);
      }
      if (identityHits.length > 0) {
        hits = [...identityHits, ...hits].sort((left, right) => compareHits(left, right, state.sort));
        total += identityHits.length;
      }
    }
    return { total, offset: state.offset, limit: state.limit, hits: hits.slice(state.offset, state.offset + state.limit) };
  }
}

/**
 * Ordnet eine Trefferseite nach Trefferart: Bezeichnung (0), Adresse (1), Titel (2), Adresse ohne Titel (3) in ihrer
 * Bewertungsreihenfolge; Treffer im Text (4/5) behalten die bm25-Reihenfolge der Kandidatenabfrage (stabil).
 */
export function sortPageByMatchKind(hits: readonly SearchHit[]): SearchHit[] {
  const tier = (hit: SearchHit): number[] => ((hit.rank[0] ?? 6) <= 3 ? hit.rank : [4]);
  return hits.map((hit, index) => ({ hit, index })).sort((left, right) => compareRank(tier(left.hit), tier(right.hit)) || left.index - right.index).map((entry) => entry.hit);
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
    ...(document.simulationChangeKind ? { simulationChangeKind: document.simulationChangeKind, lastSimulationChangeDate: document.lastSimulationChangeDate ?? null } : {}),
    matchKind: 'body',
    matchLabel: MATCH_LABELS.body,
    snippet: document.summary ?? document.citation,
    rank: [5, document.versionKind === 'current' ? 0 : 1],
  };
  if (document.abbr !== undefined) hit.abbr = document.abbr;
  return hit;
}

export type { NormSummaryQuery };
