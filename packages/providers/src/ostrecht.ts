/**
 * OstRecht-Adapter: übersetzt Datensätze des bestehenden Rechtsportals OstRecht
 * (`content/normen/<slug>/{meta.json,history.json,versions/*.json}` im Repository
 * `staatsregierung`) verlustfrei in das kanonische Modell dieses Portals.
 *
 * OstRecht bleibt fachliche Source of Truth für den Freistaat Ostdeutschland; dieses Portal
 * pflegt ostdeutsche Normen nicht selbst. Der Adapter ist reine Übersetzung:
 *  - `validFrom`/`validTo` → `simulationValidFrom`/`simulationValidTo`
 *  - `sourceValidFrom`/`sourceValidTo` der REVOSax-Quelle → Quellachse der Fassung
 *  - `revosax-snapshot` + `lawId` → generische Quelle (system `revosax`) + ExternalIdentifier
 *  - `predecessorSlug`/`successorSlug`/`affectedNorms`/… → typisierte NormRelation
 *  - Body-Blöcke unverändert (Obermenge der Struktur)
 *
 * Die OstRecht-Quelldateien sind hier nur als Rohobjekte typisiert; das Repository von OstRecht
 * wird nicht importiert.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import {
  parseNormHistory,
  parseNormMeta,
  parseNormVersion,
  validateNormRecord,
  type ExternalIdentifier,
  type NormRecord,
  type NormRelation,
  type NormRelationType,
  type SourceReference,
} from '@landesrecht/legal-core/lib/schema.ts';

export const OSTRECHT_SYSTEM = 'ostrecht';
export const OSTRECHT_TARGET_JURISDICTION: JurisdictionId = 'ost';

export interface OstRechtRawRecord {
  meta: Record<string, unknown>;
  history: Record<string, unknown>;
  versions: Array<Record<string, unknown>>;
}

const OSTRECHT_SOURCE_KIND_MAP: Record<string, { kind: SourceReference['kind']; system?: string }> = {
  'revosax-snapshot': { kind: 'official-portal-snapshot', system: 'revosax' },
  'structured-html-transcription': { kind: 'structured-transcription', system: 'ostrecht' },
  'legacy-markdown-transcription': { kind: 'structured-transcription', system: 'ostrecht' },
  'supplementary-markdown-transcription': { kind: 'structured-transcription', system: 'ostrecht' },
  'structured-docx-source': { kind: 'structured-transcription', system: 'ostrecht' },
  'amendment-source': { kind: 'amendment-source', system: 'ostrecht' },
  'primary-pdf': { kind: 'primary-pdf', system: 'ostrecht' },
};

const OSTRECHT_STATUS_MAP: Record<string, string> = {
  'in-force': 'in-force',
  published: 'in-force',
  repealed: 'repealed',
  aufgehoben: 'repealed',
  planned: 'planned',
  draft: 'planned',
  'future-effective': 'future-effective',
  'pending-effective': 'pending-effective',
  historical: 'historical',
  'one-time-act': 'one-time-act',
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Übersetzt eine OstRecht-Quellenreferenz; die REVOSax-lawId wird zur externalId. */
export function adaptOstRechtSource(raw: Record<string, unknown>): { source: Record<string, unknown>; lawId?: string } {
  const kind = asString(raw.kind) ?? '';
  const mapped = OSTRECHT_SOURCE_KIND_MAP[kind] ?? { kind: 'provider-record', system: 'ostrecht' };
  const availability = raw.availability === 'r2-archived' ? 'r2-archived' : 'versioned';
  const source: Record<string, unknown> = {
    kind: mapped.kind,
    system: mapped.system,
    label: raw.label,
    availability,
  };
  // Eine versionierte OstRecht-Datei ist für dieses Portal eine externe Quelle: Pfad und Hash
  // dokumentieren die Provenienz im OstRecht-Repository, ohne die Datei hier zu erwarten.
  if (availability === 'versioned') {
    source.availability = 'external';
    source.url = asString(raw.url) ?? `ostrecht:${asString(raw.localSource) ?? 'unbekannt'}`;
    if (raw.localSource !== undefined) source.note = `OstRecht-Repository: ${String(raw.localSource)}`;
  } else {
    source.objectKey = raw.objectKey;
    source.url = raw.url;
    if (raw.bucket !== undefined) source.bucket = raw.bucket;
  }
  for (const key of ['retrievedAt', 'sha256', 'sourceValidFrom', 'sourceValidTo', 'mediaType', 'pageCount', 'pageRange', 'verifiedAt', 'sourceRole', 'derivedSource'] as const) {
    if (raw[key] !== undefined) source[key] = raw[key];
  }
  const lawId = asString(raw.lawId);
  if (lawId) source.externalId = lawId;
  if (raw.fsnNumber !== undefined) source.sourceNumber = raw.fsnNumber;
  const result: { source: Record<string, unknown>; lawId?: string } = { source };
  if (lawId) result.lawId = lawId;
  return result;
}

