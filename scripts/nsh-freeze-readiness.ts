#!/usr/bin/env node
/**
 * Freeze-Readiness des NSH-Ausgangsrechtsstands (Run 16). Berechnet – ohne einen Freeze zu setzen – ob der reale
 * Ausgangsrechtsstand zum Stichtag eingefroren werden könnte:
 *
 *   NOT READY                 technische Blocker offen (Regression, Integrität, Parser, gescheiterte Gates)
 *   READY WITH HUMAN REVIEW   keine technischen Blocker, aber offene fachliche Entscheidungen
 *   BASELINE READY            weder technische Blocker noch offene sperrende Entscheidungen
 *
 * Grundlage: Review-Shards, Manifest, content/norms/nsh, Baseline-Locks, Freigabedateien und die zuletzt geschriebenen
 * Audit-Berichte; die Anlagen-Untergruppen aus der PDF-Ausgabe im Cache (kein Netz). Sim-Quellenlücken werden getrennt
 * ausgewiesen und sind nie Blocker des Ausgangsrechtsstands (docs/SIMULATION_IMPORT.md, Freeze-Semantik).
 *
 *   node scripts/nsh-freeze-readiness.ts [--write] [--json] [--base <ref>]
 *
 * `--write` schreibt docs/NSH_BASELINE_FREEZE_READINESS.md und data/audits/juris-sh/freeze-readiness.json.
 * `--base` (Standard HEAD) liefert den Vorher-Stand der Review-Fälle aus dem Git-Stand.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolveRepositoryRoot } from '@landesrecht/legal-core/lib/repository-root.ts';
import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { pdfExportUrl } from '@landesrecht/importer-juris-sh/export/client.ts';
import { layoutFromPdf } from '@landesrecht/importer-juris-sh/parse/pdf-layout.ts';
import { parseJurisPdf, type ParsedJurisPdf } from '@landesrecht/importer-juris-sh/parse/juris-pdf.ts';
import { ANNEX_GAP_GROUPS, ANNEX_GAP_LABELS, classifyAnnexGap, type AnnexGapCase, type AnnexGapGroup } from '@landesrecht/importer-juris-sh/reports/annex-gaps.ts';
import { readBaselineLockFile, seedsFor } from '@landesrecht/importer-simulation/common/baseline-locks.ts';

import { versionTableFingerprints } from './lib/table-fingerprints.ts';

const root = resolveRepositoryRoot();
const args = process.argv.slice(2);
const write = args.includes('--write');
const asJson = args.includes('--json');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1]! : 'HEAD';

export const FREEZE_READINESS_SCHEMA = 'juris-sh-freeze-readiness/1';
const DOC_PATH = 'docs/NSH_BASELINE_FREEZE_READINESS.md';
const JSON_PATH = 'data/audits/juris-sh/freeze-readiness.json';
const REVIEW_DIR = 'data/imports/juris-sh/review';
const MANIFEST_DIR = 'data/imports/juris-sh/manifest';

type Status = 'NOT READY' | 'READY WITH HUMAN REVIEW' | 'BASELINE READY';
type CaseClass = 'technical-blocker' | 'human-decision' | 'non-blocking';

interface ReviewItem {
  id: string;
  key: string;
  category: string;
  status: string;
  summary?: string;
  details?: string | string[];
}
interface Shard {
  sourceArea: string;
  sourceIdentity: string;
  items: ReviewItem[];
}
interface ClassifiedCase {
  id: string;
  sourceIdentity: string;
  category: string;
  key: string;
  class: CaseClass;
  group: string;
  decision: string;
}

const git = (...parameters: string[]): string => execFileSync('git', parameters, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024 });
const readJson = <T>(path: string): T | undefined => (existsSync(join(root, path)) ? (JSON.parse(readFileSync(join(root, path), 'utf8')) as T) : undefined);
const detailsOf = (item: ReviewItem): string => (Array.isArray(item.details) ? item.details.join(' | ') : item.details ?? '');
const count = <T>(values: readonly T[], key: (value: T) => string): Array<[string, number]> => {
  const map = new Map<string, number>();
  for (const value of values) map.set(key(value), (map.get(key(value)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const number = new Intl.NumberFormat('de-DE');

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
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${blobs.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 }).toString('utf8');
  const shards: Shard[] = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf('\n', offset);
    const size = Number(output.slice(offset, headerEnd).split(' ')[2]);
    const body = Buffer.from(output.slice(headerEnd + 1)).subarray(0, size).toString('utf8');
    shards.push(JSON.parse(body) as Shard);
    offset = headerEnd + 1 + body.length + 1;
  }
  return shards;
}

const openItems = (shards: readonly Shard[]): Array<ReviewItem & { sourceIdentity: string; sourceArea: string }> => shards.flatMap((shard) => shard.items.filter((item) => item.status === 'open').map((item) => ({ ...item, sourceIdentity: shard.sourceIdentity, sourceArea: shard.sourceArea })));

/* ------------------------------------------------------------------------------------------------ */
/* Klassifikation                                                                                   */

