import type { NormRecord, NormVersion } from './schema.ts';

export interface NormVersionIdentity {
  title: string;
  shortTitle: string;
  abbr?: string;
  summary?: string;
  summarySource?: 'derived' | 'editorial';
}

/** Öffentliche Bezeichnung einer konkreten Fassung mit Rückfall auf meta.json (wie OstRecht). */
export function getNormVersionIdentity(
  norm: Pick<NormRecord, 'meta'>,
  version: Pick<NormVersion, 'title' | 'shortTitle' | 'abbr' | 'summary'>,
): NormVersionIdentity {
  const identity: NormVersionIdentity = {
    title: version.title ?? norm.meta.title,
    shortTitle: version.shortTitle ?? version.title ?? norm.meta.shortTitle ?? norm.meta.title,
  };
  const abbr = version.abbr ?? norm.meta.abbr;
  if (abbr !== undefined) identity.abbr = abbr;
  const summary = version.summary ?? norm.meta.summary;
  if (summary !== undefined) identity.summary = summary;
  if (version.summary === undefined && norm.meta.summarySource !== undefined) identity.summarySource = norm.meta.summarySource;
  return identity;
}

/** Eine deterministisch abgeleitete Zusammenfassung wird nie öffentlich gerendert. */
export function getPublicNormSummary(identity: Pick<NormVersionIdentity, 'summary' | 'summarySource'>): string | undefined {
  if (identity.summarySource === 'derived') return undefined;
  const summary = identity.summary?.trim();
  return summary ? summary : undefined;
}

/** Alle historischen Bezeichnungen anderer Fassungen, die nicht mehr die aktuellen sind. */
export function getNormAliases(record: NormRecord, current: NormVersionIdentity): string[] {
  const aliases = new Set<string>();
  for (const version of record.versions) {
    const identity = getNormVersionIdentity(record, version);
    for (const value of [identity.title, identity.shortTitle, identity.abbr]) {
      if (value && value !== current.title && value !== current.shortTitle && value !== current.abbr) aliases.add(value);
    }
  }
  return [...aliases];
}

/** Sortierschlüssel ohne Umlaut- und ß-Abhängigkeit (SQLite sortiert binär). */
export function getNormSortKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ä/Ö/Ü wie A/O/U; nichtalphabetische Anfänge unter „#“. */
export function getIndexLetter(value: string): string {
  const letter = value.trim().charAt(0).toLocaleUpperCase('de-DE');
  const folded = ({ Ä: 'A', Ö: 'O', Ü: 'U' } as Record<string, string>)[letter] ?? letter;
  return /[A-Z]/u.test(folded) ? folded : '#';
}
