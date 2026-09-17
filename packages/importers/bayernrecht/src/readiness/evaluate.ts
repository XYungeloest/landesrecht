/**
 * Bereitschaftsprüfung des BayWü-Ausgangsimports (`npm run import:bayernrecht:readiness`):
 * maschinenlesbares READY / NOT READY mit benannten Blockern, geprüft gegen die GO/No-Go-Liste in
 * `docs/BAYERN_BULK_READINESS.md`.
 *
 * Dieses Modul liest den Bestand; die Bewertung selbst steht in `checks.ts` (reine Funktionen, je
 * Prüfung einzeln testbar). Kein Netzabruf, kein Cloudflare-Aufruf: Der Enumerations-Fixpunkt wird aus
 * dem Abrufcache gerechnet (Offline-Fetcher), alles andere aus Dateien des Arbeitsverzeichnisses.
 *
 * **Deterministisch.** Kein Zeitstempel des Aufrufs geht in ein Ergebnis ein. „Aktuell“ ist über
 * Dateizeitstempel des Bestands definiert (Testergebnis gegen Quellcode), nicht über die Uhr; ein
 * zweiter Lauf liefert dieselbe Ausgabe, Byte für Byte.
 *
 * **Was hier bewusst fehlt.** Der Stand kennt weder einen Bestand (das Manifest ist leer) noch eine
 * Stichtagsstrategie mit beziffertem Aufwand (die steht erst nach dem Vollabzug fest). Beides ließe
 * sich nur als Prüfung inszenieren, die immer grün ist – solche Prüfungen gibt es hier nicht.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { readJsonFile } from '@landesrecht/importer-recht-nrw/common/atomic.ts';
import { RechtNrwFetchError } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import type { TransformContext } from '@landesrecht/importer-common/pipeline.ts';

import { AUDIT_DIR, IMPORT_DATA_DIR, type SourceArea } from '../common/constants.ts';
import { createBayernRechtFetcher } from '../common/fetcher.ts';
import { readManifest, type ImportManifest } from '../common/manifest.ts';
import { assertJurisdictionSlug } from '../common/slug-registry.ts';
import { CORPUS_PATH, CORPUS_SOURCE_DIR, type CorpusFile } from '../corpus/run.ts';
import { checkEnumerationFixpoint, readEnumeration, type EnumerationFile } from '../enumerate/enumeration.ts';
import { GAP_DATA_PATH, type GapReport } from '../enumerate/gap.ts';
import { parseFortfuehrungsnachweis } from '../enumerate/fortfuehrungsnachweis.ts';
import { readFacetInventory } from '../enumerate/inventory.ts';
import { AREA_NORM_TYPES, fortfuehrungsnachweisUrl } from '../enumerate/portal.ts';
import { parseBayernRechtPackage } from '../parse/index.ts';
import { auditRecord } from '../transform/audit-record.ts';
import { TRANSFORMER_VERSION } from '../transform/rules.ts';
import { transformToBayWue } from '../transform/transform.ts';
import {
  accessCheck,
  commandsCheck,
  corpusCheck,
  enumerationCheck,
  enumerationGapCheck,
  ENUMERABLE_AREAS,
  fixpointCheck,
  fullPathCheck,
  JUNIT_PATH,
  LEGAL_SCOPE_DOC,
  localOnlyCheck,
  manifestR2Objects,
  parseJUnit,
  readinessDocCheck,
  READINESS_DOC,
  ROBOTS_PATH,
  scopeDecisionCheck,
  secretScanCheck,
  SECRET_PATTERNS,
  SECRET_SCAN_ALLOWED,
  SOURCE_DISCOVERY_DOC,
  summarize,
  testsCheck,
  transformerCheck,
  WRANGLER_PATH,
  type EnumerationFixpointCheckResult,
  type FullPathReport,
  type JUnitReport,
  type ReadinessCheck,
  type ReadinessResult,
  type RobotsRecord,
  type TestFreshness,
} from './checks.ts';

export type { ReadinessCheck, ReadinessResult } from './checks.ts';

/** Projektionszustand eines Remote-Apply-Laufs (aus `scripts/d1-apply-batches.ts`). */
export const REMOTE_PROJECTION_STATE = 'data/runtime/projection-state-baywue.remote.json';
/** Protokoll eines Remote-Apply-Laufs; die lokale Variante (`apply-state.local.json`) zählt nicht. */
export const REMOTE_APPLY_STATE = 'data/runtime/d1-batches/landesrecht-baywue/apply-state.json';
/** Auditberichte, die es nur nach einem R2- oder Remote-D1-Lauf gibt. */
export const REMOTE_AUDIT_DIRS = [`${AUDIT_DIR}/r2`, `${AUDIT_DIR}/d1`] as const;

