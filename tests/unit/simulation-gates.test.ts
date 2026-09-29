/**
 * Gates G2 (Baseline-Lock) und G3 (Normidentität additiv) gegen ein temporäres Git-Repository sowie die
 * Lock-Datei `data/simulation/baseline-locks.json` des echten Repositorys.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

import { parseBaselineLockFile } from '@landesrecht/importer-simulation/common/baseline-locks.ts';

import { additiveHistoryProblems, additiveMetaProblems, checkAdditiveIdentity, checkBaselineLock, checkBaselineSeeds, checkEvidenceHierarchy, evidenceLevel, gitBlobSha1, readBaselineLocks } from '../../scripts/lib/simulation-gates.ts';

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

describe('G2 im Freeze-Land (West, NSH seit 2026-09-29)', () => {
  it('eine neue Baseline-Norm nach dem Freeze-Commit verletzt das Lock, außer mit Freigabe kind "added" zum Freeze-Commit', async () => {
    for (const [path, value] of normFiles('c-nsh', 'Gesetz C')) await write(path, value);
    // Ohne Freeze (Referenz-Commit): eine spätere Baseline-Norm ist zulässig.
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toEqual([]);
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toEqual([expect.stringMatching(/c-nsh.*neue Baseline-Fassung nach dem Freeze-Commit/u)]);
    // Freigabe zu einem anderen Commit gilt nicht; zum Freeze-Commit schon.
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: '0123456789ab', description: 'alt', entries: [{ key: 'nsh/c-nsh/2023-12-01', kind: 'added', reason: 'Test' }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toHaveLength(1);
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: lockCommit.slice(0, 12), description: 'Freeze-Freigabe', entries: [{ key: 'nsh/c-nsh/2023-12-01', kind: 'added', reason: 'neue Primärevidenz' }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toEqual([]);
    // „added“ gibt keine Änderung einer bestehenden Baseline frei.
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: lockCommit.slice(0, 12), description: 'x', entries: [{ key: 'nsh/b-nsh/2023-12-01', kind: 'added', reason: 'falsch' }, { key: 'nsh/c-nsh/2023-12-01', kind: 'added', reason: 'ok' }] });
    const baseline = 'content/norms/nsh/b-nsh/versions/2023-12-01.json';
    await write(baseline, (await readFile(file(baseline), 'utf8')).replace('Ausgangsfassung', 'still geändert'));
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toEqual([expect.stringMatching(/b-nsh.*verändert/u)]);
    await restore();
  });

  it('ältere Freigabeblöcke (anderer baseCommit) geben nichts frei und sperren auch nichts', async () => {
    await write('content/norms/nsh/a-nsh/versions/2026-05-18.json', { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, citation: 'Z', changeNote: 'Sim', body: [] });
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: '0123456789ab', description: 'Lauf 9', entries: [{ key: 'nsh/a-nsh/2023-12-01', kind: 'regenerated', reason: 'historisch' }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toEqual([]);
    // Ein geltender Block mit Freigabe für eine fortgeschriebene Norm bleibt unzulässig.
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: lockCommit.slice(0, 12), description: 'x', entries: [{ key: 'nsh/a-nsh/2023-12-01', kind: 'regenerated', reason: 'x' }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { freeze: true })).problems).toEqual([expect.stringMatching(/Norm mit Sim-Fassungen ist unzulässig/u)]);
    await restore();
  });
});

describe('Lock-Datei des Repositorys', () => {
  it('nennt für West und NSH den Freeze-Commit und für BayWü den Baseline-Commit', async () => {
    const locks = await readBaselineLocks(resolveRepositoryRoot());
    expect(locks.west).toBe('ff1b1f43e209390a0dd610e5a06b5c5e07efa27a');
    expect(locks.nsh).toBe('eeeca2cdc5596a602db4332e59a4b252df2b8ea0');
    const file = parseBaselineLockFile(JSON.parse(await readFile(join(resolveRepositoryRoot(), 'data/simulation/baseline-locks.json'), 'utf8')));
    expect(file.jurisdictions.west?.freeze).toBe(true);
    expect(file.jurisdictions.nsh?.freeze).toBe(true);
    expect(file.jurisdictions.baywue?.freeze).toBe(false);
    expect(locks.baywue).toMatch(/^[0-9a-f]{40}$/u);
    expect(locks.ost).toBeUndefined();
    await write('data/simulation/baseline-locks.json', { sachsen: 'abc' });
    await expect(readBaselineLocks(root)).rejects.toThrow(/unbekannter Schlüssel/u);
    await write('data/simulation/baseline-locks.json', { west: 'nicht-hex' });
    await expect(readBaselineLocks(root)).rejects.toThrow(/Commit-Hash/u);
    await restore();
  });
});

describe('Baseline-Seeds (Lock-Schema 2)', () => {
  const seed = (slug: string, sha: string, extra: Record<string, unknown> = {}) => ({ jurisdiction: 'nsh', slug, baselineVersionId: '2023-12-01', sha256: sha, acceptedAt: '2026-09-29', decision: 'Test', ...extra });
  const sha256File = async (relative: string) => createHash('sha256').update(await readFile(file(relative))).digest('hex');
  const simVersion = { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, citation: 'Z', changeNote: 'Sim', body: [] };

  it('liest Schema 1 und 2 und lehnt unvollständige Seeds ab', () => {
    expect(parseBaselineLockFile({ west: 'ff1b1f43e209' })).toMatchObject({ schemaVersion: 1, jurisdictions: { west: { commit: 'ff1b1f43e209', freeze: false } }, seeds: [] });
    const v2 = parseBaselineLockFile({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: { nsh: { commit: 'abcdef1' } }, seeds: [seed('a-nsh', 'a'.repeat(64))] });
    expect(v2.seeds[0]).toMatchObject({ slug: 'a-nsh', sha256: 'a'.repeat(64) });
    expect(() => parseBaselineLockFile({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: {}, seeds: [{ ...seed('a-nsh', 'a'.repeat(64)), decision: ' ' }] })).toThrow(/Entscheidungsreferenz/u);
    expect(() => parseBaselineLockFile({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: {}, seeds: [seed('a-nsh', 'a'.repeat(64)), seed('a-nsh', 'b'.repeat(64))] })).toThrow(/doppelt/u);
    expect(() => parseBaselineLockFile({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: {}, seeds: [seed('a-nsh', 'kurz')] })).toThrow(/SHA-256/u);
  });

  it('verlangt für fortgeschriebene Normen einen Seed, ersetzt mit ihm den Commit-Vergleich und prüft Hash und sourceCommit', async () => {
    await write('content/norms/nsh/a-nsh/versions/2026-05-18.json', simVersion);
    expect((await checkBaselineSeeds(root, 'nsh', lockCommit, new Map())).problems).toEqual([expect.stringMatching(/nsh\/a-nsh ohne akzeptierten Baseline-Seed/u)]);
    // Freigegebene Neuerzeugung der Baseline einer fortgeschriebenen Norm: nur mit neuem Seed zulässig.
    const baseline = 'content/norms/nsh/a-nsh/versions/2023-12-01.json';
    await write(baseline, (await readFile(file(baseline), 'utf8')).replace('Ausgangsfassung', 'neu geparst'));
    const seeds = new Map([['a-nsh', seed('a-nsh', await sha256File(baseline)) as never]]);
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toEqual([expect.stringMatching(/Norm mit Sim-Fassungen wurde .* verändert/u)]);
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { seeds })).problems).toEqual([]);
    expect((await checkBaselineSeeds(root, 'nsh', lockCommit, seeds)).problems).toEqual([]);
    // Freeze: der Commit gilt auch für Normen mit Seed; der Seed muss dem Freeze-Commit entsprechen.
    expect((await checkBaselineLock(root, 'nsh', lockCommit, { seeds, freeze: true })).problems).toHaveLength(1);
    expect((await checkBaselineSeeds(root, 'nsh', lockCommit, seeds, { freeze: true })).problems).toEqual([expect.stringMatching(/Freeze-Commit .* weicht vom Seed ab/u)]);
    // sourceCommit muss denselben Inhalt enthalten.
    const withSource = new Map([['a-nsh', seed('a-nsh', await sha256File(baseline), { sourceCommit: lockCommit }) as never]]);
    expect((await checkBaselineSeeds(root, 'nsh', lockCommit, withSource)).problems).toEqual([expect.stringMatching(/sourceCommit .* weicht vom Seed ab/u)]);
    // Abweichender Inhalt gegenüber dem Seed.
    await write(baseline, (await readFile(file(baseline), 'utf8')).replace('neu geparst', 'nochmals'));
    expect((await checkBaselineSeeds(root, 'nsh', lockCommit, seeds)).problems).toEqual([expect.stringMatching(/weicht vom akzeptierten Seed .* ab/u)]);
    await restore();
  });

  it('wendet zusätzliche Freigabeblöcke (releases) mit eigenem baseCommit an', async () => {
    const baseline = 'content/norms/nsh/b-nsh/versions/2023-12-01.json';
    await write(baseline, (await readFile(file(baseline), 'utf8')).replace('Ausgangsfassung', 'neu geparst'));
    await write('data/content-immutability-exceptions.json', { schemaVersion: 'landesrecht-immutability-exceptions/1', baseCommit: '0123456789ab', description: 'alt', entries: [], releases: [{ baseCommit: lockCommit.slice(0, 12), description: 'Test', entries: [{ key: 'nsh/b-nsh/2023-12-01', kind: 'regenerated', reason: 'Test' }] }] });
    expect((await checkBaselineLock(root, 'nsh', lockCommit)).problems).toEqual([]);
    await restore();
  });
});

describe('G11 Evidenzhierarchie', () => {
  const WIKI = 'e'.repeat(64);
  const ORIGINAL = 'f'.repeat(64);
  const reference = (kind: string, sha: string, sourceRole?: string) => ({ kind, system: 'simulation', label: 'x', availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: `nsh/simulation/${sha}.pdf`, sha256: sha, ...(sourceRole ? { sourceRole } : {}) });
  const act = (references: unknown[], transcribedFrom = ORIGINAL) => ({ schemaVersion: 'landesrecht-simulation-act/1', slug: 'vo-nsh', jurisdiction: 'nsh', meta: {}, version: { sourceReferences: references }, provenance: { transcribedFrom } });

  it('lässt ein Verzeichnis nur ergänzend zu und meldet es als Verkündungs-, Wortlaut- oder alleinige Rechtswirkungsgrundlage', async () => {
    await write('data/simulation/nsh/sources.json', { sources: [{ sha256: WIKI, documentType: 'informational' }, { sha256: ORIGINAL, documentType: 'standalone-official-act' }] });
    await write('data/simulation/nsh/acts/vo-nsh.json', act([reference('simulation-standalone-act', ORIGINAL, 'structure-bearing')]));
    await write('data/simulation/nsh/ledger.json', { events: [{ id: 'e1', status: 'applied', evidence: [ORIGINAL, WIKI] }] });
    expect((await checkEvidenceHierarchy(root, 'nsh')).problems).toEqual([]);
    expect(evidenceLevel({ documentType: 'informational' })).toBe(4);
    expect(evidenceLevel({ documentType: 'gazette', evidenceLevel: 3 })).toBe(3);

    await write('data/simulation/nsh/acts/vo-nsh.json', act([reference('simulation-standalone-act', ORIGINAL, 'structure-bearing'), reference('simulation-promulgation-evidence', WIKI, 'amendment-evidence')]));
    await write('data/simulation/nsh/ledger.json', { events: [{ id: 'e1', status: 'applied', evidence: [WIKI] }] });
    const report = await checkEvidenceHierarchy(root, 'nsh');
    expect(report.problems).toEqual([
      expect.stringMatching(/acts\/vo-nsh\.json\.version: Sekundärquelle eeeeeeeeeeee \(Ebene 4\) als simulation-promulgation-evidence/u),
      expect.stringMatching(/ledger\.json e1: angewandt, aber nur mit Sekundärquellen belegt/u),
    ]);
    await write('data/simulation/nsh/acts/vo-nsh.json', act([reference('simulation-promulgation-evidence', WIKI)], WIKI));
    expect((await checkEvidenceHierarchy(root, 'nsh')).problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/Wortlautquelle eeeeeeeeeeee ist Sekundärquelle/u),
      expect.stringMatching(/kein amtlicher Beleg der Ebene 1–3/u),
    ]));
    await restore();
  });
});
