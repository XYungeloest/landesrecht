/**
 * Dokumentidentität und Plausibilität des Normkörpers (DocumentIdentityAndBodySanityCheck) ohne Netz:
 * Regression VV zum Landeshundegesetz, Gesetzesbegründung als falscher Normkörper im echten Portalrahmen,
 * keine Fehlalarme bei Drucksachenverweisen und „Begründung“ als Rechtsbegriff, fremdes Dokument unter
 * dem Portaltitel sowie Grenzfälle der Titelüberlappung und des fast leeren Normkörpers.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkDocumentIdentityAndBody, significantTokens, titleOverlap, type DocumentSanityInput, type DocumentSanityResult } from '@landesrecht/importer-recht-nrw/common/document-sanity.ts';
import { parseLegacyDocument } from '@landesrecht/importer-recht-nrw/common/legacy-parser.ts';
import { parseNativeDocument } from '@landesrecht/importer-recht-nrw/common/native-parser.ts';
import { parseVersionPage, type RechtNrwVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';
import { parseLrmbDocument, type LrmbParseResult } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { parseChangeNote, parseDecreeFromTitle } from '@landesrecht/importer-recht-nrw/lrmb/text-metadata.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

const sources = join(process.cwd(), 'sources', 'recht-nrw');
const source = (path: string): Promise<string> => readFile(join(sources, path), 'utf8');

const LHUNDG = { page: 'term-23528/1febb67789d814c3-version-page.html', url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landeshundegesetz-vv-lhundg-nrw' };
const KAMPFMITTEL = { page: 'term-33475/e1f0e23dc6efa79a-version-page.html', url: 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/01062022-runderlass-kostentragung-der-kampfmittelbeseitigung' };
const LOEG = { page: 'term-29216/08b72cf141102815-version-page.html', url: 'https://recht.nrw.de/lrgv/gesetz/30032018-gesetz-zur-regelung-der-ladenoeffnungszeiten-ladenoeffnungsgesetz-loeg-nrw' };
const LBTG = { page: 'term-27474/6665d65c72af8666-version-page.html', text: 'term-27474/c748604876855e9f-legacy-text.html', url: 'https://recht.nrw.de/lrgv/gesetz/01012023-gesetz-zur-ausfuehrung-des-betreuungsgesetzes-landesbetreuungsgesetz-lbtg' };
const ABGG = { page: 'term-28924/dfac7c86f4c1cfb8-version-page.html', text: 'term-28924/e55ad347d18055d5-legacy-text.html', url: 'https://recht.nrw.de/lrgv/gesetz/01072023-abgeordnetengesetz-des-landes-nordrhein-westfalen-abgg-nrw' };
const VWVFG = { page: 'term-27995/0921b83b350fd544-version-page.html', text: 'term-27995/a52114591796a472-legacy-text.html', url: 'https://recht.nrw.de/lrgv/gesetz/05052023-verwaltungsverfahrensgesetz-fuer-das-land-nordrhein-westfalen' };

/** Amtlicher Titel des Landeshundegesetzes auf RECHT.NRW (Bereich LRGV). */
const LANDESHUNDEGESETZ_TITLE = 'Hundegesetz für das Land Nordrhein-Westfalen (Landeshundegesetz - LHundG NRW)';

type Paragraphs = ReadonlyArray<readonly [text: string, bold: boolean]>;

/**
 * Nachgebildeter Auszug im amtlichen Aufbau eines Gesetzentwurfs der Landesregierung als Landtagsdrucksache
 * NRW (Kopf mit Drucksachennummer, Vorblatt A–E, Begründung mit Allgemeinem und Besonderem Teil).
 */
