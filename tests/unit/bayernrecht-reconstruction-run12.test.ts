/**
 * Rückrechnung, Lauf 12: Gliederungsteile mit Ordnungswort und römischer Zählung, Wechsel der Gliederungsart
 * (Abschnitt → Kapitel), Reviewentscheidungen zur Gestalt bisheriger Bezeichnungen (`decisions.ts`), ganze Teile als
 * Zitat vorwärts. Verkündung und Portalkörper echt (`tests/fixtures/bayernrecht`): GVBl. 2024 S. 630 (Landtierarztquote)
 * am Gesetz über den gesundheitlichen Verbraucherschutz und das Veterinärwesen (BayGDVG).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { forwardLawSteps } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { DECISIONS_SCHEMA, labelFormsFor, parseDecisions, type ReconstructionDecision } from '@landesrecht/importer-bayernrecht/reconstruction/decisions.ts';
import { forwardAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/forward.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, locateBlock, ordinalDesignation, parseLocation, relabel } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { stableStringify } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { commandLeaves, reverseAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural, realize, StructuralError } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { commandBlock, isBlockFailure, type CommandBlock, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { titleState } from '@landesrecht/importer-bayernrecht/reconstruction/title.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

interface PortalFixture {
  documentId: string;
  identity: NormIdentity;
  law: { title: string; shortTitle?: string; abbr?: string };
  body: NormBodyBlock[];
}
const portal = JSON.parse(fixture('portal-BayGDVG-full.json')) as PortalFixture;
const blockOf = (name: string): CommandBlock => {
  const block = commandBlock(gazetteUnits(fixture(`verkuendung-${name}.html`)), portal.identity);
  if (isBlockFailure(block)) throw new Error(block.detail);
  return block;
};
const unit = (text: string, index = 0) => ({ index, tag: 'p', className: '', text, heading: false });

const decisions: ReconstructionDecision[] = [1, 2].map((n) => ({ documentId: 'BayGDVG', kind: 'relabel-form', citation: 'GVBl. 2024 S. 630', to: `Kapitel ${n}`, from: `Abschnitt ${['I', 'II'][n - 1]}`, decidedBy: 'Test', decidedAt: '2026-09-28', reason: 'Probe' }));

/* ---------------------------------------------------------------- Bezeichnungen und Orte */

