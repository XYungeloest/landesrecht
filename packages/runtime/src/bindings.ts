/**
 * Namen der Cloudflare-Bindings – genau einmal definiert. Wrangler-Konfiguration, Worker-Umgebung
 * und Tests lesen sie hier. Je Jurisdiktion eine eigene D1-Datenbank; ein gemeinsames
 * R2-Quellenarchiv mit Jurisdiktionspräfix im Objektschlüssel.
 *
 * Ost wird zur Laufzeit nur lesend aus der OstRecht-D1 `ostrecht-recht` bedient (Binding `OSTRECHT_RECHT`,
 * `runtimeSource: 'ostrecht-d1'` in jurisdictions.ts). `LANDESRECHT_OST`/`landesrecht-ost` sind nur noch Namen für
 * Skripte und Tests: kein Binding im Worker, keine Projektion, keine Laufzeitquelle; die Datenbank ist im Konto
 * nicht mehr vorhanden und wird nicht neu angelegt (`WORKER_D1_BINDINGS`).
 */
import { JURISDICTION_IDS, JURISDICTIONS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

export const D1_BINDINGS: Readonly<Record<JurisdictionId, string>> = {
  west: 'LANDESRECHT_WEST',
  nsh: 'LANDESRECHT_NSH',
  ost: 'LANDESRECHT_OST',
  baywue: 'LANDESRECHT_BAYWUE',
};

export const D1_DATABASE_NAMES: Readonly<Record<JurisdictionId, string>> = {
  west: 'landesrecht-west',
  nsh: 'landesrecht-nsh',
  ost: 'landesrecht-ost',
  baywue: 'landesrecht-baywue',
};

/** Read-only-Binding der OstRecht-D1 (Datenbank von OstRecht; nie migriert, nie beschrieben, nie projiziert). */
export const OSTRECHT_D1_BINDING = 'OSTRECHT_RECHT';
export const OSTRECHT_D1_DATABASE_NAMES = { production: 'ostrecht-recht', staging: 'ostrecht-recht-staging' } as const;

/** Binding, aus dem die Laufzeit den Bestand einer Jurisdiktion liest (Ost: OstRecht-D1). */
export function runtimeBindingFor(jurisdiction: JurisdictionId): string {
  return JURISDICTIONS[jurisdiction].runtimeSource === 'ostrecht-d1' ? OSTRECHT_D1_BINDING : D1_BINDINGS[jurisdiction];
}

/** Alle Laufzeit-Bindings (eines je Jurisdiktion), fail-closed geprüft in der Worker-Konfiguration. */
export const RUNTIME_D1_BINDINGS: Readonly<Record<JurisdictionId, string>> = Object.fromEntries(JURISDICTION_IDS.map((jurisdiction) => [jurisdiction, runtimeBindingFor(jurisdiction)])) as Record<JurisdictionId, string>;

/** D1-Bindings, die der Worker tatsächlich deklariert (wrangler.jsonc): Binding → Datenbankname (Produktion). */
export const WORKER_D1_BINDINGS: ReadonlyArray<{ binding: string; databaseName: string }> = JURISDICTION_IDS.map((jurisdiction) => (
  JURISDICTIONS[jurisdiction].runtimeSource === 'ostrecht-d1'
    ? { binding: OSTRECHT_D1_BINDING, databaseName: OSTRECHT_D1_DATABASE_NAMES.production }
    : { binding: D1_BINDINGS[jurisdiction], databaseName: D1_DATABASE_NAMES[jurisdiction] }
));

export const R2_SOURCES_BINDING = 'LANDESRECHT_QUELLEN';
export const R2_SOURCES_BUCKET_NAME = 'landesrecht-quellen';

export function d1BindingFor(jurisdiction: JurisdictionId): string {
  return D1_BINDINGS[jurisdiction];
}

export function jurisdictionForBinding(binding: string): JurisdictionId | undefined {
  return JURISDICTION_IDS.find((jurisdiction) => D1_BINDINGS[jurisdiction] === binding);
}

/** R2-Objektschlüssel einer archivierten Rohquelle: <jurisdiction>/<system>/<stichtag>/<datei>. */
export function sourceObjectKey(jurisdiction: JurisdictionId, system: string, snapshotDate: string, fileName: string): string {
  return `${jurisdiction}/${system}/${snapshotDate}/${fileName}`;
}
