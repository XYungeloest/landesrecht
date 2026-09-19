/**
 * Rückrechnung, Lauf 6: Überschrift der Norm, relatives Inkrafttreten, eindeutige Satzfehler, Staatsverträge,
 * parallele Änderungen.
 *
 * Wie in Lauf 5 an echten, gekürzten Verkündungen (`tests/fixtures/bayernrecht/verkuendung-*-excerpt.html`) und echtem
 * Portaltext (`portal-*-excerpt.json`, hier mit den Kopffeldern `law.title`/`shortTitle`/`abbr`). Je neue Form: Lesen,
 * Rücknahme, Vorwärtsprobe – und was sie ausschließt.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { applyReverseRecipe, applyReverseRecipeToLaw, forwardLawSteps, verifyRoundTrip, verifyRoundTripLaw } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { datedCommencement, ownCommencement, repairCommencementSentence } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { parseCommand } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { gazetteUnits, type GazetteUnit } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { pdfPageCommencement } from '@landesrecht/importer-bayernrecht/reconstruction/pdf.ts';
import { bodyFingerprint, recipeProblems, RECIPE_SCHEMA, stableStringify, WHITESPACE_NORMALIZATION, type ReconstructionRecipe } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { cacheKey } from '@landesrecht/importer-bayernrecht/reconstruction/source.ts';
import { reverseAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { citationMatches, commandAfterCitation, commandBlock, isBlockFailure, isStrongMatch, normCitations, type CommandBlock, type CommandNode, type NormIdentity } from '@landesrecht/importer-bayernrecht/reconstruction/structure.ts';
import { projectTitle, titleState, type RecipeTitle } from '@landesrecht/importer-bayernrecht/reconstruction/title.ts';
import { walkChain, type WalkLedgerEvent } from '@landesrecht/importer-bayernrecht/reconstruction/walk.ts';
import { parsePublicationDocument } from '@landesrecht/importer-bayernrecht/events/documents.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');

interface PortalFixture {
  documentId: string;
  identity: NormIdentity;
  inForceFrom: string;
  fullCitation?: string;
  changeHistory?: string;
  registerNotes: string[];
  law?: { title: string; shortTitle?: string; abbr?: string };
  body: NormBodyBlock[];
}
const portal = (documentId: string): PortalFixture => JSON.parse(readFileSync(join(FIXTURES, `portal-${documentId}-excerpt.json`), 'utf8')) as PortalFixture;
const html = (name: string): string => readFileSync(join(FIXTURES, `verkuendung-${name}-excerpt.html`), 'utf8');
const gazette = (name: string): GazetteUnit[] => gazetteUnits(html(name));
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazette(name), identity);
  if (isBlockFailure(block)) throw new Error(`${name}: ${block.detail}`);
  return block;
};
const lawOf = (fixture: PortalFixture) => ({ ...fixture.law!, body: fixture.body });
const outline = (nodes: readonly CommandNode[]): string[] => nodes.flatMap((node) => [`${node.label ?? ''}${node.quoted.length > 0 ? `+${node.quoted.length}` : ''}`, ...outline(node.children).map((line) => `${node.label ?? ''}/${line}`)]);

/** Einstufiges Rezept aus einer geprüften Rücknahme (Kopf wie ein geschriebenes Rezept, Belege gekürzt). */
function recipeOf(fixture: PortalFixture, block: CommandBlock, title?: RecipeTitle): ReconstructionRecipe {
  const reversal = reverseAmendment(fixture.body, block, '', title);
  expect(reversal.failures).toEqual([]);
  const titled = reversal.steps.some((step) => step.target === 'title');
  return {
    schemaVersion: RECIPE_SCHEMA,
    documentId: fixture.documentId,
    baselineDate: '2023-12-01',
    method: 'reverse-amendment',
    source: { url: `https://www.gesetze-bayern.de/Content/Zip/${fixture.documentId}`, sha256: '0'.repeat(64), parserVersion: 'test', inForceFrom: fixture.inForceFrom },
    amendment: {
      eventId: 'test', citation: 'GVBl. 2026 S. 61', organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy',
      url: 'https://www.verkuendung-bayern.de/gvbl/2026-61/', sha256: '1'.repeat(64), eventDate: '2026-02-27', effectiveDate: fixture.inForceFrom, effectiveDateEvidence: ['(Test)'], intro: block.intro.text,
    },
    baselineTextInForce: { date: '1990-06-01', evidence: ['(Test)'] },
    chain: [],
    steps: reversal.steps,
    ...(titled && title ? { title: { current: title, baseline: reversal.titleBefore! } } : {}),
    whitespace: WHITESPACE_NORMALIZATION,
    expected: { currentFingerprint: bodyFingerprint(fixture.body), baselineFingerprint: bodyFingerprint(reversal.before!) },
  };
}

