/**
 * Die Ausgangsverkündung einer heute fehlenden Stichtagsnorm finden – und belegen, dass sie es ist.
 *
 * Aus der Fundstelle des Aufhebungsbefehls (`references.ts`) folgt die Adresse:
 *
 *   BayMBl. ab 2019      `/baymbl/<jahr>-<nr>/`
 *   Amtsblätter 2009–18  Jahrgangsliste des Blatts → Ausgabe, deren Seitenbereich die Seite enthält →
 *                        Inhaltsübersicht der Ausgabe → Dokument, das auf dieser Seite beginnt und das
 *                        Ausfertigungsdatum trägt → `/amtsblatt/dokument/…/`
 *   GVBl.                `/gvbl/<jahr>-<seite>/` (nachrichtlich; fehlt die Seite, liegt nur die PDF-Ausgabe vor)
 *
 * **Identität.** Die gefundene Seite muss das Ausfertigungsdatum des Zitats tragen, und ihr Titel muss im
 * zitierten Titel enthalten sein (oder umgekehrt). Sonst ist es nicht die aufgehobene Norm – ein Widerspruch,
 * kein Anlass, die nächstbeste Seite zu nehmen.
 */
import { gazetteUnits, type GazetteUnit } from '../reconstruction/gazette.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { htmlToText, parseGermanDate } from '../events/listings.ts';
import { DATE_LINE, GLNR, ISSUER } from './html.ts';
import { titleKey } from './identity.ts';
import { isPageMiss, parseAmtsblattIssue, parseAmtsblattVolume, parsePublicationHead, type Platform, type PlatformPage, type PublicationHead } from './platform.ts';
import { amtsblattIssueUrl, amtsblattVolumeUrl, baymblDetailUrl, gvblDetailUrl, MINISTERIAL_JOURNALS, PLATFORM_ORIGIN, publicationIdentity, type BaseLocation, type GazetteName, type MinisterialJournal } from './references.ts';

export type Authority = 'electronic-official' | 'printed-official';
export type Representation = 'official-electronic-edition' | 'official-platform-informational-copy';

export interface SourceDocumentRef {
  url: string;
  sha256: string;
  retrievedAt: string;
  byteLength: number;
  contentType: string;
}

export interface GazettePublication {
  /** Stabile Kennung (`baymbl-2021-182`, `kwmbl-2016-10-194`, `gvbl-2019-594`). */
  identity: string;
  organ: GazetteName;
  volume: number;
  /** Nummer (BayMBl.) bzw. Anfangsseite (Amtsblätter, GVBl.). */
  position: number;
  /** Ausgabe (Amtsblätter). */
  issue?: number;
  /** Fundstelle mit Jahrgang (`BayMBl. 2021 Nr. 182`, `KWMBl. 2016 S. 194`). */
  citation: string;
  /** Verkündungsdatum (BayMBl.: Veröffentlichung; Amtsblätter/GVBl.: Erscheinen der Ausgabe). */
  publishedAt: string;
  authority: Authority;
  representation: Representation;
  /** Beleg der Amtlichkeit in einem Satz. */
  authorityNote: string;
  page: PlatformPage;
  head: PublicationHead;
  units: GazetteUnit[];
  /** Titel der Seite und Gegenprobe gegen das Zitat. */
  title: string;
  titleCheck: TitleCheck;
  /** Amtliche PDF-Ausgabe mit der von der Plattform veröffentlichten Prüfsumme (nicht geladen). */
  pdf?: { url: string; sha256Published?: string; page?: number };
  /** Übersichtsseiten, über die die Veröffentlichung gefunden wurde (Jahrgangsliste, Ausgabe). */
  listings: SourceDocumentRef[];
}

export type BaseFailureCode = 'base-not-fetched' | 'base-not-found' | 'base-pdf-only' | 'base-identity-mismatch' | 'base-no-text';
export type BaseResult = { ok: true; publication: GazettePublication } | { ok: false; code: BaseFailureCode; detail: string; urls: string[] };

export const ELECTRONIC_OFFICIAL_BAYMBL = 'BayMBl.: „Die amtliche Veröffentlichung im BayMBl. erfolgt ausschließlich elektronisch auf der Verkündungsplattform Bayern“ (Nutzungshinweise zum BayMBl.).';
export const ELECTRONIC_OFFICIAL_AMTSBLATT = 'Amts- und Ministerialblätter 2009–2018: „Seit Januar 2009 werden alle bayerischen Amts- und Ministerialblätter ausschließlich elektronisch bekannt gemacht. Die amtliche elektronische Fassung bleibt auf der Verkündungsplattform Bayern dauerhaft kostenlos abrufbar“ (Nutzungshinweise zum BayMBl.).';
export const PRINTED_OFFICIAL_GVBL = 'GVBl.: amtlich ist die Druckausgabe; die elektronische Fassung der Verkündungsplattform ist nachrichtlich (Nutzungshinweise BAYERN.RECHT).';

