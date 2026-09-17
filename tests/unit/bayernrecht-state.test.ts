/**
 * Zustand des BAYERN.RECHT-Adapters (Freistaat Bayern → Simulationsland BayWü): Manifest mit
 * BayRS-Gliederungsnummer, Pfadableitung, Slug-Registry, Review-Queue, Evidenzregeln und CLI-Gerüst.
 * Alles ohne Netz und ausschließlich in temporären Verzeichnissen – der echte Bestand wird nie angefasst,
 * und die eingefrorenen Bestände West und NSH werden nur lesend zum Trennungsnachweis herangezogen.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { CorruptStateError } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { readReviewQueue as readWestReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { emptyReviewQueue as emptyNshReviewQueue, mergeReviewItems as mergeNshReviewItems, readReviewQueue as readNshReviewQueue, writeReviewShard as writeNshReviewShard } from '@landesrecht/importer-juris-sh/common/review.ts';

import { runCli, COMMAND_HELP, COMMANDS, IMPLEMENTED_COMMANDS, parseCliArguments, renderHelp } from '@landesrecht/importer-bayernrecht/cli.ts';
import { BASELINE_DATE, SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { assessBaselineValidity, validateValidityEvidence, type ValidityEvidence } from '@landesrecht/importer-bayernrecht/common/evidence.ts';
import { readManifest, readManifestEntry, validateManifestEntry, writeManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import { compareSourceIdentity, enumerationPath, identityFileName, isBayRsNumber, manifestEntryPath, normalizeBayRsNumber, reviewShardPath, runReportPath, unresolvedSourcePath } from '@landesrecht/importer-bayernrecht/common/paths.ts';
import { assertArchiveAllowed, loadImportEnvironment, slugReservationFor } from '@landesrecht/importer-bayernrecht/common/environment.ts';
import { emptyReviewQueue, mergeReviewItems, readReviewQueue, reviewItemId, writeReviewShard, type ReviewItemInput } from '@landesrecht/importer-bayernrecht/common/review.ts';
import { assertJurisdictionSlug, createSlugReserver, emptySlugRegistry, jurisdictionSlugCandidate, validateSlugRegistry } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';

import { cleanupTempRoots, sampleManifestEntry, SAMPLE_BAYRS_NUMBER, SAMPLE_IDENTITY, strongEvidence, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

describe('Manifest des BayWü-Bestands', () => {
  it('schreibt und liest einen Eintrag verlustfrei (Roundtrip, Datei je Stammnorm)', async () => {
    const root = await tempRoot();
    const entry = sampleManifestEntry({ importedAt: '2026-09-17T10:00:00.000Z', runId: 'lauf-1' });
    const written = await writeManifestEntry(root, entry);
    expect(written.path).toBe(`data/imports/bayernrecht/manifest/landesrecht/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(written.changed).toBe(true);
    expect(await readManifestEntry(root, 'landesrecht', SAMPLE_IDENTITY)).toEqual(entry);
    const manifest = await readManifest(root);
    expect(manifest).toMatchObject({ schemaVersion: 'bayernrecht-import-manifest/1', sourceSystem: SOURCE_SYSTEM, baselineDate: BASELINE_DATE });
    expect(manifest.entries).toEqual([entry]);
    const shard = JSON.parse(await readFile(join(root, written.path), 'utf8')) as { schemaVersion: string; entry: { bayRsNumber: string } };
    expect(shard.schemaVersion).toBe('bayernrecht-import-manifest-entry/1');
    expect(shard.entry.bayRsNumber).toBe(SAMPLE_BAYRS_NUMBER);
  });

  it('behält Laufmetadaten bei unverändertem Inhalt (kein Diff im Wiederholungslauf)', async () => {
    const root = await tempRoot();
    await writeManifestEntry(root, sampleManifestEntry({ importedAt: '2026-09-17T10:00:00.000Z', runId: 'lauf-1' }));
    const second = await writeManifestEntry(root, sampleManifestEntry({ importedAt: '2026-09-18T11:00:00.000Z', runId: 'lauf-2' }));
    expect(second.changed).toBe(false);
    expect(await readManifestEntry(root, 'landesrecht', SAMPLE_IDENTITY)).toMatchObject({ importedAt: '2026-09-17T10:00:00.000Z', runId: 'lauf-1' });
    const changed = await writeManifestEntry(root, sampleManifestEntry({ importedAt: '2026-09-18T11:00:00.000Z', runId: 'lauf-2', sourceTitle: 'Geändertes Testgesetz' }));
    expect(changed.changed).toBe(true);
    expect(await readManifestEntry(root, 'landesrecht', SAMPLE_IDENTITY)).toMatchObject({ runId: 'lauf-2' });
  });

  it('führt die BayRS-Gliederungsnummer als Identitätshinweis und prüft sie hart', () => {
    expect(validateManifestEntry(sampleManifestEntry())).toEqual([]);
    // Verwaltungsvorschriften und Verkündungsereignisse führen keine BayRS-Nummer: Feld weglassen ist zulässig.
    const withoutNumber = sampleManifestEntry({ sourceArea: 'vwv' });
    delete withoutNumber.bayRsNumber;
    expect(validateManifestEntry(withoutNumber)).toEqual([]);
    expect(validateManifestEntry(sampleManifestEntry({ bayRsNumber: '26.2' }))).toEqual([]);
    expect(validateManifestEntry(sampleManifestEntry({ bayRsNumber: 'BayRS 2038-3-4-1' }))).toEqual([]);
    expect(validateManifestEntry(sampleManifestEntry({ bayRsNumber: 'Art. 5 Abs. 1' })).join(' ')).toContain('keine BayRS-Gliederungsnummer');
    expect(validateManifestEntry(sampleManifestEntry({ bayRsNumber: '' })).join(' ')).toContain('bayRsNumber ist gesetzt, aber leer');
  });

  it('führt die BayWü-eigenen Felder (baselineRecoveryMethod, sourceProvenance) und prüft sie hart', () => {
    expect(validateManifestEntry(sampleManifestEntry({ baselineRecoveryMethod: 'reverse-post-baseline-event' }))).toEqual([]);
    // Der NSH-Wert `historical-juris-version` heißt hier `portal-historical-version` und gilt nicht.
    expect(validateManifestEntry({ ...sampleManifestEntry(), baselineRecoveryMethod: 'historical-juris-version' }).join(' ')).toContain('baselineRecoveryMethod');
    expect(validateManifestEntry({ ...sampleManifestEntry(), sourceProvenance: { publicationAuthority: 'hearsay', digitalRepresentation: 'born-digital' } }).join(' ')).toContain('publicationAuthority');
    expect(validateManifestEntry({ ...sampleManifestEntry(), sourceProvenance: undefined }).join(' ')).toContain('sourceProvenance fehlt');
  });

  it('weist Schemaverstöße mit klarer Meldung zurück, statt sie stillschweigend zu übernehmen', async () => {
    const root = await tempRoot();
    const cases: Array<[Partial<Record<string, unknown>>, string]> = [
      [{ sourceSystem: 'recht-nrw' }, 'sourceSystem'],
      [{ sourceSystem: 'juris-sh' }, 'sourceSystem'],
      [{ targetJurisdiction: 'nsh' }, 'targetJurisdiction'],
      [{ sourceArea: 'lrgv' }, 'sourceArea'],
      [{ baselineDate: '2020-01-01' }, 'baselineDate'],
      [{ sha256: 'zz' }, 'sha256'],
      [{ sourceValidFrom: '01.01.2020' }, 'sourceValidFrom'],
      [{ sourceValidTo: '2019-01-01' }, 'sourceValidTo liegt vor sourceValidFrom'],
      [{ targetSlug: 'Testgesetz BayWue' }, 'targetSlug'],
      [{ importStatus: 'excluded' }, 'nicht übernommener Eintrag'],
      [{ importStatus: 'imported', baselineStatus: 'undetermined' }, 'übernommener Eintrag mit baselineStatus'],
      [{ validityEvidence: [{ kind: 'unbekannt', dimension: 'begin', strength: 'strong', statement: 'x' }] }, 'unbekannte Belegart'],
      [{ rawDocuments: [{ role: 'version-page', url: 'u', finalUrl: 'u', sha256: 'a'.repeat(64), contentType: 'text/html', retrievedAt: 'jetzt', byteLength: 1, archiveStatus: 'staged' }] }, 'objectKey'],
    ];
    for (const [patch, expected] of cases) {
      const problems = validateManifestEntry({ ...sampleManifestEntry(), ...patch });
      expect(problems.join(' | '), `Erwartet Problem „${expected}“`).toContain(expected);
      await expect(writeManifestEntry(root, { ...sampleManifestEntry(), ...patch } as never)).rejects.toThrow(/ist ungültig/u);
    }
    expect(await readdir(join(root, 'data')).catch(() => [])).toEqual([]);
  });

  it('erkennt beschädigte und falsch abgelegte Zustandsdateien beim Lesen', async () => {
    const root = await tempRoot();
    const directory = join(root, 'data', 'imports', 'bayernrecht', 'manifest', 'landesrecht');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${identityFileName(SAMPLE_IDENTITY)}.json`), '{ kaputt');
    await expect(readManifest(root)).rejects.toBeInstanceOf(CorruptStateError);
    await writeFile(join(directory, `${identityFileName(SAMPLE_IDENTITY)}.json`), JSON.stringify({ schemaVersion: 'bayernrecht-import-manifest-entry/1', entry: sampleManifestEntry({ sourceIdentity: 'jlr-Anderes' }) }));
    await expect(readManifest(root)).rejects.toThrow(/Dateiname passt nicht zur Quellidentität/u);
  });
});

describe('Pfadableitung (BayRS-tauglich)', () => {
  it('entschärft Punkte, Schrägstriche und Buchstaben der Gliederungsnummern', () => {
    for (const identity of ['BayRS 2170-1-1-I', '2038-3-4-1/2', '26.2', '../../etc/passwd', 'Ä/Ö\\Ü:*?"<>|', 'x'.repeat(200)]) {
      const name = identityFileName(identity);
      expect(name).toBe(identityFileName(identity));
      expect(name).toMatch(/^[a-z0-9][a-z0-9-]*$/u);
      expect(name.length).toBeLessThanOrEqual(61);
      expect(name.startsWith('.')).toBe(false);
      expect(name).not.toContain('..');
      expect(name).not.toContain('/');
    }
    // Zwei Schreibweisen derselben Gliederung ergeben dasselbe Label, aber nie denselben Dateinamen.
    expect(identityFileName('BayRS 2170.1.1')).not.toBe(identityFileName('BayRS 2170-1-1'));
    expect(identityFileName('BayRS 2170.1.1').startsWith('bayrs-2170-1-1-')).toBe(true);
    // Gemischte Schreibung unterscheidet Dateien nicht (macOS, Windows): der Hashteil trägt die Unterscheidung.
    expect(identityFileName('jlr-Test')).not.toBe(identityFileName('jlr-test'));
    for (const empty of ['', '   ']) expect(() => identityFileName(empty)).toThrow(/leer/u);
  });

  it('erkennt und normalisiert amtliche BayRS-Gliederungsnummern', () => {
    for (const number of ['2170-1-1-I', 'BayRS 2170-1-1-I', '26.2', '2038-3-4-1/2', '2']) expect(isBayRsNumber(number), number).toBe(true);
    for (const wrong of ['', 'Art. 5', 'GVBl. 2020 S. 1', '-2170', 'BayRS']) expect(isBayRsNumber(wrong), wrong).toBe(false);
    expect(normalizeBayRsNumber('BayRS 2170.1.1-i')).toBe('2170-1-1-I');
    expect(normalizeBayRsNumber('2038-3-4-1/2')).toBe('2038-3-4-1-2');
    expect(() => normalizeBayRsNumber('Art. 5')).toThrow(/keine BayRS-Gliederungsnummer/u);
  });

  it('legt jeden Bereich getrennt unter data/imports bzw. data/audits ab', () => {
    expect(manifestEntryPath('vwv', SAMPLE_IDENTITY)).toBe(`data/imports/bayernrecht/manifest/vwv/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(reviewShardPath('events', SAMPLE_IDENTITY)).toBe(`data/imports/bayernrecht/review/events/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(enumerationPath('landesrecht')).toBe('data/imports/bayernrecht/enumeration-landesrecht.json');
    expect(unresolvedSourcePath('landesrecht', 'https://example.invalid/a')).toMatch(/^data\/audits\/bayernrecht\/landesrecht\/unresolved\/[0-9a-f]{16}\.json$/u);
    expect(unresolvedSourcePath('landesrecht', 'https://example.invalid/a')).not.toBe(unresolvedSourcePath('landesrecht', 'https://example.invalid/b'));
    expect(runReportPath('lauf-2026-09-17')).toBe('data/audits/bayernrecht/runs/lauf-2026-09-17.json');
    expect(() => runReportPath('../../etc/passwd')).toThrow(/Ungültige Lauf-ID/u);
    expect(() => manifestEntryPath('lrgv' as never, SAMPLE_IDENTITY)).toThrow(/Unbekannter Quellbereich/u);
    // Kein Pfad des BayWü-Adapters zeigt in einen der eingefrorenen Bestände.
    for (const path of [manifestEntryPath('landesrecht', SAMPLE_IDENTITY), reviewShardPath('vwv', SAMPLE_IDENTITY), enumerationPath('vwv'), runReportPath('lauf-1')]) {
      expect(path).not.toContain('recht-nrw');
      expect(path).not.toContain('juris-sh');
    }
  });

  it('sortiert Quellidentitäten deterministisch und mit natürlicher Zahlenordnung', () => {
    expect(['2170-1-10', '2170-1-2', '2170-1-1'].sort(compareSourceIdentity)).toEqual(['2170-1-1', '2170-1-2', '2170-1-10']);
    expect(compareSourceIdentity('gleich', 'gleich')).toBe(0);
  });
});

describe('Slug-Registry (Jurisdiktionskonvention -baywue)', () => {
  it('führt den Landeszusatz -baywue statt der realen Kürzel Bayerns', () => {
    expect(jurisdictionSlugCandidate('LStVG-Bayern')).toBe('lstvg-baywue');
    expect(jurisdictionSlugCandidate('BayBG-BY')).toBe('baybg-baywue');
    expect(jurisdictionSlugCandidate('Wassergesetz Bay')).toBe('wassergesetz-baywue');
    expect(jurisdictionSlugCandidate('Straßen- und Wegegesetz Bayern')).toBe('strassen-und-wegegesetz-baywue');
    expect(jurisdictionSlugCandidate('gemo-baywue')).toBe('gemo-baywue');
    // Ausgeschriebener Name des Simulationslandes ist kein Quellzusatz und bleibt stehen.
    expect(jurisdictionSlugCandidate('Verfassung des Freistaates Bayern-Württemberg')).toBe('verfassung-des-freistaates-bayern-wuerttemberg');
    // Der reale Portalname taucht im Slug nie auf, wenn er als Landeszusatz gemeint war.
    expect(jurisdictionSlugCandidate('BayVwVfG')).toBe('bayvwvfg');
  });

  it('behandelt -bay, -by und -bayern als harte Fehler, nicht als stille Korrektur', () => {
    for (const forbidden of ['lstvg-bay', 'lstvg-by', 'lstvg-bayern']) {
      expect(() => assertJurisdictionSlug(forbidden), forbidden).toThrow(/statt -baywue/u);
      expect(() => validateSlugRegistry({ ...emptySlugRegistry(), entries: [{ slug: forbidden, sourceIdentity: 'a', candidate: forbidden, assignment: 'derived' }] }), forbidden).toThrow(/statt -baywue/u);
    }
    expect(assertJurisdictionSlug('lstvg-baywue')).toBe('lstvg-baywue');
    expect(() => assertJurisdictionSlug('LStVG BayWue')).toThrow(/nicht wohlgeformt/u);
    expect(() => validateSlugRegistry({ ...emptySlugRegistry(), jurisdiction: 'nsh' as never })).toThrow(/erwartet baywue/u);
  });

  it('reserviert stabil und löst Kollisionen deterministisch mit Suffix auf', () => {
    const registry = emptySlugRegistry();
    const reserver = createSlugReserver(registry, new Set(['fremder-slug-baywue']));
    expect(reserver.reserve('jlr-A', 'LStVG-Bayern')).toMatchObject({ slug: 'lstvg-baywue', newlyReserved: true });
    const collision = reserver.reserve('jlr-B', 'lstvg-by');
    expect(collision.slug).toMatch(/^lstvg-baywue-[0-9a-f]{8}$/u);
    expect(collision.collision).toMatchObject({ candidate: 'lstvg-baywue', heldBy: 'jlr-A' });
    expect(reserver.reserve('jlr-C', 'fremder-slug-baywue').collision).toMatchObject({ heldBy: 'nicht registriertes Verzeichnis' });
    const again = reserver.reserve('jlr-A', 'Landesstraf- und Verordnungsgesetz');
    expect(again).toMatchObject({ slug: 'lstvg-baywue', newlyReserved: false });
    expect(again.candidateChanged).toMatchObject({ previous: 'lstvg-baywue', current: 'landesstraf-und-verordnungsgesetz' });
    // Wiederholung mit demselben Ausgangszustand ergibt dieselben Slugs.
    const repeat = createSlugReserver(emptySlugRegistry(), new Set());
    expect([repeat.reserve('jlr-A', 'LStVG-Bayern').slug, repeat.reserve('jlr-B', 'lstvg-by').slug]).toEqual(['lstvg-baywue', collision.slug]);
    validateSlugRegistry(registry);
  });
});

describe('Importumgebung', () => {
  it('lädt leeren Zustand, bindet das Archiv an das BayWü-Präfix und stagt außerhalb von Git', async () => {
    const root = await tempRoot();
    const environment = await loadImportEnvironment(root, { mode: 'bulk', runId: 'lauf-1' });
    expect(environment).toMatchObject({ mode: 'bulk', projection: 'record-only', runId: 'lauf-1' });
    expect(environment.manifest.entries).toEqual([]);
    expect(environment.reviewQueue.items).toEqual([]);
    expect(environment.slugRegistry.jurisdiction).toBe(TARGET_JURISDICTION);
    expect(environment.archive).toMatchObject({ mode: 'staging', prefix: `${TARGET_JURISDICTION}/${SOURCE_SYSTEM}/${BASELINE_DATE}` });
    expect(environment.archive.stagingDir).toContain(join('.cache', 'bayernrecht-r2-staging'));
    expect(environment.cacheDir).toContain(join('.cache', 'bayernrecht'));
    // Der Bulk-Lauf darf Rohquellen nie versionieren.
    expect(() => assertArchiveAllowed('bulk', { mode: 'versioned-sample', prefix: environment.archive.prefix })).toThrow(/keine Rohquellen versionieren/u);
    // Fremde Präfixe (West, NSH) sind ein harter Fehler – die Bestände dürfen sich nicht überlagern.
    for (const prefix of ['west/recht-nrw/2023-12-01', 'nsh/juris-sh/2023-12-01']) {
      expect(() => assertArchiveAllowed('bulk', { mode: 'r2', prefix, stagingDir: '/tmp/x' }), prefix).toThrow(/Archivpräfix/u);
    }
  });

  it('reserviert Slugs erst mit commit() in der Umgebung', async () => {
    const root = await tempRoot();
    const environment = await loadImportEnvironment(root);
    const reservation = await slugReservationFor(environment, SAMPLE_IDENTITY);
    expect(reservation.reserveSlug('LStVG-Bayern')).toBe('lstvg-baywue');
    expect(environment.slugRegistry.entries).toEqual([]);
    expect(reservation.commit().map((entry) => entry.slug)).toEqual(['lstvg-baywue']);
    expect(environment.slugRegistry.entries.map((entry) => entry.sourceIdentity)).toEqual([SAMPLE_IDENTITY]);
  });
});

describe('Review-Queue', () => {
  const run = { sourceArea: 'landesrecht' as const, sourceIdentity: SAMPLE_IDENTITY, sourceUrl: 'https://example.invalid/portal/testgesetz', now: '2026-09-17T10:00:00.000Z' };
  const finding: ReviewItemInput = { category: 'historical-gap', key: 'baseline-gap', severity: 'blocking', summary: 'Stichtagsfassung nicht im Portal', details: ['nur aktuelle Fassung vorhanden'] };

  it('kennzeichnet jeden Fall mit Jurisdiktion baywue und Quellsystem bayernrecht', async () => {
    const root = await tempRoot();
    const queue = mergeReviewItems(emptyReviewQueue(), run, [finding, { ...finding, category: 'contradictory-evidence', key: 'validity', severity: 'non-blocking', summary: 'Belege widersprechen einander' }]);
    expect(queue.items).toHaveLength(2);
    for (const item of queue.items) expect(item).toMatchObject({ jurisdiction: TARGET_JURISDICTION, sourceSystem: SOURCE_SYSTEM, occurrence: 'current', status: 'open' });
    expect(queue.items.map((item) => item.id)).toContain(reviewItemId(SAMPLE_IDENTITY, 'historical-gap', 'baseline-gap'));
    const written = await writeReviewShard(root, queue, 'landesrecht', SAMPLE_IDENTITY);
    expect(written.path).toBe(reviewShardPath('landesrecht', SAMPLE_IDENTITY));
    const shard = JSON.parse(await readFile(join(root, written.path), 'utf8')) as { jurisdiction: string; sourceSystem: string };
    expect(shard).toMatchObject({ schemaVersion: 'bayernrecht-review-shard/1', jurisdiction: 'baywue', sourceSystem: 'bayernrecht' });
    expect((await readReviewQueue(root)).items).toEqual(queue.items);
  });

  it('vermischt sich weder mit der West- noch mit der NSH-Queue', async () => {
    const root = await tempRoot();
    await writeReviewShard(root, mergeReviewItems(emptyReviewQueue(), run, [finding]), 'landesrecht', SAMPLE_IDENTITY);
    // Ein echter NSH-Fall im selben Root, geschrieben vom NSH-Adapter.
    const nshIdentity = 'jlr-TestgesetzSH2020rahmen';
    await writeNshReviewShard(root, mergeNshReviewItems(emptyNshReviewQueue(), { ...run, sourceIdentity: nshIdentity }, [finding]), 'landesrecht', nshIdentity);
    // Ein West-Fall im selben Root (Rohdatei im West-Format).
    const westDir = join(root, 'data', 'imports', 'recht-nrw', 'review', 'lrgv');
    await mkdir(westDir, { recursive: true });
    await writeFile(join(westDir, 'term-4711.json'), JSON.stringify({
      schemaVersion: 'recht-nrw-review-shard/2', sourceArea: 'lrgv', sourceIdentity: 'term:4711',
      items: [{ id: 'term:4711:metadata-conflict:abc', sourceArea: 'lrgv', sourceIdentity: 'term:4711', sourceUrl: 'https://recht.nrw.de/x', category: 'metadata-conflict', key: 'issue-date', severity: 'blocking', summary: 'West', details: [], firstSeenAt: run.now, updatedAt: run.now, occurrence: 'current', status: 'open' }],
    }));
    expect((await readReviewQueue(root)).items.map((item) => item.sourceIdentity)).toEqual([SAMPLE_IDENTITY]);
    expect((await readNshReviewQueue(root)).items.map((item) => item.sourceIdentity)).toEqual([nshIdentity]);
    expect((await readWestReviewQueue(root)).items.map((item) => item.sourceIdentity)).toEqual(['term:4711']);
    // Eine Datei mit fremdem Quellsystem im BayWü-Verzeichnis ist ein Zustandsfehler, kein stiller Import.
    for (const foreign of [{ jurisdiction: 'west', sourceSystem: 'recht-nrw' }, { jurisdiction: 'nsh', sourceSystem: 'juris-sh' }]) {
      await writeFile(join(root, reviewShardPath('landesrecht', SAMPLE_IDENTITY)), JSON.stringify({ schemaVersion: 'bayernrecht-review-shard/1', ...foreign, sourceArea: 'landesrecht', sourceIdentity: SAMPLE_IDENTITY, items: [] }));
      await expect(readReviewQueue(root)).rejects.toThrow(/fremder Bestand/u);
    }
  });
});

describe('Evidenzregeln A/B/C', () => {
  const baseline = BASELINE_DATE;

  it('Regel A: starkes Ende vor dem Stichtag → nicht am Stichtag geltend', () => {
    const assessment = assessBaselineValidity({ baseline, evidence: [strongEvidence('begin', '2015-01-01', 'in Kraft ab 2015'), strongEvidence('end', '2022-06-30', 'außer Kraft am 30.06.2022', 'text-expiry-clause')] });
    expect(assessment).toMatchObject({ status: 'not-active-at-baseline', rule: 'A-strong-end-before-baseline' });
    expect(assessment.decisive).toHaveLength(1);
  });

  it('Regel B: starker Beginn und starker Fortbestand → am Stichtag geltend', () => {
    const assessment = assessBaselineValidity({ baseline, evidence: [strongEvidence('begin', '2015-01-01', 'in Kraft ab 2015'), strongEvidence('amendment', '2024-03-01', 'Änderung nach dem Stichtag belegt den Fortbestand', 'gazette-amendment')] });
    expect(assessment).toMatchObject({ status: 'active-at-baseline', rule: 'B-strong-begin-and-continuity' });
  });

  it('Regel C: nur stützende Belege, fehlender Fortbestand oder Widerspruch → unbestimmt', () => {
    // Die bloße Führung unter einer BayRS-Nummer ist ein Hinweis, kein Beweis.
    const supporting: ValidityEvidence = { kind: 'registry-position', dimension: 'validity', strength: 'supporting', statement: 'unter BayRS 2170-1-1-I geführt' };
    expect(assessBaselineValidity({ baseline, evidence: [supporting] })).toMatchObject({ status: 'undetermined', rule: 'C-undetermined' });
    expect(assessBaselineValidity({ baseline, evidence: [strongEvidence('begin', '2015-01-01', 'in Kraft ab 2015')] })).toMatchObject({ status: 'undetermined' });
    expect(assessBaselineValidity({ baseline, evidence: [] })).toMatchObject({ status: 'undetermined', decisive: [] });
    // contradictory schlägt jede andere Regel: auch ein starkes Ende entscheidet dann nicht.
    const contradictory: ValidityEvidence = { kind: 'portal-change-history', dimension: 'end', strength: 'contradictory', statement: 'Portal nennt zwei verschiedene Aufhebungsdaten' };
    const withContradiction = assessBaselineValidity({ baseline, evidence: [strongEvidence('end', '2022-06-30', 'außer Kraft 2022', 'text-expiry-clause'), contradictory] });
    expect(withContradiction).toMatchObject({ status: 'undetermined', rule: 'C-undetermined' });
    expect(withContradiction.contradictions).toHaveLength(1);
    // Starkes Ende vor dem Stichtag gegen starken Fortbestand danach: ebenfalls unbestimmt, nicht geraten.
    expect(assessBaselineValidity({ baseline, evidence: [strongEvidence('begin', '2015-01-01', 'ab 2015'), strongEvidence('end', '2022-06-30', 'außer Kraft 2022', 'text-expiry-clause'), strongEvidence('amendment', '2024-03-01', 'Änderung 2024', 'gazette-amendment')] })).toMatchObject({ status: 'undetermined' });
  });

  it('prüft Belege hart: starke Belege brauchen Datum und Quellenangabe', () => {
    expect(validateValidityEvidence(strongEvidence('begin', '2015-01-01', 'ok'))).toEqual([]);
    expect(validateValidityEvidence({ kind: 'gazette-amendment', dimension: 'amendment', strength: 'strong', statement: 'ohne Datum', sourceUrl: 'https://example.invalid' }).join(' ')).toContain('ohne Datum');
    expect(validateValidityEvidence({ kind: 'gazette-amendment', dimension: 'amendment', strength: 'strong', statement: 'ohne Quelle', date: '2024-01-01' }).join(' ')).toContain('ohne Quellenangabe');
    expect(validateValidityEvidence(strongEvidence('validity', '2023-12-01', 'BayRS-Eintrag', 'registry-position')).join(' ')).toContain('höchstens stützend');
    expect(validateValidityEvidence({ kind: 'x', dimension: 'y', strength: 'z', statement: '' }).length).toBeGreaterThanOrEqual(4);
    expect(() => assessBaselineValidity({ baseline, evidence: [{ kind: 'x' } as never] })).toThrow(/Ungültige Belege/u);
    expect(() => assessBaselineValidity({ baseline: '01.12.2023', evidence: [] })).toThrow(/kein ISO-Datum/u);
  });
});

describe('CLI-Gerüst', () => {
  const capture = (): { io: { print: (line: string) => void; error: (line: string) => void }; out: string[]; err: string[] } => {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { print: (line) => out.push(line), error: (line) => err.push(line) }, out, err };
  };

  it('listet in der Hilfe alle Befehle und hat für jeden eine eigene Hilfe', async () => {
    const { io, out } = capture();
    expect(await runCli(['help'], io)).toBe(0);
    const overview = out.join('\n');
    for (const command of COMMANDS) {
      expect(overview).toContain(command);
      expect(COMMAND_HELP[command]).toBeTruthy();
      expect(renderHelp(command)).toContain(command);
    }
    for (const area of SOURCE_AREAS) expect(overview).toContain(area);
    expect(overview).toContain('Dry-run');
    expect(overview).toContain('BAYERN.RECHT');
    const perCommand = capture();
    expect(await runCli(['bulk', '--help'], perCommand.io)).toBe(0);
    expect(perCommand.out.join('\n')).toContain('Bulk-Lauf');
  });

  it('meldet nicht implementierte Befehle ausdrücklich mit Exit 2 (kein stiller Erfolg)', async () => {
    // Umgesetzte Befehle arbeiten wirklich (und würden hier den echten Bestand anfassen); geprüft wird
    // nur, dass alles Übrige ausdrücklich „noch nicht implementiert“ meldet statt still zu gelingen.
    for (const command of COMMANDS.filter((candidate) => !IMPLEMENTED_COMMANDS.includes(candidate))) {
      const { io, out, err } = capture();
      expect(await runCli([command], io), `${command} muss Exit 2 liefern`).toBe(2);
      expect(err.join('\n')).toContain('noch nicht implementiert');
      expect(out).toEqual([]);
    }
  });

  it('weist unbekannte Befehle und Optionen zurück und liest gemeinsame Optionen', async () => {
    const { io, err } = capture();
    expect(await runCli(['bulkk'], io)).toBe(1);
    expect(err.join('\n')).toContain('Unbekannter Befehl: bulkk');
    expect(parseCliArguments(['bulk', '--write', '--offline', '--json', '--resume', '--area', 'vwv', '--limit', '5', '--only', 'a,b', '--cache-dir', '/tmp/x', '--baseline', '2023-12-01'])).toMatchObject({
      command: 'bulk', write: true, offline: true, json: true, resume: true, area: 'vwv', limit: 5, only: ['a', 'b'], cacheDir: '/tmp/x', baseline: '2023-12-01',
    });
    expect(parseCliArguments(['bulk']).write).toBe(false);
    expect(() => parseCliArguments(['bulk', '--area', 'lrgv'])).toThrow(/--area erwartet/u);
    expect(() => parseCliArguments(['bulk', '--unsinn'])).toThrow(/Unbekannte Option/u);
    expect(() => parseCliArguments(['bulk', '--limit'])).toThrow(/erwartet einen Wert/u);
  });
});
