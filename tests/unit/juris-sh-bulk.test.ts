/**
 * juris-SH-Adapter, Run 6: Stichtagsbelege mit dem bestehenden Ereignisregister, Stand-Gegenprobe,
 * Reihenfolge historischer Einzelfassungen, Slugvorschau, Schreibpfad nach content/norms/nsh und die
 * Zuordnung der Sperrgründe zu Review-Fällen. Synthetische Daten, kein Netz, kein Cache.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { createSlugReserver, emptySlugRegistry } from '@landesrecht/importer-juris-sh/common/slug-registry.ts';
import type { LedgerEvent } from '@landesrecht/importer-juris-sh/events/ledger.ts';
import type { ParsedJurisPdf } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import { classifyEdition, standAmendmentDate } from '@landesrecht/importer-juris-sh/parse/source-law.ts';
import { baselineEvidence, buildLedgerIndex, eventTargetDate, matchLedgerEvents, normalizeGliederungsnummer } from '@landesrecht/importer-juris-sh/pipeline/baseline-evidence.ts';
import { reviewInputsFor } from '@landesrecht/importer-juris-sh/pipeline/bulk.ts';
import type { DocumentResult } from '@landesrecht/importer-juris-sh/pipeline/document.ts';
import { selectBaselineUnits, unitOrderProblems, type UnitVersion } from '@landesrecht/importer-juris-sh/pipeline/historical.ts';
import { removeOwnNormDirectory, writeNormRecord } from '@landesrecht/importer-juris-sh/pipeline/persist.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/juris-sh-state.ts';

afterAll(cleanupTempRoots);

let counter = 0;
const event = (overrides: Partial<LedgerEvent>): LedgerEvent => ({
  id: `e-${(counter += 1)}`,
  eventType: 'amend',
  eventDate: '2024-03-01',
  targetTitle: 'Landesverordnung über Testfälle',
  targetGliederungsnummer: 'B 2000-1-1',
  targetIdentityHints: [],
  citation: 'GVOBl. S. 1',
  sourceId: 'gvobl-jiv-2024',
  sourceUrl: 'https://example.invalid/register.pdf',
  sourceSha256: 'd'.repeat(64),
  sourcePage: 1,
  sourceLine: 1,
  organ: 'gvobl',
  excerpt: 'Ändert LVO',
  evidenceStrength: 'strong',
  confidence: 1,
  processingStatus: 'recorded',
  ...overrides,
});

const parsed = (overrides: Partial<ParsedJurisPdf>): ParsedJurisPdf => ({
  header: {},
  title: 'Landesverordnung über Testfälle',
  titleLines: [],
  toc: [],
  body: [{ type: 'paragraph', label: '§ 1', text: 'Text.' }],
  sourceText: '',
  excludedSourceLines: 0,
  bodyLines: [],
  titleFootnoteLines: [],
  findings: [],
  pages: 1,
  ...overrides,
}) as ParsedJurisPdf;

const result = (overrides: Partial<DocumentResult>): DocumentResult => ({
  documentId: 'jlr-NNLSH0000TEST',
  area: 'landesrecht',
  outcome: 'import-ready',
  reasons: [],
  blockers: [],
  warnings: [],
  findings: [],
  baseline: { class: 'unchanged-since-baseline', basis: 'alle Einheiten gültig spätestens ab 2019-01-01' },
  source: { gliederungsnummer: 'B 2000-1-1', documentDates: ['2019-01-01'], latestUnitFrom: '2019-01-01', editionCurrentAsOf: '2026-09-18' },
  raw: { url: 'https://example.invalid/x.pdf', sha256: 'a'.repeat(64), byteLength: 1, retrievedAt: '2026-09-18T10:00:00.000Z' },
  ...overrides,
});

describe('Stichtagseinordnung der Ausgabe', () => {
  it('liest das späteste Änderungsdatum aus dem Stand-Vermerk', () => {
    expect(standAmendmentDate('letzte berücksichtigte Änderung: § 3 geändert (LVO v. 04.06.2015, GVOBl. S. 149)')).toBe('2015-06-04');
    expect(standAmendmentDate('mehrfach geändert (Art. 2 Ges. v. 12.12.2019, GVOBl. S. 1) und (LVO v. 04.05.2026, NBl. S. 26)')).toBe('2026-05-04');
    expect(standAmendmentDate(undefined)).toBeUndefined();
  });

  it('nimmt die heutige Ausgabe nicht als Stichtagsfassung, wenn eine spätere Änderung in keinem Einheitsdatum erscheint', () => {
    const toc = [{ label: '§ 1', title: '', validFrom: '2023-07-30' }] as ParsedJurisPdf['toc'];
    expect(classifyEdition(parsed({ toc, stand: 'Anlagen neu gefasst (LVO v. 04.05.2026, NBl. S. 26)' }), false).class).toBe('undetermined');
    expect(classifyEdition(parsed({ toc, stand: '§ 1 geändert (LVO v. 01.07.2023, GVOBl. S. 5)' }), false).class).toBe('unchanged-since-baseline');
  });

  it('behandelt „Gültig bis“ als letzten Geltungstag', () => {
    const toc = [{ label: '§ 1', title: '', validFrom: '2019-01-01' }] as ParsedJurisPdf['toc'];
    expect(classifyEdition(parsed({ toc, header: { 'Gültig bis': '01.12.2023' } }), false).class).not.toBe('repealed-before-baseline');
    expect(classifyEdition(parsed({ toc, header: { 'Gültig bis': '30.11.2023' } }), false).class).toBe('repealed-before-baseline');
  });
});

describe('Ereignisregister als Stichtagsbeleg', () => {
  it('liest das Zieldatum aus „Ändert … vom“ und aus der Systematischen Übersicht', () => {
    expect(eventTargetDate(event({ targetIdentityHints: ['beziehung:Ändert LVO vom 11. März 2019, GS Schl.-H. II, Gl.Nr. B 315-20-11'] }))).toBe('2019-03-11');
    expect(eventTargetDate(event({ sourceId: 'gvobl-systematische-uebersicht', targetIdentityHints: ['gl-nr:7816-1', 'ausfertigung:1873-01-03'] }))).toBe('1873-01-03');
    expect(eventTargetDate(event({ targetIdentityHints: ['ausfertigung:2023-11-08'] }))).toBeUndefined();
    expect(normalizeGliederungsnummer('B 315-20-11')).toBe('B315-20-11');
  });

  it('ordnet nur bei gleicher Gliederungsnummer und gleichem Datum oder eindeutiger Nummer zu', () => {
    const withDate = event({ targetIdentityHints: ['beziehung:Ändert LVO vom 1. Januar 2019'] });
    const withoutDate = event({});
    const otherDate = event({ targetIdentityHints: ['beziehung:Ändert LVO vom 2. Januar 2019'] });
    const amtsblatt = event({ organ: 'amtsblatt' });
    const index = buildLedgerIndex([withDate, withoutDate, otherDate, amtsblatt]);
    const document = { area: 'landesrecht' as const, gliederungsnummer: 'B 2000-1-1', documentDates: ['2019-01-01'] };
    expect(matchLedgerEvents(index, document, new Map([['landesrecht:B2000-1-1', 1]])).map((match) => [match.event.id, match.basis])).toEqual([[withDate.id, 'gliederungsnummer+datum'], [withoutDate.id, 'gliederungsnummer-eindeutig']]);
    expect(matchLedgerEvents(index, document, new Map([['landesrecht:B2000-1-1', 2]])).map((match) => match.event.id)).toEqual([withDate.id]);
  });

  it('trägt eine unveränderte Ausgabe über Regel B und widerspricht bei einer späteren Registeränderung', () => {
    const clean = baselineEvidence(result({}), []);
    expect(clean.assessment).toMatchObject({ status: 'active-at-baseline', rule: 'B-strong-begin-and-continuity' });
    const later = event({ targetIdentityHints: ['beziehung:Ändert LVO vom 1. Januar 2019'] });
    const index = buildLedgerIndex([later]);
    const matches = matchLedgerEvents(index, { area: 'landesrecht', gliederungsnummer: 'B 2000-1-1', documentDates: ['2019-01-01'] }, new Map());
    const contradicted = baselineEvidence(result({}), matches);
    expect(contradicted.contradictions).toHaveLength(1);
    expect(contradicted.assessment).toMatchObject({ status: 'undetermined', rule: 'C-undetermined' });
    const inputs = reviewInputsFor(result({}), contradicted);
    expect(inputs.map((input) => [input.category, input.severity])).toEqual([['contradictory-evidence', 'blocking']]);
  });

  it('belegt ein Ende vor dem Stichtag nach Regel A', () => {
    const ended = baselineEvidence(result({ outcome: 'not-at-baseline', baseline: { class: 'repealed-before-baseline', basis: 'Gültig bis 2016-12-22' }, source: { documentDates: [], headerValidTo: '2016-12-22' } }), []);
    expect(ended.assessment).toMatchObject({ status: 'not-active-at-baseline', rule: 'A-strong-end-before-baseline' });
  });
});

describe('Review-Fälle aus Sperrgründen', () => {
  it('ordnet Tabellen, Abbildungen, fehlende Einzelfassungen und Überleitungsreste Kategorien zu', () => {
    const inputs = reviewInputsFor(result({
      outcome: 'review',
      blockers: [
        { kind: 'parse', code: 'table-layout', detail: 'Tabelle' },
        { kind: 'parse', code: 'figure', detail: 'Karte' },
        { kind: 'units-missing', code: 'changed-after-baseline', detail: '3 Einheiten' },
        { kind: 'transform', code: 'residual-source-state-reference', detail: 'Schl.-H.' },
      ],
    }), undefined);
    expect(inputs.map((input) => input.category)).toEqual(['unknown-structure', 'pdf-only', 'reconstruction-required', 'institution-mapping']);
    expect(inputs.every((input) => input.severity === 'blocking')).toBe(true);
  });
});

describe('Einzelfassungen: Umnummerierung und Reihenfolge', () => {
  const unit = (nn: number, key: string, validFrom: string, validTo?: string): UnitVersion => ({
    documentId: `jlr-NNLSH0000TESTNN${String(nn).padStart(11, '0')}`,
    nn,
    key,
    validFrom,
    ...(validTo ? { validTo } : {}),
    parsed: {} as ParsedJurisPdf,
    layout: {} as UnitVersion['layout'],
    raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
  });

  it('akzeptiert dieselbe Bezeichnung in getrennten Gruppen, wenn am Stichtag nur eine gilt', () => {
    // § 14 fiel 2015 weg; § 13 wurde 2021 als neue Einheit hinter der alten § 14 geführt.
    const selection = selectBaselineUnits([unit(1, '§ 12', '2003-01-01'), unit(2, '§ 13', '2003-01-01', '2020-12-31'), unit(3, '§ 14', '2003-01-01', '2015-12-31'), unit(4, '§ 13', '2021-01-01'), unit(5, '§ 15', '2003-01-01')]);
    expect(selection.problems).toEqual([]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([1, 4, 5]);
    // Stünde eine noch geltende Einheit mit höherer Nummer davor, ist die Zusammensetzung nicht belegt.
    const disordered = selectBaselineUnits([unit(1, '§ 12', '2003-01-01'), unit(2, '§ 13', '2003-01-01', '2020-12-31'), unit(3, '§ 14', '2003-01-01'), unit(4, '§ 13', '2021-01-01')]);
    expect(disordered.problems).toEqual(['Reihenfolge nicht aufsteigend: § 13 nach § 14']);
    expect(unitOrderProblems([{ key: '§ 2' }, { key: '§ 2a' }, { key: 'Anlage' }, { key: 'Art. 3' }, { key: '§ 3' }])).toEqual([]);
  });

  it('meldet zwei gleichzeitig geltende Einheiten gleicher Bezeichnung', () => {
    const selection = selectBaselineUnits([unit(1, '§ 1', '2003-01-01'), unit(2, '§ 2', '2003-01-01'), unit(3, '§ 1', '2010-01-01')]);
    expect(selection.problems.some((problem) => /§ 1: 2 Einheiten gelten zugleich/u.test(problem))).toBe(true);
  });
});

describe('Slugvorschau und Schreibpfad', () => {
  it('zeigt den künftigen Slug, ohne ihn zu reservieren', () => {
    const registry = emptySlugRegistry();
    const reserver = createSlugReserver(registry, new Set(['lvwg-nsh']));
    expect(reserver.preview('jlr-A', 'LVwG SH')).toMatch(/^lvwg-nsh-[0-9a-f]{8}$/u);
    expect(reserver.preview('jlr-B', 'LBO SH')).toBe('lbo-nsh');
    expect(registry.entries).toEqual([]);
    expect(reserver.changed).toBe(false);
    expect(reserver.reserve('jlr-B', 'LBO SH').slug).toBe('lbo-nsh');
    expect(reserver.preview('jlr-B', 'anders')).toBe('lbo-nsh');
  });

  const record = (slug: string, identity: string): NormRecord => ({
    meta: { id: `nsh:${slug}`, slug, externalIdentifiers: [{ system: 'juris-sh', value: identity }] },
    history: { entries: [] },
    versions: [{ versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: null, citation: 'x', changeNote: 'x', body: [] }],
  }) as unknown as NormRecord;

  it('schreibt die Ausgangsfassung atomar, bleibt beim Wiederholungslauf unverändert und fasst fremde Verzeichnisse nicht an', async () => {
    const root = await tempRoot();
    const first = await writeNormRecord({ root, record: record('lbo-nsh', 'jlr-B'), sourceIdentity: 'jlr-B', baselineDate: '2023-12-01', write: true });
    expect(first).toMatchObject({ changed: true, files: ['content/norms/nsh/lbo-nsh/meta.json', 'content/norms/nsh/lbo-nsh/history.json', 'content/norms/nsh/lbo-nsh/versions/2023-12-01.json'] });
    expect(JSON.parse(await readFile(join(root, 'content/norms/nsh/lbo-nsh/meta.json'), 'utf8'))).toMatchObject({ slug: 'lbo-nsh' });
    expect((await writeNormRecord({ root, record: record('lbo-nsh', 'jlr-B'), sourceIdentity: 'jlr-B', baselineDate: '2023-12-01', write: true })).changed).toBe(false);
    const foreign = await writeNormRecord({ root, record: record('lbo-nsh', 'jlr-C'), sourceIdentity: 'jlr-C', baselineDate: '2023-12-01', write: true });
    expect(foreign.finding?.code).toBe('foreign-norm-directory');
    await mkdir(join(root, 'content/norms/nsh/lbo-nsh/versions'), { recursive: true });
    await writeFile(join(root, 'content/norms/nsh/lbo-nsh/versions/2025-01-01.json'), '{}');
    expect((await writeNormRecord({ root, record: record('lbo-nsh', 'jlr-B'), sourceIdentity: 'jlr-B', baselineDate: '2023-12-01', write: true })).finding?.code).toBe('existing-versions');
    await expect(removeOwnNormDirectory({ root, slug: 'lbo-nsh', sourceIdentity: 'jlr-C', write: true })).rejects.toThrow(/gehört nicht/u);
    expect(await removeOwnNormDirectory({ root, slug: 'lbo-nsh', sourceIdentity: 'jlr-B', write: true })).toBe('content/norms/nsh/lbo-nsh');
  });
});

describe('Teilbestand NSH in der Oberfläche', () => {
  it('zählt veröffentlichte, am Stichtag offene, unentschiedene und nicht zugeordnete baseline-only-Normen', async () => {
    const { buildNshInventoryStatus } = await import('@landesrecht/importer-juris-sh/pipeline/inventory-status.ts');
    const entry = (documentId: string, outcome: string, baselineClass: string, baselineStatus?: string, contradictions = 0) => ({ documentId, area: 'landesrecht', outcome, baselineClass, ...(baselineStatus ? { baselineStatus } : {}), blockers: [], warnings: 0, ledger: { matched: 0, postBaseline: 0, contradictions } });
    const report = {
      entries: [
        entry('a', 'import-ready', 'unchanged-since-baseline', 'active-at-baseline'),
        entry('b', 'review', 'unchanged-since-baseline', 'active-at-baseline'),
        entry('c', 'reconstruction', 'changed-after-baseline', 'undetermined'),
        entry('d', 'review', 'unchanged-since-baseline', 'undetermined', 1),
        entry('e', 'review', 'undetermined', 'undetermined'),
        entry('f', 'not-at-baseline', 'enacted-after-baseline', 'not-active-at-baseline'),
      ],
      baselineOnly: { entries: [{ documentIds: [] }, { documentIds: ['c'] }] },
    } as never;
    const status = buildNshInventoryStatus(report, { entries: [{ sourceIdentity: 'a', importStatus: 'imported' }] as never });
    expect(status).toEqual({ jurisdiction: 'nsh', baselineDate: '2023-12-01', complete: false, published: 1, pending: { atBaseline: 2, baselineOnly: 1, undetermined: 2 } });
  });
});

describe('Einzelfassungen: Gegenprobe gegen das Rahmendokument', () => {
  const unit = (key: string, title: string, options: { gl?: string; versionDate?: string; validFrom?: string } = {}): UnitVersion => ({
    documentId: `jlr-NNLSH0000TESTNN0000000000${key.length}`,
    nn: 1,
    key,
    validFrom: options.validFrom ?? '2020-01-01',
    ...(options.versionDate ? { versionDate: options.versionDate } : {}),
    parsed: { title, header: options.gl ? { 'Gliederungs-Nr': options.gl } : {} } as unknown as ParsedJurisPdf,
    layout: {} as UnitVersion['layout'],
    raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
  });

  it('verlangt gleichen Titel, gleiche Gliederungsnummer und keine rückwirkende Fassung', async () => {
    const { consistencyProblems } = await import('@landesrecht/importer-juris-sh/pipeline/historical.ts');
    const frame = { title: 'Landesverordnung über Testfälle', gliederungsnummer: '2000-1-1' };
    expect(consistencyProblems([unit('§ 1', 'Landesverordnung über Testfälle', { gl: '2000-1-1' })], frame)).toEqual([]);
    expect(consistencyProblems([unit('§ 1', 'Landesverordnung über frühere Testfälle')], frame)[0]).toMatch(/weicht vom heutigen Titel ab/u);
    expect(consistencyProblems([unit('§ 1', 'Landesverordnung über Testfälle', { gl: '2000-1-2' })], frame)[0]).toMatch(/Gliederungsnummer/u);
    expect(consistencyProblems([unit('§ 1', 'Landesverordnung über Testfälle', { versionDate: '2024-05-04', validFrom: '2023-07-30' })], frame)[0]).toMatch(/rückwirkende Fassung/u);
  });
});

describe('R2-Staging und Sync (Speichertransport, kein Netz)', () => {
  it('stagt nachgerechnet, lädt mit Rücklesen hoch und stuft nie zurück', async () => {
    const { createHash } = await import('node:crypto');
    const { mkdir: mkdirAsync, writeFile: writeFileAsync } = await import('node:fs/promises');
    const { cacheKey } = await import('@landesrecht/importer-recht-nrw/common/fetcher.ts');
    const { createMemoryR2Transport } = await import('@landesrecht/importer-recht-nrw/common/r2-transport.ts');
    const { stageRawSources, syncStaged } = await import('@landesrecht/importer-juris-sh/r2/sync.ts');
    const { guardTransport, KEY_PREFIX } = await import('@landesrecht/importer-juris-sh/r2/archive.ts');
    const { manifestEntryDefaults, readManifest, writeManifestEntry } = await import('@landesrecht/importer-juris-sh/common/manifest.ts');
    const root = await tempRoot();
    const bytes = new TextEncoder().encode('%PDF-1.4 test');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const url = 'https://www.gesetze-rechtsprechung.sh.juris.de/jportal/recherche3doc/jlr_TEST_X.pdf';
    await mkdirAsync(join(root, '.cache/juris-sh'), { recursive: true });
    await writeFileAsync(join(root, '.cache/juris-sh', `${cacheKey(url)}.bin`), bytes);
    await writeManifestEntry(root, {
      ...manifestEntryDefaults(),
      sourceArea: 'landesrecht', sourceIdentity: 'jlr-NNLSH0000TEST', sourceTitle: 'Testverordnung', sourceType: 'verordnung', sourceUrl: url,
      sourceVersion: { url }, selectedVersionUrl: url, sourceValidFrom: '2020-01-01', sourceValidTo: null, baselineStatus: 'active-at-baseline', baselineRecoveryMethod: 'current-source',
      sourceProvenance: { publicationAuthority: 'unknown', digitalRepresentation: 'born-digital' }, retrievedAt: '2026-09-18T10:00:00.000Z', sha256, contentType: 'application/pdf', transformerVersion: 't',
      targetSlug: 'testvo-nsh', importStatus: 'imported',
      rawDocuments: [{ role: 'pdf', url, finalUrl: url, sha256, contentType: 'application/pdf', retrievedAt: '2026-09-18T10:00:00.000Z', byteLength: bytes.byteLength }],
    });
    const dry = await stageRawSources({ root, manifest: await readManifest(root), write: false });
    expect(dry).toMatchObject({ entries: 1, objects: 1, staged: 1, conflicts: [], missingCache: [] });
    expect((await readManifest(root)).entries[0]!.rawDocuments[0]!.archiveStatus).toBeUndefined();
    await stageRawSources({ root, manifest: await readManifest(root), write: true });
    const staged = (await readManifest(root)).entries[0]!.rawDocuments[0]!;
    expect(staged).toMatchObject({ archiveStatus: 'staged', bucket: 'landesrecht-quellen' });
    expect(staged.objectKey!.startsWith(`${KEY_PREFIX}landesrecht/`)).toBe(true);
    const memory = createMemoryR2Transport({ bucket: 'landesrecht-quellen' });
    const sync = await syncStaged({ root, manifest: await readManifest(root), transport: guardTransport(memory) });
    expect(sync).toMatchObject({ pending: 1, uploaded: 1, entriesVerified: 1, missingStaging: [] });
    expect((await readManifest(root)).entries[0]!.rawDocuments[0]!.archiveStatus).toBe('verified');
    const again = await stageRawSources({ root, manifest: await readManifest(root), write: true });
    expect(again).toMatchObject({ alreadyArchived: 1, staged: 0 });
    await expect(guardTransport(memory).put('west/recht-nrw/x.pdf', bytes, { contentType: 'application/pdf', metadata: {} })).rejects.toThrow(/nicht unter/u);
  });
});

describe('Einzelfassungen: abgelöste offene Fassung', () => {
  const unit = (nn: number, validFrom: string, versionDate: string, validTo?: string): UnitVersion => ({
    documentId: `jlr-NNLSH0000TESTNN${String(nn).padStart(11, '0')}`,
    nn,
    key: '§ 11',
    validFrom,
    versionDate,
    ...(validTo ? { validTo } : {}),
    parsed: {} as ParsedJurisPdf,
    layout: {} as UnitVersion['layout'],
    raw: { url: '', sha256: '', byteLength: 0, retrievedAt: '' },
  });

  it('wählt die später erlassene Fassung, wenn die frühere ohne Ende weitergeführt wird', () => {
    const selection = selectBaselineUnits([unit(23, '2021-08-01', '2020-10-23'), unit(24, '2021-08-01', '2021-09-30', '2026-07-31'), unit(25, '2026-08-01', '2026-05-29')]);
    expect(selection.problems).toEqual([]);
    expect(selection.selected.map((entry) => entry.nn)).toEqual([24]);
  });

  it('bleibt ein Befund, wenn beide Fassungen ein eigenes Ende tragen', () => {
    const selection = selectBaselineUnits([unit(1, '2021-01-01', '2020-10-23', '2025-01-01'), unit(2, '2022-01-01', '2021-09-30', '2026-01-01')]);
    expect(selection.problems[0]).toMatch(/2 Fassungen gelten zugleich/u);
  });
});
