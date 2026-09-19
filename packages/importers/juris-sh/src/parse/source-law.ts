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
/** Amtliche Fundstelle der Stammfassung (strukturiert, amtliche Schreibweise). */
export const OFFICIAL_CITATION_SYSTEM = 'amtliche-fundstelle-sh';

/** Titel ohne Datumszeile („Vom 18. Juni 2018“), Kurzbezeichnung und Abkürzung aus der Klammer. */
export function splitTitle(title: string): { title: string; shortTitle?: string; abbrInTitle?: string; dateLine?: string; promulgation?: string } {
  // Datumszeile der Überschrift („Vom 1. Mai 2000“, „Vom 17.12.1991“, „Vom 11 Juli 2001“, auch mit „i.d.F.d.B.v. …“).
  const dateMatch = /\s+(Vom\s+(?:\d{1,2}\.\s*\p{L}+\s+\d{4}|\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{1,2}\s+\p{L}+\s+\d{4}).*)$/u.exec(title);
  let main = dateMatch ? title.slice(0, dateMatch.index).trim() : title.trim();
  // Bekanntmachungszeile, die die juris-Ausgabe an den VwV-Titel hängt („AV d. JM v. 4. 11. 1969 – V/21/2202 – 69 –
  // (SchlHA 1969 S. 223)“): Angabe über den Erlass, nicht Teil des Titels.
  const promulgation = /\s((?:AV|Bek|Beschl|Erl|RdErl|Gem\.\s?Erl|Allg\.\s?Vfg)\.?\s+(?:d\.|des|der)\s+.*|(?:AV|Bek)\.?\s+d\.\s*\p{L}+.*)$/u.exec(main);
  if (promulgation && promulgation.index >= 15) main = main.slice(0, promulgation.index).trim();
  const paren = /\(([^()]+?)\s+[-–]\s+([^()]+?)(?:\s+[-–])?\s*\)\s*$/u.exec(main);
  return {
    title: main,
    ...(paren ? { shortTitle: paren[1]!.trim(), abbrInTitle: paren[2]!.trim() } : {}),
    ...(dateMatch ? { dateLine: dateMatch[1]! } : {}),
    ...(promulgation && promulgation.index >= 15 ? { promulgation: promulgation[1]!.trim() } : {}),
  };
}

