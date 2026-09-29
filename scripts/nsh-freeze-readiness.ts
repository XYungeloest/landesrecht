#!/usr/bin/env node
/**
 * Freeze-Readiness des NSH-Ausgangsrechtsstands (Lauf 16/17). Berechnet – ohne einen Freeze zu setzen –, ob der reale
 * Ausgangsrechtsstand zum Stichtag eingefroren werden könnte:
 *
 *   NOT READY                 ein technischer Blocker ist offen oder ein Gate rot
 *   READY WITH HUMAN REVIEW   keine technischen Blocker; veröffentlichte Baseline konsistent; jeder offene Fall ist
 *                             klassifiziert, aber es gibt noch offene fachliche Entscheidungen
 *   BASELINE READY            wie oben, und kein Fall ist mehr offen: jeder Restfall ist entschieden (übernommen,
 *                             bewusst ausgeschlossen mit ReasonCode oder durch Regel abgelöst)
 *
 * Nicht belegbare Inhalte bleiben ausgeschlossen (`resolved-excluded`); das ist kein Blocker. Sim-Quellenlücken werden
 * getrennt ausgewiesen und sind nie Blocker des Ausgangsrechtsstands (docs/SIMULATION_IMPORT.md 6.1).
 *
 *   node scripts/nsh-freeze-readiness.ts [--write] [--json] [--base <ref>]
 *
 * `--write` schreibt docs/NSH_BASELINE_FREEZE_READINESS.md, docs/NSH_BASELINE_HUMAN_APPROVAL.md,
 * data/audits/juris-sh/freeze-readiness.json und den Baseline-Status in packages/legal-core/src/config/inventory-status.json.
 * `--base` (Standard HEAD) liefert den Vorher-Stand der Review-Fälle aus dem Git-Stand.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { ANNEX_GAP_GROUPS, ANNEX_GAP_LABELS, annexGapGroupsFromCache } from '@landesrecht/importer-juris-sh/reports/annex-gaps.ts';
import { classifyReviewCase, readClassDecisions, type CaseClass } from '@landesrecht/importer-juris-sh/reports/review-classes.ts';
import { REVIEW_REASON_CODES } from '@landesrecht/importer-juris-sh/common/review.ts';
import { TRANSFORMER_VERSION } from '@landesrecht/importer-juris-sh/transform/rules.ts';
import { readBaselineLockFile, seedsFor } from '@landesrecht/importer-simulation/common/baseline-locks.ts';

import { versionTableFingerprints } from './lib/table-fingerprints.ts';

const root = resolveRepositoryRoot();
const args = process.argv.slice(2);
const write = args.includes('--write');
const asJson = args.includes('--json');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1]! : 'HEAD';

export const FREEZE_READINESS_SCHEMA = 'juris-sh-freeze-readiness/2';
const DOC_PATH = 'docs/NSH_BASELINE_FREEZE_READINESS.md';
const APPROVAL_PATH = 'docs/NSH_BASELINE_HUMAN_APPROVAL.md';
const JSON_PATH = 'data/audits/juris-sh/freeze-readiness.json';
const REVIEW_DIR = 'data/imports/juris-sh/review';
const MANIFEST_DIR = 'data/imports/juris-sh/manifest';
const MISSING_SOURCE_CODES = new Set(['missing-normative-annex', 'missing-normative-text', 'source-deficiency', 'annex-parent-unresolved']);

type Status = 'NOT READY' | 'READY WITH HUMAN REVIEW' | 'BASELINE READY';

interface ReviewItem {
  id: string;
  key: string;
  category: string;
  status: string;
  occurrence?: string;
  summary?: string;
  details: string[];
  decision?: { decision: string; reasonCode?: string; classDecision?: string; reason: string; decidedBy?: string; decidedAt?: string };
}
interface Shard {
  sourceArea: string;
  sourceIdentity: string;
  items: ReviewItem[];
}
type Item = ReviewItem & { sourceIdentity: string; sourceArea: string };

const git = (...parameters: string[]): string => execFileSync('git', parameters, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024 });
const readJson = <T>(path: string): T | undefined => (existsSync(join(root, path)) ? (JSON.parse(readFileSync(join(root, path), 'utf8')) as T) : undefined);
const number = new Intl.NumberFormat('de-DE');
const count = <T>(values: readonly T[], key: (value: T) => string): Array<[string, number]> => {
  const map = new Map<string, number>();
  for (const value of values) map.set(key(value), (map.get(key(value)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/* ------------------------------------------------------------------------------------------------ */
