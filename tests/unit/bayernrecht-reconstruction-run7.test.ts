/**
 * Rückrechnung, Lauf 7: Alttext aus der Stammverkündung (`forward-from-publication`).
 *
 * Neufassungen, Aufhebungen und Streichungen ohne Anker tragen den bisherigen Wortlaut nicht im Befehl. Liegt die
 * Stammverkündung digital und amtlich vor, stammt er von dort: Die Rücknahme setzt ihn ein (`replace-text`,
 * `replace-blocks`), das Forward-Replay ergibt exakt den heutigen Portalkörper, und der ganze Stichtagskörper stimmt im
 * Wortlaut mit der Stammverkündung überein – bei Änderungen vor dem Stichtag erst nach deren Rücknahme bis zur
 * Stammfassung. Alle Fälle an echten Seiten: Portalpaket geparst (`portal-*-full.json`, `portal-*-excerpt.json`),
 * Stammverkündung und Änderungen als Textkörper der Verkündungsplattform (`verkuendung-*-stamm.html`, `…-excerpt.html`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { applyReverseRecipeToLaw, forwardLawSteps, verifyRoundTripLaw } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { ownCommencement } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { isParsedDeletion, parseCommand, repairCommandVerb } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, joinLocation, parseLocation } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { nestLaw, proveRestoration, publicationBaseFromHtml, type PriorAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/publication.ts';
import { bodyFingerprint, recipeProblems, RECIPE_SCHEMA, stableStringify, WHITESPACE_NORMALIZATION, type ReconstructionRecipe } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { CONVENTION_MIN_NORMS, deletionRequest, formConventions, realizeRestore, restoreRequest, TYPOGRAPHY_NORMALIZATION, wordingAgreement, type PublicationBase } from '@landesrecht/importer-bayernrecht/reconstruction/restore.ts';
import { reverseAmendment, type AmendmentReversal } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural, realize, structuralBackward, structuralForward } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { commandBlock, commandBlocks, isBlockFailure, type CommandBlock, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { titleState, type RecipeTitle } from '@landesrecht/importer-bayernrecht/reconstruction/title.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');

interface PortalFixture {
  documentId: string;
  identity: NormIdentity;
  inForceFrom: string;
  law: { title: string; shortTitle?: string; abbr?: string };
  body: NormBodyBlock[];
}
const portal = (name: string): PortalFixture => JSON.parse(readFileSync(join(FIXTURES, `portal-${name}.json`), 'utf8')) as PortalFixture;
const page = (name: string): string => readFileSync(join(FIXTURES, `verkuendung-${name}.html`), 'utf8');
const lawOf = (fixture: PortalFixture) => ({ ...fixture.law, body: fixture.body });

function stamm(name: string, organ: 'GVBl' | 'BayMBl', citation: string): PublicationBase {
  const loaded = publicationBaseFromHtml(page(name), { organ, citation, url: `https://www.verkuendung-bayern.de/${name}`, sha256: '0'.repeat(64), authority: organ === 'GVBl' ? 'printed-official' : 'electronic-official', representation: 'test' });
  if (!loaded.ok) throw new Error(loaded.detail);
  return loaded.base;
}
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazetteUnits(page(name)), identity);
  if (isBlockFailure(block)) throw new Error(`${name}: ${block.detail}`);
  return block;
};

/** Rücknahme mehrerer Änderungen (jüngste zuerst) mit Wiederherstellung; je Änderung Forward-Replay. */
function reverseAll(fixture: PortalFixture, pages: readonly string[], base: PublicationBase, fallback = true): { body: NormBodyBlock[]; title: RecipeTitle; reversals: AmendmentReversal[] } {
  let body = fixture.body;
  let title = titleState(lawOf(fixture));
  const reversals: AmendmentReversal[] = [];
  for (const [index, name] of pages.entries()) {
    const reversal = reverseAmendment(body, blockOf(name, fixture.identity), pages.length > 1 ? `a${index + 1}-` : '', title, { base, fallback });
    expect(reversal.failures).toEqual([]);
    const forward = forwardLawSteps({ body: reversal.before!, title: reversal.titleBefore ?? title }, reversal.steps);
    expect(stableStringify(forward.body)).toBe(stableStringify(body));
    reversals.push(reversal);
    body = reversal.before!;
    if (reversal.titleBefore) title = reversal.titleBefore;
  }
  return { body, title, reversals };
}

const restoredOf = (reversals: readonly AmendmentReversal[]): string[] => reversals.flatMap((reversal) => reversal.steps.filter((step) => step.restoredFrom !== undefined).map((step) => `${step.formula} ${step.operation.kind} ${step.location}`));

/* ----------------------------------------------------------------------------- Operationen */

describe('Operationen mit wiederhergestelltem Alttext', () => {
  it('replace-text und replace-blocks: vorwärts nur auf dem belegten Stand, rückwärts nur auf dem heutigen', () => {
    const body: NormBodyBlock[] = [{ type: 'section', label: '1.', children: [{ type: 'paragraphText', text: 'neu' }] }];
    const text = { kind: 'replace-text' as const, path: [0, 0], key: 'text' as const, before: 'alt', after: 'neu' };
    const back = structuredClone(body);
    structuralBackward(back, undefined, text, 't');
    expect(back[0]!.children![0]!.text).toBe('alt');
    structuralForward(back, undefined, text, 't');
    expect(back).toEqual(body);
    expect(() => structuralBackward(structuredClone(back).map((block) => ({ ...block, children: [{ type: 'paragraphText', text: 'anders' }] })), undefined, text, 't')).toThrow(/nicht der belegte Wortlaut/u);
    const blocks = { kind: 'replace-blocks' as const, parent: [], index: 0, before: [{ type: 'section', label: '1.', title: 'alt' } as NormBodyBlock], after: [] as NormBodyBlock[] };
    const empty: NormBodyBlock[] = [];
    structuralBackward(empty, undefined, blocks, 't');
    expect(empty).toEqual(blocks.before);
    structuralForward(empty, undefined, blocks, 't');
    expect(empty).toEqual([]);
  });
});