/* --------------------------------------------------------------------------- Überschrift der Norm */

describe('Überschrift der Norm: Titelschritte', () => {
  it('liest die Überschrift als Titelzeile samt Abkürzungszeile des Kopfblocks (ArchivGlV, LHBPO)', () => {
    const archiv = portal('BayArchivGl');
    expect(titleState(lawOf(archiv))).toEqual({ title: 'Verordnung über die Gliederung der Staatlichen Archive Bayerns', abbr: 'ArchivGlV', headingLine: '(ArchivGlV)' });
    const lhbpo = portal('BayLFBPO');
    expect(titleState(lawOf(lhbpo)).headingLine).toBe('(Prüfungsordnung Berufsbildung – Landwirtschaft und Hauswirtschaft – LHBPO)');
    // Eine erste Kopfzeile ohne Bezug zu Abkürzung oder Kurzbezeichnung ist keine Abkürzungszeile.
    expect(titleState({ title: 'X', abbr: 'Y', body: [{ type: 'heading', text: '(GVBl. S. 175)\nBayRS 1' }] }).headingLine).toBeUndefined();
  });

  it('„Der Überschrift wird die Angabe „(ArchivGlV)“ angefügt.“ – rückwärts entfallen Abkürzungszeile und Abkürzung (GVBl. 2026 S. 61)', () => {
    const fixture = portal('BayArchivGl');
    const title = titleState(lawOf(fixture));
    const reversal = reverseAmendment(fixture.body, blockOf('gvbl-2026-61', fixture.identity), '', title);
    expect(reversal.failures).toEqual([]);
    const titleSteps = reversal.steps.filter((step) => step.target === 'title');
    expect(titleSteps.map((step) => [step.formula, step.location, step.operation])).toEqual([['append-words', 'Überschrift der Norm', { kind: 'append', text: '(ArchivGlV)' }]]);
    expect(reversal.titleBefore).toEqual({ title: 'Verordnung über die Gliederung der Staatlichen Archive Bayerns' });
    expect(reversal.before![0]!.text).toBe('Vom 28. Mai 1990\n(GVBl. S. 175)\nBayRS 2241-2-WK');
    // Vorwärts: Stichtag + Schritte = heute, Körper und Überschrift.
    const forward = forwardLawSteps({ body: reversal.before!, title: reversal.titleBefore! }, reversal.steps);
    expect(stableStringify(forward.body)).toBe(stableStringify(fixture.body));
    expect(forward.title).toEqual(title);
    // Ohne Titelzustand bleibt die Überschrift der Norm unerreichbar.
    expect(reverseAmendment(fixture.body, blockOf('gvbl-2026-61', fixture.identity)).failures[0]).toMatchObject({ reason: 'reverse-location-unresolved' });
  });

  it('Rezept mit Titelschritt: applyReverseRecipeToLaw und verifyRoundTripLaw; die reinen Körperfunktionen lehnen es ab', () => {
    const fixture = portal('BayArchivGl');
    const title = titleState(lawOf(fixture));
    const recipe = recipeOf(fixture, blockOf('gvbl-2026-61', fixture.identity), title);
    expect(recipeProblems(recipe)).toEqual([]);
    const law = { ...lawOf(fixture), citation: 'unverändert' };
    const baseline = applyReverseRecipeToLaw(law, recipe);
    expect(baseline.title).toBe('Verordnung über die Gliederung der Staatlichen Archive Bayerns');
    expect('abbr' in baseline).toBe(false);
    expect(baseline.citation).toBe('unverändert');
    expect(baseline.body[0]!.text).toBe('Vom 28. Mai 1990\n(GVBl. S. 175)\nBayRS 2241-2-WK');
    expect(verifyRoundTripLaw(law, recipe)).toMatchObject({ ok: true });
    expect(verifyRoundTripLaw(law, JSON.parse(JSON.stringify(recipe)) as ReconstructionRecipe)).toMatchObject({ ok: true });
    expect(verifyRoundTrip(fixture.body, recipe)).toMatchObject({ ok: false });
    expect(() => applyReverseRecipe(fixture.body, recipe)).toThrow(/Überschrift der Norm/u);
    // Heute eine andere Überschrift: das Rezept gilt nicht.
    expect(() => applyReverseRecipeToLaw({ ...law, title: 'Andere Verordnung' }, recipe)).toThrow(/Überschrift ist nicht die geprüfte/u);
    // Ein Rezept ohne Titelangaben, aber mit Titelschritt, ist ungültig.
    const { title: _omitted, ...withoutTitle } = recipe;
    expect(recipeProblems(withoutTitle as ReconstructionRecipe)).toContain('Titelschritte ohne Überschrift heute/am Stichtag (title)');
  });

  it('Titelzeile und Paragraph in einem Befehl, jeder Ort mit eigener Präposition („In der Überschrift und in § 2 Abs. 5 …“, GVBl. 2024 S. 98, LHBPO)', () => {
    const command = 'In der Überschrift und in § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.';
    const parsed = parseCommand(command, []);
    expect(parsed.operations?.[0]?.locations).toEqual([[{ kind: 'ueberschrift', value: '' }], [{ kind: 'paragraph', value: '2' }, { kind: 'absatz', value: '5' }]]);
    // Ohne zweite Präposition bleibt „jeweils“ verlangt.
    expect(parseCommand('In der Überschrift und § 2 Abs. 5 werden die Wörter „und Forsten“ durch die Wörter „ , Forsten und Tourismus“ ersetzt.', []).reason).toMatch(/ohne „jeweils“/u);
    const fixture = portal('BayLFBPO');
    const title = titleState(lawOf(fixture));
    const reversal = reverseAmendment(fixture.body, blockOf('gvbl-2024-98-parallel', fixture.identity), '', title);
    expect(reversal.failures).toEqual([]);
    expect(reversal.steps.map((step) => `${step.target ?? 'body'} ${step.location}`)).toEqual(['title Überschrift der Norm', 'body § 2 Abs. 5']);
    expect(reversal.titleBefore!.title).toMatch(/Staatsministeriums für Ernährung, Landwirtschaft und Forsten$/u);
    expect(reversal.titleBefore!.headingLine).toBe(title.headingLine);
    const forward = forwardLawSteps({ body: reversal.before!, title: reversal.titleBefore! }, reversal.steps);
    expect(stableStringify(forward.body)).toBe(stableStringify(fixture.body));
    expect(forward.title).toEqual(title);
  });

  it('verteilt eine geänderte Überschrift nur, wo es eindeutig ist', () => {
    const lhbpo = titleState(lawOf(portal('BayLFBPO')));
    // Eine Änderung in der Abkürzungszeile mit Kurzbezeichnung: Kopfdaten nicht eindeutig.
    expect(() => projectTitle(lhbpo, `${lhbpo.title} (Prüfungsordnung – LHBPO)`)).toThrow();
    // Die Abkürzungszeile entfällt, trägt aber auch die Kurzbezeichnung: nicht eindeutig.
    expect(() => projectTitle(lhbpo, lhbpo.title)).toThrow();
    // Angefügte Abkürzungszeile neben einer vorhandenen Abkürzung: nicht eindeutig.
    expect(() => projectTitle({ title: 'Verordnung', abbr: 'V' }, 'Verordnung (VO)')).toThrow();
    expect(projectTitle({ title: 'Verordnung' }, 'Verordnung (VO)')).toEqual({ title: 'Verordnung', abbr: 'VO', headingLine: '(VO)' });
  });
});

