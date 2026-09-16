/**
 * Undatierte LRMB-Altdatensätze ohne Netz: Geltung am Stichtag nur über belegten Beginn und nachgewiesenen
 * Fortbestand (assessUndatedContinuity: same-stem, explicit-amendment, unbroken-chain, consistent-identity,
 * no-contrary-evidence). Grundlage sind die archivierten Originalquellen der VV LHundG NRW (undatierter
 * Datensatz, Fundstellenverlauf 2017/2020/2024 mit Ministerialblatt-Einträgen), aufgebaut wie in
 * `lrmb/pipeline.ts` (Stufen resolve-amendments und assess-validity).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseVersionPage } from '@landesrecht/importer-recht-nrw/common/version-page.ts';
import { gazetteEntryUrlCandidates, identifiesBaseDocument, parseGazetteEntry, resolveInForceDate } from '@landesrecht/importer-recht-nrw/lrmb/gazette.ts';
import { parseLrmbDocument } from '@landesrecht/importer-recht-nrw/lrmb/parser.ts';
import { parseChangeNote, parseGazetteCitation, parseValidityClauses } from '@landesrecht/importer-recht-nrw/lrmb/text-metadata.ts';
import { assessLrmbValidity, assessUndatedContinuity, type AmendmentEvidence, type LrmbValidityAssessment, type LrmbValidityInput } from '@landesrecht/importer-recht-nrw/lrmb/validity.ts';

const BASELINE = '2023-12-01';
const TERM = join(process.cwd(), 'sources', 'recht-nrw', 'term-23528');
const PAGE_URL = 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landeshundegesetz-vv-lhundg-nrw';
const MBL_2024 = 'https://recht.nrw.de/mblnrw/2024-s805';
const GAZETTE_FILES: Readonly<Record<string, string>> = {
  'https://recht.nrw.de/mblnrw/2017-s737-0': '8b2cfa8c4f681218-gazette-amendment.html',
  'https://recht.nrw.de/mblnrw/2020-s446-0': '2eb849e23affc1f0-gazette-amendment.html',
  [MBL_2024]: '978325d257c5fbc4-gazette-amendment.html',
};
const CHECK_IDS = ['same-stem', 'explicit-amendment', 'unbroken-chain', 'consistent-identity', 'no-contrary-evidence'];

const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');

/** Validitätseingabe der VV LHundG NRW aus den archivierten Quellen, wie die LRMB-Pipeline sie bildet. */
async function realUndatedInput(options: { changeNoteText?: (raw: string) => string } = {}): Promise<LrmbValidityInput> {
  const bytes = new Uint8Array(await readFile(join(TERM, '1febb67789d814c3-version-page.html')));
  const page = parseVersionPage(new TextDecoder().decode(bytes), PAGE_URL);
  expect(page.address.pathDate).toBeUndefined();
  const parse = parseLrmbDocument(page.content.format === 'native' ? page.content.bodyHtml : '');
  const rawChangeNote = parseChangeNote(parse.changeNoteText ?? '').raw;
  const changeNote = parseChangeNote(options.changeNoteText ? options.changeNoteText(rawChangeNote) : rawChangeNote);
  const issuedOn = parse.head.issuedOn;
  const amendments: AmendmentEvidence[] = [];
  for (const note of changeNote.amendments) {
    const evidence: AmendmentEvidence = { note, incorporated: true, inForceDerivation: 'nicht bestimmt' };
    const attempts: string[] = [];
    for (const candidate of note.citation ? gazetteEntryUrlCandidates(note.citation) : []) {
      const file = GAZETTE_FILES[candidate];
      if (!file) continue;
      const html = await readFile(join(TERM, file), 'utf8');
      const entry = parseGazetteEntry(html, candidate);
      const identification = identifiesBaseDocument(entry, { ...(issuedOn ? { issuedOn } : {}), ...(changeNote.base ? { citation: changeNote.base } : {}) });
      if (!identification.ok) {
        attempts.push(`${candidate}: ${identification.reason}`);
        continue;
      }
      const inForce = resolveInForceDate(entry);
      evidence.gazetteUrl = candidate;
      evidence.gazetteSha256 = sha256(html);
      evidence.gazetteTitle = entry.title;
      evidence.gazetteText = entry.text;
      if (entry.publishedOn) evidence.publishedOn = entry.publishedOn;
      evidence.identification = identification;
      if (inForce.date) evidence.inForce = inForce.date;
      evidence.inForceDerivation = inForce.derivation;
      if (entry.predecessor) evidence.predecessor = { latest: entry.predecessor.latest, ...(entry.predecessor.date ? { date: entry.predecessor.date } : {}) };
      break;
    }
    if (!evidence.gazetteUrl) {
      evidence.identification = { ok: false, reason: attempts.join('; ') || 'keine Kandidatenadresse' };
      evidence.inForceDerivation = 'Ministerialblatt-Eintrag nicht zugeordnet';
    }
    amendments.push(evidence);
  }
  return {
    baseline: BASELINE,
    page: { url: page.address.url, sha256: sha256(bytes), undated: true, hasLaterVersions: false },
    clauses: parseValidityClauses(parse.bodyTexts),
    amendments,
    versionStarts: page.versions.map((entry) => entry.validFrom),
    contraryTexts: page.changeHistoryItems.filter((item) => !/Redaktioneller Hinweis/u.test(item)),
    changeNote,
    ...(issuedOn ? { issuedOn } : {}),
  };
}

