/**
 * OstRecht-Übernahme (Sachsen/OstRecht → Freistaat Ostdeutschland).
 *
 * OstRecht bleibt fachliche Source of Truth für Ost. Dieser Importer liest OstRecht-Datensätze
 * (meta.json, history.json, versions/*.json) und übersetzt sie über den Adapter in
 * @landesrecht/providers in das kanonische Modell. Ein Sync-Lauf, der den OstRecht-Bestand in
 * dieses Repository schreibt, ist bewusst noch nicht vorgesehen (docs/OSTRECHT_COMPATIBILITY.md).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import type { SourcePortal } from '@landesrecht/importer-common/pipeline.ts';
import { adaptOstRechtRecord, type OstRechtRawRecord } from '@landesrecht/providers/ostrecht.ts';

export const PORTAL: SourcePortal = 'ostrecht';
export const TARGET_JURISDICTION: JurisdictionId = 'ost';

/** Liest einen OstRecht-Normordner (`content/normen/<slug>/`) als Rohobjekt. */
export async function readOstRechtRecord(directory: string): Promise<OstRechtRawRecord> {
  const meta = JSON.parse(await readFile(join(directory, 'meta.json'), 'utf8')) as Record<string, unknown>;
  const history = JSON.parse(await readFile(join(directory, 'history.json'), 'utf8')) as Record<string, unknown>;
  const versionFiles = (await readdir(join(directory, 'versions'))).filter((name) => name.endsWith('.json')).sort();
  const versions = await Promise.all(versionFiles.map(async (name) => JSON.parse(await readFile(join(directory, 'versions', name), 'utf8')) as Record<string, unknown>));
  return { meta, history, versions };
}

/** Liest und adaptiert einen OstRecht-Normordner in einen kanonischen NormRecord. */
export async function importOstRechtNorm(directory: string): Promise<NormRecord> {
  return adaptOstRechtRecord(await readOstRechtRecord(directory));
}
