import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { assertFeedbackDatabase, insertFeedback, listFeedback, updateFeedback, getFeedback } from '@landesrecht/runtime/feedback.ts';
import { feedbackRemoteTarget, assertFeedbackAdminSql, createRemoteFeedbackDatabase } from '../../scripts/lib/feedback-admin.ts';
const id = 'aabbccdd-1234-4321-8234-aabbccddeeff';
const configuration = (feedbackId = id, legalId = '11223344-1234-4321-8234-112233445566') => ({ d1_databases: [{ binding: 'LANDESRECHT_WEST', database_name: 'landesrecht-west', database_id: legalId }, { binding: 'LANDESRECHT_FEEDBACK', database_name: 'landesrecht-feedback', database_id: feedbackId }], env: { staging: { d1_databases: [{ binding: 'LANDESRECHT_FEEDBACK', database_name: 'landesrecht-feedback-staging', database_id: 'aabbccdd-1234-4321-8234-112233445566' }] } } });
it('pinnt Remoteziele auf getrennte Feedback-D1 und verweigert Rechts-/Umgebungsaliase', () => {
  expect(feedbackRemoteTarget(JSON.stringify(configuration()), 'production')).toEqual({ database: 'landesrecht-feedback', environment: '' });
  expect(feedbackRemoteTarget(JSON.stringify(configuration()), 'staging')).toEqual({ database: 'landesrecht-feedback-staging', environment: 'staging' });
  expect(() => feedbackRemoteTarget(JSON.stringify(configuration(id, id)), 'production')).toThrow();
  expect(() => feedbackRemoteTarget(JSON.stringify(configuration('00000000-0000-4000-8000-000000000101')), 'production')).toThrow();
  const shared = configuration(); shared.env.staging.d1_databases[0]!.database_id = id;
  expect(() => feedbackRemoteTarget(JSON.stringify(shared), 'production')).toThrow();
  expect(() => feedbackRemoteTarget('{}', 'production')).toThrow();
});
it.each(['DROP TABLE feedback_reports', 'UPDATE law_norms SET status = ?', 'SELECT * FROM law_norms', 'SELECT * FROM feedback_reports JOIN law_norms', "SELECT value FROM feedback_meta WHERE key = 'application'; DELETE FROM feedback_reports"] )('verweigert freie oder fremde Adminanweisungen: %s', sql => { expect(() => assertFeedbackAdminSql(sql, true)).toThrow(); });
it('prüft echte SQL-Serialisierung am lokalen SQLite-Adapter ohne irgendeinen Cloudflare-Aufruf', async () => {
  const root = mkdtempSync(join(tmpdir(), 'feedback-admin-test-'));
  const db = await openSqliteD1(':memory:', { migrationsDir: join(process.cwd(), 'data/feedback') });
  const files: string[] = [];
  try {
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    writeFileSync(join(root, 'apps/web/wrangler.jsonc'), JSON.stringify(configuration()));
    const stored = await insertFeedback(db, { submissionId: crypto.randomUUID(), hash: 'fixture', fields: { category: 'other', description: 'Ein rein synthetischer Hinweis.', email: '', page: '' }, context: null, now: new Date().toISOString() });
    const remote = createRemoteFeedbackDatabase(root, 'production', true, (file, target) => {
      expect(target.database).toBe('landesrecht-feedback'); expect(statSync(file).mode & 0o777).toBe(0o600); files.push(file);
      return JSON.stringify([{ success: true, results: db.native.prepare(readFileSync(file, 'utf8')).all() }]);
    });
    await assertFeedbackDatabase(remote);
    expect((await listFeedback(remote, { status: 'new' }))[0]?.id).toBe(stored.id);
    const note = "'); DROP TABLE feedback_reports; -- <script>kein HTML</script>";
    await updateFeedback(remote, { id: stored.id, revision: 0, status: 'triaged', priority: 'P0', note, now: new Date().toISOString() });
    expect((await getFeedback(db, stored.id))?.editorial_note).toBe(note);
    for (const file of files) expect(() => statSync(file)).toThrow();
    expect(() => assertFeedbackAdminSql('DELETE FROM feedback_reports WHERE id = ? AND revision = ? RETURNING id', false)).toThrow();
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

it('lädt SQL erst innerhalb des Wrangler-CLI-Prozesses, ohne Import oder Cloudflare-Aufruf', () => {
  const directory = mkdtempSync(join(tmpdir(), 'feedback-preload-test-'));
  try {
    mkdirSync(join(directory, 'wrangler-dist'));
    const entry = join(directory, 'wrangler-dist/cli.js');
    writeFileSync(entry, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
    const file = join(directory, 'private.sql');
    const sql = "SELECT 'private@example.org';";
    writeFileSync(file, sql, { mode: 0o600 });
    const output = execFileSync(process.execPath, ['--require', join(process.cwd(), 'scripts/lib/feedback-wrangler-preload.cjs'), entry, '--command', '__LANDESRECHT_FEEDBACK_SQL__'], { encoding: 'utf8', env: { ...process.env, LANDESRECHT_FEEDBACK_SQL_FILE: file } });
    expect(JSON.parse(output)).toEqual(['--command', sql]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
