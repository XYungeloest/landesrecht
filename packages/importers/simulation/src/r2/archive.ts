/**
 * Sim-Quellenarchiv in R2: die Originaldateien der Sim-Rechtsquellensammlung (`imports/`, inventarisiert in
 * `data/simulation/source-inventory.json`) liegen unverändert im gemeinsamen Bucket `landesrecht-quellen` unter
 *
 *   <jurisdiction>/simulation/<sha256>.<ext>                das Objekt (Bytes der Originaldatei)
 *   <jurisdiction>/simulation/<sha256>.<ext>.envelope.json  der Umschlag (Originaldateinamen, SHA-256, Größe,
 *                                                           Medienart, jurisdictionCandidate, Inventar-Zeitpunkt)
 *
 * Muster: `packages/importers/juris-sh/src/r2/` und `packages/importers/bayernrecht/src/r2/` (nur gelesen). Die
 * Transporte kommen aus `@landesrecht/importer-recht-nrw/common/r2-transport.ts`; `guardTransport` lässt nur
 * Schlüssel unter `<jurisdiction>/simulation/` zu – ein Schlüssel eines Baseline-Archivs (`west/recht-nrw/…`) ist
 * ein harter Fehler, bevor ein Transport ihn sieht. Löschen kann das Archiv nicht.
 *
 * Der Schlüssel ist inhaltsadressiert: Die Endung folgt der Originaldatei (wie die Cachekopie
 * `.cache/simulation/archive/<sha256>.<ext>`), die Jurisdiktion ist der Kandidat aus dem Inventar. Objekte und
 * Umschläge sind unveränderlich; ein vorhandener Schlüssel mit anderem Inhalt ist ein Konflikt, nie ein Überschreiben.
 */
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

