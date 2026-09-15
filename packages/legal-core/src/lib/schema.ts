/**
 * Kanonisches Normdatenmodell des Landesrechtsportals.
 *
 * Verallgemeinert das bewährte OstRecht-Modell (`packages/shared/src/lib/norms/schema.ts` in
 * `../staatsregierung`) um die Jurisdiktion, generische externe Identifikatoren, generische
 * Quellenreferenzen, typisierte Normbeziehungen und das zweiachsige Zeitmodell
 * (Simulationsgültigkeit vs. Gültigkeit der realen Quellfassung). Die Body-Block-Struktur ist
 * eine Obermenge der OstRecht-Struktur, damit OstRecht-Fassungen ohne Informationsverlust
 * übernommen werden können (docs/OSTRECHT_COMPATIBILITY.md).
 *
 * Alle Parser sind fail-closed: unbekannte Typen, fehlende Pflichtfelder oder inkonsistente
 * Strukturen werfen eine ContentValidationError mit Pfadangabe.
 */
import { isJurisdictionId, JURISDICTION_IDS, type JurisdictionId } from '../config/jurisdictions.ts';

export const NORM_TYPES = [
  'verfassung',
  'gesetz',
  'verordnung',
  'verwaltungsvorschrift',
  'foerderrichtlinie',
  'allgemeinverfuegung',
  'bekanntmachung',
  'berichtigung',
  'staatsvertrag',
  'verwaltungsabkommen',
  'zustimmungsgesetz',
  'aenderungsvorschrift',
  'satzung',
] as const;

export const NORM_STATUSES = [
  'in-force',
  'future-effective',
  'pending-effective',
  'repealed',
  'historical',
  'one-time-act',
  'planned',
] as const;

export const HISTORY_ENTRY_TYPES = ['initial', 'amendment', 'repeal', 'correction', 'notice'] as const;

/**
 * Body-Block-Typen. Die ersten 17 sind wörtlich aus OstRecht übernommen; `book`, `preamble`,
 * `heading` und `footnote` ergänzen Bücher, Vorbemerkungen, freistehende Überschriften und
 * Fußnoten im Text. `subparagraph` ist der Absatz („(1)“), `paragraphText` der Fließtext,
 * `item`/`subitem` sind Nummerierungen und Buchstaben.
 */
export const STRUCTURE_TYPES = [
  'part',
  'chapter',
  'section',
  'subsection',
  'paragraph',
  'article',
  'annex',
  'subparagraph',
  'paragraphText',
  'item',
  'subitem',
  'quotedProvision',
  'table',
  'tableRow',
  'tableHeaderCell',
  'tableCell',
  'signature',
  'book',
  'preamble',
  'heading',
  'footnote',
] as const;

/** Gliederungsblöcke, die eine Inhaltsübersicht bilden und Sprungziele erhalten. */
export const STRUCTURAL_CONTAINER_TYPES: readonly StructureType[] = [
  'book', 'part', 'chapter', 'section', 'subsection', 'paragraph', 'article', 'annex', 'preamble',
];

/** Blöcke, die in der Suche eine eigene Trefferadresse bilden (Provision). */
export const PROVISION_TYPES: readonly StructureType[] = ['paragraph', 'article', 'section', 'subsection', 'annex', 'preamble'];

export const TABLE_HEADER_SCOPES = ['col', 'row', 'colgroup', 'rowgroup'] as const;

export const SOURCE_KINDS = [
  /** Unveränderte Momentaufnahme einer amtlichen Portalseite (REVOSax, RECHT.NRW, …). */
  'official-portal-snapshot',
  /** Amtliche Verkündungsblatt-Ausgabe (HTML oder PDF). */
  'official-gazette',
  /** Strukturtragende redaktionelle Transkription (HTML/Markdown/DOCX im Repository). */
  'structured-transcription',
  /** Quelle einer Änderungsvorschrift, aus der eine Folgefassung konsolidiert wurde. */
  'amendment-source',
  /** Datensatz eines externen Providers (z. B. OstRecht), der fachlich Source of Truth bleibt. */
  'provider-record',
  /** Amtliche PDF zur visuellen Gegenprüfung. */
  'primary-pdf',
] as const;

export const SOURCE_AVAILABILITIES = ['versioned', 'r2-archived', 'external'] as const;

export const SOURCE_ROLES = [
  'structure-bearing',
  'visual-control',
  'supplementary-transcription',
  'official-snapshot',
  'amendment-evidence',
  'envelope-snapshot',
  'provider-sync',
] as const;

