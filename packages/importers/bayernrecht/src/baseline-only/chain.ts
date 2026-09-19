/**
 * Änderungsfolge einer heute fehlenden Norm von ihrer Stammverkündung bis zum Stichtag.
 *
 * **Warum die Änderungsklausel des Aufhebungsbefehls nicht genügt.** Die Redaktionsrichtlinien (RedR,
 * `BayVwV312180`, im Cache gelesen) verlangen das Vollzitat mit „gegebenenfalls die letzte Änderung oder die
 * letzten maßgeblichen Änderungen“ (Nr. 4.1) – verbindlich aber nur für Gesetze, Verordnungen und Satzungen
 * (Nr. 1 Satz 1). Für veröffentlichte Verwaltungsvorschriften gilt Nr. 8: Dort wird lediglich „empfohlen, sich …
 * an den Nrn. 2 bis 5 und 7 zu orientieren“. Ein Aufhebungsbefehl ohne Änderungszusatz ist deshalb für eine
 * Verwaltungsvorschrift ein **Hinweis**, kein Beleg, dass sie nie geändert wurde.
 *
 * **Die Gegenprobe im amtlichen Organ.** Die Gliederungsnummern einer Veröffentlichung genügen dafür nicht:
 * Sammeländerungen tragen oft nur die Nummer der Hauptvorschrift (belegt: BayMBl. 2022 Nr. 766, „Änderung
 * haushaltsrechtlicher Verwaltungsvorschriften“, nur `630-F`, ändert auch die Rückforderungsrichtlinie `6321-F`).
 * Deshalb drei Wege, deren Treffer alle gelesen werden:
 *
 * 1. BayMBl. (ab 2019): **Volltextsuche** nach Ausfertigungsdatum und Fundstelle (`fulltextQuery`) – den Angaben,
 *    ohne die auch `citationsOfBase` kein Zitat anerkennt. Die Suche verknüpft die Wörter mit UND. Sie gilt nur als
 *    belegt, wenn sie jede bekannte zitierende BayMBl.-Seite (Aufhebungsbefehl, Treffer der Gliederungssuche)
 *    ebenfalls findet.
 * 2. BayMBl.: Gliederungssuche (sieht vom Ressortzusatz ab, `2230.1.3` findet `2230.1.3-K`) – Gegenkontrolle.
 * 3. Amtsblätter 2009–2018 (ohne Volltextsuche): **jede** Veröffentlichung aller vier Blätter im Zeitraum, sofern es
 *    höchstens `AMTSBLATT_FULL_READ_CAP` sind; sonst ist die Gegenprobe unvollständig (`chain-amtsblatt-unsearchable`).
 *
 * Zitiert eine gelesene Seite die Norm mit Datum **und** Fundstelle und folgt ein Befehl, ist sie Glied der Kette
 * (Änderung, Berichtigung oder Ende). Änderungsklauseln („die durch … geändert worden ist“) jeder Änderung und des
 * Aufhebungsbefehls müssen auf Glieder der Kette zeigen.
 *
 * **Anwenden.** Eine Änderung vor dem Stichtag wird nur angewandt, wenn ihr Inkrafttreten ein Kalenderdatum hat
 * (`commencement.ts`), jeder Befehl eine unterstützte Formel ist (`formulas.ts`), jeder Ort auflösbar ist
 * (`location.ts`) und der Rundlauf (vorwärts, dann rückwärts) exakt den Ausgangskörper ergibt (`apply.ts`). Alles
 * andere ist `incomplete-chain` mit dem genauen Glied.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { parseListingPage } from '../events/listings.ts';
import { applyBackward, applyForward } from '../reconstruction/apply.ts';
import { commencementFor, datedCommencement, sectionRef } from '../reconstruction/commencement.ts';
import { alignPublicationNoun, ownPublicationDate } from './relative.ts';
import { APPEND_WORDS, DELETE_BLOCKS, FLAT_LETTER_COMMAND, forwardFlatLetters, forwardFlatRecast, REMOVE_NUMBERING, forwardRemoveNumbering, forwardRenumberSentences, forwardAppendWords, forwardBlockRecast, forwardDeleteBlocks, forwardHalfSentenceInsert, forwardDeleteSentence, forwardDeleteWords, splitCombined, forwardRepealSentences, forwardWordingBecomesNumber, WORDING_BECOMES_NUMBER, forwardInsertBlocks, forwardInsertSentence, forwardNumberSentences, forwardRelabel, normalizePreamble, NUMBER_FIRST_SENTENCE, type StructuredResult } from './structured.ts';
import { parseCommand, type FormulaId, type Operation } from '../reconstruction/formulas.ts';
import type { GazetteUnit } from '../reconstruction/gazette.ts';
import { blockAt, formatPath, locateBlock, parseLocation, resolvePath, type FieldRef, type LocationPath, type ResolvedScope } from '../reconstruction/location.ts';
import { stableStringify } from '../reconstruction/recipe.ts';
import { parseStructural, sentenceNumbers } from '../reconstruction/structural.ts';
import { commandLeaves } from '../reconstruction/steps.ts';
import { amendingCitations, commandBlock, isBlockFailure, type NormIdentity } from '../reconstruction/structure.ts';
import { gazetteUnits } from '../reconstruction/gazette.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { htmlToText, parseGermanDate } from '../events/listings.ts';
import { sourceRef, type GazettePublication, type SourceDocumentRef } from './base.ts';
import { addDays, determineEnd, parseCitationTail, type LocatedCitation, type PriorAmendment } from './identity.ts';
import { isPageMiss, parseAmtsblattIssue, parseAmtsblattVolume, parsePublicationHead, type Platform, type PlatformPage } from './platform.ts';
import { amtsblattIssueUrl, amtsblattVolumeUrl, baymblFulltextUrl, baymblGlnrListingUrl, fulltextQueries, fulltextQuery, MINISTERIAL_JOURNALS, PLATFORM_ORIGIN, sameReference, type GazetteReference, type MinisterialJournal } from './references.ts';

const DATE = String.raw`\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}`;
const CALENDAR_DATE = /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+\d{4}/u;

/* ------------------------------------------------------------------ Zitate der Norm auf einer Seite */

export type Relation = 'amends' | 'corrects' | 'ends' | 'mentions';

export interface BaseCitation {
  relation: Relation;
  unitIndex: number;
  text: string;
  /** Bei `ends`: letzter Geltungstag laut Befehl und Inkrafttreten. */
  lastDay?: string;
  /** Änderungen, die das Zitat als bisherige nennt („die zuletzt durch … geändert worden ist“). */
  priorAmendments: PriorAmendment[];
}

/** Zitiert die Seite die Norm (Ausfertigungsdatum **und** Fundstelle) – und mit welchem Befehl? */
export function citationsOfBase(units: readonly GazetteUnit[], base: { documentDate: string; reference: GazetteReference; volume: number }, publishedAt: string): BaseCitation[] {
  const found: BaseCitation[] = [];
  for (const unit of units) {
    for (const match of unit.text.matchAll(new RegExp(String.raw`\bvom\s+(${DATE})`, 'gu'))) {
      if (parseLongGermanDate(match[1]!) !== base.documentDate) continue;
      const tail = parseCitationTail(unit.text.slice(match.index! + match[0].length));
      const primary = tail.fundstelle.primary;
      // Satzfehler ohne „S.“: „vom 7. Juni 2011 (KWMBl. 129)“ (BayMBl. 2023 Nr. 149) – nur mit genau dem Blatt, der Seite
      // und dem Ausfertigungsdatum der Norm.
      const loose = !primary && tail.parenthetical && base.reference.kind === 'page' ? new RegExp(String.raw`^${base.reference.organ}\.?\s*(?:${base.volume}\s*,?\s*)?(\d+)$`, 'u').exec(tail.parenthetical.trim()) : null;
      const matches = primary ? sameReference(primary, base.reference, undefined, base.volume) : loose !== null && Number(loose[1]) === base.reference.position;
      if (!matches) continue;
      const citation: LocatedCitation = { unitIndex: unit.index, unitText: `${unit.label ? `${unit.label} ` : ''}${unit.text}`, citedTitle: unit.text.slice(0, match.index), documentDate: base.documentDate, versionForm: false, ...tail };
      const command = tail.command;
      const text = citation.unitText.slice(0, 400);
      const priorAmendments = tail.priorAmendments;
      if (/^\W*(?:wird|werden)\s+(?:wie\s+folgt\s+)?berichtigt/u.test(command)) {
        found.push({ relation: 'corrects', unitIndex: unit.index, text, priorAmendments });
        continue;
      }
      if (/^\W*(?:wird|werden)\s+(?:wie\s+folgt\s+)?(?:geändert|ergänzt|gefasst)|^\W*(?:erhält|erhalten)\s|^\W*(?:wird|werden)\s[\s\S]{0,200}\b(?:ersetzt|eingefügt|angefügt|gestrichen)\b/u.test(command)) {
        found.push({ relation: 'amends', unitIndex: unit.index, text, priorAmendments });
        continue;
      }
      // Frühere Enden in der Kette: auch relativ zur Veröffentlichung (Listendatum) – hier geht es um das Erkennen eines
      // möglichen früheren Endes, nicht um einen Beleg der Geltung.
      const end = determineEnd(units, citation, publishedAt, publishedAt);
      if (end.ok) {
        found.push({ relation: 'ends', unitIndex: unit.index, text, priorAmendments, ...(end.lastDay ? { lastDay: end.lastDay } : {}) });
        continue;
      }
      found.push({ relation: 'mentions', unitIndex: unit.index, text, priorAmendments });
    }
  }
  return found;
}

