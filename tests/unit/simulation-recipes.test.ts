/**
 * Fail-closed-Parser der Sim-Rezepte (S4) und Sim-Akte (S5) nach docs/SIMULATION_IMPORT.md, Abschnitt 5.
 */
import { describe, expect, it } from 'vitest';

import { parseSimulationAct, parseSimulationRecipe, RECIPE_SCHEMA_VERSION, ACT_SCHEMA_VERSION } from '@landesrecht/importer-simulation/recipes/schema.ts';

const SHA = 'a'.repeat(64);

export function sampleSourceReference(kind = 'simulation-amendment-source', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind,
    system: 'simulation',
    label: 'GV. West 2026 Nr. 2 S. 10',
    availability: 'r2-archived',
    bucket: 'landesrecht-quellen',
    objectKey: `west/simulation/${SHA}.pdf`,
    sha256: SHA,
    mediaType: 'application/pdf',
    pageRange: '10–12',
    publicationSlug: 'gv-west-2026-2-20260517',
    ...extra,
  };
}

export function sampleRecipe(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: RECIPE_SCHEMA_VERSION,
    amendmentAct: 'gesetz-zur-aenderung-des-schulgesetzes-2026-west',
    effectiveDate: '2026-05-18',
    amendmentCitation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)',
    resultCitation: 'Schulgesetz, geändert durch Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)',
    changeNote: '§ 1 Absatz 1 neu gefasst.',
    commandCoverage: ['Artikel 1 Nummer 1'],
    sourceReferences: [sampleSourceReference()],
    operations: [
      { op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentType: 'paragraph', parentLabel: '§ 1' }, field: 'text', expectedOld: 'alt', value: 'neu', expectedMatches: 1, source: `west/simulation/${SHA}.pdf`, sourceProvision: 'Artikel 1 Nummer 1', effectiveDate: '2026-05-18' },
    ],
    ...extra,
  };
}

export function sampleAct(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: ACT_SCHEMA_VERSION,
    slug: 'landessolargesetz-west',
    jurisdiction: 'west',
    meta: {
      title: 'Landessolargesetz',
      shortTitle: 'Landessolargesetz',
      abbr: 'LSolG West',
      type: 'gesetz',
      status: 'in-force',
      enactingBody: 'Landtag Westdeutschland',
      subjects: ['Energie'],
      keywords: [],
      initialCitation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 3)',
      documentDate: '2026-05-12',
      publicationDate: '2026-05-17',
      effectiveDate: '2026-05-18',
      relations: [{ type: 'amends', target: { slug: 'schulg-west' }, note: 'Artikel 2', date: '2026-05-18' }],
    },
    version: {
      versionId: '2026-05-18',
      simulationValidFrom: '2026-05-18',
      citation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 3)',
      changeNote: 'Amtlich veröffentlicht.',
      body: [{ type: 'paragraph', label: '§ 1', title: 'Zweck', children: [{ type: 'subparagraph', label: '(1)', text: 'Dieses Gesetz fördert Solarenergie.', children: [] }] }],
      sourceReferences: [sampleSourceReference('simulation-gazette', { pageRange: '3–9', sourceRole: 'structure-bearing' })],
    },
    publication: { slug: 'gv-west-2026-2-20260517', pages: '3–9' },
    provenance: { transcribedFrom: SHA, method: 'text-layer', checked: 'Wortlaut gegen Layouttext geprüft' },
    ...extra,
  };
}

