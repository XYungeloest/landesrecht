/**
 * Importer für BAYERN.RECHT (Bayern → Freistaat Bayern-Württemberg).
 *
 * Der Quellparser steht (`src/parse/`, docs/BAYERN_PARSER.md): zwei DTD-Frontends (`byrecht-norm`
 * und `byrecht-vv`) auf einem gemeinsamen Zielmodell. Er liefert echtes Recht des Freistaates Bayern
 * (SourceLaw); erst die Transformation (`src/transform/`, docs/BAYERN_TRANSFORMATION.md) macht daraus
 * Recht der Simulationsjurisdiktion „Freistaat Bayern-Württemberg“. Kein Scraping ganzer
 * Rechtsportale ohne ausdrücklichen Auftrag; Rohquellen werden unverändert archiviert
 * (docs/IMPORT_ARCHITECTURE.md).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import type { ImportFinding, JurisdictionTransformer, SourceLaw, SourceParser, SourcePortal, TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';

import { createBayernRechtParser, type BayernRechtParseOptions } from './parse/index.ts';
import { auditRecord } from './transform/audit-record.ts';
import { transformToBayWue } from './transform/transform.ts';

export const PORTAL: SourcePortal = 'bayernrecht';
export const TARGET_JURISDICTION: JurisdictionId = 'baywue';
export const SOURCE_LABEL = 'BAYERN.RECHT';

export function createParser(options: BayernRechtParseOptions = {}): SourceParser {
  return createBayernRechtParser(options);
}

/** Umgesetzt und getestet: Überleitung Bayern → Freistaat Bayern-Württemberg. */
export function createTransformer(): JurisdictionTransformer {
  return {
    targetJurisdiction: TARGET_JURISDICTION,
    async transform(law: SourceLaw, context: TransformContext): Promise<NormRecord> {
      return transformToBayWue(law, context).record;
    },
    audit(record: NormRecord): ImportFinding[] {
      return auditRecord(record);
    },
  };
}
