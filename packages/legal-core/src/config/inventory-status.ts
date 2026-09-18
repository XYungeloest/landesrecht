import status from './inventory-status.json' with { type: 'json' };
import { isJurisdictionId, SIMULATION_BASELINE_DATE, type JurisdictionId } from './jurisdictions.ts';

/**
 * Bestandsstand je Land: ob der Stichtagsbestand vollständig veröffentlicht ist. Die Datei
 * `inventory-status.json` wird von den Importern erzeugt (BayWü: `bayernrecht coverage --write`), nie von Hand
 * gepflegt. Ein Land ohne Eintrag gilt als vollständig; der Hinweis „Teilbestand“ verschwindet, sobald der Importer
 * `complete: true` schreibt oder den Eintrag entfernt.
 */
export const INVENTORY_STATUS_SCHEMA = 'landesrecht-inventory-status/1';

export interface InventoryStatus {
  jurisdiction: JurisdictionId;
  baselineDate: string;
  complete: boolean;
  /** Veröffentlichte Normen mit belegter Fassung zum Stichtag. */
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
}

const count = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`inventory-status.json: ${path} ist keine Anzahl`);
  return value;
};

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
    entries.set(key, {
      jurisdiction: key,
      baselineDate: entry.baselineDate,
      complete: entry.complete,
      published: count(entry.published, `${key}.published`),
      pending: {
        atBaseline: count(pending.atBaseline, `${key}.pending.atBaseline`),
        baselineOnly: count(pending.baselineOnly, `${key}.pending.baselineOnly`),
        undetermined: count(pending.undetermined, `${key}.pending.undetermined`),
      },
    });
  }
  return entries;
}

const STATUS = parseInventoryStatusFile(status);

/** Stand eines Landes, nur wenn sein Bestand unvollständig ist; sonst `undefined` (kein Hinweis). */
export function getPartialInventory(id: JurisdictionId): InventoryStatus | undefined {
  const entry = STATUS.get(id);
  return entry && !entry.complete ? entry : undefined;
}
