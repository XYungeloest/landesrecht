/**
 * Ost-Store über die OstRecht-D1 `ostrecht-recht` (Variante A der Ost-Anbindung).
 *
 * Datenfluss: OstRecht Git/Importer → D1 `ostrecht-recht` (Projektion von OstRecht) → dieser Store (nur lesend, über
 * `ReadOnlyD1Database`) → Landesrecht Web/API. Landesrecht besitzt für Ost bewusst keine zweite kanonische
 * Rechtsdatenbank (die frühere leere `landesrecht-ost` ist seit 2026-09-28 entfernt); neue Ost-Rechtsakte entstehen nur in
 * OstRecht. Alles, was Landesrecht anders sieht als OstRecht, wird beim Lesen abgeleitet, nie gespeichert:
 *
 *   - Baseline-Regel: die OstRecht-Fassung, die am Ausgangsrechtsstand (2023-12-01) galt, beginnt hier am
 *     Ausgangsrechtsstand; ihre OstRecht-Version-ID und die Quellgeltung bleiben erhalten (`alignOstRechtVersionsToBaseline`).
 *     Fassungen, die schon vorher endeten, gehören nicht zum Bestand; eine Norm ohne Fassung ab dem Ausgangsrechtsstand
 *     ist für Landesrecht nicht vorhanden.
 *   - Zeitliche Art (geltend/künftig/historisch) aus Geltungsintervall und dem redaktionellen Stichtag von Landesrecht,
 *     nicht aus OstRechts gespeicherten `temporal_kind`/`is_current` (OstRecht führt einen eigenen Stichtag).
 *   - Suchdokumente: OstRechts `SearchIndexDocument` (law_search_documents) wird beim Lesen an `SearchDocument`
 *     angepasst; die Sucheinheiten und der FTS5-Index von OstRecht werden direkt genutzt (kein eigener Ost-Suchindex).
 *   - Verkündungen: `law_publications.publication_json` (OstRecht-Dateiformat) wird beim Lesen adaptiert.
 *   - Relationen: OstRecht-Metadaten (Adapter in @landesrecht/providers) plus `law_norm_derived.relations_json`.
 *
 * Der Schema-Contract (`ostrecht-contract.ts`) wird vor dem ersten Zugriff geprüft und schlägt bei Inkompatibilität oder
 * unvollständigem Sync (`sync_state ≠ complete`) klar fehl – keine halbgültige Auslieferung.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTIONS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getNormUrl, getNormVersionUrl } from '@landesrecht/legal-core/lib/routes.ts';
import {
  ContentValidationError,
  NORM_RELATION_TYPES,
  NORM_TYPES,
  parsePublication,
  type NormRecord,
  type NormRelation,
  type NormRelationType,
  type NormStatus,
  type NormType,
  type Publication,
} from '@landesrecht/legal-core/lib/schema.ts';
import { classifyNormVersion, type VersionTemporalKind } from '@landesrecht/legal-core/lib/versions.ts';
import { adaptOstRechtRecord, adaptOstRechtSource, adaptOstRechtStatus, OSTRECHT_SYSTEM, OSTRECHT_TARGET_JURISDICTION } from '@landesrecht/providers/ostrecht.ts';
import { buildSearchQueryPlan, compareHits, documentMatchesFilters, evaluateDocument, type SearchDocument, type SearchHit, type SearchResultPage, type SearchState } from '@landesrecht/search/index.ts';

import type { D1SchemaDialect, DialectDocumentRow } from './d1-dialect.ts';
import { createD1NormStore, withSimulationChange } from './d1-store.ts';
import { assertOstRechtSchemaContract, type OstRechtContractOptions } from './ostrecht-contract.ts';
import { getOstRechtFreshness, type OstRechtFreshnessReport } from './ostrecht-freshness.ts';
import type { ReadOnlyD1Database } from './read-only-d1.ts';
import type { NormStore } from './store.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Datumsliteral für SQL; nur geprüfte ISO-Daten aus der Konfiguration, nie Nutzereingaben. */
function dateLiteral(date: string): string {
  if (!ISO_DATE.test(date)) throw new Error(`Kein ISO-Datum für ein SQL-Literal: ${date}`);
  return `'${date}'`;
}

