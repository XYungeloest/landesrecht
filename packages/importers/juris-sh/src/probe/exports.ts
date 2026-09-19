/**
 * Public Export Discovery (Befehl `sample`, zweiter Teil): Gibt es einen offiziell vorgesehenen, öffentlichen
 * Ausgabeweg – PDF speichern, Druckansicht, Permalink „genau dieses Dokument“, „gültige Fassung“,
 * Gesamtausgabe, serverseitige Ausgabevarianten –, der den vollständigen Normtext per GET ohne Login und ohne
 * die interne Sitzungs-/CSRF-Schnittstelle liefert?
 *
 * Vorgehen, ohne `/jportal/wsrest/…` je aufzurufen (der Fetcher verweigert es technisch):
 *
 *   1. **Statische Analyse** der ausgelieferten Skriptbündel: Welche Anfrage erzeugt die Oberfläche für PDF,
 *      Word/RTF, HTML-Ansicht, Gesamtausgabe, Druck und Permalink – Methode, Pfad, Parameter, Header, Cookies,
 *      CSRF (`exportFlowEvidence`).
 *   2. **Proben je Norm** (mindestens 20, alle Kennungsfamilien): dokumentierte Adressformen, Permalink
 *      „genau dieses Dokument“ (`/perma?d=`) und die Ausgabeadresse des PDF-Exports
 *      (`/jportal/recherche3doc/<Name>.pdf?json={format,docPart,docId,portalId}`) – jeweils GET, ohne Cookie,
 *      ohne CSRF. Jede Weiterleitung wird einzeln protokolliert, ebenso `Set-Cookie` (nur Name und Attribute,
 *      nie der Wert) und der Kopf `tdm-reservation`.
 *   3. **Sitzungsprobe**: dieselbe Exportadresse einmal mit dem Sitzungscookie, das eine öffentliche GET-Antwort
 *      selbst gesetzt hat – belegt, ob eine anonyme Sitzung genügt oder Sitzungszustand aus der internen
 *      Schnittstelle nötig ist.
 *
 * Die Adresse des Exports steht nicht im Skriptbündel: Die Oberfläche übernimmt `pdfUrl`, `rtfUrl`, `htmlUrl`,
 * `aizZipUrl` aus der Antwort der internen Dokumentschnittstelle und verlinkt sie per GET (`<a href target=_blank>`).
 * Die geprüfte Form ist die Ausgabeadresse der juris-Plattform; ob der Server sie ohne Sitzungszustand bedient,
 * entscheidet allein seine Antwort.
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { classifyPortalHtml, documentUrl, permaUrl, PORTAL_ORIGIN, type DocumentedForm } from '../access/policy.ts';
import { AUDIT_DIR } from '../common/constants.ts';
import { createJurisShFetcher, decodeHtml, type FetchedDocument, type JurisShFetcher, type JurisShFetcherOptions } from '../common/fetcher.ts';
import { doknrFromRedirect } from '../enumerate/crosscheck.ts';
import { classifyDocumentId } from '../enumerate/sitemap.ts';

export const EXPORTS_PATH = `${AUDIT_DIR}/discovery/public-exports.json`;
export const EXPORTS_REPORT_PATH = `${AUDIT_DIR}/PUBLIC_EXPORT_DISCOVERY.md`;
export const EXPORTS_SCHEMA = 'juris-sh-public-exports/1' as const;
export const EXPORTS_REQUEST_BUDGET = 180;

export type SampleKind = 'verfassung' | 'gesetz' | 'verordnung' | 'vwv' | 'grosse-norm' | 'anlage-tabelle' | 'aenderungshistorie' | 'aufgehoben' | 'staatsvertrag';

export interface ExportSample {
  id: string;
  label: string;
  kinds: SampleKind[];
  /** Woher Kennung und Einordnung stammen (Suchindex der Discovery, Permalink-Auflösung, Sitemap). */
  basis: string;
}

/**
 * Stichprobe (23 Normen). Kennungen und Einordnung stammen aus der Discovery-Stichprobe (Suchindex, per
 * `/perma?d=` auf die DOKNR aufgelöst) bzw. aus der Sitemap; ohne Dokumentinhalt ist keine weitere Einordnung
 * möglich. Ein Staatsvertrag ließ sich nicht identifizieren (siehe `STAATSVERTRAG_ATTEMPTS`).
 */
