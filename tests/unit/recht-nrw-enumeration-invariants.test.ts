/**
 * Invarianten der Enumeration (Rebuild ohne Netz, Fixtures) und Audit gegen den echten Enumerationsstand.
 *
 * Regression term:32801 (CoronaSchVO-Serie, echter LRGV-Bulk): Nach Bulk-Lauf und Rebuild trugen zwei aktive Einträge
 * dieselbe Quellidentität – `term:32801` (aus einem selbst zusammengeführten Stub wiederbelebt, mit veraltetem
 * Ergebnis) und `stem:…-coronavirus-0` (Restadressen außerhalb der Fassungsliste, die den Bearbeitungsstand des
 * früheren Stammeintrags erbten). Der Rebuild muss deterministisch genau einen aktiven Eintrag je Quellidentität
 * erzeugen, Restadressen erneut öffnen und den Stand aus dem Manifest nehmen, wenn kein aktiver Eintrag ihn trägt.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import {
  buildEnumeration,
  checkEnumerationInvariants,
  enumerationJsonText,
  enumerationStatusCounts,
  findDuplicateIdentities,
  statusForImportStatus,
  type BuildEnumerationInput,
  type EnumerationFile,
  type EnumerationItem,
  type SearchHit,
} from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { readManifest, type ImportManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';

const RV = 'https://recht.nrw.de/lrgv/rechtsverordnung';
const NOW_A = '2026-09-15T10:00:00.000Z';
const NOW_B = '2026-09-16T11:30:00.000Z';
const INDEX = 'state_law_and_regulations';

// Verordnungsserie wie CoronaSchVO/CoronaEinrVO: zwei Slug-Stämme, deren Fassungsadressen sich über Stammnormen mischen.
const EINR_1 = `${RV}/01102020-verordnung-einreise-1`;
const EINR_2 = `${RV}/30102020-verordnung-serie-0`;
const SERIE_A = `${RV}/19032022-verordnung-serie-0`;
const SERIE_B = `${RV}/01122021-verordnung-serie-0`;
const SERIE_C = `${RV}/30012021-verordnung-serie-0`;

function hit(url: string, nodeId: string, title: string, extra: Partial<SearchHit> = {}): SearchHit {
  return { nodeId, url, indexType: INDEX, title, ...extra };
}

function entry(sourceIdentity: string, urls: string[], overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    sourceSystem: 'recht-nrw', sourceArea: 'lrgv', sourceDocumentType: 'rechtsverordnung', sourceIdentity, sourceTitle: `Verordnung ${sourceIdentity}`, sourceType: 'rechtsverordnung', sourceUrl: urls[0]!,
    stemUrl: `https://recht.nrw.de/taxonomy/term/${sourceIdentity.slice(5)}`, sourceVersion: { url: urls[0]!, validFrom: '2020-10-30', validTo: '2020-11-08' }, selectedVersionUrl: urls[0]!, sourceValidFrom: '2020-10-30', sourceValidTo: '2020-11-08',
    baselineStatus: 'not-active-at-baseline', validityEvidence: [], retrievedAt: NOW_A, sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: 'recht-nrw-transformer/2.1.0',
    targetJurisdiction: 'west', targetSlug: '', baselineDate: '2023-12-01', importStatus: 'not-at-baseline', reviewStatus: 'none', reconstructionStatus: 'not-applicable', reconstructionSources: [], reconstructionSteps: [], importedAt: NOW_A, rawDocuments: [],
    versionsConsidered: urls.map((url, index) => ({ validFrom: `202${index}-01-01`, validTo: null, url, selected: index === 0 })), overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
    ...overrides,
  };
}

const manifestOf = (entries: ManifestEntry[]): ImportManifest => ({ schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries });

function input(overrides: Partial<BuildEnumerationInput> = {}): BuildEnumerationInput {
  return {
    area: 'lrgv',
    sitemap: { pages: 1, urls: [EINR_1, EINR_2, SERIE_A, SERIE_B, SERIE_C] },
    search: { total: 2, hits: [hit(EINR_2, '1', 'Coronaeinreiseverordnung', { effectiveFrom: '2020-10-30', historically: true }), hit(SERIE_A, '2', 'Coronaschutzverordnung', { effectiveFrom: '2022-03-19', historically: true })] },
    now: NOW_A,
    ...overrides,
  };
}

const byKey = (file: EnumerationFile, key: string): EnumerationItem => {
  const item = file.items.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Eintrag ${key} fehlt (vorhanden: ${file.items.map((candidate) => candidate.key).join(', ')})`);
  return item;
};
const active = (file: EnumerationFile, identity: string): EnumerationItem[] => file.items.filter((item) => !item.mergedInto && item.sourceIdentity === identity);

/**
 * Zustand nach dem echten Bulk (vereinfacht, wie bulk-runner.ts ihn hinterlässt): Der Stammeintrag `stem:…serie-0`
 * wurde über die Einstiegsadresse EINR_2 als term:32801 verarbeitet (Fassungsliste EINR_2 + EINR_1), der frühere
 * Eintrag `term:32801` (EINR_1) wurde in dieselbe Identität zusammengeführt (Stub mit veraltetem Ergebnis), die
 * übrigen Adressen des Slug-Stamms wurden als `@datum`-Eintrag abgetrennt (pending).
 */
