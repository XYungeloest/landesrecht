/**
 * Bulk-Lauf des BAYERN.RECHT-Adapters: der Schritt, ab dem Fehler im Bestand landen.
 *
 * Geprüft wird an den Eigenschaften, auf die sich ein Lauf über mehrere Tausend Normen verlässt –
 * nicht an der Formulierung einzelner Meldungen:
 *
 *   - Übernommen wird nur, was Scope, Stichtag **und** Text zugleich tragen; jede Sperrbedingung
 *     wird einzeln nachgewiesen, damit keine von ihnen unbemerkt wegfallen kann.
 *   - Der Stichtagstext ist der heutige Text nur bei `unchanged-since-baseline`; alles andere wartet
 *     auf die Rekonstruktion und wird als Review-Fall geführt.
 *   - Ein Budgetende ist ein sauberer Halt: Offenes bleibt offen, `--resume` macht dort weiter.
 *   - Ein Fehler an einer Norm hält den Lauf nicht an, ein systemischer Fehler schon.
 *   - Zweimal derselbe Stand heißt zweimal derselbe Bestand: Der zweite Lauf schreibt nichts.
 *   - Jede übernommene Norm beantwortet, warum sie am Stichtag galt (`decisionTrace`).
 *   - `simulationValidFrom` ist der Stichtag; die reale Quellgeltung bleibt davon getrennt.
 *
 * Kein Test schreibt nach `content/norms/baywue/`: Jeder Lauf bekommt ein temporäres Wurzelverzeichnis
 * mit eigenem Cache, eigener Enumeration, eigenem Scope und eigener Stichtagsklassifikation.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { runAudit } from '@landesrecht/importer-bayernrecht/audit/audit.ts';
import { classifyBaseline, type BaselineDecision } from '@landesrecht/importer-bayernrecht/baseline/classify.ts';
import { CACHE_DIR, IMPORT_DATA_DIR, PARSER_VERSION, type SourceArea } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { readManifestEntry } from '@landesrecht/importer-bayernrecht/common/manifest.ts';
import { identityHash, manifestEntryPath } from '@landesrecht/importer-bayernrecht/common/paths.ts';
import { readReviewQueue } from '@landesrecht/importer-bayernrecht/common/review.ts';
import { assertJurisdictionSlug, readSlugRegistry, SLUG_REGISTRY_PATH } from '@landesrecht/importer-bayernrecht/common/slug-registry.ts';
import { enumerationFingerprint, ENUMERATION_SCHEMA, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';
import { documentUrl, zipUrl } from '@landesrecht/importer-bayernrecht/enumerate/portal.ts';
import { runBulk, type BulkRunOptions, type BulkRunResult } from '@landesrecht/importer-bayernrecht/bulk/run.ts';
import { readBulkState } from '@landesrecht/importer-bayernrecht/bulk/state.ts';
import { decisionTraceProblems, type DecisionTrace } from '@landesrecht/importer-bayernrecht/bulk/trace.ts';
import { RECONSTRUCTION_DIR } from '@landesrecht/importer-bayernrecht/bulk/select.ts';
import { figureRawDocuments } from '@landesrecht/importer-bayernrecht/bulk/figures.ts';
import { parseBayernRechtPackage } from '@landesrecht/importer-bayernrecht/parse/index.ts';
import { reverseSteps } from '@landesrecht/importer-bayernrecht/reconstruction/apply.ts';
import type { FieldRef } from '@landesrecht/importer-bayernrecht/reconstruction/location.ts';
import { bodyFingerprint, RECIPE_SCHEMA, RECIPE_SCHEMA_V2, WHITESPACE_NORMALIZATION, type ReconstructionRecipe, type ReconstructionRecipeV2, type RecipeStep } from '@landesrecht/importer-bayernrecht/reconstruction/recipe.ts';
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';
import { buildZipArchive, fixture, fixtureBytes, gifBytes } from '../helpers/bayernrecht-parse.ts';
import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const BASELINE = '2023-12-01';

/* ------------------------------------------------------------------ Pakete aus echten Fixtures */

const manifestXml = (entries: ReadonlyArray<{ path: string; mediaType: string }>): string =>
  `<?xml version="1.0" encoding="iso-8859-1"?>\n<manifest xmlns="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">\n${entries.map((entry) => `\t<file-entry media-type="${entry.mediaType}" full-path="${entry.path}" />`).join('\n')}\n</manifest>`;

/** Exportpaket aus einem echten Fixture-Dokument (ZIP im Speicherverfahren, wie das Portal es liefert). */
function normPackage(documentId: string, xml: string | Uint8Array, extra: ReadonlyArray<{ path: string; content: string }> = []): Uint8Array {
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'META-INF/manifest.xml', content: manifestXml([{ path: `/bayportalnorm/${documentId}.xml`, mediaType: 'application/beck.bayportalnorm.text' }, ...extra.map((entry) => ({ path: `/${entry.path}`, mediaType: 'image/jpg' }))]) },
    { path: `bayportalnorm/${documentId}.xml`, content: xml },
    ...extra,
  ]);
}

const abmarkungsgesetz = (): Uint8Array => normPackage('BayAbmG', fixtureBytes('abmarkungsgesetz'));
const verfassung = (): Uint8Array => normPackage('BayVerf', fixtureBytes('verfassung'));
const radverkehrsgesetz = (): Uint8Array => normPackage('BayRadG', fixtureBytes('radverkehrsgesetz'));
const kostenverzeichnis = (): Uint8Array => normPackage('BayKVzKG', fixtureBytes('kostenverzeichnis'));

/** Dasselbe Gesetz mit einem Element, das die DTD nicht kennt – der Parser meldet es als Fehler. */
const unknownStructure = (): Uint8Array => normPackage('BayAbmG', fixture('abmarkungsgesetz').replace('<rumpf>', '<rumpf>\n<phantasieelement>Text</phantasieelement>'));

/**
 * Paket mit Bildbeilagen, von denen eine fehlt: Das XML verweist auf neun Abbildungen, das Paket
 * enthält eine. Der Parser meldet die fehlenden – der Text wäre unvollständig.
 */
function incompleteAssets(): Uint8Array {
  const declared = [...fixture('manifestBodenfischerei').matchAll(/full-path="\/(img\/[^"]+)"/gu)].map((match) => match[1]!);
  const kept = declared[0]!;
  return normPackage('BayBoFiV', fixtureBytes('bodenfischerei'), [{ path: kept, content: `GIF89a ${kept}` }]);
}

/** Bytes, die als Paket ankommen, aber keines sind (ZIP-Signatur, dann Müll). */
const corruptPackage = (): Uint8Array => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from('kein brauchbares Archiv', 'utf8')]);

/* ------------------------------------------------------------------ Temporärer Bestand */

interface DocumentFixture {
  id: string;
  area?: SourceArea;
  scope?: 'include' | 'exclude' | 'review';
  /** Stichtagsentscheidung; `'none'` bedeutet: nicht klassifiziert. */
  baseline?: BaselineDecision | 'none';
  /** Paketbytes; fehlen sie, liegt nichts im Cache. */
  bytes?: Uint8Array;
  /** Scope-Grund und Stammnorm (zusammengeführte Anlage). */
  scopeReason?: string;
  relatedDocumentId?: string;
}

const eligible = (id: string): BaselineDecision => classifyBaseline({ documentId: id, documentDate: '1981-08-06', inForceFrom: '2015-08-01' });

