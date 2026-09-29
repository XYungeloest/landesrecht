#!/usr/bin/env node
/**
 * Release-Prüfung: orchestriert ausschließlich bestehende Prüfungen (keine eigenen Validatoren) und bewertet den Stand.
 *
 *   npm run release:check [-- --offline] [--full] [--write] [--base-url https://landesrecht-online.de]
 *
 * Standard: lokale Prüfungen (check, test, content:check mit Freeze-Gate G2, Freeze-Fingerabdrücke NSH/BayWü,
 * d1:schema:check, Sim-Vollständigkeit, build, Suchaudits aller drei D1-Länder, Provenienz und Rekonstruktion) und
 * Produktionsprüfungen (Ost-Contract/Drift/Freshness gegen die Remote-D1, Smoke, Website-Stichprobe). `--offline` lässt
 * die Produktionsprüfungen aus, `--full` ergänzt D1-Remote-Abgleich aller drei Länder, R2-Audit und Performance.
 *
 * Status: `NOT READY` bei jedem fehlgeschlagenen blockierenden Schritt (Exit 1); sonst `READY WITH KNOWN LIMITATIONS`,
 * solange bekannte, nicht blockierende Einschränkungen bestehen (bewusst fehlende Sim-Quellen, offene Queue, Ost-Volltext
 * nur für die geltende Fassung, akzeptierte Befunde aus data/audits/release-accepted-findings.json), sonst `READY`.
 * Fehlende Sim-Quellen machen nie `NOT READY`. `--write` schreibt docs/RELEASE_READINESS.md und
 * data/audits/release-readiness.json; Protokolle je Schritt liegen unter .cache/release-check/ (gitignored).
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { parseInventoryStatusFile, summarizeJurisdictionStatus } from '@landesrecht/legal-core/config/inventory-status.ts';
import { getJurisdiction, JURISDICTION_IDS, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';

const root = resolveRepositoryRoot();
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const full = args.includes('--full');
const write = args.includes('--write');
const baseIndex = args.indexOf('--base-url');
const baseUrl = (baseIndex >= 0 ? args[baseIndex + 1] : undefined) ?? 'https://landesrecht-online.de';
const LOG_DIR = join(root, '.cache', 'release-check');
const REPORT_JSON = 'data/audits/release-readiness.json';
const REPORT_MD = 'docs/RELEASE_READINESS.md';
const ACCEPTED_PATH = 'data/audits/release-accepted-findings.json';

type Area = 'Build' | 'Tests' | 'Inhalt' | 'Freeze' | 'D1' | 'Suche' | 'Qualität' | 'Ost' | 'API/Routen' | 'R2' | 'Performance' | 'Sim-Quellen';

interface Step {
  id: string;
  area: Area;
  title: string;
  command: string[];
  /** Blockierend: Fehlschlag = NOT READY. Beratend: Fehlschlag wird gemeldet, blockiert aber nicht. */
  blocking: boolean;
  remote?: boolean;
  fullOnly?: boolean;
  /** Zusätzliche Bewertung der Ausgabe (Rückgabe: Fehlertext oder null); Standard nur der Exit-Code. */
  judge?: (output: string) => string | null;
  /** Zeilen der Ausgabe, die als Zusammenfassung in den Bericht gehen. */
  summary: RegExp;
}

const npm = (...script: string[]): string[] => ['npm', 'run', '-s', ...script];
const requireLine = (pattern: RegExp, message: string) => (output: string): string | null => (pattern.test(output) ? null : message);

