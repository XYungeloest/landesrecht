/**
 * Dokumentierte Legacy-Ausnahmen (`data/imports/recht-nrw/legacy-exceptions.json`).
 *
 * Ergibt der Reimport einer bereits übernommenen Norm mit dem aktuellen Parser keinen Import mehr
 * (`import-regression`), bleiben Manifest und Inhalt beim zuletzt übernommenen Stand – der Manifesteintrag
 * trägt dann eine ältere Parserversion. Das ist nur mit einer Ausnahme dieser Datei zulässig:
 *
 *  - `deliver-legacy`: die gespeicherte Fassung wird weiter ausgeliefert. Voraussetzung ist der Nachweis der
 *    Textintegrität (der sichtbare Text der gespeicherten Fassung ist mit dem Text des aktuellen Parseroutputs
 *    identisch; nur die Struktur weicht ab) und eine Begründung, warum die strukturelle Abweichung tragbar ist.
 *  - `depublish`: die gespeicherte Fassung wird kontrolliert entfernt; der Manifesteintrag erhält den aktuellen
 *    Parserbefund (`needs-review`, aktuelle Parserversion, kein Ziel-Slug). Keine stille Verschlechterung: die
 *    Entscheidung steht mit Grund und Freigabe in dieser Datei, der Lauf protokolliert sie als Befund.
 *
 * Eine Ausnahme gilt nur für genau die Quelle (SHA-256 der Fassungsseite), den Legacy-Parserstand und den
 * aktuellen Parserstand, für die sie vorbereitet wurde. Ändert sich eines davon, greift sie nicht mehr
 * (fail-closed): der Reimport meldet wieder `import-regression`, der Versionsreport einen unbegründeten Altstand.
 *
 * Freigabe (Human Approval): Jede Ausnahme wird maschinell vorbereitet (`preparedAt`, `preparedBy:
 * "automated-review"`) und trägt einen Freigabestatus `approvalStatus`:
 *
 *  - `pending-human-review`  vorbereitet, redaktionelle Bestätigung durch einen Menschen ausstehend (Ausgangszustand)
 *  - `approved`              redaktionell bestätigt (`decision` mit Datum, Begründung, optional Name des Freigebenden)
 *  - `rejected`              nicht freigegeben; die Ausnahme greift nicht mehr (fail-closed), keine automatische Folgeaktion
 *  - `superseded`            gegenstandslos geworden (z. B. Norm mit aktuellem Parser neu importiert); nur manuell
 *
 * Ein Name wird nie automatisch eingetragen (kein Git-/OS-Nutzer, kein Agent); `approvalHistory` hält jeden
 * Statuswechsel (vorher, nachher, Datum, Begründung) fest. Report und CLI: `common/human-approval.ts`.
 */
import { join } from 'node:path';

import { readJsonFile } from './atomic.ts';
import { IMPORT_DATA_DIR, SOURCE_AREAS, type ManifestEntry, type SourceArea } from './manifest.ts';
import { currentParserVersion } from './staleness.ts';

export const LEGACY_EXCEPTIONS_SCHEMA = 'recht-nrw-legacy-exceptions/1' as const;
export const LEGACY_EXCEPTIONS_PATH = join(IMPORT_DATA_DIR, 'legacy-exceptions.json');

export const LEGACY_DISPOSITIONS = ['deliver-legacy', 'depublish'] as const;
export type LegacyDisposition = (typeof LEGACY_DISPOSITIONS)[number];