export const EXPORT_SAMPLES: readonly ExportSample[] = [
  { id: 'jlr-NNLSH00002D11', label: 'Verf SH 2014 – Landesverfassung (Suchindex)', kinds: ['verfassung', 'aenderungshistorie'], basis: 'Alias jlr-VerfSH2014rahmen (Suchindex) per /perma?d=' },
  { id: 'jlr-NNLSH00002B40', label: 'LVwG – Landesgesetz, groß (Suchindex)', kinds: ['gesetz', 'grosse-norm', 'aenderungshistorie'], basis: 'Aliase jlr-VwGSHV57P108/jlr-VwGSHV69IVZ per /perma?d=; 709 Einheiten laut Sitemap' },
  { id: 'jlr-NNLSH00002AAF', label: 'SchulG – Landesgesetz, groß (Suchindex)', kinds: ['gesetz', 'grosse-norm'], basis: 'Alias jlr-SchulGSH2007rahmen per /perma?d=; 547 Einheiten' },
  { id: 'jlr-NNLSH00002E60', label: 'LWaldG – Landesgesetz (Suchindex)', kinds: ['gesetz'], basis: '/perma?a=WaldG_SH' },
  { id: 'jlr-NNLSH00002DF2', label: 'VerfSchG SH – Landesgesetz (Suchindex)', kinds: ['gesetz'], basis: 'Alias jlr-VerfSchGSHrahmen per /perma?d=' },
  { id: 'jlr-NNLSH00002A85', label: 'größtes Rahmendokument der Sitemap (Titel ohne Inhalt unbekannt)', kinds: ['grosse-norm'], basis: 'Sitemap: 945 Einheiten' },
  { id: 'jlr-NNLSH00002D66', label: 'LVO-Bildung – Landesverordnung (Suchindex)', kinds: ['verordnung'], basis: 'Alias jlr-BildG2LbVSH2019rahmen per /perma?d=' },
  { id: 'jlr-NNLSH00002B25', label: 'BauGebVO – Landesverordnung mit Anlage/Tabelle (Suchindex)', kinds: ['verordnung', 'anlage-tabelle'], basis: 'Alias jlr-BauGebVSH2022pAnlage1 (Gebührenverzeichnis) per /perma?d=' },
  { id: 'jlr-NNLSH00002F02', label: 'BhVO – Landesverordnung mit Anlage/Tabelle (Suchindex)', kinds: ['verordnung', 'anlage-tabelle'], basis: 'Alias jlr-BhVSHpAnlage1 per /perma?d=' },
  { id: 'jlr-NNLSH00002B66', label: 'KampfmV SH 2012 – Landesverordnung mit Anlage (Suchindex)', kinds: ['verordnung', 'anlage-tabelle', 'aenderungshistorie'], basis: 'Alias jlr-KampfmVSH2012V3Anlage per /perma?d=' },
  { id: 'jlr-NNLSH00003051', label: 'KrummNatSchV SH 2013 – Naturschutz-Landesverordnung (Suchindex)', kinds: ['verordnung', 'anlage-tabelle'], basis: 'Alias jlr-KrummNatSchVSH2013V2Anlage per /perma?d=' },
  { id: 'jlr-NNLSH00002D40', label: 'EB-WahlVO – Landesverordnung (Suchindex)', kinds: ['verordnung'], basis: 'Alias jlr-EltBeirWOSH2022pP13 per /perma?d=' },
  { id: 'jlr-NNLSH00002BC4', label: 'ZVO – Landesverordnung (Suchindex)', kinds: ['verordnung', 'aenderungshistorie'], basis: 'Alias jlr-ZeugnVSH2018V7P5 (Fassung 2023-07-30 bis 2024-12-17) per /perma?d=' },
  { id: 'jlr-NNLSH00002AA1', label: 'PersRWahlV SH 2018 – Landesverordnung (Suchindex)', kinds: ['verordnung', 'aenderungshistorie'], basis: 'Alias jlr-PersRWahlVSH2018V2P1 (Zukunftsfassung) per /perma?d=' },
  { id: 'jlr-NNLSH000033AF', label: 'CoronaVQuarV SH 2 – außer Kraft getretene Landesverordnung (Suchindex)', kinds: ['verordnung', 'aufgehoben'], basis: 'Alias jlr-CoronaVQuarVSH2pP3 per /perma?d=' },
  { id: 'jlr-NNLSH00003321', label: 'BauAufsÜV SH 2022 – Landesverordnung (Suchindex)', kinds: ['verordnung'], basis: 'Alias jlr-BauAufsÜVSH2022pP1 per /perma?d=' },
  { id: 'jlr-NNLSH00002B00', label: 'EntschVO – Landesverordnung (Suchindex)', kinds: ['verordnung'], basis: 'Einheit jlr-NNLSH00002B00NN00000000008 (Suchindex)' },
  { id: 'jlr-NNLSH00002D22', label: 'GemSchulV SH 2024 – Landesverordnung, klein (Suchindex)', kinds: ['verordnung'], basis: 'Alias jlr-GemSchulVSH2024pP2 per /perma?d=' },
  { id: 'VVSH-VVSH000004586', label: 'VwV „Durchführung der gemeindlichen Selbstverwaltungsaufgaben durch das Amt“ (Suchindex)', kinds: ['vwv'], basis: 'Suchindex, in der Sitemap' },
  { id: 'VVSH-VVSH000000003', label: 'VwV (erste der Sitemap)', kinds: ['vwv'], basis: 'Sitemap' },
  { id: 'VVSH-VVSH000001829', label: 'VwV (Sitemap, Position 501)', kinds: ['vwv'], basis: 'Sitemap' },
  { id: 'VVSH-VVSH000007253', label: 'VwV (Sitemap, Position 1201)', kinds: ['vwv'], basis: 'Sitemap' },
  { id: 'VVSH-VVSH000010460', label: 'VwV (letzte der Sitemap)', kinds: ['vwv'], basis: 'Sitemap' },
];

