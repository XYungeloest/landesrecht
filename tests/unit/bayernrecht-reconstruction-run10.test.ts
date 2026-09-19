/**
 * Rückrechnung, Lauf 10: Änderungen vor dem Stichtag vorwärts, Alttext je Änderung aus dem Stand unmittelbar vor ihr.
 *
 * Satzaufhebung mehrerer Sätze, Satznummer „¹“ gestrichen bei folgenden Sätzen, Einfügen ganzer Glieder vor einer
 * Umnummerierung (gleich bezeichnete Glieder), Zählung innerhalb einer Änderung („bisherige“), Anker mit mehrstufigem Ort,
 * Rest der ändernden Vorschrift hinter einem Zitat, Gerüst einer Inhaltsübersicht, Sätze unter einem Glied mit
 * Überschrift als Text, Kopf einer Bekanntmachung vor der Vorbemerkung, mehrdeutige Wortersetzung über den Wortlaut der
 * Verkündungen. Verkündungen echt (`tests/fixtures/bayernrecht`), Glieder mit echtem Wortlaut.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { containerLocation } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { quoteBlocks, withoutTocSkeleton } from '@landesrecht/importer-bayernrecht/reconstruction/forward.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { parseLocation, resolvePath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { disambiguatedReplacement, forwardSentences, realizeRestore, type PublicationBase } from '@landesrecht/importer-bayernrecht/reconstruction/restore.ts';
import { commandLeaves } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural, realize, structuralBackward, structuralForward } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { commandBlock, isBlockFailure, type CommandBlock, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazetteUnits(fixture(`verkuendung-${name}.html`)), identity);
  if (isBlockFailure(block)) throw new Error(block.detail);
  return block;
};
const HEILVFV = { documentId: 'BayHeilvfV', title: 'Verordnung über das Heilverfahren nach Dienstunfällen', abbreviations: ['BayHeilvfV'], bayRsNumber: '2033-1-1-1-F', documentDate: '2010-12-10', versionDate: '2010-12-10', references: ['GVBl. 2010 S. 865'] } as unknown as NormIdentity;
const FLBQUALIV = { documentId: 'BayFlbQualiV', title: 'Verordnung über den sonstigen Qualifikationserwerb für eine Fachlaufbahn', abbreviations: ['FlbQualiV'], bayRsNumber: '2038-4-1-1-V', documentDate: '2011-01-03', versionDate: '2011-01-03', references: ['GVBl. 2011 S. 35'] } as unknown as NormIdentity;
const base = (body: NormBodyBlock[]): PublicationBase => ({ body, organ: 'BayMBl', citation: 'BayMBl. 2020 Nr. 1', url: 'x', sha256: '0'.repeat(64), authority: 'test', representation: 'test' }) as unknown as PublicationBase;

/* ---------------------------------------------------------------------------------- Sätze */

