/**
 * Zentrale Klassifikation gegenüber dem Ausgangsrechtsstand (packages/legal-core/src/lib/simulation-change.ts):
 * unverändertes Ausgangsrecht, in der Simulation geändert, neu in der Simulation – aus Geltungsintervallen und
 * Historie, nie aus der Fassungszahl; widersprüchliche Daten brechen ab.
 */
import { describe, expect, it } from 'vitest';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { classifySimulationChange, SimulationChangeError } from '@landesrecht/legal-core/lib/simulation-change.ts';
import { createOstRechtD1Store } from '@landesrecht/runtime/ostrecht-d1-store.ts';

import { norm, paragraph } from '../helpers/fixture-corpus.ts';
import { openOstRechtFixture } from '../helpers/ostrecht-fixture.ts';

const body = [paragraph('§ 1', 'Zweck', 'Text.')];
const B = SIMULATION_BASELINE_DATE;
const baseline = (extra: Record<string, unknown> = {}) => ({ versionId: B, simulationValidFrom: B, body, ...extra });

describe('classifySimulationChange', () => {
  it('unveränderte Baseline-Norm (eine Ausgangsfassung, keine Sim-Änderung)', () => {
    const record = norm({ jurisdiction: 'west', slug: 'unveraendert-west', versions: [baseline()] });
    expect(classifySimulationChange(record)).toEqual({ kind: 'baseline-unchanged', lastChangeDate: null, firstSimulationDate: null, simulationVersionCount: 0, repealedInSimulation: false });
  });

  it('rekonstruierte Baseline ohne Sim-Änderung zählt als unverändert (Rekonstruktion ist keine Simulationsänderung)', () => {
    const record = norm({ jurisdiction: 'baywue', slug: 'rekonstruiert-baywue', versions: [baseline({ sourceStatus: { validity: 'reconstructed', text: 'reconstructed', note: 'zurückgerechnet' }, sourceValidFrom: '2022-01-01', sourceValidTo: '2024-06-30' })], history: { initialVersionId: B, entries: [
      { date: B, type: 'initial', title: 'Ausgangsfassung', citation: 'Zitat', affectingVersionId: B },
      { date: '2026-09-29', type: 'notice', title: 'Stichtagsfassung rekonstruiert', citation: 'Rezept' },
    ] } });
    expect(classifySimulationChange(record).kind).toBe('baseline-unchanged');
  });

  it('Baseline-Norm mit einer und mit mehreren Sim-Änderungen', () => {
    const once = norm({ jurisdiction: 'west', slug: 'geaendert-west', versions: [baseline({ simulationValidTo: '2026-02-28' }), { versionId: '2026-03-01', simulationValidFrom: '2026-03-01', body }] });
    expect(classifySimulationChange(once)).toMatchObject({ kind: 'baseline-changed', lastChangeDate: '2026-03-01', firstSimulationDate: '2026-03-01', simulationVersionCount: 1, repealedInSimulation: false });
    const twice = norm({ jurisdiction: 'nsh', slug: 'mehrfach-nsh', versions: [baseline({ simulationValidTo: '2025-05-31' }), { versionId: '2025-06-01', simulationValidFrom: '2025-06-01', simulationValidTo: '2026-08-31', body }, { versionId: '2026-09-01', simulationValidFrom: '2026-09-01', body }] });
    expect(classifySimulationChange(twice)).toMatchObject({ kind: 'baseline-changed', lastChangeDate: '2026-09-01', firstSimulationDate: '2025-06-01', simulationVersionCount: 2 });
  });

  it('neue Sim-Norm (keine Ausgangsfassung), auch als künftige Fassung', () => {
    const fresh = norm({ jurisdiction: 'baywue', slug: 'neu-baywue', versions: [{ versionId: '2026-05-30', simulationValidFrom: '2026-05-30', body }] });
    expect(classifySimulationChange(fresh)).toEqual({ kind: 'simulation-new', lastChangeDate: '2026-05-30', firstSimulationDate: '2026-05-30', simulationVersionCount: 1, repealedInSimulation: false });
    const future = norm({ jurisdiction: 'baywue', slug: 'kuenftig-baywue', meta: { status: 'future-effective' }, versions: [{ versionId: '2026-10-01', simulationValidFrom: '2026-10-01', body }] });
    expect(classifySimulationChange(future).kind).toBe('simulation-new');
  });

  it('in der Simulation aufgehobene Baseline-Norm ist geändert (Aufhebungstag = letzte Änderung)', () => {
    const repealed = norm({ jurisdiction: 'west', slug: 'aufgehoben-west', meta: { status: 'repealed', expiryDate: '2025-12-31' }, versions: [baseline({ simulationValidTo: '2025-12-31' })], history: { initialVersionId: B, entries: [
      { date: B, type: 'initial', title: 'Ausgangsfassung', citation: 'Zitat', affectingVersionId: B },
      { date: '2025-12-31', type: 'repeal', title: 'Aufgehoben durch Gesetz vom 17. Dezember 2025', citation: 'GV. West 2025 Nr. 05 S. 20' },
    ] } });
    expect(classifySimulationChange(repealed)).toMatchObject({ kind: 'baseline-changed', lastChangeDate: '2025-12-31', simulationVersionCount: 0, repealedInSimulation: true });
  });

  it('fail-closed: keine Fassung, Fassung vor dem Ausgangsrechtsstand, doppelte Ausgangsfassung, Aufhebung vor dem Ausgangsstand', () => {
    const record = norm({ jurisdiction: 'west', slug: 'x-west', versions: [baseline()] });
    expect(() => classifySimulationChange({ ...record, versions: [] })).toThrow(SimulationChangeError);
    expect(() => classifySimulationChange({ ...record, versions: [{ ...record.versions[0]!, simulationValidFrom: '2023-01-01' }] })).toThrow(/vor dem Ausgangsrechtsstand/u);
    expect(() => classifySimulationChange({ ...record, versions: [record.versions[0]!, { ...record.versions[0]!, versionId: 'zweite' }] })).toThrow(/2 Fassungen beginnen am Ausgangsrechtsstand/u);
    expect(() => classifySimulationChange({ ...record, history: { ...record.history, entries: [{ date: '2020-01-01', type: 'repeal', title: 'alt', citation: 'x' }] } })).toThrow(/Aufhebung vor dem Ausgangsrechtsstand/u);
  });

  it('Ost über den OstRecht-Store: unveränderte Norm, Norm mit späterer Sim-Fassung, neue Sim-Norm', async () => {
    const { store } = await openOstRechtFixture();
    const unchanged = await store.getNorm('interreg-ostdeutschland-tschechien-2021-2027', 'none');
    expect(classifySimulationChange(unchanged!).kind).toBe('baseline-unchanged');
    const changed = await store.getNorm('ndr-staatsvertrag', 'none');
    const classified = classifySimulationChange(changed!);
    expect(classified).toMatchObject({ kind: 'baseline-changed', lastChangeDate: '2026-09-03', simulationVersionCount: 1 });
    expect(classifySimulationChange((await store.getNorm('ostdeutsches-feiertagsgesetz', 'none'))!)).toMatchObject({ kind: 'baseline-changed', lastChangeDate: '2026-03-24', simulationVersionCount: 2 });
    expect(classifySimulationChange((await store.getNorm('abschiebe-aussetzungsverordnung', 'none'))!)).toMatchObject({ kind: 'simulation-new', firstSimulationDate: '2024-03-01', repealedInSimulation: true });
    // Der Store liefert dieselbe Klassifikation in der Übersicht (SQL-Nachbildung im Dialekt).
    for (const [slug, kind, last] of [['ndr-staatsvertrag', 'baseline-changed', '2026-09-03'], ['interreg-ostdeutschland-tschechien-2021-2027', 'baseline-unchanged', null], ['ostdeutsches-feiertagsgesetz', 'baseline-changed', '2026-03-24'], ['abschiebe-aussetzungsverordnung', 'simulation-new', '2024-03-01']] as const) {
      const summary = await store.getNormSummary(slug);
      expect(summary?.simulationChangeKind, slug).toBe(kind);
      expect(summary?.lastSimulationChangeDate, slug).toBe(last);
    }
    void createOstRechtD1Store;
  });
});

