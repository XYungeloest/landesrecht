/**
 * Laufzeit-Konfigurationsfehler des Workers (fehlende D1-Bindings). Fail-closed: Eine unvollständige
 * Worker-Konfiguration liefert eine klare 500-Antwort mit interner Meldung (Binding-Namen aus wrangler.jsonc,
 * keine Werte, keine Zugangsdaten) statt einer stillen leeren Website. Ohne Astro-Abhängigkeit, damit die
 * Logik mit einer Fake-Umgebung testbar ist (tests/unit/web-runtime-configuration.test.ts).
 */
import { getJurisdictionByPathSegment, isJurisdictionId, JURISDICTION_IDS, JURISDICTIONS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { OSTRECHT_D1_BINDING, RUNTIME_D1_BINDINGS } from '@landesrecht/runtime/bindings.ts';
import type { D1Database } from '@landesrecht/runtime/d1-types.ts';
import { checkOstRechtSchemaContract, isOstRechtContractError } from '@landesrecht/runtime/ostrecht-contract.ts';
import { createReadOnlyD1 } from '@landesrecht/runtime/read-only-d1.ts';
import { createRegistryFromEnv, missingBindings, type JurisdictionAvailability, type StoreRegistry } from '@landesrecht/runtime/registry.ts';

/**
 * Laufzeitmodus. `production` ist jeder gebaute Worker (Produktion, Staging): alle Bindings Pflicht, Ost-Contract
 * fail-closed. `development` gilt ausschließlich für den lokalen Entwicklungsserver (`astro dev`, Vite `DEV`) und Tests,
 * die ihn ausdrücklich wählen; im Build ist `import.meta.env.DEV` zur Übersetzungszeit `false`.
 */
export type RuntimeMode = 'production' | 'development';

export function currentRuntimeMode(): RuntimeMode {
  // Statischer Zugriff: Vite ersetzt `import.meta.env.DEV` beim Build durch `false` (nur `astro dev` liefert `true`);
  // außerhalb von Vite (Node-Skripte) fehlt `import.meta.env` → Produktion. Typen kennt nur der Astro-Kontext.
  try {
    // @ts-ignore -- `import.meta.env` ist in der Node-Typprüfung unbekannt, in Astro typisiert
    return import.meta.env.DEV === true ? 'development' : 'production';
  } catch {
    return 'production';
  }
}

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
export function assertCompleteBindings(env: Record<string, unknown>, options: { exclude?: readonly string[] } = {}): void {
  const excluded = new Set(options.exclude ?? []);
  const missing = missingBindings(env).filter((binding) => !excluded.has(binding));
  const malformed = [...new Set(JURISDICTION_IDS.map((jurisdiction) => RUNTIME_D1_BINDINGS[jurisdiction]))].filter((binding) => !excluded.has(binding) && env[binding] && typeof (env[binding] as { prepare?: unknown }).prepare !== 'function');
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

function isD1(binding: unknown): binding is D1Database {
  return Boolean(binding) && typeof (binding as { prepare?: unknown }).prepare === 'function';
}

/** Externe (nicht von Landesrecht betriebene) Laufzeitquellen: Ost aus der OstRecht-D1. */
const EXTERNAL_JURISDICTIONS: readonly JurisdictionId[] = JURISDICTION_IDS.filter((jurisdiction) => JURISDICTIONS[jurisdiction].runtimeSource === 'ostrecht-d1');

const localProbes = new WeakMap<object, { at: number; result: Promise<JurisdictionAvailability> }>();
const LOCAL_PROBE_MS = 60_000;

/**
 * Nur Entwicklung: Ist die externe OstRecht-D1 lokal nicht gebunden oder erfüllt sie den Schema-Contract nicht (leere
 * lokale D1 von Wrangler), ist Ost `unavailable-local`. Eine lokale D1, die den Contract erfüllt, ist nur eine lokale
 * Kopie: `fixture` (Teilbestand, development only) – nie der produktive Bestand.
 */
async function localExternalAvailability(binding: unknown): Promise<JurisdictionAvailability> {
  if (!isD1(binding)) return { state: 'unavailable-local', mode: 'development', reason: `Binding ${OSTRECHT_D1_BINDING} lokal nicht konfiguriert` };
  const cached = localProbes.get(binding as object);
  if (cached && Date.now() - cached.at < LOCAL_PROBE_MS) return cached.result;
  const result = checkOstRechtSchemaContract(createReadOnlyD1(binding)).then(
    (report): JurisdictionAvailability => (report.ok
      ? { state: 'fixture', mode: 'development', reason: `lokale ${OSTRECHT_D1_BINDING} (Kopie, development only, nicht als vollständig garantiert)` }
      : { state: 'unavailable-local', mode: 'development', reason: `lokale ${OSTRECHT_D1_BINDING} erfüllt den Schema-Contract nicht (${report.problems.length} Befund(e))` }),
    (): JurisdictionAvailability => ({ state: 'unavailable-local', mode: 'development', reason: `lokale ${OSTRECHT_D1_BINDING} nicht lesbar` }),
  );
  localProbes.set(binding as object, { at: Date.now(), result });
  return result;
}

/**
 * Registry aus der Worker-Umgebung. Produktion: unverändert fail-closed (`assertCompleteBindings`, Ost-Contract im Store).
 * Entwicklung: eigene Bindings (West, NSH, BayWü) bleiben Pflicht; eine lokal fehlende oder leere externe OstRecht-D1
 * macht nur Ost unverfügbar (503 für Ost-Anfragen), nicht die ganze Website.
 */
export async function buildWorkerRegistry(env: Record<string, unknown>, mode: RuntimeMode): Promise<StoreRegistry> {
  if (mode === 'production') {
    assertCompleteBindings(env);
    return createRegistryFromEnv(env);
  }
  const availability: Partial<Record<JurisdictionId, JurisdictionAvailability>> = {};
  const exclude: string[] = [];
  for (const jurisdiction of EXTERNAL_JURISDICTIONS) {
    availability[jurisdiction] = await localExternalAvailability(env[RUNTIME_D1_BINDINGS[jurisdiction]]);
    // Für die Pflichtprüfung der eigenen Bindings zählt ein lokal unverfügbares externes Binding nicht.
    if (availability[jurisdiction]!.state === 'unavailable-local') exclude.push(RUNTIME_D1_BINDINGS[jurisdiction]);
  }
  assertCompleteBindings(env, { exclude });
  return createRegistryFromEnv(env, { availability });
}

/** 503-Antwort für eine lokal nicht verfügbare Jurisdiktion (nur Entwicklung); JSON für die API, sonst Klartext. */
export function unavailableJurisdictionResponse(jurisdiction: JurisdictionId, availability: JurisdictionAvailability, api: boolean): Response {
  const headers = { 'cache-control': 'no-store', 'retry-after': '3600' };
  if (api) {
    return new Response(`${JSON.stringify({ error: 'jurisdiction-unavailable', jurisdiction, availability, mode: 'development', message: `Die Jurisdiktion „${jurisdiction}“ ist im lokalen Entwicklungsbetrieb nicht verfügbar; die übrigen Jurisdiktionen arbeiten normal. Produktion bleibt fail-closed.` }, null, 2)}\n`, { status: 503, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  const body = [`Jurisdiktion „${jurisdiction}“ lokal nicht verfügbar (HTTP 503, Entwicklungsbetrieb).`, '', availability.reason ?? availability.state, '', 'Die übrigen Jurisdiktionen arbeiten normal. In Produktion ist das Binding Pflicht (fail-closed).'].join('\n');
  return new Response(body, { status: 503, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
}

/**
 * Jurisdiktion, auf die eine Anfrage über den Pfad zielt: Länderseiten (`/<pfadsegment>/…`), Norm- und
 * Verkündungs-API (`/api/v1/{norms,publications}/<id>/…`). Such-Filter behandelt die Registry (`search`).
 */
export function requestedJurisdictions(url: URL): JurisdictionId[] {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'api' && segments[1] === 'v1' && (segments[2] === 'norms' || segments[2] === 'publications') && isJurisdictionId(segments[3])) return [segments[3]];
  const jurisdiction = segments[0] ? getJurisdictionByPathSegment(decodeURIComponent(segments[0])) : undefined;
  return jurisdiction ? [jurisdiction.id] : [];
}