/* ------------------------------------------------------------------ Stammfassung am Stichtag */

describe('Stammfassung am Stichtag: Alttext aus der Stammverkündung', () => {
  it('Neufassung eines Satzes: das Feld der Verkündung, aus dem durch Ersetzen des Satzes zeichengleich das heutige wird (BayMBl. 2026 Nr. 129 ← 2022 Nr. 216)', () => {
    const fixture = portal('BayVV_2032_3_K_12914-full');
    const base = stamm('baymbl-2022-216-stamm', 'BayMBl', 'BayMBl. 2022 Nr. 216');
    const { body, reversals } = reverseAll(fixture, ['baymbl-2026-129'], base);
    expect(restoredOf(reversals)).toEqual(['recast replace-text Nr. 5 Satz 3']);
    expect(reversals[0]!.steps.find((step) => step.restoredFrom)!.restoredFrom).toBe('BayMBl. 2022 Nr. 216');
    const agreement = wordingAgreement(body, base);
    expect(agreement).toMatchObject({ ok: true, characters: 2236 });
    // Grundregel ohne Überschrift „Inkrafttreten“: „4. ¹Diese Bekanntmachung tritt am 6. April 2022 in Kraft.“
    expect(ownCommencement(body, '2023-12-01')).toMatchObject({ ok: true, date: '2022-04-06' });
    // Ohne Stammverkündung bleibt die Neufassung nicht umkehrbar.
    expect(reverseAmendment(fixture.body, blockOf('baymbl-2026-129', fixture.identity)).failures[0]).toMatchObject({ state: 'non-invertible-amendment', reason: 'recast' });
  });

  it('Neufassung ganzer Glieder in Portalgestalt nach den Geschwistern; die Unterschrift als Absatz der Verkündung ist kein Unterschied (BayMBl. 2024 Nr. 139 ← 2022 Nr. 325)', () => {
    const fixture = portal('BayVV_1142_S_13045-full');
    const base = stamm('baymbl-2022-325-stamm', 'BayMBl', 'BayMBl. 2022 Nr. 325');
    const { body, reversals } = reverseAll(fixture, ['baymbl-2024-139'], base);
    expect(restoredOf(reversals)).toEqual(['recast replace-blocks Nr. 3.5, Nr. 3.6', 'recast replace-blocks Nr. 1.2 (ganzes Glied aus der Stammverkündung)']);
    // Verkündung „item [1.2] Text“ → Portal „subsection [1.2] > paragraphText“, wie bei den Geschwistern 1.1 und 1.3.
    const restored = reversals[0]!.steps.at(-1)!.operation as { kind: 'replace-blocks'; before: NormBodyBlock[] };
    expect(restored.before[0]).toMatchObject({ type: 'subsection', label: '1.2', children: [{ type: 'paragraphText' }] });
    const agreement = wordingAgreement(body, base);
    expect(agreement.ok).toBe(true);
    expect(agreement.detail).toMatch(/Unterschrift als Absatz/u);
  });

  it('Aufhebung einer Nummer eines Gesetzes (GVBl. 2026 S. 75 § 51 ← 2011 S. 304): Gliederung des GVBl. wie im Portal, Nummer aus der Verkündung', () => {
    const fixture = portal('BayKJG-full');
    const base = stamm('gvbl-2011-304-stamm', 'GVBl', 'GVBl. 2011 S. 304');
    const { body, reversals } = reverseAll(fixture, ['gvbl-2026-75-excerpt'], base);
    expect(restoredOf(reversals)).toEqual(['repeal-unit replace-blocks Art. 4 Nr. 1']);
    expect(reversals[0]!.steps.map((step) => step.formula)).toEqual(['repeal-unit', 'relabel', 'relabel', 'relabel']);
    expect(wordingAgreement(body, base).ok).toBe(true);
    expect(ownCommencement(body, '2023-12-01')).toMatchObject({ ok: true, date: '2011-08-01' });
  });

  it('Rückfall: ein nicht lesbarer Befehl ersetzt das ganze Glied aus der Stammverkündung (GVBl. 2025 S. 461, § 2 und § 6 der eAktV ArbSozG)', () => {
    const fixture = portal('BayeAktVArbSozG-full');
    const base = stamm('gvbl-2023-190-stamm', 'GVBl', 'GVBl. 2023 S. 190');
    const { body, reversals } = reverseAll(fixture, ['gvbl-2026-75-excerpt', 'gvbl-2025-461'], base);
    expect(restoredOf(reversals)).toEqual(['recast replace-blocks § 4 Abs. 2', 'recast replace-blocks § 2', 'recast replace-blocks § 6 (ganzes Glied aus der Stammverkündung)']);
    expect(wordingAgreement(body, base).ok).toBe(true);
    // Ohne Rückfall scheitert die ältere Änderung.
    const newer = reverseAmendment(fixture.body, blockOf('gvbl-2026-75-excerpt', fixture.identity), 'a1-', titleState(lawOf(fixture)), { base });
    expect(reverseAmendment(newer.before!, blockOf('gvbl-2025-461', fixture.identity), 'a2-', titleState(lawOf(fixture)), { base }).failures).not.toEqual([]);
  });

  it('der Stichtagskörper muss im ganzen Wortlaut der Stammverkündung gleichen – ein Wort Unterschied, und es gibt kein Rezept', () => {
    const fixture = portal('BayKJG-full');
    const base = stamm('gvbl-2011-304-stamm', 'GVBl', 'GVBl. 2011 S. 304');
    const { body } = reverseAll(fixture, ['gvbl-2026-75-excerpt'], base);
    const altered = structuredClone(base);
    const edit = (blocks: NormBodyBlock[]): boolean => blocks.some((block) => (typeof block.text === 'string' && block.text.includes('Kinder') ? ((block.text = block.text.replace('Kinder', 'Kindes')), true) : edit(block.children ?? [])));
    expect(edit(altered.body)).toBe(true);
    const agreement = wordingAgreement(body, altered);
    expect(agreement.ok).toBe(false);
    expect(agreement.detail).toMatch(/weichen ab Zeichen/u);
    expect(TYPOGRAPHY_NORMALIZATION).toMatch(/Anführungszeichen/u);
  });
});

