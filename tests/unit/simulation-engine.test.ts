/**
 * Gate G8: Konsolidierungsengine je Operation mit Treffer 0/1/2, Hash- und Alttextabweichung, Wirkdatum –
 * Verhalten wie OstRecht (`scripts/lib/consolidation-engine.mjs`), fail closed.
 */
import { describe, expect, it } from 'vitest';

import { applyPatchRecipe, ConsolidationError, CONSOLIDATION_OPERATIONS, type ConsolidationOperation, type ConsolidationState, type RawBlock } from '@landesrecht/importer-simulation/engine/apply.ts';
import { canonicalJson, sha256 } from '@landesrecht/importer-simulation/engine/hash.ts';

const DATE = '2026-05-18';

function sub(label: string, text: string): RawBlock {
  return { type: 'subparagraph', label, text, children: [] };
}

function state(): ConsolidationState {
  return {
    title: 'Testgesetz',
    body: [
      { type: 'paragraph', label: '§ 1', title: 'Zweck', children: [sub('(1)', 'Erster Absatz.'), sub('(2)', 'Zweiter Absatz.')] },
      { type: 'paragraph', label: '§ 2', title: 'Begriffe', children: [sub('(1)', 'Begriff eins.'), sub('(2)', 'Begriff zwei.')] },
      { type: 'annex', label: 'Anlage 1', title: 'Tabelle', children: [{ type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', text: 'a' }] }] }] },
    ],
  };
}

function operation(partial: Partial<ConsolidationOperation> & { op: string }): ConsolidationOperation {
  return { expectedMatches: 1, source: 'west/simulation/abc.pdf', sourceProvision: 'Artikel 1 Nummer 1', effectiveDate: DATE, ...partial };
}

function apply(input: ConsolidationState, ...operations: ConsolidationOperation[]): ConsolidationState {
  return applyPatchRecipe(input, { amendmentAct: 'test-akt', effectiveDate: DATE, operations });
}

const paragraph1 = (): RawBlock => state().body[0]!;
const hashOf = (block: unknown): string => sha256(block);

describe('Konsolidierungsengine: Verträge und Anker', () => {
  it('kennt alle OstRecht-Operationen', () => {
    expect([...CONSOLIDATION_OPERATIONS].sort()).toEqual(['amendTable', 'appendAnnex', 'deleteProvision', 'designationReplacement', 'designationReplacementBody', 'insertParagraph', 'insertProvisionAfter', 'insertProvisionBefore', 'renameLaw', 'renameProvision', 'repealLaw', 'repealProvision', 'replaceBody', 'replaceHeading', 'replaceProvision', 'replaceSiblingRange', 'replaceText']);
    expect(sha256({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(sha256({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });

  it('bricht bei 0 und 2 Treffern ab, wendet bei genau einem Treffer an', () => {
    const replace = (label: string): ConsolidationOperation => operation({ op: 'replaceText', target: { type: 'subparagraph', label, parentLabel: '§ 1' }, expectedOld: 'Zweiter Absatz.', value: 'Neu.' });
    expect(() => apply(state(), replace('(3)'))).toThrow(/hat 0 statt genau einem Treffer/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(2)' }, expectedOld: 'Zweiter Absatz.', value: 'Neu.' }))).toThrow(/hat 2 statt genau einem Treffer/u);
    const result = apply(state(), replace('(2)'));
    expect(result.body[0]!.children![1]!.text).toBe('Neu.');
    expect(state().body[0]!.children![1]!.text).toBe('Zweiter Absatz.');
  });

  it('prüft Hash, Alttext, Wirkdatum und Pflichtfelder', () => {
    expect(() => apply(state(), operation({ op: 'replaceProvision', target: { type: 'paragraph', label: '§ 1' }, expectedHash: '0'.repeat(64), value: paragraph1() }))).toThrow(/Zielhash weicht ab/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentLabel: '§ 1' }, expectedOld: 'anders', value: 'Neu.' }))).toThrow(/erwarteter alter Wert in text wurde nicht gefunden/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentLabel: '§ 1' }, expectedOld: 'Erster Absatz.', value: 'Neu.', effectiveDate: '2026-05-19' }))).toThrow(/Wirksamkeitsdatum weicht vom Rezept ab/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentLabel: '§ 1' }, value: 'Neu.' }))).toThrow(/expectedHash oder expectedOld fehlt/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentLabel: '§ 1' }, expectedOld: 'Erster Absatz.', value: 'Neu.', expectedMatches: 0 }))).toThrow(/expectedMatches muss mindestens 1 sein/u);
    expect(() => apply(state(), operation({ op: 'replaceText', expectedOld: 'x', value: 'y' }))).toThrow(/eindeutiger Zielanker fehlt/u);
    expect(() => apply(state(), operation({ op: 'unbekannt', expectedOld: 'x', value: 'y' }))).toThrow(/nicht unterstützte Konsolidierungsoperation/u);
    expect(() => apply(state(), operation({ op: 'replaceText', target: { label: '§ 1' }, expectedOld: 'x', value: 'y', source: '' }))).toThrow(/Pflichtfeld source fehlt/u);
    expect(() => applyPatchRecipe(state(), { amendmentAct: 'x', effectiveDate: DATE, operations: [] })).toThrow(ConsolidationError);
  });
});

