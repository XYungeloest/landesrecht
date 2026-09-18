/**
 * Abrufplan des Ereignisregisters Bayern – der einzige Teil dieses Strangs, der das Netz berührt.
 *
 * Netzdisziplin (alles über den gemeinsamen Adapter-Fetcher, `src/common/fetcher.ts`):
 *   - streng sequenziell, kein einziger paralleler Abruf; ein zweiter Strang lädt zeitgleich den
 *     Normbestand, deshalb ist der Mindestabstand hier höher als der Adapterstandard
 *   - identifizierender User-Agent mit Zweck und Kontaktweg
 *   - alles über den Cache `.cache/bayernrecht/`; ein Wiederholungslauf ist mit `--offline` netzfrei
 *   - `Retry-After` und 429/403 behandelt der Fetcher: nach mehreren Sperrantworten bricht er mit
 *     `blocked` ab; hier wird nichts umgangen und nichts wiederholt erzwungen
 *   - Abrufbudget mit **sauberem Halt**: Läuft das Budget aus, endet der Lauf mit dem bis dahin
 *     Erreichten und meldet, was offen blieb – er stirbt nicht mitten im Schreiben
 *   - resumierbar: Der Fortschritt steckt im Cache. Ein erneuter Lauf holt nur die Adressen nach, die
 *     beim letzten Halt noch fehlten
 *
 * `www.bayerische-staatszeitung.de` (Verlag der GVBl.-Papierausgabe) wird **nicht** berührt: Der Host
 * formuliert einen ausdrücklichen TDM-Vorbehalt nach § 44b UrhG. Er ist für den Importpfad ohnehin
 * ohne Belang – er betreibt reinen Papiervertrieb.
 */
import { RUN_STOPPING_FETCH_ERRORS, decodeHtml, type BayernRechtFetcher, type FetchedDocument } from '../common/fetcher.ts';
import { parseGvblIssueIndex, parseListingPage, type IssueRow, type ListingRow } from './listings.ts';
import { BASELINE, EVALUATION_DATE, type PublicationOrgan } from './ledger.ts';

export const PLATFORM_ORIGIN = 'https://www.verkuendung-bayern.de';

/**
 * Mindestabstand zwischen zwei Abrufen. Der Auftrag verlangt 1,2 s; gewählt sind 1,4 s, weil parallel
 * ein zweiter Strang denselben Anbieter belastet.
 */
export const MIN_DELAY_MS = 1_400;

/** Treffer je Trefferlistenseite; 50 ist das Maximum, das die Oberfläche selbst anbietet. */
export const ITEMS_PER_PAGE = 50;

/** Erfasste Jahrgänge: vom Stichtagsjahr bis zum Jahr des Auswertungsstichtags, lückenlos. */
export function coveredVolumes(baseline: string = BASELINE, evaluationDate: string = EVALUATION_DATE): number[] {
  const first = Number.parseInt(baseline.slice(0, 4), 10);
  const last = Number.parseInt(evaluationDate.slice(0, 4), 10);
  const volumes: number[] = [];
  for (let year = first; year <= last; year += 1) volumes.push(year);
  return volumes;
}

export function gvblIssueIndexUrl(volume: number): string {
  return `${PLATFORM_ORIGIN}/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=${volume}`;
}

export function gvblListingUrl(volume: number, offset: number): string {
  return `${PLATFORM_ORIGIN}/gvbl/?volume=${volume}&itemsPerPage=${ITEMS_PER_PAGE}&offset=${offset}`;
}

export function baymblListingUrl(offset: number): string {
  return `${PLATFORM_ORIGIN}/baymbl/?itemsPerPage=${ITEMS_PER_PAGE}&offset=${offset}`;
}

export function detailUrl(detailPath: string): string {
  return `${PLATFORM_ORIGIN}${detailPath}`;
}

/**
 * Der CSV-Jahreslistenexport des BayMBl. – als Adresse festgehalten, aber **nicht** ausgelöst.
 * Der Auftrag verlangt die Prüfung, ob ein GET ihn auslöst; das Ergebnis steht in `EXPORT_PROBE`.
 */
export const BAYMBL_EXPORT_FORM_URL = `${PLATFORM_ORIGIN}/ministerialblatt/jahreslisten-exportieren/`;

/**
 * Befund der Prüfung: Ein GET mit allen Formularfeldern (`ressort`, `volume`, `export-as`, `csv`)
 * liefert HTTP 200 mit der **Formularseite** zurück, nicht die CSV-Datei. Der Export hängt am POST.
 * Er wird nicht erzwungen; ausgewertet werden die Übersichtsseiten.
 */
export const EXPORT_PROBE = {
  url: `${BAYMBL_EXPORT_FORM_URL}?ressort=0&volume=2024&export-as=&csv=Liste+als+CSV+exportieren`,
  method: 'GET',
  result: 'HTTP 200, text/html – die Formularseite, keine CSV. Der Export ist nur per POST auslösbar.',
  decision: 'nicht erzwungen; die Trefferlisten /gvbl/ und /baymbl/ decken denselben Inhalt strukturiert ab',
} as const;

