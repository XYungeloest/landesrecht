/**
 * Importer-Platzhalter für RECHT.NRW (Nordrhein-Westfalen → Land Westdeutschland).
 *
 * Noch nicht implementiert: Fetch, Parser und Transformation. Die Schnittstellen aus
 * @landesrecht/importer-common sind verbindlich; ein Parser liefert zunächst echtes Recht
 * des Landes Nordrhein-Westfalen (SourceLaw), erst die Transformation macht daraus Recht der
 * Simulationsjurisdiktion „Land Westdeutschland“. Kein Scraping ganzer Rechtsportale ohne
 * ausdrücklichen Auftrag; Rohquellen werden unverändert archiviert (docs/IMPORT_ARCHITECTURE.md).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { ImportPipelineError, type ArchivedSource, type JurisdictionTransformer, type SourceLaw, type SourceParser, type SourcePortal, type TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

export const PORTAL: SourcePortal = 'recht-nrw';
export const TARGET_JURISDICTION: JurisdictionId = 'west';
export const SOURCE_LABEL = 'RECHT.NRW';

export function createParser(): SourceParser {
  return {
    portal: PORTAL,
    detect(_source: ArchivedSource, _content: string): boolean {
      return false;
    },
    async parse(): Promise<SourceLaw> {
      throw new ImportPipelineError('parse-source-format', `Der Parser für RECHT.NRW ist noch nicht implementiert.`);
    },
  };
}

export function createTransformer(): JurisdictionTransformer {
  return {
    targetJurisdiction: TARGET_JURISDICTION,
    async transform(_law: SourceLaw, _context: TransformContext): Promise<NormRecord> {
      throw new ImportPipelineError('transform-into-simulation-jurisdiction', `Die Transformation Nordrhein-Westfalen → Land Westdeutschland ist noch nicht implementiert.`);
    },
    audit() {
      return [];
    },
  };
}