export const APPROVAL_STATUSES = ['pending-human-review', 'approved', 'rejected', 'superseded'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
/** Vorbereitende Instanz jeder Ausnahme; nie ein Personenname. */
export const AUTOMATED_PREPARER = 'automated-review' as const;

export interface ApprovalDecision {
  status: Extract<ApprovalStatus, 'approved' | 'rejected'>;
  /** ISO-Zeitpunkt der Entscheidung. */
  decidedAt: string;
  reason: string;
  /** Name der freigebenden Person – nur, wenn ausdrücklich angegeben; nie automatisch. */
  approvedBy?: string;
}

export interface ApprovalHistoryEntry {
  from: ApprovalStatus;
  to: ApprovalStatus;
  at: string;
  reason: string;
  by?: string;
}

/** Strukturierter Verweis auf einen Beleg oder eine Analyse, aus der der Freigabereport gespeist wird. */
export interface EvidenceReference {
  kind: 'analysis' | 'evidence-pass' | 'run-report' | 'review-item' | 'manifest';
  /** Repository-Pfad (Dateien) oder Review-Fall-Kennung. */
  ref: string;
  note?: string;
}

/** Nur deliver-legacy: strukturierte Beantwortung der Legacy-Fragen (Report leitet Empfehlung und Risiko daraus ab). */
export interface LegacyAssessment {
  /** Sektionen der Quelle ohne Nummernfeld, die Parser 1.2.0 nicht einordnen kann. */
  unclassifiedSections: number[];
  /** Kennzeichen, die diesen Sektionen nach Zählung/Querverweis/Fußnote zukommen (nicht erfunden, nur dokumentiert). */
  expectedLabels: string[];
  /** structure-only: nur Zuordnung/Struktur weicht ab, kein Textverlust; possible-legal-content: Rechtsinhalt könnte betroffen sein. */
  impact: 'structure-only' | 'possible-legal-content';
  /** override-proposed: konkretes Override vorgeschlagen; editorial-decision: redaktionelle Entscheidung nötig. */
  resolution: 'override-proposed' | 'editorial-decision';
}

export interface LegacyTextIntegrity {
  /** Vergleichsverfahren, z. B. „sichtbarer Text der Fassung (Kennzeichen, Titel, Text; ohne Fußnotenblöcke), zeilenweise“. */
  method: string;
  /** SHA-256 des Vergleichstexts der gespeicherten (Legacy-)Fassung. */
  legacySha256: string;
  /** SHA-256 des Vergleichstexts des aktuellen Parseroutputs (transformiert, Dry-run). */
  currentSha256: string;
  legacyChars: number;
  currentChars: number;
  identical: boolean;
  /** Abweichungen, die der Vergleich bewusst ausnimmt (z. B. Fußnoten, die Parser 1.1.0 als Fließtext führte). */
  note?: string;
}

export interface LegacyException {
  /** Technische Kennung (`legacy-<term-id>`). */
  id: string;
  sourceIdentity: string;
  sourceArea: SourceArea;
  targetSlug: string;
  disposition: LegacyDisposition;
  source: { url: string; sha256: string };
  legacy: { parserVersion: string; transformerVersion: string; importStatus: ManifestEntry['importStatus'] };
  current: { parserVersion: string; findings: string[] };
  textIntegrity: LegacyTextIntegrity;
  /** Konkrete strukturelle Differenz zwischen gespeicherter Fassung und aktuellem Parseroutput. */
  structuralDefect: string;
  /** Warum die Entscheidung tragbar ist (bei deliver-legacy: Legacy-safe-Begründung). */
  reason: string;
  /** Weg zur endgültigen Auflösung (z. B. dokumentiertes Override des fehlenden Kennzeichens). */
  followUp?: string;
  /** ISO-Datum der maschinellen Vorbereitung (Prüfdatum). */
  preparedAt: string;
  preparedBy: typeof AUTOMATED_PREPARER;
  approvalStatus: ApprovalStatus;
  /** Nur bei approved/rejected: die redaktionelle Entscheidung. */
  decision?: ApprovalDecision;
  approvalHistory?: ApprovalHistoryEntry[];
  evidenceReferences?: EvidenceReference[];
  legacyAssessment?: LegacyAssessment;
}

export interface LegacyExceptionRegistry {
  schemaVersion: typeof LEGACY_EXCEPTIONS_SCHEMA;
  description?: string;
  entries: LegacyException[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === 'string' && (APPROVAL_STATUSES as readonly string[]).includes(value);
}

function validateApproval(entry: LegacyException, where: string): void {
  if (!ISO_DATE.test(entry.preparedAt ?? '')) throw new Error(`${where}: preparedAt muss ein ISO-Datum sein`);
  if (entry.preparedBy !== AUTOMATED_PREPARER) throw new Error(`${where}: preparedBy muss "${AUTOMATED_PREPARER}" sein (kein Personenname)`);
  if (!isApprovalStatus(entry.approvalStatus)) throw new Error(`${where}: approvalStatus erwartet ${APPROVAL_STATUSES.join('|')}, erhalten ${String(entry.approvalStatus)}`);
  const decision = entry.decision;
  if (entry.approvalStatus === 'approved' || entry.approvalStatus === 'rejected') {
    if (!decision) throw new Error(`${where}: Status ${entry.approvalStatus} verlangt decision`);
    if (decision.status !== entry.approvalStatus) throw new Error(`${where}: decision.status ${String(decision.status)} widerspricht approvalStatus ${entry.approvalStatus}`);
    if (!ISO_INSTANT.test(decision.decidedAt ?? '')) throw new Error(`${where}: decision.decidedAt muss ein ISO-Zeitpunkt sein`);
    if (!decision.reason?.trim()) throw new Error(`${where}: decision.reason fehlt`);
    if (decision.approvedBy !== undefined && !decision.approvedBy.trim()) throw new Error(`${where}: decision.approvedBy darf nicht leer sein`);
  } else if (decision) throw new Error(`${where}: decision nur bei approved/rejected`);
  if (entry.approvalHistory !== undefined) {
    if (!Array.isArray(entry.approvalHistory)) throw new Error(`${where}: approvalHistory muss eine Liste sein`);
    for (const step of entry.approvalHistory) {
      if (!isApprovalStatus(step.from) || !isApprovalStatus(step.to)) throw new Error(`${where}: approvalHistory mit unbekanntem Status`);
      if (!ISO_INSTANT.test(step.at ?? '')) throw new Error(`${where}: approvalHistory.at muss ein ISO-Zeitpunkt sein`);
      if (!step.reason?.trim()) throw new Error(`${where}: approvalHistory.reason fehlt`);
    }
    const last = entry.approvalHistory[entry.approvalHistory.length - 1];
    if (last && last.to !== entry.approvalStatus) throw new Error(`${where}: letzter approvalHistory-Schritt (${last.to}) widerspricht approvalStatus ${entry.approvalStatus}`);
  }
  if (entry.evidenceReferences !== undefined) {
    if (!Array.isArray(entry.evidenceReferences)) throw new Error(`${where}: evidenceReferences muss eine Liste sein`);
    for (const reference of entry.evidenceReferences) if (!['analysis', 'evidence-pass', 'run-report', 'review-item', 'manifest'].includes(reference.kind) || !reference.ref?.trim()) throw new Error(`${where}: evidenceReferences mit ungültigem Eintrag`);
  }
  const assessment = entry.legacyAssessment;
  if (entry.disposition === 'deliver-legacy') {
    if (!assessment) throw new Error(`${where}: deliver-legacy verlangt legacyAssessment`);
    if (!Array.isArray(assessment.unclassifiedSections) || assessment.unclassifiedSections.length === 0 || !assessment.unclassifiedSections.every((section) => Number.isInteger(section) && section > 0)) throw new Error(`${where}: legacyAssessment.unclassifiedSections fehlt`);
    if (!Array.isArray(assessment.expectedLabels)) throw new Error(`${where}: legacyAssessment.expectedLabels fehlt`);
    if (!['structure-only', 'possible-legal-content'].includes(assessment.impact)) throw new Error(`${where}: legacyAssessment.impact erwartet structure-only|possible-legal-content`);
    if (!['override-proposed', 'editorial-decision'].includes(assessment.resolution)) throw new Error(`${where}: legacyAssessment.resolution erwartet override-proposed|editorial-decision`);
  } else if (assessment) throw new Error(`${where}: legacyAssessment nur bei deliver-legacy`);
}

export function validateLegacyException(entry: LegacyException, path = LEGACY_EXCEPTIONS_PATH): void {
  const where = `${path}: Ausnahme ${entry?.id ?? '?'}`;
  if (!entry.id || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.id)) throw new Error(`${where}: id muss eine technische Kennung sein`);
  if (!/^term:\d+$/u.test(entry.sourceIdentity ?? '')) throw new Error(`${where}: sourceIdentity muss term:<id> sein`);
  if (!(SOURCE_AREAS as readonly string[]).includes(entry.sourceArea)) throw new Error(`${where}: sourceArea muss lrgv oder lrmb sein`);
  if (!entry.targetSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.targetSlug)) throw new Error(`${where}: targetSlug fehlt oder ist ungültig`);
  if (!(LEGACY_DISPOSITIONS as readonly string[]).includes(entry.disposition)) throw new Error(`${where}: disposition erwartet ${LEGACY_DISPOSITIONS.join('|')}`);
  if (!entry.source?.url?.startsWith('https://recht.nrw.de/')) throw new Error(`${where}: source.url erwartet eine RECHT.NRW-Adresse`);
  if (!SHA256.test(entry.source?.sha256 ?? '')) throw new Error(`${where}: source.sha256 ist kein SHA-256`);
  if (!entry.legacy?.parserVersion || !entry.legacy.transformerVersion || !entry.legacy.importStatus) throw new Error(`${where}: legacy.parserVersion, legacy.transformerVersion und legacy.importStatus sind Pflicht`);
  if (!entry.current?.parserVersion) throw new Error(`${where}: current.parserVersion fehlt`);
  if (entry.current.parserVersion === entry.legacy.parserVersion) throw new Error(`${where}: current.parserVersion und legacy.parserVersion sind gleich – keine Legacy-Lage`);
  // Leer ist zulässig: Statuswechsel ohne Fehlerbefund (z. B. not-at-baseline, excluded) tragen nur Info-Befunde.
  if (!Array.isArray(entry.current.findings)) throw new Error(`${where}: current.findings (Fehlercodes des aktuellen Parsers) fehlen`);
  const integrity = entry.textIntegrity;
  if (!integrity?.method?.trim()) throw new Error(`${where}: textIntegrity.method fehlt`);
  if (!SHA256.test(integrity.legacySha256 ?? '') || !SHA256.test(integrity.currentSha256 ?? '')) throw new Error(`${where}: textIntegrity.legacySha256/currentSha256 sind keine SHA-256`);
  if (!Number.isInteger(integrity.legacyChars) || !Number.isInteger(integrity.currentChars) || integrity.legacyChars < 0 || integrity.currentChars < 0) throw new Error(`${where}: textIntegrity.legacyChars/currentChars müssen ganze Zahlen sein`);
  if (typeof integrity.identical !== 'boolean') throw new Error(`${where}: textIntegrity.identical fehlt`);
  if (integrity.identical !== (integrity.legacySha256 === integrity.currentSha256)) throw new Error(`${where}: textIntegrity.identical widerspricht den Hashes`);
  if (entry.disposition === 'deliver-legacy' && !integrity.identical) throw new Error(`${where}: deliver-legacy verlangt identischen Text (textIntegrity.identical)`);
  if (!entry.structuralDefect?.trim()) throw new Error(`${where}: structuralDefect fehlt`);
  if (!entry.reason?.trim()) throw new Error(`${where}: Begründung fehlt`);
  validateApproval(entry, where);
}

