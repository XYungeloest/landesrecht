#!/usr/bin/env node
/**
 * Audit 9: Rekonstruktion der VV LHundG (term:23528) offline erneut erzeugen und mit dem Bestand vergleichen.
 *
 *   node scripts/audit-reconstruction.ts [--output-root <dir>] [--slug vv-lhundg-west] [--url <portal-url>]
 *
 * Läuft ausschließlich aus dem Abrufcache (`.cache/recht-nrw`, Offline-Fetcher) in ein temporäres
 * Ausgaberoot (Standard: mkdtemp) und schreibt nie in den Bestand. Verglichen werden Basis-, Schritt- und
 * Ergebnis-Fingerabdrücke (Rezept, Manifest, Lauf), der Fingerabdruck des endgültigen Normkörpers
 * (Bestand vs. Lauf) und die Determinismus-Wiederholung (zwei Läufe). Report:
 * data/audits/recht-nrw/quality/reconstruction-vv-lhundg.{json,md}.
 */
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadImportEnvironment } from '@landesrecht/importer-recht-nrw/common/environment.ts';
import { createRechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { readManifest, type ManifestEntry } from '@landesrecht/importer-recht-nrw/common/manifest.ts';
import { importRechtNrwLrmbDocument, type LrmbImportResult } from '@landesrecht/importer-recht-nrw/lrmb/pipeline.ts';
import { bodyFingerprint, readReconstructionRecipe } from '@landesrecht/importer-recht-nrw/lrmb/reconstruction.ts';
import { loadNorm } from '@landesrecht/legal-core/lib/loader.ts';
import { parseNormVersion } from '@landesrecht/legal-core/lib/schema.ts';

import { mdTable, parseCliArgs, repositoryRoot, writeAuditReport } from './lib/audit-common.ts';

const { values } = parseCliArgs(process.argv.slice(2));
const root = repositoryRoot();
const slug = values.get('slug') ?? 'vv-lhundg-west';
const url = values.get('url') ?? 'https://recht.nrw.de/lrmb/verwaltungsvorschrift/verwaltungsvorschriften-zum-landeshundegesetz-vv-lhundg-nrw';
const baselineDate = '2023-12-01';

const stored = await loadNorm('west', slug, root);
const storedVersion = stored.versions.find((version) => version.versionId === baselineDate) ?? stored.versions[0]!;
const termId = stored.meta.externalIdentifiers.find((entry) => entry.system === 'recht-nrw')?.value ?? '';
const storedManifest = (await readManifest(root)).entries.find((entry) => entry.sourceIdentity === termId);
if (!storedManifest) throw new Error(`Kein Manifesteintrag für ${termId}`);
const recipe = await readReconstructionRecipe(root, termId);
if (!recipe) throw new Error(`Kein Rezept für ${termId}`);

interface RunOutcome {
  outputRoot: string;
  status: string;
  stage: string;
  findings: string[];
  baseFingerprint?: string;
  resultFingerprint?: string;
  steps: Array<{ id: string; before: string; after: string }>;
  finalBodyFingerprint?: string;
  writtenFiles: string[];
  networkRequests: number;
  cacheHits: number;
  sourceHashes: string[];
}

/** Steuerdateien (nie Inhalte, Manifest oder Review-Queue) in ein separates Ausgaberoot kopieren – wie `seedOutputRoot` des Bulk-Laufs. */
async function seedOutputRoot(repoRoot: string, outputRoot: string): Promise<void> {
  await mkdir(join(outputRoot, 'content', 'norms', 'west'), { recursive: true });
  const importData = join('data', 'imports', 'recht-nrw');
  for (const relative of [join(importData, 'enumeration-lrgv.json'), join(importData, 'enumeration-lrmb.json'), join(importData, 'overrides.json'), join(importData, 'institution-mapping.json'), join(importData, 'slug-registry.json'), join(importData, 'reconstructions'), join(importData, 'transcriptions'), join('data', 'd1')]) {
    const source = join(repoRoot, relative);
    if (!(await stat(source).then(() => true, () => false))) continue;
    await cp(source, join(outputRoot, relative), { recursive: true });
  }
}

async function runOnce(label: string): Promise<RunOutcome> {
  const outputRoot = values.get('output-root') ? join(values.get('output-root')!, label) : await mkdtemp(join(tmpdir(), `landesrecht-reconstruction-${label}-`));
  await seedOutputRoot(root, outputRoot);
  const fetcher = createRechtNrwFetcher({ cacheDir: join(root, '.cache', 'recht-nrw'), offline: true });
  const environment = await loadImportEnvironment(outputRoot, { mode: 'sample' });
  let result: LrmbImportResult;
  try {
    result = await importRechtNrwLrmbDocument({ url, root: outputRoot, fetcher, write: true, baselineDate, environment, log: () => undefined });
  } catch (error) {
    return { outputRoot, status: 'exception', stage: 'exception', findings: [(error as Error).message], steps: [], writtenFiles: [], networkRequests: fetcher.stats.networkRequests, cacheHits: fetcher.stats.cacheHits, sourceHashes: [] };
  }
  const outcome: RunOutcome = {
    outputRoot,
    status: result.status,
    stage: result.stage,
    findings: result.findings.map((finding) => `[${finding.severity}] ${finding.code}: ${finding.message}`),
    steps: (result.manifestEntry?.reconstructionSteps ?? result.reconstruction?.steps ?? []).map((step) => ({ id: step.id, before: step.beforeFingerprint, after: step.afterFingerprint })),
    writtenFiles: [...result.writtenFiles].sort(),
    networkRequests: fetcher.stats.networkRequests,
    cacheHits: fetcher.stats.cacheHits,
    sourceHashes: (result.manifestEntry?.rawDocuments ?? []).map((raw) => `${raw.role}:${raw.sha256}`).sort(),
  };
  if (result.reconstruction) {
    outcome.baseFingerprint = result.reconstruction.baseFingerprint;
    outcome.resultFingerprint = result.reconstruction.resultFingerprint;
  }
  try {
    const written = parseNormVersion(JSON.parse(await readFile(join(outputRoot, 'content', 'norms', 'west', slug, 'versions', `${baselineDate}.json`), 'utf8')));
    outcome.finalBodyFingerprint = bodyFingerprint(written.body);
  } catch {
    // nichts geschrieben
  }
  return outcome;
}

const first = await runOnce('lauf-1');
const second = await runOnce('lauf-2');

const stepsOf = (entry: ManifestEntry): Array<{ id: string; before: string; after: string }> => entry.reconstructionSteps.map((step) => ({ id: step.id, before: step.beforeFingerprint, after: step.afterFingerprint }));
const storedSteps = stepsOf(storedManifest);
const storedFinal = bodyFingerprint(storedVersion.body);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const checks = [
  { name: 'Lauf 1 erfolgreich (Status imported*)', ok: first.status.startsWith('imported'), detail: `${first.status} (${first.stage})` },
  { name: 'Keine Netzabrufe (nur Cache)', ok: first.networkRequests === 0 && second.networkRequests === 0, detail: `Netz ${first.networkRequests}/${second.networkRequests}, Cache ${first.cacheHits}/${second.cacheHits}` },
  { name: 'Basis-Fingerabdruck = Rezept', ok: first.baseFingerprint === recipe.expected.baseFingerprint, detail: `${first.baseFingerprint ?? '–'} vs. ${recipe.expected.baseFingerprint}` },
  { name: 'Ergebnis-Fingerabdruck = Rezept', ok: first.resultFingerprint === recipe.expected.resultFingerprint, detail: `${first.resultFingerprint ?? '–'} vs. ${recipe.expected.resultFingerprint}` },
  { name: 'Basis-Fingerabdruck = Manifest (erster Schritt vorher)', ok: first.baseFingerprint === storedSteps[0]?.before, detail: storedSteps[0]?.before ?? '–' },
  { name: 'Ergebnis-Fingerabdruck = Manifest (letzter Schritt nachher)', ok: first.resultFingerprint === storedSteps.at(-1)?.after, detail: storedSteps.at(-1)?.after ?? '–' },
  { name: 'Schrittkette (Id, vorher, nachher) = Manifest', ok: same(first.steps, storedSteps), detail: `${first.steps.length} Schritte im Lauf, ${storedSteps.length} im Manifest` },
  { name: 'Anzahl Änderungsbefehle = Rezept', ok: first.steps.length === recipe.amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0), detail: `${first.steps.length}` },
  { name: 'Endgültiger Normkörper (nach Transformation) = Bestand', ok: first.finalBodyFingerprint === storedFinal, detail: `${first.finalBodyFingerprint ?? '–'} vs. ${storedFinal}` },
  { name: 'Rohquellen-Hashes = Manifest des Bestands', ok: same(first.sourceHashes, storedManifest.rawDocuments.map((raw) => `${raw.role}:${raw.sha256}`).sort()), detail: first.sourceHashes.join(', ') },
  { name: 'Determinismus: Lauf 2 identisch (Basis, Schritte, Ergebnis, Normkörper)', ok: first.baseFingerprint === second.baseFingerprint && same(first.steps, second.steps) && first.resultFingerprint === second.resultFingerprint && first.finalBodyFingerprint === second.finalBodyFingerprint, detail: second.status },
  { name: 'Bestand nicht berührt (Ausgaberoot ≠ Repository)', ok: first.outputRoot !== root && second.outputRoot !== root, detail: first.outputRoot },
  { name: 'Quellenlage der Fassung im Bestand: reconstructed/reconstructed', ok: storedVersion.sourceStatus?.validity === 'reconstructed' && storedVersion.sourceStatus?.text === 'reconstructed', detail: JSON.stringify(storedVersion.sourceStatus ?? null) },
];

