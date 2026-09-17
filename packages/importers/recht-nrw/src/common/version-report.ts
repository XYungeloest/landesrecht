/**
 * Parser-/Transformer-Versionsreport des Importbestands: je Quellbereich und Importstatus, wie viele
 * Manifesteinträge auf dem aktuellen Stand sind und wie viele auf einem älteren – und ob ein Altstand durch
 * eine dokumentierte Legacy-Ausnahme (`legacy-exceptions.ts`) begründet ist.
 *
 * Regel für die Readiness (von `readiness.ts` eingebunden):
 *   unbegründete Altstände → Blocker (NOT READY, Regeneration bzw. Entscheidung nötig)
 *   begründete Ausnahmen  → Hinweis (READY mit Vermerk)
 *   gegenstandslose Ausnahmen (Eintrag bereits aktuell oder verschwunden) → Hinweis (Datei bereinigen)
 */
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { legacyExceptionObsolete, readLegacyExceptions, type LegacyException, type LegacyExceptionRegistry } from './legacy-exceptions.ts';
import { IMPORT_STATUSES, readManifest, SOURCE_AREAS, type ImportManifest, type ImportStatus, type ManifestEntry, type SourceArea } from './manifest.ts';
import { currentParserVersion, isStaleEntry, regenerationCommand, staleReasons } from './staleness.ts';

export const VERSION_REPORT_SCHEMA = 'recht-nrw-version-report/1' as const;

export interface VersionStatusCounts {
  entries: number;
  current: number;
  outdated: number;
  /** Ältere Versionsstände („<parser> · <transformer>“) mit Anzahl. */
  outdatedVersions: Record<string, number>;
}

export interface OutdatedEntry {
  sourceIdentity: string;
  importStatus: ImportStatus;
  targetSlug: string;
  parserVersion: string;
  transformerVersion: string;
  reasons: string[];
  /** Bei begründeten Altständen: die geltende Ausnahme. */
  exception?: { id: string; disposition: LegacyException['disposition']; approvedAt: string; approvedBy: string };
  /** Bei unbegründeten Altständen: warum keine Ausnahme greift und was zu tun ist. */
  problem?: string;
}

export interface AreaVersionReport {
  area: SourceArea;
  currentParserVersion: string;
  currentTransformerVersion: string;
  entries: number;
  byStatus: Partial<Record<ImportStatus, VersionStatusCounts>>;
  outdated: { total: number; justified: OutdatedEntry[]; unjustified: OutdatedEntry[] };
  /** Ausnahmen ohne veralteten Eintrag (bereits regeneriert, depubliziert oder Eintrag fehlt). */
  obsoleteExceptions: string[];
  regenerationCommand?: string;
}

export interface VersionReport {
  schemaVersion: typeof VERSION_REPORT_SCHEMA;
  generatedAt: string;
  areas: Record<SourceArea, AreaVersionReport>;
  /** Unbegründete Altstände: NOT READY. */
  blockers: string[];
  /** Begründete und gegenstandslose Ausnahmen. */
  notices: string[];
  ready: boolean;
}

function versionKey(entry: Pick<ManifestEntry, 'parserVersion' | 'transformerVersion'>): string {
  return `${entry.parserVersion} · ${entry.transformerVersion}`;
}

/**
 * Begründet ist ein Altstand nur durch eine `deliver-legacy`-Ausnahme, die genau diesen Eintrag beschreibt
 * (Quelle, gespeicherter Stand, Ziel-Slug) und für den aktuellen Parser freigegeben wurde. Eine
 * `depublish`-Ausnahme begründet keinen Altstand: sie verlangt die Ausführung der Depublikation.
 */
