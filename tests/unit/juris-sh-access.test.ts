/**
 * juris-SH-Adapter: Zugriffspolitik (robots.txt `advisory`, verweigerte interne Schnittstellen), Sitemap-
 * Enumeration mit Fixpunkt, Adressierbarkeitsprobe, Stichtags-/baseline-only-Auswertung und Readiness.
 * Ohne Netz: Abrufe laufen über austauschbare Fetch-Funktionen, Zustand nur in temporären Verzeichnissen.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createRechtNrwFetcher } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { AccessPolicyError, assertPermittedRequest, classifyPortalHtml, decodeEntities, documentUrl, evaluateRobots, internalEndpointEvidence, JURIS_SH_ACCESS_POLICY, moduleImports, parseRobots, permaUrl, visibleBodyText, type AccessPolicy } from '@landesrecht/importer-juris-sh/access/policy.ts';
import { scanTerms } from '@landesrecht/importer-juris-sh/access/terms.ts';
import { IMPLEMENTED_COMMANDS } from '@landesrecht/importer-juris-sh/cli.ts';
import { createJurisShFetcher, USER_AGENT } from '@landesrecht/importer-juris-sh/common/fetcher.ts';
import { emptyManifest } from '@landesrecht/importer-juris-sh/common/manifest.ts';
import { emptyReviewQueue } from '@landesrecht/importer-juris-sh/common/review.ts';
import { doknrFromRedirect } from '@landesrecht/importer-juris-sh/enumerate/crosscheck.ts';
import { buildEnumeration, checkEnumeration, enumerationFingerprint, type SourceRecord } from '@landesrecht/importer-juris-sh/enumerate/enumeration.ts';
import { classifyDocumentId, documentIdFromUrl, inventorySitemaps, parseSitemapLocations, SitemapFormatError } from '@landesrecht/importer-juris-sh/enumerate/sitemap.ts';
import type { LedgerEvent } from '@landesrecht/importer-juris-sh/events/ledger.ts';
import { concludeAddressability, runAddressabilityProbe, type ProbeRecord } from '@landesrecht/importer-juris-sh/probe/addressability.ts';
import { analyzeBaselineOnly, buildReconstructionQueue, classifyBaseline, evaluateReadiness, type AdapterSnapshot } from '@landesrecht/importer-juris-sh/reports/status.ts';

import { cleanupTempRoots, tempRoot } from '../helpers/juris-sh-state.ts';

afterAll(cleanupTempRoots);

const ORIGIN = 'https://www.gesetze-rechtsprechung.sh.juris.de';

/** Aufbau wie die robots.txt des Portals: benannte Bots erlaubt, alle übrigen gesperrt. */
const ROBOTS = ['User-agent: Googlebot', 'User-agent: Bingbot', 'Allow: /', '', 'User-agent: *', 'Disallow: /', '', `Sitemap: ${ORIGIN}/sitemapindex.xml`].join('\n');

/** Synthetische Startseite einer Skriptoberfläche: leerer Container, Ladehinweis per Skript, Modulskript. */
const SHELL = `<!doctype html><html lang='de'><head><meta name='juris-version' content='bssh - V0'><meta name='tdm-reservation' content='1'>
<script type="module" crossorigin src="/bssh/assets/index-TEST.js"></script></head><body><div id='container'><div id='main' aria-busy='true'>
<noscript><h1>Aktivieren Sie bitte JavaScript, um den Bürgerservice zu nutzen.</h1></noscript>
<script>document.write('<h2>Der Bürgerservice wird gestartet.</h2>');</script></div></div></body></html>`;

const CONTENT = '<html><body><h1>Landesverordnung über Testfälle</h1><p>&sect; 1 Geltungsbereich &ndash; Diese Verordnung gilt f&uuml;r Tests.</p></body></html>';

function fakeFetch(routes: Record<string, { status?: number; body: string; contentType?: string; redirect?: string }>, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response('nicht gefunden', { status: 404 });
    const response = new Response(route.body, { status: route.status ?? 200, headers: { 'content-type': route.contentType ?? 'text/html' } });
    Object.defineProperty(response, 'url', { value: route.redirect ?? url });
    return response;
  }) as typeof fetch;
}

const noSleep = async (): Promise<void> => undefined;