/* Review-Fälle (jetzt und im Basis-Commit)                                                         */

function readShards(): Shard[] {
  const shards: Shard[] = [];
  for (const area of ['landesrecht', 'vwv']) {
    const directory = join(root, REVIEW_DIR, area);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) shards.push(JSON.parse(readFileSync(join(directory, file), 'utf8')) as Shard);
  }
  return shards;
}

function readShardsAt(reference: string): Shard[] | undefined {
  let listing: string;
  try {
    listing = git('ls-tree', '-r', reference, '--', REVIEW_DIR);
  } catch {
    return undefined;
  }
  const blobs = listing.split('\n').filter(Boolean).map((line) => line.split(/\s+/u)[2]!);
  if (blobs.length === 0) return [];
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${blobs.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const shards: Shard[] = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    const size = Number(output.subarray(offset, headerEnd).toString('utf8').split(' ')[2]);
    shards.push(JSON.parse(output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8')) as Shard);
    offset = headerEnd + 1 + size + 1;
  }
  return shards;
}

const allItems = (shards: readonly Shard[]): Item[] => shards.flatMap((shard) => shard.items.map((item) => ({ ...item, sourceIdentity: shard.sourceIdentity, sourceArea: shard.sourceArea })));

/* ------------------------------------------------------------------------------------------------ */
/* Bestand                                                                                          */

interface ManifestEntry {
  sourceIdentity: string;
  sourceArea: string;
  sourceTitle?: string;
  importStatus: string;
  targetSlug?: string;
  baselineRecoveryMethod?: string;
  partOf?: string;
}

function readManifestEntries(): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const area of ['landesrecht', 'vwv']) {
    const directory = join(root, MANIFEST_DIR, area);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) entries.push((JSON.parse(readFileSync(join(directory, file), 'utf8')) as { entry: ManifestEntry }).entry);
  }
  return entries;
}

interface ContentStats {
  baselineNorms: number;
  simulationNorms: number;
  byType: Array<[string, number]>;
  tableNorms: number;
  tables: number;
  withSimulationVersions: string[];
  /** SHA-256 über die sortierte Liste „Pfad SHA-256“ aller Ausgangsfassungen des juris-Bestands. */
  fingerprint: string;
}

function contentStats(): ContentStats {
  const directory = join(root, 'content/norms/nsh');
  const stats: ContentStats = { baselineNorms: 0, simulationNorms: 0, byType: [], tableNorms: 0, tables: 0, withSimulationVersions: [], fingerprint: '' };
  const types: string[] = [];
  const lines: string[] = [];
  for (const slug of readdirSync(directory).filter((name) => !name.startsWith('.')).sort()) {
    const meta = JSON.parse(readFileSync(join(directory, slug, 'meta.json'), 'utf8')) as { type?: string; externalIdentifiers?: Array<{ system: string }> };
    if (!(meta.externalIdentifiers ?? []).some((identifier) => identifier.system === 'juris-sh')) {
      stats.simulationNorms += 1;
      continue;
    }
    stats.baselineNorms += 1;
    types.push(meta.type ?? 'unbekannt');
    const versions = readdirSync(join(directory, slug, 'versions')).filter((file) => file.endsWith('.json'));
    if (versions.some((file) => file !== '2023-12-01.json')) stats.withSimulationVersions.push(slug);
    const baseline = join(directory, slug, 'versions', '2023-12-01.json');
    const text = readFileSync(baseline);
    lines.push(`content/norms/nsh/${slug}/versions/2023-12-01.json ${createHash('sha256').update(text).digest('hex')}`);
    const fingerprints = versionTableFingerprints(JSON.parse(text.toString('utf8')) as { body?: [] });
    if (fingerprints.length > 0) {
      stats.tableNorms += 1;
      stats.tables += fingerprints.length;
    }
  }
  stats.byType = count(types, (type) => type);
  stats.fingerprint = createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
  return stats;
}

/* ------------------------------------------------------------------------------------------------ */