/* ------------------------------------------------------------------------------ Gegenprobe */

export interface ExaminedPublication {
  url: string;
  citation: string;
  publishedAt: string;
  title: string;
  sha256?: string;
  relations: Relation[];
}

export interface ChainScan {
  /** Jeder Weg der Gegenprobe vollständig: alle Übersichten und alle Treffer gelesen, Volltextsuche belegt. */
  complete: boolean;
  gliederungsnummern: string[];
  /** Übersichtsseiten der Gegenprobe (Volltext- und Gliederungssuche, Jahrgangslisten, Inhaltsübersichten). */
  listings: SourceDocumentRef[];
  examined: ExaminedPublication[];
  /** Nicht erreichbare Seiten (offline, Budget, Fehler) – dann ist die Gegenprobe unvollständig. */
  missing: string[];
  /** BayMBl.-Volltextsuche (entfällt, wenn der Zeitraum vor 2019 endet). */
  fulltext?: {
    query: string;
    /** Treffer der Suche (alle Jahrgänge, nicht nur der Zeitraum). */
    hits: number;
    /** Die Suche findet jede bekannte zitierende BayMBl.-Seite. */
    verified: boolean;
    /** Zitierende BayMBl.-Seiten, die die Suche nicht findet (dann nicht belegt). */
    unmatched: string[];
  };
  /** Amtsblätter 2009–2018 im Zeitraum: Zahl der Veröffentlichungen und ob jede gelesen wurde. */
  amtsblatt?: { documents: number; fullRead: boolean; withoutHtml: number; issues: number };
  /** Beschreibung des Zeitraums und des Verfahrens (Beleg). */
  method: string;
}

/** Nummernteil einer Gliederungsnummer ohne Ressortzusatz (`2230.1.3-UK` → `2230.1.3`). */
export const glnrStem = (value: string): string => value.replace(/[‐-―−]/gu, '-').replace(/-[A-Za-zÄÖÜäöü]+$/u, '').trim();

/**
 * Höchstzahl der Veröffentlichungen der Amtsblätter 2009–2018, die für eine Norm vollständig gelesen werden (die
 * Blätter haben keine Volltextsuche). Die Seiten sind allen Normen gemeinsam (Cache); die Netzlast begrenzt das
 * Abrufbudget des Laufs. Darüber bleibt die Kette `incomplete-chain`: Das betrifft Normen, deren Zeitraum vor
 * 2016 beginnt und die nicht über die Positivliste als bis 2015 unverändert belegt sind.
 */
export const AMTSBLATT_FULL_READ_CAP = 4000;
/**
 * Vorab-Schranke in Ausgaben (aus den Jahrgangslisten, ohne die Inhaltsübersichten zu holen). Gezählt in Lauf 6:
 * ein Zeitraum ab 28. Dezember 2010 hat 466 Ausgaben (rund 3 100 Veröffentlichungen), ab 1. Juni 2010 500, ab
 * 1. Januar 2010 522, ab 2009 mehr als 569. Die Schranke deckt damit jeden Zeitraum ab 2009; sie hält nur einen
 * fehlerhaften Jahrgang (Datum außerhalb) vom Lesen ab.
 */
export const AMTSBLATT_ISSUE_CAP = 640;

const detailUrlOf = (path: string): string => `${PLATFORM_ORIGIN}${path}`;

/** Veröffentlichungsdatum einer BayMBl.-/GVBl.-Detailseite (Seitenkopf). */
export function detailPublishedAt(html: string): string | undefined {
  const headline = htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1] ?? '');
  return parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(headline)?.[1] ?? '');
}

/**
 * Veröffentlichungsdatum einer BayMBl.-Verkündung laut **Register der Plattform**: ihre Zeile in der Gliederungssuche
 * (`?referencenumber=`, absteigend nach Datum). Dieselben Seiten liest die Gegenprobe (`scanChain`), sie sind geteilt.
 * Dient als Gegenstück zum Seitenkopf der Verkündung selbst, wenn ein Inkrafttreten relativ zur Veröffentlichung ist.
 */
export async function baymblListedDate(platform: Platform, base: Pick<GazettePublication, 'page' | 'head' | 'publishedAt'>): Promise<{ date?: string; listing?: SourceDocumentRef; missing?: string }> {
  const stems = [...new Set(base.head.gliederungsnummern.map(glnrStem))].sort();
  for (const stem of stems) {
    for (let offset = 0; ; offset += 50) {
      const url = baymblGlnrListingUrl(stem, offset);
      const page = await platform.get(url);
      if (isPageMiss(page)) return { missing: url };
      const parsed = parseListingPage(page.html);
      const row = parsed.rows.find((entry) => entry.detailPath && detailUrlOf(entry.detailPath) === base.page.url);
      if (row?.publishedAt) return { date: row.publishedAt, listing: sourceRef(page) };
      const oldest = parsed.rows.at(-1)?.publishedAt;
      if (parsed.rows.length < 50 || parsed.totalHits === undefined || offset + 50 >= parsed.totalHits || (oldest !== undefined && oldest < base.publishedAt)) break;
    }
  }
  return {};
}

export type ChainPages = Map<string, { page: PlatformPage; units: GazetteUnit[]; publishedAt: string; citation: string; citations: BaseCitation[] }>;

type Candidate = { url: string; citation: string; publishedAt: string; title: string };

/**
 * Durchsucht eine absteigend nach Datum sortierte BayMBl.-Trefferliste seitenweise bis vor die Verkündung der Norm.
 * Liefert alle Treffer-Adressen (für die Belegprüfung) und die im Zeitraum.
 */
async function scanBaymblListing(platform: Platform, urlOf: (offset: number) => string, base: GazettePublication, from: string, until: string, listings: SourceDocumentRef[], missing: string[]): Promise<{ hits: Set<string>; total: number; inWindow: Candidate[] }> {
  const hits = new Set<string>();
  const inWindow: Candidate[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    const url = urlOf(offset);
    const page = await platform.get(url);
    if (isPageMiss(page)) {
      missing.push(url);
      break;
    }
    listings.push(sourceRef(page));
    const parsed = parseListingPage(page.html);
    total = parsed.totalHits ?? parsed.rows.length;
    for (const row of parsed.rows) {
      if (!row.detailPath) continue;
      const detail = detailUrlOf(row.detailPath);
      hits.add(detail);
      if (!row.publishedAt || row.publishedAt <= from || row.publishedAt > until || detail === base.page.url) continue;
      inWindow.push({ url: detail, citation: `BayMBl. ${row.volume} Nr. ${row.position}`, publishedAt: row.publishedAt, title: row.title });
    }
    offset += 50;
    // Absteigend sortiert: Sobald eine Seite nur noch Älteres führt als die Norm, ist die Suche am Ende.
    const oldest = parsed.rows.at(-1)?.publishedAt;
    if (parsed.rows.length < 50 || parsed.totalHits === undefined || offset >= parsed.totalHits || (oldest !== undefined && oldest < from)) break;
  }
  return { hits, total, inWindow };
}

/**
 * Gegenprobe zwischen der Verkündung der Norm und `until` (Verkündung des Aufhebungsbefehls). Liest jede
 * Treffer-Seite; Übersichtsseiten und Einzelseiten kommen aus dem Cache oder werden – im Budget – einmal geholt.
 * `anchors`: Seiten, die die Norm bekanntermaßen zitieren (Aufhebungsbefehle) – die Volltextsuche muss sie finden.
 */
