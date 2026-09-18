/**
 * Ablauf des Befehls `enumerate`: Zugriffslage belegen, Sitemap abrufen, Enumeration beider Bereiche bis zum
 * Fixpunkt bauen, Stichprobe gegen eine zweite Quelle abgleichen, Quelleninventar schreiben.
 *
 * Kosten (Netz, bei leerem Cache): robots.txt 1 · Sitemap-Index 1 · Teil-Sitemaps 2 · Impressum/Datenschutz 2 ·
 * Permalink-Auflösungen der Stichprobe rund 23. Mit `--refresh` werden **nur** robots.txt und Sitemaps neu
 * abgerufen (zweiter, unabhängiger Lauf für den Fixpunkt); alles Übrige kommt aus dem Cache.
 *
 * Ohne `--write` wird nichts geschrieben; abgerufen wird trotzdem, damit der Dry-run dieselbe Aussage trifft.
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { evaluateRobots, JURIS_SH_ACCESS_POLICY, parseRobots, PORTAL_HOST, ROBOTS_URL, SITEMAP_INDEX_URL, type RobotsVerdict } from '../access/policy.ts';
import { collectTermsFindings, type TermsFindings } from '../access/terms.ts';
import { AUDIT_DIR, IMPORT_DATA_DIR } from '../common/constants.ts';
import { createJurisShFetcher, decodeHtml, USER_AGENT, type FetchedDocument, type JurisShFetcher, type JurisShFetcherOptions } from '../common/fetcher.ts';
import { enumerationPath } from '../common/paths.ts';
import { crosscheckSitemap, type CrosscheckResult } from './crosscheck.ts';
import { buildEnumeration, checkEnumeration, ENUMERABLE_AREAS, readEnumeration, writeEnumeration, type EnumerableArea, type EnumerationFile, type SourceRecord } from './enumeration.ts';
import { DOCUMENT_FAMILIES, FAMILY_SCOPE, inventorySitemaps, parseSitemapLocations, type DocumentFamily, type SitemapInventory } from './sitemap.ts';

export const ROBOTS_RECORD_PATH = `${AUDIT_DIR}/discovery/robots.json`;
export const SOURCE_INVENTORY_JSON_PATH = `${AUDIT_DIR}/source-inventory.json`;
export const SOURCE_INVENTORY_MD_PATH = `${AUDIT_DIR}/SOURCE_INVENTORY.md`;
export const SOURCE_INVENTORY_SCHEMA = 'juris-sh-source-inventory/1' as const;

/** Budget eines Enumerationslaufs (Netzabrufe); großzügig über dem erwarteten Bedarf, aber begrenzt. */
export const ENUMERATE_REQUEST_BUDGET = 60;

export interface RobotsRecord {
  host: string;
  policy: typeof JURIS_SH_ACCESS_POLICY.robotsPolicy;
  decision: typeof JURIS_SH_ACCESS_POLICY.decision;
  fetch: SourceRecord;
  verbatim: string;
  userAgent: string;
  /** Bewertung repräsentativer Pfade für den eigenen User-Agent – Befund, keine Sperre (`advisory`). */
  verdicts: Array<{ path: string } & RobotsVerdict>;
  sitemaps: string[];
}

export interface RegisterPlausibility {
  gvoblSystematicOverview?: { asOf?: string; normsWithRegisterEvents: number };
  erlassverzeichnis?: { asOf?: string; entries: number };
}

export interface SourceInventory {
  schemaVersion: typeof SOURCE_INVENTORY_SCHEMA;
  portal: { host: string };
  access: {
    robots: Omit<RobotsRecord, 'verbatim'>;
    forbiddenPaths: typeof JURIS_SH_ACCESS_POLICY.forbiddenPaths;
    minDelayMs: number;
    terms: TermsFindings;
  };
  sitemap: {
    index: SourceRecord;
    sitemaps: SourceRecord[];
    byFamily: Record<DocumentFamily, number>;
    duplicates: number;
    otherUrls: string[];
    orphanUnits: string[];
    registers: string[];
    unknown: string[];
  };
  scope: Array<{ family: DocumentFamily; count: number; scope: string; reason: string }>;
  areas: Record<EnumerableArea, { path: string; items: number; units?: number; fingerprint: string; fixpoint: EnumerationFile['fixpoint'] }>;
  crosscheck: CrosscheckResult;
  registers: RegisterPlausibility;
}

export interface EnumerateOptions {
  root: string;
  write: boolean;
  offline: boolean;
  /** robots.txt und Sitemaps neu abrufen (zweiter, unabhängiger Lauf). */
  refresh: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
  /** Austauschbarer Fetcher (Tests); sonst der Adapter-Fetcher mit Budget. */
  createFetcher?: (options: JurisShFetcherOptions) => JurisShFetcher;
  sleep?: (ms: number) => Promise<void>;
}