export const MEDIA_TYPES = [
  'text/html',
  'text/markdown',
  'application/pdf',
  'application/json',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const NORM_RELATION_TYPES = [
  'amends',
  'amended-by',
  'repeals',
  'repealed-by',
  'replaces',
  'replaced-by',
  'implements',
  'based-on',
  'part-of',
  'contains',
  'refers-to',
  'related',
] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const R2_OBJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/iu;
const EXTERNAL_SYSTEM_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type NormType = (typeof NORM_TYPES)[number];
export type NormStatus = (typeof NORM_STATUSES)[number];
export type HistoryEntryType = (typeof HISTORY_ENTRY_TYPES)[number];
export type StructureType = (typeof STRUCTURE_TYPES)[number];
export type TableHeaderScope = (typeof TABLE_HEADER_SCOPES)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type SourceAvailability = (typeof SOURCE_AVAILABILITIES)[number];
export type SourceRole = (typeof SOURCE_ROLES)[number];
export type MediaType = (typeof MEDIA_TYPES)[number];
export type NormRelationType = (typeof NORM_RELATION_TYPES)[number];

/**
 * Generischer externer Identifikator. Ersetzt Einzelspalten wie `revosax_law_id`:
 * `{ system: "revosax", value: "4192" }`, `{ system: "recht-nrw", value: "..." }`,
 * `{ system: "ostrecht", value: "<slug>" }`.
 */
export interface ExternalIdentifier {
  system: string;
  value: string;
  /** Optionale stabile externe Adresse des Datensatzes. */
  url?: string;
}

export interface SourceReference {
  kind: SourceKind;
  /** Herkunftssystem der Quelle (`revosax`, `recht-nrw`, `juris-sh`, `bayernrecht`, `ostrecht`, `repository`). */
  system?: string;
  label: string;
  availability: SourceAvailability;
  /** Relativer Pfad der versionierten Quelle; nur bei `availability: "versioned"`. */
  localSource?: string;
  /** R2-Objektschlüssel der unveränderten Quelle; nur bei `availability: "r2-archived"`. */
  objectKey?: string;
  bucket?: string;
  url?: string;
  retrievedAt?: string;
  sha256?: string;
  /** Kennung des Datensatzes im Herkunftssystem (z. B. REVOSax-lawId, NRW-Dokumentnummer). */
  externalId?: string;
  /** Gültigkeit der realen Quellfassung. */
  sourceValidFrom?: string;
  sourceValidTo?: string;
  mediaType?: MediaType;
  pageCount?: number;
  pageRange?: string;
  verifiedAt?: string;
  sourceRole?: SourceRole;
  derivedSource?: string;
  /** Amtliche Fundstellen-/Gliederungsnummer der Quelle, soweit das Herkunftssystem eine führt. */
  sourceNumber?: string;
  note?: string;
}

export interface NormSourceNote {
  label: string;
  text: string;
}

export interface NormTarget {
  /** Fehlt, wenn die Zielnorm in derselben Jurisdiktion liegt. */
  jurisdiction?: JurisdictionId;
  slug: string;
}

export interface NormRelation {
  type: NormRelationType;
  target: NormTarget;
  /** Freitext, z. B. Artikel der Mantelvorschrift oder betroffene Vorschrift. */
  note?: string;
  /** Datum, ab dem die Beziehung wirkt (z. B. Änderungstag). */
  date?: string;
}

export interface NormMeta {
  id: string;
  slug: string;
  jurisdiction: JurisdictionId;
  /** Amtlicher Langtitel. */
  title: string;
  /** Echte Kurzbezeichnung; entfällt, wenn die Vorschrift nur den Langtitel führt. */
  shortTitle?: string;
  /** Amtliche oder gebräuchliche Abkürzung. */
  abbr?: string;
  shortTitleSource?: 'official' | 'editorial';
  type: NormType;
  status: NormStatus;
  /** Erlassorgan (z. B. Landtag, Landesregierung, Ministerium). */
  enactingBody?: string;
  /** Historisches Ursprungsorgan der übernommenen Quelle (Provenienz, kein Erlassorgan der Simulation). */
  originEnactingBody?: string;
  /** Zuständige Stelle, soweit vorhanden. */
  responsibleBody?: string;
  subjects: string[];
  primarySubject?: string;
  keywords: string[];
  /** Fundstelle der Stammfassung (Vollzitat). */
  initialCitation: string;
  /** Redaktionelle Kurzbeschreibung; `summarySource: derived` wird nicht öffentlich gerendert. */
  summary?: string;
  summarySource?: 'derived' | 'editorial';
  documentDate?: string;
  publicationDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  dateNote?: string;
  /** Vorgänger/Nachfolger als Zitat und – wenn im Bestand – als Zielnorm. */
  predecessor: string | null;
  predecessorTarget?: NormTarget;
  successor: string | null;
  successorTarget?: NormTarget;
  relations: NormRelation[];
  externalIdentifiers: ExternalIdentifier[];
  sourceReferences: SourceReference[];
}

/**
 * Ein äußerer oder innerer Block des Normkörpers (strukturell identisch mit OstRecht).
 * `signature`: `text` = unterzeichnende Person, `title` = Amtsbezeichnung, `label` = Ort/Datum.
 * `footnote`: `label` = Fußnotenzeichen, `text` = Fußnotentext.
 */
export interface NormBodyBlock {
  type: StructureType;
  label?: string;
  title?: string;
  text?: string;
  level?: number;
  listId?: string;
  numberingStyle?: string;
  scope?: TableHeaderScope;
  rowspan?: number;
  colspan?: number;
  columns?: number;
  children?: NormBodyBlock[];
}

export interface NormVersion {
  versionId: string;
  /** Beginn der Geltung im Simulationsbestand (ISO-Datum). */
  simulationValidFrom: string;
  /** Ende der Geltung im Simulationsbestand; null = offen. */
  simulationValidTo: string | null;
  /** Gültigkeitsbeginn der übernommenen realen Quellfassung, soweit bekannt. */
  sourceValidFrom?: string;
  /** Gültigkeitsende der übernommenen realen Quellfassung, soweit bekannt. */
  sourceValidTo?: string;
  /** Fassungsspezifische Bezeichnung; fällt auf meta.json zurück. */
  title?: string;
  shortTitle?: string;
  abbr?: string;
  summary?: string;
  citation: string;
  changeNote: string;
  sourceReferences?: SourceReference[];
  sourceNotes?: NormSourceNote[];
  body: NormBodyBlock[];
}

export interface NormHistoryEntry {
  date: string;
  type: HistoryEntryType;
  title: string;
  citation: string;
  note?: string;
  affectingVersionId?: string | null;
  relatedNorm?: NormTarget | null;
}

export interface NormHistory {
  initialVersionId: string | null;
  entries: NormHistoryEntry[];
}

export interface NormRecord {
  meta: NormMeta;
  history: NormHistory;
  versions: NormVersion[];
}

export interface PublicationEntry {
  title: string;
  citation: string;
  normSlug: string;
  versionId?: string;
  pages?: string;
}

/** Verkündungsblatt-Ausgabe einer Jurisdiktion (content/publications/<jurisdiction>/<slug>.json). */
export interface Publication {
  slug: string;
  jurisdiction: JurisdictionId;
  title: string;
  gazette: string;
  year: number;
  issue: string;
  date: string;
  sourceReferences: SourceReference[];
  entries: PublicationEntry[];
}

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new ContentValidationError(`${path}: ${message}`);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'muss ein Objekt sein');
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'muss ein String sein');
  const trimmed = value.trim();
  if (!trimmed) fail(path, 'darf nicht leer sein');
  return trimmed;
}

function expectOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path);
}

function expectNullableString(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : expectString(value, path);
}

function expectSlug(value: unknown, path: string): string {
  const slug = expectString(value, path);
  if (!SLUG_PATTERN.test(slug)) fail(path, 'muss ein technischer Slug sein (a-z, 0-9, Bindestrich)');
  return slug;
}

function expectIsoDate(value: unknown, path: string): string {
  const text = expectString(value, path);
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    fail(path, 'muss ein Datum im Format YYYY-MM-DD sein');
  }
  return text;
}

function expectOptionalIsoDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectIsoDate(value, path);
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'muss ein Boolean sein');
  return value;
}

function expectOptionalInteger(value: unknown, path: string, { minimum = 0 } = {}): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum) fail(path, `muss eine ganze Zahl ab ${minimum} sein`);
  return value as number;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, 'muss ein String-Array sein');
  return value.map((entry, index) => expectString(entry, `${path}[${index}]`));
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'muss ein Array sein');
  return value;
}

function expectOptionalArray(value: unknown, path: string): unknown[] {
  return value === undefined ? [] : expectArray(value, path);
}

function expectEnumValue<T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
  const text = expectString(value, path);
  if (!allowed.includes(text)) fail(path, `muss einer dieser Werte sein: ${allowed.join(', ')}`);
  return text as T[number];
}

function expectJurisdiction(value: unknown, path: string): JurisdictionId {
  const text = expectString(value, path);
  if (!isJurisdictionId(text)) fail(path, `muss eine bekannte Jurisdiktion sein: ${JURISDICTION_IDS.join(', ')}`);
  return text;
}

function expectTableCellText(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'muss ein String sein');
  return value.trim();
}

function expectOptionalContainerText(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail(path, 'muss ein String sein');
  return value.trim();
}

export function parseExternalIdentifier(value: unknown, path: string): ExternalIdentifier {
  const object = expectObject(value, path);
  const system = expectString(object.system, `${path}.system`);
  if (!EXTERNAL_SYSTEM_PATTERN.test(system)) fail(`${path}.system`, 'muss eine technische Systemkennung sein (a-z, 0-9, Bindestrich)');
  return {
    system,
    value: expectString(object.value, `${path}.value`),
    url: expectOptionalString(object.url, `${path}.url`),
  };
}

