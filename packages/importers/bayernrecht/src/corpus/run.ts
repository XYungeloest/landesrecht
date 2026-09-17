/**
 * Ablauf des Befehls `sample`: Beispielkorpus laden, Pakete unverändert ablegen, Strukturfälle am
 * Paket nachprüfen, Übersicht schreiben.
 *
 *   sources/bayernrecht/<id>/<id>.zip          das Exportpaket, Byte für Byte wie empfangen
 *   sources/bayernrecht/<id>/<id>.source.json  Begleitdatei: Adresse, SHA-256, Content-Type, Größe, Abrufzeit
 *   data/imports/bayernrecht/corpus.json       Übersicht mit dem Grund je Norm und dem geprüften Befund
 *
 * Rund 28 Abrufe, einer je Norm; Wiederholungsläufe kommen aus dem Cache. Die Rohquellen liegen
 * bewusst unter `sources/` und nicht in R2: Das ist der Beispielkorpus, nicht der Bulk-Bestand
 * (`sources/README.md`). Ohne `--write` wird nichts geschrieben – geprüft wird trotzdem, damit der
 * Dry-run dieselbe Aussage trifft wie der Schreiblauf.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeFileAtomic, writeJsonAtomic } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { stableStringify } from '@landesrecht/importer-recht-nrw/common/stable-json.ts';

import { BASELINE_DATE, IMPORT_DATA_DIR, type SourceArea } from '../common/constants.ts';
import { createBayernRechtFetcher, type BayernRechtFetcherOptions } from '../common/fetcher.ts';
import { readEnumeration, type EnumerationItem } from '../enumerate/enumeration.ts';
import type { NormType } from '../enumerate/portal.ts';
import { inspectPackage, type PackageInspection, type StructureCase } from './inspect.ts';
import { checkCoverage, CORPUS, CORPUS_MAXIMUM, duplicateCorpusIds, type CorpusCandidate, type CoverageRequirement } from './selection.ts';

export const CORPUS_SCHEMA = 'bayernrecht-sample-corpus/1' as const;
export const CORPUS_PATH = `${IMPORT_DATA_DIR}/corpus.json`;
/** Ablage der Rohquellen des Beispielkorpus (nicht versioniert, siehe sources/README.md). */
export const CORPUS_SOURCE_DIR = 'sources/bayernrecht';

export function corpusPackagePath(documentId: string): string {
  return `${CORPUS_SOURCE_DIR}/${documentId}/${documentId}.zip`;
}

export function corpusSidecarPath(documentId: string): string {
  return `${CORPUS_SOURCE_DIR}/${documentId}/${documentId}.source.json`;
}

/** Begleitdatei eines Pakets – der Beleg, dass genau diese Bytes von genau dieser Adresse stammen. */
export interface CorpusSourceRecord {
  documentId: string;
  url: string;
  sha256: string;
  contentType: string;
  byteLength: number;
  retrievedAt: string;
  /** Adresse der Dokumentseite im Portal (der Mensch schaut dort nach, nicht im ZIP). */
  documentUrl: string;
}

export interface CorpusEntry {
  documentId: string;
  sourceArea: SourceArea;
  normType: NormType | 'unbekannt';
  bayRsNumber?: string;
  title: string;
  /** Warum diese Norm im Korpus ist. */
  reason: string;
  /** Erwartete Strukturfälle laut Auswahl. */
  expectedCases: StructureCase[];
  /** Am Paket festgestellte Strukturfälle. */
  cases: StructureCase[];
  /** Erwartet, aber nicht gefunden – ein Befund, keine Nebensache. */
  missingExpected: StructureCase[];
  /** Gefunden, aber nicht erwartet – erweitert die Abdeckung. */
  additionalCases: StructureCase[];
  /** Jüngste Änderung laut Fortführungsnachweis. */
  latestChange?: string;
  changedAfterBaseline?: boolean;
  /** Spannweiten, die dieser Eintrag im Korpus markiert (kürzester/längster Normtext, kürzestes/längstes Gesetz). */
  extremes?: CorpusExtreme[];
  package: CorpusSourceRecord & { path: string; sidecarPath: string; entries: number; xmlPath: string; xmlByteLength: number; mimetype?: string; doctype?: string; buildDate?: string; pdfAttachments: number; imageAttachments: number };
  counts: PackageInspection['counts'];
}

