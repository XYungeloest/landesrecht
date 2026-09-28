/**
 * Schema-Contract der OstRecht-D1 `ostrecht-recht` aus Sicht des Landesrecht-Workers (fail closed).
 *
 * Geprüft werden genau die Strukturen, die `ostrecht-d1-store.ts` liest: Tabellen und Spalten, die JSON-Grundstruktur
 * von `meta_json`/`version_json`/`document_json`/`publication_json`, der FTS5-Index `law_search` mit Inhaltstabelle
 * `law_search_units` sowie `law_runtime_meta` mit `sync_state = complete`. Jede Abweichung ist ein
 * `OstRechtContractError`; die Ost-Seiten antworten dann mit einem klaren Konfigurationsfehler statt mit halbgültigen
 * Daten. Die Prüfung läuft nur lesend (SELECT) und wird je Binding zwischengespeichert (`recheckAfterMs`).
 */
import type { ReadOnlyD1Database } from './read-only-d1.ts';

export class OstRechtContractError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`OstRecht-D1 (ostrecht-recht) erfüllt den Schema-Contract nicht: ${problems.join('; ')}`);
    this.name = 'OstRechtContractError';
    this.problems = problems;
  }
}

export function isOstRechtContractError(error: unknown): error is OstRechtContractError {
  return error instanceof OstRechtContractError || (error instanceof Error && error.name === 'OstRechtContractError');
}

/** Tabellen und Spalten, die der Store liest (Alias-frei; eine Zeile genügt zur Spaltenprüfung). */
export const OSTRECHT_CONTRACT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  law_norms: ['id', 'slug', 'title', 'short_title', 'abbr', 'type', 'status', 'current_version_id', 'meta_json', 'history_json', 'sort_title', 'subjects_json', 'aliases_json', 'last_change_date'],
  law_versions: ['norm_id', 'version_id', 'valid_from', 'valid_to', 'temporal_kind', 'version_json'],
  law_version_blocks: ['norm_id', 'version_id', 'block_index', 'part_index', 'block_json'],
  law_search_units: ['id', 'norm_id', 'version_id', 'provision_path', 'anchor', 'block_type', 'references_json', 'label', 'heading', 'body'],
  law_search_documents: ['norm_id', 'version_id', 'document_json'],
  law_publications: ['slug', 'publication_date', 'publication_json'],
  law_norm_derived: ['norm_id', 'relations_json'],
  law_norm_history: ['norm_id', 'change_date', 'change_type'],
  law_runtime_meta: ['key', 'value'],
};

export const OSTRECHT_REQUIRED_META_KEYS = ['sync_state', 'projection_fingerprint', 'corpus_hash', 'last_sync_at', 'norm_count'] as const;
export const OSTRECHT_SYNC_STATE_COMPLETE = 'complete';

export interface OstRechtContractOptions {
  /** Erneute Prüfung nach dieser Zeit (Standard 5 Minuten); 0 prüft bei jedem Aufruf. */
  recheckAfterMs?: number;
  now?: () => number;
}

export interface OstRechtContractReport {
  ok: boolean;
  problems: string[];
  meta: Record<string, string>;
  checkedAt: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonColumn(raw: unknown, context: string, problems: string[]): Record<string, unknown> | null {
  if (typeof raw !== 'string') {
    problems.push(`${context}: kein JSON-Text`);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) {
      problems.push(`${context}: JSON ist kein Objekt`);
      return null;
    }
    return parsed;
  } catch {
    problems.push(`${context}: JSON nicht lesbar`);
    return null;
  }
}

function expectKeys(object: Record<string, unknown> | null, keys: readonly string[], context: string, problems: string[]): void {
  if (!object) return;
  for (const key of keys) if (!(key in object)) problems.push(`${context}: Feld „${key}“ fehlt`);
}

