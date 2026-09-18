/**
 * Zugriff auf die Verkündungsplattform Bayern für die Wiederherstellung heute fehlender Stichtagsnormen.
 *
 * **Netzdisziplin.** Jeder Abruf läuft über `createBayernRechtFetcher` (`common/fetcher.ts`): sequenziell,
 * Mindestabstand, identifizierender User-Agent, Cache `.cache/bayernrecht/`, belegte 404 werden negativ
 * gecacht. Was im Cache liegt, wird nie ein zweites Mal geholt; mit `offline` ist jeder Netzabruf ein
 * Befund (`not-cached`), kein Fehler des Laufs. Ein Abrufbudget (`maxRequests`) beendet die Netzphase
 * sauber – der nächste Lauf setzt dort fort, weil alles bereits Geholte im Cache liegt.
 *
 * **Checkpoint.** Nach jedem Netzabruf wird der Laufstand nach `.cache/bayernrecht/baseline-only-run.json`
 * geschrieben (Zahl der Abrufe, offene Adressen). Er ist Betriebszustand, kein fachlicher Zustand, und liegt
 * deshalb nicht in Git.
 *
 * Außerdem die Zerlegung der beiden Übersichten der „Ausgaben der Amtsblätter 2009-2018“ (Jahrgangsliste
 * eines Blatts, Inhaltsübersicht einer Ausgabe) und der Seitenköpfe der Einzelveröffentlichungen.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CACHE_DIR } from '../common/constants.ts';
import { createBayernRechtFetcher, sha256Hex, type BayernRechtFetcher } from '../common/fetcher.ts';
import { decodeEntities, htmlToText, parseGermanDate } from '../events/listings.ts';

export interface PlatformPage {
  url: string;
  finalUrl: string;
  html: string;
  /** Rohbytes der Antwort (für PDF-Quellen; `html` ist deren UTF-8-Lesart). */
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
  contentType: string;
  retrievedAt: string;
  fromCache: boolean;
}

export type PageMiss = { missing: 'not-cached' | 'not-found' | 'budget' | 'error'; url: string; detail: string };
export const isPageMiss = (value: PlatformPage | PageMiss): value is PageMiss => 'missing' in value;

export interface PlatformStats {
  networkRequests: number;
  cacheHits: number;
  notFound: number;
  errors: number;
  /** Adressen, die dieser Lauf gebraucht, aber nicht bekommen hat (offline, Budget). */
  pending: string[];
  budgetExhausted: boolean;
}

export interface PlatformOptions {
  root: string;
  offline: boolean;
  /** Obergrenze der Netzabrufe dieses Laufs. */
  maxRequests?: number;
  cacheDir?: string;
  /** Austauschbar für Tests. */
  fetcher?: BayernRechtFetcher;
  /** Checkpoint schreiben (Standard: ja, wenn nicht offline). */
  checkpoint?: boolean;
  log?: (line: string) => void;
}

export const RUN_STATE_FILE = 'baseline-only-run.json';

export interface Platform {
  readonly stats: PlatformStats;
  get(url: string): Promise<PlatformPage | PageMiss>;
}

/** Dekodiert UTF-8 (die Plattform liefert ausschließlich UTF-8). */
const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);

