/**
 * Normalisierung: Fassungsseite + geparster Text (+ Anlagen) → `RechtNrwSourceLaw`, der
 * Zwischenzustand mit dem realen Recht des Landes Nordrhein-Westfalen. Hier wird nichts
 * transformiert: Titel, Abkürzung, Fundstelle und Text bleiben exakt Nordrhein-Westfalen.
 */
import type { NormBodyBlock, NormType, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import type { ImportFinding, SourceLaw } from '@landesrecht/importer-common/pipeline.ts';

import type { BodyStats, SourceFootnote } from '../common/body-common.ts';
import { PARSER_VERSION, SOURCE_SYSTEM } from '../common/constants.ts';
import type { FetchedDocument } from '../common/fetcher.ts';
import { parseGermanLongDate, stemIdentifier } from '../common/source-identity.ts';
import type { RechtNrwVersionPage } from '../common/version-page.ts';

export interface RechtNrwSourceLaw extends SourceLaw {
  portal: 'recht-nrw';
  stemTermId: string;
  versionUrl: string;
  contentFormat: 'legacy-file' | 'native';
  /** Alle bekannten Fassungen der Stammnorm (Geltungsbeginn, URL). */
  versionList: Array<{ validFrom: string; url?: string; notRenderable: boolean }>;
  footnotes: SourceFootnote[];
  annexes: Array<{ label: string; sourceUrl: string; mediaType: string; parsed: boolean; findings: ImportFinding[] }>;
  stats: BodyStats;
  parserVersion: string;
  rawDocuments: Array<{ role: 'version-page' | 'legacy-text' | 'annex' | 'pdf'; url: string; finalUrl: string; sha256: string; contentType: string; retrievedAt: string; byteLength: number; localSource?: string }>;
}

export interface NormalizeInput {
  page: RechtNrwVersionPage;
  pageDocument: FetchedDocument;
  body: { blocks: NormBodyBlock[]; footnotes: SourceFootnote[]; findings: ImportFinding[]; stats: BodyStats; titleLines?: string[]; issuedLine?: string; citationNote?: string };
  textDocument?: FetchedDocument;
  annexes?: Array<{ label: string; document: FetchedDocument; blocks: NormBodyBlock[]; findings: ImportFinding[]; parsed: boolean }>;
  pdfDocument?: FetchedDocument;
  /** Relative Repositorypfade der archivierten Rohquellen (Schlüssel: sha256). */
  archivedPaths?: Record<string, string>;
}

const DOCUMENT_TYPE_MAP: Record<string, NormType> = {
  gesetz: 'gesetz',
  rechtsverordnung: 'verordnung',
  verwaltungsvorschrift: 'verwaltungsvorschrift',
  bekanntmachung: 'bekanntmachung',
};

/**
 * Zerlegt den RECHT.NRW-Titel in Langtitel, Kurzbezeichnung und Abkürzung:
 *   „Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)“
 *   „Abgeordnetengesetz des Landes Nordrhein-Westfalen – AbgG NRW –“
 *   „Gesetz über den öffentlichen Personennahverkehr in Nordrhein-Westfalen - ÖPNVG NRW -“
 *   „Hebammengebührenordnung Nordrhein-Westfalen (HebGO NRW)“
 */
export function splitTitle(raw: string): { title: string; shortTitle?: string; abbr?: string } {
  let title = raw.replace(/\s+/gu, ' ').trim();
  let shortTitle: string | undefined;
  let abbr: string | undefined;

  // 1. Erste Klammergruppe mit Kurzbezeichnung/Abkürzung: „(Verwaltungsverfahrensgesetz NRW – VwVfG NRW)“, „(GO NRW)“
  const parenthesized = /\(([^()]+)\)/u.exec(title);
  if (parenthesized) {
    const inner = parenthesized[1]!.trim();
    const parts = inner.split(/\s+[–-]\s+/u).map((part) => part.trim()).filter(Boolean);
    let consumed = false;
    if (parts.length >= 2 && looksLikeAbbreviation(parts[parts.length - 1]!)) {
      shortTitle = parts.slice(0, -1).join(' – ');
      abbr = parts[parts.length - 1];
      consumed = true;
    } else if (parts.length === 1 && looksLikeAbbreviation(inner)) {
      abbr = inner;
      consumed = true;
    } else if (parts.length === 1 && /gesetz|ordnung|verordnung/iu.test(inner) && inner.split(' ').length <= 6) {
      shortTitle = inner;
      consumed = true;
    }
    if (consumed) title = `${title.slice(0, parenthesized.index)}${title.slice(parenthesized.index + parenthesized[0].length)}`.replace(/\s+/gu, ' ').replace(/\s+([,;.])/gu, '$1').trim();
  }
  // 2. Nachgestellte Abkürzung in Gedankenstrichen: „… – AbgG NRW –“
  const dashed = /^(.*?)\s+[–-]\s+([^–-]+?)\s+[–-]\s*$/u.exec(title);
  if (dashed && !abbr && looksLikeAbbreviation(dashed[2]!.trim())) {
    title = dashed[1]!.trim();
    abbr = dashed[2]!.trim();
  }
  const result: { title: string; shortTitle?: string; abbr?: string } = { title: title.replace(/[,;]\s*$/u, '').trim() };
  if (shortTitle) result.shortTitle = shortTitle;
  if (abbr) result.abbr = abbr;
  return result;
}

export function looksLikeAbbreviation(value: string): boolean {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (compact.length > 24) return false;
  const words = compact.split(' ');
  return words.every((word) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9.-]*$/u.test(word) && (/[A-Z].*[A-Z]/u.test(word) || /^[A-ZÄÖÜ]{2,}/u.test(word) || word === 'NRW' || /^\d/u.test(word) || /\.$/u.test(word))) && words.length <= 4;
}