function abbreviationGroup(details: string): string {
  const contexts = [...details.matchAll(/Kontext: „([^“]*)“/gu)].map((match) => match[1]!);
  const context = contexts.join(' ');
  if (/\b(?:Amtsbl(?:att)?|GVOBl)\.?\s+(?:für\s+)?SH\b/u.test(context)) return 'Verkündungsblatt mit Landeskürzel';
  if (/(?:\bSH[-.\s]?[A-ZÄÖÜ][A-Za-zÄÖÜäöü]*(?:G|VO|V|O)\b|\b[A-ZÄÖÜ][A-Za-zÄÖÜäöü]*(?:G|VO|V|O|AbgG|KitaG)[-\s]+SH\b|\bSH\.\s?LVO\b|gesetz(?:es)?[-\s]SH\b|verordnung\s+SH\b)/u.test(context)) return 'Normabkürzung mit Landeskürzel (ohne amtlichen Beleg)';
  if (/\b(?:in|und|nach)\s+SH\b|\bSH\s*[,:)]/u.test(context)) return 'Landeskürzel als Landesbezeichnung';
  return 'Einrichtung, Programm oder System mit Landeskürzel';
}

function classify(item: ReviewItem & { sourceIdentity: string }, annexGroups: ReadonlyMap<string, AnnexGapCase>): ClassifiedCase {
  const details = detailsOf(item);
  const base = { id: item.id, sourceIdentity: item.sourceIdentity, category: item.category, key: item.key };
  const as = (klass: CaseClass, group: string, decision: string): ClassifiedCase => ({ ...base, class: klass, group, decision });
  if (item.category === 'contradictory-evidence') return as('technical-blocker', 'widersprüchliche Belege', 'Belege auflösen (muss 0 sein)');
  if (item.category === 'import-regression') {
    if (item.key === 'baseline-locked') return as('human-decision', 'Seed-Konflikt (fortgeschriebene Norm)', 'Baselinekorrektur einer durch die Simulation fortgeschriebenen Norm: Seed neu annehmen oder Korrektur verwerfen (Konfliktbericht)');
    if (/table-layout/u.test(details)) return as('human-decision', 'zurückgenommen: Tabellenstruktur nicht belegt', 'Tabellenstruktur manuell bestätigen oder als Text übernehmen');
    if (/enacted-after-baseline|repealed-before-baseline/u.test(details)) return as('human-decision', 'zurückgenommen: am Stichtag nicht geltend', 'Rücknahme bestätigen (nach dem Stichtag ausgefertigt bzw. davor außer Kraft; kein Ausgangsrechtsstand)');
    return as('technical-blocker', 'technische Regression', 'Ursache im Adapter beheben');
  }
  if (/table-layout/u.test(item.key)) return as('human-decision', 'Tabelle ohne sicheres Raster', 'Tabellenstruktur manuell bestätigen oder Fassung ohne Tabellenstruktur freigeben');
  if (item.key === 'integrity:mismatch') return as('technical-blocker', 'Textintegrität: Abweichung', 'Zeichenverlust im Parser beheben');
  if (item.key === 'integrity:review') return as('human-decision', 'Textintegrität: Einzelzeichen prüfen', 'Abweichung von einem Zeichen bestätigen');
  if (item.key === 'schema:title-missing' || item.key === 'parse:toc-unit-missing') return as('technical-blocker', 'Parser: Titel bzw. Verzeichniseinheit', 'Parser anpassen');
  if (item.key === 'parse:empty-footnote') return as('human-decision', 'Quelle: Fußnotenzeichen ohne Text', 'Übernahme ohne Fußnotentext bestätigen');
  if (item.category === 'institution-mapping') {
    if (item.key === 'transform:residual-source-state-reference') return as('human-decision', /Amtsblatt für Schl\.-H\./u.test(details) ? 'Verkündungsblatt mit Landeskürzel' : 'Landesbezeichnung im Eigennamen oder Quelltextfehler', 'Schutzmuster (Eigenname, historische Bezeichnung) oder Überleitung festlegen – keine Sim-Behörde erfinden');
    return as('human-decision', abbreviationGroup(details), 'Kürzel „SH“: amtliche Abkürzung belegen (dann Überleitung nach bestehender Regel) oder als Quellbezeichnung (Provenienz) stehen lassen');
  }
  if (item.category === 'incomplete-annex') {
    const annex = annexGroups.get(item.id);
    const group: AnnexGapGroup = annex?.group ?? 'normative-pdf-only';
    if (group === 'non-normative-missing') return as('non-blocking', ANNEX_GAP_LABELS[group], 'nichtnormative Anlage fehlt – kann nach Bestätigung aus dem Blocker');
    if (group === 'normative-separate') return as('technical-blocker', ANNEX_GAP_LABELS[group], 'separat vorhandene Anlage anhängen');
    return as('human-decision', ANNEX_GAP_LABELS[group], group === 'assignment-unclear' ? 'Stammnorm der Anlage bestimmen' : 'normative Anlage fehlt: amtliche Veröffentlichung beschaffen oder Norm im Review lassen (keine OCR-Automatik)');
  }
  if (item.category === 'pdf-only') return as('human-decision', /figure/u.test(item.key) ? 'Abbildung nicht sicher zuzuordnen' : 'technischer Vermerk: Text unvollständig', 'Abbildung bzw. fehlenden Text anhand der Quelle bestätigen');
  if (item.category === 'historical-gap') {
    const group = /rückwirkende Fassung/u.test(details) ? 'nur rückwirkende Einzelfassung am Stichtag' : /Reihenfolge/u.test(details) ? 'Einheitenfolge der Einzelfassungen' : /zugleich am Stichtag/u.test(details) ? 'zwei Einzelfassungen am Stichtag' : 'Einzelfassungen nicht eindeutig';
    return as('human-decision', group, 'Stichtagsfassung aus juris-Einzelfassung, amtlicher historischer Veröffentlichung oder sicherer Ereignisrekonstruktion bestimmen');
  }
  if (item.category === 'validity') return as('human-decision', /C-undetermined/u.test(item.key) ? 'Register (Ende) gegen Fortbestand' : 'Geltung am Stichtag unbestimmt', 'Geltung am 01.12.2023 aus „Gültig ab/bis“ oder amtlicher Quelle entscheiden');
  if (item.category === 'reconstruction-required') return as('human-decision', 'Stichtagsfassung ohne Quelle', 'Stichtagsfassung aus amtlicher historischer Veröffentlichung beschaffen');
  return as('human-decision', item.category, 'fachliche Entscheidung');
}

