/**
 * Rückrechnung, Lauf 8: Reichweite der Wiederherstellung aus der Stammverkündung.
 *
 * Amtsblätter 2009–2018 als Quellen der Kette, Anlagen als PDF-Anhang, Inkrafttreten in Amtsblättern (Zitat über
 * mehrere Absätze, Paragraphenzeile), Absatzbezeichnung „(1)“ gestrichen samt aufgehobenen Absätzen, aufgehobener letzter
 * Satz über die Ortsangabe, Befunde der Kette, die nur die Wortlautprobe ausräumt (`chainChecks`), Portalgestalt nach Art
 * des Texts und in gröberen Stufen, weitere Befehlsformen. Seiten und Portalkörper echt (`tests/fixtures/bayernrecht`).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { CACHE_DIR } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { forwardLawSteps } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { commencementFor } from '@landesrecht/importer-bayernrecht/reconstruction/commencement.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { candidateRefs, lookupPage } from '@landesrecht/importer-bayernrecht/reconstruction/pages.ts';
import { nestLaw, publicationAttachments, publicationBaseFromHtml } from '@landesrecht/importer-bayernrecht/reconstruction/publication.ts';
import { recipeProblems, stableStringify, type RecipeRestoration } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { formConventions, realizeRestore, restoreRequest, restoreUnit, type PublicationBase } from '@landesrecht/importer-bayernrecht/reconstruction/restore.ts';
import { cacheKey } from '@landesrecht/importer-bayernrecht/reconstruction/source.ts';
import { reverseAmendment } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural, realize, structuralBackward, structuralForward } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
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
const portal = (name: string): PortalFixture => JSON.parse(fixture(`portal-${name}.json`)) as PortalFixture;
const base = (name: string, organ: 'GVBl' | 'BayMBl', citation: string): PublicationBase => {
  const loaded = publicationBaseFromHtml(fixture(`verkuendung-${name}.html`), { organ, citation, url: `https://www.verkuendung-bayern.de/${name}`, sha256: '0'.repeat(64), authority: 'test', representation: 'test' });
  if (!loaded.ok) throw new Error(loaded.detail);
  return loaded.base;
};
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazetteUnits(fixture(`verkuendung-${name}.html`)), identity);
  if (isBlockFailure(block)) throw new Error(block.detail);
  return block;
};

/* ---------------------------------------------------------------------- Amtsblätter 2009–2018 */

describe('Amtsblätter 2009–2018 als Quellen der Kette', () => {
  const root = mkdtempSync(join(tmpdir(), 'bayernrecht-run8-'));
  mkdirSync(join(root, CACHE_DIR), { recursive: true });
  const cache = (url: string, name: string): void => writeFileSync(join(root, CACHE_DIR, `${cacheKey(url)}.bin`), fixture(name));
  const volume = 'https://www.verkuendung-bayern.de/amtsblatt/?volume=2018&journal=1';
  const issue = 'https://www.verkuendung-bayern.de/amtsblatt/ausgabe/allmbl-2018-8/';
  const document = 'https://www.verkuendung-bayern.de/amtsblatt/dokument/allmbl-2018-8-419/';
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('Fundstellen: Seite im Jahrgang des Erlasses (im Herbst auch im Folgejahr), nur 2009–2018, nur ohne Teilangabe; „BayMBl. 728“ ist Nr. 728', () => {
    expect(candidateRefs('AllMBl. S. 419', '2018-06-06')).toEqual([{ organ: 'allmbl', volume: 2018, position: 419 }]);
    expect(candidateRefs('KWMBl. S. 439', '2017-10-13')).toEqual([{ organ: 'kwmbl', volume: 2017, position: 439 }, { organ: 'kwmbl', volume: 2018, position: 439 }]);
    expect(candidateRefs('FMBl. 2018 S. 221', undefined)).toEqual([{ organ: 'fmbl', volume: 2018, position: 221 }]);
    expect(candidateRefs('KWMBl. I S. 194', '1996-04-01')).toEqual([]);
    expect(candidateRefs('AllMBl. S. 944', '1988-12-08')).toEqual([]);
    // Im Dezember erlassen: auch der Folgejahrgang.
    expect(candidateRefs('BayMBl. 728', '2022-12-02')).toEqual([{ organ: 'baymbl', volume: 2022, position: 728 }, { organ: 'baymbl', volume: 2023, position: 728 }]);
  });

  it('Jahrgang → Ausgabe → Dokument aus dem Cache; fehlt eine Seite, ist sie Bedarf – in der Reihenfolge der Auflösung', async () => {
    const refs = candidateRefs('AllMBl. S. 419', '2018-06-06');
    expect(await lookupPage(root, refs, '2018-06-06')).toMatchObject({ status: 'missing', needs: [volume] });
    cache(volume, 'amtsblatt-allmbl-2018-jahrgang-excerpt.html');
    expect(await lookupPage(root, refs, '2018-06-06')).toMatchObject({ status: 'missing', needs: [issue] });
    cache(issue, 'amtsblatt-allmbl-2018-8-ausgabe-excerpt.html');
    expect(await lookupPage(root, refs, '2018-06-06')).toMatchObject({ status: 'missing', needs: [document] });
    cache(document, 'verkuendung-allmbl-2018-8-419.html');
    const found = await lookupPage(root, refs, '2018-06-06');
    expect(found).toMatchObject({ status: 'found', page: { citation: 'AllMBl. 2018 S. 419', url: document, publishedAt: '2018-06-29', kind: 'html' } });
    // Die Identität ist das Erlassdatum auf der Seite.
    expect((await lookupPage(root, refs, '2018-06-07')).status).toBe('unavailable');
  });

  it('Inkrafttreten: ein Zitat über mehrere Absätze öffnet jeden neu und schließt nur am Ende (AllMBl. 2018 S. 419)', () => {
    const result = commencementFor(gazetteUnits(fixture('verkuendung-allmbl-2018-8-419.html')), '2018-06-29', undefined, false);
    expect(result).toMatchObject({ ok: true, dates: ['2018-07-01'] });
  });

  it('Inkrafttreten: Paragraphenzeile „§ 2“ als Absatz und gerades Anführungszeichen am Zitatende (FMBl. 2018 S. 221)', () => {
    const result = commencementFor(gazetteUnits(fixture('verkuendung-fmbl-2018-17-221.html')), '2018-12-21', undefined, false);
    expect(result).toMatchObject({ ok: true, dates: ['2019-01-01'] });
  });
});