describe('Zugriffspolitik juris-SH (robots.txt advisory)', () => {
  it('wertet robots.txt nach Gruppen aus: eigener User-Agent gesperrt, benannter Bot erlaubt', () => {
    const robots = parseRobots(ROBOTS);
    expect(robots.groups).toHaveLength(2);
    expect(robots.sitemaps).toEqual([`${ORIGIN}/sitemapindex.xml`]);
    expect(evaluateRobots(robots, USER_AGENT, '/bssh/document/jlr-NNLSH00002D11')).toMatchObject({ verdict: 'disallowed', group: ['*'], rule: 'Disallow: /' });
    expect(evaluateRobots(robots, 'Googlebot/2.1', '/bssh/document/x').verdict).toBe('allowed');
    expect(evaluateRobots(parseRobots('User-agent: *\nDisallow: /intern/\nAllow: /intern/frei'), USER_AGENT, '/intern/frei/x').verdict).toBe('allowed');
    expect(evaluateRobots(parseRobots('User-agent: *\nDisallow:'), USER_AGENT, '/').verdict).toBe('allowed');
  });

  it('ist nur für den juris-SH-Adapter advisory und dort mit Nutzerentscheidung belegt', () => {
    expect(JURIS_SH_ACCESS_POLICY.robotsPolicy).toBe('advisory');
    expect(JURIS_SH_ACCESS_POLICY.decision.basis).toBe('Nutzerentscheidung');
    expect(JURIS_SH_ACCESS_POLICY.decision.date).toBe('2026-09-18');
    expect(JURIS_SH_ACCESS_POLICY.minDelayMs).toBeGreaterThanOrEqual(1_000);
  });

  it('verweigert interne Schnittstellen, Anmeldung, fremde Hosts und Nicht-GET vor jedem Abruf', () => {
    const permitted = (url: string, request: { method?: string; body?: string } = {}): string => {
      try {
        assertPermittedRequest(url, request, JURIS_SH_ACCESS_POLICY, USER_AGENT);
        return 'ok';
      } catch (error) {
        return (error as AccessPolicyError).code;
      }
    };
    expect(permitted(documentUrl('jlr-NNLSH00002D11', 'xsl'))).toBe('ok');
    expect(permitted(`${ORIGIN}/sitemapindex.xml`)).toBe('ok');
    expect(permitted(`${ORIGIN}/jportal/wsrest/recherche3/document`)).toBe('forbidden-endpoint');
    expect(permitted(`${ORIGIN}/api/v1/views`)).toBe('forbidden-endpoint');
    expect(permitted(`${ORIGIN}/r3?start=connectauthentication`)).toBe('forbidden-endpoint');
    expect(permitted(`${ORIGIN}/r30`)).toBe('ok');
    expect(permitted('https://portal.juris.de/bssh/document/x')).toBe('foreign-host');
    expect(permitted(`http://www.gesetze-rechtsprechung.sh.juris.de/robots.txt`)).toBe('invalid-url');
    expect(permitted(`${ORIGIN}/bssh/document/x`, { method: 'POST', body: '{}' })).toBe('method');
    const binding: AccessPolicy = { ...JURIS_SH_ACCESS_POLICY, robotsPolicy: 'binding' };
    expect(() => assertPermittedRequest(`${ORIGIN}/bssh/`, {}, binding, USER_AGENT, parseRobots(ROBOTS))).toThrow(/robots-disallowed/u);
    expect(() => assertPermittedRequest(`${ORIGIN}/bssh/`, {}, binding, USER_AGENT)).toThrow(/nicht ausgewertet/u);
  });

  it('prozentkodiert Kennungen mit Umlauten in den dokumentierten Adressformen', () => {
    expect(documentUrl('jlr-BauAufsÜVSH2022pP1')).toBe(`${ORIGIN}/bssh/document/jlr-BauAufs%C3%9CVSH2022pP1`);
    expect(documentUrl('X', 'xsl-part')).toBe(`${ORIGIN}/bssh/document/X/format/xsl/part/X`);
    expect(permaUrl('WaldG_SH', 'a')).toBe(`${ORIGIN}/perma?a=WaldG_SH`);
  });

  it('Fetcher-Wrapper: advisory lässt robots-gesperrte Seiten zu, blockt interne Schnittstellen ohne Netzabruf und prüft Weiterleitungen', async () => {
    const root = await tempRoot();
    const calls: string[] = [];
    const fetcher = createJurisShFetcher({
      root,
      sleep: noSleep,
      fetchImplementation: fakeFetch({
        [`${ORIGIN}/bssh/document/A`]: { body: SHELL },
        [`${ORIGIN}/perma?d=B`]: { body: SHELL, redirect: 'https://fremd.example/x' },
      }, calls),
    });
    const document = await fetcher.fetch(`${ORIGIN}/bssh/document/A`);
    expect(document.status).toBe(200);
    await expect(fetcher.fetch(`${ORIGIN}/jportal/wsrest/recherche3/document`)).rejects.toThrow(/forbidden-endpoint/u);
    await expect(fetcher.fetch(`${ORIGIN}/perma?d=B`)).rejects.toThrow(/Weiterleitung/u);
    expect(calls.some((url) => url.includes('/wsrest/'))).toBe(false);
    // Zweiter Abruf derselben Adresse kommt aus dem Cache.
    await fetcher.fetch(`${ORIGIN}/bssh/document/A`);
    expect(fetcher.stats.cacheHits).toBe(1);
  });

  it('ändert den gemeinsamen West-Fetcher nicht: er kennt keine robots-Politik und bleibt bei seinen Vorgaben', async () => {
    const root = await tempRoot();
    const west = createRechtNrwFetcher({ cacheDir: root, sleep: noSleep, fetchImplementation: fakeFetch({ 'https://recht.nrw.de/x': { body: 'ok' } }) });
    expect((await west.fetch('https://recht.nrw.de/x')).status).toBe(200);
  });
});