/* ----------------------------------------------------------------- Änderungen vor dem Stichtag */

describe('Änderungen vor dem Stichtag: Probe bis zur Stammfassung', () => {
  it('ZEPRV: Neufassung von § 4 Abs. 3 Satz 5 (GVBl. 2026 S. 75), davor GVBl. 2015 S. 243 („die Worte“), Stammverkündung GVBl. 2013 S. 468', () => {
    const fixture = portal('BayZEPRV-full');
    const base = stamm('gvbl-2013-468-stamm', 'GVBl', 'GVBl. 2013 S. 468');
    const { body, title, reversals } = reverseAll(fixture, ['gvbl-2026-75-excerpt'], base);
    expect(restoredOf(reversals)).toEqual(['recast replace-text § 4 Abs. 3 Satz 5']);
    // Der Stichtagskörper enthält die Änderung von 2015 – er gleicht der Stammverkündung nicht direkt …
    expect(wordingAgreement(body, base).ok).toBe(false);
    // … wohl aber nach Rücknahme der Änderung von 2015 („werden die Worte „Statistik und Datenverarbeitung“ durch die Worte …“).
    const [block] = commandBlocks(gazetteUnits(page('gvbl-2015-243')), fixture.identity).blocks;
    const prior: PriorAmendment[] = [{ label: 'GVBl. 2015 S. 243 (§ 2)', block: block!, url: 'https://www.verkuendung-bayern.de/gvbl/2015-243/', sha256: '0'.repeat(64), authority: 'printed-official', representation: 'test' }];
    const proof = proveRestoration(body, title, prior, base);
    expect(proof).toMatchObject({ ok: true, prior: [{ citation: 'GVBl. 2015 S. 243 (§ 2)', steps: 1 }] });
    expect(proof.ok && proof.agreement.detail).toMatch(/Wortlaut gleich \(5282 Zeichen/u);
    // Ohne die Änderung vor dem Stichtag scheitert die Probe.
    expect(proveRestoration(body, title, [], base)).toMatchObject({ ok: false, reason: 'restoration-disagrees' });
  });

  it('Rezept mit Wiederherstellung: Beleg `restoration` Pflicht; ohne Zusicherung der geprüften Quellen lehnen die Anwendungsfunktionen ab', () => {
    const fixture = portal('BayKJG-full');
    const base = stamm('gvbl-2011-304-stamm', 'GVBl', 'GVBl. 2011 S. 304');
    const { body, reversals } = reverseAll(fixture, ['gvbl-2026-75-excerpt'], base);
    const agreement = wordingAgreement(body, base);
    const recipe: ReconstructionRecipe = {
      schemaVersion: RECIPE_SCHEMA,
      documentId: fixture.documentId,
      baselineDate: '2023-12-01',
      method: 'reverse-amendment',
      source: { url: 'https://www.gesetze-bayern.de/Content/Zip/BayKJG', sha256: '0'.repeat(64), parserVersion: 'test', inForceFrom: fixture.inForceFrom },
      amendment: { eventId: 'test', citation: 'GVBl. 2026 S. 75', organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'test', url: 'https://www.verkuendung-bayern.de/gvbl/2026-75/', sha256: '1'.repeat(64), eventDate: '2026-03-31', effectiveDate: fixture.inForceFrom, effectiveDateEvidence: ['(Test)'], intro: '(Test)' },
      baselineTextInForce: { date: '2011-08-01', evidence: ['(Test)'] },
      chain: [],
      steps: reversals[0]!.steps,
      restoration: { method: 'forward-from-publication', sources: base.sources, converter: base.converter, pageTextSha256: base.pageTextSha256, publicationFingerprint: bodyFingerprint(base.body), agreement: { normalization: TYPOGRAPHY_NORMALIZATION, characters: agreement.characters, detail: agreement.detail }, restoredSteps: 1 },
      whitespace: WHITESPACE_NORMALIZATION,
      expected: { currentFingerprint: bodyFingerprint(fixture.body), baselineFingerprint: bodyFingerprint(body) },
    };
    expect(recipeProblems(recipe)).toEqual([]);
    const law = lawOf(fixture);
    expect(verifyRoundTripLaw(law, recipe)).toMatchObject({ ok: false });
    expect(verifyRoundTripLaw(law, recipe).detail).toMatch(/restorationChecked/u);
    expect(() => applyReverseRecipeToLaw(law, recipe)).toThrow(/restorationChecked/u);
    expect(verifyRoundTripLaw(law, recipe, { restorationChecked: true })).toMatchObject({ ok: true });
    expect(bodyFingerprint(applyReverseRecipeToLaw(law, recipe, { restorationChecked: true }).body)).toBe(bodyFingerprint(body));
    const { restoration: _omitted, ...bare } = recipe;
    expect(recipeProblems(bare as ReconstructionRecipe)).toContain('Schritte mit Alttext aus den Verkündungen ohne Beleg (restoration)');
  });
});

/* ------------------------------------------------------------------------- Einzelne Stellen */

describe('Stelle des Alttexts', () => {
  it('Streichung ohne Anker in einem Feld mit weiteren Änderungen: Stelle über den umgebenden Wortlaut der Verkündung (GVBl. 2026 S. 146 § 2 Nr. 1 bbb, VertrV)', () => {
    const fixture = portal('BayVertrV-excerpt');
    const base = stamm('gvbl-2021-610-stamm-excerpt', 'GVBl', 'GVBl. 2021 S. 610');
    const block = blockOf('gvbl-2026-146-excerpt', fixture.identity);
    const leaf = block.commands[0]!.children.find((node) => node.label === 'b)')!.children.find((node) => node.label === 'bb)')!.children.find((node) => node.label === 'bbb)')!;
    expect(leaf.text).toBe('Die Angabe „Buchst. b“ wird gestrichen.');
    const parsed = parseCommand(leaf.text, parseLocation('§ 2 Abs. 2 Nr. 1')!);
    expect(parsed.operations).toBeUndefined();
    const deletion = parsed.restorable!.find(isParsedDeletion)!;
    const [step] = realizeRestore(fixture.body, base, deletionRequest(deletion), 'bbb)');
    // Heute „Dienststelle Landshut“ (Befehl aaa derselben Änderung), in der Verkündung eine andere Dienststelle: Das ganze
    // Feld gleicht nicht; die Stelle ergibt sich aus dem umgebenden Wortlaut „… Nr. 2 Buchst. b der Verordnung …“.
    expect(step!.location).toMatch(/Stelle nach dem umgebenden Wortlaut/u);
    const operation = step!.operation as { before: string; after: string };
    expect(operation.after).toContain('Dienststelle Landshut – gemäß § 1 Abs. 5 Satz 1 Nr. 2 der Verordnung');
    expect(operation.before).toBe(operation.after.replace('Satz 1 Nr. 2 der Verordnung', 'Satz 1 Nr. 2 Buchst. b der Verordnung'));
  });

  it('liest Neufassung und Aufhebung von Sätzen und Gliedern', () => {
    expect(restoreRequest('Nr. 5.2 Satz 4 wird wie folgt gefasst:', [], [{ index: 0, tag: 'dd', className: '', text: '„⁴Neu.“', heading: false }], 'recast')).toMatchObject({ kind: 'recast-sentences', sentences: [4], text: '⁴Neu.' });
    expect(restoreRequest('In Nr. 3 werden die Sätze 1 und 2 wie folgt gefasst:', [], [{ index: 0, tag: 'dd', className: '', text: '„¹A. ²B.“', heading: false }], 'recast')).toMatchObject({ kind: 'recast-sentences', location: 'Nr. 3 Sätze 1, 2' });
    expect(restoreRequest('Die Sätze 3 und 7 werden aufgehoben.', [parseLocation('Nr. 1.4')![0]!], [], 'repeal-unit')).toMatchObject({ kind: 'repeal-sentences', sentences: [3, 7] });
    expect(restoreRequest('Die Abs. 3 bis 5 werden aufgehoben.', [parseLocation('§ 4')![0]!], [], 'repeal-unit')).toMatchObject({ kind: 'repeal-blocks', location: '§ 4 Abs. 3, Abs. 4, Abs. 5' });
    expect(restoreRequest('Die Einleitungsformel wird wie folgt gefasst:', [], [{ index: 0, tag: 'p', className: '', text: '„Neu“', heading: false }], 'recast')).toMatchObject({ kind: 'recast-vorspann' });
    expect(restoreRequest('Nr. 3 wird wie folgt gefasst:', [], [], 'recast')).toMatchObject({ error: 'Neufassung ohne lesbares Zitat' });
  });
});

/* ---------------------------------------------------------------- Stammverkündung umsetzen */

describe('Stammverkündung in der Gliederung des Portals', () => {
  it('GVBl.: § und Art. mit Überschrift, Absätze „(n)“ als Bezeichnung, Aufzählungen mit Ebene; ältere Seiten mit der Überschrift in zwei Absätzen (GVBl. 2010 S. 777)', () => {
    const base = stamm('gvbl-2010-777-stamm', 'GVBl', 'GVBl. 2010 S. 777');
    expect(base.publishedAt).toBe('2010-12-17');
    const [preamble, first, second] = base.body;
    expect(preamble).toMatchObject({ type: 'paragraphText' });
    expect(first).toMatchObject({ type: 'paragraph', label: '§ 1', title: 'Anwendungszweck' });
    expect(second).toMatchObject({ type: 'paragraph', label: '§ 2', title: 'Zulassungsbereiche' });
    expect(second!.children![0]).toMatchObject({ type: 'subparagraph', label: '(1)' });
    expect(second!.children![0]!.children![0]).toMatchObject({ type: 'item', label: '1.', level: 1 });
    expect(nestLaw([{ type: 'paragraphText', text: '§ 3' }, { type: 'paragraphText', text: 'Titel' }, { type: 'paragraphText', text: '(1) Text.' }, { type: 'item', label: 'a)', text: 'x' }])).toEqual([
      { type: 'paragraph', label: '§ 3', title: 'Titel', children: [{ type: 'subparagraph', label: '(1)', text: 'Text.', children: [{ type: 'item', label: 'a)', text: 'x', level: 1 }] }] },
    ]);
  });

  it('relative Grundregel der Stammfassung nur mit dem Verkündungsdatum, das die Stammverkündung selbst druckt', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 5', title: 'Inkrafttreten', children: [{ type: 'paragraphText', text: 'Diese Bekanntmachung tritt am Tag nach der Verkündung in Kraft.' }] }];
    expect(ownCommencement(body, '2023-12-01')).toMatchObject({ ok: false });
    expect(ownCommencement(body, '2023-12-01', { publishedAt: '2022-05-31', url: 'https://www.verkuendung-bayern.de/baymbl/2022-325/' })).toMatchObject({ ok: true, date: '2022-06-01' });
  });
});