const STEPS: Step[] = [
  { id: 'check', area: 'Build', title: 'Typprüfung (tsc + astro check)', command: npm('check'), blocking: true, summary: /^- \d+ (errors|warnings)/u },
  { id: 'test', area: 'Tests', title: 'Vitest (alle Tests)', command: npm('test'), blocking: true, summary: /^\s*(Test Files|Tests)\s/u },
  { id: 'content', area: 'Inhalt', title: 'content:check (Validierung, Unveränderlichkeit, Tabellen, Sim-Gates inkl. Freeze-Gate G2)', command: npm('content:check'), blocking: true, summary: /^(G2: \w+: \d+ Baseline|Simulationsgates|Unveränderlichkeit|Tabellen-Regressionsgate)/u },
  { id: 'freeze-nsh', area: 'Freeze', title: 'NSH-Freeze (Commit, Fingerabdruck)', command: ['node', 'scripts/nsh-freeze-readiness.ts'], blocking: true, judge: requireLine(/Gate freeze-fingerprint: ok/u, 'NSH-Fingerabdruck weicht ab'), summary: /^(NSH-Baseline-Status|\s+Gate freeze-fingerprint)/u },
  { id: 'freeze-baywue', area: 'Freeze', title: 'BayWü-Freeze (Commit, Fingerabdruck)', command: ['node', 'scripts/baywue-freeze-readiness.ts'], blocking: true, judge: requireLine(/Gate freeze-fingerprint: ok/u, 'BayWü-Fingerabdruck weicht ab'), summary: /^(BayWü-Baseline-Status|\s+Gate freeze-fingerprint)/u },
  { id: 'd1-schema', area: 'D1', title: 'D1-Schema, Projektion, FTS5-Integrität', command: npm('d1:schema:check'), blocking: true, summary: /^D1-Schema/u },
  { id: 'sim-completeness', area: 'Sim-Quellen', title: 'Sim-Vollständigkeit (Status fail-closed berechnet)', command: npm('import:simulation:completeness'), blocking: true, summary: /^(west|nsh|baywue): Sim-Quellen/u },
  { id: 'intake', area: 'Sim-Quellen', title: 'Source-Inbox (Dry-run)', command: npm('sources:intake'), blocking: false, summary: /^(Inbox|Queue):/u },
  { id: 'build', area: 'Build', title: 'Astro-Build (Worker)', command: npm('build'), blocking: true, judge: requireLine(/Complete!/u, 'Build ohne Abschluss'), summary: /Complete!/u },
  { id: 'search-west', area: 'Suche', title: 'West: Golden Set (Recall, Top-1, Verletzungen)', command: npm('import:recht-nrw:search-audit', '--', '--golden'), blocking: true, summary: /^Golden Set/u },
  { id: 'search-nsh', area: 'Suche', title: 'NSH: Suchintegrität (Stichprobe) und Golden Set', command: npm('import:juris-sh:search-audit'), blocking: true, summary: /^(Suchintegrität|\s+(or-prefix|and-first):|West \+ BayWü \+ NSH)/u },
  { id: 'search-baywue', area: 'Suche', title: 'BayWü: Suchintegrität (Stichprobe) und Golden Set', command: npm('import:bayernrecht:search-audit'), blocking: true, summary: /^(Suchintegrität|\s+(or-prefix|and-first):|West \+ BayWü)/u },
  { id: 'provenance', area: 'Qualität', title: 'Provenienz West (--strict)', command: npm('audit:provenance', '--', '--strict'), blocking: true, summary: /^Provenienz-Audit/u },
  { id: 'reconstruction', area: 'Qualität', title: 'Rekonstruktion VV LHundG (Determinismus)', command: npm('audit:reconstruction'), blocking: true, summary: /^Rekonstruktions-Audit/u },
  { id: 'ost-drift', area: 'Ost', title: `Ost: Contract, Drift, Freshness (Stichtag ${EDITORIAL_REFERENCE_DATE})`, command: npm('audit:ost-drift', '--', '--as-of', EDITORIAL_REFERENCE_DATE), blocking: true, remote: true, summary: /^(Contract|Freshness|Ergebnis)/u },
  { id: 'smoke', area: 'API/Routen', title: `Produktions-Smoke (${baseUrl})`, command: npm('smoke', '--', '--base', baseUrl), blocking: true, remote: true, summary: /^Alle \d+ Prüfungen|^\d+ von \d+|FEHL/u },
  { id: 'site', area: 'API/Routen', title: 'Website-Stichprobe und Barrierefreiheit (Produktion)', command: npm('audit:site', '--', '--base-url', baseUrl), blocking: true, remote: true, judge: (output) => (/(\d+) Seiten, 0 mit Befunden/u.test(output) ? null : 'Website-Stichprobe mit Befunden'), summary: /^Website-Stichprobe/u },
  ...(['landesrecht-west', 'landesrecht-nsh', 'landesrecht-baywue'] as const).map((database): Step => ({ id: `d1-remote-${database.replace('landesrecht-', '')}`, area: 'D1', title: `D1 lokal ↔ remote (${database})`, command: npm('audit:d1-remote', '--', '--database', database), blocking: false, remote: true, fullOnly: true, summary: /^Lokal ↔ Remote/u })),
  { id: 'r2', area: 'R2', title: 'R2-Archiv (Manifest ↔ Listing, Byte-Stichprobe)', command: npm('audit:r2'), blocking: false, remote: true, fullOnly: true, summary: /^Ergebnis:/u },
  { id: 'performance', area: 'Performance', title: 'Performance-Baseline (lokal + Produktion)', command: npm('audit:performance', '--', '--remote', baseUrl), blocking: false, remote: true, fullOnly: true, summary: /^(Norm |Suche |D1 Normliste)/u },
];