export async function scanChain(platform: Platform, base: GazettePublication, documentDate: string, reference: GazetteReference, until: string, anchors: readonly string[] = [], windowStart?: string): Promise<{ scan: ChainScan; pages: ChainPages }> {
  /** Beginn des Zeitraums: die Verkündung der Norm, bei belegter Unverändertheit bis zu einem Stand dieser Stand. */
  const from = windowStart ?? base.publishedAt;
  const listings: SourceDocumentRef[] = [];
  const missing: string[] = [];
  const examined: ExaminedPublication[] = [];
  const pages: ChainPages = new Map();
  const stems = [...new Set(base.head.gliederungsnummern.map(glnrStem))].sort();
  const candidates = new Map<string, Candidate>();
  const methods: string[] = [];

  // 1 – BayMBl. (ab 2019): Volltextsuche nach Ausfertigungsdatum und Fundstelle.
  let fulltext: ChainScan['fulltext'];
  let fulltextHits: Set<string> | undefined;
  if (until >= '2019-01-01') {
    // Beim AllMBl. beide Schreibweisen („AIIMBl.“), Treffer vereinigt.
    const queries = fulltextQueries(documentDate, reference);
    fulltextHits = new Set<string>();
    let total = 0;
    for (const query of queries) {
      const result = await scanBaymblListing(platform, (offset) => baymblFulltextUrl(query, offset), base, from, until, listings, missing);
      for (const candidate of result.inWindow) if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
      for (const hit of result.hits) fulltextHits.add(hit);
      total += result.total;
      methods.push(`BayMBl.-Volltextsuche „${query}“ (${result.total} Treffer, ${result.inWindow.length} im Zeitraum)`);
    }
    fulltext = { query: queries.join('“ und „'), hits: total, verified: false, unmatched: [] };
  }

  // 2 – BayMBl.: Gliederungssuche (Gegenkontrolle).
  for (const stem of stems) {
    const result = await scanBaymblListing(platform, (offset) => baymblGlnrListingUrl(stem, offset), base, from, until, listings, missing);
    for (const candidate of result.inWindow) if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
  }
  if (stems.length > 0) methods.push(`BayMBl.-Gliederungssuche ${stems.join(', ')}`);

  // 3 – Amts- und Ministerialblätter 2009–2018 (vor dem BayMBl.): jede Veröffentlichung im Zeitraum.
  let amtsblatt: ChainScan['amtsblatt'];
  if (from < '2019-01-01') {
    const firstYear = Math.max(Number(from.slice(0, 4)), 2009);
    const windowIssues: Array<{ journal: MinisterialJournal; year: number; issue: ReturnType<typeof parseAmtsblattVolume>[number] }> = [];
    const missingVolumes: string[] = [];
    // Jüngste Jahrgänge zuerst: Überschreitet schon deren Zahl der Ausgaben die Schranke, sind ältere entbehrlich.
    for (let year = 2018; year >= firstYear && windowIssues.length <= AMTSBLATT_ISSUE_CAP; year -= 1) {
      for (const journal of Object.keys(MINISTERIAL_JOURNALS) as MinisterialJournal[]) {
        const url = amtsblattVolumeUrl(journal, year);
        const volumePage = await platform.get(url);
        if (isPageMiss(volumePage)) {
          missingVolumes.push(url);
          continue;
        }
        listings.push(sourceRef(volumePage));
        for (const issue of parseAmtsblattVolume(volumePage.html)) if (issue.publishedAt >= from && issue.publishedAt <= until) windowIssues.push({ journal, year, issue });
      }
    }
    windowIssues.sort((left, right) => (left.issue.publishedAt < right.issue.publishedAt ? -1 : left.issue.publishedAt > right.issue.publishedAt ? 1 : left.journal < right.journal ? -1 : left.journal > right.journal ? 1 : left.issue.issue - right.issue.issue));
    if (windowIssues.length <= AMTSBLATT_ISSUE_CAP) missing.push(...missingVolumes);
    if (windowIssues.length > AMTSBLATT_ISSUE_CAP) {
      // Die Inhaltsübersichten werden gar nicht erst geholt: Der Zeitraum ist für einen Lauf zu groß.
      amtsblatt = { documents: 0, fullRead: false, withoutHtml: 0, issues: windowIssues.length };
      methods.push(`AllMBl., FMBl., JMBl. und KWMBl. bis 2018: schon ${windowIssues.length} Ausgaben in den jüngsten Jahrgängen des Zeitraums – mehr als ${AMTSBLATT_ISSUE_CAP}, nicht gelesen`);
    } else {
      const windowDocs: Array<Candidate & { gliederungsnummern: string[]; hasHtml: boolean }> = [];
      for (const { journal, year, issue } of windowIssues) {
        const issueUrl = amtsblattIssueUrl(issue.htmlPath);
        const issuePage = await platform.get(issueUrl);
        if (isPageMiss(issuePage)) {
          missing.push(issueUrl);
          continue;
        }
        listings.push(sourceRef(issuePage));
        for (const row of parseAmtsblattIssue(issuePage.html).documents) {
          const detail = row.htmlPath ? detailUrlOf(row.htmlPath) : `${issueUrl}#S${row.page}`;
          if (detail === base.page.url) continue;
          windowDocs.push({ url: detail, citation: `${journal}. ${year} S. ${row.page}`, publishedAt: issue.publishedAt, title: row.title, gliederungsnummern: row.gliederungsnummern, hasHtml: Boolean(row.htmlPath) });
        }
      }
      const fullRead = windowDocs.length <= AMTSBLATT_FULL_READ_CAP && windowDocs.every((doc) => doc.hasHtml);
      const selected = fullRead ? windowDocs : windowDocs.filter((doc) => doc.hasHtml && doc.gliederungsnummern.some((value) => stems.includes(glnrStem(value))));
      for (const doc of selected) candidates.set(doc.url, { url: doc.url, citation: doc.citation, publishedAt: doc.publishedAt, title: doc.title });
      amtsblatt = { documents: windowDocs.length, fullRead, withoutHtml: windowDocs.filter((doc) => !doc.hasHtml).length, issues: windowIssues.length };
      methods.push(fullRead ? `AllMBl., FMBl., JMBl. und KWMBl. bis 2018: alle ${windowDocs.length} Veröffentlichungen aus ${windowIssues.length} Ausgaben im Zeitraum` : `AllMBl., FMBl., JMBl. und KWMBl. bis 2018: nur Gliederungsnummern (${windowDocs.length} Veröffentlichungen im Zeitraum, Obergrenze für das vollständige Lesen ${AMTSBLATT_FULL_READ_CAP}${amtsblatt.withoutHtml > 0 ? `, ${amtsblatt.withoutHtml} ohne HTML` : ''})`);
    }
  }

  // 4 – Jede Veröffentlichung lesen.
  const examine = async (candidate: Candidate): Promise<void> => {
    const page = await platform.get(candidate.url);
    if (isPageMiss(page)) {
      missing.push(candidate.url);
      return;
    }
    const units = gazetteUnits(page.html);
    const citations = citationsOfBase(units, { documentDate, reference, volume: base.volume }, candidate.publishedAt);
    examined.push({ url: candidate.url, citation: candidate.citation, publishedAt: candidate.publishedAt, title: candidate.title, sha256: page.sha256, relations: [...new Set(citations.map((entry) => entry.relation))].sort() as Relation[] });
    if (citations.length > 0) pages.set(candidate.url, { page, units, publishedAt: candidate.publishedAt, citation: candidate.citation, citations });
  };
  const byDate = (left: Candidate, right: Candidate): number => (left.publishedAt < right.publishedAt ? -1 : left.publishedAt > right.publishedAt ? 1 : left.url < right.url ? -1 : 1);
  for (const candidate of [...candidates.values()].sort(byDate)) await examine(candidate);

  // 5 – Beleg der Volltextsuche: Sie muss jede bekannte zitierende BayMBl.-Seite finden.
  const verify = (): void => {
    if (!fulltext || !fulltextHits) return;
    const known = new Set([...anchors.filter((url) => url.includes('/baymbl/')), ...examined.filter((entry) => entry.relations.length > 0 && entry.url.includes('/baymbl/')).map((entry) => entry.url)]);
    fulltext.unmatched = [...known].filter((url) => !fulltextHits!.has(url)).sort();
    fulltext.verified = known.size > 0 && fulltext.unmatched.length === 0;
  };
  verify();
  // Nicht belegt, weil eine zitierende Seite die Fundstelle ohne „S.“ setzt („(KWMBl. 129)“, BayMBl. 2023 Nr. 149): noch
  // eine Suche in dieser Schreibweise, Treffer vereinigt, neue Treffer im Zeitraum werden gelesen. Nur dann – Rezepte, deren
  // Suche schon belegt ist, bleiben unverändert.
  if (fulltext && fulltextHits && !fulltext.verified && fulltext.unmatched.length > 0 && reference.kind === 'page') {
    const query = fulltextQuery(documentDate, reference).replace(/\s+S\.\s+(\d+)$/u, ' $1');
    const result = await scanBaymblListing(platform, (offset) => baymblFulltextUrl(query, offset), base, from, until, listings, missing);
    for (const hit of result.hits) fulltextHits.add(hit);
    fulltext.hits += result.total;
    fulltext.query = `${fulltext.query}“ und „${query}`;
    methods.push(`BayMBl.-Volltextsuche „${query}“ (${result.total} Treffer, ${result.inWindow.length} im Zeitraum; Fundstelle ohne „S.“)`);
    const fresh = result.inWindow.filter((candidate) => !candidates.has(candidate.url));
    for (const candidate of fresh) candidates.set(candidate.url, candidate);
    for (const candidate of fresh.sort(byDate)) await examine(candidate);
    verify();
  }

  const complete = missing.length === 0 && (fulltext === undefined || fulltext.verified) && (amtsblatt === undefined || amtsblatt.fullRead);
  const method = `${methods.join('; ') || '–'}; Veröffentlichungen vom ${from} (ausschließlich) bis ${until}; ${examined.length} Seite(n) gelesen, ${examined.filter((entry) => entry.relations.length > 0).length} zitieren die Norm`;
  return { scan: { complete, gliederungsnummern: stems, listings, examined, missing, ...(fulltext ? { fulltext } : {}), ...(amtsblatt ? { amtsblatt } : {}), method }, pages };
}

