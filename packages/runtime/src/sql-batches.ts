/**
 * Aufteilung eines Projektionsplans in SQL-Dateien für `wrangler d1 execute --remote --file` (nur Node).
 *
 * Remote-D1 wird nie mit einer einzigen unkontrollierten Datei beschickt:
 *   - höchstens 1 500 Anweisungen bzw. 6 MB je Datei (Erfahrungswerte aus OstRecht); eine Norm wird nie auf
 *     zwei Dateien verteilt – eine einzelne übergroße Norm erhält eine eigene Datei und eine Warnung
 *   - Anweisungen über 100 KB (D1-Grenze der Anweisungslänge) werden als Fehler gemeldet
 *   - D1 akzeptiert in Dateien keine eigenen Transaktionen; Sicherheit entsteht durch Entwertung der
 *     Projektionsidentität zu Beginn, Basisprüfung (inkrementell) und idempotente Dateien: im
 *     `resumable`-Modus beginnt jede Normgruppe mit dem Löschen dieser Norm, sodass eine abgebrochene
 *     Datei gefahrlos erneut ausgeführt werden kann
 *   - Resume über ein Protokoll der angewandten Dateien (`scripts/d1-apply-batches.ts`)
 */
import { createHash } from 'node:crypto';

import { deleteNormQueries, normId, renderStatement, type PlanQuery, type ProjectionPlan } from './projection.ts';

export const SQL_BATCH_SCHEMA = 'landesrecht-d1-batches/1' as const;
export const DEFAULT_SQL_FILE_STATEMENTS = 1_500;
export const DEFAULT_SQL_FILE_BYTES = 6_000_000;
export const D1_MAX_STATEMENT_BYTES = 100_000;
export const SQL_TOTAL_WARNING_BYTES = 500_000_000;

export interface SqlBatchFileMeta {
  index: number;
  name: string;
  statements: number;
  bytes: number;
  sha256: string;
  groups: number;
  firstGroup: string;
  lastGroup: string;
}

export interface SqlBatchPlan {
  schemaVersion: typeof SQL_BATCH_SCHEMA;
  jurisdiction: string;
  database: string;
  mode: 'full' | 'incremental';
  resumable: boolean;
  limits: { maxStatements: number; maxBytes: number; maxStatementBytes: number };
  files: SqlBatchFileMeta[];
  totals: { statements: number; bytes: number; groups: number; norms: number };
  warnings: string[];
  errors: string[];
}

const encoder = new TextEncoder();

export function splitPlanIntoSqlFiles(plan: ProjectionPlan, options: { database: string; maxStatements?: number; maxBytes?: number; resumable?: boolean }): { plan: SqlBatchPlan; files: Array<{ name: string; sql: string }> } {
  const maxStatements = options.maxStatements ?? DEFAULT_SQL_FILE_STATEMENTS;
  const maxBytes = options.maxBytes ?? DEFAULT_SQL_FILE_BYTES;
  const resumable = options.resumable ?? true;
  const warnings: string[] = [];
  const errors: string[] = [];
  const files: Array<{ name: string; sql: string; meta: SqlBatchFileMeta }> = [];
  let current: { statements: string[]; bytes: number; groups: string[] } = { statements: [], bytes: 0, groups: [] };
  let totalStatements = 0;
  let totalBytes = 0;
  let norms = 0;

  const flush = (): void => {
    if (current.statements.length === 0) return;
    const index = files.length + 1;
    const name = `${String(index).padStart(4, '0')}.sql`;
    const sql = `-- landesrecht D1 ${options.database} ${plan.full ? 'full' : 'incremental'} Datei ${index}: ${current.groups[0]} … ${current.groups[current.groups.length - 1]}\n${current.statements.join('\n')}\n`;
    files.push({ name, sql, meta: { index, name, statements: current.statements.length, bytes: encoder.encode(sql).byteLength, sha256: createHash('sha256').update(sql).digest('hex'), groups: current.groups.length, firstGroup: current.groups[0]!, lastGroup: current.groups[current.groups.length - 1]! } });
    current = { statements: [], bytes: 0, groups: [] };
  };

  for (const group of plan.groups) {
    const isNorm = !group.key.startsWith('(');
    if (isNorm) norms += 1;
    const queries: PlanQuery[] = resumable && plan.full && isNorm ? [...deleteNormQueries(normId(plan.jurisdiction, group.key)), ...group.queries] : group.queries;
    const rendered = queries.map(renderStatement);
    let groupBytes = 0;
    for (const statement of rendered) {
      const bytes = encoder.encode(statement).byteLength + 1;
      groupBytes += bytes;
      if (bytes > D1_MAX_STATEMENT_BYTES) errors.push(`${group.key}: Anweisung mit ${bytes} Bytes überschreitet die D1-Grenze von ${D1_MAX_STATEMENT_BYTES} Bytes`);
    }
    if (current.statements.length > 0 && (current.statements.length + rendered.length > maxStatements || current.bytes + groupBytes > maxBytes)) flush();
    if (rendered.length > maxStatements || groupBytes > maxBytes) warnings.push(`${group.key}: ${rendered.length} Anweisungen / ${groupBytes} Bytes überschreiten die Dateigrenze; eigene Datei`);
    current.statements.push(...rendered);
    current.bytes += groupBytes;
    current.groups.push(group.key);
    totalStatements += rendered.length;
    totalBytes += groupBytes;
    if (rendered.length > maxStatements || groupBytes > maxBytes) flush();
  }
  flush();
  if (totalBytes > SQL_TOTAL_WARNING_BYTES) warnings.push(`Gesamtumfang ${Math.round(totalBytes / 1_000_000)} MB: Einspielen in mehreren Sitzungen mit Resume planen`);
  return {
    plan: {
      schemaVersion: SQL_BATCH_SCHEMA,
      jurisdiction: plan.jurisdiction,
      database: options.database,
      mode: plan.full ? 'full' : 'incremental',
      resumable,
      limits: { maxStatements, maxBytes, maxStatementBytes: D1_MAX_STATEMENT_BYTES },
      files: files.map((file) => file.meta),
      totals: { statements: totalStatements, bytes: totalBytes, groups: plan.groups.length, norms },
      warnings,
      errors,
    },
    files: files.map(({ name, sql }) => ({ name, sql })),
  };
}