/* ------------------------------------------------------------------------------------------------ */
/* Anlagen-Untergruppen (PDF-Ausgabe im Cache)                                                       */

function parsedFromCache(id: string): ParsedJurisPdf | undefined {
  const file = join(root, '.cache/juris-sh', `${cacheKey(pdfExportUrl(id, 'gesamtausgabe'))}.bin`);
  if (!existsSync(file)) return undefined;
  try {
    return parseJurisPdf(layoutFromPdf(new Uint8Array(readFileSync(file))), { images: null });
  } catch {
    return undefined;
  }
}

function annexGapCases(items: ReadonlyArray<ReviewItem & { sourceIdentity: string }>, manifest: ReadonlyArray<ManifestEntry>): Map<string, AnnexGapCase> {
  const partsOf = new Map<string, string[]>();
  for (const entry of manifest) if (entry.importStatus === 'excluded' && entry.partOf) partsOf.set(entry.partOf, [...(partsOf.get(entry.partOf) ?? []), entry.sourceIdentity]);
  const result = new Map<string, AnnexGapCase>();
  const cache = new Map<string, ParsedJurisPdf | undefined>();
  for (const item of items.filter((entry) => entry.category === 'incomplete-annex')) {
    if (!cache.has(item.sourceIdentity)) cache.set(item.sourceIdentity, parsedFromCache(item.sourceIdentity));
    const separate = (partsOf.get(item.sourceIdentity) ?? []).map((id) => {
      if (!cache.has(id)) cache.set(id, parsedFromCache(id));
      return /\b(?:Anlage|Anhang)\s+(?:[0-9]+[a-z]?|[IVX]+)\b/u.exec(cache.get(id)?.title ?? '')?.[0];
    }).filter((label): label is string => Boolean(label));
    const parsed = cache.get(item.sourceIdentity);
    result.set(item.id, classifyAnnexGap({ sourceIdentity: item.sourceIdentity, reviewKey: item.key, details: detailsOf(item), ...(parsed ? { parsed } : {}), separateAnnexLabels: separate }));
  }
  return result;
}

