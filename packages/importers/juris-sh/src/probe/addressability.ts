/**
 * Probe der Inhaltsadressierbarkeit (Befehl `sample`): Liefern die **dokumentierten öffentlichen
 * Adressformen** (`/bssh/document/<ID>`, `…/part/X`, `…/format/xsl`, `…/format/xsl/part/X`) Normtext?
 *
 * Je Probedokument und Adressform wird die Antwort mit SHA-256 festgehalten und eingestuft
 * (`classifyPortalHtml`): `spa-shell` (Startseite der Oberfläche ohne sichtbaren Text – der Inhalt käme erst
 * per Skript), `content` (sichtbarer Text) oder Sperrsignal (403/429, Challenge-Seite).
 *
 * Zusätzlich wird belegt, **woher** die Oberfläche den Inhalt holt: Aus dem Modulskript der Startseite und den
 * von ihm importierten `src-*.js`-Bündeln werden Build-Konfiguration (`VITE_apiPath`) und Anfrageform (POST,
 * `JURIS-PORTALID`, `X-CSRF-TOKEN`, `credentials: include`) gelesen. Diese Schnittstelle ist nicht
 * dokumentiert und sitzungsgebunden; sie wird **nie** aufgerufen (die Zugriffspolitik verweigert sie technisch).
 *
 * Ergebnis `content-not-publicly-addressable`, wenn keine dokumentierte Form Inhalt liefert – dann ist die
 * Strukturinventur des Vollkorpus nicht möglich, und die Readiness bleibt rot.
 */
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { classifyPortalHtml, DOCUMENTED_FORMS, documentUrl, internalEndpointEvidence, moduleImports, PORTAL_ORIGIN, type DocumentedForm, type InternalEndpointEvidence } from '../access/policy.ts';
import { AUDIT_DIR } from '../common/constants.ts';
import { createJurisShFetcher, decodeHtml, type JurisShFetcher, type JurisShFetcherOptions } from '../common/fetcher.ts';

export const ADDRESSABILITY_PATH = `${AUDIT_DIR}/discovery/content-addressability.json`;
export const STRUCTURE_REPORT_PATH = `${AUDIT_DIR}/STRUCTURE_REPORT.md`;
export const ADDRESSABILITY_SCHEMA = 'juris-sh-content-addressability/1' as const;
export const PROBE_REQUEST_BUDGET = 40;

/** Probedokumente: je Familie mindestens eines, Kennungen aus der Sitemap bzw. aus Permalink-Weiterleitungen. */
export const PROBE_DOCUMENTS = [
  { id: 'jlr-NNLSH00002D11', label: 'Landesverfassung, Rahmendokument (Alias jlr-VerfSH2014rahmen, per /perma?d= aufgelöst)' },
  { id: 'jlr-NNLSH00002E60', label: 'Landeswaldgesetz, Rahmendokument (per jlink „WaldG SH“ aufgelöst)' },
  { id: 'jlr-NNLSH00002A6ENN00000000001', label: 'Einheit eines Rahmendokuments (erste Einheit der Sitemap)' },
  { id: 'VVSH-VVSH000000003', label: 'Verwaltungsvorschrift (erste der Sitemap)' },
  { id: 'jlr-FFNInhaltSH', label: 'Register FFN-Inhaltsübersicht (zweite Enumerationsquelle)' },
] as const;

export type ProbeOutcome = 'spa-shell' | 'content' | 'blocked' | 'challenge' | 'not-found' | 'error' | 'non-html';

export interface ProbeRecord {
  documentId: string;
  form: DocumentedForm;
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  sha256?: string;
  byteLength?: number;
  retrievedAt?: string;
  outcome: ProbeOutcome;
  visibleTextLength?: number;
  markers?: string[];
  error?: string;
}

export interface AddressabilityReport {
  schemaVersion: typeof ADDRESSABILITY_SCHEMA;
  documents: ReadonlyArray<{ id: string; label: string }>;
  probes: ProbeRecord[];
  summary: Record<ProbeOutcome, number> & { total: number; distinctBodies: number };
  spa: {
    entryScripts: Array<{ url: string; sha256: string; byteLength: number }>;
    bundles: Array<{ url: string; sha256: string; byteLength: number }>;
    evidence: InternalEndpointEvidence;
  };
  /** `<meta name="tdm-reservation" content="1">` auf den Oberflächenseiten. */
  tdmReservation: boolean;
  jurisVersion?: string;
  conclusion: 'content-not-publicly-addressable' | 'content-addressable' | 'blocked';
  reasoning: string[];
}

