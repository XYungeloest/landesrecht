/**
 * Zentrale Zuordnung von Institutionen des Herkunftslandes
 * (`data/imports/bayernrecht/institution-mapping.json`).
 *
 * Status:
 *   preserve                Bezeichnung bleibt unverändert, kein Review (externe Träger, Bundesorgane)
 *   safe-transform          nur die Landesbezeichnung wird nach den Regeln übergeleitet (Verfassungsorgane)
 *   map                     festgelegte Entsprechung für das Simulationsorgan (`enactingBody`); der Normtext
 *                           bleibt unverändert, bis eine Textregel ausdrücklich beschlossen ist
 *   review                  keine Entsprechung festgelegt – Text und Quellorgan bleiben, Review offen
 *   historical-source-only  historische Bezeichnung, nur als Provenienz geführt, kein Simulationsorgan
 *
 * Die Statusliste steht **nicht** hier, sondern in der Zustandsschicht (`common/overrides.ts`): Die
 * Overrides prüfen redaktionelle Einzelentscheidungen (`institutionMapping`) gegen dieselbe Liste.
 * Zwei getrennte Listen könnten auseinanderlaufen und eine Zuordnung zulassen, die die andere Seite
 * ablehnt. Es gibt deshalb genau eine.
 *
 * Grundsatz für Bayern: Eingetragen sind ausschließlich Verfassungsorgane, deren Entsprechung
 * unstrittig ist (Landtag, Staatsregierung, Ministerpräsidentin/Ministerpräsident). Staatsministerien,
 * der Verfassungsgerichtshof, der Oberste Rechnungshof, Behörden, Körperschaften, kommunale
 * Landesverbände, Kommunen und geographische Bezeichnungen sind bewusst **nicht** eingetragen: Ihr
 * Zuschnitt im Freistaat Bayern-Württemberg ist nicht festgelegt. Sie laufen über die Standardwerte
 * der Kategorie in den Status `review` – nicht blockierend, messbar, mit erhaltenem Quellorgan
 * (`originEnactingBody`). Es werden keine Behörden erfunden.
 *
 * Ausnahme (Run 5): Staatsministerien, die am Stichtag unter ihrem Namen nicht mehr bestanden (Beleg: StRGVV § 2 in
 * der seit 2023-11-08 geltenden Fassung), sind `historical-source-only` – historisches Erlassorgan, nur Provenienz,
 * kein Simulationsorgan. Die am Stichtag bestehenden Ressorts bleiben `review`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SOURCE_STATE } from '../common/constants.ts';
import { INSTITUTION_STATUSES } from '../common/overrides.ts';
import { INSTITUTION_MAPPING_PATH } from '../common/paths.ts';
import type { ReferenceCategory } from './detection.ts';
import { APPENDED_GUARD, BAY_ABBREVIATION, SOURCE_ADJECTIVE } from './rules.ts';

export const INSTITUTION_REGISTRY_SCHEMA = 'bayernrecht-institution-mapping/1' as const;
export const INSTITUTION_REGISTRY_PATH = INSTITUTION_MAPPING_PATH;

/** Eine Liste, eine Stelle: die Statusliste der Zustandsschicht (`common/overrides.ts`). */
export { INSTITUTION_STATUSES } from '../common/overrides.ts';
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

export interface InstitutionEntry {
  id: string;
  group: string;
  category: ReferenceCategory;
  /** Exakte Bezeichnungen (Leerraum normalisiert). */
  match?: string[];
  /** Regulärer Ausdruck (Quelle, ohne Flags; wird mit `u` angewandt). */
  pattern?: string;
  status: InstitutionStatus;
  target?: string;
  reason: string;
  reviewedAt: string;
}

export interface InstitutionRegistry {
  schemaVersion: typeof INSTITUTION_REGISTRY_SCHEMA;
  description?: string;
  /** Standardstatus je Erkennungskategorie ohne Eintrag. */
  defaults: Partial<Record<ReferenceCategory, InstitutionStatus>>;
  entries: InstitutionEntry[];
}

interface CompiledEntry extends InstitutionEntry {
  regex?: RegExp;
  exact: Set<string>;
}

export interface CompiledInstitutionRegistry {
  registry: InstitutionRegistry;
  resolve(term: string, category?: ReferenceCategory): { entry?: InstitutionEntry; status: InstitutionStatus; source: 'entry' | 'default' | 'none' };
}

const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();

