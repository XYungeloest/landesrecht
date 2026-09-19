/**
 * Rückrechnung, Lauf 9: Stand am Stichtag **vorwärts** aus der Stammverkündung und allen Änderungen davor.
 *
 * Vorwärts angewandte Änderungen (`forward.ts`) als Quelle des Alttexts und Maßstab der Wortlautprobe, Befehle zur
 * Inhaltsübersicht, alte Nummerierung im Befehl („Der bisherige § 3 wird § 4 und wie folgt geändert:“), Halbsätze,
 * weitere Befehlsformen, OCR-Erkennung und Befund zum PDF-Textlayer (`pdfbase.ts`). Seiten und Portalkörper echt
 * (`tests/fixtures/bayernrecht`), Auszüge wörtlich.
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { forwardLawSteps, halfSentenceRange } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import { parseCommand } from '@landesrecht/importer-bayernrecht/reconstruction/formulas.ts';
import { forwardPublicationBase, forwardState, quoteBlocks } from '@landesrecht/importer-bayernrecht/reconstruction/forward.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { formatPath, parseLocation, resolvePath } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { pdfText } from '@landesrecht/importer-bayernrecht/reconstruction/pdf.ts';
import { layerAmbiguities } from '@landesrecht/importer-bayernrecht/reconstruction/pdfbase.ts';
import { publicationBaseFromHtml } from '@landesrecht/importer-bayernrecht/reconstruction/publication.ts';
import { stableStringify } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import { formConventions, restoreRequest, wordingAgreement, type PublicationBase } from '@landesrecht/importer-bayernrecht/reconstruction/restore.ts';
import { hasTableOfContents, reverseAmendment, TOC_COMMAND } from '@landesrecht/importer-bayernrecht/reconstruction/steps.ts';
import { parseStructural } from '@landesrecht/importer-bayernrecht/reconstruction/structural.ts';
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
const SOURCE = { sha256: '0'.repeat(64), authority: 'test', representation: 'test' };
const base = (name: string, citation: string): PublicationBase => {
  const loaded = publicationBaseFromHtml(fixture(`verkuendung-${name}.html`), { organ: 'GVBl', citation, url: `https://www.verkuendung-bayern.de/${name}`, ...SOURCE });
  if (!loaded.ok) throw new Error(loaded.detail);
  return loaded.base;
};
const blockOf = (name: string, identity: NormIdentity): CommandBlock => {
  const block = commandBlock(gazetteUnits(fixture(`verkuendung-${name}.html`)), identity);
  if (isBlockFailure(block)) throw new Error(block.detail);
  return block;
};
const prior = (name: string, citation: string, identity: NormIdentity) => ({ label: citation, block: blockOf(name, identity), url: `https://www.verkuendung-bayern.de/${name}`, ...SOURCE });

/* ------------------------------------------------------------------ Vorwärts bis zum Stichtag */

