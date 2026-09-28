/**
 * Konsolidierungslauf eines Landes (`import-simulation consolidate`, docs/SIMULATION_IMPORT.md Abschnitt 5.3):
 *
 *   1. Sim-Akte (`data/simulation/<land>/acts/*.json`) werden als Normen materialisiert
 *      (`content/norms/<land>/<slug>/{meta.json,history.json,versions/<versionId>.json}`) – nur, wenn das
 *      Verzeichnis fehlt oder die Dateien byteidentisch wären; vorher besteht jeder Akt die Wortlautprobe
 *      gegen den Textauszug seiner Quelle (`text-check.ts`), sofern er nicht `provenance.textCheckOverride`
 *      trägt (im Manifest ausgewiesen).
 *   2. Rezepte (`data/simulation/<land>/amendments/<akt>/<ziel>.json`) werden je Zielnorm nach
 *      `effectiveDate`/`sameDayOrder` angewandt. Seed ist immer die gespeicherte Fassung vor dem Wirkdatum
 *      (Baseline oder vorige Sim-Fassung), nie ein Quellsnapshot. Je Datumsgruppe entsteht **eine** neue
 *      Fassungsdatei (`simulationValidTo: null`, Ende wird abgeleitet); eine Aufhebung (`repealsLaw`) erzeugt
 *      keine Fassung, sondern `meta.status`/`meta.expiryDate`, einen `repeal`-Historieneintrag und die
 *      Beziehung `repealed-by`.
 *   3. `meta.json`/`history.json` werden nur additiv geändert (Historieneinträge, `relations`, Aufhebung);
 *      Baseline-Felder bleiben unverändert, die Schlüsselreihenfolge stabil (rohe Datei, Felder angehängt).
 *   4. Vorhandene Fassungsdateien werden nie überschrieben: byteidentisch → unverändert, abweichend → Fehler.
 *   5. Ziele, die nicht sicher im Bestand sind (Slug fehlt, Seed fehlt, Hash/Anker weicht ab), werden als
 *      `blockedTargets` mit Grund geführt; nie wird der heutige Realtext eingesetzt.
 *
 * Ohne `--write` wird nichts geschrieben; `--check` baut alles neu und vergleicht byteidentisch mit `content/`
 * und dem Manifest (Gate G4). Eingabefehler und Konflikte verhindern jeden Schreibvorgang (fail closed).
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import { SIMULATION_BASELINE_DATE, type JurisdictionId } from '@landesrecht/legal-core/config/jurisdictions.ts';
import { assertSimulationProvenance } from '@landesrecht/legal-core/lib/provenance.ts';
import { ContentValidationError, parseNormHistory, parseNormMeta, parseNormVersion, previousDay, validateNormRecord, type NormRelation, type SourceReference } from '@landesrecht/legal-core/lib/schema.ts';
import { assertBaselineConsistency } from '@landesrecht/legal-core/lib/versions.ts';
import { writeFileAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';

import { CACHE_TEXT_DIR } from '../common/paths.ts';
import { applyPatchRecipe, ConsolidationError, type ConsolidationState, type RawBlock } from '../engine/apply.ts';
import { canonicalJson, sha256 } from '../engine/hash.ts';
import { parseSimulationAct, parseSimulationRecipe, type SimulationAct, type SimulationRecipe } from '../recipes/schema.ts';
import { actsDir, amendmentsDir, isBaselineVersionFile, jsonText, listDirectories, listJsonFiles, manifestPath, normRelativeDir, parseJsonText, readRawNorm, readTextIfExists, sha256Text, type RawObject } from './files.ts';
import { comparableManifest, CONSOLIDATION_MANIFEST_SCHEMA, type BlockedTarget, type BlockedTargetCode, type ConsolidationManifest, type ManifestAct, type ManifestRecipe, type ManifestTextCheck } from './manifest.ts';
import { checkWording, type TextCheckResult } from './text-check.ts';

export type ConsolidationMode = 'dry-run' | 'write' | 'check';

export interface ConsolidationOptions {
  root: string;
  jurisdiction: JurisdictionId;
  mode: ConsolidationMode;
  /** Nur diese Akt- bzw. Zielnorm-Slugs verarbeiten (nicht im Prüfmodus). */
  only?: readonly string[];
  /** Redaktioneller Stichtag (Aufhebung → `status: repealed`); Standard `EDITORIAL_REFERENCE_DATE`. */
  referenceDate?: string;
  /** Zeitstempel des Manifests; Standard jetzt. */
  now?: string;
}

export type PlannedFileStatus = 'new' | 'unchanged' | 'update' | 'conflict';

export interface PlannedFile {
  /** Pfad relativ zum Repository-Root. */
  path: string;
  content: string;
  status: PlannedFileStatus;
}

export interface ActOutcome {
  slug: string;
  file: string;
  /** `updated`: bereits materialisierter Akt, dessen Metadaten additiv fortgeschrieben wurden (Stichtag). */
  status: 'new' | 'unchanged' | 'updated' | 'error';
  versionId: string;
  textCheck?: TextCheckResult;
  textCheckSkipped?: string;
  textCheckOverride?: string;
}

export interface RecipeOutcome {
  file: string;
  amendmentAct: string;
  target: string;
  effectiveDate: string;
  status: 'new' | 'unchanged' | 'repeal' | 'blocked' | 'error';
  versionId: string | null;
  seedVersionId?: string;
  detail?: string;
}

export interface ConsolidationResult {
  jurisdiction: JurisdictionId;
  mode: ConsolidationMode;
  acts: ActOutcome[];
  recipes: RecipeOutcome[];
  blockedTargets: BlockedTarget[];
  files: PlannedFile[];
  /** Eingabefehler und Konflikte: nichts wird geschrieben, Exit 1. */
  errors: string[];
  /** Nur `check`: Abweichungen zwischen Neuaufbau und Bestand bzw. Manifest. */
  checkProblems: string[];
  manifest: ConsolidationManifest;
  manifestStatus: 'new' | 'unchanged' | 'update';
  written: string[];
  ok: boolean;
}

interface LoadedAct {
  file: string;
  act: SimulationAct;
}

interface LoadedRecipe {
  file: string;
  target: string;
  recipe: SimulationRecipe;
}

