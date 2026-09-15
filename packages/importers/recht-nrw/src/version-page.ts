/**
 * Parser der Drupal-Fassungsseite von RECHT.NRW (`/lrgv/<typ>/<TTMMJJJJ>-<slug>`).
 *
 * Liefert Metadaten (Titel, Infobox mit Ausfertigungsdatum, Gültig ab/bis, Fundstelle,
 * Vollzitat, Änderungshistorie, Anlagen), die Fassungsliste, die Stammnorm-Kennung und das
 * Textformat: entweder eine Legacy-Datei (`/system/files/BH/<id>.htm` im iframe) oder natives
 * Drupal-Markup (`section.legaldoc-article`). Unbekannte Infobox-Felder werden gemeldet.
 */
import { serialize } from 'parse5';

import { BASE_URL } from './constants.ts';
import { allByClass, allByTag, attr, byClass, byId, descendants, findFirst, hasClass, parseHtml, textOf, type HtmlElement } from './html.ts';
import { normalizeVersionUrl, parseGermanDate, parseTaxonomyTermId, parseVersionUrl, type RechtNrwVersionAddress } from './source-identity.ts';

export interface VersionListEntry {
  /** Geltungsbeginn („vom 19.12.2008“). */
  validFrom: string;
  /** Absolute URL; fehlt bei „(nicht darstellbar)“ und bei der aktuellen Seite. */
  url?: string;
  isCurrentPage: boolean;
  notRenderable: boolean;
  label: string;
}

export interface AttachmentLink {
  label: string;
  url: string;
  mediaType: 'text/html' | 'application/pdf' | 'unknown';
  accessible?: boolean;
}

