/**
 * Getrenntes Sim-Statusmodell (docs/SIMULATION_IMPORT.md, Abschnitt 7.2): Blattabdeckung, Einzelverkündungen, Evidenz,
 * mögliche Lücken und Ereignisse; strenger Gesamtstatus; Baseline-Status unabhängig davon; Akquisitionsliste.
 */
import { describe, expect, it } from 'vitest';

import { parseInventoryStatusFile, parseSimulationInventoryStatus, summarizeJurisdictionStatus, type InventoryStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import { acquisitionQueueFile, renderAcquisitionDoc } from '@landesrecht/importer-simulation/completeness/acquisition.ts';
import { assessSimulationSources, type AssessmentEvent } from '@landesrecht/importer-simulation/completeness/assessment.ts';
import { COMPLETENESS_SCHEMA, parseCompletenessFile } from '@landesrecht/importer-simulation/completeness/schema.ts';
import { buildSimulationInventoryStatus } from '@landesrecht/importer-simulation/completeness/status.ts';

function file(overrides: Record<string, unknown> = {}) {
  return parseCompletenessFile({
    schemaVersion: COMPLETENESS_SCHEMA,
    jurisdiction: 'baywue',
    assessedAt: '2026-09-29',
    status: 'SIM SOURCES PARTIAL',
    series: [{ gazette: 'GVBl. BayWü', knownIssues: ['2026 Nr. 1', '2026 Nr. 2'], presentIssues: ['2026 Nr. 1', '2026 Nr. 2'], missingIssues: [] }],
    standaloneActs: { present: 3, evidenceOnly: 1 },
    unclearPeriods: [],
    acts: { secure: 2, review: 0, blocked: 0, draftsWithoutPromulgation: 0 },
    sourceGaps: [],
    notes: [],
    ...overrides,
  });
}

const applied: AssessmentEvent[] = [
  { id: 'e1', status: 'applied', eventDate: '2026-01-10' },
  { id: 'e2', status: 'applied', eventDate: '2026-05-30' },
];

describe('Sim-Quellenstatus: strenger Gesamtstatus', () => {
  it('1. alle Blattausgaben vorhanden, aber ein belegter Einzelakt fehlt → PARTIAL bei gazetteCoverage COMPLETE', () => {
    const events: AssessmentEvent[] = [...applied, { id: 'e3', status: 'blocked', eventDate: '2026-05-14', reasonCode: 'missing-source' }];
    const { sources, partialReasons } = assessSimulationSources(file({ sourceGaps: [{ id: 'erdbeben', class: 'standalone-act-missing', title: 'Erdbebenhilfegesetz', existenceEvidence: 'Aufhebungsgesetz', blocks: { events: ['e3'], norms: ['erdbebenhilfeg'] }, acquisition: { priority: 'P1', confidence: 'high', status: 'open' } }] }), events);
    expect(sources.gazetteCoverage).toEqual({ status: 'COMPLETE', knownIssues: 2, presentIssues: 2, missingIssues: 0, suspiciousIssues: 0 });
    expect(sources.standaloneSourceCoverage).toMatchObject({ status: 'PARTIAL', missing: 1 });
    expect(sources.simulationStatus).toBe('PARTIAL');
    expect(sources.missingSourceCount).toBe(1);
    expect(partialReasons.join(' ')).toMatch(/Einzelverkündung/u);
  });

  it('2. eine bekannte Blattausgabe fehlt → PARTIAL; angekündigte Ausgabe ohne Nummernfolge zählt als bekannt', () => {
    const linked = assessSimulationSources(file({
      series: [{ gazette: 'MBl. WD', knownIssues: ['2026 Nr. 1', '2026 Nr. 2'], presentIssues: ['2026 Nr. 1'], missingIssues: ['2026 Nr. 2'] }],
      sourceGaps: [{ id: 'mbl', class: 'gazette-issue-missing', title: 'MBl. WD 2026 Nr. 2', existenceEvidence: 'Nummernfolge', series: 'MBl. WD', issue: '2026 Nr. 2' }],
    }), applied);
    expect(linked.sources.gazetteCoverage).toMatchObject({ status: 'PARTIAL', knownIssues: 2, presentIssues: 1, missingIssues: 1 });
    expect(linked.sources.simulationStatus).toBe('PARTIAL');
    const announced = assessSimulationSources(file({ sourceGaps: [{ id: 'blatt', class: 'gazette-issue-missing', title: 'angekündigtes Blatt', existenceEvidence: 'Verkündungsmitteilung' }] }), applied);
    expect(announced.sources.gazetteCoverage).toMatchObject({ status: 'PARTIAL', knownIssues: 3, presentIssues: 2, missingIssues: 1 });
  });

  it('3. nur ein möglicher Zeitraum oder eine mögliche Lücke → keine sicher fehlende Ausgabe, Status bleibt COMPLETE', () => {
    const possible = file({
      status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY',
      unclearPeriods: [{ from: '2025-04-30', to: '2026-05-28', note: 'keine Ausgabe bekannt' }],
      sourceGaps: [{ id: 'nr5', class: 'possible-gap', title: 'GVBl. BayWü 2026 Nr. 5?', existenceEvidence: 'kein Beleg' }],
    });
    const { sources } = assessSimulationSources(possible, applied);
    expect(sources.gazetteCoverage.missingIssues).toBe(0);
    expect(sources.missingSourceCount).toBe(0);
    expect(sources.possibleGapCount).toBe(1);
    expect(sources.knownUnclearPeriods).toBe(1);
    expect(sources.simulationStatus).toBe('COMPLETE');
  });

  it('4. ein eingefrorener Ausgangsrechtsstand bleibt FROZEN, unabhängig vom Sim-Status', () => {
    const { sources } = assessSimulationSources(file({ sourceGaps: [{ id: 'anlage', class: 'evidence-incomplete', title: 'Haushaltsplan', existenceEvidence: 'Verweis', missing: ['annex'] }] }), applied);
    const simulation = buildSimulationInventoryStatus(file({ sourceGaps: [{ id: 'anlage', class: 'evidence-incomplete', title: 'Haushaltsplan', existenceEvidence: 'Verweis', missing: ['annex'] }] }), { simulationNorms: 2 }, sources);
    const entry: InventoryStatus = { jurisdiction: 'baywue', baselineDate: '2023-12-01', complete: false, published: 1618, pending: { atBaseline: 1, baselineOnly: 0, undetermined: 0 }, baselineFreeze: { frozen: true, assessedAt: '2026-09-29' }, simulation };
    const summary = summarizeJurisdictionStatus(entry);
    expect(summary).toMatchObject({ baselineStatus: 'FROZEN', simulationStatus: 'PARTIAL', gazetteCoverage: { status: 'COMPLETE' }, evidenceIncompleteCount: 1 });
    // Die Statusdatei trägt das Modell verlustfrei (Parser ist fail-closed gegen widersprüchliche Ebenen).
    const parsed = parseInventoryStatusFile({ schemaVersion: 'landesrecht-inventory-status/1', jurisdictions: { baywue: entry } }).get('baywue');
    expect(summarizeJurisdictionStatus(parsed)).toEqual(summary);
    expect(() => parseSimulationInventoryStatus({ ...simulation, sources: { ...sources, simulationStatus: 'COMPLETE' } }, 'x')).toThrow(/COMPLETE verlangt/u);
    expect(() => parseSimulationInventoryStatus({ ...simulation, sources: { ...sources, gazetteCoverage: { ...sources.gazetteCoverage, status: 'PARTIAL' } } }, 'x')).toThrow(/gazetteCoverage/u);
  });

  it('5. missing-baseline-target: Ziel außerhalb des eingefrorenen Bestands → blocked, aber nicht quellenbedingt; Ziel im Bestand ist ein Fehler', () => {
    const events: AssessmentEvent[] = [
      ...applied,
      { id: 'b1', status: 'blocked', eventDate: '2026-08-01', reasonCode: 'missing-baseline-target', targets: [{ slug: 'bayeug-baywue' }] },
      { id: 'b2', status: 'blocked', eventDate: '2026-08-31', reasonCode: 'missing-baseline-target', targets: [{ slug: 'bayeug-baywue' }, { title: 'Richtlinie – nicht im Bestand' }] },
    ];
    const { sources } = assessSimulationSources(file({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY' }), events, { hasBaselineVersion: () => false });
    expect(sources.events.blockedByBaselineTarget).toEqual({ events: 2, targets: 2, excludedFromFrozenBaseline: 1, notInBaselineInventory: 1 });
    expect(sources.events.sourceCaused).toBe(0);
    expect(sources.simulationStatus).toBe('COMPLETE');
    expect(sources.lastSourceDate).toBe('2026-08-31');
    expect(() => assessSimulationSources(file({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY' }), events, { hasBaselineVersion: (slug) => slug === 'bayeug-baywue' })).toThrow(/steht im Ausgangsbestand/u);
    // SIM LEGAL STATE COMPLETE verlangt zusätzlich, dass kein Ereignis gesperrt ist.
    expect(() => assessSimulationSources(file({ status: 'SIM LEGAL STATE COMPLETE' }), events)).toThrow(/LEGAL STATE COMPLETE/u);
  });

  it('6. keine Lücken → COMPLETE; erklärter und berechneter Status müssen übereinstimmen', () => {
    const { sources, partialReasons } = assessSimulationSources(file({ status: 'SIM LEGAL STATE COMPLETE' }), applied);
    expect(sources.simulationStatus).toBe('COMPLETE');
    expect(partialReasons).toEqual([]);
    expect(() => assessSimulationSources(file(), applied)).toThrow(/berechnet COMPLETE/u);
    const review: AssessmentEvent[] = [...applied, { id: 'r', status: 'review', eventDate: '2026-02-01', reasonCode: 'promulgation-unclear' }];
    expect(() => assessSimulationSources(file({ status: 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY' }), review)).toThrow(/berechnet PARTIAL/u);
    expect(() => assessSimulationSources(file({ sourceGaps: [{ id: 'x', class: 'standalone-act-missing', title: 'x', existenceEvidence: 'x', blocks: { events: ['fehlt'] } }] }), applied)).toThrow(/unbekanntes Ledger-Ereignis/u);
  });
});

describe('Akquisitionsliste', () => {
  it('enthält nur Lücken mit Akquisitionseintrag, sortiert nach Priorität', () => {
    const assessed = [{ jurisdiction: 'baywue' as const, file: file({ sourceGaps: [
      { id: 'b-p3', class: 'standalone-act-missing', title: 'Originalblatt', existenceEvidence: 'Mitteilung', acquisition: { priority: 'P3', confidence: 'high', status: 'open' } },
      { id: 'a-p1', class: 'standalone-act-missing', title: 'Erdbebenhilfegesetz', existenceEvidence: 'Aufhebungsgesetz', blocks: { norms: ['erdbebenhilfeg'] }, acquisition: { priority: 'P1', confidence: 'high', status: 'open' } },
      { id: 'c-none', class: 'evidence-incomplete', title: 'Druckmangel', existenceEvidence: 'Ausgabe', missing: ['wording'] },
    ] }) }];
    const queue = acquisitionQueueFile(assessed);
    expect(queue.totals).toEqual({ all: 2, P1: 1, P2: 0, P3: 1 });
    expect(queue.entries.map((entry) => entry.id)).toEqual(['a-p1', 'b-p3']);
    expect(queue.entries[0]).toMatchObject({ jurisdiction: 'baywue', sourceType: 'standalone-act-missing', expectedTitle: 'Erdbebenhilfegesetz', priority: 'P1', confidence: 'high', status: 'open' });
    const doc = renderAcquisitionDoc(assessed);
    expect(doc).toContain('## P1');
    expect(doc).toContain('- **Entsperrt:** Norm `erdbebenhilfeg`.');
    expect(doc).not.toContain('Druckmangel');
  });
});
