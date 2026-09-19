/**
 * Verkündungen als Quelle einer Rückrechnung – **nur aus dem Cache**.
 *
 * Eine Änderung wird im Einleitungssatz einer späteren Änderung („…, die zuletzt durch § 2 des Gesetzes vom
 * 9. Mai 2006 (GVBl. S. 190) geändert worden ist, …“) oder im Vollzitat des Portals genannt. Daraus folgen
 * Organ, Jahrgang und Seite bzw. Nummer – und daraus die Detailseite der Verkündungsplattform
 * (`/gvbl/<Jahr>-<Seite>/`, `/baymbl/<Jahr>-<Nr>/`). Der Jahrgang ist der des Ausfertigungsdatums; bei einer
 * Ausfertigung im Dezember kommt der Folgejahrgang in Betracht (Verkündung im Januar). Welche der Seiten es
 * ist, entscheidet allein die **Identität**: Die Seite muss das Ausfertigungsdatum tragen.
 *
 * Ältere GVBl.-Jahrgänge führt die Plattform nicht als HTML (404). Dann ist die amtliche Ausgabe als PDF die
 * Quelle (`pdf.ts`): Ausgabenverzeichnis des Jahrgangs → Ausgabe mit dem Seitenbereich → PDF mit der von der
 * Plattform veröffentlichten SHA-256. Es wird **nie** OCR verwendet.
 *
 * Fehlt eine Seite im Cache, ist das ein **Bedarf** (`needs`), den `acquire.ts` gezielt abruft – nie diese
 * Datei. Eine belegte 404-Antwort (Negativ-Cache des Fetchers) ist ein Befund, kein Bedarf.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CACHE_DIR } from '../common/constants.ts';
import { parsePublicationDocument } from '../events/documents.ts';
import { decodeEntities, parseGvblIssueIndex, type IssueRow } from '../events/listings.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { parseAmtsblattIssue, parseAmtsblattVolume } from '../baseline-only/platform.ts';
import { amtsblattIssueUrl, amtsblattVolumeUrl, type MinisterialJournal } from '../baseline-only/references.ts';
import { gazetteUnits, normalizeGazetteText, type GazetteUnit } from './gazette.ts';
import { cacheKey, readCached, type CachedSource } from './source.ts';

export const PLATFORM = 'https://www.verkuendung-bayern.de';

/**
 * Lauf 8: auch die Amtsblätter der Ministerien 2009–2018 (AllMBl., KWMBl., FMBl., JMBl.) – amtliche elektronische
 * Fassung auf der Plattform, erreichbar über Jahrgang → Ausgabe → Dokument (Parser aus `baseline-only/platform.ts`).
 */
export type AmtsblattOrgan = 'allmbl' | 'kwmbl' | 'fmbl' | 'jmbl';
export type Organ = 'gvbl' | 'baymbl' | AmtsblattOrgan;

export const AMTSBLATT_JOURNALS: Readonly<Record<AmtsblattOrgan, MinisterialJournal>> = { allmbl: 'AllMBl', kwmbl: 'KWMBl', fmbl: 'FMBl', jmbl: 'JMBl' };
export const isAmtsblatt = (organ: Organ): organ is AmtsblattOrgan => organ in AMTSBLATT_JOURNALS;
/** Jahrgänge der Amtsblätter mit amtlicher elektronischer Fassung auf der Plattform. */
export const AMTSBLATT_VOLUMES = { first: 2009, last: 2018 } as const;

export interface PublicationRef {
  organ: Organ;
  volume: number;
  position: number;
}

export const publicationKey = (ref: PublicationRef): string => `${ref.organ}|${ref.volume}|${ref.position}`;
export const publicationCitation = (ref: PublicationRef): string => (ref.organ === 'gvbl' ? `GVBl. ${ref.volume} S. ${ref.position}` : ref.organ === 'baymbl' ? `BayMBl. ${ref.volume} Nr. ${ref.position}` : `${AMTSBLATT_JOURNALS[ref.organ]}. ${ref.volume} S. ${ref.position}`);
export const detailPageUrl = (ref: PublicationRef): string => `${PLATFORM}/${ref.organ}/${ref.volume}-${ref.position}/`;
export const gvblIssueIndexUrl = (volume: number): string => `${PLATFORM}/gesetz-und-verordnungsblatt/alle-ausgaben-des-gvbl-ab-1945/?volume=${volume}`;