const CHALLENGE = /captcha|cf-challenge|challenge-platform|Just a moment|Access denied|Zugriff verweigert/iu;

export function emptySummary(): AddressabilityReport['summary'] {
  return { total: 0, distinctBodies: 0, 'spa-shell': 0, content: 0, blocked: 0, challenge: 0, 'not-found': 0, error: 0, 'non-html': 0 };
}

export function concludeAddressability(probes: readonly ProbeRecord[], evidence: InternalEndpointEvidence): Pick<AddressabilityReport, 'conclusion' | 'reasoning'> {
  const reasoning: string[] = [];
  const blocked = probes.filter((probe) => probe.outcome === 'blocked' || probe.outcome === 'challenge');
  if (blocked.length > 0) {
    reasoning.push(`${blocked.length} Probe(n) mit Sperrsignal (403/429/Challenge) – Abruf wird angehalten, nicht umgangen`);
    return { conclusion: 'blocked', reasoning };
  }
  const content = probes.filter((probe) => probe.outcome === 'content');
  if (content.length > 0) {
    reasoning.push(`${content.length} Probe(n) liefern sichtbaren Dokumenttext über eine dokumentierte Adressform`);
    return { conclusion: 'content-addressable', reasoning };
  }
  const shells = probes.filter((probe) => probe.outcome === 'spa-shell');
  reasoning.push(`${shells.length}/${probes.length} Proben liefern die leere Startseite der Portaloberfläche (kein sichtbarer Text; Inhalt wird erst per Skript geladen)`);
  const bodies = new Set(shells.map((probe) => probe.sha256));
  if (shells.length > 0) reasoning.push(`${bodies.size} unterschiedliche Antwortkörper über alle Dokumente und Formen – die Antwort hängt nicht vom Dokument ab`);
  if (evidence.apiPath) reasoning.push(`Die Oberfläche lädt Dokumente über ${evidence.apiPath} (Build-Konfiguration VITE_apiPath)${evidence.csrfHeader ? ' mit X-CSRF-TOKEN' : ''}${evidence.portalIdHeader ? ' und JURIS-PORTALID' : ''}${evidence.credentialsInclude ? ', Sitzungscookie (credentials: include)' : ''} – interne, nicht dokumentierte Schnittstelle; nach der Zugriffspolitik nicht benutzt`);
  return { conclusion: 'content-not-publicly-addressable', reasoning };
}

export interface ProbeOptions {
  root: string;
  write: boolean;
  offline: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
  createFetcher?: (options: JurisShFetcherOptions) => JurisShFetcher;
}

export interface ProbeResult {
  report: AddressabilityReport;
  written: string[];
  network: { requests: number; cacheHits: number; bytes: number };
}

async function probeOne(fetcher: JurisShFetcher, documentId: string, form: DocumentedForm): Promise<ProbeRecord> {
  const url = documentUrl(documentId, form);
  try {
    const document = await fetcher.fetch(url);
    const base: ProbeRecord = { documentId, form, url, finalUrl: document.finalUrl, httpStatus: document.status, contentType: document.contentType, sha256: document.sha256, byteLength: document.bytes.byteLength, retrievedAt: document.retrievedAt, outcome: 'non-html' };
    if (!/html/iu.test(document.contentType)) return base;
    const html = decodeHtml(document);
    if (CHALLENGE.test(html) && !/Aktivieren Sie bitte JavaScript/iu.test(html)) return { ...base, outcome: 'challenge', markers: ['Challenge-/Sperrseite'] };
    const classification = classifyPortalHtml(html);
    return { ...base, outcome: classification.kind, visibleTextLength: classification.visibleTextLength, markers: classification.markers };
  } catch (error) {
    if (error instanceof RechtNrwFetchError) {
      if (error.kind === 'forbidden' || error.kind === 'rate-limited' || error.kind === 'blocked') return { documentId, form, url, outcome: 'blocked', ...(error.status ? { httpStatus: error.status } : {}), error: error.message };
      if (error.kind === 'not-found') return { documentId, form, url, outcome: 'not-found', httpStatus: 404, error: error.message };
      if (error.kind === 'budget-exhausted' || error.kind === 'interrupted') throw error;
    }
    return { documentId, form, url, outcome: 'error', error: (error as Error).message };
  }
}

