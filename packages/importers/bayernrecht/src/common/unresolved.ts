/**
 * Expliziter Datensatz für abgerufene Quellen, die keiner Stammnorm zugeordnet werden konnten (keine
 * stabile Quellkennung auf der Seite, Abbruch vor der Identität).
 *
 * Es wird keine Kennung erfunden – auch keine BayRS-Nummer: Der Datensatz hält Adresse, Titel,
 * Fehlergrund, Abrufstatus und Hashes fest, damit jeder enumerierte Eintrag einen nachvollziehbaren
 * Endzustand hat. Schlüssel ist der Hash der Einstiegsadresse (`paths.ts`), nicht eine Ersatzidentität.
 */
import { join } from 'node:path';

import { writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from './constants.ts';
import { unresolvedSourcePath } from './paths.ts';

export const UNRESOLVED_SOURCE_SCHEMA = 'bayernrecht-unresolved-source/1' as const;

/** Abrufergebnis, wie es der Fetcher liefert (nur die Felder, die in den Datensatz gehören). */
export interface UnresolvedDocument {
  role: string;
  url: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  retrievedAt: string;
  sha256: string;
  byteLength: number;
}

export interface UnresolvedSourceRecord {
  schemaVersion: typeof UNRESOLVED_SOURCE_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceArea: SourceArea;
  url: string;
  title?: string;
  importStatus: string;
  reason: Array<{ severity: string; code: string; message: string }>;
  documents: UnresolvedDocument[];
  runId?: string;
  generatedAt: string;
}

export interface UnresolvedSourceInput {
  root: string;
  /** Ohne `write` wird nur der Zielpfad berechnet (Dry-run ist Standard). */
  write: boolean;
  area: SourceArea;
  url: string;
  title?: string;
  importStatus: string;
  findings: ReadonlyArray<{ severity: string; code: string; message: string }>;
  documents: readonly UnresolvedDocument[];
  runId?: string;
  now: string;
}

export function unresolvedSourceRecord(input: UnresolvedSourceInput): UnresolvedSourceRecord {
  return {
    schemaVersion: UNRESOLVED_SOURCE_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    sourceSystem: SOURCE_SYSTEM,
    sourceArea: input.area,
    url: input.url,
    ...(input.title ? { title: input.title } : {}),
    importStatus: input.importStatus,
    // Hinweise („info“) begründen keinen unaufgelösten Endzustand und stehen deshalb nicht im Grund.
    reason: input.findings.filter((finding) => finding.severity !== 'info').map(({ severity, code, message }) => ({ severity, code, message })),
    documents: [...input.documents],
    ...(input.runId ? { runId: input.runId } : {}),
    generatedAt: input.now,
  };
}

export async function recordUnresolvedSource(input: UnresolvedSourceInput): Promise<{ path: string; written: boolean }> {
  const path = unresolvedSourcePath(input.area, input.url);
  if (!input.write) return { path, written: false };
  await writeJsonAtomic(join(input.root, path), unresolvedSourceRecord(input));
  return { path, written: true };
}
