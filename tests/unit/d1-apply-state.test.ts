/**
 * Einspielprotokoll der D1-Batches (scripts/d1-apply-batches.ts): getrennt je Ziel – ein lokal eingespielter Plan gilt
 * remote nie als eingespielt; Protokoll und Plan sind über SHA-256 aneinander gebunden. Reine Planungsfunktion plus
 * Dry-run des Skripts gegen ein temporäres Repository (kein Wrangler, kein Netz).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { D1_DATABASE_NAMES } from '@landesrecht/runtime/bindings.ts';
import { applyStateFileName, APPLY_STATE_FILES, emptyApplyState, isKnownD1Database, planApplyBatches, type ApplyState, type SqlBatchPlan } from '@landesrecht/runtime/sql-batches.ts';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const FILES = { '0001.sql': '-- eins\nINSERT INTO t VALUES (1);\n', '0002.sql': '-- zwei\nINSERT INTO t VALUES (2);\n', '0003.sql': '-- drei\nINSERT INTO t VALUES (3);\n' } as const;

function plan(overrides: Partial<SqlBatchPlan> = {}): SqlBatchPlan {
  const files = Object.entries(FILES).map(([name, sql], index) => ({ index: index + 1, name, statements: 1, bytes: sql.length, sha256: sha(sql), groups: 1, firstGroup: `norm-${index + 1}`, lastGroup: `norm-${index + 1}` }));
  return { schemaVersion: 'landesrecht-d1-batches/1', jurisdiction: 'west', database: 'landesrecht-west', mode: 'full', resumable: true, limits: { maxStatements: 1500, maxBytes: 6_000_000, maxStatementBytes: 100_000 }, files, totals: { statements: 3, bytes: 90, groups: 3, norms: 3 }, warnings: [], errors: [], ...overrides };
}
const digests = (): Map<string, string> => new Map(Object.entries(FILES).map(([name, sql]) => [name, sha(sql)]));
const applied = (target: ApplyState['target'], names: readonly string[]): ApplyState => ({ target, applied: names.map((name) => ({ name, sha256: sha(FILES[name as keyof typeof FILES]), appliedAt: '2026-09-16T16:17:03.266Z' })) });

describe('D1-Batches: Einspielprotokoll je Ziel', () => {
  it('lokal ≠ remote: ein vollständig lokal eingespielter Plan ist remote noch vollständig offen', () => {
    const local = planApplyBatches({ plan: plan(), target: 'local', state: applied('local', ['0001.sql', '0002.sql', '0003.sql']), digests: digests(), resume: false });
    expect(local.errors).toEqual([]);
    expect(local.pending).toEqual([]);
    // Remote liest sein eigenes (fehlendes) Protokoll: alles offen, kein --resume nötig.
    const remote = planApplyBatches({ plan: plan(), target: 'remote', state: undefined, digests: digests(), resume: false });
    expect(remote.errors).toEqual([]);
    expect(remote.pending.map((file) => file.name)).toEqual(['0001.sql', '0002.sql', '0003.sql']);
    expect(remote.state).toEqual(emptyApplyState('remote'));
    // Ein lokales Protokoll unter dem Remote-Ziel wird zurückgewiesen, statt Dateien als eingespielt zu werten.
    const crossed = planApplyBatches({ plan: plan(), target: 'remote', state: applied('local', ['0001.sql', '0002.sql', '0003.sql']), digests: digests(), resume: true });
    expect(crossed.errors).toEqual(['apply-state.json: Protokoll gehört zum Ziel „local“, nicht „remote“ – Datei umbenennen oder entfernen']);
    expect(crossed.pending.map((file) => file.name)).toEqual([]);
    expect(APPLY_STATE_FILES).toEqual({ remote: 'apply-state.json', local: 'apply-state.local.json' });
    expect(applyStateFileName('local')).not.toBe(applyStateFileName('remote'));
  });

  it('setzt nur mit --resume fort und nur bei passenden Hashes; abweichende Dateien oder fremde Protokolle sind Fehler', () => {
    const partial = applied('remote', ['0001.sql']);
    expect(planApplyBatches({ plan: plan(), target: 'remote', state: partial, digests: digests(), resume: false }).errors).toEqual(['Es wurden bereits Dateien eingespielt – mit --resume fortsetzen.']);
    const resumed = planApplyBatches({ plan: plan(), target: 'remote', state: partial, digests: digests(), resume: true });
    expect(resumed.errors).toEqual([]);
    expect(resumed.pending.map((file) => file.name)).toEqual(['0002.sql', '0003.sql']);

    const tampered = new Map(digests());
    tampered.set('0002.sql', sha('INSERT INTO t VALUES (99);'));
    expect(planApplyBatches({ plan: plan(), target: 'remote', state: partial, digests: tampered, resume: true }).errors).toEqual(['0002.sql: SHA-256 weicht vom Plan ab – Plan neu erzeugen']);
    const missing = new Map(digests());
    missing.delete('0003.sql');
    expect(planApplyBatches({ plan: plan(), target: 'remote', state: undefined, digests: missing, resume: false }).errors).toEqual(['0003.sql: Datei fehlt – Plan neu erzeugen']);
    const foreignState: ApplyState = { target: 'remote', applied: [{ name: '0001.sql', sha256: 'f'.repeat(64), appliedAt: '2026-09-16T00:00:00.000Z' }] };
    expect(planApplyBatches({ plan: plan(), target: 'remote', state: foreignState, digests: digests(), resume: true }).errors).toEqual(['apply-state.json passt nicht zum Plan (0001.sql); Plan und Protokoll gehören nicht zusammen']);
    expect(planApplyBatches({ plan: plan({ errors: ['x: zu groß'] }), target: 'remote', state: undefined, digests: digests(), resume: false }).errors).toEqual(['Plan enthält Fehler: x: zu groß']);
  });

  it('kennt nur die Datenbanken der vier Jurisdiktionen und ihre Staging-Varianten', () => {
    const names = Object.values(D1_DATABASE_NAMES);
    for (const name of names) {
      expect(isKnownD1Database(name, names)).toBe(true);
      expect(isKnownD1Database(`${name}-staging`, names)).toBe(true);
    }
    for (const unknown of ['landesrecht', 'landesrecht-foo', 'landesrecht-west-prod', 'west', 'landesrecht-west-staging-2']) expect(isKnownD1Database(unknown, names)).toBe(false);
  });
});

describe('scripts/d1-apply-batches.ts (Dry-run gegen ein temporäres Repository)', () => {
  const repoRoot = process.cwd();
  let root: string;
  let directory: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'landesrecht-d1-apply-'));
    directory = join(root, 'data', 'runtime', 'd1-batches', 'landesrecht-west');
    await mkdir(directory, { recursive: true });
    await mkdir(join(root, 'content'), { recursive: true });
    await mkdir(join(root, 'packages', 'legal-core'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
    for (const [name, sql] of Object.entries(FILES)) await writeFile(join(directory, name), sql);
    await writeFile(join(directory, 'plan.json'), JSON.stringify(plan()));
    await writeFile(join(directory, 'state.json'), '{}');
    await writeFile(join(directory, 'apply-state.local.json'), JSON.stringify(applied('local', ['0001.sql', '0002.sql', '0003.sql'])));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const run = (...args: string[]): { status: number; stdout: string; stderr: string } => {
    try {
      const stdout = execFileSync('node', [join(repoRoot, 'scripts', 'd1-apply-batches.ts'), ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stdout, stderr: '' };
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string };
      return { status: failure.status, stdout: String(failure.stdout), stderr: String(failure.stderr) };
    }
  };

  it('remote sieht alle Dateien als offen, obwohl sie lokal eingespielt sind; lokal sieht nichts offen; unbekannte Datenbanken werden abgelehnt', async () => {
    const remote = run('--database', 'landesrecht-west');
    expect(remote.status).toBe(0);
    expect(remote.stdout).toContain('bereits eingespielt 0, offen 3');
    expect(remote.stdout).toContain('Dry-run. Einspielen: node scripts/d1-apply-batches.ts --database landesrecht-west --execute --confirm-remote landesrecht-west');
    const local = run('--database', 'landesrecht-west', '--local');
    expect(local.status).toBe(0);
    expect(local.stdout).toContain('bereits eingespielt 3, offen 0');
    // Nichts wurde geschrieben: kein Remote-Protokoll entstanden.
    await expect(readFile(join(directory, 'apply-state.json'), 'utf8')).rejects.toThrow();
    const unknown = run('--database', 'landesrecht-foo');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('--database landesrecht-<jur>[-staging] ist Pflicht');
    // Remote-Einspielen ohne Bestätigung wird verweigert, bevor Wrangler läuft.
    const unconfirmed = run('--database', 'landesrecht-west', '--execute');
    expect(unconfirmed.status).toBe(1);
    expect(unconfirmed.stderr).toContain('--confirm-remote landesrecht-west');
  });

  it('ein lokales Protokoll unter dem Remote-Namen wird als Fehler gemeldet', async () => {
    await writeFile(join(directory, 'apply-state.json'), JSON.stringify(applied('local', ['0001.sql'])));
    try {
      const crossed = run('--database', 'landesrecht-west', '--resume');
      expect(crossed.status).toBe(1);
      expect(crossed.stderr).toContain('gehört zum Ziel „local“, nicht „remote“');
    } finally {
      await rm(join(directory, 'apply-state.json'), { force: true });
    }
  });
});