const LANDTAG_GESETZENTWURF: Paragraphs = [
  ['LANDTAG NORDRHEIN-WESTFALEN 17. Wahlperiode Drucksache 17/1234 12.12.2017', false],
  ['Gesetzentwurf der Landesregierung', true],
  ['Gesetz zur Änderung des Landeshundegesetzes', true],
  ['A Problem', true],
  ['Die Anforderungen an die Sachkunde von Halterinnen und Haltern großer Hunde haben sich in der Praxis als zu unbestimmt erwiesen.', false],
  ['B Lösung', true],
  ['Der Gesetzentwurf konkretisiert die Sachkundeanforderungen und die Zuständigkeit der örtlichen Ordnungsbehörden.', false],
  ['C Alternativen', true],
  ['Keine.', false],
  ['D Kosten', true],
  ['Für das Land und die Kommunen entstehen keine zusätzlichen Kosten.', false],
  ['E Zuständigkeit', true],
  ['Zuständig ist das für den Tierschutz zuständige Ministerium.', false],
  ['Begründung', true],
  ['A. Allgemeiner Teil', true],
  ['Das Landeshundegesetz hat sich seit seinem Inkrafttreten grundsätzlich bewährt. Die Änderungen dienen der Klarstellung und der Entlastung der Ordnungsbehörden.', false],
  ['B. Besonderer Teil', true],
  ['Zu § 1', true],
  ['Die Vorschrift bestimmt den Zweck des Gesetzes unverändert; ergänzt wird der Schutz vor Gefahren, die von Hunden ausgehen.', false],
];

/**
 * Echter Gesetzesentwurf mit Begründung aus dem Simulationsbestand, gekürzt und nur lesend übernommen aus
 * `../staatsregierung/context/entwürfe/Standortgesetz.md` (Gesetzesentwurf der Staatsregierung).
 */
const STAATSREGIERUNG_ENTWURF: Paragraphs = [
  ['Gesetzesentwurf der Staatsregierung', true],
  ['Entwurf eines Gesetzes zur Umsetzung des Vorhabens „Boom Europe Leipzig/Halle“ und zur Errichtung eines Sondervermögens Hochgeschwindigkeitsluftfahrt Ost', true],
  ['A. Problem und Ziel', true],
  ['Der Freistaat Ostdeutschland beabsichtigt, den Flughafen Leipzig/Halle zu einem europäischen Standort für Hochgeschwindigkeitsluftfahrt, nachhaltige Überschalltechnologie, Wartung, Testinfrastruktur, Ausbildung und industrielle Wertschöpfung zu entwickeln.', false],
  ['B. Lösungen', true],
  ['Mit dem Gesetz werden ein Hochgeschwindigkeitsluftfahrt-Standortgesetz und ein Sondervermögen Hochgeschwindigkeitsluftfahrt Ost geschaffen.', false],
  ['C. Alternativen', true],
  ['Keine.', false],
  ['Begründung', true],
  ['A. Allgemeiner Teil', true],
  ['I. Wesentlicher Inhalt des Entwurfs', true],
  ['Mit dem Gesetz wird das Vorhaben „Boom Europe Leipzig/Halle“ rechtlich flankiert. Ziel ist es, die Ansiedlung eines europäischen Standortes für Hochgeschwindigkeitsluftfahrt am Flughafen Leipzig/Halle vorzubereiten.', false],
  ['B. Besonderer Teil', true],
  ['Zu Artikel 1', true],
  ['Artikel 1 führt das Hochgeschwindigkeitsluftfahrt-Standortgesetz ein.', false],
  ['Zu § 1', true],
  ['Die Vorschrift enthält die für das Gesetz erforderlichen Begriffsbestimmungen. Die Begriffsbestimmungen dienen der einheitlichen Anwendung des Gesetzes.', false],
  ['Zu § 2', true],
  ['Absatz 1 bestimmt das Vorhaben „Boom Europe Leipzig/Halle“ als luftfahrtindustrielles Vorhaben von besonderer Landesbedeutung.', false],
];

/** Ersetzt die `legaldoc-article`-Sektionen einer echten nativen Portalseite durch einen anderen Dokumentkörper. */
function replaceNativeBody(pageHtml: string, paragraphs: Paragraphs): string {
  const start = pageHtml.indexOf('<section class="legaldoc-article"');
  const end = pageHtml.lastIndexOf('</section>') + '</section>'.length;
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const body = paragraphs.map(([text, bold]) => (bold ? `<p><strong>${text}</strong></p>` : `<p>${text}</p>`)).join('');
  return `${pageHtml.slice(0, start)}<section class="legaldoc-article"><div class="field field--field_text">${body}</div></section>${pageHtml.slice(end)}`;
}

interface LrmbDocument {
  page: RechtNrwVersionPage;
  parse: LrmbParseResult;
}

