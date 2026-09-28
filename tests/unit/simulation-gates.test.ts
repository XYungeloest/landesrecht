/**
 * Gates G2 (Baseline-Lock) und G3 (Normidentität additiv) gegen ein temporäres Git-Repository sowie die
 * Lock-Datei `data/simulation/baseline-locks.json` des echten Repositorys.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { additiveHistoryProblems, additiveMetaProblems, checkAdditiveIdentity, checkBaselineLock, gitBlobSha1, readBaselineLocks } from '../../scripts/lib/simulation-gates.ts';

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

let root: string;
let lockCommit: string;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const file = (relative: string): string => join(root, relative);
const write = async (relative: string, value: unknown): Promise<void> => {
  await mkdir(join(root, relative, '..'), { recursive: true });
  await writeFile(file(relative), typeof value === 'string' ? value : jsonText(value), 'utf8');
};

function normFiles(slug: string, title: string): Array<[string, unknown]> {
  const dir = `content/norms/nsh/${slug}`;
  return [
    [`${dir}/meta.json`, { id: `nsh:${slug}`, slug, jurisdiction: 'nsh', title, type: 'gesetz', status: 'in-force', subjects: [], keywords: ['alt'], initialCitation: 'Zitat', predecessor: null, successor: null, relations: [{ type: 'related', target: { slug: 'andere' } }], externalIdentifiers: [], sourceReferences: [] }],
    [`${dir}/history.json`, { initialVersionId: '2023-12-01', entries: [{ date: '2023-12-01', type: 'initial', title: 'Ausgangsfassung', citation: 'Zitat', affectingVersionId: '2023-12-01' }] }],
    [`${dir}/versions/2023-12-01.json`, { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: null, citation: 'Zitat', changeNote: 'Ausgangsfassung', body: [] }],
  ];
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'landesrecht-gates-'));
  for (const [path, value] of [...normFiles('a-nsh', 'Gesetz A'), ...normFiles('b-nsh', 'Gesetz B')]) await write(path, value);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'Baseline');
  lockCommit = git('rev-parse', 'HEAD');
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const restore = async (): Promise<void> => {
  git('checkout', '--', '.');
  git('clean', '-fdq');
};

describe('G2 Baseline-Lock', () => {
  it('unveränderte Baseline besteht; Sim-Fassungen und neue Sim-Normen sind ausgenommen', async () => {
    expect(gitBlobSha1(Buffer.from('hallo\n'))).toBe(execFileSync('git', ['hash-object', '--stdin'], { input: 'hallo\n', encoding: 'utf8' }).trim());
    await write('content/norms/nsh/a-nsh/versions/2026-05-18.json', { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, citation: 'Z', changeNote: 'Sim', body: [] });
    for (const [path, value] of normFiles('neu-nsh', 'Neu')) await write(path.replace('versions/2023-12-01.json', 'versions/2026-01-01.json'), value);
    const report = await checkBaselineLock(root, 'nsh', lockCommit);
    expect(report.problems).toEqual([]);
    expect(report.notes[0]).toContain('2 Baseline-Fassungen');
    expect(report.notes[0]).toContain('2 Norm(en) mit Sim-Fassungen, 1 eigene Sim-Norm(en)');
    await restore();
  });

  it('eine veränderte oder entfernte Baseline verletzt das Lock; Freigaben gelten nur für Normen ohne Sim-Fassungen und nur zur Referenzbasis', async () => {
    const baseline = 'content/norms/nsh/b-nsh/versions/2023-12-01.json';
    await write(baseline, (await readFile(file(baseline), 'utf8')).replace('Ausgangsfassung', 'neu geparst'));
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toEqual([expect.stringMatching(/b-nsh\/versions\/2023-12-01\.json: Baseline-Fassung wurde gegenüber Referenz-Commit .* verändert/u)]);
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: lockCommit.slice(0, 12), description: 'Test', entries: [{ key: 'nsh/b-nsh/2023-12-01', kind: 'regenerated', reason: 'Test' }] });
    const released = await checkBaselineLock(root, 'nsh', lockCommit);
    expect(released.problems).toEqual([]);
    expect(released.notes[0]).toContain('1 dokumentiert freigegeben');
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: '0123456789ab', description: 'Test', entries: [{ key: 'nsh/b-nsh/2023-12-01', kind: 'regenerated', reason: 'Test' }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toHaveLength(1);

    // Norm mit Sim-Fassung: keine Freigabe möglich, auch nicht dokumentiert.
    await write('content/norms/nsh/b-nsh/versions/2026-05-18.json', { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, citation: 'Z', changeNote: 'Sim', body: [] });
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: lockCommit.slice(0, 12), description: 'Test', entries: [{ key: 'nsh/b-nsh/2023-12-01', kind: 'regenerated', reason: 'Test' }] });
    const withSim = await checkBaselineLock(root, 'nsh', lockCommit);
    expect(withSim.problems).toEqual([
      expect.stringMatching(/Freigabe nsh\/b-nsh\/2023-12-01 \(regenerated\) für eine Norm mit Sim-Fassungen ist unzulässig/u),
      expect.stringMatching(/Baseline-Fassung einer Norm mit Sim-Fassungen wurde .* verändert/u),
    ]);
    await restore();
    await rm(file('content/norms/nsh/a-nsh/versions/2023-12-01.json'));
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toEqual([expect.stringMatching(/a-nsh\/versions\/2023-12-01\.json: .* entfernt/u)]);
    await restore();
    expect((await checkBaselineLock(root, 'nsh', 'ffffffffffff')).problems).toEqual([expect.stringMatching(/nicht auflösbar/u)]);
  });
});

describe('G3 Normidentität additiv', () => {
  const simVersion = { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, citation: 'Z', changeNote: 'Sim', body: [] };

  it('erlaubt angehängte Historieneinträge, Beziehungen, Schlagworte, Status und Außerkrafttreten', async () => {
    await write('content/norms/nsh/a-nsh/versions/2026-05-18.json', simVersion);
    const meta = JSON.parse(await readFile(file('content/norms/nsh/a-nsh/meta.json'), 'utf8')) as Record<string, unknown>;
    const history = JSON.parse(await readFile(file('content/norms/nsh/a-nsh/history.json'), 'utf8')) as { entries: unknown[] };
    (meta.relations as unknown[]).push({ type: 'amended-by', target: { slug: 'akt' }, date: '2026-05-18' });
    (meta.keywords as unknown[]).push('neu');
    meta.status = 'repealed';
    meta.expiryDate = '2026-12-31';
    meta.successor = 'Nachfolger';
    meta.successorTarget = { slug: 'nachfolger' };
    history.entries.push({ date: '2026-05-18', type: 'amendment', title: 'Änderung', citation: 'Z', affectingVersionId: '2026-05-18', relatedNorm: { slug: 'akt' } });
    await write('content/norms/nsh/a-nsh/meta.json', meta);
    await write('content/norms/nsh/a-nsh/history.json', history);
    const report = await checkAdditiveIdentity(root, 'nsh', lockCommit);
    expect(report.problems).toEqual([]);
    expect(report.notes[0]).toContain('1 Norm(en) mit Sim-Fassungen');
    // Normen ohne Sim-Fassungen werden hier nicht geprüft (G2 sichert ihre Baseline).
    await restore();
  });

  it('meldet geänderte Baseline-Felder, entfernte oder geänderte Historieneinträge, Beziehungen und Schlagworte', async () => {
    await write('content/norms/nsh/a-nsh/versions/2026-05-18.json', simVersion);
    const meta = JSON.parse(await readFile(file('content/norms/nsh/a-nsh/meta.json'), 'utf8')) as Record<string, unknown>;
    meta.title = 'Gesetz A (umbenannt)';
    meta.relations = [];
    meta.keywords = ['anders'];
    meta.dateNote = 'neu';
    delete meta.initialCitation;
    await write('content/norms/nsh/a-nsh/meta.json', meta);
    const history = { initialVersionId: '2026-05-18', entries: [{ date: '2023-12-01', type: 'initial', title: 'Ausgangsfassung (geändert)', citation: 'Zitat', affectingVersionId: '2023-12-01' }] };
    await write('content/norms/nsh/a-nsh/history.json', history);
    const report = await checkAdditiveIdentity(root, 'nsh', lockCommit);
    expect(report.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/meta\.json\.title: Baseline-Feld wurde geändert/u),
      expect.stringMatching(/meta\.json\.initialCitation: Baseline-Feld wurde entfernt/u),
      expect.stringMatching(/meta\.json\.dateNote: neues Feld ist keine zulässige Sim-Fortschreibung/u),
      expect.stringMatching(/meta\.json\.relations\[0\]: Eintrag .* fehlt/u),
      expect.stringMatching(/meta\.json\.keywords\[0\]: Eintrag .* fehlt/u),
      expect.stringMatching(/history\.json\.initialVersionId: wurde geändert/u),
      expect.stringMatching(/history\.json\.entries\[0\]: Historieneintrag .* fehlt oder wurde geändert/u),
    ]));
    await restore();
  });

  it('reine Funktionen: Reihenfolge alter Historieneinträge bleibt erhalten', () => {
    const entryA = { date: '2023-12-01', type: 'initial' };
    const entryB = { date: '2024-01-01', type: 'notice' };
    expect(additiveHistoryProblems({ initialVersionId: 'x', entries: [entryA, entryB] }, { initialVersionId: 'x', entries: [entryA, { date: '2025-01-01', type: 'amendment' }, entryB] }, 'h')).toEqual([]);
    expect(additiveHistoryProblems({ initialVersionId: 'x', entries: [entryA, entryB] }, { initialVersionId: 'x', entries: [entryB, entryA] }, 'h')).toEqual([expect.stringMatching(/entries\[1\]/u)]);
    expect(additiveMetaProblems({ title: 'a', relations: [] }, { title: 'a', relations: [{ type: 'amends', target: { slug: 'x' } }], expiryDate: '2026-12-31' }, 'm')).toEqual([]);
  });
});

describe('Lock-Datei des Repositorys', () => {
  it('nennt für West den Freeze-Commit und für NSH/BayWü den Baseline-Commit', async () => {
    const locks = await readBaselineLocks(resolveRepositoryRoot());
    expect(locks.west).toBe('ff1b1f43e209390a0dd610e5a06b5c5e07efa27a');
    expect(locks.nsh).toMatch(/^[0-9a-f]{40}$/u);
    expect(locks.baywue).toMatch(/^[0-9a-f]{40}$/u);
    expect(locks.ost).toBeUndefined();
    await write('data/simulation/baseline-locks.json', { sachsen: 'abc' });
    await expect(readBaselineLocks(root)).rejects.toThrow(/unbekannter Schlüssel/u);
    await write('data/simulation/baseline-locks.json', { west: 'nicht-hex' });
    await expect(readBaselineLocks(root)).rejects.toThrow(/Commit-Hash/u);
    await restore();
  });
});
