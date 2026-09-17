/**
 * Evidence Pass (LRMB-Parser 1.3.0): Beweisklassen und Entscheidungsregeln der Geltungsentscheidung mit echten
 * Textausschnitten je Regel (P1 eigene Außerkrafttretensformel, P2 Nachfolgebeleg, P3 Kontinuität, P4 Stammfundstelle)
 * und je Ablehnungsgrund (fehlender Beleg, Widerspruch, unzureichende Zuordnung), Belegschema, Nachfolgebeleg-Index,
 * Rekonstruktionsqueue-Gruppen, Teilreports und Offline-Simulation – alles netzfrei und deterministisch.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { FetchedDocument } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { emptyManifest, validateValidityEvidence, type ImportManifest, type ManifestEntry, type SuccessorEvidenceRecord, type ValidityEvidence } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { analyzeReviewQueue, splitReviewAnalysis } from '@landesrecht/importer-recht-nrw/common/review-analysis.ts';
import { emptyReviewQueue, reviewItemId, type ReviewItem } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import type { OfflineSourceReader } from '@landesrecht/importer-recht-nrw/common/review-sources.ts';
import { selectSourceVersionAtBaseline } from '@landesrecht/importer-recht-nrw/common/version-selection.ts';
import { generalizeReason, renderEvidencePassMarkdown, runEvidencePass } from '@landesrecht/importer-recht-nrw/lrmb/evidence-pass.ts';
import { LRMB_PARSER_VERSION } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { resolveBasePublication, successorTargetFor, GazetteUnavailableError } from '@landesrecht/importer-recht-nrw/lrmb/pipeline.ts';
import { buildReconstructionQueue, reconstructionGroupFor } from '@landesrecht/importer-recht-nrw/lrmb/reconstruction-queue.ts';
import { detectRepealStatements, otherStatements } from '@landesrecht/importer-recht-nrw/lrmb/repeal-patterns.ts';
import { buildSuccessorIndex, loadSuccessorIndex, matchSuccessors, resolveSuccessorEffective, successorStrength, type CitingSource, type SuccessorIndex, type SuccessorMatch } from '@landesrecht/importer-recht-nrw/lrmb/successor-index.ts';
import { parseValidityClauses, type ChangeNoteAmendment } from '@landesrecht/importer-recht-nrw/lrmb/text-metadata.ts';
import { assessLrmbValidity, isContraryNotice, type AmendmentEvidence, type LrmbValidityInput } from '@landesrecht/importer-recht-nrw/lrmb/validity.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-recht-nrw/transform/rules.ts';

const BASELINE = '2023-12-01';
const NOW = '2026-09-17T08:00:00.000Z';
const BASE = 'https://recht.nrw.de';
const VV = `${BASE}/lrmb/verwaltungsvorschrift`;
const SHA = (value: string): string => createHash('sha256').update(value).digest('hex');
const fixtures = join(process.cwd(), 'tests', 'fixtures', 'recht-nrw', 'lrmb');

// --- Echte Textausschnitte des Bestands (Cache-Scan September 2026) ---------------------------------------------
const HAUSHALTSJAHR = 'Diese Verwaltungsvorschriften treten am 1. Januar 2014 in Kraft. Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.';
const GILT_BIS = 'Diese Verwaltungsvorschrift gilt bis zum 31. Dezember 2005.';
const GELTEN_BIS = 'Die Richtlinien treten mit Wirkung vom 1.1.2008 in Kraft und gelten bis zum 30.9.2012. Gleichzeitig treten die Richtlinien vom 21.8.2006 (MBl. NRW. S. 443) außer Kraft.';
const BEFRISTET = 'Dieser RdErl. tritt am Tag nach der Veröffentlichung in Kraft und ist befristet bis zum 31.7.2010.';
const REPEAL_SMBL = 'Meine Runderlasse zu § 67 BBesG vom 12.11.1975 (SMBl. NRW. 20322) und zu § 68 a BBesG vom 30.6.1978 (MBl. NRW. S. 1105/SMBl. NRW. 20320) werden aufgehoben.';
const REPEAL_SIMULTANEOUS = 'Dieser Runderlass tritt am Tag nach der Veröffentlichung im Ministerialblatt für das Land Nordrhein-Westfalen in Kraft. Der gemeinsame Runderlass des Ministeriums für Bauen, Wohnen, Stadtentwicklung und Verkehr und des Finanzministeriums vom 27. Juni 2016 ( MBl. NRW. 2016 S. 644 ) tritt gleichzeitig außer Kraft.';
const REPEAL_DATED = 'Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ), der durch Runderlass vom 2. Januar 1997 (MBl. NRW. S. 121) geändert worden ist, tritt mit Ablauf des 31. Dezember 2024 außer Kraft.';
const REPEAL_DATE_ONLY = 'Der Runderlass vom 15.3.1962 wird aufgehoben.';

const undatedPage = { url: `${VV}/richtlinien-test`, sha256: SHA('seite'), undated: true, hasLaterVersions: false };
const dated = (validFrom: string, validTo?: string): Pick<LrmbValidityInput, 'page' | 'selection'> => {
  const selection = selectSourceVersionAtBaseline([{ validFrom, validTo: validTo ?? null, available: true, url: 'u' }], BASELINE);
  return { page: { url: 'u', sha256: SHA('dated'), validFrom, ...(validTo ? { validTo } : {}), undated: false, hasLaterVersions: false }, selection };
};

function amendment(decreeDate: string, inForce: string | undefined, incorporated: boolean, extra: Partial<AmendmentEvidence> = {}): AmendmentEvidence {
  const note: ChangeNoteAmendment = { raw: '', decreeDateText: decreeDate, decreeDate, decreeDateIncomplete: false, unpublished: false, citation: { gazette: 'MBl. NRW.', year: Number(decreeDate.slice(0, 4)), page: '1', text: `MBl. NRW. ${decreeDate.slice(0, 4)} S. 1` } };
  const evidence: AmendmentEvidence = { note, incorporated, inForceDerivation: 'Test', identification: { ok: true, reason: 'Eintrag nennt die Vorschrift' }, gazetteUrl: `${BASE}/mblnrw/${decreeDate}`, gazetteSha256: SHA(decreeDate), gazetteText: 'Der Runderlass vom 3. Januar 1994 (MBl. NRW. S. 1098) wird wie folgt geändert: 1. In Nummer 1 wird die Angabe „a“ durch die Angabe „b“ ersetzt.', ...extra };
  if (inForce) evidence.inForce = inForce;
  return evidence;
}

/** Nachfolgebeleg-Index mit einer zitierenden Quelle je Aussage. */
function indexOf(entries: Array<{ text: string; source: Partial<CitingSource> & { url: string } }>): SuccessorIndex {
  const index: SuccessorIndex = { schemaVersion: 'recht-nrw-lrmb-successor-index/1', generatedAt: NOW, scanned: { lrmbPages: entries.length, gazetteEntries: 0, statementsOther: 0, statementsSelf: 0 }, sources: [], statements: [], pages: [] };
  for (const entry of entries) {
    const source: CitingSource = { kind: 'lrmb-page', sha256: SHA(entry.text), title: `Nachfolger ${entry.source.url.slice(-12)}`, ...entry.source };
    const position = index.sources.push(source) - 1;
    for (const statement of otherStatements(detectRepealStatements(entry.text))) index.statements.push({ source: position, statement });
    index.scanned.statementsOther += 1;
  }
  return index;
}

