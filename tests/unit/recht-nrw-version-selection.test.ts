import { describe, expect, it } from 'vitest';

import { selectSourceVersionAtBaseline, type SourceVersionCandidate } from '@landesrecht/importer-recht-nrw/version-selection.ts';

const BASELINE = '2023-12-01';

function candidate(validFrom: string, extra: Partial<SourceVersionCandidate> = {}): SourceVersionCandidate {
  return { validFrom, available: true, url: `https://recht.nrw.de/lrgv/gesetz/${validFrom.split('-').reverse().join('')}-test`, ...extra };
}

describe('Stichtagsauswahl der Quellfassung', () => {
  it('wählt die Fassung, deren Intervall den Stichtag enthält, nicht die jüngste', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01'), candidate('2023-12-16', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(result.selected?.validFrom).toBe('2020-01-01');
    expect(result.selected?.validTo).toBe('2023-12-15');
    expect(result.selected?.validToDerived).toBe(true);
  });

  it('akzeptiert eine Fassung, die exakt am Stichtag beginnt', () => {
    const result = selectSourceVersionAtBaseline([candidate('2019-01-01'), candidate('2023-12-01', { validTo: null })], BASELINE);
    expect(result.selected?.validFrom).toBe('2023-12-01');
  });

  it('akzeptiert eine Fassung, die exakt am Stichtag endet', () => {
    const result = selectSourceVersionAtBaseline([candidate('2019-01-01', { validTo: '2023-12-01' }), candidate('2023-12-02', { validTo: null })], BASELINE);
    expect(result.selected?.validFrom).toBe('2019-01-01');
  });

  it('wählt die vorherige Fassung, wenn die nächste wenige Tage nach dem Stichtag beginnt', () => {
    const result = selectSourceVersionAtBaseline([candidate('2023-01-01'), candidate('2023-12-30', { validTo: null })], BASELINE);
    expect(result.selected?.validFrom).toBe('2023-01-01');
    expect(result.selected?.validTo).toBe('2023-12-29');
  });

  it('verwirft eine Fassung, die einen Tag vor dem Stichtag endet, zugunsten der Folgefassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2023-11-30' }), candidate('2023-12-01', { validTo: null })], BASELINE);
    expect(result.selected?.validFrom).toBe('2023-12-01');
  });

  it('behandelt eine offene obere Grenze', () => {
    const result = selectSourceVersionAtBaseline([candidate('2018-03-30', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(result.selected?.validTo).toBeNull();
  });

  it('meldet Lücken zwischen Fassungen fail-closed', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2023-06-30' }), candidate('2024-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('gap');
    expect(result.selected).toBeUndefined();
    expect(result.problems.join(' ')).toMatch(/Lücke/u);
  });

  it('meldet überlappende Fassungen fail-closed', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2023-12-31' }), candidate('2023-11-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('overlap');
    expect(result.problems.join(' ')).toMatch(/überlappt/u);
  });

  it('meldet fehlende Datumsmetadaten', () => {
    const result = selectSourceVersionAtBaseline([{ available: true, label: 'ohne Datum' }, candidate('2020-01-01')], BASELINE);
    expect(result.status).toBe('missing-dates');
  });

  it('meldet, wenn keine Fassung den Stichtag abdeckt (aufgehobene Norm)', () => {
    const result = selectSourceVersionAtBaseline([candidate('2011-09-24'), candidate('2015-04-25', { validTo: '2015-07-16' })], BASELINE);
    expect(result.status).toBe('no-version-at-baseline');
  });

  it('meldet eine nicht darstellbare Stichtagsfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { available: false, url: undefined }), candidate('2024-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('not-available');
  });

  it('meldet ein Ende vor dem Beginn (Datenfehler der Quelle)', () => {
    const result = selectSourceVersionAtBaseline([candidate('2022-08-01', { validTo: '2022-07-31' }), candidate('2026-08-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('inconsistent-interval');
  });

  it('das Datum in der URL ist nicht maßgeblich', () => {
    const result = selectSourceVersionAtBaseline([{ validFrom: '2020-01-01', validTo: '2023-12-15', available: true, url: 'https://recht.nrw.de/lrgv/gesetz/16122023-irrefuehrend' }, candidate('2023-12-16', { validTo: null })], BASELINE);
    expect(result.selected?.url).toContain('16122023-irrefuehrend');
    expect(result.selected?.validFrom).toBe('2020-01-01');
  });
});
