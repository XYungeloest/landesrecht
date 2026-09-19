/**
 * Zustandsaufnahme des juris-SH-Adapters für Coverage, Stichtagsbericht, Rekonstruktionsqueue, Audit und
 * Readiness. Liest ausschließlich den versionierten Zustand (`data/imports/juris-sh`, `data/audits/juris-sh`)
 * und `content/norms/nsh` – kein Netzabruf.
 *
 * Grundsatz: Was ohne Dokumentinhalt nicht entscheidbar ist, bleibt `undetermined` mit Grund. Es wird weder
 * ein Normtyp noch ein Geltungszeitraum aus einer Kennung, einer Adresse oder einem Register geraten.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { ACCESS_CONSTRAINT_DOC, JURIS_SH_ACCESS_POLICY } from '../access/policy.ts';
import { IMPORT_DATA_DIR, TARGET_JURISDICTION } from '../common/constants.ts';
import { readManifest, type ImportManifest } from '../common/manifest.ts';
import { RECONSTRUCTION_QUEUE_PATH, SLUG_REGISTRY_PATH } from '../common/paths.ts';
import { readReviewQueue, type ReviewQueue } from '../common/review.ts';
import { checkEnumeration, ENUMERABLE_AREAS, readEnumeration, type EnumerableArea, type EnumerationFile } from '../enumerate/enumeration.ts';
import { ROBOTS_RECORD_PATH, SOURCE_INVENTORY_JSON_PATH, type RobotsRecord, type SourceInventory } from '../enumerate/run.ts';
import { isBaselineOnlyCandidate, isPostBaseline, type LedgerEvent } from '../events/ledger.ts';
import { ADDRESSABILITY_PATH, readAddressability, type AddressabilityReport } from '../probe/addressability.ts';
import { EXPORTS_PATH, readExportDiscovery, type ExportDiscoveryReport } from '../probe/exports.ts';
import { INVENTORY_JSON_PATH, type InventoryReport } from '../pipeline/bulk.ts';
import { CORPUS_STATE_PATH, readCorpusState, type CorpusState } from '../pipeline/corpus.ts';
import { SAMPLE_PATH, type SampleReport } from '../pipeline/sample.ts';

export const CONTENT_DIR = `content/norms/${TARGET_JURISDICTION}`;
export const LEDGER_FILE = `${IMPORT_DATA_DIR}/events/ledger.json`;

export interface AdapterSnapshot {
  enumeration: Partial<Record<EnumerableArea, EnumerationFile>>;
  inventory?: SourceInventory;
  robots?: RobotsRecord;
  addressability?: AddressabilityReport;
  /** Öffentliche Ausgabewege (PDF-Ausgabe über die anonyme Sitzung eines Permalinks). */
  exports?: ExportDiscoveryReport;
  sample?: SampleReport;
  corpus?: CorpusState;
  corpusInventory?: InventoryReport;
  /** Normverzeichnisse unter content/norms/nsh. */
  contentSlugs: string[];
  manifest: ImportManifest;
  review: ReviewQueue;
  ledger?: { registerAsOf?: string; events: LedgerEvent[] };
  contentFiles: number;
  slugRegistryPresent: boolean;
  accessDoc?: string;
}

