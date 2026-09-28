/**
 * `completeness`: liest `data/simulation/<land>/completeness.json`, zählt Baseline- und Sim-Normen aus dem Bestand
 * und schreibt mit `--write` den Block `simulation` in `packages/legal-core/src/config/inventory-status.json`.
 * Ohne `--write` nur Ausgabe. Ein Land ohne Bewertung wird übergangen (ausdrücklich gewählt: Fehler).
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { completenessPath, parseCompletenessFile } from './schema.ts';
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
    const simulation = buildSimulationInventoryStatus(file, counts);
    results.push({ jurisdiction, path, simulation, counts });
    if (!options.json) io.print(`${jurisdiction}: ${simulation.status} · Ausgaben ${simulation.presentIssues}/${simulation.knownIssues} · Rechtsakte sicher ${simulation.secureActs}, in Prüfung ${simulation.review}, Entwürfe ohne Verkündung ${simulation.draftsWithoutPromulgation} · Normen: Baseline ${counts.baselineNorms}, Simulation ${counts.simulationNorms} · Stand ${simulation.updatedAt}`);
    if (options.write && (await writeSimulationInventoryStatus(root, jurisdiction, simulation, counts))) written += 1;
  }
  if (options.json) io.print(JSON.stringify(results, null, 2));
  if (results.length === 0) io.print('Keine Vollständigkeitsbewertung gefunden (data/simulation/<land>/completeness.json).');
  else if (options.write) io.print(written > 0 ? `Geschrieben: ${INVENTORY_STATUS_PATH} (${written} Land/Länder)` : `${INVENTORY_STATUS_PATH} unverändert.`);
  else io.print(`Dry-run: ${INVENTORY_STATUS_PATH} nicht geschrieben (--write).`);
  return 0;
}