export const sourceRef = (page: PlatformPage): SourceDocumentRef => ({ url: page.url, sha256: page.sha256, retrievedAt: page.retrievedAt, byteLength: page.byteLength, contentType: page.contentType });

const LONG_DATE = /\b[Vv]om\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4})/gu;

/** Ausfertigungsdaten im Kopf der Verkündung (Titelblock bis zum ersten Textabsatz). */
export function headDates(units: readonly GazetteUnit[]): string[] {
  const dates: string[] = [];
  for (const unit of units.slice(0, 8)) {
    for (const match of unit.text.matchAll(LONG_DATE)) {
      const date = parseLongGermanDate(match[1]!);
      if (date) dates.push(date);
    }
    if (DATE_LINE.test(unit.text)) break;
  }
  return dates;
}

/**
 * Titel der Verkündung, am Wortlaut des Kopfs erkannt wie in `html.ts#splitHead`: was vor der Datumszeile
 * weder Gliederungsnummer noch Erlassstelle ist. Klassen taugen dafür nicht (belegt: ein Titel mit der Klasse
 * `Ausfertigungsdatum-Aktenzeichen`).
 */
export function publicationTitle(units: readonly GazetteUnit[]): string {
  const dateAt = units.findIndex((unit, index) => index < 8 && DATE_LINE.test(unit.text));
  const head = units.slice(0, dateAt < 0 ? 0 : dateAt);
  const parts: string[] = [];
  let glnr = false;
  let issuer = false;
  for (const unit of head) {
    const text = `${unit.label ?? ''} ${unit.text}`.trim();
    if (!glnr && parts.length === 0 && !issuer && GLNR.test(text)) {
      glnr = true;
      continue;
    }
    if (!issuer && ISSUER.test(text)) {
      issuer = true;
      continue;
    }
    if (text !== '') parts.push(text);
  }
  return parts.join(' ');
}

const titleTokens = (value: string): Set<string> =>
  new Set(
    titleKey(value.replace(/\([^()]*\)/gu, ' '))
      .replace(/^[¹²³⁴⁵⁶⁷⁸⁹⁰]+/u, '')
      .split(/[^\p{L}\p{Nd}]+/u)
      .filter((word) => word.length >= 4),
  );