interface StepResult {
  id: string;
  area: Area;
  title: string;
  blocking: boolean;
  status: 'passed' | 'failed' | 'skipped';
  exitCode: number | null;
  durationSeconds: number;
  problem?: string;
  summary: string[];
  log?: string;
}

function run(command: string[], logFile: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), { cwd: root, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('close', async (code) => {
      // ANSI-Farben entfernen, damit Zusammenfassungen und Bewertung stabil sind.
      const clean = output.replace(/\u001b\[[0-9;]*m/gu, '');
      await writeFile(logFile, clean, 'utf8');
      resolve({ code: code ?? 1, output: clean });
    });
  });
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(join(root, path), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

await mkdir(LOG_DIR, { recursive: true });
const results: StepResult[] = [];
for (const step of STEPS) {
  const skip = (step.remote && offline) || (step.fullOnly && !full);
  if (skip) {
    results.push({ id: step.id, area: step.area, title: step.title, blocking: step.blocking, status: 'skipped', exitCode: null, durationSeconds: 0, summary: [step.fullOnly && !full ? 'nur mit --full' : 'offline'] });
    continue;
  }
  process.stdout.write(`… ${step.title}\n`);
  const started = Date.now();
  const logFile = join(LOG_DIR, `${step.id}.log`);
  const { code, output } = await run(step.command, logFile);
  const judged = code === 0 ? step.judge?.(output) ?? null : `Exit ${code}`;
  const summary = output.split('\n').filter((line) => step.summary.test(line)).map((line) => line.trim()).slice(0, 8);
  const result: StepResult = { id: step.id, area: step.area, title: step.title, blocking: step.blocking, status: judged ? 'failed' : 'passed', exitCode: code, durationSeconds: Math.round((Date.now() - started) / 1000), summary, log: `.cache/release-check/${step.id}.log` };
  if (judged) result.problem = judged;
  results.push(result);
  process.stdout.write(`${judged ? (step.blocking ? '✗ BLOCKER' : '! Hinweis') : '✓'} ${step.title} (${result.durationSeconds} s)${judged ? ` – ${judged}` : ''}\n`);
  for (const line of summary) process.stdout.write(`    ${line}\n`);
}

// Stand aus den vorhandenen Statusquellen (keine zweite Quelle).
const locks = await readJson<{ jurisdictions: Record<string, { commit: string; freeze: boolean }> }>('data/simulation/baseline-locks.json');
const inventoryRaw = await readJson<unknown>('packages/legal-core/src/config/inventory-status.json');
const inventory = inventoryRaw ? parseInventoryStatusFile(inventoryRaw) : new Map();
const queue = await readJson<{ totals: Record<string, number>; byStatus?: Record<string, number>; entries: Array<{ id: string; jurisdiction: string; priority: string; status: string; expectedTitle: string }> }>('data/simulation/source-acquisition-queue.json');
const accepted = (await readJson<{ findings: Array<{ id: string; area: string; classification: string; finding: string; rationale: string }> }>(ACCEPTED_PATH))?.findings ?? [];
const ostOutput = results.find((result) => result.id === 'ost-drift')?.summary.join(' ') ?? '';

const jurisdictions = JURISDICTION_IDS.map((id) => {
  const summary = summarizeJurisdictionStatus(inventory.get(id));
  const lock = locks?.jurisdictions[id];
  return {
    id,
    name: getJurisdiction(id).shortName,
    baselineStatus: id === 'ost' ? 'READ-ONLY UPSTREAM (OstRecht)' : lock?.freeze ? 'FROZEN' : 'NOT FROZEN',
    freezeCommit: id === 'ost' ? null : lock?.commit ?? null,
    baselineNorms: inventory.get(id)?.published ?? null,
    simulationStatus: summary?.simulationStatus ?? (id === 'ost' ? 'upstream' : null),
    gazetteCoverage: summary ? `${summary.gazetteCoverage.status} ${summary.gazetteCoverage.presentIssues}/${summary.gazetteCoverage.knownIssues}` : null,
    missingSources: summary?.missingSourceCount ?? null,
    evidenceIncomplete: summary?.evidenceIncompleteCount ?? null,
    review: summary?.reviewCount ?? null,
    blocked: summary?.blockedCount ?? null,
    lastSourceDate: summary?.lastSourceDate ?? null,
  };
});

const needed = (queue?.entries ?? []).filter((entry) => entry.status === 'open' || entry.status === 'candidate-found');
const limitations: string[] = [];
for (const entry of jurisdictions) {
  if (entry.simulationStatus === 'PARTIAL') limitations.push(`${entry.name}: Sim-Quellen PARTIAL (Gesetzblätter ${entry.gazetteCoverage}, ${entry.missingSources} fehlende Quelle(n), ${entry.evidenceIncomplete} mit unvollständiger Evidenz, ${entry.blocked} gesperrt / ${entry.review} in Prüfung) – bewusst, kein Releaseblocker`);
}
if (needed.length > 0) limitations.push(`Acquisition Queue: ${needed.length} offene Quelle(n) (P1 ${needed.filter((entry) => entry.priority === 'P1').length}, P2 ${needed.filter((entry) => entry.priority === 'P2').length}, P3 ${needed.filter((entry) => entry.priority === 'P3').length}) – \`npm run sources:needed\``);
if (/current-version-only/u.test(ostOutput) || offline) limitations.push('Ost: Volltextindex von OstRecht nur für die geltende Fassung (frühere Fassungen über die Fassungsnavigation erreichbar)');
for (const finding of accepted) limitations.push(`${finding.area}: ${finding.finding} (${finding.classification})`);

const blockers = results.filter((result) => result.blocking && result.status === 'failed');
const advisories = results.filter((result) => !result.blocking && result.status === 'failed');
const skippedBlocking = results.filter((result) => result.blocking && result.status === 'skipped');
const status = blockers.length > 0 ? 'NOT READY' : limitations.length > 0 || skippedBlocking.length > 0 ? 'READY WITH KNOWN LIMITATIONS' : 'READY';

const head = await new Promise<string>((resolve) => {
  const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root });
  let out = '';
  child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
  child.on('close', () => resolve(out.trim()));
});

