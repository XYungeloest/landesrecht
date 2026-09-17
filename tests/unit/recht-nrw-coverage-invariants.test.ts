/**
 * Coverage-Invarianten (mathematisch): je Bereich ist die Basis die Zahl der aktiven Normkandidaten, die Summe aller
 * Status ergibt die aktiven Einträge (Einträge = aktive + zusammengeführte), Evidenzquellen liegen außerhalb der
 * Basis, „Noch nicht verarbeitet“ zählt genau pending und processing. Geprüft gegen Fixtures (mit erzwungener
 * Abweichung → Fehler) und gegen den echten Stand (data/…).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { computeCoverage, COVERAGE_PATH, type AreaCoverage, type CoverageReport } from '@landesrecht/importer-recht-nrw/common/coverage.ts';
import { buildEnumeration, checkEnumerationInvariants, ENUMERATION_STATUSES, enumerationStatusCounts, type EnumerationFile, type SearchHit } from '@landesrecht/importer-recht-nrw/common/enumeration.ts';
import { emptyManifest, readManifest, type SourceArea } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { emptyReviewQueue } from '@landesrecht/importer-recht-nrw/common/review-queue.ts';

const root = resolveRepositoryRoot();
const NOW = '2026-09-15T12:00:00.000Z';

/** Zählidentitäten zwischen Enumeration und Coverage eines Bereichs; liefert Abweichungen als Text. */
export function coverageCountProblems(area: SourceArea, file: EnumerationFile, coverage: AreaCoverage): string[] {
  const problems: string[] = [];
  const active = file.items.filter((item) => !item.mergedInto);
  const merged = file.items.filter((item) => item.mergedInto);
  const counts = enumerationStatusCounts(file);
  const statusSum = ENUMERATION_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  if (statusSum !== active.length) problems.push(`${area}: Statussumme ${statusSum} ≠ aktive Einträge ${active.length}`);
  if (active.length + merged.length !== file.items.length) problems.push(`${area}: aktive ${active.length} + zusammengeführte ${merged.length} ≠ Einträge ${file.items.length}`);
  const candidates = active.filter((item) => item.role === 'norm-candidate');
  const evidence = active.filter((item) => item.role === 'evidence');
  if (candidates.length + evidence.length !== active.length) problems.push(`${area}: Kandidaten ${candidates.length} + Evidenz ${evidence.length} ≠ aktive ${active.length}`);
  if (coverage.scope !== 'bulk') problems.push(`${area}: Umfang ${coverage.scope} statt bulk`);
  if (coverage.base.count !== candidates.length) problems.push(`${area}: Basis ${coverage.base.count} ≠ aktive Normkandidaten ${candidates.length}`);
  if (coverage.metrics.enumeratedTerms?.count !== candidates.length) problems.push(`${area}: enumeratedTerms ${coverage.metrics.enumeratedTerms?.count} ≠ ${candidates.length}`);
  const pending = candidates.filter((item) => item.status === 'pending' || item.status === 'processing').length;
  if (coverage.metrics.pending?.count !== pending) problems.push(`${area}: pending ${coverage.metrics.pending?.count} ≠ ${pending}`);
  if (area === 'lrgv' && coverage.metrics.evidenceNotices?.count !== evidence.length) problems.push(`${area}: evidenceNotices ${coverage.metrics.evidenceNotices?.count} ≠ ${evidence.length}`);
  // Jeder Kandidat hat genau einen Status; Kandidaten je Status summieren sich zur Basis.
  const byStatus = ENUMERATION_STATUSES.map((status) => candidates.filter((item) => item.status === status).length);
  if (byStatus.reduce((sum, value) => sum + value, 0) !== coverage.base.count) problems.push(`${area}: Kandidaten je Status ${byStatus.join('+')} ≠ Basis ${coverage.base.count}`);
  for (const [key, metric] of Object.entries(coverage.metrics)) {
    if (metric.count < 0 || (coverage.base.count > 0 && metric.percent !== Math.round((metric.count * 1000) / coverage.base.count) / 10)) problems.push(`${area}: Kennzahl ${key} ${metric.count}/${coverage.base.count} → ${metric.percent}`);
    if (coverage.base.count === 0 && metric.percent !== null) problems.push(`${area}: Kennzahl ${key} mit Anteil ohne Basis`);
  }
  return problems;
}

function fixtureEnumeration(area: SourceArea): EnumerationFile {
  const base = area === 'lrgv' ? 'https://recht.nrw.de/lrgv' : 'https://recht.nrw.de/lrmb';
  const type = area === 'lrgv' ? 'gesetz' : 'verwaltungsvorschrift';
  const names = ['a-pending', 'b-processing', 'c-done', 'd-review', 'e-failed', 'f-excluded', 'g-merged', 'h-done-2', 'i-evidence'];
  const urls = names.map((name) => (name === 'i-evidence' && area === 'lrgv' ? `${base}/bekanntmachung/01012021-${name}` : `${base}/${type}/01012020-${name}`));
  const hits: SearchHit[] = urls.map((url, index) => ({ nodeId: String(index + 1), url, indexType: area === 'lrgv' ? 'state_law_and_regulations' : 'state_law_ministerial_gazette', title: names[index] === 'i-evidence' ? 'Bekanntmachung über das Inkrafttreten des Staatsvertrages' : `Runderlass ${names[index]}` }));
  const file = buildEnumeration({ area, sitemap: { pages: 1, urls }, search: { total: hits.length, hits }, now: NOW });
  const item = (name: string) => file.items.find((candidate) => candidate.urls.some((url) => url.endsWith(name)))!;
  Object.assign(item('b-processing'), { status: 'processing', attempts: 1 });
  Object.assign(item('c-done'), { status: 'done', sourceIdentity: 'term:3', attempts: 1 });
  Object.assign(item('d-review'), { status: 'review', sourceIdentity: 'term:4', attempts: 1 });
  Object.assign(item('e-failed'), { status: 'failed', attempts: 2, lastError: { code: 'x', message: 'x' } });
  Object.assign(item('f-excluded'), { status: 'excluded', sourceIdentity: 'term:6', attempts: 1 });
  Object.assign(item('g-merged'), { status: 'done', mergedInto: 'term:3' });
  Object.assign(item('h-done-2'), { status: 'done', sourceIdentity: 'term:8', attempts: 1 });
  return file;
}

