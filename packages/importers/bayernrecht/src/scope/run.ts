/**
 * Wendet die Scope-Entscheidungen auf den vollständigen enumerierten Bestand an.
 *
 * Ergebnis: `data/imports/bayernrecht/scope.json` – je enumeriertem Dokument genau ein Eintrag mit
 * Entscheidung, maschinenlesbarem Grund und Beleg. **Kein Dokument bleibt ohne Eintrag**; genau das
 * meint „Coverage-Lücke = 0“: nicht, dass alles importiert wird, sondern dass für jedes Dokument
 * eine erklärte Entscheidung vorliegt.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_DATE, IMPORT_DATA_DIR, SOURCE_AREAS, type SourceArea } from '../common/constants.ts';
import { readEnumeration } from '../enumerate/enumeration.ts';
import { classifyScope, SCOPE_SCHEMA, type ScopeDecision, type ScopeEntry, type ScopeOverride } from './decisions.ts';

export const SCOPE_PATH = join(IMPORT_DATA_DIR, 'scope.json');
export const GAP_PATH = join('data', 'audits', 'bayernrecht', 'enumeration-gap.json');
export const SCOPE_OVERRIDES_PATH = join(IMPORT_DATA_DIR, 'scope-overrides.json');

export interface ScopeFile {
  schemaVersion: typeof SCOPE_SCHEMA;
  baselineDate: string;
  generatedAt: string;
  totals: {
    documents: number;
    byDecision: Record<ScopeDecision, number>;
    byReason: Record<string, number>;
    byArea: Record<string, { documents: number; include: number; exclude: number; review: number }>;
  };
  entries: ScopeEntry[];
}

/**
 * Einzeln geprüfte Dokumente aus `scope-overrides.json`.
 *
 * Sie sind keine Regel, sondern eine Feststellung am Dokument – und gehen deshalb jeder
 * Gruppenzuordnung vor. Fehlt die Datei, arbeitet der Lauf ohne sie; das ist kein Fehler, sondern
 * der Zustand vor der Handprüfung.
 */
export async function readScopeOverrides(root: string): Promise<Map<string, ScopeOverride>> {
  const overrides = new Map<string, ScopeOverride>();
  let raw: string;
  try {
    raw = await readFile(join(root, SCOPE_OVERRIDES_PATH), 'utf8');
  } catch {
    return overrides;
  }
  const parsed = JSON.parse(raw) as { entries?: ScopeOverride[] };
  for (const entry of parsed.entries ?? []) {
    if (typeof entry?.documentId === 'string') overrides.set(entry.documentId, entry);
  }
  return overrides;
}

interface GapDocument {
  documentId: string;
  group: string;
}

/** Dokument-ID → Gruppenkennung der Abdeckungslücke. */
export async function readGapGroups(root: string): Promise<Map<string, string>> {
  const groups = new Map<string, string>();
  let raw: string;
  try {
    raw = await readFile(join(root, GAP_PATH), 'utf8');
  } catch {
    return groups;
  }
  const parsed = JSON.parse(raw) as { documents?: GapDocument[] };
  for (const entry of parsed.documents ?? []) {
    if (typeof entry.documentId === 'string' && typeof entry.group === 'string') groups.set(entry.documentId, entry.group);
  }
  return groups;
}

export interface BuildScopeOptions {
  /** `@doktyp` je Dokument, sobald der XML-Export vorliegt; ohne ihn entscheidet die Gruppenzuordnung. */
  documentTypes?: ReadonlyMap<string, string>;
  /** Belege einer landesrechtlichen Übernahme je Dokument (Ausnahme nach docs/LEGAL_SCOPE.md). */
  exceptionEvidence?: ReadonlyMap<string, string[]>;
  /** Auswertungszeitpunkt; als Konstante übergeben, damit ein Wiederholungslauf byteidentisch ist. */
  generatedAt: string;
}

function emptyDecisionCounter(): Record<ScopeDecision, number> {
  return { include: 0, exclude: 0, review: 0 };
}

export async function buildScope(root: string, options: BuildScopeOptions): Promise<ScopeFile> {
  const gapGroups = await readGapGroups(root);
  const overrides = await readScopeOverrides(root);
  const entries: ScopeEntry[] = [];
  const byArea: ScopeFile['totals']['byArea'] = {};

  for (const area of SOURCE_AREAS) {
    if (area === 'events') continue;
    const enumeration = await readEnumeration(root, area as SourceArea);
    if (!enumeration) continue;
    byArea[area] = { documents: 0, include: 0, exclude: 0, review: 0 };
    for (const item of enumeration.items) {
      const documentType = options.documentTypes?.get(item.documentId);
      const exceptionEvidence = options.exceptionEvidence?.get(item.documentId);
      const override = overrides.get(item.documentId);
      const entry = classifyScope({
        item,
        sourceArea: area,
        ...(override ? { override } : {}),
        ...(gapGroups.get(item.documentId) ? { gapGroup: gapGroups.get(item.documentId)! } : {}),
        ...(documentType ? { documentType } : {}),
        ...(exceptionEvidence ? { exceptionEvidence } : {}),
      });
      entries.push(entry);
      byArea[area]!.documents += 1;
      byArea[area]![entry.decision] += 1;
    }
  }

  entries.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));
  const byDecision = emptyDecisionCounter();
  const byReason: Record<string, number> = {};
  for (const entry of entries) {
    byDecision[entry.decision] += 1;
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
  }

  return {
    schemaVersion: SCOPE_SCHEMA,
    baselineDate: BASELINE_DATE,
    generatedAt: options.generatedAt,
    totals: { documents: entries.length, byDecision, byReason, byArea },
    entries,
  };
}

export async function writeScope(root: string, file: ScopeFile): Promise<boolean> {
  return writeJsonAtomic(join(root, SCOPE_PATH), file);
}

/** Für den Bulk: die Dokument-IDs, die aufgenommen werden dürfen. */
export function includedDocumentIds(file: ScopeFile): string[] {
  return file.entries.filter((entry) => entry.decision === 'include').map((entry) => entry.documentId);
}

/** Jedes enumerierte Dokument hat genau einen Eintrag – sonst ist die Coverage nicht quellvollständig. */
export function scopeProblems(file: ScopeFile, enumeratedIds: readonly string[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const entry of file.entries) seen.set(entry.documentId, (seen.get(entry.documentId) ?? 0) + 1);
  const duplicates = [...seen].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length > 0) problems.push(`${duplicates.length} Dokument(e) mehrfach entschieden: ${duplicates.slice(0, 5).join(', ')}`);
  const missing = enumeratedIds.filter((id) => !seen.has(id));
  if (missing.length > 0) problems.push(`${missing.length} enumerierte(s) Dokument(e) ohne Scope-Eintrag: ${missing.slice(0, 5).join(', ')}`);
  const extra = [...seen.keys()].filter((id) => !enumeratedIds.includes(id));
  if (extra.length > 0) problems.push(`${extra.length} Scope-Eintrag/Einträge ohne enumeriertes Dokument: ${extra.slice(0, 5).join(', ')}`);
  return problems;
}