describe('Sätze', () => {
  // BayMBl. 2022 Nr. 702, 1.2.3: „Die Sätze 4 und 5 werden aufgehoben.“ (Wortlaut gekürzt: Satzanfänge der Nr. 1)
  const text = '¹Vor dem Hintergrund … geworden. ²Von ihrer … werden können. ³Die Betriebe … herangeführt werden. ⁴Dabei ist das Handwerk … gegenüber. ⁵Infolgedessen ist … Verfahren. ⁶Mit einer durchschnittlichen … kleinteilig. ⁷Daher sind … umzusetzen.';

  it('mehrere aufgehobene Sätze: Bereiche im Wortlaut vor der Aufhebung (vorher reichte Satz 4 nach Streichen von Satz 5 bis zum Ende)', () => {
    expect(forwardSentences(text, { kind: 'repeal-sentences', location: 'Nr. 1 Sätze 4, 5', path: parseLocation('Nr. 1')![0]!, sentences: [4, 5] })).toBe('¹Vor dem Hintergrund … geworden. ²Von ihrer … werden können. ³Die Betriebe … herangeführt werden. ⁶Mit einer durchschnittlichen … kleinteilig. ⁷Daher sind … umzusetzen.');
  });

  it('„In Satz 1 wird die Satznummerierung „¹“ gestrichen.“ vor „Satz 2 wird aufgehoben.“ (GVBl. 2023 S. 577, BayHeilvfV § 16 Abs. 1)', () => {
    const body = [{ type: 'paragraph', label: '§ 16', children: [{ type: 'subparagraph', label: '(1)', text: '¹Diese Verordnung tritt am 1. Januar 2011 in Kraft. ²Sie ersetzt im Freistaat Bayern die Verordnung zur Durchführung des § 33 des Beamtenversorgungsgesetzes.' }] }] as NormBodyBlock[];
    const field = { path: [0, 0], key: 'text' as const };
    structuralForward(body, field, { kind: 'unnumber-sentences' }, 'a) aa)');
    expect(body[0]!.children![0]!.text).toBe('Diese Verordnung tritt am 1. Januar 2011 in Kraft. ²Sie ersetzt im Freistaat Bayern die Verordnung zur Durchführung des § 33 des Beamtenversorgungsgesetzes.');
    structuralBackward(body, field, { kind: 'unnumber-sentences' }, 'a) aa)');
    expect(body[0]!.children![0]!.text!.startsWith('¹Diese')).toBe(true);
    // Mit Lücke in der Zählung bleibt es ein Befund.
    const gap = [{ type: 'paragraph', label: '§ 16', children: [{ type: 'subparagraph', label: '(1)', text: 'Satz eins. ³Satz drei.' }] }] as NormBodyBlock[];
    expect(() => structuralBackward(gap, field, { kind: 'unnumber-sentences' }, 'x')).toThrow(/Satznummern/u);
  });

  it('aufgehobener Satz 2 hinter dem unnummerierten Satz 1: Anker ist der ganze Wortlaut (Stammverkündung mit „¹“)', () => {
    const working = [{ type: 'paragraph', label: '§ 16', children: [{ type: 'subparagraph', label: '(1)', text: 'Diese Verordnung tritt am 1. Januar 2011 in Kraft.' }] }] as NormBodyBlock[];
    const publication = base([{ type: 'paragraph', label: '§ 14', children: [{ type: 'subparagraph', label: '(1)', text: '¹Diese Verordnung tritt am 1. Januar 2011 in Kraft. ²Sie ersetzt die bisherige Verordnung.' }] }] as NormBodyBlock[]);
    const [step] = realizeRestore(working, publication, { kind: 'repeal-sentences', location: '§ 16 Abs. 1 Satz 2', path: parseLocation('§ 16 Abs. 1')![0]!, sentences: [2], source: { kind: 'repeal-sentences', location: '§ 14 Abs. 1 Satz 2', path: parseLocation('§ 14 Abs. 1')![0]!, sentences: [2] } }, '9. a) bb)');
    expect(step!.operation).toMatchObject({ kind: 'replace-text', before: 'Diese Verordnung tritt am 1. Januar 2011 in Kraft. ²Sie ersetzt die bisherige Verordnung.', after: 'Diese Verordnung tritt am 1. Januar 2011 in Kraft.' });
  });

  it('Satz unter einem Glied, dessen eigener Text die Überschrift ist (BayMBl. 2023 Nr. 513: „5.1.2 Festbetragsfinanzierung …“)', () => {
    const body = [{ type: 'item', label: '5.1.2', text: 'Festbetragsfinanzierung beziehungsweise Pauschalen', children: [{ type: 'paragraphText', text: '¹Landschaftspflegeverbände … in Höhe von bis zu 40 000 €. ²Abweichungen … bekannt gemacht. ³Die Träger der Naturparke … bis zu 40 000 €.' }] }] as NormBodyBlock[];
    expect(resolvePath(body, parseLocation('Nr. 5.1.2 Satz 1')![0]!)).toMatchObject({ ok: true, scope: { fields: [{ path: [0, 0], key: 'text' }], sentence: 1 } });
    // Folgt eine weitere Stufe, bleibt es beim Glied (die Nummer steht nicht im Textglied).
    expect(resolvePath(body, parseLocation('Nr. 5.1.2 Satz 1 Nr. 3')![0]!)).not.toMatchObject({ ok: true, scope: { sentence: 1 } });
  });
});

/* -------------------------------------------------------------------------- Befehlsformen */