describe('Antworten der Portaloberfläche', () => {
  it('erkennt die leere Startseite der Skriptoberfläche samt TDM-Vorbehalt und Modulskript', () => {
    const shell = classifyPortalHtml(SHELL);
    expect(shell.kind).toBe('spa-shell');
    expect(shell.visibleTextLength).toBe(0);
    expect(shell.tdmReservation).toBe(true);
    expect(shell.jurisVersion).toBe('bssh - V0');
    expect(shell.moduleScripts).toEqual(['/bssh/assets/index-TEST.js']);
    const content = classifyPortalHtml(CONTENT);
    expect(content.kind).toBe('content');
    expect(visibleBodyText(CONTENT)).toContain('§ 1 Geltungsbereich – Diese Verordnung gilt für Tests.');
    expect(decodeEntities('&auml;&#246;&#xFC;&unbekannt;')).toBe('äöü&unbekannt;');
  });

  it('liest Belege der internen Schnittstelle aus einem Skriptbündel, ohne sie aufzurufen', () => {
    const bundle = 'x={VITE_apiPath:`/jportal/wsrest/recherche3/`,VITE_portalId:`bssh`};function f(e,t){return{method:`POST`,credentials:`include`,headers:new Headers({"X-CSRF-TOKEN":t,"JURIS-PORTALID":x.portalId})}};g({docId:e,format:`xsl`});import{a}from"./src-ABC.js";import{b}from"./chunk-1.js";';
    expect(internalEndpointEvidence(bundle)).toMatchObject({ apiPath: '/jportal/wsrest/recherche3/', portalId: 'bssh', portalIdHeader: true, csrfHeader: true, credentialsInclude: true, documentViaApi: true });
    expect(moduleImports(bundle)).toEqual(['src-ABC.js', 'chunk-1.js']);
  });

  it('meldet einschlägige Begriffe in Nutzungshinweisen mit Kontext', () => {
    expect(scanTerms('Eine automatisierte Abfrage ist nicht gestattet. Haftungsausschluss gilt.').map((match) => match.keyword)).toEqual(['automatisiert', 'Haftung']);
    expect(scanTerms('Nichts Einschlägiges.')).toEqual([]);
  });

  it('schließt auf „nicht öffentlich adressierbar“, wenn alle Proben die Startseite liefern, und auf „blocked“ bei Sperrsignalen', () => {
    const shell = (form: ProbeRecord['form']): ProbeRecord => ({ documentId: 'A', form, url: 'u', outcome: 'spa-shell', sha256: 'a'.repeat(64) });
    const evidence = { apiPath: '/jportal/wsrest/recherche3/', portalIdHeader: true, csrfHeader: true, credentialsInclude: true, documentViaApi: true };
    const conclusion = concludeAddressability([shell('document'), shell('xsl')], evidence);
    expect(conclusion.conclusion).toBe('content-not-publicly-addressable');
    expect(conclusion.reasoning.join(' ')).toContain('/jportal/wsrest/recherche3/');
    expect(concludeAddressability([shell('document'), { ...shell('xsl'), outcome: 'blocked' }], evidence).conclusion).toBe('blocked');
    expect(concludeAddressability([{ ...shell('document'), outcome: 'content' }], evidence).conclusion).toBe('content-addressable');
  });

  it('Probe: nur dokumentierte Formen und öffentliche Skripte, nie die interne Schnittstelle', async () => {
    const root = await tempRoot();
    const calls: string[] = [];
    const routes: Record<string, { body: string; contentType?: string }> = {
      [`${ORIGIN}/bssh/assets/index-TEST.js`]: { body: 'import{a}from"./src-ABC.js";g({docId:e,format:`xsl`})', contentType: 'application/javascript' },
      [`${ORIGIN}/bssh/assets/src-ABC.js`]: { body: 'VITE_apiPath:`/jportal/wsrest/recherche3/`,VITE_portalId:`bssh`,"X-CSRF-TOKEN":t,"JURIS-PORTALID":p,credentials:`include`', contentType: 'application/javascript' },
    };
    const fetchImplementation = fakeFetch(new Proxy(routes, { get: (target, key: string) => target[key] ?? (key.includes('/bssh/document/') ? { body: SHELL } : undefined) }), calls);
    const result = await runAddressabilityProbe({ root, write: true, offline: false, createFetcher: (options) => createJurisShFetcher({ ...options, sleep: noSleep, fetchImplementation }) });
    expect(result.report.conclusion).toBe('content-not-publicly-addressable');
    expect(result.report.summary['spa-shell']).toBe(result.report.summary.total);
    expect(result.report.spa.evidence.apiPath).toBe('/jportal/wsrest/recherche3/');
    expect(result.written).toContain('data/audits/juris-sh/discovery/content-addressability.json');
    expect(calls.filter((url) => url.includes('/wsrest/') || url.includes('/api/'))).toEqual([]);
  });
});