/* ------------------------------------------------------------------------- Stammverkündung */

describe('Stammverkündung: Anlagen als PDF-Anhang, Tabellen', () => {
  it('Anhänge der Seite werden gelesen; eine Anlage, die nur dort steht, ist kein belegter Alttext (GVBl. 2022 S. 226)', () => {
    const html = fixture('verkuendung-gvbl-2022-226-stamm.html');
    expect(publicationAttachments(html)).toEqual([{ label: 'Anlage: Besondere Zuständigkeiten', url: 'https://www.verkuendung-bayern.de/files/gvbl/2022/10/anhang/05-2_2129-2-1-1-U_AbfZustV_Anlage.pdf' }]);
    const stamm = base('gvbl-2022-226-stamm', 'GVBl', 'GVBl. 2022 S. 226');
    const annex: NormBodyBlock[] = [{ type: 'annex', label: 'Anlage', children: [{ type: 'paragraphText', text: 'Besondere Zuständigkeiten' }] } as NormBodyBlock];
    expect(() => restoreUnit(annex, stamm, { steps: [{ kind: 'anlage', value: '' }], blockPath: [0] }, 'Rückfall')).toThrow(/nur als PDF-Anhang \(„Anlage: Besondere Zuständigkeiten“\)/u);
  });

  it('Tabellen bleiben beim Gliedern ganz – Zeilen und Zellen sind keine Gliederung der Vorschrift', () => {
    const table: NormBodyBlock = { type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', text: '1.' }, { type: 'tableCell', text: 'Familienname' }] }] } as NormBodyBlock;
    expect(nestLaw([{ type: 'heading', title: '§ 10 Datenübermittlungen' } as NormBodyBlock, { type: 'paragraphText', text: '(1) Die Meldebehörden übermitteln:' }, table])).toEqual([
      { type: 'paragraph', label: '§ 10', title: 'Datenübermittlungen', children: [{ type: 'subparagraph', label: '(1)', text: 'Die Meldebehörden übermitteln:', children: [table] }] },
    ]);
  });
});

/* ------------------------------------------------------ Absatzbezeichnung „(1)“ gestrichen */

describe('„In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen. – Die Abs. 2 und 3 werden aufgehoben.“ (GVBl. 2024 S. 458, AbfZustV)', () => {
  const gvbl = (): PublicationBase[] => [
    ['BayKJG-full', 'gvbl-2011-304-stamm', 'GVBl. 2011 S. 304'],
    ['BayZEPRV-full', 'gvbl-2013-468-stamm', 'GVBl. 2013 S. 468'],
    ['BayeAktVArbSozG-full', 'gvbl-2023-190-stamm', 'GVBl. 2023 S. 190'],
    ['BayVertrV-excerpt', 'gvbl-2021-610-stamm-excerpt', 'GVBl. 2021 S. 610'],
  ].map(([name, publication, citation]) => ({ ...base(publication!, 'GVBl', citation!), portal: portal(name!).body }));

  it('rückwärts: aufgehobene Absätze hinter dem unbezeichneten Wortlaut, dann wieder „(1)“; Überschrift aus der Verkündung', () => {
    const fixture = portal('BayAbfZustV-excerpt');
    const stamm = { ...base('gvbl-2022-226-stamm', 'GVBl', 'GVBl. 2022 S. 226'), portal: fixture.body, conventions: formConventions(gvbl(), 2) };
    const title = titleState({ ...fixture.law, body: fixture.body });
    const reversal = reverseAmendment(fixture.body, blockOf('gvbl-2024-458-excerpt', fixture.identity), '', title, { base: stamm, fallback: false });
    expect(reversal.failures).toEqual([]);
    expect(reversal.steps.map((step) => `${step.formula} ${step.operation.kind}${step.restoredFrom ? ' [R]' : ''}`)).toEqual(['delete-words replace-text [R]', 'unnumber-paragraph unnumber-paragraph', 'repeal-unit replace-blocks [R]']);
    expect(reversal.before).toEqual([
      {
        type: 'paragraph',
        label: '§ 2',
        title: 'Inkrafttreten, Außerkrafttreten',
        children: [
          { type: 'subparagraph', label: '(1)', text: 'Diese Verordnung tritt am 1. Juni 2022 in Kraft.' },
          { type: 'subparagraph', label: '(2)', text: expect.stringMatching(/^Die Abfallzuständigkeitsverordnung \(AbfZustV\) in der Fassung der Bekanntmachung vom 7\. November 2005/u) },
          { type: 'subparagraph', label: '(3)', text: '§ 1a tritt mit Ablauf des 31. Mai 2023 außer Kraft.' },
        ],
      },
    ]);
    expect(stableStringify(forwardLawSteps({ body: reversal.before!, title }, reversal.steps).body)).toBe(stableStringify(fixture.body));
  });

  it('„die Angabe „(1)““ nur am Ort Abs. 1; sonst bleibt es eine Streichung im Wortlaut', () => {
    expect(parseStructural('In Abs. 1 wird die Angabe „(1)“ gestrichen.', [parseLocation('Art. 40')![0]!], [])).toMatchObject({ formula: 'unnumber-paragraph', templates: [{ kind: 'unnumber-paragraph', context: [{ kind: 'artikel', value: '40' }] }] });
    expect(parseStructural('In Nr. 3 wird die Angabe „(1)“ gestrichen.', [], [])).toBeUndefined();
  });

  it('„Abs. 1“ nach gestrichener Bezeichnung ist der unbezeichnete Wortlaut vor dem ersten bezeichneten Absatz', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: 'Art. 12', children: [{ type: 'paragraphText', text: 'Erster Wortlaut.' }, { type: 'subparagraph', label: '(2)', text: 'Zweiter.' }] } as NormBodyBlock];
    const scope = resolvePath(body, parseLocation('Art. 12 Abs. 1')![0]!);
    expect(scope.ok && scope.scope.widened).toEqual(['Abs. 1 (unbezeichneter Wortlaut vor dem ersten bezeichneten Absatz)']);
  });
});