function bulkStateAfterSeries(): EnumerationFile {
  const previous = buildEnumeration(input());
  const stem = byKey(previous, 'stem:rechtsverordnung/verordnung-serie-0');
  Object.assign(stem, { sourceIdentity: 'term:32801', status: 'done', attempts: 2, urls: [EINR_1, EINR_2], outcome: { importStatus: 'not-at-baseline', parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: 'recht-nrw-transformer/2.1.0' }, updatedAt: NOW_A, lastRunId: 'lauf-2' });
  const einr = byKey(previous, 'stem:rechtsverordnung/verordnung-einreise-1');
  Object.assign(einr, { key: 'term:32801', sourceIdentity: 'term:32801', mergedInto: 'term:32801', status: 'done', attempts: 2, outcome: { importStatus: 'needs-review', reviewCategories: ['metadata-conflict'], parserVersion: 'recht-nrw-parser/1.1.0', transformerVersion: 'recht-nrw-transformer/2.1.0' }, updatedAt: NOW_A, lastRunId: 'lauf-2' });
  previous.items.push({ ...stem, key: 'stem:rechtsverordnung/verordnung-serie-0@2021-01-30', urls: [SERIE_B, SERIE_A, SERIE_C].sort(), entryUrl: SERIE_A, status: 'pending', attempts: 0, titleSource: 'slug', signals: { sitemap: true, search: false } });
  const split = previous.items.at(-1)!;
  delete split.sourceIdentity;
  delete split.outcome;
  delete split.search;
  previous.items.sort((left, right) => left.key.localeCompare(right.key));
  return previous;
}