export function justifyOutdatedEntry(entry: ManifestEntry, exception: LegacyException | undefined): { exception?: OutdatedEntry['exception']; problem?: string } {
  const regenerate = `Regeneration: ${regenerationCommand(entry.sourceArea)}`;
  if (!exception) return { problem: `keine Legacy-Ausnahme dokumentiert (${regenerate}; bleibt import-regression: Ausnahme in data/imports/recht-nrw/legacy-exceptions.json)` };
  const mismatches: string[] = [];
  if (exception.source.sha256 !== entry.sha256) mismatches.push('Quellhash weicht ab');
  if (exception.legacy.parserVersion !== entry.parserVersion) mismatches.push(`gespeicherter Parserstand ${entry.parserVersion} ≠ freigegeben ${exception.legacy.parserVersion}`);
  if (exception.legacy.transformerVersion !== entry.transformerVersion) mismatches.push(`gespeicherter Transformerstand ${entry.transformerVersion} ≠ freigegeben ${exception.legacy.transformerVersion}`);
  if (exception.legacy.importStatus !== entry.importStatus) mismatches.push(`Importstatus ${entry.importStatus} ≠ freigegeben ${exception.legacy.importStatus}`);
  if (exception.targetSlug !== entry.targetSlug) mismatches.push(`Ziel-Slug ${entry.targetSlug} ≠ freigegeben ${exception.targetSlug}`);
  if (exception.current.parserVersion !== currentParserVersion(entry.sourceArea)) mismatches.push(`Ausnahme für Parser ${exception.current.parserVersion} freigegeben, aktuell ${currentParserVersion(entry.sourceArea)}`);
  if (mismatches.length > 0) return { problem: `Legacy-Ausnahme ${exception.id} greift nicht: ${mismatches.join('; ')}` };
  if (exception.disposition === 'depublish') return { problem: `Depublikation laut Legacy-Ausnahme ${exception.id} freigegeben, aber noch nicht ausgeführt: npm run import:recht-nrw:bulk -- --area ${entry.sourceArea} --only ${entry.sourceIdentity} --offline --write` };
  return { exception: { id: exception.id, disposition: exception.disposition, approvedAt: exception.approvedAt, approvedBy: exception.approvedBy } };
}