export interface EnumerateResult {
  files: Record<EnumerableArea, EnumerationFile>;
  inventory: SourceInventory;
  invariantProblems: string[];
  written: string[];
  network: { requests: number; cacheHits: number; bytes: number; retries: number; blocked: number };
}

function record(document: FetchedDocument): SourceRecord {
  return { url: document.url, finalUrl: document.finalUrl, httpStatus: document.status, sha256: document.sha256, byteLength: document.bytes.byteLength, retrievedAt: document.retrievedAt };
}

/** Plausibilität gegen die amtlichen Register des Ereignisregisters (keine Zuordnung – nur Größenordnungen). */
async function registerPlausibility(root: string): Promise<RegisterPlausibility> {
  const result: RegisterPlausibility = {};
  const ledger = await readJsonFile<{ sources?: Array<{ id: string; asOf?: string }>; events?: Array<{ sourceId: string; targetTitle?: string; targetGliederungsnummer?: string }> }>(join(root, IMPORT_DATA_DIR, 'events', 'ledger.json'));
  if (ledger?.events) {
    const targets = new Set(ledger.events.filter((event) => event.sourceId === 'gvobl-systematische-uebersicht').map((event) => `${event.targetGliederungsnummer ?? ''}|${event.targetTitle ?? ''}`));
    const asOf = ledger.sources?.find((source) => source.id === 'gvobl-systematische-uebersicht')?.asOf;
    result.gvoblSystematicOverview = { ...(asOf ? { asOf } : {}), normsWithRegisterEvents: targets.size };
  }
  const vwv = await readJsonFile<{ registerAsOf?: string; entries?: unknown[] }>(join(root, IMPORT_DATA_DIR, 'events', 'vwv-inventory.json'));
  if (vwv?.entries) result.erlassverzeichnis = { ...(vwv.registerAsOf ? { asOf: vwv.registerAsOf } : {}), entries: vwv.entries.length };
  return result;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function runEnumerate(options: EnumerateOptions): Promise<EnumerateResult> {
  const log = options.log ?? ((): void => undefined);
  const sleep = options.sleep ?? defaultSleep;
  const create = options.createFetcher ?? createJurisShFetcher;
  const base: JurisShFetcherOptions = { root: options.root, offline: options.offline, budget: { maxRequests: ENUMERATE_REQUEST_BUDGET }, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}) };

  // 1. Quellen der Enumeration (mit --refresh neu abgerufen).
  const sources = create({ ...base, refresh: options.refresh });
  const robotsDocument = await sources.fetch(ROBOTS_URL);
  const robotsText = decodeHtml(robotsDocument);
  const robots = parseRobots(robotsText);
  const verdicts = ['/robots.txt', '/sitemapindex.xml', '/bssh/document/jlr-NNLSH00002D11', '/bssh/document/jlr-NNLSH00002D11/format/xsl', '/perma?d=jlr-VerfSH2014rahmen'].map((path) => ({ path, ...evaluateRobots(robots, USER_AGENT, path) }));
  const robotsRecord: RobotsRecord = { host: PORTAL_HOST, policy: JURIS_SH_ACCESS_POLICY.robotsPolicy, decision: JURIS_SH_ACCESS_POLICY.decision, fetch: record(robotsDocument), verbatim: robotsText, userAgent: USER_AGENT, verdicts, sitemaps: robots.sitemaps };
  log(`robots.txt: ${verdicts.filter((verdict) => verdict.verdict === 'disallowed').length}/${verdicts.length} Pfade „disallowed“ für ${USER_AGENT.split(' ')[0]} – Politik ${robotsRecord.policy} (Befund, keine Sperre)`);

  if (!robots.sitemaps.includes(SITEMAP_INDEX_URL)) log(`Hinweis: robots.txt deklariert ${robots.sitemaps.join(', ') || 'keine Sitemap'} statt ${SITEMAP_INDEX_URL}`);
  const indexDocument = await sources.fetch(SITEMAP_INDEX_URL);
  const sitemapUrls = parseSitemapLocations(decodeHtml(indexDocument), 'sitemapindex');
  const sitemapRecords: SourceRecord[] = [];
  const locationLists: string[][] = [];
  for (const url of sitemapUrls) {
    const document = await sources.fetch(url);
    const locations = parseSitemapLocations(decodeHtml(document), 'urlset');
    log(`${url}: ${locations.length} Adressen (${document.bytes.byteLength} Bytes${document.fromCache ? ', Cache' : ''})`);
    sitemapRecords.push(record(document));
    locationLists.push(locations);
  }
  const inventory: SitemapInventory = inventorySitemaps(locationLists);
  log(`Sitemap: ${inventory.documentIds.length} Dokumente · ${Object.entries(inventory.byFamily).filter(([, count]) => count > 0).map(([family, count]) => `${family} ${count}`).join(' · ')}`);

  // 2. Enumeration je Bereich mit Fixpunktvergleich gegen den gespeicherten Vorgänger.
  const files = {} as Record<EnumerableArea, EnumerationFile>;
  const invariantProblems: string[] = [];
  for (const area of ENUMERABLE_AREAS) {
    const previous = await readEnumeration(options.root, area);
    const file = buildEnumeration({ area, inventory, sitemapIndex: record(indexDocument), sitemaps: sitemapRecords, ...(previous ? { previous } : {}) });
    invariantProblems.push(...checkEnumeration(file).map((problem) => `${area}: ${problem}`));
    files[area] = file;
    log(`Enumeration ${area}: ${file.counts.items} Einträge${file.counts.units !== undefined ? ` (${file.counts.units} Einheiten)` : ''} · Fixpunkt ${file.fixpoint.stable ? `stabil, ${file.fixpoint.confirmations} Bestätigung(en)` : file.fixpoint.previousFingerprint ? 'ABWEICHUNG zum Vorgänger' : 'erster Lauf'}`);
  }

  // 3. Nutzungsbedingungen und Stichprobenabgleich – aus dem Cache, soweit vorhanden (nie mit --refresh).
  if (sources.stats.networkRequests > 0) await sleep(JURIS_SH_ACCESS_POLICY.minDelayMs);
  const others = create(base);
  const terms = await collectTermsFindings(others);
  const crosscheck = await crosscheckSitemap({ root: options.root, fetcher: others, inventory, log: (line) => log(`  Abgleich: ${line}`) });
  log(`Stichprobe (${crosscheck.source}): ${crosscheck.samples} Kennungen, aufgelöst ${crosscheck.resolved}, in der Sitemap ${crosscheck.inSitemap}, nicht in der Sitemap ${crosscheck.notInSitemap}, unaufgelöst ${crosscheck.unresolved}`);

  const sourceInventory: SourceInventory = {
    schemaVersion: SOURCE_INVENTORY_SCHEMA,
    portal: { host: PORTAL_HOST },
    access: { robots: { host: robotsRecord.host, policy: robotsRecord.policy, decision: robotsRecord.decision, fetch: robotsRecord.fetch, userAgent: robotsRecord.userAgent, verdicts: robotsRecord.verdicts, sitemaps: robotsRecord.sitemaps }, forbiddenPaths: JURIS_SH_ACCESS_POLICY.forbiddenPaths, minDelayMs: JURIS_SH_ACCESS_POLICY.minDelayMs, terms },
    sitemap: { index: record(indexDocument), sitemaps: sitemapRecords, byFamily: inventory.byFamily, duplicates: inventory.duplicates.length, otherUrls: inventory.otherUrls, orphanUnits: inventory.orphanUnits, registers: inventory.registers, unknown: inventory.unknown },
    scope: DOCUMENT_FAMILIES.map((family) => ({ family, count: inventory.byFamily[family], ...FAMILY_SCOPE[family] })),
    areas: Object.fromEntries(ENUMERABLE_AREAS.map((area) => [area, { path: enumerationPath(area), items: files[area].counts.items, ...(files[area].counts.units !== undefined ? { units: files[area].counts.units } : {}), fingerprint: files[area].fingerprint, fixpoint: files[area].fixpoint }])) as SourceInventory['areas'],
    crosscheck,
    registers: await registerPlausibility(options.root),
  };

  const written: string[] = [];
  if (options.write && invariantProblems.length === 0) {
    if (await writeJsonAtomic(join(options.root, ROBOTS_RECORD_PATH), robotsRecord)) written.push(ROBOTS_RECORD_PATH);
    for (const area of ENUMERABLE_AREAS) if (await writeEnumeration(options.root, files[area])) written.push(enumerationPath(area));
    if (await writeJsonAtomic(join(options.root, SOURCE_INVENTORY_JSON_PATH), sourceInventory)) written.push(SOURCE_INVENTORY_JSON_PATH);
    const { renderSourceInventory } = await import('../reports/render.ts');
    if (await writeFileAtomic(join(options.root, SOURCE_INVENTORY_MD_PATH), renderSourceInventory(sourceInventory, robotsRecord.verbatim))) written.push(SOURCE_INVENTORY_MD_PATH);
  }

  const stats = [sources.stats, others.stats];
  return {
    files,
    inventory: sourceInventory,
    invariantProblems,
    written,
    network: {
      requests: stats.reduce((sum, entry) => sum + entry.networkRequests, 0),
      cacheHits: stats.reduce((sum, entry) => sum + entry.cacheHits, 0),
      bytes: stats.reduce((sum, entry) => sum + (entry.bytesDownloaded ?? 0), 0),
      retries: stats.reduce((sum, entry) => sum + (entry.retries ?? 0), 0),
      blocked: stats.reduce((sum, entry) => sum + (entry.blockedResponses ?? 0), 0),
    },
  };
}
