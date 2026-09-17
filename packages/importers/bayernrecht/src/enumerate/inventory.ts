/**
 * Bestandsaufnahme der Portalfacetten (`data/audits/bayernrecht/facet-inventory.json`).
 *
 * Warum überhaupt: Der Fortführungsnachweis nennt 2.311 Dokumente, der Facettenbaum des Portals
 * 2.413 (241 + 486 + 1.478 + 208). Diese Differenz von 102 war nach der Quellen-Discovery offen und
 * ist vor jedem Bulk-Lauf zu klären – sonst fehlen bis zu 102 Normen. Geklärt wird sie nur durch einen
 * Mengenabgleich: die Trefferliste je Normtyp durchblättern und die Dokument-IDs vergleichen.
 *
 * Zwei Eigenheiten des Portals bestimmen den Ablauf:
 *
 *  - **Sitzung.** Die Trefferliste lebt im Sitzungszustand. Ein Facettenaufruf ohne Sitzung liefert
 *    „Bitte führen Sie eine Suche aus.“. Der Sammler legt deshalb je Normtyp eine eigene Sitzung an
 *    (Cookie-Ablage leeren, Facette aufrufen) und blättert dann `/Search/Page/<n>`. Eine Suchanfrage
 *    (POST mit Antiforgery-Token) ist dafür nicht nötig: Der Facettenaufruf allein setzt den Zustand.
 *    Es wird nichts umgangen – Cookies annehmen und zurücksenden ist gewöhnliches HTTP.
 *  - **Cacheschlüssel.** `/Search/Page/2` bedeutet je Sitzung etwas anderes. `hitlistPageUrl` hängt
 *    den Normtyp als (serverseitig folgenlosen) Parameter an, damit Seiten verschiedener Normtypen im
 *    Cache nicht kollidieren und ein Wiederholungslauf netzfrei dasselbe Ergebnis liefert.
 *
 * Der Sammler prüft hart: Trefferzahl je Seite, Sollmenge gegen gesammelte Menge, Dubletten. Eine
 * unvollständige Sammlung wird als unvollständig ausgewiesen und nicht als Bestand ausgegeben.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { AUDIT_DIR } from '../common/constants.ts';
import type { BayernRechtFetcher, FetchedDocument } from '../common/fetcher.ts';
import { hitlistPageCount, parseHitlistPage, type HitlistEntry, type HitlistPage } from './hitlist.ts';
import { facetFilterUrl, hitlistPageUrl, NORM_TYPES, sessionWarmupUrl, type NormType } from './portal.ts';

export const FACET_INVENTORY_SCHEMA = 'bayernrecht-facet-inventory/1' as const;
export const FACET_INVENTORY_PATH = `${AUDIT_DIR}/facet-inventory.json`;

export interface FacetPageEvidence {
  normType: NormType;
  page: number;
  url: string;
  sha256: string;
  retrievedAt: string;
  byteLength: number;
  entries: number;
}

export interface FacetDocument {
  documentId: string;
  normType: NormType;
  title: string;
  legalStatusDate?: string;
  /** Seite, auf der das Dokument gefunden wurde (Beleg: `<normtyp>#<seite>`). */
  page: number;
  sourceUrl: string;
  sourceSha256: string;
  retrievedAt: string;
}

export interface FacetTypeSummary {
  normType: NormType;
  /** Sollmenge laut Trefferzähler der ersten Seite. */
  total: number;
  pages: number;
  collected: number;
  distinct: number;
  complete: boolean;
}

export interface FacetInventory {
  schemaVersion: typeof FACET_INVENTORY_SCHEMA;
  generatedAt: string;
  contentFingerprint: string;
  types: FacetTypeSummary[];
  pages: FacetPageEvidence[];
  documents: FacetDocument[];
  problems: string[];
  complete: boolean;
}

export function facetInventoryFingerprint(inventory: Pick<FacetInventory, 'types' | 'pages' | 'documents' | 'problems' | 'complete'>): string {
  return createHash('sha256').update(stableStringify({ types: inventory.types, pages: inventory.pages, documents: inventory.documents, problems: inventory.problems, complete: inventory.complete })).digest('hex');
}