/** Amtlichkeit der Quelle: das GVBl. ist gedruckt amtlich, das BayMBl. elektronisch. */
export const SOURCE_AUTHORITY: Readonly<Record<Organ, { publicationAuthority: string; digitalRepresentation: string }>> = {
  gvbl: { publicationAuthority: 'printed-official', digitalRepresentation: 'official-platform-informational-copy' },
  baymbl: { publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition' },
  allmbl: { publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition' },
  kwmbl: { publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition' },
  fmbl: { publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition' },
  jmbl: { publicationAuthority: 'electronic-official', digitalRepresentation: 'official-electronic-edition' },
};

/**
 * Mögliche Fundstellen einer zitierten Änderung: „GVBl. S. 190“ mit Ausfertigung 2006-05-09 → GVBl. 2006 S. 190;
 * bei Ausfertigung im Dezember zusätzlich der Folgejahrgang; eine Jahreszahl in der Fundstelle gilt allein.
 */
export function candidateRefs(reference: string | undefined, enactmentDate: string | undefined): PublicationRef[] {
  if (!reference) return [];
  // „(BayMBl. 728)“ (ohne „Nr.“, BayMBl. 2023 Nr. 30) zählt wie „BayMBl. Nr. 728“; Amtsblätter nur mit Seite und ohne
  // Teilangabe („KWMBl. I S. 194“ ist die gedruckte Ausgabe vor 2009).
  const match = /^(GVBl|BayMBl|AllMBl|AIIMBl|KWMBl|FMBl|JMBl)\.?\s*(\d{4})?\s*(S\.|Nr\.)?\s*(\d+)/u.exec(reference.trim());
  if (!match) return [];
  const name = match[1] === 'AIIMBl' ? 'AllMBl' : match[1]!;
  const organ = name.toLowerCase() as Organ;
  if (match[3] === undefined && organ !== 'baymbl') return [];
  if (isAmtsblatt(organ) && match[3] !== 'S.') return [];
  const position = Number(match[4]);
  const inRange = (volume: number): boolean => !isAmtsblatt(organ) || (volume >= AMTSBLATT_VOLUMES.first && volume <= AMTSBLATT_VOLUMES.last);
  if (match[2]) return inRange(Number(match[2])) ? [{ organ, volume: Number(match[2]), position }] : [];
  if (!enactmentDate) return [];
  const volume = Number(enactmentDate.slice(0, 4));
  const refs: PublicationRef[] = [{ organ, volume, position }];
  // Im Dezember erlassen, im Januar verkündet; Amtsblätter auch später im Folgejahr (Erlass im Herbst).
  if (enactmentDate.slice(5, 7) === '12' || (isAmtsblatt(organ) && Number(enactmentDate.slice(5, 7)) >= 9)) refs.push({ organ, volume: volume + 1, position });
  return refs.filter((ref) => inRange(ref.volume));
}

/** Ausfertigungsdatum in Langform („9. Mai 2006“), wie es die Verkündung druckt. */
export function longGermanDate(iso: string): string {
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const [year, month, day] = iso.split('-');
  return `${Number(day)}. ${months[Number(month) - 1]} ${year}`;
}

export interface GazettePage {
  ref: PublicationRef;
  citation: string;
  /** Detailseite (HTML) bzw. PDF-Ausgabe. */
  url: string;
  kind: 'html' | 'pdf';
  sha256: string;
  retrievedAt?: string;
  /** Einheiten des HTML-Textkörpers (leer bei PDF). */
  units: GazetteUnit[];
  /** Verkündungsdatum (Ausgabedatum), soweit die Seite es nennt. */
  publishedAt?: string;
  gazettePdfUrl?: string;
  gazettePdfSha256Published?: string;
  /** Nur PDF: Ausgabe, Seitenbereich und Verzeichnis, aus dem PDF-Adresse und veröffentlichte Prüfsumme stammen. */
  pdf?: { issue: string; pages: string; indexUrl: string; indexSha256: string; publishedSha256: string };
  /** Seitentext zur Identitätsprüfung (HTML: Textkörper, normalisiert). */
  identityText: string;
}

export type PageLookup =
  | { status: 'found'; page: GazettePage; tried: string[] }
  /** Keine der Kandidatenseiten liegt im Cache; `needs` nennt, was abzurufen wäre. */
  | { status: 'missing'; needs: string[]; tried: string[] }
  /** Kandidatenseiten liegen vor (oder sind belegt 404), aber keine trägt die Identität. */
  | { status: 'unavailable'; reason: string; tried: string[] };

async function isNotFound(root: string, url: string): Promise<boolean> {
  try {
    const entry = JSON.parse(await readFile(join(root, CACHE_DIR, `${cacheKey(url)}.404.json`), 'utf8')) as { url?: string; status?: number };
    return entry.url === url && entry.status === 404;
  } catch {
    return false;
  }
}

/**
 * Seiten werden je Lauf nur einmal zerlegt und dann geteilt: Hunderte Ketten nennen dieselben Mantelverkündungen.
 * Schlüssel: Wurzel, Adresse und Prüfsumme – ein neu abgerufener Cacheeintrag ergibt eine neue Seite.
 */
const PAGE_CACHE = new Map<string, GazettePage>();

function htmlPage(ref: PublicationRef, cached: CachedSource, root: string): GazettePage {
  const key = `${root}\n${cached.url}\n${cached.sha256}`;
  const known = PAGE_CACHE.get(key);
  if (known) return known;
  const page = buildHtmlPage(ref, cached);
  PAGE_CACHE.set(key, page);
  return page;
}

function buildHtmlPage(ref: PublicationRef, cached: CachedSource): GazettePage {
  const html = new TextDecoder().decode(cached.bytes);
  const document: Partial<ReturnType<typeof parsePublicationDocument>> = ref.organ === 'gvbl' || ref.organ === 'baymbl' ? parsePublicationDocument(html, ref.organ, ref.volume, ref.position) : {};
  const units = gazetteUnits(html);
  return {
    ref,
    citation: publicationCitation(ref),
    url: cached.url,
    kind: 'html',
    sha256: cached.sha256,
    ...(cached.retrievedAt ? { retrievedAt: cached.retrievedAt } : {}),
    units,
    ...(document.publishedAt ? { publishedAt: document.publishedAt } : {}),
    ...(document.gazettePdfPath ? { gazettePdfUrl: `${PLATFORM}${document.gazettePdfPath}` } : {}),
    ...(document.gazettePdfSha256Published ? { gazettePdfSha256Published: document.gazettePdfSha256Published } : {}),
    identityText: normalizeGazetteText(decodeEntities(html.replace(/<[^>]+>/gu, ' '))),
  };
}

/** Ausgabe des GVBl., deren Seitenbereich die Seite enthält (aus dem Ausgabenverzeichnis des Jahrgangs). */
export function issueForPage(rows: readonly IssueRow[], position: number): IssueRow | undefined {
  const hits = rows.filter((row) => {
    const range = /^(\d+)\s*-\s*(\d+)$/u.exec(row.pages ?? '');
    return range !== null && Number(range[1]) <= position && position <= Number(range[2]);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Seite einer zitierten Änderung aus dem Cache. `enactmentDate` ist die Identität: Die Seite muss das
 * Ausfertigungsdatum in Langform tragen. Bei GVBl.-Jahrgängen ohne HTML (belegte 404) wird die PDF-Ausgabe
 * gesucht; `allowPdf` schaltet das ab.
 */
export async function lookupPage(root: string, refs: readonly PublicationRef[], enactmentDate: string | undefined, options: { allowPdf?: boolean } = {}): Promise<PageLookup> {
  const tried: string[] = [];
  const needs: string[] = [];
  const identity = enactmentDate ? normalizeGazetteText(longGermanDate(enactmentDate)) : undefined;
  const pdfCandidates: PublicationRef[] = [];
  for (const ref of refs) {
    if (isAmtsblatt(ref.organ)) {
      const found = await amtsblattPage(root, ref, enactmentDate, tried);
      if (found.status === 'found') {
        if (identity && !found.page.identityText.includes(identity)) continue;
        return { status: 'found', page: found.page, tried };
      }
      if (found.status === 'missing') {
        needs.push(...found.needs);
        break;
      }
      continue;
    }
    const url = detailPageUrl(ref);
    tried.push(url);
    const cached = await readCached(root, url);
    if (cached) {
      const page = htmlPage(ref, cached, root);
      if (page.units.length === 0) continue;
      if (identity && !page.identityText.includes(identity)) continue;
      return { status: 'found', page, tried };
    }
    if (await isNotFound(root, url)) {
      if (ref.organ === 'gvbl') pdfCandidates.push(ref);
      continue;
    }
    // Der Reihe nach: erst wenn diese Seite geprüft ist, kommt der Folgejahrgang in Betracht – kein Abruf auf Vorrat.
    needs.push(url);
    break;
  }
  if (needs.length > 0) return { status: 'missing', needs, tried };
  if (options.allowPdf !== false && pdfCandidates.length > 0) {
    for (const ref of pdfCandidates) {
      const indexUrl = gvblIssueIndexUrl(ref.volume);
      tried.push(indexUrl);
      const index = await readCached(root, indexUrl);
      if (!index) {
        needs.push(indexUrl);
        continue;
      }
      const issue = issueForPage(parseGvblIssueIndex(new TextDecoder().decode(index.bytes)), ref.position);
      // Das Verzeichnis eines Jahrgangs ohne eigene Ausgaben (etwa 1908) zeigt andere Jahrgänge – nur Ausgaben des Jahrgangs zählen.
      if (!issue || Number(issue.volume) !== ref.volume) continue;
      const pdfUrl = `${PLATFORM}${issue.pdfPath}`;
      tried.push(pdfUrl);
      const pdf = await readCached(root, pdfUrl);
      if (!pdf) {
        needs.push(pdfUrl);
        continue;
      }
      return {
        status: 'found',
        tried,
        page: {
          ref,
          citation: publicationCitation(ref),
          url: pdfUrl,
          kind: 'pdf',
          sha256: pdf.sha256,
          ...(pdf.retrievedAt ? { retrievedAt: pdf.retrievedAt } : {}),
          units: [],
          publishedAt: issue.publishedAt,
          gazettePdfUrl: pdfUrl,
          gazettePdfSha256Published: issue.sha256Published,
          pdf: { issue: `${issue.volume}/${issue.issue}`, pages: issue.pages ?? '', indexUrl, indexSha256: index.sha256, publishedSha256: issue.sha256Published },
          identityText: '',
        },
      };
    }
    if (needs.length > 0) return { status: 'missing', needs, tried };
  }
  return { status: 'unavailable', reason: pdfCandidates.length > 0 ? 'Detailseite belegt nicht vorhanden (404), keine PDF-Ausgabe mit passendem Seitenbereich' : `keine Seite trägt das Ausfertigungsdatum ${enactmentDate ?? '–'}`, tried };
}

/**
 * Dokument eines Amtsblatts 2009–2018 aus dem Cache: Jahrgangsliste → Ausgaben, deren Seitenbereich die Seite enthält
 * und die nicht vor dem Erlass erschienen → das Dokument, das auf der Seite beginnt (bei mehreren das mit dem zitierten
 * Erlassdatum) → seine HTML-Seite. Verkündungsdatum ist das der Ausgabe laut Jahrgangsliste. Fehlt eine Liste oder Seite,
 * ist sie Bedarf – der Reihe nach, wie die Auflösung sie braucht.
 */
async function amtsblattPage(root: string, ref: PublicationRef, enactmentDate: string | undefined, tried: string[]): Promise<{ status: 'found'; page: GazettePage } | { status: 'missing'; needs: string[] } | { status: 'none' }> {
  const journal = AMTSBLATT_JOURNALS[ref.organ as AmtsblattOrgan];
  const volumeUrl = amtsblattVolumeUrl(journal, ref.volume);
  tried.push(volumeUrl);
  const volumePage = await readCached(root, volumeUrl);
  if (!volumePage) return (await isNotFound(root, volumeUrl)) ? { status: 'none' } : { status: 'missing', needs: [volumeUrl] };
  const issues = parseAmtsblattVolume(new TextDecoder().decode(volumePage.bytes)).filter((row) => row.firstPage <= ref.position && ref.position <= row.lastPage && (!enactmentDate || row.publishedAt >= enactmentDate));
  const found: Array<{ publishedAt: string; htmlPath: string }> = [];
  const needs: string[] = [];
  for (const issue of issues) {
    const issueUrl = amtsblattIssueUrl(issue.htmlPath);
    tried.push(issueUrl);
    const issuePage = await readCached(root, issueUrl);
    if (!issuePage) {
      if (!(await isNotFound(root, issueUrl))) needs.push(issueUrl);
      continue;
    }
    const rows = parseAmtsblattIssue(new TextDecoder().decode(issuePage.bytes)).documents.filter((row) => row.page === ref.position && row.htmlPath);
    const dated = rows.length > 1 && enactmentDate ? rows.filter((row) => row.enactmentDate === enactmentDate) : rows;
    for (const row of dated) found.push({ publishedAt: issue.publishedAt, htmlPath: row.htmlPath! });
  }
  if (needs.length > 0) return { status: 'missing', needs };
  if (found.length !== 1) return { status: 'none' };
  const url = amtsblattIssueUrl(found[0]!.htmlPath);
  tried.push(url);
  const cached = await readCached(root, url);
  if (!cached) return (await isNotFound(root, url)) ? { status: 'none' } : { status: 'missing', needs: [url] };
  const key = `${root}\n${cached.url}\n${cached.sha256}`;
  const known = PAGE_CACHE.get(key);
  if (known) return { status: 'found', page: known };
  const html = new TextDecoder().decode(cached.bytes);
  const page: GazettePage = {
    ref,
    citation: publicationCitation(ref),
    url: cached.url,
    kind: 'html',
    sha256: cached.sha256,
    ...(cached.retrievedAt ? { retrievedAt: cached.retrievedAt } : {}),
    units: gazetteUnits(html),
    publishedAt: found[0]!.publishedAt,
    identityText: normalizeGazetteText(decodeEntities(html.replace(/<[^>]+>/gu, ' '))),
  };
  PAGE_CACHE.set(key, page);
  return { status: 'found', page };
}

/** Datum in Langform aus einem Zitatteil („vom 9. Mai 2006“) → ISO. */
export const enactmentOf = (text: string): string | undefined => {
  const match = /vom\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/u.exec(text);
  return match ? parseLongGermanDate(match[1]!) : undefined;
};
