/**
 * Ablauf des Befehls `enumerate`: Quellen abrufen, Enumeration bis zum Fixpunkt bauen, schreiben.
 *
 * Reihenfolge und Kosten:
 *   1. Fortführungsnachweis des Bereichs – **ein** Abruf (statisch, unpaginiert, sitzungsfrei).
 *   2. Facetten-Bestandsaufnahme – vorhanden? dann aus `data/audits/bayernrecht/facet-inventory.json`
 *      und ohne jeden Abruf. Fehlt sie, wird sie einmalig gesammelt: rund 243 Trefferlistenseiten für
 *      den gesamten Portalbestand, danach beantwortet der Cache dieselbe Frage netzfrei.
 *   3. Manifest (lokal), Enumeration bis zum Fixpunkt, atomares Schreiben.
 *
 * Ohne `--write` wird nichts geschrieben; abgerufen wird trotzdem, damit der Dry-run dieselbe Aussage
 * trifft wie der Schreiblauf. Mit `--offline` ist jeder Netzabruf ein Fehler.
 */
import { readManifest } from '../common/manifest.ts';
import { createBayernRechtFetcher, type BayernRechtFetcherOptions } from '../common/fetcher.ts';
import { enumerationPath } from '../common/paths.ts';
import type { SourceArea } from '../common/constants.ts';
import { buildEnumeration, readEnumeration, writeEnumeration, enumerationStatusCounts, checkEnumerationInvariants, type EnumerationFile } from './enumeration.ts';
import { buildGapReport, writeGapReport, GAP_REPORT_PATH, type GapReport } from './gap.ts';
import { parseFortfuehrungsnachweis } from './fortfuehrungsnachweis.ts';
import { collectFacetInventory, createCookieFetch, createCookieJar, FACET_INVENTORY_PATH, readFacetInventory, writeFacetInventory, type FacetInventory } from './inventory.ts';
import { AREA_NORM_TYPES, fortfuehrungsnachweisUrl } from './portal.ts';

export interface EnumerateOptions {
  root: string;
  area: SourceArea;
  write: boolean;
  offline: boolean;
  refresh: boolean;
  cacheDir?: string;
  baselineDate?: string;
  now?: () => string;
  log?: (line: string) => void;
}

/** Bereiche mit Fortführungsnachweis; der Lückenbericht bilanziert beide gemeinsam. */
const GAP_AREAS = ['landesrecht', 'vwv'] as const satisfies readonly SourceArea[];

export interface EnumerateResult {
  file: EnumerationFile;
  /** Abgleich Fortführungsnachweis ↔ Portalfacette über beide Bereiche. */
  gap: GapReport;
  gapWritten: { markdown: boolean; json: boolean };
  inventory: FacetInventory;
  inventoryCollected: boolean;
  inventoryWritten: boolean;
  written: boolean;
  path: string;
  networkRequests: number;
  cacheHits: number;
  invariantProblems: string[];
}

