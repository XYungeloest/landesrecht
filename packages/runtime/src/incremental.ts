/**
 * Inkrementelle D1-Projektion (Muster aus OstRecht, verallgemeinert; nur Node – Skripte und Tests).
 *
 * Grundlage ist ein Projektionszustand je Jurisdiktion: Fingerabdrücke je Norm (Gesamtdatensatz, Metadaten
 * und Historie, Fassungen, Sucheinheiten) plus Stichtag, Schema- und Ausgangsrechtsstand. Der Vergleich mit
 * dem aktuellen Bestand erkennt neue Normen, neue oder geänderte Fassungen, geänderte Metadaten, entfernte
 * Normen und geänderte Suchblöcke. Nur betroffene Normen werden gelöscht und neu geschrieben.
 *
 * Eine vollständige Projektion ist nötig, wenn kein Vorzustand existiert oder Stichtag, Schema oder
 * Ausgangsrechtsstand abweichen. Ein inkrementeller Plan beginnt mit einer Basisprüfung in reinem SQL: passt
 * der gespeicherte `projection_fingerprint` nicht zum Vorzustand, bricht die Ausführung ab, bevor etwas
 * geschrieben wird. Danach wird die Identität entwertet, sodass ein abgebrochener Lauf nie als gültige Basis gilt.
 */
import { createHash } from 'node:crypto';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { buildSearchDocument } from '@landesrecht/search/index.ts';

import { buildProjectionPlan, corpusFingerprint, deleteNormQueries, normId, normQueries, PROJECTION_SCHEMA_VERSION, RUNTIME_META_KEYS, runtimeMetaQueries, type PlanGroup, type PlanQuery, type ProjectionPlan } from './projection.ts';

export const PROJECTION_STATE_SCHEMA = 'landesrecht-projection-state/1' as const;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface NormProjectionFingerprint {
  slug: string;
  record: string;
  meta: string;
  versions: string[];
  search: string;
}

export interface ProjectionState {
  schemaVersion: typeof PROJECTION_STATE_SCHEMA;
  jurisdiction: JurisdictionId;
  asOf: string;
  baselineDate: string;
  projectionSchemaVersion: string;
  corpusFingerprint: string;
  norms: Record<string, NormProjectionFingerprint>;
}

export interface ProjectionDiff {
  requiresFull: boolean;
  reasons: string[];
  added: string[];
  removed: string[];
  changedVersions: string[];
  changedMeta: string[];
  changedSearch: string[];
  changedOther: string[];
  unchanged: number;
}

export function normProjectionFingerprint(record: NormRecord, asOf: string): NormProjectionFingerprint {
  return {
    slug: record.meta.slug,
    record: sha256(`${asOf}|${JSON.stringify(record)}`),
    meta: sha256(JSON.stringify({ meta: record.meta, history: record.history })),
    versions: record.versions.map((version) => `${version.versionId}:${sha256(JSON.stringify(version))}`),
    search: sha256(JSON.stringify(record.versions.map((version) => buildSearchDocument(record, version, asOf).units))),
  };
}

export function projectionStateFor(records: readonly NormRecord[], options: { jurisdiction: JurisdictionId; asOf?: string }): ProjectionState {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const own = records.filter((record) => record.meta.jurisdiction === options.jurisdiction);
  const norms: Record<string, NormProjectionFingerprint> = {};
  for (const record of [...own].sort((left, right) => left.meta.slug.localeCompare(right.meta.slug))) norms[normId(options.jurisdiction, record.meta.slug)] = normProjectionFingerprint(record, asOf);
  return { schemaVersion: PROJECTION_STATE_SCHEMA, jurisdiction: options.jurisdiction, asOf, baselineDate: SIMULATION_BASELINE_DATE, projectionSchemaVersion: PROJECTION_SCHEMA_VERSION, corpusFingerprint: corpusFingerprint(own, asOf), norms };
}

export function diffProjection(previous: ProjectionState | undefined, current: ProjectionState): ProjectionDiff {
  const diff: ProjectionDiff = { requiresFull: false, reasons: [], added: [], removed: [], changedVersions: [], changedMeta: [], changedSearch: [], changedOther: [], unchanged: 0 };
  if (!previous) {
    diff.requiresFull = true;
    diff.reasons.push('kein Projektionszustand vorhanden');
  } else {
    if (previous.schemaVersion !== PROJECTION_STATE_SCHEMA) diff.reasons.push(`Zustandsschema ${previous.schemaVersion}`);
    if (previous.jurisdiction !== current.jurisdiction) diff.reasons.push(`Jurisdiktion ${previous.jurisdiction} ≠ ${current.jurisdiction}`);
    if (previous.asOf !== current.asOf) diff.reasons.push(`redaktioneller Stichtag ${previous.asOf} → ${current.asOf}`);
    if (previous.baselineDate !== current.baselineDate) diff.reasons.push(`Ausgangsrechtsstand ${previous.baselineDate} → ${current.baselineDate}`);
    if (previous.projectionSchemaVersion !== current.projectionSchemaVersion) diff.reasons.push(`Projektionsschema ${previous.projectionSchemaVersion} → ${current.projectionSchemaVersion}`);
    diff.requiresFull = diff.reasons.length > 0;
  }
  const before = previous?.norms ?? {};
  for (const [id, fingerprint] of Object.entries(current.norms)) {
    const old = before[id];
    if (!old) {
      diff.added.push(id);
      continue;
    }
    // Unverändert nur, wenn auch die Sucheinheiten gleich sind: Eine Änderung am Code der Sucheinheiten
    // (etwa neu suchbare Kennungen) lässt den Datensatz gleich und verändert trotzdem den Index.
    if (old.record === fingerprint.record && old.search === fingerprint.search) {
      diff.unchanged += 1;
      continue;
    }
    if (old.versions.map((entry) => entry.split(':')[0]).join(',') !== fingerprint.versions.map((entry) => entry.split(':')[0]).join(',')) diff.changedVersions.push(id);
    else if (old.meta !== fingerprint.meta) diff.changedMeta.push(id);
    else if (old.search !== fingerprint.search) diff.changedSearch.push(id);
    else diff.changedOther.push(id);
  }
  for (const id of Object.keys(before)) if (!current.norms[id]) diff.removed.push(id);
  for (const list of [diff.added, diff.removed, diff.changedVersions, diff.changedMeta, diff.changedSearch, diff.changedOther]) list.sort();
  return diff;
}

