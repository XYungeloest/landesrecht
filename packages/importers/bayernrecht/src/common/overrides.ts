/**
 * Dokumentierte redaktionelle Overrides des BayWü-Bestands (`data/imports/bayernrecht/overrides.json`).
 *
 * Einzelfälle (widersprüchliches „gültig bis“, falsch zugeordnete Fundstelle, strittige Normativität,
 * mehrdeutige BayRS-Nummer) werden nie im Code behandelt, sondern hier mit Wert, Begründung, Beleg und
 * Prüfdatum festgehalten. Die Importpfade wenden ausschließlich Overrides dieser Datei an und schreiben
 * sie ins Manifest.
 *
 * Eigene Datei statt Wiederverwendung der West- oder NSH-Overrides: Die Felder sind portalspezifisch
 * (Bayern kennt zusätzlich `bayRsNumber`), die Quellidentität hat ein anderes Format, und die Bestände
 * bleiben strikt getrennt.
 */
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { BASELINE_RECOVERY_METHODS, DIGITAL_REPRESENTATIONS, PUBLICATION_AUTHORITIES } from './manifest.ts';
import { isBayRsNumber, OVERRIDES_PATH } from './paths.ts';

export const OVERRIDES_SCHEMA = 'bayernrecht-overrides/1' as const;
export { OVERRIDES_PATH };

export const OVERRIDE_FIELDS = [
  'sourceValidFrom',
  'sourceValidTo',
  'normativity',
  'sourceDocument',
  'attachmentHandling',
  'institutionMapping',
  'baselineRecoveryMethod',
  'sourceProvenance',
  'bayRsNumber',
] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];

export const ATTACHMENT_HANDLINGS = ['archived-source-only', 'structured-transcription', 'not-normative'] as const;
export const INSTITUTION_STATUSES = ['preserve', 'safe-transform', 'map', 'review', 'historical-source-only'] as const;

