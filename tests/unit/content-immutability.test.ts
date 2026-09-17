/**
 * Unveränderlichkeit gespeicherter Fassungen: `scripts/check-version-immutability.ts` gegen ein temporäres
 * Git-Repository (keine stille Überschreibung der Ausgangsfassung, Parser-Reimport nur mit dokumentierter
 * Freigabe, spätere Simulationsfassungen unabhängig) und der Schreibpfad des Imports (`writeInitialNorm`), der
 * Simulationsänderungen nie zurücksetzt.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { FileWriter, NORM_BACKUP_PREFIX, NORM_TEMP_PREFIX, writeInitialNorm } from '@landesrecht/importer-recht-nrw/common/persist.ts';

import { listFiles } from '../helpers/recht-nrw-bulk-stub.ts';

const repoRoot = process.cwd();
const SLUG = 'testfixture-schulgesetz-west';
const fixtureNorm = join(repoRoot, 'tests', 'fixtures', 'content', 'norms', 'west', SLUG);
const KEY = `west/${SLUG}/2023-12-01`;
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

let root: string;
let baseCommit: string;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const versionFile = (versionId: string): string => join(root, 'content', 'norms', 'west', SLUG, 'versions', `${versionId}.json`);

function check(...args: string[]): { status: number; output: string } {
  try {
    const stdout = execFileSync('node', [join(repoRoot, 'scripts', 'check-version-immutability.ts'), ...args], { cwd: root, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-immutability-'));
  await mkdir(join(root, 'packages', 'legal-core'), { recursive: true });
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
  // Leere Verzeichnisse überleben `git clean` nur mit Platzhalter (Repository-Root braucht content/ und packages/legal-core).
  await writeFile(join(root, 'packages', 'legal-core', '.gitkeep'), '');
  await writeFile(join(root, 'data', '.gitkeep'), '');
  await mkdir(join(root, 'content', 'norms', 'west', SLUG, 'versions'), { recursive: true });
  for (const file of ['meta.json', 'history.json']) await cp(join(fixtureNorm, file), join(root, 'content', 'norms', 'west', SLUG, file));
  await cp(join(fixtureNorm, 'versions', '2023-12-01.json'), versionFile('2023-12-01'));
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'Ausgangsfassung');
  baseCommit = git('rev-parse', 'HEAD');
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const restore = async (): Promise<void> => {
  git('checkout', '--', '.');
  git('clean', '-fdq');
  await rm(join(root, 'data', 'content-immutability-exceptions.json'), { force: true });
};

describe('content:immutability (Skript gegen temporäres Git-Repository)', () => {
  it('unveränderter Bestand besteht; eine spätere Simulationsfassung ist unabhängig und erlaubt', async () => {
    expect(check()).toMatchObject({ status: 0 });
    expect(check().output).toContain('1 gespeicherte Fassung(en) gegen HEAD: 1 unverändert');
    await writeFile(versionFile('2026-05-01'), JSON.stringify({ versionId: '2026-05-01', simulationValidFrom: '2026-05-01', simulationValidTo: null, citation: 'Änderungsgesetz', changeNote: 'Simulation', body: [] }));
    expect(check()).toMatchObject({ status: 0 });
    await restore();
  });

  it('eine veränderte Ausgangsfassung (z. B. Parser-Reimport) wird ohne Freigabe abgewiesen – mit --allow oder dokumentierter Freigabe zur Basis akzeptiert', async () => {
    const original = await readFile(versionFile('2023-12-01'), 'utf8');
    await writeFile(versionFile('2023-12-01'), original.replace(/\}\s*$/u, ',"changeNote":"neu geparst"}\n'));
    const rejected = check();
    expect(rejected.status).toBe(1);
    expect(rejected.output).toContain(`content/norms/west/${SLUG}/versions/2023-12-01.json: gespeicherte Fassung wurde verändert (Freigabe mit --allow ${KEY})`);

    expect(check('--allow', KEY)).toMatchObject({ status: 0 });
    expect(check('--allow', KEY).output).toContain('1 dokumentiert freigegeben');

    // Dokumentierte Freigabe: gilt nur für genau diesen Basis-Commit.
    const exceptions = (base: string, reason = 'Neuerzeugung aus dem Cache nach Parserkorrekturen (Test).'): string => JSON.stringify({ schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: base, description: 'Test', entries: [{ key: KEY, kind: 'regenerated', reason }] });
    await writeFile(join(root, 'data', 'content-immutability-exceptions.json'), exceptions(baseCommit.slice(0, 12)));
    const released = check();
    expect(released.status).toBe(0);
    expect(released.output).toContain(`Dokumentierte Freigaben für Basis ${baseCommit.slice(0, 12)}: 1`);
    await writeFile(join(root, 'data', 'content-immutability-exceptions.json'), exceptions('0123456789ab'));
    const stale = check();
    expect(stale.status).toBe(1);
    expect(stale.output).toContain('gilt für Basis 0123456789ab');
    expect(stale.output).toContain('nicht angewandt');
    await writeFile(join(root, 'data', 'content-immutability-exceptions.json'), exceptions(baseCommit.slice(0, 12), '  '));
    const unexplained = check();
    expect(unexplained.status).toBe(1);
    expect(unexplained.output).toContain('ohne Begründung');
    await restore();
  });

  it('eine entfernte Ausgangsfassung wird abgewiesen; als Testfixture verschoben gilt sie nicht als entfernt', async () => {
    await rm(versionFile('2023-12-01'));
    const removed = check();
    expect(removed.status).toBe(1);
    expect(removed.output).toContain('gespeicherte Fassung wurde entfernt');
    await mkdir(join(root, 'tests', 'fixtures', 'content', 'norms', 'west', SLUG, 'versions'), { recursive: true });
    await cp(join(fixtureNorm, 'versions', '2023-12-01.json'), join(root, 'tests', 'fixtures', 'content', 'norms', 'west', SLUG, 'versions', '2023-12-01.json'));
    const relocated = check();
    expect(relocated.status).toBe(0);
    expect(relocated.output).toContain('1 als Testfixture verschoben');
    await restore();
  });
});

describe('Importpfad: Bulkimport setzt Simulationsänderungen nicht zurück', () => {
  it('writeInitialNorm bricht ab, wenn eine spätere Fassung existiert; alle Dateien bleiben byteidentisch, keine Temp- oder Sicherungsreste', async () => {
    const base = await mkdtemp(join(tmpdir(), 'landesrecht-initial-norm-'));
    try {
      const normDir = join(base, 'content', 'norms', 'west', SLUG);
      await cp(fixtureNorm, normDir, { recursive: true });
      const before = await Promise.all((await listFiles(normDir)).map(async (file) => [file, await readFile(join(normDir, file), 'utf8')] as const));
      expect(before.map(([file]) => file)).toEqual(['history.json', 'meta.json', 'versions/2023-12-01.json', 'versions/2026-05-01.json']);
      const record = await loadNorm('west', SLUG, base);
      const rewritten = { ...record, versions: [{ ...record.versions[0]!, changeNote: 'Parser neu' }] };
      const writer = new FileWriter(base);
      const blocked = await writeInitialNorm(writer, rewritten, '2023-12-01', { protectVersionedSources: true });
      expect(blocked).toMatchObject({ severity: 'error', code: 'existing-versions' });
      expect(blocked?.message).toContain('2026-05-01.json');
      expect(writer.written).toEqual([]);
      const after = await Promise.all((await listFiles(normDir)).map(async (file) => [file, await readFile(join(normDir, file), 'utf8')] as const));
      expect(after).toEqual(before);
      expect((await listFiles(join(base, 'content', 'norms', 'west'))).filter((file) => file.includes(NORM_TEMP_PREFIX) || file.includes(NORM_BACKUP_PREFIX))).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('ohne fremde Fassungen schreibt writeInitialNorm genau die Ausgangsfassung und lässt eine unabhängige spätere Fassung beim Wiederholen unberührt', async () => {
    const base = await mkdtemp(join(tmpdir(), 'landesrecht-initial-norm-2-'));
    try {
      await mkdir(join(base, 'content', 'norms', 'west'), { recursive: true });
      const record = await loadNorm('west', SLUG, join(repoRoot, 'tests', 'fixtures'));
      const initial = { ...record, versions: [record.versions[0]!] };
      const writer = new FileWriter(base);
      expect(await writeInitialNorm(writer, initial, '2023-12-01')).toBeNull();
      expect(writer.written).toEqual([`content/norms/west/${SLUG}/meta.json`, `content/norms/west/${SLUG}/history.json`, `content/norms/west/${SLUG}/versions/2023-12-01.json`]);
      // Redaktionelle Simulationsfassung kommt hinzu; ein erneuter Initialimport darf sie weder überschreiben noch entfernen.
      const later = join(base, 'content', 'norms', 'west', SLUG, 'versions', '2026-05-01.json');
      await writeFile(later, '{"simulation":true}');
      const again = await writeInitialNorm(new FileWriter(base), initial, '2023-12-01', { protectVersionedSources: true });
      expect(again?.code).toBe('existing-versions');
      expect(await readFile(later, 'utf8')).toBe('{"simulation":true}');
      expect(JSON.parse(await readFile(join(base, 'content', 'norms', 'west', SLUG, 'versions', '2023-12-01.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(record.versions[0])));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
