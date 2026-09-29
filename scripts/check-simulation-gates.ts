#!/usr/bin/env node
/**
 * Gates der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 6), Teil von `content:check`:
 *
 *   G2 Baseline-Lock je Land gegen den Referenz-Commit aus data/simulation/baseline-locks.json
 *   G3 meta.json/history.json von Normen mit Sim-Fassungen nur additiv gegenüber dem Referenz-Commit
 *   G4 Konsolidierung reproduzierbar (`import-simulation consolidate --check` je Land)
 *   G9 Inventar reproduzierbar (nur mit vorhandenem imports/-Archiv)
 *   G11 Evidenzhierarchie: keine Wortlaut-, Verkündungs- oder Rechtswirkungsgrundlage aus Sekundärquellen (Ebene 4/5)
 *   G12 Inhaltsverzeichnis der Sim-Verkündungen: jeder inventarisierte Akt einer Ausgabe steht als Eintrag in ihrer
 *       Publication (auch ohne Portalnorm), Identität, Titel, Seiten, Datum, Ledger-Stand, keine Dubletten
 *
 * G1 (`content:immutability`), G5/G6 (`content:validate`) und G8 (Unit-Tests) laufen getrennt.
 *
 *   node scripts/check-simulation-gates.ts [--jurisdiction <j>] [--skip-inventory] [--quiet]
 */
import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isExternallyMaintained } from '@landesrecht/legal-core/lib/provenance.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { runConsolidation } from '@landesrecht/importer-simulation/consolidate/run.ts';
import { auditPublicationEntries } from '@landesrecht/importer-simulation/publications/entries.ts';

import { readBaselineLockFile, seedsFor } from '@landesrecht/importer-simulation/common/baseline-locks.ts';

import { BASELINE_LOCKS_PATH, checkAdditiveIdentity, checkBaselineLock, checkBaselineSeeds, checkEvidenceHierarchy, checkInventoryReproducible, type GateReport } from './lib/simulation-gates.ts';

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

const lockFile = await readBaselineLockFile(root);
for (const jurisdiction of jurisdictions) {
  const lock = lockFile?.jurisdictions[jurisdiction];
  if (!lockFile || !lock) {
    reports.push({ gate: 'G2', jurisdiction, problems: [], notes: [`${jurisdiction}: kein Referenz-Commit in ${BASELINE_LOCKS_PATH} – Baseline-Lock nicht geprüft`] });
    continue;
  }
  const options = lockFile.schemaVersion === 2 ? { seeds: seedsFor(lockFile, jurisdiction), freeze: lock.freeze } : {};
  reports.push(await checkBaselineLock(root, jurisdiction, lock.commit, options));
  if (lockFile.schemaVersion === 2) reports.push(await checkBaselineSeeds(root, jurisdiction, lock.commit, options.seeds!, { freeze: lock.freeze }));
  reports.push(await checkAdditiveIdentity(root, jurisdiction, lock.commit, options));
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

for (const jurisdiction of jurisdictions) reports.push(await checkEvidenceHierarchy(root, jurisdiction));

for (const jurisdiction of jurisdictions) {
  const audit = await auditPublicationEntries(root, jurisdiction);
  reports.push({ gate: 'G12', jurisdiction, problems: audit.problems, notes: [`${jurisdiction}: Inhaltsverzeichnis geprüft – ${audit.publications} Ausgabe(n), ${audit.acts} inventarisierte Akt(e), ${audit.entries} Einträge, ${audit.emptyAfter} leere Ausgabe(n)`] });
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