async function lrmbDocument(file: { page: string; url: string }): Promise<LrmbDocument> {
  const page = parseVersionPage(await source(file.page), file.url);
  return { page, parse: parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '') };
}

/** Eingabe wie in `lrmb/pipeline.ts` (Stufe document-identity); `embedded` ist der tatsächlich eingebettete Körper. */
function lrmbSanityInput(portal: LrmbDocument, embedded: LrmbParseResult = portal.parse): DocumentSanityInput {
  const { page } = portal;
  const titleDecree = parseDecreeFromTitle(page.title);
  const changeNote = embedded.changeNoteText ? parseChangeNote(embedded.changeNoteText) : undefined;
  const titleDecreeSignals: { issuedOn?: string; fileReference?: string } = {};
  if (titleDecree?.issuedOn) titleDecreeSignals.issuedOn = titleDecree.issuedOn;
  if (titleDecree?.fileReference) titleDecreeSignals.fileReference = titleDecree.fileReference;
  return {
    sourceArea: 'lrmb',
    portalType: page.address.documentType,
    portalTitle: titleDecree?.title ?? page.title,
    documentTitleLines: embedded.head.titleLines,
    head: embedded.head,
    ...(titleDecree ? { titleDecree: titleDecreeSignals } : {}),
    ...(page.issuedOn ? { infoboxIssuedOn: page.issuedOn } : {}),
    ...(changeNote?.base ? { baseCitation: changeNote.base.text } : {}),
    blocks: embedded.blocks,
    attachments: page.attachments,
  };
}

interface LrgvDocument {
  page: RechtNrwVersionPage;
  blocks: NormBodyBlock[];
  titleLines: string[];
}

async function lrgvLegacyDocument(file: { page: string; text: string; url: string }): Promise<LrgvDocument> {
  const page = parseVersionPage(await source(file.page), file.url);
  expect(page.content.format).toBe('legacy-file');
  const parsed = parseLegacyDocument(await source(file.text));
  return { page, blocks: parsed.blocks, titleLines: parsed.head.titleLines };
}

function lrgvNativeDocument(pageHtml: string, url: string): LrgvDocument {
  const page = parseVersionPage(pageHtml, url);
  expect(page.content.format).toBe('native');
  return { page, blocks: parseNativeDocument(page.content.format === 'native' ? page.content.bodyHtml : '').blocks, titleLines: [] };
}

/** Eingabe wie in `lrgv/pipeline.ts` (Stufe document-identity). */
function lrgvSanityInput(document: LrgvDocument, portalTitle = document.page.title): DocumentSanityInput {
  const { page } = document;
  return {
    sourceArea: 'lrgv',
    portalType: page.address.documentType,
    portalTitle,
    ...(document.titleLines.length > 0 ? { documentTitleLines: document.titleLines } : {}),
    ...(page.issuedOn ? { infoboxIssuedOn: page.issuedOn } : {}),
    ...(page.promulgation ? { baseCitation: page.promulgation } : {}),
    blocks: document.blocks,
    attachments: page.attachments,
  };
}

const codes = (result: DocumentSanityResult): string[] => result.findings.map((finding) => finding.code);
const signalCodes = (result: DocumentSanityResult): string[] => result.signals.map((signal) => signal.code);

function findBlock(blocks: readonly NormBodyBlock[], predicate: (block: NormBodyBlock) => boolean): NormBodyBlock | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block;
    const child = block.children ? findBlock(block.children, predicate) : undefined;
    if (child) return child;
  }
  return undefined;
}

const LONG_TEXT = 'Die zuständige Behörde prüft die Anträge nach pflichtgemäßem Ermessen und entscheidet innerhalb von drei Monaten nach Eingang der vollständigen Unterlagen schriftlich über die Bewilligung.';

