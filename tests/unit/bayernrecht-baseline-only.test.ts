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
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { gazetteUnits } from '@landesrecht/importer-bayernrecht/reconstruction/gazette.ts';
import { determineEnd, determineEndAcross, locateCitation, parseCitationTail, titleKey } from '@landesrecht/importer-bayernrecht/baseline-only/identity.ts';
import { baymblFulltextUrl, candidateVolumes, fulltextQuery, locateBase, parseParenthetical, sameReference } from '@landesrecht/importer-bayernrecht/baseline-only/references.ts';
import { buildBody, canonicalText, checkIntegrity, ConversionError, convertGazetteHtml, decimalSequenceConsistent, pageText, segments, splitHead, textBody } from '@landesrecht/importer-bayernrecht/baseline-only/html.ts';
import { headDates, publicationTitle, titleCheck } from '@landesrecht/importer-bayernrecht/baseline-only/base.ts';
import { ownBegin, ownExpiry, scopeDecision, titleParts } from '@landesrecht/importer-bayernrecht/baseline-only/analyze.ts';
import { citationsOfBase, glnrStem } from '@landesrecht/importer-bayernrecht/baseline-only/chain.ts';
import { parseAmtsblattIssue, parsePublicationHead } from '@landesrecht/importer-bayernrecht/baseline-only/platform.ts';
import { MISSING_LINKS, recipePath, type BaselineOnlyRecipe } from '@landesrecht/importer-bayernrecht/baseline-only/model.ts';
import { runBaselineOnly } from '@landesrecht/importer-bayernrecht/baseline-only/run.ts';
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

  it('errechnet kein Datum aus der Verkündung und erfindet keinen Beginn', () => {
    expect(ownBegin([paragraph('Diese Bekanntmachung tritt am Tag nach ihrer Bekanntmachung in Kraft.')], [], '2021-03-10')).toMatchObject({ code: 'begin-not-calendar-date' });
    expect(ownBegin([paragraph('Die Regelungen gelten für alle Schulen.')], [], '2021-03-10')).toMatchObject({ code: 'begin-no-commencement-clause' });
    expect(ownBegin([paragraph('Diese Bekanntmachung tritt am 1. März 2021 in Kraft.'), paragraph('Diese Bekanntmachung tritt am 1. April 2021 in Kraft.')], [], '2021-03-10')).toMatchObject({ code: 'begin-unreadable' });
    // Die Aufhebung einer Vorgängerin ist kein Außerkrafttreten der Norm selbst.
    expect(ownExpiry([paragraph('Mit Ablauf des 28. Februar 2021 tritt die Bekanntmachung vom 23. November 2006 (FMBl. S. 228) außer Kraft.')])).toEqual({});
    expect(ownExpiry([paragraph('Die Richtlinie gilt bis zum Ende des Schuljahres 2019/2020.')])).toMatchObject({ code: 'own-expiry-unreadable' });
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
});

/* ------------------------------------------------------------------------- Schreibweg (temporär) */

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
