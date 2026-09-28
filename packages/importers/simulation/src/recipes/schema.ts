/**
 * Fail-closed-Parser der Eingaben der Simulationsrechtsfortschreibung (docs/SIMULATION_IMPORT.md, Abschnitt 5):
 *
 *   - Rezept je Zielnorm  `data/simulation/<land>/amendments/<akt-slug>/<ziel-slug>.json`
 *     (`landesrecht-simulation-recipe/1`, Schema S4; Operationen aus `CONSOLIDATION_OPERATIONS`);
 *   - Sim-Akt als Norm    `data/simulation/<land>/acts/<akt-slug>.json` (`landesrecht-simulation-act/1`, S5).
 *
 * Unbekannte Felder, fehlende Pflichtfelder, falsche Typen und nicht-simulative Belege werfen eine
 * ContentValidationError mit Pfad. Blöcke (`value`, `body`) laufen durch die kanonischen Parser von
 * legal-core; Belege durch `parseSourceReference`.
 */
import type { JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { isJurisdictionId, JURISDICTION_IDS } from '@landesrecht/legal-core/config/jurisdictions.ts';
import {
  ContentValidationError,
  isSimulationSourceKind,
  NORM_STATUSES,
  NORM_TYPES,
  parseBodyBlock,
  parseBodyBlocks,
  parseNormRelation,
  parseNormTarget,
  parseSourceReference,
  STRUCTURE_TYPES,
  type NormBodyBlock,
  type NormRelation,
  type NormSourceNote,
  type NormStatus,
  type NormTarget,
  type NormType,
  type SourceReference,
} from '@landesrecht/legal-core/lib/schema.ts';

import {
  CONSOLIDATION_OPERATIONS,
  OPERATIONS_WITH_BLOCK_LIST_VALUE,
  OPERATIONS_WITH_BLOCK_VALUE,
  OPERATIONS_WITH_TEXT_VALUE,
  OPERATIONS_WITHOUT_TARGET,
  type ConsolidationOperation,
  type ConsolidationOperationName,
  type OperationTarget,
} from '../engine/apply.ts';

export const RECIPE_SCHEMA_VERSION = 'landesrecht-simulation-recipe/1' as const;
export const ACT_SCHEMA_VERSION = 'landesrecht-simulation-act/1' as const;
export const ACT_TRANSCRIPTION_METHODS = ['text-layer', 'txt', 'docx', 'html'] as const;
export type ActTranscriptionMethod = (typeof ACT_TRANSCRIPTION_METHODS)[number];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
/** Fassungskennung = Dateiname unter versions/: Kleinbuchstaben, Ziffern, Bindestrich, Punkt. */
const VERSION_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

export interface SimulationRecipe {
  schemaVersion: typeof RECIPE_SCHEMA_VERSION;
  /** Slug des Änderungsakts derselben Jurisdiktion (Verzeichnisname unter amendments/). */
  amendmentAct: string;
  effectiveDate: string;
  /** Kennung der erzeugten Fassung; Standard = `effectiveDate`. */
  versionId: string;
  sameDayOrder?: number;
  repealsLaw: boolean;
  amendmentCitation: string;
  resultCitation: string;
  changeNote: string;
  commandCoverage?: string[];
  /** Sim-Belege des Rezepts (kanonisch geparst); sie werden in die erzeugte Fassung übernommen. */
  sourceReferences: SourceReference[];
  operations: ConsolidationOperation[];
}

/** Metadaten eines Sim-Akts; Identität (`id`, `slug`, `jurisdiction`) und reale Provenienz sind nicht zulässig. */
export interface SimulationActMeta {
  title: string;
  shortTitle?: string;
  abbr?: string;
  shortTitleSource?: 'official' | 'editorial';
  type: NormType;
  status: NormStatus;
  enactingBody?: string;
  responsibleBody?: string;
  subjects: string[];
  primarySubject?: string;
  keywords: string[];
  initialCitation: string;
  summary?: string;
  summarySource?: 'derived' | 'editorial';
  documentDate?: string;
  publicationDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  dateNote?: string;
  predecessor: string | null;
  predecessorTarget?: NormTarget;
  successor: string | null;
  successorTarget?: NormTarget;
  relations: NormRelation[];
  /** Sim-Belege der Norm; fehlen sie, gelten die Belege der Fassung. */
  sourceReferences?: SourceReference[];
}

export interface SimulationActVersion {
  versionId: string;
  simulationValidFrom: string;
  title?: string;
  shortTitle?: string;
  abbr?: string;
  summary?: string;
  citation: string;
  changeNote: string;
  sourceReferences: SourceReference[];
  sourceNotes?: NormSourceNote[];
  body: NormBodyBlock[];
}

export interface SimulationAct {
  schemaVersion: typeof ACT_SCHEMA_VERSION;
  slug: string;
  jurisdiction: JurisdictionId;
  meta: SimulationActMeta;
  version: SimulationActVersion;
  publication: { slug: string; pages?: string };
  provenance: {
    /** SHA-256 der Quelle (Inventar), aus der der Wortlaut transkribiert wurde. */
    transcribedFrom: string;
    method: ActTranscriptionMethod;
    checked: string;
    /** Ausdrückliche Freigabe trotz gescheiterter Wortlautprobe (wird im Manifest ausgewiesen). */
    textCheckOverride?: { reason: string };
  };
}

function fail(path: string, message: string): never {
  throw new ContentValidationError(`${path}: ${message}`);
}

function expectObject(value: unknown, path: string, allowedKeys?: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'muss ein Objekt sein');
  const object = value as Record<string, unknown>;
  if (allowedKeys) {
    const unknown = Object.keys(object).filter((key) => !allowedKeys.includes(key));
    if (unknown.length > 0) fail(path, `unbekannte Felder: ${unknown.join(', ')} (zulässig: ${allowedKeys.join(', ')})`);
  }
  return object;
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

function expectSlug(value: unknown, path: string): string {
  const slug = expectString(value, path);
  if (!SLUG_PATTERN.test(slug)) fail(path, 'muss ein technischer Slug sein (a-z, 0-9, Bindestrich)');
  return slug;
}

function expectIsoDate(value: unknown, path: string): string {
  const text = expectString(value, path);
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) fail(path, 'muss ein Datum im Format YYYY-MM-DD sein');
  return text;
}

function expectOptionalIsoDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectIsoDate(value, path);
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, 'muss ein String-Array sein');
  return value.map((entry, index) => expectString(entry, `${path}[${index}]`));
}

function expectEnumValue<T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
  const text = expectString(value, path);
  if (!allowed.includes(text)) fail(path, `muss einer dieser Werte sein: ${allowed.join(', ')}`);
  return text as T[number];
}

function expectNullableString(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : expectString(value, path);
}

function expectVersionId(value: unknown, path: string): string {
  const id = expectString(value, path);
  if (!VERSION_ID_PATTERN.test(id)) fail(path, 'muss eine Fassungskennung sein (a-z, 0-9, Bindestrich, Punkt)');
  return id;
}

/** Sim-Belege: mindestens einer, ausschließlich `SIMULATION_SOURCE_KINDS`. */
function parseSimulationSourceReferences(value: unknown, path: string, { minimum = 1 } = {}): SourceReference[] {
  if (!Array.isArray(value)) fail(path, 'muss ein Array von Sim-Belegen sein');
  if (value.length < minimum) fail(path, `braucht mindestens ${minimum} Sim-Beleg(e)`);
  return value.map((entry, index) => {
    const reference = parseSourceReference(entry, `${path}[${index}]`);
    if (!isSimulationSourceKind(reference.kind)) fail(`${path}[${index}].kind`, `„${reference.kind}“ ist kein Sim-Beleg`);
    return reference;
  });
}

const TARGET_KEYS = ['type', 'label', 'title', 'text', 'parentType', 'parentLabel'] as const;

function parseOperationTarget(value: unknown, path: string): OperationTarget {
  const object = expectObject(value, path, TARGET_KEYS);
  const target: OperationTarget = {};
  for (const key of TARGET_KEYS) {
    if (object[key] === undefined) continue;
    const text = expectString(object[key], `${path}.${key}`);
    if ((key === 'type' || key === 'parentType') && !(STRUCTURE_TYPES as readonly string[]).includes(text)) fail(`${path}.${key}`, `muss ein Blocktyp sein (${STRUCTURE_TYPES.join(', ')})`);
    target[key] = text;
  }
  if (Object.keys(target).length === 0) fail(path, 'Zielanker braucht mindestens ein Merkmal');
  return target;
}

const OPERATION_KEYS = ['op', 'target', 'throughTarget', 'field', 'expectedHash', 'expectedOld', 'expectedMatches', 'value', 'position', 'source', 'sourceProvision', 'effectiveDate'] as const;
const TEXT_FIELDS = ['text', 'title', 'label'] as const;