export const OSTRECHT_RUNTIME_META_KEYS = {
  lastSyncAt: 'last_sync_at',
  syncState: 'sync_state',
  syncMode: 'sync_mode',
  corpusHash: 'corpus_hash',
  projectionFingerprint: 'projection_fingerprint',
  projectionScope: 'projection_scope',
  normCount: 'norm_count',
  publicationCount: 'publication_count',
  searchDocumentCount: 'search_document_count',
} as const;

/** Landesrecht-Metaschlüssel (projection.ts) → OstRecht-Schlüssel (scripts/sync-recht-d1.mjs von OstRecht). */
const RUNTIME_META_KEY_MAP: Readonly<Record<string, string>> = {
  last_projected_at: OSTRECHT_RUNTIME_META_KEYS.lastSyncAt,
  projection_state: OSTRECHT_RUNTIME_META_KEYS.syncState,
  version_count: OSTRECHT_RUNTIME_META_KEYS.searchDocumentCount,
};

/** OstRecht-Suchdokument (packages/recht-search von OstRecht), nur die hier gelesenen Felder. */
export interface OstRechtSearchIndexDocument {
  id: string;
  slug: string;
  versionId: string;
  title: string;
  shortTitle: string;
  abbr: string;
  aliases?: string[];
  type: string;
  subjects: string[];
  keywords: string[];
  status: string;
  summary: string;
  citation: string;
  validFrom: string;
  validTo: string | null;
  lastChangeDate?: string;
}

export interface OstRechtDocumentRow extends DialectDocumentRow {
  status?: string | null;
  last_change_date?: string | null;
}

/**
 * Passt ein OstRecht-Suchdokument an das Suchdokument von Landesrecht an (Kopfdaten; die Einheiten kommen aus
 * law_search_units). Baseline-Regel und zeitliche Art werden aus den Geltungsdaten und dem Stichtag abgeleitet.
 */
export function adaptOstRechtSearchDocument(
  document: OstRechtSearchIndexDocument,
  options: { status?: string | null; lastChangeDate?: string | null; asOf?: string; baseline?: string } = {},
): Omit<SearchDocument, 'units'> {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const baseline = options.baseline ?? SIMULATION_BASELINE_DATE;
  const jurisdiction = OSTRECHT_TARGET_JURISDICTION;
  const status = adaptOstRechtStatus(options.status ?? document.status) as NormStatus;
  const simulationValidFrom = document.validFrom < baseline ? baseline : document.validFrom;
  const simulationValidTo = document.validTo ?? null;
  const versionKind: VersionTemporalKind = classifyNormVersion(
    { meta: { status } as NormRecord['meta'] },
    { simulationValidFrom, simulationValidTo } as NormRecord['versions'][number],
    asOf,
  );
  const rawLastChange = options.lastChangeDate ?? document.lastChangeDate ?? null;
  const lastChangeDate = rawLastChange === null ? null : rawLastChange < baseline ? baseline : rawLastChange;
  const adapted: Omit<SearchDocument, 'units'> = {
    id: `${jurisdiction}:${document.slug}:${document.versionId}`,
    jurisdiction,
    slug: document.slug,
    versionId: document.versionId,
    url: getNormUrl(jurisdiction, document.slug),
    versionUrl: getNormVersionUrl(jurisdiction, document.slug, document.versionId),
    versionKind,
    title: document.title,
    shortTitle: document.shortTitle || document.title,
    aliases: Array.isArray(document.aliases) ? document.aliases.filter((alias) => typeof alias === 'string' && alias.trim() !== '') : [],
    type: document.type as NormType,
    status,
    subjects: Array.isArray(document.subjects) ? document.subjects : [],
    keywords: Array.isArray(document.keywords) ? document.keywords : [],
    citation: document.citation,
    simulationValidFrom,
    simulationValidTo,
    lastChangeDate,
  };
  if (document.abbr && document.abbr.trim() !== '') adapted.abbr = document.abbr;
  if (document.summary && document.summary.trim() !== '') adapted.summary = document.summary;
  return adapted;
}

/** OstRecht-Verkündungsdatei (`content/verkuendungen/<slug>.json`), wie in `law_publications.publication_json`. */
export interface OstRechtPublicationFile {
  slug: string;
  title: string;
  year: number;
  issue: string;
  date: string;
  publication: string;
  place?: string;
  publisher?: string;
  pdf?: string;
  originalIssueDesignation?: string;
  alternativeIssueDesignation?: string;
  sourceReferences?: Array<Record<string, unknown>>;
  entries?: Array<Record<string, unknown>>;
}

