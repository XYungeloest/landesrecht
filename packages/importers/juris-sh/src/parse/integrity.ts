/**
 * Textintegrität der PDF-Übernahme: sichtbarer Normtext der Quelle gegen den kanonischen Text.
 *
 * Zwei Stufen:
 *
 *   1. **Zeichenfolge** – alle Buchstaben und Ziffern der Quelle in Lesereihenfolge (Zeichensetzung,
 *      Leerraum und Trennstriche fallen heraus) gegen dieselbe Folge des kanonischen Normkörpers. Gleich ⇒
 *      kein Zeichen verloren, keines doppelt, keine Umstellung (`exact`). Die Silbentrennung am Zeilenende
 *      kann dabei keinen Unterschied erzeugen: Der Trennstrich ist Zeichensetzung.
 *   2. Sonst die **Wortmenge** wie im BayWü-Adapter (`contentTokens`, typografisch normalisiert): gleiche
 *      Multimenge ⇒ `normalized-equivalent` (Umstellung ohne Verlust), benannte Erklärungen abgezogen ⇒
 *      `explained-difference`, bis zu drei unerklärte Wörter ⇒ `review`, mehr ⇒ `mismatch` (sperrt).
 *
 * Die Toleranz ist die des BayWü-Adapters und wird nicht erhöht.
 */
import { contentTokens, normalizeTypography } from '@landesrecht/importer-bayernrecht/inventory/text.ts';

export const INTEGRITY_CLASSES = ['exact', 'normalized-equivalent', 'explained-difference', 'review', 'mismatch'] as const;
export type IntegrityClass = (typeof INTEGRITY_CLASSES)[number];
export const REVIEW_TOKEN_LIMIT = 3;

export interface IntegrityResult {
  class: IntegrityClass;
  sourceCharacters: number;
  canonicalCharacters: number;
  sourceTokens: number;
  canonicalTokens: number;
  missing: number;
  extra: number;
  explanations: string[];
  /** Erste Abweichung der Zeichenfolge mit Umgebung (Quelle | kanonisch). */
  firstDivergence?: { offset: number; source: string; canonical: string };
  missingExamples?: string[];
  extraExamples?: string[];
}

/** Buchstaben und Ziffern in Lesereihenfolge, typografisch normalisiert (Hochzahlen → Ziffern). */
export function characterStream(text: string): string {
  return [...normalizeTypography(text).matchAll(/[\p{L}\p{N}]+/gu)].map((match) => match[0]).join('');
}

function counts(tokens: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
  return map;
}

function subtract(map: Map<string, number>, token: string): boolean {
  const count = map.get(token);
  if (!count) return false;
  if (count === 1) map.delete(token);
  else map.set(token, count - 1);
  return true;
}

/**
 * Quelltext für den Wortvergleich: Zeilen mit derselben Silbentrennungsregel verbunden wie im Parser – sonst
 * zerfiele „Selbstverwal-/tungsgarantie“ auf der Quellseite in zwei Wörter, auf der kanonischen in eines.
 */
export function joinSourceLines(sourceText: string, join: (previous: string, next: string) => string): string {
  return sourceText.split('\n').reduce((text, line) => join(text, line.trim()), '');
}

export function compareIntegrity(sourceText: string, canonicalText: string, explained: ReadonlyArray<{ reason: string; text: string; replacement?: string }> = [], join?: (previous: string, next: string) => string): IntegrityResult {
  const source = characterStream(sourceText);
  const canonical = characterStream(canonicalText);
  const base: IntegrityResult = { class: 'exact', sourceCharacters: source.length, canonicalCharacters: canonical.length, sourceTokens: 0, canonicalTokens: 0, missing: 0, extra: 0, explanations: [] };
  if (source === canonical) return base;
  // Benannt übernommene Zeilen (z. B. VwV-Metadaten): Zeichenfolge der Quelle ohne sie – stimmt der Rest genau, ist
  // der Unterschied vollständig erklärt, ohne auf den Wortvergleich auszuweichen.
  if (explained.length > 0) {
    let reduced = source;
    const used: string[] = [];
    for (const explanation of explained) {
      const stream = characterStream(explanation.text);
      const at = stream ? reduced.indexOf(stream) : -1;
      if (at < 0) continue;
      // Mit Ersatz: dieselben Zeichen in anderer Folge (mehrzeilige Tabellenzellen); sonst entfernt (Metadatum).
      reduced = `${reduced.slice(0, at)}${explanation.replacement !== undefined ? characterStream(explanation.replacement) : ''}${reduced.slice(at + stream.length)}`;
      used.push(explanation.reason);
    }
    if (reduced === canonical) return { ...base, class: 'explained-difference', explanations: [...new Set(used)].sort() };
  }
  let offset = 0;
  while (offset < source.length && offset < canonical.length && source[offset] === canonical[offset]) offset += 1;
  base.firstDivergence = { offset, source: source.slice(Math.max(0, offset - 30), offset + 50), canonical: canonical.slice(Math.max(0, offset - 30), offset + 50) };

  const sourceTokens = contentTokens(join ? joinSourceLines(sourceText, join) : sourceText);
  const canonicalTokens = contentTokens(canonicalText);
  base.sourceTokens = sourceTokens.length;
  base.canonicalTokens = canonicalTokens.length;
  const sourceCounts = counts(sourceTokens);
  const canonicalCounts = counts(canonicalTokens);
  const missing = new Map<string, number>();
  const extra = new Map<string, number>();
  for (const [token, count] of sourceCounts) if (count > (canonicalCounts.get(token) ?? 0)) missing.set(token, count - (canonicalCounts.get(token) ?? 0));
  for (const [token, count] of canonicalCounts) if (count > (sourceCounts.get(token) ?? 0)) extra.set(token, count - (sourceCounts.get(token) ?? 0));
  if (missing.size === 0 && extra.size === 0) return { ...base, class: 'normalized-equivalent' };
  for (const explanation of explained) {
    let used = false;
    for (const token of contentTokens(explanation.text)) if (subtract(missing, token) || subtract(extra, token)) used = true;
    if (used) base.explanations.push(explanation.reason);
  }
  const total = (map: Map<string, number>): number => [...map.values()].reduce((sum, value) => sum + value, 0);
  const missingTotal = total(missing);
  const extraTotal = total(extra);
  const result: IntegrityResult = { ...base, missing: missingTotal, extra: extraTotal, explanations: [...new Set(base.explanations)].sort() };
  if (missingTotal === 0 && extraTotal === 0) return { ...result, class: 'explained-difference' };
  result.missingExamples = [...missing.entries()].slice(0, 8).map(([token, count]) => `${token}×${count}`);
  result.extraExamples = [...extra.entries()].slice(0, 8).map(([token, count]) => `${token}×${count}`);
  result.class = missingTotal > REVIEW_TOKEN_LIMIT || extraTotal > REVIEW_TOKEN_LIMIT ? 'mismatch' : 'review';
  return result;
}