export interface VersionPageFinding {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface RechtNrwVersionPage {
  address: RechtNrwVersionAddress;
  title: string;
  stemTermId?: string;
  validFrom?: string;
  validTo?: string;
  issuedOn?: string;
  /** „Verkündet durch GV. NRW. 2015 S. 211“ */
  promulgation?: string;
  fullCitation?: string;
  changeHistory?: string;
  versions: VersionListEntry[];
  attachments: AttachmentLink[];
  pdfUrl?: string;
  content: { format: 'legacy-file'; fileUrl: string } | { format: 'native'; bodyHtml: string };
  /** Alle Beschriftungen der Infobox (für Diagnose unbekannter Felder). */
  infoFields: Record<string, string>;
  findings: VersionPageFinding[];
}

const KNOWN_INFO_FIELDS = new Set(['Ausfertigungsdatum', 'Gültig ab', 'Gültig bis', 'Verkündet durch', 'Vollzitat']);

function absolute(href: string): string {
  return new URL(href, BASE_URL).toString();
}

function mediaTypeOf(href: string): AttachmentLink['mediaType'] {
  if (/\.pdf(?:$|\?)/iu.test(href)) return 'application/pdf';
  if (/\.html?(?:$|\?)/iu.test(href)) return 'text/html';
  return 'unknown';
}

function serializeInner(element: HtmlElement): string {
  return serialize(element);
}

export function parseVersionPage(html: string, requestedUrl: string): RechtNrwVersionPage {
  const findings: VersionPageFinding[] = [];
  const address = parseVersionUrl(requestedUrl);
  if (!address) throw new Error(`${requestedUrl}: keine RECHT.NRW-Fassungsadresse (/lrgv/<typ>/<TTMMJJJJ>-<slug>)`);
  const document = parseHtml(html);

  const h1 = findFirst(document, (element) => element.tagName === 'h1');
  const title = textOf(h1);
  if (!title) findings.push({ severity: 'error', code: 'missing-title', message: 'Kein <h1>-Titel auf der Fassungsseite' });

  // Infobox: Beschriftung (field__label) + Wert (field__item)
  const infoFields: Record<string, string> = {};
  const infoBox = byId(document, 'block-rnrw-legal-document-info-box');
  if (!infoBox) findings.push({ severity: 'error', code: 'missing-info-box', message: 'Infobox der Fassung fehlt' });
  for (const item of infoBox ? allByClass(infoBox, 'info-box-item') : []) {
    const label = textOf(byClass(item, 'field__label'));
    const value = textOf(byClass(item, 'field__item'));
    if (!label) continue;
    infoFields[label] = value;
    if (!KNOWN_INFO_FIELDS.has(label)) findings.push({ severity: 'warning', code: 'unknown-info-field', message: `Unbekanntes Infobox-Feld „${label}“: ${value.slice(0, 80)}` });
  }
  const validFrom = parseGermanDate(infoFields['Gültig ab']);
  const validTo = parseGermanDate(infoFields['Gültig bis']);
  if (!validFrom) findings.push({ severity: 'error', code: 'missing-valid-from', message: 'Infobox nennt kein „Gültig ab“' });
  if (validFrom && validFrom !== address.pathDate) findings.push({ severity: 'warning', code: 'path-date-mismatch', message: `„Gültig ab“ ${validFrom} weicht vom Datum im Pfad ${address.pathDate} ab` });
  if (validFrom && validTo && validTo < validFrom) findings.push({ severity: 'error', code: 'invalid-validity-interval', message: `„Gültig bis“ ${validTo} liegt vor „Gültig ab“ ${validFrom}` });

  // Änderungshistorie / Vollzitat (Kopfanhänge)
  let changeHistory: string | undefined;
  for (const item of allByClass(document, 'change-history-item')) {
    const text = textOf(item);
    if (text) changeHistory = changeHistory ? `${changeHistory}\n${text}` : text;
  }

  // Fassungsliste
  const versions: VersionListEntry[] = [];
  for (const item of allByClass(document, 'version-item')) {
    const label = textOf(item);
    const link = findFirst(item, (element) => element.tagName === 'a');
    const dateMatch = /vom (\d{2}\.\d{2}\.\d{4})/u.exec(label);
    const date = parseGermanDate(dateMatch?.[1]);
    if (!date) {
      findings.push({ severity: 'error', code: 'unparsable-version-entry', message: `Fassungseintrag ohne Datum: „${label}“` });
      continue;
    }
    const entry: VersionListEntry = {
      validFrom: date,
      isCurrentPage: /aktuelle Seite/u.test(label),
      notRenderable: /nicht darstellbar/u.test(label),
      label,
    };
    const href = link ? attr(link, 'href') : undefined;
    if (href) entry.url = normalizeVersionUrl(href);
    versions.push(entry);
  }
  if (versions.length === 0) findings.push({ severity: 'error', code: 'missing-version-list', message: 'Keine Fassungsliste gefunden' });
  if (!versions.some((entry) => entry.isCurrentPage)) findings.push({ severity: 'warning', code: 'current-page-not-marked', message: 'Die Fassungsliste markiert die aktuelle Seite nicht' });

  // Stammnorm (Link zur aktuellsten Fassung)
  const latestLink = descendants(document, (element) => element.tagName === 'a' && hasClass(element, 'copy-url')).map((element) => attr(element, 'href')).find((href) => href?.includes('/taxonomy/term/'));
  const stemTermId = parseTaxonomyTermId(latestLink);
  if (!stemTermId) findings.push({ severity: 'error', code: 'missing-stem-id', message: 'Kein Link zur aktuellsten Fassung (Stammnorm-Term) gefunden' });

  // Anlagen und PDF
  const attachments: AttachmentLink[] = [];
  for (const item of allByClass(document, 'attachment-item')) {
    const link = findFirst(item, (element) => element.tagName === 'a');
    const href = link ? attr(link, 'href') : undefined;
    if (!href) continue;
    const label = textOf(byClass(item, 'field--field_publictitle')) || textOf(link);
    const accessibleText = textOf(byClass(item, 'field--field_is_accessible'));
    const attachment: AttachmentLink = { label, url: absolute(href), mediaType: mediaTypeOf(href) };
    if (accessibleText) attachment.accessible = /^Barrierefrei$/iu.test(accessibleText);
    attachments.push(attachment);
  }
  let pdfUrl: string | undefined;
  for (const link of allByTag(document, 'a')) {
    const href = attr(link, 'href');
    if (href && /\/system\/files\/pdf\/.*\.pdf$/iu.test(href) && attr(link, 'download') !== undefined) pdfUrl = absolute(href);
  }

  // Textformat
  let content: RechtNrwVersionPage['content'] | undefined;
  const iframe = findFirst(document, (element) => element.tagName === 'iframe' && (attr(element, 'src') ?? '').includes('/system/files/'));
  const body = byClass(document, 'field--field_body');
  const contentBlock = byId(document, 'block-rnrw-content');
  if (iframe) {
    content = { format: 'legacy-file', fileUrl: absolute(attr(iframe, 'src')!) };
  } else if (body) {
    content = { format: 'native', bodyHtml: serializeInner(contentBlock ?? body) };
  } else {
    findings.push({ severity: 'error', code: 'missing-content', message: 'Weder Legacy-Datei (iframe) noch natives Dokument gefunden' });
    content = { format: 'native', bodyHtml: '' };
  }

  const page: RechtNrwVersionPage = { address, title, versions, attachments, content, infoFields, findings };
  if (stemTermId) page.stemTermId = stemTermId;
  if (validFrom) page.validFrom = validFrom;
  if (validTo) page.validTo = validTo;
  const issuedOn = parseGermanDate(infoFields['Ausfertigungsdatum']);
  if (issuedOn) page.issuedOn = issuedOn;
  if (infoFields['Verkündet durch']) page.promulgation = infoFields['Verkündet durch'];
  if (infoFields['Vollzitat']) page.fullCitation = infoFields['Vollzitat'];
  if (changeHistory) page.changeHistory = changeHistory;
  if (pdfUrl) page.pdfUrl = pdfUrl;
  return page;
}

