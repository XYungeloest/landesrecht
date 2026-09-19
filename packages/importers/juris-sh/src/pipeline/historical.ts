/**
 * Stichtagsfassung aus der juris-Historie: Zusammensetzung der am Stichtag geltenden **Einzelfassungen**.
 *
 * Befund (Stichprobe, `SAMPLE_REPORT.md`): Jede Einheit einer Norm (§, Artikel, Anlage, Gliederung,
 * Eingangsformel) liegt in juris je Fassung als eigenes Dokument vor – `…NN<11 Ziffern>` in der Sitemap –, und
 * die Ausgabe „genau dieses Dokument“ liefert genau diese Fassung mit „Fassung vom“, „Gültig ab“, „Gültig bis“.
 * Die Fassungen einer Einheit stehen in der Nummernfolge unmittelbar hintereinander; die Nummernfolge ist die
 * Reihenfolge der Norm.
 *
 * Verfahren (Rang 1 der Auftragsreihenfolge: öffentlich erreichbare historische juris-Fassung):
 *   1. alle Einzelfassungen eines Rahmendokuments laden (Cache, PDF-Ausgabe ohne `docPart`);
 *   2. je Einheit (aufeinanderfolgende Fassungen gleicher Bezeichnung) die am Stichtag geltende wählen;
 *   3. fehlt sie, weil die Einheit erst später entstand oder vorher wegfiel, entfällt die Einheit; überlappen
 *      zwei Fassungen, ist das ein Review-Befund – nie wird geraten;
 *   4. den Normkörper aus den Zeilen der gewählten Fassungen in Nummernfolge bauen (derselbe Parser) und die
 *      Textintegrität gegen genau diese Zeilen prüfen.
 *
 * Der heutige Text wird dabei nie als Ersatz verwendet.
 */
import type { NormBodyBlock } from '@landesrecht/legal-core/lib/schema.ts';

import { BASELINE_DATE } from '../common/constants.ts';
import { compareIntegrity, type IntegrityResult } from '../parse/integrity.ts';
import { bodyText, buildBody, isoDate, joinLines, normalizeLabel, parseJurisPdf, removeEditorialNotes, type ParsedJurisPdf, type ParseFinding, type PlacedFigure } from '../parse/juris-pdf.ts';
import { readFigureImages, withoutBytes } from '../parse/pdf-figures.ts';
import { layoutFromPdf, type PdfLayout, type PdfLine } from '../parse/pdf-layout.ts';

export interface UnitVersion {
  documentId: string;
  nn: number;
  /** Bezeichnung der Einheit (erste Überschrift), sonst „Eingangsformel“ bzw. die Nummer. */
  key: string;
  versionDate?: string;
  validFrom?: string;
  validTo?: string;
  parsed: ParsedJurisPdf;
  layout: PdfLayout;
  raw: { url: string; sha256: string; byteLength: number; retrievedAt: string };
}

export function unitNumber(documentId: string): number {
  const match = /NN(\d{11})$/u.exec(documentId);
  if (!match) throw new Error(`${documentId} ist keine Einheit (…NN<11 Ziffern>)`);
  return Number(match[1]);
}

function unitKey(parsed: ParsedJurisPdf, nn: number): string {
  const first = (blocks: NormBodyBlock[]): string | undefined => {
    for (const block of blocks) {
      if (block.type === 'footnote') continue;
      if (block.label && ['paragraph', 'article', 'annex', 'section', 'chapter', 'part', 'subsection', 'book', 'preamble'].includes(block.type)) return normalizeLabel(block.label);
      if (block.type === 'heading' && block.text) return block.text;
      if (block.type === 'paragraphText' && /^Inhaltsübersicht/u.test(block.text ?? '')) return 'Inhaltsübersicht';
      return undefined;
    }
    return undefined;
  };
  return first(parsed.body) ?? (nn === 1 ? 'Eingangsformel' : `Einheit ${nn}`);
}