/* ------------------------------------------------------------------------------------------ */
/* Dateizugriffe                                                                               */

async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Dateien eines Verzeichnisbaums, relativ zum Root, in deterministischer Reihenfolge. */
async function listFiles(root: string, relative: string, accept: (name: string) => boolean): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && accept(entry.name)) files.push(path);
    }
  };
  await walk(relative);
  return files;
}

/** Jüngste Änderung an Quellcode oder Tests; `undefined`, wenn nichts gefunden wurde. */
async function newestSource(root: string): Promise<{ mtimeMs: number; path?: string }> {
  let newest = 0;
  let newestPath: string | undefined;
  const ignore = /node_modules|\.astro|dist|\.wrangler/u;
  const walk = async (directory: string): Promise<void> => {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (ignore.test(path)) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(?:ts|mjs|json|astro)$/u.test(entry.name)) {
        const { mtimeMs } = await stat(join(root, path));
        if (mtimeMs > newest) {
          newest = mtimeMs;
          newestPath = path;
        }
      }
    }
  };
  for (const directory of ['packages', 'tests', 'scripts']) await walk(directory);
  return newestPath === undefined ? { mtimeMs: newest } : { mtimeMs: newest, path: newestPath };
}

/* ------------------------------------------------------------------------------------------ */
/* Enumerations-Fixpunkt (Rebuild aus dem Abrufcache, ohne Netz)                                */

export interface EnumerationFixpointOptions {
  cacheDir?: string;
  manifest?: ImportManifest;
}

export type EnumerationFixpointRunner = (root: string, area: SourceArea, file: EnumerationFile, options?: EnumerationFixpointOptions) => Promise<EnumerationFixpointCheckResult>;

/**
 * Standardprüfung: Fortführungsnachweis aus dem Abrufcache (Offline-Fetcher, jeder Netzabruf wäre ein
 * Fehler), Facettenbestand aus `data/audits/bayernrecht/facet-inventory.json`, Manifest lokal – und
 * damit derselbe Rebuild, den `enumerate` fährt. Fehlt eine Eingabe in dieser Arbeitskopie, ist die
 * Prüfung `unavailable` (Hinweis): Der Bestand ist deswegen nicht schlechter, er ist hier nur nicht
 * nachrechenbar.
 */
export const defaultEnumerationFixpoint: EnumerationFixpointRunner = async (root, area, file, options = {}) => {
  const base = { area, storedFingerprint: file.contentFingerprint, differences: [] as string[] };
  const inventory = await readFacetInventory(root);
  if (!inventory) return { ...base, status: 'unavailable', detail: `Facetten-Bestandsaufnahme fehlt (${AUDIT_DIR}/facet-inventory.json); Fixpunkt erst nach npm run import:bayernrecht:enumerate -- --area ${area} --write nachrechenbar` };
  const fetcher = createBayernRechtFetcher({ root, offline: true, ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}) });
  const url = fortfuehrungsnachweisUrl(area);
  let page;
  try {
    page = await fetcher.fetch(url);
  } catch (error) {
    if (error instanceof RechtNrwFetchError) return { ...base, status: 'unavailable', detail: `Fortführungsnachweis nicht im Abrufcache (${error.message}); Fixpunkt erst nach npm run import:bayernrecht:enumerate -- --area ${area} nachrechenbar` };
    throw error;
  }
  const document = parseFortfuehrungsnachweis(new TextDecoder('utf-8').decode(page.bytes));
  const normTypes = AREA_NORM_TYPES[area];
  const relevant = inventory.types.filter((type) => (normTypes as readonly string[]).includes(type.normType));
  const manifest = options.manifest ?? (await readManifest(root));
  const result = checkEnumerationFixpoint(file, {
    area,
    fortfuehrungsnachweis: { document, url: page.url, sha256: page.sha256, retrievedAt: page.retrievedAt, byteLength: page.bytes.byteLength },
    facets: {
      documents: inventory.documents,
      total: relevant.reduce((sum, type) => sum + type.total, 0),
      pages: relevant.reduce((sum, type) => sum + type.pages, 0),
      complete: inventory.complete,
      inventoryPath: `${AUDIT_DIR}/facet-inventory.json`,
      inventoryFingerprint: inventory.contentFingerprint,
    },
    manifest,
    baselineDate: file.baselineDate,
  });
  if (result.fixpoint) {
    return { ...base, status: 'fixpoint', rebuiltFingerprint: result.rebuiltFingerprint, detail: `Rebuild aus denselben Eingaben fachlich unverändert (${fetcher.stats.cacheHits} Cachetreffer, 0 Netzabrufe); Fingerabdruck ${result.fingerprint.slice(0, 12)}…` };
  }
  return {
    ...base,
    status: 'changed',
    rebuiltFingerprint: result.rebuiltFingerprint,
    differences: result.differences,
    detail: `Rebuild weicht ab: ${result.differences.length} Unterschied(e) (${result.differences.slice(0, 5).join('; ')}${result.differences.length > 5 ? '; …' : ''}); npm run import:bayernrecht:enumerate -- --area ${area} --offline --write`,
  };
};

