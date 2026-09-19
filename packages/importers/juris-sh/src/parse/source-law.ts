/**
 * Geparste juris-Ausgabe → `SourceLaw` (reales Recht Schleswig-Holsteins, noch nicht übergeleitet) und
 * Stichtagseinordnung der Ausgabe.
 *
 * Quellidentität ist die juris-DOKNR; stabile Adresse ist der Permalink „genau dieses Dokument“
 * (`/perma?d=<DOKNR>`). Die Rohquelle ist die PDF-Ausgabe (Gesamtausgabe, `docPart: "X"`) mit SHA-256 und
 * Abrufzeit; sie ist `structure-bearing`.
 *
 * Nur Metadaten, die die Ausgabe selbst nennt, werden übernommen: Normtyp aus „Dokumenttyp“ (Verfassung und
 * Zustimmungsgesetz nur aus dem Titelwortlaut), Abkürzung nur aus „Amtliche Abkürzung“ (die juris-Abkürzung
 * ist keine amtliche), Datum aus „Ausfertigungsdatum“/„Neugefasst“/„Erlassdatum“, Fundstelle aus „Fundstelle“.
 */
import { retrievalDate, type ImportFinding, type SourceLaw } from '@landesrecht/importer-common/pipeline.ts';
import type { NormType, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

import { permaUrl } from '../access/policy.ts';
import { BASELINE_DATE } from '../common/constants.ts';
import { isoDate, type ParsedJurisPdf } from './juris-pdf.ts';

export interface SourceDocument {
  documentId: string;
  area: 'landesrecht' | 'vwv';
  url: string;
  sha256: string;
  retrievedAt: string;
  byteLength: number;
}

export const SYSTEM = 'juris-sh';
export const GLIEDERUNG_SYSTEM = 'gliederungsnummer-sh';

/** Titel ohne Datumszeile („Vom 18. Juni 2018“), Kurzbezeichnung und Abkürzung aus der Klammer. */
export function splitTitle(title: string): { title: string; shortTitle?: string; abbrInTitle?: string; dateLine?: string } {
  const dateMatch = /\s+(Vom\s+\d{1,2}\.\s*\S+\s+\d{4}.*)$/u.exec(title);
  const main = dateMatch ? title.slice(0, dateMatch.index).trim() : title.trim();
  const paren = /\(([^()]+?)\s+[-–]\s+([^()]+?)(?:\s+[-–])?\s*\)\s*$/u.exec(main);
  return {
    title: main,
    ...(paren ? { shortTitle: paren[1]!.trim(), abbrInTitle: paren[2]!.trim() } : {}),
    ...(dateMatch ? { dateLine: dateMatch[1]! } : {}),
  };
}

export function normType(parsed: ParsedJurisPdf, isVwv: boolean): NormType {
  if (isVwv) return 'verwaltungsvorschrift';
  if (/^Verfassung des Landes/u.test(parsed.title)) return 'verfassung';
  if (/^Gesetz zu dem (?:Staatsvertrag|Abkommen|Vertrag|Übereinkommen)/u.test(parsed.title)) return 'zustimmungsgesetz';
  const type = parsed.header.Dokumenttyp ?? '';
  if (/Verordnung/u.test(type)) return 'verordnung';
  return 'gesetz';
}

/**
 * Datum der letzten berücksichtigten Änderung aus dem Vermerk „Stand: letzte berücksichtigte Änderung: …
 * (LVO v. 04.05.2026, …)“ – das späteste genannte Ausfertigungsdatum eines Änderungsakts.
 */
export function standAmendmentDate(stand: string | undefined): string | undefined {
  if (!stand) return undefined;
  const dates = [...stand.matchAll(/\bv(?:om)?\.?\s+(\d{1,2}\.\d{1,2}\.\d{4})/gu)].map((match) => isoDate(match[1]!)).filter((value): value is string => value !== undefined);
  return dates.sort().at(-1);
}

/** Stichtagseinordnung allein aus der Ausgabe (Kopf, Ausgabevermerk, Verzeichnis, Stand-Vermerk). */
export type EditionBaseline =
  | { class: 'unchanged-since-baseline'; basis: string }
  | { class: 'changed-after-baseline'; basis: string; changedUnits: string[] }
  | { class: 'enacted-after-baseline'; basis: string }
  | { class: 'repealed-before-baseline'; basis: string }
  | { class: 'repealed-after-baseline'; basis: string }
  | { class: 'undetermined'; basis: string };

export function classifyEdition(parsed: ParsedJurisPdf, isVwv: boolean, baseline = BASELINE_DATE): EditionBaseline {
  const validFrom = isoDate(parsed.header['Gültig ab']);
  const validTo = isoDate(parsed.header['Gültig bis']);
  const enacted = validFrom ?? isoDate(parsed.header.Ausfertigungsdatum) ?? isoDate(parsed.header.Erlassdatum);
  // „Gültig bis“ ist der letzte Geltungstag: Wer bis zum Stichtag selbst gilt, galt am Stichtag.
  if (validTo && validTo < baseline) return { class: 'repealed-before-baseline', basis: `Gültig bis ${validTo}` };
  if (enacted && enacted > baseline && !parsed.header['Textnachweis ab']) return { class: 'enacted-after-baseline', basis: `Gültig ab ${enacted}` };
  // Fußnote zum Titel mit befristeter Geltung („Fristablauf 31.12.2004“, „tritt … außer Kraft“) vor dem Stichtag,
  // ohne dass der Kopf ein Ende nennt: Ob die Norm verlängert wurde, sagt die Ausgabe nicht – Review.
  const titleNote = parsed.titleFootnoteLines.map((line) => line.text).join(' ');
  const expiry = /(?:Fristablauf|außer\s+Kraft|Geltungsdauer|befristet)[^.;]*?(\d{2}\.\d{2}\.\d{4})/u.exec(titleNote);
  const expiryDate = expiry ? isoDate(expiry[1]) : undefined;
  if (!validTo && expiryDate && expiryDate < baseline) return { class: 'undetermined', basis: `Fußnote zum Titel: „${expiry![0].slice(0, 80)}“ (vor dem Stichtag), Kopf ohne „Gültig bis“` };
  if (parsed.body.length === 0 || parsed.statusNote) {
    if (validTo && validTo > baseline) return { class: 'repealed-after-baseline', basis: `Gültig bis ${validTo}; Ausgabe ohne Normtext (${parsed.statusNote ?? 'kein Text'})` };
    return { class: 'undetermined', basis: 'Ausgabe ohne Normtext' };
  }
  if (isVwv) {
    const version = isoDate(parsed.header['Fassung vom']);
    if (!version) return { class: 'undetermined', basis: 'VwV ohne „Fassung vom“' };
    if (version > baseline || (validFrom && validFrom > baseline)) return { class: 'changed-after-baseline', basis: `Fassung vom ${version}, gültig ab ${validFrom ?? '?'}`, changedUnits: [] };
    return { class: 'unchanged-since-baseline', basis: `Fassung vom ${version}, gültig ab ${validFrom ?? '?'}${validTo ? `, gültig bis ${validTo}` : ''}` };
  }
  if (parsed.edition?.validFrom) {
    if (parsed.edition.validFrom > baseline) return { class: 'changed-after-baseline', basis: `Gesamtausgabe gültig ab ${parsed.edition.validFrom}`, changedUnits: parsed.toc.filter((entry) => entry.validFrom && entry.validFrom > baseline).map((entry) => entry.label ?? entry.title) };
  }
  if (parsed.toc.length === 0) return { class: 'undetermined', basis: 'kein Verzeichnis mit Gültigkeitsdaten' };
  const changed = parsed.toc.filter((entry) => entry.validFrom && entry.validFrom > baseline);
  const undated = parsed.toc.filter((entry) => !entry.validFrom);
  if (undated.length > 0) return { class: 'undetermined', basis: `${undated.length} Verzeichniseinträge ohne Gültigkeitsdatum` };
  if (changed.length > 0) return { class: 'changed-after-baseline', basis: `${changed.length} Einheit(en) mit Fassung ab ${changed.map((entry) => entry.validFrom).sort().at(-1)}`, changedUnits: changed.map((entry) => entry.label ?? entry.title) };
  const latest = parsed.toc.map((entry) => entry.validFrom!).sort().at(-1)!;
  // Gegenprobe mit dem Stand-Vermerk: Eine nach dem Stichtag ausgefertigte Änderung, die sich in keinem
  // Einheitsdatum zeigt, heißt Rückwirkung oder weggefallene Einheit – beides trägt die heutige Ausgabe
  // nicht als Stichtagsfassung.
  const standDate = standAmendmentDate(parsed.stand);
  if (standDate && standDate > baseline) return { class: 'undetermined', basis: `alle ${parsed.toc.length} Einheiten gültig spätestens ab ${latest}, aber letzte berücksichtigte Änderung vom ${standDate} (nach dem Stichtag: Rückwirkung oder weggefallene Einheit)` };
  return { class: 'unchanged-since-baseline', basis: `alle ${parsed.toc.length} Einheiten gültig spätestens ab ${latest}${parsed.edition?.validFrom ? `; Gesamtausgabe gültig ab ${parsed.edition.validFrom}` : ''}${standDate ? `; letzte berücksichtigte Änderung vom ${standDate}` : ''}` };
}

export function toSourceLaw(parsed: ParsedJurisPdf, document: SourceDocument): { law: SourceLaw; findings: ImportFinding[] } {
  const isVwv = document.area === 'vwv';
  const findings: ImportFinding[] = parsed.findings.map((finding) => ({ severity: finding.severity, code: finding.code, message: finding.message }));
  const titleParts = splitTitle(parsed.title || parsed.mainDocument || '');
  const officialAbbr = parsed.header['Amtliche Abkürzung'];
  const abbr = officialAbbr && officialAbbr !== '-' ? officialAbbr : undefined;
  if (abbr && titleParts.abbrInTitle && titleParts.abbrInTitle.replace(/\s+-$/u, '') !== abbr) findings.push({ severity: 'info', code: 'abbr-title-differs', message: `Abkürzung im Titel „${titleParts.abbrInTitle}“, amtliche Abkürzung „${abbr}“` });
  const glNr = parsed.header['Gliederungs-Nr'];
  const hasGlNr = glNr !== undefined && glNr !== '' && glNr !== '-' && glNr !== '0' && !/keine Angaben/u.test(glNr);
  const latestUnit = parsed.toc.map((entry) => entry.validFrom).filter((value): value is string => value !== undefined).sort().at(-1);
  const sourceValidFrom = parsed.edition?.validFrom ?? (isVwv ? isoDate(parsed.header['Gültig ab']) : latestUnit ?? isoDate(parsed.header['Gültig ab']));
  const sourceValidTo = parsed.edition?.validTo ?? isoDate(parsed.header['Gültig bis']);
  const documentDate = isoDate(parsed.header.Ausfertigungsdatum) ?? isoDate(parsed.header.Neugefasst) ?? isoDate(parsed.header.Erlassdatum);
  const fundstelle = parsed.header.Fundstelle ?? parsed.header.Fundstellen;
  const citation = fundstelle ? `${fundstelle}` : `juris ${document.documentId}`;
  const reference: SourceReference = {
    kind: 'official-portal-snapshot',
    system: SYSTEM,
    label: `Bürgerservice Schleswig-Holstein (juris), PDF-${isVwv ? 'Ausgabe' : 'Gesamtausgabe'} ${document.documentId}`,
    availability: 'external',
    url: document.url,
    retrievedAt: retrievalDate(document.retrievedAt),
    sha256: document.sha256,
    externalId: document.documentId,
    mediaType: 'application/pdf',
    pageCount: parsed.pages,
    sourceRole: 'structure-bearing',
    ...(sourceValidFrom ? { sourceValidFrom } : {}),
    ...(sourceValidTo ? { sourceValidTo } : {}),
    ...(hasGlNr ? { sourceNumber: glNr } : {}),
    note: `Permalink „genau dieses Dokument“: ${permaUrl(document.documentId)}. Abruf über die dokumentierte PDF-Ausgabe mit anonymer Sitzung eines öffentlichen Permalink-Aufrufs.`,
  };
  const sourceNotes: Array<{ label: string; text: string }> = [];
  if (parsed.edition) sourceNotes.push({ label: 'Ausgabe (juris)', text: parsed.edition.text });
  if (parsed.stand) sourceNotes.push({ label: 'Stand (juris)', text: parsed.stand });
  if (isVwv && parsed.header.Normgeber) sourceNotes.push({ label: 'Normgeber (Quelle)', text: parsed.header.Normgeber });
  if (isVwv && parsed.header.Aktenzeichen) sourceNotes.push({ label: 'Aktenzeichen (Quelle)', text: parsed.header.Aktenzeichen });
  const law: SourceLaw = {
    portal: 'juris-sh',
    externalIdentifiers: [
      { system: SYSTEM, value: document.documentId, url: permaUrl(document.documentId) },
      ...(hasGlNr ? [{ system: GLIEDERUNG_SYSTEM, value: glNr }] : []),
    ],
    title: titleParts.title,
    ...(titleParts.shortTitle && titleParts.shortTitle !== titleParts.title ? { shortTitle: titleParts.shortTitle } : {}),
    ...(abbr ? { abbr } : {}),
    type: normType(parsed, isVwv),
    ...(sourceValidFrom ? { sourceValidFrom } : {}),
    ...(sourceValidTo ? { sourceValidTo } : {}),
    ...(documentDate ? { documentDate } : {}),
    citation,
    subjects: [],
    keywords: [],
    body: parsed.body,
    ...(sourceNotes.length > 0 ? { sourceNotes } : {}),
    sourceReferences: [reference],
    findings,
    sourceIdentity: document.documentId,
    sourceUrl: permaUrl(document.documentId),
    pdfUrl: document.url,
    fullCitation: `${titleParts.title}${titleParts.dateLine ? ` ${titleParts.dateLine.replace(/^Vom/u, 'vom')}` : ''} (${citation})`,
    ...(parsed.stand ? { changeHistory: parsed.stand } : {}),
  };
  return { law, findings };
}