/* -------------------------------------------------------------------------------- Anwenden */

export interface ForwardStep {
  id: string;
  command: string;
  formula: FormulaId;
  location: string;
  scope: ResolvedScope;
  operation: Operation;
}

/** „In der Überschrift wird die Angabe „2020“ durch die Angabe „2021“ ersetzt.“ – an der Überschrift der Norm selbst. */
export interface TitleChange {
  id: string;
  command: string;
  formula: FormulaId;
  before: string;
  after: string;
}

/**
 * Wendet einen Wortlautbefehl an der Überschrift der Norm an – mit denselben Regeln wie im Körper (`applyForward` an
 * einem Feld, das nur die Überschrift trägt). Die Überschrift gehört zu den Metadaten, nicht zum Körper.
 */
export function applyToTitle(title: string, operation: Operation, id: string): string {
  const holder: NormBodyBlock[] = [{ type: 'paragraphText', text: title }];
  applyForward(holder, { fields: [{ path: [0], key: 'text' }], resolved: ['Überschrift der Norm'], widened: [] }, operation, id);
  return String(holder[0]!.text);
}

export interface AppliedAmendment {
  ok: boolean;
  /** Inkrafttreten der Änderung für die Norm (spätestes Datum, wenn Teile abweichen). */
  effectiveDate?: string;
  effectiveDates: string[];
  effectiveEvidence: string[];
  steps: ForwardStep[];
  after?: NormBodyBlock[];
  /** Änderungen der Überschrift der Norm selbst (Metadatum, nicht im Körper): Wortlaut davor und danach. */
  titleChanges?: TitleChange[];
  reason?: string;
  /** Genaues Glied für den Review (`amendment-formula-unsupported` …). */
  code?: 'amendment-block-unreadable' | 'amendment-commencement-undetermined' | 'amendment-formula-unsupported' | 'amendment-target-unresolved' | 'amendment-round-trip-failed';
}

/** Identität der Norm für `commandBlock`: Titel, Abkürzung, Ausfertigung, Fundstelle mit und ohne Jahrgang. */
export function normIdentityOf(base: GazettePublication, documentDate: string, reference: GazetteReference, abbreviation?: string): NormIdentity {
  const kind = reference.kind === 'number' ? 'Nr.' : 'S.';
  return {
    documentId: base.identity,
    title: base.title,
    abbreviations: abbreviation ? [abbreviation] : [],
    documentDate,
    references: [
      `${reference.organ}. ${base.volume} ${kind} ${reference.position}`,
      `${reference.organ}. ${kind} ${reference.position}`,
      // „(AIIMBl. S. 332)“ (BayMBl. 2021 Nr. 19 und Nr. 649): belegte Schreibweise des AllMBl. in Zitaten.
      ...(reference.organ === 'AllMBl' ? [`AIIMBl. ${base.volume} ${kind} ${reference.position}`, `AIIMBl. ${kind} ${reference.position}`] : []),
    ],
  };
}

/** Inkrafttreten einer Änderung für die Norm – nur mit Kalenderdatum. */
export function amendmentCommencement(
  units: readonly GazetteUnit[],
  publishedAt: string,
  section: string | undefined,
  own?: { html: string; organ: string; url: string },
): Pick<AppliedAmendment, 'effectiveDate' | 'effectiveDates' | 'effectiveEvidence' | 'reason' | 'ok'> {
  const mantel = amendingCitations(units).length > 1;
  const aligned = units.map((unit) => ({ ...unit, text: alignPublicationNoun(unit.text) }));
  const result = commencementFor(aligned, publishedAt, section, mantel);
  if (!result.ok) return { ok: false, effectiveDates: [], effectiveEvidence: [], reason: result.reason };
  const relative = result.applicable.find((statement) => /[Vv]erkünd|[Vv]eröffentlich|Tag\s+nach/u.test(statement.text) || !CALENDAR_DATE.test(statement.text));
  if (!relative) return { ok: true, effectiveDate: result.dates.at(-1)!, effectiveDates: result.dates, effectiveEvidence: result.applicable.map((statement) => statement.text) };
  // Relativ zur Verkündung (Lauf 7): nur mit dem Veröffentlichungsdatum der Verkündung selbst, gleich dem Register
  // (`publishedAt` stammt aus der Trefferliste bzw. Inhaltsübersicht) – `commencement.ts#datedCommencement`.
  if (!own) return { ok: false, effectiveDates: result.dates, effectiveEvidence: result.applicable.map((statement) => statement.text), reason: `Inkrafttreten ohne Kalenderdatum: „${relative.text.slice(0, 160)}“` };
  const ownDate = ownPublicationDate(own.html, own.organ);
  const dated = datedCommencement(aligned, section, mantel, { ...(ownDate ? { publishedAt: ownDate } : {}), registerDate: publishedAt, url: own.url });
  if (!dated.ok) return { ok: false, effectiveDates: [], effectiveEvidence: result.applicable.map((statement) => statement.text), reason: `Inkrafttreten relativ zur Verkündung („${relative.text.slice(0, 120)}“): ${dated.reason}` };
  return { ok: true, effectiveDate: dated.dates.at(-1)!, effectiveDates: dated.dates, effectiveEvidence: dated.evidence };
}

/**
 * Wendet eine Änderung **vorwärts** auf den Körper vor ihr an. Nur Wortlautformeln (`replace-words`,
 * `insert-words`, `delete-words-anchored`, `append-words`, `replace-final-punctuation`); jeder Ort wird im Körper vor
 * der Änderung aufgelöst, jeder zu ändernde Wortlaut muss dort genau einmal stehen. Rundlauf: rückwärts ergibt sich
 * wieder exakt der Ausgangskörper.
 */
/**
 * Ältere Befehle sagen „die Worte „A“ durch die Worte „B““ (KWMBl. 2015 S. 18 und S. 121) – dieselbe Formel wie „die
 * Wörter“; „der Klammerzusatz „(A)“ durch den Klammerzusatz „(B)““ (BayMBl. 2019 Nr. 423) ist eine Angabe. Nur der
 * Befehlstext außerhalb der Anführungszeichen wird angeglichen; der zitierte Wortlaut bleibt, wie er ist.
 */
export function commandWording(text: string): string {
  // „… werden nach dem Wort „Kollegs“ die Wörter „im achtjährigen Gymnasium“ angefügt“ (BayMBl. 2023 Nr. 149): hinter
  // einem Wort ist „angefügt“ dasselbe wie „eingefügt“.
  // „nach dem Wort „Wörterbücher“ im ersten Halbsatz werden …“: Die Halbsatzangabe grenzt nur ein; ohne sie muss der Anker
  // im ganzen Bereich genau einmal stehen (`applyForward` prüft das) – dann ist es derselbe.
  const anchored = repairCommandVerb(text)
    .replace(/(\bnach\s+(?:dem\s+Wort|den\s+Wörtern|der\s+Angabe)\s+„[^„“”]*[“”]\s+(?:das\s+Wort|die\s+Wörter|die\s+Angabe)\s+„[^„“”]*[“”]\s+)angefügt\b/gu, '$1eingefügt')
    // „Der Überschrift der Bekanntmachung werden die Wörter „…“ angefügt.“ (BayMBl. 2022 Nr. 533): die Überschrift der Norm.
    .replace(/^(Der|In\s+der)\s+Überschrift\s+der\s+(?:Bekanntmachung|Richtlinien?|Verwaltungsvorschrift)\b/u, '$1 Überschrift')
    // „In Nr. 5 werden am Ende die Wörter „…“ angefügt.“ – angefügt wird immer am Ende.
    .replace(/\b(werden|wird)\s+am\s+Ende\s+((?:das\s+Wort|die\s+Wörter|die\s+Angabe)\s+„[^„“”]*[“”]\s+angefügt)/gu, '$1 $2')
    .replace(/(\b(?:[Nn]ach|[Vv]or)\s+(?:dem\s+Wort|den\s+Wörtern|der\s+Angabe)\s+„[^„“”]*[“”])\s+im\s+(?:ersten|zweiten|dritten|letzten)\s+Halbsatz(?=\s+(?:wird|werden)\b)/gu, '$1');
  return expandNumberRanges(anchored).replace(/(„[^„“”]*[“”])|(?<![\p{L}])(Worte|(?:der|den|dem)\s+Klammerzusatz)(?![\p{L}])/gu, (match, quoted: string | undefined, word: string | undefined) => quoted ?? (word === 'Worte' ? 'Wörter' : 'die Angabe'));
}

/**
 * „In Nr. 4.2 Satz 4 …“: Hat das Glied mehrere Textfelder (eigener Text und Unterglieder), setzt `resolvePath` keine
 * Satzeingrenzung. Trägt genau ein Textfeld die Satznummer, ist der Bereich dieses Feld und dieser Satz.
 */
