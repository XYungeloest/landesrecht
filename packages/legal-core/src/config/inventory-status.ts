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
  /** Getrenntes Statusmodell (Lauf 21): Blattabdeckung, Einzelakte, Evidenz, Ereignisse; fehlt bei alten Dateien. */
  sources?: SimulationSourceStatus;
}

/**
 * Getrennte Sim-Statusebenen (docs/SIMULATION_IMPORT.md, Abschnitt 7.2). `gazetteCoverage` sagt nur, ob alle
 * bekannten Blattausgaben vorliegen; der Gesamtstatus `simulationStatus` ist erst COMPLETE, wenn zusätzlich alle
 * bekannten Einzelverkündungen vorliegen, keine Quellenlücke A–C offen ist und kein Ereignis aus Quellengründen
 * in Prüfung oder gesperrt ist. `gazetteCoverage = COMPLETE` neben `simulationStatus = PARTIAL` ist daher regulär.
 */
export const SIM_COVERAGE_STATUSES = ['COMPLETE', 'PARTIAL'] as const;
export type SimCoverageStatus = (typeof SIM_COVERAGE_STATUSES)[number];

export interface SimulationSourceStatus {
  simulationStatus: SimCoverageStatus;
  /** Blattausgaben: bekannte (Nummernfolgen, Querverweise, angekündigte Ausgaben), vorhandene, fehlende (Klasse A). */
  gazetteCoverage: { status: SimCoverageStatus; knownIssues: number; presentIssues: number; missingIssues: number; suspiciousIssues: number };
  /** Einzelverkündungen ohne Blattausgabe: vorhanden, nur durch Mitteilung belegt, fehlend trotz Existenzbeleg (Klasse B). */
  standaloneSourceCoverage: { status: SimCoverageStatus; present: number; evidenceOnly: number; missing: number };
  /** Sicher fehlende Quellen: Klasse A + B. */
  missingSourceCount: number;
  /** Quelle vorhanden, Evidenz unvollständig (Klasse C). */
  evidenceIncompleteCount: number;
  /** Nur mögliche Lücken (Klasse D ohne Zeiträume) – nie als fehlende Quelle gezählt. */
  possibleGapCount: number;
  /** Ungeklärte Zeiträume (ebenfalls Klasse D). */
  knownUnclearPeriods: number;
  /** Ereignisse des Ledgers. */
  events: {
    total: number;
    applied: number;
    pending: number;
    review: number;
    blocked: number;
    notPromulgated: number;
    /** In Prüfung oder gesperrt aus Quellengründen (fehlende Quelle, Verkündung, Wirkdatum, nur Entwurf). */
    sourceCaused: number;
    /** Gesperrt, weil die Zielnorm nicht im eingefrorenen Ausgangsbestand steht (`missing-baseline-target`). */
    blockedByBaselineTarget: { events: number; targets: number; excludedFromFrozenBaseline: number; notInBaselineInventory: number };
    byReason: Record<string, number>;
  };
  /** Jüngstes Datum einer ausgewerteten Sim-Quelle (Ledger). */
  lastSourceDate: string | null;
}

/**
 * Baseline-Status (Run 16): ob der reale Ausgangsrechtsstand eines Landes eingefroren ist (`data/simulation/baseline-locks.json`,
 * `freeze`) und – solange nicht – wie weit er dafür bereit ist (`node scripts/nsh-freeze-readiness.ts --write`). Getrennt vom
 * Sim-Quellenstatus (`simulation.status`): Lücken der Sim-Verkündungsblätter sind nie ein Baseline-Blocker.
 */
export const FREEZE_READINESS_STATUSES = ['NOT READY', 'READY WITH HUMAN REVIEW', 'BASELINE READY'] as const;
export type FreezeReadinessStatus = (typeof FREEZE_READINESS_STATUSES)[number];

