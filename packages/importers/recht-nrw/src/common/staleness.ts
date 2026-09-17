/**
 * Parser- und Transformer-Versionen des Importbestands. Steigt eine Version, gilt ein bereits bewerteter
 * Eintrag als veraltet („stale“): Coverage und Audit melden ihn, ein kontrollierter Regenerationslauf
 * (`bulk --regenerate-stale`, aus dem Cache) bewertet ihn neu. Inhalte ändern sich nie ohne diesen Lauf.
 *
 * Veraltet ist jeder Manifesteintrag mit abweichender Parser- oder Transformerversion – unabhängig vom
 * Importstatus: auch `excluded`, `needs-review`, `failed` und `not-at-baseline` sind Bewertungen eines
 * bestimmten Parserstands und werden mit dem aktuellen Stand erneut geprüft. Die Regeneration ändert den
 * Status nicht von sich aus: ein mit Parser 1.0.0 ausgeschlossener Eintrag, den Parser 1.2.0 wieder
 * ausschließt, bleibt `excluded` – nur mit aktueller Versionsangabe im Manifest.
 *
 * Bleibt ein Eintrag nach der Regeneration auf einer älteren Version, weil ein Reimport keinen Import mehr
 * ergibt (`import-regression`, LRGV/LRMB-Pipeline), ist das nur mit dokumentierter Legacy-Ausnahme zulässig
 * (`legacy-exceptions.ts`); der Versionsreport (`version-report.ts`) unterscheidet begründete von
 * unbegründeten Altständen.
 */
import { LRMB_PARSER_VERSION } from '../lrmb/parser.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { PARSER_VERSION } from './constants.ts';
import type { EnumerationStatus } from './enumeration.ts';
import type { ImportStatus, ManifestEntry, SourceArea } from './manifest.ts';

export function currentParserVersion(area: SourceArea): string {
  return area === 'lrgv' ? PARSER_VERSION : LRMB_PARSER_VERSION;
}

export function currentTransformerVersion(): string {
  return TRANSFORMER_VERSION;
}

/**
 * Importstatus, deren Manifesteinträge bei einem Versionswechsel neu bewertet werden. `dry-run` wird nie
 * persistiert und fehlt deshalb.
 */
export const STALE_REGENERATION_STATUSES: readonly ImportStatus[] = ['imported', 'imported-with-warnings', 'needs-review', 'failed', 'excluded', 'not-at-baseline'];

/**
 * Enumerationsstatus, die `--regenerate-stale` erfasst: alle abgeschlossenen Bewertungen. `pending` und
 * `processing` werden ohnehin verarbeitet.
 */
export const STALE_REGENERATION_ENUMERATION_STATUSES: readonly EnumerationStatus[] = ['done', 'review', 'failed', 'excluded'];

export type StaleCheckEntry = Pick<ManifestEntry, 'sourceArea' | 'parserVersion' | 'transformerVersion'> & Partial<Pick<ManifestEntry, 'importStatus'>>;

/** Welche Version abweicht (leer, wenn der Eintrag aktuell ist). */
export function staleReasons(entry: StaleCheckEntry): string[] {
  const reasons: string[] = [];
  const parser = currentParserVersion(entry.sourceArea);
  if (entry.parserVersion !== parser) reasons.push(`Parser ${entry.parserVersion} ≠ ${parser}`);
  if (entry.transformerVersion !== TRANSFORMER_VERSION) reasons.push(`Transformer ${entry.transformerVersion} ≠ ${TRANSFORMER_VERSION}`);
  return reasons;
}

/**
 * Ein Eintrag gilt als veraltet, wenn Parser- oder Transformerversion vom aktuellen Stand abweicht – für jeden
 * persistierten Importstatus (siehe `STALE_REGENERATION_STATUSES`).
 */
export function isStaleEntry(entry: StaleCheckEntry): boolean {
  if (entry.importStatus !== undefined && !STALE_REGENERATION_STATUSES.includes(entry.importStatus)) return false;
  return staleReasons(entry).length > 0;
}

/** Ob ein Enumerationseintrag mit diesem Status von `--regenerate-stale` erfasst wird (Manifestprüfung folgt). */
export function isRegenerableEnumerationStatus(status: EnumerationStatus): boolean {
  return STALE_REGENERATION_ENUMERATION_STATUSES.includes(status);
}

export function regenerationCommand(area: SourceArea): string {
  return `npm run import:recht-nrw:bulk -- --area ${area} --regenerate-stale --offline --write --resume`;
}
