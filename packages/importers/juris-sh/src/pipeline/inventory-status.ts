/**
 * Bestandsstand NSH für die Oberfläche (`packages/legal-core/src/config/inventory-status.json`, Eintrag `nsh`).
 *
 * Ein Land ohne Eintrag gilt dort als vollständig. Sobald der NSH-Bulk Normen schreibt, muss deshalb der
 * Teilbestand ausgewiesen werden: veröffentlicht (übernommene Manifesteinträge) gegen bekannte, noch nicht belegte
 * Stichtagsnormen. Gezählt wird nur Belegtes aus der Vollkorpus-Inventur – keine Schätzung, kein Hochrechnen:
 *
 *   atBaseline    am Stichtag geltend (Ausgabe oder Einzelfassungen, Regel B bzw. Einordnung), nicht übernommen
 *                 (Review, Rekonstruktion)
 *   baselineOnly  baseline-only-Kandidaten des Ereignisregisters ohne zugeordnetes juris-Dokument
 *   undetermined  Stichtagsgeltung nicht entschieden (Einordnung `undetermined`, Parser-/Schemafehler, nicht im Cache)
 *
 * Geschrieben wird nur der Eintrag `nsh` (Schreibweg des BayWü-Adapters, der andere Länder unberührt lässt).
 */
import { writeInventoryStatus } from '@landesrecht/importer-bayernrecht/audit/inventory-status.ts';
import type { InventoryStatus } from '@landesrecht/legal-core/config/inventory-status.ts';

import { BASELINE_DATE, TARGET_JURISDICTION } from '../common/constants.ts';
import { isImportedStatus, type ImportManifest } from '../common/manifest.ts';
import type { InventoryReport } from './bulk.ts';

export const INVENTORY_STATUS_PATH = 'packages/legal-core/src/config/inventory-status.json';

const AT_BASELINE_CLASSES = new Set(['unchanged-since-baseline', 'changed-after-baseline', 'repealed-after-baseline']);

export function buildNshInventoryStatus(report: InventoryReport, manifest: Pick<ImportManifest, 'entries'>): InventoryStatus {
  const imported = new Set(manifest.entries.filter((entry) => isImportedStatus(entry.importStatus)).map((entry) => entry.sourceIdentity));
  let atBaseline = 0;
  let undetermined = 0;
  for (const entry of report.entries) {
    // Anlagen einer Stammnorm (`part-of-main`) sind keine eigenen Normen.
    if (imported.has(entry.documentId) || entry.outcome === 'not-at-baseline' || entry.outcome === 'part-of-main' || entry.baselineStatus === 'not-active-at-baseline') continue;
    const contradicted = entry.ledger.contradictions > 0;
    if (entry.baselineStatus === 'active-at-baseline' || (!contradicted && AT_BASELINE_CLASSES.has(entry.baselineClass ?? ''))) atBaseline += 1;
    else undetermined += 1;
  }
  const baselineOnly = report.baselineOnly.entries.filter((entry) => entry.documentIds.length === 0).length;
  return {
    jurisdiction: TARGET_JURISDICTION,
    baselineDate: BASELINE_DATE,
    complete: atBaseline === 0 && undetermined === 0 && baselineOnly === 0,
    published: imported.size,
    pending: { atBaseline, baselineOnly, undetermined },
  };
}

export async function writeNshInventoryStatus(root: string, status: InventoryStatus): Promise<boolean> {
  return writeInventoryStatus(root, status);
}
