/**
 * Readiness-Prüfungen (`common/readiness.ts`) mit Fixtures je Prüfung: READY / NOT READY / Hinweis für
 * Enumerations-Fixpoint, Versionsreport mit Legacy-Ausnahmen, Review-Queue-Konsistenz, R2-/D1-/Such-Audits,
 * Golden Set, Secret-Scan und Referenzbaseline – deterministisch über Manifest-Wasserzeichen und Fingerabdrücke.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EnumerationFile } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import type { ImportManifest, ManifestEntry, SourceArea } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import type { LegacyException } from '@landesrecht/importer-recht-nrw/common/legacy-exceptions.ts';
import {
  analyzeReviewQueueConsistency,
  d1RemoteCheck,
  defaultEnumerationFixpointCheck,
  evaluateReadiness,
  fixpointCheck,
  goldenResultsCheck,
  manifestWatermark,
  r2AuditCheck,
  referenceBaselineCheck,
  REFERENCE_BASELINE_SECTIONS,
  reviewQueueConsistencyCheck,
  searchAuditCheck,
  secretScanCheck,
  versionReportChecks,
  type EnumerationFixpointResult,
  type R2AuditReport,
} from '@landesrecht/importer-recht-nrw/common/readiness.ts';
import { reviewItemId, type ReviewItem, type ReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';
import { currentParserVersion, currentTransformerVersion } from '@landesrecht/importer-recht-nrw/common/staleness.ts';
import { computeVersionReport } from '@landesrecht/importer-recht-nrw/common/version-report.ts';

const T0 = '2026-09-10T10:00:00.000Z';
const T1 = '2026-09-11T10:00:00.000Z';
const T2 = '2026-09-12T10:00:00.000Z';

function entry(sourceArea: SourceArea, id: number, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const url = `https://recht.nrw.de/${sourceArea}/gesetz/01012020-vorschrift-${id}`;
  return {
    sourceSystem: 'recht-nrw', sourceArea, sourceDocumentType: 'gesetz', sourceIdentity: `term:${id}`, sourceTitle: `Vorschrift ${id}`, sourceType: 'gesetz', sourceUrl: url, stemUrl: `https://recht.nrw.de/taxonomy/term/${id}`,
    sourceVersion: { url, validFrom: '2020-01-01', validTo: null }, selectedVersionUrl: url, sourceValidFrom: '2020-01-01', sourceValidTo: null, baselineStatus: 'active-at-baseline', validityEvidence: [], retrievedAt: T0,
    sha256: 'a'.repeat(64), contentType: 'text/html', contentFormat: 'native', parserVersion: currentParserVersion(sourceArea), transformerVersion: currentTransformerVersion(), targetJurisdiction: 'west', targetSlug: `vorschrift-${id}-west`, baselineDate: '2023-12-01',
    importStatus: 'imported', reviewStatus: 'none', reconstructionStatus: 'direct', reconstructionSources: [], reconstructionSteps: [], importedAt: T1,
    rawDocuments: [{ role: 'version-page', url, finalUrl: url, sha256: 'b'.repeat(64), contentType: 'text/html', retrievedAt: T0, byteLength: 10, archiveStatus: 'verified', bucket: 'landesrecht-quellen', objectKey: `west/recht-nrw/2023-12-01/term-${id}/x-version-page.html` }],
    versionsConsidered: [], overrides: [], findings: [], integrity: { fetchParse: true, sourceCanonical: true }, transformation: { changes: 0, unresolved: 0 },
    ...overrides,
  };
}

function manifestOf(entries: ManifestEntry[]): ImportManifest {
  return { schemaVersion: 'recht-nrw-import-manifest/2', sourceSystem: 'recht-nrw', baselineDate: '2023-12-01', entries };
}

function reviewItem(sourceIdentity: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
  return { id: reviewItemId(sourceIdentity, 'other', 'x'), sourceArea: 'lrgv', sourceIdentity, sourceUrl: 'https://recht.nrw.de/x', category: 'other', key: 'x', severity: 'blocking', summary: 'x', details: [], firstSeenAt: T0, updatedAt: T0, occurrence: 'current', status: 'open', ...overrides };
}

function queueOf(items: ReviewItem[]): ReviewQueue {
  return { schemaVersion: 'recht-nrw-review-queue/2', items };
}

const watermarkOf = (entries: ManifestEntry[]) => manifestWatermark(manifestOf(entries));

function r2Report(overrides: Partial<R2AuditReport> & { differences?: Record<string, number> } = {}): R2AuditReport {
  return { schemaVersion: 'landesrecht-r2-audit/1', endedAt: T2, counts: { manifestEntries: 2, manifestRawObjects: 2 }, differences: { manifestOnly: 0, stagingOnly: 5, r2Only: 1, r2OnlyUnexpected: 0, stagingOnlyUnexpected: 0, sizeMismatch: 0, hashMismatch: 0, envelopeBytesDiffer: 2, archiveStatusNotVerified: 0 }, sample: { checked: 10, failures: 0, envelopeFailures: 0 }, ...overrides };
}

describe('Readiness: Manifest-Wasserzeichen', () => {
  it('nimmt den jüngsten importedAt und zählt übernommene Einträge und R2-Rohobjekte', () => {
    const watermark = watermarkOf([entry('lrgv', 1, { importedAt: T0 }), entry('lrmb', 2, { importedAt: T2, importStatus: 'excluded', targetSlug: '' }), entry('lrgv', 3, { rawDocuments: [] })]);
    expect(watermark).toEqual({ latestImportedAt: T2, entries: 3, imported: 2, r2RawObjects: 2 });
    expect(manifestWatermark({ entries: [] }).latestImportedAt).toBe('');
  });
});

describe('Readiness: Enumerations-Fixpoint', () => {
  it('Standardprüfung meldet fehlende Cache-Eingaben als Hinweis (kein Netz, kein Blocker)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'readiness-fixpoint-'));
    try {
      expect((await defaultEnumerationFixpointCheck(root, 'lrgv')).status).toBe('unavailable');
      await mkdir(join(root, 'data', 'imports', 'recht-nrw'), { recursive: true });
      const enumeration: EnumerationFile = { schemaVersion: 'recht-nrw-enumeration/1', sourceArea: 'lrgv', baselineDate: '2023-12-01', generatedAt: T0, contentFingerprint: 'x', sources: { sitemap: { indexUrl: 'https://recht.nrw.de/sitemap.xml', pages: 0, urls: 0 }, search: { url: 'https://recht.nrw.de/search', indexTypes: [], total: 0, hits: 0 } }, crosscheck: { sitemapUrls: 0, sitemapStems: 0, searchHits: 0, searchUniqueUrls: 0, duplicateSearchUrls: 0, searchHitsInSitemap: 0, searchHitsNotInSitemap: 0, union: 0, intersection: 0, onlySitemap: 0, onlySearch: 0, items: 0, resolvedTerms: 0, review: 0, excluded: 0, unassignedUrls: 0, duplicateUrlAssignments: 0, termConflicts: 0, ok: true, problems: [], notes: [] }, items: [] };
      await writeFile(join(root, 'data', 'imports', 'recht-nrw', 'enumeration-lrgv.json'), JSON.stringify(enumeration));
      const result = await defaultEnumerationFixpointCheck(root, 'lrgv', { cacheDir: join(root, 'leer') });
      expect(result.status).toBe('unavailable');
      expect(result.detail).toContain('Eingaben nicht im Abrufcache');
      expect(fixpointCheck(result).status).toBe('notice');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('bewertet Fixpoint als ok, Abweichung als Blocker und fehlende Eingaben als Hinweis', () => {
    const base: EnumerationFixpointResult = { area: 'lrgv', status: 'fixpoint', changedItems: 0, changedKeys: [], detail: 'unverändert' };
    expect(fixpointCheck(base).status).toBe('pass');
    expect(fixpointCheck({ ...base, status: 'changed', changedItems: 2, changedKeys: ['a', 'b'], detail: 'weicht ab' })).toMatchObject({ id: 'enumeration-fixpoint-lrgv', status: 'fail', detail: 'weicht ab' });
    expect(fixpointCheck({ ...base, status: 'unavailable', detail: 'kein Cache' }).status).toBe('notice');
  });
});

describe('Readiness: Versionsreport (veraltete Einträge je Status, Legacy-Ausnahmen)', () => {
  const stale = { parserVersion: 'recht-nrw-parser/0.9.0' };
  const exceptionFor = (target: ManifestEntry): LegacyException => ({
    id: `legacy-${target.sourceIdentity.slice(5)}`, sourceIdentity: target.sourceIdentity, sourceArea: target.sourceArea, targetSlug: target.targetSlug, disposition: 'deliver-legacy',
    source: { url: target.sourceUrl, sha256: target.sha256 }, legacy: { parserVersion: target.parserVersion, transformerVersion: target.transformerVersion, importStatus: target.importStatus },
    current: { parserVersion: currentParserVersion(target.sourceArea), findings: ['structure-unnumbered-section'] },
    textIntegrity: { method: 'sichtbarer Text', legacySha256: 'c'.repeat(64), currentSha256: 'c'.repeat(64), legacyChars: 10, currentChars: 10, identical: true },
    structuralDefect: 'Abschnitt ohne Kennzeichen', reason: 'Text identisch, Struktur nur formal', preparedAt: '2026-09-16', preparedBy: 'automated-review', approvalStatus: 'pending-human-review', legacyAssessment: { unclassifiedSections: [3], expectedLabels: ['§ 3'], impact: 'structure-only', resolution: 'override-proposed' },
  });
  const reportOf = (entries: ManifestEntry[], exceptions: LegacyException[] = []) => computeVersionReport({ manifest: manifestOf(entries), exceptions: { schemaVersion: 'recht-nrw-legacy-exceptions/1', entries: exceptions }, generatedAt: T2 });

  it('unbegründete Altstände je Status sind Blocker mit Regenerationsbefehl', () => {
    const excluded = entry('lrgv', 3, { ...stale, importStatus: 'excluded', targetSlug: 'vorschrift-3-west' });
    const report = reportOf([
      entry('lrgv', 1),
      entry('lrgv', 2, { ...stale, importStatus: 'imported-with-warnings' }),
      excluded,
      entry('lrmb', 4, { importStatus: 'needs-review', targetSlug: '', parserVersion: 'recht-nrw-lrmb-parser/0.1.0' }),
    ], [exceptionFor(excluded)]);
    expect(report.ready).toBe(false);
    const [staleCheck, parserCheck] = versionReportChecks(report);
    expect(staleCheck!.status).toBe('fail');
    expect(staleCheck!.detail).toContain('2 unbegründet (unbegründet/veraltet: lrgv imported-with-warnings 1/1, lrgv excluded 0/1 (1 Ausnahme), lrmb needs-review 1/1)');
    expect(staleCheck!.detail).toContain('--regenerate-stale');
    expect(staleCheck!.detail).toContain('begründete Legacy-Ausnahme');
    expect(parserCheck!.status).toBe('fail');
    expect(parserCheck!.detail).toContain('ältere Stände: lrgv parser/0.9.0 · transformer/');
  });

  it('ist grün ohne veraltete Einträge und Hinweis, wenn alle Altstände Ausnahmen sind', () => {
    expect(versionReportChecks(reportOf([entry('lrgv', 1), entry('lrmb', 2)])).map((check) => check.status)).toEqual(['pass', 'pass']);
    const legacy = entry('lrgv', 2, { ...stale, importStatus: 'imported-with-warnings' });
    const [staleCheck, parserCheck] = versionReportChecks(reportOf([entry('lrgv', 1), legacy], [exceptionFor(legacy)]));
    expect(staleCheck!.status).toBe('notice');
    expect(staleCheck!.detail).toContain('1 veraltete Einträge, 1 mit Legacy-Ausnahme (lrgv imported-with-warnings 0/1 (1 Ausnahme))');
    expect(parserCheck!.status).toBe('notice');
  });
});

describe('Readiness: Review-Queue konsistent', () => {
  it('ist grün, wenn needs-review Blocker hat und reviewStatus zur Queue passt', () => {
    const manifest = manifestOf([entry('lrgv', 1), entry('lrgv', 2, { importStatus: 'needs-review', reviewStatus: 'open', targetSlug: '' })]);
    const consistency = analyzeReviewQueueConsistency(manifest, queueOf([reviewItem('term:2')]));
    expect(consistency).toMatchObject({ openItems: 1, orphanCount: 0, needsReviewWithoutBlocking: [], reviewStatusMismatch: [], importedWithBlocking: [], slugMismatch: [], notReproduced: 0 });
    expect(reviewQueueConsistencyCheck(consistency).status).toBe('pass');
  });

  it('meldet needs-review ohne Blocker, reviewStatus-Abweichung und Slug-Abweichung als Blocker', () => {
    const manifest = manifestOf([entry('lrgv', 1, { reviewStatus: 'open' }), entry('lrgv', 2, { importStatus: 'needs-review', reviewStatus: 'open', targetSlug: '' }), entry('lrgv', 3, { reviewStatus: 'none' })]);
    const consistency = analyzeReviewQueueConsistency(manifest, queueOf([reviewItem('term:2', { severity: 'non-blocking' }), reviewItem('term:3', { severity: 'non-blocking', targetSlug: 'anders-west' })]));
    expect(consistency.needsReviewWithoutBlocking).toEqual(['term:2']);
    expect(consistency.reviewStatusMismatch).toHaveLength(2);
    expect(consistency.slugMismatch).toHaveLength(1);
    const check = reviewQueueConsistencyCheck(consistency);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('needs-review ohne offenen blockierenden Fall: term:2');
    expect(check.detail).toContain('reviewStatus ≠ Queue');
    expect(check.detail).toContain('Ziel-Slug weicht ab');
  });

  it('Fälle ohne Manifesteintrag, übernommene mit Blocker und nicht reproduzierte Fälle sind nur Hinweise', () => {
    const manifest = manifestOf([entry('lrgv', 1, { reviewStatus: 'open' })]);
    const consistency = analyzeReviewQueueConsistency(manifest, queueOf([reviewItem('term:1'), reviewItem('url:https://recht.nrw.de/lrmb/x', { sourceArea: 'lrmb', occurrence: 'not-reproduced' })]));
    expect(consistency).toMatchObject({ orphanCount: 1, importedWithBlocking: ['term:1'], notReproduced: 1 });
    const check = reviewQueueConsistencyCheck(consistency);
    expect(check.status).toBe('notice');
    expect(check.detail).toContain('1 offene Fälle ohne Manifesteintrag');
    expect(check.detail).toContain('1 übernommene Einträge mit offenem blockierenden Fall');
    expect(reviewQueueConsistencyCheck(consistency, { legacyFile: true }).status).toBe('fail');
  });
});

describe('Readiness: R2-Audit grün und aktuell', () => {
  const watermark = watermarkOf([entry('lrgv', 1), entry('lrgv', 2, { importedAt: T0 })]);

  it('READY bei 0 relevanten Abweichungen, jüngerem Report und passenden Zählwerten', () => {
    const check = r2AuditCheck(r2Report(), watermark);
    expect(check.status).toBe('pass');
    expect(check.detail).toContain(`Report ${T2} ≥ Manifest ${T1}`);
  });

  it('NOT READY bei fehlendem Report, relevanter Abweichung, älterem Report oder abweichender Zählung', () => {
    expect(r2AuditCheck(undefined, watermark)).toMatchObject({ status: 'fail', detail: expect.stringContaining('R2_AUDIT.json fehlt') });
    expect(r2AuditCheck(r2Report({ differences: { manifestOnly: 1 } }), watermark).detail).toContain('1 relevante Abweichungen (manifestOnly 1)');
    expect(r2AuditCheck(r2Report({ sample: { checked: 10, failures: 2, envelopeFailures: 0 } }), watermark).detail).toContain('Stichprobe 2');
    expect(r2AuditCheck(r2Report({ endedAt: T0 }), watermark).detail).toContain(`Report (${T0}) älter als die letzte Manifeständerung (${T1})`);
    expect(r2AuditCheck(r2Report({ counts: { manifestEntries: 3, manifestRawObjects: 2 } }), watermark).detail).toContain('Manifesteinträge im Report 3 ≠ 2');
    expect(r2AuditCheck(r2Report({ counts: { manifestEntries: 2, manifestRawObjects: 1 } }), watermark).detail).toContain('Rohobjekte im Report 1 ≠ 2');
    expect(r2AuditCheck(r2Report({ sample: { checked: 0, failures: 0, envelopeFailures: 0 } }), watermark).detail).toContain('keine Byte-Stichprobe');
  });

  it('historisch erklärbare Abweichungen (stagingOnly, r2Only, envelopeBytesDiffer) blockieren nicht', () => {
    expect(r2AuditCheck(r2Report({ differences: { stagingOnly: 1754, r2Only: 52, envelopeBytesDiffer: 11257 } }), watermark).status).toBe('pass');
  });
});

describe('Readiness: D1-Audit lokal ↔ remote', () => {
  const watermark = watermarkOf([entry('lrgv', 1)]);
  const report = { schemaVersion: 'landesrecht-d1-remote-check/1', database: 'landesrecht-west', checkedAt: T2, differences: 0, results: [{ name: 'law_norms', equal: true, local: [{ n: 3 }], remote: [{ n: 3 }] }, { name: 'law_versions', equal: true, local: [{ n: 3 }], remote: [{ n: 3 }] }] };

  it('READY bei 0 Abweichungen, jüngerem Report und passender Normanzahl', () => {
    expect(d1RemoteCheck(report, watermark, 3)).toMatchObject({ status: 'pass', detail: expect.stringContaining('landesrecht-west: 2 Prüfungen identisch, 3 Normen') });
  });

  it('NOT READY bei Abweichung, älterem Report oder anderer Normanzahl', () => {
    expect(d1RemoteCheck(undefined, watermark, 3).detail).toContain('D1_REMOTE_CHECK.json fehlt');
    expect(d1RemoteCheck({ ...report, differences: 1, results: [{ name: 'law_norms', equal: false }] }, watermark, 3).detail).toContain('1 Abweichungen lokal ↔ remote (law_norms)');
    expect(d1RemoteCheck({ ...report, checkedAt: T0 }, watermark, 3).detail).toContain('älter als die letzte Manifeständerung');
    expect(d1RemoteCheck(report, watermark, 4).detail).toContain('law_norms remote 3 ≠ 4 Normen im Bestand');
  });
});

describe('Readiness: Such-Vollaudit und Golden Set', () => {
  const watermark = watermarkOf([entry('lrgv', 1)]);
  const full = { writtenAt: T2, ok: true, norms: 3, failures: [], profile: { mode: 'full' } };

  it('Vollaudit: READY nur mit Modus full, 0 Fehlern, jüngerem Report und passender Normanzahl', () => {
    expect(searchAuditCheck(full, watermark, 3).status).toBe('pass');
    expect(searchAuditCheck(undefined, watermark, 3).detail).toContain('search-audit-full.json fehlt');
    expect(searchAuditCheck({ ...full, profile: { mode: 'fast' } }, watermark, 3).detail).toContain('Modus fast statt full');
    expect(searchAuditCheck({ ...full, ok: false, failures: [{}] }, watermark, 3).detail).toContain('1 Fehler, ok=false');
    expect(searchAuditCheck({ ...full, writtenAt: T0 }, watermark, 3).detail).toContain('älter als die jüngste Inhaltsänderung');
    expect(searchAuditCheck(full, watermark, 5).detail).toContain('geprüfte Normen 3 ≠ 5 im Bestand');
  });

  it('Golden Set: Fehlschläge blockieren, ein älterer Stand ist ein Hinweis', () => {
    const evaluation = (failed: number, evaluatedAt: string) => ({ matchMode: 'and-first', evaluatedAt, overall: { queries: 10, failed, recallAt10: 0.9 } });
    expect(goldenResultsCheck({ evaluations: [evaluation(0, T2)] }, watermark).status).toBe('pass');
    expect(goldenResultsCheck(undefined, watermark).status).toBe('fail');
    expect(goldenResultsCheck({ evaluations: [evaluation(1, T2)] }, watermark)).toMatchObject({ status: 'fail', detail: expect.stringContaining('1 Fehlschläge') });
    expect(goldenResultsCheck({ evaluations: [evaluation(0, T0)] }, watermark)).toMatchObject({ status: 'notice', detail: expect.stringContaining('älter als die letzte Manifeständerung') });
  });
});

describe('Readiness: Secret-Scan und Referenzbaseline', () => {
  const junit = (inner: string) => `<?xml version="1.0"?><testsuites tests="2" failures="0" errors="0"><testsuite name="x"><testcase classname="a" name="Ignorierte lokale Zustände &gt; enthält keine Zugangsdaten (statischer Secret-Scan)" time="1">${inner}</testcase><testcase classname="a" name="anderer Test" time="1"></testcase></testsuite></testsuites>`;

  it('Secret-Scan: grün nur mit vorhandenem, nicht fehlgeschlagenem Testfall', () => {
    expect(secretScanCheck(junit('')).status).toBe('pass');
    expect(secretScanCheck(undefined).detail).toContain('junit.xml fehlt');
    expect(secretScanCheck('<testsuites><testcase name="anderer"></testcase></testsuites>').detail).toContain('nicht im JUnit-Ergebnis');
    expect(secretScanCheck(junit('<failure message="Test timed out in 30000ms.&#10;more" type="Error">x</failure>'))).toMatchObject({ status: 'fail', detail: expect.stringContaining('Secret-Scan nicht grün: Test timed out') });
    expect(secretScanCheck(junit('<skipped/>')).status).toBe('fail');
  });

  it('Referenzbaseline: Pflichtabschnitte sind Blocker, offene Platzhalter ein Hinweis', () => {
    const complete = `# West-Referenzbaseline\n\n${REFERENCE_BASELINE_SECTIONS.map((heading) => `${heading}\n\nText.\n`).join('\n')}`;
    expect(referenceBaselineCheck(complete).status).toBe('pass');
    expect(referenceBaselineCheck(undefined).detail).toContain('WEST_REFERENCE_BASELINE.md fehlt');
    expect(referenceBaselineCheck('# Nur Titel\n\n## Kennzahlen\n').detail).toContain('fehlende Abschnitte: ## Referenzstichtag, ## Auditstatus, ## Einschränkungen');
    const withPlaceholders = complete.replace('Text.', 'Normen: <Anzahl> (Stand <Datum>) und ein <code>-Tag');
    expect(referenceBaselineCheck(withPlaceholders)).toMatchObject({ status: 'notice', detail: expect.stringContaining('2 Platzhalter noch offen (<Anzahl>, <Datum>)') });
  });
});

describe('Readiness: Gesamtprüfung auf leerem Arbeitsverzeichnis', () => {
  let root: string;
  const calls: SourceArea[] = [];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'readiness-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} }));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('meldet NOT READY mit den neuen Prüfungen als Blocker und nutzt die eingespeiste Fixpoint-Prüfung', async () => {
    const result = await evaluateReadiness(root, {
      env: {},
      checkEnumerationFixpoint: async (_root, area) => {
        calls.push(area);
        return { area, status: 'unavailable', changedItems: 0, changedKeys: [], detail: 'Stub' };
      },
    });
    expect(result.ready).toBe(false);
    const byId = new Map(result.checks.map((check) => [check.id, check]));
    // Ohne Enumeration wird die Fixpoint-Prüfung gar nicht aufgerufen (Enumeration fehlt bereits als Blocker).
    expect(calls).toEqual([]);
    for (const id of ['enumeration-lrgv', 'enumeration-lrmb', 'secrets', 'r2-audit', 'd1-remote', 'search-full', 'search-golden', 'reference-baseline', 'tests']) expect(byId.get(id)?.status, id).toBe('fail');
    expect(byId.get('stale-entries')).toMatchObject({ status: 'pass', detail: 'alle Einträge mit aktuellem Parser/Transformer' });
    expect(byId.get('review-queue')).toMatchObject({ status: 'pass', detail: '0 offene Fälle' });
    expect(result.blockers.some((blocker) => blocker.includes('R2_AUDIT.json fehlt'))).toBe(true);
    expect(result.blockers.some((blocker) => blocker.includes('WEST_REFERENCE_BASELINE.md fehlt'))).toBe(true);
  });
});