export function narrowToSentence(body: readonly NormBodyBlock[], path: LocationPath, scope: ResolvedScope): ResolvedScope {
  const last = path.at(-1);
  // Glied mit Überschriftzeile („5. Leistungsnachweise“) und genau einem unbezeichneten Absatz: Der Wortlaut ist der Absatz.
  if (scope.sentence === undefined && last?.kind !== 'satz' && scope.fields.length === 2) {
    const [own, child] = scope.fields as [FieldRef, FieldRef];
    const block = blockAt(body, own.path);
    const paragraph = blockAt(body, child.path);
    const headingLike = own.key === 'text' && child.key === 'text' && block && typeof block.title !== 'string' && typeof block.text === 'string' && block.text.length <= 160 && !/[.!?:;]$/u.test(block.text.trim());
    if (headingLike && block.children?.length === 1 && paragraph?.type === 'paragraphText' && !paragraph.label && child.path.slice(0, -1).join(',') === own.path.join(',')) return { ...scope, fields: [child] };
    return scope;
  }
  if (scope.sentence !== undefined || last?.kind !== 'satz' || scope.fields.length < 2) return scope;
  const number = Number(last.value);
  if (!Number.isInteger(number)) return scope;
  const holders = scope.fields.filter((field) => field.key === 'text' && sentenceNumbers(String(blockAt(body, field.path)?.text ?? '')).some((marker) => marker.value === number));
  return holders.length === 1 ? { ...scope, fields: holders, sentence: number } : scope;
}

/**
 * „In der Überschrift werden nach dem Wort „Antragsfrist“ …“ (BayMBl. 2019 Nr. 423 zu Nr. 6.4): Amtsblattseiten setzen
 * Zwischenüberschriften als nummerierte Zeile („6.4 Antragsfrist“), der Umsetzer führt sie als Text des Glieds, der
 * Wortlaut steht in den Untergliedern. Nur dann ist dieser Text die Überschrift: Glied ohne `title`, mit Untergliedern,
 * kurzer Text ohne Satzende.
 */
export function headingScope(body: readonly NormBodyBlock[], path: LocationPath): ResolvedScope | undefined {
  if (path.at(-1)?.kind !== 'ueberschrift') return undefined;
  const owner = locateBlock(body, path.slice(0, -1));
  if (!owner.ok || owner.path.length === 0) return undefined;
  const block = blockAt(body, owner.path)!;
  const text = typeof block.text === 'string' ? block.text : undefined;
  if (typeof block.title === 'string' || text === undefined || !(block.children && block.children.length > 0) || text.length > 160 || /[.!?:;]$/u.test(text.trim())) return undefined;
  return { fields: [{ path: owner.path, key: 'text' }], resolved: [...owner.resolved, `${formatPath(path.slice(-1))} (Überschriftzeile als Text des Glieds)`], widened: owner.widened };
}

/**
 * „In Nrn. 1.17 bis 1.20 wird jeweils …“ (BayMBl. 2022 Nr. 395): `parseLocation` liest Bereiche dezimaler Nummern nicht.
 * Ein Bereich mit gleichem Präfix wird zur Aufzählung „Nrn. 1.17, 1.18, 1.19 und 1.20“ – nur außerhalb von Zitaten und
 * nur bis zu 30 Gliedern.
 */
export function expandNumberRanges(text: string): string {
  return text.replace(/(„[^„“”]*[“”])|\b(Nrn\.|Nummern)\s*((?:\d+\.)*)(\d+)\s+bis\s+((?:\d+\.)*)(\d+)(?![\d.]*\d)/gu, (match, quoted: string | undefined, word: string, prefix: string, from: string, prefixTo: string, to: string) => {
    if (quoted !== undefined) return quoted;
    const first = Number(from);
    const last = Number(to);
    if (prefix !== prefixTo || last <= first || last - first > 30) return match;
    const values = Array.from({ length: last - first + 1 }, (_, index) => `${prefix}${first + index}`);
    return `${word} ${values.slice(0, -1).join(', ')} und ${values.at(-1)}`;
  });
}

/** „wir angefügt“ → „wird angefügt“: Ein Befehl hat nie „wir“ zum Subjekt; nur vor einem Befehlsverb. */
export function repairCommandVerb(text: string): string {
  return text.replace(/(„[^„“”]*[“”])|\bwir\s+(angefügt|eingefügt|ersetzt|gestrichen|aufgehoben|gefasst|vorangestellt)\b/gu, (match, quoted: string | undefined, verb: string | undefined) => quoted ?? `wird ${verb!}`);
}

/** „Folgende Nr. 1.43.2 wird angefügt „1.43.2 …““ – Anfügen mit dem Zitat im selben Absatz, ohne Doppelpunkt. */
const INLINE_APPEND = /^Folgende\s+Nr\.\s*([\d.]+?)\s+wird\s+angefügt:?\s*„(\d+(?:\.\d+)*)\.?\s+([^„“”]+)[“”]\.?$/u;

/**
 * „In Nr. 5.3 Satz 1 und Satz 2 wird jeweils …“ (BayMBl. 2019 Nr. 423): `parseCommand` liefert den zweiten Ort ohne das
 * Glied („Satz 2“ des ganzen Körpers). Ein Ort, der nur aus Satzangaben besteht, erbt das Glied des ersten Orts.
 */
export function inheritLocations(locations: readonly LocationPath[]): LocationPath[] {
  const first = locations[0];
  if (!first) return [];
  const prefix = first.filter((step) => step.kind !== 'satz' && step.kind !== 'halbsatz');
  // „Nr. 7 wird wie folgt geändert: In Nr. 7 Satz 1 …“ – der Unterbefehl wiederholt das Glied des Einleitungssatzes.
  const collapse = (path: LocationPath): LocationPath => path.filter((step, index) => index === 0 || step.kind !== path[index - 1]!.kind || step.value !== path[index - 1]!.value || step.kind === 'satz');
  return locations.map((path, index) => collapse(index > 0 && prefix.length > 0 && path.length > 0 && path.every((step) => step.kind === 'satz' || step.kind === 'halbsatz') ? [...prefix, ...path] : path));
}

