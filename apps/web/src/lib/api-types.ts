/**
 * SimRecht-Kompatibilitätsschicht: explizite, versionierte Antworttypen der öffentlichen API.
 * Schemaversion 1.0 – Änderungen an Feldern erfordern eine neue Schemaversion.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { NormHistory, NormMeta, NormStatus, NormType, NormVersion } from '@landesrecht/legal-core/lib/schema.ts';
import type { SearchHit } from '@landesrecht/search/ranking.ts';

export const SIMRECHT_SCHEMA_VERSION = '1.0';
export const SIMRECHT_SERVICE = 'landesrecht';

export interface SimRechtDeclaration {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  service: typeof SIMRECHT_SERVICE;
  jurisdictions: JurisdictionId[];
  baselineDate: string;
  referenceDate: string;
  api: string;
  endpoints: {
    jurisdictions: string;
    norm: string;
    versions: string;
    search: string;
  };
}

export interface ApiJurisdiction {
  id: JurisdictionId;
  name: string;
  shortName: string;
  pathSegment: string;
  baselineDate: string;
  url: string;
  normCount: number;
  externalSourceOfTruth?: { system: string; label: string; siteUrl: string };
}

export interface ApiJurisdictionsResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  jurisdictions: ApiJurisdiction[];
}

export interface ApiNormResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  referenceDate: string;
  jurisdiction: JurisdictionId;
  url: string;
  meta: NormMeta;
  history: NormHistory;
  currentVersionId: string;
  /** Die am Stichtag geltende Fassung einschließlich Normkörper. */
  version: NormVersion;
}

export interface ApiVersionDescriptor {
  versionId: string;
  simulationValidFrom: string;
  simulationValidTo: string | null;
  sourceValidFrom?: string;
  sourceValidTo?: string;
  temporalKind: 'current' | 'future' | 'historical' | 'unknown-effective';
  citation: string;
  changeNote: string;
  url: string;
}

export interface ApiVersionsResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  jurisdiction: JurisdictionId;
  slug: string;
  currentVersionId: string;
  versions: ApiVersionDescriptor[];
}

export interface ApiSearchResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  referenceDate: string;
  query: {
    q: string;
    jurisdictions: JurisdictionId[];
    types: NormType[];
    statuses: NormStatus[];
    versionScope: string;
    validOn?: string;
    sort: string;
  };
  total: number;
  offset: number;
  limit: number;
  hits: Array<Omit<SearchHit, 'rank'>>;
}

export interface ApiError {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  error: string;
  status: number;
}