const TARGET_1994 = { identity: 'term:1', url: undatedPage.url, issuedOn: '1994-01-03', gazettePage: '1098', gazetteYear: 1994, title: 'Richtlinien Test' };

describe('Belegschema (common/manifest.ts, additiv)', () => {
  const successor: SuccessorEvidenceRecord = { predecessorIdentity: 'Der Runderlass vom 1994-01-03 (MBl. NRW. S. 1098)', successorTitle: 'Nachfolger', statementKind: 'expired', effectiveDate: '2024-12-31', effectiveDerivation: 'Zeitpunkt in der Formel', citation: 'MBl. NRW. S. 1098', matched: ['date', 'gazette-page'], sourceUrl: `${VV}/x`, sha256: SHA('x'), evidenceStrength: 'strong' };

  it('akzeptiert die vier Beweisklassen und die neuen Felder, lehnt unvollständige Nachfolgebelege ab', () => {
    const valid: ValidityEvidence = { kind: 'successor-repeal', supports: 'contradiction', strength: 'strong', statement: 'x', date: '2024-12-31', citation: 'MBl. NRW. S. 1098', excerpt: 'Der Runderlass … tritt außer Kraft.', sourceUrl: `${VV}/x`, sha256: SHA('x'), successor };
    expect(validateValidityEvidence(valid)).toEqual([]);
    expect(validateValidityEvidence({ ...valid, strength: 'contradictory' })).toEqual([]);
    expect(validateValidityEvidence({ ...valid, kind: 'gazette-publication', successor: undefined })).toEqual([]);
    expect(validateValidityEvidence({ ...valid, successor: undefined })).toEqual(['successor-repeal ohne strukturierten Nachfolgebeleg']);
    expect(validateValidityEvidence({ ...valid, successor: { ...successor, effectiveDate: undefined } })).toEqual(['starker Nachfolgebeleg ohne Wirksamkeitsdatum']);
    expect(validateValidityEvidence({ ...valid, successor: { ...successor, sha256: 'kurz', evidenceStrength: 'stark' } })).toEqual(['successor.sha256 ungültig', 'successor.evidenceStrength unbekannt (stark)']);
    expect(validateValidityEvidence({ kind: 'unbekannt', supports: 'x', strength: 'y', statement: '', date: '2024' })).toEqual(['unbekannte Belegart unbekannt', 'unbekannte Aussage x', 'unbekannte Beweisklasse y', 'statement fehlt', 'date ist kein ISO-Datum']);
    expect(validateValidityEvidence('nein')).toEqual(['Beleg ist kein Objekt']);
  });
});

