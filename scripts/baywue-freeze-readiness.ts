#!/usr/bin/env node
/**
 * Freeze-Readiness des BayWü-Ausgangsrechtsstands (Lauf 18, wie `scripts/nsh-freeze-readiness.ts`). Berechnet – ohne
 * einen Freeze zu setzen –, ob der reale Ausgangsrechtsstand zum 01.12.2023 eingefroren werden könnte:
 *
 *   NOT READY                 ein technischer Blocker ist offen oder ein Gate rot
 *   READY WITH HUMAN REVIEW   keine technischen Blocker, jeder offene Fall klassifiziert, offene fachliche Entscheidungen
 *   BASELINE READY            wie oben und kein offener Fall mehr (jeder Restfall übernommen, mit ReasonCode
 *                             ausgeschlossen oder abgelöst)
 *
 * Technische Blocker: Integritätsfehler in veröffentlichten Normen, veröffentlichte Normen, deren Text nachweislich nicht
 * der Stichtagstext ist (Klassifikation `changed-after-baseline` ohne Rezept), nicht reproduzierbare Rezepte,
 * Seed-Konflikte, offene Regressionen. Sim-Quellenlücken sind nie Blocker des Ausgangsrechtsstands.
 *
 *   node scripts/baywue-freeze-readiness.ts [--write] [--json] [--base <ref>]
 *
 * `--write` schreibt docs/BAYWUE_BASELINE_FREEZE_READINESS.md, data/audits/bayernrecht/freeze-readiness.json, den
 * Baseline-Status in packages/legal-core/src/config/inventory-status.json und – nur ohne technische Blocker –
 * docs/BAYWUE_BASELINE_HUMAN_APPROVAL.md.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { classifyReviewCase, reasonLabel, readQueueFacts, type CaseClass } from '@landesrecht/importer-bayernrecht/audit/review-classes.ts';
import { REVIEW_REASON_CODES, type ReviewReasonCode } from '@landesrecht/importer-bayernrecht/common/review.ts';
import { readBaselineLockFile, seedsFor } from '@landesrecht/importer-simulation/common/baseline-locks.ts';

import { versionTableFingerprints } from './lib/table-fingerprints.ts';

const root = resolveRepositoryRoot();
const args = process.argv.slice(2);
const write = args.includes('--write');
const asJson = args.includes('--json');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1]! : 'HEAD';

export const FREEZE_READINESS_SCHEMA = 'bayernrecht-freeze-readiness/1';
const DOC_PATH = 'docs/BAYWUE_BASELINE_FREEZE_READINESS.md';
const APPROVAL_PATH = 'docs/BAYWUE_BASELINE_HUMAN_APPROVAL.md';
const JSON_PATH = 'data/audits/bayernrecht/freeze-readiness.json';
const REVIEW_DIR = 'data/imports/bayernrecht/review';
const MANIFEST_DIR = 'data/imports/bayernrecht/manifest';
const BASELINE = '2023-12-01';

type Status = 'NOT READY' | 'READY WITH HUMAN REVIEW' | 'BASELINE READY';

interface ReviewItem {
  id: string;
  key: string;
  category: string;
  status: string;
  occurrence?: string;
  summary?: string;
  details: string[];
  sourceIdentity: string;
  decision?: { reasonCode?: ReviewReasonCode; classDecision?: string };
}
interface ManifestEntry {
  sourceIdentity: string;
  sourceArea: string;
  sourceTitle?: string;
  importStatus: string;
  targetSlug?: string;
  baselineRecoveryMethod?: string;
  integrity?: Record<string, unknown>;
  findings?: Array<{ severity: string; code: string; message: string }>;
}

const git = (...parameters: string[]): string => execFileSync('git', parameters, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024 });
const readJson = <T>(path: string): T | undefined => (existsSync(join(root, path)) ? (JSON.parse(readFileSync(join(root, path), 'utf8')) as T) : undefined);
const number = new Intl.NumberFormat('de-DE');
const count = <T>(values: readonly T[], key: (value: T) => string): Array<[string, number]> => {
  const map = new Map<string, number>();
  for (const value of values) map.set(key(value), (map.get(key(value)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const isImported = (status: string): boolean => status === 'imported' || status === 'imported-with-warnings';

function walkJson(directory: string): string[] {
  const out: string[] = [];
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkJson(join(directory, entry.name)));
    else if (entry.name.endsWith('.json')) out.push(join(directory, entry.name));
  }
  return out;
}

const readShardItems = (): ReviewItem[] => walkJson(join(root, REVIEW_DIR)).flatMap((file) => {
  const shard = JSON.parse(readFileSync(file, 'utf8')) as { sourceIdentity: string; items: ReviewItem[] };
  return shard.items.map((item) => ({ ...item, sourceIdentity: shard.sourceIdentity }));
});

function readShardItemsAt(reference: string): ReviewItem[] | undefined {
  let listing: string;
  try {
    listing = git('ls-tree', '-r', reference, '--', REVIEW_DIR);
  } catch {
    return undefined;
  }
  const blobs = listing.split('\n').filter(Boolean).map((line) => line.split(/\s+/u)[2]!);
  if (blobs.length === 0) return [];
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${blobs.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const items: ReviewItem[] = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    const size = Number(output.subarray(offset, headerEnd).toString('utf8').split(' ')[2]);
    const shard = JSON.parse(output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8')) as { sourceIdentity: string; items: ReviewItem[] };
    items.push(...shard.items.map((item) => ({ ...item, sourceIdentity: shard.sourceIdentity })));
    offset = headerEnd + 1 + size + 1;
  }
  return items;
}

function manifestAt(reference: string): Map<string, ManifestEntry> {
  const listing = git('ls-tree', '-r', reference, '--', MANIFEST_DIR).split('\n').filter(Boolean).map((line) => line.split(/\s+/u)[2]!);
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${listing.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const result = new Map<string, ManifestEntry>();
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    const size = Number(output.subarray(offset, headerEnd).toString('utf8').split(' ')[2]);
    const entry = (JSON.parse(output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8')) as { entry: ManifestEntry }).entry;
    result.set(entry.sourceIdentity, entry);
    offset = headerEnd + 1 + size + 1;
  }
  return result;
}

/* ------------------------------------------------------------------------------------------------ */

