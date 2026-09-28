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
 * Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 6): G5 Provenienztrennung läuft im
 * Loader (`assertSimulationProvenance`); G6 Verkündungsbezüge werden hier geprüft – jede Sim-Fassung aus einer
 * Blattausgabe in genau einer Verkündung (Einzelakte in höchstens einer), jeder Verkündungseintrag auf eine vorhandene Fassung, jeder `publicationSlug` auf eine
 * vorhandene Verkündung, kein Verkündungs-Slug doppelt.
 *
 *   node scripts/validate-content.ts [--quiet]
 */
import { join } from 'node:path';

import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { JURISDICTION_IDS, JURISDICTIONS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { loadJurisdictionNorms, loadJurisdictionPublications } from '@landesrecht/legal-core/lib/loader.ts';
import { isExternallyMaintained, isSimulationVersion } from '@landesrecht/legal-core/lib/provenance.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { isSyntheticFixtureNorm, type NormRecord, type Publication, type SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';

const quiet = process.argv.includes('--quiet');
const root = resolveRepositoryRoot();
const problems: string[] = [];
/** Verkündungs-Slugs über alle Jurisdiktionen und Bestände (kein Slug doppelt). */
const publicationSlugs = new Map<string, string>();

async function validateDataset(dataset: 'production' | 'fixtures', contentRoot: string, label: string): Promise<Array<{ jurisdiction: JurisdictionId; norms: NormRecord[]; publications: Publication[] }>> {
  const all = new Map<string, NormRecord>();
  const perJurisdiction: Array<{ jurisdiction: JurisdictionId; norms: NormRecord[]; publications: Publication[] }> = [];
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
      const previous = publicationSlugs.get(publication.slug);
      if (previous) problems.push(`${label}/publications/${jurisdiction}/${publication.slug}.json: Verkündungs-Slug ist doppelt (auch ${previous})`);
      else publicationSlugs.set(publication.slug, `${label}/publications/${jurisdiction}/${publication.slug}.json`);
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
    // G6: jede Sim-Fassung in genau einer Verkündung; jeder publicationSlug auf eine vorhandene Verkündung.
    if (!isExternallyMaintained(jurisdiction)) {
      const bySlug = new Set(publications.map((publication) => publication.slug));
      const checkReferences = (references: readonly SourceReference[] | undefined, context: string): void => {
        (references ?? []).forEach((reference, index) => {
          if (reference.publicationSlug && !bySlug.has(reference.publicationSlug)) {
            problems.push(`${context}.sourceReferences[${index}].publicationSlug: Verkündung ${reference.publicationSlug} fehlt unter ${label}/publications/${jurisdiction}/`);
          }
        });
      };
      for (const norm of norms) {
        const context = `${label}/norms/${jurisdiction}/${norm.meta.slug}`;
        checkReferences(norm.meta.sourceReferences, `${context}/meta.json`);
        for (const version of norm.versions) {
          checkReferences(version.sourceReferences, `${context}/versions/${version.versionId}.json`);
          if (!isSimulationVersion(version)) continue;
          const listedIn = publications.filter((publication) => publication.entries.some((entry) => entry.normSlug === norm.meta.slug && entry.versionId === version.versionId)).map((publication) => publication.slug);
          // Eine Fassung aus einer Blattausgabe steht in genau einer Verkündung. Ein eigenständig verkündeter Akt
          // (`simulation-standalone-act`, ggf. mit Verkündungsmitteilung) muss in keinem Blatt stehen – kein Sim-Akt wird
          // gezwungen, in einem GVBl. zu erscheinen; mehrfach gelistet ist er aber nie.
          // Konsolidierte Folgefassungen (`simulation-amendment-source`) sind über ihren Änderungsakt in der Verkündung
          // nachgewiesen; sie selbst dürfen, müssen aber nicht als Eintrag stehen.
          const fromGazette = (version.sourceReferences ?? []).some((reference) => reference.kind === 'simulation-gazette');
          if (fromGazette ? listedIn.length !== 1 : listedIn.length > 1) {
            problems.push(`${context}/versions/${version.versionId}.json: Sim-Fassung ${fromGazette ? 'muss in genau einer Verkündung stehen' : 'darf höchstens in einer Verkündung stehen'} (gefunden: ${listedIn.length === 0 ? 'keine' : listedIn.join(', ')})`);
          }
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
      console.log(`${label.padEnd(12)} ${JURISDICTIONS[jurisdiction].shortName.padEnd(6)} ${String(norms.length).padStart(5)} Normen ${String(versions).padStart(5)} Fassungen ${String(publications.length).padStart(3)} Verkündungen`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} Problem(e):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Content gültig (Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}, Stichtag ${EDITORIAL_REFERENCE_DATE}; Produktionsbestand ohne synthetische Fixtures).`);