describe('P1: eigene Außerkrafttretensformeln (text-metadata.ts, fail-closed)', () => {
  it('liest Haushaltsjahr, „gilt bis“, „gelten bis“ und „befristet bis“ nur mit strenger Selbstbezeichnung', () => {
    expect(parseValidityClauses([HAUSHALTSJAHR])).toMatchObject({ inForce: { kind: 'date', date: '2014-01-01' }, expiry: { date: '2016-12-31', via: 'repeal-pattern', phrase: 'mit Ablauf des Haushaltsjahres 2016' }, unparsed: [] });
    expect(parseValidityClauses([GILT_BIS]).expiry).toMatchObject({ date: '2005-12-31', via: 'repeal-pattern', phrase: 'bis zum 31. Dezember 2005' });
    const gelten = parseValidityClauses([GELTEN_BIS]);
    expect(gelten.expiry).toMatchObject({ date: '2012-09-30', via: 'repeal-pattern' });
    expect(gelten.inForce).toMatchObject({ kind: 'retroactive-date', date: '2008-01-01' });
    expect(parseValidityClauses([BEFRISTET])).toMatchObject({ inForce: { kind: 'day-after-publication' }, expiry: { date: '2010-07-31', via: 'repeal-pattern' } });
    expect(parseValidityClauses(['Dieser Runderlass tritt am 1. August 2022 in Kraft und mit Ablauf des 31. Dezember 2027 außer Kraft.']).expiry).toMatchObject({ date: '2027-12-31', via: 'clause' });
  });

  it('lehnt Pronomen ohne eigene Inkrafttretensformel, Genitivzusätze und Teilregelungen ab (kein Beleg, nur unparsed)', () => {
    const pronoun = parseValidityClauses(['Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.']);
    expect(pronoun.expiry).toBeUndefined();
    expect(pronoun.unparsed).toEqual(['Sie treten mit Ablauf des Haushaltsjahres 2016 außer Kraft.']);
    expect(parseValidityClauses(['Die Zuwendungsbescheide sind befristet. Sie gelten bis zum 31.12.2010.']).expiry).toBeUndefined();
    expect(parseValidityClauses(['Die Regelungen der Nummer 3 gelten bis zum 31.12.2010.']).expiry).toBeUndefined();
    expect(parseValidityClauses(['Die Regelungen gelten bis zum 31.12.2010.']).expiry).toBeUndefined();
    expect(parseValidityClauses(['Diese Regelungen gelten bis zum 31.12.2010.']).expiry).toMatchObject({ date: '2010-12-31' });
    expect(parseValidityClauses(['Dieser Runderlass tritt am 1. Juni 2022 in Kraft. Gleichzeitig tritt der Runderlass vom 9. November 2007 (MBl. NRW. S. 863) am 31. Mai 2022 außer Kraft.']).expiry).toBeUndefined();
  });

  it('meldet mehrere eigene Formeln mit verschiedenen Daten als Konflikt statt eine zu wählen', () => {
    const conflict = parseValidityClauses(['Dieser Runderlass tritt am 1.1.2010 in Kraft und mit Ablauf des 31.12.2015 außer Kraft. Diese Richtlinien gelten bis zum 31.12.2020.']);
    expect(conflict.expiry).toBeUndefined();
    expect(conflict.expiryConflicts?.map((clause) => clause.date)).toEqual(['2015-12-31', '2020-12-31']);
    const same = parseValidityClauses(['Dieser Runderlass tritt mit Ablauf des 31.12.2015 außer Kraft. Diese Richtlinien gelten bis zum 31.12.2015.']);
    expect(same.expiry?.date).toBe('2015-12-31');
    expect(same.expiryConflicts).toBeUndefined();
  });

  it('Regel A: eigene Formel vor dem Stichtag → not-active-at-baseline mit starkem Beleg und Textausschnitt', () => {
    const result = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses([GILT_BIS]), issuedOn: '2000-06-12', amendments: [], versionStarts: [] });
    expect(result).toMatchObject({ baselineStatus: 'not-active-at-baseline', decisionRule: 'P1-self-expiry', textStatus: 'not-applicable' });
    expect(result.findings.map((finding) => finding.code)).toEqual(['validity-expired-before-baseline']);
    const evidence = result.evidence.find((entry) => entry.kind === 'text-expiry-clause')!;
    expect(evidence).toMatchObject({ supports: 'contradiction', strength: 'strong', date: '2005-12-31', excerpt: GILT_BIS, sourceUrl: undatedPage.url });
    expect(result.evidence.every((entry) => validateValidityEvidence(entry).length === 0)).toBe(true);
  });

  it('Ablehnung: spätere Änderung, späteres Inkrafttreten oder späteres Ausfertigungsdatum widersprechen dem Ende → contradictory (Review)', () => {
    const laterAmendment = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses([GILT_BIS]), issuedOn: '2000-06-12', amendments: [amendment('2010-05-01', '2010-06-01', true)], versionStarts: [] });
    expect(laterAmendment).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'contradictory' });
    expect(laterAmendment.findings.map((finding) => finding.code)).toEqual(['validity-expiry-contradicted']);
    expect(laterAmendment.evidence.find((entry) => entry.kind === 'text-expiry-clause')).toMatchObject({ strength: 'contradictory' });
    const unidentifiedLater = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses([GILT_BIS]), issuedOn: '2000-06-12', amendments: [amendment('2010-05-01', undefined, true, { identification: { ok: false, reason: '404' }, gazetteUrl: undefined })], versionStarts: [] });
    expect(unidentifiedLater.findings[0]?.message).toContain('Fundstellenverlauf nennt eine Änderung vom 2010-05-01 nach dem Ende');
    const laterIssue = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [], expiry: { date: '1967-05-15', text: 'x', via: 'clause' } }, issuedOn: '1983-09-10', amendments: [], versionStarts: [] });
    expect(laterIssue.findings[0]?.message).toContain('Ausfertigungsdatum 1983-09-10 liegt nach dem Ende');
    const ambiguous = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1.1.2010 in Kraft und mit Ablauf des 31.12.2015 außer Kraft. Diese Richtlinien gelten bis zum 31.12.2020.']), amendments: [], versionStarts: [] });
    expect(ambiguous).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'contradictory' });
    expect(ambiguous.findings.map((finding) => finding.code)).toEqual(['validity-expiry-ambiguous']);
    expect(ambiguous.evidence.filter((entry) => entry.strength === 'contradictory')).toHaveLength(2);
  });
});