/* ------------------------------------------------------- Befehlsformen (übernommen aus baseline-only) */

describe('Befehlsformen, die Agent B in baseline-only abfing – jetzt in parseCommand/parseLocation', () => {
  it('Bereiche dezimaler Nummern und Buchstaben („Nrn. 1.17 bis 1.20“, BayMBl. 2022 Nr. 395)', () => {
    expect(parseLocation('Nrn. 1.17 bis 1.20')!.map(formatPath)).toEqual(['Nr. 1.17', 'Nr. 1.18', 'Nr. 1.19', 'Nr. 1.20']);
    expect(parseLocation('Buchst. c bis e')!.map(formatPath)).toEqual(['Buchst. c', 'Buchst. d', 'Buchst. e']);
    expect(parseLocation('Abs. 3 bis 5')!.map(formatPath)).toEqual(['Abs. 3', 'Abs. 4', 'Abs. 5']);
  });

  it('der zweite Satz behält das Glied („In Nr. 5.3 Satz 1 und Satz 2 wird jeweils …“, BayMBl. 2019 Nr. 423)', () => {
    expect(parseLocation('Nr. 5.3 Satz 1 und Satz 2')!.map(formatPath)).toEqual(['Nr. 5.3 Satz 1', 'Nr. 5.3 Satz 2']);
    expect(parseLocation('§ 2 Abs. 2 Satz 1 und 3')!.map(formatPath)).toEqual(['§ 2 Abs. 2 Satz 1', '§ 2 Abs. 2 Satz 3']);
  });

  it('wiederholtes Glied im Unterbefehl („Nr. 7 wird wie folgt geändert:“ – „In Nr. 7 Satz 1 …“) und „Dreifachbuchst.“', () => {
    expect(formatPath(joinLocation(parseLocation('Nr. 7')!, parseLocation('Nr. 7 Satz 1')![0]!))).toBe('Nr. 7 Satz 1');
    const parsed = parseCommand('In Nr. 7 Satz 1 wird das Wort „alt“ durch das Wort „neu“ ersetzt.', parseLocation('Nr. 7')!);
    expect(parsed.operations!.map((operation) => operation.locations.map(formatPath))).toEqual([['Nr. 7 Satz 1']]);
    expect(parseLocation('Nr. 3 Buchst. f Doppelbuchst. cc Dreifachbuchst. ccc')!.map(formatPath)).toEqual(['Nr. 3 Buchst. f Doppelbuchst. cc Dreifachbuchst. ccc']);
  });

  it('„wir angefügt“ (BayMBl. 2023 Nr. 327) ist „wird angefügt“ – außerhalb von Zitaten', () => {
    expect(repairCommandVerb('Folgende Nr. 1.34.2 wir angefügt:')).toBe('Folgende Nr. 1.34.2 wird angefügt:');
    expect(repairCommandVerb('Die Angabe „wir angefügt“ wird gestrichen.')).toBe('Die Angabe „wir angefügt“ wird gestrichen.');
  });

  it('„die Worte“ (GVBl. 2015 S. 243) und „der Klammerzusatz“ (BayMBl. 2019 Nr. 423) wie „die Wörter“ bzw. „die Angabe“', () => {
    expect(parseCommand('In § 3 Abs. 1 Satz 1 werden die Worte „Statistik und Datenverarbeitung“ durch die Worte „Digitalisierung, Breitband und Vermessung“ ersetzt.', []).operations![0]).toMatchObject({ formula: 'replace-words', operation: { kind: 'replace', from: 'Statistik und Datenverarbeitung' } });
    expect(parseCommand('In Nr. 2 wird der Klammerzusatz „(A)“ durch den Klammerzusatz „(B)“ ersetzt.', []).operations![0]).toMatchObject({ formula: 'replace-words' });
    expect(parseCommand('In Nr. 2 wird nach den Worten „alt“ das Wort „neu“ eingefügt.', []).operations![0]).toMatchObject({ formula: 'insert-words' });
  });

  it('Anfügen „am Ende“ und mit dem Objekt vor dem Verb („Die Wörter „…“ werden angefügt.“, BayMBl. 2023 Nr. 149)', () => {
    expect(parseCommand('In Nr. 5 werden am Ende die Wörter „und X“ angefügt.', []).operations![0]).toMatchObject({ formula: 'append-words', operation: { kind: 'append', text: 'und X' } });
    expect(parseCommand('Die Wörter „genauere Regelungen werden durch KMS getroffen;“ werden angefügt.', parseLocation('Nr. 4')!).operations![0]).toMatchObject({ formula: 'append-words' });
  });
});

