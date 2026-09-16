/**
 * Regeln der Rechtsüberleitung Nordrhein-Westfalen → Land Westdeutschland.
 *
 * Nur die Bezeichnung des Herkunftslandes wird automatisch übergeleitet; jede Regel ist einzeln
 * benannt. Schutzmuster (amtliche Fundstellen, URLs, Eigennamen externer Träger) werden vor der
 * Anwendung maskiert und bleiben byteidentisch. Die Maskierung arbeitet längengleich auf dem
 * Quelltext, sodass jede Ersetzung mit ihrer Quellposition protokolliert werden kann.
 *
 * Restformen „NRW.“ (Version 2.1): kein pauschales NRW → West. Übergeleitet wird nur
 *   - der Landeszusatz einer Gesetzes- oder Verordnungsbezeichnung am Satzende
 *     („des Schulgesetzes NRW.“ → „des Schulgesetzes West.“),
 *   - die Abkürzung einer bekannten Landesnorm des Herkunftslandes, auch in der Punktschreibweise
 *     („VwVfG. NRW.“ → „VwVfG West“, „PBefKostenV NRW.“ → „PBefKostenV West.“). Bekannt sind nur
 *     Abkürzungen aus der LRGV-Enumeration (`knownStateLawAbbreviations`).
 * Institutionsnamen („Landesbetrieb Wald und Holz NRW.“), Gerichte und Fundstellen bleiben unverändert
 * (Schutzmuster oder manuelle Entscheidung).
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';

export const TRANSFORMER_VERSION = 'recht-nrw-transformer/2.1.0';

export interface TransformationRule {
  id: string;
  pattern: RegExp;
  replacement?: string;
  /** Ersetzung aus dem Treffer; `null` = kein sicherer Fall, der Treffer bleibt unverändert. */
  replace?: (match: RegExpMatchArray, source: string) => string | null;
}

export interface TransformationOptions {
  /** Abkürzungen von Landesnormen des Herkunftslandes ohne Landeszusatz (z. B. „VwVfG“, „GO“). */
  knownStateLawAbbreviations?: ReadonlySet<string>;
}

export interface ProtectedPattern {
  id: string;
  category: 'source-citation' | 'external-name';
  pattern: RegExp;
  reason: string;
}

const TARGET = getJurisdiction(TARGET_JURISDICTION);

/** „Land Westdeutschland“ → „Westdeutschland“ (Eigenname ohne Staatsform für Genitiv/Dativ-Anschlüsse). */
export function targetProperName(): string {
  return TARGET.name.replace(/^(Land|Freistaat)\s+/u, '');
}

/** Fundstellenkürzel, die nie als Normabkürzung gelten. */
const GAZETTE_ABBREVIATIONS = new Set(['GV', 'SGV', 'MBl', 'GVBl', 'SMBl', 'ABl', 'MB', 'BGBl', 'GVOBl']);

/** Basis einer Normabkürzung ohne Landeszusatz („VwVfG NRW“ → „VwVfG“); mehrteilige Abkürzungen entfallen. */
export function stateLawAbbreviationBase(abbreviation: string): string | undefined {
  const base = abbreviation.replace(/\s+/gu, ' ').trim().replace(/\.?\s*(?:NRW|NW)\.?$/u, '').trim();
  if (!/^[A-ZÄÖÜ][\p{L}\d-]*[\p{L}\d]$/u.test(base) || GAZETTE_ABBREVIATIONS.has(base)) return undefined;
  return base;
}

