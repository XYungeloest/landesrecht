/**
 * Skalierung der D1-Projektion (nur lokal: node:sqlite im Speicher statt Cloudflare D1, kein Netz).
 *
 * Synthetischer Bestand aus packages/runtime/src/scale-corpus.ts: mehrere Tausend Normen werden vollständig
 * projiziert und gezählt; die inkrementelle Projektion wird gegen eine frische Vollprojektion geprüft
 * (inhaltlicher Fingerabdruck), die Basisprüfung gegen abweichende Laufzeitmetadaten, die Entwertung der
 * Projektionsidentität bei abgebrochenen Läufen und die Aufteilung in SQL-Dateien für Remote-D1.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { parseNormMeta, type NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { baseGuardQuery, buildIncrementalProjectionPlan, normProjectionFingerprint, PROJECTION_STATE_SCHEMA, projectionStateFor, type IncrementalProjection, type ProjectionState } from '@landesrecht/runtime/incremental.ts';
import { buildProjectionPlan, corpusFingerprint, deleteNormQueries, normId, PROJECTION_SCHEMA_VERSION, renderPlanSql, renderStatement, RUNTIME_META_KEYS, type PlanQuery, type ProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { buildScaleCorpus, buildScaleNorm, mutateScaleCorpus, scaleSlug, SNAPSHOT_TABLES, snapshotDatabase } from '@landesrecht/runtime/scale-corpus.ts';
import { D1_MAX_STATEMENT_BYTES, DEFAULT_SQL_FILE_BYTES, DEFAULT_SQL_FILE_STATEMENTS, splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1, type SqliteD1Database } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState, SEARCH_MATCH_MODES, type SearchMatchMode } from '@landesrecht/search/query.ts';

const root = resolveRepositoryRoot();
const migrationsDir = join(root, 'data', 'd1');
/** Tausende Normen, aber klein genug für eine Laufzeit deutlich unter 90 s. */
const SCALE_NORMS = 2_000;
const SMALL_NORMS = 120;
const NOW = '2026-09-15T00:00:00.000Z';
const LATER = '2026-09-16T00:00:00.000Z';
const HEAVY = 120_000;
const JURISDICTION = 'west' as const;
const DATABASE = 'landesrecht-west';

type Snapshot = ReturnType<typeof snapshotDatabase>;
type SqlSplit = ReturnType<typeof splitPlanIntoSqlFiles>;

const openDatabases: SqliteD1Database[] = [];

async function openDatabase(): Promise<SqliteD1Database> {
  const db = await openSqliteD1(':memory:', { migrationsDir });
  openDatabases.push(db);
  return db;
}

function fullPlan(records: readonly NormRecord[], now = NOW): ProjectionPlan {
  return buildProjectionPlan(records, { jurisdiction: JURISDICTION, full: true, now });
}