export interface BaselineFreezeStatus {
  frozen: boolean;
  /** Bewertete Bereitschaft (nur, solange nicht eingefroren). */
  readiness?: FreezeReadinessStatus;
  /** Stand der Bewertung (ISO-Datum). */
  assessedAt: string;
}

/**
 * Satz zum Baseline-Status für die Oberfläche – datengetrieben: eingefroren, bewertet (NOT READY, READY WITH HUMAN REVIEW,
 * BASELINE READY) oder ausdrücklich noch nicht bewertet. Ohne Bewertung wird keine erfunden.
 */
export function baselineFreezeText(freeze: BaselineFreezeStatus | undefined): string | undefined {
  if (!freeze) return undefined;
  if (freeze.frozen) return 'Der veröffentlichte Ausgangsrechtsstand ist eingefroren (Änderungen nur mit dokumentierter Entscheidung).';
  if (!freeze.readiness) return 'Ausgangsrechtsstand nicht eingefroren; Freeze-Bewertung noch nicht durchgeführt.';
  const readiness = freeze.readiness === 'BASELINE READY' ? 'bereit' : freeze.readiness === 'READY WITH HUMAN REVIEW' ? 'bereit nach fachlicher Prüfung offener Fälle' : 'noch nicht bereit (technische Blocker offen)';
  return `Ausgangsrechtsstand nicht eingefroren; Freeze-Bewertung: ${readiness}, Stand ${freeze.assessedAt}.`;
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
  /** Baseline-Status (Freeze); fehlt, solange nicht bewertet. */
  baselineFreeze?: BaselineFreezeStatus;
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
  if (raw.sources !== undefined) {
    result.sources = parseSimulationSourceStatus(raw.sources, `${path}.sources`);
    if ((result.sources.simulationStatus === 'COMPLETE') !== (result.status !== 'SIM SOURCES PARTIAL')) throw new Error(`inventory-status.json: ${path}.status ${result.status} widerspricht sources.simulationStatus ${result.sources.simulationStatus}`);
  }
  return result;
}

const coverage = (value: unknown, path: string): SimCoverageStatus => {
  if (!(SIM_COVERAGE_STATUSES as readonly unknown[]).includes(value)) throw new Error(`inventory-status.json: ${path} muss COMPLETE oder PARTIAL sein`);
  return value as SimCoverageStatus;
};

