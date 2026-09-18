/**
 * Abgleich der Sitemap mit einer zweiten, unabhängigen Quelle.
 *
 * Eine vollständige zweite Liste gibt es öffentlich nicht: Die Register des Fundstellennachweises
 * (`jlr-FFN…SH`) stehen zwar in der Sitemap, ihr Inhalt wird aber wie jeder Dokumentinhalt nur über die
 * interne Schnittstelle der Oberfläche geladen (siehe `probe/addressability.ts`). Geprüft wird deshalb eine
 * **Stichprobe** gegen eine Quelle, die unabhängig von der Sitemap entstanden ist:
 *
 *   Discovery-Stichprobe  `data/audits/schleswig-holstein/discovery/juris-samples.json` – 29 Kennungen aus
 *                         öffentlichen Suchmaschinen-Indexdaten (erhoben 2026-09-17, ohne Portalabruf).
 *   Auflösung             sprechende Kennungen über den dokumentierten Permalink `/perma?d=<Kennung>`
 *                         (bzw. `/perma?a=<Abkürzung>`); das Portal leitet serverseitig auf `DOKNR:<ID>` bzw.
 *                         `docId=<ID>` weiter. Die Weiterleitung selbst ist der Beleg; ihr Ziel (die leere
 *                         Oberflächenseite) wird nicht ausgewertet.
 *
 * Ergebnis je Stichprobe: aufgelöste DOKNR, Familie, Rahmendokument, „in der Sitemap?“.
 */
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { permaUrl } from '../access/policy.ts';
import { EVALUATION_DATE } from '../events/ledger.ts';
import type { JurisShFetcher } from '../common/fetcher.ts';
import { classifyDocumentId, type DocumentFamily, type SitemapInventory } from './sitemap.ts';

export const DISCOVERY_SAMPLES_PATH = 'data/audits/schleswig-holstein/discovery/juris-samples.json';

export interface CrosscheckEntry {
  sampleId: string;
  title?: string;
  /** Normtyp und Geltungsende laut Suchindex (Discovery) – unabhängige Angabe, nicht aus dem Portal gelesen. */
  indexNormType?: string;
  indexValidTo?: string;
  /** Der Permalink hat die Kennung nur unverändert als DOKNR weitergereicht (keine Zuordnung auf eine andere Kennung). */
  echo?: boolean;
  /** `direct`: Kennung ist schon eine DOKNR; `perma-d`/`perma-a`: über den Permalink aufgelöst. */
  method: 'direct' | 'perma-d' | 'perma-a';
  resolvedId?: string;
  family?: DocumentFamily;
  /** DOKNR, deren Vorkommen in der Sitemap geprüft wird (Rahmendokument einer Einheit, sonst die Kennung selbst). */
  checkedId?: string;
  inSitemap?: boolean;
  /** Adresse der Auflösung und ihr Weiterleitungsziel. */
  url?: string;
  finalUrl?: string;
  problem?: string;
}

export interface CrosscheckResult {
  source: string;
  /** Stichproben mit Geltungsende laut Suchindex vor dem Auswertungsstichtag des Ereignisregisters, je Bereich: wie viele davon in der Sitemap? */
  expired: { landesrecht: { samples: number; inSitemap: number }; vwv: { samples: number; inSitemap: number } };
  samples: number;
  resolved: number;
  inSitemap: number;
  notInSitemap: number;
  unresolved: number;
  /** Stichproben außerhalb des Bestands (Ortsrecht, Rechtsprechung) – geprüft, aber nicht Teil des Normbestands. */
  outOfScope: number;
  entries: CrosscheckEntry[];
}

interface SampleFile {
  samples: Array<{ id: string; title?: string; normType?: string; dates?: { gueltigBis?: string } }>;
}

/** DOKNR aus dem Weiterleitungsziel eines Permalinks (`query=DOKNR:<ID>` oder `docId=<ID>`). */
export function doknrFromRedirect(finalUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return undefined;
  }
  const query = parsed.searchParams.get('query') ?? '';
  const doknr = /^DOKNR:(.+)$/u.exec(query)?.[1];
  return doknr ?? parsed.searchParams.get('docId') ?? undefined;
}

