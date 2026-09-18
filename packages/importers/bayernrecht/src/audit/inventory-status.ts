/**
 * Bestandsstand BayWü für die Oberfläche (`packages/legal-core/src/config/inventory-status.json`, Eintrag `baywue`):
 * Wie viele Normen mit belegter Stichtagsfassung veröffentlicht sind und wie viele bekannte Stichtagsnormen noch
 * fehlen. Solange etwas fehlt, zeigt das Portal den Hinweis „Teilbestand“; meldet dieser Stand `complete: true`,
 * verschwindet er ohne Codeänderung.
 *
 * Gezählt wird nur Belegtes: `atBaseline` sind Stichtagsentscheidungen `active-at-baseline` ohne Übernahme,
 * `undetermined` die unentschiedenen, `baselineOnly` die heute fehlenden Stichtagsnormen aus dem Ereignisregister,
 * die noch nicht übernommen sind. Keine Schätzung, kein Hochrechnen.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { INVENTORY_STATUS_SCHEMA, type InventoryStatus } from '@landesrecht/legal-core/config/inventory-status.ts';

import { BASELINE_DATE, TARGET_JURISDICTION } from '../common/constants.ts';
import { isImportedStatus, readManifest, type ImportManifest } from '../common/manifest.ts';
import { BASELINE_PATH, type BaselineFile } from '../baseline/run.ts';
import { LEDGER_PATH } from '../events/build.ts';
import { isBaselineOnlyCandidate, type EventLedger } from '../events/ledger.ts';
import { CANDIDATES_PATH, type CandidatesFile } from '../baseline-only/model.ts';
import { restoredBaselineOnlyEventIds } from '../baseline-only/recognize.ts';

export const INVENTORY_STATUS_PATH = 'packages/legal-core/src/config/inventory-status.json';

export interface InventoryStatusInput {
  baseline: Pick<BaselineFile, 'decisions'>;
  manifest: Pick<ImportManifest, 'entries'>;
  /** Heute fehlende Stichtagsnormen, die noch nicht übernommen sind. */
  baselineOnlyOpen: number;
}

export function buildInventoryStatus(input: InventoryStatusInput): InventoryStatus {
  const imported = new Set(input.manifest.entries.filter((entry) => isImportedStatus(entry.importStatus)).map((entry) => entry.sourceIdentity));
  const atBaseline = input.baseline.decisions.filter((decision) => decision.status === 'active-at-baseline' && !imported.has(decision.documentId)).length;
  const undetermined = input.baseline.decisions.filter((decision) => decision.status === 'undetermined' && !imported.has(decision.documentId)).length;
  return {
    jurisdiction: TARGET_JURISDICTION,
    baselineDate: BASELINE_DATE,
    complete: atBaseline === 0 && undetermined === 0 && input.baselineOnlyOpen === 0,
    published: imported.size,
    pending: { atBaseline, baselineOnly: input.baselineOnlyOpen, undetermined },
  };
}

/** Schreibt nur den Eintrag dieses Landes; andere Länder bleiben unberührt. */
export async function writeInventoryStatus(root: string, status: InventoryStatus): Promise<boolean> {
  const path = join(root, INVENTORY_STATUS_PATH);
  const stored = await readJsonFile<{ schemaVersion: string; jurisdictions: Record<string, InventoryStatus> }>(path);
  const jurisdictions = { ...(stored?.jurisdictions ?? {}), [status.jurisdiction]: status };
  const ordered = Object.fromEntries(Object.entries(jurisdictions).sort(([left], [right]) => left.localeCompare(right)));
  return writeJsonAtomic(path, { schemaVersion: INVENTORY_STATUS_SCHEMA, jurisdictions: ordered });
}

/**
 * Heute fehlende Stichtagsnormen, die noch nicht übernommen sind. Maßgeblich ist die Kandidatenliste der
 * Wiederherstellung (`baseline-only/candidates.json`): Kandidaten, die sich als nicht am Stichtag geltend oder als
 * nicht Landesrecht erwiesen haben, fehlen nicht; übernommene zählen nicht mehr. Ohne Kandidatenliste gilt das
 * Ereignisregister (`isBaselineOnlyCandidate`), je Ereignis einmal gezählt.
 */
export function baselineOnlyOpen(input: { candidates?: Pick<CandidatesFile, 'candidates'>; ledger?: Pick<EventLedger, 'events'>; restoredEventIds?: ReadonlySet<string> }): number {
  const restored = input.restoredEventIds ?? new Set<string>();
  if (input.candidates) {
    return input.candidates.candidates.filter((candidate) => candidate.outcome !== 'not-at-baseline' && candidate.outcome !== 'out-of-scope' && !restored.has(candidate.eventId)).length;
  }
  return (input.ledger?.events ?? []).filter((event) => isBaselineOnlyCandidate(event) && !restored.has(event.id)).length;
}

export async function collectInventoryStatus(root: string): Promise<InventoryStatus> {
  const [baseline, manifest, ledger, candidates] = await Promise.all([
    readJsonFile<BaselineFile>(join(root, BASELINE_PATH)),
    readManifest(root),
    readJsonFile<EventLedger>(join(root, LEDGER_PATH)),
    readJsonFile<CandidatesFile>(join(root, CANDIDATES_PATH)),
  ]);
  const restoredEventIds = restoredBaselineOnlyEventIds(manifest.entries);
  return buildInventoryStatus({
    baseline: baseline ?? { decisions: [] },
    manifest,
    baselineOnlyOpen: baselineOnlyOpen({ ...(candidates ? { candidates } : {}), ...(ledger ? { ledger } : {}), restoredEventIds }),
  });
}