/** Basisprüfung in reinem SQL: ohne passenden Fingerabdruck wirft `json()` einen Fehler, bevor geschrieben wird. */
export function baseGuardQuery(expectedFingerprint: string): PlanQuery {
  return {
    sql: "SELECT CASE WHEN (SELECT value FROM law_runtime_meta WHERE key = ?) = ? THEN 1 ELSE json('Basis der inkrementellen Projektion passt nicht zum Datenbankstand') END",
    params: [RUNTIME_META_KEYS.projectionFingerprint, expectedFingerprint],
  };
}

export interface IncrementalProjection {
  plan: ProjectionPlan;
  diff: ProjectionDiff;
  state: ProjectionState;
  mode: 'full' | 'incremental' | 'noop';
}

export function buildIncrementalProjectionPlan(records: readonly NormRecord[], previous: ProjectionState | undefined, options: { jurisdiction: JurisdictionId; asOf?: string; now?: string; allowFullFallback?: boolean }): IncrementalProjection {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const now = options.now ?? new Date().toISOString();
  const state = projectionStateFor(records, { jurisdiction: options.jurisdiction, asOf });
  const diff = diffProjection(previous, state);
  if (diff.requiresFull) {
    if (options.allowFullFallback === false) throw new Error(`Inkrementelle Projektion nicht möglich: ${diff.reasons.join('; ')}`);
    return { plan: buildProjectionPlan(records, { jurisdiction: options.jurisdiction, full: true, asOf, now }), diff, state, mode: 'full' };
  }
  const byId = new Map(records.filter((record) => record.meta.jurisdiction === options.jurisdiction).map((record) => [normId(options.jurisdiction, record.meta.slug), record]));
  const touched = [...diff.added, ...diff.changedVersions, ...diff.changedMeta, ...diff.changedSearch, ...diff.changedOther].sort();
  const groups: PlanGroup[] = [
    { key: '(basis prüfen)', queries: [baseGuardQuery(previous!.corpusFingerprint)] },
    { key: '(identität entwerten)', queries: [{ sql: 'DELETE FROM law_runtime_meta WHERE key = ?', params: [RUNTIME_META_KEYS.projectionFingerprint] }, ...runtimeMetaQueries({ [RUNTIME_META_KEYS.projectionState]: `incremental-in-progress:${now}` })] },
  ];
  const stats = { norms: 0, versions: 0, blocks: 0, blockParts: 0, searchUnits: 0, statements: 0 };
  for (const id of touched) {
    const record = byId.get(id)!;
    const result = normQueries(record, { asOf, now, indexHistoricalVersions: true, full: false });
    stats.norms += 1;
    stats.versions += result.versions;
    stats.blocks += result.blocks;
    stats.blockParts += result.blockParts;
    stats.searchUnits += result.searchUnits;
    groups.push({ key: record.meta.slug, queries: result.queries });
  }
  for (const id of diff.removed) groups.push({ key: `(entfernt) ${id}`, queries: deleteNormQueries(id) });
  const all = [...byId.values()];
  groups.push({
    key: '(meta)',
    queries: runtimeMetaQueries({
      [RUNTIME_META_KEYS.lastProjectedAt]: now,
      [RUNTIME_META_KEYS.projectionFingerprint]: state.corpusFingerprint,
      [RUNTIME_META_KEYS.projectionState]: 'complete',
      [RUNTIME_META_KEYS.jurisdiction]: options.jurisdiction,
      [RUNTIME_META_KEYS.baselineDate]: SIMULATION_BASELINE_DATE,
      [RUNTIME_META_KEYS.referenceDate]: asOf,
      [RUNTIME_META_KEYS.normCount]: String(all.length),
      [RUNTIME_META_KEYS.versionCount]: String(all.reduce((sum, record) => sum + record.versions.length, 0)),
      [RUNTIME_META_KEYS.schemaVersion]: PROJECTION_SCHEMA_VERSION,
    }),
  });
  stats.statements = groups.reduce((sum, group) => sum + group.queries.length, 0);
  const mode = touched.length === 0 && diff.removed.length === 0 ? 'noop' : 'incremental';
  return { plan: { jurisdiction: options.jurisdiction, full: false, groups, stats }, diff, state, mode };
}
