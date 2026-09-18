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
import { commencementFor, sectionRef } from '../reconstruction/commencement.ts';
import { parseCommand, type FormulaId, type Operation } from '../reconstruction/formulas.ts';
import type { GazetteUnit } from '../reconstruction/gazette.ts';
import { formatPath, resolvePath, type ResolvedScope } from '../reconstruction/location.ts';
import { stableStringify } from '../reconstruction/recipe.ts';
import { commandLeaves } from '../reconstruction/steps.ts';
import { amendingCitations, commandBlock, isBlockFailure, type NormIdentity } from '../reconstruction/structure.ts';
import { gazetteUnits } from '../reconstruction/gazette.ts';
import { parseLongGermanDate } from '../events/resolve.ts';
import { htmlToText, parseGermanDate } from '../events/listings.ts';
import { sourceRef, type GazettePublication, type SourceDocumentRef } from './base.ts';
import { addDays, determineEnd, parseCitationTail, type LocatedCitation, type PriorAmendment } from './identity.ts';
import { isPageMiss, parseAmtsblattIssue, parseAmtsblattVolume, parsePublicationHead, type Platform, type PlatformPage } from './platform.ts';
import { amtsblattIssueUrl, amtsblattVolumeUrl, baymblFulltextUrl, baymblGlnrListingUrl, fulltextQuery, MINISTERIAL_JOURNALS, PLATFORM_ORIGIN, sameReference, type GazetteReference, type MinisterialJournal } from './references.ts';

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
      if (!primary || !sameReference(primary, base.reference, undefined, base.volume)) continue;
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
      const end = determineEnd(units, citation, publishedAt);
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
  amtsblatt?: { documents: number; fullRead: boolean; withoutHtml: number };
  /** Beschreibung des Zeitraums und des Verfahrens (Beleg). */
  method: string;
}

/** Nummernteil einer Gliederungsnummer ohne Ressortzusatz (`2230.1.3-UK` → `2230.1.3`). */
export const glnrStem = (value: string): string => value.replace(/[‐-―−]/gu, '-').replace(/-[A-Za-zÄÖÜäöü]+$/u, '').trim();

/**
 * Höchstzahl der Veröffentlichungen der Amtsblätter 2009–2018, die für eine Norm vollständig gelesen werden (die
 * Blätter haben keine Volltextsuche). Darüber bleibt die Kette `incomplete-chain` (Netzlast, Auftrag: maßvoll).
 */
export const AMTSBLATT_FULL_READ_CAP = 120;

const detailUrlOf = (path: string): string => `${PLATFORM_ORIGIN}${path}`;

/** Veröffentlichungsdatum einer BayMBl.-/GVBl.-Detailseite (Seitenkopf). */
export function detailPublishedAt(html: string): string | undefined {
  const headline = htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1] ?? '');
  return parseGermanDate(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/u.exec(headline)?.[1] ?? '');
}

export type ChainPages = Map<string, { page: PlatformPage; units: GazetteUnit[]; publishedAt: string; citation: string; citations: BaseCitation[] }>;

type Candidate = { url: string; citation: string; publishedAt: string; title: string };

/**
 * Durchsucht eine absteigend nach Datum sortierte BayMBl.-Trefferliste seitenweise bis vor die Verkündung der Norm.
 * Liefert alle Treffer-Adressen (für die Belegprüfung) und die im Zeitraum.
 */
async function scanBaymblListing(platform: Platform, urlOf: (offset: number) => string, base: GazettePublication, until: string, listings: SourceDocumentRef[], missing: string[]): Promise<{ hits: Set<string>; total: number; inWindow: Candidate[] }> {
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
      if (!row.publishedAt || row.publishedAt <= base.publishedAt || row.publishedAt > until || detail === base.page.url) continue;
      inWindow.push({ url: detail, citation: `BayMBl. ${row.volume} Nr. ${row.position}`, publishedAt: row.publishedAt, title: row.title });
    }
    offset += 50;
    // Absteigend sortiert: Sobald eine Seite nur noch Älteres führt als die Norm, ist die Suche am Ende.
    const oldest = parsed.rows.at(-1)?.publishedAt;
    if (parsed.rows.length < 50 || parsed.totalHits === undefined || offset >= parsed.totalHits || (oldest !== undefined && oldest < base.publishedAt)) break;
  }
  return { hits, total, inWindow };
}

/**
 * Gegenprobe zwischen der Verkündung der Norm und `until` (Verkündung des Aufhebungsbefehls). Liest jede
 * Treffer-Seite; Übersichtsseiten und Einzelseiten kommen aus dem Cache oder werden – im Budget – einmal geholt.
 * `anchors`: Seiten, die die Norm bekanntermaßen zitieren (Aufhebungsbefehle) – die Volltextsuche muss sie finden.
 */