/** Das Zitat nennt nur die Erlassstelle („Die Bekanntmachung der Obersten Baubehörde … vom …“), keinen Titel. */
const ISSUER_ONLY = /^(?:[¹²³⁴⁵⁶⁷⁸⁹⁰]+)?(?:die\s+|das\s+|der\s+)?(?:gemeinsame\s+)?(?:(?:bekanntmachung|schreiben|richtlinien?)\s+(?:des|der)\s+(?:(?!(?<![\p{L}])über(?![\p{L}])|„|")[\s\S])*|(?:bekanntmachung|richtlinien?|verwaltungsvorschriften?|dienstvereinbarung))$/u;

export interface TitleCheck {
  consistent: boolean;
  /** Anteil der Titelwörter der Seite (≥ 4 Buchstaben, ohne Klammerzusätze), die das Zitat führt. */
  overlap: number;
  /** Anteil der Kernwörter des Zitats (ohne Erlassstelle), die der Titel der Seite führt. */
  reverseOverlap: number;
  issuerOnly: boolean;
  /** Gleiche amtliche Abkürzung in beiden Titeln. */
  sameAbbreviation?: string;
}

/** Wörter der Erlassstelle, die ein Zitat vor den Titel stellt („Bekanntmachung des Bayerischen Staatsministeriums …“). */
const ISSUER_WORDS = new Set(['bekanntmachung', 'bekanntmachungen', 'gemeinsame', 'bayerischen', 'bayerisches', 'staatsministeriums', 'staatsministerien', 'staatsministerium', 'staatskanzlei', 'schreiben', 'über', 'sowie', 'innern', 'finanzen', 'justiz', 'unterricht', 'kultus', 'wissenschaft', 'kunst', 'forschung', 'bildung', 'heimat', 'landesentwicklung', 'verbraucherschutz', 'umwelt', 'gesundheit', 'pflege', 'familie', 'arbeit', 'soziales', 'sozialordnung', 'frauen', 'wirtschaft', 'energie', 'technologie', 'verkehr', 'wohnen', 'ernährung', 'landwirtschaft', 'forsten', 'tourismus', 'digitales', 'sport', 'integration', 'obersten', 'baubehörde', 'prävention', 'medien']);

const abbreviationsOf = (value: string): string[] =>
  [...value.matchAll(/\(([^()]{2,80})\)/gu)]
    .map((match) => match[1]!.replace(/[‐-―−]/gu, '-').split(/\s+-\s+/u).at(-1)!.trim())
    .filter((candidate) => !/\s/u.test(candidate) && (candidate.match(/[A-ZÄÖÜ]/gu) ?? []).length >= 2);

/**
 * Stimmt der Titel der Seite mit dem Zitat überein? Die **Identität** tragen Ausfertigungsdatum und Fundstelle
 * (zwei unabhängige Merkmale); der Titel ist nur die Gegenprobe gegen eine grob falsche Seite. Aufhebungslisten
 * zitieren Titel oft verkürzt, mit der Kurzbezeichnung oder nur mit der Erlassstelle – deshalb eine
 * Wortüberdeckung in beiden Richtungen oder dieselbe amtliche Abkürzung, kein Gleichheitstest.
 */
export function titleCheck(pageTitle: string, citedTitle: string): TitleCheck {
  const page = titleTokens(pageTitle);
  const pageAll = new Set(titleKey(pageTitle).split(/[^\p{L}\p{Nd}]+/u).filter((word) => word.length >= 4));
  const cited = titleTokens(citedTitle);
  const citedCore = new Set([...new Set(titleKey(citedTitle).split(/[^\p{L}\p{Nd}]+/u).filter((word) => word.length >= 4))].filter((word) => !ISSUER_WORDS.has(word)));
  const issuerOnly = ISSUER_ONLY.test(titleKey(citedTitle));
  const overlap = page.size === 0 ? 0 : Math.round(([...page].filter((word) => cited.has(word)).length / page.size) * 100) / 100;
  const reverseOverlap = citedCore.size === 0 ? 0 : Math.round(([...citedCore].filter((word) => pageAll.has(word)).length / citedCore.size) * 100) / 100;
  const pageAbbreviations = abbreviationsOf(pageTitle);
  const sameAbbreviation = abbreviationsOf(citedTitle).find((abbreviation) => pageAbbreviations.includes(abbreviation));
  const consistent = pageAll.size > 0 && (overlap >= 0.6 || reverseOverlap >= 0.6 || issuerOnly || sameAbbreviation !== undefined);
  return { consistent, overlap, reverseOverlap, issuerOnly, ...(sameAbbreviation ? { sameAbbreviation } : {}) };
}

export interface ResolveBaseInput {
  location: BaseLocation;
  documentDate: string;
  citedTitle: string;
  /**
   * Titel weiterer Zitate derselben Verkündung (gleiches Ausfertigungsdatum, gleiche Fundstelle). Die Titelprüfung ist
   * Gegenprobe; sie besteht, wenn eines der Zitate passt (BayMBl. 2024 Nr. 466: „1.2 Die RiZ-ING, Ausgabe Januar
   * 2022, wurden mit Bekanntmachung … eingeführt“ neben dem Außerkrafttretensbefehl „… die Bekanntmachung des
   * Bayerischen Staatsministeriums für Wohnen, Bau und Verkehr vom 12. Mai 2023 (BayMBl. Nr. 274) außer Kraft“).
   */
  alternativeTitles?: readonly string[];
  ledgerTitle: string;
}

function verifyAndBuild(page: PlatformPage, input: ResolveBaseInput, build: Omit<GazettePublication, 'page' | 'head' | 'units' | 'title' | 'titleCheck'>): BaseResult {
  const units = gazetteUnits(page.html);
  if (units.length === 0) return { ok: false, code: 'base-no-text', detail: `${page.url}: Seite ohne HTML-Textkörper (kein OCR)`, urls: [page.url] };
  const head = parsePublicationHead(page.html);
  const dates = headDates(units);
  if (!dates.includes(input.documentDate)) {
    return { ok: false, code: 'base-identity-mismatch', detail: `${page.url} trägt im Kopf das Ausfertigungsdatum ${dates.join(', ') || '–'}, zitiert ist ${input.documentDate}`, urls: [page.url] };
  }
  const title = publicationTitle(units);
  const checks = [input.citedTitle, ...(input.alternativeTitles ?? [])].map((cited) => titleCheck(title, cited));
  const check = checks.find((entry) => entry.consistent) ?? checks[0]!;
  if (!check.consistent) {
    return { ok: false, code: 'base-identity-mismatch', detail: `${page.url}: Titel „${title.slice(0, 120)}“ passt nicht zum zitierten Titel „${input.citedTitle.slice(0, 120)}“ (Wortüberdeckung ${check.overlap}/${check.reverseOverlap})`, urls: [page.url] };
  }
  return { ok: true, publication: { ...build, page, head, units, title, titleCheck: check } };
}

export async function resolveBase(platform: Platform, input: ResolveBaseInput): Promise<BaseResult> {
  const { location } = input;
  const reference = location.reference;
  const urls: string[] = [];
  const misses: string[] = [];
  if (location.availability === 'baymbl-html') {
    for (const volume of location.volumes) {
      const url = baymblDetailUrl(volume, reference.position);
      urls.push(url);
      const page = await platform.get(url);
      if (isPageMiss(page)) {
        if (page.missing !== 'not-found') return { ok: false, code: 'base-not-fetched', detail: `${url}: ${page.detail}`, urls };
        misses.push(url);
        continue;
      }
      const publishedAt = parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(page.html)?.[1] ?? ''))?.[1] ?? '');
      if (!publishedAt) return { ok: false, code: 'base-no-text', detail: `${url}: Verkündungsdatum im Seitenkopf nicht lesbar`, urls };
      const head = parsePublicationHead(page.html);
      const result = verifyAndBuild(page, input, {
        identity: publicationIdentity({ organ: 'BayMBl', volume, position: reference.position }),
        organ: 'BayMBl',
        volume,
        position: reference.position,
        citation: `BayMBl. ${volume} Nr. ${reference.position}`,
        publishedAt,
        authority: 'electronic-official',
        representation: 'official-electronic-edition',
        authorityNote: ELECTRONIC_OFFICIAL_BAYMBL,
        ...(head.pdfPath ? { pdf: { url: `${PLATFORM_ORIGIN}${head.pdfPath}`, ...(head.pdfSha256Published ? { sha256Published: head.pdfSha256Published } : {}) } } : {}),
        listings: [],
      });
      // Bei zwei Kandidatenjahrgängen (Ausfertigung im Dezember) entscheidet allein die Identität.
      if (!result.ok && result.code === 'base-identity-mismatch' && location.volumes.length > 1) {
        misses.push(`${url} (${result.detail})`);
        continue;
      }
      return result;
    }
    return { ok: false, code: 'base-not-found', detail: `Keine Veröffentlichung unter ${misses.join('; ')}`, urls };
  }
  if (location.availability === 'gvbl-html') {
    for (const volume of location.volumes) {
      const url = gvblDetailUrl(volume, reference.position);
      urls.push(url);
      const page = await platform.get(url);
      if (isPageMiss(page)) {
        if (page.missing !== 'not-found') return { ok: false, code: 'base-not-fetched', detail: `${url}: ${page.detail}`, urls };
        misses.push(url);
        continue;
      }
      const head = parsePublicationHead(page.html);
      const label = /aria-label="Link zum PDF ([^"]*)"/u.exec(page.html)?.[1] ?? '';
      const publishedAt = parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(label)?.[1] ?? '');
      if (!publishedAt) return { ok: false, code: 'base-no-text', detail: `${url}: Verkündungsdatum der Ausgabe nicht lesbar`, urls };
      const result = verifyAndBuild(page, input, {
        identity: publicationIdentity({ organ: 'GVBl', volume, position: reference.position }),
        organ: 'GVBl',
        volume,
        position: reference.position,
        citation: `GVBl. ${volume} S. ${reference.position}`,
        publishedAt,
        authority: 'printed-official',
        representation: 'official-platform-informational-copy',
        authorityNote: PRINTED_OFFICIAL_GVBL,
        ...(head.pdfPath ? { pdf: { url: `${PLATFORM_ORIGIN}${head.pdfPath}`, ...(head.pdfSha256Published ? { sha256Published: head.pdfSha256Published } : {}) } } : {}),
        listings: [],
      });
      if (!result.ok && result.code === 'base-identity-mismatch' && location.volumes.length > 1) {
        misses.push(`${url} (${result.detail})`);
        continue;
      }
      return result;
    }
    return { ok: false, code: 'base-pdf-only', detail: `Keine HTML-Detailseite (${misses.join('; ')}); die Verkündung liegt nur als PDF-Ausgabe des GVBl. vor`, urls };
  }
  if (location.availability === 'amtsblatt-html') {
    const journal = reference.organ as MinisterialJournal;
    if (!(journal in MINISTERIAL_JOURNALS)) return { ok: false, code: 'base-not-found', detail: `${reference.organ} ist kein Amtsblatt 2009–2018`, urls };
    for (const volume of location.volumes) {
      const volumeUrl = amtsblattVolumeUrl(journal, volume);
      urls.push(volumeUrl);
      const volumePage = await platform.get(volumeUrl);
      if (isPageMiss(volumePage)) return { ok: false, code: 'base-not-fetched', detail: `${volumeUrl}: ${volumePage.detail}`, urls };
      // Seitenbereiche der Jahrgangsliste sind nicht immer richtig (belegt: „233 - 600“); jede Ausgabe, deren
      // Bereich die Seite enthält, wird geprüft – entscheidend ist das Dokument, das auf der Seite beginnt.
      // Eine Ausgabe, die vor dem Erlass erschien, kann die Vorschrift nicht enthalten.
      const issues = parseAmtsblattVolume(volumePage.html).filter((row) => row.firstPage <= reference.position && reference.position <= row.lastPage && (!input.documentDate || row.publishedAt >= input.documentDate));
      if (issues.length === 0) {
        misses.push(`${volumeUrl}: keine Ausgabe mit Seite ${reference.position}`);
        continue;
      }
      const found: Array<{ issue: (typeof issues)[number]; issuePage: PlatformPage; row: ReturnType<typeof parseAmtsblattIssue>['documents'][number] }> = [];
      for (const issue of issues) {
        const issueUrl = amtsblattIssueUrl(issue.htmlPath);
        urls.push(issueUrl);
        const issuePage = await platform.get(issueUrl);
        if (isPageMiss(issuePage)) return { ok: false, code: 'base-not-fetched', detail: `${issueUrl}: ${issuePage.detail}`, urls };
        for (const row of parseAmtsblattIssue(issuePage.html).documents) if (row.page === reference.position && row.htmlPath) found.push({ issue, issuePage, row });
      }
      // Mehrere Dokumente auf derselben Seite: das mit dem zitierten Erlassdatum, sonst das mit passendem Titel.
      let chosen = found;
      if (chosen.length > 1) chosen = found.filter((entry) => entry.row.enactmentDate === input.documentDate);
      if (chosen.length > 1) {
        // Mehrere Dokumente mit Datum auf derselben Seite: nur eine eindeutig beste Titelüberdeckung entscheidet.
        const scored = chosen.map((entry) => ({ entry, check: titleCheck(entry.row.title, input.citedTitle) })).filter((item) => item.check.consistent);
        const score = (check: TitleCheck): number => Math.max(check.overlap, check.reverseOverlap);
        const best = Math.max(...scored.map((item) => score(item.check)));
        const top = scored.filter((item) => score(item.check) === best);
        chosen = top.length === 1 ? [top[0]!.entry] : top.map((item) => item.entry);
      }
      if (chosen.length !== 1) {
        misses.push(`${volumeUrl}: ${found.length} Dokument(e) beginnen auf Seite ${reference.position}${found.length > 1 ? `, ${chosen.length} davon passen zu Datum und Titel` : ''}`);
        continue;
      }
      const { issue, issuePage, row } = chosen[0]!;
      const url = amtsblattIssueUrl(row.htmlPath!);
      urls.push(url);
      const page = await platform.get(url);
      if (isPageMiss(page)) return { ok: false, code: 'base-not-fetched', detail: `${url}: ${page.detail}`, urls };
      const identity = row.htmlPath!.replace(/^\/amtsblatt\/dokument\//u, '').replace(/\/$/u, '');
      return verifyAndBuild(page, input, {
        identity,
        organ: reference.organ,
        volume,
        position: reference.position,
        issue: issue.issue,
        citation: `${reference.organ}. ${volume} S. ${reference.position}`,
        publishedAt: issue.publishedAt,
        authority: 'electronic-official',
        representation: 'official-electronic-edition',
        authorityNote: ELECTRONIC_OFFICIAL_AMTSBLATT,
        ...(row.pdfPath ? { pdf: { url: `${PLATFORM_ORIGIN}${row.pdfPath}`, ...(row.pdfSha256Published ? { sha256Published: row.pdfSha256Published } : {}), ...(row.pdfPage ? { page: row.pdfPage } : {}) } } : {}),
        listings: [sourceRef(volumePage), sourceRef(issuePage)],
      });
    }
    return { ok: false, code: 'base-not-found', detail: misses.join('; '), urls };
  }
  return { ok: false, code: 'base-not-found', detail: location.reason, urls };
}
