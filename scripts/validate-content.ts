#!/usr/bin/env node
/**
 * Content-Validierung: lädt alle Normen und Verkündungen über die kanonischen Parser,
 * prüft Baseline-Regel, Zeitmodell, Beziehungen und Verkündungsbezüge – für den Produktionsbestand
 * (`content/`) und getrennt für den synthetischen Testbestand (`tests/fixtures/content/`).
 *
 * Produktionsbestand: keine synthetischen Testfixtures (`dataset: synthetic-fixture`, Präfix `testfixture-`);
 * jede aus RECHT.NRW übernommene Norm braucht einen übernommenen Manifesteintrag mit demselben Slug.
 * Testbestand: jede Norm ist als `synthetic-fixture` gekennzeichnet.
 *
 *   node scripts/validate-content.ts [--quiet]
 */
import { join } from 'node:path';

import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { JURISDICTION_IDS, JURISDICTIONS, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { loadJurisdictionNorms, loadJurisdictionPublications } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { isSyntheticFixtureNorm, type NormRecord, type Publication } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';

const quiet = process.argv.includes('--quiet');
const root = resolveRepositoryRoot();
const problems: string[] = [];

async function validateDataset(dataset: 'production' | 'fixtures', contentRoot: string, label: string): Promise<Array<{ jurisdiction: string; norms: NormRecord[]; publications: Publication[] }>> {
  const all = new Map<string, NormRecord>();
  const perJurisdiction: Array<{ jurisdiction: string; norms: NormRecord[]; publications: Publication[] }> = [];
  for (const jurisdiction of JURISDICTION_IDS) {
    try {
      const norms = await loadJurisdictionNorms(jurisdiction, contentRoot);
      const publications = await loadJurisdictionPublications(jurisdiction, contentRoot);
      perJurisdiction.push({ jurisdiction, norms, publications });
      for (const norm of norms) all.set(`${jurisdiction}:${norm.meta.slug}`, norm);
    } catch (error) {
      problems.push(`${label}: ${String((error as Error).message)}`);
    }
  }
  for (const { jurisdiction, norms, publications } of perJurisdiction) {
    for (const norm of norms) {
      const context = `${label}/norms/${jurisdiction}/${norm.meta.slug}`;
      if (norm.meta.id !== `${jurisdiction}:${norm.meta.slug}`) problems.push(`${context}/meta.json.id: muss „${jurisdiction}:${norm.meta.slug}“ sein`);
      if (dataset === 'production' && isSyntheticFixtureNorm(norm.meta)) problems.push(`${context}: synthetische Testfixture im Produktionsbestand (gehört nach tests/fixtures/content/)`);
      if (dataset === 'fixtures' && norm.meta.dataset !== 'synthetic-fixture') problems.push(`${context}: Testbestand ohne Kennzeichen dataset: synthetic-fixture`);
      for (const relation of norm.meta.relations) {
        const target = `${relation.target.jurisdiction ?? jurisdiction}:${relation.target.slug}`;
        if (!all.has(target) && !quiet) console.warn(`Hinweis: ${context} verweist auf ${target}, der noch nicht im Bestand ist (${relation.type}).`);
      }
      const applicable = getApplicableVersion(norm, EDITORIAL_REFERENCE_DATE);
      if (norm.meta.status === 'in-force' && applicable.simulationValidFrom > EDITORIAL_REFERENCE_DATE) {
        problems.push(`${context}: Status in-force, aber keine am Stichtag ${EDITORIAL_REFERENCE_DATE} geltende Fassung`);
      }
      for (const version of norm.versions) {
        if (version.sourceValidFrom && version.simulationValidFrom < SIMULATION_BASELINE_DATE) {
          problems.push(`${context}/versions/${version.versionId}.json: Simulationsgeltung vor dem Ausgangsrechtsstand`);
        }
      }
    }
    for (const publication of publications) {
      for (const entry of publication.entries) {
        const norm = all.get(`${jurisdiction}:${entry.normSlug}`);
        if (!norm) {
          problems.push(`${label}/publications/${jurisdiction}/${publication.slug}.json: Norm ${entry.normSlug} fehlt im Bestand`);
          continue;
        }
        if (entry.versionId && !norm.versions.some((version) => version.versionId === entry.versionId)) {
          problems.push(`${label}/publications/${jurisdiction}/${publication.slug}.json: Fassung ${entry.versionId} von ${entry.normSlug} fehlt`);
        }
      }
    }
  }
  return perJurisdiction;
}

const production = await validateDataset('production', root, 'content');
const manifest = await readManifest(root);
const importedBySlug = new Map(manifest.entries.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').map((entry) => [entry.targetSlug, entry]));
for (const norm of production.find((entry) => entry.jurisdiction === 'west')?.norms ?? []) {
  const identity = norm.meta.externalIdentifiers.find((identifier) => identifier.system === 'recht-nrw')?.value;
  if (!identity) continue;
  const entry = importedBySlug.get(norm.meta.slug);
  if (!entry) problems.push(`content/norms/west/${norm.meta.slug}: RECHT.NRW-Norm ohne übernommenen Manifesteintrag (importierte Normen entstehen nur über den Importer)`);
  else if (entry.sourceIdentity !== identity) problems.push(`content/norms/west/${norm.meta.slug}: Quellkennung ${identity} ≠ Manifest ${entry.sourceIdentity}`);
}
const fixtures = await validateDataset('fixtures', join(root, 'tests', 'fixtures'), 'tests/fixtures/content');

if (!quiet) {
  for (const [label, dataset] of [['Produktion', production], ['Testbestand', fixtures]] as const) {
    for (const { jurisdiction, norms, publications } of dataset) {
      const versions = norms.reduce((sum, norm) => sum + norm.versions.length, 0);
      console.log(`${label.padEnd(12)} ${JURISDICTIONS[jurisdiction as keyof typeof JURISDICTIONS].shortName.padEnd(6)} ${String(norms.length).padStart(5)} Normen ${String(versions).padStart(5)} Fassungen ${String(publications.length).padStart(3)} Verkündungen`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} Problem(e):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Content gültig (Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}, Stichtag ${EDITORIAL_REFERENCE_DATE}; Produktionsbestand ohne synthetische Fixtures).`);
