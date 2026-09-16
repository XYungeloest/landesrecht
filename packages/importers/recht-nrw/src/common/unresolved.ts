/**
 * Expliziter Datensatz für abgerufene Quellen, die keiner Stammnorm zugeordnet werden konnten (keine
 * Taxonomie-Term-Kennung auf der Seite, Abbruch vor der Identität). Es wird keine Kennung erfunden: Der
 * Datensatz hält URL, Titel, Fehlergrund, Abrufstatus und Hashes fest, damit jeder enumerierte Eintrag einen
 * nachvollziehbaren Endzustand hat (docs/RECHT_NRW_BULK_IMPORT.md).
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { writeJsonAtomic } from './atomic.ts';
import type { FetchedDocument } from './fetcher.ts';
import { AUDIT_DIR, type SourceArea } from './manifest.ts';

export const UNRESOLVED_SOURCE_SCHEMA = 'recht-nrw-unresolved-source/1';

export interface UnresolvedSourceRecord {
  schemaVersion: typeof UNRESOLVED_SOURCE_SCHEMA;
  sourceArea: SourceArea;
  url: string;
  title?: string;
  importStatus: string;
  reason: Array<{ severity: string; code: string; message: string }>;
  documents: Array<{ role: string; url: string; finalUrl: string; httpStatus: number; contentType: string; retrievedAt: string; sha256: string; byteLength: number }>;
  runId?: string;
  generatedAt: string;
}

export function unresolvedSourceKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** `data/audits/recht-nrw/<bereich>/unresolved/<hash der URL>.json` – deterministisch aus der Einstiegsadresse. */
export function unresolvedSourcePath(area: SourceArea, url: string): string {
  return join(AUDIT_DIR, area, 'unresolved', `${unresolvedSourceKey(url)}.json`).replace(/\\/gu, '/');
}

export async function recordUnresolvedSource(input: {
  root: string;
  write: boolean;
  area: SourceArea;
  url: string;
  title?: string;
  importStatus: string;
  findings: ReadonlyArray<{ severity: string; code: string; message: string }>;
  documents: ReadonlyArray<{ role: string; document: FetchedDocument }>;
  runId?: string;
  now: string;
}): Promise<{ path: string; written: boolean }> {
  const path = unresolvedSourcePath(input.area, input.url);
  const record: UnresolvedSourceRecord = {
    schemaVersion: UNRESOLVED_SOURCE_SCHEMA,
    sourceArea: input.area,
    url: input.url,
    ...(input.title ? { title: input.title } : {}),
    importStatus: input.importStatus,
    reason: input.findings.filter((finding) => finding.severity !== 'info').map(({ severity, code, message }) => ({ severity, code, message })),
    documents: input.documents.map(({ role, document }) => ({
      role,
      url: document.url,
      finalUrl: document.finalUrl,
      httpStatus: document.status,
      contentType: document.contentType,
      retrievedAt: document.retrievedAt,
      sha256: document.sha256,
      byteLength: document.bytes.byteLength,
    })),
    ...(input.runId ? { runId: input.runId } : {}),
    generatedAt: input.now,
  };
  if (!input.write) return { path, written: false };
  await writeJsonAtomic(join(input.root, path), record);
  return { path, written: true };
}