function timed<T>(action: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = action();
  return { value, ms: Math.round(performance.now() - started) };
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;

function countRows(db: SqliteD1Database, table: string, where = '', params: string[] = []): number {
  return Number((db.native.prepare(`SELECT COUNT(*) AS c FROM ${table}${where ? ` WHERE ${where}` : ''}`).get(...params) as { c: number }).c);
}

function runtimeMeta(db: SqliteD1Database): Record<string, string> {
  return Object.fromEntries((db.native.prepare('SELECT key, value FROM law_runtime_meta ORDER BY key').all() as Array<{ key: string; value: string }>).map((row) => [row.key, row.value]));
}

/** Rohabzug aller Zeilen einschließlich Zeilen-IDs, Zeitstempeln und FTS-Dokumentgrößen (für „unverändert“). */
function rawDigest(db: SqliteD1Database): string {
  const hash = createHash('sha256');
  for (const table of [...SNAPSHOT_TABLES, 'law_search_docsize']) {
    for (const row of db.native.prepare(`SELECT rowid AS _rowid, * FROM ${table} ORDER BY rowid`).all()) hash.update(`${table}:${JSON.stringify(row)}\n`);
  }
  return hash.digest('hex');
}

/** Tabellen mit Normbezug (ohne FTS-Schattentabellen): alle müssen beim Löschen einer Norm geleert werden. */
function normTables(db: SqliteD1Database): string[] {
  const tables = (db.native.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'law\\_%' ESCAPE '\\'").all() as Array<{ name: string; sql: string }>)
    .filter((table) => !table.sql.startsWith('CREATE VIRTUAL TABLE') && (!table.name.startsWith('law_search_') || table.name === 'law_search_units'));
  return tables
    .filter((table) => table.name === 'law_norms' || (db.native.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>).some((column) => column.name === 'norm_id'))
    .map((table) => table.name)
    .sort();
}

/**
 * Erwartete Zeilen nach den Regeln des Generators: Typen wechseln je Index (Gesetz, Verordnung, Verwaltungsvorschrift,
 * Runderlass), jede zehnte Norm hat eine Folgefassung. Gesetz/Verordnung: 12 §§ → 12 Blöcke, 12 Einheiten + Metadaten;
 * Verwaltungsvorschrift/Runderlass: 4 Abschnitte mit je 3 Unterabschnitten → 4 Blöcke, 16 Einheiten + Metadaten.
 */
function expectedScaleRows(norms: number): { versions: number; blocks: number; searchUnits: number } {
  let versions = 0;
  let blocks = 0;
  let searchUnits = 0;
  for (let index = 1; index <= norms; index += 1) {
    const administrative = index % 4 === 2 || index % 4 === 3;
    const versionCount = index % 10 === 0 ? 2 : 1;
    versions += versionCount;
    blocks += versionCount * (administrative ? 4 : 12);
    searchUnits += versionCount * (administrative ? 17 : 13);
  }
  return { versions, blocks, searchUnits };
}

function expectedStatementsPerGroup(plan: ProjectionPlan, resumable: boolean): Array<{ key: string; statements: string[] }> {
  return plan.groups.map((group) => {
    const norm = !group.key.startsWith('(');
    const prefix: PlanQuery[] = resumable && plan.full && norm ? deleteNormQueries(normId(plan.jurisdiction, group.key)) : [];
    return { key: group.key, statements: [...prefix, ...group.queries].map(renderStatement) };
  });
}

/** Prüft Dateigrenzen, Vollständigkeit und Reihenfolge der SQL-Dateien; liefert die Anweisungen je Datei. */
function verifySqlFiles(plan: ProjectionPlan, split: SqlSplit, limits: { maxStatements: number; maxBytes: number; resumable: boolean }): string[][] {
  const groups = expectedStatementsPerGroup(plan, limits.resumable);
  const perFile: string[][] = [];
  let cursor = 0;
  expect(split.files.map((file) => file.name)).toEqual(split.plan.files.map((meta) => meta.name));
  split.files.forEach((file, position) => {
    const meta = split.plan.files[position]!;
    expect(meta.index).toBe(position + 1);
    expect(file.name).toBe(`${String(position + 1).padStart(4, '0')}.sql`);
    const own = groups.slice(cursor, cursor + meta.groups);
    cursor += meta.groups;
    expect(own).toHaveLength(meta.groups);
    expect([meta.firstGroup, meta.lastGroup]).toEqual([own[0]!.key, own.at(-1)!.key]);
    const statements = own.flatMap((group) => group.statements);
    const header = `-- landesrecht D1 ${DATABASE} ${plan.full ? 'full' : 'incremental'} Datei ${position + 1}: ${meta.firstGroup} … ${meta.lastGroup}`;
    const body = `${statements.join('\n')}\n`;
    expect(file.sql === `${header}\n${body}`, `${file.name}: Inhalt weicht von den Plananweisungen ab`).toBe(true);
    expect(meta.statements).toBe(statements.length);
    expect(meta.bytes).toBe(Buffer.byteLength(file.sql));
    expect(meta.sha256).toBe(sha256(file.sql));
    // D1 akzeptiert keine eigenen Transaktionen in Dateien: nur Schreib- und Prüfanweisungen.
    expect(statements.filter((statement) => !/^(?:INSERT|DELETE|SELECT|DROP TRIGGER|CREATE TRIGGER)\b/u.test(statement)), file.name).toEqual([]);
    const bodyBytes = Buffer.byteLength(body);
    if (meta.groups > 1) {
      expect(meta.statements, file.name).toBeLessThanOrEqual(limits.maxStatements);
      expect(bodyBytes, file.name).toBeLessThanOrEqual(limits.maxBytes);
    } else if (meta.statements > limits.maxStatements || bodyBytes > limits.maxBytes) {
      expect(split.plan.warnings.some((warning) => warning.startsWith(`${meta.firstGroup}:`)), file.name).toBe(true);
    }
    perFile.push(statements);
  });
  expect(cursor).toBe(groups.length);
  return perFile;
}

interface ScaleState {
  records: NormRecord[];
  plan: ProjectionPlan;
  db: SqliteD1Database;
  executed: number;
  snapshot: Snapshot;
}

let scale: ScaleState;

beforeAll(async () => {
  const corpus = timed(() => buildScaleCorpus(SCALE_NORMS));
  const planned = timed(() => fullPlan(corpus.value));
  const sqlBytes = Buffer.byteLength(renderPlanSql(planned.value));
  const db = await openDatabase();
  const executed = timed(() => executePlan(db, planned.value));
  const snapshot = timed(() => snapshotDatabase(db));
  scale = { records: corpus.value, plan: planned.value, db, executed: executed.value, snapshot: snapshot.value };
  console.info(`[Skalierung] ${SCALE_NORMS} Normen: Bestand ${corpus.ms} ms, Plan ${planned.ms} ms (${planned.value.stats.statements} Anweisungen, SQL ${megabytes(sqlBytes)}), Ausführung ${executed.ms} ms, Fingerabdruck ${snapshot.ms} ms`);
}, HEAVY);

afterAll(() => {
  for (const db of openDatabases) db.close();
});

describe('Skalierung: Vollprojektion von 2 000 synthetischen Normen', () => {
  it('erzeugt einen deterministischen, rein synthetischen West-Bestand mit eindeutigen Slugs', () => {
    expect(scaleSlug(7)).toBe('skalierung-00007-west');
    expect(scale.records).toHaveLength(SCALE_NORMS);
    expect(new Set(scale.records.map((record) => record.meta.slug)).size).toBe(SCALE_NORMS);
    expect(scale.records.every((record) => record.meta.jurisdiction === JURISDICTION && record.meta.dataset === undefined && !record.meta.slug.startsWith('testfixture-'))).toBe(true);
    expect(JSON.stringify(buildScaleNorm(17))).toBe(JSON.stringify(scale.records[16]));
    expect(scale.records.filter((record) => record.versions.length === 2)).toHaveLength(SCALE_NORMS / 10);
  });

  it('zählt Normen, Fassungen, Blöcke und Sucheinheiten wie nach den Generatorregeln erwartet', () => {
    const expected = expectedScaleRows(SCALE_NORMS);
    expect(expected).toEqual({ versions: 2_200, blocks: 17_600, searchUnits: 33_000 });
    expect(countRows(scale.db, 'law_norms')).toBe(SCALE_NORMS);
    expect(countRows(scale.db, 'law_versions')).toBe(expected.versions);
    expect(countRows(scale.db, 'law_version_blocks')).toBe(expected.blocks);
    expect(countRows(scale.db, 'law_search_units')).toBe(expected.searchUnits);
    expect(countRows(scale.db, 'law_norm_history')).toBe(expected.versions);
    expect(countRows(scale.db, 'law_external_identifiers')).toBe(SCALE_NORMS);
    expect(countRows(scale.db, 'law_source_objects')).toBe(0);
    expect(scale.plan.stats).toEqual({ norms: SCALE_NORMS, versions: expected.versions, blocks: expected.blocks, blockParts: expected.blocks, searchUnits: expected.searchUnits, statements: scale.executed });
    expect(scale.plan.groups.map((group) => group.key).filter((key) => key.startsWith('('))).toEqual(['(reset)', '(meta)']);
  });

  it('Suchzeilen: der FTS5-Index enthält jede Sucheinheit genau einmal und ist konsistent', () => {
    expect(() => checkSearchIndexIntegrity(scale.db)).not.toThrow();
    expect(countRows(scale.db, 'law_search_docsize')).toBe(countRows(scale.db, 'law_search_units'));
    // Das Sachgebiet steht nur in der Metadaten-Einheit: genau eine Trefferzeile je Fassung.
    expect(countRows(scale.db, 'law_search', 'law_search MATCH ?', ['skalierungstest'])).toBe(expectedScaleRows(SCALE_NORMS).versions);
    expect(scale.db.native.prepare('SELECT norm_id, version_id, unit_index, COUNT(*) AS c FROM law_search_units GROUP BY norm_id, version_id, unit_index HAVING c > 1').all()).toEqual([]);
    expect(scale.db.native.prepare("SELECT norm_id, version_id, anchor, COUNT(*) AS c FROM law_search_units WHERE anchor <> '' GROUP BY norm_id, version_id, anchor HAVING c > 1").all()).toEqual([]);
    expect(countRows(scale.db, 'law_search_units', 'norm_id = ?', [normId(JURISDICTION, scaleSlug(10))])).toBe(2 * 17);
  });

  it('schreibt Projektionsidentität und Kennzahlen', async () => {
    const meta = runtimeMeta(scale.db);
    const state = projectionStateFor(scale.records, { jurisdiction: JURISDICTION });
    expect(meta).toMatchObject({
      [RUNTIME_META_KEYS.projectionFingerprint]: state.corpusFingerprint,
      [RUNTIME_META_KEYS.projectionState]: 'complete',
      [RUNTIME_META_KEYS.normCount]: String(SCALE_NORMS),
      [RUNTIME_META_KEYS.versionCount]: '2200',
      [RUNTIME_META_KEYS.baselineDate]: SIMULATION_BASELINE_DATE,
      [RUNTIME_META_KEYS.referenceDate]: EDITORIAL_REFERENCE_DATE,
      [RUNTIME_META_KEYS.schemaVersion]: PROJECTION_SCHEMA_VERSION,
      [RUNTIME_META_KEYS.lastProjectedAt]: NOW,
    });
    expect(state.corpusFingerprint).toBe(corpusFingerprint(scale.records, EDITORIAL_REFERENCE_DATE));
    const stats = await createD1NormStore(scale.db, JURISDICTION).getStats();
    expect(stats).toEqual({ normCount: SCALE_NORMS, versionCount: 2_200, projectedAt: NOW, projectionFingerprint: state.corpusFingerprint });
  });

  it('findet im großen Bestand Abkürzung und §-Adresse', async () => {
    const store = createD1NormStore(scale.db, JURISDICTION);
    const identity = await store.search(createSearchState({ q: 'SkT400', jurisdictions: [JURISDICTION] }));
    expect(identity.hits[0]).toMatchObject({ slug: scaleSlug(400), matchKind: 'identity', versionId: '2025-07-01' });
    const paragraph = await store.search(createSearchState({ q: '§ 3 SkT400', jurisdictions: [JURISDICTION] }));
    expect(paragraph.hits.map((hit) => [hit.slug, hit.matchKind, hit.unit?.anchor])).toEqual([[scaleSlug(400), 'reference', 'paragraph-3']]);
  });

  it('beide Match-Modi finden Abkürzung, exakten Titel und §-Adresse; and-first ist bei mehrwortigen Titeln nicht langsamer', async () => {
    const store = createD1NormStore(scale.db, JURISDICTION);
    const record = scale.records.find((entry) => entry.meta.slug === scaleSlug(400))!;
    const timings: Partial<Record<SearchMatchMode, number>> = {};
    for (const matchMode of SEARCH_MATCH_MODES) {
      const identity = await store.search(createSearchState({ q: 'SkT400', jurisdictions: [JURISDICTION], matchMode }));
      expect(identity.hits[0], matchMode).toMatchObject({ slug: scaleSlug(400), matchKind: 'identity', versionId: '2025-07-01' });
      const paragraph = await store.search(createSearchState({ q: '§ 3 SkT400', jurisdictions: [JURISDICTION], matchMode }));
      expect(paragraph.hits.map((hit) => [hit.slug, hit.matchKind, hit.unit?.anchor]), matchMode).toEqual([[scaleSlug(400), 'reference', 'paragraph-3']]);
      // Alle Titel teilen „Skalierungsprüfung … über … und …“: der OR-Plan liest fast den ganzen Index.
      const started = performance.now();
      const title = await store.search(createSearchState({ q: record.meta.title, jurisdictions: [JURISDICTION], matchMode }));
      timings[matchMode] = performance.now() - started;
      expect(title.hits[0], matchMode).toMatchObject({ slug: scaleSlug(400), matchKind: 'identity' });
    }
    console.info(`[Skalierung] Titelsuche „${record.meta.title}“: or-prefix ${Math.round(timings['or-prefix']!)} ms, and-first ${Math.round(timings['and-first']!)} ms`);
    expect(timings['and-first']!).toBeLessThanOrEqual(timings['or-prefix']! * 1.5 + 20);
  });
});

interface MutatedCorpus {
  records: NormRecord[];
  added: string[];
  removed: string[];
  changedVersions: string[];
  changedMeta: string[];
  changedSearch: string[];
  changedOther: string[];
  renamedFrom: string;
  renamedTo: string;
}

function withMeta(record: NormRecord, overrides: Record<string, unknown>): NormRecord {
  return { ...record, meta: parseNormMeta({ ...record.meta, ...overrides }, `${String(overrides.slug ?? record.meta.slug)}/meta.json`) };
}

/** Änderungsmix: Textänderungen, neue Fassungen, Neuaufnahmen, Entfernungen, Metadaten, sonstige Felder, Slug-Wechsel. */
function mutateForEquivalence(base: readonly NormRecord[]): MutatedCorpus {
  const mutation = mutateScaleCorpus(base, { changed: 40, added: 12, removed: 6 });
  const touched = new Set([...mutation.changedText, ...mutation.newVersions, ...mutation.added]);
  const untouched = mutation.records.filter((record) => !touched.has(record.meta.slug));
  const metaOnly = untouched.slice(0, 3).map((record) => record.meta.slug);
  const otherOnly = untouched.slice(3, 5).map((record) => record.meta.slug);
  const renamed = untouched.slice(5).find((record) => record.meta.abbr !== undefined)!;
  const renamedFrom = renamed.meta.slug;
  const renamedTo = renamedFrom.replace(/-west$/u, '-neu-west');
  const records = mutation.records.map((record) => {
    const slug = record.meta.slug;
    if (slug === metaOnly[0]) return withMeta(record, { responsibleBody: 'Landesamt für Skalierung' });
    if (metaOnly.includes(slug)) return withMeta(record, { keywords: ['Nachtrag'] });
    if (otherOnly.includes(slug)) return { ...record, versions: record.versions.map((version) => ({ ...version, changeNote: `${version.changeNote} (berichtigt)` })) };
    if (slug === renamedFrom) return withMeta(record, { id: normId(JURISDICTION, renamedTo), slug: renamedTo });
    return record;
  });
  const ids = (slugs: readonly string[]): string[] => slugs.map((slug) => normId(JURISDICTION, slug)).sort();
  return {
    records,
    added: ids([...mutation.added, renamedTo]),
    removed: ids([...mutation.removed, renamedFrom]),
    changedVersions: ids(mutation.newVersions),
    changedMeta: ids(metaOnly),
    changedSearch: ids(mutation.changedText),
    changedOther: ids(otherOnly),
    renamedFrom,
    renamedTo,
  };
}

describe('Skalierung: inkrementelle Projektion ist äquivalent zur Vollprojektion', () => {
  let mutated: MutatedCorpus;
  let previous: ProjectionState;
  let incremental: IncrementalProjection;
  let incrementalDb: SqliteD1Database;
  let freshDb: SqliteD1Database;

  beforeAll(async () => {
    mutated = mutateForEquivalence(scale.records);
    previous = projectionStateFor(scale.records, { jurisdiction: JURISDICTION });
    incrementalDb = await openDatabase();
    executePlan(incrementalDb, scale.plan);
    const planned = timed(() => buildIncrementalProjectionPlan(mutated.records, previous, { jurisdiction: JURISDICTION, now: LATER }));
    incremental = planned.value;
    const executed = timed(() => executePlan(incrementalDb, incremental.plan));
    freshDb = await openDatabase();
    const fresh = timed(() => executePlan(freshDb, fullPlan(mutated.records, LATER)));
    const share = (incremental.plan.stats.statements / scale.plan.stats.statements) * 100;
    console.info(`[Skalierung] inkrementell: ${incremental.plan.stats.norms} Normen, ${incremental.plan.stats.statements} Anweisungen (${share.toFixed(2)} % der Vollprojektion), Plan ${planned.ms} ms, Ausführung ${executed.ms} ms; frische Vollprojektion ${fresh.ms} ms`);
  }, HEAVY);

  it('erkennt neue Normen, neue Fassungen, Metadaten-, Suchblock- und sonstige Änderungen sowie Entfernungen', () => {
    expect(mutated.changedVersions).toHaveLength(20);
    expect(mutated.changedSearch).toHaveLength(20);
    expect(incremental.mode).toBe('incremental');
    expect(incremental.diff).toEqual({
      requiresFull: false,
      reasons: [],
      added: mutated.added,
      removed: mutated.removed,
      changedVersions: mutated.changedVersions,
      changedMeta: mutated.changedMeta,
      changedSearch: mutated.changedSearch,
      changedOther: mutated.changedOther,
      unchanged: SCALE_NORMS - 6 - 20 - 20 - 3 - 2 - 1,
    });
    expect(incremental.state.corpusFingerprint).toBe(corpusFingerprint(mutated.records, EDITORIAL_REFERENCE_DATE));
  });

  it('plant nur betroffene Normen: Basisprüfung zuerst, dann Identität entwerten, je Norm löschen und neu schreiben', () => {
    const { groups, stats } = incremental.plan;
    expect(incremental.plan.full).toBe(false);
    expect(groups[0]).toEqual({ key: '(basis prüfen)', queries: [baseGuardQuery(previous.corpusFingerprint)] });
    expect(groups[1]!.key).toBe('(identität entwerten)');
    expect(groups[1]!.queries[0]).toEqual({ sql: 'DELETE FROM law_runtime_meta WHERE key = ?', params: [RUNTIME_META_KEYS.projectionFingerprint] });
    expect(groups.at(-1)!.key).toBe('(meta)');
    const normGroups = groups.filter((group) => !group.key.startsWith('('));
    const touched = [...mutated.added, ...mutated.changedVersions, ...mutated.changedMeta, ...mutated.changedSearch, ...mutated.changedOther];
    expect(normGroups.map((group) => normId(JURISDICTION, group.key)).sort()).toEqual(touched.sort());
    expect(stats.norms).toBe(touched.length);
    for (const group of normGroups) expect(group.queries.slice(0, 9), group.key).toEqual(deleteNormQueries(normId(JURISDICTION, group.key)));
    expect(groups.filter((group) => group.key.startsWith('(entfernt) ')).map((group) => group.key.slice('(entfernt) '.length))).toEqual(mutated.removed);
    expect(stats.statements / scale.plan.stats.statements).toBeLessThan(0.1);
  });

  it('der Datenbankinhalt nach inkrementeller Projektion gleicht einer frischen Vollprojektion des geänderten Bestands', { timeout: HEAVY }, () => {
    expect(() => checkSearchIndexIntegrity(incrementalDb)).not.toThrow();
    const after = snapshotDatabase(incrementalDb);
    expect(after).toEqual(snapshotDatabase(freshDb));
    expect(after).not.toEqual(scale.snapshot);
    expect(after.law_norms!.rows).toBe(SCALE_NORMS - 6 + 12);
    expect(runtimeMeta(incrementalDb)).toEqual(runtimeMeta(freshDb));
  });

  it('Identitätswechsel: die Norm mit geändertem Slug wird unter altem Schlüssel gelöscht und unter neuem eingefügt', async () => {
    const oldId = normId(JURISDICTION, mutated.renamedFrom);
    const newId = normId(JURISDICTION, mutated.renamedTo);
    for (const table of normTables(incrementalDb)) {
      const column = table === 'law_norms' ? 'id' : 'norm_id';
      expect(countRows(incrementalDb, table, `${column} = ?`, [oldId]), `${table} alt`).toBe(0);
      expect(countRows(incrementalDb, table, `${column} = ?`, [newId]), `${table} neu`).toBe(countRows(freshDb, table, `${column} = ?`, [newId]));
    }
    expect(countRows(incrementalDb, 'law_search', 'law_search MATCH ? AND norm_id = ?', ['skalierungstest', oldId])).toBe(0);
    const renamed = mutated.records.find((record) => record.meta.slug === mutated.renamedTo)!;
    const page = await createD1NormStore(incrementalDb, JURISDICTION).search(createSearchState({ q: renamed.meta.abbr!, jurisdictions: [JURISDICTION] }));
    expect(page.hits[0]).toMatchObject({ slug: mutated.renamedTo, matchKind: 'identity' });
    expect(page.hits.filter((hit) => hit.slug === mutated.renamedFrom)).toEqual([]);
  });

  it('unveränderter Bestand ergibt den Modus noop ohne Normanweisungen und lässt den Inhalt unverändert', () => {
    const noop = buildIncrementalProjectionPlan(mutated.records, incremental.state, { jurisdiction: JURISDICTION, now: LATER });
    expect(noop.mode).toBe('noop');
    expect(noop.diff).toMatchObject({ requiresFull: false, added: [], removed: [], changedVersions: [], changedMeta: [], changedSearch: [], changedOther: [], unchanged: mutated.records.length });
    expect(noop.plan.stats).toMatchObject({ norms: 0, versions: 0, blocks: 0, blockParts: 0, searchUnits: 0 });
    // Keine Norm- oder Entfernungsgruppe; übrig bleiben nur Basisprüfung, Entwertung und Kennzahlen.
    expect(noop.plan.groups.map((group) => group.key)).toEqual(['(basis prüfen)', '(identität entwerten)', '(meta)']);
    const normStatements = noop.plan.groups.flatMap((group) => group.queries).filter((query) => !/law_runtime_meta/u.test(query.sql));
    expect(normStatements).toEqual([]);
    expect(buildIncrementalProjectionPlan(scale.records, previous, { jurisdiction: JURISDICTION, now: NOW }).mode).toBe('noop');
    const before = snapshotDatabase(incrementalDb);
    executePlan(incrementalDb, noop.plan);
    expect(snapshotDatabase(incrementalDb)).toEqual(before);
    expect(runtimeMeta(incrementalDb)[RUNTIME_META_KEYS.projectionState]).toBe('complete');
  });

  it('Basisprüfung: ein veralteter Vorzustand wird abgewiesen und die Datenbank bleibt vollständig unverändert', () => {
    const before = rawDigest(incrementalDb);
    const meta = runtimeMeta(incrementalDb);
    expect(() => executePlan(incrementalDb, incremental.plan)).toThrow(/malformed JSON/u);
    expect(rawDigest(incrementalDb)).toBe(before);
    expect(runtimeMeta(incrementalDb)).toEqual(meta);
  });
});

describe('Skalierung: Basisprüfung, Rückfall auf die Vollprojektion und Identitätsentwertung', () => {
  const small = buildScaleCorpus(SMALL_NORMS);
  const smallState = projectionStateFor(small, { jurisdiction: JURISDICTION });
  const smallMutation = mutateScaleCorpus(small, { changed: 6, added: 3, removed: 2 });

  it('Fingerabdrücke je Norm trennen Gesamtdatensatz, Metadaten, Fassungen und Suchblöcke', () => {
    const fingerprint = normProjectionFingerprint(buildScaleNorm(4), EDITORIAL_REFERENCE_DATE);
    expect(fingerprint).toEqual(normProjectionFingerprint(buildScaleNorm(4), EDITORIAL_REFERENCE_DATE));
    expect(fingerprint.slug).toBe(scaleSlug(4));
    expect(fingerprint.versions).toEqual([expect.stringMatching(/^2023-12-01:[0-9a-f]{64}$/u)]);
    const otherDate = normProjectionFingerprint(buildScaleNorm(4), '2027-01-01');
    expect(otherDate.record).not.toBe(fingerprint.record);
    expect([otherDate.meta, otherDate.search]).toEqual([fingerprint.meta, fingerprint.search]);
    const revised = normProjectionFingerprint(buildScaleNorm(4, { revision: 3 }), EDITORIAL_REFERENCE_DATE);
    expect(revised.meta).toBe(fingerprint.meta);
    expect(revised.search).not.toBe(fingerprint.search);
    expect(revised.versions.map((entry) => entry.split(':')[0])).toEqual(['2023-12-01']);
    const amended = normProjectionFingerprint(buildScaleNorm(4, { laterVersionFrom: '2026-01-01' }), EDITORIAL_REFERENCE_DATE);
    expect(amended.versions.map((entry) => entry.split(':')[0])).toEqual(['2023-12-01', '2026-01-01']);
    expect(amended.meta).not.toBe(fingerprint.meta);
  });

  it('der Projektionszustand umfasst nur die eigene Jurisdiktion', () => {
    const foreignSource = buildScaleNorm(SMALL_NORMS + 1);
    const foreign: NormRecord = { ...foreignSource, meta: { ...foreignSource.meta, jurisdiction: 'nsh', id: `nsh:${foreignSource.meta.slug}` } };
    const state = projectionStateFor([...small, foreign], { jurisdiction: JURISDICTION });
    expect(state).toMatchObject({ schemaVersion: PROJECTION_STATE_SCHEMA, jurisdiction: JURISDICTION, asOf: EDITORIAL_REFERENCE_DATE, baselineDate: SIMULATION_BASELINE_DATE, projectionSchemaVersion: PROJECTION_SCHEMA_VERSION });
    expect(Object.keys(state.norms)).toEqual(small.map((record) => normId(JURISDICTION, record.meta.slug)).sort());
    expect(state.corpusFingerprint).toBe(smallState.corpusFingerprint);
    expect(state.corpusFingerprint).toBe(corpusFingerprint(small, EDITORIAL_REFERENCE_DATE));
  });

  it('fällt ohne Vorzustand oder bei geändertem Stichtag, Schema, Ausgangsrechtsstand oder Jurisdiktion auf die Vollprojektion zurück', () => {
    const none = buildIncrementalProjectionPlan(small, undefined, { jurisdiction: JURISDICTION, now: NOW });
    expect(none.mode).toBe('full');
    expect(none.diff.reasons).toEqual(['kein Projektionszustand vorhanden']);
    expect(none.diff.added).toHaveLength(SMALL_NORMS);
    expect(JSON.stringify(none.plan)).toBe(JSON.stringify(fullPlan(small)));
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ asOf: '2026-01-01' }, new RegExp(`^redaktioneller Stichtag 2026-01-01 → ${EDITORIAL_REFERENCE_DATE}$`, 'u')],
      [{ projectionSchemaVersion: '0' }, /^Projektionsschema 0 → 1$/u],
      [{ baselineDate: '2020-01-01' }, /^Ausgangsrechtsstand 2020-01-01 → 2023-12-01$/u],
      [{ jurisdiction: 'nsh' }, /^Jurisdiktion nsh ≠ west$/u],
      [{ schemaVersion: 'landesrecht-projection-state/0' }, /^Zustandsschema landesrecht-projection-state\/0$/u],
    ];
    for (const [override, reason] of cases) {
      const previous = { ...smallState, ...override } as ProjectionState;
      const result = buildIncrementalProjectionPlan(small, previous, { jurisdiction: JURISDICTION, now: NOW });
      expect(result.mode, JSON.stringify(override)).toBe('full');
      expect(result.plan.groups[0]!.key).toBe('(reset)');
      expect(result.diff.reasons, JSON.stringify(override)).toEqual([expect.stringMatching(reason)]);
      expect(() => buildIncrementalProjectionPlan(small, previous, { jurisdiction: JURISDICTION, now: NOW, allowFullFallback: false })).toThrow(/^Inkrementelle Projektion nicht möglich: /u);
    }
  });

  it('baseGuardQuery liefert 1 bei passendem Fingerabdruck und wirft sonst in reinem SQL', async () => {
    const db = await openDatabase();
    executePlan(db, fullPlan(small));
    const fingerprint = runtimeMeta(db)[RUNTIME_META_KEYS.projectionFingerprint]!;
    expect(fingerprint).toBe(smallState.corpusFingerprint);
    const guard = baseGuardQuery(fingerprint);
    expect(guard.params).toEqual([RUNTIME_META_KEYS.projectionFingerprint, fingerprint]);
    const run = (query: PlanQuery): unknown[] => Object.values(db.native.prepare(query.sql).get(...(query.params as string[])) ?? {});
    expect(run(guard)).toEqual([1]);
    expect(() => run(baseGuardQuery('00000000'))).toThrow(/malformed JSON/u);
    db.native.prepare('DELETE FROM law_runtime_meta WHERE key = ?').run(RUNTIME_META_KEYS.projectionFingerprint);
    expect(() => run(guard)).toThrow(/malformed JSON/u);
  });

  it('abweichende Laufzeitmetadaten: der inkrementelle Plan scheitert an json(), die Transaktion hinterlässt keine Änderung', async () => {
    const db = await openDatabase();
    executePlan(db, fullPlan(small));
    const incremental = buildIncrementalProjectionPlan(smallMutation.records, smallState, { jurisdiction: JURISDICTION, now: LATER });
    expect(incremental.mode).toBe('incremental');
    db.native.prepare('UPDATE law_runtime_meta SET value = ? WHERE key = ?').run('fremdstand', RUNTIME_META_KEYS.projectionFingerprint);
    const before = rawDigest(db);
    expect(() => executePlan(db, incremental.plan)).toThrow(/malformed JSON/u);
    expect(rawDigest(db)).toBe(before);
    expect(runtimeMeta(db)[RUNTIME_META_KEYS.projectionState]).toBe('complete');

    // Als SQL-Datei ohne Transaktion (Remote-D1): die Basisprüfung ist die erste Anweisung, nichts wird geschrieben.
    const split = splitPlanIntoSqlFiles(incremental.plan, { database: DATABASE });
    expect(split.files[0]!.sql.split('\n')[1]).toBe(renderStatement(baseGuardQuery(smallState.corpusFingerprint)));
    expect(() => db.native.exec(split.files[0]!.sql)).toThrow(/malformed JSON/u);
    expect(rawDigest(db)).toBe(before);

    // Gegenprobe: mit passender Basis wird der Plan angewandt und gleicht der Vollprojektion.
    db.native.prepare('UPDATE law_runtime_meta SET value = ? WHERE key = ?').run(smallState.corpusFingerprint, RUNTIME_META_KEYS.projectionFingerprint);
    executePlan(db, incremental.plan);
    const fresh = await openDatabase();
    executePlan(fresh, fullPlan(smallMutation.records, LATER));
    expect(snapshotDatabase(db)).toEqual(snapshotDatabase(fresh));
  });

  it('ein abgebrochener inkrementeller Lauf gilt nie als gültige Basis; erst eine Vollprojektion stellt den Bestand her', async () => {
    const db = await openDatabase();
    executePlan(db, fullPlan(small));
    const incremental = buildIncrementalProjectionPlan(smallMutation.records, smallState, { jurisdiction: JURISDICTION, now: LATER });
    const firstNorm = incremental.plan.groups.findIndex((group) => !group.key.startsWith('('));
    expect(firstNorm).toBe(2);
    // Abbruch nach der ersten Norm: Basisprüfung, Entwertung und eine Norm sind geschrieben, die Kennzahlen fehlen.
    executePlan(db, { ...incremental.plan, groups: incremental.plan.groups.slice(0, firstNorm + 1) });
    const meta = runtimeMeta(db);
    expect(meta[RUNTIME_META_KEYS.projectionFingerprint]).toBeUndefined();
    expect(meta[RUNTIME_META_KEYS.projectionState]).toBe(`incremental-in-progress:${LATER}`);
    expect((await createD1NormStore(db, JURISDICTION).getStats()).projectionFingerprint).toBeNull();

    const before = rawDigest(db);
    expect(() => executePlan(db, incremental.plan)).toThrow(/malformed JSON/u);
    expect(() => executePlan(db, buildIncrementalProjectionPlan(smallMutation.records, smallState, { jurisdiction: JURISDICTION, now: '2026-09-17T00:00:00.000Z' }).plan)).toThrow(/malformed JSON/u);
    expect(rawDigest(db)).toBe(before);

    const recovery = buildIncrementalProjectionPlan(smallMutation.records, undefined, { jurisdiction: JURISDICTION, now: LATER });
    expect(recovery.mode).toBe('full');
    executePlan(db, recovery.plan);
    const fresh = await openDatabase();
    executePlan(fresh, fullPlan(smallMutation.records, LATER));
    expect(snapshotDatabase(db)).toEqual(snapshotDatabase(fresh));
    expect(runtimeMeta(db)[RUNTIME_META_KEYS.projectionFingerprint]).toBe(recovery.state.corpusFingerprint);
  });
});

