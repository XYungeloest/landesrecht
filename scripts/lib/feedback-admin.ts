/** Autorisierte Wrangler-CLI, fest auf die gesonderte Feedback-D1 begrenzt. Kein öffentliches API. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfigFileTextToJson } from 'typescript';
import { FEEDBACK_D1_BINDING, FEEDBACK_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { FEEDBACK_PUBLIC_COLUMNS } from '@landesrecht/runtime/feedback.ts';
import { assertReadOnlySql } from '@landesrecht/runtime/read-only-d1.ts';
import { renderStatement } from '@landesrecht/runtime/projection.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '@landesrecht/runtime/d1-types.ts';

export type FeedbackRemoteTarget = 'staging' | 'production';
export function feedbackRemoteTarget(configText: string, target: FeedbackRemoteTarget): { database: string; environment: string } {
  if (target !== 'staging' && target !== 'production') throw new Error('Unbekanntes Feedback-Ziel');
  const parsed = parseConfigFileTextToJson('wrangler.jsonc', configText);
  if (parsed.error) throw new Error('Worker-Konfiguration nicht lesbar');
  const config = parsed.config as { d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>; env?: Record<string, { d1_databases?: Array<{ binding: string; database_name: string; database_id: string }> }> };
  const bindings = target === 'production' ? config.d1_databases : config.env?.staging?.d1_databases;
  const feedback = bindings?.filter(binding => binding.binding === FEEDBACK_D1_BINDING);
  const database = FEEDBACK_DATABASE_NAMES[target];
  if (feedback?.length !== 1 || feedback[0]!.database_name !== database || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(feedback[0]!.database_id) || feedback[0]!.database_id.startsWith('00000000-')) throw new Error('Separate Feedback-D1 am Ziel nicht vollständig konfiguriert');
  const id = feedback[0]!.database_id;
  const allBindings = [...(config.d1_databases ?? []), ...Object.values(config.env ?? {}).flatMap(environment => environment.d1_databases ?? [])];
  if (allBindings.some(binding => binding.binding !== FEEDBACK_D1_BINDING && binding.database_id === id)) throw new Error('Feedback-D1 darf keine Rechtsdatenbank sein');
  const otherTarget = target === 'production' ? config.env?.staging?.d1_databases : config.d1_databases;
  if (otherTarget?.some(binding => binding.binding === FEEDBACK_D1_BINDING && binding.database_id === id)) throw new Error('Feedback-Produktion und Staging müssen getrennt sein');
  return { database, environment: target === 'production' ? '' : 'staging' };
}
export function assertFeedbackAdminSql(sql: string, writable: boolean): void {
  if (/^SELECT\b/iu.test(sql)) {
    assertReadOnlySql(sql);
    const selects = [
      "SELECT value FROM feedback_meta WHERE key = 'application'",
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('law_norms','law_versions') LIMIT 1",
      'SELECT id, request_hash FROM feedback_reports WHERE submission_id = ?',
      `SELECT ${FEEDBACK_PUBLIC_COLUMNS} FROM feedback_reports WHERE id = ?`,
      ...['', 'WHERE status = ?', 'WHERE priority = ?', 'WHERE status = ? AND priority = ?'].map(where => `SELECT ${FEEDBACK_PUBLIC_COLUMNS} FROM feedback_reports ${where} ORDER BY priority, created_at, id LIMIT ? OFFSET ?`),
    ];
    if (!selects.includes(sql)) throw new Error('Keine freigegebene Feedback-Abfrage');
    return;
  }
  if (writable && (sql === 'UPDATE feedback_reports SET status = ?, priority = ?, editorial_note = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? RETURNING id' || sql === 'DELETE FROM feedback_reports WHERE id = ? AND revision = ? RETURNING id')) return;
  throw new Error('Unzulässige Feedback-Adminanweisung');
}
export type FeedbackAdminExecutor = (file: string, target: { database: string; environment: string }) => string;
export function createRemoteFeedbackDatabase(root: string, target: FeedbackRemoteTarget, writable: boolean, executor?: FeedbackAdminExecutor): D1Database {
  const destination = feedbackRemoteTarget(readFileSync(join(root, 'apps/web/wrangler.jsonc'), 'utf8'), target);
  const execute: FeedbackAdminExecutor = executor ?? ((file, remote) => execFileSync('npx', ['wrangler', 'd1', 'execute', remote.database, '--remote', '--config', 'wrangler.jsonc', '--env', remote.environment, '--json', '--command', '__LANDESRECHT_FEEDBACK_SQL__'], { cwd: join(root, 'apps/web'), encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(file, '..', 'wrangler-logs'), LANDESRECHT_FEEDBACK_SQL_FILE: file, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(join(root, 'scripts/lib/feedback-wrangler-preload.cjs'))}` } }));
  const run = (sql: string, params: unknown[]): D1Result => {
    assertFeedbackAdminSql(sql, writable);
    const directory = mkdtempSync(join(tmpdir(), 'landesrecht-feedback-admin-'));
    try {
      const file = join(directory, 'query.sql');
      // Keine Meldungs-/Kontaktdaten im Prozessargument; vorhandener SQL-Renderer escaped alle Parameter.
      writeFileSync(file, renderStatement({ sql, params }), { encoding: 'utf8', mode: 0o600 });
      const output = execute(file, destination);
      const report = JSON.parse(output.slice(output.indexOf('['))) as D1Result[];
      if (report.length !== 1 || report[0]?.success !== true || !Array.isArray(report[0].results)) throw new Error('Unbestätigte Datenbankantwort');
      return report[0];
    } catch { throw new Error('Feedback-Adminabfrage fehlgeschlagen; keine Änderung bestätigt'); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  };
  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values) => prepare(sql, values),
    async first<T>(column?: string): Promise<T | null> { const row = run(sql, params).results[0]; return row ? (column ? row[column] as T : row as T) : null; },
    async all<T>(): Promise<D1Result<T>> { return run(sql, params) as D1Result<T>; },
    async run() { return run(sql, params); },
  });
  return { prepare, async batch() { throw new Error('Keine freien Feedback-Adminbatches'); } };
}