export async function scanChain(platform: Platform, base: GazettePublication, documentDate: string, reference: GazetteReference, until: string, anchors: readonly string[] = []): Promise<{ scan: ChainScan; pages: ChainPages }> {
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
    const query = fulltextQuery(documentDate, reference);
    const result = await scanBaymblListing(platform, (offset) => baymblFulltextUrl(query, offset), base, until, listings, missing);
    for (const candidate of result.inWindow) candidates.set(candidate.url, candidate);
    fulltextHits = result.hits;
    fulltext = { query, hits: result.total, verified: false, unmatched: [] };
    methods.push(`BayMBl.-Volltextsuche „${query}“ (${result.total} Treffer, ${result.inWindow.length} im Zeitraum)`);
  }

  // 2 – BayMBl.: Gliederungssuche (Gegenkontrolle).
  for (const stem of stems) {
    const result = await scanBaymblListing(platform, (offset) => baymblGlnrListingUrl(stem, offset), base, until, listings, missing);
    for (const candidate of result.inWindow) if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
  }
  if (stems.length > 0) methods.push(`BayMBl.-Gliederungssuche ${stems.join(', ')}`);

  // 3 – Amts- und Ministerialblätter 2009–2018 (vor dem BayMBl.): jede Veröffentlichung im Zeitraum, sonst Gliederungsnummern.
  let amtsblatt: ChainScan['amtsblatt'];
  if (base.publishedAt < '2019-01-01') {
    const firstYear = Math.max(Number(base.publishedAt.slice(0, 4)), 2009);
    const windowDocs: Array<Candidate & { gliederungsnummern: string[]; hasHtml: boolean }> = [];
    for (const journal of Object.keys(MINISTERIAL_JOURNALS) as MinisterialJournal[]) {
      for (let year = firstYear; year <= 2018; year += 1) {
        const url = amtsblattVolumeUrl(journal, year);
        const volumePage = await platform.get(url);
        if (isPageMiss(volumePage)) {
          missing.push(url);
          continue;
        }
        listings.push(sourceRef(volumePage));
        for (const issue of parseAmtsblattVolume(volumePage.html)) {
          if (issue.publishedAt < base.publishedAt || issue.publishedAt > until) continue;
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
      }
    }
    const fullRead = windowDocs.length <= AMTSBLATT_FULL_READ_CAP && windowDocs.every((doc) => doc.hasHtml);
    const selected = fullRead ? windowDocs : windowDocs.filter((doc) => doc.hasHtml && doc.gliederungsnummern.some((value) => stems.includes(glnrStem(value))));
    for (const doc of selected) candidates.set(doc.url, { url: doc.url, citation: doc.citation, publishedAt: doc.publishedAt, title: doc.title });
    amtsblatt = { documents: windowDocs.length, fullRead, withoutHtml: windowDocs.filter((doc) => !doc.hasHtml).length };
    methods.push(fullRead ? `AllMBl., FMBl., JMBl. und KWMBl. bis 2018: alle ${windowDocs.length} Veröffentlichungen im Zeitraum` : `AllMBl., FMBl., JMBl. und KWMBl. bis 2018: nur Gliederungsnummern (${windowDocs.length} Veröffentlichungen im Zeitraum, Obergrenze für das vollständige Lesen ${AMTSBLATT_FULL_READ_CAP}${amtsblatt.withoutHtml > 0 ? `, ${amtsblatt.withoutHtml} ohne HTML` : ''})`);
  }

  // 4 – Jede Veröffentlichung lesen.
  for (const candidate of [...candidates.values()].sort((left, right) => (left.publishedAt < right.publishedAt ? -1 : left.publishedAt > right.publishedAt ? 1 : left.url < right.url ? -1 : 1))) {
    const page = await platform.get(candidate.url);
    if (isPageMiss(page)) {
      missing.push(candidate.url);
      continue;
    }
    const units = gazetteUnits(page.html);
    const citations = citationsOfBase(units, { documentDate, reference, volume: base.volume }, candidate.publishedAt);
    examined.push({ url: candidate.url, citation: candidate.citation, publishedAt: candidate.publishedAt, title: candidate.title, sha256: page.sha256, relations: [...new Set(citations.map((entry) => entry.relation))].sort() as Relation[] });
    if (citations.length > 0) pages.set(candidate.url, { page, units, publishedAt: candidate.publishedAt, citation: candidate.citation, citations });
  }

  // 5 – Beleg der Volltextsuche: Sie muss jede bekannte zitierende BayMBl.-Seite finden.
  if (fulltext && fulltextHits) {
    const known = new Set([...anchors.filter((url) => url.includes('/baymbl/')), ...examined.filter((entry) => entry.relations.length > 0 && entry.url.includes('/baymbl/')).map((entry) => entry.url)]);
    fulltext.unmatched = [...known].filter((url) => !fulltextHits!.has(url)).sort();
    fulltext.verified = known.size > 0 && fulltext.unmatched.length === 0;
  }

  const complete = missing.length === 0 && (fulltext === undefined || fulltext.verified) && (amtsblatt === undefined || amtsblatt.fullRead);
  const method = `${methods.join('; ') || '–'}; Veröffentlichungen vom ${base.publishedAt} (ausschließlich) bis ${until}; ${examined.length} Seite(n) gelesen, ${examined.filter((entry) => entry.relations.length > 0).length} zitieren die Norm`;
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

export interface AppliedAmendment {
  ok: boolean;
  /** Inkrafttreten der Änderung für die Norm (spätestes Datum, wenn Teile abweichen). */
  effectiveDate?: string;
  effectiveDates: string[];
  effectiveEvidence: string[];
  steps: ForwardStep[];
  after?: NormBodyBlock[];
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
    references: [`${reference.organ}. ${base.volume} ${kind} ${reference.position}`, `${reference.organ}. ${kind} ${reference.position}`],
  };
}

