/**
 * Baseline-Locks der Simulationsrechtsfortschreibung (`data/simulation/baseline-locks.json`).
 *
 * Zwei Ebenen:
 *   - **Referenz-Commit je Land** (`jurisdictions.<land>.commit`): Alle Ausgangsfassungen des Landes sind gegen diesen
 *     Commit byteidentisch (Gate G2), soweit keine dokumentierte Freigabe gilt. `freeze: true` (West) macht den Commit
 *     unverrückbar: Er gilt auch für Normen mit Baseline-Seed.
 *   - **Baseline-Seed je fortgeschriebener Norm** (`seeds[]`): Eine Sim-Konsolidierung ist an den fachlich akzeptierten
 *     Inhalt ihrer konkreten Ausgangsfassung gebunden (SHA-256 der Datei), nicht an einen globalen Commit. Ein Seed
 *     wird nur mit ausdrücklicher Entscheidung registriert (`acceptedAt`, `decision`); `sourceCommit` nennt den Commit,
 *     in dem dieser Inhalt (und die zugehörige `meta.json`/`history.json`) erstmals akzeptiert vorlag.
 *
 * Das frühere flache Format `{ "<land>": "<commit>" }` (Schema 1) wird weiterhin gelesen; es kennt keine Seeds.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isJurisdictionId, JURISDICTION_IDS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { SIMULATION_DATA_DIR } from './paths.ts';

export const BASELINE_LOCKS_PATH = `${SIMULATION_DATA_DIR}/baseline-locks.json`;
export const BASELINE_LOCKS_SCHEMA = 'landesrecht-simulation-baseline-locks/2' as const;

export interface JurisdictionLock {
  commit: string;
  /** Referenz-Freeze: der Commit gilt ausnahmslos, auch für Normen mit Seed. */
  freeze: boolean;
  note?: string;
}

export interface BaselineSeed {
  jurisdiction: JurisdictionId;
  slug: string;
  baselineVersionId: string;
  /** SHA-256 der gespeicherten Datei `versions/<baselineVersionId>.json` (Bytes, UTF-8). */
  sha256: string;
  acceptedAt: string;
  /** Entscheidungsreferenz (Freigabe, Lauf, Dokument). */
  decision: string;
  sourceCommit?: string;
}

/**
 * Abgelöster Seed (Lauf 19): nie gelöscht, sondern mit Grund und Entscheidung dokumentiert. Ein abgelöster Seed ist nicht
 * aktiv – er bindet keine Konsolidierung und berechtigt keine Sim-Sperre.
 */
export interface SupersededSeed extends BaselineSeed {
  supersededAt: string;
  /** Warum der Seed fachlich nicht (mehr) trägt. */
  reason: string;
  /** Entscheidung, die ihn ablöst (Nutzer, Datum, Dokument). */
  supersededBy: string;
}

