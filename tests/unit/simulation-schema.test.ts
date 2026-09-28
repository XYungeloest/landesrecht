/**
 * Schemaänderungen der Simulationsrechtsfortschreibung: S1 abgeleitetes Fassungsende, S2 Sim-Belegarten und
 * `publicationSlug`, S3 Provenienztrennung (Gate G5), S6 erweiterte Verkündungen – dazu die umgestellte
 * West-Fixture (`simulationValidTo: null` in der Baseline, `simulation-gazette` in der Folgefassung).
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { loadJurisdictionPublications, loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { assertSimulationProvenance, collectSimulationProvenanceProblems, isSimulationNorm, isSimulationVersion } from '@landesrecht/legal-core/lib/provenance.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { ContentValidationError, deriveVersionIntervals, isSimulationSourceKind, parsePublication, parseSourceReference, SIMULATION_SOURCE_KINDS, SOURCE_KINDS } from '@landesrecht/legal-core/lib/schema.ts';
import { classifyNormVersion, getApplicableVersion, resolveVersionAt } from '@landesrecht/legal-core/lib/versions.ts';

import { buildFixtureNorms, norm, paragraph } from '../helpers/fixture-corpus.ts';

const fixtureRoot = join(resolveRepositoryRoot(), 'tests', 'fixtures');
const SHA = 'b'.repeat(64);
const simGazette = { kind: 'simulation-gazette', system: 'simulation', label: 'GV. West 2026 Nr. 2', availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: `west/simulation/${SHA}.pdf`, sha256: SHA, mediaType: 'application/pdf', publicationSlug: 'gv-west-2026-2-20260517' };
const realSnapshot = { kind: 'official-portal-snapshot', system: 'recht-nrw', label: 'RECHT.NRW', availability: 'external', url: 'https://recht.nrw.de/x', sourceValidFrom: '2023-08-01' };

describe('S1 abgeleitetes Fassungsende', () => {
  it('leitet das Ende einer Nicht-letzten-Fassung aus der Folgefassung ab und lässt die Baseline-Datei bei null', () => {
    const record = norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: null, body: [] },
      { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', simulationValidTo: null, body: [] },
    ] });
    expect(record.versions.map((version) => version.simulationValidTo)).toEqual(['2026-05-17', null]);
    expect(resolveVersionAt(record, '2026-05-17')?.versionId).toBe('2023-12-01');
    expect(resolveVersionAt(record, '2026-05-18')?.versionId).toBe('2026-05-18');
    expect(classifyNormVersion(record, record.versions[0]!, '2026-09-01')).toBe('historical');
  });

  it('akzeptiert einen gespeicherten Wert nur, wenn er dem abgeleiteten entspricht', () => {
    const explicit = norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-05-17', body: [] },
      { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', body: [] },
    ] });
    expect(explicit.versions[0]!.simulationValidTo).toBe('2026-05-17');
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-05-10', body: [] },
      { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', body: [] },
    ] })).toThrow(/Gültigkeitslücke/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-05-18', body: [] },
      { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', body: [] },
    ] })).toThrow(/überlappen/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: 'a', simulationValidFrom: '2023-12-01', body: [] },
      { versionId: 'b', simulationValidFrom: '2023-12-01', body: [] },
    ] })).toThrow(/überlappen/u);
  });

  it('beendet die letzte Fassung am Außerkrafttreten meta.expiryDate, sonst bleibt sie offen', () => {
    const repealed = norm({ jurisdiction: 'west', slug: 'x', meta: { status: 'repealed', expiryDate: '2026-12-31' }, versions: [
      { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [] },
      { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', body: [] },
    ] });
    expect(repealed.versions.map((version) => version.simulationValidTo)).toEqual(['2026-05-17', '2026-12-31']);
    expect(resolveVersionAt(repealed, '2027-01-01')).toBeUndefined();
    expect(classifyNormVersion(repealed, repealed.versions[1]!, '2027-01-15')).toBe('historical');
    expect(getApplicableVersion(repealed, '2027-01-15').versionId).toBe('2026-05-18');
    expect(() => norm({ jurisdiction: 'west', slug: 'x', meta: { expiryDate: '2026-12-31' }, versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-12-30', body: [] }] })).toThrow(/entspricht nicht dem Außerkrafttreten/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: '2026-12-30', body: [] }] })).toThrow(/kein expiryDate/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', meta: { expiryDate: '2026-05-01' }, versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', body: [] }, { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', body: [] }] })).toThrow(/liegt vor dem Beginn der letzten Fassung/u);
    expect(deriveVersionIntervals([], {}, 'x')).toEqual([]);
  });

  it('die West-Fixture speichert null und wird abgeleitet geladen; die Projektion sieht den abgeleiteten Wert', async () => {
    const west = await loadNorm('west', 'testfixture-schulgesetz-west', fixtureRoot);
    expect(west.versions[0]!.simulationValidTo).toBe('2026-04-30');
    expect(west.versions[1]!.simulationValidTo).toBeNull();
    expect(getApplicableVersion(west, EDITORIAL_REFERENCE_DATE).versionId).toBe('2026-05-01');
    expect(west.versions[1]!.sourceReferences?.map((reference) => reference.kind)).toEqual(['simulation-gazette']);
    expect(west.versions[1]!.sourceReferences?.[0]?.publicationSlug).toBe('gv-west-2026-12');
  });
});

describe('S2 Sim-Belegarten', () => {
  it('kennt die vier Sim-Belegarten und verlangt system „simulation“ ohne reale Provenienz', () => {
    for (const kind of SIMULATION_SOURCE_KINDS) {
      expect(SOURCE_KINDS).toContain(kind);
      expect(isSimulationSourceKind(kind)).toBe(true);
    }
    expect(isSimulationSourceKind('amendment-source')).toBe(false);
    const parsed = parseSourceReference(simGazette, 's');
    expect(parsed.publicationSlug).toBe('gv-west-2026-2-20260517');
    expect(parsed.url).toBeUndefined();
    expect(() => parseSourceReference({ ...simGazette, system: 'recht-nrw' }, 's')).toThrow(/„simulation“/u);
    expect(() => parseSourceReference({ ...simGazette, system: undefined }, 's')).toThrow(/„simulation“/u);
    expect(() => parseSourceReference({ ...simGazette, externalId: 'term:1' }, 's')).toThrow(/keine Kennung eines realen Herkunftssystems/u);
    expect(() => parseSourceReference({ ...simGazette, sourceValidFrom: '2024-01-01' }, 's')).toThrow(/keine Quellgültigkeit/u);
    expect(() => parseSourceReference({ ...simGazette, publicationSlug: 'Kein Slug' }, 's')).toThrow(/publicationSlug/u);
    expect(() => parseSourceReference({ ...realSnapshot, system: 'simulation' }, 's')).toThrow(/Sim-Belegen vorbehalten/u);
    // Reale R2-Quellen brauchen weiterhin URL und Abrufdatum.
    expect(() => parseSourceReference({ ...simGazette, kind: 'official-gazette', system: 'recht-nrw' }, 's')).toThrow(/url/u);
  });
});

describe('S3 Provenienztrennung (G5)', () => {
  const baseline = { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', sourceValidFrom: '2023-08-01', sourceReferences: [realSnapshot], body: [paragraph('§ 1', 'Zweck', 'Alt.')] };
  const simVersion = { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', sourceReferences: [simGazette], body: [paragraph('§ 1', 'Zweck', 'Neu.')] };

  it('akzeptiert Baseline mit realen und Sim-Fassung mit Sim-Belegen', () => {
    const record = norm({ jurisdiction: 'west', slug: 'x', versions: [baseline, simVersion] });
    expect(collectSimulationProvenanceProblems(record)).toEqual([]);
    expect(isSimulationVersion(record.versions[1]!)).toBe(true);
    expect(isSimulationNorm(record)).toBe(false);
    expect(() => assertSimulationProvenance(record)).not.toThrow();
  });

  it('weist reale Provenienz an Sim-Fassungen, fehlende oder fremde Belege und Sim-Belege an der Baseline ab', () => {
    const noSources = norm({ jurisdiction: 'west', slug: 'x', versions: [baseline, { ...simVersion, sourceReferences: undefined }] });
    expect(collectSimulationProvenanceProblems(noSources)).toEqual([expect.stringMatching(/mindestens einen Sim-Beleg/u)]);
    const realOnSim = norm({ jurisdiction: 'west', slug: 'x', versions: [baseline, { ...simVersion, sourceValidFrom: '2026-01-01', sourceStatus: { validity: 'exact', text: 'direct' }, sourceCitation: 'GV. NRW.', sourceReferences: [realSnapshot] }] });
    const problems = collectSimulationProvenanceProblems(realOnSim);
    expect(problems.some((problem) => problem.includes('sourceValidFrom'))).toBe(true);
    expect(problems.some((problem) => problem.includes('sourceStatus'))).toBe(true);
    expect(problems.some((problem) => problem.includes('sourceCitation'))).toBe(true);
    expect(problems.some((problem) => problem.includes('official-portal-snapshot'))).toBe(true);
    const simOnBaseline = norm({ jurisdiction: 'west', slug: 'x', versions: [{ ...baseline, sourceReferences: [realSnapshot, simGazette] }, simVersion] });
    expect(collectSimulationProvenanceProblems(simOnBaseline)).toEqual([expect.stringMatching(/Baseline-Fassung trägt keinen Sim-Beleg/u)]);
    expect(() => assertSimulationProvenance(simOnBaseline)).toThrow(ContentValidationError);
  });

  it('eine eigene Sim-Norm trägt keine reale Portalkennung, Quellfundstelle oder reale Belege', () => {
    const clean = norm({ jurisdiction: 'west', slug: 'lsolg', meta: { sourceReferences: [simGazette] }, versions: [simVersion] });
    expect(isSimulationNorm(clean)).toBe(true);
    expect(collectSimulationProvenanceProblems(clean)).toEqual([]);
    const tainted = norm({ jurisdiction: 'west', slug: 'lsolg', meta: { externalIdentifiers: [{ system: 'recht-nrw', value: 'term:1' }], sourceCitation: 'GV. NRW. S. 1', originEnactingBody: 'Landtag NRW', sourceReferences: [realSnapshot] }, versions: [simVersion] });
    const problems = collectSimulationProvenanceProblems(tainted);
    expect(problems).toHaveLength(4);
    expect(problems.every((problem) => problem.startsWith('west/lsolg/meta.json'))).toBe(true);
  });

  it('extern gepflegte Jurisdiktionen (Ost) sind ausgenommen', () => {
    const ost = buildFixtureNorms().find((record) => record.meta.jurisdiction === 'ost')!;
    expect(collectSimulationProvenanceProblems(ost)).toEqual([]);
    const ostWithReal = norm({ jurisdiction: 'ost', slug: 'x', versions: [{ versionId: '2024-02-01', simulationValidFrom: '2024-02-01', sourceReferences: [{ ...realSnapshot, system: 'revosax' }], body: [] }] });
    expect(collectSimulationProvenanceProblems(ostWithReal)).toEqual([]);
    expect(SIMULATION_BASELINE_DATE).toBe('2023-12-01');
  });
});

describe('S6 Verkündungen', () => {
  it('parst die optionalen Felder seriesTitle, regime, place, entries[].type/startPage/documentDate', () => {
    const publication = parsePublication({
      slug: 'gvbl-sued-2024-1-20240916', jurisdiction: 'baywue', title: 'GVBl. Süd 2024 Nr. 1', gazette: 'GVBl. Süd', seriesTitle: 'Gesetzes- und Verordnungsblatt des Freistaates Süddeutschland', regime: 'Freistaat Süddeutschland (Vorgängerbezeichnung)', place: 'München', year: 2024, issue: '1', date: '2024-09-16',
      sourceReferences: [{ ...simGazette, objectKey: `baywue/simulation/${SHA}.pdf`, publicationSlug: undefined }],
      entries: [{ title: 'Gesetz', type: 'gesetz', citation: 'Gesetz vom 12. September 2024 (GVBl. Süd 2024 Nr. 1 S. 3)', normSlug: 'x', versionId: '2024-09-17', pages: '3–9', startPage: 3, documentDate: '2024-09-12' }],
    }, 'p');
    expect(publication).toMatchObject({ seriesTitle: expect.stringContaining('Süddeutschland'), regime: expect.stringContaining('Vorgänger'), place: 'München' });
    expect(publication.entries[0]).toMatchObject({ type: 'gesetz', startPage: 3, documentDate: '2024-09-12' });
    expect(parsePublication({ slug: 'a', jurisdiction: 'west', title: 't', gazette: 'g', regime: null, year: 2026, issue: '1', date: '2026-01-01', sourceReferences: [], entries: [] }, 'p').regime).toBeUndefined();
    expect(() => parsePublication({ slug: 'a', jurisdiction: 'west', title: 't', gazette: 'g', year: 2026, issue: '1', date: '2026-01-01', sourceReferences: [], entries: [{ title: 't', citation: 'c', normSlug: 'x', type: 'brief' }] }, 'p')).toThrow(/type/u);
    expect(() => parsePublication({ slug: 'a', jurisdiction: 'west', title: 't', gazette: 'g', year: 2026, issue: '1', date: '2026-01-01', sourceReferences: [], entries: [{ title: 't', citation: 'c', normSlug: 'x', startPage: 0 }] }, 'p')).toThrow(/startPage/u);
  });

  it('die West-Fixture-Verkündung trägt die erweiterten Felder und verweist auf die Sim-Fassung', async () => {
    const [publication] = await loadJurisdictionPublications('west', fixtureRoot);
    expect(publication).toMatchObject({ slug: 'gv-west-2026-12', seriesTitle: expect.any(String), place: 'Düsseldorf' });
    expect(publication!.sourceReferences[0]!.kind).toBe('simulation-gazette');
    expect(publication!.entries[0]).toMatchObject({ normSlug: 'testfixture-schulgesetz-west', versionId: '2026-05-01', type: 'aenderungsvorschrift', startPage: 1 });
  });
});
