/**
 * Deterministischer Projektionsplan: kanonische Normdatensätze → SQL-Anweisungen für eine
 * D1-Datenbank je Jurisdiktion. Reine Funktion ohne Datenbankzugriff; ausgeführt vom
 * SQLite-Adapter (lokal), von Wrangler (remote) oder in Tests. Aufbau nach OstRecht
 * (scripts/sync-recht-d1.mjs), ohne herkunftssystemspezifische Spalten.
 */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { anchorSlug } from '@landesrecht/legal-core/lib/body.ts';
import { getIndexLetter, getNormAliases, getNormSortKey, getNormVersionIdentity, getPublicNormSummary } from '@landesrecht/legal-core/lib/identity.ts';
import type { NormRecord, NormVersion, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import { classifyNormVersion, getApplicableVersion, getNormLastActivityDate, getNormLastChangeDate } from '@landesrecht/legal-core/lib/versions.ts';
import { buildSearchDocument, SEARCH_UNIT_COLUMNS, searchIndexResetStatements, type SearchDocument } from '@landesrecht/search/index.ts';

export interface PlanQuery {
  sql: string;
  params: unknown[];
}

export interface PlanGroup {
  key: string;
  queries: PlanQuery[];
}

export interface ProjectionPlan {
  jurisdiction: JurisdictionId;
  full: boolean;
  groups: PlanGroup[];
  stats: {
    norms: number;
    versions: number;
    blocks: number;
    blockParts: number;
    searchUnits: number;
    statements: number;
  };
}

export interface ProjectionOptions {
  jurisdiction: JurisdictionId;
  /** Vollprojektion: Tabellen werden zuvor geleert. */
  full?: boolean;
  /** Redaktioneller Stichtag für Fassungsklassifikation und abgeleitete Daten. */
  asOf?: string;
  /** Zeitstempel der Projektion (deterministisch setzbar). */
  now?: string;
  /** Sucheinheiten für alle Fassungen (Standard) oder nur die maßgebliche Fassung. */
  indexHistoricalVersions?: boolean;
}

/** D1 begrenzt die Länge einer Anweisung; große Blöcke werden zeichenweise geteilt. */
export const MAX_BLOCK_PART_CHARS = 40_000;
export const MAX_SEARCH_BODY_CHARS = 40_000;

export const RUNTIME_META_KEYS = {
  lastProjectedAt: 'last_projected_at',
  projectionFingerprint: 'projection_fingerprint',
  projectionState: 'projection_state',
  jurisdiction: 'jurisdiction',
  baselineDate: 'baseline_date',
  referenceDate: 'reference_date',
  normCount: 'norm_count',
  versionCount: 'version_count',
  schemaVersion: 'schema_version',
} as const;

export const PROJECTION_SCHEMA_VERSION = '1';

export function normId(jurisdiction: JurisdictionId, slug: string): string {
  return `${jurisdiction}:${slug}`;
}

export function splitBlockJson(json: string, maxChars = MAX_BLOCK_PART_CHARS): string[] {
  if (json.length <= maxChars) return [json];
  const parts: string[] = [];
  for (let offset = 0; offset < json.length; offset += maxChars) parts.push(json.slice(offset, offset + maxChars));
  return parts;
}

const TABLES_IN_DELETE_ORDER = [
  'law_search_units',
  'law_external_identifiers',
  'law_norm_subjects',
  'law_norm_relations',
  'law_norm_history',
  'law_source_objects',
  'law_version_blocks',
  'law_versions',
  'law_norms',
] as const;

function fullResetQueries(): PlanQuery[] {
  return [
    ...searchIndexResetStatements().map((sql) => ({ sql, params: [] })),
    ...TABLES_IN_DELETE_ORDER.filter((table) => table !== 'law_search_units').map((table) => ({ sql: `DELETE FROM ${table}`, params: [] })),
    { sql: 'DELETE FROM law_runtime_meta', params: [] },
  ];
}

export function deleteNormQueries(id: string): PlanQuery[] {
  return TABLES_IN_DELETE_ORDER.map((table) => ({ sql: `DELETE FROM ${table} WHERE norm_id = ?`, params: [id] }))
    .map((query) => (query.sql.includes('law_norms WHERE') ? { sql: 'DELETE FROM law_norms WHERE id = ?', params: [id] } : query));
}

function stripBody(version: NormVersion): Omit<NormVersion, 'body'> {
  const { body: _body, ...rest } = version;
  return rest;
}

function stripUnits(document: SearchDocument): Omit<SearchDocument, 'units'> {
  const { units: _units, ...rest } = document;
  return rest;
}

function sourceObjectQueries(id: string, versionId: string, sources: readonly SourceReference[] | undefined): PlanQuery[] {
  return (sources ?? []).map((source, index) => ({
    sql: `INSERT INTO law_source_objects (norm_id, version_id, source_index, kind, system, label, availability, url, local_source, object_key, media_type, sha256, retrieved_at, external_id, source_valid_from, source_valid_to, source_role)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id, versionId, index, source.kind, source.system ?? null, source.label, source.availability, source.url ?? null,
      source.localSource ?? null, source.objectKey ?? null, source.mediaType ?? null, source.sha256 ?? null,
      source.retrievedAt ?? null, source.externalId ?? null, source.sourceValidFrom ?? null, source.sourceValidTo ?? null,
      source.sourceRole ?? null,
    ],
  }));
}

export function normQueries(record: NormRecord, options: Required<Pick<ProjectionOptions, 'asOf' | 'now' | 'indexHistoricalVersions'>> & { full: boolean }): { queries: PlanQuery[]; versions: number; blocks: number; blockParts: number; searchUnits: number } {
  const { meta } = record;
  const id = normId(meta.jurisdiction, meta.slug);
  const current = getApplicableVersion(record, options.asOf);
  const identity = getNormVersionIdentity(record, current);
  const summary = getPublicNormSummary(identity);
  const queries: PlanQuery[] = options.full ? [] : deleteNormQueries(id);
  let blocks = 0;
  let blockParts = 0;
  let searchUnits = 0;

  queries.push({
    sql: `INSERT INTO law_norms (id, jurisdiction, slug, title, short_title, abbr, type, status, current_version_id, current_valid_from, document_date, publication_date, effective_date, expiry_date, initial_citation, summary, enacting_body, responsible_body, subjects_json, primary_subject, keywords_json, aliases_json, external_ids_json, sort_key, index_letter, version_count, last_change_date, last_activity_date, meta_json, history_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id, meta.jurisdiction, meta.slug, identity.title, identity.shortTitle, identity.abbr ?? null, meta.type, meta.status,
      current.versionId, current.simulationValidFrom, meta.documentDate ?? null, meta.publicationDate ?? null,
      meta.effectiveDate ?? null, meta.expiryDate ?? null, meta.initialCitation, summary ?? null, meta.enactingBody ?? null,
      meta.responsibleBody ?? null, JSON.stringify(meta.subjects), meta.primarySubject ?? null, JSON.stringify(meta.keywords),
      JSON.stringify(getNormAliases(record, identity)), JSON.stringify(meta.externalIdentifiers), getNormSortKey(identity.title),
      getIndexLetter(identity.title), record.versions.length, getNormLastChangeDate(record, options.asOf),
      getNormLastActivityDate(record, options.asOf), JSON.stringify(meta), JSON.stringify(record.history), options.now,
    ],
  });

  for (const subject of new Set(meta.subjects)) {
    queries.push({ sql: 'INSERT OR IGNORE INTO law_norm_subjects (norm_id, subject, subject_slug) VALUES (?, ?, ?)', params: [id, subject, anchorSlug(subject)] });
  }
  for (const identifier of meta.externalIdentifiers) {
    queries.push({ sql: 'INSERT OR IGNORE INTO law_external_identifiers (norm_id, system, value, url) VALUES (?, ?, ?, ?)', params: [id, identifier.system, identifier.value, identifier.url ?? null] });
  }
  meta.relations.forEach((relation, index) => {
    queries.push({
      sql: 'INSERT INTO law_norm_relations (norm_id, relation_index, relation_type, target_jurisdiction, target_slug, note, relation_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [id, index, relation.type, relation.target.jurisdiction ?? meta.jurisdiction, relation.target.slug, relation.note ?? null, relation.date ?? null],
    });
  });
  record.history.entries.forEach((entry, index) => {
    queries.push({
      sql: 'INSERT INTO law_norm_history (norm_id, entry_index, change_date, change_type, title, citation, note, affecting_version_id, related_jurisdiction, related_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, index, entry.date, entry.type, entry.title, entry.citation, entry.note ?? null, entry.affectingVersionId ?? null, entry.relatedNorm ? (entry.relatedNorm.jurisdiction ?? meta.jurisdiction) : null, entry.relatedNorm?.slug ?? null],
    });
  });
  queries.push(...sourceObjectQueries(id, '', meta.sourceReferences));

  for (const version of record.versions) {
    const versionIdentity = getNormVersionIdentity(record, version);
    const document = buildSearchDocument(record, version, options.asOf);
    queries.push({
      sql: `INSERT INTO law_versions (norm_id, version_id, simulation_valid_from, simulation_valid_to, source_valid_from, source_valid_to, temporal_kind, title, short_title, abbr, citation, change_note, version_json, search_document_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, version.versionId, version.simulationValidFrom, version.simulationValidTo, version.sourceValidFrom ?? null, version.sourceValidTo ?? null,
        classifyNormVersion(record, version, options.asOf), version.title ?? null, version.shortTitle ?? null, version.abbr ?? null,
        version.citation, version.changeNote, JSON.stringify(stripBody(version)), JSON.stringify(stripUnits(document)), options.now,
      ],
    });
    version.body.forEach((block, blockIndex) => {
      const parts = splitBlockJson(JSON.stringify(block));
      blocks += 1;
      parts.forEach((part, partIndex) => {
        blockParts += 1;
        queries.push({
          sql: 'INSERT INTO law_version_blocks (norm_id, version_id, block_index, part_index, part_count, block_json) VALUES (?, ?, ?, ?, ?, ?)',
          params: [id, version.versionId, blockIndex, partIndex, parts.length, part],
        });
      });
    });
    queries.push(...sourceObjectQueries(id, version.versionId, version.sourceReferences));

    if (options.indexHistoricalVersions || version.versionId === current.versionId) {
      for (const unit of document.units) {
        searchUnits += 1;
        queries.push({
          sql: `INSERT INTO law_search_units (${SEARCH_UNIT_COLUMNS.join(', ')}) VALUES (${SEARCH_UNIT_COLUMNS.map(() => '?').join(', ')})`,
          params: [
            id, meta.jurisdiction, version.versionId, unit.index, unit.anchor, unit.type, unit.references ? JSON.stringify(unit.references) : null,
            meta.slug, versionIdentity.title, versionIdentity.shortTitle, versionIdentity.abbr ?? '', unit.label, unit.heading,
            unit.body.slice(0, MAX_SEARCH_BODY_CHARS),
          ],
        });
      }
    }
  }

  return { queries, versions: record.versions.length, blocks, blockParts, searchUnits };
}

export function runtimeMetaQueries(entries: Record<string, string>): PlanQuery[] {
  return Object.entries(entries).map(([key, value]) => ({
    sql: 'INSERT INTO law_runtime_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    params: [key, value],
  }));
}

/** Deterministischer Fingerabdruck des Bestands (FNV-1a über die kanonische JSON-Form). */
export function corpusFingerprint(records: readonly NormRecord[], asOf: string): string {
  let hash = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  feed(`schema:${PROJECTION_SCHEMA_VERSION}|asOf:${asOf}|baseline:${SIMULATION_BASELINE_DATE}`);
  for (const record of [...records].sort((left, right) => left.meta.slug.localeCompare(right.meta.slug))) {
    feed(JSON.stringify(record));
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildProjectionPlan(records: readonly NormRecord[], options: ProjectionOptions): ProjectionPlan {
  const asOf = options.asOf ?? EDITORIAL_REFERENCE_DATE;
  const now = options.now ?? new Date().toISOString();
  const full = options.full ?? false;
  const indexHistoricalVersions = options.indexHistoricalVersions ?? true;
  const jurisdictionRecords = records.filter((record) => record.meta.jurisdiction === options.jurisdiction)
    .sort((left, right) => left.meta.slug.localeCompare(right.meta.slug));
  const foreign = records.find((record) => record.meta.jurisdiction !== options.jurisdiction);
  if (foreign && records.length !== jurisdictionRecords.length && options.full === undefined) {
    // Stillschweigend ignorieren wäre gefährlich: der Aufrufer muss den Bestand je Jurisdiktion trennen.
  }

  const groups: PlanGroup[] = [];
  if (full) groups.push({ key: '(reset)', queries: fullResetQueries() });
  else groups.push({ key: '(identität entwerten)', queries: runtimeMetaQueries({ [RUNTIME_META_KEYS.projectionState]: `incremental-in-progress:${now}` }) });

  const stats = { norms: 0, versions: 0, blocks: 0, blockParts: 0, searchUnits: 0, statements: 0 };
  for (const record of jurisdictionRecords) {
    const result = normQueries(record, { asOf, now, indexHistoricalVersions, full });
    stats.norms += 1;
    stats.versions += result.versions;
    stats.blocks += result.blocks;
    stats.blockParts += result.blockParts;
    stats.searchUnits += result.searchUnits;
    groups.push({ key: record.meta.slug, queries: result.queries });
  }

  groups.push({
    key: '(meta)',
    queries: runtimeMetaQueries({
      [RUNTIME_META_KEYS.lastProjectedAt]: now,
      [RUNTIME_META_KEYS.projectionFingerprint]: corpusFingerprint(jurisdictionRecords, asOf),
      [RUNTIME_META_KEYS.projectionState]: 'complete',
      [RUNTIME_META_KEYS.jurisdiction]: options.jurisdiction,
      [RUNTIME_META_KEYS.baselineDate]: SIMULATION_BASELINE_DATE,
      [RUNTIME_META_KEYS.referenceDate]: asOf,
      [RUNTIME_META_KEYS.normCount]: String(stats.norms),
      [RUNTIME_META_KEYS.versionCount]: String(stats.versions),
      [RUNTIME_META_KEYS.schemaVersion]: PROJECTION_SCHEMA_VERSION,
    }),
  });

  stats.statements = groups.reduce((sum, group) => sum + group.queries.length, 0);
  return { jurisdiction: options.jurisdiction, full, groups, stats };
}

/** NUL-Zeichen im SQL-Text: Wrangler liest die Datei dort ab, der Rest einer Datei ginge stillschweigend verloren. */
const NUL_CHARACTER = new RegExp('\\u0000', 'u');

/** SQL-Literal für Wrangler-Dateien (`wrangler d1 execute --file`). */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = String(value);
  // Fail-closed: Ein NUL-Zeichen hat 2026-09-18 eine Remote-Datei nach der Hälfte abgeschnitten, ohne Fehlermeldung.
  if (NUL_CHARACTER.test(text)) throw new Error(`SQL-Literal enthält ein NUL-Zeichen (Inhalt beginnt mit ${JSON.stringify(text.slice(0, 60))}); der Inhalt ist zu bereinigen, nicht die Datei`);
  return `'${text.replace(/'/g, "''")}'`;
}

export function renderStatement(query: PlanQuery): string {
  let index = 0;
  const rendered = query.sql.replace(/\?/g, () => {
    if (index >= query.params.length) throw new Error('Zu wenige Parameter für die Anweisung');
    return sqlLiteral(query.params[index++]);
  });
  if (index !== query.params.length) throw new Error('Zu viele Parameter für die Anweisung');
  // Genau ein Abschluss-Semikolon: Trigger-Definitionen (`… END;`) bringen ihres mit; `;;` ergäbe eine leere
  // Anweisung, die die Remote-D1 mit „SQL code did not contain a statement“ ablehnt (lokal wird sie übergangen).
  // Mehrfache Semikolons und abschließende Zeilenkommentare (`-- …`) würden das Semikolon sonst verschlucken.
  let body = rendered.trimEnd();
  for (;;) {
    let stripped = body.replace(/(?:;\s*)+$/u, '').replace(/(?:^|\n)[ \t]*--[^\n]*$/u, '').trimEnd();
    // Zeilenkommentar hinter der Anweisung – nur außerhalb einer Zeichenkette (gerade Zahl von Apostrophen davor).
    const inline = /[ \t]+--[^\n']*$/u.exec(stripped);
    if (inline && (stripped.slice(0, inline.index).match(/'/gu) ?? []).length % 2 === 0) stripped = stripped.slice(0, inline.index).trimEnd();
    if (stripped === body) break;
    body = stripped;
  }
  return `${body};`;
}


/** Längengrenze einer einzelnen D1-Anweisung. */
export const D1_MAX_STATEMENT_BYTES = 100_000;
/**
 * Schlüsselspalten je Tabelle, über die eine aufgeteilte Zeile wiedergefunden wird.
 *
 * Nur Tabellen, deren Zeilen tatsächlich übergroß werden können, stehen hier. Eine Tabelle, die hier
 * fehlt, wird nie aufgeteilt – eine übergroße Anweisung dort bleibt ein Fehler, wie zuvor.
 */
export const SPLITTABLE_TABLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  law_norms: ['id'],
  law_versions: ['norm_id', 'version_id'],
};

/** Reserve für Anweisungsrumpf und Schlüsselwerte der Anhänge-Anweisung. */
const SPLIT_HEADROOM_BYTES = 8_000;

/**
 * Teilt ein übergroßes `INSERT` in ein `INSERT` mit gekürztem Wert und anhängende `UPDATE`s.
 *
 * Anlass: Eine bayerische Verwaltungsvorschrift trägt 758 PDF-Beilagen – eine Karte je
 * Natura-2000-Gebiet. Jede ist eine Quellenreferenz; `meta_json` wird dadurch 431 KB groß, die
 * D1-Grenze für eine Anweisung liegt bei 100 KB. Die Norm ist echt und vollständig; sie auszuschließen
 * hieße, eine gültige Vorschrift wegen der Größe ihrer Beilagenliste zu verlieren.
 *
 * **Greift nur oberhalb der Grenze.** Eine Anweisung, die passt, bleibt Byte für Byte, wie sie war –
 * der West-Bestand, in dem keine Anweisung die Grenze erreicht, erzeugt deshalb exakt dieselben
 * Dateien wie zuvor.
 *
 * Sicherheit: Die Dateien beginnen je Norm mit dem Löschen dieser Norm (resumable-Modus). Bricht der
 * Lauf zwischen `INSERT` und letztem `UPDATE` ab, entfernt die Wiederholung die halbe Zeile, bevor sie
 * sie neu schreibt. Eine abgeschnittene Zeile kann so nicht stehen bleiben.
 */
export function splitOversizedInsert(query: PlanQuery, limit: number = D1_MAX_STATEMENT_BYTES): PlanQuery[] {
  const encoder = new TextEncoder();
  const size = (candidate: PlanQuery): number => encoder.encode(renderStatement(candidate)).byteLength + 1;
  if (size(query) <= limit) return [query];

  const match = /^\s*INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/iu.exec(query.sql);
  if (!match) return [query];
  const table = match[1]!;
  const keys = SPLITTABLE_TABLE_KEYS[table];
  if (!keys) return [query];
  const columns = match[2]!.split(',').map((column) => column.trim());
  if (columns.length !== query.params.length) return [query];
  const keyIndexes = keys.map((key) => columns.indexOf(key));
  if (keyIndexes.some((index) => index < 0)) return [query];

  // Die größte Zeichenkette trägt das Volumen; nur sie wird aufgeteilt.
  let target = -1;
  let longest = 0;
  query.params.forEach((value, index) => {
    if (typeof value === 'string' && value.length > longest && !keyIndexes.includes(index)) {
      target = index;
      longest = value.length;
    }
  });
  if (target < 0) return [query];

  const value = query.params[target] as string;
  const column = columns[target]!;
  const whereClause = keys.map((key) => `${key} = ?`).join(' AND ');
  const keyValues = keyIndexes.map((index) => query.params[index]);

  // Stückgröße in Zeichen so wählen, dass auch mehrbytige Zeichen und Maskierung unter der Grenze
  // bleiben: vier Bytes je Zeichen im ungünstigsten Fall, Apostrophe verdoppelt.
  const chunkChars = Math.max(1_000, Math.floor((limit - SPLIT_HEADROOM_BYTES) / 8));
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkChars) chunks.push(value.slice(offset, offset + chunkChars));

  const head: PlanQuery = { sql: query.sql, params: query.params.map((param, index) => (index === target ? chunks[0]! : param)) };
  const appends: PlanQuery[] = chunks.slice(1).map((chunk) => ({
    sql: `UPDATE ${table} SET ${column} = ${column} || ? WHERE ${whereClause}`,
    params: [chunk, ...keyValues],
  }));
  const result = [head, ...appends];
  // Passt ein Teil dennoch nicht (etwa weil eine zweite Spalte ebenfalls groß ist), bleibt es beim
  // Fehler der Aufrufstelle – lieber gemeldet als halb geschrieben.
  return result.every((part) => size(part) <= limit) ? result : [query];
}

/**
 * Plan als eine SQL-Datei (lokaler Seed, Remote-Plan). Übergroße Anweisungen werden hier genauso
 * aufgeteilt wie in den Remote-Batches – sonst lehnte die lokale Miniflare-D1 sie mit
 * `SQLITE_TOOBIG` ab, während die Remote-D1 sie annähme.
 */
export function renderPlanSql(plan: ProjectionPlan): string {
  return plan.groups.flatMap((group) => [`-- ${group.key}`, ...group.queries.flatMap((query) => splitOversizedInsert(query)).map(renderStatement)]).join('\n');
}