export function applyAmendment(before: readonly NormBodyBlock[], units: readonly GazetteUnit[], identity: NormIdentity, idPrefix: string, title?: string): Omit<AppliedAmendment, 'effectiveDate' | 'effectiveDates' | 'effectiveEvidence'> & { section?: string; intro?: string; title?: string } {
  const block = commandBlock(units, identity);
  if (isBlockFailure(block)) return { ok: false, steps: [], code: 'amendment-block-unreadable', reason: `${block.code}: ${block.detail}` };
  const section = sectionRef(block.section, block.intro.label);
  const { leaves, failures } = commandLeaves(block);
  if (failures.length > 0) return { ok: false, steps: [], code: 'amendment-block-unreadable', reason: failures[0]!, ...(section ? { section } : {}), intro: block.intro.text };
  const body = structuredClone(before) as NormBodyBlock[];
  const steps: ForwardStep[] = [];
  // Glieder, die diese Änderung eingefügt hat („die bisherige Nr. 2“ ist keines davon), und Bezeichnungen, die ein
  // späterer Befehl derselben Änderung als „bisherige“ umnummeriert (dann darf eine Einfügung sie vorübergehend doppeln).
  const inserted = new Set<NormBodyBlock>();
  let currentTitle = title;
  // Von dieser Änderung eingefügte Sätze je Feld („Die bisherigen Sätze …“ meint sie nicht).
  const insertedSentences = new Map<string, Set<number>>();
  const titleChanges: TitleChange[] = [];
  const relabelledAfter = (position: number): Set<string> => new Set(leaves.slice(position + 1).flatMap((later) => {
    const template = later.structural?.templates?.[0];
    return template?.kind === 'relabel' && /\bbisherige[nr]?\b/u.test(later.node.text) ? template.pairs.map(([from]) => from.value) : [];
  }));
  const numberedExplicitly = (context: LocationPath): boolean => leaves.some((other) => (other.structural?.templates?.[0]?.kind === 'number-sentences' || NUMBER_FIRST_SENTENCE.test(other.node.text.trim())) && formatPath(other.context.flat()) === formatPath(context));
  const fail = (code: NonNullable<AppliedAmendment['code']>, reason: string) => ({ ok: false as const, steps, code, reason, ...(section ? { section } : {}), intro: block.intro.text });
  for (const [position, leaf] of leaves.entries()) {
    // Wortlautformeln: jeder Ort im Körper vor der Änderung aufgelöst; „Satz N“ in einem Glied mit mehreren Textfeldern
    // meint das eine Feld, das die Satznummer N trägt.
    const applyParsed = (operations: NonNullable<ReturnType<typeof parseCommand>['operations']>): { ok: true } | { ok: false; code: NonNullable<AppliedAmendment['code']>; reason: string } => {
      for (const operation of operations) {
        for (const path of inheritLocations(operation.locations)) {
          let resolved = resolvePath(body, path);
          if (!resolved.ok) {
            const heading = headingScope(body, path);
            if (heading) resolved = { ok: true, scope: heading };
          }
          if (!resolved.ok) return { ok: false, code: 'amendment-target-unresolved', reason: `${formatPath(path)}: ${resolved.reason} („${leaf.command.slice(0, 160)}“)` };
          let scope = resolved.scope;
          const id = `${idPrefix}s${String(steps.length + 1).padStart(2, '0')}`;
          // Erst ohne, dann mit Satzeingrenzung über die Felder – die zweite, wenn die erste vorwärts scheitert oder
          // rückwärts nicht genau den Körper davor ergibt. Rezepte, die ohne sie aufgehen, bleiben unverändert.
          const snapshot = structuredClone(body) as NormBodyBlock[];
          const attempt = (candidate: ResolvedScope): string | undefined => {
            try {
              applyForward(body, candidate, operation.operation, id);
              const probe = structuredClone(body) as NormBodyBlock[];
              applyBackward(probe, candidate, operation.operation, id);
              if (stableStringify(probe) !== stableStringify(snapshot)) return 'rückwärts nicht eindeutig';
              return undefined;
            } catch (error) {
              return (error as Error).message;
            }
          };
          const restore = (): void => {
            body.splice(0, body.length, ...(structuredClone(snapshot) as NormBodyBlock[]));
          };
          const first = attempt(scope);
          if (first !== undefined) {
            restore();
            const narrowed = narrowToSentence(body, path, resolved.scope);
            if (narrowed === resolved.scope) return { ok: false, code: 'amendment-target-unresolved', reason: `${id}: ${first}` };
            const second = attempt(narrowed);
            if (second !== undefined) {
              restore();
              return { ok: false, code: 'amendment-target-unresolved', reason: `${id}: ${first}; mit Satzeingrenzung: ${second}` };
            }
            scope = narrowed;
          }
          steps.push({ id, command: leaf.command, formula: operation.formula, location: formatPath(path), scope, operation: operation.operation });
        }
      }
      return { ok: true };
    };
    /** Weiterer Befehl im selben Satz („… und die Angabe „2019“ wird durch die Angabe „2020“ ersetzt.“). */
    const followUp = (text: string, context: LocationPath): { ok: true } | { ok: false; reason: string } => {
      const parsed = parseCommand(commandWording(text), [context]);
      if (!parsed.operations) {
        // Mehrere weitere Befehle: einzeln („… wird durch … ersetzt und die Wörter „…“ werden gestrichen“).
        const parts = splitCombined(text);
        if (!parts) return { ok: false, reason: `weiterer Befehl „${text.slice(0, 120)}“: ${parsed.formulas.join('+')} ${parsed.reason ?? ''}` };
        for (const part of parts) {
          const partParsed = parseCommand(commandWording(part), [context]);
          if (partParsed.operations) {
            const applied = applyParsed(partParsed.operations);
            if (!applied.ok) return { ok: false, reason: applied.reason };
            continue;
          }
          const alone = /gestrichen\.?$/u.test(part) ? forwardDeleteWords(body, part, [context]) : { error: `${partParsed.formulas.join('+')} ${partParsed.reason ?? ''}` };
          if ('error' in alone) return { ok: false, reason: `weiterer Befehl „${part.slice(0, 120)}“: ${alone.error}` };
          const ran = run(alone.steps);
          if (!ran.ok) return ran;
        }
        return { ok: true };
      }
      const applied = applyParsed(parsed.operations);
      return applied.ok ? applied : { ok: false, reason: applied.reason };
    };
    const run = (forward: Array<{ scope: ResolvedScope; operation: Operation; location: string; formula: FormulaId }>): { ok: true } | { ok: false; reason: string } => {
      for (const step of forward) {
        const id = `${idPrefix}s${String(steps.length + 1).padStart(2, '0')}`;
        try {
          applyForward(body, step.scope, step.operation, id);
        } catch (error) {
          return { ok: false, reason: `${id}: ${(error as Error).message}` };
        }
        if (step.operation.kind === 'insert-sentence' && step.scope.fields.length === 1) {
          const field = step.scope.fields[0]!;
          const key = `${field.path.join(',')}:${field.key}`;
          const set = insertedSentences.get(key) ?? new Set<number>();
          for (const marker of sentenceNumbers(step.operation.text)) set.add(marker.value);
          insertedSentences.set(key, set);
        }
        if (step.operation.kind === 'replace-blocks') {
          const siblings = step.operation.parent.length === 0 ? body : blockAt(body, step.operation.parent)?.children ?? [];
          for (const added of siblings.slice(step.operation.index, step.operation.index + step.operation.after.length)) inserted.add(added);
        }
        steps.push({ id, command: leaf.command, formula: step.formula, location: step.location, scope: step.scope, operation: step.operation });
      }
      return { ok: true };
    };
    const structuralStep = (): { ok: true } | { ok: false; reason: string } => {
      const forward = forwardStructural(body, leaf.node, leaf.context, leaf.command);
      if ('error' in forward) return { ok: false, reason: forward.error };
      return run([forward]);
    };
    // Lauf 7: Strukturbefehle mit gegliedertem Wortlaut, Umnummerierung, Sätze, Streichung (`structured.ts`).
    const structuredStep = (): { ok: true } | { ok: false; reason: string } => {
      const text = leaf.node.text.replace(/\s+/gu, ' ').trim();
      const flat = leaf.context.flat();
      // Satzfehler mit nur einer Lesart: „Folgende Nr. 1.34.2 wir angefügt:“ (BayMBl. 2023 Nr. 327) ist „wird angefügt“.
      const repaired = repairCommandVerb(text);
      const reparsed = !leaf.structural && repaired !== text ? parseStructural(leaf.node.quoted.length > 0 ? repaired.replace(/\.\s*$/u, ':') : repaired, leaf.context, leaf.node.quoted) : undefined;
      const structural = leaf.structural ?? reparsed;
      const template = structural?.templates?.length === 1 ? structural.templates[0]! : undefined;
      let result: StructuredResult;
      let rest: { text: string; context: LocationPath } | undefined;
      const numberedAnd = /^(Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+(?:zu\s+)?Satz\s+1)\s+und\s+(?!(?:wird\s+)?wie\s+folgt)(.+?)\.?$/u.exec(text);
      if (NUMBER_FIRST_SENTENCE.test(text)) result = forwardNumberSentences(body, flat);
      else if (numberedAnd) {
        result = forwardNumberSentences(body, flat);
        rest = { text: `${numberedAnd[2]!.charAt(0).toUpperCase()}${numberedAnd[2]!.slice(1)}.`, context: flat };
      } else if (WORDING_BECOMES_NUMBER.test(text)) result = forwardWordingBecomesNumber(body, text, flat);
      else if (/^Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+(?:zu\s+)?(?:Nr\.|Nummer)\s*[\d.]+?\.?(?:,|\s+und)\s+/u.test(text)) {
        // „Der Wortlaut wird Nr. 1.3.1 und das Wort „Zivilprozessordnung“ wird durch die Angabe „ZPO“ ersetzt.“ (auch mit Komma)
        const combined = /^(Der\s+(?:bisherige\s+)?Wortlaut\s+wird\s+(?:zu\s+)?(?:Nr\.|Nummer)\s*([\d.]+?))\.?(?:,|\s+und)\s+(?!(?:wird\s+)?wie\s+folgt)(.+?)\.?$/u.exec(text)!;
        result = forwardWordingBecomesNumber(body, `${combined[1]!}.`, flat);
        rest = { text: `${combined[3]!.charAt(0).toUpperCase()}${combined[3]!.slice(1)}.`, context: [...flat, { kind: 'nummer', value: combined[2]!.replace(/\.$/u, '') }] };
      }
      else if (/^Der\s+Satz\s+„/u.test(text)) result = forwardDeleteSentence(body, text, flat);
      else if (DELETE_BLOCKS.test(text)) result = forwardDeleteBlocks(body, text, flat);
      else if (REMOVE_NUMBERING.test(text)) result = forwardRemoveNumbering(body, text, flat);
      else if (APPEND_WORDS.test(text)) result = forwardAppendWords(body, text, flat);
      else if (FLAT_LETTER_COMMAND.test(text)) result = forwardFlatLetters(body, text, leaf.context);
      else if (/^(?:Satz\s+\d+\s+wird|Die\s+Sätze\s+[\d\s]+(?:und|bis)\s+\d+\s+werden)\s+aufgehoben\.?$/u.test(text)) result = forwardRepealSentences(body, text, flat);
      else if (/\bgestrichen\.?$/u.test(text)) result = forwardDeleteWords(body, text, leaf.context);
      else if (template?.kind === 'relabel') {
        result = forwardRelabel(body, template, inserted);
        if (structural?.followUp) rest = structural.followUp;
      }
      else if (template?.kind === 'insert-sentence') result = forwardInsertSentence(body, template, numberedExplicitly(template.context));
      else if (template?.kind === 'number-sentences') result = forwardNumberSentences(body, template.context);
      else if (template?.kind === 'renumber-sentences') result = forwardRenumberSentences(body, template, insertedSentences);
      else if (template?.kind === 'insert-blocks') result = forwardInsertBlocks(body, template, leaf.node.quoted, relabelledAfter(position));
      else if (INLINE_APPEND.test(text) && leaf.node.quoted.length === 0) {
        // „Folgende Nr. 1.43.2 wird angefügt „1.43.2 In Ermittlungs- …““ (BayMBl. 2022 Nr. 533): Doppelpunkt fehlt, der neue
        // Wortlaut steht im selben Absatz – wie „Folgende Nr. 1.43.2 wird angefügt:“ mit diesem Zitat.
        const inline = INLINE_APPEND.exec(text)!;
        const unit: GazetteUnit = { index: -1, tag: 'p', className: '', label: `„${inline[2]!}`, text: `${inline[3]!}“`, heading: false };
        result = forwardInsertBlocks(body, { kind: 'insert-blocks', context: flat, targets: [{ kind: 'nummer', value: inline[1]! }], quotes: [], append: true }, [unit], relabelledAfter(position));
      }
      else {
        result = forwardBlockRecast(body, text, leaf.node.quoted, leaf.context);
        if ('error' in result && /Buchst\./u.test(text)) {
          const flat = forwardFlatRecast(body, text, leaf.node.quoted, leaf.context);
          if (!('error' in flat)) result = flat;
        }
      }
      if ('error' in result) return { ok: false, reason: result.error };
      const done = run(result.steps);
      if (!done.ok || !rest) return done;
      return followUp(rest.text, rest.context);
    };
    const either = (): { ok: true } | { ok: false; reason: string } => {
      const first = structuralStep();
      if (first.ok) return first;
      const second = structuredStep();
      return second.ok ? second : { ok: false, reason: `${first.reason}; strukturiert: ${second.reason}` };
    };
    if (leaf.hasChildren || leaf.statisticsOnly) return fail('amendment-formula-unsupported', `Strukturelle Änderung wird nicht angewandt: „${leaf.command.slice(0, 160)}“`);
    if (leaf.structural) {
      const done = either();
      if (!done.ok) return fail('amendment-formula-unsupported', `Strukturelle Änderung wird nicht angewandt: ${done.reason} („${leaf.command.slice(0, 160)}“)`);
      continue;
    }
    const parsed = parseCommand(commandWording(normalizePreamble(leaf.node.text)), leaf.context);
    if (!parsed.operations && (parsed.formulas.includes('recast') || parsed.formulas.includes('insert-unit'))) {
      const done = either();
      if (!done.ok) return fail('amendment-formula-unsupported', `${parsed.formulas.join('+')}: ${done.reason} („${leaf.command.slice(0, 160)}“)`);
      continue;
    }
    if (!parsed.operations) {
      const done = structuredStep();
      if (done.ok) continue;
      // Zusammengesetzter Befehl: Teile einzeln, jeder muss aufgehen.
      const parts = splitCombined(leaf.node.text);
      if (parts) {
        let failure: string | undefined;
        for (const part of parts) {
          const partParsed = parseCommand(commandWording(part), leaf.context);
          if (partParsed.operations) {
            const applied = applyParsed(partParsed.operations);
            if (applied.ok) continue;
            if (!/\bHalbsatz\b/u.test(part)) {
              failure = `Teil „${part.slice(0, 80)}“: ${applied.reason}`;
              break;
            }
          }
          const alone = REMOVE_NUMBERING.test(part) ? forwardRemoveNumbering(body, part, leaf.context.flat()) : /\bHalbsatz\b/u.test(part) ? forwardHalfSentenceInsert(body, part, leaf.context) : /gestrichen\.?$/u.test(part) ? forwardDeleteWords(body, part, leaf.context) : forwardBlockRecast(body, part, [], leaf.context);
          if ('error' in alone) {
            failure = `Teil „${part.slice(0, 80)}“: ${partParsed.formulas.join('+')} ${partParsed.reason ?? ''}; strukturiert: ${alone.error}`;
            break;
          }
          const ran = run(alone.steps);
          if (!ran.ok) {
            failure = `Teil „${part.slice(0, 80)}“: ${ran.reason}`;
            break;
          }
        }
        if (!failure) continue;
        return fail('amendment-formula-unsupported', `zusammengesetzter Befehl: ${failure} („${leaf.command.slice(0, 160)}“)`);
      }
      return fail('amendment-formula-unsupported', `${parsed.formulas.join('+')}: ${parsed.reason ?? 'nicht unterstützt'}; strukturiert: ${done.reason} („${leaf.command.slice(0, 160)}“)`);
    }
    // Überschrift der Norm selbst („In der Überschrift …“ ohne Glied): Metadatum, nicht Körper.
    const onTitle = leaf.context.flat().length === 0 && parsed.operations.every((operation) => operation.locations.every((path) => path.length === 1 && path[0]!.kind === 'ueberschrift'));
    if (onTitle && currentTitle !== undefined) {
      for (const operation of parsed.operations) {
        const id = `${idPrefix}t${String(titleChanges.length + 1).padStart(2, '0')}`;
        try {
          const next = applyToTitle(currentTitle, operation.operation, id);
          titleChanges.push({ id, command: leaf.command, formula: operation.formula, before: currentTitle, after: next });
          currentTitle = next;
        } catch (error) {
          return fail('amendment-target-unresolved', `Überschrift der Norm: ${(error as Error).message} („${leaf.command.slice(0, 160)}“)`);
        }
      }
      continue;
    }
    const applied = applyParsed(parsed.operations);
    if (!applied.ok) {
      // „… im ersten Halbsatz …“ grenzt einen mehrdeutigen Anker ein.
      const half = /\bHalbsatz\b/u.test(leaf.node.text) ? forwardHalfSentenceInsert(body, leaf.node.text, leaf.context) : undefined;
      if (half && !('error' in half)) {
        const ran = run(half.steps);
        if (ran.ok) continue;
      }
      return fail(applied.code, applied.reason);
    }
  }
  // Rundlauf: rückwärts in umgekehrter Reihenfolge muss exakt den Körper vor der Änderung ergeben.
  const back = structuredClone(body) as NormBodyBlock[];
  try {
    for (const step of [...steps].reverse()) applyBackward(back, step.scope, step.operation, step.id);
  } catch (error) {
    return { ok: false, steps, code: 'amendment-round-trip-failed', reason: `Rückwärts: ${(error as Error).message}`, ...(section ? { section } : {}), intro: block.intro.text };
  }
  if (stableStringify(back) !== stableStringify(before)) return { ok: false, steps, code: 'amendment-round-trip-failed', reason: 'Rundlauf ergibt nicht den Körper vor der Änderung', ...(section ? { section } : {}), intro: block.intro.text };
  if (steps.length === 0 && titleChanges.length === 0) return { ok: false, steps, code: 'amendment-formula-unsupported', reason: 'Änderung ohne anwendbaren Befehl', ...(section ? { section } : {}), intro: block.intro.text };
  return { ok: true, steps, after: body, ...(titleChanges.length > 0 ? { titleChanges, title: currentTitle! } : {}), ...(section ? { section } : {}), intro: block.intro.text };
}