/* ------------------------------------------------------------------------------------------ */
/* Ganzer Weg: Rohpaket → Parser → Überleitung → validateNormRecord                             */

/**
 * Führt jede Norm des Beispielkorpus über alle Bausteine. Das ist die Naht, an der Parser und
 * Transformation aufeinandertreffen – Einzeltests je Baustein sehen dort nichts.
 *
 * Deterministisch: Die Eingaben (Adresse, SHA-256, Abrufzeit, Content-Type) kommen aus `corpus.json`,
 * nicht aus der Uhr; die Slugvergabe entspricht der Reihenfolge des Korpus.
 */
export async function runFullPath(root: string, corpus: CorpusFile | undefined): Promise<FullPathReport> {
  const report: FullPathReport = { total: corpus?.entries.length ?? 0, checked: 0, missing: [], problems: [] };
  if (!corpus) return report;
  const used = new Set<string>();
  const context = (): TransformContext => ({
    targetJurisdiction: 'baywue',
    baselineDate: corpus.baselineDate,
    reserveSlug: (candidate: string) => {
      let slug = candidate;
      let next = 2;
      while (used.has(slug)) slug = `${candidate}-${next++}`;
      used.add(slug);
      return slug;
    },
  });
  for (const entry of corpus.entries) {
    const packagePath = join(root, CORPUS_SOURCE_DIR, entry.documentId, `${entry.documentId}.zip`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(packagePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        report.missing.push(entry.documentId);
        continue;
      }
      throw error;
    }
    report.checked += 1;
    try {
      // Meldemodus: Eine unbekannte Struktur soll benannt werden, nicht den Lauf abbrechen –
      // gemeldet wird sie gleichwohl, als Fehlerbefund des Parsers.
      const document = parseBayernRechtPackage({ portal: 'bayernrecht', url: entry.package.url, retrievedAt: entry.package.retrievedAt, mediaType: entry.package.contentType, sha256: entry.package.sha256 }, bytes, { unknown: 'report' });
      const parseErrors = document.law.findings.filter((finding) => finding.severity === 'error');
      if (parseErrors.length > 0) report.problems.push(`${entry.documentId}: Parser ${parseErrors.map((finding) => finding.code).join(', ')}`);
      // validateNormRecord läuft in transformToBayWue; ein Verstoß wirft und landet unten im catch.
      const { record, report: transformation, findings } = transformToBayWue(document.law, context());
      if (!transformation.postTransformAudit.ok) report.problems.push(`${entry.documentId}: Prüfung nach der Überleitung nicht bestanden (${transformation.postTransformAudit.doubledNames.join(', ') || 'ohne Einzelbefund'})`);
      const errors = [...findings, ...auditRecord(record)].filter((finding) => finding.severity === 'error');
      if (errors.length > 0) report.problems.push(`${entry.documentId}: ${errors.map((finding) => finding.code).join(', ')}`);
      assertJurisdictionSlug(record.meta.slug, `Slug von ${entry.documentId}`);
    } catch (error) {
      report.problems.push(`${entry.documentId}: ABBRUCH ${(error as Error).message.slice(0, 160)}`);
    }
  }
  report.missing.sort();
  report.problems.sort();
  return report;
}