describe('Konsolidierungsengine: Operationen', () => {
  it('replaceProvision, insertProvisionBefore/After, deleteProvision', () => {
    const anchor = { type: 'paragraph', label: '§ 1' };
    const replaced = apply(state(), operation({ op: 'replaceProvision', target: anchor, expectedHash: hashOf(paragraph1()), value: { type: 'paragraph', label: '§ 1', title: 'Neu', children: [] } }));
    expect(replaced.body[0]).toEqual({ type: 'paragraph', label: '§ 1', title: 'Neu', children: [] });
    const before = apply(state(), operation({ op: 'insertProvisionBefore', target: anchor, expectedHash: hashOf(paragraph1()), value: { type: 'paragraph', label: '§ 0', children: [] } }));
    expect(before.body.map((block) => block.label)).toEqual(['§ 0', '§ 1', '§ 2', 'Anlage 1']);
    const after = apply(state(), operation({ op: 'insertProvisionAfter', target: anchor, expectedHash: hashOf(paragraph1()), value: { type: 'paragraph', label: '§ 1a', children: [] } }));
    expect(after.body.map((block) => block.label)).toEqual(['§ 1', '§ 1a', '§ 2', 'Anlage 1']);
    const deleted = apply(state(), operation({ op: 'deleteProvision', target: anchor, expectedHash: hashOf(paragraph1()) }));
    expect(deleted.body.map((block) => block.label)).toEqual(['§ 2', 'Anlage 1']);
    expect(() => apply(state(), operation({ op: 'replaceProvision', target: anchor, expectedHash: hashOf(paragraph1()), value: 'kein Block' }))).toThrow(/value muss ein Block/u);
  });

  it('insertParagraph am Anfang oder Ende, repealProvision mit und ohne Text, renameProvision, replaceHeading', () => {
    const anchor = { type: 'paragraph', label: '§ 1' };
    const atEnd = apply(state(), operation({ op: 'insertParagraph', target: anchor, expectedHash: hashOf(paragraph1()), value: sub('(3)', 'Dritter.') }));
    expect(atEnd.body[0]!.children!.map((block) => block.label)).toEqual(['(1)', '(2)', '(3)']);
    const atStart = apply(state(), operation({ op: 'insertParagraph', target: anchor, expectedHash: hashOf(paragraph1()), value: sub('(0)', 'Nullter.'), position: 'start' }));
    expect(atStart.body[0]!.children!.map((block) => block.label)).toEqual(['(0)', '(1)', '(2)']);
    const repealedText = apply(state(), operation({ op: 'repealProvision', target: { type: 'subparagraph', label: '(2)', parentLabel: '§ 1' }, expectedOld: 'Zweiter Absatz.' }));
    expect(repealedText.body[0]!.children![1]).toEqual({ type: 'subparagraph', label: '(2)', text: '(weggefallen)', children: [] });
    const repealedContainer = apply(state(), operation({ op: 'repealProvision', target: anchor, expectedHash: hashOf(paragraph1()), value: '(aufgehoben)' }));
    expect(repealedContainer.body[0]!.children).toEqual([{ type: 'paragraphText', text: '(aufgehoben)' }]);
    const renamed = apply(state(), operation({ op: 'renameProvision', target: anchor, expectedHash: hashOf(paragraph1()), value: '§ 1a' }));
    expect(renamed.body[0]!.label).toBe('§ 1a');
    const heading = apply(state(), operation({ op: 'replaceHeading', target: anchor, expectedHash: hashOf(paragraph1()), value: 'Ziel' }));
    expect(heading.body[0]!.title).toBe('Ziel');
  });

  it('replaceText mit Feldwahl, designationReplacement zählt Treffer im Zielblock', () => {
    const titled = apply(state(), operation({ op: 'replaceText', target: { type: 'paragraph', label: '§ 2' }, field: 'title', expectedOld: 'Begriffe', value: 'Begriffsbestimmungen' }));
    expect(titled.body[1]!.title).toBe('Begriffsbestimmungen');
    const designation = apply(state(), operation({ op: 'designationReplacement', target: { type: 'paragraph', label: '§ 2' }, expectedOld: 'Begriff', expectedMatches: 3, value: 'Terminus' }));
    expect(designation.body[1]!.title).toBe('Terminusbestimmungen'.replace('Terminusbestimmungen', 'Terminuse'));
    expect(designation.body[1]!.children!.map((block) => block.text)).toEqual(['Terminus eins.', 'Terminus zwei.']);
    expect(() => apply(state(), operation({ op: 'designationReplacement', target: { type: 'paragraph', label: '§ 2' }, expectedOld: 'Begriff', expectedMatches: 2, value: 'Terminus' }))).toThrow(/3 statt 2 Treffer/u);
    expect(() => apply(state(), operation({ op: 'designationReplacement', target: { type: 'paragraph', label: '§ 2' }, expectedOld: 'Nirgends', expectedMatches: 1, value: 'x' }))).toThrow(/0 statt 1 Treffer/u);
  });

  it('designationReplacementBody ersetzt normkörperweit mit genauer Trefferzahl', () => {
    const result = apply(state(), operation({ op: 'designationReplacementBody', expectedOld: 'Absatz', expectedMatches: 2, value: 'Abs.' }));
    expect(result.body[0]!.children!.map((block) => block.text)).toEqual(['Erster Abs..', 'Zweiter Abs..']);
    expect(() => apply(state(), operation({ op: 'designationReplacementBody', expectedOld: 'Absatz', expectedMatches: 1, value: 'Abs.' }))).toThrow(/2 statt 1 Treffer/u);
  });

  it('renameLaw prüft den bisherigen Titel und ist idempotent', () => {
    const renamed = apply(state(), operation({ op: 'renameLaw', expectedOld: 'Testgesetz', value: 'Neues Testgesetz' }));
    expect(renamed.title).toBe('Neues Testgesetz');
    expect(apply(renamed, operation({ op: 'renameLaw', expectedOld: 'egal', value: 'Neues Testgesetz' })).title).toBe('Neues Testgesetz');
    expect(() => apply(state(), operation({ op: 'renameLaw', expectedOld: 'Anderes', value: 'Neu' }))).toThrow(/bisheriger Normtitel wurde nicht gefunden/u);
    expect(() => apply(state(), operation({ op: 'renameLaw', expectedOld: 'Testgesetz', value: 'Neu', expectedMatches: 2 }))).toThrow(/genau ein Titeltreffer/u);
  });

  it('repealLaw und replaceBody hashen Titel+Körper bzw. Körper', () => {
    const current = state();
    const repealed = apply(current, operation({ op: 'repealLaw', expectedHash: hashOf({ title: current.title, body: current.body }) }));
    expect(repealed.repealed).toBe(true);
    expect(() => apply(current, operation({ op: 'repealLaw', expectedHash: hashOf(current.body) }))).toThrow(/repealLaw: Zielhash weicht ab/u);
    const replaced = apply(current, operation({ op: 'replaceBody', expectedHash: hashOf(current.body), value: [{ type: 'paragraph', label: '§ 1', title: 'Allein', children: [] }] }));
    expect(replaced.body).toEqual([{ type: 'paragraph', label: '§ 1', title: 'Allein', children: [] }]);
    expect(() => apply(current, operation({ op: 'replaceBody', expectedHash: '1'.repeat(64), value: [] }))).toThrow(/replaceBody: Zielhash weicht ab/u);
  });

  it('replaceSiblingRange ersetzt einen Geschwisterbereich nur mit passendem Bereichshash', () => {
    const current = state();
    const range = current.body.slice(0, 2);
    const result = apply(current, operation({ op: 'replaceSiblingRange', target: { type: 'paragraph', label: '§ 1' }, throughTarget: { type: 'paragraph', label: '§ 2' }, expectedHash: hashOf(range), value: [{ type: 'paragraph', label: '§ 1', title: 'Zusammengefasst', children: [] }] }));
    expect(result.body.map((block) => block.label)).toEqual(['§ 1', 'Anlage 1']);
    expect(() => apply(current, operation({ op: 'replaceSiblingRange', target: { type: 'paragraph', label: '§ 2' }, throughTarget: { type: 'paragraph', label: '§ 1' }, expectedHash: hashOf(range), value: [] }))).toThrow(/derselben Geschwisterliste in richtiger Reihenfolge/u);
    expect(() => apply(current, operation({ op: 'replaceSiblingRange', target: { type: 'paragraph', label: '§ 1' }, throughTarget: { type: 'subparagraph', label: '(1)', parentLabel: '§ 2' }, expectedHash: hashOf(range), value: [] }))).toThrow(/derselben Geschwisterliste/u);
    expect(() => apply(current, operation({ op: 'replaceSiblingRange', target: { type: 'paragraph', label: '§ 1' }, throughTarget: { type: 'paragraph', label: '§ 2' }, expectedHash: hashOf(current.body), value: [] }))).toThrow(/Bereichshash weicht ab/u);
  });

  it('amendTable verlangt eine Tabelle, appendAnnex hängt an', () => {
    const table = state().body[2]!.children![0]!;
    const amended = apply(state(), operation({ op: 'amendTable', target: { type: 'table', parentLabel: 'Anlage 1' }, expectedHash: hashOf(table), value: { type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', text: 'b' }] }] } }));
    expect(amended.body[2]!.children![0]!.children![0]!.children![0]!.text).toBe('b');
    expect(() => apply(state(), operation({ op: 'amendTable', target: { type: 'paragraph', label: '§ 1' }, expectedHash: hashOf(paragraph1()), value: { type: 'table', children: [] } }))).toThrow(/Ziel ist keine Tabelle/u);
    const appended = apply(state(), operation({ op: 'appendAnnex', target: { type: 'annex', label: 'Anlage 1' }, expectedHash: hashOf(state().body[2]), value: { type: 'annex', label: 'Anlage 2', children: [] } }));
    expect(appended.body.at(-1)!.label).toBe('Anlage 2');
  });

  it('wendet mehrere Operationen in Rezeptreihenfolge auf denselben Zustand an', () => {
    const result = apply(
      state(),
      operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentLabel: '§ 1' }, expectedOld: 'Erster Absatz.', value: 'Erster Absatz, geändert.' }),
      operation({ op: 'insertProvisionAfter', target: { type: 'paragraph', label: '§ 2' }, expectedHash: hashOf(state().body[1]), value: { type: 'paragraph', label: '§ 3', title: 'Neu', children: [] } }),
      operation({ op: 'renameLaw', expectedOld: 'Testgesetz', value: 'Testgesetz (neu)' }),
    );
    expect(result.title).toBe('Testgesetz (neu)');
    expect(result.body.map((block) => block.label)).toEqual(['§ 1', '§ 2', '§ 3', 'Anlage 1']);
    expect(result.body[0]!.children![0]!.text).toBe('Erster Absatz, geändert.');
  });
});