describe('P2: Nachfolgebelege (successor-index.ts, validity.ts)', () => {
  it('leitet die Wirksamkeit nur aus Formel, Klausel, Veröffentlichung oder Portalintervall ab – sonst kein Datum', () => {
    const [dated94] = otherStatements(detectRepealStatements(REPEAL_DATED));
    expect(resolveSuccessorEffective(dated94!, { kind: 'lrmb-page' })).toEqual({ date: '2024-12-31', derivation: 'Zeitpunkt in der Formel („mit Ablauf des 31. Dezember 2024“)', strong: true });
    const [simultaneous] = otherStatements(detectRepealStatements(REPEAL_SIMULTANEOUS));
    expect(resolveSuccessorEffective(simultaneous!, { kind: 'gazette-entry', inForce: { kind: 'day-after-publication', text: 'x' }, publishedOn: '2019-05-06' })).toMatchObject({ date: '2019-05-07', strong: true });
    expect(resolveSuccessorEffective(simultaneous!, { kind: 'lrmb-page', inForce: { kind: 'date', date: '2019-06-01', text: 'x' } })).toMatchObject({ date: '2019-06-01', strong: true });
    expect(resolveSuccessorEffective(simultaneous!, { kind: 'lrmb-page', validFrom: '2019-06-13' })).toMatchObject({ date: '2019-06-13', strong: true });
    expect(resolveSuccessorEffective(simultaneous!, { kind: 'gazette-entry', publishedOn: '2019-05-06' })).toMatchObject({ date: '2019-05-06', strong: false });
    const [smbl] = otherStatements(detectRepealStatements(REPEAL_SMBL));
    expect(resolveSuccessorEffective(smbl!, { kind: 'lrmb-page' })).toEqual({ derivation: 'ohne Zeitangabe: Inkrafttreten der aufhebenden Vorschrift nicht belegt', strong: false });
    expect(successorStrength('strong', 'repealed', { strong: true, date: '2004-03-01', derivation: '' })).toBe('strong');
    expect(successorStrength('strong', 'repealed', { strong: false, derivation: '' })).toBe('supporting');
    expect(successorStrength('strong', 'new-version', { strong: true, date: '2004-03-01', derivation: '' })).toBe('supporting');
    expect(successorStrength('weak', 'repealed', { strong: true, date: '2004-03-01', derivation: '' })).toBe('insufficient');
  });

  it('ordnet nur mit Datum und Fundstelle stark zu, schließt Selbstzitate aus und liefert strukturierte Belege', () => {
    const index = indexOf([
      { text: REPEAL_DATED, source: { url: `${VV}/nachfolger-2023`, identity: 'term:2', inForce: { kind: 'date', date: '2023-12-20', text: 'x' } } },
      { text: REPEAL_DATE_ONLY, source: { url: `${VV}/anderer` } },
      { text: REPEAL_DATED, source: { url: undatedPage.url, identity: 'term:1' } },
    ]);
    const matches = matchSuccessors(index, TARGET_1994);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ level: 'strong', matched: ['date', 'gazette-page'], strength: 'strong', effective: { date: '2024-12-31' } });
    expect(matches[0]!.record).toMatchObject({ predecessorIdentity: 'Der Runderlass vom 1994-01-03 (MBl. NRW. S. 1098)', successorIdentity: 'term:2', statementKind: 'expired', effectiveDate: '2024-12-31', citation: 'MBl. NRW. S. 1098', evidenceStrength: 'strong' });
    expect(validateValidityEvidence({ kind: 'successor-repeal', supports: 'continuity', strength: 'strong', statement: 'x', successor: matches[0]!.record })).toEqual([]);
    expect(matchSuccessors(index, { ...TARGET_1994, issuedOn: '1962-03-15', gazettePage: undefined })).toMatchObject([{ level: 'weak', strength: 'insufficient' }]);
    expect(matchSuccessors(index, { identity: 'term:9', title: 'ohne Datum' })).toEqual([]);
    // Seitenkollision: eine andere Seite des Bestands trägt dasselbe Datum und dieselbe Stammfundstelle → nur supporting.
    const collision = { ...index, pages: [{ identity: 'term:1', url: undatedPage.url, issuedOn: '1994-01-03', gazettePage: '1098', gazetteYear: 1994 }, { identity: 'term:77', url: `${VV}/x-77`, issuedOn: '1994-01-03', gazettePage: '1098', gazetteYear: 1994 }] };
    expect(matchSuccessors(collision, TARGET_1994)[0]).toMatchObject({ level: 'strong', strength: 'supporting', ambiguousWith: ['term:77'], record: { evidenceStrength: 'supporting', effectiveDerivation: expect.stringContaining('Vorgängeridentität nicht eindeutig (auch term:77') } });
    expect(matchSuccessors(collision, { ...TARGET_1994, smblNumber: '20322' })[0]!.strength).toBe('supporting');
  });

  it('Regel A: starke Aufhebung vor dem Stichtag → not-active-at-baseline; unzureichende und unterstützende Belege entscheiden nie', () => {
    const before = indexOf([{ text: 'Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ) wird aufgehoben.', source: { url: `${VV}/nachfolger-2010`, identity: 'term:3', validFrom: '2010-08-14' } }]);
    const strong = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(before, TARGET_1994) });
    expect(strong).toMatchObject({ baselineStatus: 'not-active-at-baseline', decisionRule: 'P2-successor-repeal' });
    expect(strong.findings.map((finding) => finding.code)).toEqual(['validity-repealed-before-baseline']);
    expect(strong.evidence.find((entry) => entry.kind === 'successor-repeal')).toMatchObject({ supports: 'contradiction', strength: 'strong', date: '2010-08-14', citation: 'MBl. NRW. S. 1098', successor: { evidenceStrength: 'strong', successorIdentity: 'term:3' } });
    const undatedSuccessor = indexOf([{ text: 'Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ) wird aufgehoben.', source: { url: `${VV}/nachfolger-ohne-datum`, issuedOn: '2010-08-14' } }]);
    const supporting = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(undatedSuccessor, TARGET_1994) });
    expect(supporting).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'insufficient' });
    expect(supporting.evidence.find((entry) => entry.kind === 'successor-repeal')).toMatchObject({ strength: 'supporting', supports: 'continuity' });
    const dateOnly = indexOf([{ text: 'Der Runderlass vom 3.1.1994 wird aufgehoben.', source: { url: `${VV}/nur-datum`, validFrom: '2010-08-14' } }]);
    const insufficient = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(dateOnly, TARGET_1994) });
    expect(insufficient.baselineStatus).toBe('undetermined');
    expect(insufficient.evidence.some((entry) => entry.kind === 'successor-repeal')).toBe(false);
  });

  it('Regel B: starke Aufhebung nach dem Stichtag belegt den Fortbestand – nur mit belegtem Beginn und ohne Gegenhinweis', () => {
    const after = indexOf([{ text: REPEAL_DATED, source: { url: `${VV}/nachfolger-2024`, identity: 'term:2' } }]);
    const successors = matchSuccessors(after, TARGET_1994);
    const withStart = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors });
    expect(withStart).toMatchObject({ baselineStatus: 'active-at-baseline', decisionRule: 'P2-successor-continuity', textStatus: 'direct', provenance: 'verified-active-at-baseline', sourceValidFrom: '1994-02-01', sourceValidTo: '2024-12-30' });
    expect(withStart.evidence.filter((entry) => entry.kind === 'successor-repeal').map((entry) => [entry.supports, entry.strength])).toEqual([['continuity', 'strong'], ['active-at-baseline', 'strong']]);
    const withoutStart = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors });
    expect(withoutStart).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'insufficient' });
    expect(withoutStart.findings[0]?.message).toContain('kein belegter Beginn vor dem Stichtag');
    const contrary = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors, contraryTexts: ['Aufgehoben durch Runderlass vom 2. März 2015'] });
    expect(contrary).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'contradictory' });
    expect(contrary.findings.map((finding) => finding.code)).toEqual(['validity-successor-contradicted']);
    const laterNotice = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors, contraryTexts: ['Veröffentlichung: MB.NRW 2024 Nr. 94 Aufgehoben durch Runderlass vom 20. Dezember 2024, in Kraft getreten am 1. Januar 2025.'] });
    expect(laterNotice.baselineStatus).toBe('active-at-baseline');
    // Spätestes Datum des Vermerks zählt (Erlassdatum vor dem Inkrafttreten der Aufhebung); undatierte Vermerke bleiben Gegenhinweis.
    expect(isContraryNotice('Aufgehoben durch Runderlass vom 20. Dezember 2024, in Kraft getreten am 1. Januar 2025.', '2024-12-31')).toBe(false);
    expect(isContraryNotice('Aufgehoben durch Runderlass vom 20. Dezember 2024', '2024-12-31')).toBe(true);
    expect(isContraryNotice('Aufgehoben durch Runderlass vom 2.3.2015', BASELINE)).toBe(true);
    expect(isContraryNotice('Aufgehoben', BASELINE)).toBe(true);
    expect(isContraryNotice('Redaktioneller Hinweis', BASELINE)).toBe(false);
  });

  it('Ablehnung: Aufhebung gegen Portalintervall, gegen spätere Änderung oder gegen eigene Formel nach dem Stichtag → contradictory', () => {
    const before = indexOf([{ text: 'Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ) wird aufgehoben.', source: { url: `${VV}/nachfolger-2010`, validFrom: '2010-08-14' } }]);
    const successors = matchSuccessors(before, TARGET_1994);
    const portal = assessLrmbValidity({ baseline: BASELINE, ...dated('2014-06-13'), clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: ['2014-06-13'], successors });
    expect(portal).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'contradictory' });
    expect(portal.findings[0]?.message).toContain('Portalintervall der gewählten Fassung deckt den Stichtag');
    const amended = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [amendment('2021-04-20', '2021-05-01', true)], versionStarts: [], successors });
    expect(amended.findings[0]?.message).toContain('ändert die Vorschrift nach dem Ende');
    const after = indexOf([{ text: REPEAL_DATED, source: { url: `${VV}/nachfolger-2024` } }]);
    const expiredEarlier = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses([GILT_BIS]), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(after, TARGET_1994) });
    expect(expiredEarlier).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'contradictory' });
    expect(expiredEarlier.findings[0]?.message).toContain('nennt ein Ende erst am 2024-12-31');
    // Eigene Formel „mit Ablauf des 31.12.“ und Nachfolger „ab 1.1.“ meinen dasselbe Ende (ein Tag Toleranz).
    const sameEnd = indexOf([{ text: 'Der Runderlass des Ministeriums für Umwelt, Raumordnung und Landwirtschaft vom 3. Januar 1994 ( MBl. NRW. S. 1098 ) tritt gleichzeitig außer Kraft.', source: { url: `${VV}/nachfolger-2006`, inForce: { kind: 'date', date: '2006-01-01', text: 'x' } } }]);
    const consistent = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses([GILT_BIS]), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(sameEnd, TARGET_1994) });
    expect(consistent).toMatchObject({ baselineStatus: 'not-active-at-baseline', decisionRule: 'P1-self-expiry' });
    // Eigene Änderungen und Fassungswechsel derselben Stammnorm sind keine Nachfolger.
    const own = matchSuccessors(before, TARGET_1994).map((match): SuccessorMatch => ({ ...match, source: { ...match.source, url: `${BASE}/mblnrw/2010-05-01` } }));
    const ownAmendment = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [amendment('2010-05-01', '2010-08-14', true)], versionStarts: [], successors: own });
    expect(ownAmendment.evidence.some((entry) => entry.kind === 'successor-repeal')).toBe(false);
    const versionStart = assessLrmbValidity({ baseline: BASELINE, ...dated('2010-08-14'), clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: ['2010-08-14'], successors });
    expect(versionStart).toMatchObject({ baselineStatus: 'active-at-baseline', decisionRule: 'portal-interval' });
  });
});

