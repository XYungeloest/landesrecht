/**
 * Rückrechnung, Lauf 5: die Gruppen 1–3 (eine, zwei, drei und mehr Änderungen nach dem Stichtag).
 *
 * Jede hier neu unterstützte Form ist an einer echten, gekürzten Verkündung belegt (`tests/fixtures/bayernrecht/
 * verkuendung-*-excerpt.html`, nur ganze Elemente, Auslassungen markiert) und am echten Portaltext der betroffenen Norm
 * (`portal-*-excerpt.json`, auf die betroffenen Glieder und ihre Vorfahren gekürzt). Geprüft werden je Form: das Lesen
 * des Befehls (Parser), die Rücknahme (rückwärts) und die Vorwärtsprobe – vorwärts angewandt muss exakt der heutige
 * Körper entstehen. Wo eine Form nicht eindeutig ist, halten die Tests fest, dass sie scheitert.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { forwardSteps, reverseSteps } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { commencementStatements } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { parseCommand, type ParsedOperation } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits, type GazetteUnit } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath, type LocationPath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { bodyFingerprint, stableStringify, type RecipeStep } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { pdfPageCommencement, pdfText } from '@landesrecht/importer-bayernrecht/reconstruction/pdf.ts';
import { reverseAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
import { blockFromCandidate, commandBlock, commandBlocks, isBlockFailure, referenceKey, weakIntroCandidates, type CommandBlock, type CommandNode, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { walkChain, type WalkInput } from '@landesrecht/importer-bayernrecht/reconstruction/walk.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');

interface PortalFixture {
  documentId: string;
  identity: NormIdentity;
  inForceFrom: string;
  fullCitation?: string;
  body: NormBodyBlock[];
}
const portal = (documentId: string): PortalFixture => JSON.parse(readFileSync(join(FIXTURES, `portal-${documentId}-excerpt.json`), 'utf8')) as PortalFixture;
const gazette = (name: string): GazetteUnit[] => gazetteUnits(readFileSync(join(FIXTURES, `verkuendung-${name}-excerpt.html`), 'utf8'));
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazette(name), identity);
  if (isBlockFailure(block)) throw new Error(`${name}: ${block.detail}`);
  return block;
};
/** Rücknahme einer ganzen Änderung: keine Fehler, vorwärts exakt der heutige Körper, und es hat sich etwas geändert. */
function reverseOnly(body: NormBodyBlock[], block: CommandBlock): { steps: RecipeStep[]; before: NormBodyBlock[] } {
  const reversal = reverseAmendment(body, block);
  expect(reversal.failures).toEqual([]);
  expect(stableStringify(forwardSteps(reversal.before!, reversal.steps))).toBe(stableStringify(body));
  expect(bodyFingerprint(reversal.before!)).not.toBe(bodyFingerprint(body));
  return { steps: reversal.steps, before: reversal.before! };
}
const outline = (nodes: readonly CommandNode[]): string[] => nodes.flatMap((node) => [`${node.label ?? ''}${node.quoted.length > 0 ? `+${node.quoted.length}` : ''}`, ...outline(node.children).map((line) => `${node.label ?? ''}/${line}`)]);
const find = (blocks: readonly NormBodyBlock[], label: string): NormBodyBlock => {
  for (const block of blocks) {
    if (block.label === label) return block;
    const inner = block.children ? findOrUndefined(block.children, label) : undefined;
    if (inner) return inner;
  }
  throw new Error(`${label} fehlt`);
};
const findOrUndefined = (blocks: readonly NormBodyBlock[], label: string): NormBodyBlock | undefined => {
  try {
    return find(blocks, label);
  } catch {
    return undefined;
  }
};

/* ----------------------------------------------------------------------------- Befehlsblöcke */

