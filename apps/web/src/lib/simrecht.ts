/** SimRecht-Deklaration (/.well-known/simrecht.json): Version, Dienst, Jurisdiktionen, Stichtage, API. */
import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { JURISDICTION_IDS, SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getApiJurisdictionsUrl, getApiSearchUrl, PORTAL_PATHS } from '@landesrecht/legal-core/lib/routes.ts';

import { SIMRECHT_SCHEMA_VERSION, SIMRECHT_SERVICE, type SimRechtDeclaration } from './api-types.ts';

export function buildSimRechtDeclaration(): SimRechtDeclaration {
  return {
    schemaVersion: SIMRECHT_SCHEMA_VERSION,
    service: SIMRECHT_SERVICE,
    jurisdictions: [...JURISDICTION_IDS],
    baselineDate: SIMULATION_BASELINE_DATE,
    referenceDate: EDITORIAL_REFERENCE_DATE,
    api: PORTAL_PATHS.api,
    endpoints: {
      jurisdictions: getApiJurisdictionsUrl(),
      norm: `${PORTAL_PATHS.api}/norms/{jurisdiction}/{slug}`,
      versions: `${PORTAL_PATHS.api}/norms/{jurisdiction}/{slug}/versions`,
      search: getApiSearchUrl(),
    },
  };
}