export interface CorpusFile {
  schemaVersion: typeof CORPUS_SCHEMA;
  baselineDate: string;
  generatedAt: string;
  contentFingerprint: string;
  coverage: { requirements: Array<CoverageRequirement & { actual: number; ok: boolean }>; ok: boolean };
  entries: CorpusEntry[];
}

/** Spannweiten des Korpus; sie stehen erst nach dem Abruf fest und werden deshalb gemessen, nicht behauptet. */
export const CORPUS_EXTREMES = ['kuerzester-normtext', 'laengster-normtext', 'kuerzestes-gesetz', 'laengstes-gesetz'] as const;
export type CorpusExtreme = (typeof CORPUS_EXTREMES)[number];

export interface SampleOptions {
  root: string;
  write: boolean;
  offline: boolean;
  refresh: boolean;
  area?: SourceArea;
  limit?: number;
  only?: readonly string[];
  cacheDir?: string;
  now?: () => string;
  log?: (line: string) => void;
}

export interface SampleResult {
  corpus: CorpusFile;
  written: boolean;
  path: string;
  /** Normen, deren Rohquellen in diesem Lauf neu geschrieben wurden (unveränderte zählen nicht mit). */
  archived: number;
  networkRequests: number;
  cacheHits: number;
  /** Alles, was den Korpus unbrauchbar machen würde; leer heißt in Ordnung. */
  problems: string[];
  /** Normen, die dieser Lauf wegen --limit/--only nicht angefasst hat. */
  skipped: string[];
}

function corpusFingerprint(file: Pick<CorpusFile, 'baselineDate' | 'coverage' | 'entries'>): string {
  return createHash('sha256').update(stableStringify({ baselineDate: file.baselineDate, coverage: file.coverage, entries: file.entries })).digest('hex');
}

function selectCandidates(options: SampleOptions): { selected: CorpusCandidate[]; skipped: string[] } {
  let candidates = [...CORPUS];
  if (options.area) candidates = candidates.filter((candidate) => candidate.sourceArea === options.area);
  if (options.only && options.only.length > 0) {
    const wanted = new Set(options.only);
    candidates = candidates.filter((candidate) => wanted.has(candidate.documentId));
  }
  const selected = options.limit === undefined ? candidates : candidates.slice(0, options.limit);
  const chosen = new Set(selected.map((candidate) => candidate.documentId));
  return { selected, skipped: CORPUS.filter((candidate) => !chosen.has(candidate.documentId)).map((candidate) => candidate.documentId) };
}