export function parseSourceReference(value: unknown, path: string): SourceReference {
  const object = expectObject(value, path);
  const kind = expectEnumValue(object.kind, `${path}.kind`, SOURCE_KINDS);
  const availability = expectEnumValue(object.availability, `${path}.availability`, SOURCE_AVAILABILITIES);
  const localSource = expectOptionalString(object.localSource, `${path}.localSource`);
  const objectKey = expectOptionalString(object.objectKey, `${path}.objectKey`);
  const url = expectOptionalString(object.url, `${path}.url`);
  const sha256 = expectOptionalString(object.sha256, `${path}.sha256`);
  const system = expectOptionalString(object.system, `${path}.system`);

  if (system !== undefined && !EXTERNAL_SYSTEM_PATTERN.test(system)) fail(`${path}.system`, 'muss eine technische Systemkennung sein');
  if (sha256 !== undefined && !SHA256_PATTERN.test(sha256)) fail(`${path}.sha256`, 'muss ein SHA-256-Hexwert mit 64 Zeichen sein');

  if (availability === 'versioned') {
    if (!localSource) fail(`${path}.localSource`, 'ist für eine versionierte Quelle erforderlich');
    if (objectKey !== undefined) fail(`${path}.objectKey`, 'ist nur für eine in R2 archivierte Quelle zulässig');
  } else if (availability === 'r2-archived') {
    if (localSource !== undefined) fail(`${path}.localSource`, 'darf bei einer in R2 archivierten Quelle nicht gesetzt sein');
    if (!objectKey) fail(`${path}.objectKey`, 'ist für eine in R2 archivierte Quelle erforderlich');
    if (!R2_OBJECT_KEY_PATTERN.test(objectKey)) fail(`${path}.objectKey`, 'muss ein R2-Objektschlüssel mit Präfixpfad sein');
    if (!sha256) fail(`${path}.sha256`, 'ist für eine in R2 archivierte Quelle erforderlich');
    if (!url) fail(`${path}.url`, 'muss die amtliche URL einer in R2 archivierten Quelle nennen');
    if (object.retrievedAt === undefined) fail(`${path}.retrievedAt`, 'ist für eine in R2 archivierte Quelle erforderlich');
  } else {
    if (!url) fail(`${path}.url`, 'ist für eine externe Quelle erforderlich');
    if (localSource !== undefined || objectKey !== undefined) fail(path, 'eine externe Quelle hat weder localSource noch objectKey');
  }

  const sourceValidFrom = expectOptionalIsoDate(object.sourceValidFrom, `${path}.sourceValidFrom`);
  const sourceValidTo = expectOptionalIsoDate(object.sourceValidTo, `${path}.sourceValidTo`);
  if (sourceValidFrom && sourceValidTo && sourceValidTo < sourceValidFrom) fail(`${path}.sourceValidTo`, 'liegt vor sourceValidFrom');

  return {
    kind,
    system,
    label: expectString(object.label, `${path}.label`),
    availability,
    localSource,
    objectKey,
    bucket: expectOptionalString(object.bucket, `${path}.bucket`),
    url,
    retrievedAt: expectOptionalIsoDate(object.retrievedAt, `${path}.retrievedAt`),
    sha256,
    externalId: expectOptionalString(object.externalId, `${path}.externalId`),
    sourceValidFrom,
    sourceValidTo,
    mediaType: object.mediaType === undefined ? undefined : expectEnumValue(object.mediaType, `${path}.mediaType`, MEDIA_TYPES),
    pageCount: expectOptionalInteger(object.pageCount, `${path}.pageCount`, { minimum: 1 }),
    pageRange: expectOptionalString(object.pageRange, `${path}.pageRange`),
    verifiedAt: expectOptionalIsoDate(object.verifiedAt, `${path}.verifiedAt`),
    sourceRole: object.sourceRole === undefined ? undefined : expectEnumValue(object.sourceRole, `${path}.sourceRole`, SOURCE_ROLES),
    derivedSource: expectOptionalString(object.derivedSource, `${path}.derivedSource`),
    sourceNumber: expectOptionalString(object.sourceNumber, `${path}.sourceNumber`),
    note: expectOptionalString(object.note, `${path}.note`),
  };
}

function parseSourceReferences(value: unknown, path: string): SourceReference[] {
  return expectOptionalArray(value, path).map((entry, index) => parseSourceReference(entry, `${path}[${index}]`));
}

function parseSourceNote(value: unknown, path: string): NormSourceNote {
  const object = expectObject(value, path);
  return { label: expectString(object.label, `${path}.label`), text: expectString(object.text, `${path}.text`) };
}

export function parseNormTarget(value: unknown, path: string): NormTarget {
  const object = expectObject(value, path);
  const target: NormTarget = { slug: expectSlug(object.slug, `${path}.slug`) };
  if (object.jurisdiction !== undefined) target.jurisdiction = expectJurisdiction(object.jurisdiction, `${path}.jurisdiction`);
  return target;
}