/** Vollständige Prüfung ohne Cache; liefert einen Bericht statt zu werfen (Diagnose, Drift-Audit). */
export async function checkOstRechtSchemaContract(db: Pick<ReadOnlyD1Database, 'prepare'>, now: () => Date = () => new Date()): Promise<OstRechtContractReport> {
  const problems: string[] = [];
  const meta: Record<string, string> = {};

  for (const [table, columns] of Object.entries(OSTRECHT_CONTRACT_COLUMNS)) {
    try {
      await db.prepare(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 1`).first();
    } catch (error) {
      problems.push(`${table}: ${String((error as Error)?.message ?? error).replace(/\s+/gu, ' ').slice(0, 160)}`);
    }
  }
  if (problems.length > 0) return { ok: false, problems, meta, checkedAt: now().toISOString() };

  try {
    const rows = (await db.prepare('SELECT key, value FROM law_runtime_meta').all<{ key: string; value: string }>()).results;
    for (const row of rows) meta[row.key] = row.value;
  } catch (error) {
    problems.push(`law_runtime_meta nicht lesbar: ${String((error as Error)?.message ?? error)}`);
  }
  for (const key of OSTRECHT_REQUIRED_META_KEYS) if (!meta[key]) problems.push(`law_runtime_meta: Schlüssel „${key}“ fehlt`);
  if (meta.sync_state && meta.sync_state !== OSTRECHT_SYNC_STATE_COMPLETE) problems.push(`law_runtime_meta: sync_state ist „${meta.sync_state}“, erwartet „${OSTRECHT_SYNC_STATE_COMPLETE}“`);

  try {
    const norm = await db.prepare('SELECT id, meta_json, history_json FROM law_norms ORDER BY id LIMIT 1').first<{ id: string; meta_json: string; history_json: string }>();
    if (!norm) problems.push('law_norms ist leer');
    else {
      expectKeys(parseJsonColumn(norm.meta_json, `law_norms.meta_json (${norm.id})`, problems), ['slug', 'title', 'type', 'status', 'sourceReferences'], `law_norms.meta_json (${norm.id})`, problems);
      expectKeys(parseJsonColumn(norm.history_json, `law_norms.history_json (${norm.id})`, problems), ['entries'], `law_norms.history_json (${norm.id})`, problems);
      const version = await db.prepare('SELECT version_id, version_json FROM law_versions WHERE norm_id = ? ORDER BY valid_from LIMIT 1').bind(norm.id).first<{ version_id: string; version_json: string }>();
      if (!version) problems.push(`law_versions: keine Fassung für ${norm.id}`);
      else expectKeys(parseJsonColumn(version.version_json, `law_versions.version_json (${norm.id}/${version.version_id})`, problems), ['versionId', 'validFrom', 'citation'], `law_versions.version_json (${norm.id}/${version.version_id})`, problems);
      const document = await db.prepare('SELECT document_json FROM law_search_documents WHERE norm_id = ? LIMIT 1').bind(norm.id).first<{ document_json: string }>();
      if (!document) problems.push(`law_search_documents: kein Suchdokument für ${norm.id}`);
      else expectKeys(parseJsonColumn(document.document_json, `law_search_documents.document_json (${norm.id})`, problems), ['slug', 'versionId', 'title', 'type', 'status', 'validFrom', 'validTo'], `law_search_documents.document_json (${norm.id})`, problems);
    }
    const publication = await db.prepare('SELECT slug, publication_json FROM law_publications ORDER BY publication_date DESC LIMIT 1').first<{ slug: string; publication_json: string }>();
    if (publication) expectKeys(parseJsonColumn(publication.publication_json, `law_publications.publication_json (${publication.slug})`, problems), ['slug', 'title', 'year', 'issue', 'date', 'publication', 'entries'], `law_publications.publication_json (${publication.slug})`, problems);
  } catch (error) {
    problems.push(`Stichprobe nicht lesbar: ${String((error as Error)?.message ?? error)}`);
  }

  try {
    // FTS5 mit externem Inhalt: MATCH muss funktionieren und über rowid auf law_search_units verweisen.
    await db.prepare("SELECT u.id FROM law_search s JOIN law_search_units u ON u.id = s.rowid WHERE law_search MATCH 'gesetz' LIMIT 1").first();
  } catch (error) {
    problems.push(`law_search (FTS5): ${String((error as Error)?.message ?? error).replace(/\s+/gu, ' ').slice(0, 160)}`);
  }

  return { ok: problems.length === 0, problems, meta, checkedAt: now().toISOString() };
}

interface ContractCacheEntry {
  checkedAt: number;
  promise: Promise<void>;
}

const contractCache = new WeakMap<object, ContractCacheEntry>();
export const OSTRECHT_CONTRACT_RECHECK_MS = 5 * 60_000;
const FAILURE_RECHECK_MS = 15_000;

/** Prüft den Contract (zwischengespeichert je Binding) und wirft `OstRechtContractError` bei Abweichung. */
export async function assertOstRechtSchemaContract(db: ReadOnlyD1Database, options: OstRechtContractOptions = {}): Promise<void> {
  const now = options.now ?? Date.now;
  const recheckAfterMs = options.recheckAfterMs ?? OSTRECHT_CONTRACT_RECHECK_MS;
  const cached = contractCache.get(db);
  if (cached && now() - cached.checkedAt < recheckAfterMs) return cached.promise;
  const checkedAt = now();
  const promise = checkOstRechtSchemaContract(db).then((report) => {
    if (!report.ok) throw new OstRechtContractError(report.problems);
  });
  contractCache.set(db, { checkedAt, promise });
  try {
    await promise;
  } catch (error) {
    // Fehlschlag kurz halten, damit ein laufender OstRecht-Sync bald wieder geprüft wird, ohne jede Anfrage neu zu prüfen.
    contractCache.set(db, { checkedAt: checkedAt - recheckAfterMs + FAILURE_RECHECK_MS, promise });
    throw error;
  }
}

/** Setzt den Cache zurück (Tests). */
export function resetOstRechtContractCache(db: object): void {
  contractCache.delete(db);
}