describe('P3/P4: Kontinuität über das Ministerialblatt und Stammfundstelle', () => {
  it('P3: Fünf-Bedingungen-Kontinuität → verified-active-at-baseline; Textstand nach dem Stichtag → reconstruction-required', () => {
    const direct = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', changeNote: { raw: 'MBl. NRW. 1994 S. 1098, geändert durch Runderlass vom 16. Juli 2024 (MBl. NRW. 2024 S. 805).', base: { gazette: 'MBl. NRW.', year: 1994, page: '1098', text: 'MBl. NRW. 1994 S. 1098' }, amendments: [], complete: true }, amendments: [amendment('2024-07-16', '2024-07-31', false)], versionStarts: [] });
    expect(direct).toMatchObject({ baselineStatus: 'active-at-baseline', decisionRule: 'P3-amendment-continuity', textStatus: 'direct', provenance: 'verified-active-at-baseline', sourceValidFrom: '1994-02-01', sourceValidTo: '2024-07-30' });
    expect(direct.continuity?.checks.map((check) => [check.id, check.ok])).toEqual([['same-stem', true], ['explicit-amendment', true], ['unbroken-chain', true], ['consistent-identity', true], ['no-contrary-evidence', true]]);
    const reconstruction = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', changeNote: { raw: 'x', base: { gazette: 'MBl. NRW.', year: 1994, page: '1098', text: 'MBl. NRW. 1994 S. 1098' }, amendments: [], complete: true }, amendments: [amendment('2024-07-16', '2024-07-31', true)], versionStarts: [] });
    expect(reconstruction).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', provenance: 'reconstructed' });
    expect(reconstruction.findings.map((finding) => finding.code)).toEqual(['reconstruction-required']);
    const failed = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am 1. Februar 1994 in Kraft.']), issuedOn: '1994-01-03', amendments: [amendment('2024-07-16', '2024-07-31', false, { gazetteText: 'Der Runderlass vom 3. Januar 1994 (MBl. NRW. S. 1098) tritt außer Kraft.' })], versionStarts: [] });
    expect(failed).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'insufficient' });
    expect(failed.findings[0]?.message).toContain('spätere Änderung ohne Kontinuitätsbeleg (explicit-amendment, consistent-identity)');
  });

  it('P4: Veröffentlichung der Stammfassung ist nur mit Klausel „am Tag nach der Veröffentlichung“ ein starker Beginn, sonst unterstützend', () => {
    const publication = { citation: 'MBl. NRW. 1994 S. 1098', identified: true, reason: 'Eintrag trägt den Erlasskopf vom 1994-01-03', publishedOn: '1994-02-10', url: `${BASE}/mblnrw/1994-s1098`, sha256: SHA('mbl') };
    const after = indexOf([{ text: REPEAL_DATED, source: { url: `${VV}/nachfolger-2024` } }]);
    const derived = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: parseValidityClauses(['Dieser Runderlass tritt am Tag nach der Veröffentlichung in Kraft.']), issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(after, TARGET_1994), basePublication: publication });
    expect(derived).toMatchObject({ baselineStatus: 'active-at-baseline', decisionRule: 'P2-successor-continuity', sourceValidFrom: '1994-02-11', start: { date: '1994-02-11', strength: 'strong' } });
    expect(derived.evidence.find((entry) => entry.kind === 'gazette-publication')).toMatchObject({ supports: 'valid-from', strength: 'strong', date: '1994-02-11', citation: 'MBl. NRW. 1994 S. 1098' });
    const supportingOnly = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], successors: matchSuccessors(after, TARGET_1994), basePublication: publication });
    expect(supportingOnly).toMatchObject({ baselineStatus: 'undetermined', decisionRule: 'insufficient' });
    expect(supportingOnly.evidence.find((entry) => entry.kind === 'gazette-publication')).toMatchObject({ strength: 'supporting', date: '1994-02-10' });
    expect(supportingOnly.findings[0]?.message).toContain('kein belegter Beginn vor dem Stichtag');
    const citationOnly = assessLrmbValidity({ baseline: BASELINE, page: undatedPage, clauses: { unparsed: [] }, issuedOn: '1994-01-03', amendments: [], versionStarts: [], basePublication: { citation: 'MBl. NRW. 1994 S. 1098', identified: false, reason: 'nicht abgerufen' } });
    expect(citationOnly.evidence.find((entry) => entry.kind === 'gazette-publication')).toMatchObject({ strength: 'supporting', statement: expect.stringContaining('kein Inkrafttretensbeleg') });
  });

  it('P4-Zuordnung des Ministerialblatt-Eintrags nur über das Ausfertigungsdatum des Erlasskopfs, nie über den Titel', async () => {
    const html = await readFile(join(fixtures, 'mbl-2024-s805.html'), 'utf8');
    const fetch = async (url: string): Promise<FetchedDocument | undefined> => {
      if (url.endsWith('-0')) throw new GazetteUnavailableError('HTTP 404');
      const bytes = new TextEncoder().encode(html);
      return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW, sha256: SHA(html), bytes, fromCache: true };
    };
    const citation = { gazette: 'MBl. NRW.' as const, year: 2024, page: '805', text: 'MBl. NRW. 2024 S. 805' };
    const identified = await resolveBasePublication({ citation, issuedOn: '2024-07-16', fetch });
    expect(identified.evidence).toMatchObject({ identified: true, publishedOn: '2024-07-30', url: `${BASE}/mblnrw/2024-s805`, sha256: SHA(html) });
    const mismatch = await resolveBasePublication({ citation, issuedOn: '2003-05-02', fetch });
    expect(mismatch.evidence.identified).toBe(false);
    expect(mismatch.evidence.reason).toContain('Erlasskopf nennt 2024-07-16, erwartet 2003-05-02');
    expect((await resolveBasePublication({ citation, issuedOn: '2024-07-16' })).evidence).toMatchObject({ identified: false, reason: expect.stringContaining('nicht abgerufen') });
    expect((await resolveBasePublication({ citation, fetch })).evidence.reason).toContain('Ausfertigungsdatum unbekannt');
    expect(successorTargetFor({ termId: '7', pageUrl: 'u', title: 't', issuedOn: '2003-05-02', baseCitation: { gazette: 'MBl. NRW.', year: 2003, page: '580', text: 'x' }, fileReference: 'VI-7', smblNumber: '2060' })).toEqual({ identity: 'term:7', url: 'u', title: 't', issuedOn: '2003-05-02', smblNumber: '2060', gazettePage: '580', gazetteYear: 2003, fileReference: 'VI-7' });
  });
});