describe('Sitemap-Enumeration', () => {
  const sitemap = (ids: string[]): string => `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${ORIGIN}/bssh/</loc></url>\n${ids.map((id) => `<url><loc>${ORIGIN}/bssh/document/${id}</loc></url>`).join('\n')}\n</urlset>\n`;

  it('ordnet Kennungsfamilien zu und bildet Rahmendokumente mit Einheiten', () => {
    expect(classifyDocumentId('jlr-NNLSH00002D11')).toEqual({ family: 'landesrecht-frame' });
    expect(classifyDocumentId('jlr-NNLSH00002D11NN00000000016')).toEqual({ family: 'landesrecht-unit', frameId: 'jlr-NNLSH00002D11' });
    expect(classifyDocumentId('VVSH-VVSH000000003').family).toBe('vwv');
    expect(classifyDocumentId('VVSH-2032.29-0001').family).toBe('vwv-legacy');
    expect(classifyDocumentId('VB-SH-AD-GVBl2023-1-1').family).toBe('gazette');
    expect(classifyDocumentId('KRSHAEL000004').family).toBe('ortsrecht');
    expect(classifyDocumentId('NJRE001501899').family).toBe('rechtsprechung');
    expect(classifyDocumentId('jlr-FFNInhaltSH').family).toBe('ffn-register');
    expect(classifyDocumentId('jlr-VerfSH2014rahmen').family).toBe('unknown');
    expect(documentIdFromUrl(`${ORIGIN}/bssh/document/jlr-BauAufs%C3%9CVSH2022pP1`)).toBe('jlr-BauAufsÜVSH2022pP1');
    expect(documentIdFromUrl(`${ORIGIN}/bssh/`)).toBeUndefined();

    const inventory = inventorySitemaps([parseSitemapLocations(sitemap(['jlr-NNLSH0000000A', 'jlr-NNLSH0000000ANN00000000001', 'jlr-NNLSH0000000ANN00000000002', 'jlr-NNLSH0000000BNN00000000001', 'VVSH-VVSH000000001', 'KRSHAAA000001', 'VVSH-VVSH000000001']), 'urlset')]);
    expect(inventory.frames.get('jlr-NNLSH0000000A')).toBe(2);
    expect(inventory.orphanUnits).toEqual(['jlr-NNLSH0000000B']);
    expect(inventory.duplicates).toEqual(['VVSH-VVSH000000001']);
    expect(inventory.vwv).toEqual(['VVSH-VVSH000000001']);
    expect(inventory.byFamily.ortsrecht).toBe(1);
    expect(inventory.otherUrls).toEqual([`${ORIGIN}/bssh/`]);
  });

  it('weist abgeschnittene oder fremde Sitemaps zurück', () => {
    expect(() => parseSitemapLocations('<urlset><url><loc>x</loc></url>', 'urlset')).toThrow(SitemapFormatError);
    expect(() => parseSitemapLocations('<sitemapindex></sitemapindex>', 'urlset')).toThrow(SitemapFormatError);
  });

  it('Fixpunkt: erster Lauf offen, Cache-Wiederholung ändert nichts, unabhängiger zweiter Abruf bestätigt, Abweichung wird festgehalten', () => {
    const source = (retrievedAt: string, sha = 'b'.repeat(64)): SourceRecord => ({ url: `${ORIGIN}/sitemap1.xml`, finalUrl: `${ORIGIN}/sitemap1.xml`, httpStatus: 200, sha256: sha, byteLength: 10, retrievedAt });
    const index = source('2026-09-18T10:00:00.000Z', 'c'.repeat(64));
    const inventory = inventorySitemaps([parseSitemapLocations(sitemap(['jlr-NNLSH0000000B', 'jlr-NNLSH0000000A', 'jlr-NNLSH0000000ANN00000000001']), 'urlset')]);
    const first = buildEnumeration({ area: 'landesrecht', inventory, sitemapIndex: index, sitemaps: [source('2026-09-18T10:00:00.000Z')] });
    expect(first.items.map((item) => item.key)).toEqual(['jlr-NNLSH0000000A', 'jlr-NNLSH0000000B']);
    expect(first.fixpoint).toMatchObject({ stable: false, confirmations: 0, previousFingerprint: null });
    expect(checkEnumeration(first)).toEqual([]);
    expect(first.fingerprint).toBe(enumerationFingerprint(first.items));

    const replay = buildEnumeration({ area: 'landesrecht', inventory, sitemapIndex: index, sitemaps: [source('2026-09-18T10:00:00.000Z')], previous: first });
    expect(replay).toEqual(first);

    const second = buildEnumeration({ area: 'landesrecht', inventory, sitemapIndex: index, sitemaps: [source('2026-09-18T12:00:00.000Z')], previous: first });
    expect(second.fixpoint).toMatchObject({ stable: true, independentRefetch: true, confirmations: 1 });

    const changedInventory = inventorySitemaps([parseSitemapLocations(sitemap(['jlr-NNLSH0000000A', 'jlr-NNLSH0000000C']), 'urlset')]);
    const changed = buildEnumeration({ area: 'landesrecht', inventory: changedInventory, sitemapIndex: index, sitemaps: [source('2026-09-18T14:00:00.000Z')], previous: second });
    expect(changed.fixpoint.stable).toBe(false);
    expect(changed.fixpoint.confirmations).toBe(0);
    expect(changed.fixpoint.delta).toMatchObject({ added: 1, removed: 1, changed: 1, examples: { added: ['jlr-NNLSH0000000C'], removed: ['jlr-NNLSH0000000B'], changed: ['jlr-NNLSH0000000A'] } });

    const vwv = buildEnumeration({ area: 'vwv', inventory: inventorySitemaps([parseSitemapLocations(sitemap(['VVSH-VVSH000000010', 'VVSH-VVSH000000002']), 'urlset')]), sitemapIndex: index, sitemaps: [source('2026-09-18T10:00:00.000Z')] });
    expect(vwv.items).toEqual([{ key: 'VVSH-VVSH000000002', status: 'pending' }, { key: 'VVSH-VVSH000000010', status: 'pending' }]);
  });

  it('liest die DOKNR aus dem Weiterleitungsziel eines Permalinks', () => {
    expect(doknrFromRedirect(`${ORIGIN}/bssh/?query=DOKNR%3Ajlr-NNLSH00002D11&source=PermaLink`)).toBe('jlr-NNLSH00002D11');
    expect(doknrFromRedirect(`${ORIGIN}/bssh/?aiz=1&docId=jlr-NNLSH00002E60&query=JURISLINK%3A%22WaldG+SH%22`)).toBe('jlr-NNLSH00002E60');
    expect(doknrFromRedirect(`${ORIGIN}/bssh/search`)).toBeUndefined();
  });
});

