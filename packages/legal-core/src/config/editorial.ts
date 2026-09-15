import editorial from './editorial.json' with { type: 'json' };
import { SIMULATION_BASELINE_DATE } from './jurisdictions.ts';

/**
 * Redaktioneller Stichtag der Simulation: das Datum, zu dem das Portal die „geltende Fassung“
 * ermittelt. Er ist vom Ausgangsrechtsstand (SIMULATION_BASELINE_DATE) zu unterscheiden:
 * der Ausgangsrechtsstand ist der eingefrorene Beginn des Simulationsbestands, der
 * redaktionelle Stichtag schreitet mit der Simulation fort und liegt nie davor.
 */
export const EDITORIAL_REFERENCE_DATE: string = editorial.referenceDate;

export const EDITORIAL_TIME_ZONE = 'Europe/Berlin';

if (EDITORIAL_REFERENCE_DATE < SIMULATION_BASELINE_DATE) {
  throw new Error(
    `editorial.json: referenceDate ${EDITORIAL_REFERENCE_DATE} liegt vor dem Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}`,
  );
}