/* ------------------------------------------------------------------- Befehlsblock einer Liste */

describe('Befehlsblock als Glied einer Liste (Anpassungsverordnung)', () => {
  it('„100. Die Verordnung … wird wie folgt geändert:“ – „a) …“ ist die erste Befehlsebene (GVBl. 2014 S. 286, § 1 Nr. 100)', () => {
    const identity: NormIdentity = { documentId: 'BayFachVVI', title: 'Verordnung über den fachlichen Schwerpunkt Verwaltungsinformatik', abbreviations: ['FachV-VI'], bayRsNumber: '2038-3-1-6-F', documentDate: '2012-04-24', versionDate: '2012-04-24', references: ['GVBl. 2012 S. 159'] };
    const block = commandBlock(gazetteUnits(page('gvbl-2014-286-excerpt')), identity);
    expect(isBlockFailure(block)).toBe(false);
    expect((block as CommandBlock).commands.map((command) => `${command.label} ${command.depth}`)).toEqual(['a) 1', 'b) 1']);
  });
});

/* ============================================================== Lauf 7, zweiter Teil: Reichweite */

describe('Portalgestalt wiederhergestellter Glieder aus der ganzen Norm und aus den Konventionen des Amtsblatts', () => {
  const pairs: Array<[string, string, string]> = [
    ['BayKJG-full', 'gvbl-2011-304-stamm', 'GVBl. 2011 S. 304'],
    ['BayZEPRV-full', 'gvbl-2013-468-stamm', 'GVBl. 2013 S. 468'],
    ['BayeAktVArbSozG-full', 'gvbl-2023-190-stamm', 'GVBl. 2023 S. 190'],
    ['BayVertrV-excerpt', 'gvbl-2021-610-stamm-excerpt', 'GVBl. 2021 S. 610'],
  ];
  const samples = (): PublicationBase[] => pairs.map(([name, publication, citation]) => ({ ...stamm(publication, 'GVBl', citation), portal: portal(name).body }));

  it('Konvention: eine Darstellung je Knotenart und Amtsblatt, in mindestens so vielen Normen wie verlangt', () => {
    // Im Lauf verlangt: 5 Normen (die Schlange trägt die Aufzählung unter einem Absatz in 44 GVBl.-Normen); hier vier echte Paare.
    expect(CONVENTION_MIN_NORMS).toBe(5);
    expect(formConventions(samples()).size).toBe(0);
    const conventions = formConventions(samples(), 2);
    // Lauf 8: Knotenart mit Art des Texts (satzartig/überschriftartig) und zwei gröberen Stufen („*“).
    expect(conventions.get('GVBl.|subparagraph>item|label+text|{"level":1}|dezimal1|satz')).toEqual({ value: '{"form":{"level":1,"type":"item"},"handling":"same"}', norms: 2 });
    expect(conventions.get('GVBl.|subparagraph>item|label+text|{"level":1}|*|*')?.value).toBe('{"form":{"level":1,"type":"item"},"handling":"same"}');
    expect(conventions.get('GVBl.|paragraph>subparagraph|label+text|{}|absatz|satz')?.value).toBe('{"form":{"type":"subparagraph"},"handling":"same"}');
  });

  it('TNAV (GVBl. 2025 S. 545 ← 2020 S. 710): § 4 Abs. 1 ganz aus der Stammverkündung – die Aufzählung im Absatz belegt die Norm selbst nicht, die Konvention schon', () => {
    const fixture = portal('BayTNAV-full');
    const base = { ...stamm('gvbl-2020-710-stamm', 'GVBl', 'GVBl. 2020 S. 710'), portal: fixture.body };
    const block = blockOf('gvbl-2025-545', fixture.identity);
    const without = reverseAmendment(fixture.body, block, '', titleState(lawOf(fixture)), { base, fallback: true });
    expect(without.failures).toMatchObject([{ reason: 'reverse-end-not-determined' }]);
    const { body, reversals } = reverseAll(fixture, ['gvbl-2025-545'], { ...base, conventions: formConventions(samples(), 2) });
    expect(reversals[0]!.steps.map((step) => `${step.formula} ${step.location}`)).toEqual([
      'number-sentences § 1',
      'insert-sentence § 1',
      'recast § 4 Abs. 2 Satz 3',
      'recast § 4 Abs. 1 (ganzes Glied aus der Stammverkündung) (Portalgestalt nach Konvention des Amtsblatts: subparagraph>item (2 Normen))',
    ]);
    expect(wordingAgreement(body, base)).toMatchObject({ ok: true, characters: 11009 });
  });
});

