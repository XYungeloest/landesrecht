import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { bodyMetrics, checkParseIntegrity, checkTransformIntegrity } from '@landesrecht/importer-recht-nrw/integrity.ts';
import { parseLegacyDocument } from '@landesrecht/importer-recht-nrw/legacy-parser.ts';
import { normalizeSourceLaw } from '@landesrecht/importer-recht-nrw/normalize.ts';
import { findUnresolvedReferences, transformText, transformToWest, type TransformationChange, type UnresolvedReference } from '@landesrecht/importer-recht-nrw/transform.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/version-page.ts';
import type { FetchedDocument } from '@landesrecht/importer-recht-nrw/fetcher.ts';

const fixtures = join(process.cwd(), 'tests', 'fixtures', 'recht-nrw');
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

function fakeDocument(url: string, text: string): FetchedDocument {
  const bytes = new TextEncoder().encode(text);
  return { url, finalUrl: url, status: 200, contentType: 'text/html; charset=UTF-8', retrievedAt: '2026-09-15T10:00:00.000Z', sha256: 'a'.repeat(64), bytes, fromCache: false };
}

function buildSourceLaw() {
  const pageUrl = 'https://recht.nrw.de/lrgv/gesetz/01012020-testgesetz-nordrhein-westfalen-testg-nrw';
  const page = parseVersionPage(fixture('version-page-legacy.html'), pageUrl);
  const parsed = parseLegacyDocument(fixture('legacy-text.htm'));
  return normalizeSourceLaw({
    page,
    pageDocument: fakeDocument(pageUrl, fixture('version-page-legacy.html')),
    textDocument: fakeDocument('https://recht.nrw.de/system/files/BH/9999-1.htm', fixture('legacy-text.htm')),
    body: { blocks: parsed.blocks, footnotes: parsed.footnotes, findings: parsed.findings, stats: parsed.stats, titleLines: parsed.head.titleLines, issuedLine: parsed.head.issuedLine, citationNote: parsed.head.citationNote },
    archivedPaths: { ['a'.repeat(64)]: 'sources/recht-nrw/term-424242/aaaa-version-page.html' },
  });
}

describe('Transformationsregeln', () => {
  it('ersetzt jurisdiktionelle Bezeichnungen und protokolliert jede Änderung', () => {
    const changes: TransformationChange[] = [];
    expect(transformText('Behörden des Landes Nordrhein-Westfalen und im Land Nordrhein-Westfalen', 'body[0].text', changes)).toBe('Behörden des Landes Westdeutschland und im Land Westdeutschland');
    expect(changes.map((change) => change.rule)).toEqual(['jurisdiction-name-genitive', 'jurisdiction-name-dative']);
    expect(transformText('nordrhein-westfälische Behörden', 'p', changes)).toBe('westdeutsche Behörden');
    expect(transformText('VwVfG NRW', 'meta.abbr', changes)).toBe('VwVfG West');
    expect(transformText('Testgesetz NRW – TestG NRW', 'meta.shortTitle', changes)).toBe('Testgesetz West – TestG West');
  });

  it('schützt Fundstellenkürzel, Zitate und externe Namen vor der Ersetzung', () => {
    const changes: TransformationChange[] = [];
    const text = 'geändert durch Gesetz vom 2.7.1996 (GV. NRW. S. 234), vgl. SGV. NRW. 2010 und MBl. NRW. S. 12; IT.NRW liefert Daten; https://recht.nrw.de/x bleibt.';
    expect(transformText(text, 'p', changes)).toBe(text);
    expect(changes).toEqual([]);
    expect(transformText('Landesbeamtengesetz NRW (GV. NRW. 2016 S. 310)', 'p', changes)).toBe('Landesbeamtengesetz West (GV. NRW. 2016 S. 310)');
  });

  it('meldet NRW-spezifische Begriffe als unresolved statt sie umzuschreiben', () => {
    const unresolved: UnresolvedReference[] = [];
    findUnresolvedReferences('Die Bezirksregierung Düsseldorf und die Landschaftsverbände im Rheinland sowie das Ministerium für Inneres des Landes Westdeutschland.', 'body[1].text', unresolved);
    expect(unresolved.map((entry) => [entry.term, entry.category])).toEqual([
      ['Rheinland', 'region'],
      ['Landschaftsverbände', 'institution'],
      ['Bezirksregierung', 'authority'],
      ['Düsseldorf', 'municipality'],
      ['Ministerium für Inneres', 'ministry'],
    ]);
    expect(unresolved.every((entry) => entry.manualDecisionRequired && entry.context.includes(entry.term))).toBe(true);
  });
});