process.stdout.write(`\nRelease-Status: ${status}${blockers.length ? ` – Blocker: ${blockers.map((result) => result.id).join(', ')}` : ''}${advisories.length ? ` · Hinweise: ${advisories.map((result) => result.id).join(', ')}` : ''}${skippedBlocking.length ? ` · nicht geprüft: ${skippedBlocking.map((result) => result.id).join(', ')}` : ''}\n`);
for (const limitation of limitations) process.stdout.write(`  bekannt: ${limitation}\n`);

if (write) {
  const generatedAt = new Date().toISOString();
  const report = { schemaVersion: 'landesrecht-release-readiness/1', generatedAt, head, baseUrl, mode: { offline, full }, status, blockers: blockers.map((result) => ({ id: result.id, problem: result.problem })), jurisdictions, steps: results.map(({ log: _log, ...result }) => result), knownLimitations: limitations, acceptedFindings: accepted, acquisitionQueue: { totals: queue?.totals ?? {}, byStatus: queue?.byStatus ?? {}, needed: needed.map((entry) => ({ id: entry.id, jurisdiction: entry.jurisdiction, priority: entry.priority, title: entry.expectedTitle })) } };
  await writeFile(join(root, REPORT_JSON), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const cell = (value: unknown): string => (value === null || value === undefined ? '–' : String(value).replace(/\|/gu, '\\|'));
  const lines = [
    '# Release-Bereitschaft',
    '',
    `Erzeugt von \`npm run release:check -- --write${full ? ' --full' : ''}${offline ? ' --offline' : ''}\` am ${generatedAt.slice(0, 10)} auf \`${head.slice(0, 12)}\` gegen \`${baseUrl}\`;`,
    `maschinenlesbar \`${REPORT_JSON}\`. Der Befehl orchestriert nur bestehende Prüfungen (Protokolle unter \`.cache/release-check/\`).`,
    'Bewusst fehlende Sim-Quellen sind bekannte Einschränkungen, nie Releaseblocker.',
    '',
    `## Release-Status: **${status}**`,
    '',
    blockers.length ? `Blocker: ${blockers.map((result) => `\`${result.id}\` (${result.problem})`).join(', ')}.` : 'Keine Releaseblocker.',
    '',
    '## Bestand je Land',
    '',
    '| Land | Ausgangsrechtsstand | Freeze-Commit | Baseline-Normen | Sim-Quellen | Gesetzblätter | fehlende Quellen | Evidenz unvollständig | gesperrt / in Prüfung | letzte Quelle |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: | --- | --- |',
    ...jurisdictions.map((entry) => `| ${entry.name} | ${entry.baselineStatus} | ${entry.freezeCommit ? `\`${entry.freezeCommit.slice(0, 12)}\`` : '–'} | ${cell(entry.baselineNorms)} | ${cell(entry.simulationStatus)} | ${cell(entry.gazetteCoverage)} | ${cell(entry.missingSources)} | ${cell(entry.evidenceIncomplete)} | ${entry.blocked === null ? '–' : `${entry.blocked} / ${entry.review}`} | ${cell(entry.lastSourceDate)} |`),
    '',
    `Ausgangsrechtsstand aller Länder: ${SIMULATION_BASELINE_DATE}; redaktioneller Stichtag ${EDITORIAL_REFERENCE_DATE}.`,
    '',
    '## Prüfungen',
    '',
    '| Bereich | Prüfung | Art | Ergebnis | Dauer | Zusammenfassung |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...results.map((result) => `| ${result.area} | ${cell(result.title)} | ${result.blocking ? 'blockierend' : 'beratend'} | ${result.status === 'passed' ? 'bestanden' : result.status === 'failed' ? `**fehlgeschlagen** (${cell(result.problem)})` : `übersprungen (${result.summary[0]})`} | ${result.durationSeconds} s | ${result.status === 'skipped' ? '–' : cell(result.summary.join(' · ').slice(0, 400))} |`),
    '',
    '## Bekannte, nicht blockierende Einschränkungen',
    '',
    ...(limitations.length ? limitations.map((limitation) => `- ${limitation}`) : ['- keine']),
    '',
    `Akzeptierte Befunde pflegt \`${ACCEPTED_PATH}\` (Klassifikation: bug, maintenance, expected/legal-data limitation, obsolete finding).`,
    '',
    '## Verbleibende Acquisition Queue',
    '',
    `${queue?.totals.all ?? 0} Einträge (P1 ${queue?.totals.P1 ?? 0}, P2 ${queue?.totals.P2 ?? 0}, P3 ${queue?.totals.P3 ?? 0}), noch zu beschaffen ${needed.length}. Kurzliste: \`npm run sources:needed\`; Details \`docs/SIM_SOURCE_ACQUISITION.md\`.`,
    '',
    ...needed.filter((entry) => entry.priority !== 'P3').map((entry) => `- ${entry.priority} ${getJurisdiction(entry.jurisdiction as never).shortName}: ${entry.expectedTitle}`),
    '',
  ];
  await writeFile(join(root, REPORT_MD), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Geschrieben: ${REPORT_MD}, ${REPORT_JSON}\n`);
}

process.exitCode = blockers.length > 0 ? 1 : 0;
