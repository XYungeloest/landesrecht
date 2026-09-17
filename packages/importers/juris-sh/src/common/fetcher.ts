/**
 * Fetcher des juris-SH-Adapters – ein dünner Wrapper um den erprobten Fetcher des West-Adapters
 * (`@landesrecht/importer-recht-nrw/common/fetcher.ts`).
 *
 * Der West-Fetcher ist portalneutral gebaut: Er kennt keine RECHT.NRW-Adresse und keine Portalstruktur;
 * das einzige NRW-Spezifische sind die Vorgaben „User-Agent“ und „Cacheverzeichnis“, und beide sind
 * Optionen. Dieser Wrapper setzt die Vorgaben des NSH-Adapters (eigener Cache `.cache/juris-sh`,
 * eigener User-Agent-Zusatz) und ändert am West-Paket nichts.
 *
 * Damit bleiben alle Schutzmechanismen erhalten: keine Parallelität, Mindestabstand zwischen Abrufen,
 * Timeout und begrenzte Wiederholungen, Abbruch bei Sperrantworten, Abruf-/Laufzeitbudget, lokaler Cache
 * mit Hashprüfung. Zugriffsbeschränkungen werden nicht umgangen.
 *
 * Dieser Wrapper ist verdrahtet, aber noch nicht benutzt: Enumeration und Parser entstehen erst nach der
 * Quellen-Discovery; bis dahin wird nichts abgerufen.
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
}

export function createJurisShFetcher(options: JurisShFetcherOptions = {}): JurisShFetcher {
  const { root, ...rest } = options;
  return createRechtNrwFetcher({
    ...rest,
    userAgent: options.userAgent ?? USER_AGENT,
    cacheDir: options.cacheDir ?? join(root ?? process.cwd(), CACHE_DIR),
  });
}
