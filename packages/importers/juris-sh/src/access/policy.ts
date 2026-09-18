/**
 * Zugriffspolitik des juris-SH-Adapters (Bürgerservice Schleswig-Holstein, `www.gesetze-rechtsprechung.sh.juris.de`).
 *
 * **robots.txt ist für genau diesen Adapter ein dokumentierter Hinweis (`robotsPolicy: 'advisory'`), kein
 * Readiness-Blocker** – Nutzerentscheidung vom 2026-09-18, festgehalten in
 * `docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`. Der Befund (`User-agent: * / Disallow: /`) wird bei jeder
 * Enumeration neu abgerufen, bewertet und mit SHA-256 belegt; er sperrt aber keinen Abruf. Andere Adapter
 * (West, BayWü) sind davon nicht berührt: Die Politik lebt hier, nicht im gemeinsamen Fetcher.
 *
 * Was die Politik **nicht** freigibt – und was der Fetcher-Wrapper deshalb technisch verweigert, bevor ein
 * Netzabruf entsteht:
 *
 *   - interne Schnittstellen der Portaloberfläche (`/jportal/wsrest/…`, `/api/…`) – nicht dokumentiert, per POST
 *     mit Sitzungscookie, `X-CSRF-TOKEN` und `JURIS-PORTALID` angesprochen, also Sitzungs-/Zugriffskontrolle;
 *   - Anmeldung und Identität (`/r3`, fremde Hosts der Anmeldestrecke);
 *   - jede andere Methode als GET und jeder Anfragekörper;
 *   - jeder andere Host (keine Ersatzquellen, keine Suchmaschinen-Caches, kein `portal.juris.de`).
 *
 * Die dokumentierten öffentlichen Adressformen (`docs/SCHLESWIG_HOLSTEIN_SOURCE_DISCOVERY.md` Abschnitt 2.4)
 * stehen in `DOCUMENTED_FORMS`; nur sie bildet der Adapter.
 */

export const PORTAL_HOST = 'www.gesetze-rechtsprechung.sh.juris.de';
export const PORTAL_ORIGIN = `https://${PORTAL_HOST}` as const;
export const ACCESS_CONSTRAINT_DOC = 'docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md';

export const ROBOTS_POLICIES = ['binding', 'advisory'] as const;
/** `binding`: robots.txt sperrt; `advisory`: robots.txt wird belegt und berichtet, sperrt aber nicht. */
export type RobotsPolicy = (typeof ROBOTS_POLICIES)[number];

export interface ForbiddenPath {
  /** Pfadpräfix; endet er nicht auf `/`, gilt er als ganzes Segment (`/r3` trifft `/r3` und `/r3/…`, nicht `/r30`). */
  prefix: string;
  reason: string;
}

export interface AccessPolicy {
  host: string;
  robotsPolicy: RobotsPolicy;
  decision: { date: string; basis: string; statement: string; document: string };
  forbiddenPaths: readonly ForbiddenPath[];
  /** Mindestabstand zwischen zwei Netzabrufen (keine Parallelität; der Fetcher serialisiert). */
  minDelayMs: number;
}

export const JURIS_SH_ACCESS_POLICY: AccessPolicy = {
  host: PORTAL_HOST,
  robotsPolicy: 'advisory',
  decision: {
    date: '2026-09-18',
    basis: 'Nutzerentscheidung',
    statement:
      'robots.txt ist für den juris-SH-Adapter ein dokumentierter Hinweis, kein Readiness-Blocker. Öffentlich ohne Authentifizierung erreichbare Seiten des Portals dürfen schonend automatisiert abgerufen werden (ehrlicher User-Agent, etwa 1 Anfrage/s, keine Parallelität, Cache, Backoff). Login, Sitzungs-/Zugriffskontrolle, CAPTCHA, interne Schnittstellen und Sperren werden nicht umgangen.',
    document: ACCESS_CONSTRAINT_DOC,
  },
  forbiddenPaths: [
    { prefix: '/jportal/wsrest/', reason: 'interne REST-Schnittstelle der Portaloberfläche (POST mit Sitzungscookie, X-CSRF-TOKEN und JURIS-PORTALID; nicht dokumentiert)' },
    { prefix: '/api/', reason: 'interne Schnittstelle der Portaloberfläche (Vorschläge, Ansichten)' },
    { prefix: '/r3', reason: 'Anmelde- und Authentifizierungsstrecke' },
  ],
  minDelayMs: 1_000,
};