describe('Befehlsblöcke, die bisher nicht lesbar waren', () => {
  it('dezimal gegliederte Befehle unter einem Einleitungssatz ohne Nummer (BayMBl. 2023 Nr. 647, „§ 1“ – „2.“ – „2.1“)', () => {
    const block = blockOf('baymbl-2023-647', portal('BayVV_2244_F_13364').identity);
    const lines = outline(block.commands);
    expect(lines.slice(0, 5)).toEqual(['1.', '2.', '2./2.1', '2./2.2', '3.']);
    expect(lines).toContain('6./6.1/6.1.1');
    expect(lines).toContain('9./9.3/9.3.2');
    // Die Befehle enden vor „§ 2“ (Inkrafttreten).
    expect(lines.at(-1)).toBe('18.');
  });

  it('Ersetzung mit untergliederten Paaren: „In Satz 1 werden ersetzt:“ – „das Wort „A“ durch das Wort „B“ und“ – … (BayMBl. 2023 Nr. 647 Nr. 6)', () => {
    const fixture = portal('BayVV_2244_F_13364');
    const block = blockOf('baymbl-2023-647', fixture.identity);
    const six = block.commands.find((node) => node.label === '6.')!;
    expect(six.children.map((node) => node.text)).toEqual(['In Satz 1 werden ersetzt:', 'In Satz 2 und 3 wird jeweils das Wort „Weiterbildungsmaßnahmen“ durch das Wort „Weiterbildungsvorhaben“ ersetzt.']);
    const { steps, before } = reverseOnly(fixture.body, { ...block, commands: [six] });
    expect(steps.map((step) => `${step.commandPath.join(' ')} ${step.formula} ${step.location}`)).toEqual([
      '6. 6.1 replace-words Nr. 4.2.2 Satz 1',
      '6. 6.1 replace-words Nr. 4.2.2 Satz 1',
      '6. 6.2 replace-words Nr. 4.2.2 Satz 2',
      '6. 6.2 replace-words Nr. 4.2.2 Satz 3',
    ]);
    const text = find(before, '4.2.2').children![0]!.text!;
    expect(text).toMatch(/^¹Bei den Ausbildungsmaßnahmen muss es sich um die Durchführung von anerkannten Schulungsmaßnahmen/u);
    expect(text).toContain('²Weiterbildungsmaßnahmen für Jugendleiterinnen');
    expect(text).toContain('Aus- und Weiterbildungsmaßnahmen einen verbandsspezifischen Hintergrund');
  });

  it('flache Liste auf der Ebene des Einleitungssatzes (BayMBl. 2024 Nr. 370, „KWMBl. I S. 235“)', () => {
    const identity: NormIdentity = { documentId: 'BayVwV154721', title: 'Prüfervergütungen für die Abnahme von Abschlussprüfungen für andere Bewerberinnen und Bewerber, von weiteren schulischen Prüfungen und von besonderen Leistungsfeststellungen', abbreviations: [], bayRsNumber: '2032.3-K', documentDate: '2002-06-26', references: ['KWMBl. 2002 S. 235'] };
    expect(referenceKey('KWMBl. I S. 235')).toBe(referenceKey('KWMBl. 2002 S. 235')!.replace('|2002|', '||'));
    const block = blockOf('baymbl-2024-370', identity);
    expect(block.commands.map((node) => node.label)).toEqual(['2.', '3.', '4.', '5.']);
    expect(block.commands[1]!.children.map((node) => node.label)).toEqual(['3.1', '3.2', '3.3', '3.4', '3.5', '3.6']);
  });

  it('ein über mehrere Einheiten gesetzter Befehl wird zusammengesetzt (BayMBl. 2024 Nr. 72)', () => {
    const identity: NormIdentity = { documentId: 'BayVV_2235_1_1_1_UK_231', title: 'Aufgaben der Fachberater in Katholischer Religionslehre an den Gymnasien in Bayern', abbreviations: [], bayRsNumber: '2235.1.1.1-K', documentDate: '2005-01-05', references: ['KWMBl. 2005 S. 79'] };
    const block = blockOf('baymbl-2024-72', identity);
    expect(block.commands.map((node) => node.text)).toEqual(['In Nr. 6 werden die Wörter „Oberbayern, Schwaben: StD Thomas Wendl, Staffelsee-Gymnasium Murnau“ durch die Wörter „Oberbayern, Schwaben: StD Johann Forster, Max-Planck-Gymnasium München“ ersetzt.']);
    expect(parseCommand(block.commands[0]!.text, []).formulas).toEqual(['replace-words']);
  });

  it('Tabellenzellen hinter einem Befehl mit Doppelpunkt gehören zum Zitat (GVBl. 2025 S. 21)', () => {
    const identity: NormIdentity = { documentId: 'BayDVLArztG', title: 'Verordnung zur Durchführung des Bayerischen Land- und Amtsarztgesetzes', abbreviations: ['DVBayLArztG'], bayRsNumber: '2122-7-1-G', documentDate: '2020-01-10', versionDate: '2020-01-10', references: ['GVBl. 2020 S. 15'] };
    const block = blockOf('gvbl-2025-21', identity);
    expect(outline(block.commands)).toEqual(['1.', '1./a)', '1./a)/aa)', '1./a)/bb)', '1./b)', '1./b)/aa)', '1./b)/bb)', '2.', '3.', '3./a)+4', '3./b)+2']);
  });

  it('„… wird folgende Nr. 1.3 angefügt.“ mit Punkt: das folgende Zitat gehört dazu (BayMBl. 2025 Nr. 398)', () => {
    const identity: NormIdentity = { documentId: 'BayVV_2210_4_WK_14107', title: 'Verleihung des Promotionsrechts für forschungsstarke Bereiche an bayerischen Hochschulen für angewandte Wissenschaften und Technischen Hochschulen', abbreviations: [], bayRsNumber: '2210.4-WK', documentDate: '2023-10-31', references: ['BayMBl. 2023 Nr. 547'] };
    const block = blockOf('baymbl-2025-398', identity);
    expect(block.commands).toHaveLength(1);
    expect(block.commands[0]!.text).toBe('Nach Nr. 1.2 wird folgende Nr. 1.3 angefügt.');
    expect(block.commands[0]!.quoted.length).toBeGreaterThan(1);
    expect(parseStructural('Nach Nr. 1.2 wird folgende Nr. 1.3 angefügt:', [], block.commands[0]!.quoted)?.formula).toBe('insert-block');
  });

  it('„… wird wie folgt geändert.“ mit Punkt, wenn gegliederte Befehle folgen (GVBl. 2025 S. 298, BFSO Musik)', () => {
    const identity: NormIdentity = { documentId: 'BayBFSOMusik', title: 'Schulordnung für die Berufsfachschulen für Musik', abbreviations: ['BFSO Musik'], bayRsNumber: '2236-4-1-3-K', documentDate: '2008-09-30', versionDate: '2008-09-30', references: ['GVBl. 2008 S. 806'] };
    const block = blockOf('gvbl-2025-298', identity);
    expect(outline(block.commands).slice(0, 7)).toEqual(['1.', '2.', '3.', '4.+1', '5.', '5./a)', '5./a)/aa)']);
    // „§ 10 wird aufgehoben.“ bleibt nicht umkehrbar.
    expect(parseCommand('§ 10 wird aufgehoben.', []).formulas).toEqual(['repeal-unit']);
  });

  it('eine zitierte Überschrift als Überschriftelement gehört zum Zitat, der Block läuft weiter (BayMBl. 2025 Nr. 391)', () => {
    const identity: NormIdentity = { documentId: 'BayVV_2038_3_11_G_13478', title: 'Richtlinie für die Gewährung von Förderungen und Vergabe von Auszeichnungen aus dem Bayerischen Demenzfonds sowie zur Vergabe des Bayerischen Demenzpreises (Förderrichtlinie Demenz und Teilhabe – DEMTeil)', abbreviations: ['DEMTeil'], documentDate: '2023-01-17', versionDate: '2023-01-17', references: ['BayMBl. 2023 Nr. 51'] };
    const units = gazette('baymbl-2025-391');
    expect(units.find((unit) => unit.text.includes('Teil 1 Bayerischer Demenzfonds'))!.heading).toBe(true);
    const block = blockOf('baymbl-2025-391', identity);
    expect(outline(block.commands)).toEqual(['1.1', '1.2', '1.2/1.2.1', '1.2/1.2.2', '1.3+1', '1.4+1', '1.5', '1.6+1']);
    // Der Befehl „Nr. 3 wird wie folgt gefasst:“ ist jetzt sichtbar – und nicht umkehrbar.
    expect(parseCommand('Nr. 3 wird wie folgt gefasst:', []).formulas).toEqual(['recast']);
  });

  it('ein Zitat, das mit geradem Anführungszeichen schließt, ist geschlossen (BayMBl. 2024 Nr. 474, gekürzt)', () => {
    const identity: NormIdentity = { documentId: 'BayVwV252304', title: 'Neufassung der Strafvollstreckungsordnung; Neufassung der Einforderungs- und Beitreibungsanordnung', abbreviations: [], documentDate: '2011-07-25', versionDate: '2011-07-25', references: [] };
    const unit = (index: number, tag: string, className: string, text: string, label?: string): GazetteUnit => ({ index, tag, className, text, heading: false, ...(label ? { label } : {}) });
    // Einheiten 4, 186, 196–198 der Seite, wörtlich.
    const units: GazetteUnit[] = [
      unit(0, 'dd', 'MBL1Listenebene', 'Die Bekanntmachung des Bayerischen Staatsministeriums der Justiz und für Verbraucherschutz über die Neufassung der Strafvollstreckungsordnung; Neufassung der Einforderungs- und Beitreibungsanordnung vom 25. Juli 2011 (JMBl. S. 82, ber. S. 162), die durch Bekanntmachung vom 28. August 2017 (JMBl. S. 197) geändert worden ist, wird wie folgt geändert:', '1.'),
      unit(1, 'dd', 'MBL1Listenebene', 'Die Einforderungs- und Beitreibungsanordnung wird wie folgt geändert:', '1.3'),
      unit(2, 'dd', 'MBL1Listenebene', '§ 18 Abs. 1 Satz 1 erhält folgende Fassung:', '1.3.6'),
      unit(3, 'p', 'MBLTextEinzug18', '„Geldzahlungen, die Zahlungspflichtigen nach § 56b Abs. 2 Nr. 2, § 57 Abs. 3 Satz 1 StGB, § 153a StPO, § 15 Abs. 1 Satz 1 Nr. 3, §§ 23, 29, 45 und 88 Abs. 6 JGG oder anlässlich eines Gnadenerweises auferlegt sind, werden nicht mit Zahlungsaufforderung (§ 5 Abs. 1) eingefordert."'),
      unit(4, 'dd', 'MBL1Listenebene', 'Diese Bekanntmachung tritt am 15. Oktober 2024 in Kraft.', '2.'),
    ];
    const block = commandBlock(units, identity);
    expect(isBlockFailure(block)).toBe(false);
    expect(outline((block as CommandBlock).commands)).toEqual(['1.3', '1.3/1.3.6+1']);
    // Ohne das gerade Schlusszeichen bliebe das Zitat bis zum Seitenende offen.
    const open = commandBlock(units.map((entry) => (entry.index === 3 ? { ...entry, text: entry.text.slice(0, -2) } : entry)), identity);
    expect(open).toMatchObject({ code: 'structure-unreadable' });
  });

  it('Einleitungssatz nur über die BayRS-Nummer bezeichnet: nur ein einziger schwacher Kandidat zählt (GVBl. 2018 S. 188, HeimKoZuV)', () => {
    const identity: NormIdentity = { documentId: 'BayDVSoSchG_2', title: 'Verordnung zur Durchführung der Art. 25 und 36 des Bayerischen Schulfinanzierungsgesetzes', abbreviations: ['HeimKoZuV'], bayRsNumber: '2233-1-2-K', documentDate: '1967-04-28', versionDate: '1967-04-28', references: ['GVBl. S. 344'] };
    const units = gazetteUnits(readFileSync(join(FIXTURES, 'verkuendung-gvbl-2018-188.html'), 'utf8'));
    expect(commandBlocks(units, identity).blocks).toEqual([]);
    const weak = weakIntroCandidates(units, identity);
    expect(weak).toHaveLength(1);
    const block = blockFromCandidate(units, weak[0]!);
    expect(outline((block as CommandBlock).commands).slice(0, 3)).toEqual(['1.+1', '2.', '2./a)+5']);
    // Ein anderer Titel und eine andere BayRS-Nummer: kein Kandidat.
    expect(weakIntroCandidates(units, { ...identity, bayRsNumber: '9999-9-9-K', title: 'Andere Verordnung' })).toEqual([]);
  });
});

