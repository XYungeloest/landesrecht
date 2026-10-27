import { expect, it } from 'vitest';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { createStoreRegistry } from '@landesrecht/runtime/registry.ts';
import { listChanges } from '../../apps/web/src/lib/changes.ts';
import { norm, paragraph } from '../helpers/fixture-corpus.ts';

it('trennt Termine vor der Pagination und erhält frühere wirksame Änderungen trotz Zukunftsfassung', async () => {
  const body = [paragraph('§ 1', 'Zweck', 'Text.')];
  const version = (date: string) => ({ versionId: date, simulationValidFrom: date, body });
  const records = [
    norm({ jurisdiction: 'west', slug: 'mehrfach-west', versions: [
      { ...version('2023-12-01'), simulationValidTo: '2025-12-31' },
      { ...version('2026-01-01'), simulationValidTo: '2026-12-31' }, version('2027-01-01'),
    ] }),
    norm({ jurisdiction: 'west', slug: 'nur-kuenftig-west', versions: [
      { ...version('2023-12-01'), simulationValidTo: '2026-12-31' }, version('2027-01-01'),
    ] }),
    norm({ jurisdiction: 'west', slug: 'am-stichtag-west', versions: [
      { ...version('2023-12-01'), simulationValidTo: '2026-09-27' }, version('2026-09-28'),
    ] }),
  ];
  const registry = createStoreRegistry({ west: createFileNormStore('west', records) });
  const effective = await listChanges(registry, { changeKind: 'baseline-changed', timing: 'effective', limit: 10 });
  expect(effective.map(row => [row.slug, row.lastSimulationChangeDate])).toEqual([
    ['am-stichtag-west', '2026-09-28'], ['mehrfach-west', '2026-01-01'],
  ]);
  const future = await listChanges(registry, { changeKind: 'baseline-changed', timing: 'future', limit: 10 });
  expect(future.map(row => row.slug).sort()).toEqual(['mehrfach-west', 'nur-kuenftig-west']);
  expect(await listChanges(registry, { changeKind: 'baseline-changed', timing: 'effective', offset: 1, limit: 1 })).toEqual([effective[1]]);
});

it('zeigt neue künftige Normen als künftig und verwendet im Normkopf kein seit', async () => {
  const { buildNormView } = await import('../../apps/web/src/lib/norm-view.ts');
  const record = norm({ jurisdiction: 'nsh', slug: 'kuenftig-nsh', meta: { status: 'future-effective' }, versions: [
    { versionId: '2027-01-01', simulationValidFrom: '2027-01-01', body: [paragraph('§ 1', 'Zweck', 'Text.')] },
  ] });
  const view = buildNormView(record)!;
  expect(view.kind).toBe('future');
  expect(view.isCurrent).toBe(false);
  expect(view.validityText).toBe('Gültig ab 1. Januar 2027');
  const registry = createStoreRegistry({ nsh: createFileNormStore('nsh', [record]) });
  expect(await listChanges(registry, { changeKind: 'simulation-new', timing: 'effective', limit: 6 })).toEqual([]);
  expect((await listChanges(registry, { changeKind: 'simulation-new', timing: 'future', limit: 6 }))[0]?.slug).toBe('kuenftig-nsh');
});
