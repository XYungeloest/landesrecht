/**
 * Block `simulation` der Statusdatei `packages/legal-core/src/config/inventory-status.json` aus der
 * Vollständigkeitsbewertung eines Landes. Der Stichtagsteil (`complete`, `published`, `pending`) bleibt Sache der
 * Importer und wird nie überschrieben; fehlt ein Eintrag (West: Baseline eingefroren und vollständig), entsteht
 * er mit `complete: true` und der aus dem Bestand gezählten Baseline-Normzahl. Baseline-Normen (Fassung am
 * Ausgangsrechtsstand) und eigene Normen der Simulation (erste Fassung danach) werden getrennt gezählt.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { INVENTORY_STATUS_SCHEMA, parseInventoryStatusFile, type InventoryStatus, type SimulationInventoryStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionNorms } from '@landesrecht/legal-core/lib/loader.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { completenessTotals, type CompletenessFile } from './schema.ts';

export const INVENTORY_STATUS_PATH = 'packages/legal-core/src/config/inventory-status.json';

export interface NormCounts {
  /** Normen mit einer Fassung am Ausgangsrechtsstand (übernommener Bestand). */
  baselineNorms: number;
  /** Normen, deren erste Fassung nach dem Ausgangsrechtsstand beginnt (durch die Simulation entstanden). */
  simulationNorms: number;
}

export function countNorms(records: readonly NormRecord[]): NormCounts {
  let baselineNorms = 0;
  let simulationNorms = 0;
  for (const record of records) {
    const first = record.versions[0];
    if (!first) continue;
    if (first.simulationValidFrom > SIMULATION_BASELINE_DATE) simulationNorms += 1;
    else baselineNorms += 1;
  }
  return { baselineNorms, simulationNorms };
}

export async function countJurisdictionNorms(root: string, jurisdiction: JurisdictionId): Promise<NormCounts> {
  return countNorms(await loadJurisdictionNorms(jurisdiction, root));
}

export function buildSimulationInventoryStatus(file: CompletenessFile, counts: Pick<NormCounts, 'simulationNorms'>): SimulationInventoryStatus {
  const totals = completenessTotals(file);
  return {
    status: file.status,
    knownIssues: totals.knownIssues,
    presentIssues: totals.presentIssues,
    secureActs: totals.secureActs,
    review: totals.review,
    draftsWithoutPromulgation: totals.draftsWithoutPromulgation,
    simulationNorms: counts.simulationNorms,
    updatedAt: file.assessedAt,
  };
}

/** Neuer oder ergänzter Eintrag: Stichtagsteil des Importers unverändert, `simulation` ersetzt. */
export function mergeSimulationStatus(existing: InventoryStatus | undefined, jurisdiction: JurisdictionId, simulation: SimulationInventoryStatus, counts: Pick<NormCounts, 'baselineNorms'>): InventoryStatus {
  if (existing) return { ...existing, simulation };
  return { jurisdiction, baselineDate: SIMULATION_BASELINE_DATE, complete: true, published: counts.baselineNorms, pending: { atBaseline: 0, baselineOnly: 0, undetermined: 0 }, simulation };
}

/** Schreibt nur den Block `simulation` dieses Landes; andere Länder und der Stichtagsteil bleiben unberührt. */
export async function writeSimulationInventoryStatus(root: string, jurisdiction: JurisdictionId, simulation: SimulationInventoryStatus, counts: Pick<NormCounts, 'baselineNorms'>): Promise<boolean> {
  const path = join(root, INVENTORY_STATUS_PATH);
  const stored = await readJsonFile<unknown>(path);
  const entries = stored === undefined ? new Map<JurisdictionId, InventoryStatus>() : parseInventoryStatusFile(stored);
  entries.set(jurisdiction, mergeSimulationStatus(entries.get(jurisdiction), jurisdiction, simulation, counts));
  const ordered = Object.fromEntries([...entries.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return writeJsonAtomic(path, { schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: ordered });
}