describe('Stand am Stichtag vorwärts: BayZustWaffVIM (GVBl. 2011 S. 74 ← 2014 S. 286 ← 2019 S. 98; nach dem Stichtag BayMBl. 2024 Nr. 508)', () => {
  const current = portal('BayZustWaffVIM-full');
  const stamm = base('gvbl-2011-74-stamm', 'GVBl. 2011 S. 74');
  // Jüngste Änderung zuerst, wie die Kette sie liefert.
  const chain = [prior('gvbl-2019-98-zustwaff-excerpt', 'GVBl. 2019 S. 98', current.identity), prior('gvbl-2014-286-zustwaff-excerpt', 'GVBl. 2014 S. 286', current.identity)];
  const conventions = formConventions([
    ['BayKJG-full', 'gvbl-2011-304-stamm', 'GVBl. 2011 S. 304'],
    ['BayZEPRV-full', 'gvbl-2013-468-stamm', 'GVBl. 2013 S. 468'],
    ['BayeAktVArbSozG-full', 'gvbl-2023-190-stamm', 'GVBl. 2023 S. 190'],
  ].map(([name, publication, citation]) => ({ ...base(publication!, citation!), portal: portal(name!).body })), 2);

  it('wendet beide Änderungen vor dem Stichtag in zeitlicher Folge an', () => {
    const state = forwardPublicationBase(stamm, chain);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.used.map((used) => used.citation)).toEqual(['GVBl. 2014 S. 286', 'GVBl. 2019 S. 98']);
    expect(state.base.citation).toBe('GVBl. 2011 S. 74');
    expect(stableStringify(state.base.body)).not.toBe(stableStringify(stamm.body));
  });

  it('Rücknahme der Änderung nach dem Stichtag mit Alttext aus dem Vorwärtsstand: Wortlaut gleich, Vorwärtsprobe byteidentisch', () => {
    const state = forwardPublicationBase(stamm, chain);
    if (!state.ok) throw new Error(state.detail);
    const title = titleState({ ...current.law, body: current.body });
    const reversal = reverseAmendment(current.body, blockOf('baymbl-2024-508', current.identity), '', title, { base: { ...state.base, portal: current.body, conventions }, fallback: true });
    expect(reversal.failures).toEqual([]);
    expect(reversal.steps.length).toBeGreaterThan(0);
    expect(wordingAgreement(reversal.before!, state.base)).toMatchObject({ ok: true });
    expect(stableStringify(forwardLawSteps({ body: reversal.before!, title: reversal.titleBefore ?? title }, reversal.steps).body)).toBe(stableStringify(current.body));
  });

  it('ohne die Änderungen davor stimmt die Stammverkündung nicht mit dem Stand am Stichtag überein', () => {
    const title = titleState({ ...current.law, body: current.body });
    const reversal = reverseAmendment(current.body, blockOf('baymbl-2024-508', current.identity), '', title, { base: { ...stamm, portal: current.body, conventions }, fallback: true });
    expect(reversal.failures).toEqual([]);
    // Die Stammverkündung kennt das „Staatsministerium des Innern, für Sport und Integration“ (GVBl. 2014 S. 286) noch nicht.
    expect(wordingAgreement(reversal.before!, stamm)).toMatchObject({ ok: false, detail: expect.stringContaining('ab Zeichen 521') });
  });
});