/* ------------------------------------------------------------------------------------------ */
/* Statischer Secret-Scan über die Dateien dieses Adapters                                      */

/** Textdateien, die der Scan liest; Exportpakete (ZIP) und Bilder bleiben außen vor. */
const SCANNED_EXTENSION = /\.(?:json|md|txt|ts|xml|csv|ya?ml)$/u;
const SCAN_SIZE_LIMIT = 4 * 1024 * 1024;

export interface SecretScanResult {
  files: number;
  findings: string[];
}

/**
 * Scannt die Zustands-, Audit- und Quelldateien des Adapters – auch die noch nicht versionierten, die
 * der repoweite Scan der Testsuite (nur `git ls-files`) nicht sieht. Gemeldet werden Pfad und Art,
 * nie der gefundene Wert.
 */
export async function scanForSecrets(root: string): Promise<SecretScanResult> {
  const directories = [IMPORT_DATA_DIR, AUDIT_DIR, CORPUS_SOURCE_DIR, 'packages/importers/bayernrecht/src'];
  const findings: string[] = [];
  let files = 0;
  for (const directory of directories) {
    for (const file of await listFiles(root, directory, (name) => SCANNED_EXTENSION.test(name))) {
      const info = await stat(join(root, file));
      if (info.size > SCAN_SIZE_LIMIT) continue;
      files += 1;
      const lines = (await readFile(join(root, file), 'utf8')).split('\n');
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (lines.some((line) => pattern.test(line) && !SECRET_SCAN_ALLOWED.test(line))) findings.push(`${file}: ${label}`);
      }
    }
  }
  return { files, findings: findings.sort() };
}

/* ------------------------------------------------------------------------------------------ */
/* BayWü bleibt lokal: Belege ausschließlich aus lokalen Dateien                                */

/**
 * Alle `database_id`-Werte des Bindings `landesrecht-baywue` aus `apps/web/wrangler.jsonc` – die
 * Hauptkonfiguration und jedes Environment. Die Zuordnung kommt aus dem Datenbanknamen selbst
 * (`landesrecht-baywue-staging` → `staging`); die Datei wird zeilenweise gelesen, weil sie Kommentare
 * führt und damit kein gültiges JSON ist.
 */
export function baywueDatabaseIds(wrangler: string | undefined): Array<{ environment: string; databaseId: string }> {
  if (wrangler === undefined) return [];
  const found: Array<{ environment: string; databaseId: string }> = [];
  for (const line of wrangler.split('\n')) {
    const match = /"database_name"\s*:\s*"landesrecht-baywue(-[a-z]+)?"\s*,\s*"database_id"\s*:\s*"([^"]+)"/u.exec(line);
    if (match) found.push({ environment: match[1] ? match[1].slice(1) : 'default', databaseId: match[2]! });
  }
  return found;
}

/** Lokale Spuren eines Remote-Laufs für BayWü (Projektionszustand, Apply-Protokoll, R2-/D1-Audits). */
export async function remoteStateTraces(root: string): Promise<string[]> {
  const traces: string[] = [];
  for (const path of [REMOTE_PROJECTION_STATE, REMOTE_APPLY_STATE]) if (await exists(join(root, path))) traces.push(path);
  for (const directory of REMOTE_AUDIT_DIRS) {
    const files = await listFiles(root, directory, () => true);
    if (files.length > 0) traces.push(`${directory} (${files.length} Datei(en))`);
  }
  return traces.sort();
}

/* ------------------------------------------------------------------------------------------ */
/* Gesamtprüfung                                                                               */

export interface ReadinessOptions {
  /** Befehlsliste der CLI (`IMPLEMENTED_COMMANDS`); ohne sie prüft `commandsCheck` nur package.json. */
  implementedCommands?: readonly string[];
  /** Fixpunktprüfung; Standard ist der Offline-Rebuild aus dem Abrufcache. */
  checkEnumerationFixpoint?: EnumerationFixpointRunner;
  /** Abrufcache abweichend vom Standard `.cache/bayernrecht` (Tests). */
  cacheDir?: string;
  /** Den ganzen Weg über den Beispielkorpus überspringen (Tests; im Betrieb nie gesetzt). */
  skipFullPath?: boolean;
}