/** Cookie-Ablage einer Sitzung: nimmt `Set-Cookie` an und sendet die Kekse zurück – mehr nicht. */
export interface CookieJar {
  clear(): void;
  header(): string | undefined;
  accept(response: Response): void;
}

export function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();
  return {
    clear: () => cookies.clear(),
    header: () => (cookies.size === 0 ? undefined : [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')),
    accept(response) {
      const setCookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const raw of setCookies) {
        const pair = raw.split(';')[0] ?? '';
        const separator = pair.indexOf('=');
        if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    },
  };
}

/**
 * Fetch-Implementierung mit Sitzungskeksen für den zentralen Fetcher. Der Fetcher selbst bleibt
 * unverändert (er ist im West-Adapter eingefroren) – er nimmt eine austauschbare Fetch-Funktion
 * entgegen, und genau die wird hier gestellt. Alle Schutzmechanismen (Mindestabstand, Budget,
 * Wiederholungen, Cache) bleiben in Kraft.
 */
export function createCookieFetch(jar: CookieJar, base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const cookie = jar.header();
    if (cookie) headers.set('cookie', cookie);
    const response = await base(input, { ...init, headers });
    jar.accept(response);
    return response;
  };
}

const decode = (document: FetchedDocument): string => new TextDecoder('utf-8').decode(document.bytes);

export interface CollectFacetInventoryOptions {
  fetcher: BayernRechtFetcher;
  /** Wird vor dem ersten Abruf eines Normtyps geleert, damit jede Facette eine eigene Sitzung bekommt. */
  jar: CookieJar;
  normTypes?: readonly NormType[];
  now?: () => string;
  log?: (line: string) => void;
}

/**
 * Sammelt die Dokument-IDs aller angeforderten Normtypen. Ein Abruf je Trefferlistenseite, zehn
 * Treffer je Seite; bei 2.413 Vorschriften sind das rund 243 Seiten. Das ist der einzige bekannte Weg
 * zur vollständigen Portalmenge und läuft nur einmal – danach beantwortet der Cache dieselbe Frage
 * ohne Netz.
 */