describe('Rezeptparser (S4)', () => {
  it('parst ein Rezept nach Dokumentationsformat mit Standardwerten', () => {
    const recipe = parseSimulationRecipe(sampleRecipe(), 'r.json');
    expect(recipe.versionId).toBe('2026-05-18');
    expect(recipe.repealsLaw).toBe(false);
    expect(recipe.sourceReferences[0]!.publicationSlug).toBe('gv-west-2026-2-20260517');
    expect(recipe.operations[0]).toMatchObject({ op: 'replaceText', field: 'text', expectedOld: 'alt', value: 'neu' });
    const explicit = parseSimulationRecipe(sampleRecipe({ versionId: '2026-05-18', sameDayOrder: 2 }), 'r.json');
    expect(explicit.sameDayOrder).toBe(2);
  });

  it('weist unbekannte Felder, fremde Belege, falsche Wirkdaten und Operationsfehler ab', () => {
    expect(() => parseSimulationRecipe(sampleRecipe({ sameDayorder: 1 }), 'r.json')).toThrow(/unbekannte Felder: sameDayorder/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ schemaVersion: 'x' }), 'r.json')).toThrow(/schemaVersion/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ sourceReferences: [] }), 'r.json')).toThrow(/mindestens 1 Sim-Beleg/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ sourceReferences: [{ kind: 'amendment-source', system: 'recht-nrw', label: 'x', availability: 'external', url: 'https://recht.nrw.de/x' }] }), 'r.json')).toThrow(/kein Sim-Beleg/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ sourceReferences: [sampleSourceReference('simulation-amendment-source', { system: 'recht-nrw' })] }), 'r.json')).toThrow(/„simulation“/u);
    const operations = (sampleRecipe().operations as Array<Record<string, unknown>>);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], effectiveDate: '2026-05-19' }] }), 'r.json')).toThrow(/weicht vom Wirkdatum/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], op: 'replaceProvision', field: undefined, value: 'text' }] }), 'r.json')).toThrow(/value/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], expectedOld: undefined }] }), 'r.json')).toThrow(/expectedHash oder expectedOld fehlt/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], target: { type: 'absatz' } }] }), 'r.json')).toThrow(/Blocktyp/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], expectedMatches: 0 }] }), 'r.json')).toThrow(/expectedMatches/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [{ ...operations[0], unknownField: 1 }] }), 'r.json')).toThrow(/unbekannte Felder: unknownField/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [] }), 'r.json')).toThrow(/mindestens eine Operation/u);
  });

  it('bindet repealsLaw an genau eine repealLaw-Operation', () => {
    const repeal = { op: 'repealLaw', expectedHash: SHA, expectedMatches: 1, source: 'x.pdf', sourceProvision: 'Artikel 3', effectiveDate: '2026-05-18' };
    expect(parseSimulationRecipe(sampleRecipe({ repealsLaw: true, operations: [repeal] }), 'r.json').repealsLaw).toBe(true);
    expect(() => parseSimulationRecipe(sampleRecipe({ operations: [repeal] }), 'r.json')).toThrow(/repealsLaw: true/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ repealsLaw: true }), 'r.json')).toThrow(/genau einer repealLaw-Operation/u);
    expect(() => parseSimulationRecipe(sampleRecipe({ repealsLaw: true, operations: [{ ...repeal, target: { label: '§ 1' } }] }), 'r.json')).toThrow(/keinen Zielanker/u);
  });
});

describe('Aktparser (S5)', () => {
  it('parst einen Sim-Akt nach Dokumentationsformat', () => {
    const act = parseSimulationAct(sampleAct(), 'a.json');
    expect(act.slug).toBe('landessolargesetz-west');
    expect(act.meta.relations[0]).toMatchObject({ type: 'amends', target: { slug: 'schulg-west' } });
    expect(act.version.sourceReferences[0]!.kind).toBe('simulation-gazette');
    expect(act.publication).toEqual({ slug: 'gv-west-2026-2-20260517', pages: '3–9' });
    expect(act.provenance.method).toBe('text-layer');
    const override = parseSimulationAct(sampleAct({ provenance: { transcribedFrom: SHA, method: 'docx', checked: 'x', textCheckOverride: { reason: 'Scan mit Layoutfehlern, Sichtprüfung' } } }), 'a.json');
    expect(override.provenance.textCheckOverride?.reason).toContain('Sichtprüfung');
  });

  it('weist reale Provenienz, Identitätsfelder, abweichende Daten und leere Körper ab', () => {
    const meta = sampleAct().meta as Record<string, unknown>;
    const version = sampleAct().version as Record<string, unknown>;
    expect(() => parseSimulationAct(sampleAct({ meta: { ...meta, externalIdentifiers: [] } }), 'a.json')).toThrow(/unbekannte Felder: externalIdentifiers/u);
    expect(() => parseSimulationAct(sampleAct({ meta: { ...meta, sourceCitation: 'GV. NRW. S. 1' } }), 'a.json')).toThrow(/unbekannte Felder: sourceCitation/u);
    expect(() => parseSimulationAct(sampleAct({ meta: { ...meta, type: 'aenderungsvorschrift' } }), 'a.json')).toThrow(/one-time-act/u);
    expect(() => parseSimulationAct(sampleAct({ meta: { ...meta, effectiveDate: '2026-06-01' } }), 'a.json')).toThrow(/weicht vom Inkrafttreten/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, versionId: '2026-05-19' } }), 'a.json')).toThrow(/muss dem Inkrafttreten/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, simulationValidTo: '2027-01-01' } }), 'a.json')).toThrow(/abgeleitet/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, sourceValidFrom: '2026-05-18' } }), 'a.json')).toThrow(/unbekannte Felder: sourceValidFrom/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, body: [] } }), 'a.json')).toThrow(/darf nicht leer sein/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, sourceReferences: [sampleSourceReference('official-gazette', { system: 'verkuendungsportal-sh', url: 'https://example.invalid/x', retrievedAt: '2026-01-01', publicationSlug: undefined })] } }), 'a.json')).toThrow(/kein Sim-Beleg/u);
    expect(() => parseSimulationAct(sampleAct({ version: { ...version, sourceReferences: [sampleSourceReference('simulation-gazette', { publicationSlug: 'anderes-blatt' })] } }), 'a.json')).toThrow(/weicht von publication.slug/u);
    expect(() => parseSimulationAct(sampleAct({ provenance: { transcribedFrom: 'kein-hash', method: 'txt', checked: 'x' } }), 'a.json')).toThrow(/SHA-256/u);
    expect(() => parseSimulationAct(sampleAct({ jurisdiction: 'sachsen' }), 'a.json')).toThrow(/Jurisdiktion/u);
  });
});
