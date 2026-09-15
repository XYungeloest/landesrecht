/**
 * SQLite-Adapter mit D1-kompatibler Schnittstelle (node:sqlite). Lokale Projektionen, Seeds
 * und Tests führen dieselben SQL-Anweisungen wie der Worker aus, ohne Cloudflare-Zugriff.
 * Nur für Node; der Worker importiert dieses Modul nie.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.ts';
import type { PlanQuery, ProjectionPlan } from './projection.ts';

export const MIGRATION_FILE_PATTERN = /^\d{4}_.*\.sql$/u;

export async function listMigrations(migrationsDir: string): Promise<string[]> {
  return (await readdir(migrationsDir)).filter((file) => MIGRATION_FILE_PATTERN.test(file)).sort().map((name) => join(migrationsDir, name));
}

export async function applyMigrations(db: DatabaseSync, migrationsDir: string): Promise<void> {
  for (const file of await listMigrations(migrationsDir)) db.exec(await readFile(file, 'utf8'));
}

function bindable(value: unknown): null | number | string | bigint | Uint8Array {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint' || value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

class SqliteStatement implements D1PreparedStatement {
  private params: unknown[] = [];
  private readonly db: DatabaseSync;
  private readonly sql: string;

  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    const statement = new SqliteStatement(this.db, this.sql);
    statement.params = values;
    return statement;
  }

  private prepared() {
    return this.db.prepare(this.sql);
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.prepared().get(...this.params.map(bindable)) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.prepared().all(...this.params.map(bindable)) as T[];
    return { results, success: true };
  }

  async run(): Promise<D1Result> {
    const info = this.prepared().run(...this.params.map(bindable));
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }
}

export class SqliteD1Database implements D1Database {
  readonly native: DatabaseSync;

  constructor(native: DatabaseSync) {
    this.native = native;
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteStatement(this.native, query);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>> {
    const results: Array<D1Result<T>> = [];
    for (const statement of statements) results.push(await statement.all<T>());
    return results;
  }

  close(): void {
    this.native.close();
  }
}

export interface OpenOptions {
  migrationsDir?: string;
  readOnly?: boolean;
}

/** Öffnet (oder erzeugt) eine SQLite-Datei; mit `migrationsDir` werden die Migrationen angewandt. */
export async function openSqliteD1(path: string, options: OpenOptions = {}): Promise<SqliteD1Database> {
  const native = new DatabaseSync(path, options.readOnly ? { readOnly: true } : {});
  if (options.migrationsDir) await applyMigrations(native, options.migrationsDir);
  return new SqliteD1Database(native);
}

/** Führt einen Projektionsplan in einer Transaktion aus; liefert die Anzahl der Anweisungen. */
export function executePlan(db: SqliteD1Database, plan: ProjectionPlan): number {
  let count = 0;
  db.native.exec('BEGIN');
  try {
    for (const group of plan.groups) {
      for (const query of group.queries) {
        runQuery(db.native, query);
        count += 1;
      }
    }
    db.native.exec('COMMIT');
  } catch (error) {
    db.native.exec('ROLLBACK');
    throw error;
  }
  return count;
}

function runQuery(native: DatabaseSync, query: PlanQuery): void {
  native.prepare(query.sql).run(...query.params.map(bindable));
}

/** FTS5-Integritätsprüfung des Suchindex (wirft bei Abweichung). */
export function checkSearchIndexIntegrity(db: SqliteD1Database): void {
  db.native.exec("INSERT INTO law_search(law_search) VALUES ('integrity-check')");
}
