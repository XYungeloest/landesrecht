/**
 * `sources:needed`: „Was soll ich besorgen?“ – kompakte Liste der noch offenen Akquisitionseinträge (P1, P2, P3) aus
 * `data/simulation/source-acquisition-queue.json` (erzeugt von `completeness --write` aus den Bewertungen), optional
 * nach Land und Priorität gefiltert. Liest nur; keine Websuche.
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { ACQUISITION_QUEUE_PATH, isNeeded, renderNeededLines, type AcquisitionQueueEntry } from '../completeness/acquisition.ts';

export interface NeededOptions {
  jurisdiction?: JurisdictionId;
  priority?: 'P1' | 'P2' | 'P3';
  json?: boolean;
}

export async function runNeeded(options: NeededOptions, root: string, io: { print: (line: string) => void; error: (line: string) => void }): Promise<number> {
  const queue = await readJsonFile<{ entries: AcquisitionQueueEntry[] }>(join(root, ACQUISITION_QUEUE_PATH));
  if (!queue) {
    io.error(`${ACQUISITION_QUEUE_PATH} fehlt – zuerst npm run import:simulation:completeness -- --write.`);
    return 1;
  }
  const filter = { ...(options.jurisdiction ? { jurisdiction: options.jurisdiction } : {}), ...(options.priority ? { priority: options.priority } : {}) };
  if (options.json) {
    io.print(JSON.stringify(queue.entries.filter((entry) => isNeeded(entry) && (!filter.jurisdiction || entry.jurisdiction === filter.jurisdiction) && (!filter.priority || entry.priority === filter.priority)), null, 2));
    return 0;
  }
  for (const line of renderNeededLines(queue.entries, filter)) io.print(line);
  return 0;
}