describe('Aufhebung mit Umnummerierung in derselben Änderung (BayMBl. 2026 Nr. 268 ← 2022 Nr. 652)', () => {
  it('„Nr. 8 wird aufgehoben. – Die bisherigen Nrn. 9 und 10 werden die Nrn. 8 und 9. – In der neuen Nr. 8 wird in Satz 1 …“', () => {
    const fixture = portal('BayVV_2174_A_13397-full');
    const base = { ...stamm('baymbl-2022-652-stamm', 'BayMBl', 'BayMBl. 2022 Nr. 652'), portal: fixture.body };
    const { body, reversals } = reverseAll(fixture, ['baymbl-2026-268'], base);
    const located = reversals[0]!.steps.map((step) => `${step.formula} ${step.operation.kind} ${step.location}`);
    // Die aufgehobene Nr. 8 steht in der Verkündung unter Abschnitt „8.“ – im heutigen Text trägt „Nr. 8“ die bisherige
    // Nr. 9: Das Eltern-Glied ergibt sich aus den Bezeichnungen der Vorfahren, die Stelle aus dem Nachbarglied Nr. 7.
    expect(located).toEqual(expect.arrayContaining(['repeal-unit replace-blocks Nr. 8', 'relabel relabel Nr. 9 → Nr. 8', 'relabel relabel Nr. 10 → Nr. 9', 'replace-words replace Nr. 8 Satz 1', 'replace-words replace Nr. 9']));
    expect(wordingAgreement(body, base)).toMatchObject({ ok: true, characters: 15201 });
  });
});

