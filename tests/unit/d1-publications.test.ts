/**
 * Verkündungen in der D1-Projektion (S7): Tabelle `law_publications` (Migration 0002), Plangruppen je Ausgabe,
 * inkrementelle Erkennung neuer, geänderter und entfernter Ausgaben, Store-API (D1 und Dateien) und die Regel,
 * dass ein Bestand ohne Verkündungen seinen Fingerabdruck behält (West bleibt „noop“).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { comparePublicationsNewestFirst, getPublicationLabel, hasNumberedIssue, publicationEntryPages, publicationSlugsByVersion, summarizePublicationSeries } from '@landesrecht/legal-core/lib/publications.ts';
import { parsePublication, type Publication } from '@landesrecht/legal-core/lib/schema.ts';
import { createD1NormStore } from '@landesrecht/runtime/d1-store.ts';
import { createFileNormStore } from '@landesrecht/runtime/file-store.ts';
import { buildIncrementalProjectionPlan, diffProjection, projectionStateFor, type ProjectionState } from '@landesrecht/runtime/incremental.ts';
import { buildProjectionPlan, corpusFingerprint, publicationGroupKey, renderPlanSql } from '@landesrecht/runtime/projection.ts';
import { splitPlanIntoSqlFiles } from '@landesrecht/runtime/sql-batches.ts';
import { executePlan, listMigrations, openSqliteD1 } from '@landesrecht/runtime/sqlite-d1.ts';

import { buildFixtureNorms, FIXTURE_REFERENCE_DATE } from '../helpers/fixture-corpus.ts';

const root = resolveRepositoryRoot();
const migrationsDir = join(root, 'data', 'd1');
const NOW = '2026-01-01T00:00:00.000Z';
const norms = buildFixtureNorms();
const SHA = '0000000000000000000000000000000000000000000000000000000000000003';

function publication(overrides: Record<string, unknown> = {}): Publication {
  return parsePublication({
    slug: 'gv-west-2026-3',
    jurisdiction: 'west',
    title: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland 2026 Nr. 3',
    gazette: 'GV. West',
    seriesTitle: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland',
    place: 'Düsseldorf',
    year: 2026,
    issue: '3',
    date: '2026-02-20',
    sourceReferences: [{ kind: 'simulation-gazette', system: 'simulation', label: 'GV. West 2026 Nr. 3', availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: `west/simulation/${SHA}.pdf`, sha256: SHA, mediaType: 'application/pdf', pageCount: 2 }],
    entries: [{ title: 'Gesetz zur Änderung des Westdeutschen Testgesetzes', type: 'gesetz', citation: 'Gesetz vom 20. Februar 2026 (GV. West 2026 Nr. 3)', normSlug: 'testgesetz-west', versionId: '2026-03-01', pages: '1–2', startPage: 1, documentDate: '2026-02-20' }],
    ...overrides,
  }, 'test/publication');
}

const older = publication({ slug: 'gv-west-2025-9', title: 'GV. West 2025 Nr. 9', year: 2025, issue: '9', date: '2025-11-03', entries: [] });
const foreign = publication({ slug: 'gvobl-nsh-2026-1', jurisdiction: 'nsh', title: 'GVOBl. NSH 2026 Nr. 1', gazette: 'GVOBl. NSH', issue: '1', date: '2026-01-15', entries: [] });

describe('Projektion der Verkündungen', () => {
  it('Migration 0002 legt law_publications an und liegt in der Migrationsreihenfolge nach 0001', async () => {
    const migrations = await listMigrations(migrationsDir);
    expect(migrations.map((file) => file.split('/').pop())).toEqual(['0001_landesrecht.sql', '0002_publications.sql']);
    const migration = await readFile(join(migrationsDir, '0002_publications.sql'), 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS law_publications');
    expect(migration).toContain('PRIMARY KEY (jurisdiction, slug)');
    const db = await openSqliteD1(':memory:', { migrationsDir });
    const columns = db.native.prepare('PRAGMA table_info(law_publications)').all().map((row) => String((row as { name: string }).name));
    expect(columns).toEqual(['slug', 'jurisdiction', 'publication_date', 'gazette', 'series_title', 'year', 'issue', 'title', 'entry_count', 'publication_json', 'updated_at']);
    db.close();
  });

  it('schreibt je Ausgabe eine Klammergruppe und übergeht fremde Jurisdiktionen', () => {
    const plan = buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [publication(), older, foreign] });
    expect(plan.stats.publications).toBe(2);
    expect(plan.groups.map((group) => group.key)).toEqual(['(reset)', 'testgesetz-west', publicationGroupKey('gv-west-2025-9'), publicationGroupKey('gv-west-2026-3'), '(meta)']);
    const sql = renderPlanSql(plan);
    expect(sql).toContain('DELETE FROM law_publications;');
    expect(sql).toContain("INSERT INTO law_publications (slug, jurisdiction, publication_date, gazette, series_title, year, issue, title, entry_count, publication_json, updated_at)");
    expect(sql).not.toContain('gvobl-nsh-2026-1');
    // Die Batch-Aufteilung behandelt Verkündungsgruppen nicht als Normen (kein Norm-Löschpräfix, Normzähler unverändert).
    const batches = splitPlanIntoSqlFiles(plan, { database: 'landesrecht-west' });
    expect(batches.plan.totals.norms).toBe(1);
    expect(batches.plan.errors).toEqual([]);
    expect(batches.files.map((file) => file.sql).join('\n')).not.toContain("DELETE FROM law_norms WHERE id = 'west:(verkündung)");
  });

  it('ein Bestand ohne Verkündungen behält seinen Fingerabdruck; Verkündungen ändern ihn', () => {
    const west = norms.filter((record) => record.meta.jurisdiction === 'west');
    expect(corpusFingerprint(west, FIXTURE_REFERENCE_DATE, [])).toBe(corpusFingerprint(west, FIXTURE_REFERENCE_DATE));
    expect(corpusFingerprint(west, FIXTURE_REFERENCE_DATE, [publication()])).not.toBe(corpusFingerprint(west, FIXTURE_REFERENCE_DATE));
    expect(corpusFingerprint(west, FIXTURE_REFERENCE_DATE, [publication(), older])).toBe(corpusFingerprint(west, FIXTURE_REFERENCE_DATE, [older, publication()]));
    const plain = buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    const withEmpty = buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [] });
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(plain));
    expect(plain.stats.publications).toBe(0);
  });

  it('erkennt inkrementell neue, geänderte und entfernte Ausgaben; ein alter Zustand ohne Feld gilt als „keine“', () => {
    const before = projectionStateFor(norms, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE });
    expect(before.publications).toEqual({});
    // Zustand aus der Zeit vor law_publications (Remote-Zustände von West, NSH, BayWü): kein Feld → noop.
    const { publications: _omitted, ...legacy } = before;
    const noop = buildIncrementalProjectionPlan(norms, legacy as ProjectionState, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(noop.mode).toBe('noop');
    expect(noop.plan.groups.map((group) => group.key)).toEqual(['(basis prüfen)', '(identität entwerten)', '(meta)']);

    const added = buildIncrementalProjectionPlan(norms, legacy as ProjectionState, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [publication(), foreign] });
    expect(added.mode).toBe('incremental');
    expect(added.diff).toMatchObject({ addedPublications: ['gv-west-2026-3'], removedPublications: [], changedPublications: [], added: [], removed: [], unchanged: 1 });
    expect(added.plan.groups.map((group) => group.key)).toEqual(['(basis prüfen)', '(identität entwerten)', publicationGroupKey('gv-west-2026-3'), '(meta)']);
    expect(added.plan.stats.publications).toBe(1);
    expect(added.state.publications).toEqual({ 'gv-west-2026-3': expect.stringMatching(/^[0-9a-f]{64}$/u) });

    const changed = buildIncrementalProjectionPlan(norms, added.state, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [publication({ title: 'Geänderter Titel' })] });
    expect(changed.mode).toBe('incremental');
    expect(changed.diff.changedPublications).toEqual(['gv-west-2026-3']);

    const removed = buildIncrementalProjectionPlan(norms, added.state, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    expect(removed.mode).toBe('incremental');
    expect(removed.diff.removedPublications).toEqual(['gv-west-2026-3']);
    expect(removed.plan.groups.map((group) => group.key)).toContain('(verkündung entfernt) gv-west-2026-3');
    expect(removed.plan.groups.find((group) => group.key.startsWith('(verkündung entfernt)'))!.queries).toEqual([{ sql: 'DELETE FROM law_publications WHERE jurisdiction = ? AND slug = ?', params: ['west', 'gv-west-2026-3'] }]);

    const same = buildIncrementalProjectionPlan(norms, added.state, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [publication()] });
    expect(same.mode).toBe('noop');
    expect(diffProjection(added.state, same.state).unchanged).toBe(1);
  });

  it('D1-Store und Dateistore liefern dieselben Ausgaben, jüngste zuerst, re-validiert', async () => {
    const publications = [older, publication(), foreign];
    const db = await openSqliteD1(':memory:', { migrationsDir });
    executePlan(db, buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications }));
    const d1 = createD1NormStore(db, 'west');
    const files = createFileNormStore('west', norms, { asOf: FIXTURE_REFERENCE_DATE, publications });
    const fromD1 = await d1.listPublications();
    const fromFiles = await files.listPublications();
    expect(fromD1.map((entry) => entry.slug)).toEqual(['gv-west-2026-3', 'gv-west-2025-9']);
    expect(JSON.stringify(fromD1)).toBe(JSON.stringify(fromFiles));
    expect((await d1.listPublications({ limit: 1 })).map((entry) => entry.slug)).toEqual(['gv-west-2026-3']);
    const single = await d1.getPublication('gv-west-2026-3');
    expect(single).toEqual(publication());
    expect(single!.seriesTitle).toBe('Gesetz- und Verordnungsblatt für das Land Westdeutschland');
    expect(single!.entries[0]!.startPage).toBe(1);
    expect(single!.sourceReferences[0]!.sha256).toBe(SHA);
    expect(await d1.getPublication('gvobl-nsh-2026-1')).toBeNull();
    expect(await files.getPublication('gvobl-nsh-2026-1')).toBeNull();
    // Erneute Vollprojektion ohne Verkündungen räumt die Tabelle.
    executePlan(db, buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW }));
    expect(await d1.listPublications()).toEqual([]);
    db.close();
  });

  it('ein inkrementeller Plan schreibt Verkündungen in eine Datenbank mit Schema 0002', async () => {
    const db = await openSqliteD1(':memory:', { migrationsDir });
    executePlan(db, buildProjectionPlan(norms, { jurisdiction: 'west', full: true, asOf: FIXTURE_REFERENCE_DATE, now: NOW }));
    const previous = projectionStateFor(norms, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE });
    const incremental = buildIncrementalProjectionPlan(norms, previous, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW, publications: [publication()] });
    executePlan(db, incremental.plan);
    const store = createD1NormStore(db, 'west');
    expect((await store.listPublications()).map((entry) => entry.slug)).toEqual(['gv-west-2026-3']);
    expect((await store.getStats()).projectionFingerprint).toBe(incremental.state.corpusFingerprint);
    const removal = buildIncrementalProjectionPlan(norms, incremental.state, { jurisdiction: 'west', asOf: FIXTURE_REFERENCE_DATE, now: NOW });
    executePlan(db, removal.plan);
    expect(await store.listPublications()).toEqual([]);
    db.close();
  });
});

describe('Verkündungshelfer (legal-core)', () => {
  it('Kurzzitat, Nummernprüfung, Reihenfolge, Seiten und Reihenübersicht', () => {
    expect(getPublicationLabel(publication())).toBe('GV. West 2026 Nr. 3');
    expect(getPublicationLabel(publication({ issue: 'Sonderausgabe' }))).toBe('GV. West vom 20. Februar 2026');
    expect(hasNumberedIssue({ issue: '12' })).toBe(true);
    expect(hasNumberedIssue({ issue: 'II/3' })).toBe(true);
    expect(hasNumberedIssue({ issue: 'Sonderheft' })).toBe(false);
    const sameDay = publication({ slug: 'gv-west-2026-3-b', issue: '10', date: '2026-02-20' });
    expect([older, publication(), sameDay, foreign].sort(comparePublicationsNewestFirst).map((entry) => entry.slug)).toEqual(['gv-west-2026-3-b', 'gv-west-2026-3', 'gvobl-nsh-2026-1', 'gv-west-2025-9']);
    expect(publicationEntryPages({ pages: '3–9' })).toBe('S. 3–9');
    expect(publicationEntryPages({ startPage: 4 })).toBe('S. 4');
    expect(publicationEntryPages({})).toBeUndefined();
    expect(summarizePublicationSeries([older, publication(), foreign])).toEqual([
      { gazette: 'GV. West', seriesTitle: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland', count: 2, years: '2025–2026' },
      { gazette: 'GVOBl. NSH', seriesTitle: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland', count: 1, years: '2026' },
    ]);
  });

  it('findet die Verkündung einer Fassung über publicationSlug ihrer Quellenreferenzen', () => {
    const versions = [
      { versionId: '2023-12-01', sourceReferences: [{ kind: 'official-gazette' as const, label: 'real', availability: 'external' as const, url: 'https://example.invalid/' }] },
      { versionId: '2026-03-01', sourceReferences: [{ kind: 'simulation-gazette' as const, system: 'simulation', label: 'sim', availability: 'r2-archived' as const, objectKey: `west/simulation/${SHA}.pdf`, sha256: SHA, publicationSlug: 'gv-west-2026-3' }] },
      { versionId: '2027-01-01' },
    ];
    expect([...publicationSlugsByVersion(versions).entries()]).toEqual([['2026-03-01', 'gv-west-2026-3']]);
  });
});