export function parseConsolidationOperation(value: unknown, path: string): ConsolidationOperation {
  const object = expectObject(value, path, OPERATION_KEYS);
  const op = expectEnumValue(object.op, `${path}.op`, CONSOLIDATION_OPERATIONS) as ConsolidationOperationName;
  const operation: ConsolidationOperation = {
    op,
    source: expectString(object.source, `${path}.source`),
    sourceProvision: expectString(object.sourceProvision, `${path}.sourceProvision`),
    effectiveDate: expectIsoDate(object.effectiveDate, `${path}.effectiveDate`),
  };
  if (!Number.isInteger(object.expectedMatches) || (object.expectedMatches as number) < 1) fail(`${path}.expectedMatches`, 'muss eine ganze Zahl ab 1 sein');
  operation.expectedMatches = object.expectedMatches as number;

  if (OPERATIONS_WITHOUT_TARGET.includes(op)) {
    if (object.target !== undefined) fail(`${path}.target`, `${op} wirkt auf die ganze Norm und hat keinen Zielanker`);
  } else {
    if (object.target === undefined) fail(`${path}.target`, `${op}: eindeutiger Zielanker fehlt`);
    operation.target = parseOperationTarget(object.target, `${path}.target`);
  }
  if (object.throughTarget !== undefined) {
    if (op !== 'replaceSiblingRange') fail(`${path}.throughTarget`, 'ist nur für replaceSiblingRange zulässig');
    operation.throughTarget = parseOperationTarget(object.throughTarget, `${path}.throughTarget`);
  } else if (op === 'replaceSiblingRange') fail(`${path}.throughTarget`, 'replaceSiblingRange braucht throughTarget');

  if (object.field !== undefined) {
    if (op !== 'replaceText') fail(`${path}.field`, 'ist nur für replaceText zulässig');
    operation.field = expectEnumValue(object.field, `${path}.field`, TEXT_FIELDS);
  }
  if (object.position !== undefined) {
    if (op !== 'insertParagraph') fail(`${path}.position`, 'ist nur für insertParagraph zulässig');
    operation.position = expectEnumValue(object.position, `${path}.position`, ['start', 'end'] as const);
  }
  if (object.expectedHash !== undefined) {
    const hash = expectString(object.expectedHash, `${path}.expectedHash`);
    if (!SHA256_PATTERN.test(hash)) fail(`${path}.expectedHash`, 'muss ein SHA-256-Hexwert mit 64 Zeichen sein');
    operation.expectedHash = hash;
  }
  if (object.expectedOld !== undefined) {
    if (typeof object.expectedOld !== 'string') fail(`${path}.expectedOld`, 'muss ein String sein');
    operation.expectedOld = object.expectedOld;
  }
  if (operation.expectedHash === undefined && operation.expectedOld === undefined && op !== 'renameLaw') fail(path, `${op}: expectedHash oder expectedOld fehlt`);
  if (op === 'renameLaw' && operation.expectedOld === undefined) fail(`${path}.expectedOld`, 'renameLaw braucht den bisherigen Normtitel');
  if ((op === 'repealLaw' || op === 'replaceBody' || op === 'replaceSiblingRange') && operation.expectedHash === undefined) fail(`${path}.expectedHash`, `${op} braucht expectedHash`);
  if ((op === 'designationReplacement' || op === 'designationReplacementBody') && operation.expectedOld === undefined) fail(`${path}.expectedOld`, `${op} braucht die zu ersetzende Bezeichnung`);

  if (OPERATIONS_WITH_TEXT_VALUE.includes(op)) {
    if (typeof object.value !== 'string') fail(`${path}.value`, `${op}: value muss ein String sein`);
    operation.value = object.value;
  } else if (OPERATIONS_WITH_BLOCK_VALUE.includes(op)) {
    operation.value = parseBodyBlock(object.value, `${path}.value`);
  } else if (OPERATIONS_WITH_BLOCK_LIST_VALUE.includes(op)) {
    const blocks = parseBodyBlocks(object.value, `${path}.value`);
    if (blocks.length === 0) fail(`${path}.value`, `${op}: value braucht mindestens einen Block`);
    operation.value = blocks;
  } else if (op === 'repealProvision') {
    if (object.value !== undefined) operation.value = expectString(object.value, `${path}.value`);
  } else if (object.value !== undefined) {
    fail(`${path}.value`, `${op} hat keinen Wert`);
  }
  return operation;
}

