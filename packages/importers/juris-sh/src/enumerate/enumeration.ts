/**
 * Enumeration des juris-SH-Bestands je Quellbereich (`data/imports/juris-sh/enumeration-<bereich>.json`).
 *
 * Quelle ist die Sitemap des Bürgerservice (die einzige öffentliche Gesamtliste, siehe `sitemap.ts`).
 * Schlüssel und Quellidentität ist die juris-Dokumentnummer (DOKNR) des Rahmendokuments bzw. der
 * Verwaltungsvorschrift; die Dokumentadresse wird daraus gebildet, nie umgekehrt.
 *
 * **Fixpunkt.** Der fachliche Fingerabdruck ist der SHA-256 der kanonischen Eintragsliste (Kennung, Zahl der
 * Einheiten). Ein Lauf vergleicht ihn mit dem gespeicherten Vorgänger: gleich → `stable`; stammt der Lauf aus
 * einem **neuen** Abruf der Sitemap (andere Abrufzeit), zählt er als Bestätigung. Weichen die Mengen ab, hält
 * die Datei die Differenz fest (hinzugekommen/weggefallen) – keine stille Übernahme. Readiness verlangt
 * `stable` mit mindestens einer Bestätigung durch einen unabhängigen zweiten Abruf.
 *
 * Wiederholungsläufe aus dem Cache ändern die Datei nicht (keine Laufzeitstempel außer den Abrufzeiten der
 * Quellen).
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { documentUrl } from '../access/policy.ts';
import { BASELINE_DATE, SOURCE_SYSTEM, TARGET_JURISDICTION } from '../common/constants.ts';
import { compareSourceIdentity, enumerationPath } from '../common/paths.ts';
import type { SitemapInventory } from './sitemap.ts';

export const ENUMERATION_SCHEMA = 'juris-sh-enumeration/1' as const;
export const ENUMERABLE_AREAS = ['landesrecht', 'vwv'] as const;
export type EnumerableArea = (typeof ENUMERABLE_AREAS)[number];

export const ENUMERATION_STATUSES = ['pending', 'processing', 'done', 'review', 'failed', 'excluded'] as const;
export type EnumerationStatus = (typeof ENUMERATION_STATUSES)[number];

/** Beleg einer abgerufenen Quelle (Adresse, SHA-256 der empfangenen Bytes, Größe, Abrufzeit). */
export interface SourceRecord {
  url: string;
  finalUrl: string;
  httpStatus: number;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
}

export interface EnumerationItem {
  /** DOKNR – Schlüssel und Quellidentität. */
  key: string;
  /** Einheiten des Rahmendokuments laut Sitemap (nur Landesrecht). */
  units?: number;
  status: EnumerationStatus;
}

export interface EnumerationFixpoint {
  stable: boolean;
  previousFingerprint: string | null;
  /** Abrufzeit der Sitemap im Vorgängerlauf. */
  previousRetrievedAt: string | null;
  /** Abrufzeit der Sitemap in diesem Lauf (jüngste der Teil-Sitemaps). */
  retrievedAt: string;
  /** Dieser Lauf beruht auf einem neuen Abruf (nicht auf demselben Cachestand wie der Vorgänger). */
  independentRefetch: boolean;
  /** Anzahl unabhängiger Abrufe, die denselben Fingerabdruck bestätigt haben. */
  confirmations: number;
  /** Differenz zum Vorgänger (nur bei Abweichung; gekürzt auf 50 je Seite). */
  delta?: { added: number; removed: number; changed: number; examples: { added: string[]; removed: string[]; changed: string[] } };
}

export interface EnumerationFile {
  schemaVersion: typeof ENUMERATION_SCHEMA;
  sourceSystem: typeof SOURCE_SYSTEM;
  jurisdiction: typeof TARGET_JURISDICTION;
  sourceArea: EnumerableArea;
  baselineDate: string;
  identity: { scheme: 'juris-doknr'; description: string; documentUrlTemplate: string };
  sources: { sitemapIndex: SourceRecord; sitemaps: SourceRecord[] };
  counts: { items: number; units?: number; orphanUnits?: number; duplicatesInSitemap: number };
  fingerprint: string;
  fixpoint: EnumerationFixpoint;
  items: EnumerationItem[];
}

const IDENTITY_DESCRIPTION: Record<EnumerableArea, string> = {
  landesrecht: 'juris-Dokumentnummer (DOKNR) des Rahmendokuments, Form jlr-NNLSH<8 Hex>; sprechende Kennungen (jlr-…rahmen) sind Aliase und werden über /perma?d= auf die DOKNR aufgelöst',
  vwv: 'juris-Dokumentnummer (DOKNR) der Verwaltungsvorschrift, Form VVSH-VVSH<9 Ziffern>; Gliederungsnummer-Kennungen (VVSH-<Gl.Nr.>-…) sind Aliase',
};

export function enumerationFingerprint(items: readonly EnumerationItem[]): string {
  return createHash('sha256').update(stableStringify(items.map((item) => ({ key: item.key, units: item.units })))).digest('hex');
}

function latest(records: readonly SourceRecord[]): string {
  return records.map((record) => record.retrievedAt).sort().at(-1) ?? '';
}