export async function evaluateReadiness(root: string, options: ReadinessOptions = {}): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];

  // 1. Zugriffslage: robots.txt-Rohbefund und Einordnung im Erkundungsdokument.
  checks.push(accessCheck(await readJsonFile<RobotsRecord>(join(root, ROBOTS_PATH)), await readTextIfExists(join(root, SOURCE_DISCOVERY_DOC))));

  // 2. Enumeration je Bereich: vorhanden, abgeglichen, mit stimmigem Fingerabdruck – und konvergiert.
  const manifest = await readManifest(root);
  const fixpoint = options.checkEnumerationFixpoint ?? defaultEnumerationFixpoint;
  for (const area of ENUMERABLE_AREAS) {
    let file: EnumerationFile | undefined;
    try {
      file = await readEnumeration(root, area);
    } catch (error) {
      checks.push({ id: `enumeration-${area}`, label: `Enumeration ${area} vorhanden und abgeglichen`, status: 'fail', detail: (error as Error).message });
      continue;
    }
    checks.push(enumerationCheck(area, file));
    if (file) {
      const fixpointOptions: EnumerationFixpointOptions = { manifest };
      if (options.cacheDir) fixpointOptions.cacheDir = options.cacheDir;
      checks.push(fixpointCheck(await fixpoint(root, area, file, fixpointOptions)));
    }
  }

  // 3. Abdeckungslücke zwischen Portalfacette und Fortführungsnachweis.
  checks.push(enumerationGapCheck(await readJsonFile<GapReport>(join(root, GAP_DATA_PATH))));

  // 4.–5. Beispielkorpus und der ganze Weg über alle Bausteine.
  const corpus = await readJsonFile<CorpusFile>(join(root, CORPUS_PATH));
  checks.push(corpusCheck(corpus));
  if (options.skipFullPath !== true) checks.push(fullPathCheck(await runFullPath(root, corpus)));

  // 6. Scope: nur die Frage, ob die redaktionelle Entscheidung getroffen wurde.
  checks.push(scopeDecisionCheck(await readTextIfExists(join(root, LEGAL_SCOPE_DOC))));

  // 7.–9. Überleitung, Testsuite, Zugangsdaten.
  const junitText = await readTextIfExists(join(root, JUNIT_PATH));
  const junit: JUnitReport | undefined = junitText === undefined ? undefined : parseJUnit(junitText);
  checks.push(transformerCheck(TRANSFORMER_VERSION, junit));
  let freshness: TestFreshness | undefined;
  if (junitText !== undefined) {
    const source = await newestSource(root);
    freshness = { junitMtimeMs: (await stat(join(root, JUNIT_PATH))).mtimeMs, newestSourceMtimeMs: source.mtimeMs, ...(source.path ? { newestSourcePath: source.path } : {}) };
  }
  checks.push(testsCheck(junit, freshness));
  const secrets = await scanForSecrets(root);
  checks.push(secretScanCheck(secrets.findings, secrets.files, junit));

  // 10. Umgekehrte Prüfung: BayWü bleibt lokal (nur lokale Dateien, kein Cloudflare-Aufruf).
  checks.push(
    localOnlyCheck({
      databaseIds: baywueDatabaseIds(await readTextIfExists(join(root, WRANGLER_PATH))),
      r2Objects: manifestR2Objects(manifest),
      remoteState: await remoteStateTraces(root),
    }),
  );

  // 11.–12. Bereitschaftsdokument und registrierte Befehle.
  checks.push(readinessDocCheck(await readTextIfExists(join(root, READINESS_DOC))));
  const packageJson = await readJsonFile<{ scripts?: Record<string, string> }>(join(root, 'package.json'));
  checks.push(commandsCheck(packageJson?.scripts, options.implementedCommands));

  return summarize(checks);
}

/** Zeilenweise Ausgabe wie im West-Adapter: erst READY/NOT READY, dann jede Prüfung, dann die Blocker. */
export function renderReadiness(result: ReadinessResult): string[] {
  const lines = [result.ready ? 'READY' : 'NOT READY'];
  for (const check of result.checks) lines.push(`  [${check.status === 'pass' ? 'ok' : check.status === 'notice' ? 'Hinweis' : 'BLOCKER'}] ${check.label}: ${check.detail}`);
  if (result.blockers.length > 0) {
    lines.push('Systemische Blocker:');
    for (const blocker of result.blockers) lines.push(`  - ${blocker}`);
  }
  return lines;
}
