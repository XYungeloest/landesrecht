/**
 * Gemeinsame Importpipeline (noch ohne Scraper oder Bulkimport):
 *
 *   Fetch → Archive Raw Source → Parse Source Format → Normalize Source Law
 *     → Select Source Version at Baseline → Transform into Simulation Jurisdiction → Validate
 *     → Write Canonical JSON → Project to D1 → Audit
 *
 * Quellparser und Simulationstransformation sind getrennte Phasen: Ein RECHT.NRW-Parser
 * normalisiert zunächst echtes NRW-Recht (SourceLaw); erst die Transformation macht daraus
 * Recht des Landes Westdeutschland (NormRecord). Dasselbe gilt für Schleswig-Holstein → NSH,
 * Bayern → BayWü und Sachsen/OstRecht → Ost.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ExternalIdentifier, NormBodyBlock, NormRecord, NormType, SourceReference } from '@landesrecht/legal-core/lib/schema.ts';

export type SourcePortal = 'recht-nrw' | 'juris-sh' | 'bayernrecht' | 'revosax' | 'ostrecht';

/** Unveränderte Rohquelle, wie sie abgerufen wurde. */
export interface RawSource {
  portal: SourcePortal;
  url: string;
  retrievedAt: string;
  mediaType: string;
  body: Uint8Array;
  sha256: string;
}

/** Archivierte Rohquelle: R2-Objektschlüssel oder versionierter lokaler Pfad. */
export interface ArchivedSource extends Omit<RawSource, 'body'> {
  objectKey?: string;
  localSource?: string;
}

/** Ergebnis des Quellparsers: realer Rechtsstand des Herkunftslandes, noch nicht transformiert. */
export interface SourceLaw {
  portal: SourcePortal;
  externalIdentifiers: ExternalIdentifier[];
  title: string;
  shortTitle?: string;
  abbr?: string;
  type: NormType;
  /** Reale Quellgültigkeit der geparsten Fassung. */
  sourceValidFrom?: string;
  sourceValidTo?: string;
  documentDate?: string;
  citation: string;
  subjects: string[];
  keywords: string[];
  enactingBody?: string;
  body: NormBodyBlock[];
  sourceNotes?: Array<{ label: string; text: string }>;
  sourceReferences: SourceReference[];
  /** Roher Zusatzkontext des Parsers (Warnungen, Befunde). */
  findings: ImportFinding[];
  /** Stabile Quellidentität im Herkunftssystem (z. B. RECHT.NRW-Term-ID). */
  sourceIdentity?: string;
  /** Adresse der geparsten Fassung und – soweit vorhanden – der konsolidierten PDF. */
  sourceUrl?: string;
  pdfUrl?: string;
  /** Vollzitat und Änderungshistorie des Herkunftssystems (unverändert). */
  fullCitation?: string;
  changeHistory?: string;
}

export interface ImportFinding {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface TransformContext {
  targetJurisdiction: JurisdictionId;
  /** Ausgangsrechtsstand; die Ausgangsfassung beginnt an diesem Tag. */
  baselineDate: string;
  /** Slugvergabe muss über den Bestand hinweg eindeutig sein. */
  reserveSlug(candidate: string): string;
}

export interface SourceFetcher {
  readonly portal: SourcePortal;
  fetch(url: string): Promise<RawSource>;
}

export interface SourceArchive {
  archive(source: RawSource, jurisdiction: JurisdictionId): Promise<ArchivedSource>;
}

export interface SourceParser {
  readonly portal: SourcePortal;
  /** Prüft, ob die Rohquelle strukturell erkannt wird (fail-closed). */
  detect(source: ArchivedSource, content: string): boolean;
  parse(source: ArchivedSource, content: string): Promise<SourceLaw>;
}

/** Überführt reales Recht in das Recht der Simulationsjurisdiktion (Namen, Zitate, Organe). */
export interface JurisdictionTransformer {
  readonly targetJurisdiction: JurisdictionId;
  transform(law: SourceLaw, context: TransformContext): Promise<NormRecord>;
  /** Restpostenprüfung: Bezeichnungen des realen Landes dürfen im übergeleiteten Recht nicht verbleiben. */
  audit(record: NormRecord): ImportFinding[];
}

export interface CanonicalWriter {
  write(record: NormRecord): Promise<{ directory: string; files: string[] }>;
}

export interface ImportAuditEntry {
  jurisdiction: JurisdictionId;
  slug: string;
  portal: SourcePortal;
  externalIdentifiers: ExternalIdentifier[];
  outcome: 'created' | 'updated' | 'skipped' | 'failed';
  findings: ImportFinding[];
}

export interface ImportPipeline {
  fetcher: SourceFetcher;
  archive: SourceArchive;
  parser: SourceParser;
  transformer: JurisdictionTransformer;
  writer: CanonicalWriter;
}

export const PIPELINE_STAGES = [
  'fetch',
  'archive-raw-source',
  'parse-source-format',
  'normalize-source-law',
  'select-source-version-at-baseline',
  'transform-into-simulation-jurisdiction',
  'validate',
  'write-canonical-json',
  'project-to-d1',
  'audit',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export class ImportPipelineError extends Error {
  readonly stage: PipelineStage;

  constructor(stage: PipelineStage, message: string) {
    super(`[${stage}] ${message}`);
    this.name = 'ImportPipelineError';
    this.stage = stage;
  }
}

/**
 * Deterministischer Slug aus einer Bezeichnung (a-z, 0-9, Bindestrich). Importer nutzen
 * `TransformContext.reserveSlug`, um Kollisionen über den Bestand hinweg zu vermeiden.
 */
export function slugify(value: string): string {
  return value
    .replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/Ä/gu, 'Ae').replace(/Ö/gu, 'Oe').replace(/Ü/gu, 'Ue')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