describe('Transformation NRW → West', () => {
  const law = buildSourceLaw();
  const reserveSlug = (candidate: string): string => candidate;
  const { record, report } = transformToWest(law, { targetJurisdiction: 'west', baselineDate: SIMULATION_BASELINE_DATE, reserveSlug });

  it('erzeugt eine kanonische Ausgangsfassung mit beiden Zeitachsen', () => {
    expect(record.meta.jurisdiction).toBe('west');
    expect(record.meta.slug).toBe('testg-west');
    expect(record.meta.title).toBe('Testgesetz für das Land Westdeutschland');
    expect(record.meta.shortTitle).toBe('Testgesetz West');
    expect(record.meta.abbr).toBe('TestG West');
    expect(record.meta.externalIdentifiers).toEqual([{ system: 'recht-nrw', value: 'term:424242', url: 'https://recht.nrw.de/taxonomy/term/424242' }]);
    const version = record.versions[0]!;
    expect(version.versionId).toBe('2023-12-01');
    expect(version.simulationValidFrom).toBe('2023-12-01');
    expect(version.simulationValidTo).toBeNull();
    expect(version.sourceValidFrom).toBe('2020-01-01');
    expect(version.sourceValidTo).toBe('2023-12-15');
    expect(record.history.initialVersionId).toBe('2023-12-01');
    expect(record.history.entries[0]!.type).toBe('initial');
  });

  it('lässt Quellmetadaten unverändert und transformiert nur den Normtext', () => {
    expect(record.meta.initialCitation).toBe(law.citation);
    expect(record.meta.initialCitation).toContain('Nordrhein-Westfalen');
    expect(record.meta.sourceReferences).toEqual(law.sourceReferences);
    expect(record.meta.sourceReferences[0]!.url).toContain('recht.nrw.de');
    expect(record.meta.sourceReferences[0]!.localSource).toBe('sources/recht-nrw/term-424242/aaaa-version-page.html');
    expect(record.versions[0]!.sourceNotes).toEqual(law.sourceNotes);
    expect(record.versions[0]!.sourceNotes![0]!.text).toContain('GV. NRW.');
    expect(JSON.stringify(record.versions[0]!.body)).not.toContain('Land Nordrhein-Westfalen');
    expect(JSON.stringify(record.versions[0]!.body)).toContain('GV. NRW. 2016 S. 310');
    expect(JSON.stringify(record.versions[0]!.body)).toContain('Fn 2');
  });

  it('liefert einen maschinenlesbaren Transformationsreport', () => {
    expect(report).toMatchObject({ source: 'Nordrhein-Westfalen', target: 'west', sourceIdentity: 'term:424242', slug: 'testg-west', baselineDate: '2023-12-01' });
    expect(report.changes.length).toBeGreaterThanOrEqual(4);
    expect(report.changes[0]).toMatchObject({ path: 'meta.title', rule: 'jurisdiction-name', from: 'Land Nordrhein-Westfalen', to: 'Land Westdeutschland' });
    expect(report.changes.every((change) => typeof change.path === 'string' && change.from !== change.to)).toBe(true);
    expect(report.unresolved.map((entry) => entry.term)).toEqual(expect.arrayContaining(['Bezirksregierung', 'Düsseldorf', 'Landschaftsverbände']));
    expect(report.protectedFields).toContain('meta.sourceReferences');
  });

  it('besteht die Integritätsprüfung Source → Canonical', () => {
    const integrity = checkTransformIntegrity(bodyMetrics(law.body), bodyMetrics(record.versions[0]!.body));
    expect(integrity.ok).toBe(true);
  });
});

describe('Textintegrität', () => {
  it('erkennt fehlende Einheiten, verlorene Tabellen und Doppelungen', () => {
    const law = buildSourceLaw();
    const metrics = bodyMetrics(law.body);
    expect(metrics.units).toBe(2);
    expect(metrics.tables).toBe(2);
    expect(metrics.annexes).toBe(1);
    const missingUnit = checkParseIntegrity({ units: 3, tables: 2, textLength: metrics.textLength }, metrics);
    expect(missingUnit.ok).toBe(false);
    expect(missingUnit.checks.find((check) => check.name === 'units')?.ok).toBe(false);
    const lostTable = checkParseIntegrity({ units: 2, tables: 3, textLength: metrics.textLength }, metrics);
    expect(lostTable.checks.find((check) => check.name === 'tables')?.ok).toBe(false);
    const textLoss = checkParseIntegrity({ units: 2, tables: 2, textLength: metrics.textLength * 2 }, metrics);
    expect(textLoss.checks.find((check) => check.name === 'textLength')?.ok).toBe(false);
    const duplicated = bodyMetrics([...law.body, ...law.body]);
    expect(duplicated.duplicateLabels).toEqual(['§ 1', '§ 2']);
    expect(checkTransformIntegrity(metrics, duplicated).ok).toBe(false);
  });
});