describe('Befehlsformen, Lauf 10', () => {
  it('„Nach § 2 Abs. 2 wird folgender Abs. 2a eingefügt:“ (GVBl. 2020 S. 511): Bereich § 2, Anker Abs. 2', () => {
    const quoted = [{ index: 0, tag: 'p', className: '', text: '„(2a) Abweichend von Abs. 2 ist die Kontrollbehörde zuständige Behörde.“', heading: false }];
    expect(parseStructural('Nach § 2 Abs. 2 wird folgender Abs. 2a eingefügt:', [], quoted)).toMatchObject({ formula: 'insert-block', templates: [{ kind: 'insert-blocks', context: [{ kind: 'paragraph', value: '2' }], targets: [{ kind: 'absatz', value: '2a' }], anchor: { side: 'after', step: { kind: 'absatz', value: '2' } } }] });
  });

  it('„Es werden folgende Nr. 4 und folgende neue Nrn. 5 bis 7 eingefügt:“ (GVBl. 2012 S. 12) ist eine lückenlose Folge', () => {
    const quoted = ['„4. eins,', '5. zwei,', '6. drei,', '7. vier,“'].map((text, index) => ({ index, tag: 'p', className: '', text, heading: false }));
    expect(parseStructural('Es werden folgende Nr. 4 und folgende neue Nrn. 5 bis 7 eingefügt:', [parseLocation('§ 1')![0]!], quoted)).toMatchObject({ templates: [{ targets: [{ value: '4' }, { value: '5' }, { value: '6' }, { value: '7' }] }] });
  });

  it('„Der Wortlaut wird Satz 1 und wie folgt geändert:“ (GVBl. 2020 S. 318) und „In Abs. 1 wird der einleitende Satzteil wie folgt geändert:“ (GVBl. 2013 S. 192)', () => {
    expect(parseStructural('Der Wortlaut wird Satz 1 und wie folgt geändert:', [parseLocation('§ 9 Abs. 3')![0]!], [])).toMatchObject({ formula: 'number-sentences' });
    expect(containerLocation('In Abs. 1 wird der einleitende Satzteil wie folgt geändert:')).toBe('Abs. 1 einleitender Satzteil');
    expect(containerLocation('Der bisherige Abs. 2 wird Abs. 4 und wird wie folgt geändert:')).toBeUndefined();
  });

  it('hinter einem geschlossenen Zitat: der Rest der ändernden Vorschrift ist kein Unterbefehl (GVBl. 2011 S. 251)', () => {
    const { leaves } = commandLeaves(blockOf('gvbl-2011-251', FLBQUALIV));
    const appended = leaves.find((leaf) => /Es werden folgende Abs\. 3 und 4 angefügt/u.test(leaf.node.text))!;
    expect(appended.hasChildren).toBeFalsy();
    expect(appended.node.quoted.length).toBeGreaterThan(0);
    expect(leaves.some((leaf) => /tritt am 1\. Juli 2011 in Kraft/u.test(leaf.node.text))).toBe(false);
  });
});

/* ------------------------------------------------------------------ Blockmodell der Verkündung */

