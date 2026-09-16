/**
 * Parser- und Transformer-Versionen des Importbestands. Steigt eine Version, gilt ein bereits importierter
 * Eintrag als veraltet („stale import“): Coverage und Audit melden ihn, ein kontrollierter Regenerationslauf
 * (`bulk --regenerate-stale`, aus dem Cache) erneuert ihn. Inhalte ändern sich nie ohne diesen Lauf.
 */
import { LRMB_PARSER_VERSION } from '../lrmb/parser.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { PARSER_VERSION } from './constants.ts';
import type { ManifestEntry, SourceArea } from './manifest.ts';

export function currentParserVersion(area: SourceArea): string {
  return area === 'lrgv' ? PARSER_VERSION : LRMB_PARSER_VERSION;
}

/** Ein Eintrag gilt als veraltet, wenn Parser- oder Transformerversion vom aktuellen Stand abweicht. */
export function isStaleEntry(entry: Pick<ManifestEntry, 'sourceArea' | 'parserVersion' | 'transformerVersion'>): boolean {
  return entry.parserVersion !== currentParserVersion(entry.sourceArea) || entry.transformerVersion !== TRANSFORMER_VERSION;
}

export function regenerationCommand(area: SourceArea): string {
  return `npm run import:recht-nrw:bulk -- --area ${area} --regenerate-stale --offline --write --resume`;
}