describe('Enumeration: Regression term:32801 (eine Term-ID, ein aktiver Eintrag)', () => {
  const manifest = manifestOf([entry('term:32801', [EINR_2, EINR_1])]);

  it('führt nach dem Bulk genau einen aktiven Eintrag term:32801 mit dem Stand des aktiven Vorgängers; Restadressen beginnen erneut offen', () => {
    const previous = bulkStateAfterSeries();
    expect(findDuplicateIdentities(previous)).toEqual([]);
    const rebuilt = buildEnumeration(input({ previous, manifest, now: NOW_B }));

    expect(rebuilt.crosscheck.ok).toBe(true);
    expect(rebuilt.crosscheck.duplicateIdentities).toBe(0);
    expect(findDuplicateIdentities(rebuilt)).toEqual([]);
    expect(checkEnumerationInvariants(rebuilt, { manifestIdentities: new Set(['term:32801']) })).toEqual([]);
    expect(active(rebuilt, 'term:32801')).toHaveLength(1);

    const term = byKey(rebuilt, 'term:32801');
    // Beide Fassungsadressen der Stammnorm (verschiedene Slug-Stämme) hängen am Term; der Stub überdeckt den aktiven Stand nicht.
    expect(term).toMatchObject({ sourceIdentity: 'term:32801', status: 'done', attempts: 2, urls: [EINR_1, EINR_2], entryUrl: EINR_2, title: 'Coronaeinreiseverordnung', outcome: { importStatus: 'not-at-baseline' }, lastRunId: 'lauf-2' });
    expect(term.mergedInto).toBeUndefined();

    // Restadressen außerhalb der Fassungsliste von term:32801: kein geerbter Stand, keine geerbte Identität.
    const rest = byKey(rebuilt, 'stem:rechtsverordnung/verordnung-serie-0');
    expect(rest).toMatchObject({ status: 'pending', attempts: 0, urls: [SERIE_B, SERIE_A, SERIE_C].sort(), entryUrl: SERIE_A, title: 'Coronaschutzverordnung' });
    expect(rest.sourceIdentity).toBeUndefined();
    expect(rest.outcome).toBeUndefined();
    expect(rest.lastRunId).toBeUndefined();
    expect(rebuilt.crosscheck.notes).toContain('stem:rechtsverordnung/verordnung-serie-0: 3 Restadresse(n) außerhalb der Fassungsliste von term:32801; Eintrag beginnt erneut offen');
    expect(enumerationStatusCounts(rebuilt)).toEqual({ pending: 1, processing: 0, done: 1, review: 0, failed: 0, excluded: 0 });
  });

  it('ist idempotent: ein zweiter Rebuild über dem reparierten Stand ändert nichts', () => {
    const first = buildEnumeration(input({ previous: bulkStateAfterSeries(), manifest, now: NOW_B }));
    const second = buildEnumeration(input({ previous: first, manifest, now: '2026-09-17T00:00:00.000Z' }));
    expect(second.items).toEqual(first.items);
    // Nur der Hinweis auf die einmalige Reparatur entfällt; die Einträge sind byteidentisch.
    const withoutRepairNotes = (file: EnumerationFile): string => enumerationJsonText({ ...file, generatedAt: '', contentFingerprint: '', crosscheck: { ...file.crosscheck, notes: file.crosscheck.notes.filter((note) => !note.includes('Restadresse')) } });
    expect(withoutRepairNotes(second)).toBe(withoutRepairNotes(first));
    expect(second.crosscheck.notes.filter((note) => note.includes('Restadresse'))).toEqual([]);
    const third = buildEnumeration(input({ previous: second, manifest, now: '2026-09-18T00:00:00.000Z' }));
    expect(enumerationJsonText(third)).toBe(enumerationJsonText(second));
  });

  it('zwei aktive Einträge derselben Identität im Eingang (echter fehlerhafter Stand): der zum Manifest passende trägt den Stand, Adressen jenseits der Fassungsliste fallen zum Slug-Stamm zurück', () => {
    // Der fehlerhafte echte Zustand nach dem früheren Rebuild: `term:32801` reaktiviert (done/needs-review, EINR_1) neben dem
    // aktiven Stammeintrag (done/not-at-baseline), der alle Adressen des Slug-Stamms – auch fremde – geerbt hat.
    const broken = bulkStateAfterSeries();
    broken.items = broken.items.filter((item) => !item.key.includes('@'));
    const stub = byKey(broken, 'term:32801');
    delete stub.mergedInto;
    stub.urls = [EINR_1];
    byKey(broken, 'stem:rechtsverordnung/verordnung-serie-0').urls = [SERIE_B, SERIE_A, SERIE_C, EINR_2].sort();
    expect(findDuplicateIdentities(broken)).toEqual([{ sourceIdentity: 'term:32801', keys: ['stem:rechtsverordnung/verordnung-serie-0', 'term:32801'] }]);
    expect(checkEnumerationInvariants(broken)).toEqual(['term:32801: 2 aktive Einträge (stem:rechtsverordnung/verordnung-serie-0, term:32801)']);

    const repaired = buildEnumeration(input({ previous: broken, manifest, now: NOW_B }));
    expect(findDuplicateIdentities(repaired)).toEqual([]);
    expect(byKey(repaired, 'term:32801')).toMatchObject({ status: 'done', attempts: 2, urls: [EINR_1, EINR_2], outcome: { importStatus: 'not-at-baseline' } });
    expect(byKey(repaired, 'stem:rechtsverordnung/verordnung-serie-0')).toMatchObject({ status: 'pending', attempts: 0, urls: [SERIE_B, SERIE_A, SERIE_C].sort() });
    expect(byKey(repaired, 'stem:rechtsverordnung/verordnung-serie-0').sourceIdentity).toBeUndefined();
    expect(checkEnumerationInvariants(repaired, { manifestIdentities: new Set(['term:32801']) })).toEqual([]);
    expect(repaired.crosscheck.ok).toBe(true);
  });

  it('ohne Manifest gilt der erste aktive Eintrag; der Stub wird nie bevorzugt', () => {
    const rebuilt = buildEnumeration(input({ previous: bulkStateAfterSeries(), now: NOW_B }));
    expect(active(rebuilt, 'term:32801')).toHaveLength(1);
    expect(byKey(rebuilt, 'term:32801')).toMatchObject({ status: 'done', outcome: { importStatus: 'not-at-baseline' } });
  });
});

