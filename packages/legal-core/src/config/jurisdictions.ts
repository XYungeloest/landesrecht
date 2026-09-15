/**
 * Kanonisches Jurisdiktionsregister des Landesrechtsportals.
 *
 * Dies ist die einzige Stelle, an der die vier Länder der Simulation, ihre öffentlichen
 * Bezeichnungen, ihre URL-Segmente und der gemeinsame Ausgangsrechtsstand definiert sind.
 * Komponenten, Routen, Skripte und Importer lesen ausschließlich von hier; nirgends sonst
 * dürfen Länderbezeichnungen oder der Stichtag als String-Literal stehen.
 */

/** Verbindlicher Ausgangsrechtsstand aller vier Länder (ISO-Datum). */
export const SIMULATION_BASELINE_DATE = '2023-12-01' as const;

/** Stabile maschinenlesbare Jurisdiktions-IDs (interne Kennungen, Verzeichnisnamen, D1-Spalte). */
export const JURISDICTION_IDS = ['west', 'nsh', 'ost', 'baywue'] as const;
export type JurisdictionId = (typeof JURISDICTION_IDS)[number];

/** Kennung des Bundes für Rechtsverweise; kein Landesbestand dieses Portals. */
export const FEDERAL_JURISDICTION_ID = 'bund' as const;
export type FederalJurisdictionId = typeof FEDERAL_JURISDICTION_ID;
export type ReferenceJurisdictionId = JurisdictionId | FederalJurisdictionId;

export interface Jurisdiction {
  id: JurisdictionId;
  /** Öffentliche vollständige Bezeichnung, z. B. „Land Westdeutschland“. */
  name: string;
  /** Öffentliche Kurzbezeichnung, z. B. „West“. */
  shortName: string;
  /** Staatsform als Präfix des Namens: „Land“ oder „Freistaat“. */
  stateForm: 'Land' | 'Freistaat';
  /** Öffentliches URL-Segment, z. B. `bayern-wuerttemberg`. */
  pathSegment: string;
  /** Ausgangsrechtsstand der Simulation (identisch für alle Länder). */
  baselineDate: typeof SIMULATION_BASELINE_DATE;
  /**
   * Reale Quellrechtsordnung, aus der der Ausgangsbestand übernommen wird. Reine
   * Provenienzinformation für Importer und Dokumentation, kein Bestandteil des Normtexts.
   */
  sourceSystem: {
    /** Bezeichnung des realen Bundeslandes. */
    realWorldState: string;
    /** Kennung des amtlichen Portals (siehe packages/importers). */
    portal: 'recht-nrw' | 'juris-sh' | 'revosax' | 'bayernrecht';
    portalLabel: string;
  };
  /**
   * Externer Rechtsbestand, der zunächst fachlicher Source of Truth bleibt (nur Ost: OstRecht).
   * Fehlt das Feld, pflegt dieses Repository den Bestand selbst.
   */
  externalSourceOfTruth?: {
    system: 'ostrecht';
    label: string;
    siteUrl: string;
  };
  /** Amtliches Verkündungsblatt (Fundstellenkürzel) für Zitate im Simulationsbestand. */
  gazette: {
    abbreviation: string;
    title: string;
  };
}

export const JURISDICTIONS: Readonly<Record<JurisdictionId, Jurisdiction>> = {
  west: {
    id: 'west',
    name: 'Land Westdeutschland',
    shortName: 'West',
    stateForm: 'Land',
    pathSegment: 'west',
    baselineDate: SIMULATION_BASELINE_DATE,
    sourceSystem: { realWorldState: 'Nordrhein-Westfalen', portal: 'recht-nrw', portalLabel: 'RECHT.NRW' },
    gazette: { abbreviation: 'GV. West', title: 'Gesetz- und Verordnungsblatt für das Land Westdeutschland' },
  },
  nsh: {
    id: 'nsh',
    name: 'Land Niedersachsen-Holstein',
    shortName: 'NSH',
    stateForm: 'Land',
    pathSegment: 'nsh',
    baselineDate: SIMULATION_BASELINE_DATE,
    sourceSystem: { realWorldState: 'Schleswig-Holstein', portal: 'juris-sh', portalLabel: 'Landesvorschriften und Landesrechtsprechung Schleswig-Holstein (juris)' },
    gazette: { abbreviation: 'GVOBl. NSH', title: 'Gesetz- und Verordnungsblatt für Niedersachsen-Holstein' },
  },
  ost: {
    id: 'ost',
    name: 'Freistaat Ostdeutschland',
    shortName: 'Ost',
    stateForm: 'Freistaat',
    pathSegment: 'ost',
    baselineDate: SIMULATION_BASELINE_DATE,
    sourceSystem: { realWorldState: 'Sachsen', portal: 'revosax', portalLabel: 'REVOSax' },
    externalSourceOfTruth: {
      system: 'ostrecht',
      label: 'OstRecht',
      siteUrl: 'https://recht.freistaat-ostdeutschland.de',
    },
    gazette: { abbreviation: 'OGVBl.', title: 'Ostdeutsches Gesetz- und Verordnungsblatt' },
  },
  baywue: {
    id: 'baywue',
    name: 'Freistaat Bayern-Württemberg',
    shortName: 'BayWü',
    stateForm: 'Freistaat',
    pathSegment: 'bayern-wuerttemberg',
    baselineDate: SIMULATION_BASELINE_DATE,
    sourceSystem: { realWorldState: 'Bayern', portal: 'bayernrecht', portalLabel: 'BAYERN.RECHT' },
    gazette: { abbreviation: 'GVBl. BayWü', title: 'Gesetz- und Verordnungsblatt des Freistaates Bayern-Württemberg' },
  },
};

/** Alle Jurisdiktionen in stabiler Anzeigereihenfolge. */
export const JURISDICTION_LIST: readonly Jurisdiction[] = JURISDICTION_IDS.map((id) => JURISDICTIONS[id]);

export function isJurisdictionId(value: unknown): value is JurisdictionId {
  return typeof value === 'string' && (JURISDICTION_IDS as readonly string[]).includes(value);
}

export function getJurisdiction(id: JurisdictionId): Jurisdiction {
  return JURISDICTIONS[id];
}

/** Auflösung eines öffentlichen URL-Segments (`bayern-wuerttemberg`) zur Jurisdiktion. */
export function getJurisdictionByPathSegment(segment: string): Jurisdiction | undefined {
  return JURISDICTION_LIST.find((jurisdiction) => jurisdiction.pathSegment === segment);
}

/** Auflösung einer Kurzbezeichnung („BayWü“, „west“) zur Jurisdiktion; Groß-/Kleinschreibung egal. */
export function getJurisdictionByShortName(value: string): Jurisdiction | undefined {
  const needle = value.trim().toLowerCase();
  return JURISDICTION_LIST.find(
    (jurisdiction) => jurisdiction.shortName.toLowerCase() === needle || jurisdiction.id === needle,
  );
}

/** Einheitlicher Hinweistext zum Ausgangsrechtsstand für Oberflächen. */
export function describeBaseline(jurisdiction: Jurisdiction): string {
  return `Ausgangsrechtsstand: ${formatBaselineDate(jurisdiction.baselineDate)}`;
}

export function formatBaselineDate(date: string = SIMULATION_BASELINE_DATE): string {
  const [year, month, day] = date.split('-').map(Number);
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${day}. ${months[(month ?? 1) - 1]} ${year}`;
}