export async function collectFacetInventory(options: CollectFacetInventoryOptions): Promise<FacetInventory> {
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? ((): string => new Date().toISOString());
  const normTypes = options.normTypes ?? NORM_TYPES;
  const types: FacetTypeSummary[] = [];
  const pages: FacetPageEvidence[] = [];
  const documents: FacetDocument[] = [];
  const problems: string[] = [];
  const seen = new Map<string, FacetDocument>();

  for (const normType of normTypes) {
    // Eigene Sitzung je Normtyp: Ein zweiter Facettenfilter in derselben Sitzung würde den ersten
    // überlagern; welcher gewinnt, ist nicht dokumentiert. Eine frische Sitzung ist eindeutig.
    options.jar.clear();
    // Aufwärmaufruf: Ohne bestehende Sitzung beantwortet das Portal auch den Facettenfilter mit
    // „Bitte führen Sie eine Suche aus.“ (belegt). Kommt der Aufruf aus dem Cache, bleibt die
    // Keksablage leer – dann müssen auch die Trefferseiten aus dem Cache kommen, sonst scheitert der
    // Lauf gleich hier mit klarer Meldung statt mit einer stillen Teilmenge.
    await options.fetcher.fetch(sessionWarmupUrl(normType));
    const first = await options.fetcher.fetch(facetFilterUrl(normType));
    let firstPage: HitlistPage;
    try {
      firstPage = parseHitlistPage(decode(first));
    } catch (error) {
      throw new Error(`Facette ${normType}: ${(error as Error).message}. Der Sitzungszustand wurde nicht gesetzt – vermutlich beantwortet der Cache den Aufwärmaufruf ${sessionWarmupUrl(normType)}; mit --refresh erneut abrufen.`);
    }
    const expectedPages = hitlistPageCount(firstPage.total);
    log(`Facette ${normType}: ${firstPage.totalLabel} (${expectedPages} Seiten)`);
    const collect = (document: FetchedDocument, entries: readonly HitlistEntry[], page: number): void => {
      pages.push({ normType, page, url: document.url, sha256: document.sha256, retrievedAt: document.retrievedAt, byteLength: document.bytes.byteLength, entries: entries.length });
      for (const entry of entries) {
        const record: FacetDocument = {
          documentId: entry.documentId,
          normType,
          title: entry.title,
          ...(entry.legalStatusDate ? { legalStatusDate: entry.legalStatusDate } : {}),
          page,
          sourceUrl: document.url,
          sourceSha256: document.sha256,
          retrievedAt: document.retrievedAt,
        };
        const previous = seen.get(entry.documentId);
        if (previous) {
          problems.push(`${entry.documentId} kommt mehrfach vor (${previous.normType} Seite ${previous.page} und ${normType} Seite ${page})`);
          continue;
        }
        seen.set(entry.documentId, record);
        documents.push(record);
      }
    };
    collect(first, firstPage.entries, 1);
    let collected = firstPage.entries.length;
    for (let page = 2; page <= expectedPages; page += 1) {
      const document = await options.fetcher.fetch(hitlistPageUrl(normType, page));
      const parsed = parseHitlistPage(decode(document));
      if (parsed.total !== firstPage.total) problems.push(`${normType} Seite ${page}: Trefferzähler ${parsed.total} weicht von Seite 1 (${firstPage.total}) ab`);
      if (parsed.currentPage !== undefined && parsed.currentPage !== page) problems.push(`${normType} Seite ${page}: der Seitenwähler markiert Seite ${parsed.currentPage}`);
      if (parsed.entries.length === 0) problems.push(`${normType} Seite ${page}: keine Trefferzeilen`);
      collect(document, parsed.entries, page);
      collected += parsed.entries.length;
      if (page % 25 === 0 || page === expectedPages) log(`Facette ${normType}: Seite ${page}/${expectedPages}, ${collected} Treffer`);
    }
    const distinct = documents.filter((document) => document.normType === normType).length;
    const complete = collected === firstPage.total && distinct === firstPage.total;
    if (!complete) problems.push(`${normType}: ${collected} Treffer gesammelt, ${distinct} verschieden, erwartet ${firstPage.total}`);
    types.push({ normType, total: firstPage.total, pages: expectedPages, collected, distinct, complete });
  }

  documents.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));
  const inventory: FacetInventory = {
    schemaVersion: FACET_INVENTORY_SCHEMA,
    generatedAt: now(),
    contentFingerprint: '',
    types,
    pages,
    documents,
    problems,
    complete: problems.length === 0 && types.every((type) => type.complete),
  };
  inventory.contentFingerprint = facetInventoryFingerprint(inventory);
  return inventory;
}

export async function readFacetInventory(root: string): Promise<FacetInventory | undefined> {
  const file = await readJsonFile<FacetInventory>(join(root, FACET_INVENTORY_PATH));
  if (!file) return undefined;
  if (file.schemaVersion !== FACET_INVENTORY_SCHEMA || !Array.isArray(file.documents)) throw new Error(`${FACET_INVENTORY_PATH}: keine gültige Facetten-Bestandsaufnahme`);
  return file;
}

/** Ein Dokument je Zeile: 2.413 Einträge bleiben zeilenweise diffbar. */
export function facetInventoryJsonText(inventory: FacetInventory): string {
  const { documents, pages, ...header } = inventory;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  const list = (name: string, values: readonly unknown[]): string => `  ${JSON.stringify(name)}: [\n${values.map((value) => `    ${JSON.stringify(value)}`).join(',\n')}\n  ]`;
  return `${head},\n${list('pages', pages)},\n${list('documents', documents)}\n}\n`;
}

export async function writeFacetInventory(root: string, inventory: FacetInventory): Promise<boolean> {
  const next: FacetInventory = { ...inventory, contentFingerprint: facetInventoryFingerprint(inventory) };
  return writeFileAtomic(join(root, FACET_INVENTORY_PATH), facetInventoryJsonText(next));
}
