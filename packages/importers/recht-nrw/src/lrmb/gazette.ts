/**
 * Einträge des Ministerialblatts auf RECHT.NRW (`/mblnrw/<Jahr>-s<Seite>[-n|Buchstabe]`).
 *
 * Ein Eintrag liefert Ausgabe, Veröffentlichungsdatum, Seite, SMBl-Gliederungsnummer, Erlasskopf,
 * Text (Änderungsbefehle), Inkrafttretensklausel, die Bezugnahme auf die geänderte Vorschrift
 * („vom 12. April 2018 (MBl. NRW. S. 242)“) und – falls genannt – die letzte vorherige Änderung
 * („der zuletzt durch Runderlass vom 10. Juni 2022 (MBl. NRW. S. 605) geändert worden ist“).
 *
 * Seitenadressen sind nicht eindeutig: mehrere Einträge auf einer Seite erhalten Suffixe (`-0`, `-1`).
 * Ein Eintrag gilt deshalb nur dann als Änderung einer Vorschrift, wenn er deren Ausfertigungsdatum
 * und Fundstelle ausdrücklich nennt – nie allein über den Titel.
 */
import type { ImportFinding } from '@landesrecht/importer-common/pipeline.ts';
import { previousDay } from '@landesrecht/legal-core/lib/schema.ts';

import { BASE_URL } from '../common/constants.ts';
import { allByClass, attr, byClass, findFirst, parseHtml, textOf } from '../common/html.ts';
import { parseGermanDate, parseGermanLongDate } from '../common/source-identity.ts';
import { parseLrmbDocument, type LrmbParseResult } from './parser.ts';
import { parseValidityClauses, type GazetteCitation, type ValidityClause } from './text-metadata.ts';

export interface GazetteEntry {
  url: string;
  heading: string;
  title: string;
  issue?: string;
  issueUrl?: string;
  publishedOn?: string;
  page?: string;
  parse: LrmbParseResult;
  text: string;
  inForce?: ValidityClause;
  baseReferences: Array<{ dateText: string; date?: string; page?: string; text: string }>;
  predecessor?: { latest: boolean; dateText: string; date?: string; citationText: string };
  attachments: Array<{ label: string; url: string }>;
  findings: ImportFinding[];
}

/** Datum „12. April 2018“, „30. Juli. 2014“ (Satzfehler der Quelle) oder „30.7.2014“. */
const DATE = '(\\d{1,2}\\.\\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\.?\\s+\\d{4}|\\d{1,2}\\.\\s?\\d{1,2}\\.\\s?\\d{4})';

function isoOf(value: string): string | undefined {
  const cleaned = value.replace(/(\p{L})\.(\s+\d{4})/u, '$1$2');
  return parseGermanLongDate(cleaned) ?? parseGermanDate(cleaned.replace(/\s/gu, ''));
}

export function nextDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function parseGazetteEntry(html: string, url: string): GazetteEntry {
  const findings: ImportFinding[] = [];
  const document = parseHtml(html);
  const headings = allByClass(document, 'field--field_long_title');
  const firstH1 = findFirst(document, (element) => element.tagName === 'h1');
  const info: Record<string, { text: string; href?: string; datetime?: string }> = {};
  for (const item of allByClass(document, 'info-box-item')) {
    const label = textOf(byClass(item, 'field__label'));
    const value = byClass(item, 'field__item');
    if (!label || !value) continue;
    const link = findFirst(value, (element) => element.tagName === 'a');
    const time = findFirst(value, (element) => element.tagName === 'time');
    const entry: { text: string; href?: string; datetime?: string } = { text: textOf(value) };
    const href = link ? attr(link, 'href') : undefined;
    if (href) entry.href = new URL(href, BASE_URL).toString();
    const datetime = time ? attr(time, 'datetime') : undefined;
    if (datetime) entry.datetime = datetime;
    info[label] = entry;
  }
  const normtext = byClass(document, 'field--field_normtext');
  if (!normtext) findings.push({ severity: 'error', code: 'missing-content', message: `${url}: kein Normtext im Ministerialblatt-Eintrag` });
  const parse = parseLrmbDocument(normtext ? `<div class="tex2jax_process">${html.slice(html.indexOf('tex2jax_process', html.indexOf('field--field_normtext')) + 'tex2jax_process">'.length, html.indexOf('</div></div>', html.indexOf('field--field_normtext')))}</div>` : '');
  const text = parse.bodyTexts.join(' ');
  const entry: GazetteEntry = { url, heading: textOf(firstH1), title: textOf(headings[0]), parse, text, baseReferences: [], attachments: [], findings: [...findings, ...parse.findings] };
  if (info.Ausgabe) {
    entry.issue = info.Ausgabe.text;
    if (info.Ausgabe.href) entry.issueUrl = info.Ausgabe.href;
  }
  const published = info['Veröffentlichungsdatum'];
  const publishedOn = published?.datetime?.slice(0, 10) ?? parseGermanDate(published?.text);
  if (publishedOn) entry.publishedOn = publishedOn;
  else entry.findings.push({ severity: 'error', code: 'gazette-missing-publication-date', message: `${url}: kein Veröffentlichungsdatum` });
  if (info.Seite) entry.page = info.Seite.text;
  const clauses = parseValidityClauses(parse.bodyTexts);
  if (clauses.inForce) entry.inForce = clauses.inForce;
  for (const match of text.matchAll(new RegExp(`vom\\s+${DATE}\\s*\\(\\s*(MB[lI]\\.?\\s*NRW\\.?\\s*S\\.\\s*(\\d+)\\s*[a-z]?)\\s*\\)`, 'gu'))) {
    const reference: GazetteEntry['baseReferences'][number] = { dateText: match[1]!, text: match[0], page: match[3]! };
    const date = isoOf(match[1]!);
    if (date) reference.date = date;
    entry.baseReferences.push(reference);
  }
  const predecessor = new RegExp(`(?:der|die|das)\\s+(zuletzt\\s+)?durch\\s+(?:Runderlass|Erlass|RdErl\\.)\\s+vom\\s+${DATE}\\s*\\(([^)]*)\\)\\s+geändert\\s+worden\\s+ist`, 'u').exec(text);
  if (predecessor) {
    entry.predecessor = { latest: Boolean(predecessor[1]), dateText: predecessor[2]!, citationText: predecessor[3]!.trim() };
    const date = isoOf(predecessor[2]!);
    if (date) entry.predecessor.date = date;
  }
  for (const item of allByClass(document, 'attachment-item')) {
    const link = findFirst(item, (element) => element.tagName === 'a');
    const href = link ? attr(link, 'href') : undefined;
    if (href) entry.attachments.push({ label: textOf(byClass(item, 'field--field_publictitle')) || textOf(link), url: new URL(href, BASE_URL).toString() });
  }
  return entry;
}