function enumerationItem(documentId: string, area: SourceArea): EnumerationItem {
  return {
    key: documentId,
    sourceIdentity: documentId,
    documentId,
    title: `Titel ${documentId}`,
    titleSource: 'fortfuehrungsnachweis',
    normType: area === 'vwv' ? 'vv' : 'ges',
    normTypeSource: 'facet-hitlist',
    sourceUrl: documentUrl(documentId),
    zipUrl: zipUrl(documentId),
    listingUrl: 'https://www.gesetze-bayern.de/Content/Document/ffn',
    sourceSha256: 'b'.repeat(64),
    retrievedAt: '2026-09-17T07:48:50.997Z',
    listings: [{ kind: 'fortfuehrungsnachweis', url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z' }],
    status: 'pending',
    signals: { fortfuehrungsnachweis: true, facet: true, manifest: false },
    attempts: 0,
  };
}

function enumerationFile(area: SourceArea, items: EnumerationItem[]): EnumerationFile {
  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate: BASELINE,
    generatedAt: '2026-09-18T00:00:00.000Z',
    contentFingerprint: '',
    sources: {},
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
  };
  return { ...file, contentFingerprint: enumerationFingerprint(file) };
}

/** Legt einen Cacheeintrag an – genau in der Form, die der gemeinsame Fetcher schreibt. */
async function seedCache(root: string, url: string, bytes: Uint8Array): Promise<void> {
  const directory = join(root, CACHE_DIR);
  await mkdir(directory, { recursive: true });
  const key = cacheKey(url);
  await writeFile(join(directory, `${key}.bin`), bytes);
  await writeFile(
    join(directory, `${key}.json`),
    `${JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'application/zip', retrievedAt: '2026-09-17T09:38:17.000Z', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }, null, 2)}\n`,
    'utf8',
  );
}

async function fixtureRoot(documents: readonly DocumentFixture[], prefix = 'landesrecht-bayernrecht-bulk-'): Promise<string> {
  const root = await tempRoot(prefix);
  await mkdir(join(root, IMPORT_DATA_DIR), { recursive: true });
  const byArea = new Map<SourceArea, EnumerationItem[]>([['landesrecht', []], ['vwv', []]]);
  const scopeEntries: unknown[] = [];
  const decisions: BaselineDecision[] = [];
  for (const document of documents) {
    const area = document.area ?? 'landesrecht';
    byArea.get(area)!.push(enumerationItem(document.id, area));
    scopeEntries.push({ documentId: document.id, sourceArea: area, normType: area === 'vwv' ? 'vv' : 'ges', title: `Titel ${document.id}`, decision: document.scope ?? 'include', reason: document.scopeReason ?? (document.scope === 'review' ? 'normativity-review-required' : 'state-law-in-scope'), evidence: ['enumeration:facet-hitlist'], ...(document.relatedDocumentId ? { relatedDocumentId: document.relatedDocumentId } : {}) });
    const baseline = document.baseline ?? eligible(document.id);
    if (baseline !== 'none') decisions.push(baseline);
    if (document.bytes) await seedCache(root, zipUrl(document.id), document.bytes);
  }
  for (const [area, items] of byArea) {
    await writeFile(join(root, IMPORT_DATA_DIR, `enumeration-${area}.json`), `${JSON.stringify(enumerationFile(area, items), null, 2)}\n`, 'utf8');
  }
  await writeFile(join(root, IMPORT_DATA_DIR, 'scope.json'), `${JSON.stringify({ schemaVersion: 'bayernrecht-scope/1', baselineDate: BASELINE, generatedAt: '2026-09-18', totals: { documents: scopeEntries.length, byDecision: {}, byReason: {}, byArea: {} }, entries: scopeEntries }, null, 2)}\n`, 'utf8');
  await writeFile(join(root, IMPORT_DATA_DIR, 'baseline.json'), `${JSON.stringify({ schemaVersion: 'bayernrecht-baseline/1', baselineDate: BASELINE, evaluationDate: '2026-09-18', totals: { candidates: decisions.length, examined: decisions.length, notCached: 0, unreadable: 0, byClass: {}, byStatus: {}, byMethod: {}, issueDateSource: {} }, decisions }, null, 2)}\n`, 'utf8');
  return root;
}

const run = async (root: string, overrides: Partial<BulkRunOptions> = {}): Promise<BulkRunResult> =>
  runBulk({ root, write: false, resume: false, ...overrides });

const resultFor = (outcome: BulkRunResult, documentId: string): BulkRunResult['summary']['entries'][number] | undefined =>
  outcome.summary.entries.find((entry) => entry.documentId === documentId);

/* ------------------------------------------------------------------ Auswahl */

describe('Auswahl: Scope, Stichtag und Text müssen zugleich tragen', () => {
  it('übernimmt eine unveränderte Fassung mit Scope include und Stichtagsgeltung', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const outcome = await run(root);
    expect(resultFor(outcome, 'BayAbmG')?.result).toBe('dry-run');
    expect(outcome.summary.selection.eligible).toBe(1);
    expect(outcome.summary.outcomes['dry-run']).toBe(1);
  });

  it('fasst ein Dokument mit Scope exclude nicht einmal an', async () => {
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayVerf', scope: 'exclude', bytes: verfassung() },
    ]);
    const outcome = await run(root);
    expect(resultFor(outcome, 'BayVerf')).toBeUndefined();
    expect(outcome.summary.selection.exclude).toBe(1);
    expect(outcome.summary.outcomes['dry-run']).toBe(1);
  });

  it('führt ein Dokument mit Scope review als Normativitätsreview, statt es zu übernehmen', async () => {
    const root = await fixtureRoot([{ id: 'BayVerf', scope: 'review', bytes: verfassung() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayVerf');
    expect(entry?.result).toBe('review');
    expect(entry?.reviewCategories).toContain('normativity');
    expect(outcome.summary.outcomes['dry-run']).toBe(0);
  });

  it('übernimmt eine nach dem Stichtag geänderte Fassung nicht, sondern verlangt die Rekonstruktion', async () => {
    // Der gefährlichste Fehlschluss des Bestands: alte Ausfertigung, junger Text. Den heutigen Text zu
    // übernehmen hieße, eine Fassung zurückzudatieren.
    const root = await fixtureRoot([{ id: 'BayKVzKG', baseline: classifyBaseline({ documentId: 'BayKVzKG', documentDate: '2001-10-12', inForceFrom: '2026-07-01' }), bytes: kostenverzeichnis() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayKVzKG');
    expect(entry?.result).toBe('review');
    expect(entry?.code).toBe('text-changed-after-baseline');
    expect(entry?.reviewCategories).toContain('reconstruction-required');
  });

  it('übernimmt eine Vorschrift mit unbestimmter Stichtagsgeltung nicht', async () => {
    const root = await fixtureRoot([{ id: 'BayVerf', baseline: classifyBaseline({ documentId: 'BayVerf', inForceFrom: '2020-01-01' }), bytes: verfassung() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayVerf');
    expect(entry?.result).toBe('review');
    expect(entry?.code).toBe('no-issue-date');
    expect(entry?.reviewCategories).toContain('validity');
  });

  it('führt eine erst nach dem Stichtag erlassene Vorschrift als not-at-baseline, ohne Review', async () => {
    const root = await fixtureRoot([{ id: 'BayRadG', baseline: classifyBaseline({ documentId: 'BayRadG', documentDate: '2025-07-24', inForceFrom: '2025-08-01' }), bytes: radverkehrsgesetz() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayRadG');
    expect(entry?.result).toBe('not-at-baseline');
    expect(entry?.reviewCategories ?? []).toEqual([]);
  });

  it('übernimmt ohne Stichtagsentscheidung nichts und verweist auf die Klassifikation', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', baseline: 'none', bytes: abmarkungsgesetz() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayAbmG');
    expect(entry?.result).toBe('skipped-unclassified');
    expect(entry?.phase).toBe('auswahl');
    expect(outcome.summary.outcomes['skipped-unclassified']).toBe(1);
  });

  it('holt nichts nach: ein fehlendes Paket ist skipped-not-cached, kein Fehler', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG' }]);
    const outcome = await run(root);
    expect(resultFor(outcome, 'BayAbmG')?.result).toBe('skipped-not-cached');
    expect(outcome.summary.outcomes.failed).toBe(0);
    expect(outcome.summary.runStatus).toBe('completed');
  });

  it('übernimmt eine Norm mit Parserabweichung nicht, sondern führt den Strukturfall', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: unknownStructure() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayAbmG');
    expect(entry?.result).toBe('review');
    expect(entry?.reviewCategories).toContain('unknown-structure');
  });

  it('übernimmt eine Norm mit fehlenden Beilagen nicht', async () => {
    const root = await fixtureRoot([{ id: 'BayBoFiV', baseline: eligible('BayBoFiV'), bytes: incompleteAssets() }]);
    const outcome = await run(root);
    const entry = resultFor(outcome, 'BayBoFiV');
    expect(entry?.result).toBe('review');
    expect(entry?.reviewCategories).toContain('incomplete-annex');
  });
});

/* ------------------------------------------------------------------ Betrieb */

describe('Betrieb: Budgets, Resume, Fehlerklassen', () => {
  it('hält am Auswahlbudget sauber an und lässt den Rest offen', async () => {
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayRadG', bytes: radverkehrsgesetz() },
      { id: 'BayVerf', bytes: verfassung() },
    ]);
    const outcome = await run(root, { write: true, limit: 1 });
    expect(outcome.summary.runStatus).toBe('limit-reached');
    expect(outcome.summary.selection.processed).toBe(1);
    const state = await readBulkState(root);
    expect(state?.totals.pending).toBe(2);
    expect(state?.totals.done).toBe(1);
  });

  it('hält am Laufzeitbudget sauber an', async () => {
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayRadG', bytes: radverkehrsgesetz() },
      { id: 'BayVerf', bytes: verfassung() },
    ]);
    let ticks = 0;
    const outcome = await run(root, { maxRuntimeMs: 5_000, clock: () => (ticks += 1_000) });
    expect(outcome.summary.runStatus).toBe('budget-exhausted');
    expect(outcome.summary.selection.processed).toBeLessThan(3);
    expect(outcome.summary.stopReason).toContain('Laufzeitbudget');
  });

  it('setzt nach einem Abbruch deterministisch fort und wiederholt Erledigtes nicht', async () => {
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayRadG', bytes: radverkehrsgesetz() },
      { id: 'BayVerf', bytes: verfassung() },
    ]);
    const first = await run(root, { write: true, limit: 2 });
    expect(first.summary.selection.processed).toBe(2);
    const done = first.summary.entries.map((entry) => entry.documentId);

    const second = await run(root, { write: true, resume: true });
    expect(second.summary.selection.resumed).toBe(2);
    expect(second.summary.entries.map((entry) => entry.documentId)).not.toEqual(expect.arrayContaining(done));
    expect(second.summary.selection.processed).toBe(1);
    const state = await readBulkState(root);
    expect(state?.totals.pending).toBe(0);
    expect(state?.totals.done).toBe(3);
  });

  it('nimmt einen beim Abbruch offen gebliebenen Eintrag (processing) beim Resume erneut auf', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }, { id: 'BayVerf', bytes: verfassung() }]);
    await run(root, { write: true });
    const statePath = join(root, IMPORT_DATA_DIR, 'bulk-state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8')) as { entries: Array<{ documentId: string; status: string }> };
    // Harter Abbruch mitten in der Verarbeitung: genau ein Eintrag bleibt `processing`.
    state.entries.find((entry) => entry.documentId === 'BayVerf')!.status = 'processing';
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const resumed = await run(root, { write: true, resume: true });
    expect(resumed.summary.entries.map((entry) => entry.documentId)).toEqual(['BayVerf']);
  });

  it('nimmt beim Resume Einträge einer älteren Parserversion wieder auf, ohne unveränderten Inhalt neu zu schreiben', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }, { id: 'BayVerf', bytes: verfassung() }]);
    await run(root, { write: true });
    const shardPath = join(root, manifestEntryPath('landesrecht', 'BayAbmG'));
    await writeFile(shardPath, (await readFile(shardPath, 'utf8')).replace(`"parserVersion": "${PARSER_VERSION}"`, '"parserVersion": "bayernrecht-parser/0.0.1"'), 'utf8');
    const slug = (await readManifestEntry(root, 'landesrecht', 'BayAbmG'))!.targetSlug;
    const versionPath = join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`);
    const before = await readFile(versionPath, 'utf8');
    const mtimeBefore = (await stat(versionPath)).mtimeMs;

    const resumed = await run(root, { write: true, resume: true });
    // Nur der veraltete Eintrag wird neu bewertet; der aktuelle gilt als erledigt.
    expect(resumed.summary.entries.map((entry) => entry.documentId)).toEqual(['BayAbmG']);
    expect(resumed.summary.selection.resumed).toBe(1);
    expect((await readManifestEntry(root, 'landesrecht', 'BayAbmG'))!.parserVersion).toBe(PARSER_VERSION);
    // Die Versionsnummer allein schreibt keinen Inhalt neu; nur die Provenienz im Manifest folgt ihr.
    expect(resultFor(resumed, 'BayAbmG')?.result).toBe('imported');
    expect(await readFile(versionPath, 'utf8')).toBe(before);
    expect((await stat(versionPath)).mtimeMs).toBe(mtimeBefore);
  });

  it('hält einen normlokalen Fehler fest und arbeitet weiter', async () => {
    const root = await fixtureRoot([
      { id: 'AAAKaputt', bytes: corruptPackage() },
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
    ]);
    const outcome = await run(root);
    expect(outcome.summary.runStatus).toBe('completed');
    expect(resultFor(outcome, 'AAAKaputt')?.result).toBe('failed');
    expect(resultFor(outcome, 'BayAbmG')?.result).toBe('dry-run');
    expect(outcome.summary.failures).toHaveLength(1);
  });

  it('hält den Lauf an, wenn Normen reihenweise am selben Fehler scheitern', async () => {
    const root = await fixtureRoot([
      { id: 'AAAKaputt1', bytes: corruptPackage() },
      { id: 'AAAKaputt2', bytes: corruptPackage() },
      { id: 'AAAKaputt3', bytes: corruptPackage() },
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
    ]);
    const outcome = await run(root, { systemic: { window: 5, maxSameCodeFailures: 5, maxConsecutiveFailures: 3 } });
    expect(outcome.summary.runStatus).toBe('aborted-systemic');
    expect(outcome.summary.stopReason).toContain('in Folge');
    // Der Lauf endet vor der gesunden Norm: Ein systemischer Verdacht wird nicht weiterprobiert.
    expect(resultFor(outcome, 'BayAbmG')).toBeUndefined();
  });

  it('hält den Lauf an, wenn die eigene Zustandsdatei beschädigt ist', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    await writeFile(join(root, IMPORT_DATA_DIR, 'bulk-state.json'), '{ "schemaVersion": "fremd/9", "entries": [] }\n', 'utf8');
    const outcome = await run(root, { write: true });
    expect(outcome.summary.runStatus).toBe('aborted-systemic');
    expect(outcome.summary.stopReason).toContain('Zustandsdatei');
    expect(outcome.summary.selection.processed).toBe(0);
  });
});

/* ------------------------------------------------------------------ Bestand */

describe('Bestand: was je Norm entsteht', () => {
  it('schreibt Ausgangsfassung, Manifest, Review-Stand und Slug-Reservierung', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const outcome = await run(root, { write: true });
    expect(outcome.summary.outcomes.imported + outcome.summary.outcomes['imported-with-warnings']).toBe(1);

    const slug = resultFor(outcome, 'BayAbmG')!.targetSlug!;
    expect(slug).toBe('abmg-baywue');
    expect(() => assertJurisdictionSlug(slug)).not.toThrow();
    const normDir = join(root, 'content', 'norms', 'baywue', slug);
    expect((await readdir(normDir)).sort()).toEqual(['history.json', 'meta.json', 'versions']);
    expect(await readdir(join(normDir, 'versions'))).toEqual([`${BASELINE}.json`]);

    const registry = await readSlugRegistry(root);
    expect(registry.entries.map((entry) => [entry.sourceIdentity, entry.slug])).toEqual([['BayAbmG', slug]]);

    const entry = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(entry?.importStatus === 'imported' || entry?.importStatus === 'imported-with-warnings').toBe(true);
    expect(entry?.targetSlug).toBe(slug);
    expect(entry?.parserVersion).toMatch(/^bayernrecht-parser\//u);
    expect(entry?.transformerVersion).toMatch(/^bayernrecht-transformer\//u);
    expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(outcome.reportWritten).toBe(true);
  });

  it('beantwortet am Manifesteintrag, warum die Norm am Stichtag galt (decisionTrace)', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    await run(root, { write: true });
    const entry = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    const trace = (entry as unknown as { decisionTrace: DecisionTrace }).decisionTrace;
    expect(decisionTraceProblems(trace)).toEqual([]);
    expect(trace.baseline.class).toBe('unchanged-since-baseline');
    expect(trace.baseline.status).toBe('active-at-baseline');
    expect(trace.baseline.method).toBe('current-unchanged');
    expect(trace.baseline.reason).toBe('text-unchanged-since-before-baseline');
    expect(trace.baseline.blockers).toEqual([]);
    expect(trace.scope.reason).toBe('state-law-in-scope');
    expect(trace.recovery.method).toBe('current-source');
    expect(trace.baseline.evidence.map((item) => item.kind)).toEqual(expect.arrayContaining(['issue-date', 'text-in-force']));
    expect(trace.evidenceChain.join('\n')).toContain('Scope');
    expect(trace.statement).toContain(BASELINE);
    expect(trace.source.sha256).toBe(entry?.sha256);
  });

  it('trennt Simulationszeit und reale Quellgeltung', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const outcome = await run(root, { write: true });
    const slug = resultFor(outcome, 'BayAbmG')!.targetSlug!;
    const normDir = join(root, 'content', 'norms', 'baywue', slug);
    const version = JSON.parse(await readFile(join(normDir, 'versions', `${BASELINE}.json`), 'utf8')) as Record<string, unknown>;
    const meta = JSON.parse(await readFile(join(normDir, 'meta.json'), 'utf8')) as Record<string, unknown>;
    const history = JSON.parse(await readFile(join(normDir, 'history.json'), 'utf8')) as { initialVersionId: string; entries: Array<{ date: string; type: string }> };

    // Ausgangsrechtsstand der Simulation: der Stichtag, offen nach vorn.
    expect(version.versionId).toBe(BASELINE);
    expect(version.simulationValidFrom).toBe(BASELINE);
    expect(version.simulationValidTo).toBeNull();
    expect(meta.effectiveDate).toBe(BASELINE);
    // Reale Quellgeltung: was die Quelle sagt – und das ist nicht der Stichtag.
    expect(version.sourceValidFrom).toBe('2015-08-01');
    expect(version.sourceValidFrom).not.toBe(version.simulationValidFrom);
    const entry = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(entry?.sourceValidFrom).toBe('2015-08-01');
    expect(entry?.baselineDate).toBe(BASELINE);
    // Reale Änderungen nach dem Stichtag sind keine Simulationsänderungen: genau eine Fassung, ein Eintrag.
    expect(history.initialVersionId).toBe(BASELINE);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]!.type).toBe('initial');
    expect(history.entries[0]!.date).toBe(BASELINE);
  });

  it('löst eine Slugkollision deterministisch auf und meldet sie als akzeptierte technische Kollision (kein Review-Fall)', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    // Ein fremdes Verzeichnis belegt den abgeleiteten Slug (nicht registriert, nicht diesem Import gehörend).
    await mkdir(join(root, 'content', 'norms', 'baywue', 'abmg-baywue', 'versions'), { recursive: true });
    await writeFile(join(root, 'content', 'norms', 'baywue', 'abmg-baywue', 'meta.json'), '{"fremd":true}\n', 'utf8');
    const outcome = await run(root, { write: true });
    const entry = resultFor(outcome, 'BayAbmG')!;
    expect(entry.targetSlug).toBe(`abmg-baywue-${identityHash('BayAbmG').slice(0, 8)}`);
    expect(entry.reviewCategories ?? []).not.toContain('identity');
    // Das fremde Verzeichnis bleibt unberührt.
    expect(await readFile(join(root, 'content', 'norms', 'baywue', 'abmg-baywue', 'meta.json'), 'utf8')).toBe('{"fremd":true}\n');
    const queue = await readReviewQueue(root);
    expect(queue.items.some((item) => item.category === 'identity')).toBe(false);
    // Der Befund bleibt sichtbar, als Information; die Norm hat eine eigene, stabile URL.
    const manifest = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(manifest!.findings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'slug-collision' }));
    const again = await run(root, { write: true });
    expect(resultFor(again, 'BayAbmG')!.targetSlug).toBe(entry.targetSlug);
  });

  it('migriert einen einzeln entschiedenen, sachlich falschen Slug: neues Verzeichnis, altes entfernt, Umleitung geschrieben', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    await run(root, { write: true });
    const old = resultFor(await run(root, { write: true }), 'BayAbmG')!.targetSlug!;
    await writeFile(join(root, 'data', 'imports', 'bayernrecht', 'slug-migrations.json'), JSON.stringify({ schemaVersion: 'bayernrecht-slug-migrations/1', migrations: [{ id: 'test', sourceIdentity: 'BayAbmG', from: old, reason: 'test', evidence: 'Test', decidedBy: 'Test', decidedAt: '2026-09-18' }] }), 'utf8');
    const migrated = resultFor(await run(root, { write: true }), 'BayAbmG')!;
    // Der heutige Kandidat ist derselbe wie der alte Slug; der alte ist stillgelegt, also entsteht der Kollisionszusatz.
    expect(migrated.targetSlug).toBe(`${old}-${identityHash('BayAbmG').slice(0, 8)}`);
    await expect(readFile(join(root, 'content', 'norms', 'baywue', old, 'meta.json'), 'utf8')).rejects.toThrow();
    expect(JSON.parse(await readFile(join(root, 'content', 'norms', 'baywue', migrated.targetSlug!, 'meta.json'), 'utf8')).slug).toBe(migrated.targetSlug);
    const registry = await readSlugRegistry(root);
    expect(registry.retired).toEqual([{ slug: old, sourceIdentity: 'BayAbmG', successor: migrated.targetSlug, migration: 'test' }]);
    const redirects = JSON.parse(await readFile(join(root, 'packages', 'legal-core', 'src', 'config', 'slug-redirects.json'), 'utf8'));
    expect(redirects.jurisdictions.baywue).toEqual({ [old]: migrated.targetSlug });
    expect((await readManifestEntry(root, 'landesrecht', 'BayAbmG'))!.findings).toContainEqual(expect.objectContaining({ code: 'slug-migrated' }));
    // Weitere Läufe: stabil, keine erneute Migration.
    expect(resultFor(await run(root, { write: true }), 'BayAbmG')!.targetSlug).toBe(migrated.targetSlug);
    expect((await readSlugRegistry(root)).retired).toHaveLength(1);
  });

  it('hinterlässt einen in sich stimmigen Zustand (Audit ohne Abweichung)', async () => {
    // Manifest, Slug-Registry und Review-Queue müssen dasselbe sagen. Das prüft nicht dieser Test,
    // sondern das Audit des Adapters – hier läuft es über den frisch geschriebenen Bestand.
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayKVzKG', baseline: classifyBaseline({ documentId: 'BayKVzKG', documentDate: '2001-10-12', inForceFrom: '2026-07-01' }), bytes: kostenverzeichnis() },
      { id: 'BayRadG', baseline: classifyBaseline({ documentId: 'BayRadG', documentDate: '2025-07-24', inForceFrom: '2025-08-01' }), bytes: radverkehrsgesetz() },
    ]);
    await run(root, { write: true });
    const report = await runAudit(root, { skipRawSources: true });
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('führt die Sperrgründe als Review-Fälle mit Begründung', async () => {
    const root = await fixtureRoot([{ id: 'BayKVzKG', baseline: classifyBaseline({ documentId: 'BayKVzKG', documentDate: '2001-10-12', inForceFrom: '2026-07-01' }), bytes: kostenverzeichnis() }]);
    await run(root, { write: true });
    const queue = await readReviewQueue(root);
    const item = queue.items.find((candidate) => candidate.category === 'reconstruction-required');
    expect(item?.severity).toBe('blocking');
    expect(item?.status).toBe('open');
    expect(item?.details.join('\n')).toContain('2026-07-01');
    const entry = await readManifestEntry(root, 'landesrecht', 'BayKVzKG');
    expect(entry?.importStatus).toBe('needs-review');
    expect(entry?.targetSlug).toBe('');
    expect(entry?.reviewStatus).toBe('open');
  });
});

/* ------------------------------------------------------------------ Unveränderlichkeit */

describe('Unveränderlichkeit: ein zweiter Lauf ändert nichts still', () => {
  it('schreibt beim zweiten Lauf über denselben Stand nichts', async () => {
    const root = await fixtureRoot([
      { id: 'BayAbmG', bytes: abmarkungsgesetz() },
      { id: 'BayRadG', bytes: radverkehrsgesetz() },
    ]);
    const first = await run(root, { write: true });
    expect(first.summary.written.changed).toBeGreaterThan(0);
    const slug = resultFor(first, 'BayAbmG')!.targetSlug!;
    const before = await readFile(join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`), 'utf8');

    const second = await run(root, { write: true });
    expect(second.summary.outcomes.unchanged).toBe(2);
    expect(second.summary.outcomes.imported + second.summary.outcomes['imported-with-warnings']).toBe(0);
    expect(second.summary.written.changed).toBe(0);
    expect(await readFile(join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`), 'utf8')).toBe(before);
  });

  it('behält den übernommenen Stand, wenn ein Reimport schlechter ausfällt', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const first = await run(root, { write: true });
    const slug = resultFor(first, 'BayAbmG')!.targetSlug!;
    const before = await readFile(join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`), 'utf8');

    // Dieselbe Norm, jetzt mit einer Struktur, die der Parser nicht kennt.
    await seedCache(root, zipUrl('BayAbmG'), unknownStructure());
    const second = await run(root, { write: true });
    const entry = resultFor(second, 'BayAbmG');
    expect(entry?.result).toBe('kept-existing');
    expect(entry?.reviewCategories).toContain('import-regression');
    // Inhalt und Manifest bleiben beim zuletzt übernommenen Stand.
    expect(await readFile(join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`), 'utf8')).toBe(before);
    const manifest = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(manifest?.targetSlug).toBe(slug);
    expect(manifest?.importStatus === 'imported' || manifest?.importStatus === 'imported-with-warnings').toBe(true);
    expect(manifest?.reviewStatus).toBe('open');
  });
});

describe('Rücknahme: nur bei amtlich belegtem Inkrafttreten nach dem Stichtag', () => {
  const rewriteBaseline = async (root: string, decision: BaselineDecision): Promise<void> => {
    await writeFile(join(root, IMPORT_DATA_DIR, 'baseline.json'), `${JSON.stringify({ schemaVersion: 'bayernrecht-baseline/1', baselineDate: BASELINE, evaluationDate: '2026-09-18', totals: { candidates: 1, examined: 1, notCached: 0, unreadable: 0, byClass: {}, byStatus: {}, byMethod: {}, issueDateSource: {} }, decisions: [decision] }, null, 2)}\n`, 'utf8');
  };
  const notAtBaseline = (reason: string): BaselineDecision => ({
    documentId: 'BayAbmG',
    evidence: [{ kind: 'official-commencement', value: '2023-12-15 (BayMBl. 2023 Nr. 598)', source: 'amtliche Verkündung:Inkrafttretensvorschrift' }],
    class: 'enacted-after-baseline',
    status: 'not-at-baseline',
    method: 'undetermined',
    reason,
    blockers: [],
  } as BaselineDecision);

  it('nimmt eine übernommene Norm heraus, wenn die amtliche Verkündung ein späteres Inkrafttreten belegt; der Slug bleibt reserviert', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const slug = resultFor(await run(root, { write: true }), 'BayAbmG')!.targetSlug!;
    await rewriteBaseline(root, notAtBaseline('official-commencement-after-baseline'));
    const second = await run(root, { write: true });
    expect(resultFor(second, 'BayAbmG')?.result).not.toBe('kept-existing');
    await expect(readFile(join(root, 'content', 'norms', 'baywue', slug, 'meta.json'), 'utf8')).rejects.toThrow();
    const manifest = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(manifest?.importStatus === 'imported' || manifest?.importStatus === 'imported-with-warnings').toBe(false);
    expect(manifest?.targetSlug).toBe('');
    expect(manifest?.findings.map((finding) => finding.code)).toContain('withdrawn-not-at-baseline');
    // Der Slug ist stillgelegt (ohne Nachfolger, ohne Umleitung) und wird nie neu vergeben.
    const registry = JSON.parse(await readFile(join(root, SLUG_REGISTRY_PATH), 'utf8')) as { entries: Array<{ sourceIdentity: string }>; retired?: Array<{ slug: string; successor?: string; withdrawn?: unknown }> };
    expect(registry.entries.some((reserved) => reserved.sourceIdentity === 'BayAbmG')).toBe(false);
    expect(registry.retired).toContainEqual(expect.objectContaining({ slug, withdrawn: expect.anything() }));
    expect(registry.retired?.find((retired) => retired.slug === slug)?.successor).toBeUndefined();
    // Auch im Folgelauf bleibt die Rücknahme am Eintrag erkennbar.
    await run(root, { write: true });
    expect((await readManifestEntry(root, 'landesrecht', 'BayAbmG'))?.findings.map((finding) => finding.code)).toContain('withdrawn-not-at-baseline');
  });

  it('jede andere Verschlechterung behält den übernommenen Stand (Review)', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }]);
    const slug = resultFor(await run(root, { write: true }), 'BayAbmG')!.targetSlug!;
    await rewriteBaseline(root, notAtBaseline('published-after-baseline'));
    const second = await run(root, { write: true });
    expect(resultFor(second, 'BayAbmG')?.result).toBe('kept-existing');
    expect(await readFile(join(root, 'content', 'norms', 'baywue', slug, 'meta.json'), 'utf8')).toContain('BayAbmG');
  });
});

/* ------------------------------------------------------------------ Rückrechnung */

describe('Rückrechnung: der Stichtagstext entsteht nur aus einem bewiesenen Rezept', () => {
  // Das echte Abmarkungsgesetz, dessen heutiger Text laut Paket erst seit 2025-01-01 gilt. Die Änderung hat
  // „Daneben“ eingeführt; am Stichtag hieß es „Außerdem“ (das Wort steht genau einmal im Körper).
  const CURRENT_FROM = '2025-01-01';
  const amended = (): Uint8Array => normPackage('BayAbmG', fixture('abmarkungsgesetz').replace('<inkraft>2015-08-01', `<inkraft>${CURRENT_FROM}`));
  const GAZETTE_URL = 'https://www.verkuendung-bayern.de/gvbl/2024-999/';
  const gazetteBytes = new TextEncoder().encode('<html><body>§ 1 Das Abmarkungsgesetz wird wie folgt geändert: In Art. 3 Satz 2 wird das Wort „Außerdem“ durch das Wort „Daneben“ ersetzt. § 2 Dieses Gesetz tritt am 1. Januar 2025 in Kraft.</body></html>');
  const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

  const decision = (): BaselineDecision => ({ ...classifyBaseline({ documentId: 'BayAbmG', documentDate: '1981-08-06', inForceFrom: CURRENT_FROM }), method: 'reverse-amendment', status: 'active-at-baseline', blockers: [] });

  /** Findet das einzige Textfeld mit dem Wortlaut und liefert seinen Indexpfad. */
  function locate(blocks: readonly NormBodyBlock[], needle: string, path: number[] = []): FieldRef[] {
    return blocks.flatMap((block, index) => [
      ...(typeof block.text === 'string' && block.text.includes(needle) ? [{ path: [...path, index], key: 'text' as const }] : []),
      ...locate(block.children ?? [], needle, [...path, index]),
    ]);
  }

  function recipe(overrides: Partial<ReconstructionRecipe> = {}): ReconstructionRecipe {
    const bytes = amended();
    const body = parseBayernRechtPackage({ portal: 'bayernrecht', url: zipUrl('BayAbmG'), retrievedAt: '2026-09-17', mediaType: 'application/zip', sha256: sha(bytes) }, bytes, { unknown: 'report' }).law.body;
    const fields = locate(body, 'Daneben');
    expect(fields).toHaveLength(1);
    const steps: RecipeStep[] = [{
      id: '1', command: 'In Art. 3 Satz 2 wird das Wort „Außerdem“ durch das Wort „Daneben“ ersetzt.', commandPath: ['§ 1'], formula: 'replace-words', location: 'Art. 3 Satz 2',
      scope: { fields, resolved: ['Art. 3'], widened: ['Satz 2'] }, operation: { kind: 'replace', from: 'Außerdem', to: 'Daneben' },
      evidence: { baseline: 'Außerdem sind die Behörden', current: 'Daneben sind die Behörden' },
    }];
    return {
      schemaVersion: RECIPE_SCHEMA, documentId: 'BayAbmG', baselineDate: BASELINE, method: 'reverse-amendment',
      source: { url: zipUrl('BayAbmG'), sha256: sha(bytes), parserVersion: 'test', inForceFrom: CURRENT_FROM },
      amendment: {
        eventId: 'gvbl-2024-999', citation: 'Gesetz vom 10. Dezember 2024 (GVBl. S. 999)', organ: 'GVBl', publicationAuthority: 'electronic-official', digitalRepresentation: 'born-digital',
        url: GAZETTE_URL, sha256: sha(gazetteBytes), eventDate: '2024-12-15', effectiveDate: CURRENT_FROM, effectiveDateEvidence: ['§ 2 Dieses Gesetz tritt am 1. Januar 2025 in Kraft.'], intro: 'Das Abmarkungsgesetz wird wie folgt geändert:',
      },
      chain: ['Vollzitat des Portals: zuletzt geändert durch Gesetz vom 10. Dezember 2024'], steps, whitespace: WHITESPACE_NORMALIZATION,
      expected: { currentFingerprint: bodyFingerprint(body), baselineFingerprint: bodyFingerprint(reverseSteps(body, steps)) },
      baselineTextInForce: { date: '2015-08-01', evidence: ['Fassungsdatum der Vorfassung laut Portal: 2015-08-01'] },
      ...overrides,
    };
  }

  async function reconstructionRoot(options: { recipe?: ReturnType<typeof recipe>; gazette?: boolean } = {}): Promise<string> {
    const root = await fixtureRoot([{ id: 'BayAbmG', baseline: decision(), bytes: amended() }], 'landesrecht-bayernrecht-reconstruction-');
    if (options.recipe) {
      await mkdir(join(root, RECONSTRUCTION_DIR), { recursive: true });
      await writeFile(join(root, RECONSTRUCTION_DIR, 'BayAbmG.json'), `${JSON.stringify(options.recipe, null, 2)}\n`, 'utf8');
    }
    if (options.gazette !== false) await seedCache(root, GAZETTE_URL, gazetteBytes);
    return root;
  }

  it('übernimmt die zurückgerechnete Stichtagsfassung mit Rundlauf, Quellgeltung und Änderungsbeleg', async () => {
    const root = await reconstructionRoot({ recipe: recipe() });
    const outcome = await run(root, { write: true });
    expect(resultFor(outcome, 'BayAbmG')?.result).toBe('imported');
    const entry = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(entry).toMatchObject({ baselineRecoveryMethod: 'reverse-post-baseline-event', baselineStatus: 'active-at-baseline', sourceValidFrom: '2015-08-01', sourceValidTo: '2024-12-31' });
    expect(entry!.sourceVersion.validFrom).toBe(CURRENT_FROM);
    expect(entry!.rawDocuments.map((raw) => raw.role)).toEqual(['text-document', 'gazette']);
    expect((entry as { decisionTrace?: DecisionTrace }).decisionTrace?.statement).toContain('zurückgerechnet');
    const slug = entry!.targetSlug;
    const version = JSON.parse(await readFile(join(root, 'content', 'norms', 'baywue', slug, 'versions', `${BASELINE}.json`), 'utf8'));
    const text = JSON.stringify(version.body);
    expect(text).toContain('Außerdem sind die Behörden');
    expect(text).not.toContain('Daneben');
    expect(version).toMatchObject({ sourceValidFrom: '2015-08-01', sourceValidTo: '2024-12-31', sourceStatus: { validity: 'reconstructed', text: 'reconstructed' } });
    expect(version.sourceReferences).toContainEqual(expect.objectContaining({ kind: 'official-gazette', sourceRole: 'amendment-evidence', url: GAZETTE_URL }));
  });

  it('übernimmt ohne Rezept nichts', async () => {
    const outcome = await run(await reconstructionRoot());
    expect(resultFor(outcome, 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-recipe-unusable' });
  });

  it('lehnt ein Rezept ab, dessen Rundlauf nicht den geprüften Stichtagskörper ergibt', async () => {
    const tampered = recipe();
    tampered.expected = { ...tampered.expected, baselineFingerprint: '0'.repeat(64) };
    const entry = resultFor(await run(await reconstructionRoot({ recipe: tampered })), 'BayAbmG');
    expect(entry).toMatchObject({ result: 'review', code: 'reconstruction-roundtrip-failed' });
    expect(entry?.reviewCategories).toContain('reconstruction-required');
  });

  it('verlangt einen belegten Beginn der Stichtagsfassung und die Übereinstimmung mit dem Paket', async () => {
    const withoutBegin: Partial<ReconstructionRecipe> = recipe();
    delete withoutBegin.baselineTextInForce;
    expect(resultFor(await run(await reconstructionRoot({ recipe: withoutBegin as ReconstructionRecipe })), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-recipe-mismatch' });
    const lateBegin = recipe({ baselineTextInForce: { date: '2024-01-01', evidence: ['zu spät'] } });
    expect(resultFor(await run(await reconstructionRoot({ recipe: lateBegin })), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-recipe-mismatch' });
    const otherDate = recipe();
    otherDate.amendment = { ...otherDate.amendment, effectiveDate: '2025-02-01' };
    expect(resultFor(await run(await reconstructionRoot({ recipe: otherDate })), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-recipe-mismatch' });
  });

  it('lehnt eine Änderung ab, die vor dem Stichtag in Kraft trat – sie gehört zur Stichtagsfassung', async () => {
    const early = recipe();
    early.amendment = { ...early.amendment, effectiveDate: '2023-06-01' };
    expect(resultFor(await run(await reconstructionRoot({ recipe: early })), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-recipe-unusable' });
  });

  it('übernimmt nichts, wenn der Änderungsbeleg nicht im Cache liegt', async () => {
    expect(resultFor(await run(await reconstructionRoot({ recipe: recipe(), gazette: false })), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-evidence-missing' });
  });

  /**
   * Zweistufig (v2): 2024 wurde „Außerdem“ zu „Zudem“, 2025 „Zudem“ zu „Daneben“. Rückwärts jüngste zuerst, dann
   * vorwärts älteste zuerst; jede Verkündung liegt im Cache und wird archiviert, die Fassung gilt bis zum Vortag der
   * älteren Änderung.
   */
  const OLDER_URL = 'https://www.verkuendung-bayern.de/gvbl/2024-555/';
  const olderBytes = new TextEncoder().encode('<html><body>§ 1 In Art. 3 Satz 2 wird das Wort „Außerdem“ durch das Wort „Zudem“ ersetzt. § 2 Dieses Gesetz tritt am 1. Juni 2024 in Kraft.</body></html>');

  function recipeV2(): ReconstructionRecipeV2 {
    const one = recipe();
    const bytes = amended();
    const body = parseBayernRechtPackage({ portal: 'bayernrecht', url: zipUrl('BayAbmG'), retrievedAt: '2026-09-17', mediaType: 'application/zip', sha256: sha(bytes) }, bytes, { unknown: 'report' }).law.body;
    const fields = locate(body, 'Daneben');
    const newerSteps: RecipeStep[] = [{ ...one.steps[0]!, command: 'In Art. 3 Satz 2 wird das Wort „Zudem“ durch das Wort „Daneben“ ersetzt.', operation: { kind: 'replace', from: 'Zudem', to: 'Daneben' }, evidence: { baseline: 'Zudem sind die Behörden', current: 'Daneben sind die Behörden' }, scope: { ...one.steps[0]!.scope, fields } }];
    const middle = reverseSteps(body, newerSteps);
    const olderSteps: RecipeStep[] = [{ ...one.steps[0]!, command: 'In Art. 3 Satz 2 wird das Wort „Außerdem“ durch das Wort „Zudem“ ersetzt.', operation: { kind: 'replace', from: 'Außerdem', to: 'Zudem' }, evidence: { baseline: 'Außerdem sind die Behörden', current: 'Zudem sind die Behörden' }, scope: { ...one.steps[0]!.scope, fields: locate(middle, 'Zudem') } }];
    const baseline = reverseSteps(middle, olderSteps);
    const newer = { ...one.amendment, steps: newerSteps, expected: { beforeFingerprint: bodyFingerprint(middle), afterFingerprint: bodyFingerprint(body) } };
    const older = { ...one.amendment, eventId: 'gvbl-2024-555', citation: 'Gesetz vom 20. Mai 2024 (GVBl. S. 555)', url: OLDER_URL, sha256: sha(olderBytes), eventDate: '2024-05-25', effectiveDate: '2024-06-01', effectiveDateEvidence: ['§ 2 Dieses Gesetz tritt am 1. Juni 2024 in Kraft.'], steps: olderSteps, expected: { beforeFingerprint: bodyFingerprint(baseline), afterFingerprint: bodyFingerprint(middle) } };
    return {
      schemaVersion: RECIPE_SCHEMA_V2, documentId: 'BayAbmG', baselineDate: BASELINE, method: 'reverse-amendment', source: one.source,
      amendments: [newer, older], baselineTextInForce: one.baselineTextInForce, chain: ['zwei Änderungen nach dem Stichtag, lückenlos'],
      sources: [{ role: 'reversed-amendment', citation: newer.citation, url: newer.url, sha256: newer.sha256 }, { role: 'reversed-amendment', citation: older.citation, url: older.url, sha256: older.sha256 }],
      whitespace: WHITESPACE_NORMALIZATION, expected: { currentFingerprint: bodyFingerprint(body), baselineFingerprint: bodyFingerprint(baseline) },
    };
  }

  it('rechnet über mehrere Änderungen zurück (v2) und archiviert jeden Beleg', async () => {
    const root = await reconstructionRoot({ recipe: recipeV2() as unknown as ReconstructionRecipe });
    await seedCache(root, OLDER_URL, olderBytes);
    const outcome = await run(root, { write: true });
    expect(resultFor(outcome, 'BayAbmG')?.result, JSON.stringify(resultFor(outcome, 'BayAbmG'))).toBe('imported');
    const entry = (await readManifestEntry(root, 'landesrecht', 'BayAbmG'))!;
    expect(entry).toMatchObject({ sourceValidFrom: '2015-08-01', sourceValidTo: '2024-05-31' });
    expect(entry.rawDocuments.filter((raw) => raw.role === 'gazette').map((raw) => raw.url)).toEqual([GAZETTE_URL, OLDER_URL]);
    expect((entry as { decisionTrace?: DecisionTrace }).decisionTrace?.statement).toContain('2-mal geändert');
    const version = JSON.parse(await readFile(join(root, 'content', 'norms', 'baywue', entry.targetSlug, 'versions', `${BASELINE}.json`), 'utf8'));
    const text = JSON.stringify(version.body);
    expect(text).toContain('Außerdem sind die Behörden');
    expect(text).not.toMatch(/Zudem|Daneben/u);
    expect(version.sourceReferences.filter((reference: { sourceRole?: string; url?: string }) => reference.sourceRole === 'amendment-evidence').map((reference: { url?: string }) => reference.url)).toEqual([GAZETTE_URL, OLDER_URL]);
  });

  it('übernimmt eine v2-Kette nicht, wenn der Beleg einer älteren Änderung fehlt', async () => {
    const root = await reconstructionRoot({ recipe: recipeV2() as unknown as ReconstructionRecipe });
    expect(resultFor(await run(root), 'BayAbmG')).toMatchObject({ result: 'review', code: 'reconstruction-evidence-missing' });
  });
});

/* ------------------------------------------------------------------ Zusammengeführte Anlage */

describe('Normative Anlage als eigenes Portaldokument (BayBodSchO → BayEVBodenseeSchO)', () => {
  const annexDocument = (baseline?: BaselineDecision | 'none'): DocumentFixture => ({ id: 'BayVerf', scope: 'exclude', scopeReason: 'annex-merged-into-related-norm', relatedDocumentId: 'BayAbmG', bytes: verfassung(), ...(baseline ? { baseline } : {}) });

  it('hängt die Anlage vollständig an die Stammnorm an und importiert sie nicht doppelt', async () => {
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }, annexDocument()]);
    const outcome = await run(root, { write: true });
    expect(resultFor(outcome, 'BayAbmG'), JSON.stringify(resultFor(outcome, 'BayAbmG'))).toMatchObject({ result: 'imported' });
    expect(resultFor(outcome, 'BayVerf')).toBeUndefined();
    const entry = await readManifestEntry(root, 'landesrecht', 'BayAbmG');
    expect(entry!.rawDocuments.map((raw) => raw.role)).toEqual(['text-document', 'annex']);
    const version = JSON.parse(await readFile(join(root, 'content', 'norms', 'baywue', entry!.targetSlug, 'versions', `${BASELINE}.json`), 'utf8'));
    const annex = version.body.at(-1);
    expect(annex).toMatchObject({ type: 'annex', label: 'Anhang' });
    expect(JSON.stringify(annex.children).length).toBeGreaterThan(1000);
    expect(version.sourceReferences.some((reference: { label: string }) => reference.label.startsWith('Anhang: '))).toBe(true);
    expect(await readManifestEntry(root, 'landesrecht', 'BayVerf')).toBeUndefined();
  });

  it('sperrt die Stammnorm, wenn die Anlage am Stichtag nicht trägt – nie ohne Anlage übernehmen', async () => {
    const changed = classifyBaseline({ documentId: 'BayVerf', documentDate: '1946-12-02', inForceFrom: '2026-01-01' });
    const root = await fixtureRoot([{ id: 'BayAbmG', bytes: abmarkungsgesetz() }, annexDocument(changed)]);
    const entry = resultFor(await run(root), 'BayAbmG');
    expect(entry).toMatchObject({ result: 'review', code: 'merged-annex-not-at-baseline' });
    expect(entry?.reviewCategories).toContain('incomplete-annex');
  });
});

describe('Abbildungen: figure-Blöcke mit gebundener Bilddatei', () => {
  it('übernimmt Abbildungen als Asset-Referenz und bindet jede Bilddatei als Rohquelle an Paket und Pfad', async () => {
    // Das Fixture-Paket mit Textbeginn vor dem Stichtag (sonst trägt es den Stichtag nicht) und echten GIF-Köpfen.
    const images = [...fixture('manifestBodenfischerei').matchAll(/full-path="\/(img\/[^"]+)"/gu)].map((match) => match[1]!);
    const zip = buildZipArchive([
      { path: 'mimetype', content: 'bayportalnorm+zip' },
      { path: 'META-INF/manifest.xml', content: fixture('manifestBodenfischerei') },
      { path: 'bayportalnorm/BayBoFiV.xml', content: fixture('bodenfischerei').replace('<inkraft>2025-12-01</inkraft>', '<inkraft>2015-08-01</inkraft>') },
      ...images.map((path) => ({ path, content: gifBytes(40, 30, path) })),
    ]);
    const root = await fixtureRoot([{ id: 'BayBoFiV', bytes: zip, baseline: eligible('BayBoFiV') }]);
    const outcome = await run(root, { write: true });
    const summary = resultFor(outcome, 'BayBoFiV');
    expect(summary?.result, JSON.stringify(summary)).toMatch(/^imported/u);
    const entry = (await readManifestEntry(root, 'landesrecht', 'BayBoFiV'))!;
    const figures = entry.rawDocuments.filter((raw) => raw.role === 'figure');
    expect(figures.map((raw) => raw.packagePath)).toEqual(['img/BayBoFiV_BayBoFiV-A2-N1.gif', 'img/BayBoFiV_BayBoFiV-A2-N2.gif']);
    const zipSha = createHash('sha256').update(zip).digest('hex');
    expect(figures.every((raw) => raw.packageSha256 === zipSha && raw.url === entry.rawDocuments[0]!.url && raw.contentType === 'image/gif')).toBe(true);

    const version = JSON.parse(await readFile(join(root, 'content', 'norms', 'baywue', entry.targetSlug, 'versions', `${BASELINE}.json`), 'utf8')) as { body: NormBodyBlock[] };
    const blocks: NormBodyBlock[] = [];
    const walk = (list: readonly NormBodyBlock[]): void => { for (const block of list) { blocks.push(block); walk(block.children ?? []); } };
    walk(version.body);
    const assets = blocks.filter((block) => block.type === 'figure').map((block) => block.asset!);
    expect(assets.map((asset) => asset.sha256)).toEqual(figures.map((raw) => raw.sha256));
    // Kein Bildinhalt im Norm-JSON, nur die Referenz.
    expect(JSON.stringify(version)).not.toMatch(/GIF89a|base64/u);
  });

  it('bindet je SHA-256 einmal und meldet Abbildungen ohne belegte Bilddatei', () => {
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
    const asset = (name: string) => ({ sha256: sha(name), mediaType: 'image/png' as const, byteLength: 10, sourcePath: `img/${name}` });
    const record = { versions: [{ body: [
      { type: 'annex', label: 'Anlage 1', children: [{ type: 'figure', asset: asset('a.png') }, { type: 'figure', asset: asset('a.png') }] },
      { type: 'figure', asset: asset('fremd.png') },
    ] }] } as unknown as Parameters<typeof figureRawDocuments>[0];
    const pkg = { url: 'https://www.gesetze-bayern.de/Content/Zip/BayX', sha256: sha('zip'), retrievedAt: '2026-09-18T00:00:00.000Z', attachments: [{ path: 'img/a.png', fileName: 'a.png', mediaType: 'image/jpg', kind: 'image' as const, byteLength: 10, sha256: sha('a.png') }] };
    const bound = figureRawDocuments(record, [pkg]);
    expect(bound.raw).toEqual([{ role: 'figure', url: pkg.url, finalUrl: pkg.url, sha256: sha('a.png'), contentType: 'image/png', retrievedAt: pkg.retrievedAt, byteLength: 10, packagePath: 'img/a.png', packageSha256: sha('zip') }]);
    expect(bound.unbound).toEqual([`img/fremd.png (${sha('fremd.png').slice(0, 16)}…)`]);
  });
});
