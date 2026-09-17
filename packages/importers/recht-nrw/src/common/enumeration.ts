/**
 * Vollständige Enumeration der Stammnormen je Quellbereich (`data/imports/recht-nrw/enumeration-<bereich>.json`).
 *
 * Quellen:
 *   Sitemaps     `/sitemap.xml` → `/sitemap/page/<n>/sitemap.xml`: jede Fassungsseite (datiert und undatiert)
 *   Suchindex    OpenSearch-Middleware (`/search-middleware/opensearch_internet/_search`): je Stammnorm die
 *                aktuellste Fassung mit Titel, Dokumenttyp, Abkürzung, Geltungsangaben, `field_historically`
 *   Manifest     bereits aufgelöste Stammnormen (Term-ID ↔ Fassungsadressen)
 *
 * Weder Sitemap noch Suchindex nennen die Taxonomie-Term-ID. Die Enumeration gruppiert deshalb Fassungsadressen
 * über den Slug-Stamm (`<typ>/<slug>`), verknüpft Suchtreffer über ihre Adresse und übernimmt bekannte Term-IDs
 * aus Manifest und früherer Enumeration. Autoritativ ist erst die Fassungsliste der abgerufenen Seite: Der
 * Bulk-Lauf ordnet jedem Eintrag die Term-ID zu, führt Einträge derselben Stammnorm zusammen (Slugänderungen
 * zwischen Fassungen) und trennt fremde Adressen ab.
 *
 * Status: pending | processing | done | review | failed | excluded. `processing` markiert die gerade bearbeitete
 * Stammnorm (Checkpoint vor der Arbeit); nach einem harten Abbruch gilt sie beim Resume als offen.
 * Ausgabe ist deterministisch sortiert; ein Wiederholungslauf mit unveränderten Quellen ändert die Datei nicht.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { parseTreatyInForceNotice } from '../lrgv/treaty.ts';
import { readJsonFile, writeFileAtomic } from './atomic.ts';
import { BASE_URL } from './constants.ts';
import { decodeHtml, type RechtNrwFetcher } from './fetcher.ts';
import { compareSourceIdentity, IMPORT_DATA_DIR, isImportedStatus, type ImportManifest, type ImportStatus, type ManifestEntry, type SourceArea } from './manifest.ts';
import { normalizeVersionUrl, parseVersionUrl } from './source-identity.ts';
import { stableStringify } from './stable-json.ts';

export const ENUMERATION_SCHEMA = 'recht-nrw-enumeration/1' as const;
export const ENUMERATION_STATUSES = ['pending', 'processing', 'done', 'review', 'failed', 'excluded'] as const;
export type EnumerationStatus = (typeof ENUMERATION_STATUSES)[number];
export const PRECLASSIFICATIONS = ['likely-include', 'likely-exclude', 'review', 'unknown'] as const;
export type Preclassification = (typeof PRECLASSIFICATIONS)[number];

export const SITEMAP_INDEX_URL = `${BASE_URL}/sitemap.xml`;
export const SEARCH_URL = `${BASE_URL}/search-middleware/opensearch_internet/_search`;
export const SEARCH_INDEX_TYPES: Record<SourceArea, readonly string[]> = { lrgv: ['state_law_and_regulations'], lrmb: ['state_law_ministerial_gazette'] };
export const SEARCH_PAGE_SIZE = 500;
export const SEARCH_SOURCE_FIELDS = ['url', 'title', 'type', 'field_document_type_name', 'field_effective_from', 'field_inforce_date', 'field_outforce_date', 'field_historically', 'field_date_of_issue', 'field_abbreviation', 'field_long_title', 'field_short_title', 'uuid', 'search_api_id'] as const;

export function enumerationPath(area: SourceArea): string {
  return join(IMPORT_DATA_DIR, `enumeration-${area}.json`);
}

export interface SearchHit {
  nodeId: string;
  uuid?: string;
  url: string;
  indexType: string;
  title: string;
  documentTypeName?: string;
  abbreviation?: string;
  effectiveFrom?: string;
  inforceDate?: string;
  outforceDate?: string;
  historically?: boolean;
  dateOfIssue?: string;
}

export type SearchSignals = Omit<SearchHit, 'url' | 'indexType' | 'title'>;

export interface EnumerationItem {
  /** Stabiler Schlüssel: `term:<id>` oder `stem:<typ>/<slug>` (bis zur Auflösung im Bulk-Lauf). */
  key: string;
  /** `term:<id>`, sobald die Fassungsliste die Stammnorm belegt. */
  sourceIdentity?: string;
  entryUrl: string;
  portalType: string;
  title: string;
  titleSource: 'search-index' | 'slug' | 'manifest';
  status: EnumerationStatus;
  /** Alle bekannten Fassungsadressen (sortiert). */
  urls: string[];
  signals: { sitemap: boolean; search: boolean };
  search?: SearchSignals;
  preclassification: { decision: Preclassification; reasons: string[] };
  role: 'norm-candidate' | 'evidence';
  evidence?: { kind: 'treaty-in-force-notice' | 'notice'; treatyTitle?: string };
  /** Zusammengeführt in die Stammnorm (Slugänderung) – Eintrag wird nicht erneut verarbeitet. */
  mergedInto?: string;
  attempts: number;
  lastError?: { code: string; message: string };
  outcome?: { importStatus: string; targetSlug?: string; reviewCategories?: string[]; parserVersion?: string; transformerVersion?: string };
  /** Laufmetadaten (nicht Teil des fachlichen Fingerabdrucks). */
  updatedAt?: string;
  lastRunId?: string;
}

