/**
 * Konsolidierung der Simulationsrechtsfortschreibung gegen ein temporäres Repository: Sim-Akt materialisieren,
 * Rezept anwenden, Aufhebung, Wortlautprobe, gesperrte Ziele, Unveränderlichkeit und `--check` (Gate G4).
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { getApplicableVersion } from '@landesrecht/legal-core/lib/versions.ts';
import { sha256 } from '@landesrecht/importer-simulation/engine/hash.ts';
import { runConsolidation, renderConsolidationLines, type ConsolidationResult } from '@landesrecht/importer-simulation/consolidate/run.ts';
import { checkWording, normalizeWording } from '@landesrecht/importer-simulation/consolidate/text-check.ts';
import { ACT_SCHEMA_VERSION, RECIPE_SCHEMA_VERSION } from '@landesrecht/importer-simulation/recipes/schema.ts';

const TARGET = 'testfixture-schulg-west';
const ACT = 'testfixture-aendg-schulg-2026-west';
const REPEAL_ACT = 'testfixture-aufhg-schulg-2027-west';
const SOURCE_SHA = '1'.repeat(64);
const REPEAL_SHA = '2'.repeat(64);
const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function simReference(kind: string, sha: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind, system: 'simulation', label: 'GV. West 2026 Nr. 2', availability: 'r2-archived', bucket: 'landesrecht-quellen', objectKey: `west/simulation/${sha}.pdf`, sha256: sha, mediaType: 'application/pdf', publicationSlug: 'gv-west-2026-2-20260517', ...extra };
}

const baselineBody = [
  { type: 'paragraph', label: '§ 1', title: 'Recht auf Bildung', children: [{ type: 'subparagraph', label: '(1)', text: 'Jeder junge Mensch hat ein Recht auf schulische Bildung.', children: [] }] },
  { type: 'paragraph', label: '§ 3', title: 'Schulpflicht', children: [
    { type: 'subparagraph', label: '(1)', text: 'Schulpflichtig ist, wer im Land Westdeutschland seinen Wohnsitz hat.', children: [] },
    { type: 'subparagraph', label: '(2)', text: 'Die Schulpflicht endet nach zehn Schulbesuchsjahren.', children: [] },
  ] },
  { type: 'paragraph', label: '§ 4', title: 'Erfüllung der Schulpflicht', children: [{ type: 'subparagraph', label: '(1)', text: 'Die Schulpflicht wird durch den Besuch einer öffentlichen Schule erfüllt.', children: [] }] },
];

const baselineMeta = {
  id: `west:${TARGET}`, slug: TARGET, jurisdiction: 'west', title: 'Testfixture Schulgesetz West', shortTitle: 'Testfixture SchulG West', shortTitleSource: 'official', type: 'gesetz', status: 'in-force', enactingBody: 'Landtag', originEnactingBody: 'Landtag', subjects: [], keywords: [],
  initialCitation: 'Schulgesetz in der am 1. Dezember 2023 übernommenen Fassung (Ausgangsrechtsstand West)', sourceCitation: 'Schulgesetz für das Land Nordrhein-Westfalen vom 15. Februar 2005', documentDate: '2005-02-15', effectiveDate: '2023-12-01', predecessor: null, successor: null, relations: [],
  externalIdentifiers: [{ system: 'recht-nrw', value: 'term:1', url: 'https://recht.nrw.de/taxonomy/term/1' }],
  sourceReferences: [{ kind: 'official-portal-snapshot', system: 'recht-nrw', label: 'RECHT.NRW-Fassungsseite', availability: 'external', url: 'https://recht.nrw.de/lrgv/x', externalId: 'term:1', sourceValidFrom: '2023-08-01', mediaType: 'text/html', sourceRole: 'official-snapshot' }],
};
const baselineHistory = { initialVersionId: '2023-12-01', entries: [{ date: '2023-12-01', type: 'initial', title: 'Ausgangsfassung zum Ausgangsrechtsstand 1. Dezember 2023.', citation: baselineMeta.initialCitation, affectingVersionId: '2023-12-01' }] };
const baselineVersion = { versionId: '2023-12-01', simulationValidFrom: '2023-12-01', simulationValidTo: null, sourceValidFrom: '2023-08-01', citation: baselineMeta.initialCitation, changeNote: 'Ausgangsfassung zum Ausgangsrechtsstand 2023-12-01.', sourceStatus: { validity: 'exact', text: 'direct' }, sourceReferences: baselineMeta.sourceReferences, body: baselineBody };

const actBody = [
  { type: 'article', label: 'Artikel 1', title: 'Änderung des Schulgesetzes', children: [
    { type: 'paragraphText', text: 'Das Schulgesetz wird wie folgt geändert:' },
    { type: 'item', label: '1.', text: '§ 3 Absatz 2 wird wie folgt gefasst: „Die Schulpflicht endet nach elf Schulbesuchsjahren.“', children: [] },
    { type: 'item', label: '2.', text: 'Nach § 4 wird folgender § 5 eingefügt: „§ 5 Ganztagsangebot. Öffentliche Schulen halten ein Ganztagsangebot vor.“', children: [] },
  ] },
  { type: 'article', label: 'Artikel 2', title: 'Inkrafttreten', children: [{ type: 'paragraphText', text: 'Dieses Gesetz tritt am 18. Mai 2026 in Kraft.' }] },
];
const actSourceText = `Gesetz zur Änderung des Schulgesetzes\nArtikel 1\nÄnderung des Schulgesetzes\nDas Schulgesetz wird wie folgt geändert:\n1. § 3 Absatz 2 wird wie folgt gefasst: „Die Schulpflicht endet nach elf Schul-\nbesuchsjahren.“\n2. Nach § 4 wird folgender § 5 eingefügt: „§ 5 Ganztagsangebot. Öffentliche Schulen halten ein\nGanztagsangebot vor.“\nArtikel 2\nInkrafttreten\nDieses Gesetz tritt am 18. Mai 2026 in Kraft.\n`;

function amendmentAct(): Record<string, unknown> {
  return {
    schemaVersion: ACT_SCHEMA_VERSION, slug: ACT, jurisdiction: 'west',
    meta: { title: 'Gesetz zur Änderung des Schulgesetzes', type: 'aenderungsvorschrift', status: 'one-time-act', enactingBody: 'Landtag Westdeutschland', subjects: ['Bildungswesen'], keywords: [], initialCitation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)', documentDate: '2026-05-12', publicationDate: '2026-05-17', effectiveDate: '2026-05-18', relations: [{ type: 'amends', target: { slug: TARGET }, note: 'Artikel 1', date: '2026-05-18' }] },
    version: { versionId: '2026-05-18', simulationValidFrom: '2026-05-18', citation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)', changeNote: 'Amtlich veröffentlicht.', body: actBody, sourceReferences: [simReference('simulation-gazette', SOURCE_SHA, { pageRange: '10–12', sourceRole: 'structure-bearing' })] },
    publication: { slug: 'gv-west-2026-2-20260517', pages: '10–12' },
    provenance: { transcribedFrom: SOURCE_SHA, method: 'text-layer', checked: 'Wortlaut gegen Layouttext geprüft' },
  };
}

function operation(partial: Record<string, unknown>): Record<string, unknown> {
  return { expectedMatches: 1, source: `west/simulation/${SOURCE_SHA}.pdf`, sourceProvision: 'Artikel 1 Nummer 1', effectiveDate: '2026-05-18', ...partial };
}

function amendmentRecipe(expectedHashForParagraph4: string): Record<string, unknown> {
  return {
    schemaVersion: RECIPE_SCHEMA_VERSION, amendmentAct: ACT, effectiveDate: '2026-05-18', amendmentCitation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)',
    resultCitation: 'Schulgesetz, zuletzt geändert durch Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)', changeNote: '§ 3 Absatz 2 neu gefasst, § 5 eingefügt.', commandCoverage: ['Artikel 1 Nummern 1 und 2'],
    sourceReferences: [simReference('simulation-amendment-source', SOURCE_SHA, { pageRange: '10–12' })],
    operations: [
      operation({ op: 'replaceText', target: { type: 'subparagraph', label: '(2)', parentType: 'paragraph', parentLabel: '§ 3' }, field: 'text', expectedOld: 'Die Schulpflicht endet nach zehn Schulbesuchsjahren.', value: 'Die Schulpflicht endet nach elf Schulbesuchsjahren.' }),
      operation({ op: 'insertProvisionAfter', target: { type: 'paragraph', label: '§ 4' }, expectedHash: expectedHashForParagraph4, value: { type: 'paragraph', label: '§ 5', title: 'Ganztagsangebot', children: [{ type: 'subparagraph', label: '(1)', text: 'Öffentliche Schulen halten ein Ganztagsangebot vor.', children: [] }] }, sourceProvision: 'Artikel 1 Nummer 2' }),
    ],
  };
}

function repealAct(): Record<string, unknown> {
  return {
    schemaVersion: ACT_SCHEMA_VERSION, slug: REPEAL_ACT, jurisdiction: 'west',
    meta: { title: 'Gesetz zur Aufhebung des Schulgesetzes', type: 'aenderungsvorschrift', status: 'one-time-act', subjects: ['Bildungswesen'], keywords: [], initialCitation: 'Gesetz vom 20. Dezember 2026 (GV. West 2026 Nr. 9 S. 1)', effectiveDate: '2027-01-01', relations: [] },
    version: { versionId: '2027-01-01', simulationValidFrom: '2027-01-01', citation: 'Gesetz vom 20. Dezember 2026 (GV. West 2026 Nr. 9 S. 1)', changeNote: 'Amtlich veröffentlicht.', body: [{ type: 'article', label: 'Artikel 1', children: [{ type: 'paragraphText', text: 'Das Schulgesetz wird aufgehoben.' }] }], sourceReferences: [simReference('simulation-gazette', REPEAL_SHA, { publicationSlug: 'gv-west-2026-9-20261220' })] },
    publication: { slug: 'gv-west-2026-9-20261220', pages: '1' },
    provenance: { transcribedFrom: REPEAL_SHA, method: 'txt', checked: 'geprüft' },
  };
}

function repealRecipe(expectedHash: string): Record<string, unknown> {
  return {
    schemaVersion: RECIPE_SCHEMA_VERSION, amendmentAct: REPEAL_ACT, effectiveDate: '2027-01-01', repealsLaw: true, amendmentCitation: 'Gesetz vom 20. Dezember 2026 (GV. West 2026 Nr. 9 S. 1)', resultCitation: 'Schulgesetz (aufgehoben)', changeNote: 'Aufgehoben durch Artikel 1 des Gesetzes vom 20. Dezember 2026.',
    sourceReferences: [simReference('simulation-amendment-source', REPEAL_SHA, { publicationSlug: 'gv-west-2026-9-20261220' })],
    operations: [{ op: 'repealLaw', expectedHash, expectedMatches: 1, source: `west/simulation/${REPEAL_SHA}.pdf`, sourceProvision: 'Artikel 1', effectiveDate: '2027-01-01' }],
  };
}

interface Root {
  root: string;
  normDir: string;
  write(relative: string, value: unknown): Promise<void>;
  read(relative: string): Promise<string>;
  exists(relative: string): Promise<boolean>;
  run(mode: 'dry-run' | 'write' | 'check', extra?: { only?: string[]; referenceDate?: string }): Promise<ConsolidationResult>;
}

async function createRoot(): Promise<Root> {
  const root = await mkdtemp(join(tmpdir(), 'landesrecht-consolidate-'));
  const write = async (relative: string, value: unknown): Promise<void> => {
    await mkdir(join(root, relative, '..'), { recursive: true });
    await writeFile(join(root, relative), typeof value === 'string' ? value : jsonText(value), 'utf8');
  };
  const normDir = `content/norms/west/${TARGET}`;
  await write(`${normDir}/meta.json`, baselineMeta);
  await write(`${normDir}/history.json`, baselineHistory);
  await write(`${normDir}/versions/2023-12-01.json`, baselineVersion);
  await write(`.cache/simulation/text/${SOURCE_SHA}.txt`, actSourceText);
  await write(`.cache/simulation/text/${REPEAL_SHA}.txt`, 'Gesetz zur Aufhebung des Schulgesetzes\nArtikel 1\nDas Schulgesetz wird aufgehoben.\n');
  await write(`data/simulation/west/acts/${ACT}.json`, amendmentAct());
  await write(`data/simulation/west/amendments/${ACT}/${TARGET}.json`, amendmentRecipe(sha256(baselineBody[2])));
  return {
    root,
    normDir,
    write,
    read: (relative) => readFile(join(root, relative), 'utf8'),
    exists: (relative) => stat(join(root, relative)).then(() => true, () => false),
    run: (mode, extra = {}) => runConsolidation({ root, jurisdiction: 'west', mode, now: '2026-09-28T00:00:00.000Z', ...extra }),
  };
}

describe('Wortlautprobe', () => {
  it('normalisiert Leerraum, Trennstriche und U+200B und meldet fehlende Textstellen', () => {
    expect(normalizeWording('Schul-\n  besuchs​jahre   sind\tviele')).toBe('Schulbesuchsjahre sind viele');
    const result = checkWording([{ type: 'paragraph', label: '§ 1', title: 'Schulpflicht', children: [{ type: 'subparagraph', label: '(1)', text: 'Die Schulpflicht endet nach elf Schulbesuchsjahren.', children: [] }, { type: 'subparagraph', label: '(2)', text: 'Dieser Satz steht nirgends.', children: [] }] }], [actSourceText]);
    expect(result).toMatchObject({ blocks: 3, found: 2, missing: [{ path: 'body[0].children[1].text', text: 'Dieser Satz steht nirgends.' }] });
    const loose = checkWording([{ type: 'paragraphText', text: 'Gesetz- und Verordnungsblatt' }], ['Gesetz-\nund Verordnungsblatt']);
    expect(loose).toMatchObject({ found: 1, foundLoosely: 1, missing: [] });
  });
});

describe('Konsolidierung im temporären Repository', () => {
  let fixture: Root;
  let baselineText: string;
  let metaTextBefore: string;

  beforeAll(async () => {
    fixture = await createRoot();
    baselineText = await fixture.read(`${fixture.normDir}/versions/2023-12-01.json`);
    metaTextBefore = await fixture.read(`${fixture.normDir}/meta.json`);
  });
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('Dry-run plant Akt und Fassung, schreibt aber nichts', async () => {
    const result = await fixture.run('dry-run');
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.acts).toEqual([expect.objectContaining({ slug: ACT, status: 'new', textCheck: expect.objectContaining({ blocks: 6, found: 6, foundLoosely: 0 }) })]);
    expect(result.recipes).toEqual([expect.objectContaining({ target: TARGET, status: 'new', versionId: '2026-05-18', seedVersionId: '2023-12-01' })]);
    expect(result.files.filter((file) => file.status === 'new').map((file) => file.path).sort()).toEqual([
      `content/norms/west/${ACT}/history.json`, `content/norms/west/${ACT}/meta.json`, `content/norms/west/${ACT}/versions/2026-05-18.json`, `${fixture.normDir}/versions/2026-05-18.json`,
    ]);
    expect(result.files.filter((file) => file.status === 'update').map((file) => file.path).sort()).toEqual([`${fixture.normDir}/history.json`, `${fixture.normDir}/meta.json`]);
    expect(result.written).toEqual([]);
    expect(await fixture.exists(`${fixture.normDir}/versions/2026-05-18.json`)).toBe(false);
    expect(renderConsolidationLines(result).join('\n')).toContain('Dry-run: 6 Datei(en) würden geschrieben');
    const check = await fixture.run('check');
    expect(check.ok).toBe(false);
    expect(check.checkProblems.some((problem) => problem.includes('fehlt im Bestand'))).toBe(true);
  });

  it('Schreiblauf materialisiert den Akt, erzeugt die Fassung write-once und ändert Meta/Historie nur additiv', async () => {
    const result = await fixture.run('write');
    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(7);
    expect(await fixture.read(`${fixture.normDir}/versions/2023-12-01.json`)).toBe(baselineText);

    const target = await loadNorm('west', TARGET, fixture.root);
    expect(target.versions.map((version) => [version.versionId, version.simulationValidTo])).toEqual([['2023-12-01', '2026-05-17'], ['2026-05-18', null]]);
    const raw = JSON.parse(await fixture.read(`${fixture.normDir}/versions/2026-05-18.json`)) as Record<string, unknown>;
    expect(raw.simulationValidTo).toBeNull();
    expect(raw).not.toHaveProperty('sourceValidFrom');
    expect(raw).not.toHaveProperty('sourceStatus');
    expect((raw.sourceReferences as Array<{ kind: string }>).map((reference) => reference.kind)).toEqual(['simulation-amendment-source']);
    const body = target.versions[1]!.body;
    expect(body.map((block) => block.label)).toEqual(['§ 1', '§ 3', '§ 4', '§ 5']);
    expect(body[1]!.children![1]!.text).toBe('Die Schulpflicht endet nach elf Schulbesuchsjahren.');
    expect(target.versions[1]!.citation).toContain('zuletzt geändert durch Gesetz vom 12. Mai 2026');
    expect(getApplicableVersion(target, '2026-09-01').versionId).toBe('2026-05-18');

    expect(target.history.entries.map((entry) => entry.type)).toEqual(['initial', 'amendment']);
    expect(target.history.entries[1]).toMatchObject({ date: '2026-05-18', affectingVersionId: '2026-05-18', relatedNorm: { slug: ACT }, citation: 'Gesetz vom 12. Mai 2026 (GV. West 2026 Nr. 2 S. 10)' });
    expect(target.meta.relations).toEqual([{ type: 'amended-by', target: { slug: ACT }, note: 'Artikel 1 Nummern 1 und 2', date: '2026-05-18' }]);
    const metaTextAfter = await fixture.read(`${fixture.normDir}/meta.json`);
    // Alle Baseline-Felder unverändert: nur `relations` wurde ergänzt.
    const before = JSON.parse(metaTextBefore) as Record<string, unknown>;
    const after = JSON.parse(metaTextAfter) as Record<string, unknown>;
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const key of Object.keys(before)) if (key !== 'relations') expect(after[key], key).toEqual(before[key]);

    const act = await loadNorm('west', ACT, fixture.root);
    expect(act.meta).toMatchObject({ type: 'aenderungsvorschrift', status: 'one-time-act', externalIdentifiers: [], relations: [{ type: 'amends', target: { slug: TARGET }, note: 'Artikel 1', date: '2026-05-18' }] });
    expect(act.history.entries).toEqual([expect.objectContaining({ type: 'initial', title: 'Amtlich veröffentlicht (Simulation).', affectingVersionId: '2026-05-18' })]);
    expect(act.versions[0]!.sourceReferences![0]!.kind).toBe('simulation-gazette');

    const manifest = JSON.parse(await fixture.read('data/simulation/west/consolidation-manifest.json')) as { acts: Array<Record<string, unknown>>; recipes: Array<Record<string, unknown>>; blockedTargets: unknown[]; counts: Record<string, number> };
    expect(manifest.counts).toEqual({ acts: 1, recipes: 1, versions: 1, repeals: 0, blockedTargets: 0 });
    expect(manifest.recipes[0]).toMatchObject({ target: TARGET, amendmentAct: ACT, seedVersionId: '2023-12-01', versionId: '2026-05-18', seedHash: sha256({ title: baselineMeta.title, body: baselineBody }) });
    const { createHash } = await import('node:crypto');
    expect(manifest.recipes[0]!.versionSha256).toBe(createHash('sha256').update(await fixture.read(`${fixture.normDir}/versions/2026-05-18.json`)).digest('hex'));
    expect(manifest.acts[0]).toMatchObject({ slug: ACT, versionId: '2026-05-18', textCheck: { blocks: 6, found: 6, foundLoosely: 0, missing: 0 } });
  });

  it('ist idempotent und --check reproduziert den Bestand byteidentisch; eine veränderte Sim-Fassung wird erkannt', async () => {
    const again = await fixture.run('write');
    expect(again.errors).toEqual([]);
    expect(again.written).toEqual([]);
    expect(again.files.every((file) => file.status === 'unchanged')).toBe(true);
    expect(again.manifestStatus).toBe('unchanged');
    expect(await fixture.run('check')).toMatchObject({ ok: true, checkProblems: [], errors: [] });

    const path = `${fixture.normDir}/versions/2026-05-18.json`;
    const original = await fixture.read(path);
    await fixture.write(path, original.replace('elf Schulbesuchsjahren', 'zwölf Schulbesuchsjahren'));
    const tampered = await fixture.run('check');
    expect(tampered.ok).toBe(false);
    expect(tampered.errors).toEqual([expect.stringMatching(/existiert und weicht von der Konsolidierung ab/u)]);
    const writeAttempt = await fixture.run('write');
    expect(writeAttempt.written).toEqual([]);
    expect(await fixture.read(path)).not.toBe(original);
    await fixture.write(path, original);

    // Eine Sim-Fassung ohne Rezept oder Akt fällt der Rückwärtsprüfung auf.
    await fixture.write(`${fixture.normDir}/versions/2026-08-01.json`, { ...JSON.parse(original) as Record<string, unknown>, versionId: '2026-08-01', simulationValidFrom: '2026-08-01' });
    const orphan = await fixture.run('check');
    expect(orphan.checkProblems).toEqual(expect.arrayContaining([expect.stringMatching(/2026-08-01\.json: Sim-Fassung entsteht aus keinem Rezept/u)]));
    await rm(join(fixture.root, fixture.normDir, 'versions', '2026-08-01.json'));
    expect((await fixture.run('check')).ok).toBe(true);
  });

  it('eine Aufhebung erzeugt keine Fassung, setzt Status/expiryDate additiv und leitet das Fassungsende ab', async () => {
    const written = JSON.parse(await fixture.read(`${fixture.normDir}/versions/2026-05-18.json`)) as { body: unknown };
    await fixture.write(`data/simulation/west/acts/${REPEAL_ACT}.json`, repealAct());
    await fixture.write(`data/simulation/west/amendments/${REPEAL_ACT}/${TARGET}.json`, repealRecipe(sha256({ title: baselineMeta.title, body: written.body })));
    const future = await fixture.run('dry-run');
    expect(future.errors).toEqual([]);
    expect(future.recipes.find((recipe) => recipe.amendmentAct === REPEAL_ACT)).toMatchObject({ status: 'repeal', versionId: null, seedVersionId: '2026-05-18' });
    // Stichtag vor dem Außerkrafttreten: expiryDate wird gesetzt, der Status bleibt in-force.
    expect(future.files.find((file) => file.path === `${fixture.normDir}/meta.json`)!.content).toContain('"expiryDate": "2026-12-31"');
    expect(JSON.parse(future.files.find((file) => file.path === `${fixture.normDir}/meta.json`)!.content).status).toBe('in-force');

    const result = await fixture.run('write', { referenceDate: '2027-06-01' });
    expect(result.errors).toEqual([]);
    expect(result.written.sort()).toEqual([`content/norms/west/${REPEAL_ACT}/history.json`, `content/norms/west/${REPEAL_ACT}/meta.json`, `content/norms/west/${REPEAL_ACT}/versions/2027-01-01.json`, `${fixture.normDir}/history.json`, `${fixture.normDir}/meta.json`, 'data/simulation/west/consolidation-manifest.json'].sort());
    const target = await loadNorm('west', TARGET, fixture.root);
    expect(target.meta).toMatchObject({ status: 'repealed', expiryDate: '2026-12-31', successor: null });
    expect(target.versions.map((version) => [version.versionId, version.simulationValidTo])).toEqual([['2023-12-01', '2026-05-17'], ['2026-05-18', '2026-12-31']]);
    expect(target.history.entries.map((entry) => entry.type)).toEqual(['initial', 'amendment', 'repeal']);
    expect(target.history.entries[2]).toMatchObject({ date: '2027-01-01', affectingVersionId: null, relatedNorm: { slug: REPEAL_ACT } });
    expect(target.meta.relations.map((relation) => relation.type)).toEqual(['amended-by', 'repealed-by']);
    const repealActNorm = await loadNorm('west', REPEAL_ACT, fixture.root);
    expect(repealActNorm.meta.relations).toEqual([{ type: 'repeals', target: { slug: TARGET }, date: '2027-01-01' }]);
    expect(await fixture.read(`${fixture.normDir}/versions/2023-12-01.json`)).toBe(baselineText);
    expect(await fixture.run('check', { referenceDate: '2027-06-01' })).toMatchObject({ ok: true });
    const manifest = JSON.parse(await fixture.read('data/simulation/west/consolidation-manifest.json')) as { counts: Record<string, number> };
    expect(manifest.counts).toMatchObject({ acts: 2, recipes: 2, versions: 1, repeals: 1 });

    // Nach der Aufhebung ist keine weitere Änderung zulässig.
    await fixture.write(`data/simulation/west/amendments/${ACT}/${TARGET}.2027-03-01.json`, { ...amendmentRecipe(sha256(baselineBody[2])), effectiveDate: '2027-03-01', operations: [operation({ op: 'renameLaw', expectedOld: baselineMeta.title, value: 'Neu', effectiveDate: '2027-03-01' })] });
    const afterRepeal = await fixture.run('dry-run', { referenceDate: '2027-06-01' });
    expect(afterRepeal.errors).toEqual([expect.stringMatching(/außer Kraft; weitere Änderungen oder Aufhebungen sind unzulässig/u)]);
    await rm(join(fixture.root, `data/simulation/west/amendments/${ACT}/${TARGET}.2027-03-01.json`));
  });
});

describe('Konsolidierung: Sperren und Wortlautprobe', () => {
  let fixture: Root;
  beforeAll(async () => {
    fixture = await createRoot();
  });
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('sperrt ein Ziel bei abweichendem Baseline-Hash oder fehlendem Slug, statt zu raten', async () => {
    await fixture.write(`data/simulation/west/amendments/${ACT}/${TARGET}.json`, amendmentRecipe('0'.repeat(64)));
    await fixture.write(`data/simulation/west/amendments/${ACT}/testfixture-unbekannt-west.json`, { ...amendmentRecipe(sha256(baselineBody[2])), changeNote: 'x' });
    const result = await fixture.run('write');
    expect(result.errors).toEqual([]);
    expect(result.blockedTargets).toEqual([
      expect.objectContaining({ target: TARGET, amendmentAct: ACT, code: 'hash-mismatch', reason: expect.stringMatching(/Seed 2023-12-01 .*Zielhash weicht ab/u) }),
      expect.objectContaining({ target: 'testfixture-unbekannt-west', code: 'target-missing' }),
    ]);
    expect(result.recipes.map((recipe) => recipe.status)).toEqual(['blocked', 'blocked']);
    expect(await fixture.exists(`${fixture.normDir}/versions/2026-05-18.json`)).toBe(false);
    // Der Akt selbst wurde materialisiert; Ziel-Meta bleibt unberührt.
    expect(await fixture.exists(`content/norms/west/${ACT}/meta.json`)).toBe(true);
    expect(JSON.parse(await fixture.read(`${fixture.normDir}/meta.json`)).relations).toEqual([]);
    const manifest = JSON.parse(await fixture.read('data/simulation/west/consolidation-manifest.json')) as { blockedTargets: Array<{ code: string }>; counts: { blockedTargets: number } };
    expect(manifest.blockedTargets.map((entry) => entry.code)).toEqual(['hash-mismatch', 'target-missing']);
    expect(manifest.counts.blockedTargets).toBe(2);
    expect((await fixture.run('check')).ok).toBe(true);
    await rm(join(fixture.root, `data/simulation/west/amendments/${ACT}/testfixture-unbekannt-west.json`));
    await fixture.write(`data/simulation/west/amendments/${ACT}/${TARGET}.json`, amendmentRecipe(sha256(baselineBody[2])));
    const unblocked = await fixture.run('write');
    expect(unblocked.blockedTargets).toEqual([]);
    expect(unblocked.recipes[0]).toMatchObject({ status: 'new', versionId: '2026-05-18' });
  });

  it('eine abweichende Transkription scheitert an der Wortlautprobe; nur ein dokumentierter Override lässt sie zu', async () => {
    const act = amendmentAct();
    (act.version as { body: unknown[] }).body = [...actBody, { type: 'article', label: 'Artikel 3', children: [{ type: 'paragraphText', text: 'Dieser Artikel steht nicht in der Quelle.' }] }];
    await fixture.write(`data/simulation/west/acts/${ACT}.json`, act);
    const failed = await fixture.run('write');
    expect(failed.ok).toBe(false);
    expect(failed.errors).toEqual(expect.arrayContaining([expect.stringMatching(/Wortlautprobe gescheitert – 1 von 7 Textstellen .*Dieser Artikel steht nicht in der Quelle/u)]));
    expect(failed.written).toEqual([]);

    // Bereits materialisierter Akt: eine geänderte Fassung darf nie überschrieben werden.
    const overridden = { ...act, provenance: { ...(act.provenance as Record<string, unknown>), textCheckOverride: { reason: 'Artikel 3 laut Berichtigung nachgetragen (Sichtprüfung).' } } };
    await fixture.write(`data/simulation/west/acts/${ACT}.json`, overridden);
    const conflict = await fixture.run('write');
    expect(conflict.errors).toEqual([expect.stringMatching(/versions\/2026-05-18\.json existiert und weicht vom Akt ab/u)]);

    await rm(join(fixture.root, 'content', 'norms', 'west', ACT), { recursive: true, force: true });
    const result = await fixture.run('write');
    expect(result.errors).toEqual([]);
    expect(result.acts[0]).toMatchObject({ status: 'new', textCheckOverride: expect.stringContaining('Sichtprüfung') });
    const manifest = JSON.parse(await fixture.read('data/simulation/west/consolidation-manifest.json')) as { acts: Array<Record<string, unknown>> };
    expect(manifest.acts[0]).toMatchObject({ textCheckOverride: expect.stringContaining('Sichtprüfung'), textCheck: expect.objectContaining({ missing: 1 }) });
    expect(renderConsolidationLines(result).join('\n')).toContain('Override: Artikel 3');

    // Ohne Textauszug im Cache kein Schreiblauf (fail closed), außer mit Override.
    await fixture.write(`data/simulation/west/acts/${ACT}.json`, { ...act, provenance: { transcribedFrom: '3'.repeat(64), method: 'txt', checked: 'x' } });
    await rm(join(fixture.root, 'content', 'norms', 'west', ACT), { recursive: true, force: true });
    const missing = await fixture.run('write');
    expect(missing.errors).toEqual(expect.arrayContaining([expect.stringMatching(/Wortlautprobe nicht möglich – Textauszug .* fehlt/u)]));
    expect(missing.written).toEqual([]);
  });
});

describe('Konsolidierung: Rezeptketten und fortgeschriebene Akte', () => {
  const ACT2 = 'zweites-gesetz-zur-aenderung-des-schulgesetzes-west';
  const ACT3 = 'gesetz-zur-aenderung-des-aenderungsgesetzes-west';
  const SHA2 = 'b'.repeat(64);
  const SHA3 = 'c'.repeat(64);
  let fixture: Root;

  beforeAll(async () => {
    fixture = await createRoot();
    // Zweites Rezept an derselben Zielnorm, Seed ist die erste Sim-Fassung (§ 5 stammt aus dem ersten Rezept).
    await fixture.write(`.cache/simulation/text/${SHA2}.txt`, 'Zweites Gesetz zur Änderung des Schulgesetzes\nArtikel 1\nIn § 5 Absatz 1 werden die Wörter „vor.“ durch „vor; Näheres regelt die Schulkonferenz.“ ersetzt.\nArtikel 2\nDieses Gesetz tritt am 1. Juli 2026 in Kraft.\n');
    await fixture.write(`data/simulation/west/acts/${ACT2}.json`, {
      schemaVersion: ACT_SCHEMA_VERSION, slug: ACT2, jurisdiction: 'west',
      meta: { title: 'Zweites Gesetz zur Änderung des Schulgesetzes', type: 'aenderungsvorschrift', status: 'one-time-act', subjects: ['Bildungswesen'], keywords: [], initialCitation: 'Gesetz vom 25. Juni 2026 (GV. West 2026 Nr. 3 S. 1)', effectiveDate: '2026-07-01', relations: [{ type: 'amends', target: { slug: TARGET }, date: '2026-07-01' }] },
      version: { versionId: '2026-07-01', simulationValidFrom: '2026-07-01', citation: 'Gesetz vom 25. Juni 2026 (GV. West 2026 Nr. 3 S. 1)', changeNote: 'Amtlich veröffentlicht.', body: [
        { type: 'article', label: 'Artikel 1', children: [{ type: 'paragraphText', text: 'In § 5 Absatz 1 werden die Wörter „vor.“ durch „vor; Näheres regelt die Schulkonferenz.“ ersetzt.' }] },
        { type: 'article', label: 'Artikel 2', children: [{ type: 'paragraphText', text: 'Dieses Gesetz tritt am 1. Juli 2026 in Kraft.' }] },
      ], sourceReferences: [simReference('simulation-gazette', SHA2, { publicationSlug: 'gv-west-2026-3-20260625' })] },
      publication: { slug: 'gv-west-2026-3-20260625', pages: '1' },
      provenance: { transcribedFrom: SHA2, method: 'txt', checked: 'geprüft' },
    });
    await fixture.write(`data/simulation/west/amendments/${ACT2}/${TARGET}.json`, {
      schemaVersion: RECIPE_SCHEMA_VERSION, amendmentAct: ACT2, effectiveDate: '2026-07-01', amendmentCitation: 'Gesetz vom 25. Juni 2026 (GV. West 2026 Nr. 3 S. 1)', resultCitation: 'Schulgesetz, zuletzt geändert durch Gesetz vom 25. Juni 2026 (GV. West 2026 Nr. 3 S. 1)', changeNote: '§ 5 Absatz 1 ergänzt.',
      sourceReferences: [simReference('simulation-amendment-source', SHA2, { publicationSlug: 'gv-west-2026-3-20260625' })],
      operations: [{ op: 'replaceText', target: { type: 'subparagraph', label: '(1)', parentType: 'paragraph', parentLabel: '§ 5' }, field: 'text', expectedOld: 'Öffentliche Schulen halten ein Ganztagsangebot vor.', value: 'Öffentliche Schulen halten ein Ganztagsangebot vor; Näheres regelt die Schulkonferenz.', expectedMatches: 1, source: `west/simulation/${SHA2}.pdf`, sourceProvision: 'Artikel 1', effectiveDate: '2026-07-01' }],
    });
    // Dritter Akt ändert den ersten Änderungsakt selbst (ein materialisierter Sim-Akt wird fortgeschrieben).
    await fixture.write(`.cache/simulation/text/${SHA3}.txt`, 'Gesetz zur Änderung des Änderungsgesetzes\nArtikel 1\nArtikel 2 des Gesetzes zur Änderung des Schulgesetzes erhält folgende Fassung: „Dieses Gesetz tritt am 18. Mai 2026 in Kraft; Artikel 1 Nummer 2 gilt ab dem 1. August 2026.“\nArtikel 2\nDieses Gesetz tritt am 1. August 2026 in Kraft.\n');
    await fixture.write(`data/simulation/west/acts/${ACT3}.json`, {
      schemaVersion: ACT_SCHEMA_VERSION, slug: ACT3, jurisdiction: 'west',
      meta: { title: 'Gesetz zur Änderung des Änderungsgesetzes', type: 'aenderungsvorschrift', status: 'one-time-act', subjects: ['Bildungswesen'], keywords: [], initialCitation: 'Gesetz vom 20. Juli 2026 (GV. West 2026 Nr. 4 S. 1)', effectiveDate: '2026-08-01', relations: [{ type: 'amends', target: { slug: ACT }, date: '2026-08-01' }] },
      version: { versionId: '2026-08-01', simulationValidFrom: '2026-08-01', citation: 'Gesetz vom 20. Juli 2026 (GV. West 2026 Nr. 4 S. 1)', changeNote: 'Amtlich veröffentlicht.', body: [
        { type: 'article', label: 'Artikel 1', children: [{ type: 'paragraphText', text: 'Artikel 2 des Gesetzes zur Änderung des Schulgesetzes erhält folgende Fassung: „Dieses Gesetz tritt am 18. Mai 2026 in Kraft; Artikel 1 Nummer 2 gilt ab dem 1. August 2026.“' }] },
        { type: 'article', label: 'Artikel 2', children: [{ type: 'paragraphText', text: 'Dieses Gesetz tritt am 1. August 2026 in Kraft.' }] },
      ], sourceReferences: [simReference('simulation-gazette', SHA3, { publicationSlug: 'gv-west-2026-4-20260720' })] },
      publication: { slug: 'gv-west-2026-4-20260720', pages: '1' },
      provenance: { transcribedFrom: SHA3, method: 'txt', checked: 'geprüft' },
    });
    await fixture.write(`data/simulation/west/amendments/${ACT3}/${ACT}.json`, {
      schemaVersion: RECIPE_SCHEMA_VERSION, amendmentAct: ACT3, effectiveDate: '2026-08-01', amendmentCitation: 'Gesetz vom 20. Juli 2026 (GV. West 2026 Nr. 4 S. 1)', resultCitation: 'Gesetz zur Änderung des Schulgesetzes, geändert durch Gesetz vom 20. Juli 2026 (GV. West 2026 Nr. 4 S. 1)', changeNote: 'Artikel 2 neu gefasst.',
      sourceReferences: [simReference('simulation-amendment-source', SHA3, { publicationSlug: 'gv-west-2026-4-20260720' })],
      operations: [{ op: 'replaceText', target: { type: 'paragraphText', text: 'Dieses Gesetz tritt am 18. Mai 2026 in Kraft.', parentType: 'article', parentLabel: 'Artikel 2' }, field: 'text', expectedOld: 'Dieses Gesetz tritt am 18. Mai 2026 in Kraft.', value: 'Dieses Gesetz tritt am 18. Mai 2026 in Kraft; Artikel 1 Nummer 2 gilt ab dem 1. August 2026.', expectedMatches: 1, source: `west/simulation/${SHA3}.pdf`, sourceProvision: 'Artikel 1', effectiveDate: '2026-08-01' }],
    });
  });
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('kettet Rezepte je Zielnorm in Wirkdatumsfolge, schreibt einen fortgeschriebenen Akt nicht neu und bleibt reproduzierbar', async () => {
    const written = await fixture.run('write');
    expect(written.errors).toEqual([]);
    expect(written.recipes.map((recipe) => [recipe.target, recipe.versionId, recipe.seedVersionId])).toEqual(expect.arrayContaining([
      [TARGET, '2026-05-18', '2023-12-01'], [TARGET, '2026-07-01', '2026-05-18'], [ACT, '2026-08-01', '2026-05-18'],
    ]));
    const chained = JSON.parse(await fixture.read(`${fixture.normDir}/versions/2026-07-01.json`)) as { body: Array<{ label?: string; children?: Array<{ text?: string }> }> };
    expect(chained.body.find((block) => block.label === '§ 5')?.children?.[0]?.text).toContain('Näheres regelt die Schulkonferenz');
    expect(await fixture.exists(`content/norms/west/${ACT}/versions/2026-08-01.json`)).toBe(true);
    // Zweiter Lauf und Rückwärtsprüfung: nichts neu, nichts anders – auch für den fortgeschriebenen Akt.
    const again = await fixture.run('write');
    expect(again.errors).toEqual([]);
    expect(again.written).toEqual([]);
    expect(again.acts.map((act) => act.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(await fixture.run('check')).toMatchObject({ ok: true, checkProblems: [], errors: [] });
    expect(await fixture.run('dry-run')).toMatchObject({ errors: [], written: [] });
  });
});

describe('Konsolidierung: Geltungsstatus relativ zum Stichtag', () => {
  let fixture: Root;

  beforeAll(async () => {
    fixture = await createRoot();
    // Ein Stammgesetz (in-force) statt des Änderungsgesetzes (one-time-act): nur Dauerrecht kennt future-effective.
    const act = amendmentAct();
    await fixture.write(`data/simulation/west/acts/${ACT}.json`, { ...act, meta: { ...(act.meta as Record<string, unknown>), type: 'gesetz', status: 'in-force' } });
  });
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it('materialisiert einen Akt mit künftigem Inkrafttreten als future-effective und schaltet ihn mit dem Stichtag additiv auf in-force', async () => {
    const early = await fixture.run('write', { referenceDate: '2026-01-01' });
    expect(early.errors).toEqual([]);
    expect(early.acts.map((act) => act.status)).toEqual(['new']);
    const before = await loadNorm('west', ACT, fixture.root);
    expect(before.meta.status).toBe('future-effective');
    expect(await fixture.run('check', { referenceDate: '2026-01-01' })).toMatchObject({ ok: true });
    // Ein späterer Stichtag ändert nur den Status; Fassung, Historie und Manifestinhalt bleiben.
    const later = await fixture.run('dry-run', { referenceDate: '2026-09-01' });
    expect(later.acts.map((act) => act.status)).toEqual(['updated']);
    expect(later.files.filter((file) => file.status !== 'unchanged').map((file) => file.path)).toEqual([`content/norms/west/${ACT}/meta.json`]);
    const written = await fixture.run('write', { referenceDate: '2026-09-01' });
    expect(written.written).toEqual([`content/norms/west/${ACT}/meta.json`, 'data/simulation/west/consolidation-manifest.json']);
    const after = await loadNorm('west', ACT, fixture.root);
    expect(after.meta.status).toBe('in-force');
    expect(after.versions.map((version) => version.versionId)).toEqual(before.versions.map((version) => version.versionId));
    expect(await fixture.run('check', { referenceDate: '2026-09-01' })).toMatchObject({ ok: true });
    expect((await fixture.run('dry-run', { referenceDate: '2026-09-01' })).acts.map((act) => act.status)).toEqual(['unchanged']);
  });
});

describe('Konsolidierung: Bindung an den akzeptierten Baseline-Seed (Lock-Schema 2)', () => {
  let fixture: Root;
  beforeAll(async () => {
    fixture = await createRoot();
  });
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  const lockFile = (seeds: unknown[]) => ({ schemaVersion: 'landesrecht-simulation-baseline-locks/2', jurisdictions: { west: { commit: 'ff1b1f43e209', freeze: true } }, seeds });

  it('sperrt Rezepte auf eine Baseline ohne Seed oder mit abweichendem Seed-Hash und wendet sie mit passendem Seed an', async () => {
    const baselineText = await fixture.read(`${fixture.normDir}/versions/2023-12-01.json`);
    const actual = createHash('sha256').update(baselineText, 'utf8').digest('hex');
    await fixture.write('data/simulation/baseline-locks.json', lockFile([]));
    const missing = await fixture.run('dry-run');
    expect(missing.blockedTargets).toEqual([expect.objectContaining({ target: TARGET, code: 'seed-unaccepted', reason: expect.stringMatching(/kein akzeptierter Baseline-Seed/u) })]);
    await fixture.write('data/simulation/baseline-locks.json', lockFile([{ jurisdiction: 'west', slug: TARGET, baselineVersionId: '2023-12-01', sha256: '0'.repeat(64), acceptedAt: '2026-09-29', decision: 'Test' }]));
    const mismatch = await fixture.run('dry-run');
    expect(mismatch.blockedTargets).toEqual([expect.objectContaining({ code: 'seed-unaccepted', reason: expect.stringMatching(new RegExp(`SHA-256 ${actual}`, 'u')) })]);
    await fixture.write('data/simulation/baseline-locks.json', lockFile([{ jurisdiction: 'west', slug: TARGET, baselineVersionId: '2023-12-01', sha256: actual, acceptedAt: '2026-09-29', decision: 'Test' }]));
    const accepted = await fixture.run('write');
    expect(accepted.blockedTargets).toEqual([]);
    expect(accepted.recipes[0]).toMatchObject({ status: 'new', versionId: '2026-05-18' });
    expect((await fixture.run('check')).ok).toBe(true);
  });

  it('ergänzt redaktionelle Auflösungen eines materialisierten Akts additiv und lehnt geänderte ids ab', async () => {
    const actPath = `data/simulation/west/acts/${ACT}.json`;
    const act = JSON.parse(await fixture.read(actPath)) as { meta: Record<string, unknown> };
    const resolution = { id: 'relation-note', kind: 'superseded-technical-note', date: '2026-09-29', relation: { type: 'amends', target: TARGET }, supersededNote: 'alt', statement: 'neu' };
    act.meta.editorialResolutions = [resolution];
    await fixture.write(actPath, act);
    const added = await fixture.run('write');
    expect(added.errors).toEqual([]);
    expect(added.acts.find((entry) => entry.slug === ACT)?.status).toBe('updated');
    expect(JSON.parse(await fixture.read(`content/norms/west/${ACT}/meta.json`)).editorialResolutions).toEqual([resolution]);
    expect((await fixture.run('check')).ok).toBe(true);
    act.meta.editorialResolutions = [{ ...resolution, statement: 'anders' }];
    await fixture.write(actPath, act);
    expect((await fixture.run('dry-run')).errors).toEqual([expect.stringMatching(/editorialResolutions relation-note weicht vom gespeicherten Eintrag ab/u)]);
  });
});
