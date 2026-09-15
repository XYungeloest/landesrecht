import { describe, expect, it } from 'vitest';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { assertBaselineConsistency, classifyNormVersion, getApplicableVersion, getBaselineVersion, getNormLastActivityDate, getNormLastChangeDate, resolveVersionAt } from '@landesrecht/legal-core/lib/versions.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE, norm } from '../helpers/fixture-corpus.ts';

const west = buildFixtureNorms().find((record) => record.meta.jurisdiction === 'west')!;

describe('Zeitmodell', () => {
  it('trennt Simulationsgeltung und Quellgültigkeit', () => {
    const baseline = getBaselineVersion(west)!;
    expect(baseline.simulationValidFrom).toBe(SIMULATION_BASELINE_DATE);
    expect(baseline.sourceValidFrom).toBe('2023-08-01');
    expect(baseline.sourceValidTo).toBe('2024-01-31');
    // Die Quellfassung endete real am 31.01.2024; in der Simulation gilt sie bis zur Folgefassung.
    expect(baseline.simulationValidTo).toBe('2026-02-28');
    expect(resolveVersionAt(west, '2024-06-01')?.versionId).toBe(SIMULATION_BASELINE_DATE);
  });

  it('löst Fassungen anhand eines Datums auf', () => {
    expect(resolveVersionAt(west, '2023-11-30')).toBeUndefined();
    expect(resolveVersionAt(west, '2023-12-01')?.versionId).toBe(SIMULATION_BASELINE_DATE);
    expect(resolveVersionAt(west, '2026-02-28')?.versionId).toBe(SIMULATION_BASELINE_DATE);
    expect(resolveVersionAt(west, '2026-03-01')?.versionId).toBe('2026-03-01');
    expect(resolveVersionAt(west, '2030-01-01')?.versionId).toBe('2026-03-01');
  });

  it('klassifiziert Fassungen relativ zum redaktionellen Stichtag', () => {
    expect(classifyNormVersion(west, west.versions[0]!, FIXTURE_REFERENCE_DATE)).toBe('historical');
    expect(classifyNormVersion(west, west.versions[1]!, FIXTURE_REFERENCE_DATE)).toBe('current');
    expect(classifyNormVersion(west, west.versions[1]!, '2026-01-01')).toBe('future');
    expect(getApplicableVersion(west, FIXTURE_REFERENCE_DATE).versionId).toBe('2026-03-01');
    expect(getApplicableVersion(west, '2024-01-01').versionId).toBe(SIMULATION_BASELINE_DATE);
    expect(getApplicableVersion(west, '2023-01-01').versionId).toBe(SIMULATION_BASELINE_DATE);
  });

  it('lehnt Ausgangsfassungen vor dem Ausgangsrechtsstand ab', () => {
    const early = norm({ jurisdiction: 'nsh', slug: 'frueh', versions: [{ versionId: '2023-01-01', simulationValidFrom: '2023-01-01', body: [] }] });
    expect(() => assertBaselineConsistency(early)).toThrow(/Ausgangsrechtsstand/u);
    expect(() => assertBaselineConsistency(west)).not.toThrow();
  });

  it('unterscheidet Rechtsänderung und Aktivität', () => {
    const notice = norm({
      jurisdiction: 'west', slug: 'hinweis',
      history: { initialVersionId: '2023-12-01', entries: [
        { date: '2023-12-01', type: 'initial', title: 'x', citation: 'c', affectingVersionId: '2023-12-01' },
        { date: '2026-05-01', type: 'notice', title: 'Hinweis', citation: 'c' },
      ] },
      versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [] }],
    });
    expect(getNormLastChangeDate(notice, FIXTURE_REFERENCE_DATE)).toBe('2023-12-01');
    expect(getNormLastActivityDate(notice, FIXTURE_REFERENCE_DATE)).toBe('2026-05-01');
  });
});
