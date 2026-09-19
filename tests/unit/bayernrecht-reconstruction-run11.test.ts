/**
 * Rückrechnung, Lauf 11: Berichtigungen des Normtexts in der Kette, Zitate als Urheber früherer Änderungen, Umbau von
 * Gliederungen, Satzfehler in Befehlen (nur eindeutige), weitere Befehlsformen, Überschrift mit Abkürzungszeile,
 * mehrdeutige Wortersetzung mit anschließenden Satzzeichen. Verkündungen echt (`tests/fixtures/bayernrecht`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { parseCommand, repairCommandVerb } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { disambiguatedReplacement, type PublicationBase } from '@landesrecht/importer-bayernrecht/reconstruction/restore.ts';
import { commandLeaves } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { commandBlock, commandBlocks, isBlockFailure, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { projectTitle } from '@landesrecht/importer-bayernrecht/reconstruction/title.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const unit = (text: string, index = 0) => ({ index, tag: 'p', className: '', text, heading: false });

const ZUSTG = { documentId: 'BayZustG', title: 'Zuständigkeitsgesetz', abbreviations: ['ZustG'], bayRsNumber: '2015-1-V', documentDate: '2013-05-07', versionDate: '2013-05-07', references: ['GVBl. 2013 S. 246'] } as unknown as NormIdentity;
const AGZ = { documentId: 'BayVV_787_L_14168', title: 'Gewährung der Ausgleichszulage in benachteiligten Gebieten', abbreviations: ['AGZ'], bayRsNumber: '787-L', documentDate: '2023-11-23', references: ['BayMBl. Nr. 595'] } as unknown as NormIdentity;

/* ------------------------------------------------------------------------- Kette */

describe('Kette', () => {
  it('ein Zitat als Urheber einer früheren Änderung einer anderen Norm ist kein Einleitungssatz dieser Norm (GVBl. 2014 S. 286, ZustG)', () => {
    const { blocks } = commandBlocks(gazetteUnits(fixture('verkuendung-gvbl-2014-286-zustg-excerpt.html')), ZUSTG);
    // Nr. 3 ändert das Gesetz über die Zuständigkeiten in der Landesentwicklung, „zuletzt geändert durch Art. 10 Abs. 2 Nr. 2
    // des Gesetzes vom 7. Mai 2013 (GVBl S. 246)“ – das ist das ZustG als Urheber, nicht als Gegenstand.
    expect(blocks.map((block) => block.intro.label)).toEqual(['36.']);
    expect(blocks[0]!.commands).toHaveLength(5);
  });

  it('Berichtigung des Normtexts („… wird wie folgt berichtigt:“) liest sich wie eine Änderung und nennt die berichtigte Fassung (BayMBl. 2026 Nr. 114, AGZ)', () => {
    const block = commandBlock(gazetteUnits(fixture('verkuendung-baymbl-2026-114.html')), AGZ);
    if (isBlockFailure(block)) throw new Error(block.detail);
    expect(block.priorAmendmentClause).toBe('die Bekanntmachung vom 7. April 2025 (BayMBl. Nr. 214)');
    const { leaves } = commandLeaves(block);
    expect(leaves[0]!.node.text).toMatch(/^Nach Satz 1 vierter Spiegelstrich wird folgender neuer Satz 2 eingefügt:/u);
  });
});

/* ---------------------------------------------------------------- Befehlsformen und Satzfehler */

