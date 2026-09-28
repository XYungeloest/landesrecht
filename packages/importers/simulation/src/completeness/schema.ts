/**
 * Vollständigkeitsbewertung je Land: `data/simulation/<land>/completeness.json` (docs/SIMULATION_IMPORT.md,
 * Abschnitt 7). Sie ist eine fachliche Entscheidung und wird von Hand bzw. durch die Evidenzprüfung geschrieben;
 * dieser Parser liest sie fail-closed: Der angegebene Status muss zu den Listen passen (kein „vollständig“ bei
 * fehlenden Nummern oder ungeklärten Zeiträumen), sonst ist die Datei ungültig.
 */
import { isJurisdictionId, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isSimulationInventoryStatus, SIMULATION_INVENTORY_STATUSES, type SimulationInventoryStatusKind } from '@landesrecht/legal-core/config/inventory-status.ts';

import { SIMULATION_DATA_DIR } from '../common/paths.ts';

export const COMPLETENESS_SCHEMA = 'landesrecht-simulation-completeness/1' as const;

export function completenessPath(jurisdiction: JurisdictionId): string {
  return `${SIMULATION_DATA_DIR}/${jurisdiction}/completeness.json`;
}

/** Eine Blattreihe: bekannte, vorhandene, fehlende und verdächtige Ausgaben (Bezeichnungen wie „2024 Nr. 3“). */
export interface CompletenessSeries {
  gazette: string;
  seriesTitle?: string;
  /** Bekannte Ausgaben aus Nummernfolgen, Querverweisen und Verkündungsmitteilungen. */
  knownIssues: string[];
  /** Vorhandene Ausgaben (Teilmenge von `knownIssues`). */
  presentIssues: string[];
  /** Fehlende Ausgaben (= `knownIssues` ohne `presentIssues`). */
  missingIssues: string[];
  /** Verdächtige Nummern (Doppelnummer, Sprung in der Folge) – Hinweis, keine Sperre. */
  suspiciousIssues: string[];
  /** SHA-256 der Belege für die Nummernfolge. */
  evidence: string[];
}

export interface CompletenessPeriod {
  from: string;
  to: string;
  note: string;
}

export interface CompletenessFile {
  schemaVersion: typeof COMPLETENESS_SCHEMA;
  jurisdiction: JurisdictionId;
  /** Stand der Bewertung (ISO-Datum). */
  assessedAt: string;
  status: SimulationInventoryStatusKind;
  series: CompletenessSeries[];
  /** Einzelverkündungen ohne Blattausgabe: vorhandene Akte und Akte, für die nur eine Mitteilung vorliegt. */
  standaloneActs: { present: number; evidenceOnly: number };
  /** Zeiträume ohne bekannte Ausgabe oder mit unklarer Nummernfolge. */
  unclearPeriods: CompletenessPeriod[];
  /** Rechtsakte: sicher belegt und übernommen, in Prüfung, gesperrt (Ziel nicht im Bestand), Entwürfe ohne Verkündung. */
  acts: { secure: number; review: number; blocked: number; draftsWithoutPromulgation: number };
  notes: string[];
}

export class CompletenessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletenessValidationError';
  }
}

function fail(path: string, message: string): never {
  throw new CompletenessValidationError(`${path}: ${message}`);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'muss ein Objekt sein');
  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'muss ein nicht leerer String sein');
  return value.trim();
}

function expectIsoDate(value: unknown, path: string): string {
  const text = expectString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) fail(path, 'muss ein ISO-Datum sein');
  return text;
}

function expectCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail(path, 'muss eine Anzahl sein');
  return value;
}

function expectStringList(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, 'muss eine Liste sein');
  return value.map((entry, index) => expectString(entry, `${path}[${index}]`));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function parseSeries(value: unknown, path: string): CompletenessSeries {
  const object = expectObject(value, path);
  const knownIssues = expectStringList(object.knownIssues, `${path}.knownIssues`);
  const presentIssues = expectStringList(object.presentIssues, `${path}.presentIssues`);
  const missingIssues = expectStringList(object.missingIssues, `${path}.missingIssues`);
  if (new Set(knownIssues).size !== knownIssues.length) fail(`${path}.knownIssues`, 'enthält Doppelungen');
  const known = new Set(knownIssues);
  for (const issue of presentIssues) if (!known.has(issue)) fail(`${path}.presentIssues`, `„${issue}“ ist keine bekannte Ausgabe`);
  const expectedMissing = knownIssues.filter((issue) => !presentIssues.includes(issue));
  if (!sameSet(missingIssues, expectedMissing)) fail(`${path}.missingIssues`, `muss genau die bekannten, nicht vorhandenen Ausgaben nennen (${expectedMissing.join(', ') || 'keine'})`);
  const series: CompletenessSeries = {
    gazette: expectString(object.gazette, `${path}.gazette`),
    knownIssues,
    presentIssues,
    missingIssues: expectedMissing,
    suspiciousIssues: expectStringList(object.suspiciousIssues, `${path}.suspiciousIssues`),
    evidence: expectStringList(object.evidence, `${path}.evidence`),
  };
  if (object.seriesTitle !== undefined) series.seriesTitle = expectString(object.seriesTitle, `${path}.seriesTitle`);
  for (const [index, sha] of series.evidence.entries()) if (!/^[0-9a-f]{64}$/u.test(sha)) fail(`${path}.evidence[${index}]`, 'muss ein SHA-256 sein');
  return series;
}

