/**
 * `ledger-sync`: Ereignisstatus aus dem Konsolidierungsmanifest ableiten – nur pending → applied, fachliche Status
 * bleiben, Widersprüche sind Fehler, Schreiben ist idempotent.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LEDGER_SCHEMA, renderLedgerSyncLines, syncLedger } from '@landesrecht/importer-simulation/ledger/sync.ts';

const RECIPE = 'data/simulation/west/amendments/aendg-west/schulg-west.json';

function event(id: string, type: string, status: string, act: string | null, targets: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type, eventDate: '2026-05-17', effectiveDate: '2026-05-18', publication: null, evidence: [], act: { slug: act, title: id }, targets: targets.map((slug) => ({ slug, kind: 'baseline-norm', title: slug })), confidence: 'high', status, note: 'Test', ...extra };
}

describe('ledger-sync', () => {
  let root: string;
  const write = async (relative: string, value: unknown): Promise<void> => {
    await mkdir(join(root, relative, '..'), { recursive: true });
    await writeFile(join(root, relative), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'landesrecht-ledger-'));
    await write('data/simulation/west/consolidation-manifest.json', {
      schemaVersion: 'landesrecht-simulation-consolidation-manifest/1', jurisdiction: 'west', generatedAt: '2026-09-28T00:00:00.000Z', baselineDate: '2023-12-01', referenceDate: '2026-09-01',
      counts: { acts: 2, recipes: 1, versions: 1, repeals: 0, blockedTargets: 0 },
      acts: [{ slug: 'aendg-west', versionId: '2026-05-18' }, { slug: 'befristet-west', versionId: '2026-05-18' }],
      recipes: [{ recipe: RECIPE, amendmentAct: 'aendg-west', target: 'schulg-west', effectiveDate: '2026-05-18', repealsLaw: false, seedVersionId: '2023-12-01', seedHash: 'x', versionId: '2026-05-18', versionSha256: 'y' }],
      blockedTargets: [],
    });
    await write('content/norms/west/befristet-west/meta.json', { slug: 'befristet-west', expiryDate: '2026-12-31' });
    await write('data/simulation/west/ledger.json', {
      schemaVersion: LEDGER_SCHEMA, jurisdiction: 'west',
      events: [
        event('e-enact', 'enact', 'pending', 'aendg-west', []),
        event('e-amend', 'amend', 'pending', 'aendg-west', ['schulg-west']),
        event('e-amend-other', 'amend', 'pending', 'aendg-west', ['anderes-west']),
        event('e-expire', 'expire', 'pending', 'befristet-west', ['befristet-west']),
        event('e-unmaterialized', 'enact', 'pending', 'fehlt-west', []),
        event('e-review', 'enact', 'review', null, [], { reasonCode: 'promulgation-unclear' }),
        event('e-blocked', 'amend', 'blocked', 'aendg-west', ['gesperrt-west'], { reasonCode: 'missing-baseline-target' }),
      ],
    });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('setzt nur Ereignisse mit materialisiertem Akt (und Rezept) auf applied und lässt fachliche Status stehen', async () => {
    const dry = await syncLedger(root, 'west', { write: false });
    expect(dry.errors).toEqual([]);
    expect(dry.changes).toEqual([
      { id: 'e-enact', from: 'pending', to: 'applied' },
      { id: 'e-amend', from: 'pending', to: 'applied', recipe: RECIPE },
      { id: 'e-expire', from: 'pending', to: 'applied' },
    ]);
    expect(dry.pending.map((entry) => entry.id)).toEqual(['e-amend-other', 'e-unmaterialized']);
    expect(dry.counts).toEqual({ applied: 3, pending: 2, review: 1, blocked: 1 });
    expect(dry.written).toBe(false);
    expect(renderLedgerSyncLines(dry).at(-1)).toMatch(/Dry-run: 3 Ereignis/u);

    const written = await syncLedger(root, 'west', { write: true });
    expect(written.written).toBe(true);
    const ledger = JSON.parse(await readFile(join(root, 'data/simulation/west/ledger.json'), 'utf8')) as { events: Array<Record<string, unknown>> };
    const amend = ledger.events.find((entry) => entry.id === 'e-amend')!;
    expect(amend.status).toBe('applied');
    // `recipe` steht direkt hinter `status`; die übrige Schlüsselfolge bleibt.
    expect(Object.keys(amend).slice(Object.keys(amend).indexOf('status'), Object.keys(amend).indexOf('status') + 3)).toEqual(['status', 'recipe', 'note']);
    expect(ledger.events.map((entry) => entry.status)).toEqual(['applied', 'applied', 'pending', 'applied', 'pending', 'review', 'blocked']);

    const again = await syncLedger(root, 'west', { write: true });
    expect(again.changes).toEqual([]);
    expect(again.written).toBe(false);
  });

  it('verlangt für review/blocked einen gültigen reasonCode', async () => {
    const ledger = JSON.parse(await readFile(join(root, 'data/simulation/west/ledger.json'), 'utf8')) as { events: Array<Record<string, unknown>> };
    await write('data/simulation/west/ledger.json', { schemaVersion: LEDGER_SCHEMA, jurisdiction: 'west', events: [...ledger.events, event('e-ohne-grund', 'enact', 'review', null, [])] });
    const result = await syncLedger(root, 'west', { write: true });
    expect(result.errors).toEqual([expect.stringMatching(/e-ohne-grund: review ohne gültigen reasonCode/u)]);
    await write('data/simulation/west/ledger.json', { schemaVersion: LEDGER_SCHEMA, jurisdiction: 'west', events: ledger.events });
  });

  it('meldet ein applied-Ereignis ohne Akt oder Rezept als Widerspruch und schreibt dann nichts', async () => {
    const ledger = JSON.parse(await readFile(join(root, 'data/simulation/west/ledger.json'), 'utf8')) as { events: Array<Record<string, unknown>> };
    ledger.events.push(event('e-false-applied', 'amend', 'applied', 'aendg-west', ['anderes-west']));
    await write('data/simulation/west/ledger.json', { schemaVersion: LEDGER_SCHEMA, jurisdiction: 'west', events: ledger.events });
    const result = await syncLedger(root, 'west', { write: true });
    expect(result.errors).toEqual([expect.stringMatching(/e-false-applied: applied, aber kein angewandtes Rezept/u)]);
    expect(result.written).toBe(false);
  });
});