/** Dokumentierte öffentliche Adressformen (Discovery-Dossier Abschnitt 2.4); IDs werden UTF-8-prozentkodiert. */
export const DOCUMENTED_FORMS = ['document', 'document-part', 'xsl', 'xsl-part'] as const;
export type DocumentedForm = (typeof DOCUMENTED_FORMS)[number];

export function documentUrl(documentId: string, form: DocumentedForm = 'document'): string {
  const base = `${PORTAL_ORIGIN}/bssh/document/${encodeURIComponent(documentId)}`;
  switch (form) {
    case 'document': return base;
    case 'document-part': return `${base}/part/X`;
    case 'xsl': return `${base}/format/xsl`;
    case 'xsl-part': return `${base}/format/xsl/part/X`;
  }
}

/** Dokumentbezogener Permalink (`/perma?d=<ID>`) bzw. gleitender Permalink über die juris-Abkürzung (`/perma?a=<Abk>`). */
export function permaUrl(value: string, kind: 'd' | 'a' = 'd'): string {
  return `${PORTAL_ORIGIN}/perma?${kind}=${encodeURIComponent(value)}`;
}

export const ROBOTS_URL = `${PORTAL_ORIGIN}/robots.txt`;
export const SITEMAP_INDEX_URL = `${PORTAL_ORIGIN}/sitemapindex.xml`;

/* ------------------------------------------------------------------------------------------------ */
/* robots.txt                                                                                        */

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsFile {
  groups: RobotsGroup[];
  sitemaps: string[];
}

/** Liest robots.txt nach RFC 9309: aufeinanderfolgende `User-agent`-Zeilen bilden eine Gruppe. */
export function parseRobots(text: string): RobotsFile {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if ((field === 'allow' || field === 'disallow') && current) current.rules.push({ type: field, path: value });
  }
  return { groups, sitemaps };
}

/** Produkt-Token eines User-Agents (`landesrecht-portal-importer/0.1 (…)` → `landesrecht-portal-importer`). */
export function productToken(userAgent: string): string {
  return (userAgent.trim().split(/[\s/]/u)[0] ?? '').toLowerCase();
}

export interface RobotsVerdict {
  verdict: 'allowed' | 'disallowed';
  /** Agenten der maßgeblichen Gruppe (`*`, wenn keine eigene Gruppe passt). */
  group: string[];
  /** Die entscheidende Regel im Wortlaut, falls eine greift. */
  rule?: string;
}

