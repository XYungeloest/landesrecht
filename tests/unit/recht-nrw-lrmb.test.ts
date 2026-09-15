/**
 * LRMB-Import (Verwaltungsvorschriften) ohne Netz: Dokumenttyp und Normativität, Erlasskopf,
 * Fundstellenverlauf, Geltungsklauseln, Parser, Ministerialblatt, Stichtagsprüfung, Rekonstruktion
 * und der vollständige Importpfad mit Fake-Fetcher (Manifest, Review-Queue, D1, Suche, Routing).
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decodeHtml, RechtNrwFetchError, type FetchedDocument, type RechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { readManifest } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { readReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { selectSourceVersionAtBaseline } from '@landesrecht/importer-recht-nrw/common/version-selection.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';
import { assessNormativity, classifyLrmbDocumentType } from '@landesrecht/importer-recht-nrw/lrmb/classify.ts';
import { gazetteEntryUrlCandidates, identifiesBaseDocument, parseGazetteEntry, resolveInForceDate } from '@landesrecht/importer-recht-nrw/lrmb/gazette.ts';
import { lrmbRawMetrics, parseLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { importRechtNrwLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/pipeline.ts';
import { applyReconstruction, bodyFingerprint, topLevelQuotes, type ReconstructionRecipe, type ReconstructionStep } from '@landesrecht/importer-recht-nrw/lrmb/reconstruction.ts';
import { parseChangeNote, parseDecreeFromTitle, parseLrmbHead, parsePublicationHistoryItem, parseValidityClauses, type ChangeNoteAmendment } from '@landesrecht/importer-recht-nrw/lrmb/text-metadata.ts';
import { assessLrmbValidity, type AmendmentEvidence } from '@landesrecht/importer-recht-nrw/lrmb/validity.ts';
import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { getNormUrl } from '@landesrecht/legal-core/lib/routes.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { buildProjectionPlan } from '@landesrecht/runtime/projection.ts';
import { checkSearchIndexIntegrity, executePlan, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';
import { createSearchState } from '@landesrecht/search/query.ts';

const repoRoot = process.cwd();
const fixtures = join(repoRoot, 'tests', 'fixtures', 'recht-nrw', 'lrmb');
const BASELINE = '2023-12-01';
const BASE = 'https://recht.nrw.de';
const DIRECT = `${BASE}/lrmb/verwaltungsvorschrift/01062022-runderlass-testbestimmungen-fuer-die-ordnungsbehoerden`;
const RECON = `${BASE}/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-testhundegesetz-vv-testhg-nrw`;
const EXPIRED = `${BASE}/lrmb/verwaltungsvorschrift/26022022-vergaberichtlinien-fuer-testhochschulen`;
const EXCLUDED = `${BASE}/lrmb/bekanntmachung/16062021-3-oeffentliche-sitzung-der-vertreterversammlung`;
const PDF = `${BASE}/system/files/pdf/ministerial-journal/2022/03/16/abc/anlage-testbestimmungen.pdf`;
const MBL2020 = `${BASE}/mblnrw/2020-s446-0`;
const MBL2024 = `${BASE}/mblnrw/2024-s805`;
const FILES: Record<string, string> = { [DIRECT]: 'page-direct.html', [RECON]: 'page-reconstruct.html', [EXPIRED]: 'page-expired.html', [EXCLUDED]: 'page-excluded.html', [PDF]: 'pdf', [MBL2020]: 'mbl-2020-s446-0.html', [MBL2024]: 'mbl-2024-s805.html' };
const fixture = (name: string): Promise<string> => readFile(join(fixtures, name), 'utf8');
const now = (): Date => new Date('2026-09-15T12:00:00.000Z');

function fakeFetcher(): RechtNrwFetcher & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    stats: { networkRequests: 0, cacheHits: 0 },
    async fetch(url: string): Promise<FetchedDocument> {
      requested.push(url);
      const file = FILES[url];
      if (!file) throw new RechtNrwFetchError('not-found', url, `HTTP 404 für ${url}`, 404);
      const bytes = file === 'pdf' ? new TextEncoder().encode('%PDF-1.4 Testanlage') : new Uint8Array(await readFile(join(fixtures, file)));
      return { url, finalUrl: url, status: 200, contentType: file === 'pdf' ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: createHash('sha256').update(bytes).digest('hex'), bytes, fromCache: false };
    },
  };
}

function units(blocks: readonly NormBodyBlock[], scope?: string): Map<string, NormBodyBlock> {
  const map = new Map<string, NormBodyBlock>();
  const start = scope ? blocks.find((block) => block.type === 'part' && block.label === scope)?.children ?? [] : blocks;
  const visit = (entries: readonly NormBodyBlock[]): void => {
    for (const block of entries) {
      if ((block.type === 'section' || block.type === 'subsection') && block.label) map.set(block.label, block);
      if (block.children && block.type !== 'part') visit(block.children);
    }
  };
  visit(start);
  return map;
}

const unitText = (block: NormBodyBlock | undefined): string => (block?.children ?? []).filter((child) => child.text).map((child) => child.text).join(' | ');

describe('Dokumenttyp und Normativitätsfilter', () => {
  it('ordnet die LRMB-Quelltypen nach Titel und Erlasskopf zu', () => {
    expect(classifyLrmbDocumentType({ title: 'Allgemeine Verwaltungsvorschriften zum Landesreisekostengesetz (VVzLRKG)', decreeKind: 'runderlass' })).toMatchObject({ sourceDocumentType: 'allgemeine-verwaltungsvorschrift', normType: 'allgemeine-verwaltungsvorschrift' });
    expect(classifyLrmbDocumentType({ title: 'Durchführungserlass zum Regionalen Wirtschaftsförderungsprogramm' }).sourceDocumentType).toBe('durchfuehrungserlass');
    expect(classifyLrmbDocumentType({ title: 'Richtlinie über die Gewährung von Zuwendungen zur Förderung von Testprojekten' })).toMatchObject({ sourceDocumentType: 'richtlinie', normType: 'foerderrichtlinie' });
    expect(classifyLrmbDocumentType({ title: 'Vergaberichtlinien für Hochschulen' })).toMatchObject({ sourceDocumentType: 'richtlinie', normType: 'richtlinie' });
    expect(classifyLrmbDocumentType({ title: 'Verwaltungsvorschrift Technische Baubestimmungen NRW (VV TB NRW)' }).sourceDocumentType).toBe('verwaltungsvorschrift');
    expect(classifyLrmbDocumentType({ title: 'Genehmigung von Dienstreisen der Beschäftigten', decreeKind: 'runderlass' }).sourceDocumentType).toBe('runderlass');
    expect(classifyLrmbDocumentType({ title: 'Ausführungsbestimmungen zum Testgesetz' })).toMatchObject({ sourceDocumentType: 'sonstige-verwaltungsvorschrift', normType: 'verwaltungsvorschrift' });
  });

  it('nimmt abstrakt-generelle Verwaltungsvorschriften auf', () => {
    expect(assessNormativity({ portalType: 'verwaltungsvorschrift', title: 'Runderlass Kostentragung in der Kampfmittelbeseitigung', decreeKind: 'runderlass', bodyText: 'Die Behörden tragen die Kosten; es gilt Folgendes.' }).decision).toBe('include');
  });

  it('schließt Einzelfälle, Personalnachrichten, Sitzungen und Satzungen aus', () => {
    for (const title of ['Stellenausschreibung Referentin im Ministerium', '9. öffentliche Sitzung der Vertreterversammlung der Unfallkasse', 'Satzung zur Änderung der Hauptsatzung des Landschaftsverbandes', 'Bekanntmachung der Verleihung von Körperschaftsrechten an die Testgemeinde', 'Plangenehmigung für das Hochwasserrückhaltebecken Teichmühle']) {
      expect(assessNormativity({ portalType: 'verwaltungsvorschrift', title, bodyText: 'Die Behörden gelten.' }).decision, title).toBe('exclude');
    }
  });

  it('erklärt Zweifelsfälle nie automatisch zu Landesrecht', () => {
    expect(assessNormativity({ portalType: 'verwaltungsvorschrift', title: 'Hinweise zur Berücksichtigung des ÖPNV', decreeKind: 'runderlass', bodyText: 'Die Behörden sollen.' }).decision).toBe('review');
    expect(assessNormativity({ portalType: 'verwaltungsvorschrift', title: 'Kopferlass Vereinbarung zwischen Bund und Ländern', bodyText: 'gilt' }).decision).toBe('review');
    expect(assessNormativity({ portalType: 'bekanntmachung', title: 'Bekanntmachung des Inkrafttretens des Staatsvertrags', bodyText: 'gilt' }).decision).toBe('review');
    expect(assessNormativity({ portalType: 'verwaltungsvorschrift', title: 'Verwaltungsvorschriften zur LHO', decreeKind: 'runderlass', bodyText: 'Hiermit werden die Verwaltungsvorschriften bekannt gegeben.' }).decision).toBe('review');
  });
});

describe('Erlasskopf, Fundstellenverlauf und Geltungsklauseln', () => {
  it('liest mehrzeilige und einzeilige Erlassköpfe mit Aktenzeichen und Datum wörtlich', () => {
    const multi = parseLrmbHead([{ lines: ['Allgemeine Verwaltungsvorschriften', 'zum Landesreisekostengesetz (VVzLRKG)'], centered: true, bold: true }, { lines: ['Runderlass', 'des Ministeriums der Finanzen', 'B 2905 - A 13 - IV A 2'], centered: true, bold: false }, { lines: ['Vom 13. Dezember 2021'], centered: true, bold: false }, { lines: ['1', 'Zu § 1'], centered: false, bold: true }]);
    expect(multi).toMatchObject({ decreeKind: 'runderlass', issuingAuthorityText: 'des Ministeriums der Finanzen', fileReference: 'B 2905 - A 13 - IV A 2', issuedOn: '2021-12-13', consumed: 3 });
    expect(multi.titleLines).toEqual(['Allgemeine Verwaltungsvorschriften', 'zum Landesreisekostengesetz (VVzLRKG)']);
    const single = parseLrmbHead([{ lines: ['Verwaltungsvorschriften zum Landeshundegesetz', '(VV LHundG NRW)'], centered: true, bold: true }, { lines: ['RdErl. d. Ministeriums für Umwelt und Naturschutz,', 'Landwirtschaft und Verbraucherschutz', '- VI-7 - 78.01.52 - v. 2.5.2003'], centered: true, bold: false }]);
    expect(single).toMatchObject({ decreeKind: 'runderlass', issuingAuthorityText: 'd. Ministeriums für Umwelt und Naturschutz, Landwirtschaft und Verbraucherschutz', fileReference: 'VI-7 - 78.01.52', issuedOn: '2003-05-02' });
    const titleOnly = parseLrmbHead([{ lines: ['Runderlass', 'für die Fassung von Rechtsbehelfsbelehrungen'], centered: true, bold: true }, { lines: ['Runderlass', 'des Ministeriums des Innern', '- Az. 14-21.36.06.04-000003.2023-0013470 -', '', 'Vom 14. November 2023'], centered: true, bold: false }]);
    expect(titleOnly).toMatchObject({ issuingAuthorityText: 'des Ministeriums des Innern', fileReference: 'Az. 14-21.36.06.04-000003.2023-0013470', issuedOn: '2023-11-14' });
    expect(parseDecreeFromTitle('Verwaltungsvorschriften zur LANDESHAUSHALTSORDNUNG (VV - LHO) RdErl. d. Finanzministers v. 21 7 1972 -IDS-Tgb.Nr 3061/72¹)')).toMatchObject({ title: 'Verwaltungsvorschriften zur LANDESHAUSHALTSORDNUNG (VV - LHO)', issuedOn: '1972-07-21', fileReference: 'IDS-Tgb.Nr 3061/72' });
  });

  it('zerlegt den Fundstellenverlauf ohne zu raten', () => {
    const note = parseChangeNote('MBl . NRW. 2021 S. 1096 , geändert durch Runderlass vom 16. Mai 2022 ( MBl. NRW. 2022 S. 410 a).');
    expect(note.base).toMatchObject({ gazette: 'MBl. NRW.', year: 2021, page: '1096' });
    expect(note.amendments[0]).toMatchObject({ decreeDate: '2022-05-16', citation: { year: 2022, page: '410a' }, unpublished: false });
    expect(note.complete).toBe(true);
    const unpublished = parseChangeNote('MBl. NRW. 2021 S. 444, geändert durch Runderlass vom 17. Juli 2022 ( MBl. NRW. 2022 S. 654 ), 31. März 2024 (n. v.), 25.7.2017 ( MBl. NRW. 2017 S. 737 ).');
    expect(unpublished.amendments.map((entry) => [entry.decreeDate, entry.unpublished])).toEqual([['2022-07-17', false], ['2024-03-31', true], ['2017-07-25', false]]);
    const incomplete = parseChangeNote('MBl. NRW. 2013 S. 116 , geändert durch Runderlass vom 19. Februar ( MBl. NRW. 2024 S. 294 ).');
    expect(incomplete.amendments[0]).toMatchObject({ decreeDateIncomplete: true, citation: { year: 2024, page: '294' } });
    expect(incomplete.amendments[0]!.decreeDate).toBeUndefined();
    expect(parsePublicationHistoryItem('Veröffentlichung: MB.NRW 2026 Nr. 94 Geändert durch Runderlass vom 10. April 2026, in Kraft getreten am 22. April 2026.')).toMatchObject({ decreeDate: '2026-04-10', inForce: '2026-04-22', citation: { gazette: 'MB.NRW', year: 2026, number: '94' } });
  });

  it('liest Inkraft- und Außerkrafttreten nur dieser Vorschrift', () => {
    expect(parseValidityClauses(['Dieser Runderlass tritt am 1. August 2022 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.'])).toMatchObject({ inForce: { kind: 'date', date: '2022-08-01' }, expiry: { date: '2027-12-31' } });
    expect(parseValidityClauses(['Der Runderlass tritt mit Wirkung vom 1.3.2013 in Kraft und mit Ablauf des 29. Februar 2028 außer Kraft.'])).toMatchObject({ inForce: { kind: 'retroactive-date', date: '2013-03-01' }, expiry: { date: '2028-02-29' } });
    expect(parseValidityClauses(['Dieser RdErl. tritt am Tag nach der Veröffentlichung in Kraft. Er tritt mit Ablauf des 31. Dezember 2027 außer Kraft.'])).toMatchObject({ inForce: { kind: 'day-after-publication' }, expiry: { date: '2027-12-31' } });
    expect(parseValidityClauses(['Dieser Runderlass ergeht im Benehmen mit dem Ministerium des Innern und tritt am Tag nach der Veröffentlichung in Kraft.']).inForce?.kind).toBe('day-after-publication');
    const other = parseValidityClauses(['Dieser Runderlass tritt am 1. Juni 2022 in Kraft. Gleichzeitig tritt der Runderlass vom 9. November 2007 (MBl. NRW. S. 863) am 31. Mai 2022 außer Kraft.']);
    expect(other.inForce?.date).toBe('2022-06-01');
    expect(other.expiry).toBeUndefined();
  });
});

describe('LRMB-Parser', () => {
  it('bildet Dezimalgliederung, Tabellen, Listen, Fußnoten und Fundstellenverlauf auf das Blockmodell ab', async () => {
    const page = parseVersionPage(await fixture('page-direct.html'), DIRECT);
    const html = page.content.format === 'native' ? page.content.bodyHtml : '';
    const parsed = parseLrmbDocument(html);
    expect(parsed.head).toMatchObject({ decreeKind: 'runderlass', issuingAuthorityText: 'des Ministeriums des Innern', fileReference: '36-54.01', issuedOn: '2022-03-16' });
    expect(parsed.style).toBe('decimal');
    expect(parsed.blocks.map((block) => [block.type, block.label, block.title])).toEqual([['section', '1', 'Allgemeines'], ['section', '2', 'Inkrafttreten']]);
    const section1 = parsed.blocks[0]!;
    expect(section1.children!.map((block) => [block.type, block.label])).toEqual([['paragraphText', undefined], ['subsection', '1.1'], ['subsection', '1.2']]);
    const s11 = section1.children![1]!;
    expect(s11.children![0]).toMatchObject({ type: 'paragraphText', text: 'Die Behörden prüfen jeden Antrag innerhalb von vier Wochen.' });
    expect(s11.children![0]!.children).toEqual([{ type: 'footnote', label: 'Fn 1', text: 'Personenbezeichnungen gelten für alle Geschlechter.' }]);
    const s12 = section1.children![2]!;
    expect(s12.children!.map((block) => block.type)).toEqual(['paragraphText', 'table', 'subitem', 'subitem']);
    expect(parsed.changeNoteText).toBe('MBl. NRW. 2022 S. 229.');
    expect(parsed.stats).toMatchObject({ units: 4, tables: 1, footnotes: 1, footnoteMarkers: 1, duplicateLabels: [] });
    const raw = lrmbRawMetrics(html);
    expect(raw).toMatchObject({ numberedParagraphs: 4, tables: 1, footnoteMarkers: 1 });
    expect(Math.abs(parsed.stats.textLength + parsed.stats.excludedTextLength - raw.textLength)).toBeLessThan(200);
    expect(parsed.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('erkennt Teile mit eigener Nummerierung, alle Nummernschreibweisen und Inhaltsübersichten', () => {
    const html = '<div class="tex2jax_process"><p><strong>Inhaltsübersicht</strong></p><p>1 Grundsätze<br>1.1 Zweck<br>1.2 Begriffe<br>2 Verfahren</p><p><strong>I. Allgemeiner Teil</strong></p><p>1.<br>Auf Grund des Gesetzes gilt Folgendes.</p><p><strong>II. Besonderer Teil</strong></p><p><strong>1</strong><br><strong>Zu § 1 (Zweck)<br></strong> Die Zweckbestimmung gilt.</p><p>1.1<br>Besonderes Interesse<br>Das Interesse ist nachzuweisen.</p><p><br><strong>2</strong><br><strong>Verfahren</strong><br><br><strong>2.1</strong><br><strong>Antrag</strong><br>Der Antrag ist schriftlich zu stellen.</p><p><strong>2.2.</strong><br>– erstens<br></p></div>';
    const parsed = parseLrmbDocument(html);
    expect(parsed.blocks.map((block) => [block.type, block.label])).toEqual([['heading', undefined], ['paragraphText', undefined], ['part', 'I.'], ['part', 'II.']]);
    expect(parsed.stats.tocBlocks).toBe(1);
    const second = units(parsed.blocks, 'II.');
    expect([...second.keys()]).toEqual(['1', '1.1', '2', '2.1', '2.2']);
    expect(second.get('1')!.title).toBe('Zu § 1 (Zweck)');
    expect(second.get('1.1')!.title).toBe('Besonderes Interesse');
    expect(unitText(second.get('2.1'))).toBe('Der Antrag ist schriftlich zu stellen.');
    expect(units(parsed.blocks, 'I.').get('1')).toBeDefined();
    expect(parsed.stats.duplicateLabels).toEqual([]);
    expect(lrmbRawMetrics(html).numberedParagraphs).toBe(parsed.stats.units);
  });

  it('meldet doppelte Nummern, unbekannte Elemente und Bilder fail-closed', () => {
    const duplicate = parseLrmbDocument('<div class="tex2jax_process"><p><strong>1</strong><br>A</p><p><strong>1</strong><br>B</p></div>');
    expect(duplicate.findings.map((finding) => finding.code)).toContain('structure-duplicate-number');
    const unknown = parseLrmbDocument('<div class="tex2jax_process"><p>Text <marquee>laufend</marquee></p><figure><img src="x.png"></figure></div>');
    expect(unknown.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(['unknown-inline-element', 'unknown-block-element']));
    expect(JSON.stringify(unknown.blocks)).toContain('laufend');
  });
});

describe('Ministerialblatt-Einträge', () => {
  it('liest Ausgabe, Veröffentlichung, Inkrafttreten, Bezugnahme und Vorgängeränderung', async () => {
    const entry = parseGazetteEntry(await fixture('mbl-2024-s805.html'), MBL2024);
    expect(entry).toMatchObject({ title: 'Änderung der Verwaltungsvorschriften zum Testhundegesetz', issue: 'MBl. NRW. 2024 Nr. 25', publishedOn: '2024-07-30', page: '805' });
    expect(entry.parse.classificationNumber).toBe('2060');
    expect(resolveInForceDate(entry)).toEqual({ date: '2024-07-31', derivation: 'Tag nach der Veröffentlichung am 2024-07-30' });
    expect(entry.baseReferences.map((reference) => [reference.date, reference.page])).toEqual([['2003-05-02', '580'], ['2020-07-06', '446']]);
    expect(entry.predecessor).toMatchObject({ latest: true, date: '2020-07-06' });
    expect(identifiesBaseDocument(entry, { issuedOn: '2003-05-02', citation: { gazette: 'MBl. NRW.', year: 2003, page: '580', text: 'MBl. NRW. 2003 S. 580' } }).ok).toBe(true);
    expect(identifiesBaseDocument(entry, { issuedOn: '2003-05-02', citation: { gazette: 'MBl. NRW.', year: 2003, page: '581', text: 'MBl. NRW. 2003 S. 581' } }).ok).toBe(false);
    expect(identifiesBaseDocument(entry, { citation: { gazette: 'MBl. NRW.', year: 2003, page: '580', text: '' } }).ok).toBe(false);
    expect(gazetteEntryUrlCandidates({ gazette: 'MBl. NRW.', year: 2022, page: '410a', text: '' })).toEqual([`${BASE}/mblnrw/2022-s410a`]);
    expect(gazetteEntryUrlCandidates({ gazette: 'MBl. NRW.', year: 2020, page: '446', text: '' })).toHaveLength(4);
  });
});

function amendment(decreeDate: string, inForce: string | undefined, incorporated: boolean, extra: Partial<AmendmentEvidence> = {}): AmendmentEvidence {
  const note: ChangeNoteAmendment = { raw: '', decreeDateText: decreeDate, decreeDate, decreeDateIncomplete: false, unpublished: false, citation: { gazette: 'MBl. NRW.', year: Number(decreeDate.slice(0, 4)), page: '1', text: `MBl. NRW. ${decreeDate.slice(0, 4)} S. 1` } };
  const evidence: AmendmentEvidence = { note, incorporated, inForceDerivation: 'Test', identification: { ok: true, reason: 'Test' }, gazetteUrl: `${BASE}/mblnrw/${decreeDate}` , ...extra };
  if (inForce) evidence.inForce = inForce;
  return evidence;
}

describe('Stichtagsprüfung (LRMB-Zeitmodell)', () => {
  const dated = (validFrom: string, validTo?: string) => {
    const selection = selectSourceVersionAtBaseline([{ validFrom, validTo: validTo ?? null, available: true, url: 'u' }], BASELINE);
    return { page: { url: 'u', sha256: 's', validFrom, ...(validTo ? { validTo } : {}), undated: false, hasLaterVersions: false }, selection };
  };

  it('direkt: Portalintervall deckt den Stichtag, keine Änderungen', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, ...dated('2022-06-01'), clauses: { unparsed: [] }, amendments: [], versionStarts: ['2022-06-01'] });
    expect(result).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidity: 'exact', sourceValidFrom: '2022-06-01' });
    expect(result.sourceValidTo).toBeUndefined();
  });

  it('direkt mit belegtem Textstand: eingearbeitete Änderung vor dem Stichtag', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, ...dated('2014-08-23'), clauses: { unparsed: [], expiry: { date: '2027-12-31', text: 'x' } }, amendments: [amendment('2018-05-07', '2018-05-26', true), amendment('2023-11-06', '2023-11-17', true, { predecessor: { latest: false, date: '2018-05-07' } })], versionStarts: ['2014-08-23'] });
    expect(result).toMatchObject({ textStatus: 'direct', sourceValidity: 'verified-active-at-baseline', sourceValidFrom: '2023-11-17' });
    expect(result.sourceValidTo).toBeUndefined();
    expect(result.evidence.map((entry) => entry.kind)).toEqual(expect.arrayContaining(['portal-version-interval', 'text-expiry-clause', 'gazette-amendment', 'gazette-amendment-chain']));
  });

  it('Rekonstruktion rückwärts: eingearbeitete Änderung nach dem Stichtag, Intervall aus Belegen', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, page: { url: 'u', sha256: 's', undated: true, hasLaterVersions: false }, clauses: { unparsed: [] }, issuedOn: '2003-05-02', amendments: [amendment('2020-07-06', '2020-07-31', true), amendment('2024-07-16', '2024-07-31', true, { predecessor: { latest: true, date: '2020-07-06' } })], versionStarts: [] });
    expect(result).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', sourceValidFrom: '2020-07-31', sourceValidTo: '2024-07-30' });
    expect(result.postBaselineAmendments.map((entry) => entry.note.decreeDate)).toEqual(['2024-07-16']);
    expect(result.findings.map((finding) => finding.code)).toEqual(['reconstruction-required']);
  });

  it('Rekonstruktion vorwärts: nicht eingearbeitete Änderung vor dem Stichtag', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, ...dated('2022-01-01', '2025-12-31'), clauses: { unparsed: [] }, amendments: [amendment('2023-05-10', '2023-06-01', false)], versionStarts: ['2022-01-01', '2026-01-01'] });
    expect(result.textStatus).toBe('reconstruction-required');
    expect(result.missingPreBaselineAmendments).toHaveLength(1);
  });

  it('eine spätere Portalfassung ist keine Textänderung der gewählten Seite', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, ...dated('2022-01-01', '2025-12-31'), clauses: { unparsed: [] }, amendments: [amendment('2025-11-28', '2026-01-01', false)], versionStarts: ['2022-01-01', '2026-01-01'] });
    expect(result).toMatchObject({ textStatus: 'direct', sourceValidTo: '2025-12-31' });
  });

  it('Außerkrafttretensklausel vor dem Stichtag widerlegt die Portalangabe', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, ...dated('2022-02-26'), clauses: { unparsed: [], expiry: { date: '2022-06-30', text: 'am 30. Juni 2022 außer Kraft' } }, amendments: [], versionStarts: ['2022-02-26'] });
    expect(result.baselineStatus).toBe('not-active-at-baseline');
    expect(result.findings.map((finding) => finding.code)).toEqual(['validity-expired-before-baseline']);
  });

  it('unvollständige Belege führen zu Review statt zu Annahmen', () => {
    const undated = assessLrmbValidity({ baseline: BASELINE, page: { url: 'u', sha256: 's', undated: true, hasLaterVersions: false }, clauses: { unparsed: [] }, issuedOn: '2013-02-25', amendments: [amendment('2023-01-23', '2023-02-28', true)], versionStarts: [] });
    expect(undated.baselineStatus).toBe('undetermined');
    const unknownInForce = assessLrmbValidity({ baseline: BASELINE, ...dated('2014-08-23'), clauses: { unparsed: [] }, amendments: [amendment('2018-05-07', undefined, true, { identification: { ok: false, reason: 'nicht zugeordnet' } })], versionStarts: ['2014-08-23'] });
    expect(unknownInForce.findings.map((finding) => finding.code)).toContain('reconstruction-uncertain-in-force');
    const chain = assessLrmbValidity({ baseline: BASELINE, ...dated('2014-08-23'), clauses: { unparsed: [] }, amendments: [amendment('2018-05-07', '2018-05-26', true), amendment('2023-11-06', '2023-11-17', true, { predecessor: { latest: true, date: '2020-01-01' } })], versionStarts: ['2014-08-23'] });
    expect(chain.findings.map((finding) => finding.code)).toContain('reconstruction-uncertain-chain');
  });
});

describe('Rekonstruktion mit geprüftem Rezept', () => {
  const blocks = (): NormBodyBlock[] => [
    { type: 'part', label: 'II.', children: [
      { type: 'subsection', label: '2.1', children: [{ type: 'paragraphText', text: 'Hunde sind anzuleinen. Flexileinen sind unzulässig.' }, { type: 'paragraphText', text: 'Zusatz für große Hunde.' }] },
      { type: 'subsection', label: '2.2', children: [{ type: 'paragraphText', text: 'Die Regelung wurde aufgehoben.' }] },
    ] },
  ];
  const gazetteText = '1. In Nummer 2.1 wird nach Satz 1 die Angabe „Flexileinen sind unzulässig.“ eingefügt. 2. In Nummer 2.1 wird nach Satz 2 die Angabe „Zusatz für große Hunde.“ eingefügt. 3. In Nummer 2.2 Satz 1 wird die Angabe „gestrichen“ durch die Angabe „aufgehoben“ ersetzt.';
  const steps: ReconstructionStep[] = [...gazetteText.matchAll(/In Nummer (\d+(?:\.\d+)*) (?:Satz \d+ )?wird .*?(?:eingefügt|ersetzt)\./gu)].map((match, index) => {
    const quotes = topLevelQuotes(match[0]);
    const base = { id: `s${index + 1}`, instruction: match[0], target: { scope: 'II.', label: match[1]! } };
    return match[0].endsWith('ersetzt.') ? { ...base, operation: 'revert-replacement' as const, from: quotes[0]!, to: quotes[1]! } : { ...base, operation: 'remove-inserted-text' as const, text: quotes[0]! };
  });
  const required = [amendment('2024-07-16', '2024-07-31', true)];
  const recipe = (overrides: Partial<ReconstructionRecipe> = {}): ReconstructionRecipe => ({ schemaVersion: 'recht-nrw-lrmb-reconstruction/1', sourceIdentity: 'term:1', title: 'Test', baselineDate: BASELINE, mode: 'reverse', base: { url: 'u', description: 'Basis' }, amendments: [{ decreeDate: '2024-07-16', citation: 'MBl. NRW. 2024 S. 1', gazetteUrl: 'g', steps }], review: { reviewedAt: '2026-09-15', note: 'Test' }, expected: { baseFingerprint: bodyFingerprint(blocks()), resultFingerprint: 'pending' }, ...overrides });
  const input = (text = gazetteText) => ({ blocks: blocks(), baselineDate: BASELINE, required, gazettes: new Map([['g', { url: 'g', text, sha256: 'a'.repeat(64), retrievedAt: '2026-09-15T10:00:00.000Z' }]]), baseSource: { url: 'u', sha256: 'b'.repeat(64), retrievedAt: '2026-09-15T10:00:00.000Z' } });

  it('nimmt Einfügungen und Ersetzungen deterministisch zurück und entfernt leer gewordene Absätze', () => {
    const first = applyReconstruction(recipe(), input());
    expect(first.findings.map((finding) => finding.code)).toEqual(['reconstruction-result-mismatch']);
    const verified = applyReconstruction(recipe({ expected: { baseFingerprint: bodyFingerprint(blocks()), resultFingerprint: first.resultFingerprint } }), input());
    expect(verified.ok).toBe(true);
    expect(units(verified.blocks, 'II.').get('2.1')!.children).toEqual([{ type: 'paragraphText', text: 'Hunde sind anzuleinen.' }]);
    expect(unitText(units(verified.blocks, 'II.').get('2.2'))).toBe('Die Regelung wurde gestrichen.');
    expect(verified.steps.map((step) => [step.id, step.removedBlocks ?? 0])).toEqual([['s3', 0], ['s2', 1], ['s1', 0]]);
    expect(verified.sources.map((source) => source.role)).toEqual(['base', 'amendment']);
    expect(applyReconstruction(recipe({ expected: verified.baseFingerprint ? { baseFingerprint: verified.baseFingerprint, resultFingerprint: verified.resultFingerprint } : recipe().expected }), input()).resultFingerprint).toBe(verified.resultFingerprint);
  });

  it('bricht ab, wenn Befehl, Zitat, Ziel, Basis oder Änderungsumfang nicht belegt sind', () => {
    const codes = (result: ReturnType<typeof applyReconstruction>): string[] => result.findings.map((finding) => finding.code);
    expect(codes(applyReconstruction(recipe(), input('Ein anderer Text.')))).toContain('reconstruction-instruction-not-in-source');
    const tampered = recipe({ amendments: [{ decreeDate: '2024-07-16', citation: 'MBl. NRW. 2024 S. 1', gazetteUrl: 'g', steps: [{ ...steps[0]!, text: 'Flexileinen sind verboten.' }] }] });
    expect(codes(applyReconstruction(tampered, input()))).toContain('reconstruction-quote-mismatch');
    const wrongTarget = recipe({ amendments: [{ decreeDate: '2024-07-16', citation: 'MBl. NRW. 2024 S. 1', gazetteUrl: 'g', steps: [{ ...steps[2]!, target: { scope: 'II.', label: '9.9' } }] }] });
    expect(codes(applyReconstruction(wrongTarget, input()))).toContain('reconstruction-target-not-unique');
    expect(codes(applyReconstruction(recipe({ expected: { baseFingerprint: 'c'.repeat(64), resultFingerprint: 'pending' } }), input()))).toContain('reconstruction-base-changed');
    const extra = recipe({ amendments: [...recipe().amendments, { decreeDate: '2025-01-01', citation: 'MBl. NRW. 2025 S. 9', gazetteUrl: 'g', steps: [] }] });
    expect(codes(applyReconstruction(extra, input()))).toContain('reconstruction-recipe-mismatch');
  });
});

describe('LRMB-Importpfad (Fixtures, ohne Netz)', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'landesrecht-lrmb-'));
    await mkdir(join(root, 'content', 'norms', 'west'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"tmp"}');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('importiert einen geltenden Runderlass direkt (Dry-run schreibt nichts)', async () => {
    const dry = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: fakeFetcher(), now });
    expect(dry.status).toBe('dry-run');
    expect(dry.writtenFiles).toEqual([]);
    expect(await readdir(join(root, 'content', 'norms', 'west'))).toEqual([]);

    const result = await importRechtNrwLrmbDocument({ url: DIRECT, root, fetcher: fakeFetcher(), now, write: true });
    expect(result.status).toBe('imported-with-warnings');
    expect(result.classification).toMatchObject({ sourceDocumentType: 'runderlass', normType: 'runderlass' });
    expect(result.validity).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidFrom: '2022-06-01' });
    const record = await loadNorm('west', 'runderlass-testbestimmungen-fuer-die-ordnungsbehoerden-west', root);
    const version = record.versions[0]!;
    expect(record.meta).toMatchObject({ type: 'runderlass', originEnactingBody: 'Ministerium des Innern', documentDate: '2022-03-16', sourceCitation: 'Runderlass Testbestimmungen für die Ordnungsbehörden vom 16. März 2022 (MBl. NRW. 2022 S. 229)' });
    expect(record.meta.enactingBody).toBeUndefined();
    expect(version).toMatchObject({ versionId: BASELINE, simulationValidFrom: BASELINE, sourceValidFrom: '2022-06-01', sourceStatus: { validity: 'exact', text: 'direct' } });
    expect(await readdir(join(root, 'content', 'norms', 'west', record.meta.slug, 'versions'))).toEqual([`${BASELINE}.json`]);
    const bodyJson = JSON.stringify(version.body);
    expect(bodyJson).toContain('Landes Westdeutschland');
    expect(bodyJson).not.toContain('Landes Nordrhein-Westfalen');
    expect(bodyJson).toContain('MBl. NRW. S. 863');
    expect(bodyJson).toContain('SMBl. NRW. 2051');
    expect(version.sourceNotes).toEqual([{ label: 'Erlasskopf der Quelle', text: 'Runderlass des Ministeriums des Innern - 36-54.01 - Vom 16. März 2022' }, { label: 'Fundstellenverlauf der Quelle', text: 'MBl. NRW. 2022 S. 229.' }]);
    expect(result.report!.detections.filter((entry) => entry.decision === 'protected').map((entry) => entry.term)).toEqual(expect.arrayContaining(['MBl. NRW. S. 863', 'SMBl. NRW.']));
    expect(result.report!.postTransformAudit.ok).toBe(true);

    const manifest = await readManifest(root);
    expect(manifest.entries[0]).toMatchObject({ sourceArea: 'lrmb', sourceDocumentType: 'runderlass', sourceIdentity: 'term:700001', baselineStatus: 'active-at-baseline', reconstructionStatus: 'direct', importStatus: 'imported-with-warnings', normativity: { decision: 'include' }, parserVersion: 'recht-nrw-lrmb-parser/1.0.0', transformerVersion: 'recht-nrw-transformer/2.0.0' });
    expect(manifest.entries[0]!.validityEvidence.map((entry) => entry.kind)).toEqual(expect.arrayContaining(['portal-completeness-notice', 'portal-version-interval', 'text-in-force-clause', 'portal-change-history']));
    const pdf = manifest.entries[0]!.rawDocuments.find((entry) => entry.role === 'pdf')!;
    expect(await readFile(join(root, pdf.localSource!), 'utf8')).toBe('%PDF-1.4 Testanlage');
    await readFile(join(root, manifest.entries[0]!.transformation.reportPath!), 'utf8');
    const queue = await readReviewQueue(root);
    expect(queue.items.filter((item) => item.sourceIdentity === 'term:700001').map((item) => item.category)).toEqual(expect.arrayContaining(['attachment', 'institution-mapping']));

    const db = await openSqliteD1(':memory:', { migrationsDir: join(repoRoot, 'data', 'd1') });
    executePlan(db, buildProjectionPlan([record], { jurisdiction: 'west', full: true, now: '2026-01-01T00:00:00.000Z' }));
    checkSearchIndexIntegrity(db);
    const store = createD1NormStore(db, 'west');
    const hit = await store.search(createSearchState({ q: 'Antrag innerhalb von vier Wochen', types: ['verwaltungsvorschrift'] }));
    expect(hit.hits[0]?.slug).toBe(record.meta.slug);
    expect(hit.hits[0]?.unit?.url).toBe(`${getNormUrl('west', record.meta.slug)}#unterabschnitt-1-1`);
    const gesetze = await store.search(createSearchState({ q: 'Antrag innerhalb von vier Wochen', types: ['gesetz'] }));
    expect(gesetze.hits).toEqual([]);
    const loaded = await store.getNorm(record.meta.slug, 'all');
    expect(loaded?.versions[0]!.sourceStatus).toEqual({ validity: 'exact', text: 'direct' });
    expect(loaded?.meta.sourceCitation).toBe(record.meta.sourceCitation);
    db.close();
  });

  it('übernimmt eine Richtlinie mit Außerkrafttreten vor dem Stichtag nicht und meldet den Widerspruch', async () => {
    const result = await importRechtNrwLrmbDocument({ url: EXPIRED, root, fetcher: fakeFetcher(), now, write: true });
    expect(result.status).toBe('not-at-baseline');
    expect(result.record).toBeUndefined();
    const manifest = await readManifest(root);
    expect(manifest.entries.find((entry) => entry.sourceIdentity === 'term:700003')).toMatchObject({ importStatus: 'not-at-baseline', targetSlug: '', baselineStatus: 'not-active-at-baseline', reviewStatus: 'open' });
    const queue = await readReviewQueue(root);
    expect(queue.items.find((item) => item.sourceIdentity === 'term:700003')).toMatchObject({ category: 'metadata-conflict', severity: 'blocking', status: 'open' });
  });

  it('schließt Sitzungsbekanntmachungen aus', async () => {
    const result = await importRechtNrwLrmbDocument({ url: EXCLUDED, root, fetcher: fakeFetcher(), now, write: true });
    expect(result.status).toBe('excluded');
    expect(result.normativity?.decision).toBe('exclude');
    expect((await readManifest(root)).entries.find((entry) => entry.sourceIdentity === 'term:700004')).toMatchObject({ importStatus: 'excluded', normativity: { decision: 'exclude' } });
  });

  it('rekonstruiert nur mit geprüftem Rezept und hält den Review-Fall bis dahin offen', async () => {
    const fetcher = fakeFetcher();
    const withoutRecipe = await importRechtNrwLrmbDocument({ url: RECON, root, fetcher, now, write: true });
    expect(withoutRecipe.status).toBe('needs-review');
    expect(withoutRecipe.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(['reconstruction-required', 'reconstruction-recipe-missing']));
    expect(fetcher.requested).toEqual(expect.arrayContaining([`${BASE}/mblnrw/2020-s446`, MBL2020, MBL2024]));
    expect(withoutRecipe.amendments!.map((entry) => [entry.note.decreeDate, entry.inForce, entry.identification?.ok])).toEqual([['2020-07-06', '2020-07-31', true], ['2024-07-16', '2024-07-31', true]]);
    let queue = await readReviewQueue(root);
    expect(queue.items.find((item) => item.sourceIdentity === 'term:700002' && item.category === 'reconstruction-required')?.status).toBe('open');

    const page = parseVersionPage(await fixture('page-reconstruct.html'), RECON);
    const parsed = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
    const gazette = parseGazetteEntry(await fixture('mbl-2024-s805.html'), MBL2024);
    const recipeSteps: ReconstructionStep[] = [...gazette.text.matchAll(/In Nummer (\d+(?:\.\d+)*) (?:Satz \d+ )?wird .*?(?:eingefügt|ersetzt)\./gu)].map((match, index) => {
      const quotes = topLevelQuotes(match[0]);
      const base = { id: `mbl-2024-805-${index + 1}`, instruction: match[0], target: { scope: 'II.', label: match[1]! } };
      return match[0].endsWith('ersetzt.') ? { ...base, operation: 'revert-replacement' as const, from: quotes[0]!, to: quotes[1]! } : { ...base, operation: 'remove-inserted-text' as const, text: quotes[0]! };
    });
    const recipe: ReconstructionRecipe = { schemaVersion: 'recht-nrw-lrmb-reconstruction/1', sourceIdentity: 'term:700002', title: page.title, baselineDate: BASELINE, mode: 'reverse', base: { url: RECON, description: 'Konsolidierter Testtext' }, amendments: [{ decreeDate: '2024-07-16', citation: 'MBl. NRW. 2024 S. 805', gazetteUrl: MBL2024, steps: recipeSteps }], review: { reviewedAt: '2026-09-15', note: 'Testrezept' }, expected: { baseFingerprint: bodyFingerprint(parsed.blocks), resultFingerprint: 'pending' } };
    const probe = applyReconstruction(recipe, { blocks: parsed.blocks, baselineDate: BASELINE, required: withoutRecipe.validity!.postBaselineAmendments, gazettes: new Map([[MBL2024, { url: MBL2024, text: gazette.text, sha256: 'x', retrievedAt: 'x' }]]), baseSource: { url: RECON, sha256: 'x', retrievedAt: 'x' } });
    recipe.expected.resultFingerprint = probe.resultFingerprint;
    await mkdir(join(root, 'data', 'imports', 'recht-nrw', 'reconstructions'), { recursive: true });
    await writeFile(join(root, 'data', 'imports', 'recht-nrw', 'reconstructions', 'term-700002.json'), JSON.stringify(recipe));

    const reconstructed = await importRechtNrwLrmbDocument({ url: RECON, root, fetcher: fakeFetcher(), now, write: true });
    expect(reconstructed.status).toBe('imported-with-warnings');
    expect(reconstructed.findings.map((finding) => finding.code)).toContain('reconstruction-applied');
    const record = await loadNorm('west', reconstructed.record!.meta.slug, root);
    expect(record.meta.slug).toBe('vv-testhg-west');
    const version = record.versions[0]!;
    expect(version).toMatchObject({ sourceValidFrom: '2020-07-31', sourceValidTo: '2024-07-30', sourceStatus: { validity: 'reconstructed', text: 'reconstructed' } });
    expect(version.sourceCitation).toBe('Verwaltungsvorschriften zum Testhundegesetz vom 2. Mai 2003 (MBl. NRW. 2003 S. 580), zuletzt geändert durch Runderlass vom 6. Juli 2020 (MBl. NRW. 2020 S. 446)');
    const second = units(version.body, 'II.');
    expect(unitText(second.get('2.1'))).toBe('Hunde sind anzuleinen. | Ein eigener Absatz gilt fort.');
    expect(unitText(second.get('2.2'))).toBe('Die Regelung wurde gestrichen, da sie nicht mehr benötigt wird.');
    expect(unitText(second.get('1.1'))).toContain('neuen Zweck');
    expect(record.meta.originEnactingBody).toBe('Ministerium für Umwelt und Naturschutz, Landwirtschaft und Verbraucherschutz');
    const manifest = await readManifest(root);
    const entry = manifest.entries.find((candidate) => candidate.sourceIdentity === 'term:700002')!;
    expect(entry).toMatchObject({ reconstructionStatus: 'reconstructed', baselineStatus: 'active-at-baseline' });
    expect(entry.reconstructionSources.map((source) => source.role)).toEqual(['base', 'amendment']);
    expect(entry.reconstructionSteps).toHaveLength(3);
    for (const source of entry.reconstructionSources) await readFile(join(root, source.localSource!));
    queue = await readReviewQueue(root);
    const reconstructionCase = queue.items.find((item) => item.sourceIdentity === 'term:700002' && item.category === 'reconstruction-required')!;
    expect(reconstructionCase).toMatchObject({ status: 'open', occurrence: 'not-reproduced' });
  });

  it('lehnt Adressen außerhalb von LRMB ab', async () => {
    const outside = await importRechtNrwLrmbDocument({ url: `${BASE}/lrgv/gesetz/01012020-testgesetz`, root, fetcher: fakeFetcher(), now });
    expect(outside.findings[0]?.code).toBe('not-lrmb');
    expect(decodeHtml).toBeTypeOf('function');
  });
});