/* ------------------------------------------------------------------------------------------------ */
/* Bestand                                                                                          */

interface ManifestEntry {
  sourceIdentity: string;
  sourceArea: string;
  importStatus: string;
  targetSlug?: string;
  sourceType?: string;
  baselineRecoveryMethod?: string;
  partOf?: string;
  integrity?: { status?: string; textIntegrity?: { status?: string } };
  findings?: Array<{ code: string }>;
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
  lockedBySimulation: string[];
}

function contentStats(): ContentStats {
  const directory = join(root, 'content/norms/nsh');
  const stats: ContentStats = { baselineNorms: 0, simulationNorms: 0, byType: [], tableNorms: 0, tables: 0, lockedBySimulation: [] };
  const types: string[] = [];
  for (const slug of readdirSync(directory).filter((name) => !name.startsWith('.'))) {
    const meta = JSON.parse(readFileSync(join(directory, slug, 'meta.json'), 'utf8')) as { type?: string; externalIdentifiers?: Array<{ system: string }> };
    const juris = (meta.externalIdentifiers ?? []).some((identifier) => identifier.system === 'juris-sh');
    if (!juris) {
      stats.simulationNorms += 1;
      continue;
    }
    stats.baselineNorms += 1;
    types.push(meta.type ?? 'unbekannt');
    const versions = readdirSync(join(directory, slug, 'versions')).filter((file) => file.endsWith('.json'));
    if (versions.some((file) => file !== '2023-12-01.json')) stats.lockedBySimulation.push(slug);
    const baseline = join(directory, slug, 'versions', '2023-12-01.json');
    if (existsSync(baseline)) {
      const fingerprints = versionTableFingerprints(JSON.parse(readFileSync(baseline, 'utf8')) as { body?: [] });
      if (fingerprints.length > 0) {
        stats.tableNorms += 1;
        stats.tables += fingerprints.length;
      }
    }
  }
  stats.byType = count(types, (type) => type);
  return stats;
}

/* ------------------------------------------------------------------------------------------------ */

const manifest = readManifestEntries();
const shards = readShards();
const items = openItems(shards);
const annexGroups = annexGapCases(items, manifest);
const cases = items.map((item) => classify(item, annexGroups));
const beforeShards = readShardsAt(base);
const beforeItems = beforeShards ? openItems(beforeShards) : undefined;
const content = contentStats();

const imported = manifest.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings');
const recovery = count(imported, (entry) => entry.baselineRecoveryMethod ?? 'current-source');
const statuses = count(manifest, (entry) => entry.importStatus);