interface PlannedVersion {
  versionId: string;
  raw: RawObject;
  text: string;
  status: 'existing' | 'new';
  /** Durch den Lauf belegt: Baseline, materialisierte Akt-Fassung oder Rezeptergebnis (sonst verwaist). */
  covered: boolean;
}

/** Norm im Lauf: rohe Dateien (Platte) oder aus einem Akt gebaut; Änderungen werden nur angehängt. */
interface PlannedNorm {
  slug: string;
  origin: 'act' | 'disk';
  meta: RawObject;
  history: RawObject;
  versions: Map<string, PlannedVersion>;
  diskMetaText?: string;
  diskHistoryText?: string;
  metaChanged: boolean;
  historyChanged: boolean;
}

interface RunContext {
  root: string;
  jurisdiction: JurisdictionId;
  mode: ConsolidationMode;
  referenceDate: string;
  planned: Map<string, PlannedNorm>;
  diskMissing: Set<string>;
  errors: string[];
  blocked: BlockedTarget[];
  recipeOutcomes: RecipeOutcome[];
  manifestRecipes: ManifestRecipe[];
}

const RECIPE_FILE_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(\d{4}-\d{2}-\d{2}))?\.json$/u;

function relationKey(relation: { type: string; target: { jurisdiction?: string; slug: string } }): string {
  return `${relation.type}|${relation.target.jurisdiction ?? ''}|${relation.target.slug}`;
}

function entryKey(entry: unknown): string {
  return sha256(canonicalJson(entry));
}

function relationsOf(meta: RawObject): NormRelation[] {
  return Array.isArray(meta.relations) ? (meta.relations as NormRelation[]) : [];
}

/** Ergänzt eine Beziehung, wenn Typ und Ziel noch fehlen (Duplikate vermieden). */
function ensureRelation(norm: PlannedNorm, relation: NormRelation): void {
  const existing = relationsOf(norm.meta);
  if (existing.some((entry) => relationKey(entry) === relationKey(relation))) return;
  if (!Array.isArray(norm.meta.relations)) norm.meta.relations = [];
  (norm.meta.relations as NormRelation[]).push(relation);
  norm.metaChanged = true;
}

function ensureHistoryEntry(norm: PlannedNorm, entry: RawObject): void {
  const entries = Array.isArray(norm.history.entries) ? (norm.history.entries as RawObject[]) : [];
  const key = entryKey(entry);
  if (entries.some((existing) => entryKey(existing) === key)) return;
  if (!Array.isArray(norm.history.entries)) norm.history.entries = [];
  (norm.history.entries as RawObject[]).push(entry);
  norm.historyChanged = true;
}

function setMetaField(norm: PlannedNorm, key: string, value: unknown): void {
  if (norm.meta[key] === value) return;
  norm.meta[key] = value;
  norm.metaChanged = true;
}

