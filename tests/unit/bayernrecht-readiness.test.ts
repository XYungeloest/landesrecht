/**
 * Readiness, Audit und Coverage des BayWü-Adapters.
 *
 * Die Bereitschaftsprüfung ist die Stelle, an der ein Fehler am teuersten ist: Ein falsches READY
 * gibt einen Bulk-Lauf frei, den der Stand nicht trägt; ein falsches NOT READY hält ihn grundlos auf.
 * Deshalb wird hier **jede Prüfung einzeln** in beiden Ausgängen geprüft – grün und Blocker – und
 * nicht nur das Gesamtergebnis, das eine einzelne kaputte Prüfung sonst verdecken könnte.
 *
 * Dazu kommen die drei Eigenschaften, auf die sich die Aufrufer verlassen:
 *   - **Determinismus**: zweimal derselbe Bestand, zweimal dieselbe Ausgabe, Byte für Byte.
 *   - **`--json`-Form**: id, label, status, detail je Prüfung; status nur `pass | notice | fail`.
 *   - **Kein Schreiben**: readiness und audit lesen; coverage schreibt nur mit `--write` und beim
 *     zweiten Lauf nichts mehr.
 *
 * Der echte Bestand wird nie verändert: Jeder Lauf arbeitet auf einem temporären Root.
 */
import { mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { IMPLEMENTED_COMMANDS, runCli, type Io } from '@landesrecht/importer-bayernrecht/cli.ts';
import { SOURCE_SYSTEM, TARGET_JURISDICTION, type SourceArea } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import type { ImportManifest, ManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import type { OverrideRegistry } from '@landesrecht/importer-bayernrecht/common/overrides.ts';
import type { ReviewItem, ReviewQueue } from '@landesrecht/importer-bayernrecht/common/review.ts';
import { REVIEW_QUEUE_SCHEMA } from '@landesrecht/importer-bayernrecht/common/review.ts';
import type { SlugRegistry } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { SLUG_REGISTRY_SCHEMA } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { corpusPackagePath, corpusSidecarPath, CORPUS_SCHEMA, type CorpusEntry, type CorpusFile } from '@landesrecht/importer-bayernrecht/corpus/run.ts';
import { enumerationFingerprint, ENUMERATION_SCHEMA, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';
import { GAP_SCHEMA, type GapReport } from '@landesrecht/importer-bayernrecht/enumerate/gap.ts';
import {
  accessCheck,
  commandsCheck,
  corpusCheck,
  enumerationCheck,
  enumerationGapCheck,
  fixpointCheck,
  fullPathCheck,
  localOnlyCheck,
  manifestR2Objects,
  parseJUnit,
  readinessDocCheck,
  REQUIRED_SCRIPTS,
  REQUIRED_TEST_MARKERS,
  scopeDecisionCheck,
  secretScanCheck,
  summarize,
  testsCheck,
  transformerCheck,
  type ReadinessCheck,
} from '@landesrecht/importer-bayernrecht/readiness/checks.ts';
import { baywueDatabaseIds, evaluateReadiness, renderReadiness, remoteStateTraces, scanForSecrets, runFullPath } from '@landesrecht/importer-bayernrecht/readiness/evaluate.ts';
import {
  auditRawSources,
  checkCorpusAgainstEnumeration,
  checkEnumerationAgainstManifest,
  checkOverridesAgainstManifest,
  checkReviewAgainstManifest,
  checkSlugRegistry,
  runAudit,
} from '@landesrecht/importer-bayernrecht/audit/audit.ts';
import { collectCoverage, computeCoverage, coverageSummary, COVERAGE_MARKDOWN_PATH, COVERAGE_PATH, renderCoverageMarkdown, share, writeCoverage } from '@landesrecht/importer-bayernrecht/audit/coverage.ts';

import { cleanupTempRoots, sampleManifestEntry, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

/* ------------------------------------------------------------------ Prüflinge (synthetisch, klein) */

const statusOf = (check: ReadinessCheck): string => check.status;

function robotsFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: '2026-09-17',
    hosts: [
      {
        host: 'www.gesetze-bayern.de',
        role: 'Zielportal',
        status: 'erlaubt',
        verbatim: 'User-agent: *\nAllow: /',
        effectiveRuleForOwnCrawler: 'Allow: /',
        fetch: { url: 'https://www.gesetze-bayern.de/robots.txt', httpStatus: 200, contentType: 'text/plain', byteLength: 22, sha256: 'a'.repeat(64), retrievedAt: '2026-09-17T07:47:21.652Z' },
        ...overrides,
      },
    ],
  };
}

function enumerationItem(documentId: string, overrides: Partial<EnumerationItem> = {}): EnumerationItem {
  return {
    key: documentId,
    sourceIdentity: documentId,
    documentId,
    title: `Titel ${documentId}`,
    titleSource: 'fortfuehrungsnachweis',
    normType: 'ges',
    normTypeSource: 'facet-hitlist',
    sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${documentId}`,
    zipUrl: `https://www.gesetze-bayern.de/Content/Zip/${documentId}`,
    listingUrl: 'https://www.gesetze-bayern.de/Content/Document/ffn',
    sourceSha256: 'b'.repeat(64),
    retrievedAt: '2026-09-17T07:48:50.997Z',
    listings: [{ kind: 'fortfuehrungsnachweis', url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z' }],
    status: 'pending',
    signals: { fortfuehrungsnachweis: true, facet: true, manifest: false },
    attempts: 0,
    ...overrides,
  };
}

/** Enumerationsdatei mit passendem Fingerabdruck – wie der Importer sie schreibt. */
function enumerationFixture(area: SourceArea, items: EnumerationItem[], overrides: Partial<EnumerationFile> = {}): EnumerationFile {
  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate: '2023-12-01',
    generatedAt: '2026-09-17T09:38:02.482Z',
    contentFingerprint: '',
    sources: {
      fortfuehrungsnachweis: { url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 1000, entries: items.length, sections: 1, unlinkedRows: 0 },
      facets: { normTypes: ['ges'], pages: 1, documents: items.length, total: items.length, complete: true, inventoryPath: 'data/audits/bayernrecht/facet-inventory.json', inventoryFingerprint: 'c'.repeat(64) },
    },
    crosscheck: {
      fortfuehrungsnachweisEntries: items.length,
      fortfuehrungsnachweisUnlinkedRows: 0,
      facetDocuments: items.length,
      facetTotal: items.length,
      inBoth: items.length,
      onlyFortfuehrungsnachweis: 0,
      onlyFacet: 0,
      onlyFortfuehrungsnachweisIds: [],
      onlyFacetIds: [],
      items: items.length,
      withNormType: items.length,
      withBayRsNumber: 0,
      carriedFromManifest: 0,
      duplicateIds: 0,
      ok: true,
      problems: [],
      notes: [],
    },
    items,
    ...overrides,
  };
  return { ...file, contentFingerprint: enumerationFingerprint(file) };
}

function gapFixture(unresolved: string[]): GapReport {
  return {
    schemaVersion: GAP_SCHEMA,
    generatedAt: '2026-09-17T09:38:02.653Z',
    totals: { facetDocuments: 100, fortfuehrungsnachweisEntries: 98, onlyFacet: 2 + unresolved.length, onlyFortfuehrungsnachweis: 0, byNormType: [] },
    groups: [
      { group: 'tarifvertrag', title: 'Tarifverträge', reason: 'Grund', count: 2, documentIds: ['TV_A', 'TV_B'] },
      { group: 'bundeseinheitliche-anordnung', title: 'Bundeseinheitlich', reason: 'Grund', count: 0, documentIds: [] },
      { group: 'gliederungsstelle-anderweitig-belegt', title: 'Gliederungsstelle', reason: 'Grund', count: 0, documentIds: [] },
      { group: 'haushaltsrundschreiben-jahresfassung', title: 'Haushalt', reason: 'Grund', count: 0, documentIds: [] },
      { group: 'ungeklaert', title: 'Ungeklärt', reason: 'Grund', count: unresolved.length, documentIds: unresolved },
    ],
    documents: [],
    onlyFortfuehrungsnachweisIds: [],
    open: [],
  };
}

function corpusEntry(documentId: string, overrides: Partial<CorpusEntry> = {}): CorpusEntry {
  return {
    documentId,
    sourceArea: 'landesrecht',
    normType: 'ges',
    title: `Titel ${documentId}`,
    reason: 'Beispielnorm',
    expectedCases: ['dtd-byrecht-norm'],
    cases: ['dtd-byrecht-norm', 'verweise'],
    missingExpected: [],
    additionalCases: ['verweise'],
    package: {
      documentId,
      url: `https://www.gesetze-bayern.de/Content/Zip/${documentId}`,
      sha256: 'd'.repeat(64),
      contentType: 'application/zip',
      byteLength: 1234,
      retrievedAt: '2026-09-17T09:38:37.382Z',
      documentUrl: `https://www.gesetze-bayern.de/Content/Document/${documentId}`,
      path: corpusPackagePath(documentId),
      sidecarPath: corpusSidecarPath(documentId),
      entries: 3,
      xmlPath: `bayportalnorm/${documentId}.xml`,
      xmlByteLength: 100,
      pdfAttachments: 0,
      imageAttachments: 0,
    },
    counts: { einzelnorm: 1, gliederung: 0, jurAbsatz: 1, annex: 0, table: 0, tableRows: 0, footnotes: 0, references: 1, sentenceNumbers: 0, superscripts: 0, repealedPlaceholders: 0 },
    ...overrides,
  };
}

function corpusFixture(entries: CorpusEntry[], overrides: Partial<CorpusFile> = {}): CorpusFile {
  return {
    schemaVersion: CORPUS_SCHEMA,
    baselineDate: '2023-12-01',
    generatedAt: '2026-09-17T09:48:08.659Z',
    contentFingerprint: 'e'.repeat(64),
    coverage: { requirements: [{ id: 'umfang', description: 'Normen im Korpus', minimum: 1, actual: entries.length, ok: entries.length >= 1 }], ok: true },
    entries,
    ...overrides,
  };
}

/** JUnit-Ergebnis mit den geforderten BayWü-Prüfungen; `broken` macht genau einen Fall rot. */
function junitXml(options: { broken?: string; failures?: number; skipped?: boolean; markers?: readonly string[] } = {}): string {
  const markers = options.markers ?? REQUIRED_TEST_MARKERS;
  const cases = markers.map((marker) => {
    const body = options.broken === marker ? '<failure message="kaputt"></failure>' : options.skipped && marker === markers[0] ? '<skipped/>' : '';
    return `    <testcase classname="tests/unit/bayernrecht-readiness.test.ts" name="${marker} &gt; prüft etwas">${body}</testcase>`;
  });
  const secret = '    <testcase classname="tests/unit/content-and-config.test.ts" name="enthält keine Zugangsdaten in versionierten Dateien (statischer Secret-Scan)"></testcase>';
  const skipped = options.skipped ? 1 : 0;
  return [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    `<testsuites name="vitest tests" tests="${markers.length + 1}" failures="${options.failures ?? (options.broken ? 1 : 0)}" errors="0" time="1">`,
    '  <testsuite name="tests/unit/bayernrecht-readiness.test.ts" tests="1" failures="0" errors="0" skipped="' + skipped + '" time="1">',
    ...cases,
    secret,
    '  </testsuite>',
    '</testsuites>',
  ].join('\n');
}

const WRANGLER_PLACEHOLDER = `{
  "d1_databases": [
    { "binding": "LANDESRECHT_WEST", "database_name": "landesrecht-west", "database_id": "00000000-0000-4000-8000-000000000001" },
    { "binding": "LANDESRECHT_BAYWUE", "database_name": "landesrecht-baywue", "database_id": "00000000-0000-4000-8000-000000000004" }
  ],
  "env": {
    "staging": {
      "d1_databases": [
        { "binding": "LANDESRECHT_BAYWUE", "database_name": "landesrecht-baywue-staging", "database_id": "00000000-0000-4000-8000-000000000104" }
      ]
    }
  }
}`;

const WRANGLER_REAL = WRANGLER_PLACEHOLDER.replace('00000000-0000-4000-8000-000000000004', '091224a9-da55-4262-b682-2b6bde0bd302');

const LEGAL_SCOPE_DECIDED = '# Rechtlicher Umfang\n\n## Quellen je Land\n\nBayWü bezieht aus BAYERN.RECHT.\n';
const LEGAL_SCOPE_OPEN = `${LEGAL_SCOPE_DECIDED}\n## Offene Entscheidung: zwei Dokumentklassen in BAYERN.RECHT\n\nDiese Entscheidung ist redaktionell und steht aus.\n\n## Umsetzung\n\nSpäter.\n`;

const READINESS_DOC_TEXT = '# Bereitschaft\n\n## 1 Was steht\n\nA\n\n## 2 Was fehlt\n\nB\n\n## 3 GO/No-Go\n\nC\n\n## 4 Nächste Schritte in der Reihenfolge ihres Werts\n\nD\n';

async function write(root: string, relative: string, content: string): Promise<void> {
  const path = join(root, relative);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/**
 * Ein vollständiger, in sich stimmiger Bestand auf einem temporären Root – der Ausgangspunkt, von dem
 * aus die einzelnen Blocker gezielt erzeugt werden.
 */
async function readyRoot(): Promise<string> {
  const root = await tempRoot('landesrecht-bayernrecht-readiness-');
  await write(root, 'data/audits/bayernrecht/discovery/robots.json', JSON.stringify(robotsFixture(), null, 2));
  await write(root, 'docs/BAYERN_SOURCE_DISCOVERY.md', '# Quellenerkundung\n\nDie robots.txt erlaubt den Abruf.\n');
  await write(root, 'docs/BAYERN_BULK_READINESS.md', READINESS_DOC_TEXT);
  await write(root, 'docs/LEGAL_SCOPE.md', LEGAL_SCOPE_DECIDED);
  await write(root, 'data/imports/bayernrecht/enumeration-landesrecht.json', JSON.stringify(enumerationFixture('landesrecht', [enumerationItem('BayTestG')]), null, 2));
  await write(root, 'data/imports/bayernrecht/enumeration-vwv.json', JSON.stringify(enumerationFixture('vwv', [enumerationItem('BayVwVTest', { normType: 'vv' })]), null, 2));
  await write(root, 'data/audits/bayernrecht/enumeration-gap.json', JSON.stringify(gapFixture([]), null, 2));
  await write(root, 'data/imports/bayernrecht/corpus.json', JSON.stringify(corpusFixture([corpusEntry('BayTestG')]), null, 2));
  await write(root, 'test-results/junit.xml', junitXml());
  await write(root, 'apps/web/wrangler.jsonc', WRANGLER_PLACEHOLDER);
  await write(root, 'package.json', JSON.stringify({ scripts: Object.fromEntries(REQUIRED_SCRIPTS.map((script) => [script, 'node scripts/import-bayernrecht.ts'])) }, null, 2));
  return root;
}

/** Fixpunktprüfung als Einsetzung: Der echte Rebuild braucht den Abrufcache, den ein Testroot nicht hat. */
const fixpointStub = (status: 'fixpoint' | 'changed' | 'unavailable' = 'fixpoint') =>
  async (_root: string, area: SourceArea): Promise<{ area: SourceArea; status: 'fixpoint' | 'changed' | 'unavailable'; differences: string[]; detail: string }> => ({
    area,
    status,
    differences: [],
    detail: status === 'fixpoint' ? 'Rebuild unverändert' : status === 'changed' ? 'Rebuild weicht ab' : 'Eingaben nicht im Cache',
  });

const evaluate = (root: string, overrides: Parameters<typeof evaluateReadiness>[1] = {}) =>
  evaluateReadiness(root, { implementedCommands: IMPLEMENTED_COMMANDS, checkEnumerationFixpoint: fixpointStub(), skipFullPath: true, ...overrides });

const checkById = (result: { checks: ReadinessCheck[] }, id: string): ReadinessCheck => {
  const check = result.checks.find((candidate) => candidate.id === id);
  if (!check) throw new Error(`Prüfung ${id} fehlt im Ergebnis (${result.checks.map((candidate) => candidate.id).join(', ')})`);
  return check;
};

/* ------------------------------------------------------------------ 1. Zugriffslage */

describe('Readiness: Zugriffslage des Quellportals', () => {
  it('ist belegt, wenn Rohbefund und Einordnung vorliegen', () => {
    const check = accessCheck(robotsFixture(), '# Erkundung\nrobots.txt: Allow: /\n');
    expect(statusOf(check)).toBe('pass');
    // Die Meldung nennt den Wortlaut, nicht nur ein „ok“.
    expect(check.detail).toContain('User-agent: * / Allow: /');
    expect(check.detail).toContain('HTTP 200');
  });

  it('blockt ohne Rohbefund, bei fremdem Status und ohne Einordnung', () => {
    expect(statusOf(accessCheck(undefined, 'doc'))).toBe('fail');
    expect(statusOf(accessCheck(robotsFixture({ status: 'untersagt' }), 'robots.txt'))).toBe('fail');
    expect(statusOf(accessCheck({ hosts: [] }, 'robots.txt'))).toBe('fail');
    const ohneDoc = accessCheck(robotsFixture(), undefined);
    expect(statusOf(ohneDoc)).toBe('fail');
    expect(ohneDoc.detail).toContain('docs/BAYERN_SOURCE_DISCOVERY.md');
  });

  it('blockt, wenn der Wortlaut den Abruf nicht erlaubt oder der Beleg unvollständig ist', () => {
    expect(statusOf(accessCheck(robotsFixture({ verbatim: 'User-agent: *\nDisallow: /' }), 'robots.txt'))).toBe('fail');
    expect(statusOf(accessCheck(robotsFixture({ fetch: { httpStatus: 404, sha256: 'a'.repeat(64), retrievedAt: 'x' } }), 'robots.txt'))).toBe('fail');
    expect(statusOf(accessCheck(robotsFixture({ fetch: { httpStatus: 200, retrievedAt: 'x' } }), 'robots.txt'))).toBe('fail');
  });
});

/* ------------------------------------------------------------------ 2. Enumeration und Fixpunkt */

describe('Readiness: Enumeration und Fixpunkt', () => {
  it('ist in Ordnung, wenn Abgleich, Facettenbestand und Fingerabdruck zusammenpassen', () => {
    const check = enumerationCheck('landesrecht', enumerationFixture('landesrecht', [enumerationItem('BayTestG')]));
    expect(statusOf(check)).toBe('pass');
    expect(check.detail).toContain('1 Dokumente');
  });

  it('blockt ohne Datei, ohne Einträge, bei gestörtem Abgleich und bei unvollständiger Facette', () => {
    expect(statusOf(enumerationCheck('vwv', undefined))).toBe('fail');
    expect(statusOf(enumerationCheck('landesrecht', enumerationFixture('landesrecht', [])))).toBe('fail');
    const gestoert = enumerationFixture('landesrecht', [enumerationItem('BayTestG')]);
    gestoert.crosscheck = { ...gestoert.crosscheck, ok: false, problems: ['Trefferzähler weicht ab'] };
    const check = enumerationCheck('landesrecht', { ...gestoert, contentFingerprint: enumerationFingerprint(gestoert) });
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('Trefferzähler weicht ab');
    const unvollstaendig = enumerationFixture('landesrecht', [enumerationItem('BayTestG')]);
    unvollstaendig.sources.facets!.complete = false;
    expect(statusOf(enumerationCheck('landesrecht', { ...unvollstaendig, contentFingerprint: enumerationFingerprint(unvollstaendig) }))).toBe('fail');
  });

  it('blockt, wenn der gespeicherte Fingerabdruck nicht zum Inhalt passt (Datei von Hand verändert)', () => {
    const file = enumerationFixture('landesrecht', [enumerationItem('BayTestG')]);
    const check = enumerationCheck('landesrecht', { ...file, contentFingerprint: 'f'.repeat(64) });
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('außerhalb des Importers verändert');
  });

  it('wertet den Fixpunkt: erreicht ist ok, Abweichung ist Blocker, fehlender Cache nur ein Hinweis', () => {
    expect(statusOf(fixpointCheck({ area: 'landesrecht', status: 'fixpoint', differences: [], detail: 'unverändert' }))).toBe('pass');
    expect(statusOf(fixpointCheck({ area: 'landesrecht', status: 'changed', differences: ['x'], detail: 'weicht ab' }))).toBe('fail');
    expect(statusOf(fixpointCheck({ area: 'landesrecht', status: 'unavailable', differences: [], detail: 'kein Cache' }))).toBe('notice');
  });
});

/* ------------------------------------------------------------------ 3. Abdeckungslücke */

describe('Readiness: Abdeckungslücke', () => {
  it('ist aufgeklärt, wenn keine Dokumente ungeklärt bleiben', () => {
    const check = enumerationGapCheck(gapFixture([]));
    expect(statusOf(check)).toBe('pass');
    expect(check.detail).toContain('keine ungeklärten Dokumente');
  });

  it('blockt mit Zahl und Kennungen, solange Dokumente ungeklärt sind', () => {
    const check = enumerationGapCheck(gapFixture(['BayBodSchO', 'BayVV_631_B_15643']));
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('2 Dokumente bleiben ungeklärt');
    expect(check.detail).toContain('BayBodSchO');
    expect(check.detail).toContain('BayVV_631_B_15643');
  });

  it('blockt ohne Bericht und wenn die Gruppe „ungeklaert“ im Bericht fehlt', () => {
    expect(statusOf(enumerationGapCheck(undefined))).toBe('fail');
    const report = gapFixture([]);
    const check = enumerationGapCheck({ ...report, groups: report.groups.filter((group) => group.group !== 'ungeklaert') });
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('nicht bilanziert');
  });
});

/* ------------------------------------------------------------------ 4. Beispielkorpus */

describe('Readiness: Beispielkorpus', () => {
  it('ist vollständig, wenn jede Anforderung erfüllt ist und kein erwarteter Strukturfall fehlt', () => {
    expect(statusOf(corpusCheck(corpusFixture([corpusEntry('BayTestG')])))).toBe('pass');
  });

  it('blockt bei nicht erfüllter Anforderung, bei fehlendem Strukturfall und ohne Datei', () => {
    const zuKlein = corpusFixture([]);
    zuKlein.coverage = { requirements: [{ id: 'umfang', description: 'Normen im Korpus', minimum: 25, actual: 0, ok: false }], ok: false };
    const check = corpusCheck(zuKlein);
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('umfang 0/25');

    const fehlenderFall = corpusFixture([corpusEntry('BayTestG', { missingExpected: ['tabellen'] })]);
    const zweite = corpusCheck(fehlenderFall);
    expect(statusOf(zweite)).toBe('fail');
    expect(zweite.detail).toContain('BayTestG (tabellen)');

    expect(statusOf(corpusCheck(undefined))).toBe('fail');
  });
});

/* ------------------------------------------------------------------ 5. Ganzer Weg */

describe('Readiness: der ganze Weg über alle Bausteine', () => {
  it('ist in Ordnung, wenn jede Norm des Korpus durchläuft', () => {
    expect(statusOf(fullPathCheck({ total: 28, checked: 28, missing: [], problems: [] }))).toBe('pass');
  });

  it('meldet fehlende Exportpakete als Hinweis mit beiden Zahlen, nicht als Blocker', () => {
    const check = fullPathCheck({ total: 28, checked: 25, missing: ['A', 'B', 'C'], problems: [] });
    expect(statusOf(check)).toBe('notice');
    expect(check.detail).toContain('25 von 28');
    expect(check.detail).toContain('3 Exportpakete fehlen');
    expect(check.detail).toContain('sources/README.md');
  });

  it('blockt bei jedem Fehler auf dem Weg – auch wenn nur ein Teil des Korpus vorliegt', () => {
    const check = fullPathCheck({ total: 28, checked: 3, missing: ['X'], problems: ['BayTestG: ABBRUCH kaputt'] });
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('BayTestG: ABBRUCH kaputt');
    expect(statusOf(fullPathCheck({ total: 0, checked: 0, missing: [], problems: [] }))).toBe('fail');
  });

  it('läuft ohne Korpus ins Leere, statt einen Erfolg zu behaupten', async () => {
    const report = await runFullPath(await tempRoot('landesrecht-bayernrecht-weg-'), undefined);
    expect(report).toEqual({ total: 0, checked: 0, missing: [], problems: [] });
  });

  it('zählt ein fehlendes Exportpaket als fehlend, nicht als Fehler', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-weg-');
    const report = await runFullPath(root, corpusFixture([corpusEntry('BayTestG')]));
    expect(report).toEqual({ total: 1, checked: 0, missing: ['BayTestG'], problems: [] });
  });

  it('meldet ein unlesbares Paket als Fehler auf dem Weg', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-weg-');
    await write(root, corpusPackagePath('BayTestG'), 'kein ZIP');
    const report = await runFullPath(root, corpusFixture([corpusEntry('BayTestG')]));
    expect(report.checked).toBe(1);
    expect(report.missing).toEqual([]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain('BayTestG');
  });
});

/* ------------------------------------------------------------------ 6. Scope */

describe('Readiness: Scope-Entscheidung', () => {
  it('blockt, solange docs/LEGAL_SCOPE.md den Abschnitt als offen führt', () => {
    const check = scopeDecisionCheck(LEGAL_SCOPE_OPEN);
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('Offene Entscheidung: zwei Dokumentklassen in BAYERN.RECHT');
    expect(check.detail).toContain('steht aus');
    // Der Importer trifft die Entscheidung nicht – das steht auch in der Meldung.
    expect(check.detail).toContain('der Importer trifft sie nicht');
  });

  it('ist in Ordnung, sobald der Abschnitt nicht mehr geführt wird', () => {
    expect(statusOf(scopeDecisionCheck(LEGAL_SCOPE_DECIDED))).toBe('pass');
  });

  it('blockt, wenn das Scope-Dokument ganz fehlt', () => {
    expect(statusOf(scopeDecisionCheck(undefined))).toBe('fail');
  });
});

/* ------------------------------------------------------------------ 7.–9. Überleitung, Tests, Zugangsdaten */

describe('Readiness: Überleitung, Testsuite und Zugangsdaten', () => {
  const junit = () => parseJUnit(junitXml());

  it('belegt die Überleitung über Version und grüne Idempotenzprüfungen', () => {
    const check = transformerCheck('bayernrecht-transformer/1.0.0', junit());
    expect(statusOf(check)).toBe('pass');
    expect(check.detail).toContain('bayernrecht-transformer/1.0.0');
  });

  it('blockt ohne Version, ohne Testergebnis und bei roter Idempotenzprüfung', () => {
    expect(statusOf(transformerCheck(undefined, junit()))).toBe('fail');
    expect(statusOf(transformerCheck('bayernrecht-transformer/1.0.0', undefined))).toBe('fail');
    const rot = parseJUnit(junitXml({ broken: 'Idempotenz und Doppelungsfreiheit' }));
    expect(statusOf(transformerCheck('bayernrecht-transformer/1.0.0', rot))).toBe('fail');
    const ohneMarker = parseJUnit(junitXml({ markers: ['Fixpunkt'] }));
    expect(statusOf(transformerCheck('bayernrecht-transformer/1.0.0', ohneMarker))).toBe('fail');
  });

  it('zählt nur Testfälle aus BayWü-Testdateien, nicht gleichnamige aus West oder NSH', () => {
    const fremd = junitXml().replace(/tests\/unit\/bayernrecht-readiness\.test\.ts/gu, 'tests/unit/recht-nrw-readiness.test.ts');
    expect(statusOf(transformerCheck('bayernrecht-transformer/1.0.0', parseJUnit(fremd)))).toBe('fail');
  });

  it('nimmt Tests ab, wenn sie grün, vollständig und jünger als der Quellcode sind', () => {
    const check = testsCheck(junit(), { junitMtimeMs: 2000, newestSourceMtimeMs: 1000 });
    expect(statusOf(check)).toBe('pass');
    expect(check.detail).toContain('0 Fehlschläge');
  });

  it('blockt bei Fehlschlag, bei fehlender BayWü-Prüfung und bei veraltetem Ergebnis', () => {
    expect(statusOf(testsCheck(parseJUnit(junitXml({ broken: 'Readiness' })), { junitMtimeMs: 2000, newestSourceMtimeMs: 1000 }))).toBe('fail');
    const luecke = testsCheck(parseJUnit(junitXml({ markers: ['Fixpunkt'] })), { junitMtimeMs: 2000, newestSourceMtimeMs: 1000 });
    expect(statusOf(luecke)).toBe('fail');
    expect(luecke.detail).toContain('fehlende BayWü-Prüfungen');
    const veraltet = testsCheck(junit(), { junitMtimeMs: 1000, newestSourceMtimeMs: 2000, newestSourcePath: 'packages/importers/bayernrecht/src/cli.ts' });
    expect(statusOf(veraltet)).toBe('fail');
    expect(veraltet.detail).toContain('älter als der Quellcode');
    expect(veraltet.detail).toContain('cli.ts');
    expect(statusOf(testsCheck(undefined, undefined))).toBe('fail');
  });

  it('nimmt den Secret-Scan ab, blockt bei einem Fund und weist ein fehlendes Testergebnis als Hinweis aus', () => {
    expect(statusOf(secretScanCheck([], 84, junit()))).toBe('pass');
    const fund = secretScanCheck(['data/imports/bayernrecht/x.json: Bearer-Token'], 84, junit());
    expect(statusOf(fund)).toBe('fail');
    expect(fund.detail).toContain('Bearer-Token');
    expect(statusOf(secretScanCheck([], 84, undefined))).toBe('notice');
    expect(statusOf(secretScanCheck(undefined, 0, junit()))).toBe('fail');
  });

  it('findet ein eingeschleustes Token in den Zustandsdateien des Adapters', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-secret-');
    await write(root, 'data/imports/bayernrecht/notiz.json', '{ "hinweis": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789" }');
    const result = await scanForSecrets(root);
    expect(result.findings).toEqual(['data/imports/bayernrecht/notiz.json: Bearer-Token']);
    expect(result.files).toBe(1);
  });
});

/* ------------------------------------------------------------------ 10. BayWü bleibt lokal */

describe('Readiness: BayWü bleibt lokal (umgekehrte Prüfung)', () => {
  it('ist in Ordnung, solange nur Platzhalter-IDs eingetragen sind', () => {
    const check = localOnlyCheck({ databaseIds: baywueDatabaseIds(WRANGLER_PLACEHOLDER), r2Objects: [], remoteState: [] });
    expect(statusOf(check)).toBe('pass');
    expect(check.detail).toContain('keine Cloudflare-Abfrage');
  });

  it('blockt bei einer echten database_id für landesrecht-baywue', () => {
    const ids = baywueDatabaseIds(WRANGLER_REAL);
    expect(ids).toHaveLength(2);
    const check = localOnlyCheck({ databaseIds: ids, r2Objects: [], remoteState: [] });
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('091224a9-da55-4262-b682-2b6bde0bd302');
    expect(check.detail).toContain('ist also angelegt');
  });

  it('blockt bei R2-Objekten im Manifest und bei Spuren eines Remote-Laufs', () => {
    const entry = sampleManifestEntry({ rawDocuments: [{ role: 'text-document', url: 'https://example.invalid/a', finalUrl: 'https://example.invalid/a', sha256: 'a'.repeat(64), contentType: 'application/zip', retrievedAt: '2026-09-17T10:00:00.000Z', byteLength: 1, bucket: 'landesrecht-quellen', objectKey: 'baywue/bayernrecht/2023-12-01/a.zip', archiveStatus: 'uploaded' }] });
    const objects = manifestR2Objects({ entries: [entry] });
    expect(objects).toHaveLength(1);
    expect(statusOf(localOnlyCheck({ databaseIds: [], r2Objects: objects, remoteState: [] }))).toBe('fail');
    const remote = localOnlyCheck({ databaseIds: [], r2Objects: [], remoteState: ['data/runtime/projection-state-baywue.remote.json'] });
    expect(statusOf(remote)).toBe('fail');
    expect(remote.detail).toContain('projection-state-baywue.remote.json');
  });

  it('findet keine Remote-Spuren auf einem leeren Root und fragt dafür nichts ab', async () => {
    expect(await remoteStateTraces(await tempRoot('landesrecht-bayernrecht-remote-'))).toEqual([]);
  });

  it('erkennt einen abgelegten Remote-Projektionszustand als Spur', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-remote-');
    await write(root, 'data/runtime/projection-state-baywue.remote.json', '{}');
    expect(await remoteStateTraces(root)).toEqual(['data/runtime/projection-state-baywue.remote.json']);
  });
});

/* ------------------------------------------------------------------ 11.–12. Dokument und Befehle */

describe('Readiness: Bereitschaftsdokument und Befehle', () => {
  it('nimmt das Dokument mit allen Abschnitten ab und blockt bei fehlendem Abschnitt', () => {
    expect(statusOf(readinessDocCheck(READINESS_DOC_TEXT))).toBe('pass');
    const check = readinessDocCheck(READINESS_DOC_TEXT.replace('## 3 GO/No-Go', '## 3 Übersicht'));
    expect(statusOf(check)).toBe('fail');
    expect(check.detail).toContain('## 3 GO/No-Go');
    expect(statusOf(readinessDocCheck(undefined))).toBe('fail');
  });

  it('prüft Skripte und Befehlsliste und blockt, wenn eines fehlt', () => {
    const scripts = Object.fromEntries(REQUIRED_SCRIPTS.map((script) => [script, 'node scripts/import-bayernrecht.ts']));
    expect(statusOf(commandsCheck(scripts, IMPLEMENTED_COMMANDS))).toBe('pass');
    const ohneSkript = { ...scripts };
    delete ohneSkript['import:bayernrecht:coverage'];
    expect(statusOf(commandsCheck(ohneSkript, IMPLEMENTED_COMMANDS))).toBe('fail');
    const ohneBefehl = commandsCheck(scripts, ['enumerate', 'sample', 'review']);
    expect(statusOf(ohneBefehl)).toBe('fail');
    expect(ohneBefehl.detail).toContain('readiness');
  });

  it('führt readiness, audit und coverage tatsächlich als umgesetzte Befehle', () => {
    for (const command of ['readiness', 'audit', 'coverage'] as const) expect(IMPLEMENTED_COMMANDS).toContain(command);
  });
});

/* ------------------------------------------------------------------ Gesamtergebnis */

describe('Readiness: Gesamtergebnis, Determinismus und JSON-Form', () => {
  it('meldet READY für einen stimmigen Bestand und nennt jede Prüfung', async () => {
    const result = await evaluate(await readyRoot());
    expect(result.blockers).toEqual([]);
    expect(result.ready).toBe(true);
    for (const id of ['zugriffslage', 'enumeration-landesrecht', 'enumeration-fixpunkt-landesrecht', 'enumeration-vwv', 'abdeckungsluecke', 'beispielkorpus', 'scope', 'ueberleitung', 'tests', 'zugangsdaten', 'baywue-lokal', 'bereitschaftsdokument', 'befehle']) {
      expect(checkById(result, id).status).toBe('pass');
    }
    expect(renderReadiness(result)[0]).toBe('READY');
  });

  it('macht aus jedem einzelnen Mangel ein NOT READY mit genau diesem Blocker', async () => {
    const faelle: Array<{ id: string; apply: (root: string) => Promise<void> }> = [
      { id: 'zugriffslage', apply: async (root) => write(root, 'data/audits/bayernrecht/discovery/robots.json', JSON.stringify(robotsFixture({ status: 'untersagt' }))) },
      { id: 'abdeckungsluecke', apply: async (root) => write(root, 'data/audits/bayernrecht/enumeration-gap.json', JSON.stringify(gapFixture(['BayBodSchO']))) },
      { id: 'scope', apply: async (root) => write(root, 'docs/LEGAL_SCOPE.md', LEGAL_SCOPE_OPEN) },
      { id: 'baywue-lokal', apply: async (root) => write(root, 'apps/web/wrangler.jsonc', WRANGLER_REAL) },
      { id: 'tests', apply: async (root) => write(root, 'test-results/junit.xml', junitXml({ broken: 'Readiness' })) },
      { id: 'bereitschaftsdokument', apply: async (root) => write(root, 'docs/BAYERN_BULK_READINESS.md', '# Bereitschaft\n') },
      { id: 'beispielkorpus', apply: async (root) => write(root, 'data/imports/bayernrecht/corpus.json', JSON.stringify(corpusFixture([corpusEntry('BayTestG', { missingExpected: ['tabellen'] })]))) },
    ];
    for (const fall of faelle) {
      const root = await readyRoot();
      await fall.apply(root);
      const result = await evaluate(root);
      expect(result.ready, fall.id).toBe(false);
      expect(checkById(result, fall.id).status, fall.id).toBe('fail');
      // Genau dieser Mangel, kein zweiter nebenbei.
      expect(result.checks.filter((check) => check.status === 'fail').map((check) => check.id), fall.id).toEqual([fall.id]);
      expect(renderReadiness(result)[0]).toBe('NOT READY');
    }
  });

  it('macht aus einem Hinweis keinen Blocker', async () => {
    const result = await evaluate(await readyRoot(), { checkEnumerationFixpoint: fixpointStub('unavailable') });
    expect(result.ready).toBe(true);
    expect(result.notices.length).toBeGreaterThan(0);
    expect(checkById(result, 'enumeration-fixpunkt-landesrecht').status).toBe('notice');
  });

  it('blockt, wenn der Fixpunkt nicht erreicht ist', async () => {
    const result = await evaluate(await readyRoot(), { checkEnumerationFixpoint: fixpointStub('changed') });
    expect(result.ready).toBe(false);
    expect(checkById(result, 'enumeration-fixpunkt-vwv').status).toBe('fail');
  });

  it('liefert zweimal dasselbe Ergebnis, Byte für Byte', async () => {
    const root = await readyRoot();
    const first = JSON.stringify(await evaluate(root), null, 2);
    const second = JSON.stringify(await evaluate(root), null, 2);
    expect(second).toBe(first);
    // Kein Zeitstempel des Aufrufs in der Ausgabe.
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"\s*,?\s*$/mu);
  });

  it('hat für jede Prüfung id, label, status und detail – und nur die drei Statuswerte', async () => {
    const result = await evaluate(await readyRoot());
    const parsed = JSON.parse(JSON.stringify(result)) as { ready: boolean; checks: ReadinessCheck[]; blockers: string[]; notices: string[] };
    expect(Object.keys(parsed).sort()).toEqual(['blockers', 'checks', 'notices', 'ready']);
    expect(parsed.checks.length).toBeGreaterThan(10);
    for (const check of parsed.checks) {
      expect(Object.keys(check).sort()).toEqual(['detail', 'id', 'label', 'status']);
      expect(['pass', 'notice', 'fail']).toContain(check.status);
      expect(check.detail.length).toBeGreaterThan(10);
    }
    expect(new Set(parsed.checks.map((check) => check.id)).size).toBe(parsed.checks.length);
  });

  it('fasst Blocker und Hinweise getrennt zusammen', () => {
    const result = summarize([
      { id: 'a', label: 'A', status: 'pass', detail: 'ok' },
      { id: 'b', label: 'B', status: 'notice', detail: 'fehlt lokal' },
      { id: 'c', label: 'C', status: 'fail', detail: 'kaputt' },
    ]);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(['C: kaputt']);
    expect(result.notices).toEqual(['B: fehlt lokal']);
    expect(summarize([{ id: 'a', label: 'A', status: 'notice', detail: 'x' }]).ready).toBe(true);
  });

  it('gibt über die CLI gültiges JSON aus und setzt den Exit-Code danach', async () => {
    const lines: string[] = [];
    const io: Io = { print: (line) => lines.push(line), error: (line) => lines.push(line) };
    const code = await runCli(['readiness', '--json'], io);
    const parsed = JSON.parse(lines.join('\n')) as { jurisdiction: string; status: string; ready: boolean; checks: ReadinessCheck[] };
    expect(parsed.jurisdiction).toBe(TARGET_JURISDICTION);
    expect(['READY', 'NOT READY']).toContain(parsed.status);
    expect(parsed.status === 'READY').toBe(parsed.ready);
    expect(code).toBe(parsed.ready ? 0 : 1);
    expect(parsed.checks.some((check) => check.id === 'baywue-lokal')).toBe(true);
  }, 60_000);
});

/* ------------------------------------------------------------------ Audit */

const manifestOf = (entries: ManifestEntry[]): Pick<ImportManifest, 'entries'> => ({ entries });

function reviewItem(sourceIdentity: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: `${sourceIdentity}:validity:0123456789`,
    jurisdiction: TARGET_JURISDICTION,
    sourceSystem: SOURCE_SYSTEM,
    sourceArea: 'landesrecht',
    sourceIdentity,
    sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${sourceIdentity}`,
    category: 'validity',
    key: 'baseline-gap',
    severity: 'non-blocking',
    summary: 'Beleg fehlt',
    details: [],
    firstSeenAt: '2026-09-17',
    updatedAt: '2026-09-17',
    occurrence: 'current',
    status: 'open',
    ...overrides,
  };
}

const queueOf = (items: ReviewItem[]): ReviewQueue => ({ schemaVersion: REVIEW_QUEUE_SCHEMA, items });

describe('Audit: Widersprüche zwischen den Teilen des Zustands', () => {
  const enumerations = new Map<SourceArea, EnumerationFile>([['landesrecht', enumerationFixture('landesrecht', [enumerationItem('BayTestG', { status: 'done' })])]]);

  it('findet nichts, wenn Enumeration und Manifest dasselbe sagen', () => {
    const manifest = manifestOf([sampleManifestEntry({ sourceIdentity: 'BayTestG' })]);
    expect(checkEnumerationAgainstManifest(enumerations, manifest)).toEqual([]);
  });

  it('meldet einen Manifesteintrag ohne Enumerationseintrag – mit Kennung', () => {
    const findings = checkEnumerationAgainstManifest(enumerations, manifestOf([sampleManifestEntry({ sourceIdentity: 'BayFremdG' })]));
    expect(findings.map((finding) => finding.check)).toContain('manifest-ohne-enumeration');
    expect(findings[0]!.identity).toBe('BayFremdG');
  });

  it('meldet einen verarbeiteten Enumerationseintrag ohne Manifest', () => {
    const findings = checkEnumerationAgainstManifest(enumerations, manifestOf([]));
    expect(findings).toEqual([{ check: 'enumeration-ohne-manifest', identity: 'BayTestG', detail: expect.stringContaining('done') }]);
  });

  it('meldet abweichende Slugs und Status zwischen Enumeration und Manifest', () => {
    const withOutcome = new Map<SourceArea, EnumerationFile>([['landesrecht', enumerationFixture('landesrecht', [enumerationItem('BayTestG', { status: 'done', outcome: { importStatus: 'failed', targetSlug: 'anders-baywue' } })])]]);
    const findings = checkEnumerationAgainstManifest(withOutcome, manifestOf([sampleManifestEntry({ sourceIdentity: 'BayTestG', targetSlug: 'testg-baywue' })]));
    expect(findings.map((finding) => finding.check).sort()).toEqual(['slug-abweichung-enumeration', 'status-abweichung-enumeration']);
  });

  it('prüft Manifest gegen Slug-Registry in beide Richtungen', () => {
    const entry = sampleManifestEntry({ sourceIdentity: 'BayTestG', targetSlug: 'testg-baywue' });
    const registry = (entries: SlugRegistry['entries']): Pick<SlugRegistry, 'entries'> => ({ entries });
    expect(checkSlugRegistry(manifestOf([entry]), registry([{ slug: 'testg-baywue', sourceIdentity: 'BayTestG', candidate: 'testg-baywue', assignment: 'derived' }]))).toEqual([]);
    expect(checkSlugRegistry(manifestOf([entry]), registry([])).map((finding) => finding.check)).toEqual(['slug-nicht-registriert']);
    expect(checkSlugRegistry(manifestOf([entry]), registry([{ slug: 'anders-baywue', sourceIdentity: 'BayTestG', candidate: 'anders-baywue', assignment: 'derived' }])).map((finding) => finding.check)).toEqual(['slug-abweichung']);
    expect(checkSlugRegistry(manifestOf([]), registry([{ slug: 'fremd-baywue', sourceIdentity: 'BayFremdG', candidate: 'fremd-baywue', assignment: 'derived' }])).map((finding) => finding.check)).toEqual(['slug-ohne-manifest']);
  });

  it('prüft den Beispielkorpus gegen die Enumeration', () => {
    expect(checkCorpusAgainstEnumeration(corpusFixture([corpusEntry('BayTestG')]), enumerations)).toEqual([]);
    expect(checkCorpusAgainstEnumeration(corpusFixture([corpusEntry('BayFremdG')]), enumerations).map((finding) => finding.check)).toEqual(['korpus-ohne-enumeration']);
    expect(checkCorpusAgainstEnumeration(corpusFixture([corpusEntry('BayTestG', { normType: 'rv' })]), enumerations).map((finding) => finding.check)).toEqual(['korpus-normtyp-abweichung']);
    expect(checkCorpusAgainstEnumeration(undefined, enumerations)).toEqual([]);
  });

  it('verlangt für jeden Review-Fall einen Manifesteintrag und gleichen Review-Status', () => {
    const entry = sampleManifestEntry({ sourceIdentity: 'BayTestG', reviewStatus: 'open' });
    expect(checkReviewAgainstManifest(queueOf([reviewItem('BayTestG')]), manifestOf([entry]))).toEqual([]);
    const ohneManifest = checkReviewAgainstManifest(queueOf([reviewItem('BayFremdG')]), manifestOf([entry]));
    expect(ohneManifest.map((finding) => finding.check)).toContain('review-ohne-manifest');
    const statusAbweichung = checkReviewAgainstManifest(queueOf([]), manifestOf([entry]));
    expect(statusAbweichung.map((finding) => finding.check)).toEqual(['review-status-abweichung']);
  });

  it('verlangt für jeden Override einen Manifesteintrag, in den er eingreift', () => {
    const override = { id: 'ov-1', sourceIdentity: 'BayTestG', field: 'sourceValidTo' as const, value: null, reason: 'Begründung', evidence: { source: 'GVBl.' }, reviewedAt: '2026-09-17' };
    const registry = (entries: OverrideRegistry['entries']): Pick<OverrideRegistry, 'entries'> => ({ entries });
    expect(checkOverridesAgainstManifest(registry([override]), manifestOf([]))[0]!.check).toBe('override-ohne-manifest');
    const angewandt = sampleManifestEntry({ sourceIdentity: 'BayTestG', overrides: [{ id: 'ov-1', field: 'sourceValidTo', value: null, reason: 'Begründung' }] });
    expect(checkOverridesAgainstManifest(registry([override]), manifestOf([angewandt]))).toEqual([]);
    const nichtAngewandt = sampleManifestEntry({ sourceIdentity: 'BayTestG' });
    expect(checkOverridesAgainstManifest(registry([override]), manifestOf([nichtAngewandt]))[0]!.check).toBe('override-nicht-angewandt');
  });
});

describe('Audit: Rohquellen unter sources/bayernrecht/', () => {
  const zip = 'PK Beispielpaket';
  const zipSha = createHash('sha256').update(zip, 'utf8').digest('hex');

  async function rawRoot(sidecar: Record<string, unknown> | undefined): Promise<string> {
    const root = await tempRoot('landesrecht-bayernrecht-raw-');
    await write(root, corpusPackagePath('BayTestG'), zip);
    if (sidecar) await write(root, corpusSidecarPath('BayTestG'), JSON.stringify(sidecar, null, 2));
    return root;
  }

  const sidecarOf = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    documentId: 'BayTestG',
    url: 'https://www.gesetze-bayern.de/Content/Zip/BayTestG',
    sha256: zipSha,
    contentType: 'application/zip',
    byteLength: Buffer.byteLength(zip, 'utf8'),
    retrievedAt: '2026-09-17T09:38:37.382Z',
    documentUrl: 'https://www.gesetze-bayern.de/Content/Document/BayTestG',
    ...overrides,
  });

  const corpusWithHash = (sha256: string): CorpusFile => corpusFixture([corpusEntry('BayTestG', { package: { ...corpusEntry('BayTestG').package, sha256, byteLength: Buffer.byteLength(zip, 'utf8') } })]);

  it('findet nichts, wenn Begleitdatei und nachgerechneter SHA-256 stimmen', async () => {
    const result = await auditRawSources(await rawRoot(sidecarOf()), corpusWithHash(zipSha));
    expect(result.findings).toEqual([]);
    expect(result.packages).toBe(1);
  });

  it('meldet eine fehlende Begleitdatei', async () => {
    const result = await auditRawSources(await rawRoot(undefined), corpusWithHash(zipSha));
    expect(result.findings.map((finding) => finding.check)).toEqual(['rohquelle-ohne-begleitdatei']);
  });

  it('meldet einen Hash, der nicht zu den Bytes passt – in Begleitdatei und Korpus', async () => {
    const result = await auditRawSources(await rawRoot(sidecarOf({ sha256: 'f'.repeat(64) })), corpusWithHash('e'.repeat(64)));
    expect(result.findings.map((finding) => finding.check).sort()).toEqual(['korpus-hash-abweichung', 'rohquelle-hash-abweichung']);
  });

  it('meldet ein Paket ohne Korpuseintrag', async () => {
    const result = await auditRawSources(await rawRoot(sidecarOf()), corpusFixture([]));
    expect(result.findings.map((finding) => finding.check)).toEqual(['rohquelle-ohne-korpuseintrag']);
  });

  it('wertet ein lokal fehlendes Paket als Hinweis, nicht als Abweichung', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-raw-');
    const result = await auditRawSources(root, corpusFixture([corpusEntry('BayTestG')]));
    expect(result.findings).toEqual([]);
    expect(result.notices.join(' ')).toContain('sources/README.md');
  });
});

describe('Audit: Gesamtlauf', () => {
  it('meldet auf leerem Root keine Abweichung, aber Hinweise auf die fehlenden Teile', async () => {
    const report = await runAudit(await tempRoot('landesrecht-bayernrecht-audit-'));
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.notices.join(' ')).toContain('Enumeration landesrecht fehlt');
    expect(report.jurisdiction).toBe(TARGET_JURISDICTION);
  });

  it('ist deterministisch und verändert den geprüften Zustand nicht', async () => {
    const root = await readyRoot();
    const before = await stat(join(root, 'data/imports/bayernrecht/corpus.json'));
    const first = JSON.stringify(await runAudit(root));
    const second = JSON.stringify(await runAudit(root));
    expect(second).toBe(first);
    expect((await stat(join(root, 'data/imports/bayernrecht/corpus.json'))).mtimeMs).toBe(before.mtimeMs);
  });
});

/* ------------------------------------------------------------------ Coverage */

describe('Coverage: Kennzahlen des Bestands', () => {
  const input = () => ({
    enumerations: new Map<SourceArea, EnumerationFile>([
      ['landesrecht', enumerationFixture('landesrecht', [enumerationItem('BayA', { changedAfterBaseline: true }), enumerationItem('BayB', { changedAfterBaseline: false }), enumerationItem('BayC')])],
      ['vwv', enumerationFixture('vwv', [enumerationItem('BayVwVA', { normType: 'vv', changedAfterBaseline: true })])],
    ]),
    manifest: manifestOf([]),
    corpus: corpusFixture([corpusEntry('BayA')]),
    baselineDate: '2023-12-01',
    now: '2026-09-18T00:00:00.000Z',
  });

  it('zählt je Bereich, je Normtyp und je Änderungslage', () => {
    const report = computeCoverage(input());
    expect(report.totals.documents).toBe(4);
    const landesrecht = report.areas.find((area) => area.area === 'landesrecht')!;
    expect(landesrecht.byNormType).toEqual([{ normType: 'ges', label: 'Gesetz', documents: 3 }]);
    expect(landesrecht.baseline).toEqual({ changedAfter: 1, unchanged: 1, unknown: 1 });
    // Der Anteil bezieht sich auf die datiert beantworteten Fälle; Unbekannte verzerren ihn nicht.
    expect(report.totals.baseline).toEqual({ changedAfter: 2, unchanged: 1, unknown: 1, changedAfterShare: 0.667 });
  });

  it('zählt die Strukturfälle des Korpus so, wie sie am Paket nachgewiesen sind', () => {
    const report = computeCoverage(input());
    expect(report.corpus?.byStructureCase.find((entry) => entry.case === 'dtd-byrecht-norm')?.norms).toBe(1);
    expect(report.corpus?.uncovered).toContain('tabellen');
    expect(report.corpus?.requirements).toEqual({ total: 1, met: 1 });
  });

  it('erfindet ohne Grundgesamtheit keinen Anteil', () => {
    expect(share(0, 0)).toBeNull();
    expect(share(1, 3)).toBe(0.333);
    const leer = computeCoverage({ ...input(), enumerations: new Map(), corpus: undefined });
    expect(leer.totals.baseline.changedAfterShare).toBeNull();
    expect(leer.corpus).toBeNull();
  });

  it('hängt nicht am Zeitpunkt des Laufs: gleicher Bestand, gleicher Fingerabdruck', () => {
    const first = computeCoverage(input());
    const second = computeCoverage({ ...input(), now: '2027-01-01T00:00:00.000Z' });
    expect(second.contentFingerprint).toBe(first.contentFingerprint);
    expect(second.generatedAt).not.toBe(first.generatedAt);
  });

  it('schreibt beide Dateien und beim zweiten Lauf nichts mehr', async () => {
    const root = await tempRoot('landesrecht-bayernrecht-coverage-');
    const report = computeCoverage(input());
    const first = await writeCoverage(root, report);
    expect(first.written.sort()).toEqual([COVERAGE_MARKDOWN_PATH, COVERAGE_PATH].sort());
    const second = await writeCoverage(root, computeCoverage({ ...input(), now: '2027-01-01T00:00:00.000Z' }));
    expect(second.written).toEqual([]);
    expect(second.unchanged.sort()).toEqual([COVERAGE_MARKDOWN_PATH, COVERAGE_PATH].sort());
  });

  it('rendert die Zahlen als Markdown und als Konsolenfassung', () => {
    const report = computeCoverage(input());
    const markdown = renderCoverageMarkdown(report);
    expect(markdown).toContain('| landesrecht | 3 | 3 | 3 | 0 |');
    expect(markdown).toContain('| landesrecht | ges | Gesetz | 3 |');
    expect(markdown).toContain('Anteil der datiert beantworteten Fälle mit Änderung nach dem Stichtag: **66.7 %**');
    expect(markdown).toContain(report.contentFingerprint);
    expect(coverageSummary(report).join('\n')).toContain('4 enumerierte Dokumente');
  });

  it('liest einen leeren Bestand, ohne zu behaupten, es gäbe einen', async () => {
    const report = await collectCoverage(await tempRoot('landesrecht-bayernrecht-coverage-'), '2026-09-18T00:00:00.000Z');
    expect(report.totals.documents).toBe(0);
    expect(report.corpus).toBeNull();
  });

  it('übernimmt nach dem Schreiben den gespeicherten Zeitstempel – auch die Ausgabe ist dann byteidentisch', async () => {
    const root = await readyRoot();
    await writeCoverage(root, await collectCoverage(root, '2026-09-18T00:00:00.000Z'));
    const first = JSON.stringify(await collectCoverage(root, '2027-01-01T00:00:00.000Z'), null, 2);
    const second = JSON.stringify(await collectCoverage(root, '2028-01-01T00:00:00.000Z'), null, 2);
    expect(second).toBe(first);
    expect(first).toContain('2026-09-18T00:00:00.000Z');
  });
});

/* ------------------------------------------------------------------ Aktualität der Testergebnisse */

describe('Readiness: Aktualität ist über Dateizeitstempel definiert, nicht über die Uhr', () => {
  it('wertet ein Testergebnis als veraltet, sobald der Quellcode jünger ist', async () => {
    const root = await readyRoot();
    await write(root, 'packages/importers/bayernrecht/src/beispiel.ts', 'export const x = 1;\n');
    const junitPath = join(root, 'test-results/junit.xml');
    const alt = new Date(Date.now() - 60_000);
    await utimes(junitPath, alt, alt);
    const result = await evaluate(root);
    expect(checkById(result, 'tests').status).toBe('fail');
    expect(checkById(result, 'tests').detail).toContain('beispiel.ts');
  });
});