export interface HarvestedDocument {
  url: string;
  sha256: string;
  retrievedAt: string;
  html: string;
  fromCache: boolean;
}

export interface HarvestLimits {
  /** Höchstzahl der Netzabrufe dieses Laufs; danach hält der Lauf sauber an. */
  maxNetworkRequests?: number;
  /** Höchstzahl der Detailseiten dieses Laufs (Probeläufe). */
  maxDetails?: number;
}

export interface HarvestContext {
  fetcher: BayernRechtFetcher;
  log: (line: string) => void;
  limits: HarvestLimits;
}

/**
 * Sauberer Halt: Wird geworfen, wenn ein Budget erschöpft ist, der Anbieter sperrt oder im
 * Offline-Betrieb eine Adresse noch nicht im Cache liegt. In allen drei Fällen endet der Lauf
 * kontrolliert mit dem bis dahin Erreichten und meldet, was offen blieb; der nächste Lauf holt genau
 * diese Adresse nach.
 */
export class HarvestHalt extends Error {
  readonly reason: 'budget' | 'blocked' | 'offline';
  readonly pending: string;

  constructor(reason: 'budget' | 'blocked' | 'offline', pending: string) {
    super(`Abruf angehalten (${reason}): ${pending}`);
    this.name = 'HarvestHalt';
    this.reason = reason;
    this.pending = pending;
  }
}

function isRunStopping(error: unknown): boolean {
  const kind = (error as { kind?: string } | undefined)?.kind;
  return kind !== undefined && (RUN_STOPPING_FETCH_ERRORS as readonly string[]).includes(kind);
}

/** Ein Abruf mit sauberem Halt statt Abbruch. Alles andere wird nach oben gereicht. */
export async function fetchPage(context: HarvestContext, url: string, pending: string): Promise<HarvestedDocument> {
  if (context.limits.maxNetworkRequests !== undefined && context.fetcher.stats.networkRequests >= context.limits.maxNetworkRequests) {
    throw new HarvestHalt('budget', pending);
  }
  let document: FetchedDocument;
  try {
    document = await context.fetcher.fetch(url);
  } catch (error) {
    if (isRunStopping(error)) throw new HarvestHalt((error as { kind?: string }).kind === 'budget-exhausted' ? 'budget' : 'blocked', pending);
    // Offline-Betrieb: Die Adresse fehlt im Cache. Das ist kein Fehlabruf, sondern ein noch nicht
    // abgearbeiteter Teil des Plans – also ein Halt, kein Abbruch.
    if ((error as { kind?: string }).kind === 'network' && /Offline-Modus/u.test((error as Error).message)) {
      throw new HarvestHalt('offline', `${pending} (${url} fehlt im Cache)`);
    }
    throw error;
  }
  return { url, sha256: document.sha256, retrievedAt: document.retrievedAt, html: decodeHtml(document), fromCache: document.fromCache };
}

/**
 * Titelmuster, die auch ohne Gliederungsnummer den Volltext lohnen. Bewusst eng: Das BayMBl. enthält
 * überwiegend Stellenausschreibungen, Exequaturs und Verleihungen; deren Detailseiten tragen nichts zur
 * Stichtagsfrage bei und würden nur Abrufe verbrauchen.
 */
export const NORM_EVENT_TITLE_PATTERN =
  /\b(?:Aufhebung|aufgehoben|außer\s+Kraft|Außerkrafttreten|Neufassung|Neubekanntmachung|Berichtigung|Verlängerung\s+der\s+Geltungsdauer|Weitergeltung|Fortgeltung|Geltungsdauer)\b/u;

/**
 * Braucht dieser Eintrag den Volltext seiner Detailseite?
 *
 * Ja für jede GVBl.-Veröffentlichung – dort steht ausschließlich Rechtsetzung. Ja für jede
 * BayMBl.-Veröffentlichung, die die Plattform unter einer Gliederungsnummer führt, denn dann gehört sie
 * zur Vorschriftensammlung. Ja für Titel mit einem Normereignis-Muster. Sonst nein: Der Eintrag wird
 * aus den Listenangaben als Bekanntgabe geführt, geht also **nicht** verloren.
 */
export function needsFullText(entry: { organ: PublicationOrgan; gliederungsnummern: readonly string[]; title: string; detailPath?: string }): boolean {
  if (entry.detailPath === undefined) return false;
  if (entry.organ === 'gvbl') return true;
  if (entry.gliederungsnummern.length > 0) return true;
  return NORM_EVENT_TITLE_PATTERN.test(entry.title);
}

export interface HarvestedListingEntry extends ListingRow {
  organ: PublicationOrgan;
  /** Kennung der Trefferlistenseite, aus der die Zeile stammt (Provenienz der Listenangabe). */
  listingSourceId: string;
  listingUrl: string;
  listingSha256: string;
}