/* ------------------------------------------------------------------- Stelle des Alttexts */

describe('Aufgehobener Satz, dessen Nachbarsatz dieselbe Änderung geändert hat (BayMBl. 2024 Nr. 512 ← 2021 Nr. 68)', () => {
  it('war er der letzte Satz des Glieds in der Verkündung, steht er am Ende – das Glied bestimmt die Ortsangabe, nicht der Wortlaut', () => {
    const fixture = portal('BayVV_2126_0_G_11762-excerpt');
    const stamm = base('baymbl-2021-68-stamm-excerpt', 'BayMBl', 'BayMBl. 2021 Nr. 68');
    const request = restoreRequest('Satz 3 wird aufgehoben.', [parseLocation('Nr. 6.3')![0]!], [], 'repeal-unit');
    const [step] = realizeRestore(fixture.body, stamm, request as Exclude<typeof request, { error: string }>, '1.11.2');
    expect(step!.location).toBe('Nr. 6.3 Satz 3 (letzter Satz des Glieds in der Verkündung, Stelle am Ende)');
    const operation = step!.operation as { before: string; after: string };
    expect(operation.before).toBe(`${operation.after} ³Formulare für Auszahlungsanträge werden von der Bewilligungsbehörde spätestens mit Erlass des Bescheides und auf Anfrage zur Verfügung gestellt.`);
  });
});