export function parseNormRelation(value: unknown, path: string): NormRelation {
  const object = expectObject(value, path);
  return {
    type: expectEnumValue(object.type, `${path}.type`, NORM_RELATION_TYPES),
    target: parseNormTarget(object.target, `${path}.target`),
    note: expectOptionalString(object.note, `${path}.note`),
    date: expectOptionalIsoDate(object.date, `${path}.date`),
  };
}

export function parseNormMeta(value: unknown, path = 'meta.json'): NormMeta {
  const object = expectObject(value, path);
  const subjects = expectStringArray(object.subjects, `${path}.subjects`);
  const primarySubject = expectOptionalString(object.primarySubject, `${path}.primarySubject`);
  if (primarySubject && !subjects.includes(primarySubject)) fail(`${path}.primarySubject`, 'muss zugleich in subjects enthalten sein');

  const externalIdentifiers = expectOptionalArray(object.externalIdentifiers, `${path}.externalIdentifiers`)
    .map((entry, index) => parseExternalIdentifier(entry, `${path}.externalIdentifiers[${index}]`));
  const seen = new Set<string>();
  for (const identifier of externalIdentifiers) {
    const key = `${identifier.system}:${identifier.value}`;
    if (seen.has(key)) fail(`${path}.externalIdentifiers`, `Identifikator ${key} ist doppelt`);
    seen.add(key);
  }

  const documentDate = expectOptionalIsoDate(object.documentDate, `${path}.documentDate`);
  const publicationDate = expectOptionalIsoDate(object.publicationDate, `${path}.publicationDate`);
  const effectiveDate = expectOptionalIsoDate(object.effectiveDate, `${path}.effectiveDate`);
  const expiryDate = expectOptionalIsoDate(object.expiryDate, `${path}.expiryDate`);
  if (effectiveDate && expiryDate && expiryDate < effectiveDate) fail(`${path}.expiryDate`, 'liegt vor effectiveDate');

  return {
    id: expectString(object.id, `${path}.id`),
    slug: expectSlug(object.slug, `${path}.slug`),
    jurisdiction: expectJurisdiction(object.jurisdiction, `${path}.jurisdiction`),
    title: expectString(object.title, `${path}.title`),
    shortTitle: expectOptionalString(object.shortTitle, `${path}.shortTitle`),
    abbr: expectOptionalString(object.abbr, `${path}.abbr`),
    shortTitleSource: object.shortTitleSource === undefined
      ? undefined
      : expectEnumValue(object.shortTitleSource, `${path}.shortTitleSource`, ['official', 'editorial'] as const),
    type: expectEnumValue(object.type, `${path}.type`, NORM_TYPES),
    status: expectEnumValue(object.status, `${path}.status`, NORM_STATUSES),
    enactingBody: expectOptionalString(object.enactingBody, `${path}.enactingBody`),
    originEnactingBody: expectOptionalString(object.originEnactingBody, `${path}.originEnactingBody`),
    responsibleBody: expectOptionalString(object.responsibleBody, `${path}.responsibleBody`),
    subjects,
    primarySubject,
    keywords: expectStringArray(object.keywords, `${path}.keywords`),
    initialCitation: expectString(object.initialCitation, `${path}.initialCitation`),
    summary: expectOptionalString(object.summary, `${path}.summary`),
    summarySource: object.summarySource === undefined
      ? undefined
      : expectEnumValue(object.summarySource, `${path}.summarySource`, ['derived', 'editorial'] as const),
    documentDate,
    publicationDate,
    effectiveDate,
    expiryDate,
    dateNote: expectOptionalString(object.dateNote, `${path}.dateNote`),
    predecessor: expectNullableString(object.predecessor, `${path}.predecessor`),
    predecessorTarget: object.predecessorTarget === undefined ? undefined : parseNormTarget(object.predecessorTarget, `${path}.predecessorTarget`),
    successor: expectNullableString(object.successor, `${path}.successor`),
    successorTarget: object.successorTarget === undefined ? undefined : parseNormTarget(object.successorTarget, `${path}.successorTarget`),
    relations: expectOptionalArray(object.relations, `${path}.relations`).map((entry, index) => parseNormRelation(entry, `${path}.relations[${index}]`)),
    externalIdentifiers,
    sourceReferences: parseSourceReferences(object.sourceReferences, `${path}.sourceReferences`),
  };
}

const CONTAINER_TYPES_REQUIRING_HEADING: readonly StructureType[] = ['book', 'part', 'chapter', 'section', 'subsection', 'paragraph', 'article', 'annex'];
const CONTAINER_TYPES_REQUIRING_CHILDREN: readonly StructureType[] = ['book', 'part', 'chapter', 'section', 'subsection', 'annex', 'paragraph', 'article', 'table', 'tableRow', 'preamble'];