/** Nach „… NRW.“ beginnt ein neuer Satz (Großbuchstabe, Anführungszeichen) oder der Text endet: Punkt bleibt. */
const SENTENCE_CONTINUATION_AFTER_DOT = /^(?:\s*$|\s+[A-ZÄÖÜ„"])/u;
const ABBREVIATION_FOLLOW = String.raw`(?=\s+\S|\s*$|[“”"'),;:\]])`;

/** Reihenfolge ist Priorität: längere Muster zuerst. */
export function transformationRules(options: TransformationOptions = {}): TransformationRule[] {
  const known = options.knownStateLawAbbreviations;
  const rules: TransformationRule[] = [
    { id: 'jurisdiction-name-genitive', pattern: /\bLandes Nordrhein-Westfalen\b/gu, replacement: `Landes ${targetProperName()}` },
    { id: 'jurisdiction-name-dative', pattern: /\b(im|dem|vom|beim) Land Nordrhein-Westfalen\b/gu, replacement: `$1 Land ${targetProperName()}` },
    { id: 'jurisdiction-name', pattern: /\bLand Nordrhein-Westfalen\b/gu, replacement: TARGET.name },
    { id: 'jurisdiction-name-adjective', pattern: /\bnordrhein-westfälisch(e|en|er|es|em)?\b/gu, replacement: 'westdeutsch$1' },
    { id: 'jurisdiction-name-adjective-capital', pattern: /\bNordrhein-Westfälisch(e|en|er|es|em)?\b/gu, replacement: 'Westdeutsch$1' },
    { id: 'jurisdiction-name-bare', pattern: /\bNordrhein-Westfalen\b/gu, replacement: targetProperName() },
    { id: 'jurisdiction-abbreviation-law-name-sentence-end', pattern: /(?<=(?:gesetz|Gesetz|gesetzes|Gesetzes|verordnung|Verordnung|ordnung|Ordnung)\s)NRW(?=\.(?:\s|$|[“”"'),;:\]]))/gu, replacement: TARGET.shortName },
  ];
  if (known && known.size > 0) {
    rules.push(
      {
        id: 'jurisdiction-abbreviation-known-law-dotted',
        pattern: new RegExp(String.raw`(?<![\p{L}\d.])([A-ZÄÖÜ][\p{L}\d-]*[\p{L}\d])\.\s?NRW\.${ABBREVIATION_FOLLOW}`, 'gu'),
        replace: (match, source) => {
          const abbreviation = match[1]!;
          if (GAZETTE_ABBREVIATIONS.has(abbreviation) || !known.has(abbreviation)) return null;
          const after = source.slice((match.index ?? 0) + match[0].length);
          return `${abbreviation} ${TARGET.shortName}${SENTENCE_CONTINUATION_AFTER_DOT.test(after) ? '.' : ''}`;
        },
      },
      {
        id: 'jurisdiction-abbreviation-known-law-sentence-end',
        pattern: /(?<![\p{L}\d.])([A-ZÄÖÜ][\p{L}\d-]*[\p{L}\d])\s+NRW(?=\.(?:\s|$|[“”"'),;:\]]))/gu,
        replace: (match) => {
          const abbreviation = match[1]!;
          return !GAZETTE_ABBREVIATIONS.has(abbreviation) && known.has(abbreviation) ? `${abbreviation} ${TARGET.shortName}` : null;
        },
      },
    );
  }
  rules.push({ id: 'jurisdiction-abbreviation', pattern: /(?<![\w.])NRW(?![\w.])/gu, replacement: TARGET.shortName });
  return rules;
}

/** Regelsatz ohne bekannte Normabkürzungen (Kompatibilität, Berichte). */
export const TRANSFORMATION_RULES: readonly TransformationRule[] = transformationRules();

/**
 * Schutzmuster. Fundstellen- und Verkündungsblattkürzel (GV. NRW., SGV. NRW., MBl. NRW.,
 * SMBl. NRW., MB.NRW), Bundesgesetzblatt, URLs und Eigennamen externer Träger bleiben unverändert.
 */
export const PROTECTED_PATTERNS: readonly ProtectedPattern[] = [
  { id: 'gazette-nrw', category: 'source-citation', pattern: /\b(?:GV|SGV|MBl|GVBl|MBl\.|SMBl|ABl)\.?\s*NRW\.?(?:\s*(?:\d{4}\s*)?S\.\s*\d+[a-z]?)?/gu, reason: 'Amtliche Fundstelle des Herkunftslandes (Verkündungs-/Ministerialblatt) bleibt unverändert' },
  { id: 'gazette-nw', category: 'source-citation', pattern: /\bGV\.\s*NW\.?(?:\s*(?:\d{4}\s*)?S\.\s*\d+)?/gu, reason: 'Historische amtliche Fundstelle (GV. NW.) bleibt unverändert' },
  { id: 'gazette-federal', category: 'source-citation', pattern: /\bBGBl\.\s*[IVX]*\s*S\.\s*\d+/gu, reason: 'Fundstelle im Bundesgesetzblatt bleibt unverändert' },
  { id: 'external-proper-names', category: 'external-name', pattern: /\b(?:IT\.NRW|WDR|LVR|LWL)\b/gu, reason: 'Eigenname eines externen Trägers bleibt unverändert' },
  { id: 'url', category: 'source-citation', pattern: /https?:\/\/\S+/gu, reason: 'Adresse der Quelle bleibt unverändert' },
  { id: 'gazette-mb-nrw', category: 'source-citation', pattern: /\bMB\.\s?NRW\b(?:\s+\d{4}\s+Nr\.\s*\d+)?/gu, reason: 'Amtliche Fundstelle im Ministerialblatt (MB.NRW) bleibt unverändert' },
  { id: 'external-nrw-dot-names', category: 'external-name', pattern: /\bNRW\.[A-ZÄÖÜ][\p{L}\d-]*/gu, reason: 'Eigenname mit Präfix „NRW.“ (z. B. NRW.BANK) bleibt unverändert' },
];

export interface ProtectedSpan {
  start: number;
  end: number;
  id: string;
  category: ProtectedPattern['category'];
  text: string;
}

export interface TransformSegment {
  start: number;
  end: number;
  rule: string;
  from: string;
  to: string;
}

/** Maskierungszeichen (Private Use Area), längengleich zum maskierten Text. */
const MASK = String.fromCharCode(0xe000);

function mask(value: string, start: number, end: number): string {
  return `${value.slice(0, start)}${MASK.repeat(end - start)}${value.slice(end)}`;
}

/** Findet Schutzstellen in Prioritätsreihenfolge (spätere Muster sehen frühere nicht). */
export function findProtectedSpans(value: string): { spans: ProtectedSpan[]; masked: string } {
  let masked = value;
  const spans: ProtectedSpan[] = [];
  for (const entry of PROTECTED_PATTERNS) {
    for (const match of [...masked.matchAll(new RegExp(entry.pattern.source, entry.pattern.flags))]) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].length === 0) continue;
      spans.push({ start, end, id: entry.id, category: entry.category, text: value.slice(start, end) });
    }
    for (const span of spans.filter((candidate) => candidate.id === entry.id)) masked = mask(masked, span.start, span.end);
  }
  return { spans: spans.sort((left, right) => left.start - right.start), masked };
}

/** Plant alle Ersetzungen auf dem Quelltext (Positionen beziehen sich auf den unveränderten Text). */
export function planTransformation(value: string, options: TransformationOptions = {}): { protectedSpans: ProtectedSpan[]; segments: TransformSegment[] } {
  const { spans, masked: protectedMasked } = findProtectedSpans(value);
  let masked = protectedMasked;
  const segments: TransformSegment[] = [];
  for (const rule of transformationRules(options)) {
    const found: TransformSegment[] = [];
    for (const match of masked.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].includes(MASK)) continue;
      let replacement: string | null;
      if (rule.replace) replacement = rule.replace(match, masked);
      else {
        const groups = match.slice(1);
        replacement = (rule.replacement ?? '').replace(/\$(\d)/gu, (_placeholder, index: string) => String(groups[Number.parseInt(index, 10) - 1] ?? ''));
      }
      if (replacement === null) continue;
      found.push({ start, end, rule: rule.id, from: value.slice(start, end), to: replacement });
    }
    for (const segment of found) masked = mask(masked, segment.start, segment.end);
    segments.push(...found);
  }
  return { protectedSpans: spans, segments: segments.sort((left, right) => left.start - right.start) };
}

export function applySegments(value: string, segments: readonly TransformSegment[]): string {
  let output = '';
  let cursor = 0;
  for (const segment of [...segments].sort((left, right) => left.start - right.start)) {
    output += value.slice(cursor, segment.start) + segment.to;
    cursor = segment.end;
  }
  return output + value.slice(cursor);
}
