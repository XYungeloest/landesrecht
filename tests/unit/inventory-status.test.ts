/**
 * Hinweis „Teilbestand“: Statusdatei (legal-core), Erzeugung aus Stichtagsentscheidungen und Manifest (BayWü) und
 * die Regel, dass der Hinweis allein an den Daten hängt – vollständig oder ohne Eintrag heißt: kein Hinweis.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { describeInventoryNotice, INVENTORY_STATUS_SCHEMA, parseInventoryStatusFile } from '@landesrecht/legal-core/config/inventory-status.ts';
import { baselineOnlyOpen, buildInventoryStatus, INVENTORY_STATUS_PATH, writeInventoryStatus } from '@landesrecht/importer-bayernrecht/audit/inventory-status.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const entry = (overrides: Record<string, unknown> = {}) => ({
  jurisdiction: 'baywue', baselineDate: '2023-12-01', complete: false, published: 3, pending: { atBaseline: 2, baselineOnly: 1, undetermined: 0 }, ...overrides,
});

describe('Statusdatei inventory-status.json', () => {
  it('liest Einträge und prüft Schema, Land, Stichtag und Anzahlen', () => {
    const parsed = parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry() } });
    expect(parsed.get('baywue')).toEqual(entry());
    expect(() => parseInventoryStatusFile({ schemaVersion: 'x', jurisdictions: {} })).toThrow(/Schema/u);
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { sachsen: entry({ jurisdiction: 'sachsen' }) } })).toThrow(/Jurisdiktion/u);
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ jurisdiction: 'west' }) } })).toThrow(/Jurisdiktion/u);
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ baselineDate: '2024-01-01' }) } })).toThrow(/baselineDate/u);
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ published: -1 }) } })).toThrow(/published/u);
  });

  it('trennt den Baseline-Status (Freeze, Bereitschaft) vom Sim-Quellenstatus', async () => {
    const withFreeze = parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ baselineFreeze: { frozen: false, readiness: 'READY WITH HUMAN REVIEW', assessedAt: '2026-09-29' } }) } });
    expect(withFreeze.get('baywue')?.baselineFreeze).toEqual({ frozen: false, readiness: 'READY WITH HUMAN REVIEW', assessedAt: '2026-09-29' });
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ baselineFreeze: { frozen: true, readiness: 'BASELINE READY', assessedAt: '2026-09-29' } }) } })).toThrow(/eingefroren/u);
    expect(() => parseInventoryStatusFile({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: entry({ baselineFreeze: { frozen: false, readiness: 'SIM SOURCES PARTIAL', assessedAt: '2026-09-29' } }) } })).toThrow(/readiness/u);
    // Der Importer-Schreibweg erhält Freeze- und Sim-Block.
    const root = await tempRoot();
    await writeInventoryStatus(root, buildInventoryStatus({ baseline: { decisions: [] }, manifest: { entries: [] }, baselineOnlyOpen: 0 }));
    const path = join(root, INVENTORY_STATUS_PATH);
    const file = JSON.parse(await readFile(path, 'utf8'));
    file.jurisdictions.baywue.baselineFreeze = { frozen: false, assessedAt: '2026-09-29' };
    await (await import('node:fs/promises')).writeFile(path, JSON.stringify(file));
    await writeInventoryStatus(root, buildInventoryStatus({ baseline: { decisions: [] }, manifest: { entries: [] }, baselineOnlyOpen: 1 }));
    expect(JSON.parse(await readFile(path, 'utf8')).jurisdictions.baywue.baselineFreeze).toEqual({ frozen: false, assessedAt: '2026-09-29' });
  });

  it('die ausgelieferte Datei ist gültig und führt West nicht als Teilbestand', async () => {
    const shipped = parseInventoryStatusFile(JSON.parse(await readFile(join(process.cwd(), INVENTORY_STATUS_PATH), 'utf8')));
    // West ist eingefroren und vollständig; ein Eintrag entsteht nur durch den Simulationsblock (complete bleibt true).
    expect(shipped.get('west')?.complete ?? true).toBe(true);
    expect(describeInventoryNotice(shipped.get('west'))?.baselinePartial ?? false).toBe(false);
  });
});

describe('Erzeugung aus den Belegen (BayWü)', () => {
  const baseline = {
    decisions: [
      { documentId: 'A', status: 'active-at-baseline' },
      { documentId: 'B', status: 'active-at-baseline' },
      { documentId: 'C', status: 'active-at-baseline' },
      { documentId: 'D', status: 'not-at-baseline' },
      { documentId: 'E', status: 'undetermined' },
    ],
  } as never;
  const manifest = {
    entries: [
      { sourceIdentity: 'A', importStatus: 'imported' },
      { sourceIdentity: 'B', importStatus: 'imported-with-warnings' },
      { sourceIdentity: 'C', importStatus: 'needs-review' },
      { sourceIdentity: 'D', importStatus: 'not-at-baseline' },
    ],
  } as never;

  it('zählt Veröffentlichtes und belegt Offenes, nie Nicht-Stichtagsnormen', () => {
    expect(buildInventoryStatus({ baseline, manifest, baselineOnlyOpen: 4 })).toEqual({
      jurisdiction: 'baywue', baselineDate: '2023-12-01', complete: false, published: 2, pending: { atBaseline: 1, baselineOnly: 4, undetermined: 1 },
    });
  });

  it('meldet vollständig, sobald nichts mehr offen ist – dann verschwindet der Hinweis', () => {
    const done = buildInventoryStatus({ baseline: { decisions: [{ documentId: 'A', status: 'active-at-baseline' }] } as never, manifest, baselineOnlyOpen: 0 });
    expect(done).toMatchObject({ complete: true, published: 2 });
  });

  it('zählt heute fehlende Stichtagsnormen ohne Nicht-Stichtags- und Nicht-Landesrecht-Fälle und ohne übernommene', () => {
    const candidates = { candidates: [
      { eventId: 'e1', outcome: 'safe' }, { eventId: 'e2', outcome: 'safe' }, { eventId: 'e3', outcome: 'missing-base' },
      { eventId: 'e4', outcome: 'not-at-baseline' }, { eventId: 'e5', outcome: 'out-of-scope' }, { eventId: 'e6', outcome: 'undetermined' },
    ] } as never;
    expect(baselineOnlyOpen({ candidates })).toBe(4);
    expect(baselineOnlyOpen({ candidates, restoredEventIds: new Set(['e1']) })).toBe(3);
    expect(baselineOnlyOpen({})).toBe(0);
  });

  it('schreibt nur den eigenen Eintrag und lässt andere Länder stehen', async () => {
    const root = await tempRoot('landesrecht-inventory-status-');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(root, 'packages/legal-core/src/config'), { recursive: true });
    await writeFile(join(root, INVENTORY_STATUS_PATH), JSON.stringify({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { ost: entry({ jurisdiction: 'ost' }) } }));
    const status = buildInventoryStatus({ baseline, manifest, baselineOnlyOpen: 0 });
    expect(await writeInventoryStatus(root, status)).toBe(true);
    expect(await writeInventoryStatus(root, status)).toBe(false);
    const written = parseInventoryStatusFile(JSON.parse(await readFile(join(root, INVENTORY_STATUS_PATH), 'utf8')));
    expect([...written.keys()]).toEqual(['baywue', 'ost']);
    expect(written.get('baywue')).toEqual(status);
  });

  it('lässt den Block simulation der Sim-Fortschreibung beim Neuschreiben des eigenen Eintrags stehen', async () => {
    const root = await tempRoot('landesrecht-inventory-status-sim-');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(root, 'packages/legal-core/src/config'), { recursive: true });
    const simulation = { status: 'SIM SOURCES PARTIAL', knownIssues: 8, presentIssues: 8, secureActs: 28, review: 41, draftsWithoutPromulgation: 1, simulationNorms: 45, updatedAt: '2026-09-28' };
    await writeFile(join(root, INVENTORY_STATUS_PATH), JSON.stringify({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { baywue: { ...entry({ jurisdiction: 'baywue' }), simulation } } }));
    const status = buildInventoryStatus({ baseline, manifest, baselineOnlyOpen: 0 });
    expect(await writeInventoryStatus(root, status)).toBe(true);
    const written = JSON.parse(await readFile(join(root, INVENTORY_STATUS_PATH), 'utf8')) as { jurisdictions: Record<string, Record<string, unknown>> };
    expect(written.jurisdictions.baywue).toEqual({ ...status, simulation });
  });
});
