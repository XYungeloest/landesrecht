import { describe, expect, it } from 'vitest';

import { SIMULATION_BASELINE_DATE } from '@landesrecht/legal-core/config/jurisdictions.ts';

import { SIMRECHT_SCHEMA_VERSION } from '../../apps/web/src/lib/api-types.ts';
import { resolveApiJurisdiction } from '../../apps/web/src/lib/api-jurisdiction.ts';
import { buildSimRechtDeclaration } from '../../apps/web/src/lib/simrecht.ts';

describe('SimRecht-Kompatibilitätsschicht', () => {
  it('deklariert Dienst, Jurisdiktionen, Stichtag und API versioniert', () => {
    const declaration = buildSimRechtDeclaration();
    expect(declaration).toMatchObject({
      schemaVersion: '1.0',
      service: 'landesrecht',
      jurisdictions: ['west', 'nsh', 'ost', 'baywue'],
      baselineDate: SIMULATION_BASELINE_DATE,
      api: '/api/v1',
    });
    expect(declaration.endpoints).toEqual({
      jurisdictions: '/api/v1/jurisdictions',
      norm: '/api/v1/norms/{jurisdiction}/{slug}',
      versions: '/api/v1/norms/{jurisdiction}/{slug}/versions',
      search: '/api/v1/search',
    });
    expect(SIMRECHT_SCHEMA_VERSION).toBe('1.0');
  });

  it('akzeptiert interne IDs und öffentliche Segmente', () => {
    expect(resolveApiJurisdiction('baywue')).toBe('baywue');
    expect(resolveApiJurisdiction('bayern-wuerttemberg')).toBe('baywue');
    expect(resolveApiJurisdiction('bund')).toBeUndefined();
  });
});
