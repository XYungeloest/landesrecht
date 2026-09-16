/**
 * Konstanten des RECHT.NRW-Importers. Die Quellrechtsordnung ist Nordrhein-Westfalen, das
 * Ziel ist das Land Westdeutschland (`west`). Alle Bezeichnungen der Simulation kommen aus dem
 * Jurisdiktionsregister; hier stehen nur Quellsystem-Angaben.
 */
import { JURISDICTIONS, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';

export const SOURCE_SYSTEM = 'recht-nrw' as const;
export const SOURCE_STATE_NAME = 'Nordrhein-Westfalen';
export const TARGET_JURISDICTION: JurisdictionId = 'west';
export const BASE_URL = 'https://recht.nrw.de';
export const USER_AGENT = 'landesrecht-portal-importer/0.1 (+https://gitlab.com/politiksim/landesrecht; Politiksimulation, schonender Einzelabruf)';
/** Version des Parsers; wird in Manifest und Quellenreferenzen festgehalten. */
/** 1.1.0: Legacy-Fußnotenanker in gemischter Schreibung, Hülltabellen, Zeilen mit fehlenden Zellen, römische Artikel, präsentationale Legacy-Wrapper, Zählbereiche für §§ in Artikeln/Anlagen, Inhaltsübersichten als Text. */
export const PARSER_VERSION = 'recht-nrw-parser/1.1.0';

/** Dokumentarten des Bereichs LRGV (Landesrecht Gesetze und Verordnungen), die importiert werden. */
export const LRGV_IMPORTABLE_TYPES = ['gesetz', 'rechtsverordnung'] as const;
export type LrgvDocumentType = (typeof LRGV_IMPORTABLE_TYPES)[number];

/** Alle URL-Segmente des Bereichs LRGV; Verwaltungsvorschriften und Bekanntmachungen werden nicht importiert. */
export const LRGV_ALL_TYPES = ['gesetz', 'rechtsverordnung', 'verwaltungsvorschrift', 'bekanntmachung'] as const;

export const TARGET_SHORT_NAME = JURISDICTIONS[TARGET_JURISDICTION].shortName;
export const TARGET_STATE_NAME = JURISDICTIONS[TARGET_JURISDICTION].name;
