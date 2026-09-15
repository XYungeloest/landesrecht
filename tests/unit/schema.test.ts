import { describe, expect, it } from 'vitest';

import { buildAnchorMap, buildOutline, countBlockTypes, getStructuralReference } from '@landesrecht/legal-core/lib/body.ts';
import { ContentValidationError, parseBodyBlock, parseNormMeta, parseNormVersion, parseSourceReference, STRUCTURE_TYPES, validateNormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { buildFixtureNorms, norm, paragraph } from '../helpers/fixture-corpus.ts';

describe('Schema-Validierung', () => {
  it('verlangt eine bekannte Jurisdiktion und generische externe Kennungen', () => {
    expect(() => parseNormMeta({ id: 'x', slug: 'x', jurisdiction: 'sachsen', title: 'T', type: 'gesetz', status: 'in-force', subjects: [], keywords: [], initialCitation: 'Z' })).toThrow(/Jurisdiktion/u);
    const meta = parseNormMeta({
      id: 'west:x', slug: 'x', jurisdiction: 'west', title: 'T', type: 'gesetz', status: 'in-force', subjects: [], keywords: [], initialCitation: 'Z',
      externalIdentifiers: [{ system: 'revosax', value: '4192' }],
    });
    expect(meta.externalIdentifiers).toEqual([{ system: 'revosax', value: '4192', url: undefined }]);
    expect(meta.relations).toEqual([]);
    expect(() => parseNormMeta({ ...meta, externalIdentifiers: [{ system: 'revosax', value: '1' }, { system: 'revosax', value: '1' }] })).toThrow(/doppelt/u);
    expect(() => parseNormMeta({ ...meta, revosaxLawId: '4192' })).not.toThrow();
    expect('revosaxLawId' in parseNormMeta({ ...meta })).toBe(false);
  });

  it('lehnt das eindimensionale validFrom/validTo ab und verlangt die Simulationsachse', () => {
    expect(() => parseNormVersion({ versionId: 'v', validFrom: '2023-12-01', validTo: null, citation: 'c', changeNote: 'n', body: [] })).toThrow(/simulationValidFrom/u);
    const version = parseNormVersion({ versionId: 'v', simulationValidFrom: '2023-12-01', simulationValidTo: null, sourceValidFrom: '2023-08-01', sourceValidTo: '2024-01-31', citation: 'c', changeNote: 'n', body: [] });
    expect(version.sourceValidFrom).toBe('2023-08-01');
    expect(() => parseNormVersion({ ...version, sourceValidTo: '2023-01-01' })).toThrow(/sourceValidTo/u);
    expect(() => parseNormVersion({ ...version, simulationValidTo: '2023-11-30' })).toThrow(/simulationValidTo/u);
  });

  it('prüft Quellenreferenzen nach Verfügbarkeit', () => {
    expect(() => parseSourceReference({ kind: 'official-portal-snapshot', label: 'x', availability: 'versioned' }, 's')).toThrow(/localSource/u);
    expect(() => parseSourceReference({ kind: 'official-portal-snapshot', label: 'x', availability: 'r2-archived', objectKey: 'west/recht-nrw/2023-12-01/a.html' }, 's')).toThrow(/sha256/u);
    const archived = parseSourceReference({
      kind: 'official-portal-snapshot', system: 'recht-nrw', label: 'x', availability: 'r2-archived', objectKey: 'west/recht-nrw/2023-12-01/a.html',
      sha256: 'a'.repeat(64), url: 'https://recht.nrw.de/x', retrievedAt: '2026-01-01', externalId: '223',
    }, 's');
    expect(archived.externalId).toBe('223');
    expect(() => parseSourceReference({ kind: 'provider-record', label: 'x', availability: 'external' }, 's')).toThrow(/url/u);
  });

  it('akzeptiert alle Body-Blocktypen einschließlich Buch, Vorbemerkung, Überschrift und Fußnote', () => {
    expect(STRUCTURE_TYPES).toContain('book');
    expect(STRUCTURE_TYPES).toContain('preamble');
    expect(STRUCTURE_TYPES).toContain('footnote');
    const book = parseBodyBlock({ type: 'book', label: 'Buch 1', children: [{ type: 'preamble', title: 'Vorbemerkung', children: [{ type: 'paragraphText', text: 'x' }] }, { type: 'heading', title: 'Überschrift' }, { type: 'footnote', label: '1', text: 'Fußnote' }] }, 'b');
    expect(countBlockTypes([book])).toEqual({ book: 1, preamble: 1, paragraphText: 1, heading: 1, footnote: 1 });
    expect(() => parseBodyBlock({ type: 'footnote', text: 'x' }, 'f')).toThrow(/Fußnotenzeichen/u);
    expect(() => parseBodyBlock({ type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', text: 'a', colspan: 2 }] }, { type: 'tableRow', children: [{ type: 'tableCell', text: 'b' }] }] }, 't')).toThrow(/Spalten/u);
    expect(() => parseBodyBlock({ type: 'tableCell', text: 'x', scope: 'col' }, 'c')).toThrow(/Tabellenkopfzellen/u);
  });

  it('verlangt lückenlose, überschneidungsfreie Simulationsintervalle', () => {
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: 'a', simulationValidFrom: '2023-12-01', simulationValidTo: '2024-01-15', body: [] },
      { versionId: 'b', simulationValidFrom: '2024-01-15', body: [] },
    ] })).toThrow(/überlappen/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: 'a', simulationValidFrom: '2023-12-01', simulationValidTo: '2024-01-10', body: [] },
      { versionId: 'b', simulationValidFrom: '2024-01-15', body: [] },
    ] })).toThrow(/Gültigkeitslücke/u);
    expect(() => norm({ jurisdiction: 'west', slug: 'x', versions: [
      { versionId: 'a', simulationValidFrom: '2023-12-01', simulationValidTo: '2024-01-14', body: [] },
      { versionId: 'b', simulationValidFrom: '2024-01-15', body: [] },
    ] })).not.toThrow();
    const record = buildFixtureNorms()[0]!;
    expect(() => validateNormRecord({ ...record, versions: [] })).toThrow(ContentValidationError);
  });

  it('verweigert Selbstbezüge in Beziehungen', () => {
    expect(() => norm({ jurisdiction: 'west', slug: 'x', meta: { relations: [{ type: 'related', target: { slug: 'x' } }] }, versions: [{ versionId: 'a', simulationValidFrom: '2023-12-01', body: [] }] })).toThrow(/sich selbst/u);
  });
});