/* ------------------------------------------------------------------------ relatives Inkrafttreten */

describe('Relatives Inkrafttreten: nur mit dem Verkündungsdatum der Verkündung selbst', () => {
  const page = html('baymbl-2025-486');
  const units = gazetteUnits(page);
  const url = 'https://www.verkuendung-bayern.de/baymbl/2025-486/';

  it('„Diese Bekanntmachung tritt am Tag nach der Verkündung in Kraft.“ – Veröffentlichung BayMBl. 2025 Nr. 486 vom 26.11.2025 → 2025-11-27', () => {
    const published = parsePublicationDocument(page, 'baymbl', 2025, 486).publishedAt;
    expect(published).toBe('2025-11-26');
    const dated = datedCommencement(units, undefined, false, { publishedAt: published!, registerDate: published!, url });
    expect(dated).toMatchObject({ ok: true, dates: ['2025-11-27'], calendar: false, publicationDated: true, eventDate: '2025-11-26' });
    expect(dated.evidence).toEqual(['Diese Bekanntmachung tritt am Tag nach der Verkündung in Kraft.', `Verkündungsdatum 2025-11-26 laut Verkündung selbst (${url})`]);
  });

  it('ohne Datum der Verkündung selbst oder bei abweichendem Registerdatum: unbestimmt', () => {
    expect(datedCommencement(units, undefined, false, { registerDate: '2025-11-26', url })).toMatchObject({ ok: false });
    expect(datedCommencement(units, undefined, false, { publishedAt: '2025-11-26', registerDate: '2025-11-25', url }).reason).toMatch(/widersprüchlich/u);
    // Ein Kalenderdatum braucht kein Verkündungsdatum.
    const calendar: GazetteUnit[] = [{ index: 0, tag: 'dd', className: 'MBL1Listenebene', label: '2.', text: 'Diese Bekanntmachung tritt am 1. August 2025 in Kraft.', heading: false }];
    expect(datedCommencement(calendar, undefined, false, { url })).toMatchObject({ ok: true, dates: ['2025-08-01'], calendar: true, publicationDated: false });
  });

  it('Quellfehler „mir Wirkung vom“ in der Inkrafttretensregel der Stammfassung: als „mit Wirkung vom“ gelesen und belegt (BayMBl. 2022 Nr. 485)', () => {
    const fixture = portal('BayVV_2235_1_1_5_K_13224');
    const own = ownCommencement(fixture.body, '2023-12-01');
    expect(own).toMatchObject({ ok: true, date: '2022-08-01' });
    expect(own.evidence[0]).toBe('Quellfehler in der Inkrafttretensregel: „mir Wirkung vom“ als „mit Wirkung vom“ gelesen (einzige Lesart)');
    // Der Beleg zitiert den Satz, wie er in der Quelle steht.
    expect(own.evidence[1]).toMatch(/„Diese Bekanntmachung tritt für das neunjährige Gymnasium mir Wirkung vom 1\. August 2022 in Kraft\.“$/u);
    expect(repairCommencementSentence('Diese Bekanntmachung tritt mit Wirkung vom 1. August 2022 in Kraft.').defects).toEqual([]);
    // Nur vor „Wirkung vom/zum“ und einem Datum; sonst bleibt der Satz unlesbar.
    expect(repairCommencementSentence('Diese Bekanntmachung tritt mir am 1. August 2022 in Kraft.').defects).toEqual([]);
    const other = structuredClone(fixture.body);
    const rule = other.at(-1)!.children![0]!;
    rule.text = rule.text!.replace('mir Wirkung vom', 'mir Wirkung ab');
    expect(ownCommencement(other, '2023-12-01')).toMatchObject({ ok: false });
  });

  it('PDF-Textlayer: „Dieses Statut tritt am 1. Oktober 2007 in Kraft.“ (GVBl. 2007 S. 640)', () => {
    const layer = JSON.parse(readFileSync(join(FIXTURES, 'gvbl-2007-20-textlayer-s640.json'), 'utf8')) as { first: number; pages: Record<string, string> };
    const pages = Array.from({ length: 640 - layer.first + 1 }, (_, index) => layer.pages[String(index + layer.first)] ?? '');
    expect(pdfPageCommencement(pages, { first: layer.first, position: 640, enactmentDate: '2007-09-10' })).toMatchObject({ ok: true, date: '2007-10-01' });
  });
});

