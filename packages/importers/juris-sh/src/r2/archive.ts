/**
 * Quellenarchiv des NSH-Bestands in R2: Rohquellen (PDF-Ausgaben der juris-Plattform) der übernommenen Normen,
 * unverändert, unter `nsh/juris-sh/2023-12-01/…` im gemeinsamen Bucket `landesrecht-quellen`.
 *
 * Verfahren wie BayWü (`packages/importers/bayernrecht/src/r2/`, dort nur gelesen): Staging außerhalb von Git
 * (`.cache/juris-sh-r2-staging/<objektschlüssel>`), je Objekt ein Umschlag (`<schlüssel>.envelope.json`) mit
 * Herkunft und Prüfsumme, Upload nur nach Nachrechnen, Rücklesen nach dem Upload, Unveränderlichkeit (vorhandene
 * Objekte mit anderem Inhalt sind ein harter Fehler). Die jurisdiktionsneutralen Bausteine kommen aus dem
 * West-Adapter (`ArchiveError`, `uploadVerified`, Transporte); Schlüssel und Umschlag sind NSH-eigen.
 */
import { createHash } from 'node:crypto';

import { ArchiveError } from '@landesrecht/importer-recht-nrw/common/archive.ts';
import type { R2Transport } from '@landesrecht/importer-recht-nrw/common/r2-transport.ts';

import { BASELINE_DATE, R2_PREFIX, SOURCE_STATE, SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '../common/constants.ts';
import { R2_SOURCES_BUCKET } from '../common/environment.ts';
import type { ManifestEntry, ManifestRawDocument } from '../common/manifest.ts';
import { identityFileName } from '../common/paths.ts';

export { ArchiveError };

/** Alle Objekte dieses Bestands liegen unter diesem Präfix; alles andere lehnt der Transportwächter ab. */
export const KEY_PREFIX = `${R2_PREFIX}/`;
export const ENVELOPE_SCHEMA = 'juris-sh-r2-envelope/1' as const;
export const ENVELOPE_SUFFIX = '.envelope.json';

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function extensionFor(contentType: string): string {
  if (/pdf/iu.test(contentType)) return 'pdf';
  if (/html/iu.test(contentType)) return 'html';
  if (/json/iu.test(contentType)) return 'json';
  if (/xml/iu.test(contentType)) return 'xml';
  return 'bin';
}

/** `nsh/juris-sh/2023-12-01/<bereich>/<identität>/<rolle>-<sha256>.<endung>` – inhaltsadressiert, unveränderlich. */
export function r2ObjectKey(input: { sourceArea: SourceArea; sourceIdentity: string; role: string; sha256: string; contentType: string }): string {
  if (!/^[0-9a-f]{64}$/u.test(input.sha256)) throw new ArchiveError('guard', `Objektschlüssel ohne gültigen SHA-256 (${input.sourceIdentity})`);
  return `${KEY_PREFIX}${input.sourceArea}/${identityFileName(input.sourceIdentity)}/${input.role}-${input.sha256}.${extensionFor(input.contentType)}`;
}

export function envelopeKey(objectKey: string): string {
  return `${objectKey}${ENVELOPE_SUFFIX}`;
}

export function isArchiveKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && !key.includes('..') && !key.includes('//');
}

/** Transportwächter: nur der Quellen-Bucket, nur Schlüssel unter dem NSH-Präfix. */
export function guardTransport(inner: R2Transport, bucket: string = R2_SOURCES_BUCKET): R2Transport {
  if (inner.bucket !== bucket) throw new ArchiveError('guard', `Transport zeigt auf Bucket ${inner.bucket}, erwartet ${bucket}`);
  const check = (key: string): void => {
    if (!isArchiveKey(key)) throw new ArchiveError('guard', `Objektschlüssel ${key} liegt nicht unter ${KEY_PREFIX}`);
  };
  return {
    name: inner.name,
    bucket: inner.bucket,
    head: async (key) => {
      check(key);
      return inner.head(key);
    },
    get: async (key) => {
      check(key);
      return inner.get(key);
    },
    put: async (key, bytes, options) => {
      check(key);
      return inner.put(key, bytes, options);
    },
    ...(inner.list
      ? {
          list: async (prefix: string) => {
            if (!prefix.startsWith(KEY_PREFIX)) throw new ArchiveError('guard', `Listing ${prefix} liegt nicht unter ${KEY_PREFIX}`);
            return inner.list!(prefix);
          },
        }
      : {}),
  };
}

export interface ArchiveEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA;
  objectKey: string;
  bucket: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  role: string;
  url: string;
  finalUrl: string;
  retrievedAt: string;
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceState: typeof SOURCE_STATE;
  sourceArea: SourceArea;
  sourceIdentity: string;
  sourceTitle: string;
  targetJurisdiction: typeof TARGET_JURISDICTION;
  baselineDate: string;
}

export function envelopeFor(entry: Pick<ManifestEntry, 'sourceArea' | 'sourceIdentity' | 'sourceTitle'>, raw: Pick<ManifestRawDocument, 'sha256' | 'byteLength' | 'contentType' | 'role' | 'url' | 'finalUrl' | 'retrievedAt'>, objectKey: string, bucket: string = R2_SOURCES_BUCKET): ArchiveEnvelope {
  return {
    schemaVersion: ENVELOPE_SCHEMA,
    objectKey,
    bucket,
    sha256: raw.sha256,
    byteLength: raw.byteLength,
    contentType: raw.contentType,
    role: raw.role,
    url: raw.url,
    finalUrl: raw.finalUrl,
    retrievedAt: raw.retrievedAt,
    sourceSystem: SOURCE_SYSTEM,
    sourceState: SOURCE_STATE,
    sourceArea: entry.sourceArea,
    sourceIdentity: entry.sourceIdentity,
    sourceTitle: entry.sourceTitle,
    targetJurisdiction: TARGET_JURISDICTION,
    baselineDate: BASELINE_DATE,
  };
}

export function envelopeBytes(envelope: ArchiveEnvelope): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`);
}

/** Metadaten am R2-Objekt (nur ASCII-sichere Werte; Titel stehen im Umschlag). */
export function objectMetadata(envelope: ArchiveEnvelope): Record<string, string> {
  return { sha256: envelope.sha256, role: envelope.role, 'source-system': envelope.sourceSystem, 'source-identity': envelope.sourceIdentity, 'baseline-date': envelope.baselineDate };
}