export function readUnit(bytes: Uint8Array, documentId: string, raw: UnitVersion['raw']): UnitVersion {
  const layout = layoutFromPdf(bytes);
  // Abbildungen auch in den Einzelfassungen (sonst fiele eine Abbildung der Stichtagsfassung stillschweigend weg).
  const parsed = parseJurisPdf(layout, { images: readFigureImages(bytes)?.map(withoutBytes) ?? null });
  const nn = unitNumber(documentId);
  // Ältere Fassungen tragen statt „Gültig ab“ den Beginn des juris-Textnachweises (01.01.2003): Die Fassung galt
  // bereits zu diesem Tag; ihr tatsächlicher Beginn liegt davor und ist für den Stichtag 2023 ohne Belang.
  const validFrom = isoDate(parsed.header['Gültig ab']) ?? isoDate(parsed.header['Textnachweis ab']);
  const validTo = isoDate(parsed.header['Gültig bis']);
  const versionDate = isoDate(parsed.header['Fassung vom']);
  return { documentId, nn, key: unitKey(parsed, nn), ...(versionDate ? { versionDate } : {}), ...(validFrom ? { validFrom } : {}), ...(validTo ? { validTo } : {}), parsed, layout, raw };
}

export interface BaselineSelection {
  selected: UnitVersion[];
  /** Einheiten ohne am Stichtag geltende Fassung, mit Grund. */
  omitted: Array<{ key: string; reason: string }>;
  problems: string[];
}

/** Gruppen aufeinanderfolgender Fassungen gleicher Bezeichnung; je Gruppe die am Stichtag geltende. */
export function selectBaselineUnits(units: readonly UnitVersion[], baseline = BASELINE_DATE): BaselineSelection {
  const sorted = [...units].sort((left, right) => left.nn - right.nn);
  const groups: UnitVersion[][] = [];
  for (const unit of sorted) {
    const last = groups.at(-1);
    if (last && last[0]!.key === unit.key) last.push(unit);
    else groups.push([unit]);
  }
  const selected: UnitVersion[] = [];
  const omitted: BaselineSelection['omitted'] = [];
  const problems: string[] = [];
  for (const group of groups) {
    const key = group[0]!.key;
    const undated = group.filter((unit) => !unit.validFrom);
    if (undated.length > 0) {
      problems.push(`${key}: ${undated.length} Fassung(en) ohne „Gültig ab“`);
      continue;
    }
    let valid = group.filter((unit) => unit.validFrom! <= baseline && (!unit.validTo || unit.validTo >= baseline));
    if (valid.length > 1) {
      // Mehrere offene Fassungen am selben Tag: juris führt eine abgelöste Fassung ohne Ende weiter („Gültig bis“
      // leer). Gilt genau eine Fassung mit späterem „Fassung vom“ und haben alle übrigen kein Ende, hat diese die
      // übrigen abgelöst. Sonst bleibt es ein Befund.
      const latest = [...valid].sort((left, right) => (right.versionDate ?? '').localeCompare(left.versionDate ?? ''))[0]!;
      const others = valid.filter((unit) => unit !== latest);
      if (latest.versionDate && others.every((unit) => !unit.validTo && unit.versionDate && unit.versionDate < latest.versionDate!)) valid = [latest];
    }
    if (valid.length > 1) {
      problems.push(`${key}: ${valid.length} Fassungen gelten zugleich am Stichtag (${valid.map((unit) => unit.documentId).join(', ')})`);
      continue;
    }
    if (valid.length === 1) {
      selected.push(valid[0]!);
      continue;
    }
    if (group.every((unit) => unit.validFrom! > baseline)) omitted.push({ key, reason: `erst ab ${group[0]!.validFrom} (nach dem Stichtag)` });
    else if (group.every((unit) => unit.validTo && unit.validTo < baseline)) omitted.push({ key, reason: `weggefallen vor dem Stichtag (bis ${group.at(-1)!.validTo})` });
    else problems.push(`${key}: Lücke am Stichtag (Fassungen ${group.map((unit) => `${unit.validFrom}–${unit.validTo ?? 'offen'}`).join(', ')})`);
  }
  // Dieselbe Bezeichnung in mehreren Fassungsgruppen ist Umnummerierung über die Zeit; ein Problem ist sie
  // nur, wenn am Stichtag mehr als eine Einheit dieser Bezeichnung gilt.
  const selectedByKey = new Map<string, number>();
  for (const unit of selected) selectedByKey.set(unit.key, (selectedByKey.get(unit.key) ?? 0) + 1);
  // Nur Paragraphen sind in einer Norm eindeutig nummeriert; Gliederungsbezeichnungen („Unterabschnitt 1“) wiederholen
  // sich unter verschiedenen Abschnitten.
  for (const [key, count] of selectedByKey) if (count > 1 && /^§/u.test(key)) problems.push(`Bezeichnung ${key}: ${count} Einheiten gelten zugleich am Stichtag`);
  // Reihenfolge: Die Nummernfolge der Einzelfassungen trägt die Normreihenfolge; nummerierte Einheiten gleicher
  // Art (§, Artikel) müssen in ihr aufsteigen, sonst ist die Zusammensetzung nicht belegt.
  problems.push(...unitOrderProblems(selected));
  return { selected, omitted, problems };
}