const postAmendment = (input: LrmbValidityInput): AmendmentEvidence => {
  const post = input.amendments.find((amendment) => amendment.gazetteUrl === MBL_2024);
  expect(post).toBeDefined();
  return post!;
};

const failedChecks = (result: LrmbValidityAssessment): string[] => (result.continuity?.checks ?? []).filter((check) => !check.ok).map((check) => check.id);

function expectUndetermined(result: LrmbValidityAssessment, reason: string | RegExp): void {
  expect(result).toMatchObject({ baselineStatus: 'undetermined', textStatus: 'not-applicable', provenance: 'undetermined', postBaselineAmendments: [], missingPreBaselineAmendments: [] });
  expect(result.sourceValidFrom).toBeUndefined();
  expect(result.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'validity-undetermined' })]);
  expect(result.findings[0]!.message).toMatch(reason);
}

describe('Undatierte LRMB-Altdatensätze: belegter Fortbestand der VV LHundG NRW (archivierte Quellen)', () => {
  it('alle fünf Kontinuitätsbedingungen erfüllt → Fortbestand belegt, Beweiswert wie dokumentiert', async () => {
    const input = await realUndatedInput();
    expect(input.issuedOn).toBe('2003-05-02');
    expect(input.amendments.map((amendment) => [amendment.note.decreeDate, amendment.inForce, amendment.identification?.ok])).toEqual([['2017-07-25', '2017-08-05', true], ['2020-07-06', '2020-07-31', true], ['2024-07-16', '2024-07-31', true]]);

    const continuity = assessUndatedContinuity(input, postAmendment(input));
    expect(continuity.supported).toBe(true);
    expect(continuity.checks.map((check) => [check.id, check.ok, check.strength])).toEqual([
      ['same-stem', true, 'strong'],
      ['explicit-amendment', true, 'strong'],
      ['unbroken-chain', true, 'strong'],
      ['consistent-identity', true, 'strong'],
      ['no-contrary-evidence', true, 'supporting'],
    ]);
    expect(continuity.checks.find((check) => check.id === 'explicit-amendment')?.statement).toContain('wie folgt geändert');
  });

  it('eingearbeitete Änderung nach dem Stichtag → am Stichtag geltend, Text nur rekonstruiert (Provenienz reconstructed)', async () => {
    const result = assessLrmbValidity(await realUndatedInput());
    expect(result).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'reconstruction-required', sourceValidity: 'reconstructed', provenance: 'reconstructed', sourceValidFrom: '2020-07-31', sourceValidTo: '2024-07-30' });
    expect(result.continuity?.supported).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual(['reconstruction-required']);
    expect(result.postBaselineAmendments.map((amendment) => amendment.note.decreeDate)).toEqual(['2024-07-16']);

    const continuityEvidence = result.evidence.filter((entry) => entry.supports === 'continuity');
    expect(continuityEvidence.map((entry) => [entry.kind, entry.strength])).toEqual([
      ['gazette-amendment', 'strong'],
      ['gazette-amendment', 'strong'],
      ['gazette-amendment-chain', 'strong'],
      ['gazette-amendment', 'strong'],
      ['portal-change-history', 'supporting'],
    ]);
    expect(continuityEvidence.slice(0, 4).every((entry) => entry.sourceUrl === MBL_2024 && /^[a-f0-9]{64}$/u.test(entry.sha256 ?? ''))).toBe(true);
    const active = result.evidence.find((entry) => entry.supports === 'active-at-baseline');
    expect(active).toMatchObject({ kind: 'gazette-amendment', strength: 'strong', sourceUrl: MBL_2024 });
    expect(active?.statement).toContain('Undatierter Datensatz: vor dem Stichtag in Kraft (Änderung in Kraft 2017-08-05)');
  });

  it('spätere Änderung nicht eingearbeitet → direkt übernehmbar mit Provenienz verified-active-at-baseline', async () => {
    const input = await realUndatedInput({ changeNoteText: (raw) => raw.replace(/, 16\. Juli 2024 \(MBl\. NRW\. 2024 S\. 805\)/u, '') });
    expect(input.changeNote?.amendments).toHaveLength(2);
    const later = await realUndatedInput();
    const post = { ...postAmendment(later), incorporated: false };
    const result = assessLrmbValidity({ ...input, amendments: [...input.amendments, post] });
    expect(result).toMatchObject({ baselineStatus: 'active-at-baseline', textStatus: 'direct', sourceValidity: 'verified-active-at-baseline', provenance: 'verified-active-at-baseline', sourceValidFrom: '2020-07-31', sourceValidTo: '2024-07-30' });
    expect(result.continuity?.supported).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe('Undatierte LRMB-Altdatensätze: nicht belegter Fortbestand → undetermined (kein Import)', () => {
  it('ohne ausdrücklichen Änderungsbefehl ist der Fortbestand nicht bewiesen', async () => {
    const input = structuredClone(await realUndatedInput());
    const post = postAmendment(input);
    post.gazetteText = post.gazetteText!.replace(/wie\s+folgt\s+geändert/gu, 'bekannt gegeben');
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /spätere Änderung ohne Kontinuitätsbeleg \(explicit-amendment\)/u);
    expect(failedChecks(result)).toEqual(['explicit-amendment']);
    expect(result.evidence.find((entry) => entry.statement.includes('(explicit-amendment)'))).toMatchObject({ supports: 'contradiction', strength: 'strong' });

    delete post.gazetteText;
    const withoutText = assessUndatedContinuity(input, post);
    expect(withoutText.supported).toBe(false);
    expect(withoutText.checks.find((check) => check.id === 'explicit-amendment')?.statement).toContain('Text des Eintrags nicht verfügbar');
  });

  it('Aufhebungsvermerk im Portal ist Gegenbeleg → undetermined, nie am Stichtag geltend', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({ ...input, contraryTexts: ['Aufgehoben durch Runderlass vom 12. März 2024 (MBl. NRW. 2024 S. 210).'] });
    expectUndetermined(result, /no-contrary-evidence/u);
    expect(result.baselineStatus).not.toBe('active-at-baseline');
    expect(failedChecks(result)).toEqual(['no-contrary-evidence']);
    expect(result.continuity?.checks.find((check) => check.id === 'no-contrary-evidence')?.statement).toContain('Portalvermerk: „Aufgehoben durch Runderlass vom 12. März 2024');
    expect(result.evidence.find((entry) => entry.kind === 'portal-change-history')).toMatchObject({ supports: 'contradiction', strength: 'supporting' });
  });

  it('Neufassung in der Kette: Eingangsformel nennt eine Vorgängerfassung, die der Fundstellenverlauf nicht führt → Kette unterbrochen', async () => {
    const input = structuredClone(await realUndatedInput());
    postAmendment(input).predecessor = { latest: true, date: '2022-03-01' };
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /unbroken-chain/u);
    expect(failedChecks(result)).toEqual(['unbroken-chain']);
    expect(result.continuity?.checks.find((check) => check.id === 'unbroken-chain')?.statement).toBe('Eingangsformel nennt 2022-03-01, der Fundstellenverlauf aber 2020-07-06');
  });

  it('Neufassung durch einen Änderungseintrag zwischen Beginn und Stichtag ist Gegenbeleg', async () => {
    const input = structuredClone(await realUndatedInput());
    const between = input.amendments.find((amendment) => amendment.note.decreeDate === '2020-07-06')!;
    between.gazetteText = `Der Runderlass zu den Verwaltungsvorschriften zum Landeshundegesetz wird wie folgt neu gefasst: ${between.gazetteText}`;
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /no-contrary-evidence/u);
    expect(result.continuity?.checks.find((check) => check.id === 'no-contrary-evidence')?.statement).toContain('Runderlass vom 2020-07-06 (MBl. NRW. 2020 S. 446) fasst die Vorschrift neu');
  });

  it('Identität/Fundstelle inkonsistent: der Ministerialblatt-Eintrag nennt eine andere Stammfundstelle → nicht bewiesen', async () => {
    const input = structuredClone(await realUndatedInput());
    const post = postAmendment(input);
    const entry = parseGazetteEntry(await readFile(join(TERM, GAZETTE_FILES[MBL_2024]!), 'utf8'), MBL_2024);
    post.identification = identifiesBaseDocument(entry, { issuedOn: '2003-05-02', citation: parseGazetteCitation('MBl. NRW. 2003 S. 581')! });
    expect(post.identification).toEqual({ ok: false, reason: 'Eintrag nennt die Vorschrift vom 2003-05-02, aber nicht mit der Fundstelle S. 581' });
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /same-stem, consistent-identity/u);
    expect(failedChecks(result)).toEqual(['same-stem', 'consistent-identity']);
    expect(result.continuity?.checks.find((check) => check.id === 'consistent-identity')?.statement).toMatch(/^1 Änderung\(en\) nicht der Stammvorschrift MBl\. NRW\. 2003 S\. 580 zugeordnet \(Runderlass vom 2024-07-16/u);
  });

  it('Fundstellenverlauf mit abweichender Stammfundstelle: keine Zuordnung der Änderungen, kein belegter Beginn', async () => {
    const input = await realUndatedInput({ changeNoteText: (raw) => raw.replace('MBl. NRW. 2003 S. 580', 'MBl. NRW. 2003 S. 581') });
    expect(input.changeNote?.base?.text).toBe('MBl. NRW. 2003 S. 581');
    expect(input.amendments.every((amendment) => amendment.identification?.ok === false && amendment.gazetteUrl === undefined)).toBe(true);
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /kein belegter Beginn vor dem Stichtag/u);
    expect(result.continuity).toBeUndefined();
  });

  it('Stammfundstelle im Fundstellenverlauf nicht lesbar → consistent-identity nicht bestanden', async () => {
    const input = structuredClone(await realUndatedInput());
    delete input.changeNote!.base;
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /consistent-identity/u);
    expect(failedChecks(result)).toEqual(['consistent-identity']);
    expect(result.continuity?.checks.find((check) => check.id === 'consistent-identity')?.statement).toBe('Stammfundstelle im Fundstellenverlauf nicht lesbar');
  });

  it('ohne Änderung nach dem Stichtag gibt es keinen Fortbestandsbeleg', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({ ...input, amendments: input.amendments.filter((amendment) => amendment.gazetteUrl !== MBL_2024) });
    expectUndetermined(result, /Beginn belegt, aber keine Änderung nach dem Stichtag als Beleg für den Fortbestand/u);
    expect(result.continuity).toBeUndefined();
  });

  it('ohne belegten Beginn vor dem Stichtag (kein Ausfertigungsdatum, keine Inkrafttretensklausel) undetermined', async () => {
    const { issuedOn: _issuedOn, ...input } = await realUndatedInput();
    const result = assessLrmbValidity(input);
    expectUndetermined(result, /kein belegter Beginn vor dem Stichtag/u);
  });

  it('Außerkrafttretensklausel vor dem Stichtag widerlegt die Geltung trotz späterer Änderung', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({ ...input, clauses: { unparsed: [], expiry: { date: '2019-12-31', text: 'Dieser Runderlass tritt mit Ablauf des 31. Dezember 2019 außer Kraft.' } } });
    expect(result).toMatchObject({ baselineStatus: 'not-active-at-baseline', textStatus: 'not-applicable', provenance: 'exact' });
    expect(result.findings.map((finding) => finding.code)).toEqual(['validity-expired-before-baseline']);
    expect(result.evidence.find((entry) => entry.kind === 'text-expiry-clause')).toMatchObject({ supports: 'contradiction', strength: 'strong' });
  });
});

