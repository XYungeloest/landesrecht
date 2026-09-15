/**
 * Namen der Cloudflare-Bindings – genau einmal definiert. Wrangler-Konfiguration, Worker-Umgebung
 * und Tests lesen sie hier. Je Jurisdiktion eine eigene D1-Datenbank; ein gemeinsames
 * R2-Quellenarchiv mit Jurisdiktionspräfix im Objektschlüssel.
 */
import { JURISDICTION_IDS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

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
