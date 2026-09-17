/**
 * SourceReference-Integrität des West-Bestands (offline): Fundstelle der Quelle, Quellenreferenzen
 * (r2-archived: bucket, objectKey, sha256, url, retrievedAt; versioned: Datei und Hash), Abgleich
 * mit dem Importmanifest (Hash je Archivobjekt, Rekonstruktions- und Geltungsstatus), Quellenlage der
 * Fassung. Fehlende Provenienz ist ein Auditfehler. Wird vom Skript `audit-provenance.ts` und vom Test
 * `tests/unit/content-provenance.test.ts` gemeinsam verwendet.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import type { NormRecord, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { currentVersion } from './corpus-stats.ts';

export const R2_BUCKET = 'landesrecht-quellen';
const R2_KEY_PATTERN = /^west\/recht-nrw\/2023-12-01\/term-(\d+)\/([a-f0-9]{16})-([a-z-]+)\.(html|pdf|json|xml|docx)$/u;

export interface ProvenanceIssue {
  slug: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ProvenanceSummary {
  norms: number;
  normsWithErrors: number;
  normsWithWarnings: number;
  errors: number;
  warnings: number;
  byAvailability: Record<string, number>;
  byKind: Record<string, number>;
  byArchiveStatus: Record<string, number>;
  bySourceValidity: Record<string, number>;
  bySourceText: Record<string, number>;
  byImportStatus: Record<string, number>;
  versionedNorms: string[];
  r2Norms: number;
  verifiedHashes: number;
  issueCodes: Record<string, number>;
}

export interface ProvenanceAuditResult {
  summary: ProvenanceSummary;
  issues: ProvenanceIssue[];
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function termIdOf(record: NormRecord): string | undefined {
  const identifier = record.meta.externalIdentifiers.find((entry) => entry.system === 'recht-nrw');
  return identifier?.value.match(/^term:(\d+)$/u)?.[1];
}

async function sha256OfFile(path: string): Promise<string | undefined> {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  } catch {
    return undefined;
  }
}

export async function auditProvenance(norms: readonly NormRecord[], root: string): Promise<ProvenanceAuditResult> {
  const manifest = await readManifest(root);
  const entriesBySlug = new Map<string, ManifestEntry>();
  const entriesByIdentity = new Map<string, ManifestEntry>();
  for (const entry of manifest.entries) {
    entriesByIdentity.set(entry.sourceIdentity, entry);
    if (entry.importStatus.startsWith('imported')) entriesBySlug.set(entry.targetSlug, entry);
  }

  const issues: ProvenanceIssue[] = [];
  const summary: ProvenanceSummary = {
    norms: norms.length,
    normsWithErrors: 0,
    normsWithWarnings: 0,
    errors: 0,
    warnings: 0,
    byAvailability: {},
    byKind: {},
    byArchiveStatus: {},
    bySourceValidity: {},
    bySourceText: {},
    byImportStatus: {},
    versionedNorms: [],
    r2Norms: 0,
    verifiedHashes: 0,
    issueCodes: {},
  };

  for (const record of norms) {
    const slug = record.meta.slug;
    const before = issues.length;
    const report = (severity: ProvenanceIssue['severity'], code: string, message: string): void => { issues.push({ slug, severity, code, message }); };
    const termId = termIdOf(record);
    if (!termId) report('error', 'external-identifier-missing', 'kein externer Identifikator recht-nrw term:<id>');
    const entry = entriesBySlug.get(slug);
    if (!entry) report('error', 'manifest-entry-missing', 'kein übernommener Manifesteintrag mit diesem Slug');
    else {
      increment(summary.byImportStatus, entry.importStatus);
      if (termId && entry.sourceIdentity !== `term:${termId}`) report('error', 'manifest-identity-mismatch', `Manifest ${entry.sourceIdentity}, Norm term:${termId}`);
    }
    if (!record.meta.sourceCitation?.trim()) report('error', 'source-citation-missing', 'meta.sourceCitation fehlt');

    const version = currentVersion(record);
    const references: Array<{ reference: SourceReference; origin: string }> = [
      ...record.meta.sourceReferences.map((reference) => ({ reference, origin: 'meta' })),
      ...(version.sourceReferences ?? []).map((reference) => ({ reference, origin: `version:${version.versionId}` })),
    ];
    if (record.meta.sourceReferences.length === 0) report('error', 'source-references-missing', 'meta.sourceReferences ist leer');
    const snapshots = record.meta.sourceReferences.filter((reference) => reference.kind === 'official-portal-snapshot' && reference.availability !== 'external');
    if (snapshots.length === 0) report('error', 'official-snapshot-missing', 'keine archivierte amtliche Portalfassung (official-portal-snapshot, r2-archived oder versioned)');

    let usesVersioned = false;
    let usesR2 = false;
    const rawByKey = new Map((entry?.rawDocuments ?? []).filter((raw) => raw.objectKey).map((raw) => [raw.objectKey!, raw]));
    const rawByLocal = new Map((entry?.rawDocuments ?? []).filter((raw) => raw.localSource).map((raw) => [raw.localSource!, raw]));
    const rawBySha = new Map((entry?.rawDocuments ?? []).map((raw) => [raw.sha256, raw]));

    for (const { reference, origin } of references) {
      increment(summary.byAvailability, reference.availability);
      increment(summary.byKind, reference.kind);
      const where = `${origin} ${reference.kind} „${reference.label}“`;
      if (reference.system !== 'recht-nrw') report('warning', 'source-system-unexpected', `${where}: system ${reference.system ?? '–'}`);
      if (reference.availability === 'r2-archived') {
        usesR2 = true;
        if (reference.bucket !== R2_BUCKET) report('error', 'r2-bucket-unexpected', `${where}: bucket ${reference.bucket ?? '–'}`);
        const match = reference.objectKey?.match(R2_KEY_PATTERN);
        if (!match) report('error', 'r2-object-key-pattern', `${where}: objectKey ${reference.objectKey ?? '–'}`);
        else {
          if (termId && match[1] !== termId) report('error', 'r2-object-key-term-mismatch', `${where}: objectKey nennt term-${match[1]}, Norm term:${termId}`);
          if (reference.sha256 && !reference.sha256.startsWith(match[2]!)) report('error', 'r2-object-key-hash-prefix', `${where}: objectKey-Präfix ${match[2]} ≠ sha256`);
        }
        if (!reference.sha256) report('error', 'sha256-missing', `${where}: sha256 fehlt`);
        if (!reference.url?.startsWith('https://recht.nrw.de/')) report('error', 'source-url-unexpected', `${where}: url ${reference.url ?? '–'}`);
        if (!reference.retrievedAt) report('error', 'retrieved-at-missing', `${where}: retrievedAt fehlt`);
        if (entry) {
          const raw = reference.objectKey ? rawByKey.get(reference.objectKey) : undefined;
          if (!raw) report('error', 'manifest-raw-document-missing', `${where}: Archivobjekt nicht im Manifest (rawDocuments)`);
          else {
            if (raw.sha256 !== reference.sha256) report('error', 'manifest-hash-mismatch', `${where}: Manifest-Hash ${raw.sha256.slice(0, 16)}… ≠ Norm ${reference.sha256?.slice(0, 16) ?? '–'}…`);
            else summary.verifiedHashes += 1;
            increment(summary.byArchiveStatus, raw.archiveStatus ?? 'unknown');
            if (raw.archiveStatus !== 'verified' && raw.archiveStatus !== 'uploaded') report('warning', 'archive-status-not-verified', `${where}: archiveStatus ${raw.archiveStatus ?? '–'}`);
            if (raw.bucket !== R2_BUCKET) report('error', 'manifest-bucket-unexpected', `${where}: Manifest-Bucket ${raw.bucket ?? '–'}`);
          }
        }
      } else if (reference.availability === 'versioned') {
        usesVersioned = true;
        if (!reference.localSource?.startsWith('sources/recht-nrw/')) report('error', 'local-source-path', `${where}: localSource ${reference.localSource ?? '–'}`);
        else {
          const digest = await sha256OfFile(join(root, reference.localSource));
          if (!digest) report('error', 'local-source-missing', `${where}: Datei ${reference.localSource} fehlt`);
          else if (digest !== reference.sha256) report('error', 'local-source-hash-mismatch', `${where}: Datei-Hash ≠ sha256`);
          else summary.verifiedHashes += 1;
          if (entry) {
            const raw = rawByLocal.get(reference.localSource) ?? (reference.sha256 ? rawBySha.get(reference.sha256) : undefined);
            if (!raw) report('warning', 'manifest-raw-document-missing', `${where}: versionierte Quelle nicht im Manifest (rawDocuments)`);
            else {
              if (raw.sha256 !== reference.sha256) report('error', 'manifest-hash-mismatch', `${where}: Manifest-Hash ≠ Norm`);
              increment(summary.byArchiveStatus, raw.archiveStatus ?? 'versioned');
            }
          }
        }
        if (!reference.sha256) report('error', 'sha256-missing', `${where}: sha256 fehlt`);
        if (!reference.url?.startsWith('https://recht.nrw.de/')) report('error', 'source-url-unexpected', `${where}: url ${reference.url ?? '–'}`);
        if (!reference.retrievedAt) report('error', 'retrieved-at-missing', `${where}: retrievedAt fehlt`);
      } else if (!reference.url?.startsWith('https://recht.nrw.de/')) {
        report('warning', 'external-url-unexpected', `${where}: url ${reference.url ?? '–'}`);
      }
      if (reference.kind === 'official-portal-snapshot' && reference.availability !== 'external' && !reference.sourceValidFrom) {
        report('warning', 'source-valid-from-missing-on-reference', `${where}: sourceValidFrom fehlt an der Portalfassung`);
      }
    }
    if (usesVersioned) summary.versionedNorms.push(slug);
    if (usesR2) summary.r2Norms += 1;
    if (usesVersioned && usesR2) report('warning', 'mixed-archive-modes', 'versionierte und R2-archivierte Quellen gemischt');
    if (entry?.archive?.mode === 'r2' && usesVersioned) report('error', 'bulk-norm-with-versioned-source', 'Bulk-Norm (Archiv R2) verweist auf sources/');

    const status = version.sourceStatus;
    if (!status) report('error', 'source-status-missing', `Fassung ${version.versionId}: sourceStatus fehlt`);
    else {
      increment(summary.bySourceValidity, status.validity);
      increment(summary.bySourceText, status.text);
      if (entry) {
        const expectedText = entry.reconstructionStatus === 'reconstructed' ? 'reconstructed' : 'direct';
        if (status.text !== expectedText) report('error', 'source-text-status-mismatch', `Fassung ${version.versionId}: text ${status.text}, Manifest ${entry.reconstructionStatus}`);
        if (entry.validityProvenance && entry.validityProvenance !== 'undetermined' && entry.validityProvenance !== status.validity) {
          report('error', 'source-validity-status-mismatch', `Fassung ${version.versionId}: validity ${status.validity}, Manifest ${entry.validityProvenance}`);
        }
        if (status.text === 'reconstructed' && !status.note) report('warning', 'reconstruction-note-missing', `Fassung ${version.versionId}: rekonstruiert ohne öffentlichen Hinweis`);
      }
    }
    if (entry?.sourceValidFrom) {
      if (!version.sourceValidFrom) report('error', 'source-valid-from-missing', `Fassung ${version.versionId}: sourceValidFrom fehlt (Manifest ${entry.sourceValidFrom})`);
      else if (version.sourceValidFrom !== entry.sourceValidFrom) report('error', 'source-valid-from-mismatch', `Fassung ${version.versionId}: ${version.sourceValidFrom} ≠ Manifest ${entry.sourceValidFrom}`);
    }
    if (entry?.sourceValidTo && version.sourceValidTo !== entry.sourceValidTo) report('warning', 'source-valid-to-mismatch', `Fassung ${version.versionId}: ${version.sourceValidTo ?? '–'} ≠ Manifest ${entry.sourceValidTo}`);
    if (!version.sourceCitation && !record.meta.sourceCitation) report('error', 'version-source-citation-missing', `Fassung ${version.versionId}: weder Fassung noch Norm nennen die Quellfundstelle`);

    const added = issues.slice(before);
    if (added.some((issue) => issue.severity === 'error')) summary.normsWithErrors += 1;
    if (added.some((issue) => issue.severity === 'warning')) summary.normsWithWarnings += 1;
  }

  summary.errors = issues.filter((issue) => issue.severity === 'error').length;
  summary.warnings = issues.length - summary.errors;
  for (const issue of issues) increment(summary.issueCodes, issue.code);
  summary.versionedNorms.sort();
  issues.sort((left, right) => left.slug.localeCompare(right.slug) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  return { summary, issues };
}