export interface EnumerationCrosscheck {
  sitemapUrls: number;
  sitemapStems: number;
  searchHits: number;
  searchUniqueUrls: number;
  duplicateSearchUrls: number;
  searchHitsInSitemap: number;
  searchHitsNotInSitemap: number;
  union: number;
  intersection: number;
  onlySitemap: number;
  onlySearch: number;
  items: number;
  resolvedTerms: number;
  review: number;
  excluded: number;
  unassignedUrls: number;
  duplicateUrlAssignments: number;
  termConflicts: number;
  /** Quellidentitäten mit mehr als einem aktiven (nicht zusammengeführten) Eintrag – immer ein Abgleichsproblem. */
  duplicateIdentities?: number;
  ok: boolean;
  problems: string[];
  /** Fachlich erklärbare Quellbefunde (z. B. Fassungslisten mit Adressen mehrerer Stammnormen); kein Fehler. */
  notes: string[];
}

export interface EnumerationFile {
  schemaVersion: typeof ENUMERATION_SCHEMA;
  sourceArea: SourceArea;
  baselineDate: string;
  /** Laufmetadatum: ändert sich nur mit dem fachlichen Inhalt. */
  generatedAt: string;
  contentFingerprint: string;
  sources: {
    sitemap: { indexUrl: string; pages: number; urls: number };
    search: { url: string; indexTypes: string[]; total: number; hits: number };
  };
  crosscheck: EnumerationCrosscheck;
  items: EnumerationItem[];
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decodeXml = (value: string): string => value.replace(/&(?:amp|lt|gt|quot|apos);/gu, (entity) => ENTITIES[entity] ?? entity).trim();

export function parseSitemapIndex(xml: string): string[] {
  if (!/<sitemapindex\b/u.test(xml)) throw new Error('Keine Sitemap-Indexdatei');
  return [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gu)].map((match) => decodeXml(match[1]!));
}

export function parseSitemapUrlset(xml: string): Array<{ loc: string; lastmod?: string }> {
  if (!/<urlset\b/u.test(xml)) throw new Error('Keine Sitemap-Seite (urlset)');
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gu)].map((match) => {
    const loc = /<loc>([^<]+)<\/loc>/u.exec(match[1]!)?.[1];
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/u.exec(match[1]!)?.[1];
    return lastmod ? { loc: decodeXml(loc ?? ''), lastmod: decodeXml(lastmod) } : { loc: decodeXml(loc ?? '') };
  }).filter((entry) => entry.loc);
}

export function searchRequestBody(indexType: string, size = SEARCH_PAGE_SIZE, searchAfter?: readonly unknown[]): string {
  const body: Record<string, unknown> = { size, track_total_hits: true, query: { bool: { filter: [{ term: { type: indexType } }] } }, _source: [...SEARCH_SOURCE_FIELDS], sort: [{ search_api_id: 'asc' }] };
  if (searchAfter) body.search_after = searchAfter;
  return JSON.stringify(body);
}

const BERLIN_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Unix-Sekunden des Suchindex → Kalenderdatum (Europe/Berlin). */
export function epochToIsoDate(value: unknown): string | undefined {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : undefined;
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return BERLIN_DATE.format(new Date(seconds * 1000));
}

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const firstString = (value: unknown): string | undefined => {
  const entry = first(value);
  return typeof entry === 'string' && entry.trim() ? entry.replace(/\s+/gu, ' ').trim() : undefined;
};

export function cleanSearchTitle(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(/^\d{2}\.\d{2}\.\d{4}\s+/u, '').trim();
}

/** `rawHitCount`: Treffer der Seite vor dem Verwerfen unbrauchbarer Einträge (maßgeblich fürs Blättern). */
export function parseSearchResponse(text: string): { total: number; hits: SearchHit[]; rawHitCount: number; lastSort?: unknown[] } {
  const json = JSON.parse(text) as { hits?: { total?: { value?: number } | number; hits?: Array<{ _id?: string; _source?: Record<string, unknown>; sort?: unknown[] }> } };
  if (!json.hits || !Array.isArray(json.hits.hits)) throw new Error('Suchantwort ohne hits');
  const total = typeof json.hits.total === 'number' ? json.hits.total : json.hits.total?.value ?? 0;
  const hits: SearchHit[] = [];
  for (const raw of json.hits.hits) {
    const source = raw._source ?? {};
    const path = firstString(source.url);
    const searchId = firstString(source.search_api_id) ?? raw._id ?? '';
    const nodeId = /node\/(\d+)/u.exec(searchId)?.[1];
    if (!path || !nodeId) continue;
    const hit: SearchHit = { nodeId, url: normalizeVersionUrl(new URL(path, BASE_URL).toString()), indexType: firstString(source.type) ?? '', title: cleanSearchTitle(firstString(source.field_long_title) ?? firstString(source.title) ?? '') };
    const uuid = firstString(source.uuid);
    if (uuid) hit.uuid = uuid;
    const documentType = firstString(source.field_document_type_name);
    if (documentType) hit.documentTypeName = documentType;
    const abbreviation = firstString(source.field_abbreviation);
    if (abbreviation) hit.abbreviation = abbreviation;
    for (const [field, key] of [['field_effective_from', 'effectiveFrom'], ['field_inforce_date', 'inforceDate'], ['field_outforce_date', 'outforceDate'], ['field_date_of_issue', 'dateOfIssue']] as const) {
      const date = epochToIsoDate(first(source[field]));
      if (date) hit[key] = date;
    }
    const historically = first(source.field_historically);
    if (typeof historically === 'boolean') hit.historically = historically;
    hits.push(hit);
  }
  const last = json.hits.hits[json.hits.hits.length - 1];
  const rawHitCount = json.hits.hits.length;
  return last?.sort ? { total, hits, rawHitCount, lastSort: last.sort } : { total, hits, rawHitCount };
}

/* ------------------------------------------------------------------------------------------ */
/* Abruf (über den zentralen Fetcher: Mindestabstand, Budget, Cache).                          */