/** Übersetzt eine OstRecht-Verkündung beim Lesen in das kanonische Modell (keine Kopie im Git). */
export function adaptOstRechtPublication(raw: OstRechtPublicationFile, context = `ostrecht/publications/${raw.slug}`): Publication {
  const siteUrl = JURISDICTIONS[OSTRECHT_TARGET_JURISDICTION].upstreamSourceOfTruth?.siteUrl ?? '';
  const sourceReferences: Record<string, unknown>[] = (raw.sourceReferences ?? []).map((entry) => adaptOstRechtSource(entry).source);
  if (typeof raw.pdf === 'string' && raw.pdf.trim() !== '') {
    sourceReferences.push({
      kind: 'primary-pdf',
      system: OSTRECHT_SYSTEM,
      label: 'Amtliche PDF-Ausgabe (OstRecht)',
      availability: 'external',
      url: raw.pdf.startsWith('http') ? raw.pdf : `${siteUrl}${raw.pdf}`,
    });
  }
  const alternativeDesignations = [raw.originalIssueDesignation, raw.alternativeIssueDesignation].filter((value): value is string => typeof value === 'string' && value.trim() !== '');
  const publication: Record<string, unknown> = {
    slug: raw.slug,
    jurisdiction: OSTRECHT_TARGET_JURISDICTION,
    title: raw.title,
    gazette: raw.publication,
    year: raw.year,
    issue: raw.issue,
    date: raw.date,
    place: raw.place,
    publisher: raw.publisher,
    sourceReferences,
    // Einträge ohne Normbezug (etwa Beschlüsse im Staatsanzeiger) sind keine Normeinträge des kanonischen Modells.
    entries: (raw.entries ?? []).filter((entry) => typeof entry.normSlug === 'string' && entry.normSlug !== '').map((entry) => {
      const item: Record<string, unknown> = { title: entry.title, citation: entry.citation, normSlug: entry.normSlug };
      if (typeof entry.type === 'string' && (NORM_TYPES as readonly string[]).includes(entry.type)) item.type = entry.type;
      for (const key of ['versionId', 'pages', 'documentDate'] as const) if (typeof entry[key] === 'string') item[key] = entry[key];
      if (typeof entry.startPage === 'number') item.startPage = entry.startPage;
      return item;
    }),
  };
  if (alternativeDesignations.length > 0) publication.alternativeDesignations = alternativeDesignations;
  for (const key of Object.keys(publication)) if (publication[key] === undefined) delete publication[key];
  return parsePublication(publication, context);
}

/** Abgeleitete OstRecht-Relationen (`law_norm_derived.relations_json`) → kanonische Relationstypen. */
const DERIVED_RELATION_KINDS: Readonly<Record<string, NormRelationType>> = {
  amends: 'amends',
  'amended-by': 'amended-by',
  repeals: 'repeals',
  'repealed-by': 'repealed-by',
  enacts: 'contains',
  'enacted-by': 'part-of',
  contains: 'contains',
  'part-of': 'part-of',
  replaces: 'replaces',
  'replaced-by': 'replaced-by',
  corrects: 'corrects',
  'corrected-by': 'corrected-by',
};

export function mergeDerivedRelations(record: NormRecord, relationsJson: unknown): NormRecord {
  if (typeof relationsJson !== 'string') return record;
  let derived: unknown;
  try {
    derived = JSON.parse(relationsJson);
  } catch {
    return record;
  }
  if (!Array.isArray(derived)) return record;
  const relations: NormRelation[] = record.meta.relations.map((relation) => ({ ...relation }));
  const known = new Set(relations.map((relation) => `${relation.type}#${relation.target.slug}`));
  for (const entry of derived) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const type = DERIVED_RELATION_KINDS[String(item.kind)];
    const slug = typeof item.slug === 'string' ? item.slug : undefined;
    if (!type || !slug || !(NORM_RELATION_TYPES as readonly string[]).includes(type)) continue;
    const key = `${type}#${slug}`;
    const title = typeof item.shortTitle === 'string' && item.shortTitle ? item.shortTitle : typeof item.title === 'string' ? item.title : undefined;
    const citation = typeof item.citation === 'string' ? item.citation : undefined;
    const note = [title, citation ? `(${citation})` : undefined].filter(Boolean).join(' ');
    if (known.has(key)) {
      // Relation aus den Metadaten bereits vorhanden: nur die Beschreibung (Titel, Fundstelle) ergänzen.
      const existing = relations.find((relation) => relation.type === type && relation.target.slug === slug);
      if (existing && !existing.note && note) existing.note = note;
      continue;
    }
    known.add(key);
    const relation: NormRelation = { type, target: { slug } };
    if (note) relation.note = note;
    relations.push(relation);
  }
  return { ...record, meta: { ...record.meta, relations } };
}