import { ArchiveError } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import type { R2ListedObject, R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';
import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { InventorySource, SourceInventory } from '../inventory/scan.ts';

export { ArchiveError };

/** Bucket des gemeinsamen Quellenarchivs (wie West, NSH, BayWü; die Präfixe trennen die Bestände). */
export const R2_SOURCES_BUCKET = 'landesrecht-quellen';
/** Zweites Pfadsegment aller Sim-Objekte: `<jurisdiction>/simulation/…`. */
export const ARCHIVE_SEGMENT = 'simulation';
export const SOURCE_SYSTEM = 'simulation' as const;
export const ENVELOPE_SCHEMA = 'simulation-r2-envelope/1' as const;
export const ENVELOPE_SUFFIX = '.envelope.json';

const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export { md5 as md5Hex, sha256 as sha256Hex };

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/u;
const KEY_PATTERN = new RegExp(`^(${JURISDICTION_IDS.join('|')})/${ARCHIVE_SEGMENT}/([0-9a-f]{64})\\.([a-z0-9]{1,8})(\\.envelope\\.json)?$`, 'u');

/** Endung der Archivkopie: die der Originaldatei (klein), sonst `bin` – identisch mit `.cache/simulation/archive/`. */
export function archiveExtension(source: Pick<InventorySource, 'paths'>): string {
  const extension = extname(source.paths[0] ?? '').slice(1).toLowerCase();
  return EXTENSION_PATTERN.test(extension) ? extension : 'bin';
}

export function keyPrefixFor(jurisdiction: JurisdictionId): string {
  return `${jurisdiction}/${ARCHIVE_SEGMENT}/`;
}

/** `<jurisdiction>/simulation/<sha256>.<ext>` – inhaltsadressiert, unveränderlich. */
export function r2ObjectKey(input: { jurisdiction: JurisdictionId; sha256: string; extension: string }): string {
  if (!isJurisdictionId(input.jurisdiction)) throw new ArchiveError('guard', `R2-Objektschlüssel: unbekannte Jurisdiktion ${String(input.jurisdiction)}`);
  if (!/^[0-9a-f]{64}$/u.test(input.sha256)) throw new ArchiveError('guard', `R2-Objektschlüssel braucht einen SHA-256, nicht ${JSON.stringify(input.sha256)}`);
  if (!EXTENSION_PATTERN.test(input.extension)) throw new ArchiveError('guard', `R2-Objektschlüssel: Endung ${JSON.stringify(input.extension)} ist nicht kanonisch`);
  return assertArchiveKey(`${keyPrefixFor(input.jurisdiction)}${input.sha256}.${input.extension}`);
}

export function objectKeyForSource(source: Pick<InventorySource, 'sha256' | 'paths' | 'jurisdictionCandidate'>): string {
  return r2ObjectKey({ jurisdiction: source.jurisdictionCandidate, sha256: source.sha256, extension: archiveExtension(source) });
}

export function envelopeKey(objectKey: string): string {
  return `${assertArchiveKey(objectKey)}${ENVELOPE_SUFFIX}`;
}

export interface ParsedArchiveKey {
  jurisdiction: JurisdictionId;
  sha256: string;
  extension: string;
  envelope: boolean;
}

/** Zerlegt einen Schlüssel; alles außerhalb von `<jurisdiction>/simulation/<sha256>.<ext>[.envelope.json]` ist ein Fehler. */
export function parseArchiveKey(key: string): ParsedArchiveKey {
  const match = typeof key === 'string' ? KEY_PATTERN.exec(key) : null;
  if (!match || !isJurisdictionId(match[1])) {
    throw new ArchiveError('guard', `R2-Schlüssel ${JSON.stringify(key)} liegt außerhalb von <jurisdiction>/${ARCHIVE_SEGMENT}/<sha256>.<ext> – das Sim-Archiv liest und schreibt nur dort`);
  }
  return { jurisdiction: match[1], sha256: match[2]!, extension: match[3]!, envelope: match[4] !== undefined };
}

export function assertArchiveKey(key: string): string {
  parseArchiveKey(key);
  return key;
}

export function isArchiveKey(key: string): boolean {
  try {
    parseArchiveKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Zulässige Listing-Präfixe: genau `<jurisdiction>/simulation/` (oder ein Schlüsselanfang darunter). */
export function isArchivePrefix(prefix: string): boolean {
  return JURISDICTION_IDS.some((jurisdiction) => prefix.startsWith(keyPrefixFor(jurisdiction)) && !prefix.includes('..') && !prefix.includes('//'));
}

/**
 * Transport mit Präfixschutz: `head`, `get`, `put` nur für Schlüssel des Sim-Archivs, `list` nur unter einem
 * Jurisdiktionspräfix; der Bucket muss der erwartete sein. Einen Löschweg gibt es nicht.
 */
export function guardTransport(inner: R2Transport, bucket: string = R2_SOURCES_BUCKET): R2Transport {
  if (inner.bucket !== bucket) throw new ArchiveError('guard', `Transport ${inner.name} zielt auf Bucket ${inner.bucket}, erwartet ${bucket}`);
  const guarded: R2Transport = {
    name: inner.name,
    bucket: inner.bucket,
    head: async (key) => inner.head(assertArchiveKey(key)),
    get: async (key) => inner.get(assertArchiveKey(key)),
    put: async (key, bytes, options) => inner.put(assertArchiveKey(key), bytes, options),
  };
  if (inner.list) {
    const list = inner.list.bind(inner);
    guarded.list = async (prefix: string): Promise<R2ListedObject[]> => {
      if (!isArchivePrefix(prefix)) throw new ArchiveError('guard', `Listing ${JSON.stringify(prefix)} liegt außerhalb von <jurisdiction>/${ARCHIVE_SEGMENT}/`);
      const objects = await list(prefix);
      const foreign = objects.find((object) => !object.key.startsWith(prefix));
      if (foreign) throw new ArchiveError('guard', `Listing ${prefix} lieferte fremden Schlüssel ${foreign.key}`);
      return objects;
    };
  }
  return guarded;
}

/** Umschlag je Objekt – ausschließlich aus dem Inventar gebildet, damit deterministisch. */
export interface ArchiveEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA;
  bucket: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  /** Originaldateiname(n) im Archiv des Nutzers (Dubletten teilen das Objekt). */
  fileNames: string[];
  /** Archivpfade relativ zu `imports/`. */
  archivePaths: string[];
  /** Jurisdiktionskandidat aus dem Archivordner; die fachliche Zuordnung entscheidet die Evidenzprüfung. */
  jurisdictionCandidate: JurisdictionId;
  /** Zeitpunkt der Inventarisierung (`source-inventory.json`, `scannedAt`). */
  inventoriedAt: string;
  sourceSystem: typeof SOURCE_SYSTEM;
  pageCount?: number;
  textLayer?: string;
}

export function envelopeFor(source: InventorySource, inventory: Pick<SourceInventory, 'scannedAt'>, objectKey: string, bucket: string = R2_SOURCES_BUCKET): ArchiveEnvelope {
  const parsed = parseArchiveKey(objectKey);
  if (parsed.envelope) throw new ArchiveError('guard', `Umschlag ${objectKey} ist kein Objektschlüssel`);
  if (parsed.sha256 !== source.sha256) throw new ArchiveError('guard', `Objektschlüssel ${objectKey} passt nicht zum SHA-256 der Quelle ${source.sha256}`);
  if (parsed.jurisdiction !== source.jurisdictionCandidate) throw new ArchiveError('guard', `Objektschlüssel ${objectKey} liegt nicht unter dem Jurisdiktionskandidaten ${source.jurisdictionCandidate}`);
  return {
    schemaVersion: ENVELOPE_SCHEMA,
    bucket,
    objectKey,
    sha256: source.sha256,
    byteLength: source.byteLength,
    contentType: source.mediaType,
    fileNames: [...new Set(source.paths.map((path) => path.split('/').pop() ?? path))],
    archivePaths: [...source.paths],
    jurisdictionCandidate: source.jurisdictionCandidate,
    inventoriedAt: inventory.scannedAt,
    sourceSystem: SOURCE_SYSTEM,
    ...(source.pageCount !== undefined ? { pageCount: source.pageCount } : {}),
    ...(source.textLayer ? { textLayer: source.textLayer } : {}),
  };
}

export function envelopeBytes(envelope: ArchiveEnvelope): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`);
}

/** Kernfelder eines Umschlags; weichen sie ab, ist ein vorhandener Umschlag ein Konflikt (Beschreibendes darf abweichen). */
export const ENVELOPE_CORE_FIELDS = ['objectKey', 'bucket', 'sha256', 'byteLength', 'contentType', 'jurisdictionCandidate'] as const;

export function envelopeCoreProblems(actual: unknown, expected: ArchiveEnvelope): string[] {
  if (!actual || typeof actual !== 'object') return ['kein JSON-Objekt'];
  const record = actual as Record<string, unknown>;
  const problems: string[] = [];
  if (record.schemaVersion !== ENVELOPE_SCHEMA) problems.push(`schemaVersion ${JSON.stringify(record.schemaVersion)}`);
  for (const field of ENVELOPE_CORE_FIELDS) if (record[field] !== expected[field]) problems.push(`${field} ${JSON.stringify(record[field])} statt ${JSON.stringify(expected[field])}`);
  return problems;
}

/** Objektmetadaten (nur ASCII-sichere Werte; Dateinamen mit Umlauten stehen allein im Umschlag). */
export function objectMetadata(envelope: ArchiveEnvelope): Record<string, string> {
  return { sha256: envelope.sha256, 'source-system': envelope.sourceSystem, jurisdiction: envelope.jurisdictionCandidate, 'byte-length': String(envelope.byteLength), 'inventoried-at': envelope.inventoriedAt };
}