describe('Undatierte LRMB-Altdatensätze: Suchindex-Signale und Beweiswert der Belege', () => {
  it('Suchindex „historisch“ und Außerkrafttreten allein widerlegen den belegten Fortbestand nicht (nur genannt)', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({ ...input, indexSignals: { historically: true, outforceDate: '2020-01-01' } });
    expect(result).toMatchObject({ baselineStatus: 'active-at-baseline', provenance: 'reconstructed' });
    expect(result.continuity?.supported).toBe(true);
    expect(result.evidence.find((entry) => entry.kind === 'search-index-signal')).toMatchObject({ supports: 'contradiction', strength: 'insufficient' });
    expect(result.continuity?.checks.find((check) => check.id === 'no-contrary-evidence')?.statement).toContain('Suchindex markiert „historisch“; Suchindex nennt Außerkrafttreten 2020-01-01 – allein unzureichend, nicht entscheidend');
    expect(result.findings.map((finding) => finding.code)).toEqual(['reconstruction-required']);
  });

  it('Suchindex „nicht historisch, gültig ab“ allein trägt keinen Fortbestand', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({ ...input, amendments: input.amendments.filter((amendment) => amendment.gazetteUrl !== MBL_2024), indexSignals: { historically: false, effectiveFrom: '2003-05-02' } });
    expectUndetermined(result, /keine Änderung nach dem Stichtag/u);
    expect(result.evidence).toEqual([expect.objectContaining({ kind: 'search-index-signal', supports: 'active-at-baseline', strength: 'insufficient' })]);
  });

  it('Beweiswert: strong, supporting und insufficient werden wie dokumentiert gesetzt', async () => {
    const input = await realUndatedInput();
    const result = assessLrmbValidity({
      ...input,
      clauses: { unparsed: [], inForce: { kind: 'date', date: '2003-06-01', text: 'Dieser Runderlass tritt am 1. Juni 2003 in Kraft.' }, expiry: { date: '2028-12-31', text: 'Er tritt mit Ablauf des 31. Dezember 2028 außer Kraft.' } },
      completenessNotice: { text: 'Fassungen von Verwaltungsvorschriften liegen erst ab Oktober 2025 vollständig vor.', url: PAGE_URL, sha256: input.page.sha256 },
      indexSignals: { historically: false, effectiveFrom: '2003-05-02' },
    });
    expect(result.baselineStatus).toBe('active-at-baseline');
    const strengthOf = (kind: string, supports: string): string | undefined => result.evidence.find((entry) => entry.kind === kind && entry.supports === supports)?.strength;
    expect(strengthOf('portal-completeness-notice', 'completeness')).toBe('supporting');
    expect(strengthOf('search-index-signal', 'active-at-baseline')).toBe('insufficient');
    expect(strengthOf('text-expiry-clause', 'valid-to')).toBe('strong');
    expect(strengthOf('text-in-force-clause', 'valid-from')).toBe('supporting');
    expect(strengthOf('gazette-amendment', 'active-at-baseline')).toBe('strong');
    expect(strengthOf('portal-change-history', 'text-state')).toBe('supporting');
    expect(strengthOf('gazette-amendment', 'text-state')).toBe('strong');
    expect(strengthOf('gazette-amendment-chain', 'completeness')).toBe('strong');
    expect(result.evidence.every((entry) => ['strong', 'supporting', 'insufficient'].includes(entry.strength ?? ''))).toBe(true);
    expect(result.evidence.find((entry) => entry.supports === 'active-at-baseline' && entry.kind === 'gazette-amendment')?.statement).toContain('Inkrafttreten 2003-06-01');
    expect(result.continuity?.checks.map((check) => check.id)).toEqual(CHECK_IDS);
  });
});