describe('Dokumentidentität: VV zum Landeshundegesetz (Regression, archivierte Originalquelle)', () => {
  it('VV LHundG NRW mit Allgemeinem/Besonderem Teil und „Zu § …“ ist consistent ohne Fehlerbefund', async () => {
    const lhundg = await lrmbDocument(LHUNDG);
    const result = checkDocumentIdentityAndBody(lrmbSanityInput(lhundg));
    expect(result.status).toBe('consistent');
    expect(result.findings).toEqual([]);
    expect(result.materials.structural).toBe(false);
    expect(result.materials.headingMarkers).toEqual(expect.arrayContaining(['allgemeiner-teil', 'besonderer-teil', 'zu-paragraph']));
    expect(result.signals.find((signal) => signal.code === 'commentary-structure')?.effect).toBe('doubts');
    expect(result.enactment.strong).toEqual([expect.stringContaining('ergehen folgende Verwaltungsvorschriften'), expect.stringContaining('Erlasskopf')]);
    expect(result.enactment.supporting).toEqual(['Fundstelle MBl. NRW. 2003 S. 580']);
    expect(result.titleSimilarity).toBe(1);
  });
});

describe('Dokumentidentität: Gesetzesbegründung als falscher Normkörper', () => {
  it('Gesetzentwurf der Landesregierung (Drucksache, A Problem … Zu § 1) im echten Portalrahmen des LÖG NRW → mismatch', async () => {
    const pageHtml = await source(LOEG.page);
    const original = checkDocumentIdentityAndBody(lrgvSanityInput(lrgvNativeDocument(pageHtml, LOEG.url)));
    expect(original.status).toBe('consistent');

    const materials = lrgvNativeDocument(replaceNativeBody(pageHtml, LANDTAG_GESETZENTWURF), LOEG.url);
    expect(materials.page.title).toBe('Gesetz zur Regelung der Ladenöffnungszeiten (Ladenöffnungsgesetz - LÖG NRW)');
    const result = checkDocumentIdentityAndBody(lrgvSanityInput(materials));
    expect(result.status).toBe('mismatch');
    expect(result.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'document-identity-mismatch' })]);
    expect(result.findings[0]!.message).toContain('Gliederung eines Gesetzgebungsmaterials ohne amtlichen Erlass- oder Verkündungsbeleg');
    expect(result.materials.structural).toBe(true);
    expect(result.materials.headingMarkers).toEqual(expect.arrayContaining(['gesetzentwurf', 'problem', 'loesung', 'alternativen', 'kosten', 'begruendung', 'allgemeiner-teil', 'besonderer-teil', 'zu-paragraph']));
    expect(result.materials.textMarkers).toContain('drucksache');
    expect(signalCodes(result)).not.toContain('drucksache-reference');
    expect(result.enactment.strong).toEqual([]);
  });

  it('echte Begründung eines Gesetzesentwurfs aus dem Simulationsbestand im Portalrahmen → mismatch', async () => {
    const materials = lrgvNativeDocument(replaceNativeBody(await source(LOEG.page), STAATSREGIERUNG_ENTWURF), LOEG.url);
    const result = checkDocumentIdentityAndBody(lrgvSanityInput(materials));
    expect(result.status).toBe('mismatch');
    expect(codes(result)).toEqual(['document-identity-mismatch']);
    expect(result.materials.headingMarkers).toEqual(expect.arrayContaining(['gesetzentwurf', 'problem', 'begruendung', 'allgemeiner-teil', 'besonderer-teil', 'zu-paragraph']));
  });

  it('Gesetzesbegründung im LRMB-Rahmen der VV-LHundG-Seite ohne Erlasskopf → mismatch', async () => {
    const lhundg = await lrmbDocument(LHUNDG);
    const blocks: NormBodyBlock[] = LANDTAG_GESETZENTWURF.map(([text]) => ({ type: 'paragraphText', text }));
    const embedded: LrmbParseResult = { ...lhundg.parse, head: { titleLines: [], consumed: 0 }, blocks };
    delete embedded.changeNoteText;
    const result = checkDocumentIdentityAndBody(lrmbSanityInput(lhundg, embedded));
    expect(result.status).toBe('mismatch');
    expect(codes(result)).toEqual(['document-identity-mismatch']);
  });

  it('Materialienstruktur trotz amtlicher Eingangsformel führt nur zur Review, nicht zum Ausschluss', () => {
    const blocks: NormBodyBlock[] = [
      { type: 'paragraphText', text: 'Der Landtag hat das folgende Gesetz beschlossen, das hiermit verkündet wird:' },
      ...LANDTAG_GESETZENTWURF.map(([text]): NormBodyBlock => ({ type: 'paragraphText', text })),
    ];
    const result = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: LANDESHUNDEGESETZ_TITLE, blocks });
    expect(result.status).toBe('review');
    expect(result.findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'document-identity-review' })]);
    expect(result.findings[0]!.message).toContain('Materialienstruktur trotz Erlassbeleg');
  });
});