/** Familien, deren Kennungen selbst DOKNR der Sitemap-Form sind; alles andere wird über den Permalink aufgelöst. */
const DIRECT_FAMILIES: readonly DocumentFamily[] = ['landesrecht-frame', 'landesrecht-unit', 'ffn-register', 'vwv', 'gazette', 'ortsrecht', 'rechtsprechung'];

function resolutionMethod(id: string): CrosscheckEntry['method'] {
  if (DIRECT_FAMILIES.includes(classifyDocumentId(id).family)) return 'direct';
  return /^(jlr-|VVSH-)/u.test(id) ? 'perma-d' : 'perma-a';
}

export async function crosscheckSitemap(options: { root: string; fetcher: JurisShFetcher; inventory: SitemapInventory; log?: (line: string) => void; today?: string }): Promise<CrosscheckResult> {
  const file = await readJsonFile<SampleFile>(join(options.root, DISCOVERY_SAMPLES_PATH));
  if (!file || !Array.isArray(file.samples)) throw new Error(`${DISCOVERY_SAMPLES_PATH} fehlt oder ist unlesbar – ohne zweite Quelle kein Abgleich`);
  const known = new Set(options.inventory.documentIds);
  const entries: CrosscheckEntry[] = [];
  for (const sample of file.samples) {
    const method = resolutionMethod(sample.id);
    const entry: CrosscheckEntry = { sampleId: sample.id, ...(sample.title ? { title: sample.title } : {}), ...(sample.normType ? { indexNormType: sample.normType } : {}), ...(sample.dates?.gueltigBis ? { indexValidTo: sample.dates.gueltigBis } : {}), method };
    let resolved: string | undefined = method === 'direct' ? sample.id : undefined;
    if (method !== 'direct') {
      const url = permaUrl(sample.id, method === 'perma-d' ? 'd' : 'a');
      entry.url = url;
      try {
        const response = await options.fetcher.fetch(url);
        entry.finalUrl = response.finalUrl;
        resolved = doknrFromRedirect(response.finalUrl);
        if (!resolved) entry.problem = 'Permalink leitet nicht auf eine DOKNR weiter';
        else if (resolved === sample.id) entry.echo = true;
      } catch (error) {
        entry.problem = (error as Error).message;
      }
    }
    if (resolved) {
      const classified = classifyDocumentId(resolved);
      entry.resolvedId = resolved;
      entry.family = classified.family;
      entry.checkedId = classified.frameId ?? resolved;
      entry.inSitemap = known.has(resolved) && (classified.frameId === undefined || known.has(classified.frameId));
    }
    options.log?.(`${sample.id} → ${entry.resolvedId ?? '(nicht aufgelöst)'}${entry.inSitemap === undefined ? '' : entry.inSitemap ? ' · in der Sitemap' : ' · NICHT in der Sitemap'}`);
    entries.push(entry);
  }
  const outOfScope = entries.filter((entry) => entry.family === 'ortsrecht' || entry.family === 'rechtsprechung').length;
  const expiredIn = (families: readonly DocumentFamily[]): { samples: number; inSitemap: number } => {
    const matching = entries.filter((entry) => entry.family && families.includes(entry.family) && entry.indexValidTo !== undefined && entry.indexValidTo < (options.today ?? EVALUATION_DATE));
    return { samples: matching.length, inSitemap: matching.filter((entry) => entry.inSitemap).length };
  };
  return {
    source: DISCOVERY_SAMPLES_PATH,
    expired: { landesrecht: expiredIn(['landesrecht-frame', 'landesrecht-unit']), vwv: expiredIn(['vwv', 'vwv-legacy']) },
    samples: entries.length,
    resolved: entries.filter((entry) => entry.resolvedId).length,
    inSitemap: entries.filter((entry) => entry.inSitemap === true).length,
    notInSitemap: entries.filter((entry) => entry.inSitemap === false).length,
    unresolved: entries.filter((entry) => !entry.resolvedId).length,
    outOfScope,
    entries,
  };
}