describe('Enumeration: Invarianten des Rebuilds', () => {
  it('mehrere historische Adressen derselben Term-ID (auch über Slugwechsel) ergeben einen Eintrag mit allen Adressen', () => {
    const OLD = `${RV}/01012010-alte-bezeichnung`;
    const MID = `${RV}/01012015-alte-bezeichnung`;
    const NEW = `${RV}/01012020-neue-bezeichnung`;
    const manifest = manifestOf([entry('term:7', [NEW, MID, OLD])]);
    const first = buildEnumeration(input({ sitemap: { pages: 1, urls: [OLD, MID, NEW] }, search: { total: 1, hits: [hit(NEW, '9', 'Neue Bezeichnung')] }, manifest }));
    expect(first.items.map((item) => [item.key, item.urls])).toEqual([['term:7', [OLD, MID, NEW]]]);
    // Zweiter Lauf mit Bearbeitungsstand: kein zweiter Eintrag, kein Verlust.
    Object.assign(first.items[0]!, { status: 'done', attempts: 1, outcome: { importStatus: 'not-at-baseline' } });
    const second = buildEnumeration(input({ sitemap: { pages: 1, urls: [NEW, OLD, MID] }, search: { total: 1, hits: [hit(NEW, '9', 'Neue Bezeichnung')] }, manifest, previous: first, now: NOW_B }));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ key: 'term:7', status: 'done', attempts: 1, urls: [OLD, MID, NEW], outcome: { importStatus: 'not-at-baseline' } });
    expect(second.contentFingerprint).toBe(buildEnumeration(input({ sitemap: { pages: 1, urls: [OLD, MID, NEW] }, search: { total: 1, hits: [hit(NEW, '9', 'Neue Bezeichnung')] }, manifest, previous: first, now: NOW_B })).contentFingerprint);
  });

  it('verliert keinen Fortschritt: Status, Versuche, Fehler, Ergebnis und Quellidentität überleben den Rebuild – auch not-at-baseline bleibt stabil', () => {
    const urls = ['done', 'review', 'failed', 'excluded', 'nab'].map((name) => `${RV}/01012020-${name}-verordnung`);
    const hits = urls.map((url, index) => hit(url, String(index + 1), `Verordnung ${index + 1}`));
    const first = buildEnumeration(input({ sitemap: { pages: 1, urls }, search: { total: 5, hits } }));
    const item = (name: string): EnumerationItem => byKey(first, `stem:rechtsverordnung/${name}-verordnung`);
    Object.assign(item('done'), { sourceIdentity: 'term:1', status: 'done', attempts: 1, outcome: { importStatus: 'imported', targetSlug: 'eins-west' } });
    Object.assign(item('review'), { sourceIdentity: 'term:2', status: 'review', attempts: 2, outcome: { importStatus: 'needs-review', reviewCategories: ['other'] } });
    Object.assign(item('failed'), { status: 'failed', attempts: 3, lastError: { code: 'http', message: 'HTTP 500' } });
    Object.assign(item('excluded'), { sourceIdentity: 'term:4', status: 'excluded', attempts: 1, outcome: { importStatus: 'excluded' } });
    Object.assign(item('nab'), { sourceIdentity: 'term:5', status: 'done', attempts: 1, outcome: { importStatus: 'not-at-baseline' } });
    const manifest = manifestOf([entry('term:1', [urls[0]!], { importStatus: 'imported', targetSlug: 'eins-west' }), entry('term:2', [urls[1]!], { importStatus: 'needs-review' }), entry('term:4', [urls[3]!], { importStatus: 'excluded' }), entry('term:5', [urls[4]!])]);

    let file = first;
    for (const now of [NOW_B, '2026-09-17T00:00:00.000Z']) {
      file = buildEnumeration(input({ sitemap: { pages: 1, urls }, search: { total: 5, hits }, manifest, previous: file, now }));
      expect(checkEnumerationInvariants(file, { manifestIdentities: new Set(manifest.entries.map((candidate) => candidate.sourceIdentity)) })).toEqual([]);
      expect(byKey(file, 'term:1')).toMatchObject({ status: 'done', attempts: 1, outcome: { importStatus: 'imported', targetSlug: 'eins-west' } });
      expect(byKey(file, 'term:2')).toMatchObject({ status: 'review', attempts: 2, outcome: { reviewCategories: ['other'] } });
      expect(byKey(file, 'stem:rechtsverordnung/failed-verordnung')).toMatchObject({ status: 'failed', attempts: 3, lastError: { code: 'http' } });
      expect(byKey(file, 'term:4')).toMatchObject({ status: 'excluded', attempts: 1 });
      expect(byKey(file, 'term:5')).toMatchObject({ status: 'done', attempts: 1, outcome: { importStatus: 'not-at-baseline' } });
      expect(enumerationStatusCounts(file)).toEqual({ pending: 0, processing: 0, done: 2, review: 1, failed: 1, excluded: 1 });
    }
  });

  it('nimmt den Stand aus dem Manifest, wenn nur ein zusammengeführter Stub oder gar kein Eintrag die Term-ID trägt', () => {
    const A = `${RV}/01012020-alpha-verordnung`;
    const B = `${RV}/01012021-beta-verordnung`;
    // Stub `stem:beta` zusammengeführt in term:9; term:9 hat keinen aktiven Eintrag mehr (wie term:33409 im echten Bulk).
    const previous = buildEnumeration(input({ sitemap: { pages: 1, urls: [A, B] }, search: { total: 0, hits: [] } }));
    Object.assign(byKey(previous, 'stem:rechtsverordnung/beta-verordnung'), { mergedInto: 'term:9', status: 'done' });
    const manifest = manifestOf([entry('term:9', [B], { importStatus: 'needs-review' }), entry('term:8', [A], { importStatus: 'failed' })]);
    const rebuilt = buildEnumeration(input({ sitemap: { pages: 1, urls: [A, B] }, search: { total: 0, hits: [] }, manifest, previous, now: NOW_B }));
    expect(byKey(rebuilt, 'term:9')).toMatchObject({ sourceIdentity: 'term:9', status: 'review', attempts: 0, outcome: { importStatus: 'needs-review', parserVersion: 'recht-nrw-parser/1.1.0' } });
    expect(byKey(rebuilt, 'term:8')).toMatchObject({ sourceIdentity: 'term:8', status: 'failed', outcome: { importStatus: 'failed' } });
    expect(rebuilt.items.filter((item) => item.mergedInto)).toEqual([]);
    expect(checkEnumerationInvariants(rebuilt, { manifestIdentities: new Set(['term:8', 'term:9']) })).toEqual([]);
    for (const [importStatus, status] of [['imported', 'done'], ['imported-with-warnings', 'done'], ['not-at-baseline', 'done'], ['dry-run', 'done'], ['needs-review', 'review'], ['excluded', 'excluded'], ['failed', 'failed']] as const) expect(statusForImportStatus(importStatus)).toBe(status);
  });

  it('öffnet einen Stub erneut, dessen Zielidentität weder aktiv noch im Manifest ist (kein stilles Verschwinden)', () => {
    const A = `${RV}/01012020-alpha-verordnung`;
    const B = `${RV}/01012021-alpha-verordnung`;
    const previous = buildEnumeration(input({ sitemap: { pages: 1, urls: [A, B] }, search: { total: 0, hits: [] } }));
    Object.assign(byKey(previous, 'stem:rechtsverordnung/alpha-verordnung'), { mergedInto: 'term:77', status: 'done', attempts: 1 });
    // Beide Adressen sind zusätzlich zwei fremden Termen zugeordnet (Konflikt) – sie bleiben beim Slug-Stamm.
    const manifest = manifestOf([entry('term:1', [A, B]), entry('term:2', [A, B])]);
    const rebuilt = buildEnumeration(input({ sitemap: { pages: 1, urls: [A, B] }, search: { total: 0, hits: [] }, manifest, previous, now: NOW_B }));
    expect(byKey(rebuilt, 'stem:rechtsverordnung/alpha-verordnung')).toMatchObject({ status: 'pending', attempts: 0, urls: [A, B] });
    expect(byKey(rebuilt, 'stem:rechtsverordnung/alpha-verordnung').mergedInto).toBeUndefined();
    expect(rebuilt.crosscheck.notes).toContain('stem:rechtsverordnung/alpha-verordnung: Zusammenführung in term:77 ohne aktiven Eintrag und ohne Manifesteintrag; Eintrag beginnt erneut offen');
    expect(checkEnumerationInvariants(rebuilt, { manifestIdentities: new Set(['term:1', 'term:2']) })).toEqual([]);
    // Ist das Ziel im Manifest, bleibt der Stub bestehen und das Ziel wird aus dem Manifest geführt.
    const withTarget = buildEnumeration(input({ sitemap: { pages: 1, urls: [A, B] }, search: { total: 0, hits: [] }, manifest: manifestOf([...manifest.entries, entry('term:77', [A])]), previous, now: NOW_B }));
    expect(byKey(withTarget, 'stem:rechtsverordnung/alpha-verordnung')).toMatchObject({ mergedInto: 'term:77', status: 'done' });
    expect(byKey(withTarget, 'term:77')).toMatchObject({ titleSource: 'manifest', status: 'done', outcome: { importStatus: 'not-at-baseline' } });
    expect(checkEnumerationInvariants(withTarget, { manifestIdentities: new Set(['term:1', 'term:2', 'term:77']) })).toEqual([]);
  });

  it('meldet verletzte Invarianten: Dubletten, Stub ohne Ziel, rekursive Abtrennungsschlüssel, widersprüchliche Identität, unbekannter Status', () => {
    const file = buildEnumeration(input());
    const [first, second] = file.items as [EnumerationItem, EnumerationItem];
    Object.assign(first, { sourceIdentity: 'term:1', status: 'done' });
    Object.assign(second, { sourceIdentity: 'term:1', status: 'review' });
    file.items.push({ ...first, key: 'stem:x@2020-01-01@2021-01-01', sourceIdentity: 'term:3', mergedInto: 'term:2', status: 'weird' as EnumerationItem['status'] });
    const problems = checkEnumerationInvariants(file, { manifestIdentities: new Set() });
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^term:1: 2 aktive Einträge/u),
      'stem:x@2020-01-01@2021-01-01: zusammengeführt in term:2, aber kein aktiver Eintrag und kein Manifesteintrag mit dieser Quellidentität',
      'stem:x@2020-01-01@2021-01-01: rekursiv gewachsener Abtrennungsschlüssel',
      'stem:x@2020-01-01@2021-01-01: unbekannter Status weird',
      'stem:x@2020-01-01@2021-01-01: Quellidentität term:3 widerspricht der Zusammenführung in term:2',
    ]));
    expect(checkEnumerationInvariants(buildEnumeration(input()))).toEqual([]);
  });
});