// --- Index, Queue, Teilreports, Simulation -------------------------------------------------------------------------

function manifestEntry(sourceIdentity: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const url = `${VV}/x-${sourceIdentity.replace(/\D/gu, '')}`;
  return {
    sourceSystem: 'recht-nrw', sourceArea: 'lrmb', sourceDocumentType: 'runderlass', sourceIdentity, sourceTitle: `Vorschrift ${sourceIdentity}`, sourceType: 'verwaltungsvorschrift', sourceUrl: url, stemUrl: `${BASE}/taxonomy/term/${sourceIdentity.replace(/\D/gu, '')}`,
    sourceVersion: { url, validTo: null }, selectedVersionUrl: url, sourceValidFrom: '', sourceValidTo: null, baselineStatus: 'undetermined', validityProvenance: 'undetermined', validityEvidence: [], retrievedAt: NOW,
    sha256: SHA(url), contentType: 'text/html', contentFormat: 'native', parserVersion: LRMB_PARSER_VERSION, transformerVersion: TRANSFORMER_VERSION, targetJurisdiction: 'west', targetSlug: '', baselineDate: BASELINE,
    importStatus: 'needs-review', reviewStatus: 'open', reconstructionStatus: 'not-applicable', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW, rawDocuments: [{ role: 'version-page', url, finalUrl: url, sha256: SHA(url), contentType: 'text/html', retrievedAt: NOW, byteLength: 1 }], versionsConsidered: [], overrides: [], findings: [],
    integrity: { fetchParse: false, sourceCanonical: false }, transformation: { changes: 0, unresolved: 0 }, normativity: { decision: 'include', reasons: [] },
    ...overrides,
  };
}

const page = (title: string, body: string, infobox = ''): string => `<html><body><h1 class="page-title">${title}</h1><div class="info-box">${infobox}</div><div class="field field--field_body"><section class="legaldoc-article"><div class="field field--field_text"><div class="tex2jax_process">${body}</div></div></section></div></body></html>`;

function readerOf(pages: Record<string, string>): OfflineSourceReader {
  const stats = { local: 0, cache: 0, missing: 0 };
  return {
    stats,
    async read(url) {
      const html = pages[url];
      if (!html) {
        stats.missing += 1;
        return undefined;
      }
      stats.cache += 1;
      const bytes = new TextEncoder().encode(html);
      return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: NOW, sha256: SHA(html), bytes, fromCache: true };
    },
  };
}