export function createPlatform(options: PlatformOptions): Platform {
  const cacheDir = options.cacheDir ?? join(options.root, CACHE_DIR);
  const fetcher = options.fetcher ?? createBayernRechtFetcher({ root: options.root, cacheDir, offline: options.offline, ...(options.maxRequests !== undefined ? { budget: { maxRequests: options.maxRequests } } : {}) });
  const stats: PlatformStats = { networkRequests: 0, cacheHits: 0, notFound: 0, errors: 0, pending: [], budgetExhausted: false };
  const memo = new Map<string, PlatformPage | PageMiss>();
  const checkpoint = options.checkpoint ?? !options.offline;

  async function writeCheckpoint(): Promise<void> {
    if (!checkpoint) return;
    const path = join(cacheDir, RUN_STATE_FILE);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ schemaVersion: 'bayernrecht-baseline-only-run/1', updatedAt: new Date().toISOString(), ...stats, pending: [...new Set(stats.pending)].sort() }, null, 2)}\n`, 'utf8');
  }

  return {
    stats,
    async get(url: string): Promise<PlatformPage | PageMiss> {
      const known = memo.get(url);
      if (known) return known;
      let result: PlatformPage | PageMiss;
      try {
        const document = await fetcher.fetch(url);
        if (document.fromCache) stats.cacheHits += 1;
        else {
          stats.networkRequests += 1;
          options.log?.(`  abgerufen: ${url}`);
        }
        if (sha256Hex(document.bytes) !== document.sha256) throw new Error(`SHA-256 der Antwort stimmt nicht (${url})`);
        result = { url, finalUrl: document.finalUrl, html: decode(document.bytes), bytes: document.bytes, sha256: document.sha256, byteLength: document.bytes.byteLength, contentType: document.contentType, retrievedAt: document.retrievedAt, fromCache: document.fromCache };
        if (!document.fromCache) await writeCheckpoint();
      } catch (error) {
        const kind = (error as { kind?: string }).kind;
        if (kind === 'not-found') {
          stats.notFound += 1;
          result = { missing: 'not-found', url, detail: 'HTTP 404 (belegt, negativ gecacht)' };
        } else if (kind === 'budget-exhausted') {
          stats.budgetExhausted = true;
          stats.pending.push(url);
          result = { missing: 'budget', url, detail: (error as Error).message };
          await writeCheckpoint();
        } else if (options.offline && (kind === 'network' || kind === undefined)) {
          stats.pending.push(url);
          result = { missing: 'not-cached', url, detail: 'Offline: Seite nicht im Cache' };
        } else if (kind === 'blocked' || kind === 'interrupted') {
          stats.budgetExhausted = true;
          stats.pending.push(url);
          result = { missing: 'budget', url, detail: (error as Error).message };
          await writeCheckpoint();
        } else {
          stats.errors += 1;
          stats.pending.push(url);
          result = { missing: 'error', url, detail: (error as Error).message };
        }
      }
      memo.set(url, result);
      return result;
    },
  };
}

/* ---------------------------------------------------------------- Ausgaben der Amtsblätter 2009-2018 */

const ROW = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/giu;
const CELL = /<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/giu;

export interface AmtsblattIssueRow {
  organ: string;
  volume: number;
  /** Ausgabennummer (`10`); Beiblätter, Jahres- und Sammelausgaben werden nicht geführt. */
  issue: number;
  publishedAt: string;
  firstPage: number;
  lastPage: number;
  /** `/amtsblatt/ausgabe/kwmbl-2016-10/` */
  htmlPath: string;
  pdfPath?: string;
  pdfSha256Published?: string;
}

function cells(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const cell of body.matchAll(CELL)) map.set(cell[1]!.toLowerCase(), cell[2]!);
  return map;
}

const HASH_CONTENT = /data-content="([0-9A-Fa-f]{64})"/u;

/** Jahrgangsliste eines Amtsblatts: eine Zeile je gewöhnlicher Ausgabe mit Seitenbereich und HTML-Übersicht. */
export function parseAmtsblattVolume(html: string): AmtsblattIssueRow[] {
  const rows: AmtsblattIssueRow[] = [];
  for (const match of html.matchAll(ROW)) {
    const body = match[1]!;
    const map = cells(body);
    const issue = htmlToText(map.get('ausgabe') ?? '');
    if (!/^\d+$/u.test(issue)) continue;
    const pages = /^(\d+)\s*-\s*(\d+)$/u.exec(htmlToText(map.get('seiten') ?? ''));
    const htmlPath = /href="(\/amtsblatt\/ausgabe\/[^"]+)"/u.exec(map.get('html') ?? '')?.[1];
    const publishedAt = parseGermanDate(htmlToText(map.get('verkündung') ?? ''));
    if (!pages || !htmlPath || !publishedAt) continue;
    const pdf = map.get('pdf') ?? '';
    const pdfPath = /href="([^"#]+\.pdf)/u.exec(pdf)?.[1];
    const hash = HASH_CONTENT.exec(pdf)?.[1];
    rows.push({
      organ: htmlToText(map.get('organ') ?? ''),
      volume: Number(htmlToText(map.get('jahr') ?? '')),
      issue: Number(issue),
      publishedAt,
      firstPage: Number(pages[1]),
      lastPage: Number(pages[2]),
      htmlPath,
      ...(pdfPath ? { pdfPath } : {}),
      ...(hash ? { pdfSha256Published: hash.toLowerCase() } : {}),
    });
  }
  return rows;
}

export interface AmtsblattDocumentRow {
  gliederungsnummern: string[];
  enactmentDate?: string;
  title: string;
  page: number;
  /** `/amtsblatt/dokument/kwmbl-2016-10-194/` */
  htmlPath?: string;
  pdfPath?: string;
  pdfPage?: number;
  pdfSha256Published?: string;
}

/** Inhaltsübersicht einer Ausgabe: je Dokument Gliederungsnummer, Erlassdatum, Titel, Anfangsseite. */
export function parseAmtsblattIssue(html: string): { heading: string; publishedAt?: string; documents: AmtsblattDocumentRow[] } {
  const heading = htmlToText(/<h2[^>]*>([\s\S]*?)<\/h2>/u.exec(html.slice(html.indexOf('tx-declarations')))?.[1] ?? '');
  const documents: AmtsblattDocumentRow[] = [];
  for (const match of html.matchAll(ROW)) {
    const map = cells(match[1]!);
    const page = htmlToText(map.get('seite') ?? '');
    if (!/^\d+$/u.test(page)) continue;
    const pdf = map.get('pdf') ?? '';
    const pdfHref = /href="([^"#]+\.pdf)(?:#page=(\d+))?/u.exec(pdf);
    const hash = HASH_CONTENT.exec(pdf)?.[1];
    const htmlPath = /href="(\/amtsblatt\/dokument\/[^"]+)"/u.exec(map.get('html') ?? '')?.[1];
    const enactmentDate = parseGermanDate(htmlToText(map.get('erlass') ?? ''));
    documents.push({
      gliederungsnummern: htmlToText(map.get('gl-nr.') ?? '').split(/[\s,;]+/u).filter((entry) => /^\d/u.test(entry)),
      ...(enactmentDate ? { enactmentDate } : {}),
      title: htmlToText(map.get('titel') ?? ''),
      page: Number(page),
      ...(htmlPath ? { htmlPath } : {}),
      ...(pdfHref ? { pdfPath: pdfHref[1]!, ...(pdfHref[2] ? { pdfPage: Number(pdfHref[2]) } : {}) } : {}),
      ...(hash ? { pdfSha256Published: hash.toLowerCase() } : {}),
    });
  }
  const publishedAt = parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(heading)?.[1] ?? '');
  return { heading, ...(publishedAt ? { publishedAt } : {}), documents };
}

/* ------------------------------------------------------------------ Seitenkopf einer Veröffentlichung */

export interface PublicationHead {
  /** Überschrift der Seite (`Veröffentlichung BayMBl. 2021 Nr. 182 vom 10.03.2021`). */
  headline: string;
  /** Publikationstyp laut Seitenkopf (`Verwaltungsvorschrift`, `Stellenausschreibung`, `Verordnung` …). */
  publicationType?: string;
  gliederungsnummern: string[];
  ressort?: string;
  pdfPath?: string;
  pdfSha256Published?: string;
  /** Anlagen, die die Seite nur als Datei verlinkt (Titel und Adresse). */
  attachments: Array<{ title: string; href: string }>;
  /** Bilder im Textkörper (Adresse, Alternativtext). */
  images: Array<{ src: string; alt: string }>;
}

export function parsePublicationHead(html: string): PublicationHead {
  const headline = htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1] ?? '');
  const headRight = /<div[^>]*id="head-right"[^>]*>([\s\S]*?)<article/u.exec(html)?.[1] ?? '';
  const publicationType = htmlToText(/<h2[^>]*>([\s\S]*?)<\/h2>/u.exec(headRight)?.[1] ?? '').replace(/ /gu, ' ').trim();
  const structure = /<div[^>]*class="[^"]*structure-numbers[^"]*"[^>]*>([\s\S]*?)<\/div>/u.exec(html)?.[1] ?? /<div[^>]*id="head-toc"[^>]*>([\s\S]*?)<\/div>/u.exec(html)?.[1] ?? '';
  const ressort = htmlToText(/<div[^>]*class="[^"]*\bressort\b[^"]*"[^>]*>([\s\S]*?)<\/div>/u.exec(html)?.[1] ?? '');
  const pdfPath = /href="(\/files\/[^"#]+\.pdf)[^"]*"[^>]*class="pdf_file"/u.exec(html)?.[1];
  const hash = /Hash-Prüfsumme der PDF-Datei[^<]*\(sha256\):\s*<strong>\s*([0-9a-fA-F]{64})\s*<\/strong>/u.exec(html)?.[1];
  const article = /<article[^>]*id="documentbox"[^>]*>([\s\S]*?)<\/article>/u.exec(html)?.[1] ?? '';
  const attachments: PublicationHead['attachments'] = [];
  const attachmentBlock = article.slice(Math.max(0, article.indexOf('class="attachment"')));
  if (article.includes('class="attachment"')) {
    for (const link of attachmentBlock.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)) attachments.push({ href: decodeEntities(link[1]!), title: htmlToText(link[2]!) });
  }
  const images = [...article.matchAll(/<img\s[^>]*>/gu)].map((tag) => ({ src: decodeEntities(/src="([^"]*)"/u.exec(tag[0])?.[1] ?? ''), alt: decodeEntities(/alt="([^"]*)"/u.exec(tag[0])?.[1] ?? '') }));
  return {
    headline,
    ...(publicationType && publicationType !== '' ? { publicationType } : {}),
    gliederungsnummern: htmlToText(structure).split(/[\s,;]+/u).map((part) => part.trim()).filter((part) => /^\d/u.test(part)),
    ...(ressort ? { ressort } : {}),
    ...(pdfPath ? { pdfPath } : {}),
    ...(hash ? { pdfSha256Published: hash.toLowerCase() } : {}),
    attachments,
    images,
  };
}
