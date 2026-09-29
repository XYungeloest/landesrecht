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

/**
 * Klassifizierte Sim-Quellenlücke (docs/SIMULATION_IMPORT.md, Abschnitt 7.1):
 *  - `gazette-issue-missing` (A): bekannte Blattausgabe fehlt;
 *  - `standalone-act-missing` (B): amtlicher Einzelakt fehlt, obwohl seine Existenz sonst belegt ist;
 *  - `evidence-incomplete` (C): Quelle liegt vor, aber Wortlaut, Verkündung, Wirkdatum, Unterschrift, Anlage oder
 *    Publikationsidentität sind nicht belegt;
 *  - `possible-gap` (D): nur mögliche Lücke oder unklarer Zeitraum – nie als sicher fehlende Quelle gezählt.
 */
export const SOURCE_GAP_CLASSES = ['gazette-issue-missing', 'standalone-act-missing', 'evidence-incomplete', 'possible-gap'] as const;
export type SourceGapClass = (typeof SOURCE_GAP_CLASSES)[number];
export const SOURCE_GAP_MISSING = ['wording', 'promulgation', 'effective-date', 'signature', 'annex', 'publication-identity'] as const;
export type SourceGapMissing = (typeof SOURCE_GAP_MISSING)[number];
/** P1: entsperrt mehrere Akte oder eine zentrale Norm; P2: schließt eine klare Publikationslücke; P3: nur Vollständigkeit/Provenienz. */
export const ACQUISITION_PRIORITIES = ['P1', 'P2', 'P3'] as const;
export const ACQUISITION_CONFIDENCES = ['high', 'medium', 'low'] as const;
/**
 * Lebenszyklus eines Akquisitionseintrags (docs/MAINTENANCE.md):
 *  - `open`: Quelle wird gesucht;
 *  - `candidate-found`: `sources:intake` hat eine Datei eindeutig zugeordnet (`candidate`) – die Lücke ist noch offen;
 *  - `resolved`: Quelle verarbeitet und Lücke geschlossen (`resolution`); nie schon beim Auffinden einer Datei;
 *  - `rejected`: Beschaffung verworfen (`reason`) – die Lücke bleibt offen und zählt weiter;
 *  - `superseded`: durch eine andere Lücke ersetzt (`supersededBy`).
 */
export const ACQUISITION_STATUSES = ['open', 'candidate-found', 'resolved', 'rejected', 'superseded'] as const;
export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];

export interface AcquisitionCandidate {
  sha256: string;
  /** Pfad in der Inbox (relativ zu `imports/`) beim Auffinden. */
  path: string;
  foundAt: string;
}

export interface AcquisitionResolution {
  resolvedBySha256: string;
  resolvedAt: string;
  /** Kennung im Quelleninventar (`data/simulation/source-inventory.json`, SHA-256). */
  sourceInventoryId: string;
  publications: string[];
  events: string[];
  note?: string;
}