export function parseBodyBlock(value: unknown, path: string): NormBodyBlock {
  const object = expectObject(value, path);
  const type = expectEnumValue(object.type, `${path}.type`, STRUCTURE_TYPES);
  const label = expectOptionalString(object.label, `${path}.label`);
  const title = expectOptionalString(object.title, `${path}.title`);
  const text = type === 'tableCell' || type === 'tableHeaderCell'
    ? expectTableCellText(object.text, `${path}.text`)
    : type === 'subparagraph' || type === 'item' || type === 'subitem'
      ? expectOptionalContainerText(object.text, `${path}.text`)
      : expectOptionalString(object.text, `${path}.text`);
  const children = object.children === undefined ? undefined : parseBodyBlocks(object.children, `${path}.children`);
  const level = expectOptionalInteger(object.level, `${path}.level`);
  const listId = expectOptionalString(object.listId, `${path}.listId`);
  const numberingStyle = expectOptionalString(object.numberingStyle, `${path}.numberingStyle`);
  const scope = object.scope === undefined ? undefined : expectEnumValue(object.scope, `${path}.scope`, TABLE_HEADER_SCOPES);
  const rowspan = expectOptionalInteger(object.rowspan, `${path}.rowspan`, { minimum: 1 });
  const colspan = expectOptionalInteger(object.colspan, `${path}.colspan`, { minimum: 1 });
  const columns = expectOptionalInteger(object.columns, `${path}.columns`, { minimum: 1 });

  if ((type === 'paragraphText' || type === 'footnote') && !text) fail(`${path}.text`, `ist für Blocktyp "${type}" erforderlich`);
  if (type === 'heading' && !title && !text) fail(path, 'Blocktyp "heading" benötigt "title" oder "text"');
  if (type === 'footnote' && !label) fail(`${path}.label`, 'Fußnoten benötigen ein Fußnotenzeichen');
  if (type === 'signature') {
    if (!text && !title) fail(path, 'Blocktyp "signature" benötigt Person in "text" oder Amtsbezeichnung in "title"');
    if (children) fail(`${path}.children`, 'ist für Blocktyp "signature" nicht zulässig');
  }
  if ((type === 'subparagraph' || type === 'item' || type === 'subitem') && !label && !text && (!children || children.length === 0)) {
    fail(path, `Blocktyp "${type}" benötigt Gliederungszeichen, Text oder untergeordnete Blöcke`);
  }
  if (CONTAINER_TYPES_REQUIRING_HEADING.includes(type) && !title && !label) fail(path, `Blocktyp "${type}" benötigt mindestens "title" oder "label"`);
  if (CONTAINER_TYPES_REQUIRING_CHILDREN.includes(type) && !children) fail(`${path}.children`, `ist für Blocktyp "${type}" erforderlich`);
  if (type === 'quotedProvision' && (!children || children.length === 0)) fail(`${path}.children`, 'muss für zitierten Normtext mindestens einen Block enthalten');
  if ((level !== undefined || listId !== undefined || numberingStyle !== undefined) && !['item', 'subitem', 'subparagraph'].includes(type)) {
    fail(path, 'Listenmetadaten sind nur an Listen- und Absatzpunkten zulässig');
  }
  if ((rowspan !== undefined || colspan !== undefined) && type !== 'tableCell' && type !== 'tableHeaderCell') fail(path, 'rowspan und colspan sind nur an Tabellenzellen zulässig');
  if (scope !== undefined && type !== 'tableHeaderCell') fail(`${path}.scope`, 'ist nur an Tabellenkopfzellen zulässig');
  if (columns !== undefined && type !== 'table') fail(path, 'columns ist nur an Tabellen zulässig');

  const block: NormBodyBlock = { type };
  if (label !== undefined) block.label = label;
  if (title !== undefined) block.title = title;
  if (text !== undefined) block.text = text;
  if (level !== undefined) block.level = level;
  if (listId !== undefined) block.listId = listId;
  if (numberingStyle !== undefined) block.numberingStyle = numberingStyle;
  if (scope !== undefined) block.scope = scope;
  if (rowspan !== undefined) block.rowspan = rowspan;
  if (colspan !== undefined) block.colspan = colspan;
  if (columns !== undefined) block.columns = columns;
  if (children !== undefined) block.children = children;

  if (type === 'table') validateTableGrid(block, path);
  return block;
}

export function parseBodyBlocks(value: unknown, path: string): NormBodyBlock[] {
  if (!Array.isArray(value)) fail(path, 'muss ein Array strukturierter Inhaltsblöcke sein');
  return value.map((entry, index) => parseBodyBlock(entry, `${path}[${index}]`));
}