export async function runSample(options: SampleOptions): Promise<SampleResult> {
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? ((): string => new Date().toISOString());
  const problems: string[] = [...duplicateCorpusIds().map((id) => `${id}: doppelt im Korpus`)];
  if (CORPUS.length > CORPUS_MAXIMUM) problems.push(`Der Korpus umfasst ${CORPUS.length} Normen und überschreitet die Obergrenze von ${CORPUS_MAXIMUM}`);

  const enumerations = new Map<SourceArea, Map<string, EnumerationItem>>();
  for (const area of ['landesrecht', 'vwv'] as const) {
    const file = await readEnumeration(options.root, area);
    if (!file) {
      problems.push(`Enumeration ${area} fehlt – zuerst „enumerate --area ${area} --write“ ausführen`);
      continue;
    }
    enumerations.set(area, new Map(file.items.map((item) => [item.documentId, item])));
  }

  const fetcherOptions: BayernRechtFetcherOptions = { root: options.root, offline: options.offline, refresh: options.refresh };
  if (options.cacheDir) fetcherOptions.cacheDir = options.cacheDir;
  const fetcher = createBayernRechtFetcher(fetcherOptions);

  const { selected, skipped } = selectCandidates(options);
  const entries: CorpusEntry[] = [];
  let archived = 0;
  for (const candidate of selected) {
    const item = enumerations.get(candidate.sourceArea)?.get(candidate.documentId);
    if (!item) {
      problems.push(`${candidate.documentId}: steht nicht in der Enumeration ${candidate.sourceArea} – der Korpus verweist auf eine Norm, die das Portal nicht (mehr) führt`);
      continue;
    }
    const document = await fetcher.fetch(item.zipUrl);
    if (!/zip/iu.test(document.contentType)) {
      problems.push(`${candidate.documentId}: ${item.zipUrl} liefert ${document.contentType} statt eines ZIP-Pakets`);
      continue;
    }
    let inspection: PackageInspection;
    try {
      inspection = inspectPackage(document.bytes);
    } catch (error) {
      problems.push(`${candidate.documentId}: Paket nicht lesbar – ${(error as Error).message}`);
      continue;
    }
    const source: CorpusSourceRecord = {
      documentId: candidate.documentId,
      url: document.url,
      sha256: document.sha256,
      contentType: document.contentType,
      byteLength: document.bytes.byteLength,
      retrievedAt: document.retrievedAt,
      documentUrl: item.sourceUrl,
    };
    if (options.write) {
      // Unveränderte Bytes werden nicht neu geschrieben: Der Korpus umfasst über 50 MB Rohquellen, und
      // ein Wiederholungslauf soll weder mtimes noch Diffs erzeugen.
      const packageWritten = await writeFileAtomic(join(options.root, corpusPackagePath(candidate.documentId)), document.bytes);
      const sidecarWritten = await writeJsonAtomic(join(options.root, corpusSidecarPath(candidate.documentId)), source);
      if (packageWritten || sidecarWritten) archived += 1;
    }
    const missingExpected = candidate.expectedCases.filter((value) => !inspection.cases.includes(value));
    const additionalCases = inspection.cases.filter((value) => !candidate.expectedCases.includes(value));
    if (missingExpected.length > 0) problems.push(`${candidate.documentId}: erwartete Strukturfälle fehlen im Paket (${missingExpected.join(', ')})`);
    const entry: CorpusEntry = {
      documentId: candidate.documentId,
      sourceArea: candidate.sourceArea,
      normType: item.normType,
      title: item.title,
      reason: candidate.reason,
      expectedCases: [...candidate.expectedCases],
      cases: inspection.cases,
      missingExpected,
      additionalCases,
      package: {
        ...source,
        path: corpusPackagePath(candidate.documentId),
        sidecarPath: corpusSidecarPath(candidate.documentId),
        entries: inspection.entries.length,
        xmlPath: inspection.xmlPath,
        xmlByteLength: inspection.xmlByteLength,
        pdfAttachments: inspection.pdfAttachments,
        imageAttachments: inspection.imageAttachments,
        ...(inspection.mimetype ? { mimetype: inspection.mimetype } : {}),
        ...(inspection.doctype ? { doctype: inspection.doctype } : {}),
        ...(inspection.buildDate ? { buildDate: inspection.buildDate } : {}),
      },
      counts: inspection.counts,
    };
    if (item.bayRsNumber) entry.bayRsNumber = item.bayRsNumber;
    if (item.latestChange) entry.latestChange = item.latestChange;
    if (item.changedAfterBaseline !== undefined) entry.changedAfterBaseline = item.changedAfterBaseline;
    entries.push(entry);
    log(`${candidate.documentId.padEnd(24)} ${String(document.bytes.byteLength).padStart(9)} B ${document.fromCache ? 'Cache' : 'Netz '} · ${inspection.doctype ?? '?'} · ${inspection.cases.join(', ')}`);
  }

  // Spannweiten – erst nach dem Abruf messbar, deshalb hier und nicht in der Auswahl. Gemessen wird der
  // Normtext (XML), nicht das Paket: Ein 19-MB-Paket kann eine Bildbeilage zu einem kurzen Text sein.
  const mark = (candidates: readonly CorpusEntry[], shortest: CorpusExtreme, longest: CorpusExtreme): void => {
    if (candidates.length < 2) return;
    const sorted = [...candidates].sort((left, right) => left.package.xmlByteLength - right.package.xmlByteLength);
    for (const [entry, extreme] of [[sorted[0]!, shortest], [sorted[sorted.length - 1]!, longest]] as const) entry.extremes = [...(entry.extremes ?? []), extreme];
  };
  mark(entries, 'kuerzester-normtext', 'laengster-normtext');
  mark(entries.filter((entry) => entry.normType === 'ges'), 'kuerzestes-gesetz', 'laengstes-gesetz');
  entries.sort((left, right) => (left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0));

  const requirements = checkCoverage(entries);
  const complete = selected.length === CORPUS.length;
  // Die Abdeckung gilt für den ganzen Korpus; ein Teillauf (--limit/--only) beurteilt sie nicht.
  if (complete) for (const requirement of requirements.filter((entry) => !entry.ok)) problems.push(`Abdeckung ${requirement.id}: ${requirement.actual} von mindestens ${requirement.minimum} (${requirement.description})`);
  const corpus: CorpusFile = {
    schemaVersion: CORPUS_SCHEMA,
    baselineDate: BASELINE_DATE,
    generatedAt: now(),
    contentFingerprint: '',
    coverage: { requirements, ok: requirements.every((requirement) => requirement.ok) },
    entries,
  };
  corpus.contentFingerprint = corpusFingerprint(corpus);
  const written = options.write && complete ? await writeCorpus(options.root, corpus) : false;
  if (options.write && !complete) log('Teillauf (--limit/--only): corpus.json wird nicht geschrieben, weil die Übersicht sonst unvollständig wäre.');
  return { corpus, written, path: CORPUS_PATH, archived, networkRequests: fetcher.stats.networkRequests, cacheHits: fetcher.stats.cacheHits, problems, skipped };
}

