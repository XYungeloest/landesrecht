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
import { bodyText, buildBody, isoDate, joinLines, normalizeLabel, parseJurisPdf, removeEditorialNotes, type ParsedJurisPdf, type ParseFinding, type PlacedFigure, type RelocatedLine } from '../parse/juris-pdf.ts';
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
      // Anlagen tragen ihren Bezug („Anlage (zu § 28 Abs. 1 Nr. 2 …)“) in der Bezeichnung: So bleiben mehrere Anlagen einer
      // Norm, die juris alle „Anlage“ nennt, als eigene Einheiten unterscheidbar (Run 9).
      if (block.type === 'annex' && block.label) {
        const source = [block.title, block.children?.find((child) => child.type !== 'footnote')?.text].find((value): value is string => typeof value === 'string' && value.trim() !== '');
        const reference = /^\((?:zu|zur|zum)\s[^)]*\)/u.exec(source?.trim() ?? '');
        return reference ? `${normalizeLabel(block.label)} ${reference[0].replace(/\s+/gu, ' ')}` : normalizeLabel(block.label);
      }
      if (block.label && ['paragraph', 'article', 'section', 'chapter', 'part', 'subsection', 'book', 'preamble'].includes(block.type)) return normalizeLabel(block.label);
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
  /** Nachvollziehbare Entscheidungen (Run 9): verworfene Zwillinge, nicht gewählte rückwirkende Fassungen, Umordnungen. */
  notes: string[];
}

export interface BaselineSelectionOptions {
  /** Normtext der heutigen Ausgabe (Rahmendokument), Leerraum normalisiert: entscheidet zwischen offenen Zwillingen. */
  frameText?: string;
  /** Verzeichnis der heutigen Ausgabe: Gegenprobe der Reihenfolge nummerierter Einheiten. */
  frameToc?: ReadonlyArray<{ label?: string }>;
}