export async function runEnumerate(options: EnumerateOptions): Promise<EnumerateResult> {
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? ((): string => new Date().toISOString());
  const normTypes = AREA_NORM_TYPES[options.area];
  if (normTypes.length === 0) throw new Error(`Der Bereich ${options.area} hat weder Fortführungsnachweis noch Portalfacette – er wird nicht enumeriert (Verkündungsereignisse entstehen im Strang „events“).`);

  const jar = createCookieJar();
  const fetcherOptions: BayernRechtFetcherOptions = { root: options.root, fetchImplementation: createCookieFetch(jar), offline: options.offline, refresh: options.refresh };
  if (options.cacheDir) fetcherOptions.cacheDir = options.cacheDir;
  const fetcher = createBayernRechtFetcher(fetcherOptions);

  const url = fortfuehrungsnachweisUrl(options.area);
  log(`Fortführungsnachweis ${url}`);
  const page = await fetcher.fetch(url);
  const document = parseFortfuehrungsnachweis(new TextDecoder('utf-8').decode(page.bytes));
  log(`  ${document.entries.length} Einträge, ${document.sections.length} Sachgebiete, ${document.unlinkedRows.length} Zeile(n) ohne Verweis`);

  let inventory = options.refresh ? undefined : await readFacetInventory(options.root);
  let inventoryCollected = false;
  let inventoryWritten = false;
  if (!inventory) {
    if (options.offline) throw new Error(`${FACET_INVENTORY_PATH} fehlt und --offline verbietet den Abruf; die Facetten-Bestandsaufnahme einmal mit --write erzeugen.`);
    log('Facetten-Bestandsaufnahme fehlt – sie wird einmalig gesammelt (rund 243 Trefferlistenseiten, danach netzfrei aus dem Cache).');
    inventory = await collectFacetInventory({ fetcher, jar, now, log: (line) => log(`  ${line}`) });
    inventoryCollected = true;
    if (options.write) {
      inventoryWritten = await writeFacetInventory(options.root, inventory);
      log(`  ${FACET_INVENTORY_PATH}: ${inventory.documents.length} Dokumente${inventoryWritten ? ' geschrieben' : ' unverändert'}`);
    }
  } else {
    log(`Facetten-Bestandsaufnahme aus ${FACET_INVENTORY_PATH}: ${inventory.documents.length} Dokumente, vollständig ${inventory.complete ? 'ja' : 'nein'}`);
  }

  const manifest = await readManifest(options.root);
  const previous = await readEnumeration(options.root, options.area);
  const facetTotal = inventory.types.filter((type) => (normTypes as readonly string[]).includes(type.normType)).reduce((sum, type) => sum + type.total, 0);
  const facetPages = inventory.types.filter((type) => (normTypes as readonly string[]).includes(type.normType)).reduce((sum, type) => sum + type.pages, 0);
  const file = buildEnumeration({
    area: options.area,
    fortfuehrungsnachweis: { document, url: page.url, sha256: page.sha256, retrievedAt: page.retrievedAt, byteLength: page.bytes.byteLength },
    facets: { documents: inventory.documents, total: facetTotal, pages: facetPages, complete: inventory.complete, inventoryPath: FACET_INVENTORY_PATH, inventoryFingerprint: inventory.contentFingerprint },
    manifest,
    ...(previous ? { previous } : {}),
    ...(options.baselineDate ? { baselineDate: options.baselineDate } : {}),
    now: now(),
    log: (line) => log(`  ${line}`),
  });

  const invariantProblems = checkEnumerationInvariants(file);
  const written = options.write ? await writeEnumeration(options.root, file) : false;

  // Der Lückenbericht bilanziert beide Bereiche zugleich und wird deshalb aus beiden Nachweisen
  // gebildet. Den Nachweis des gerade enumerierten Bereichs hat der Lauf schon gelesen; der zweite
  // Abruf kommt beim Wiederholungslauf aus dem Cache.
  const ffnIds = new Set<string>();
  let ffnEntries = 0;
  for (const area of GAP_AREAS) {
    const areaDocument = area === options.area ? document : parseFortfuehrungsnachweis(new TextDecoder('utf-8').decode((await fetcher.fetch(fortfuehrungsnachweisUrl(area))).bytes));
    for (const entry of areaDocument.entries) ffnIds.add(entry.documentId);
    ffnEntries += areaDocument.entries.length;
  }
  const gap = buildGapReport({ inventory, fortfuehrungsnachweisIds: ffnIds, fortfuehrungsnachweisEntries: ffnEntries, now: now() });
  const gapWritten = options.write ? await writeGapReport(options.root, gap, inventory) : { markdown: false, json: false };

  return {
    file,
    gap,
    gapWritten,
    inventory,
    inventoryCollected,
    inventoryWritten,
    written,
    path: enumerationPath(options.area),
    networkRequests: fetcher.stats.networkRequests,
    cacheHits: fetcher.stats.cacheHits,
    invariantProblems,
  };
}

/** Kurzfassung für die Ausgabe des CLI. */
export function enumerateSummary(result: EnumerateResult): string[] {
  const counts = enumerationStatusCounts(result.file);
  const crosscheck = result.file.crosscheck;
  return [
    `Enumeration ${result.file.sourceArea}: ${crosscheck.items} Einträge (${Object.entries(counts).filter(([, value]) => value > 0).map(([status, value]) => `${status} ${value}`).join(', ')})`,
    `  Fortführungsnachweis ${crosscheck.fortfuehrungsnachweisEntries} · Facette ${crosscheck.facetDocuments}/${crosscheck.facetTotal} · beide ${crosscheck.inBoth}`,
    `  nur Fortführungsnachweis ${crosscheck.onlyFortfuehrungsnachweis} · nur Facette ${crosscheck.onlyFacet} · aus dem Manifest geführt ${crosscheck.carriedFromManifest}`,
    `  mit Normtyp ${crosscheck.withNormType} · mit BayRS-Nummer ${crosscheck.withBayRsNumber}`,
    `  Abgleich ${crosscheck.ok ? 'ok' : `NICHT ok: ${crosscheck.problems.join('; ')}`}`,
    ...(result.invariantProblems.length > 0 ? [`  Invarianten verletzt: ${result.invariantProblems.slice(0, 5).join('; ')}`] : []),
    `  Abdeckungslücke: ${result.gap.totals.onlyFacet} Dokumente nur in der Facette (${result.gap.groups.filter((group) => group.count > 0).map((group) => `${group.group} ${group.count}`).join(', ')}); Bericht ${GAP_REPORT_PATH}`,
    `  Netzabrufe ${result.networkRequests}, Cache-Treffer ${result.cacheHits}`,
  ];
}