describe('Probe im Wortlaut: Satznummern und Trennstriche', () => {
  const base = (text: string): PublicationBase => ({ body: [{ type: 'paragraph', label: '§ 5', title: 'Aufnahmeantrag', children: [{ type: 'subparagraph', label: '(1)', text } as NormBodyBlock] } as NormBodyBlock], sources: [], converter: 'test', pageTextSha256: '0'.repeat(64), citation: 'GVBl. 2022 S. 553' });
  const body = (text: string): NormBodyBlock[] => base(text).body;

  it('das Portal setzt Satznummern, die die Verkündung nicht druckt (GVBl. 2022 S. 553, § 5 Abs. 1) – kein Unterschied im Wortlaut', () => {
    expect(wordingAgreement(body('¹Anträge auf Aufnahme sind zu stellen. ²Mehrfachbewerbungen sind unzulässig.'), base('Anträge auf Aufnahme sind zu stellen. Mehrfachbewerbungen sind unzulässig.')).ok).toBe(true);
    // Fußnotenzeichen („¹⁾“) sind keine Satznummern.
    expect(wordingAgreement(body('Anträge¹⁾ sind zu stellen.'), base('Anträge sind zu stellen.')).ok).toBe(false);
    expect(wordingAgreement(body('Die Frist beträgt 2 Wochen.'), base('Die Frist beträgt 3 Wochen.')).ok).toBe(false);
  });

  it('Trennstrich einer Zeilentrennung in der Verkündung („Lern- ergebnisse“, GVBl. 2018 S. 264) – nicht vor „und“, „oder“, „bzw.“', () => {
    expect(wordingAgreement(body('Die angestrebten Lernergebnisse sind klar formuliert.'), base('Die angestrebten Lern- ergebnisse sind klar formuliert.')).ok).toBe(true);
    expect(wordingAgreement(body('Lehrund Lernformen'), base('Lehr- und Lernformen')).ok).toBe(false);
    expect(wordingAgreement(body('Vorbzw. Nachname'), base('Vor- bzw. Nachname')).ok).toBe(false);
    // Ohne Leerzeichen ist der Bindestrich Wortlaut („System-akkreditierung“).
    expect(wordingAgreement(body('Systemakkreditierung'), base('System-akkreditierung')).ok).toBe(false);
  });
});

describe('Stammverkündung: Inhaltsübersicht und Kapitel (GVBl. 2019 S. 564, AgrSchO)', () => {
  it('die Inhaltsübersicht führt das Portal nicht – sie endet vor der Wiederholung ihres ersten Eintrags; „Kapitel“ ist `chapter`', () => {
    const base = stamm('gvbl-2019-564-excerpt', 'GVBl', 'GVBl. 2019 S. 564');
    expect(base.body.map((block) => `${block.type} ${block.label ?? ''}`.trim())).toEqual(['paragraphText', 'part Teil 1']);
    const part = base.body[1]!;
    expect(part.children![0]).toMatchObject({ type: 'chapter', label: 'Kapitel 1', title: 'Allgemeines' });
    expect(part.children![0]!.children!.map((block) => block.label)).toEqual(['§ 1', '§ 2']);
    expect(JSON.stringify(base.body)).not.toContain('Inhaltsübersicht');
  });
});