export function parseSimulationSourceStatus(value: unknown, path: string): SimulationSourceStatus {
  if (!value || typeof value !== 'object') throw new Error(`inventory-status.json: ${path} muss ein Objekt sein`);
  const raw = value as Record<string, unknown>;
  const gazette = (raw.gazetteCoverage ?? {}) as Record<string, unknown>;
  const standalone = (raw.standaloneSourceCoverage ?? {}) as Record<string, unknown>;
  const events = (raw.events ?? {}) as Record<string, unknown>;
  const baseline = (events.blockedByBaselineTarget ?? {}) as Record<string, unknown>;
  const byReason: Record<string, number> = {};
  for (const [reason, amount] of Object.entries((events.byReason ?? {}) as Record<string, unknown>)) byReason[reason] = count(amount, `${path}.events.byReason.${reason}`);
  if (raw.lastSourceDate !== null && (typeof raw.lastSourceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.lastSourceDate))) throw new Error(`inventory-status.json: ${path}.lastSourceDate muss ein ISO-Datum oder null sein`);
  const result: SimulationSourceStatus = {
    simulationStatus: coverage(raw.simulationStatus, `${path}.simulationStatus`),
    gazetteCoverage: { status: coverage(gazette.status, `${path}.gazetteCoverage.status`), knownIssues: count(gazette.knownIssues, `${path}.gazetteCoverage.knownIssues`), presentIssues: count(gazette.presentIssues, `${path}.gazetteCoverage.presentIssues`), missingIssues: count(gazette.missingIssues, `${path}.gazetteCoverage.missingIssues`), suspiciousIssues: count(gazette.suspiciousIssues, `${path}.gazetteCoverage.suspiciousIssues`) },
    standaloneSourceCoverage: { status: coverage(standalone.status, `${path}.standaloneSourceCoverage.status`), present: count(standalone.present, `${path}.standaloneSourceCoverage.present`), evidenceOnly: count(standalone.evidenceOnly, `${path}.standaloneSourceCoverage.evidenceOnly`), missing: count(standalone.missing, `${path}.standaloneSourceCoverage.missing`) },
    missingSourceCount: count(raw.missingSourceCount, `${path}.missingSourceCount`),
    evidenceIncompleteCount: count(raw.evidenceIncompleteCount, `${path}.evidenceIncompleteCount`),
    possibleGapCount: count(raw.possibleGapCount, `${path}.possibleGapCount`),
    knownUnclearPeriods: count(raw.knownUnclearPeriods, `${path}.knownUnclearPeriods`),
    events: {
      total: count(events.total, `${path}.events.total`),
      applied: count(events.applied, `${path}.events.applied`),
      pending: count(events.pending, `${path}.events.pending`),
      review: count(events.review, `${path}.events.review`),
      blocked: count(events.blocked, `${path}.events.blocked`),
      notPromulgated: count(events.notPromulgated, `${path}.events.notPromulgated`),
      sourceCaused: count(events.sourceCaused, `${path}.events.sourceCaused`),
      blockedByBaselineTarget: { events: count(baseline.events, `${path}.events.blockedByBaselineTarget.events`), targets: count(baseline.targets, `${path}.events.blockedByBaselineTarget.targets`), excludedFromFrozenBaseline: count(baseline.excludedFromFrozenBaseline, `${path}.events.blockedByBaselineTarget.excludedFromFrozenBaseline`), notInBaselineInventory: count(baseline.notInBaselineInventory, `${path}.events.blockedByBaselineTarget.notInBaselineInventory`) },
      byReason,
    },
    lastSourceDate: raw.lastSourceDate as string | null,
  };
  const gazetteComplete = result.gazetteCoverage.missingIssues === 0;
  if ((result.gazetteCoverage.status === 'COMPLETE') !== gazetteComplete) throw new Error(`inventory-status.json: ${path}.gazetteCoverage.status widerspricht missingIssues`);
  if (result.gazetteCoverage.presentIssues + result.gazetteCoverage.missingIssues !== result.gazetteCoverage.knownIssues) throw new Error(`inventory-status.json: ${path}.gazetteCoverage: vorhanden + fehlend ≠ bekannt`);
  if ((result.standaloneSourceCoverage.status === 'COMPLETE') !== (result.standaloneSourceCoverage.missing === 0)) throw new Error(`inventory-status.json: ${path}.standaloneSourceCoverage.status widerspricht missing`);
  if (result.missingSourceCount !== result.gazetteCoverage.missingIssues + result.standaloneSourceCoverage.missing) throw new Error(`inventory-status.json: ${path}.missingSourceCount ≠ fehlende Ausgaben + fehlende Einzelakte`);
  const strictComplete = result.missingSourceCount === 0 && result.evidenceIncompleteCount === 0 && result.events.sourceCaused === 0;
  if (result.simulationStatus === 'COMPLETE' && !strictComplete) throw new Error(`inventory-status.json: ${path}.simulationStatus COMPLETE verlangt: keine fehlende Quelle, keine unvollständige Evidenz, kein quellenbedingtes Review/Blocked`);
  return result;
}