describe('Dokumentidentität: keine Fehlalarme bei Drucksachen und „Begründung“ als Rechtsbegriff', () => {
  it('echtes Abgeordnetengesetz mit Drucksachen-Bezug im Normtext bleibt consistent', async () => {
    const abgg = await lrgvLegacyDocument(ABGG);
    expect(findBlock(abgg.blocks, (block) => /als Drucksache veröffentlicht/u.test(block.text ?? ''))).toBeDefined();
    const result = checkDocumentIdentityAndBody(lrgvSanityInput(abgg));
    expect(result.status).toBe('consistent');
    expect(result.findings).toEqual([]);
    expect(result.materials).toEqual({ structural: false, headingMarkers: [], textMarkers: [] });
  });

  it('Fußnote und Änderungsvermerk mit „Drucksache 17/1234“ an einer echten Norm → consistent, nur unterstützender Hinweis', async () => {
    const loeg = lrgvNativeDocument(await source(LOEG.page), LOEG.url);
    const annotated: LrgvDocument = {
      ...loeg,
      blocks: [
        { type: 'paragraphText', text: 'Änderung vgl. Drucksache 17/1234' },
        ...loeg.blocks,
        { type: 'footnote', label: 'Fn 1', text: 'SGV. NRW. 7113; geändert durch Gesetz vom 22. März 2018 (GV. NRW. S. 172), in Kraft getreten am 30. März 2018; Gesetzentwurf der Landesregierung: Drucksache 17/1234.' },
      ],
    };
    const result = checkDocumentIdentityAndBody(lrgvSanityInput(annotated));
    expect(result.status).toBe('consistent');
    expect(result.findings).toEqual([]);
    expect(result.materials).toMatchObject({ structural: false, textMarkers: ['drucksache'] });
    expect(result.signals.find((signal) => signal.code === 'drucksache-reference')?.effect).toBe('supports');

    const lhundg = await lrmbDocument(LHUNDG);
    const withFootnote: LrmbParseResult = { ...lhundg.parse, blocks: [...lhundg.parse.blocks, { type: 'footnote', label: '1', text: 'Vgl. die Begründung zum Gesetzentwurf der Landesregierung zum Landeshundegesetz, Landtagsdrucksache 13/2387, S. 12.' }] };
    expect(checkDocumentIdentityAndBody(lrmbSanityInput(lhundg, withFootnote)).status).toBe('consistent');
  });

  it('„§ 39 Begründung des Verwaltungsaktes“ im echten VwVfG NRW ist kein Materialienhinweis', async () => {
    const vwvfg = await lrgvLegacyDocument(VWVFG);
    const section39 = findBlock(vwvfg.blocks, (block) => block.type === 'paragraph' && block.label === '§ 39');
    expect(section39?.title).toBe('Begründung des Verwaltungsaktes');
    const result = checkDocumentIdentityAndBody(lrgvSanityInput(vwvfg));
    expect(result.status).toBe('consistent');
    expect(result.findings).toEqual([]);
    expect(result.materials.headingMarkers).toEqual([]);
  });

  it('„Die Begründung des Verwaltungsakts ist …“ und eine Normüberschrift „Begründung“ lösen keinen Alarm aus', () => {
    const blocks: NormBodyBlock[] = [
      { type: 'paragraph', label: '§ 39', title: 'Begründung des Verwaltungsaktes', children: [{ type: 'subparagraph', label: '(1)', text: 'Die Begründung des Verwaltungsakts ist schriftlich zu erteilen. In der Begründung sind die wesentlichen tatsächlichen und rechtlichen Gründe mitzuteilen.' }] },
      { type: 'paragraph', label: '§ 40', title: 'Begründung', children: [{ type: 'subparagraph', label: '(1)', text: 'Einer Begründung bedarf es nicht, soweit die Behörde einem Antrag entspricht und der Verwaltungsakt nicht in Rechte eines anderen eingreift.' }] },
    ];
    const result = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: 'Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen', blocks });
    expect(result.status).toBe('consistent');
    expect(result.materials.structural).toBe(false);
    expect(signalCodes(result)).not.toContain('materials-structure');
  });

  it('Normüberschrift „§ 5 Begründung“ in einer Prüfungsordnung mit Allgemeinem und Besonderem Teil ist kein Materialiendokument', () => {
    const unit = (label: string, title: string, text: string): NormBodyBlock => ({ type: 'paragraph', label, title, children: [{ type: 'subparagraph', label: '(1)', text }] });
    const blocks: NormBodyBlock[] = [
      { type: 'part', label: 'Teil 1', title: 'Allgemeiner Teil', children: [
        unit('§ 4', 'Bewertung der Prüfungsleistungen', 'Die Prüfungsleistungen sind von zwei Prüfenden unabhängig voneinander zu bewerten; die Bewertung ist schriftlich festzuhalten.'),
        unit('§ 5', 'Begründung', 'Die Begründung der Bewertung ist dem Prüfling auf Antrag schriftlich mitzuteilen.'),
      ] },
      { type: 'part', label: 'Teil 2', title: 'Besonderer Teil', children: [unit('§ 6', 'Schriftliche Prüfung', 'Die schriftliche Prüfung besteht aus vier Aufsichtsarbeiten.')] },
    ];
    const result = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'rechtsverordnung', portalTitle: 'Ausbildungs- und Prüfungsordnung für den gehobenen nichttechnischen Dienst', blocks });
    expect(result.materials.structural).toBe(false);
    expect(result.status).toBe('consistent');
  });
});