const audit = readJson<{ ok: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> }>('data/audits/juris-sh/audit.json');
const readiness = readJson<{ status: string; ready: boolean }>('data/audits/juris-sh/readiness.json');
const searchFull = readJson<{ ok: boolean; norms: number; searchUnits: number }>('data/audits/juris-sh/search/search-audit-full.json');
const d1 = readJson<{ checkedAt: string; differences: number; database: string; sampleSize: number }>('data/audits/juris-sh/d1/D1_REMOTE_CHECK.json');
const r2 = readJson<{ stage: { entries: number; objects: number; conflicts: unknown[]; missingCache: unknown[] }; sync: { pending: number; uploaded: number; alreadyPresent: number; missingStaging: unknown[] } }>('data/audits/juris-sh/R2_STAGING.json');
const coverage = readJson<{ integrity: Record<string, number>; imported: number }>('data/audits/juris-sh/coverage.json');
const completeness = readJson<{ status: string; series: Array<{ knownIssues: string[]; presentIssues: string[]; missingIssues: string[] }>; unclearPeriods?: unknown[] }>('data/simulation/nsh/completeness.json');
const exceptions = readJson<{ baseCommit: string; entries: Array<{ key: string; kind: string }>; releases?: Array<{ baseCommit: string; entries: Array<{ key: string; kind: string }> }> }>('data/content-immutability-exceptions.json');
const tableChanges = readJson<{ blocks: Array<{ baseCommit: string; entries: Array<{ key: string; rule: string }> }> }>('data/content-table-changes.json');
const lockFile = await readBaselineLockFile(root);
const seeds = lockFile ? [...seedsFor(lockFile, 'nsh').values()] : [];
const nshLock = lockFile?.jurisdictions.nsh;

const gates: Array<{ id: string; ok: boolean; detail: string }> = [
  { id: 'audit', ok: audit?.ok === true, detail: audit ? `${audit.checks.filter((check) => check.ok).length}/${audit.checks.length} Prüfungen` : 'kein Bericht' },
  { id: 'readiness', ok: readiness?.ready === true, detail: readiness?.status ?? 'kein Bericht' },
  { id: 'search-audit-full', ok: searchFull?.ok === true, detail: searchFull ? `${number.format(searchFull.norms)} Normen, ${number.format(searchFull.searchUnits)} Sucheinheiten` : 'kein Bericht' },
  { id: 'd1-remote', ok: d1?.differences === 0, detail: d1 ? `${d1.database}, Stichprobe ${d1.sampleSize}, ${d1.differences} Abweichungen (${d1.checkedAt.slice(0, 10)})` : 'kein Bericht' },
  { id: 'r2', ok: Boolean(r2 && r2.stage.conflicts.length === 0 && r2.stage.missingCache.length === 0 && r2.sync.missingStaging.length === 0), detail: r2 ? `${number.format(r2.stage.entries)} Einträge, ${number.format(r2.stage.objects)} Objekte, Konflikte ${r2.stage.conflicts.length}` : 'kein Bericht' },
  { id: 'contradictory-evidence', ok: !cases.some((entry) => entry.category === 'contradictory-evidence'), detail: `${cases.filter((entry) => entry.category === 'contradictory-evidence').length} offen (muss 0 sein)` },
];

const technical = cases.filter((entry) => entry.class === 'technical-blocker');
const human = cases.filter((entry) => entry.class === 'human-decision');
const nonBlocking = cases.filter((entry) => entry.class === 'non-blocking');
const failedGates = gates.filter((gate) => !gate.ok);
const status: Status = technical.length > 0 || failedGates.length > 0 ? 'NOT READY' : human.length > 0 ? 'READY WITH HUMAN REVIEW' : 'BASELINE READY';
const documents = (list: readonly ClassifiedCase[]): number => new Set(list.map((entry) => entry.sourceIdentity)).size;
const groups = (list: readonly ClassifiedCase[]): Array<{ group: string; cases: number; documents: number; decision: string; examples: string[] }> => {
  const map = new Map<string, ClassifiedCase[]>();
  for (const entry of list) map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
  return [...map.entries()].map(([group, entries]) => ({ group, cases: entries.length, documents: documents(entries), decision: entries[0]!.decision, examples: [...new Set(entries.map((entry) => entry.sourceIdentity))].slice(0, 6) })).sort((a, b) => b.cases - a.cases);
};