/** Ordnungsschlüssel einer nummerierten Einheit (`§ 13a` → [13, 'a']), sonst `undefined`. */
export function unitOrdinal(key: string): { kind: string; number: number; suffix: string } | undefined {
  const match = /^(§|Art\.?|Artikel)\s*(\d+)\s*([a-z]?)\b/u.exec(key);
  if (!match) return undefined;
  return { kind: match[1]!.startsWith('Art') ? 'Artikel' : '§', number: Number(match[2]), suffix: match[3] ?? '' };
}

export function unitOrderProblems(units: readonly Pick<UnitVersion, 'key'>[]): string[] {
  const problems: string[] = [];
  const last = new Map<string, { number: number; suffix: string; key: string }>();
  for (const unit of units) {
    const ordinal = unitOrdinal(unit.key);
    if (!ordinal) continue;
    const previous = last.get(ordinal.kind);
    if (previous && (ordinal.number < previous.number || (ordinal.number === previous.number && ordinal.suffix <= previous.suffix))) problems.push(`Reihenfolge nicht aufsteigend: ${unit.key} nach ${previous.key}`);
    last.set(ordinal.kind, { number: ordinal.number, suffix: ordinal.suffix, key: unit.key });
  }
  return problems;
}

/**
 * Gegenprobe der gewählten Einzelfassungen gegen das Rahmendokument: Nur wenn der Titel am Stichtag dem heutigen
 * entspricht, die Gliederungsnummer übereinstimmt und keine gewählte Fassung erst nach dem Stichtag erlassen wurde
 * (rückwirkende Fassung: „Fassung vom“ nach dem Stichtag bei „Gültig ab“ davor), trägt die Zusammensetzung.
 */
export function consistencyProblems(selected: readonly UnitVersion[], frame: { title: string; gliederungsnummer?: string }, baseline = BASELINE_DATE): string[] {
  const problems: string[] = [];
  const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();
  // Jede Einzelfassung trägt den Normtitel ihres eigenen Fassungsdatums; maßgeblich für den Stichtag ist der Titel
  // der jüngsten gewählten Fassung. Er muss dem heutigen Titel entsprechen (ein geänderter Titel wird nicht geraten).
  const newest = [...selected].filter((unit) => unit.parsed.title).sort((left, right) => (right.validFrom ?? '').localeCompare(left.validFrom ?? '') || (right.versionDate ?? '').localeCompare(left.versionDate ?? ''))[0];
  if (newest && normalize(newest.parsed.title) !== normalize(frame.title)) problems.push(`Titel am Stichtag („${normalize(newest.parsed.title).slice(0, 80)}“) weicht vom heutigen Titel ab`);
  const frameNumber = frame.gliederungsnummer?.replace(/\s+/gu, '');
  const numbers = [...new Set(selected.map((unit) => unit.parsed.header['Gliederungs-Nr']?.replace(/\s+/gu, '')).filter((value): value is string => Boolean(value)))];
  if (frameNumber && numbers.some((number) => number !== frameNumber)) problems.push(`Gliederungsnummer der Einzelfassungen (${numbers.join(', ')}) weicht vom Rahmendokument (${frameNumber}) ab`);
  for (const unit of selected) {
    if (unit.versionDate && unit.versionDate > baseline && unit.validFrom && unit.validFrom <= baseline) problems.push(`${unit.key}: rückwirkende Fassung vom ${unit.versionDate}, gültig ab ${unit.validFrom} – galt am Stichtag noch nicht als verkündete Fassung`);
  }
  return problems;
}