export async function runAddressabilityProbe(options: ProbeOptions): Promise<ProbeResult> {
  const log = options.log ?? ((): void => undefined);
  const create = options.createFetcher ?? createJurisShFetcher;
  const fetcher = create({ root: options.root, offline: options.offline, budget: { maxRequests: PROBE_REQUEST_BUDGET }, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}) });
  const probes: ProbeRecord[] = [];
  for (const document of PROBE_DOCUMENTS) {
    for (const form of DOCUMENTED_FORMS) {
      const probe = await probeOne(fetcher, document.id, form);
      probes.push(probe);
      log(`${document.id} ${form}: ${probe.outcome}${probe.httpStatus ? ` (HTTP ${probe.httpStatus}, ${probe.byteLength ?? 0} Bytes, SHA-256 ${(probe.sha256 ?? '').slice(0, 12)})` : ''}`);
      if (probe.outcome === 'blocked' || probe.outcome === 'challenge') break;
    }
    if (probes.some((probe) => probe.outcome === 'blocked' || probe.outcome === 'challenge')) {
      log('Sperrsignal – Probe wird angehalten (keine Umgehung).');
      break;
    }
  }

  // Belege für die Herkunft des Inhalts: Modulskript der Startseite und seine src-*-Bündel (nur lesen).
  const entryScripts: AddressabilityReport['spa']['entryScripts'] = [];
  const bundles: AddressabilityReport['spa']['bundles'] = [];
  const merged: InternalEndpointEvidence = { portalIdHeader: false, csrfHeader: false, credentialsInclude: false, documentViaApi: false };
  let tdmReservation = false;
  let jurisVersion: string | undefined;
  const shell = probes.find((probe) => probe.outcome === 'spa-shell');
  if (shell) {
    const shellDocument = await fetcher.fetch(shell.url);
    const classification = classifyPortalHtml(decodeHtml(shellDocument));
    tdmReservation = classification.tdmReservation;
    jurisVersion = classification.jurisVersion;
    for (const script of classification.moduleScripts) {
      const scriptUrl = new URL(script, PORTAL_ORIGIN).href;
      const entry = await fetcher.fetch(scriptUrl);
      entryScripts.push({ url: scriptUrl, sha256: entry.sha256, byteLength: entry.bytes.byteLength });
      const entryText = new TextDecoder().decode(entry.bytes);
      const sources: string[] = [entryText];
      for (const name of moduleImports(entryText).filter((candidate) => candidate.startsWith('src-'))) {
        const bundleUrl = new URL(name, scriptUrl).href;
        const bundle = await fetcher.fetch(bundleUrl);
        bundles.push({ url: bundleUrl, sha256: bundle.sha256, byteLength: bundle.bytes.byteLength });
        sources.push(new TextDecoder().decode(bundle.bytes));
      }
      for (const text of sources) {
        const evidence = internalEndpointEvidence(text);
        merged.apiPath ??= evidence.apiPath;
        merged.portalId ??= evidence.portalId;
        merged.excerpt ??= evidence.excerpt;
        merged.portalIdHeader ||= evidence.portalIdHeader;
        merged.csrfHeader ||= evidence.csrfHeader;
        merged.credentialsInclude ||= evidence.credentialsInclude;
        merged.documentViaApi ||= evidence.documentViaApi;
      }
    }
  }

  const summary = emptySummary();
  for (const probe of probes) summary[probe.outcome] += 1;
  summary.total = probes.length;
  summary.distinctBodies = new Set(probes.map((probe) => probe.sha256).filter(Boolean)).size;
  const report: AddressabilityReport = {
    schemaVersion: ADDRESSABILITY_SCHEMA,
    documents: PROBE_DOCUMENTS,
    probes,
    summary,
    spa: { entryScripts, bundles, evidence: merged },
    tdmReservation,
    ...(jurisVersion ? { jurisVersion } : {}),
    ...concludeAddressability(probes, merged),
  };

  const written: string[] = [];
  if (options.write) {
    if (await writeJsonAtomic(join(options.root, ADDRESSABILITY_PATH), report)) written.push(ADDRESSABILITY_PATH);
    const { renderStructureReport } = await import('../reports/render.ts');
    if (await writeFileAtomic(join(options.root, STRUCTURE_REPORT_PATH), renderStructureReport(report))) written.push(STRUCTURE_REPORT_PATH);
  }
  return { report, written, network: { requests: fetcher.stats.networkRequests, cacheHits: fetcher.stats.cacheHits, bytes: fetcher.stats.bytesDownloaded ?? 0 } };
}

export async function readAddressability(root: string): Promise<AddressabilityReport | undefined> {
  return readJsonFile<AddressabilityReport>(join(root, ADDRESSABILITY_PATH));
}
