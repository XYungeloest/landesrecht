/**
 * Vollständigkeitsstatus der Simulationsrechtsfortschreibung: `completeness.json` (fail-closed), der Block
 * `simulation` in `inventory-status.json`, getrennte Baseline- und Sim-Normzahl und die Regel, dass der Hinweis
 * der Oberfläche automatisch entfällt, sobald der Stichtagsbestand vollständig und `SIM LEGAL STATE COMPLETE` ist.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { describeInventoryNotice, INVENTORY_STATUS_SCHEMA, parseInventoryStatusFile, parseSimulationInventoryStatus, type InventoryStatus, type SimulationInventoryStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import { runCompleteness } from '@landesrecht/importer-simulation/completeness/command.ts';
import { COMPLETENESS_SCHEMA, completenessPath, completenessTotals, parseCompletenessFile } from '@landesrecht/importer-simulation/completeness/schema.ts';
import { buildSimulationInventoryStatus, countNorms, INVENTORY_STATUS_PATH, mergeSimulationStatus, writeSimulationInventoryStatus } from '@landesrecht/importer-simulation/completeness/status.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';
import { buildFixtureNorms } from '../helpers/fixture-corpus.ts';

afterAll(cleanupTempRoots);

const SHA = 'c'.repeat(64);

function completeness(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: COMPLETENESS_SCHEMA,
    jurisdiction: 'west',
    assessedAt: '2026-09-28',
    status: 'SIM SOURCES PARTIAL',
    series: [
      { gazette: 'GV. West', seriesTitle: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland', knownIssues: ['2024 Nr. 1', '2024 Nr. 2', '2024 Nr. 3', '2026 Nr. 2'], presentIssues: ['2024 Nr. 2', '2024 Nr. 3', '2026 Nr. 2'], missingIssues: ['2024 Nr. 1'], suspiciousIssues: ['2026 Nr. 2'], evidence: [SHA] },
      { gazette: 'MBl. WD', knownIssues: ['2025 Nr. 1', '2025 Nr. 2', '2025 Nr. 3'], presentIssues: ['2025 Nr. 1', '2025 Nr. 2', '2025 Nr. 3'], missingIssues: [] },
    ],
    standaloneActs: { present: 12, evidenceOnly: 2 },
    unclearPeriods: [{ from: '2024-06-01', to: '2025-10-19', note: 'keine Ausgabe bekannt' }],
    acts: { secure: 31, review: 4, blocked: 1, draftsWithoutPromulgation: 3 },
    sourceGaps: [{ id: 'gv-2024-1', class: 'gazette-issue-missing', title: 'GV. West 2024 Nr. 1', existenceEvidence: 'Inhaltsverzeichnis von Nr. 2', series: 'GV. West', issue: '2024 Nr. 1' }],
    notes: ['Nr. 1/2024 laut Inhaltsverzeichnis von Nr. 2 vorhanden, Datei fehlt.'],
    ...overrides,
  };
}

const complete = (): Record<string, unknown> => completeness({
  status: 'SIM LEGAL STATE COMPLETE',
  series: [{ gazette: 'GV. West', knownIssues: ['2026 Nr. 2'], presentIssues: ['2026 Nr. 2'], missingIssues: [] }],
  unclearPeriods: [],
  sourceGaps: [],
  acts: { secure: 5, review: 0, blocked: 0, draftsWithoutPromulgation: 1 },
});

describe('completeness.json', () => {
  it('liest die Bewertung und ergänzt fehlende Listen mit leeren Werten', () => {
    const file = parseCompletenessFile(completeness(), 'west/completeness.json');
    expect(file.series[1]).toEqual({ gazette: 'MBl. WD', knownIssues: ['2025 Nr. 1', '2025 Nr. 2', '2025 Nr. 3'], presentIssues: ['2025 Nr. 1', '2025 Nr. 2', '2025 Nr. 3'], missingIssues: [], suspiciousIssues: [], evidence: [] });
    expect(completenessTotals(file)).toEqual({ knownIssues: 7, presentIssues: 6, missingIssues: 1, secureActs: 31, review: 5, draftsWithoutPromulgation: 3 });
    expect(completenessPath('baywue')).toBe('data/simulation/baywue/completeness.json');
  });

  it('lehnt widersprüchliche Angaben ab: fehlende Nummern, „vollständig“ mit Lücken, Prüfung bei vollständigem Rechtsstand', () => {
    expect(() => parseCompletenessFile(completeness({ series: [{ gazette: 'GV. West', knownIssues: ['1'], presentIssues: ['1'], missingIssues: ['1'] }] }))).toThrow(/missingIssues/u);
    expect(() => parseCompletenessFile(completeness({ series: [{ gazette: 'GV. West', knownIssues: ['1'], presentIssues: ['2'], missingIssues: ['1'] }] }))).toThrow(/keine bekannte Ausgabe/u);
    expect(() => parseCompletenessFile(completeness({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY' }))).toThrow(/fehlenden Ausgaben/u);
    // Nur mögliche Lücken (ungeklärte Zeiträume, Klasse D) sperren „vollständig“ nicht; Klassen A–C schon.
    expect(() => parseCompletenessFile(completeness({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY', series: [], sourceGaps: [], unclearPeriods: [{ from: '2024-01-01', to: '2024-02-01', note: 'x' }] }))).not.toThrow();
    expect(() => parseCompletenessFile(completeness({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY', series: [], sourceGaps: [{ id: 'x', class: 'evidence-incomplete', title: 'x', existenceEvidence: 'x', missing: ['annex'] }] }))).toThrow(/Klassen A–C/u);
    expect(() => parseCompletenessFile(completeness({ sourceGaps: [] }))).toThrow(/nicht als Lücke der Klasse A/u);
    expect(() => parseCompletenessFile(completeness({ sourceGaps: [{ id: 'x', class: 'gazette-issue-missing', title: 'x', existenceEvidence: 'x', series: 'GV. West', issue: '2024 Nr. 2' }] }))).toThrow(/keine fehlende Ausgabe/u);
    expect(() => parseCompletenessFile(completeness({ series: [], sourceGaps: [{ id: 'x', class: 'evidence-incomplete', title: 'x', existenceEvidence: 'x' }] }))).toThrow(/was fehlt/u);
    expect(() => parseCompletenessFile(completeness({ series: [], sourceGaps: [{ id: 'x', class: 'possible-gap', title: 'x', existenceEvidence: 'x', acquisition: { priority: 'P3', confidence: 'low', status: 'open' } }] }))).toThrow(/keine Akquisitionsaufgabe/u);
    expect(() => parseCompletenessFile(completeness({ series: [], sourceGaps: [{ id: 'x', class: 'standalone-act-missing', title: 'x', existenceEvidence: 'x', blocks: { events: ['e'] }, acquisition: { priority: 'P1', confidence: 'low', status: 'open' } }] }))).toThrow(/P1 verlangt belegte Existenz/u);
    expect(() => parseCompletenessFile(completeness({ series: [], sourceGaps: [{ id: 'x', class: 'standalone-act-missing', title: 'x', existenceEvidence: 'x', acquisition: { priority: 'P1', confidence: 'high', status: 'open' } }] }))).toThrow(/entsperrt/u);
    expect(() => parseCompletenessFile(complete())).not.toThrow();
    expect(() => parseCompletenessFile({ ...complete(), acts: { secure: 5, review: 1, blocked: 0, draftsWithoutPromulgation: 0 } })).toThrow(/Prüfung oder Sperre/u);
    expect(() => parseCompletenessFile(completeness({ status: 'FERTIG' }))).toThrow(/status/u);
    expect(() => parseCompletenessFile(completeness({ jurisdiction: 'sachsen' }))).toThrow(/Jurisdiktion/u);
    expect(() => parseCompletenessFile(completeness({ series: [{ gazette: 'GV. West', knownIssues: [], presentIssues: [], missingIssues: [] }, { gazette: 'GV. West', knownIssues: [], presentIssues: [], missingIssues: [] }] }))).toThrow(/doppelt/u);
    expect(() => parseCompletenessFile(completeness({ series: [{ gazette: 'GV. West', knownIssues: [], presentIssues: [], missingIssues: [], evidence: ['kein-hash'] }] }))).toThrow(/SHA-256/u);
  });
});

describe('Block simulation in inventory-status.json', () => {
  const norms = buildFixtureNorms();

  it('zählt Baseline- und Sim-Normen getrennt und baut den Status aus der Bewertung', () => {
    expect(countNorms(norms)).toEqual({ baselineNorms: 3, simulationNorms: 1 });
    const simulation = buildSimulationInventoryStatus(parseCompletenessFile(completeness()), { simulationNorms: 1 });
    expect(simulation).toEqual({ status: 'SIM SOURCES PARTIAL', knownIssues: 7, presentIssues: 6, secureActs: 31, review: 5, draftsWithoutPromulgation: 3, simulationNorms: 1, updatedAt: '2026-09-28' });
    expect(parseSimulationInventoryStatus(simulation, 'west.simulation')).toEqual(simulation);
    expect(() => parseSimulationInventoryStatus({ ...simulation, presentIssues: 8 }, 'x')).toThrow(/übersteigt/u);
    expect(() => parseSimulationInventoryStatus({ ...simulation, status: 'SIM LEGAL STATE COMPLETE' }, 'x')).toThrow(/bekannten Ausgaben/u);
    expect(() => parseSimulationInventoryStatus({ ...simulation, updatedAt: 'gestern' }, 'x')).toThrow(/ISO-Datum/u);
  });

  it('legt West mit vollständiger Baseline neu an und lässt den Stichtagsteil des Importers unberührt', () => {
    const simulation: SimulationInventoryStatus = buildSimulationInventoryStatus(parseCompletenessFile(completeness()), { simulationNorms: 4 });
    expect(mergeSimulationStatus(undefined, 'west', simulation, { baselineNorms: 1482 })).toEqual({ jurisdiction: 'west', baselineDate: '2023-12-01', complete: true, published: 1482, pending: { atBaseline: 0, baselineOnly: 0, undetermined: 0 }, simulation });
    const nsh: InventoryStatus = { jurisdiction: 'nsh', baselineDate: '2023-12-01', complete: false, published: 2450, pending: { atBaseline: 534, baselineOnly: 5, undetermined: 17 } };
    expect(mergeSimulationStatus(nsh, 'nsh', simulation, { baselineNorms: 9 })).toEqual({ ...nsh, simulation });
  });

  it('der Hinweis entfällt genau dann, wenn Stichtagsbestand und Simulationsrechtsstand vollständig sind', () => {
    const partial = buildSimulationInventoryStatus(parseCompletenessFile(completeness()), { simulationNorms: 1 });
    const done = buildSimulationInventoryStatus(parseCompletenessFile(complete()), { simulationNorms: 1 });
    const west = (simulation?: SimulationInventoryStatus): InventoryStatus => ({ jurisdiction: 'west', baselineDate: '2023-12-01', complete: true, published: 1482, pending: { atBaseline: 0, baselineOnly: 0, undetermined: 0 }, ...(simulation ? { simulation } : {}) });
    expect(describeInventoryNotice(undefined)).toBeUndefined();
    expect(describeInventoryNotice(west())).toBeUndefined();
    expect(describeInventoryNotice(west(done))).toBeUndefined();
    expect(describeInventoryNotice(west(partial))).toMatchObject({ baselinePartial: false, simulationPartial: true });
    expect(describeInventoryNotice({ ...west(done), complete: false })).toMatchObject({ baselinePartial: true, simulationPartial: false });
    expect(describeInventoryNotice(west({ ...done, status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY' }))).toMatchObject({ simulationPartial: true });
  });

  it('der Befehl schreibt nur mit --write und nur den eigenen Block; ohne Bewertung wird ein Land übergangen', async () => {
    const root = await tempRoot('landesrecht-simulation-completeness-');
    await mkdir(join(root, 'packages/legal-core/src/config'), { recursive: true });
    await writeFile(join(root, INVENTORY_STATUS_PATH), JSON.stringify({ schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: { nsh: { jurisdiction: 'nsh', baselineDate: '2023-12-01', complete: false, published: 2450, pending: { atBaseline: 534, baselineOnly: 5, undetermined: 17 } } } }));
    await mkdir(join(root, 'data/simulation/west'), { recursive: true });
    await writeFile(join(root, completenessPath('west')), JSON.stringify(completeness()));
    const lines: string[] = [];
    const io = { print: (line: string) => lines.push(line), error: (line: string) => lines.push(`! ${line}`) };
    expect(await runCompleteness({ write: false, json: false }, root, io)).toBe(0);
    expect(lines.some((line) => line.startsWith('west: SIM SOURCES PARTIAL'))).toBe(true);
    expect(lines.at(-1)).toContain('Dry-run');
    expect(parseInventoryStatusFile(JSON.parse(await readFile(join(root, INVENTORY_STATUS_PATH), 'utf8'))).get('west')).toBeUndefined();

    expect(await runCompleteness({ write: true, json: false }, root, io)).toBe(0);
    const written = parseInventoryStatusFile(JSON.parse(await readFile(join(root, INVENTORY_STATUS_PATH), 'utf8')));
    expect([...written.keys()]).toEqual(['nsh', 'west']);
    expect(written.get('west')).toMatchObject({ complete: true, published: 0, simulation: { status: 'SIM SOURCES PARTIAL', secureActs: 31, simulationNorms: 0 } });
    expect(written.get('nsh')).toMatchObject({ complete: false, published: 2450 });
    expect(written.get('nsh')?.simulation).toBeUndefined();
    expect(await writeSimulationInventoryStatus(root, 'west', written.get('west')!.simulation!, { baselineNorms: 0 })).toBe(false);
    expect(await runCompleteness({ write: false, json: false, jurisdiction: 'baywue' }, root, io)).toBe(1);
  });
});

describe('SIM_PUBLICATION_INVENTORY.md', () => {
  it('rendert je Land Blattreihen mit fehlenden und verdächtigen Ausgaben sowie die ungeklärten Zeiträume', async () => {
    const { renderPublicationInventory } = await import('@landesrecht/importer-simulation/completeness/inventory-doc.ts');
    const { parseCompletenessFile } = await import('@landesrecht/importer-simulation/completeness/schema.ts');
    const file = parseCompletenessFile({
      schemaVersion: 'landesrecht-simulation-completeness/1', jurisdiction: 'west', assessedAt: '2026-09-28', status: 'SIM SOURCES PARTIAL',
      series: [{ gazette: 'MBl. WD', seriesTitle: 'Ministerialblatt', knownIssues: ['2026 Nr. 1', '2026 Nr. 2'], presentIssues: ['2026 Nr. 1'], missingIssues: ['2026 Nr. 2'], suspiciousIssues: [], evidence: [] }],
      standaloneActs: { present: 1, evidenceOnly: 0 },
      unclearPeriods: [{ from: '2026-05-18', to: '2026-09-17', note: 'Ministerialblatt 2026 Nr. 2 fehlt.' }],
      acts: { secure: 1, review: 0, blocked: 0, draftsWithoutPromulgation: 0 },
      sourceGaps: [{ id: 'mbl-2026-2', class: 'gazette-issue-missing', title: 'MBl. WD 2026 Nr. 2', existenceEvidence: 'Nummernfolge', series: 'MBl. WD', issue: '2026 Nr. 2', acquisition: { priority: 'P2', confidence: 'high', status: 'open' } }],
      notes: ['Fehlende Quellen: MBl. WD 2026 Nr. 2.'],
    });
    const text = renderPublicationInventory([{ jurisdiction: 'west', file }]);
    expect(text).toContain('| MBl. WD – Ministerialblatt | 2 | 1 | 2026 Nr. 2 | – |');
    expect(text).toContain('- 2026-05-18 – 2026-09-17: Ministerialblatt 2026 Nr. 2 fehlt.');
    expect(text).toContain('- Fehlende Quellen: MBl. WD 2026 Nr. 2.');
    expect(text).toContain('- `mbl-2026-2` MBl. WD 2026 Nr. 2 (P2)');
  });
});