describe('Dokumentidentität: anderes Dokument unter dem Portaltitel (Landeshundegesetz)', () => {
  it('Portalseite „VV zum Landeshundegesetz“ mit eingebettetem Runderlass zur Kampfmittelbeseitigung → mismatch (blockiert)', async () => {
    const lhundg = await lrmbDocument(LHUNDG);
    const kampfmittel = await lrmbDocument(KAMPFMITTEL);
    const result = checkDocumentIdentityAndBody(lrmbSanityInput(lhundg, kampfmittel.parse));
    expect(result.status).toBe('mismatch');
    expect(result.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'document-identity-mismatch' })]);
    expect(result.findings[0]!.message).toContain('eingebettetes Dokument gehört nicht zum Portaltitel');
    expect(result.signals.find((signal) => signal.code === 'title-contradiction')?.effect).toBe('contradicts');
    expect(result.titleSimilarity).toBe(0);
    // Der Erlasskopf des fremden Dokuments ist kein Beleg für die behauptete Vorschrift.
    expect(result.enactment.strong.length).toBeGreaterThan(0);
  });

  it('Titel „Landeshundegesetz“ mit eingebettetem Landesbetreuungsgesetz → mismatch trotz gemeinsamem Wortanfang „Landes…“', async () => {
    const lbtg = await lrgvLegacyDocument(LBTG);
    expect(lbtg.titleLines.join(' ')).toContain('Landesbetreuungsgesetz');
    expect(checkDocumentIdentityAndBody(lrgvSanityInput(lbtg)).status).toBe('consistent');

    const result = checkDocumentIdentityAndBody(lrgvSanityInput(lbtg, LANDESHUNDEGESETZ_TITLE));
    expect(result.status).toBe('mismatch');
    expect(codes(result)).toEqual(['document-identity-mismatch']);
    expect(result.titleSimilarity).toBe(0);
  });

  it('fremder Titel im eingebetteten Dokument blockiert auch mit übereinstimmendem Datum und Fundstelle', async () => {
    const abgg = await lrgvLegacyDocument(ABGG);
    const result = checkDocumentIdentityAndBody({ ...lrgvSanityInput(abgg, LANDESHUNDEGESETZ_TITLE), infoboxIssuedOn: '2002-12-18', baseCitation: 'GV. NRW. 2002 S. 656' });
    expect(result.status).toBe('mismatch');
  });
});