describe('Coverage-Invarianten gegen Fixtures', () => {
  it('Basis = aktive Kandidaten, Statussumme = aktive Einträge, Evidenz außerhalb der Basis, pending = pending + processing', () => {
    const enumerations = { lrgv: fixtureEnumeration('lrgv'), lrmb: fixtureEnumeration('lrmb') };
    const report = computeCoverage({ manifest: emptyManifest(), queue: emptyReviewQueue(), enumerations, contentSlugs: new Set(), now: NOW });
    for (const area of ['lrgv', 'lrmb'] as const) {
      const file = enumerations[area];
      expect(checkEnumerationInvariants(file)).toEqual([]);
      expect(coverageCountProblems(area, file, report[area])).toEqual([]);
      const counts = enumerationStatusCounts(file);
      // LRGV: die Bekanntmachung ist Evidenzquelle (pending, außerhalb der Basis); LRMB: derselbe Eintrag ist ein Kandidat.
      expect(counts).toEqual({ pending: 2, processing: 1, done: 2, review: 1, failed: 1, excluded: 1 });
      expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(file.items.length - 1);
      expect(report[area].base.count).toBe(area === 'lrgv' ? 7 : 8);
      expect(report[area].metrics.pending).toEqual(area === 'lrgv' ? { count: 2, percent: 28.6 } : { count: 3, percent: 37.5 });
    }
    expect(report.lrgv.metrics.evidenceNotices).toEqual({ count: 1, percent: 14.3 });
    // Fehler bei Abweichung: unbekannter Status, doppelte Zählung, falsche Basis.
    const broken = { ...enumerations.lrgv, items: enumerations.lrgv.items.map((item) => (item.urls[0]!.endsWith('a-pending') ? { ...item, status: 'weird' as EnumerationFile['items'][number]['status'] } : item)) };
    expect(coverageCountProblems('lrgv', broken, report.lrgv)).toContain('lrgv: Statussumme 7 ≠ aktive Einträge 8');
    expect(coverageCountProblems('lrgv', enumerations.lrgv, { ...report.lrgv, base: { ...report.lrgv.base, count: 99 } })).toContain('lrgv: Basis 99 ≠ aktive Normkandidaten 7');
    expect(coverageCountProblems('lrgv', enumerations.lrgv, { ...report.lrgv, metrics: { ...report.lrgv.metrics, pending: { count: 1, percent: 14.3 } } })).toContain('lrgv: pending 1 ≠ 2');
  });
});

describe('Coverage-Invarianten gegen den echten Stand (data/)', () => {
  it.each(['lrgv', 'lrmb'] as const)('%s: gespeicherter Coverage-Report und Enumeration stimmen in Basis, Status und Teilmengen überein', async (area) => {
    const enumerationText = await readFile(join(root, 'data', 'imports', 'recht-nrw', `enumeration-${area}.json`), 'utf8').catch(() => undefined);
    const coverageText = await readFile(join(root, COVERAGE_PATH), 'utf8').catch(() => undefined);
    if (!enumerationText || !coverageText) return;
    const file = JSON.parse(enumerationText) as EnumerationFile;
    const stored = JSON.parse(coverageText) as CoverageReport;
    const manifest = await readManifest(root);
    // Teilmengen: verarbeitete Kandidaten haben einen Manifesteintrag oder sind ohne Kennung dokumentiert; Manifest ⊆ Enumeration.
    const identities = new Set(file.items.flatMap((item) => [item.sourceIdentity, item.mergedInto]).filter(Boolean));
    const entries = manifest.entries.filter((entry) => entry.sourceArea === area);
    expect(entries.filter((entry) => !identities.has(entry.sourceIdentity)).map((entry) => entry.sourceIdentity)).toEqual([]);
    expect(stored[area].crosscheck?.manifestWithoutEnumeration).toBe(0);
    const problems = coverageCountProblems(area, file, stored[area]);
    expect(problems).toEqual([]);
    // Die Kennzahlen des gespeicherten Reports entsprechen einer Neuberechnung aus denselben Dateien (Basis und Status).
    const recomputed = computeCoverage({ manifest, queue: emptyReviewQueue(), enumerations: { [area]: file }, contentSlugs: new Set(entries.map((entry) => entry.targetSlug).filter(Boolean)), now: NOW });
    expect(recomputed[area].base.count).toBe(stored[area].base.count);
    expect(recomputed[area].metrics.pending).toEqual(stored[area].metrics.pending);
    expect(recomputed[area].metrics.processed).toEqual(stored[area].metrics.processed);
  });
});