/* --------------------------------------------------------------------- Orte in Tabellen und Anlagen */

describe('Orte: Tabellenzeilen, Spalten, unnummerierte Anlage', () => {
  it('liest „Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage Zeile der Kennziffer 821 Spalte 6“ – die Anlage im Genitiv ist das äußerste Glied', () => {
    expect(parseLocation('Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage Zeile der Kennziffer 821 Spalte 6')).toEqual([[
      { kind: 'anlage', value: '' }, { kind: 'teil', value: '1' }, { kind: 'abschnitt', value: '6' }, { kind: 'unterabschnitt', value: '2' }, { kind: 'zeile', value: '821' }, { kind: 'spalte', value: '6' },
    ]]);
    expect(parseLocation('Anlage')).toEqual([[{ kind: 'anlage', value: '' }]]);
    expect(parseLocation('Nr. 3 der Anlage 2')).toEqual([[{ kind: 'anlage', value: '2' }, { kind: 'nummer', value: '3' }]]);
  });

  it('Verb vor dem Zitat, Ort in Tabellenzeile und Spalte (GVBl. 2025 S. 178 § 5, AufbewV)', () => {
    const fixture = portal('BayAufbewV');
    const block = blockOf('gvbl-2025-178', fixture.identity);
    expect(block.commands.map((node) => node.text)).toEqual(['In Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage Zeile der Kennziffer 821 Spalte 6 wird die Angabe „Art. 202 Abs. 3 Satz 2 BayStVollzG“ durch die Wörter „Art. 202 Abs. 6 Satz 2 bis 4 BayStVollzG“ ersetzt.']);
    const { steps, before } = reverseOnly(fixture.body, block);
    expect(steps.map((step) => step.location)).toEqual(['Anlage Teil 1 Abschnitt 6 Unterabschnitt 2 Zeile 821 Spalte 6']);
    expect(steps[0]!.scope.fields.map((field) => field.path.join('.'))).toEqual(['0.0.0.0.0.2.5']);
    expect(JSON.stringify(before)).toContain('unter den Voraussetzungen des Art. 202 Abs. 3 Satz 2 BayStVollzG, § 184 Abs. 3 Satz 2 StVollzG');
    // Eine Zeile, deren erste Zelle den Schlüssel nicht trägt, ist nicht gemeint.
    const other = structuredClone(fixture.body);
    find(other, 'Unterabschnitt 2').children![0]!.children![2]!.children![0]!.text = '822';
    expect(resolvePath(other, parseLocation('Teil 1 Abschnitt 6 Unterabschnitt 2 der Anlage Zeile der Kennziffer 821 Spalte 6')![0]!)).toMatchObject({ ok: false });
  });

  it('Nummer als Tabellenzeile, im genannten Absatz gesucht (GVBl. 2025 S. 643 § 6, BayRKG Art. 6 Abs. 6)', () => {
    const fixture = portal('BayRKG');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2025-643', fixture.identity));
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['insert-words Art. 6 Abs. 6 Satz 1 Nr. 4', 'append-words Art. 26 Überschrift', 'replace-words Art. 26 Satz 4']);
    const article = find(before, 'Art. 6');
    const rows = (paragraph: number): string[] => article.children![paragraph]!.children!.find((block) => block.type === 'table')!.children!.map((row) => row.children!.map((cell) => cell.text).join(' | '));
    expect(rows(1).at(-1)).toBe('4. | Fahrrads | 0,04 €.');
    // Abs. 1 trägt dieselbe Zeile – sie bleibt, wie sie ist.
    expect(rows(0).at(-1)).toBe(article.children![0]!.children!.find((block) => block.type === 'table')!.children!.at(-1)!.children!.map((cell) => cell.text).join(' | '));
    expect(rows(0).at(-1)).toContain('elektrisch betriebenen');
  });

  it('Buchstabe als Tabellenzeile (BayMBl. 2025 Nr. 286, Zahl der Kammern)', () => {
    const fixture = portal('BayVV_320_A_570');
    const { steps, before } = reverseOnly(fixture.body, blockOf('baymbl-2025-286', fixture.identity));
    expect(steps).toHaveLength(15);
    expect(steps.at(-1)!.location).toBe('Nr. 2 Buchst. k');
    const cells = find(before, '2.').children!.find((block) => block.type === 'table')!.children!.map((row) => row.children!.map((cell) => cell.text!.replace(/\s+/gu, ' ')).join(' | '));
    expect(cells[0]).toBe('a) Arbeitsgericht Augsburg: | 11 Kammern');
    expect(cells.at(-1)).toBe('k) Arbeitsgericht Würzburg: | 12 Kammern');
    expect(find(before, '1.').children![0]!.text).toContain('Aufgrund des § 17 Abs. 1 des Arbeitsgerichtsgesetzes');
  });

  it('„Der Anlage wird folgende Nr. 19 angefügt:“ – unnummerierte Anlage, Spiegelstriche ohne Zeichen im Zitat (GVBl. 2025 S. 272 § 2, ZLV)', () => {
    const fixture = portal('BayZLV');
    const block = blockOf('gvbl-2025-272', fixture.identity);
    const { steps, before } = reverseOnly(fixture.body, block);
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['insert-block Anlage Nr. 19']);
    expect(find(before, 'Anlage').children!.map((item) => item.label)).toEqual(['17.', '18.']);
    // Das Zitat trägt die Striche nicht; der Körper führt sie als „–“.
    const inserted = (steps[0]!.operation as { block: NormBodyBlock }).block;
    expect(inserted.children!.map((item) => item.label)).toEqual(['–', '–', '–', '–', '–']);
  });
});

