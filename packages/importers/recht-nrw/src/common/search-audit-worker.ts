/**
 * Worker des Such-Audits (worker_threads): projiziert den Bestand in eine eigene In-Memory-Datenbank und prüft
 * die zugewiesenen Slugs. Wird ausschließlich von search-audit.ts gestartet.
 */
import { parentPort, workerData } from 'node:worker_threads';

import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SearchMatchMode } from '@landesrecht/search/query.ts';

import { runSearchAuditSlice } from './search-audit.ts';

const data = workerData as { root: string; jurisdiction: JurisdictionId; slugs: string[]; matchMode: SearchMatchMode };

try {
  const slice = await runSearchAuditSlice(data.root, data.jurisdiction, data.slugs, data.matchMode);
  parentPort?.postMessage({ slice });
} catch (error) {
  parentPort?.postMessage({ error: (error as Error).stack ?? String(error) });
}