export function validateLegacyExceptionRegistry(registry: LegacyExceptionRegistry, path = LEGACY_EXCEPTIONS_PATH): void {
  if (registry.schemaVersion !== LEGACY_EXCEPTIONS_SCHEMA) throw new Error(`${path}: unbekannte Schemaversion ${registry.schemaVersion}`);
  if (!Array.isArray(registry.entries)) throw new Error(`${path}: entries fehlt`);
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const entry of registry.entries) {
    validateLegacyException(entry, path);
    if (ids.has(entry.id)) throw new Error(`${path}: doppelte Kennung ${entry.id}`);
    if (identities.has(entry.sourceIdentity)) throw new Error(`${path}: mehrere Ausnahmen für ${entry.sourceIdentity}`);
    ids.add(entry.id);
    identities.add(entry.sourceIdentity);
  }
}

export function emptyLegacyExceptions(): LegacyExceptionRegistry {
  return { schemaVersion: LEGACY_EXCEPTIONS_SCHEMA, entries: [] };
}

export async function readLegacyExceptions(root: string): Promise<LegacyExceptionRegistry> {
  const registry = await readJsonFile<LegacyExceptionRegistry>(join(root, LEGACY_EXCEPTIONS_PATH));
  if (!registry) return emptyLegacyExceptions();
  validateLegacyExceptionRegistry(registry);
  return registry;
}