const RECIPE_KEYS = ['schemaVersion', 'amendmentAct', 'effectiveDate', 'versionId', 'sameDayOrder', 'repealsLaw', 'amendmentCitation', 'resultCitation', 'changeNote', 'commandCoverage', 'sourceReferences', 'operations'] as const;

/** Rezept je Zielnorm (Schema S4). `path` benennt die Datei in Fehlermeldungen. */
export function parseSimulationRecipe(value: unknown, path = 'recipe.json'): SimulationRecipe {
  const object = expectObject(value, path, RECIPE_KEYS);
  if (object.schemaVersion !== RECIPE_SCHEMA_VERSION) fail(`${path}.schemaVersion`, `muss „${RECIPE_SCHEMA_VERSION}“ sein`);
  const effectiveDate = expectIsoDate(object.effectiveDate, `${path}.effectiveDate`);
  const recipe: SimulationRecipe = {
    schemaVersion: RECIPE_SCHEMA_VERSION,
    amendmentAct: expectSlug(object.amendmentAct, `${path}.amendmentAct`),
    effectiveDate,
    versionId: object.versionId === undefined ? effectiveDate : expectVersionId(object.versionId, `${path}.versionId`),
    repealsLaw: false,
    amendmentCitation: expectString(object.amendmentCitation, `${path}.amendmentCitation`),
    resultCitation: expectString(object.resultCitation, `${path}.resultCitation`),
    changeNote: expectString(object.changeNote, `${path}.changeNote`),
    sourceReferences: parseSimulationSourceReferences(object.sourceReferences, `${path}.sourceReferences`),
    operations: [],
  };
  if (object.sameDayOrder !== undefined) {
    if (!Number.isInteger(object.sameDayOrder) || (object.sameDayOrder as number) < 1) fail(`${path}.sameDayOrder`, 'muss eine ganze Zahl ab 1 sein');
    recipe.sameDayOrder = object.sameDayOrder as number;
  }
  if (object.repealsLaw !== undefined) {
    if (typeof object.repealsLaw !== 'boolean') fail(`${path}.repealsLaw`, 'muss ein Boolean sein');
    recipe.repealsLaw = object.repealsLaw;
  }
  if (object.commandCoverage !== undefined) recipe.commandCoverage = expectStringArray(object.commandCoverage, `${path}.commandCoverage`);
  if (!Array.isArray(object.operations) || object.operations.length === 0) fail(`${path}.operations`, 'muss mindestens eine Operation enthalten');
  recipe.operations = object.operations.map((entry, index) => parseConsolidationOperation(entry, `${path}.operations[${index}]`));
  recipe.operations.forEach((operation, index) => {
    if (operation.effectiveDate !== effectiveDate) fail(`${path}.operations[${index}].effectiveDate`, `weicht vom Wirkdatum des Rezepts (${effectiveDate}) ab`);
  });
  const repealOperations = recipe.operations.filter((operation) => operation.op === 'repealLaw');
  if (recipe.repealsLaw && (repealOperations.length !== 1 || recipe.operations.length !== 1)) fail(`${path}.operations`, 'ein Aufhebungsrezept (repealsLaw) besteht aus genau einer repealLaw-Operation');
  if (!recipe.repealsLaw && repealOperations.length > 0) fail(`${path}.repealsLaw`, 'eine repealLaw-Operation verlangt repealsLaw: true');
  return recipe;
}

const ACT_KEYS = ['schemaVersion', 'slug', 'jurisdiction', 'meta', 'version', 'publication', 'provenance'] as const;
const ACT_META_KEYS = ['title', 'shortTitle', 'abbr', 'shortTitleSource', 'type', 'status', 'enactingBody', 'responsibleBody', 'subjects', 'primarySubject', 'keywords', 'initialCitation', 'summary', 'summarySource', 'documentDate', 'publicationDate', 'effectiveDate', 'expiryDate', 'dateNote', 'predecessor', 'predecessorTarget', 'successor', 'successorTarget', 'relations', 'sourceReferences'] as const;
const ACT_VERSION_KEYS = ['versionId', 'simulationValidFrom', 'simulationValidTo', 'title', 'shortTitle', 'abbr', 'summary', 'citation', 'changeNote', 'sourceReferences', 'sourceNotes', 'body'] as const;
const ACT_PUBLICATION_KEYS = ['slug', 'pages'] as const;
const ACT_PROVENANCE_KEYS = ['transcribedFrom', 'method', 'checked', 'textCheckOverride'] as const;