describe('Skalierung: Aufteilung in SQL-Dateien für Remote-D1', () => {
  const statementsPerFile = (plan: ProjectionPlan, split: SqlSplit, resumable: boolean): string[][] => {
    const groups = expectedStatementsPerGroup(plan, resumable);
    let cursor = 0;
    return split.plan.files.map((meta) => {
      const own = groups.slice(cursor, cursor + meta.groups);
      cursor += meta.groups;
      return own.flatMap((group) => group.statements);
    });
  };

  it('hält die Standardgrenzen ein, verteilt keine Norm auf zwei Dateien und reproduziert den Plan vollständig', { timeout: HEAVY }, () => {
    const split = timed(() => splitPlanIntoSqlFiles(scale.plan, { database: DATABASE }));
    const { plan } = split.value;
    expect(plan).toMatchObject({ jurisdiction: JURISDICTION, database: DATABASE, mode: 'full', resumable: true, limits: { maxStatements: DEFAULT_SQL_FILE_STATEMENTS, maxBytes: DEFAULT_SQL_FILE_BYTES, maxStatementBytes: D1_MAX_STATEMENT_BYTES }, warnings: [], errors: [] });
    expect(plan.totals).toMatchObject({ statements: scale.plan.stats.statements + 9 * SCALE_NORMS, groups: scale.plan.groups.length, norms: SCALE_NORMS });
    const perFile = verifySqlFiles(scale.plan, split.value, { maxStatements: DEFAULT_SQL_FILE_STATEMENTS, maxBytes: DEFAULT_SQL_FILE_BYTES, resumable: true });
    expect(perFile.flat()).toHaveLength(plan.totals.statements);
    expect(plan.totals.bytes).toBe(perFile.reduce((sum, statements) => sum + Buffer.byteLength(`${statements.join('\n')}\n`), 0));
    expect(plan.files.length).toBeGreaterThanOrEqual(Math.ceil(plan.totals.statements / DEFAULT_SQL_FILE_STATEMENTS));
    const largest = Math.max(...plan.files.map((file) => file.bytes));
    console.info(`[Skalierung] SQL-Dateien: ${plan.files.length} Dateien, ${megabytes(plan.totals.bytes)} gesamt, größte Datei ${megabytes(largest)} / ${Math.max(...plan.files.map((file) => file.statements))} Anweisungen, Aufteilung ${split.ms} ms`);
  });

  it('resumable: eine abgebrochene Datei lässt sich gefahrlos wiederholen; das Ergebnis gleicht der direkten Projektion', { timeout: HEAVY }, async () => {
    const split = splitPlanIntoSqlFiles(scale.plan, { database: DATABASE });
    const perFile = statementsPerFile(scale.plan, split, true);
    const db = await openDatabase();
    const interrupted = Math.floor(split.files.length / 2);
    expect(interrupted).toBeGreaterThan(0);
    expect(interrupted).toBeLessThan(split.files.length - 1);
    const started = performance.now();
    for (const file of split.files.slice(0, interrupted)) db.native.exec(file.sql);
    const partial = perFile[interrupted]!;
    db.native.exec(`${partial.slice(0, Math.floor(partial.length / 2)).join('\n')}\n`);
    // Die Vollprojektion hat alle Kennzahlen gelöscht; ein halb eingespielter Bestand ist nie eine gültige Basis.
    expect(runtimeMeta(db)).toEqual({});
    for (const file of split.files.slice(interrupted)) db.native.exec(file.sql);
    const ms = Math.round(performance.now() - started);
    expect(() => checkSearchIndexIntegrity(db)).not.toThrow();
    expect(countRows(db, 'law_norms')).toBe(SCALE_NORMS);
    expect(snapshotDatabase(db)).toEqual(scale.snapshot);
    console.info(`[Skalierung] ${split.files.length} SQL-Dateien mit Wiederholung von Datei ${interrupted + 1} eingespielt: ${ms} ms`);
  });

  it('eigene Grenzen für Anweisungen und Bytes: jede Datei hält sie ein, die Verkettung ergibt die Planreihenfolge', { timeout: HEAVY }, () => {
    const planStatements = scale.plan.groups.flatMap((group) => group.queries.map(renderStatement));
    const defaults = splitPlanIntoSqlFiles(scale.plan, { database: DATABASE, resumable: false });
    for (const limits of [{ maxStatements: 400, maxBytes: 250_000 }, { maxStatements: 200, maxBytes: DEFAULT_SQL_FILE_BYTES }]) {
      const split = splitPlanIntoSqlFiles(scale.plan, { database: DATABASE, resumable: false, ...limits });
      expect(split.plan).toMatchObject({ resumable: false, limits: { ...limits, maxStatementBytes: D1_MAX_STATEMENT_BYTES }, warnings: [], errors: [] });
      const perFile = verifySqlFiles(scale.plan, split, { ...limits, resumable: false });
      const concatenated = perFile.flat();
      expect(concatenated).toHaveLength(planStatements.length);
      expect(concatenated.join('\n') === planStatements.join('\n'), 'Verkettung der Dateien entspricht nicht dem Plan').toBe(true);
      expect(split.plan.totals.statements).toBe(scale.plan.stats.statements);
      expect(split.plan.files.length).toBeGreaterThan(defaults.plan.files.length);
    }
    // Bei 250 KB schließt die Bytegrenze Dateien, obwohl die nächste Normgruppe nach Anweisungen noch hineinpasste.
    const largestGroup = Math.max(...scale.plan.groups.map((group) => group.queries.length));
    const bytesBound = splitPlanIntoSqlFiles(scale.plan, { database: DATABASE, resumable: false, maxStatements: 400, maxBytes: 250_000 });
    expect(bytesBound.plan.files.slice(0, -1).some((file) => file.statements + largestGroup <= 400)).toBe(true);
    const statementBound = splitPlanIntoSqlFiles(scale.plan, { database: DATABASE, resumable: false, maxStatements: 200 });
    expect(statementBound.plan.files.slice(0, -1).every((file) => file.statements + largestGroup > 200 || file.bytes > 5_000_000)).toBe(true);
  });

  it('resumable-Modus: jede Normgruppe beginnt mit dem Löschen genau dieser Norm in allen Normtabellen', async () => {
    const records = buildScaleCorpus(8);
    const plan = fullPlan(records);
    const tables = normTables(await openDatabase());
    expect(tables).toEqual(['law_external_identifiers', 'law_norm_history', 'law_norm_relations', 'law_norm_subjects', 'law_norms', 'law_search_units', 'law_source_objects', 'law_version_blocks', 'law_versions']);
    const limits = { maxStatements: 60, maxBytes: DEFAULT_SQL_FILE_BYTES, resumable: true };
    const statements = verifySqlFiles(plan, splitPlanIntoSqlFiles(plan, { database: DATABASE, ...limits }), limits).flat();
    for (const record of records) {
      const id = normId(JURISDICTION, record.meta.slug);
      const insert = statements.findIndex((statement) => statement.startsWith('INSERT INTO law_norms (') && statement.includes(`VALUES ('${id}',`));
      expect(insert, id).toBeGreaterThanOrEqual(9);
      const deletes = statements.slice(insert - 9, insert).map((statement) => statement.match(/^DELETE FROM (\w+) WHERE (?:norm_id|id) = '([^']+)';$/u)?.slice(1));
      expect(deletes.map((entry) => entry?.[1]), id).toEqual(Array.from({ length: 9 }, () => id));
      expect(deletes.map((entry) => entry![0]).sort(), id).toEqual(tables);
    }
    const plain = splitPlanIntoSqlFiles(plan, { database: DATABASE, resumable: false });
    expect(plain.files.some((file) => /DELETE FROM \w+ WHERE (?:norm_id|id) = /u.test(file.sql))).toBe(false);

    // Inkrementelle Pläne löschen bereits je Norm; der resumable-Modus verdoppelt das nicht.
    const incremental = buildIncrementalProjectionPlan(mutateScaleCorpus(records, { changed: 2, added: 1, removed: 1 }).records, projectionStateFor(records, { jurisdiction: JURISDICTION }), { jurisdiction: JURISDICTION, now: LATER });
    const incrementalSplit = splitPlanIntoSqlFiles(incremental.plan, { database: DATABASE });
    expect(incrementalSplit.plan.mode).toBe('incremental');
    expect(incrementalSplit.plan.totals.statements).toBe(incremental.plan.stats.statements);
    verifySqlFiles(incremental.plan, incrementalSplit, { maxStatements: DEFAULT_SQL_FILE_STATEMENTS, maxBytes: DEFAULT_SQL_FILE_BYTES, resumable: true });
  });

  it('ohne resumable scheitert die Wiederholung einer eingespielten Datei, mit resumable nicht', async () => {
    const records = buildScaleCorpus(8);
    const plan = fullPlan(records);
    const direct = await openDatabase();
    executePlan(direct, plan);
    const plain = splitPlanIntoSqlFiles(plan, { database: DATABASE, resumable: false, maxStatements: 60 });
    expect(plain.files.length).toBeGreaterThan(2);
    const failing = await openDatabase();
    failing.native.exec(plain.files[0]!.sql);
    failing.native.exec(plain.files[1]!.sql);
    expect(() => failing.native.exec(plain.files[1]!.sql)).toThrow(/UNIQUE constraint failed/u);

    const resumable = splitPlanIntoSqlFiles(plan, { database: DATABASE, resumable: true, maxStatements: 60 });
    const repeated = await openDatabase();
    repeated.native.exec(resumable.files[0]!.sql);
    repeated.native.exec(resumable.files[1]!.sql);
    expect(() => repeated.native.exec(resumable.files[1]!.sql)).not.toThrow();
    for (const file of resumable.files.slice(2)) repeated.native.exec(file.sql);
    expect(snapshotDatabase(repeated)).toEqual(snapshotDatabase(direct));
  });

  it('übergroße Normgruppen erhalten eine eigene Datei und eine Warnung', () => {
    const plan = fullPlan(buildScaleCorpus(6));
    const normKeys = plan.groups.map((group) => group.key).filter((key) => !key.startsWith('('));
    for (const limits of [{ maxStatements: 25, maxBytes: DEFAULT_SQL_FILE_BYTES }, { maxStatements: DEFAULT_SQL_FILE_STATEMENTS, maxBytes: 8_000 }]) {
      const split = splitPlanIntoSqlFiles(plan, { database: DATABASE, resumable: false, ...limits });
      expect(split.plan.errors).toEqual([]);
      expect(split.plan.warnings.map((warning) => warning.slice(0, warning.indexOf(':')))).toEqual(normKeys);
      expect(split.plan.warnings.every((warning) => /: \d+ Anweisungen \/ \d+ Bytes überschreiten die Dateigrenze; eigene Datei$/u.test(warning))).toBe(true);
      expect(split.plan.files.map((file) => [file.firstGroup, file.lastGroup, file.groups])).toEqual([['(reset)', '(reset)', 1], ...normKeys.map((key) => [key, key, 1]), ['(meta)', '(meta)', 1]]);
      verifySqlFiles(plan, split, { ...limits, resumable: false });
    }
  });

  it('Anweisungen über der D1-Grenze von 100 KB werden als Fehler gemeldet, nicht stillschweigend übergangen', () => {
    const statementFor = (value: string): PlanQuery => ({ sql: 'INSERT INTO law_runtime_meta (key, value) VALUES (?, ?)', params: ['gross', value] });
    const overhead = Buffer.byteLength(renderStatement(statementFor('')));
    const planWith = (value: string): ProjectionPlan => ({ jurisdiction: JURISDICTION, full: false, groups: [{ key: '(meta)', queries: [statementFor(value)] }], stats: { norms: 0, versions: 0, blocks: 0, blockParts: 0, searchUnits: 0, statements: 1 } });
    // Gezählt wird die Anweisung samt Zeilenumbruch: genau 100 000 Bytes sind zulässig.
    expect(splitPlanIntoSqlFiles(planWith('x'.repeat(D1_MAX_STATEMENT_BYTES - 1 - overhead)), { database: DATABASE }).plan.errors).toEqual([]);
    const over = splitPlanIntoSqlFiles(planWith('x'.repeat(D1_MAX_STATEMENT_BYTES - overhead)), { database: DATABASE });
    expect(over.plan.errors).toEqual([`(meta): Anweisung mit ${D1_MAX_STATEMENT_BYTES + 1} Bytes überschreitet die D1-Grenze von ${D1_MAX_STATEMENT_BYTES} Bytes`]);
    expect(over.files).toHaveLength(1);

    // Blockteile und Suchtexte werden nach Zeichen (40 000) geteilt, die D1-Grenze zählt Bytes: mehrbytige Zeichen fallen auf.
    const base = buildScaleNorm(4);
    const withText = (text: string): NormRecord => ({ ...base, versions: base.versions.map((version) => ({ ...version, body: [{ type: 'paragraph', label: '§ 1', title: 'Anlage', children: [{ type: 'subparagraph', label: '(1)', text, children: [] }] }] })) });
    const wide = splitPlanIntoSqlFiles(fullPlan([withText('€'.repeat(45_000))]), { database: DATABASE });
    expect(wide.plan.errors.length).toBeGreaterThanOrEqual(2);
    expect(wide.plan.errors.every((error) => error.startsWith(`${scaleSlug(4)}: Anweisung mit `))).toBe(true);
    expect(splitPlanIntoSqlFiles(fullPlan([withText('a'.repeat(45_000))]), { database: DATABASE }).plan.errors).toEqual([]);
  });
});