/* ---------------------------------------------------------------------------- neue Operationen */

describe('Neue Operationen an echten Verkündungen', () => {
  it('mehrere Einfügungen mit eigenem Anker, gleichzeitige Umnummerierung der „bisherigen“ Buchstaben, „ , “ als Ersetzung (GVBl. 2025 S. 695, AGBBiG)', () => {
    const fixture = portal('BayAGBBiG');
    const block = blockOf('gvbl-2025-695', fixture.identity);
    // Parser: zwei Einfügungen in einem Befehlssatz.
    const parsed = parseCommand('Nach der Angabe „§ 62 Abs. 3“ wird die Angabe „ , § 76 Abs. 1“ und nach der Angabe „§ 34 Abs. 9“ wird die Angabe „ , § 41a Abs. 1“ eingefügt.', [[{ kind: 'buchstabe', value: 'c' }]]);
    expect(parsed.operations?.map((operation) => operation.operation)).toEqual([
      { kind: 'insert', anchor: '§ 62 Abs. 3', side: 'after', text: ' , § 76 Abs. 1' },
      { kind: 'insert', anchor: '§ 34 Abs. 9', side: 'after', text: ' , § 41a Abs. 1' },
    ]);
    const { steps, before } = reverseOnly(fixture.body, block);
    expect(steps.filter((step) => step.formula === 'relabel').map((step) => step.location)).toEqual(['Art. 2 Abs. 1 Buchst. b → Buchst. c', 'Art. 2 Abs. 1 Buchst. c → Buchst. d', 'Art. 2 Abs. 1 Buchst. e → Buchst. f', 'Art. 2 Abs. 1 Buchst. d → Buchst. e', 'Art. 2 Abs. 1 Buchst. f → Buchst. g']);
    const list = find(before, 'Art. 2').children![0]!.children!;
    expect(list.map((item) => item.label)).toEqual(['a)', 'b)', 'c)', 'd)', 'e)', 'f)']);
    expect(list[1]!.text).toBe('die Genehmigung der festzusetzenden Entschädigungen (§ 40 Abs. 6, § 56 Abs. 1, § 62 Abs. 3, § 77 Abs. 3 und § 80 BBiG; § 34 Abs. 9, § 42h Abs. 1, § 42n Abs. 3, § 43 Abs. 3 und § 44b der Handwerksordnung);');
    expect(list[5]!.text).toBe('die Genehmigung der Vereinbarung zwischen zuständigen Stellen nach § 71 Abs. 9 BBiG.');
    // „die Angabe „und“ durch die Angabe „ , ““: Das Komma schließt an, das Leerzeichen dahinter steht schon im Text.
    expect(find(before, 'Art. 1').children![0]!.text).toContain('(§ 1 Abs. 3 des Berufsbildungsgesetzes – BBiG) und der Berufsausbildungsvorbereitung (§ 1 Abs. 2 BBiG) obliegen');
    expect(find(before, 'Art. 1').children!.map((paragraph) => paragraph.label)).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)']);
  });

  it('nacheinander statt gleichzeitig umnummeriert wäre der Buchstabe f zweimal vorhanden', () => {
    const fixture = portal('BayAGBBiG');
    const block = blockOf('gvbl-2025-695', fixture.identity);
    const two = block.commands.find((node) => node.label === '2.')!;
    const onlyDd: CommandBlock = { ...block, commands: [{ ...two, children: [{ ...two.children[0]!, children: two.children[0]!.children.filter((node) => node.label === 'dd)') }] }] };
    // Allein (ohne die übrigen Befehle) findet „die bisherigen Buchst. d und e werden e und f“ im heutigen Text e und f eindeutig –
    // erst zusammen mit „f wird g“ (nacheinander rückwärts) entstünde ein zweites f; gleichzeitig gelesen nicht.
    expect(reverseAmendment(fixture.body, onlyDd).failures).toEqual([]);
  });

  it('„der Punkt am Ende“ eines Satzes, der nicht der letzte ist (GVBl. 2024 S. 573 § 9, SpielbG)', () => {
    const fixture = portal('BaySpielbG');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2024-573', fixture.identity));
    expect(steps.filter((step) => step.formula === 'replace-final-punctuation').map((step) => step.location)).toEqual(['Art. 9 Abs. 2 Satz 5', 'Art. 9 Abs. 3 Satz 4']);
    const paragraph3 = find(before, 'Art. 9').children!.find((block) => block.label === '(3)')!.text!;
    expect(paragraph3).toContain('⁴Sie ist von einer zur Vertretung des Spielbankunternehmens berechtigten Person eigenhändig zu unterschreiben. ⁵Sie gilt als Steueranmeldung');
    expect(paragraph3).toContain('³Die Steueranmeldung ist binnen eines Monats nach Ablauf');
    expect(before.map((block) => block.label)).toEqual(['Art. 7', 'Art. 9', 'Art. 10']);
  });

  it('„Der Wortlaut wird Abs. 1.“ – die Vorschrift erhält ihre erste Absatzbezeichnung (GVBl. 2024 S. 562 § 2, AVWaffBeschR)', () => {
    expect(parseStructural('Der Wortlaut wird Abs. 1.', [[{ kind: 'paragraph', value: '4' }]], [])).toMatchObject({ formula: 'number-paragraph', templates: [{ kind: 'number-paragraph' }] });
    const fixture = portal('BayAVWaffBeschR');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2024-562', fixture.identity));
    expect(steps.map((step) => step.formula)).toEqual(['number-paragraph', 'insert-block']);
    // So, wie der Parser einen Absatz ohne Kennzeichen bildet: der Text unmittelbar unter der Vorschrift.
    expect(find(before, '§ 4').children).toEqual([{ type: 'paragraphText', text: 'Zuständige Behörden für die Mitwirkung bei der Überwachung des Verbringens oder der Mitnahme von Waffen und Munition in die Bundesrepublik Deutschland gemäß § 33 Abs. 3 WaffG sind die mit der Kontrolle des grenzüberschreitenden Verkehrs beauftragten Behörden.' }]);
    // Trägt die Vorschrift nach Rücknahme noch einen zweiten Absatz, ist „der Wortlaut“ nicht bestimmt.
    const two = structuredClone(fixture.body);
    find(two, '§ 4').children!.push({ type: 'subparagraph', label: '(3)', text: 'Weiterer Absatz.' });
    expect(reverseAmendment(two, blockOf('gvbl-2024-562', fixture.identity)).failures[0]!.state).toBe('ambiguous-target');
  });

  it('Satz 2 hinter einer Aufzählung: „Der Wortlaut wird Satz 1“ am Text davor, der neue Satz am Schlusstext (GVBl. 2026 S. 113 § 3, BayUIG Art. 7 Abs. 2)', () => {
    const fixture = portal('BayUIG');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2026-113', fixture.identity));
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['number-sentences Art. 7 Abs. 2 (Text vor der Aufzählung)', 'insert-sentence Art. 7 Abs. 2 (Schlusstext hinter der Aufzählung)']);
    const paragraph = find(before, '(2)');
    expect(paragraph.text).toBe('Soweit ein Antrag');
    expect(paragraph.children!.at(-1)!.text).toBe('ist er abzulehnen, es sei denn, das öffentliche Interesse an der Bekanntgabe überwiegt.');
  });

  it('eingefügtes Glied vor der Umnummerierung, Spiegelstriche ohne Zeichen im BayMBl.-Zitat (BayMBl. 2024 Nr. 442)', () => {
    const fixture = portal('BayVV_2235_1_1_5_K_13224');
    const { steps, before } = reverseOnly(fixture.body, blockOf('baymbl-2024-442', fixture.identity));
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['insert-block Nr. 3', 'relabel Nr. 3 → Nr. 4']);
    expect(before.map((block) => `${block.label} ${block.title}`)).toEqual(['2. Leistungsfach Sport als Abiturprüfungsfach', '3. Inkrafttreten und Aufheben von Vorschriften']);
  });

  it('Anker ist das letzte Glied eines vorangehenden Teils: „Nach § 14 wird folgender Teil 4 eingefügt“ (GVBl. 2024 S. 278, EStBAPO)', () => {
    const fixture = portal('BayEStBAPO');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2024-278', fixture.identity));
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['insert-block Teil 4', 'relabel Teil 4 → Teil 5', 'relabel § 16 → § 19', 'relabel § 15 → § 18']);
    expect(before.map((part) => `${part.label}: ${part.children!.map((paragraph) => paragraph.label).join(' ')}`)).toEqual(['Teil 3: § 14', 'Teil 4: § 15 § 16']);
  });

  it('Satzteil nach Nr. 2 und Satz 3 hinter einer Aufzählung (GVBl. 2024 S. 265, BayWoBindG)', () => {
    const fixture = portal('BayWoBindG');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2024-265', fixture.identity));
    expect(steps.map((step) => step.location)).toContain('Art. 4 Abs. 1 Satz 2 Halbsatz 1 Satzteil nach Nr. 2');
    const json = JSON.stringify(find(before, 'Art. 4'));
    for (const old of ['14 000 €', '22 000 €', '4 000 €', '1 000 €']) expect(json).toContain(old);
    expect(json).not.toContain('(EStG)');
    expect(find(before, 'Art. 4').children!.map((paragraph) => paragraph.label)).toEqual(['(1)', '(2)']);
  });

  it('ein Treffer mitten in einem längeren Wort zählt nicht: „Anwärter“ neben „Anwärterinnen“ (GVBl. 2026 S. 425 § 17, UntVergV)', () => {
    const fixture = portal('BayUntVergV');
    const { steps, before } = reverseOnly(fixture.body, blockOf('gvbl-2026-425', fixture.identity));
    expect(steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['replace-words § 1 Abs. 1', 'replace-words § 4 Abs. 2 Satz 1', 'insert-words § 4 Abs. 2 Satz 1']);
    expect(find(before, '§ 1').children![0]!.text).toContain('mit den Bezügen für Anwärterinnen und Anwärtern im Sinn des Art. 75');
    // Zwei ganze Treffer bleiben mehrdeutig.
    const twice = structuredClone(fixture.body);
    find(twice, '§ 1').children![0]!.text = `${find(twice, '§ 1').children![0]!.text!} Anwärter`;
    expect(reverseAmendment(twice, blockOf('gvbl-2026-425', fixture.identity)).failures[0]!.state).toBe('ambiguous-target');
  });

  it('Wort durch ein Satzzeichen ersetzt, ohne „am Ende“ (BayMBl. 2024 Nr. 484, Spiegelstrich 5)', () => {
    const fixture = portal('BayVV_301_I_2284');
    const command = 'In Spiegelstrich 5 wird das Wort „und“ durch ein Komma ersetzt.';
    const context: LocationPath[] = [[{ kind: 'nummer', value: '4' }], [{ kind: 'nummer', value: '4.1' }, { kind: 'satz', value: '3' }]];
    const parsed = parseCommand(command, context);
    expect(parsed.formulas).toEqual(['replace-by-punctuation']);
    const steps: RecipeStep[] = (parsed.operations as ParsedOperation[]).flatMap((operation) => operation.locations.map((path, index) => {
      const resolved = resolvePath(fixture.body, path);
      if (!resolved.ok) throw new Error(resolved.reason);
      return { id: `s${index}`, command, commandPath: [], formula: operation.formula, location: formatPath(path), scope: resolved.scope, operation: operation.operation, evidence: { baseline: '', current: '' } };
    }));
    const before = reverseSteps(fixture.body, steps);
    expect(find(before, '4.1').children!.filter((item) => item.label === '–').map((item) => item.text)[4]).toBe('Nr. 3.2.3 GemBek und');
    expect(forwardSteps(before, steps)).toEqual(fixture.body);
    // Steht das Komma im Bereich zweimal, ist die Stelle nicht bestimmt.
    const doubled = structuredClone(fixture.body);
    find(doubled, '4.1').children![5]!.text = 'Nr. 3.2.3, GemBek,';
    expect(() => reverseSteps(doubled, steps)).toThrow();
  });
});

