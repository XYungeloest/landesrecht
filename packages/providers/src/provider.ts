/**
 * LegalProvider: Trennung zwischen internem kanonischem Modell und externem Datenlieferanten.
 *
 * Ein Provider liefert kanonische NormRecords (oder Teile davon) für eine Rechtsordnung. Der
 * Portalbestand (ContentProvider) und OstRecht (OstRechtProvider) implementieren die
 * Schnittstelle vollständig; der Bund (FederalProvider) kann nur Verweise auflösen, weil das
 * Bundesrecht extern unter gesetze-sim-internet.de geführt wird.
 */
import type { ReferenceJurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { LegalReference } from '@landesrecht/legal-core/lib/references.ts';
import type { NormRecord, NormVersion } from '@landesrecht/legal-core/lib/schema.ts';
import type { SearchResultPage, SearchState } from '@landesrecht/search/index.ts';

export interface NormVersionDescriptor {
  versionId: string;
  simulationValidFrom: string;
  simulationValidTo: string | null;
  citation: string;
  changeNote: string;
}

export interface ResolvedReference {
  reference: LegalReference;
  /** Absolute oder portalrelative Zieladresse. */
  url: string;
  /** Ob das Ziel außerhalb dieses Portals liegt. */
  external: boolean;
  /** Menschlich lesbare Bezeichnung des Ziels („BGB § 823“). */
  label: string;
  /** Bezeichnung des Zielsystems (Portalname). */
  system: string;
}

export interface LegalProvider {
  readonly id: string;
  readonly label: string;
  readonly jurisdictions: readonly ReferenceJurisdictionId[];
  /** Ob der Provider Normdaten liefert (false: nur Verweisauflösung). */
  readonly providesNorms: boolean;
  getNorm(jurisdiction: ReferenceJurisdictionId, slug: string): Promise<NormRecord | null>;
  getNormVersion(jurisdiction: ReferenceJurisdictionId, slug: string, versionId: string): Promise<NormVersion | null>;
  listVersions(jurisdiction: ReferenceJurisdictionId, slug: string): Promise<NormVersionDescriptor[]>;
  search(state: SearchState): Promise<SearchResultPage>;
  resolveReference(reference: LegalReference): Promise<ResolvedReference | null>;
}

export function describeVersion(version: Pick<NormVersion, 'versionId' | 'simulationValidFrom' | 'simulationValidTo' | 'citation' | 'changeNote'>): NormVersionDescriptor {
  return {
    versionId: version.versionId,
    simulationValidFrom: version.simulationValidFrom,
    simulationValidTo: version.simulationValidTo,
    citation: version.citation,
    changeNote: version.changeNote,
  };
}