/** Einheiten mit Fassungssegment (`p`, `V<n>`): historische bzw. künftige Fassungen „genau dieses Dokuments“. */
export const VERSION_ALIASES = [
  { alias: 'jlr-VwGSHV57P108', note: '§ 108 LVwG, Fassung V57 (gültig ab 2024-01-01 laut Suchindex)' },
  { alias: 'jlr-VwGSHV69IVZ', note: 'Inhaltsverzeichnis LVwG, Fassung V69 (gültig ab 2025-04-15 laut Suchindex)' },
  { alias: 'jlr-VerfSH2014pArt14', note: 'Art. 14 Verfassung, Segment p' },
  { alias: 'jlr-VerfSH2014V5Art46', note: 'Art. 46 Verfassung, Segment V5' },
  { alias: 'jlr-ZeugnVSH2018V7P5', note: '§ 5 ZVO, Fassung V7 (2023-07-30 bis 2024-12-17 laut Suchindex – galt am Stichtag)' },
  { alias: 'jlr-EltBeirWOSH2022pP13', note: '§ 13 EB-WahlVO (2022-07-31 bis 2024-08-30 laut Suchindex – galt am Stichtag)' },
] as const;

/** Versuche, einen Staatsvertrag über den gleitenden Permalink (juris-Abkürzung) zu finden – beide ohne DOKNR. */
export const STAATSVERTRAG_ATTEMPTS = ['MStV_HSH', 'MedienStVtr_HA_SH'] as const;

export type ExportForm = DocumentedForm | 'perma-d' | 'pdf-export' | 'rtf-export' | 'html-export' | 'print-route' | 'perma-session' | 'pdf-export-with-session';
export type ExportOutcome = 'spa-shell' | 'content' | 'pdf' | 'session-required' | 'blocked' | 'not-found' | 'error' | 'other';

export interface HopRecord {
  url: string;
  status: number;
  location?: string;
  /** `Set-Cookie`: nur Name und Attribute, der Wert wird nie gespeichert. */
  setCookie?: string[];
  tdmReservationHeader?: string;
}