function relation(type: NormRelationType, slug: string, note?: string): NormRelation {
  const entry: NormRelation = { type, target: { slug } };
  if (note) entry.note = note;
  return entry;
}

/** Baut die kanonische meta.json aus einer OstRecht-meta.json. */
export function adaptOstRechtMeta(raw: Record<string, unknown>): { meta: Record<string, unknown>; sourceValidity: { from?: string; to?: string } } {
  const sources: Record<string, unknown>[] = [];
  const externalIdentifiers: ExternalIdentifier[] = [{ system: OSTRECHT_SYSTEM, value: String(raw.slug) }];
  const sourceValidity: { from?: string; to?: string } = {};
  for (const entry of Array.isArray(raw.sourceReferences) ? raw.sourceReferences : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { source, lawId } = adaptOstRechtSource(entry as Record<string, unknown>);
    sources.push(source);
    if (lawId && !externalIdentifiers.some((identifier) => identifier.system === 'revosax')) {
      externalIdentifiers.push({ system: 'revosax', value: lawId, url: `https://www.revosax.sachsen.de/vorschrift/${lawId}` });
    }
    if (source.kind === 'official-portal-snapshot') {
      if (typeof source.sourceValidFrom === 'string') sourceValidity.from = source.sourceValidFrom;
      if (typeof source.sourceValidTo === 'string') sourceValidity.to = source.sourceValidTo;
    }
  }

  const relations: NormRelation[] = [];
  const predecessorSlug = asString(raw.predecessorSlug);
  const successorSlug = asString(raw.successorSlug);
  if (asString(raw.enactingNorm)) relations.push(relation('part-of', asString(raw.enactingNorm)!, 'erlassen durch'));
  if (asString(raw.enactedNorm)) relations.push(relation('contains', asString(raw.enactedNorm)!, 'erlässt'));
  for (const slug of asStringArray(raw.enactedNorms)) relations.push(relation('contains', slug, 'erlässt'));
  if (asString(raw.containedIn)) relations.push(relation('part-of', asString(raw.containedIn)!, 'Bestandteil der Mantelvorschrift'));
  for (const slug of asStringArray(raw.affectedNorms)) relations.push(relation('amends', slug));
  for (const slug of asStringArray(raw.affectedByNorms)) relations.push(relation('amended-by', slug));
  for (const slug of asStringArray(raw.relatedNorms)) relations.push(relation('related', slug));

  const meta: Record<string, unknown> = {
    id: `${OSTRECHT_TARGET_JURISDICTION}:${String(raw.slug)}`,
    slug: raw.slug,
    jurisdiction: OSTRECHT_TARGET_JURISDICTION,
    title: raw.title,
    shortTitle: raw.shortTitle,
    abbr: raw.abbr,
    shortTitleSource: raw.shortTitleSource,
    type: raw.type,
    status: OSTRECHT_STATUS_MAP[String(raw.status).toLowerCase()] ?? raw.status,
    enactingBody: raw.enactingBody,
    originEnactingBody: raw.originEnactingBody,
    responsibleBody: raw.responsibleMinistry ?? raw.ministry,
    subjects: raw.subjects ?? [],
    primarySubject: raw.primarySubject,
    keywords: raw.keywords ?? [],
    initialCitation: raw.initialCitation,
    summary: raw.summary,
    summarySource: raw.summarySource,
    documentDate: raw.documentDate,
    publicationDate: raw.publicationDate,
    effectiveDate: raw.effectiveDate,
    expiryDate: raw.expiryDate,
    dateNote: raw.dateNote,
    predecessor: raw.predecessor ?? null,
    successor: raw.successor ?? null,
    relations,
    externalIdentifiers,
    sourceReferences: sources,
  };
  if (predecessorSlug) meta.predecessorTarget = { slug: predecessorSlug };
  if (successorSlug) meta.successorTarget = { slug: successorSlug };
  for (const key of Object.keys(meta)) if (meta[key] === undefined) delete meta[key];
  return { meta, sourceValidity };
}

