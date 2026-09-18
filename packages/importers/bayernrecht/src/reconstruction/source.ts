/**
 * Offline-Zugriff auf die beiden Quellen einer Rückrechnung: das heutige Exportpaket der Norm und die
 * Detailseite der Verkündung. **Kein Netz.** Fehlt ein Eintrag im Cache, ist das ein Befund
 * (`missing-base`), kein Anlass für einen Abruf.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { citationDates } from '../baseline/citation-dates.ts';
import { CACHE_DIR } from '../common/constants.ts';
import { parseBayernRechtPackage, type BayernRechtDocument } from '../parse/index.ts';
import type { NormHead } from '../parse/norm.ts';
import type { VvHead } from '../parse/vv.ts';
import type { NormIdentity } from './structure.ts';

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

/** Cache-Schlüssel wie im gemeinsamen Fetcher: die ersten 40 Hexzeichen der SHA-256 der Adresse. */
export const cacheKey = (url: string): string => sha256(url).slice(0, 40);

export const packageUrl = (documentId: string): string => `https://www.gesetze-bayern.de/Content/Zip/${documentId}`;

export interface CachedSource {
  url: string;
  bytes: Uint8Array;
  sha256: string;
  retrievedAt?: string;
}

/** Liest einen Cache-Eintrag; `undefined`, wenn er fehlt. */
export async function readCached(root: string, url: string): Promise<CachedSource | undefined> {
  const base = join(root, CACHE_DIR, cacheKey(url));
  let bytes: Buffer;
  try {
    bytes = await readFile(`${base}.bin`);
  } catch {
    return undefined;
  }
  let retrievedAt: string | undefined;
  try {
    const meta = JSON.parse(await readFile(`${base}.json`, 'utf8')) as { retrievedAt?: string };
    retrievedAt = meta.retrievedAt;
  } catch {
    retrievedAt = undefined;
  }
  return { url, bytes: new Uint8Array(bytes), sha256: sha256(bytes), ...(retrievedAt ? { retrievedAt } : {}) };
}

export interface CurrentNorm {
  source: CachedSource;
  document: BayernRechtDocument;
  body: NormBodyBlock[];
  identity: NormIdentity;
  /** Beginn der Geltung des heute gezeigten Textes (ISO). */
  inForceFrom?: string;
  /** Vollzitat mit „zuletzt durch … geändert“. */
  fullCitation?: string;
  /** Änderungsverlauf der Quelle (nur Norm-DTD). */
  changeHistory?: string;
}

/** Parst das heutige Paket so, wie der Bulk es parst (Quelltext **vor** der Überleitung nach BayWü). */
export function parseCurrentNorm(documentId: string, source: CachedSource, retrievedAt: string): CurrentNorm {
  const document = parseBayernRechtPackage(
    { portal: 'bayernrecht', url: source.url, sha256: source.sha256, retrievedAt, contentType: 'application/zip', bytes: source.bytes.length } as never,
    source.bytes,
    { unknown: 'report' },
  );
  return {
    source,
    document,
    body: document.law.body,
    identity: normIdentity(documentId, document),
    ...(document.head.inForceFrom ? { inForceFrom: document.head.inForceFrom } : {}),
    ...(document.law.fullCitation ? { fullCitation: document.law.fullCitation } : {}),
    ...(document.law.changeHistory ? { changeHistory: document.law.changeHistory } : {}),
  };
}

function referenceString(organ: string | undefined, year: string | undefined, page: string | undefined, kind: 'seite' | 'nummer' | undefined): string | undefined {
  if (!page) return undefined;
  return `${organ ?? 'GVBl.'}${year ? ` ${year}` : ''} ${kind === 'nummer' ? 'Nr.' : 'S.'} ${page}`;
}

/** Identitätsmerkmale der Norm für das Auffinden ihres Einleitungssatzes in der Verkündung. */
export function normIdentity(documentId: string, document: BayernRechtDocument): NormIdentity {
  const head = document.head;
  const abbreviations = new Set<string>();
  if (head.abbr) abbreviations.add(head.abbr);
  const references: string[] = [];
  let documentDate: string | undefined;
  let versionDate: string | undefined;
  if ('gazette' in head) {
    const vv = head as VvHead;
    const reference = referenceString(vv.gazette.organ, vv.gazette.year, vv.gazette.page, vv.gazette.pageKind);
    if (reference) references.push(reference);
    documentDate = citationDates(document.law.citation).issueDate;
  } else {
    const norm = head as NormHead;
    documentDate = norm.documentDate;
    versionDate = norm.versionDate;
    for (const ref of [norm.issueReference, norm.versionReference]) {
      const reference = referenceString(ref.publication, ref.year, ref.page, ref.pageKind);
      if (reference) references.push(reference);
    }
  }
  // Abkürzungen aus dem Vollzitat („(ZustV)“, „(Redaktionsrichtlinien – RedR)“).
  for (const match of (document.law.fullCitation ?? '').matchAll(/\(([^()\s]{2,40})\)/gu)) {
    const candidate = match[1]!;
    if (/[A-ZÄÖÜ].*[A-ZÄÖÜ]/u.test(candidate) && !/^(?:GVBl|BayMBl|AllMBl|JMBl)/u.test(candidate)) abbreviations.add(candidate);
  }
  return {
    documentId,
    title: head.title,
    abbreviations: [...abbreviations],
    ...(document.bayRsNumber ? { bayRsNumber: document.bayRsNumber } : {}),
    ...(documentDate ? { documentDate } : {}),
    ...(versionDate ? { versionDate } : {}),
    references,
  };
}