/** Gruppen aufeinanderfolgender Fassungen gleicher Bezeichnung; je Gruppe die am Stichtag geltende. */
export function selectBaselineUnits(units: readonly UnitVersion[], baseline = BASELINE_DATE, options: BaselineSelectionOptions = {}): BaselineSelection {
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
  const notes: string[] = [];
  const covers = (unit: UnitVersion): boolean => unit.validFrom !== undefined && unit.validFrom <= baseline && (!unit.validTo || unit.validTo >= baseline);
  for (const rawGroup of groups) {
    const key = rawGroup[0]!.key;
    // Fassung ohne „Gültig ab“, aber mit „Fassung vom“ nach dem Stichtag: gab es am Stichtag noch nicht (Run 8).
    const group = rawGroup.filter((unit) => unit.validFrom || !(unit.versionDate && unit.versionDate > baseline));
    if (group.length === 0) {
      omitted.push({ key, reason: `nur Fassung(en) vom ${rawGroup.map((unit) => unit.versionDate).join(', ')} ohne „Gültig ab“ (nach dem Stichtag)` });
      continue;
    }
    // Fassung ohne „Gültig ab“, älter als eine datierte, am Stichtag geltende Fassung derselben Einheit: überholt (Run 9).
    const dated = group.filter((unit) => unit.validFrom);
    const undated = group.filter((unit) => !unit.validFrom);
    const stale = undated.filter((unit) => unit.versionDate && dated.some((other) => covers(other) && other.versionDate && other.versionDate > unit.versionDate!));
    for (const unit of stale) notes.push(`${key}: Fassung vom ${unit.versionDate} ohne „Gültig ab“ ist älter als die am Stichtag geltende datierte Fassung – nicht gewählt`);
    const openUndated = undated.filter((unit) => !stale.includes(unit));
    if (openUndated.length > 0) {
      problems.push(`${key}: ${openUndated.length} Fassung(en) ohne „Gültig ab“`);
      continue;
    }
    let valid = withoutDuplicateRecords(dated, { ...(options.frameText ? { frameText: options.frameText } : {}), notes, key }).filter(covers);
    if (valid.length > 1) {
      // Mehrere offene Fassungen am selben Tag: juris führt eine abgelöste Fassung ohne Ende weiter („Gültig bis“
      // leer). Gilt genau eine Fassung mit späterem „Fassung vom“ und haben alle übrigen kein Ende, hat diese die
      // übrigen abgelöst. Am Stichtag verkündete Fassungen gehen rückwirkenden (Fassung vom nach dem Stichtag) vor:
      // Stichtagsfassung ist der am Stichtag verkündete Text (Run 9). Sonst bleibt es ein Befund.
      const promulgated = valid.filter((unit) => unit.versionDate && unit.versionDate <= baseline);
      const pool = promulgated.length > 0 ? promulgated : valid;
      const latest = [...pool].sort((left, right) => (right.versionDate ?? '').localeCompare(left.versionDate ?? ''))[0]!;
      const others = valid.filter((unit) => unit !== latest);
      const superseded = (unit: UnitVersion): boolean => Boolean(unit.versionDate && latest.versionDate && ((unit.versionDate > baseline && unit.versionDate > latest.versionDate) || (!unit.validTo && unit.versionDate < latest.versionDate)));
      if (latest.versionDate && others.every(superseded)) {
        for (const unit of others) if (unit.versionDate! > baseline) notes.push(`${key}: rückwirkende Fassung vom ${unit.versionDate} (gültig ab ${unit.validFrom}) nicht gewählt – am Stichtag verkündet war die Fassung vom ${latest.versionDate}`);
        valid = [latest];
      }
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
    // Fassungen nur vor und nach dem Stichtag: Die Einheit fiel weg und entstand später neu – am Stichtag galt sie nicht (Run 9).
    else omitted.push({ key, reason: `am Stichtag nicht in Kraft (Fassungen ${group.map((unit) => `${unit.validFrom}–${unit.validTo ?? 'offen'}`).join(', ')})` });
  }
  // Anlagen eröffnen eigene Nummernräume (Satzung, Staatsvertrag als Anlage mit eigenen §§ bzw. Artikeln): Eindeutigkeit
  // und Reihenfolge nummerierter Einheiten gelten je Abschnitt – Hauptteil und jede Anlage (Run 9).
  const segments = segmentByAnnex(selected, notes);
  const ordered: UnitVersion[] = [];
  for (const segment of segments) {
    // Dieselbe Bezeichnung zweimal am Stichtag: juris führt eine abgelöste Fassung in einer anderen Kette ohne Ende weiter
    // (Umnummerierung, Ressortbezeichnungs-Verordnung). Die jüngere Fassung hat die ältere abgelöst, wenn alle übrigen
    // kein Ende tragen und ein älteres „Fassung vom“ haben – dieselbe Regel wie innerhalb einer Kette (Run 9).
    const byKey = new Map<string, UnitVersion[]>();
    for (const unit of segment) byKey.set(unit.key, [...(byKey.get(unit.key) ?? []), unit]);
    const dropped = new Set<UnitVersion>();
    for (const [key, list] of byKey) {
      if (list.length < 2) continue;
      const latest = [...list].sort((left, right) => (right.versionDate ?? '').localeCompare(left.versionDate ?? ''))[0]!;
      const others = list.filter((unit) => unit !== latest);
      if (latest.versionDate && others.every((unit) => !unit.validTo && unit.versionDate && unit.versionDate < latest.versionDate!)) {
        for (const unit of others) {
          dropped.add(unit);
          notes.push(`${key}: Fassung vom ${unit.versionDate} (${unit.documentId}, ohne Ende) durch die Fassung vom ${latest.versionDate} (${latest.documentId}) abgelöst – nicht gewählt`);
        }
      }
    }
    const remaining = segment.filter((unit) => !dropped.has(unit));
    // Nur Paragraphen sind in einem Abschnitt eindeutig nummeriert; Gliederungsbezeichnungen („Unterabschnitt 1“) wiederholen
    // sich unter verschiedenen Abschnitten.
    const count = new Map<string, number>();
    for (const unit of remaining) count.set(unit.key, (count.get(unit.key) ?? 0) + 1);
    for (const [key, value] of count) if (value > 1 && /^§/u.test(key)) problems.push(`Bezeichnung ${key}: ${value} Einheiten gelten zugleich am Stichtag`);
    // Reihenfolge: Die Nummernfolge der Einzelfassungen trägt die Normreihenfolge; nummerierte Einheiten gleicher
    // Art (§, Artikel) müssen in ihr aufsteigen, sonst ist die Zusammensetzung nicht belegt.
    const sortedSegment = orderedByNumber(remaining);
    if (sortedSegment.some((unit, index) => unit !== remaining[index])) notes.push(`Reihenfolge nach Nummern geordnet: ${sortedSegment.filter((unit) => unitOrdinal(unit.key)).map((unit) => unit.key).join(', ')}`);
    problems.push(...unitOrderProblems(sortedSegment));
    ordered.push(...sortedSegment);
  }
  problems.push(...tocOrderProblems(ordered, options.frameToc));
  return { selected: ordered, omitted, problems, notes };
}

/**
 * Abschnitte der Stichtagsfassung: Hauptteil und je Anlage (Anlage/Anhang eröffnet einen Abschnitt). Nummerierte Einheiten
 * hinter einer Anlage, die die Nummerierung des Hauptteils fortsetzen (§ 11 nach §§ 1–10 – juris legt neue Einheiten
 * hinter die Anlage), gehören zum Hauptteil; sobald die Anlage eigene Nummern beginnt, bleiben alle folgenden bei ihr.
 */
export function segmentByAnnex(units: readonly UnitVersion[], notes?: string[]): UnitVersion[][] {
  const segments: UnitVersion[][] = [[]];
  for (const unit of units) {
    if (/^(?:Anlage|Anhang)\b/u.test(unit.key)) segments.push([unit]);
    else segments.at(-1)!.push(unit);
  }
  const main = segments[0]!;
  const maxOrdinal = (list: readonly UnitVersion[], kind: string): number => Math.max(0, ...list.map((unit) => unitOrdinal(unit.key)).filter((ordinal) => ordinal?.kind === kind).map((ordinal) => ordinal!.number));
  for (const segment of segments.slice(1)) {
    let restarted = false;
    for (const unit of [...segment]) {
      const ordinal = unitOrdinal(unit.key);
      if (!ordinal || restarted) continue;
      if (ordinal.number > maxOrdinal(main, ordinal.kind) && maxOrdinal(main, ordinal.kind) > 0) {
        segment.splice(segment.indexOf(unit), 1);
        main.push(unit);
        notes?.push(`${unit.key}: hinter ${segment[0]!.key} abgelegt, setzt aber die Nummerierung des Hauptteils fort – dem Hauptteil zugeordnet`);
      } else restarted = true;
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

/**
 * Gegenprobe mit dem Verzeichnis der heutigen Ausgabe: Nummerierte Einheiten, die das Verzeichnis kennt, müssen in der
 * Stichtagsfassung in der Verzeichnisreihenfolge stehen (erste Nennung zählt; Einheiten in Anlagen bleiben außen vor).
 */
export function tocOrderProblems(units: readonly Pick<UnitVersion, 'key'>[], toc: ReadonlyArray<{ label?: string }> | undefined): string[] {
  if (!toc || toc.length === 0) return [];
  const position = new Map<string, number>();
  toc.forEach((entry, index) => {
    if (entry.label && !position.has(normalizeLabel(entry.label))) position.set(normalizeLabel(entry.label), index);
  });
  const problems: string[] = [];
  let last: { key: string; index: number } | undefined;
  for (const unit of units) {
    if (/^(?:Anlage|Anhang)\b/u.test(unit.key)) break;
    if (!unitOrdinal(unit.key)) continue;
    const index = position.get(normalizeLabel(unit.key));
    if (index === undefined) continue;
    if (last && index < last.index) problems.push(`Reihenfolge weicht vom Verzeichnis der heutigen Ausgabe ab: ${unit.key} nach ${last.key}`);
    if (!last || index > last.index) last = { key: unit.key, index };
  }
  return problems;
}

/**
 * juris führt manche Fassung doppelt (Run 8): zweimal mit gleichem „Fassung vom“ und „Gültig ab“, einmal mit, einmal ohne
 * „Gültig bis“ (die offene ist der nicht nachgeführte Zwilling), oder zweimal ganz gleich. Belegt ist das nur bei
 * wortgleichem Text; dann zählt die datierte bzw. die erste Fassung. Textlich verschiedene Zwillinge bleiben Befund.
 */
export function withoutDuplicateRecords(group: readonly UnitVersion[], options: { frameText?: string; notes?: string[]; key?: string } = {}): UnitVersion[] {
  const text = (unit: UnitVersion): string => bodyText(unit.parsed.body ?? []).replace(/\s+/gu, ' ').trim();
  const masked = (unit: UnitVersion): string => maskOrganNames(text(unit));
  const kept: UnitVersion[] = [];
  for (const unit of group) {
    const twins = group.filter((other) => other !== unit && other.versionDate === unit.versionDate && other.validFrom === unit.validFrom);
    // Offener Zwilling einer datierten Fassung: entfällt bei wortgleichem Text – oder wenn sich beide nur in
    // Ressortbezeichnungen unterscheiden (Zwillinge aus einer Ressortbezeichnungs-Verordnung; die datierte Fassung ist die
    // nachgeführte mit der neuen Bezeichnung, der offene Zwilling führt die alte weiter) (Run 9).
    const closedTwin = !unit.validTo ? twins.find((other) => other.validTo && (text(other) === text(unit) || masked(other) === masked(unit))) : undefined;
    if (closedTwin) {
      if (text(closedTwin) !== text(unit)) options.notes?.push(`${options.key ?? unit.key}: offener Zwilling ${unit.documentId} der datierten Fassung ${closedTwin.documentId} (gleiches „Fassung vom“ und „Gültig ab“, Unterschied nur in Ressortbezeichnungen) – nicht gewählt`);
      continue;
    }
    // Zwei offene Zwillinge mit verschiedenem Text: Die in der heutigen Ausgabe enthaltene ist die nachgeführte (Run 9).
    if (!unit.validTo && options.frameText) {
      const openTwins = twins.filter((other) => !other.validTo && text(other) !== text(unit));
      const inFrame = (candidate: UnitVersion): boolean => options.frameText!.includes(text(candidate));
      if (openTwins.length > 0 && !inFrame(unit) && openTwins.some(inFrame)) {
        options.notes?.push(`${options.key ?? unit.key}: offener Zwilling ${unit.documentId} nicht in der heutigen Ausgabe enthalten, ${openTwins.find(inFrame)!.documentId} schon – nicht gewählt`);
        continue;
      }
    }
    // Völlig gleicher Zwilling: nur der erste bleibt.
    if (kept.some((other) => other.versionDate === unit.versionDate && other.validFrom === unit.validFrom && other.validTo === unit.validTo && text(other) === text(unit))) continue;
    kept.push(unit);
  }
  return kept;
}

/** Ressortbezeichnungen („Ministerium für Energiewende, Landwirtschaft, Umwelt, Natur und Digitalisierung“) durch einen Platzhalter ersetzt. */
const ORGAN_NAME = /\b(?:(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inisteri(?:um|ums)|(?:[A-ZÄÖÜ][a-zäöüß]+)?[Mm]inister(?:in|s|n)?|Ministerpräsident(?:in|en)?|Staatskanzlei)(?:\s+für\s+(?:(?:[a-zäöüß]+\s+)?[A-ZÄÖÜ][\p{L}-]*(?:\s*,\s*|\s+und\s+|\s+sowie\s+))*(?:[a-zäöüß]+\s+)?[A-ZÄÖÜ][\p{L}-]*)?/gu;
export function maskOrganNames(text: string): string {
  return text.replace(ORGAN_NAME, '⟨Organ⟩');
}

export function unitOrdinal(key: string): { kind: string; number: number; suffix: string } | undefined {
  const match = /^(§|Art\.?|Artikel)\s*(\d+)\s*([a-z]?)\b/u.exec(key);
  if (!match) return undefined;
  return { kind: match[1]!.startsWith('Art') ? 'Artikel' : '§', number: Number(match[2]), suffix: match[3] ?? '' };
}

/**
 * Nach einer Neufassung führt juris die alten Einzelfassungen hinter den neuen (Nummernfolge nach Anlage des Dokuments,
 * nicht nach der Norm): „§ 8“ der Stichtagsfassung steht dann hinter „§ 13“. Besteht die Stichtagsfassung nur aus
 * Paragraphen (bzw. nur aus Artikeln) – davor höchstens Eingangsformel und Inhaltsübersicht, dahinter höchstens
 * Anlagen –, trägt die Nummer der Paragraphen die Reihenfolge der Norm: aufsteigend geordnet (Run 8). Mit
 * Gliederungseinheiten dazwischen (Teil, Abschnitt) bliebe die Zuordnung offen – dann unverändert (Befund).
 */
export function orderedByNumber<T extends Pick<UnitVersion, 'key'>>(units: readonly T[]): T[] {
  if (unitOrderProblems(units).length === 0) return [...units];
  const ordinals = units.map((unit) => unitOrdinal(unit.key));
  const first = ordinals.findIndex((ordinal) => ordinal !== undefined);
  const last = ordinals.length - 1 - [...ordinals].reverse().findIndex((ordinal) => ordinal !== undefined);
  if (first < 0) return [...units];
  const kinds = new Set(ordinals.filter((ordinal) => ordinal !== undefined).map((ordinal) => ordinal!.kind));
  const lead = units.slice(0, first);
  const middle = units.slice(first, last + 1);
  const tail = units.slice(last + 1);
  if (kinds.size !== 1 || middle.some((unit) => unitOrdinal(unit.key) === undefined)) return [...units];
  // Davor stehen nur nicht nummerierte Einheiten (Eingangsformel, Inhaltsübersicht, Vorspann-Überschriften); dahinter
  // höchstens Schlussformel und Anlagen – beides bleibt beim Sortieren an seinem Platz.
  if (!tail.every((unit) => /^(?:Anlage|Anhang|Schlussformel)/u.test(unit.key))) return [...units];
  void lead;
  const sorted = [...middle].sort((left, right) => {
    const a = unitOrdinal(left.key)!;
    const b = unitOrdinal(right.key)!;
    return a.number - b.number || a.suffix.localeCompare(b.suffix);
  });
  return [...lead, ...sorted, ...tail];
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
  // Der Titel einer Einzelfassung kann die erste Überschrift der Einheit mitführen („… Vom 26. Januar 2012 Besoldungsgruppe A 5“):
  // Er entspricht dem heutigen Titel, wenn er mit ihm beginnt (Run 9).
  if (newest && !normalize(newest.parsed.title).startsWith(normalize(frame.title))) problems.push(`Titel am Stichtag („${normalize(newest.parsed.title).slice(0, 80)}“) weicht vom heutigen Titel ab`);
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

/**
 * Normkörper aus den Zeilen der gewählten Einzelfassungen (Nummernfolge), mit Integritätsprüfung. Die Satzspiegelmaße
 * (Zeilen-, Absatzabstand, Ränder) kommen aus dem Rahmendokument (`options.layout`): Eine kleine Einzelfassung – etwa eine
 * Anlage, die nur aus einer Tabelle besteht – schätzt ihren „typischen Zeilenabstand“ aus den Tabellenzeilen und ordnet
 * damit Zeilen falsch zu. Tabellenbefunde der Einzelparses sind deshalb hier ohne Belang; die Zusammensetzung prüft jede
 * Tabelle auf denselben Zeilen mit den repräsentativen Maßen neu (Run 9).
 */
export function assembleBaseline(selected: readonly UnitVersion[], isVwv = false, options: { layout?: PdfLayout } = {}): HistoricalAssembly {
  const findings: ParseFinding[] = [];
  const reference = [...selected].sort((left, right) => right.parsed.bodyLines.length - left.parsed.bodyLines.length)[0];
  if (!reference) return { body: [], sourceText: '', integrity: compareIntegrity('', ''), findings: [{ severity: 'error', code: 'no-units', message: 'Keine am Stichtag geltende Einzelfassung' }], units: [], figureSources: [] };
  const layout = options.layout ?? reference.layout;
  const lines: PdfLine[] = [];
  const figures: PlacedFigure[] = [];
  const figureSources: HistoricalAssembly['figureSources'] = [];
  for (const unit of selected) {
    for (const figure of unit.parsed.figures ?? []) {
      figures.push({ ...figure, beforeLine: lines.length + figure.beforeLine });
      figureSources.push({ sha256: figure.sha256, documentId: unit.documentId, raw: unit.raw });
    }
    unit.parsed.bodyLines.forEach((line, index) => lines.push({ ...line, gapBefore: index === 0 ? Number.POSITIVE_INFINITY : line.gapBefore }));
    for (const finding of unit.parsed.findings) if (finding.code !== 'table-layout' && finding.code !== 'table-structured' && finding.code !== 'table-text-continuation') findings.push({ ...finding, message: `${unit.key}: ${finding.message}` });
  }
  const reorders: RelocatedLine[] = [];
  const cleaned = removeEditorialNotes(buildBody(lines, layout, findings, isVwv, figures, reorders), findings);
  cleaned.relocated.push(...reorders);
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
