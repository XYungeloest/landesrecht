/** NSH-Baseline-Freeze im Bulk (2026-09-29): keine stille Änderung, Rücknahme oder Neuaufnahme einer Ausgangsfassung. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readBaselineFreeze, type BaselineFreeze } from '@landesrecht/importer-common/baseline-lock.ts';
import { baselineFreezeDecision } from '@landesrecht/importer-juris-sh/pipeline/bulk.ts';
import { classifyReviewCase } from '@landesrecht/importer-juris-sh/reports/review-classes.ts';

const COMMIT = 'eeeca2cdc5596a602db4332e59a4b252df2b8ea0';
const freeze = (released: Partial<Record<'regenerated' | 'removed' | 'added', string[]>> = {}): BaselineFreeze => ({
  commit: COMMIT,
  released: { regenerated: new Set(released.regenerated ?? []), removed: new Set(released.removed ?? []), added: new Set(released.added ?? []) },
});
const base = { previousSlug: 'lvwg-nsh', previousImported: true, simLocked: false, importable: true, identical: true };

describe('baselineFreezeDecision', () => {
  it('ohne Freeze entscheidet der Bulk wie bisher', () => {
    expect(baselineFreezeDecision({ ...base, freeze: undefined, identical: false })).toEqual({ frozen: false });
  });

  it('sperrt übernommene Normen: gleich = unverändert, abweichend = changed, nicht mehr übernahmefähig = withdrawn', () => {
    expect(baselineFreezeDecision({ ...base, freeze: freeze() })).toEqual({ frozen: true });
    expect(baselineFreezeDecision({ ...base, freeze: freeze(), identical: false })).toEqual({ frozen: true, deviation: 'changed' });
    expect(baselineFreezeDecision({ ...base, freeze: freeze(), importable: false, identical: false })).toEqual({ frozen: true, deviation: 'withdrawn' });
  });

  it('nimmt keine neue Norm auf, außer mit Freigabe kind "added" zum Freeze-Commit', () => {
    const fresh = { freeze: freeze(), previousImported: false, simLocked: false, importable: true, identical: false, candidateSlug: 'din-neu-nsh' };
    expect(baselineFreezeDecision(fresh)).toEqual({ frozen: false, deviation: 'added' });
    expect(baselineFreezeDecision({ ...fresh, freeze: freeze({ added: ['nsh/din-neu-nsh/2023-12-01'] }) })).toEqual({ frozen: false });
    // Nicht übernahmefähige Dokumente (Review) sind keine Abweichung.
    expect(baselineFreezeDecision({ ...fresh, importable: false })).toEqual({ frozen: false });
  });

  it('dokumentierte Freigaben heben die Sperre genau einer Norm auf; die Sim-Sperre (Seed) hat Vorrang', () => {
    expect(baselineFreezeDecision({ ...base, freeze: freeze({ regenerated: ['nsh/lvwg-nsh/2023-12-01'] }), identical: false })).toEqual({ frozen: false });
    expect(baselineFreezeDecision({ ...base, freeze: freeze({ regenerated: ['nsh/andere-nsh/2023-12-01'] }), identical: false })).toEqual({ frozen: true, deviation: 'changed' });
    expect(baselineFreezeDecision({ ...base, freeze: freeze(), simLocked: true, identical: false })).toEqual({ frozen: false });
  });

  it('Freeze-Abweichungen sind technische Blocker', () => {
    const item = (key: string) => ({ category: 'import-regression' as const, key, details: [] });
    expect(classifyReviewCase(item('baseline-frozen')).class).toBe('technical-blocker');
    expect(classifyReviewCase(item('baseline-frozen-addition')).group).toBe('frozen-deviation');
  });
});

describe('readBaselineFreeze', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'landesrecht-freeze-'));
    await mkdir(join(root, 'data', 'simulation'), { recursive: true });
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it('liest Freeze-Commit und nur die Freigaben zu diesem Commit', async () => {
    await writeFile(join(root, 'data/simulation/baseline-locks.json'), JSON.stringify({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: { nsh: { commit: COMMIT, freeze: true }, baywue: { commit: 'abcdef1', freeze: false } }, seeds: [] }));
    await writeFile(join(root, 'data/content-immutability-exceptions.json'), JSON.stringify({ baseCommit: 'a7325a736', entries: [{ key: 'nsh/alt-nsh/2023-12-01', kind: 'regenerated' }], releases: [{ baseCommit: COMMIT.slice(0, 9), entries: [{ key: 'nsh/neu-nsh/2023-12-01', kind: 'added' }, { key: 'west/x/2023-12-01', kind: 'regenerated' }] }] }));
    const result = await readBaselineFreeze(root, 'nsh');
    expect(result?.commit).toBe(COMMIT);
    expect([...result!.released.added]).toEqual(['nsh/neu-nsh/2023-12-01']);
    expect(result!.released.regenerated.size).toBe(0);
    expect(await readBaselineFreeze(root, 'baywue')).toBeUndefined();
    expect(await readBaselineFreeze(root, 'west')).toBeUndefined();
  });
});