const manifest = readManifestEntries();
const titles = new Map(manifest.map((entry) => [entry.sourceIdentity, entry.sourceTitle ?? '']));
const items = allItems(readShards());
const open = items.filter((item) => item.status === 'open' && item.occurrence !== 'not-reproduced');
const annexGroups = new Map([...annexGapGroupsFromCache(root, open, manifest).entries()].map(([id, entry]) => [id, entry.group]));
const classified = open.map((item) => ({ item, klass: classifyReviewCase(item as Parameters<typeof classifyReviewCase>[0], annexGroups.get(item.id)) }));
const excluded = items.filter((item) => item.status === 'resolved-excluded');
const beforeItems = (() => {
  const shards = readShardsAt(base);
  return shards ? allItems(shards) : undefined;
})();
// Vorher-Stand wie in Lauf 16 gezählt: alle offenen Fälle (auch nicht mehr reproduzierte, die der Importer inzwischen ablöst).
const beforeOpen = beforeItems?.filter((item) => item.status === 'open');
const beforeOpenIds = new Set((beforeOpen ?? []).map((item) => item.id));
const importedIds = new Set(manifest.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').map((entry) => entry.sourceIdentity));
// Vorher offene Fälle, die dieser Stand erledigt: übernommen (Dokument jetzt im Bestand), ausgeschlossen (Entscheidung) oder
// durch eine Regel abgelöst (Befund tritt nicht mehr auf, Dokument weiter nicht übernommen).
const nowById = new Map(items.map((item) => [item.id, item]));
const resolvedFromBefore = [...beforeOpenIds].map((id) => ({ id, before: beforeOpen!.find((item) => item.id === id)!, now: nowById.get(id) })).filter((entry) => !entry.now || entry.now.status !== 'open' || entry.now.occurrence === 'not-reproduced');
const resolvedImported = resolvedFromBefore.filter((entry) => importedIds.has(entry.before.sourceIdentity) && entry.now?.status !== 'resolved-excluded');
const resolvedExcluded = resolvedFromBefore.filter((entry) => entry.now?.status === 'resolved-excluded');
const resolvedOther = resolvedFromBefore.filter((entry) => !resolvedImported.includes(entry) && !resolvedExcluded.includes(entry));

const content = contentStats();
const imported = manifest.filter((entry) => importedIds.has(entry.sourceIdentity));
const recovery = count(imported, (entry) => entry.baselineRecoveryMethod ?? 'current-source');
const statuses = count(manifest, (entry) => entry.importStatus);

const audit = readJson<{ ok: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> }>('data/audits/juris-sh/audit.json');
const readiness = readJson<{ status: string; ready: boolean }>('data/audits/juris-sh/readiness.json');
const searchFull = readJson<{ ok: boolean; norms: number; searchUnits: number }>('data/audits/juris-sh/search/search-audit-full.json');
const d1 = readJson<{ checkedAt: string; differences: number; database: string; sampleSize: number }>('data/audits/juris-sh/d1/D1_REMOTE_CHECK.json');
const r2 = readJson<{ stage: { entries: number; objects: number; conflicts: unknown[]; missingCache: unknown[] }; sync: { missingStaging: unknown[] } }>('data/audits/juris-sh/R2_STAGING.json');
const coverage = readJson<{ integrity: Record<string, number>; imported: number }>('data/audits/juris-sh/coverage.json');
const completeness = readJson<{ status: string; series: Array<{ knownIssues: string[]; presentIssues: string[]; missingIssues: string[] }> }>('data/simulation/nsh/completeness.json');
const exceptions = readJson<{ baseCommit: string; entries: Array<{ key: string }>; releases?: Array<{ baseCommit: string; entries: Array<{ key: string }> }> }>('data/content-immutability-exceptions.json');
const classDecisions = await readClassDecisions(root);
const lockFile = await readBaselineLockFile(root);
const seeds = lockFile ? [...seedsFor(lockFile, 'nsh').values()] : [];
const nshLock = lockFile?.jurisdictions.nsh;

const gates: Array<{ id: string; ok: boolean; detail: string }> = [
  { id: 'audit', ok: audit?.ok === true, detail: audit ? `${audit.checks.filter((check) => check.ok).length}/${audit.checks.length} Prüfungen` : 'kein Bericht' },
  { id: 'readiness', ok: readiness?.ready === true, detail: readiness?.status ?? 'kein Bericht' },
  { id: 'search-audit-full', ok: searchFull?.ok === true, detail: searchFull ? `${number.format(searchFull.norms)} Normen, ${number.format(searchFull.searchUnits)} Sucheinheiten` : 'kein Bericht' },
  { id: 'd1-remote', ok: d1?.differences === 0, detail: d1 ? `${d1.database}, Stichprobe ${d1.sampleSize}, ${d1.differences} Abweichungen (${d1.checkedAt.slice(0, 10)})` : 'kein Bericht' },
  { id: 'r2', ok: Boolean(r2 && r2.stage.conflicts.length === 0 && r2.stage.missingCache.length === 0 && r2.sync.missingStaging.length === 0), detail: r2 ? `${number.format(r2.stage.entries)} Einträge, ${number.format(r2.stage.objects)} Objekte, Konflikte ${r2.stage.conflicts.length}` : 'kein Bericht' },
  { id: 'published-integrity', ok: (coverage?.imported ?? 0) === content.baselineNorms, detail: `übernommen nur exact oder erklärt; Manifest ${number.format(coverage?.imported ?? 0)} = Bestand ${number.format(content.baselineNorms)}` },
  { id: 'contradictory-evidence', ok: !open.some((item) => item.category === 'contradictory-evidence'), detail: `${open.filter((item) => item.category === 'contradictory-evidence').length} offen (muss 0 sein)` },
];

const byClass = (klass: CaseClass): typeof classified => classified.filter((entry) => entry.klass.class === klass);
const technical = byClass('technical-blocker');
const human = byClass('human-decision');
const nonBlocking = byClass('non-blocking');
const failedGates = gates.filter((gate) => !gate.ok);
const status: Status = technical.length > 0 || failedGates.length > 0 ? 'NOT READY' : open.length > 0 ? 'READY WITH HUMAN REVIEW' : 'BASELINE READY';
const documents = (list: ReadonlyArray<{ sourceIdentity: string }>): number => new Set(list.map((entry) => entry.sourceIdentity)).size;
const groups = (list: typeof classified): Array<{ group: string; label: string; cases: number; documents: number; decision: string; examples: string[] }> => {
  const map = new Map<string, typeof classified>();
  for (const entry of list) map.set(entry.klass.group, [...(map.get(entry.klass.group) ?? []), entry]);
  return [...map.entries()].map(([group, entries]) => ({ group, label: entries[0]!.klass.label, cases: entries.length, documents: documents(entries.map((entry) => entry.item)), decision: entries[0]!.klass.decision, examples: [...new Set(entries.map((entry) => entry.item.sourceIdentity))].slice(0, 6) })).sort((a, b) => b.cases - a.cases);
};
const exclusionsByCode = REVIEW_REASON_CODES.map((code) => [code, excluded.filter((item) => item.decision?.reasonCode === code)] as const).filter(([, list]) => list.length > 0);
const excludedDocuments = (predicate: (item: Item) => boolean): string[] => [...new Set(excluded.filter(predicate).map((item) => item.sourceIdentity))].sort();
const missingSourceExclusions = excluded.filter((item) => MISSING_SOURCE_CODES.has(item.decision?.reasonCode ?? ''));

const result = {
  schemaVersion: FREEZE_READINESS_SCHEMA,
  jurisdiction: 'nsh',
  baselineDate: '2023-12-01',
  freezeSet: nshLock?.freeze === true,
  status,
  baselineFingerprint: content.fingerprint,
  counts: {
    openBefore: beforeOpen?.length ?? null,
    open: open.length,
    openDocuments: documents(open),
    technicalBlockers: technical.length,
    openHumanDecisions: human.length,
    nonBlocking: nonBlocking.length,
    resolvedExcluded: excluded.length,
    resolvedExcludedDocuments: documents(excluded),
    missingSourceExclusions: missingSourceExclusions.length,
    resolvedSinceBase: { imported: resolvedImported.length, excluded: resolvedExcluded.length, byRule: resolvedOther.length },
  },
  gates,
  technicalBlockers: groups(technical),
  openHumanDecisions: groups(human),
  nonBlocking: groups(nonBlocking),
  exclusions: Object.fromEntries(exclusionsByCode.map(([code, list]) => [code, { cases: list.length, documents: documents(list) }])),
  content: { ...content, withSimulationVersions: content.withSimulationVersions },
  manifest: { statuses, recovery },
  seeds: seeds.map((seed) => ({ slug: seed.slug, sha256: seed.sha256, sourceCommit: seed.sourceCommit })),
  transformerVersion: TRANSFORMER_VERSION,
  simulationSources: completeness?.status ?? 'unbekannt',
};

if (asJson) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`NSH-Freeze-Readiness: ${status} (Freeze ${result.freezeSet ? 'gesetzt' : 'nicht gesetzt'}) · Baseline-Fingerabdruck ${content.fingerprint.slice(0, 16)}…`);
  console.log(`  offen ${open.length}${beforeOpen ? ` (vorher ${beforeOpen.length})` : ''}: technische Blocker ${technical.length}, offene fachliche Entscheidungen ${human.length}, nicht sperrend ${nonBlocking.length}; bewusst ausgeschlossen ${excluded.length} (${documents(excluded)} Dokumente)`);
  console.log(`  seit Basis erledigt: übernommen ${resolvedImported.length}, ausgeschlossen ${resolvedExcluded.length}, durch Regel abgelöst ${resolvedOther.length}`);
  for (const gate of gates) console.log(`  Gate ${gate.id}: ${gate.ok ? 'ok' : 'ROT'} – ${gate.detail}`);
  for (const group of result.technicalBlockers) console.log(`  Blocker: ${group.label} – ${group.cases} Fälle`);
  for (const group of result.openHumanDecisions) console.log(`  offen: ${group.label} – ${group.cases} Fälle`);
}