function parseActMeta(value: unknown, path: string): SimulationActMeta {
  const object = expectObject(value, path, ACT_META_KEYS);
  const subjects = expectStringArray(object.subjects, `${path}.subjects`);
  const primarySubject = expectOptionalString(object.primarySubject, `${path}.primarySubject`);
  if (primarySubject && !subjects.includes(primarySubject)) fail(`${path}.primarySubject`, 'muss zugleich in subjects enthalten sein');
  const type = expectEnumValue(object.type, `${path}.type`, NORM_TYPES);
  const status = expectEnumValue(object.status, `${path}.status`, NORM_STATUSES);
  if (type === 'aenderungsvorschrift' && status !== 'one-time-act') fail(`${path}.status`, 'ein reiner Änderungsakt (aenderungsvorschrift) hat den Status one-time-act');
  const effectiveDate = expectOptionalIsoDate(object.effectiveDate, `${path}.effectiveDate`);
  const expiryDate = expectOptionalIsoDate(object.expiryDate, `${path}.expiryDate`);
  if (effectiveDate && expiryDate && expiryDate < effectiveDate) fail(`${path}.expiryDate`, 'liegt vor effectiveDate');
  const meta: SimulationActMeta = {
    title: expectString(object.title, `${path}.title`),
    type,
    status,
    subjects,
    keywords: expectStringArray(object.keywords, `${path}.keywords`),
    initialCitation: expectString(object.initialCitation, `${path}.initialCitation`),
    predecessor: expectNullableString(object.predecessor, `${path}.predecessor`),
    successor: expectNullableString(object.successor, `${path}.successor`),
    relations: Array.isArray(object.relations) || object.relations === undefined
      ? (object.relations ?? []).map((entry: unknown, index: number) => parseNormRelation(entry, `${path}.relations[${index}]`))
      : fail(`${path}.relations`, 'muss ein Array sein'),
  };
  const optionalStrings = ['shortTitle', 'abbr', 'enactingBody', 'responsibleBody', 'summary', 'dateNote'] as const;
  for (const key of optionalStrings) {
    const text = expectOptionalString(object[key], `${path}.${key}`);
    if (text !== undefined) meta[key] = text;
  }
  if (primarySubject !== undefined) meta.primarySubject = primarySubject;
  if (object.shortTitleSource !== undefined) meta.shortTitleSource = expectEnumValue(object.shortTitleSource, `${path}.shortTitleSource`, ['official', 'editorial'] as const);
  if (object.summarySource !== undefined) meta.summarySource = expectEnumValue(object.summarySource, `${path}.summarySource`, ['derived', 'editorial'] as const);
  for (const key of ['documentDate', 'publicationDate'] as const) {
    const date = expectOptionalIsoDate(object[key], `${path}.${key}`);
    if (date !== undefined) meta[key] = date;
  }
  if (effectiveDate !== undefined) meta.effectiveDate = effectiveDate;
  if (expiryDate !== undefined) meta.expiryDate = expiryDate;
  if (object.predecessorTarget !== undefined) meta.predecessorTarget = parseNormTarget(object.predecessorTarget, `${path}.predecessorTarget`);
  if (object.successorTarget !== undefined) meta.successorTarget = parseNormTarget(object.successorTarget, `${path}.successorTarget`);
  if (object.sourceReferences !== undefined) meta.sourceReferences = parseSimulationSourceReferences(object.sourceReferences, `${path}.sourceReferences`, { minimum: 0 });
  return meta;
}