export interface ExportProbe {
  documentId: string;
  form: ExportForm;
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  sha256?: string;
  byteLength?: number;
  retrievedAt?: string;
  fromCache?: boolean;
  outcome: ExportOutcome;
  /** Weiterleitungskette mit Status, Ziel und Cookies (nur bei Netzabruf in diesem Lauf). */
  hops?: HopRecord[];
  /** DOKNR, auf die ein Permalink weiterleitet. */
  resolvedId?: string;
  /** Wortlaut einer Text-Antwort (Fehlermeldung), gekürzt. */
  message?: string;
  /** Sitzungsprobe: Namen der mitgeschickten Cookies (nie die Werte). */
  sessionCookies?: string[];
  error?: string;
}

/** Wie die Oberfläche Ausgaben anfordert – aus den Skriptbündeln gelesen, nie ausgeführt. */
export interface ExportFlowEvidence {
  /** Export-Adressen stammen aus der Dokumentantwort der internen Schnittstelle (`otherRepresentations.*Url`). */
  representationFields: string[];
  /** Der PDF-Knopf ist ein GET-Link auf `/jportal/<pdfUrl>` in neuem Fenster (`<a href target=_blank>`). */
  pdfLinkIsPlainGet: boolean;
  /** Druck ist eine Route der Oberfläche (`print/document`), gerendert aus dem geladenen Dokumentzustand. */
  printRoute?: string;
  /** Das CSRF-Token stammt aus der Antwort der Initialisierung über die interne Schnittstelle (`init` → `csrfToken`). */
  csrfFromInit: boolean;
  /** Remote-Operationen: POST an `apiPath + <Operation>`. */
  remoteOperationsPost: boolean;
  /** Permalink-Text kommt aus der Dokumentantwort (`content.permalink`). */
  permalinkFromDocument: boolean;
  /** Gesamtausgabe als ZIP (`aizZipUrl`) aus der Dokumentantwort. */
  aizZip: boolean;
}

export function exportFlowEvidence(scripts: readonly string[]): ExportFlowEvidence {
  const all = scripts.join('\n');
  const fields = [...new Set([...all.matchAll(/otherRepresentations\.(\w+Url)\b/gu)].map((match) => match[1]!))].sort();
  return {
    representationFields: fields,
    pdfLinkIsPlainGet: /pdfLink:[\w$]+,pdfState:[\w$]+[\s\S]{0,1600}href:[\w$]+,onClick:[\w$]+,target:`_blank`/u.test(all),
    ...(/PrintDocument:`(print\/document)`/u.exec(all) ? { printRoute: /PrintDocument:`(print\/document)`/u.exec(all)![1]! } : {}),
    csrfFromInit: /[\w$]+\(`init`,\{\},[\s\S]{0,200}csrfToken/u.test(all),
    remoteOperationsPost: /i\.input=St\.apiPath\+/u.test(all) && /method:`POST`,credentials:`include`/u.test(all),
    permalinkFromDocument: /content\.permalink\)/u.test(all),
    aizZip: fields.includes('aizZipUrl'),
  };
}

/** Name der Ausgabedatei für die Exportadresse (kosmetisch; der Server wertet `json` aus). */
function exportName(documentId: string): string {
  return documentId.replace(/[^A-Za-z0-9]+/gu, '_');
}

/** Ausgabeadresse der juris-Plattform für PDF/RTF/HTML: GET `/jportal/recherche3doc/<Name>.<ext>?json={…}`. */
export function exportUrl(documentId: string, format: 'pdf' | 'rtf' | 'html', docPart = 'X'): string {
  const name = `${exportName(documentId)}.${format}`;
  const json = JSON.stringify({ format, docPart, docId: documentId, portalId: 'bssh' });
  return `${PORTAL_ORIGIN}/jportal/recherche3doc/${name}?json=${encodeURIComponent(json)}&_=${encodeURIComponent(`/${name}`)}`;
}

export const SESSION_REQUIRED_PATTERN = /Sitzung bereits beendet|Recherche erneut durchgef/u;

