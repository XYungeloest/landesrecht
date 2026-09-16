/**
 * Dokumentierte redaktionelle Overrides (`data/imports/recht-nrw/overrides.json`).
 *
 * Einzelfälle wie das widersprüchliche „Gültig bis“ des KiBiz werden nie im Code behandelt, sondern
 * hier mit Wert, Begründung, Beleg und Prüfdatum festgehalten. Die Importpfade wenden nur Overrides
 * dieser Datei an und schreiben sie ins Manifest.
 */
import { join } from 'node:path';

import { readJsonFile } from './atomic.ts';
import { IMPORT_DATA_DIR } from './manifest.ts';

export const OVERRIDES_SCHEMA = 'recht-nrw-overrides/1' as const;
export const OVERRIDES_PATH = join(IMPORT_DATA_DIR, 'overrides.json');

export const OVERRIDE_FIELDS = ['sourceValidTo', 'sourceValidFrom', 'normativity', 'sourceDocument', 'attachmentHandling', 'institutionMapping'] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];

export interface OverrideEvidence {
  /** Art des Belegs, z. B. „RECHT.NRW-Fassungsliste“, „Ministerialblatt“. */
  source: string;
  url?: string;
  sha256?: string;
  note?: string;
}

export interface ImportOverride {
  id: string;
  sourceIdentity: string;
  field: OverrideField;
  value: unknown;
  reason: string;
  evidence: OverrideEvidence;
  reviewedAt: string;
  reviewedBy?: string;
}

export interface OverrideRegistry {
  schemaVersion: typeof OVERRIDES_SCHEMA;
  description?: string;
  entries: ImportOverride[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ATTACHMENT_HANDLINGS = ['archived-source-only', 'structured-transcription', 'not-normative'];
const INSTITUTION_STATUSES = ['preserve', 'safe-transform', 'map', 'review', 'historical-source-only'];

export function validateOverride(entry: ImportOverride, path = OVERRIDES_PATH): void {
  const where = `${path}: Override ${entry.id ?? '?'}`;
  if (!entry.id || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.id)) throw new Error(`${where}: id muss eine technische Kennung sein`);
  if (!/^term:\d+$/u.test(entry.sourceIdentity)) throw new Error(`${where}: sourceIdentity muss term:<id> sein`);
  if (!(OVERRIDE_FIELDS as readonly string[]).includes(entry.field)) throw new Error(`${where}: unbekanntes Feld ${entry.field}`);
  if (!entry.reason?.trim()) throw new Error(`${where}: Begründung fehlt`);
  if (!entry.evidence?.source?.trim()) throw new Error(`${where}: Beleg (evidence.source) fehlt`);
  if (entry.evidence.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(entry.evidence.sha256)) throw new Error(`${where}: evidence.sha256 ist kein SHA-256`);
  if (!ISO_DATE.test(entry.reviewedAt ?? '')) throw new Error(`${where}: reviewedAt muss ein ISO-Datum sein`);
  const value = entry.value;
  switch (entry.field) {
    case 'sourceValidTo':
    case 'sourceValidFrom':
      if (!(value === null || (typeof value === 'string' && ISO_DATE.test(value)))) throw new Error(`${where}: ${entry.field} erwartet ein ISO-Datum oder null`);
      if (entry.field === 'sourceValidFrom' && value === null) throw new Error(`${where}: sourceValidFrom darf nicht null sein`);
      break;
    case 'normativity':
      if (!['include', 'exclude', 'review'].includes(String(value))) throw new Error(`${where}: normativity erwartet include|exclude|review`);
      break;
    case 'sourceDocument':
      if (typeof value !== 'string' || !value.startsWith('https://recht.nrw.de/')) throw new Error(`${where}: sourceDocument erwartet eine RECHT.NRW-Adresse`);
      break;
    case 'attachmentHandling': {
      const object = value as { label?: unknown; handling?: unknown } | null;
      if (!object || typeof object.label !== 'string' || !ATTACHMENT_HANDLINGS.includes(String(object.handling))) throw new Error(`${where}: attachmentHandling erwartet { label, handling: ${ATTACHMENT_HANDLINGS.join('|')} }`);
      break;
    }
    case 'institutionMapping': {
      const object = value as { term?: unknown; status?: unknown; target?: unknown } | null;
      if (!object || typeof object.term !== 'string' || !INSTITUTION_STATUSES.includes(String(object.status))) throw new Error(`${where}: institutionMapping erwartet { term, status, target? }`);
      if ((object.status === 'map' || object.status === 'safe-transform') && typeof object.target !== 'string') throw new Error(`${where}: institutionMapping mit Status ${String(object.status)} braucht target`);
      break;
    }
  }
}

export async function readOverrides(root: string): Promise<OverrideRegistry> {
  const registry = await readJsonFile<OverrideRegistry>(join(root, OVERRIDES_PATH));
  if (!registry) return { schemaVersion: OVERRIDES_SCHEMA, entries: [] };
  if (registry.schemaVersion !== OVERRIDES_SCHEMA) throw new Error(`${OVERRIDES_PATH}: unbekannte Schemaversion ${registry.schemaVersion}`);
  const ids = new Set<string>();
  for (const entry of registry.entries) {
    validateOverride(entry);
    if (ids.has(entry.id)) throw new Error(`${OVERRIDES_PATH}: doppelte Kennung ${entry.id}`);
    ids.add(entry.id);
  }
  const keys = new Set<string>();
  for (const entry of registry.entries) {
    if (entry.field === 'attachmentHandling' || entry.field === 'institutionMapping') continue;
    const key = `${entry.sourceIdentity}|${entry.field}`;
    if (keys.has(key)) throw new Error(`${OVERRIDES_PATH}: mehrere Overrides für ${key}`);
    keys.add(key);
  }
  return registry;
}

export function overridesFor(registry: OverrideRegistry, sourceIdentity: string): ImportOverride[] {
  return registry.entries.filter((entry) => entry.sourceIdentity === sourceIdentity);
}

export function overrideValue<T>(overrides: readonly ImportOverride[], field: OverrideField): { value: T; override: ImportOverride } | undefined {
  const override = overrides.find((entry) => entry.field === field);
  return override ? { value: override.value as T, override } : undefined;
}
