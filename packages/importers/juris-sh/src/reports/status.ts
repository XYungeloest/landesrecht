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

export const CONTENT_DIR = `content/norms/${TARGET_JURISDICTION}`;
export const LEDGER_FILE = `${IMPORT_DATA_DIR}/events/ledger.json`;

export interface AdapterSnapshot {
  enumeration: Partial<Record<EnumerableArea, EnumerationFile>>;
  inventory?: SourceInventory;
  robots?: RobotsRecord;
  addressability?: AddressabilityReport;
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
  const accessDoc = await readText(join(root, ACCESS_CONSTRAINT_DOC));
  return {
    enumeration,
    ...(inventory ? { inventory } : {}),
    ...(robots ? { robots } : {}),
    ...(addressability ? { addressability } : {}),
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

export const BASELINE_CLASSES = ['unchanged-since-baseline', 'changed-after-baseline', 'enacted-after-baseline', 'undetermined'] as const;
export type BaselineClass = (typeof BASELINE_CLASSES)[number];

export interface BaselineClassification {
  byArea: Record<EnumerableArea, Record<BaselineClass, number>>;
  /** Grund für `undetermined`, je Bereich einheitlich (kein Dokument ist inhaltlich lesbar). */
  undeterminedReason: string;
  historicalVersions: { recovered: number; note: string };
}

export function classifyBaseline(snapshot: AdapterSnapshot): BaselineClassification {
  const empty = (): Record<BaselineClass, number> => ({ 'unchanged-since-baseline': 0, 'changed-after-baseline': 0, 'enacted-after-baseline': 0, undetermined: 0 });
  const byArea = { landesrecht: empty(), vwv: empty() } as Record<EnumerableArea, Record<BaselineClass, number>>;
  for (const area of ENUMERABLE_AREAS) byArea[area].undetermined = snapshot.enumeration[area]?.items.length ?? 0;
  return {
    byArea,
    undeterminedReason:
      'Ohne Dokumentinhalt fehlen Titel, Abkürzung, Gliederungsnummer, Fassungs- und Geltungsdaten. Weder die Zuordnung zum Ereignisregister noch der Vergleich mit dem Stichtag ist möglich; die DOKNR allein trägt keine dieser Angaben.',
    historicalVersions: {
      recovered: 0,
      note: 'Historische Fassungen sind im Portal adressierbar (eigene DOKNR je Fassung, auch außer Kraft getretene Normen; siehe Stichprobenabgleich), aber ihr Inhalt ist wie jeder Dokumentinhalt nur über die interne Schnittstelle abrufbar. Eine Stichtagssuche („Fassung am Datum“) bietet die dokumentierte Oberfläche nicht.',
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
  /** Abgleich mit dem heutigen juris-Bestand: nicht möglich (Inhalt nicht adressierbar). */
  matchedAgainstInventory: number;
  restored: number;
  registerAsOf?: string;
  entries: Array<{ eventId: string; eventDate: string; eventType: string; gliederungsnummer?: string; title: string; citation: string; classification: 'duplicate' | 'confirmed-by-register' | 'announced-only' }>;
}

function targetKey(event: LedgerEvent): string {
  return event.targetGliederungsnummer?.trim() || event.targetTitle.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function analyzeBaselineOnly(snapshot: AdapterSnapshot): BaselineOnlyAnalysis {
  const events = (snapshot.ledger?.events ?? []).filter((event) => isBaselineOnlyCandidate(event));
  const registerAsOf = snapshot.ledger?.registerAsOf;
  const seen = new Set<string>();
  const entries: BaselineOnlyAnalysis['entries'] = [];
  for (const event of events) {
    const key = targetKey(event);
    const duplicate = seen.has(key);
    seen.add(key);
    const date = event.eventDate ?? '';
    const classification = duplicate ? 'duplicate' : registerAsOf && date <= registerAsOf ? 'confirmed-by-register' : 'announced-only';
    entries.push({ eventId: event.id, eventDate: date, eventType: event.eventType, ...(event.targetGliederungsnummer ? { gliederungsnummer: event.targetGliederungsnummer } : {}), title: event.targetTitle, citation: event.citation, classification });
  }
  return {
    candidates: events.length,
    duplicates: entries.filter((entry) => entry.classification === 'duplicate').length,
    confirmedByRegister: entries.filter((entry) => entry.classification === 'confirmed-by-register').length,
    announcedOnly: entries.filter((entry) => entry.classification === 'announced-only').length,
    matchedAgainstInventory: 0,
    restored: 0,
    ...(registerAsOf ? { registerAsOf } : {}),
    entries,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Rekonstruktionsqueue                                                                             */

export const RECONSTRUCTION_QUEUE_SCHEMA = 'juris-sh-reconstruction-queue/1' as const;

export interface ReconstructionQueueItem {
  /** Zielnorm laut Register (keine DOKNR: die Zuordnung zum juris-Bestand ist ohne Inhalt nicht möglich). */
  targetKey: string;
  gliederungsnummer?: string;
  title: string;
  /** Verkündungsblatt der Belege: GVOBl. (Gesetze/Verordnungen) oder Amtsbl. (VwV, aber auch Bekanntmachungen – Scope je Dokument offen). */
  organ: LedgerEvent['organ'];
  sourceIdentity: null;
  reason: 'post-baseline-change-unmatched';
  /** Änderungs-/Neufassungsereignisse nach dem Stichtag (Belege mit Fundstelle). */
  events: Array<{ id: string; eventType: string; eventDate: string; citation: string }>;
  /** Weg zur Stichtagsfassung in der Reihenfolge des Auftrags; alle Stufen derzeit offen. */
  path: Array<{ step: string; status: 'open' | 'blocked'; note: string }>;
}

export interface ReconstructionQueue {
  schemaVersion: typeof RECONSTRUCTION_QUEUE_SCHEMA;
  jurisdiction: typeof TARGET_JURISDICTION;
  baselineDate: string;
  blocker: string;
  totals: { items: number; events: number; byOrgan: Record<string, number> };
  items: ReconstructionQueueItem[];
}

export function buildReconstructionQueue(snapshot: AdapterSnapshot, baselineDate: string): ReconstructionQueue {
  const byTarget = new Map<string, ReconstructionQueueItem>();
  // Schlüssel je Blatt: Gleiche Gliederungsnummer in GVOBl. und Amtsbl. bezeichnet verschiedene Vorschriften.
  const changes = (snapshot.ledger?.events ?? []).filter((event) => (event.eventType === 'amend' || event.eventType === 'recast' || event.eventType === 'correction') && isPostBaseline(event) && event.processingStatus === 'recorded' && event.evidenceStrength !== 'insufficient' && event.evidenceStrength !== 'contradictory');
  for (const event of changes) {
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
          { step: 'historische juris-Fassung', status: 'blocked', note: 'Fassungen haben eigene DOKNR, Inhalt aber nur über die interne Schnittstelle' },
          { step: 'amtliche vollständige Veröffentlichung', status: 'open', note: 'GVOBl./Amtsbl. (Verkündungsportal SH, robots.txt verbindlich mit Crawl-delay 180 s) – nur mit vollständiger Kette Stammfassung + Änderungen bis zum Stichtag' },
          { step: 'sichere Rekonstruktion', status: 'open', note: 'Rückrechnung der Änderungsbefehle nach dem Stichtag setzt die heutige Fassung voraus – nicht verfügbar' },
          { step: 'Review', status: 'open', note: 'bis eine Stufe trägt' },
        ],
      };
      byTarget.set(key, item);
    }
    item.events.push({ id: event.id, eventType: event.eventType, eventDate: event.eventDate ?? '', citation: event.citation });
  }
  const items = [...byTarget.values()].sort((left, right) => left.targetKey.localeCompare(right.targetKey, 'de'));
  for (const item of items) item.events.sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.id.localeCompare(right.id));
  return {
    schemaVersion: RECONSTRUCTION_QUEUE_SCHEMA,
    jurisdiction: TARGET_JURISDICTION,
    baselineDate,
    blocker: 'Dokumentinhalt des juris-Portals nicht über dokumentierte öffentliche Adressformen abrufbar (siehe data/audits/juris-sh/STRUCTURE_REPORT.md); Zuordnung Register → DOKNR und Stichtagsfassung offen.',
    totals: {
      items: items.length,
      events: items.reduce((sum, item) => sum + item.events.length, 0),
      byOrgan: items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.organ]: (counts[item.organ] ?? 0) + 1 }), {}),
    },
    items,
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
  return {
    schemaVersion: 'juris-sh-coverage/1',
    jurisdiction: TARGET_JURISDICTION,
    enumerated: { landesrecht: snapshot.enumeration.landesrecht?.items.length ?? 0, vwv: snapshot.enumeration.vwv?.items.length ?? 0, units: (byFamily as Record<string, number>)['landesrecht-unit'] ?? 0 },
    excludedByFamily,
    rawArchived: manifest.reduce((sum, entry) => sum + entry.rawDocuments.length, 0),
    parsed: 0,
    integrity: { exact: 0, normalized: 0, explained: 0, review: 0, mismatch: 0 },
    transformed: manifest.filter((entry) => entry.transformerVersion).length,
    imported: manifest.filter((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings').length,
    review: manifest.filter((entry) => entry.importStatus === 'needs-review').length,
    notAtBaseline: manifest.filter((entry) => entry.importStatus === 'not-at-baseline').length,
    manifestEntries: manifest.length,
    contentFiles: snapshot.contentFiles,
    ...(snapshot.addressability?.conclusion !== 'content-addressable' ? { blocker: 'Dokumentinhalt nicht öffentlich adressierbar – kein Rohbestand, kein Parserlauf, kein Bulk' } : {}),
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

export function evaluateReadiness(snapshot: AdapterSnapshot): ReadinessResult {
  const checks: ReadinessCheck[] = [];

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

  // 2. Keine technische Sperre beobachtet.
  {
    const id = 'keine-technische-sperre';
    const label = 'Keine technische Zugriffssperre (403/429/Challenge)';
    const report = snapshot.addressability;
    if (!report) checks.push(fail(id, label, `${ADDRESSABILITY_PATH} fehlt (npm run import:juris-sh:sample -- --write)`));
    else if (report.conclusion === 'blocked' || report.summary.blocked > 0 || report.summary.challenge > 0) checks.push(fail(id, label, `Sperrsignale: ${report.summary.blocked} gesperrt, ${report.summary.challenge} Challenge`, true));
    else checks.push(pass(id, label, `${report.summary.total} Proben ohne Sperrsignal`));
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

  // 5. Zweite unabhängige Quelle.
  {
    const id = 'zweite-quelle';
    const label = 'Abgleich mit einer zweiten, vollständigen Quelle';
    const crosscheck = snapshot.inventory?.crosscheck;
    if (!crosscheck) checks.push(fail(id, label, 'kein Abgleich vorhanden'));
    else checks.push(fail(id, label, `nur Stichprobe: ${crosscheck.inSitemap}/${crosscheck.samples} Kennungen der Discovery-Stichprobe in der Sitemap (${crosscheck.notInSitemap} nicht, ${crosscheck.unresolved} unaufgelöst); die vollständigen Register (FFN-Übersichten) sind wie jeder Dokumentinhalt nicht öffentlich adressierbar`));
  }

  // 6. Inhalt über dokumentierte Adressformen abrufbar – Voraussetzung für alles Weitere.
  {
    const id = 'inhalt-adressierbar';
    const label = 'Normtext über dokumentierte öffentliche Adressformen abrufbar';
    const report = snapshot.addressability;
    if (!report) checks.push(fail(id, label, 'keine Probe vorhanden', true));
    else if (report.conclusion === 'content-addressable') checks.push(pass(id, label, report.reasoning.join('; ')));
    else checks.push(fail(id, label, report.reasoning.join('; '), true));
  }

  // 7.–9. Folgeprüfungen: ohne Inhalt nicht erfüllbar.
  const contentMissing = snapshot.addressability?.conclusion !== 'content-addressable';
  checks.push(fail('vollkorpus-strukturinventur', 'Strukturinventur des Vollkorpus mit Textintegrität', contentMissing ? 'nicht durchführbar: 0 Dokumente mit abrufbarem Normtext' : 'Strukturinventur fehlt'));
  const baseline = classifyBaseline(snapshot);
  const undetermined = ENUMERABLE_AREAS.reduce((sum, area) => sum + baseline.byArea[area].undetermined, 0);
  checks.push(fail('stichtagsklassifikation', 'Stichtagsklassifikation aller Normen', `${undetermined} undetermined: ${baseline.undeterminedReason}`));
  checks.push(fail('scope-dokumentebene', 'Scope je Dokument (Normtyp, normativ/informativ, landesweit)', 'nur auf Kennungsfamilien-Ebene entschieden (Ortsrecht, Rechtsprechung, Verkündungsblätter ausgeschlossen); je Dokument ohne Inhalt nicht entscheidbar'));
  const baselineOnly = analyzeBaselineOnly(snapshot);
  checks.push(fail('baseline-only', 'baseline-only-Kandidaten mit dem Bestand abgeglichen', `${baselineOnly.candidates} Kandidaten (Dubletten ${baselineOnly.duplicates}, durch Register bestätigt ${baselineOnly.confirmedByRegister}, nur angekündigt ${baselineOnly.announcedOnly}); Abgleich mit dem heutigen Bestand nicht möglich`));

  // 10. Kein Bestand ohne Gates.
  {
    const id = 'kein-ungeprueft-bestand';
    const label = 'Kein Bestand ohne grüne Gates geschrieben';
    const problems: string[] = [];
    if (snapshot.contentFiles > 0) problems.push(`${snapshot.contentFiles} Dateien unter ${CONTENT_DIR}`);
    if (snapshot.manifest.entries.some((entry) => entry.importStatus === 'imported' || entry.importStatus === 'imported-with-warnings')) problems.push('übernommene Manifesteinträge');
    checks.push(problems.length > 0 ? fail(id, label, problems.join('; ')) : pass(id, label, `${CONTENT_DIR} leer, Manifest ${snapshot.manifest.entries.length} Einträge, Review ${snapshot.review.items.length} Fälle`));
  }

  const blockers = checks.filter((check) => check.status === 'fail' && check.blocker).map((check) => `${check.id}: ${check.detail}`);
  return { schemaVersion: 'juris-sh-readiness/1', ready: checks.every((check) => check.status === 'pass'), checks, blockers };
}

export { RECONSTRUCTION_QUEUE_PATH };
