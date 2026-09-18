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

import { D1_MAX_STATEMENT_BYTES, deleteNormQueries, normId, renderStatement, splitOversizedInsert, type PlanQuery, type ProjectionPlan } from './projection.ts';

export { D1_MAX_STATEMENT_BYTES, SPLITTABLE_TABLE_KEYS, splitOversizedInsert } from './projection.ts';

export const SQL_BATCH_SCHEMA = 'landesrecht-d1-batches/1' as const;
export const DEFAULT_SQL_FILE_STATEMENTS = 1_500;
export const DEFAULT_SQL_FILE_BYTES = 6_000_000;
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

/* ------------------------------------------------------------------------------------------ */
/* Einspielprotokoll (scripts/d1-apply-batches.ts): getrennt je Ziel, an die Plan-Hashes gebunden.  */

export type ApplyTarget = 'remote' | 'local';
export const APPLY_STATE_FILES: Readonly<Record<ApplyTarget, string>> = { remote: 'apply-state.json', local: 'apply-state.local.json' };

export interface ApplyStateEntry {
  name: string;
  sha256: string;
  appliedAt: string;
}

export interface ApplyState {
  target: ApplyTarget;
  applied: ApplyStateEntry[];
}

export function emptyApplyState(target: ApplyTarget): ApplyState {
  return { target, applied: [] };
}

export function applyStateFileName(target: ApplyTarget): string {
  return APPLY_STATE_FILES[target];
}

/** Datenbanknamen, gegen die Batches eingespielt werden dürfen: `landesrecht-<jur>` und deren Staging-Variante. */
export function isKnownD1Database(database: string, names: readonly string[]): boolean {
  return names.some((name) => database === name || database === `${name}-staging`);
}

export interface ApplyPlanInput {
  plan: SqlBatchPlan;
  target: ApplyTarget;
  /** Gespeichertes Protokoll des Ziels (fehlt beim ersten Lauf). */
  state: ApplyState | undefined;
  /** SHA-256 der vorliegenden SQL-Dateien je Name. */
  digests: ReadonlyMap<string, string>;
  resume: boolean;
}

export interface ApplyPlanResult {
  state: ApplyState;
  pending: SqlBatchFileMeta[];
  errors: string[];
}

/**
 * Bestimmt die noch einzuspielenden Dateien eines Plans für ein Ziel. Ein Protokoll zählt nur für sein eigenes Ziel
 * (ein lokal eingespielter Plan gilt remote nie als eingespielt) und nur, solange seine Hashes zum Plan passen.
 */
export function planApplyBatches(input: ApplyPlanInput): ApplyPlanResult {
  const errors: string[] = [];
  const state = input.state ?? emptyApplyState(input.target);
  if (state.target !== input.target) errors.push(`${applyStateFileName(input.target)}: Protokoll gehört zum Ziel „${state.target}“, nicht „${input.target}“ – Datei umbenennen oder entfernen`);
  for (const file of input.plan.files) {
    const digest = input.digests.get(file.name);
    if (digest === undefined) errors.push(`${file.name}: Datei fehlt – Plan neu erzeugen`);
    else if (digest !== file.sha256) errors.push(`${file.name}: SHA-256 weicht vom Plan ab – Plan neu erzeugen`);
  }
  if (input.plan.errors.length > 0) errors.push(`Plan enthält Fehler: ${input.plan.errors.join('; ')}`);
  for (const entry of state.applied) {
    const file = input.plan.files.find((candidate) => candidate.name === entry.name);
    if (!file || file.sha256 !== entry.sha256) errors.push(`${applyStateFileName(input.target)} passt nicht zum Plan (${entry.name}); Plan und Protokoll gehören nicht zusammen`);
  }
  const appliedNames = new Set(state.applied.map((entry) => entry.name));
  const pending = input.plan.files.filter((file) => !appliedNames.has(file.name));
  if (errors.length === 0 && pending.length > 0 && state.applied.length > 0 && !input.resume) errors.push('Es wurden bereits Dateien eingespielt – mit --resume fortsetzen.');
  return { state, pending, errors };
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
    const base: PlanQuery[] = resumable && plan.full && isNorm ? [...deleteNormQueries(normId(plan.jurisdiction, group.key)), ...group.queries] : group.queries;
    const queries: PlanQuery[] = base.flatMap((query) => splitOversizedInsert(query));
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