/* -------------------------------------------------------------------------- eindeutige Satzfehler */

describe('Eindeutige Satzfehler: toleriert und im Rezept vermerkt', () => {
  it('Portaltext ohne den Schlusspunkt des angefügten Satzes: das Glied wird wie im Portal zurückgenommen (GVBl. 2024 S. 605 § 10, BayUIG Art. 2 Abs. 1)', () => {
    const fixture = portal('BayUIG');
    const block = blockOf('gvbl-2024-605-uig', fixture.identity);
    const reversal = reverseAmendment(fixture.body, block);
    expect(reversal.failures).toEqual([]);
    expect(reversal.steps.map((step) => `${step.formula} ${step.location}`)).toEqual(['number-sentences Art. 2 Abs. 1 (Text vor der Aufzählung)', 'insert-sentence Art. 2 Abs. 1 (Satz 2 als eigener Schlusstext hinter der Aufzählung)']);
    expect(reversal.steps[1]!.sourceDefect).toMatch(/Portaltext ohne den Schlusspunkt/u);
    const art2 = (body: NormBodyBlock[]): NormBodyBlock => body[0]!.children![0]!.children![0]!;
    const paragraph = art2(reversal.before!);
    expect(paragraph.text).toBe('Informationspflichtige Stellen sind');
    expect(paragraph.children!.map((child) => child.label)).toEqual(['1.', '2.']);
    expect(stableStringify(forwardLawSteps({ body: reversal.before! }, reversal.steps).body)).toBe(stableStringify(fixture.body));
    // Mit Schlusspunkt im Portal: derselbe Schritt, ohne Vermerk.
    const clean = structuredClone(fixture.body);
    const tail = art2(clean).children!.at(-1)!;
    tail.text = `${tail.text}.`;
    const cleanReversal = reverseAmendment(clean, block);
    expect(cleanReversal.failures).toEqual([]);
    expect(cleanReversal.steps[1]!.sourceDefect).toBeUndefined();
    // Weicht der Schlusstext sonst ab, gibt es keine Rücknahme.
    const other = structuredClone(fixture.body);
    art2(other).children!.at(-1)!.text = '²Der Oberste Rechnungshof ist keine informationspflichtige Stelle';
    expect(reverseAmendment(other, block).failures).not.toEqual([]);
  });

  // Echte Einheiten der Seiten (Element, Klasse, Gliederungszeichen, Text; lange Zitattexte innerhalb der Anführungszeichen
  // gekürzt). `commandBlock` liest die Einheiten nach ihrer Stelle; deshalb fortlaufend nummeriert, die Originalnummer im
  // Kommentar.
  const unit = (tag: string, className: string, text: string, label?: string): Omit<GazetteUnit, 'index'> => ({ tag, className, text, heading: false, ...(label ? { label } : {}) });
  const sequence = (units: Omit<GazetteUnit, 'index'>[]): GazetteUnit[] => units.map((entry, index) => ({ ...entry, index }));

  it('ein nicht geschlossenes Zitat endet vor dem nächsten Befehl derselben Ebene (BayMBl. 2026 Nr. 72, Einheiten 141–144)', () => {
    const abmBek: NormIdentity = { documentId: 'BayVwV_AbmBek', title: 'Abmarkungsbekanntmachung', abbreviations: ['AbmBek'], documentDate: '2008-05-28', references: ['FMBl. 2008 S. 135'] };
    const units = sequence([
      unit('p', 'MBLTextEinzug0', 'Die Abmarkungsbekanntmachung (AbmBek) vom 28. Mai 2008 (FMBl. S. 135), die durch Bekanntmachung vom 18. Oktober 2017 (FMBl. S. 516) geändert worden ist, wird wie folgt geändert:'), // 5
      unit('li', 'listeeinfach', 'Nach Nr. 15.5 wird folgende Nr. 15.6 eingefügt:', '49.'), // 141
      unit('dd', 'MBLnderung18', '¹War die Beteiligtenstellung eines Grundstückseigentümers zum Zeitpunkt der Ankündigung nicht erkennbar … ³Auf Nr. 17.1 Satz 1 Buchst. a und Nr. 17.1 Satz 2 wird hingewiesen.', '„15.6'), // 142
      unit('li', 'listeeinfach', 'Die bisherige Nr. 15.6 wird Nr. 15.7.', '50.'), // 143
      unit('li', 'listeeinfach', 'In Nr. 16 wird die Angabe „Zu Art. 16 AbmG,“ gestrichen.', '51.'), // 144
    ]);
    const block = commandBlock(units, abmBek) as CommandBlock;
    expect(isBlockFailure(block)).toBe(false);
    expect(outline(block.commands)).toEqual(['49.+1', '50.', '51.']);
    expect(block.commands[0]!.defects![0]).toMatch(/nicht geschlossen; es endet vor dem nächsten Befehl „50.“/u);
    // Ohne fortlaufendes Gliederungszeichen bleibt das Zitat offen und der Block unlesbar.
    const skipped = units.map((entry) => (entry.index === 3 ? { ...entry, label: '52.' } : entry));
    expect(commandBlock(skipped, abmBek)).toMatchObject({ code: 'structure-unreadable' });
  });

  it('doppeltes öffnendes Anführungszeichen am Zitatbeginn zählt als eines (BayMBl. 2026 Nr. 296, Einheiten 96, 110–132)', () => {
    const aeBayGrSt: NormIdentity = { documentId: 'BayVV_61_02_03_01_F_13270', title: 'Bayerischer Anwendungserlass-Grundsteuer', abbreviations: ['AEBayGrSt'], documentDate: '2022-09-02', references: ['BayMBl. 2022 Nr. 542'] };
    const units = sequence([
      unit('p', 'MBLEinleitungsformel', 'Die Bekanntmachung des Bayerischen Staatsministeriums der Finanzen und für Heimat über den Bayerischen Anwendungserlass-Grundsteuer (AEBayGrSt) vom 2. September 2022 (BayMBl. Nr. 542) wird wie folgt geändert:'), // 5
      unit('li', 'listeeinfach', 'Nr. 2.2.243 wird wie folgt geändert:', '16.'), // 96
      unit('dd', '', 'Nach Nr. 2.2.243.1.9 werden die folgenden Nrn. 2.2.243.2 bis 2.2.243.2.7 eingefügt:', 'i)'), // 110
      unit('dd', '', '„Abgrenzung der Betriebsvorrichtungen von den Betriebsgrundstücken der öffentlichen Verkehrsunternehmen', '„2.2.243.2'), // 111
      unit('dd', '', 'Unterirdische Räumlichkeiten wie Diensträume … sind als Gebäude zu bewerten.', '2.2.243.2.6'), // 130
      unit('dd', '', '¹Maschinenräume und Transformatorenräume sind nur dann als Gebäude zu behandeln, wenn sich in ihnen Menschen nicht nur vorübergehend aufhalten können. …“', '2.2.243.2.7'), // 131 (gekürzt)
      unit('li', 'listeeinfach', 'Nr. 2.2.244 wird wie folgt geändert:', '17.'), // 132
    ]);
    const block = commandBlock(units, aeBayGrSt) as CommandBlock;
    expect(isBlockFailure(block)).toBe(false);
    expect(outline(block.commands)).toEqual(['16.', '16./i)+3', '17.']);
    expect(block.commands[0]!.children[0]!.defects![0]).toMatch(/doppeltes öffnendes Anführungszeichen/u);
    // Ohne die Doppelung am Text wäre das Zitat nach der letzten Einheit geschlossen – ohne Vermerk.
    const single = units.map((entry) => (entry.index === 3 ? { ...entry, text: entry.text.slice(1) } : entry));
    const clean = commandBlock(single, aeBayGrSt) as CommandBlock;
    expect(isBlockFailure(clean)).toBe(false);
    expect(clean.commands[0]!.children[0]!.defects).toBeUndefined();
  });

  it('eine übersprungene Dezimalebene („1.20“ – „1.20.1.1“) gehört zum übergeordneten Befehl (BayMBl. 2026 Nr. 183, Einheiten 4, 83–86)', () => {
    const lfl: NormIdentity = { documentId: 'BayVV_7801_L_13600', title: 'Geschäftsordnung für die Bayerische Landesanstalt für Landwirtschaft', abbreviations: ['LfLGO'], bayRsNumber: '7801-L', documentDate: '2023-01-31', references: ['BayMBl. 2023 Nr. 90'] };
    const units = sequence([
      unit('dd', 'MBL1Listenebene', 'Die Bekanntmachung des Bayerischen Staatsministerium für Ernährung, Landwirtschaft und Forsten über die Geschäftsordnung für die Bayerische Landesanstalt für Landwirtschaft vom 31. Januar 2023 (BayMBl. Nr. 90) wird wie folgt geändert:', '1.'), // 4
      unit('dd', 'MBL1Listenebene', 'Nr. 3.1.10 Satz 4 wird wie folgt geändert:', '1.20'), // 83
      unit('dd', 'MBL1Listenebene', 'Nach der Angabe „Bevölkerung“ wird das Komma durch die Angabe „sowie“ ersetzt.', '1.20.1.1'), // 84
      unit('dd', 'MBL1Listenebene', 'Nach der Angabe „Ausbau“ wird die Angabe „sowie“ durch die Angabe „und“ ersetzt.', '1.20.1.2'), // 85
      unit('dd', 'MBL1Listenebene', 'Diese Bekanntmachung tritt mit Wirkung vom 1. Mai 2026 in Kraft.', '2.'), // 86
    ]);
    const block = commandBlock(units, lfl) as CommandBlock;
    expect(isBlockFailure(block)).toBe(false);
    expect(outline(block.commands)).toEqual(['1.20', '1.20/1.20.1.1', '1.20/1.20.1.2']);
    expect(block.commands[0]!.children[0]!.defects![0]).toMatch(/Gliederungsebene zwischen „1.20“ und „1.20.1.1“ fehlt/u);
    // Ein fremdes Präfix bleibt ein Gliederungssprung.
    const foreign = units.map((entry) => (entry.index === 2 ? { ...entry, label: '1.21.1.1' } : entry));
    expect(commandBlock(foreign, lfl)).toMatchObject({ code: 'structure-unreadable' });
  });
});

