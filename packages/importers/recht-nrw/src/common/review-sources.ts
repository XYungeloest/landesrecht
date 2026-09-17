/**
 * Netzfreier Zugriff auf archivierte Quellen für Review-Auswertungen: versionierte Beispielkorpus-Dateien
 * (`sources/recht-nrw/`) oder der Abruf-Cache (`.cache/recht-nrw/`) über den vorhandenen Fetcher im
 * Offline-Modus. Es wird nie ein Netzabruf ausgelöst; fehlende Quellen werden gezählt, nicht nachgeladen.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createRechtNrwFetcher, RechtNrwFetchError, sha256Hex, type FetchedDocument, type RechtNrwFetcher } from './fetcher.ts';

export interface OfflineSourceStats {
  local: number;
  cache: number;
  missing: number;
}

export interface OfflineSourceReader {
  /** Liest eine Quelle aus der versionierten Kopie oder dem Cache; `undefined`, wenn beides fehlt. */
  read(url: string, localSource?: string): Promise<FetchedDocument | undefined>;
  stats: OfflineSourceStats;
}

export function createOfflineSourceReader(root: string, options: { cacheDir?: string; fetcher?: RechtNrwFetcher } = {}): OfflineSourceReader {
  const fetcher = options.fetcher ?? createRechtNrwFetcher({ cacheDir: options.cacheDir ?? join(root, '.cache', 'recht-nrw'), offline: true });
  const stats: OfflineSourceStats = { local: 0, cache: 0, missing: 0 };
  return {
    stats,
    async read(url, localSource) {
      if (localSource) {
        try {
          const bytes = new Uint8Array(await readFile(join(root, localSource)));
          stats.local += 1;
          return { url, finalUrl: url, status: 200, contentType: /\.pdf$/iu.test(localSource) ? 'application/pdf' : 'text/html; charset=UTF-8', retrievedAt: '', sha256: sha256Hex(bytes), bytes, fromCache: true };
        } catch {
          // versionierte Kopie fehlt – Cache versuchen
        }
      }
      try {
        const document = await fetcher.fetch(url);
        stats.cache += 1;
        return document;
      } catch (error) {
        if (error instanceof RechtNrwFetchError) {
          stats.missing += 1;
          return undefined;
        }
        throw error;
      }
    },
  };
}

/**
 * Textinhalt einer RECHT.NRW-Seite ohne Parser: Normtextcontainer (`legaldoc-article`, Ministerialblatt
 * `field--field_normtext`) als Fließtext, Blockgrenzen als Satzgrenzen (`;`), damit Aufhebungsformeln
 * über Absätze hinweg nicht zusammenlaufen. Nur für Suchen (Nachfolgebelege), nie für die Übernahme.
 */
export function plainTextOf(html: string): string {
  let start = html.indexOf('legaldoc-article');
  if (start < 0) start = html.indexOf('field--field_normtext');
  if (start < 0) return '';
  const region = html.slice(html.indexOf('>', start) + 1);
  return region
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<\/(?:p|div|h\d|li|tr|td|th|table|section|article|blockquote)>|<br\s*\/?>/giu, ' ; ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;|&#160;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, '’')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/\s*;(?:\s*;)+\s*/gu, ' ; ')
    .replace(/\s+/gu, ' ')
    .trim();
}