/* ------------------------------------------------------------------------- Befunde der Kette */

describe('Befunde der Kette, die nur die Wortlautprobe ausräumt (`chainChecks`)', () => {
  it('ein Beleg der Wiederherstellung ohne wiederhergestellten Schritt ist nur mit Befund der Kette zulässig', () => {
    const recipe = JSON.parse(fixture('recipe-BayZustVBM.json')) as Parameters<typeof recipeProblems>[0];
    expect(recipeProblems(recipe)).toEqual([]);
    const restoration = recipe.restoration as RecipeRestoration;
    expect(restoration.chainChecks).toEqual([{ reason: 'chain-ledger-unexplained', detail: 'Das Register führt GVBl. 2026 S. 186 (new) für die Norm; die Kette der amtlichen Verweise enthält diese Veröffentlichung nicht' }]);
    const bare = { ...recipe, restoration: { ...restoration, chainChecks: undefined, restoredSteps: 0 }, steps: (recipe as unknown as { steps: Array<Record<string, unknown>> }).steps.map(({ restoredFrom: _omit, ...step }) => step) } as unknown as Parameters<typeof recipeProblems>[0];
    expect(recipeProblems(bare)).toContain('Beleg der Wiederherstellung (restoration) ohne wiederhergestellten Schritt und ohne Befund der Kette (chainChecks)');
  });
});

/* -------------------------------------------------------------------------- Portalgestalt */

describe('Portalgestalt: Art des Texts und gröbere Stufen', () => {
  it('Konventionen je Stufe: vollständig, ohne Art des Texts, ohne Art der Bezeichnung', () => {
    const samples = [
      ['BayKJG-full', 'gvbl-2011-304-stamm', 'GVBl. 2011 S. 304'],
      ['BayZEPRV-full', 'gvbl-2013-468-stamm', 'GVBl. 2013 S. 468'],
      ['BayeAktVArbSozG-full', 'gvbl-2023-190-stamm', 'GVBl. 2023 S. 190'],
    ].map(([name, publication, citation]) => ({ ...base(publication!, 'GVBl', citation!), portal: portal(name!).body }));
    const conventions = formConventions(samples, 2);
    for (const key of ['GVBl.|paragraph>subparagraph|label+text|{}|absatz|satz', 'GVBl.|paragraph>subparagraph|label+text|{}|absatz|*', 'GVBl.|paragraph>subparagraph|label+text|{}|*|*']) {
      expect(conventions.get(key)?.value).toBe('{"form":{"type":"subparagraph"},"handling":"same"}');
    }
  });
});

/* ------------------------------------------------------------------------- Befehlsformen */