function validateTableGrid(table: NormBodyBlock, path: string): void {
  const rows = table.children ?? [];
  const occupied: boolean[][] = [];
  let width = 0;
  rows.forEach((row, rowIndex) => {
    if (row.type !== 'tableRow') fail(`${path}.children[${rowIndex}].type`, 'muss tableRow sein');
    occupied[rowIndex] ??= [];
    let column = 0;
    (row.children ?? []).forEach((cell, cellIndex) => {
      if (cell.type !== 'tableCell' && cell.type !== 'tableHeaderCell') fail(`${path}.children[${rowIndex}].children[${cellIndex}].type`, 'muss eine Tabellenzelle sein');
      const rowCells = occupied[rowIndex]!;
      while (rowCells[column]) column += 1;
      const rowspan = cell.rowspan ?? 1;
      const colspan = cell.colspan ?? 1;
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        occupied[rowIndex + rowOffset] ??= [];
        const targetRow = occupied[rowIndex + rowOffset]!;
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          if (targetRow[column + columnOffset]) fail(`${path}.children[${rowIndex}].children[${cellIndex}]`, 'überlappt eine andere Tabellenzelle');
          targetRow[column + columnOffset] = true;
        }
      }
      column += colspan;
    });
    width = Math.max(width, occupied[rowIndex]!.length);
  });
  occupied.forEach((row, rowIndex) => {
    if (row.filter(Boolean).length !== width) fail(`${path}.children[${rowIndex}]`, `belegt ${row.filter(Boolean).length} statt ${width} Spalten`);
  });
  if (table.columns !== undefined && table.columns !== width) fail(`${path}.columns`, `ist ${table.columns}, die Tabelle besitzt jedoch ${width} Spalten`);
}

export function parseNormVersion(value: unknown, path = 'version.json'): NormVersion {
  const object = expectObject(value, path);
  if (object.validFrom !== undefined || object.validTo !== undefined) {
    fail(path, 'verwendet validFrom/validTo; das Landesrechtsportal unterscheidet simulationValidFrom/simulationValidTo und sourceValidFrom/sourceValidTo');
  }
  const simulationValidFrom = expectIsoDate(object.simulationValidFrom, `${path}.simulationValidFrom`);
  const simulationValidTo = object.simulationValidTo === null || object.simulationValidTo === undefined
    ? null
    : expectIsoDate(object.simulationValidTo, `${path}.simulationValidTo`);
  if (simulationValidTo !== null && simulationValidTo < simulationValidFrom) fail(`${path}.simulationValidTo`, 'liegt vor simulationValidFrom');
  const sourceValidFrom = expectOptionalIsoDate(object.sourceValidFrom, `${path}.sourceValidFrom`);
  const sourceValidTo = expectOptionalIsoDate(object.sourceValidTo, `${path}.sourceValidTo`);
  if (sourceValidFrom && sourceValidTo && sourceValidTo < sourceValidFrom) fail(`${path}.sourceValidTo`, 'liegt vor sourceValidFrom');

  const version: NormVersion = {
    versionId: expectString(object.versionId, `${path}.versionId`),
    simulationValidFrom,
    simulationValidTo,
    citation: expectString(object.citation, `${path}.citation`),
    changeNote: expectString(object.changeNote, `${path}.changeNote`),
    body: parseBodyBlocks(object.body, `${path}.body`),
  };
  if (sourceValidFrom !== undefined) version.sourceValidFrom = sourceValidFrom;
  if (sourceValidTo !== undefined) version.sourceValidTo = sourceValidTo;
  const title = expectOptionalString(object.title, `${path}.title`);
  if (title !== undefined) version.title = title;
  const shortTitle = expectOptionalString(object.shortTitle, `${path}.shortTitle`);
  if (shortTitle !== undefined) version.shortTitle = shortTitle;
  const abbr = expectOptionalString(object.abbr, `${path}.abbr`);
  if (abbr !== undefined) version.abbr = abbr;
  const summary = expectOptionalString(object.summary, `${path}.summary`);
  if (summary !== undefined) version.summary = summary;
  if (object.sourceReferences !== undefined) version.sourceReferences = parseSourceReferences(object.sourceReferences, `${path}.sourceReferences`);
  if (object.sourceNotes !== undefined) {
    version.sourceNotes = expectArray(object.sourceNotes, `${path}.sourceNotes`).map((entry, index) => parseSourceNote(entry, `${path}.sourceNotes[${index}]`));
  }
  return version;
}

function parseHistoryEntry(value: unknown, path: string): NormHistoryEntry {
  const object = expectObject(value, path);
  const entry: NormHistoryEntry = {
    date: expectIsoDate(object.date, `${path}.date`),
    type: expectEnumValue(object.type, `${path}.type`, HISTORY_ENTRY_TYPES),
    title: expectString(object.title, `${path}.title`),
    citation: expectString(object.citation, `${path}.citation`),
  };
  const note = expectOptionalString(object.note, `${path}.note`);
  if (note !== undefined) entry.note = note;
  if (object.affectingVersionId !== undefined) entry.affectingVersionId = expectNullableString(object.affectingVersionId, `${path}.affectingVersionId`);
  if (object.relatedNorm !== undefined) entry.relatedNorm = object.relatedNorm === null ? null : parseNormTarget(object.relatedNorm, `${path}.relatedNorm`);
  return entry;
}