export interface OstRechtDialectOptions {
  /** Redaktioneller Stichtag von Landesrecht (Standard: EDITORIAL_REFERENCE_DATE). */
  asOf?: string;
  /** Ausgangsrechtsstand (Standard: SIMULATION_BASELINE_DATE). */
  baseline?: string;
}

/** SQL-Dialekt der OstRecht-Projektion (`ostrecht-recht`, Migrationen 0001–0008 von OstRecht). */
export function ostrechtDialect(options: OstRechtDialectOptions = {}): D1SchemaDialect {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const baseline = options.baseline ?? SIMULATION_BASELINE_DATE;
  const REF = dateLiteral(asOf);
  const BASE = dateLiteral(baseline);
  const jurisdiction: JurisdictionId = OSTRECHT_TARGET_JURISDICTION;

  // Landesrecht-Bestand: Normen mit mindestens einer Fassung, die am oder nach dem Ausgangsrechtsstand gilt.
  const normScope = `EXISTS (SELECT 1 FROM law_versions bx WHERE bx.norm_id = n.id AND (bx.valid_to IS NULL OR bx.valid_to >= ${BASE}))`;
  const versionScope = `(v.valid_to IS NULL OR v.valid_to >= ${BASE})`;
  const excludedStatuses = "('repealed', 'historical', 'pending-effective')";
  const currentFlag = `(v.valid_from <= ${REF} AND (v.valid_to IS NULL OR v.valid_to >= ${REF}) AND n.status NOT IN ${excludedStatuses})`;
  // Geltende Fassung am Stichtag (jüngster Beginn ≤ Stichtag), sonst die früheste (künftige) Fassung – wie getApplicableVersion.
  const currentVersionId = `COALESCE(
    (SELECT cx.version_id FROM law_versions cx WHERE cx.norm_id = n.id AND cx.valid_from <= ${REF} ORDER BY cx.valid_from DESC LIMIT 1),
    (SELECT cx.version_id FROM law_versions cx WHERE cx.norm_id = n.id ORDER BY cx.valid_from LIMIT 1))`;
  const currentValidFrom = `max(${BASE}, COALESCE(
    (SELECT cx.valid_from FROM law_versions cx WHERE cx.norm_id = n.id AND cx.valid_from <= ${REF} ORDER BY cx.valid_from DESC LIMIT 1),
    (SELECT cx.valid_from FROM law_versions cx WHERE cx.norm_id = n.id ORDER BY cx.valid_from LIMIT 1)))`;
  // Jüngste Rechtsänderung bis zum Stichtag (Fassungsbeginne, Erlass/Änderung/Aufhebung), nie vor dem Ausgangsrechtsstand.
  const lastChangeDate = `CASE WHEN NOT EXISTS (SELECT 1 FROM law_versions lx WHERE lx.norm_id = n.id AND lx.valid_from <= ${REF}) THEN NULL ELSE max(${BASE},
    (SELECT max(lx.valid_from) FROM law_versions lx WHERE lx.norm_id = n.id AND lx.valid_from <= ${REF}),
    COALESCE((SELECT max(lh.change_date) FROM law_norm_history lh WHERE lh.norm_id = n.id AND lh.change_type IN ('initial', 'amendment', 'repeal') AND lh.change_date <= ${REF}), ${BASE})) END`;
  const versionCount = `(SELECT count(*) FROM law_versions vx WHERE vx.norm_id = n.id AND (vx.valid_to IS NULL OR vx.valid_to >= ${BASE}))`;
  // Klassifikation gegenüber dem Ausgangsrechtsstand (legal-core `classifySimulationChange`, hier in SQL): Ausgangsfassung =
  // Fassung, die am Ausgangsrechtsstand gilt; Simulationsfassung = Beginn danach; Aufhebung danach aus der Historie.
  const hasBaselineVersion = `EXISTS (SELECT 1 FROM law_versions bx WHERE bx.norm_id = n.id AND bx.valid_from <= ${BASE} AND (bx.valid_to IS NULL OR bx.valid_to >= ${BASE}))`;
  const simulationVersions = `(SELECT max(sx.valid_from) FROM law_versions sx WHERE sx.norm_id = n.id AND sx.valid_from > ${BASE})`;
  const repealAfter = `(SELECT max(rx.change_date) FROM law_norm_history rx WHERE rx.norm_id = n.id AND rx.change_type = 'repeal' AND rx.change_date > ${BASE})`;
  const simulationChangeKind = `CASE WHEN NOT ${hasBaselineVersion} THEN 'simulation-new' WHEN ${simulationVersions} IS NOT NULL OR ${repealAfter} IS NOT NULL THEN 'baseline-changed' ELSE 'baseline-unchanged' END`;
  const lastSimulationChangeDate = `CASE WHEN NOT ${hasBaselineVersion} THEN (SELECT max(nx.valid_from) FROM law_versions nx WHERE nx.norm_id = n.id) ELSE max(COALESCE(${simulationVersions}, ''), COALESCE(${repealAfter}, '')) END`;
  const lastSimulationChangeDateOrNull = `NULLIF(${lastSimulationChangeDate}, '')`;

  const summaryColumns = [
    '? AS jurisdiction',
    'n.slug',
    'n.title',
    'n.short_title',
    'n.abbr',
    'n.type',
    'n.status',
    `${currentVersionId} AS current_version_id`,
    `${currentValidFrom} AS current_valid_from`,
    `${versionCount} AS version_count`,
    `${lastChangeDate} AS last_change_date`,
    'n.subjects_json',
    `${simulationChangeKind} AS simulation_change_kind`,
    `${lastSimulationChangeDateOrNull} AS last_simulation_change_date`,
  ].join(', ');

  return {
    id: 'ostrecht',
    normId: (_jurisdiction, slug) => slug,
    normScope: { sql: normScope, params: [] },
    versionScope,
    publicationScope: { sql: '1 = 1', params: [] },
    summaryColumns,
    summaryParams: [jurisdiction],
    sortKey: 'n.sort_title',
    indexLetter: `CASE WHEN upper(substr(n.sort_title, 1, 1)) BETWEEN 'A' AND 'Z' THEN upper(substr(n.sort_title, 1, 1)) ELSE '#' END`,
    simulationChangeKind,
    lastSimulationChangeDate: lastSimulationChangeDateOrNull,
    validFrom: 'v.valid_from',
    validTo: 'v.valid_to',
    currentFlag,
    temporalKind: (kind) => {
      if (kind === 'future') return { sql: `v.valid_from > ${REF}`, params: [] };
      if (kind === 'current') return { sql: currentFlag, params: [] };
      if (kind === 'unknown-effective') return { sql: "n.status = 'pending-effective'", params: [] };
      return { sql: `(v.valid_from <= ${REF} AND n.status <> 'pending-effective' AND ((v.valid_to IS NOT NULL AND v.valid_to < ${REF}) OR n.status IN ('repealed', 'historical')))`, params: [] };
    },
    unitIndex: (alias) => `CAST(${alias}.provision_path AS INTEGER)`,
    documentQuery: (placeholders) => `SELECT d.norm_id, d.version_id, d.document_json AS search_document_json, v.valid_from, v.valid_to, n.status, ${lastChangeDate} AS last_change_date, ${simulationChangeKind} AS simulation_change_kind, ${lastSimulationChangeDateOrNull} AS last_simulation_change_date
      FROM law_search_documents d
      JOIN law_versions v ON v.norm_id = d.norm_id AND v.version_id = d.version_id
      JOIN law_norms n ON n.id = d.norm_id
      WHERE d.norm_id IN (${placeholders}) AND ${versionScope}`,
    adaptDocument: (row) => {
      const typed = row as OstRechtDocumentRow;
      return withSimulationChange(adaptOstRechtSearchDocument(JSON.parse(row.search_document_json) as OstRechtSearchIndexDocument, { status: typed.status, lastChangeDate: typed.last_change_date, asOf, baseline }), row);
    },
    derivedQuery: 'SELECT relations_json FROM law_norm_derived WHERE norm_id = ?',
    adaptRecord: ({ meta, history, versions, derived }) => {
      let record: NormRecord;
      try {
        record = adaptOstRechtRecord({ meta, history, versions });
      } catch (error) {
        // Keine Fassung gilt am Ausgangsrechtsstand: die Norm gehört nicht zum Landesrecht-Bestand.
        if (error instanceof ContentValidationError && /nicht übernehmbar/u.test(error.message)) return null;
        throw error;
      }
      return derived ? mergeDerivedRelations(record, derived.relations_json) : record;
    },
    currentVersionId: (record) => {
      const current = record.versions.filter((version) => version.simulationValidFrom <= asOf).sort((left, right) => right.simulationValidFrom.localeCompare(left.simulationValidFrom))[0];
      return (current ?? record.versions[0]!).versionId;
    },
    adaptSummary: (summary) => ({ ...summary, status: adaptOstRechtStatus(summary.status) as NormStatus }),
    statsQuery: `SELECT (SELECT count(*) FROM law_norms n WHERE ${normScope}) AS norm_count,
      (SELECT count(*) FROM law_versions v JOIN law_norms n ON n.id = v.norm_id WHERE ${normScope} AND ${versionScope}) AS version_count`,
    stats: (meta, counts) => ({
      normCount: Number(counts?.norm_count ?? meta.get(OSTRECHT_RUNTIME_META_KEYS.normCount) ?? 0),
      versionCount: Number(counts?.version_count ?? meta.get(OSTRECHT_RUNTIME_META_KEYS.searchDocumentCount) ?? 0),
      projectedAt: meta.get(OSTRECHT_RUNTIME_META_KEYS.lastSyncAt) ?? null,
      projectionFingerprint: meta.get(OSTRECHT_RUNTIME_META_KEYS.projectionFingerprint) ?? null,
    }),
    runtimeMetaKey: (key) => RUNTIME_META_KEY_MAP[key] ?? key,
    adaptPublication: (json, context) => adaptOstRechtPublication(json as OstRechtPublicationFile, context),
  };
}