describe('Befehlsformen, Lauf 8 – echte Befehle', () => {
  const quote = (text: string) => [{ index: 0, tag: 'p', className: '', text, heading: false }];

  it('„Der Wortlaut wird Satz 1 und …“ mit vollständigem weiterem Befehl, nicht mit Neufassung (GVBl. 2023 S. 318; 2025 S. 272)', () => {
    expect(parseStructural('Der Wortlaut wird Satz 1 und nach dem Wort „entsprechend“ werden die Wörter „ ; Art. 29 Nr. 8 gilt entsprechend“ eingefügt.', [], [])).toMatchObject({ formula: 'number-sentences', followUp: { text: 'Nach dem Wort „entsprechend“ werden die Wörter „ ; Art. 29 Nr. 8 gilt entsprechend“ eingefügt.' } });
    expect(parseStructural('Der Wortlaut wird Satz 1 und Nr. 2 wie folgt gefasst:', [], [])?.formula).not.toBe('number-sentences');
  });

  it('„Satz 3 wird Satz 2 und wie folgt geändert:“ (BayMBl. 2025 Nr. 315); „Es wird folgende Überschrift eingefügt:“ (GVBl. 2018 S. 257)', () => {
    expect(parseStructural('Satz 3 wird Satz 2 und wie folgt geändert:', [parseLocation('Nr. 2')![0]!], [])).toMatchObject({ formula: 'renumber-sentence', templates: [{ kind: 'renumber-sentences', pairs: [[3, 2]] }] });
    expect(parseStructural('Es wird folgende Überschrift eingefügt:', [parseLocation('§ 4')![0]!], quote('„Zuständigkeit“'))).toMatchObject({ formula: 'insert-title', templates: [{ kind: 'insert-title', title: 'Zuständigkeit' }] });
  });

  it('Umnummerierung mit weiterem Befehl, auch durch Komma getrennt (GVBl. 2023 S. 431)', () => {
    expect(parseStructural('Nr. 3 wird Nr. 1, nach der Angabe „Art. 17 Abs. 2“ die Angabe „Satz 1“ eingefügt und der Punkt am Ende durch ein Komma ersetzt.', [], [])).toMatchObject({ formula: 'relabel', followUp: { text: 'Nach der Angabe „Art. 17 Abs. 2“ die Angabe „Satz 1“ eingefügt und der Punkt am Ende durch ein Komma ersetzt.', context: [{ kind: 'nummer', value: '1' }] } });
  });

  it('Gegenstand einer Neufassung: Ordinalzahl, Satz oder Spiegelstrich des Kontexts, Überschrift, Wortlaut ohne Überschrift, „den folgenden“, Unterglieder, „Teile“', () => {
    expect(restoreRequest('Der erste Satz wird wie folgt neu gefasst:', [parseLocation('Nr. 3')![0]!], quote('„¹Neu.“'), 'recast')).toMatchObject({ kind: 'recast-sentences', location: 'Nr. 3 Satz 1' });
    expect(restoreRequest('Der Satz erhält folgende neue Fassung:', [parseLocation('Nr. 4 Satz 2')![0]!], quote('„²Neu.“'), 'recast')).toMatchObject({ kind: 'recast-sentences', location: 'Nr. 4 Satz 2' });
    expect(restoreRequest('Die Überschrift wird wie folgt gefasst:', [parseLocation('Nr. 4')![0]!], quote('„Förderung“'), 'recast')).toMatchObject({ kind: 'recast-title', location: 'Nr. 4 Überschrift', groups: ['Förderung'] });
    expect(restoreRequest('Die Überschrift wird wie folgt gefasst:', [], quote('„Neu“'), 'recast')).toMatchObject({ error: expect.stringMatching(/Überschrift der Norm/u) });
    expect(restoreRequest('Der Wortlaut von Nr. 7.8 wird wie folgt neu gefasst:', [], quote('„Neu.“'), 'recast')).toMatchObject({ kind: 'recast-blocks', location: 'Nr. 7.8 (Wortlaut ohne Überschrift)', wording: true });
    expect(restoreRequest('In Nr. 8.1.3 werden die Sätze 2 und 3 durch den folgenden Satz 2 ersetzt:', [], quote('„²Neu.“'), 'recast')).toMatchObject({ kind: 'recast-sentences', sentences: [2, 3] });
    expect(restoreRequest('Die Nrn. 6, 6.1 und 6.2 werden wie folgt gefasst:', [], quote('„6. Neu.“'), 'recast')).toMatchObject({ kind: 'recast-blocks', location: 'Nr. 6' });
    expect(restoreRequest('Die Teile 1 bis 4 werden durch die folgenden Teile 1 und 2 ersetzt:', [], quote('„Teil 1 Neu“'), 'recast')).toMatchObject({ kind: 'recast-blocks', targets: [{ kind: 'teil', value: '1' }, { kind: 'teil', value: '2' }, { kind: 'teil', value: '3' }, { kind: 'teil', value: '4' }] });
  });

  it('Ortsangaben: „Nr. 4.5 in der Überschrift“ (BayMBl. 2024 Nr. 644), „Spiegelsprich“ (Satzfehler, BayMBl. 2025 Nr. 278)', () => {
    expect(parseLocation('Nr. 4.5 in der Überschrift')!.map(formatPath)).toEqual(['Nr. 4.5 Überschrift']);
    expect(parseLocation('Nr. 4.2 Spiegelsprich 2')!.map(formatPath)).toEqual(['Nr. 4.2 Spiegelstrich 2']);
  });

  it('„In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“ als Operation: vorwärts fällt die Bezeichnung weg, rückwärts kommt sie wieder', () => {
    const fixture = portal('BayAbfZustV-excerpt');
    const parsed = parseStructural('In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.', [parseLocation('§ 2')![0]!], []);
    const [step] = realize(fixture.body, parsed!.templates![0]!, 'b)', false);
    const body = structuredClone(fixture.body);
    structuralBackward(body, step!.field, step!.operation, 'b)');
    expect(body[0]!.children).toEqual([{ type: 'subparagraph', label: '(1)', text: 'Diese Verordnung tritt am 1. Juni 2022 in Kraft.' }]);
    structuralForward(body, step!.field, step!.operation, 'b)');
    expect(body).toEqual(fixture.body);
  });
});