export function parseBaselineFreezeStatus(value: unknown, path: string): BaselineFreezeStatus {
  if (!value || typeof value !== 'object') throw new Error(`inventory-status.json: ${path} muss ein Objekt sein`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.frozen !== 'boolean') throw new Error(`inventory-status.json: ${path}.frozen fehlt`);
  if (typeof raw.assessedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.assessedAt)) throw new Error(`inventory-status.json: ${path}.assessedAt muss ein ISO-Datum sein`);
  if (raw.readiness !== undefined && !(FREEZE_READINESS_STATUSES as readonly unknown[]).includes(raw.readiness)) throw new Error(`inventory-status.json: ${path}.readiness muss einer der Werte ${FREEZE_READINESS_STATUSES.join(', ')} sein`);
  if (raw.frozen && raw.readiness !== undefined) throw new Error(`inventory-status.json: ${path}: ein eingefrorener Bestand trägt keine Bereitschaftsbewertung`);
  return { frozen: raw.frozen, ...(raw.readiness !== undefined ? { readiness: raw.readiness as FreezeReadinessStatus } : {}), assessedAt: raw.assessedAt };
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
    if (entry.baselineFreeze !== undefined) parsed.baselineFreeze = parseBaselineFreezeStatus(entry.baselineFreeze, `${key}.baselineFreeze`);
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

/**
 * Gemeinsame Statusstruktur je Land (West, NSH, BayWü) für Oberfläche und API – abgeleitet aus derselben Statusdatei,
 * keine zweite Quelle. Baseline- und Sim-Status sind unabhängig: Ein eingefrorener Ausgangsrechtsstand bleibt FROZEN,
 * gleich wie lückenhaft die Sim-Quellen sind.
 */
export interface JurisdictionStatusSummary {
  baselineStatus: 'FROZEN' | 'NOT FROZEN' | 'NOT ASSESSED';
  baselineReadiness?: FreezeReadinessStatus;
  /** Vollständigkeitsstufe der Bewertung (`SIM SOURCES PARTIAL` …). */
  simulationStatusKind: SimulationInventoryStatusKind;
  simulationStatus: SimCoverageStatus;
  gazetteCoverage: SimulationSourceStatus['gazetteCoverage'];
  standaloneSourceCoverage: SimulationSourceStatus['standaloneSourceCoverage'];
  missingSourceCount: number;
  evidenceIncompleteCount: number;
  possibleGapCount: number;
  reviewCount: number;
  blockedCount: number;
  blockedByBaselineTarget: SimulationSourceStatus['events']['blockedByBaselineTarget'];
  knownUnclearPeriods: number;
  lastSourceDate: string | null;
  updatedAt: string;
}

export function summarizeJurisdictionStatus(entry: InventoryStatus | undefined): JurisdictionStatusSummary | undefined {
  const simulation = entry?.simulation;
  const sources = simulation?.sources;
  if (!entry || !simulation || !sources) return undefined;
  const freeze = entry.baselineFreeze;
  return {
    baselineStatus: freeze?.frozen ? 'FROZEN' : freeze ? 'NOT FROZEN' : 'NOT ASSESSED',
    ...(freeze && !freeze.frozen && freeze.readiness ? { baselineReadiness: freeze.readiness } : {}),
    simulationStatusKind: simulation.status,
    simulationStatus: sources.simulationStatus,
    gazetteCoverage: sources.gazetteCoverage,
    standaloneSourceCoverage: sources.standaloneSourceCoverage,
    missingSourceCount: sources.missingSourceCount,
    evidenceIncompleteCount: sources.evidenceIncompleteCount,
    possibleGapCount: sources.possibleGapCount,
    reviewCount: sources.events.review,
    blockedCount: sources.events.blocked,
    blockedByBaselineTarget: sources.events.blockedByBaselineTarget,
    knownUnclearPeriods: sources.knownUnclearPeriods,
    lastSourceDate: sources.lastSourceDate,
    updatedAt: simulation.updatedAt,
  };
}

/** Gemeinsame Statusstruktur eines Landes aus der ausgelieferten Statusdatei. */
export function getJurisdictionStatusSummary(id: JurisdictionId): JurisdictionStatusSummary | undefined {
  return summarizeJurisdictionStatus(STATUS.get(id));
}
