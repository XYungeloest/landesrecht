/**
 * Fetcher des juris-SH-Adapters – ein dünner Wrapper um den erprobten Fetcher des West-Adapters
 * (`@landesrecht/importer-recht-nrw/common/fetcher.ts`).
 *
 * Der West-Fetcher ist portalneutral gebaut und bleibt unverändert: Dieser Wrapper setzt nur Optionen
 * (eigener Cache `.cache/juris-sh`, ehrlicher User-Agent, Mindestabstand 1 s) und stellt **vor** jeden Abruf die
 * Zugriffspolitik des Adapters (`access/policy.ts`):
 *
 *   - nur der Host des Bürgerservice Schleswig-Holstein, nur GET ohne Anfragekörper;
 *   - interne Schnittstellen (`/jportal/wsrest/…`, `/api/…`) und die Anmeldestrecke werden nie abgerufen;
 *   - robots.txt ist für diesen Adapter `advisory` (Nutzerentscheidung 2026-09-18): Der Befund wird bei der
 *     Enumeration belegt und berichtet, sperrt aber nicht. Mit einer `binding`-Politik prüfte der Wrapper jede
 *     Anfrage gegen die übergebene robots.txt – so bleibt die Voreinstellung aller anderen Adapter unberührt.
 *
 * Alle Schutzmechanismen des West-Fetchers bleiben erhalten: keine Parallelität, Mindestabstand, Timeout,
 * begrenzte Wiederholungen mit Backoff, `Retry-After`, Abbruch nach aufeinanderfolgenden Sperrantworten
 * (403/429), Abruf-/Laufzeitbudget, lokaler Cache mit Hashprüfung und Negativ-Cache für 404.
 * Zugriffsbeschränkungen werden nicht umgangen.
 */
import { join } from 'node:path';

import {
  createRechtNrwFetcher,
  DEFAULT_MAX_CONSECUTIVE_BLOCKS,
  DEFAULT_MAX_RETRY_AFTER_MS,
  DEFAULT_MIN_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  decodeHtml,
  RUN_STOPPING_FETCH_ERRORS,
  sha256Hex,
  type FetchedDocument,
  type FetcherOptions,
  type FetcherStats,
  type FetchRequest,
  type RechtNrwFetcher,
} from '@landesrecht/importer-recht-nrw/common/fetcher.ts';

import { AccessPolicyError, assertPermittedRequest, JURIS_SH_ACCESS_POLICY, type AccessPolicy, type RobotsFile } from '../access/policy.ts';
import { CACHE_DIR, SOURCE_STATE } from './constants.ts';

export { decodeHtml, sha256Hex, DEFAULT_MIN_DELAY_MS, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_CONSECUTIVE_BLOCKS, DEFAULT_MAX_RETRY_AFTER_MS, RUN_STOPPING_FETCH_ERRORS };
export type { FetchedDocument, FetcherOptions, FetcherStats, FetchRequest };

/** Kennzeichnet den Abruf als Importer dieses Projekts, nennt Zweck und Kontaktweg (schonender Einzelabruf). */
export const USER_AGENT = `landesrecht-portal-importer/0.1 (+https://gitlab.com/politiksim/landesrecht; Politiksimulation, Quellland ${SOURCE_STATE}, schonender Einzelabruf)`;

/** Gleiche Schnittstelle wie im West-Adapter; nur der Name ist adapterneutral. */
export type JurisShFetcher = RechtNrwFetcher;

export interface JurisShFetcherOptions extends FetcherOptions {
  /** Repository-Root, wenn `cacheDir` nicht ausdrücklich gesetzt ist (Standard: Arbeitsverzeichnis). */
  root?: string;
  /** Zugriffspolitik; Standard ist die Politik des Adapters (`robotsPolicy: 'advisory'`). */
  policy?: AccessPolicy;
  /** Ausgewertete robots.txt – nur bei `robotsPolicy: 'binding'` nötig und dann Pflicht. */
  robots?: RobotsFile;
}

export function createJurisShFetcher(options: JurisShFetcherOptions = {}): JurisShFetcher {
  const { root, policy = JURIS_SH_ACCESS_POLICY, robots, ...rest } = options;
  const userAgent = rest.userAgent ?? USER_AGENT;
  const inner = createRechtNrwFetcher({
    ...rest,
    userAgent,
    minDelayMs: rest.minDelayMs ?? policy.minDelayMs,
    cacheDir: rest.cacheDir ?? join(root ?? process.cwd(), CACHE_DIR),
  });
  return {
    stats: inner.stats,
    async fetch(url, request = {}) {
      assertPermittedRequest(url, request, policy, userAgent, robots);
      const document = await inner.fetch(url, request);
      // Eine Weiterleitung darf die Politik nicht aushebeln: Ziel auf fremdem Host oder interner Schnittstelle
      // ist ein Befund, kein Inhalt (der Abruf ist schon geschehen, sein Ergebnis wird nicht verwendet).
      if (document.finalUrl !== url) {
        try {
          assertPermittedRequest(document.finalUrl, {}, policy, userAgent, robots);
        } catch (error) {
          if (error instanceof AccessPolicyError) throw new AccessPolicyError(error.code, url, `Weiterleitung nach ${document.finalUrl} verletzt die Zugriffspolitik: ${error.message}`);
          throw error;
        }
      }
      return document;
    },
  };
}