/** Datum der Titel-Datumszeile („Vom 15. Juli 1955, i.d.F.d.B.v. 31.12.1971“ → 1955-07-15), wenn eindeutig lesbar. */
export function dateLineDate(dateLine: string | undefined): string | undefined {
  if (!dateLine) return undefined;
  const months = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  const numeric = /^Vom\s+(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/u.exec(dateLine);
  if (numeric) return `${numeric[3]}-${numeric[2]!.padStart(2, '0')}-${numeric[1]!.padStart(2, '0')}`;
  const verbose = /^Vom\s+(\d{1,2})\.?\s+(\p{L}+)\s+(\d{4})/u.exec(dateLine);
  const month = verbose ? months.indexOf(verbose[2]!.toLowerCase()) + 1 : 0;
  return verbose && month > 0 ? `${verbose[3]}-${String(month).padStart(2, '0')}-${verbose[1]!.padStart(2, '0')}` : undefined;
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

export function toSourceLaw(parsed: ParsedJurisPdf, document: SourceDocument, options: { gazetteVolumes?: readonly GazetteVolume[] } = {}): { law: SourceLaw; findings: ImportFinding[] } {
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
  // Ausfertigungsdatum: die Datumszeile der amtlichen Überschrift geht dem juris-Kopf vor. Für Recht der bereinigten
  // Sammlung (GS Schl.-H. II) setzt juris den Sammlungsstichtag 31.12.1971 als „Ausfertigungsdatum“/„Neugefasst“;
  // die Überschrift nennt die wirkliche Ausfertigung („Vom 15. Juli 1955, i.d.F.d.B.v. 31.12.1971“).
  const documentDate = dateLineDate(titleParts.dateLine) ?? isoDate(parsed.header.Ausfertigungsdatum) ?? isoDate(parsed.header.Neugefasst) ?? isoDate(parsed.header.Erlassdatum);
  const fundstelle = parsed.header.Fundstelle ?? parsed.header.Fundstellen;
  // Amtliche Fundstelle in amtlicher Schreibweise: bei VwV aus dem Dokument selbst („Fundstelle: Amtsbl. Schl.-H. …“),
  // sonst aus der juris-Kurzform des Kopfes übertragen. Nicht sicher lesbare Formen bleiben in der Kurzform.
  const official = (isVwv ? parsed.vwvMetadata?.fundstelle : undefined) ?? officialCitation(fundstelle);
  const citation = official ?? (fundstelle ? `${fundstelle}` : `juris ${document.documentId}`);
  const gazetteReference = official ? gazetteVolumeReference(official, options.gazetteVolumes ?? []) : undefined;
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
  // Kanonischer Inhalt ohne juris-redaktionelle Vermerke (Ausgabevermerk, „Stand: letzte berücksichtigte Änderung“):
  // Sie bleiben Beleg im Manifest (Stichtagsbelege), werden aber nicht als Normbestandteil veröffentlicht.
  const sourceNotes: Array<{ label: string; text: string }> = [];
  if (isVwv && parsed.header.Normgeber) sourceNotes.push({ label: 'Normgeber (Quelle)', text: parsed.header.Normgeber });
  if (isVwv && parsed.header.Aktenzeichen) sourceNotes.push({ label: 'Aktenzeichen (Quelle)', text: parsed.header.Aktenzeichen });
  if (titleParts.promulgation) sourceNotes.push({ label: 'Bekanntmachung (Quelle)', text: titleParts.promulgation });
  const law: SourceLaw = {
    portal: 'juris-sh',
    externalIdentifiers: [
      { system: SYSTEM, value: document.documentId, url: permaUrl(document.documentId) },
      ...(hasGlNr ? [{ system: GLIEDERUNG_SYSTEM, value: glNr }] : []),
      ...(official ? [{ system: OFFICIAL_CITATION_SYSTEM, value: official }] : []),
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
    sourceReferences: gazetteReference ? [gazetteReference, reference] : [reference],
    findings,
    sourceIdentity: document.documentId,
    sourceUrl: permaUrl(document.documentId),
    pdfUrl: document.url,
    fullCitation: `${titleParts.title}${titleParts.dateLine ? ` ${titleParts.dateLine.replace(/^Vom/u, 'vom')}` : ''} (${citation})`,
    ...(isVwv && parsed.vwvMetadata?.amendmentNote ? { changeHistory: parsed.vwvMetadata.amendmentNote } : {}),
  };
  return { law, findings };
}

/** Amtliche Blattbezeichnung zur juris-Kurzform der Fundstelle. */
const GAZETTE_NAMES: ReadonlyArray<[RegExp, string]> = [
  [/^GVOBl\.$/u, 'GVOBl. Schl.-H.'],
  [/^Amtsbl\.?(?:\s+SH|\s+Schl\.-H\.)?$/u, 'Amtsbl. Schl.-H.'],
  [/^SchlHA$/u, 'SchlHA'],
  [/^GS\.$/u, 'GS.'],
];

/** Seitenteil „808, ber. 996“ → „S. 808, ber. S. 996“; „Nr. 44“ bleibt. */
function pagesPart(value: string): string | undefined {
  const pieces = value.split(/,\s*/u).map((piece) => piece.trim()).filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    if (/^\d{4}$/u.test(piece) && out.length > 0 && Number(piece) >= 1900) return undefined;
    if (/^\d+[a-z]?$/u.test(piece)) out.push(out.length === 0 ? `S. ${piece}` : piece);
    else if (/^ber\.\s*(?:S\.\s*)?\d+$/u.test(piece)) out.push(`ber. S. ${piece.replace(/^ber\.\s*(?:S\.\s*)?/u, '')}`);
    else if (/^ber\.\s*\d{4}\s+S\.\s*\d+$/u.test(piece)) out.push(piece);
    else if (/^Nr\.\s*\d+(?:\s*,?\s*S\.\s*\d+)?$/u.test(piece)) out.push(piece);
    else return undefined;
  }
  return out.join(', ');
}

/**
 * Amtliche Fundstelle in amtlicher Schreibweise aus der juris-Kurzform des Kopfes: „GVOBl. 1999, 26“ →
 * „GVOBl. Schl.-H. 1999 S. 26“, „Amtsbl SH 2003, 68“ → „Amtsbl. Schl.-H. 2003 S. 68“, „GVOBl. 1999, 300; 2008, 135“ →
 * „GVOBl. Schl.-H. 1999 S. 300; 2008 S. 135“. Nicht sicher lesbare Formen ergeben `undefined` (die Kurzform bleibt).
 */
export function officialCitation(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.replace(/\s+/gu, ' ').trim();
  const match = /^(.+?)\s(\d{4}),\s*(.+)$/u.exec(value);
  if (!match) return undefined;
  const gazette = GAZETTE_NAMES.find(([pattern]) => pattern.test(match[1]!.trim()))?.[1] ?? (/^NBl\./u.test(match[1]!) ? match[1]!.trim() : undefined);
  if (!gazette) return undefined;
  const segments = [`${match[2]}, ${match[3]}`, ...[]].join('').split(/;\s*/u);
  const rendered: string[] = [];
  for (const [index, segment] of segments.entries()) {
    const part = /^(?:(\d{4}),\s*)?(.+)$/u.exec(segment.trim());
    if (!part) return undefined;
    const year = part[1] ?? (index === 0 ? match[2] : undefined);
    const pages = pagesPart(part[2]!.replace(/^ber\.\s*(\d{4}),\s*/u, 'ber. $1 S. '));
    if (!pages) return undefined;
    rendered.push(`${year ? `${year} ` : ''}${pages}`);
  }
  return `${gazette} ${rendered.join('; ')}`;
}

/** Jahrgänge des Verkündungsportals mit belegter Adresse und Prüfsumme (Ereignisregister, dort erhoben). */
export interface GazetteVolume {
  gazette: 'GVOBl. Schl.-H.' | 'Amtsbl. Schl.-H.';
  year: string;
  url: string;
  sha256: string;
}

/**
 * Verweis auf den amtlichen Jahrgangsband, wenn die Fundstelle in einem Jahrgang mit belegter Adresse und Prüfsumme
 * liegt (Ereignisregister). Die Seite stammt aus der Fundstelle; der Band wird nicht seitenweise geprüft.
 */
export function gazetteVolumeReference(official: string, volumes: readonly GazetteVolume[]): SourceReference | undefined {
  const match = /^(GVOBl\. Schl\.-H\.|Amtsbl\. Schl\.-H\.) (\d{4}) (?:S\. (\d+)|Nr\. (\d+))/u.exec(official);
  if (!match || official.includes(';')) return undefined;
  const volume = volumes.find((candidate) => candidate.gazette === match[1] && candidate.year === match[2]);
  if (!volume) return undefined;
  return {
    kind: 'official-gazette',
    system: 'verkuendungsportal-sh',
    label: `Verkündung der Stammfassung: ${official}`,
    availability: 'external',
    url: volume.url,
    sha256: volume.sha256,
    mediaType: 'application/pdf',
    sourceRole: 'official-snapshot',
    ...(match[3] ? { pageRange: `S. ${match[3]}` } : {}),
    note: `Amtlicher Jahrgangsband ${match[1]} ${match[2]} des Verkündungsportals Schleswig-Holstein; Seite laut Fundstelle, Band nicht seitenweise geprüft.`,
  };
}

/** Jahrgangsbände aus den Quellen des Ereignisregisters (`gvobl-<jahr>`, `ab-<jahr>`). */
export function gazetteVolumesFromLedger(sources: ReadonlyArray<{ id: string; url: string; sha256: string }>): GazetteVolume[] {
  const volumes: GazetteVolume[] = [];
  for (const source of sources) {
    const match = /^(gvobl|ab)-(\d{4})$/u.exec(source.id);
    if (match) volumes.push({ gazette: match[1] === 'gvobl' ? 'GVOBl. Schl.-H.' : 'Amtsbl. Schl.-H.', year: match[2]!, url: source.url, sha256: source.sha256 });
  }
  return volumes;
}