function parseActVersion(value: unknown, path: string): SimulationActVersion {
  const object = expectObject(value, path, ACT_VERSION_KEYS);
  if (object.simulationValidTo !== undefined && object.simulationValidTo !== null) fail(`${path}.simulationValidTo`, 'wird nie gespeichert; das Geltungsende wird abgeleitet (null oder weglassen)');
  const version: SimulationActVersion = {
    versionId: expectVersionId(object.versionId, `${path}.versionId`),
    simulationValidFrom: expectIsoDate(object.simulationValidFrom, `${path}.simulationValidFrom`),
    citation: expectString(object.citation, `${path}.citation`),
    changeNote: expectString(object.changeNote, `${path}.changeNote`),
    sourceReferences: parseSimulationSourceReferences(object.sourceReferences, `${path}.sourceReferences`),
    body: parseBodyBlocks(object.body, `${path}.body`),
  };
  if (version.versionId !== version.simulationValidFrom) fail(`${path}.versionId`, 'muss dem Inkrafttreten (simulationValidFrom) entsprechen');
  if (version.body.length === 0) fail(`${path}.body`, 'darf nicht leer sein');
  for (const key of ['title', 'shortTitle', 'abbr', 'summary'] as const) {
    const text = expectOptionalString(object[key], `${path}.${key}`);
    if (text !== undefined) version[key] = text;
  }
  if (object.sourceNotes !== undefined) {
    if (!Array.isArray(object.sourceNotes)) fail(`${path}.sourceNotes`, 'muss ein Array sein');
    version.sourceNotes = object.sourceNotes.map((entry, index) => {
      const note = expectObject(entry, `${path}.sourceNotes[${index}]`, ['label', 'text']);
      return { label: expectString(note.label, `${path}.sourceNotes[${index}].label`), text: expectString(note.text, `${path}.sourceNotes[${index}].text`) };
    });
  }
  return version;
}

/** Sim-Akt als Norm (Schema S5). `path` benennt die Datei in Fehlermeldungen. */
export function parseSimulationAct(value: unknown, path = 'act.json'): SimulationAct {
  const object = expectObject(value, path, ACT_KEYS);
  if (object.schemaVersion !== ACT_SCHEMA_VERSION) fail(`${path}.schemaVersion`, `muss „${ACT_SCHEMA_VERSION}“ sein`);
  const jurisdiction = expectString(object.jurisdiction, `${path}.jurisdiction`);
  if (!isJurisdictionId(jurisdiction)) fail(`${path}.jurisdiction`, `muss eine bekannte Jurisdiktion sein: ${JURISDICTION_IDS.join(', ')}`);
  const publicationObject = expectObject(object.publication, `${path}.publication`, ACT_PUBLICATION_KEYS);
  const provenanceObject = expectObject(object.provenance, `${path}.provenance`, ACT_PROVENANCE_KEYS);
  const transcribedFrom = expectString(provenanceObject.transcribedFrom, `${path}.provenance.transcribedFrom`);
  if (!SHA256_PATTERN.test(transcribedFrom)) fail(`${path}.provenance.transcribedFrom`, 'muss der SHA-256 der Quelle aus dem Inventar sein');
  const act: SimulationAct = {
    schemaVersion: ACT_SCHEMA_VERSION,
    slug: expectSlug(object.slug, `${path}.slug`),
    jurisdiction,
    meta: parseActMeta(object.meta, `${path}.meta`),
    version: parseActVersion(object.version, `${path}.version`),
    publication: { slug: expectSlug(publicationObject.slug, `${path}.publication.slug`) },
    provenance: {
      transcribedFrom,
      method: expectEnumValue(provenanceObject.method, `${path}.provenance.method`, ACT_TRANSCRIPTION_METHODS),
      checked: expectString(provenanceObject.checked, `${path}.provenance.checked`),
    },
  };
  const pages = expectOptionalString(publicationObject.pages, `${path}.publication.pages`);
  if (pages !== undefined) act.publication.pages = pages;
  if (provenanceObject.textCheckOverride !== undefined) {
    const override = expectObject(provenanceObject.textCheckOverride, `${path}.provenance.textCheckOverride`, ['reason']);
    act.provenance.textCheckOverride = { reason: expectString(override.reason, `${path}.provenance.textCheckOverride.reason`) };
  }
  if (act.meta.effectiveDate !== undefined && act.meta.effectiveDate !== act.version.simulationValidFrom) {
    fail(`${path}.meta.effectiveDate`, `weicht vom Inkrafttreten der Fassung (${act.version.simulationValidFrom}) ab`);
  }
  for (const relation of act.meta.relations) {
    if (!relation.target.jurisdiction && relation.target.slug === act.slug) fail(`${path}.meta.relations`, 'eine Norm darf nicht auf sich selbst verweisen');
  }
  act.version.sourceReferences.forEach((reference, index) => {
    if (reference.publicationSlug !== undefined && reference.publicationSlug !== act.publication.slug) {
      fail(`${path}.version.sourceReferences[${index}].publicationSlug`, `weicht von publication.slug (${act.publication.slug}) ab`);
    }
  });
  return act;
}
