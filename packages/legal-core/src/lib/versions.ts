/**
 * Zeitmodell des Landesrechtsportals.
 *
 * Jede Fassung trägt zwei Zeitachsen:
 *  - `simulationValidFrom`/`simulationValidTo`: Geltung im Simulationsbestand. Die
 *    Ausgangsfassung eines Landes beginnt am Ausgangsrechtsstand (SIMULATION_BASELINE_DATE).
 *  - `sourceValidFrom`/`sourceValidTo`: Geltung der übernommenen realen Quellfassung. Reine
 *    Provenienz; sie entscheidet nie, welche Fassung das Portal als geltend ausweist.
 *
 * Die Fassungsauflösung arbeitet ausschließlich auf der Simulationsachse. Die Klassifikation
 * (geltend/historisch/künftig) ist – wie bei OstRecht – aus Intervall und redaktionellem
 * Stichtag abgeleitet; ein gespeichertes `isCurrent`-Flag gibt es nicht.
 */
import { EDITORIAL_REFERENCE_DATE } from '../config/editorial.ts';
import { SIMULATION_BASELINE_DATE } from '../config/jurisdictions.ts';
import { ContentValidationError, type NormRecord, type NormVersion } from './schema.ts';

export const VERSION_TEMPORAL_KINDS = ['current', 'future', 'historical', 'unknown-effective'] as const;
export type VersionTemporalKind = (typeof VERSION_TEMPORAL_KINDS)[number];

export interface ClassifiedNormVersion {
  version: NormVersion;
  kind: VersionTemporalKind;
}

/** Ein Intervall der Simulationsachse enthält ein Datum. */
export function simulationIntervalContains(version: Pick<NormVersion, 'simulationValidFrom' | 'simulationValidTo'>, date: string): boolean {
  return version.simulationValidFrom <= date && (version.simulationValidTo === null || date <= version.simulationValidTo);
}

export function classifyNormVersion(
  record: Pick<NormRecord, 'meta'>,
  version: NormVersion,
  asOf: string = EDITORIAL_REFERENCE_DATE,
): VersionTemporalKind {
  if (record.meta.status === 'pending-effective') return 'unknown-effective';
  if (version.simulationValidFrom > asOf) return 'future';
  if (record.meta.status === 'repealed' || record.meta.status === 'historical') return 'historical';
  if (version.simulationValidTo !== null && version.simulationValidTo < asOf) return 'historical';
  return 'current';
}

export function classifyNormVersions(record: NormRecord, asOf: string = EDITORIAL_REFERENCE_DATE): ClassifiedNormVersion[] {
  return record.versions.map((version) => ({ version, kind: classifyNormVersion(record, version, asOf) }));
}

/**
 * Fassung, die an einem Datum der Simulationsachse gilt. Liefert `undefined`, wenn das Datum
 * vor der ersten Fassung liegt (etwa vor dem Ausgangsrechtsstand).
 */
export function resolveVersionAt(record: Pick<NormRecord, 'versions'>, date: string): NormVersion | undefined {
  return record.versions.find((version) => simulationIntervalContains(version, date));
}

/**
 * Die am Stichtag maßgebliche Fassung: die geltende; sonst die nächste künftige; sonst eine
 * Fassung mit ungeklärtem Inkrafttreten; sonst die jüngste gespeicherte Fassung.
 */
export function getApplicableVersion(record: NormRecord, asOf: string = EDITORIAL_REFERENCE_DATE): NormVersion {
  const classified = classifyNormVersions(record, asOf);
  const current = classified.find((entry) => entry.kind === 'current')?.version;
  if (current) return current;

  const future = classified
    .filter((entry) => entry.kind === 'future')
    .sort((left, right) => left.version.simulationValidFrom.localeCompare(right.version.simulationValidFrom))[0]?.version;
  if (future) return future;

  const unknown = classified.find((entry) => entry.kind === 'unknown-effective')?.version;
  if (unknown) return unknown;

  const latest = [...record.versions].sort((left, right) => right.simulationValidFrom.localeCompare(left.simulationValidFrom))[0];
  if (latest) return latest;
  throw new ContentValidationError(`${record.meta.jurisdiction}/${record.meta.slug}: enthält keine gespeicherte Fassung`);
}

export function getCurrentVersion(record: NormRecord): NormVersion {
  return getApplicableVersion(record);
}

export function getVersionById(record: Pick<NormRecord, 'versions'>, versionId: string): NormVersion | undefined {
  return record.versions.find((version) => version.versionId === versionId);
}

/** Die Ausgangsfassung des Simulationsbestands: beginnt am Ausgangsrechtsstand. */
export function getBaselineVersion(record: Pick<NormRecord, 'versions' | 'history'>): NormVersion | undefined {
  if (record.history.initialVersionId) {
    const initial = record.versions.find((version) => version.versionId === record.history.initialVersionId);
    if (initial) return initial;
  }
  return record.versions.find((version) => version.simulationValidFrom === SIMULATION_BASELINE_DATE);
}

/**
 * Prüft die Baseline-Regel: Die erste Fassung einer Norm im Simulationsbestand darf nicht
 * vor dem Ausgangsrechtsstand beginnen. Eigene, später erlassene Vorschriften der Simulation
 * dürfen später beginnen.
 */
export function assertBaselineConsistency(record: NormRecord): void {
  const first = record.versions[0];
  if (!first) return;
  if (first.simulationValidFrom < SIMULATION_BASELINE_DATE) {
    throw new ContentValidationError(
      `${record.meta.jurisdiction}/${record.meta.slug}/versions/${first.versionId}.json: simulationValidFrom ${first.simulationValidFrom} liegt vor dem Ausgangsrechtsstand ${SIMULATION_BASELINE_DATE}`,
    );
  }
}

export const LEGAL_CHANGE_ENTRY_TYPES = ['initial', 'amendment', 'repeal'] as const;

function latestDateUpTo(dates: Array<string | null | undefined>, asOf: string): string | null {
  const known = dates.filter((date): date is string => typeof date === 'string' && date !== '' && date <= asOf);
  return known.length > 0 ? (known.sort().at(-1) ?? null) : null;
}

/** Jüngste Rechtsänderung bis zum Stichtag (Fassungsbeginne und rechtsstandsrelevante Historieneinträge). */
export function getNormLastChangeDate(record: Pick<NormRecord, 'versions' | 'history'>, asOf: string = EDITORIAL_REFERENCE_DATE): string | null {
  return latestDateUpTo(
    [
      ...record.versions.map((version) => version.simulationValidFrom),
      ...record.history.entries
        .filter((entry) => (LEGAL_CHANGE_ENTRY_TYPES as readonly string[]).includes(entry.type))
        .map((entry) => entry.date),
    ],
    asOf,
  );
}

/** Jüngstes dokumentiertes Ereignis (auch Hinweise) bis zum Stichtag, z. B. für Sitemap-lastmod. */
export function getNormLastActivityDate(record: Pick<NormRecord, 'versions' | 'history'>, asOf: string = EDITORIAL_REFERENCE_DATE): string | null {
  return latestDateUpTo(
    [...record.versions.map((version) => version.simulationValidFrom), ...record.history.entries.map((entry) => entry.date)],
    asOf,
  );
}
