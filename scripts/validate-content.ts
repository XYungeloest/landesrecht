#!/usr/bin/env node
/**
 * Content-Validierung: lädt alle Normen und Verkündungen über die kanonischen Parser,
 * prüft Baseline-Regel, Zeitmodell, Beziehungen und Verkündungsbezüge.
 *
 *   node scripts/validate-content.ts [--quiet]
 */
import { JURISDICTION_IDS, JURISDICTIONS, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { loadJurisdictionNorms, loadJurisdictionPublications } from '@landesrecht/legal-core/lib/loader.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import type { NormRecord, Publication } from '@landesrecht/legal-core/lib/schema.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';

const quiet = process.argv.includes('--quiet');
const root = resolveRepositoryRoot();
const problems: string[] = [];
const all = new Map<string, NormRecord>();
const perJurisdiction: Array<{ jurisdiction: string; norms: NormRecord[]; publications: Publication[] }> = [];

for (const jurisdiction of JURISDICTION_IDS) {
  try {
    const norms = await loadJurisdictionNorms(jurisdiction, root);
    const publications = await loadJurisdictionPublications(jurisdiction, root);
    perJurisdiction.push({ jurisdiction, norms, publications });
    for (const norm of norms) all.set(`${jurisdiction}:${norm.meta.slug}`, norm);
  } catch (error) {
    problems.push(String((error as Error).message));
  }
}

for (const { jurisdiction, norms, publications } of perJurisdiction) {
  for (const norm of norms) {
    const context = `content/norms/${jurisdiction}/${norm.meta.slug}`;
    if (norm.meta.id !== `${jurisdiction}:${norm.meta.slug}`) problems.push(`${context}/meta.json.id: muss „${jurisdiction}:${norm.meta.slug}“ sein`);
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
        problems.push(`content/publications/${jurisdiction}/${publication.slug}.json: Norm ${entry.normSlug} fehlt im Bestand`);
        continue;
      }
      if (entry.versionId && !norm.versions.some((version) => version.versionId === entry.versionId)) {
        problems.push(`content/publications/${jurisdiction}/${publication.slug}.json: Fassung ${entry.versionId} von ${entry.normSlug} fehlt`);
      }
    }
  }
}

if (!quiet) {
  for (const { jurisdiction, norms, publications } of perJurisdiction) {
    const versions = norms.reduce((sum, norm) => sum + norm.versions.length, 0);
    console.log(`${JURISDICTIONS[jurisdiction as keyof typeof JURISDICTIONS].shortName.padEnd(6)} ${String(norms.length).padStart(4)} Normen ${String(versions).padStart(4)} Fassungen ${String(publications.length).padStart(3)} Verkündungen`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} Problem(e):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Content gültig (Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}, Stichtag ${EDITORIAL_REFERENCE_DATE}).`);