export interface SourceGap {
  id: string;
  class: SourceGapClass;
  title: string;
  /** Woher wir wissen, dass die Quelle existiert (oder warum die Lücke nur möglich ist). */
  existenceEvidence: string;
  expectedDate?: string;
  expectedPublication?: string;
  /** Nur Klasse A: Blattreihe und Ausgabe aus `series[].missingIssues`; fehlt beides, ist die Ausgabe nur angekündigt. */
  series?: string;
  issue?: string;
  /** Was fehlt (Pflicht bei Klasse C). */
  missing: SourceGapMissing[];
  /** Ledger-Ereignisse und Normen, die die Lücke offen hält. */
  blocks: { events: string[]; norms: string[] };
  /** Nur nützliche Quellen tragen einen Akquisitionseintrag (data/simulation/source-acquisition-queue.json). */
  acquisition?: {
    priority: (typeof ACQUISITION_PRIORITIES)[number];
    confidence: (typeof ACQUISITION_CONFIDENCES)[number];
    status: AcquisitionStatus;
    candidate?: AcquisitionCandidate;
    resolution?: AcquisitionResolution;
    supersededBy?: string;
    reason?: string;
  };
  note?: string;
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
  /** Klassifizierte Quellenlücken A–D; der Sim-Quellenstatus wird daraus und aus dem Ledger berechnet (assessment.ts). */
  sourceGaps: SourceGap[];
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

function expectSha(value: unknown, path: string): string {
  const text = expectString(value, path);
  if (!/^[0-9a-f]{64}$/u.test(text)) fail(path, 'muss ein SHA-256 sein');
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

function expectEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(path, `muss einer der Werte ${allowed.join(', ')} sein`);
  return value as T;
}

function parseSourceGap(value: unknown, path: string): SourceGap {
  const object = expectObject(value, path);
  const id = expectString(object.id, `${path}.id`);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) fail(`${path}.id`, 'muss ein Slug sein');
  const gap: SourceGap = {
    id,
    class: expectEnum(object.class, SOURCE_GAP_CLASSES, `${path}.class`),
    title: expectString(object.title, `${path}.title`),
    existenceEvidence: expectString(object.existenceEvidence, `${path}.existenceEvidence`),
    missing: expectStringList(object.missing, `${path}.missing`).map((entry, index) => expectEnum(entry, SOURCE_GAP_MISSING, `${path}.missing[${index}]`)),
    blocks: { events: [], norms: [] },
  };
  for (const key of ['expectedDate', 'expectedPublication', 'series', 'issue', 'note'] as const) if (object[key] !== undefined) gap[key] = expectString(object[key], `${path}.${key}`);
  const blocks = expectObject(object.blocks ?? {}, `${path}.blocks`);
  gap.blocks = { events: expectStringList(blocks.events, `${path}.blocks.events`), norms: expectStringList(blocks.norms, `${path}.blocks.norms`) };
  if ((gap.series === undefined) !== (gap.issue === undefined)) fail(path, 'series und issue nur gemeinsam');
  if (gap.series !== undefined && gap.class !== 'gazette-issue-missing') fail(`${path}.series`, 'nur bei Klasse gazette-issue-missing');
  if (gap.class === 'evidence-incomplete' && gap.missing.length === 0) fail(`${path}.missing`, 'Klasse evidence-incomplete nennt, was fehlt');
  if (object.acquisition !== undefined) {
    const acquisition = expectObject(object.acquisition, `${path}.acquisition`);
    gap.acquisition = {
      priority: expectEnum(acquisition.priority, ACQUISITION_PRIORITIES, `${path}.acquisition.priority`),
      confidence: expectEnum(acquisition.confidence, ACQUISITION_CONFIDENCES, `${path}.acquisition.confidence`),
      status: expectEnum(acquisition.status, ACQUISITION_STATUSES, `${path}.acquisition.status`),
    };
    const status = gap.acquisition.status;
    if (acquisition.candidate !== undefined) {
      const candidate = expectObject(acquisition.candidate, `${path}.acquisition.candidate`);
      gap.acquisition.candidate = { sha256: expectSha(candidate.sha256, `${path}.acquisition.candidate.sha256`), path: expectString(candidate.path, `${path}.acquisition.candidate.path`), foundAt: expectIsoDate(candidate.foundAt, `${path}.acquisition.candidate.foundAt`) };
    }
    if (acquisition.resolution !== undefined) {
      const resolution = expectObject(acquisition.resolution, `${path}.acquisition.resolution`);
      gap.acquisition.resolution = {
        resolvedBySha256: expectSha(resolution.resolvedBySha256, `${path}.acquisition.resolution.resolvedBySha256`),
        resolvedAt: expectIsoDate(resolution.resolvedAt, `${path}.acquisition.resolution.resolvedAt`),
        sourceInventoryId: expectSha(resolution.sourceInventoryId, `${path}.acquisition.resolution.sourceInventoryId`),
        publications: expectStringList(resolution.publications, `${path}.acquisition.resolution.publications`),
        events: expectStringList(resolution.events, `${path}.acquisition.resolution.events`),
        ...(resolution.note !== undefined ? { note: expectString(resolution.note, `${path}.acquisition.resolution.note`) } : {}),
      };
    }
    if (acquisition.supersededBy !== undefined) gap.acquisition.supersededBy = expectString(acquisition.supersededBy, `${path}.acquisition.supersededBy`);
    if (acquisition.reason !== undefined) gap.acquisition.reason = expectString(acquisition.reason, `${path}.acquisition.reason`);
    if (status === 'candidate-found' && !gap.acquisition.candidate) fail(`${path}.acquisition`, 'candidate-found verlangt candidate (sha256, path, foundAt)');
    if (status === 'resolved' && !gap.acquisition.resolution) fail(`${path}.acquisition`, 'resolved verlangt resolution (resolvedBySha256, resolvedAt, sourceInventoryId)');
    if (status !== 'resolved' && gap.acquisition.resolution) fail(`${path}.acquisition.resolution`, 'nur bei resolved');
    if (status === 'superseded' && !gap.acquisition.supersededBy) fail(`${path}.acquisition`, 'superseded verlangt supersededBy');
    if (status === 'rejected' && !gap.acquisition.reason) fail(`${path}.acquisition`, 'rejected verlangt reason');
    // Keine spekulative P1: eine mögliche Lücke oder eine unsichere Existenz entsperrt nichts Belegtes.
    if (gap.class === 'possible-gap') fail(`${path}.acquisition`, 'eine nur mögliche Lücke ist keine Akquisitionsaufgabe');
    if (gap.acquisition.priority === 'P1' && gap.acquisition.confidence === 'low') fail(`${path}.acquisition.priority`, 'P1 verlangt belegte Existenz (confidence nicht low)');
    if (gap.acquisition.priority === 'P1' && gap.blocks.events.length + gap.blocks.norms.length === 0) fail(`${path}.acquisition.priority`, 'P1 verlangt, dass die Quelle Akte oder Normen entsperrt');
  }
  return gap;
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
    sourceGaps: [],
    notes: expectStringList(object.notes, `${path}.notes`),
  };
  const gapsRaw = object.sourceGaps === undefined ? [] : object.sourceGaps;
  if (!Array.isArray(gapsRaw)) fail(`${path}.sourceGaps`, 'muss eine Liste sein');
  file.sourceGaps = gapsRaw.map((entry, index) => parseSourceGap(entry, `${path}.sourceGaps[${index}]`));
  const gapIds = file.sourceGaps.map((gap) => gap.id);
  if (new Set(gapIds).size !== gapIds.length) fail(`${path}.sourceGaps`, 'eine Lücken-ID ist doppelt');
  // Jede fehlende Ausgabe einer Blattreihe ist genau eine Lücke der Klasse A – und umgekehrt.
  const linked = new Map<string, string>();
  for (const gap of file.sourceGaps) {
    if (gap.series === undefined) continue;
    const entry = series.find((candidate) => candidate.gazette === gap.series);
    const present = entry?.presentIssues.includes(gap.issue!) === true;
    // Eine inzwischen vorliegende Ausgabe schließt die Lücke nur mit gefundener oder aufgelöster Quelle (Lebenszyklus).
    if (present && gap.acquisition?.status !== 'candidate-found' && gap.acquisition?.status !== 'resolved') fail(`${path}.sourceGaps`, `${gap.id}: ${gap.series} ${gap.issue} liegt vor – Lücke als candidate-found/resolved führen oder entfernen`);
    if (!entry || (!present && !entry.missingIssues.includes(gap.issue!))) fail(`${path}.sourceGaps`, `${gap.id}: ${gap.series} ${gap.issue} ist keine fehlende Ausgabe der Blattreihen`);
    const key = `${gap.series}\u0000${gap.issue}`;
    if (linked.has(key)) fail(`${path}.sourceGaps`, `${gap.series} ${gap.issue} ist doppelt als Lücke erfasst`);
    linked.set(key, gap.id);
  }
  for (const entry of series) for (const issue of entry.missingIssues) {
    if (!linked.has(`${entry.gazette}\u0000${issue}`)) fail(`${path}.sourceGaps`, `fehlende Ausgabe ${entry.gazette} ${issue} ist nicht als Lücke der Klasse A erfasst`);
  }
  for (const gap of file.sourceGaps) {
    if (gap.acquisition?.supersededBy && !gapIds.includes(gap.acquisition.supersededBy)) fail(`${path}.sourceGaps`, `${gap.id}: supersededBy ${gap.acquisition.supersededBy} ist keine Lücke`);
  }
  // Der Status muss belegbar sein: „vollständig“ verträgt keine fehlenden Ausgaben und keine Quellenlücke A–C.
  // Nur mögliche Lücken (Klasse D, ungeklärte Zeiträume) sperren „vollständig“ nicht (Abschnitt 7.2).
  const missing = series.reduce((sum, entry) => sum + entry.missingIssues.length, 0);
  if (file.status !== 'SIM SOURCES PARTIAL') {
    if (missing > 0) fail(`${path}.status`, `${file.status} verträgt keine fehlenden Ausgaben (${missing})`);
    const open = file.sourceGaps.filter((gap) => gap.class !== 'possible-gap' && isOpenGap(file, gap)).length;
    if (open > 0) fail(`${path}.status`, `${file.status} verträgt keine Quellenlücken der Klassen A–C (${open})`);
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

/**
 * Ob eine Lücke offen ist und zählt: aufgelöste und ersetzte Lücken sind geschlossen; eine Lücke A mit Blattreihe ist
 * geschlossen, sobald ihre Ausgabe in `presentIssues` steht. `open`, `candidate-found` und `rejected` bleiben offen.
 */
export function isOpenGap(file: Pick<CompletenessFile, 'series'>, gap: SourceGap): boolean {
  const status = gap.acquisition?.status;
  if (status === 'resolved' || status === 'superseded') return false;
  if (gap.series !== undefined) return !(file.series.find((entry) => entry.gazette === gap.series)?.presentIssues.includes(gap.issue!) ?? false);
  return true;
}