describe('Stand am Stichtag vorwärts: BayAgrG (GVBl. 2016 S. 347 ← 2022 S. 695)', () => {
  it('Aufhebung eines Artikels und Neufassung des Inkrafttretens', () => {
    const current = portal('BayAgrG-full');
    const stamm = base('gvbl-2016-347-stamm', 'GVBl. 2016 S. 347');
    const state = forwardPublicationBase(stamm, [prior('gvbl-2022-695-agrg-excerpt', 'GVBl. 2022 S. 695', current.identity)]);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const labels = state.base.body.map((block) => block.label);
    expect(stamm.body.map((block) => block.label)).toContain('Art. 3a');
    expect(labels).not.toContain('Art. 3a');
    expect(JSON.stringify(state.base.body.find((block) => block.label === 'Art. 4'))).toContain('Dieses Gesetz tritt am 1. Januar 2017 in Kraft.');
  });

  it('forwardState meldet einen Befehl, der nicht eindeutig anwendbar ist, als Befund – ohne Ausnahme', () => {
    const current = portal('BayAgrG-full');
    const block = blockOf('gvbl-2022-695-agrg-excerpt', current.identity);
    const result = forwardState([], [{ label: 'GVBl. 2022 S. 695', block }], 'GVBl');
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- Zitierte Blöcke */

describe('quoteBlocks: zitierte Einheiten als Blöcke der Vorschrift', () => {
  const unit = (text: string, heading = false) => ({ index: 0, tag: 'p', className: '', text, heading });

  it('Anführungszeichen außen fallen weg; Absatz mit Bezeichnung wird Glied, Text bleibt Text', () => {
    const blocks = quoteBlocks([unit('„(3) Neuer Absatz.“')], 'other');
    expect(JSON.stringify(blocks)).toContain('Neuer Absatz.');
    expect(JSON.stringify(blocks)).not.toContain('„');
  });
});

/* ---------------------------------------------------------------------- Inhaltsübersicht */

describe('Befehle zur Inhaltsübersicht', () => {
  it('eine Inhaltsübersicht erkennt man am Titel; der Wortlautvergleich lässt sie und Platzhalter „(aufgehoben)“ aus', () => {
    const toc: NormBodyBlock = { type: 'paragraph', label: '', title: 'Inhaltsübersicht', text: 'Art. 1 Zweck' } as NormBodyBlock;
    const article = (text: string): NormBodyBlock => ({ type: 'paragraph', label: 'Art. 1', title: 'Zweck', children: [{ type: 'subparagraph', label: '', text }] }) as NormBodyBlock;
    const repealed: NormBodyBlock = { type: 'paragraph', label: 'Art. 2', text: '(aufgehoben)' } as NormBodyBlock;
    expect(hasTableOfContents([toc, article('Text.')])).toBe(true);
    expect(hasTableOfContents([article('Text.')])).toBe(false);
    const publication = { ...base('gvbl-2016-347-stamm', 'GVBl. 2016 S. 347'), body: [article('Text.')] };
    expect(wordingAgreement([toc, article('Text.'), repealed], publication)).toMatchObject({ ok: true });
    expect(wordingAgreement([article('Anderer Text.')], publication)).toMatchObject({ ok: false });
  });

  it('„In der Inhaltsübersicht …“, „Die Inhaltsübersicht wird …“ sind Befehle zur Inhaltsübersicht (GVBl. 2018 S. 301, BayDSG); die Überschrift eines Artikels nicht', () => {
    expect(TOC_COMMAND.test('In der Inhaltsübersicht wird der Angabe zu Art. 29 das Wort „ , DNA-Untersuchungen“ angefügt.')).toBe(true);
    expect(TOC_COMMAND.test('Die Inhaltsübersicht wird wie folgt geändert:')).toBe(true);
    expect(TOC_COMMAND.test('Der Überschrift wird das Wort „ , DNA-Untersuchungen“ angefügt.')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- Befehlsformen */

describe('Befehlsformen, Lauf 9', () => {
  it('„der Betrag“ und „der Schlusspunkt“ als Gegenstand', () => {
    expect(parseCommand('In Satz 1 wird der Betrag „5 000 Euro“ durch den Betrag „6 000 Euro“ ersetzt.', [])).toMatchObject({ formulas: ['replace-words'], operations: [{ operation: { kind: 'replace', from: '5 000 Euro', to: '6 000 Euro' } }] });
    expect(parseCommand('Der Schlusspunkt wird durch ein Komma ersetzt.', parseLocation('Nr. 2')!)).toMatchObject({ formulas: ['replace-final-punctuation'], operations: [{ operation: { kind: 'replace-final', from: '.', to: ',' } }] });
  });

  it('mehrere Orte ohne „jeweils“ gelten je Ort (jeder Ort eindeutig)', () => {
    expect(parseCommand('In Abs. 1 und Abs. 2 wird das Wort „alt“ durch das Wort „neu“ ersetzt.', [])).toMatchObject({ operations: [{ each: true, locations: [[{ kind: 'absatz', value: '1' }], [{ kind: 'absatz', value: '2' }]] }] });
  });

  it('„wird gelöscht“ ist Aufhebung', () => {
    expect(restoreRequest('Nr. 3 wird gelöscht.', [], [], 'repeal-unit')).toMatchObject({ kind: 'repeal-blocks', location: 'Nr. 3' });
  });

  it('„Der bisherige Wortlaut wird Satz 1.“ und „Die Satznummerierung in Satz 1 wird gestrichen.“', () => {
    expect(parseStructural('Der bisherige Wortlaut wird Satz 1.', parseLocation('Abs. 2')!, [])).toMatchObject({ formula: 'number-sentences' });
    expect(parseStructural('Die Satznummerierung in Satz 1 wird gestrichen.', parseLocation('Abs. 2')!, [])).toMatchObject({ formula: 'unnumber-sentences' });
  });

  it('Ortsangaben: Halbsätze, einleitender Satzteil, Vorspann', () => {
    expect(parseLocation('Satz 1 Halbsätze 1 und 2')!.map(formatPath)).toEqual(['Satz 1 Halbsatz 1', 'Satz 1 Halbsatz 2']);
    expect(parseLocation('Abs. 1 Satz 2 Halbsatz 2')!.map(formatPath)).toEqual(['Abs. 1 Satz 2 Halbsatz 2']);
    expect(parseLocation('Abs. 1 einleitender Satzteil')!.map(formatPath)).toEqual(['Abs. 1 einleitender Satzteil']);
    expect(parseLocation('Nr. 2 Vorspann')!.map(formatPath)).toEqual(['Nr. 2 Vorbemerkung']);
  });

  it('Halbsatz: der Teil des Satzes zwischen den Semikola', () => {
    const body = [{ type: 'paragraph', label: '§ 1', children: [{ type: 'subparagraph', label: '(1)', text: '¹Erster Teil; zweiter Teil mit Wort. ²Weiter Wort.' }] }] as NormBodyBlock[];
    expect(resolvePath(body, parseLocation('§ 1 Abs. 1 Satz 1 Halbsatz 2')![0]!)).toMatchObject({ ok: true, scope: { sentence: 1, halfSentence: 2 } });
    const text = '¹Erster Teil; zweiter Teil mit Wort. ²Weiter.';
    const range = halfSentenceRange(text, 0, text.indexOf('²'), 2);
    if (range === undefined || range === 'none') throw new Error('Halbsatz 2 nicht gefunden');
    expect(text.slice(range.start, range.end)).toContain('zweiter Teil mit Wort.');
    expect(text.slice(range.start, range.end)).not.toContain('Erster');
  });
});

/* -------------------------------------------------------------------------- PDF-Textlayer */

describe('PDF: nur Textlayer, nie OCR', () => {
  const build = (options: { producer?: string; invisible?: boolean }): Uint8Array => {
    const content = deflateSync(Buffer.from(`BT ${options.invisible ? '3 Tr ' : ''}/F1 12 Tf 72 700 Td (Verordnung) Tj ET`, 'latin1'));
    const chunks: Buffer[] = [
      Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /MediaBox [0 0 595 842] >> endobj\n', 'latin1'),
      Buffer.from(`4 0 obj << /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream\nendobj\n', 'latin1'),
      Buffer.from('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n', 'latin1'),
      Buffer.from(`6 0 obj << ${options.producer ? `/Producer (${options.producer})` : '/Creator (Satz)'} >> endobj\ntrailer << /Root 1 0 R /Info 6 0 R >>\n%%EOF\n`, 'latin1'),
    ];
    return new Uint8Array(Buffer.concat(chunks));
  };

  it('ein gesetzter Textlayer wird gelesen', () => {
    expect(pdfText(build({}))).toMatchObject({ ok: true, pages: ['Verordnung'] });
  });

  it('unsichtbarer Text (3 Tr) über dem Seitenbild und Erzeuger einer Texterkennung: keine Quelle', () => {
    expect(pdfText(build({ invisible: true }))).toMatchObject({ ok: false, reason: expect.stringMatching(/Texterkennung/u) });
    expect(pdfText(build({ producer: 'Adobe Acrobat 9.0 Paper Capture Plug-in' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/Texterkennung/u) });
  });

  it('Mehrdeutigkeit im Textlayer (GVBl. 2006 Nr. 9, 2007 S. 640): Unterschneidung, Trennstrich am Zeilenende, Satznummern als Ziffern', () => {
    const layer = (name: string): string => {
      const parsed = JSON.parse(fixture(name)) as { pages: string[] | Record<string, string> };
      return (Array.isArray(parsed.pages) ? parsed.pages : Object.values(parsed.pages)).join(' ');
    };
    const found2006 = layerAmbiguities(layer('gvbl-2006-09-textlayer-s189-190.json'));
    expect(found2006.kerning).toContain('T agen');
    expect(found2006.hyphenation).toContain('Finanzausgleichs- änderungsgesetz');
    expect(found2006.sentenceNumbers.length).toBeGreaterThan(0);
    expect(layerAmbiguities(layer('gvbl-2007-20-textlayer-s640.json')).kerning).toContain('V om');
    // Ergänzungsstrich vor einer Konjunktion ist kein Trennstrich am Zeilenende.
    expect(layerAmbiguities('Mahn- und Vollstreckungsgebühren').hyphenation).toEqual([]);
    expect(layerAmbiguities('Die Verordnung tritt am 1. Januar 2007 in Kraft.')).toEqual({ kerning: [], hyphenation: [], sentenceNumbers: [] });
  });
});