export interface BaselineLockFile {
  schemaVersion: 1 | 2;
  jurisdictions: Partial<Record<JurisdictionId, JurisdictionLock>>;
  seeds: BaselineSeed[];
  supersededSeeds?: SupersededSeed[];
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function fail(path: string, message: string): never {
  throw new Error(`${BASELINE_LOCKS_PATH}${path}: ${message}`);
}

export function parseBaselineLockFile(value: unknown): BaselineLockFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('', 'muss ein Objekt sein');
  const object = value as Record<string, unknown>;
  if (object.schemaVersion === undefined) {
    // Schema 1: { "<jurisdiction>": "<commit>" } – flach, nur Jurisdiktionen, keine Seeds.
    const jurisdictions: BaselineLockFile['jurisdictions'] = {};
    for (const [key, commit] of Object.entries(object)) {
      if (!isJurisdictionId(key)) fail('', `unbekannter Schlüssel „${key}“ (zulässig: ${JURISDICTION_IDS.join(', ')})`);
      if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) fail(`.${key}`, 'muss ein Commit-Hash sein');
      jurisdictions[key] = { commit, freeze: false };
    }
    return { schemaVersion: 1, jurisdictions, seeds: [] };
  }
  if (object.schemaVersion !== BASELINE_LOCKS_SCHEMA) fail('.schemaVersion', `unbekannt (erwartet ${BASELINE_LOCKS_SCHEMA})`);
  for (const key of Object.keys(object)) if (!['schemaVersion', 'description', 'jurisdictions', 'seeds', 'supersededSeeds'].includes(key)) fail(`.${key}`, 'unbekanntes Feld');
  const rawJurisdictions = object.jurisdictions;
  if (typeof rawJurisdictions !== 'object' || rawJurisdictions === null || Array.isArray(rawJurisdictions)) fail('.jurisdictions', 'muss ein Objekt sein');
  const jurisdictions: BaselineLockFile['jurisdictions'] = {};
  for (const [key, entry] of Object.entries(rawJurisdictions as Record<string, unknown>)) {
    if (!isJurisdictionId(key)) fail('.jurisdictions', `unbekannter Schlüssel „${key}“ (zulässig: ${JURISDICTION_IDS.join(', ')})`);
    if (typeof entry !== 'object' || entry === null) fail(`.jurisdictions.${key}`, 'muss ein Objekt sein');
    const lock = entry as Record<string, unknown>;
    for (const field of Object.keys(lock)) if (!['commit', 'freeze', 'note'].includes(field)) fail(`.jurisdictions.${key}.${field}`, 'unbekanntes Feld');
    if (typeof lock.commit !== 'string' || !COMMIT_PATTERN.test(lock.commit)) fail(`.jurisdictions.${key}.commit`, 'muss ein Commit-Hash sein');
    if (lock.freeze !== undefined && typeof lock.freeze !== 'boolean') fail(`.jurisdictions.${key}.freeze`, 'muss true/false sein');
    jurisdictions[key] = { commit: lock.commit, freeze: lock.freeze === true, ...(typeof lock.note === 'string' ? { note: lock.note } : {}) };
  }
  if (!Array.isArray(object.seeds)) fail('.seeds', 'muss eine Liste sein');
  const seeds: BaselineSeed[] = [];
  const keys = new Set<string>();
  (object.seeds as unknown[]).forEach((entry, index) => {
    const path = `.seeds[${index}]`;
    if (typeof entry !== 'object' || entry === null) fail(path, 'muss ein Objekt sein');
    const seed = entry as Record<string, unknown>;
    for (const field of Object.keys(seed)) if (!['jurisdiction', 'slug', 'baselineVersionId', 'sha256', 'acceptedAt', 'decision', 'sourceCommit'].includes(field)) fail(`${path}.${field}`, 'unbekanntes Feld');
    if (typeof seed.jurisdiction !== 'string' || !isJurisdictionId(seed.jurisdiction)) fail(`${path}.jurisdiction`, 'unbekannte Jurisdiktion');
    if (typeof seed.slug !== 'string' || !SLUG_PATTERN.test(seed.slug)) fail(`${path}.slug`, 'muss ein Slug sein');
    if (typeof seed.baselineVersionId !== 'string' || !DATE_PATTERN.test(seed.baselineVersionId)) fail(`${path}.baselineVersionId`, 'muss eine Fassungskennung (Datum) sein');
    if (seed.baselineVersionId !== SIMULATION_BASELINE_DATE) fail(`${path}.baselineVersionId`, `muss der Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE} sein`);
    if (typeof seed.sha256 !== 'string' || !SHA256_PATTERN.test(seed.sha256)) fail(`${path}.sha256`, 'muss ein SHA-256-Hexwert sein');
    if (typeof seed.acceptedAt !== 'string' || !DATE_PATTERN.test(seed.acceptedAt)) fail(`${path}.acceptedAt`, 'muss ein ISO-Datum sein');
    if (typeof seed.decision !== 'string' || seed.decision.trim() === '') fail(`${path}.decision`, 'Entscheidungsreferenz fehlt');
    if (seed.sourceCommit !== undefined && (typeof seed.sourceCommit !== 'string' || !COMMIT_PATTERN.test(seed.sourceCommit))) fail(`${path}.sourceCommit`, 'muss ein Commit-Hash sein');
    const key = `${seed.jurisdiction}/${seed.slug}`;
    if (keys.has(key)) fail(path, `Seed ${key} doppelt`);
    keys.add(key);
    seeds.push({ jurisdiction: seed.jurisdiction, slug: seed.slug, baselineVersionId: seed.baselineVersionId, sha256: seed.sha256, acceptedAt: seed.acceptedAt, decision: seed.decision, ...(seed.sourceCommit ? { sourceCommit: seed.sourceCommit as string } : {}) });
  });
  const supersededSeeds: SupersededSeed[] = [];
  if (object.supersededSeeds !== undefined) {
    if (!Array.isArray(object.supersededSeeds)) fail('.supersededSeeds', 'muss eine Liste sein');
    (object.supersededSeeds as unknown[]).forEach((entry, index) => {
      const path = `.supersededSeeds[${index}]`;
      if (typeof entry !== 'object' || entry === null) fail(path, 'muss ein Objekt sein');
      const seed = entry as Record<string, unknown>;
      for (const field of Object.keys(seed)) if (!['jurisdiction', 'slug', 'baselineVersionId', 'sha256', 'acceptedAt', 'decision', 'sourceCommit', 'supersededAt', 'reason', 'supersededBy'].includes(field)) fail(`${path}.${field}`, 'unbekanntes Feld');
      if (typeof seed.jurisdiction !== 'string' || !isJurisdictionId(seed.jurisdiction)) fail(`${path}.jurisdiction`, 'unbekannte Jurisdiktion');
      if (typeof seed.slug !== 'string' || !SLUG_PATTERN.test(seed.slug)) fail(`${path}.slug`, 'muss ein Slug sein');
      if (typeof seed.sha256 !== 'string' || !SHA256_PATTERN.test(seed.sha256)) fail(`${path}.sha256`, 'muss ein SHA-256-Hexwert sein');
      for (const field of ['acceptedAt', 'supersededAt'] as const) if (typeof seed[field] !== 'string' || !DATE_PATTERN.test(seed[field] as string)) fail(`${path}.${field}`, 'muss ein ISO-Datum sein');
      for (const field of ['decision', 'reason', 'supersededBy'] as const) if (typeof seed[field] !== 'string' || (seed[field] as string).trim() === '') fail(`${path}.${field}`, 'fehlt');
      if (seeds.some((active) => active.jurisdiction === seed.jurisdiction && active.slug === seed.slug && active.sha256 === seed.sha256)) fail(path, `abgelöster Seed ${String(seed.slug)} ist zugleich aktiv`);
      supersededSeeds.push(seed as unknown as SupersededSeed);
    });
  }
  return { schemaVersion: 2, jurisdictions, seeds, ...(supersededSeeds.length > 0 ? { supersededSeeds } : {}) };
}

/** Lock-Datei lesen; fehlt sie, `undefined` (kein Lock, z. B. in Test-Wurzeln). */
export async function readBaselineLockFile(root: string): Promise<BaselineLockFile | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(root, BASELINE_LOCKS_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseBaselineLockFile(JSON.parse(raw));
}

/** Seeds eines Landes nach Slug. */
export function seedsFor(file: BaselineLockFile, jurisdiction: JurisdictionId): Map<string, BaselineSeed> {
  return new Map(file.seeds.filter((seed) => seed.jurisdiction === jurisdiction).map((seed) => [seed.slug, seed]));
}