/** `Set-Cookie` ohne Wert: `JSESSIONID=…; Path=/; Secure` → `JSESSIONID; Path=/; Secure`. */
export function redactCookie(header: string): string {
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  return [pair.split('=')[0] ?? '', ...attributes].filter(Boolean).join('; ');
}

/**
 * Fetch-Funktion, die Weiterleitungen einzeln verfolgt und je Station Status, Ziel, `Set-Cookie` (ohne Wert) und
 * `tdm-reservation` festhält. Mit `jar` verhält sie sich wie ein Browser ohne Skripte: gesetzte Cookies werden
 * gesammelt und bei jeder folgenden Anfrage mitgeschickt (nur für die Sitzungsprobe; Werte bleiben im Speicher).
 */
export function createRecordingFetch(base: typeof fetch = fetch, jar?: Map<string, string>): { fetchImplementation: typeof fetch; hops: Map<string, HopRecord[]>; cookieNames: Set<string> } {
  const hops = new Map<string, HopRecord[]>();
  const cookieNames = new Set<string>();
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const start = String(input);
    const chain: HopRecord[] = [];
    let url = start;
    for (let step = 0; step < 6; step += 1) {
      const headers = new Headers(init?.headers);
      if (jar && jar.size > 0) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
      const response = await base(url, { ...init, headers, redirect: 'manual' });
      const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
      for (const header of setCookies) {
        const [pair = ''] = header.split(';');
        const separator = pair.indexOf('=');
        const name = (separator < 0 ? pair : pair.slice(0, separator)).trim();
        if (!name) continue;
        cookieNames.add(name);
        if (jar) jar.set(name, separator < 0 ? '' : pair.slice(separator + 1).trim());
      }
      const location = response.headers.get('location') ?? undefined;
      const tdm = response.headers.get('tdm-reservation') ?? undefined;
      chain.push({ url, status: response.status, ...(location ? { location } : {}), ...(setCookies.length > 0 ? { setCookie: setCookies.map(redactCookie) } : {}), ...(tdm ? { tdmReservationHeader: tdm } : {}) });
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => undefined);
        url = new URL(location, url).href;
        continue;
      }
      hops.set(start, chain);
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }
    throw new Error(`zu viele Weiterleitungen ab ${start}`);
  }) as typeof fetch;
  return { fetchImplementation, hops, cookieNames };
}

function classifyResponse(document: FetchedDocument): Pick<ExportProbe, 'outcome' | 'message'> {
  if (/pdf/iu.test(document.contentType)) return { outcome: 'pdf' };
  const text = decodeHtml(document);
  if (/text\/plain/iu.test(document.contentType)) {
    const message = text.trim().replace(/\s+/gu, ' ').slice(0, 300);
    return { outcome: SESSION_REQUIRED_PATTERN.test(text) ? 'session-required' : 'other', message };
  }
  if (/html/iu.test(document.contentType)) return { outcome: classifyPortalHtml(text).kind };
  return { outcome: 'other' };
}

async function probe(fetcher: JurisShFetcher, hops: Map<string, HopRecord[]>, documentId: string, form: ExportForm, url: string): Promise<ExportProbe> {
  try {
    const document = await fetcher.fetch(url);
    const record: ExportProbe = {
      documentId, form, url, finalUrl: document.finalUrl, httpStatus: document.status, contentType: document.contentType, sha256: document.sha256,
      byteLength: document.bytes.byteLength, retrievedAt: document.retrievedAt, fromCache: document.fromCache, ...classifyResponse(document),
    };
    const chain = hops.get(url);
    if (chain) record.hops = chain;
    if (form === 'perma-d') {
      const resolved = doknrFromRedirect(document.finalUrl);
      if (resolved) record.resolvedId = resolved;
    }
    return record;
  } catch (error) {
    if (error instanceof RechtNrwFetchError) {
      if (error.kind === 'forbidden' || error.kind === 'rate-limited' || error.kind === 'blocked') return { documentId, form, url, outcome: 'blocked', error: error.message };
      if (error.kind === 'not-found') return { documentId, form, url, outcome: 'not-found', httpStatus: 404 };
      if (error.kind === 'budget-exhausted' || error.kind === 'interrupted') throw error;
    }
    return { documentId, form, url, outcome: 'error', error: (error as Error).message };
  }
}