describe('Befehlsformen, Lauf 11', () => {
  it('Satzfehler nur, wo eindeutig: „die Nrn. 6.1. bis 6.3.“, „Nrn. 4.5 bis Nr. 4.7“ (BayMBl. 2022 Nr. 702)', () => {
    expect(parseStructural('Die bisherigen Nrn. 4.1 bis 4.3 werden die Nrn. 6.1. bis 6.3.', [], [])).toMatchObject({ formula: 'relabel', templates: [{ pairs: [[{ value: '4.1' }, { value: '6.1' }], [{ value: '4.2' }, { value: '6.2' }], [{ value: '4.3' }, { value: '6.3' }]] }] });
    const quoted = ['„4.5 eins', '4.6 zwei', '4.7 drei“'].map((text, index) => unit(text, index));
    expect(parseStructural('Nach Nr. 4.4 werden die folgenden Nrn. 4.5 bis Nr. 4.7 eingefügt:', [], quoted)).toMatchObject({ formula: 'insert-block', templates: [{ targets: [{ value: '4.5' }, { value: '4.6' }, { value: '4.7' }] }] });
  });

  it('„Nach Art. 1 wird folgender neuer Art. 2 eingefügt:“ und „Art. 1 wird folgender Abs. 3 angefügt:“ (GVBl. 2014 S. 117)', () => {
    expect(parseStructural('Nach Art. 1 wird folgender neuer Art. 2 eingefügt:', [], [unit('„Art. 2 Neu“')])).toMatchObject({ formula: 'insert-block', templates: [{ targets: [{ kind: 'artikel', value: '2' }], anchor: { side: 'after' } }] });
    expect(parseStructural('Art. 1 wird folgender Abs. 3 angefügt:', [], [unit('„(3) Neu.“')])).toMatchObject({ formula: 'insert-block', templates: [{ context: [{ kind: 'artikel', value: '1' }], targets: [{ kind: 'absatz', value: '3' }], append: true }] });
  });

  it('„das Komma und das Wort „…““: das Komma gehört zum gestrichenen oder eingefügten Wortlaut (GVBl. 2014 S. 117, FMBl. 2014 S. 47)', () => {
    expect(repairCommandVerb('In der Überschrift werden das Komma und das Wort „Außerkrafttreten“ gestrichen.')).toBe('In der Überschrift wird die Angabe „, Außerkrafttreten“ gestrichen.');
    expect(repairCommandVerb('In der Überschrift werden nach dem Wort „Finanzen“ ein Komma und die Worte „für Landesentwicklung und“ eingefügt.')).toBe('In der Überschrift werden nach dem Wort „Finanzen“ die Angabe „, für Landesentwicklung und“ eingefügt.');
  });

  it('Befehl als Fortsetzung des Einleitungssatzes: „werden in Nr. 2 die Worte „…“ gestrichen.“ (KWMBl. 2012 S. 48)', () => {
    expect(parseCommand(repairCommandVerb('werden in Nr. 2 die Worte „, zuletzt geändert durch Bekanntmachung vom 2. Oktober 2009 (KWMBl S. 322),“ gestrichen.'), [])).toMatchObject({ formulas: ['delete-words'] });
  });

  it('Ortsangaben: Artikel vor weiteren Orten („§ 3 Abs. 3 Satz 3, den §§ 4 und 6 sowie § 11 Abs. 2 Nr. 1“), „Überschrift der Bekanntmachung“', () => {
    expect(parseLocation('§ 3 Abs. 3 Satz 3, den §§ 4 und 6 sowie § 11 Abs. 2 Nr. 1')!.map(formatPath)).toEqual(['§ 3 Abs. 3 Satz 3', '§ 4', '§ 6', '§ 11 Abs. 2 Nr. 1']);
    expect(parseLocation('der Überschrift der Bekanntmachung')!.map(formatPath)).toEqual(['Überschrift']);
  });

  it('zusammengesetzte Befehle werden Befehle nacheinander (GVBl. 2014 S. 450, 2014 S. 117; BayMBl. 2022 Nr. 702)', () => {
    const leavesOf = (text: string, context: string) => commandLeaves({ commands: [{ unit: unit(text), label: '1.', text, quoted: [], children: [], depth: 0 }], introPrefix: context, intro: unit('Intro'), citation: {}, section: undefined } as never).leaves.map((leaf) => [leaf.node.text, leaf.context.map(formatPath).join(' / ')]);
    expect(leavesOf('§ 97 Abs. 4 und 5 werden aufgehoben; die bisherigen Abs. 6 und 7 werden Abs. 4 und 5.', '')).toEqual([
      ['§ 97 Abs. 4 und 5 werden aufgehoben.', ''],
      ['Die bisherigen Abs. 6 und 7 werden Abs. 4 und 5.', '§ 97'],
    ]);
    expect(leavesOf('Abs. 2 wird aufgehoben, die Absatzbezeichnung im bisherigen Abs. 1 entfällt.', '').map(([text]) => text)).toEqual(['Abs. 2 wird aufgehoben.', 'In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.']);
    expect(leavesOf('¹Die bisherige Nr. 3 wird aufgehoben. ²Die bisherige Nr. 2.2 wird Nr. 3.', '').map(([text]) => text)).toEqual(['Die bisherige Nr. 3 wird aufgehoben.', 'Die bisherige Nr. 2.2 wird Nr. 3.']);
  });
});

/* ------------------------------------------------------------------------ Überschrift, Wortlaut */

describe('Überschrift der Norm und Wortersetzung', () => {
  it('eine geänderte Abkürzungszeile mit Kurzbezeichnung bleibt Befund (GVBl. 2025 S. 543, VermGeoLEV/4. QE; wie Lauf 6)', () => {
    const title = 'Verordnung über den Einstieg in der vierten Qualifikationsebene in den fachlichen Schwerpunkten Vermessung und Geoinformation sowie Ländliche Entwicklung';
    const current = { title, shortTitle: 'Qualifikationsverordnung Vermessung und Ländliche Entwicklung 4. QE', abbr: 'VermGeoLEV/4. QE', headingLine: '(Qualifikationsverordnung Vermessung und Ländliche Entwicklung 4. QE – VermGeoLEV/4. QE)' };
    // Ob die Kurzbezeichnung der Kopfdaten am Stichtag bestand, belegt die Zeile allein nicht.
    expect(() => projectTitle(current, `${title} (VermGeoLEV/4. QE)`)).toThrow(/nicht eindeutig/u);
  });

  it('mehrdeutige Ersetzung durch ein Satzzeichen („bzw.“ → „ , “): die Stelle, deren Rücknahme den Wortlaut der Verkündungen ergibt', () => {
    const current = 'Die Prüfer, Prüferinnen, Beisitzer und Beisitzerinnen, die nach Satz 1 bestellt sind, entscheiden.';
    const before = 'Die Prüfer bzw. Prüferinnen, Beisitzer und Beisitzerinnen, die nach Satz 1 bestellt sind, entscheiden.';
    const working = [{ type: 'subparagraph', label: '(1)', text: current }] as NormBodyBlock[];
    const scope = resolvePath(working, parseLocation('Abs. 1')![0]!);
    if (!scope.ok) throw new Error(scope.reason);
    const base = { body: [{ type: 'subparagraph', label: '(1)', text: before }], citation: 'GVBl. 2012 S. 514' } as unknown as PublicationBase;
    expect(disambiguatedReplacement(working, base, scope.scope, 'bzw.', ' , ', 'Abs. 1')?.operation).toMatchObject({ kind: 'replace-text', before, after: current });
  });
});
