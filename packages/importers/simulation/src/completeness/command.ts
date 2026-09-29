/**
 * `completeness`: liest `data/simulation/<land>/completeness.json`, zählt Baseline- und Sim-Normen aus dem Bestand
 * und schreibt mit `--write` den Block `simulation` in `packages/legal-core/src/config/inventory-status.json`.
 * Ohne `--write` nur Ausgabe. Ein Land ohne Bewertung wird übergangen (ausdrücklich gewählt: Fehler).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { SimulationSourceStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import { JURISDICTION_IDS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { ledgerPath, type LedgerFile } from '../ledger/sync.ts';
import { ACQUISITION_DOC_PATH, ACQUISITION_QUEUE_PATH, acquisitionQueueFile, renderAcquisitionDoc } from './acquisition.ts';
import { assessSimulationSources } from './assessment.ts';

import { completenessPath, parseCompletenessFile } from './schema.ts';
import { PUBLICATION_INVENTORY_DOC_PATH, renderPublicationInventory } from './inventory-doc.ts';
import { buildSimulationInventoryStatus, countJurisdictionNorms, INVENTORY_STATUS_PATH, writeSimulationInventoryStatus } from './status.ts';

export interface CompletenessCommandOptions {
  write: boolean;
  json: boolean;
  jurisdiction?: JurisdictionId;
}

export interface Io {
  print: (line: string) => void;
  error: (line: string) => void;
}

export async function runCompleteness(options: CompletenessCommandOptions, root: string, io: Io): Promise<number> {
  const jurisdictions = options.jurisdiction ? [options.jurisdiction] : [...JURISDICTION_IDS];
  const results: Array<Record<string, unknown>> = [];
  const assessed: Array<{ jurisdiction: JurisdictionId; file: ReturnType<typeof parseCompletenessFile>; sources?: SimulationSourceStatus }> = [];
  let written = 0;
  for (const jurisdiction of jurisdictions) {
    const path = completenessPath(jurisdiction);
    const raw = await readJsonFile<unknown>(join(root, path));
    if (raw === undefined) {
      if (options.jurisdiction) {
        io.error(`${path} fehlt – keine Vollständigkeitsbewertung für ${jurisdiction}.`);
        return 1;
      }
      continue;
    }
    const file = parseCompletenessFile(raw, path);
    if (file.jurisdiction !== jurisdiction) throw new Error(`${path}: jurisdiction ${file.jurisdiction} passt nicht zum Verzeichnis ${jurisdiction}`);
    const counts = await countJurisdictionNorms(root, jurisdiction);
    // Ledger ist Pflicht für das getrennte Statusmodell; ohne Ledger bleibt es beim alten Block (Übergang, Tests).
    const ledger = await readJsonFile<LedgerFile>(join(root, ledgerPath(jurisdiction)));
    const assessment = ledger ? assessSimulationSources(file, ledger.events.map((event) => ({ id: event.id, status: event.status, eventDate: (event.eventDate as string | null | undefined) ?? null, ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}), targets: event.targets ?? [] })), {
      hasBaselineVersion: (slug) => existsSync(join(root, 'content/norms', jurisdiction, slug, 'versions', `${SIMULATION_BASELINE_DATE}.json`)),
    }) : undefined;
    const simulation = buildSimulationInventoryStatus(file, counts, assessment?.sources);
    assessed.push({ jurisdiction, file, ...(assessment ? { sources: assessment.sources } : {}) });
    results.push({ jurisdiction, path, simulation, counts, ...(assessment ? { partialReasons: assessment.partialReasons } : {}) });
    if (!options.json) {
      const sources = simulation.sources;
      io.print(sources
        ? `${jurisdiction}: Sim-Quellen ${sources.simulationStatus} (${simulation.status}) · Blätter ${sources.gazetteCoverage.status} ${sources.gazetteCoverage.presentIssues}/${sources.gazetteCoverage.knownIssues} · Einzelakte ${sources.standaloneSourceCoverage.status} (fehlend ${sources.standaloneSourceCoverage.missing}) · fehlende Quellen ${sources.missingSourceCount}, Evidenz unvollständig ${sources.evidenceIncompleteCount}, mögliche Lücken ${sources.possibleGapCount} + ${sources.knownUnclearPeriods} Zeiträume · Ereignisse applied ${sources.events.applied}, review ${sources.events.review}, blocked ${sources.events.blocked}, not-promulgated ${sources.events.notPromulgated} · letzte Quelle ${sources.lastSourceDate ?? '–'}`
        : `${jurisdiction}: ${simulation.status} · Ausgaben ${simulation.presentIssues}/${simulation.knownIssues} · Rechtsakte sicher ${simulation.secureActs}, in Prüfung ${simulation.review}, Entwürfe ohne Verkündung ${simulation.draftsWithoutPromulgation} · Normen: Baseline ${counts.baselineNorms}, Simulation ${counts.simulationNorms} · Stand ${simulation.updatedAt}`);
    }
    if (options.write && (await writeSimulationInventoryStatus(root, jurisdiction, simulation, counts))) written += 1;
  }
  if (options.json) io.print(JSON.stringify(results, null, 2));
  if (options.write && assessed.length > 0 && !options.jurisdiction) {
    if (await writeFileAtomic(join(root, PUBLICATION_INVENTORY_DOC_PATH), renderPublicationInventory(assessed), { skipIfUnchanged: true })) io.print(`Geschrieben: ${PUBLICATION_INVENTORY_DOC_PATH}`);
    if (await writeFileAtomic(join(root, ACQUISITION_QUEUE_PATH), `${JSON.stringify(acquisitionQueueFile(assessed), null, 2)}\n`, { skipIfUnchanged: true })) io.print(`Geschrieben: ${ACQUISITION_QUEUE_PATH}`);
    if (await writeFileAtomic(join(root, ACQUISITION_DOC_PATH), renderAcquisitionDoc(assessed), { skipIfUnchanged: true })) io.print(`Geschrieben: ${ACQUISITION_DOC_PATH}`);
  }
  if (results.length === 0) io.print('Keine Vollständigkeitsbewertung gefunden (data/simulation/<land>/completeness.json).');
  else if (options.write) io.print(written > 0 ? `Geschrieben: ${INVENTORY_STATUS_PATH} (${written} Land/Länder)` : `${INVENTORY_STATUS_PATH} unverändert.`);
  else io.print(`Dry-run: ${INVENTORY_STATUS_PATH} nicht geschrieben (--write).`);
  return 0;
}