/* -------------------------------------------------------------------------------- Staatsverträge */

describe('Staatsverträge: Zitat ohne Fundstelle, Datum der Unterzeichnung', () => {
  it('liest „vom 26. August bis 11. September 1996“, „vom 10. bis 27. September 2002“ und „vom 31. August 1991“ (GVBl. 2025 S. 350, 396)', () => {
    const rfin = 'Der Rundfunkfinanzierungsstaatsvertrag vom 26. August bis 11. September 1996, zuletzt geändert durch …, wird wie folgt geändert:';
    const [cited] = normCitations(rfin);
    expect(cited).toMatchObject({ date: '1996-08-26', parenthetical: '', references: [] });
    expect(commandAfterCitation(rfin, cited!)).toEqual({ command: 'wird wie folgt geändert:', priorClause: '…' });
    const jmstv = 'Der Staatsvertrag über den Schutz der Menschenwürde und den Jugendschutz in Rundfunk und Telemedien (Jugendmedienschutz-Staatsvertrag – JMStV) vom 10. bis 27. September 2002, zuletzt geändert durch den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 7. März 2024, wird wie folgt geändert:';
    const [jm] = normCitations(jmstv);
    expect(jm).toMatchObject({ date: '2002-09-10', abbreviation: 'JMStV' });
    const identity: NormIdentity = { documentId: 'JMStV', title: 'Staatsvertrag über den Schutz der Menschenwürde und den Jugendschutz in Rundfunk und Telemedien', abbreviations: ['JMStV'], documentDate: '2002-09-10', versionDate: '2002-09-10', references: [] };
    expect(isStrongMatch(citationMatches(jm!, identity))).toBe(true);
    expect(commandAfterCitation(jmstv, jm!)?.priorClause).toBe('den Fünften Medienänderungsstaatsvertrag vom 27. Februar bis 7. März 2024');
    expect(normCitations('Der ZDF-Staatsvertrages vom 31. August 1991, zuletzt geändert durch den Vierten Medienänderungsstaatsvertrag vom 9. bis 16. Mai 2023, wird wie folgt geändert:')[0]).toMatchObject({ date: '1991-08-31' });
    // Kein Vertrag davor: kein Zitat ohne Fundstelle.
    expect(normCitations('Die Verordnung vom 31. August 1991, zuletzt geändert durch …, wird wie folgt geändert:')).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- parallele Änderungen */

describe('Kette: parallele Änderung auf derselben vorangehenden Änderung (GesV)', () => {
  const PAGES: Record<string, string> = {
    'https://www.verkuendung-bayern.de/gvbl/2026-301/': 'gvbl-2026-301',
    'https://www.verkuendung-bayern.de/gvbl/2024-155/': 'gvbl-2024-155',
    'https://www.verkuendung-bayern.de/gvbl/2024-98/': 'gvbl-2024-98-parallel',
    'https://www.verkuendung-bayern.de/gvbl/2024-34/': 'gvbl-2024-34',
    'https://www.verkuendung-bayern.de/gvbl/2022-182/': 'gvbl-2022-182',
    'https://www.verkuendung-bayern.de/gvbl/2022-154/': 'gvbl-2022-154',
    'https://www.verkuendung-bayern.de/gvbl/2022-224/': 'gvbl-2022-224',
  };
  const event = (position: number, volume: number, suffix: string, eventDate: string, enactmentDate: string): WalkLedgerEvent => ({
    id: `gvbl-${volume}-${position}-${suffix}`, sourceUrl: `https://www.verkuendung-bayern.de/gvbl/${volume}-${position}/`, citation: `GVBl. ${volume} S. ${position}`, eventDate, enactmentDate,
    eventType: 'amend', organ: 'gvbl', publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy',
  });

  it('nimmt GVBl. 2024 S. 98 auf, obwohl kein Verweis sie nennt: Sie setzt wie S. 155 auf S. 34 auf; eingeordnet nach Inkrafttreten', async () => {
    const root = mkdtempSync(join(tmpdir(), 'landesrecht-parallel-'));
    mkdirSync(join(root, '.cache', 'bayernrecht'), { recursive: true });
    for (const [url, name] of Object.entries(PAGES)) {
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.bin`), html(name));
      writeFileSync(join(root, '.cache', 'bayernrecht', `${cacheKey(url)}.json`), JSON.stringify({ url, retrievedAt: '2026-09-18T10:00:00.000Z' }));
    }
    const fixture = portal('BayGesV');
    const walk = await walkChain({
      root,
      baselineDate: '2023-12-01',
      evaluationDate: '2026-09-18',
      identity: fixture.identity,
      inForceFrom: fixture.inForceFrom,
      ...(fixture.fullCitation ? { fullCitation: fixture.fullCitation } : {}),
      ...(fixture.changeHistory ? { changeHistory: fixture.changeHistory } : {}),
      registerNotes: fixture.registerNotes,
      ledgerEvents: [event(34, 2024, 'a', '2024-02-15', '2024-01-31'), event(98, 2024, 'b', '2024-06-14', '2024-06-04'), event(155, 2024, 'c', '2024-06-28', '2024-06-04'), event(301, 2026, 'd', '2026-06-15', '2026-05-19')],
      ledgerByPublication: new Map(),
      postBaselinePublications: new Set(['gvbl|2024|34', 'gvbl|2024|98', 'gvbl|2024|155', 'gvbl|2026|301']),
      amendingByPage: new Map(),
    });
    expect(walk.steps.map((step) => `${step.citation} ${step.effectiveDates.join(',')}`)).toEqual(['GVBl. 2026 S. 301 2026-06-16', 'GVBl. 2024 S. 155 2024-07-01', 'GVBl. 2024 S. 98 2024-07-01', 'GVBl. 2024 S. 34 2024-02-29']);
    expect(walk.evidence.some((line) => line.startsWith('Parallele Änderung GVBl. 2024 S. 98'))).toBe(true);
    // Das Paket nennt als Beginn des heutigen Textes den 1. Januar 2026, die jüngste Änderung tritt am 16. Juni 2026 in
    // Kraft: Die Belege widersprechen sich – kein Rezept.
    expect(walk.failures[0]).toMatchObject({ state: 'contradictory', reason: 'portal-in-force-mismatch' });
  });
});
