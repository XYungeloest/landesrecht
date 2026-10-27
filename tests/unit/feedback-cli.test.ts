import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { insertFeedback } from '@landesrecht/runtime/feedback.ts';

it('isoliert die lokale Redaktions-CLI, exportiert datensparsam und verlangt Schreibfreigabe', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landesrecht-feedback-'));
  try {
    const path = join(directory, 'feedback.sqlite');
    const run = (...args: string[]) => execFileSync(process.execPath, ['scripts/feedback.ts', ...args, '--db', path], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    const denied = spawnSync(process.execPath, ['scripts/feedback.ts', 'init', '--db', path], { encoding: 'utf8' });
    expect(denied.status).toBe(1); expect(denied.stderr).toContain('--write');
    run('init', '--write'); expect((await stat(path)).mode & 0o777).toBe(0o600);
    const db = await openSqliteD1(path);
    const stored = await insertFeedback(db, { submissionId: crypto.randomUUID(), hash: 'fixture-hash', fields: { category: 'missing', description: 'Die Vorschrift fehlt im Bestand.', email: 'privat@example.org', page: '' }, context: null, now: new Date().toISOString() });
    db.close();
    const exported = JSON.parse(run('export'));
    expect(exported.id).toBe(stored.id); expect(exported.contact_email).toBeUndefined(); expect(exported.editorial_note).toBeUndefined(); expect(exported.submission_id).toBeUndefined();
    expect(JSON.parse(run('show', '--id', stored.id, '--include-contact')).contact_email).toBe('privat@example.org');
    run('update', '--id', stored.id, '--revision', '0', '--status', 'triaged', '--priority', 'P0', '--write');
    expect(JSON.parse(run('list', '--status', 'triaged')).revision).toBe(1);
    const remote = spawnSync(process.execPath, ['scripts/feedback.ts', 'list', '--db', path, '--remote'], { encoding: 'utf8' }); expect(remote.status).toBe(1);
    run('delete', '--id', stored.id, '--revision', '1', '--write'); expect(run('export')).toBe('');
    const legalPath = join(directory, 'legal.sqlite'); const legal = await openSqliteD1(legalPath); legal.native.exec('CREATE TABLE law_norms (id TEXT)'); legal.close();
    const refused = spawnSync(process.execPath, ['scripts/feedback.ts', 'init', '--db', legalPath, '--write'], { encoding: 'utf8' }); expect(refused.status).toBe(1);
    const stillLegal = await openSqliteD1(legalPath, { readOnly: true }); expect(stillLegal.native.prepare("SELECT name FROM sqlite_master WHERE name='feedback_reports'").get()).toBeUndefined(); stillLegal.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
