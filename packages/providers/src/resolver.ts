/**
 * Zentraler Verweis-Resolver. Genau hier wird entschieden, wohin ein Rechtsverweis führt:
 *
 *   bund   → FederalProvider (gesetze-sim-internet.de)
 *   ost    → OstRechtProvider (öffentliches OstRecht), solange der Bestand extern geführt wird;
 *            später ContentProvider (interne Portalroute)
 *   west, nsh, baywue → ContentProvider (interne Portalroute)
 *
 * Komponenten rufen nur `resolveLegalReference`; keine Komponente bildet selbst eine URL.
 */
import type { ReferenceJurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { LegalReference } from '@landesrecht/legal-core/lib/references.ts';

import type { LegalProvider, ResolvedReference } from './provider.ts';

export interface ReferenceResolver {
  resolve(reference: LegalReference): Promise<ResolvedReference | null>;
  providerFor(jurisdiction: ReferenceJurisdictionId): LegalProvider | undefined;
}

/**
 * Reihenfolge der Provider ist Priorität: der erste Provider, der eine Jurisdiktion bedient,
 * gewinnt. So kann der ContentProvider für `ost` vor den OstRecht-Provider gestellt werden,
 * sobald ostdeutsche Normen intern vorliegen.
 */
export function createReferenceResolver(providers: readonly LegalProvider[]): ReferenceResolver {
  const table = new Map<ReferenceJurisdictionId, LegalProvider>();
  for (const provider of providers) {
    for (const jurisdiction of provider.jurisdictions) {
      if (!table.has(jurisdiction)) table.set(jurisdiction, provider);
    }
  }
  return {
    providerFor(jurisdiction) {
      return table.get(jurisdiction);
    },
    async resolve(reference) {
      const provider = table.get(reference.jurisdiction);
      if (!provider) return null;
      return provider.resolveReference(reference);
    },
  };
}