describe('Nachfolgebeleg-Index und Offline-Simulation (Evidence Pass)', () => {
  const pages: Record<string, string> = {
    [`${VV}/x-10`]: page('Richtlinien Test RdErl. d. Ministeriums v. 3.1.1994', '<p>1 Die Behörden gelten.</p><p>2 Diese Richtlinien treten am 1. Februar 1994 in Kraft.</p><p>MBl. NRW. 1994 S. 1098.</p>'),
    [`${VV}/x-11`]: page('Richtlinien Test 2024', `<p>1 Es gilt Folgendes.</p><p>2 Dieser Runderlass tritt am 1. Januar 2025 in Kraft. ${REPEAL_DATED}</p>`),
    [`${VV}/x-12`]: page('Zuwendungen RdErl. d. Ministeriums v. 12.6.2000', `<p>1 Zuwendungen werden gewährt.</p><p>2 ${GILT_BIS}</p>`),
    [`${VV}/x-13`]: page('Alt RdErl. d. Ministeriums v. 15.3.1962', '<p>1 Es gilt.</p>'),
  };
  const manifest: ImportManifest = { ...emptyManifest(), entries: [manifestEntry('term:10', { findings: [{ severity: 'error', code: 'validity-undetermined', message: 'Undatierter Datensatz ohne Beleg der Geltung am Stichtag: Beginn belegt, aber keine Änderung nach dem Stichtag als Beleg für den Fortbestand' }] }), manifestEntry('term:11'), manifestEntry('term:12', { normativity: { decision: 'review', reasons: ['Hinweise'] }, findings: [{ severity: 'error', code: 'validity-undetermined', message: 'Undatierter Datensatz ohne Beleg der Geltung am Stichtag: kein belegter Beginn vor dem Stichtag' }] }), manifestEntry('term:13', { findings: [{ severity: 'error', code: 'validity-undetermined', message: 'Undatierter Datensatz ohne Beleg der Geltung am Stichtag: kein belegter Beginn vor dem Stichtag' }] })] };

  it('baut den Index deterministisch aus dem netzfreien Bestand mit Metadaten der zitierenden Quelle', async () => {
    const first = await buildSuccessorIndex({ manifest, reader: readerOf(pages), now: NOW });
    const second = await buildSuccessorIndex({ manifest, reader: readerOf(pages), now: NOW });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.scanned).toEqual({ lrmbPages: 4, gazetteEntries: 0, statementsOther: 1, statementsSelf: 1 });
    expect(first.sources).toHaveLength(1);
    expect(first.pages.map((page) => [page.identity, page.issuedOn, page.gazettePage])).toEqual([['term:10', '1994-01-03', '1098'], ['term:12', '2000-06-12', undefined], ['term:13', '1962-03-15', undefined]]);
    expect(first.sources[0]).toMatchObject({ url: `${VV}/x-11`, identity: 'term:11', kind: 'lrmb-page', inForce: { kind: 'date', date: '2025-01-01' } });
    expect(first.statements[0]!.statement).toMatchObject({ kind: 'expired', subject: 'other' });
    expect(await buildSuccessorIndex({ manifest, now: NOW })).toMatchObject({ sources: [], statements: [] });
    expect(await loadSuccessorIndex('/nicht/vorhanden')).toBeUndefined();
  });

  it('simuliert die Geltungsentscheidung vorher/nachher über den ganzen Bestand ohne zu schreiben', async () => {
    const reader = readerOf(pages);
    const index = await buildSuccessorIndex({ manifest, reader, now: NOW });
    const run = () => runEvidencePass({ manifest, reader, successorIndex: index, baselineDate: BASELINE, parserVersion: LRMB_PARSER_VERSION, now: NOW });
    const report = await run();
    expect(JSON.stringify(report)).toBe(JSON.stringify(await run()));
    const byId = new Map(report.cases.map((passCase) => [passCase.sourceIdentity, passCase]));
    expect(byId.get('term:10')).toMatchObject({ outcome: 'verified-active-at-baseline', transition: 'undetermined → active-at-baseline (verified-active-at-baseline)', after: { decisionRule: 'P2-successor-continuity' }, p2: { strong: 1, decided: true, earliestEffective: '2024-12-31' } });
    expect(byId.get('term:12')).toMatchObject({ outcome: 'not-at-baseline', normativity: 'review', p1: { date: '2005-12-31', via: 'repeal-pattern', decided: true } });
    expect(byId.get('term:13')).toMatchObject({ outcome: 'undetermined', missingEvidence: 'kein belegter Beginn vor dem Stichtag' });
    expect(byId.get('term:11')).toMatchObject({ outcome: 'undetermined' });
    expect(report.summary.historicalGap).toMatchObject({ before: 3, after: { notAtBaseline: 1, verifiedActive: 1, reconstructionRequired: 0, contradictory: 0, undetermined: 1, notSimulated: 0 }, undeterminedByReason: { 'kein belegter Beginn vor dem Stichtag': 1 } });
    expect(report.summary.rules.p1).toEqual({ detected: 1, decided: 1, contradicted: 0, ambiguous: 0 });
    expect(report.summary.rules.p2).toMatchObject({ withStrong: 1, decidedContinuity: 1, decidedBefore: 0 });
    expect(report.summary.afterNormative.outcome).toEqual({ undetermined: 2, 'verified-active-at-baseline': 1 });
    expect(generalizeReason('Undatierter Datensatz ohne Beleg der Geltung am Stichtag: spätere Änderung ohne Kontinuitätsbeleg (same-stem, unbroken-chain)')).toBe('spätere Änderung ohne Kontinuitätsbeleg');
    const markdown = renderEvidencePassMarkdown(report);
    expect(markdown).toContain('## P1: eigene Außerkrafttretensformel entscheidet (not-at-baseline) (1)');
    expect(markdown).toContain('| term:10 |');
    expect(markdown).toContain('Ohne Entscheidung mangels Beleg');
  });
});