export interface HistoricalAssembly {
  body: NormBodyBlock[];
  sourceText: string;
  integrity: IntegrityResult;
  findings: ParseFinding[];
  /** Geltung der zusammengesetzten Fassung: spätester Beginn, frühestes Ende der gewählten Einzelfassungen. */
  validFrom?: string;
  validTo?: string;
  units: Array<{ documentId: string; key: string; validFrom?: string; validTo?: string }>;
  /** Herkunft der übernommenen Abbildungen: Einzelfassung (PDF-Ausgabe), aus der das Bild stammt. */
  figureSources: Array<{ sha256: string; documentId: string; raw: UnitVersion['raw'] }>;
}

/** Normkörper aus den Zeilen der gewählten Einzelfassungen (Nummernfolge), mit Integritätsprüfung. */
export function assembleBaseline(selected: readonly UnitVersion[], isVwv = false): HistoricalAssembly {
  const findings: ParseFinding[] = [];
  const reference = [...selected].sort((left, right) => right.parsed.bodyLines.length - left.parsed.bodyLines.length)[0];
  if (!reference) return { body: [], sourceText: '', integrity: compareIntegrity('', ''), findings: [{ severity: 'error', code: 'no-units', message: 'Keine am Stichtag geltende Einzelfassung' }], units: [], figureSources: [] };
  const lines: PdfLine[] = [];
  const figures: PlacedFigure[] = [];
  const figureSources: HistoricalAssembly['figureSources'] = [];
  for (const unit of selected) {
    for (const figure of unit.parsed.figures ?? []) {
      figures.push({ ...figure, beforeLine: lines.length + figure.beforeLine });
      figureSources.push({ sha256: figure.sha256, documentId: unit.documentId, raw: unit.raw });
    }
    unit.parsed.bodyLines.forEach((line, index) => lines.push({ ...line, gapBefore: index === 0 ? Number.POSITIVE_INFINITY : line.gapBefore }));
    for (const finding of unit.parsed.findings) findings.push({ ...finding, message: `${unit.key}: ${finding.message}` });
  }
  const cleaned = removeEditorialNotes(buildBody(lines, reference.layout, findings, isVwv, figures), findings);
  const body = cleaned.body;
  const sourceText = lines.filter((line) => !/^Fußnoten$/u.test(line.text.trim())).map((line) => line.text).join('\n');
  const integrity = compareIntegrity(sourceText, bodyText(body), cleaned.relocated, joinLines);
  const froms = selected.map((unit) => unit.validFrom).filter((value): value is string => value !== undefined).sort();
  const tos = selected.map((unit) => unit.validTo).filter((value): value is string => value !== undefined).sort();
  return {
    body,
    sourceText,
    integrity,
    findings,
    ...(froms.length > 0 ? { validFrom: froms.at(-1)! } : {}),
    ...(tos.length > 0 ? { validTo: tos[0]! } : {}),
    units: selected.map((unit) => ({ documentId: unit.documentId, key: unit.key, ...(unit.validFrom ? { validFrom: unit.validFrom } : {}), ...(unit.validTo ? { validTo: unit.validTo } : {}) })),
    figureSources,
  };
}