/* --------------------------------------------------- Neufassung und Einfügung vorwärts (belegt, eng) */

/**
 * Vorwärts ist eine Neufassung vollständig bestimmt: Der neue Wortlaut steht im Befehl, der alte im Körper davor.
 * Die Rückrechnung (`reconstruction/`) kann sie nicht umkehren (der Alttext fehlt im Befehl) – hier wird sie
 * nicht umgekehrt, sondern ausgeführt und am Körper davor im Rundlauf geprüft. Zugelassen sind nur zwei enge Fälle:
 *
 * - **Neufassung eines Textglieds ohne Untergliederung** („Nr. 3 Buchst. c Doppelbuchst. cc wird wie folgt gefasst:
 *   „cc) Musik-Organisationen: Bayerischer Musikrat e. V.““, „Ziffer 4.4 wird wie folgt gefasst: „Die …““) oder eines
 *   bezeichneten Satzes. Der neue Wortlaut ist genau eine zitierte Einheit; trägt sie eine Bezeichnung, muss es die
 *   des Glieds sein.
 * - **Anfügen oder Einfügen eines Textglieds** („Der Nr. 1 wird folgende Nr. 1.5 angefügt: „1.5 …““, „Nach Nr. 2 wird
 *   folgende Nr. 3 eingefügt: …“) – nur, wenn die neue Bezeichnung frei ist und die Geschwister gleichartig sind.
 *
 * Alles andere (Neufassung mit Untergliederung, Bereiche „Nrn. 1.1 bis 1.3“, Umnummerierung) bleibt
 * `amendment-formula-unsupported`.
 */
