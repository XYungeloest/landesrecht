/**
 * Importer für juris Schleswig-Holstein (Schleswig-Holstein → Land Niedersachsen-Holstein).
 *
 * Stand der Umsetzung:
 * - **Transformation, Zustandsschicht, Ereignisregister, Zugriffspolitik, Enumeration (Sitemap, Fixpunkt,
 *   Stichprobenabgleich), Adressierbarkeitsprobe und Berichte sind umgesetzt** und werden hier ausgeleitet.
 * - robots.txt ist für diesen Adapter `advisory` (Nutzerentscheidung 2026-09-18, `access/policy.ts`).
 * - **Parser und Bulk des konsolidierten Landesrechts sind nicht umgesetzt**: Die dokumentierten öffentlichen
 *   Adressformen liefern für jedes Dokument nur die leere Startseite der Portaloberfläche; der Inhalt kommt
 *   ausschließlich über eine interne, sitzungsgebundene Schnittstelle (`/jportal/wsrest/recherche3/`), die nach
 *   der Zugriffspolitik nicht benutzt wird (`docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md`). Ohne abrufbaren
 *   Normtext entsteht kein Parser und kein Normtext.
 *
 * Ein Parser liefert echtes Recht des Landes Schleswig-Holstein (SourceLaw); erst die Transformation
 * macht daraus Recht der Simulationsjurisdiktion „Land Niedersachsen-Holstein“. Rohquellen werden
 * unverändert archiviert (docs/IMPORT_ARCHITECTURE.md).
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { ImportPipelineError, type ArchivedSource, type ImportFinding, type JurisdictionTransformer, type SourceLaw, type SourceParser, type SourcePortal, type TransformContext } from '@landesrecht/importer-common/pipeline.ts';
import type { NormRecord } from '@landesrecht/legal-core/lib/schema.ts';
import { auditRecord } from './transform/audit-record.ts';
import { transformToNsh } from './transform/transform.ts';

export * from './common/constants.ts';
export * from './common/paths.ts';
export * from './common/manifest.ts';
export * from './common/evidence.ts';
export * from './common/review.ts';
export * from './common/environment.ts';
export * from './common/slug-registry.ts';
export * from './common/overrides.ts';
export * from './common/unresolved.ts';
export * from './common/fetcher.ts';
export * from './access/policy.ts';
export * from './enumerate/sitemap.ts';
export * from './enumerate/enumeration.ts';
export * from './transform/rules.ts';
export * from './transform/detection.ts';
export * from './transform/organs.ts';
export * from './transform/institution-registry.ts';
export * from './transform/transform.ts';
export * from './transform/audit-record.ts';
export * from './events/ledger.ts';

export const PORTAL: SourcePortal = 'juris-sh';
export const TARGET_JURISDICTION: JurisdictionId = 'nsh';
export const SOURCE_LABEL = 'juris Schleswig-Holstein';

/**
 * Nicht umgesetzt: Die dokumentierten Adressformen des Portals liefern keinen Normtext (nur die leere
 * Oberflächenseite). `detect` meldet deshalb für jede Quelle `false` – ein Aufruf von `parse` ist ein
 * Programmierfehler, kein erwarteter Pfad.
 */
export function createParser(): SourceParser {
  return {
    portal: PORTAL,
    detect(_source: ArchivedSource, _content: string): boolean {
      return false;
    },
    async parse(): Promise<SourceLaw> {
      throw new ImportPipelineError(
        'parse-source-format',
        'Für juris Schleswig-Holstein existiert kein Parser: Die dokumentierten öffentlichen Adressformen liefern keinen Normtext, der Inhalt kommt nur über eine interne, sitzungsgebundene Schnittstelle, die nicht benutzt wird; siehe docs/SCHLESWIG_HOLSTEIN_ACCESS_CONSTRAINT.md.',
      );
    },
  };
}

/** Umgesetzt und getestet: Überleitung Schleswig-Holstein → Land Niedersachsen-Holstein. */
export function createTransformer(): JurisdictionTransformer {
  return {
    targetJurisdiction: TARGET_JURISDICTION,
    async transform(law: SourceLaw, context: TransformContext): Promise<NormRecord> {
      return transformToNsh(law, context).record;
    },
    audit(record: NormRecord): ImportFinding[] {
      return auditRecord(record);
    },
  };
}
