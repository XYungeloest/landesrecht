/**
 * Heute fehlende Stichtagsnormen (baseline-only): Identität, Ende, Fundstelle, Verkündungs-HTML → Blockmodell,
 * Beginn, Umfang, Kette und der Schreibweg in den Bestand.
 *
 * Alle Verkündungsseiten sind **echte, gekürzte Seiten** der Verkündungsplattform Bayern
 * (`tests/fixtures/bayernrecht/verkuendung-baseline-only-*.html`, gekürzt auf Überschrift, Seitenkopf und Textkörper).
 * Kein Test ruft das Netz; der Schreibweg läuft vollständig in einem temporären Verzeichnis.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { determineEnd, determineEndAcross, locateCitation, parseCitationTail, titleKey } from '@landesrecht/importer-bayernrecht/baseline-only/identity.ts';
import { baymblFulltextUrl, candidateVolumes, fulltextQueries, fulltextQuery, locateBase, parseParenthetical, sameReference } from '@landesrecht/importer-bayernrecht/baseline-only/references.ts';
import { buildBody, canonicalText, checkIntegrity, ConversionError, convertGazetteHtml, decimalSequenceConsistent, pageText, segments, splitHead, textBody } from '@landesrecht/importer-bayernrecht/baseline-only/html.ts';
import { headDates, publicationTitle, titleCheck } from '@landesrecht/importer-bayernrecht/baseline-only/base.ts';
import { annexDecision, annexHeading, ownBegin, ownExpiry, plainText, scopeDecision, sourceBody, titleParts } from '@landesrecht/importer-bayernrecht/baseline-only/analyze.ts';
import { applyAmendment, applyToTitle, citationsOfBase, commandWording, expandNumberRanges, repairCommandVerb, forwardStructural, glnrStem, headingScope, inheritLocations, replaySteps } from '@landesrecht/importer-bayernrecht/baseline-only/chain.ts';
import { checkedPublicationDate, ownPublicationDate, relativeDate, relativeRule, repairOwnCommencement } from '@landesrecht/importer-bayernrecht/baseline-only/relative.ts';
import { forwardAppendWords, forwardDeleteBlocks, forwardDeleteSentence, forwardDeleteWords, forwardFlatLetters, forwardFlatRecast, forwardHalfSentenceInsert, forwardRemoveNumbering, forwardRenumberSentences, forwardRepealSentences, forwardWordingBecomesNumber, numberList, oneEditApart, quotedBlocks, splitCombined } from '@landesrecht/importer-bayernrecht/baseline-only/structured.ts';
import { findInAmtsblattListings } from '@landesrecht/importer-bayernrecht/baseline-only/search.ts';
import type { Platform } from '@landesrecht/importer-bayernrecht/baseline-only/platform.ts';
import { parseAmtsblattIssue, parsePublicationHead } from '@landesrecht/importer-bayernrecht/baseline-only/platform.ts';
import { MISSING_LINKS, recipePath, type BaselineOnlyRecipe } from '@landesrecht/importer-bayernrecht/baseline-only/model.ts';
import { findInPositivliste, parsePositivliste, type Positivliste } from '@landesrecht/importer-bayernrecht/baseline-only/positivliste.ts';
import { keepArchiveState, linkTitleDuplicates, runBaselineOnly, subjectKey } from '@landesrecht/importer-bayernrecht/baseline-only/run.ts';
import type { CandidateWork } from '@landesrecht/importer-bayernrecht/baseline-only/analyze.ts';
import { RecipeError, replayRecipe } from '@landesrecht/importer-bayernrecht/baseline-only/restore.ts';
import { isBaselineOnlyEntry, readRecipeHeads, restoredBaselineOnlyEventIds } from '@landesrecht/importer-bayernrecht/baseline-only/recognize.ts';
import { checkBaselineOnly, runAudit } from '@landesrecht/importer-bayernrecht/audit/audit.ts';
import { collectCoverage } from '@landesrecht/importer-bayernrecht/audit/coverage.ts';
import { readManifest, writeManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import { readSlugRegistry } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { cacheKey, sha256 } from '@landesrecht/importer-bayernrecht/reconstruction/source.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'bayernrecht');
const fixture = (name: string): string => readFileSync(join(FIXTURES, `verkuendung-baseline-only-${name}.html`), 'utf8');

const BASELINE = '2023-12-01';

/* ------------------------------------------------------------------------------ Fundstellen */

describe('baseline-only: Fundstellen und ihr Ort auf der Verkündungsplattform', () => {
  it('zerlegt die Fundstellenklammern der Aufhebungsbefehle', () => {
    expect(parseParenthetical('KWMBl. I S. 133').primary).toMatchObject({ organ: 'KWMBl', part: 'I', kind: 'page', position: 133 });
    expect(parseParenthetical('KWMBl. I 1981 S. 78, ber. 1983, S. 102')).toMatchObject({ primary: { organ: 'KWMBl', explicitVolume: 1981, position: 78 }, corrections: ['ber. 1983, S. 102'] });
    expect(parseParenthetical('BayMBl. 2019 Nr. 5').primary).toMatchObject({ organ: 'BayMBl', explicitVolume: 2019, kind: 'number', position: 5 });
    expect(parseParenthetical('AllMBl. 2000, S. 728').primary).toMatchObject({ organ: 'AllMBl', explicitVolume: 2000, position: 728 });
    expect(parseParenthetical('GVBl. S. 410, BayRS 600-16-F')).toMatchObject({ primary: { organ: 'GVBl', position: 410 }, bayRsNumber: '600-16-F' });
    expect(parseParenthetical('FMBl. S. 228, StAnz. Nr. 49').others).toHaveLength(1);
    expect(parseParenthetical('BayMBl. Nr. 364, ber. Nr. 405').corrections).toEqual(['ber. Nr. 405']);
    // Ein Aktenzeichen ist keine Fundstelle: ein nicht verkündetes Schreiben.
    expect(parseParenthetical('Az. 25-P 2526-2/45')).toMatchObject({ aktenzeichenOnly: true });
    expect(parseParenthetical('Az. 25-P 2526-2/45').primary).toBeUndefined();
    expect(parseParenthetical('AIIMBl. S. 754').primary?.organ).toBe('AllMBl');
  });

  it('bestimmt den Jahrgang nur aus der Fundstelle oder dem Ausfertigungsjahr (Dezember: auch das Folgejahr)', () => {
    const reference = parseParenthetical('BayMBl. Nr. 182').primary!;
    expect(candidateVolumes(reference, '2021-02-25')).toEqual([2021]);
    expect(candidateVolumes(reference, '2018-12-18')).toEqual([2018, 2019]);
    expect(candidateVolumes(parseParenthetical('BayMBl. 2019 Nr. 5').primary!, '2018-12-18')).toEqual([2019]);
    expect(candidateVolumes(reference, undefined)).toEqual([]);
  });

  it('sucht eine Dezember-Verkündung ohne Jahrgang im BayMBl. erst ab 2019 und im Amtsblatt auch im Folgejahr', () => {
    // BayMBl. 2024 Nr. 262 zitiert eine Bekanntmachung vom 6. Dezember 2018 „(BayMBl. Nr. 76)“ – das BayMBl. beginnt 2019.
    expect(locateBase(parseParenthetical('BayMBl. Nr. 76').primary!, '2018-12-06')).toMatchObject({ availability: 'baymbl-html', volumes: [2019] });
    // „KWMBl. S. 77“ einer Bekanntmachung vom 11. Oktober 2017: Seite 77 des Jahrgangs 2017 erschien vor dem Erlass.
    expect(locateBase(parseParenthetical('KWMBl. S. 77').primary!, '2017-10-11')).toMatchObject({ availability: 'amtsblatt-html', volumes: [2017, 2018] });
    expect(locateBase(parseParenthetical('KWMBl. S. 77').primary!, '2018-10-11')).toMatchObject({ volumes: [2018] });
  });

  it('weiß, welche Stammverkündung elektronisch amtlich vorliegt und welche nur gedruckt', () => {
    expect(locateBase(parseParenthetical('BayMBl. Nr. 182').primary!, '2021-02-25').availability).toBe('baymbl-html');
    expect(locateBase(parseParenthetical('KWMBl. S. 194').primary!, '2016-07-27').availability).toBe('amtsblatt-html');
    expect(locateBase(parseParenthetical('KWMBl. I S. 133').primary!, '1976-04-23')).toMatchObject({ availability: 'paper-only' });
    expect(locateBase(parseParenthetical('AllMBl. S. 350').primary!, '2008-05-20').reason).toContain('nur gedruckt');
    expect(locateBase(parseParenthetical('StAnz. Nr. 49').primary!, '2006-11-23').availability).toBe('paper-only');
    expect(locateBase(parseParenthetical('GVBl. S. 210').primary!, '2022-04-21').availability).toBe('gvbl-html');
  });

  it('vergleicht Fundstellen mit und ohne Jahrgang', () => {
    const cited = parseParenthetical('BayMBl. Nr. 182').primary!;
    const page = parseParenthetical('BayMBl. 2021 Nr. 182').primary!;
    expect(sameReference(cited, page)).toBe(true);
    expect(sameReference(cited, parseParenthetical('BayMBl. 2021 Nr. 183').primary!)).toBe(false);
    expect(sameReference(parseParenthetical('KWMBl. I S. 133').primary!, parseParenthetical('KWMBl. S. 133').primary!)).toBe(false);
  });
});

/* ------------------------------------------------------------------------------ Identität */

