/**
 * Ablageorte der Simulationsrechtsfortschreibung.
 *
 * Das Originalarchiv (`imports/`) wird nie verändert; Arbeitskopien, Textauszüge und Metadaten liegen im
 * gitignorierten Cache. Versioniert sind nur die abgeleiteten Fachdaten unter `data/simulation/`.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

/** Vom Nutzer zusammengestellte Sim-Rechtsquellensammlung (untracked, unverändert). */
export const ARCHIVE_DIR = 'imports';

/** Gitignorierter Arbeitsbereich: Kopien nach SHA-256, Textauszüge, Extraktionsmetadaten. */
export const CACHE_DIR = '.cache/simulation';
export const CACHE_ARCHIVE_DIR = `${CACHE_DIR}/archive`;
export const CACHE_TEXT_DIR = `${CACHE_DIR}/text`;

/** Versioniertes Inventar (maschinenlesbar) und sein Bericht. */
export const SIMULATION_DATA_DIR = 'data/simulation';
export const INVENTORY_PATH = `${SIMULATION_DATA_DIR}/source-inventory.json`;
export const INVENTORY_DOC_PATH = 'docs/SIM_SOURCE_INVENTORY.md';

/** Archivordner → heutige Jurisdiktion (Kandidat; die fachliche Zuordnung entscheidet die Evidenzprüfung). */
export const ARCHIVE_FOLDERS: Readonly<Record<string, JurisdictionId>> = {
  west: 'west',
  nsh: 'nsh',
  'baywü': 'baywue',
  baywue: 'baywue',
};

/** Einträge, die im Archiv keine Quelle sind. */
export const IGNORED_ARCHIVE_ENTRIES = new Set(['.DS_Store', 'Thumbs.db']);
export const IGNORED_ARCHIVE_DIRECTORIES = new Set(['__MACOSX']);
/**
 * Archivordner, die keine Sim-Rechtsquellen eines Landes enthalten und nie inventarisiert werden: `bund/` trägt das
 * Material der Bundesportal-Discovery (schema.sql, style.css; docs/BUNDESRECHT_COMPATIBILITY.md), keine Sim-Quelle.
 */
export const NON_SIMULATION_ARCHIVE_FOLDERS = new Set(['bund']);
/** Der Container des Archivs (Archiv.zip) wird nur mit dem Ordnerinhalt abgeglichen, nicht selbst inventarisiert. */
export const ARCHIVE_CONTAINER = 'Archiv.zip';