export interface OverrideEvidence {
  /** Art des Belegs, z. B. „Fassungsliste des Portals“, „Bayerische Rechtssammlung“, „GVBl.“. */
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

export function emptyOverrideRegistry(): OverrideRegistry {
  return { schemaVersion: OVERRIDES_SCHEMA, entries: [] };
}

export function validateOverride(entry: ImportOverride, path = OVERRIDES_PATH): void {
  const where = `${path}: Override ${entry?.id ?? '?'}`;
  if (!entry.id || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.id)) throw new Error(`${where}: id muss eine technische Kennung sein`);
  if (typeof entry.sourceIdentity !== 'string' || entry.sourceIdentity.trim() === '' || /\s/u.test(entry.sourceIdentity)) throw new Error(`${where}: sourceIdentity fehlt oder enthält Leerraum`);
  if (!(OVERRIDE_FIELDS as readonly string[]).includes(entry.field)) throw new Error(`${where}: unbekanntes Feld ${String(entry.field)}`);
  if (!entry.reason?.trim()) throw new Error(`${where}: Begründung fehlt`);
  if (!entry.evidence?.source?.trim()) throw new Error(`${where}: Beleg (evidence.source) fehlt`);
  if (entry.evidence.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(entry.evidence.sha256)) throw new Error(`${where}: evidence.sha256 ist kein SHA-256`);
  if (!ISO_DATE.test(entry.reviewedAt ?? '')) throw new Error(`${where}: reviewedAt muss ein ISO-Datum sein`);
  const value = entry.value;
  switch (entry.field) {
    case 'sourceValidFrom':
    case 'sourceValidTo':
      if (!(value === null || (typeof value === 'string' && ISO_DATE.test(value)))) throw new Error(`${where}: ${entry.field} erwartet ein ISO-Datum oder null`);
      if (entry.field === 'sourceValidFrom' && value === null) throw new Error(`${where}: sourceValidFrom darf nicht null sein`);
      break;
    case 'normativity':
      if (!['include', 'exclude', 'review'].includes(String(value))) throw new Error(`${where}: normativity erwartet include|exclude|review`);
      break;
    case 'sourceDocument':
      // Die Adressen des Quellportals stehen erst nach der Quellen-Discovery fest; geprüft wird deshalb nur,
      // dass eine absolute, verschlüsselte Adresse angegeben ist (keine relative oder erfundene Kennung).
      if (typeof value !== 'string' || !/^https:\/\/[^\s]+$/u.test(value)) throw new Error(`${where}: sourceDocument erwartet eine absolute https-Adresse`);
      break;
    case 'attachmentHandling': {
      const object = value as { label?: unknown; handling?: unknown } | null;
      if (!object || typeof object.label !== 'string' || !(ATTACHMENT_HANDLINGS as readonly string[]).includes(String(object.handling))) throw new Error(`${where}: attachmentHandling erwartet { label, handling: ${ATTACHMENT_HANDLINGS.join('|')} }`);
      break;
    }
    case 'institutionMapping': {
      const object = value as { term?: unknown; status?: unknown; target?: unknown } | null;
      if (!object || typeof object.term !== 'string' || !(INSTITUTION_STATUSES as readonly string[]).includes(String(object.status))) throw new Error(`${where}: institutionMapping erwartet { term, status, target? }`);
      if ((object.status === 'map' || object.status === 'safe-transform') && typeof object.target !== 'string') throw new Error(`${where}: institutionMapping mit Status ${String(object.status)} braucht target`);
      break;
    }
    case 'baselineRecoveryMethod':
      if (!(BASELINE_RECOVERY_METHODS as readonly string[]).includes(String(value))) throw new Error(`${where}: baselineRecoveryMethod erwartet ${BASELINE_RECOVERY_METHODS.join('|')}`);
      break;
    case 'sourceProvenance': {
      const object = value as { publicationAuthority?: unknown; digitalRepresentation?: unknown } | null;
      if (!object || !(PUBLICATION_AUTHORITIES as readonly string[]).includes(String(object.publicationAuthority)) || !(DIGITAL_REPRESENTATIONS as readonly string[]).includes(String(object.digitalRepresentation))) {
        throw new Error(`${where}: sourceProvenance erwartet { publicationAuthority: ${PUBLICATION_AUTHORITIES.join('|')}, digitalRepresentation: ${DIGITAL_REPRESENTATIONS.join('|')} }`);
      }
      break;
    }
    case 'bayRsNumber':
      // Nur die amtliche Gliederungsnummer selbst, nie ein Freitext: Der Override korrigiert einen
      // Portalfehler, er erfindet keine Systematik.
      if (typeof value !== 'string' || !isBayRsNumber(value)) throw new Error(`${where}: bayRsNumber erwartet eine BayRS-Gliederungsnummer (z. B. 2170-1-1-I)`);
      break;
  }
}

export async function readOverrides(root: string): Promise<OverrideRegistry> {
  const registry = await readJsonFile<OverrideRegistry>(join(root, OVERRIDES_PATH));
  if (!registry) return emptyOverrideRegistry();
  if (registry.schemaVersion !== OVERRIDES_SCHEMA) throw new Error(`${OVERRIDES_PATH}: unbekannte Schemaversion ${String(registry.schemaVersion)}`);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const entry of registry.entries) {
    validateOverride(entry);
    if (ids.has(entry.id)) throw new Error(`${OVERRIDES_PATH}: doppelte Kennung ${entry.id}`);
    ids.add(entry.id);
    if (entry.field === 'attachmentHandling' || entry.field === 'institutionMapping') continue;
    const key = `${entry.sourceIdentity}|${entry.field}`;
    if (keys.has(key)) throw new Error(`${OVERRIDES_PATH}: mehrere Overrides für ${key}`);
    keys.add(key);
  }
  return registry;
}

export async function writeOverrides(root: string, registry: OverrideRegistry): Promise<boolean> {
  for (const entry of registry.entries) validateOverride(entry);
  return writeJsonAtomic(join(root, OVERRIDES_PATH), registry);
}

export function overridesFor(registry: OverrideRegistry, sourceIdentity: string): ImportOverride[] {
  return registry.entries.filter((entry) => entry.sourceIdentity === sourceIdentity);
}

export function overrideValue<T>(overrides: readonly ImportOverride[], field: OverrideField): { value: T; override: ImportOverride } | undefined {
  const override = overrides.find((entry) => entry.field === field);
  return override ? { value: override.value as T, override } : undefined;
}