export interface ExportDiscoveryReport {
  schemaVersion: typeof EXPORTS_SCHEMA;
  samples: readonly ExportSample[];
  staatsvertragAttempts: Array<{ abbreviation: string; finalUrl?: string; resolvedId?: string }>;
  flow: ExportFlowEvidence;
  probes: ExportProbe[];
  versions: Array<{ alias: string; note: string; resolvedId?: string; frameId?: string; documentOutcome?: ExportOutcome }>;
  summary: {
    samples: number;
    probes: number;
    byOutcome: Partial<Record<ExportOutcome, number>>;
    /** Öffentliche GET-Antworten der Dokument- und Permalinkseiten mit `Set-Cookie`. */
    publicPagesSettingCookies: number;
    publicPagesProbedFresh: number;
    exportEndpointSetsSession: boolean;
    tdmReservationHeader: boolean;
  };
  conclusion: 'public-export-available' | 'no-public-export';
  reasoning: string[];
}

export interface ExportDiscoveryOptions {
  root: string;
  write: boolean;
  offline: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
  /** Grund-Fetch (Tests); wird von der protokollierenden Fetch-Funktion umhüllt. */
  baseFetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Skriptbündel der Oberfläche (Adressen); Standard: aus der Adressierbarkeitsprobe. */
  scriptUrls?: string[];
}

export function concludeExports(probes: readonly ExportProbe[], flow: ExportFlowEvidence): Pick<ExportDiscoveryReport, 'conclusion' | 'reasoning'> {
  const reasoning: string[] = [];
  const textual = probes.filter((entry) => entry.outcome === 'content' || entry.outcome === 'pdf');
  if (textual.length > 0) {
    reasoning.push(`${textual.length} Probe(n) liefern Inhalt (${[...new Set(textual.map((entry) => entry.form))].join(', ')}) über eine öffentliche GET-Adresse`);
    return { conclusion: 'public-export-available', reasoning };
  }
  const shells = probes.filter((entry) => entry.outcome === 'spa-shell').length;
  const session = probes.filter((entry) => entry.outcome === 'session-required');
  reasoning.push(`${shells} Proben der dokumentierten Adressformen und Permalinks liefern die leere Oberflächenseite`);
  const withSession = probes.find((entry) => entry.form === 'pdf-export-with-session');
  if (session.length > 0) reasoning.push(`${session.length} Proben der Ausgabeadresse (/jportal/recherche3doc/…) antworten „${session[0]!.message ?? ''}“${withSession?.outcome === 'session-required' ? ` – auch mit der anonymen Sitzung eines öffentlichen Permalink-Aufrufs (Cookies ${(withSession.sessionCookies ?? []).join(', ')})` : ''}: Die Ausgabe setzt eine Sitzung voraus, in der das Dokument zuvor über die interne Schnittstelle geladen wurde`);
  if (flow.representationFields.length > 0) reasoning.push(`Die Oberfläche kennt die Ausgabeadressen (${flow.representationFields.join(', ')}) nur aus der Antwort der internen Dokumentschnittstelle`);
  if (flow.csrfFromInit) reasoning.push('Das CSRF-Token stammt aus der POST-Initialisierung der internen Schnittstelle (init → csrfToken), nicht aus einem öffentlichen Seitenaufruf');
  return { conclusion: 'no-public-export', reasoning };
}