const manifest = walkJson(join(root, MANIFEST_DIR)).map((file) => (JSON.parse(readFileSync(file, 'utf8')) as { entry: ManifestEntry }).entry);
const bySource = new Map(manifest.map((entry) => [entry.sourceIdentity, entry]));
const imported = manifest.filter((entry) => isImported(entry.importStatus));
const recovery = count(imported, (entry) => entry.baselineRecoveryMethod ?? 'current-source');
const before = (() => {
  try {
    return manifestAt(base);
  } catch {
    return undefined;
  }
})();
const importedBefore = before ? [...before.values()].filter((entry) => isImported(entry.importStatus)) : undefined;
const recoveryBefore = importedBefore ? count(importedBefore, (entry) => entry.baselineRecoveryMethod ?? 'current-source') : undefined;

const items = readShardItems();
const facts = await readQueueFacts(root);
const open = items.filter((item) => item.status === 'open' && item.occurrence === 'current');
const classified = open.map((item) => ({ item, klass: classifyReviewCase(item as never, facts.get(item.sourceIdentity)) }));
const excluded = items.filter((item) => item.status === 'resolved-excluded');
const beforeItems = readShardItemsAt(base);
const beforeOpen = beforeItems?.filter((item) => item.status === 'open' && item.occurrence === 'current');

// Stichtagsklassifikation und Rekonstruktion
const baselineFile = readJson<{ decisions: Array<{ documentId: string; class: string; status: string; method: string; reason: string }> }>('data/imports/bayernrecht/baseline.json');
const decisions = new Map((baselineFile?.decisions ?? []).map((decision) => [decision.documentId, decision]));
const queue = readJson<{ totals: { byState: Record<string, number>; recipeReady: number; changedAfterBaseline: number }; entries: Array<{ documentId: string; state: string; reason: string; group: string; detail?: string; steps: number }> }>('data/imports/bayernrecht/reconstruction-queue.json');
const reconstructionAudit = readJson<{ totals: { recipes: number; forwardCheckPassed: number; sourceCheckPassed: number; restored: number; restorationCheckPassed: number } }>('data/audits/bayernrecht/reconstruction-audit.json');

// Seeds, Sim-Ziele, Sim-Quellen
const lockFile = await readBaselineLockFile(root);
const seeds = lockFile ? [...seedsFor(lockFile, 'baywue').values()] : [];
const baywueLock = lockFile?.jurisdictions.baywue;
const ledger = readJson<{ events: Array<{ id: string; status: string; reasonCode?: string; targets: Array<{ slug: string; title?: string }>; note?: string }> }>('data/simulation/baywue/ledger.json');
const completeness = readJson<{ status: string; series?: Array<{ series?: string; knownIssues: string[]; presentIssues: string[]; missingIssues: string[] }>; notes?: string[] }>('data/simulation/baywue/completeness.json');

const regressionSet = readJson<{ totals: Record<string, number>; rule: string }>('data/audits/bayernrecht/post-baseline-amendment-regression.json');
const consolidation = readJson<{ recipes: Array<{ recipe: string; amendmentAct: string; target: string; effectiveDate: string; repealsLaw: boolean; versionId: string | null; targetExcluded?: { reasonCode: string } }> }>('data/simulation/baywue/consolidation-manifest.json');
const superseded = (lockFile?.supersededSeeds ?? []).filter((seed) => seed.jurisdiction === 'baywue');

/* Technische Blocker ----------------------------------------------------------------------------- */