function ruleMatches(rulePath: string, path: string): boolean {
  if (rulePath === '') return false;
  const anchored = rulePath.endsWith('$');
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath).split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`, 'u').test(path);
}

/** Bewertet einen Pfad (mit Query) für einen User-Agent: längste passende Regel, bei Gleichstand gewinnt `Allow`. */
export function evaluateRobots(robots: RobotsFile, userAgent: string, pathWithQuery: string): RobotsVerdict {
  const token = productToken(userAgent);
  const own = robots.groups.filter((group) => group.agents.some((agent) => agent.toLowerCase() === token));
  const selected = own.length > 0 ? own : robots.groups.filter((group) => group.agents.includes('*'));
  const agents = [...new Set(selected.flatMap((group) => group.agents))];
  let best: RobotsRule | undefined;
  for (const rule of selected.flatMap((group) => group.rules)) {
    if (!ruleMatches(rule.path, pathWithQuery)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.type === 'allow')) best = rule;
  }
  if (!best || best.type === 'allow') return { verdict: 'allowed', group: agents, ...(best ? { rule: `Allow: ${best.path}` } : {}) };
  return { verdict: 'disallowed', group: agents, rule: `Disallow: ${best.path}` };
}

/* ------------------------------------------------------------------------------------------------ */
/* Prüfung jeder Anfrage                                                                            */

export type AccessPolicyErrorCode = 'invalid-url' | 'foreign-host' | 'forbidden-endpoint' | 'method' | 'robots-disallowed';

/** Die Anfrage verstößt gegen die Zugriffspolitik – ein Programmierfehler oder ein Umgehungsversuch, nie ein Normfehler. */
export class AccessPolicyError extends Error {
  readonly code: AccessPolicyErrorCode;
  readonly url: string;

  constructor(code: AccessPolicyErrorCode, url: string, message: string) {
    super(`[${code}] ${url}: ${message}`);
    this.name = 'AccessPolicyError';
    this.code = code;
    this.url = url;
  }
}

function matchesForbidden(pathname: string, entry: ForbiddenPath): boolean {
  if (entry.prefix.endsWith('/')) return pathname.startsWith(entry.prefix);
  return pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
}

export interface RequestShape {
  method?: string;
  body?: string;
}

/**
 * Prüft eine Anfrage gegen die Politik, bevor der Fetcher sie stellt. `robots` wird nur bei
 * `robotsPolicy: 'binding'` herangezogen; bei `advisory` bleibt der Befund Bericht, keine Sperre.
 */
export function assertPermittedRequest(url: string, request: RequestShape, policy: AccessPolicy, userAgent: string, robots?: RobotsFile): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AccessPolicyError('invalid-url', url, 'keine gültige URL');
  }
  if (parsed.protocol !== 'https:') throw new AccessPolicyError('invalid-url', url, 'nur https wird abgerufen');
  if (parsed.hostname !== policy.host) throw new AccessPolicyError('foreign-host', url, `der Adapter ruft nur ${policy.host} ab (keine Ersatzquellen, keine Caches Dritter)`);
  if ((request.method ?? 'GET') !== 'GET' || request.body !== undefined) throw new AccessPolicyError('method', url, 'nur GET ohne Anfragekörper – dokumentierte Adressformen sind Seitenaufrufe, keine Schnittstellenaufrufe');
  const forbidden = policy.forbiddenPaths.find((entry) => matchesForbidden(parsed.pathname, entry));
  if (forbidden) throw new AccessPolicyError('forbidden-endpoint', url, `${forbidden.prefix} wird nie abgerufen: ${forbidden.reason}`);
  if (policy.robotsPolicy === 'binding') {
    if (!robots) throw new AccessPolicyError('robots-disallowed', url, 'robots.txt ist verbindlich, aber nicht ausgewertet – kein Abruf ohne Befund');
    const verdict = evaluateRobots(robots, userAgent, `${parsed.pathname}${parsed.search}`);
    if (verdict.verdict === 'disallowed') throw new AccessPolicyError('robots-disallowed', url, `robots.txt (${verdict.group.join(', ')}): ${verdict.rule ?? ''}`);
  }
  return parsed;
}

/* ------------------------------------------------------------------------------------------------ */
/* Antwortklassifikation                                                                            */

export interface PortalHtmlClassification {
  /** `spa-shell`: Startseite der Portaloberfläche ohne Dokumentinhalt; `content`: sichtbarer Text vorhanden. */
  kind: 'spa-shell' | 'content';
  /** Zeichen sichtbaren Texts im `<body>` (ohne Skripte, Stile, `<noscript>`). */
  visibleTextLength: number;
  /** Erkennungsmerkmale, die zur Einstufung geführt haben. */
  markers: string[];
  /** `<meta name="tdm-reservation" content="1">` – maschinenlesbarer Vorbehalt für Text- und Data-Mining. */
  tdmReservation: boolean;
  /** `<meta name="juris-version">`, falls vorhanden. */
  jurisVersion?: string;
  /** Adressen der Modulskripte (`<script type="module" src>`), relativ wie im Dokument. */
  moduleScripts: string[];
}

function metaContent(html: string, name: string): string | undefined {
  const pattern = new RegExp(`<meta\\s+name=['"]${name}['"]\\s+content=['"]([^'"]*)['"]`, 'iu');
  return pattern.exec(html)?.[1];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', sect: '§', ndash: '–', mdash: '—', bdquo: '„', ldquo: '“', rdquo: '”', euro: '€' };

/** Dekodiert HTML-Entitäten (benannte der obigen Liste, dezimal, hexadezimal); Unbekanntes bleibt stehen. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return NAMED_ENTITIES[name] ?? match;
  });
}

/** Sichtbarer Text des `<body>`: ohne Skripte, Stile, `<noscript>` und Markup, Entitäten dekodiert, Leerraum zusammengefasst. */
export function visibleBodyText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/iu.exec(html)?.[1] ?? html;
  return decodeEntities(body
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

export function classifyPortalHtml(html: string): PortalHtmlClassification {
  const markers: string[] = [];
  if (/<div\s+id=['"]main['"]\s+aria-busy=['"]true['"]/iu.test(html)) markers.push('leerer Anwendungscontainer #main (aria-busy)');
  if (html.includes('Der Bürgerservice wird gestartet')) markers.push('Ladehinweis „Der Bürgerservice wird gestartet“ (per Skript geschrieben)');
  if (/Aktivieren Sie bitte JavaScript/iu.test(html)) markers.push('noscript-Hinweis: JavaScript erforderlich');
  const moduleScripts = [...html.matchAll(/<script\s+type=["']module["'][^>]*\bsrc=["']([^"']+)["']/giu)].map((match) => match[1]!);
  if (moduleScripts.length > 0) markers.push(`${moduleScripts.length} Modulskript(e) der Oberfläche`);
  const text = visibleBodyText(html);
  const shell = text.length === 0 && markers.length > 0;
  const jurisVersion = metaContent(html, 'juris-version');
  return {
    kind: shell ? 'spa-shell' : 'content',
    visibleTextLength: text.length,
    markers,
    tdmReservation: metaContent(html, 'tdm-reservation') === '1',
    ...(jurisVersion ? { jurisVersion } : {}),
    moduleScripts,
  };
}

export interface InternalEndpointEvidence {
  /** Basisadresse der Inhaltsschnittstelle laut Build-Konfiguration der Oberfläche (`VITE_apiPath`). */
  apiPath?: string;
  portalId?: string;
  /** Die Oberfläche schickt `JURIS-PORTALID` als Kopfzeile. */
  portalIdHeader: boolean;
  /** Die Oberfläche schickt ein `X-CSRF-TOKEN` (Sitzungsbindung). */
  csrfHeader: boolean;
  /** Anfragen mit `credentials: include` (Sitzungscookie). */
  credentialsInclude: boolean;
  /** Dokumentinhalt wird per `format: 'xsl'` über die Schnittstelle geladen. */
  documentViaApi: boolean;
  /** Kurzer Wortlautauszug als Beleg. */
  excerpt?: string;
}

/** Belege für die interne Inhaltsschnittstelle aus einem Skriptbündel der Oberfläche. Liest nur, ruft nichts ab. */
export function internalEndpointEvidence(script: string): InternalEndpointEvidence {
  const apiPath = /VITE_apiPath:\s*[`'"]([^`'"]+)[`'"]/u.exec(script)?.[1];
  const portalId = /VITE_portalId:\s*[`'"]([^`'"]+)[`'"]/u.exec(script)?.[1];
  const excerptMatch = /VITE_apiPath:[^,}]{0,80}/u.exec(script)?.[0];
  return {
    ...(apiPath ? { apiPath } : {}),
    ...(portalId ? { portalId } : {}),
    portalIdHeader: /["'`]JURIS-PORTALID["'`]\s*:/u.test(script),
    csrfHeader: /["'`]X-CSRF-TOKEN["'`]\s*:/u.test(script),
    credentialsInclude: /credentials:\s*[`'"]include[`'"]/u.test(script),
    documentViaApi: /docId:[\w$]+,format:[`'"]xsl[`'"]/u.test(script),
    ...(excerptMatch ? { excerpt: excerptMatch } : {}),
  };
}

/** Relative Modulimporte eines Bündels (`from"./src-XYZ.js"`), in Reihenfolge des ersten Auftretens. */
export function moduleImports(script: string): string[] {
  return [...new Set([...script.matchAll(/from\s*["']\.\/([\w.-]+\.js)["']/gu)].map((match) => match[1]!))];
}
