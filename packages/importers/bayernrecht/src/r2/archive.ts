/**
 * R2-Rohquellenarchiv des BAYERN.RECHT-Adapters: Objektschlüssel, Umschlag, Präfixschutz.
 *
 * Vorlage ist das erprobte West-Archiv (`@landesrecht/importer-recht-nrw/common/archive.ts`). Wiederverwendet
 * werden dort nur die portalneutralen Teile (Transporte, `ArchiveError`, Parallelitätsgrenzen); Objektschlüssel,
 * Umschlag und Manifestbindung hängen im West-Modul fest an den West-Konstanten und am West-Manifest und stehen
 * deshalb hier neu – feldgleich, soweit es die Quelle erlaubt.
 *
 *   Objekt     `baywue/bayernrecht/2023-12-01/<bereich>/<identität>/<sha256[0..16]>-<rolle>.<ext>`
 *   Umschlag   `<objekt>.envelope.json` (Quell-URL, finale URL, Abrufzeit, Media Type, Bytes, SHA-256,
 *              Quellidentität, Bereich, BayRS-Nummer, Jurisdiktion, Stichtag)
 *
 * `<identität>` ist der dateisystemsichere Name aus `paths.ts` (`a-z0-9-` plus Hash der vollen Identität);
 * BayRS-Nummern mit Punkt oder Schrägstrich können so weder Pfadsegmente erzeugen noch kollidieren.
 *
 * Unterschied zu West: Der Umschlag wird ausschließlich aus dem Manifest gebildet und ist damit
 * deterministisch. Das Staging legt genau die Bytes ab, die später hochgeladen werden – Staging und R2 sind
 * auch für Umschläge bytegleich (West lädt einen anderen Umschlag hoch, als es gestagt hat).
 *
 * Präfixschutz: Jeder Schlüssel, den dieser Adapter liest oder schreibt, liegt unter `R2_PREFIX`. Ein Schlüssel
 * außerhalb – etwa `west/recht-nrw/…` – ist ein harter Fehler, bevor ein Transport ihn sieht. Löschen kann das
 * Archiv nicht: Die Transportschnittstelle kennt kein `delete`.
 */
import { createHash } from 'node:crypto';

import { ArchiveError } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import type { R2ListedObject, R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { BASELINE_DATE, R2_PREFIX, SOURCE_AREAS, SOURCE_STATE, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import { R2_SOURCES_BUCKET } from '../common/environment.ts';
import type { ManifestEntry, ManifestRawDocument, RawDocumentRole } from '../common/manifest.ts';
import { identityFileName } from '../common/paths.ts';

export { ArchiveError };

/** Schlüsselpräfix mit abschließendem Trenner: `baywue/bayernrecht/2023-12-01/`. */
export const KEY_PREFIX = `${R2_PREFIX}/`;
/** Oberstes Präfix der Jurisdiktion (Zählung „unter baywue/“ im Bucketinventar). */
export const JURISDICTION_PREFIX = `${TARGET_JURISDICTION}/`;
if (!KEY_PREFIX.startsWith('baywue/')) throw new Error(`R2-Präfix ${KEY_PREFIX} liegt nicht unter baywue/`);

export const ENVELOPE_SCHEMA = 'bayernrecht-r2-envelope/1' as const;
export const ENVELOPE_SUFFIX = '.envelope.json';

const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export { md5 as md5Hex, sha256 as sha256Hex };

/** Dateiendung aus dem Media Type; das Exportpaket des Portals ist ein ZIP. */
export function extensionFor(contentType: string): string {
  if (/zip/iu.test(contentType)) return 'zip';
  if (/pdf/iu.test(contentType)) return 'pdf';
  if (/json/iu.test(contentType)) return 'json';
  if (/xml/iu.test(contentType)) return 'xml';
  if (/html/iu.test(contentType)) return 'html';
  return 'bin';
}

export interface ObjectKeyInput {
  sourceArea: SourceArea;
  sourceIdentity: string;
  sha256: string;
  role: RawDocumentRole;
  contentType: string;
}

/** Deterministischer, inhaltsadressierter Objektschlüssel einer Rohquelle unter dem BayWü-Präfix. */
export function r2ObjectKey(input: ObjectKeyInput): string {
  if (!(SOURCE_AREAS as readonly string[]).includes(input.sourceArea)) throw new ArchiveError('guard', `R2-Objektschlüssel: unbekannter Quellbereich ${String(input.sourceArea)}`);
  if (!/^[a-f0-9]{64}$/u.test(input.sha256)) throw new ArchiveError('guard', `R2-Objektschlüssel braucht einen SHA-256, nicht ${JSON.stringify(input.sha256)}`);
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(input.role)) throw new ArchiveError('guard', `R2-Objektschlüssel: Rolle ${JSON.stringify(input.role)} ist nicht kanonisch`);
  return assertArchiveKey(`${KEY_PREFIX}${input.sourceArea}/${identityFileName(input.sourceIdentity)}/${input.sha256.slice(0, 16)}-${input.role}.${extensionFor(input.contentType)}`);
}

export function envelopeKey(objectKey: string): string {
  return `${objectKey}${ENVELOPE_SUFFIX}`;
}

/**
 * Präfixschutz: Der Schlüssel muss unter `baywue/bayernrecht/2023-12-01/` liegen und kanonisch sein (keine
 * leeren, relativen oder ungewöhnlichen Segmente). Alles andere ist ein Fehler, nie eine Umdeutung.
 */
export function assertArchiveKey(key: string): string {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) {
    throw new ArchiveError('guard', `R2-Schlüssel ${JSON.stringify(key)} liegt außerhalb von ${KEY_PREFIX} – der BayWü-Adapter liest und schreibt nur unter seinem Präfix`);
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/u.test(segment))) {
    throw new ArchiveError('guard', `R2-Schlüssel ${JSON.stringify(key)} ist nicht kanonisch (leere, relative oder unzulässige Segmente)`);
  }
  return key;
}

