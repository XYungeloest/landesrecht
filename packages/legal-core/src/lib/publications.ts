/**
 * Verkündungsblatt-Ausgaben (`Publication`, content/publications/<jurisdiction>/<slug>.json): Kurzzitat,
 * Reihenfolge, Ausgabenummer, Seitenangabe eines Eintrags und der Bezug einer Fassung auf ihre Verkündung
 * (`SourceReference.publicationSlug`). Keine Adressen – die bildet `routes.ts`; Projektion, Store, Oberfläche
 * und API lesen hier, damit dieselbe Sache überall gleich heißt (Muster aus OstRecht, `publications.ts`).
 */
import { formatDate } from './display.ts';
import type { NormVersion, Publication, PublicationEntry, SourceReference } from './schema.ts';

/**
 * Trägt die Ausgabe eine Nummer (Ziffern, römische Zahlen, Spannen wie „1–7“)? Nur dann ist das Kurzzitat
 * „Blatt Jahr Nr. N“ richtig; sonst wird die Ausgabe über ihr Datum bezeichnet.
 */
export function hasNumberedIssue(publication: Pick<Publication, 'issue'>): boolean {
  return /^[\dIVXLC]+(?:[\s./–-][\dIVXLC]+)*$/u.test(publication.issue.trim());
}

/** Kurzzitat: „GV. West 2026 Nr. 2“ bzw. bei Ausgaben ohne Nummer „GV. West vom 17. Mai 2026“. */
export function getPublicationLabel(publication: Pick<Publication, 'gazette' | 'year' | 'issue' | 'date'>): string {
  return hasNumberedIssue(publication) ? `${publication.gazette} ${publication.year} Nr. ${publication.issue.trim()}` : `${publication.gazette} vom ${formatDate(publication.date)}`;
}

function compareIssues(left: string, right: string): number {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return left.localeCompare(right, 'de', { numeric: true });
}

/** Jüngste Ausgabe zuerst; bei gleichem Datum nach Blatt, dann höhere Nummer zuerst, zuletzt Slug (stabil). */
export function comparePublicationsNewestFirst(left: Pick<Publication, 'date' | 'gazette' | 'issue' | 'slug'>, right: Pick<Publication, 'date' | 'gazette' | 'issue' | 'slug'>): number {
  if (left.date !== right.date) return right.date.localeCompare(left.date);
  if (left.gazette !== right.gazette) return left.gazette.localeCompare(right.gazette, 'de');
  return compareIssues(right.issue, left.issue) || left.slug.localeCompare(right.slug);
}

/** Seitenangabe eines Eintrags wie gedruckt („S. 3–9“, sonst „S. 3“); `undefined`, wenn keine vorliegt. */
export function publicationEntryPages(entry: Pick<PublicationEntry, 'pages' | 'startPage'>): string | undefined {
  if (entry.pages) return `S. ${entry.pages}`;
  if (entry.startPage !== undefined) return `S. ${entry.startPage}`;
  return undefined;
}

/** Slug der Verkündung, auf die eine Quellenreferenz verweist (`publicationSlug`), sofern gesetzt. */
export function sourcePublicationSlug(source: Pick<SourceReference, 'publicationSlug'>): string | undefined {
  return source.publicationSlug;
}

/** Erste Verkündung, die eine Fassung über ihre Quellenreferenzen nennt. */
export function versionPublicationSlug(version: Pick<NormVersion, 'sourceReferences'>): string | undefined {
  for (const source of version.sourceReferences ?? []) {
    const slug = sourcePublicationSlug(source);
    if (slug) return slug;
  }
  return undefined;
}

/** Verkündung je Fassung einer Norm (`versionId` → `publicationSlug`), nur für Fassungen mit bekanntem Bezug. */
export function publicationSlugsByVersion(versions: readonly Pick<NormVersion, 'versionId' | 'sourceReferences'>[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const version of versions) {
    const slug = versionPublicationSlug(version);
    if (slug) result.set(version.versionId, slug);
  }
  return result;
}

/** Blattreihen einer Ausgabenliste: Kürzel, Titel wie gedruckt, Anzahl und Jahrgänge (aus den Daten, keine feste Liste). */
export interface PublicationSeries {
  gazette: string;
  seriesTitle?: string;
  regime?: string;
  count: number;
  years: string;
}

export function summarizePublicationSeries(publications: readonly Publication[]): PublicationSeries[] {
  const byGazette = new Map<string, Publication[]>();
  for (const publication of publications) byGazette.set(publication.gazette, [...(byGazette.get(publication.gazette) ?? []), publication]);
  return [...byGazette.entries()].sort(([left], [right]) => left.localeCompare(right, 'de')).map(([gazette, issues]) => {
    const years = [...new Set(issues.map((issue) => issue.year))].sort((left, right) => left - right);
    const series: PublicationSeries = { gazette, count: issues.length, years: years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? '') };
    const seriesTitle = issues.find((issue) => issue.seriesTitle)?.seriesTitle;
    const regime = issues.find((issue) => issue.regime)?.regime;
    if (seriesTitle) series.seriesTitle = seriesTitle;
    if (regime) series.regime = regime;
    return series;
  });
}