function uniqueSourceReferences(references: readonly SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = JSON.stringify(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortedVersions(norm: PlannedNorm): PlannedVersion[] {
  return [...norm.versions.values()].sort((left, right) => String(left.raw.simulationValidFrom).localeCompare(String(right.raw.simulationValidFrom)));
}

function classifyEngineError(message: string): BlockedTargetCode {
  if (/hash weicht ab|alter Wert .* nicht gefunden|Normtitel wurde nicht gefunden/u.test(message)) return 'hash-mismatch';
  if (/statt genau einem Treffer|statt \d+ Treffer/u.test(message)) return 'anchor-mismatch';
  return 'recipe-failed';
}

/* ------------------------------------------------------------------------------------------------ */
/* Sim-Akte                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

function withDefined(entries: Array<[string, unknown]>): RawObject {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

/** meta.json eines Sim-Akts in der kanonischen Schlüsselreihenfolge der Importer. */
/** Geltungsstatus relativ zum redaktionellen Stichtag: vor dem Inkrafttreten `future-effective`, danach `in-force`. */
export function effectiveStatus(status: string, simulationValidFrom: string, referenceDate: string): string {
  if (status === 'in-force' || status === 'future-effective') return simulationValidFrom > referenceDate ? 'future-effective' : 'in-force';
  return status;
}

export function buildActMeta(act: SimulationAct, referenceDate: string = EDITORIAL_REFERENCE_DATE): RawObject {
  const { meta } = act;
  return withDefined([
    ['id', `${act.jurisdiction}:${act.slug}`],
    ['slug', act.slug],
    ['jurisdiction', act.jurisdiction],
    ['title', meta.title],
    ['shortTitle', meta.shortTitle],
    ['abbr', meta.abbr],
    ['shortTitleSource', meta.shortTitleSource],
    ['type', meta.type],
    ['status', effectiveStatus(meta.status, act.version.simulationValidFrom, referenceDate)],
    ['enactingBody', meta.enactingBody],
    ['responsibleBody', meta.responsibleBody],
    ['subjects', meta.subjects],
    ['primarySubject', meta.primarySubject],
    ['keywords', meta.keywords],
    ['initialCitation', meta.initialCitation],
    ['summary', meta.summary],
    ['summarySource', meta.summarySource],
    ['documentDate', meta.documentDate],
    ['publicationDate', meta.publicationDate],
    ['effectiveDate', meta.effectiveDate ?? act.version.simulationValidFrom],
    ['expiryDate', meta.expiryDate],
    ['dateNote', meta.dateNote],
    ['predecessor', meta.predecessor],
    ['predecessorTarget', meta.predecessorTarget],
    ['successor', meta.successor],
    ['successorTarget', meta.successorTarget],
    ['relations', meta.relations.map((relation) => withDefined(Object.entries(relation)))],
    ['externalIdentifiers', []],
    ['sourceReferences', (meta.sourceReferences ?? act.version.sourceReferences).map((reference) => withDefined(Object.entries(reference)))],
  ]);
}

export function buildActHistory(act: SimulationAct): RawObject {
  return {
    initialVersionId: act.version.versionId,
    entries: [
      withDefined([
        ['date', act.version.simulationValidFrom],
        ['type', 'initial'],
        ['title', 'Amtlich veröffentlicht (Simulation).'],
        ['citation', act.version.citation],
        ['note', `Verkündung: ${act.publication.slug}${act.publication.pages ? `, S. ${act.publication.pages}` : ''}`],
        ['affectingVersionId', act.version.versionId],
      ]),
    ],
  };
}

export function buildActVersion(act: SimulationAct): RawObject {
  const { version } = act;
  return withDefined([
    ['versionId', version.versionId],
    ['simulationValidFrom', version.simulationValidFrom],
    ['simulationValidTo', null],
    ['title', version.title],
    ['shortTitle', version.shortTitle],
    ['abbr', version.abbr],
    ['summary', version.summary],
    ['citation', version.citation],
    ['changeNote', version.changeNote],
    ['sourceReferences', version.sourceReferences.map((reference) => withDefined(Object.entries(reference)))],
    ['sourceNotes', version.sourceNotes],
    ['body', version.body],
  ]);
}

/** Vollständige Schemaprüfung eines geplanten Normdatensatzes (Meta, Historie, Fassungen, Baseline, Provenienz). */
function validatePlannedNorm(norm: PlannedNorm, jurisdiction: JurisdictionId): void {
  const context = normRelativeDir(jurisdiction, norm.slug);
  const record = validateNormRecord({
    meta: parseNormMeta(norm.meta, `${context}/meta.json`),
    history: parseNormHistory(norm.history, `${context}/history.json`),
    versions: sortedVersions(norm).map((version) => parseNormVersion(version.raw, `${context}/versions/${version.versionId}.json`)),
  }, context);
  if (record.meta.slug !== norm.slug) throw new ContentValidationError(`${context}/meta.json.slug: muss dem Verzeichnisnamen entsprechen`);
  if (record.meta.jurisdiction !== jurisdiction) throw new ContentValidationError(`${context}/meta.json.jurisdiction: muss „${jurisdiction}“ sein`);
  assertBaselineConsistency(record);
  assertSimulationProvenance(record, context);
}

async function loadSourceTexts(root: string, sha256Hex: string): Promise<string[]> {
  const texts: string[] = [];
  for (const suffix of ['.txt', '.layout.txt']) {
    const text = await readTextIfExists(join(root, CACHE_TEXT_DIR, `${sha256Hex}${suffix}`));
    if (text !== undefined && text.trim()) texts.push(text);
  }
  return texts;
}

async function loadActs(root: string, jurisdiction: JurisdictionId, errors: string[]): Promise<LoadedAct[]> {
  const directory = actsDir(jurisdiction);
  const loaded: LoadedAct[] = [];
  for (const fileName of await listJsonFiles(join(root, directory))) {
    const file = `${directory}/${fileName}`;
    try {
      const act = parseSimulationAct(parseJsonText((await readTextIfExists(join(root, file))) ?? '', file), file);
      if (act.slug !== fileName.replace(/\.json$/u, '')) throw new ContentValidationError(`${file}.slug: muss dem Dateinamen entsprechen`);
      if (act.jurisdiction !== jurisdiction) throw new ContentValidationError(`${file}.jurisdiction: muss „${jurisdiction}“ sein`);
      loaded.push({ file, act });
    } catch (error) {
      if (!(error instanceof ContentValidationError)) throw error;
      errors.push(error.message);
    }
  }
  return loaded;
}

async function loadRecipes(root: string, jurisdiction: JurisdictionId, errors: string[]): Promise<LoadedRecipe[]> {
  const directory = amendmentsDir(jurisdiction);
  const loaded: LoadedRecipe[] = [];
  for (const actSlug of await listDirectories(join(root, directory))) {
    for (const fileName of await listJsonFiles(join(root, directory, actSlug))) {
      const file = `${directory}/${actSlug}/${fileName}`;
      const match = RECIPE_FILE_PATTERN.exec(fileName);
      if (!match) {
        errors.push(`${file}: Dateiname muss <ziel-slug>.json oder <ziel-slug>.<YYYY-MM-DD>.json sein`);
        continue;
      }
      try {
        const recipe = parseSimulationRecipe(parseJsonText((await readTextIfExists(join(root, file))) ?? '', file), file);
        if (recipe.amendmentAct !== actSlug) throw new ContentValidationError(`${file}.amendmentAct: muss dem Aktverzeichnis „${actSlug}“ entsprechen`);
        if (match[2] !== undefined && match[2] !== recipe.effectiveDate) throw new ContentValidationError(`${file}: Datum im Dateinamen (${match[2]}) weicht vom Wirkdatum ${recipe.effectiveDate} ab`);
        loaded.push({ file, target: match[1]!, recipe });
      } catch (error) {
        if (!(error instanceof ContentValidationError)) throw error;
        errors.push(error.message);
      }
    }
  }
  return loaded;
}

async function materializeAct(context: RunContext, loaded: LoadedAct): Promise<{ outcome: ActOutcome; manifest?: ManifestAct }> {
  const { act, file } = loaded;
  const { jurisdiction, root } = context;
  const relative = normRelativeDir(jurisdiction, act.slug);
  const outcome: ActOutcome = { slug: act.slug, file, status: 'new', versionId: act.version.versionId };
  const problems: string[] = [];

  // Wortlautprobe gegen den Textauszug der Quelle.
  const sources = await loadSourceTexts(root, act.provenance.transcribedFrom);
  let textCheck: ManifestTextCheck;
  if (sources.length === 0) {
    const reason = `Textauszug ${CACHE_TEXT_DIR}/${act.provenance.transcribedFrom}.txt fehlt`;
    textCheck = { blocks: 0, found: 0, foundLoosely: 0, missing: 0, skipped: reason };
    outcome.textCheckSkipped = reason;
    if (act.provenance.textCheckOverride) outcome.textCheckOverride = act.provenance.textCheckOverride.reason;
    else if (context.mode !== 'check') problems.push(`${file}: Wortlautprobe nicht möglich – ${reason} (npm run import:simulation:inventory) oder provenance.textCheckOverride`);
  } else {
    const result = checkWording(act.version.body, sources);
    outcome.textCheck = result;
    textCheck = { blocks: result.blocks, found: result.found, foundLoosely: result.foundLoosely, missing: result.missing.length };
    if (result.missing.length > 0) {
      if (act.provenance.textCheckOverride) outcome.textCheckOverride = act.provenance.textCheckOverride.reason;
      else {
        const sample = result.missing.slice(0, 5).map((entry) => `${entry.path}: „${entry.text}“`).join('; ');
        problems.push(`${file}: Wortlautprobe gescheitert – ${result.missing.length} von ${result.blocks} Textstellen nicht in Quelle ${act.provenance.transcribedFrom} gefunden (${sample})`);
      }
    }
  }

  const meta = buildActMeta(act, context.referenceDate);
  const history = buildActHistory(act);
  const version = buildActVersion(act);
  const planned: PlannedNorm = {
    slug: act.slug,
    origin: 'act',
    meta,
    history,
    versions: new Map([[act.version.versionId, { versionId: act.version.versionId, raw: version, text: jsonText(version), status: 'new', covered: true }]]),
    metaChanged: true,
    historyChanged: true,
  };
  try {
    validatePlannedNorm(planned, jurisdiction);
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    problems.push(`${file}: ${error.message}`);
  }

  const disk = await readRawNorm(root, jurisdiction, act.slug);
  if (disk) {
    if (disk.versions.some((entry) => isBaselineVersionFile(`${entry.versionId}.json`))) {
      problems.push(`${file}: Slug ${act.slug} ist bereits durch eine Baseline-Norm belegt (${relative})`);
    } else {
      // Ein materialisierter Akt kann selbst fortgeschrieben sein (spätere Sim-Fassungen aus Rezepten, additive Historie,
      // Status/Aufhebung). Maßgeblich ist: seine eigene Fassung ist byteidentisch, ältere Fremdfassungen gibt es nicht,
      // seine Historieneinträge sind enthalten, und die übrigen Meta-Felder sind unverändert.
      const own = disk.versions.find((entry) => entry.versionId === act.version.versionId);
      const earlier = disk.versions.filter((entry) => entry.versionId !== act.version.versionId && entry.versionId <= act.version.versionId).map((entry) => entry.versionId);
      if (!own || earlier.length > 0) {
        problems.push(`${file}: ${relative}/versions enthält ${disk.versions.map((entry) => entry.versionId).join(', ') || 'keine Fassung'}, der Akt erzeugt ${act.version.versionId}`);
      } else if (own.text !== jsonText(version)) {
        problems.push(`${file}: ${relative}/versions/${act.version.versionId}.json existiert und weicht vom Akt ab (gespeicherte Fassungen sind unveränderlich)`);
      }
      const diskEntries = new Set((disk.history.entries as unknown[]).map((entry) => JSON.stringify(canonicalJson(entry))));
      const missingEntries = (history.entries as unknown[]).filter((entry) => !diskEntries.has(JSON.stringify(canonicalJson(entry))));
      const earlyForeign = (disk.history.entries as Array<{ date?: unknown }>).filter((entry) => !(history.entries as unknown[]).some((own) => JSON.stringify(canonicalJson(own)) === JSON.stringify(canonicalJson(entry))) && String(entry.date) <= act.version.versionId);
      if (missingEntries.length > 0 || earlyForeign.length > 0 || disk.history.initialVersionId !== history.initialVersionId) problems.push(`${file}: ${relative}/history.json existiert und weicht vom Akt ab (Historieneinträge des Akts fehlen oder fremde Einträge vor seinem Inkrafttreten)`);
      const additiveKeys = new Set(['relations', 'status', 'expiryDate', 'successor', 'successorTarget', 'keywords']);
      const differing = Object.keys({ ...disk.meta, ...meta }).filter((key) => !additiveKeys.has(key) && JSON.stringify(canonicalJson(disk.meta[key])) !== JSON.stringify(canonicalJson(meta[key])));
      if (differing.length > 0) problems.push(`${file}: ${relative}/meta.json existiert und weicht vom Akt ab (${differing.join(', ')}); Sim-Akte werden nicht umgeschrieben`);
    }
  }

  if (problems.length > 0) {
    outcome.status = 'error';
    context.errors.push(...problems);
    return { outcome };
  }

  if (disk) {
    // Bereits materialisiert: Platte ist maßgeblich; nur Beziehungen des Akts werden additiv ergänzt.
    const norm: PlannedNorm = {
      slug: act.slug,
      origin: 'disk',
      meta: disk.meta,
      history: disk.history,
      // Nur die eigene Fassung des Akts gilt als belegt; spätere Fassungen müssen ein Rezept dieses Laufs reproduzieren.
      versions: new Map(disk.versions.map((entry) => [entry.versionId, { versionId: entry.versionId, raw: entry.raw, text: entry.text, status: 'existing' as const, covered: entry.versionId === act.version.versionId }])),
      diskMetaText: disk.metaText,
      diskHistoryText: disk.historyText,
      metaChanged: false,
      historyChanged: false,
    };
    for (const relation of act.meta.relations) ensureRelation(norm, relation);
    // Stichtagsfortschreibung: Ein künftiges Inkrafttreten wird mit dem Stichtag zu `in-force` (und umgekehrt), additiv.
    const status = effectiveStatus(String(disk.meta.status), act.version.simulationValidFrom, context.referenceDate);
    if (status !== disk.meta.status) setMetaField(norm, 'status', status);
    context.planned.set(act.slug, norm);
    outcome.status = norm.metaChanged ? 'updated' : 'unchanged';
  } else {
    context.planned.set(act.slug, planned);
  }
  const manifest: ManifestAct = {
    slug: act.slug,
    versionId: act.version.versionId,
    versionSha256: sha256Text(jsonText(version)),
    metaSha256: sha256Text(jsonText(meta)),
    historySha256: sha256Text(jsonText(history)),
    publication: act.publication.slug,
    transcribedFrom: act.provenance.transcribedFrom,
    textCheck,
    ...(outcome.textCheckOverride ? { textCheckOverride: outcome.textCheckOverride } : {}),
  };
  return { outcome, manifest };
}

/* ------------------------------------------------------------------------------------------------ */
/* Rezepte                                                                                           */
/* ------------------------------------------------------------------------------------------------ */

async function getNorm(context: RunContext, slug: string): Promise<PlannedNorm | null> {
  const planned = context.planned.get(slug);
  if (planned) return planned;
  if (context.diskMissing.has(slug)) return null;
  const disk = await readRawNorm(context.root, context.jurisdiction, slug);
  if (!disk) {
    context.diskMissing.add(slug);
    return null;
  }
  const norm: PlannedNorm = {
    slug,
    origin: 'disk',
    meta: disk.meta,
    history: disk.history,
    versions: new Map(disk.versions.map((entry) => [entry.versionId, { versionId: entry.versionId, raw: entry.raw, text: entry.text, status: 'existing' as const, covered: isBaselineVersionFile(`${entry.versionId}.json`) }])),
    diskMetaText: disk.metaText,
    diskHistoryText: disk.historyText,
    metaChanged: false,
    historyChanged: false,
  };
  context.planned.set(slug, norm);
  return norm;
}

function block(context: RunContext, loaded: LoadedRecipe, code: BlockedTargetCode, reason: string): void {
  context.blocked.push({ target: loaded.target, amendmentAct: loaded.recipe.amendmentAct, recipe: loaded.file, effectiveDate: loaded.recipe.effectiveDate, code, reason });
  context.recipeOutcomes.push({ file: loaded.file, amendmentAct: loaded.recipe.amendmentAct, target: loaded.target, effectiveDate: loaded.recipe.effectiveDate, status: 'blocked', versionId: null, detail: `${code}: ${reason}` });
}

function failRecipes(context: RunContext, recipes: readonly LoadedRecipe[], message: string): void {
  context.errors.push(message);
  for (const loaded of recipes) {
    context.recipeOutcomes.push({ file: loaded.file, amendmentAct: loaded.recipe.amendmentAct, target: loaded.target, effectiveDate: loaded.recipe.effectiveDate, status: 'error', versionId: null, detail: message });
  }
}

async function consolidateTarget(context: RunContext, target: string, loadedRecipes: readonly LoadedRecipe[]): Promise<void> {
  const { jurisdiction, referenceDate } = context;
  const relative = normRelativeDir(jurisdiction, target);
  const recipes = [...loadedRecipes].sort((left, right) =>
    left.recipe.effectiveDate.localeCompare(right.recipe.effectiveDate)
    || (left.recipe.sameDayOrder ?? 0) - (right.recipe.sameDayOrder ?? 0)
    || left.file.localeCompare(right.file));

  const norm = await getNorm(context, target);
  if (!norm) {
    for (const loaded of recipes) block(context, loaded, 'target-missing', `Zielnorm ${target} ist nicht im Bestand (${relative} fehlt); der heutige Realtext wird nicht verwendet`);
    return;
  }

  // Änderungsakte müssen als Norm vorliegen (materialisierter Sim-Akt oder Bestand).
  const acts = new Map<string, PlannedNorm>();
  for (const loaded of recipes) {
    const actSlug = loaded.recipe.amendmentAct;
    if (actSlug === target) return failRecipes(context, recipes, `${loaded.file}: Änderungsakt und Zielnorm sind identisch`);
    const act = await getNorm(context, actSlug);
    if (!act) return failRecipes(context, recipes, `${loaded.file}: Änderungsakt ${actSlug} ist weder unter ${actsDir(jurisdiction)}/ noch unter content/norms/${jurisdiction}/ vorhanden`);
    acts.set(actSlug, act);
  }

  const groups = new Map<string, LoadedRecipe[]>();
  for (const loaded of recipes) groups.set(loaded.recipe.effectiveDate, [...(groups.get(loaded.recipe.effectiveDate) ?? []), loaded]);
  for (const [effectiveDate, group] of groups) {
    if (group.length > 1) {
      const orders = group.map((loaded) => loaded.recipe.sameDayOrder);
      if (orders.some((order) => order === undefined) || new Set(orders).size !== orders.length) {
        return failRecipes(context, recipes, `${relative}: mehrere Änderungen am ${effectiveDate} benötigen eindeutige ganzzahlige sameDayOrder-Werte (${group.map((loaded) => loaded.file).join(', ')})`);
      }
    }
    if (new Set(group.map((loaded) => loaded.recipe.versionId)).size !== 1) {
      return failRecipes(context, recipes, `${relative}: Änderungen am ${effectiveDate} verweisen auf verschiedene Folgefassungen`);
    }
    if (group.some((loaded) => loaded.recipe.repealsLaw) && group.length !== 1) {
      return failRecipes(context, recipes, `${relative}: vollständige Aufhebung am ${effectiveDate} darf nicht mit weiteren Änderungen gruppiert werden`);
    }
  }

  // Eine bereits aufgehobene Norm nimmt nur Rezepte vor der Aufhebung (sie müssen die gespeicherten Fassungen
  // reproduzieren) und dieselbe Aufhebung (idempotent) entgegen.
  const storedExpiry = typeof norm.meta.expiryDate === 'string' ? norm.meta.expiryDate : undefined;
  if (storedExpiry !== undefined) {
    for (const [effectiveDate, group] of groups) {
      if (previousDay(effectiveDate) < storedExpiry) continue;
      const sameRepeal = group.length === 1 && group[0]!.recipe.repealsLaw && previousDay(effectiveDate) === storedExpiry;
      if (!sameRepeal) return failRecipes(context, recipes, `${relative}: Norm ist zum ${storedExpiry} außer Kraft; weitere Änderungen oder Aufhebungen sind unzulässig (${group.map((loaded) => loaded.file).join(', ')})`);
    }
  }

  // Fassungen, die dieses Rezeptset selbst erzeugt (frühere Läufe, `--check`), zählen nicht als „spätere Fassung“:
  // Ketten mehrerer Rezepte an einer Zielnorm werden in Wirkdatumsfolge nachgebaut und je Gruppe gegen die
  // gespeicherte Datei verglichen.
  const plannedVersionIds = new Set([...groups.values()].map((group) => group[0]!.recipe.versionId));
  let blockedFrom: string | null = null;
  let repealed = false;
  for (const [effectiveDate, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (blockedFrom !== null) {
      for (const loaded of group) block(context, loaded, 'blocked-by-earlier-recipe', `Zielnorm ist ab ${blockedFrom} gesperrt; das Rezept wird nicht angewandt`);
      continue;
    }
    if (repealed) return failRecipes(context, group, `${relative}: Änderung nach vollständiger Aufhebung ist unzulässig (${group.map((loaded) => loaded.file).join(', ')})`);
    const versionId = group[0]!.recipe.versionId;
    const versions = sortedVersions(norm);
    const later = versions.filter((version) => !plannedVersionIds.has(version.versionId) && (String(version.raw.simulationValidFrom) > effectiveDate || (String(version.raw.simulationValidFrom) === effectiveDate && version.versionId !== versionId)));
    if (later.length > 0) {
      return failRecipes(context, group, `${relative}: unter versions/ liegt bereits eine Fassung ab ${later.map((version) => version.versionId).join(', ')}; Rezepte werden nur an das Ende der Fassungsfolge angefügt`);
    }
    const seed = versions.filter((version) => String(version.raw.simulationValidFrom) < effectiveDate).at(-1);
    if (!seed) {
      blockedFrom = effectiveDate;
      for (const loaded of group) block(context, loaded, 'seed-missing', `keine gespeicherte Fassung vor dem Wirkdatum ${effectiveDate}`);
      continue;
    }
    let state: ConsolidationState = {
      title: typeof seed.raw.title === 'string' ? seed.raw.title : String(norm.meta.title),
      body: structuredClone(seed.raw.body as RawBlock[]),
    };
    const seedHash = sha256({ title: state.title, body: state.body });

    let failed = false;
    for (const [index, loaded] of group.entries()) {
      if (failed) {
        block(context, loaded, 'blocked-by-earlier-recipe', `Zielnorm ist ab ${effectiveDate} gesperrt; das Rezept wird nicht angewandt`);
        continue;
      }
      try {
        state = applyPatchRecipe(state, { amendmentAct: loaded.recipe.amendmentAct, effectiveDate, operations: loaded.recipe.operations });
      } catch (error) {
        if (!(error instanceof ConsolidationError)) throw error;
        failed = true;
        blockedFrom = effectiveDate;
        const detail = index === 0 ? `Seed ${seed.versionId} (Hash ${seedHash}): ${error.message}` : error.message;
        block(context, loaded, classifyEngineError(error.message), detail);
      }
    }
    if (failed) continue;

    const repeal = group[0]!.recipe.repealsLaw;
    if (repeal) {
      if (!state.repealed) return failRecipes(context, group, `${relative}: Aufhebungsrezept markiert die Norm nicht als aufgehoben (${group[0]!.file})`);
      repealed = true;
      const expiry = previousDay(effectiveDate);
      setMetaField(norm, 'expiryDate', expiry);
      if (expiry <= referenceDate) setMetaField(norm, 'status', 'repealed');
    }

    let versionText: string | null = null;
    if (!repeal) {
      const versionRaw = withDefined([
        ['versionId', versionId],
        ['simulationValidFrom', effectiveDate],
        ['simulationValidTo', null],
        ['title', state.title !== norm.meta.title ? state.title : undefined],
        ['shortTitle', seed.raw.shortTitle],
        ['abbr', seed.raw.abbr],
        ['summary', seed.raw.summary],
        ['citation', group.at(-1)!.recipe.resultCitation],
        ['changeNote', group.map((loaded) => loaded.recipe.changeNote).join(' ')],
        ['sourceReferences', uniqueSourceReferences(group.flatMap((loaded) => loaded.recipe.sourceReferences)).map((reference) => withDefined(Object.entries(reference)))],
        ['body', state.body],
      ]);
      versionText = jsonText(versionRaw);
      const existing = norm.versions.get(versionId);
      if (existing) {
        if (existing.text !== versionText) {
          return failRecipes(context, group, `${relative}/versions/${versionId}.json existiert und weicht von der Konsolidierung ab (gespeicherte Fassungen sind unveränderlich; abweichende Rechtslage = neue Fassung)`);
        }
        existing.covered = true;
      } else {
        norm.versions.set(versionId, { versionId, raw: versionRaw, text: versionText, status: 'new', covered: true });
      }
    }

    for (const loaded of group) {
      const { recipe } = loaded;
      const act = acts.get(recipe.amendmentAct)!;
      ensureHistoryEntry(norm, withDefined([
        ['date', effectiveDate],
        ['type', repeal ? 'repeal' : 'amendment'],
        ['title', recipe.changeNote],
        ['citation', recipe.amendmentCitation],
        ['affectingVersionId', repeal ? null : versionId],
        ['relatedNorm', { slug: recipe.amendmentAct }],
      ]));
      const note = recipe.commandCoverage?.length ? recipe.commandCoverage.join('; ') : undefined;
      ensureRelation(norm, withDefined([['type', repeal ? 'repealed-by' : 'amended-by'], ['target', { slug: recipe.amendmentAct }], ['note', note], ['date', effectiveDate]]) as unknown as NormRelation);
      ensureRelation(act, { type: repeal ? 'repeals' : 'amends', target: { slug: target }, date: effectiveDate });
      if (repeal && relationsOf(act.meta).some((relation) => relation.type === 'replaces' && !relation.target.jurisdiction && relation.target.slug === target)) {
        ensureRelation(norm, { type: 'replaced-by', target: { slug: recipe.amendmentAct }, date: effectiveDate });
        if (norm.meta.successor === null || norm.meta.successor === undefined) {
          setMetaField(norm, 'successor', String(act.meta.title));
          setMetaField(norm, 'successorTarget', { slug: recipe.amendmentAct });
        }
      }
      const existing = versionText === null ? undefined : norm.versions.get(versionId);
      context.recipeOutcomes.push({
        file: loaded.file,
        amendmentAct: recipe.amendmentAct,
        target,
        effectiveDate,
        status: repeal ? 'repeal' : existing?.status === 'existing' ? 'unchanged' : 'new',
        versionId: repeal ? null : versionId,
        seedVersionId: seed.versionId,
      });
      context.manifestRecipes.push({
        recipe: loaded.file,
        amendmentAct: recipe.amendmentAct,
        target,
        effectiveDate,
        ...(recipe.sameDayOrder !== undefined ? { sameDayOrder: recipe.sameDayOrder } : {}),
        repealsLaw: repeal,
        seedVersionId: seed.versionId,
        seedHash,
        versionId: repeal ? null : versionId,
        versionSha256: versionText === null ? null : sha256Text(versionText),
      });
    }
  }

  try {
    validatePlannedNorm(norm, jurisdiction);
  } catch (error) {
    if (!(error instanceof ContentValidationError)) throw error;
    context.errors.push(`${relative}: Ergebnis der Konsolidierung ist ungültig – ${error.message}`);
    for (const outcome of context.recipeOutcomes) if (outcome.target === target && outcome.status !== 'blocked') outcome.status = 'error';
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* Lauf                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

function plannedFiles(context: RunContext): PlannedFile[] {
  const files: PlannedFile[] = [];
  for (const norm of [...context.planned.values()].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const relative = normRelativeDir(context.jurisdiction, norm.slug);
    if (norm.origin === 'act') {
      files.push({ path: `${relative}/meta.json`, content: jsonText(norm.meta), status: 'new' });
      files.push({ path: `${relative}/history.json`, content: jsonText(norm.history), status: 'new' });
    } else {
      files.push({ path: `${relative}/meta.json`, content: norm.metaChanged ? jsonText(norm.meta) : norm.diskMetaText!, status: norm.metaChanged ? 'update' : 'unchanged' });
      files.push({ path: `${relative}/history.json`, content: norm.historyChanged ? jsonText(norm.history) : norm.diskHistoryText!, status: norm.historyChanged ? 'update' : 'unchanged' });
    }
    for (const version of sortedVersions(norm)) {
      if (!version.covered) continue; // verwaiste Fassung: meldet die Rückwärtsprüfung
      files.push({ path: `${relative}/versions/${version.versionId}.json`, content: version.text, status: version.status === 'new' ? 'new' : 'unchanged' });
    }
  }
  return files;
}

/** Bestand gegen den Plan: jede Sim-Fassung und jede Sim-Norm unter content/ muss aus Akt oder Rezept stammen. */
async function reverseScan(context: RunContext, files: readonly PlannedFile[], actSlugs: ReadonlySet<string>): Promise<string[]> {
  const problems: string[] = [];
  const plannedPaths = new Set(files.map((file) => file.path));
  const base = join(context.root, 'content', 'norms', context.jurisdiction);
  for (const slug of await listDirectories(base)) {
    const relative = normRelativeDir(context.jurisdiction, slug);
    const versionFiles = await listJsonFiles(join(base, slug, 'versions'));
    const hasBaseline = versionFiles.some(isBaselineVersionFile);
    if (!hasBaseline && !actSlugs.has(slug)) {
      problems.push(`${relative}: Norm ohne Baseline-Fassung ist kein materialisierter Sim-Akt (${actsDir(context.jurisdiction)}/${slug}.json fehlt)`);
      continue;
    }
    for (const fileName of versionFiles) {
      if (isBaselineVersionFile(fileName)) continue;
      const path = `${relative}/versions/${fileName}`;
      if (!plannedPaths.has(path)) problems.push(`${path}: Sim-Fassung entsteht aus keinem Rezept und keinem Akt`);
    }
  }
  return problems;
}

export async function runConsolidation(options: ConsolidationOptions): Promise<ConsolidationResult> {
  const { root, jurisdiction, mode } = options;
  const referenceDate = options.referenceDate ?? EDITORIAL_REFERENCE_DATE;
  const context: RunContext = { root, jurisdiction, mode, referenceDate, planned: new Map(), diskMissing: new Set(), errors: [], blocked: [], recipeOutcomes: [], manifestRecipes: [] };
  const only = mode === 'check' ? undefined : options.only;

  let acts = await loadActs(root, jurisdiction, context.errors);
  let recipes = await loadRecipes(root, jurisdiction, context.errors);
  if (only && only.length > 0) {
    const wanted = new Set(only);
    acts = acts.filter((loaded) => wanted.has(loaded.act.slug));
    recipes = recipes.filter((loaded) => wanted.has(loaded.target) || wanted.has(loaded.recipe.amendmentAct));
  }

  const actOutcomes: ActOutcome[] = [];
  const manifestActs: ManifestAct[] = [];
  for (const loaded of acts) {
    const { outcome, manifest } = await materializeAct(context, loaded);
    actOutcomes.push(outcome);
    if (manifest) manifestActs.push(manifest);
  }

  const byTarget = new Map<string, LoadedRecipe[]>();
  for (const loaded of recipes) byTarget.set(loaded.target, [...(byTarget.get(loaded.target) ?? []), loaded]);
  for (const [target, group] of [...byTarget.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    await consolidateTarget(context, target, group);
  }

  const files = plannedFiles(context);
  for (const file of files) if (file.status === 'conflict') context.errors.push(`${file.path}: Konflikt`);

  const manifestRecipes = [...context.manifestRecipes].sort((left, right) => left.recipe.localeCompare(right.recipe));
  const blockedTargets = [...context.blocked].sort((left, right) => left.recipe.localeCompare(right.recipe));
  const manifest: ConsolidationManifest = {
    schemaVersion: CONSOLIDATION_MANIFEST_SCHEMA,
    jurisdiction,
    generatedAt: options.now ?? new Date().toISOString(),
    baselineDate: SIMULATION_BASELINE_DATE,
    referenceDate,
    counts: {
      acts: manifestActs.length,
      recipes: manifestRecipes.length,
      versions: manifestRecipes.filter((entry) => entry.versionId !== null).length,
      repeals: manifestRecipes.filter((entry) => entry.repealsLaw).length,
      blockedTargets: blockedTargets.length,
    },
    acts: manifestActs.sort((left, right) => left.slug.localeCompare(right.slug)),
    recipes: manifestRecipes,
    blockedTargets,
  };

  const manifestFile = manifestPath(jurisdiction);
  const existingManifestText = await readTextIfExists(join(root, manifestFile));
  let existingManifest: ConsolidationManifest | undefined;
  if (existingManifestText !== undefined) {
    const parsed = parseJsonText(existingManifestText, manifestFile);
    if (parsed.schemaVersion !== CONSOLIDATION_MANIFEST_SCHEMA) context.errors.push(`${manifestFile}: unbekannte Schemaversion ${String(parsed.schemaVersion)}`);
    else existingManifest = parsed as unknown as ConsolidationManifest;
  }
  const manifestEmpty = manifest.acts.length === 0 && manifest.recipes.length === 0 && manifest.blockedTargets.length === 0;
  let manifestStatus: ConsolidationResult['manifestStatus'];
  if (existingManifest && comparableManifest(existingManifest) === comparableManifest(manifest)) {
    manifest.generatedAt = existingManifest.generatedAt;
    manifestStatus = 'unchanged';
  } else if (existingManifest) manifestStatus = 'update';
  else manifestStatus = manifestEmpty && !only ? 'unchanged' : 'new';
  if (only && only.length > 0 && existingManifest) {
    // Teillauf: Einträge außerhalb der Auswahl bleiben erhalten.
    const wanted = new Set(only);
    const keepAct = (entry: ManifestAct): boolean => !wanted.has(entry.slug);
    const keepRecipe = (entry: { target: string; amendmentAct: string }): boolean => !wanted.has(entry.target) && !wanted.has(entry.amendmentAct);
    manifest.acts = [...existingManifest.acts.filter(keepAct), ...manifest.acts].sort((left, right) => left.slug.localeCompare(right.slug));
    manifest.recipes = [...existingManifest.recipes.filter(keepRecipe), ...manifest.recipes].sort((left, right) => left.recipe.localeCompare(right.recipe));
    manifest.blockedTargets = [...existingManifest.blockedTargets.filter(keepRecipe), ...manifest.blockedTargets].sort((left, right) => left.recipe.localeCompare(right.recipe));
    manifest.counts = { acts: manifest.acts.length, recipes: manifest.recipes.length, versions: manifest.recipes.filter((entry) => entry.versionId !== null).length, repeals: manifest.recipes.filter((entry) => entry.repealsLaw).length, blockedTargets: manifest.blockedTargets.length };
    manifestStatus = comparableManifest(existingManifest) === comparableManifest(manifest) ? 'unchanged' : 'update';
    if (manifestStatus === 'unchanged') manifest.generatedAt = existingManifest.generatedAt;
  }

  const checkProblems: string[] = [];
  if (mode === 'check') {
    for (const file of files) {
      if (file.status === 'new') checkProblems.push(`${file.path}: fehlt im Bestand (Neuaufbau erzeugt die Datei)`);
      else if (file.status === 'update') checkProblems.push(`${file.path}: Neuaufbau ergänzt Felder, die im Bestand fehlen (consolidate --write ausstehend)`);
    }
    checkProblems.push(...(await reverseScan(context, files, new Set(acts.map((loaded) => loaded.act.slug)))));
    if (manifestStatus !== 'unchanged') {
      checkProblems.push(existingManifest ? `${manifestFile}: entspricht nicht dem Neuaufbau (consolidate --write aktualisiert das Manifest)` : `${manifestFile}: fehlt, obwohl Akte oder Rezepte vorliegen`);
    }
  }

  const written: string[] = [];
  const ok = context.errors.length === 0 && checkProblems.length === 0;
  if (mode === 'write' && context.errors.length === 0) {
    for (const file of files) {
      if (file.status !== 'new' && file.status !== 'update') continue;
      await mkdir(dirname(join(root, file.path)), { recursive: true });
      await writeFileAtomic(join(root, file.path), file.content);
      written.push(file.path);
    }
    if (manifestStatus !== 'unchanged') {
      await mkdir(dirname(join(root, manifestFile)), { recursive: true });
      await writeFileAtomic(join(root, manifestFile), jsonText(manifest));
      written.push(manifestFile);
    }
  }

  return {
    jurisdiction,
    mode,
    acts: actOutcomes.sort((left, right) => left.slug.localeCompare(right.slug)),
    recipes: context.recipeOutcomes.sort((left, right) => left.file.localeCompare(right.file)),
    blockedTargets,
    files,
    errors: context.errors,
    checkProblems,
    manifest,
    manifestStatus,
    written,
    ok,
  };
}

/** Eine Zeile je Akt/Rezept für die Konsole. */
export function renderConsolidationLines(result: ConsolidationResult): string[] {
  const lines: string[] = [];
  const modeLabel = { 'dry-run': 'Prüflauf (Dry-run)', write: 'Schreiblauf', check: 'Prüfung gegen den Bestand (--check)' }[result.mode];
  lines.push(`Konsolidierung ${result.jurisdiction}: ${modeLabel}`);
  for (const act of result.acts) {
    const text = act.textCheck
      ? `Wortlautprobe ${act.textCheck.found}/${act.textCheck.blocks}${act.textCheck.foundLoosely ? ` (${act.textCheck.foundLoosely} lose)` : ''}${act.textCheck.missing.length ? `, ${act.textCheck.missing.length} fehlend` : ''}`
      : `Wortlautprobe übersprungen (${act.textCheckSkipped ?? 'ohne Befund'})`;
    const override = act.textCheckOverride ? `; Override: ${act.textCheckOverride}` : '';
    lines.push(`Akt      ${act.slug.padEnd(48)} ${act.status.padEnd(9)} Fassung ${act.versionId}  ${text}${override}`);
  }
  for (const recipe of result.recipes) {
    const target = recipe.versionId ? `→ versions/${recipe.versionId}.json` : recipe.status === 'repeal' ? '→ Aufhebung (keine neue Fassung)' : '';
    const detail = recipe.detail ? `  ${recipe.detail}` : '';
    lines.push(`Rezept   ${recipe.file.replace(/^data\/simulation\/[^/]+\/amendments\//u, '').padEnd(48)} ${recipe.status.padEnd(9)} ${recipe.effectiveDate} ${target}${detail}`);
  }
  const changes = result.files.filter((file) => file.status === 'new' || file.status === 'update');
  lines.push(`Dateien: ${changes.length} neu/ergänzt, ${result.files.length - changes.length} unverändert; Manifest ${result.manifestStatus}; gesperrte Ziele: ${result.blockedTargets.length}`);
  for (const problem of result.checkProblems) lines.push(`Abweichung: ${problem}`);
  for (const error of result.errors) lines.push(`Fehler: ${error}`);
  if (result.mode === 'write') lines.push(result.written.length > 0 ? `Geschrieben: ${result.written.join(', ')}` : 'Nichts geschrieben.');
  else if (result.mode === 'dry-run') lines.push(changes.length > 0 ? `Dry-run: ${changes.length} Datei(en) würden geschrieben (--write).` : 'Dry-run: keine Änderungen.');
  return lines;
}