describe('Dokumentidentität: Titelüberlappung und Grenzfälle', () => {
  it('signifikante Wörter ohne Stoppwörter, Länderbezeichnung und Zahlen; Umlaute vereinheitlicht', () => {
    expect([...significantTokens('Gesetz zur Regelung der Ladenöffnungszeiten (Ladenöffnungsgesetz - LÖG NRW) vom 16. November 2006')]).toEqual(['regelung', 'ladenoeffnungszeiten', 'ladenoeffnungsgesetz', 'loeg', 'november']);
    expect(significantTokens('für das Land Nordrhein-Westfalen').size).toBe(0);
    // Dokumenttypwörter tragen keine Identität.
    expect(significantTokens('Allgemeine Verwaltungsvorschriften zum Runderlass').size).toBe(0);
  });

  it('Flexionsformen zählen als Übereinstimmung, ein bloß gemeinsamer Wortanfang zusammengesetzter Wörter nicht', () => {
    expect(titleOverlap(LANDESHUNDEGESETZ_TITLE, 'Gesetz zur Änderung des Landeshundegesetzes (LHundG NRW)').similarity).toBeGreaterThanOrEqual(0.5);
    expect(titleOverlap('Verwaltungsvorschriften zum Landeshundegesetz (VV LHundG NRW)', 'Verwaltungsvorschrift zum Landeshundegesetz').similarity).toBe(1);
    expect(titleOverlap(LANDESHUNDEGESETZ_TITLE, 'Landesbauordnung 2018 (BauO NRW 2018)')).toEqual({ similarity: 0, comparable: true });
    expect(titleOverlap(LANDESHUNDEGESETZ_TITLE, 'Gesetz zur Ausführung des Betreuungsgesetzes (Landesbetreuungsgesetz - LBtG)')).toEqual({ similarity: 0, comparable: true });
  });

  it('ohne identitätstragendes Wort nicht vergleichbar; ein einzelnes Wort genügt und deckt ein fremdes Dokument auf', () => {
    const body: NormBodyBlock[] = [{ type: 'paragraph', label: '§ 1', children: [{ type: 'paragraphText', text: LONG_TEXT }] }];
    expect(titleOverlap('Verwaltungsvorschriften', 'Allgemeine Verwaltungsvorschrift')).toEqual({ similarity: 1, comparable: false });
    const generic = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: 'Verwaltungsvorschriften', documentTitleLines: ['Allgemeine Verwaltungsvorschrift'], blocks: body });
    expect(generic.titleSimilarity).toBeUndefined();
    expect(signalCodes(generic).filter((code) => code.startsWith('title-'))).toEqual([]);

    expect(titleOverlap('Landeshundegesetz', 'Runderlass Kostentragung in der Kampfmittelbeseitigung')).toEqual({ similarity: 0, comparable: true });
    const foreign = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: 'Landeshundegesetz', documentTitleLines: ['Runderlass Kostentragung in der Kampfmittelbeseitigung'], blocks: body });
    expect(foreign.titleSimilarity).toBe(0);
    expect(foreign.status).toBe('mismatch');
  });

  it('Grenzen: ab 0,5 übereinstimmend, unter 0,2 Widerspruch, dazwischen schwach (Review nur ohne Erlassbeleg)', () => {
    const lrgv = (portalTitle: string, documentTitle: string): DocumentSanityResult => checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle, documentTitleLines: [documentTitle], blocks: [{ type: 'paragraph', label: '§ 1', children: [{ type: 'paragraphText', text: LONG_TEXT }] }] });
    const lrmb = (portalTitle: string, documentTitle: string): DocumentSanityResult => checkDocumentIdentityAndBody({ sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle, documentTitleLines: [documentTitle], head: { decreeKind: 'runderlass', issuingAuthorityText: 'des Ministeriums für Heimat, Kommunales, Bau und Digitalisierung' }, blocks: [{ type: 'paragraphText', text: LONG_TEXT }] });

    const half = lrgv('Zuwendungen Sportstätten', 'Zuwendungen Schwimmbäder');
    expect([half.titleSimilarity, half.status]).toEqual([0.5, 'consistent']);
    expect(signalCodes(half)).toContain('title-consistent');

    const third = lrgv('Zuwendungen Sportstätten Vereine', 'Zuwendungen Schwimmbäder Kommunen');
    expect([third.titleSimilarity, third.status]).toEqual([0.33, 'review']);
    expect(third.findings[0]!.message).toContain('Titel nur teilweise übereinstimmend ohne Erlassbeleg');
    expect(lrmb('Zuwendungen Sportstätten Vereine', 'Zuwendungen Schwimmbäder Kommunen').status).toBe('consistent');

    const fifth = lrgv('Zuwendungen Sportstätten Vereine Turnhallen Bolzplätze', 'Zuwendungen Schwimmbäder Kommunen Museen Theater');
    expect([fifth.titleSimilarity, fifth.status]).toEqual([0.2, 'review']);
    expect(signalCodes(fifth)).toContain('title-weak');

    const sixth = lrgv('Zuwendungen Sportstätten Vereine Turnhallen Bolzplätze Spielplätze', 'Zuwendungen Schwimmbäder Kommunen Museen Theater Bibliotheken');
    expect([sixth.titleSimilarity, sixth.status]).toEqual([0.17, 'mismatch']);
    expect(lrmb('Zuwendungen Sportstätten Vereine Turnhallen Bolzplätze Spielplätze', 'Zuwendungen Schwimmbäder Kommunen Museen Theater Bibliotheken').status).toBe('mismatch');
  });

  it('fast leerer Normkörper ohne Anlagen → review; mit Anlage kein Leerbefund', () => {
    const empty = checkDocumentIdentityAndBody({ sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle: 'Runderlass Kostentragung in der Kampfmittelbeseitigung', head: { decreeKind: 'runderlass', issuingAuthorityText: 'des Ministeriums des Innern' }, blocks: [{ type: 'paragraphText', text: 'Aufgehoben.' }] });
    expect(empty.status).toBe('review');
    expect(empty.findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'document-identity-review' })]);
    expect(empty.findings[0]!.message).toContain('Normkörper nahezu leer');
    expect(signalCodes(empty)).toContain('body-nearly-empty');

    const withAnnex = checkDocumentIdentityAndBody({ sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle: 'Runderlass Kostentragung in der Kampfmittelbeseitigung', head: { decreeKind: 'runderlass', issuingAuthorityText: 'des Ministeriums des Innern' }, blocks: [{ type: 'paragraphText', text: 'Die Richtlinien werden als Anlage bekannt gegeben.' }], attachments: [{ label: 'Anlage (PDF)', mediaType: 'application/pdf' }] });
    expect(signalCodes(withAnnex)).not.toContain('body-nearly-empty');
    expect(withAnnex.status).toBe('consistent');

    const lawWithoutUnits = checkDocumentIdentityAndBody({ sourceArea: 'lrgv', portalType: 'gesetz', portalTitle: LANDESHUNDEGESETZ_TITLE, blocks: [{ type: 'paragraphText', text: '(weggefallen)' }] });
    expect(lawWithoutUnits.status).toBe('review');
    expect(signalCodes(lawWithoutUnits)).toEqual(expect.arrayContaining(['body-nearly-empty', 'no-legal-units']));
  });

  it('Datums- und Aktenzeichenwiderspruch zwischen Erlasskopf, Portaltitel und Infobox → review', () => {
    const base: DocumentSanityInput = { sourceArea: 'lrmb', portalType: 'verwaltungsvorschrift', portalTitle: 'Verwaltungsvorschriften zum Landeshundegesetz (VV LHundG NRW)', documentTitleLines: ['Verwaltungsvorschriften zum Landeshundegesetz', '(VV LHundG NRW)'], head: { decreeKind: 'runderlass', issuingAuthorityText: 'd. Ministeriums für Umwelt', issuedOn: '2003-05-02', fileReference: 'VI-7 - 78.01.52' }, blocks: [{ type: 'paragraphText', text: LONG_TEXT }] };
    expect(checkDocumentIdentityAndBody({ ...base, infoboxIssuedOn: '2003-05-02' }).status).toBe('consistent');
    const dates = checkDocumentIdentityAndBody({ ...base, infoboxIssuedOn: '2003-05-12' });
    expect(dates.status).toBe('review');
    expect(dates.findings[0]!.message).toContain('Datumswiderspruch');
    const references = checkDocumentIdentityAndBody({ ...base, titleDecree: { issuedOn: '2003-05-02', fileReference: 'III 5 - 1234' } });
    expect(references.status).toBe('review');
    expect(references.findings[0]!.message).toContain('Aktenzeichenwiderspruch');
  });
});