export function parseCompletenessFile(value: unknown, path = 'completeness.json'): CompletenessFile {
  const object = expectObject(value, path);
  if (object.schemaVersion !== COMPLETENESS_SCHEMA) fail(`${path}.schemaVersion`, `muss ${COMPLETENESS_SCHEMA} sein`);
  if (!isJurisdictionId(object.jurisdiction)) fail(`${path}.jurisdiction`, 'ist keine Jurisdiktion');
  if (!isSimulationInventoryStatus(object.status)) fail(`${path}.status`, `muss einer der Werte ${SIMULATION_INVENTORY_STATUSES.join(', ')} sein`);
  if (!Array.isArray(object.series)) fail(`${path}.series`, 'muss eine Liste sein');
  const series = object.series.map((entry, index) => parseSeries(entry, `${path}.series[${index}]`));
  const gazettes = series.map((entry) => entry.gazette);
  if (new Set(gazettes).size !== gazettes.length) fail(`${path}.series`, 'ein Blatt ist doppelt aufgeführt');
  const standalone = expectObject(object.standaloneActs ?? {}, `${path}.standaloneActs`);
  const acts = expectObject(object.acts, `${path}.acts`);
  const periodsRaw = object.unclearPeriods === undefined ? [] : object.unclearPeriods;
  if (!Array.isArray(periodsRaw)) fail(`${path}.unclearPeriods`, 'muss eine Liste sein');
  const unclearPeriods = periodsRaw.map((entry, index) => {
    const period = expectObject(entry, `${path}.unclearPeriods[${index}]`);
    const from = expectIsoDate(period.from, `${path}.unclearPeriods[${index}].from`);
    const to = expectIsoDate(period.to, `${path}.unclearPeriods[${index}].to`);
    if (to < from) fail(`${path}.unclearPeriods[${index}].to`, 'liegt vor from');
    return { from, to, note: expectString(period.note, `${path}.unclearPeriods[${index}].note`) };
  });
  const file: CompletenessFile = {
    schemaVersion: COMPLETENESS_SCHEMA,
    jurisdiction: object.jurisdiction,
    assessedAt: expectIsoDate(object.assessedAt, `${path}.assessedAt`),
    status: object.status,
    series,
    standaloneActs: { present: expectCount(standalone.present ?? 0, `${path}.standaloneActs.present`), evidenceOnly: expectCount(standalone.evidenceOnly ?? 0, `${path}.standaloneActs.evidenceOnly`) },
    unclearPeriods,
    acts: {
      secure: expectCount(acts.secure, `${path}.acts.secure`),
      review: expectCount(acts.review, `${path}.acts.review`),
      blocked: expectCount(acts.blocked ?? 0, `${path}.acts.blocked`),
      draftsWithoutPromulgation: expectCount(acts.draftsWithoutPromulgation ?? 0, `${path}.acts.draftsWithoutPromulgation`),
    },
    notes: expectStringList(object.notes, `${path}.notes`),
  };
  // Der Status muss belegbar sein: „vollständig“ verträgt weder fehlende Ausgaben noch ungeklärte Zeiträume.
  const missing = series.reduce((sum, entry) => sum + entry.missingIssues.length, 0);
  if (file.status !== 'SIM SOURCES PARTIAL') {
    if (missing > 0) fail(`${path}.status`, `${file.status} verträgt keine fehlenden Ausgaben (${missing})`);
    if (unclearPeriods.length > 0) fail(`${path}.status`, `${file.status} verträgt keine ungeklärten Zeiträume (${unclearPeriods.length})`);
  }
  if (file.status === 'SIM LEGAL STATE COMPLETE' && (file.acts.review > 0 || file.acts.blocked > 0)) {
    fail(`${path}.status`, `SIM LEGAL STATE COMPLETE verträgt keine Rechtsakte in Prüfung oder Sperre (${file.acts.review + file.acts.blocked})`);
  }
  return file;
}

/** Summen für den Teilbestandshinweis; „in Prüfung“ umfasst gesperrte Ziele (beides ist nicht sicher belegt). */
export function completenessTotals(file: CompletenessFile): { knownIssues: number; presentIssues: number; missingIssues: number; secureActs: number; review: number; draftsWithoutPromulgation: number } {
  return {
    knownIssues: file.series.reduce((sum, entry) => sum + entry.knownIssues.length, 0),
    presentIssues: file.series.reduce((sum, entry) => sum + entry.presentIssues.length, 0),
    missingIssues: file.series.reduce((sum, entry) => sum + entry.missingIssues.length, 0),
    secureActs: file.acts.secure,
    review: file.acts.review + file.acts.blocked,
    draftsWithoutPromulgation: file.acts.draftsWithoutPromulgation,
  };
}