export interface OstRechtStoreOptions extends OstRechtDialectOptions {
  /** Contract-Prüfung vor dem ersten Zugriff (Standard: ein); `false` nur für Tests des Dialekts selbst. */
  contract?: boolean | OstRechtContractOptions;
  /** Erneute Freshness-Prüfung nach dieser Zeit (Standard 5 Minuten). */
  freshnessRecheckAfterMs?: number;
}

/** Höchstzahl veralteter Normen, für die die Suche Titel und Metadaten direkt ergänzt; darüber nur Readiness `partial`. */
export const STALE_FALLBACK_LIMIT = 50;

/**
 * Such-Fallback für Normen, deren am Landesrecht-Stichtag geltende Fassung OstRecht noch nicht indexiert hat: kein
 * zweiter Volltextindex – nur Bezeichnung, Abkürzung, Aliasse, Schlagworte und Zusammenfassung des Suchdokuments dieser
 * Fassung werden im Speicher gegen die Anfrage geprüft (dieselbe Bewertung wie für alle Treffer). Ergänzt wird auf der
 * ersten Seite; der Normtext selbst bleibt bis zum nächsten OstRecht-Sync ohne Volltexttreffer.
 */
export async function searchStaleOstRechtNorms(db: ReadOnlyD1Database, freshness: OstRechtFreshnessReport, state: SearchState, options: OstRechtDialectOptions = {}): Promise<SearchHit[]> {
  if (freshness.staleNorms.length === 0 || freshness.truncated || freshness.staleNorms.length > STALE_FALLBACK_LIMIT) return [];
  if (state.q.trim() === '' || state.validOn || (state.versionScope !== 'current' && state.versionScope !== 'all')) return [];
  const plan = buildSearchQueryPlan(state);
  if (plan.references.length > 0) return [];
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const hits: SearchHit[] = [];
  const CHUNK = 40;
  for (let start = 0; start < freshness.staleNorms.length; start += CHUNK) {
    const chunk = freshness.staleNorms.slice(start, start + CHUNK);
    const rows = (await db.prepare(
      `SELECT d.norm_id, d.version_id, d.document_json AS search_document_json, n.status AS status
       FROM law_search_documents d JOIN law_norms n ON n.id = d.norm_id
       WHERE d.norm_id IN (${chunk.map(() => '?').join(', ')})`,
    ).bind(...chunk.map((entry) => entry.slug)).all<OstRechtDocumentRow>()).results;
    for (const entry of chunk) {
      const row = rows.find((candidate) => candidate.norm_id === entry.slug && candidate.version_id === entry.currentVersionId);
      if (!row) continue;
      const header = adaptOstRechtSearchDocument(JSON.parse(row.search_document_json) as OstRechtSearchIndexDocument, { status: row.status, asOf, ...(options.baseline ? { baseline: options.baseline } : {}) });
      const metadata = [header.summary ?? '', ...header.keywords, ...header.subjects, header.citation].filter(Boolean).join('\n');
      const document: SearchDocument = { ...header, units: [{ index: 0, type: 'metadata', anchor: '', label: '', heading: '', body: metadata }] };
      if (!documentMatchesFilters(document, state)) continue;
      const hit = evaluateDocument(document, plan);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}

/** Führt Fallback-Treffer in die erste Ergebnisseite ein (ohne Dubletten, in Rangfolge). */
export function mergeStaleHits(page: SearchResultPage, staleHits: readonly SearchHit[], state: SearchState): SearchResultPage {
  if (staleHits.length === 0 || state.offset > 0) return page;
  const known = new Set(page.hits.map((hit) => `${hit.slug}#${hit.versionId}`));
  const added = staleHits.filter((hit) => !known.has(`${hit.slug}#${hit.versionId}`));
  if (added.length === 0) return page;
  const hits = [...page.hits, ...added].sort((left, right) => compareHits(left, right, state.sort)).slice(0, state.limit);
  return { ...page, total: page.total + added.length, hits };
}

/**
 * Store der Jurisdiktion Ost über die OstRecht-D1. Nimmt ausschließlich eine Read-only-Hülle an; Migration, Batch,
 * Insert/Update/Delete oder Projektions-Apply sind über dieses Binding nicht erreichbar.
 */
export function createOstRechtD1Store(db: ReadOnlyD1Database, options: OstRechtStoreOptions = {}): NormStore {
  if (db.readOnly !== true) throw new Error('Der OstRecht-Store akzeptiert nur eine Read-only-D1 (createReadOnlyD1).');
  const inner = createD1NormStore(db, OSTRECHT_TARGET_JURISDICTION, ostrechtDialect(options));
  const contract = options.contract ?? true;
  const contractOptions = typeof contract === 'object' ? contract : {};
  const guarded = async <T>(action: () => Promise<T>): Promise<T> => {
    if (contract !== false) await assertOstRechtSchemaContract(db, contractOptions);
    return action();
  };
  const freshness = (): Promise<OstRechtFreshnessReport> => getOstRechtFreshness(db, { ...(options.asOf ? { asOf: options.asOf } : {}), ...(options.freshnessRecheckAfterMs !== undefined ? { recheckAfterMs: options.freshnessRecheckAfterMs } : {}) });
  const search = async (state: SearchState): Promise<SearchResultPage> => {
    const page = await inner.search(state);
    const report = await freshness();
    if (report.staleNorms.length === 0) return page;
    return mergeStaleHits(page, await searchStaleOstRechtNorms(db, report, state, options), state);
  };
  return {
    kind: inner.kind,
    jurisdiction: inner.jurisdiction,
    listNormSummaries: (query) => guarded(() => inner.listNormSummaries(query)),
    countNormsByType: () => guarded(() => inner.countNormsByType()),
    countNormFacets: (query) => guarded(() => inner.countNormFacets(query)),
    getNormSummary: (slug) => guarded(() => inner.getNormSummary(slug)),
    getNormSummaries: (slugs) => guarded(() => inner.getNormSummaries!(slugs)),
    getNorm: (slug, bodies) => guarded(() => inner.getNorm(slug, bodies)),
    search: (state) => guarded(() => search(state)),
    getSearchCoverage: () => guarded(async () => (await freshness()).coverage),
    getStats: () => guarded(() => inner.getStats()),
    getRuntimeMeta: (key) => guarded(() => inner.getRuntimeMeta(key)),
    listPublications: (query) => guarded(() => inner.listPublications(query)),
    getPublication: (slug) => guarded(() => inner.getPublication(slug)),
  };
}