export async function fetchSitemapUrls(fetcher: RechtNrwFetcher, log: (line: string) => void = () => undefined): Promise<{ pages: string[]; urls: string[] }> {
  const index = await fetcher.fetch(SITEMAP_INDEX_URL, { accept: 'application/xml,text/xml;q=0.9' });
  const pages = parseSitemapIndex(decodeHtml(index));
  const urls: string[] = [];
  for (const page of pages) {
    log(`Sitemap ${page}`);
    const document = await fetcher.fetch(page, { accept: 'application/xml,text/xml;q=0.9' });
    for (const entry of parseSitemapUrlset(decodeHtml(document))) urls.push(entry.loc);
  }
  return { pages, urls };
}

export async function fetchSearchHits(fetcher: RechtNrwFetcher, indexType: string, log: (line: string) => void = () => undefined): Promise<{ total: number; hits: SearchHit[] }> {
  const hits: SearchHit[] = [];
  let searchAfter: unknown[] | undefined;
  let total = 0;
  for (let page = 0; page < 1_000; page += 1) {
    const body = searchRequestBody(indexType, SEARCH_PAGE_SIZE, searchAfter);
    const document = await fetcher.fetch(SEARCH_URL, { method: 'POST', body, contentType: 'application/json', accept: 'application/json' });
    const parsed = parseSearchResponse(decodeHtml(document));
    total = parsed.total;
    hits.push(...parsed.hits);
    log(`Suchindex ${indexType}: ${hits.length}/${total}`);
    // Unbrauchbare Treffer (ohne Adresse/Knoten) dürfen das Blättern nicht vorzeitig beenden.
    if (parsed.rawHitCount < SEARCH_PAGE_SIZE || !parsed.lastSort) break;
    searchAfter = parsed.lastSort;
  }
  return { total, hits };
}

/* ------------------------------------------------------------------------------------------ */
/* Vorklassifikation (ohne Seitenabruf).                                                        */

/** Titel mit eindeutigem Ausschlussgrund: ohne Seitenabruf `excluded` (docs/LEGAL_SCOPE.md). */
export const SAFE_TITLE_EXCLUSIONS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^(?:Stellenausschreibung|Ausschreibung\s+(?:von\s+)?Stellen|Stellenangebot)/u, reason: 'Stellenausschreibung' },
  { pattern: /^Personalnachrichten?\b/u, reason: 'Personalnachricht' },
  { pattern: /^(?:\d+\.\s+)?(?:öffentliche\s+)?Sitzung\s+(?:der|des)\b|^Tagesordnung\b/u, reason: 'Sitzungs- oder Tagesordnungsbekanntmachung' },
  { pattern: /^(?:Wahlergebnis|Ergebnis\s+der\s+Wahl|Wahlbekanntmachung)\b/u, reason: 'Wahlbekanntmachung' },
  { pattern: /^Berichtigung\b/u, reason: 'Berichtigung (an der berichtigten Vorschrift berücksichtigt)' },
];

const LIKELY_EXCLUDE_TITLE: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /Satzung\b|Hauptsatzung|Beitragsordnung|Berufsordnung|Weiterbildungsordnung/u, reason: 'möglicherweise autonome Satzung einer Körperschaft' },
  { pattern: /Plangenehmigung|Planfeststellung|Genehmigung\s+(?:des|der)\s+[A-ZÄÖÜ]/u, reason: 'möglicherweise Einzelfallentscheidung' },
  { pattern: /Verleihung|Anerkennung\s+als\s+(?:Erholungsort|Luftkurort|Kurort|Heilbad)/u, reason: 'möglicherweise Verleihung/Anerkennung' },
  { pattern: /Bestimmung\s+der\s+zuständigen\s+Behörde\s+für\s+die\s+[A-ZÄÖÜ]/u, reason: 'möglicherweise Einzelfall-Zuständigkeitsbestimmung' },
];

const REVIEW_TITLE = /\bHinweise\b|\bEmpfehlungen?\b|\bMerkblatt\b|\bLeitfaden\b|\bHandreichung\b|\bArbeitshilfe\b|\bMuster\b|\bVordruck|\bKopferlass\b/u;
const LIKELY_NORM_TITLE = /Verwaltungsvorschrift|\bVV\b|Richtlinie|Runderlass|\bRdErl\.|Erlass\b|Bestimmungen|Durchführung|Grundsätze|Regelung/u;
const EVIDENCE_TITLE = /Inkrafttreten|Neufassung|Neubekanntmachung|Bekanntmachung\s+der\s+Fassung|Berichtigung|Außerkrafttreten/u;

