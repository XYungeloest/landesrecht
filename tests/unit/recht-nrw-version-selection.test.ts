import { describe, expect, it } from 'vitest';

import { selectSourceVersionAtBaseline, type SourceVersionCandidate } from '@landesrecht/importer-recht-nrw/common/version-selection.ts';

const BASELINE = '2023-12-01';

function candidate(validFrom: string, extra: Partial<SourceVersionCandidate> = {}): SourceVersionCandidate {
  return { validFrom, available: true, url: `https://recht.nrw.de/lrgv/gesetz/${validFrom.split('-').reverse().join('')}-test`, ...extra };
}

const codes = (result: ReturnType<typeof selectSourceVersionAtBaseline>, severity: 'error' | 'warning'): string[] => result.findings.filter((finding) => finding.severity === severity).map((finding) => finding.code);

describe('Stichtagsauswahl der Quellfassung', () => {
  it('wählt die Fassung, deren Intervall den Stichtag enthält, nicht die jüngste', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01'), candidate('2023-12-16', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(result.selected?.validFrom).toBe('2020-01-01');
    expect(result.selected?.validTo).toBe('2023-12-15');
    expect(result.selected?.validToDerived).toBe(true);
    expect(result.findings).toEqual([]);
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

  it('das Datum in der URL ist nicht maßgeblich', () => {
    const result = selectSourceVersionAtBaseline([{ validFrom: '2020-01-01', validTo: '2023-12-15', available: true, url: 'https://recht.nrw.de/lrgv/gesetz/16122023-irrefuehrend' }, candidate('2023-12-16', { validTo: null })], BASELINE);
    expect(result.selected?.url).toContain('16122023-irrefuehrend');
    expect(result.selected?.validFrom).toBe('2020-01-01');
  });
});

describe('Lokal fail-closed: Befunde an der Stichtagsfassung blockieren', () => {
  it('Lücke über den Stichtag hinweg', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2023-06-30' }), candidate('2024-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('gap');
    expect(result.selected).toBeUndefined();
    expect(codes(result, 'error')).toEqual(['baseline-gap']);
    expect(result.problems.join(' ')).toMatch(/Lücke/u);
  });

  it('mehrere Fassungen am Stichtag (Überlappung)', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2023-12-31' }), candidate('2023-11-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('overlap');
    expect(codes(result, 'error')).toEqual(['baseline-multiple-versions']);
    expect(result.problems.join(' ')).toMatch(/überlappt/u);
  });

  it('lokale Lücke zur Vorfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2019-01-01', { validTo: '2021-12-31' }), candidate('2022-06-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('gap');
    expect(codes(result, 'error')).toEqual(['baseline-adjacent-gap']);
  });

  it('lokale Überlappung mit der Vorfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2019-01-01', { validTo: '2022-06-30' }), candidate('2022-06-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('overlap');
    expect(codes(result, 'error')).toEqual(['baseline-adjacent-overlap']);
  });

  it('lokale Überlappung mit der Folgefassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2024-02-01' }), candidate('2024-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('overlap');
    expect(codes(result, 'error')).toEqual(['baseline-adjacent-overlap']);
  });

  it('Mehrdeutigkeit: weitere Fassung mit gleichem Beginn wie die Stichtagsfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { validTo: '2020-12-31' }), candidate('2020-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('ambiguous');
    expect(codes(result, 'error')).toContain('baseline-neighbour-ambiguous');
  });

  it('widersprüchliche Vorfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2021-05-01', { validTo: '2021-01-01' }), candidate('2022-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('inconsistent-interval');
    expect(codes(result, 'error')).toContain('baseline-neighbour-contradictory');
  });

  it('fehlende Datumsmetadaten', () => {
    const result = selectSourceVersionAtBaseline([{ available: true, label: 'ohne Datum' }, candidate('2020-01-01')], BASELINE);
    expect(result.status).toBe('missing-dates');
    expect(codes(result, 'error')).toEqual(['baseline-undated-version']);
  });

  it('keine Fassung am Stichtag (aufgehobene Norm)', () => {
    const result = selectSourceVersionAtBaseline([candidate('2011-09-24'), candidate('2015-04-25', { validTo: '2015-07-16' })], BASELINE);
    expect(result.status).toBe('no-version-at-baseline');
    expect(codes(result, 'error')).toEqual(['baseline-no-version']);
  });

  it('nicht darstellbare Stichtagsfassung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01', { available: false, url: undefined }), candidate('2024-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('not-available');
    expect(codes(result, 'error')).toEqual(['baseline-version-not-renderable']);
  });

  it('Ende vor Beginn an der Stichtagsfassung (Datenfehler der Quelle)', () => {
    const result = selectSourceVersionAtBaseline([candidate('2022-08-01', { validTo: '2022-07-31' }), candidate('2026-08-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('inconsistent-interval');
    expect(codes(result, 'error')).toEqual(['baseline-contradictory-interval']);
  });
});

describe('Historische Befunde weit vom Stichtag blockieren nicht', () => {
  it('entfernte historische Lücke wird Warnung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2000-01-01', { validTo: '2004-12-31' }), candidate('2006-01-01'), candidate('2020-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(result.selected?.validFrom).toBe('2020-01-01');
    expect(codes(result, 'error')).toEqual([]);
    expect(codes(result, 'warning')).toEqual(['history-gap']);
    expect(result.findings[0]).toMatchObject({ scope: 'historical', versions: ['2000-01-01', '2006-01-01'] });
  });

  it('entfernte historische Überlappung wird Warnung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2000-01-01', { validTo: '2007-06-30' }), candidate('2006-01-01'), candidate('2020-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(codes(result, 'warning')).toEqual(['history-overlap']);
  });

  it('entfernter widersprüchlicher Datensatz wird Warnung', () => {
    const result = selectSourceVersionAtBaseline([candidate('2001-01-01', { validTo: '2000-12-31' }), candidate('2010-01-01'), candidate('2020-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(codes(result, 'warning')).toEqual(['history-contradictory-interval']);
  });

  it('entfernte Befunde nach dem Stichtag werden ebenfalls nur gemeldet', () => {
    const result = selectSourceVersionAtBaseline([candidate('2020-01-01'), candidate('2024-01-01', { validTo: '2024-06-30' }), candidate('2025-01-01', { validTo: null })], BASELINE);
    expect(result.status).toBe('selected');
    expect(result.selected?.validTo).toBe('2023-12-31');
    expect(codes(result, 'warning')).toEqual(['history-gap']);
  });
});
