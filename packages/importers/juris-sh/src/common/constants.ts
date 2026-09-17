/**
 * Konstanten des Importers juris Schleswig-Holstein → Land Niedersachsen-Holstein (`nsh`).
 *
 * Trennung wie bei RECHT.NRW/West: `SOURCE_SYSTEM` und `SOURCE_STATE` benennen die reale Quelle
 * (Provenienz, nie transformiert), `TARGET_JURISDICTION` die Simulationsjurisdiktion. Pfade und
 * R2-Präfixe folgen dem bestehenden Schema `<jurisdiktion>/<portal>/<stichtag>/…` – daher `juris-sh`
 * (Portalkennung des Projekts, siehe `SourcePortal` in @landesrecht/importer-common) statt
 * „schleswig-holstein“.
 */
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

/** Portalkennung des Projekts (Verzeichnisse unter data/, R2-Präfix, Manifestfeld). */
export const SOURCE_SYSTEM = 'juris-sh' as const;
/** Reales Quellland; erscheint in Provenienz und Fundstellen, nie im transformierten Normtext. */
export const SOURCE_STATE = 'Schleswig-Holstein' as const;
/** Simulationsjurisdiktion des Ausgangsbestands. */
export const TARGET_JURISDICTION: JurisdictionId = 'nsh';
/** Stichtag des Ausgangsrechtsstands (identisch für alle Länder). */
export const BASELINE_DATE = SIMULATION_BASELINE_DATE;

/**
 * Parserversion des Adapters. Jede Änderung, die die Parserausgabe für bereits übernommene Normen
 * verändern kann, erhöht die Version; der Bulk-Runner erkennt ältere Einträge dann als veraltet
 * (`--regenerate-stale`) – für alle Status, nicht nur für übernommene.
 */
export const PARSER_VERSION = 'juris-sh-parser/1.0.0';

/** Quellbereiche des Adapters: konsolidiertes Landesrecht, Verwaltungsvorschriften, Verkündungsereignisse. */
export const SOURCE_AREAS = ['landesrecht', 'vwv', 'events'] as const;
export type SourceArea = (typeof SOURCE_AREAS)[number];

/** Verzeichnisse des Adapterzustands (git-versioniert, außer Cache und Staging). */
export const IMPORT_DATA_DIR = `data/imports/${SOURCE_SYSTEM}`;
export const AUDIT_DIR = `data/audits/${SOURCE_SYSTEM}`;
/** Rohquellen-Cache (nicht versioniert). */
export const CACHE_DIR = `.cache/${SOURCE_SYSTEM}`;
/** R2-Objektpräfix; kollidiert nicht mit `west/recht-nrw/…`. */
export const R2_PREFIX = `${TARGET_JURISDICTION}/${SOURCE_SYSTEM}/${BASELINE_DATE}`;

/**
 * Behandlung einer erkannten Institutionsbezeichnung. Steht hier und nicht in der
 * Institutionen-Zuordnung, weil sowohl die Zuordnung (`transform/institution-registry.ts`)
 * als auch die Overrides (`common/overrides.ts`) dagegen prüfen; zwei getrennte Listen
 * könnten auseinanderlaufen und eine Zuordnung zulassen, die die andere Seite ablehnt.
 */
export const INSTITUTION_STATUSES = ['preserve', 'safe-transform', 'map', 'review', 'historical-source-only'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];