export function preclassify(area: SourceArea, portalType: string, title: string): { decision: Preclassification; reasons: string[]; safeExclusion: boolean; role: EnumerationItem['role']; evidence?: EnumerationItem['evidence'] } {
  const cleanTitle = title.replace(/\s+/gu, ' ').trim();
  const safe = SAFE_TITLE_EXCLUSIONS.filter((entry) => entry.pattern.test(cleanTitle)).map((entry) => entry.reason);
  if (area === 'lrgv') {
    if (portalType === 'gesetz' || portalType === 'rechtsverordnung') return { decision: 'likely-include', reasons: [`Portaltyp ${portalType}`], safeExclusion: false, role: 'norm-candidate' };
    if (portalType === 'bekanntmachung') {
      const treaty = parseTreatyInForceNotice(cleanTitle);
      const evidence: EnumerationItem['evidence'] = treaty ? { kind: 'treaty-in-force-notice', treatyTitle: treaty.treatyTitle } : { kind: 'notice' };
      return { decision: 'likely-exclude', reasons: [`LRGV-Bekanntmachung: keine eigene Vorschrift (docs/LEGAL_SCOPE.md), Evidenzquelle${EVIDENCE_TITLE.test(cleanTitle) ? ' (Inkrafttreten/Neufassung)' : ''}`], safeExclusion: false, role: 'evidence', evidence };
    }
    return { decision: 'review', reasons: [`Portaltyp ${portalType} im Bereich LRGV`], safeExclusion: false, role: 'norm-candidate' };
  }
  if (safe.length > 0) return { decision: 'likely-exclude', reasons: safe, safeExclusion: true, role: 'norm-candidate' };
  const likelyExclude = LIKELY_EXCLUDE_TITLE.filter((entry) => entry.pattern.test(cleanTitle)).map((entry) => entry.reason);
  if (likelyExclude.length > 0) return { decision: 'likely-exclude', reasons: [...likelyExclude, 'Grenzfall: Seite wird geladen'], safeExclusion: false, role: 'norm-candidate' };
  if (portalType !== 'verwaltungsvorschrift') return { decision: 'review', reasons: [`Portaltyp ${portalType}: normativer Gehalt nur nach Seitenabruf feststellbar`], safeExclusion: false, role: 'norm-candidate' };
  if (REVIEW_TITLE.test(cleanTitle)) return { decision: 'review', reasons: ['Hinweise/Empfehlungen/Muster: Verbindlichkeit nur nach Seitenabruf feststellbar'], safeExclusion: false, role: 'norm-candidate' };
  if (LIKELY_NORM_TITLE.test(cleanTitle)) return { decision: 'likely-include', reasons: ['Titel nennt Verwaltungsvorschrift/Erlass/Richtlinie'], safeExclusion: false, role: 'norm-candidate' };
  return { decision: 'unknown', reasons: ['Titel ohne eindeutige Zuordnung'], safeExclusion: false, role: 'norm-candidate' };
}

/* ------------------------------------------------------------------------------------------ */
/* Aufbau.                                                                                      */

/** true, wenn `candidate` gegenüber `current` bevorzugt wird: jüngeres Pfaddatum, bei Gleichstand kleinere Adresse. */
export function preferredSearchHit(candidate: SearchHit, current: SearchHit): boolean {
  const candidateDate = parseVersionUrl(candidate.url)?.pathDate ?? '';
  const currentDate = parseVersionUrl(current.url)?.pathDate ?? '';
  if (candidateDate !== currentDate) return candidateDate > currentDate;
  return candidate.url < current.url;
}

export function humanizeSlug(slug: string): string {
  const text = slug.replace(/-/gu, ' ').trim();
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : slug;
}

