/**
 * Konstanten des Importers BAYERN.RECHT → Freistaat Bayern-Württemberg (`baywue`).
 *
 * Aufbau wie bei den Adaptern RECHT.NRW/West und juris-SH/NSH: `SOURCE_SYSTEM`/`SOURCE_STATE` benennen
 * die reale Quelle (Provenienz, nie transformiert), `TARGET_JURISDICTION` die Simulationsjurisdiktion.
 * Pfade und R2-Präfixe folgen dem Schema `<jurisdiktion>/<portal>/<stichtag>/…`.
 */
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

/** Portalkennung des Projekts (Verzeichnisse unter data/, R2-Präfix, Manifestfeld). */
export const SOURCE_SYSTEM = 'bayernrecht' as const;
/** Reales Quellland; erscheint in Provenienz und Fundstellen, nie im transformierten Normtext. */
export const SOURCE_STATE = 'Bayern' as const;
/** Simulationsjurisdiktion des Ausgangsbestands. */
export const TARGET_JURISDICTION: JurisdictionId = 'baywue';
/** Stichtag des Ausgangsrechtsstands (identisch für alle Länder). */
export const BASELINE_DATE = SIMULATION_BASELINE_DATE;

/**
 * Parserversion des Adapters; jede Änderung, die die Parserausgabe für bereits übernommene Normen
 * verändern kann, erhöht die Version (Staleness-Erkennung des Bulk-Runners für alle Status).
 */
export const PARSER_VERSION = 'bayernrecht-parser/0.1.0';

/** Quellbereiche: konsolidiertes Landesrecht, Verwaltungsvorschriften, Verkündungsereignisse. */
export const SOURCE_AREAS = ['landesrecht', 'vwv', 'events'] as const;
export type SourceArea = (typeof SOURCE_AREAS)[number];

export const IMPORT_DATA_DIR = `data/imports/${SOURCE_SYSTEM}`;
export const AUDIT_DIR = `data/audits/${SOURCE_SYSTEM}`;
/** Rohquellen-Cache (nicht versioniert). */
export const CACHE_DIR = `.cache/${SOURCE_SYSTEM}`;
/** R2-Objektpräfix; kollidiert nicht mit `west/recht-nrw/…` oder `nsh/juris-sh/…`. */
export const R2_PREFIX = `${TARGET_JURISDICTION}/${SOURCE_SYSTEM}/${BASELINE_DATE}`;

/**
 * Auswertungsstichtag für Berichte, die den Bestand gegen „heute“ halten (Scope, Coverage,
 * Ereignisregister). **Eine Konstante, kein Tagesdatum:** Nur so erzeugt ein Wiederholungslauf
 * denselben Bericht, und nur so lässt sich ein Unterschied als Befund lesen statt als Kalender.
 * Wird sie erhöht, wandern abgelaufene Befristungen von „künftig“ zu „eingetreten“.
 */
export const EVALUATION_DATE = '2026-09-18' as const;