export interface ListingHarvest {
  issues: (IssueRow & { organ: PublicationOrgan })[];
  entries: HarvestedListingEntry[];
  documents: { id: string; url: string; sha256: string; retrievedAt: string; organ: PublicationOrgan; kind: 'issue-index' | 'publication-index' }[];
  /** Was beim Halt noch offen war; leer, wenn der Plan vollständig abgearbeitet wurde. */
  pending: string[];
}

/**
 * Schritt 1: Ausgabenverzeichnisse und Trefferlisten. Danach steht fest, welche Einzelveröffentlichungen
 * es im Zeitraum gibt – ohne dass eine einzige PDF geladen wurde.
 */
export async function harvestListings(context: HarvestContext, volumes: readonly number[]): Promise<ListingHarvest> {
  const issues: ListingHarvest['issues'] = [];
  const entries: HarvestedListingEntry[] = [];
  const documents: ListingHarvest['documents'] = [];
  const pending: string[] = [];

  try {
    for (const volume of volumes) {
      const url = gvblIssueIndexUrl(volume);
      const page = await fetchPage(context, url, `GVBl.-Ausgabenverzeichnis ${volume}`);
      const id = `gvbl-ausgaben-${volume}`;
      documents.push({ id, url, sha256: page.sha256, retrievedAt: page.retrievedAt, organ: 'gvbl', kind: 'issue-index' });
      const rows = parseGvblIssueIndex(page.html).filter((row) => row.volume === volume);
      issues.push(...rows.map((row) => ({ ...row, organ: 'gvbl' as const })));
      context.log(`  GVBl.-Ausgaben ${volume}: ${rows.length} Ausgaben mit veröffentlichter Prüfsumme${page.fromCache ? ' (Cache)' : ''}`);
    }

    for (const volume of volumes) {
      let offset = 1;
      let total: number | undefined;
      for (;;) {
        const url = gvblListingUrl(volume, offset);
        const page = await fetchPage(context, url, `GVBl.-Trefferliste ${volume} ab ${offset}`);
        const id = `gvbl-liste-${volume}-${String(offset).padStart(5, '0')}`;
        documents.push({ id, url, sha256: page.sha256, retrievedAt: page.retrievedAt, organ: 'gvbl', kind: 'publication-index' });
        const parsed = parseListingPage(page.html);
        total ??= parsed.totalHits;
        entries.push(...parsed.rows.map((row) => ({ ...row, organ: 'gvbl' as const, listingSourceId: id, listingUrl: url, listingSha256: page.sha256 })));
        if (parsed.rowsSeen < ITEMS_PER_PAGE) break;
        offset += ITEMS_PER_PAGE;
        if (total !== undefined && offset > total) break;
      }
      context.log(`  GVBl. ${volume}: ${entries.filter((entry) => entry.organ === 'gvbl' && entry.volume === volume).length} Veröffentlichungen (Liste meldet ${total ?? '?'})`);
    }

    // BayMBl. hat keinen Jahrgangsfilter; die Liste ist nach Fundstelle absteigend sortiert. Geblättert
    // wird, bis eine Seite keinen Eintrag mehr aus den erfassten Jahrgängen trägt.
    const firstVolume = Math.min(...volumes);
    let offset = 1;
    let total: number | undefined;
    for (;;) {
      const url = baymblListingUrl(offset);
      const page = await fetchPage(context, url, `BayMBl.-Trefferliste ab ${offset}`);
      const id = `baymbl-liste-${String(offset).padStart(5, '0')}`;
      documents.push({ id, url, sha256: page.sha256, retrievedAt: page.retrievedAt, organ: 'baymbl', kind: 'publication-index' });
      const parsed = parseListingPage(page.html);
      total ??= parsed.totalHits;
      const relevant = parsed.rows.filter((row) => row.volume >= firstVolume);
      entries.push(...relevant.map((row) => ({ ...row, organ: 'baymbl' as const, listingSourceId: id, listingUrl: url, listingSha256: page.sha256 })));
      if (relevant.length === 0 || parsed.rowsSeen < ITEMS_PER_PAGE) break;
      offset += ITEMS_PER_PAGE;
      if (total !== undefined && offset > total) break;
    }
    context.log(`  BayMBl.: ${entries.filter((entry) => entry.organ === 'baymbl').length} Veröffentlichungen ab Jahrgang ${firstVolume} (Liste meldet ${total ?? '?'} insgesamt)`);
  } catch (error) {
    if (!(error instanceof HarvestHalt)) throw error;
    pending.push(error.pending);
    context.log(`  Sauberer Halt (${error.reason}): ${error.pending}`);
  }

  issues.sort((left, right) => right.volume - left.volume || right.issue.localeCompare(left.issue));
  entries.sort((left, right) => left.organ.localeCompare(right.organ) || right.volume - left.volume || right.position - left.position);
  documents.sort((left, right) => left.id.localeCompare(right.id));
  return { issues, entries, documents, pending };
}