describe('Gliederungsteile mit Ordnungswort und römischer Zählung', () => {
  it('Orte: „des ersten Teils“, „im Zweiten Abschnitt“, „Kapitel 2“', () => {
    expect(parseLocation('Überschrift des ersten Teils')!.map(formatPath)).toEqual(['Teil 1 Überschrift']);
    expect(parseLocation('Zweiter Abschnitt Art. 5')!.map(formatPath)).toEqual(['Abschnitt 2 Art. 5']);
    expect(parseLocation('Teil 2 Kapitel 2 Art. 21')!.map(formatPath)).toEqual(['Teil 2 Kapitel 2 Art. 21']);
  });

  it('Schreibweisen im Bestand werden gefunden: „Erster Teil“, „1. Teil“, „I. Abschnitt“, „Abschnitt I“', () => {
    const body = [
      { type: 'part', label: 'Erster Teil', children: [{ type: 'section', label: 'I. Abschnitt', children: [] }, { type: 'section', label: 'Abschnitt II', children: [] }] },
      { type: 'part', label: '2. Teil', children: [] },
    ] as NormBodyBlock[];
    expect(locateBlock(body, parseLocation('Teil 1')![0]!)).toMatchObject({ ok: true, path: [0] });
    expect(locateBlock(body, parseLocation('Teil 2')![0]!)).toMatchObject({ ok: true, path: [1] });
    expect(locateBlock(body, parseLocation('Teil 1 Abschnitt I')![0]!)).toMatchObject({ ok: true, path: [0, 0] });
    expect(locateBlock(body, parseLocation('Teil 1 Abschnitt 2')![0]!)).toMatchObject({ ok: true, path: [0, 1] });
    // Fortschreiben kann nur die Schreibweise „Wort Wert“ – nicht „Erster Teil“.
    expect(relabel('Teil 3', { kind: 'teil', value: '3' }, '4')).toBe('Teil 4');
    expect(relabel('Erster Teil', { kind: 'teil', value: '1' }, '2')).toBeUndefined();
    expect(ordinalDesignation('teil', '4')).toBe('Vierter Teil');
  });

  it('„Der Erste Teil wird Teil 1.“, „Der bisherige Vierte Teil wird Teil 5.“: Bezeichnungen, wie das Gesetz sie nennt', () => {
    expect(parseStructural('Der Erste Teil wird Teil 1.', [], [])).toMatchObject({ formula: 'relabel', templates: [{ kind: 'relabel', pairs: [[{ kind: 'teil', value: '1' }, { kind: 'teil', value: '1' }]], labels: [{ from: 'Erster Teil', to: 'Teil 1' }] }] });
    expect(parseStructural('Der bisherige Vierte Teil wird Teil 5.', [], [])).toMatchObject({ templates: [{ pairs: [[{ kind: 'teil', value: '4' }, { kind: 'teil', value: '5' }]], labels: [{ from: 'Vierter Teil', to: 'Teil 5' }] }] });
  });

  it('„Die Abschnitte I. und II. werden die Kapitel 1 und 2.“: neue Bezeichnungen genannt, bisherige in ihrer Gestalt offen', () => {
    const parsed = parseStructural('Die Abschnitte I. und II. werden die Kapitel 1 und 2.', [parseLocation('Teil 2')![0]!], []);
    expect(parsed).toMatchObject({ formula: 'relabel', templates: [{ context: [{ kind: 'teil', value: '2' }], pairs: [[{ kind: 'abschnitt', value: 'I' }, { kind: 'kapitel', value: '1' }], [{ kind: 'abschnitt', value: 'II' }, { kind: 'kapitel', value: '2' }]], labels: [{ to: 'Kapitel 1' }, { to: 'Kapitel 2' }] }] });
    expect(parsed!.templates![0]!.kind === 'relabel' && parsed!.templates![0]!.labels![0]!.from).toBeUndefined();
  });

  it('„Der Zweite Teil wird Teil 2 und die Abschnitte I. und II. werden die Kapitel 1 und 2.“ sind zwei Befehle, der zweite unter Teil 2', () => {
    const text = 'Der Zweite Teil wird Teil 2 und die Abschnitte I. und II. werden die Kapitel 1 und 2.';
    const { leaves } = commandLeaves({ commands: [{ unit: unit(text), label: '3.', text, quoted: [], children: [], depth: 0 }], introPrefix: '', intro: unit('Intro'), citation: {}, section: undefined } as never);
    expect(leaves.map((leaf) => [leaf.node.text, leaf.context.map(formatPath).join(' / ')])).toEqual([
      ['Der Zweite Teil wird Teil 2.', ''],
      ['Die Abschnitte I. und II. werden die Kapitel 1 und 2.', 'Teil 2'],
    ]);
  });
});

/* ---------------------------------------------------------------- Reviewentscheidungen */