describe('öffentliche Notizen', () => {
  it('blendet redaktionelle Arbeitsnotizen aus und lässt fachliche Hinweise stehen', async () => {
    const { publicNote } = await import('@landesrecht/legal-core/lib/display.ts');
    expect(publicNote('Amtlich veröffentlicht. Änderungsakt; die Zielnorm ist nicht im Baseline-Bestand (blockiert).')).toBeUndefined();
    expect(publicNote('Rückrechnung auf 2023-12-01: Rezept data/imports/bayernrecht/reconstruction/BayFEV.json (1 Schritt, Rundlauf bestanden)')).toBeUndefined();
    expect(publicNote('Zielnorm Grundschulordnung nicht im Baseline-Bestand – Slug vorläufig, Rezept gesperrt')).toBeUndefined();
    expect(publicNote('Permalink „genau dieses Dokument“: https://example.invalid/x')).toBeUndefined();
    expect(publicNote('Anlage nur als PDF; nicht als Text übernommen.')).toBe('Anlage nur als PDF; nicht als Text übernommen.');
    expect(publicNote('Inkrafttreten am 1. Januar 2024')).toBe('Inkrafttreten am 1. Januar 2024');
    expect(publicNote('  ')).toBeUndefined();
    expect(publicNote(undefined)).toBeUndefined();
  });
});

describe('Änderungsdatum in Lesersprache', () => {
  it('unterscheidet bereits wirksame von künftig wirksamen Änderungen', async () => {
    const { simulationChangeDateText } = await import('@landesrecht/legal-core/lib/display.ts');
    expect(simulationChangeDateText('2026-05-18', '2026-09-28')).toBe('zuletzt geändert am 18. Mai 2026');
    expect(simulationChangeDateText('2026-09-28', '2026-09-28')).toBe('zuletzt geändert am 28. September 2026');
    expect(simulationChangeDateText('2027-12-31', '2026-09-28')).toBe('Änderung wirksam ab 31. Dezember 2027');
  });
});
