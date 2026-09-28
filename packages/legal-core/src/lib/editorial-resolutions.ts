/**
 * Redaktionelle Auflösungen (`meta.editorialResolutions`): additive, datierte Entscheidungen über nichtnormative
 * Metadaten, die gespeicherte Einträge nicht umschreiben. Zwei Arten werden in der Oberfläche ausgewertet:
 *
 *   - `superseded-technical-note`: eine frühere technische Notiz an einer Beziehung (`relation.type` + Ziel-Slug,
 *     `supersededNote` = exakter bisheriger Wortlaut) ist überholt; angezeigt wird `statement`, die alte Notiz nur als
 *     überholt gekennzeichnet. Die Beziehung selbst und der Normtext bleiben unverändert.
 *   - `source-status`: Quellenlage der Norm (z. B. Verkündung nur mittelbar amtlich belegt, Originalblatt fehlt).
 *
 * Übrige Einträge (quellgetreu übernommene Konfliktentscheidungen) bleiben unverändert und werden nicht ausgewertet.
 */
import type { NormMeta, NormRelation } from './schema.ts';

export const SUPERSEDED_TECHNICAL_NOTE = 'superseded-technical-note';
export const SOURCE_STATUS_RESOLUTION = 'source-status';

export interface ResolvedRelationNote {
  /** Anzuzeigende Notiz (aktuell). */
  note?: string;
  /** Überholte technische Notiz, falls eine Auflösung greift. */
  superseded?: { note: string; date?: string; decision?: string };
}

type Resolution = NonNullable<NormMeta['editorialResolutions']>[number];

function supersedes(resolution: Resolution, relation: NormRelation): boolean {
  if (resolution.kind !== SUPERSEDED_TECHNICAL_NOTE) return false;
  const target = resolution.relation as { type?: unknown; target?: unknown } | undefined;
  return target?.type === relation.type && target?.target === relation.target.slug && resolution.supersededNote === relation.note;
}

/** Notiz einer Beziehung unter Berücksichtigung überholter technischer Notizen. */
export function resolveRelationNote(meta: Pick<NormMeta, 'editorialResolutions'>, relation: NormRelation): ResolvedRelationNote {
  const resolution = (meta.editorialResolutions ?? []).find((entry) => supersedes(entry, relation));
  if (!resolution || typeof resolution.statement !== 'string') return relation.note ? { note: relation.note } : {};
  return {
    note: resolution.statement,
    superseded: { note: relation.note!, ...(typeof resolution.date === 'string' ? { date: resolution.date } : {}), ...(typeof resolution.decision === 'string' ? { decision: resolution.decision } : {}) },
  };
}

/** Hinweise zur Quellenlage (`source-status`) mit Aussage und Datum. */
export function sourceStatusResolutions(meta: Pick<NormMeta, 'editorialResolutions'>): Array<{ id: string; statement: string; date?: string }> {
  return (meta.editorialResolutions ?? [])
    .filter((entry) => entry.kind === SOURCE_STATUS_RESOLUTION && typeof entry.statement === 'string')
    .map((entry) => ({ id: entry.id, statement: entry.statement as string, ...(typeof entry.date === 'string' ? { date: entry.date } : {}) }));
}
