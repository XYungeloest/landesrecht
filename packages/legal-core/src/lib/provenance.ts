/**
 * Provenienztrennung der Simulationsrechtsfortschreibung (Schema S3, Gate G5).
 *
 * Zwei Provenienzen, streng getrennt (docs/SIM_LAW_PROGRESSION.md, Abschnitt 3.2):
 *   - reale Quelle: nur die Baseline-Fassung (Beginn am Ausgangsrechtsstand) trägt `sourceValidFrom`/
 *     `sourceValidTo`, `sourceStatus`, `sourceCitation` und reale Belege (`official-portal-snapshot`, …);
 *   - Simulation: jede Fassung, die durch einen Rechtsakt der Simulation entsteht (Beginn nach dem
 *     Ausgangsrechtsstand), trägt ausschließlich Sim-Belege (`SIMULATION_SOURCE_KINDS`) und keine reale
 *     Quellgültigkeit; eine eigene Sim-Norm (ohne Baseline-Fassung) trägt keine reale Portalkennung.
 *
 * Jurisdiktionen mit externem Source of Truth (Ost/OstRecht) werden hier nicht redaktionell gepflegt und
 * sind von der Regel ausgenommen (ihre Provenienz bildet der Adapter ab).
 */
import { JURISDICTIONS, SIMULATION_BASELINE_DATE, type JurisdictionId } from '../config/jurisdictions.ts';
import { ContentValidationError, isSimulationSourceKind, SIMULATION_IDENTIFIER_SYSTEMS, type NormRecord, type NormVersion, type SourceReference } from './schema.ts';

/** Fassung, die durch einen Rechtsakt der Simulation entstanden ist (Beginn nach dem Ausgangsrechtsstand). */
export function isSimulationVersion(version: Pick<NormVersion, 'simulationValidFrom'>): boolean {
  return version.simulationValidFrom > SIMULATION_BASELINE_DATE;
}

/** Ausgangsfassung des Simulationsbestands (Beginn am Ausgangsrechtsstand). */
export function isBaselineVersion(version: Pick<NormVersion, 'simulationValidFrom'>): boolean {
  return version.simulationValidFrom === SIMULATION_BASELINE_DATE;
}

/** Eigene Norm der Simulation: keine Baseline-Fassung, erste Fassung nach dem Ausgangsrechtsstand. */
export function isSimulationNorm(record: Pick<NormRecord, 'versions'>): boolean {
  return record.versions.length > 0 && record.versions.every((version) => isSimulationVersion(version));
}

/** Jurisdiktion, deren Bestand ein vorgelagertes Quellsystem führt (Ost → OstRecht); die Provenienzregel gilt dort nicht. */
export function isExternallyMaintained(jurisdiction: JurisdictionId): boolean {
  return JURISDICTIONS[jurisdiction].upstreamSourceOfTruth !== undefined;
}

export function isSimulationSourceReference(reference: Pick<SourceReference, 'kind'>): boolean {
  return isSimulationSourceKind(reference.kind);
}

/** Alle Verstöße gegen die Provenienztrennung (leer = regelkonform). */
export function collectSimulationProvenanceProblems(record: NormRecord, context = `${record.meta.jurisdiction}/${record.meta.slug}`): string[] {
  const problems: string[] = [];
  if (isExternallyMaintained(record.meta.jurisdiction)) return problems;

  for (const version of record.versions) {
    const path = `${context}/versions/${version.versionId}.json`;
    const references = version.sourceReferences ?? [];
    if (isSimulationVersion(version)) {
      // Übernommener späterer Quellstand (adoptedSources): nur mit Sim-Adoptionsbeleg darf eine Sim-Fassung die reale
      // Momentaufnahme und deren Quellgeltung tragen; die reale Rechtsentwicklung wird nie von selbst Sim-Recht.
      const adopted = references.some((reference) => isSimulationSourceReference(reference) && reference.sourceRole === 'adoption-evidence');
      for (const field of ['sourceValidFrom', 'sourceValidTo', 'sourceStatus', 'sourceCitation'] as const) {
        if (version[field] !== undefined && !(adopted && (field === 'sourceValidFrom' || field === 'sourceValidTo' || field === 'sourceCitation'))) problems.push(`${path}.${field}: eine Sim-Fassung (Beginn nach ${SIMULATION_BASELINE_DATE}) trägt keine reale Quellprovenienz`);
      }
      if (references.length === 0) problems.push(`${path}.sourceReferences: eine Sim-Fassung braucht mindestens einen Sim-Beleg`);
      references.forEach((reference, index) => {
        if (!isSimulationSourceReference(reference) && !(adopted && reference.kind === 'official-portal-snapshot')) problems.push(`${path}.sourceReferences[${index}]: „${reference.kind}“ ist kein Sim-Beleg; eine Sim-Fassung trägt ausschließlich Sim-Belege (Ausnahme: übernommener Quellstand mit Adoptionsbeleg)`);
      });
    } else {
      references.forEach((reference, index) => {
        if (isSimulationSourceReference(reference)) problems.push(`${path}.sourceReferences[${index}]: die Baseline-Fassung trägt keinen Sim-Beleg („${reference.kind}“)`);
      });
    }
  }

  if (isSimulationNorm(record)) {
    const path = `${context}/meta.json`;
    // Eine eigene Sim-Norm, deren Erstfassung einen übernommenen Quellstand mit Adoptionsbeleg trägt, führt die reale
    // Provenienz dieser Übernahme (Ursprungsorgan, Momentaufnahme) auch in meta.json.
    const adoptedNorm = record.versions.some((version) => (version.sourceReferences ?? []).some((reference) => isSimulationSourceReference(reference) && reference.sourceRole === 'adoption-evidence'));
    record.meta.externalIdentifiers.forEach((identifier, index) => {
      if (!(SIMULATION_IDENTIFIER_SYSTEMS as readonly string[]).includes(identifier.system)) problems.push(`${path}.externalIdentifiers[${index}]: eine eigene Sim-Norm trägt keine Kennung eines realen Portals („${identifier.system}“)`);
    });
    if (record.meta.sourceCitation !== undefined) problems.push(`${path}.sourceCitation: eine eigene Sim-Norm hat keine reale Quellfundstelle`);
    if (record.meta.originEnactingBody !== undefined && !adoptedNorm) problems.push(`${path}.originEnactingBody: eine eigene Sim-Norm hat kein Ursprungsorgan einer übernommenen Quelle`);
    record.meta.sourceReferences.forEach((reference, index) => {
      if (!isSimulationSourceReference(reference) && !(adoptedNorm && reference.kind === 'official-portal-snapshot')) problems.push(`${path}.sourceReferences[${index}]: „${reference.kind}“ ist kein Sim-Beleg; eine eigene Sim-Norm trägt ausschließlich Sim-Belege`);
    });
  }
  return problems;
}

/** Wirft beim ersten Verstoß gegen die Provenienztrennung (fail closed). */
export function assertSimulationProvenance(record: NormRecord, context = `${record.meta.jurisdiction}/${record.meta.slug}`): void {
  const problems = collectSimulationProvenanceProblems(record, context);
  if (problems.length > 0) throw new ContentValidationError(problems.join('; '));
}