describe('Reviewentscheidungen zur Gestalt bisheriger Bezeichnungen (`decisions.ts`)', () => {
  it('ohne Entscheidung bleibt der Wechsel der Gliederungsart ein Befund (`relabel-form-ambiguous`); mit ihr wird der Typ mit umgestellt', () => {
    const body = [{ type: 'part', label: 'Teil 2', children: [{ type: 'chapter', label: 'Kapitel 1', title: 'Allgemeine Aufgaben', children: [] }, { type: 'chapter', label: 'Kapitel 2', title: 'Überwachung', children: [] }] }] as NormBodyBlock[];
    const template = parseStructural('Die Abschnitte I. und II. werden die Kapitel 1 und 2.', [parseLocation('Teil 2')![0]!], [])!.templates![0]!;
    expect(() => realize(body, template, '3.', false)).toThrow(StructuralError);
    try {
      realize(body, template, '3.', false);
    } catch (error) {
      expect((error as StructuralError).code).toBe('relabel-form-ambiguous');
      expect((error as Error).message).toMatch(/Abschnitt I/u);
    }
    const realized = realize(body, template, '3.', false, labelFormsFor(decisions, 'BayGDVG', 'GVBl. 2024 S. 630'));
    expect(realized.map((entry) => entry.operation)).toEqual([
      { kind: 'relabel', path: [0, 0], from: 'Abschnitt I', to: 'Kapitel 1', fromType: 'section', toType: 'chapter' },
      { kind: 'relabel', path: [0, 1], from: 'Abschnitt II', to: 'Kapitel 2', fromType: 'section', toType: 'chapter' },
    ]);
    expect(realized[0]!.reviewDecision).toMatch(/Reviewentscheidung \(Test, 2026-09-28\): Probe/u);
    // Für eine andere Norm oder Verkündung gilt die Entscheidung nicht.
    expect(labelFormsFor(decisions, 'BayGDVG', 'GVBl. 2024 S. 631').size).toBe(0);
    expect(labelFormsFor(decisions, 'BayEUG', 'GVBl. 2024 S. 630').size).toBe(0);
  });

  it('Datei: Schema, Pflichtfelder, Datum, keine zwei Entscheidungen für dieselbe Bezeichnung', () => {
    const valid = { schema: DECISIONS_SCHEMA, decisions };
    expect(parseDecisions(JSON.stringify(valid))).toHaveLength(2);
    expect(() => parseDecisions(JSON.stringify({ ...valid, schema: 'x' }))).toThrow(/Schema/u);
    expect(() => parseDecisions(JSON.stringify({ schema: DECISIONS_SCHEMA, decisions: [{ ...decisions[0], reason: '' }] }))).toThrow(/ohne „reason“/u);
    expect(() => parseDecisions(JSON.stringify({ schema: DECISIONS_SCHEMA, decisions: [{ ...decisions[0], decidedAt: 'gestern' }] }))).toThrow(/ISO-Datum/u);
    expect(() => parseDecisions(JSON.stringify({ schema: DECISIONS_SCHEMA, decisions: [{ ...decisions[0], kind: 'x' }] }))).toThrow(/Art „x“/u);
    expect(() => labelFormsFor([decisions[0]!, decisions[0]!], 'BayGDVG', 'GVBl. 2024 S. 630')).toThrow(/zwei Entscheidungen/u);
  });
});

/* ---------------------------------------------------------------- GVBl. 2024 S. 630, BayGDVG */