function compareKeys(left: string, right: string): number {
  const leftTerm = left.startsWith('term:');
  const rightTerm = right.startsWith('term:');
  if (leftTerm && rightTerm) return compareSourceIdentity(left, right);
  if (leftTerm !== rightTerm) return leftTerm ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export const ENUMERATION_ITEM_RUNTIME_FIELDS = ['updatedAt', 'lastRunId'] as const;

/** Enumerationsstatus zu einem Manifest-Importstatus (dieselbe Zuordnung wie der Bulk-Runner). */
export function statusForImportStatus(importStatus: ImportStatus | string): EnumerationStatus {
  if (importStatus === 'needs-review') return 'review';
  if (importStatus === 'excluded') return 'excluded';
  if (importStatus === 'failed') return 'failed';
  if (isImportedStatus(importStatus as ImportStatus) || importStatus === 'not-at-baseline' || importStatus === 'dry-run') return 'done';
  return 'failed';
}

function outcomeFromManifest(entry: ManifestEntry): NonNullable<EnumerationItem['outcome']> {
  return { importStatus: entry.importStatus, ...(entry.targetSlug ? { targetSlug: entry.targetSlug } : {}), parserVersion: entry.parserVersion, transformerVersion: entry.transformerVersion };
}

/** Quellidentitäten, die mehr als ein aktiver Eintrag trägt (Dublette: doppelte Zählung, doppelte Verarbeitung). */
export function findDuplicateIdentities(file: Pick<EnumerationFile, 'items'>): Array<{ sourceIdentity: string; keys: string[] }> {
  const byIdentity = new Map<string, string[]>();
  for (const item of file.items) {
    if (item.mergedInto || !item.sourceIdentity) continue;
    byIdentity.set(item.sourceIdentity, [...(byIdentity.get(item.sourceIdentity) ?? []), item.key]);
  }
  return [...byIdentity.entries()].filter(([, keys]) => keys.length > 1).map(([sourceIdentity, keys]) => ({ sourceIdentity, keys })).sort((left, right) => compareSourceIdentity(left.sourceIdentity, right.sourceIdentity));
}

/**
 * Strukturelle Invarianten einer Enumeration (Audit, Coverage):
 *   - jede Quellidentität hat höchstens einen aktiven Eintrag
 *   - jeder zusammengeführte Eintrag zeigt auf eine aktive Quellidentität (oder, sofern bekannt, einen Manifesteintrag)
 *   - Statuszählung: aktive Einträge = Summe aller Status; Einträge = aktive + zusammengeführte
 *   - abgetrennte Einträge tragen höchstens ein „@datum“ (keine rekursiv wachsenden Schlüssel)
 *   - jede Adresse gehört zu genau einem Eintrag (Ausnahme: aus dem Manifest geführte Terme teilen sich Adressen mit ihrem Slug-Stamm)
 */
export function checkEnumerationInvariants(file: Pick<EnumerationFile, 'items'>, options: { manifestIdentities?: ReadonlySet<string> } = {}): string[] {
  const problems: string[] = [];
  const active = file.items.filter((item) => !item.mergedInto);
  const merged = file.items.filter((item) => item.mergedInto);
  for (const duplicate of findDuplicateIdentities(file)) problems.push(`${duplicate.sourceIdentity}: ${duplicate.keys.length} aktive Einträge (${duplicate.keys.join(', ')})`);
  const activeIdentities = new Set(active.map((item) => item.sourceIdentity).filter((value): value is string => Boolean(value)));
  for (const item of merged) {
    if (activeIdentities.has(item.mergedInto!)) continue;
    if (options.manifestIdentities?.has(item.mergedInto!)) continue;
    problems.push(`${item.key}: zusammengeführt in ${item.mergedInto}, aber kein aktiver Eintrag${options.manifestIdentities ? ' und kein Manifesteintrag' : ''} mit dieser Quellidentität`);
  }
  const counts = enumerationStatusCounts(file as EnumerationFile);
  const sum = Object.values(counts).reduce((total, value) => total + value, 0);
  if (sum !== active.length) problems.push(`Statussumme ${sum} ≠ aktive Einträge ${active.length}`);
  if (active.length + merged.length !== file.items.length) problems.push(`aktive ${active.length} + zusammengeführte ${merged.length} ≠ Einträge ${file.items.length}`);
  for (const item of file.items) {
    if ((item.key.match(/@/gu) ?? []).length > 1) problems.push(`${item.key}: rekursiv gewachsener Abtrennungsschlüssel`);
    if (!(ENUMERATION_STATUSES as readonly string[]).includes(item.status)) problems.push(`${item.key}: unbekannter Status ${item.status}`);
    if (item.mergedInto && item.sourceIdentity && item.sourceIdentity !== item.mergedInto) problems.push(`${item.key}: Quellidentität ${item.sourceIdentity} widerspricht der Zusammenführung in ${item.mergedInto}`);
  }
  return problems;
}

export function enumerationFingerprint(file: Pick<EnumerationFile, 'sourceArea' | 'baselineDate' | 'items' | 'sources' | 'crosscheck'>): string {
  const items = file.items.map((item) => {
    const copy: Record<string, unknown> = { ...item };
    for (const field of ENUMERATION_ITEM_RUNTIME_FIELDS) delete copy[field];
    return copy;
  });
  return createHash('sha256').update(stableStringify({ sourceArea: file.sourceArea, baselineDate: file.baselineDate, sources: file.sources, crosscheck: file.crosscheck, items })).digest('hex');
}

export interface BuildEnumerationInput {
  area: SourceArea;
  sitemap: { pages: number; urls: readonly string[] };
  search: { total: number; hits: readonly SearchHit[] };
  previous?: EnumerationFile;
  manifest?: ImportManifest;
  now: string;
}

export function buildEnumeration(input: BuildEnumerationInput): EnumerationFile {
  const { area } = input;
  const problems: string[] = [];
  const notes: string[] = [];

  // 1. Sitemap-Adressen des Bereichs nach Slug-Stamm gruppieren.
  const stems = new Map<string, { portalType: string; slug: string; urls: Set<string>; sitemap: boolean }>();
  const sitemapUrls = new Set<string>();
  for (const raw of input.sitemap.urls) {
    const address = parseVersionUrl(raw);
    if (!address || address.section !== area) continue;
    sitemapUrls.add(address.url);
    const key = `${address.documentType}/${address.slug}`;
    const stem = stems.get(key) ?? { portalType: address.documentType, slug: address.slug, urls: new Set<string>(), sitemap: true };
    stem.urls.add(address.url);
    stems.set(key, stem);
  }
  const sitemapStemCount = stems.size;
  const stemOfUrl = new Map<string, string>();
  for (const [key, stem] of stems) for (const url of stem.urls) stemOfUrl.set(url, key);

  // 2. Suchtreffer über ihre Adresse verknüpfen.
  const hitsByUrl = new Map<string, SearchHit>();
  let duplicateSearchUrls = 0;
  let searchHitsInSitemap = 0;
  let onlySearch = 0;
  const searchStemKeys = new Set<string>();
  for (const hit of input.search.hits) {
    const address = parseVersionUrl(hit.url);
    if (!address || address.section !== area) continue;
    if (hitsByUrl.has(address.url)) {
      duplicateSearchUrls += 1;
      continue;
    }
    hitsByUrl.set(address.url, hit);
    if (sitemapUrls.has(address.url)) searchHitsInSitemap += 1;
    let key = stemOfUrl.get(address.url);
    if (!key) {
      key = `${address.documentType}/${address.slug}`;
      const stem = stems.get(key) ?? { portalType: address.documentType, slug: address.slug, urls: new Set<string>(), sitemap: false };
      if (!stems.has(key)) onlySearch += 1;
      stem.urls.add(address.url);
      stems.set(key, stem);
      stemOfUrl.set(address.url, key);
    }
    searchStemKeys.add(key);
  }
  const intersection = [...searchStemKeys].filter((key) => stems.get(key)?.sitemap).length;
  const onlySitemap = [...stems.entries()].filter(([key, stem]) => stem.sitemap && !searchStemKeys.has(key)).length;

  // 3. Bekannte Term-IDs (Manifest, frühere Enumeration) je Adresse.
  const termOfUrl = new Map<string, Set<string>>();
  const noteTerm = (url: string | undefined, term: string): void => {
    if (!url) return;
    const address = parseVersionUrl(url);
    if (!address || address.section !== area) return;
    const set = termOfUrl.get(address.url) ?? new Set<string>();
    set.add(term);
    termOfUrl.set(address.url, set);
  };
  const manifestByIdentity = new Map<string, ManifestEntry>();
  for (const entry of input.manifest?.entries ?? []) {
    if (entry.sourceArea !== area || !/^term:\d+$/u.test(entry.sourceIdentity)) continue;
    manifestByIdentity.set(entry.sourceIdentity, entry);
    for (const url of [entry.sourceUrl, entry.selectedVersionUrl, entry.sourceVersion?.url, ...entry.versionsConsidered.map((version) => version.url)]) noteTerm(url, entry.sourceIdentity);
  }
  const previousByKey = new Map((input.previous?.items ?? []).map((item) => [item.key, item]));
  // Aktive (nicht zusammengeführte) Einträge je Quellidentität: Sie tragen den maßgeblichen Bearbeitungsstand.
  // Ein zusammengeführter Eintrag mit demselben Schlüssel (Stub) darf ihn nie überdecken.
  const previousActive = new Map<string, EnumerationItem[]>();
  for (const item of input.previous?.items ?? []) {
    if (item.sourceIdentity && !item.mergedInto && /^term:\d+$/u.test(item.sourceIdentity)) previousActive.set(item.sourceIdentity, [...(previousActive.get(item.sourceIdentity) ?? []), item]);
  }
  const previousByIdentity = new Map<string, EnumerationItem>();
  for (const [identity, candidates] of previousActive) {
    // Trägt eine Quellidentität (fehlerhaft) mehrere aktive Einträge, zählt der zum Manifest passende; sonst der erste.
    const manifestStatus = manifestByIdentity.get(identity)?.importStatus;
    previousByIdentity.set(identity, candidates.find((candidate) => manifestStatus !== undefined && candidate.outcome?.importStatus === manifestStatus) ?? candidates[0]!);
  }
  for (const item of input.previous?.items ?? []) {
    const identity = item.sourceIdentity ?? item.mergedInto;
    if (!identity || !/^term:\d+$/u.test(identity)) continue;
    const duplicates = (previousActive.get(identity)?.length ?? 0) > 1;
    if (duplicates && !item.mergedInto) {
      // Dublette im Eingang: Nur die Adressen des maßgeblichen Eintrags zählen, und nur soweit das Manifest
      // (Fassungsliste der verarbeiteten Seite) sie bestätigt. Alles andere fällt zum Slug-Stamm zurück.
      if (previousByIdentity.get(identity) !== item) continue;
      const manifestUrls = manifestByIdentity.has(identity) ? new Set([...termOfUrl.entries()].filter(([, terms]) => terms.has(identity)).map(([url]) => url)) : undefined;
      for (const url of item.urls) if (!manifestUrls || manifestUrls.has(parseVersionUrl(url)?.url ?? url)) noteTerm(url, identity);
      continue;
    }
    for (const url of item.urls) noteTerm(url, identity);
  }

  // 4. Einträge bilden: Adressen mit bekannter Term-ID zur Stammnorm, übrige zum Slug-Stamm.
  interface Draft { key: string; sourceIdentity?: string; portalType: string; slug: string; urls: Set<string>; sitemap: boolean; search?: SearchHit }
  const drafts = new Map<string, Draft>();
  let termConflicts = 0;
  for (const [stemKey, stem] of stems) {
    for (const url of stem.urls) {
      const terms = termOfUrl.get(url);
      let key = `stem:${stemKey}`;
      let sourceIdentity: string | undefined;
      if (terms && terms.size > 1) {
        // Quelleigenheit: Fassungslisten des Portals führen auch Adressen benachbarter Stammnormen
        // (Vorgänger, Nachfolger, Verordnungsserien). Das ist ein Befund, kein Enumerationsfehler.
        termConflicts += 1;
        notes.push(`${url} ist mehreren Stammnormen zugeordnet (${[...terms].join(', ')})`);
      } else if (terms && terms.size === 1) {
        sourceIdentity = [...terms][0]!;
        key = sourceIdentity;
      }
      const draft = drafts.get(key) ?? { key, portalType: stem.portalType, slug: stem.slug, urls: new Set<string>(), sitemap: false, ...(sourceIdentity ? { sourceIdentity } : {}) };
      draft.urls.add(url);
      if (sitemapUrls.has(url)) draft.sitemap = true;
      // Unabhängig von der Sitemap-Reihenfolge: der Treffer der jüngsten datierten Adresse, bei Gleichstand die kleinste Adresse.
      const hit = hitsByUrl.get(url);
      if (hit && (!draft.search || preferredSearchHit(hit, draft.search))) draft.search = hit;
      drafts.set(key, draft);
    }
  }

  // 5. Einträge mit Vorklassifikation und übernommenem Status.
  //
  // Bearbeitungsstand je Eintrag:
  //   term:<id>   der aktive frühere Eintrag dieser Quellidentität (gleich, unter welchem Schlüssel er lief); fehlt er,
  //               der Manifesteintrag; erst dann ein zusammengeführter Stub gleichen Schlüssels
  //   stem:…      der frühere Eintrag gleichen Schlüssels – außer seine Quellidentität ist jetzt ein eigener
  //               term:-Eintrag: Dann sind die verbliebenen Adressen Restadressen außerhalb der Fassungsliste dieser
  //               Stammnorm (vom Bulk-Lauf abgetrennt) und beginnen offen. Sonst entstünden zwei aktive Einträge
  //               derselben Quellidentität (doppelte Zählung, doppelte Verarbeitung; Regression term:32801).
  const claimedIdentities = new Set([...drafts.keys()].filter((key) => key.startsWith('term:')));
  const items: EnumerationItem[] = [];
  for (const draft of drafts.values()) {
    const urls = [...draft.urls].sort();
    let previous: EnumerationItem | undefined;
    let manifestEntry: ManifestEntry | undefined;
    if (draft.sourceIdentity) {
      const active = previousByIdentity.get(draft.sourceIdentity);
      const stub = previousByKey.get(draft.key);
      previous = active ?? stub;
      if (!active) manifestEntry = manifestByIdentity.get(draft.sourceIdentity);
    } else {
      previous = previousByKey.get(draft.key);
      if (previous?.sourceIdentity && !previous.mergedInto && claimedIdentities.has(previous.sourceIdentity)) {
        notes.push(`${draft.key}: ${urls.length} Restadresse(n) außerhalb der Fassungsliste von ${previous.sourceIdentity}; Eintrag beginnt erneut offen`);
        previous = undefined;
      }
    }
    const datedUrls = urls.map((url) => ({ url, date: parseVersionUrl(url)?.pathDate ?? '' })).sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : left.url < right.url ? -1 : 1));
    const entryUrl = draft.search?.url ?? previous?.entryUrl ?? datedUrls[0]!.url;
    const title = draft.search?.title || previous?.title || humanizeSlug(draft.slug);
    const titleSource: EnumerationItem['titleSource'] = draft.search?.title ? 'search-index' : previous?.titleSource ?? 'slug';
    const pre = preclassify(area, draft.portalType, title);
    // Stand aus dem Manifest, wenn kein aktiver Eintrag den Stand trägt (Manifest ist Quelle der Wahrheit der Verarbeitung).
    const fromManifest = manifestEntry && (!previous || previous.mergedInto);
    const item: EnumerationItem = {
      key: draft.key,
      entryUrl: urls.includes(entryUrl) ? entryUrl : datedUrls[0]!.url,
      portalType: draft.portalType,
      title,
      titleSource,
      status: fromManifest ? statusForImportStatus(manifestEntry!.importStatus) : previous?.status ?? (pre.safeExclusion ? 'excluded' : 'pending'),
      urls,
      signals: { sitemap: draft.sitemap, search: Boolean(draft.search) },
      preclassification: { decision: pre.decision, reasons: pre.reasons },
      role: pre.role,
      attempts: previous?.attempts ?? 0,
    };
    if (draft.sourceIdentity) item.sourceIdentity = draft.sourceIdentity;
    else if (previous?.sourceIdentity) item.sourceIdentity = previous.sourceIdentity;
    if (draft.search) {
      const { url: _url, indexType: _indexType, title: _title, ...signals } = draft.search;
      item.search = signals;
    }
    if (pre.evidence) item.evidence = pre.evidence;
    if (previous?.mergedInto && !draft.sourceIdentity) item.mergedInto = previous.mergedInto;
    if (fromManifest) item.outcome = outcomeFromManifest(manifestEntry!);
    else {
      if (previous?.lastError) item.lastError = previous.lastError;
      if (previous?.outcome) item.outcome = previous.outcome;
    }
    if (previous?.updatedAt) item.updatedAt = previous.updatedAt;
    if (previous?.lastRunId) item.lastRunId = previous.lastRunId;
    if (item.status === 'processing') item.status = 'pending';
    items.push(item);
  }

  // Zusammengeführte Stubs, deren Zielidentität weder ein aktiver Eintrag noch ein Manifesteintrag trägt, decken
  // ihre Adressen durch nichts mehr ab: Sie werden wieder geöffnet (kein stilles Verschwinden).
  const activeIdentities = new Set(items.filter((item) => !item.mergedInto && item.sourceIdentity).map((item) => item.sourceIdentity!));
  for (const item of items) {
    if (!item.mergedInto || activeIdentities.has(item.mergedInto) || manifestByIdentity.has(item.mergedInto)) continue;
    notes.push(`${item.key}: Zusammenführung in ${item.mergedInto} ohne aktiven Eintrag und ohne Manifesteintrag; Eintrag beginnt erneut offen`);
    delete item.mergedInto;
    delete item.outcome;
    delete item.lastError;
    item.status = 'pending';
    item.attempts = 0;
  }

  // Verarbeitete Stammnormen dürfen nie aus der Enumeration fallen: Terme des Manifests ohne aktiven Eintrag (alle
  // Fassungsadressen mehreren Stammnormen zugeordnet oder nur noch als Ziel einer Zusammenführung bekannt) erhalten
  // einen eigenen Eintrag aus den Manifestdaten.
  const covered = new Set(items.filter((item) => !item.mergedInto).map((item) => item.sourceIdentity).filter((value): value is string => Boolean(value)));
  const manifestOnlyKeys = new Set<string>();
  for (const entry of input.manifest?.entries ?? []) {
    if (entry.sourceArea !== area || !/^term:\d+$/u.test(entry.sourceIdentity) || covered.has(entry.sourceIdentity)) continue;
    const urls = [...new Set([entry.sourceUrl, entry.selectedVersionUrl, entry.sourceVersion?.url, ...entry.versionsConsidered.map((version) => version.url)]
      .map((url) => (url ? parseVersionUrl(url) : undefined))
      .filter((address) => address?.section === area)
      .map((address) => address!.url))].sort();
    if (urls.length === 0) continue;
    const address = parseVersionUrl(urls.at(-1)!)!;
    const previous = previousByIdentity.get(entry.sourceIdentity) ?? previousByKey.get(entry.sourceIdentity);
    const pre = preclassify(area, address.documentType, entry.sourceTitle);
    // Ein früherer Stub (zusammengeführt) trägt keinen belastbaren Stand; dann gilt das Manifest.
    const fromPrevious = previous && !previous.mergedInto;
    const item: EnumerationItem = {
      key: entry.sourceIdentity,
      sourceIdentity: entry.sourceIdentity,
      entryUrl: urls.at(-1)!,
      portalType: address.documentType,
      title: entry.sourceTitle,
      titleSource: 'manifest',
      status: fromPrevious ? previous.status : statusForImportStatus(entry.importStatus),
      urls,
      signals: { sitemap: urls.some((url) => sitemapUrls.has(url)), search: false },
      preclassification: { decision: pre.decision, reasons: pre.reasons },
      role: pre.role,
      attempts: previous?.attempts ?? 0,
    };
    if (pre.evidence) item.evidence = pre.evidence;
    if (fromPrevious) {
      if (previous.outcome) item.outcome = previous.outcome;
      if (previous.lastError) item.lastError = previous.lastError;
    } else item.outcome = outcomeFromManifest(entry);
    if (previous?.updatedAt) item.updatedAt = previous.updatedAt;
    if (previous?.lastRunId) item.lastRunId = previous.lastRunId;
    if (item.status === 'processing') item.status = 'pending';
    notes.push(`${entry.sourceIdentity} wird aus dem Manifest geführt (alle Fassungsadressen mehreren Stammnormen zugeordnet oder nur als Ziel einer Zusammenführung bekannt)`);
    manifestOnlyKeys.add(item.key);
    items.push(item);
  }
  items.sort((left, right) => compareKeys(left.key, right.key));

  // 6. Abgleich.
  const assigned = new Map<string, number>();
  // Aus dem Manifest ergänzte Terme teilen sich die Adressen mit ihrem Slug-Stamm; das ist gewollt und zählt
  // nicht als Mehrfachzuordnung (echte Dubletten regulärer Einträge bleiben ein Abgleichsproblem).
  for (const item of items) {
    if (manifestOnlyKeys.has(item.key)) continue;
    for (const url of item.urls) assigned.set(url, (assigned.get(url) ?? 0) + 1);
  }
  const unassignedUrls = [...sitemapUrls].filter((url) => !assigned.has(url)).length;
  const duplicateUrlAssignments = [...assigned.values()].filter((count) => count > 1).length;
  const unmappedHits = [...hitsByUrl.keys()].filter((url) => !assigned.has(url)).length;
  const union = intersection + onlySitemap + onlySearch;
  const duplicateIdentities = findDuplicateIdentities({ items });
  if (unassignedUrls > 0) problems.push(`${unassignedUrls} Sitemap-Adressen ohne Eintrag`);
  if (duplicateUrlAssignments > 0) problems.push(`${duplicateUrlAssignments} Adressen mehreren Einträgen zugeordnet`);
  if (duplicateIdentities.length > 0) problems.push(`${duplicateIdentities.length} Quellidentitäten mit mehreren aktiven Einträgen (${duplicateIdentities.slice(0, 5).map((entry) => `${entry.sourceIdentity}: ${entry.keys.join(' + ')}`).join('; ')})`);
  if (unmappedHits > 0) problems.push(`${unmappedHits} Suchtreffer ohne Eintrag`);
  if (union !== stems.size) problems.push(`Vereinigung ${union} ≠ Slug-Stämme ${stems.size}`);
  if (sitemapUrls.size === 0) problems.push('Sitemap enthält keine Adressen des Bereichs');
  if (input.search.hits.length === 0) problems.push('Suchindex lieferte keine Treffer');
  const crosscheck: EnumerationCrosscheck = {
    sitemapUrls: sitemapUrls.size,
    sitemapStems: sitemapStemCount,
    searchHits: input.search.hits.length,
    searchUniqueUrls: hitsByUrl.size,
    duplicateSearchUrls,
    searchHitsInSitemap,
    searchHitsNotInSitemap: hitsByUrl.size - searchHitsInSitemap,
    union,
    intersection,
    onlySitemap,
    onlySearch,
    items: items.length,
    resolvedTerms: items.filter((item) => item.sourceIdentity).length,
    review: items.filter((item) => item.preclassification.decision === 'review' || item.status === 'review').length,
    excluded: items.filter((item) => item.status === 'excluded').length,
    unassignedUrls,
    duplicateUrlAssignments,
    termConflicts,
    duplicateIdentities: duplicateIdentities.length,
    ok: problems.length === 0,
    problems,
    notes,
  };
  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate: SIMULATION_BASELINE_DATE,
    generatedAt: input.now,
    contentFingerprint: '',
    sources: {
      sitemap: { indexUrl: SITEMAP_INDEX_URL, pages: input.sitemap.pages, urls: sitemapUrls.size },
      search: { url: SEARCH_URL, indexTypes: [...SEARCH_INDEX_TYPES[area]], total: input.search.total, hits: input.search.hits.length },
    },
    crosscheck,
    items,
  };
  file.contentFingerprint = enumerationFingerprint(file);
  if (input.previous && input.previous.contentFingerprint === file.contentFingerprint) file.generatedAt = input.previous.generatedAt;
  return file;
}