describe('Enumeration: Audit gegen den echten Stand (data/imports/recht-nrw)', () => {
  const root = resolveRepositoryRoot();

  /**
   * Dokumentierte, noch nicht reparierte Befunde im echten Stand. Ein Befund außerhalb dieser Liste ist ein Testfehler;
   * die Reparatur erfolgt ausschließlich über den Rebuild (`npm run import:recht-nrw:enumerate -- --area lrgv --write`,
   * benötigt Netz für Sitemap und Suchindex). Nach der Reparatur ist die Liste zu leeren.
   */
  const KNOWN_PROBLEMS: Record<string, readonly string[]> = {
    // Die Dublette term:32801 wurde am 2026-09-17 durch den korrigierten Rebuild (offline, aus dem Cache) aufgelöst.
    lrgv: [],
    lrmb: [],
  };

  it.each(['lrgv', 'lrmb'] as const)('%s: keine unbekannten Dubletten, Stubs ohne Ziel oder rekursiven Schlüssel; Statussumme = aktive Einträge', async (area) => {
    const text = await readFile(join(root, 'data', 'imports', 'recht-nrw', `enumeration-${area}.json`), 'utf8').catch(() => undefined);
    if (!text) return;
    const file = JSON.parse(text) as EnumerationFile;
    const manifest = await readManifest(root);
    const problems = checkEnumerationInvariants(file, { manifestIdentities: new Set(manifest.entries.filter((candidate) => candidate.sourceArea === area).map((candidate) => candidate.sourceIdentity)) });
    expect(problems).toEqual([...KNOWN_PROBLEMS[area]!]);
    const activeItems = file.items.filter((item) => !item.mergedInto);
    expect(Object.values(enumerationStatusCounts(file)).reduce((sum, value) => sum + value, 0)).toBe(activeItems.length);
    expect(file.items.every((item) => (item.key.match(/@/gu) ?? []).length <= 1)).toBe(true);
    // Jede Adresse gehört zu höchstens einem aktiven regulären Eintrag (aus dem Manifest geführte Terme ausgenommen;
    // zusammengeführte Stubs behalten ihre Adressen neben dem Zieleintrag).
    const assigned = new Map<string, string[]>();
    for (const item of activeItems) if (item.titleSource !== 'manifest') for (const url of item.urls) assigned.set(url, [...(assigned.get(url) ?? []), item.key]);
    expect([...assigned.entries()].filter(([, keys]) => keys.length > 1)).toEqual([]);
  });
});
