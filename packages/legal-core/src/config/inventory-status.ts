import status from './inventory-status.json' with { type: 'json' };
import { isJurisdictionId, SIMULATION_BASELINE_DATE, type JurisdictionId } from './jurisdictions.ts';

/**
 * Bestandsstand je Land: ob der Stichtagsbestand vollständig veröffentlicht ist und wie weit die
 * Simulationsrechtsfortschreibung belegt ist. Die Datei `inventory-status.json` wird von Werkzeugen erzeugt,
 * nie von Hand gepflegt: den Stichtagsteil schreiben die Importer (BayWü: `bayernrecht coverage --write`), den
 * Block `simulation` schreibt `import-simulation completeness --write` aus `data/simulation/<land>/completeness.json`.
 * Ein Land ohne Eintrag gilt als vollständig; der Hinweis der Oberfläche verschwindet, sobald der Stichtagsbestand
 * `complete: true` trägt und der Simulationsstand `SIM LEGAL STATE COMPLETE` meldet (oder der Eintrag entfällt).
 */
export const INVENTORY_STATUS_SCHEMA = 'landesrecht-inventory-status/1';

/**
 * Vollständigkeit der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 7):
 *  - `SIM SOURCES PARTIAL`: bekannte Ausgaben fehlen oder Zeiträume sind ungeklärt;
 *  - `SIM SOURCES COMPLETE FOR KNOWN INVENTORY`: alle bekannten Ausgaben liegen vor, Rechtsstand noch in Prüfung;
 *  - `SIM LEGAL STATE COMPLETE`: Quellen vollständig und alle Rechtsakte übernommen (nur, wenn belegbar).
 */
export const SIMULATION_INVENTORY_STATUSES = ['SIM SOURCES PARTIAL', 'SIM SOURCES COMPLETE FOR KNOWN INVENTORY', 'SIM LEGAL STATE COMPLETE'] as const;
export type SimulationInventoryStatusKind = (typeof SIMULATION_INVENTORY_STATUSES)[number];

export interface SimulationInventoryStatus {
  status: SimulationInventoryStatusKind;
  /** Bekannte Ausgaben der Sim-Verkündungsblätter (aus Nummernfolgen, Querverweisen, Verkündungsmitteilungen). */
  knownIssues: number;
  /** Vorhandene Ausgaben (archiviert und ausgewertet). */
  presentIssues: number;
  /** Sicher belegte, übernommene Rechtsakte der Simulation. */
  secureActs: number;
  /** Rechtsakte oder Quellen in Prüfung. */
  review: number;
  /** Entwürfe ohne Verkündungsbeleg (nie Rechtsstand). */
  draftsWithoutPromulgation: number;
  /** Normen, die erst durch die Simulation entstanden sind (erste Fassung nach dem Ausgangsrechtsstand). */
  simulationNorms: number;
  /** Stand der Bewertung (ISO-Datum). */
  updatedAt: string;
}

export interface InventoryStatus {
  jurisdiction: JurisdictionId;
  baselineDate: string;
  complete: boolean;
  /** Veröffentlichte Normen mit belegter Fassung zum Stichtag (Baseline-Normzahl). */
  published: number;
  /** Bekannte Stichtagsnormen, deren Fassung noch nicht aus amtlichen Quellen belegt ist. */
  pending: {
    /** Im Portal vorhanden, am Stichtag geltend, Stichtagsfassung noch nicht belegt (Rekonstruktion, Prüfung). */
    atBaseline: number;
    /** Am Stichtag geltend, heute nicht mehr im Portal (nur aus Verkündungsbelegen bekannt). */
    baselineOnly: number;
    /** Geltung am Stichtag nicht entschieden. */
    undetermined: number;
  };
  /** Stand der Simulationsrechtsfortschreibung; fehlt, solange kein Sim-Bestand bewertet ist. */
  simulation?: SimulationInventoryStatus;
}

const count = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`inventory-status.json: ${path} ist keine Anzahl`);
  return value;
};

export function isSimulationInventoryStatus(value: unknown): value is SimulationInventoryStatusKind {
  return typeof value === 'string' && (SIMULATION_INVENTORY_STATUSES as readonly string[]).includes(value);
}