/** Inkrafttreten eines Änderungserlasses aus Klausel und Veröffentlichungsdatum – nie geraten. */
export function resolveInForceDate(entry: Pick<GazetteEntry, 'inForce' | 'publishedOn'>): { date?: string; derivation: string } {
  if (!entry.inForce) return { derivation: 'Keine Inkrafttretensklausel erkannt' };
  if (entry.inForce.kind === 'day-after-publication') {
    if (!entry.publishedOn) return { derivation: 'Tag nach der Veröffentlichung, Veröffentlichungsdatum fehlt' };
    return { date: nextDay(entry.publishedOn), derivation: `Tag nach der Veröffentlichung am ${entry.publishedOn}` };
  }
  if (entry.inForce.date) return { date: entry.inForce.date, derivation: entry.inForce.kind === 'retroactive-date' ? 'mit Wirkung vom genannten Datum' : 'genanntes Datum' };
  return { derivation: 'Datum der Klausel nicht lesbar' };
}

/** Kandidatenadressen eines Ministerialblatt-Eintrags aus der Fundstelle. */
export function gazetteEntryUrlCandidates(citation: GazetteCitation): string[] {
  if (citation.gazette !== 'MBl. NRW.' || !citation.page) return [];
  const base = `${BASE_URL}/mblnrw/${citation.year}-s${citation.page}`;
  return /[a-z]$/u.test(citation.page) ? [base] : [base, `${base}-0`, `${base}-1`, `${base}-2`];
}

/** Belegt, dass ein Ministerialblatt-Eintrag die Vorschrift mit Ausfertigungsdatum und Fundstelle nennt. */
export function identifiesBaseDocument(entry: Pick<GazetteEntry, 'baseReferences'>, base: { issuedOn?: string; citation?: GazetteCitation }): { ok: boolean; reason: string } {
  if (!base.issuedOn) return { ok: false, reason: 'Ausfertigungsdatum der Vorschrift unbekannt; Zuordnung wäre geraten' };
  const basePage = base.citation?.page?.replace(/[a-z]$/u, '');
  const byDate = entry.baseReferences.filter((reference) => reference.date === base.issuedOn);
  if (byDate.length === 0) return { ok: false, reason: `Eintrag nennt die Vorschrift vom ${base.issuedOn} nicht` };
  if (!basePage) return { ok: false, reason: 'Fundstelle der Vorschrift unbekannt; Zuordnung nur über das Datum wäre unsicher' };
  if (!byDate.some((reference) => reference.page === basePage)) return { ok: false, reason: `Eintrag nennt die Vorschrift vom ${base.issuedOn}, aber nicht mit der Fundstelle S. ${basePage}` };
  return { ok: true, reason: `Eintrag nennt die Vorschrift vom ${base.issuedOn} (MBl. NRW. S. ${basePage})` };
}

export { previousDay };