export function parseNormHistory(value: unknown, path = 'history.json'): NormHistory {
  const object = expectObject(value, path);
  const entries = expectArray(object.entries, `${path}.entries`);
  if (object.initialVersionId !== null && typeof object.initialVersionId !== 'string') {
    fail(`${path}.initialVersionId`, 'muss eine Fassungskennung oder null sein');
  }
  return {
    initialVersionId: object.initialVersionId === null ? null : expectString(object.initialVersionId, `${path}.initialVersionId`),
    entries: entries.map((entry, index) => parseHistoryEntry(entry, `${path}.entries[${index}]`)),
  };
}

export function parsePublication(value: unknown, path = 'publication.json'): Publication {
  const object = expectObject(value, path);
  const year = object.year;
  if (!Number.isInteger(year) || (year as number) < 1900) fail(`${path}.year`, 'muss ein Jahr sein');
  return {
    slug: expectSlug(object.slug, `${path}.slug`),
    jurisdiction: expectJurisdiction(object.jurisdiction, `${path}.jurisdiction`),
    title: expectString(object.title, `${path}.title`),
    gazette: expectString(object.gazette, `${path}.gazette`),
    year: year as number,
    issue: expectString(object.issue, `${path}.issue`),
    date: expectIsoDate(object.date, `${path}.date`),
    sourceReferences: parseSourceReferences(object.sourceReferences, `${path}.sourceReferences`),
    entries: expectArray(object.entries, `${path}.entries`).map((entry, index) => {
      const item = expectObject(entry, `${path}.entries[${index}]`);
      const result: PublicationEntry = {
        title: expectString(item.title, `${path}.entries[${index}].title`),
        citation: expectString(item.citation, `${path}.entries[${index}].citation`),
        normSlug: expectSlug(item.normSlug, `${path}.entries[${index}].normSlug`),
      };
      const versionId = expectOptionalString(item.versionId, `${path}.entries[${index}].versionId`);
      if (versionId !== undefined) result.versionId = versionId;
      const pages = expectOptionalString(item.pages, `${path}.entries[${index}].pages`);
      if (pages !== undefined) result.pages = pages;
      return result;
    }),
  };
}

/** Prüft die Konsistenz von Meta, Historie und Fassungen und sortiert deterministisch. */
export function validateNormRecord(record: NormRecord, context = `${record.meta.jurisdiction}/${record.meta.slug}`): NormRecord {
  if (record.versions.length === 0) fail(`${context}/versions`, 'muss mindestens eine Fassung enthalten');

  const knownVersionIds = new Set<string>();
  for (const version of record.versions) {
    if (knownVersionIds.has(version.versionId)) fail(`${context}/versions/${version.versionId}.json`, 'Version-ID ist doppelt vergeben');
    knownVersionIds.add(version.versionId);
  }

  if (record.history.initialVersionId !== null && !knownVersionIds.has(record.history.initialVersionId)) {
    fail(`${context}/history.json.initialVersionId`, 'muss auf eine vorhandene Fassung verweisen');
  }
  for (const [index, entry] of record.history.entries.entries()) {
    if (entry.affectingVersionId && !knownVersionIds.has(entry.affectingVersionId)) {
      fail(`${context}/history.json.entries[${index}].affectingVersionId`, 'muss auf eine vorhandene Fassung verweisen');
    }
  }

  for (const relation of record.meta.relations) {
    if (!relation.target.jurisdiction && relation.target.slug === record.meta.slug) {
      fail(`${context}/meta.json.relations`, 'eine Norm darf nicht auf sich selbst verweisen');
    }
  }

  const versions = [...record.versions].sort((left, right) => left.simulationValidFrom.localeCompare(right.simulationValidFrom));
  validateVersionIntervals(versions, context);

  return {
    ...record,
    versions,
    history: {
      ...record.history,
      entries: [...record.history.entries].sort((left, right) => left.date.localeCompare(right.date)),
    },
  };
}

/** Simulationsintervalle müssen lückenlos und überschneidungsfrei aufeinander folgen. */
export function validateVersionIntervals(sortedVersions: readonly NormVersion[], context: string): void {
  for (let index = 0; index < sortedVersions.length; index += 1) {
    const version = sortedVersions[index]!;
    const next = sortedVersions[index + 1];
    if (!next) continue;
    if (version.simulationValidTo === null || version.simulationValidTo >= next.simulationValidFrom) {
      fail(`${context}/versions`, `Simulationsintervalle ${version.versionId} und ${next.versionId} überlappen`);
    }
    if (version.simulationValidTo !== previousDay(next.simulationValidFrom)) {
      fail(`${context}/versions`, `zwischen ${version.versionId} und ${next.versionId} besteht eine Gültigkeitslücke`);
    }
  }
}

export function previousDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function isNormType(value: unknown): value is NormType {
  return typeof value === 'string' && (NORM_TYPES as readonly string[]).includes(value);
}

export function isNormStatus(value: unknown): value is NormStatus {
  return typeof value === 'string' && (NORM_STATUSES as readonly string[]).includes(value);
}

export { expectBoolean as _expectBoolean };