describe('Befehlsformen, Lauf 7 (zweiter Teil) – echte Befehle', () => {
  const describeParse = (text: string, context = ''): string => {
    const parsed = parseCommand(text, context ? parseLocation(context)! : []);
    const operations = (parsed.operations ?? []).map((operation) => `${operation.formula} ${operation.locations.map(formatPath).join('|')}`);
    const restorable = (parsed.restorable ?? []).map((item) => `${item.formula} ${isParsedDeletion(item) ? item.locations.map(formatPath).join('|') : ''}`.trim());
    return [...parsed.formulas, ...operations, ...restorable].join(' · ');
  };

  it('zweite Ortsangabe hinter dem Verb: „In der Präambel wird in Satz 1 die Angabe „…“ gestrichen.“', () => {
    expect(describeParse('In der Präambel wird in Satz 1 die Angabe „neunjährigen“ gestrichen.')).toBe('delete-words · delete-words Vorbemerkung Satz 1');
    expect(describeParse('In der Präambel werden in Satz 2 nach dem Wort „Förderung“ die Wörter „stellt eine Maßnahme dar und“ eingefügt.')).toBe('insert-words · insert-words Vorbemerkung Satz 2');
    // Nur, wenn beide Ortsangaben zusammen lesbar sind.
    expect(describeParse('In Anlage 5 wird in der Kopfzeile die Angabe „Jahrgangsstufen 3 und 4“ durch die Angabe „Jahrgangsstufe 3“ ersetzt.')).toMatch(/^unrecognized/u);
  });

  it('„In der neuen Nr. 8 …“ / „Im neuen Satz 4 …“ nach einer Umnummerierung derselben Änderung', () => {
    expect(describeParse('In der neuen Nr. 8 wird in Satz 1 die Angabe „2016/697“ durch die Angabe „2016/679“ ersetzt.')).toBe('replace-words · replace-words Nr. 8 Satz 1');
    expect(describeParse('Im neuen Satz 4 wird die Angabe „weiteren“ gestrichen.', 'Nr. 6.1')).toBe('delete-words · delete-words Nr. 6.1 Satz 4');
  });

  it('Aufhebung mit dem Glied zwischen Verb und Partizip; „gelöscht“; Schlusszeichen „am Ende des Satzes“', () => {
    expect(describeParse('In Spiegelstrich 5 wird Satz 3 aufgehoben.')).toBe('repeal-unit');
    expect(restoreRequest('In Spiegelstrich 5 wird Satz 3 aufgehoben.', [parseLocation('Nr. 1.3')![0]!], [], 'repeal-unit')).toMatchObject({ kind: 'repeal-sentences', location: 'Nr. 1.3 Spiegelstrich 5 Satz 3', sentences: [3] });
    expect(describeParse('In Satz 2 Buchstabe b) wird die Angabe „geändert durch Verordnung (EU) 2019/316 (De-minimis-Beihilfen Agrar),“ gelöscht.')).toBe('delete-words · delete-words Satz 2 Buchst. b');
    expect(repairCommandVerb('Die Angabe „wird gelöscht“ wird gestrichen.')).toBe('Die Angabe „wird gelöscht“ wird gestrichen.');
    expect(describeParse('Das Komma am Ende des Satzes wird durch einen Punkt ersetzt.', 'Nr. 2')).toBe('replace-final-punctuation · replace-final-punctuation Nr. 2');
  });

  it('Einfügen ohne Anker: die Nummer des neuen Glieds oder Satzes nennt die Stelle', () => {
    const quote = (text: string) => [{ index: 0, tag: 'p', className: '', text, heading: false }];
    expect(parseStructural('Es wird folgender neuer Satz 4 eingefügt:', parseLocation('Nr. 1.1')!, quote('„⁴Die Förderung ist nachrangig.“'))).toMatchObject({ formula: 'insert-sentence', templates: [{ kind: 'insert-sentence', after: 3, first: 4 }] });
    expect(parseStructural('In der Einleitung wird nach Satz 2 folgender Satz 3 angefügt:', [], quote('„³Neu.“'))).toMatchObject({ formula: 'insert-sentence', templates: [{ after: 2, first: 3 }] });
    expect(parseStructural('Es wird folgende neue Nr. 3.6 eingefügt:', [], quote('„3.6 Neu.“'))).toMatchObject({ formula: 'insert-block', templates: [{ kind: 'insert-blocks', targets: [{ kind: 'nummer', value: '3.6' }], append: false }] });
    // Ohne Nummer bleibt die Stelle offen.
    expect(parseStructural('Nach dem ersten Spiegelstrich wird folgender neuer Spiegelstrich eingefügt:', [], quote('„– Neu.“'))?.templates).toBeUndefined();
  });

  it('„In Nr. 3.2 wird die Satznummerierung „¹“ gestrichen.“ (BayMBl. 2024 Nr. 533): rückwärts erhält der Text vor der Aufzählung wieder ¹', () => {
    const fixture = portal('BayVV_7910_U_11781-full');
    const parsed = parseStructural('In Nr. 3.2 wird die Satznummerierung „¹“ gestrichen.', [], []);
    expect(parsed).toMatchObject({ formula: 'unnumber-sentences', templates: [{ kind: 'unnumber-sentences', context: [{ kind: 'nummer', value: '3.2' }] }] });
    const [step] = realize(fixture.body, parsed!.templates![0]!, '1.6', false);
    expect(step!.location).toBe('Nr. 3.2 (Text vor der Aufzählung)');
    const body = structuredClone(fixture.body);
    structuralBackward(body, step!.field, step!.operation, '1.6');
    expect(body[14]!.children![1]!.children![0]!.text).toBe('¹Nicht antragsberechtigt sind');
    structuralForward(body, step!.field, step!.operation, '1.6');
    expect(body).toEqual(fixture.body);
    // Mit weiterem Befehl am selben Ort, danach ausgeführt.
    expect(parseStructural('In Satz 1 wird die Satznummerierung „¹“ gestrichen und die Angabe „31. Dezember 2022“ durch die Angabe „31. Dezember 2025“ ersetzt.', parseLocation('Nr. 2.2')!, [])).toMatchObject({
      formula: 'unnumber-sentences',
      templates: [{ context: [{ kind: 'nummer', value: '2.2' }] }],
      followUp: { text: 'Die Angabe „31. Dezember 2022“ durch die Angabe „31. Dezember 2025“ ersetzt.' },
    });
  });
});