if (write) {
  const table = (header: string[], rows: Array<Array<string | number>>): string => [`| ${header.join(' | ')} |`, `| ${header.map((_, index) => (rows.length > 0 && rows.every((row) => typeof row[index] === 'number') ? '---:' : '---')).join(' | ')} |`, ...rows.map((row) => `| ${row.map((cell) => (typeof cell === 'number' ? number.format(cell) : cell)).join(' | ')} |`)].join('\n');
  const groupTable = (list: ReturnType<typeof groups>): string => (list.length === 0 ? 'keine' : table(['Gruppe', 'Fälle', 'Dokumente', 'Entscheidung', 'Beispiele'], list.map((entry) => [entry.label, entry.cases, entry.documents, entry.decision, entry.examples.join(', ')])));
  const baseShort = base === 'HEAD' ? git('rev-parse', '--short', 'HEAD').trim() : base;
  const categoriesNow = new Map(count(open, (item) => item.category));
  const categoriesBefore = beforeOpen ? new Map(count(beforeOpen, (item) => item.category)) : undefined;
  const categories = [...new Set([...categoriesNow.keys(), ...(categoriesBefore?.keys() ?? [])])].sort();
  const readinessDoc = [
    '# Freeze-Readiness des NSH-Ausgangsrechtsstands',
    '',
    `Automatisch erzeugt von \`node scripts/nsh-freeze-readiness.ts --write\` (Arbeitskopie; Vorher-Stand: Review-Fälle im Commit \`${baseShort}\`). Nicht von Hand bearbeiten; Freeze-Semantik: \`docs/SIMULATION_IMPORT.md\` 6.1, Rückwirkung 6.2. Freigabeübersicht: \`docs/NSH_BASELINE_HUMAN_APPROVAL.md\`.`,
    '',
    `**Status: ${status}** · Freeze ${result.freezeSet ? 'gesetzt' : '**nicht gesetzt**'} · Baseline-Fingerabdruck \`${content.fingerprint}\` · Sim-Quellenstatus getrennt: \`${result.simulationSources}\` (kein Blocker des Ausgangsrechtsstands)`,
    '',
    'Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist. `READY WITH HUMAN REVIEW`: keine technischen Blocker, veröffentlichte Baseline konsistent, alle offenen Fälle klassifiziert. `BASELINE READY`: zusätzlich kein offener Fall – jeder Restfall ist übernommen, mit ReasonCode bewusst ausgeschlossen (`resolved-excluded`) oder durch eine Regel abgelöst. Nicht belegbare Inhalte bleiben ausgeschlossen; das ist kein Blocker. Der Freeze selbst wird nur auf ausdrückliche Entscheidung gesetzt.',
    '',
    '## 1 Übersicht',
    '',
    table(['Kennzahl', 'Wert'], [
      ['technische Blocker', technical.length],
      ['offene fachliche Entscheidungen', human.length],
      ['bewusst ausgeschlossene Fälle (resolved-excluded)', excluded.length],
      ['davon fehlende Quellen (Anlage, Text, Quellmangel, Zuordnung)', missingSourceExclusions.length],
      ['Baseline-Normen im Bestand (übernommen)', content.baselineNorms],
      ['offene Fälle vorher → jetzt', beforeOpen ? `${number.format(beforeOpen.length)} → ${number.format(open.length)}` : number.format(open.length)],
      ['seit Basis erledigt: übernommen / ausgeschlossen / durch Regel abgelöst', `${number.format(resolvedImported.length)} / ${number.format(resolvedExcluded.length)} / ${number.format(resolvedOther.length)}`],
    ]),
    '',
    '## 2 Bestand',
    '',
    table(['Kennzahl', 'Wert'], [
      ['Baseline-Normen (juris, Ausgangsrechtsstand)', content.baselineNorms],
      ['davon mit Sim-Folgefassungen', content.withSimulationVersions.length],
      ['per-Norm-Seeds (gelockte Sim-Ziele)', seeds.length],
      ['eigene Normen der Simulation (nicht Baseline)', content.simulationNorms],
      ['Normen mit Tabellen / Tabellen (Ausgangsfassung)', `${number.format(content.tableNorms)} / ${number.format(content.tables)}`],
    ]),
    '',
    `Normtypen: ${content.byType.map(([type, value]) => `${type} ${number.format(value)}`).join(' · ')}. Herkunft der Stichtagsfassung: ${recovery.map(([key, value]) => `${key === 'current-source' ? 'heutige Ausgabe (exakt)' : key === 'historical-juris-version' ? 'aus juris-Einzelfassungen' : key} ${number.format(value)}`).join(' · ')}. Manifest: ${statuses.map(([key, value]) => `${key} ${number.format(value)}`).join(' · ')}. Textintegrität (Vollkorpus): ${coverage ? Object.entries(coverage.integrity).map(([key, value]) => `${key} ${number.format(value)}`).join(' · ') : '–'}.`,
    '',
    '## 3 Offene Fälle nach Kategorie',
    '',
    table(['Kategorie', ...(categoriesBefore ? ['vorher'] : []), 'jetzt'], categories.map((category) => [category, ...(categoriesBefore ? [categoriesBefore.get(category) ?? 0] : []), categoriesNow.get(category) ?? 0])),
    '',
    '### 3.1 Technische Blocker',
    '',
    groupTable(result.technicalBlockers),
    '',
    '### 3.2 Offene fachliche Entscheidungen',
    '',
    groupTable(result.openHumanDecisions),
    '',
    '### 3.3 Nicht sperrend',
    '',
    groupTable(result.nonBlocking),
    '',
    '## 4 Bewusst ausgeschlossen (resolved-excluded)',
    '',
    exclusionsByCode.length === 0 ? 'keine' : table(['ReasonCode', 'Fälle', 'Dokumente'], exclusionsByCode.map(([code, list]) => [`\`${code}\``, list.length, documents(list)])),
    '',
    `Anlagen-Untergruppen der offenen Fälle: ${ANNEX_GAP_GROUPS.map((group) => `${ANNEX_GAP_LABELS[group]} ${[...annexGroups.values()].filter((entry) => entry === group).length}`).join(' · ')}.`,
    '',
    '## 5 Gates',
    '',
    table(['Gate', 'Ergebnis', 'Detail'], gates.map((gate) => [gate.id, gate.ok ? 'grün' : '**rot**', gate.detail])),
    '',
    '## 6 Seeds, Ausnahmen, Sim-Quellen',
    '',
    `- Baseline-Lock NSH: Referenz-Commit \`${nshLock?.commit.slice(0, 12) ?? '–'}\`, Freeze ${nshLock?.freeze ? 'gesetzt' : 'nicht gesetzt'}; Seeds: ${seeds.map((seed) => `\`${seed.slug}\``).join(', ') || 'keine'}. LBO: \`data/simulation/nsh/lbo-baseline-seed-decision.md\`.`,
    `- Freigabeblöcke der Unveränderlichkeit (NSH-Einträge): ${[exceptions, ...(exceptions?.releases ?? [])].filter(Boolean).map((block) => `\`${block!.baseCommit}\` ${block!.entries.filter((entry) => entry.key.startsWith('nsh/')).length}`).join(' · ') || 'keine'}.`,
    `- Sim-Quellenstatus \`${completeness?.status ?? '–'}\`: ${completeness ? completeness.series.map((series) => `${series.presentIssues.length}/${series.knownIssues.length} Ausgaben`).join('; ') : '–'} – betrifft die Fortschreibung, nicht den Ausgangsrechtsstand.`,
    '',
  ];

  const ruleOf = (id: string | undefined) => classDecisions?.rules.find((rule) => rule.id === id);
  const docList = (ids: readonly string[], limit = 400): string => (ids.length === 0 ? 'keine' : ids.slice(0, limit).map((id) => `\`${id}\``).join(', ') + (ids.length > limit ? ` … (+${ids.length - limit})` : ''));
  const validityRule = ruleOf('baseline-validity-unresolved');
  const tableExclusions = excludedDocuments((item) => item.decision?.reasonCode === 'unsafe-table-structure');
  const annexExclusions = excludedDocuments((item) => item.decision?.reasonCode === 'missing-normative-annex' || item.decision?.reasonCode === 'annex-parent-unresolved');
  const withdrawals = excludedDocuments((item) => item.decision?.reasonCode === 'not-at-baseline');
  const approval = [
    '# NSH-Ausgangsrechtsstand – Freigabeübersicht für den Baseline-Freeze',
    '',
    `Automatisch erzeugt von \`node scripts/nsh-freeze-readiness.ts --write\`. Freeze-Readiness: **${status}**. Der Freeze ist **nicht gesetzt**; er wird mit einer einzigen Entscheidung freigegeben (unten).`,
    '',
    '## Freizugebender Bestand',
    '',
    table(['Kennzahl', 'Wert'], [
      ['Baseline-Normen', content.baselineNorms],
      ...recovery.map(([key, value]): [string, number] => [key === 'current-source' ? 'Stichtagsfassung exakt aus der heutigen Ausgabe' : key === 'historical-juris-version' ? 'Stichtagsfassung aus juris-Einzelfassungen zusammengesetzt' : key, value]),
      ['Normen mit Tabellen / Tabellen', `${number.format(content.tableNorms)} / ${number.format(content.tables)}`],
      ['davon durch die Simulation fortgeschrieben (Seeds)', seeds.length],
    ]),
    '',
    `**Fingerabdruck des Baselinebestands:** \`${content.fingerprint}\` – SHA-256 über die sortierte Liste „Pfad SHA-256“ aller \`content/norms/nsh/<slug>/versions/2023-12-01.json\` des juris-Bestands (${number.format(content.baselineNorms)} Dateien).`,
    '',
    '## Offene fachliche Entscheidungen',
    '',
    human.length === 0 ? 'keine' : table(['Dokument', 'Titel', 'Gruppe', 'Befund'], human.map(({ item, klass }) => [`\`${item.sourceIdentity}\``, (titles.get(item.sourceIdentity) ?? '').slice(0, 70), klass.label, (item.details[0] ?? item.summary ?? '').replace(/\|/gu, '/').slice(0, 220)])),
    '',
    'Diese Dokumente sind nicht veröffentlicht; sie sperren den Freeze nicht, bleiben aber offen, bis entschieden ist.',
    '',
    '## Bewusst ausgeschlossen (nicht veröffentlicht, auditierbar, bei neuer Evidenz wieder offen)',
    '',
    exclusionsByCode.length === 0 ? 'keine' : table(['ReasonCode', 'Fälle', 'Dokumente', 'Entscheidung'], exclusionsByCode.map(([code, list]) => [`\`${code}\``, list.length, documents(list), ruleOf(list[0]!.decision?.classDecision)?.reference ?? (list[0]!.decision?.decidedBy ?? '–')])),
    '',
    `**Tabellen-Exclusions** (${tableExclusions.length} Dokumente, Tabellenstruktur nicht eindeutig; kein Fallback „Text ohne Tabelle“): ${docList(tableExclusions)}`,
    '',
    `**Anlagen-Exclusions** (${annexExclusions.length} Dokumente, normative Anlage fehlt bzw. Stammnorm nicht belegt; keine OCR): ${docList(annexExclusions)}`,
    '',
    '## Ungelöste Quellenlücken',
    '',
    `${number.format(missingSourceExclusions.length)} Fälle in ${documents(missingSourceExclusions)} Dokumenten mit fehlender Quelle (\`missing-normative-annex\`, \`missing-normative-text\`, \`source-deficiency\`, \`annex-parent-unresolved\`) und ${number.format(excluded.filter((item) => item.decision?.reasonCode === 'baseline-validity-unresolved').length)} Geltungsfälle ohne belegbare Stichtagsfassung. Sie bleiben ausgeschlossen, bis neue Evidenz (amtliche Veröffentlichung, zugängliche Anlage) vorliegt.`,
    '',
    '### Geltungs- und Historienfälle (einzeln geprüft)',
    '',
    'Übernommen durch belegte Regeln: `jlr-NNLSH00002AD5` (Rundfunkfinanzierungsstaatsvertrag § 9: jüngere offene Fassung löst die ältere mit nicht nachgeführtem Ende ab), `jlr-NNLSH00002BD8` (Landwirtschaftskammergesetz: nahtlos fortgeführter Ressort-Zwilling maßgeblich), `jlr-NNLSH00002AC2` (Geschäftsordnung des Landtages) und `jlr-NNLSH00002AE9` (StrWG): eingefügte Paragraphen innerhalb eines §-Laufs eingeordnet.',
    '',
    validityRule?.evidence ? table(['Dokument', 'Titel', 'Beleglage', 'Entscheidung'], Object.entries(validityRule.evidence).map(([id, note]) => [`\`${id}\``, (titles.get(id) ?? '').slice(0, 70), note, '`baseline-validity-unresolved`'])) : '–',
    '',
    '## Akzeptierte Transformationsregeln',
    '',
    `Transformer \`${TRANSFORMER_VERSION}\` (\`docs/SCHLESWIG_HOLSTEIN_TRANSFORMATION.md\`): Landesname und Adjektiv → Niedersachsen-Holstein; belegte Normabkürzungen „… SH“ → „… NSH“ (Quellabkürzung bleibt als \`amtliche-abkuerzung-sh\`); 1.5.0: „SH“ an einer Normabkürzung oder Normbezeichnung („DSG SH“, „SH-BeamtVG“, „Mitbestimmungsgesetz Schl.-H.“) und als Landesbezug („in SH“) → „NSH“; Eigen-, Programm- und Systemnamen („Krebsregister SH“, „Standard-IT SH“), Aktenzeichen, Fundstellen, Blattnamen, Quellzitate, historische Namen, externe Kennungen und fehlerhafte Quellformen bleiben unverändert; nicht eindeutige Kürzel bleiben in Quellform. Keine Sim-Behörde erfunden.`,
    '',
    '## Akzeptierte Rücknahmen',
    '',
    `Nach dem 01.12.2023 ausgefertigte, nur rückwirkend in Kraft gesetzte Normen gehören nicht zum Ausgangsrechtsstand (\`docs/SIMULATION_IMPORT.md\` 6.2): ${docList(withdrawals)} (Spielbankabgabenverordnung 2025, EFGSH 2024); dazu zwölf 2024 erlassene, rückwirkende Verwaltungsvorschriften (nicht am Stichtag).`,
    '',
    '## Seeds und LBO',
    '',
    table(['Norm', 'Seed SHA-256', 'Quell-Commit'], seeds.map((seed) => [`\`${seed.slug}\``, `\`${seed.sha256.slice(0, 16)}…\``, seed.sourceCommit ? `\`${seed.sourceCommit.slice(0, 9)}\`` : '–'])),
    '',
    '`lbo-nsh`: bisheriger Seed bleibt maßgeblich; die Bulk-Ausgabe ist nur ein anderer Parserausstoß ohne stärkere Evidenz (`data/simulation/nsh/lbo-baseline-seed-decision.md`). Alle Sim-Rezepte sind aus den Seeds reproduzierbar (Gate G4).',
    '',
    '## Entscheidung',
    '',
    `Mit der Freigabe gilt: \`data/simulation/baseline-locks.json\` → \`jurisdictions.nsh\` = \`{ "commit": "<Commit dieses Stands>", "freeze": true }\` für den Bestand mit dem Fingerabdruck \`${content.fingerprint}\`. Danach ändert sich eine NSH-Ausgangsfassung nur noch als Bugfix, mit neuer Evidenz, als Review-Entscheidung oder Schema-Upgrade (wie West); Sim-Fortschreibung bleibt davon unberührt.`,
    '',
  ];
  await mkdir(dirname(join(root, DOC_PATH)), { recursive: true });
  await writeFile(join(root, DOC_PATH), `${readinessDoc.join('\n')}\n`);
  await writeFile(join(root, APPROVAL_PATH), `${approval.join('\n')}\n`);
  await mkdir(dirname(join(root, JSON_PATH)), { recursive: true });
  await writeFile(join(root, JSON_PATH), `${JSON.stringify({ ...result, generatedFrom: base }, null, 2)}\n`);
  const statusPath = join(root, 'packages/legal-core/src/config/inventory-status.json');
  const statusFile = JSON.parse(readFileSync(statusPath, 'utf8')) as { schemaVersion: string; jurisdictions: Record<string, Record<string, unknown>> };
  const assessedAt = new Date().toISOString().slice(0, 10);
  for (const [jurisdiction, lock] of Object.entries(lockFile?.jurisdictions ?? {})) {
    const entry = statusFile.jurisdictions[jurisdiction];
    if (!entry) continue;
    entry.baselineFreeze = lock.freeze ? { frozen: true, assessedAt } : jurisdiction === 'nsh' ? { frozen: false, readiness: status, assessedAt } : { frozen: false, assessedAt };
  }
  await writeFile(statusPath, `${JSON.stringify(statusFile, null, 2)}\n`);
  console.log(`Geschrieben: ${DOC_PATH}, ${APPROVAL_PATH}, ${JSON_PATH}, Baseline-Status in packages/legal-core/src/config/inventory-status.json`);
}