export function isArchiveKey(key: string): boolean {
  try {
    assertArchiveKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transport mit Präfixschutz: `head`, `get` und `put` nur für Schlüssel unter `KEY_PREFIX`, `list` nur mit einem
 * Präfix darunter. Der Bucket muss der erwartete sein. Einen Löschweg gibt es nicht.
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
      if (!prefix.startsWith(KEY_PREFIX)) throw new ArchiveError('guard', `Listing ${JSON.stringify(prefix)} liegt außerhalb von ${KEY_PREFIX}`);
      const objects = await list(prefix);
      const foreign = objects.find((object) => !object.key.startsWith(prefix));
      if (foreign) throw new ArchiveError('guard', `Listing ${prefix} lieferte fremden Schlüssel ${foreign.key}`);
      return objects;
    };
  }
  return guarded;
}

/** Umschlag je Rohquelle – ausschließlich aus Manifest und Adapterkonstanten, damit deterministisch. */
export interface ArchiveEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA;
  bucket: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  url: string;
  finalUrl: string;
  retrievedAt: string;
  role: RawDocumentRole;
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceState: typeof SOURCE_STATE;
  sourceArea: SourceArea;
  sourceIdentity: string;
  bayRsNumber?: string;
  sourceTitle: string;
  jurisdiction: string;
  baselineDate: string;
}

export function envelopeFor(entry: Pick<ManifestEntry, 'sourceArea' | 'sourceIdentity' | 'bayRsNumber' | 'sourceTitle'>, raw: Pick<ManifestRawDocument, 'sha256' | 'byteLength' | 'contentType' | 'url' | 'finalUrl' | 'retrievedAt' | 'role'>, objectKey: string, bucket: string = R2_SOURCES_BUCKET): ArchiveEnvelope {
  return {
    schemaVersion: ENVELOPE_SCHEMA,
    bucket,
    objectKey: assertArchiveKey(objectKey),
    sha256: raw.sha256,
    byteLength: raw.byteLength,
    contentType: raw.contentType,
    url: raw.url,
    finalUrl: raw.finalUrl,
    retrievedAt: raw.retrievedAt,
    role: raw.role,
    sourceSystem: SOURCE_SYSTEM,
    sourceState: SOURCE_STATE,
    sourceArea: entry.sourceArea,
    sourceIdentity: entry.sourceIdentity,
    ...(entry.bayRsNumber ? { bayRsNumber: entry.bayRsNumber } : {}),
    sourceTitle: entry.sourceTitle,
    jurisdiction: TARGET_JURISDICTION,
    baselineDate: BASELINE_DATE,
  };
}

export function envelopeBytes(envelope: ArchiveEnvelope): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`);
}

/** Kernfelder, die ein Umschlag mit dem Manifest teilen muss (Prüfung gelesener Umschläge). */
export const ENVELOPE_CORE_FIELDS = ['objectKey', 'bucket', 'sha256', 'byteLength', 'contentType', 'url', 'finalUrl', 'retrievedAt', 'sourceIdentity', 'sourceArea'] as const;

export function envelopeCoreProblems(actual: unknown, expected: ArchiveEnvelope): string[] {
  if (!actual || typeof actual !== 'object') return ['kein JSON-Objekt'];
  const record = actual as Record<string, unknown>;
  const problems: string[] = [];
  if (record.schemaVersion !== ENVELOPE_SCHEMA) problems.push(`schemaVersion ${JSON.stringify(record.schemaVersion)}`);
  for (const field of ENVELOPE_CORE_FIELDS) if (record[field] !== expected[field]) problems.push(`${field} ${JSON.stringify(record[field])} statt ${JSON.stringify(expected[field])}`);
  return problems;
}

/** Objektmetadaten (nur Transporte, die sie tragen; der Umschlag ist die maßgebliche Beschreibung). */
export function objectMetadata(envelope: ArchiveEnvelope): Record<string, string> {
  return { sha256: envelope.sha256, 'source-url': envelope.url, 'final-url': envelope.finalUrl, 'retrieved-at': envelope.retrievedAt, role: envelope.role, 'source-identity': envelope.sourceIdentity, 'source-area': envelope.sourceArea, 'byte-length': String(envelope.byteLength) };
}

/**
 * Deterministische Stichprobe: Reihenfolge nach `sha256(seed:schlüssel)`. Dieselbe Saat wählt bei jedem Lauf
 * dieselben Objekte – eine Stichprobe, die sich nachprüfen lässt, statt einer, die man glauben muss.
 */
export function sampleOrder(seed: string, key: string): string {
  return sha256(`${seed}:${key}`);
}

/** Aufnahme in eine Stichprobe mit Quote `rate` (0–1), deterministisch aus Saat und Schlüssel. */
export function inDeterministicSample(seed: string, key: string, rate: number): boolean {
  return Number.parseInt(sampleOrder(seed, key).slice(0, 8), 16) / 0x1_0000_0000 < rate;
}

/** Die ersten `size` Elemente in deterministischer Stichprobenordnung. */
export function deterministicSample<T>(items: readonly T[], keyOf: (item: T) => string, seed: string, size: number): T[] {
  return items
    .map((item) => ({ item, order: sampleOrder(seed, keyOf(item)) }))
    .sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0))
    .slice(0, Math.max(0, size))
    .map((entry) => entry.item);
}