/** Inkrafttreten einer Änderung für die Norm – nur mit Kalenderdatum. */
export function amendmentCommencement(units: readonly GazetteUnit[], publishedAt: string, section: string | undefined): Pick<AppliedAmendment, 'effectiveDate' | 'effectiveDates' | 'effectiveEvidence' | 'reason' | 'ok'> {
  const mantel = amendingCitations(units).length > 1;
  const result = commencementFor(units, publishedAt, section, mantel);
  if (!result.ok) return { ok: false, effectiveDates: [], effectiveEvidence: [], reason: result.reason };
  const relative = result.applicable.find((statement) => /[Vv]erkünd|[Vv]eröffentlich|Tag\s+nach/u.test(statement.text) || !CALENDAR_DATE.test(statement.text));
  if (relative) return { ok: false, effectiveDates: result.dates, effectiveEvidence: result.applicable.map((statement) => statement.text), reason: `Inkrafttreten ohne Kalenderdatum: „${relative.text.slice(0, 160)}“` };
  return { ok: true, effectiveDate: result.dates.at(-1)!, effectiveDates: result.dates, effectiveEvidence: result.applicable.map((statement) => statement.text) };
}

/**
 * Wendet eine Änderung **vorwärts** auf den Körper vor ihr an. Nur Wortlautformeln (`replace-words`,
 * `insert-words`, `delete-words-anchored`, `append-words`, `replace-final-punctuation`); jeder Ort wird im Körper vor
 * der Änderung aufgelöst, jeder zu ändernde Wortlaut muss dort genau einmal stehen. Rundlauf: rückwärts ergibt sich
 * wieder exakt der Ausgangskörper.
 */
export function applyAmendment(before: readonly NormBodyBlock[], units: readonly GazetteUnit[], identity: NormIdentity, idPrefix: string): Omit<AppliedAmendment, 'effectiveDate' | 'effectiveDates' | 'effectiveEvidence'> & { section?: string; intro?: string } {
  const block = commandBlock(units, identity);
  if (isBlockFailure(block)) return { ok: false, steps: [], code: 'amendment-block-unreadable', reason: `${block.code}: ${block.detail}` };
  const section = sectionRef(block.section, block.intro.label);
  const { leaves, failures } = commandLeaves(block);
  if (failures.length > 0) return { ok: false, steps: [], code: 'amendment-block-unreadable', reason: failures[0]!, ...(section ? { section } : {}), intro: block.intro.text };
  const body = structuredClone(before) as NormBodyBlock[];
  const steps: ForwardStep[] = [];
  for (const leaf of leaves) {
    if (leaf.structural || leaf.hasChildren || leaf.statisticsOnly) return { ok: false, steps, code: 'amendment-formula-unsupported', reason: `Strukturelle Änderung wird nicht angewandt: „${leaf.command.slice(0, 160)}“`, ...(section ? { section } : {}), intro: block.intro.text };
    const parsed = parseCommand(leaf.node.text, leaf.context);
    if (!parsed.operations) return { ok: false, steps, code: 'amendment-formula-unsupported', reason: `${parsed.formulas.join('+')}: ${parsed.reason ?? 'nicht unterstützt'} („${leaf.command.slice(0, 160)}“)`, ...(section ? { section } : {}), intro: block.intro.text };
    for (const operation of parsed.operations) {
      for (const path of operation.locations) {
        const resolved = resolvePath(body, path);
        if (!resolved.ok) return { ok: false, steps, code: 'amendment-target-unresolved', reason: `${formatPath(path)}: ${resolved.reason} („${leaf.command.slice(0, 160)}“)`, ...(section ? { section } : {}), intro: block.intro.text };
        const id = `${idPrefix}s${String(steps.length + 1).padStart(2, '0')}`;
        try {
          applyForward(body, resolved.scope, operation.operation, id);
        } catch (error) {
          return { ok: false, steps, code: 'amendment-target-unresolved', reason: `${id}: ${(error as Error).message}`, ...(section ? { section } : {}), intro: block.intro.text };
        }
        steps.push({ id, command: leaf.command, formula: operation.formula, location: formatPath(path), scope: resolved.scope, operation: operation.operation });
      }
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
  if (steps.length === 0) return { ok: false, steps, code: 'amendment-formula-unsupported', reason: 'Änderung ohne anwendbaren Befehl', ...(section ? { section } : {}), intro: block.intro.text };
  return { ok: true, steps, after: body, ...(section ? { section } : {}), intro: block.intro.text };
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