export interface BuildEnumerationInput {
  area: EnumerableArea;
  inventory: SitemapInventory;
  sitemapIndex: SourceRecord;
  sitemaps: SourceRecord[];
  previous?: EnumerationFile;
}

export function buildEnumeration(input: BuildEnumerationInput): EnumerationFile {
  const { area, inventory, previous } = input;
  const previousStatus = new Map((previous?.items ?? []).map((item) => [item.key, item.status]));
  const items: EnumerationItem[] = area === 'landesrecht'
    ? [...inventory.frames].map(([key, units]) => ({ key, units, status: previousStatus.get(key) ?? 'pending' }))
    : inventory.vwv.map((key) => ({ key, status: previousStatus.get(key) ?? 'pending' }));
  items.sort((left, right) => compareSourceIdentity(left.key, right.key));
  const fingerprint = enumerationFingerprint(items);
  const retrievedAt = latest(input.sitemaps);

  const previousRetrievedAt = previous ? latest(previous.sources.sitemaps) : null;
  const stable = previous !== undefined && previous.fingerprint === fingerprint;
  const independentRefetch = previous !== undefined && previousRetrievedAt !== retrievedAt;
  const fixpoint: EnumerationFixpoint = {
    stable,
    previousFingerprint: previous?.fingerprint ?? null,
    previousRetrievedAt,
    retrievedAt,
    independentRefetch,
    confirmations: stable ? (previous!.fixpoint.confirmations + (independentRefetch ? 1 : 0)) : 0,
  };
  if (previous && !stable) {
    const before = new Map(previous.items.map((item) => [item.key, item.units]));
    const after = new Map(items.map((item) => [item.key, item.units]));
    const added = [...after.keys()].filter((key) => !before.has(key));
    const removed = [...before.keys()].filter((key) => !after.has(key));
    const changed = [...after.keys()].filter((key) => before.has(key) && before.get(key) !== after.get(key));
    fixpoint.delta = { added: added.length, removed: removed.length, changed: changed.length, examples: { added: added.slice(0, 50), removed: removed.slice(0, 50), changed: changed.slice(0, 50) } };
  }
  // Ein Wiederholungslauf aus demselben Cachestand übernimmt den Vorgänger unverändert (kein Diff).
  if (previous && stable && !independentRefetch) {
    return { ...previous, items };
  }
  return {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceSystem: SOURCE_SYSTEM,
    jurisdiction: TARGET_JURISDICTION,
    sourceArea: area,
    baselineDate: BASELINE_DATE,
    identity: { scheme: 'juris-doknr', description: IDENTITY_DESCRIPTION[area], documentUrlTemplate: documentUrl('{DOKNR}').replace(encodeURIComponent('{DOKNR}'), '{DOKNR}') },
    sources: { sitemapIndex: input.sitemapIndex, sitemaps: input.sitemaps },
    counts: {
      items: items.length,
      ...(area === 'landesrecht' ? { units: items.reduce((sum, item) => sum + (item.units ?? 0), 0), orphanUnits: inventory.orphanUnits.length } : {}),
      duplicatesInSitemap: inventory.duplicates.length,
    },
    fingerprint,
    fixpoint,
    items,
  };
}

/** Invarianten, die jede geschriebene Enumeration erfüllen muss. */
export function checkEnumeration(file: EnumerationFile): string[] {
  const problems: string[] = [];
  if (file.schemaVersion !== ENUMERATION_SCHEMA) problems.push(`Schema ${String(file.schemaVersion)}`);
  if (file.items.length !== file.counts.items) problems.push(`counts.items ${file.counts.items} ≠ ${file.items.length} Einträge`);
  if (enumerationFingerprint(file.items) !== file.fingerprint) problems.push('Fingerabdruck passt nicht zu den Einträgen');
  const keys = new Set<string>();
  for (const item of file.items) {
    if (keys.has(item.key)) problems.push(`doppelter Schlüssel ${item.key}`);
    keys.add(item.key);
    if (!(ENUMERATION_STATUSES as readonly string[]).includes(item.status)) problems.push(`${item.key}: Status ${String(item.status)}`);
  }
  const sorted = [...file.items].sort((left, right) => compareSourceIdentity(left.key, right.key));
  if (sorted.some((item, index) => item.key !== file.items[index]!.key)) problems.push('Einträge nicht deterministisch sortiert');
  if (file.sources.sitemaps.length === 0) problems.push('keine Sitemap-Belege');
  for (const record of [file.sources.sitemapIndex, ...file.sources.sitemaps]) {
    if (!/^[0-9a-f]{64}$/u.test(record.sha256)) problems.push(`${record.url}: kein SHA-256`);
    if (record.httpStatus !== 200) problems.push(`${record.url}: HTTP ${record.httpStatus}`);
  }
  return problems;
}

export async function readEnumeration(root: string, area: EnumerableArea): Promise<EnumerationFile | undefined> {
  return readJsonFile<EnumerationFile>(join(root, enumerationPath(area)));
}

export async function writeEnumeration(root: string, file: EnumerationFile): Promise<boolean> {
  return writeJsonAtomic(join(root, enumerationPath(file.sourceArea)), file);
}
