/**
 * Regeln der Rechtsüberleitung Nordrhein-Westfalen → Land Westdeutschland.
 *
 * Nur die Bezeichnung des Herkunftslandes wird automatisch übergeleitet; jede Regel ist einzeln
 * benannt. Schutzmuster (amtliche Fundstellen, URLs, Eigennamen externer Träger) werden vor der
 * Anwendung maskiert und bleiben byteidentisch. Die Maskierung arbeitet längengleich auf dem
 * Quelltext, sodass jede Ersetzung mit ihrer Quellposition protokolliert werden kann.
 */
import { getJurisdiction } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { TARGET_JURISDICTION } from '../common/constants.ts';

export const TRANSFORMER_VERSION = 'recht-nrw-transformer/2.0.0';

export interface TransformationRule {
  id: string;
  pattern: RegExp;
  replacement: string;
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

/** Reihenfolge ist Priorität: längere Muster zuerst. */
export const TRANSFORMATION_RULES: readonly TransformationRule[] = [
  { id: 'jurisdiction-name-genitive', pattern: /\bLandes Nordrhein-Westfalen\b/gu, replacement: `Landes ${targetProperName()}` },
  { id: 'jurisdiction-name-dative', pattern: /\b(im|dem|vom|beim) Land Nordrhein-Westfalen\b/gu, replacement: `$1 Land ${targetProperName()}` },
  { id: 'jurisdiction-name', pattern: /\bLand Nordrhein-Westfalen\b/gu, replacement: TARGET.name },
  { id: 'jurisdiction-name-adjective', pattern: /\bnordrhein-westfälisch(e|en|er|es|em)?\b/gu, replacement: 'westdeutsch$1' },
  { id: 'jurisdiction-name-adjective-capital', pattern: /\bNordrhein-Westfälisch(e|en|er|es|em)?\b/gu, replacement: 'Westdeutsch$1' },
  { id: 'jurisdiction-name-bare', pattern: /\bNordrhein-Westfalen\b/gu, replacement: targetProperName() },
  { id: 'jurisdiction-abbreviation', pattern: /(?<![\w.])NRW(?![\w.])/gu, replacement: TARGET.shortName },
];

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
export function planTransformation(value: string): { protectedSpans: ProtectedSpan[]; segments: TransformSegment[] } {
  const { spans, masked: protectedMasked } = findProtectedSpans(value);
  let masked = protectedMasked;
  const segments: TransformSegment[] = [];
  for (const rule of TRANSFORMATION_RULES) {
    const found: TransformSegment[] = [];
    for (const match of masked.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const groups = match.slice(1);
      const replacement = rule.replacement.replace(/\$(\d)/gu, (_placeholder, index: string) => String(groups[Number.parseInt(index, 10) - 1] ?? ''));
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