function sourceReference(entry: RechtNrwSourceLaw['rawDocuments'][number], label: string, page: RechtNrwVersionPage, role: SourceReference['sourceRole']): SourceReference {
  const reference: SourceReference = {
    kind: entry.role === 'pdf' ? 'primary-pdf' : 'official-portal-snapshot',
    system: SOURCE_SYSTEM,
    label,
    availability: entry.localSource ? 'versioned' : 'external',
    url: entry.finalUrl,
    retrievedAt: entry.retrievedAt.slice(0, 10),
    sha256: entry.sha256,
    externalId: `term:${page.stemTermId ?? '?'}`,
    mediaType: entry.role === 'pdf' ? 'application/pdf' : 'text/html',
  };
  if (entry.localSource) reference.localSource = entry.localSource;
  if (page.validFrom) reference.sourceValidFrom = page.validFrom;
  if (page.validTo) reference.sourceValidTo = page.validTo;
  if (role) reference.sourceRole = role;
  return reference;
}

export function normalizeSourceLaw(input: NormalizeInput): RechtNrwSourceLaw {
  const { page, body } = input;
  const findings: ImportFinding[] = [...page.findings, ...body.findings];
  if (!page.stemTermId) findings.push({ severity: 'error', code: 'missing-stem-id', message: 'Ohne Stammnorm-Kennung ist keine stabile Quellidentität möglich' });

  const { title, shortTitle, abbr } = splitTitle(page.title);
  const documentType = DOCUMENT_TYPE_MAP[page.address.documentType] ?? 'gesetz';
  const issuedOn = page.issuedOn ?? parseGermanLongDate(body.issuedLine);
  if (!issuedOn) findings.push({ severity: 'warning', code: 'missing-issue-date', message: 'Ausfertigungsdatum weder in der Infobox noch im Text („Vom …“) gefunden' });

  const citation = page.promulgation
    ? `${title} vom ${formatIssued(issuedOn)} (${page.promulgation.replace(/^Verkündet durch\s*/u, '')})`
    : body.citationNote
      ? `${title} vom ${formatIssued(issuedOn)} (${body.citationNote.split(/[;,]/u)[0]!.trim()})`
      : `${title} vom ${formatIssued(issuedOn)}`;

  const rawDocuments: RechtNrwSourceLaw['rawDocuments'] = [];
  const pushRaw = (role: RechtNrwSourceLaw['rawDocuments'][number]['role'], document: FetchedDocument): RechtNrwSourceLaw['rawDocuments'][number] => {
    const entry: RechtNrwSourceLaw['rawDocuments'][number] = {
      role,
      url: document.url,
      finalUrl: document.finalUrl,
      sha256: document.sha256,
      contentType: document.contentType,
      retrievedAt: document.retrievedAt,
      byteLength: document.bytes.byteLength,
    };
    const local = input.archivedPaths?.[document.sha256];
    if (local) entry.localSource = local;
    rawDocuments.push(entry);
    return entry;
  };
  const pageEntry = pushRaw('version-page', input.pageDocument);
  const textEntry = input.textDocument ? pushRaw('legacy-text', input.textDocument) : undefined;
  const sourceReferences: SourceReference[] = [sourceReference(pageEntry, `RECHT.NRW-Fassungsseite, gültig ab ${page.validFrom ?? '?'}`, page, 'official-snapshot')];
  if (textEntry) sourceReferences.push(sourceReference(textEntry, 'RECHT.NRW-Textdokument (Legacy-Datei) dieser Fassung', page, 'structure-bearing'));

  const blocks: NormBodyBlock[] = [...body.blocks];
  const annexes: RechtNrwSourceLaw['annexes'] = [];
  for (const annex of input.annexes ?? []) {
    const entry = pushRaw('annex', annex.document);
    sourceReferences.push(sourceReference(entry, `RECHT.NRW-Anlage: ${annex.label}`, page, 'structure-bearing'));
    annexes.push({ label: annex.label, sourceUrl: annex.document.finalUrl, mediaType: annex.document.contentType, parsed: annex.parsed, findings: annex.findings });
    findings.push(...annex.findings);
    if (annex.parsed) {
      const hasAnnexContainer = annex.blocks.length === 1 && annex.blocks[0]!.type === 'annex';
      if (hasAnnexContainer) blocks.push(annex.blocks[0]!);
      else blocks.push({ type: 'annex', label: annex.label, children: annex.blocks });
    } else if (!/pdf/iu.test(annex.document.contentType)) {
      findings.push({ severity: 'error', code: 'annex-not-parsed', message: `Anlage „${annex.label}“ (${annex.document.contentType}) konnte nicht als Text übernommen werden` });
    }
  }
  if (input.pdfDocument) {
    const entry = pushRaw('pdf', input.pdfDocument);
    sourceReferences.push(sourceReference(entry, 'RECHT.NRW-PDF der konsolidierten Fassung (visuelle Kontrolle)', page, 'visual-control'));
  }

  const changeHistory = page.changeHistory ?? body.citationNote;
  const law: RechtNrwSourceLaw = {
    portal: 'recht-nrw',
    externalIdentifiers: page.stemTermId ? [stemIdentifier(page.stemTermId)] : [],
    title,
    type: documentType,
    citation,
    subjects: [],
    keywords: [],
    body: blocks,
    sourceReferences,
    findings,
    stemTermId: page.stemTermId ?? '',
    versionUrl: page.address.url,
    contentFormat: page.content.format,
    versionList: page.versions.map((entry) => (entry.url ? { validFrom: entry.validFrom, url: entry.url, notRenderable: entry.notRenderable } : { validFrom: entry.validFrom, notRenderable: entry.notRenderable })),
    footnotes: body.footnotes,
    annexes,
    stats: { ...body.stats, annexes: body.stats.annexes + annexes.filter((annex) => annex.parsed).length },
    parserVersion: PARSER_VERSION,
    rawDocuments,
    sourceIdentity: page.stemTermId ? stemIdentifier(page.stemTermId).value : undefined,
    sourceUrl: page.address.url,
  };
  if (shortTitle) law.shortTitle = shortTitle;
  if (abbr) law.abbr = abbr;
  if (page.validFrom) law.sourceValidFrom = page.validFrom;
  if (page.validTo) law.sourceValidTo = page.validTo;
  if (issuedOn) law.documentDate = issuedOn;
  if (page.pdfUrl) law.pdfUrl = page.pdfUrl;
  if (page.fullCitation) law.fullCitation = page.fullCitation;
  if (changeHistory) law.changeHistory = changeHistory;
  if (body.footnotes.length > 0) law.sourceNotes = body.footnotes.map((footnote) => ({ label: footnote.label, text: footnote.text }));
  return law;
}

function formatIssued(iso: string | undefined): string {
  if (!iso) return 'unbekanntem Datum';
  const [year, month, day] = iso.split('-');
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${Number.parseInt(day!, 10)}. ${months[Number.parseInt(month!, 10) - 1]} ${year}`;
}