const byCategoryNow = count(items, (item) => item.category);
const byCategoryBefore = beforeItems ? new Map(count(beforeItems, (item) => item.category)) : undefined;
const categories = [...new Set([...byCategoryNow.map(([key]) => key), ...(byCategoryBefore ? [...byCategoryBefore.keys()] : [])])].sort();
const tableTags = count(items.filter((item) => /table-layout/u.test(item.key)).flatMap((item) => [...detailsOf(item).matchAll(/\[([a-z-]+)\]/gu)].map((match) => match[1]!)), (tag) => tag);
const annexCounts = ANNEX_GAP_GROUPS.map((group) => [group, [...annexGroups.values()].filter((entry) => entry.group === group)] as const);
const nshExceptions = [exceptions, ...(exceptions?.releases ?? [])].filter(Boolean).map((block) => ({ baseCommit: block!.baseCommit, entries: block!.entries.filter((entry) => entry.key.startsWith('nsh/')).length }));

const result = {
  schemaVersion: FREEZE_READINESS_SCHEMA,
  jurisdiction: 'nsh',
  baselineDate: '2023-12-01',
  freezeSet: nshLock?.freeze === true,
  status,
  counts: { open: items.length, openDocuments: new Set(items.map((item) => item.sourceIdentity)).size, technicalBlockers: technical.length, humanDecisions: human.length, nonBlocking: nonBlocking.length, before: beforeItems?.length ?? null },
  gates,
  technicalBlockers: groups(technical),
  humanDecisions: groups(human),
  nonBlocking: groups(nonBlocking),
  content,
  manifest: { statuses, recovery },
  annexGroups: Object.fromEntries(annexCounts.map(([group, list]) => [group, list.length])),
  seeds: seeds.map((seed) => seed.slug),
  simulationSources: completeness?.status ?? 'unbekannt',
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`NSH-Freeze-Readiness: ${status} (Freeze ${result.freezeSet ? 'gesetzt' : 'nicht gesetzt'})`);
  console.log(`  offene Fälle ${items.length} (${result.counts.openDocuments} Dokumente)${beforeItems ? `, vorher ${beforeItems.length}` : ''}: technische Blocker ${technical.length}, fachliche Entscheidungen ${human.length}, nicht sperrend ${nonBlocking.length}`);
  for (const gate of gates) console.log(`  Gate ${gate.id}: ${gate.ok ? 'ok' : 'FEHLT/ROT'} – ${gate.detail}`);
  for (const group of result.technicalBlockers) console.log(`  Blocker: ${group.group} – ${group.cases} Fälle (${group.documents} Dok.)`);
}

