/**
 * Nutzungsbedingungen des Bürgerservice Schleswig-Holstein – was Impressum und Datenschutzhinweis zum
 * automatisierten Abruf sagen, und welcher maschinenlesbare Vorbehalt auf den Portalseiten steht.
 *
 * Befund, kein Abbruchgrund (Nutzerentscheidung 2026-09-18): Die Seiten werden über die dokumentierte
 * Hilfe-/CMS-Adresse (`/jportal/portal/page/fshelp.psml?cmsuri=…`, dieselben Adressen, auf die die Oberfläche
 * selbst verlinkt) abgerufen, ihr sichtbarer Text nach einschlägigen Begriffen durchsucht und mit SHA-256
 * festgehalten. Eine eigene Seite „Nutzungsbedingungen“ verlinkt die Oberfläche nicht (geprüft am
 * Skriptbündel: Kopfzeile führt nur Hilfe, Impressum, Datenschutz, Barrierefreiheit).
 */
import { PORTAL_ORIGIN, visibleBodyText } from './policy.ts';
import { RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { decodeHtml, type JurisShFetcher } from '../common/fetcher.ts';

export const TERMS_PAGES = [
  { id: 'impressum', label: 'Impressum', url: `${PORTAL_ORIGIN}/jportal/portal/page/fshelp.psml?cmsuri=/technik/de/impressum/bsshimpressum.jsp` },
  { id: 'datenschutz', label: 'Datenschutzhinweis', url: `${PORTAL_ORIGIN}/jportal/portal/page/fshelp.psml?cmsuri=/technik/de/datenschutz/bsshdatenschutz.jsp` },
] as const;

/** Begriffe, die eine Aussage zum automatisierten Abruf oder zur Weiterverwendung anzeigen würden. */
export const TERMS_KEYWORDS = ['automatisiert', 'Crawler', 'Robot', 'Bot', 'Nutzungsbedingung', 'Data-Mining', 'Data Mining', 'Text- und Data', 'Vervielfältig', 'Urheber', 'Weiterverwend', 'Weiterveröffentlich', 'Lizenz', 'Haftung', 'Cookie'] as const;

export interface TermsPageFinding {
  id: string;
  label: string;
  url: string;
  httpStatus: number;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
  /** Treffer je Begriff mit kurzem Kontext (höchstens drei je Begriff). */
  matches: Array<{ keyword: string; context: string }>;
}

export function scanTerms(text: string): TermsPageFinding['matches'] {
  const matches: TermsPageFinding['matches'] = [];
  for (const keyword of TERMS_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, keyword === 'Bot' ? 'gu' : 'giu');
    let count = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const start = Math.max(0, index - 80);
      matches.push({ keyword, context: text.slice(start, index + keyword.length + 80).trim() });
      count += 1;
      if (count >= 3) break;
    }
  }
  return matches;
}

/** Maschinenlesbare TDM-Politik nach dem TDM Reservation Protocol (W3C Community Group). */
export const TDMREP_URL = `${PORTAL_ORIGIN}/.well-known/tdmrep.json`;

export interface TermsFindings {
  pages: TermsPageFinding[];
  /** `/.well-known/tdmrep.json`: vorhanden (mit SHA-256) oder HTTP 404. */
  tdmrep: { url: string; httpStatus: number; sha256?: string };
}

export async function collectTermsFindings(fetcher: JurisShFetcher): Promise<TermsFindings> {
  const pages: TermsPageFinding[] = [];
  for (const page of TERMS_PAGES) {
    const document = await fetcher.fetch(page.url);
    const text = visibleBodyText(decodeHtml(document));
    pages.push({ id: page.id, label: page.label, url: page.url, httpStatus: document.status, sha256: document.sha256, byteLength: document.bytes.byteLength, retrievedAt: document.retrievedAt, matches: scanTerms(text) });
  }
  let tdmrep: TermsFindings['tdmrep'];
  try {
    const document = await fetcher.fetch(TDMREP_URL);
    tdmrep = { url: TDMREP_URL, httpStatus: document.status, sha256: document.sha256 };
  } catch (error) {
    if (!(error instanceof RechtNrwFetchError) || error.kind !== 'not-found') throw error;
    tdmrep = { url: TDMREP_URL, httpStatus: 404 };
  }
  return { pages, tdmrep };
}