describe('Blockmodell der Verkündung', () => {
  it('Gerüst einer Inhaltsübersicht fällt vorwärts weg (GVBl. 2011 S. 498: „Inhaltübersicht“, Glieder nur mit Überschriften)', () => {
    const body = [
      { type: 'paragraphText', text: 'Auf Grund des Art. 22 Abs. 8 Satz 8 des Leistungslaufbahngesetzes erlässt das Staatsministerium folgende Verordnung:' },
      { type: 'paragraphText', text: 'Inhaltübersicht' },
      { type: 'part', label: 'Teil 1', title: 'Allgemeine Bestimmungen', children: [{ type: 'paragraph', label: '§ 1', title: 'Geltungsbereich', children: [] }] },
      { type: 'part', label: 'Teil 1', title: 'Allgemeine Bestimmungen', children: [{ type: 'paragraph', label: '§ 1', title: 'Geltungsbereich', children: [{ type: 'subparagraph', label: '(1)', text: 'Diese Verordnung gilt für …' }] }] },
    ] as NormBodyBlock[];
    expect(withoutTocSkeleton(structuredClone(body)).map((block) => block.label ?? block.text)).toEqual([body[0]!.text, 'Teil 1']);
    // Ohne Wiederkehr der Bezeichnungen bleibt der Körper, wie er ist.
    expect(withoutTocSkeleton(structuredClone(body.slice(0, 3)))).toHaveLength(3);
  });

  it('Vorbemerkung ohne den Kopf der Bekanntmachung im Portal (BayVV_2162_A_10911)', () => {
    const body = [
      { type: 'heading', text: '2162-A\n\nRichtlinie zur Förderung Koordinierender Kinderschutzstellen KoKi – Netzwerk frühe Kindheit' },
      { type: 'paragraphText', text: 'Bekanntmachung des Bayerischen Staatsministeriums für Familie, Arbeit und Soziales\nvom 21. Januar 2020, Az. V2/6524.01/32' },
      { type: 'paragraphText', text: '(BayMBl. Nr. 52)' },
      { type: 'paragraphText', text: '¹Der Freistaat Bayern gewährt nach Maßgabe dieser Richtlinie … Zuwendungen. ²…' },
      { type: 'item', label: '1.', text: 'Zweck der Förderung' },
    ] as NormBodyBlock[];
    expect(resolvePath(body, parseLocation('Präambel')![0]!)).toMatchObject({ ok: true, scope: { fields: [{ path: [3], key: 'text' }] } });
  });

  it('mehrdeutige Wortersetzung: die Stelle, deren Rücknahme den Wortlaut der Verkündungen ergibt (BayMBl. 2025 Nr. 495, „FEl“ → „FEI“)', () => {
    const current = '¹Zuwendungen werden gewährt. ²Als nichtwirtschaftliche Tätigkeiten (vgl. Randnummer 16 ff) FEI-Unionsrahmen) werden nach Randnummer 20 FEI-Unionsrahmen betrachtet.';
    const before = '¹Zuwendungen werden gewährt. ²Als nichtwirtschaftliche Tätigkeiten (vgl. Randnummer 16 ff) FEl-Unionsrahmen) werden nach Randnummer 20 FEI-Unionsrahmen betrachtet.';
    const working = [{ type: 'item', label: '4.1', children: [{ type: 'paragraphText', text: current }] }] as NormBodyBlock[];
    const scope = resolvePath(working, parseLocation('Nr. 4.1 Satz 2')![0]!);
    if (!scope.ok) throw new Error(scope.reason);
    const step = disambiguatedReplacement(working, base([{ type: 'item', label: '4.1', children: [{ type: 'paragraphText', text: before }] }] as NormBodyBlock[]), scope.scope, 'FEl-Unionsrahmen', 'FEI-Unionsrahmen', 'Nr. 4.1 Satz 2');
    expect(step?.operation).toMatchObject({ kind: 'replace-text', before, after: current });
    // Ohne Beleg in den Verkündungen keine Wahl.
    expect(disambiguatedReplacement(working, base([]), scope.scope, 'FEl-Unionsrahmen', 'FEI-Unionsrahmen', 'Nr. 4.1 Satz 2')).toBeUndefined();
  });
});

describe('Einfügen ganzer Glieder vor einer Umnummerierung (GVBl. 2023 S. 577, BayHeilvfV)', () => {
  const { leaves } = commandLeaves(blockOf('gvbl-2023-577', HEILVFV));
  const insert = leaves.find((leaf) => /Nach § 7 werden die folgenden §§ 8 und 9 eingefügt/u.test(leaf.node.text))!;
  const parsed = parseStructural(insert.node.text, insert.context, insert.node.quoted)!;
  const template = parsed.templates![0]!;
  if (template.kind !== 'insert-blocks') throw new Error(template.kind);
  const inserted = quoteBlocks(insert.node.quoted, 'GVBl');
  const old = (label: string): NormBodyBlock => ({ type: 'paragraph', label, title: `Bisher ${label}`, children: [{ type: 'paragraphText', text: `Wortlaut des bisherigen ${label}.` }] }) as NormBodyBlock;
  const seven = { type: 'paragraph', label: '§ 7', title: 'Sieben', children: [{ type: 'paragraphText', text: 'Text sieben.' }] } as NormBodyBlock;

  it('rückwärts, vor der Rücknahme von „Die bisherigen §§ 8 bis 10 werden die §§ 10 bis 12.“: die eingefügten stehen unmittelbar nach § 7, ihr Wortlaut ist das Zitat', () => {
    expect(inserted.map((block) => block.label)).toEqual(['§ 8', '§ 9']);
    const body = [seven, ...structuredClone(inserted), old('§ 8'), old('§ 9')];
    const realized = realize(body, template, '5.', false);
    expect(realized.map((entry) => entry.operation)).toMatchObject([{ kind: 'insert-block', parent: [], index: 1 }, { kind: 'insert-block', parent: [], index: 2 }]);
    expect(realized[0]!.resolved[0]).toMatch(/nach Wortlaut und Stelle unterschieden/u);
  });

  it('steht das eingefügte Glied nicht nach dem Anker, bleibt es ein Befund', () => {
    const body = [seven, old('§ 8'), old('§ 9'), ...structuredClone(inserted)];
    expect(() => realize(body, template, '5.', false)).toThrow(/mehrfach|nicht/u);
  });
});
