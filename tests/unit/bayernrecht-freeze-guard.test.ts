/**
 * BayWü Lauf 19: Rückwirkungsfehler dauerhaft abgesichert (127 Normen der Klassifikation 3b), Freeze-Sperre des
 * BayWü-Bulks, StRGVV-Entscheidung (Seed abgelöst, Aufhebung als Identitäts-/Statusoperation).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { freezeDecision, type BaselineFreeze } from '@landesrecht/importer-common/baseline-lock.ts';
import { classifyBaseline } from '@landesrecht/importer-bayernrecht/baseline/classify.ts';
import { parseBaselineLockFile } from '@landesrecht/importer-simulation/common/baseline-locks.ts';
import { parseSimulationRecipe } from '@landesrecht/importer-simulation/recipes/schema.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

const root = resolveRepositoryRoot();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T;

describe('Rückwirkung: nach dem Stichtag ausgefertigt, rückwirkend in Kraft – nie „exakt“ (6.2)', () => {
  it('Portal-validFrom vor dem Stichtag reicht nicht, wenn eine nach dem Stichtag ausgefertigte Änderung rückwirkend gilt', () => {
    const decision = classifyBaseline({ documentId: 'BayStRGVV', documentDate: '2014-01-28', inForceFrom: '2023-11-08', evaluationDate: '2026-09-18', lastAmendmentDate: '2024-05-14', postBaselineEvents: [{ type: 'amend', date: '2024-05-31', enactmentDate: '2024-05-14', effectiveDate: '2023-11-08', citation: 'GVBl. 2024 S. 86' }] });
    expect(decision.class).toBe('changed-after-baseline');
    expect(decision.method).not.toBe('current-unchanged');
  });
});

interface RegressionEntry { sourceIdentity: string; slug: string; outcome: 'corrected-reconstructed' | 'withdrawn' | 'newly-reconstructed'; before: { baselineRecoveryMethod?: string } }
const regression = readJson<{ totals: Record<string, number>; entries: RegressionEntry[] }>('data/audits/bayernrecht/post-baseline-amendment-regression.json');

describe('Regressionsset der 127 umgestellten Normen', () => {
  const decisions = new Map(readJson<{ decisions: Array<{ documentId: string; class: string; method: string }> }>('data/imports/bayernrecht/baseline.json').decisions.map((decision) => [decision.documentId, decision]));
  const manifest = new Map<string, { importStatus: string; baselineRecoveryMethod?: string }>();
  for (const area of ['landesrecht', 'vwv', 'events']) {
    const directory = join(root, 'data/imports/bayernrecht/manifest', area);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      const entry = (JSON.parse(readFileSync(join(directory, file), 'utf8')) as { entry: { sourceIdentity: string; importStatus: string; baselineRecoveryMethod?: string } }).entry;
      manifest.set(entry.sourceIdentity, entry);
    }
  }

  it('umfasst 42 korrigierte, 84 zurückgenommene (einschließlich StRGVV) und eine neu rekonstruierte Norm', () => {
    expect(regression.totals).toEqual({ 'corrected-reconstructed': 42, withdrawn: 84, 'newly-reconstructed': 1 });
  });

  it('keine davon erscheint wieder als „heutiger Text = Stichtagstext“', () => {
    for (const entry of regression.entries) {
      const decision = decisions.get(entry.sourceIdentity);
      expect(decision?.class, entry.sourceIdentity).toBe('changed-after-baseline');
      expect(decision?.method, entry.sourceIdentity).not.toBe('current-unchanged');
      const now = manifest.get(entry.sourceIdentity)!;
      expect(now.baselineRecoveryMethod === 'current-source' && ['imported', 'imported-with-warnings'].includes(now.importStatus), entry.sourceIdentity).toBe(false);
      if (entry.outcome === 'withdrawn') expect(['imported', 'imported-with-warnings'].includes(now.importStatus), entry.sourceIdentity).toBe(false);
      else expect(now.baselineRecoveryMethod, entry.sourceIdentity).toBe('reverse-post-baseline-event');
    }
  });
});

describe('BayWü-Freeze-Sperre (gemeinsame Entscheidung mit NSH)', () => {
  const freeze = (released: Partial<Record<'regenerated' | 'removed' | 'added', string[]>> = {}): BaselineFreeze => ({ commit: 'f'.repeat(40), released: { regenerated: new Set(released.regenerated ?? []), removed: new Set(released.removed ?? []), added: new Set(released.added ?? []) } });
  const base = { jurisdiction: 'baywue', baselineDate: '2023-12-01', previousSlug: 'bayprg-baywue', previousImported: true, simLocked: false, importable: true, identical: true };
  it('sperrt Änderung, Rücknahme und Neuaufnahme; Freigaben heben die Sperre genau einer Norm auf', () => {
    expect(freezeDecision({ ...base, freeze: undefined, identical: false })).toEqual({ frozen: false });
    expect(freezeDecision({ ...base, freeze: freeze() })).toEqual({ frozen: true });
    expect(freezeDecision({ ...base, freeze: freeze(), identical: false })).toEqual({ frozen: true, deviation: 'changed' });
    expect(freezeDecision({ ...base, freeze: freeze(), importable: false })).toEqual({ frozen: true, deviation: 'withdrawn' });
    expect(freezeDecision({ ...base, freeze: freeze(), previousImported: false, candidateSlug: 'neu-baywue' })).toEqual({ frozen: false, deviation: 'added' });
    expect(freezeDecision({ ...base, freeze: freeze({ regenerated: ['baywue/bayprg-baywue/2023-12-01'] }), identical: false })).toEqual({ frozen: false });
    expect(freezeDecision({ ...base, freeze: freeze({ added: ['baywue/neu-baywue/2023-12-01'] }), previousImported: false, candidateSlug: 'neu-baywue' })).toEqual({ frozen: false });
  });
});

describe('StRGVV: Regel 6.2 strikt (Human Decision 2026-09-29)', () => {
  it('kein aktiver Seed, der alte ist mit Grund und Entscheidung abgelöst; keine veröffentlichte Norm', () => {
    const locks = parseBaselineLockFile(readJson('data/simulation/baseline-locks.json'));
    expect(locks.seeds.filter((seed) => seed.jurisdiction === 'baywue').map((seed) => seed.slug).sort()).toEqual(['baygvfg-baywue', 'ftg-baywue', 'verfassung-des-freistaates-bayern-wuerttemberg']);
    const superseded = locks.supersededSeeds?.find((seed) => seed.slug === 'strgvv-baywue');
    expect(superseded).toMatchObject({ sha256: expect.stringMatching(/^89184e10/u), acceptedAt: '2026-09-28', supersededAt: '2026-09-29' });
    expect(superseded!.reason).toContain('GVBl. 2024 S. 86');
    expect(existsSync(join(root, 'content/norms/baywue/strgvv-baywue'))).toBe(false);
    expect(() => parseBaselineLockFile({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: {}, seeds: [locks.supersededSeeds![0]!].map(({ supersededAt: _a, reason: _r, supersededBy: _b, ...seed }) => seed), supersededSeeds: locks.supersededSeeds })).toThrow(/zugleich aktiv/u);
  });

  it('die Sim-Aufhebung 2025 ist eine Identitäts-/Statusoperation ohne Zieltext (targetExcluded)', () => {
    const recipe = parseSimulationRecipe(readJson('data/simulation/baywue/amendments/strgvv-2025-baywue/strgvv-baywue.json'), 'strgvv-baywue.json');
    expect(recipe.repealsLaw).toBe(true);
    expect(recipe.targetExcluded).toMatchObject({ sourceIdentity: 'BayStRGVV', reasonCode: 'text-unproven-after-baseline', externalIdentifiers: expect.arrayContaining([{ system: 'bayrs', value: '1102-2-S' }]) });
    expect(recipe.operations[0]!.expectedHash).toBeUndefined();
    const act = readJson<{ relations: Array<{ type: string; target: { slug: string }; date?: string }> }>('content/norms/baywue/strgvv-2025-baywue/meta.json');
    expect(act.relations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'repeals', target: { slug: 'strgvv-baywue' }, date: '2025-04-13' }), expect.objectContaining({ type: 'replaces', target: { slug: 'strgvv-baywue' } })]));
    // Gegenprobe: ohne targetExcluded bleibt der Hash Pflicht; mit targetExcluded ist er verboten.
    const raw = readJson<Record<string, unknown>>('data/simulation/baywue/amendments/strgvv-2025-baywue/strgvv-baywue.json');
    const { targetExcluded: _omit, ...plain } = raw;
    expect(() => parseSimulationRecipe(plain, 'x.json')).toThrow(/expectedHash/u);
    expect(() => parseSimulationRecipe({ ...raw, operations: [{ ...(raw.operations as object[])[0], expectedHash: 'a'.repeat(64) }] }, 'x.json')).toThrow(/kein expectedHash/u);
  });
});