describe('baseline-only: Identität und Ende im Aufhebungsbefehl', () => {
  const list = gazetteUnits(fixture('baymbl-2024-39'));

  it('findet das Zitat in der Aufhebungsliste und liest Fundstelle, Ende und Wirksamwerden', () => {
    const located = locateCitation(list, { title: 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Schülerbriefe im internationalen Briefverkehr', documentDate: '2001-12-14' });
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(located.citation.parenthetical).toBe('KWMBl. I S. 35');
    const end = determineEnd(list, located.citation, '2024-01-24');
    // „Es werden folgende Bekanntmachungen aufgehoben:“ + „Diese Bekanntmachung tritt am 1. Februar 2024 in Kraft.“
    expect(end).toMatchObject({ ok: true, kind: 'repeal', lastDay: '2024-01-31' });
    expect(end.evidence.join(' ')).toContain('Listeneinleitung');
  });

  it('liest die Änderungsklausel eines Listenglieds und setzt das Register-Datum der Änderung auf die Norm zurück', () => {
    const units = gazetteUnits(fixture('baymbl-2024-56'));
    // Das Register führt das Datum der Änderung (17. November 2020) als Ausfertigung – das ist die Änderung.
    const located = locateCitation(units, { title: 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Vollzug der Volksschulordnung hier: Formulare vom 25. November 2004 (KWMBl. I S. 431), die zuletzt durch Bekanntmachung', documentDate: '2020-11-17' });
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(located.citation).toMatchObject({ documentDate: '2004-11-25', registerDate: '2020-11-17', parenthetical: 'KWMBl. I S. 431', priorClauseLast: true });
    expect(located.citation.priorAmendments).toEqual([{ date: '2020-11-17', reference: 'BayMBl. Nr. 698', text: 'vom 17. November 2020 (BayMBl. Nr. 698)' }]);
    expect(determineEndAcross(units, located.citations, '2024-01-31')).toMatchObject({ ok: true, lastDay: '2024-02-09' });
  });

  it('erkennt, dass eine Verkündung die Norm ändert statt sie aufzuheben', () => {
    const units = gazetteUnits(fixture('baymbl-2024-292'));
    const located = locateCitation(units, { title: 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über die Aufgaben des Bayerischen Landesamts für Schule', documentDate: '2018-10-01' });
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(determineEndAcross(units, located.citations, '2024-06-19')).toMatchObject({ ok: false, code: 'not-a-repeal' });
    expect(MISSING_LINKS['not-a-repeal']).toBe('contradictory');
  });

  it('meldet ein fehlendes Zitat, statt das nächstbeste zu nehmen', () => {
    expect(locateCitation(list, { title: 'Bekanntmachung über etwas anderes', documentDate: '2001-12-14' })).toMatchObject({ ok: false, code: 'citation-not-located' });
  });

  it('zerlegt Aktenzeichen, Fundstelle und Klausel hinter „vom …“', () => {
    expect(parseCitationTail(' (AllMBl. S. 244), Az. 41i-G8092.1-2017/48-1, wird aufgehoben.')).toMatchObject({ parenthetical: 'AllMBl. S. 244', aktenzeichen: 'Az. 41i-G8092.1-2017/48-1', command: 'wird aufgehoben.' });
    expect(parseCitationTail(', Az. 25-P 2526-2/45,')).toMatchObject({ aktenzeichen: 'Az. 25-P 2526-2/45' });
    expect(parseCitationTail(' (BayMBl. Nr. 182), die zuletzt durch § 3 der Bekanntmachung vom 24. November 2023 (BayMBl. Nr. 617) geändert worden ist,')).toMatchObject({ priorClauseLast: true, priorAmendments: [{ date: '2023-11-24', reference: 'BayMBl. Nr. 617' }] });
    expect(titleKey('Schulversuch „Reform der Notengebung“ ')).toBe('schulversuch reform der notengebung');
  });
});

/* ------------------------------------------------------------------ Verkündungs-HTML → Blöcke */

const flatten = (blocks: readonly NormBodyBlock[], out: NormBodyBlock[] = []): NormBodyBlock[] => {
  for (const block of blocks) {
    out.push(block);
    if (block.children) flatten(block.children, out);
  }
  return out;
};

describe('baseline-only: Verkündungs-HTML → Blockmodell (BayMBl. ab 2019)', () => {
  const converted = convertGazetteHtml(fixture('baymbl-2021-182'));

  it('liest den Kopf am Wortlaut: Gliederungsnummer, Titel, Erlassstelle, Datumszeile', () => {
    expect(converted.head).toEqual({
      gliederungsnummer: '6321-F',
      title: 'Richtlinie zur Rückforderung von Zuwendungen bei schweren Vergabeverstößen (Rückforderungsrichtlinie – RZVR)',
      issuer: 'Bekanntmachung des Bayerischen Staatsministeriums der Finanzen und für Heimat',
      dateLine: 'vom 25. Februar 2021, Az. 11-H 1007-1/8',
    });
  });

  it('verschachtelt die lückenlose dezimale Gliederung und behält jeden Satz', () => {
    expect(converted.nested).toBe(true);
    const sections = converted.blocks.filter((block) => block.type === 'section');
    expect(sections.map((block) => `${block.label} ${block.title}`)).toEqual(['1. Beachtung der Vergabevorschriften als Auflage', '2. Verfahren bei Vergabeverstößen', '3. Schwere Vergabeverstöße', '4. Inkrafttreten, Außerkrafttreten']);
    const two = sections[1]!;
    expect(two.children!.map((block) => block.label)).toEqual(['2.1', '2.2', '2.3', '2.4']);
    const all = flatten(converted.blocks);
    expect(all.find((block) => block.label === 'f)')?.text).toContain('ordnungsgemäße Durchführung des Vergabeverfahrens');
    expect(all.some((block) => block.text?.startsWith('¹Mit jeweils Nr. 3 der Allgemeinen Nebenbestimmungen'))).toBe(true);
    expect(converted.blocks.at(-1)).toEqual({ type: 'signature', text: 'Harald Hübner', title: 'Ministerialdirektor' });
  });

  it('prüft die Textintegrität Zeichen für Zeichen gegen den Seitentext', () => {
    expect(converted.integrity.ok).toBe(true);
    expect(converted.integrity.pageCharacters).toBe(converted.integrity.canonicalCharacters);
    const body = textBody(fixture('baymbl-2021-182'))!;
    const { head, body: bodySegments, headSegments } = splitHead(segments(body));
    const built = buildBody(bodySegments);
    // Ein verlorener Satzteil fällt auf.
    const damaged = structuredClone(built.blocks);
    const first = flatten(damaged).find((block) => block.type === 'paragraphText' && block.text)!;
    first.text = first.text!.slice(0, -10);
    const result = checkIntegrity(pageText(body), canonicalText({ head, headSegments, blocks: damaged, styledBlocks: built.styledBlocks }, { skipStyledLabels: true }));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Abweichung bei Zeichen');
  });

  it('bleibt flach, wenn die Nummernfolge nicht aufgeht', () => {
    expect(decimalSequenceConsistent([[1], [2], [2, 1], [2, 2], [3]])).toBe(true);
    expect(decimalSequenceConsistent([[1], [2], [1], [2]])).toBe(false);
    expect(decimalSequenceConsistent([[1], [1, 2]])).toBe(false);
    expect(decimalSequenceConsistent([[2]])).toBe(false);
  });

  it('bricht bei Bildern und unbekannten Elementen ab, statt Text zu verlieren', () => {
    const withImage = fixture('baymbl-2021-182').replace('<p class="MBLTextEinzug18">', '<p class="MBLTextEinzug18"><img src="/files/x.png" alt="">');
    expect(() => convertGazetteHtml(withImage)).toThrow(ConversionError);
    try {
      convertGazetteHtml(withImage);
    } catch (error) {
      expect((error as ConversionError).code).toBe('image-in-body');
    }
    const withForm = fixture('baymbl-2021-182').replace('<p class="MBLTextEinzug18">', '<p class="MBLTextEinzug18"><select><option>x</option></select>');
    expect(() => convertGazetteHtml(withForm)).toThrow(/Element <select>/u);
  });

  it('liest den Seitenkopf: Publikationstyp, Gliederungsnummern, amtliche PDF mit Prüfsumme', () => {
    const head = parsePublicationHead(fixture('baymbl-2021-182'));
    expect(head).toMatchObject({ publicationType: 'Verwaltungsvorschrift', gliederungsnummern: ['6321-F'], pdfPath: '/files/baymbl/2021/182/baymbl-2021-182.pdf', pdfSha256Published: 'f299ddd93d8d154310128afb047f35c8badf2b51a2cf028f15886331df535cd4', attachments: [], images: [] });
    expect(headDates(gazetteUnits(fixture('baymbl-2021-182')))).toContain('2021-02-25');
  });
});

describe('baseline-only: Verkündungs-HTML → Blockmodell (Amtsblätter 2009–2018)', () => {
  const html = fixture('kwmbl-2016-10-194');

  it('liest die ältere Satzform mit zentrierten Kopfblöcken, Strichlisten und Unterschrift', () => {
    const converted = convertGazetteHtml(html);
    expect(converted.head).toMatchObject({ gliederungsnummer: '2230.1.3-K', title: 'Schulversuch „Teilzeitausbildung in der Kinderpflege“', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst', dateLine: 'vom 27. Juli 2016, Az. VI.5-BS9202-3-7a.77 618' });
    const all = flatten(converted.blocks);
    // Die Striche stehen hier als Text im `dt` – sie gehören zum Seitentext.
    expect(all.filter((block) => block.label === '–')).toHaveLength(6);
    expect(all.some((block) => block.text?.startsWith('Anlage 1'))).toBe(false);
    expect(converted.integrity.ok).toBe(true);
    expect(converted.blocks.at(-1)).toMatchObject({ type: 'signature', text: 'Herbert Püls', title: 'Ministerialdirektor' });
    expect(publicationTitle(gazetteUnits(html))).toBe('Schulversuch „Teilzeitausbildung in der Kinderpflege“');
  });

  it('erkennt Anlagen, die die Verkündung nur als Datei verlinkt', () => {
    const head = parsePublicationHead(html);
    expect(head.attachments.map((attachment) => attachment.title)).toEqual(['Anlage 1: Teilnehmer am Schulversuch „Teilzeitausbildung in der Kinderpflege“', 'Anlage 2: Stundentafel für die Teilzeitausbildung in der Kinderpflege']);
  });

  it('übernimmt eine im HTML vollständige Vorschrift mit Vordruck- und Übersichtsanlagen, Kopferlasse und unbestimmte Anlagen bleiben Review', () => {
    const converted = convertGazetteHtml(html);
    const { attachments } = parsePublicationHead(html);
    // Teilnehmerverzeichnis und Stundentafel tragen keinen Regelungsgehalt (docs/LEGAL_SCOPE.md „Text nur als PDF“).
    expect(annexDecision(converted, attachments)).toEqual({ ok: true });
    // Eine unbenannte oder inhaltlich regelnde Anlage ist nicht bestimmbar.
    expect(annexDecision(converted, [...attachments, { title: 'Anlage 3', href: '/x.pdf' }])).toMatchObject({ ok: false });
    expect(annexDecision(converted, [{ title: 'Anlage: Richtlinien für die Förderung', href: '/x.pdf' }])).toMatchObject({ ok: false });
    // Kopferlass: kurzer Text, der Regelungsgehalt steht in der Anlage.
    const cover = { ...converted, blocks: [{ type: 'paragraphText' as const, text: 'Die Richtlinien werden in der Anlage zu dieser Bekanntmachung bekannt gemacht.' }] };
    expect(annexDecision(cover, [{ title: 'Anlage: Übersicht', href: '/x.pdf' }])).toMatchObject({ ok: false, detail: expect.stringContaining('Bekanntgabeerlass') });
    const short = { ...converted, blocks: converted.blocks.slice(0, 2) };
    expect(annexDecision(short, attachments)).toMatchObject({ ok: false, detail: expect.stringContaining('Kopferlass') });
  });

  it('bezeichnet eine nur nummerierte Anlage aus dem Textlayer ihrer PDF, nie aus einer anderen Anlage und nie ohne Textlayer', () => {
    const pdf = (encoding: string, text: string): Uint8Array => {
      const content = deflateSync(Buffer.from(`BT /F1 12 Tf 72 700 Td (${text}) Tj ET`, 'latin1'));
      const head = [
        '%PDF-1.3\n',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /MediaBox [0 0 595 842] >> endobj\n',
        `4 0 obj << /Length ${content.length} /Filter /FlateDecode >>\nstream\n`,
      ].join('');
      const tail = `\nendstream\nendobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /${encoding} >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
      return new Uint8Array(Buffer.concat([Buffer.from(head, 'latin1'), content, Buffer.from(tail, 'latin1')]));
    };
    const stundentafel = pdf('WinAnsiEncoding', 'Anlage 2 Stundentafel f\xfcr die Teilzeitausbildung in der Kinderpflege');
    expect(annexHeading(stundentafel, 'Anlage 2')).toBe('Stundentafel für die Teilzeitausbildung in der Kinderpflege');
    expect(annexHeading(stundentafel, 'Anlage 1')).toBeUndefined();
    expect(annexHeading(pdf('WinAnsiEncoding', 'Anlage 12 Richtlinien'), 'Anlage 1')).toBeUndefined();
    expect(annexHeading(pdf('SymbolEncoding', 'Anlage 2 Stundentafel'), 'Anlage 2')).toBeUndefined();
  });

  it('liest die Inhaltsübersicht einer Ausgabe mit Gliederungsnummer, Erlassdatum, Seite und Prüfsumme', () => {
    const issue = parseAmtsblattIssue(fixture('kwmbl-2016-10-ausgabe'));
    expect(issue.publishedAt).toBe('2016-09-13');
    const row = issue.documents.find((document) => document.page === 194)!;
    expect(row).toMatchObject({ gliederungsnummern: ['2230.1.3-K'], enactmentDate: '2016-07-27', htmlPath: '/amtsblatt/dokument/kwmbl-2016-10-194/', pdfPage: 38, pdfSha256Published: 'd9a42cf3b6870ccb6ef7bcfd35e2b82be17555fd9858c3d563c7694f6fe06be0' });
  });
});

/* ----------------------------------------------------------------------- Beginn, Umfang, Titel */

describe('baseline-only: Beginn nur mit Kalenderdatum, Befristung, Umfang', () => {
  const paragraph = (text: string): NormBodyBlock => ({ type: 'paragraphText', text });

  it('liest den Beginn aus der eigenen Inkrafttretensvorschrift, auch in der Satzform „… in Kraft und … außer Kraft“', () => {
    const converted = convertGazetteHtml(fixture('baymbl-2021-182'));
    expect(ownBegin(converted.blocks, gazetteUnits(fixture('baymbl-2021-182')), '2021-03-10')).toEqual({ begin: { date: '2021-03-01', evidence: 'Diese Bekanntmachung tritt mit Wirkung vom 1. März 2021 in Kraft.' } });
    const combined = [paragraph('Die Richtlinie tritt am 1. April 2023 in Kraft und mit Ablauf des 31. Dezember 2025 außer Kraft.')];
    expect(ownBegin(combined, [], '2023-03-30').begin?.date).toBe('2023-04-01');
    expect(ownExpiry(combined).expiry?.date).toBe('2025-12-31');
  });

  it('liest die Inkrafttretensvorschrift auch hinter einer Zwischenüberschrift ohne Punkt (BayMBl. 2020 Nr. 36)', () => {
    // Die Sätze werden je Block gebildet: „Inkrafttreten, Außerkrafttreten“ verschmilzt nicht mit dem folgenden Satz.
    const blocks = [paragraph('Inkrafttreten, Außerkrafttreten'), paragraph('Diese Bekanntmachung tritt mit Wirkung zum 1. Februar 2020 in Kraft und mit Ablauf des 31. Dezember 2025 außer Kraft.')];
    expect(ownBegin(blocks, [], '2020-01-29').begin?.date).toBe('2020-02-01');
    expect(ownExpiry(blocks).expiry?.date).toBe('2025-12-31');
  });

  it('rechnet relativ nur nach der Veröffentlichung (Datum beim Aufrufer belegt) und erfindet keinen Beginn', () => {
    expect(ownBegin([paragraph('Diese Bekanntmachung tritt am Tag nach ihrer Bekanntmachung in Kraft.')], [], '2021-03-10')).toMatchObject({ relative: { rule: 'day-after-publication' } });
    expect(ownBegin([paragraph('Diese Bekanntmachung tritt am Tag ihrer Veröffentlichung in Kraft.')], [], '2021-03-10')).toMatchObject({ code: 'begin-not-calendar-date' });
    expect(ownBegin([paragraph('Die Regelungen gelten für alle Schulen.')], [], '2021-03-10')).toMatchObject({ code: 'begin-no-commencement-clause' });
    expect(ownBegin([paragraph('Diese Bekanntmachung tritt am 1. März 2021 in Kraft.'), paragraph('Diese Bekanntmachung tritt am 1. April 2021 in Kraft.')], [], '2021-03-10')).toMatchObject({ code: 'begin-unreadable' });
    // Die Aufhebung einer Vorgängerin ist kein Außerkrafttreten der Norm selbst.
    expect(ownExpiry([paragraph('Mit Ablauf des 28. Februar 2021 tritt die Bekanntmachung vom 23. November 2006 (FMBl. S. 228) außer Kraft.')])).toEqual({});
    expect(ownExpiry([paragraph('Die Richtlinie gilt bis zum Ende des Schuljahres 2019/2020.')])).toMatchObject({ code: 'own-expiry-unreadable' });
    expect(ownExpiry([paragraph('Diese Bekanntmachung tritt am 1. August 2011 in Kraft und am 31. August 2026 außer Kraft.')]).expiry?.date).toBe('2026-08-30');
  });

  it('nimmt nur Verwaltungsvorschriften der Staatsverwaltung auf, Prüffälle bleiben Review', () => {
    expect(scopeDecision({ title: 'Richtlinie zur Rückforderung von Zuwendungen', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums der Finanzen und für Heimat' }).ok).toBe(true);
    expect(scopeDecision({ title: 'Veröffentlichung der Hörfunkprogramme', issuer: 'Bekanntmachung des Deutschlandradios' })).toMatchObject({ ok: false, code: 'scope-not-state-regulation' });
    expect(scopeDecision({ title: 'Vollzug der Berufsschulordnung; hier: Zeugnismuster', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus' })).toMatchObject({ ok: false, code: 'scope-normativity-review' });
    expect(scopeDecision({ title: 'Richtlinie', issuer: 'Bekanntmachung des Landesamts für Umwelt' })).toMatchObject({ ok: false, code: 'scope-normativity-review' });
  });

  it('trennt Kurzbezeichnung und Abkürzung vom Titel', () => {
    expect(titleParts('Richtlinie zur Rückforderung von Zuwendungen bei schweren Vergabeverstößen (Rückforderungsrichtlinie – RZVR)')).toEqual({ title: 'Richtlinie zur Rückforderung von Zuwendungen bei schweren Vergabeverstößen', shortTitle: 'Rückforderungsrichtlinie', abbr: 'RZVR' });
    expect(titleParts('Schulversuch „Teilzeitausbildung in der Kinderpflege“')).toEqual({ title: 'Schulversuch „Teilzeitausbildung in der Kinderpflege“' });
    expect(titleParts('Förderung (Hinweise zur Antragstellung)')).toEqual({ title: 'Förderung (Hinweise zur Antragstellung)' });
  });

  it('prüft den Titel der Seite gegen das Zitat nur als Gegenprobe (Datum und Fundstelle tragen die Identität)', () => {
    expect(titleCheck('Schulversuch „Teilzeitausbildung in der Kinderpflege“', 'Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schulversuch „Teilzeitausbildung in der Kinderpflege“').consistent).toBe(true);
    expect(titleCheck('Richtlinien für die Standardisierung des Oberbaus von Verkehrsflächen', 'Die Bekanntmachung der Obersten Baubehörde im Bayerischen Staatsministerium des Innern')).toMatchObject({ consistent: true, issuerOnly: true });
    expect(titleCheck('Wahlen zum Rundfunkrat und Medienrat (Rundfunk- und Medienrat-Bekanntmachung – RMRatBek)', 'Die Rundfunk- und Medienrat-Bekanntmachung (RMRatBek)')).toMatchObject({ consistent: true, sameAbbreviation: 'RMRatBek' });
    expect(titleCheck('Gesamtvertrag zur Vergütung von Ansprüchen nach § 52 a UrhG', 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus über den Schulversuch Gelenkklasse').consistent).toBe(false);
    // BayMBl. 2024 Nr. 447: „… tritt die Bekanntmachung vom 6. März 2013 (AllMBl. S. 181) außer Kraft“ – nur die Dokumentart.
    expect(titleCheck('Stiftung eines Staatspreises für vorbildliche Waldbewirtschaftung', 'Bekanntmachung')).toMatchObject({ consistent: true, issuerOnly: true });
    expect(titleCheck('Stiftung eines Staatspreises für vorbildliche Waldbewirtschaftung', 'Bekanntmachung über die Schulgesundheitspflege').consistent).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------ Kette */

describe('baseline-only: Glieder der Kette auf einer Verkündungsseite', () => {
  it('erkennt Aufhebung und Erwähnung einer Norm an Datum und Fundstelle', () => {
    const units = gazetteUnits(fixture('baymbl-2024-39'));
    const reference = parseParenthetical('KWMBl. I S. 35').primary!;
    expect(citationsOfBase(units, { documentDate: '2001-12-14', reference, volume: 2001 }, '2024-01-24')).toMatchObject([{ relation: 'ends', lastDay: '2024-01-31' }]);
    // Anderes Datum oder andere Seite: kein Zitat dieser Norm.
    expect(citationsOfBase(units, { documentDate: '2001-12-15', reference, volume: 2001 }, '2024-01-24')).toEqual([]);
    expect(citationsOfBase(units, { documentDate: '2001-12-14', reference: parseParenthetical('KWMBl. I S. 36').primary!, volume: 2001 }, '2024-01-24')).toEqual([]);
  });

  it('erkennt eine Änderung der Norm', () => {
    const units = gazetteUnits(fixture('baymbl-2024-292'));
    const reference = parseParenthetical('KWMBl. S. 375').primary!;
    expect(citationsOfBase(units, { documentDate: '2018-10-01', reference, volume: 2018 }, '2024-06-19').map((entry) => entry.relation)).toEqual(['amends']);
  });

  it('sucht Gliederungsnummern ohne Ressortzusatz', () => {
    expect(glnrStem('2230.1.3-UK')).toBe('2230.1.3');
    expect(glnrStem('2230.1.1.0–K')).toBe('2230.1.1.0');
  });

  it('liest die Änderungsklauseln: Der Aufhebungsbefehl nennt die letzte Änderung, diese die frühere', () => {
    // RZVR (BayMBl. 2021 Nr. 182): Die Sammeländerung BayMBl. 2022 Nr. 766 trägt nur die Gliederungsnummer 630-F –
    // die Gliederungssuche 6321 findet sie nicht, die Klausel der späteren Änderung nennt sie.
    const base = { documentDate: '2021-02-25', reference: parseParenthetical('BayMBl. Nr. 182').primary!, volume: 2021 };
    expect(citationsOfBase(gazetteUnits(fixture('baymbl-2025-590')), base, '2025-12-30')).toMatchObject([
      { relation: 'ends', lastDay: '2025-12-31', priorAmendments: [{ date: '2023-11-24', reference: 'BayMBl. Nr. 617' }] },
    ]);
    expect(citationsOfBase(gazetteUnits(fixture('baymbl-2023-617')), base, '2023-12-13')).toMatchObject([
      { relation: 'amends', priorAmendments: [{ date: '2022-11-22', reference: 'BayMBl. Nr. 766' }] },
    ]);
  });

  it('sucht im BayMBl.-Volltext nach Ausfertigungsdatum und Fundstelle (UND-Verknüpfung, keine Phrase)', () => {
    expect(fulltextQuery('2021-02-25', parseParenthetical('BayMBl. Nr. 182').primary!)).toBe('25. Februar 2021 BayMBl. Nr. 182');
    expect(fulltextQuery('2018-10-12', parseParenthetical('AllMBl. S. 962').primary!)).toBe('12. Oktober 2018 AllMBl. S. 962');
    expect(baymblFulltextUrl('25. Februar 2021 BayMBl. Nr. 182', 0)).toBe('https://www.verkuendung-bayern.de/baymbl/?query=25.%20Februar%202021%20BayMBl.%20Nr.%20182&itemsPerPage=50');
    expect(baymblFulltextUrl('1. März 2023 BayMBl. Nr. 5', 50)).toBe('https://www.verkuendung-bayern.de/baymbl/?query=1.%20M%C3%A4rz%202023%20BayMBl.%20Nr.%205&itemsPerPage=50&offset=51');
  });

  it('sucht AllMBl.-Normen auch in der belegten Schreibweise „AIIMBl.“', () => {
    // BayMBl. 2021 Nr. 19 und Nr. 649 zitieren die Kinderbetreuungsfinanzierung-Richtlinie als „(AIIMBl. S. 332)“.
    expect(fulltextQueries('2017-08-08', parseParenthetical('AllMBl. S. 332').primary!)).toEqual(['8. August 2017 AllMBl. S. 332', '8. August 2017 AIIMBl. S. 332']);
    expect(fulltextQueries('2021-02-25', parseParenthetical('BayMBl. Nr. 182').primary!)).toEqual(['25. Februar 2021 BayMBl. Nr. 182']);
  });
});

/* ------------------------------------------------ Neufassung und Einfügung vorwärts (eng) */

describe('baseline-only: Neufassung und Einfügung vorwärts', () => {
  const unit = (text: string, label?: string) => ({ index: 0, tag: 'p', className: '', text, heading: false, ...(label ? { label } : {}) });
  const body = (): NormBodyBlock[] => [
    {
      type: 'section',
      label: '4.',
      title: 'Prüfung',
      children: [
        { type: 'item', label: '4.3', text: '¹Die Prüfung ist schriftlich. ²Sie dauert drei Stunden.' },
        // KWMBl. 2016 S. 183, Nr. 4.4 (Stammfassung), geändert durch KWMBl. 2017 S. 20.
        { type: 'item', label: '4.4', text: 'Die Begabtenprüfung im Jahr 2017 kann übergangsweise noch nach der Bekanntmachung über die Begabtenprüfung abgelegt werden.' },
      ],
    },
  ];

  it('liest „die Worte“ älterer Befehle wie „die Wörter“, ohne den zitierten Wortlaut anzutasten', () => {
    // KWMBl. 2015 S. 18: „In Nr. 14 werden die Worte „zum Wintersemester 2014/15“ durch die Worte „zum Wintersemester 2017/18“ ersetzt.“
    expect(commandWording('In Nr. 14 werden die Worte „zum Wintersemester 2014/15“ durch die Worte „zum Wintersemester 2017/18“ ersetzt.')).toBe('In Nr. 14 werden die Wörter „zum Wintersemester 2014/15“ durch die Wörter „zum Wintersemester 2017/18“ ersetzt.');
    expect(commandWording('In Nr. 2 werden die Wörter „die Worte des Eides“ gestrichen.')).toBe('In Nr. 2 werden die Wörter „die Worte des Eides“ gestrichen.');
  });

  it('fasst ein Textglied ohne Untergliederung neu – Wortlaut aus der Verkündung, Rundlauf über die Schritte', () => {
    const before = body();
    const step = forwardStructural(before, { text: 'Ziffer 4.4 wird wie folgt gefasst:', quoted: [unit('„Die Begabtenprüfung im Jahr 2017, 2018 und 2019 wird übergangsweise noch nach der Bekanntmachung über die Begabtenprüfung abgelegt.“')] }, [], 'Ziffer 4.4 wird wie folgt gefasst: …');
    expect(step).toMatchObject({ formula: 'recast', location: 'Nr. 4.4', operation: { kind: 'replace', to: 'Die Begabtenprüfung im Jahr 2017, 2018 und 2019 wird übergangsweise noch nach der Bekanntmachung über die Begabtenprüfung abgelegt.' } });
    if ('error' in step) throw new Error(step.error);
    const after = replaySteps(before, [{ id: 's1', scope: step.scope, operation: step.operation }]);
    expect(after[0]!.children![1]!.text).toContain('2018 und 2019');
    expect(after[0]!.children![0]).toEqual(before[0]!.children![0]);
  });

  it('fasst einen bezeichneten Satz neu, nur mit seiner Satznummer', () => {
    const before = body();
    const step = forwardStructural(before, { text: 'In Nr. 4.3 wird Satz 2 wie folgt gefasst: „²Sie dauert vier Stunden.“', quoted: [] }, [], '…');
    expect(step).toMatchObject({ error: expect.any(String) });
    const direct = forwardStructural(before, { text: 'Nr. 4.3 Satz 2 wird wie folgt gefasst: „²Sie dauert vier Stunden.“', quoted: [] }, [], '…');
    if ('error' in direct) throw new Error(direct.error);
    expect(replaySteps(before, [{ id: 's1', scope: direct.scope, operation: direct.operation }])[0]!.children![0]!.text).toBe('¹Die Prüfung ist schriftlich. ²Sie dauert vier Stunden.');
  });

  it('fügt ein gleichartiges Textglied mit freier Bezeichnung an – und rät bei Umnummerierung nicht', () => {
    const before = body();
    const step = forwardStructural(before, { text: 'Der Nr. 4 wird folgende Nr. 4.5 angefügt:', quoted: [unit('„Die Ergebnisse werden bekannt gegeben.“', '„4.5')] }, [], '…');
    if ('error' in step) throw new Error(step.error);
    expect(step.operation).toMatchObject({ kind: 'insert-block', parent: [0], index: 2, block: { type: 'item', label: '4.5', text: 'Die Ergebnisse werden bekannt gegeben.' } });
    expect(replaySteps(before, [{ id: 's1', scope: step.scope, operation: step.operation }])[0]!.children).toHaveLength(3);
    expect(forwardStructural(before, { text: 'Der Nr. 4 wird folgende Nr. 4.4 angefügt:', quoted: [unit('„x“', '„4.4')] }, [], '…')).toMatchObject({ error: expect.stringContaining('schon vergeben') });
    // Neufassung eines Glieds mit Untergliederung oder eines Bereichs bleibt offen.
    expect(forwardStructural(before, { text: 'Nr. 4 wird wie folgt gefasst:', quoted: [unit('„4. Neu“')] }, [], '…')).toMatchObject({ error: expect.any(String) });
    expect(forwardStructural(before, { text: 'Die Nrn. 4.3 bis 4.4 werden wie folgt gefasst:', quoted: [unit('„x“'), unit('„y“')] }, [], '…')).toMatchObject({ error: expect.any(String) });
  });
});

/* --------------------------------------------------------------- doppelte Register-Ereignisse */

describe('baseline-only: dieselbe Aufhebung zweimal im Register', () => {
  const work = (id: string, sourceId: string, title: string, citedTitle?: string): CandidateWork =>
    ({
      event: { id, sourceId, targetTitle: title },
      record: { eventId: id, ...(citedTitle ? { outcome: 'safe' } : { outcome: 'undetermined', missing: { code: 'identity-not-strong', detail: 'x' } }) },
      ...(citedTitle ? { citation: { citedTitle } } : {}),
    }) as unknown as CandidateWork;

  it('vergleicht Betreffe ohne Artikel, Dokumentart und Erlassstelle', () => {
    expect(subjectKey('Die Bekanntmachung des Bayerischen Staatsministeriums der Justiz betreffend Büchereien der Justizbehörden (ohne Gefangenenbüchereien)')).toBe('büchereien der justizbehörden');
    expect(subjectKey('Verwaltungsvorschrift betreffend Büchereien der Justizbehörden (ohne Gefangenenbüchereien)')).toBe('büchereien der justizbehörden');
    expect(subjectKey('Die Rundfunk- und Medienrat-Bekanntmachung (RMRatBek)')).toBe('rundfunk- und medienrat-bekanntmachung');
    // Titel in Anführungszeichen direkt hinter der Erlassstelle (BayMBl. 2025 Nr. 113).
    expect(subjectKey('Die Bekanntmachung des Bayerischen Staatsministeriums für Wirtschaft, Landesentwicklung und Energie „Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung (Richtlinie Vorgründungscoaching)“')).toBe(
      subjectKey('Richtlinien für die staatliche Förderung der Betreuung bei der Existenzgründung (Richtlinie Vorgründungscoaching)'),
    );
  });

  it('verbindet das titelbasierte Ereignis mit genau einem Zitat derselben Veröffentlichung, sonst mit keinem', () => {
    const titleOnly = work('p-00', 'baymbl-2024-161', 'Bekanntmachung über den Bußgeldkatalog „Coronavirus-Einreiseverordnung');
    const cited = work('p-01', 'baymbl-2024-161', 'Allgemeinverfügung Testnachweis', 'Die Bekanntmachung des Bayerischen Staatsministeriums für Gesundheit und Pflege über den Bußgeldkatalog „Coronavirus-Einreiseverordnung – CoronaEinreiseV und Allgemeinverfügung Testnachweis“');
    const elsewhere = work('q-01', 'baymbl-2024-999', 'x', 'Die Bekanntmachung über den Bußgeldkatalog „Coronavirus-Einreiseverordnung – CoronaEinreiseV“');
    expect([...linkTitleDuplicates([titleOnly, cited, elsewhere]).entries()].map(([left, right]) => [left.event.id, right.event.id])).toEqual([['p-00', 'p-01']]);
    // Zwei Zitate mit passendem Betreff: keine Entscheidung.
    const second = work('p-02', 'baymbl-2024-161', 'y', 'Die Bekanntmachung über den Bußgeldkatalog „Coronavirus-Einreiseverordnung – Fassung 2022“');
    expect(linkTitleDuplicates([titleOnly, cited, second]).size).toBe(0);
    // Kein bloßer Wortanfang innerhalb eines Worts.
    expect(linkTitleDuplicates([work('r-00', 's', 'Bekanntmachung über die Schulgesundheit'), work('r-01', 's', 'z', 'Die Bekanntmachung über die Schulgesundheitspflege')]).size).toBe(0);
  });
});

describe('baseline-only: Archivstand beim erneuten Schreiben', () => {
  it('übernimmt Objektschlüssel und Archivstatus nur für dieselbe Rohquelle (Adresse, Rolle, SHA-256)', () => {
    const raw = { role: 'gazette' as const, url: 'https://www.verkuendung-bayern.de/baymbl/2023-377/', finalUrl: 'https://www.verkuendung-bayern.de/baymbl/2023-377/', sha256: 'a'.repeat(64), contentType: 'text/html', retrievedAt: '2026-09-18T10:00:00.000Z', byteLength: 10 };
    const archived = { ...raw, bucket: 'landesrecht-quellen', objectKey: 'baywue/bayernrecht/2023-12-01/events/x/gazette.html', archiveStatus: 'verified' as const };
    expect(keepArchiveState(raw, [archived])).toMatchObject({ objectKey: archived.objectKey, archiveStatus: 'verified', bucket: 'landesrecht-quellen' });
    expect(keepArchiveState({ ...raw, sha256: 'b'.repeat(64) }, [archived])).not.toHaveProperty('objectKey');
    expect(keepArchiveState({ ...raw, role: 'pdf' }, [archived])).not.toHaveProperty('archiveStatus');
  });
});

/* ------------------------------------------------------------------------ Positivliste VwVWBek */

describe('baseline-only: Positivliste der VwVWBek (Textlayer, kein OCR)', () => {
  const excerpt = JSON.parse(readFileSync(join(FIXTURES, 'baseline-only-positivliste-excerpt.json'), 'utf8')) as { excerpts: Record<string, string> };
  const list = (text: string): Positivliste => {
    const parsed = parsePositivliste(text);
    return { page: {} as Positivliste['page'], rows: parsed.rows, latestFassung: parsed.rows.map((row) => row.fassungsdatum).sort().at(-1)! };
  };

  it('zerlegt Zeilen vollständig – jedes Datum gehört genau einer Zeile', () => {
    const head = parsePositivliste(excerpt.excerpts.head!);
    expect(head).toMatchObject({ complete: true, unassigned: 0 });
    expect(head.rows[0]).toEqual({ klasse: '100', gliederungsnummern: ['103-S'], ressort: 'StK', title: 'Richtlinien für die Redaktion von Vorschriften (Redaktionsrichtlinien - RedR)', erlassdatum: '2015-06-16', fassungsdatum: '2015-06-16', anwendungsbeginn: '2015-08-01' });
    // Zwischenüberschrift mitten in der Liste, Nummer mit Zeilenumbruch, Anwendungsende.
    expect(parsePositivliste(excerpt.excerpts.heading!)).toMatchObject({ complete: true, rows: [{ fassungsdatum: '1997-07-02' }, { erlassdatum: '2004-03-24' }] });
    expect(parsePositivliste(excerpt.excerpts.split!).rows.map((row) => row.gliederungsnummern)).toEqual([['2210.1.1.3.0-K'], ['2210.1.1.3.1-K']]);
    expect(parsePositivliste(excerpt.excerpts.ende!).rows[0]).toMatchObject({ anwendungsende: '2019-12-31' });
    // Ein Datum ohne Zeile macht die Liste unauswertbar: Dann folgt aus „steht nicht drin“ nichts.
    const broken = parsePositivliste(`${excerpt.excerpts.head!} Stand 2016-01-01`);
    expect(broken.complete).toBe(false);
    expect(broken.unassigned).toBeGreaterThan(0);
  });

  it('findet eine Vorschrift über Erlassdatum und Gliederungsnummer, bei gleichnamigen Zeilen über den Titel', () => {
    const ferien = list(excerpt.excerpts.ferienordnung!);
    expect(findInPositivliste(ferien, { documentDate: '2010-10-04', gliederungsnummern: ['2230.1.1.0-UK'], title: 'Ferienordnung und schulfreie Samstage für das Schuljahr 2015/2016' })).toMatchObject({ status: 'listed', row: { title: 'Ferienordnung und schulfreie Samstage für das Schuljahr 2015/2016' } });
    expect(findInPositivliste(ferien, { documentDate: '2010-10-04', gliederungsnummern: ['2230.1.1.0-K'], title: 'Ferienordnung und schulfreie Samstage' })).toMatchObject({ status: 'ambiguous' });
    expect(findInPositivliste(ferien, { documentDate: '2010-10-05', gliederungsnummern: ['2230.1.1.0-K'], title: 'Ferienordnung' })).toMatchObject({ status: 'not-listed' });
  });
});

/* ------------------------------------------------------------------------- Schreibweg (temporär) */

/* ------------------------------------------------------------------------------------ Lauf 7 */

describe('baseline-only: relatives Inkrafttreten (Datum der Verkündung selbst, gleich dem Register)', () => {
  it('liest „am Tag nach der Veröffentlichung“ und rechnet nur mit dem Datum, das die Verkündung selbst druckt', () => {
    const html = fixture('baymbl-2023-295');
    const converted = convertGazetteHtml(html);
    const own = ownBegin(converted.blocks, gazetteUnits(html), '2023-06-14');
    expect(own).toMatchObject({ relative: { rule: 'day-after-publication', evidence: 'Diese Bekanntmachung tritt am Tag nach der Veröffentlichung in Kraft.' } });
    expect(ownPublicationDate(html, 'BayMBl')).toBe('2023-06-14');
    expect(relativeDate('day-after-publication', '2023-06-14')).toBe('2023-06-15');
    expect(relativeDate('first-day-of-following-month', '2023-06-14')).toBe('2023-07-01');
    expect(checkedPublicationDate({ ownDate: '2023-06-14', registerDate: '2023-06-14', url: 'u', registerSource: 'Gliederungssuche' })).toMatchObject({ ok: true, date: '2023-06-14' });
    expect(checkedPublicationDate({ ownDate: '2023-06-14', registerDate: '2023-06-15', url: 'u', registerSource: 'Gliederungssuche' })).toMatchObject({ ok: false });
    expect(checkedPublicationDate({ registerDate: '2023-06-14', url: 'u', registerSource: 'Gliederungssuche' })).toMatchObject({ ok: false });
  });

  it('nimmt „am Tag der Veröffentlichung“ nicht als relative Regel und liest den Ausgabevermerk der Amtsblätter', () => {
    expect(relativeRule('Die Dienstvereinbarung tritt am Tag nach ihrer Veröffentlichung in Kraft.')).toBe('day-after-publication');
    expect(relativeRule('Diese Bekanntmachung tritt am ersten Tag des auf die Verkündung folgenden Monats in Kraft.')).toBe('first-day-of-following-month');
    expect(relativeRule('Diese Bekanntmachung tritt am Tag der Veröffentlichung in Kraft.')).toBeUndefined();
    // Seitenkopf der Amtsblätter nennt das Erlassdatum; das Veröffentlichungsdatum steht im Ausgabevermerk.
    expect(ownPublicationDate(fixture('kwmbl-2016-10-194'), 'KWMBl')).toBe('2016-09-13');
  });

  it('liest „tritt mit am 22. Juni 2023 in Kraft“ als den einen Tag, den beide Lesarten ergeben', () => {
    expect(repairOwnCommencement('Die Richtlinie tritt mit am 22. Juni 2023 in Kraft; sie tritt mit Ablauf des 31. Dezember 2025 außer Kraft.')).toMatchObject({ sentence: 'Die Richtlinie tritt am 22. Juni 2023 in Kraft; sie tritt mit Ablauf des 31. Dezember 2025 außer Kraft.', defects: [expect.stringContaining('beide Lesarten')] });
  });
});

describe('baseline-only: Umfang nach docs/LEGAL_SCOPE.md (nur wo eindeutig)', () => {
  it('schließt Veröffentlichungshinweise zu Dokumenten der Rundfunkanstalten aus', () => {
    const head = { title: 'Telemedienkonzept des Bayerischen Rundfunks „Änderung der Verweildauern“', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst' };
    const text = 'Das Telemedienkonzept des Bayerischen Rundfunks „Änderung der Verweildauern“ ist nach rechtsaufsichtlicher Prüfung durch das Staatsministerium gemäß § 32 Abs. 7 Satz 3 MStV auf www.br.de veröffentlicht worden und kann unter https://www.br.de/unternehmen/inhalt abgerufen werden.';
    expect(scopeDecision(head, text)).toMatchObject({ ok: false, code: 'scope-publication-notice' });
    expect(MISSING_LINKS['scope-publication-notice']).toBe('out-of-scope');
    // Ohne den Text bleibt es beim Prüffall.
    expect(scopeDecision(head)).toMatchObject({ ok: false, code: 'scope-normativity-review' });
    const radio = 'Die in der ARD zusammengeschlossenen Landesrundfunkanstalten und das Deutschlandradio veröffentlichen gemäß § 29 Abs. 4 des Medienstaatsvertrags (MStV) in den amtlichen Verkündungsblättern der Länder eine Auflistung der von allen Anstalten insgesamt veranstalteten Hörfunkprogramme im Jahr 2021.';
    expect(scopeDecision({ title: 'Veröffentlichung der Hörfunkprogramme der Landesrundfunkanstalten der ARD und des Deutschlandradios' }, radio)).toMatchObject({ code: 'scope-publication-notice' });
  });

  it('nimmt Zeugnismuster als Vorschrift mit Musteranlagen auf, Dienstvereinbarungen und andere Muster bleiben Prüffall', () => {
    const issuer = 'Bekanntmachung des Bayerischen Staatsministeriums für Unterricht und Kultus';
    const text = '1. ¹Die nach der Schulordnung für die Berufsschulen in Bayern (Berufsschulordnung – BSO) vom 30. August 2008 (GVBl. S. 631, BayRS 2236-2-1-K) in der jeweils geltenden Fassung zu erteilenden Zeugnisse sind nach den in der Anlage beigefügten Mustern im Format DIN A 4 auszustellen, von denen aus drucktechnischen Gründen geringfügig abgewichen werden kann.';
    expect(scopeDecision({ title: 'Vollzug der Schulordnung über die Berufsschulen in Bayern (Berufsschulordnung – BSO); hier: Zeugnismuster', issuer }, text)).toMatchObject({ ok: true });
    expect(scopeDecision({ title: 'Vollzug der Schulordnung über die Berufsschulen in Bayern; hier: Zeugnismuster', issuer }, 'Die Muster werden empfohlen.')).toMatchObject({ ok: false, code: 'scope-normativity-review' });
    expect(scopeDecision({ title: 'Dienstvereinbarung über Telearbeit und Mobile Arbeit', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums der Justiz' }, 'x')).toMatchObject({ code: 'scope-normativity-review' });
    expect(scopeDecision({ title: 'Satzung der Stiftung Regensburger Centrum für Interventionelle Immunologie (RCI)', issuer: 'Bekanntmachung des Bayerischen Staatsministeriums für Wissenschaft und Kunst' }, 'x')).toMatchObject({ code: 'scope-normativity-review' });
    // Erklärt der Text die Anlagen zu Mustern, sind alle Anlagen Formulare – auch bei kurzem Text.
    const converted = { ...convertGazetteHtml(fixture('kwmbl-2016-10-194')), blocks: [{ type: 'paragraphText' as const, text }] };
    expect(annexDecision(converted, [{ title: 'Anlage 4.2: Qualifikation durch Berufsschule – mehrsprachig', href: '/x.pdf' }])).toEqual({ ok: true, declaredForms: true });
    expect(plainText(converted.blocks)).toBe(text);
  });
});

describe('baseline-only: Ausgangsverkündung ohne Fundstelle (Inhaltsübersichten der Amtsblätter)', () => {
  const page = (url: string, html: string) => ({ url, finalUrl: url, html, bytes: new TextEncoder().encode(html), sha256: 'x'.repeat(64), byteLength: html.length, contentType: 'text/html', retrievedAt: '2026-09-18T00:00:00Z', fromCache: true });
  const platform = (pages: Record<string, string>): Platform => ({
    stats: { networkRequests: 0, cacheHits: 0, notFound: 0, errors: 0, pending: [] } as unknown as Platform['stats'],
    get: async (url: string) => page(url, pages[url] ?? (url.includes('/amtsblatt/?volume=') ? '<html><body><table></table></body></html>' : '')),
  });
  const pages = {
    'https://www.verkuendung-bayern.de/amtsblatt/?volume=2016&journal=4': fixture('kwmbl-2016-jahrgang'),
    'https://www.verkuendung-bayern.de/amtsblatt/ausgabe/kwmbl-2016-10/': fixture('kwmbl-2016-10-ausgabe'),
  };

  it('findet genau eine Veröffentlichung mit Erlassdatum und passendem Titel, nie über die Erlassstelle allein', async () => {
    const found = await findInAmtsblattListings(platform(pages), { documentDate: '2016-07-27', citedTitle: 'Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst über den Schulversuch „Teilzeitausbildung in der Kinderpflege“' });
    expect(found).toMatchObject({ ok: true, match: { reference: { organ: 'KWMBl', explicitVolume: 2016, kind: 'page', position: 194 } } });
    const issuerOnly = await findInAmtsblattListings(platform(pages), { documentDate: '2016-07-27', citedTitle: 'Bekanntmachung des Bayerischen Staatsministeriums für Bildung und Kultus, Wissenschaft und Kunst' });
    expect(issuerOnly).toMatchObject({ ok: false });
    expect(await findInAmtsblattListings(platform(pages), { documentDate: '2008-07-27', citedTitle: 'x' })).toMatchObject({ ok: false });
  });
});

describe('baseline-only: gegliederte Neufassung und Einfügung vorwärts (BayMBl. 2023 Nr. 495 zu Nr. 266)', () => {
  it('fasst einen Bereich neu, fügt gegliederte Glieder ein und nummeriert das bisherige um – Rundlauf und Nachspielen exakt', () => {
    const base = convertGazetteHtml(fixture('baymbl-2023-266'));
    const before = sourceBody(base);
    const identity = { documentId: 'baymbl-2023-266', title: base.head.title, abbreviations: [], documentDate: '2023-05-17', references: ['BayMBl. 2023 Nr. 266', 'BayMBl. Nr. 266'] };
    const attempt = applyAmendment(before, gazetteUnits(fixture('baymbl-2023-495')), identity, 'a1-');
    expect(attempt).toMatchObject({ ok: true });
    expect(attempt.steps.map((step) => step.formula)).toEqual(['insert-words', 'replace-words', 'recast', 'insert-unit', 'insert-unit', 'relabel']);
    const flat = (blocks: readonly NormBodyBlock[], prefix = ''): string[] => blocks.flatMap((block) => [`${prefix}${`${block.type} ${block.label ?? ''} ${block.title ?? ''}`.trim()}`, ...flat(block.children ?? [], `${prefix}  `)]);
    const shape = flat(attempt.after!);
    expect(shape).toContain('  section 1.1 Arbeitsgericht München');
    expect(shape).toContain('    paragraphText');
    expect(shape).toContain('    item 1.4.4');
    expect(shape).toContain('section 2. Einführung der elektronischen Akte in der Sozialgerichtsbarkeit');
    expect(shape).toContain('  section 2.2 Sozialgericht Nürnberg');
    expect(shape).toContain('section 3. Inkrafttreten');
    expect(replaySteps(before, attempt.steps)).toEqual(attempt.after);
  });

  it('baut gegliederte Glieder nur nach einer Vorlage und nur mit lückenloser Nummerierung', () => {
    const model = { type: 'section' as const, label: '1.', title: 'Alt', children: [{ type: 'item' as const, label: '1.1', text: 'a' }] };
    const built = quotedBlocks([{ label: '2.', text: 'Neu' }, { text: 'Vorspann' }, { label: '2.1', text: 'eins' }, { label: 'a)', text: 'Buchstabe' }], ['2'], model);
    expect(built).toEqual({ blocks: [{ type: 'section', label: '2.', title: 'Neu', children: [{ type: 'paragraphText', text: 'Vorspann' }, { type: 'item', label: '2.1', text: 'eins', children: [{ type: 'item', label: 'a)', text: 'Buchstabe' }] }] }] });
    expect(quotedBlocks([{ label: '2.', text: 'Neu' }, { label: '2.2', text: 'Lücke' }], ['2'], model)).toMatchObject({ error: expect.stringContaining('lückenlos') });
    // Ohne Vorlage unter einem Abschnitt wird nichts geraten; unter einem Glied wird ein nummerierter Absatz Glied mit Text.
    expect(quotedBlocks([{ label: '2.', text: 'Neu' }, { label: '2.1', text: 'x' }], ['2'], { type: 'section', label: '1.', title: 'Alt', children: [] })).toMatchObject({ error: expect.stringContaining('Vorlage') });
    expect(quotedBlocks([{ label: '2.', text: 'Neu' }, { label: '2.1', text: 'x' }, { label: '2.1.1', text: 'tief' }], ['2'], model)).toMatchObject({ blocks: [{ children: [{ label: '2.1', children: [{ type: 'item', label: '2.1.1', text: 'tief' }] }] }] });
    expect(numberList('Die Nrn. 1.1 bis 1.3')).toEqual(['1.1', '1.2', '1.3']);
    expect(numberList('Nrn. 1.4.3 und 1.4.4')).toEqual(['1.4.3', '1.4.4']);
  });
});

describe('baseline-only: Streichung, Satzaufhebung, Überschriften, Orte', () => {
  const body: NormBodyBlock[] = [
    { type: 'item', label: '6.4', text: 'Antragsfrist', children: [{ type: 'paragraphText', text: 'Anträge sind bis 31. August 2019 zu stellen.' }] },
    { type: 'item', label: '14.', text: 'Laufzeit', children: [{ type: 'paragraphText', text: 'Der Schulversuch beginnt 2011. Über eine Fortsetzung des Schulversuchs wird bis zum Ende des Sommersemsters 2013 entschieden.' }] },
    { type: 'item', label: '4.3', text: '¹Nach Nr. 3 ANBest-I, ANBest-P, ANBest-K gilt Folgendes. ²Zweiter Satz. ³Dritter Satz.' },
  ];
  it('streicht einen zitierten Satz – bei einem Zitierfehler von einem Zeichen den Satz der Stammfassung, mit Beleg', () => {
    const result = forwardDeleteSentence(body, 'Der Satz „Über eine Fortsetzung des Schulversuchs wird bis zum Ende des Sommersemesters 2013 entschieden.“ wird gestrichen.', [{ kind: 'nummer', value: '14' }]);
    expect(result).toMatchObject({ steps: [{ operation: { kind: 'replace-text', after: 'Der Schulversuch beginnt 2011.' }, location: expect.stringContaining('Sommersemsters') }] });
    expect(oneEditApart('Sommersemesters', 'Sommersemsters')).toBe(true);
    expect(oneEditApart('Sommersemester', 'Wintersemester')).toBe(false);
  });

  it('streicht Wörter vorwärts genau einmal, hebt Sätze mit ihrer Nummer auf und liest die Überschriftzeile als Überschrift', () => {
    expect(forwardDeleteWords(body, 'In Nr. 4.3 Satz 1 wird die Angabe „ , ANBest-K“ gestrichen.', [])).toMatchObject({ steps: [{ operation: { after: '¹Nach Nr. 3 ANBest-I, ANBest-P gilt Folgendes. ²Zweiter Satz. ³Dritter Satz.' } }] });
    expect(forwardRepealSentences(body, 'Satz 2 wird aufgehoben.', [{ kind: 'nummer', value: '4.3' }])).toMatchObject({ steps: [{ operation: { after: '¹Nach Nr. 3 ANBest-I, ANBest-P, ANBest-K gilt Folgendes. ³Dritter Satz.' } }] });
    expect(headingScope(body, [{ kind: 'nummer', value: '6.4' }, { kind: 'ueberschrift', value: '' }])).toMatchObject({ fields: [{ path: [0], key: 'text' }] });
    expect(headingScope(body, [{ kind: 'nummer', value: '4.3' }, { kind: 'ueberschrift', value: '' }])).toBeUndefined();
    expect(inheritLocations([[{ kind: 'nummer', value: '5.3' }, { kind: 'satz', value: '1' }], [{ kind: 'satz', value: '2' }]])).toEqual([[{ kind: 'nummer', value: '5.3' }, { kind: 'satz', value: '1' }], [{ kind: 'nummer', value: '5.3' }, { kind: 'satz', value: '2' }]]);
    expect(commandWording('In Nr. 4.1 wird der Klammerzusatz „(FAG)“ durch den Klammerzusatz „(BayFAG)“ ersetzt.')).toBe('In Nr. 4.1 wird die Angabe „(FAG)“ durch die Angabe „(BayFAG)“ ersetzt.');
    expect(applyToTitle('Richtlinie zur Förderung von Investitionen 2017 bis 2020', { kind: 'replace', from: '2020', to: '2021' }, 't1')).toBe('Richtlinie zur Förderung von Investitionen 2017 bis 2021');
  });

  it('teilt zusammengesetzte Befehle, streicht die Satznummer zuletzt und grenzt mit dem Halbsatz ein', () => {
    expect(splitCombined('In Satz 2 wird die Satznummerierung und nach dem Wort „können“ die Wörter „im Übrigen“ gestrichen und nach dem Wort „Baumaßnahme“ das Wort „nur“ eingefügt.')).toEqual([
      'In Satz 2 werden nach dem Wort „können“ die Wörter „im Übrigen“ gestrichen.',
      'Nach dem Wort „Baumaßnahme“ das Wort „nur“ eingefügt.',
      'In Satz 2 wird die Satznummerierung gestrichen.',
    ]);
    expect(splitCombined('Die Wörter „vom Staatsministerium genehmigte“ werden gestrichen und nach dem Wort „Wörterbücher“ im ersten Halbsatz werden die Wörter „x“ eingefügt.')).toEqual(['Die Wörter „vom Staatsministerium genehmigte“ werden gestrichen.', 'Nach dem Wort „Wörterbücher“ im ersten Halbsatz werden die Wörter „x“ eingefügt.']);
    expect(splitCombined('In Satz 1 wird das Wort „und“ durch das Wort „oder“ ersetzt.')).toBeUndefined();
    const field: NormBodyBlock[] = [{ type: 'item', label: '1.3', text: 'ein- und zweisprachige Wörterbücher; elektronische Wörterbücher dürfen nicht verwendet werden;' }];
    expect(forwardHalfSentenceInsert(field, 'Nach dem Wort „Wörterbücher“ im ersten Halbsatz werden die Wörter „sowie ein Bedeutungswörterbuch“ eingefügt.', [[{ kind: 'nummer', value: '1.3' }]])).toMatchObject({ steps: [{ operation: { after: 'ein- und zweisprachige Wörterbücher sowie ein Bedeutungswörterbuch; elektronische Wörterbücher dürfen nicht verwendet werden;' } }] });
    const numbered: NormBodyBlock[] = [{ type: 'item', label: '5.4', text: '²Im Übrigen können Maßnahmen gefördert werden.' }];
    expect(forwardRemoveNumbering(numbered, 'In Satz 2 wird die Satznummerierung gestrichen.', [{ kind: 'nummer', value: '5.4' }])).toMatchObject({ steps: [{ operation: { after: 'Im Übrigen können Maßnahmen gefördert werden.' } }] });
    expect(repairCommandVerb('Folgende Nr. 1.34.2 wir angefügt: „wir angefügt“')).toBe('Folgende Nr. 1.34.2 wird angefügt: „wir angefügt“');
  });

  it('hebt ganze Glieder auf, fügt Wörter an, nummeriert Sätze über Felder um und fasst flache Aufzählungsglieder neu', () => {
    const list: NormBodyBlock[] = [{ type: 'item', label: '1.', text: 'Hilfsmittel', children: [{ type: 'item', label: '1.1', text: 'a;' }, { type: 'item', label: '1.2', text: 'b;' }, { type: 'item', label: '1.3', text: 'c;' }] }];
    expect(forwardDeleteBlocks(list, 'Nr. 1.2 wird gestrichen.', [])).toMatchObject({ steps: [{ operation: { kind: 'replace-blocks', parent: [0], index: 1, after: [] } }] });
    expect(forwardAppendWords(list, 'Die Wörter „genauere Regelungen;“ werden angefügt.', [{ kind: 'nummer', value: '1.3' }])).toMatchObject({ steps: [{ operation: { kind: 'append', text: 'genauere Regelungen;' } }] });
    const item: NormBodyBlock[] = [{ type: 'item', label: '2.3.1', text: '¹A. ²B. ³N1. ⁴N2. ⁵N3.', children: [{ type: 'paragraphText', text: '³Alt drei. ⁴Alt vier. ⁵Alt fünf.' }, { type: 'paragraphText', text: '⁶Alt sechs.' }] }];
    const inserted = new Map([['0:text', new Set([3, 4, 5])]]);
    const renumbered = forwardRenumberSentences(item, { kind: 'renumber-sentences', context: [{ kind: 'nummer', value: '2.3.1' }], pairs: [[3, 6], [4, 7], [5, 8], [6, 9]] }, inserted);
    expect('steps' in renumbered && replaySteps(item, renumbered.steps as never)).toEqual([{ type: 'item', label: '2.3.1', text: '¹A. ²B. ³N1. ⁴N2. ⁵N3.', children: [{ type: 'paragraphText', text: '⁶Alt drei. ⁷Alt vier. ⁸Alt fünf.' }, { type: 'paragraphText', text: '⁹Alt sechs.' }] }]);
    const flat: NormBodyBlock[] = [{ type: 'item', label: '3.', text: 'Wahlberechtigt:', children: [
      { type: 'item', label: 'c)', text: 'Nach Nr. 10:' }, { type: 'item', label: 'aa)', text: 'Schriftsteller:' }, { type: 'paragraphText', text: 'Verband' },
      { type: 'item', label: 'cc)', text: 'Musik-Organisationen:' }, { type: 'paragraphText', text: 'Die im Musikrat vertretenen' }, { type: 'item', label: 'd)', text: 'Nach Nr. 11:' },
    ] }];
    const units = gazetteUnits('<article id="documentbox"><dl><dt>1.</dt><dd>x</dd></dl><p>„cc) Musik-Organisationen: Bayerischer Musikrat e. V.“</p></article>').slice(-1);
    const recast = forwardFlatRecast(flat, 'Nr. 3 Buchst. c Doppelbuchst. cc wird wie folgt gefasst:', [{ ...units[0]!, label: '„cc)', text: 'Musik-Organisationen: Bayerischer Musikrat e. V.“' }], []);
    expect(recast).toMatchObject({ steps: [{ operation: { kind: 'replace-blocks', index: 3, before: [{ label: 'cc)' }, { type: 'paragraphText' }], after: [{ type: 'item', label: 'cc)', text: 'Musik-Organisationen: Bayerischer Musikrat e. V.' }] } }] });
    // BayMBl. 2021 Nr. 740: „Nr. 3 Buchst. f Doppelbuchst. cc wird wie folgt geändert: Dreifachbuchst. ccc wird aufgehoben.
    // Die Dreifachbuchst. ddd bis eee werden die Dreifachbuchst. ccc bis ddd.“ – nur unter f) cc), nicht unter c) cc).
    const triple: NormBodyBlock[] = [{ type: 'item', label: '3.', text: 'x', children: [
      { type: 'item', label: 'c)', text: 'c' }, { type: 'item', label: 'cc)', text: 'c-cc' }, { type: 'item', label: 'ccc)', text: 'c-cc-ccc' },
      { type: 'item', label: 'f)', text: 'f' }, { type: 'item', label: 'cc)', text: 'f-cc' }, { type: 'item', label: 'aaa)', text: '1' }, { type: 'item', label: 'bbb)', text: '2' }, { type: 'item', label: 'ccc)', text: '3' }, { type: 'item', label: 'ddd)', text: '4' }, { type: 'item', label: 'eee)', text: '5' },
    ] }];
    const context = [[{ kind: 'nummer' as const, value: '3' }, { kind: 'buchstabe' as const, value: 'f' }, { kind: 'doppelbuchstabe' as const, value: 'cc' }]];
    const removed = forwardFlatLetters(triple, 'Dreifachbuchst. ccc wird aufgehoben.', context);
    expect(removed).toMatchObject({ steps: [{ operation: { kind: 'replace-blocks', index: 7, before: [{ label: 'ccc)', text: '3' }], after: [] } }] });
    const afterRemoval = replaySteps(triple, (removed as { steps: never[] }).steps);
    const renamed = forwardFlatLetters(afterRemoval, 'Die Dreifachbuchst. ddd bis eee werden die Dreifachbuchst. ccc bis ddd.', context);
    expect(replaySteps(afterRemoval, (renamed as { steps: never[] }).steps)[0]!.children!.slice(5).map((block) => `${block.label} ${block.text}`)).toEqual(['aaa) 1', 'bbb) 2', 'ccc) 4', 'ddd) 5']);
  });

  it('macht aus dem einzigen Absatz eines Glieds dessen erste Unternummer und liest dezimale Bereiche als Aufzählung', () => {
    const court: NormBodyBlock[] = [{ type: 'item', label: '1.9', text: 'Amtsgericht Landshut', children: [{ type: 'paragraphText', text: 'In Verfahren nach der ZPO ab dem 1. Juni 2021.' }] }];
    expect(forwardWordingBecomesNumber(court, 'Der Wortlaut wird Nr. 1.9.1.', [{ kind: 'nummer', value: '1.9' }])).toMatchObject({ steps: [{ operation: { kind: 'replace-blocks', after: [{ label: '1.9', children: [{ type: 'item', label: '1.9.1', text: 'In Verfahren nach der ZPO ab dem 1. Juni 2021.' }] }] } }] });
    expect(forwardWordingBecomesNumber(court, 'Der Wortlaut wird Nr. 1.9.2.', [{ kind: 'nummer', value: '1.9' }])).toMatchObject({ error: expect.stringContaining('erste Unternummer') });
    expect(expandNumberRanges('In Nrn. 1.17 bis 1.20 wird jeweils das Wort „Nrn. 1 bis 3“ ersetzt.')).toBe('In Nrn. 1.17, 1.18, 1.19 und 1.20 wird jeweils das Wort „Nrn. 1 bis 3“ ersetzt.');
    expect(expandNumberRanges('Die Nrn. 1.1 bis 2.3 werden aufgehoben.')).toBe('Die Nrn. 1.1 bis 2.3 werden aufgehoben.');
  });
});

const REPO = join(import.meta.dirname, '..', '..');
const PLATFORM = 'https://www.verkuendung-bayern.de';

/** Echte, gekürzte Seiten für BayMBl. 2020 Nr. 719 (aufgehoben durch BayMBl. 2024 Nr. 234 zum 1. Juni 2024). */
const CASE_719: ReadonlyArray<[url: string, fixture: string]> = [
  [`${PLATFORM}/baymbl/2020-719/`, 'verkuendung-baseline-only-baymbl-2020-719.html'],
  [`${PLATFORM}/baymbl/2024-234/`, 'verkuendung-baseline-only-baymbl-2024-234.html'],
  [`${PLATFORM}/baymbl/2021-950/`, 'verkuendung-baseline-only-baymbl-2021-950.html'],
  [`${PLATFORM}/baymbl/?query=23.%20November%202020%20BayMBl.%20Nr.%20719&itemsPerPage=50`, 'verkuendung-baseline-only-volltext-baymbl-2020-719.html'],
  [`${PLATFORM}/baymbl/?referencenumber=700&itemsPerPage=50`, 'verkuendung-baseline-only-glnr-700.html'],
];

/** Temporärer Bestand: Ereignisregister mit einem Ereignis, Cache mit den Seiten, Institutionszuordnung des Repos. */
function temporaryRepository(pages: ReadonlyArray<[string, string]>): string {
  const root = mkdtempSync(join(tmpdir(), 'bayernrecht-baseline-only-'));
  mkdirSync(join(root, 'data/imports/bayernrecht/events'), { recursive: true });
  writeFileSync(join(root, 'data/imports/bayernrecht/events/ledger.json'), readFileSync(join(FIXTURES, 'baseline-only-ledger-baymbl-2024-234.json')));
  const mapping = join(REPO, 'data/imports/bayernrecht/institution-mapping.json');
  if (existsSync(mapping)) writeFileSync(join(root, 'data/imports/bayernrecht/institution-mapping.json'), readFileSync(mapping));
  mkdirSync(join(root, '.cache/bayernrecht'), { recursive: true });
  for (const [url, file] of pages) {
    const bytes = readFileSync(join(FIXTURES, file));
    const key = join(root, '.cache/bayernrecht', cacheKey(url));
    writeFileSync(`${key}.bin`, bytes);
    writeFileSync(`${key}.json`, `${JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'text/html; charset=utf-8', retrievedAt: '2026-09-18T10:00:00.000Z', sha256: sha256(bytes), byteLength: bytes.byteLength }, null, 2)}\n`);
  }
  return root;
}

const NOW = (): Date => new Date('2026-09-18T12:00:00.000Z');

describe('baseline-only: Schreibweg in einem temporären Bestand', () => {
  it('stellt BayMBl. 2020 Nr. 719 offline wieder her – Rezept, Norm, Manifest events, Slug-Registry, Bericht – und bleibt beim zweiten Lauf unverändert', async () => {
    const root = temporaryRepository(CASE_719);
    try {
      const dry = await runBaselineOnly({ root, write: false, offline: true, baselineDate: BASELINE, now: NOW });
      expect(dry.metrics).toMatchObject({ candidates: 1, strongIdentity: 1, baseFound: 1, fullChain: 1, safelyReconstructed: 1, safeNorms: 1 });
      expect(dry.network).toMatchObject({ networkRequests: 0, pending: [] });
      expect(dry.written).toEqual([]);
      expect(existsSync(join(root, 'content'))).toBe(false);

      const run = await runBaselineOnly({ root, write: true, offline: true, baselineDate: BASELINE, now: NOW });
      expect(run.restoreFailures).toEqual([]);
      expect(run.restored).toHaveLength(1);
      const [norm] = run.restored;
      expect(norm).toMatchObject({ id: 'baymbl-2020-719', type: 'verwaltungsvorschrift', sourceValidFrom: '2021-01-01', sourceValidTo: '2024-05-31', amendments: 0, changed: true });
      expect(run.written).toEqual(expect.arrayContaining([recipePath('baymbl-2020-719'), 'data/imports/bayernrecht/baseline-only/candidates.json', 'data/audits/bayernrecht/BASELINE_ONLY.md', 'data/imports/bayernrecht/slug-registry.json']));

      // Rezept: Quellen mit Prüfsummen, Beginn und Ende mit Wortlaut, Gegenprobe mit Volltextsuche.
      const recipe = JSON.parse(readFileSync(join(root, recipePath('baymbl-2020-719')), 'utf8')) as BaselineOnlyRecipe;
      expect(recipe).toMatchObject({ id: 'baymbl-2020-719', baselineDate: BASELINE, method: 'reconstructed-from-publications', amendments: [] });
      expect(recipe.base.sha256).toBe(sha256(readFileSync(join(FIXTURES, 'verkuendung-baseline-only-baymbl-2020-719.html'))));
      expect(recipe.begin).toMatchObject({ date: '2021-01-01' });
      expect(recipe.begin.evidence[0]).toContain('tritt am 1. Januar 2021 in Kraft');
      expect(recipe.end).toMatchObject({ lastDay: '2024-05-31', repeal: { citation: 'BayMBl. 2024 Nr. 234' } });
      expect(recipe.chain).toMatchObject({ complete: true, fulltext: { query: '23. November 2020 BayMBl. Nr. 719', hits: 2 } });
      expect(recipe.sources.map((source) => source.role)).toEqual(expect.arrayContaining(['base', 'repeal', 'listing']));
      for (const source of recipe.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);

      // Bestand: Norm, Manifest im Bereich events, Slug-Reservierung.
      const content = join(root, 'content/norms/baywue', norm!.slug);
      expect(existsSync(join(content, 'meta.json'))).toBe(true);
      expect(existsSync(join(content, 'versions', `${BASELINE}.json`))).toBe(true);
      const manifest = await readManifest(root);
      expect(manifest.entries).toHaveLength(1);
      const entry = manifest.entries[0]!;
      expect(isBaselineOnlyEntry(entry)).toBe(true);
      expect(entry).toMatchObject({ sourceArea: 'events', sourceIdentity: 'baymbl-2020-719', baselineRecoveryMethod: 'reconstructed-from-publications', targetSlug: norm!.slug });
      expect(entry.rawDocuments.filter((raw) => raw.role === 'gazette').map((raw) => raw.url)).toEqual(expect.arrayContaining([`${PLATFORM}/baymbl/2020-719/`, `${PLATFORM}/baymbl/2024-234/`]));
      expect([...restoredBaselineOnlyEventIds(manifest.entries)]).toEqual(['baymbl-2024-234-n00234-05-db6e5d5bba']);
      expect((await readSlugRegistry(root)).entries.map((item) => item.slug)).toContain(norm!.slug);

      // Audit und Abdeckung erkennen und zählen den Eintrag.
      expect(checkBaselineOnly(manifest, await readRecipeHeads(root))).toEqual([]);
      const audit = await runAudit(root);
      expect(audit.findings).toEqual([]);
      expect(audit.counts.baselineOnlyRestored).toBe(1);
      expect((await collectCoverage(root, NOW().toISOString())).baselineOnly.entries).toBe(1);

      // Zweiter Lauf: nichts neu geschrieben.
      const again = await runBaselineOnly({ root, write: true, offline: true, baselineDate: BASELINE, now: NOW });
      expect(again.written).toEqual([]);
      expect(again.restored[0]).toMatchObject({ slug: norm!.slug, changed: false });

      // Das Rezept hängt an den Quellbytes: Eine veränderte Stammverkündung im Cache bricht das Nachspielen ab.
      await expect(replayRecipe(root, recipe)).resolves.toBeDefined();
      const cached = join(root, '.cache/bayernrecht', `${cacheKey(`${PLATFORM}/baymbl/2020-719/`)}.bin`);
      writeFileSync(cached, `${readFileSync(cached, 'utf8')}\n<!-- verändert -->`);
      await expect(replayRecipe(root, recipe)).rejects.toMatchObject({ code: 'source-changed' });
      await expect(replayRecipe(root, recipe)).rejects.toBeInstanceOf(RecipeError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('führt der Bestand die Norm schon (gleicher Titel, anderer Bereich), wird nichts wiederhergestellt: Widerspruch zum Register', async () => {
    const root = temporaryRepository(CASE_719);
    try {
      const first = await runBaselineOnly({ root, write: true, offline: true, baselineDate: BASELINE, now: NOW });
      const restoredEntry = (await readManifest(root)).entries[0]!;
      // Derselbe Titel aus dem Portalbestand (Bereich vwv) – wie BayVV_1132_S_086 zur EuMedBek (AllMBl. 2018 S. 962).
      const { baselineOnly: _marker, ...rest } = restoredEntry as typeof restoredEntry & { baselineOnly?: unknown };
      await writeManifestEntry(root, { ...rest, sourceArea: 'vwv', sourceIdentity: 'BayVV_700_W_999', sourceUrl: 'https://www.gesetze-bayern.de/Content/Document/BayVV_700_W_999', baselineRecoveryMethod: 'current-source' });
      const run = await runBaselineOnly({ root, write: false, offline: true, baselineDate: BASELINE, now: NOW });
      expect(first.restored).toHaveLength(1);
      expect(run.restored).toEqual([]);
      expect(run.restoreFailures).toEqual([]);
      expect(run.candidates[0]).toMatchObject({ outcome: 'contradictory', missing: { code: 'present-in-bestand' }, funnel: { safe: false } });
      expect(run.candidates[0]!.missing!.detail).toContain('BayVV_700_W_999');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ohne vollständige Gegenprobe keine Wiederherstellung: fehlt eine Treffer-Seite im Cache, bleibt die Norm offen', async () => {
    const root = temporaryRepository(CASE_719.filter(([url]) => !url.endsWith('/2021-950/')));
    try {
      const run = await runBaselineOnly({ root, write: true, offline: true, baselineDate: BASELINE, now: NOW });
      expect(run.restored).toEqual([]);
      expect(run.candidates[0]).toMatchObject({ outcome: 'pending', missing: { code: 'chain-scan-incomplete' } });
      expect(run.network.pending).toContain(`${PLATFORM}/baymbl/2021-950/`);
      expect(existsSync(join(root, 'content'))).toBe(false);
      expect(existsSync(join(root, recipePath('baymbl-2020-719')))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Steuerzeichen in Verkündungsseiten', () => {
  it('sind nie Text: NUL-Bytes nach dem letzten Absatz (jmbl-2014-5-66) verschwinden, Leerraum bleibt', async () => {
    const { normalizeText } = await import('@landesrecht/importer-bayernrecht/baseline-only/html.ts');
    const nul = String.fromCharCode(0);
    expect(normalizeText(nul.repeat(8))).toBe('');
    expect(normalizeText(`Diese Bekanntmachung${nul} tritt am 1. Juli 2014 in Kraft.${String.fromCharCode(31)}`)).toBe('Diese Bekanntmachung tritt am 1. Juli 2014 in Kraft.');
  });
});