/** Ein Eintrag je Zeile: der Korpus bleibt zeilenweise diffbar. */
export function corpusJsonText(file: CorpusFile): string {
  const { entries, ...header } = file;
  const head = JSON.stringify(header, null, 2).replace(/\n\}$/u, '');
  return `${head},\n  "entries": [\n${entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`;
}

/**
 * Schreibt die Übersicht atomar. Ändert sich fachlich nichts, behält sie ihr altes Erstellungsdatum –
 * ein Wiederholungslauf erzeugt sonst allein wegen der Uhrzeit einen Diff.
 */
export async function writeCorpus(root: string, file: CorpusFile): Promise<boolean> {
  const fingerprint = corpusFingerprint(file);
  const previous = await readJsonFile<CorpusFile>(join(root, CORPUS_PATH));
  const generatedAt = previous?.contentFingerprint === fingerprint ? previous.generatedAt : file.generatedAt;
  return writeFileAtomic(join(root, CORPUS_PATH), corpusJsonText({ ...file, generatedAt, contentFingerprint: fingerprint }));
}

export function corpusSummary(result: SampleResult): string[] {
  const corpus = result.corpus;
  const byType = new Map<string, number>();
  for (const entry of corpus.entries) byType.set(entry.normType, (byType.get(entry.normType) ?? 0) + 1);
  const extreme = (value: CorpusExtreme): CorpusEntry | undefined => corpus.entries.find((entry) => entry.extremes?.includes(value));
  const shortest = extreme('kuerzester-normtext');
  const longest = extreme('laengster-normtext');
  return [
    `Beispielkorpus: ${corpus.entries.length} Normen (${[...byType].map(([type, count]) => `${type} ${count}`).join(', ')})`,
    `  Strukturfälle: ${[...new Set(corpus.entries.flatMap((entry) => entry.cases))].sort().join(', ')}`,
    `  kürzester Normtext ${shortest ? `${shortest.documentId} (${shortest.package.xmlByteLength} B)` : '–'} · längster ${longest ? `${longest.documentId} (${longest.package.xmlByteLength} B)` : '–'}`,
    `  kürzestes Gesetz ${extreme('kuerzestes-gesetz')?.documentId ?? '–'} · längstes Gesetz ${extreme('laengstes-gesetz')?.documentId ?? '–'}`,
    `  Stichtag: ${corpus.entries.filter((entry) => entry.changedAfterBaseline === true).length} nach ${corpus.baselineDate} geändert, ${corpus.entries.filter((entry) => entry.changedAfterBaseline === false).length} unverändert, ${corpus.entries.filter((entry) => entry.changedAfterBaseline === undefined).length} ohne datierte Notiz`,
    `  Abdeckung${result.skipped.length > 0 ? ' (Teillauf, nicht maßgeblich)' : ''} ${corpus.coverage.ok ? 'vollständig' : `unvollständig: ${corpus.coverage.requirements.filter((requirement) => !requirement.ok).map((requirement) => `${requirement.id} ${requirement.actual}/${requirement.minimum}`).join(', ')}`}`,
    `  Rohquellen neu geschrieben: ${result.archived} · Netzabrufe ${result.networkRequests}, Cache-Treffer ${result.cacheHits}`,
    ...(result.skipped.length > 0 ? [`  Teillauf: ${result.skipped.length} Norm(en) ausgelassen (${result.skipped.slice(0, 5).join(', ')}${result.skipped.length > 5 ? ' …' : ''})`] : []),
    ...(result.problems.length > 0 ? [`  Probleme: ${result.problems.join('; ')}`] : []),
  ];
}
