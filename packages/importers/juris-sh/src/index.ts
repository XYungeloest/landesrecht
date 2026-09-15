/**
 * Importer-Platzhalter für juris Schleswig-Holstein (Schleswig-Holstein → Land Niedersachsen-Holstein).
 *
 * Noch nicht implementiert: Fetch, Parser und Transformation. Die Schnittstellen aus
 * @landesrecht/importer-common sind verbindlich; ein Parser liefert zunächst echtes Recht
 * des Landes Schleswig-Holstein (SourceLaw), erst die Transformation macht daraus Recht der
 * Simulationsjurisdiktion „Land Niedersachsen-Holstein“. Kein Scraping ganzer Rechtsportale ohne
 * ausdrücklichen Auftrag; Rohquellen werden unverändert archiviert (docs/IMPORT_ARCHITECTURE.md).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { ImportPipelineError, type ArchivedSource, type JurisdictionTransformer, type SourceLaw, type SourceParser, type SourcePortal, type TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

export const PORTAL: SourcePortal = 'juris-sh';
export const TARGET_JURISDICTION: JurisdictionId = 'nsh';
export const SOURCE_LABEL = 'juris Schleswig-Holstein';

export function createParser(): SourceParser {
  return {
    portal: PORTAL,
    detect(_source: ArchivedSource, _content: string): boolean {
      return false;
    },
    async parse(): Promise<SourceLaw> {
      throw new ImportPipelineError('parse-source-format', `Der Parser für juris Schleswig-Holstein ist noch nicht implementiert.`);
    },
  };
}

export function createTransformer(): JurisdictionTransformer {
  return {
    targetJurisdiction: TARGET_JURISDICTION,
    async transform(_law: SourceLaw, _context: TransformContext): Promise<NormRecord> {
      throw new ImportPipelineError('transform-into-simulation-jurisdiction', `Die Transformation Schleswig-Holstein → Land Niedersachsen-Holstein ist noch nicht implementiert.`);
    },
    audit() {
      return [];
    },
  };
}