/* ------------------------------------------------------------------------------- Inkrafttreten */

describe('Inkrafttreten', () => {
  it('ein nicht geschlossenes Zitat verdeckt die Schlussvorschrift auf der obersten Befehlsebene nicht (BayMBl. 2025 Nr. 233)', () => {
    const units = gazette('baymbl-2025-233');
    expect(units.some((unit) => unit.text.includes('„- vorbehaltlich der Nr. 3.2.4 -"'))).toBe(true);
    const { statements, unreadable } = commencementStatements(units, '2025-07-15');
    expect(unreadable).toEqual([]);
    expect(statements.filter((statement) => statement.refs === null).map((statement) => statement.date)).toEqual(['2025-08-01']);
  });

  it('Staatsverträge und Abkommen: Kalenderdatum ja, „am Tag nach der letzten Verkündung in den Ländern“ nein', () => {
    const unit = (text: string): GazetteUnit => ({ index: 0, tag: 'p', className: 'GTEinzugEZ', text, heading: false });
    // GVBl. 2025 S. 350, Art. 6 Abs. 2 (Reformstaatsvertrag)
    expect(commencementStatements([unit('(2) Dieser Staatsvertrag tritt am 1. Dezember 2025 in Kraft. Sind bis zum 30. November 2025 nicht alle Ratifikationsurkunden bei der oder dem Vorsitzenden der Konferenz der Regierungschefinnen und Regierungschefs der Länder hinterlegt, wird der Staatsvertrag gegenstandslos.')], '2025-06-30').statements).toMatchObject([{ refs: null, date: '2025-12-01' }]);
    // GVBl. 2025 S. 705 (SiTechZStV)
    expect(commencementStatements([unit('Dieses Abkommen tritt am Tag nach der letzten Verkündung in den Ländern in Kraft.')], '2025-12-30').unreadable).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------------- PDF-Textlayer */

describe('PDF-Textlayer: neuere Ausgaben und zusammengesetzte Schriften', () => {
  const layer = JSON.parse(readFileSync(join(FIXTURES, 'gvbl-2017-11-textlayer-s283-301.json'), 'utf8')) as { first: number; pages: Record<string, string> };
  const pages = (from: number, to: number): string[] => Array.from({ length: to - layer.first + 1 }, (_, index) => (index + layer.first >= from ? layer.pages[String(index + layer.first)] ?? '' : ''));

  it('Titel mit Gliederungsnummer und kleinem „vom“, 19 Seiten Tabelle bis zur Unterschrift (GVBl. 2017 S. 283–301, AufbewV)', () => {
    const result = pdfPageCommencement(pages(283, 301), { first: layer.first, position: 283, enactmentDate: '2017-05-30' });
    expect(result).toMatchObject({ ok: true, date: '2017-07-01' });
    expect(result.evidence.join(' ')).toContain('300-12-6-J Verordnung zur Änderung der Aufbewahrungsverordnung vom 30. Mai 2017');
  });

  it('verlangt das Ausfertigungsdatum im Titel und die Unterschrift auf der letzten Seite der Verkündung', () => {
    expect(pdfPageCommencement(pages(283, 301), { first: layer.first, position: 283, enactmentDate: '2017-05-31' }).ok).toBe(false);
    // Ohne S. 301 endet die Verkündung nicht mit einer Unterschrift.
    expect(pdfPageCommencement(pages(283, 300).slice(0, 300 - layer.first + 1), { first: layer.first, position: 283, enactmentDate: '2017-05-30' }).ok).toBe(false);
    // Ein Zitat „… vom 29. Juli 2010“ ohne Gliederungsnummer davor ist kein Titel.
    expect(layer.pages['283']).toContain('(AufbewV) vom 29. Juli 2010');
  });

  it('liest zusammengesetzte Schriften (Identity-H) über ihre ToUnicode-CMap, auch aus einem Objektstrom; ein nicht abgebildeter Code macht die Seite unlesbar', () => {
    const build = (codes: string): Uint8Array => {
      const content = deflateSync(Buffer.from(`BT /F1 12 Tf 72 700 Td <${codes}> Tj ET`, 'latin1'));
      const cmap = Buffer.from('/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <004D> <0002> <00FC> endbfchar 1 beginbfrange <0003> <0006> [<006E> <0063> <0068> <0065>] endbfrange endcmap end end', 'latin1');
      const inner = '5 0 7 120 ';
      const objectsText = `${'<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Arial /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>'.padEnd(120, ' ')}<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>`;
      const objstm = deflateSync(Buffer.from(`${inner}${objectsText}`, 'latin1'));
      const chunks: Buffer[] = [
        Buffer.from('%PDF-1.5\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /MediaBox [0 0 595 842] >> endobj\n', 'latin1'),
        Buffer.from(`4 0 obj << /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream\nendobj\n', 'latin1'),
        Buffer.from(`6 0 obj << /Length ${cmap.length} >>\nstream\n`, 'latin1'), cmap, Buffer.from('\nendstream\nendobj\n', 'latin1'),
        Buffer.from(`8 0 obj << /Type /ObjStm /N 2 /First ${inner.length} /Length ${objstm.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), objstm, Buffer.from('\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1'),
      ];
      return new Uint8Array(Buffer.concat(chunks));
    };
    expect(pdfText(build('0001000200030004000500060003'))).toMatchObject({ ok: true, pages: ['München'] });
    expect(pdfText(build('00010009')).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------- Kette */

describe('Kette: die Norm selbst ist erst nach dem Stichtag verkündet', () => {
  it('meldet einen Widerspruch zur Stichtagsklassifikation statt einer Kette (BayMBl. 2023 Nr. 629, BayFHolz)', async () => {
    const input: WalkInput = {
      root: mkdtempSync(join(tmpdir(), 'landesrecht-walk-')),
      baselineDate: '2023-12-01',
      evaluationDate: '2026-09-18',
      identity: { documentId: 'BayVV_2330_B_14207', title: 'Richtlinie zur Förderung von langfristig gebundenem Kohlenstoff in Gebäuden in Holzbauweise in Bayern', abbreviations: ['BayFHolz'], bayRsNumber: '2330-B', documentDate: '2023-12-01', references: [] },
      inForceFrom: '2024-06-30',
      fullCitation: 'Zitiervorschlag: Bayerische Förderrichtlinie Holz (BayFHolz) vom 1. Dezember 2023 (BayMBl. Nr. 629), die durch Bekanntmachung vom 11. Juni 2024 (BayMBl. Nr. 289) geändert worden ist',
      registerNotes: [],
      ledgerEvents: [
        { id: 'baymbl-2023-629', sourceUrl: 'https://www.verkuendung-bayern.de/baymbl/2023-629/', citation: 'BayMBl. 2023 Nr. 629', eventDate: '2023-12-20', enactmentDate: '2023-12-01', eventType: 'expire', organ: 'baymbl', publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic' },
        { id: 'baymbl-2024-289', sourceUrl: 'https://www.verkuendung-bayern.de/baymbl/2024-289/', citation: 'BayMBl. 2024 Nr. 289', eventDate: '2024-06-26', enactmentDate: '2024-06-11', eventType: 'amend', organ: 'baymbl', publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic' },
      ],
      ledgerByPublication: new Map(),
      postBaselinePublications: new Set(['baymbl|2023|629', 'baymbl|2024|289']),
      amendingByPage: new Map(),
    };
    const walk = await walkChain(input);
    expect(walk.failures[0]).toMatchObject({ state: 'contradictory', reason: 'norm-published-after-baseline' });
    expect(walk.failures[0]!.detail).toContain('BayMBl. 2023 Nr. 629');
    // Dieselbe Nummer eines anderen Jahrgangs ist nicht die eigene Fundstelle.
    const other = await walkChain({ ...input, ledgerEvents: input.ledgerEvents.map((event) => ({ ...event, citation: event.citation.replace('2023 Nr. 629', '2021 Nr. 629') })) });
    expect(other.failures[0]?.reason).not.toBe('norm-published-after-baseline');
  });
});