/** Baut eine kanonische Fassung aus einer OstRecht-Fassung (validFrom/validTo → Simulationsachse). */
export function adaptOstRechtVersion(raw: Record<string, unknown>, fallbackSourceValidity: { from?: string; to?: string } = {}): Record<string, unknown> {
  const version: Record<string, unknown> = {
    versionId: raw.versionId,
    simulationValidFrom: raw.validFrom,
    simulationValidTo: raw.validTo ?? null,
    title: raw.title,
    shortTitle: raw.shortTitle,
    abbr: raw.abbr,
    summary: raw.summary,
    citation: raw.citation,
    changeNote: raw.changeNote,
    sourceNotes: raw.sourceNotes,
    body: raw.body,
  };
  const sources: Record<string, unknown>[] = [];
  let sourceValidFrom: string | undefined;
  let sourceValidTo: string | undefined;
  for (const entry of Array.isArray(raw.sourceReferences) ? raw.sourceReferences : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { source } = adaptOstRechtSource(entry as Record<string, unknown>);
    sources.push(source);
    if (source.kind === 'official-portal-snapshot') {
      if (typeof source.sourceValidFrom === 'string') sourceValidFrom ??= source.sourceValidFrom;
      if (typeof source.sourceValidTo === 'string') sourceValidTo ??= source.sourceValidTo;
    }
  }
  if (sources.length > 0) version.sourceReferences = sources;
  const from = sourceValidFrom ?? (sources.length === 0 ? fallbackSourceValidity.from : undefined);
  const to = sourceValidTo ?? (sources.length === 0 ? fallbackSourceValidity.to : undefined);
  if (from) version.sourceValidFrom = from;
  if (to) version.sourceValidTo = to;
  for (const key of Object.keys(version)) if (version[key] === undefined) delete version[key];
  return version;
}

export function adaptOstRechtHistory(raw: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return {
    initialVersionId: raw.initialVersionId ?? null,
    entries: entries.map((entry) => {
      const item = entry as Record<string, unknown>;
      const result: Record<string, unknown> = { date: item.date, type: item.type, title: item.title, citation: item.citation };
      if (item.note !== undefined) result.note = item.note;
      if (item.affectingVersionId !== undefined) result.affectingVersionId = item.affectingVersionId;
      if (typeof item.relatedNorm === 'string') result.relatedNorm = { slug: item.relatedNorm };
      else if (item.relatedNorm === null) result.relatedNorm = null;
      return result;
    }),
  };
}

/** Vollständige Übersetzung eines OstRecht-Datensatzes in einen validierten NormRecord. */
export function adaptOstRechtRecord(raw: OstRechtRawRecord): NormRecord {
  const slug = String(raw.meta.slug);
  const { meta, sourceValidity } = adaptOstRechtMeta(raw.meta);
  const context = `ostrecht/${slug}`;
  const record: NormRecord = {
    meta: parseNormMeta(meta, `${context}/meta.json`),
    history: parseNormHistory(adaptOstRechtHistory(raw.history), `${context}/history.json`),
    versions: raw.versions.map((version) => parseNormVersion(adaptOstRechtVersion(version, sourceValidity), `${context}/versions/${String(version.versionId)}.json`)),
  };
  return validateNormRecord(record, context);
}