export async function runExportDiscovery(options: ExportDiscoveryOptions): Promise<{ report: ExportDiscoveryReport; written: string[]; network: { requests: number; cacheHits: number; bytes: number } }> {
  const log = options.log ?? ((): void => undefined);
  const recording = createRecordingFetch(options.baseFetch ?? fetch);
  const base: JurisShFetcherOptions = { root: options.root, offline: options.offline, budget: { maxRequests: EXPORTS_REQUEST_BUDGET }, fetchImplementation: recording.fetchImplementation, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}), ...(options.sleep ? { sleep: options.sleep } : {}) };
  const fetcher = createJurisShFetcher(base);

  // 1. Statische Analyse der Skriptbündel (aus dem Cache der Adressierbarkeitsprobe).
  const addressability = await readJsonFile<{ spa?: { entryScripts?: Array<{ url: string }>; bundles?: Array<{ url: string }> } }>(join(options.root, AUDIT_DIR, 'discovery', 'content-addressability.json'));
  const scriptUrls = options.scriptUrls ?? [...(addressability?.spa?.entryScripts ?? []), ...(addressability?.spa?.bundles ?? [])].map((entry) => entry.url);
  const scripts: string[] = [];
  for (const url of scriptUrls) scripts.push(new TextDecoder().decode((await fetcher.fetch(url)).bytes));
  const flow = exportFlowEvidence(scripts);
  log(`Bündel: Ausgabeadressen aus ${flow.representationFields.join(', ') || '–'} · PDF-Link GET ${flow.pdfLinkIsPlainGet ? 'ja' : 'nein'} · Druckroute ${flow.printRoute ?? '–'} · CSRF aus init ${flow.csrfFromInit ? 'ja' : 'nein'}`);

  // 2. Proben je Norm.
  const probes: ExportProbe[] = [];
  const forms: DocumentedForm[] = ['document', 'document-part', 'xsl', 'xsl-part'];
  for (const sample of EXPORT_SAMPLES) {
    const results: ExportProbe[] = [];
    for (const form of forms) results.push(await probe(fetcher, recording.hops, sample.id, form, documentUrl(sample.id, form)));
    results.push(await probe(fetcher, recording.hops, sample.id, 'perma-d', permaUrl(sample.id)));
    results.push(await probe(fetcher, recording.hops, sample.id, 'pdf-export', exportUrl(sample.id, 'pdf')));
    probes.push(...results);
    log(`${sample.id} (${sample.kinds.join(', ')}): ${results.map((entry) => `${entry.form}=${entry.outcome}`).join(' · ')}`);
    if (results.some((entry) => entry.outcome === 'blocked')) {
      log('Sperrsignal – Probe wird angehalten (keine Umgehung).');
      break;
    }
  }

  // 3. Weitere Ausgabevarianten und Druckroute (einmal, am ersten Rahmendokument).
  const first = EXPORT_SAMPLES[0]!.id;
  probes.push(await probe(fetcher, recording.hops, first, 'rtf-export', exportUrl(first, 'rtf')));
  probes.push(await probe(fetcher, recording.hops, first, 'html-export', exportUrl(first, 'html')));
  probes.push(await probe(fetcher, recording.hops, first, 'print-route', `${PORTAL_ORIGIN}/bssh/print/document`));

  // 4. Sitzungsprobe wie ein Browser ohne Skripte: öffentlicher Permalink-Aufruf (setzt die anonyme Sitzung),
  //    danach dieselbe Exportadresse mit allen dabei gesetzten Cookies. Kein CSRF, keine interne Schnittstelle.
  if (!options.offline) {
    const jar = new Map<string, string>();
    const browser = createRecordingFetch(options.baseFetch ?? fetch, jar);
    const sessionFetcher = createJurisShFetcher({ ...base, refresh: true, fetchImplementation: browser.fetchImplementation });
    const opened = await probe(sessionFetcher, browser.hops, first, 'perma-session', permaUrl(first));
    // Eigene Adresse (Dateiname mit „-session“): Der Cacheeintrag der sitzungslosen Probe bleibt unberührt.
    const replay = await probe(sessionFetcher, browser.hops, first, 'pdf-export-with-session', exportUrl(first, 'pdf').replace(/\.pdf\?/u, '-session.pdf?'));
    replay.sessionCookies = [...jar.keys()].sort();
    probes.push(opened, replay);
    log(`Sitzungsprobe (Cookies aus /perma?d=: ${replay.sessionCookies.join(', ') || 'keine'}): ${replay.outcome}${replay.message ? ` – ${replay.message}` : ''}`);
  }

  // 5. Historische Fassungen: Aliase mit Fassungssegment → DOKNR der Einheit, Dokumentseite der Einheit.
  const versions: ExportDiscoveryReport['versions'] = [];
  for (const entry of VERSION_ALIASES) {
    const resolved = await probe(fetcher, recording.hops, entry.alias, 'perma-d', permaUrl(entry.alias));
    const version: ExportDiscoveryReport['versions'][number] = { alias: entry.alias, note: entry.note };
    if (resolved.resolvedId) {
      version.resolvedId = resolved.resolvedId;
      const frame = classifyDocumentId(resolved.resolvedId).frameId;
      if (frame) version.frameId = frame;
      version.documentOutcome = (await probe(fetcher, recording.hops, resolved.resolvedId, 'document', documentUrl(resolved.resolvedId))).outcome;
    }
    versions.push(version);
  }

  // 6. Staatsvertrag über den gleitenden Permalink (juris-Abkürzung).
  const staatsvertragAttempts: ExportDiscoveryReport['staatsvertragAttempts'] = [];
  for (const abbreviation of STAATSVERTRAG_ATTEMPTS) {
    const result = await probe(fetcher, recording.hops, abbreviation, 'perma-d', permaUrl(abbreviation, 'a'));
    staatsvertragAttempts.push({ abbreviation, ...(result.finalUrl ? { finalUrl: result.finalUrl } : {}), ...(result.resolvedId ? { resolvedId: result.resolvedId } : {}) });
  }

  // Wiederholungslauf aus dem Cache: Belege des Netzabrufs (Weiterleitungen, Set-Cookie) und die Sitzungsprobe
  // aus dem Vorgängerbericht übernehmen, statt sie zu verlieren oder erneut abzurufen.
  const previous = await readExportDiscovery(options.root);
  if (previous) {
    const earlier = new Map(previous.probes.map((entry) => [`${entry.form} ${entry.url}`, entry]));
    for (const entry of probes) {
      const before = earlier.get(`${entry.form} ${entry.url}`);
      if (!entry.hops && before?.hops && before.sha256 === entry.sha256) entry.hops = before.hops;
    }
    if (!probes.some((entry) => entry.form === 'pdf-export-with-session')) probes.push(...previous.probes.filter((entry) => entry.form === 'perma-session' || entry.form === 'pdf-export-with-session'));
  }

  const byOutcome: ExportDiscoveryReport['summary']['byOutcome'] = {};
  for (const entry of probes) byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
  const publicPages = probes.filter((entry) => (entry.form === 'document' || entry.form === 'perma-d' || entry.form === 'xsl') && entry.hops);
  const report: ExportDiscoveryReport = {
    schemaVersion: EXPORTS_SCHEMA,
    samples: EXPORT_SAMPLES,
    staatsvertragAttempts,
    flow,
    probes,
    versions,
    summary: {
      samples: EXPORT_SAMPLES.length,
      probes: probes.length,
      byOutcome,
      publicPagesSettingCookies: publicPages.filter((entry) => entry.hops!.some((hop) => hop.setCookie?.length)).length,
      publicPagesProbedFresh: publicPages.length,
      exportEndpointSetsSession: probes.some((entry) => entry.form === 'pdf-export' && entry.hops?.some((hop) => hop.setCookie?.some((cookie) => cookie.startsWith('JSESSIONID')))),
      tdmReservationHeader: probes.some((entry) => entry.hops?.some((hop) => hop.tdmReservationHeader === '1')),
    },
    ...concludeExports(probes, flow),
  };

  const written: string[] = [];
  if (options.write) {
    if (await writeJsonAtomic(join(options.root, EXPORTS_PATH), report)) written.push(EXPORTS_PATH);
    const { renderExportDiscovery } = await import('../reports/render.ts');
    if (await writeFileAtomic(join(options.root, EXPORTS_REPORT_PATH), renderExportDiscovery(report))) written.push(EXPORTS_REPORT_PATH);
  }
  return { report, written, network: { requests: fetcher.stats.networkRequests, cacheHits: fetcher.stats.cacheHits, bytes: fetcher.stats.bytesDownloaded ?? 0 } };
}

export async function readExportDiscovery(root: string): Promise<ExportDiscoveryReport | undefined> {
  return readJsonFile<ExportDiscoveryReport>(join(root, EXPORTS_PATH));
}