const result = {
  slug,
  sourceIdentity: termId,
  url,
  baselineDate,
  recipe: { amendments: recipe.amendments.map((amendment) => ({ citation: amendment.citation, decreeDate: amendment.decreeDate, steps: amendment.steps.map((step) => step.id) })), expected: recipe.expected, review: recipe.review },
  stored: { steps: storedSteps, finalBodyFingerprint: storedFinal, reconstructionStatus: storedManifest.reconstructionStatus, sourceStatus: storedVersion.sourceStatus ?? null },
  runs: [first, second].map((run) => ({ ...run, outputRoot: values.get('output-root') ? run.outputRoot : '<mkdtemp>' })),
  checks,
  allChecksPassed: checks.every((check) => check.ok),
};

const markdown = `# Rekonstruktions-Audit VV LHundG (${slug}, ${termId})

Erzeugt mit \`npm run audit:reconstruction\`: die Stichtagsfassung wird zweimal offline (nur \`.cache/recht-nrw\`,
Offline-Fetcher) in je ein temporäres Ausgaberoot erzeugt (\`importRechtNrwLrmbDocument\`, Schreiblauf außerhalb des
Repositories) und mit Rezept \`data/imports/recht-nrw/reconstructions/${termId.replace(/^term:/u, 'term-')}.json\`, Manifest und Bestand verglichen.

## Prüfungen

${mdTable(['Prüfung', 'Ergebnis', 'Detail'], checks.map((check) => [check.name, check.ok ? 'bestanden' : 'FEHLGESCHLAGEN', check.detail]))}

**Gesamt: ${result.allChecksPassed ? 'alle Prüfungen bestanden' : 'Abweichungen vorhanden'}.**

## Fingerabdrücke

| Größe | Rezept | Manifest (Bestand) | Lauf 1 | Lauf 2 |
| --- | --- | --- | --- | --- |
| Basis | ${recipe.expected.baseFingerprint} | ${storedSteps[0]?.before ?? '–'} | ${first.baseFingerprint ?? '–'} | ${second.baseFingerprint ?? '–'} |
| Ergebnis (vor Transformation) | ${recipe.expected.resultFingerprint} | ${storedSteps.at(-1)?.after ?? '–'} | ${first.resultFingerprint ?? '–'} | ${second.resultFingerprint ?? '–'} |
| Normkörper (nach Transformation) | – | ${storedFinal} | ${first.finalBodyFingerprint ?? '–'} | ${second.finalBodyFingerprint ?? '–'} |

## Schritte (Lauf 1)

${mdTable(['Schritt', 'vorher', 'nachher', 'wie Manifest'], first.steps.map((step, index) => [step.id, step.before, step.after, same(step, storedSteps[index]) ? 'ja' : 'nein']))}

## Lauf 1

Status ${first.status} (${first.stage}); Abrufe: ${first.networkRequests} Netz, ${first.cacheHits} Cache; geschriebene Dateien (relativ zum Ausgaberoot): ${first.writtenFiles.length}.

${first.findings.map((finding) => `- ${finding}`).join('\n') || '- keine Befunde'}
`;

const paths = await writeAuditReport({ name: 'reconstruction-vv-lhundg', json: result, markdown }, root);
if (!values.get('output-root')) for (const run of [first, second]) await rm(run.outputRoot, { recursive: true, force: true });
console.log(`Rekonstruktions-Audit: ${checks.filter((check) => check.ok).length}/${checks.length} Prüfungen bestanden → ${paths.markdown}`);
if (!result.allChecksPassed) process.exitCode = 1;