export async function readEnumeration(root: string, area: SourceArea): Promise<EnumerationFile | undefined> {
  const file = await readJsonFile<EnumerationFile>(join(root, enumerationPath(area)));
  if (!file) return undefined;
  if (file.schemaVersion !== ENUMERATION_SCHEMA || file.sourceArea !== area || !Array.isArray(file.items)) throw new Error(`${enumerationPath(area)}: keine gültige Enumeration`);
  return file;
}

/**
 * Serialisierung mit einem Eintrag je Zeile: kompakt (mehrere Tausend Einträge) und zeilenweise diffbar – ein
 * Statuswechsel ändert genau eine Zeile.
 */
export function enumerationJsonText(file: EnumerationFile): string {
  const { items, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "items": [\n${items.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]\n}\n`;
}

/** Schreibt atomar; der Fingerabdruck wird neu berechnet (Statusänderungen gehören zum Inhalt). */
export async function writeEnumeration(root: string, file: EnumerationFile): Promise<boolean> {
  const fingerprint = enumerationFingerprint(file);
  const next: EnumerationFile = { ...file, contentFingerprint: fingerprint };
  return writeFileAtomic(join(root, enumerationPath(file.sourceArea)), enumerationJsonText(next));
}

/** Suchindex-Signale je Adresse (für Belegprüfung, nie als alleinige Wahrheit). */
export function searchSignalsByUrl(file: EnumerationFile | undefined): Map<string, SearchSignals> {
  const map = new Map<string, SearchSignals>();
  for (const item of file?.items ?? []) if (item.search) for (const url of item.urls) map.set(url, item.search);
  return map;
}

export function enumerationStatusCounts(file: EnumerationFile): Record<EnumerationStatus, number> {
  const counts = Object.fromEntries(ENUMERATION_STATUSES.map((status) => [status, 0])) as Record<EnumerationStatus, number>;
  for (const item of file.items) if (!item.mergedInto) counts[item.status] += 1;
  return counts;
}