describe('Normkörper-Helfer', () => {
  it('bildet semantische, kollisionsfreie Sprungziele', () => {
    const blocks = [
      { type: 'section' as const, label: '1. Abschnitt', title: 'A', children: [paragraph('§ 1', 'Eins', 'x'), paragraph('§ 1', 'Doppelt', 'y'), { type: 'article' as const, label: 'Art. 5', children: [{ type: 'paragraphText' as const, text: 'z' }] }] },
      { type: 'quotedProvision' as const, children: [paragraph('§ 1', 'Zitiert', 'q')] },
      { type: 'annex' as const, label: 'Anlage 2', children: [{ type: 'paragraphText' as const, text: 'a' }] },
    ];
    const anchors = buildAnchorMap(blocks);
    expect(anchors.get('0')).toBe('abschnitt-1');
    expect(anchors.get('0.0')).toBe('paragraph-1');
    expect(anchors.get('0.1')).toBe('paragraph-1--0-1');
    expect(anchors.get('0.2')).toBe('artikel-5');
    expect(anchors.get('1.0')).toBe('zitat-paragraph-1');
    expect(anchors.get('2')).toBe('anlage-2');
    const outline = buildOutline(blocks, anchors);
    expect(outline.map((entry) => entry.anchor)).toEqual(['abschnitt-1', 'anlage-2']);
    expect(outline[0]!.children.map((entry) => entry.anchor)).toEqual(['paragraph-1', 'paragraph-1--0-1', 'artikel-5']);
  });

  it('liefert Strukturadressen mit Absätzen', () => {
    expect(getStructuralReference(paragraph('§ 3', 'x', 'a', 'b'))).toEqual({ paragraph: '3', subsections: ['1', '2'] });
    expect(getStructuralReference({ type: 'article', label: 'Art. 12a', children: [] })).toEqual({ article: '12a' });
    expect(getStructuralReference({ type: 'section', label: '1. Abschnitt', children: [] })).toBeUndefined();
  });

  it('der synthetische Bestand ist gültig', () => {
    const norms = buildFixtureNorms();
    expect(norms).toHaveLength(4);
    expect(new Set(norms.map((record) => record.meta.jurisdiction)).size).toBe(4);
  });
});
