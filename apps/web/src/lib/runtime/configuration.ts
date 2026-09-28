/**
 * Laufzeit-Konfigurationsfehler des Workers (fehlende D1-Bindings). Fail-closed: Eine unvollständige
 * Worker-Konfiguration liefert eine klare 500-Antwort mit interner Meldung (Binding-Namen aus wrangler.jsonc,
 * keine Werte, keine Zugangsdaten) statt einer stillen leeren Website. Ohne Astro-Abhängigkeit, damit die
 * Logik mit einer Fake-Umgebung testbar ist (tests/unit/web-runtime-configuration.test.ts).
 */
import { JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { RUNTIME_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import { isOstRechtContractError } from '@landesrecht/runtime/ostrecht-contract.ts';
import { missingBindings } from '@landesrecht/runtime/registry.ts';

export class RuntimeConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(message: string, missing: readonly string[] = []) {
    super(message);
    this.name = 'RuntimeConfigurationError';
    this.missing = missing;
  }
}

/** Konfigurationsfehler des Workers oder verletzter Schema-Contract der OstRecht-D1: beides fail-closed (500). */
export function isRuntimeConfigurationError(error: unknown): error is RuntimeConfigurationError | Error {
  return error instanceof RuntimeConfigurationError || (error instanceof Error && error.name === 'RuntimeConfigurationError') || isOstRechtContractError(error);
}

/** Alle Laufzeit-D1-Bindings (eines je Jurisdiktion; Ost: OstRecht-D1) müssen vorhanden sein und `prepare` anbieten. */
export function assertCompleteBindings(env: Record<string, unknown>): void {
  const missing = missingBindings(env);
  const malformed = [...new Set(JURISDICTION_IDS.map((jurisdiction) => RUNTIME_D1_BINDINGS[jurisdiction]))].filter((binding) => env[binding] && typeof (env[binding] as { prepare?: unknown }).prepare !== 'function');
  const problems = [...missing, ...malformed];
  if (problems.length === 0) return;
  const all = missing.length === JURISDICTION_IDS.length;
  throw new RuntimeConfigurationError(
    `${all ? 'Alle D1-Bindings fehlen' : `D1-Binding(s) fehlen oder sind keine D1-Datenbank: ${problems.join(', ')}`} in der Worker-Konfiguration (apps/web/wrangler.jsonc, d1_databases; Deploy mit --env "" bzw. --env staging prüfen).`,
    problems,
  );
}

/** Interne 500-Antwort für Konfigurationsfehler: Klartext, nicht cachebar, ohne Umgebungswerte. */
export function configurationErrorResponse(error: Error): Response {
  const body = ['Konfigurationsfehler des Landesrechtsportals (HTTP 500).', '', error.message, '', 'Diese Meldung ist für den Betrieb bestimmt; die Website ist erst nach Korrektur der Worker-Konfiguration erreichbar.'].join('\n');
  return new Response(body, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
