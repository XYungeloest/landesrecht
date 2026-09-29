/**
 * Zuordnung einer neuen Inbox-Datei zur Akquisitionsliste (docs/MAINTENANCE.md). Mehrstufig, vom stärksten Signal:
 *  1. exakter Hash (Datei ist bereits Kandidat einer Lücke),
 *  2. Publikationsidentität (Blattart, Jahr und Nummer aus dem Textkopf gegen die erwartete Ausgabe),
 *  3. interne Aktenzeichen (z. B. „26-StMWF-07-GE-02“) in Lücke und Dokumenttext,
 *  4. Titel und Datum aus dem Textkopf gegen erwarteten Titel und erwartetes Datum,
 *  5. nur ergänzend der Dateiname (nie allein ausreichend).
 * `matched` verlangt ein starkes Signal mit Bestätigung (oder exakten Hash); alles Schwächere ist `possible-match` und
 * schließt nie automatisch einen Queue-Eintrag. Keine fachliche Interpretation allein aus dem Dateinamen.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

import type { SourceGap } from '../completeness/schema.ts';
import type { DetectedFacts } from '../inventory/detect.ts';

export type MatchSignal = 'hash' | 'publication' | 'internal-id' | 'date-exact' | 'date-month' | 'title-strong' | 'title-weak' | 'filename';
export type MatchLevel = 'exact' | 'strong' | 'weak';

export interface QueueGap {
  jurisdiction: JurisdictionId;
  gap: SourceGap;
}

export interface GapMatch {
  jurisdiction: JurisdictionId;
  gapId: string;
  priority?: string;
  status?: string;
  level: MatchLevel;
  signals: MatchSignal[];
}

export interface MatchInput {
  sha256: string;
  fileName: string;
  facts: Pick<DetectedFacts, 'title' | 'documentDate' | 'issueDate' | 'seriesKind' | 'year' | 'number'>;
  /** Anfang des Textauszugs (Aktenzeichen, Kopf). */
  text: string;
}

const STOPWORDS = new Set(['über', 'ueber', 'und', 'oder', 'der', 'die', 'das', 'des', 'den', 'dem', 'für', 'fuer', 'zur', 'zum', 'eines', 'einer', 'einem', 'eine', 'vom', 'von', 'sowie', 'nach', 'mit', 'bei', 'aus', 'ausgabe', 'nummer']);

export function titleTokens(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((token) => token.length >= 4 && !STOPWORDS.has(token)));
}

/** Anteil der Titelwörter der Lücke, die im Dokumenttitel vorkommen (0–1). */
export function titleOverlap(expected: string | undefined, actual: string | undefined): number {
  const want = titleTokens(expected);
  const have = titleTokens(actual);
  if (want.size === 0 || have.size === 0) return 0;
  let common = 0;
  for (const token of want) if (have.has(token)) common += 1;
  return common / want.size;
}

const INTERNAL_ID = /\b\d{2}-[A-Za-zÄÖÜäöü]{2,12}-\d{2}-[A-Z]{1,3}-\d{2}\b/gu;

export function internalIds(text: string): Set<string> {
  return new Set([...text.matchAll(INTERNAL_ID)].map((match) => match[0]));
}

/** Erwartete Publikation aus Lücke: Blattart, Jahr, Nummer (nur wenn alle drei erkennbar). */
export function expectedPublicationKey(gap: SourceGap): { kind: string; year: number; number: number } | undefined {
  const text = gap.series !== undefined ? `${gap.series} ${gap.issue}` : gap.expectedPublication;
  if (!text) return undefined;
  const kind = /\bMBl\b|Ministerialblatt/u.test(text) ? 'mbl' : /\bGV\.|\bGVBl\b|GVOBl|Gesetz- und Verordnungsblatt/u.test(text) ? 'gvbl' : undefined;
  const year = /\b(20\d{2})\b/u.exec(text)?.[1];
  const number = /\bNr\.\s*0*(\d+)/u.exec(text)?.[1] ?? /\bTeil\s+0*(\d+)\s*\/\s*20\d{2}/u.exec(text)?.[1];
  if (!kind || !year || !number) return undefined;
  return { kind, year: Number(year), number: Number(number) };
}

function detectedPublicationKey(facts: MatchInput['facts']): { kind: string; year: number; number: number } | undefined {
  if (!facts.seriesKind || facts.seriesKind === 'drucksache' || facts.seriesKind === 'other' || !facts.year || !facts.number) return undefined;
  const number = /^0*(\d+)/u.exec(facts.number)?.[1];
  if (!number) return undefined;
  return { kind: facts.seriesKind === 'mbl' ? 'mbl' : 'gvbl', year: facts.year, number: Number(number) };
}

/** Signale und Stufe einer Datei gegenüber einer Lücke; `undefined`, wenn nichts oder nur der Dateiname passt. */
export function matchGap(input: MatchInput, entry: QueueGap): GapMatch | undefined {
  const { gap } = entry;
  const signals: MatchSignal[] = [];
  if (gap.acquisition?.candidate?.sha256 === input.sha256 || gap.acquisition?.resolution?.resolvedBySha256 === input.sha256) signals.push('hash');
  const expected = expectedPublicationKey(gap);
  const detected = detectedPublicationKey(input.facts);
  if (expected && detected && expected.kind === detected.kind && expected.year === detected.year && expected.number === detected.number) signals.push('publication');
  const gapIds = internalIds(`${gap.title} ${gap.existenceEvidence} ${gap.note ?? ''}`);
  const docIds = internalIds(input.text);
  if ([...gapIds].some((id) => docIds.has(id))) signals.push('internal-id');
  const dates = [input.facts.documentDate, input.facts.issueDate].filter((value): value is string => Boolean(value));
  if (gap.expectedDate && /^\d{4}-\d{2}-\d{2}$/u.test(gap.expectedDate) && dates.includes(gap.expectedDate)) signals.push('date-exact');
  else if (gap.expectedDate && /^\d{4}-\d{2}$/u.test(gap.expectedDate) && dates.some((date) => date.startsWith(gap.expectedDate!))) signals.push('date-month');
  const overlap = titleOverlap(gap.title, input.facts.title);
  if (overlap >= 0.6) signals.push('title-strong');
  else if (overlap >= 0.3) signals.push('title-weak');
  if (titleOverlap(gap.title, input.fileName.replace(/\.[^.]+$/u, '')) >= 0.3) signals.push('filename');

  const has = (signal: MatchSignal): boolean => signals.includes(signal);
  const corroborated = has('date-exact') || has('date-month') || has('title-strong') || has('title-weak');
  let level: MatchLevel | undefined;
  if (has('hash')) level = 'exact';
  else if ((has('publication') || has('internal-id')) && corroborated) level = 'strong';
  else if (has('title-strong') && has('date-exact')) level = 'strong';
  else if (has('publication') || has('internal-id') || has('title-strong') || has('title-weak') || (has('date-exact') && has('filename'))) level = 'weak';
  if (!level) return undefined;
  return { jurisdiction: entry.jurisdiction, gapId: gap.id, ...(gap.acquisition ? { priority: gap.acquisition.priority, status: gap.acquisition.status } : {}), level, signals };
}

const LEVEL_ORDER: Record<MatchLevel, number> = { exact: 0, strong: 1, weak: 2 };

export function rankMatches(matches: GapMatch[]): GapMatch[] {
  return matches.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.signals.length - a.signals.length || a.gapId.localeCompare(b.gapId));
}