export function parseSimulationInventoryStatus(value: unknown, path: string): SimulationInventoryStatus {
  if (!value || typeof value !== 'object') throw new Error(`inventory-status.json: ${path} muss ein Objekt sein`);
  const raw = value as Record<string, unknown>;
  if (!isSimulationInventoryStatus(raw.status)) throw new Error(`inventory-status.json: ${path}.status muss einer der Werte ${SIMULATION_INVENTORY_STATUSES.join(', ')} sein`);
  if (typeof raw.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.updatedAt)) throw new Error(`inventory-status.json: ${path}.updatedAt muss ein ISO-Datum sein`);
  const result: SimulationInventoryStatus = {
    status: raw.status,
    knownIssues: count(raw.knownIssues, `${path}.knownIssues`),
    presentIssues: count(raw.presentIssues, `${path}.presentIssues`),
    secureActs: count(raw.secureActs, `${path}.secureActs`),
    review: count(raw.review, `${path}.review`),
    draftsWithoutPromulgation: count(raw.draftsWithoutPromulgation, `${path}.draftsWithoutPromulgation`),
    simulationNorms: count(raw.simulationNorms, `${path}.simulationNorms`),
    updatedAt: raw.updatedAt,
  };
  if (result.presentIssues > result.knownIssues) throw new Error(`inventory-status.json: ${path}.presentIssues übersteigt knownIssues`);
  if (result.status !== 'SIM SOURCES PARTIAL' && result.presentIssues !== result.knownIssues) throw new Error(`inventory-status.json: ${path}.status ${result.status} setzt voraus, dass alle bekannten Ausgaben vorliegen`);
  if (result.status === 'SIM LEGAL STATE COMPLETE' && result.review !== 0) throw new Error(`inventory-status.json: ${path}.status SIM LEGAL STATE COMPLETE verträgt keine offene Prüfung`);
  return result;
}

export function parseInventoryStatusFile(value: unknown): Map<JurisdictionId, InventoryStatus> {
  const file = value as { schemaVersion?: unknown; jurisdictions?: Record<string, unknown> };
  if (!file || file.schemaVersion !== INVENTORY_STATUS_SCHEMA || typeof file.jurisdictions !== 'object' || file.jurisdictions === null) {
    throw new Error(`inventory-status.json: Schema ${INVENTORY_STATUS_SCHEMA} erwartet`);
  }
  const entries = new Map<JurisdictionId, InventoryStatus>();
  for (const [key, raw] of Object.entries(file.jurisdictions)) {
    const entry = raw as Record<string, unknown>;
    if (!isJurisdictionId(key) || entry.jurisdiction !== key) throw new Error(`inventory-status.json: unbekannte oder widersprüchliche Jurisdiktion ${key}`);
    if (entry.baselineDate !== SIMULATION_BASELINE_DATE) throw new Error(`inventory-status.json: ${key}.baselineDate muss ${SIMULATION_BASELINE_DATE} sein`);
    if (typeof entry.complete !== 'boolean') throw new Error(`inventory-status.json: ${key}.complete fehlt`);
    const pending = (entry.pending ?? {}) as Record<string, unknown>;
    const parsed: InventoryStatus = {
      jurisdiction: key,
      baselineDate: entry.baselineDate,
      complete: entry.complete,
      published: count(entry.published, `${key}.published`),
      pending: {
        atBaseline: count(pending.atBaseline, `${key}.pending.atBaseline`),
        baselineOnly: count(pending.baselineOnly, `${key}.pending.baselineOnly`),
        undetermined: count(pending.undetermined, `${key}.pending.undetermined`),
      },
    };
    if (entry.simulation !== undefined) parsed.simulation = parseSimulationInventoryStatus(entry.simulation, `${key}.simulation`);
    entries.set(key, parsed);
  }
  return entries;
}

const STATUS = parseInventoryStatusFile(status);

/** Stand eines Landes, nur wenn sein Stichtagsbestand unvollständig ist; sonst `undefined` (kein Hinweis). */
export function getPartialInventory(id: JurisdictionId): InventoryStatus | undefined {
  const entry = STATUS.get(id);
  return entry && !entry.complete ? entry : undefined;
}

/** Was die Oberfläche zum Bestand eines Landes sagen muss; `undefined`, wenn nichts zu sagen ist. */
export interface InventoryNoticeState {
  entry: InventoryStatus;
  /** Stichtagsbestand unvollständig (Hinweis „Teilbestand“). */
  baselinePartial: boolean;
  /** Simulationsrecht bewertet, aber nicht als vollständig belegt. */
  simulationPartial: boolean;
}

export function describeInventoryNotice(entry: InventoryStatus | undefined): InventoryNoticeState | undefined {
  if (!entry) return undefined;
  const baselinePartial = !entry.complete;
  const simulationPartial = entry.simulation !== undefined && entry.simulation.status !== 'SIM LEGAL STATE COMPLETE';
  return baselinePartial || simulationPartial ? { entry, baselinePartial, simulationPartial } : undefined;
}

/** Hinweis eines Landes aus der ausgelieferten Statusdatei. */
export function getInventoryNotice(id: JurisdictionId): InventoryNoticeState | undefined {
  return describeInventoryNotice(STATUS.get(id));
}