const RECAST = /^(?:(?:Die|Der|Das)\s+)?(.+?)\s+(?:wird|erhält)\s+(?:wie\s+folgt\s+(?:neu\s+)?gefasst|folgende\s+(?:neue\s+)?Fassung)\s*:?\s*(?:„([\s\S]*)[“”])?\s*\.?\s*$/u;
const INSERT = /^(?:(?:Der|Dem|Den)\s+(.+?)\s+(?:wird|werden)\s+folgender?s?\s+(.+?)\s+angefügt|Nach\s+(.+?)\s+(?:wird|werden)\s+folgender?s?\s+(.+?)\s+eingefügt)\s*:?\s*(?:„([\s\S]*)[“”])?\s*\.?\s*$/u;

/** Nicht aufgelöste Zeichenreferenz im Einheitentext („&thinsp;“) – der Wortlaut wäre nicht der des Körpers. */
const CHARACTER_REFERENCE = /&(?:[a-z]+|#\d+|#x[\da-f]+);/iu;
const stripQuotes = (value: string): string => value.replace(/^\s*[„‚]/u, '').replace(/[“”‘]\s*[.,;]?\s*$/u, '').trim();
const plainLabel = (value: string | undefined): string => (value ?? '').replace(/^[„‚]/u, '').replace(/[.)]\s*$/u, '').trim();

function newWording(node: { text: string; quoted: readonly GazetteUnit[] }, inline: string | undefined): { label?: string; text: string } | { error: string } {
  if (inline !== undefined && node.quoted.length === 0) {
    const text = stripQuotes(inline);
    return CHARACTER_REFERENCE.test(text) ? { error: 'Zeichenreferenz im neuen Wortlaut' } : { text };
  }
  if (node.quoted.length !== 1) return { error: `neuer Wortlaut in ${node.quoted.length} Einheiten (erwartet: genau eine)` };
  const unit = node.quoted[0]!;
  if (CHARACTER_REFERENCE.test(unit.text)) return { error: 'Zeichenreferenz im neuen Wortlaut' };
  return { ...(unit.label ? { label: plainLabel(unit.label) } : {}), text: stripQuotes(unit.text) };
}

function singlePath(location: string, context: readonly LocationPath[]): LocationPath | undefined {
  // „Ziffer 4.4“ (KWMBl.) ist die Nummer 4.4 der Gliederung.
  const own = parseLocation(location.replace(/(?<![\p{L}])Ziffer(?![\p{L}])/gu, 'Nr.'));
  if (!own || own.length !== 1) return undefined;
  return [...context.flat(), ...own[0]!];
}

export function forwardStructural(body: readonly NormBodyBlock[], node: { text: string; quoted: readonly GazetteUnit[] }, context: readonly LocationPath[], command: string): { operation: Operation; scope: ResolvedScope; location: string; formula: FormulaId } | { error: string } {
  const text = node.text.replace(/\s+/gu, ' ').trim();
  const recast = RECAST.exec(text);
  if (recast) {
    const path = singlePath(recast[1]!, context);
    if (!path) return { error: `Ortsangabe der Neufassung nicht lesbar: „${recast[1]}“` };
    const resolved = resolvePath(body, path);
    if (!resolved.ok) return { error: `${formatPath(path)}: ${resolved.reason}` };
    let scope = resolved.scope;
    // „Satz 2 wird wie folgt gefasst“ in einem Glied mit Untergliederung: Die Satznummer steht in genau einem Textfeld.
    const sentenceStep = path.at(-1)?.kind === 'satz' ? Number(path.at(-1)!.value) : undefined;
    if (scope.fields.length > 1 && sentenceStep !== undefined && Number.isInteger(sentenceStep)) {
      const holders = scope.fields.filter((field) => field.key === 'text' && sentenceNumbers(String(blockAt(body, field.path)?.text ?? '')).some((marker) => marker.value === sentenceStep));
      if (holders.length === 1) scope = { ...scope, fields: holders, sentence: sentenceStep };
    }
    if (scope.fields.length !== 1 || scope.fields[0]!.key !== 'text') return { error: `Neufassung trifft ${scope.fields.length} Felder – nur ein Textglied wird neu gefasst` };
    const block = blockAt(body, scope.fields[0]!.path)!;
    if (scope.sentence === undefined && block.children && block.children.length > 0) return { error: `Neufassung eines Glieds mit Untergliederung (${block.children.length} Unterglieder)` };
    const wording = newWording(node, recast[2]);
    if ('error' in wording) return wording;
    if (wording.label !== undefined && wording.label !== plainLabel(block.label)) return { error: `neuer Wortlaut bezeichnet „${wording.label}“, das Glied „${block.label ?? '–'}“` };
    const current = block.text ?? '';
    if (scope.sentence !== undefined) {
      const marker = [...current.matchAll(/(?<=^|[\s(„])([¹²³⁴⁵⁶⁷⁸⁹]+)(?=\S)/gu)];
      const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
      const value = (m: RegExpMatchArray): number => Number([...m[1]!].map((ch) => digits.indexOf(ch)).join(''));
      const at = marker.findIndex((m) => value(m) === scope.sentence);
      if (at < 0) return { error: `Satz ${scope.sentence} ohne Satznummer im Glied` };
      const start = marker[at]!.index!;
      const end = at + 1 < marker.length ? marker[at + 1]!.index! : current.length;
      const from = current.slice(start, end).trim();
      if (!wording.text.startsWith(marker[at]![1]!)) return { error: `neuer Satz ${scope.sentence} ohne seine Satznummer` };
      return { operation: { kind: 'replace', from, to: wording.text }, scope: { ...scope, fields: scope.fields }, location: formatPath(path), formula: 'recast' };
    }
    if (current === '') return { error: 'Glied ohne Text' };
    return { operation: { kind: 'replace', from: current, to: wording.text }, scope, location: formatPath(path), formula: 'recast' };
  }
  const insert = INSERT.exec(text);
  if (insert) {
    const appended = insert[1] !== undefined;
    const anchorText = (appended ? insert[1] : insert[3])!;
    const newUnit = /^(?:Nr\.|Nummer|Ziffer|Buchst\.|Buchstabe|Doppelbuchst\.)\s*([\w.]+)$/u.exec((appended ? insert[2] : insert[4])!.trim());
    if (!newUnit) return { error: `eingefügtes Glied „${appended ? insert[2] : insert[4]}“ ist kein bezeichnetes Textglied` };
    const newLabel = newUnit[1]!.replace(/\.$/u, '');
    const path = singlePath(anchorText, context);
    if (!path) return { error: `Ortsangabe der Einfügung nicht lesbar: „${anchorText}“` };
    const resolved = resolvePath(body, path);
    if (!resolved.ok) return { error: `${formatPath(path)}: ${resolved.reason}` };
    // Anker ist das oberste getroffene Glied; alle übrigen Felder müssen darunter liegen.
    const anchorPath = [...resolved.scope.fields].map((field) => field.path).sort((left, right) => left.length - right.length)[0];
    if (!anchorPath || resolved.scope.fields.some((field) => field.path.slice(0, anchorPath.length).join(',') !== anchorPath.join(','))) return { error: 'Anker der Einfügung ist kein einzelnes Glied' };
    const parentPath = appended ? anchorPath : anchorPath.slice(0, -1);
    const siblings = parentPath.length === 0 ? body : blockAt(body, parentPath)?.children ?? [];
    if (siblings.length === 0) return { error: 'Anfügen an ein Glied ohne Unterglieder' };
    if (siblings.some((sibling) => plainLabel(sibling.label) === newLabel)) return { error: `Bezeichnung ${newLabel} ist schon vergeben – Umnummerierung wird nicht geraten` };
    const index = appended ? siblings.length : anchorPath.at(-1)! + 1;
    const model = siblings[Math.min(index, siblings.length) - 1]!;
    const labelStyle = model.label && /[.)]$/u.test(model.label) ? model.label.slice(-1) : '';
    if (model.children && model.children.length > 0) return { error: 'Geschwister mit Untergliederung – Form des neuen Glieds nicht bestimmt' };
    const wording = newWording(node, insert[5]);
    if ('error' in wording) return wording;
    if (wording.label !== undefined && wording.label !== newLabel) return { error: `neuer Wortlaut bezeichnet „${wording.label}“, der Befehl „${newLabel}“` };
    const block: NormBodyBlock = { type: model.type, label: `${newLabel}${labelStyle}`, text: wording.text };
    if (wording.text === '') return { error: 'neuer Wortlaut leer' };
    return { operation: { kind: 'insert-block', parent: parentPath, index, block }, scope: { fields: [], resolved: [formatPath(path)], widened: [] }, location: formatPath(path), formula: 'insert-unit' };
  }
  return { error: `kein zugelassener Struktur-Befehl: „${command.slice(0, 160)}“` };
}

/** Wendet gespeicherte Schritte vorwärts an (Rezept, offline). */
export function replaySteps(before: readonly NormBodyBlock[], steps: readonly Pick<ForwardStep, 'id' | 'scope' | 'operation'>[]): NormBodyBlock[] {
  const body = structuredClone(before) as NormBodyBlock[];
  for (const step of steps) applyForward(body, step.scope, step.operation, step.id);
  return body;
}

export { addDays };

/** Kopf einer Detailseite für die Quellenangabe (Amtlichkeit, PDF-Prüfsumme). */
export const headOf = parsePublicationHead;
