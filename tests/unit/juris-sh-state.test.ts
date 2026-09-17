/**
 * Zustand des juris-SH-Adapters (Land Schleswig-Holstein → Simulationsland NSH): Manifest, Pfadableitung,
 * Slug-Registry, Review-Queue, Evidenzregeln und CLI-Gerüst. Alles ohne Netz und ausschließlich in
 * temporären Verzeichnissen – der echte Bestand wird nie angefasst.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { CorruptStateError } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { readReviewQueue as readWestReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';

import { runCli, COMMAND_HELP, COMMANDS, IMPLEMENTED_COMMANDS, parseCliArguments, renderHelp } from '@landesrecht/importer-juris-sh/cli.ts';
import { BASELINE_DATE, SOURCE_AREAS, SOURCE_SYSTEM, TARGET_JURISDICTION } from '@landesrecht/importer-juris-sh/common/constants.ts';
import { assessBaselineValidity, validateValidityEvidence, type ValidityEvidence } from '@landesrecht/importer-juris-sh/common/evidence.ts';
import { readManifest, readManifestEntry, validateManifestEntry, writeManifestEntry } from '@landesrecht/importer-juris-sh/common/manifest.ts';
import { compareSourceIdentity, identityFileName, manifestEntryPath, reviewShardPath, runReportPath, unresolvedSourcePath, enumerationPath } from '@landesrecht/importer-juris-sh/common/paths.ts';
import { assertArchiveAllowed, loadImportEnvironment, slugReservationFor } from '@landesrecht/importer-juris-sh/common/environment.ts';
import { emptyReviewQueue, mergeReviewItems, readReviewQueue, reviewItemId, writeReviewShard, type ReviewItemInput } from '@landesrecht/importer-juris-sh/common/review.ts';
import { createSlugReserver, emptySlugRegistry, jurisdictionSlugCandidate, validateSlugRegistry } from '@landesrecht/importer-juris-sh/common/slug-registry.ts';

import { cleanupTempRoots, sampleManifestEntry, SAMPLE_IDENTITY, strongEvidence, tempRoot } from '../helpers/juris-sh-state.ts';

afterAll(cleanupTempRoots);

describe('Manifest des NSH-Bestands', () => {
  it('schreibt und liest einen Eintrag verlustfrei (Roundtrip, Datei je Stammnorm)', async () => {
    const root = await tempRoot();
    const entry = sampleManifestEntry({ importedAt: '2026-09-17T10:00:00.000Z', runId: 'lauf-1' });
    const written = await writeManifestEntry(root, entry);
    expect(written.path).toBe(`data/imports/juris-sh/manifest/landesrecht/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(written.changed).toBe(true);
    expect(await readManifestEntry(root, 'landesrecht', SAMPLE_IDENTITY)).toEqual(entry);
    const manifest = await readManifest(root);
    expect(manifest).toMatchObject({ schemaVersion: 'juris-sh-import-manifest/1', sourceSystem: SOURCE_SYSTEM, baselineDate: BASELINE_DATE });
    expect(manifest.entries).toEqual([entry]);
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

  it('führt NSH-eigene Felder (baselineRecoveryMethod, sourceProvenance) und prüft sie hart', () => {
    expect(validateManifestEntry(sampleManifestEntry())).toEqual([]);
    expect(validateManifestEntry(sampleManifestEntry({ baselineRecoveryMethod: 'reverse-post-baseline-event' }))).toEqual([]);
    expect(validateManifestEntry({ ...sampleManifestEntry(), baselineRecoveryMethod: 'guessed' }).join(' ')).toContain('baselineRecoveryMethod');
    expect(validateManifestEntry({ ...sampleManifestEntry(), sourceProvenance: { publicationAuthority: 'hearsay', digitalRepresentation: 'born-digital' } }).join(' ')).toContain('publicationAuthority');
    expect(validateManifestEntry({ ...sampleManifestEntry(), sourceProvenance: undefined }).join(' ')).toContain('sourceProvenance fehlt');
  });

  it('weist Schemaverstöße mit klarer Meldung zurück, statt sie stillschweigend zu übernehmen', async () => {
    const root = await tempRoot();
    const cases: Array<[Partial<Record<string, unknown>>, string]> = [
      [{ sourceSystem: 'recht-nrw' }, 'sourceSystem'],
      [{ targetJurisdiction: 'west' }, 'targetJurisdiction'],
      [{ sourceArea: 'lrgv' }, 'sourceArea'],
      [{ baselineDate: '2020-01-01' }, 'baselineDate'],
      [{ sha256: 'zz' }, 'sha256'],
      [{ sourceValidFrom: '01.01.2020' }, 'sourceValidFrom'],
      [{ sourceValidTo: '2019-01-01' }, 'sourceValidTo liegt vor sourceValidFrom'],
      [{ targetSlug: 'Testgesetz NSH' }, 'targetSlug'],
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
    const directory = join(root, 'data', 'imports', 'juris-sh', 'manifest', 'landesrecht');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${identityFileName(SAMPLE_IDENTITY)}.json`), '{ kaputt');
    await expect(readManifest(root)).rejects.toBeInstanceOf(CorruptStateError);
    await writeFile(join(directory, `${identityFileName(SAMPLE_IDENTITY)}.json`), JSON.stringify({ schemaVersion: 'juris-sh-import-manifest-entry/1', entry: sampleManifestEntry({ sourceIdentity: 'jlr-Anderes' }) }));
    await expect(readManifest(root)).rejects.toThrow(/Dateiname passt nicht zur Quellidentität/u);
  });
});

describe('Pfadableitung', () => {
  it('ist deterministisch und dateisystemsicher', () => {
    for (const identity of ['jlr-TestgesetzSH2020rahmen', 'JLR-testgesetzsh2020RAHMEN', 'sgv 2129/1 § 3', 'Ä/Ö\\Ü:*?"<>|', '2023', 'x'.repeat(200)]) {
      const name = identityFileName(identity);
      expect(name).toBe(identityFileName(identity));
      expect(name).toMatch(/^[a-z0-9][a-z0-9-]*$/u);
      expect(name.length).toBeLessThanOrEqual(61);
      expect(name.startsWith('.')).toBe(false);
    }
    // Gemischte Schreibung unterscheidet Dateien nicht (macOS, Windows): der Hashteil trägt die Unterscheidung.
    expect(identityFileName('jlr-Test')).not.toBe(identityFileName('jlr-test'));
    // Leere oder nur aus Leerraum bestehende Identitäten werden nicht ersetzt, sondern abgewiesen.
    for (const empty of ['', '   ']) expect(() => identityFileName(empty)).toThrow(/leer/u);
  });

  it('legt jeden Bereich getrennt unter data/imports bzw. data/audits ab', () => {
    expect(manifestEntryPath('vwv', SAMPLE_IDENTITY)).toBe(`data/imports/juris-sh/manifest/vwv/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(reviewShardPath('events', SAMPLE_IDENTITY)).toBe(`data/imports/juris-sh/review/events/${identityFileName(SAMPLE_IDENTITY)}.json`);
    expect(enumerationPath('landesrecht')).toBe('data/imports/juris-sh/enumeration-landesrecht.json');
    expect(unresolvedSourcePath('landesrecht', 'https://example.invalid/a')).toMatch(/^data\/audits\/juris-sh\/landesrecht\/unresolved\/[0-9a-f]{16}\.json$/u);
    expect(unresolvedSourcePath('landesrecht', 'https://example.invalid/a')).not.toBe(unresolvedSourcePath('landesrecht', 'https://example.invalid/b'));
    expect(runReportPath('lauf-2026-09-17')).toBe('data/audits/juris-sh/runs/lauf-2026-09-17.json');
    expect(() => runReportPath('../../etc/passwd')).toThrow(/Ungültige Lauf-ID/u);
    expect(() => manifestEntryPath('lrgv' as never, SAMPLE_IDENTITY)).toThrow(/Unbekannter Quellbereich/u);
    // Kein Pfad des NSH-Adapters zeigt in den eingefrorenen West-Bestand.
    for (const path of [manifestEntryPath('landesrecht', SAMPLE_IDENTITY), reviewShardPath('vwv', SAMPLE_IDENTITY), enumerationPath('vwv'), runReportPath('lauf-1')]) expect(path).not.toContain('recht-nrw');
  });

  it('sortiert Quellidentitäten deterministisch und mit natürlicher Zahlenordnung', () => {
    expect(['doc-10', 'doc-2', 'doc-1'].sort(compareSourceIdentity)).toEqual(['doc-1', 'doc-2', 'doc-10']);
    expect(compareSourceIdentity('gleich', 'gleich')).toBe(0);
  });
});

describe('Slug-Registry (Jurisdiktionskonvention -nsh)', () => {
  it('führt den Landeszusatz -nsh statt des Quellzusatzes -sh', () => {
    expect(jurisdictionSlugCandidate('LWG-SH')).toBe('lwg-nsh');
    expect(jurisdictionSlugCandidate('Straßen- und Wegegesetz Schleswig-Holstein')).toBe('strassen-und-wegegesetz-nsh');
    expect(jurisdictionSlugCandidate('gemo-nsh')).toBe('gemo-nsh');
    expect(jurisdictionSlugCandidate('verfassung-des-landes-niedersachsen-holstein')).toBe('verfassung-des-landes-niedersachsen-holstein');
    expect(() => validateSlugRegistry({ ...emptySlugRegistry(), entries: [{ slug: 'lwg-sh', sourceIdentity: 'a', candidate: 'lwg-sh', assignment: 'derived' }] })).toThrow(/-sh statt -nsh/u);
    expect(() => validateSlugRegistry({ ...emptySlugRegistry(), jurisdiction: 'west' as never })).toThrow(/erwartet nsh/u);
  });

  it('reserviert stabil und löst Kollisionen deterministisch mit Suffix auf', () => {
    const registry = emptySlugRegistry();
    const reserver = createSlugReserver(registry, new Set(['fremder-slug-nsh']));
    expect(reserver.reserve('jlr-A', 'LWG-SH')).toMatchObject({ slug: 'lwg-nsh', newlyReserved: true });
    const collision = reserver.reserve('jlr-B', 'lwg-sh');
    expect(collision.slug).toMatch(/^lwg-nsh-[0-9a-f]{8}$/u);
    expect(collision.collision).toMatchObject({ candidate: 'lwg-nsh', heldBy: 'jlr-A' });
    expect(reserver.reserve('jlr-C', 'fremder-slug-nsh').collision).toMatchObject({ heldBy: 'nicht registriertes Verzeichnis' });
    // Zweite Reservierung derselben Quelle: gleicher Slug, auch wenn der Kandidat sich ändert.
    const again = reserver.reserve('jlr-A', 'Landeswassergesetz');
    expect(again).toMatchObject({ slug: 'lwg-nsh', newlyReserved: false });
    expect(again.candidateChanged).toMatchObject({ previous: 'lwg-nsh', current: 'landeswassergesetz' });
    // Wiederholung mit demselben Ausgangszustand ergibt dieselben Slugs.
    const repeat = createSlugReserver(emptySlugRegistry(), new Set());
    expect([repeat.reserve('jlr-A', 'LWG-SH').slug, repeat.reserve('jlr-B', 'lwg-sh').slug]).toEqual(['lwg-nsh', collision.slug]);
    validateSlugRegistry(registry);
  });
});

describe('Importumgebung', () => {
  it('lädt leeren Zustand, bindet das Archiv an das NSH-Präfix und stagt außerhalb von Git', async () => {
    const root = await tempRoot();
    const environment = await loadImportEnvironment(root, { mode: 'bulk', runId: 'lauf-1' });
    expect(environment).toMatchObject({ mode: 'bulk', projection: 'record-only', runId: 'lauf-1' });
    expect(environment.manifest.entries).toEqual([]);
    expect(environment.reviewQueue.items).toEqual([]);
    expect(environment.slugRegistry.jurisdiction).toBe(TARGET_JURISDICTION);
    expect(environment.archive).toMatchObject({ mode: 'staging', prefix: `${TARGET_JURISDICTION}/${SOURCE_SYSTEM}/${BASELINE_DATE}` });
    expect(environment.archive.stagingDir).toContain('.cache');
    expect(environment.cacheDir).toContain('.cache');
    // Der Bulk-Lauf darf Rohquellen nie versionieren.
    expect(() => assertArchiveAllowed('bulk', { mode: 'versioned-sample', prefix: environment.archive.prefix })).toThrow(/keine Rohquellen versionieren/u);
    expect(() => assertArchiveAllowed('bulk', { mode: 'r2', prefix: 'west/recht-nrw/2023-12-01', stagingDir: '/tmp/x' })).toThrow(/Archivpräfix/u);
  });

  it('reserviert Slugs erst mit commit() in der Umgebung', async () => {
    const root = await tempRoot();
    const environment = await loadImportEnvironment(root);
    const reservation = await slugReservationFor(environment, SAMPLE_IDENTITY);
    expect(reservation.reserveSlug('LWG-SH')).toBe('lwg-nsh');
    expect(environment.slugRegistry.entries).toEqual([]);
    expect(reservation.commit().map((entry) => entry.slug)).toEqual(['lwg-nsh']);
    expect(environment.slugRegistry.entries.map((entry) => entry.sourceIdentity)).toEqual([SAMPLE_IDENTITY]);
  });
});

describe('Review-Queue', () => {
  const run = { sourceArea: 'landesrecht' as const, sourceIdentity: SAMPLE_IDENTITY, sourceUrl: 'https://example.invalid/jportal/testgesetz', now: '2026-09-17T10:00:00.000Z' };
  const finding: ReviewItemInput = { category: 'historical-gap', key: 'baseline-gap', severity: 'blocking', summary: 'Stichtagsfassung nicht im Portal', details: ['nur aktuelle Fassung vorhanden'] };

  it('kennzeichnet jeden Fall mit Jurisdiktion nsh und Quellsystem juris-sh', async () => {
    const root = await tempRoot();
    const queue = mergeReviewItems(emptyReviewQueue(), run, [finding, { ...finding, category: 'contradictory-evidence', key: 'validity', severity: 'non-blocking', summary: 'Belege widersprechen einander' }]);
    expect(queue.items).toHaveLength(2);
    for (const item of queue.items) expect(item).toMatchObject({ jurisdiction: TARGET_JURISDICTION, sourceSystem: SOURCE_SYSTEM, occurrence: 'current', status: 'open' });
    expect(queue.items.map((item) => item.id)).toContain(reviewItemId(SAMPLE_IDENTITY, 'historical-gap', 'baseline-gap'));
    const written = await writeReviewShard(root, queue, 'landesrecht', SAMPLE_IDENTITY);
    expect(written.path).toBe(reviewShardPath('landesrecht', SAMPLE_IDENTITY));
    const shard = JSON.parse(await readFile(join(root, written.path), 'utf8')) as { jurisdiction: string; sourceSystem: string };
    expect(shard).toMatchObject({ schemaVersion: 'juris-sh-review-shard/1', jurisdiction: 'nsh', sourceSystem: 'juris-sh' });
    expect((await readReviewQueue(root)).items).toEqual(queue.items);
  });

  it('vermischt sich nicht mit der West-Queue: getrennte Pfade, fremder Bestand wird abgewiesen', async () => {
    const root = await tempRoot();
    await writeReviewShard(root, mergeReviewItems(emptyReviewQueue(), run, [finding]), 'landesrecht', SAMPLE_IDENTITY);
    // Ein West-Fall im selben Root bleibt für beide Queues unsichtbar für die jeweils andere.
    const westDir = join(root, 'data', 'imports', 'recht-nrw', 'review', 'lrgv');
    await mkdir(westDir, { recursive: true });
    await writeFile(join(westDir, 'term-4711.json'), JSON.stringify({
      schemaVersion: 'recht-nrw-review-shard/2', sourceArea: 'lrgv', sourceIdentity: 'term:4711',
      items: [{ id: 'term:4711:metadata-conflict:abc', sourceArea: 'lrgv', sourceIdentity: 'term:4711', sourceUrl: 'https://recht.nrw.de/x', category: 'metadata-conflict', key: 'issue-date', severity: 'blocking', summary: 'West', details: [], firstSeenAt: run.now, updatedAt: run.now, occurrence: 'current', status: 'open' }],
    }));
    const nsh = await readReviewQueue(root);
    expect(nsh.items.map((item) => item.sourceIdentity)).toEqual([SAMPLE_IDENTITY]);
    const west = await readWestReviewQueue(root);
    expect(west.items.map((item) => item.sourceIdentity)).toEqual(['term:4711']);
    // Eine Datei mit fremdem Quellsystem im NSH-Verzeichnis ist ein Zustandsfehler, kein stiller Import.
    await writeFile(join(root, reviewShardPath('landesrecht', SAMPLE_IDENTITY)), JSON.stringify({ schemaVersion: 'juris-sh-review-shard/1', jurisdiction: 'west', sourceSystem: 'recht-nrw', sourceArea: 'landesrecht', sourceIdentity: SAMPLE_IDENTITY, items: [] }));
    await expect(readReviewQueue(root)).rejects.toThrow(/fremder Bestand/u);
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
    const supporting: ValidityEvidence = { kind: 'index-signal', dimension: 'validity', strength: 'insufficient', statement: 'Vorschrift im Index vorhanden' };
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
    const perCommand = capture();
    expect(await runCli(['bulk', '--help'], perCommand.io)).toBe(0);
    expect(perCommand.out.join('\n')).toContain('Bulk-Lauf');
  });

  it('meldet nicht implementierte Befehle ausdrücklich mit Exit 2 (kein stiller Erfolg)', async () => {
    // Maßstab ist IMPLEMENTED_COMMANDS, nicht eine feste Liste: Jeder freigeschaltete Befehl (derzeit
    // review und events) wird hier automatisch übersprungen, alle übrigen müssen Exit 2 liefern.
    expect(IMPLEMENTED_COMMANDS.length).toBeGreaterThan(0);
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