export function legacyExceptionFor(registry: LegacyExceptionRegistry, sourceIdentity: string): LegacyException | undefined {
  return registry.entries.find((entry) => entry.sourceIdentity === sourceIdentity);
}

export interface LegacyExceptionMatch {
  applies: boolean;
  /** Gründe, warum die Ausnahme nicht (mehr) greift. */
  mismatches: string[];
}

/**
 * Greift die Ausnahme für diese Lage? Quelle (Hash), gespeicherter Parserstand, aktueller Parserstand und die
 * Fehlercodes des aktuellen Laufs müssen mit der Freigabe übereinstimmen; ein neuer, nicht freigegebener
 * Fehlercode (z. B. Textverlust) hebt die Ausnahme auf.
 */
export function matchLegacyException(exception: LegacyException, situation: { sourceSha256: string; previous: Pick<ManifestEntry, 'parserVersion' | 'transformerVersion' | 'importStatus' | 'targetSlug'>; currentErrorCodes: readonly string[] }): LegacyExceptionMatch {
  const mismatches: string[] = [];
  const parser = currentParserVersion(exception.sourceArea);
  if (exception.approvalStatus === 'rejected' || exception.approvalStatus === 'superseded') mismatches.push(`Freigabestatus ${exception.approvalStatus} – Ausnahme greift nicht`);
  if (exception.source.sha256 !== situation.sourceSha256) mismatches.push(`Quelle geändert (sha256 ${situation.sourceSha256.slice(0, 16)} ≠ freigegeben ${exception.source.sha256.slice(0, 16)})`);
  if (exception.legacy.parserVersion !== situation.previous.parserVersion) mismatches.push(`gespeicherter Parserstand ${situation.previous.parserVersion} ≠ freigegeben ${exception.legacy.parserVersion}`);
  if (exception.legacy.transformerVersion !== situation.previous.transformerVersion) mismatches.push(`gespeicherter Transformerstand ${situation.previous.transformerVersion} ≠ freigegeben ${exception.legacy.transformerVersion}`);
  if (exception.legacy.importStatus !== situation.previous.importStatus) mismatches.push(`gespeicherter Importstatus ${situation.previous.importStatus} ≠ freigegeben ${exception.legacy.importStatus}`);
  if (exception.targetSlug !== situation.previous.targetSlug) mismatches.push(`Ziel-Slug ${situation.previous.targetSlug} ≠ freigegeben ${exception.targetSlug}`);
  if (exception.current.parserVersion !== parser) mismatches.push(`aktueller Parser ${parser} ≠ freigegeben ${exception.current.parserVersion}`);
  const approved = new Set(exception.current.findings);
  const unexpected = [...new Set(situation.currentErrorCodes)].filter((code) => code !== 'import-regression' && !approved.has(code)).sort();
  if (unexpected.length > 0) mismatches.push(`nicht freigegebene Fehlercodes: ${unexpected.join(', ')}`);
  return { applies: mismatches.length === 0, mismatches };
}

/** Ausnahme, deren Manifesteintrag bereits auf dem aktuellen Stand ist (oder fehlt): gegenstandslos. */
export function legacyExceptionObsolete(exception: LegacyException, entry: Pick<ManifestEntry, 'parserVersion' | 'importStatus'> | undefined): boolean {
  if (!entry) return true;
  return entry.parserVersion === currentParserVersion(exception.sourceArea) || entry.importStatus !== exception.legacy.importStatus;
}