describe('Rekonstruktionsqueue: Gruppen', () => {
  const plan = (overrides: Partial<NonNullable<ManifestEntry['reconstructionPlan']>> = {}): NonNullable<ManifestEntry['reconstructionPlan']> => ({ direction: 'reverse', amendments: [{ decreeDate: '2024-07-16', citation: 'MBl. NRW. 2024 S. 805', inForce: '2024-07-31', gazetteUrl: `${BASE}/mblnrw/2024-s805`, gazetteSha256: SHA('g'), instructionCount: 3, direction: 'reverse' }], sourceCompleteness: 1, estimatedSteps: 3, ...overrides });

  it('ordnet recipe-ready, likely-reconstructable, source-incomplete, uncertain, blocked und imported deterministisch zu', () => {
    expect(reconstructionGroupFor({ status: 'queued', plan: plan(), otherBlockingCategories: [] })).toEqual({ group: 'recipe-ready', reasons: ['alle 1 Änderungsquellen zugeordnet, 3 Befehle, Richtung reverse'] });
    expect(reconstructionGroupFor({ status: 'queued', plan: plan({ estimatedSteps: 0, amendments: [{ ...plan().amendments[0]!, instructionCount: 0 }] }), otherBlockingCategories: [] }).group).toBe('likely-reconstructable');
    expect(reconstructionGroupFor({ status: 'queued', plan: plan({ direction: 'mixed' }), otherBlockingCategories: [] })).toMatchObject({ group: 'likely-reconstructable', reasons: ['gemischte Richtung (rückwärts und vorwärts)'] });
    expect(reconstructionGroupFor({ status: 'queued', plan: plan({ estimatedSteps: 40 }), otherBlockingCategories: [] }).reasons).toEqual(['40 Befehle (> 25)']);
    expect(reconstructionGroupFor({ status: 'queued', plan: plan({ sourceCompleteness: 0.5, amendments: [plan().amendments[0]!, { instructionCount: 0, direction: 'reverse', decreeDate: '2019-01-01' }] }), otherBlockingCategories: [] })).toEqual({ group: 'source-incomplete', reasons: ['1 Änderung(en) ohne zugeordneten Ministerialblatt-Eintrag', '1 Änderung(en) ohne belegtes Inkrafttreten'] });
    expect(reconstructionGroupFor({ status: 'queued', otherBlockingCategories: [] }).group).toBe('source-incomplete');
    expect(reconstructionGroupFor({ status: 'blocked-uncertain', plan: plan(), otherBlockingCategories: [] }).group).toBe('uncertain');
    expect(reconstructionGroupFor({ status: 'queued', plan: plan(), otherBlockingCategories: ['attachment'] })).toEqual({ group: 'blocked', reasons: ['weitere blockierende Befunde: attachment'] });
    expect(reconstructionGroupFor({ status: 'imported', plan: plan(), otherBlockingCategories: [] }).group).toBe('imported');
  });

  it('baut die Queue mit Gruppen aus Manifest und Review-Queue', () => {
    const item = (sourceIdentity: string, category: ReviewItem['category'], severity: ReviewItem['severity'] = 'blocking'): ReviewItem => ({ id: reviewItemId(sourceIdentity, category, category), sourceArea: 'lrmb', sourceIdentity, sourceUrl: `${VV}/x`, category, key: category, severity, summary: category, details: [], firstSeenAt: NOW, updatedAt: NOW, occurrence: 'current', status: 'open' });
    const manifest: ImportManifest = { ...emptyManifest(), entries: [
      manifestEntry('term:1', { reconstructionStatus: 'reconstruction-required', reconstructionPlan: plan() }),
      manifestEntry('term:2', { reconstructionStatus: 'reconstruction-required', reconstructionPlan: plan() }),
      manifestEntry('term:3', { reconstructionStatus: 'reconstruction-required', reconstructionPlan: plan({ sourceCompleteness: 0, amendments: [{ instructionCount: 0, direction: 'reverse' }] }) }),
      manifestEntry('term:4', { reconstructionStatus: 'not-applicable' }),
    ] };
    const queue = buildReconstructionQueue(manifest, { ...emptyReviewQueue(), items: [item('term:1', 'reconstruction-required'), item('term:2', 'reconstruction-required'), item('term:2', 'attachment'), item('term:2', 'institution-mapping', 'non-blocking'), item('term:4', 'reconstruction-uncertain')] }, new Set());
    expect(queue.items.map((entry) => [entry.sourceIdentity, entry.group, entry.otherBlockingCategories])).toEqual([['term:1', 'recipe-ready', []], ['term:2', 'blocked', ['attachment']], ['term:3', 'source-incomplete', []], ['term:4', 'uncertain', []]]);
    expect(queue.summary.byGroup).toEqual({ 'recipe-ready': 1, 'likely-reconstructable': 0, 'source-incomplete': 1, uncertain: 1, blocked: 1, imported: 0 });
    expect(queue.groups?.identitiesByGroup['recipe-ready']).toEqual(['term:1']);
  });
});

describe('Review-Teilreports (review-analysis.ts)', () => {
  it('zerlegt die Analyse deterministisch in summary, by-category und by-source ohne Informationsverlust', () => {
    const item = (sourceIdentity: string, category: ReviewItem['category'], severity: ReviewItem['severity'] = 'blocking'): ReviewItem => ({ id: reviewItemId(sourceIdentity, category, `${category}:x`), sourceArea: 'lrmb', sourceIdentity, sourceUrl: `${VV}/x`, category, key: `${category}:x`, severity, summary: category, details: [], firstSeenAt: NOW, updatedAt: NOW, occurrence: 'current', status: 'open' });
    const manifest: ImportManifest = { ...emptyManifest(), entries: [manifestEntry('term:1'), manifestEntry('term:2', { importStatus: 'imported-with-warnings' })] };
    const analysis = analyzeReviewQueue({ ...emptyReviewQueue(), items: [item('term:1', 'historical-gap'), item('term:1', 'unknown-structure', 'non-blocking'), item('term:2', 'institution-mapping', 'non-blocking')] }, manifest, NOW);
    const parts = splitReviewAnalysis(analysis);
    expect(parts.summary.files).toEqual(['summary.json', 'by-category/groups-attachments.json', 'by-category/groups-institution-terms.json', 'by-category/groups-parser-findings.json', 'by-category/lrmb-historical-gap.json', 'by-category/lrmb-institution-mapping.json', 'by-category/lrmb-unknown-structure.json', 'by-source/lrmb/imported-with-warnings/runderlass.json', 'by-source/lrmb/needs-review/runderlass.json']);
    expect(parts.summary.byCategory.map((category) => [category.category, category.file, category.keyPatterns])).toEqual([['historical-gap', 'by-category/lrmb-historical-gap.json', 1], ['institution-mapping', 'by-category/lrmb-institution-mapping.json', 1], ['unknown-structure', 'by-category/lrmb-unknown-structure.json', 1]]);
    expect(parts.parts.get('by-category/lrmb-historical-gap.json')).toMatchObject({ part: 'category', identities: [{ sourceIdentity: 'term:1', open: 1, blocking: 1, soleBlocker: true }] });
    const identities = [...parts.parts.entries()].filter(([file]) => file.startsWith('by-source/')).flatMap(([, value]) => (value as { identities: unknown[] }).identities);
    expect(identities).toHaveLength(analysis.identities.length);
    expect(JSON.stringify(splitReviewAnalysis(analysis).summary)).toBe(JSON.stringify(parts.summary));
  });
});