describe('GVBl. 2024 S. 630 (Landtierarztquote) am BayGDVG – echte Verkündung, echter Portalkörper', () => {
  const block = blockOf('gvbl-2024-630');

  it('neun Befehle: Umbenennung der Teile, Abschnitte → Kapitel, eingefügter Teil 4, Umnummerierung der Artikel', () => {
    const { leaves } = commandLeaves(block);
    expect(leaves.map((leaf) => leaf.node.text.slice(0, 40))).toEqual([
      'Der Erste Teil wird Teil 1.',
      'In Art. 6 Abs. 4 Halbsatz 2 wird die Ang',
      'Der Zweite Teil wird Teil 2.',
      'Die Abschnitte I. und II. werden die Kap',
      'In Art. 21 Abs. 2 Satz 2 wird die Angabe',
      'Der Dritte Teil wird Teil 3.',
      'Nach Art. 26 wird folgender Teil 4 einge',
      'Der bisherige Vierte Teil wird Teil 5.',
      'Die bisherigen Art. 27 bis 30 werden die',
      'Der bisherige Art. 31 wird Art. 35 und i',
    ]);
  });

  it('rückwärts ohne Entscheidung: Befund `relabel-form-ambiguous` an den Abschnitten', () => {
    const reversal = reverseAmendment(portal.body, block, '', titleState({ ...portal.law, body: portal.body }));
    expect(reversal.failures).toMatchObject([{ state: 'ambiguous-target', reason: 'reverse-relabel-form-ambiguous' }]);
    expect(reversal.failures[0]!.detail).toMatch(/Abschnitt II/u);
  });

  it('rückwärts mit Entscheidung: 15 Schritte, Vorwärtsprobe byteidentisch, Bezeichnungen wie das Gesetz sie nennt', () => {
    const title = titleState({ ...portal.law, body: portal.body });
    const reversal = reverseAmendment(portal.body, block, '', title, { labelForms: labelFormsFor(decisions, 'BayGDVG', 'GVBl. 2024 S. 630') });
    expect(reversal.failures).toEqual([]);
    expect(reversal.steps).toHaveLength(15);
    const before = reversal.before!;
    expect(before.filter((entry) => entry.type === 'part').map((entry) => entry.label)).toEqual(['Erster Teil', 'Zweiter Teil', 'Dritter Teil', 'Vierter Teil']);
    const second = before.find((entry) => entry.label === 'Zweiter Teil')!;
    expect(second.children!.map((entry) => [entry.type, entry.label])).toEqual([['section', 'Abschnitt I'], ['section', 'Abschnitt II']]);
    const fourth = before.find((entry) => entry.label === 'Vierter Teil')!;
    expect(fourth.children!.map((entry) => entry.label)).toEqual(['Art. 27', 'Art. 28', 'Art. 29', 'Art. 30', 'Art. 31']);
    expect(fourth.children!.at(-1)!.title).toBe('In-Kraft-Treten');
    expect(reversal.steps.filter((step) => step.reviewDecision).map((step) => step.operation)).toMatchObject([{ from: 'Abschnitt I', to: 'Kapitel 1' }, { from: 'Abschnitt II', to: 'Kapitel 2' }]);
    expect(stableStringify(forwardLawSteps({ body: before, title: reversal.titleBefore ?? title }, reversal.steps).body)).toBe(stableStringify(portal.body));
  });

  it('vorwärts auf den Stand vor der Änderung: ganzer Teil 4 als Zitat neben Teil 3, Abschnitte werden Kapitel', () => {
    const article = (n: number, title: string, text: string): NormBodyBlock => ({ type: 'article', label: `Art. ${n}`, title, children: [{ type: 'paragraphText', text }] }) as NormBodyBlock;
    const body = [
      { type: 'paragraphText', text: 'Der Landtag des Freistaates Bayern hat das folgende Gesetz beschlossen, das hiermit bekannt gemacht wird:' },
      { type: 'part', label: 'Erster Teil', title: 'Allgemeine Vorschriften', children: [article(1, 'Ziele', 'Eins.'), { type: 'article', label: 'Art. 6', title: 'Zusammenwirken', children: [{ type: 'subparagraph', label: '(4)', text: 'Die Behörden wirken zusammen; Art. 28 gilt entsprechend.' }] }] },
      { type: 'part', label: 'Zweiter Teil', title: 'Aufgaben', children: [
        { type: 'section', label: 'Abschnitt I', title: 'Allgemeine Aufgaben', children: [article(8, 'Aufgaben', 'Acht.')] },
        { type: 'section', label: 'Abschnitt II', title: 'Überwachung', children: [{ type: 'article', label: 'Art. 21', title: 'Überwachung', children: [{ type: 'subparagraph', label: '(2)', text: '¹Satz eins. ²Es gilt Art. 28.' }] }] },
      ] },
      { type: 'part', label: 'Dritter Teil', title: 'Datenschutz', children: [article(24, 'Datenschutz', 'Vierundzwanzig.'), article(26, 'Mitteilungen', 'Sechsundzwanzig.')] },
      { type: 'part', label: 'Vierter Teil', title: 'Übergangs- und Schlussvorschriften', children: [article(27, 'Einschränkung von Grundrechten', 'A.'), article(28, 'Verordnungsermächtigungen', 'B.'), article(29, 'Übergangsvorschriften', 'C.'), article(30, 'Beihilferechtlicher Genehmigungsvorbehalt', 'D.'), article(31, 'In-Kraft-Treten', 'E.')] },
    ] as NormBodyBlock[];
    const result = forwardAmendment(body, block, 'GVBl', 'GVBl. 2024 S. 630');
    expect(result.commands).toBe(10);
    expect(result.body.filter((entry) => entry.type === 'part').map((entry) => [entry.label, entry.title])).toEqual([['Teil 1', 'Allgemeine Vorschriften'], ['Teil 2', 'Aufgaben'], ['Teil 3', 'Datenschutz'], ['Teil 4', 'Landtierarztquote'], ['Teil 5', 'Übergangs- und Schlussvorschriften']]);
    expect(result.body[2]!.children!.map((entry) => [entry.type, entry.label])).toEqual([['chapter', 'Kapitel 1'], ['chapter', 'Kapitel 2']]);
    expect(result.body[4]!.children!.map((entry) => entry.label)).toEqual(['Art. 27', 'Art. 28', 'Art. 29', 'Art. 30']);
    expect(result.body[5]!.children!.map((entry) => entry.label)).toEqual(['Art. 31', 'Art. 32', 'Art. 33', 'Art. 34', 'Art. 35']);
    expect(result.body[5]!.children!.at(-1)!.title).toBe('Inkrafttreten');
    expect(result.body[1]!.children![1]!.children![0]!.text).toBe('Die Behörden wirken zusammen; Art. 32 gilt entsprechend.');
  });
});
