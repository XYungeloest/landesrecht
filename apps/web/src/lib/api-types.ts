/**
 * SimRecht-Kompatibilitätsschicht: explizite, versionierte Antworttypen der öffentlichen API.
 * Schemaversion 1.0 – Änderungen an Feldern erfordern eine neue Schemaversion.
 */
import type { JurisdictionStatusSummary } from '@landesrecht/legal-core/config/inventory-status.ts';
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { SimulationChangeKind } from '@landesrecht/legal-core/lib/simulation-change.ts';
import type { JurisdictionAvailability } from '@landesrecht/runtime/registry.ts';
import type { NormHistory, NormMeta, NormStatus, NormType, NormVersion, Publication, PublicationEntry } from '@landesrecht/legal-core/lib/schema.ts';
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
  /** Laufzeitquelle des Bestands: eigene Projektion oder OstRecht-D1 (nur Ost). */
  runtimeSource: 'landesrecht-d1' | 'ostrecht-d1';
  /** Vorgelagertes Quellsystem, das den Bestand führt (nur Ost: OstRecht). */
  upstreamSourceOfTruth?: { system: string; label: string; siteUrl: string };
  /** Bisheriges Rechtsportal (Legacy-Adressen als Verweis), z. B. OstRecht für Ost. */
  legacySource?: { system: string; label: string; siteUrl: string };
  /** Suchabdeckung des Bestands (Volltextindex je Fassung, fehlende geltende Fassungen); fehlt nur bei lokal nicht verfügbarer Jurisdiktion. */
  search?: Omit<ApiSearchCoverage, 'jurisdiction'>;
  /** Nur Entwicklung: `unavailable-local` (kein Bestand, Anfragen → 503) oder `fixture` (lokaler Teilbestand, development only). */
  availability?: JurisdictionAvailability;
  /** Diagnose der Laufzeitquelle (nur `ostrecht-d1`): Sync-Zustand und Identität der vorgelagerten Projektion. */
  runtime?: { syncState: string | null; syncedAt: string | null; upstreamCorpusHash: string | null; projectionFingerprint: string | null };
  /**
   * Baseline- und Sim-Quellenstatus (West, NSH, BayWü; fehlt für Ost). Getrennte Ebenen: `gazetteCoverage.status =
   * COMPLETE` kann neben `simulationStatus = PARTIAL` stehen (docs/SIMULATION_IMPORT.md, Abschnitt 7.2).
   */
  status?: JurisdictionStatusSummary;
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
  /** Klassifikation gegenüber dem Ausgangsrechtsstand (additiv seit Lauf 25). */
  simulationChangeKind?: SimulationChangeKind;
  lastSimulationChangeDate?: string | null;
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
  /**
   * Suchabdeckung je durchsuchter Jurisdiktion: `fullText` sagt, ob frühere Fassungen volltextindexiert sind
   * (`all-versions`) oder nur die geltende (`current-version-only`; Fassungsnavigation bleibt vollständig);
   * `readiness: partial`, wenn einzelnen geltenden Fassungen der Volltextindex fehlt.
   */
  coverage: ApiSearchCoverage[];
  /** Nur Entwicklung: lokal nicht verfügbare Jurisdiktionen, die im Ergebnis fehlen. */
  unavailable?: Array<{ jurisdiction: JurisdictionId } & JurisdictionAvailability>;
}

export interface ApiSearchCoverage {
  jurisdiction: JurisdictionId;
  readiness: 'ready' | 'partial';
  fullText: 'all-versions' | 'current-version-only';
  historicalVersions: 'navigable';
  staleNormCount: number;
}

/** Verkündungsblatt-Ausgabe in der Übersicht (ohne Einträge und Belege; diese liefert `ApiPublicationResponse`). */
export interface ApiPublicationSummary {
  slug: string;
  title: string;
  /** Kurzzitat, z. B. „GV. West 2026 Nr. 2“. */
  label: string;
  /** Blattkürzel wie gedruckt bzw. historisch. */
  gazette: string;
  seriesTitle?: string;
  year: number;
  issue: string;
  date: string;
  entryCount: number;
  url: string;
  apiUrl: string;
}

export interface ApiPublicationsResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  jurisdiction: JurisdictionId;
  url: string;
  publications: ApiPublicationSummary[];
}

export interface ApiPublicationEntry extends PublicationEntry {
  /** Adresse der verkündeten Norm bzw. der entstandenen Fassung im Portal; fehlt ohne veröffentlichte Portalnorm. */
  normUrl?: string;
  versionUrl?: string;
}

export interface ApiPublicationResponse {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  generatedAt: string;
  jurisdiction: JurisdictionId;
  url: string;
  label: string;
  /** Die vollständige Ausgabe einschließlich Quellenbelegen (SHA-256, Objektschlüssel); keine Bilddaten. */
  publication: Publication;
  entries: ApiPublicationEntry[];
}

export interface ApiError {
  schemaVersion: typeof SIMRECHT_SCHEMA_VERSION;
  error: string;
  status: number;
}
