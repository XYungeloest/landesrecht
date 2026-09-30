/**
 * Zentrale, abgeleitete Klassifikation einer Norm gegenüber dem Ausgangsrechtsstand (docs/DATA_MODEL.md):
 *
 *  - `baseline-unchanged`: Die Norm gehörte am Ausgangsrechtsstand zum Bestand und hat seither keine materielle
 *    Simulationsfassung und keine Aufhebung in der Simulation. Rekonstruktion oder Berichtigung der Ausgangsfassung
 *    ändern daran nichts (sie erzeugen keine Fassung nach dem Ausgangsrechtsstand).
 *  - `baseline-changed`: Die Norm gehörte am Ausgangsrechtsstand zum Bestand und wurde danach in der Simulation
 *    geändert – durch eine Fassung, die nach dem Ausgangsrechtsstand beginnt, oder durch eine Aufhebung.
 *  - `simulation-new`: Die Norm entstand erst nach dem Ausgangsrechtsstand in der Simulation; keine Fassung gilt am
 *    Ausgangsrechtsstand.
 *
 * Alle Oberflächen, die API und die Projektion lesen die Klassifikation hier; sie ist keine Heuristik über die
 * Fassungszahl, sondern folgt den Simulationsgeltungsintervallen, der Historie und dem Ausgangsrechtsstand. Bei
 * widersprüchlichen Daten wird nicht geraten, sondern abgebrochen (fail-closed). Ost (OstRecht-D1) liefert seine
 * Fassungen bereits an den Ausgangsrechtsstand angeglichen, deshalb gilt dieselbe Regel; in SQL bildet der jeweilige
 * Dialekt sie nach (`packages/runtime/src/d1-dialect.ts`).
 */
import { SIMULATION_BASELINE_DATE } from '../config/jurisdictions.ts';
import type { NormRecord } from './schema.ts';

export const SIMULATION_CHANGE_KINDS = ['baseline-unchanged', 'baseline-changed', 'simulation-new'] as const;
export type SimulationChangeKind = (typeof SIMULATION_CHANGE_KINDS)[number];

export function isSimulationChangeKind(value: unknown): value is SimulationChangeKind {
  return typeof value === 'string' && (SIMULATION_CHANGE_KINDS as readonly string[]).includes(value);
}

export interface SimulationChange {
  kind: SimulationChangeKind;
  /** Jüngste Änderung in der Simulation: Beginn der jüngsten Sim-Fassung bzw. Aufhebungstag; bei neuen Normen der Erlass. `null` bei unverändertem Ausgangsrecht. */
  lastChangeDate: string | null;
  /** Erste Fassung nach dem Ausgangsrechtsstand (bei `simulation-new` der Beginn der Norm). */
  firstSimulationDate: string | null;
  /** Anzahl der Fassungen, die nach dem Ausgangsrechtsstand beginnen. */
  simulationVersionCount: number;
  /** In der Simulation aufgehoben (Aufhebung nach dem Ausgangsrechtsstand). */
  repealedInSimulation: boolean;
}

export class SimulationChangeError extends Error {
  constructor(slug: string, message: string) {
    super(`${slug}: ${message}`);
    this.name = 'SimulationChangeError';
  }
}

export function classifySimulationChange(record: Pick<NormRecord, 'meta' | 'versions' | 'history'>, baselineDate: string = SIMULATION_BASELINE_DATE): SimulationChange {
  const slug = record.meta.slug;
  if (record.versions.length === 0) throw new SimulationChangeError(slug, 'Norm ohne Fassungen ist nicht klassifizierbar');
  const starts = record.versions.map((version) => version.simulationValidFrom).sort();
  if (starts[0]! < baselineDate) throw new SimulationChangeError(slug, `Fassung beginnt vor dem Ausgangsrechtsstand (${starts[0]})`);
  const baselineVersions = record.versions.filter((version) => version.simulationValidFrom === baselineDate);
  const simulationVersions = record.versions.filter((version) => version.simulationValidFrom > baselineDate);
  if (baselineVersions.length > 1) throw new SimulationChangeError(slug, `${baselineVersions.length} Fassungen beginnen am Ausgangsrechtsstand`);
  const repeals = record.history.entries.filter((entry) => entry.type === 'repeal').map((entry) => entry.date).sort();
  const repealAfter = repeals.filter((date) => date > baselineDate);
  const repealedInSimulation = repealAfter.length > 0 || (record.meta.status === 'repealed' && record.meta.expiryDate !== undefined && record.meta.expiryDate >= baselineDate && baselineVersions.length > 0);
  if (baselineVersions.length === 0) {
    // Neu in der Simulation: nichts davon galt am Ausgangsrechtsstand.
    if (repeals.some((date) => date <= baselineDate)) throw new SimulationChangeError(slug, 'Aufhebung vor dem Ausgangsrechtsstand bei einer erst danach entstandenen Norm');
    return { kind: 'simulation-new', lastChangeDate: starts[starts.length - 1]!, firstSimulationDate: starts[0]!, simulationVersionCount: simulationVersions.length, repealedInSimulation: repealAfter.length > 0 };
  }
  if (repeals.some((date) => date < baselineDate)) throw new SimulationChangeError(slug, 'Aufhebung vor dem Ausgangsrechtsstand trotz Ausgangsfassung');
  if (simulationVersions.length === 0 && !repealedInSimulation) {
    return { kind: 'baseline-unchanged', lastChangeDate: null, firstSimulationDate: null, simulationVersionCount: 0, repealedInSimulation: false };
  }
  const changeDates = [...simulationVersions.map((version) => version.simulationValidFrom), ...repealAfter, ...(repealedInSimulation && repealAfter.length === 0 && record.meta.expiryDate ? [record.meta.expiryDate] : [])].sort();
  return {
    kind: 'baseline-changed',
    lastChangeDate: changeDates[changeDates.length - 1]!,
    firstSimulationDate: changeDates[0]!,
    simulationVersionCount: simulationVersions.length,
    repealedInSimulation,
  };
}
