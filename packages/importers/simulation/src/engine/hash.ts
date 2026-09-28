/**
 * Kanonische Prüfsummen der Konsolidierung – wörtlich nach OstRecht (`scripts/lib/consolidation-engine.mjs`):
 * `sha256(canonicalJson(value))`. Rezepte nennen damit den Zielblock (`expectedHash`), den Normkörper
 * (`replaceBody`) oder `{ title, body }` (`repealLaw`) der gespeicherten Fassung, auf die sie wirken.
 * Rezeptautoren und Engine müssen dieselbe Funktion verwenden; deshalb liegt sie getrennt vom Rest der Engine.
 */
import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalJson((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export function sha256(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(canonicalJson(value));
  return createHash('sha256').update(serialized).digest('hex');
}
