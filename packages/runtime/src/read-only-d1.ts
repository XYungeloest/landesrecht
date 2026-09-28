/**
 * Read-only-Hülle um eine D1-Datenbank (Variante A der Ost-Anbindung: der Landesrecht-Worker liest die OstRecht-D1
 * `ostrecht-recht` direkt). D1 kennt keine Read-only-Bindings; diese Hülle stellt in der Anwendungsschicht sicher, dass
 * über das Binding ausschließlich Leseanweisungen laufen:
 *
 *   - `prepare` nimmt nur eine einzelne SELECT-/WITH-Anweisung an (kein DDL, kein DML, keine PRAGMA-Schreibbefehle,
 *     keine zweite Anweisung hinter einem Semikolon);
 *   - `run` und `batch` existieren nicht (Typ `ReadOnlyD1Database`), ein Aufruf über den unsicheren Typ wirft.
 *
 * Migrationen, Projektionsbatches und Adminpfade akzeptieren nur `D1Database`; eine `ReadOnlyD1Database` lässt sich
 * dort nicht übergeben.
 */
import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.ts';

export interface ReadOnlyD1PreparedStatement {
  bind(...values: unknown[]): ReadOnlyD1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface ReadOnlyD1Database {
  readonly readOnly: true;
  prepare(query: string): ReadOnlyD1PreparedStatement;
}

export class ReadOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyViolationError';
  }
}

const READ_STATEMENT = /^\s*(?:SELECT|WITH)\b/iu;
// `replace(` als SQL-Funktion (Zeichenersetzung) ist kein Schreibbefehl; nur das Schlüsselwort REPLACE INTO ist verboten.
const FORBIDDEN = /\b(?:INSERT|UPDATE|DELETE|REPLACE(?!\s*\()|CREATE|ALTER|DROP|ATTACH|DETACH|VACUUM|REINDEX|PRAGMA)\b/iu;

/** Entfernt Stringliterale, damit Schlüsselwörter darin nicht fälschlich als Anweisung zählen. */
function stripLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/gu, "''");
}

/** Prüft, dass `sql` genau eine Leseanweisung ist (fail closed). */
export function assertReadOnlySql(sql: string): void {
  const bare = stripLiterals(sql).replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');
  if (!READ_STATEMENT.test(bare)) throw new ReadOnlyViolationError(`Nur SELECT/WITH-Anweisungen sind über das Read-only-Binding zulässig: ${sql.slice(0, 80)}`);
  const withoutTrailing = bare.trim().replace(/;\s*$/u, '');
  if (withoutTrailing.includes(';')) throw new ReadOnlyViolationError('Mehrere Anweisungen sind über das Read-only-Binding nicht zulässig');
  if (FORBIDDEN.test(withoutTrailing)) throw new ReadOnlyViolationError(`Schreibendes oder strukturänderndes Schlüsselwort über das Read-only-Binding: ${sql.slice(0, 80)}`);
}

function wrapStatement(statement: D1PreparedStatement): ReadOnlyD1PreparedStatement {
  return {
    bind: (...values) => wrapStatement(statement.bind(...values)),
    first: (column) => statement.first(column as never),
    all: () => statement.all(),
  };
}

const wrappers = new WeakMap<object, ReadOnlyD1Database>();

/**
 * Read-only-Sicht auf ein D1-Binding; `run`/`batch` sind nicht erreichbar. Je Binding-Objekt entsteht genau eine Hülle
 * (Worker-Isolate: dieselbe Hülle über Anfragen hinweg, damit der Contract-Cache greift).
 */
export function createReadOnlyD1(db: D1Database): ReadOnlyD1Database {
  const existing = wrappers.get(db);
  if (existing) return existing;
  const wrapper: ReadOnlyD1Database = {
    readOnly: true,
    prepare(query) {
      assertReadOnlySql(query);
      return wrapStatement(db.prepare(query));
    },
  };
  wrappers.set(db, wrapper);
  return wrapper;
}

export function isReadOnlyD1(value: unknown): value is ReadOnlyD1Database {
  return typeof value === 'object' && value !== null && (value as ReadOnlyD1Database).readOnly === true && typeof (value as ReadOnlyD1Database).prepare === 'function';
}