describe('Stichtag, baseline-only und Readiness ohne Dokumentinhalt', () => {
  let counter = 0;
  const event = (overrides: Partial<LedgerEvent>): LedgerEvent => ({
    id: `e-${(counter += 1)}`,
    eventType: 'expire',
    eventDate: '2024-06-30',
    targetTitle: 'Landesverordnung über Testfälle',
    targetGliederungsnummer: '2000-1-1',
    targetIdentityHints: [],
    citation: 'GVOBl. S. 1',
    sourceId: 'gvobl-systematische-uebersicht',
    sourceUrl: 'https://example.invalid/register.pdf',
    sourceSha256: 'd'.repeat(64),
    sourcePage: 1,
    sourceLine: 1,
    organ: 'gvobl',
    excerpt: 'tritt außer Kraft',
    evidenceStrength: 'strong',
    confidence: 1,
    processingStatus: 'recorded',
    ...overrides,
  });

  const snapshot = (overrides: Partial<AdapterSnapshot> = {}): AdapterSnapshot => ({
    enumeration: {},
    contentSlugs: [],
    manifest: emptyManifest(),
    review: emptyReviewQueue(),
    contentFiles: 0,
    slugRegistryPresent: false,
    ledger: {
      registerAsOf: '2024-12-13',
      events: [
        event({ eventDate: '2024-06-30' }),
        event({ eventDate: '2025-06-30', targetGliederungsnummer: '2000-1-2' }),
        event({ eventDate: '2025-07-01', targetGliederungsnummer: '2000-1-2' }),
        event({ eventType: 'amend', eventDate: '2024-03-01', targetGliederungsnummer: '2000-1-3' }),
        event({ eventType: 'amend', eventDate: '2024-05-01', targetGliederungsnummer: '2000-1-3' }),
        event({ eventType: 'amend', eventDate: '2020-01-01', targetGliederungsnummer: '2000-1-4' }),
      ],
    },
    ...overrides,
  });

  it('trennt baseline-only-Kandidaten in Dubletten, durch das Register belegte und nur angekündigte Enden', () => {
    const analysis = analyzeBaselineOnly(snapshot());
    expect(analysis).toMatchObject({ candidates: 3, duplicates: 1, confirmedByRegister: 1, announcedOnly: 1, matchedAgainstInventory: 0, restored: 0 });
  });

  it('merkt Änderungen nach dem Stichtag als Rekonstruktionsfälle vor, ohne eine DOKNR zu erfinden', () => {
    const queue = buildReconstructionQueue(snapshot(), '2023-12-01');
    expect(queue.totals).toEqual({ items: 1, events: 2, byOrgan: { gvobl: 1 } });
    expect(queue.items[0]).toMatchObject({ gliederungsnummer: '2000-1-3', organ: 'gvobl', sourceIdentity: null, reason: 'post-baseline-change-unmatched' });
  });

  it('klassifiziert ohne Inhalt alles als undetermined und bleibt NOT READY mit Blocker', () => {
    const base = snapshot();
    expect(classifyBaseline(base).byArea.landesrecht).toEqual({ 'unchanged-since-baseline': 0, 'changed-after-baseline': 0, 'repealed-after-baseline': 0, 'enacted-after-baseline': 0, 'repealed-before-baseline': 0, undetermined: 0 });
    const result = evaluateReadiness(snapshot({
      addressability: {
        schemaVersion: 'juris-sh-content-addressability/1',
        documents: [],
        probes: [],
        summary: { total: 1, distinctBodies: 1, 'spa-shell': 1, content: 0, blocked: 0, challenge: 0, 'not-found': 0, error: 0, 'non-html': 0 },
        spa: { entryScripts: [], bundles: [], evidence: { portalIdHeader: true, csrfHeader: true, credentialsInclude: true, documentViaApi: true } },
        tdmReservation: true,
        conclusion: 'content-not-publicly-addressable',
        reasoning: ['1/1 Proben liefern die leere Startseite'],
      },
    }));
    expect(result.ready).toBe(false);
    expect(result.blockers.some((blocker) => blocker.startsWith('oeffentlicher-ausgabeweg'))).toBe(true);
    expect(result.checks.find((check) => check.id === 'keine-technische-sperre')?.status).toBe('pass');
    expect(result.checks.find((check) => check.id === 'bestand-konsistent')?.status).toBe('pass');
  });

  it('meldet Normverzeichnisse ohne übernommenen Manifesteintrag als Blocker', () => {
    const result = evaluateReadiness(snapshot({ contentSlugs: ['fremd-nsh'] }));
    expect(result.checks.find((check) => check.id === 'bestand-konsistent')).toMatchObject({ status: 'fail', blocker: true });
  });

  it('schaltet alle Befehle frei (Enumeration bis R2-Staging und Suchprüfung)', () => {
    for (const command of ['enumerate', 'sample', 'fetch-corpus', 'inventory', 'bulk', 'audit', 'coverage', 'readiness', 'reconstruction-queue', 'search-audit', 'r2-sync'] as const) expect(IMPLEMENTED_COMMANDS).toContain(command);
  });
});