/**
 * Ein Ziel darf die Bezeichnung des Herkunftslandes nie **untransformiert** enthalten.
 *
 * Diese Prüfung ist in Bayern schärfer als anderswo und zugleich heikler: Der Zielname enthält den
 * Quellnamen als Anfangsteil („Bayern-Württemberg“). Die Prüfung nimmt deshalb denselben negativen
 * Lookahead wie die Regeln – ein „Bayern“, dem der angehängte Zielteil folgt, ist der Zielname und
 * kein Rest. Ein „Bayern“ ohne diesen Anschluss, jede Form von „bayerisch“ und jede Abkürzung mit
 * „Bay“ machen das Ziel ungültig.
 */
const SOURCE_STATE_IN_TARGET = new RegExp(
  [
    String.raw`\b${SOURCE_STATE}${APPENDED_GUARD}`,
    String.raw`[${SOURCE_ADJECTIVE.slice(0, 1).toLocaleUpperCase('de-DE')}${SOURCE_ADJECTIVE.slice(0, 1)}]${SOURCE_ADJECTIVE.slice(1)}`,
    BAY_ABBREVIATION,
  ].join('|'),
  'u',
);

export function validateInstitutionRegistry(registry: InstitutionRegistry): void {
  if (registry.schemaVersion !== INSTITUTION_REGISTRY_SCHEMA) throw new Error(`${INSTITUTION_REGISTRY_PATH}: unbekannte Schemaversion ${registry.schemaVersion}`);
  const ids = new Set<string>();
  for (const entry of registry.entries) {
    const where = `${INSTITUTION_REGISTRY_PATH}: ${entry.id ?? '?'}`;
    if (!entry.id || ids.has(entry.id)) throw new Error(`${where}: fehlende oder doppelte Kennung`);
    ids.add(entry.id);
    if (!(INSTITUTION_STATUSES as readonly string[]).includes(entry.status)) throw new Error(`${where}: unbekannter Status ${entry.status}`);
    if (!entry.match?.length && !entry.pattern) throw new Error(`${where}: match oder pattern erforderlich`);
    if ((entry.status === 'map' || entry.status === 'safe-transform') && !entry.target) throw new Error(`${where}: Status ${entry.status} braucht target`);
    if (entry.status !== 'map' && entry.status !== 'safe-transform' && entry.target) throw new Error(`${where}: target nur bei map oder safe-transform`);
    if (entry.target && SOURCE_STATE_IN_TARGET.test(entry.target)) throw new Error(`${where}: target enthält die Bezeichnung des Herkunftslandes`);
    if (!entry.reason?.trim()) throw new Error(`${where}: Begründung fehlt`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(entry.reviewedAt ?? '')) throw new Error(`${where}: reviewedAt fehlt`);
    if (entry.pattern) new RegExp(entry.pattern, 'u');
  }
  for (const status of Object.values(registry.defaults)) if (!(INSTITUTION_STATUSES as readonly string[]).includes(status)) throw new Error(`${INSTITUTION_REGISTRY_PATH}: unbekannter Standardstatus ${status}`);
}

export function compileInstitutionRegistry(registry: InstitutionRegistry): CompiledInstitutionRegistry {
  validateInstitutionRegistry(registry);
  const compiled: CompiledEntry[] = registry.entries.map((entry) => ({ ...entry, exact: new Set((entry.match ?? []).map(normalize)), ...(entry.pattern ? { regex: new RegExp(entry.pattern, 'u') } : {}) }));
  return {
    registry,
    resolve(term, category) {
      const value = normalize(term);
      const candidates = compiled.filter((entry) => !category || entry.category === category);
      const entry = candidates.find((candidate) => candidate.exact.has(value)) ?? candidates.find((candidate) => candidate.regex?.test(value));
      if (entry) return { entry, status: entry.status, source: 'entry' };
      const fallback = category ? registry.defaults[category] : undefined;
      return fallback ? { status: fallback, source: 'default' } : { status: 'review', source: 'none' };
    },
  };
}

export function emptyInstitutionRegistry(): InstitutionRegistry {
  return { schemaVersion: INSTITUTION_REGISTRY_SCHEMA, defaults: {}, entries: [] };
}

/** Liest die Zuordnung aus dem Repository; fehlt die Datei, gilt die leere Zuordnung (alles Review). */
export async function readInstitutionRegistry(root: string): Promise<CompiledInstitutionRegistry> {
  let raw: string;
  try {
    raw = await readFile(join(root, INSTITUTION_REGISTRY_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return compileInstitutionRegistry(emptyInstitutionRegistry());
    throw error;
  }
  let parsed: InstitutionRegistry;
  try {
    parsed = JSON.parse(raw) as InstitutionRegistry;
  } catch (error) {
    throw new Error(`${INSTITUTION_REGISTRY_PATH}: unlesbare Zustandsdatei (${(error as Error).message})`);
  }
  return compileInstitutionRegistry(parsed);
}