async function countFiles(directory: string): Promise<number> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) count += await countFiles(join(directory, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function readSnapshot(root: string): Promise<AdapterSnapshot> {
  const enumeration: AdapterSnapshot['enumeration'] = {};
  for (const area of ENUMERABLE_AREAS) {
    const file = await readEnumeration(root, area);
    if (file) enumeration[area] = file;
  }
  const ledger = await readJsonFile<{ sources?: Array<{ id: string; asOf?: string }>; events?: LedgerEvent[] }>(join(root, LEDGER_FILE));
  const inventory = await readJsonFile<SourceInventory>(join(root, SOURCE_INVENTORY_JSON_PATH));
  const robots = await readJsonFile<RobotsRecord>(join(root, ROBOTS_RECORD_PATH));
  const addressability = await readAddressability(root);
  const exports = await readExportDiscovery(root);
  const sample = await readJsonFile<SampleReport>(join(root, SAMPLE_PATH));
  const corpus = await readCorpusState(root);
  const corpusInventory = await readJsonFile<InventoryReport>(join(root, INVENTORY_JSON_PATH));
  const contentSlugs = (await readdir(join(root, CONTENT_DIR), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  const accessDoc = await readText(join(root, ACCESS_CONSTRAINT_DOC));
  return {
    enumeration,
    ...(inventory ? { inventory } : {}),
    ...(robots ? { robots } : {}),
    ...(addressability ? { addressability } : {}),
    ...(exports ? { exports } : {}),
    ...(sample ? { sample } : {}),
    ...(Object.keys(corpus.documents).length > 0 ? { corpus } : {}),
    ...(corpusInventory ? { corpusInventory } : {}),
    contentSlugs,
    manifest: await readManifest(root),
    review: await readReviewQueue(root),
    ...(ledger?.events ? { ledger: { events: ledger.events, ...(ledger.sources?.find((source) => source.id === 'gvobl-systematische-uebersicht')?.asOf ? { registerAsOf: ledger.sources.find((source) => source.id === 'gvobl-systematische-uebersicht')!.asOf! } : {}) } } : {}),
    contentFiles: await countFiles(join(root, CONTENT_DIR)),
    slugRegistryPresent: (await readText(join(root, SLUG_REGISTRY_PATH))) !== undefined,
    ...(accessDoc !== undefined ? { accessDoc } : {}),
  };
}


/* ------------------------------------------------------------------------------------------------ */
/* Stichtagsklassifikation                                                                          */

export const BASELINE_CLASSES = ['unchanged-since-baseline', 'changed-after-baseline', 'repealed-after-baseline', 'enacted-after-baseline', 'repealed-before-baseline', 'undetermined'] as const;
export type BaselineClass = (typeof BASELINE_CLASSES)[number];

export interface BaselineClassification {
  byArea: Record<EnumerableArea, Record<BaselineClass, number>>;
  /** Gründe für `undetermined` mit Anzahl. */
  undeterminedReason: string;
  historicalVersions: { recovered: number; note: string };
}

export function classifyBaseline(snapshot: AdapterSnapshot): BaselineClassification {
  const empty = (): Record<BaselineClass, number> => Object.fromEntries(BASELINE_CLASSES.map((key) => [key, 0])) as Record<BaselineClass, number>;
  const byArea = { landesrecht: empty(), vwv: empty() } as Record<EnumerableArea, Record<BaselineClass, number>>;
  const inventory = snapshot.corpusInventory;
  if (!inventory) {
    for (const area of ENUMERABLE_AREAS) byArea[area].undetermined = snapshot.enumeration[area]?.items.length ?? 0;
    return {
      byArea,
      undeterminedReason: 'Vollkorpus-Inventur fehlt (npm run import:juris-sh:fetch-corpus -- --phase gesamtausgaben, dann npm run import:juris-sh:inventory -- --write).',
      historicalVersions: { recovered: 0, note: 'Einzelfassungen („genau dieses Dokument“) sind über die öffentliche PDF-Ausgabe abrufbar; ohne Inventur ist keine zusammengesetzt.' },
    };
  }
  const reasons: Record<string, number> = {};
  let recovered = 0;
  let historicalReview = 0;
  for (const entry of inventory.entries) {
    const key = (BASELINE_CLASSES as readonly string[]).includes(entry.baselineClass ?? '') ? (entry.baselineClass as BaselineClass) : 'undetermined';
    byArea[entry.area][key] += 1;
    if (key === 'undetermined') {
      const reason = entry.outcome === 'not-cached' ? 'nicht im Cache' : entry.outcome === 'failed' ? 'Parser-/Schemafehler' : /Rückwirkung|weggefallene Einheit/u.test(entry.reason ?? '') ? 'Stand-Vermerk: Änderung nach dem Stichtag ohne späteres Einheitsdatum' : /ohne Normtext/u.test(entry.reason ?? '') ? 'Ausgabe ohne Normtext' : /Verzeichniseinträge ohne|kein Verzeichnis/u.test(entry.reason ?? '') ? 'Verzeichnis ohne Gültigkeitsdaten' : 'sonstige';
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    if (entry.historical && entry.historical.problems === 0) {
      if (entry.outcome === 'import-ready') recovered += 1;
      else historicalReview += 1;
    }
  }
  return {
    byArea,
    undeterminedReason: Object.entries(reasons).map(([reason, count]) => `${reason} ${count}`).join(' · ') || 'keine',
    historicalVersions: {
      recovered,
      note: `Stichtagsfassungen aus den am Stichtag geltenden Einzelfassungen der juris-Historie (PDF-Ausgabe „genau dieses Dokument“) zusammengesetzt und übernahmefähig: ${recovered}; zusammengesetzt, aber aus anderen Gründen im Review: ${historicalReview}. Der heutige Text ersetzt nie die Stichtagsfassung.`,
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* baseline-only-Kandidaten (Ereignisregister)                                                      */

export interface BaselineOnlyAnalysis {
  candidates: number;
  /** Gleiches Ziel (Gl.Nr. bzw. Titel) mehrfach gemeldet. */
  duplicates: number;
  /** Ende vor dem Registerstand eingetreten – durch das Register selbst belegt. */
  confirmedByRegister: number;
  /** Ende nach dem Registerstand – nur angekündigt; eine spätere Entfristung ist aus dem Register nicht ausschließbar. */
  announcedOnly: number;
  /** Einem juris-Dokument zugeordnet (Gliederungsnummer + Datum bzw. eindeutige Gliederungsnummer). */
  matchedAgainstInventory: number;
  /** Stichtagsfassung übernahmefähig (import-ready). */
  restored: number;
  registerAsOf?: string;
  entries: Array<{ eventId: string; eventDate: string; eventType: string; gliederungsnummer?: string; title: string; citation: string; classification: 'duplicate' | 'confirmed-by-register' | 'announced-only'; documentIds?: string[]; outcomes?: string[] }>;
}

function targetKey(event: LedgerEvent): string {
  return event.targetGliederungsnummer?.trim() || event.targetTitle.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function analyzeBaselineOnly(snapshot: AdapterSnapshot): BaselineOnlyAnalysis {
  const events = (snapshot.ledger?.events ?? []).filter((event) => isBaselineOnlyCandidate(event));
  const registerAsOf = snapshot.ledger?.registerAsOf;
  const matches = new Map((snapshot.corpusInventory?.baselineOnly.entries ?? []).map((entry) => [entry.eventId, entry]));
  const seen = new Set<string>();
  const entries: BaselineOnlyAnalysis['entries'] = [];
  for (const event of events) {
    const key = targetKey(event);
    const duplicate = seen.has(key);
    seen.add(key);
    const date = event.eventDate ?? '';
    const classification = duplicate ? 'duplicate' : registerAsOf && date <= registerAsOf ? 'confirmed-by-register' : 'announced-only';
    const match = matches.get(event.id);
    entries.push({ eventId: event.id, eventDate: date, eventType: event.eventType, ...(event.targetGliederungsnummer ? { gliederungsnummer: event.targetGliederungsnummer } : {}), title: event.targetTitle, citation: event.citation, classification, ...(match ? { documentIds: match.documentIds, outcomes: match.outcomes } : {}) });
  }
  return {
    candidates: events.length,
    duplicates: entries.filter((entry) => entry.classification === 'duplicate').length,
    confirmedByRegister: entries.filter((entry) => entry.classification === 'confirmed-by-register').length,
    announcedOnly: entries.filter((entry) => entry.classification === 'announced-only').length,
    matchedAgainstInventory: entries.filter((entry) => (entry.documentIds?.length ?? 0) > 0).length,
    restored: entries.filter((entry) => entry.outcomes?.includes('import-ready')).length,
    ...(registerAsOf ? { registerAsOf } : {}),
    entries,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Rekonstruktionsqueue                                                                             */

export const RECONSTRUCTION_QUEUE_SCHEMA = 'juris-sh-reconstruction-queue/1' as const;

export interface ReconstructionQueueItem {
  /** DOKNR, wenn einem juris-Dokument zugeordnet; sonst Blatt + Gliederungsnummer bzw. Titel des Registers. */
  targetKey: string;
  gliederungsnummer?: string;
  title: string;
  /** Verkündungsblatt: GVOBl. (Gesetze/Verordnungen) oder Amtsbl. (VwV, aber auch Bekanntmachungen – Scope je Dokument). */
  organ: LedgerEvent['organ'];
  sourceIdentity: string | null;
  reason: 'post-baseline-change-unmatched' | 'units-missing' | 'unit-selection' | 'register-only-not-in-juris';
  /** Änderungs-/Neufassungsereignisse nach dem Stichtag (Belege mit Fundstelle); bei zugeordneten Dokumenten leer. */
  events: Array<{ id: string; eventType: string; eventDate: string; citation: string }>;
  detail?: string;
  /** Weg zur Stichtagsfassung in der Reihenfolge des Auftrags. */
  path: Array<{ step: string; status: 'open' | 'blocked' | 'done'; note: string }>;
}

export interface ReconstructionQueue {
  schemaVersion: typeof RECONSTRUCTION_QUEUE_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  baselineDate: string;
  blocker: string;
  totals: { items: number; events: number; byOrgan: Record<string, number>; byReason?: Record<string, number> };
  items: ReconstructionQueueItem[];
}

export function buildReconstructionQueue(snapshot: AdapterSnapshot, baselineDate: string): ReconstructionQueue {
  const items: ReconstructionQueueItem[] = [];
  const inventory = snapshot.corpusInventory;
  const knownNumbers = new Set<string>();
  if (inventory) {
    for (const entry of inventory.entries) {
      if (entry.gliederungsnummer) knownNumbers.add(`${entry.area === 'vwv' ? 'amtsblatt' : 'gvobl'}:${entry.gliederungsnummer.replace(/\s+/gu, '').toUpperCase()}`);
      if (entry.outcome !== 'reconstruction') continue;
      const reason = entry.blockers.some((blocker) => blocker.kind === 'historical') ? 'unit-selection' : 'units-missing';
      items.push({
        targetKey: entry.documentId,
        ...(entry.gliederungsnummer ? { gliederungsnummer: entry.gliederungsnummer } : {}),
        title: entry.title ?? entry.documentId,
        organ: entry.area === 'vwv' ? 'amtsblatt' : 'gvobl',
        sourceIdentity: entry.documentId,
        reason,
        events: [],
        ...(entry.reason ? { detail: entry.reason } : {}),
        path: [
          { step: 'historische juris-Fassung', status: reason === 'units-missing' ? 'open' : 'blocked', note: reason === 'units-missing' ? 'Einzelfassungen über die öffentliche PDF-Ausgabe laden: npm run import:juris-sh:fetch-corpus -- --phase units' : 'Einzelfassungen geladen, Zuordnung am Stichtag nicht eindeutig (siehe detail)' },
          { step: 'amtliche vollständige Veröffentlichung', status: 'open', note: 'GVOBl./Amtsbl. – nur mit vollständiger Kette Stammfassung + Änderungen bis zum Stichtag' },
          { step: 'Review', status: 'open', note: 'bis eine Stufe trägt' },
        ],
      });
    }
  }
  // Registerereignisse ohne zugeordnetes juris-Dokument (Schlüssel je Blatt: gleiche Gl.Nr. in GVOBl. und Amtsbl. sind verschiedene Vorschriften).
  const byTarget = new Map<string, ReconstructionQueueItem>();
  const changes = (snapshot.ledger?.events ?? []).filter((event) => (event.eventType === 'amend' || event.eventType === 'recast' || event.eventType === 'correction') && isPostBaseline(event) && event.processingStatus === 'recorded' && event.evidenceStrength !== 'insufficient' && event.evidenceStrength !== 'contradictory');
  for (const event of changes) {
    if (event.targetGliederungsnummer && knownNumbers.has(`${event.organ}:${event.targetGliederungsnummer.replace(/\s+/gu, '').toUpperCase()}`)) continue;
    const key = `${event.organ}:${targetKey(event)}`;
    let item = byTarget.get(key);
    if (!item) {
      item = {
        targetKey: key,
        ...(event.targetGliederungsnummer ? { gliederungsnummer: event.targetGliederungsnummer } : {}),
        title: event.targetTitle,
        organ: event.organ,
        sourceIdentity: null,
        reason: 'post-baseline-change-unmatched',
        events: [],
        path: [
          { step: 'historische juris-Fassung', status: inventory ? 'blocked' : 'open', note: inventory ? 'keinem enumerierten juris-Dokument zugeordnet (Gliederungsnummer nicht im Bestand)' : 'Zuordnung nach der Vollkorpus-Inventur' },
          { step: 'amtliche vollständige Veröffentlichung', status: 'open', note: 'GVOBl./Amtsbl. (Verkündungsportal SH, robots.txt verbindlich mit Crawl-delay 180 s) – nur mit vollständiger Kette Stammfassung + Änderungen bis zum Stichtag' },
          { step: 'Review', status: 'open', note: 'bis eine Stufe trägt' },
        ],
      };
      byTarget.set(key, item);
    }
    item.events.push({ id: event.id, eventType: event.eventType, eventDate: event.eventDate ?? '', citation: event.citation });
  }
  // Normen, die das amtliche Register (Stand Ende 2024) als geltend führt, die aber in keinem juris-Dokument
  // stehen (weder Gliederungsnummer noch Titel): Stichtagsfassung nur aus amtlichen Veröffentlichungen.
  for (const check of inventory?.registerCrosscheck ?? []) {
    const organ: LedgerEvent['organ'] = check.area === 'vwv' ? 'amtsblatt' : 'gvobl';
    for (const missing of check.missing) {
      const key = `${organ}:${missing.gliederungsnummer}`;
      const existing = [...byTarget.values()].find((item) => item.organ === organ && item.gliederungsnummer?.replace(/\s+/gu, '').toUpperCase() === missing.gliederungsnummer);
      if (existing || byTarget.has(key)) continue;
      byTarget.set(key, {
        targetKey: key,
        gliederungsnummer: missing.gliederungsnummer,
        title: missing.title,
        organ,
        sourceIdentity: null,
        reason: 'register-only-not-in-juris',
        events: [],
        detail: `im Register ${check.source}${check.asOf ? ` (Stand ${check.asOf})` : ''}, in keinem enumerierten juris-Dokument (Gliederungsnummer und Titel geprüft)`,
        path: [
          { step: 'historische juris-Fassung', status: 'blocked', note: 'in juris nicht geführt' },
          { step: 'amtliche vollständige Veröffentlichung', status: 'open', note: 'Stammfassung und Änderungen aus GVOBl./Amtsbl. bis zum Stichtag' },
          { step: 'Review', status: 'open', note: 'bis eine Stufe trägt' },
        ],
      });
    }
  }
  const registerItems = [...byTarget.values()].sort((left, right) => left.targetKey.localeCompare(right.targetKey, 'de'));
  for (const item of registerItems) item.events.sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.id.localeCompare(right.id));
  const all = [...items.sort((left, right) => left.targetKey.localeCompare(right.targetKey)), ...registerItems];
  return {
    schemaVersion: RECONSTRUCTION_QUEUE_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    baselineDate,
    blocker: inventory
      ? 'Stichtagsfassung geänderter Normen aus den Einzelfassungen der juris-Historie (öffentliche PDF-Ausgabe); offen sind Normen, deren Einzelfassungen noch nicht geladen oder am Stichtag nicht eindeutig sind, und Registerziele ohne juris-Dokument.'
      : 'Vollkorpus-Inventur fehlt; Zuordnung Register → DOKNR und Stichtagsfassung offen.',
    totals: {
      items: all.length,
      events: all.reduce((sum, item) => sum + item.events.length, 0),
      byOrgan: all.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.organ]: (counts[item.organ] ?? 0) + 1 }), {}),
      ...(inventory ? { byReason: all.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] ?? 0) + 1 }), {}) } : {}),
    },
    items: all,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Coverage                                                                                         */

export interface CoverageReport {
  schemaVersion: 'juris-sh-coverage/1';
  jurisdiction: typeof TARGET_JURISDICTION;
  enumerated: Record<EnumerableArea, number> & { units: number };
  excludedByFamily: Record<string, number>;
  rawArchived: number;
  parsed: number;
  integrity: { exact: number; normalized: number; explained: number; review: number; mismatch: number };
  transformed: number;
  imported: number;
  review: number;
  notAtBaseline: number;
  manifestEntries: number;
  contentFiles: number;
  blocker?: string;
}

export function buildCoverage(snapshot: AdapterSnapshot): CoverageReport {
  const manifest = snapshot.manifest.entries;
  const byFamily = snapshot.inventory?.sitemap.byFamily ?? {};
  const excludedByFamily: Record<string, number> = {};
  for (const entry of snapshot.inventory?.scope ?? []) if (entry.scope === 'excluded' && entry.count > 0) excludedByFamily[entry.family] = entry.count;
  const inventory = snapshot.corpusInventory;
  const integrity = inventory?.totals.byIntegrity ?? {};
  const outcomes = inventory?.totals.byOutcome ?? {};
  const fetched = Object.values(snapshot.corpus?.documents ?? {}).filter((document) => document.status === 'fetched').length;
  const exportAvailable = snapshot.exports?.conclusion === 'public-export-available';
  return {
    schemaVersion: 'juris-sh-coverage/1',
    jurisdiction: TARGET_JURISDICTION,
    enumerated: { landesrecht: snapshot.enumeration.landesrecht?.items.length ?? 0, vwv: snapshot.enumeration.vwv?.items.length ?? 0, units: (byFamily as Record<string, number>)['landesrecht-unit'] ?? 0 },
    excludedByFamily,
    rawArchived: fetched,
    parsed: inventory ? inventory.entries.filter((entry) => entry.outcome !== 'failed' && entry.outcome !== 'not-cached').length : 0,
    integrity: { exact: integrity.exact ?? 0, normalized: integrity['normalized-equivalent'] ?? 0, explained: integrity['explained-difference'] ?? 0, review: integrity.review ?? 0, mismatch: integrity.mismatch ?? 0 },
    transformed: inventory ? inventory.entries.filter((entry) => entry.slug !== undefined || entry.outcome === 'review').length : manifest.filter((entry) => entry.transformerVersion).length,
    imported: manifest.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').length,
    review: manifest.length > 0 ? manifest.filter((entry) => entry.importStatus === 'needs-review').length : (outcomes.review ?? 0) + (outcomes.reconstruction ?? 0),
    notAtBaseline: manifest.length > 0 ? manifest.filter((entry) => entry.importStatus === 'not-at-baseline').length : outcomes['not-at-baseline'] ?? 0,
    manifestEntries: manifest.length,
    contentFiles: snapshot.contentFiles,
    ...(!exportAvailable && snapshot.addressability?.conclusion !== 'content-addressable' ? { blocker: 'Kein öffentlicher Ausgabeweg belegt – kein Rohbestand, kein Parserlauf, kein Bulk' } : {}),
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Readiness                                                                                        */

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  detail: string;
  blocker?: boolean;
}

export interface ReadinessResult {
  schemaVersion: 'juris-sh-readiness/1';
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
}

const pass = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'pass', detail });
const fail = (id: string, label: string, detail: string, blocker = false): ReadinessCheck => ({ id, label, status: 'fail', detail, ...(blocker ? { blocker } : {}) });

/** Mindestabdeckung der Registerabgleiche (Gliederungsnummern des Registers, die der Bestand führt). */
export const REGISTER_COVERAGE_MINIMUM = 0.95;
export const ACCEPTED_INTEGRITY_CLASSES: readonly string[] = ['exact', 'normalized-equivalent', 'explained-difference'];

export function evaluateReadiness(snapshot: AdapterSnapshot, options: { forBulkWrite?: boolean } = {}): ReadinessResult {
  const checks: ReadinessCheck[] = [];
  const inventory = snapshot.corpusInventory;
  const enumerated = ENUMERABLE_AREAS.reduce((sum, area) => sum + (snapshot.enumeration[area]?.items.length ?? 0), 0);

  // 1. Zugriffspolitik: robots.txt belegt, Politik advisory, Nutzerentscheidung dokumentiert.
  {
    const id = 'zugriffspolitik';
    const label = 'Zugriffspolitik belegt (robots.txt advisory, Nutzerentscheidung)';
    const robots = snapshot.robots;
    const problems: string[] = [];
    if (!robots) problems.push(`${ROBOTS_RECORD_PATH} fehlt (npm run import:juris-sh:enumerate -- --write)`);
    else {
      if (robots.policy !== 'advisory' || JURIS_SH_ACCESS_POLICY.robotsPolicy !== 'advisory') problems.push(`Politik ${robots.policy} statt advisory`);
      if (robots.fetch.httpStatus !== 200 || !/^[0-9a-f]{64}$/u.test(robots.fetch.sha256)) problems.push('robots.txt ohne HTTP 200 oder SHA-256');
      if (robots.decision.basis !== 'Nutzerentscheidung') problems.push('Entscheidungsgrundlage fehlt');
    }
    if (!snapshot.accessDoc?.includes('advisory') || !snapshot.accessDoc.includes('Nutzerentscheidung')) problems.push(`${ACCESS_CONSTRAINT_DOC} dokumentiert die Politik nicht`);
    checks.push(problems.length > 0 ? fail(id, label, problems.join('; ')) : pass(id, label, `robots.txt ${robots!.fetch.byteLength} Bytes, SHA-256 ${robots!.fetch.sha256.slice(0, 12)}…, abgerufen ${robots!.fetch.retrievedAt}; ${robots!.verdicts.filter((verdict) => verdict.verdict === 'disallowed').length}/${robots!.verdicts.length} Pfade „disallowed“ – Befund, keine Sperre (Entscheidung ${robots!.decision.date})`));
  }

  // 2. Keine technische Sperre beobachtet (Probe, Ausgabeprobe, Vollkorpus).
  {
    const id = 'keine-technische-sperre';
    const label = 'Keine technische Zugriffssperre (403/429/Challenge)';
    const report = snapshot.addressability;
    const exportBlocked = (snapshot.exports?.probes ?? []).filter((probe) => probe.outcome === 'blocked').length;
    const corpusBlocked = Object.values(snapshot.corpus?.documents ?? {}).filter((document) => /\[(?:blocked|forbidden|rate-limited)\]/u.test(document.error ?? '')).length;
    if (!report) checks.push(fail(id, label, `${ADDRESSABILITY_PATH} fehlt (npm run import:juris-sh:sample -- --write)`));
    else if (report.conclusion === 'blocked' || report.summary.blocked > 0 || report.summary.challenge > 0 || exportBlocked > 0 || corpusBlocked > 0) checks.push(fail(id, label, `Sperrsignale: Probe ${report.summary.blocked} gesperrt, ${report.summary.challenge} Challenge; Ausgabeprobe ${exportBlocked}; Vollkorpus ${corpusBlocked}`, true));
    else checks.push(pass(id, label, `${report.summary.total} Adressproben, ${snapshot.exports?.probes.length ?? 0} Ausgabeproben, ${Object.keys(snapshot.corpus?.documents ?? {}).length} Vollkorpus-Dokumente ohne Sperrsignal`));
  }

  // 3. Enumeration beider Bereiche.
  {
    const id = 'enumeration';
    const label = 'Enumeration Landesrecht und VwV vorhanden und konsistent';
    const problems: string[] = [];
    for (const area of ENUMERABLE_AREAS) {
      const file = snapshot.enumeration[area];
      if (!file) problems.push(`${area}: fehlt`);
      else problems.push(...checkEnumeration(file).map((problem) => `${area}: ${problem}`));
    }
    checks.push(problems.length > 0 ? fail(id, label, problems.join('; ')) : pass(id, label, ENUMERABLE_AREAS.map((area) => `${area} ${snapshot.enumeration[area]!.items.length}`).join(' · ')));
  }

  // 4. Fixpunkt: zweiter unabhängiger Abruf fachlich unverändert.
  {
    const id = 'enumeration-fixpunkt';
    const label = 'Enumeration im Fixpunkt (zweiter, unabhängiger Abruf unverändert)';
    const open = ENUMERABLE_AREAS.filter((area) => !snapshot.enumeration[area]?.fixpoint.stable || (snapshot.enumeration[area]?.fixpoint.confirmations ?? 0) < 1);
    checks.push(open.length > 0 ? fail(id, label, `nicht bestätigt: ${open.join(', ')} (npm run import:juris-sh:enumerate -- --refresh --write)`) : pass(id, label, ENUMERABLE_AREAS.map((area) => `${area}: ${snapshot.enumeration[area]!.fixpoint.confirmations} Bestätigung(en), Fingerabdruck ${snapshot.enumeration[area]!.fingerprint.slice(0, 12)}…`).join(' · ')));
  }

  // 5. Öffentlicher Ausgabeweg für den Normtext – Voraussetzung für alles Weitere.
  {
    const id = 'oeffentlicher-ausgabeweg';
    const label = 'Normtext über einen öffentlichen Ausgabeweg abrufbar (ohne interne Schnittstelle)';
    const exports = snapshot.exports;
    if (snapshot.addressability?.conclusion === 'content-addressable') checks.push(pass(id, label, snapshot.addressability.reasoning.join('; ')));
    else if (exports?.conclusion === 'public-export-available') checks.push(pass(id, label, `PDF-Ausgabe (GET /jportal/recherche3doc/…pdf) mit der anonymen Sitzung eines öffentlichen Permalink-Aufrufs; kein Login, kein CSRF, /jportal/wsrest/ nicht aufgerufen. ${exports.reasoning.join('; ')}`));
    else checks.push(fail(id, label, exports ? exports.reasoning.join('; ') : `${EXPORTS_PATH} fehlt (npm run import:juris-sh:sample -- --write)`, true));
  }

  // 6. Stichprobe des Vollwegs mit vollständiger Textintegrität.
  {
    const id = 'stichprobe-vollweg';
    const label = 'Stichprobe Vollweg (Parser, Stichtag, Überleitung, Validierung) mit Textintegrität';
    const sample = snapshot.sample;
    if (!sample) checks.push(fail(id, label, `${SAMPLE_PATH} fehlt (npm run import:juris-sh:sample -- --write)`));
    else {
      const failed = sample.norms.filter((norm) => norm.outcome === 'failed').length;
      const badIntegrity = sample.norms.filter((norm) => norm.integrity && !ACCEPTED_INTEGRITY_CLASSES.includes(norm.integrity.class)).length;
      const detail = `${sample.norms.length} Normen: ${Object.entries(sample.totals).map(([key, value]) => `${key} ${value}`).join(' · ')}; Integrität ${Object.entries(sample.integrity).map(([key, value]) => `${key} ${value}`).join(' · ')}`;
      checks.push(failed > 0 || badIntegrity > 0 ? fail(id, label, `${detail}; fehlgeschlagen ${failed}, Integrität nicht belegt ${badIntegrity}`) : pass(id, label, detail));
    }
  }

  // 7. Vollkorpus im Cache (PDF-Gesamtausgaben aller enumerierten Dokumente).
  {
    const id = 'vollkorpus-abruf';
    const label = 'Vollkorpus über die öffentliche PDF-Ausgabe im Cache';
    const documents = snapshot.corpus?.documents ?? {};
    const fetched = Object.values(documents).filter((document) => document.status === 'fetched').length;
    const failed = Object.entries(documents).filter(([, document]) => document.status === 'failed');
    const missing = enumerated - fetched - failed.length;
    if (fetched === 0) checks.push(fail(id, label, `${CORPUS_STATE_PATH} fehlt oder leer (npm run import:juris-sh:fetch-corpus -- --phase gesamtausgaben)`));
    else if (missing > 0) checks.push(fail(id, label, `${fetched}/${enumerated} geholt, ${failed.length} fehlgeschlagen, ${missing} offen (Fortsetzen: npm run import:juris-sh:fetch-corpus -- --phase gesamtausgaben)`));
    else checks.push(pass(id, label, `${fetched}/${enumerated} PDF-Gesamtausgaben geholt${failed.length > 0 ? `; ${failed.length} ohne PDF (Portalfehler je Dokument, bleiben draußen): ${failed.slice(0, 5).map(([key, document]) => `${key} ${document.error?.slice(0, 60) ?? ''}`).join('; ')}` : ''}`));
  }

  // 8. Vollkorpus-Inventur: jedes Dokument verarbeitet, Integrität jeder übernahmefähigen Norm belegt.
  {
    const id = 'vollkorpus-inventur';
    const label = 'Vollkorpus-Inventur (Strukturinventur mit Textintegrität je Dokument)';
    if (!inventory) checks.push(fail(id, label, `${INVENTORY_JSON_PATH} fehlt (npm run import:juris-sh:inventory -- --write)`));
    else {
      const notCached = inventory.totals.byOutcome['not-cached'] ?? 0;
      const readyWithoutIntegrity = inventory.entries.filter((entry) => entry.outcome === 'import-ready' && !ACCEPTED_INTEGRITY_CLASSES.includes(entry.integrity ?? '')).length;
      const detail = `${inventory.totals.processed}/${inventory.totals.enumerated} Dokumente: ${Object.entries(inventory.totals.byOutcome).map(([key, value]) => `${key} ${value}`).join(' · ')}; Integrität ${Object.entries(inventory.totals.byIntegrity).map(([key, value]) => `${key} ${value}`).join(' · ')}`;
      const fetchedAll = Object.values(snapshot.corpus?.documents ?? {}).filter((document) => document.status === 'fetched').length;
      if (inventory.totals.processed !== inventory.totals.enumerated || inventory.totals.enumerated !== enumerated) checks.push(fail(id, label, `${detail}; Inventur unvollständig oder zu einer anderen Enumeration`));
      else if (notCached > inventory.totals.enumerated - fetchedAll) checks.push(fail(id, label, `${detail}; ${notCached} nicht im Cache – Inventur nach dem Abruf wiederholen`));
      else if (readyWithoutIntegrity > 0) checks.push(fail(id, label, `${detail}; ${readyWithoutIntegrity} übernahmefähig ohne belegte Integrität`, true));
      else checks.push(pass(id, label, detail));
    }
  }

  // 9. Stichtagsklassifikation je Dokument.
  {
    const id = 'stichtagsklassifikation';
    const label = 'Stichtagsklassifikation aller Normen (Ausgabe, Einzelfassungen, Register nach A/B/C)';
    const baseline = classifyBaseline(snapshot);
    const undetermined = ENUMERABLE_AREAS.reduce((sum, area) => sum + baseline.byArea[area].undetermined, 0);
    if (!inventory) checks.push(fail(id, label, `${undetermined} undetermined: ${baseline.undeterminedReason}`));
    else checks.push(pass(id, label, `${ENUMERABLE_AREAS.map((area) => `${area}: ${BASELINE_CLASSES.map((key) => `${key} ${baseline.byArea[area][key]}`).join(', ')}`).join(' · ')}; undetermined → Review (${baseline.undeterminedReason}); Regeln ${Object.entries(inventory.totals.evidenceRules).map(([key, value]) => `${key} ${value}`).join(' · ')}`));
  }

  // 10. Zweite Quelle: amtliche Register gegen den Bestand.
  {
    const id = 'zweite-quelle';
    const label = `Abgleich mit amtlichen Registern (Gliederungsnummern, Abdeckung ≥ ${REGISTER_COVERAGE_MINIMUM * 100} %)`;
    if (!inventory) checks.push(fail(id, label, 'Vollkorpus-Inventur fehlt'));
    else {
      const detail = inventory.registerCrosscheck.map((check) => `${check.source} (Stand ${check.asOf ?? '?'}): ${check.found}/${check.registerNumbers} = ${(check.coverage * 100).toFixed(1)} %`).join(' · ');
      const low = inventory.registerCrosscheck.filter((check) => check.registerNumbers > 0 && check.coverage < REGISTER_COVERAGE_MINIMUM);
      checks.push(low.length > 0 ? fail(id, label, `${detail}; unter der Mindestabdeckung: ${low.map((check) => check.source).join(', ')}`) : pass(id, label, `${detail}; fehlende Nummern in CORPUS_INVENTORY.md`));
    }
  }

  // 11. Scope je Dokument.
  {
    const id = 'scope-dokumentebene';
    const label = 'Scope je Dokument (Normtyp aus der Ausgabe; Ortsrecht, Rechtsprechung, Verkündungsblätter ausgeschlossen)';
    if (!inventory) checks.push(fail(id, label, 'nur auf Kennungsfamilien-Ebene entschieden; je Dokument erst mit der Inventur'));
    else {
      const parsed = inventory.entries.filter((entry) => entry.outcome !== 'failed' && entry.outcome !== 'not-cached');
      const untyped = parsed.filter((entry) => !entry.type).length;
      checks.push(untyped > 0 ? fail(id, label, `${untyped} Dokumente ohne Normtyp`) : pass(id, label, `Normtyp je Dokument: ${Object.entries(inventory.totals.byType).map(([key, value]) => `${key} ${value}`).join(' · ')}`));
    }
  }

  // 12. baseline-only-Kandidaten gegen den Bestand.
  {
    const id = 'baseline-only';
    const label = 'baseline-only-Kandidaten mit dem Bestand abgeglichen';
    const analysis = analyzeBaselineOnly(snapshot);
    if (!inventory) checks.push(fail(id, label, `${analysis.candidates} Kandidaten; Abgleich erst mit der Vollkorpus-Inventur`));
    else checks.push(pass(id, label, `${analysis.candidates} Kandidaten: ${analysis.matchedAgainstInventory} einem juris-Dokument zugeordnet (${Object.entries(inventory.baselineOnly.byOutcome).map(([key, value]) => `${key} ${value}`).join(' · ')}), übernahmefähig ${analysis.restored}; nicht zugeordnete in der Rekonstruktionsqueue`));
  }

  // 13. Bestand und Manifest decken sich (keine Norm ohne übernommenen Manifesteintrag und umgekehrt).
  {
    const id = 'bestand-konsistent';
    const label = 'Bestand content/norms/nsh deckt sich mit den übernommenen Manifesteinträgen';
    const imported = new Set(snapshot.manifest.entries.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').map((entry) => entry.targetSlug));
    const content = new Set(snapshot.contentSlugs);
    const orphan = [...content].filter((slug) => !imported.has(slug));
    const missing = [...imported].filter((slug) => !content.has(slug));
    checks.push(orphan.length > 0 || missing.length > 0 ? fail(id, label, `ohne Manifest: ${orphan.slice(0, 5).join(', ') || '–'} (${orphan.length}); ohne Verzeichnis: ${missing.slice(0, 5).join(', ') || '–'} (${missing.length})`, true) : pass(id, label, `${content.size} Normen, ${snapshot.manifest.entries.length} Manifesteinträge, ${snapshot.review.items.length} Review-Fälle`));
  }

  void options;
  const blockers = checks.filter((check) => check.status === 'fail' && check.blocker).map((check) => `${check.id}: ${check.detail}`);
  return { schemaVersion: 'juris-sh-readiness/1', ready: checks.every((check) => check.status === 'pass'), checks, blockers };
}

export { RECONSTRUCTION_QUEUE_PATH };