interface Blocker { kind: string; sourceIdentity: string; slug?: string; detail: string }
const blockers: Blocker[] = [];
for (const entry of imported) {
  const integrity = entry.integrity ?? {};
  const failed = Object.entries(integrity).filter(([, value]) => value === false).map(([key]) => key);
  if (failed.length > 0) blockers.push({ kind: 'text-integrity', sourceIdentity: entry.sourceIdentity, ...(entry.targetSlug ? { slug: entry.targetSlug } : {}), detail: `Integritätsprüfung nicht bestanden: ${failed.join(', ')}` });
  const decision = decisions.get(entry.sourceIdentity);
  if (entry.baselineRecoveryMethod === 'current-source' && decision && decision.class === 'changed-after-baseline' && decision.method !== 'reverse-amendment') {
    const seeded = seeds.some((seed) => seed.slug === entry.targetSlug);
    blockers.push({ kind: seeded ? 'seed-conflict' : 'published-text-not-baseline', sourceIdentity: entry.sourceIdentity, ...(entry.targetSlug ? { slug: entry.targetSlug } : {}), detail: `${seeded ? 'Per-Norm-Seed: ' : ''}veröffentlichter heutiger Text, Stichtagsklassifikation ${decision.reason} – Stichtagstext nicht belegt${seeded ? `; Seed-Verschiebung nur mit Evidenzentscheidung${existsSync(join(root, 'data/simulation/baywue', `${entry.targetSlug?.replace(/-baywue$/u, '')}-baseline-seed-decision.md`)) ? ` (data/simulation/baywue/${entry.targetSlug?.replace(/-baywue$/u, '')}-baseline-seed-decision.md)` : ''}` : ''}` });
  }
  if (entry.baselineRecoveryMethod === 'reverse-post-baseline-event' && decision && decision.method !== 'reverse-amendment') blockers.push({ kind: 'recipe-not-reproduced', sourceIdentity: entry.sourceIdentity, ...(entry.targetSlug ? { slug: entry.targetSlug } : {}), detail: `Rezept nicht mehr belegt (${decision.reason})` });
}
for (const { item, klass } of classified) {
  if (klass.class !== 'technical-blocker') continue;
  if (blockers.some((blocker) => blocker.sourceIdentity === item.sourceIdentity)) continue;
  blockers.push({ kind: klass.group, sourceIdentity: item.sourceIdentity, detail: `${item.category}/${item.key}: ${item.summary ?? ''}`.slice(0, 240) });
}
const recipeAudit = reconstructionAudit?.totals;
if (recipeAudit && (recipeAudit.forwardCheckPassed !== recipeAudit.recipes || recipeAudit.sourceCheckPassed !== recipeAudit.recipes || recipeAudit.restorationCheckPassed !== recipeAudit.restored)) {
  blockers.push({ kind: 'recipe-audit', sourceIdentity: '–', detail: `Rezeptaudit: Vorwärts ${recipeAudit.forwardCheckPassed}/${recipeAudit.recipes}, Quellen ${recipeAudit.sourceCheckPassed}/${recipeAudit.recipes}, Wiederherstellung ${recipeAudit.restorationCheckPassed}/${recipeAudit.restored}` });
}

/* Bestand und Fingerabdruck ---------------------------------------------------------------------- */

