/**
 * Synthetische LRGV-Quelle für Offline-Simulationen und Tests des Bulk-Runners (kein Netz, keine Inhalte in Git).
 * Aus einer Fixture-Fassungsseite entstehen beliebig viele Stammnormen mit eigener Term-ID, eigenem Titel und
 * eigener Adresse, dazu Sitemap- und Suchindexdaten für die Enumeration und eine austauschbare Fetch-Funktion,
 * die Sperrantworten, Ausfälle und Zählungen simulieren kann.
 */
import type { SearchHit } from './enumeration.ts';

export const SYNTHETIC_TERM_BASE = 900_000;

/** Minimale PDF-Anlage mit Textebene (Muster/Vordruck neben vollständigem HTML-Text). */
export const SYNTHETIC_PDF = '%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj\n4 0 obj <</Length 44>> stream\nBT /F1 12 Tf 72 720 Td (Anlage 2 Muster) Tj ET\nendstream endobj\n5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n';

/** Minimale HTM-Anlage im Legacy-Format (wie `tests/fixtures/recht-nrw/annex.htm`). */
export const SYNTHETIC_ANNEX_HTML = '<html><head><meta charset="utf-8" /></head><body lang=DE><div class=WordSection1>\n<p class=MsoNormal align=right><b><span>Anlage</span></b></p>\n<p class=MsoNormal><b><span>Gruppenform I</span></b></p>\n<table class=MsoNormalTable border=0 width="100%">\n<tr><td><p class=MsoNormal>Kinderzahl</p></td><td><p class=MsoNormal>Pauschale in Euro</p></td></tr>\n<tr><td><p class=MsoNormal>20</p></td><td><p class=MsoNormal>12.345,00</p></td></tr>\n</table>\n</div></body></html>\n';

export interface SyntheticLrgvSource {
  pages: Map<string, string>;
  urls: string[];
  sitemap: { pages: number; urls: string[] };
  search: { total: number; hits: SearchHit[] };
}

/**
 * Vorlage: `tests/fixtures/recht-nrw/version-page-native.html` (Term 515151, „Testverordnung Nordrhein-Westfalen
 * (TestVO NRW)“). `collideEvery`: jede n-te Norm trägt die Abkürzung ihrer Vorgängerin (Slugkollision).
 */
export function syntheticLrgvSource(template: string, count: number, options: { collideEvery?: number; annexHtml?: string } = {}): SyntheticLrgvSource {
  const pages = new Map<string, string>();
  const urls: string[] = [];
  const sitemapUrls: string[] = [];
  const hits: SearchHit[] = [];
  for (let index = 1; index <= count; index += 1) {
    const termId = String(SYNTHETIC_TERM_BASE + index);
    const nameIndex = options.collideEvery && index % options.collideEvery === 0 ? index - 1 : index;
    const slug = `synthetikverordnung-${index}-nordrhein-westfalen-synthvo${index}-nrw`;
    const html = template
      .split('515151').join(termId)
      .split('testverordnung-nordrhein-westfalen-testvo-nrw').join(slug)
      .split('Testverordnung Nordrhein-Westfalen').join(`Synthetikverordnung ${nameIndex} Nordrhein-Westfalen`)
      .split('TestVO NRW').join(`SynthVO${nameIndex} NRW`)
      .split('/system/files/BA/4242-1-anlage.htm').join(`/system/files/BA/synth-${termId}-anlage.htm`)
      .split('/system/files/BA/4242-2-anlage.pdf').join(`/system/files/BA/synth-${termId}-anlage-2.pdf`);
    const url = `https://recht.nrw.de/lrgv/rechtsverordnung/30032018-${slug}`;
    pages.set(url, html);
    // Jede Stammnorm erhält ihre eigenen Anlagen (die Vorlage verweist auf eine HTM- und eine PDF-Anlage).
    pages.set(`https://recht.nrw.de/system/files/BA/synth-${termId}-anlage.htm`, options.annexHtml ?? SYNTHETIC_ANNEX_HTML);
    pages.set(`https://recht.nrw.de/system/files/BA/synth-${termId}-anlage-2.pdf`, SYNTHETIC_PDF);
    urls.push(url);
    sitemapUrls.push(url, `https://recht.nrw.de/lrgv/rechtsverordnung/18052013-${slug}`);
    hits.push({ nodeId: String(500_000 + index), url, indexType: 'state_law_and_regulations', title: `Synthetikverordnung ${nameIndex} Nordrhein-Westfalen (SynthVO${nameIndex} NRW)`, documentTypeName: 'Rechtsverordnung', abbreviation: `SynthVO${nameIndex} NRW`, effectiveFrom: '2018-03-30', historically: false });
  }
  return { pages, urls, sitemap: { pages: 1, urls: sitemapUrls }, search: { total: hits.length, hits } };
}

export interface SyntheticFetchOptions {
  /** Ab dem n-ten Abruf nur noch HTTP 429 (Sperre). */
  blockFromRequest?: number;
  /** Adressen, die HTTP 500 liefern. */
  failing?: ReadonlySet<string>;
  onRequest?: (url: string) => void;
}

export function syntheticFetch(pages: ReadonlyMap<string, string>, options: SyntheticFetchOptions = {}): typeof fetch & { readonly requests: string[] } {
  const requests: string[] = [];
  const implementation = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requests.push(url);
    options.onRequest?.(url);
    if (options.blockFromRequest !== undefined && requests.length >= options.blockFromRequest) return new Response('gesperrt', { status: 429, headers: { 'retry-after': '1' } });
    if (options.failing?.has(url)) return new Response('Fehler', { status: 500 });
    const html = pages.get(url);
    if (html === undefined) return new Response('nicht gefunden', { status: 404 });
    return new Response(html, { status: 200, headers: { 'content-type': url.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=UTF-8' } });
  }) as typeof fetch & { requests: string[] };
  Object.defineProperty(implementation, 'requests', { value: requests });
  return implementation;
}