if (write) {
  const table = (header: string[], rows: Array<Array<string | number>>): string => [`| ${header.join(' | ')} |`, `| ${header.map((_, index) => (rows.length > 0 && rows.every((row) => typeof row[index] === 'number') ? '---:' : '---')).join(' | ')} |`, ...rows.map((row) => `| ${row.map((cell) => (typeof cell === 'number' ? number.format(cell) : cell)).join(' | ')} |`)].join('\n');
  const groupTable = (list: ReturnType<typeof groups>): string => (list.length === 0 ? 'keine' : table(['Gruppe', 'Fälle', 'Dokumente', 'Entscheidung', 'Beispiele'], list.map((entry) => [entry.group, entry.cases, entry.documents, entry.decision, entry.examples.join(', ')])));
  const lines = [
    '# Freeze-Readiness des NSH-Ausgangsrechtsstands',
    '',
    `Automatisch erzeugt von \`node scripts/nsh-freeze-readiness.ts --write\` (Stand der Arbeitskopie, Vorher-Stand: Review-Fälle im Commit \`${base === 'HEAD' ? git('rev-parse', '--short', 'HEAD').trim() : base}\`). Nicht von Hand bearbeiten; Freeze-Semantik: \`docs/SIMULATION_IMPORT.md\` (Abschnitt „Baseline-Freeze“).`,
    '',
    `**Status: ${status}** · Freeze ${result.freezeSet ? 'gesetzt' : '**nicht gesetzt**'} (\`data/simulation/baseline-locks.json\`, \`jurisdictions.nsh.freeze\`) · Sim-Quellenstatus getrennt: \`${result.simulationSources}\` (kein Blocker des Ausgangsrechtsstands)`,
    '',
    'Regel: `NOT READY`, solange ein technischer Blocker offen oder ein Gate rot ist; `READY WITH HUMAN REVIEW`, wenn nur fachliche Entscheidungen offen sind; `BASELINE READY`, wenn auch diese entschieden sind. Nicht sperrend sind Fälle, die den normativen Ausgangstext nicht berühren (nichtnormative Anlage). Der Freeze selbst wird nur auf ausdrückliche Entscheidung gesetzt.',
    '',
    '## 1 Bestand',
    '',
    table(['Kennzahl', 'Wert'], [
      ['Baseline-Normen (juris, Ausgangsrechtsstand)', content.baselineNorms],
      ['davon mit Sim-Folgefassungen', content.lockedBySimulation.length],
      ['per-Norm-Seeds (gelockte Sim-Ziele)', seeds.length],
      ['eigene Normen der Simulation (nicht Baseline)', content.simulationNorms],
      ['Normen mit Tabellen / Tabellen (Ausgangsfassung)', `${number.format(content.tableNorms)} / ${number.format(content.tables)}`],
    ]),
    '',
    'Normtypen der Baseline: ' + content.byType.map(([type, value]) => `${type} ${number.format(value)}`).join(' · '),
    '',
    'Manifest (Vollkorpus): ' + statuses.map(([key, value]) => `${key} ${number.format(value)}`).join(' · '),
    '',
    '## 2 Ausgangsfassung: exakt oder rekonstruiert',
    '',
    table(['Herkunft der Stichtagsfassung', 'Normen'], recovery.map(([key, value]) => [key === 'current-source' ? 'heutige Ausgabe, am Stichtag unverändert (exakt)' : key === 'historical-juris-version' ? 'aus juris-Einzelfassungen zusammengesetzt' : key, value])),
    '',
    `Textintegrität (Vollkorpus, \`coverage.json\`): ${coverage ? Object.entries(coverage.integrity).map(([key, value]) => `${key} ${number.format(value)}`).join(' · ') : 'kein Bericht'}; übernommen wird nur \`exact\` oder erklärt (\`explained\`), Abweichungen bleiben Review.`,
    '',
    '## 3 Offene Review-Fälle',
    '',
    table(['Kategorie', ...(byCategoryBefore ? ['vorher'] : []), 'jetzt'], categories.map((category) => [category, ...(byCategoryBefore ? [byCategoryBefore.get(category) ?? 0] : []), byCategoryNow.find(([key]) => key === category)?.[1] ?? 0])),
    '',
    `Gesamt ${beforeItems ? `${number.format(beforeItems.length)} → ` : ''}${number.format(items.length)} Fälle in ${number.format(result.counts.openDocuments)} Dokumenten. Blockierend: ${technical.length} technisch, ${human.length} fachlich; nicht sperrend: ${nonBlocking.length}.`,
    '',
    '### 3.1 Technische Blocker',
    '',
    groupTable(result.technicalBlockers),
    '',
    '### 3.2 Fachliche Entscheidungen (Human Review)',
    '',
    groupTable(result.humanDecisions),
    '',
    '### 3.3 Nicht sperrend',
    '',
    groupTable(result.nonBlocking),
    '',
    '## 4 Tabellen',
    '',
    `Offene Tabellenfälle nach Ablehnungsgrund (mehrfach je Fall): ${tableTags.map(([tag, value]) => `\`${tag}\` ${value}`).join(', ') || 'keine'}. Regressionsschutz: \`npm run content:tables\` (semantischer Fingerabdruck jeder Tabelle, Freigaben in \`data/content-table-changes.json\`${tableChanges ? `, ${tableChanges.blocks.reduce((sum, block) => sum + block.entries.length, 0)} begründete Änderungen` : ''}).`,
    '',
    '## 5 Anlagen (`incomplete-annex`)',
    '',
    table(['Untergruppe', 'Fälle', 'sperrend'], annexCounts.map(([group, list]) => [ANNEX_GAP_LABELS[group], list.length, group === 'non-normative-missing' ? 'nein' : group === 'normative-separate' ? 'technisch' : 'fachlich'])),
    '',
    'Normativ ist eine Anlage im Zweifel immer (Muster, Karten, Formulare, Tarife); nur die ausdrückliche Kennzeichnung im Anlagentitel („nachrichtlich“, „Erläuterungen“, „Hinweise“, „Beispiel“, „Anschriften“) macht sie nichtnormativ. Keine OCR, keine Übernahme einer Stammnorm, deren normativer Teil fehlt.',
    '',
    '## 6 Gates und Audits',
    '',
    table(['Gate', 'Ergebnis', 'Detail'], gates.map((gate) => [gate.id, gate.ok ? 'grün' : '**rot/fehlt**', gate.detail])),
    '',
    '## 7 Unveränderlichkeit, Seeds und Ausnahmen',
    '',
    `- Baseline-Lock NSH: Referenz-Commit \`${nshLock?.commit.slice(0, 12) ?? '–'}\`, Freeze ${nshLock?.freeze ? 'gesetzt' : 'nicht gesetzt'}; per-Norm-Seeds (gelockte Sim-Ziele): ${seeds.map((seed) => `\`${seed.slug}\``).join(', ') || 'keine'}.`,
    `- Fortgeschriebene juris-Normen (Folgefassungen im Bestand): ${content.lockedBySimulation.map((slug) => `\`${slug}\``).join(', ') || 'keine'}.`,
    `- Akzeptierte Baseline-Ausnahmen (\`data/content-immutability-exceptions.json\`, NSH-Einträge je Block): ${nshExceptions.map((block) => `\`${block.baseCommit}\` ${block.entries}`).join(' · ') || 'keine'}.`,
    '',
    '## 8 Sim-Quellenlücken (getrennt, kein Blocker)',
    '',
    completeness ? `Sim-Quellenstatus \`${completeness.status}\`: ${completeness.series.map((series) => `${series.presentIssues.length}/${series.knownIssues.length} Ausgaben${series.missingIssues.length ? `, fehlend ${series.missingIssues.join(', ')}` : ''}`).join('; ')}. Die Lücken betreffen die Fortschreibung nach dem Stichtag, nicht den Ausgangsrechtsstand.` : 'keine Bewertung',
    '',
  ];
  await mkdir(dirname(join(root, DOC_PATH)), { recursive: true });
  await writeFile(join(root, DOC_PATH), `${lines.join('\n')}\n`);
  await mkdir(dirname(join(root, JSON_PATH)), { recursive: true });
  await writeFile(join(root, JSON_PATH), `${JSON.stringify({ ...result, generatedFrom: base }, null, 2)}\n`);
  // Baseline-Status der Oberfläche (getrennt vom Sim-Quellenstatus): Freeze je Land aus den Baseline-Locks, für NSH die
  // berechnete Bereitschaft. Andere Blöcke der Statusdatei bleiben unberührt.
  const statusPath = join(root, 'packages/legal-core/src/config/inventory-status.json');
  const statusFile = JSON.parse(readFileSync(statusPath, 'utf8')) as { schemaVersion: string; jurisdictions: Record<string, Record<string, unknown>> };
  const assessedAt = new Date().toISOString().slice(0, 10);
  for (const [jurisdiction, lock] of Object.entries(lockFile?.jurisdictions ?? {})) {
    const entry = statusFile.jurisdictions[jurisdiction];
    if (!entry) continue;
    entry.baselineFreeze = lock.freeze ? { frozen: true, assessedAt } : jurisdiction === 'nsh' ? { frozen: false, readiness: status, assessedAt } : { frozen: false, assessedAt };
  }
  await writeFile(statusPath, `${JSON.stringify(statusFile, null, 2)}\n`);
  console.log(`Geschrieben: ${DOC_PATH}, ${JSON_PATH}, Baseline-Status in packages/legal-core/src/config/inventory-status.json`);
}