export function computeVersionReport(input: { manifest: ImportManifest; exceptions: LegacyExceptionRegistry; generatedAt: string }): VersionReport {
  const areas = {} as Record<SourceArea, AreaVersionReport>;
  const blockers: string[] = [];
  const notices: string[] = [];
  const exceptionsByIdentity = new Map(input.exceptions.entries.map((exception) => [exception.sourceIdentity, exception]));
  for (const area of SOURCE_AREAS) {
    const entries = input.manifest.entries.filter((entry) => entry.sourceArea === area);
    const byStatus: AreaVersionReport['byStatus'] = {};
    const justified: OutdatedEntry[] = [];
    const unjustified: OutdatedEntry[] = [];
    for (const status of IMPORT_STATUSES) {
      const ofStatus = entries.filter((entry) => entry.importStatus === status);
      if (ofStatus.length === 0) continue;
      const counts: VersionStatusCounts = { entries: ofStatus.length, current: 0, outdated: 0, outdatedVersions: {} };
      for (const entry of ofStatus) {
        if (!isStaleEntry(entry)) {
          counts.current += 1;
          continue;
        }
        counts.outdated += 1;
        const key = versionKey(entry);
        counts.outdatedVersions[key] = (counts.outdatedVersions[key] ?? 0) + 1;
        const outdated: OutdatedEntry = { sourceIdentity: entry.sourceIdentity, importStatus: entry.importStatus, targetSlug: entry.targetSlug, parserVersion: entry.parserVersion, transformerVersion: entry.transformerVersion, reasons: staleReasons(entry) };
        const justification = justifyOutdatedEntry(entry, exceptionsByIdentity.get(entry.sourceIdentity));
        if (justification.exception) {
          outdated.exception = justification.exception;
          justified.push(outdated);
        } else {
          outdated.problem = justification.problem ?? 'unbegründet';
          unjustified.push(outdated);
        }
      }
      byStatus[status] = counts;
    }
    const obsoleteExceptions = input.exceptions.entries
      .filter((exception) => exception.sourceArea === area && legacyExceptionObsolete(exception, entries.find((entry) => entry.sourceIdentity === exception.sourceIdentity)))
      .map((exception) => exception.id)
      .sort();
    const report: AreaVersionReport = { area, currentParserVersion: currentParserVersion(area), currentTransformerVersion: TRANSFORMER_VERSION, entries: entries.length, byStatus, outdated: { total: justified.length + unjustified.length, justified, unjustified }, obsoleteExceptions };
    if (report.outdated.total > 0) report.regenerationCommand = regenerationCommand(area);
    areas[area] = report;
    if (unjustified.length > 0) {
      const byProblem = new Map<string, string[]>();
      for (const entry of unjustified) byProblem.set(entry.problem!, [...(byProblem.get(entry.problem!) ?? []), entry.sourceIdentity]);
      const statuses = [...new Set(unjustified.map((entry) => entry.importStatus))].sort().join(', ');
      const preview = unjustified.slice(0, 8).map((entry) => `${entry.sourceIdentity} (${entry.importStatus}, ${entry.parserVersion})`).join(', ');
      blockers.push(`${area.toUpperCase()}: ${unjustified.length} Einträge mit veralteter Parser-/Transformerversion ohne dokumentierte Legacy-Ausnahme (Status ${statuses}; ${preview}${unjustified.length > 8 ? ', …' : ''}) – ${regenerationCommand(area)}${byProblem.size === 1 && !unjustified[0]!.problem!.startsWith('keine Legacy-Ausnahme') ? `; ${unjustified[0]!.problem}` : ''}`);
    }
    if (justified.length > 0) notices.push(`${area.toUpperCase()}: ${justified.length} begründete Legacy-Ausnahme(n) mit älterem Parserstand (${justified.map((entry) => `${entry.sourceIdentity} → ${entry.exception!.id}`).join(', ')})`);
    if (obsoleteExceptions.length > 0) notices.push(`${area.toUpperCase()}: ${obsoleteExceptions.length} gegenstandslose Legacy-Ausnahme(n), Eintrag bereits aktuell oder ohne Manifesteintrag (${obsoleteExceptions.join(', ')}) – aus legacy-exceptions.json entfernen`);
  }
  return { schemaVersion: VERSION_REPORT_SCHEMA, generatedAt: input.generatedAt, areas, blockers, notices, ready: blockers.length === 0 };
}

/** Liest Manifest und Legacy-Ausnahmen und berechnet den Report (eine ungültige Ausnahmedatei ist ein harter Fehler). */
export async function collectVersionReport(root: string, options: { manifest?: ImportManifest; generatedAt?: string } = {}): Promise<VersionReport> {
  const manifest = options.manifest ?? (await readManifest(root));
  const exceptions = await readLegacyExceptions(root);
  return computeVersionReport({ manifest, exceptions, generatedAt: options.generatedAt ?? new Date().toISOString() });
}

/** Textzeilen für CLI-Ausgaben (audit, readiness). */
export function renderVersionReportLines(report: VersionReport): string[] {
  const lines: string[] = [];
  for (const area of SOURCE_AREAS) {
    const item = report.areas[area];
    lines.push(`${area.toUpperCase()}: Parser ${item.currentParserVersion}, Transformer ${item.currentTransformerVersion} · ${item.entries} Einträge, ${item.outdated.total} veraltet (${item.outdated.justified.length} begründet, ${item.outdated.unjustified.length} unbegründet)`);
    for (const status of IMPORT_STATUSES) {
      const counts = item.byStatus[status];
      if (!counts) continue;
      const older = Object.entries(counts.outdatedVersions).sort(([left], [right]) => (left < right ? -1 : 1)).map(([key, count]) => `${count}× ${key}`).join(', ');
      lines.push(`  ${status.padEnd(22)} aktuell ${String(counts.current).padStart(5)}   älter ${String(counts.outdated).padStart(5)}${older ? `   (${older})` : ''}`);
    }
  }
  for (const notice of report.notices) lines.push(`  Hinweis: ${notice}`);
  for (const blocker of report.blockers) lines.push(`  ! ${blocker}`);
  return lines;
}
