#!/usr/bin/env node
/**
 * Gates der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 6), Teil von `content:check`:
 *
 *   G2 Baseline-Lock je Land gegen den Referenz-Commit aus data/simulation/baseline-locks.json
 *   G3 meta.json/history.json von Normen mit Sim-Fassungen nur additiv gegenüber dem Referenz-Commit
 *   G4 Konsolidierung reproduzierbar (`import-simulation consolidate --check` je Land)
 *   G9 Inventar reproduzierbar (nur mit vorhandenem imports/-Archiv)
 *
 * G1 (`content:immutability`), G5/G6 (`content:validate`) und G8 (Unit-Tests) laufen getrennt.
 *
 *   node scripts/check-simulation-gates.ts [--jurisdiction <j>] [--skip-inventory] [--quiet]
 */
import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isExternallyMaintained } from '@landesrecht/legal-core/lib/provenance.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { runConsolidation } from '@landesrecht/importer-simulation/consolidate/run.ts';

import { BASELINE_LOCKS_PATH, checkAdditiveIdentity, checkBaselineLock, checkInventoryReproducible, readBaselineLocks, type GateReport } from './lib/simulation-gates.ts';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const skipInventory = args.includes('--skip-inventory');
const jurisdictionIndex = args.indexOf('--jurisdiction');
const requested = jurisdictionIndex >= 0 ? args[jurisdictionIndex + 1] : undefined;
if (requested !== undefined && !isJurisdictionId(requested)) {
  console.error(`Unbekannte Jurisdiktion: ${requested}`);
  process.exit(1);
}
const root = resolveRepositoryRoot();
const jurisdictions: JurisdictionId[] = (requested ? [requested as JurisdictionId] : [...JURISDICTION_IDS]).filter((jurisdiction) => !isExternallyMaintained(jurisdiction));
const reports: GateReport[] = [];

const locks = await readBaselineLocks(root);
for (const jurisdiction of jurisdictions) {
  const commit = locks[jurisdiction];
  if (!commit) {
    reports.push({ gate: 'G2', jurisdiction, problems: [], notes: [`${jurisdiction}: kein Referenz-Commit in ${BASELINE_LOCKS_PATH} – Baseline-Lock nicht geprüft`] });
    continue;
  }
  reports.push(await checkBaselineLock(root, jurisdiction, commit));
  reports.push(await checkAdditiveIdentity(root, jurisdiction, commit));
}

for (const jurisdiction of jurisdictions) {
  const result = await runConsolidation({ root, jurisdiction, mode: 'check' });
  reports.push({
    gate: 'G4',
    jurisdiction,
    problems: [...result.errors, ...result.checkProblems],
    notes: [`${jurisdiction}: Konsolidierung reproduzierbar geprüft – ${result.acts.length} Akt(e), ${result.recipes.length} Rezept(e), ${result.blockedTargets.length} gesperrte Ziel(e)`],
  });
}

if (!skipInventory && !requested) reports.push(await checkInventoryReproducible(root));

const problems = reports.flatMap((report) => report.problems.map((problem) => `[${report.gate}${report.jurisdiction ? ` ${report.jurisdiction}` : ''}] ${problem}`));
if (!quiet) for (const report of reports) for (const note of report.notes) console.log(`${report.gate}: ${note}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} Gate-Verstoß/-Verstöße der Simulationsrechtsfortschreibung:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Simulationsgates bestanden (${reports.map((report) => report.gate).filter((gate, index, all) => all.indexOf(gate) === index).join(', ')}).`);