function contentStats(): { baselineNorms: number; simulationNorms: number; withSimulationVersions: string[]; tableNorms: number; tables: number; fingerprint: string } {
  const directory = join(root, 'content/norms/baywue');
  let baselineNorms = 0;
  let simulationNorms = 0;
  let tableNorms = 0;
  let tables = 0;
  const withSimulationVersions: string[] = [];
  const lines: string[] = [];
  // Baseline = Verzeichnisse übernommener Manifesteinträge (heutige Normen und aus Verkündungen wiederhergestellte).
  const baselineSlugs = new Set(imported.map((entry) => entry.targetSlug).filter((slug): slug is string => Boolean(slug)));
  for (const slug of readdirSync(directory).filter((name) => !name.startsWith('.')).sort()) {
    if (!baselineSlugs.has(slug)) {
      simulationNorms += 1;
      continue;
    }
    const file = join(directory, slug, 'versions', `${BASELINE}.json`);
    if (!existsSync(file)) continue;
    baselineNorms += 1;
    if (readdirSync(join(directory, slug, 'versions')).some((name) => name !== `${BASELINE}.json`)) withSimulationVersions.push(slug);
    const text = readFileSync(file);
    lines.push(`content/norms/baywue/${slug}/versions/${BASELINE}.json ${createHash('sha256').update(text).digest('hex')}`);
    const fingerprints = versionTableFingerprints(JSON.parse(text.toString('utf8')) as { body?: [] });
    if (fingerprints.length > 0) {
      tableNorms += 1;
      tables += fingerprints.length;
    }
  }
  return { baselineNorms, simulationNorms, withSimulationVersions, tableNorms, tables, fingerprint: createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex') };
}
const content = contentStats();

/* Gates ------------------------------------------------------------------------------------------ */

const r2 = readJson<{ status: string; endedAt: string; remote: { ok: boolean; missing: number; listedObjects: number } }>('data/audits/bayernrecht/R2_AUDIT.json');
const d1 = readJson<{ checkedAt: string; differences: number; database: string; sampleSize: number }>('data/audits/bayernrecht/d1/D1_REMOTE_CHECK.json');
const search = readJson<{ ok: boolean; norms: number; searchUnits: number }>('data/audits/bayernrecht/search/search-audit-full.json');
const gates = [
  { id: 'manifest-content', ok: imported.length === content.baselineNorms, detail: `Manifest ${number.format(imported.length)} übernommen = Bestand ${number.format(content.baselineNorms)}` },
  { id: 'reconstruction-recipes', ok: Boolean(recipeAudit && recipeAudit.forwardCheckPassed === recipeAudit.recipes && recipeAudit.sourceCheckPassed === recipeAudit.recipes), detail: recipeAudit ? `${recipeAudit.recipes} Rezepte, Vorwärtsprobe ${recipeAudit.forwardCheckPassed}, Quellen ${recipeAudit.sourceCheckPassed}, Wiederherstellung ${recipeAudit.restorationCheckPassed}/${recipeAudit.restored}` : 'kein Audit' },
  { id: 'r2', ok: r2?.remote.ok === true && r2.remote.missing === 0, detail: r2 ? `${r2.status}, ${number.format(r2.remote.listedObjects)} Objekte, fehlend ${r2.remote.missing} (${r2.endedAt.slice(0, 10)})` : 'kein Bericht' },
  { id: 'd1-remote', ok: d1?.differences === 0, detail: d1 ? `${d1.database}, Stichprobe ${d1.sampleSize}, ${d1.differences} Abweichungen (${d1.checkedAt.slice(0, 10)})` : 'kein Bericht' },
  { id: 'search-audit-full', ok: search?.ok === true, detail: search ? `${number.format(search.norms)} Normen, ${number.format(search.searchUnits)} Sucheinheiten` : 'kein Bericht' },
];

// Freeze (docs/BAYWUE_BASELINE_FREEZE.md): Freeze-Commit, dokumentierter Fingerabdruck (Lock-Notiz) und Arbeitskopie stimmen überein.
function fingerprintAt(reference: string): { fingerprint: string; norms: number } {
  const entries = [...manifestAt(reference).values()].filter((entry) => isImported(entry.importStatus) && entry.targetSlug);
  const slugs = [...new Set(entries.map((entry) => entry.targetSlug!))].sort();
  const paths = slugs.map((slug) => `content/norms/baywue/${slug}/versions/${BASELINE}.json`);
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${paths.map((path) => `${reference}:${path}`).join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const lines: string[] = [];
  let offset = 0;
  for (const path of paths) {
    const headerEnd = output.indexOf(0x0a, offset);
    const size = Number(output.subarray(offset, headerEnd).toString('utf8').split(' ')[2]);
    lines.push(`${path} ${createHash('sha256').update(output.subarray(headerEnd + 1, headerEnd + 1 + size)).digest('hex')}`);
    offset = headerEnd + 1 + size + 1;
  }
  return { fingerprint: createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex'), norms: lines.length };
}
const frozenState = baywueLock?.freeze ? (() => {
  const atCommit = fingerprintAt(baywueLock.commit);
  const documented = /\b([0-9a-f]{64})\b/u.exec(baywueLock.note ?? '')?.[1];
  return { commit: baywueLock.commit, atCommit, documented };
})() : undefined;
if (frozenState) {
  const ok = frozenState.atCommit.fingerprint === content.fingerprint && frozenState.documented === content.fingerprint && frozenState.atCommit.norms === content.baselineNorms;
  gates.push({ id: 'freeze-fingerprint', ok, detail: `Freeze-Commit ${frozenState.commit.slice(0, 12)}: ${number.format(frozenState.atCommit.norms)} Normen, ${frozenState.atCommit.fingerprint.slice(0, 16)}… · Arbeitskopie ${number.format(content.baselineNorms)} Normen, ${content.fingerprint.slice(0, 16)}… · dokumentiert ${frozenState.documented?.slice(0, 16) ?? 'fehlt'}…` });
}

const technical = blockers;
const human = classified.filter((entry) => entry.klass.class === 'human-decision');
const failedGates = gates.filter((gate) => !gate.ok);
const status: Status = technical.length > 0 || failedGates.length > 0 ? 'NOT READY' : human.length > 0 ? 'READY WITH HUMAN REVIEW' : 'BASELINE READY';
const exclusionsByCode = REVIEW_REASON_CODES.map((code) => [code, excluded.filter((item) => item.decision?.reasonCode === code)] as const).filter(([, list]) => list.length > 0);
const documents = (list: ReadonlyArray<{ sourceIdentity: string }>): number => new Set(list.map((entry) => entry.sourceIdentity)).size;

/* Sim-Ziele ------------------------------------------------------------------------------------- */

const SIM_TARGET_SOURCES: Record<string, string> = {
  'bayeug-baywue': 'BayEUG', 'bayschfg-baywue': 'BaySchFG', 'pag-baywue': 'BayPAG', 'pog-baywue': 'BayPOG', 'gemeindeordnung-baywue': 'BayGO',
  'abgeordnetengesetz-baywue': 'BayAbgG', 'bayfag-baywue': 'BayFAG', 'baystrwg-baywue': 'BayStrWG', 'ago-baywue': 'BayAGO', 'bayoepnvg-baywue': 'BayOePNVG',
  'grso-baywue': 'BayVSO', 'gso-baywue': 'BayGSO', 'baykibig-baywue': 'BayKiBiG',
};
const queueById = new Map((queue?.entries ?? []).map((entry) => [entry.documentId, entry]));
const simTargets = Object.entries(SIM_TARGET_SOURCES).map(([slug, source]) => {
  const events = (ledger?.events ?? []).filter((event) => event.targets.some((target) => target.slug === slug));
  const entry = bySource.get(source);
  const q = queueById.get(source);
  return {
    slug,
    source,
    title: entry?.sourceTitle ?? '',
    baselinePublished: entry ? isImported(entry.importStatus) : false,
    reconstruction: q ? `${q.state}/${q.reason}` : '–',
    safelyReconstructable: q?.state === 'recipe-ready',
    events: events.map((event) => `${event.id} (${event.status}${event.reasonCode ? `, ${event.reasonCode}` : ''})`),
    blocked: events.some((event) => event.status === 'blocked' || event.status === 'review'),
    detail: q?.detail ?? '',
  };
});

const result = {
  schemaVersion: FREEZE_READINESS_SCHEMA,
  jurisdiction: 'baywue',
  baselineDate: BASELINE,
  freezeSet: baywueLock?.freeze === true,
  /** Baseline-Status: FROZEN (Freeze gesetzt, Fingerabdruck konsistent) oder die Bereitschaftsbewertung. */
  baselineStatus: frozenState ? (gates.every((gate) => gate.id !== 'freeze-fingerprint' || gate.ok) ? 'FROZEN' : 'FROZEN – ABWEICHUNG') : status,
  ...(frozenState ? { freezeCommit: frozenState.commit } : {}),
  status,
  baselineFingerprint: content.fingerprint,
  counts: {
    baselineNorms: content.baselineNorms,
    baselineNormsBefore: importedBefore?.length ?? null,
    recovery: Object.fromEntries(recovery),
    recoveryBefore: recoveryBefore ? Object.fromEntries(recoveryBefore) : null,
    reconstructionRequired: (queue?.entries ?? []).filter((entry) => entry.state !== 'recipe-ready').length,
    openBefore: beforeOpen?.length ?? null,
    open: open.length,
    technicalBlockers: technical.length,
    openHumanDecisions: human.length,
    resolvedExcluded: excluded.length,
  },
  technicalBlockers: technical,
  openHumanDecisions: count(human, (entry) => entry.klass.label),
  exclusions: Object.fromEntries(exclusionsByCode.map(([code, list]) => [code, { cases: list.length, documents: documents(list) }])),
  reconstruction: { byState: queue?.totals.byState ?? {}, audit: recipeAudit ?? null },
  gates,
  seeds: seeds.map((seed) => ({ slug: seed.slug, sha256: seed.sha256, sourceCommit: seed.sourceCommit, conflict: blockers.some((blocker) => blocker.kind === 'seed-conflict' && blocker.slug === seed.slug) })),
  supersededSeeds: superseded.map((seed) => ({ slug: seed.slug, sha256: seed.sha256, acceptedAt: seed.acceptedAt, supersededAt: seed.supersededAt, supersededBy: seed.supersededBy })),
  postBaselineAmendmentRegression: regressionSet?.totals ?? null,
  simulationRecipes: (consolidation?.recipes ?? []).map((recipe) => ({ target: recipe.target, act: recipe.amendmentAct, effectiveDate: recipe.effectiveDate, kind: recipe.repealsLaw ? (recipe.targetExcluded ? 'repeal-target-excluded' : 'repeal') : 'version' })),
  simTargets,
  simulationSources: completeness?.status ?? 'unbekannt',
  content: { tableNorms: content.tableNorms, tables: content.tables, simulationNorms: content.simulationNorms, withSimulationVersions: content.withSimulationVersions.length },
};

if (asJson) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`BayWü-Baseline-Status: ${result.baselineStatus}${result.freezeSet ? ` (Freeze-Commit ${baywueLock!.commit.slice(0, 12)}; Bewertung ${status})` : ' (Freeze nicht gesetzt)'} · Baseline ${number.format(content.baselineNorms)} Normen · Fingerabdruck ${content.fingerprint.slice(0, 16)}…`);
  console.log(`  offen ${open.length}${beforeOpen ? ` (vorher ${beforeOpen.length})` : ''}: technische Blocker ${technical.length}, offene fachliche Entscheidungen ${human.length}; bewusst ausgeschlossen ${excluded.length}`);
  for (const blocker of technical) console.log(`  Blocker ${blocker.kind}: ${blocker.sourceIdentity}${blocker.slug ? ` (${blocker.slug})` : ''} – ${blocker.detail}`);
  for (const gate of gates) console.log(`  Gate ${gate.id}: ${gate.ok ? 'ok' : 'ROT'} – ${gate.detail}`);
}

if (write) {
  const table = (header: string[], rows: Array<Array<string | number>>): string => [`| ${header.join(' | ')} |`, `| ${header.map((_, index) => (rows.length > 0 && rows.every((row) => typeof row[index] === 'number') ? '---:' : '---')).join(' | ')} |`, ...rows.map((row) => `| ${row.map((cell) => (typeof cell === 'number' ? number.format(cell) : String(cell).replace(/\|/gu, '/'))).join(' | ')} |`)].join('\n');
  const methodLabel = (key: string): string => (key === 'current-source' ? 'exakt (heutiger Text = Stichtagstext)' : key === 'reverse-post-baseline-event' ? 'rekonstruiert (Rückrechnung, Rundlauf exakt)' : key === 'reconstructed-from-publications' ? 'wiederhergestellt aus Verkündungen (heute nicht geführt)' : key);
  const baseShort = base === 'HEAD' ? git('rev-parse', '--short', 'HEAD').trim() : base;
  const recoveryRows = [...new Set([...recovery.map(([key]) => key), ...(recoveryBefore ?? []).map(([key]) => key)])].map((key) => [methodLabel(key), recoveryBefore?.find(([k]) => k === key)?.[1] ?? 0, recovery.find(([k]) => k === key)?.[1] ?? 0]);
  const excludedTable = exclusionsByCode.length === 0 ? 'keine' : table(['ReasonCode', 'Bedeutung', 'Fälle', 'Dokumente'], exclusionsByCode.map(([code, list]) => [`\`${code}\``, reasonLabel(code), list.length, documents(list)]));
  const simTable = table(['Sim-Ziel', 'Quelle', 'Baseline veröffentlicht', 'Rekonstruktion', 'sicher rekonstruierbar', 'Sim-Ereignisse'], simTargets.map((target) => [`\`${target.slug}\``, target.source, target.baselinePublished ? 'ja' : 'nein', target.reconstruction, target.safelyReconstructable ? 'ja' : 'nein', target.events.length === 0 ? '–' : `${target.events.length} (${target.blocked ? 'gesperrt/Review' : 'angewandt'})`]));
  const seedTable = table(['Seed', 'SHA-256', 'Quell-Commit', 'Stand'], result.seeds.map((seed) => [`\`${seed.slug}\``, `\`${seed.sha256.slice(0, 16)}…\``, seed.sourceCommit ? `\`${seed.sourceCommit.slice(0, 9)}\`` : '–', seed.conflict ? '**Konflikt**' : 'gültig']));
  const simSources = completeness ? `Status \`${completeness.status}\`${completeness.series ? `: ${completeness.series.map((series) => `${series.series ?? 'Reihe'} ${series.presentIssues.length}/${series.knownIssues.length} Ausgaben`).join('; ')}` : ''}` : 'unbekannt';
  const regressionText = regressionSet
    ? `Klassifikation 3b (Lauf 18/19) hat ${number.format(Object.values(regressionSet.totals).reduce((sum, value) => sum + value, 0))} früher als „heutiger Text = Stichtagstext“ geführte bzw. geprüfte Normen umgestellt: ${number.format(regressionSet.totals['corrected-reconstructed'] ?? 0)} sicher zurückgerechnet (korrigierte Stichtagsfassung), ${number.format(regressionSet.totals['newly-reconstructed'] ?? 0)} neu rekonstruiert, ${number.format(regressionSet.totals.withdrawn ?? 0)} zurückgenommen (einschließlich StRGVV). Persistentes Regressionsset mit Evidenzgrund je Norm: \`data/audits/bayernrecht/post-baseline-amendment-regression.json\` (Test \`tests/unit/bayernrecht-freeze-guard.test.ts\`).`
    : 'Regressionsset fehlt.';
  const strgvvText = superseded.length === 0 ? 'keine abgelösten Seeds' : superseded.map((seed) => `\`${seed.slug}\`: Seed \`${seed.sha256.slice(0, 12)}…\` (akzeptiert ${seed.acceptedAt}) am ${seed.supersededAt} abgelöst – ${seed.supersededBy}. Die Norm ist nicht veröffentlicht; die Sim-Aufhebung vom 13.04.2025 wirkt als Identitäts-/Statusoperation (Rezeptfeld \`targetExcluded\`, Beziehungen am Sim-Akt).`).join('\n\n');
  const recipeTable = table(['Zielnorm', 'Sim-Akt', 'Wirkdatum', 'Art'], (consolidation?.recipes ?? []).map((recipe) => [`\`${recipe.target}\``, `\`${recipe.amendmentAct}\``, recipe.effectiveDate, recipe.repealsLaw ? (recipe.targetExcluded ? 'Aufhebung (Zielfassung ausgeschlossen)' : 'Aufhebung') : 'neue Fassung']));
  const missingSources = exclusionsByCode.filter(([code]) => ['missing-primary-source', 'source-scan-unreadable', 'old-text-missing', 'missing-normative-annex', 'missing-normative-image', 'unsafe-table-structure'].includes(code)).map(([code, list]) => `\`${code}\` ${number.format(list.length)}`).join(' · ');
  const doc = [
    '# Freeze-Readiness des BayWü-Ausgangsrechtsstands',
    '',
    `Automatisch erzeugt von \`node scripts/baywue-freeze-readiness.ts --write\` (Arbeitskopie; Vorher-Stand: Commit \`${baseShort}\`). Nicht von Hand bearbeiten. Freeze-Semantik wie West/NSH: \`docs/SIMULATION_IMPORT.md\` 6.1 (nur der reale Ausgangsrechtsstand zum 01.12.2023; Sim-Normen, Sim-Fassungen, Aufhebungen, Verkündungen und additive Historie/Beziehungen bleiben zulässig), Rückwirkung 6.2.`,
    '',
    frozenState
      ? `**Baseline-Status: ${result.baselineStatus}** · Freeze-Commit \`${frozenState.commit}\` (Human Approval 2026-09-29, \`docs/BAYWUE_BASELINE_FREEZE.md\`) · Bewertung der Restfälle: \`${status}\` · Baseline-Fingerabdruck \`${content.fingerprint}\` · Sim-Quellenstatus getrennt: \`${result.simulationSources}\` (kein Blocker des Ausgangsrechtsstands)`
      : `**Status: ${status}** · Freeze **nicht gesetzt** · Baseline-Fingerabdruck \`${content.fingerprint}\` · Sim-Quellenstatus getrennt: \`${result.simulationSources}\` (kein Blocker des Ausgangsrechtsstands)`,
    '',
    'Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist (Integritätsfehler veröffentlichter Normen, veröffentlichter Text nachweislich nicht der Stichtagstext, nicht reproduzierbare Rezepte, Seed-Konflikte, Regressionen). `READY WITH HUMAN REVIEW`: keine technischen Blocker, offene Fälle klassifiziert. `BASELINE READY`: zusätzlich kein offener Fall.',
    '',
    '## 1 Übersicht',
    '',
    table(['Kennzahl', 'Wert'], [
      ['Baseline-Normen vorher → jetzt', `${importedBefore ? number.format(importedBefore.length) : '–'} → ${number.format(content.baselineNorms)}`],
      ['technische Blocker', technical.length],
      ['offene fachliche Entscheidungen', human.length],
      ['bewusst ausgeschlossene Fälle (resolved-excluded)', excluded.length],
      ['offene Fälle vorher → jetzt', `${beforeOpen ? number.format(beforeOpen.length) : '–'} → ${number.format(open.length)}`],
      ['Rekonstruktion nicht möglich (Queue ohne Rezept)', result.counts.reconstructionRequired],
    ]),
    '',
    '## 2 Bestand',
    '',
    table(['Herkunft der Stichtagsfassung', 'vorher', 'jetzt'], recoveryRows),
    '',
    `Normen mit Tabellen / Tabellen: ${number.format(content.tableNorms)} / ${number.format(content.tables)} · davon durch die Simulation fortgeschrieben: ${content.withSimulationVersions.length} · eigene Sim-Normen: ${content.simulationNorms}.`,
    '',
    '## 3 Technische Blocker',
    '',
    technical.length === 0 ? 'keine' : table(['Art', 'Quelle', 'Slug', 'Befund'], technical.map((blocker) => [blocker.kind, `\`${blocker.sourceIdentity}\``, blocker.slug ? `\`${blocker.slug}\`` : '–', blocker.detail])),
    '',
    '## 4 Offene fachliche Entscheidungen',
    '',
    human.length === 0 ? 'keine' : table(['Gruppe', 'Fälle'], count(human, (entry) => entry.klass.label)),
    '',
    '## 5 Bewusst ausgeschlossen (resolved-excluded)',
    '',
    excludedTable,
    '',
    'Ausgeschlossene Fälle bleiben mit Begründung in den Review-Shards (auditierbar, nicht offen, bei neuer Evidenz neu zu öffnen). OCR erzeugt keine kanonische Fassung.',
    '',
    '## 6 Rekonstruktion',
    '',
    table(['Zustand', 'Normen'], Object.entries(queue?.totals.byState ?? {}).sort((a, b) => b[1] - a[1]).map(([state, value]) => [state, value])),
    '',
    recipeAudit ? `Rezeptaudit: ${recipeAudit.recipes} Rezepte, Vorwärtsprobe ${recipeAudit.forwardCheckPassed}/${recipeAudit.recipes}, Quellen ${recipeAudit.sourceCheckPassed}/${recipeAudit.recipes}, Wiederherstellung aus der Stammverkündung ${recipeAudit.restorationCheckPassed}/${recipeAudit.restored}.` : 'Rezeptaudit fehlt.',
    '',
    '## 7 Seeds',
    '',
    seedTable,
    '',
    '## 8 Sim-blockierte Zielnormen (unresolved source dependencies)',
    '',
    simTable,
    '',
    'Keine dieser Baselines wird erzwungen. Solange die Stichtagsfassung nicht sicher rückrechenbar ist, bleibt das Sim-Ziel gesperrt (`missing-baseline-target`).',
    '',
    '## 9 Gates',
    '',
    table(['Gate', 'Ergebnis', 'Detail'], gates.map((gate) => [gate.id, gate.ok ? 'grün' : '**rot**', gate.detail])),
    '',
    '## 10 Post-Stichtags-Änderungen mit veraltetem Paketdatum',
    '',
    regressionText,
    '',
    '## 11 StRGVV (Human Decision 2026-09-29: Regel 6.2 strikt)',
    '',
    strgvvText,
    '',
    '## 12 Sim-Quellenstatus (getrennt, kein Baseline-Blocker)',
    '',
    `${simSources}. Bekannte Lücken: Originalverkündungsblatt der Staatsverfassung 2025, Organisationserlass vom 14.02.2025, Erdbebenhilfegesetz 2026 (nur als Entwurf belegt; kein Baselinefall), fehlende oder unklare Einzelverkündungen und Lücken der Gazette-Reihen (\`data/simulation/baywue/completeness.json\`).`,
    '',
  ];
  await writeFile(join(root, DOC_PATH), `${doc.join('\n')}\n`);
  await mkdir(dirname(join(root, JSON_PATH)), { recursive: true });
  await writeFile(join(root, JSON_PATH), `${JSON.stringify({ ...result, generatedFrom: base }, null, 2)}\n`);
  // Nach dem Freeze ist die Freigabeübersicht Beleg der Entscheidung und wird nicht mehr neu erzeugt.
  if (!frozenState && technical.length === 0 && failedGates.length === 0) {
    const approval = [
      '# BayWü-Ausgangsrechtsstand – Freigabeübersicht für den Baseline-Freeze',
      '',
      `Automatisch erzeugt von \`node scripts/baywue-freeze-readiness.ts --write\`. Freeze-Readiness: **${status}**. Der Freeze ist **nicht gesetzt**; er wird nur auf ausdrückliche Entscheidung gesetzt.`,
      '',
      table(['Kennzahl', 'Wert'], [['Baseline-Normen', content.baselineNorms], ...recovery.map(([key, value]): [string, number] => [methodLabel(key), value])]),
      '',
      `**Fingerabdruck:** \`${content.fingerprint}\` – SHA-256 über die sortierte Liste „Pfad SHA-256“ aller \`content/norms/baywue/<slug>/versions/2023-12-01.json\` der übernommenen Manifesteinträge (${number.format(content.baselineNorms)} Dateien).`,
      '',
      '## Bewusst ausgeschlossen',
      '',
      excludedTable,
      '',
      '## Offene fachliche Entscheidungen',
      '',
      human.length === 0 ? 'keine' : table(['Gruppe', 'Fälle'], count(human, (entry) => entry.klass.label)),
      '',
      '## Seeds',
      '',
      seedTable,
      '',
      '## Korrigierte Post-Stichtags-Fälle',
      '',
      regressionText,
      '',
      '## StRGVV-Entscheidung',
      '',
      strgvvText,
      '',
      '## Sim-blockierte Zielnormen',
      '',
      simTable,
      '',
      'Sie bleiben ausgeschlossen bzw. gesperrt, bis neue amtliche Evidenz vorliegt; ihr Ausgangswortlaut ist bewusst und nachvollziehbar ausgeschlossen. Der Sim-Rechtsstand bleibt davon getrennt unvollständig.',
      '',
      '## Sim-Rezepte',
      '',
      recipeTable,
      '',
      '## Fehlende Quellen',
      '',
      `Nicht veröffentlicht mangels belastbarer Quelle: ${missingSources || 'keine'}; dazu heute nicht mehr geführte Stichtagsnormen ohne elektronische Verkündung (\`docs/BAYWUE_BASELINE_ONLY.md\`). Sim-Quellenlücken (Originalblatt der Staatsverfassung 2025, Organisationserlass 14.02.2025, Erdbebenhilfegesetz, Gazette-Lücken) sind davon getrennt.`,
      '',
      '## Was der Freeze nicht bestätigt',
      '',
      '**Der Freeze bestätigt ausschließlich die veröffentlichten und belegten Baselinefassungen. Bewusst ausgeschlossene Normen mit nicht sicher rekonstruierbarem Wortlaut werden dadurch nicht als vollständig oder materiell richtig bestätigt.** Ebenso wenig bestätigt er heute nicht mehr geführte Stichtagsnormen ohne Verkündungsbeleg oder die Vollständigkeit der Sim-Verkündungsblätter.',
      '',
      '## Entscheidung für den Freeze',
      '',
      `Mit der Freigabe gilt: \`data/simulation/baseline-locks.json\` → \`jurisdictions.baywue\` = \`{ "commit": "<Commit dieses Stands>", "freeze": true }\` für den Bestand mit dem Fingerabdruck \`${content.fingerprint}\`. Danach ändert sich eine BayWü-Ausgangsfassung nur noch als dokumentierter Sonderfall (Bug, neue Primärevidenz, Human Review, Schema-Migration); der BayWü-Bulk sperrt jede andere Abweichung (\`baseline-frozen\`, Exit 1). Sim-Fortschreibung bleibt additiv zulässig.`,
      '',
    ];
    await writeFile(join(root, APPROVAL_PATH), `${approval.join('\n')}\n`);
  } else if (!frozenState && existsSync(join(root, APPROVAL_PATH))) {
    await rm(join(root, APPROVAL_PATH));
  }
  const statusPath = join(root, 'packages/legal-core/src/config/inventory-status.json');
  const statusFile = JSON.parse(readFileSync(statusPath, 'utf8')) as { jurisdictions: Record<string, Record<string, unknown>> };
  const entry = statusFile.jurisdictions.baywue;
  if (entry) entry.baselineFreeze = baywueLock?.freeze ? { frozen: true, assessedAt: new Date().toISOString().slice(0, 10) } : { frozen: false, readiness: status, assessedAt: new Date().toISOString().slice(0, 10) };
  await writeFile(statusPath, `${JSON.stringify(statusFile, null, 2)}\n`);
  console.log(`Geschrieben: ${DOC_PATH}, ${JSON_PATH}${!frozenState && technical.length === 0 && failedGates.length === 0 ? `, ${APPROVAL_PATH}` : ''}, Baseline-Status BayWü in inventory-status.json`);
}
