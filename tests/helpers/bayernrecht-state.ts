/**
 * Testhilfen für den Zustand des BAYERN.RECHT-Adapters: temporäre Roots (nie der echte Bestand) und ein
 * gültiger Manifesteintrag als Ausgangspunkt für Abwandlungen.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import { manifestEntryDefaults } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import type { ValidityEvidence } from '@landesrecht/importer-bayernrecht/common/evidence.ts';

const roots: string[] = [];

/** Temporäres Repository-Root; wird von `cleanupTempRoots()` wieder entfernt. */
export async function tempRoot(prefix = 'landesrecht-bayernrecht-'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

export async function cleanupTempRoots(): Promise<void> {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
}

export const SAMPLE_IDENTITY = 'jlr-TestgesetzBY2020rahmen';
/** Amtliche Gliederungsnummer der Bayerischen Rechtssammlung (Identitätshinweis im Manifest). */
export const SAMPLE_BAYRS_NUMBER = '2170-1-1-I';

/** Starker Beleg mit Datum und Quellenangabe – die Klasse `strong` verlangt beides. */
export function strongEvidence(dimension: ValidityEvidence['dimension'], date: string, statement: string, kind: ValidityEvidence['kind'] = 'portal-version-interval'): ValidityEvidence {
  return { kind, dimension, strength: 'strong', statement, date, sourceUrl: 'https://example.invalid/quelle' };
}

/** Gültiger, übernommener Manifesteintrag; einzelne Felder lassen sich für Schemaprüfungen abwandeln. */
export function sampleManifestEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    ...manifestEntryDefaults(),
    sourceArea: 'landesrecht',
    sourceIdentity: SAMPLE_IDENTITY,
    bayRsNumber: SAMPLE_BAYRS_NUMBER,
    sourceTitle: 'Testgesetz für den Freistaat Bayern',
    sourceType: 'gesetz',
    sourceUrl: 'https://example.invalid/portal/testgesetz',
    sourceVersion: { url: 'https://example.invalid/portal/testgesetz', validFrom: '2020-01-01', validTo: null },
    selectedVersionUrl: 'https://example.invalid/portal/testgesetz',
    sourceValidFrom: '2020-01-01',
    sourceValidTo: null,
    baselineStatus: 'active-at-baseline',
    baselineRecoveryMethod: 'portal-historical-version',
    sourceProvenance: { publicationAuthority: 'electronic-official', digitalRepresentation: 'born-digital' },
    validityEvidence: [strongEvidence('begin', '2020-01-01', 'Fassung gilt ab 2020-01-01'), strongEvidence('validity', '2023-12-01', 'Fassung am Stichtag unverändert in Kraft')],
    retrievedAt: '2026-09-17T10:00:00.000Z',
    sha256: 'a'.repeat(64),
    contentType: 'text/html',
    transformerVersion: 'bayernrecht-transformer/0.1.0',
    targetSlug: 'testg-baywue',
    importStatus: 'imported',
    ...overrides,
  };
}
